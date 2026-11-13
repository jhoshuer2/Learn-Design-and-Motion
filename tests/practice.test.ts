import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import { getWeakCompetencies } from "../src/lib/progression";
import { addDays, activityDays, currentRun, localDay, safeTz, weekStrip } from "../src/lib/practice/days";
import { pickQuestions, pickWarmupSkill } from "../src/lib/practice/pick";
import { PracticeError, getToday, submitWarmup } from "../src/lib/practice";
import { cleanup, makeUser, useTempStorage } from "./helpers";

describe("days", () => {
  it("uses the learner's own calendar day", () => {
    const t = new Date("2026-11-13T23:30:00Z");
    expect(localDay(t, "UTC")).toBe("2026-11-13");
    expect(localDay(t, "America/Los_Angeles")).toBe("2026-11-13");
    expect(localDay(t, "Pacific/Auckland")).toBe("2026-11-14"); // already tomorrow there
    expect(safeTz("Not/AZone")).toBe("UTC");
    expect(safeTz(undefined)).toBe("UTC");
  });

  it("counts a run ending today or yesterday, and a gap just starts a new run", () => {
    const today = "2026-11-13";
    const set = (...d: string[]) => new Set(d);
    expect(currentRun(set(), today)).toBe(0);
    expect(currentRun(set("2026-11-13"), today)).toBe(1);
    expect(currentRun(set("2026-11-12", "2026-11-11"), today)).toBe(2); // today not started yet: not a break
    expect(currentRun(set("2026-11-13", "2026-11-12", "2026-11-11"), today)).toBe(3);
    expect(currentRun(set("2026-11-13", "2026-11-11", "2026-11-10"), today)).toBe(1); // gap yesterday
    expect(currentRun(set("2026-11-10", "2026-11-09"), today)).toBe(0); // nothing recent, and no negative number
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("gives seven days ending today", () => {
    const w = weekStrip(activityDays([new Date("2026-11-12T10:00:00Z")], "UTC"), "2026-11-13");
    expect(w).toHaveLength(7);
    expect(w[6]).toMatchObject({ day: "2026-11-13", isToday: true, active: false });
    expect(w[5]).toMatchObject({ day: "2026-11-12", active: true });
  });
});

describe("choosing a warm-up", () => {
  const ev = (competencyId: string, score: number, daysAgo: number) => ({ competencyId, score, createdAt: new Date(Date.now() - daysAgo * 86400000) });
  it("takes the weakest result under the pass mark first, then the one practised longest ago", () => {
    const avail = new Set(["a", "b", "c"]);
    expect(pickWarmupSkill([ev("a", 90, 1), ev("b", 50, 1), ev("c", 70, 1)], avail)).toBe("b");
    expect(pickWarmupSkill([ev("a", 90, 1), ev("b", 85, 9), ev("c", 95, 3)], avail)).toBe("b"); // all fine: stalest
    expect(pickWarmupSkill([ev("a", 40, 5), ev("a", 95, 1), ev("b", 85, 2)], new Set(["a", "b"]))).toBe("b"); // a's LATEST is 95
  });
  it("ignores skills that have not been taught, and returns null when there is nothing", () => {
    expect(pickWarmupSkill([ev("z", 10, 1)], new Set(["a"]))).toBe("a");
    expect(pickWarmupSkill([], new Set())).toBeNull();
  });
  it("picks the same questions for the same seed and different ones on another day", () => {
    const pool = Array.from({ length: 12 }, (_, i) => ({ id: `q${i}` }));
    const a = pickQuestions(pool, "u:2026-11-13:s").map((q) => q.id);
    expect(pickQuestions([...pool].reverse(), "u:2026-11-13:s").map((q) => q.id)).toEqual(a);
    expect(a).toHaveLength(3);
    const days = ["14", "15", "16", "17"].map((d) => pickQuestions(pool, `u:2026-11-${d}:s`).map((q) => q.id).join());
    expect(days.some((x) => x !== a.join())).toBe(true);
  });
});

describe("the warm-up", () => {
  const content = loadContent();
  const mod = content.modules.find((m) => m.def.slug === "kinetic-type-loop")!;
  let motionPathId: string, gdPathId: string;
  const lessonIds: Record<string, string> = {};
  const NOW = new Date("2026-11-13T10:00:00Z");

  beforeAll(async () => {
    await useTempStorage();
    process.env.CONTENT_PREVIEW = "true";
    await publishContent(db, loadContent());
    const m = await db.level.findFirstOrThrow({ where: { tier: "BEGINNER", path: { slug: "motion-design" } } });
    motionPathId = m.pathId;
    gdPathId = (await db.level.findFirstOrThrow({ where: { tier: "BEGINNER", path: { slug: "graphic-design" } } })).pathId;
    for (const l of await db.lesson.findMany({ where: { module: { levelId: m.id } } })) lessonIds[l.slug] = l.id;
  });
  afterAll(async () => { await cleanup(); await db.$disconnect(); });

  async function learner(opts: { path?: string; completed?: string[]; evidence?: [string, number][] } = {}) {
    const u = await makeUser({ enroll: false });
    await db.enrollment.create({ data: { userId: u, pathId: opts.path ?? motionPathId } });
    for (const s of opts.completed ?? []) await db.progress.create({ data: { userId: u, nodeType: "LESSON", nodeId: lessonIds[s], state: "COMPLETED", completedAt: NOW } });
    for (const [slug, score] of opts.evidence ?? []) {
      const c = await db.competency.findUniqueOrThrow({ where: { slug } });
      await db.skillEvidence.create({ data: { userId: u, competencyId: c.id, source: "QUIZ", sourceId: "t", score, tier: "BEGINNER", createdAt: new Date("2026-11-01T00:00:00Z") } });
    }
    return u;
  }
  const correctAnswers = async (qids: string[]) => {
    const rows = await db.quizQuestion.findMany({ where: { id: { in: qids } } });
    const spec = new Map(mod.lessons.flatMap((l) => l.questions).map((q) => [q.prompt, q.answer]));
    return Object.fromEntries(rows.map((r) => { const a = spec.get(r.prompt)!; return [r.id, Array.isArray(a) ? a : [a]]; }));
  };

  it("has nothing to offer before a lesson is completed, and refuses to score one", async () => {
    const u = await learner();
    expect((await getToday(u, "UTC", NOW)).warmup).toEqual({ state: "none" });
    await expect(submitWarmup(u, "UTC", {}, NOW)).rejects.toMatchObject({ code: "nothing_to_practise" });
  });

  it("practises the weakest taught skill with three questions from completed lessons, without answer keys", async () => {
    const u = await learner({ completed: ["motion-feels-alive", "keyframes-move-scale-fade"], evidence: [["motion-timing-easing", 60], ["motion-keyframes", 90]] });
    const t = await getToday(u, "UTC", NOW);
    if (t.warmup.state !== "open") throw new Error("expected an open warm-up");
    expect(t.warmup.skill).toMatch(/timing and easing/i);
    expect(t.warmup.questions).toHaveLength(3);
    const rows = await db.quizQuestion.findMany({ where: { id: { in: t.warmup.questions.map((q) => q.id) } }, include: { competency: true } });
    for (const r of rows) { expect(r.competency!.slug).toBe("motion-timing-easing"); expect(r.lessonId).toBe(lessonIds["motion-feels-alive"]); }
    for (const q of t.warmup.questions) expect(Object.keys(q).sort()).toEqual(["id", "options", "prompt", "type"]);
    const again = await getToday(u, "UTC", NOW);
    expect(again.warmup.state === "open" && again.warmup.questions.map((q) => q.id)).toEqual(t.warmup.questions.map((q) => q.id)); // a refresh does not reshuffle
  });

  it("scores on the server, is practice only, and allows one per day", async () => {
    const u = await learner({ completed: ["motion-feels-alive"], evidence: [["motion-timing-easing", 60]] });
    const t = await getToday(u, "UTC", NOW);
    if (t.warmup.state !== "open") throw new Error("open expected");
    const evBefore = await db.skillEvidence.count({ where: { userId: u } });
    const weakBefore = await getWeakCompetencies(u);
    const res = await submitWarmup(u, "UTC", await correctAnswers(t.warmup.questions.map((q) => q.id)), NOW);
    expect(res).toMatchObject({ correct: 3, total: 3 });
    expect(await db.skillEvidence.count({ where: { userId: u } })).toBe(evBefore); // never evidence
    expect(await getWeakCompetencies(u)).toEqual(weakBefore); // the weak skill stays weak: only assessed work changes it
    await expect(submitWarmup(u, "UTC", {}, NOW)).rejects.toMatchObject({ code: "already_done" });
    const done = await getToday(u, "UTC", NOW);
    expect(done.warmup).toMatchObject({ state: "done", correct: 3, total: 3 });
    expect(done.week.at(-1)).toMatchObject({ active: true, isToday: true });
  });

  it("counts wrong answers exactly and explains them with a link to the idea step", async () => {
    const u = await learner({ completed: ["motion-feels-alive"], evidence: [["motion-timing-easing", 60]] });
    const t = await getToday(u, "UTC", NOW);
    if (t.warmup.state !== "open") throw new Error("open expected");
    const ids = t.warmup.questions.map((q) => q.id);
    await submitWarmup(u, "UTC", Object.fromEntries(ids.map((id) => [id, ["__wrong__"]])), NOW);
    const done = await getToday(u, "UTC", NOW);
    if (done.warmup.state !== "done") throw new Error("done expected");
    expect(done.warmup.correct).toBe(0);
    const blocks = (await db.lesson.findUniqueOrThrow({ where: { id: lessonIds["motion-feels-alive"] } })).blocks as unknown as { kind: string }[];
    for (const it of done.warmup.items) {
      expect(it.explanation).toBeTruthy();
      expect(blocks[Number(new URL(it.ideaHref, "http://x").searchParams.get("step"))].kind).toBe("concept");
    }
  });

  it("settles two racing submits on one session, and rejects answers for other questions", async () => {
    const u = await learner({ completed: ["motion-feels-alive"], evidence: [["motion-timing-easing", 60]] });
    const t = await getToday(u, "UTC", NOW);
    if (t.warmup.state !== "open") throw new Error("open expected");
    await expect(submitWarmup(u, "UTC", { "not-today": ["x"] }, NOW)).rejects.toMatchObject({ code: "bad_answers" });
    const ans = await correctAnswers(t.warmup.questions.map((q) => q.id));
    const r = await Promise.allSettled([submitWarmup(u, "UTC", ans, NOW), submitWarmup(u, "UTC", ans, NOW)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(r.find((x) => x.status === "rejected")).toMatchObject({ reason: expect.any(PracticeError) });
    expect(await db.practiceSession.count({ where: { userId: u } })).toBe(1);
  });

  it("only offers skills taught in the learner's own paths", async () => {
    const u = await learner({ path: gdPathId, completed: ["motion-feels-alive"] }); // enrolled in Graphic Design, lesson done in Motion
    expect((await getToday(u, "UTC", NOW)).warmup).toEqual({ state: "none" });
  });

  it("uses the learner's own day: the same instant is a different warm-up day in another time zone", async () => {
    const u = await learner({ completed: ["motion-feels-alive"], evidence: [["motion-timing-easing", 60]] });
    const late = new Date("2026-11-13T23:30:00Z");
    const t = await getToday(u, "UTC", late);
    if (t.warmup.state !== "open") throw new Error("open expected");
    await submitWarmup(u, "UTC", await correctAnswers(t.warmup.questions.map((q) => q.id)), late);
    expect((await getToday(u, "UTC", late)).warmup.state).toBe("done");
    expect((await getToday(u, "Pacific/Auckland", late)).warmup.state).toBe("open"); // it is already the next day there
  });
});
