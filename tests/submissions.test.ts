import fs from "node:fs/promises";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import { evaluateSubmission } from "../src/lib/assessment/evaluate";
import { FakeProvider } from "../src/lib/assessment/fake";
import { getAssignmentAccess, getTimeline } from "../src/lib/progression";
import { SubmissionError, UploadError, createSubmission, type UploadedFile } from "../src/lib/submissions";
import { getSubmissionView } from "../src/lib/submissions/view";
import { RATIONALE, cleanup, makeUser, useTempStorage } from "./helpers";

const fake = new FakeProvider();
let assignmentId: string;
let pathId: string;
let uploadDir: string;

const img = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#aa3322" } }).png().toBuffer();
async function files(preview = true): Promise<UploadedFile[]> {
  const f: UploadedFile[] = [{ role: "final", name: "poster.png", data: await img(800, 1200) }];
  if (preview) f.push({ role: "preview", name: "small.png", data: await img(267, 400) });
  return f;
}
const rationale = (marker = "") => `${RATIONALE} ${marker}`;

async function completeLessons(userId: string) {
  const lessons = await db.lesson.findMany({ where: { module: { slug: "understanding-contrast" } }, select: { id: true } });
  await db.progress.createMany({
    data: lessons.map((l) => ({ userId, nodeType: "LESSON", nodeId: l.id, state: "COMPLETED" as const, completedAt: new Date() })),
    skipDuplicates: true,
  });
}
const ready = async () => { const u = await makeUser(); await completeLessons(u); return u; };
const codeOf = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof SubmissionError || e instanceof UploadError ? (e as SubmissionError).code : `other:${e}`));
async function submitAndEvaluate(u: string, marker: string, opts: { changes?: string; preview?: boolean } = {}) {
  const { submissionId } = await createSubmission(u, assignmentId, { files: await files(opts.preview), rationale: rationale(marker), changesNote: opts.changes });
  return { submissionId, out: await evaluateSubmission(submissionId, { provider: fake }) };
}

beforeAll(async () => {
  await useTempStorage();
  uploadDir = process.env.UPLOAD_DIR!;
  process.env.CONTENT_PREVIEW = "true";
  await publishContent(db, loadContent());
  assignmentId = (await db.assignment.findUniqueOrThrow({ where: { slug: "high-contrast-event-poster" } })).id;
  pathId = (await db.module.findFirstOrThrow({ where: { slug: "understanding-contrast" }, include: { level: true } })).level.pathId;
});
afterAll(async () => { await cleanup(); await db.$disconnect(); });

describe("assignment access", () => {
  it("is closed to someone who is not enrolled", async () => {
    expect(await getAssignmentAccess(await makeUser({ enroll: false }), assignmentId)).toMatchObject({ allowed: false, reason: "not_enrolled" });
  });

  it("stays locked until every lesson is complete, and names the missing ones", async () => {
    const u = await makeUser();
    const a = await getAssignmentAccess(u, assignmentId);
    expect(a).toMatchObject({ allowed: false, reason: "lessons_incomplete" });
    expect(!a.allowed && a.missing).toHaveLength(3);
    expect(await codeOf(createSubmission(u, assignmentId, { files: await files(), rationale: rationale() }))).toBe("lessons_incomplete");
    expect(await db.submission.count({ where: { userId: u } })).toBe(0);
  });

  it("opens once every lesson is complete", async () => {
    expect(await getAssignmentAccess(await ready(), assignmentId)).toMatchObject({ allowed: true, attempt: 1, attemptsUsed: 0 });
  });
});

describe("creating submissions", () => {
  it("rejects an invalid image without creating a submission or leaving files behind", async () => {
    const u = await ready();
    const before = (await fs.readdir(uploadDir)).length;
    const bad: UploadedFile[] = [{ role: "final", name: "poster.png", data: Buffer.from("MZ not an image") }];
    expect(await codeOf(createSubmission(u, assignmentId, { files: bad, rationale: rationale() }))).toBe("corrupt");
    expect(await db.submission.count({ where: { userId: u } })).toBe(0);
    expect((await fs.readdir(uploadDir)).length).toBe(before);
  });

  it("requires at least one file", async () => {
    expect(await codeOf(createSubmission(await ready(), assignmentId, { files: [], rationale: rationale() }))).toBe("no_files");
  });

  it("blocks a second submission while one is in progress, and survives a double click", async () => {
    const u = await ready();
    const input = async () => ({ files: await files(), rationale: rationale() });
    const results = await Promise.all([createSubmission(u, assignmentId, await input()).then(() => "ok", (e) => e.code), createSubmission(u, assignmentId, await input()).then(() => "ok", (e) => e.code)]);
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.filter((r) => r === "in_progress")).toHaveLength(1);
    expect(await db.submission.count({ where: { userId: u } })).toBe(1);
  });

  it("requires a note on what changed from the second attempt", async () => {
    const u = await ready();
    await submitAndEvaluate(u, "[fake:score=60]");
    expect(await codeOf(createSubmission(u, assignmentId, { files: await files(), rationale: rationale() }))).toBe("changes_note_required");
    const { submissionId } = await createSubmission(u, assignmentId, { files: await files(), rationale: rationale(), changesNote: "I made the date text darker and larger." });
    expect((await db.submission.findUniqueOrThrow({ where: { id: submissionId } })).attempt).toBe(2);
  });

  it("allows exactly three completed attempts, then closes", async () => {
    const u = await ready();
    await submitAndEvaluate(u, "[fake:score=50]");
    await submitAndEvaluate(u, "[fake:score=55]", { changes: "Changed the heading size and colour." });
    expect(await getAssignmentAccess(u, assignmentId)).toMatchObject({ allowed: true, attempt: 3, attemptsUsed: 2 });
    await submitAndEvaluate(u, "[fake:score=60]", { changes: "Reworked the spacing and grouping." });
    expect(await getAssignmentAccess(u, assignmentId)).toMatchObject({ allowed: false, reason: "no_attempts_left", attemptsUsed: 3 });
    expect(await codeOf(createSubmission(u, assignmentId, { files: await files(), rationale: rationale(), changesNote: "More changes made here." }))).toBe("no_attempts_left");
  });

  it("does not use an attempt when more evidence is requested, and amends the same submission", async () => {
    const u = await ready();
    const first = await submitAndEvaluate(u, "", { preview: false });
    expect(first.out.state).toBe("needs_evidence");
    const access = await getAssignmentAccess(u, assignmentId);
    expect(access).toMatchObject({ allowed: true, attempt: 1, attemptsUsed: 0, amending: { id: first.submissionId } });
    const oldKeys = ((await db.submission.findUniqueOrThrow({ where: { id: first.submissionId } })).files as { key: string }[]).map((f) => f.key);

    const again = await createSubmission(u, assignmentId, { files: await files(true), rationale: rationale("[fake:score=90]") });
    expect(again).toEqual({ submissionId: first.submissionId, amended: true });
    expect(await evaluateSubmission(again.submissionId, { provider: fake })).toMatchObject({ state: "evaluated", passed: true });
    expect(await db.submission.count({ where: { userId: u } })).toBe(1);
    for (const k of oldKeys) await expect(fs.access(`${uploadDir}/${k}`)).rejects.toThrow(); // replaced files are deleted
  });

  it("does not use an attempt when assessment failed, and offers a retry", async () => {
    const u = await ready();
    const { submissionId } = await createSubmission(u, assignmentId, { files: await files(), rationale: rationale("[fake:invalid]") });
    expect((await evaluateSubmission(submissionId, { provider: fake })).state).toBe("failed");
    expect(await getAssignmentAccess(u, assignmentId)).toMatchObject({ allowed: false, reason: "retry_evaluation", attemptsUsed: 0, submissionId });
  });

  it("closes the assignment after a pass", async () => {
    const u = await ready();
    expect((await submitAndEvaluate(u, "[fake:score=92]")).out).toMatchObject({ passed: true });
    expect(await getAssignmentAccess(u, assignmentId)).toMatchObject({ allowed: false, reason: "already_passed" });
    expect(await codeOf(createSubmission(u, assignmentId, { files: await files(), rationale: rationale() }))).toBe("already_passed");
  });
});

describe("who can see a submission", () => {
  it("hides it from other learners, shows it to the owner and to a reviewer, and never exposes storage keys", async () => {
    const owner = await ready();
    const other = await makeUser();
    const reviewer = await makeUser({ role: "REVIEWER" });
    const { submissionId } = await submitAndEvaluate(owner, "[fake:score=70]");

    expect(await getSubmissionView({ id: other, role: "LEARNER" }, submissionId)).toBeNull();
    const own = await getSubmissionView({ id: owner, role: "LEARNER" }, submissionId);
    expect(own?.isOwner).toBe(true);
    const stored = (await db.submission.findUniqueOrThrow({ where: { id: submissionId } })).files as { key: string; sha256: string }[];
    expect(stored.length).toBeGreaterThan(0);
    for (const f of stored) {
      expect(JSON.stringify(own)).not.toContain(f.key); // real storage keys never reach the learner view
      expect(JSON.stringify(own)).not.toContain(f.sha256);
    }
    expect(own!.files.every((f) => !("key" in f) && !("sha256" in f))).toBe(true);
    const rev = await getSubmissionView({ id: reviewer, role: "REVIEWER" }, submissionId);
    expect(rev).not.toBeNull();
    expect(rev?.isOwner).toBe(false);
    expect(rev?.access).toBeNull();
  });

  it("labels a test evaluator and ties weak criteria to lessons that teach them", async () => {
    const u = await ready();
    const { submissionId } = await submitAndEvaluate(u, "[fake:score=50]");
    const v = (await getSubmissionView({ id: u, role: "LEARNER" }, submissionId))!;
    expect(v.evaluation).toMatchObject({ isTestEvaluator: true, passed: false, score: 50 });
    expect(v.criteria).toHaveLength(6);
    expect(v.remediation.length).toBeGreaterThan(0);
    expect(v.remediation.map((r) => r.title)).toContain("Contrast and accessibility");
  });
});

describe("module completion gate", () => {
  it("is not complete until the assessment is passed", async () => {
    const u = await ready();
    let t = await getTimeline(u, pathId);
    expect(t!.modules[0].assessment).toMatchObject({ state: "available" });
    expect(t!.modules[0].complete).toBe(false);
    expect(t!.next).toMatchObject({ assignmentId });

    await submitAndEvaluate(u, "[fake:score=60]");
    t = await getTimeline(u, pathId);
    expect(t!.modules[0].complete).toBe(false);

    await submitAndEvaluate(u, "[fake:score=95]", { changes: "Rebuilt the hierarchy with stronger contrast." });
    t = await getTimeline(u, pathId);
    expect(t!.modules[0].assessment).toMatchObject({ state: "passed" });
    expect(t!.modules[0].complete).toBe(true);
  });

  it("shows the assessment as locked before the lessons are done", async () => {
    const t = await getTimeline(await makeUser(), pathId);
    expect(t!.modules[0].assessment).toMatchObject({ state: "locked" });
  });
});
