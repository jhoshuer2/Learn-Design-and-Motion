// States never rely on colour alone: every state has a text label and a glyph.
const STATES = {
  locked: { label: "Locked", glyph: "🔒", cls: "text-ink-3" },
  available: { label: "Ready", glyph: "○", cls: "text-accent" },
  todo: { label: "To do", glyph: "○", cls: "text-ink-3" },
  active: { label: "In progress", glyph: "●", cls: "text-accent" },
  completed: { label: "Completed", glyph: "✓", cls: "text-success" },
  failed: { label: "Needs work", glyph: "!", cls: "text-danger" },
  awaiting: { label: "Awaiting evaluation", glyph: "…", cls: "text-warn" },
} as const;

export type NodeState = keyof typeof STATES;

export function StateBadge({ state }: { state: NodeState }) {
  const s = STATES[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-paper-2 px-3 py-1 text-xs font-semibold ${s.cls}`}>
      <span aria-hidden>{s.glyph}</span>
      {s.label}
    </span>
  );
}
