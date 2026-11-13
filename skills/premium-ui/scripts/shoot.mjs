#!/usr/bin/env node
/**
 * Screenshots a URL at desktop, tablet and phone widths, in light and dark.
 *   node shoot.mjs <url> [--out ./shots] [--name home]
 * Needs Playwright (`npm i -D playwright`). Set CHROMIUM_PATH to use an existing Chromium.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const url = args.find((a) => /^https?:/.test(a));
const flag = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
if (!url) { console.error("usage: node shoot.mjs <url> [--out dir] [--name label]"); process.exit(1); }
const out = flag("out", "shots"), name = flag("name", new URL(url).pathname.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const scheme of ["light", "dark"]) {
  for (const [label, width, height] of [["desktop", 1440, 900], ["tablet", 768, 1024], ["phone", 390, 844]]) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width, height } });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200); // let the one entrance animation finish
    const file = path.join(out, `${name}-${label}-${scheme}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(file);
    await ctx.close();
  }
}
await browser.close();
