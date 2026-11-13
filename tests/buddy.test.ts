import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import { evaluateSubmission } from "../src/lib/assessment/evaluate";
import { FakeProvider } from "../src/lib/assessment/fake";
import { createSubmission } from "../src/lib/submissions";
import { buildBuddyFrom, openingLine, plainContrast, rankFixes, type CriterionInput } from "../src/lib/submissions/buddy";
import { getSubmissionView } from "../src/lib/submissions/view";
import { RATIONALE, cleanup, makeUser, useTempStorage } from "./helpers";

const c = (key: string, score: number, o: Partial<CriterionInput> = {}): CriterionInput => ({
  key, title: key, weight: 20, mandatory: false, minScore: null, score, evidence: `evidence ${key}`, improvement: `improve ${key}`, competencyId: null, ...o,
});

describe("what the buddy says first", () => {
  it("puts a mandatory criterion under its minimum ahead of everything, then the most weighted points at stake", () => {
    const list = [c("a", 40, { weight: 30 }), c("b", 55, { mandatory: true, minScore: 60, weight: 10 }), c("d", 70, { weight: 20 }), c("e", 90)];
    expect(rankFixes(list).map((x) => x.key)).toEqual(["b", "a", "d"]); // b is below its minimum; e is good enough
  });

  it("orders several shortfalls by how far below the minimum they are, and breaks ties by name", () => {
    const list = [c("x", 50, { mandatory: true, minScore: 60 }), c("y", 30, { mandatory: true, minScore: 60 }), c("m", 70), c("k", 70)];
    expect(rankFixes(list).map((x) => x.key)).toEqual(["y", "x", "k", "m"]);
  });

  it("offers no fix when everything is good enough, and says so warmly", () => {
    const b = buildBuddyFrom({ passed: true, score: 90, previousScore: null, criteria: [c("a", 90), c("b", 85)], previous: new Map(), links: new Map() });
    expect(b.nextFix).toBeNull();
    expect(b.opening).toMatch(/nothing big left to fix/);
    expect(b.nailed.map((n) => n.key)).toEqual(["a", "b"]);
  });

  it("celebrates progress, and never uses judging words", () => {
    const b = buildBuddyFrom({ passed: false, score: 62, previousScore: 50, criteria: [c("a", 40), c("b", 80)], previous: new Map([["a", 30], ["b", 70]]), links: new Map() });
    expect(b.progress).toEqual({ previousScore: 50, delta: 12 });
    expect(b.opening).toMatch(/moved up 12 points/);
    expect(b.nextFix).toMatchObject({ key: "a", delta: 10 });
    const words = JSON.stringify([b.opening, b.closing, openingLine({ passed: false, delta: null, hasFix: true }), openingLine({ passed: false, delta: -5, hasFix: true })]);
    expect(words).not.toMatch(/fail|wrong|bad|poor|terrible|mistake/i);
  });

  it("does not claim progress when the score went down", () => {
    expect(openingLine({ passed: false, delta: -4, hasFix: true })).not.toMatch(/moved up/);
  });

  it("limits what it shows: three strengths, one next fix, two more", () => {
    const many = ["a", "b", "c", "d", "e", "f"].map((k, i) => c(k, 40 + i * 5, { weight: 15 }));
    const strong = ["s1", "s2", "s3", "s4"].map((k) => c(k, 90));
    const b = buildBuddyFrom({ passed: false, score: 60, previousScore: null, criteria: [...many, ...strong], previous: new Map(), links: new Map() });
    expect(b.nailed).toHaveLength(3);
    expect(b.nextFix).not.toBeNull();
    expect(b.moreFixes).toHaveLength(2);
  });
});

describe("the lesson excerpt shown beside the learner's work", () => {
  it("turns a markdown table into readable sentences and drops media lines", () => {
    const body = "Compare these.\n\n<<demo:contrast-lab|x>>\n\n| Problem | Weak fix | Strong fix |\n|---|---|---|\n| Grey on cream | Make it bold | Darken the colour |\n| Light on photo | Thin font | Add a scrim |\n| Third | A | B |";
    const t = plainContrast(body);
    expect(t).toContain("Compare these.");
    expect(t).toContain("Grey on cream → Make it bold → Darken the colour");
    expect(t).not.toMatch(/\||<<|---/);
    expect(t).not.toContain("Third");
  });
  it("keeps prose and strips markdown marks", () => {
    expect(plainContrast("- **Weak:** one speed.\n- **Alive:** eased.")).toBe("- Weak: one speed. - Alive: eased.");
  });
});

describe("the buddy view of a real assessment", () => {
  const fake = new FakeProvider();
  let assignmentId: string;
  beforeAll(async () => {
    await useTempStorage();
    process.env.CONTENT_PREVIEW = "true";
    await publishContent(db, loadContent());
    assignmentId = (await db.assignment.findUniqueOrThrow({ where: { slug: "high-contrast-event-poster" } })).id;
  });
  afterAll(async () => {
    const ids = (await db.user.findMany({ where: { email: { endsWith: "@test.local" } }, select: { id: true } })).map((u) => u.id);
    await db.remediation.deleteMany({ where: { userId: { in: ids } } });
    await db.levelCompletion.deleteMany({ where: { userId: { in: ids } } });
    await cleanup();
    await db.$disconnect();
  });

  async function ready() {
    const u = await makeUser();
    const lessons = await db.lesson.findMany({ where: { module: { slug: "understanding-contrast" } }, select: { id: true } });
    await db.progress.createMany({ data: lessons.map((l) => ({ userId: u, nodeType: "LESSON", nodeId: l.id, state: "COMPLETED" as const, completedAt: new Date() })), skipDuplicates: true });
    return u;
  }
  async function attempt(u: string, marker: string, changes?: string) {
    const { submissionId } = await createSubmission(u, assignmentId, {
      files: [
        { slot: "final", name: "p.png", data: await (await import("sharp")).default({ create: { width: 800, height: 1200, channels: 3, background: "#335577" } }).png().toBuffer() },
        { slot: "preview", name: "s.png", data: await (await import("sharp")).default({ create: { width: 267, height: 400, channels: 3, background: "#335577" } }).png().toBuffer() },
      ],
      rationale: `${RATIONALE} ${marker}`, changesNote: changes,
    });
    const out = await evaluateSubmission(submissionId, { provider: fake });
    if (out.state !== "evaluated") throw new Error(out.state);
    return submissionId;
  }
  const view = async (u: string, id: string) => (await getSubmissionView({ id: u, role: "LEARNER" }, id))!;

  it("leads with the mandatory shortfall and links to lessons in the learner's own path, at real step numbers", async () => {
    const u = await ready();
    const v = await view(u, await attempt(u, "[fake:score=85] [fake:set=contrast:40]"));
    const fix = v.buddy!.nextFix!;
    expect(fix).toMatchObject({ key: "contrast", belowMinimum: true, score: 40 });
    expect(fix.links.length).toBeGreaterThan(0);
    for (const l of fix.links) {
      const lesson = await db.lesson.findUniqueOrThrow({ where: { id: l.lessonId }, include: { module: { include: { level: { include: { path: true } } } } } });
      expect(lesson.module.level.path.slug).toBe("graphic-design"); // never another path's lessons
      const blocks = lesson.blocks as unknown as { kind: string }[];
      const step = (href?: string) => Number(new URL(href!, "http://x").searchParams.get("step"));
      expect(blocks[step(l.idea)].kind).toBe("concept");
      if (l.compare) expect(blocks[step(l.compare)].kind).toBe("goodVsBad");
      if (l.practice) expect(blocks[step(l.practice)].kind).toBe("guided");
      expect(l.contrast).toBeTruthy();
    }
    expect(v.buddy!.nailed.length).toBeGreaterThan(0);
    expect(v.buddy!.opening).toMatch(/closer than it feels|moved up/);
  });

  it("shows progress against the previous attempt", async () => {
    const u = await ready();
    await attempt(u, "[fake:score=50]");
    const v = await view(u, await attempt(u, "[fake:score=70]", "I darkened the text and enlarged the headline considerably"));
    expect(v.buddy!.progress).toEqual({ previousScore: 50, delta: 20 });
    expect(v.buddy!.opening).toMatch(/moved up 20 points/);
    expect(v.buddy!.nextFix!.delta).toBe(20);
  });

  it("does not build a buddy view before there is a completed evaluation", async () => {
    const u = await ready();
    const { submissionId } = await createSubmission(u, assignmentId, {
      files: [{ slot: "final", name: "p.png", data: await (await import("sharp")).default({ create: { width: 800, height: 1200, channels: 3, background: "#335577" } }).png().toBuffer() }],
      rationale: RATIONALE,
    });
    expect((await view(u, submissionId)).buddy).toBeNull();
  });
});
