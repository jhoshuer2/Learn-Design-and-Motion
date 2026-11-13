import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { loadOutcome } from "../src/lib/content/outcomes";
import { publishContent } from "../src/lib/content/publish";
import { LIMITS, hit } from "../src/lib/ratelimit";
import { getPlacementQuestions, parseBits, scorePlacement, summarise, toBits, type PlacementRow } from "../src/lib/placement";

const outcome = loadOutcome("kinetic-type-loop")!;
const content = loadContent();
const spec = new Map(content.modules.flatMap((m) => m.lessons.flatMap((l) => l.questions)).map((q) => [q.prompt, q.answer]));

beforeAll(async () => { process.env.CONTENT_PREVIEW = "true"; await publishContent(db, loadContent()); });
afterAll(async () => { await db.rateBucket.deleteMany({ where: { id: { startsWith: "placement:" } } }); await db.$disconnect(); });

const right = async () => {
  const qs = await getPlacementQuestions(outcome);
  return Object.fromEntries(qs.map((q) => { const a = spec.get(q.prompt)!; return [q.id, Array.isArray(a) ? a : [a]]; }));
};

describe("which questions", () => {
  it("gives one question per skill, in the outcome's skill order, never a visual-identification one", async () => {
    const qs = await getPlacementQuestions(outcome);
    expect(qs.map((q) => q.skill)).toEqual(outcome.skills);
    expect(qs.every((q) => q.type !== "VISUAL_IDENTIFICATION")).toBe(true);
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
  });

  it("uses only questions from the outcome's own path, tagged with the skill, and is stable", async () => {
    const qs = await getPlacementQuestions(outcome);
    const rows = await db.quizQuestion.findMany({ where: { id: { in: qs.map((q) => q.id) } }, include: { competency: true, lesson: { include: { module: { include: { level: { include: { path: true } } } } } } } });
    for (const r of rows) { expect(r.lesson.module.level.path.slug).toBe(outcome.path); expect(outcome.skills).toContain(r.competency!.slug); }
    expect((await getPlacementQuestions(outcome)).map((q) => q.id)).toEqual(qs.map((q) => q.id));
  });

  it("never sends answer keys or explanations to the page", async () => {
    for (const q of await getPlacementQuestions(outcome)) expect(Object.keys(q).sort()).toEqual(["id", "lessonTitle", "options", "prompt", "skill", "skillTitle", "type"]);
  });

  it("names the first lesson in path order that teaches each skill", async () => {
    const qs = await getPlacementQuestions(outcome);
    expect(qs.find((q) => q.skill === "motion-timing-easing")!.lessonTitle).toBe("Make motion feel alive");
    expect(qs.find((q) => q.skill === "motion-consistency")!.lessonTitle).toBe("One motion, three formats");
  });
});

describe("scoring", () => {
  it("is exact match: all right, all wrong, a mix, and unanswered counts as wrong", async () => {
    const good = await right();
    expect((await scorePlacement(outcome, good)).every((r) => r.known)).toBe(true);
    expect((await scorePlacement(outcome, Object.fromEntries(Object.keys(good).map((k) => [k, ["__wrong__"]])))).some((r) => r.known)).toBe(false);
    expect((await scorePlacement(outcome, {})).some((r) => r.known)).toBe(false);
    const ids = Object.keys(good), mixed = { [ids[0]]: good[ids[0]], [ids[1]]: ["__wrong__"] };
    expect((await scorePlacement(outcome, mixed)).map((r) => r.known)).toEqual([true, false, false, false, false, false]);
  });

  it("ignores answers for questions that are not part of this check", async () => {
    const some = await db.quizQuestion.findFirstOrThrow({ where: { competency: { slug: "contrast-recognition" } } });
    expect((await scorePlacement(outcome, { [some.id]: ["x"] })).some((r) => r.known)).toBe(false);
  });

  it("is a recommendation only: it writes no evidence, progress, attempts or practice", async () => {
    const count = async () => [await db.skillEvidence.count(), await db.progress.count(), await db.quizAttempt.count(), await db.practiceSession.count(), await db.blockView.count()];
    const before = await count();
    await scorePlacement(outcome, await right());
    expect(await count()).toEqual(before);
  });
});

describe("the result and its plan", () => {
  const row = (skill: string, known: boolean): PlacementRow => ({ skill, skillTitle: skill, lessonTitle: `Lesson ${skill}`, known });
  it("accepts only the exact bit string and ignores anything else", () => {
    expect(parseBits("101101", 6)).toEqual([true, false, true, true, false, true]);
    for (const bad of [undefined, "", "10110", "1011011", "10110x", "limited", "２０１１０１", "101101 ", "<script>"]) expect(parseBits(bad, 6), String(bad)).toBeNull();
    expect(toBits([row("a", true), row("b", false)])).toBe("10");
  });
  it("says the right thing for all right, none right and a mix, naming lessons in order", () => {
    expect(summarise([row("a", true), row("b", true)]).text).toMatch(/already know most of this/);
    expect(summarise([row("a", false), row("b", false)]).text).toMatch(/all new/);
    const mix = summarise([row("a", true), row("b", false), row("c", true), row("d", false)]);
    expect(mix.text).toBe("You can move quickly through: \u201cLesson a\u201d, \u201cLesson c\u201d. Take your time with: \u201cLesson b\u201d, \u201cLesson d\u201d.");
    expect(mix).toMatchObject({ known: 2, total: 4 });
    expect(summarise([]).text).toBe("");
  });
});

describe("the public limit", () => {
  it("allows a handful of tries per visitor and then says no, keeping visitors apart", async () => {
    process.env.RATE_PLACEMENT_PER_HOUR = "2";
    try {
      const a = () => hit("placement:visitor-a", LIMITS.placement()).then((r) => r.allowed);
      expect([await a(), await a(), await a()]).toEqual([true, true, false]);
      expect(await hit("placement:visitor-b", LIMITS.placement()).then((r) => r.allowed)).toBe(true);
    } finally { delete process.env.RATE_PLACEMENT_PER_HOUR; }
  });
});
