import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { applyEvaluation } from "@/lib/progression";
import { InvalidEvaluationError, computeResult } from "@/lib/assessment/scoring";
import { getPause } from "@/lib/jobs/flags";
import { ReviewError } from "./index";

const isReviewer = (role: Role) => role === "REVIEWER" || role === "ADMIN";
/** A person can take over work that no assessor has produced a result for. NEEDS_EVIDENCE is the learner's to fix. */
const ASSESSABLE = ["SUBMITTED", "FAILED_TO_EVALUATE"] as const;

export type FirstAssessment = { note: string; scores: { criterionId: string; score: number; comment: string }[] };

/**
 * First assessment by a person, for work the AI assessor could not or did not assess (refused, failed, stuck).
 * The same `computeResult` and `applyEvaluation` as the AI path: a person supplies criterion scores and reasons, the
 * server computes the result from the published rubric. Refused for learners, for the reviewer's own work, and when
 * any completed evaluation already exists (that is an appeal, not a first assessment).
 */
export async function humanAssess(reviewer: { id: string; role: Role }, submissionId: string, input: FirstAssessment) {
  if (!isReviewer(reviewer.role)) throw new ReviewError("forbidden");
  const note = input.note.trim();
  if (note.length < 10) throw new ReviewError("resolution_required", "Give a written note for the learner (at least a sentence).");

  const sub = await db.submission.findUnique({ where: { id: submissionId }, include: { assignment: true } });
  if (!sub) throw new ReviewError("not_found");
  if (sub.userId === reviewer.id) throw new ReviewError("own_submission");
  const rv = await db.rubricVersion.findUniqueOrThrow({ where: { id: sub.assignment.rubricVersionId }, include: { criteria: true } });

  const byId = new Map(rv.criteria.map((c) => [c.id, c]));
  const given = new Map(input.scores.map((s) => [s.criterionId, s]));
  if (given.size !== rv.criteria.length || rv.criteria.some((c) => !given.has(c.id))) throw new ReviewError("invalid_scores", "Score every criterion exactly once.");
  for (const s of input.scores) {
    if (!byId.has(s.criterionId)) throw new ReviewError("invalid_scores", "Unknown criterion.");
    if (s.comment.trim().length < 5) throw new ReviewError("comment_required", "Say what you saw for every criterion.");
  }
  let result;
  try {
    result = computeResult({ threshold: rv.threshold, criteria: rv.criteria }, input.scores.map((s) => ({ criterionId: byId.get(s.criterionId)!.key, score: s.score })));
  } catch (e) {
    if (e instanceof InvalidEvaluationError) throw new ReviewError("invalid_scores", e.message);
    throw e;
  }

  return db.$transaction(async (tx) => {
    // Atomic claim: if a worker has the submission (EVALUATING) or it was already assessed, this finds nothing to take.
    const claim = await tx.submission.updateMany({ where: { id: sub.id, status: { in: [...ASSESSABLE] } }, data: { status: "EVALUATED" } });
    if (claim.count === 0) throw new ReviewError("not_assessable", "This submission is not waiting for a first assessment.");
    if ((await tx.evaluation.count({ where: { submissionId: sub.id, status: "complete" } })) > 0) {
      throw new ReviewError("not_assessable", "This submission already has a completed assessment; use the appeal route.");
    }
    // The automated job (if any) must not also assess it later.
    await tx.evaluationJob.updateMany({ where: { submissionId: sub.id, status: "QUEUED" }, data: { status: "DONE", activeKey: null, finishedAt: new Date() } });

    const ev = await tx.evaluation.create({
      data: {
        submissionId: sub.id, rubricVersionId: rv.id, provider: "human", model: null, status: "complete",
        overallScore: result.score, passed: result.passed, confidence: "high", reviewFlag: false, humanReviewed: true,
        deterministicChecks: {} as Prisma.InputJsonValue,
        feedback: {
          reasons: result.reasons, failedMandatory: result.failedMandatory, reviewerNote: note,
          strengths: [], weaknesses: [], missingRequirements: [], criticalFailures: [], criteria: [],
        } as Prisma.InputJsonValue,
        scores: {
          create: input.scores.map((s) => ({
            criterionId: s.criterionId, score: s.score, evidence: s.comment.trim(),
            explanation: "Scored by a person reviewing this work.", improvement: "",
          })),
        },
      },
    });
    await applyEvaluation(tx, ev.id);
    await tx.auditEvent.create({
      data: { actorId: reviewer.id, action: "assessment.human_first", subject: `submission:${sub.id}`, detail: { evaluationId: ev.id, score: result.score, passed: result.passed } },
    });
    return { evaluationId: ev.id, score: result.score, passed: result.passed };
  });
}

export type AttentionKind = "no_result" | "failed_final" | "stuck" | "low_confidence";
export type AttentionItem = { submissionId: string; assignment: string; attempt: number; kind: AttentionKind; detail: string; since: Date };

/** Work that needs a person. Learner identity is deliberately not included. */
export async function listAttention(reviewer: { role: Role }, now = new Date()): Promise<AttentionItem[]> {
  if (!isReviewer(reviewer.role)) throw new ReviewError("forbidden");
  const items: AttentionItem[] = [];
  const withTitle = { include: { assignment: { select: { title: true } } } } as const;

  const failed = await db.submission.findMany({ where: { status: "FAILED_TO_EVALUATE" }, ...withTitle, orderBy: { createdAt: "asc" } });
  for (const s of failed) {
    const job = await db.evaluationJob.findFirst({ where: { submissionId: s.id }, orderBy: { createdAt: "desc" }, select: { status: true, lastErrorKind: true } });
    const queuedAgain = job && (job.status === "QUEUED" || job.status === "RUNNING");
    if (queuedAgain) continue; // the system is already retrying it
    items.push({ submissionId: s.id, assignment: s.assignment.title, attempt: s.attempt, kind: job?.status === "FAILED_FINAL" ? "failed_final" : "no_result", detail: job?.lastErrorKind ?? "no result recorded", since: s.createdAt });
  }

  // Waiting a long time while nothing is paused: something is wrong with the pipeline, not with the work.
  const paused = !!(await getPause());
  const old = new Date(now.getTime() - 60 * 60_000);
  const stuck = await db.submission.findMany({ where: { status: { in: ["SUBMITTED", "EVALUATING"] }, createdAt: { lt: old } }, ...withTitle, orderBy: { createdAt: "asc" } });
  for (const s of stuck) {
    const job = await db.evaluationJob.findUnique({ where: { activeKey: s.id }, select: { runAfter: true } });
    if (job && (paused || job.runAfter > now)) continue; // deliberately held back (pause, rate limit, backoff)
    items.push({ submissionId: s.id, assignment: s.assignment.title, attempt: s.attempt, kind: "stuck", detail: `submitted ${s.createdAt.toISOString().slice(0, 16)}Z`, since: s.createdAt });
  }

  // Low-confidence or flagged results that no one has appealed: the learner may not know to ask.
  const flagged = await db.evaluation.findMany({
    where: { status: "complete", reviewFlag: true, humanReviewed: false, appeal: null, submission: { status: "EVALUATED" } },
    include: { submission: { include: { assignment: { select: { title: true } } } } }, orderBy: { createdAt: "asc" },
  });
  for (const e of flagged) {
    const latest = await db.evaluation.findFirst({ where: { submissionId: e.submissionId }, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (latest?.id !== e.id) continue;
    items.push({ submissionId: e.submissionId, assignment: e.submission.assignment.title, attempt: e.submission.attempt, kind: "low_confidence", detail: `flagged, confidence ${e.confidence ?? "n/a"}`, since: e.createdAt });
  }
  return items;
}
