// States never rely on colour alone: every state has a text label and a glyph.
const STATES = {
  locked: { label: "Locked", glyph: "🔒", cls: "text-muted border-line" },
  available: { label: "Ready", glyph: "○", cls: "text-accent border-line" },
  active: { label: "In progress", glyph: "●", cls: "text-accent border-accent" },
  completed: { label: "Completed", glyph: "✓", cls: "text-success border-success" },
  failed: { label: "Needs work", glyph: "!", cls: "text-danger border-danger" },
  awaiting: { label: "Awaiting evaluation", glyph: "…", cls: "text-warn border-warn" },
} as const;

export type NodeState = keyof typeof STATES;

export function StateBadge({ state }: { state: NodeState }) {
  const s = STATES[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${s.cls}`}>
      <span aria-hidden>{s.glyph}</span>
      {s.label}
    </span>
  );
}
