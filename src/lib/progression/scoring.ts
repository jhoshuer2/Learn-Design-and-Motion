export type ScorableQuestion = { id: string; type: string; answerKey: unknown; competencyId?: string | null };
export type QuestionResult = { id: string; correct: boolean; competencyId?: string | null };

export const MACHINE_SCORED = ["MULTIPLE_CHOICE", "MULTIPLE_SELECT", "VISUAL_IDENTIFICATION", "ERROR_DETECTION"] as const;

const asSet = (v: unknown) => new Set((Array.isArray(v) ? v : [v]).map(String));

/** Exact-match scoring, no partial credit: a half-right multi-select is wrong. Unanswered is wrong. */
export function scoreQuiz(questions: ScorableQuestion[], responses: Record<string, string[] | undefined>) {
  if (questions.length === 0) throw new Error("A knowledge check needs at least one question");
  const results: QuestionResult[] = questions.map((q) => {
    if (!(MACHINE_SCORED as readonly string[]).includes(q.type)) {
      throw new Error(`Question type ${q.type} cannot be machine-scored in a knowledge check`);
    }
    const want = asSet(q.answerKey);
    const got = asSet(responses[q.id] ?? []);
    const correct = want.size === got.size && [...want].every((x) => got.has(x));
    return { id: q.id, correct, competencyId: q.competencyId };
  });
  const score = Math.round((results.filter((r) => r.correct).length / questions.length) * 100);
  return { score, results };
}

/** Per-competency percentage from question results; feeds SkillEvidence. */
export function competencyScores(results: QuestionResult[]) {
  const by = new Map<string, { right: number; total: number }>();
  for (const r of results) {
    if (!r.competencyId) continue;
    const e = by.get(r.competencyId) ?? { right: 0, total: 0 };
    e.total += 1;
    if (r.correct) e.right += 1;
    by.set(r.competencyId, e);
  }
  return [...by].map(([competencyId, { right, total }]) => ({ competencyId, score: Math.round((right / total) * 100) }));
}
