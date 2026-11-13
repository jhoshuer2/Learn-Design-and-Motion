import { db } from "@/lib/db";
import { visibleStatuses } from "@/lib/progression/common";
import { MACHINE_SCORED, scoreQuiz } from "@/lib/progression/scoring";
import { pickQuestions } from "@/lib/practice/pick";
import type { OutcomeDef } from "@/lib/content/outcomes";

/**
 * The "where are you now" check. It only recommends: it reads questions, scores them and returns a summary. It never
 * writes evidence or progress and never skips a lesson. Answer keys and explanations stay on the server.
 */
export type PlacementQuestion = { id: string; type: string; prompt: string; options: string[]; skill: string; skillTitle: string; lessonTitle: string };

/** Visual-identification questions point at a demo or video the visitor has not seen, so they are never used here. */
const TYPES = MACHINE_SCORED.filter((t) => t !== "VISUAL_IDENTIFICATION");

async function load(outcome: OutcomeDef) {
  const rows = await db.quizQuestion.findMany({
    where: {
      type: { in: [...TYPES] }, competency: { slug: { in: outcome.skills } },
      lesson: { status: { in: visibleStatuses() }, module: { level: { path: { slug: outcome.path } } } },
    },
    include: { competency: true, lesson: { include: { module: true } } },
  });
  const out: { skill: string; q: (typeof rows)[number]; lessonTitle: string }[] = [];
  for (const skill of outcome.skills) {
    const pool = rows.filter((r) => r.competency?.slug === skill);
    if (pool.length === 0) continue;
    const [q] = pickQuestions(pool, `${outcome.slug}:${skill}`, 1); // the same one for everyone, so it is testable
    // The first lesson (in path order) that teaches this skill.
    const teaching = pool.map((r) => r.lesson).sort((a, b) => a.module.position - b.module.position || a.position - b.position)[0];
    out.push({ skill, q, lessonTitle: teaching.title });
  }
  return out;
}

export async function getPlacementQuestions(outcome: OutcomeDef): Promise<PlacementQuestion[]> {
  return (await load(outcome)).map(({ skill, q, lessonTitle }) => ({
    id: q.id, type: q.type, prompt: q.prompt, options: (q.options as string[] | null) ?? [],
    skill, skillTitle: q.competency!.title, lessonTitle,
  }));
}

export type PlacementRow = { skill: string; skillTitle: string; lessonTitle: string; known: boolean };

/** Exact-match scoring of the same questions; ids that are not part of this check are ignored (and count as unanswered). */
export async function scorePlacement(outcome: OutcomeDef, answers: Record<string, string[]>): Promise<PlacementRow[]> {
  const items = await load(outcome);
  const { results } = scoreQuiz(items.map((i) => ({ id: i.q.id, type: i.q.type, answerKey: i.q.answerKey })), Object.fromEntries(items.map((i) => [i.q.id, answers[i.q.id]])));
  return items.map((i, n) => ({ skill: i.skill, skillTitle: i.q.competency!.title, lessonTitle: i.lessonTitle, known: results[n].correct }));
}

export const toBits = (rows: { known: boolean }[]) => rows.map((r) => (r.known ? "1" : "0")).join("");
/** Only the exact bit string for this many skills is accepted; anything else is ignored. */
export function parseBits(value: string | undefined, n: number): boolean[] | null {
  if (!value || !new RegExp(`^[01]{${n}}$`).test(value)) return null;
  return [...value].map((c) => c === "1");
}

export function summarise(rows: PlacementRow[]) {
  const known = rows.filter((r) => r.known), unknown = rows.filter((r) => !r.known);
  // Lesson titles can contain commas, so each one is quoted to keep the list readable.
  const names = (xs: PlacementRow[]) => xs.map((r) => `\u201c${r.lessonTitle}\u201d`).join(", ");
  let text: string;
  if (rows.length === 0) text = "";
  else if (unknown.length === 0) text = "You may already know most of this. Each lesson has a quick check you can pass in a few minutes, so you can move fast.";
  else if (known.length === 0) text = "This is all new, which is a good place to start. Go step by step and the checks will show you how you are doing.";
  else text = `You can move quickly through: ${names(known)}. Take your time with: ${names(unknown)}.`;
  return { known: known.length, total: rows.length, text };
}
