import ReactMarkdown from "react-markdown";
import { DEMO_TOKEN } from "@/lib/content/demos";
import { DEMOS } from "@/components/demos";
import type { DemoName } from "@/lib/content/demos";

/** Renders lesson markdown (no raw HTML). `<<demo:name|caption>>` lines become captioned figures. */
export function Prose({ body }: { body: string }) {
  const parts: ({ md: string } | { demo: DemoName; caption: string })[] = [];
  let buf: string[] = [];
  const flush = () => { if (buf.join("").trim()) parts.push({ md: buf.join("\n") }); buf = []; };
  for (const line of body.split("\n")) {
    const m = DEMO_TOKEN.exec(line.trim());
    if (m && m[1] in DEMOS) { flush(); parts.push({ demo: m[1] as DemoName, caption: m[2] }); }
    else buf.push(line);
  }
  flush();
  return (
    <div className="space-y-5 [&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold [&_table]:w-full [&_td]:border [&_td]:border-line [&_td]:p-2 [&_th]:border [&_th]:border-line [&_th]:p-2 [&_th]:text-left">
      {parts.map((p, i) =>
        "md" in p ? (
          <div key={i} className="max-w-measure space-y-3 leading-relaxed"><ReactMarkdown>{p.md}</ReactMarkdown></div>
        ) : (
          <figure key={i} className="rounded border border-line bg-raised p-4">
            {DEMOS[p.demo]()}
            <figcaption className="mt-3 max-w-measure text-sm text-muted">{p.caption}</figcaption>
          </figure>
        ),
      )}
    </div>
  );
}
