/** npx tsx scripts/calibration-report.ts docs/calibration/poster.json [more.json ...] [--md docs/calibration/report.md] */
import fs from "node:fs";
import { REGISTRY } from "./calibration/registry";
import { summarise, toMarkdown } from "./calibration/report";
import type { Row } from "./calibration/types";

const args = process.argv.slice(2);
const mdAt = args.indexOf("--md");
const md = mdAt >= 0 ? args[mdAt + 1] : undefined;
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--md");
if (files.length === 0) { console.error("usage: calibration-report <results.json>... [--md out.md]"); process.exit(1); }
const rows: Row[] = files.flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8")) as Row[]);
const sums = summarise(rows, REGISTRY);
const text = toMarkdown(sums, { model: rows.find((r) => r.model)?.model, date: new Date().toISOString().slice(0, 10), note: `${rows.length} runs in ${files.length} file(s).` });
console.log(text);
if (md) fs.writeFileSync(md, text);
