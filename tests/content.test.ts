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
