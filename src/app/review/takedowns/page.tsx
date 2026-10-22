import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { TakedownError, listOpenTakedowns, resolveTakedown } from "@/lib/safety/takedown";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

async function decide(formData: FormData) {
  "use server";
  const user = await requireUser(["REVIEWER", "ADMIN"]);
  try {
    await resolveTakedown(user, String(formData.get("id")), String(formData.get("action")) === "hold" ? "hold" : "dismiss", String(formData.get("note") ?? ""));
  } catch (e) {
    if (e instanceof TakedownError) redirect(`/review/takedowns?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect("/review/takedowns");
}

export default async function Takedowns({ searchParams }: { searchParams: { error?: string } }) {
  const user = await requireUser(["REVIEWER", "ADMIN"]);
  const rows = await listOpenTakedowns(user);
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <nav className="flex gap-4 text-sm"><Link href="/dashboard" className="underline">Dashboard</Link><Link href="/review/moderation" className="underline">Approvals and reports</Link></nav>
      <h1 className="mt-4 font-display text-4xl">Takedown requests</h1>
      <p className="mt-2 max-w-measure text-muted">Complaints sent through the public report form. Oldest first. Complainant details are for replying only and are removed 90 days after a request is handled.</p>
      {searchParams.error && <p role="alert" className="mt-4 text-danger">{searchParams.error}</p>}
      {rows.length === 0 ? <p className="mt-8 text-muted">No open requests.</p> : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {rows.map((r) => (
            <li key={r.id} className="py-5">
              <p className="text-sm text-muted">{r.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC{r.reporterEmail ? ` · reply to ${r.reporterEmail}` : ""}{r.reporterName ? ` (${r.reporterName})` : ""}</p>
              <p className="mt-2 max-w-measure whitespace-pre-line">{r.reason}</p>
              <p className="mt-2 text-sm">{r.project ? <>Project: &ldquo;{r.project.title}&rdquo; ({r.project.visibility.toLowerCase()}{r.project.held ? ", on hold" : ""}){r.project.mine ? " (yours: another reviewer must decide)" : ""}</> : <>No matching project{r.link ? ` for “${r.link}”` : ""}.</>}</p>
              {!r.project?.mine && (
                <form action={decide} className="mt-3 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={r.id} />
                  <div className="grow"><label htmlFor={`note-${r.id}`} className="block text-sm">Reason (recorded, and told to the owner if held)</label>
                    <input id={`note-${r.id}`} name="note" required minLength={5} maxLength={500} className="mt-1 min-h-11 w-full rounded border border-line bg-raised px-2" /></div>
                  {r.project && <Button type="submit" name="action" value="hold">Take down (hold)</Button>}
                  <Button type="submit" name="action" value="dismiss" variant="secondary">Dismiss</Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
