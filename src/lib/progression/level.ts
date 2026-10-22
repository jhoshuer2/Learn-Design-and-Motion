import type { LevelTier, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { CRITICAL_COMPETENCY_PASS_MARK, incompleteLessons, visibleStatuses, type Db } from "./common";
import { FAKE_PROVIDER_NAME } from "@/lib/assessment/provider";

/**
 * Level assessment: the ONE derivation of "has this learner earned this level?". Both the unlock gate
 * (completeLevelIfEligible) and every screen call assessLevel, so what the UI says and what the server
 * enforces cannot diverge. It reads only persisted facts; callers cannot assert anything.
 */

export type BlockedBy =
  | { type: "modules_incomplete"; modules: string[] }
  | { type: "capstone_not_passed" }
  | { type: "competency"; slug: string; title: string; latestScore: number | null; needed: number };

export type CompetencyCheck = {
  slug: string; title: string; latestScore: number | null; needed: number; met: boolean;
  retakeLessons: { lessonId: string; title: string }[];
};

export type LevelAssessment = {
  levelId: string; tier: LevelTier; pathId: string; scopeLabel: string; scopeNote: string; capstoneThreshold: number;
  complete: boolean;
  modules: { id: string; title: string; complete: boolean }[];
  capstone: { assignmentId: string; title: string; passed: boolean; evaluationId: string | null } | null;
  checks: CompetencyCheck[];
  blockedBy: BlockedBy[];
  eligible: boolean; // everything required is satisfied right now (independent of whether it has been recorded)
};

async function latestEvidence(client: Db, userId: string, competencyId: string) {
  return client.skillEvidence.findFirst({ where: { userId, competencyId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
}

/** The newest passing, completed evaluation for this learner and assignment (human overrides are newer rows). */
async function passingEvaluation(client: Db, userId: string, assignmentId: string) {
  return client.evaluation.findFirst({
    where: { status: "complete", passed: true, submission: { userId, assignmentId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { scores: { include: { criterion: true } }, rubricVersion: { include: { rubric: true } }, submission: true },
  });
}

const TIERS: LevelTier[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "PROFESSIONAL"];

/**
 * Is this level open to the learner? The first tier is always open (and any tier at or below the tier the
 * learner enrolled at, once placement exists). Every other tier opens only when the previous tier's LEVEL
 * progress row exists, i.e. its capstone and required checks were passed. Enforced in every access gate.
 */
export async function isLevelOpen(client: Db, userId: string, level: { pathId: string; tier: LevelTier }): Promise<boolean> {
  const i = TIERS.indexOf(level.tier);
  if (i <= 0) return true;
  const enrollment = await client.enrollment.findUnique({ where: { userId_pathId: { userId, pathId: level.pathId } } });
  if (enrollment && TIERS.indexOf(enrollment.startTier) >= i) return true;
  const prev = await client.level.findUnique({ where: { pathId_tier: { pathId: level.pathId, tier: TIERS[i - 1] } } });
  if (!prev) return false;
  return (await client.progress.findUnique({ where: { userId_nodeType_nodeId: { userId, nodeType: "LEVEL", nodeId: prev.id } } }))?.state === "COMPLETED";
}

export async function assessLevel(client: Db, userId: string, levelId: string): Promise<LevelAssessment | null> {
  const level = await client.level.findUnique({
    where: { id: levelId },
    include: { modules: { where: { status: { in: visibleStatuses() } }, orderBy: { position: "asc" } } },
  });
  if (!level) return null;

  const modules = [];
  for (const m of level.modules) {
    const lessonsLeft = await incompleteLessons(client, userId, m.id);
    const assessment = await client.assignment.findFirst({
      where: { moduleId: m.id, kind: "MODULE_ASSESSMENT", status: { in: visibleStatuses() } },
    });
    const passed = assessment
      ? (await client.progress.findUnique({ where: { userId_nodeType_nodeId: { userId, nodeType: "ASSIGNMENT", nodeId: assessment.id } } }))?.state === "COMPLETED"
      : true;
    modules.push({ id: m.id, title: m.title, complete: lessonsLeft.length === 0 && passed });
  }

  const capstoneDef = await client.assignment.findFirst({
    where: { levelId, moduleId: null, kind: "CAPSTONE", status: { in: visibleStatuses() } },
  });
  let capstone: LevelAssessment["capstone"] = null;
  if (capstoneDef) {
    const done = (await client.progress.findUnique({ where: { userId_nodeType_nodeId: { userId, nodeType: "ASSIGNMENT", nodeId: capstoneDef.id } } }))?.state === "COMPLETED";
    const ev = done ? await passingEvaluation(client, userId, capstoneDef.id) : null;
    capstone = { assignmentId: capstoneDef.id, title: capstoneDef.title, passed: done && !!ev, evaluationId: ev?.id ?? null };
  }

  const checks: CompetencyCheck[] = [];
  for (const slug of level.requiredCompetencies) {
    const comp = await client.competency.findUnique({ where: { slug }, include: { lessons: { include: { lesson: true } } } });
    if (!comp) continue;
    const ev = await latestEvidence(client, userId, comp.id);
    const retake = [...new Map(
      comp.lessons.filter((l) => visibleStatuses().includes(l.lesson.status)).sort((a, b) => b.lesson.version - a.lesson.version).map((l) => [l.lesson.slug, l.lesson]),
    ).values()];
    checks.push({
      slug, title: comp.title, latestScore: ev?.score ?? null, needed: CRITICAL_COMPETENCY_PASS_MARK,
      met: !!ev && ev.score >= CRITICAL_COMPETENCY_PASS_MARK,
      retakeLessons: retake.map((l) => ({ lessonId: l.id, title: l.title })),
    });
  }

  const blockedBy: BlockedBy[] = [];
  const incomplete = modules.filter((m) => !m.complete).map((m) => m.title);
  if (incomplete.length > 0) blockedBy.push({ type: "modules_incomplete", modules: incomplete });
  if (!capstone || !capstone.passed) blockedBy.push({ type: "capstone_not_passed" });
  for (const c of checks) if (!c.met) blockedBy.push({ type: "competency", slug: c.slug, title: c.title, latestScore: c.latestScore, needed: c.needed });

  const recorded = (await client.progress.findUnique({ where: { userId_nodeType_nodeId: { userId, nodeType: "LEVEL", nodeId: levelId } } }))?.state === "COMPLETED";
  return {
    levelId, tier: level.tier, pathId: level.pathId, scopeLabel: level.scopeLabel ?? level.tier, scopeNote: level.scopeNote ?? "",
    capstoneThreshold: level.capstoneThreshold, complete: recorded, modules, capstone, checks, blockedBy, eligible: blockedBy.length === 0,
  };
}

const assessor = (provider: string, model: string | null) =>
  provider === "human" ? "Human reviewer"
  : provider === FAKE_PROVIDER_NAME ? "TEST EVALUATOR: not a real assessment of the work"
  : provider === "claude" ? `AI assessor (${model ?? "model not recorded"})`
  : provider;

/**
 * Award the level if, and only if, assessLevel says every requirement is met. Safe to call repeatedly and
 * concurrently: the LEVEL row is unique per (user, level), so exactly one caller creates it and writes the
 * record and audit event. Nothing else in the codebase writes a LEVEL progress row.
 */
export async function completeLevelIfEligible(client: Prisma.TransactionClient, userId: string, levelId: string) {
  const a = await assessLevel(client, userId, levelId);
  if (!a) return { unlocked: false as const, alreadyComplete: false, blockedBy: [] as BlockedBy[] };
  if (a.complete) return { unlocked: false as const, alreadyComplete: true, blockedBy: [] as BlockedBy[] };
  if (!a.eligible) return { unlocked: false as const, alreadyComplete: false, blockedBy: a.blockedBy };

  const { count } = await client.progress.createMany({
    data: [{ userId, nodeType: "LEVEL", nodeId: levelId, state: "COMPLETED", completedAt: new Date() }],
    skipDuplicates: true,
  });
  if (count === 0) return { unlocked: false as const, alreadyComplete: true, blockedBy: [] as BlockedBy[] };

  // Snapshot the evidence now: later rubric or content changes must not alter what was awarded.
  const level = await client.level.findUniqueOrThrow({ where: { id: levelId }, include: { path: { include: { discipline: true } } } });
  const assignments = await client.assignment.findMany({ where: { OR: [{ levelId, moduleId: null }, { module: { levelId } }], kind: { in: ["MODULE_ASSESSMENT", "CAPSTONE"] } } });
  const works = [];
  for (const asg of assignments) {
    const ev = await passingEvaluation(client, userId, asg.id);
    if (!ev) continue;
    works.push({
      assignment: asg.slug, title: asg.title, kind: asg.kind, evaluationId: ev.id, score: ev.overallScore, threshold: ev.rubricVersion.threshold,
      rubric: { slug: ev.rubricVersion.rubric.slug, version: ev.rubricVersion.version }, assessedBy: assessor(ev.provider, ev.model),
      humanReviewed: ev.humanReviewed, testEvaluator: ev.provider === FAKE_PROVIDER_NAME, evaluatedAt: ev.createdAt.toISOString(),
      criteria: ev.scores.map((s) => ({ key: s.criterion.key, title: s.criterion.title, score: s.score, mandatory: s.criterion.mandatory, minScore: s.criterion.minScore })),
    });
  }
  const competencies = a.checks.map((c) => ({ slug: c.slug, title: c.title, latestScore: c.latestScore, needed: c.needed }));
  const title = `${level.path.discipline.title}, ${titleCase(level.tier)}: ${a.scopeLabel}`;
  const evidence = {
    works, requiredCompetencies: competencies,
    scope: { label: a.scopeLabel, note: a.scopeNote },
    policy: { capstoneThreshold: a.capstoneThreshold, criticalCompetencyPassMark: CRITICAL_COMPETENCY_PASS_MARK },
    limits: "This record shows the assessed work listed here. It is not a professional qualification and does not by itself show professional competence.",
    testEvaluatorUsed: works.some((w) => w.testEvaluator),
  };
  await client.levelCompletion.create({ data: { userId, pathId: level.pathId, tier: level.tier, title, scopeLabel: a.scopeLabel, evidence: evidence as Prisma.InputJsonValue } });
  await client.auditEvent.create({ data: { actorId: userId, action: "level.unlock", subject: `level:${levelId}`, detail: { tier: level.tier, title } } });
  return { unlocked: true as const, alreadyComplete: false, blockedBy: [] as BlockedBy[] };
}

/**
 * Re-check levels where the capstone is already passed but a required competency was the blocker. Called
 * after new competency evidence is recorded (a retaken knowledge check), so a learner is never stuck behind
 * a stale result once they have demonstrated the skill.
 */
export async function recheckLevelsAfterEvidence(userId: string) {
  const passedCaps = await db.progress.findMany({ where: { userId, nodeType: "ASSIGNMENT", state: "COMPLETED" }, select: { nodeId: true } });
  if (passedCaps.length === 0) return;
  const caps = await db.assignment.findMany({ where: { id: { in: passedCaps.map((p) => p.nodeId) }, kind: "CAPSTONE", levelId: { not: null } }, select: { levelId: true } });
  for (const levelId of new Set(caps.map((c) => c.levelId!))) {
    await db.$transaction((tx) => completeLevelIfEligible(tx, userId, levelId));
  }
}

function titleCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export type LevelView = LevelAssessment & {
  title: string;
  record: null | { title: string; issuedAt: Date; evidence: LevelEvidence };
  next: { tier: LevelTier; authored: boolean } | null;
};

export type LevelEvidence = {
  works: { assignment: string; title: string; kind: string; score: number | null; threshold: number; rubric: { slug: string; version: number }; assessedBy: string; humanReviewed: boolean; testEvaluator: boolean; evaluatedAt: string }[];
  requiredCompetencies: { slug: string; title: string; latestScore: number | null; needed: number }[];
  scope: { label: string; note: string };
  limits: string;
  testEvaluatorUsed: boolean;
};

/** Owner-only read model for the level page. Null when the learner is not enrolled in the level's path. */
export async function getLevelView(userId: string, levelId: string): Promise<LevelView | null> {
  const level = await db.level.findUnique({ where: { id: levelId }, include: { path: { include: { discipline: true } } } });
  if (!level || !visibleStatuses().includes(level.status)) return null;
  if (!(await db.enrollment.findUnique({ where: { userId_pathId: { userId, pathId: level.pathId } } }))) return null;
  const a = await assessLevel(db, userId, levelId);
  if (!a) return null;
  const rec = await db.levelCompletion.findUnique({ where: { userId_pathId_tier: { userId, pathId: level.pathId, tier: level.tier } } });
  const nextTier = TIERS[TIERS.indexOf(level.tier) + 1];
  const nextLevel = nextTier ? await db.level.findUnique({ where: { pathId_tier: { pathId: level.pathId, tier: nextTier } } }) : null;
  return {
    ...a, title: `${level.path.discipline.title}, ${titleCase(level.tier)}: ${a.scopeLabel}`,
    record: rec ? { title: rec.title, issuedAt: rec.issuedAt, evidence: rec.evidence as unknown as LevelEvidence } : null,
    next: nextTier ? { tier: nextTier, authored: !!nextLevel && visibleStatuses().includes(nextLevel.status) } : null,
  };
}
