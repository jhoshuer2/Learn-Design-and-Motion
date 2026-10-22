import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { AdminError, adminPause, adminRequeue, adminResume, operatorSnapshot } from "@/lib/jobs/admin";
import { listAttention, type AttentionKind } from "@/lib/review/assess";
import { Button } from "@/components/ui/Button";
import { StateBadge } from "@/components/ui/StateBadge";

export const dynamic = "force-dynamic";

async function act(formData: FormData) {
  "use server";
  const user = await requireUser(["ADMIN"]);
  const what = String(formData.get("what"));
  let error = "";
  try {
    if (what === "pause") await adminPause(user);
    else if (what === "resume") await adminResume(user);
    else if (what === "requeue") await adminRequeue(user, String(formData.get("submissionId")));
  } catch (e) {
    if (e instanceof AdminError) error = e.message;
    else throw e;
  }
  redirect(`/admin/assessments${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

const REASON: Record<string, string> = {
  billing: "The assessor account has no credit. Add credit, then resume (it also resumes by itself once a test call works).",
  auth: "The assessor rejected our credentials. Replace the API key, restart the worker, then resume.",
  budget: "Today's spending cap was reached. It lifts at midnight UTC, or when the cap is raised.",
  not_configured: "No assessor is configured on the worker (no ANTHROPIC_API_KEY).",
  manual: "Paused by an administrator.",
};
const KIND: Record<AttentionKind, string> = {
  no_result: "No result recorded", failed_final: "Automatic assessment gave up", stuck: "Waiting too long", low_confidence: "Low confidence, not appealed",
};
const age = (d: Date) => { const m = Math.round((Date.now() - d.getTime()) / 60000); return m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };

export default async function AssessmentsAdmin({ searchParams }: { searchParams: { error?: string } }) {
  const user = await requireUser(["REVIEWER", "ADMIN"]);
  const admin = user.role === "ADMIN";
  const [snap, attention] = await Promise.all([operatorSnapshot(), listAttention(user)]);
  const oldest = snap.oldestQueuedAt ? age(snap.oldestQueuedAt) : "none waiting";

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/dashboard" className="text-sm underline">Dashboard</Link>
      <h1 className="mt-4 font-display text-4xl">Assessments</h1>
      <p className="mt-2 text-muted">The automatic assessment queue, and work that needs a person.{!admin && " You can see this page; only administrators can pause, resume or requeue."}</p>
      {searchParams.error && <p role="alert" className="mt-4 text-danger">{searchParams.error}</p>}

      {snap.pause ? (
        <section className="mt-6 rounded border border-warn p-5" aria-labelledby="paused">
          <StateBadge state="awaiting" />
          <h2 id="paused" className="mt-3 font-display text-2xl">Assessment is paused: {snap.pause.reason.replace("_", " ")}</h2>
          <p className="mt-2 max-w-measure">{REASON[snap.pause.reason]}</p>
          <p className="mt-1 text-sm text-muted">Since {snap.pause.since.slice(0, 16).replace("T", " ")} UTC. Learners see: &ldquo;Assessment is temporarily paused. Your work is saved and queued.&rdquo; Nothing is lost and no attempts are used while paused.</p>
          {admin && <form action={act} className="mt-4"><input type="hidden" name="what" value="resume" /><Button type="submit">Resume assessment</Button></form>}
        </section>
      ) : (
        <section className="mt-6 rounded border border-line bg-raised p-5">
          <StateBadge state="completed" />
          <p className="mt-2">Assessment is running.</p>
          {admin && <form action={act} className="mt-3"><input type="hidden" name="what" value="pause" /><Button type="submit" variant="secondary">Pause assessment</Button></form>}
        </section>
      )}

      <section className="mt-8 grid gap-4 sm:grid-cols-4" aria-label="Queue">
        {[["Waiting", snap.queued], ["Running", snap.running], ["Oldest waiting", oldest], ["Gave up", snap.failedFinal]].map(([label, value]) => (
          <div key={String(label)} className="rounded border border-line bg-raised p-4"><p className="text-sm text-muted">{label}</p><p className="font-display text-3xl">{value}</p></div>
        ))}
      </section>
      <p className="mt-3 text-sm text-muted">
        Spend today (UTC): about ${snap.spentTodayUsd.toFixed(2)}{snap.budgetUsd !== null ? ` of a $${snap.budgetUsd} cap` : ", no cap set"}. This is an estimate from recorded token counts at list prices, not your invoice.
      </p>
      {snap.failedByKind.length > 0 && (
        <p className="mt-1 text-sm text-muted">Gave up, by reason: {snap.failedByKind.map((f) => `${f.kind} (${f.count})`).join(", ")}.</p>
      )}

      <section className="mt-10" aria-labelledby="attention">
        <h2 id="attention" className="font-display text-2xl">Needs a person</h2>
        {attention.length === 0 ? <p className="mt-3 text-muted">Nothing needs attention.</p> : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {attention.map((a) => (
              <li key={`${a.submissionId}-${a.kind}`} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="font-medium">{a.assignment}, attempt {a.attempt}</p>
                  <p className="text-sm text-muted">{KIND[a.kind]} · {a.detail} · {age(a.since)} ago</p>
                </div>
                <div className="flex gap-3">
                  {a.kind !== "low_confidence" && <Link className="underline" href={`/review/assess/${a.submissionId}`}>Assess it yourself</Link>}
                  {admin && a.kind !== "low_confidence" && (
                    <form action={act}><input type="hidden" name="what" value="requeue" /><input type="hidden" name="submissionId" value={a.submissionId} /><Button type="submit" variant="secondary">Try automatic again</Button></form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
