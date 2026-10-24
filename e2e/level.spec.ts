import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";

const RATIONALE = "I made the event name the largest and darkest element so it reads first, used a mid tone for date and place, and one saturated button colour for the call to action so it separates from everything else.";
const PLAN = "I will darken the date and venue text, measure each pair against the minimum, and rebuild the banner so the order survives at its small size.";
const lessons = loadContent().modules.find((m) => m.def.slug === "understanding-contrast")!.lessons;
const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#aa4422" } }).png().toBuffer();

async function signUp(page: Page) {
  const email = `lv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Capstone Learner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await db.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } }); // verification has its own spec
  await page.getByRole("listitem").filter({ hasText: "Graphic Design" }).getByRole("button", { name: "Enroll" }).click();
  await expect(page.getByText("In progress")).toBeVisible();
  return email;
}

/** Lessons and the module assessment are covered by other specs; start from "ready for the capstone". */
async function readyForCapstone(email: string, accessibilityEvidence: number | null = 90) {
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const ls = await db.lesson.findMany({ where: { module: { level: { path: { slug: "graphic-design" } } } }, select: { id: true } });
  await db.progress.createMany({ data: ls.map((l) => ({ userId: user.id, nodeType: "LESSON", nodeId: l.id, state: "COMPLETED" as const, completedAt: new Date() })), skipDuplicates: true });
  const asgs = await db.assignment.findMany({ where: { kind: "MODULE_ASSESSMENT", module: { level: { path: { slug: "graphic-design" } } } } });
  await db.progress.createMany({ data: asgs.map((a) => ({ userId: user.id, nodeType: "ASSIGNMENT", nodeId: a.id, state: "COMPLETED" as const, completedAt: new Date() })) });
  if (accessibilityEvidence !== null) {
    const c = await db.competency.findUniqueOrThrow({ where: { slug: "accessibility-contrast" } });
    await db.skillEvidence.create({ data: { userId: user.id, competencyId: c.id, source: "QUIZ", sourceId: "e2e", score: accessibilityEvidence, tier: "BEGINNER" } });
  }
  return user.id;
}

async function openCapstone(page: Page) {
  await page.goto("/learn");
  await page.getByRole("link", { name: /Capstone: Contrast campaign capstone/ }).click();
  await expect(page.getByRole("heading", { name: "Contrast campaign capstone" })).toBeVisible();
}

async function submitCapstone(page: Page, marker: string, changes?: string) {
  await page.getByLabel(/^Poster/).setInputFiles({ name: "poster.png", mimeType: "image/png", buffer: await png(800, 1200) });
  await page.getByLabel(/^Social square/).setInputFiles({ name: "square.png", mimeType: "image/png", buffer: await png(600, 600) });
  await page.getByLabel(/^Web banner/).setInputFiles({ name: "banner.png", mimeType: "image/png", buffer: await png(728, 90) });
  await page.getByLabel(/^Rationale/).fill(`${RATIONALE} ${marker}`);
  if (changes) await page.getByLabel(/What did you change/).fill(changes);
  await page.getByRole("button", { name: "Submit for assessment" }).click();
  await expect(page).toHaveURL(/\/learn\/submission\//);
}

/** Open a lesson's check as a returning learner (earlier blocks were viewed) and answer it through the UI. */
async function takeCheck(page: Page, userId: string, slug: string, right: boolean) {
  const lesson = await db.lesson.findFirstOrThrow({ where: { slug, module: { slug: "understanding-contrast" } }, orderBy: { version: "desc" } });
  const blocks = lesson.blocks as { kind: string }[];
  const checkIndex = blocks.findIndex((b) => b.kind === "check");
  await db.blockView.createMany({ data: Array.from({ length: checkIndex }, (_, i) => ({ userId, lessonId: lesson.id, blockIndex: i })), skipDuplicates: true });
  await page.goto(`/learn/lesson/${lesson.id}?step=${checkIndex}`);
  await expect(page.getByRole("heading", { name: "Check your understanding" })).toBeVisible();
  for (const q of lessons.find((l) => l.meta.slug === slug)!.questions) {
    const group = page.getByRole("group", { name: new RegExp(q.prompt.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
    const correct = new Set(Array.isArray(q.answer) ? q.answer : [q.answer]);
    const picks = right ? [...correct] : [q.options!.find((o) => !correct.has(o))!];
    for (const o of picks) await group.getByLabel(o, { exact: true }).check();
  }
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByRole("status").first()).toContainText(right ? "Passed" : "Not yet");
}

const axe = async (page: Page, label: string) => {
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`), label).toEqual([]);
};

async function learner(browser: Browser, evidence: number | null = 90) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = await signUp(page);
  const userId = await readyForCapstone(email, evidence);
  return { ctx, page, userId };
}

test("capstone: fail three times, remediate, pass, and the level records honest evidence", async ({ browser }) => {
  const { ctx, page, userId } = await learner(browser);

  // The capstone is open, the next level is shown as not written, and the level states what it covers.
  await page.goto("/learn");
  await expect(page.getByRole("link", { name: /Capstone: Contrast campaign capstone/ })).toBeVisible();
  await expect(page.getByText(/does not show mastery of the full Beginner curriculum/)).toBeVisible();
  await expect(page.getByText(/Not written yet/).first()).toBeVisible();
  await axe(page, "my learning");

  await openCapstone(page);
  await expect(page.getByText("Level capstone")).toBeVisible();
  await expect(page.getByText(/Web banner \(required\)/).first()).toBeVisible();
  await axe(page, "capstone brief");

  await submitCapstone(page, "[fake:score=60]");
  await expect(page.getByRole("heading", { name: /Not yet: 60%/ })).toBeVisible();
  await page.getByRole("link", { name: "Revise and resubmit" }).click();
  await submitCapstone(page, "[fake:score=62]", "Changed the hierarchy and spacing across all three pieces.");
  await page.getByRole("link", { name: "Revise and resubmit" }).click();
  await submitCapstone(page, "[fake:score=64]", "Reworked the type and colour logic across the pieces.");
  await expect(page.getByText("You have used all your attempts.")).toBeVisible();

  // Out of attempts: the capstone is closed and the route is remediation.
  await page.goto(`/learn/assignment/${(await db.assignment.findUniqueOrThrow({ where: { slug: "contrast-campaign-capstone" } })).id}`);
  await expect(page.getByText("Complete targeted remediation to earn more.")).toBeVisible();
  await page.getByRole("link", { name: "Go to remediation" }).click();
  await expect(page.getByRole("heading", { name: "Remediation" })).toBeVisible();
  await page.getByRole("button", { name: "Start remediation" }).click();
  await expect(page.getByRole("heading", { name: /Pass these knowledge checks again/ })).toBeVisible();
  await axe(page, "remediation");

  // Cannot finish without new passing checks, or without a real plan.
  const remUrl = page.url();
  await page.getByLabel(/What will you change/).fill(PLAN);
  await page.getByRole("button", { name: "Complete remediation" }).click();
  await expect(page.getByText(/Pass the knowledge check again for:/)).toBeVisible();
  await page.getByLabel(/What will you change/).fill("do better");
  await page.getByRole("button", { name: "Complete remediation" }).click();
  await expect(page.getByText(/action plan of at least/)).toBeVisible();

  // Retake the required checks through the UI (a completed lesson can be retaken).
  for (const l of lessons) await takeCheck(page, userId, l.meta.slug, true);
  await page.goto(remUrl);
  await expect(page.getByText("Completed").first()).toBeVisible();
  await page.getByLabel(/What will you change/).fill(PLAN);
  await page.getByRole("button", { name: "Complete remediation" }).click();
  await expect(page).toHaveURL(/\/learn\/assignment\//);
  await expect(page.getByText(/Attempt 4 of 5/)).toBeVisible();

  // A passing capstone unlocks the level.
  await submitCapstone(page, "[fake:score=93]", "Raised the contrast of the date and rebuilt the banner order.");
  await expect(page.getByRole("heading", { name: /Passed: 93%/ })).toBeVisible();

  await page.goto("/learn");
  await expect(page.getByRole("link", { name: "View your completion record" })).toBeVisible();
  await page.getByRole("link", { name: "View your completion record" }).click();
  await expect(page.getByRole("heading", { name: "Level complete" })).toBeVisible();
  await expect(page.getByText("Graphic Design, Beginner: Contrast foundations")).toBeVisible();
  await expect(page.getByRole("note")).toContainText("TEST EVALUATOR");
  await expect(page.getByText("What this record does not show")).toBeVisible();
  await expect(page.getByText(/not a professional qualification/)).toBeVisible();
  await expect(page.getByText(/Intermediate is now open to you/)).toBeVisible();
  await expect(page.getByText(/no lessons or assessments yet/)).toBeVisible();
  await axe(page, "level record");

  // Skills come from evidence only.
  await page.goto("/profile/skills");
  await expect(page.getByRole("heading", { name: "Accessible colour contrast" })).toBeVisible();
  await expect(page.getByText("Demonstrated at Beginner level.").first()).toBeVisible();
  await axe(page, "skills");
  await ctx.close();
});

test("a strong capstone does not unlock the level while a required skill is below 80, until it is demonstrated", async ({ browser }) => {
  const { ctx, page, userId } = await learner(browser, null);
  await openCapstone(page);
  await submitCapstone(page, "[fake:score=96] [fake:set=accessible-contrast:70]");
  await expect(page.getByRole("heading", { name: /Passed: \d+%/ })).toBeVisible(); // the capstone itself passed

  // But the level is held back, and says exactly why.
  await page.goto("/learn");
  await expect(page.getByRole("link", { name: "View your completion record" })).toHaveCount(0);
  await expect(page.getByText(/Accessible colour contrast at 80% or more/)).toBeVisible();
  await expect(page.getByText("(not met)")).toBeVisible();
  await page.getByRole("link", { name: "See what is holding this level back" }).click();
  await expect(page.getByRole("heading", { name: "What is needed to complete this level" })).toBeVisible();
  await expect(page.getByText(/a strong capstone total does not replace it/)).toBeVisible();
  await axe(page, "blocked level");

  // Failing the retaken check keeps it blocked; passing it unlocks without another capstone.
  await takeCheck(page, userId, "contrast-and-accessibility", false);
  const level = await db.level.findFirstOrThrow({ where: { tier: "BEGINNER", path: { slug: "graphic-design" } } });
  await page.goto(`/learn/level/${level.id}`);
  await expect(page.getByRole("heading", { name: "What is needed to complete this level" })).toBeVisible();

  await takeCheck(page, userId, "contrast-and-accessibility", true);
  await page.goto(`/learn/level/${level.id}`);
  await expect(page.getByRole("heading", { name: "Level complete" })).toBeVisible();
  await ctx.close();
});

test("capstone stays closed until the module assessment is passed, even by direct URL", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = await signUp(page);
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const ls = await db.lesson.findMany({ where: { module: { level: { path: { slug: "graphic-design" } } } }, select: { id: true } });
  await db.progress.createMany({ data: ls.map((l) => ({ userId: user.id, nodeType: "LESSON", nodeId: l.id, state: "COMPLETED" as const, completedAt: new Date() })), skipDuplicates: true });
  const cap = await db.assignment.findUniqueOrThrow({ where: { slug: "contrast-campaign-capstone" } });
  await page.goto(`/learn/assignment/${cap.id}`);
  await expect(page.getByText("Finish every module in this level first, including its assessment.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for assessment" })).toHaveCount(0);
  await ctx.close();
});
