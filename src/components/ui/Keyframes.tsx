/**
 * Progress as a row of dots joined by a hairline. Done = filled ink, current = accent ring, next = hairline circle.
 * Shape and fill carry the state, so colour is never the only cue. Decorative overview of a list also given as text.
 */
export type KeyframeState = "done" | "current" | "next" | "locked";

const dot: Record<KeyframeState, string> = {
  done: "bg-ink border-ink",
  current: "bg-card border-accent ring-4 ring-accent-soft",
  next: "bg-card border-line",
  locked: "bg-paper-2 border-line",
};

export function KeyframeTrack({ items, showLabels = false }: { items: { state: KeyframeState; label: string; pin?: boolean }[]; showLabels?: boolean }) {
  const lastDone = items.map((i) => i.state).lastIndexOf("done");
  const pct = items.length > 1 && lastDone > 0 ? (lastDone / (items.length - 1)) * 100 : 0;
  return (
    <div aria-hidden className={`relative mt-4 flex items-center justify-between px-1 ${showLabels ? "pb-7" : ""}`}>
      <span className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-line" />
      <span className="absolute left-2 top-1/2 h-px -translate-y-1/2 bg-ink transition-[width] duration-700 [transition-timing-function:var(--ease)]" style={{ width: `calc((100% - 1rem) * ${pct / 100})` }} />
      {items.map((it, i) => (
        <span key={i} title={it.label} className="relative z-10 flex flex-col items-center">
          <span className={`block h-3.5 w-3.5 rounded-full border-2 ${dot[it.state]}`} />
          {showLabels && <span className="absolute top-6 whitespace-nowrap text-xs text-ink-3">{it.label}</span>}
        </span>
      ))}
    </div>
  );
}

/** Lesson progress as dots. Keeps progressbar semantics. */
export function KeyframeProgress({ total, current, label = "Lesson progress" }: { total: number; current: number; label?: string }) {
  const items = Array.from({ length: total }, (_, i): { state: KeyframeState; label: string } => ({ state: i < current ? "done" : i === current ? "current" : "next", label: `Step ${i + 1}` }));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={current + 1}>
      <KeyframeTrack items={items} />
    </div>
  );
}
