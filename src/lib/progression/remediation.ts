import { Prisma, type LevelTier } from "@prisma/client";
import { db } from "@/lib/db";
import { MAX_RESETS, visibleStatuses, type Db } from "./common";
import { getAssignmentAccess } from "./index";

export type RemediationErrorCode = "not_found" | "not_required" | "no_open" | "checks_incomplete" | "action_plan_required";
export class RemediationError extends Error {
  constructor(public code: RemediationErrorCode, public detail?: { missing?: string[] }, message?: string) {
    super(message ?? code);
  }
}

export const MIN_ACTION_PLAN_WORDS = 15;
const WEAK_BELOW = 70;

/**
 * Lessons that teach what a completed evaluation found weak: criteria below 70 (or below a mandatory minimum)
 * that are tied to a competency, mapped to the lessons that teach it. Shared by the results page and remediation.
 */
export async function remediationLessons(client: Db, evaluationId: string) {
  const ev = await client.evaluation.findUnique({
    where: { id: evaluationId },
    include: { scores: { include: { criterion: true } }, submission: { include: { assignment: { include: { module: { include: { level: true } }, level: true } } } } },
  });
  if (!ev || ev.status !== "complete") return [];
  // A competency can be taught in more than one path. Only lessons of the learner's own path are offered.
  const asg = ev.submission.assignment;
  const pathId = asg.level?.pathId ?? asg.module?.level.pathId;
  const weak = ev.scores.filter((s) => {
    const c = s.criterion;
    const belowMin = c.mandatory && c.minScore !== null && s.score < c.minScore;
    return !!c.competencyId && (s.score < WEAK_BELOW || belowMin);
  });
  const compIds = [...new Set(weak.map((s) => s.criterion.competencyId!))];
  if (compIds.length === 0) return [];
  const links = await client.lessonCompetency.findMany({
    where: { competencyId: { in: compIds }, lesson: { status: { in: visibleStatuses() }, ...(pathId ? { module: { level: { pathId } } } : {}) } },
    include: { lesson: true, competency: true },
  });
  return [...new Map(links.sort((a, b) => b.lesson.version - a.lesson.version).map((l) => [l.lesson.slug, { lessonId: l.lesson.id, title: l.lesson.title, competency: l.competency.title }])).values()];
}

/** The learner's most recent completed evaluation for an assignment. */
async function lastEvaluation(client: Db, userId: string, assignmentId: string) {
  return client.evaluation.findFirst({
    where: { status: "complete", submission: { userId, assignmentId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function getRemediation(userId: string, assignmentId: string) {
  const assignment = await db.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment || assignment.kind !== "CAPSTONE") throw new RemediationError("not_found");
  const rows = await db.remediation.findMany({ where: { userId, assignmentId }, orderBy: { resetNumber: "asc" } });
  const open = rows.find((r) => r.status === "OPEN") ?? null;
  const completed = rows.filter((r) => r.status === "COMPLETED").length;
  const access = await getAssignmentAccess(userId, assignmentId);

  const lessonIds = open?.requiredLessonIds ?? [];
  const lessons = lessonIds.length ? await db.lesson.findMany({ where: { id: { in: lessonIds } } }) : [];
  const passedAfter = open
    ? await db.quizAttempt.findMany({ where: { userId, lessonId: { in: lessonIds }, passed: true, createdAt: { gte: open.createdAt } }, select: { lessonId: true } })
    : [];
  const done = new Set(passedAfter.map((p) => p.lessonId));
  return {
    assignment: { id: assignment.id, title: assignment.title },
    open: open && { id: open.id, resetNumber: open.resetNumber, lessons: lessons.map((l) => ({ lessonId: l.id, title: l.title, passedSince: done.has(l.id) })) },
    required: !access.allowed && access.reason === "remediation_required",
    resetsUsed: completed, maxResets: MAX_RESETS,
    attempts: !access.allowed ? { used: access.attemptsUsed ?? 0, max: access.maxAttempts ?? 0 } : { used: access.attemptsUsed, max: access.maxAttempts },
    access,
  };
}

/**
 * Open remediation. Allowed only when the capstone's attempts are used up and a reset is still available.
 * Idempotent and race-safe: (user, assignment, resetNumber) is unique, so a double click returns the same row.
 */
export async function startRemediation(userId: string, assignmentId: string) {
  const access = await getAssignmentAccess(userId, assignmentId);
  if (access.allowed || access.reason !== "remediation_required") throw new RemediationError("not_required");
  const done = await db.remediation.count({ where: { userId, assignmentId, status: "COMPLETED" } });
  const resetNumber = done + 1;
  if (resetNumber > MAX_RESETS) throw new RemediationError("not_required");

  const last = await lastEvaluation(db, userId, assignmentId);
  let lessons = last ? await remediationLessons(db, last.id) : [];
  if (lessons.length === 0) {
    // Weak criteria with no competency (e.g. consistency) have no single lesson: re-pass the level's lessons.
    const asg = await db.assignment.findUniqueOrThrow({ where: { id: assignmentId } });
    const all = await db.lesson.findMany({ where: { module: { levelId: asg.levelId!, status: { in: visibleStatuses() } }, status: { in: visibleStatuses() } }, orderBy: [{ position: "asc" }, { version: "desc" }] });
    lessons = [...new Map(all.map((l) => [l.slug, { lessonId: l.id, title: l.title, competency: "" }])).values()];
  }
  try {
    const row = await db.remediation.create({
      data: { userId, assignmentId, resetNumber, requiredLessonIds: lessons.map((l) => l.lessonId), createdFromEvaluationId: last?.id ?? "" },
    });
    await db.auditEvent.create({ data: { actorId: userId, action: "remediation.start", subject: `assignment:${assignmentId}`, detail: { resetNumber, lessons: lessons.length } } });
    return row;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return db.remediation.findUniqueOrThrow({ where: { userId_assignmentId_resetNumber: { userId, assignmentId, resetNumber } } });
    }
    throw e;
  }
}

/**
 * Complete remediation. Verified from the database: every required lesson needs a PASSING knowledge check made
 * AFTER the remediation opened (an old pass does not count), plus a written action plan. The claim is atomic,
 * so extra attempts are granted exactly once.
 */
export async function completeRemediation(userId: string, assignmentId: string, actionPlan: string) {
  const open = await db.remediation.findFirst({ where: { userId, assignmentId, status: "OPEN" } });
  if (!open) throw new RemediationError("no_open");
  const plan = actionPlan.trim();
  if (plan.split(/\s+/).filter(Boolean).length < MIN_ACTION_PLAN_WORDS) {
    throw new RemediationError("action_plan_required", undefined, `Write an action plan of at least ${MIN_ACTION_PLAN_WORDS} words: what you will change and how you will check it.`);
  }
  const lessons = await db.lesson.findMany({ where: { id: { in: open.requiredLessonIds } } });
  const passed = await db.quizAttempt.findMany({
    where: { userId, lessonId: { in: open.requiredLessonIds }, passed: true, createdAt: { gte: open.createdAt } }, select: { lessonId: true },
  });
  const ok = new Set(passed.map((p) => p.lessonId));
  const missing = lessons.filter((l) => !ok.has(l.id)).map((l) => l.title);
  if (missing.length > 0) throw new RemediationError("checks_incomplete", { missing });

  const claim = await db.remediation.updateMany({ where: { id: open.id, status: "OPEN" }, data: { status: "COMPLETED", actionPlan: plan, completedAt: new Date() } });
  if (claim.count === 1) {
    await db.auditEvent.create({ data: { actorId: userId, action: "remediation.complete", subject: `assignment:${assignmentId}`, detail: { resetNumber: open.resetNumber } } });
  }
  return { completed: true, newlyCompleted: claim.count === 1 };
}

// ───────── Skill profile

export type SkillStatus = "demonstrated" | "needs_improvement" | "not_assessed";
export type SkillRow = {
  slug: string; title: string; critical: boolean; status: SkillStatus;
  tier: LevelTier | null; latestScore: number | null; evidenceCount: number; quizEvidence: number; assessedEvidence: number; lastAt: Date | null;
};
const TIER_ORDER: LevelTier[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "PROFESSIONAL"];
const PASS = 80;

/**
 * Skill profile from assessed evidence ONLY. For each competency: the latest evidence at each tier; the
 * competency is "demonstrated" at the highest tier whose latest evidence is >= 80. Competencies with no
 * evidence are "not assessed", never defaulted to Beginner. Time on the platform is never used.
 */
export async function getSkillProfile(userId: string): Promise<SkillRow[]> {
  const [comps, evidence] = await Promise.all([
    db.competency.findMany({ orderBy: { title: "asc" } }),
    db.skillEvidence.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
  ]);
  return comps.map((c) => {
    const rows = evidence.filter((e) => e.competencyId === c.id);
    if (rows.length === 0) {
      return { slug: c.slug, title: c.title, critical: c.critical, status: "not_assessed" as const, tier: null, latestScore: null, evidenceCount: 0, quizEvidence: 0, assessedEvidence: 0, lastAt: null };
    }
    const latestPerTier = new Map(TIER_ORDER.map((t) => [t, rows.find((r) => r.tier === t)] as const));
    const best = [...TIER_ORDER].reverse().find((t) => (latestPerTier.get(t)?.score ?? -1) >= PASS) ?? null;
    return {
      slug: c.slug, title: c.title, critical: c.critical, status: best ? ("demonstrated" as const) : ("needs_improvement" as const),
      tier: best, latestScore: rows[0].score, evidenceCount: rows.length,
      quizEvidence: rows.filter((r) => r.source === "QUIZ").length, assessedEvidence: rows.filter((r) => r.source === "EVALUATION").length,
      lastAt: rows[0].createdAt,
    };
  });
}
