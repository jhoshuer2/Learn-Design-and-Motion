# Assessment engine (as built in M3)

## Principle
The AI is an assessor and learning coach, not an authority. It returns **criterion scores and feedback only**. The server computes the weighted score, mandatory-minimum checks and pass/fail from the **published rubric version**, and only the server can move progression.

## Flow (`src/lib/assessment/evaluate.ts`)
1. `createSubmission` (`src/lib/submissions`) checks `getAssignmentAccess` (published, enrolled, every module lesson complete, not already passed, attempts left, nothing half-finished), decodes and validates every image, stores it privately, and creates the submission with a unique `(user, assignment, attempt)`.
2. `evaluateSubmission` takes a per-user hourly rate limit check, then an **atomic claim** (`SUBMITTED|FAILED_TO_EVALUATE -> EVALUATING`). Concurrent callers get `busy`; exactly one evaluates.
3. **Deterministic checks** (`checks.ts`): final and preview present, rationale length, preview smaller and same shape. Missing required evidence -> `NEEDS_EVIDENCE` **without calling a model**.
4. Provider call (`provider.ts`). Output is validated with zod (`schema.ts`) and with `computeResult`. Invalid -> one retry that includes the validation problem -> otherwise `FAILED_TO_EVALUATE` with the raw output kept as evidence and **no score**.
5. Model may itself return `needs_evidence` (with what is missing). No score.
6. `computeResult` (`scoring.ts`): integer 0-100 per criterion, every criterion exactly once, weights from the rubric version. `score = round(sum(weight*score)/sum(weight))`. **Pass iff** score >= threshold **and** every mandatory criterion >= its `minScore` **and** no critical failure. The integer score shown is the integer compared.
7. In one transaction: persist Evaluation + CriterionScores (with `rubricVersionId`, provider, model, tokens, raw output, deterministic checks), set submission `EVALUATED`, call `applyEvaluation` (sole writer of assessment progression; idempotent), write audit events.

## Attempts
Consumed only by **completed** evaluations. `needs_evidence` (amend the same submission), `FAILED_TO_EVALUATE` (retry) and `not_configured` do not cost an attempt. Default 3 per assignment. From attempt 2 the learner must say what they changed.

## Providers
- `ClaudeProvider` (`claude.ts`): Anthropic SDK, model from `EVALUATION_MODEL` (default `claude-opus-5-5`), adaptive thinking, `effort: high`, structured output (`output_config.format`), images downscaled to 1568 px and re-encoded, max 8000 output tokens, 120 s timeout. A `refusal` or truncation is surfaced, never replaced by a guess. Learner text and file names are fenced as data in the prompt.
- `NotConfiguredProvider`: used when `ANTHROPIC_API_KEY` is absent. Produces **no score**; the submission stays resubmittable.
- `FakeProvider` (`fake.ts`): deterministic, does not look at images, **test only**. Needs `EVALUATION_PROVIDER=fake` and `NODE_ENV=test` or `ALLOW_FAKE_EVALUATOR=true`. The provider name is stored on every Evaluation and the results page shows a TEST EVALUATOR banner.

## Appeals and human review (`src/lib/review`)
A learner can appeal a **failed, AI-produced, latest** evaluation once. The submission is held in `IN_HUMAN_REVIEW` so a new attempt cannot race it. REVIEWER/ADMIN users (role set only with `npm run user:role`) see an anonymised queue and either **uphold** or **override** scores with required reasons. An override creates a new human Evaluation (`supersedesId`; history is never edited), is computed by the same `computeResult`, applied through the same `applyEvaluation`, atomic (one reviewer wins), and audited. A reviewer cannot review their own work, and an override cannot revoke a recorded pass.

## Fairness and what is NOT built
Published rubric shown before submission; rubric versions immutable; objective facts separated from judgement; resubmission rules; appeals. **Not built:** grading-consistency tracking, AI-vs-expert calibration, repeat-evaluation variance, a queue for low-confidence results that nobody appealed, appeal SLAs, notifications.
