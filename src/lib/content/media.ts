/**
 * Media lines a lesson block may contain, one per line:
 *   <<video:name|caption>>                      our own explainer: public/lessons/<name>.mp4 + <name>.vtt (captions)
 *   <<watch:youtube|<11-char id>|title|why>>    a curated outside tutorial, always with why it is worth watching
 */
export const VIDEO_TOKEN = /^<<video:([a-z0-9]+(?:-[a-z0-9]+)*)\|(.+)>>$/;
export const WATCH_TOKEN = /^<<watch:youtube\|([A-Za-z0-9_-]{11})\|([^|]+)\|(.+)>>$/;

export type MediaPart =
  | { type: "video"; name: string; caption: string }
  | { type: "watch"; id: string; title: string; why: string };

export function parseMediaLine(line: string): MediaPart | null {
  const t = line.trim();
  const v = VIDEO_TOKEN.exec(t);
  if (v) return { type: "video", name: v[1], caption: v[2].trim() };
  const w = WATCH_TOKEN.exec(t);
  if (w) return { type: "watch", id: w[1], title: w[2].trim(), why: w[3].trim() };
  return null;
}

export const isMediaLine = (line: string) => /^<<(video|watch):/.test(line.trim());
export const blockHasMedia = (body: string) => body.split("\n").some((l) => parseMediaLine(l) !== null);

/** Caption cue text only, as a readable transcript. */
export function vttToTranscript(vtt: string): string[] {
  return vtt.split(/\r?\n\r?\n/).map((cue) => cue.split(/\r?\n/).filter((l) => l && !l.includes("-->") && !/^\d+$/.test(l) && l !== "WEBVTT").join(" ").trim()).filter(Boolean);
}
