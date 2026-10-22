import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const status = z.enum(["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"]);

/** The ten lesson-loop block kinds (brief section 3). Order may adapt; outcomes may not. */
export const BLOCK_KINDS = [
  "objective", "concept", "demo", "realWorld", "goodVsBad",
  "guided", "check", "task", "reflection", "feedback",
] as const;

export const assetSchema = z.object({
  kind: z.enum(["image", "video", "transcript", "file", "interactive"]),
  url: z.string().min(1),
  altText: z.string().min(1, "alt text is required"),
  caption: z.string().min(1, "every visual must explain something: caption required"),
  source: z.string().min(1),
  licence: z.string().min(1),
});

export const lessonFrontmatter = z.object({
  slug,
  title: z.string().min(1),
  objective: z.string().min(10),
  version: z.number().int().positive().default(1),
  status: status.default("DRAFT"),
  checkThreshold: z.number().int().min(0).max(100).default(80),
  competencies: z.array(slug).default([]),
  prerequisites: z.array(slug).default([]),
  assets: z.array(assetSchema).default([]),
});

export const moduleSchema = z.object({
  discipline: slug,
  path: slug,
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "PROFESSIONAL"]),
  slug,
  title: z.string().min(1),
  position: z.number().int().nonnegative(),
  objectives: z.array(z.string().min(1)).min(1),
  assessmentThreshold: z.number().int().min(0).max(100).default(80),
  status: status.default("DRAFT"),
  lessons: z.array(slug).min(1),
});

export const questionSchema = z
  .object({
    type: z.enum([
      "MULTIPLE_CHOICE", "MULTIPLE_SELECT", "SHORT_ANSWER",
      "CONCEPT_EXPLANATION", "VISUAL_IDENTIFICATION", "ERROR_DETECTION",
    ]),
    prompt: z.string().min(1),
    options: z.array(z.string().min(1)).optional(),
    answer: z.union([z.string(), z.array(z.string())]),
    explanation: z.string().min(1),
    competency: slug.optional(),
  })
  .superRefine((q, ctx) => {
    const choice = q.type === "MULTIPLE_CHOICE" || q.type === "MULTIPLE_SELECT";
    if (choice && (!q.options || q.options.length < 2)) {
      ctx.addIssue({ code: "custom", message: "choice questions need at least 2 options" });
    }
    if (choice && q.options) {
      const answers = Array.isArray(q.answer) ? q.answer : [q.answer];
      for (const a of answers) {
        if (!q.options.includes(a)) ctx.addIssue({ code: "custom", message: `answer "${a}" is not one of the options` });
      }
    }
  });

export const checksSchema = z.object({ questions: z.array(questionSchema) });

export const competenciesSchema = z.object({
  competencies: z.array(z.object({ slug, title: z.string().min(1), critical: z.boolean().default(false) })),
});

export const rubricSchema = z
  .object({
    slug,
    title: z.string().min(1),
    version: z.number().int().positive(),
    threshold: z.number().int().min(0).max(100),
    criteria: z.array(
      z.object({
        key: slug,
        title: z.string().min(1),
        description: z.string().min(1),
        weight: z.number().int().positive(),
        mandatory: z.boolean().default(false),
        minScore: z.number().int().min(0).max(100).optional(),
        competency: slug.optional(),
      }),
    ).min(1),
  })
  .superRefine((r, ctx) => {
    const total = r.criteria.reduce((n, c) => n + c.weight, 0);
    if (total !== 100) ctx.addIssue({ code: "custom", message: `criterion weights sum to ${total}, expected 100` });
    for (const c of r.criteria) {
      if (c.mandatory && c.minScore === undefined) {
        ctx.addIssue({ code: "custom", message: `mandatory criterion "${c.key}" needs minScore` });
      }
    }
  });

export type LessonFrontmatter = z.infer<typeof lessonFrontmatter>;
export type ModuleDef = z.infer<typeof moduleSchema>;
export type Question = z.infer<typeof questionSchema>;
export type RubricDef = z.infer<typeof rubricSchema>;
