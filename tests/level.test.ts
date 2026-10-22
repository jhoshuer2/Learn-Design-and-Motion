import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import { evaluateSubmission } from "../src/lib/assessment/evaluate";
import { FakeProvider } from "../src/lib/assessment/fake";
import { getAssignmentAccess, getLessonAccess, getTimeline, recordBlockView, submitCheck, type StoredBlock } from "../src/lib/progression";
import { assessLevel, completeLevelIfEligible, recheckLevelsAfterEvidence } from "../src/lib/progression/level";
import { RemediationError, completeRemediation, getSkillProfile, startRemediation } from "../src/lib/progression/remediation";
import { createAppeal, resolveAppeal } from "../src/lib/review";
import { SubmissionError, createSubmission } from "../src/lib/submissions";
import { RATIONALE, cleanup, makeUser, useTempStorage } from "./helpers";

const fake = new FakeProvider();
let capstoneId: string, moduleAssessmentId: string, levelId: string, pathId: string;

const img = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#335577" } }).png().toBuffer();
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof SubmissionError || e instanceof RemediationError ? e.code : `other:${e}`));
const PLAN = "I will darken the date and venue text, measure every pair against the minimum, and rebuild the banner hierarchy.";

async function lessonsDone(userId: string) {
  const ls = await db.lesson.findMany({ where: { module: { slug: "understanding-contrast" } }, select: { id: true } });
  await db.progress.createMany({ data: ls.map((l) => ({ userId, nodeType: "LESSON", nodeId: l.id, state: "COMPLETED" as const, completedAt: new Date() })), skipDuplicates: true });
}
async function moduleAssessmentPassed(userId: string) {
  await db.progress.createMany({ data: [{ userId, nodeType: "ASSIGNMENT", nodeId: moduleAssessmentId, state: "COMPLETED" as const, completedAt: new Date() }], skipDuplicates: true });
}
/** Evidence the learner would have from lessons: accessibility-contrast demonstrated at the given score. */
async function evidence(userId: string, slug: string, score: number, source = "QUIZ") {
  const c = await db.competency.findUniqueOrThrow({ where: { slug } });
  await db.skillEvidence.create({ data: { userId, competencyId: c.id, source, sourceId: `t-${Math.random()}`, score, tier: "BEGINNER" } });
}
async function atCapstone() {
  const u = await makeUser();
  await lessonsDone(u);
  await moduleAssessmentPassed(u);
  await evidence(u, "accessibility-contrast", 90);
  return u;
}
async function submitCapstone(u: string, marker: string, changes?: string) {
  const { submissionId } = await createSubmission(u, capstoneId, {
    files: [
      { slot: "poster", name: "poster.png", data: await img(800, 1200) },
      { slot: "social-square", name: "square.png", data: await img(600, 600) },
      { slot: "banner", name: "banner.png", data: await img(728, 90) },
    ],
    rationale: `${RATIONALE} ${marker}`, changesNote: changes,
  });
  const out = await evaluateSubmission(submissionId, { provider: fake });
  if (out.state !== "evaluated") throw new Error(`expected evaluated, got ${out.state}`);
  return { submissionId, evaluationId: out.evaluationId, out };
}
const levelRows = (u: string) => db.progress.count({ where: { userId: u, nodeType: "LEVEL", nodeId: levelId } });
const completions = (u: string) => db.levelCompletion.count({ where: { userId: u } });
const audits = (u: string, action: string) => db.auditEvent.count({ where: { actorId: u, action } });

async function retakeCheck(userId: string, slug: string, right: boolean) {
  const lesson = await db.lesson.findFirstOrThrow({ where: { slug, module: { slug: "understanding-contrast" } }, orderBy: { version: "desc" } });
  const blocks = lesson.blocks as StoredBlock[];
  const checkIndex = blocks.findIndex((b) => b.kind === "check");
  for (let i = 0; i < checkIndex; i++) await recordBlockView(userId, lesson.id, i);
  const spec = loadContent().modules.find((m) => m.def.slug === "understanding-contrast")!.lessons.find((l) => l.meta.slug === slug)!;
  const qs = await db.quizQuestion.findMany({ where: { lessonId: lesson.id } });
  const answers = Object.fromEntries(qs.map((q) => {
    const a = spec.questions.find((x) => x.prompt === q.prompt)!.answer;
    return [q.id, right ? (Array.isArray(a) ? a : [a]) : ["__wrong__"]];
  }));
  return submitCheck(userId, lesson.id, answers);
}

beforeAll(async () => {
  await useTempStorage();
  process.env.CONTENT_PREVIEW = "true";
  await publishContent(db, loadContent());
  const cap = await db.assignment.findUniqueOrThrow({ where: { slug: "contrast-campaign-capstone" } });
  capstoneId = cap.id; levelId = cap.levelId!;
  moduleAssessmentId = (await db.assignment.findUniqueOrThrow({ where: { slug: "high-contrast-event-poster" } })).id;
  pathId = (await db.level.findUniqueOrThrow({ where: { id: levelId } })).pathId;
});
afterAll(async () => {
  const ids = (await db.user.findMany({ where: { email: { endsWith: "@test.local" } }, select: { id: true } })).map((u) => u.id);
  await db.remediation.deleteMany({ where: { userId: { in: ids } } });
  await db.levelCompletion.deleteMany({ where: { userId: { in: ids } } });
  await cleanup();
  await db.$disconnect();
});

describe("capstone access", () => {
  it("is locked until every module, including its assessment, is complete", async () => {
    const u = await makeUser();
    expect(await getAssignmentAccess(u, capstoneId)).toMatchObject({ allowed: false, reason: "modules_incomplete", missing: ["Understanding Contrast"] });
    await lessonsDone(u);
    expect(await getAssignmentAccess(u, capstoneId)).toMatchObject({ allowed: false, reason: "modules_incomplete" }); // assessment not passed
    await moduleAssessmentPassed(u);
    expect(await getAssignmentAccess(u, capstoneId)).toMatchObject({ allowed: true, attempt: 1, attemptsUsed: 0, maxAttempts: 3 });
  });

  it("requires every required piece, and needs no unknown deliverables", async () => {
    const u = await atCapstone();
    const p = { slot: "poster", name: "p.png", data: await img(800, 1200) };
    expect(await code(createSubmission(u, capstoneId, { files: [{ ...p, slot: "nonsense" }], rationale: RATIONALE }))).toBe("unknown_deliverable");
    expect(await code(createSubmission(u, capstoneId, { files: [p, p], rationale: RATIONALE }))).toBe("duplicate_deliverable");
    // Only one of three required pieces: evaluation asks for the missing ones and calls no model.
    const { submissionId } = await createSubmission(u, capstoneId, { files: [p], rationale: RATIONALE });
    const out = await evaluateSubmission(submissionId, { provider: fake });
    expect(out.state).toBe("needs_evidence");
    const ev = await db.evaluation.findFirstOrThrow({ where: { submissionId } });
    expect(ev.missingEvidence.join(" ")).toMatch(/Social square/);
    expect(ev.missingEvidence.join(" ")).toMatch(/Web banner/);
  });
});

describe("level unlock", () => {
  it("unlocks once on a passing capstone with required competencies met, and records an honest snapshot", async () => {
    const u = await atCapstone();
    const r = await submitCapstone(u, "[fake:score=92]");
    expect(r.out).toMatchObject({ passed: true, score: 92 });
    expect(await levelRows(u)).toBe(1);
    expect(await completions(u)).toBe(1);
    expect(await audits(u, "level.unlock")).toBe(1);

    const rec = await db.levelCompletion.findFirstOrThrow({ where: { userId: u } });
    const e = rec.evidence as any;
    expect(rec.title).toBe("Graphic Design, Beginner: Contrast foundations");
    expect(e.limits).toMatch(/not a professional qualification/);
    expect(e.scope.note).toMatch(/does not show mastery of the full Beginner curriculum/);
    expect(e.testEvaluatorUsed).toBe(true); // this record came from the test evaluator and says so
    expect(JSON.stringify(e.works)).toMatch(/TEST EVALUATOR/);
    expect(e.works.map((w: any) => w.assignment)).toContain("contrast-campaign-capstone");
    expect(e.requiredCompetencies[0]).toMatchObject({ slug: "accessibility-contrast", needed: 80 });
  });

  it("shows the next level as open but not authored, and does not pretend otherwise", async () => {
    const u = await atCapstone();
    await submitCapstone(u, "[fake:score=92]");
    const t = (await getTimeline(u, pathId))!;
    expect(t.levels.map((l) => [l.tier, l.state, l.unlocked])).toEqual([
      ["BEGINNER", "complete", true], ["INTERMEDIATE", "not_authored", true], ["ADVANCED", "not_authored", false], ["PROFESSIONAL", "not_authored", false],
    ]);
    expect(t.levels[1].scopeNote).toMatch(/No lessons or assessments have been written/);
  });

  it("does not unlock on a failing capstone", async () => {
    const u = await atCapstone();
    expect((await submitCapstone(u, "[fake:score=70]")).out).toMatchObject({ passed: false });
    expect(await levelRows(u)).toBe(0);
    expect(await completions(u)).toBe(0);
  });

  it("does not unlock when a mandatory capstone criterion is below its minimum, however high the total", async () => {
    const u = await atCapstone();
    const r = await submitCapstone(u, "[fake:score=97] [fake:set=consistency-across-pieces:40]");
    expect(r.out).toMatchObject({ passed: false });
    expect((r.out as { score: number }).score).toBeGreaterThanOrEqual(85);
    expect(await levelRows(u)).toBe(0);
  });

  it("does not unlock a passing capstone while a required competency is below 80, names why, then unlocks when it is demonstrated", async () => {
    const u = await makeUser();
    await lessonsDone(u); await moduleAssessmentPassed(u);
    const r = await submitCapstone(u, "[fake:score=96] [fake:set=accessible-contrast:70]");
    expect(r.out).toMatchObject({ passed: true }); // the capstone itself passed (70 >= its 60 minimum)
    expect((r.out as { score: number }).score).toBeGreaterThanOrEqual(90);
    expect(await db.progress.count({ where: { userId: u, nodeType: "ASSIGNMENT", nodeId: capstoneId } })).toBe(1);
    expect(await levelRows(u)).toBe(0);

    const a = (await assessLevel(db, u, levelId))!;
    expect(a.eligible).toBe(false);
    expect(a.blockedBy).toEqual([{ type: "competency", slug: "accessibility-contrast", title: "Accessible colour contrast", latestScore: 70, needed: 80 }]);
    expect(a.checks[0].retakeLessons.map((l) => l.title)).toContain("Contrast and accessibility");
    expect((await getTimeline(u, pathId))!.next).toMatchObject({ levelId });

    // Failing the retaken check leaves it blocked; passing it demonstrates the skill and unlocks without another capstone.
    expect((await retakeCheck(u, "contrast-and-accessibility", false)).passed).toBe(false);
    expect(await levelRows(u)).toBe(0);
    expect((await retakeCheck(u, "contrast-and-accessibility", true)).passed).toBe(true);
    expect(await levelRows(u)).toBe(1);
    expect(await completions(u)).toBe(1);
  });

  it("is idempotent under concurrent unlock attempts", async () => {
    const u = await atCapstone();
    await submitCapstone(u, "[fake:score=92]");
    await db.progress.deleteMany({ where: { userId: u, nodeType: "LEVEL" } });
    await db.levelCompletion.deleteMany({ where: { userId: u } });
    await db.auditEvent.deleteMany({ where: { actorId: u, action: "level.unlock" } });

    const results = await Promise.all(Array.from({ length: 6 }, () => db.$transaction((tx) => completeLevelIfEligible(tx, u, levelId))));
    expect(results.filter((r) => r.unlocked)).toHaveLength(1);
    expect(await levelRows(u)).toBe(1);
    expect(await completions(u)).toBe(1);
    expect(await audits(u, "level.unlock")).toBe(1);
    await recheckLevelsAfterEvidence(u); // re-running is a no-op
    expect(await completions(u)).toBe(1);
  });

  it("keeps the completion record unchanged when level content changes later", async () => {
    const u = await atCapstone();
    await submitCapstone(u, "[fake:score=92]");
    const before = await db.levelCompletion.findFirstOrThrow({ where: { userId: u } });
    const level = await db.level.findUniqueOrThrow({ where: { id: levelId } });
    await db.level.update({ where: { id: levelId }, data: { scopeLabel: "Renamed later", capstoneThreshold: 99 } });
    try {
      const after = await db.levelCompletion.findFirstOrThrow({ where: { userId: u } });
      expect(after.title).toBe(before.title);
      expect(JSON.stringify(after.evidence)).toBe(JSON.stringify(before.evidence));
    } finally {
      await db.level.update({ where: { id: levelId }, data: { scopeLabel: level.scopeLabel, capstoneThreshold: level.capstoneThreshold } });
    }
  });

  it("unlocks through the same gate when a human reviewer overrides a failed capstone to a pass", async () => {
    const u = await atCapstone();
    const r = await submitCapstone(u, "[fake:score=70]");
    expect(await levelRows(u)).toBe(0);
    const appeal = await createAppeal(u, r.evaluationId, "I believe the campaign hierarchy and consistency are stronger than scored.");
    const rev = await makeUser({ role: "REVIEWER", enroll: false });
    const ev = await db.evaluation.findUniqueOrThrow({ where: { id: r.evaluationId }, include: { scores: true } });
    await resolveAppeal({ id: rev, role: "REVIEWER" }, appeal.id, {
      decision: "override", note: "On review the campaign meets the bar across all pieces.",
      scores: ev.scores.map((s) => ({ criterionId: s.criterionId, score: 92, comment: "Reviewer rescored this criterion." })),
    });
    expect(await levelRows(u)).toBe(1);
    const e = (await db.levelCompletion.findFirstOrThrow({ where: { userId: u } })).evidence as any;
    expect(e.works.find((w: any) => w.kind === "CAPSTONE").humanReviewed).toBe(true);
  });

  it("is written by nothing but the level engine", () => {
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f.name) && /nodeType:\s*"LEVEL"/.test(fs.readFileSync(p, "utf8"))) hits.push(path.relative(process.cwd(), p));
      }
    };
    walk(path.join(process.cwd(), "src"));
    expect(hits).toEqual(["src/lib/progression/level.ts"]);
  });
});

describe("level lock", () => {
  const ids: { level?: string; module?: string; lesson?: string } = {};
  beforeAll(async () => {
    const lv = await db.level.create({ data: { pathId, tier: "INTERMEDIATE", objectives: [], status: "DRAFT", scopeLabel: "Fixture", scopeNote: "Test fixture level." } });
    const mod = await db.module.create({ data: { levelId: lv.id, slug: "fixture-module", title: "Fixture module", position: 0, objectives: [], status: "DRAFT" } });
    const lesson = await db.lesson.create({ data: { moduleId: mod.id, slug: "fixture-lesson", title: "Fixture lesson", position: 0, objective: "Fixture objective text", blocks: [{ kind: "objective", title: "x", body: "y" }], status: "DRAFT" } });
    Object.assign(ids, { level: lv.id, module: mod.id, lesson: lesson.id });
  });
  afterAll(async () => {
    await db.progress.deleteMany({ where: { nodeId: ids.level } });
    await db.lesson.deleteMany({ where: { id: ids.lesson } });
    await db.module.deleteMany({ where: { id: ids.module } });
    await db.level.deleteMany({ where: { id: ids.level } });
  });

  it("keeps a later level's lessons closed until the previous level is complete, then opens them", async () => {
    const u = await makeUser();
    expect(await getLessonAccess(u, ids.lesson!)).toMatchObject({ allowed: false, reason: "level_locked" });
    await db.progress.create({ data: { userId: u, nodeType: "LEVEL", nodeId: (await db.level.findFirstOrThrow({ where: { pathId, tier: "BEGINNER" } })).id, state: "COMPLETED", completedAt: new Date() } });
    expect(await getLessonAccess(u, ids.lesson!)).toMatchObject({ allowed: true });
  });
});

describe("remediation", () => {
  async function exhausted() {
    const u = await atCapstone();
    await submitCapstone(u, "[fake:score=60]");
    await submitCapstone(u, "[fake:score=62]", "Changed the hierarchy and spacing across the pieces.");
    await submitCapstone(u, "[fake:score=64] [fake:set=accessible-contrast:50]", "Reworked type and colour across the pieces again.");
    return u;
  }

  it("is required once all three attempts are used, and not before", async () => {
    const u = await atCapstone();
    await submitCapstone(u, "[fake:score=60]");
    expect(await getAssignmentAccess(u, capstoneId)).toMatchObject({ allowed: true, attemptsUsed: 1 });
    expect(await code(startRemediation(u, capstoneId))).toBe("not_required");
    await submitCapstone(u, "[fake:score=62]", "Changed the hierarchy and spacing across the pieces.");
    await submitCapstone(u, "[fake:score=64]", "Reworked type and colour across the pieces again.");
    expect(await getAssignmentAccess(u, capstoneId)).toMatchObject({ allowed: false, reason: "remediation_required", attemptsUsed: 3, maxAttempts: 3 });
    expect((await getTimeline(u, pathId))!.next).toMatchObject({ remediationFor: capstoneId });
  });

  it("targets the lessons behind the failed criteria, and a double start opens one remediation", async () => {
    const u = await exhausted();
    const [a, b] = await Promise.all([startRemediation(u, capstoneId), startRemediation(u, capstoneId)]);
    expect(a.id).toBe(b.id);
    expect(await db.remediation.count({ where: { userId: u } })).toBe(1);
    const titles = (await db.lesson.findMany({ where: { id: { in: a.requiredLessonIds } } })).map((l) => l.title);
    expect(titles).toContain("Contrast and accessibility"); // accessible-contrast was scored 50 in the last attempt
  });

  it("does not complete without NEW passing checks, even if the learner passed them before", async () => {
    const u = await exhausted();
    const rem = await startRemediation(u, capstoneId);
    // An old pass that predates the remediation does not count.
    expect(rem.requiredLessonIds.length).toBeGreaterThan(1);
    for (const lessonId of rem.requiredLessonIds) {
      await db.quizAttempt.create({ data: { userId: u, lessonId, score: 100, passed: true, responses: {}, createdAt: new Date(rem.createdAt.getTime() - 60_000) } });
    }
    expect(await code(completeRemediation(u, capstoneId, PLAN))).toBe("checks_incomplete");
    expect(await getAssignmentAccess(u, capstoneId)).toMatchObject({ allowed: false, reason: "remediation_required" });
  });

  it("requires a written action plan", async () => {
    const u = await exhausted();
    await startRemediation(u, capstoneId);
    expect(await code(completeRemediation(u, capstoneId, "do better"))).toBe("action_plan_required");
  });

  it("grants exactly two more attempts once, after which only human review remains", async () => {
    const u = await exhausted();
    const rem = await startRemediation(u, capstoneId);
    const lessons = await db.lesson.findMany({ where: { id: { in: rem.requiredLessonIds } } });
    for (const l of lessons) expect((await retakeCheck(u, l.slug, true)).passed).toBe(true);
    const both = await Promise.all([completeRemediation(u, capstoneId, PLAN), completeRemediation(u, capstoneId, PLAN)]);
    expect(both.filter((r) => r.newlyCompleted)).toHaveLength(1);
    expect(await audits(u, "remediation.complete")).toBe(1);

    expect(await getAssignmentAccess(u, capstoneId)).toMatchObject({ allowed: true, attempt: 4, attemptsUsed: 3, maxAttempts: 5 });
    await submitCapstone(u, "[fake:score=70]", "Rebuilt the banner and darkened the venue text.");
    await submitCapstone(u, "[fake:score=72]", "Adjusted spacing and colour logic everywhere.");
    expect(await getAssignmentAccess(u, capstoneId)).toMatchObject({ allowed: false, reason: "no_attempts_left", attemptsUsed: 5, maxAttempts: 5 });
    expect(await code(startRemediation(u, capstoneId))).toBe("not_required"); // one reset only
  });

  it("lets the learner pass the capstone after remediation and unlocks the level", async () => {
    const u = await exhausted();
    const rem = await startRemediation(u, capstoneId);
    for (const l of await db.lesson.findMany({ where: { id: { in: rem.requiredLessonIds } } })) await retakeCheck(u, l.slug, true);
    await completeRemediation(u, capstoneId, PLAN);
    expect((await submitCapstone(u, "[fake:score=93]", "Raised contrast of the date and rebuilt the banner order.")).out).toMatchObject({ passed: true });
    expect(await levelRows(u)).toBe(1);
  });
});

describe("skill profile", () => {
  const row = async (u: string, slug: string) => (await getSkillProfile(u)).find((r) => r.slug === slug)!;

  it("never reports a skill without evidence", async () => {
    const u = await makeUser();
    const p = await getSkillProfile(u);
    expect(p.length).toBeGreaterThan(0);
    expect(p.every((r) => r.status === "not_assessed" && r.tier === null && r.evidenceCount === 0)).toBe(true);
  });

  it("applies the 80 boundary and uses the latest evidence, not the best or the average", async () => {
    const u = await makeUser();
    await evidence(u, "contrast-recognition", 79);
    expect(await row(u, "contrast-recognition")).toMatchObject({ status: "needs_improvement", tier: null, latestScore: 79 });
    await evidence(u, "contrast-recognition", 80);
    expect(await row(u, "contrast-recognition")).toMatchObject({ status: "demonstrated", tier: "BEGINNER", latestScore: 80 });
    await evidence(u, "contrast-recognition", 55);
    expect(await row(u, "contrast-recognition")).toMatchObject({ status: "needs_improvement", latestScore: 55, evidenceCount: 3 });
  });

  it("counts quiz and assessed evidence separately", async () => {
    const u = await makeUser();
    await evidence(u, "contrast-application", 90, "QUIZ");
    await evidence(u, "contrast-application", 85, "EVALUATION");
    expect(await row(u, "contrast-application")).toMatchObject({ quizEvidence: 1, assessedEvidence: 1, status: "demonstrated" });
  });
});
