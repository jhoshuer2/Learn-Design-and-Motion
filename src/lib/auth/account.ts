import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { LIMITS, hit, type Limit } from "@/lib/ratelimit";
import { checkPassword, hashPassword } from "./password";
import { consumeToken, issueToken, lookupToken, peekToken } from "./tokens";
import { appUrl, trySend, type Mailer } from "./mailer";

export class AuthFlowError extends Error {
  constructor(public code: "invalid" | "rate_limited" | "wrong_password" | "expired" | "unverified" | "not_found" | "weak_password", message?: string) { super(message ?? code); }
}

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
const hourly = (bucket: string, max: number): Limit => ({ bucket, max, windowMs: 3_600_000 });
const LIM = {
  verifyMail: () => hourly("auth-verify-mail", num(process.env.AUTH_VERIFY_MAILS_PER_HOUR, 3)),
  resetClient: () => hourly("auth-reset-client", num(process.env.AUTH_RESET_PER_CLIENT_HOUR, 10)),
  resetAccount: () => hourly("auth-reset-acct", num(process.env.AUTH_RESET_PER_ACCOUNT_HOUR, 3)),
  signup: () => hourly("auth-signup", num(process.env.AUTH_SIGNUPS_PER_CLIENT_HOUR, 10)),
};
export { LIM as AUTH_LIMITS };

// ───────── Email verification

export async function sendVerification(userId: string, mailer?: Mailer | null): Promise<"sent" | "already_verified" | "not_configured"> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true } });
  if (!u) throw new AuthFlowError("not_found");
  if (u.emailVerifiedAt) return "already_verified";
  if (!(await hit(userId, LIM.verifyMail())).allowed) throw new AuthFlowError("rate_limited", "You have asked for several emails. Please wait a while and try again.");
  const token = await issueToken(userId, "VERIFY_EMAIL");
  const ok = await trySend({
    to: u.email, subject: "Confirm your email for Creative Mastery",
    text: `Confirm your email address by opening this link within 48 hours:\n\n${appUrl()}/verify-email?token=${token}\n\nIf you did not create an account, ignore this message.`,
  }, mailer);
  return ok ? "sent" : "not_configured";
}

export async function verifyEmail(token: string): Promise<boolean> {
  const t = await consumeToken(token, "VERIFY_EMAIL");
  if (!t) return false;
  await db.user.updateMany({ where: { id: t.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
  await db.auditEvent.create({ data: { actorId: t.userId, action: "user.email_verified", subject: `user:${t.userId}`, detail: {} } });
  return true;
}

/** Sharing, feedback and reporting need an address the person has proved they control. */
export async function requireVerified(userId: string): Promise<void> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
  if (!u?.emailVerifiedAt) throw new AuthFlowError("unverified", "Confirm your email address first. You can do that from your profile.");
}

// ───────── Password reset

/**
 * Always resolves the same way, whether or not the address has an account, so it cannot be used to find out who is
 * registered. Rate-limited per client and per address. The reset link goes only to the address on file.
 */
export async function requestPasswordReset(emailRaw: string, clientSubject: string, mailer?: Mailer | null): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return;
  const [c, a] = await Promise.all([hit(clientSubject, LIM.resetClient()), hit(email, LIM.resetAccount())]);
  if (!c.allowed || !a.allowed) return;
  const u = await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  if (!u?.passwordHash) return;
  const token = await issueToken(u.id, "RESET_PASSWORD");
  await trySend({
    to: email, subject: "Reset your Creative Mastery password",
    text: `Someone asked to reset the password for this account. To choose a new one, open this link within one hour:\n\n${appUrl()}/reset-password?token=${token}\n\nIf this was not you, ignore this message: your password has not changed.`,
  }, mailer);
  await db.auditEvent.create({ data: { actorId: u.id, action: "user.reset_requested", subject: `user:${u.id}`, detail: {} } });
}

export const resetLinkIsLive = (token: string) => peekToken(token, "RESET_PASSWORD");

export async function resetPassword(token: string, newPassword: string, mailer?: Mailer | null): Promise<void> {
  const owner = await lookupToken(token, "RESET_PASSWORD");
  if (!owner) throw new AuthFlowError("expired", "This link has expired or was already used. Ask for a new one.");
  const u = await db.user.findUniqueOrThrow({ where: { id: owner.userId }, select: { email: true, name: true, emailVerifiedAt: true } });
  const weak = checkPassword(newPassword, { email: u.email, name: u.name ?? undefined });
  if (weak) throw new AuthFlowError("weak_password", weak); // the link is untouched, so the person can try again
  const spent = await consumeToken(token, "RESET_PASSWORD"); // atomic: of two simultaneous uses, one wins
  if (!spent) throw new AuthFlowError("expired", "This link has expired or was already used. Ask for a new one.");
  await db.user.update({
    where: { id: spent.userId },
    // Receiving the email proves control of the address; every existing session ends.
    data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 }, emailVerifiedAt: u.emailVerifiedAt ?? new Date() },
  });
  await db.authToken.updateMany({ where: { userId: spent.userId, kind: "RESET_PASSWORD", usedAt: null }, data: { usedAt: new Date() } });
  await db.auditEvent.create({ data: { actorId: spent.userId, action: "user.password_reset", subject: `user:${spent.userId}`, detail: {} } });
  await trySend({ to: u.email, subject: "Your Creative Mastery password was changed", text: "The password for your account was just changed using a reset link. If this was not you, reset it again now and contact the site operator." }, mailer);
}

// ───────── Signed in: change password, sign out everywhere

export async function changePassword(userId: string, current: string, next: string, mailer?: Mailer | null): Promise<void> {
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u?.passwordHash) throw new AuthFlowError("not_found");
  if (!(await bcrypt.compare(current, u.passwordHash))) throw new AuthFlowError("wrong_password", "Your current password is not right.");
  const weak = checkPassword(next, { email: u.email, name: u.name ?? undefined });
  if (weak) throw new AuthFlowError("weak_password", weak);
  if (next === current) throw new AuthFlowError("weak_password", "Choose a password you have not used just now.");
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next), tokenVersion: { increment: 1 } } });
  await db.auditEvent.create({ data: { actorId: userId, action: "user.password_changed", subject: `user:${userId}`, detail: {} } });
  await trySend({ to: u.email, subject: "Your Creative Mastery password was changed", text: "The password for your account was just changed. If this was not you, reset it now and contact the site operator." }, mailer);
}

export async function signOutEverywhere(userId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  await db.auditEvent.create({ data: { actorId: userId, action: "user.signed_out_everywhere", subject: `user:${userId}`, detail: {} } });
}

export { LIMITS };
