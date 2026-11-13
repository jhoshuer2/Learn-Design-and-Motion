import ReactMarkdown from "react-markdown";
import { DEMO_TOKEN } from "@/lib/content/demos";
import { DEMOS } from "@/components/demos";
import type { DemoName } from "@/lib/content/demos";
import { parseMediaLine, type MediaPart } from "@/lib/content/media";
import { LessonVideo, WatchCard } from "@/components/Media";

/** Renders lesson markdown (no raw HTML). `<<demo:name|caption>>` lines become captioned figures. */
export function Prose({ body, mode = "read", transcripts = {} }: { body: string; mode?: "watch" | "read"; transcripts?: Record<string, string[]> }) {
  const parts: ({ md: string } | { demo: DemoName; caption: string } | { media: MediaPart })[] = [];
  let buf: string[] = [];
  const flush = () => { if (buf.join("").trim()) parts.push({ md: buf.join("\n") }); buf = []; };
  for (const line of body.split("\n")) {
    const media = parseMediaLine(line);
    if (media) { flush(); parts.push({ media }); continue; }
    const m = DEMO_TOKEN.exec(line.trim());
    if (m && m[1] in DEMOS) { flush(); parts.push({ demo: m[1] as DemoName, caption: m[2] }); }
    else buf.push(line);
  }
  flush();
  // Watch mode leads with the video and tucks the written version away; read mode does the opposite. Blocks without media are unchanged.
  const hasMedia = parts.some((p) => "media" in p);
  const text = parts.filter((p): p is { md: string } => "md" in p);
  if (hasMedia && mode === "watch") {
    return (
      <div className="space-y-5">
        {parts.filter((p) => "media" in p).map((p, i) => <MediaFigure key={i} media={(p as { media: MediaPart }).media} transcripts={transcripts} />)}
        {parts.filter((p) => "demo" in p).map((p, i) => <DemoFigure key={`d${i}`} p={p as { demo: DemoName; caption: string }} />)}
        {text.length > 0 && (
          <details className="rounded-card border border-line bg-raised p-4 shadow-card">
            <summary className="cursor-pointer font-medium">Read the written version</summary>
            <div className="mt-3 max-w-measure space-y-3 leading-relaxed">{text.map((t, i) => <ReactMarkdown key={i}>{t.md}</ReactMarkdown>)}</div>
          </details>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-5 [&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold [&_table]:w-full [&_td]:border [&_td]:border-line [&_td]:p-2 [&_th]:border [&_th]:border-line [&_th]:p-2 [&_th]:text-left">
      {parts.map((p, i) =>
        "md" in p ? (
          <div key={i} className="max-w-measure space-y-3 leading-relaxed"><ReactMarkdown>{p.md}</ReactMarkdown></div>
        ) : "media" in p ? (
          hasMedia && mode === "read"
            ? <details key={i} className="rounded-card border border-line bg-raised p-4 shadow-card"><summary className="cursor-pointer font-medium">Watch instead</summary><div className="mt-3"><MediaFigure media={p.media} transcripts={transcripts} /></div></details>
            : <MediaFigure key={i} media={p.media} transcripts={transcripts} />
        ) : (
          <DemoFigure key={i} p={p} />
        ),
      )}
    </div>
  );
}

function DemoFigure({ p }: { p: { demo: DemoName; caption: string } }) {
  return (
    <figure className="rounded-card border border-line bg-raised p-4 shadow-card">
      {DEMOS[p.demo]()}
      <figcaption className="mt-3 max-w-measure text-sm text-muted">{p.caption}</figcaption>
    </figure>
  );
}

function MediaFigure({ media, transcripts }: { media: MediaPart; transcripts: Record<string, string[]> }) {
  return media.type === "video"
    ? <LessonVideo name={media.name} caption={media.caption} transcript={transcripts[media.name] ?? []} />
    : <WatchCard id={media.id} title={media.title} why={media.why} />;
}
