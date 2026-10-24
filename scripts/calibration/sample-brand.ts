import { img, leaf, shrink, svgPng } from "./draw";
import { complete, score, type Expectation, type Sample } from "./types";

const ASSIGNMENT = "mini-brand-sheet";
const W = 1200, H = 800;

const strongSheet = (a: { tiny?: boolean }) => {
  const logoSize = a.tiny ? 22 : 64;
  const wordSize = a.tiny ? 18 : 54;
  const wordFill = a.tiny ? "#d3c4a6" : "#2b1d12";
  const labelSize = a.tiny ? 9 : 20;
  const swatch = (x: number, hex: string, name: string, role: string) => a.tiny
    ? `<rect x="${x}" y="360" width="60" height="60" fill="${hex}"/>`
    : `<rect x="${x}" y="340" width="190" height="120" rx="6" fill="${hex}" stroke="#cfc2a8"/><text x="${x}" y="488" font-family="Arial" font-size="${labelSize}" font-weight="bold" fill="#2b1d12">${name}  ${hex}</text><text x="${x}" y="514" font-family="Arial" font-size="${labelSize - 2}" fill="#4a3b2b">${role}</text>`;
  return `
  <rect width="100%" height="100%" fill="#fbf4e8"/>
  <text x="60" y="${a.tiny ? 52 : 60}" font-family="Arial" font-size="${labelSize}" fill="${a.tiny ? "#cdbfa5" : "#7a6a55"}" letter-spacing="3">LOGO AND LOCKUP</text>
  ${leaf(60, a.tiny ? 70 : 90, logoSize, a.tiny ? "#e2d2b2" : "#c8561e")}
  <text x="${60 + logoSize + 18}" y="${(a.tiny ? 70 : 90) + logoSize * 0.78}" font-family="Georgia, serif" font-size="${wordSize}" font-weight="bold" fill="${wordFill}">Fernhill</text>
  <text x="${60 + logoSize + 20}" y="${(a.tiny ? 70 : 90) + logoSize * 0.78 + (a.tiny ? 12 : 30)}" font-family="Arial" font-size="${a.tiny ? 8 : 18}" fill="${a.tiny ? "#d9ccb3" : "#6b5a46"}" letter-spacing="8">BAKERY</text>
  <text x="60" y="${a.tiny ? 330 : 300}" font-family="Arial" font-size="${labelSize}" fill="${a.tiny ? "#cdbfa5" : "#7a6a55"}" letter-spacing="3">${a.tiny ? "COLOURS" : "PALETTE AND ROLES"}</text>
  ${swatch(60, "#8a5a2b", "Crust", "primary")}${swatch(270, "#fbf4e8", "Cream", "background")}${swatch(480, "#2b1d12", "Ink", "text")}${swatch(690, "#c8561e", "Ember", "accent, sparingly")}${swatch(900, "#5d7a5a", "Sage", "support")}
  <text x="60" y="${a.tiny ? 520 : 580}" font-family="Arial" font-size="${labelSize}" fill="${a.tiny ? "#cdbfa5" : "#7a6a55"}" letter-spacing="3">TYPE</text>
  <text x="60" y="${a.tiny ? 560 : 640}" font-family="Georgia, serif" font-size="${a.tiny ? 14 : 44}" font-weight="bold" fill="${a.tiny ? "#d3c4a6" : "#2b1d12"}">Headline: Georgia Bold</text>
  <text x="60" y="${a.tiny ? 585 : 690}" font-family="Arial" font-size="${a.tiny ? 9 : 20}" fill="${a.tiny ? "#d3c4a6" : "#3a2d20"}">Body: Arial Regular. Good bread, no airs. Sourdough, pastries and coffee.</text>
  ${a.tiny ? "" : `<rect x="760" y="580" width="380" height="170" fill="none" stroke="#c8561e" stroke-width="2" stroke-dasharray="8 6"/>
  ${leaf(830, 620, 40, "#c8561e")}<text x="880" y="650" font-family="Georgia, serif" font-size="32" font-weight="bold" fill="#2b1d12">Fernhill</text>
  <text x="780" y="700" font-family="Arial" font-size="16" fill="#3a2d20">Rule: keep clear space equal to</text>
  <text x="780" y="722" font-family="Arial" font-size="16" fill="#3a2d20">the height of the F. Minimum width 32 mm.</text>`}`;
};

const GOOD = "First, the warm Ember accent (#c8561e) and the rounded, friendly leaf mark express the brief's warm and unfussy tone for families, while the near-black Ink (#2b1d12) on Cream gives 15:1 contrast for office workers reading a menu. Second, the palette has clear roles: Crust is the primary, Cream and Ink are neutrals, Ember is the accent used sparingly and Sage supports. Third, two type roles, Georgia Bold at 44 points for headlines and Arial at 20 points for body, are named and shown so a printer can follow them. I set the clear-space rule from the height of the F and a 32 mm minimum width.";
const WEAK = "I chose pale tones so the identity feels gentle and unfussy. The logo is small and light so it does not shout, the colours are soft and there are only a few labels so the sheet stays clean. The type is small and quiet. I did not measure the colours.";

const e = (label: string, test: Expectation["test"]): Expectation => ({ label, test });
const s = (r: Parameters<Expectation["test"]>[0], k: string) => score(r, k) ?? 100;

export const brandSamples: Sample[] = [
  {
    id: "brand-strong", assignment: ASSIGNMENT, note: "Clear lockup, five labelled palette roles with hex values, two named type roles, clear-space rule; rationale reports values",
    expect: "passes (>= 80); logo-and-lockup and legibility >= 70; colour and type systems >= 70",
    expectations: [e("passes", (r) => r.passed === true), e("logo-and-lockup >= 70", (r) => complete(r) && s(r, "logo-and-lockup") >= 70), e("legibility-at-small-size >= 70", (r) => complete(r) && s(r, "legibility-at-small-size") >= 70), e("colour-system >= 70", (r) => complete(r) && s(r, "colour-system") >= 70)],
    rationale: GOOD,
    images: async () => { const sheet = await svgPng(W, H, strongSheet({})); return [await img("final", "Brand sheet", "final", sheet), await img("preview", "Small-scale preview", "preview", await shrink(sheet, 400))]; },
  },
  {
    id: "brand-illegible", assignment: ASSIGNMENT, note: "Tiny, pale logo and labels; no roles or hex values; at the 400 px preview nothing is readable",
    expect: "does not pass; logo-and-lockup < 60 or legibility-at-small-size < 60",
    expectations: [e("does not pass", (r) => r.passed === false || r.status === "needs_evidence"), e("logo or small-size legibility < 60", (r) => complete(r) && (s(r, "logo-and-lockup") < 60 || s(r, "legibility-at-small-size") < 60)), e("colour-system < 70", (r) => complete(r) && s(r, "colour-system") < 70)],
    rationale: WEAK,
    images: async () => { const sheet = await svgPng(W, H, strongSheet({ tiny: true })); return [await img("final", "Brand sheet", "final", sheet), await img("preview", "Small-scale preview", "preview", await shrink(sheet, 400))]; },
  },
];
