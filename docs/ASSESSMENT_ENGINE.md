# Assessment engine

## Assessment types
MCQ, multi-select, short answer, concept explanation, visual identification, error detection/critique, practical submission (file/image), prototype link, video, documentation, reflection, capstone. Objective types are machine-scored; subjective types go through the rubric evaluator.

## Evaluation workflow
1. Validate submission and required deliverables (reject incomplete before spending model calls).
2. Resolve the assignment and its published `RubricVersion`.
3. Check inspectability: can every required artefact be read (image/PDF/video frames/link content)? If not, return `needs_evidence` listing what to supply (screenshots, exports, recordings).
4. Evaluate each criterion with written evidence tied to something observable in the work.
5. Produce strengths, weaknesses, missing requirements, critical errors.
6. Produce actionable recommendations: what is happening, where, why it matters, which principle, how to improve, how to verify.
7. **Server** recomputes weighted score and mandatory-minimum checks (model totals ignored).
8. Determine pass/fail; persist `Evaluation` + `CriterionScore` with `rubricVersionId`.
9. Call progression `applyEvaluation` — only it may advance state.

## Model output (zod-validated)
```
status: "complete" | "needs_evidence"
missingEvidence: string[]
criteria: [{ criterionId, score(0-100), evidence, explanation, principle, improvement }]
strengths[], weaknesses[], missingRequirements[], criticalFailures[]
confidence: "high"|"medium"|"low"
reviewFlag: boolean
```
Invalid output → retry once with the validation error, then mark `failed` (never a fabricated score).

## Fairness
Rubrics published before submission; objective checks (contrast ratio, dimensions, file format) computed deterministically and passed to the model as facts; no grading on resemblance to a reference; brief, audience, constraints, rationale and execution weighed together; appeals create a human-review task; track repeat-evaluation variance, appeals, and AI-vs-expert agreement.

## Operational
Provider interface, per-call timeout, bounded retries, per-submission token/cost cap, per-user rate limit, structured logs and cost metrics. Without an API key the provider reports `not_configured`.
