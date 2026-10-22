import { Prisma, type PrismaClient } from "@prisma/client";
import type { LoadedContent } from "./loader";
import type { AssignmentDef } from "./schemas";

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
      // The competency a criterion measures decides what skill evidence it writes, so it is part of what is immutable.
      const compSlugById = new Map([...comp.entries()].map(([slug, id]) => [id, slug]));
      const stored = existing.criteria.map((c) => `${c.key}:${c.weight}:${c.mandatory}:${c.minScore ?? ""}:${c.competencyId ? compSlugById.get(c.competencyId) ?? "" : ""}`).sort();
      const next = r.criteria.map((c) => `${c.key}:${c.weight}:${c.mandatory}:${c.minScore ?? ""}:${c.competency ?? ""}`).sort();
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

  // Levels first, so modules and capstones attach to a level that already carries its rules.
  const levelIds = new Map<string, string>();
  for (const lv of content.levels) {
    const d = lv.def;
    const discipline = await db.discipline.upsert({ where: { slug: d.discipline }, update: { title: titleCase(d.discipline) }, create: { slug: d.discipline, title: titleCase(d.discipline), description: "" } });
    const path = await db.path.upsert({
      where: { disciplineId_slug: { disciplineId: discipline.id, slug: d.path } }, update: { title: titleCase(d.path) },
      create: { disciplineId: discipline.id, slug: d.path, title: titleCase(d.path) },
    });
    const existing = await db.level.findUnique({ where: { pathId_tier: { pathId: path.id, tier: d.tier } } });
    const data = {
      objectives: d.objectives, capstoneThreshold: d.capstoneThreshold, scopeLabel: d.scopeLabel, scopeNote: d.scopeNote,
      requiredCompetencies: d.requiredCompetencies, status: d.status,
    };
    if (existing?.status === "PUBLISHED" &&
        (existing.capstoneThreshold !== d.capstoneThreshold || !sameJson([...existing.requiredCompetencies].sort(), [...d.requiredCompetencies].sort()))) {
      throw new Error(`Level ${d.path}/${d.tier} is published; its threshold and required competencies are immutable.`);
    }
    const level = await db.level.upsert({ where: { pathId_tier: { pathId: path.id, tier: d.tier } }, update: data, create: { pathId: path.id, tier: d.tier, ...data } });
    levelIds.set(`${d.discipline}/${d.path}/${d.tier}`, level.id);
    for (const a of lv.capstones) await upsertAssignment(db, a, { levelId: level.id, moduleId: null });
  }

  for (const m of content.modules) {
    const d = m.def;
    const discipline = await db.discipline.upsert({
      where: { slug: d.discipline }, update: { title: titleCase(d.discipline) },
      create: { slug: d.discipline, title: titleCase(d.discipline), description: "" },
    });
    const path = await db.path.upsert({
      where: { disciplineId_slug: { disciplineId: discipline.id, slug: d.path } }, update: { title: titleCase(d.path) },
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
    const keepQuestions = new Set<string>(); // lessons whose published questions are kept as-is
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

      // Question ids are referenced by attempt history, so published questions are immutable too.
      const sig = (qs: { prompt: string; options?: unknown; answer: unknown }[]) =>
        JSON.stringify(qs.map((q) => [q.prompt, q.options ?? null, q.answer]));
      if (existing?.status === "PUBLISHED" && existing.questions.length > 0) {
        const stored = sig(existing.questions.map((q) => ({ prompt: q.prompt, options: q.options, answer: q.answerKey })));
        if (stored !== sig(l.questions)) throw new Error(`Lesson ${l.meta.slug} v${l.meta.version} questions changed after publishing; bump the version.`);
        keepQuestions.add(l.meta.slug);
      } else {
        await db.quizQuestion.deleteMany({ where: { lessonId: lesson.id } });
      }
      for (const q of keepQuestions.has(l.meta.slug) ? [] : l.questions) {
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
    for (const a of m.assignments) await upsertAssignment(db, a, { levelId: level.id, moduleId: mod.id });
    for (const l of m.lessons) {
      const lessonId = lessonIds.get(l.meta.slug)!;
      await db.lessonPrerequisite.deleteMany({ where: { lessonId } });
      for (const p of l.meta.prerequisites) {
        await db.lessonPrerequisite.create({ data: { lessonId, prerequisiteId: lessonIds.get(p)! } });
      }
    }
  }
}

async function upsertAssignment(db: PrismaClient, a: AssignmentDef, where: { levelId: string; moduleId: string | null }) {
  const rv = await db.rubricVersion.findFirstOrThrow({ where: { version: a.rubric.version, rubric: { slug: a.rubric.slug } } });
  const brief = { requirements: a.requirements, constraints: a.constraints, deliverables: a.deliverables };
  const existing = await db.assignment.findUnique({ where: { slug: a.slug } });
  if (existing && existing.status === "PUBLISHED" &&
      (existing.rubricVersionId !== rv.id || !sameJson(existing.brief, brief) || existing.scenario !== a.scenario)) {
    throw new Error(`Assignment ${a.slug} is published and immutable; create a new assignment or bump its rubric through a new slug.`);
  }
  const data = {
    kind: a.kind, levelId: where.levelId, moduleId: where.moduleId, title: a.title, objective: a.objective, scenario: a.scenario,
    brief: toJson(brief), difficulty: a.difficulty, estimatedMinutes: a.estimatedMinutes,
    rubricVersionId: rv.id, maxAttempts: a.maxAttempts, status: a.status,
  };
  await db.assignment.upsert({ where: { slug: a.slug }, update: data, create: { slug: a.slug, ...data } });
}

const ACRONYMS = new Set(["ui", "ux"]);
function titleCase(s: string) {
  return s.split("-").map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ");
}
