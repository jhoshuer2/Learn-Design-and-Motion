export type PortfolioErrorCode =
  | "not_found" | "not_evaluated" | "already_exists" | "display_name_required" | "held" | "invalid"
  | "nothing_to_show" | "sign_in_required" | "forbidden" | "own_project" | "blocked" | "duplicate_review"
  | "rate_limited" | "already_reported" | "not_visible" | "unverified";

export class PortfolioError extends Error {
  constructor(public code: PortfolioErrorCode, message?: string) {
    super(message ?? code);
  }
}
