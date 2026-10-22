import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";
import { db } from "../src/lib/db";

const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#cc4422" } }).png().toBuffer();
const RATIONALE = "I made the event name the largest and darkest element so it reads first, used a mid tone for date and place, and one saturated button colour for the call to action so it separates from everything else.";

async function signUp(page: Page, name = "Poster Learner") {
  const email = `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
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

/** Lessons are covered by learning.spec.ts; here we start from "all lessons complete". */
async function completeLessons(email: string) {
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const lessons = await db.lesson.findMany({ where: { module: { slug: "understanding-contrast" } }, select: { id: true } });
  await db.progress.createMany({
    data: lessons.map((l) => ({ userId: user.id, nodeType: "LESSON", nodeId: l.id, state: "COMPLETED" as const, completedAt: new Date() })),
    skipDuplicates: true,
  });
}

async function openAssignment(page: Page) {
  await page.goto("/learn");
  await page.getByRole("link", { name: /Assessment: Create a high-contrast event poster/ }).click();
  await expect(page.getByRole("heading", { name: "Create a high-contrast event poster" })).toBeVisible();
}

async function submit(page: Page, opts: { marker: string; preview?: boolean; changes?: string }) {
  await page.getByLabel(/Final poster/).setInputFiles({ name: "poster.png", mimeType: "image/png", buffer: await png(800, 1200) });
  if (opts.preview !== false) {
    await page.getByLabel(/Small-scale preview/).setInputFiles({ name: "small.png", mimeType: "image/png", buffer: await png(267, 400) });
  }
  await page.getByLabel(/^Rationale/).fill(`${RATIONALE} ${opts.marker}`);
  if (opts.changes) await page.getByLabel(/What did you change/).fill(opts.changes);
  await page.getByRole("button", { name: "Submit for assessment" }).click();
  await expect(page).toHaveURL(/\/learn\/submission\//);
}

async function learner(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = await signUp(page);
  await completeLessons(email);
  return { ctx, page, email };
}

test("lock, brief, fail with feedback, revise, pass, and module completes", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = await signUp(page);

  // Assessment is locked until the lessons are complete.
  await page.goto("/learn");
  await expect(page.getByText("Assessment: Create a high-contrast event poster")).toBeVisible();
  await expect(page.getByRole("link", { name: /Assessment:/ })).toHaveCount(0);
  const asg = await db.assignment.findUniqueOrThrow({ where: { slug: "high-contrast-event-poster" } });
  await page.goto(`/learn/assignment/${asg.id}`);
  await expect(page.getByText("Complete every lesson in this module first.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for assessment" })).toHaveCount(0);

  await completeLessons(email);
  await openAssignment(page);

  // The published rubric is shown before submitting, including required minimums.
  await expect(page.getByRole("cell", { name: /Contrast \(value and colour\)/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: "60%" }).first()).toBeVisible();
  const briefA11y = await new AxeBuilder({ page }).analyze();
  expect(briefA11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);

  // Attempt 1: fails, with structured feedback and a way back into the lessons.
  await submit(page, { marker: "[fake:score=60]" });
  await expect(page.getByRole("heading", { name: /Not yet: 60%/ })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("did not look at your work");
  await expect(page.getByText("below the 80% pass mark")).toBeVisible();
  await expect(page.getByText("How to check it worked").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Practise these next" })).toBeVisible();
  const resultA11y = await new AxeBuilder({ page }).analyze();
  expect(resultA11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);

  // Attempt 2 needs a note on what changed.
  await page.getByRole("link", { name: "Revise and resubmit" }).click();
  await expect(page.getByText(/Attempt 2 of 3/)).toBeVisible();
  await page.getByLabel(/Final poster/).setInputFiles({ name: "p.png", mimeType: "image/png", buffer: await png(800, 1200) });
  await page.getByLabel(/Small-scale preview/).setInputFiles({ name: "s.png", mimeType: "image/png", buffer: await png(267, 400) });
  await page.getByLabel(/^Rationale/).fill(`${RATIONALE} [fake:score=92]`);
  await expect(page.getByLabel(/What did you change/)).toBeVisible();
  await page.getByLabel(/What did you change/).fill("Made the date darker and grouped the venue with it.");
  await page.getByRole("button", { name: "Submit for assessment" }).click();
  await expect(page.getByRole("heading", { name: /Passed: 92%/ })).toBeVisible();

  // The module is complete only now, and a second submission is closed.
  await page.goto("/learn");
  await expect(page.getByText("Module complete: lessons and assessment passed.")).toBeVisible();
  await page.goto(`/learn/assignment/${asg.id}`);
  await expect(page.getByText("You have already passed this assessment.")).toBeVisible();
  await ctx.close();
});

test("a high overall score still fails when a required criterion is below its minimum", async ({ browser }) => {
  const { ctx, page } = await learner(browser);
  await openAssignment(page);
  await submit(page, { marker: "[fake:mandatory]" });
  await expect(page.getByRole("heading", { name: /Not yet: \d+%/ })).toBeVisible();
  await expect(page.getByText(/is a required criterion\. It scored 40%/)).toBeVisible();
  await expect(page.getByText(/Below the minimum of 60%/)).toBeVisible();
  await ctx.close();
});

test("a missing preview asks for evidence, uses no attempt, and can be completed", async ({ browser }) => {
  const { ctx, page } = await learner(browser);
  await openAssignment(page);
  await submit(page, { marker: "", preview: false });
  await expect(page.getByRole("heading", { name: "We need more from you" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Small-scale preview:" })).toBeVisible();

  await page.getByRole("link", { name: "Add the missing items" }).click();
  await expect(page.getByText(/does not use another attempt/)).toBeVisible();
  await expect(page.getByText(/Attempt 1 of 3/)).toBeVisible();
  await page.getByLabel(/Final poster/).setInputFiles({ name: "p.png", mimeType: "image/png", buffer: await png(800, 1200) });
  await page.getByLabel(/Small-scale preview/).setInputFiles({ name: "s.png", mimeType: "image/png", buffer: await png(267, 400) });
  await page.getByLabel(/^Rationale/).fill(`${RATIONALE} [fake:score=90]`);
  await page.getByRole("button", { name: "Submit for assessment" }).click();
  await expect(page.getByRole("heading", { name: /Passed: 90%/ })).toBeVisible();
  await ctx.close();
});

test("uploads that are not images are rejected with a clear message", async ({ browser }) => {
  const { ctx, page } = await learner(browser);
  await openAssignment(page);
  await page.getByLabel(/Final poster/).setInputFiles({ name: "poster.png", mimeType: "image/png", buffer: Buffer.from("MZ this is not an image") });
  await page.getByLabel(/^Rationale/).fill(RATIONALE);
  await page.getByRole("button", { name: "Submit for assessment" }).click();
  await expect(page.getByText(/could not be read as an image/)).toBeVisible();
  await expect(page).toHaveURL(/\/learn\/assignment\//);
  await ctx.close();
});

test("submissions and their files are private to the owner", async ({ browser }) => {
  const { ctx, page } = await learner(browser);
  await openAssignment(page);
  await submit(page, { marker: "[fake:score=60]" });
  const url = page.url();
  const id = url.split("/").pop()!;

  // Owner can load the file; the same URL is 404 for another learner and 401 for no session.
  expect((await page.request.get(`/api/submissions/${id}/files/0`)).status()).toBe(200);
  const other = await browser.newContext();
  const op = await other.newPage();
  await signUp(op, "Someone Else");
  expect((await op.request.get(`/api/submissions/${id}/files/0`)).status()).toBe(404);
  expect((await op.goto(url))?.status()).toBe(404);
  const anon = await browser.newContext();
  expect((await anon.request.get(`/api/submissions/${id}/files/0`)).status()).toBe(401);
  await Promise.all([ctx.close(), other.close(), anon.close()]);
});

test("appeal: learner asks, reviewer upholds, learner sees the decision; non-reviewers cannot reach /review", async ({ browser }) => {
  const { ctx, page, email } = await learner(browser);
  await openAssignment(page);
  await submit(page, { marker: "[fake:score=60]" });
  const submissionUrl = page.url();

  await page.getByLabel("Your reason").fill("I believe the hierarchy and contrast are stronger than this score reflects.");
  await page.getByRole("button", { name: "Ask for a human review" }).click();
  await expect(page.getByText("Your appeal is with a human reviewer.")).toBeVisible();

  // A learner cannot open the review queue.
  await page.goto("/review");
  await expect(page).toHaveURL(/\/dashboard/);

  // A reviewer (role granted out-of-band, as in production) resolves it.
  const rctx = await browser.newContext();
  const rpage = await rctx.newPage();
  const remail = await signUp(rpage, "Reviewer Person");
  await db.user.update({ where: { email: remail }, data: { role: "REVIEWER" } });
  await rpage.goto("/review");
  await expect(rpage.getByRole("heading", { name: "Appeals to review" })).toBeVisible();
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const appeal = await db.appeal.findFirstOrThrow({ where: { userId: user.id } });
  await rpage.goto(`/review/${appeal.id}`);
  await expect(rpage.getByText("I believe the hierarchy")).toBeVisible();
  await expect(rpage.getByText(user.email)).toHaveCount(0); // learner identity is not shown
  await rpage.getByLabel(/Decision note/).fill("The original scores match the work; contrast is below the bar.");
  await rpage.getByRole("button", { name: "Uphold the original result" }).click();
  await expect(rpage).toHaveURL(/\/review$/);

  await page.goto(submissionUrl);
  await expect(page.getByRole("heading", { name: /original result confirmed/ })).toBeVisible();
  await expect(page.getByText("The original scores match the work")).toBeVisible();
  await Promise.all([ctx.close(), rctx.close()]);
});
