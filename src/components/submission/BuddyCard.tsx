import Link from "next/link";
import type { Buddy, Fix, LessonLink } from "@/lib/submissions/buddy";

const Delta = ({ d }: { d: number | null }) =>
  d === null || d === 0 ? null : <span className="ml-2 rounded border border-line px-2 py-0.5 text-xs text-muted">{d > 0 ? `+${d}` : d} since last time</span>;

function Links({ l }: { l: LessonLink }) {
  return (
    <div className="mt-2">
      <p className="text-sm font-medium">{l.title}</p>
      <p className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <Link className="underline" href={l.idea}>Revisit the idea</Link>
        {l.compare && <Link className="underline" href={l.compare}>See good and not-so-good</Link>}
        {l.practice && <Link className="underline" href={l.practice}>Try it again with support</Link>}
      </p>
    </div>
  );
}

function NextFix({ fix, imageSrc, imageAlt }: { fix: Fix; imageSrc?: string; imageAlt?: string }) {
  const lesson = fix.links.find((l) => l.contrast) ?? fix.links[0];
  return (
    <section aria-labelledby="next-fix" className="rounded border border-line bg-raised p-5">
      <p className="text-sm font-medium text-muted">Your next best fix</p>
      <h3 id="next-fix" className="mt-1 font-display text-2xl">{fix.title} <span className="text-lg text-muted">{fix.score}%</span><Delta d={fix.delta} /></h3>
      {fix.belowMinimum && <p className="mt-1 text-sm text-muted">This one has to reach {fix.minScore}% to pass, so it is the best place to start.</p>}
      <dl className="mt-3 space-y-3 text-sm">
        <div><dt className="font-medium">What I can see in your work</dt><dd className="mt-0.5 text-muted">{fix.evidence}</dd></div>
        {fix.where && <div><dt className="font-medium">Where</dt><dd className="mt-0.5 text-muted">{fix.where}</dd></div>}
        <div><dt className="font-medium">Try this</dt><dd className="mt-0.5 text-muted">{fix.improvement}</dd></div>
      </dl>
      {imageSrc && lesson?.contrast && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <figure className="rounded border border-line p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSrc} alt={imageAlt} className="max-h-60 w-full object-contain" />
            <figcaption className="mt-2 text-sm text-muted">Your work</figcaption>
          </figure>
          <div className="rounded border border-line p-3 text-sm">
            <p className="font-medium">In the lesson</p>
            <p className="mt-1 text-muted">{lesson.contrast}</p>
            {fix.principle && <p className="mt-2 text-muted"><span className="font-medium text-ink">Principle: </span>{fix.principle}</p>}
          </div>
        </div>
      )}
      {fix.links.length > 0
        ? <div className="mt-4">{fix.links.map((l) => <Links key={l.lessonId} l={l} />)}</div>
        : <p className="mt-4 text-sm text-muted">There is no lesson for this skill in your path yet, so use the details below.</p>}
    </section>
  );
}

/** Warm summary first, details below. Everything here comes from the stored evaluation; nothing is judged again. */
export function BuddyCard({ buddy, imageSrc, imageAlt }: { buddy: Buddy; imageSrc?: string; imageAlt?: string }) {
  return (
    <section aria-labelledby="buddy-heading" className="mt-8 space-y-5">
      <h2 id="buddy-heading" className="font-display text-2xl">Your buddy&rsquo;s read</h2>
      <p className="max-w-measure text-lg">{buddy.opening}</p>
      {buddy.nailed.length > 0 && (
        <div className="rounded border border-line bg-raised p-5">
          <h3 className="font-medium">What you nailed</h3>
          <ul className="mt-2 space-y-2">
            {buddy.nailed.map((n) => (
              <li key={n.key} className="text-sm"><span aria-hidden>✓ </span><span className="font-medium">{n.title}</span> <span className="text-muted">{n.score}%</span><Delta d={n.delta} />
                {n.note && <span className="mt-0.5 block text-muted">{n.note}</span>}</li>
            ))}
          </ul>
        </div>
      )}
      {buddy.nextFix && <NextFix fix={buddy.nextFix} imageSrc={imageSrc} imageAlt={imageAlt} />}
      {buddy.moreFixes.length > 0 && (
        <div>
          <h3 className="font-medium">Then, when you are ready</h3>
          <ul className="mt-2 space-y-3">
            {buddy.moreFixes.map((f) => (
              <li key={f.key} className="text-sm"><span className="font-medium">{f.title}</span> <span className="text-muted">{f.score}%</span><Delta d={f.delta} />
                <span className="mt-0.5 block text-muted">{f.improvement}</span>
                {f.links.map((l) => <Links key={l.lessonId} l={l} />)}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="max-w-measure text-muted">{buddy.closing}</p>
    </section>
  );
}
