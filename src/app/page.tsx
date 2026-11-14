/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { loadOutcomes } from "@/lib/content/outcomes";
import { PillLink, Arrow } from "@/components/ui/Button";
import { Magnetic } from "@/components/ui/Magnetic";
import { Pip, PipSays } from "@/components/ui/Pip";

/** The real way a path works, so the numbering is a true sequence. */
const STEPS = [
  ["Pick what you want to make", "Start from the thing, not the syllabus."],
  ["Watch or read a short step", "Two minutes each. Your choice, any time."],
  ["Make a small piece", "A real piece of work, every step."],
  ["Get feedback on your own work", "Specific, kind, and about what you made."],
  ["Make the real thing", "Move on when your work shows it, not when a video ends."],
];

/** Only the first path has content today; the others are honestly marked as in draft. */
const OTHER_PATHS = [
  { title: "Graphic Design", img: "/art/path-graphic.webp" },
  { title: "Brand Design", img: "/art/path-brand.webp" },
  { title: "UI Design", img: "/art/path-ui.webp" },
];

export default function Landing({ searchParams }: { searchParams: { deleted?: string } }) {
  const outcomes = loadOutcomes();
  const first = outcomes[0];
  return (
    <div>
      {searchParams.deleted && (
        <p role="status" className="mx-auto mt-6 max-w-page px-6">
          <span className="surface-card inline-block px-5 py-3 text-sm">Your account and everything in it were deleted.</span>
        </p>
      )}

      {/* Hero: one headline, one image, one action */}
      <section className="mx-auto max-w-page px-6 pb-8 pt-12 sm:pt-20">
        <p className="label rise" style={{ ["--d" as string]: 0 }}>A small, kind way to learn design and motion</p>
        <h1 className="display display-xl mt-6 max-w-[14ch] rise" style={{ ["--d" as string]: 1 }}>
          Learn it by <em>making it.</em>
        </h1>
        <div className="mt-8 flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <p className="lede rise" style={{ ["--d" as string]: 3 }}>
            Pick something you want to make. Learn it in short steps you can watch or read, make a small piece each time, and get kind, specific feedback on your own work until you can do it without us.
          </p>
          <div className="flex flex-wrap items-center gap-5 rise" style={{ ["--d" as string]: 4 }}>
            <Magnetic><Link href="/signup" className="pill pill-accent">Create an account<Arrow /></Link></Magnetic>
            <Link href="/signin" className="link-quiet text-[0.9375rem] font-semibold">Sign in</Link>
          </div>
        </div>

        <div className="frame grain relative mt-12 aspect-[4/5] sm:aspect-[16/8]">
          <img src="/art/hero.webp" width={1280} height={720} alt="A sunlit studio with an arched window, a wooden desk, a sketchbook and trailing plants" className="settle absolute inset-0 h-full w-full object-cover object-[78%_50%] sm:object-[50%_60%]" />
          <p className="label absolute bottom-5 left-6 z-10 rounded-full bg-paper/85 px-3 py-1.5 backdrop-blur">Studio · 01 / 04</p>
          <div className="absolute bottom-0 right-6 z-10 hidden sm:block"><Pip size={150} label="Pip, your learning buddy" /></div>
        </div>
        <p className="label mt-5 flex flex-wrap gap-x-6 gap-y-1">
          <span>6 short lessons</span><span>1 real project</span><span>Feedback on your own work</span>
        </p>
      </section>

      {/* Paths */}
      <section className="mx-auto max-w-page px-6 py-24 sm:py-32" aria-labelledby="paths">
        <div className="flex items-end justify-between gap-6" data-reveal>
          <div>
            <p className="label">Choose a path</p>
            <h2 id="paths" className="display display-l mt-3">A good first thing <em>to make</em></h2>
          </div>
          <p className="label hidden sm:block">01 / 04</p>
        </div>
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {first && (
            <li data-reveal style={{ ["--d" as string]: 0 }}>
              <Link href={`/learn/outcome/${first.slug}`} className="lift block">
                <div className="frame aspect-[4/5]"><img src="/art/path-motion.webp" width={1280} height={720} alt="" className="h-full w-full object-cover object-[35%_50%]" /></div>
                <p className="label mt-4">Motion Design · About {first.hours} hours</p>
                <h3 className="title mt-1">{first.title}</h3>
                <p className="mt-1 text-[0.9375rem] text-ink-2">{first.promise}</p>
                <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold">See the path<Arrow /></p>
              </Link>
            </li>
          )}
          {OTHER_PATHS.map((p, i) => (
            <li key={p.title} data-reveal style={{ ["--d" as string]: i + 1 }}>
              <div className="frame aspect-[4/5] opacity-80 saturate-[0.85]"><img src={p.img} width={1280} height={720} alt="" className="h-full w-full object-cover object-[40%_50%]" /></div>
              <p className="label mt-4">{p.title} · In draft</p>
              <h3 className="title mt-1 text-ink-2">Coming next</h3>
            </li>
          ))}
        </ul>
      </section>

      {/* How it works */}
      <section className="border-t border-line" aria-labelledby="how">
        <div className="mx-auto grid max-w-page gap-12 px-6 py-24 sm:py-32 lg:grid-cols-[1fr_1.4fr] lg:gap-24">
          <div className="lg:sticky lg:top-24 lg:self-start" data-reveal>
            <p className="label">How it works</p>
            <h2 id="how" className="display display-m mt-3">Small steps. Real work. <em>Kind feedback.</em></h2>
            <p className="lede mt-6 !text-base">
              You move on when your work shows you can do it, not when a video ends. If something is not landing yet, your buddy shows you exactly where, using what you made.
            </p>
            <div className="frame mt-8 aspect-[16/10] max-w-md"><img src="/art/pip-desk.webp" width={1376} height={768} alt="Pip, a small round robot, sitting on a desk beside a sketchbook" className="h-full w-full object-cover" /></div>
          </div>
          <ol className="divide-y divide-line border-y border-line">
            {STEPS.map(([title, body], n) => (
              <li key={title} className="grid grid-cols-[3rem_1fr] gap-4 py-7" data-reveal style={{ ["--d" as string]: n }}>
                <span className="label pt-2">{String(n + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="display text-3xl sm:text-4xl">{title}</h3>
                  <p className="mt-2 text-ink-2">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Closing */}
      <section className="mx-auto max-w-page px-6 pb-24 sm:pb-32">
        <div className="rounded-window bg-paper-2 px-6 py-16 sm:px-16 sm:py-24" data-reveal>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="display display-l">Make the first thing <em>today.</em></h2>
            <div className="mt-8 flex justify-center"><div className="max-w-sm text-left"><PipSays>Show me what you made and I will point at the one thing to fix first.</PipSays></div></div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-5">
              <PillLink href="/signup" variant="primary" arrow>Create an account</PillLink>
              <Link href="/signin" className="link-quiet font-semibold">Sign in</Link>
            </div>
            <p className="label mt-8">Graphic Design, Brand Design and UI Design paths are in draft.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
