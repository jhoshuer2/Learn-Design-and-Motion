import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { clearPause, getPause, setPause } from "./flags";
import { enqueue, queueStats } from "./queue";
import { dailyBudgetUsd, spendTodayUsd } from "./ops";

export class AdminError extends Error {}
const requireAdmin = (u: { role: Role }) => { if (u.role !== "ADMIN") throw new AdminError("Only an administrator can do this."); };

export async function adminPause(admin: { id: string; role: Role }) {
  requireAdmin(admin);
  return setPause("manual", admin.id, "Paused by an administrator.");
}

export async function adminResume(admin: { id: string; role: Role }) {
  requireAdmin(admin);
  return clearPause(admin.id);
}

/** Queue a failed or stuck submission again. Uses no learner attempt. */
export async function adminRequeue(admin: { id: string; role: Role }, submissionId: string) {
  requireAdmin(admin);
  const r = await enqueue(submissionId);
  await db.auditEvent.create({ data: { actorId: admin.id, action: "assessment.requeued", subject: `submission:${submissionId}`, detail: { jobId: r.job.id } } });
  return r;
}

export async function operatorSnapshot() {
  const [stats, pause, spent, failed] = await Promise.all([
    queueStats(), getPause(), spendTodayUsd(),
    db.evaluationJob.groupBy({ by: ["lastErrorKind"], where: { status: "FAILED_FINAL" }, _count: true }),
  ]);
  return {
    ...stats, pause, spentTodayUsd: spent, budgetUsd: dailyBudgetUsd(),
    failedByKind: failed.map((f) => ({ kind: f.lastErrorKind ?? "unknown", count: f._count })),
  };
}
