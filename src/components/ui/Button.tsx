import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" };

export function Button({ variant = "primary", className = "", ...rest }: Props) {
  const base =
    "inline-flex min-h-11 items-center justify-center rounded px-5 text-sm font-medium transition-colors";
  const styles =
    variant === "primary"
      ? "bg-accent text-accent-ink hover:opacity-90"
      : "border border-line bg-raised text-ink hover:border-ink";
  return <button className={`${base} ${styles} ${className}`} {...rest} />;
}
