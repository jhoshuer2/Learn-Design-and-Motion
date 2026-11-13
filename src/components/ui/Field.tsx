import type { InputHTMLAttributes } from "react";

export function Field({ label, id, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <input id={id} name={id} className="min-h-11 rounded-lg border-2 border-line bg-raised px-3 focus:border-accent" {...rest} />
    </div>
  );
}
