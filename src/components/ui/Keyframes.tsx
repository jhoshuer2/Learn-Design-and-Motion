/**
 * The platform's signature: a path drawn as a timeline. Diamonds are keyframes (steps), the magenta pin is the playhead
 * (where you are). Shape and fill carry the state, and the pin is a triangle, so colour is never the only cue.
 */
export type KeyframeState = "done" | "current" | "next" | "locked";

const diamond: Record<KeyframeState, string> = {
  done: "bg-key border-ink",
  current: "bg-raised border-playhead scale-125",
  next: "bg-raised border-ink",
  locked: "bg-surface border-line",
};

function Diamond({ state, pin }: { state: KeyframeState; pin?: boolean }) {
  return (
    <span className="relative grid h-6 w-6 place-items-center">
      {(state === "current" || pin) && <span className="playhead-settle absolute -top-3 h-0 w-0 border-x-[5px] border-t-[8px] border-x-transparent border-t-playhead" />}
      <span className={`block h-3.5 w-3.5 rotate-45 border-2 transition-transform ${diamond[state]}`} />
    </span>
  );
}

/** Decorative overview of a list that is also given in full as text, so it is hidden from assistive technology. */
export function KeyframeTrack({ items, showLabels = false }: { items: { state: KeyframeState; label: string; pin?: boolean }[]; showLabels?: boolean }) {
  // The coloured line runs up to the last finished keyframe, wherever it sits (a week can have gaps).
  const lastDone = items.map((i) => i.state).lastIndexOf("done");
  const pct = items.length > 1 && lastDone > 0 ? (lastDone / (items.length - 1)) * 100 : 0;
  return (
    <div aria-hidden className={`relative mt-5 flex items-center justify-between px-1.5 pt-3 ${showLabels ? "pb-6" : ""}`}>
      <span className="absolute inset-x-3 top-[calc(50%+6px)] h-0.5 bg-line" />
      <span className="absolute left-3 top-[calc(50%+6px)] h-0.5 bg-playhead" style={{ width: `calc((100% - 1.5rem) * ${pct / 100})` }} />
      {items.map((it, i) => (
        <span key={i} title={it.label} className="relative z-10 flex flex-col items-center">
          <Diamond state={it.state} pin={it.pin} />
          {showLabels && <span className="absolute top-7 text-xs text-muted">{it.label}</span>}
        </span>
      ))}
    </div>
  );
}

/** Lesson progress as keyframes. Keeps the progressbar semantics the old bar had. */
export function KeyframeProgress({ total, current, label = "Lesson progress" }: { total: number; current: number; label?: string }) {
  const items = Array.from({ length: total }, (_, i): { state: KeyframeState; label: string } => ({ state: i < current ? "done" : i === current ? "current" : "next", label: `Step ${i + 1}` }));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={current + 1}>
      <KeyframeTrack items={items} />
    </div>
  );
}
