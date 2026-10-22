import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { db } from "../src/lib/db";

const PW = "correct-horse-battery";
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });
const axe = async (page: Page, label: string) => {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`), label).toEqual([]);
};
const newEmail = () => `as-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
const mails = (to: string) => db.emailOutbox.findMany({ where: { to }, orderBy: { createdAt: "asc" } });
const linkIn = (text: string) => /(https?:\/\/[^\s]+)/.exec(text)![1];
/** The e2e server runs on :3100 whatever APP_URL says; keep only the path and query. */
const pathOf = (url: string) => { const u = new URL(url); return u.pathname + u.search; };

async function signUp(page: Page, email: string, name = "Secure Person") {
  await page.goto("/signup");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(PW);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("security headers are sent on pages and API responses", async ({ request }) => {
  for (const path of ["/", "/signin", "/api/auth/csrf"]) {
    const h = (await request.get(path)).headers();
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(h["x-powered-by"], path).toBeUndefined();
  }
});

test("repeated wrong passwords lock the account for guessing, even for the right password; other accounts are unaffected", async ({ browser }) => {
  const email = newEmail();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signUp(page, email);
  await page.getByRole("button", { name: "Sign out" }).click();

  for (let i = 0; i < 8; i++) {
    await page.goto("/signin");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(`wrong-password-${i}`);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  }
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PW); // correct, but the account is locked for now
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/Too many failed attempts/)).toBeVisible();
  await expect(page).toHaveURL(/\/signin/);
  await axe(page, "locked sign-in");
  await shot(page, "m8-locked");

  // Someone else can still sign in from the same client.
  const other = newEmail();
  const octx = await browser.newContext();
  await signUp(await octx.newPage(), other, "Other Person");
  await Promise.all([ctx.close(), octx.close()]);
});

test("forgot and reset: same answer for unknown addresses, one-time link, old sessions end, new password works", async ({ browser }) => {
  const email = newEmail();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signUp(page, email);
  const stay = await (await browser.newContext()).newPage(); // a second device that is signed in
  await stay.goto("/signin");
  await stay.getByLabel("Email").fill(email);
  await stay.getByLabel("Password").fill(PW);
  await stay.getByRole("button", { name: "Sign in" }).click();
  await expect(stay).toHaveURL(/\/dashboard/);
  await page.getByRole("button", { name: "Sign out" }).click();

  const answer = async (addr: string) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(addr);
    await page.getByRole("button", { name: "Send reset link" }).click();
    return page.getByRole("status").innerText();
  };
  const known = await answer(email);
  const unknown = await answer(`nobody-${Date.now()}@example.com`);
  expect(known).toBe(unknown);
  await axe(page, "forgot sent");
  expect((await mails(email)).filter((m) => /Reset/.test(m.subject))).toHaveLength(1);

  const link = pathOf(linkIn((await mails(email)).find((m) => /Reset/.test(m.subject))!.text));
  await page.goto(link);
  await axe(page, "reset form");
  await shot(page, "m8-reset");
  await page.getByLabel(/^New password/).fill("password123");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("too common"); // link not burned
  await page.getByLabel(/^New password/).fill("a-brand-new-long-passphrase");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(/\/signin\?reset=1/);
  await expect(page.getByRole("status")).toContainText("Your password was changed");

  await page.goto(link); // the link is now spent
  await expect(page.getByText(/expired or was already used/)).toBeVisible();

  await stay.goto("/dashboard"); // the other device's session was ended by the reset
  await expect(stay).toHaveURL(/\/signin/);

  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-brand-new-long-passphrase");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  expect((await mails(email)).some((m) => /was changed/.test(m.subject))).toBe(true);
});

test("email verification: sharing is blocked until the link is used; scanning the link alone does not verify", async ({ browser }) => {
  const email = newEmail();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signUp(page, email);

  await page.goto("/profile");
  await expect(page.getByText(/not confirmed yet/)).toBeVisible();
  await axe(page, "profile unverified");
  await shot(page, "m8-profile-unverified");

  // Make a project to try to share (assessment is not needed for the gate itself, so create the rows directly).
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const asg = await db.assignment.findUniqueOrThrow({ where: { slug: "high-contrast-event-poster" } });
  const sub = await db.submission.create({ data: { userId: user.id, assignmentId: asg.id, attempt: 1, status: "EVALUATED", files: [{ key: "x", slot: "final", name: "a.png", mime: "image/png", size: 1, sha256: "x", width: 1, height: 1, role: "final" }] } });
  const rv = await db.rubricVersion.findUniqueOrThrow({ where: { id: asg.rubricVersionId } });
  await db.evaluation.create({ data: { submissionId: sub.id, rubricVersionId: rv.id, provider: "test-only-fake", status: "complete", overallScore: 90, passed: true, feedback: {} } });
  await db.user.update({ where: { id: user.id }, data: { displayName: "Verify Me" } });
  const project = await db.portfolioProject.create({ data: { userId: user.id, submissionId: sub.id, slug: `v${Date.now()}abcdefgh`, title: "T", shownFiles: [0] } });

  await page.goto(`/portfolio/${project.id}`);
  await page.getByRole("radio", { name: /^Anyone with the link/ }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("Confirm your email address first");

  const link = pathOf(linkIn((await mails(email)).find((m) => /Confirm/.test(m.subject))!.text));
  const scanner = await (await browser.newContext()).newPage(); // a mail scanner opening the link, signed out
  await scanner.goto(link);
  await expect(scanner.getByRole("button", { name: "Confirm my email" })).toBeVisible();
  expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull(); // just looking verified nothing
  await axe(scanner, "verify page");

  await page.goto(link);
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByRole("status")).toContainText("confirmed");
  await page.goto(`/portfolio/${project.id}`);
  await page.getByRole("radio", { name: /^Anyone with the link/ }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("Saved.");

  await page.goto("/profile");
  await page.setViewportSize({ width: 390, height: 900 });
  await shot(page, "m8-profile-390");
  await ctx.close();
});

test("changing the password and signing out everywhere end other sessions", async ({ browser }) => {
  const email = newEmail();
  const a = await (await browser.newContext()).newPage();
  await signUp(a, email);
  const b = await (await browser.newContext()).newPage();
  await b.goto("/signin");
  await b.getByLabel("Email").fill(email);
  await b.getByLabel("Password").fill(PW);
  await b.getByRole("button", { name: "Sign in" }).click();
  await expect(b).toHaveURL(/\/dashboard/);

  await a.goto("/profile");
  await a.getByRole("button", { name: "Sign out everywhere" }).click();
  await expect(a).toHaveURL(/\/signin/);
  await b.goto("/dashboard");
  await expect(b).toHaveURL(/\/signin/);

  await a.getByLabel("Email").fill(email);
  await a.getByLabel("Password").fill(PW);
  await a.getByRole("button", { name: "Sign in" }).click();
  await expect(a).toHaveURL(/\/dashboard/);
  await a.goto("/profile");
  await a.getByLabel("Current password").fill("wrong-current-password");
  await a.getByLabel(/^New password/).fill("yet-another-long-passphrase");
  await a.getByRole("button", { name: "Change password" }).click();
  await expect(a.locator('p[role="alert"]')).toContainText("current password is not right");
  await a.getByLabel("Current password").fill(PW);
  await a.getByLabel(/^New password/).fill("yet-another-long-passphrase");
  await a.getByRole("button", { name: "Change password" }).click();
  await expect(a).toHaveURL(/\/signin\?reset=1/);
  await a.goto("/dashboard");
  await expect(a).toHaveURL(/\/signin/);
});
