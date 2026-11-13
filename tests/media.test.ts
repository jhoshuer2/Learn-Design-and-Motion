import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadContent } from "../src/lib/content/loader";
import { blockHasMedia, parseMediaLine, vttToTranscript } from "../src/lib/content/media";
import { loadOutcome, loadOutcomes } from "../src/lib/content/outcomes";
import { Prose } from "../src/components/Prose";

const VIDEO = "<<video:easing-basics|A ball moving with and without easing, with captions.>>";
const WATCH = "<<watch:youtube|dQw4w9WgXcQ|Easing explained|Shows the same ease on a ball and on text, in under three minutes.>>";

/** A scratch copy of content/ with its own public/ so tests can add or remove media files. */
function scratch() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "cm-media-"));
  fs.cpSync(path.join(process.cwd(), "content"), path.join(base, "content"), { recursive: true });
  fs.cpSync(path.join(process.cwd(), "public", "lessons"), path.join(base, "public", "lessons"), { recursive: true });
  return { root: path.join(base, "content"), pub: path.join(base, "public", "lessons") };
}
const lessonFile = (root: string) => path.join(root, "graphic-design", "beginner", "visual-foundations", "contrast", fs.readdirSync(path.join(root, "graphic-design", "beginner", "visual-foundations", "contrast")).find((f) => f.endsWith(".mdx"))!);
function addLine(root: string, line: string) {
  const f = lessonFile(root);
  const s = fs.readFileSync(f, "utf8");
  fs.writeFileSync(f, s.replace(/(## \{concept\}[^\n]*\n)/, `$1${line}\n\n`));
}

describe("media lines", () => {
  it("parses our video and a curated watch link, and nothing else", () => {
    expect(parseMediaLine(VIDEO)).toEqual({ type: "video", name: "easing-basics", caption: "A ball moving with and without easing, with captions." });
    expect(parseMediaLine(WATCH)).toMatchObject({ type: "watch", id: "dQw4w9WgXcQ", title: "Easing explained" });
    expect(parseMediaLine("<<watch:youtube|short|T|why>>")).toBeNull(); // id must be 11 characters
    expect(parseMediaLine("<<watch:youtube|dQw4w9WgXcQ|Title only>>")).toBeNull(); // a reason is required
    expect(parseMediaLine("<<video:Bad Name|x>>")).toBeNull();
    expect(blockHasMedia(`text\n${VIDEO}`)).toBe(true);
    expect(blockHasMedia("just text")).toBe(false);
  });

  it("turns captions into a transcript", () => {
    expect(vttToTranscript("WEBVTT\n\n1\n00:00.000 --> 00:02.000\nHello there.\n\n2\n00:02.000 --> 00:04.000\nLet us begin.\n")).toEqual(["Hello there.", "Let us begin."]);
  });
});

describe("the loader and media", () => {
  it("requires both the video and its captions to exist", () => {
    const s = scratch();
    addLine(s.root, VIDEO);
    expect(() => loadContent(s.root)).toThrow(/needs public\/lessons\/easing-basics\.mp4/);
    fs.writeFileSync(path.join(s.pub, "easing-basics.mp4"), "x");
    expect(() => loadContent(s.root)).toThrow(/needs public\/lessons\/easing-basics\.vtt \(captions are required\)/);
    fs.writeFileSync(path.join(s.pub, "easing-basics.vtt"), "WEBVTT\n");
    expect(() => loadContent(s.root)).not.toThrow();
  });

  it("rejects a malformed media line instead of showing it as text", () => {
    const s = scratch();
    addLine(s.root, "<<watch:youtube|dQw4w9WgXcQ|Missing the reason>>");
    expect(() => loadContent(s.root)).toThrow(/malformed media line/);
  });
});

describe("outcomes", () => {
  const good = (o: Record<string, unknown> = {}) => ({
    slug: "kinetic-type-loop", title: "A 10-second kinetic type loop", promise: "Make a smooth, looping animation of moving words.", forWho: "Complete beginners",
    hours: 6, tools: ["CapCut"], skills: ["contrast-recognition"], path: "graphic-design", ...o,
  });
  function withOutcome(o: Record<string, unknown>, file = "kinetic-type-loop.yaml") {
    const s = scratch();
    fs.mkdirSync(path.join(s.root, "outcomes"), { recursive: true });
    fs.writeFileSync(path.join(s.root, "outcomes", file), JSON.stringify(o));
    return s.root;
  }

  it("loads, and a public page can read one by slug", () => {
    const root = withOutcome(good());
    expect(loadContent(root).outcomes.map((o) => o.slug)).toEqual(["kinetic-type-loop"]);
    expect(loadOutcome("kinetic-type-loop", root)?.title).toMatch(/kinetic type/);
    expect(loadOutcome("../etc/passwd", root)).toBeNull();
    expect(loadOutcome("nope", root)).toBeNull();
    expect(loadOutcomes(path.join(os.tmpdir(), "does-not-exist"))).toEqual([]);
  });

  it("rejects unknown skills, unknown paths, missing showcase files and a slug that does not match the file", () => {
    expect(() => loadContent(withOutcome(good({ skills: ["nonsense"] })))).toThrow(/unknown skill "nonsense"/);
    expect(() => loadContent(withOutcome(good({ path: "no-such-path" })))).toThrow(/no learning path "no-such-path"/);
    expect(() => loadContent(withOutcome(good({ showcase: "missing-clip" })))).toThrow(/showcase needs public\/lessons\/missing-clip\.mp4/);
    expect(() => loadContent(withOutcome(good(), "other-name.yaml"))).toThrow(/must match the file name/);
    expect(() => loadContent(withOutcome(good({ promise: "short" })))).toThrow();
  });
});

describe("Watch and Read modes", () => {
  const body = `Intro text that explains easing.\n\n${VIDEO}\n\nMore words.`;
  const html = (mode: "watch" | "read") => renderToStaticMarkup(createElement(Prose, { body, mode, transcripts: { "easing-basics": ["A ball slows down."] } }));

  it("watch mode leads with the video and tucks the text away", () => {
    const h = html("watch");
    expect(h.indexOf("<video")).toBeGreaterThan(-1);
    expect(h.indexOf("<video")).toBeLessThan(h.indexOf("Read the written version"));
    expect(h.indexOf("Read the written version")).toBeLessThan(h.indexOf("Intro text"));
    expect(h).toContain('kind="captions"');
    expect(h).toContain("A ball slows down.");
  });

  it("read mode shows the text first and offers the video instead", () => {
    const h = html("read");
    expect(h.indexOf("Intro text")).toBeLessThan(h.indexOf("Watch instead"));
    expect(h).toContain("<video");
  });

  it("leaves blocks without media exactly as they were in both modes", () => {
    const plain = "Just words.\n\nAnd more.";
    const a = renderToStaticMarkup(createElement(Prose, { body: plain, mode: "watch" }));
    const b = renderToStaticMarkup(createElement(Prose, { body: plain, mode: "read" }));
    expect(a).toBe(b);
    expect(a).not.toContain("<details");
  });

  it("shows a curated tutorial with why it is worth watching, loading the player only on request", () => {
    const h = renderToStaticMarkup(createElement(Prose, { body: WATCH, mode: "read" }));
    expect(h).toContain("Shows the same ease on a ball");
    expect(h).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(h).toContain("Open on YouTube");
  });
});
