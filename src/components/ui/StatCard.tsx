const TONES = {
  surface: "surface-card",
  butter: "bg-[#f2c96b] text-[#2a1f00]",
  sage: "bg-[#1f3d2b] text-[#f7efe3]",
  terra: "bg-[#c2410c] text-[#fff7ed]",
} as const;

/** A colour-blocked tile with a huge serif numeral and a tiny label. TRUE values only: callers pass real numbers from the content. */
export function StatCard({ value, label, tone = "surface" }: { value: string; label: string; tone?: keyof typeof TONES }) {
  return (
    <div className={`rounded-window p-7 ${TONES[tone]}`}>
      <p className="display text-7xl leading-none tabular-nums">{value}</p>
      <p className="mt-4 text-[0.9375rem]">{label}</p>
    </div>
  );
}
