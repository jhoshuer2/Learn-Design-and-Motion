import { Prisma, type EvaluationJob } from "@prisma/client";
import { db } from "@/lib/db";
import { getPause } from "./flags";

/** Retry delays after the 1st, 2nd and 3rd real provider failure. After the last one the job is final. */
export const BACKOFF_MS = [60_000, 5 * 60_000, 20 * 60_000];
/** A running job whose heartbeat is older than this is presumed dead. The provider call itself times out at 120 s. */
export const LEASE_MS = 6 * 60_000;
/** Learner-facing hold-off when the learner's own hourly allowance is used up. */
export const RATE_LIMIT_DEFER_MS = 10 * 60_000;

export class JobError extends Error {
  constructor(public code: "not_found" | "not_assessable", message?: string) { super(message ?? code); }
}

/**
 * Queue a submission for assessment. Idempotent: `activeKey` is unique while a job is QUEUED or RUNNING, so a double
 * click or a retry races to the same single job. Only submissions that are waiting for assessment can be queued.
 */
export async function enqueue(submissionId: string): Promise<{ job: EvaluationJob; created: boolean }> {
  const active = await db.evaluationJob.findUnique({ where: { activeKey: submissionId } });
  if (active) return { job: active, created: false };
  const sub = await db.submission.findUnique({ where: { id: submissionId }, select: { status: true } });
  if (!sub) throw new JobError("not_found");
  if (sub.status !== "SUBMITTED" && sub.status !== "FAILED_TO_EVALUATE") throw new JobError("not_assessable", `Submission is ${sub.status}`);
  try {
    const job = await db.evaluationJob.create({ data: { submissionId, activeKey: submissionId } });
    return { job, created: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { job: await db.evaluationJob.findUniqueOrThrow({ where: { activeKey: submissionId } }), created: false };
    }
    throw e;
  }
}

/**
 * Claim up to `limit` due jobs. `FOR UPDATE SKIP LOCKED` means concurrent workers never block each other and never
 * take the same row. Returns nothing while assessment is paused: paused work stays queued, untouched.
 */
export async function claimNext(workerId: string, limit = 1): Promise<EvaluationJob[]> {
  if (await getPause()) return [];
  return db.$queryRaw<EvaluationJob[]>(Prisma.sql`
    UPDATE "EvaluationJob" SET "status" = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${workerId}
    WHERE "id" IN (
      SELECT "id" FROM "EvaluationJob"
      WHERE "status" = 'QUEUED' AND "runAfter" <= now()
      ORDER BY "runAfter" ASC, "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *`);
}

/** Keep the lease alive while a slow call is in flight. Returns false if the job is no longer ours. */
export async function heartbeat(jobId: string, workerId: string): Promise<boolean> {
  const { count } = await db.evaluationJob.updateMany({ where: { id: jobId, status: "RUNNING", lockedBy: workerId }, data: { lockedAt: new Date() } });
  return count === 1;
}

const final = { activeKey: null, lockedAt: null, lockedBy: null, finishedAt: new Date() } as const;

export const complete = (jobId: string) =>
  db.evaluationJob.updateMany({ where: { id: jobId, status: "RUNNING" }, data: { status: "DONE", ...final, finishedAt: new Date() } });

export const failFinal = (jobId: string, kind: string, message: string) =>
  db.evaluationJob.updateMany({ where: { id: jobId, status: "RUNNING" }, data: { status: "FAILED_FINAL", lastErrorKind: kind, lastErrorMessage: message.slice(0, 500), ...final, finishedAt: new Date() } });

/** Put a running job back without consuming an attempt (paused queue, rate-limit hold-off, recovered crash). */
export const deferWithoutAttempt = (jobId: string, runAfter: Date = new Date()) =>
  db.evaluationJob.updateMany({ where: { id: jobId, status: "RUNNING" }, data: { status: "QUEUED", runAfter, lockedAt: null, lockedBy: null } });

/**
 * A real provider failure: count it, back off, and give up (FAILED_FINAL, for a person to deal with) once the
 * attempts are used.
 */
export async function retryOrFail(jobId: string, kind: string, message: string, now = new Date()): Promise<{ outcome: "retry" | "final"; runAfter?: Date; attempts: number }> {
  const job = await db.evaluationJob.findUnique({ where: { id: jobId } });
  if (!job) throw new JobError("not_found");
  const attempts = job.attempts + 1;
  if (attempts >= job.maxAttempts) {
    await db.evaluationJob.updateMany({ where: { id: jobId, status: "RUNNING" }, data: { status: "FAILED_FINAL", attempts, lastErrorKind: kind, lastErrorMessage: message.slice(0, 500), ...final, finishedAt: new Date() } });
    return { outcome: "final", attempts };
  }
  const runAfter = new Date(now.getTime() + (BACKOFF_MS[attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1]));
  await db.evaluationJob.updateMany({ where: { id: jobId, status: "RUNNING" }, data: { status: "QUEUED", attempts, runAfter, lastErrorKind: kind, lastErrorMessage: message.slice(0, 500), lockedAt: null, lockedBy: null } });
  return { outcome: "retry", runAfter, attempts };
}

/** A failed-final job can be queued again by an operator or by the learner's "try again". */
export async function requeueFinal(submissionId: string) {
  return enqueue(submissionId);
}

export async function queueStats() {
  const [byStatus, oldest] = await Promise.all([
    db.evaluationJob.groupBy({ by: ["status"], _count: true }),
    db.evaluationJob.findFirst({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const n = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  return { queued: n("QUEUED"), running: n("RUNNING"), done: n("DONE"), failedFinal: n("FAILED_FINAL"), oldestQueuedAt: oldest?.createdAt ?? null };
}

/** Jobs that will be picked up before this submission's job (rough: ignores jobs held back by runAfter). */
export async function positionOf(submissionId: string): Promise<number | null> {
  const job = await db.evaluationJob.findUnique({ where: { activeKey: submissionId } });
  if (!job || job.status !== "QUEUED") return null;
  return db.evaluationJob.count({ where: { status: "QUEUED", runAfter: { lte: new Date() }, OR: [{ createdAt: { lt: job.createdAt } }, { createdAt: job.createdAt, id: { lt: job.id } }] } });
}
