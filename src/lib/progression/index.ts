import type { Prisma, PublishStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { competencyScores, scoreQuiz } from "./scoring";

/**
 * The single server-side authority for lesson access and progression.
 * Pages, server actions and (later) API routes call these; the UI never decides access.
 */

/** Blocks the learner must be shown before a lesson can complete. check = passed attempt; the rest are
 *  assessed from M3 (task, reflection) or shown after assessment (feedback), so they are not gating yet. */
export const REQUIRED_KINDS = ["objective", "concept", "demo", "realWorld", "goodVsBad", "guided"];

export type StoredBlock = { kind: string; title: string; body: string };

/** Published content is always visible. Draft content is visible only when CONTENT_PREVIEW=true (dev/staging). */
export function visibleStatuses(): PublishStatus[] {
  return process.env.CONTENT_PREVIEW === "true" ? ["PUBLISHED", "IN_REVIEW", "DRAFT"] : ["PUBLISHED"];
}

export type AccessDenied = "not_found" | "not_published" | "not_enrolled" | "prerequisites";
export type LessonAccess =
  | { allowed: true; lesson: LessonRecord }
  | { allowed: false; reason: AccessDenied; missing?: string[] };

const lessonInclude = {
  module: { include: { level: true } },
  prerequisites: { include: { prerequisite: true } },
} satisfies Prisma.LessonInclude;
type LessonRecord = Prisma.LessonGetPayload<{ include: typeof lessonInclude }>;

/** Prerequisite completion is by (module, slug) so completing any version of the prerequisite counts. */
async function completedPrerequisiteSlugs(userId: string, lesson: LessonRecord) {
  const prereqs = lesson.prerequisites.map((p) => p.prerequisite);
  if (prereqs.length === 0) return { missing: [] as string[] };
  const versions = await db.lesson.findMany({
    where: { OR: prereqs.map((p) => ({ moduleId: p.moduleId, slug: p.slug })) },
    select: { id: true, slug: true, moduleId: true },
  });
  const done = await db.progress.findMany({
    where: { userId, nodeType: "LESSON", state: "COMPLETED", nodeId: { in: versions.map((v) => v.id) } },
    select: { nodeId: true },
  });
  const doneIds = new Set(done.map((d) => d.nodeId));
  const missing = prereqs
    .filter((p) => !versions.some((v) => v.slug === p.slug && v.moduleId === p.moduleId && doneIds.has(v.id)))
    .map((p) => p.title);
  return { missing };
}

export async function getLessonAccess(userId: string, lessonId: string): Promise<LessonAccess> {
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, include: lessonInclude });
  if (!lesson) return { allowed: false, reason: "not_found" };
  const visible = visibleStatuses();
  if (!visible.includes(lesson.status) || !visible.includes(lesson.module.status)) {
    return { allowed: false, reason: "not_published" };
  }
  const enrolled = await db.enrollment.findUnique({
    where: { userId_pathId: { userId, pathId: lesson.module.level.pathId } },
  });
  if (!enrolled) return { allowed: false, reason: "not_enrolled" };
  const { missing } = await completedPrerequisiteSlugs(userId, lesson);
  if (missing.length > 0) return { allowed: false, reason: "prerequisites", missing };
  return { allowed: true, lesson };
}

export class AccessError extends Error {
  constructor(public reason: AccessDenied | "out_of_order" | "no_check", public missing?: string[]) {
    super(`Access denied: ${reason}`);
  }
}

async function requireAccess(userId: string, lessonId: string) {
  const a = await getLessonAccess(userId, lessonId);
  if (!a.allowed) throw new AccessError(a.reason, a.missing);
  return a.lesson;
}

const blocksOf = (l: LessonRecord) => l.blocks as StoredBlock[];

async function viewedIndexes(userId: string, lessonId: string) {
  const rows = await db.blockView.findMany({ where: { userId, lessonId }, select: { blockIndex: true } });
  return new Set(rows.map((r) => r.blockIndex));
}

/** Blocks must be viewed in order; the server rejects skipping ahead. Idempotent. */
export async function recordBlockView(userId: string, lessonId: string, index: number) {
  const lesson = await requireAccess(userId, lessonId);
  const blocks = blocksOf(lesson);
  if (!Number.isInteger(index) || index < 0 || index >= blocks.length) throw new AccessError("out_of_order");
  const seen = await viewedIndexes(userId, lessonId);
  for (let i = 0; i < index; i++) if (!seen.has(i)) throw new AccessError("out_of_order");
  // Content after the knowledge check stays closed until the check is passed.
  const checkIndex = blocks.findIndex((b) => b.kind === "check");
  if (checkIndex >= 0 && index > checkIndex) {
    const passing = await db.quizAttempt.findFirst({ where: { userId, lessonId, passed: true, score: { gte: lesson.checkThreshold } } });
    if (!passing) throw new AccessError("out_of_order");
  }
  await db.blockView.createMany({ data: [{ userId, lessonId, blockIndex: index }], skipDuplicates: true });
  return tryCompleteLesson(userId, lesson);
}

export type CheckResult = { attemptId: string; score: number; passed: boolean; threshold: number; completed: boolean };

export async function submitCheck(userId: string, lessonId: string, answers: Record<string, string[]>): Promise<CheckResult> {
  const lesson = await requireAccess(userId, lessonId);
  const blocks = blocksOf(lesson);
  const checkIndex = blocks.findIndex((b) => b.kind === "check");
  if (checkIndex < 0) throw new AccessError("no_check");
  const seen = await viewedIndexes(userId, lessonId);
  for (let i = 0; i < checkIndex; i++) if (!seen.has(i)) throw new AccessError("out_of_order");

  const questions = await db.quizQuestion.findMany({ where: { lessonId } });
  const { score, results } = scoreQuiz(
    questions.map((q) => ({ id: q.id, type: q.type, answerKey: q.answerKey, competencyId: q.competencyId })),
    answers,
  );
  const threshold = lesson.checkThreshold;
  const passed = score >= threshold;

  const attempt = await db.quizAttempt.create({
    data: { userId, lessonId, score, passed, responses: { answers, results } as Prisma.InputJsonValue },
  });
  const perCompetency = competencyScores(results);
  if (perCompetency.length > 0) {
    await db.skillEvidence.createMany({
      data: perCompetency.map((c) => ({
        userId, competencyId: c.competencyId, source: "QUIZ", sourceId: attempt.id,
        score: c.score, tier: lesson.module.level.tier,
      })),
    });
  }
  await db.auditEvent.create({
    data: { actorId: userId, action: "quiz.attempt", subject: `lesson:${lessonId}`, detail: { attemptId: attempt.id, score, passed } },
  });
  if (passed) await db.blockView.createMany({ data: [{ userId, lessonId, blockIndex: checkIndex }], skipDuplicates: true });
  const completed = passed ? await tryCompleteLesson(userId, lesson) : false;
  return { attemptId: attempt.id, score, passed, threshold, completed };
}

/**
 * Completion rule: all required blocks viewed AND (if the lesson has a check) a passing attempt exists.
 * Both are re-verified from the database here; callers cannot assert them. Idempotent and safe under
 * concurrent calls: the unique (user, node) row means exactly one caller creates it and writes the audit event.
 */
async function tryCompleteLesson(userId: string, lesson: LessonRecord): Promise<boolean> {
  const blocks = blocksOf(lesson);
  const seen = await viewedIndexes(userId, lesson.id);
  const engaged = blocks.every((b, i) => !REQUIRED_KINDS.includes(b.kind) || seen.has(i));
  if (!engaged) return false;
  if (blocks.some((b) => b.kind === "check")) {
    const passing = await db.quizAttempt.findFirst({ where: { userId, lessonId: lesson.id, passed: true, score: { gte: lesson.checkThreshold } } });
    if (!passing) return false;
  }
  const { count } = await db.progress.createMany({
    data: [{ userId, nodeType: "LESSON", nodeId: lesson.id, state: "COMPLETED", completedAt: new Date() }],
    skipDuplicates: true,
  });
  if (count === 1) {
    await db.auditEvent.create({
      data: { actorId: userId, action: "lesson.complete", subject: `lesson:${lesson.id}`, detail: {} },
    });
  }
  return true;
}

// ───────── Read models for the UI

export type LessonView = {
  id: string; title: string; objective: string; blocks: StoredBlock[]; viewed: number[];
  checkThreshold: number; completed: boolean; nextLessonId: string | null;
  questions: { id: string; type: string; prompt: string; options: string[] }[];
};

/** Learner-facing lesson. Answer keys and explanations are deliberately never selected here. */
export async function getLessonView(userId: string, lessonId: string): Promise<LessonView> {
  const lesson = await requireAccess(userId, lessonId);
  const [viewed, questions, done] = await Promise.all([
    viewedIndexes(userId, lessonId),
    db.quizQuestion.findMany({ where: { lessonId }, select: { id: true, type: true, prompt: true, options: true }, orderBy: { id: "asc" } }),
    db.progress.findUnique({ where: { userId_nodeType_nodeId: { userId, nodeType: "LESSON", nodeId: lessonId } } }),
  ]);
  const siblings = await db.lesson.findMany({
    where: { moduleId: lesson.moduleId, status: { in: visibleStatuses() }, position: { gt: lesson.position } },
    orderBy: { position: "asc" }, take: 1,
  });
  return {
    id: lesson.id, title: lesson.title, objective: lesson.objective, blocks: blocksOf(lesson),
    viewed: [...viewed].sort((a, b) => a - b), checkThreshold: lesson.checkThreshold,
    completed: done?.state === "COMPLETED", nextLessonId: siblings[0]?.id ?? null,
    questions: questions.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, options: (q.options as string[] | null) ?? [] })),
  };
}

export type AttemptView = {
  score: number; passed: boolean;
  items: { prompt: string; correct: boolean; explanation: string }[];
};

/** Post-attempt feedback: explanations are shown only for the learner's own, already-submitted attempt. */
export async function getAttemptView(userId: string, lessonId: string, attemptId: string): Promise<AttemptView | null> {
  await requireAccess(userId, lessonId);
  const attempt = await db.quizAttempt.findFirst({ where: { id: attemptId, userId, lessonId } });
  if (!attempt) return null;
  const { results } = attempt.responses as unknown as { results: { id: string; correct: boolean }[] };
  const qs = await db.quizQuestion.findMany({ where: { id: { in: results.map((r) => r.id) } } });
  return {
    score: attempt.score, passed: attempt.passed,
    items: results.map((r) => {
      const q = qs.find((x) => x.id === r.id);
      return { prompt: q?.prompt ?? "", correct: r.correct, explanation: r.correct ? "" : q?.explanation ?? "" };
    }),
  };
}

export type LessonNode = {
  id: string; title: string; objective: string;
  state: "completed" | "active" | "available" | "locked";
  missing: string[];
};
export type ModuleNode = { id: string; title: string; lessons: LessonNode[]; complete: boolean };
export type Timeline = {
  pathTitle: string; modules: ModuleNode[];
  next: { lessonId: string; title: string } | null;
};

/** Per-learner timeline for a path. Beginner-level only until level gating lands in M4. */
export async function getTimeline(userId: string, pathId: string): Promise<Timeline | null> {
  const path = await db.path.findUnique({
    where: { id: pathId },
    include: {
      levels: { where: { tier: "BEGINNER" }, include: { modules: { where: { status: { in: visibleStatuses() } }, orderBy: { position: "asc" } } } },
    },
  });
  if (!path) return null;
  const modules: ModuleNode[] = [];
  for (const level of path.levels) {
    for (const m of level.modules) {
      const all = await db.lesson.findMany({
        where: { moduleId: m.id, status: { in: visibleStatuses() } },
        include: { prerequisites: { include: { prerequisite: true } } },
        orderBy: [{ position: "asc" }, { version: "desc" }],
      });
      const latest = [...new Map(all.map((l) => [l.slug, l])).values()];
      const done = await db.progress.findMany({
        where: { userId, nodeType: "LESSON", state: "COMPLETED", nodeId: { in: all.map((l) => l.id) } },
      });
      const doneSlugs = new Set(all.filter((l) => done.some((d) => d.nodeId === l.id)).map((l) => l.slug));
      const touched = new Set((await db.blockView.findMany({ where: { userId, lessonId: { in: all.map((l) => l.id) } }, select: { lessonId: true } })).map((v) => v.lessonId));
      const lessons: LessonNode[] = latest.map((l) => {
        const missing = l.prerequisites.map((p) => p.prerequisite).filter((p) => !doneSlugs.has(p.slug)).map((p) => p.title);
        const state = doneSlugs.has(l.slug) ? "completed" : missing.length > 0 ? "locked" : touched.has(l.id) ? "active" : "available";
        return { id: l.id, title: l.title, objective: l.objective, state, missing };
      });
      modules.push({ id: m.id, title: m.title, lessons, complete: lessons.length > 0 && lessons.every((l) => l.state === "completed") });
    }
  }
  const nextLesson = modules.flatMap((m) => m.lessons).find((l) => l.state === "active" || l.state === "available");
  return { pathTitle: path.title, modules, next: nextLesson ? { lessonId: nextLesson.id, title: nextLesson.title } : null };
}

/** Competencies whose most recent evidence is below the pass mark. Evidence-based, not time-based. */
export async function getWeakCompetencies(userId: string, passMark = 80) {
  const rows = await db.skillEvidence.findMany({
    where: { userId }, orderBy: { createdAt: "desc" }, include: { competency: true },
  });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.competencyId)) latest.set(r.competencyId, r);
  return [...latest.values()].filter((r) => r.score < passMark).map((r) => ({ title: r.competency.title, score: r.score }));
}
