import { db } from "@/lib/db";
import { clientKey } from "@/lib/ratelimit";

/**
 * Failed-sign-in throttling, in two independent dimensions so one cannot be used to hide the other:
 * per account (stops guessing one person's password from many addresses) and per client (stops spraying one password
 * across many accounts). A success clears the account counter. Both are fixed windows in RateBucket.
 *
 * The account counter locks an account *for guessing only*: it delays an attacker and also a genuine owner, for the
 * window, which is the usual trade-off. It is keyed by a hash of the email, not the email.
 */
const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
export const LOGIN = {
  windowMs: 15 * 60_000,
  perAccount: () => num(process.env.AUTH_FAILS_PER_ACCOUNT, 8),
  perClient: () => num(process.env.AUTH_FAILS_PER_CLIENT, 40),
};

import { createHash } from "node:crypto";
const acct = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24);
const windowId = (now: number) => Math.floor(now / LOGIN.windowMs) * LOGIN.windowMs;
const id = (kind: string, subject: string, now: number) => `login-${kind}:${subject}:${windowId(now)}`;

async function count(key: string): Promise<number> {
  return (await db.rateBucket.findUnique({ where: { id: key } }))?.count ?? 0;
}

export type Throttle = { blocked: boolean; retryAfterSec: number };

export async function checkLogin(email: string, headers: Headers, now = Date.now()): Promise<Throttle> {
  const [a, c] = await Promise.all([count(id("acct", acct(email), now)), count(id("client", clientKey(headers), now))]);
  const blocked = a >= LOGIN.perAccount() || c >= LOGIN.perClient();
  return { blocked, retryAfterSec: Math.max(1, Math.ceil((windowId(now) + LOGIN.windowMs - now) / 1000)) };
}

async function bump(key: string, now: number) {
  const expiresAt = new Date(windowId(now) + LOGIN.windowMs + 60_000);
  await db.rateBucket.upsert({ where: { id: key }, create: { id: key, count: 1, expiresAt }, update: { count: { increment: 1 } } });
}

export async function recordLoginFailure(email: string, headers: Headers, now = Date.now()) {
  await Promise.all([bump(id("acct", acct(email), now), now), bump(id("client", clientKey(headers), now), now)]);
}

export async function clearLoginFailures(email: string, now = Date.now()) {
  await db.rateBucket.deleteMany({ where: { id: id("acct", acct(email), now) } });
}
