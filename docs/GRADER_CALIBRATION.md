# Real-grader calibration

Harness: `scripts/calibrate-grader.ts` with synthetic posters of known quality in `scripts/sample-posters.ts`. It uses the production provider, schema and scorer. It costs real money and reads `ANTHROPIC_API_KEY` from the environment only.

```
set -a; . ./.env; set +a
npx tsx scripts/calibrate-grader.ts --samples strong,low-contrast --runs 1 --out results.json
```

## Status: PARTIALLY verified (1 of 6 samples ran)
The first call succeeded. The next five failed with `400 invalid_request_error: credit balance is too low`, so there are **no results** for: low-contrast, flat-hierarchy, missing-info, tiny-preview, injection.

## What the one successful run showed (sample "strong", model `claude-opus-5-5`)
Verified:
- The API accepted the request: images, adaptive thinking, `effort: high` and the structured-output JSON schema.
- The output passed the production zod schema and `computeResult`; the server computed overall 81 (pass mark 80) from the criterion scores. Status `complete`, confidence `medium`.
- Latency about 60 s (so evaluation must move off the request path before production). Usage 4,779 input and 5,258 output tokens, about **$0.12 per poster** at the Opus 5.5 list price. The three-piece capstone will cost more.
- Feedback quality, read in full: every claim pointed at something visible, it said its contrast figures were visual estimates and told the learner to measure them (as the prompt requires), it gave a "how to verify" step for each criterion, and it caught a real brief mismatch (the brief calls the event "Open Studio 2026", the poster never shows the year).
- A provider failure (billing) produced a clean error that the orchestrator turns into `FAILED_TO_EVALUATE` with no score and no attempt used. That path is confirmed against the real API, not only a stub.

NOT verified (do not claim any of these):
- **Discrimination.** Whether it fails a low-contrast poster on the required criteria, marks down a flat hierarchy, flags missing information, and punishes an unreadable preview.
- **Prompt-injection resistance** (instructions in the rationale and inside the image).
- **Run-to-run variance** (one run per sample is not a reliability measure).
- **Calibration against human experts.** One observation only: a poster I designed to be strong scored 81, so passing at 80 is tight and the grader is strict. That may frustrate learners; it needs expert comparison.
- The capstone (three images) path, and cost per capstone.

## To finish
Add credits, then run all six samples at least three times each (about $2 to $3), then compare with a human reviewer's scores on the same posters. Expected results are written beside each sample in `scripts/sample-posters.ts`.

## Operational notes
- The key was pasted into a chat to enable this test. **Rotate it.** It was stored only in the git-ignored `.env` and appears in no tracked file or history (checked with `git grep` and `git log -S`).
- A billing or quota failure currently surfaces to the learner as "the assessor could not be reached." Consider distinguishing it (and alerting operators) so a depleted balance is not mistaken for a transient fault.
