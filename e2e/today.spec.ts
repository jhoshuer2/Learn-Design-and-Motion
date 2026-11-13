import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { db } from "../src/lib/db";

async function signUp(page: Page) {
  const email = `td-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Daily Learner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return email;
}

test("the daily session: a warm-up on a taught skill, practice only, once a day, with a calm finish", async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: "UTC", viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const email = await signUp(page);
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const level = await db.level.findFirstOrThrow({ where: { tier: "BEGINNER", path: { slug: "motion-design" } } });

  // Nothing taught yet: an invitation, not an error.
  await db.enrollment.create({ data: { userId: user.id, pathId: level.pathId } });
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: /Today.s session/ })).toBeVisible();
  await expect(page.getByText("Finish your first lesson and a short warm-up will appear here.")).toBeVisible();

  // One lesson done with a weak result: the warm-up targets that skill.
  const lesson = await db.lesson.findFirstOrThrow({ where: { module: { levelId: level.id }, slug: "motion-feels-alive" } });
  await db.progress.create({ data: { userId: user.id, nodeType: "LESSON", nodeId: lesson.id, state: "COMPLETED", completedAt: new Date() } });
  const c = await db.competency.findUniqueOrThrow({ where: { slug: "motion-timing-easing" } });
  await db.skillEvidence.create({ data: { userId: user.id, competencyId: c.id, source: "QUIZ", sourceId: "e2e", score: 60, tier: "BEGINNER" } });
  await db.blockView.create({ data: { userId: user.id, lessonId: lesson.id, blockIndex: 0 } });

  await page.goto("/today");
  await expect(page.getByRole("heading", { name: /Warm-up: .*timing and easing/i })).toBeVisible();
  await expect(page.getByText("Practice only: it does not change your results.")).toBeVisible();
  await expect(page.getByRole("group")).toHaveCount(3);
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  await page.screenshot({ path: "test-results/screens/m12-today-open.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: "test-results/screens/m12-today-390.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  // Answer the first option of each question (some right, some not): scored on the server.
  for (const g of await page.getByRole("group").all()) await g.locator("input[type=radio], input[type=checkbox]").first().check();
  await page.getByRole("button", { name: "Check my answers" }).click();
  await expect(page.getByText(/of 3 right\./)).toBeVisible();
  await expect(page.getByText("Practice only: it does not change your results.")).toBeVisible();
  await page.screenshot({ path: "test-results/screens/m12-today-done.png", fullPage: true });

  // The weak skill stays weak: practice is not evidence.
  expect(await db.skillEvidence.count({ where: { userId: user.id } })).toBe(1);
  // Once a day: the form is gone and today is marked.
  await expect(page.getByRole("button", { name: "Check my answers" })).toHaveCount(0);
  await expect(page.getByText(/You practised on/)).toBeVisible();
  await expect(page.getByText("That is today done.")).toBeVisible(); // warm-up done and a lesson step viewed today

  await page.goto("/dashboard");
  await page.getByRole("link", { name: /Today.s session/ }).click();
  await expect(page).toHaveURL(/\/today$/);
  await ctx.close();
});

test("the daily session works in dark mode and on a phone", async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: "UTC", colorScheme: "dark", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await signUp(page);
  await page.goto("/today");
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  await page.screenshot({ path: "test-results/screens/m12-today-dark-390.png", fullPage: true });
  await ctx.close();
});
