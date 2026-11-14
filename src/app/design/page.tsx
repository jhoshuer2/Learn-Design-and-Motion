/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { Button, PillLink, Arrow } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { KeyframeProgress, KeyframeTrack } from "@/components/ui/Keyframes";
import { Pip, PipSays } from "@/components/ui/Pip";
import { StatCard } from "@/components/ui/StatCard";
import { StateBadge } from "@/components/ui/StateBadge";

export const metadata: Metadata = { title: "Design system · Creative Mastery", robots: { index: false } };

const SWATCHES = [
  ["paper", "bg-paper"], ["paper-2", "bg-paper-2"], ["card", "bg-card"], ["ink", "bg-ink"], ["ink-2", "bg-ink-2"], ["ink-3", "bg-ink-3"],
  ["accent", "bg-accent"], ["accent-soft", "bg-accent-soft"], ["sage", "bg-sage"], ["butter", "bg-butter"], ["ok", "bg-success"], ["warn", "bg-warn"], ["danger", "bg-danger"],
];

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-14" data-reveal>
      <p className="label">{label}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** The system on one page: review this before reviewing any screen. Source of truth: skills/ui-craft/references. */
export default function DesignPage() {
  return (
    <div className="mx-auto max-w-page px-6 pb-24 pt-12">
      <p className="label">Design system</p>
      <h1 className="display display-xl mt-4">Calm, <em>editorial</em>, made by hand.</h1>
      <p className="lede mt-6">Warm paper, one serif voice, tiny tracked labels, pill controls, hairlines instead of boxes, and one painted scene per screen.</p>

      <Block label="Colour">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {SWATCHES.map(([n, c]) => (
            <li key={n}><div className={`h-20 rounded-card ring-1 ring-line ${c}`} /><p className="label mt-2">{n}</p></li>
          ))}
        </ul>
      </Block>

      <Block label="Type">
        <p className="display display-xl">Display <em>XL</em></p>
        <p className="display display-l mt-6">Display L, page titles</p>
        <p className="display display-m mt-6">Display M, section titles</p>
        <p className="title mt-6">Title, card headings</p>
        <p className="lede mt-4">Body L, the lead sentence of a page. Warm, short, and readable at arm&rsquo;s length.</p>
        <p className="mt-4 max-w-measure">Body, 17 px on a 1.6 line. Instrument Sans carries the reading; Fraunces carries the voice.</p>
        <p className="label mt-4">Label, 11.5 px tracked uppercase</p>
      </Block>

      <Block label="Buttons and links">
        <div className="flex flex-wrap items-center gap-4">
          <Button>Primary (ink)</Button>
          <Button variant="accent">Accent<Arrow /></Button>
          <Button variant="secondary">Secondary</Button>
          <PillLink href="/design" variant="primary" arrow>Pill link</PillLink>
          <a className="link-quiet font-semibold" href="#">Quiet link</a>
          <Button disabled>Disabled</Button>
        </div>
      </Block>

      <Block label="Fields, badges, progress">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="max-w-sm space-y-4"><Field id="demo-email" label="Email" type="email" placeholder="you@example.com" /><Field id="demo-pass" label="Password" type="password" /></div>
          <div>
            <div className="flex flex-wrap gap-2">{(["locked", "available", "active", "completed", "failed", "awaiting"] as const).map((s) => <StateBadge key={s} state={s} />)}</div>
            <div className="mt-8"><KeyframeProgress total={8} current={3} /></div>
            <KeyframeTrack showLabels items={["Mon", "Tue", "Wed", "Thu", "Fri"].map((l, i) => ({ label: l, state: i < 2 ? "done" : i === 2 ? "current" : "next" }))} />
          </div>
        </div>
      </Block>

      <Block label="Switch">
        <div className="switch" data-mode="watch" aria-label="Watch or read (static demo)">
          <span className="thumb" aria-hidden />
          <button type="button" aria-pressed="true">Watch</button>
          <button type="button" aria-pressed="false">Read</button>
        </div>
      </Block>

      <Block label="Tiles (true numbers only)">
        <div className="grid gap-5 sm:grid-cols-3">
          <StatCard value="6" label="hours, at your own pace" tone="butter" />
          <StatCard value="6" label="skills you will practise" tone="sage" />
          <StatCard value="6" label="short lessons" tone="terra" />
        </div>
      </Block>

      <Block label="Companion">
        <div className="flex flex-wrap items-end gap-10">
          <Pip size={180} label="Pip" />
          <PipSays>Show me what you made and I will point at the one thing to fix first.</PipSays>
        </div>
      </Block>

      <Block label="Imagery">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="frame grain aspect-[16/10]"><img src="/art/hero.webp" width={1280} height={720} alt="A sunlit studio" className="h-full w-full object-cover" /></div>
          <div className="frame aspect-[16/10]"><img src="/art/pip-desk.webp" width={1376} height={768} alt="Pip on a desk" className="h-full w-full object-cover" /></div>
        </div>
      </Block>
    </div>
  );
}
