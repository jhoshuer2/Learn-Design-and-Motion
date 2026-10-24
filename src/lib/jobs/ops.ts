import { db } from "@/lib/db";
import { evaluateSubmission } from "@/lib/assessment/evaluate";
import { POLICY, classifyError } from "@/lib/assessment/errors";
import { NotConfiguredProvider, getProvider, type EvaluationProvider } from "@/lib/assessment/provider";
import { LEASE_MS, RATE_LIMIT_DEFER_MS, claimNext, complete, deferWithoutAttempt, failFinal, heartbeat, retryOrFail } from "./queue";
import { clearPause, getPause, setPause } from "./flags";
import type { EvaluationJob } from "@prisma/client";

const heartbeatMs = () => Number(process.env.JOB_HEARTBEAT_MS ?? 30_000);
/** Same submission reclaimed this many times: it is probably what is crashing the worker. Stop and show a person. */
const MAX_RECLAIMS = 3;
const BUSY_DEFER_MS = 30_000;

export type JobResult = "done" | "deferred" | "paused" | "retry" | "final" | "lost";

/** Run one claimed job to a resting state. Never throws: every outcome ends with the job changed under our lease. */
export async function runJob(job: EvaluationJob, deps: { provider?: EvaluationProvider } = {}): Promise<JobResult> {
  const by = job.lockedBy ?? undefined;
  const beat = setInterval(() => { void heartbeat(job.id, by ?? "").catch(() => {}); }, heartbeatMs());
  try {
    const finalAttempt = job.attempts + 1 >= job.maxAttempts;
    let out;
    try {
      out = await evaluateSubmission(job.submissionId, { provider: deps.provider, finalAttempt });
    } catch (e) {
      // evaluateSubmission only throws on infrastructure faults (database, storage). Treat as a transient failure.
      const pe = classifyError(e);
      const r = await retryOrFail(job.id, pe.kind, pe.message, new Date(), by);
      return r.outcome === "final" ? "final" : "retry";
    }

    switch (out.state) {
      case "evaluated":
      case "needs_evidence":
        await complete(job.id, by);
        return "done";
      case "busy":
        // Someone else (or a recovered crash) holds the submission. Look again shortly; costs nothing.
        await deferWithoutAttempt(job.id, new Date(Date.now() + BUSY_DEFER_MS), by);
        return "deferred";
      case "rate_limited":
        await deferWithoutAttempt(job.id, new Date(Date.now() + RATE_LIMIT_DEFER_MS), by);
        return "deferred";
      case "not_configured":
        await setPause("not_configured", null, "No assessor is configured (ANTHROPIC_API_KEY is not set).");
        await deferWithoutAttempt(job.id, new Date(), by);
        return "paused";
      case "deferred": {
        if (out.kind === "billing" || out.kind === "auth") {
          await setPause(out.kind, null, out.kind === "billing" ? "The assessor account has no credit." : "The assessor rejected our credentials.");
          await deferWithoutAttempt(job.id, new Date(), by);
          return "paused";
        }
        const r = await retryOrFail(job.id, out.kind, `Provider ${out.kind}`, new Date(), by);
        return r.outcome === "final" ? "final" : "retry";
      }
      case "failed": {
        // The evaluation row and FAILED_TO_EVALUATE status are already recorded. Refusals and rejected requests go straight to a person.
        if (out.reason === "provider_refused") {
          await failFinal(job.id, out.kind ?? "refusal", "The assessor declined or rejected this submission.", by);
          return "final";
        }
        if (out.reason === "invalid_output" && job.attempts === 0) {
          const r = await retryOrFail(job.id, "output_invalid", "Output failed validation twice", new Date(), by);
          return r.outcome === "final" ? "final" : "retry";
        }
        if (out.reason === "invalid_output" || (out.kind && POLICY[out.kind].needsHuman)) {
          await failFinal(job.id, out.kind ?? "output_invalid", `Assessment failed: ${out.reason}`, by);
          return "final";
        }
        // The last attempt of a retryable failure: counted, and final because the attempts are used.
        const r = await retryOrFail(job.id, out.kind ?? out.reason, `Assessment failed: ${out.reason}`, new Date(), by);
        return r.outcome === "final" ? "final" : "retry";
      }
    }
  } finally {
    clearInterval(beat);
  }
}

/** Spend recorded today (UTC) from token counts, at the configured per-million-token prices. A list-price estimate. */
export async function spendTodayUsd(now = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const agg = await db.evaluation.aggregate({ where: { provider: "claude", createdAt: { gte: start } }, _sum: { inputTokens: true, outputTokens: true } });
  const priceIn = Number(process.env.EVAL_PRICE_IN_PER_MTOK ?? 4);
  const priceOut = Number(process.env.EVAL_PRICE_OUT_PER_MTOK ?? 20);
  return ((agg._sum.inputTokens ?? 0) * priceIn + (agg._sum.outputTokens ?? 0) * priceOut) / 1_000_000;
}

export const dailyBudgetUsd = () => {
  const v = Number(process.env.EVAL_DAILY_BUDGET_USD);
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** Pause when today's spend reaches the cap; lift a budget pause when it no longer applies (a new day, a raised cap). */
export async function enforceBudget(now = new Date()): Promise<{ spent: number; cap: number | null }> {
  const cap = dailyBudgetUsd();
  const spent = await spendTodayUsd(now);
  const pause = await getPause();
  if (cap !== null && spent >= cap) await setPause("budget", null, `Daily budget of $${cap} reached ($${spent.toFixed(2)} spent).`);
  else if (pause?.reason === "budget") await clearPause(null);
  return { spent, cap };
}

/**
 * Jobs whose lease ran out belong to a worker that died or hung. Put the work back so nobody is stuck:
 * - the assessment finished anyway -> the job is simply done;
 * - the submission is still marked EVALUATING -> release it and queue the job again (a crash is not a provider
 *   failure, so no attempt is used), unless the same job keeps being reclaimed, which goes to a person.
 */
export async function reclaimExpired(leaseMs = LEASE_MS, now = new Date()): Promise<number> {
  const stale = await db.evaluationJob.findMany({ where: { status: "RUNNING", lockedAt: { lt: new Date(now.getTime() - leaseMs) } } });
  let n = 0;
  for (const job of stale) {
    const recovered = await db.$transaction(async (tx) => {
      const fresh = await tx.evaluationJob.updateMany({
        where: { id: job.id, status: "RUNNING", lockedAt: job.lockedAt },
        data: { status: "QUEUED", lockedAt: null, lockedBy: null, runAfter: now },
      });
      if (fresh.count === 0) return false; // heartbeat or finish got there first
      const sub = await tx.submission.findUnique({ where: { id: job.submissionId }, select: { status: true, userId: true } });
      if (sub && sub.status !== "EVALUATING" && sub.status !== "SUBMITTED" && sub.status !== "FAILED_TO_EVALUATE") {
        await tx.evaluationJob.update({ where: { id: job.id }, data: { status: "DONE", activeKey: null, finishedAt: now } });
      } else {
        await tx.submission.updateMany({ where: { id: job.submissionId, status: "EVALUATING" }, data: { status: "SUBMITTED" } });
        await tx.auditEvent.create({ data: { actorId: sub?.userId ?? null, action: "job.reclaimed", subject: `submission:${job.submissionId}`, detail: { jobId: job.id, lockedBy: job.lockedBy } } });
        const reclaims = await tx.auditEvent.count({ where: { action: "job.reclaimed", subject: `submission:${job.submissionId}` } });
        if (reclaims >= MAX_RECLAIMS) {
          await tx.evaluationJob.update({ where: { id: job.id }, data: { status: "FAILED_FINAL", activeKey: null, finishedAt: now, lastErrorKind: "stuck", lastErrorMessage: `Worker lost ${reclaims} times on this submission.` } });
        }
      }
      return true;
    });
    if (recovered) n++;
  }
  return n;
}

/** If the pause was caused by the account, try the cheapest possible call and resume on success. */
export async function probeAndResume(provider?: EvaluationProvider): Promise<"not_paused" | "resumed" | "still_paused"> {
  const pause = await getPause();
  if (!pause) return "not_paused";
  if (pause.reason !== "billing" && pause.reason !== "auth") return "still_paused";
  const p = provider ?? (await getProvider());
  if (p instanceof NotConfiguredProvider || !p.probe) return "still_paused";
  try {
    await p.probe();
  } catch {
    return "still_paused";
  }
  await clearPause(null);
  return "resumed";
}

export type RunSummary = { ran: number; done: number; deferred: number; paused: number; retry: number; final: number; reclaimed: number; stoppedBy: "empty" | "paused" | "time" };

/** The one loop shared by the worker process and the tick endpoint. */
export async function runDueJobs(opts: { workerId: string; concurrency?: number; timeBudgetMs?: number; provider?: EvaluationProvider; stop?: () => boolean }): Promise<RunSummary> {
  const concurrency = Math.max(1, opts.concurrency ?? 2);
  const deadline = Date.now() + (opts.timeBudgetMs ?? 25_000);
  const s: RunSummary = { ran: 0, done: 0, deferred: 0, paused: 0, retry: 0, final: 0, reclaimed: 0, stoppedBy: "empty" };
  s.reclaimed = await reclaimExpired();
  for (;;) {
    if (opts.stop?.()) { s.stoppedBy = "time"; break; }
    if (Date.now() >= deadline) { s.stoppedBy = "time"; break; }
    await enforceBudget();
    if (await getPause()) { s.stoppedBy = "paused"; break; }
    const jobs = await claimNext(opts.workerId, concurrency);
    if (jobs.length === 0) { s.stoppedBy = "empty"; break; }
    const results = await Promise.all(jobs.map((j) => runJob(j, { provider: opts.provider })));
    for (const r of results) {
      s.ran++;
      if (r === "done") s.done++; else if (r === "deferred") s.deferred++; else if (r === "paused") s.paused++;
      else if (r === "retry") s.retry++; else if (r === "final") s.final++;
    }
  }
  return s;
}
