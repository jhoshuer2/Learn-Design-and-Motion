import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type PillVariant = "primary" | "accent" | "secondary";

const V: Record<PillVariant, string> = { primary: "pill-ink", accent: "pill-accent", secondary: "pill-line" };

export function Arrow() {
  return (
    <svg className="arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: PillVariant };

/** The one pill. Use `primary` (ink) once per view; `accent` for the single most important action; `secondary` for the rest. */
export function Button({ variant = "primary", className = "", ...rest }: Props) {
  return <button className={`pill ${V[variant]} disabled:opacity-40 ${className}`} {...rest} />;
}

/** A link that looks like a pill (use instead of nesting a button in a link). */
export function PillLink({ href, variant = "primary", arrow = false, children, className = "" }: { href: string; variant?: PillVariant; arrow?: boolean; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={`pill ${V[variant]} ${className}`}>
      {children}
      {arrow && <Arrow />}
    </Link>
  );
}
