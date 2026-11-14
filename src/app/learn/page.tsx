import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getTimeline, type AssessmentNode, type LevelNode, type ModuleNode } from "@/lib/progression";
import { nextHref } from "@/lib/progression/links";
import { StateBadge, type NodeState } from "@/components/ui/StateBadge";
import { KeyframeTrack, type KeyframeState } from "@/components/ui/Keyframes";

const ASSESSMENT_BADGE: Record<AssessmentNode["state"], NodeState> = {
  locked: "locked", available: "available", in_progress: "awaiting", passed: "completed", needs_work: "failed", remediation: "failed",
};
const BADGE: Record<string, NodeState> = { completed: "completed", active: "active", available: "available", locked: "locked" };
const TIER = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

/** Lessons then the assessment as keyframes: done, the one to do now (the playhead), what is next, what is locked. */
function trackFor(m: ModuleNode) {
  const items: { state: KeyframeState; label: string }[] = [
    ...m.lessons.map((l) => ({ label: l.title, state: (l.state === "completed" ? "done" : l.state === "locked" ? "locked" : "next") as KeyframeState })),
    ...(m.assessment ? [{ label: m.assessment.title, state: (m.assessment.state === "passed" ? "done" : m.assessment.state === "locked" ? "locked" : "next") as KeyframeState }] : []),
  ];
  const cur = items.findIndex((x) => x.state === "next");
  if (cur >= 0) items[cur] = { ...items[cur], state: "current" };
  return items;
}

function Module({ m }: { m: ModuleNode }) {
  return (
    <div className="mt-8" data-reveal>
      <h4 className="title">{m.title} {m.complete && <StateBadge state="completed" />}</h4>
      {m.complete && <p className="mt-1 text-sm text-ink-2">Module complete: lessons and assessment passed.</p>}
      <KeyframeTrack items={trackFor(m)} />
      <ol className="surface-card mt-5 divide-y divide-line px-6">
        {m.lessons.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-4 py-4">
            <div>
              {l.state === "locked" ? <span className="text-ink-3">{l.title}</span>
                : <Link href={`/learn/lesson/${l.id}`} className="link-quiet font-semibold">{l.title}</Link>}
              {l.state === "locked" && <p className="text-sm text-ink-3">Complete first: {l.missing.join(", ")}</p>}
            </div>
            <StateBadge state={BADGE[l.state]} />
          </li>
        ))}
        {m.assessment && (
          <li className="flex items-center justify-between gap-4 py-4">
            <div>
              {m.assessment.state === "locked" ? <span className="text-ink-3">Assessment: {m.assessment.title}</span>
                : <Link href={`/learn/assignment/${m.assessment.id}`} className="link-quiet font-semibold">Assessment: {m.assessment.title}</Link>}
              <p className="text-sm text-ink-3">
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
      <h4 className="title">Level capstone</h4>
      <div className="surface-card mt-4 flex items-center justify-between gap-4 px-6 py-5">
        <div>
          {c.state === "locked" ? <span className="text-ink-3">Capstone: {c.title}</span>
            : <Link href={href} className="link-quiet font-semibold">Capstone: {c.title}</Link>}
          <p className="text-sm text-ink-3">
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
    <section className="mt-14 border-t border-line pt-8" aria-labelledby={`lv-${l.tier}`}>
      <h3 id={`lv-${l.tier}`} className="display display-m">
        {TIER(l.tier)}{l.title !== TIER(l.tier) ? `: ${l.title}` : ""}
        {l.state !== "not_authored" && <span className="ml-3 align-middle font-sans text-base not-italic"><StateBadge state={status} /></span>}
      </h3>
      {l.state === "not_authored" ? (
        <p className="mt-2 max-w-measure text-ink-2">
          Not written yet. {l.unlocked ? "You have unlocked this level, but there is nothing to study in it yet." : "It opens when the level before it is complete."}
        </p>
      ) : l.state === "locked" ? (
        <p className="mt-2 text-ink-2">This level opens when you complete the previous level.</p>
      ) : (
        <>
          {l.scopeNote && <p className="mt-3 max-w-measure text-[0.9375rem] text-ink-2">{l.scopeNote}</p>}
          {l.state === "complete" && l.id && (
            <p className="mt-3"><Link className="link-quiet font-semibold" href={`/learn/level/${l.id}`}>View your completion record</Link></p>
          )}
          {l.modules.map((m) => <Module key={m.id} m={m} />)}
          {l.capstone && <Capstone c={l.capstone} />}
          {l.state === "active" && l.checks.length > 0 && (
            <div className="mt-8">
              <h4 className="title">Required to complete this level</h4>
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
                <p className="mt-2 text-sm"><Link className="link-quiet font-semibold" href={`/learn/level/${l.id}`}>See what is holding this level back</Link></p>
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
    <div className="mx-auto max-w-page px-6 pb-16 pt-10 sm:pt-16">
      <nav className="flex gap-2 text-sm" aria-label="My learning links">
        <Link href="/dashboard" className="rounded-full bg-paper-2 px-4 py-2 font-semibold transition hover:bg-ink hover:text-paper">Dashboard</Link>
        <Link href="/profile/skills" className="rounded-full bg-paper-2 px-4 py-2 font-semibold transition hover:bg-ink hover:text-paper">My skills</Link>
      </nav>
      <p className="label mt-10">Your paths</p>
      <h1 className="display display-xl mt-3">My <em>learning</em></h1>
      {timelines.length === 0 && <p className="lede mt-6">You are not enrolled in a path yet. Enroll from the dashboard.</p>}
      {timelines.map(({ e, t }) => (
        <section key={e.id} className="mt-14">
          <div className="grid items-end gap-8 lg:grid-cols-[1fr_1.2fr]">
            <div className="frame grain relative aspect-[16/10]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/art/path-motion.webp" width={1280} height={720} alt="" className="settle absolute inset-0 h-full w-full object-cover" />
            </div>
            <div>
              <h2 className="display display-l">{e.path.discipline.title}</h2>
              {t?.next ? (
                <p className="mt-5 text-lg">Next: <Link className="link-quiet font-semibold" href={nextHref(t.next)}>{t.next.title}</Link></p>
              ) : (
                <p className="mt-5 text-ink-2">No lesson is available to start right now.</p>
              )}
              {t?.modules.length === 0 && <p className="mt-4 text-ink-2">No modules are published for this path yet.</p>}
            </div>
          </div>
          <div className="max-w-3xl">{t?.levels.map((l) => <Level key={l.tier} l={l} />)}</div>
        </section>
      ))}
    </div>
  );
}
