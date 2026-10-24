import { computeResult, type RubricDef } from "../../src/lib/assessment/scoring";
import type { Row } from "./types";

/** Minimal CSV reader: quoted fields, commas and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); if (row.some((x) => x !== "")) rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

export type HumanRow = { blindId: string; scorer: string; scores: Record<string, number>; wouldPass: boolean | null; notes: string };

/** Header: blind_id, scorer, date, <criterion keys...>, would_pass, notes. Rows with a blank score are skipped (unscored). */
export function readHumanCsv(text: string, criteriaKeys: string[]): HumanRow[] {
  const [head, ...body] = parseCsv(text);
  const idx = (n: string) => head.indexOf(n);
  const out: HumanRow[] = [];
  for (const r of body) {
    const scores: Record<string, number> = {};
    let blank = false;
    for (const k of criteriaKeys) {
      const v = r[idx(k)]?.trim();
      if (!v) { blank = true; break; }
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`Row ${r[idx("blind_id")]}: "${k}" must be a number from 0 to 100`);
      scores[k] = n;
    }
    if (blank) continue;
    const wp = r[idx("would_pass")]?.trim().toLowerCase();
    out.push({ blindId: r[idx("blind_id")].trim(), scorer: r[idx("scorer")]?.trim() ?? "", scores, wouldPass: wp ? ["y", "yes", "true", "pass"].includes(wp) : null, notes: r[idx("notes")] ?? "" });
  }
  return out;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function ranks(xs: number[]) {
  const order = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const r = new Array(xs.length).fill(0);
  for (let i = 0; i < order.length;) {
    let j = i; while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
    for (let k = i; k <= j; k++) r[order[k].i] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}
/** Spearman rank correlation; null when undefined (fewer than 3 items or no variation). */
export function spearman(a: number[], b: number[]): number | null {
  if (a.length < 3 || a.length !== b.length) return null;
  const ra = ranks(a), rb = ranks(b), ma = mean(ra), mb = mean(rb);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ra.length; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return da === 0 || db === 0 ? null : Number((num / Math.sqrt(da * db)).toFixed(3));
}

export type Agreement = {
  n: number; scorers: string[]; indicativeOnly: boolean;
  overallMae: number; passAgreement: number; rankCorrelation: number | null;
  perCriterion: { key: string; mae: number; meanBias: number }[];
  perSample: { sample: string; human: number; ai: number; humanPass: boolean; aiPass: boolean }[];
};

/**
 * Compare human scores with the AI's mean scores per sample. `key` maps blind ids to sample ids. The human overall is
 * computed with the same server-side scorer and rubric the platform uses.
 */
export function compareHuman(human: HumanRow[], key: Record<string, string>, ai: Row[], rubric: RubricDef): Agreement {
  const per: Agreement["perSample"] = [];
  const crit: Record<string, { diff: number[] }> = {};
  const used = new Set<string>();
  for (const h of human) {
    const sample = key[h.blindId];
    if (!sample) throw new Error(`Unknown blind id ${h.blindId}`);
    const runs = ai.filter((r) => r.sample === sample && r.status === "complete" && r.scores);
    if (runs.length === 0) continue;
    used.add(h.scorer);
    const aiMean: Record<string, number> = {};
    for (const c of rubric.criteria) aiMean[c.key] = mean(runs.map((r) => r.scores![c.key]));
    const hr = computeResult(rubric, rubric.criteria.map((c) => ({ criterionId: c.key, score: Math.round(h.scores[c.key]) })));
    const ar = computeResult(rubric, rubric.criteria.map((c) => ({ criterionId: c.key, score: Math.round(aiMean[c.key]) })));
    per.push({ sample, human: hr.score, ai: ar.score, humanPass: h.wouldPass ?? hr.passed, aiPass: ar.passed });
    for (const c of rubric.criteria) (crit[c.key] ??= { diff: [] }).diff.push(aiMean[c.key] - h.scores[c.key]);
  }
  const n = per.length;
  return {
    n, scorers: [...used], indicativeOnly: n < 8,
    overallMae: n ? Number(mean(per.map((p) => Math.abs(p.ai - p.human))).toFixed(1)) : 0,
    passAgreement: n ? Number((per.filter((p) => p.humanPass === p.aiPass).length / n).toFixed(2)) : 0,
    rankCorrelation: spearman(per.map((p) => p.human), per.map((p) => p.ai)),
    perCriterion: Object.entries(crit).map(([k, v]) => ({ key: k, mae: Number(mean(v.diff.map(Math.abs)).toFixed(1)), meanBias: Number(mean(v.diff).toFixed(1)) })).sort((a, b) => b.mae - a.mae),
    perSample: per,
  };
}
