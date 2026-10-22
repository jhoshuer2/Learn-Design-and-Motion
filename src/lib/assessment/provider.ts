import type { DeterministicChecks } from "./checks";
import { ProviderError } from "./errors";

export type EvaluationInput = {
  assignment: { title: string; objective: string; scenario: string; requirements: string[]; constraints: string[] };
  rubric: {
    title: string; threshold: number;
    criteria: { key: string; title: string; description: string; weight: number; mandatory: boolean; minScore: number | null }[];
  };
  images: { slot: string; label: string; role: string; name: string; width: number; height: number; mime: string; data: Buffer }[];
  rationale: string;
  changesNote?: string | null;
  checks: DeterministicChecks;
  /** Set on the single retry: the validation problem with the previous output. */
  retryHint?: string;
};

export type ProviderOutput = { raw: unknown; model?: string; inputTokens?: number; outputTokens?: number };

export interface EvaluationProvider {
  readonly name: string;
  evaluate(input: EvaluationInput): Promise<ProviderOutput>;
}

/** No grader is available. The caller must NOT produce a score. */
export class ProviderNotConfiguredError extends Error {}
/** The model declined to assess this submission. Goes to human review; never a score. */
export class ProviderRefusedError extends ProviderError {
  constructor(message: string) { super("refusal", message); }
}
/** Output was cut off or was not JSON. Treated like invalid output. */
export class ProviderOutputError extends ProviderError {
  constructor(message: string) { super("output_invalid", message); }
}

export class NotConfiguredProvider implements EvaluationProvider {
  readonly name = "not-configured";
  async evaluate(): Promise<ProviderOutput> {
    throw new ProviderNotConfiguredError("Automated assessment is not configured (ANTHROPIC_API_KEY is not set).");
  }
}

/**
 * Which provider to use.
 * - ANTHROPIC_API_KEY present -> Claude.
 * - EVALUATION_PROVIDER=fake -> a deterministic TEST-ONLY evaluator, permitted only when NODE_ENV=test or
 *   ALLOW_FAKE_EVALUATOR=true. Every Evaluation records the provider name, and results pages label it.
 * - otherwise -> not configured. We never fall back to inventing a grade.
 */
export async function getProvider(): Promise<EvaluationProvider> {
  if (process.env.EVALUATION_PROVIDER === "fake") {
    if (process.env.NODE_ENV !== "test" && process.env.ALLOW_FAKE_EVALUATOR !== "true") {
      throw new Error("The fake evaluator is test-only. Set ALLOW_FAKE_EVALUATOR=true to enable it explicitly.");
    }
    const { FakeProvider } = await import("./fake");
    return new FakeProvider();
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const { ClaudeProvider } = await import("./claude");
    return new ClaudeProvider();
  }
  return new NotConfiguredProvider();
}

export const FAKE_PROVIDER_NAME = "test-only-fake";
