/** A big numeral with a small label. TRUE values only: callers pass real numbers from the content. */
export function StatCard({ value, label, tone = "surface" }: { value: string; label: string; tone?: "surface" | "accent" }) {
  return (
    <div className={`rounded-card border border-line p-6 shadow-card ${tone === "accent" ? "bg-accent text-accent-ink" : "bg-raised"}`}>
      <p className="font-display text-6xl tabular-nums">{value}</p>
      <p className="mt-2 text-sm opacity-80">{label}</p>
    </div>
  );
}
