import type { CriterionResult } from "./schema";

/**
 * The scoring authority. It consumes criterion scores and the PUBLISHED rubric (weights, mandatory
 * minimums, threshold). Anything else the model says about totals or pass/fail never reaches here.
 */
export type RubricCriterionDef = { key: string; title: string; weight: number; mandatory: boolean; minScore: number | null };
export type RubricDef = { threshold: number; criteria: RubricCriterionDef[] };

export class InvalidEvaluationError extends Error {}

export type ScoreResult = {
  score: number; // integer 0-100; this exact value is compared with the threshold
  passed: boolean;
  failedMandatory: { key: string; title: string; score: number; minScore: number }[];
  reasons: string[]; // plain-language explanation of the outcome, shown to the learner
};

export function computeResult(
  rubric: RubricDef,
  results: Pick<CriterionResult, "criterionId" | "score">[],
  criticalFailures: string[] = [],
): ScoreResult {
  const byKey = new Map<string, number>();
  for (const r of results) {
    if (!Number.isInteger(r.score) || r.score < 0 || r.score > 100) {
      throw new InvalidEvaluationError(`Score for "${r.criterionId}" must be an integer from 0 to 100`);
    }
    if (byKey.has(r.criterionId)) throw new InvalidEvaluationError(`Criterion "${r.criterionId}" was scored more than once`);
    byKey.set(r.criterionId, r.score);
  }
  const known = new Set(rubric.criteria.map((c) => c.key));
  for (const k of byKey.keys()) if (!known.has(k)) throw new InvalidEvaluationError(`Unknown criterion "${k}"`);
  for (const c of rubric.criteria) if (!byKey.has(c.key)) throw new InvalidEvaluationError(`Criterion "${c.key}" was not scored`);

  const totalWeight = rubric.criteria.reduce((n, c) => n + c.weight, 0);
  if (totalWeight <= 0) throw new InvalidEvaluationError("Rubric has no weight");
  const score = Math.round(rubric.criteria.reduce((n, c) => n + c.weight * byKey.get(c.key)!, 0) / totalWeight);

  const failedMandatory = rubric.criteria
    .filter((c) => c.mandatory && c.minScore !== null && byKey.get(c.key)! < c.minScore)
    .map((c) => ({ key: c.key, title: c.title, score: byKey.get(c.key)!, minScore: c.minScore! }));

  const reasons: string[] = [];
  if (score < rubric.threshold) reasons.push(`The overall score of ${score}% is below the ${rubric.threshold}% pass mark.`);
  for (const f of failedMandatory) {
    reasons.push(`"${f.title}" is a required criterion. It scored ${f.score}% and needs at least ${f.minScore}%, whatever the overall score.`);
  }
  for (const c of criticalFailures) reasons.push(`Critical issue: ${c}`);

  const passed = reasons.length === 0;
  if (passed) reasons.push(`The overall score of ${score}% meets the ${rubric.threshold}% pass mark and every required criterion is met.`);
  return { score, passed, failedMandatory, reasons };
}
