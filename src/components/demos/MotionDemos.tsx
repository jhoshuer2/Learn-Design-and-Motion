"use client";
import { useState } from "react";

// Fixed colours on purpose: the motion IS the lesson. With reduced motion the global rule stops animations, and every
// demo has a meaningful still state plus a control that does not depend on animation.
const PANEL = "#211c18", LINE = "#3a332b", CREAM = "#f6efe3", MUTED = "#b9b0a0", ACC = "#ff6b35", TEAL = "#3ac7b8", GOLD = "#f4c542";
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const out = (t: number) => 1 - Math.pow(1 - t, 3);
const Box = ({ children }: { children: React.ReactNode }) => <div className="rounded p-4" style={{ background: PANEL, color: CREAM }}>{children}</div>;

function Track({ label, color, timing, anim = "demo-slide", alt = true }: { label: string; color: string; timing: string; anim?: string; alt?: boolean }) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="mb-1 text-sm font-semibold" style={{ color }}>{label}</p>
      <div className="relative h-8 rounded" style={{ background: "#2b251f" }}>
        <span className="absolute top-1 block h-6 w-6 rounded-full" style={{ left: "4%", background: color, animation: `${anim} 2.4s ${timing} infinite${alt ? " alternate" : ""}` }} />
      </div>
    </div>
  );
}

export function EasingCompare() {
  return (
    <Box>
      <Track label="Linear: one constant speed" color={MUTED} timing="linear" />
      <Track label="Ease in-out: slow, fast, slow" color={ACC} timing="ease-in-out" />
      <Track label="Ease out with a little overshoot" color={TEAL} timing="cubic-bezier(.2,.8,.2,1.25)" />
    </Box>
  );
}

export function LoopSeam() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Box><p className="mb-2 text-sm font-semibold" style={{ color: "#ff6a5c" }}>Jumps: ends somewhere different from where it began</p>
        <div className="relative h-8 rounded" style={{ background: "#2b251f" }}>
          <span className="absolute top-1 block h-6 w-6 rounded-full" style={{ left: "4%", background: ACC, animation: "demo-slide-restart 2.4s ease-in-out infinite" }} />
        </div></Box>
      <Box><p className="mb-2 text-sm font-semibold" style={{ color: TEAL }}>Smooth: comes back to where it began</p>
        <div className="relative h-8 rounded" style={{ background: "#2b251f" }}>
          <span className="absolute top-1 block h-6 w-6 rounded-full" style={{ left: "4%", background: ACC, animation: "demo-slide 1.2s ease-in-out infinite alternate" }} />
        </div></Box>
    </div>
  );
}

export function KeyframeTimeline() {
  const [sec, setSec] = useState(0.6);
  const p = inOut(clamp(sec / 1.2)), sc = lerp(0.6, 1, out(clamp(sec / 1.2))), op = out(clamp(sec / 0.6));
  const rows: [string, number, string][] = [["Position", 1.2, "left to centre"], ["Scale", 1.2, "60% to 100%"], ["Opacity", 0.6, "0% to 100%"]];
  return (
    <Box>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="relative h-44 rounded" style={{ background: "#2b251f" }}>
          <span className="absolute block rounded-xl" style={{ background: ACC, width: 80 * sc, height: 80 * sc, left: `${lerp(8, 62, p)}%`, top: `calc(50% - ${40 * sc}px)`, opacity: op }} />
        </div>
        <div>
          {rows.map(([name, end, note], i) => (
            <div key={name} className="mb-3 last:mb-0">
              <p className="text-xs" style={{ color: MUTED }}>{name}: {note}</p>
              <div className="relative h-5">
                <div className="absolute inset-x-0 top-2.5 h-px" style={{ background: LINE }} />
                {[0, end].map((k) => <span key={k} aria-hidden className="absolute top-0.5 h-3.5 w-3.5 rotate-45" style={{ background: GOLD, left: `calc(${(k / 2) * 100}% - 7px)` }} />)}
                <div className="absolute top-0 h-5 w-0.5" style={{ background: TEAL, left: `${(sec / 2) * 100}%` }} />
                <span hidden={i > 0} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <label className="mt-4 block text-sm">Playhead: {sec.toFixed(2)} s
        <input type="range" min={0} max={2} step={0.05} value={sec} onChange={(e) => setSec(Number(e.target.value))} className="mt-1 block w-full min-h-11" />
      </label>
    </Box>
  );
}

export function StaggerReveal() {
  const [delay, setDelay] = useState(0.08);
  const [run, setRun] = useState(0);
  return (
    <Box>
      <div key={run} className="flex h-28 items-center justify-center font-mono text-6xl font-bold" aria-label="FRESH">
        {[..."FRESH"].map((ch, i) => <span key={i} aria-hidden style={{ color: i % 2 ? CREAM : GOLD, display: "inline-block", animation: "letter-in 0.6s ease-out both", animationDelay: `${(i * delay).toFixed(2)}s` }}>{ch}</span>)}
      </div>
      <label className="block text-sm">Delay between letters: {delay.toFixed(2)} s {delay === 0 ? "(all at once: flat)" : delay <= 0.12 ? "(a smooth wave)" : "(getting slow)"}
        <input type="range" min={0} max={0.4} step={0.02} value={delay} onChange={(e) => { setDelay(Number(e.target.value)); setRun((r) => r + 1); }} className="mt-1 block w-full min-h-11" />
      </label>
      <button type="button" onClick={() => setRun((r) => r + 1)} className="mt-3 min-h-11 rounded border px-4 text-sm font-semibold" style={{ borderColor: LINE, color: CREAM }}>Replay</button>
    </Box>
  );
}

export function SmallCheck() {
  const [size, setSize] = useState(100);
  return (
    <Box>
      <div className="flex h-52 items-center justify-center">
        <div className="flex items-center justify-center rounded-xl border" style={{ width: `${size * 2.6}px`, height: `${size * 1.5}px`, borderColor: LINE, background: "#2b251f" }}>
          <span className="font-mono font-bold" style={{ color: CREAM, fontSize: `${size * 0.4}px` }}>FRESH</span>
        </div>
      </div>
      <label className="block text-sm">Size: {size}% {size < 45 ? "(thumbnail: still readable?)" : ""}
        <input type="range" min={20} max={100} step={5} value={size} onChange={(e) => setSize(Number(e.target.value))} className="mt-1 block w-full min-h-11" />
      </label>
    </Box>
  );
}
