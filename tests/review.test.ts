import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import { evaluateSubmission } from "../src/lib/assessment/evaluate";
import { FakeProvider } from "../src/lib/assessment/fake";
import { getAssignmentAccess } from "../src/lib/progression";
import { ReviewError, createAppeal, listOpenAppeals, resolveAppeal } from "../src/lib/review";
import { createSubmission } from "../src/lib/submissions";
import { getSubmissionView } from "../src/lib/submissions/view";
import { RATIONALE, cleanup, makeUser, useTempStorage } from "./helpers";

const fake = new FakeProvider();
let assignmentId: string;

const img = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#118833" } }).png().toBuffer();
async function lessons(userId: string) {
  const ls = await db.lesson.findMany({ where: { module: { slug: "understanding-contrast" } }, select: { id: true } });
  await db.progress.createMany({ data: ls.map((l) => ({ userId, nodeType: "LESSON", nodeId: l.id, state: "COMPLETED" as const, completedAt: new Date() })), skipDuplicates: true });
}
async function failedSubmission(marker = "[fake:score=60]", changes?: string) {
  const u = await makeUser();
  await lessons(u);
  return submit(u, marker, changes);
}
async function submit(u: string, marker: string, changes?: string) {
  const { submissionId } = await createSubmission(u, assignmentId, {
    files: [{ slot: "final", name: "p.png", data: await img(800, 1200) }, { slot: "preview", name: "s.png", data: await img(267, 400) }],
    rationale: `${RATIONALE} ${marker}`, changesNote: changes,
  });
  const out = await evaluateSubmission(submissionId, { provider: fake });
  if (out.state !== "evaluated") throw new Error(`expected evaluated, got ${out.state}`);
  return { u, submissionId, evaluationId: out.evaluationId };
}
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof ReviewError ? e.code : `other:${e}`));
const REASON = "The hierarchy is clear in the poster, I think the contrast score missed the stronger date block.";

async function reviewer() {
  const id = await makeUser({ role: "REVIEWER", enroll: false });
  return { id, role: "REVIEWER" as const };
}
async function allScores(evaluationId: string, over: Record<string, number> = {}) {
  const ev = await db.evaluation.findUniqueOrThrow({ where: { id: evaluationId }, include: { scores: { include: { criterion: true } } } });
  return ev.scores.map((s) => ({ criterionId: s.criterionId, score: over[s.criterion.key] ?? s.score, comment: over[s.criterion.key] !== undefined ? "Reviewer disagrees with this score." : undefined }));
}

beforeAll(async () => {
  await useTempStorage();
  process.env.CONTENT_PREVIEW = "true";
  await publishContent(db, loadContent());
  assignmentId = (await db.assignment.findUniqueOrThrow({ where: { slug: "high-contrast-event-poster" } })).id;
});
afterAll(async () => { await cleanup(); await db.$disconnect(); });

describe("creating an appeal", () => {
  it("holds the submission for review and blocks a new attempt meanwhile", async () => {
    const { u, submissionId, evaluationId } = await failedSubmission();
    await createAppeal(u, evaluationId, REASON);
    expect((await db.submission.findUniqueOrThrow({ where: { id: submissionId } })).status).toBe("IN_HUMAN_REVIEW");
    expect(await getAssignmentAccess(u, assignmentId)).toMatchObject({ allowed: false, reason: "in_progress", submissionId });
  });

  it("is only for a failed, AI-produced, latest result", async () => {
    const passed = await failedSubmission("[fake:score=92]");
    expect(await code(createAppeal(passed.u, passed.evaluationId, REASON))).toBe("not_appealable");
  });

  it("is refused for someone else's evaluation, and for a vague reason", async () => {
    const a = await failedSubmission();
    const b = await makeUser();
    expect(await code(createAppeal(b, a.evaluationId, REASON))).toBe("not_found");
    expect(await code(createAppeal(a.u, a.evaluationId, "unfair"))).toBe("reason_required");
  });

  it("can be filed once, even by a double click", async () => {
    const a = await failedSubmission();
    const r = await Promise.all([code(createAppeal(a.u, a.evaluationId, REASON)), code(createAppeal(a.u, a.evaluationId, REASON))]);
    expect(r.filter((x) => x === "ok")).toHaveLength(1);
    expect(await db.appeal.count({ where: { evaluationId: a.evaluationId } })).toBe(1);
  });
});

describe("who may review", () => {
  it("refuses learners, and reviewers on their own work", async () => {
    const a = await failedSubmission();
    const appeal = await createAppeal(a.u, a.evaluationId, REASON);
    await expect(listOpenAppeals({ role: "LEARNER" })).rejects.toMatchObject({ code: "forbidden" });
    expect(await code(resolveAppeal({ id: a.u, role: "LEARNER" }, appeal.id, { decision: "uphold", note: "Confirmed as scored." }))).toBe("forbidden");
    // a reviewer who is also the owner
    await db.user.update({ where: { id: a.u }, data: { role: "REVIEWER" } });
    expect(await code(resolveAppeal({ id: a.u, role: "REVIEWER" }, appeal.id, { decision: "uphold", note: "Confirmed as scored." }))).toBe("own_submission");
  });

  it("lists open appeals without learner identity", async () => {
    const a = await failedSubmission();
    await createAppeal(a.u, a.evaluationId, REASON);
    const list = await listOpenAppeals(await reviewer());
    expect(list.length).toBeGreaterThan(0);
    expect(JSON.stringify(list)).not.toMatch(/@test\.local|email|userId/);
  });
});

describe("resolving an appeal", () => {
  it("upholds: no new evaluation, no progress, and the learner is told why", async () => {
    const a = await failedSubmission();
    const appeal = await createAppeal(a.u, a.evaluationId, REASON);
    const rv = await reviewer();
    await resolveAppeal(rv, appeal.id, { decision: "uphold", note: "The contrast really is below the bar." });
    expect(await db.appeal.findUniqueOrThrow({ where: { id: appeal.id } })).toMatchObject({ status: "UPHELD", reviewerId: rv.id });
    expect(await db.evaluation.count({ where: { submissionId: a.submissionId } })).toBe(1);
    expect(await db.progress.count({ where: { userId: a.u, nodeType: "ASSIGNMENT" } })).toBe(0);
    const v = await getSubmissionView({ id: a.u, role: "LEARNER" }, a.submissionId);
    expect(v?.appeal).toMatchObject({ status: "UPHELD", resolution: "The contrast really is below the bar." });
    expect(v?.status).toBe("EVALUATED");
  });

  it("overrides to a pass through the same scoring and progression, keeping history", async () => {
    const a = await failedSubmission("[fake:score=60]");
    const appeal = await createAppeal(a.u, a.evaluationId, REASON);
    const scores = await allScores(a.evaluationId, { "information-hierarchy": 95, contrast: 90, "legibility-at-small-size": 90, typography: 90, "composition-and-spacing": 90, "design-rationale": 90 });
    await resolveAppeal(await reviewer(), appeal.id, { decision: "override", note: "On a second look the hierarchy is strong.", scores });

    const evs = await db.evaluation.findMany({ where: { submissionId: a.submissionId }, orderBy: { createdAt: "asc" } });
    expect(evs).toHaveLength(2);
    expect(evs[0]).toMatchObject({ provider: "test-only-fake", passed: false, overallScore: 60 }); // original untouched
    expect(evs[1]).toMatchObject({ provider: "human", humanReviewed: true, passed: true, supersedesId: evs[0].id });
    expect(await db.progress.count({ where: { userId: a.u, nodeType: "ASSIGNMENT", nodeId: assignmentId } })).toBe(1);
    expect(await db.auditEvent.count({ where: { actorId: a.u, action: "assignment.pass" } })).toBe(1);

    const v = await getSubmissionView({ id: a.u, role: "LEARNER" }, a.submissionId);
    expect(v?.evaluation).toMatchObject({ humanReviewed: true, passed: true });
    expect(v?.canAppeal).toBe(false);
  });

  it("applies the same mandatory-minimum rule to a human override", async () => {
    const a = await failedSubmission();
    const appeal = await createAppeal(a.u, a.evaluationId, REASON);
    const scores = await allScores(a.evaluationId, { contrast: 50, "information-hierarchy": 100, typography: 100, "composition-and-spacing": 100, "design-rationale": 100, "legibility-at-small-size": 100 });
    await resolveAppeal(await reviewer(), appeal.id, { decision: "override", note: "Raised most scores, contrast stays weak.", scores });
    expect(await db.progress.count({ where: { userId: a.u, nodeType: "ASSIGNMENT" } })).toBe(0);
    const latest = await db.evaluation.findFirstOrThrow({ where: { submissionId: a.submissionId }, orderBy: { createdAt: "desc" } });
    expect(latest).toMatchObject({ humanReviewed: true, passed: false });
  });

  it("rejects an invalid override and leaves the appeal open (nothing half-applied)", async () => {
    const a = await failedSubmission();
    const appeal = await createAppeal(a.u, a.evaluationId, REASON);
    const rv = await reviewer();
    const scores = await allScores(a.evaluationId);

    expect(await code(resolveAppeal(rv, appeal.id, { decision: "override", note: "Dropping a criterion.", scores: scores.slice(1) }))).toBe("invalid_scores");
    const uncommented = scores.map((s, i) => (i === 0 ? { ...s, score: 100, comment: "" } : s));
    expect(await code(resolveAppeal(rv, appeal.id, { decision: "override", note: "Changed without a reason.", scores: uncommented }))).toBe("comment_required");
    expect(await code(resolveAppeal(rv, appeal.id, { decision: "uphold", note: "short" }))).toBe("resolution_required");

    expect((await db.appeal.findUniqueOrThrow({ where: { id: appeal.id } })).status).toBe("OPEN");
    expect(await db.evaluation.count({ where: { submissionId: a.submissionId } })).toBe(1);
    expect((await db.submission.findUniqueOrThrow({ where: { id: a.submissionId } })).status).toBe("IN_HUMAN_REVIEW");
  });

  it("lets only one of two simultaneous reviewers resolve it", async () => {
    const a = await failedSubmission();
    const appeal = await createAppeal(a.u, a.evaluationId, REASON);
    const [r1, r2] = [await reviewer(), await reviewer()];
    const scores = await allScores(a.evaluationId, { contrast: 95 });
    const out = await Promise.all([
      code(resolveAppeal(r1, appeal.id, { decision: "override", note: "Raised contrast after review.", scores })),
      code(resolveAppeal(r2, appeal.id, { decision: "override", note: "Raised contrast after review.", scores })),
    ]);
    expect(out.filter((x) => x === "ok")).toHaveLength(1);
    expect(out.filter((x) => x === "not_open")).toHaveLength(1);
    expect(await db.evaluation.count({ where: { submissionId: a.submissionId } })).toBe(2);
  });

  it("can pass a learner who has used all their attempts", async () => {
    const a = await failedSubmission("[fake:score=50]");
    await submit(a.u, "[fake:score=55]", "Changed the heading size and colour.");
    const third = await submit(a.u, "[fake:score=60]", "Reworked spacing and grouping here.");
    expect(await getAssignmentAccess(a.u, assignmentId)).toMatchObject({ allowed: false, reason: "no_attempts_left" });
    const appeal = await createAppeal(a.u, third.evaluationId, REASON);
    const scores = await allScores(third.evaluationId, { "information-hierarchy": 95, contrast: 90, "legibility-at-small-size": 90, typography: 90, "composition-and-spacing": 90, "design-rationale": 90 });
    await resolveAppeal(await reviewer(), appeal.id, { decision: "override", note: "Reviewed the final poster in full.", scores });
    expect(await getAssignmentAccess(a.u, assignmentId)).toMatchObject({ allowed: false, reason: "already_passed" });
  });
});
