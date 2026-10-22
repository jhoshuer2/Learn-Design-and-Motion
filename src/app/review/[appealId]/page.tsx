import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ReviewError, getAppealForReview, resolveAppeal, type Resolution } from "@/lib/review";
import { Button } from "@/components/ui/Button";
import type { StoredFile } from "@/lib/submissions/access";

async function resolve(formData: FormData) {
  "use server";
  const user = await requireUser(["REVIEWER", "ADMIN"]);
  const appealId = String(formData.get("appealId"));
  const note = String(formData.get("note") ?? "");
  const decision = String(formData.get("decision"));
  let target = "/review";
  try {
    let res: Resolution;
    if (decision === "uphold") {
      res = { decision: "uphold", note };
    } else {
      const ids = formData.getAll("criterionId").map(String);
      res = {
        decision: "override", note,
        scores: ids.map((id) => ({ criterionId: id, score: Number(formData.get(`score_${id}`)), comment: String(formData.get(`comment_${id}`) ?? "") })),
      };
    }
    await resolveAppeal(user, appealId, res);
  } catch (e) {
    if (e instanceof ReviewError) target = `/review/${appealId}?error=${encodeURIComponent(e.message)}`;
    else throw e;
  }
  redirect(target);
}

export default async function ReviewAppeal({ params, searchParams }: { params: { appealId: string }; searchParams: { error?: string } }) {
  const user = await requireUser(["REVIEWER", "ADMIN"]);
  let a;
  try {
    a = await getAppealForReview(user, params.appealId);
  } catch (e) {
    if (e instanceof ReviewError) {
      return (
        <div className="mx-auto max-w-xl px-6 py-24">
          <h1 className="font-display text-3xl">Cannot open this appeal</h1>
          <p className="mt-3 text-muted">{e.code === "own_submission" ? "You cannot review your own work." : "It does not exist, or you do not have access."}</p>
          <Link href="/review" className="mt-6 inline-block underline">Back to the queue</Link>
        </div>
      );
    }
    throw e;
  }
  const ev = a.evaluation;
  const sub = ev.submission;
  const files = sub.files as unknown as StoredFile[];
  const open = a.status === "OPEN";
  const scores = [...ev.scores].sort((x, y) => y.criterion.weight - x.criterion.weight);

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/review" className="text-sm underline">Appeals</Link>
      <h1 className="mt-4 font-display text-4xl">{sub.assignment.title}, attempt {sub.attempt}</h1>
      <p className="mt-2 text-muted">Assessed by <strong>{ev.provider}</strong>: {ev.overallScore}% against a pass mark of {sub.assignment.rubricVersion.threshold}%. Confidence {ev.confidence ?? "n/a"}{ev.reviewFlag ? ", flagged" : ""}.</p>

      <section className="mt-6 rounded border border-line bg-raised p-4">
        <h2 className="font-medium">Learner&rsquo;s appeal</h2>
        <p className="mt-1 whitespace-pre-line">{a.reason}</p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {files.map((f, i) => (
          <figure key={i} className="rounded border border-line bg-raised p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/submissions/${sub.id}/files/${i}`} alt={`${f.role} image: ${f.name}`} className="max-h-96 w-full object-contain" />
            <figcaption className="mt-2 text-sm text-muted">{f.role} · {f.width}×{f.height}px</figcaption>
          </figure>
        ))}
      </section>
      <h2 className="mt-8 font-medium">Learner&rsquo;s rationale</h2>
      <p className="mt-1 max-w-measure whitespace-pre-line text-muted">{sub.rationale}</p>

      {!open ? (
        <p className="mt-8 rounded border border-line bg-raised p-4">This appeal is already resolved: {a.status.toLowerCase()}. {a.resolution}</p>
      ) : (
        <form action={resolve} className="mt-10 space-y-6">
          <input type="hidden" name="appealId" value={a.id} />
          <h2 className="font-display text-2xl">Assessor&rsquo;s scores</h2>
          <p className="text-sm text-muted">Change a score only if you disagree with it, and say why. Required criteria are marked.</p>
          {searchParams.error && <p role="alert" className="text-danger">{searchParams.error}</p>}
          <ul className="space-y-4">
            {scores.map((s) => (
              <li key={s.id} className="rounded border border-line bg-raised p-4">
                <input type="hidden" name="criterionId" value={s.criterionId} />
                <p className="font-medium">{s.criterion.title} <span className="text-sm font-normal text-muted">weight {s.criterion.weight}%{s.criterion.mandatory ? `, required minimum ${s.criterion.minScore}%` : ""}</span></p>
                <p className="mt-1 text-sm text-muted">{s.evidence}</p>
                <div className="mt-3 flex flex-wrap items-end gap-4">
                  <div><label htmlFor={`score_${s.criterionId}`} className="block text-sm">Score (0-100)</label>
                    <input id={`score_${s.criterionId}`} name={`score_${s.criterionId}`} type="number" min={0} max={100} step={1} defaultValue={s.score} required className="mt-1 min-h-11 w-24 rounded border border-line bg-surface px-2" /></div>
                  <div className="grow"><label htmlFor={`comment_${s.criterionId}`} className="block text-sm">Reason if changed</label>
                    <input id={`comment_${s.criterionId}`} name={`comment_${s.criterionId}`} className="mt-1 min-h-11 w-full rounded border border-line bg-surface px-2" /></div>
                </div>
              </li>
            ))}
          </ul>
          <div><label htmlFor="note" className="block text-sm font-medium">Decision note, shown to the learner</label>
            <textarea id="note" name="note" required minLength={10} rows={4} className="mt-1 w-full rounded border border-line bg-raised p-3" /></div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" name="decision" value="override">Apply my scores</Button>
            <Button type="submit" name="decision" value="uphold" variant="secondary" formNoValidate>Uphold the original result</Button>
          </div>
        </form>
      )}
    </article>
  );
}
