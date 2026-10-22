import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Fixed-window rate limiting in the database. One atomic upsert per check, so concurrent requests count correctly.
 * Clients are identified by an HMAC of their address, never the address itself. `x-forwarded-for` is only believed when
 * TRUST_PROXY=true (otherwise anyone could pick their own identity); without it all anonymous traffic shares one bucket,
 * which is safe but coarse.
 */
export type Limit = { bucket: string; max: number; windowMs: number };

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
export const LIMITS = {
  pageAnon: () => ({ bucket: "page", max: num(process.env.RATE_PAGE_ANON_PER_MIN, 120), windowMs: 60_000 }),
  imageAnon: () => ({ bucket: "image", max: num(process.env.RATE_IMAGE_ANON_PER_MIN, 300), windowMs: 60_000 }),
  pageUser: () => ({ bucket: "page-user", max: num(process.env.RATE_PAGE_USER_PER_MIN, 600), windowMs: 60_000 }),
  imageUser: () => ({ bucket: "image-user", max: num(process.env.RATE_IMAGE_USER_PER_MIN, 1200), windowMs: 60_000 }),
  takedown: () => ({ bucket: "takedown", max: num(process.env.RATE_TAKEDOWN_PER_HOUR, 5), windowMs: 3_600_000 }),
} as const;

export function clientKey(headers: Headers): string {
  const forwarded = process.env.TRUST_PROXY === "true" ? headers.get("x-forwarded-for")?.split(",")[0]?.trim() : undefined;
  const raw = forwarded || "shared";
  return createHmac("sha256", process.env.RATE_LIMIT_SALT ?? "dev-only-salt").update(raw).digest("hex").slice(0, 24);
}

export type HitResult = { allowed: boolean; count: number; retryAfterSec: number };

export async function hit(subject: string, limit: Limit, now = new Date()): Promise<HitResult> {
  const windowStart = Math.floor(now.getTime() / limit.windowMs) * limit.windowMs;
  const id = `${limit.bucket}:${subject}:${windowStart}`;
  const expiresAt = new Date(windowStart + limit.windowMs + 60_000);
  const rows = await db.$queryRaw<{ count: number }[]>(Prisma.sql`
    INSERT INTO "RateBucket" ("id", "count", "expiresAt") VALUES (${id}, 1, ${expiresAt})
    ON CONFLICT ("id") DO UPDATE SET "count" = "RateBucket"."count" + 1
    RETURNING "count"`);
  const count = rows[0].count;
  return { allowed: count <= limit.max, count, retryAfterSec: Math.max(1, Math.ceil((windowStart + limit.windowMs - now.getTime()) / 1000)) };
}

/** Anonymous visitors are keyed by (hashed) address; signed-in ones by account with a larger allowance. */
export async function limitViewer(kind: "page" | "image", headers: Headers, userId?: string | null): Promise<HitResult> {
  if (userId) return hit(userId, kind === "page" ? LIMITS.pageUser() : LIMITS.imageUser());
  return hit(clientKey(headers), kind === "page" ? LIMITS.pageAnon() : LIMITS.imageAnon());
}

export async function purgeExpired(now = new Date()) {
  return (await db.rateBucket.deleteMany({ where: { expiresAt: { lt: now } } })).count;
}
