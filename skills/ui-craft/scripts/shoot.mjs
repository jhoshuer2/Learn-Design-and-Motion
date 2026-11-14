#!/usr/bin/env node
/** Screenshots at 1440, 768 and 390 in light and dark.  node shoot.mjs <url> [--out dir] [--name label] [--full] */
import { chromium } from "playwright";
import fs from "node:fs"; import path from "node:path";
const a = process.argv.slice(2); const flag = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d; };
const url = a.find((x) => /^https?:/.test(x)); if (!url) { console.error("usage: node shoot.mjs <url> [--out dir] [--name label] [--full]"); process.exit(1); }
const out = flag("out", "shots"), name = flag("name", new URL(url).pathname.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const [label, w, h] of [["desktop", 1440, 900], ["tablet", 768, 1024], ["phone", 390, 844]]) for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: "reduce" });
  const p = await ctx.newPage(); await p.goto(url, { waitUntil: "networkidle" }); await p.waitForTimeout(600);
  const f = path.join(out, `${name}-${label}-${scheme}.png`); await p.screenshot({ path: f, fullPage: a.includes("--full") }); console.log(f); await ctx.close();
}
await browser.close();
