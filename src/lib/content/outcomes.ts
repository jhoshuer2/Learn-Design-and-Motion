import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** A real thing a person wants to be able to make. The page leads with it, then the skills and the path that get them there. */
export const outcomeSchema = z.object({
  slug,
  title: z.string().min(1),
  /** One plain sentence: what you will be able to make. */
  promise: z.string().min(10).max(160),
  forWho: z.string().min(1),
  /** Honest estimate of total practice time, not a promise. */
  hours: z.number().positive().max(200),
  tools: z.array(z.string().min(1)).default([]),
  skills: z.array(slug).min(1),
  /** The learning path (content `path` slug) that teaches it. */
  path: slug,
  /** Optional showcase clip in public/lessons (needs .mp4 and .vtt). */
  showcase: slug.optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
});
export type OutcomeDef = z.infer<typeof outcomeSchema>;

const dirOf = (root: string) => path.join(root, "outcomes");

export function loadOutcomes(root = path.join(process.cwd(), "content")): OutcomeDef[] {
  const dir = dirOf(root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort().map((f) => {
    const o = outcomeSchema.parse(YAML.parse(fs.readFileSync(path.join(dir, f), "utf8")));
    if (`${o.slug}.yaml` !== f) throw new Error(`${path.join(dir, f)}: slug "${o.slug}" must match the file name`);
    return o;
  });
}

export function loadOutcome(slugValue: string, root?: string): OutcomeDef | null {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slugValue)) return null;
  return loadOutcomes(root).find((o) => o.slug === slugValue) ?? null;
}

/** Cross-checks against the rest of the content: skills must be known competencies, the path must exist, showcase files must exist. */
export function checkOutcomes(
  outcomes: OutcomeDef[], known: Set<string>, paths: Set<string>, publicDir: string,
) {
  for (const o of outcomes) {
    for (const s of o.skills) if (!known.has(s)) throw new Error(`outcome ${o.slug}: unknown skill "${s}"`);
    if (!paths.has(o.path)) throw new Error(`outcome ${o.slug}: no learning path "${o.path}"`);
    if (o.showcase) for (const ext of ["mp4", "vtt"]) {
      if (!fs.existsSync(path.join(publicDir, "lessons", `${o.showcase}.${ext}`))) throw new Error(`outcome ${o.slug}: showcase needs public/lessons/${o.showcase}.${ext}`);
    }
  }
}
