import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { slotOf, type StoredFile } from "@/lib/submissions/access";
import { applyEvaluation } from "@/lib/progression";
import { runChecks, type Deliverable } from "./checks";
import { classifyError, type ProviderErrorKind } from "./errors";
import {
  ProviderNotConfiguredError, ProviderOutputError, ProviderRefusedError, getProvider,
  type EvaluationInput, type EvaluationProvider, type ProviderOutput,
} from "./provider";
import { InvalidEvaluationError, computeResult } from "./scoring";
import { modelOutput, type ModelOutput } from "./schema";

export type EvaluateOutcome =
  | { state: "evaluated"; evaluationId: string; score: number; passed: boolean }
  | { state: "needs_evidence"; evaluationId: string }
  | { state: "failed"; reason: "provider_refused" | "provider_error" | "invalid_output"; kind?: ProviderErrorKind }
  /** Nothing was recorded and nothing was scored: the claim was released so the job can try again later. */
  | { state: "deferred"; kind: ProviderErrorKind }
  | { state: "not_configured" }
  | { state: "rate_limited" }
  | { state: "busy" };

const json = (v: unknown) => (v === undefined ? undefined : (v as Prisma.InputJsonValue));
const maxPerHour = () => Number(process.env.EVAL_MAX_PER_HOUR ?? 10);

/**
 * Evaluate one submission. Safe to call concurrently: only one caller wins the atomic claim and the rest
 * get `busy`. The model supplies criterion scores and feedback only; the server computes the result from
 * the published rubric version and is the only thing that can move progression (via applyEvaluation).
 */
export async function evaluateSubmission(
  submissionId: string,
  /**
   * `finalAttempt` (default true, which is what a synchronous caller wants): a retryable provider failure is
   * recorded as a failed evaluation. The job runner passes false until its last attempt, so transient failures
   * are deferred instead and leave no trace. Failures that pause the queue (billing, auth) are always deferred.
   */
  deps: { provider?: EvaluationProvider; finalAttempt?: boolean } = {},
): Promise<EvaluateOutcome> {
  const sub = await db.submission.findUnique({
    where: { id: submissionId },
    include: { assignment: { include: { rubricVersion: { include: { criteria: { orderBy: { key: "asc" } } } } } } },
  });
  if (!sub) return { state: "failed", reason: "provider_error" };

  const since = new Date(Date.now() - 60 * 60 * 1000);
  // Deferred starts (nothing reached the model) do not count against the learner's hourly allowance.
  const [started, deferred] = await Promise.all([
    db.auditEvent.count({ where: { actorId: sub.userId, action: "evaluation.started", createdAt: { gte: since } } }),
    db.auditEvent.count({ where: { actorId: sub.userId, action: "evaluation.deferred", createdAt: { gte: since } } }),
  ]);
  if (started - deferred >= maxPerHour()) return { state: "rate_limited" };

  const claim = await db.submission.updateMany({
    where: { id: submissionId, status: { in: ["SUBMITTED", "FAILED_TO_EVALUATE"] } },
    data: { status: "EVALUATING" },
  });
  if (claim.count === 0) return { state: "busy" };
  await db.auditEvent.create({ data: { actorId: sub.userId, action: "evaluation.started", subject: `submission:${sub.id}`, detail: {} } });

  const setStatus = (status: "SUBMITTED" | "NEEDS_EVIDENCE" | "FAILED_TO_EVALUATE") =>
    db.submission.update({ where: { id: sub.id }, data: { status } });

  const files = sub.files as StoredFile[];
  const brief = sub.assignment.brief as { requirements: string[]; constraints: string[]; deliverables: Deliverable[] };
  const checks = runChecks(files, sub.rationale ?? "", brief.deliverables);
  const rv = sub.assignment.rubricVersion;

  // 1. Nothing is sent to a model if required evidence is missing.
  if (checks.missingEvidence.length > 0) {
    const ev = await db.evaluation.create({
      data: {
        submissionId: sub.id, rubricVersionId: rv.id, provider: "deterministic-checks", status: "needs_evidence",
        missingEvidence: checks.missingEvidence, feedback: {}, deterministicChecks: json(checks)!,
      },
    });
    await setStatus("NEEDS_EVIDENCE");
    return { state: "needs_evidence", evaluationId: ev.id };
  }

  const provider = deps.provider ?? (await getProvider());
  const storage = getStorage();
  const position = (f: StoredFile) => {
    const i = brief.deliverables.findIndex((d) => d.key === slotOf(f));
    return i < 0 ? 99 : i;
  };
  const images = await Promise.all(
    [...files].sort((a, b) => position(a) - position(b)).map(async (f) => ({
      slot: slotOf(f), label: brief.deliverables.find((d) => d.key === slotOf(f))?.label ?? slotOf(f), role: f.role, name: f.name, width: f.width, height: f.height, mime: f.mime, data: await storage.get(f.key),
    })),
  );
  const input: EvaluationInput = {
    assignment: { title: sub.assignment.title, objective: sub.assignment.objective, scenario: sub.assignment.scenario, requirements: brief.requirements, constraints: brief.constraints },
    rubric: {
      title: sub.assignment.title, threshold: rv.threshold,
      criteria: rv.criteria.map((c) => ({ key: c.key, title: c.title, description: c.description, weight: c.weight, mandatory: c.mandatory, minScore: c.minScore })),
    },
    images, rationale: sub.rationale ?? "", changesNote: sub.changesNote, checks,
  };

  // 2. Ask the provider; one retry, with the validation problem, if the output is unusable.
  let hint: string | undefined;
  let last: ProviderOutput | undefined;
  let parsed: ModelOutput | undefined;
  let failure: "provider_refused" | "provider_error" | "invalid_output" = "invalid_output";
  let failureKind: ProviderErrorKind | undefined;

  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    let out: ProviderOutput;
    try {
      out = await provider.evaluate({ ...input, retryHint: hint });
    } catch (e) {
      if (e instanceof ProviderNotConfiguredError) {
        await setStatus("SUBMITTED"); // nothing happened; the learner can submit again once it is configured
        return { state: "not_configured" };
      }
      if (e instanceof ProviderRefusedError) { failure = "provider_refused"; break; }
      if (e instanceof ProviderOutputError) { hint = e.message; failure = "invalid_output"; continue; }
      const pe = classifyError(e);
      failureKind = pe.kind;
      // Billing and auth problems pause the queue; transient ones wait for the job's next attempt. Either way the
      // work is untouched: release the claim, record nothing, score nothing.
      if (pe.policy.pauses || (pe.policy.retryable && deps.finalAttempt === false)) {
        await setStatus("SUBMITTED");
        await db.auditEvent.create({ data: { actorId: sub.userId, action: "evaluation.deferred", subject: `submission:${sub.id}`, detail: { kind: pe.kind } } });
        return { state: "deferred", kind: pe.kind };
      }
      failure = pe.policy.needsHuman && pe.kind !== "output_invalid" ? "provider_refused" : "provider_error";
      hint = pe.message;
      break;
    }
    last = out;
    const res = modelOutput.safeParse(out.raw);
    if (!res.success) {
      hint = res.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "output"}: ${i.message}`).join("; ");
      failure = "invalid_output";
      continue;
    }
    if (res.data.status === "complete") {
      try {
        computeResult({ threshold: rv.threshold, criteria: rv.criteria }, res.data.criteria, res.data.criticalFailures);
      } catch (e) {
        if (e instanceof InvalidEvaluationError) { hint = e.message; failure = "invalid_output"; continue; }
        throw e;
      }
    }
    parsed = res.data;
  }

  const base = { submissionId: sub.id, rubricVersionId: rv.id, provider: provider.name, model: last?.model, deterministicChecks: json(checks)!, inputTokens: last?.inputTokens, outputTokens: last?.outputTokens };

  // 3. No usable output: record the evidence, never a score.
  if (!parsed) {
    await db.evaluation.create({
      data: { ...base, status: "failed", feedback: { reason: failure, kind: failureKind ?? null, hint: hint ?? null }, rawOutput: json(last?.raw), reviewFlag: failure === "provider_refused" },
    });
    await setStatus("FAILED_TO_EVALUATE");
    return { state: "failed", reason: failure, kind: failureKind };
  }

  if (parsed.status === "needs_evidence") {
    const ev = await db.evaluation.create({
      data: { ...base, status: "needs_evidence", missingEvidence: parsed.missingEvidence, feedback: {}, rawOutput: json(last?.raw), confidence: parsed.confidence },
    });
    await setStatus("NEEDS_EVIDENCE");
    return { state: "needs_evidence", evaluationId: ev.id };
  }

  // 4. Compute the result on the server from the published rubric, persist, and apply progression atomically.
  const result = computeResult({ threshold: rv.threshold, criteria: rv.criteria }, parsed.criteria, parsed.criticalFailures);
  const keyToId = new Map(rv.criteria.map((c) => [c.key, c.id]));

  const evaluationId = await db.$transaction(async (tx) => {
    const ev = await tx.evaluation.create({
      data: {
        ...base, status: "complete", overallScore: result.score, passed: result.passed, confidence: parsed.confidence,
        reviewFlag: parsed.reviewFlag || parsed.confidence === "low", rawOutput: json(last?.raw),
        feedback: {
          reasons: result.reasons, failedMandatory: result.failedMandatory,
          strengths: parsed.strengths, weaknesses: parsed.weaknesses,
          missingRequirements: parsed.missingRequirements, criticalFailures: parsed.criticalFailures,
          criteria: parsed.criteria.map((c) => ({ key: c.criterionId, where: c.where, principle: c.principle, verify: c.verify })),
        },
        scores: {
          create: parsed.criteria.map((c) => ({
            criterionId: keyToId.get(c.criterionId)!, score: c.score, evidence: c.evidence, explanation: c.explanation, improvement: c.improvement,
          })),
        },
      },
    });
    await tx.submission.update({ where: { id: sub.id }, data: { status: "EVALUATED" } });
    await applyEvaluation(tx, ev.id);
    await tx.auditEvent.create({ data: { actorId: sub.userId, action: "evaluation.complete", subject: `submission:${sub.id}`, detail: { evaluationId: ev.id, score: result.score, passed: result.passed, provider: provider.name } } });
    return ev.id;
  });

  return { state: "evaluated", evaluationId, score: result.score, passed: result.passed };
}
