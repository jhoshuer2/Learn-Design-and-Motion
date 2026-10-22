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
