import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { clearPause } from "../src/lib/jobs/flags";

const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#cc4422" } }).png().toBuffer();
const RATIONALE = "I made the event name the largest and darkest element so it reads first, used a mid tone for date and place, and one saturated button colour for the call to action so it separates from everything else.";
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });

async function signUp(page: Page, name: string) {
  const email = `o-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await db.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } }); // verification has its own spec
  return email;
}

async function learnerAtAssignment(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = await signUp(page, "Queue Learner");
  await page.getByRole("listitem").filter({ hasText: "Graphic Design" }).getByRole("button", { name: "Enroll" }).click();
  await expect(page.getByText("In progress")).toBeVisible();
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const lessons = await db.lesson.findMany({ where: { module: { slug: "understanding-contrast" } }, select: { id: true } });
  await db.progress.createMany({ data: lessons.map((l) => ({ userId: user.id, nodeType: "LESSON", nodeId: l.id, state: "COMPLETED" as const, completedAt: new Date() })), skipDuplicates: true });
  await page.goto("/learn");
  await page.getByRole("link", { name: /Assessment: Create a high-contrast event poster/ }).click();
  return { ctx, page, email };
}

async function submit(page: Page, marker: string) {
  await page.getByLabel(/Final poster/).setInputFiles({ name: "poster.png", mimeType: "image/png", buffer: await png(800, 1200) });
  await page.getByLabel(/Small-scale preview/).setInputFiles({ name: "small.png", mimeType: "image/png", buffer: await png(267, 400) });
  await page.getByLabel(/^Rationale/).fill(`${RATIONALE} ${marker}`);
  await page.getByRole("button", { name: "Submit for assessment" }).click();
  await expect(page).toHaveURL(/\/learn\/submission\//);
}

async function staffer(browser: Browser, role: "REVIEWER" | "ADMIN") {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = await signUp(page, `${role} Person`);
  await db.user.update({ where: { email }, data: { role } });
  return { ctx, page, email };
}

const axe = async (page: Page) => {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
};

test.beforeEach(async () => { await clearPause(null); });
test.afterAll(async () => { await clearPause(null); await db.$disconnect(); });

test("a slow assessment returns at once, shows progress, and the page updates itself to the result", async ({ browser }) => {
  const { ctx, page } = await learnerAtAssignment(browser);
  const started = Date.now();
  await submit(page, "[fake:slow=5000] [fake:score=90]");
  expect(Date.now() - started).toBeLessThan(4500); // the request did not wait for the assessor

  const status = page.getByRole("status").filter({ hasText: /waiting to be assessed|being assessed/ });
  await expect(status).toBeVisible();
  await axe(page);
  await shot(page, "m6-queued-desktop");
  await page.setViewportSize({ width: 390, height: 800 });
  await shot(page, "m6-queued-390");
  await page.setViewportSize({ width: 1280, height: 800 });

  // No reload by the test: the page refreshes itself when the status changes.
  await expect(page.getByRole("heading", { name: /Passed: 90%/ })).toBeVisible({ timeout: 25_000 });
  await ctx.close();
});

test("a billing failure pauses assessment honestly, loses nothing, and an administrator resumes it", async ({ browser }) => {
  const { ctx, page, email } = await learnerAtAssignment(browser);
  await submit(page, "[fake:billing=1] [fake:score=90]");

  await expect(page.getByRole("heading", { name: "Assessment is paused" })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(/temporarily paused/)).toBeVisible();
  await expect(page.getByRole("status")).not.toHaveText(/credit|anthropic|billing/i); // no provider detail for learners
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const sub = await db.submission.findFirstOrThrow({ where: { userId: user.id } });
  expect(sub.status).toBe("SUBMITTED");
  expect(await db.evaluation.count({ where: { submissionId: sub.id } })).toBe(0);
  expect((await db.evaluationJob.findFirstOrThrow({ where: { submissionId: sub.id } })).attempts).toBe(0);
  await shot(page, "m6-learner-paused");

  const admin = await staffer(browser, "ADMIN");
  await admin.page.goto("/admin/assessments");
  await expect(admin.page.getByRole("heading", { name: /Assessment is paused: billing/ })).toBeVisible();
  await expect(admin.page.getByText(/no credit/)).toBeVisible();
  await axe(admin.page);
  await shot(admin.page, "m6-admin-paused");
  await admin.page.setViewportSize({ width: 390, height: 800 });
  await shot(admin.page, "m6-admin-paused-390");
  await admin.page.getByRole("button", { name: "Resume assessment" }).click();
  await expect(admin.page.getByText("Assessment is running.")).toBeVisible();

  await expect(page.getByRole("heading", { name: /Passed: 90%/ })).toBeVisible({ timeout: 25_000 });
  await Promise.all([ctx.close(), admin.ctx.close()]);
});

test("refused work reaches the attention list and a reviewer assesses it; reviewers cannot pause", async ({ browser }) => {
  const { ctx, page, email } = await learnerAtAssignment(browser);
  await submit(page, "[fake:error=refusal]");
  await expect(page.getByRole("heading", { name: "Assessment did not complete" })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(/needs a person to look at it/)).toBeVisible();

  const rev = await staffer(browser, "REVIEWER");
  await rev.page.goto("/admin/assessments");
  await expect(rev.page.getByRole("heading", { name: "Needs a person" })).toBeVisible();
  await expect(rev.page.getByRole("button", { name: /Pause assessment|Resume assessment|Try automatic again/ })).toHaveCount(0);
  await expect(rev.page.getByText(email)).toHaveCount(0);
  await axe(rev.page);

  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const sub = await db.submission.findFirstOrThrow({ where: { userId: user.id } });
  await rev.page.goto(`/review/assess/${sub.id}`);
  await expect(rev.page.getByRole("heading", { name: "Score each criterion" })).toBeVisible();
  await axe(rev.page);
  await shot(rev.page, "m6-human-assess");
  const rows = rev.page.locator('input[name^="score_"]');
  for (let i = 0; i < (await rows.count()); i++) {
    await rows.nth(i).fill("88");
  }
  const comments = rev.page.locator('input[name^="comment_"]');
  for (let i = 0; i < (await comments.count()); i++) await comments.nth(i).fill("Reads clearly at a glance.");
  await rev.page.getByLabel("Note to the learner").fill("Strong hierarchy and clear contrast overall.");
  await rev.page.getByRole("button", { name: "Record my assessment" }).click();
  await expect(rev.page).toHaveURL(/\/admin\/assessments/);

  await page.reload();
  await expect(page.getByRole("heading", { name: /Passed: 88%/ })).toBeVisible();
  await expect(page.getByText(/Reviewed by a person/)).toBeVisible();
  await expect(page.getByText("Strong hierarchy and clear contrast overall.")).toBeVisible();
  await expect(page.getByText(/AI assessor/)).toHaveCount(0);
  await shot(page, "m6-human-result");

  // A learner cannot open the operator screen or the assess page.
  await page.goto("/admin/assessments");
  await expect(page).toHaveURL(/\/dashboard/);
  await Promise.all([ctx.close(), rev.ctx.close()]);
});
