import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listOpenAppeals } from "@/lib/review";

export default async function ReviewQueue() {
  const user = await requireUser(["REVIEWER", "ADMIN"]);
  const appeals = await listOpenAppeals(user);
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/dashboard" className="text-sm link-quiet font-semibold">Dashboard</Link>
      <h1 className="mt-4 display display-m">Appeals to review</h1>
      <p className="mt-2 text-ink-2">Oldest first. Learner identities are not shown.</p>
      {appeals.length === 0 ? <p className="mt-8 text-ink-2">No open appeals.</p> : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {appeals.map((a) => (
            <li key={a.id} className="py-4">
              <Link href={`/review/${a.id}`} className="font-medium link-quiet font-semibold">{a.assignment}, attempt {a.attempt}</Link>
              <p className="text-sm text-ink-2">Score {a.score}%{a.flagged ? " · flagged by the assessor" : ""} · {a.createdAt.toISOString().slice(0, 10)}</p>
              <p className="mt-1 line-clamp-2 max-w-measure text-sm">{a.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
