import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { PortfolioError } from "@/lib/portfolio";
import { decideApproval, getApprovalDetail } from "@/lib/portfolio/moderation";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

async function decide(formData: FormData) {
  "use server";
  const user = await requireUser(["REVIEWER", "ADMIN"]);
  const id = String(formData.get("projectId"));
  try {
    await decideApproval(user, id, String(formData.get("decision")) === "approve" ? "approve" : "reject", String(formData.get("note") ?? ""), String(formData.get("fingerprint")));
  } catch (e) {
    if (e instanceof PortfolioError) redirect(`/review/moderation/approvals/${id}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect("/review/moderation");
}

export default async function ApprovalDetail({ params, searchParams }: { params: { projectId: string }; searchParams: { error?: string } }) {
  const user = await requireUser(["REVIEWER", "ADMIN"]);
  let d;
  try {
    d = await getApprovalDetail(user, params.projectId);
  } catch (e) {
    if (e instanceof PortfolioError) {
      return (
        <div className="mx-auto max-w-xl px-6 py-24">
          <h1 className="font-display text-3xl">Cannot open this project</h1>
          <p className="mt-3 text-muted">{e.code === "own_project" ? "You cannot moderate your own work." : "It does not exist, or you do not have access."}</p>
          <Link href="/review/moderation" className="mt-6 inline-block underline">Back to the queue</Link>
        </div>
      );
    }
    throw e;
  }
  const open = d.status === "PENDING" && d.visibility === "PUBLIC" && !d.held;
  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/review/moderation" className="text-sm underline">Public approvals</Link>
      <h1 className="mt-4 font-display text-4xl">{d.title}</h1>
      <p className="mt-1 text-muted">By {d.owner}</p>
      <p className="mt-4 max-w-measure text-sm text-muted">You are deciding whether everything below may be shown to anyone on the web and listed in the gallery. If the owner changes any of it, it comes back for review. Judge the images yourself: no automated image screening is configured.</p>

      <section className="mt-6 space-y-2 rounded border border-line bg-raised p-4 text-sm" aria-label="Automatic checks">
        <p><strong>Image screening:</strong> {d.imageScreening.status === "unscreened" ? "not screened (none configured), so this is on you." : d.imageScreening.status}</p>
        <p><strong>Text checks:</strong> {d.textFlags.length === 0 && !d.textRefusal ? "nothing found by a basic filter (it only catches contact details, links and a short term list)." : [d.textRefusal, ...d.textFlags].filter(Boolean).join("; ")}</p>
      </section>

      {d.summary && <><h2 className="mt-6 font-medium">Introduction</h2><p className="mt-1 max-w-measure whitespace-pre-line">{d.summary}</p></>}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {d.images.map((i) => (
          <figure key={i.idx} className="rounded border border-line bg-raised p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/submissions/${d.submissionId}/files/${i.idx}`} alt={`${i.label} to be shown publicly`} className="max-h-96 w-full object-contain" />
            <figcaption className="mt-2 text-sm text-muted">{i.label}</figcaption>
          </figure>
        ))}
      </div>
      {d.rationale && <><h2 className="mt-6 font-medium">Written rationale (shown)</h2><p className="mt-1 max-w-measure whitespace-pre-line text-muted">{d.rationale}</p></>}
      {d.showsEvaluation && <p className="mt-4 text-sm text-muted">The owner also chose to show their assessment result.</p>}

      {!open ? <p className="mt-8 rounded border border-line bg-raised p-4">This project is not waiting for approval (status: {d.status.toLowerCase()}).</p> : (
        <form action={decide} className="mt-10 space-y-4">
          <input type="hidden" name="projectId" value={d.id} />
          <input type="hidden" name="fingerprint" value={d.fingerprint} />
          {searchParams.error && <p role="alert" className="text-danger">{searchParams.error}</p>}
          <div><label htmlFor="note" className="block text-sm font-medium">Note to the owner (required to reject)</label>
            <textarea id="note" name="note" rows={3} maxLength={500} className="mt-1 w-full rounded border border-line bg-raised p-3" /></div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" name="decision" value="approve">Approve for public</Button>
            <Button type="submit" name="decision" value="reject" variant="secondary">Do not approve</Button>
          </div>
        </form>
      )}
    </article>
  );
}
