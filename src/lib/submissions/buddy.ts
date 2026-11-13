import type { Prisma, PrismaClient } from "@prisma/client";
import { visibleStatuses } from "@/lib/progression/common";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * The "buddy" view of a finished assessment. It adds NO new judgement: every number comes from the stored evaluation
 * (already recomputed on the server), and the words are fixed templates around it. It only decides what to say first,
 * and where to send the learner to practise.
 */
export type CriterionInput = {
  key: string; title: string; weight: number; mandatory: boolean; minScore: number | null; score: number;
  evidence: string; improvement: string; where?: string; principle?: string; competencyId: string | null;
};

export type LessonLink = {
  lessonId: string; title: string; competency: string;
  /** Deep links into the lesson: the idea, the good-versus-bad comparison, and the guided practice. */
  idea: string; compare?: string; practice?: string;
  /** Plain-text excerpt of the lesson's own good-versus-bad step, shown beside the learner's work. */
  contrast?: string;
};

export type Fix = {
  key: string; title: string; score: number; minScore: number | null; belowMinimum: boolean;
  evidence: string; improvement: string; where?: string; principle?: string;
  /** Points gained or lost since the previous completed attempt, when there was one. */
  delta: number | null; links: LessonLink[];
};
export type Nailed = { key: string; title: string; score: number; note: string; delta: number | null };
export type Buddy = {
  opening: string;
  nailed: Nailed[];
  nextFix: Fix | null;
  moreFixes: Fix[];
  progress: { previousScore: number | null; delta: number | null };
  closing: string;
};

/** A criterion is "good enough" at or above this; below it the buddy offers a fix. */
export const FIX_BELOW = 80;
export const NAILED_AT = 75;

/** Mandatory criteria under their minimum come first (largest shortfall first), then by how many weighted points are at stake. */
export function rankFixes<T extends Pick<CriterionInput, "weight" | "mandatory" | "minScore" | "score" | "key">>(criteria: T[]): T[] {
  const shortfall = (c: T) => (c.mandatory && c.minScore !== null && c.score < c.minScore ? c.minScore - c.score : 0);
  return criteria
    .filter((c) => c.score < FIX_BELOW)
    .sort((a, b) => (shortfall(b) > 0 ? 1 : 0) - (shortfall(a) > 0 ? 1 : 0) || shortfall(b) - shortfall(a) || b.weight * (100 - b.score) - a.weight * (100 - a.score) || a.key.localeCompare(b.key));
}

export function openingLine(o: { passed: boolean; delta: number | null; hasFix: boolean }): string {
  if (o.passed) return o.hasFix ? "Nicely done: you passed. Here is what is working, and the one thing that would lift it most." : "Nicely done: you passed, and there is nothing big left to fix.";
  if (o.delta !== null && o.delta > 0) return `You moved up ${o.delta} point${o.delta === 1 ? "" : "s"} since last time. Here is what is working, and the one thing to fix next.`;
  return "You are closer than it feels. Here is what is working, and the one thing to fix first.";
}

const closingLine = (hasFix: boolean, passed: boolean) =>
  hasFix ? "Take the lesson links, try again with what you learn, and send it back. Each attempt shows you something new." : passed ? "Keep going when you are ready." : "Look at the details below and try again when you are ready.";

export function buildBuddyFrom(input: {
  passed: boolean; score: number; previousScore: number | null; criteria: CriterionInput[]; previous: Map<string, number>;
  links: Map<string, LessonLink[]>;
}): Buddy {
  const delta = (k: string, s: number) => (input.previous.has(k) ? s - input.previous.get(k)! : null);
  const toFix = (c: CriterionInput): Fix => ({
    key: c.key, title: c.title, score: c.score, minScore: c.minScore,
    belowMinimum: c.mandatory && c.minScore !== null && c.score < c.minScore,
    evidence: c.evidence, improvement: c.improvement, where: c.where, principle: c.principle,
    delta: delta(c.key, c.score), links: (c.competencyId && input.links.get(c.competencyId)) || [],
  });
  const fixes = rankFixes(input.criteria).map(toFix);
  const nailed = input.criteria.filter((c) => c.score >= NAILED_AT)
    .sort((a, b) => b.weight * b.score - a.weight * a.score || a.key.localeCompare(b.key)).slice(0, 3)
    .map((c) => ({ key: c.key, title: c.title, score: c.score, note: c.evidence, delta: delta(c.key, c.score) }));
  const d = input.previousScore === null ? null : input.score - input.previousScore;
  return {
    opening: openingLine({ passed: input.passed, delta: d, hasFix: fixes.length > 0 }),
    nailed, nextFix: fixes[0] ?? null, moreFixes: fixes.slice(1, 3),
    progress: { previousScore: input.previousScore, delta: d },
    closing: closingLine(fixes.length > 0, input.passed),
  };
}

/**
 * A short plain-text excerpt of a lesson's good-versus-bad step. Prose lines are used as they are; a markdown table is turned
 * into "weak → strong" sentences for its first two data rows. Media lines are dropped.
 */
export function plainContrast(body: string): string {
  const lines = body.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("<<"));
  const prose = lines.filter((l) => !l.startsWith("|"));
  const rows = lines.filter((l) => l.startsWith("|") && !/^\|[\s:|-]+\|?$/.test(l)).slice(1, 3)
    .map((l) => l.split("|").map((c) => c.trim()).filter(Boolean).join(" → "));
  return [...prose, ...rows].join(" ").replace(/[*_`#]/g, "").slice(0, 280);
}
const plain = plainContrast;

/** For each competency, the lessons of the learner's OWN path that teach it, with step links. Latest version of each lesson only. */
export async function competencyLinks(client: Db, competencyIds: string[], pathId: string | undefined): Promise<Map<string, LessonLink[]>> {
  const out = new Map<string, LessonLink[]>();
  if (competencyIds.length === 0) return out;
  const rows = await client.lessonCompetency.findMany({
    where: { competencyId: { in: competencyIds }, lesson: { status: { in: visibleStatuses() }, ...(pathId ? { module: { level: { pathId } } } : {}) } },
    include: { lesson: true, competency: true },
  });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows.sort((a, b) => b.lesson.version - a.lesson.version)) { const k = `${r.competencyId}:${r.lesson.slug}`; if (!latest.has(k)) latest.set(k, r); }
  for (const r of latest.values()) {
    const blocks = (r.lesson.blocks as unknown as { kind: string; body: string }[]) ?? [];
    const at = (kind: string) => { const i = blocks.findIndex((b) => b.kind === kind); return i >= 0 ? i : undefined; };
    const href = (i: number | undefined) => (i === undefined ? undefined : `/learn/lesson/${r.lessonId}?step=${i}`);
    const gv = at("goodVsBad");
    const link: LessonLink = {
      lessonId: r.lessonId, title: r.lesson.title, competency: r.competency.title,
      idea: href(at("concept") ?? 0)!, compare: href(gv), practice: href(at("guided")),
      contrast: gv === undefined ? undefined : plain(blocks[gv].body) || undefined,
    };
    out.set(r.competencyId, [...(out.get(r.competencyId) ?? []), link]);
  }
  return out;
}
