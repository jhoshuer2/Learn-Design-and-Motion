/** A big numeral with a tiny label. Use TRUE values only. */
export function StatCard({ value, label, tone = "surface" }: { value: string; label: string; tone?: "surface" | "accent" }) {
  const base = "rounded-[20px] p-6 shadow-[var(--shadow-card)] border border-[var(--line)]";
  return (
    <div className={`${base} ${tone === "accent" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface)]"}`}>
      <p className="display text-6xl tabular-nums">{value}</p>
      <p className="mt-2 text-sm opacity-80">{label}</p>
    </div>
  );
}
