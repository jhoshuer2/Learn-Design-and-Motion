# Roadmap and acceptance criteria

Status legend: ☐ not started · ◐ in progress · ☑ done and verified. Stubs are labelled; nothing mock is presented as working.

## Phase 1: Planning ☑
Docs in this folder + `prisma/schema.prisma`. *Accept:* docs reviewed; schema validates (`prisma validate`).

## M1 Foundation ☑ (scoped: see notes)
Scaffold, migrations, auth, roles, seed, content schema validation, tokens/base components. *Accept:* sign up/in works; seed loads the Contrast module; CI green.
**Done:** scaffold, migration, credentials auth (email + password, bcrypt), roles (always server-read), enrollment, content schemas + loader + idempotent publisher with immutability checks, seed, base components, e2e + unit tests.
**Not done / known gaps:** no login rate limiting or password reset yet; no email verification; OAuth providers not added; the Contrast lessons are skeletons (M2 authors them); CI workflow is written but has not run on GitHub yet.

## M2 Learning engine ☑ (scoped: see notes)
Prerequisites, quiz scoring, lesson completion, dashboard + timeline, full Contrast module content. *Accept:* direct URL/API access to a locked lesson is refused; lesson cannot complete without a passing check; tests cover rules.
**Done:** `src/lib/progression` as the only authority (access, ordered block views, server-side check scoring, idempotent completion, derived timeline, evidence-based weak areas); learner view never includes answer keys or explanations before an attempt; content after a check stays closed until it is passed; lesson stepper, My learning timeline and dashboard (where am I / do next / improve); three Contrast lessons with all ten loop blocks, 15 quiz questions and nine purpose-built demos (reading order, button visibility, type readability, grouping, text over video, motion clarity, brand lockup, figure/ground, interactive WCAG contrast lab). Tests: 29 unit/integration (incl. concurrent submits, skip-ahead, locked access, key leakage) and 5 Playwright e2e (incl. axe scan).
**Not done / known gaps:**
- All Contrast content is `DRAFT`, shown to learners only with `CONTENT_PREVIEW=true`. It has not had editorial review. Real-world examples are described generically; licensed screenshots are still needed (see `reviewNotes` in each lesson).
- Task and reflection blocks are shown but not collected or assessed (M3). They do not gate completion.
- No module assessment yet, so a module's "complete" means lessons complete only.
- Knowledge checks are machine-scored choice questions only; a failed check can be retried immediately with the same questions and shows explanations for missed ones (no cool-down, no question rotation).
- No placement/diagnostic, rate limiting, or lesson notes/saved concepts. Level gating (Intermediate) is M4.
- Block "viewed" means the learner pressed Continue; it is not evidence of reading time or understanding.

## M3 Submissions + AI grading ◐ (built and tested with a stand-in evaluator; real model path NOT verified)
Private uploads, poster assignment, rubric, provider, validation, server-side scoring, feedback, resubmission, appeals. *Accept:* 95% total with failed mandatory criterion fails; malformed model output never yields a score; no-key mode reports `not_configured`.
**Done and tested:** published poster rubric v1 (two required criteria) and assignment; private storage and decode-based upload validation; assignment gate (lessons complete, attempts, amend-on-evidence, retry-without-attempt); scoring authority with mandatory minimums; model-output schema that ignores model-claimed totals; deterministic checks; atomic single evaluation under concurrency; one validated retry then `FAILED_TO_EVALUATE` with no score; `not_configured` path; hourly rate limit; `applyEvaluation` as sole writer of assessment progression; module completion requires the assessment; brief and results screens (every state, remediation links, axe clean); appeals and anonymised reviewer tool with uphold/override; owner-only files (404 for others, 401 anonymous). 105 unit/integration tests (several mutation-checked) and 11 Playwright tests.
**Not verified:** the `ClaudeProvider` has **never been called**: there is no `ANTHROPIC_API_KEY` in this environment. It type-checks against the SDK, but whether the API accepts the structured-output schema, how the model scores real posters, prompt-injection resistance, and cost per submission are all unmeasured. Every e2e "result" came from the test-only evaluator.
**Known gaps:**
- Evaluation runs synchronously inside the submit server action (can take minutes). It needs a background job and polling before production.
- Local-disk storage is dev-only. Images only: PDFs, video and prototype links are not inspected.
- No server-side refusal fallback: a model refusal becomes `FAILED_TO_EVALUATE` with a review flag, but nothing lists such submissions for a person, and a learner cannot appeal without a completed evaluation. Low-confidence results are applied and flagged but only reach a reviewer if the learner appeals.
- Appeals: failed results only, one per evaluation, human decision is final, an override cannot revoke a pass, no SLA or notifications. Reviewer role is CLI-only.
- After the third failed attempt only an appeal can proceed (no remediation-reset flow; M4). No cool-down between retries.
- No grading-consistency or AI-vs-expert calibration tracking. The rubric anchors and assignment are unreviewed drafts.
- Per-user rate limit counts evaluation starts from the audit table; it is not a global cost cap.

## M4 Capstone + unlock ◐ (built and tested with the test-only evaluator; real model path still NOT verified)
Capstone gating, level unlock, remediation, skill profile from evidence. *Accept:* next level unlocks only via passing capstone + mandatory checks; concurrent submits are idempotent.
**Done and tested:** a three-piece "Contrast campaign" capstone and rubric (85% pass; contrast, accessible contrast and consistency are required criteria); level definitions with scope statement and required competencies, validated by the loader; capstone access needs every module and module assessment; one `assessLevel` derivation used by the gate and every screen; unlock only in `completeLevelIfEligible`, idempotent under concurrency (6 simultaneous attempts -> one record); required skill must be >= 80 on latest evidence, so a 91-96% capstone does not unlock past a weak required competency, and it unlocks automatically once the skill is demonstrated by retaking the check; level lock enforced in lesson and assignment gates; completion record as an evidence snapshot that names test evaluators and states what it does not show; remediation (one reset, new passing checks required, action plan, two extra attempts granted once); skill profile from evidence only; timeline with all four tiers (later tiers shown as "not written yet"); human override unlocks through the same gate. 138 unit/integration tests (five rules mutation-checked) and 14 Playwright tests (axe clean on the new pages; screenshots reviewed at desktop and 390 px).
**Bugs found while building:** the lesson page hid the knowledge-check form once a lesson was complete, which would have made remediation and "retake to demonstrate the skill" impossible; fixed. Two level-heading display flaws fixed after reviewing screenshots.
**Not verified:** the real `ClaudeProvider` has still never been called (no `ANTHROPIC_API_KEY`). Every capstone result in tests and in the browser came from the test-only evaluator, and the completion record says so.
**Known gaps:**
- One module and one capstone are authored; Intermediate/Advanced/Professional have no content. The record is labelled "Contrast foundations", not "Beginner".
- Thresholds and the reset policy (80, 85, one reset, two extra attempts) are product defaults with no data behind them.
- Remediation re-uses the existing knowledge checks (same questions, retakeable immediately, no cool-down), so it can be passed by repetition; it does not grade any new practice work.
- A learner can pass a lesson check, so "latest evidence" can be refreshed by retaking until it passes; no cool-down or question rotation.
- The record is a database snapshot only: no PDF, share link or verification URL (M5 covers sharing). No expiry or revocation.
- A completion cannot be revoked if later evidence falls below 80.
- No placement/diagnostic, so `enrollment.startTier` is always Beginner.
- A capstone that is passed but blocked by a required skill cannot be resubmitted; the only route is retaking the check. If that skill is only measurable through the capstone (not the check), this would trap the learner. It is true for the current content only because the lesson check covers the required skill.

## M5 Portfolio + peer review ☐
Visibility controls, shareable page, structured peer review. *Accept:* private by default; peer feedback has no effect on progression.

## Later
Admin CMS, Brand + UI paths as content, recommendations, pilot QA with real beginners, other disciplines.
