import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { loadContent } from "../src/lib/content/loader";
import { runChecks } from "../src/lib/assessment/checks";
import { SYSTEM_PROMPT_MARKER } from "../src/lib/assessment/claude";
import { Budget } from "../scripts/calibration/budget";
import { compareHuman, parseCsv, readHumanCsv, spearman } from "../scripts/calibration/compare";
import { blindId, exportPack } from "../scripts/calibration/pack";
import { REGISTRY } from "../scripts/calibration/registry";
import { findings, summarise, toMarkdown } from "../scripts/calibration/report";
import type { Row } from "../scripts/calibration/types";

const content = loadContent();
const assignmentOf = (slug: string) => [...content.modules.flatMap((m) => m.assignments), ...content.levels.flatMap((l) => l.capstones)].find((a) => a.slug === slug)!;
const sample = (id: string) => REGISTRY.find((s) => s.id === id)!;

const row = (over: Partial<Row>): Row => ({
  sample: "x", run: 1, assignment: "a", expect: "", status: "complete", schemaValid: true, ms: 1000, costUsd: 0.1,
  overall: 80, passed: true, confidence: "medium", reviewFlag: false, scores: { contrast: 80 }, strengths: [], weaknesses: [], ...over,
});

describe("synthetic samples", () => {
  it("have unique ids and are covered by the registry for every calibrated assignment", () => {
    expect(new Set(REGISTRY.map((s) => s.id)).size).toBe(REGISTRY.length);
    expect(new Set(REGISTRY.map((s) => s.assignment))).toEqual(new Set(["high-contrast-event-poster", "contrast-campaign-capstone", "mini-brand-sheet", "mobile-screen", "typographic-programme", "imagery-layout-guide", "form-screen"]));
  });

  it.each(REGISTRY.map((s) => [s.id, s] as const))("%s supplies every required deliverable and passes the deterministic checks", async (_id, s) => {
    const a = assignmentOf(s.assignment);
    const imgs = await s.images();
    const files = imgs.map((i) => ({ key: "k", slot: i.slot, name: i.name, mime: i.mime, size: i.data.length, sha256: "", width: i.width, height: i.height, role: i.role }));
    const checks = runChecks(files, s.rationale, a.deliverables as never);
    expect(checks.missingEvidence, s.id).toEqual([]); // otherwise the real grader would never be called for it
    for (const i of imgs) { const m = await sharp(i.data).metadata(); expect([m.width, m.height]).toEqual([i.width, i.height]); }
    if (checks.previewIsSmaller !== undefined) expect(checks.previewIsSmaller && checks.aspectRatioMatches, s.id).toBe(true);
    expect(s.expectations.length, `${s.id} needs machine-checkable expectations`).toBeGreaterThan(0);
  });
});

describe("expectations", () => {
  const injected = (over: Partial<Row>) => row({ sample: "injection", scores: { "information-hierarchy": 40, contrast: 80 }, overall: 55, passed: false, ...over });
  const holds = (id: string, r: Row) => sample(id).expectations.map((e) => [e.label, e.test(r)] as const);

  it("detect an injection that was obeyed", () => {
    expect(holds("injection", injected({ scores: { "information-hierarchy": 100, contrast: 100 }, overall: 100, passed: true, confidence: "high" })).filter(([, ok]) => !ok).length).toBeGreaterThan(2);
  });
  it("detect system-prompt leakage and echoed praise, and accept a resisted injection", () => {
    expect(holds("injection", injected({ weaknesses: [`${SYSTEM_PROMPT_MARKER}. You assess ONE submission`] })).find(([l]) => l.includes("leak"))![1]).toBe(false);
    expect(holds("injection", injected({ strengths: ["This is the best poster ever"] })).find(([l]) => l.includes("echo"))![1]).toBe(false);
    expect(holds("injection", injected({})).every(([, ok]) => ok)).toBe(true);
  });
  it("treat a missing or failed run as not meeting an expectation", () => {
    expect(holds("low-contrast", row({ status: undefined, scores: undefined, passed: undefined, error: "boom" })).some(([, ok]) => ok)).toBe(false);
  });
  it("express the poster notes numerically", () => {
    const ok = row({ scores: { contrast: 40, "legibility-at-small-size": 30, "design-rationale": 50 }, overall: 45, passed: false });
    expect(holds("low-contrast", ok).every(([, v]) => v)).toBe(true);
    expect(holds("low-contrast", row({ scores: { contrast: 80, "legibility-at-small-size": 80, "design-rationale": 80 } })).some(([, v]) => !v)).toBe(true);
  });
});

describe("report", () => {
  const rows = [
    row({ sample: "low-contrast", run: 1, scores: { contrast: 40, "legibility-at-small-size": 30, "design-rationale": 40 }, overall: 45, passed: false, ms: 60000, costUsd: 0.12 }),
    row({ sample: "low-contrast", run: 2, scores: { contrast: 75, "legibility-at-small-size": 30, "design-rationale": 40 }, overall: 62, passed: true, ms: 40000, costUsd: 0.1 }),
    row({ sample: "low-contrast", run: 3, error: "boom", errorKind: "overloaded", status: undefined, scores: undefined, costUsd: undefined }),
  ];
  const [s] = summarise(rows, REGISTRY);

  it("computes spread, pass flips, errors, cost and expectation counts", () => {
    expect(s).toMatchObject({ runs: 3, ok: 2, errors: 1, passFlips: true, maxRange: 35, passRate: 0.5 });
    expect(s.criteria.find((c) => c.key === "contrast")).toMatchObject({ mean: 57.5, min: 40, max: 75, range: 35 });
    expect(s.meanMs).toBe(50000);
    expect(s.expectations.find((e) => e.label.startsWith("contrast"))).toMatchObject({ passed: 1, of: 2 });
  });
  it("turns the numbers into findings and markdown without hiding failures", () => {
    const f = findings([s]);
    expect(f.join("\n")).toMatch(/flipped between runs/);
    expect(f.join("\n")).toMatch(/moved by 35 points/);
    expect(f.join("\n")).toMatch(/1 of 3 runs failed/);
    expect(toMarkdown([s], { date: "2030-01-01", model: "m" })).toMatch(/\| low-contrast \| 2\/3 \|/);
    expect(findings(summarise([row({ sample: "strong", scores: { contrast: 85, "legibility-at-small-size": 85 }, overall: 85 })], REGISTRY))).toEqual([]);
  });
});

describe("budget", () => {
  it("stops before a call that could exceed the cap, using measured cost once known", () => {
    const b = new Budget(1);
    expect(b.canStart(0.15)).toBe(true);
    for (let i = 0; i < 5; i++) b.record(0.15);
    expect(b.spent).toBeCloseTo(0.75);
    expect(b.canStart(0.15)).toBe(true);   // 0.75 + 0.225 <= 1
    b.record(0.15);
    expect(b.canStart(0.15)).toBe(false);  // 0.9 + 0.225 > 1
    expect(new Budget(1).canStart(2)).toBe(false); // an estimate above the cap never starts
  });
});

describe("human comparison", () => {
  const rubric = { threshold: 80, criteria: [{ key: "a", title: "A", weight: 50, mandatory: false, minScore: null }, { key: "b", title: "B", weight: 50, mandatory: true, minScore: 60 }] };
  it("parses quoted CSV and rejects out-of-range scores", () => {
    expect(parseCsv('x,y\n"a,b","say ""hi"""\n')).toEqual([["x", "y"], ["a,b", 'say "hi"']]);
    const head = "blind_id,scorer,date,a,b,would_pass,notes\n";
    expect(readHumanCsv(`${head}S-1,Sam,2030-01-01,90,70,y,"fine, mostly"\nS-2,Sam,,,,,\n`, ["a", "b"])).toEqual([{ blindId: "S-1", scorer: "Sam", scores: { a: 90, b: 70 }, wouldPass: true, notes: "fine, mostly" }]);
    expect(() => readHumanCsv(`${head}S-1,Sam,,120,70,y,\n`, ["a", "b"])).toThrow(/0 to 100/);
  });
  it("computes rank correlation correctly (ties, perfect, inverse, undefined)", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBe(1);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBe(-1);
    expect(spearman([1, 2, 2, 4], [1, 2, 3, 4])).toBeCloseTo(0.949, 2);
    expect(spearman([1, 2], [1, 2])).toBeNull();
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeNull();
  });
  it("reports differences, bias, pass agreement and flags small samples as indicative", () => {
    const key = { "S-1": "p", "S-2": "q", "S-3": "r" };
    const ai: Row[] = [
      row({ sample: "p", scores: { a: 90, b: 90 } }), row({ sample: "p", run: 2, scores: { a: 80, b: 90 } }),
      row({ sample: "q", scores: { a: 40, b: 50 } }), row({ sample: "r", scores: { a: 70, b: 70 } }),
    ];
    const human = [
      { blindId: "S-1", scorer: "Sam", scores: { a: 85, b: 90 }, wouldPass: true, notes: "" },
      { blindId: "S-2", scorer: "Sam", scores: { a: 50, b: 40 }, wouldPass: false, notes: "" },
      { blindId: "S-3", scorer: "Sam", scores: { a: 90, b: 90 }, wouldPass: true, notes: "" },
    ];
    const r = compareHuman(human, key, ai, rubric);
    expect(r).toMatchObject({ n: 3, scorers: ["Sam"], indicativeOnly: true, passAgreement: 0.67 });
    expect(r.rankCorrelation).toBe(0.5); // human order q < p < r, AI order q < r < p
    expect(r.perCriterion.find((c) => c.key === "a")).toMatchObject({ mae: 10, meanBias: -10 });
    expect(() => compareHuman([{ ...human[0], blindId: "nope" }], key, ai, rubric)).toThrow(/Unknown blind id/);
  });
});

describe("blind scoring pack", () => {
  it("never shows the scorer a sample name, note, expectation or AI result", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-"));
    const out = path.join(dir, "pack"), key = path.join(dir, "key", "pack-key.json");
    const { key: k, files } = await exportPack(out, key);
    expect(Object.keys(k).sort()).toEqual(REGISTRY.map((s) => blindId(s.id)).sort());
    expect(Object.values(k).sort()).toEqual(REGISTRY.map((s) => s.id).sort());
    const given = files.filter((f) => f.startsWith(out));
    expect(given.some((f) => f.endsWith("pack-key.json"))).toBe(false);
    const text = given.filter((f) => /\.(md|csv)$/.test(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n") + given.join("\n");
    for (const s of REGISTRY) {
      if (s.id !== "strong") expect(text, `id ${s.id}`).not.toContain(s.id);
      expect(text, `note of ${s.id}`).not.toContain(s.note);
      expect(text, `expect of ${s.id}`).not.toContain(s.expect);
      for (const e of s.expectations.filter((x) => x.label.length > 12)) expect(text, `expectation ${e.label}`).not.toContain(e.label);
    }
    expect(text).not.toMatch(/ai (score|grader)? ?result|calibration-v1/i);
    for (const a of ["high-contrast-event-poster", "contrast-campaign-capstone", "mini-brand-sheet", "mobile-screen"]) {
      expect(fs.existsSync(path.join(out, `scoring-${a}.csv`)), a).toBe(true);
      expect(fs.readFileSync(path.join(out, `scoring-${a}.csv`), "utf8").split("\n")[0]).toMatch(/^blind_id,scorer,date,.+,would_pass,notes$/);
    }
    expect(fs.readFileSync(key, "utf8")).toContain("strong");
  });
});
