import { img, svgPng } from "./draw";
import { complete, score, type Expectation, type Sample } from "./types";

const ASSIGNMENT = "contrast-campaign-capstone";
const e = (label: string, test: Expectation["test"]): Expectation => ({ label, test });
const s = (r: Parameters<Expectation["test"]>[0], k: string) => score(r, k) ?? 100;

/** One consistent system: dark block, cream ground, a single saturated blue action, Georgia headlines and Arial text. */
const poster = () => `
  <rect width="100%" height="100%" fill="#f6f1e6"/><rect x="48" y="60" width="704" height="330" fill="#15130e"/>
  <text x="80" y="200" font-family="Georgia, serif" font-size="108" font-weight="bold" fill="#f6f1e6">OPEN</text>
  <text x="80" y="330" font-family="Georgia, serif" font-size="108" font-weight="bold" fill="#f6f1e6">STUDIO</text>
  <text x="48" y="500" font-family="Arial" font-size="46" font-weight="bold" fill="#15130e">Saturday 14 March</text>
  <text x="48" y="560" font-family="Arial" font-size="38" fill="#3a362c">Harbour Hall, Pier 4</text>
  <rect x="48" y="900" width="420" height="96" fill="#1a2fb8"/><text x="84" y="962" font-family="Arial" font-size="38" font-weight="bold" fill="#ffffff">Register now</text>
  <text x="48" y="1060" font-family="Arial" font-size="30" fill="#3a362c">openstudio.example</text>`;
const squareOk = () => `
  <rect width="100%" height="100%" fill="#f6f1e6"/><rect x="36" y="36" width="528" height="200" fill="#15130e"/>
  <text x="64" y="132" font-family="Georgia, serif" font-size="76" font-weight="bold" fill="#f6f1e6">OPEN STUDIO</text>
  <text x="64" y="200" font-family="Arial" font-size="34" fill="#f6f1e6">Creative conference</text>
  <text x="36" y="320" font-family="Arial" font-size="40" font-weight="bold" fill="#15130e">Saturday 14 March</text>
  <text x="36" y="372" font-family="Arial" font-size="32" fill="#3a362c">Harbour Hall, Pier 4</text>
  <rect x="36" y="440" width="320" height="84" fill="#1a2fb8"/><text x="66" y="496" font-family="Arial" font-size="34" font-weight="bold" fill="#ffffff">Register now</text>
  <text x="36" y="570" font-family="Arial" font-size="24" fill="#3a362c">openstudio.example</text>`;
const bannerOk = () => `
  <rect width="100%" height="100%" fill="#15130e"/>
  <text x="14" y="42" font-family="Georgia, serif" font-size="30" font-weight="bold" fill="#f6f1e6">OPEN STUDIO</text>
  <text x="14" y="72" font-family="Arial" font-size="18" fill="#f6f1e6">Sat 14 March, Harbour Hall, Pier 4</text>
  <rect x="540" y="18" width="172" height="54" fill="#1a2fb8"/><text x="626" y="52" text-anchor="middle" font-family="Arial" font-size="22" font-weight="bold" fill="#ffffff">Register now</text>`;
/** Same event, but each piece invents its own look. */
const squareOff = () => `
  <rect width="100%" height="100%" fill="#ff5fa8"/><circle cx="470" cy="130" r="120" fill="#7bd88f"/>
  <text x="30" y="150" font-family="Brush Script MT, cursive" font-size="88" font-style="italic" fill="#fff3a0">Open Studio</text>
  <text x="40" y="330" font-family="Courier New, monospace" font-size="26" fill="#ffb3d6">14 March / Harbour Hall, Pier 4</text>
  <text x="40" y="560" font-family="Courier New, monospace" font-size="22" fill="#ff8ec1">register: openstudio.example</text>`;
const bannerOff = () => `
  <rect width="100%" height="100%" fill="#2f9e6b"/>
  <text x="10" y="40" font-family="Times New Roman, serif" font-size="14" fill="#3fae7b">Open Studio  ·  Creative conference  ·  14 March  ·  Harbour Hall, Pier 4  ·  openstudio.example</text>
  <text x="10" y="70" font-family="Times New Roman, serif" font-size="12" fill="#43b17f">Register at the link</text>`;

const GOOD = "First, all three pieces share one system: a near-black block with cream Georgia headlines, Arial for details and a single saturated blue for the call to action, adapted to each shape. Second, the reading order is the event name, then the date and place, then Register now, in the poster, the square and the banner, with the banner using a dark ground so the name stays large at 30 points. Third, essential text is measured: cream on black is 17:1, dark ink on cream is 15:1 and white on blue is 8.5:1, all above 4.5:1 even in the small banner.";
const OFF = "I wanted each piece to feel fresh for its channel, so the square uses a playful pink and green with a script face and the banner a calm green with a serif. They share the event name and details. Contrast was judged by eye and the colours are bold.";

const files = async (parts: [string, string, number, number, string][]) =>
  Promise.all(parts.map(async ([slot, label, w, h, body]) => img(slot, label, "piece", await svgPng(w, h, body))));

export const campaignSamples: Sample[] = [
  {
    id: "campaign-consistent", assignment: ASSIGNMENT, note: "Poster, square and banner share type, colour logic and hierarchy; ratios reported",
    expect: "consistency-across-pieces >= 70; accessible-contrast >= 70; legibility-across-formats >= 65",
    expectations: [e("consistency-across-pieces >= 70", (r) => complete(r) && s(r, "consistency-across-pieces") >= 70), e("accessible-contrast >= 70", (r) => complete(r) && s(r, "accessible-contrast") >= 70), e("legibility-across-formats >= 65", (r) => complete(r) && s(r, "legibility-across-formats") >= 65)],
    rationale: GOOD,
    images: () => files([["poster", "Poster", 800, 1200, poster()], ["social-square", "Social square", 600, 600, squareOk()], ["banner", "Web banner", 728, 90, bannerOk()]]),
  },
  {
    id: "campaign-inconsistent", assignment: ASSIGNMENT, note: "Good poster, but the square and banner invent unrelated styles, with pale low-contrast text in the banner",
    expect: "does not pass; consistency-across-pieces < 60; accessible-contrast or legibility-across-formats < 60",
    expectations: [e("does not pass", (r) => r.passed === false || r.status === "needs_evidence"), e("consistency-across-pieces < 60", (r) => complete(r) && s(r, "consistency-across-pieces") < 60), e("accessible-contrast or legibility < 60", (r) => complete(r) && (s(r, "accessible-contrast") < 60 || s(r, "legibility-across-formats") < 60))],
    rationale: OFF,
    images: () => files([["poster", "Poster", 800, 1200, poster()], ["social-square", "Social square", 600, 600, squareOff()], ["banner", "Web banner", 728, 90, bannerOff()]]),
  },
];
