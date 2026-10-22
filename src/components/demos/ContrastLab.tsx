"use client";
import { useState } from "react";
import { hexContrast, wcagResults } from "@/lib/contrast";

export function ContrastLab() {
  const [fg, setFg] = useState("#767676");
  const [bg, setBg] = useState("#ffffff");
  const ratio = hexContrast(fg, bg);
  const r = ratio ? wcagResults(ratio) : null;
  const row = (label: string, ok: boolean) => (
    <li className="flex justify-between border-b border-line py-1.5 text-sm">
      <span>{label}</span><span>{ok ? "✓ Pass" : "✗ Fail"}</span>
    </li>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-3">
        {[["Text colour", fg, setFg], ["Background", bg, setBg]].map(([label, val, set]) => (
          <label key={label as string} className="block text-sm">
            {label as string}
            <input value={val as string} onChange={(e) => (set as (v: string) => void)(e.target.value)}
              aria-invalid={!hexContrast(val as string, "#000")}
              className="mt-1 block min-h-11 w-full rounded border border-line bg-raised px-3 font-mono" />
          </label>
        ))}
        <div className="rounded p-4" style={{ background: bg, color: fg }}>
          <p className="text-base">Normal text sample</p>
          <p className="text-2xl font-bold">Large text sample</p>
        </div>
      </div>
      <div aria-live="polite">
        <p className="font-display text-4xl">{ratio ? `${ratio.toFixed(2)}:1` : "Enter hex colours"}</p>
        {r && (
          <ul className="mt-3">
            {row("Normal text, AA (4.5:1)", r.aaText)}
            {row("Large text, AA (3:1)", r.aaLargeText)}
            {row("Normal text, AAA (7:1)", r.aaaText)}
            {row("UI components and icons (3:1)", r.nonText)}
          </ul>
        )}
      </div>
    </div>
  );
}
