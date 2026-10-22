import { createHash, randomBytes } from "node:crypto";
import type { AuthTokenKind } from "@prisma/client";
import { db } from "@/lib/db";

/** Emailed, single-use, expiring secrets. 256 random bits; only the SHA-256 is stored. */
export const TTL_MS: Record<AuthTokenKind, number> = { VERIFY_EMAIL: 48 * 3_600_000, RESET_PASSWORD: 60 * 60_000 };
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function issueToken(userId: string, kind: AuthTokenKind, now = new Date()): Promise<string> {
  // Only the newest link works: older unused ones for the same purpose are retired.
  await db.authToken.updateMany({ where: { userId, kind, usedAt: null }, data: { usedAt: now } });
  const token = randomBytes(32).toString("base64url");
  await db.authToken.create({ data: { userId, kind, tokenHash: hash(token), expiresAt: new Date(now.getTime() + TTL_MS[kind]) } });
  return token;
}

/** Atomically spends a token. Returns the user it belongs to, or null if it is unknown, used or expired. */
export async function consumeToken(token: string, kind: AuthTokenKind, now = new Date()): Promise<{ userId: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const h = hash(token);
  const claim = await db.authToken.updateMany({ where: { tokenHash: h, kind, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
  if (claim.count === 0) return null;
  const row = await db.authToken.findUnique({ where: { tokenHash: h }, select: { userId: true } });
  return row ? { userId: row.userId } : null;
}

/** Who a live token belongs to, without spending it (so input can be validated first and a typo does not burn the link). */
export async function lookupToken(token: string, kind: AuthTokenKind, now = new Date()): Promise<{ userId: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const row = await db.authToken.findFirst({ where: { tokenHash: hash(token), kind, usedAt: null, expiresAt: { gt: now } }, select: { userId: true } });
  return row ? { userId: row.userId } : null;
}

/** Look without spending, so a form can be shown only for a live link. */
export async function peekToken(token: string, kind: AuthTokenKind, now = new Date()): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return false;
  return !!(await db.authToken.findFirst({ where: { tokenHash: hash(token), kind, usedAt: null, expiresAt: { gt: now } }, select: { id: true } }));
}
