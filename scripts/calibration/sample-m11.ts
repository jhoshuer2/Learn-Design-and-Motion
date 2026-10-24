import { img, shrink, svgPng } from "./draw";
import { complete, score, type Expectation, type Sample } from "./types";

/** Synthetic samples for the three second-module assessments (M11). Not learner data; the businesses are invented. */
const e = (label: string, test: Expectation["test"]): Expectation => ({ label, test });
const s = (r: Parameters<Expectation["test"]>[0], k: string) => score(r, k) ?? 100;
const ge = (k: string, n: number) => e(`${k} >= ${n}`, (r) => complete(r) && s(r, k) >= n);
const lt = (k: string, n: number) => e(`${k} < ${n}`, (r) => complete(r) && s(r, k) < n);
const notPassed = e("does not pass", (r) => r.passed === false || r.status === "needs_evidence");
const overallAtLeast = (n: number) => e(`overall >= ${n}`, (r) => (r.overall ?? 0) >= n);
const pair = async (w: number, h: number, body: string) => {
  const d = await svgPng(w, h, body);
  return [await img("final", "Final", "final", d), await img("preview", "Small-scale preview", "preview", await shrink(d, 400))];
};
const t = (x: number, y: number, size: number, fill: string, text: string, o: { w?: string; f?: string; a?: string; ls?: number } = {}) =>
  `<text x="${x}" y="${y}" font-family="${o.f ?? "Arial"}" font-size="${size}" font-weight="${o.w ?? "normal"}" fill="${fill}" ${o.a ? `text-anchor="${o.a}"` : ""} ${o.ls ? `letter-spacing="${o.ls}"` : ""}>${text}</text>`;

// ───────── typographic-programme (A4 portrait, 794 x 1123)
const SERIF = "Georgia, serif";
const sess = (y: number, date: string, title: string, lead: string, d1: string, d2: string) => `
  ${t(80, y, 15, "#4a463b", date, { w: "bold" })}
  ${t(220, y, 26, "#1c1b16", title, { w: "bold", f: SERIF })}
  ${t(220, y + 26, 15, "#4a463b", lead)}
  ${t(220, y + 54, 16, "#1c1b16", d1)}
  ${t(220, y + 80, 16, "#1c1b16", d2)}`;
const programmeStrong = `
  <rect width="100%" height="100%" fill="#fbf9f3"/>
  ${t(80, 150, 46, "#1c1b16", "Harbour Reading Group", { w: "bold", f: SERIF })}
  ${t(80, 196, 18, "#4a463b", "AUTUMN SEASON", { ls: 3 })}
  <rect x="80" y="226" width="634" height="3" fill="#1c1b16"/>
  ${sess(300, "TUE 7 OCT", "The Lighthouse Keeper's Letters", "Led by Mara Quinn", "A year of letters from a remote light, read aloud and", "talked through, one voice at a time.")}
  ${sess(470, "TUE 14 OCT", "Short Stories from the Coast", "Led by Joe Alder", "Six short stories of tides and harbours, each one", "short enough to read twice before we meet.")}
  ${sess(640, "TUE 21 OCT", "Poems for Winter", "Led by Priya Nair", "Poems for the dark months, chosen by the group", "and read in turn, with tea.")}
  <rect x="80" y="880" width="634" height="1.5" fill="#1c1b16"/>
  ${t(80, 925, 16, "#1c1b16", "Quay Library, Room 2", { w: "bold" })}
  ${t(80, 951, 16, "#4a463b", "18:30 on each Tuesday. Admission free.")}`;
const programmeWeak = `
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${t(397, 120, 30, "#222222", "Harbour Reading Group", { a: "middle", f: "Courier" })}
  ${t(397, 150, 28, "#333333", "Autumn season", { a: "middle", f: "Georgia" })}
  ${t(40, 230, 10, "#999999", "Tuesday 7 October The Lighthouse Keeper's Letters led by Mara Quinn a year of letters from a remote light read aloud and talked through one voice at a time at Quay Library Room 2 at 18:30", { f: "Courier" })}
  ${t(60, 262, 24, "#444444", "Tuesday 14 October, Short Stories from the Coast", { w: "bold" })}
  ${t(46, 288, 9, "#aaaaaa", "Led by Joe Alder. Six short stories of tides and harbours, each short enough to read twice before we meet, Quay Library Room 2, 18:30", { f: "Courier" })}
  ${t(700, 340, 12, "#777777", "21 Oct Poems for Winter, Priya Nair", { a: "end" })}
  ${t(30, 380, 10, "#bbbbbb", "Poems for the dark months chosen by the group and read in turn with tea. Quay Library Room 2 18:30 free", { f: "Georgia" })}`;
const PROG_GOOD = "First, the group name is the largest text at 46 px bold serif, the season is an 18 px letter-spaced sans, then each session's title is 26 px bold serif, with date, leader and a two-line description beneath, and the practical details last at 16 px. Second, body text is 16 px (12 pt on A4) on a measure of about 55 characters with 26 px line spacing, which is 1.6 times the type size, left aligned. Third, the page sits on an 80 px margin with a date column at x=80 and a text column at x=220; the three sessions are 170 px apart and set identically. I used two typefaces: a serif for headlines and a sans for details. The ink on the cream paper is about 15:1.";
const PROG_WEAK = "I wanted a relaxed, informal look so I mixed fonts and centred some things. The text is small to fit everything on one page and I left some lines long. I did not measure anything.";

// ───────── imagery-layout-guide (1000 x 1400)
const brown = "#2b1d14", cream = "#fbf3e4", crust = "#c9772e";
const tile = (x: number, y: number, w: number, h: number, o: { cool?: boolean; wide?: boolean }) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${o.cool ? "#cfe0ee" : "#f4dcb4"}"/>
  <rect x="${x}" y="${y + h * 0.58}" width="${w}" height="${h * 0.42}" fill="${o.cool ? "#8aa4b8" : "#d9a566"}"/>
  <ellipse cx="${x + w / 2}" cy="${y + h * (o.wide ? 0.6 : 0.62)}" rx="${w * (o.wide ? 0.14 : 0.36)}" ry="${h * (o.wide ? 0.07 : 0.22)}" fill="${o.cool ? "#5b6f80" : "#9a5a20"}"/>`;
const post = (x: number, y: number, head: string, cap: string) => `
  <rect x="${x}" y="${y}" width="200" height="260" fill="${cream}" stroke="${brown}" stroke-width="1.5"/>
  <rect x="${x + 12}" y="${y + 12}" width="176" height="110" fill="${crust}"/>
  ${t(x + 12, y + 150, 12, brown, head, { w: "bold", f: SERIF })}
  ${t(x + 12, y + 172, 11, brown, cap)}
  ${t(x + 12, y + 246, 10, brown, "FERNHILL", { w: "bold", ls: 2 })}`;
const guideStrong = `
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${t(60, 90, 40, brown, "Fernhill Bakery", { w: "bold", f: SERIF })}
  ${t(60, 128, 20, "#6b4a2b", "Imagery and layout guide for photos and posts")}
  <rect x="60" y="148" width="880" height="3" fill="${crust}"/>
  ${t(60, 200, 26, brown, "1  Image style", { w: "bold" })}
  ${t(60, 240, 18, brown, "Natural window light, warm tones, no filters.")}
  ${t(60, 268, 18, brown, "The subject fills at least two thirds of the frame.")}
  ${t(60, 296, 18, brown, "Hands and bread, never faces. One dark caption bar at the bottom when text is needed.")}
  ${tile(60, 330, 200, 150, {})}
  ${t(60, 506, 18, "#1b6b3a", "DO: warm, tight crop", { w: "bold" })}
  ${tile(300, 330, 200, 150, { cool: true, wide: true })}
  ${t(300, 506, 18, "#a3261e", "DON'T: cool, distant, small subject", { w: "bold" })}
  ${t(60, 590, 26, brown, "2  Layout template", { w: "bold" })}
  ${t(60, 626, 18, brown, "Fixed: image on top, headline under it, caption below, logo bottom left, 12 px margin.")}
  ${t(60, 652, 18, brown, "Flexible: the words, the photo and one accent colour from the palette.")}
  ${post(60, 690, "Rye loaf, back on Fridays", "Baked slowly, sold until gone.")}
  ${post(300, 690, "Saturday buns", "Cardamom, still warm.")}
  <rect x="560" y="690" width="200" height="260" fill="#ffffff" stroke="#8a7a68" stroke-dasharray="6 4"/>
  <rect x="572" y="702" width="176" height="110" fill="#f1e2c8" stroke="#8a7a68"/>
  ${t(660, 762, 14, brown, "IMAGE", { a: "middle", w: "bold" })}
  ${t(572, 846, 14, brown, "HEADLINE", { w: "bold" })}
  ${t(572, 868, 12, brown, "CAPTION")}
  ${t(572, 936, 12, brown, "LOGO", { w: "bold" })}
  ${t(60, 1040, 26, brown, "3  Voice", { w: "bold" })}
  ${t(60, 1078, 18, brown, "Warm. Plain-spoken. Specific: a day, a flavour, a real detail.")}
  ${t(60, 1124, 18, "#6b4a2b", "Headline", { w: "bold" })}
  ${t(60, 1152, 24, brown, "Cardamom buns, Saturdays, while they last.", { f: SERIF, w: "bold" })}
  ${t(60, 1200, 18, "#6b4a2b", "Caption", { w: "bold" })}
  ${t(60, 1228, 18, brown, "Baked at 5 a.m. so they are still warm when you collect them.")}`;
const guideWeak = `
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${t(500, 120, 36, "#555555", "Fernhill guide", { a: "middle", f: "Courier" })}
  ${t(60, 300, 14, "#aaaaaa", "Photos should look nice and authentic.")}
  <rect x="60" y="400" width="300" height="200" fill="#f4f4f4" stroke="#dddddd"/>
  ${t(200, 510, 13, "#bbbbbb", "template", { a: "middle" })}
  ${t(60, 760, 14, "#aaaaaa", "Our voice is friendly.")}
  ${t(60, 800, 14, "#aaaaaa", "Amazing deals on delicious baked goods for everyone!!!")}`;
const GUIDE_GOOD = "I made the image rules checkable on a finished photo: natural window light, subject filling at least two thirds of the frame, no filters, so any new photo can be tested against them, and I show a warm do tile against a cool, distant don't tile. The template has four fixed zones, image on top 176 by 110, headline, caption and a logo bottom left, with a 12 px margin, and I show it on two different posts with the unfilled zones labelled beside them. The voice is warm, plain-spoken and specific, and the sample headline and caption both lead with a real detail, a day and a flavour. Text is 18 px or larger on a cream and brown palette with contrast of about 12:1.";
const GUIDE_WEAK = "I kept it simple and friendly. The photos should look nice, there is a template box, and the voice is friendly. I did not measure anything.";

// ───────── form-screen (390 x 844)
const GREEN = "#1b6b3a", RED = "#a3261e";
const field = (y: number, label: string, o: { error?: [string, string]; optional?: boolean; ok?: string; value?: string } = {}) => `
  ${t(24, y, 16, "#1c1b16", label, { w: "bold" })}${o.optional ? t(24 + label.length * 8.8 + 6, y, 16, "#4a463b", "(optional)") : ""}
  <rect x="24" y="${y + 12}" width="342" height="52" rx="8" fill="#ffffff" stroke="${o.error ? RED : "#6b675a"}" stroke-width="${o.error ? 3 : 1.5}"/>
  ${o.value ? t(40, y + 45, 18, "#1c1b16", o.value) : ""}
  ${o.error ? t(24, y + 92, 16, RED, `⚠ ${o.error[0]}`, { w: "bold" }) + t(44, y + 114, 16, RED, o.error[1], { w: "bold" }) : ""}
  ${o.ok ? t(24, y + 92, 16, GREEN, `✓ ${o.ok}`, { w: "bold" }) : ""}`;
const navItem = (cx: number, label: string, current: boolean) => `
  ${current ? `<rect x="${cx - 52}" y="768" width="104" height="4" fill="#1a2fb8"/>` : ""}
  <circle cx="${cx}" cy="797" r="9" fill="${current ? "#1a2fb8" : "none"}" stroke="${current ? "#1a2fb8" : "#4a463b"}" stroke-width="2"/>
  ${t(cx, 830, 15, current ? "#1a2fb8" : "#4a463b", label, { a: "middle", w: current ? "bold" : "normal" })}`;
const formStrong = `
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${t(24, 64, 17, "#1a2fb8", "‹ Back to departures", { w: "bold" })}
  ${t(24, 120, 30, "#1c1b16", "Passenger details", { w: "bold" })}
  ${t(24, 168, 14, "#4a463b", "WHO IS TRAVELLING", { w: "bold", ls: 1.5 })}
  ${field(204, "Full name", { value: "Sam Harbour", ok: "Name saved" })}
  ${field(336, "Email for your ticket", { value: "sam@harbour", error: ["Add the part after the dot,", "for example .com"] })}
  ${t(24, 492, 14, "#4a463b", "EXTRAS", { w: "bold", ls: 1.5 })}
  ${field(524, "Bicycle space", { optional: true })}
  <rect x="24" y="670" width="342" height="60" rx="10" fill="#1a2fb8"/>
  ${t(195, 707, 20, "#ffffff", "Continue to payment", { a: "middle", w: "bold" })}
  <rect x="0" y="764" width="390" height="80" fill="#f4f2ec"/>
  ${navItem(65, "Tickets", true)}${navItem(195, "Timetable", false)}${navItem(325, "Account", false)}`;
const formWeak = `
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${t(24, 80, 14, "#888888", "Details")}
  <rect x="24" y="120" width="342" height="26" rx="2" fill="#ffffff" stroke="#dddddd"/>${t(32, 138, 11, "#cccccc", "Name")}
  <rect x="24" y="152" width="342" height="26" rx="2" fill="#ffffff" stroke="${RED}"/>${t(32, 170, 11, "#cccccc", "Email")}
  ${t(24, 196, 11, RED, "Error")}
  <rect x="24" y="204" width="342" height="26" rx="2" fill="#ffffff" stroke="#dddddd"/>${t(32, 222, 11, "#cccccc", "Bike")}
  <rect x="24" y="260" width="90" height="26" rx="3" fill="#cdd6f7"/>${t(69, 277, 11, "#ffffff", "Submit", { a: "middle" })}`;
const FORM_GOOD = "First, every field has a visible label at 16 px bold above a 52 px tall field, related fields are grouped under small caps headings with 40 px between groups, and the optional bicycle field is marked (optional). Second, navigation is a bottom bar of three labelled items 80 px tall; the current item, Tickets, is marked by blue, bold text, a filled icon and a 4 px bar, and a Back to departures link sits at the top. Third, the email field is in an error state with a 3 px red outline, a warning icon and the message Add the part after the dot, for example .com, and the name field shows a check mark and Name saved. Targets are at least 52 px and the main button is 60 px. Body text is 16 to 18 px. Contrast is dark ink on white at about 17:1, white on the blue button at about 8.5:1.";
const FORM_WEAK = "I kept the screen light and compact so it feels simple. The fields are small with grey hints, the error is a red border, and the button is small. I did not measure any sizes or contrast.";

export const m11Samples: Sample[] = [
  { id: "typo-strong", assignment: "typographic-programme", note: "Clear four-level hierarchy, serif + sans, 16 px body at 1.6 leading, 55-character lines, 80 px margins, parallel sessions",
    expect: "overall >= 70; type-hierarchy >= 70; text-settings >= 70; grid-and-alignment >= 70",
    expectations: [overallAtLeast(70), ge("type-hierarchy", 70), ge("text-settings", 70), ge("grid-and-alignment", 70)],
    rationale: PROG_GOOD, images: () => pair(794, 1123, programmeStrong) },
  { id: "typo-weak", assignment: "typographic-programme", note: "Three typefaces, centred and left mixed, 9-10 px pale grey lines about 150 characters long, sessions set differently, near-miss edges",
    expect: "does not pass; text-settings < 60; grid-and-alignment < 60",
    expectations: [notPassed, lt("text-settings", 60), lt("grid-and-alignment", 60)],
    rationale: PROG_WEAK, images: () => pair(794, 1123, programmeWeak) },
  { id: "imagery-strong", assignment: "imagery-layout-guide", note: "Checkable image rules with do/don't tiles, labelled four-zone template shown on two posts, three-trait voice with sample lines",
    expect: "overall >= 70; image-style-rules >= 70; layout-template >= 70; brand-voice >= 70",
    expectations: [overallAtLeast(70), ge("image-style-rules", 70), ge("layout-template", 70), ge("brand-voice", 70)],
    rationale: GUIDE_GOOD, images: () => pair(1000, 1400, guideStrong) },
  { id: "imagery-weak", assignment: "imagery-layout-guide", note: "One vague rule, an empty box labelled template, a generic shouting line, no examples, tiny pale text",
    expect: "does not pass; image-style-rules < 60; layout-template < 60",
    expectations: [notPassed, lt("image-style-rules", 60), lt("layout-template", 60)],
    rationale: GUIDE_WEAK, images: () => pair(1000, 1400, guideWeak) },
  { id: "form-strong", assignment: "form-screen", note: "Visible labels, groups, optional marked, labelled nav bar with a doubly-marked current item, back link, error with icon and fix, success cue",
    expect: "overall >= 70; form-structure >= 70; navigation-clarity >= 70; feedback-and-recovery >= 70",
    expectations: [overallAtLeast(70), ge("form-structure", 70), ge("navigation-clarity", 70), ge("feedback-and-recovery", 70)],
    rationale: FORM_GOOD, images: () => pair(390, 844, formStrong) },
  { id: "form-weak", assignment: "form-screen", note: "Placeholder-only 11 px pale labels in 26 px fields, red border and the word Error, no navigation or back link, tiny pale Submit",
    expect: "does not pass; feedback-and-recovery < 60; targets-and-states < 60; navigation-clarity < 50",
    expectations: [notPassed, lt("feedback-and-recovery", 60), lt("targets-and-states", 60), lt("navigation-clarity", 50)],
    rationale: FORM_WEAK, images: () => pair(390, 844, formWeak) },
];
