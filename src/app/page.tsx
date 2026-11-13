import Link from "next/link";
import { loadOutcomes } from "@/lib/content/outcomes";
import { Button } from "@/components/ui/Button";
import { KeyframeTrack } from "@/components/ui/Keyframes";

const HEADLINE = "Learn it by making it.";

/** The real way a path works, so the numbering is a true sequence. */
const STEPS = ["Pick what you want to make", "Watch or read a short step", "Make a small piece", "Get feedback on your own work", "Make the real thing"];

export default function Landing({ searchParams }: { searchParams: { deleted?: string } }) {
  const outcomes = loadOutcomes();
  let i = 0;
  return (
    <div className="mx-auto max-w-5xl px-6 pb-24 pt-14">
      {searchParams.deleted && <p role="status" className="mb-8 rounded-lg border-2 border-line bg-raised p-4">Your account and everything in it were deleted.</p>}

      <h1 className="kinetic font-display text-6xl sm:text-8xl" aria-label={HEADLINE}>
        {HEADLINE.split(" ").map((w, wi, all) => (
          <span key={wi} aria-hidden className="inline-block whitespace-nowrap">
            {[...w].map((ch) => <span key={i} className="k" style={{ ["--i" as string]: i++ }}>{ch}</span>)}
            {wi < all.length - 1 ? " " : ""}
          </span>
        ))}
      </h1>
      <p className="mt-6 max-w-[34rem] text-xl">
        Pick something you want to make. Learn it in short steps you can watch or read, make a small piece each time, and get kind, specific feedback on your own work until you can do it without us.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/signup"><Button>Create an account</Button></Link>
        <Link href="/signin"><Button variant="secondary">Sign in</Button></Link>
      </div>

      {outcomes.map((o) => (
        <section key={o.slug} className="mt-16 grid items-center gap-8 sm:grid-cols-2" aria-labelledby={`o-${o.slug}`}>
          <Link href={`/learn/outcome/${o.slug}`} className="group block overflow-hidden rounded-2xl border-2 border-ink" aria-label={`See what you will make: ${o.title}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/lessons/${o.showcase ?? "kinetic-type-loop-example"}.jpg`} alt="" className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          </Link>
          <div>
            <p className="text-sm font-medium text-muted">A good first thing to make</p>
            <h2 id={`o-${o.slug}`} className="mt-1 font-display text-4xl">{o.title}</h2>
            <p className="mt-3 text-lg">{o.promise}</p>
            <p className="mt-2 text-muted">About {o.hours} hours. {o.tools.join(", ")} all work.</p>
            <p className="mt-5"><Link className="font-semibold underline underline-offset-4" href={`/learn/outcome/${o.slug}`}>See the path</Link></p>
          </div>
        </section>
      ))}

      <section className="mt-20" aria-labelledby="how">
        <h2 id="how" className="font-display text-3xl">How it works</h2>
        <KeyframeTrack items={STEPS.map((label, n) => ({ label, state: n === 0 ? "current" : "next" }))} />
        <ol className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-5">
          {STEPS.map((s, n) => <li key={s} className="text-sm"><span className="font-semibold">{n + 1}. </span>{s}</li>)}
        </ol>
        <p className="mt-10 max-w-[34rem] text-muted">
          You move on when your work shows you can do it, not when a video ends. If something is not landing yet, your buddy shows you exactly where, using what you made.
        </p>
        <p className="mt-6 text-sm text-muted">Also here: Graphic Design, Brand Design and UI Design paths, all in draft.</p>
      </section>
    </div>
  );
}
