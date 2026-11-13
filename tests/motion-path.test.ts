import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import { evaluateSubmission } from "../src/lib/assessment/evaluate";
import { FakeProvider } from "../src/lib/assessment/fake";
import { getAssignmentAccess, getLessonAccess, getTimeline, recordBlockView, submitCheck, type StoredBlock } from "../src/lib/progression";
import { createSubmission } from "../src/lib/submissions";
import { RATIONALE, cleanup, makeUser, useTempStorage } from "./helpers";

/** The motion slice on the same engine rules: ordered lessons, a gated assessment, honest scope (no capstone, no level completion). */
const fake = new FakeProvider();
const content = loadContent();
const spec = content.modules.find((m) => m.def.slug === "kinetic-type-loop")!;
const img = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#14110f" } }).png().toBuffer();
let pathId: string, assessmentId: string;
const lessonId: Record<string, string> = {};

beforeAll(async () => {
  await useTempStorage();
  process.env.CONTENT_PREVIEW = "true";
  await publishContent(db, loadContent());
  const level = await db.level.findFirstOrThrow({ where: { tier: "BEGINNER", path: { slug: "motion-design" } } });
  pathId = level.pathId;
  assessmentId = (await db.assignment.findUniqueOrThrow({ where: { slug: "kinetic-type-loop" } })).id;
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

  it("says plainly that there is no capstone and the level cannot complete yet", async () => {
    const u = await learner();
    await passAll(u);
    const t = await getTimeline(u, pathId);
    const level = t!.levels.find((l) => l.tier === "BEGINNER")!;
    expect(level.capstone).toBeNull();
    expect(level.scopeNote).toMatch(/no capstone yet/i);
    expect(level.state).not.toBe("complete");
    expect(await db.levelCompletion.count({ where: { userId: u } })).toBe(0);
  });
});
