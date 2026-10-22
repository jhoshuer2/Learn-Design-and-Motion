import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import {
  AccessError, getLessonAccess, getLessonView, getTimeline, getWeakCompetencies, recordBlockView, submitCheck,
  type StoredBlock,
} from "../src/lib/progression";

const content = loadContent();
const lessons = content.modules.find((m) => m.def.slug === "understanding-contrast")!.lessons;
const answerFor = (slug: string) => new Map(lessons.find((l) => l.meta.slug === slug)!.questions.map((q) => [q.prompt, q.answer]));

let pathId: string;
const ids: Record<string, string> = {};
const created: string[] = [];

async function learner(enroll = true) {
  const u = await db.user.create({ data: { email: `t-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local` } });
  created.push(u.id);
  if (enroll) await db.enrollment.create({ data: { userId: u.id, pathId } });
  return u.id;
}

async function answers(lessonId: string, slug: string, right: boolean) {
  const want = answerFor(slug);
  const qs = await db.quizQuestion.findMany({ where: { lessonId } });
  return Object.fromEntries(qs.map((q) => {
    const a = want.get(q.prompt)!;
    return [q.id, right ? (Array.isArray(a) ? a : [a]) : ["__wrong__"]];
  }));
}

async function viewThroughCheck(userId: string, lessonId: string) {
  const blocks = (await db.lesson.findUniqueOrThrow({ where: { id: lessonId } })).blocks as StoredBlock[];
  const checkIndex = blocks.findIndex((b) => b.kind === "check");
  for (let i = 0; i <= checkIndex - 1; i++) await recordBlockView(userId, lessonId, i);
  return { blocks, checkIndex };
}

async function passLesson(userId: string, slug: string) {
  await viewThroughCheck(userId, ids[slug]);
  return submitCheck(userId, ids[slug], await answers(ids[slug], slug, true));
}

beforeAll(async () => {
  process.env.CONTENT_PREVIEW = "true";
  await publishContent(db, content);
  const mod = await db.module.findFirstOrThrow({ where: { slug: "understanding-contrast" }, include: { level: true } });
  pathId = mod.level.pathId;
  for (const l of await db.lesson.findMany({ where: { moduleId: mod.id } })) ids[l.slug] = l.id;
});

afterAll(async () => {
  await db.auditEvent.deleteMany({ where: { actorId: { in: created } } });
  await db.skillEvidence.deleteMany({ where: { userId: { in: created } } });
  await db.quizAttempt.deleteMany({ where: { userId: { in: created } } });
  await db.blockView.deleteMany({ where: { userId: { in: created } } });
  await db.progress.deleteMany({ where: { userId: { in: created } } });
  await db.enrollment.deleteMany({ where: { userId: { in: created } } });
  await db.user.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

describe("access", () => {
  it("denies a learner who is not enrolled", async () => {
    const u = await learner(false);
    expect(await getLessonAccess(u, ids["what-contrast-does"])).toMatchObject({ allowed: false, reason: "not_enrolled" });
  });

  it("locks a lesson until its prerequisite is complete, and names what is missing", async () => {
    const u = await learner();
    const a = await getLessonAccess(u, ids["contrast-in-type-and-media"]);
    expect(a).toMatchObject({ allowed: false, reason: "prerequisites" });
    expect(!a.allowed && a.missing).toEqual(["What contrast does to a page"]);
    await expect(getLessonView(u, ids["contrast-in-type-and-media"])).rejects.toBeInstanceOf(AccessError);
  });

  it("hides non-published content when preview is off", async () => {
    const u = await learner();
    process.env.CONTENT_PREVIEW = "false";
    try {
      expect(await getLessonAccess(u, ids["what-contrast-does"])).toMatchObject({ allowed: false, reason: "not_published" });
    } finally {
      process.env.CONTENT_PREVIEW = "true";
    }
  });
});

describe("completion rules", () => {
  it("rejects skipping ahead through the lesson blocks", async () => {
    const u = await learner();
    await expect(recordBlockView(u, ids["what-contrast-does"], 3)).rejects.toMatchObject({ reason: "out_of_order" });
  });

  it("will not take a check before the earlier blocks have been viewed", async () => {
    const u = await learner();
    await expect(submitCheck(u, ids["what-contrast-does"], await answers(ids["what-contrast-does"], "what-contrast-does", true)))
      .rejects.toMatchObject({ reason: "out_of_order" });
  });

  it("keeps content after the check closed until it is passed", async () => {
    const u = await learner();
    const { checkIndex } = await viewThroughCheck(u, ids["what-contrast-does"]);
    await expect(recordBlockView(u, ids["what-contrast-does"], checkIndex + 1)).rejects.toMatchObject({ reason: "out_of_order" });
  });

  it("does not complete on a failed check, and records weak competencies from evidence", async () => {
    const u = await learner();
    await viewThroughCheck(u, ids["what-contrast-does"]);
    const res = await submitCheck(u, ids["what-contrast-does"], await answers(ids["what-contrast-does"], "what-contrast-does", false));
    expect(res).toMatchObject({ passed: false, completed: false });
    expect(await db.progress.count({ where: { userId: u } })).toBe(0);
    expect((await getWeakCompetencies(u)).map((w) => w.title)).toContain("Recognising contrast in real work");
  });

  it("completes only after a passing check, and then unlocks the next lesson", async () => {
    const u = await learner();
    const res = await passLesson(u, "what-contrast-does");
    expect(res).toMatchObject({ passed: true, completed: true, score: 100 });
    expect(await getLessonAccess(u, ids["contrast-in-type-and-media"])).toMatchObject({ allowed: true });
    const t = await getTimeline(u, pathId);
    expect(t!.modules[0].lessons.map((l) => l.state)).toEqual(["completed", "available", "locked"]);
    expect(t!.next?.title).toBe("Contrast in type, brand and moving media");
  });

  it("is idempotent under concurrent passing submissions", async () => {
    const u = await learner();
    await viewThroughCheck(u, ids["what-contrast-does"]);
    const right = await answers(ids["what-contrast-does"], "what-contrast-does", true);
    await Promise.all(Array.from({ length: 6 }, () => submitCheck(u, ids["what-contrast-does"], right)));
    expect(await db.progress.count({ where: { userId: u, nodeId: ids["what-contrast-does"] } })).toBe(1);
    expect(await db.auditEvent.count({ where: { actorId: u, action: "lesson.complete" } })).toBe(1);
  });
});

describe("what the learner can see", () => {
  it("never includes answer keys or explanations in the lesson view", async () => {
    const u = await learner();
    const view = await getLessonView(u, ids["what-contrast-does"]);
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/"answerKey"\s*:/);
    expect(json).not.toMatch(/"explanation"\s*:/);
    for (const l of lessons) for (const qn of l.questions) expect(json).not.toContain(qn.explanation);
    expect(view.questions.length).toBeGreaterThan(0);
  });
});
