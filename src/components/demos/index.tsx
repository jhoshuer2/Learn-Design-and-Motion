import { hexContrast } from "@/lib/contrast";
import type { DemoName } from "@/lib/content/demos";
import { ContrastLab } from "./ContrastLab";
import { ReadingOrder } from "./ReadingOrder";
import { GridAlignment, LineLengthLeading, TypePairing } from "./TypographyDemos";
import { FormStates, SpacingRhythm, TouchTargets } from "./UiDemos";
import { FeedbackStates, FormLayout, NavPatterns } from "./FormDemos";
import { ImageTreatment, LayoutTemplate, VoiceCompare } from "./BrandLayoutDemos";
import { LockupMisuse, LogoClearspace, PaletteRoles, PositionCompare } from "./BrandDemos";

// Demo artwork uses fixed colours on purpose: the colours ARE the lesson, so they must not follow the theme.
const Panel = ({ bg, children, className = "" }: { bg: string; children: React.ReactNode; className?: string }) => (
  <div className={`rounded p-4 ${className}`} style={{ background: bg }}>{children}</div>
);
const Tag = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 text-xs font-medium text-muted">{children}</p>
);
const Pair = ({ children }: { children: React.ReactNode }) => (
  <div className="grid gap-4 sm:grid-cols-2">{children}</div>
);

function ButtonVisibility() {
  const Btn = ({ bg, fg, label, primary }: { bg: string; fg: string; label: string; primary?: boolean }) => (
    <span className="inline-block rounded px-5 py-2.5 text-sm font-semibold" style={{ background: bg, color: fg, border: primary ? "none" : "1px solid #cfcab9" }}>{label}</span>
  );
  return (
    <Pair>
      <div><Tag>Same size, no contrast difference: which is the main action?</Tag>
        <Panel bg="#f1efe8"><div className="flex gap-3"><Btn bg="#e6e3d8" fg="#6b675a" label="Start free" /><Btn bg="#e6e3d8" fg="#6b675a" label="See pricing" /></div></Panel></div>
      <div><Tag>Primary has strong contrast, secondary is quiet</Tag>
        <Panel bg="#f1efe8"><div className="flex gap-3"><Btn bg="#1a2fb8" fg="#ffffff" label="Start free" primary /><Btn bg="#f1efe8" fg="#2b2a24" label="See pricing" /></div></Panel></div>
    </Pair>
  );
}

function TypeReadability() {
  const samples = [{ fg: "#b9b5a6", n: "weak" }, { fg: "#8a8676", n: "borderline" }, { fg: "#6b675a", n: "AA" }, { fg: "#1c1b16", n: "strong" }];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {samples.map((s) => {
        const r = hexContrast(s.fg, "#f7f4ee") ?? 0;
        return (
          <Panel key={s.n} bg="#f7f4ee">
            <p className="text-base" style={{ color: s.fg }}>Doors open at 18:00. Bring your ticket and a photo ID.</p>
            <p className="mt-2 text-xs" style={{ color: "#4a463b" }}>{r.toFixed(2)}:1 · {s.n}</p>
          </Panel>
        );
      })}
    </div>
  );
}

function Grouping() {
  const Card = ({ t, bg }: { t: string; bg: string }) => (
    <div className="rounded p-3" style={{ background: bg }}><p className="text-sm font-semibold">{t}</p><p className="text-xs">Two short lines of supporting detail.</p></div>
  );
  return (
    <Pair>
      <div><Tag>One flat surface: groups are hard to see</Tag>
        <Panel bg="#f1efe8"><div className="space-y-2 text-[#2b2a24]"><p className="text-sm font-semibold">Account</p><p className="text-xs">Name, email, password</p><p className="text-sm font-semibold">Billing</p><p className="text-xs">Plan, invoices, card</p><p className="text-sm font-semibold">Team</p><p className="text-xs">Members, roles</p></div></Panel></div>
      <div><Tag>Tonal steps separate groups without borders</Tag>
        <Panel bg="#e9e5d8"><div className="space-y-2 text-[#2b2a24]"><Card t="Account" bg="#ffffff" /><Card t="Billing" bg="#ffffff" /><Card t="Team" bg="#ffffff" /></div></Panel></div>
    </Pair>
  );
}

function TextOnVideo() {
  const frame = "linear-gradient(135deg,#f6d365 0%,#fda085 35%,#7aa8d6 70%,#f2f2f2 100%)";
  return (
    <Pair>
      <div><Tag>Text straight over a bright, busy frame</Tag>
        <div className="flex h-40 items-end rounded p-3" style={{ background: frame }}><p className="text-xl font-bold text-white">Launch day: 14 March</p></div></div>
      <div><Tag>Same frame with a scrim behind the text</Tag>
        <div className="flex h-40 items-end rounded" style={{ background: frame }}><p className="w-full rounded-b p-3 text-xl font-bold text-white" style={{ background: "linear-gradient(transparent,rgba(0,0,0,.75))" }}>Launch day: 14 March</p></div></div>
    </Pair>
  );
}

function MotionClarity() {
  const Track = ({ bg, dot, label }: { bg: string; dot: string; label: string }) => (
    <div><Tag>{label}</Tag>
      <div className="relative h-16 overflow-hidden rounded" style={{ background: bg }}>
        <span className="demo-slide absolute top-1/2 h-8 w-8 -translate-y-1/2 rounded-full" style={{ background: dot }} />
      </div></div>
  );
  return (
    <Pair>
      <Track bg="#8f8a9c" dot="#9a95a6" label="Moving object close in tone to its background" />
      <Track bg="#8f8a9c" dot="#fff2a8" label="Moving object clearly separated from its background" />
    </Pair>
  );
}

function BrandLockup() {
  const Mark = ({ bg, fg, accent }: { bg: string; fg: string; accent: string }) => (
    <Panel bg={bg} className="flex items-center gap-3">
      <span className="h-9 w-9 rounded-full" style={{ background: accent }} />
      <span className="font-display text-2xl font-semibold tracking-tight" style={{ color: fg }}>Northfield</span>
    </Panel>
  );
  return (
    <Pair>
      <div><Tag>Low contrast lockup</Tag><Mark bg="#d8d5ca" fg="#9a968a" accent="#c9c5b8" /></div>
      <div><Tag>Confident contrast: mark and name read at a glance</Tag><Mark bg="#f7f4ee" fg="#16140f" accent="#d1411a" /></div>
    </Pair>
  );
}

function FigureGround() {
  const Fig = ({ bg, fg, label }: { bg: string; fg: string; label: string }) => (
    <div><Tag>{label}</Tag>
      <svg viewBox="0 0 120 80" role="img" aria-label={label} className="w-full rounded" style={{ background: bg }}>
        <circle cx="60" cy="26" r="12" fill={fg} /><path d="M30 76c0-20 14-30 30-30s30 10 30 30z" fill={fg} />
      </svg></div>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Fig bg="#9d9a90" fg="#a4a198" label="Shape barely separates from ground" />
      <Fig bg="#9d9a90" fg="#2b2a24" label="Dark figure on mid ground" />
      <Fig bg="#e8e4d6" fg="#16140f" label="Strong figure and ground" />
    </div>
  );
}

export const DEMOS: Record<DemoName, () => React.ReactElement> = {
  "reading-order": () => <ReadingOrder />,
  "button-visibility": () => <ButtonVisibility />,
  "type-readability": () => <TypeReadability />,
  grouping: () => <Grouping />,
  "text-on-video": () => <TextOnVideo />,
  "motion-clarity": () => <MotionClarity />,
  "brand-lockup": () => <BrandLockup />,
  "figure-ground": () => <FigureGround />,
  "contrast-lab": () => <ContrastLab />,
  "position-compare": () => <PositionCompare />,
  "logo-clearspace": () => <LogoClearspace />,
  "lockup-misuse": () => <LockupMisuse />,
  "palette-roles": () => <PaletteRoles />,
  "image-treatment": () => <ImageTreatment />,
  "layout-template": () => <LayoutTemplate />,
  "voice-compare": () => <VoiceCompare />,
  "spacing-rhythm": () => <SpacingRhythm />,
  "touch-targets": () => <TouchTargets />,
  "form-states": () => <FormStates />,
  "form-layout": () => <FormLayout />,
  "nav-patterns": () => <NavPatterns />,
  "feedback-states": () => <FeedbackStates />,
  "type-pairing": () => <TypePairing />,
  "line-length-leading": () => <LineLengthLeading />,
  "grid-alignment": () => <GridAlignment />,
};
