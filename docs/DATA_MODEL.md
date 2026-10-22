# Data model

Source of truth: `prisma/schema.prisma`. Relational, explicit constraints; JSON used only for validated, ordered lesson blocks, assignment briefs, quiz payloads and feedback.

## Groups
- **Identity:** User (role LEARNER/REVIEWER/AUTHOR/ADMIN).
- **Curriculum:** Discipline → Path → Level(tier) → Module → Lesson; LessonPrerequisite (DAG), ContentAsset (source + licence required), ModuleUse (shared foundations reused across paths).
- **Checks:** QuizQuestion (answer key server-only), QuizAttempt.
- **Rubrics:** Rubric → RubricVersion (immutable once published) → RubricCriterion (weight, mandatory, minScore, competency).
- **Assessment:** Assignment (practice / module assessment / capstone) → Submission (attempt-numbered, `changesNote`, files as private storage keys) → Evaluation (rubricVersionId, server-computed score, `rawOutput`, `deterministicChecks`, token counts, `supersedesId` for human overrides) → CriterionScore. Appeal (one per evaluation, OPEN/UPHELD/OVERRIDDEN). BlockView records lesson blocks shown, in order.
- **Progression:** Enrollment, Progress (unique per user+node), Competency, SkillEvidence, Certificate.
- **Community:** PortfolioProject (visibility default PRIVATE), PeerReview (no relation to Progress by design).
- **Ops:** AuditEvent.

## Invariants (enforced in code and tests)
- Criterion weights per RubricVersion sum to 100; mandatory criteria have `minScore`.
- Published RubricVersions are never mutated; changes create a new version.
- Evaluation.overallScore/passed are computed by the server, never copied from the model.
- Progress rows are unique per (user, nodeType, nodeId), so transitions are idempotent.
- Skill ratings come from SkillEvidence only, never from time on platform.
