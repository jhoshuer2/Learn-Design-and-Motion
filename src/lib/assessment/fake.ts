import { ProviderError, type ProviderErrorKind } from "./errors";
import { FAKE_PROVIDER_NAME, ProviderRefusedError, type EvaluationInput, type EvaluationProvider, type ProviderOutput } from "./provider";

const FLAKY_CALLS = new Map<string, number>();
const MESSAGES: Record<string, string> = {
  billing: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
  auth: "invalid x-api-key", rate_limit: "rate limit exceeded", overloaded: "Overloaded", timeout: "Request timed out.", bad_request: "invalid request",
};
function fakeError(kind: string): Error {
  if (kind === "refusal") return new ProviderRefusedError("The model declined to assess this submission.");
  if (!(kind in MESSAGES)) throw new Error(`unknown fake error kind ${kind}`);
  return new ProviderError(kind as ProviderErrorKind, MESSAGES[kind]);
}

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
 *   [fake:set=key:NN]    overrides one criterion's score (repeatable), applied after the above
 *   [fake:slow=MS]       waits MS milliseconds before answering (simulates a real, slow call)
 *   [fake:error=KIND]    throws a provider error of KIND: billing | auth | rate_limit | overloaded | timeout | refusal | bad_request
 *   [fake:flaky=N]       throws an "overloaded" error for the first N calls with this rationale, then succeeds
 */
export class FakeProvider implements EvaluationProvider {
  readonly name = FAKE_PROVIDER_NAME;

  async evaluate(input: EvaluationInput): Promise<ProviderOutput> {
    const r = input.rationale;
    const slow = /\[fake:slow=(\d{1,6})\]/.exec(r);
    if (slow) await new Promise((res) => setTimeout(res, Number(slow[1])));
    const err = /\[fake:error=([a-z_]+)\]/.exec(r);
    if (err) throw fakeError(err[1]);
    const flaky = /\[fake:flaky=(\d{1,2})\]/.exec(r);
    if (flaky) {
      const key = r;
      const n = (FLAKY_CALLS.get(key) ?? 0) + 1;
      FLAKY_CALLS.set(key, n);
      if (n <= Number(flaky[1])) throw fakeError("overloaded");
    }
    if (r.includes("[fake:invalid]") && !input.retryHint) return { raw: { nonsense: true } };
    if (r.includes("[fake:invalid]")) return { raw: "still not an evaluation" };
    if (r.includes("[fake:evidence]")) {
      return { raw: out("needs_evidence", [], { missingEvidence: ["A clearer export of the final poster."] }), model: "fake" };
    }
    const m = /\[fake:score=(\d{1,3})\]/.exec(r);
    const base = m ? Math.min(100, Number(m[1])) : 90;
    const mandatory = r.includes("[fake:mandatory]");
    const overrides = new Map([...r.matchAll(/\[fake:set=([a-z0-9-]+):(\d{1,3})\]/g)].map((m) => [m[1], Math.min(100, Number(m[2]))] as const));
    const criteria = input.rubric.criteria.map((c) => ({
      criterionId: c.key,
      score: overrides.get(c.key) ?? (mandatory ? (c.key === "contrast" ? 40 : 95) : base),
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
