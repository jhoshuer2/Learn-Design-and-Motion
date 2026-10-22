import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";
import { db } from "../src/lib/db";

const RATIONALE = "I made the event name the largest and darkest element so it reads first, used a mid tone for date and place, and one saturated button colour for the call to action so it separates from everything else.";
const PASSWORD = "correct-horse-battery";
const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#cc4422" } }).png().toBuffer();
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });
const axe = async (page: Page, label: string) => {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`), label).toEqual([]);
};

async function signUp(page: Page, name: string, enroll = true) {
  const email = `sf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await db.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } }); // verification has its own spec
  if (enroll) {
    await page.getByRole("listitem").filter({ hasText: "Graphic Design" }).getByRole("button", { name: "Enroll" }).click();
    await expect(page.getByText("In progress")).toBeVisible();
  }
  return email;
}

async function learnerWithProject(browser: Browser, name = "Safety Owner") {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = await signUp(page, name);
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const lessons = await db.lesson.findMany({ where: { module: { slug: "understanding-contrast" } }, select: { id: true } });
  await db.progress.createMany({ data: lessons.map((l) => ({ userId: user.id, nodeType: "LESSON", nodeId: l.id, state: "COMPLETED" as const, completedAt: new Date() })), skipDuplicates: true });
  await page.goto("/learn");
  await page.getByRole("link", { name: /Assessment: Create a high-contrast event poster/ }).click();
  await page.getByLabel(/^Final poster/).setInputFiles({ name: "poster.png", mimeType: "image/png", buffer: await png(800, 1200) });
  await page.getByLabel(/^Small-scale preview/).setInputFiles({ name: "small.png", mimeType: "image/png", buffer: await png(267, 400) });
  await page.getByLabel(/^Rationale/).fill(`${RATIONALE} [fake:score=90]`);
  await page.getByRole("button", { name: "Submit for assessment" }).click();
  await expect(page.getByRole("heading", { name: /Passed: \d+%/ })).toBeVisible();
  await page.goto("/profile");
  await page.getByLabel(/^Display name/).fill(name);
  await page.getByRole("button", { name: "Save display name" }).click();
  await expect(page.getByRole("status")).toContainText("Saved.");
  await page.goto("/portfolio");
  await page.getByRole("button", { name: "Add (private)" }).click();
  await expect(page).toHaveURL(/\/portfolio\/[a-z0-9]+/);
  const id = page.url().split("/portfolio/")[1].split("?")[0];
  const p = await db.portfolioProject.findUniqueOrThrow({ where: { id } });
  return { ctx, page, email, id, slug: p.slug, userId: user.id };
}

async function reviewer(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = await signUp(page, "Safety Reviewer", false);
  await db.user.update({ where: { email }, data: { role: "REVIEWER" } });
  return { ctx, page };
}

async function share(page: Page, id: string, option: RegExp) {
  await page.goto(`/portfolio/${id}`);
  await page.getByRole("radio", { name: option }).check();
  await page.getByRole("button", { name: "Save" }).click();
}

test("Public needs a reviewer's approval, and any later change needs it again", async ({ browser }) => {
  const owner = await learnerWithProject(browser);
  const anon = await (await browser.newContext()).newPage();

  // Contact details and links are refused in shared text.
  await owner.page.goto(`/portfolio/${owner.id}`);
  await owner.page.getByLabel(/^Short introduction/).fill("Email me at someone@example.com for work");
  await owner.page.getByRole("radio", { name: /^Public/ }).check();
  await owner.page.getByRole("button", { name: "Save" }).click();
  await expect(owner.page.locator('p[role="alert"]')).toContainText("email address");
  await owner.page.getByLabel(/^Short introduction/).fill("A poster built around one strong focal point.");
  await owner.page.getByRole("button", { name: "Save" }).click();

  // Waiting: invisible to others, even though the visibility is Public.
  await expect(owner.page.getByTestId("approval")).toContainText("Waiting for a reviewer");
  expect((await anon.goto(`/p/${owner.slug}`))?.status()).toBe(404);
  expect((await anon.request.get(`/api/portfolio/${owner.slug}/files/0`)).status()).toBe(404);
  await axe(owner.page, "edit page, waiting");
  await shot(owner.page, "m7-owner-waiting");

  const rev = await reviewer(browser);
  await rev.page.goto("/review/moderation");
  await expect(rev.page.getByRole("heading", { name: "Public approvals" })).toBeVisible();
  await axe(rev.page, "moderation queue");
  await rev.page.locator(`a[href="/review/moderation/approvals/${owner.id}"]`).click();
  await expect(rev.page.getByText(/not screened \(none configured\)/)).toBeVisible();
  await expect(rev.page.locator("figure img").first()).toBeVisible();
  await axe(rev.page, "approval detail");
  await shot(rev.page, "m7-approval-detail");
  await rev.page.getByRole("button", { name: "Approve for public" }).click();
  await expect(rev.page).toHaveURL(/\/review\/moderation$/);

  expect((await anon.goto(`/p/${owner.slug}`))?.status()).toBe(200);
  expect((await anon.request.get(`/api/portfolio/${owner.slug}/files/0`)).status()).toBe(200);
  await owner.page.goto("/notifications");
  await expect(owner.page.getByText(/was approved and is now public/)).toBeVisible();
  await axe(owner.page, "notices");

  // Change what it shows: back to waiting, and gone again.
  await owner.page.goto(`/portfolio/${owner.id}`);
  await owner.page.getByLabel("Title").fill("A different title");
  await owner.page.getByRole("button", { name: "Save" }).click();
  await expect(owner.page.getByTestId("approval")).toContainText("Waiting for a reviewer");
  expect((await anon.goto(`/p/${owner.slug}`))?.status()).toBe(404);

  // A rejection explains itself.
  await rev.page.goto(`/review/moderation/approvals/${owner.id}`);
  await rev.page.getByLabel(/^Note to the owner/).fill("Please use a clearer image.");
  await rev.page.getByRole("button", { name: "Do not approve" }).click();
  await expect(rev.page).toHaveURL(/\/review\/moderation$/); // the decision is recorded before the redirect
  await owner.page.goto(`/portfolio/${owner.id}`);
  await expect(owner.page.getByTestId("approval")).toContainText("Not approved for public sharing: Please use a clearer image.");
  await shot(owner.page, "m7-owner-rejected");
  await Promise.all([owner.ctx.close(), rev.ctx.close()]);
});

test("anyone can report content; a reviewer takes it down and the owner is told", async ({ browser }) => {
  const owner = await learnerWithProject(browser, "Reported Owner");
  await share(owner.page, owner.id, /^Anyone with the link/);
  const anon = await (await browser.newContext()).newPage();
  expect((await anon.goto(`/p/${owner.slug}`))?.status()).toBe(200);

  await anon.goto("/report-abuse");
  await axe(anon, "report form");
  await shot(anon, "m7-report-form");
  await anon.getByLabel(/^Link to the page/).fill(`http://localhost:3100/p/${owner.slug}`);
  await anon.getByLabel(/^What is the problem/).fill("This shows something that should not be hosted on this site.");
  await anon.getByRole("button", { name: "Send report" }).click();
  await expect(anon.getByRole("status")).toContainText("Your report was received");

  const rev = await reviewer(browser);
  await rev.page.goto("/review/takedowns");
  await axe(rev.page, "takedown queue");
  const item = rev.page.getByRole("listitem").filter({ hasText: "should not be hosted on this site" }).last();
  await item.getByLabel(/^Reason/).fill("Confirmed against the content policy.");
  await item.getByRole("button", { name: "Take down (hold)" }).click();
  // The action redirects to the same URL, so wait for the request to leave the queue rather than for the URL.
  await expect(rev.page.getByRole("listitem").filter({ hasText: "should not be hosted on this site" })).toHaveCount(0);

  expect((await anon.goto(`/p/${owner.slug}`))?.status()).toBe(404);
  await owner.page.goto("/notifications");
  await expect(owner.page.getByText(/taken down after a complaint.*Confirmed against the content policy/)).toBeVisible();
  await expect(owner.page.getByText(/Secret|reporter/i)).toHaveCount(0);
  await Promise.all([owner.ctx.close(), rev.ctx.close()]);
});

test("policy pages are present, labelled as drafts, and linked from every page", async ({ page }) => {
  for (const path of ["/policy", "/terms", "/privacy"]) {
    await page.goto(path);
    await expect(page.getByRole("note")).toContainText("not legal advice");
    await axe(page, path);
  }
  await page.setViewportSize({ width: 390, height: 800 });
  await shot(page, "m7-privacy-390");
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Report content" })).toBeVisible();
});

test("deleting an account removes its shared work at once and ends its session", async ({ browser }) => {
  const owner = await learnerWithProject(browser, "Leaving Owner");
  await share(owner.page, owner.id, /^Anyone with the link/);
  const anon = await (await browser.newContext()).newPage();
  expect((await anon.goto(`/p/${owner.slug}`))?.status()).toBe(200);

  await owner.page.goto("/profile/delete");
  await axe(owner.page, "delete page");
  await shot(owner.page, "m7-delete-account");
  await owner.page.getByLabel("Your password").fill("not-the-password");
  await owner.page.getByLabel(/^Type/).fill("delete my account");
  await owner.page.getByRole("button", { name: "Delete my account permanently" }).click();
  await expect(owner.page.locator('p[role="alert"]')).toContainText("not right");
  expect(await db.user.count({ where: { email: owner.email } })).toBe(1);

  await owner.page.getByLabel("Your password").fill(PASSWORD);
  await owner.page.getByLabel(/^Type/).fill("delete my account");
  await owner.page.getByRole("button", { name: "Delete my account permanently" }).click();
  await expect(owner.page.getByText("Your account and everything in it were deleted.")).toBeVisible();

  expect(await db.user.count({ where: { email: owner.email } })).toBe(0);
  expect((await anon.goto(`/p/${owner.slug}`))?.status()).toBe(404);
  expect((await anon.request.get(`/api/portfolio/${owner.slug}/files/0`)).status()).toBe(404);
  // The old session cannot be used, and the credentials no longer sign in.
  await owner.page.goto("/dashboard");
  await expect(owner.page).toHaveURL(/\/signin/);
  await owner.page.getByLabel("Email").fill(owner.email);
  await owner.page.getByLabel(/^Password/).fill(PASSWORD);
  await owner.page.getByRole("button", { name: /Sign in/ }).click();
  await expect(owner.page).toHaveURL(/\/signin/);
  await Promise.all([owner.ctx.close()]);
});

// Last: it uses up one client's image allowance for the rest of the minute (the client is identified by a made-up
// address the server believes because the e2e server runs with TRUST_PROXY=true), so nothing after it is affected.
test("a burst of anonymous image requests is rate limited with Retry-After; a signed-in owner is not", async ({ browser }) => {
  const owner = await learnerWithProject(browser, "Burst Owner");
  await share(owner.page, owner.id, /^Anyone with the link/);
  const anon = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 200) + 1}` } });
  const url = `/api/portfolio/${owner.slug}/files/0`;
  const codes: number[] = [];
  let retry: string | undefined;
  for (let i = 0; i < 45; i++) {
    const r = await anon.request.get(url);
    codes.push(r.status());
    if (r.status() === 429) retry = r.headers()["retry-after"];
  }
  expect(codes.slice(0, 40).every((c) => c === 200)).toBe(true);
  expect(codes.slice(40)).toContain(429);
  expect(Number(retry)).toBeGreaterThan(0);
  expect((await owner.ctx.request.get(url)).status()).toBe(200);
  await Promise.all([owner.ctx.close(), anon.close()]);
});
