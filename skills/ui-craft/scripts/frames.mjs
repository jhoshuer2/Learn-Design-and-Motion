#!/usr/bin/env node
/** Captures timed screenshots of a page loading (and optionally scrolling) and tiles them into one PNG so animation can be reviewed by eye.
 *  Needs ffmpeg on PATH (system ffmpeg; Playwright's own video recorder is not required).
 *  node frames.mjs <url> [--out strip.png] [--frames 8] [--interval 180] [--scroll 900] */
import { chromium } from "playwright"; import { execFileSync } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const a = process.argv.slice(2); const flag = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d; };
const url = a.find((x) => /^https?:/.test(x)); if (!url) { console.error("usage: node frames.mjs <url> [--out strip.png] [--frames n] [--interval ms] [--scroll px]"); process.exit(1); }
const out = flag("out", "frames.png"), n = Number(flag("frames", 8)), gap = Number(flag("interval", 180)), scroll = Number(flag("scroll", 0));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frames-"));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.goto(url, { waitUntil: "commit" });
for (let i = 0; i < n; i++) {
  if (scroll && i >= n / 2) await page.mouse.wheel(0, scroll / (n / 2));
  await page.screenshot({ path: path.join(dir, `f${String(i).padStart(2, "0")}.png`) });
  await page.waitForTimeout(gap);
}
await browser.close();
execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", "1", "-i", path.join(dir, "f%02d.png"), "-vf", `scale=480:-1,tile=4x${Math.ceil(n / 4)}`, "-frames:v", "1", out]);
console.log(`frame strip: ${out}`);
