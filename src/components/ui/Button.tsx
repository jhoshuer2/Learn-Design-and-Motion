import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" };

export function Button({ variant = "primary", className = "", ...rest }: Props) {
  const base =
    "inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-semibold transition duration-150 active:translate-y-px";
  const styles =
    variant === "primary"
      ? "bg-accent text-accent-ink hover:brightness-110"
      : "border-2 border-ink bg-transparent text-ink hover:bg-raised";
  return <button className={`${base} ${styles} ${className}`} {...rest} />;
}
