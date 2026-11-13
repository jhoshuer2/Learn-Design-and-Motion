import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

/** Competency slug to title, read straight from content/competencies.yaml (no database needed for a public page). */
export function loadContentCompetencyTitles(root = path.join(process.cwd(), "content")): Record<string, string> {
  const doc = YAML.parse(fs.readFileSync(path.join(root, "competencies.yaml"), "utf8")) as { competencies: { slug: string; title: string }[] };
  return Object.fromEntries(doc.competencies.map((c) => [c.slug, c.title]));
}
