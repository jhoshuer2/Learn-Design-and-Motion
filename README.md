# Creative Mastery

Mastery-based creative learning platform. Planning docs live in [`docs/`](docs/); start with `PRD.md` and `ROADMAP.md`.

## Develop
```bash
cp .env.example .env        # set DATABASE_URL and AUTH_SECRET (openssl rand -base64 32)
npm install
npx prisma migrate dev      # create/upgrade the schema
npm run content:validate    # schema-check everything under content/
npm run db:seed             # publish content into the database (idempotent)
npm run dev
```

## Checks
`npm run typecheck` · `npm run lint` · `npm test` (unit) · `npm run build && npm run test:e2e` (Playwright; set `CHROMIUM_PATH` if browsers are preinstalled).

## Rules for contributors
- Access control lives on the server (`src/lib/session.ts`, later `src/lib/progression`). Hiding UI is never the control.
- Curriculum is content under `content/`, never hardcoded in components.
- Published lesson and rubric versions are immutable; bump the version to change them.

## Assessment (M3)
- Set `ANTHROPIC_API_KEY` to enable real assessment (model via `EVALUATION_MODEL`, default `claude-opus-5-5`). Without it, submissions are saved and report "not configured"; no score is ever produced.
- `EVALUATION_PROVIDER=fake` + `ALLOW_FAKE_EVALUATOR=true` enables a **test-only** deterministic evaluator (used by the e2e suite). Its results are labelled TEST EVALUATOR.
- Grant review rights out-of-band: `npm run user:role -- someone@example.com REVIEWER`.
- Uploads use local-disk storage (`UPLOAD_DIR`). Dev only.
