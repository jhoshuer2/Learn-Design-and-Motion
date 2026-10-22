import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listOpenReports, listPendingApprovals } from "@/lib/portfolio/moderation";

export default async function ModerationQueue() {
  const user = await requireUser(["REVIEWER", "ADMIN"]);
  const [reports, approvals] = await Promise.all([listOpenReports(user), listPendingApprovals(user)]);
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <nav className="flex gap-4 text-sm"><Link href="/dashboard" className="underline">Dashboard</Link><Link href="/review" className="underline">Appeals</Link></nav>
      <section aria-labelledby="approvals" className="mt-4">
        <h1 id="approvals" className="font-display text-4xl">Public approvals</h1>
        <p className="mt-2 max-w-measure text-muted">Projects whose owners want them listed publicly. Nothing here is visible to anyone but its owner until you approve it. Oldest first.</p>
        {approvals.length === 0 ? <p className="mt-4 text-muted">Nothing waiting.</p> : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {approvals.map((a) => (
              <li key={a.id} className="py-4">
                {a.mine ? <span className="font-medium">&ldquo;{a.title}&rdquo; by {a.owner} (yours: another reviewer must decide)</span>
                  : <Link href={`/review/moderation/approvals/${a.id}`} className="font-medium underline">&ldquo;{a.title}&rdquo; by {a.owner}</Link>}
                <p className="text-sm text-muted">Waiting since {a.since.toISOString().slice(0, 10)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <h2 className="mt-12 font-display text-3xl">Reports to review</h2>
      <p className="mt-2 text-muted">Oldest first. Reports about shared projects and peer feedback.</p>
      {reports.length === 0 ? <p className="mt-8 text-muted">No open reports.</p> : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {reports.map((r) => (
            <li key={r.id} className="py-4">
              <Link href={`/review/moderation/${r.id}`} className="font-medium underline">{r.type === "PROJECT" ? "Project" : "Feedback on"} &ldquo;{r.title}&rdquo; by {r.owner}</Link>
              <p className="text-sm text-muted">{r.visibility.toLowerCase()}{r.held ? " · on hold" : ""} · {r.createdAt.toISOString().slice(0, 10)}</p>
              <p className="mt-1 max-w-measure text-sm">Reported: {r.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
