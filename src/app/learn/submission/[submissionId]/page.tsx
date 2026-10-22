import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { retryEvaluation } from "@/lib/submissions";
import { ReviewError, createAppeal } from "@/lib/review";
import { getSubmissionView, type CriterionView } from "@/lib/submissions/view";
import { Button } from "@/components/ui/Button";
import { StateBadge } from "@/components/ui/StateBadge";

export const maxDuration = 300;

async function retry(formData: FormData) {
  "use server";
  const user = await requireUser();
  const id = String(formData.get("submissionId"));
  await retryEvaluation(user.id, id);
  redirect(`/learn/submission/${id}`);
}

async function appeal(formData: FormData) {
  "use server";
  const user = await requireUser();
  const id = String(formData.get("submissionId"));
  let target = `/learn/submission/${id}`;
  try {
    await createAppeal(user.id, String(formData.get("evaluationId")), String(formData.get("reason") ?? ""));
  } catch (e) {
    if (e instanceof ReviewError) target += `?appealError=${encodeURIComponent(e.message)}`;
    else throw e;
  }
  redirect(target);
}

const FAILURE: Record<string, string> = {
  invalid_output: "The assessor returned a result we could not validate, so no score was recorded.",
  provider_error: "The assessor could not be reached, so no score was recorded.",
  provider_refused: "The assessor could not review this submission. It has been flagged for human review. No score was recorded.",
};

function Criterion({ c }: { c: CriterionView }) {
  return (
    <li className="rounded border border-line bg-raised p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">{c.title} <span className="text-sm font-normal text-muted">weight {c.weight}%</span></h3>
        <p className="font-display text-2xl">{c.score}%</p>
      </div>
      <div className="mt-2 h-1.5 rounded bg-line" aria-hidden><div className={`h-full rounded ${c.belowMinimum ? "bg-danger" : "bg-accent"}`} style={{ width: `${c.score}%` }} /></div>
      {c.mandatory && (
        <p className={`mt-2 text-sm ${c.belowMinimum ? "text-danger" : "text-muted"}`}>
          {c.belowMinimum ? "Below the" : "Required:"} minimum of {c.minScore}%{c.belowMinimum ? ", so this criterion must be improved to pass." : "."}
        </p>
      )}
      <dl className="mt-3 space-y-2 text-sm">
        <div><dt className="font-medium">What is happening</dt><dd className="text-muted">{c.evidence}</dd></div>
        {c.where && <div><dt className="font-medium">Where</dt><dd className="text-muted">{c.where}</dd></div>}
        <div><dt className="font-medium">Why it matters</dt><dd className="text-muted">{c.explanation}</dd></div>
        {c.principle && <div><dt className="font-medium">Principle</dt><dd className="text-muted">{c.principle}</dd></div>}
        <div><dt className="font-medium">How to improve</dt><dd className="text-muted">{c.improvement}</dd></div>
        {c.verify && <div><dt className="font-medium">How to check it worked</dt><dd className="text-muted">{c.verify}</dd></div>}
      </dl>
    </li>
  );
}

const List = ({ title, items }: { title: string; items: string[] }) =>
  items.length === 0 ? null : (
    <div><h3 className="font-medium">{title}</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-muted">{items.map((i) => <li key={i}>{i}</li>)}</ul></div>
  );

export default async function SubmissionPage({ params, searchParams }: { params: { submissionId: string }; searchParams: { appealError?: string } }) {
  const user = await requireUser();
  const v = await getSubmissionView(user, params.submissionId);
  if (!v) notFound();
  const ev = v.evaluation;
  const done = ev?.status === "complete";

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <nav className="text-sm"><Link href="/learn" className="underline">My learning</Link></nav>
      <p className="mt-6 text-sm uppercase tracking-widest text-muted">Attempt {v.attempt} of {v.assignment.maxAttempts}</p>
      <h1 className="mt-1 font-display text-4xl">{v.assignment.title}</h1>

      {ev?.isTestEvaluator && (
        <p role="note" className="mt-4 rounded border border-warn p-3 text-sm text-warn">
          TEST EVALUATOR. This result came from a deterministic test evaluator that did not look at your work. It is not an assessment.
        </p>
      )}

      {!ev && v.status === "SUBMITTED" && (
        <section className="mt-8 rounded border border-line bg-raised p-5">
          <StateBadge state="awaiting" />
          <h2 className="mt-3 font-display text-2xl">Not assessed yet</h2>
          <p className="mt-2 text-muted">Your work is saved, but no assessment has run. Automated assessment may not be configured on this server. No score has been recorded and no attempt has been used.</p>
          {v.isOwner && <form action={retry} className="mt-4"><input type="hidden" name="submissionId" value={v.id} /><Button type="submit">Try assessment again</Button></form>}
        </section>
      )}
      {v.status === "EVALUATING" && (
        <section className="mt-8 rounded border border-line bg-raised p-5"><StateBadge state="awaiting" /><h2 className="mt-3 font-display text-2xl">Being assessed</h2><p className="mt-2 text-muted">Refresh this page in a minute.</p></section>
      )}
      {v.status === "NEEDS_EVIDENCE" && ev && (
        <section className="mt-8 rounded border border-line bg-raised p-5">
          <StateBadge state="awaiting" />
          <h2 className="mt-3 font-display text-2xl">We need more from you</h2>
          <p className="mt-2 text-muted">We could not assess this yet. Nothing has been scored and this did not use an attempt. Please add:</p>
          <ul className="mt-2 list-disc pl-5">{ev.missingEvidence.map((m) => <li key={m}>{m}</li>)}</ul>
          {v.isOwner && <p className="mt-4"><Link className="underline" href={`/learn/assignment/${v.assignment.id}`}>Add the missing items</Link></p>}
        </section>
      )}
      {v.status === "FAILED_TO_EVALUATE" && (
        <section className="mt-8 rounded border border-line bg-raised p-5">
          <StateBadge state="failed" />
          <h2 className="mt-3 font-display text-2xl">Assessment did not complete</h2>
          <p className="mt-2 text-muted">{FAILURE[ev?.failureReason ?? ""] ?? "Assessment did not complete."} This did not use an attempt.</p>
          {v.isOwner && <form action={retry} className="mt-4"><input type="hidden" name="submissionId" value={v.id} /><Button type="submit">Try assessment again</Button></form>}
        </section>
      )}

      {done && ev && (
        <>
          <section className="mt-8 rounded border border-line bg-raised p-5" aria-labelledby="result">
            <StateBadge state={ev.passed ? "completed" : "failed"} />
            <h2 id="result" className="mt-3 font-display text-3xl">{ev.passed ? "Passed" : "Not yet"}: {ev.score}%</h2>
            <p className="text-sm text-muted">Pass mark {ev.threshold}%{ev.humanReviewed ? " · Reviewed by a person" : ""}</p>
            <ul className="mt-3 list-disc space-y-1 pl-5">{ev.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            {(ev.reviewFlag || ev.confidence === "low") && (
              <p className="mt-3 text-sm text-warn">The assessor was not fully confident about this result. It has been flagged so a person can look at it.</p>
            )}
            <p className="mt-3 text-sm text-muted">This was assessed by an AI assessor against the published rubric. It is a learning aid, not an unquestionable verdict.</p>
          </section>

          <section className="mt-8 grid gap-6 sm:grid-cols-2">
            <List title="Strengths" items={ev.strengths} />
            <List title="To work on" items={ev.weaknesses} />
            <List title="Missing from the brief" items={ev.missingRequirements} />
            <List title="Critical issues" items={ev.criticalFailures} />
          </section>

          <section className="mt-10">
            <h2 className="font-display text-2xl">Criterion by criterion</h2>
            <ol className="mt-4 space-y-4">{v.criteria.map((c) => <Criterion key={c.key} c={c} />)}</ol>
          </section>

          {v.remediation.length > 0 && (
            <section className="mt-10">
              <h2 className="font-display text-2xl">Practise these next</h2>
              <ul className="mt-2 list-disc pl-5">{v.remediation.map((r) => <li key={r.lessonId}><Link className="underline" href={`/learn/lesson/${r.lessonId}`}>{r.title}</Link> <span className="text-sm text-muted">({r.competency})</span></li>)}</ul>
            </section>
          )}

          {v.isOwner && (
            <section className="mt-10 flex flex-wrap items-center gap-4">
              {ev.passed ? <Link className="underline" href="/learn">Back to my learning</Link>
                : v.access?.allowed ? <Link className="underline" href={`/learn/assignment/${v.assignment.id}`}>Revise and resubmit</Link>
                : <p className="text-muted">You have used all your attempts.</p>}
            </section>
          )}
        </>
      )}

      {v.status === "IN_HUMAN_REVIEW" && (
        <p role="status" className="mt-6 rounded border border-line bg-raised p-4">Your appeal is with a human reviewer. You will see their decision here.</p>
      )}
      {v.appeal && v.appeal.status !== "OPEN" && (
        <section className="mt-8 rounded border border-line bg-raised p-5">
          <h2 className="font-display text-2xl">Human review: {v.appeal.status === "UPHELD" ? "original result confirmed" : "scores changed"}</h2>
          <p className="mt-2 max-w-measure text-muted">{v.appeal.resolution}</p>
        </section>
      )}
      {v.isOwner && v.canAppeal && ev && (
        <section className="mt-10 border-t border-line pt-8">
          <h2 className="font-display text-2xl">Disagree with this result?</h2>
          <p className="mt-2 max-w-measure text-muted">You can ask a person to review it. Say what you think was missed or misjudged. While it is under review you cannot start another attempt.</p>
          {searchParams.appealError && <p role="alert" className="mt-3 text-danger">{searchParams.appealError}</p>}
          <form action={appeal} className="mt-4 space-y-3">
            <input type="hidden" name="submissionId" value={v.id} />
            <input type="hidden" name="evaluationId" value={ev.id} />
            <label htmlFor="reason" className="block text-sm font-medium">Your reason</label>
            <textarea id="reason" name="reason" required minLength={20} maxLength={2000} rows={4} className="w-full rounded border border-line bg-raised p-3" />
            <Button type="submit" variant="secondary">Ask for a human review</Button>
          </form>
        </section>
      )}

      <section className="mt-12 border-t border-line pt-8">
        <h2 className="font-display text-2xl">Submitted work</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {v.files.map((f) => (
            <figure key={f.idx} className="rounded border border-line bg-raised p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/submissions/${v.id}/files/${f.idx}`} alt={`${f.label} submitted by the learner: ${f.name}`} className="max-h-96 w-full object-contain" />
              <figcaption className="mt-2 text-sm text-muted">{f.label} · {f.width}×{f.height}px</figcaption>
            </figure>
          ))}
        </div>
        {v.rationale && <><h3 className="mt-6 font-medium">Rationale</h3><p className="mt-1 max-w-measure whitespace-pre-line text-muted">{v.rationale}</p></>}
        {v.changesNote && <><h3 className="mt-4 font-medium">What changed</h3><p className="mt-1 max-w-measure whitespace-pre-line text-muted">{v.changesNote}</p></>}
      </section>
    </article>
  );
}
