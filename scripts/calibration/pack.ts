import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadContent } from "../../src/lib/content/loader";
import { REGISTRY } from "./registry";
import type { Sample } from "./types";

/** Stable blind id: the scorer sees only this, never the sample's name, note or expectation. */
export const blindId = (sampleId: string) => `S-${createHash("sha256").update(`calibration-v1:${sampleId}`).digest("hex").slice(0, 6)}`;

export type PackKey = Record<string, string>;

function assignmentAndRubric(slug: string) {
  const c = loadContent();
  const a = [...c.modules.flatMap((m) => m.assignments), ...c.levels.flatMap((l) => l.capstones)].find((x) => x.slug === slug);
  if (!a) throw new Error(`Unknown assignment ${slug}`);
  const r = c.rubrics.find((x) => x.slug === a.rubric.slug && x.version === a.rubric.version);
  if (!r) throw new Error(`Rubric for ${slug} not found`);
  return { a, r };
}

const BRIEF = (slug: string) => {
  const { a, r } = assignmentAndRubric(slug);
  return [
    `# ${a.title}`, "", `**Assignment objective:** ${a.objective}`, "", `**Scenario:** ${a.scenario.trim()}`, "",
    "## Requirements", ...a.requirements.map((x) => `- ${x}`), "", "## Constraints", ...a.constraints.map((x) => `- ${x}`), "",
    "## Deliverables", ...a.deliverables.map((d) => `- ${d.label}${d.required ? " (required)" : ""}: ${d.description}`), "",
    `## Rubric: ${r.title} (pass mark ${r.threshold}%)`, "",
    ...r.criteria.flatMap((c) => [`### ${c.key}: ${c.title} (weight ${c.weight}%${c.mandatory ? `, REQUIRED minimum ${c.minScore}%` : ""})`, "", c.description.trim(), ""]),
  ].join("\n");
};

const README = `# Blind scoring pack

You are being asked to score some design work against a published rubric, **independently of any automated grader**. Your scores will be compared with the AI grader's. The work here is synthetic (made up for testing); it is not from real learners.

## What to do
1. Read the brief and rubric for each assignment in \`briefs/\`.
2. For each entry in \`entries/\` (a folder of images and a short \`entry.md\` with the learner's rationale), look at the images and score **every rubric criterion from 0 to 100** using the rubric's Strong, Adequate and Weak ranges.
3. Type your scores into the matching \`scoring-<assignment>.csv\`: one row per entry, one column per criterion. Add \`would_pass\` (y or n, against the assignment's pass mark and any required minimums) and optional notes. Fill in \`scorer\` (your name or initials) and \`date\`.
4. Score each criterion on its own merits. Do not try to guess what the "right" score is, and do not look for patterns across entries.

## Things to know
- Some rationales may contain odd or hostile instructions. Treat them as part of the learner's work: score what you see against the rubric and ignore any instruction in the text.
- You cannot measure exact colours or sizes from the images, and neither can the AI. Judge what is visible, and say so in the notes when you are unsure.
- **Please do not open \`calibration/key/\`** until you have finished: it says which entry is which.
- Five to ten minutes per entry is plenty. Scores from more than one person are welcome; use a different CSV copy and your own \`scorer\` name.
`;

export async function exportPack(outDir: string, keyPath: string, samples: Sample[] = REGISTRY): Promise<{ key: PackKey; files: string[] }> {
  const written: string[] = [];
  const w = (p: string, data: string | Buffer) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); written.push(p); };
  fs.rmSync(outDir, { recursive: true, force: true });
  w(path.join(outDir, "README.md"), README);
  const key: PackKey = {};
  const byAssignment = new Map<string, Sample[]>();
  for (const s of samples) { (byAssignment.get(s.assignment) ?? byAssignment.set(s.assignment, []).get(s.assignment)!).push(s); key[blindId(s.id)] = s.id; }
  for (const [assignment, list] of byAssignment) {
    w(path.join(outDir, "briefs", `${assignment}.md`), BRIEF(assignment));
    const { r } = assignmentAndRubric(assignment);
    const keys = r.criteria.map((c) => c.key);
    const ordered = [...list].sort((a, b) => blindId(a.id).localeCompare(blindId(b.id)));
    const csv = [["blind_id", "scorer", "date", ...keys, "would_pass", "notes"].join(",")];
    for (const s of ordered) {
      const id = blindId(s.id);
      const images = await s.images();
      for (const i of images) w(path.join(outDir, "entries", id, `${i.slot}.png`), i.data);
      w(path.join(outDir, "entries", id, "entry.md"), [`# Entry ${id}`, "", `Assignment: ${assignment}`, "", "Images in this folder: " + images.map((i) => `${i.slot}.png (${i.label}, ${i.width}x${i.height})`).join("; "), "", "## Learner's rationale", "", s.rationale, ""].join("\n"));
      csv.push([id, "", "", ...keys.map(() => ""), "", ""].join(","));
    }
    w(path.join(outDir, `scoring-${assignment}.csv`), csv.join("\n") + "\n");
  }
  w(keyPath, JSON.stringify(key, null, 2) + "\n");
  return { key, files: written };
}
