/* eslint-disable @next/next/no-img-element */
/** Pip, the learning buddy: a small round copper robot with an amber lens and a leaf sprout. Decorative unless given a label. */
export function Pip({ size = 96, label, className = "" }: { size?: number; label?: string; className?: string }) {
  return <img src="/art/pip.webp" width={Math.round(size * 0.71)} height={size} alt={label ?? ""} className={`pip-blink select-none object-contain ${className}`} style={{ height: size, width: "auto" }} />;
}

/** Pip with a speech card. The buddy's voice: warm, specific, never judging. Keep to about 25 words. */
export function PipSays({ children, size = 88 }: { children: React.ReactNode; size?: number }) {
  return (
    <div className="flex items-end gap-3">
      <Pip size={size} />
      <div className="surface-card relative max-w-prose px-5 py-4 text-[0.9375rem] text-ink-2 before:absolute before:-left-1.5 before:bottom-6 before:h-3 before:w-3 before:rotate-45 before:bg-card">{children}</div>
    </div>
  );
}
