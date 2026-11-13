import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

/** Tiny frame-by-frame renderer: scenes draw SVG for a time `t`, frames go to ffmpeg, captions go to WebVTT. Silent videos; the captions carry the explanation. */
export const W = 960, H = 540, FPS = 30;
export const C = { bg: "#14110f", panel: "#211c18", line: "#3a332b", cream: "#f6efe3", muted: "#b9b0a0", acc: "#ff6b35", teal: "#3ac7b8", gold: "#f4c542", red: "#ff6a5c" };

export const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = {
  linear: (t: number) => t,
  in: (t: number) => t * t * t,
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
/** 0..1 progress of an animation that starts at `start` and lasts `dur` seconds. */
export const prog = (t: number, start: number, dur: number) => clamp((t - start) / dur);
/** Back and forth: move for `move` seconds, rest `hold` seconds, return, rest. Returns 0..1. */
export function pingpong(t: number, move: number, hold: number, fn: (x: number) => number) {
  const p = move + hold, t2 = t % (2 * p);
  if (t2 < move) return fn(t2 / move);
  if (t2 < p) return 1;
  if (t2 < p + move) return 1 - fn((t2 - p) / move);
  return 0;
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function T(x: number, y: number, size: number, fill: string, s: string, o: { w?: string; a?: "start" | "middle" | "end"; f?: string; op?: number; ls?: number } = {}) {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${o.f ?? "Arial, Helvetica, sans-serif"}" font-size="${size}" font-weight="${o.w ?? "normal"}" fill="${fill}" text-anchor="${o.a ?? "start"}" opacity="${(o.op ?? 1).toFixed(3)}"${o.ls ? ` letter-spacing="${o.ls}"` : ""}>${esc(s)}</text>`;
}
export const R = (x: number, y: number, w: number, h: number, fill: string, o: { rx?: number; op?: number; stroke?: string; sw?: number } = {}) =>
  `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0, w).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="${o.rx ?? 0}" fill="${fill}" opacity="${(o.op ?? 1).toFixed(3)}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw ?? 2}"` : ""}/>`;
export const Ci = (cx: number, cy: number, r: number, fill: string, op = 1) => `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${fill}" opacity="${op.toFixed(3)}"/>`;
export const L = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw = 2, dash?: string) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;

export type Scene = { dur: number; title: string; takeaway: string; caption: string; draw: (t: number) => string };
export type Video = { name: string; scenes: Scene[] };

const stamp = (s: number) => { const ms = Math.round(s * 1000); const p = (n: number, l = 2) => String(n).padStart(l, "0"); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`; };

/** One cue per sentence, spread over the scene in proportion to length, so captions never sit on screen for ten seconds. */
export function vtt(video: Video) {
  let at = 0; const out = ["WEBVTT", ""]; let n = 1;
  for (const sc of video.scenes) {
    const sentences = sc.caption.match(/[^.!?]+[.!?]+/g)?.map((x) => x.trim()) ?? [sc.caption];
    const total = sentences.reduce((a, s) => a + s.length, 0); let cur = at;
    for (const s of sentences) { const d = (s.length / total) * sc.dur; out.push(String(n++), `${stamp(cur)} --> ${stamp(cur + d)}`, s, ""); cur += d; }
    at += sc.dur;
  }
  return out.join("\n");
}

export function frameSvg(sc: Scene, t: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${R(0, 0, W, H, C.bg)}${sc.draw(t)}${T(40, 52, 22, C.acc, sc.title.toUpperCase(), { w: "bold", ls: 2 })}${T(40, H - 36, 30, C.cream, sc.takeaway, { w: "bold" })}</svg>`;
}

export async function render(video: Video, outDir: string) {
  fs.mkdirSync(outDir, { recursive: true });
  const mp4 = path.join(outDir, `${video.name}.mp4`);
  const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
  let err = ""; ff.stderr.on("data", (d) => (err += d));
  const done = new Promise<void>((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg ${c}: ${err}`)))));
  let posterDone = false; let at = 0;
  for (const sc of video.scenes) {
    const frames = Math.round(sc.dur * FPS);
    for (let i = 0; i < frames; i++) {
      const t = i / FPS;
      const png = await sharp(Buffer.from(frameSvg(sc, t))).png({ compressionLevel: 1 }).toBuffer();
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
      if (!posterDone && at + t >= Math.min(3.5, video.scenes[0].dur * 0.7)) {
        await sharp(Buffer.from(frameSvg(sc, t))).jpeg({ quality: 82 }).toFile(path.join(outDir, `${video.name}.jpg`)); posterDone = true;
      }
    }
    at += sc.dur;
  }
  ff.stdin.end(); await done;
  fs.writeFileSync(path.join(outDir, `${video.name}.vtt`), vtt(video));
  const total = video.scenes.reduce((a, s) => a + s.dur, 0);
  return { name: video.name, seconds: total, kb: Math.round(fs.statSync(mp4).size / 1024) };
}
