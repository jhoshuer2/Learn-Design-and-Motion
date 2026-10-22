# Progression engine

## Hierarchy
Discipline → Path → Level → Module → Lesson → Knowledge check → Practice task → Module assessment → Level capstone → Evaluation → Progression. Levels: Beginner, Intermediate, Advanced, Professional, per discipline.

## Default thresholds (configurable per item)
Lesson check 80% · module assessment 80% · capstone 85% · mandatory competency minimums defined per rubric criterion.

## Unlock rules
1. A lesson unlocks when all `LessonPrerequisite` targets are complete.
2. A lesson is complete when its required blocks are engaged **and** its knowledge check passed (if it has one). Watch time alone never counts. Mastered content may be skipped via passed placement.
3. Assessment/assignment becomes available only after its required lessons complete.
4. Practical tasks must be submitted where required.
5. Module complete = all required lessons + module assessment passed + all mandatory competencies met.
6. Capstone unlocks when all level modules are complete.
7. Next level unlocks only on a passing capstone **and** mandatory competency checks.
8. Failure creates a remediation record (targeted lessons/exercises derived from failed criteria) and a retry window per resubmission rules.

## Pass calculation
`score = Σ(weight_i × criterionScore_i)` normalised to 0-100. Pass iff `score ≥ threshold` **and** every criterion flagged `mandatory` ≥ its `minScore` **and** no `criticalFailure`. A 95% total with a failed accessibility minimum is a fail.

## Integrity
- Single entry points: `canAccess(user, node)`, `recordQuizAttempt`, `applyEvaluation`, `unlockNext`.
- Transactions + unique `(userId, nodeId)` progress rows make duplicate or concurrent submits idempotent.
- Quiz answer keys never leave the server.
- Every transition writes an `AuditEvent` with actor, inputs, result.


## Levels, capstones and remediation (as built in M4)

**One derivation.** `assessLevel` (`src/lib/progression/level.ts`) reads only persisted facts and answers "has this learner earned this level?". The unlock gate and every screen call it, so the UI cannot say something the server does not enforce.

**A level unlocks only when all of these hold** (re-derived from the database each time, never asserted by a caller):
1. Every visible module in the level is complete: all lessons done **and** its module assessment passed.
2. The capstone is passed: its `Progress(ASSIGNMENT)` row exists and a passing, completed evaluation backs it. The capstone itself needs the weighted total >= the level threshold (85) **and** every mandatory criterion >= its minimum.
3. Every required competency named by the level (`requiredCompetencies`, which must be marked `critical`) has **latest** skill evidence >= 80 (`CRITICAL_COMPETENCY_PASS_MARK`). So a 95% capstone does not unlock past a weak required skill. The level page names the blocker and links the lessons to retake.

**Where it is written.** Only `completeLevelIfEligible` writes a `LEVEL` progress row (a test greps the source to keep it that way). It is called from `applyEvaluation` when a capstone passes (so human overrides use the same path) and from `recheckLevelsAfterEvidence` after a retaken check records new evidence, so a learner is never stuck behind a stale result. It is idempotent and race-safe: the unique `(user, level)` row means exactly one caller creates the `LevelCompletion` and the audit event.

**Level lock.** `isLevelOpen` is enforced in `getLessonAccess` and `getAssignmentAccess`: a tier above Beginner is open only when the previous tier's `LEVEL` row exists (or the learner enrolled at or above that tier). Later tiers with no authored content are shown as "not written yet", never as achievements.

**Completion record, not certificate.** `LevelCompletion` stores a snapshot at award time: each assessed work with score, threshold, rubric slug and version, who assessed it (AI model, human reviewer, or a TEST EVALUATOR labelled as such), the required competencies with their scores, the scope the level covers, and a statement that it is not a professional qualification. Later rubric or content changes cannot alter it. It is never revoked in M4.

**Remediation (capstone only).** Attempts used = completed evaluations. At the base cap (3) the capstone closes and `remediation_required` applies. `startRemediation` derives the lessons behind the failed criteria (falls back to the level's lessons when failed criteria have no competency). `completeRemediation` requires a **passing knowledge check made after the remediation opened** for every required lesson, plus an action plan of 15+ words, then atomically grants 2 more attempts. One reset only (`MAX_RESETS = 1`); after that only a human review route remains. Module assessments are not subject to remediation.

**Skill profile.** From `SkillEvidence` only. A competency is "demonstrated" at the highest tier whose latest evidence is >= 80, "needs improvement" if it has evidence but none that qualifies, and "not assessed" with no evidence. Never defaulted to Beginner. Time on platform is never used.

**Policy defaults that are untested product choices:** competency pass mark 80, capstone threshold 85, one reset, two extra attempts, 15-word action plan.
