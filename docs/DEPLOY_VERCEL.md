# Deploying a preview to Vercel

This gets the app running on Vercel for **review, not launch**. All content is DRAFT, AI-drafted and unreviewed, so the preview must show it (`CONTENT_PREVIEW=true`) and should not be shared as a real product. The legal pages are drafts too.

## What you need (accounts and services)
1. **A Vercel project** pointed at this repository (branch `claude/focused-cori-cf8jcu` or whichever you choose). Framework: Next.js; `vercel.json` already sets the build command to `npm run vercel-build`.
2. **A Postgres database** reachable from Vercel (Neon, Supabase or Vercel's Postgres marketplace integration). Use a **pooled** connection string for `DATABASE_URL`.
3. **A private S3-compatible bucket** for uploads (Cloudflare R2, AWS S3, Backblaze B2). Do **not** make it public: every read goes through the app's access checks.

## What the build does
`npm run vercel-build` = `prisma generate` → `prisma migrate deploy` (applies the checked-in migrations to the database) → `tsx prisma/seed.ts` (publishes `/content` as DRAFT; safe to repeat, published rubric versions are immutable) → `next build`. Every deploy therefore migrates and re-publishes content. For anything beyond a preview, run migrations as a separate, reviewed step.

## Environment variables (Project Settings → Environment Variables)
| Variable | Value |
|---|---|
| `DATABASE_URL` | pooled Postgres URL |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `CONTENT_PREVIEW` | `true` (otherwise nothing is visible: all content is DRAFT) |
| `APP_URL` | the deployment URL, used in emailed links |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | your bucket (`S3_ENDPOINT` empty for AWS; for R2 use `https://<account>.r2.cloudflarestorage.com`, region `auto`) |
| `JOBS_TICK_SECRET` and `CRON_SECRET` | the **same** random string; enables the grading tick endpoint |
| `ANTHROPIC_API_KEY` | only if you want real grading; leave unset and submissions report "not configured" |
| `EVAL_DAILY_BUDGET_USD` | e.g. `5`, a hard daily cap on estimated spend |
| `TRUST_PROXY` | `true` (Vercel is a proxy you can trust for `x-forwarded-for`) |
| `EMAIL_TRANSPORT` | unset for now: no mail is sent. Without mail, sign-up verification links cannot be delivered, so verified-only actions (sharing, feedback, reports) stay locked for new accounts unless you set up `smtp` or mark an account verified in the database |

Never put real secrets in the repository or paste them into chat; set them in Vercel.

## Grading in the preview
There is no long-running worker on Vercel. Grading runs when `/api/internal/jobs/tick` is called. Pick one:
- **Vercel Pro:** add to `vercel.json`: `"crons": [{ "path": "/api/internal/jobs/tick", "schedule": "* * * * *" }]` (Hobby plans only allow daily crons and reject faster schedules at deploy time, which is why it is not in the file).
- **Any plan:** call it from outside every minute: `curl -X POST -H "Authorization: Bearer $JOBS_TICK_SECRET" https://<your-app>/api/internal/jobs/tick` (GitHub Actions schedule, cron-job.org, etc.).
Until something calls it, submissions stay queued (visible to the learner as waiting).

## Known limits of this setup
- **Upload size:** Vercel functions accept request bodies up to about **4.5 MB**. The app allows up to 8 MB per image through a server action, so large images will fail on Vercel until uploads go direct to the bucket (a code change, not done). Small images work.
- The S3 adapter is unit-tested against an in-memory stand-in only; it has **not** run against a real bucket.
- The worker's 200 s tick budget needs a plan whose function duration allows it (`maxDuration = 300` on the route).
- Migrations at build time can fail a deploy halfway; use a throwaway database for the preview.
- Rate limiting and sessions are database-backed, so they work across serverless instances, but the connection count needs the pooled URL.

## First checks after deploying
Sign up → enrol in a path → open a lesson (demos render) → check a lesson → open `/dashboard`. Submitting work needs the bucket; grading needs the tick.
