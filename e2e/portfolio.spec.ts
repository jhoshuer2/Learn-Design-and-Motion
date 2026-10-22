import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import sharp from "sharp";
import { db } from "../src/lib/db";

const RATIONALE = "I made the event name the largest and darkest element so it reads first, used a mid tone for date and place, and one saturated button colour for the call to action so it separates from everything else.";
const STRENGTHS = "The event name reads first because it is the largest and darkest element on the poster.";
const IMPROVE = "The date and venue text sits close to the background tone, so try darkening it by a step.";
const REASON = "This project contains content that should not be shared publicly.";
const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#cc4422" } }).png().toBuffer();

async function signUp(page: Page, name: string) {
  const email = `pf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole("button", { name: "Enroll" }).first().click();
  await expect(page.getByText("In progress")).toBeVisible();
  return email;
}

async function newLearner(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = await signUp(page, name);
  return { ctx, page, email };
}

async function setDisplayName(page: Page, name: string) {
  await page.goto("/profile");
  await page.getByLabel(/^Display name/).fill(name);
  await page.getByRole("button", { name: "Save display name" }).click();
  await expect(page.getByRole("status")).toContainText("Saved.");
}

/** A learner with one assessed (test-evaluator) poster submission, via the real submit flow. */
async function withAssessedWork(page: Page, email: string, marker = "[fake:score=90]") {
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const lessons = await db.lesson.findMany({ where: { module: { slug: "understanding-contrast" } }, select: { id: true } });
  await db.progress.createMany({ data: lessons.map((l) => ({ userId: user.id, nodeType: "LESSON", nodeId: l.id, state: "COMPLETED" as const, completedAt: new Date() })), skipDuplicates: true });
  await page.goto("/learn");
  await page.getByRole("link", { name: /Assessment: Create a high-contrast event poster/ }).click();
  await page.getByLabel(/^Final poster/).setInputFiles({ name: "poster.png", mimeType: "image/png", buffer: await png(800, 1200) });
  await page.getByLabel(/^Small-scale preview/).setInputFiles({ name: "small.png", mimeType: "image/png", buffer: await png(267, 400) });
  await page.getByLabel(/^Rationale/).fill(`${RATIONALE} ${marker}`);
  await page.getByRole("button", { name: "Submit for assessment" }).click();
  await expect(page.getByRole("heading", { name: /Passed: \d+%/ })).toBeVisible();
}

/** Adds the work to the portfolio (private) and returns the project id and slug. */
async function addProject(page: Page) {
  await page.goto("/portfolio");
  await page.getByRole("button", { name: "Add (private)" }).click();
  await expect(page).toHaveURL(/\/portfolio\/[a-z0-9]+/);
  const id = page.url().split("/portfolio/")[1].split("?")[0];
  const p = await db.portfolioProject.findUniqueOrThrow({ where: { id } });
  return { id, slug: p.slug };
}

async function setSharing(page: Page, id: string, visibility: "Private" | "Anyone with the link" | "Public", opts: { evidence?: boolean } = {}) {
  await page.goto(`/portfolio/${id}`);
  await page.getByRole("radio", { name: new RegExp(`^${visibility}`) }).check();
  const box = page.getByLabel("Show my assessment result on this project");
  if (opts.evidence) await box.check(); else if (opts.evidence === false) await box.uncheck();
  await page.getByRole("button", { name: "Save" }).click();
  // Public needs a reviewer's approval; that flow has its own spec (safety.spec.ts). Here, approve as a shortcut.
  if (visibility === "Public") {
    await page.waitForURL(/[?&](saved|error)=/);
    if (page.url().includes("saved=1")) await db.portfolioProject.updateMany({ where: { id, visibility: "PUBLIC" }, data: { publicApproval: "APPROVED" } });
  }
}

async function sharedProject(browser: Browser, visibility: "Anyone with the link" | "Public" = "Public") {
  const owner = await newLearner(browser, "Owner Legal Name");
  await withAssessedWork(owner.page, owner.email);
  await setDisplayName(owner.page, "Pixel Pat");
  const proj = await addProject(owner.page);
  await setSharing(owner.page, proj.id, visibility, { evidence: true });
  await expect(owner.page.getByRole("status")).toContainText("Saved.");
  return { ...owner, ...proj };
}

const axe = async (page: Page, label: string, exclude: string[] = []) => {
  let b = new AxeBuilder({ page });
  for (const e of exclude) b = b.exclude(e);
  expect((await b.analyze()).violations.map((v) => `${v.id}: ${v.nodes.length}`), label).toEqual([]);
};

test("sharing: the display name is required, public pages are readable by anyone and never leak the account, private is a 404, and un-sharing revokes an open image URL", async ({ browser }) => {
  const owner = await newLearner(browser, "Owner Legal Name");
  await withAssessedWork(owner.page, owner.email);
  const { id, slug } = await addProject(owner.page);

  // No display name yet: sharing is refused and nothing becomes visible.
  await setSharing(owner.page, id, "Public");
  await expect(owner.page.locator('p[role="alert"]')).toContainText("display name");
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  expect((await ap.goto(`/p/${slug}`))?.status()).toBe(404);

  await setDisplayName(owner.page, "Pixel Pat");
  await axe(await (async () => { await owner.page.goto(`/portfolio/${id}`); return owner.page; })(), "edit page");
  await setSharing(owner.page, id, "Public", { evidence: true });
  await expect(owner.page.getByRole("status")).toContainText("Saved.");

  // An anonymous visitor (no account) reads the page and the image.
  const res = await ap.goto(`/p/${slug}`);
  expect(res?.status()).toBe(200);
  await expect(ap.getByRole("heading", { name: "Create a high-contrast event poster" })).toBeVisible();
  await expect(ap.getByText("By Pixel Pat")).toBeVisible();
  await expect(ap.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const html = await ap.content();
  expect(html).not.toContain(owner.email);
  expect(html).not.toContain("Owner Legal Name");
  const img = ap.locator("figure img").first();
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  const imgUrl = await img.getAttribute("src");
  const imgRes = await anon.request.get(imgUrl!);
  expect(imgRes.status()).toBe(200);
  expect(imgRes.headers()["content-type"]).toBe("image/png");
  expect(imgRes.headers()["x-robots-tag"]).toMatch(/noindex/);

  // Evidence is labelled: a test evaluator is never "verified", and the page says it is not a qualification.
  await expect(ap.getByRole("note")).toContainText("TEST EVALUATOR");
  await expect(ap.getByText("Verified", { exact: true })).toHaveCount(0); // no verified badge
  await expect(ap.getByText(/It is not marked verified/)).toBeVisible();
  await expect(ap.getByText(/not a qualification/)).toBeVisible();
  await axe(ap, "public project page");

  const robots = await (await anon.request.get("/robots.txt")).text();
  expect(robots).toMatch(/Disallow: \/p\//);

  // LINK: reachable by URL, but not listed. PUBLIC: listed for signed-in learners.
  const viewer = await newLearner(browser, "Viewer");
  await viewer.page.goto("/community");
  await expect(viewer.page.locator(`a[href="/p/${slug}"]`)).toBeVisible(); // this project, among any others in the gallery
  await axe(viewer.page, "community");
  await setSharing(owner.page, id, "Anyone with the link");
  await expect(owner.page.getByRole("status")).toContainText("Saved.");
  expect((await ap.goto(`/p/${slug}`))?.status()).toBe(200);
  await viewer.page.goto("/community");
  await expect(viewer.page.locator(`a[href="/p/${slug}"]`)).toHaveCount(0); // LINK is not listed

  // Private again: the page AND the image URL that was already open stop working at once.
  await setSharing(owner.page, id, "Private");
  await expect(owner.page.getByRole("status")).toContainText("Saved.");
  expect((await ap.goto(`/p/${slug}`))?.status()).toBe(404);
  expect((await anon.request.get(imgUrl!)).status()).toBe(404);
  expect((await viewer.page.goto(`/p/${slug}`))?.status()).toBe(404);
  // The owner still sees their own private project.
  expect((await owner.page.goto(`/p/${slug}`))?.status()).toBe(200);
  await Promise.all([owner.ctx.close(), anon.close(), viewer.ctx.close()]);
});

test("feedback and moderation: a hostile review is inert text, the owner can hide and block, and a report leads to a hold the owner cannot override", async ({ browser }) => {
  const owner = await sharedProject(browser);
  let dialogs = 0;

  // A reviewer must choose a display name first.
  const rev = await newLearner(browser, "Reviewer Legal");
  rev.page.on("dialog", async (d) => { dialogs++; await d.dismiss(); });
  await rev.page.goto(`/p/${owner.slug}`);
  await expect(rev.page.getByText("Choose a display name in your profile to leave feedback.")).toBeVisible();
  await setDisplayName(rev.page, "Rev B");
  await rev.page.goto(`/p/${owner.slug}`);

  // Markup in feedback is shown as text and never runs.
  await rev.page.getByLabel(/^What works/).fill(`<img src=x onerror=alert(1)> ${STRENGTHS}`);
  await rev.page.getByLabel(/^What could be improved/).fill(IMPROVE);
  await rev.page.getByRole("button", { name: "Send feedback" }).click();
  await expect(rev.page.getByRole("status")).toContainText("Your feedback has been added.");
  await expect(rev.page.getByText("<img src=x onerror=alert(1)>", { exact: false })).toBeVisible();
  await expect(rev.page.locator('img[src="x"]')).toHaveCount(0);
  expect(dialogs).toBe(0);
  await expect(rev.page.getByRole("button", { name: "Withdraw my feedback" })).toBeVisible();
  await expect(rev.page.getByRole("form", { name: "Leave feedback" })).toHaveCount(0); // one review per person

  // The owner hides it; the public no longer sees it, the owner still does.
  await owner.page.goto(`/p/${owner.slug}`);
  await owner.page.getByRole("button", { name: "Hide" }).click();
  await expect(owner.page.getByText("hidden from others")).toBeVisible();
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  await ap.goto(`/p/${owner.slug}`);
  await expect(ap.getByText("Rev B")).toHaveCount(0);
  await expect(ap.getByText("No feedback yet.")).toBeVisible();

  // Blocking stops the reviewer for good.
  await owner.page.getByRole("button", { name: "Block this reviewer" }).click();
  await expect(owner.page.getByRole("status")).toContainText("Blocked");
  await rev.page.goto(`/p/${owner.slug}`);
  await expect(rev.page.getByText("You cannot leave feedback on this project.")).toBeVisible();

  // A third learner reports the project; a moderator holds it.
  const reporter = await newLearner(browser, "Reporter Legal");
  await setDisplayName(reporter.page, "Reporter C");
  await reporter.page.goto(`/p/${owner.slug}`);
  await reporter.page.getByText("Report this project").click();
  await reporter.page.getByLabel(/What is wrong/).fill(REASON);
  await reporter.page.getByRole("button", { name: "Send report" }).click();
  await expect(reporter.page.getByRole("status")).toContainText("A moderator will take a look.");

  const modCtx = await newLearner(browser, "Moderator Legal");
  await db.user.update({ where: { email: modCtx.email }, data: { role: "REVIEWER" } });
  await modCtx.page.goto("/review/moderation");
  await expect(modCtx.page.getByRole("heading", { name: "Reports to review" })).toBeVisible();
  await modCtx.page.getByRole("link", { name: /^Project .*Create a high-contrast event poster.*Pixel Pat/ }).last().click(); // oldest first: ours is last (earlier runs may leave open reports)
  await expect(modCtx.page.locator("figure img").first()).toBeVisible();
  await axe(modCtx.page, "moderation detail");
  await modCtx.page.getByLabel(/^Decision note/).fill("Confirmed against the guidelines.");
  await modCtx.page.getByRole("button", { name: "Put the project on hold" }).click();
  await expect(modCtx.page).toHaveURL(/\/review\/moderation$/);

  // The project disappears for everyone but its owner, and the owner cannot re-share it.
  expect((await ap.goto(`/p/${owner.slug}`))?.status()).toBe(404);
  await owner.page.goto(`/portfolio/${owner.id}`);
  await expect(owner.page.locator('p[role="alert"]').first()).toContainText("on hold");
  await owner.page.getByRole("radio", { name: /^Public/ }).check();
  await owner.page.getByRole("button", { name: "Save" }).click();
  await expect(owner.page.getByText("This project is on hold and cannot be shared.")).toBeVisible();
  expect((await ap.goto(`/p/${owner.slug}`))?.status()).toBe(404);

  await Promise.all([owner.ctx.close(), rev.ctx.close(), reporter.ctx.close(), modCtx.ctx.close(), anon.close()]);
});

test("a learner cannot add someone else's or unassessed work, and cannot open another learner's private edit page", async ({ browser }) => {
  const a = await newLearner(browser, "A Learner");
  await withAssessedWork(a.page, a.email);
  const { id } = await addProject(a.page);
  const b = await newLearner(browser, "B Learner");
  expect((await b.page.goto(`/portfolio/${id}`))?.status()).toBe(404);
  await b.page.goto("/portfolio");
  await expect(b.page.getByText("You have no assessed work to add yet.")).toBeVisible();
  await Promise.all([a.ctx.close(), b.ctx.close()]);
});
