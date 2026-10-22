import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { visibleStatuses, getAssignmentAccess, type AssignmentAccess } from "@/lib/progression";
import { FAKE_PROVIDER_NAME } from "@/lib/assessment/provider";
import { canReadSubmission, type StoredFile } from "./access";

export type CriterionView = {
  key: string; title: string; weight: number; mandatory: boolean; minScore: number | null;
  score: number; evidence: string; explanation: string; improvement: string;
  where?: string; principle?: string; verify?: string; belowMinimum: boolean;
};

export type SubmissionView = {
  id: string; attempt: number; status: string; rationale: string | null; changesNote: string | null;
  isOwner: boolean;
  assignment: { id: string; title: string; maxAttempts: number };
  files: { idx: number; name: string; role: string; width: number; height: number }[];
  evaluation: null | {
    id: string; status: string; provider: string; isTestEvaluator: boolean; model: string | null;
    score: number | null; passed: boolean | null; threshold: number; confidence: string | null; reviewFlag: boolean;
    humanReviewed: boolean; reasons: string[]; strengths: string[]; weaknesses: string[];
    missingRequirements: string[]; criticalFailures: string[]; missingEvidence: string[]; failureReason: string | null;
  };
  criteria: CriterionView[];
  remediation: { lessonId: string; title: string; competency: string }[];
  appeal: null | { status: string; reason: string; resolution: string | null };
  access: AssignmentAccess | null; // for the owner: can they retry / resubmit?
};

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** Returns null when the submission does not exist OR the viewer may not read it (indistinguishable on purpose). */
export async function getSubmissionView(viewer: { id: string; role: Role }, submissionId: string): Promise<SubmissionView | null> {
  const sub = await db.submission.findUnique({
    where: { id: submissionId },
    include: {
      assignment: { include: { rubricVersion: { include: { criteria: { include: { competency: true } } } } } },
      evaluations: { orderBy: { createdAt: "desc" }, take: 1, include: { scores: true, appeal: true } },
    },
  });
  if (!sub || !canReadSubmission(viewer, sub)) return null;

  const ev = sub.evaluations[0] ?? null;
  const fb = (ev?.feedback ?? {}) as Record<string, unknown>;
  const detail = new Map(((fb.criteria as { key: string; where?: string; principle?: string; verify?: string }[]) ?? []).map((c) => [c.key, c]));
  const rv = sub.assignment.rubricVersion;

  const criteria: CriterionView[] = ev?.status === "complete"
    ? rv.criteria.map((c) => {
        const s = ev.scores.find((x) => x.criterionId === c.id);
        const d = detail.get(c.key);
        return {
          key: c.key, title: c.title, weight: c.weight, mandatory: c.mandatory, minScore: c.minScore,
          score: s?.score ?? 0, evidence: s?.evidence ?? "", explanation: s?.explanation ?? "", improvement: s?.improvement ?? "",
          where: d?.where, principle: d?.principle, verify: d?.verify,
          belowMinimum: c.mandatory && c.minScore !== null && (s?.score ?? 0) < c.minScore,
        };
      })
    : [];

  // Remediation: weak criteria (below 70, or below a mandatory minimum) -> competency -> the lessons that teach it.
  const weak = rv.criteria.filter((c) => {
    const v = criteria.find((x) => x.key === c.key);
    return !!c.competencyId && !!v && (v.score < 70 || v.belowMinimum);
  });
  const compIds = [...new Set(weak.map((c) => c.competencyId).filter((x): x is string => !!x))];
  const links = compIds.length
    ? await db.lessonCompetency.findMany({
        where: { competencyId: { in: compIds }, lesson: { status: { in: visibleStatuses() } } },
        include: { lesson: true, competency: true },
      })
    : [];
  const remediation = [...new Map(links.map((l) => [l.lesson.slug, { lessonId: l.lesson.id, title: l.lesson.title, competency: l.competency.title }])).values()];

  const isOwner = sub.userId === viewer.id;
  return {
    id: sub.id, attempt: sub.attempt, status: sub.status, rationale: sub.rationale, changesNote: sub.changesNote, isOwner,
    assignment: { id: sub.assignment.id, title: sub.assignment.title, maxAttempts: sub.assignment.maxAttempts ?? 3 },
    files: (sub.files as unknown as StoredFile[]).map((f, idx) => ({ idx, name: f.name, role: f.role, width: f.width, height: f.height })),
    evaluation: ev && {
      id: ev.id, status: ev.status, provider: ev.provider, isTestEvaluator: ev.provider === FAKE_PROVIDER_NAME, model: ev.model,
      score: ev.overallScore, passed: ev.passed, threshold: rv.threshold, confidence: ev.confidence, reviewFlag: ev.reviewFlag,
      humanReviewed: ev.humanReviewed, reasons: arr(fb.reasons), strengths: arr(fb.strengths), weaknesses: arr(fb.weaknesses),
      missingRequirements: arr(fb.missingRequirements), criticalFailures: arr(fb.criticalFailures), missingEvidence: ev.missingEvidence,
      failureReason: typeof fb.reason === "string" ? fb.reason : null,
    },
    criteria, remediation,
    appeal: ev?.appeal ? { status: ev.appeal.status, reason: ev.appeal.reason, resolution: ev.appeal.resolution } : null,
    access: isOwner ? await getAssignmentAccess(sub.userId, sub.assignmentId) : null,
  };
}
