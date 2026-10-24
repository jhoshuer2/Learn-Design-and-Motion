import type { Row, Sample } from "./types";

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const round = (n: number, d = 1) => (Number.isFinite(n) ? Number(n.toFixed(d)) : null);

export type CriterionStat = { key: string; mean: number | null; min: number; max: number; range: number };
export type SampleSummary = {
  sample: string; assignment: string; runs: number; ok: number; errors: number;
  overall: { mean: number | null; min: number | null; max: number | null };
  passRate: number | null; passFlips: boolean;
  criteria: CriterionStat[];
  /** The largest max-min spread across runs for any criterion. */
  maxRange: number;
  expectations: { label: string; passed: number; of: number }[];
  confidence: Record<string, number>; reviewFlagged: number;
  meanMs: number | null; maxMs: number | null; meanCostUsd: number | null; totalCostUsd: number;
};

export function summarise(rows: Row[], samples: Sample[]): SampleSummary[] {
  const ids = [...new Set(rows.map((r) => r.sample))];
  return ids.map((id) => {
    const mine = rows.filter((r) => r.sample === id);
    const spec = samples.find((s) => s.id === id);
    const ok = mine.filter((r) => !r.error && r.schemaValid !== false);
    const done = ok.filter((r) => r.status === "complete" && r.scores);
    const keys = [...new Set(done.flatMap((r) => Object.keys(r.scores!)))].sort();
    const criteria = keys.map((key) => {
      const v = done.map((r) => r.scores![key]).filter((n) => typeof n === "number");
      return { key, mean: round(mean(v)), min: Math.min(...v), max: Math.max(...v), range: Math.max(...v) - Math.min(...v) };
    });
    const overall = done.map((r) => r.overall!).filter((n) => typeof n === "number");
    const passes = done.map((r) => r.passed === true);
    const conf: Record<string, number> = {};
    for (const r of ok) if (r.confidence) conf[r.confidence] = (conf[r.confidence] ?? 0) + 1;
    const ms = ok.map((r) => r.ms).filter((n): n is number => typeof n === "number");
    const cost = ok.map((r) => r.costUsd).filter((n): n is number => typeof n === "number");
    return {
      sample: id, assignment: mine[0].assignment, runs: mine.length, ok: ok.length, errors: mine.length - ok.length,
      overall: { mean: round(mean(overall)), min: overall.length ? Math.min(...overall) : null, max: overall.length ? Math.max(...overall) : null },
      passRate: passes.length ? round(passes.filter(Boolean).length / passes.length, 2) : null,
      passFlips: passes.length > 1 && passes.some(Boolean) && passes.some((p) => !p),
      criteria, maxRange: criteria.length ? Math.max(...criteria.map((c) => c.range)) : 0,
      expectations: (spec?.expectations ?? []).map((x) => ({ label: x.label, passed: ok.filter((r) => safe(x.test, r)).length, of: ok.length })),
      confidence: conf, reviewFlagged: ok.filter((r) => r.reviewFlag).length,
      meanMs: round(mean(ms), 0), maxMs: ms.length ? Math.max(...ms) : null,
      meanCostUsd: round(mean(cost), 4), totalCostUsd: Number(cost.reduce((a, b) => a + b, 0).toFixed(4)),
    };
  });
}
const safe = (t: (r: Row) => boolean, r: Row) => { try { return t(r); } catch { return false; } };

/** Findings worth a human's attention, in plain words. Pure: derived only from the summaries. */
export function findings(sums: SampleSummary[]): string[] {
  const out: string[] = [];
  for (const s of sums) {
    for (const x of s.expectations) if (x.of > 0 && x.passed < x.of) out.push(`${s.sample}: expectation "${x.label}" held in ${x.passed} of ${x.of} runs.`);
    if (s.errors > 0) out.push(`${s.sample}: ${s.errors} of ${s.runs} runs failed (provider error or invalid output).`);
    if (s.passFlips) out.push(`${s.sample}: pass/fail flipped between runs (overall ${s.overall.min} to ${s.overall.max}).`);
    if (s.maxRange >= 20) out.push(`${s.sample}: a criterion moved by ${s.maxRange} points between runs.`);
  }
  return out;
}

export function toMarkdown(sums: SampleSummary[], meta: { model?: string; date: string; note?: string }): string {
  const lines: string[] = [];
  lines.push(`# Calibration report (${meta.date})`, "", `Model: ${meta.model ?? "unknown"}. ${meta.note ?? ""}`.trim(), "");
  lines.push("| Sample | Runs ok/total | Overall mean (min-max) | Pass rate | Max criterion range | Expectations met | Mean s | Mean $ |", "|---|---|---|---|---|---|---|---|");
  for (const s of sums) {
    const met = s.expectations.length ? `${s.expectations.reduce((a, x) => a + x.passed, 0)}/${s.expectations.reduce((a, x) => a + x.of, 0)}` : "n/a";
    lines.push(`| ${s.sample} | ${s.ok}/${s.runs} | ${s.overall.mean ?? "n/a"} (${s.overall.min ?? "-"}-${s.overall.max ?? "-"}) | ${s.passRate ?? "n/a"} | ${s.maxRange} | ${met} | ${s.meanMs === null ? "n/a" : Math.round((s.meanMs ?? 0) / 1000)} | ${s.meanCostUsd ?? "n/a"} |`);
  }
  lines.push("", "## Per-criterion scores (mean, min-max across runs)", "");
  for (const s of sums) {
    lines.push(`**${s.sample}**: ${s.criteria.map((c) => `${c.key} ${c.mean} (${c.min}-${c.max})`).join("; ") || "no complete runs"}`, "");
  }
  const f = findings(sums);
  lines.push("## Findings", "", ...(f.length ? f.map((x) => `- ${x}`) : ["- None: every expectation held in every run."]));
  return lines.join("\n") + "\n";
}
