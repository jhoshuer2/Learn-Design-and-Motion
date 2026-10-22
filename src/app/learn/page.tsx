import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getTimeline } from "@/lib/progression";
import { StateBadge, type NodeState } from "@/components/ui/StateBadge";

const BADGE: Record<string, NodeState> = { completed: "completed", active: "active", available: "available", locked: "locked" };

export default async function MyLearning() {
  const user = await requireUser();
  const enrollments = await db.enrollment.findMany({ where: { userId: user.id }, include: { path: { include: { discipline: true } } } });
  const timelines = await Promise.all(enrollments.map(async (e) => ({ e, t: await getTimeline(user.id, e.pathId) })));

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/dashboard" className="text-sm underline">Dashboard</Link>
      <h1 className="mt-4 font-display text-4xl">My learning</h1>
      {timelines.length === 0 && <p className="mt-6 text-muted">You are not enrolled in a path yet. Enroll from the dashboard.</p>}
      {timelines.map(({ e, t }) => (
        <section key={e.id} className="mt-10">
          <h2 className="font-display text-2xl">{e.path.discipline.title}: Beginner</h2>
          {t?.next ? (
            <p className="mt-2">Next: <Link className="underline" href={`/learn/lesson/${t.next.lessonId}`}>{t.next.title}</Link></p>
          ) : (
            <p className="mt-2 text-muted">No lesson is available to start right now.</p>
          )}
          {t?.modules.length === 0 && <p className="mt-4 text-muted">No modules are published for this path yet.</p>}
          {t?.modules.map((m) => (
            <div key={m.id} className="mt-6">
              <h3 className="font-medium">{m.title} {m.complete && <StateBadge state="completed" />}</h3>
              {m.complete && <p className="mt-1 text-sm text-muted">Lessons complete. The module assessment arrives in a later milestone.</p>}
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
              </ol>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
