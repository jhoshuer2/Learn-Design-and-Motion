# Data model

Source of truth: `prisma/schema.prisma`. Relational, explicit constraints; JSON used only for validated, ordered lesson blocks, assignment briefs, quiz payloads and feedback.

## Groups
- **Identity:** User (role LEARNER/REVIEWER/AUTHOR/ADMIN).
- **Curriculum:** Discipline → Path → Level(tier) → Module → Lesson; LessonPrerequisite (DAG), ContentAsset (source + licence required), ModuleUse (shared foundations reused across paths).
- **Checks:** QuizQuestion (answer key server-only), QuizAttempt.
- **Rubrics:** Rubric → RubricVersion (immutable once published) → RubricCriterion (weight, mandatory, minScore, competency).
- **Assessment:** Assignment (practice / module assessment / capstone) → Submission (attempt-numbered, `changesNote`, files as private storage keys) → Evaluation (rubricVersionId, server-computed score, `rawOutput`, `deterministicChecks`, token counts, `supersedesId` for human overrides) → CriterionScore. Appeal (one per evaluation, OPEN/UPHELD/OVERRIDDEN). BlockView records lesson blocks shown, in order.
- **Progression:** Enrollment, Progress (unique per user+node; nodeType LESSON | ASSIGNMENT | LEVEL), Competency, SkillEvidence, LevelCompletion (evidence snapshot, deliberately not a "certificate"), Remediation (one row per reset; unique per user+assignment+reset). Level carries `scopeLabel`, `scopeNote` and `requiredCompetencies`.
- **Community:** PortfolioProject (visibility default PRIVATE, random `slug`, `shownFiles`, `moderationHold`), PeerReview (hidden flag, unique per project+reviewer; no relation to Progress by design), ReviewerBlock, Report (project or review). User has `displayName` and a random `portfolioHandle`. See `PRIVACY_AND_SHARING.md`.
- **Safety (M7):** `PortfolioProject.publicApproval` (NONE/PENDING/APPROVED/REJECTED, reviewer, note); Notification (in-app notices); RateBucket (hashed-client counters); TakedownRequest (public complaints, optional contact details removed after 90 days).
- **Ops:** AuditEvent; EvaluationJob (QUEUED/RUNNING/DONE/FAILED_FINAL; `activeKey` unique while active); SystemFlag (e.g. `assessment.paused`).

## Invariants (enforced in code and tests)
- Criterion weights per RubricVersion sum to 100; mandatory criteria have `minScore`.
- Published RubricVersions are never mutated; changes create a new version.
- Evaluation.overallScore/passed are computed by the server, never copied from the model.
- Progress rows are unique per (user, nodeType, nodeId), so transitions are idempotent.
- Skill ratings come from SkillEvidence only, never from time on platform.
