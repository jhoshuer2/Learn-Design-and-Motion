import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import { evaluateSubmission } from "../src/lib/assessment/evaluate";
import { FakeProvider } from "../src/lib/assessment/fake";
import { ReviewError } from "../src/lib/review";
import { humanAssess, listAttention } from "../src/lib/review/assess";
import { AdminError, adminPause, adminRequeue, adminResume } from "../src/lib/jobs/admin";
import { claimNext, enqueue, failFinal } from "../src/lib/jobs/queue";
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

const reviewer = async (role: "REVIEWER" | "ADMIN" = "REVIEWER") => {
  const id = await makeUser({ role, enroll: false });
  return { id, role };
};
const criteria = async () => {
  const a = await db.assignment.findUniqueOrThrow({ where: { slug: "high-contrast-event-poster" }, include: { rubricVersion: { include: { criteria: true } } } });
  return a.rubricVersion.criteria;
};
const scoresAt = async (n: number) => (await criteria()).map((c) => ({ criterionId: c.id, score: n, comment: `Looked at ${c.title}.` }));
/** A refused submission: failed, final, waiting for a person. */
async function refused() {
  const learner = await makeUser();
  const s = await makeSubmission(learner, { rationale: `${RATIONALE} [fake:error=refusal]` });
  await enqueue(s.id);
  await claimNext("w");
  await evaluateSubmission(s.id, { provider: fake });
  const job = await db.evaluationJob.findFirstOrThrow({ where: { submissionId: s.id } });
  await failFinal(job.id, "refusal", "declined");
  return { learner, s };
}

describe("humanAssess", () => {
  it("scores refused work through the normal scorer and progression path, and audits it", async () => {
    const { learner, s } = await refused();
    const r = await reviewer();
    const out = await humanAssess(r, s.id, { note: "A clear poster with a strong hierarchy.", scores: await scoresAt(90) });
    expect(out).toMatchObject({ score: 90, passed: true });
    const ev = await db.evaluation.findUniqueOrThrow({ where: { id: out.evaluationId } });
    expect(ev).toMatchObject({ provider: "human", humanReviewed: true, status: "complete", overallScore: 90 });
    expect((await db.submission.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("EVALUATED");
    const asg = await db.assignment.findUniqueOrThrow({ where: { slug: "high-contrast-event-poster" } });
    expect((await db.progress.findFirstOrThrow({ where: { userId: learner, nodeType: "ASSIGNMENT", nodeId: asg.id } })).state).toBe("COMPLETED");
    expect(await db.auditEvent.count({ where: { actorId: r.id, action: "assessment.human_first" } })).toBe(1);
  });

  it("computes the result on the server: a high average with a failed required criterion fails", async () => {
    const { s } = await refused();
    const cs = await criteria();
    const scores = cs.map((c) => ({ criterionId: c.id, score: c.mandatory ? 10 : 100, comment: "Seen it clearly." }));
    const out = await humanAssess(await reviewer(), s.id, { note: "Contrast is not good enough yet.", scores });
    expect(out.passed).toBe(false);
  });

  it("refuses learners, own work, incomplete scoring and missing reasons", async () => {
    const { s } = await refused();
    const learnerId = await makeUser();
    await expect(humanAssess({ id: learnerId, role: "LEARNER" }, s.id, { note: "A fine note here.", scores: await scoresAt(80) })).rejects.toMatchObject({ code: "forbidden" });
    const own = await makeUser({ role: "REVIEWER" });
    const mine = await makeSubmission(own, { status: "SUBMITTED" });
    await expect(humanAssess({ id: own, role: "REVIEWER" }, mine.id, { note: "A fine note here.", scores: await scoresAt(80) })).rejects.toMatchObject({ code: "own_submission" });
    const r = await reviewer();
    await expect(humanAssess(r, s.id, { note: "A fine note here.", scores: (await scoresAt(80)).slice(1) })).rejects.toMatchObject({ code: "invalid_scores" });
    await expect(humanAssess(r, s.id, { note: "A fine note here.", scores: (await scoresAt(80)).map((x) => ({ ...x, comment: "" })) })).rejects.toMatchObject({ code: "comment_required" });
    await expect(humanAssess(r, s.id, { note: "short", scores: await scoresAt(80) })).rejects.toBeInstanceOf(ReviewError);
    await expect(humanAssess(r, s.id, { note: "A fine note here.", scores: (await scoresAt(80)).map((x) => ({ ...x, score: 140 })) })).rejects.toMatchObject({ code: "invalid_scores" });
    expect((await db.submission.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("FAILED_TO_EVALUATE"); // nothing was taken
  });

  it("refuses work that already has a completed assessment (that is an appeal)", async () => {
    const u = await makeUser();
    const s = await makeSubmission(u, { rationale: `${RATIONALE} [fake:score=50]` });
    await evaluateSubmission(s.id, { provider: fake });
    await expect(humanAssess(await reviewer(), s.id, { note: "A fine note here.", scores: await scoresAt(90) })).rejects.toMatchObject({ code: "not_assessable" });
    expect(await db.evaluation.count({ where: { submissionId: s.id, provider: "human" } })).toBe(0);
  });

  it.each(["EVALUATING", "NEEDS_EVIDENCE"] as const)("refuses work that is %s: a worker has it, or the learner owes evidence", async (status) => {
    const s = await makeSubmission(await makeUser());
    await db.submission.update({ where: { id: s.id }, data: { status } });
    await expect(humanAssess(await reviewer(), s.id, { note: "A fine note here.", scores: await scoresAt(80) })).rejects.toMatchObject({ code: "not_assessable" });
    expect((await db.submission.findUniqueOrThrow({ where: { id: s.id } })).status).toBe(status);
  });

  it("two reviewers cannot both assess it", async () => {
    const { s } = await refused();
    const sc = await scoresAt(85);
    const rs = await Promise.allSettled([reviewer(), reviewer()].map(async (p) => humanAssess(await p, s.id, { note: "A fine note here.", scores: sc })));
    expect(rs.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.evaluation.count({ where: { submissionId: s.id, provider: "human" } })).toBe(1);
  });

  it("takes a still-queued submission away from the automatic assessor", async () => {
    const u = await makeUser();
    const s = await makeSubmission(u);
    const { job } = await enqueue(s.id);
    await humanAssess(await reviewer(), s.id, { note: "A fine note here.", scores: await scoresAt(88) });
    expect(await db.evaluationJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "DONE", activeKey: null });
    expect(await claimNext("w")).toEqual([]);
  });
});

describe("listAttention", () => {
  it("lists refused work, flagged results nobody appealed, and hides what the system is already retrying", async () => {
    const { s: refusedSub } = await refused();
    const u = await makeUser();
    const flagged = await makeSubmission(u, { rationale: `${RATIONALE} [fake:score=60]` });
    await evaluateSubmission(flagged.id, { provider: fake });
    await db.evaluation.updateMany({ where: { submissionId: flagged.id }, data: { reviewFlag: true } });
    const retrying = await makeSubmission(await makeUser(), { rationale: RATIONALE });
    await enqueue(retrying.id);
    const items = await listAttention({ role: "REVIEWER" });
    const byId = new Map(items.map((i) => [i.submissionId, i.kind]));
    expect(byId.get(refusedSub.id)).toBe("failed_final");
    expect(byId.get(flagged.id)).toBe("low_confidence");
    expect(byId.has(retrying.id)).toBe(false);
    expect(JSON.stringify(items)).not.toContain("@test.local");
  });

  it("is for reviewers only", async () => {
    await expect(listAttention({ role: "LEARNER" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("does not report slow work as stuck while the queue is deliberately paused", async () => {
    const s = await makeSubmission(await makeUser());
    await enqueue(s.id);
    const later = new Date(Date.now() + 3 * 3600_000);
    expect((await listAttention({ role: "ADMIN" }, later)).some((i) => i.submissionId === s.id && i.kind === "stuck")).toBe(true);
    await setPause("billing", null);
    expect((await listAttention({ role: "ADMIN" }, later)).some((i) => i.submissionId === s.id)).toBe(false);
  });
});

describe("operator actions", () => {
  it("only an administrator can pause, resume or requeue, and each is audited", async () => {
    const rev = await reviewer("REVIEWER");
    const adm = await reviewer("ADMIN");
    await expect(adminPause(rev)).rejects.toBeInstanceOf(AdminError);
    await expect(adminResume(rev)).rejects.toBeInstanceOf(AdminError);
    await expect(adminRequeue(rev, "x")).rejects.toBeInstanceOf(AdminError);
    await adminPause(adm);
    expect((await getPause())?.reason).toBe("manual");
    expect(await adminResume(adm)).toBe(true);
    const { s } = await refused();
    const r = await adminRequeue(adm, s.id);
    expect(r.created).toBe(true);
    expect(await db.auditEvent.count({ where: { actorId: adm.id, action: { in: ["assessment.paused", "assessment.resumed", "assessment.requeued"] } } })).toBe(3);
  });
});
