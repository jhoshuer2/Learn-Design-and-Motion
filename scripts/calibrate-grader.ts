/**
 * Calibrates the REAL assessor against synthetic samples of known quality. Costs real money.
 * Reads ANTHROPIC_API_KEY (and EVALUATION_MODEL) from the environment only; never prints them.
 *
 *   npx tsx scripts/calibrate-grader.ts --probe
 *   npx tsx scripts/calibrate-grader.ts --assignment high-contrast-event-poster --runs 3 --budget-usd 15 --out docs/calibration/poster.json
 *   npx tsx scripts/calibrate-grader.ts --samples strong,low-contrast --runs 1 --out results.json
 *
 * Output is appended per run and resumable: finished sample/run pairs in --out are skipped.
 * Stops at once on a billing or authentication error, and before any call that could exceed --budget-usd.
 */
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { classifyError } from "../src/lib/assessment/errors";
import { runChecks } from "../src/lib/assessment/checks";
import { ClaudeProvider } from "../src/lib/assessment/claude";
import type { EvaluationInput } from "../src/lib/assessment/provider";
import { modelOutput } from "../src/lib/assessment/schema";
import { computeResult } from "../src/lib/assessment/scoring";
import { Budget } from "./calibration/budget";
import { DEFAULT_ESTIMATE, REGISTRY } from "./calibration/registry";
import type { Brief, Row } from "./calibration/types";

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k: string) => process.argv.includes(`--${k}`);
// USD per million tokens for claude-opus-5-5 (list price when this was written). Override with PRICE_IN / PRICE_OUT.
const PRICE = { in: Number(process.env.PRICE_IN ?? 4), out: Number(process.env.PRICE_OUT ?? 20) };
const scrub = (s: string) => s.replace(/sk-ant-[A-Za-z0-9_-]+/g, "<key>");

async function main() {
  if (process.env.EVALUATION_PROVIDER === "fake") throw new Error("EVALUATION_PROVIDER=fake: calibration must use the real provider");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set (load it from .env: set -a; . ./.env; set +a)");
  const provider = new ClaudeProvider();

  if (flag("probe")) {
    try { await provider.probe(); console.log("probe ok: the account can make calls"); }
    catch (e) { const k = classifyError(e); console.error(`probe failed: ${k.kind} (${k.message})`); process.exit(2); }
    return;
  }

  const assignment = arg("assignment");
  const ids = arg("samples")?.split(",");
  const chosen = REGISTRY.filter((s) => (ids ? ids.includes(s.id) : assignment ? s.assignment === assignment : true));
  if (chosen.length === 0) throw new Error("no samples selected");
  const runs = Number(arg("runs", "1"));
  const out = arg("out") ?? "calibration.json";
  const budget = new Budget(Number(arg("budget-usd", "15")));
  const results: Row[] = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : [];
  for (const r of results) if (r.costUsd) budget.record(r.costUsd);
  console.log(`cap $${budget.capUsd}; already spent in ${out}: $${budget.spent.toFixed(2)}`);

  const db = new PrismaClient();
  try {
    for (const sample of chosen) {
      const asg = await db.assignment.findUniqueOrThrow({ where: { slug: sample.assignment }, include: { rubricVersion: { include: { criteria: { orderBy: { key: "asc" } } } } } });
      const rv = asg.rubricVersion;
      const brief = asg.brief as unknown as Brief;
      const images = await sample.images();
      const checks = runChecks(images.map((i) => ({ key: "k", slot: i.slot, name: i.name, mime: i.mime, size: i.data.length, sha256: "", width: i.width, height: i.height, role: i.role })), sample.rationale, brief.deliverables);
      const input: EvaluationInput = {
        assignment: { title: asg.title, objective: asg.objective, scenario: asg.scenario, requirements: brief.requirements, constraints: brief.constraints },
        rubric: { title: asg.title, threshold: rv.threshold, criteria: rv.criteria.map((c) => ({ key: c.key, title: c.title, description: c.description, weight: c.weight, mandatory: c.mandatory, minScore: c.minScore })) },
        images: images.map((i) => ({ slot: i.slot, label: i.label, role: i.role, name: i.name, width: i.width, height: i.height, mime: i.mime, data: i.data })),
        rationale: sample.rationale, changesNote: sample.changesNote, checks,
      };

      for (let run = 1; run <= runs; run++) {
        if (results.some((r) => r.sample === sample.id && r.run === run && !r.error)) { console.log(`${sample.id} #${run}: already done, skipped`); continue; }
        if (!budget.canStart(DEFAULT_ESTIMATE[sample.assignment] ?? 0.3)) { console.log(`STOP: the next call could exceed the $${budget.capUsd} cap (spent $${budget.spent.toFixed(2)})`); return; }
        const t0 = Date.now();
        const row: Row = { sample: sample.id, run, assignment: sample.assignment, expect: sample.expect };
        let fatal = false;
        try {
          const o = await provider.evaluate(input);
          Object.assign(row, { ms: Date.now() - t0, model: o.model, inputTokens: o.inputTokens, outputTokens: o.outputTokens });
          row.costUsd = Number((((o.inputTokens ?? 0) * PRICE.in + (o.outputTokens ?? 0) * PRICE.out) / 1e6).toFixed(4));
          budget.record(row.costUsd);
          const parsed = modelOutput.safeParse(o.raw);
          row.schemaValid = parsed.success;
          if (!parsed.success) { row.schemaErrors = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`); row.raw = o.raw; }
          else {
            const d = parsed.data;
            Object.assign(row, { status: d.status, confidence: d.confidence, reviewFlag: d.reviewFlag, missingEvidence: d.missingEvidence });
            if (d.status === "complete") {
              const r = computeResult({ threshold: rv.threshold, criteria: rv.criteria }, d.criteria, d.criticalFailures);
              Object.assign(row, { overall: r.score, passed: r.passed, failedMandatory: r.failedMandatory.map((f) => f.key), scores: Object.fromEntries(d.criteria.map((c) => [c.criterionId, c.score])) });
            }
            Object.assign(row, { strengths: d.strengths, weaknesses: d.weaknesses, missingRequirements: d.missingRequirements, criticalFailures: d.criticalFailures, criteria: d.criteria });
          }
        } catch (e) {
          const k = classifyError(e);
          row.ms = Date.now() - t0; row.error = scrub(k.message).slice(0, 300); row.errorKind = k.kind;
          fatal = k.policy.pauses; // billing or auth: nothing will succeed until a person fixes it
        }
        results.push(row);
        fs.writeFileSync(out, JSON.stringify(results, null, 2));
        console.log(`${sample.id} #${run}: ${row.error ? `ERROR ${row.errorKind}: ${row.error}` : `${row.status} overall=${row.overall} passed=${row.passed} conf=${row.confidence} ${row.ms}ms $${row.costUsd}`}  (spent $${budget.spent.toFixed(2)})`);
        if (fatal) { console.log("STOP: billing or authentication problem; not retrying"); process.exitCode = 3; return; }
      }
    }
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => { console.error(scrub(String(e.message))); process.exit(1); });
