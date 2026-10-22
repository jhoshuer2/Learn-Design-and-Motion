import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { MIN_ACTION_PLAN_WORDS, RemediationError, completeRemediation, getRemediation, startRemediation } from "@/lib/progression/remediation";
import { Button } from "@/components/ui/Button";
import { StateBadge } from "@/components/ui/StateBadge";

async function start(formData: FormData) {
  "use server";
  const user = await requireUser();
  const id = String(formData.get("assignmentId"));
  try { await startRemediation(user.id, id); } catch (e) { if (!(e instanceof RemediationError)) throw e; }
  redirect(`/learn/remediation/${id}`);
}

async function complete(formData: FormData) {
  "use server";
  const user = await requireUser();
  const id = String(formData.get("assignmentId"));
  try {
    await completeRemediation(user.id, id, String(formData.get("plan") ?? ""));
  } catch (e) {
    if (e instanceof RemediationError) {
      const msg = e.code === "checks_incomplete" ? `Pass the knowledge check again for: ${e.detail?.missing?.join(", ")}.` : e.message;
      redirect(`/learn/remediation/${id}?error=${encodeURIComponent(msg)}`);
    }
    throw e;
  }
  redirect(`/learn/assignment/${id}`);
}

export default async function RemediationPage({ params, searchParams }: { params: { assignmentId: string }; searchParams: { error?: string } }) {
  const user = await requireUser();
  const r = await getRemediation(user.id, params.assignmentId).catch(() => null);
  if (!r) notFound();

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <nav className="text-sm"><Link href="/learn" className="underline">My learning</Link></nav>
      <h1 className="mt-6 font-display text-4xl">Remediation</h1>
      <p className="mt-2 text-muted">{r.assignment.title}</p>

      {r.open ? (
        <section className="mt-8">
          <p className="max-w-measure">You have used your {r.attempts.max} attempts. Show that you have worked on what the assessments found weak, and you will get 2 more attempts. This can be done once.</p>
          <h2 className="mt-8 font-display text-2xl">1. Pass these knowledge checks again</h2>
          <p className="mt-1 text-sm text-muted">Only checks passed after you started remediation count.</p>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {r.open.lessons.map((l) => (
              <li key={l.lessonId} className="flex items-center justify-between gap-4 py-3">
                <Link className="font-medium underline" href={`/learn/lesson/${l.lessonId}`}>{l.title}</Link>
                <StateBadge state={l.passedSince ? "completed" : "todo"} />
              </li>
            ))}
          </ul>
          <h2 className="mt-8 font-display text-2xl">2. Write your action plan</h2>
          {searchParams.error && <p role="alert" className="mt-3 text-danger">{searchParams.error}</p>}
          <form action={complete} className="mt-3 space-y-3">
            <input type="hidden" name="assignmentId" value={params.assignmentId} />
            <label htmlFor="plan" className="block text-sm font-medium">What will you change in your next attempt, and how will you check each change worked? (at least {MIN_ACTION_PLAN_WORDS} words)</label>
            <textarea id="plan" name="plan" required rows={5} className="w-full rounded border border-line bg-raised p-3" />
            <Button type="submit">Complete remediation</Button>
          </form>
        </section>
      ) : r.required ? (
        <section className="mt-8 rounded border border-line bg-raised p-5">
          <StateBadge state="failed" />
          <p className="mt-3 max-w-measure">You have used all {r.attempts.max} attempts without passing. Before you try again, you will re-pass the knowledge checks for the lessons behind your weakest criteria and write an action plan. You then get 2 more attempts.</p>
          <form action={start} className="mt-4"><input type="hidden" name="assignmentId" value={params.assignmentId} /><Button type="submit">Start remediation</Button></form>
        </section>
      ) : (
        <section className="mt-8 rounded border border-line bg-raised p-5">
          <p>{r.access.allowed ? `Remediation is complete or not needed. You have ${r.attempts.max - r.attempts.used} attempt(s) left.` : "Remediation is not available for this capstone right now."}</p>
          <p className="mt-3"><Link className="underline" href={`/learn/assignment/${params.assignmentId}`}>Back to the capstone</Link></p>
        </section>
      )}
    </article>
  );
}
