/**
 * Calibrates the REAL assessor against synthetic posters of known quality.
 * Costs real money. Reads ANTHROPIC_API_KEY (and EVALUATION_MODEL) from the environment; never prints them.
 *
 *   npx tsx scripts/calibrate-grader.ts --samples strong,low-contrast --runs 1 --out results.json
 */
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { runChecks, type Deliverable } from "../src/lib/assessment/checks";
import { ClaudeProvider } from "../src/lib/assessment/claude";
import type { EvaluationInput } from "../src/lib/assessment/provider";
import { modelOutput } from "../src/lib/assessment/schema";
import { computeResult } from "../src/lib/assessment/scoring";
import { SAMPLES, previewOf } from "./sample-posters";

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
// USD per million tokens for the default model (claude-opus-5-5). Override if EVALUATION_MODEL is different.
const PRICE = { in: Number(process.env.PRICE_IN ?? 4), out: Number(process.env.PRICE_OUT ?? 20) };

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const ids = (arg("samples") ?? SAMPLES.map((s) => s.id).join(",")).split(",");
  const runs = Number(arg("runs", "1"));
  const out = arg("out") ?? "calibration.json";
  const db = new PrismaClient();
  const asg = await db.assignment.findUniqueOrThrow({ where: { slug: "high-contrast-event-poster" }, include: { rubricVersion: { include: { criteria: { orderBy: { key: "asc" } } } } } });
  const rv = asg.rubricVersion;
  const brief = asg.brief as unknown as { requirements: string[]; constraints: string[]; deliverables: Deliverable[] };
  const provider = new ClaudeProvider();
  const results: unknown[] = [];

  for (const id of ids) {
    const sample = SAMPLES.find((s) => s.id === id);
    if (!sample) throw new Error(`unknown sample ${id}`);
    const poster = await sample.poster();
    const preview = await previewOf(poster, sample.previewLongEdge ?? 400);
    const files = [
      { key: "x", slot: "final", name: "final.png", mime: "image/png", size: poster.length, sha256: "", width: 800, height: 1200, role: "final" as const },
      { key: "y", slot: "preview", name: "preview.png", mime: "image/png", size: preview.length, sha256: "", ...(await dims(preview)), role: "preview" as const },
    ];
    const checks = runChecks(files, sample.rationale, brief.deliverables);
    const input: EvaluationInput = {
      assignment: { title: asg.title, objective: asg.objective, scenario: asg.scenario, requirements: brief.requirements, constraints: brief.constraints },
      rubric: { title: asg.title, threshold: rv.threshold, criteria: rv.criteria.map((c) => ({ key: c.key, title: c.title, description: c.description, weight: c.weight, mandatory: c.mandatory, minScore: c.minScore })) },
      images: [
        { slot: "final", label: "Final poster", role: "final", name: "final.png", width: 800, height: 1200, mime: "image/png", data: poster },
        { slot: "preview", label: "Small-scale preview", role: "preview", name: "preview.png", width: files[1].width, height: files[1].height, mime: "image/png", data: preview },
      ],
      rationale: sample.rationale, checks,
    };

    for (let run = 1; run <= runs; run++) {
      const t0 = Date.now();
      const row: Record<string, unknown> = { sample: id, run, expect: sample.expect };
      try {
        const o = await provider.evaluate(input);
        row.ms = Date.now() - t0; row.model = o.model; row.inputTokens = o.inputTokens; row.outputTokens = o.outputTokens;
        row.costUsd = Number((((o.inputTokens ?? 0) * PRICE.in + (o.outputTokens ?? 0) * PRICE.out) / 1e6).toFixed(4));
        const parsed = modelOutput.safeParse(o.raw);
        row.schemaValid = parsed.success;
        if (!parsed.success) { row.schemaErrors = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`); row.raw = o.raw; }
        else {
          const d = parsed.data;
          row.status = d.status; row.confidence = d.confidence; row.reviewFlag = d.reviewFlag; row.missingEvidence = d.missingEvidence;
          if (d.status === "complete") {
            const r = computeResult({ threshold: rv.threshold, criteria: rv.criteria }, d.criteria, d.criticalFailures);
            Object.assign(row, { overall: r.score, passed: r.passed, failedMandatory: r.failedMandatory.map((f) => f.key), scores: Object.fromEntries(d.criteria.map((c) => [c.criterionId, c.score])) });
          }
          Object.assign(row, { strengths: d.strengths, weaknesses: d.weaknesses, missingRequirements: d.missingRequirements, criticalFailures: d.criticalFailures, criteria: d.criteria });
        }
      } catch (e) {
        row.ms = Date.now() - t0;
        row.error = String((e as Error).message).replace(/sk-ant-[A-Za-z0-9_-]+/g, "<key>").slice(0, 400);
      }
      results.push(row);
      console.log(`${id} #${run}: ${row.error ? `ERROR ${row.error}` : `${row.status} overall=${row.overall} passed=${row.passed} conf=${row.confidence} ${row.ms}ms $${row.costUsd}`}`);
      fs.writeFileSync(out, JSON.stringify(results, null, 2));
    }
  }
  await db.$disconnect();
}
async function dims(buf: Buffer) { const sharp = (await import("sharp")).default; const m = await sharp(buf).metadata(); return { width: m.width!, height: m.height! }; }
main().catch((e) => { console.error(String(e.message).replace(/sk-ant-[A-Za-z0-9_-]+/g, "<key>")); process.exit(1); });
