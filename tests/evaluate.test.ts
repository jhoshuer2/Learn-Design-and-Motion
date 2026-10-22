import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import { evaluateSubmission } from "../src/lib/assessment/evaluate";
import { FakeProvider } from "../src/lib/assessment/fake";
import {
  NotConfiguredProvider, ProviderRefusedError, type EvaluationInput, type EvaluationProvider, type ProviderOutput,
} from "../src/lib/assessment/provider";
import { RATIONALE, cleanup, makeSubmission, makeUser, useTempStorage } from "./helpers";

const fake = new FakeProvider();
const assignmentId = async () => (await db.assignment.findUniqueOrThrow({ where: { slug: "high-contrast-event-poster" } })).id;
const progressFor = async (userId: string) =>
  db.progress.count({ where: { userId, nodeType: "ASSIGNMENT", nodeId: await assignmentId() } });
const audits = (userId: string, action: string) => db.auditEvent.count({ where: { actorId: userId, action } });

/** A provider that returns whatever the test says, and counts its calls. */
function stub(fn: (i: EvaluationInput, n: number) => ProviderOutput | Promise<ProviderOutput>): EvaluationProvider & { calls: number } {
  const p = { name: "stub", calls: 0, async evaluate(i: EvaluationInput) { return fn(i, ++p.calls); } };
  return p;
}
const allCriteria = async (i: EvaluationInput, score: number, extra: Record<string, unknown> = {}) =>
  (await fake.evaluate({ ...i, rationale: `[fake:score=${score}]` })).raw as Record<string, unknown> & { criteria: unknown[] } & typeof extra;

beforeAll(async () => {
  await useTempStorage();
  await publishContent(db, loadContent());
});
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("evaluateSubmission", () => {
  it("evaluates, computes the result on the server, and records progression on a pass", async () => {
    const u = await makeUser();
    const s = await makeSubmission(u, { rationale: `${RATIONALE} [fake:score=90]` });
    const out = await evaluateSubmission(s.id, { provider: fake });
    expect(out).toMatchObject({ state: "evaluated", score: 90, passed: true });

    const ev = await db.evaluation.findFirstOrThrow({ where: { submissionId: s.id }, include: { scores: true, rubricVersion: true } });
    expect(ev).toMatchObject({ status: "complete", overallScore: 90, passed: true, provider: "test-only-fake" });
    expect(ev.scores).toHaveLength(6);
    expect(ev.rubricVersion.version).toBe(1);
    expect((await db.submission.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("EVALUATED");
    expect(await progressFor(u)).toBe(1);
    expect(await audits(u, "assignment.pass")).toBe(1);
    expect(await db.skillEvidence.count({ where: { userId: u, source: "EVALUATION" } })).toBeGreaterThan(0);
  });

  it("does not record progression below the pass mark", async () => {
    const u = await makeUser();
    const s = await makeSubmission(u, { rationale: `${RATIONALE} [fake:score=70]` });
    expect(await evaluateSubmission(s.id, { provider: fake })).toMatchObject({ state: "evaluated", score: 70, passed: false });
    expect(await progressFor(u)).toBe(0);
  });

  it("fails a high overall score when a mandatory criterion is below its minimum", async () => {
    const u = await makeUser();
    const s = await makeSubmission(u, { rationale: `${RATIONALE} [fake:mandatory]` });
    const out = await evaluateSubmission(s.id, { provider: fake });
    expect(out).toMatchObject({ state: "evaluated", passed: false });
    expect((out as { score: number }).score).toBeGreaterThanOrEqual(80);
    expect(await progressFor(u)).toBe(0);
    const ev = await db.evaluation.findFirstOrThrow({ where: { submissionId: s.id } });
    expect(JSON.stringify(ev.feedback)).toMatch(/required criterion/);
  });

  it("ignores a model's claimed total and verdict", async () => {
    const u = await makeUser();
    const s = await makeSubmission(u);
    const p = stub(async (i) => ({ raw: { ...(await allCriteria(i, 40)), overallScore: 100, passed: true } }));
    expect(await evaluateSubmission(s.id, { provider: p })).toMatchObject({ state: "evaluated", score: 40, passed: false });
    expect(await progressFor(u)).toBe(0);
  });

  it("retries once with the validation problem, then succeeds", async () => {
    const u = await makeUser();
    const s = await makeSubmission(u);
    const p = stub(async (i, n) => (n === 1 ? { raw: { oops: 1 } } : { raw: await allCriteria(i, 88) }));
    const seen: (string | undefined)[] = [];
    const spy = { ...p, evaluate: async (i: EvaluationInput) => { seen.push(i.retryHint); return p.evaluate(i); } };
    expect(await evaluateSubmission(s.id, { provider: spy })).toMatchObject({ state: "evaluated", score: 88 });
    expect(seen[0]).toBeUndefined();
    expect(seen[1]).toMatch(/status|criteria/);
  });

  it("never fabricates a score when output stays invalid: records a failed evaluation", async () => {
    const u = await makeUser();
    const s = await makeSubmission(u, { rationale: `${RATIONALE} [fake:invalid]` });
    expect(await evaluateSubmission(s.id, { provider: fake })).toEqual({ state: "failed", reason: "invalid_output" });
    const ev = await db.evaluation.findFirstOrThrow({ where: { submissionId: s.id } });
    expect(ev).toMatchObject({ status: "failed", overallScore: null, passed: null });
    expect((await db.submission.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("FAILED_TO_EVALUATE");
    expect(await progressFor(u)).toBe(0);
  });

  it("rejects model scores that do not cover the rubric, and retries", async () => {
    const u = await makeUser();
    const s = await makeSubmission(u);
    const p = stub(async (i) => {
      const raw = await allCriteria(i, 90);
      return { raw: { ...raw, criteria: raw.criteria.slice(1) } }; // drops a criterion every time
    });
    expect(await evaluateSubmission(s.id, { provider: p })).toEqual({ state: "failed", reason: "invalid_output" });
    expect(p.calls).toBe(2);
  });

  it("allows a failed evaluation to be re-run without a new attempt", async () => {
    const u = await makeUser();
    const s = await makeSubmission(u);
    await evaluateSubmission(s.id, { provider: stub(() => ({ raw: "bad" })) });
    expect((await db.submission.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("FAILED_TO_EVALUATE");
    expect(await evaluateSubmission(s.id, { provider: stub(async (i) => ({ raw: await allCriteria(i, 90) })) })).toMatchObject({ state: "evaluated", passed: true });
  });

  it("goes to review state, not a score, when the model refuses", async () => {
    const u = await makeUser();
    const s = await makeSubmission(u);
    const p = stub(() => { throw new ProviderRefusedError("declined"); });
    expect(await evaluateSubmission(s.id, { provider: p })).toEqual({ state: "failed", reason: "provider_refused" });
    expect(await db.evaluation.findFirstOrThrow({ where: { submissionId: s.id } })).toMatchObject({ status: "failed", reviewFlag: true });
  });

  it("does not call the model when required evidence is missing", async () => {
    const u = await makeUser();
    const s = await makeSubmission(u, { withPreview: false });
    const p = stub(() => { throw new Error("must not be called"); });
    const out = await evaluateSubmission(s.id, { provider: p });
    expect(out.state).toBe("needs_evidence");
    expect(p.calls).toBe(0);
    const ev = await db.evaluation.findFirstOrThrow({ where: { submissionId: s.id } });
    expect(ev.missingEvidence.join(" ")).toMatch(/preview/);
    expect((await db.submission.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("NEEDS_EVIDENCE");
  });

  it("honours a model request for more evidence without scoring", async () => {
    const u = await makeUser();
    const s = await makeSubmission(u, { rationale: `${RATIONALE} [fake:evidence]` });
    expect((await evaluateSubmission(s.id, { provider: fake })).state).toBe("needs_evidence");
    expect(await progressFor(u)).toBe(0);
  });

  it("reports not configured, leaves the submission resubmittable, and creates no evaluation", async () => {
    const u = await makeUser();
    const s = await makeSubmission(u);
    expect(await evaluateSubmission(s.id, { provider: new NotConfiguredProvider() })).toEqual({ state: "not_configured" });
    expect((await db.submission.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("SUBMITTED");
    expect(await db.evaluation.count({ where: { submissionId: s.id } })).toBe(0);
  });

  it("evaluates exactly once under concurrent calls", async () => {
    const u = await makeUser();
    const s = await makeSubmission(u);
    const p = stub(async (i) => { await new Promise((r) => setTimeout(r, 50)); return { raw: await allCriteria(i, 92) }; });
    const outs = await Promise.all(Array.from({ length: 6 }, () => evaluateSubmission(s.id, { provider: p })));
    expect(outs.filter((o) => o.state === "evaluated")).toHaveLength(1);
    expect(outs.filter((o) => o.state === "busy")).toHaveLength(5);
    expect(p.calls).toBe(1);
    expect(await db.evaluation.count({ where: { submissionId: s.id } })).toBe(1);
    expect(await audits(u, "assignment.pass")).toBe(1);
  });

  it("applies a per-user hourly rate limit", async () => {
    vi.stubEnv("EVAL_MAX_PER_HOUR", "1");
    try {
      const u = await makeUser();
      const a = await makeSubmission(u, { attempt: 1 });
      const b = await makeSubmission(u, { attempt: 2 });
      expect((await evaluateSubmission(a.id, { provider: fake })).state).toBe("evaluated");
      expect(await evaluateSubmission(b.id, { provider: fake })).toEqual({ state: "rate_limited" });
      expect((await db.submission.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("SUBMITTED");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
