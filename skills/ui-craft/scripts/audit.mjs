#!/usr/bin/env node
/** Measurable signals for an editorial premium UI. Taste still needs eyes: look at the screenshots and frame strip.  node audit.mjs <url> [--json] */
import { chromium } from "playwright";
const url = process.argv.find((x) => /^https?:/.test(x)); if (!url) { console.error("usage: node audit.mjs <url> [--json]"); process.exit(1); }
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" })).newPage();
await page.goto(url, { waitUntil: "networkidle" }); await page.waitForTimeout(800);
const m = await page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const all = [...document.querySelectorAll("body *")].filter(vis);
  const texts = all.filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  const fam = new Set(), sizes = new Set(); let labels = 0;
  for (const e of texts) { const s = getComputedStyle(e); fam.add(s.fontFamily.split(",")[0].replace(/["']/g, "").trim()); sizes.add(Math.round(parseFloat(s.fontSize))); if (parseFloat(s.fontSize) <= 13 && s.textTransform === "uppercase" && parseFloat(s.letterSpacing) > 0.8) labels++; }
  const h1 = document.querySelector("h1"); const hs = h1 && getComputedStyle(h1);
  const radii = new Set(all.map((e) => getComputedStyle(e).borderTopLeftRadius).filter((r) => r !== "0px").map((r) => (parseFloat(r) >= 999 ? "pill" : r)));
  const imgs = [...document.images].filter(vis);
  const bodyBg = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
  const heroImg = imgs.some((i) => i.getBoundingClientRect().width >= 480 && i.getBoundingClientRect().top < innerHeight);
  const lineMax = Math.max(0, ...[...document.querySelectorAll("p")].filter(vis).filter((p) => parseFloat(getComputedStyle(p).fontSize) >= 15).map((p) => Math.round(p.getBoundingClientRect().width / (parseFloat(getComputedStyle(p).fontSize) * 0.5))));
  const fills = [...document.querySelectorAll("a,button")].filter(vis).filter((e) => e.getBoundingClientRect().top < innerHeight && getComputedStyle(e).backgroundColor !== "rgba(0, 0, 0, 0)").length;
  return { families: [...fam], sizes: [...sizes].sort((x, y) => x - y), h1: h1 ? { px: Math.round(parseFloat(hs.fontSize)), lh: (parseFloat(hs.lineHeight) / parseFloat(hs.fontSize)).toFixed(2), family: hs.fontFamily.split(",")[0].replace(/["']/g, "") } : null, labels, radii: [...radii], imgs: imgs.length, noDims: imgs.filter((i) => !i.getAttribute("width") && !i.style.aspectRatio && !i.className.match(/aspect|h-|absolute/)).length, noAlt: imgs.filter((i) => !i.hasAttribute("alt")).length, bodyBg, heroImg, lineMax, fills };
});
let axe = null; try { const { default: A } = await import("@axe-core/playwright"); axe = (await new A({ page }).analyze()).violations.map((v) => `${v.id} (${v.nodes.length})`); } catch {}
await browser.close();
const warm = m.bodyBg[0] >= m.bodyBg[2] - 4 || (m.bodyBg[0] + m.bodyBg[1] + m.bodyBg[2]) / 3 < 60;
const checks = [
  ["Display headline is large (48px+) and tight (leading 1.08 or less)", m.h1 && m.h1.px >= 48 && Number(m.h1.lh) <= 1.08, m.h1 ? `${m.h1.px}px, leading ${m.h1.lh}, ${m.h1.family}` : "no h1"],
  ["Two type families at most", m.families.length <= 2, m.families.join(", ")],
  ["Type scale is disciplined (10 sizes under 40px; fluid display sizes are not counted)", m.sizes.filter((x) => x < 40).length <= 10, m.sizes.join(", ")],
  ["Tiny tracked uppercase labels are used (2+)", m.labels >= 2, `${m.labels}`],
  ["Radii are few (4 or fewer)", m.radii.length <= 4, m.radii.join(", ")],
  ["Warm or deep ground, not cool grey", warm, `rgb(${m.bodyBg.join(",")})`],
  ["Landing and auth pages only: a large image is in the first screen", ["/", "/signin", "/signup"].includes(new URL(url).pathname) ? m.heroImg : null, String(m.heroImg)],
  ["Images have explicit size or aspect (no layout shift)", m.noDims === 0, `${m.noDims} without`],
  ["Images have alt attributes", m.noAlt === 0, `${m.noAlt} missing`],
  ["Paragraph measure under 80 characters", m.lineMax <= 80, `${m.lineMax}`],
  ["One filled action above the fold (3 or fewer filled)", m.fills <= 3, `${m.fills}`],
  ["No axe violations", axe === null ? null : axe.length === 0, axe === null ? "axe not installed" : axe.join("; ") || "none"],
];
if (process.argv.includes("--json")) { console.log(JSON.stringify({ url, m, checks }, null, 2)); process.exit(0); }
let pass = 0, n = 0; console.log(`\nui-craft audit: ${url}\n`);
for (const [name, ok, note] of checks) { if (ok !== null) { n++; if (ok) pass++; } console.log(`${ok === null ? "-   " : ok ? "PASS" : "FAIL"}  ${name}  (${note})`); }
console.log(`\n${pass}/${n} signals pass. Measurements only: review screenshots and the frame strip.\n`);
