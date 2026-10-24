import { img, shrink, svgPng } from "./draw";
import { complete, score, type Expectation, type Sample } from "./types";

const ASSIGNMENT = "mobile-screen";
const W = 390, H = 844;
const e = (label: string, test: Expectation["test"]): Expectation => ({ label, test });
const s = (r: Parameters<Expectation["test"]>[0], k: string) => score(r, k) ?? 100;

const row = (y: number, h: number, t: string, seats: string, o: { selected?: boolean; disabled?: boolean; tiny?: boolean }) => {
  const stroke = o.disabled ? "#6b675a" : o.selected ? "#1a2fb8" : "#8a8676";
  const fill = o.disabled ? "#f1efe8" : "#ffffff";
  const fs = o.tiny ? 11 : 20;
  const textFill = o.tiny ? "#b5b5b5" : o.disabled ? "#5a574c" : "#1c1b16";
  return `<rect x="24" y="${y}" width="342" height="${h}" rx="${o.tiny ? 3 : 10}" fill="${fill}" stroke="${stroke}" stroke-width="${o.selected && !o.tiny ? 3 : 1.5}" ${o.disabled && !o.tiny ? 'stroke-dasharray="6 4"' : ""}/>
  <text x="44" y="${y + h / 2 + fs * 0.35}" font-family="Arial" font-size="${fs}" font-weight="${o.tiny ? "normal" : "bold"}" fill="${textFill}">${t}</text>
  <text x="${o.tiny ? 100 : 130}" y="${y + h / 2 + fs * 0.35}" font-family="Arial" font-size="${fs}" fill="${textFill}">${seats}</text>
  ${o.selected && !o.tiny ? `<text x="324" y="${y + h / 2 + 8}" font-family="Arial" font-size="24" fill="#1a2fb8">✓</text>` : ""}`;
};

const strongScreen = `
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="24" y="104" font-family="Arial" font-size="28" font-weight="bold" fill="#1c1b16">Harbour Quay to</text>
  <text x="24" y="138" font-family="Arial" font-size="28" font-weight="bold" fill="#1c1b16">Northpoint</text>
  <text x="24" y="176" font-family="Arial" font-size="18" fill="#4a463b">Saturday 14 March</text>
  <text x="24" y="240" font-family="Arial" font-size="16" fill="#4a463b">Choose a departure</text>
  ${row(256, 64, "07:40", "12 seats left", { selected: true })}
  ${row(336, 64, "09:10", "3 seats left", {})}
  ${row(416, 64, "11:30", "Sold out, not available", { disabled: true })}
  <rect x="24" y="752" width="342" height="56" rx="10" fill="#1a2fb8"/>
  <text x="195" y="788" text-anchor="middle" font-family="Arial" font-size="20" font-weight="bold" fill="#ffffff">Continue</text>`;

const weakScreen = `
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="24" y="104" font-family="Arial" font-size="14" fill="#555555">Harbour Quay to Northpoint</text>
  <text x="24" y="124" font-family="Arial" font-size="14" fill="#555555">Saturday 14 March</text>
  ${row(150, 24, "07:40", "12 seats left", { tiny: true })}
  ${row(178, 24, "09:10", "3 seats left", { tiny: true })}
  <rect x="24" y="206" width="342" height="24" rx="3" fill="#ffffff" stroke="#e6e6e6"/>
  <text x="44" y="222" font-family="Arial" font-size="11" fill="#e0e0e0">11:30</text>
  <rect x="24" y="760" width="120" height="28" rx="3" fill="#9db4ff"/>
  <text x="84" y="779" text-anchor="middle" font-family="Arial" font-size="12" fill="#ffffff">Continue</text>`;

const GOOD = "First, the route is the largest text at 28 points bold and the date sits below in a quieter 18 points, so the reading order is route, date, departures, then the single blue Continue button. Second, every row and the button is at least 56 points tall with 16 points between rows, and I used a 8-point spacing scale throughout. Third, states do not rely on colour: the selected row has a heavier blue outline and a check mark, and the sold-out row is dashed with the words Sold out, not available. Body text is 16 to 20 points. Contrast: dark ink on white is 17:1 and white on the blue button is 8.5:1.";
const WEAK = "I kept the screen light and compact so it feels simple. The text is small and grey to stay out of the way, the rows are close together to fit on the screen, and the button is small and soft so it does not dominate. The sold-out time is just lighter than the others. I did not measure any sizes or contrast.";

export const uiSamples: Sample[] = [
  {
    id: "ui-strong", assignment: ASSIGNMENT, note: "Clear hierarchy, 56-64 pt targets, selected and disabled states with non-colour cues, readable text; rationale reports sizes and ratios",
    expect: "passes (>= 80); targets-and-states >= 70; readable-text-and-contrast >= 70",
    expectations: [e("passes", (r) => r.passed === true), e("targets-and-states >= 70", (r) => complete(r) && s(r, "targets-and-states") >= 70), e("readable-text-and-contrast >= 70", (r) => complete(r) && s(r, "readable-text-and-contrast") >= 70), e("hierarchy-and-layout >= 70", (r) => complete(r) && s(r, "hierarchy-and-layout") >= 70)],
    rationale: GOOD,
    images: async () => { const d = await svgPng(W, H, strongScreen); return [await img("final", "Screen design", "final", d), await img("preview", "Small-scale preview", "preview", await shrink(d, 400))]; },
  },
  {
    id: "ui-weak-targets", assignment: ASSIGNMENT, note: "24 pt rows with 4 pt gaps, 11 pt pale-grey text, 28 pt pale button, sold-out shown only by lighter colour",
    expect: "does not pass; targets-and-states < 60; readable-text-and-contrast < 60",
    expectations: [e("does not pass", (r) => r.passed === false || r.status === "needs_evidence"), e("targets-and-states < 60", (r) => complete(r) && s(r, "targets-and-states") < 60), e("readable-text-and-contrast < 60", (r) => complete(r) && s(r, "readable-text-and-contrast") < 60)],
    rationale: WEAK,
    images: async () => { const d = await svgPng(W, H, weakScreen); return [await img("final", "Screen design", "final", d), await img("preview", "Small-scale preview", "preview", await shrink(d, 400))]; },
  },
];
