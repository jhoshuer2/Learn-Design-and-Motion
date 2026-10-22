# Architecture decisions

## ADR-1 Stack
Next.js (App Router) + TypeScript + Tailwind; Prisma + PostgreSQL; Auth.js; S3-compatible private storage; Vitest + Playwright.
*Why:* one deployable, strong typing from schema to UI, relational integrity for progression. *Trade-off:* Supabase would give auth/RLS/storage in one product; we chose portable Postgres and keep server-side authorization primary. RLS can be layered on later as defence in depth.

## ADR-2 Content is data, not code
Lessons, quizzes, assignments and rubrics live in `/content` as MDX/YAML, validated by zod schemas and published into the DB by a script. Admin CMS (later) writes the same tables. Every published item has a version; learner records point at the exact version they used.

## ADR-3 Progression is a server-side authority
`src/lib/progression` is the only code that decides access or advances state. Route handlers and server actions call it; the client only renders results. State changes run in a transaction with unique constraints (idempotency) and row locks (concurrency). Every transition writes an `AuditEvent`.

## ADR-4 AI is an assessor, not an authority
`src/lib/assessment` defines `EvaluationProvider`. The model returns criterion scores + evidence as JSON, validated against a schema. The **server recomputes** weighted score, mandatory minimums and pass/fail from published rubric data and ignores model-claimed totals. The model cannot grant access. Evidence gaps return `needs_evidence`, never a guessed score. Low confidence or flagged results route to human review.

## ADR-5 Rubric immutability
Rubrics are versioned; published versions are immutable. Evaluations store `rubricVersionId`.

## Module layout
```
content/            authored curriculum
docs/               planning docs
prisma/             schema + migrations + seed
src/lib/content/    schemas, loader, publisher
src/lib/progression/ access + state transitions
src/lib/assessment/ provider, schema, scoring
src/lib/storage/    signed URLs, upload validation
src/app/            routes (learner, author, admin)
```

## Security model
Server-side authN/Z on every route; roles learner/reviewer/author/admin; ownership checks on submissions and feedback; private bucket + short-lived signed URLs; upload type/size/magic-byte validation; rate limits on submit/evaluate; secrets only server-side; portfolio visibility default private; audit log for admin/progression actions; retention and deletion endpoints.

## Risks
| Risk | Mitigation |
|---|---|
| AI grading inconsistency | Rubric-anchored prompts, repeat-eval variance tracking, expert calibration set, human review path |
| Model cannot inspect Figma/video/3D | Require exports/recordings; `needs_evidence` state |
| Cost per submission | Image downscaling, per-submission token cap, rate limits, cost metrics |
| Content volume/quality | Editorial review checklist, draft/published workflow, AI drafts never auto-publish |
| Prerequisite bypass | Server enforcement + tests that hit endpoints directly |
| Media licensing | Asset records carry licence + source; publish blocked without them |
