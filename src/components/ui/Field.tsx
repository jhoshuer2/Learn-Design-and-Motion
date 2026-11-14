import type { InputHTMLAttributes } from "react";

export function Field({ label, id, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="label !text-ink-2">{label}</label>
      <input id={id} name={id} className="min-h-12 rounded-input border border-line bg-card px-4 text-base outline-none transition focus:border-ink focus:shadow-[0_0_0_3px_var(--accent-soft)]" {...rest} />
    </div>
  );
}
