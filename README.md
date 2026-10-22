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
