/**
 * Assessment worker. Claims queued evaluation jobs and runs them. Run one or more:
 *
 *   npm run worker
 *
 * WORKER_CONCURRENCY (default 2) jobs at a time; WORKER_POLL_MS (default 2000) between empty polls;
 * WORKER_PROBE_MS (default 300000) between account health probes while paused for billing/auth.
 * SIGTERM/SIGINT: stop claiming, let running jobs finish (up to 30 s), exit.
 */
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { getPause } from "../src/lib/jobs/flags";
import { probeAndResume, runDueJobs } from "../src/lib/jobs/ops";
import { purgeExpired } from "../src/lib/ratelimit";

const workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 2);
const pollMs = Number(process.env.WORKER_POLL_MS ?? 2000);
const probeMs = Number(process.env.WORKER_PROBE_MS ?? 300_000);
let stopping = false;
let lastPurge = 0;
let lastProbe = Date.now(); // first health probe is one interval after start

const log = (msg: string, extra?: unknown) => console.log(`[${new Date().toISOString()}] ${workerId} ${msg}`, extra ?? "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  log(`started (concurrency ${concurrency})`);
  while (!stopping) {
    try {
      const pause = await getPause();
      if (pause && (pause.reason === "billing" || pause.reason === "auth") && Date.now() - lastProbe >= probeMs) {
        lastProbe = Date.now();
        const r = await probeAndResume();
        log(`paused for ${pause.reason}; probe: ${r}`);
      }
      if (Date.now() - lastPurge >= 3_600_000) {
        lastPurge = Date.now();
        const n = await purgeExpired();
        if (n) log(`purged ${n} expired rate-limit buckets`);
      }
      const s = await runDueJobs({ workerId, concurrency, timeBudgetMs: 60_000, stop: () => stopping });
      if (s.ran || s.reclaimed) log("ran", s);
    } catch (e) {
      log("loop error", e instanceof Error ? e.message : e);
    }
    if (!stopping) await sleep(pollMs);
  }
  log("stopped");
  await db.$disconnect();
}

const shutdown = (sig: string) => {
  log(`${sig}: finishing running jobs`);
  stopping = true;
  setTimeout(() => process.exit(0), 30_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

void main();
