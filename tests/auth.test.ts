import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import { checkPassword, hashPassword } from "../src/lib/auth/password";
import { TTL_MS, consumeToken, issueToken, lookupToken } from "../src/lib/auth/tokens";
import { checkLogin, clearLoginFailures, recordLoginFailure } from "../src/lib/auth/throttle";
import { getMailer, trySend, type Mailer } from "../src/lib/auth/mailer";
import {
  AuthFlowError, changePassword, requestPasswordReset, resetPassword, sendVerification, signOutEverywhere, verifyEmail,
} from "../src/lib/auth/account";
import { createLearner } from "../src/lib/signup";
import { createProject, updateProject, PortfolioError } from "../src/lib/portfolio";
import { createReview, reportProject } from "../src/lib/portfolio/peer";
import { createAppeal, ReviewError } from "../src/lib/review";
import { cleanup, created, evaluatedSubmission, learnerWithName, makeUser, useTempStorage } from "./helpers";

beforeAll(async () => {
  await useTempStorage();
  process.env.CONTENT_PREVIEW = "true";
  await publishContent(db, loadContent());
});
afterEach(async () => { await db.rateBucket.deleteMany({}); await db.emailOutbox.deleteMany({}); });
afterAll(async () => { await cleanup(); await db.emailOutbox.deleteMany({}); await db.$disconnect(); });

const PW = "a-Long-enough-pass-phrase";
const H = (ip = "shared") => new Headers({ "x-forwarded-for": ip });
const emailOf = async (id: string) => (await db.user.findUniqueOrThrow({ where: { id } })).email;
const outbox = (to: string) => db.emailOutbox.findMany({ where: { to }, orderBy: { createdAt: "asc" } });
const tokenIn = (text: string) => /token=([A-Za-z0-9_-]+)/.exec(text)![1];
async function account(opts: { verified?: boolean } = {}) {
  const id = await makeUser({ enroll: false, unverified: !opts.verified });
  await db.user.update({ where: { id }, data: { passwordHash: await hashPassword(PW) } });
  return id;
}
const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return e instanceof AuthFlowError || e instanceof PortfolioError || e instanceof ReviewError ? e.code : String(e); } };

describe("password policy", () => {
  it.each([
    ["short", "Use at least"], ["password123", "too common"], ["aaaaaaaaaaaa", "repetitive"], ["x".repeat(201), "at most"],
  ])("rejects %s", (pw, why) => expect(checkPassword(pw)).toContain(why));
  it("rejects a password that contains the email name or the name", () => {
    expect(checkPassword("janedoe-2026-ok", { email: "janedoe@x.org" })).toContain("email name");
    expect(checkPassword("My-Name-is-Marguerite", { name: "Marguerite" })).toContain("your name");
  });
  it("accepts a long passphrase", () => expect(checkPassword(PW, { email: "a@b.co" })).toBeNull());
  it("signup applies it, hashes with bcrypt, and starts unverified", async () => {
    expect(await createLearner({ name: "N", email: "weak@t.local", password: "password123" })).toMatchObject({ ok: false });
    const email = `s-${Date.now()}@t.local`;
    expect(await createLearner({ name: "New Person", email, password: PW })).toEqual({ ok: true });
    const u = await db.user.findUniqueOrThrow({ where: { email } });
    created.push(u.id);
    expect(u.emailVerifiedAt).toBeNull();
    expect(await bcrypt.compare(PW, u.passwordHash!)).toBe(true);
    expect((await outbox(email))[0].subject).toMatch(/Confirm your email/);
  });
  it("signup is rate limited per client", async () => {
    process.env.AUTH_SIGNUPS_PER_CLIENT_HOUR = "2";
    try {
      const r = [];
      for (let i = 0; i < 3; i++) r.push(await createLearner({ name: "Rate", email: `rl${i}-${Date.now()}@t.local`, password: PW }, "one-client"));
      expect(r.map((x) => x.ok)).toEqual([true, true, false]);
      for (const u of await db.user.findMany({ where: { email: { startsWith: "rl" } }, select: { id: true } })) created.push(u.id);
    } finally { delete process.env.AUTH_SIGNUPS_PER_CLIENT_HOUR; }
  });
});

describe("sign-in throttling", () => {
  it("blocks an account after repeated failures, whatever the client, and success clears it", async () => {
    process.env.AUTH_FAILS_PER_ACCOUNT = "3";
    try {
      const e = "victim@t.local";
      for (let i = 0; i < 2; i++) await recordLoginFailure(e, H(`10.0.0.${i}`));
      expect((await checkLogin(e, H("10.9.9.9"))).blocked).toBe(false);
      await recordLoginFailure(e, H("10.0.0.7"));
      const t = await checkLogin("VICTIM@t.local ", H("10.9.9.9")); // other address, other spelling: still blocked
      expect(t.blocked).toBe(true);
      expect(t.retryAfterSec).toBeGreaterThan(0);
      expect((await checkLogin("someone-else@t.local", H())).blocked).toBe(false);
      await clearLoginFailures(e);
      expect((await checkLogin(e, H())).blocked).toBe(false);
    } finally { delete process.env.AUTH_FAILS_PER_ACCOUNT; }
  });
  it("blocks a client that sprays many accounts", async () => {
    process.env.AUTH_FAILS_PER_CLIENT = "3";
    process.env.TRUST_PROXY = "true";
    try {
      for (let i = 0; i < 3; i++) await recordLoginFailure(`u${i}@t.local`, H("198.51.100.5"));
      expect((await checkLogin("fresh@t.local", H("198.51.100.5"))).blocked).toBe(true);
      expect((await checkLogin("fresh@t.local", H("198.51.100.6"))).blocked).toBe(false);
    } finally { delete process.env.AUTH_FAILS_PER_CLIENT; delete process.env.TRUST_PROXY; }
  });
  it("stores a hash of the account, never the email", async () => {
    await recordLoginFailure("private.person@t.local", H());
    const ids = (await db.rateBucket.findMany()).map((b) => b.id).join(" ");
    expect(ids).not.toContain("private");
  });
});

describe("tokens", () => {
  it("are single use, expiring, kind-bound, stored only as a hash, and the newest replaces older ones", async () => {
    const u = await account();
    const t1 = await issueToken(u, "RESET_PASSWORD");
    expect(await db.authToken.count({ where: { tokenHash: t1 } })).toBe(0); // the secret itself is never stored
    const t2 = await issueToken(u, "RESET_PASSWORD");
    expect(await consumeToken(t1, "RESET_PASSWORD")).toBeNull(); // replaced
    expect(await consumeToken(t2, "VERIFY_EMAIL")).toBeNull();   // wrong purpose
    expect(await lookupToken(t2, "RESET_PASSWORD")).toEqual({ userId: u });
    expect(await consumeToken(t2, "RESET_PASSWORD")).toEqual({ userId: u });
    expect(await consumeToken(t2, "RESET_PASSWORD")).toBeNull(); // spent
    const t3 = await issueToken(u, "RESET_PASSWORD", new Date(Date.now() - TTL_MS.RESET_PASSWORD - 1000));
    expect(await consumeToken(t3, "RESET_PASSWORD")).toBeNull(); // expired
    expect(await consumeToken("short", "RESET_PASSWORD")).toBeNull();
  });
  it("only one of two simultaneous uses wins", async () => {
    const u = await account();
    const t = await issueToken(u, "VERIFY_EMAIL");
    const r = await Promise.all([consumeToken(t, "VERIFY_EMAIL"), consumeToken(t, "VERIFY_EMAIL"), consumeToken(t, "VERIFY_EMAIL")]);
    expect(r.filter(Boolean)).toHaveLength(1);
  });
});

describe("mailer", () => {
  it("refuses the dev outbox in production unless explicitly allowed, and reports no transport honestly", async () => {
    const env = process.env as Record<string, string | undefined>;
    const keep = { n: env.NODE_ENV, t: process.env.EMAIL_TRANSPORT };
    try {
      env.NODE_ENV = "production";
      expect(() => getMailer()).toThrow(/dev\/test only/);
      process.env.ALLOW_OUTBOX_MAILER = "true";
      expect(getMailer()).not.toBeNull();
      delete process.env.EMAIL_TRANSPORT;
      expect(getMailer()).toBeNull();
      expect(await trySend({ to: "a@b.co", subject: "x", text: "y" })).toBe(false);
    } finally { env.NODE_ENV = keep.n; process.env.EMAIL_TRANSPORT = keep.t; delete process.env.ALLOW_OUTBOX_MAILER; }
  });
  it("a failing mailer never throws to the caller", async () => {
    const bad: Mailer = { send: async () => { throw new Error("smtp down"); } };
    expect(await trySend({ to: "a@b.co", subject: "x", text: "y" }, bad)).toBe(false);
  });
});

describe("email verification", () => {
  it("sends a link, verifies once, audits it, and limits resends", async () => {
    const u = await account();
    expect(await sendVerification(u)).toBe("sent");
    const [mail] = await outbox(await emailOf(u));
    expect(mail.text).toContain("http://app.test/verify-email?token=");
    const token = tokenIn(mail.text);
    expect(await verifyEmail(token)).toBe(true);
    expect(await verifyEmail(token)).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: u } })).emailVerifiedAt).not.toBeNull();
    expect(await sendVerification(u)).toBe("already_verified");
    expect(await db.auditEvent.count({ where: { actorId: u, action: "user.email_verified" } })).toBe(1);

    const v = await account();
    for (let i = 0; i < 3; i++) await sendVerification(v);
    expect(await code(sendVerification(v))).toBe("rate_limited");
  });
  it("gates sharing, feedback, reporting and appeals until verified; learning is unaffected", async () => {
    const owner = await learnerWithName("Gated Owner");
    await db.user.update({ where: { id: owner }, data: { emailVerifiedAt: null } });
    const s = await evaluatedSubmission(owner, "[fake:score=60]");
    const p = await createProject(owner, s.submissionId); // adding privately is fine
    expect(await code(updateProject(owner, p.id, { visibility: "LINK" }))).toBe("unverified");
    expect(await code(createAppeal(owner, s.evaluationId, "I think the contrast was judged too harshly here, look again."))).toBe("unverified");
    await db.user.update({ where: { id: owner }, data: { emailVerifiedAt: new Date() } });
    expect(await code(updateProject(owner, p.id, { visibility: "LINK" }))).toBe("ok");

    const rev = await learnerWithName("Gated Reviewer", { enroll: false });
    await db.user.update({ where: { id: rev }, data: { emailVerifiedAt: null } });
    const ok = "The hierarchy is clear and the title reads first at a glance.";
    expect(await code(createReview(rev, p.slug, { strengths: ok, improvements: ok }))).toBe("unverified");
    expect(await code(reportProject(rev, p.slug, "This is a long enough reason for a report."))).toBe("unverified");
    await db.user.update({ where: { id: rev }, data: { emailVerifiedAt: new Date() } });
    expect(await code(createReview(rev, p.slug, { strengths: ok, improvements: ok }))).toBe("ok");
    expect(await code(reportProject(rev, p.slug, "This is a long enough reason for a report."))).toBe("ok");
  });
  it("making a project private again never needs verification", async () => {
    const owner = await learnerWithName("Private Again");
    const s = await evaluatedSubmission(owner);
    const p = await createProject(owner, s.submissionId);
    await updateProject(owner, p.id, { visibility: "LINK" });
    await db.user.update({ where: { id: owner }, data: { emailVerifiedAt: null } });
    expect(await code(updateProject(owner, p.id, { visibility: "PRIVATE" }))).toBe("ok");
  });
});

describe("password reset", () => {
  it("answers identically for known, unknown and malformed addresses, and only the real account is mailed", async () => {
    const u = await account({ verified: true });
    const known = await emailOf(u);
    await requestPasswordReset(known, "c");
    await requestPasswordReset("nobody@t.local", "c");
    await requestPasswordReset("not-an-email", "c");
    expect((await outbox(known)).length).toBe(1);
    expect((await outbox("nobody@t.local")).length).toBe(0);
    expect(await db.emailOutbox.count()).toBe(1);
  });
  it("is rate limited per account and per client, silently", async () => {
    const u = await account();
    const e = await emailOf(u);
    for (let i = 0; i < 6; i++) await requestPasswordReset(e, `client-${i}`);
    expect((await outbox(e)).length).toBe(3); // 3 per account per hour
    process.env.AUTH_RESET_PER_CLIENT_HOUR = "1";
    try {
      const a = await account(); const b = await account();
      await requestPasswordReset(await emailOf(a), "same-client");
      await requestPasswordReset(await emailOf(b), "same-client");
      expect((await outbox(await emailOf(b))).length).toBe(0);
    } finally { delete process.env.AUTH_RESET_PER_CLIENT_HOUR; }
  });
  it("sets a new password, ends every session, spends the link, confirms the address, and tells the owner", async () => {
    const u = await account();
    const e = await emailOf(u);
    await requestPasswordReset(e, "c");
    const token = tokenIn((await outbox(e))[0].text);
    const before = (await db.user.findUniqueOrThrow({ where: { id: u } })).tokenVersion;
    await resetPassword(token, "another-Long-pass-phrase");
    const after = await db.user.findUniqueOrThrow({ where: { id: u } });
    expect(await bcrypt.compare("another-Long-pass-phrase", after.passwordHash!)).toBe(true);
    expect(after.tokenVersion).toBe(before + 1);
    expect(after.emailVerifiedAt).not.toBeNull();
    expect(await code(resetPassword(token, "third-Long-pass-phrase"))).toBe("expired");
    expect((await outbox(e)).some((m) => /was changed/.test(m.subject))).toBe(true);
    expect(await db.auditEvent.count({ where: { actorId: u, action: "user.password_reset" } })).toBe(1);
  });
  it("a weak new password is refused without burning the link", async () => {
    const u = await account();
    const e = await emailOf(u);
    await requestPasswordReset(e, "c");
    const token = tokenIn((await outbox(e))[0].text);
    expect(await code(resetPassword(token, "password123"))).toBe("weak_password");
    expect(await code(resetPassword(token, "a-fine-new-pass-phrase"))).toBe("ok");
  });
  it("rejects bad, expired and cross-purpose links", async () => {
    const u = await account();
    expect(await code(resetPassword("nope-nope-nope-nope-nope-nope", PW))).toBe("expired");
    const v = await issueToken(u, "VERIFY_EMAIL");
    expect(await code(resetPassword(v, "a-fine-new-pass-phrase"))).toBe("expired");
  });
  it("an account with no password (never set) gets no reset mail", async () => {
    const id = await makeUser({ enroll: false });
    await requestPasswordReset(await emailOf(id), "c");
    expect((await outbox(await emailOf(id))).length).toBe(0);
  });
});

describe("changing the password and signing out everywhere", () => {
  it("needs the current password, applies the policy, bumps the session version, audits, and mails a notice", async () => {
    const u = await account();
    expect(await code(changePassword(u, "wrong", "a-fine-new-pass-phrase"))).toBe("wrong_password");
    expect(await code(changePassword(u, PW, "password123"))).toBe("weak_password");
    expect(await code(changePassword(u, PW, PW))).toBe("weak_password");
    const v0 = (await db.user.findUniqueOrThrow({ where: { id: u } })).tokenVersion;
    await changePassword(u, PW, "a-fine-new-pass-phrase");
    expect((await db.user.findUniqueOrThrow({ where: { id: u } })).tokenVersion).toBe(v0 + 1);
    expect((await outbox(await emailOf(u))).some((m) => /was changed/.test(m.subject))).toBe(true);
    expect(await db.auditEvent.count({ where: { actorId: u, action: "user.password_changed" } })).toBe(1);
  });
  it("sign out everywhere bumps the version", async () => {
    const u = await account();
    await signOutEverywhere(u);
    expect((await db.user.findUniqueOrThrow({ where: { id: u } })).tokenVersion).toBe(1);
  });
});
