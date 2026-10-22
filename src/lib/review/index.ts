import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { UNVERIFIED_MESSAGE, isVerified } from "@/lib/auth/verified";
import { applyEvaluation } from "@/lib/progression";
import { InvalidEvaluationError, computeResult } from "@/lib/assessment/scoring";

export type ReviewErrorCode =
  | "not_found" | "forbidden" | "not_appealable" | "already_appealed" | "reason_required"
  | "resolution_required" | "not_open" | "own_submission" | "invalid_scores" | "cannot_revoke_pass" | "comment_required" | "not_assessable" | "unverified";
export class ReviewError extends Error {
  constructor(public code: ReviewErrorCode, message?: string) {
    super(message ?? code);
  }
}

const isReviewer = (role: Role) => role === "REVIEWER" || role === "ADMIN";

/**
 * A learner asks for a person to look at a failed result. Allowed once per evaluation, only on the latest,
 * AI-produced, failed evaluation. While an appeal is open the submission is held in IN_HUMAN_REVIEW so the
 * learner cannot race a new attempt against it.
 */
export async function createAppeal(userId: string, evaluationId: string, reason: string) {
  if (!(await isVerified(userId))) throw new ReviewError("unverified", UNVERIFIED_MESSAGE);
  const text = reason.trim();
  if (text.length < 20) throw new ReviewError("reason_required", "Please explain what you think was missed (at least a sentence).");
  const ev = await db.evaluation.findUnique({ where: { id: evaluationId }, include: { submission: true } });
  if (!ev || ev.submission.userId !== userId) throw new ReviewError("not_found");
  const latest = await db.evaluation.findFirst({ where: { submissionId: ev.submissionId }, orderBy: { createdAt: "desc" } });
  if (latest?.id !== ev.id || ev.status !== "complete" || ev.passed !== false || ev.humanReviewed || ev.submission.status !== "EVALUATED") {
    throw new ReviewError("not_appealable");
  }
  return db.$transaction(async (tx) => {
    const exists = await tx.appeal.findUnique({ where: { evaluationId } });
    if (exists) throw new ReviewError("already_appealed");
    const appeal = await tx.appeal.create({ data: { evaluationId, userId, reason: text.slice(0, 2000) } });
    await tx.submission.update({ where: { id: ev.submissionId }, data: { status: "IN_HUMAN_REVIEW" } });
    await tx.auditEvent.create({ data: { actorId: userId, action: "appeal.created", subject: `appeal:${appeal.id}`, detail: { evaluationId } } });
    return appeal;
  });
}

export async function listOpenAppeals(reviewer: { role: Role }) {
  if (!isReviewer(reviewer.role)) throw new ReviewError("forbidden");
  const rows = await db.appeal.findMany({
    where: { status: "OPEN" }, orderBy: { createdAt: "asc" },
    include: { evaluation: { include: { submission: { include: { assignment: true } } } } },
  });
  // Learner identity is deliberately not shown to reviewers.
  return rows.map((a) => ({
    id: a.id, createdAt: a.createdAt, assignment: a.evaluation.submission.assignment.title,
    attempt: a.evaluation.submission.attempt, score: a.evaluation.overallScore, reason: a.reason,
    flagged: a.evaluation.reviewFlag,
  }));
}

export async function getAppealForReview(reviewer: { id: string; role: Role }, appealId: string) {
  if (!isReviewer(reviewer.role)) throw new ReviewError("forbidden");
  const a = await db.appeal.findUnique({
    where: { id: appealId },
    include: {
      evaluation: {
        include: {
          scores: { include: { criterion: true } },
          submission: { include: { assignment: { include: { rubricVersion: true } } } },
        },
      },
    },
  });
  if (!a) throw new ReviewError("not_found");
  if (a.evaluation.submission.userId === reviewer.id) throw new ReviewError("own_submission");
  return a;
}

export type Resolution =
  | { decision: "uphold"; note: string }
  | { decision: "override"; note: string; scores: { criterionId: string; score: number; comment?: string }[] };

/**
 * A reviewer confirms the original result or replaces the criterion scores. An override creates a NEW
 * human evaluation (history is never edited), computed by the same computeResult as the AI path, and goes
 * through the same applyEvaluation. Everything is audited.
 */
export async function resolveAppeal(reviewer: { id: string; role: Role }, appealId: string, res: Resolution) {
  if (!isReviewer(reviewer.role)) throw new ReviewError("forbidden");
  const note = res.note.trim();
  if (note.length < 10) throw new ReviewError("resolution_required", "Give a written reason for the decision.");

  const appeal = await getAppealForReview(reviewer, appealId);
  if (appeal.status !== "OPEN") throw new ReviewError("not_open");
  const ev = appeal.evaluation;
  const sub = ev.submission;
  const rv = await db.rubricVersion.findUniqueOrThrow({ where: { id: ev.rubricVersionId }, include: { criteria: true } });

  return db.$transaction(async (tx) => {
    // Atomic claim: only one reviewer can resolve an appeal.
    const claim = await tx.appeal.updateMany({ where: { id: appealId, status: "OPEN" }, data: { status: res.decision === "uphold" ? "UPHELD" : "OVERRIDDEN" } });
    if (claim.count === 0) throw new ReviewError("not_open");

    let newEvaluationId: string | null = null;
    if (res.decision === "override") {
      const byId = new Map(rv.criteria.map((c) => [c.id, c]));
      const results = res.scores.map((s) => ({ criterionId: byId.get(s.criterionId)?.key ?? s.criterionId, score: s.score }));
      let result;
      try {
        result = computeResult({ threshold: rv.threshold, criteria: rv.criteria }, results);
      } catch (e) {
        if (e instanceof InvalidEvaluationError) throw new ReviewError("invalid_scores", e.message);
        throw e;
      }
      const old = new Map(ev.scores.map((s) => [s.criterionId, s]));
      for (const s of res.scores) {
        if (old.get(s.criterionId)?.score !== s.score && !(s.comment ?? "").trim()) {
          throw new ReviewError("comment_required", "Explain each score you change.");
        }
      }
      const alreadyPassed = await tx.progress.findUnique({ where: { userId_nodeType_nodeId: { userId: sub.userId, nodeType: "ASSIGNMENT", nodeId: sub.assignmentId } } });
      if (alreadyPassed?.state === "COMPLETED" && !result.passed) throw new ReviewError("cannot_revoke_pass");

      const prev = (ev.feedback ?? {}) as Record<string, unknown>;
      const created = await tx.evaluation.create({
        data: {
          submissionId: sub.id, rubricVersionId: rv.id, provider: "human", model: null, status: "complete",
          overallScore: result.score, passed: result.passed, confidence: "high", reviewFlag: false, humanReviewed: true,
          supersedesId: ev.id, deterministicChecks: ev.deterministicChecks as Prisma.InputJsonValue,
          feedback: {
            ...prev, reasons: result.reasons, failedMandatory: result.failedMandatory, reviewerNote: note,
          } as Prisma.InputJsonValue,
          scores: {
            create: res.scores.map((s) => {
              const o = old.get(s.criterionId);
              const changed = o?.score !== s.score;
              return {
                criterionId: s.criterionId, score: s.score, evidence: o?.evidence ?? "",
                explanation: changed ? `Reviewer: ${s.comment!.trim()}` : o?.explanation ?? "", improvement: o?.improvement ?? "",
              };
            }),
          },
        },
      });
      newEvaluationId = created.id;
      await applyEvaluation(tx, created.id);
    }

    await tx.appeal.update({ where: { id: appealId }, data: { reviewerId: reviewer.id, resolution: note, resolvedAt: new Date() } });
    await tx.submission.update({ where: { id: sub.id }, data: { status: "EVALUATED" } });
    await tx.auditEvent.create({
      data: { actorId: reviewer.id, action: "appeal.resolved", subject: `appeal:${appealId}`, detail: { decision: res.decision, newEvaluationId, previousEvaluationId: ev.id } },
    });
    return { decision: res.decision, newEvaluationId };
  });
}
