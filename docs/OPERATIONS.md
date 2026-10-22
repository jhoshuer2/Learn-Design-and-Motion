# Operations: background assessment

Assessment runs outside the web request. The web app stores work and queues a job; a **worker** assesses it.

## Run it
- **Long-running host:** `npm run worker` next to `next start`. Run more than one if you like: jobs are claimed with `FOR UPDATE SKIP LOCKED`, so workers never take the same job. `WORKER_CONCURRENCY` (default 2) jobs at a time per worker. SIGTERM stops claiming and lets running jobs finish (up to 30 s).
- **Serverless/cron host:** set `JOBS_TICK_SECRET` and have a scheduler call `POST /api/internal/jobs/tick` with `Authorization: Bearer <secret>` every minute. Same code path, bounded to about 200 s. Without the secret the endpoint returns 404; a wrong secret returns 401.
- Without a worker or tick, submissions stay queued and learners see "waiting to be assessed". Nothing is lost.

## Environment
| Variable | Meaning |
|---|---|
| `ANTHROPIC_API_KEY` | Needed by the **worker** (and tick host), not the web app. Without it the queue pauses as `not_configured`. |
| `EVALUATION_MODEL` | Default `claude-opus-5-5`. |
| `EVAL_MAX_PER_HOUR` | Per-learner hourly cap; over it, jobs wait 10 minutes without using an attempt. |
| `WORKER_CONCURRENCY`, `WORKER_POLL_MS`, `WORKER_PROBE_MS` | Worker tuning (defaults 2, 2000 ms, 5 min). |
| `EVAL_DAILY_BUDGET_USD` | Pause when today's (UTC) estimated spend reaches this. Unset = no cap. |
| `EVAL_PRICE_IN_PER_MTOK`, `EVAL_PRICE_OUT_PER_MTOK` | List prices (USD per million tokens) used for the estimate. Defaults 5 and 25 are assumptions: set your own. |
| `JOBS_TICK_SECRET` | Enables the tick endpoint. |

## Pause reasons (`/admin/assessments`)
- **billing**: the provider reports no credit. Add credit. The worker tries a 1-token probe every 5 minutes and resumes by itself when it works; an administrator can also press Resume.
- **auth**: the key was rejected. Replace the key, restart the worker, then Resume.
- **budget**: daily cap reached. Lifts after midnight UTC or when the cap is raised.
- **not_configured**: the worker has no key.
- **manual**: an administrator paused it.
While paused nothing is scored, no attempts are used, and jobs wait in order. Learners see: "Assessment is temporarily paused. Your work is saved and queued."

## What learners see
Queued (with how many are ahead), being assessed, paused, trying again shortly, or "needs a person to look at it". They never see provider messages. The page polls every 3 s (easing to 10 s, stopping after 10 minutes with a refresh link).

## What needs a person
The attention list shows: refused submissions, jobs that gave up, submissions waiting over an hour with nothing explaining it (stuck), and low-confidence results nobody appealed. A reviewer can **assess it themselves** (`/review/assess/<id>`); an administrator can **try automatic again** (re-queues, no attempt used).

## Roles
Reviewers: read-only operator view, appeals, human first assessment. Administrators: also pause, resume and requeue. Roles are set only with `npm run user:role -- email ROLE`.

## Rotating the API key
Put the new key in the worker's environment, restart the worker (and the tick host), press Resume. Never put the key in the repository, the web app's public config, tests, or logs; error messages are scrubbed of `sk-ant-` strings.

## Not monitored (yet)
No email/Slack/pager alert on pause or failure: check `/admin/assessments`. No dashboards or metrics export. Spend is an estimate from recorded tokens, not an invoice. The queue is in the main database: adequate for early traffic, not for high volume.
