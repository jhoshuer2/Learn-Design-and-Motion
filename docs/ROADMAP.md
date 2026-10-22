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

## M3 Submissions + AI grading ☐
Private uploads, poster assignment, rubric, provider, validation, server-side scoring, feedback, resubmission. *Accept:* 95% total with failed mandatory criterion fails; malformed model output never yields a score; no-key mode reports `not_configured`.

## M4 Capstone + unlock ☐
Capstone gating, level unlock, remediation, skill profile from evidence. *Accept:* next level unlocks only via passing capstone + mandatory checks; concurrent submits are idempotent.

## M5 Portfolio + peer review ☐
Visibility controls, shareable page, structured peer review. *Accept:* private by default; peer feedback has no effect on progression.

## Later
Admin CMS, Brand + UI paths as content, recommendations, pilot QA with real beginners, other disciplines.
