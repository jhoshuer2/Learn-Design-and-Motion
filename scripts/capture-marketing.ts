/**
 * Captures real screens of the running app for the home page's framed window (light and dark), as webp.
 *   npx next start -p 3100   (with CONTENT_PREVIEW=true), then:  npx tsx scripts/capture-marketing.ts
 * It signs up a throwaway demo learner, gives it plausible progress, and shoots My learning, Today and a lesson.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import { db } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = path.join(process.cwd(), "public", "marketing");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const email = `demo-${Date.now()}@example.com`;
  const ctx0 = await browser.newContext({ viewport: { width: 900, height: 640 }, timezoneId: "UTC" });
  const p0 = await ctx0.newPage();
  await p0.goto(`${BASE}/signup`);
  await p0.getByLabel("Name").fill("Sam");
  await p0.getByLabel("Email").fill(email);
  await p0.getByLabel(/^Password/).fill("correct-horse-battery");
  await p0.getByRole("button", { name: "Sign up" }).click();
  await p0.waitForURL(/dashboard/);
  const state = await ctx0.storageState();
  await ctx0.close();

  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const level = await db.level.findFirstOrThrow({ where: { tier: "BEGINNER", path: { slug: "motion-design" } } });
  await db.enrollment.create({ data: { userId: user.id, pathId: level.pathId } });
  const lessons = await db.lesson.findMany({ where: { module: { levelId: level.id } }, orderBy: { position: "asc" } });
  const done = lessons.slice(0, 2);
  await db.progress.createMany({ data: done.map((l) => ({ userId: user.id, nodeType: "LESSON", nodeId: l.id, state: "COMPLETED" as const, completedAt: new Date() })) });
  for (const l of done) await db.blockView.createMany({ data: Array.from({ length: 10 }, (_, i) => ({ userId: user.id, lessonId: l.id, blockIndex: i })), skipDuplicates: true });
  const c1 = await db.competency.findUniqueOrThrow({ where: { slug: "motion-timing-easing" } });
  await db.skillEvidence.create({ data: { userId: user.id, competencyId: c1.id, source: "QUIZ", sourceId: "demo", score: 100, tier: "BEGINNER" } });
  const third = lessons[2];

  const shots: [string, string, (p: import("playwright").Page) => Promise<void>][] = [
    ["learning", `${BASE}/learn`, async (p) => { await p.waitForTimeout(1200); }],
    ["today", `${BASE}/today`, async (p) => { await p.waitForTimeout(800); }],
    ["lesson", `${BASE}/learn/lesson/${third.id}`, async (p) => { await p.getByRole("button", { name: "Continue" }).click(); await p.waitForTimeout(600); await p.getByRole("button", { name: "Continue" }).click(); await p.waitForTimeout(1000); }],
  ];
  for (const scheme of ["light", "dark"] as const) {
    const ctx = await browser.newContext({ storageState: state, colorScheme: scheme, viewport: { width: 900, height: 640 }, timezoneId: "UTC", reducedMotion: "reduce" });
    for (const [name, url, prep] of shots) {
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "networkidle" });
      await prep(page);
      const png = await page.screenshot({ clip: { x: 0, y: 0, width: 900, height: 640 } });
      await sharp(png).webp({ quality: 84 }).toFile(path.join(OUT, `${name}-${scheme}.webp`));
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  await db.user.delete({ where: { id: user.id } }).catch(() => undefined);
  await db.$disconnect();
  console.log("captured", fs.readdirSync(OUT).join(", "));
}
main().catch((e) => { console.error(e); process.exit(1); });
