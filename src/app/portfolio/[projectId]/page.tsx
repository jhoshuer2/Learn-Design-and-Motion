import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { PortfolioError, deleteProject, getMyProject, updateProject } from "@/lib/portfolio";
import { listBlocked, unblockReviewer } from "@/lib/portfolio/peer";
import { getEvidencePreview, labelFor } from "@/lib/portfolio/view";
import { slotOf, type StoredFile } from "@/lib/submissions/access";
import { Button } from "@/components/ui/Button";

async function save(formData: FormData) {
  "use server";
  const user = await requireUser();
  const id = String(formData.get("projectId"));
  try {
    await updateProject(user.id, id, {
      title: String(formData.get("title") ?? ""),
      summary: String(formData.get("summary") ?? ""),
      visibility: String(formData.get("visibility")) as "PRIVATE" | "LINK" | "PUBLIC",
      shownFiles: formData.getAll("shown").map(Number),
      showRationale: formData.get("showRationale") === "on",
      showEvaluation: formData.get("showEvaluation") === "on",
    });
  } catch (e) {
    if (e instanceof PortfolioError) redirect(`/portfolio/${id}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(`/portfolio/${id}?saved=1`);
}

async function remove(formData: FormData) {
  "use server";
  const user = await requireUser();
  if (formData.get("confirm") !== "on") redirect(`/portfolio/${formData.get("projectId")}?error=${encodeURIComponent("Tick the box to confirm you want to delete this project.")}`);
  await deleteProject(user.id, String(formData.get("projectId")));
  redirect("/portfolio");
}

async function unblock(formData: FormData) {
  "use server";
  const user = await requireUser();
  await unblockReviewer(user.id, String(formData.get("userId")));
  redirect(`/portfolio/${formData.get("projectId")}`);
}

const OPTIONS = [
  { value: "PRIVATE", title: "Private", body: "Only you can see it." },
  { value: "LINK", title: "Anyone with the link", body: "It is not listed anywhere, but anyone who has the link can open it and pass it on. Treat the link like a key." },
  { value: "PUBLIC", title: "Public", body: "Anyone on the web can see it, and it is listed in the community gallery and on your public portfolio page. A reviewer checks it first: until they approve it, nobody but you can see it. If you change what it shows, it is checked again. We ask search engines not to index it, but people can still copy what they see." },
] as const;

export default async function EditProject({ params, searchParams }: { params: { projectId: string }; searchParams: { error?: string; saved?: string } }) {
  const user = await requireUser();
  const p = await getMyProject(user.id, params.projectId).catch(() => null);
  if (!p) notFound();
  const [preview, blocked] = await Promise.all([getEvidencePreview(user.id, p.id), listBlocked(user.id)]);
  const files = p.submission.files as unknown as StoredFile[];
  const h = headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const link = `${origin}/p/${p.slug}`;

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <nav className="text-sm"><Link href="/portfolio" className="underline">My portfolio</Link></nav>
      <h1 className="mt-4 font-display text-4xl">{p.submission.assignment.title}</h1>
      {p.moderationHold && <p role="alert" className="mt-4 rounded border border-danger p-3 text-danger">This project is on hold after a report, so it cannot be shared. It stays private to you.</p>}
      {p.visibility === "PUBLIC" && !p.moderationHold && (
        <p data-testid="approval" className={`mt-4 rounded border p-3 ${p.publicApproval === "REJECTED" ? "border-danger text-danger" : "border-line"}`}>
          {p.publicApproval === "APPROVED" ? "Approved: this project is public."
            : p.publicApproval === "REJECTED" ? `Not approved for public sharing${p.approvalNote ? `: ${p.approvalNote}` : "."} Change it and save to ask again, or share it by link instead.`
            : "Waiting for a reviewer. Until it is approved only you can see it."}
        </p>
      )}
      {searchParams.error && <p role="alert" className="mt-4 text-danger">{searchParams.error}</p>}
      {searchParams.saved && <p role="status" className="mt-4 text-success">Saved.</p>}

      <form action={save} className="mt-8 space-y-8">
        <input type="hidden" name="projectId" value={p.id} />
        <fieldset>
          <legend className="font-display text-2xl">Who can see this</legend>
          <p className="mt-1 text-sm text-muted">Only share work that is yours. Titles, introductions and rationales cannot contain contact details or links. See the <Link className="underline" href="/policy">content policy</Link>.</p>
          <div className="mt-3 space-y-3">
            {OPTIONS.map((o) => (
              <label key={o.value} className="flex gap-3 rounded border border-line bg-raised p-4">
                <input type="radio" name="visibility" value={o.value} defaultChecked={p.visibility === o.value} className="mt-1" />
                <span><strong>{o.title}</strong><span className="block text-sm text-muted">{o.body}</span></span>
              </label>
            ))}
          </div>
          {!p.user.displayName && <p className="mt-3 text-sm text-warn">You need a <Link className="underline" href="/profile">display name</Link> before you can share. Your name and email are never shown.</p>}
          {p.visibility !== "PRIVATE" && (
            <div className="mt-4">
              <label htmlFor="link" className="block text-sm font-medium">Link to this project</label>
              <input id="link" readOnly value={link} className="mt-1 min-h-11 w-full rounded border border-line bg-raised px-3 font-mono text-sm" />
            </div>
          )}
        </fieldset>

        <div className="space-y-4">
          <h2 className="font-display text-2xl">What it shows</h2>
          <div><label htmlFor="title" className="block text-sm font-medium">Title</label>
            <input id="title" name="title" defaultValue={p.title} required maxLength={100} className="mt-1 min-h-11 w-full rounded border border-line bg-raised px-3" /></div>
          <div><label htmlFor="summary" className="block text-sm font-medium">Short introduction (optional, up to 600 characters)</label>
            <textarea id="summary" name="summary" defaultValue={p.summary ?? ""} maxLength={600} rows={3} className="mt-1 w-full rounded border border-line bg-raised p-3" /></div>
          <fieldset>
            <legend className="text-sm font-medium">Images to show</legend>
            <p className="text-sm text-muted">Shared images are re-saved without location and camera data. The originals stay private.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {files.map((f, i) => (
                <label key={i} className="rounded border border-line bg-raised p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/submissions/${p.submissionId}/files/${i}`} alt={`${labelFor(p.submission.assignment.brief, slotOf(f))} from your submission`} className="max-h-48 w-full object-contain" />
                  <span className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="shown" value={i} defaultChecked={p.shownFiles.includes(i)} />Show {labelFor(p.submission.assignment.brief, slotOf(f))}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-3"><input type="checkbox" name="showRationale" defaultChecked={p.showRationale} />Show my written rationale</label>
        </div>

        <div>
          <h2 className="font-display text-2xl">Assessment result</h2>
          <label className="mt-3 flex items-center gap-3"><input type="checkbox" name="showEvaluation" defaultChecked={p.showEvaluation} />Show my assessment result on this project</label>
          {preview ? (
            <div className="mt-3 rounded border border-line bg-raised p-4 text-sm">
              <p className="font-medium">If you switch this on, visitors will see:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                <li>Your score ({preview.evidence.score}%) and each criterion&rsquo;s score, against a {preview.evidence.threshold}% pass mark.</li>
                <li>Who assessed it: <strong>{preview.evidence.assessedBy}</strong>, the rubric version and the date.</li>
                <li>{preview.evidence.verified ? "A \"verified\" mark, because it passed with a real assessor." : "No \"verified\" mark. That is only given to a passed result from a real assessor."}</li>
                {preview.skills.length > 0 && <li>Skills shown in the work: {preview.skills.join(", ")}.</li>}
                <li>A reminder that it is a learning assessment, not a qualification.</li>
              </ul>
              {preview.evidence.testEvaluator && <p className="mt-2 text-warn">This result came from a test evaluator and will be labelled as one.</p>}
            </div>
          ) : <p className="mt-2 text-sm text-muted">No assessment result is available for this work.</p>}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit">Save</Button>
          {p.visibility !== "PRIVATE" && <Link className="underline" href={`/p/${p.slug}`}>View the page as others see it</Link>}
        </div>
      </form>

      {blocked.length > 0 && (
        <section className="mt-12 border-t border-line pt-8">
          <h2 className="font-display text-2xl">People you have blocked from reviewing</h2>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {blocked.map((b) => (
              <li key={b.userId} className="flex items-center justify-between gap-4 py-3">
                <span>{b.name}</span>
                <form action={unblock}><input type="hidden" name="projectId" value={p.id} /><input type="hidden" name="userId" value={b.userId} /><Button type="submit" variant="secondary">Unblock</Button></form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12 border-t border-line pt-8">
        <h2 className="font-display text-2xl">Delete this project</h2>
        <p className="mt-2 max-w-measure text-sm text-muted">This removes the project page and its feedback. Your submission and assessment are not deleted.</p>
        <form action={remove} className="mt-3 space-y-3">
          <input type="hidden" name="projectId" value={p.id} />
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="confirm" />I understand this cannot be undone</label>
          <Button type="submit" variant="secondary">Delete project</Button>
        </form>
      </section>
    </article>
  );
}
