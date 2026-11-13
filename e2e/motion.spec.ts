import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { db } from "../src/lib/db";

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });

async function signUp(page: Page) {
  const email = `mo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Motion Learner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return email;
}

test("the outcome page is public, then signing up and starting leads to a lesson that can be watched or read", async ({ page }) => {
  // Public: no account needed to see what you would make.
  await page.goto("/learn/outcome/kinetic-type-loop");
  await expect(page.getByRole("heading", { name: "A 10-second kinetic type loop" })).toBeVisible();
  await expect(page.getByText("Make a smooth, looping animation of moving words")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(1);
  await expect(page.locator("video track[kind=captions]")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Create a free account to start" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  await shot(page, "m12-outcome-desktop");
  await page.setViewportSize({ width: 390, height: 900 });
  await shot(page, "m12-outcome-390");
  await page.setViewportSize({ width: 1280, height: 800 });

  const email = await signUp(page);
  await page.goto("/learn/outcome/kinetic-type-loop");
  await page.getByRole("button", { name: "Start this path" }).click();
  await expect(page).toHaveURL(/\/learn$/);
  await page.getByRole("link", { name: "Make motion feel alive" }).first().click();

  // Step 1 is the objective; step 2 is the concept with the video.
  await expect(page.getByText(/Step 1 of 10/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/Step 2 of 10/)).toBeVisible();

  // Watch is the default: the video leads and the text is tucked away.
  await expect(page.getByRole("button", { name: "Watch" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("video")).toBeVisible();
  await expect(page.getByText("Read the written version")).toBeVisible();
  await expect(page.getByText("Transcript")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  await shot(page, "m12-lesson-watch");

  // Switch to Read: the text leads and the video is offered instead. The choice is remembered on the next step.
  await page.getByRole("button", { name: "Read" }).click();
  await expect(page.getByRole("button", { name: "Read" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Watch instead")).toBeVisible();
  await expect(page.getByText(/Motion feels alive when speed/)).toBeVisible();
  await shot(page, "m12-lesson-read");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/Step 3 of 10/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Read" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("figure")).toHaveCount(1); // the interactive demo
  await shot(page, "m12-lesson-demo");

  const user = await db.user.findUniqueOrThrow({ where: { email } });
  expect(await db.blockView.count({ where: { userId: user.id } })).toBeGreaterThanOrEqual(2);
});

test("an unknown outcome is a plain not-found, not a crash", async ({ page }) => {
  const res = await page.goto("/learn/outcome/does-not-exist");
  expect(res?.status()).toBe(404);
});

test("the stagger demo responds to its slider, also with reduced motion", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const email = await signUp(page);
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const level = await db.level.findFirstOrThrow({ where: { tier: "BEGINNER", path: { slug: "motion-design" } } });
  await db.enrollment.create({ data: { userId: user.id, pathId: level.pathId } });
  const before = await db.lesson.findMany({ where: { module: { levelId: level.id }, slug: { in: ["motion-feels-alive", "keyframes-move-scale-fade"] } } });
  await db.progress.createMany({ data: before.map((l) => ({ userId: user.id, nodeType: "LESSON" as const, nodeId: l.id, state: "COMPLETED" as const, completedAt: new Date() })) });
  const lesson = await db.lesson.findFirstOrThrow({ where: { module: { levelId: level.id }, slug: "animate-words" } });
  await page.goto(`/learn/lesson/${lesson.id}`);
  for (const n of [2, 3]) { // wait for each step before clicking again: the server action redirects
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(new RegExp(`Step ${n} of 10`))).toBeVisible();
  }
  const slider = page.getByRole("slider", { name: /Delay between letters/ });
  await expect(slider).toBeVisible();
  await slider.fill("0.4");
  await expect(page.getByText(/getting slow/)).toBeVisible();
  await slider.fill("0");
  await expect(page.getByText(/all at once: flat/)).toBeVisible();
  expect((await new AxeBuilder({ page }).exclude("figure").analyze()).violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  await ctx.close();
});

test("the capstone is locked until the module is done, then asks for three formats", async ({ page }) => {
  const email = await signUp(page);
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const level = await db.level.findFirstOrThrow({ where: { tier: "BEGINNER", path: { slug: "motion-design" } } });
  await db.enrollment.create({ data: { userId: user.id, pathId: level.pathId } });
  const cap = await db.assignment.findUniqueOrThrow({ where: { slug: "kinetic-type-capstone" } });

  await page.goto(`/learn/assignment/${cap.id}`);
  await expect(page.getByText("Finish every module in this level first, including its assessment.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for assessment" })).toHaveCount(0);

  const lessons = await db.lesson.findMany({ where: { module: { levelId: level.id } } });
  await db.progress.createMany({ data: lessons.map((l) => ({ userId: user.id, nodeType: "LESSON", nodeId: l.id, state: "COMPLETED" as const, completedAt: new Date() })) });
  const asg = await db.assignment.findUniqueOrThrow({ where: { slug: "kinetic-type-loop" } });
  await db.progress.create({ data: { userId: user.id, nodeType: "ASSIGNMENT", nodeId: asg.id, state: "COMPLETED", completedAt: new Date() } });

  await page.goto(`/learn/assignment/${cap.id}`);
  await expect(page.getByRole("heading", { name: "One animation, three formats" })).toBeVisible();
  for (const label of [/Square post/, /Vertical story/, /Wide banner/]) await expect(page.getByLabel(label)).toBeVisible();
  await expect(page.getByText("Only images are inspected")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  await page.screenshot({ path: "test-results/screens/m12-capstone-brief.png", fullPage: true });

  await page.goto("/learn");
  await expect(page.getByText(/does not show mastery of motion design/)).toBeVisible();
});
