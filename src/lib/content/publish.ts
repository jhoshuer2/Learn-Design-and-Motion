import { Prisma, type PrismaClient } from "@prisma/client";
import type { LoadedContent } from "./loader";

const toJson = (v: unknown) => v as Prisma.InputJsonValue;
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Idempotent. Published rubric versions and lesson versions are immutable: if the stored
 * content differs, publishing fails and the author must bump the version.
 */
export async function publishContent(db: PrismaClient, content: LoadedContent) {
  const comp = new Map<string, string>();
  for (const c of content.competencies) {
    const row = await db.competency.upsert({
      where: { slug: c.slug },
      update: { title: c.title, critical: c.critical },
      create: c,
    });
    comp.set(c.slug, row.id);
  }

  for (const r of content.rubrics) {
    const rubric = await db.rubric.upsert({ where: { slug: r.slug }, update: { title: r.title }, create: { slug: r.slug, title: r.title } });
    const existing = await db.rubricVersion.findUnique({
      where: { rubricId_version: { rubricId: rubric.id, version: r.version } },
      include: { criteria: true },
    });
    if (existing) {
      const stored = existing.criteria.map((c) => `${c.key}:${c.weight}:${c.mandatory}:${c.minScore ?? ""}`).sort();
      const next = r.criteria.map((c) => `${c.key}:${c.weight}:${c.mandatory}:${c.minScore ?? ""}`).sort();
      if (existing.threshold !== r.threshold || !sameJson(stored, next)) {
        throw new Error(`Rubric ${r.slug} v${r.version} is published and immutable; bump the version.`);
      }
      continue;
    }
    await db.rubricVersion.create({
      data: {
        rubricId: rubric.id, version: r.version, threshold: r.threshold, publishedAt: new Date(),
        criteria: {
          create: r.criteria.map((c) => ({
            key: c.key, title: c.title, description: c.description, weight: c.weight,
            mandatory: c.mandatory, minScore: c.minScore,
            competencyId: c.competency ? comp.get(c.competency) : undefined,
          })),
        },
      },
    });
  }

  for (const m of content.modules) {
    const d = m.def;
    const discipline = await db.discipline.upsert({
      where: { slug: d.discipline }, update: {},
      create: { slug: d.discipline, title: titleCase(d.discipline), description: "" },
    });
    const path = await db.path.upsert({
      where: { disciplineId_slug: { disciplineId: discipline.id, slug: d.path } }, update: {},
      create: { disciplineId: discipline.id, slug: d.path, title: titleCase(d.path) },
    });
    const level = await db.level.upsert({
      where: { pathId_tier: { pathId: path.id, tier: d.level } }, update: {},
      create: { pathId: path.id, tier: d.level, objectives: [] },
    });
    const mod = await db.module.upsert({
      where: { levelId_slug: { levelId: level.id, slug: d.slug } },
      update: { title: d.title, position: d.position, objectives: d.objectives, assessmentThreshold: d.assessmentThreshold, status: d.status },
      create: { levelId: level.id, slug: d.slug, title: d.title, position: d.position, objectives: d.objectives, assessmentThreshold: d.assessmentThreshold, status: d.status },
    });

    const lessonIds = new Map<string, string>();
    for (const [i, l] of m.lessons.entries()) {
      const key = { moduleId_slug_version: { moduleId: mod.id, slug: l.meta.slug, version: l.meta.version } };
      const existing = await db.lesson.findUnique({ where: key, include: { questions: true } });
      if (existing && existing.status === "PUBLISHED" && !sameJson(existing.blocks, l.blocks)) {
        throw new Error(`Lesson ${l.meta.slug} v${l.meta.version} is published and immutable; bump the version.`);
      }
      const data = {
        title: l.meta.title, position: i, objective: l.meta.objective, checkThreshold: l.meta.checkThreshold,
        status: l.meta.status, blocks: toJson(l.blocks),
      };
      const lesson = await db.lesson.upsert({
        where: key, update: data,
        create: { moduleId: mod.id, slug: l.meta.slug, version: l.meta.version, ...data },
      });
      lessonIds.set(l.meta.slug, lesson.id);

      await db.quizQuestion.deleteMany({ where: { lessonId: lesson.id } });
      for (const q of l.questions) {
        await db.quizQuestion.create({
          data: {
            lessonId: lesson.id, type: q.type, prompt: q.prompt, options: q.options ? toJson(q.options) : undefined,
            answerKey: toJson(q.answer), explanation: q.explanation,
            competencyId: q.competency ? comp.get(q.competency) : undefined,
          },
        });
      }
      await db.contentAsset.deleteMany({ where: { lessonId: lesson.id } });
      for (const a of l.meta.assets) await db.contentAsset.create({ data: { lessonId: lesson.id, ...a } });
      await db.lessonCompetency.deleteMany({ where: { lessonId: lesson.id } });
      for (const c of l.meta.competencies) {
        await db.lessonCompetency.create({ data: { lessonId: lesson.id, competencyId: comp.get(c)! } });
      }
    }
    for (const l of m.lessons) {
      const lessonId = lessonIds.get(l.meta.slug)!;
      await db.lessonPrerequisite.deleteMany({ where: { lessonId } });
      for (const p of l.meta.prerequisites) {
        await db.lessonPrerequisite.create({ data: { lessonId, prerequisiteId: lessonIds.get(p)! } });
      }
    }
  }
}

function titleCase(s: string) {
  return s.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}
