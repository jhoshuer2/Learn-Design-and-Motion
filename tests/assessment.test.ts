import { afterEach, describe, expect, it, vi } from "vitest";
import { runChecks, type Deliverable } from "../src/lib/assessment/checks";
import { NotConfiguredProvider, ProviderNotConfiguredError, getProvider } from "../src/lib/assessment/provider";
import { InvalidEvaluationError, computeResult, type RubricDef } from "../src/lib/assessment/scoring";
import { modelOutput } from "../src/lib/assessment/schema";

const crit = (key: string, weight: number, extra: Partial<RubricDef["criteria"][number]> = {}) =>
  ({ key, title: key, weight, mandatory: false, minScore: null, ...extra });
const rubric: RubricDef = {
  threshold: 80,
  criteria: [
    crit("hierarchy", 25), crit("contrast", 20, { mandatory: true, minScore: 60 }),
    crit("legibility", 15, { mandatory: true, minScore: 60 }), crit("type", 15), crit("composition", 15), crit("rationale", 10),
  ],
};
const scores = (over: Record<string, number> = {}, base = 100) =>
  rubric.criteria.map((c) => ({ criterionId: c.key, score: over[c.key] ?? base }));

describe("computeResult", () => {
  it("passes when the weighted score and every mandatory minimum are met", () => {
    expect(computeResult(rubric, scores())).toMatchObject({ score: 100, passed: true });
  });

  it("fails a high overall score when a mandatory criterion is below its minimum", () => {
    const r = computeResult(rubric, scores({ contrast: 55 }));
    expect(r.score).toBeGreaterThanOrEqual(80); // 91: well above the pass mark
    expect(r.passed).toBe(false);
    expect(r.failedMandatory).toEqual([{ key: "contrast", title: "contrast", score: 55, minScore: 60 }]);
    expect(r.reasons.join(" ")).toMatch(/required criterion/);
  });

  it("applies the pass mark at the boundary", () => {
    // hierarchy 25% scores lower so the weighted total lands exactly on 80, then 79
    expect(computeResult(rubric, scores({ hierarchy: 20 })).score).toBe(80);
    expect(computeResult(rubric, scores({ hierarchy: 20 })).passed).toBe(true);
    expect(computeResult(rubric, scores({ hierarchy: 16 })).score).toBe(79);
    expect(computeResult(rubric, scores({ hierarchy: 16 })).passed).toBe(false);
  });

  it("uses the rubric's weights, not the order or number of criteria", () => {
    expect(computeResult(rubric, scores({ rationale: 0 })).score).toBe(90);
    expect(computeResult(rubric, scores({ hierarchy: 0 })).score).toBe(75);
  });

  it("fails on a critical failure even with perfect scores", () => {
    const r = computeResult(rubric, scores(), ["Event name is missing"]);
    expect(r.passed).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/Event name is missing/);
  });

  it("rejects missing, duplicate and unknown criteria", () => {
    expect(() => computeResult(rubric, scores().slice(1))).toThrow(InvalidEvaluationError);
    expect(() => computeResult(rubric, [...scores(), { criterionId: "hierarchy", score: 10 }])).toThrow(/more than once/);
    expect(() => computeResult(rubric, [...scores(), { criterionId: "vibes", score: 100 }])).toThrow(/Unknown criterion/);
  });

  it("rejects out-of-range and non-integer scores", () => {
    expect(() => computeResult(rubric, scores({ type: 101 }))).toThrow(InvalidEvaluationError);
    expect(() => computeResult(rubric, scores({ type: -1 }))).toThrow(InvalidEvaluationError);
    expect(() => computeResult(rubric, scores({ type: 80.5 }))).toThrow(InvalidEvaluationError);
  });
});

describe("model output schema", () => {
  const good = {
    status: "complete", missingEvidence: [], strengths: [], weaknesses: [], missingRequirements: [], criticalFailures: [],
    confidence: "high", reviewFlag: false,
    criteria: [{
      criterionId: "contrast", score: 70, evidence: "The title is dark on a pale ground.", where: "Top third",
      explanation: "It makes the title read first.", principle: "Value contrast", improvement: "Darken the date text a step.",
      verify: "Squint at the preview and check the date is still readable.",
    }],
  };

  it("accepts a well-formed result and strips any model-claimed totals or verdicts", () => {
    const parsed = modelOutput.parse({ ...good, overallScore: 100, passed: true });
    expect(parsed).not.toHaveProperty("overallScore");
    expect(parsed).not.toHaveProperty("passed");
  });

  it("rejects malformed output", () => {
    expect(modelOutput.safeParse({ nonsense: true }).success).toBe(false);
    expect(modelOutput.safeParse("text").success).toBe(false);
    expect(modelOutput.safeParse({ ...good, criteria: [{ ...good.criteria[0], score: 101 }] }).success).toBe(false);
    expect(modelOutput.safeParse({ ...good, criteria: [] }).success).toBe(false);
  });

  it("requires needs_evidence to name what is missing", () => {
    expect(modelOutput.safeParse({ ...good, status: "needs_evidence", criteria: [], missingEvidence: [] }).success).toBe(false);
    expect(modelOutput.safeParse({ ...good, status: "needs_evidence", criteria: [], missingEvidence: ["A clearer export"] }).success).toBe(true);
  });
});

describe("deterministic checks", () => {
  const D: Deliverable[] = [
    { key: "final", label: "Final poster", description: "Export of the poster.", role: "final", required: true },
    { key: "preview", label: "Small-scale preview", description: "The poster at about 400 px.", role: "preview", required: true },
    { key: "process", label: "Process image", description: "Optional.", role: "process", required: false },
  ];
  const f = (role: "final" | "preview", w: number, h: number) =>
    ({ key: "k", name: "n", mime: "image/png", size: 1, sha256: "x", width: w, height: h, role }) as const;
  const words = (n: number) => Array(n).fill("word").join(" ");

  it("blocks on a missing preview, final, or rationale", () => {
    expect(runChecks([f("final", 800, 1200)], words(30), D).missingEvidence.join(" ")).toMatch(/preview/);
    expect(runChecks([f("preview", 200, 300)], words(30), D).missingEvidence.join(" ")).toMatch(/Final poster/);
    expect(runChecks([f("final", 800, 1200), f("preview", 200, 300)], words(5), D).missingEvidence.join(" ")).toMatch(/rationale/);
  });

  it("reports facts when complete", () => {
    const c = runChecks([f("final", 800, 1200), f("preview", 267, 400)], words(25), D);
    expect(c).toMatchObject({ missingEvidence: [], previewIsSmaller: true, aspectRatioMatches: true, rationaleWords: 25 });
  });

  it("notes a preview that is not smaller or not the same shape", () => {
    expect(runChecks([f("final", 800, 1200), f("preview", 800, 1200)], words(25), D).previewIsSmaller).toBe(false);
    expect(runChecks([f("final", 800, 1200), f("preview", 400, 400)], words(25), D).aspectRatioMatches).toBe(false);
  });
});

describe("provider selection", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reports not configured, never a grade, when there is no key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("EVALUATION_PROVIDER", "");
    const p = await getProvider();
    expect(p).toBeInstanceOf(NotConfiguredProvider);
    await expect(p.evaluate({} as never)).rejects.toBeInstanceOf(ProviderNotConfiguredError);
  });

  it("refuses the fake evaluator in production unless explicitly allowed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_FAKE_EVALUATOR", "");
    vi.stubEnv("EVALUATION_PROVIDER", "fake");
    await expect(getProvider()).rejects.toThrow(/test-only/);
    vi.stubEnv("ALLOW_FAKE_EVALUATOR", "true");
    expect((await getProvider()).name).toBe("test-only-fake");
  });
});
