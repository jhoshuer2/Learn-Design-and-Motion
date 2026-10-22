import Anthropic from "@anthropic-ai/sdk";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import { evaluateSubmission } from "../src/lib/assessment/evaluate";
import { FakeProvider } from "../src/lib/assessment/fake";
import { ProviderError, classifyError, learnerMessage } from "../src/lib/assessment/errors";
import { BACKOFF_MS, JobError, claimNext, complete, deferWithoutAttempt, enqueue, failFinal, positionOf, retryOrFail } from "../src/lib/jobs/queue";
import { clearPause, getPause, setPause } from "../src/lib/jobs/flags";
import { RATIONALE, cleanup, makeSubmission, makeUser, useTempStorage } from "./helpers";

const fake = new FakeProvider();

beforeAll(async () => {
  await useTempStorage();
  await publishContent(db, loadContent());
});
afterEach(async () => {
  await db.evaluationJob.deleteMany({});
  await clearPause(null);
});
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

async function sub(marker = "") {
  const u = await makeUser();
  return makeSubmission(u, { rationale: `${RATIONALE} ${marker}` });
}

describe("enqueue", () => {
  it("is idempotent, including under concurrency: one active job per submission", async () => {
    const s = await sub();
    const results = await Promise.all(Array.from({ length: 8 }, () => enqueue(s.id)));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.job.id)).size).toBe(1);
    expect(await db.evaluationJob.count({ where: { submissionId: s.id } })).toBe(1);
  });

  it("allows a new job once the previous one is final", async () => {
    const s = await sub();
    const { job } = await enqueue(s.id);
    const [claimed] = await claimNext("w1");
    expect(claimed.id).toBe(job.id);
    await complete(job.id);
    const again = await enqueue(s.id);
    expect(again.created).toBe(true);
    expect(again.job.id).not.toBe(job.id);
  });

  it("refuses unknown and already-assessed submissions", async () => {
    await expect(enqueue("nope")).rejects.toMatchObject({ code: "not_found" });
    const s = await sub();
    await db.submission.update({ where: { id: s.id }, data: { status: "EVALUATED" } });
    await expect(enqueue(s.id)).rejects.toBeInstanceOf(JobError);
  });
});

describe("claimNext", () => {
  it("gives concurrent claimers distinct jobs and every job exactly once", async () => {
    const subs = await Promise.all(Array.from({ length: 6 }, () => sub()));
    for (const s of subs) await enqueue(s.id);
    const batches = await Promise.all(Array.from({ length: 4 }, (_, i) => claimNext(`w${i}`, 3)));
    const ids = batches.flat().map((j) => j.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(batches.flat().every((j) => j.status === "RUNNING" && j.lockedBy)).toBe(true);
    expect(await claimNext("late")).toEqual([]);
  });

  it("skips rows another worker holds locked instead of waiting for them", async () => {
    const [a, b] = await Promise.all([sub(), sub()]);
    const ja = (await enqueue(a.id)).job;
    await new Promise((r) => setTimeout(r, 5));
    const jb = (await enqueue(b.id)).job;
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const gotLock = new Promise<void>((r) => (locked = r));
    const tx = db.$transaction(async (t) => {
      await t.$queryRaw`SELECT id FROM "EvaluationJob" WHERE id = ${ja.id} FOR UPDATE`;
      locked();
      await held;
    });
    await gotLock;
    const started = Date.now();
    const got = await Promise.race([claimNext("w", 2), new Promise<"blocked">((r) => setTimeout(() => r("blocked"), 3000))]);
    release();
    await tx;
    expect(got).not.toBe("blocked");
    expect(Date.now() - started).toBeLessThan(2500);
    expect((got as { id: string }[]).map((j) => j.id)).toEqual([jb.id]);
  });

  it("respects runAfter", async () => {
    const s = await sub();
    const { job } = await enqueue(s.id);
    await db.evaluationJob.update({ where: { id: job.id }, data: { runAfter: new Date(Date.now() + 60_000) } });
    expect(await claimNext("w")).toEqual([]);
    await db.evaluationJob.update({ where: { id: job.id }, data: { runAfter: new Date(Date.now() - 1000) } });
    expect(await claimNext("w")).toHaveLength(1);
  });

  it("hands out nothing while paused, and the work is intact afterwards", async () => {
    const s = await sub();
    await enqueue(s.id);
    await setPause("billing", null, "credit");
    expect(await claimNext("w")).toEqual([]);
    expect((await db.evaluationJob.findFirstOrThrow({ where: { submissionId: s.id } })).status).toBe("QUEUED");
    await clearPause(null);
    expect(await claimNext("w")).toHaveLength(1);
  });
});

describe("pause flag", () => {
  it("keeps the first reason and audits pause and resume once", async () => {
    const a = await setPause("billing", null, "x");
    const b = await setPause("budget", null, "y");
    expect(b.since).toBe(a.since);
    expect((await getPause())?.reason).toBe("billing");
    expect(await clearPause(null)).toBe(true);
    expect(await clearPause(null)).toBe(false);
    expect(await getPause()).toBeNull();
  });
});

describe("attempt accounting", () => {
  it("backs off on real failures and goes final at the cap", async () => {
    const s = await sub();
    const { job } = await enqueue(s.id);
    const now = new Date("2030-01-01T00:00:00Z");
    for (let i = 0; i < 2; i++) {
      const [c] = await claimNext("w");
      expect(c.id).toBe(job.id);
      const r = await retryOrFail(job.id, "overloaded", "busy", now);
      expect(r).toMatchObject({ outcome: "retry", attempts: i + 1 });
      expect(r.runAfter!.getTime() - now.getTime()).toBe(BACKOFF_MS[i]);
      await db.evaluationJob.update({ where: { id: job.id }, data: { runAfter: new Date(0) } });
    }
    await claimNext("w");
    const last = await retryOrFail(job.id, "overloaded", "busy");
    expect(last).toMatchObject({ outcome: "final", attempts: 3 });
    const row = await db.evaluationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row).toMatchObject({ status: "FAILED_FINAL", activeKey: null, lastErrorKind: "overloaded" });
    expect((await enqueue(s.id)).created).toBe(true);
  });

  it("does not consume an attempt when deferring", async () => {
    const s = await sub();
    const { job } = await enqueue(s.id);
    await claimNext("w");
    await deferWithoutAttempt(job.id, new Date(Date.now() + 1000));
    const row = await db.evaluationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row).toMatchObject({ status: "QUEUED", attempts: 0, lockedBy: null });
  });

  it("failFinal clears the active key and records the kind", async () => {
    const s = await sub();
    const { job } = await enqueue(s.id);
    await claimNext("w");
    await failFinal(job.id, "refusal", "declined");
    expect(await db.evaluationJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "FAILED_FINAL", activeKey: null, lastErrorKind: "refusal" });
  });

  it("reports queue position by creation order", async () => {
    const a = await sub(); const b = await sub();
    await enqueue(a.id); await enqueue(b.id);
    expect(await positionOf(a.id)).toBe(0);
    expect(await positionOf(b.id)).toBe(1);
  });
});

describe("classifyError", () => {
  const err = (status: number, message: string) =>
    Anthropic.APIError.generate(status, { type: "error", error: { type: "invalid_request_error", message } }, message, new Headers());

  it("recognises the exact billing error captured from the live API", () => {
    const k = classifyError(err(400, "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."));
    expect(k.kind).toBe("billing");
    expect(k.policy).toMatchObject({ pauses: true, retryable: false });
  });

  it.each([
    [402, "billing"], [401, "auth"], [403, "auth"], [429, "rate_limit"], [529, "overloaded"], [503, "overloaded"],
    [500, "overloaded"], [504, "timeout"], [400, "bad_request"], [413, "bad_request"], [422, "bad_request"],
  ] as const)("maps HTTP %i to %s", (status, kind) => {
    expect(classifyError(err(status, "nope")).kind).toBe(kind);
  });

  it("maps timeouts and connection errors to timeout, and anything else to unknown", () => {
    expect(classifyError(new Anthropic.APIConnectionTimeoutError()).kind).toBe("timeout");
    expect(classifyError(new Anthropic.APIConnectionError({ message: "down" })).kind).toBe("timeout");
    expect(classifyError(new Error("weird")).kind).toBe("unknown");
  });

  it("passes ProviderError through and scrubs keys", () => {
    const p = new ProviderError("refusal", "no");
    expect(classifyError(p)).toBe(p);
    expect(new ProviderError("auth", "bad key sk-ant-abc123_XYZ here").message).not.toContain("sk-ant-abc123");
  });

  it("never shows provider detail to learners", () => {
    for (const k of ["billing", "auth", "rate_limit", "refusal", "bad_request", "unknown", null] as const) {
      expect(learnerMessage(k)).not.toMatch(/credit|api key|sk-ant|anthropic/i);
    }
  });
});

describe("evaluateSubmission deferral", () => {
  const status = async (id: string) => (await db.submission.findUniqueOrThrow({ where: { id } })).status;
  const evals = (id: string) => db.evaluation.count({ where: { submissionId: id } });

  it.each(["billing", "auth"])("defers on %s even on the final attempt: no score, nothing recorded, submission waiting", async (k) => {
    const s = await sub(`[fake:error=${k}]`);
    const out = await evaluateSubmission(s.id, { provider: fake });
    expect(out).toEqual({ state: "deferred", kind: k });
    expect(await status(s.id)).toBe("SUBMITTED");
    expect(await evals(s.id)).toBe(0);
  });

  it("defers a retryable error only when it is not the final attempt", async () => {
    const s = await sub("[fake:error=overloaded]");
    expect(await evaluateSubmission(s.id, { provider: fake, finalAttempt: false })).toEqual({ state: "deferred", kind: "overloaded" });
    expect(await status(s.id)).toBe("SUBMITTED");
    const out = await evaluateSubmission(s.id, { provider: fake, finalAttempt: true });
    expect(out.state).toBe("failed");
    expect(await status(s.id)).toBe("FAILED_TO_EVALUATE");
  });

  it("deferred runs do not count towards the learner's hourly limit", async () => {
    const s = await sub("[fake:error=billing]");
    for (let i = 0; i < 12; i++) expect((await evaluateSubmission(s.id, { provider: fake })).state).toBe("deferred");
  });
});
