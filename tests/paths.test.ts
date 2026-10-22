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

/**
 * The same engine rules, proven on every authored path with the test-only evaluator: lesson order, gated assessments,
 * the capstone gate, mandatory minimums and the required-skill gate. (Graphic Design has its own deeper suites.)
 */
const fake = new FakeProvider();
const content = loadContent();
const img = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#335577" } }).png().toBuffer();

type Spec = {
  path: string; title: string; module: string; assessment: string; capstone: string; scope: string;
  assessmentFiles: [string, number, number][]; capstoneFiles: [string, number, number][];
  /** criterion key in the capstone rubric, and its competency, for each required competency */
  required: { competency: string; criterion: string; lesson: string }[];
  mandatoryCriterion: string;
};
const SPECS: Spec[] = [
  {
    path: "brand-design", title: "Brand Design", module: "brand-identity-foundations", assessment: "mini-brand-sheet", capstone: "identity-kit-capstone", scope: "Identity foundations",
    assessmentFiles: [["final", 1200, 800], ["preview", 400, 267]],
    capstoneFiles: [["business-card", 1050, 600], ["social-avatar", 600, 600], ["wide-header", 1200, 300]],
    required: [{ competency: "brand-system-consistency", criterion: "consistency-across-applications", lesson: "colour-and-type-systems" }],
    mandatoryCriterion: "consistency-across-applications",
  },
  {
    path: "ui-design", title: "UI Design", module: "interface-hierarchy-and-accessibility", assessment: "mobile-screen", capstone: "booking-flow-capstone", scope: "Interface hierarchy and accessibility",
    assessmentFiles: [["final", 390, 844], ["preview", 185, 400]],
    capstoneFiles: [["screen-choose", 390, 844], ["screen-details", 390, 844], ["screen-confirm", 390, 844]],
    required: [
      { competency: "ui-touch-targets-and-states", criterion: "targets-and-states", lesson: "components-and-states" },
      { competency: "accessibility-contrast", criterion: "accessible-contrast", lesson: "readable-accessible-interfaces" },
    ],
    mandatoryCriterion: "targets-and-states",
  },
];

beforeAll(async () => {
  await useTempStorage();
  process.env.CONTENT_PREVIEW = "true";
  await publishContent(db, loadContent());
});
afterAll(async () => {
  const ids = (await db.user.findMany({ where: { email: { endsWith: "@test.local" } }, select: { id: true } })).map((u) => u.id);
  await db.remediation.deleteMany({ where: { userId: { in: ids } } });
  await db.levelCompletion.deleteMany({ where: { userId: { in: ids } } });
  await cleanup();
  await db.$disconnect();
});

describe.each(SPECS)("$path", (s) => {
  const spec = content.modules.find((m) => m.def.slug === s.module)!;
  let pathId: string, levelId: string, assessmentId: string, capstoneId: string;
  const lessonId: Record<string, string> = {};

  beforeAll(async () => {
    const level = await db.level.findFirstOrThrow({ where: { tier: "BEGINNER", path: { slug: s.path } } });
    levelId = level.id; pathId = level.pathId;
    assessmentId = (await db.assignment.findUniqueOrThrow({ where: { slug: s.assessment } })).id;
    capstoneId = (await db.assignment.findUniqueOrThrow({ where: { slug: s.capstone } })).id;
    for (const l of await db.lesson.findMany({ where: { module: { slug: s.module } } })) lessonId[l.slug] = l.id;
  });

  const learner = async (enroll = true) => {
    const u = await makeUser({ enroll: false });
    if (enroll) await db.enrollment.create({ data: { userId: u, pathId } });
    return u;
  };
  const answers = async (slug: string, right: boolean) => {
    const want = new Map(spec.lessons.find((l) => l.meta.slug === slug)!.questions.map((q) => [q.prompt, q.answer]));
    const qs = await db.quizQuestion.findMany({ where: { lessonId: lessonId[slug] } });
    return Object.fromEntries(qs.map((q) => { const a = want.get(q.prompt)!; return [q.id, right ? (Array.isArray(a) ? a : [a]) : ["__wrong__"]]; }));
  };
  const check = async (u: string, slug: string, right: boolean) => {
    const blocks = (await db.lesson.findUniqueOrThrow({ where: { id: lessonId[slug] } })).blocks as StoredBlock[];
    const ci = blocks.findIndex((b) => b.kind === "check");
    for (let i = 0; i < ci; i++) await recordBlockView(u, lessonId[slug], i);
    return submitCheck(u, lessonId[slug], await answers(slug, right));
  };
  const passAllLessons = async (u: string) => { for (const l of spec.lessons) expect((await check(u, l.meta.slug, true)).completed, l.meta.slug).toBe(true); };
  const submit = async (u: string, assignmentId: string, files: [string, number, number][], marker: string) => {
    const { submissionId } = await createSubmission(u, assignmentId, {
      files: await Promise.all(files.map(async ([slot, w, h]) => ({ slot, name: `${slot}.png`, data: await img(w, h) }))),
      rationale: `${RATIONALE} ${marker}`,
    });
    const out = await evaluateSubmission(submissionId, { provider: fake });
    if (out.state !== "evaluated") throw new Error(`expected evaluated, got ${out.state}`);
    return out;
  };
  const rows = (u: string) => db.progress.count({ where: { userId: u, nodeType: "LEVEL", nodeId: levelId } });

  it("enforces enrolment and lesson order", async () => {
    const stranger = await learner(false);
    expect(await getLessonAccess(stranger, lessonId[spec.lessons[0].meta.slug])).toMatchObject({ allowed: false, reason: "not_enrolled" });
    const u = await learner();
    expect(await getLessonAccess(u, lessonId[spec.lessons[0].meta.slug])).toMatchObject({ allowed: true });
    expect(await getLessonAccess(u, lessonId[spec.lessons[1].meta.slug])).toMatchObject({ allowed: false, reason: "prerequisites" });
    expect(await getAssignmentAccess(u, assessmentId)).toMatchObject({ allowed: false, reason: "lessons_incomplete" });
    expect(await getAssignmentAccess(u, capstoneId)).toMatchObject({ allowed: false, reason: "modules_incomplete" });
  });

  it("does not complete a lesson on a failed check, and opens the next one on a pass", async () => {
    const u = await learner();
    const [first, second] = spec.lessons.map((l) => l.meta.slug);
    expect((await check(u, first, false)).passed).toBe(false);
    expect(await getLessonAccess(u, lessonId[second])).toMatchObject({ allowed: false });
    expect((await check(u, first, true)).completed).toBe(true);
    expect(await getLessonAccess(u, lessonId[second])).toMatchObject({ allowed: true });
  });

  it("runs the whole path: lessons, module assessment, capstone, then an honest level record", async () => {
    const u = await learner();
    await passAllLessons(u);
    expect(await getAssignmentAccess(u, assessmentId)).toMatchObject({ allowed: true });
    expect(await submit(u, assessmentId, s.assessmentFiles, "[fake:score=90]")).toMatchObject({ passed: true });
    expect(await getAssignmentAccess(u, capstoneId)).toMatchObject({ allowed: true, attempt: 1 });
    expect(await submit(u, capstoneId, s.capstoneFiles, "[fake:score=95]")).toMatchObject({ passed: true });
    expect(await rows(u)).toBe(1);
    const rec = await db.levelCompletion.findFirstOrThrow({ where: { userId: u } });
    expect(rec.title).toBe(`${s.title}, Beginner: ${s.scope}`);
    const e = rec.evidence as { limits: string; scope: { note: string }; testEvaluatorUsed: boolean; requiredCompetencies: { slug: string; needed: number }[] };
    expect(e.limits).toMatch(/not a professional qualification/);
    expect(e.scope.note).toMatch(/not (show|written)/i);
    expect(e.testEvaluatorUsed).toBe(true);
    expect(e.requiredCompetencies.map((c) => c.slug).sort()).toEqual(s.required.map((r) => r.competency).sort());
  });

  it("does not unlock on a high score when a mandatory criterion is below its minimum (and the first-mandatory marker works)", async () => {
    const u = await learner();
    await passAllLessons(u);
    await submit(u, assessmentId, s.assessmentFiles, "[fake:score=90]");
    const out = await submit(u, capstoneId, s.capstoneFiles, `[fake:score=100] [fake:set=${s.mandatoryCriterion}:50]`);
    expect(out.passed).toBe(false);
    expect(out.score).toBeGreaterThanOrEqual(85); // the weighted score alone would pass
    expect(await rows(u)).toBe(0);
  });

  it.each(s.required.map((r) => [r.competency, r]))("holds the level back while %s is below 80, and unlocks once it is demonstrated again", async (_c, r) => {
    const u = await learner();
    await passAllLessons(u);
    await submit(u, assessmentId, s.assessmentFiles, "[fake:score=90]");
    const out = await submit(u, capstoneId, s.capstoneFiles, `[fake:score=95] [fake:set=${r.criterion}:70]`);
    expect(out.passed).toBe(true); // capstone passed: 70 is above the criterion's minimum of 60
    expect(await rows(u)).toBe(0); // but the required skill is not demonstrated
    const a = await assessLevel(db, u, levelId);
    const blocked = a!.checks.find((c) => c.slug === r.competency)!;
    expect(blocked).toMatchObject({ met: false, latestScore: 70 });
    expect(blocked.retakeLessons.map((l) => l.title).join(" ")).not.toMatch(/Contrast in type and media|What contrast does/); // only this path's lessons
    expect((await check(u, r.lesson, true)).passed).toBe(true); // retaking the check demonstrates it
    expect(await rows(u)).toBe(1);
  });
});
