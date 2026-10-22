import { hexContrast } from "@/lib/contrast";

// Fixed colours on purpose: the colours and shapes ARE the lesson. All artwork is original and uses an invented business.
const Tag = ({ children }: { children: React.ReactNode }) => <p className="mb-2 text-xs font-medium text-muted">{children}</p>;
const Pair = ({ children }: { children: React.ReactNode }) => <div className="grid gap-4 sm:grid-cols-2">{children}</div>;

/** A small invented mark: a leaf-like shape. Drawn in SVG so it scales exactly. */
const Mark = ({ size, fill }: { size: number; fill: string }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden><path d="M6 34C6 16 16 6 34 6c0 18-10 28-28 28z" fill={fill} /><path d="M6 34L24 16" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" /></svg>
);

export function PositionCompare() {
  return (
    <Pair>
      <div><Tag>Warm and everyday</Tag>
        <div className="rounded-lg p-5" style={{ background: "#fbeedd", color: "#3b2514" }}>
          <div className="flex items-center gap-3"><Mark size={34} fill="#c8561e" /><span className="text-2xl font-bold" style={{ fontFamily: "ui-rounded, 'Trebuchet MS', sans-serif" }}>Fernhill Bakery</span></div>
          <p className="mt-3 text-base" style={{ fontFamily: "ui-rounded, 'Trebuchet MS', sans-serif" }}>Fresh sourdough, pastries and coffee. Come in, we saved you a seat.</p>
          <span className="mt-4 inline-block rounded-full px-5 py-2 text-sm font-semibold" style={{ background: "#c8561e", color: "#fff" }}>See today&rsquo;s bakes</span>
        </div></div>
      <div><Tag>Quiet and premium</Tag>
        <div className="p-5" style={{ background: "#f3f3f1", color: "#161616" }}>
          <div className="flex items-center gap-3"><Mark size={26} fill="#161616" /><span className="text-sm uppercase" style={{ letterSpacing: "0.32em", fontFamily: "Georgia, serif" }}>Fernhill</span></div>
          <p className="mt-6 text-sm" style={{ fontFamily: "Georgia, serif", color: "#3a3a3a" }}>Sourdough, pastry and coffee, made slowly.</p>
          <span className="mt-6 inline-block border-b pb-0.5 text-xs uppercase" style={{ letterSpacing: "0.2em", borderColor: "#161616" }}>Menu</span>
        </div></div>
    </Pair>
  );
}

export function LogoClearspace() {
  const Wordmark = ({ s = 1 }: { s?: number }) => (
    <span className="inline-flex items-center gap-2" style={{ color: "#2b1d12" }}>
      <Mark size={28 * s} fill="#c8561e" /><span className="font-bold" style={{ fontSize: 22 * s, fontFamily: "ui-rounded, 'Trebuchet MS', sans-serif" }}>Fernhill</span>
    </span>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div><Tag>With clearspace (dashed box = one capital height on every side)</Tag>
        <div className="rounded p-5" style={{ background: "#fbf6ee" }}><div className="inline-block p-[22px]" style={{ border: "1.5px dashed #c8561e" }}><Wordmark /></div></div></div>
      <div><Tag>Crowded: other elements touch the logo</Tag>
        <div className="relative rounded p-2" style={{ background: "#fbf6ee" }}>
          <p className="text-[11px] font-semibold" style={{ color: "#2b1d12" }}>OPEN 7 DAYS · FRESH BREAD · LOCAL</p>
          <div className="my-0.5"><Wordmark /></div>
          <p className="text-[11px] font-semibold" style={{ color: "#2b1d12" }}>Sourdough · Pastries · Coffee</p>
        </div></div>
      <div><Tag>Too small: the mark closes up and the name blurs</Tag>
        <div className="flex h-[92px] items-center rounded p-5" style={{ background: "#fbf6ee" }}><span className="inline-flex items-center gap-0.5" style={{ color: "#2b1d12" }}><Mark size={8} fill="#c8561e" /><span style={{ fontSize: 6, fontWeight: 700 }}>Fernhill</span></span></div></div>
    </div>
  );
}

export function LockupMisuse() {
  const Name = ({ c = "#2b1d12", stretch = 1 }: { c?: string; stretch?: number }) => (
    <span className="inline-flex origin-left items-center gap-2" style={{ color: c, transform: `scaleX(${stretch})` }}>
      <Mark size={28} fill={c === "#2b1d12" ? "#c8561e" : c} /><span className="text-xl font-bold" style={{ fontFamily: "ui-rounded, 'Trebuchet MS', sans-serif" }}>Fernhill</span>
    </span>
  );
  const Cell = ({ label, ok, children, bg }: { label: string; ok?: boolean; children: React.ReactNode; bg: string }) => (
    <div><Tag>{ok ? "✓ " : "✗ "}{label}</Tag><div className="flex h-24 items-center overflow-hidden rounded p-4" style={{ background: bg }}>{children}</div></div>
  );
  const busy = "repeating-linear-gradient(45deg,#e8a15a 0 10px,#7aa86b 10px 20px,#d9d0f0 20px 30px)";
  return (
    <div className="grid gap-4 sm:grid-cols-4">
      <Cell label="Correct: proportions, clear ground" ok bg="#fbf6ee"><Name /></Cell>
      <Cell label="Stretched out of proportion" bg="#fbf6ee"><Name stretch={1.5} /></Cell>
      <Cell label="Recoloured to low contrast" bg="#e8dccb"><Name c="#d3c3ac" /></Cell>
      <Cell label="On a busy pattern" bg={busy}><Name /></Cell>
    </div>
  );
}

const PALETTE = { neutral: "#fbf4e8", ink: "#2b1d12", support: "#8a5a2b", accent: "#c8561e", extra: "#2f6f6a" };

export function PaletteRoles() {
  const Card = ({ equal }: { equal: boolean }) => (
    <div className="overflow-hidden rounded" style={{ background: equal ? PALETTE.support : PALETTE.neutral, color: equal ? "#fff" : PALETTE.ink }}>
      <div className="p-4" style={{ background: equal ? PALETTE.extra : PALETTE.support, color: "#fff" }}><p className="text-lg font-bold">Saturday sourdough</p></div>
      <div className="p-4" style={{ background: equal ? PALETTE.accent : "transparent" }}>
        <p className="text-sm">Order by Friday and collect warm from 8am.</p>
        <span className="mt-3 inline-block rounded px-4 py-2 text-sm font-semibold" style={{ background: equal ? PALETTE.ink : PALETTE.accent, color: "#fff" }}>Reserve a loaf</span>
      </div>
    </div>
  );
  const pairs: [string, string, string][] = [["Ink on neutral", PALETTE.ink, PALETTE.neutral], ["White on support", "#ffffff", PALETTE.support], ["White on accent", "#ffffff", PALETTE.accent]];
  return (
    <div className="space-y-4">
      <Pair>
        <div><Tag>Equal weight: five colours, no lead</Tag><Card equal /></div>
        <div><Tag>Roles: neutral dominates, support frames, one accent</Tag><Card equal={false} /></div>
      </Pair>
      <div className="flex flex-wrap gap-3 text-xs">
        {pairs.map(([name, fg, bg]) => (
          <span key={name} className="inline-flex items-center gap-2 rounded border border-line px-2 py-1">
            <span className="inline-block h-4 w-4 rounded" style={{ background: bg, border: "1px solid #cfcab9" }} aria-hidden />
            {name}: {(hexContrast(fg, bg) ?? 0).toFixed(2)}:1
          </span>
        ))}
      </div>
    </div>
  );
}
