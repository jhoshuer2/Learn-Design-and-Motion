import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import YAML from "yaml";
import { ZodError } from "zod";
import {
  BLOCK_KINDS, assignmentSchema, checksSchema, competenciesSchema, lessonFrontmatter, moduleSchema, rubricSchema,
  type AssignmentDef, type LessonFrontmatter, type ModuleDef, type Question, type RubricDef,
} from "./schemas";
import { DEMO_NAMES, DEMO_TOKEN } from "./demos";
import { MACHINE_SCORED } from "../progression/scoring";

export type Block = { kind: (typeof BLOCK_KINDS)[number]; title: string; body: string };
export type LoadedLesson = { meta: LessonFrontmatter; blocks: Block[]; questions: Question[] };
export type LoadedModule = { def: ModuleDef; lessons: LoadedLesson[]; assignments: AssignmentDef[] };
export type LoadedContent = {
  competencies: { slug: string; title: string; critical: boolean }[];
  modules: LoadedModule[];
  rubrics: RubricDef[];
};

const HEADING = /^## \{(\w+)\}\s*(.*)$/;

/** Lesson bodies are markdown whose `## {kind} Title` headings mark loop blocks. */
export function parseBlocks(body: string, file: string): Block[] {
  const blocks: Block[] = [];
  let cur: Block | null = null;
  for (const line of body.split("\n")) {
    const m = HEADING.exec(line);
    if (m) {
      const kind = m[1] as Block["kind"];
      if (!BLOCK_KINDS.includes(kind)) throw new Error(`${file}: unknown block kind "{${m[1]}}"`);
      cur = { kind, title: m[2].trim(), body: "" };
      blocks.push(cur);
    } else if (cur) {
      cur.body += line + "\n";
    } else if (line.trim()) {
      throw new Error(`${file}: text before first {block} heading`);
    }
  }
  for (const b of blocks) b.body = b.body.trim();
  return blocks;
}

function readYaml(file: string) {
  return YAML.parse(fs.readFileSync(file, "utf8"));
}

/** Parse with a schema and name the offending file in the error. */
function parseFile<T>(file: string, parse: () => T): T {
  try {
    return parse();
  } catch (e) {
    const detail = e instanceof ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : String(e);
    throw new Error(`${file}: ${detail}`);
  }
}

function walk(dir: string, name: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, name, out);
    else if (e.name === name) out.push(p);
  }
  return out;
}

export function loadContent(root = path.join(process.cwd(), "content")): LoadedContent {
  const comp = competenciesSchema.parse(readYaml(path.join(root, "competencies.yaml"))).competencies;
  const known = new Set(comp.map((c) => c.slug));

  const rubricDir = path.join(root, "rubrics");
  const rubrics = fs.existsSync(rubricDir)
    ? fs.readdirSync(rubricDir).filter((f) => f.endsWith(".yaml"))
        .map((f) => parseFile(path.join(rubricDir, f), () => rubricSchema.parse(readYaml(path.join(rubricDir, f)))))
    : [];

  const modules: LoadedModule[] = walk(root, "module.yaml").map((file) => {
    const dir = path.dirname(file);
    const def = moduleSchema.parse(readYaml(file));
    const lessons = def.lessons.map((slug): LoadedLesson => {
      const lf = path.join(dir, `${slug}.mdx`);
      const parsed = matter(fs.readFileSync(lf, "utf8"));
      const meta = parseFile(lf, () => lessonFrontmatter.parse(parsed.data));
      if (meta.slug !== slug) throw new Error(`${lf}: frontmatter slug "${meta.slug}" != "${slug}"`);
      const blocks = parseBlocks(parsed.content, lf);
      if (!blocks.some((b) => b.kind === "objective")) throw new Error(`${lf}: missing {objective} block`);
      for (const c of meta.competencies) if (!known.has(c)) throw new Error(`${lf}: unknown competency "${c}"`);
      for (const p of meta.prerequisites) {
        if (p === slug || !def.lessons.includes(p)) throw new Error(`${lf}: prerequisite "${p}" is not another lesson in this module`);
      }
      const cf = path.join(dir, `${slug}.checks.yaml`);
      const questions = fs.existsSync(cf) ? parseFile(cf, () => checksSchema.parse(readYaml(cf)).questions) : [];
      for (const q of questions) if (q.competency && !known.has(q.competency)) throw new Error(`${cf}: unknown competency "${q.competency}"`);
      for (const b of blocks) {
        for (const line of b.body.split("\n")) {
          if (!line.trim().startsWith("<<demo")) continue;
          const m = DEMO_TOKEN.exec(line.trim());
          if (!m) throw new Error(`${lf}: malformed demo token (needs a caption): ${line.trim()}`);
          if (!(DEMO_NAMES as readonly string[]).includes(m[1])) throw new Error(`${lf}: unknown demo "${m[1]}"`);
        }
      }
      for (const q of questions) {
        if (!(MACHINE_SCORED as readonly string[]).includes(q.type)) {
          throw new Error(`${cf}: knowledge checks are machine-scored; "${q.type}" questions belong in assessed tasks`);
        }
      }
      if (blocks.some((b) => b.kind === "check") && questions.length === 0) {
        throw new Error(`${lf}: has a {check} block but no ${slug}.checks.yaml questions`);
      }
      return { meta, blocks, questions };
    });
    assertAcyclic(lessons, file);
    const assignments = fs.readdirSync(dir).filter((f) => f.endsWith(".assignment.yaml")).map((f) => {
      const af = path.join(dir, f);
      const a = parseFile(af, () => assignmentSchema.parse(readYaml(af)));
      const rubric = rubrics.find((r) => r.slug === a.rubric.slug && r.version === a.rubric.version);
      if (!rubric) throw new Error(`${af}: rubric ${a.rubric.slug}@${a.rubric.version} does not exist`);
      for (const c of rubric.criteria) if (c.competency && !known.has(c.competency)) throw new Error(`${af}: rubric criterion "${c.key}" has unknown competency "${c.competency}"`);
      return a;
    });
    return { def, lessons, assignments };
  });

  return { competencies: comp, modules, rubrics };
}

function assertAcyclic(lessons: LoadedLesson[], file: string) {
  const deps = new Map(lessons.map((l) => [l.meta.slug, l.meta.prerequisites]));
  const state = new Map<string, 1 | 2>();
  const visit = (s: string) => {
    if (state.get(s) === 2) return;
    if (state.get(s) === 1) throw new Error(`${file}: prerequisite cycle at "${s}"`);
    state.set(s, 1);
    for (const d of deps.get(s) ?? []) visit(d);
    state.set(s, 2);
  };
  for (const s of deps.keys()) visit(s);
}
