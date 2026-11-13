import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getTimeline } from "@/lib/progression";
import { visibleStatuses } from "@/lib/progression/common";
import { MACHINE_SCORED, scoreQuiz } from "@/lib/progression/scoring";
import { nextHref } from "@/lib/progression/links";
import { getSubmissionView } from "@/lib/submissions/view";
import type { Fix } from "@/lib/submissions/buddy";
import { activityDays, currentRun, localDay, safeTz, weekStrip } from "./days";
import { pickQuestions, pickWarmupSkill } from "./pick";

export class PracticeError extends Error {
  constructor(public code: "nothing_to_practise" | "already_done" | "bad_answers") { super(`Practice: ${code}`); }
}

export const WARMUP_QUESTIONS = 3;

export type WarmupQuestion = { id: string; type: string; prompt: string; options: string[] };
export type WarmupResultItem = { prompt: string; correct: boolean; explanation: string; lessonTitle: string; ideaHref: string };
export type TodayView = {
  day: string; tz: string;
  week: { day: string; active: boolean; isToday: boolean }[]; run: number;
  warmup:
    | { state: "none" }
    | { state: "open"; skill: string; questions: WarmupQuestion[] }
    | { state: "done"; skill: string; correct: number; total: number; items: WarmupResultItem[] };
  next: { title: string; href: string } | null;
  fix: { fix: Fix; submissionId: string } | null;
  learnedToday: boolean;
};

/** The warm-up for a learner and day: the skill and the exact questions (answer keys stay on the server). */
async function planWarmup(userId: string, day: string) {
  const enrollments = await db.enrollment.findMany({ where: { userId }, select: { pathId: true } });
  if (enrollments.length === 0) return null;
  const done = await db.progress.findMany({ where: { userId, nodeType: "LESSON", state: "COMPLETED" }, select: { nodeId: true } });
  const questions = await db.quizQuestion.findMany({
    where: {
      lessonId: { in: done.map((d) => d.nodeId) }, competencyId: { not: null }, type: { in: [...MACHINE_SCORED] },
      lesson: { status: { in: visibleStatuses() }, module: { level: { pathId: { in: enrollments.map((e) => e.pathId) } } } },
    },
    include: { competency: true },
  });
  const available = new Set(questions.map((q) => q.competencyId!));
  const evidence = await db.skillEvidence.findMany({ where: { userId }, select: { competencyId: true, score: true, createdAt: true } });
  const skill = pickWarmupSkill(evidence, available);
  if (!skill) return null;
  const pool = questions.filter((q) => q.competencyId === skill);
  const chosen = pickQuestions(pool, `${userId}:${day}:${skill}`, Math.min(WARMUP_QUESTIONS, pool.length));
  return { skill, skillTitle: pool[0].competency!.title, chosen };
}

export async function getToday(userId: string, tzIn: string | null | undefined, now = new Date()): Promise<TodayView> {
  const tz = safeTz(tzIn), day = localDay(now, tz);
  const since = new Date(now.getTime() - 60 * 24 * 3600 * 1000);
  const [views, attempts, subs, practice] = await Promise.all([
    db.blockView.findMany({ where: { userId, createdAt: { gte: since } }, select: { createdAt: true } }),
    db.quizAttempt.findMany({ where: { userId, createdAt: { gte: since } }, select: { createdAt: true } }),
    db.submission.findMany({ where: { userId, createdAt: { gte: since } }, select: { createdAt: true } }),
    db.practiceSession.findMany({ where: { userId, createdAt: { gte: since } }, select: { createdAt: true } }),
  ]);
  const learningStamps = [...views, ...attempts, ...subs].map((x) => x.createdAt);
  const days = activityDays([...learningStamps, ...practice.map((x) => x.createdAt)], tz);

  const session = await db.practiceSession.findUnique({ where: { userId_day_kind: { userId, day, kind: "WARMUP" } }, include: { competency: true } });
  let warmup: TodayView["warmup"] = { state: "none" };
  if (session) {
    const results = session.questionIds as unknown as { id: string; correct: boolean }[];
    const qs = await db.quizQuestion.findMany({ where: { id: { in: results.map((r) => r.id) } }, include: { lesson: true } });
    const items = results.flatMap((r): WarmupResultItem[] => {
      const q = qs.find((x) => x.id === r.id); if (!q) return [];
      const blocks = (q.lesson.blocks as unknown as { kind: string }[]) ?? [];
      const concept = Math.max(0, blocks.findIndex((b) => b.kind === "concept"));
      return [{ prompt: q.prompt, correct: r.correct, explanation: q.explanation, lessonTitle: q.lesson.title, ideaHref: `/learn/lesson/${q.lessonId}?step=${concept}` }];
    });
    warmup = { state: "done", skill: session.competency.title, correct: session.correct, total: session.total, items };
  } else {
    const plan = await planWarmup(userId, day);
    if (plan) warmup = { state: "open", skill: plan.skillTitle, questions: plan.chosen.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, options: (q.options as string[] | null) ?? [] })) };
  }

  const enrollments = await db.enrollment.findMany({ where: { userId } });
  const timelines = await Promise.all(enrollments.map((e) => getTimeline(userId, e.pathId)));
  const nx = timelines.find((t) => t?.next)?.next ?? null;

  let fix: TodayView["fix"] = null;
  const last = await db.submission.findFirst({ where: { userId, evaluations: { some: { status: "complete" } } }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (last) {
    const v = await getSubmissionView({ id: userId, role: "LEARNER" }, last.id);
    if (v?.buddy?.nextFix) fix = { fix: v.buddy.nextFix, submissionId: last.id };
  }

  return {
    day, tz, week: weekStrip(days, day), run: currentRun(days, day), warmup,
    next: nx ? { title: nx.title, href: nextHref(nx) } : null, fix,
    learnedToday: learningStamps.some((s) => localDay(s, tz) === day),
  };
}

/**
 * Score the day's warm-up on the server, re-deriving the same questions from the seed. Practice only: this never writes
 * SkillEvidence, so it cannot change a result or unlock anything. One per learner per day, even if submits race.
 */
export async function submitWarmup(userId: string, tzIn: string | null | undefined, answers: Record<string, string[]>, now = new Date()) {
  const tz = safeTz(tzIn), day = localDay(now, tz);
  const plan = await planWarmup(userId, day);
  if (!plan) throw new PracticeError("nothing_to_practise");
  const ids = new Set(plan.chosen.map((q) => q.id));
  if (Object.keys(answers).some((k) => !ids.has(k))) throw new PracticeError("bad_answers");
  const { score, results } = scoreQuiz(plan.chosen.map((q) => ({ id: q.id, type: q.type, answerKey: q.answerKey })), answers);
  try {
    await db.practiceSession.create({
      data: {
        userId, day, kind: "WARMUP", competencyId: plan.skill, total: results.length, correct: results.filter((r) => r.correct).length,
        questionIds: results.map((r) => ({ id: r.id, correct: r.correct })) as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new PracticeError("already_done");
    throw e;
  }
  return { score, correct: results.filter((r) => r.correct).length, total: results.length };
}
