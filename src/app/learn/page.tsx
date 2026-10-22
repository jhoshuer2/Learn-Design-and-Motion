import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getTimeline, type AssessmentNode, type LevelNode, type ModuleNode } from "@/lib/progression";
import { nextHref } from "@/lib/progression/links";
import { StateBadge, type NodeState } from "@/components/ui/StateBadge";

const ASSESSMENT_BADGE: Record<AssessmentNode["state"], NodeState> = {
  locked: "locked", available: "available", in_progress: "awaiting", passed: "completed", needs_work: "failed", remediation: "failed",
};
const BADGE: Record<string, NodeState> = { completed: "completed", active: "active", available: "available", locked: "locked" };
const TIER = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

function Module({ m }: { m: ModuleNode }) {
  return (
    <div className="mt-6">
      <h4 className="font-medium">{m.title} {m.complete && <StateBadge state="completed" />}</h4>
      {m.complete && <p className="mt-1 text-sm text-muted">Module complete: lessons and assessment passed.</p>}
      <ol className="mt-3 divide-y divide-line border-y border-line">
        {m.lessons.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-4 py-3">
            <div>
              {l.state === "locked" ? <span className="text-muted">{l.title}</span>
                : <Link href={`/learn/lesson/${l.id}`} className="font-medium underline">{l.title}</Link>}
              {l.state === "locked" && <p className="text-sm text-muted">Complete first: {l.missing.join(", ")}</p>}
            </div>
            <StateBadge state={BADGE[l.state]} />
          </li>
        ))}
        {m.assessment && (
          <li className="flex items-center justify-between gap-4 py-3">
            <div>
              {m.assessment.state === "locked" ? <span className="text-muted">Assessment: {m.assessment.title}</span>
                : <Link href={`/learn/assignment/${m.assessment.id}`} className="font-medium underline">Assessment: {m.assessment.title}</Link>}
              <p className="text-sm text-muted">
                {m.assessment.state === "locked" ? "Complete all lessons first." : `${m.assessment.attemptsUsed} of ${m.assessment.maxAttempts} attempts used`}
              </p>
            </div>
            <StateBadge state={ASSESSMENT_BADGE[m.assessment.state]} />
          </li>
        )}
      </ol>
    </div>
  );
}

function Capstone({ c }: { c: AssessmentNode }) {
  const href = c.state === "remediation" ? `/learn/remediation/${c.id}` : `/learn/assignment/${c.id}`;
  return (
    <div className="mt-8">
      <h4 className="font-medium">Level capstone</h4>
      <div className="mt-3 flex items-center justify-between gap-4 border-y border-line py-3">
        <div>
          {c.state === "locked" ? <span className="text-muted">Capstone: {c.title}</span>
            : <Link href={href} className="font-medium underline">Capstone: {c.title}</Link>}
          <p className="text-sm text-muted">
            {c.state === "locked" ? `Finish every module first${c.missing.length ? `: ${c.missing.join(", ")}` : ""}.`
              : c.state === "remediation" ? "All attempts used. Complete targeted remediation to earn more."
              : c.state === "needs_work" ? "All attempts and remediation used. A human review is the only route."
              : `${c.attemptsUsed} of ${c.maxAttempts} attempts used`}
          </p>
        </div>
        <StateBadge state={ASSESSMENT_BADGE[c.state]} />
      </div>
    </div>
  );
}

function Level({ l }: { l: LevelNode }) {
  const status: NodeState = l.state === "complete" ? "completed" : l.state === "active" ? "active" : "locked";
  return (
    <section className="mt-10 border-t border-line pt-6" aria-labelledby={`lv-${l.tier}`}>
      <h3 id={`lv-${l.tier}`} className="font-display text-2xl">
        {TIER(l.tier)}{l.title !== TIER(l.tier) ? `: ${l.title}` : ""}
        {l.state !== "not_authored" && <span className="ml-3 align-middle font-sans text-base"><StateBadge state={status} /></span>}
      </h3>
      {l.state === "not_authored" ? (
        <p className="mt-2 max-w-measure text-muted">
          Not written yet. {l.unlocked ? "You have unlocked this level, but there is nothing to study in it yet." : "It opens when the level before it is complete."}
        </p>
      ) : l.state === "locked" ? (
        <p className="mt-2 text-muted">This level opens when you complete the previous level.</p>
      ) : (
        <>
          {l.scopeNote && <p className="mt-2 max-w-measure text-sm text-muted">{l.scopeNote}</p>}
          {l.state === "complete" && l.id && (
            <p className="mt-3"><Link className="underline" href={`/learn/level/${l.id}`}>View your completion record</Link></p>
          )}
          {l.modules.map((m) => <Module key={m.id} m={m} />)}
          {l.capstone && <Capstone c={l.capstone} />}
          {l.state === "active" && l.checks.length > 0 && (
            <div className="mt-8">
              <h4 className="font-medium">Required to complete this level</h4>
              <ul className="mt-2 space-y-1 text-sm">
                <li>Pass the capstone (it has its own required criteria).</li>
                {l.checks.map((c) => (
                  <li key={c.slug}>
                    {c.title} at {c.needed}% or more on your latest evidence:{" "}
                    <strong>{c.latestScore === null ? "not assessed yet" : `${c.latestScore}%`}</strong> {c.met ? "(met)" : "(not met)"}
                  </li>
                ))}
              </ul>
              {l.id && l.blockedBy.length > 0 && l.capstone?.state === "passed" && (
                <p className="mt-2 text-sm"><Link className="underline" href={`/learn/level/${l.id}`}>See what is holding this level back</Link></p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default async function MyLearning() {
  const user = await requireUser();
  const enrollments = await db.enrollment.findMany({ where: { userId: user.id }, include: { path: { include: { discipline: true } } } });
  const timelines = await Promise.all(enrollments.map(async (e) => ({ e, t: await getTimeline(user.id, e.pathId) })));

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <nav className="flex gap-4 text-sm"><Link href="/dashboard" className="underline">Dashboard</Link><Link href="/profile/skills" className="underline">My skills</Link></nav>
      <h1 className="mt-4 font-display text-4xl">My learning</h1>
      {timelines.length === 0 && <p className="mt-6 text-muted">You are not enrolled in a path yet. Enroll from the dashboard.</p>}
      {timelines.map(({ e, t }) => (
        <section key={e.id} className="mt-10">
          <h2 className="font-display text-3xl">{e.path.discipline.title}</h2>
          {t?.next ? (
            <p className="mt-2">Next: <Link className="underline" href={nextHref(t.next)}>{t.next.title}</Link></p>
          ) : (
            <p className="mt-2 text-muted">No lesson is available to start right now.</p>
          )}
          {t?.modules.length === 0 && <p className="mt-4 text-muted">No modules are published for this path yet.</p>}
          {t?.levels.map((l) => <Level key={l.tier} l={l} />)}
        </section>
      ))}
    </div>
  );
}
