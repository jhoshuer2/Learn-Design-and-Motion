import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import { evaluateSubmission } from "../src/lib/assessment/evaluate";
import { FakeProvider } from "../src/lib/assessment/fake";
import { getAssignmentAccess, getLessonAccess, recordBlockView, submitCheck, type StoredBlock } from "../src/lib/progression";
import { assessLevel } from "../src/lib/progression/level";
import { createSubmission } from "../src/lib/submissions";
import { RATIONALE, cleanup, makeUser, useTempStorage } from "./helpers";

/** The motion slice on the same engine rules: ordered lessons, a gated assessment, honest scope (no capstone, no level completion). */
const fake = new FakeProvider();
const content = loadContent();
const spec = content.modules.find((m) => m.def.slug === "kinetic-type-loop")!;
const img = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#14110f" } }).png().toBuffer();
let pathId: string, levelId: string, assessmentId: string, capstoneId: string;
const lessonId: Record<string, string> = {};

beforeAll(async () => {
  await useTempStorage();
  process.env.CONTENT_PREVIEW = "true";
  await publishContent(db, loadContent());
  const level = await db.level.findFirstOrThrow({ where: { tier: "BEGINNER", path: { slug: "motion-design" } } });
  pathId = level.pathId; levelId = level.id;
  assessmentId = (await db.assignment.findUniqueOrThrow({ where: { slug: "kinetic-type-loop" } })).id;
  capstoneId = (await db.assignment.findUniqueOrThrow({ where: { slug: "kinetic-type-capstone" } })).id;
  for (const l of await db.lesson.findMany({ where: { module: { levelId: level.id } } })) lessonId[l.slug] = l.id;
});
afterAll(async () => {
  const ids = (await db.user.findMany({ where: { email: { endsWith: "@test.local" } }, select: { id: true } })).map((u) => u.id);
  await db.levelCompletion.deleteMany({ where: { userId: { in: ids } } });
  await cleanup();
  await db.$disconnect();
});

const learner = async () => { const u = await makeUser({ enroll: false }); await db.enrollment.create({ data: { userId: u, pathId } }); return u; };
async function check(u: string, slug: string, right: boolean) {
  const blocks = (await db.lesson.findUniqueOrThrow({ where: { id: lessonId[slug] } })).blocks as StoredBlock[];
  for (let i = 0; i < blocks.findIndex((b) => b.kind === "check"); i++) await recordBlockView(u, lessonId[slug], i);
  const want = new Map(spec.lessons.find((l) => l.meta.slug === slug)!.questions.map((q) => [q.prompt, q.answer]));
  const qs = await db.quizQuestion.findMany({ where: { lessonId: lessonId[slug] } });
  return submitCheck(u, lessonId[slug], Object.fromEntries(qs.map((q) => { const a = want.get(q.prompt)!; return [q.id, right ? (Array.isArray(a) ? a : [a]) : ["__wrong__"]]; })));
}
const passAll = async (u: string) => { for (const l of spec.lessons) expect((await check(u, l.meta.slug, true)).completed, l.meta.slug).toBe(true); };

describe("motion-design path", () => {
  it("opens lessons in order and not before enrolment", async () => {
    const stranger = await makeUser({ enroll: false });
    expect(await getLessonAccess(stranger, lessonId["motion-feels-alive"])).toMatchObject({ allowed: false, reason: "not_enrolled" });
    const u = await learner();
    expect(await getLessonAccess(u, lessonId["motion-feels-alive"])).toMatchObject({ allowed: true });
    expect(await getLessonAccess(u, lessonId["keyframes-move-scale-fade"])).toMatchObject({ allowed: false, reason: "prerequisites" });
    expect(await getAssignmentAccess(u, assessmentId)).toMatchObject({ allowed: false, reason: "lessons_incomplete" });
  });

  it("does not complete a lesson on a failed check, then opens the next on a pass", async () => {
    const u = await learner();
    expect((await check(u, "motion-feels-alive", false)).passed).toBe(false);
    expect(await getLessonAccess(u, lessonId["keyframes-move-scale-fade"])).toMatchObject({ allowed: false });
    expect((await check(u, "motion-feels-alive", true)).completed).toBe(true);
    expect(await getLessonAccess(u, lessonId["keyframes-move-scale-fade"])).toMatchObject({ allowed: true });
  });

  it("records evidence for each skill, opens the assessment, and passes it only on the test evaluator", async () => {
    const u = await learner();
    await passAll(u);
    expect(await getAssignmentAccess(u, assessmentId)).toMatchObject({ allowed: true });
    const { submissionId } = await createSubmission(u, assessmentId, {
      files: [{ slot: "final", name: "strip.png", data: await img(1600, 300) }, { slot: "preview", name: "small.png", data: await img(400, 75) }],
      rationale: `${RATIONALE} [fake:score=90]`,
    });
    const out = await evaluateSubmission(submissionId, { provider: fake });
    expect(out).toMatchObject({ state: "evaluated", passed: true });
    const skills = await db.skillEvidence.findMany({ where: { userId: u }, include: { competency: true } });
    for (const slug of ["motion-timing-easing", "motion-keyframes", "motion-kinetic-type", "motion-looping", "motion-polish"]) {
      expect(skills.some((s) => s.competency.slug === slug), slug).toBe(true);
    }
  });

  const strip = async (slot: string, w: number, h: number) => ({ slot, name: `${slot}.png`, data: await img(w, h) });
  const submitAssessment = async (u: string) => {
    const { submissionId } = await createSubmission(u, assessmentId, { files: [await strip("final", 1600, 300), await strip("preview", 400, 75)], rationale: `${RATIONALE} [fake:score=90]` });
    expect(await evaluateSubmission(submissionId, { provider: fake })).toMatchObject({ passed: true });
  };
  const submitCapstone = async (u: string, marker: string) => {
    const { submissionId } = await createSubmission(u, capstoneId, { files: [await strip("square", 1600, 300), await strip("story", 1600, 300), await strip("banner", 1600, 300)], rationale: `${RATIONALE} ${marker}` });
    const out = await evaluateSubmission(submissionId, { provider: fake });
    if (out.state !== "evaluated") throw new Error(out.state);
    return out;
  };
  const levelRows = (u: string) => db.progress.count({ where: { userId: u, nodeType: "LEVEL", nodeId: levelId } });

  it("keeps the capstone closed until every lesson and the module assessment are done, and names the module", async () => {
    const u = await learner();
    expect(await getAssignmentAccess(u, capstoneId)).toMatchObject({ allowed: false, reason: "modules_incomplete", missing: ["Make a kinetic type loop"] });
    await passAll(u);
    expect(await getAssignmentAccess(u, capstoneId)).toMatchObject({ allowed: false, reason: "modules_incomplete" }); // assessment not passed yet
    await submitAssessment(u);
    expect(await getAssignmentAccess(u, capstoneId)).toMatchObject({ allowed: true, attempt: 1, maxAttempts: 3 });
  });

  it("teaches the new lesson last, after polish and export", async () => {
    const u = await learner();
    expect(spec.lessons.map((l) => l.meta.slug).at(-1)).toBe("one-motion-three-formats");
    expect(await getLessonAccess(u, lessonId["one-motion-three-formats"])).toMatchObject({ allowed: false, reason: "prerequisites" });
  });

  it("completes the level on a passing capstone with an honest record", async () => {
    const u = await learner();
    await passAll(u); await submitAssessment(u);
    expect(await submitCapstone(u, "[fake:score=95]")).toMatchObject({ passed: true });
    expect(await levelRows(u)).toBe(1);
    const rec = await db.levelCompletion.findFirstOrThrow({ where: { userId: u } });
    expect(rec.title).toBe("Motion Design, Beginner: Kinetic type basics");
    const e = rec.evidence as { limits: string; scope: { note: string }; testEvaluatorUsed: boolean; requiredCompetencies: { slug: string }[] };
    expect(e.limits).toMatch(/not a professional qualification/);
    expect(e.scope.note).toMatch(/does not show mastery of motion design/);
    expect(e.testEvaluatorUsed).toBe(true);
    expect(e.requiredCompetencies.map((c) => c.slug)).toEqual(["motion-consistency"]);
  });

  it("does not unlock on a high score when consistency across formats is below its minimum", async () => {
    const u = await learner();
    await passAll(u); await submitAssessment(u);
    const out = await submitCapstone(u, "[fake:score=100] [fake:set=format-consistency:50]");
    expect(out.passed).toBe(false);
    expect(out.score).toBeGreaterThanOrEqual(85); // the weighted total alone would pass
    expect(await levelRows(u)).toBe(0);
  });

  it("holds the level back while the required skill is below 80, until lesson 6's check is retaken", async () => {
    const u = await learner();
    await passAll(u); await submitAssessment(u);
    expect(await submitCapstone(u, "[fake:score=95] [fake:set=format-consistency:70]")).toMatchObject({ passed: true }); // 70 clears the criterion's minimum of 60
    expect(await levelRows(u)).toBe(0);
    const blocked = (await assessLevel(db, u, levelId))!.checks.find((c) => c.slug === "motion-consistency")!;
    expect(blocked).toMatchObject({ met: false, latestScore: 70 });
    expect(blocked.retakeLessons.map((l) => l.title)).toEqual(["One motion, three formats"]); // only this path's lesson
    expect((await check(u, "one-motion-three-formats", true)).passed).toBe(true);
    expect(await levelRows(u)).toBe(1);
  });
});
