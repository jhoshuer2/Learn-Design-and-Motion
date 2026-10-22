import { db } from "@/lib/db";

export type PauseReason = "billing" | "auth" | "budget" | "not_configured" | "manual";
export type PauseState = { reason: PauseReason; since: string; by: string | null; detail: string | null };
const KEY = "assessment.paused";

export async function getPause(): Promise<PauseState | null> {
  const f = await db.systemFlag.findUnique({ where: { key: KEY } });
  return f ? (f.value as unknown as PauseState) : null;
}

/** Idempotent: the first pause reason and time are kept so an operator sees when and why it began. */
export async function setPause(reason: PauseReason, by: string | null, detail?: string): Promise<PauseState> {
  const existing = await getPause();
  if (existing) return existing;
  const value: PauseState = { reason, since: new Date().toISOString(), by, detail: detail?.slice(0, 300) ?? null };
  await db.systemFlag.upsert({ where: { key: KEY }, update: {}, create: { key: KEY, value, updatedBy: by } });
  await db.auditEvent.create({ data: { actorId: by, action: "assessment.paused", subject: "system", detail: { reason } } });
  return (await getPause()) ?? value;
}

export async function clearPause(by: string | null): Promise<boolean> {
  const { count } = await db.systemFlag.deleteMany({ where: { key: KEY } });
  if (count > 0) await db.auditEvent.create({ data: { actorId: by, action: "assessment.resumed", subject: "system", detail: {} } });
  return count > 0;
}
