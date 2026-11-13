import { C, Ci, H, L, R, T, W, clamp, ease, lerp, pingpong, prog, type Scene, type Video } from "./engine";

const MONO = "DejaVu Sans Mono, monospace";
/** Draw a word as separate letters; `st(i)` gives each letter's offset and opacity. Fixed-width letters so spacing stays even. */
function letters(word: string, cx: number, y: number, size: number, st: (i: number) => { dy?: number; dx?: number; op?: number; fill?: string }) {
  const adv = size * 0.602, x0 = cx - (adv * word.length) / 2 + adv / 2;
  return [...word].map((ch, i) => { const s = st(i); return T(x0 + i * adv + (s.dx ?? 0), y + (s.dy ?? 0), size, s.fill ?? C.cream, ch, { w: "bold", a: "middle", f: MONO, op: s.op ?? 1 }); }).join("");
}
const lane = (y: number, label: string, color = C.muted) => T(130, y - 38, 24, color, label, { w: "bold" });
const track = (y: number, x1 = 130, x2 = 830) => L(x1, y, x2, y, C.line, 4);

// ───────── 1. Motion feels alive
const v1: Video = {
  name: "motion-feels-alive",
  scenes: [
    { dur: 10, title: "Same move, two feels", takeaway: "Easing is why motion feels alive.",
      caption: "Both balls travel the same distance in the same time. The top one moves at one constant speed, which feels like a machine. The bottom one eases: it starts gently, speeds up, then settles. That small difference is what makes motion feel alive.",
      draw: (t) => {
        const a = pingpong(t, 2.2, 0.5, ease.linear), b = pingpong(t, 2.2, 0.5, ease.inOut);
        return lane(190, "Linear: one constant speed", C.muted) + track(190) + Ci(lerp(130, 830, a), 190, 24, C.muted) +
          lane(340, "Ease in-out: slow, fast, slow", C.teal) + track(340) + Ci(lerp(130, 830, b), 340, 24, C.acc);
      } },
    { dur: 9, title: "Spacing", takeaway: "Close together = slow. Far apart = fast.",
      caption: "Spacing is where the ball sits from one moment to the next. Dots close together mean slow, dots far apart mean fast. Easing is just spacing that changes along the way.",
      draw: (t) => {
        const dots = (y: number, fn: (x: number) => number, col: string) => Array.from({ length: 11 }, (_, i) => Ci(lerp(130, 830, fn(i / 10)), y, 8, col, 0.7)).join("");
        const a = pingpong(t, 2.6, 0.6, ease.linear), b = pingpong(t, 2.6, 0.6, ease.inOut);
        return lane(190, "Linear: even spacing") + track(190) + dots(190, ease.linear, C.muted) + Ci(lerp(130, 830, a), 190, 20, C.cream) +
          lane(340, "Ease in-out: tight at the ends, wide in the middle", C.teal) + track(340) + dots(340, ease.inOut, C.teal) + Ci(lerp(130, 830, b), 340, 20, C.acc);
      } },
    { dur: 9, title: "Timing", takeaway: "Short feels snappy. Long feels heavy.",
      caption: "Timing is how long the move takes. A quarter of a second feels snappy. Around two thirds of a second feels friendly. Over a second and a half feels heavy and slow. Same move, three personalities.",
      draw: (t) => [[0.25, "0.25 s  snappy", 175, C.gold], [0.7, "0.7 s  friendly", 275, C.teal], [1.6, "1.6 s  heavy", 375, C.acc]].map(([d, label, y, col]) => {
        const p = pingpong(t, d as number, 0.5, ease.inOut);
        return T(130, (y as number) - 30, 22, col as string, label as string, { w: "bold" }) + track(y as number) + Ci(lerp(130, 830, p), y as number, 20, col as string);
      }).join("") },
    { dur: 8, title: "Your turn", takeaway: "Small experiments beat big plans.",
      caption: "Here is your first experiment. Pick one simple move. Add easing. Try three different durations. Keep the one that feels right to you.",
      draw: (t) => ["1  Pick one simple move", "2  Add easing", "3  Try three durations", "4  Keep the one that feels right"].map((s, i) => {
        const p = ease.out(prog(t, 0.4 + i * 1.3, 0.6));
        return T(130 + (1 - p) * 40, 170 + i * 70, 40, i === 3 ? C.acc : C.cream, s, { w: "bold", op: p });
      }).join("") },
  ],
};

// ───────── 2. Keyframes
const KX = 600, KW = 300; // timeline x range for 0..2 seconds
function keyframeScene(lanes: number, showCurve: boolean, labelDiamonds: boolean): (t: number) => string {
  return (t) => {
    const tt = t % 3.4, sec = clamp(tt / 2) * 2; // playhead 0..2 s then rests
    const p = lanes >= 1 ? ease.inOut(prog(sec, 0, 1.2)) : 0;
    const sc = lanes >= 2 ? lerp(0.6, 1, ease.out(prog(sec, 0, 1.2))) : 1;
    const op = lanes >= 3 ? ease.out(prog(sec, 0, 0.6)) : 1;
    const size = 90 * sc, cx = lerp(110, 440, p), cy = 210;
    let s = R(40, 90, 480, 250, C.panel, { rx: 14 }) + T(60, 120, 18, C.muted, "STAGE") + R(cx - size / 2, cy - size / 2, size, size, C.acc, { rx: 14, op });
    s += R(560, 90, 360, 250, C.panel, { rx: 14 }) + T(580, 120, 18, C.muted, "TIMELINE (seconds)");
    [0, 1, 2].forEach((k) => { s += L(KX + (k * KW) / 2, 135, KX + (k * KW) / 2, 330, C.line, 1) + T(KX + (k * KW) / 2, 152, 16, C.muted, String(k), { a: "middle" }); });
    const names = ["Position", "Scale", "Opacity"], ys = [195, 255, 315], times = [[0, 1.2], [0, 1.2], [0, 0.6]];
    for (let i = 0; i < lanes; i++) {
      s += T(575, ys[i] - 16, 15, C.cream, names[i], { w: "bold" });
      const diamond = (sx: number, on: boolean) => on ? `<rect x="${sx - 9}" y="${ys[i] - 9}" width="18" height="18" fill="${C.gold}" transform="rotate(45 ${sx} ${ys[i]})"/>` : "";
      s += L(KX + 40, ys[i], KX + KW, ys[i], C.line, 2);
      s += diamond(KX, true) + diamond(KX + (times[i][1] * KW) / 2, sec >= 0.2 || lanes > 1 || i > 0 || !labelDiamonds ? true : false);
    }
    s += L(KX + (sec * KW) / 2, 135, KX + (sec * KW) / 2, 335, C.teal, 3);
    if (showCurve) {
      const ox = 80, oy = 400; s += T(ox, oy - 8, 16, C.muted, "Easing curve: slow start, fast middle, slow end");
      let d = ""; for (let i = 0; i <= 40; i++) d += `${i ? "L" : "M"}${ox + (i / 40) * 150},${oy + 60 - ease.inOut(i / 40) * 56} `;
      s += `<path d="${d}" stroke="${C.teal}" stroke-width="3" fill="none"/>` + Ci(ox + prog(sec, 0, 1.2) * 150, oy + 60 - p * 56, 6, C.acc);
    }
    return s;
  };
}
const v2: Video = {
  name: "keyframes-move-scale-fade",
  scenes: [
    { dur: 7, title: "What is a keyframe?", takeaway: "A keyframe saves a value at a moment.",
      caption: "A keyframe is a saved value at one moment in time. The yellow diamond says: at this moment, the square is here. Nothing moves until there are at least two.",
      draw: (t) => { const tt = t % 3.4; return keyframeScene(1, false, true)(tt < 0.01 ? 0 : 0) + T(60, 320, 20, C.gold, "Diamond = saved value", { w: "bold" }); } },
    { dur: 8, title: "Two keyframes make a move", takeaway: "The tool fills in everything between.",
      caption: "Add a second keyframe later in time and change the value. The tool animates everything in between for you. Two diamonds, one move.",
      draw: keyframeScene(1, false, false) },
    { dur: 8, title: "Stack scale and fade", takeaway: "Move + scale + fade = one smooth entrance.",
      caption: "Each property has its own row of keyframes. Scale up from a little smaller and fade in while it moves, and the entrance feels richer than a plain slide.",
      draw: keyframeScene(3, false, false) },
    { dur: 8, title: "Ease the diamonds", takeaway: "Right-click a keyframe and pick an easing.",
      caption: "By default most tools move at a constant speed. Choose an easing for the keyframes, usually ease in-out or ease out, and the curve bends so the motion starts and stops gently.",
      draw: keyframeScene(3, true, false) },
  ],
};

// ───────── 3. Animate words
const WORD = "FRESH";
const v3: Video = {
  name: "animate-words",
  scenes: [
    { dur: 7, title: "All at once", takeaway: "Everything at once feels flat.",
      caption: "Here the whole word fades in together. It works, but it feels flat, because nothing leads your eye.",
      draw: (t) => { const c = t % 3.2, op = c < 2.4 ? ease.out(prog(c, 0.3, 0.6)) : 1 - prog(c, 2.4, 0.5); return letters(WORD, W / 2, 290, 120, () => ({ op })); } },
    { dur: 10, title: "Stagger the letters", takeaway: "A tiny delay per letter creates rhythm.",
      caption: "Now each letter starts a fraction of a second after the one before it. This is called a stagger. Around 0.05 to 0.1 seconds per letter reads as a smooth wave.",
      draw: (t) => {
        const c = t % 3.6;
        const body = letters(WORD, W / 2, 280, 120, (i) => {
          const pin = ease.out(prog(c, 0.3 + i * 0.08, 0.5)), pout = ease.in(prog(c, 2.7 + i * 0.05, 0.4));
          return { dy: (1 - pin) * 70 + pout * -50, op: pin * (1 - pout) };
        });
        const bars = [...WORD].map((_, i) => R(330 + i * 60, 365, 44, 8 + 0, C.line) + R(330 + i * 60, 365, 44 * clamp((c - 0.3 - i * 0.08) / 0.5), 8, C.acc) + T(352 + i * 60, 398, 16, C.muted, `${(i * 0.08).toFixed(2)}s`, { a: "middle" })).join("");
        return body + bars;
      } },
    { dur: 8, title: "Reveal with a mask", takeaway: "A mask uncovers the word like a curtain.",
      caption: "Another option is a mask. The text sits still while a window slides open and uncovers it. Combine the mask with a small slide and the reveal feels crisp.",
      draw: (t) => {
        const c = t % 3.4, p = ease.inOut(prog(c, 0.3, 0.9)), out = ease.inOut(prog(c, 2.5, 0.6)), w = 480 * p, x0 = 240 + 480 * out;
        const id = `m${Math.floor(t * 10) % 2}`;
        return `<defs><clipPath id="${id}"><rect x="${x0}" y="180" width="${Math.max(0, w - 480 * out)}" height="150"/></clipPath></defs>` +
          `<g clip-path="url(#${id})">${letters(WORD, W / 2 - (1 - p) * 30, 290, 120, () => ({}))}</g>` + R(240, 340, 480, 4, C.line) + R(x0, 340, Math.max(0, w - 480 * out), 4, C.acc);
      } },
    { dur: 10, title: "Reading order and hold", takeaway: "Leave time to read before the next move.",
      caption: "When there is more than one word, bring them in the order people read. Then hold each line still for a moment. A good rule of thumb is about a quarter of a second per word, plus a beat, before it moves on.",
      draw: (t) => {
        const c = t % 7, words = ["FRESH", "EVERY", "MORNING"];
        return words.map((w, k) => {
          const s = 0.4 + k * 2.1, pin = ease.out(prog(c, s, 0.5)), pout = ease.in(prog(c, s + 1.6, 0.4));
          return letters(w, W / 2, 200 + k * 85, 64, (i) => ({ dy: (1 - ease.out(prog(c, s + i * 0.05, 0.4))) * 40, op: pin * (1 - pout) }));
        }).join("") + T(W / 2, 450, 22, C.muted, "hold = how long a line rests before it leaves", { a: "middle" });
      } },
  ],
};

// ───────── 4. Make it loop
const v4: Video = {
  name: "make-it-loop",
  scenes: [
    { dur: 8, title: "A loop has no start or end", takeaway: "The last frame leads back to the first.",
      caption: "A loop replays forever, so there is no real start or end. The last moment has to flow straight into the first one, like the dot going all the way around a circle.",
      draw: (t) => {
        const a = (t % 4) / 4 * Math.PI * 2;
        let s = "";
        for (let i = 0; i < 6; i++) { const ang = (i / 6) * Math.PI * 2, x = 130 + i * 130; s += R(x - 45, 160, 90, 90, C.panel, { rx: 10, stroke: i === 0 ? C.gold : C.line }) + Ci(x + Math.sin(ang) * 26, 205 - Math.cos(ang) * 26, 9, C.acc) + T(x, 275, 16, C.muted, `frame ${i + 1}`, { a: "middle" }); }
        s += T(W / 2, 330, 22, C.gold, "frame 7 = frame 1  →  it repeats", { a: "middle", w: "bold" });
        s += R(W / 2 - 60, 360, 120, 90, C.panel, { rx: 10 }) + Ci(W / 2 + Math.sin(a) * 28, 405 - Math.cos(a) * 28, 11, C.acc);
        return s;
      } },
    { dur: 9, title: "The seam", takeaway: "A jump at the seam breaks the spell.",
      caption: "The seam is the moment where the end meets the start. On the left the ball ends in a different place than it began, so it jumps. On the right it ends exactly where it started, so you cannot see the join.",
      draw: (t) => {
        const c = t % 2.4, p = c / 2.4;
        const left = lerp(80, 420, ease.inOut(p)), right = lerp(540, 880, (1 - Math.cos(p * Math.PI * 2)) / 2);
        const seam = c < 0.12 ? 1 - c / 0.12 : 0;
        return R(40, 130, 430, 230, C.panel, { rx: 14 }) + R(500, 130, 430, 230, C.panel, { rx: 14 }) +
          T(60, 160, 20, C.red, "Jump: last frame ≠ first frame", { w: "bold" }) + Ci(left, 250, 22, C.acc) + R(40, 130, 430, 230, C.red, { rx: 14, op: seam * 0.35 }) +
          T(520, 160, 20, C.teal, "Smooth: last frame = first frame", { w: "bold" }) + Ci(right, 250, 22, C.acc);
      } },
    { dur: 8, title: "Match the end to the start", takeaway: "Copy the first keyframe to the end.",
      caption: "The easiest fix is to copy the very first keyframe and paste it at the end of the timeline. Same values at both ends means the loop closes perfectly.",
      draw: (t) => {
        const c = t % 4, copy = ease.out(prog(c, 1.2, 1.0));
        let s = R(100, 150, 760, 200, C.panel, { rx: 14 }) + L(160, 250, 800, 250, C.line, 3);
        const dia = (x: number, col: string, op = 1) => `<rect x="${x - 12}" y="238" width="24" height="24" fill="${col}" opacity="${op}" transform="rotate(45 ${x} 250)"/>`;
        s += dia(160, C.gold) + T(160, 300, 18, C.muted, "start: x = 0", { a: "start" });
        s += dia(lerp(160, 800, copy), C.gold, copy > 0 ? 1 : 0) + (copy > 0.95 ? T(800, 300, 18, C.teal, "end: x = 0 (same!)", { a: "end", w: "bold" }) : "");
        s += T(W / 2, 205, 22, C.cream, "Duplicate the first keyframe, drop it at the end", { a: "middle", w: "bold" });
        return s;
      } },
    { dur: 8, title: "Overlap to hide the join", takeaway: "Let one thing leave as the next arrives.",
      caption: "For text, let the old word begin leaving while the new word is already arriving. That overlap hides the handover, so your eye never sees a gap.",
      draw: (t) => {
        const c = t % 4, a = ease.inOut(prog(c, 1.0, 0.9)), b = ease.inOut(prog(c, 1.5, 0.9));
        return letters("FRESH", W / 2, 260, 100, () => ({ dx: -a * 340, op: 1 - a })) + letters("EVERY", W / 2, 260, 100, () => ({ dx: (1 - b) * 340, op: b })) + T(W / 2, 400, 22, C.muted, "overlap ≈ 0.3 s", { a: "middle" });
      } },
  ],
};

// ───────── 5. Polish and export
const v5: Video = {
  name: "polish-and-export",
  scenes: [
    { dur: 8, title: "Cut what you do not need", takeaway: "Less on screen reads better.",
      caption: "Polish starts by removing things. Every extra shape or effect competes with your words. Take away what does not help the message and the animation instantly looks more confident.",
      draw: (t) => {
        const c = t % 5, fade = (k: number) => 1 - ease.out(prog(c, 1 + k * 0.45, 0.4));
        const junk = [[160, 160, 50, C.gold], [760, 200, 40, C.teal], [230, 360, 36, C.red], [700, 380, 56, C.gold], [450, 140, 28, C.teal], [880, 330, 30, C.red]];
        return junk.map(([x, y, r, col], k) => Ci(x as number, y as number, r as number, col as string, 0.8 * fade(k))).join("") + letters("FRESH", W / 2, 290, 120, () => ({}));
      } },
    { dur: 9, title: "Hold so it can be read", takeaway: "Give every line time to land.",
      caption: "Let each line rest long enough to read. For short text a quarter of a second per word plus a short beat is a good starting point. If you have to hurry to read it, it is too fast.",
      draw: (t) => {
        const c = t % 5, p = ease.out(prog(c, 0.2, 0.5)), hold = clamp((c - 0.7) / 2.2);
        return letters("EVERY MORNING", W / 2, 260, 64, () => ({ op: p })) + R(260, 330, 440, 14, C.panel, { rx: 7 }) + R(260, 330, 440 * hold, 14, C.acc, { rx: 7 }) + T(W / 2, 380, 22, C.muted, "hold ≈ 2 words × 0.25 s + a beat ≈ 1 s", { a: "middle" });
      } },
    { dur: 8, title: "Check it small", takeaway: "If it works tiny, it works everywhere.",
      caption: "Shrink your animation down to thumbnail size. If you can still read the words and see the motion, it will hold up on a phone. If it turns to mush, make the text bigger and bolder.",
      draw: (t) => {
        const c = t % 5, s = lerp(1, 0.28, ease.inOut(prog(c, 0.8, 1.4))), w = 520 * s, h = 300 * s;
        return R(W / 2 - w / 2, 270 - h / 2, w, h, C.panel, { rx: 14 * s, stroke: C.line }) + letters("FRESH", W / 2, 270 + 28 * s, 110 * s, () => ({ fill: C.cream }));
      } },
    { dur: 10, title: "Export checklist", takeaway: "Export once, then watch it on your phone.",
      caption: "Before you export, check the basics. Square format at 1080 by 1080. Thirty frames per second. MP4 under 8 megabytes. Loop it a few times to be sure the seam is invisible. Then watch it on your phone.",
      draw: (t) => ["1080 × 1080 (square)", "30 frames per second", "MP4, under 8 MB", "Loops with no visible jump", "Watched once on a phone"].map((s, i) => {
        const p = ease.out(prog(t, 0.4 + i * 1.6, 0.4));
        return Ci(150, 180 + i * 62 - 8, 16, p > 0.5 ? C.teal : C.line) + (p > 0.5 ? T(150, 180 + i * 62 - 1, 22, C.bg, "✓", { a: "middle", w: "bold" }) : "") + T(190, 180 + i * 62, 34, p > 0.2 ? C.cream : C.muted, s, { w: "bold", op: 0.4 + 0.6 * p });
      }).join("") },
  ],
};

// ───────── 6. The finished loop (outcome showcase; t=0 and t=10 are the same picture)
const v6: Video = {
  name: "kinetic-type-loop-example",
  posterAt: 5.2, // EVERY is fully in and readable
  scenes: [
    { dur: 10, title: "What you will make", takeaway: "10 seconds. One loop. Free tools.",
      caption: "This is the kind of piece you will make: a ten second loop of moving words. Each word staggers in, rests long enough to read, and leaves. Then it begins again with no visible join.",
      draw: (t) => {
        const pulse = 1 + 0.06 * Math.sin((t / 10) * Math.PI * 2);
        const words: [string, number][] = [["FRESH", 0.3], ["EVERY", 3.3], ["MORNING", 6.3]];
        let s = Ci(W / 2, 270, 170 * pulse, C.acc, 0.16) + Ci(W / 2, 270, 110 * pulse, C.acc, 0.22);
        for (const [w, st] of words) {
          s += letters(w, W / 2, 292, w.length > 6 ? 96 : 118, (i) => {
            const pin = ease.out(prog(t, st + i * 0.07, 0.5)), pout = ease.in(prog(t, st + 2.6 + i * 0.04, 0.45));
            return { dy: (1 - pin) * 70 - pout * 60, op: pin * (1 - pout), fill: i % 2 ? C.cream : C.gold };
          });
        }
        return s;
      } },
  ],
};

export const VIDEOS: Video[] = [v1, v2, v3, v4, v5, v6];
