#!/usr/bin/env node
/**
 * Measures the things that make a page read as premium or cheap and prints a short report.
 *   node audit.mjs <url> [--json]
 * Needs Playwright; uses @axe-core/playwright for contrast and accessibility when installed.
 * It reports signals, not taste: always look at the screenshots too.
 */
import { chromium } from "playwright";

const url = process.argv.find((a) => /^https?:/.test(a));
if (!url) { console.error("usage: node audit.mjs <url> [--json]"); process.exit(1); }
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" })).newPage();
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const m = await page.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const all = [...document.querySelectorAll("body *")].filter(vis);
  const families = new Set(), sizes = new Set();
  for (const el of all.filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))) {
    const s = getComputedStyle(el);
    families.add(s.fontFamily.split(",")[0].replace(/["']/g, "").trim());
    sizes.add(Math.round(parseFloat(s.fontSize)));
  }
  const h1 = document.querySelector("h1"), h1s = h1 ? getComputedStyle(h1) : null;
  const lines = [...document.querySelectorAll("p")].filter(vis).map((p) => {
    const s = getComputedStyle(p), w = p.getBoundingClientRect().width, fs = parseFloat(s.fontSize);
    return Math.round(w / (fs * 0.5)); // rough characters per line
  });
  const radii = new Set(), shadows = [], onScale = { yes: 0, total: 0 };
  for (const el of all) {
    const s = getComputedStyle(el);
    if (s.borderTopLeftRadius !== "0px") radii.add(s.borderTopLeftRadius);
    if (s.boxShadow !== "none") shadows.push(s.boxShadow);
    for (const p of ["paddingTop", "paddingLeft", "marginTop", "marginBottom", "rowGap", "columnGap"]) {
      const v = parseFloat(s[p]); if (v > 0) { onScale.total++; if (v % 4 < 0.51 || v % 4 > 3.49) onScale.yes++; }
    }
  }
  const imgs = [...document.images].filter(vis);
  return {
    families: [...families], distinctSizes: [...sizes].sort((a, b) => a - b),
    h1: h1 ? { px: Math.round(parseFloat(h1s.fontSize)), family: h1s.fontFamily.split(",")[0].replace(/["']/g, ""), lineHeight: (parseFloat(h1s.lineHeight) / parseFloat(h1s.fontSize)).toFixed(2), chars: h1.textContent.trim().length } : null,
    maxLineChars: lines.length ? Math.max(...lines) : null,
    radii: [...radii], layeredShadows: shadows.filter((s) => (s.match(/rgba?\(/g) || []).length >= 2).length, shadowCount: shadows.length,
    spacingOnScale: onScale.total ? Math.round((onScale.yes / onScale.total) * 100) : null,
    ground: (() => { const c = getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.map(Number) || [255, 255, 255]; return c.slice(0, 3); })(),
    bleeds: imgs.some((i) => { const r = i.getBoundingClientRect(); return r.width >= 480 && r.top < innerHeight - 80 && r.bottom > innerHeight; }) || [...document.querySelectorAll("svg")].some((v) => { const r = v.getBoundingClientRect(); return r.width >= 900 && r.top < innerHeight - 80 && r.bottom > innerHeight; }),
    images: imgs.length, imagesMissingAlt: imgs.filter((i) => !i.hasAttribute("alt")).length,
    ctas: [...document.querySelectorAll("a,button")].filter(vis).filter((e) => getComputedStyle(e).backgroundColor !== "rgba(0, 0, 0, 0)" && e.getBoundingClientRect().top < 900).length,
  };
});

let axe = null;
try {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const r = await new AxeBuilder({ page }).analyze();
  axe = r.violations.map((v) => `${v.id} (${v.nodes.length})`);
} catch { /* axe not installed */ }
await browser.close();

const [gr, gg, gb] = m.ground, gLum = (gr + gg + gb) / 3;
const checks = [
  ["Warm or deep ground (not cool grey)", gLum < 60 || gr >= gb - 3, `rgb(${m.ground.join(",")})`],
  ["Landing pages only: a large visual crosses the first screen's bottom edge", new URL(url).pathname !== "/" ? null : m.bleeds, m.bleeds ? "yes" : "nothing large reaches the fold"],
  ["Hero headline is large (40px or more)", m.h1 && m.h1.px >= 40, m.h1 ? `${m.h1.px}px ${m.h1.family}, leading ${m.h1.lineHeight}` : "no h1"],
  ["Headline leading is tight (1.15 or less)", m.h1 && Number(m.h1.lineHeight) <= 1.15, m.h1?.lineHeight],
  ["At most two type families", m.families.length <= 2, m.families.join(", ")],
  ["A disciplined type scale (9 sizes or fewer)", m.distinctSizes.length <= 9, `${m.distinctSizes.length} sizes: ${m.distinctSizes.join(", ")}`],
  ["Line length under 80 characters", m.maxLineChars === null || m.maxLineChars <= 80, `${m.maxLineChars} chars (rough)`],
  ["Consistent radii (5 or fewer)", m.radii.length <= 5, `${m.radii.length}: ${m.radii.join(", ")}`],
  ["Layered shadows used", m.layeredShadows > 0, `${m.layeredShadows} of ${m.shadowCount} shadows are layered`],
  ["Spacing mostly on a 4px scale (85%+)", m.spacingOnScale === null || m.spacingOnScale >= 85, `${m.spacingOnScale}%`],
  ["Images have alt attributes", m.imagesMissingAlt === 0, `${m.imagesMissingAlt} of ${m.images} missing`],
  ["Few competing calls to action above the fold (3 or fewer)", m.ctas <= 3, `${m.ctas} filled buttons or links`],
  ["No axe violations (includes contrast)", axe === null ? null : axe.length === 0, axe === null ? "axe not installed (npm i -D @axe-core/playwright)" : axe.join("; ") || "none"],
];
if (process.argv.includes("--json")) { console.log(JSON.stringify({ url, metrics: m, axe, checks: checks.map(([name, ok, note]) => ({ name, ok, note })) }, null, 2)); process.exit(0); }
console.log(`\nPremium audit: ${url}\n`);
let pass = 0, scored = 0;
for (const [name, ok, note] of checks) { if (ok !== null) { scored++; if (ok) pass++; } console.log(`${ok === null ? "-" : ok ? "PASS" : "FAIL"}  ${name}  (${note})`); }
console.log(`\n${pass}/${scored} signals pass. These are measurements only: judge hierarchy, imagery and taste from the screenshots (see references/audit-checklist.md).\n`);
