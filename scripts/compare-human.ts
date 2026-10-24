/**
 * npx tsx scripts/compare-human.ts <results.json> <scoring-<assignment>.csv>... [--key calibration/key/pack-key.json]
 * Compares filled-in human scoring sheets with the AI grader's results. Needs the published rubric from the database.
 */
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { compareHuman, readHumanCsv, type HumanRow } from "./calibration/compare";
import { REGISTRY } from "./calibration/registry";
import type { Row } from "./calibration/types";

const args = process.argv.slice(2);
const keyAt = args.indexOf("--key");
const keyPath = keyAt >= 0 ? args[keyAt + 1] : "calibration/key/pack-key.json";
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--key");
const [resultsFile, ...csvs] = files;
if (!resultsFile || csvs.length === 0) { console.error("usage: compare-human <results.json> <scoring.csv>... [--key key.json]"); process.exit(1); }

async function main() {
  const rows: Row[] = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
  const key: Record<string, string> = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  const db = new PrismaClient();
  try {
    for (const csv of csvs) {
      const assignment = /scoring-(.+)\.csv$/.exec(csv)?.[1];
      if (!assignment) throw new Error(`cannot tell the assignment from ${csv}`);
      const asg = await db.assignment.findUniqueOrThrow({ where: { slug: assignment }, include: { rubricVersion: { include: { criteria: { orderBy: { key: "asc" } } } } } });
      const rubric = { threshold: asg.rubricVersion.threshold, criteria: asg.rubricVersion.criteria };
      const human: HumanRow[] = readHumanCsv(fs.readFileSync(csv, "utf8"), rubric.criteria.map((c) => c.key));
      const mine = human.filter((h) => REGISTRY.find((s) => s.id === key[h.blindId])?.assignment === assignment);
      const a = compareHuman(mine, key, rows, rubric);
      console.log(`\n## ${assignment}: ${a.n} entries scored by ${a.scorers.join(", ") || "nobody"}${a.indicativeOnly ? " (INDICATIVE ONLY: fewer than 8)" : ""}`);
      console.log(`overall mean absolute difference: ${a.overallMae} points; pass/fail agreement: ${a.passAgreement}; rank correlation: ${a.rankCorrelation ?? "n/a"}`);
      console.table(a.perCriterion);
      console.table(a.perSample);
    }
  } finally { await db.$disconnect(); }
}
main().catch((e) => { console.error(String(e.message)); process.exit(1); });
