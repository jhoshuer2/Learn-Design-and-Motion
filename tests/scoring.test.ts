import { describe, expect, it } from "vitest";
import { competencyScores, scoreQuiz } from "../src/lib/progression/scoring";
import { hexContrast, wcagResults } from "../src/lib/contrast";

const q = (id: string, type: string, answerKey: unknown, competencyId?: string) => ({ id, type, answerKey, competencyId });

describe("scoreQuiz", () => {
  it("scores exact single-choice matches", () => {
    const r = scoreQuiz([q("a", "MULTIPLE_CHOICE", "x"), q("b", "MULTIPLE_CHOICE", "y")], { a: ["x"], b: ["z"] });
    expect(r.score).toBe(50);
  });
  it("gives no partial credit on multi-select", () => {
    const qs = [q("a", "MULTIPLE_SELECT", ["x", "y"])];
    expect(scoreQuiz(qs, { a: ["x"] }).score).toBe(0);
    expect(scoreQuiz(qs, { a: ["x", "y", "z"] }).score).toBe(0);
    expect(scoreQuiz(qs, { a: ["y", "x"] }).score).toBe(100);
  });
  it("treats unanswered as wrong", () => {
    expect(scoreQuiz([q("a", "MULTIPLE_CHOICE", "x")], {}).score).toBe(0);
  });
  it("refuses question types it cannot score", () => {
    expect(() => scoreQuiz([q("a", "SHORT_ANSWER", "x")], { a: ["x"] })).toThrow();
  });
  it("refuses an empty check", () => {
    expect(() => scoreQuiz([], {})).toThrow();
  });
  it("aggregates by competency", () => {
    const { results } = scoreQuiz(
      [q("a", "MULTIPLE_CHOICE", "x", "c1"), q("b", "MULTIPLE_CHOICE", "y", "c1"), q("c", "MULTIPLE_CHOICE", "z", "c2")],
      { a: ["x"], b: ["no"], c: ["z"] },
    );
    expect(competencyScores(results)).toEqual([{ competencyId: "c1", score: 50 }, { competencyId: "c2", score: 100 }]);
  });
});

describe("contrast maths (values quoted in the lessons)", () => {
  const ratio = (a: string, b: string) => Number(hexContrast(a, b)!.toFixed(2));
  it("matches the published WCAG reference values", () => {
    expect(ratio("#000000", "#ffffff")).toBe(21);
    expect(ratio("#767676", "#ffffff")).toBe(4.54);
    expect(ratio("#777777", "#ffffff")).toBe(4.48);
    expect(ratio("#949494", "#ffffff")).toBe(3.03);
    expect(ratio("#ffffff", "#f2b705")).toBe(1.82);
    expect(ratio("#1a1a1a", "#f2b705")).toBe(9.57);
  });
  it("applies thresholds at the boundary", () => {
    expect(wcagResults(4.54).aaText).toBe(true);
    expect(wcagResults(4.48).aaText).toBe(false);
    expect(wcagResults(3.03)).toMatchObject({ aaLargeText: true, nonText: true, aaText: false });
  });
  it("rejects invalid hex", () => {
    expect(hexContrast("nope", "#fff")).toBeNull();
  });
});
