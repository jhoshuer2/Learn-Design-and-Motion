import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";

const lessons = loadContent().modules.find((m) => m.def.slug === "understanding-contrast")!.lessons;
const spec = (slug: string) => lessons.find((l) => l.meta.slug === slug)!;

async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Lesson Learner");
  await page.getByLabel("Email").fill(`l-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`);
  await page.getByLabel(/^Password/).fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function answerCheck(page: Page, slug: string, right: boolean) {
  for (const q of spec(slug).questions) {
    const group = page.getByRole("group", { name: new RegExp(q.prompt.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
    const correct = new Set(Array.isArray(q.answer) ? q.answer : [q.answer]);
    const picks = right ? [...correct] : [q.options!.find((o) => !correct.has(o))!];
    for (const o of picks) await group.getByLabel(o, { exact: true }).check();
  }
  await page.getByRole("button", { name: "Submit answers" }).click();
}

test("locked lessons cannot be opened or skipped into, and passing a check unlocks the next lesson", async ({ page }) => {
  await signUp(page);
  const second = await db.lesson.findFirstOrThrow({ where: { slug: "contrast-in-type-and-media" } });
  const first = await db.lesson.findFirstOrThrow({ where: { slug: "what-contrast-does" } });

  // Not enrolled yet: even the first lesson is closed by direct URL.
  await page.goto(`/learn/lesson/${first.id}`);
  await expect(page.getByText("Enroll in this learning path")).toBeVisible();

  await page.goto("/dashboard");
  await page.getByRole("listitem").filter({ hasText: "Graphic Design" }).getByRole("button", { name: "Enroll" }).click();
  await expect(page.getByText("In progress")).toBeVisible();

  // Enrolled, but lesson 2 is locked by direct URL.
  await page.goto(`/learn/lesson/${second.id}`);
  await expect(page.getByText("locked until you complete its prerequisites")).toBeVisible();
  await expect(page.getByText("What contrast does to a page")).toBeVisible();

  // Skipping ahead with ?step= is clamped to the first block.
  await page.goto(`/learn/lesson/${first.id}?step=6`);
  await expect(page.getByText(/Step 1 of 10/)).toBeVisible();

  // Walk the lesson to the check.
  for (let i = 1; i <= 6; i++) {
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(new RegExp(`Step ${i + 1} of 10`))).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Check your understanding" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);

  // Wrong answers: no pass, no way past the check.
  await answerCheck(page, "what-contrast-does", false);
  await expect(page.getByRole("status")).toContainText("Not yet");
  await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
  await page.goto(`/learn/lesson/${second.id}`);
  await expect(page.getByText("locked until you complete its prerequisites")).toBeVisible();

  // Right answers: passes, can continue, finishes the lesson.
  await page.goto(`/learn/lesson/${first.id}`);
  await expect(page.getByText(/Step 7 of 10/)).toBeVisible();
  await answerCheck(page, "what-contrast-does", true);
  await expect(page.getByRole("status")).toContainText("Passed");
  for (let i = 8; i <= 10; i++) {
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(new RegExp(`Step ${i} of 10`))).toBeVisible();
  }
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await expect(page.getByRole("status")).toContainText("Lesson complete.");

  // The next lesson is now open and is the recommended next action.
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Contrast in type, brand and moving media" })).toBeVisible();
  await page.goto(`/learn/lesson/${second.id}`);
  await expect(page.getByRole("heading", { name: "Contrast in type, brand and moving media" })).toBeVisible();
});

test("demos render as captioned figures at the right steps, and the lesson UI has no axe violations", async ({ page }) => {
  await signUp(page);
  await page.goto("/dashboard");
  await page.getByRole("listitem").filter({ hasText: "Graphic Design" }).getByRole("button", { name: "Enroll" }).click();
  const first = await db.lesson.findFirstOrThrow({ where: { slug: "what-contrast-does" } });
  await page.goto(`/learn/lesson/${first.id}`);

  // objective, concept, demo, realWorld, goodVsBad, guided
  const expectedFigures = [0, 0, 1, 0, 3, 0];
  for (let i = 0; i < expectedFigures.length; i++) {
    await expect(page.getByText(new RegExp(`Step ${i + 1} of 10`))).toBeVisible();
    await expect(page.locator("figure")).toHaveCount(expectedFigures[i]);
    for (const cap of await page.locator("figcaption").allTextContents()) expect(cap.trim().length).toBeGreaterThan(20);
    // Demo artwork deliberately contains low-contrast samples, so figures are excluded from the scan.
    const results = await new AxeBuilder({ page }).exclude("figure").analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`), `step ${i + 1}`).toEqual([]);
    if (i < expectedFigures.length - 1) await page.getByRole("button", { name: "Continue" }).click();
  }
});
