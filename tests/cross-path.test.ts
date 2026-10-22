import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import { assessLevel } from "../src/lib/progression/level";
import { remediationLessons } from "../src/lib/progression/remediation";
import { cleanup, evaluatedSubmission, makeUser, useTempStorage } from "./helpers";

/**
 * A competency (accessibility-contrast) is taught in more than one path. Learners must only be pointed at lessons of
 * their own path: others may not be open to them, and are not what they enrolled for.
 */
beforeAll(async () => {
  await useTempStorage();
  process.env.CONTENT_PREVIEW = "true";
  await publishContent(db, loadContent());
});
afterAll(async () => { await cleanup(); await db.$disconnect(); });

const pathOfLesson = async (lessonId: string) => (await db.lesson.findUniqueOrThrow({ where: { id: lessonId }, include: { module: { include: { level: { include: { path: true } } } } } })).module.level.path.slug;

describe("shared competencies across paths", () => {
  it("is taught in more than one path (so the rule below is actually exercised)", async () => {
    const links = await db.lessonCompetency.findMany({ where: { competency: { slug: "accessibility-contrast" } }, select: { lessonId: true } });
    const paths = new Set(await Promise.all(links.map((l) => pathOfLesson(l.lessonId))));
    expect(paths.size).toBeGreaterThan(1);
  });

  it("offers remediation lessons from the learner's own path only", async () => {
    const u = await makeUser();
    const s = await evaluatedSubmission(u, "[fake:set=contrast:40] [fake:score=70]");
    const ev = await db.evaluation.findFirstOrThrow({ where: { submissionId: s.submissionId } });
    const lessons = await remediationLessons(db, ev.id);
    expect(lessons.length).toBeGreaterThan(0);
    for (const l of lessons) expect(await pathOfLesson(l.lessonId), l.title).toBe("graphic-design");
  });

  it("offers retake lessons for a level's required skill from that level's path only", async () => {
    const u = await makeUser({ enroll: false });
    for (const [path, expected] of [["ui-design", "ui-design"], ["graphic-design", "graphic-design"]] as const) {
      const level = await db.level.findFirstOrThrow({ where: { tier: "BEGINNER", path: { slug: path } } });
      const a = await assessLevel(db, u, level.id);
      const check = a!.checks.find((c) => c.slug === "accessibility-contrast")!;
      expect(check.retakeLessons.length, path).toBeGreaterThan(0);
      for (const l of check.retakeLessons) expect(await pathOfLesson(l.lessonId), `${path}: ${l.title}`).toBe(expected);
    }
  });
});
