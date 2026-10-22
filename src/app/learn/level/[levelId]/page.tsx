import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getLevelView } from "@/lib/progression/level";
import { StateBadge } from "@/components/ui/StateBadge";

const TIER = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();
const date = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

export default async function LevelPage({ params }: { params: { levelId: string } }) {
  const user = await requireUser();
  const v = await getLevelView(user.id, params.levelId);
  if (!v) notFound();
  const rec = v.record;

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <nav className="text-sm"><Link href="/learn" className="underline">My learning</Link></nav>
      <p className="mt-6 text-sm uppercase tracking-widest text-muted">{TIER(v.tier)} level</p>
      <h1 className="mt-1 font-display text-4xl">{v.title}</h1>
      <p className="mt-3 max-w-measure text-muted">{v.scopeNote}</p>

      {rec ? (
        <>
          <section className="mt-8 rounded border border-line bg-raised p-5" aria-labelledby="record">
            <StateBadge state="completed" />
            <h2 id="record" className="mt-3 font-display text-3xl">Level complete</h2>
            <p className="text-sm text-muted">Recorded {date(rec.issuedAt)}</p>
            {rec.evidence.testEvaluatorUsed && (
              <p role="note" className="mt-4 rounded border border-warn p-3 text-sm text-warn">
                TEST EVALUATOR. At least one result behind this record came from a deterministic test evaluator that did not look at the work. This is not a genuine assessment.
              </p>
            )}
            <h3 className="mt-6 font-medium">What this record rests on</h3>
            <ul className="mt-2 space-y-3">
              {rec.evidence.works.map((w) => (
                <li key={w.assignment} className="text-sm">
                  <strong>{w.title}</strong> ({w.kind === "CAPSTONE" ? "capstone" : "module assessment"}): {w.score}% against a {w.threshold}% pass mark.
                  <span className="block text-muted">Assessed by {w.assessedBy}{w.humanReviewed ? ", confirmed by a person" : ""} · rubric {w.rubric.slug} v{w.rubric.version} · {date(w.evaluatedAt)}</span>
                </li>
              ))}
              {rec.evidence.requiredCompetencies.map((c) => (
                <li key={c.slug} className="text-sm"><strong>{c.title}</strong>: latest evidence {c.latestScore}% (needed {c.needed}%).</li>
              ))}
            </ul>
            <h3 className="mt-6 font-medium">What this record does not show</h3>
            <p className="mt-1 max-w-measure text-sm text-muted">{rec.evidence.limits} {rec.evidence.scope.note}</p>
          </section>
          {v.next && (
            <p className="mt-8 max-w-measure">
              Next: <strong>{TIER(v.next.tier)}</strong> is now open to you.{" "}
              {v.next.authored ? <Link className="underline" href="/learn">Continue</Link> : <span className="text-muted">It has no lessons or assessments yet.</span>}
            </p>
          )}
        </>
      ) : (
        <section className="mt-8" aria-labelledby="reqs">
          <h2 id="reqs" className="font-display text-2xl">What is needed to complete this level</h2>
          <ul className="mt-4 space-y-4">
            {v.modules.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-4 rounded border border-line bg-raised p-4">
                <span>Complete the module <strong>{m.title}</strong> (lessons and assessment)</span>
                <StateBadge state={m.complete ? "completed" : "locked"} />
              </li>
            ))}
            {v.capstone && (
              <li className="flex items-center justify-between gap-4 rounded border border-line bg-raised p-4">
                <span>Pass the capstone <Link className="underline" href={`/learn/assignment/${v.capstone.assignmentId}`}>{v.capstone.title}</Link> at {v.capstoneThreshold}% or more, with every required criterion met</span>
                <StateBadge state={v.capstone.passed ? "completed" : "active"} />
              </li>
            )}
            {v.checks.map((c) => (
              <li key={c.slug} className="rounded border border-line bg-raised p-4">
                <div className="flex items-center justify-between gap-4">
                  <span>Show <strong>{c.title}</strong> at {c.needed}% or more on your latest evidence. Now: <strong>{c.latestScore === null ? "not assessed" : `${c.latestScore}%`}</strong></span>
                  <StateBadge state={c.met ? "completed" : "failed"} />
                </div>
                {!c.met && (
                  <p className="mt-2 text-sm text-muted">
                    This is a required skill, so a strong capstone total does not replace it. Retake the knowledge check:{" "}
                    {c.retakeLessons.map((l, i) => <span key={l.lessonId}>{i > 0 && ", "}<Link className="underline" href={`/learn/lesson/${l.lessonId}`}>{l.title}</Link></span>)}.
                    The level unlocks automatically once your latest result reaches {c.needed}%.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
