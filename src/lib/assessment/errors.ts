import Anthropic from "@anthropic-ai/sdk";

/**
 * What went wrong with an assessor call, and what the system should do about it. Operators see the kind and the
 * (scrubbed) message; learners only ever see a plain-language state.
 */
export type ProviderErrorKind =
  | "billing" | "auth" | "rate_limit" | "overloaded" | "timeout" | "bad_request" | "refusal" | "output_invalid" | "unknown";

export type ErrorPolicy = {
  /** Worth trying again later without a human. */
  retryable: boolean;
  /** The whole queue should pause: nothing will succeed until an operator or the provider changes something. */
  pauses: boolean;
  /** A person should look at this submission. */
  needsHuman: boolean;
  /** An operator should be told. */
  alertsOperator: boolean;
};

export const POLICY: Record<ProviderErrorKind, ErrorPolicy> = {
  billing: { retryable: false, pauses: true, needsHuman: false, alertsOperator: true },
  auth: { retryable: false, pauses: true, needsHuman: false, alertsOperator: true },
  rate_limit: { retryable: true, pauses: false, needsHuman: false, alertsOperator: false },
  overloaded: { retryable: true, pauses: false, needsHuman: false, alertsOperator: false },
  timeout: { retryable: true, pauses: false, needsHuman: false, alertsOperator: false },
  bad_request: { retryable: false, pauses: false, needsHuman: true, alertsOperator: true },
  refusal: { retryable: false, pauses: false, needsHuman: true, alertsOperator: false },
  output_invalid: { retryable: true, pauses: false, needsHuman: true, alertsOperator: false },
  unknown: { retryable: true, pauses: false, needsHuman: false, alertsOperator: false },
};

export class ProviderError extends Error {
  readonly policy: ErrorPolicy;
  constructor(public readonly kind: ProviderErrorKind, message: string, public readonly status?: number) {
    super(scrub(message));
    this.name = "ProviderError";
    this.policy = POLICY[kind];
  }
}

/** Never let a credential reach a log, a database row or a screen. */
export const scrub = (s: string) => s.replace(/sk-ant-[A-Za-z0-9_-]+/g, "<redacted-key>").replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer <redacted>").slice(0, 500);

const CREDIT = /credit balance is too low|insufficient (credit|funds)|purchase credits|plans\s*&\s*billing/i;

/**
 * Map an Anthropic SDK error to a kind. Only the billing case (HTTP 400 `invalid_request_error` with the credit
 * message) has been observed on the live API; every other mapping follows the SDK's documented error classes
 * and HTTP status meanings and is covered by tests built from constructed errors.
 */
export function classifyError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  const message = e instanceof Error ? e.message : String(e);
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError("timeout", message);
  if (e instanceof Anthropic.APIConnectionError) return new ProviderError("timeout", message); // network failure: transient
  if (e instanceof Anthropic.APIError) {
    const status = e.status;
    if (status === 402 || (status === 400 && CREDIT.test(message))) return new ProviderError("billing", message, status);
    if (status === 401 || status === 403) return new ProviderError("auth", message, status);
    if (status === 429) return new ProviderError("rate_limit", message, status);
    if (status === 529 || status === 503 || status === 502) return new ProviderError("overloaded", message, status);
    if (status === 408 || status === 504) return new ProviderError("timeout", message, status);
    if (typeof status === "number" && status >= 500) return new ProviderError("overloaded", message, status);
    if (status === 400 || status === 404 || status === 413 || status === 422) return new ProviderError("bad_request", message, status);
    return new ProviderError("unknown", message, status);
  }
  return new ProviderError("unknown", message);
}

/** Short, safe wording for the learner. Never includes provider detail. */
export function learnerMessage(kind: ProviderErrorKind | null | undefined): string {
  switch (kind) {
    case "billing": case "auth":
      return "Assessment is temporarily paused. Your work is saved and queued, and it will be assessed automatically when service resumes.";
    case "rate_limit": case "overloaded": case "timeout":
      return "The assessor is busy. Your work is saved and we are trying again automatically.";
    case "refusal": case "bad_request": case "output_invalid":
      return "This submission needs a person to look at it. Your work is saved and no attempt has been used.";
    default:
      return "Assessment did not complete. Your work is saved and no attempt has been used.";
  }
}
