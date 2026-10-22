import type { Prisma, PublishStatus } from "@prisma/client";
import { db } from "@/lib/db";

/** Either the shared client or an interactive-transaction client. */
export type Db = Prisma.TransactionClient | typeof db;

/** Published content is always visible. Draft content is visible only when CONTENT_PREVIEW=true (dev/staging). */
export function visibleStatuses(): PublishStatus[] {
  return process.env.CONTENT_PREVIEW === "true" ? ["PUBLISHED", "IN_REVIEW", "DRAFT"] : ["PUBLISHED"];
}


/** Policy knobs. Defaults are product choices, not educational standards (see docs/PROGRESSION_ENGINE.md). */
export const CRITICAL_COMPETENCY_PASS_MARK = 80;
export const MAX_RESETS = 1;
export const EXTRA_ATTEMPTS_PER_RESET = 2;

/** Titles of lessons in a module the learner has not completed (latest visible version of each lesson). */
export async function incompleteLessons(client: Db, userId: string, moduleId: string) {
  const all = await client.lesson.findMany({
    where: { moduleId, status: { in: visibleStatuses() } },
    orderBy: [{ position: "asc" }, { version: "desc" }],
  });
  const latest = [...new Map(all.map((l) => [l.slug, l])).values()];
  const everyVersion = await client.lesson.findMany({ where: { moduleId }, select: { id: true, slug: true } });
  const done = await client.progress.findMany({
    where: { userId, nodeType: "LESSON", state: "COMPLETED", nodeId: { in: everyVersion.map((l) => l.id) } },
    select: { nodeId: true },
  });
  const doneSlugs = new Set(everyVersion.filter((l) => done.some((d) => d.nodeId === l.id)).map((l) => l.slug));
  return latest.filter((l) => !doneSlugs.has(l.slug)).map((l) => l.title);
}

