import { FAKE_PROVIDER_NAME, type EvaluationInput, type EvaluationProvider, type ProviderOutput } from "./provider";

/**
 * TEST-ONLY deterministic evaluator. It does NOT look at the images. It exists so the pipeline, scoring,
 * gating and UI can be exercised without a model. It is only reachable when explicitly enabled (see
 * getProvider), its name is stored on every Evaluation, and results pages label it as a test evaluator.
 *
 * Markers in the rationale pick the behaviour:
 *   [fake:score=NN]      every criterion scores NN (default 90)
 *   [fake:mandatory]     all criteria 95 except "contrast" 40
 *   [fake:invalid]       returns malformed output
 *   [fake:evidence]      asks for more evidence
 */
export class FakeProvider implements EvaluationProvider {
  readonly name = FAKE_PROVIDER_NAME;

  async evaluate(input: EvaluationInput): Promise<ProviderOutput> {
    const r = input.rationale;
    if (r.includes("[fake:invalid]") && !input.retryHint) return { raw: { nonsense: true } };
    if (r.includes("[fake:invalid]")) return { raw: "still not an evaluation" };
    if (r.includes("[fake:evidence]")) {
      return { raw: out("needs_evidence", [], { missingEvidence: ["A clearer export of the final poster."] }), model: "fake" };
    }
    const m = /\[fake:score=(\d{1,3})\]/.exec(r);
    const base = m ? Math.min(100, Number(m[1])) : 90;
    const mandatory = r.includes("[fake:mandatory]");
    const criteria = input.rubric.criteria.map((c) => ({
      criterionId: c.key,
      score: mandatory ? (c.key === "contrast" ? 40 : 95) : base,
      evidence: `Test evaluator: no image was inspected for ${c.title}.`,
      where: "Not applicable (test evaluator)",
      explanation: "This is a deterministic test result, not an assessment of the work.",
      principle: "Contrast",
      improvement: "Re-submit when the real assessor is configured to get genuine feedback.",
      verify: "Check the result page shows a test evaluator label.",
    }));
    return { raw: out("complete", criteria), model: "fake", inputTokens: 0, outputTokens: 0 };
  }
}

function out(status: "complete" | "needs_evidence", criteria: unknown[], extra: Record<string, unknown> = {}) {
  return {
    status, missingEvidence: [], criteria,
    strengths: ["(test evaluator) none observed"], weaknesses: ["(test evaluator) none observed"],
    missingRequirements: [], criticalFailures: [], confidence: "high", reviewFlag: false, ...extra,
  };
}
