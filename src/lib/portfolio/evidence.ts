import { FAKE_PROVIDER_NAME } from "@/lib/assessment/provider";

/**
 * "Verified" means a PASSED result from a real assessor (the AI model or a human reviewer). It is never
 * given to the test evaluator, to a failed result, or to anything else. This is the only place it is decided.
 */
export function isVerified(e: { passed: boolean | null; provider: string }): boolean {
  return e.passed === true && (e.provider === "claude" || e.provider === "human");
}

export const isTestEvaluator = (provider: string) => provider === FAKE_PROVIDER_NAME;

export function assessorLabel(provider: string, model: string | null): string {
  if (provider === "human") return "Human reviewer";
  if (provider === "claude") return `AI assessor (${model ?? "model not recorded"})`;
  if (provider === FAKE_PROVIDER_NAME) return "TEST EVALUATOR: not a real assessment of the work";
  return "Automated checks";
}
