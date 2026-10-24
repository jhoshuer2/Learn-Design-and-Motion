import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import { FakeProvider } from "../src/lib/assessment/fake";
import { claimNext, enqueue } from "../src/lib/jobs/queue";
import { clearPause, getPause, setPause } from "../src/lib/jobs/flags";
import { enforceBudget, probeAndResume, reclaimExpired, runDueJobs, spendTodayUsd } from "../src/lib/jobs/ops";
import { POST as tick } from "../src/app/api/internal/jobs/tick/route";
import { RATIONALE, cleanup, makeSubmission, makeUser, useTempStorage } from "./helpers";

const fake = new FakeProvider();

beforeAll(async () => {
  await useTempStorage();
  await publishContent(db, loadContent());
});
afterEach(async () => {
  await db.evaluationJob.deleteMany({});
  await clearPause(null);
  delete process.env.EVAL_DAILY_BUDGET_USD;
  delete process.env.JOBS_TICK_SECRET;
  delete process.env.FAKE_PROBE_FAIL;
});
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

async function queued(marker = "") {
  const u = await makeUser();
  const s = await makeSubmission(u, { rationale: `${RATIONALE} ${marker}` });
  const { job } = await enqueue(s.id);
  return { s, job, u };
}
const run = () => runDueJobs({ workerId: "t", concurrency: 3, provider: fake, timeBudgetMs: 20_000 });
const job = (id: string) => db.evaluationJob.findUniqueOrThrow({ where: { id } });
const sub = (id: string) => db.submission.findUniqueOrThrow({ where: { id } });

describe("runDueJobs", () => {
  it("assesses queued work and finishes the jobs", async () => {
    const a = await queued("[fake:score=90]"); const b = await queued("[fake:score=40]");
    const sum = await run();
    expect(sum).toMatchObject({ ran: 2, done: 2, stoppedBy: "empty" });
    expect((await sub(a.s.id)).status).toBe("EVALUATED");
    expect((await job(b.job.id)).status).toBe("DONE");
    expect(await db.evaluation.count({ where: { submissionId: a.s.id, status: "complete" } })).toBe(1);
  });

  it("needs_evidence is a finished job, not a failure", async () => {
    const a = await queued("[fake:evidence]");
    await run();
    expect((await sub(a.s.id)).status).toBe("NEEDS_EVIDENCE");
    expect((await job(a.job.id)).status).toBe("DONE");
  });

  it("a billing error pauses the queue: nothing scored, no attempt used, work intact, then it resumes in order", async () => {
    const a = await queued("[fake:billing=1] [fake:score=90]");
    const b = await queued("[fake:score=90]");
    const sum = await run();
    expect(sum.paused).toBeGreaterThanOrEqual(1);
    expect((await getPause())?.reason).toBe("billing");
    for (const x of [a, b]) {
      const j = await job(x.job.id);
      expect(j.status === "QUEUED" || j.status === "DONE").toBe(true);
      expect(j.attempts).toBe(0);
    }
    expect(await db.evaluation.count({ where: { submissionId: a.s.id } })).toBe(0);
    expect((await sub(a.s.id)).status).toBe("SUBMITTED");
    expect((await run()).ran).toBe(0); // still paused
    await clearPause(null);
    await run();
    expect((await sub(a.s.id)).status).toBe("EVALUATED");
    expect((await sub(b.s.id)).status).toBe("EVALUATED");
  });

  it("auth pauses too", async () => {
    await queued("[fake:error=auth]");
    await run();
    expect((await getPause())?.reason).toBe("auth");
  });

  it("transient errors retry with backoff, then recover without a failed evaluation", async () => {
    const a = await queued("[fake:flaky=1]");
    await run();
    let j = await job(a.job.id);
    expect(j).toMatchObject({ status: "QUEUED", attempts: 1, lastErrorKind: "overloaded" });
    expect(j.runAfter.getTime()).toBeGreaterThan(Date.now() + 50_000);
    expect(await db.evaluation.count({ where: { submissionId: a.s.id } })).toBe(0);
    await db.evaluationJob.update({ where: { id: j.id }, data: { runAfter: new Date(0) } });
    await run();
    j = await job(a.job.id);
    expect(j.status).toBe("DONE");
    expect((await sub(a.s.id)).status).toBe("EVALUATED");
  });

  it("a persistent transient error ends final after three attempts with a failed evaluation for a person", async () => {
    const a = await queued("[fake:error=overloaded]");
    for (let i = 0; i < 3; i++) {
      await db.evaluationJob.update({ where: { id: a.job.id }, data: { runAfter: new Date(0) } });
      await run();
    }
    const j = await job(a.job.id);
    expect(j).toMatchObject({ status: "FAILED_FINAL", attempts: 3, activeKey: null });
    expect((await sub(a.s.id)).status).toBe("FAILED_TO_EVALUATE");
    expect(await db.evaluation.count({ where: { submissionId: a.s.id, status: "failed" } })).toBe(1);
  });

  it("a refusal is final at once and flagged for review", async () => {
    const a = await queued("[fake:error=refusal]");
    await run();
    expect(await job(a.job.id)).toMatchObject({ status: "FAILED_FINAL", attempts: 0 });
    expect((await sub(a.s.id)).status).toBe("FAILED_TO_EVALUATE");
    expect((await db.evaluation.findFirstOrThrow({ where: { submissionId: a.s.id } })).reviewFlag).toBe(true);
  });

  it("invalid output gets one more job attempt, then goes to a person", async () => {
    const a = await queued("[fake:invalid]");
    await run();
    expect(await job(a.job.id)).toMatchObject({ status: "QUEUED", attempts: 1 });
    await db.evaluationJob.update({ where: { id: a.job.id }, data: { runAfter: new Date(0) } });
    await run();
    expect(await job(a.job.id)).toMatchObject({ status: "FAILED_FINAL" });
    expect((await sub(a.s.id)).status).toBe("FAILED_TO_EVALUATE");
  });

  it("a learner at their hourly limit is held back without using an attempt", async () => {
    const a = await queued();
    const prev = process.env.EVAL_MAX_PER_HOUR;
    process.env.EVAL_MAX_PER_HOUR = "0";
    try { await run(); } finally { if (prev === undefined) delete process.env.EVAL_MAX_PER_HOUR; else process.env.EVAL_MAX_PER_HOUR = prev; }
    const j = await job(a.job.id);
    expect(j).toMatchObject({ status: "QUEUED", attempts: 0 });
    expect(j.runAfter.getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
  });
});

describe("reclaimExpired", () => {
  it("resets an orphaned EVALUATING submission and requeues the job without using an attempt", async () => {
    const a = await queued();
    await claimNext("dead-worker");
    await db.submission.update({ where: { id: a.s.id }, data: { status: "EVALUATING" } });
    await db.evaluationJob.update({ where: { id: a.job.id }, data: { lockedAt: new Date(Date.now() - 10 * 60_000) } });
    expect(await reclaimExpired()).toBe(1);
    expect(await job(a.job.id)).toMatchObject({ status: "QUEUED", attempts: 0, lockedBy: null });
    expect((await sub(a.s.id)).status).toBe("SUBMITTED");
    await run();
    expect((await sub(a.s.id)).status).toBe("EVALUATED");
  });

  it("leaves a live job alone", async () => {
    const a = await queued();
    await claimNext("alive");
    expect(await reclaimExpired()).toBe(0);
    expect((await job(a.job.id)).status).toBe("RUNNING");
  });

  it("marks a job done, without running it again, when its evaluation was already saved", async () => {
    const a = await queued("[fake:score=90]");
    await claimNext("dead-worker");
    // The worker finished the assessment but died before closing the job.
    const { evaluateSubmission } = await import("../src/lib/assessment/evaluate");
    await evaluateSubmission(a.s.id, { provider: fake });
    await db.evaluationJob.update({ where: { id: a.job.id }, data: { lockedAt: new Date(Date.now() - 10 * 60_000) } });
    await reclaimExpired();
    expect((await job(a.job.id)).status).toBe("DONE");
    expect(await db.evaluation.count({ where: { submissionId: a.s.id } })).toBe(1);
  });

  it("stops requeueing a submission that keeps killing workers", async () => {
    const a = await queued();
    for (let i = 0; i < 3; i++) {
      await db.evaluationJob.update({ where: { id: a.job.id }, data: { runAfter: new Date(0) } });
      await claimNext("dead");
      await db.submission.update({ where: { id: a.s.id }, data: { status: "EVALUATING" } });
      await db.evaluationJob.update({ where: { id: a.job.id }, data: { lockedAt: new Date(Date.now() - 10 * 60_000) } });
      await reclaimExpired();
    }
    expect(await job(a.job.id)).toMatchObject({ status: "FAILED_FINAL", lastErrorKind: "stuck" });
  });

  it("a stale worker cannot close a job another worker now holds", async () => {
    const a = await queued();
    await claimNext("old");
    await db.evaluationJob.update({ where: { id: a.job.id }, data: { lockedAt: new Date(Date.now() - 10 * 60_000) } });
    await reclaimExpired();
    await claimNext("new");
    const { complete } = await import("../src/lib/jobs/queue");
    expect((await complete(a.job.id, "old")).count).toBe(0);
    expect((await job(a.job.id)).status).toBe("RUNNING");
  });
});

describe("daily budget", () => {
  const spend = async (inTok: number, outTok: number) => {
    const a = await queued();
    await db.evaluation.create({ data: { submissionId: a.s.id, rubricVersionId: (await db.assignment.findUniqueOrThrow({ where: { id: a.s.assignmentId } })).rubricVersionId, provider: "claude", status: "failed", feedback: {}, inputTokens: inTok, outputTokens: outTok } });
  };

  it("estimates spend from recorded tokens at the configured prices", async () => {
    const before = await spendTodayUsd();
    await spend(1_000_000, 100_000);
    expect((await spendTodayUsd()) - before).toBeCloseTo(4 + 2, 5);
  });

  it("pauses at the cap, and lifts the pause when the cap is raised", async () => {
    await spend(1_000_000, 0);
    process.env.EVAL_DAILY_BUDGET_USD = "1";
    await enforceBudget();
    expect((await getPause())?.reason).toBe("budget");
    process.env.EVAL_DAILY_BUDGET_USD = "100000";
    await enforceBudget();
    expect(await getPause()).toBeNull();
  });

  it("does not touch a billing pause when no cap is set", async () => {
    await setPause("billing", null);
    await enforceBudget();
    expect((await getPause())?.reason).toBe("billing");
  });

  it("a budget pause stops the runner from claiming", async () => {
    await spend(1_000_000, 0);
    process.env.EVAL_DAILY_BUDGET_USD = "1";
    const a = await queued();
    const sum = await run();
    expect(sum).toMatchObject({ ran: 0, stoppedBy: "paused" });
    expect((await job(a.job.id)).status).toBe("QUEUED");
  });
});

describe("probeAndResume", () => {
  it("resumes a billing pause when the account works again, and not before", async () => {
    await setPause("billing", null);
    process.env.FAKE_PROBE_FAIL = "billing";
    expect(await probeAndResume(fake)).toBe("still_paused");
    delete process.env.FAKE_PROBE_FAIL;
    expect(await probeAndResume(fake)).toBe("resumed");
    expect(await getPause()).toBeNull();
  });

  it("never auto-resumes a manual or budget pause", async () => {
    await setPause("manual", null);
    expect(await probeAndResume(fake)).toBe("still_paused");
  });
});

describe("tick endpoint", () => {
  const call = (auth?: string) => tick(new Request("http://x/api/internal/jobs/tick", { method: "POST", headers: auth ? { authorization: auth } : {} }));

  it("does not exist without a secret", async () => {
    expect((await call("Bearer anything")).status).toBe(404);
  });
  it("rejects missing and wrong secrets", async () => {
    process.env.JOBS_TICK_SECRET = "s3cret-value";
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call("Bearer s3cret-value-longer")).status).toBe(401);
  });
  it("runs due jobs with the right secret", async () => {
    process.env.JOBS_TICK_SECRET = "s3cret-value";
    const prev = process.env.EVALUATION_PROVIDER;
    process.env.EVALUATION_PROVIDER = "fake";
    try {
      const a = await queued("[fake:score=90]");
      const res = await call("Bearer s3cret-value");
      expect(res.status).toBe(200);
      expect((await res.json()).done).toBeGreaterThanOrEqual(1);
      expect((await sub(a.s.id)).status).toBe("EVALUATED");
    } finally {
      if (prev === undefined) delete process.env.EVALUATION_PROVIDER; else process.env.EVALUATION_PROVIDER = prev;
    }
  });
});
