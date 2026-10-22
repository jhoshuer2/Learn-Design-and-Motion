import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listOpenReports } from "@/lib/portfolio/moderation";

export default async function ModerationQueue() {
  const user = await requireUser(["REVIEWER", "ADMIN"]);
  const reports = await listOpenReports(user);
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <nav className="flex gap-4 text-sm"><Link href="/dashboard" className="underline">Dashboard</Link><Link href="/review" className="underline">Appeals</Link></nav>
      <h1 className="mt-4 font-display text-4xl">Reports to review</h1>
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
