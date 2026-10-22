# Roadmap and acceptance criteria

Status legend: ☐ not started · ◐ in progress · ☑ done and verified. Stubs are labelled; nothing mock is presented as working.

## Phase 1: Planning ☑
Docs in this folder + `prisma/schema.prisma`. *Accept:* docs reviewed; schema validates (`prisma validate`).

## M1 Foundation ☐
Scaffold, migrations, auth, roles, seed, content schema validation, tokens/base components. *Accept:* sign up/in works; seed loads the Contrast module; CI green.

## M2 Learning engine ☐
Prerequisites, quiz scoring, lesson completion, dashboard + timeline, full Contrast module content. *Accept:* direct URL/API access to a locked lesson is refused; lesson cannot complete without a passing check; tests cover rules.

## M3 Submissions + AI grading ☐
Private uploads, poster assignment, rubric, provider, validation, server-side scoring, feedback, resubmission. *Accept:* 95% total with failed mandatory criterion fails; malformed model output never yields a score; no-key mode reports `not_configured`.

## M4 Capstone + unlock ☐
Capstone gating, level unlock, remediation, skill profile from evidence. *Accept:* next level unlocks only via passing capstone + mandatory checks; concurrent submits are idempotent.

## M5 Portfolio + peer review ☐
Visibility controls, shareable page, structured peer review. *Accept:* private by default; peer feedback has no effect on progression.

## Later
Admin CMS, Brand + UI paths as content, recommendations, pilot QA with real beginners, other disciplines.
