import sharp from "sharp";
import type { Img } from "./types";

/** Synthetic artwork for calibration. Not learner data. */
export const svgPng = (w: number, h: number, body: string) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`)).png().toBuffer();

export async function img(slot: string, label: string, role: Img["role"], data: Buffer): Promise<Img> {
  const m = await sharp(data).metadata();
  return { slot, label, role, name: `${slot}.png`, width: m.width!, height: m.height!, mime: "image/png", data };
}

export const shrink = (data: Buffer, longEdge: number) =>
  sharp(data).resize({ width: longEdge, height: longEdge, fit: "inside" }).png().toBuffer();

/** An invented leaf mark. */
export const leaf = (x: number, y: number, s: number, fill: string) =>
  `<g transform="translate(${x} ${y}) scale(${s / 40})"><path d="M6 34C6 16 16 6 34 6c0 18-10 28-28 28z" fill="${fill}"/><path d="M6 34L24 16" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/></g>`;
