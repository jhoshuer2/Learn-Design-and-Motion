import { img, shrink, svgPng } from "./draw";
import { complete, score, type Expectation, type Img, type Sample } from "./types";

/** Synthetic filmstrips for the motion module assessment and capstone (M12). Not learner data. Written, not yet run against the real grader. */
const e = (label: string, test: Expectation["test"]): Expectation => ({ label, test });
const s = (r: Parameters<Expectation["test"]>[0], k: string) => score(r, k) ?? 100;
const ge = (k: string, n: number) => e(`${k} >= ${n}`, (r) => complete(r) && s(r, k) >= n);
const lt = (k: string, n: number) => e(`${k} < ${n}`, (r) => complete(r) && s(r, k) < n);
const notPassed = e("does not pass", (r) => r.passed === false || r.status === "needs_evidence");
const overallAtLeast = (n: number) => e(`overall >= ${n}`, (r) => (r.overall ?? 0) >= n);

const BG = "#14110f", CREAM = "#f6efe3", GOLD = "#f4c542", ACC = "#ff6b35";
type Opt = { stretch?: [number, number]; offset?: [number, number]; size?: number };
/** One frame cell: a word shown with `p` letters in, drawn in a w by h cell at (x, y). */
function cell(x: number, y: number, w: number, h: number, word: string, p: number, o: Opt = {}) {
  const size = o.size ?? Math.min(w / (Math.max(word.length, 3) * 0.7), h * 0.34);
  const adv = size * 0.602, n = Math.round(p * word.length), cx = x + w / 2, cy = y + h / 2;
  const letters = [...word].slice(0, n).map((ch, i) => `<text x="${(cx + (i - (word.length - 1) / 2) * adv).toFixed(1)}" y="${(cy + size * 0.35).toFixed(1)}" font-family="DejaVu Sans Mono, monospace" font-weight="bold" font-size="${size.toFixed(1)}" text-anchor="middle" fill="${i % 2 ? CREAM : GOLD}">${ch}</text>`).join("");
  const sx = o.stretch?.[0] ?? 1, sy = o.stretch?.[1] ?? 1;
  const g = `<g transform="translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy}) translate(${o.offset?.[0] ?? 0} ${o.offset?.[1] ?? 0})">${letters}</g>`;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${BG}" stroke="#3a332b"/><circle cx="${cx}" cy="${cy}" r="${Math.min(w, h) * 0.32}" fill="${ACC}" opacity="0.2"/>${g}`;
}
/** Frames in order: empty, BUNS arriving, BUNS, ARE, BACK arriving, BACK, empty again (a closed loop) unless `open`. */
const SEQ: [string, number][] = [["BUNS", 0], ["BUNS", 0.5], ["BUNS", 1], ["ARE", 1], ["BACK", 0.5], ["BACK", 1]];
async function strip(w: number, h: number, o: { open?: boolean; opt?: (i: number) => Opt; words?: [string, number][] } = {}): Promise<Buffer> {
  const seq = [...(o.words ?? SEQ), o.open ? ["BACK", 1] as [string, number] : ["BUNS", 0] as [string, number]];
  const n = seq.length, pad = 6, cw = w, ch = h;
  const body = seq.map(([word, p], i) => cell(pad + i * (cw + pad), pad, cw, ch, word, p, o.opt?.(i))).join("");
  return svgPng(pad + n * (cw + pad), ch + pad * 2, `<rect width="100%" height="100%" fill="#000"/>${body}`);
}
const withPreview = async (data: Buffer, label: string): Promise<Img[]> => [await img("final", label, "final", data), await img("preview", "Small-scale preview", "preview", await shrink(data, 400))];

const GOOD_ASSESS = "My loop is 10 seconds long. Each word rests for about 1.2 seconds, and the letters stagger by 0.08 seconds with an ease-out entrance (about 0.5 seconds per letter). I closed the loop by copying the first keyframes to the end, so the last frame is the same empty circle as the first. Three choices: a slow ease so it feels friendly, a 1.2 second rest so FRESH EVERY MORNING can be read, and a pulsing circle behind the words that returns to its start size at 10 seconds.";
const WEAK_ASSESS = "I made it quick and energetic. The words fly in fast and it just repeats. I did not measure anything.";
const GOOD_CAP = "All three formats use the same motion: each letter staggers by 0.08 seconds with ease-out over 0.5 seconds, each word rests 1.2 seconds, and the loop is 9 seconds. I re-laid each one out instead of stretching: the square centres the word at 120 px, the story keeps words inside the middle 60 percent away from the app edges, and the banner uses a wider word at the same height. Each loop closes by matching the last frame to the first empty circle. Three choices: identical timing numbers across formats, letters kept at their normal proportions, and the same colour alternation per letter.";
const WEAK_CAP = "I made the square and then stretched it for the others to save time. The banner is just the square pulled wide. I did not measure anything and I did not check the loops.";

const GOOD_A = "kinetic-type-loop", CAP = "kinetic-type-capstone";
const stripFor = (kind: "good" | "bad", w: number, h: number) =>
  kind === "good" ? strip(w, h) : strip(w, h, { open: true, words: [["ARE", 1], ["BUNS", 1], ["BACK", 0.3], ["BACK", 1], ["BUNS", 1], ["ARE", 0.6]], opt: (i) => ({ stretch: [1.9, 0.55], offset: [i % 2 ? 40 : -40, 0] }) });

export const motionSamples: Sample[] = [
  { id: "motion-assess-strong", assignment: GOOD_A, note: "Seven frames: empty, BUNS arriving, BUNS, ARE, BACK arriving, BACK, empty again; first and last identical; numbers reported",
    expect: "overall >= 70; kinetic-type >= 70; loop-seam >= 70",
    expectations: [overallAtLeast(70), ge("kinetic-type", 70), ge("loop-seam", 70)], rationale: GOOD_ASSESS,
    images: async () => withPreview(await stripFor("good", 150, 150), "Filmstrip") },
  { id: "motion-assess-weak", assignment: GOOD_A, note: "Words out of order, stretched and offset, last frame differs from the first, no numbers",
    expect: "does not pass; kinetic-type < 60; loop-seam < 60", expectations: [notPassed, lt("kinetic-type", 60), lt("loop-seam", 60)], rationale: WEAK_ASSESS,
    images: async () => withPreview(await stripFor("bad", 150, 150), "Filmstrip") },
  { id: "motion-capstone-strong", assignment: CAP, note: "Three consistent filmstrips (square, story, banner), re-laid out, same sequence, loops closed, numbers reported",
    expect: "overall >= 70; format-consistency >= 70; loop-seam >= 70", expectations: [overallAtLeast(70), ge("format-consistency", 70), ge("loop-seam", 70)], rationale: GOOD_CAP,
    images: async () => [
      await img("square", "Square", "piece", await stripFor("good", 130, 130)), await img("story", "Story", "piece", await stripFor("good", 90, 160)), await img("banner", "Banner", "piece", await stripFor("good", 190, 107)),
    ] },
  { id: "motion-capstone-weak", assignment: CAP, note: "Banner and story are the square stretched; words out of order; loops open; no numbers",
    expect: "does not pass; format-consistency < 60", expectations: [notPassed, lt("format-consistency", 60)], rationale: WEAK_CAP,
    images: async () => [
      await img("square", "Square", "piece", await stripFor("good", 130, 130)), await img("story", "Story", "piece", await stripFor("bad", 90, 160)), await img("banner", "Banner", "piece", await stripFor("bad", 190, 107)),
    ] },
];

