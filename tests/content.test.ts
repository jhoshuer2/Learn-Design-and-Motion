import { describe, expect, it } from "vitest";
import { loadContent, parseBlocks } from "../src/lib/content/loader";
import { questionSchema, rubricSchema } from "../src/lib/content/schemas";

describe("content", () => {
  it("loads the repository content", () => {
    const c = loadContent();
    expect(c.modules.length).toBeGreaterThan(0);
  });

  it("rejects unknown block kinds", () => {
    expect(() => parseBlocks("## {bogus} x\nhi", "f")).toThrow(/unknown block kind/);
  });

  it("rejects text before the first block", () => {
    expect(() => parseBlocks("stray\n## {concept} x", "f")).toThrow(/before first/);
  });

  it("requires multiple-choice answers to be among the options", () => {
    const r = questionSchema.safeParse({
      type: "MULTIPLE_CHOICE", prompt: "p", options: ["a", "b"], answer: "c", explanation: "e",
    });
    expect(r.success).toBe(false);
  });
});

describe("rubric schema", () => {
  const criterion = (key: string, weight: number, extra = {}) => ({
    key, title: key, description: "d", weight, ...extra,
  });

  it("requires weights to sum to 100", () => {
    const r = rubricSchema.safeParse({
      slug: "r", title: "r", version: 1, threshold: 85, criteria: [criterion("a", 60), criterion("b", 30)],
    });
    expect(r.success).toBe(false);
  });

  it("requires minScore on mandatory criteria", () => {
    const r = rubricSchema.safeParse({
      slug: "r", title: "r", version: 1, threshold: 85,
      criteria: [criterion("a", 50, { mandatory: true }), criterion("b", 50)],
    });
    expect(r.success).toBe(false);
  });

  it("accepts a valid rubric", () => {
    const r = rubricSchema.safeParse({
      slug: "r", title: "r", version: 1, threshold: 85,
      criteria: [criterion("a", 50, { mandatory: true, minScore: 70 }), criterion("b", 50)],
    });
    expect(r.success).toBe(true);
  });
});

describe("authored content hygiene", () => {
  const lessons = loadContent().modules.flatMap((m) => m.lessons);

  it("has no choice option that looks like a YAML comma-split fragment", () => {
    for (const l of lessons) for (const q of l.questions) for (const o of q.options ?? []) {
      expect(o, `${l.meta.slug}: "${o}"`).not.toMatch(/^[a-z]/);
    }
  });

  it("makes every answer one of the options for choice questions", () => {
    for (const l of lessons) for (const q of l.questions) {
      if (!q.options) continue;
      for (const a of Array.isArray(q.answer) ? q.answer : [q.answer]) expect(q.options).toContain(a);
    }
  });

  it("gives every lesson with a check at least 4 questions and all ten loop blocks", () => {
    for (const l of lessons) {
      expect(l.questions.length, l.meta.slug).toBeGreaterThanOrEqual(4);
      expect(new Set(l.blocks.map((b) => b.kind)).size, l.meta.slug).toBe(10);
    }
  });
});

describe("assignment content", () => {
  const c = loadContent();
  const a = c.modules.find((m) => m.def.slug === "understanding-contrast")!.assignments[0];

  it("loads the poster assignment and resolves its rubric", () => {
    expect(a.slug).toBe("high-contrast-event-poster");
    expect(c.rubrics.find((r) => r.slug === a.rubric.slug && r.version === a.rubric.version)).toBeDefined();
  });

  it("requires a final and a preview deliverable", () => {
    const roles = a.deliverables.filter((d) => d.required).map((d) => d.role);
    expect(roles).toEqual(expect.arrayContaining(["final", "preview"]));
  });

  it("has a poster rubric with the two mandatory criteria the brief calls for", () => {
    const r = c.rubrics.find((x) => x.slug === "high-contrast-poster")!;
    expect(r.criteria.filter((x) => x.mandatory).map((x) => x.key).sort()).toEqual(["contrast", "legibility-at-small-size"]);
    expect(r.criteria.reduce((n, x) => n + x.weight, 0)).toBe(100);
  });
});
