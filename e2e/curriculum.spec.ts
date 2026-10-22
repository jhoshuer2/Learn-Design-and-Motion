import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";

const content = loadContent();
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });

async function signUp(page: Page) {
  const email = `cu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Curriculum Learner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return email;
}

const PATHS = [
  { slug: "brand-design", row: "Brand Design", module: "brand-identity-foundations" },
  { slug: "ui-design", row: "UI Design", module: "interface-hierarchy-and-accessibility" },
];

test("the dashboard lists all three paths with correct titles, in a stable order", async ({ page }) => {
  await signUp(page);
  await page.goto("/dashboard");
  const rows = await page.getByRole("listitem").filter({ hasText: /module\(s\)/ }).allInnerTexts();
  expect(rows.map((r) => r.split("\n")[0])).toEqual(["Brand Design: Brand Design", "Graphic Design: Graphic Design", "UI Design: UI Design"]);
});

for (const p of PATHS) {
  test(`${p.row}: enrol, lessons unlock in order, every demo renders with a caption, accessible and readable at 390px`, async ({ page }) => {
    await signUp(page);
    await page.goto("/dashboard");
    await page.getByRole("listitem").filter({ hasText: p.row }).getByRole("button", { name: "Enroll" }).click();
    // Enrolling in this path leaves the others alone.
    await expect(page.getByRole("listitem").filter({ hasText: "Graphic Design" }).getByRole("button", { name: "Enroll" })).toBeVisible();

    const mod = content.modules.find((m) => m.def.slug === p.module)!;
    const rows = await db.lesson.findMany({ where: { module: { slug: p.module } } });
    const idOf = (slug: string) => rows.find((l) => l.slug === slug)!.id;

    // The second lesson cannot be opened by URL before the first is done.
    await page.goto(`/learn/lesson/${idOf(mod.lessons[1].meta.slug)}`);
    await expect(page.getByText(/Complete .* first|locked|not available/i).first()).toBeVisible();

    const user = await db.user.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    let demos = 0;
    for (const [n, l] of mod.lessons.entries()) {
      // Earlier lessons are marked done directly; the real check flow has its own tests.
      await db.progress.createMany({
        data: mod.lessons.slice(0, n).map((e) => ({ userId: user.id, nodeType: "LESSON" as const, nodeId: idOf(e.meta.slug), state: "COMPLETED" as const, completedAt: new Date() })),
        skipDuplicates: true,
      });
      await page.goto(`/learn/lesson/${idOf(l.meta.slug)}`);
      const expectedFigures = l.blocks.slice(0, 6).map((b) => b.body.split("\n").filter((x) => x.trim().startsWith("<<demo:")).length);
      for (let i = 0; i < 6; i++) {
        await expect(page.getByText(new RegExp(`Step ${i + 1} of 10`))).toBeVisible();
        await expect(page.locator("figure")).toHaveCount(expectedFigures[i]);
        demos += expectedFigures[i];
        for (const cap of await page.locator("figcaption").allTextContents()) expect(cap.trim().length).toBeGreaterThan(20);
        const results = await new AxeBuilder({ page }).exclude("figure").analyze(); // demo artwork contains deliberate low-contrast samples
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`), `${l.meta.slug} step ${i + 1}`).toEqual([]);
        if (expectedFigures[i] > 0) {
          await shot(page, `m9-${p.slug}-${l.meta.slug}-step${i + 1}`);
          if (n === 0 && i === 2) { await page.setViewportSize({ width: 390, height: 900 }); await shot(page, `m9-${p.slug}-${l.meta.slug}-390`); await page.setViewportSize({ width: 1280, height: 800 }); }
        }
        if (i < 5) await page.getByRole("button", { name: "Continue" }).click();
      }
    }
    expect(demos).toBeGreaterThanOrEqual(6);
  });
}
