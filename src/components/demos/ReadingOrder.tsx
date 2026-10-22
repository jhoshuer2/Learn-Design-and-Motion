"use client";
import { useState } from "react";

/** The same landing-page layout twice: flat emphasis vs contrast-directed emphasis. */
export function ReadingOrder() {
  const [directed, setDirected] = useState(false);
  const c = directed
    ? { head: "#16140f", sub: "#5b564b", cta: "#1a2fb8", ctaText: "#fff", nav: "#8a8676", card: "#ffffff" }
    : { head: "#6b675a", sub: "#6b675a", cta: "#e6e3d8", ctaText: "#6b675a", nav: "#6b675a", card: "#f1efe8" };
  return (
    <div>
      <button type="button" aria-pressed={directed} onClick={() => setDirected((d) => !d)}
        className="mb-3 min-h-11 rounded border border-line bg-raised px-4 text-sm">
        {directed ? "Showing: contrast-directed" : "Showing: flat emphasis"} (toggle)
      </button>
      <div className="rounded p-5" style={{ background: "#f7f4ee" }}>
        <p className="text-xs" style={{ color: c.nav }}>Product · Pricing · Docs · Sign in</p>
        <h4 className="mt-6 font-display text-3xl font-semibold" style={{ color: c.head }}>Plan projects without the noise</h4>
        <p className="mt-2 text-sm" style={{ color: c.sub }}>One calm place for tasks, timelines and decisions.</p>
        <span className="mt-4 inline-block rounded px-5 py-2.5 text-sm font-semibold" style={{ background: c.cta, color: c.ctaText }}>Start free</span>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {["Tasks", "Timeline", "Decisions"].map((t) => (
            <div key={t} className="rounded p-3 text-xs" style={{ background: c.card, color: c.sub }}>{t}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
