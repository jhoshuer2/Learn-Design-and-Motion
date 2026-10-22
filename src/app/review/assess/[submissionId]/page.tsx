import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { ReviewError } from "@/lib/review";
import { humanAssess } from "@/lib/review/assess";
import { Button } from "@/components/ui/Button";
import type { StoredFile } from "@/lib/submissions/access";

export const dynamic = "force-dynamic";

async function assess(formData: FormData) {
  "use server";
  const user = await requireUser(["REVIEWER", "ADMIN"]);
  const submissionId = String(formData.get("submissionId"));
  const ids = formData.getAll("criterionId").map(String);
  let target = "/admin/assessments";
  try {
    await humanAssess(user, submissionId, {
      note: String(formData.get("note") ?? ""),
      scores: ids.map((id) => ({ criterionId: id, score: Number(formData.get(`score_${id}`)), comment: String(formData.get(`comment_${id}`) ?? "") })),
    });
  } catch (e) {
    if (e instanceof ReviewError) target = `/review/assess/${submissionId}?error=${encodeURIComponent(e.message)}`;
    else throw e;
  }
  redirect(target);
}

export default async function AssessByPerson({ params, searchParams }: { params: { submissionId: string }; searchParams: { error?: string } }) {
  const user = await requireUser(["REVIEWER", "ADMIN"]);
  const sub = await db.submission.findUnique({
    where: { id: params.submissionId },
    include: { assignment: { include: { rubricVersion: { include: { criteria: { orderBy: { weight: "desc" } } } } } } },
  });
  const blocked = !sub ? "It does not exist."
    : sub.userId === user.id ? "You cannot assess your own work."
    : sub.status !== "SUBMITTED" && sub.status !== "FAILED_TO_EVALUATE" ? "This submission is not waiting for a first assessment."
    : null;
  if (!sub || blocked) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24">
        <h1 className="font-display text-3xl">Cannot assess this</h1>
        <p className="mt-3 text-muted">{blocked}</p>
        <Link href="/admin/assessments" className="mt-6 inline-block underline">Back to assessments</Link>
      </div>
    );
  }
  const files = sub.files as unknown as StoredFile[];
  const rv = sub.assignment.rubricVersion;
  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/admin/assessments" className="text-sm underline">Assessments</Link>
      <h1 className="mt-4 font-display text-4xl">{sub.assignment.title}, attempt {sub.attempt}</h1>
      <p className="mt-2 max-w-measure text-muted">No automatic result exists for this work. Your scores go through the same server-side scoring as the automatic assessor: you score each criterion, the platform computes the result from the published rubric (pass mark {rv.threshold}%). The learner will see that a person assessed it. Learner identity is not shown.</p>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {files.map((f, i) => (
          <figure key={i} className="rounded border border-line bg-raised p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/submissions/${sub.id}/files/${i}`} alt={`${f.slot} image: ${f.name}`} className="max-h-96 w-full object-contain" />
            <figcaption className="mt-2 text-sm text-muted">{f.slot} · {f.width}×{f.height}px</figcaption>
          </figure>
        ))}
      </section>
      <h2 className="mt-8 font-medium">Learner&rsquo;s rationale</h2>
      <p className="mt-1 max-w-measure whitespace-pre-line text-muted">{sub.rationale}</p>
      {sub.changesNote && <><h2 className="mt-4 font-medium">What changed</h2><p className="mt-1 max-w-measure whitespace-pre-line text-muted">{sub.changesNote}</p></>}

      <form action={assess} className="mt-10 space-y-6">
        <input type="hidden" name="submissionId" value={sub.id} />
        <h2 className="font-display text-2xl">Score each criterion</h2>
        {searchParams.error && <p role="alert" className="text-danger">{searchParams.error}</p>}
        <ul className="space-y-4">
          {rv.criteria.map((c) => (
            <li key={c.id} className="rounded border border-line bg-raised p-4">
              <input type="hidden" name="criterionId" value={c.id} />
              <p className="font-medium">{c.title} <span className="text-sm font-normal text-muted">weight {c.weight}%{c.mandatory ? `, required minimum ${c.minScore}%` : ""}</span></p>
              <p className="mt-1 text-sm text-muted">{c.description}</p>
              <div className="mt-3 flex flex-wrap items-end gap-4">
                <div><label htmlFor={`score_${c.id}`} className="block text-sm">Score (0-100)</label>
                  <input id={`score_${c.id}`} name={`score_${c.id}`} type="number" min={0} max={100} step={1} required className="mt-1 min-h-11 w-24 rounded border border-line bg-surface px-2" /></div>
                <div className="grow"><label htmlFor={`comment_${c.id}`} className="block text-sm">What you saw, and how to improve it</label>
                  <input id={`comment_${c.id}`} name={`comment_${c.id}`} required minLength={5} className="mt-1 min-h-11 w-full rounded border border-line bg-surface px-2" /></div>
              </div>
            </li>
          ))}
        </ul>
        <div><label htmlFor="note" className="block text-sm font-medium">Note to the learner</label>
          <textarea id="note" name="note" required minLength={10} rows={4} className="mt-1 w-full rounded border border-line bg-raised p-3" /></div>
        <Button type="submit">Record my assessment</Button>
      </form>
    </article>
  );
}
