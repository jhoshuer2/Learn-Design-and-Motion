import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getAssignmentAccess, type AssignmentDenied } from "@/lib/progression";
import { SubmissionError, UploadError, createSubmission, type UploadedFile } from "@/lib/submissions";
import { evaluateSubmission } from "@/lib/assessment/evaluate";
import { Button } from "@/components/ui/Button";
import { StateBadge } from "@/components/ui/StateBadge";

export const maxDuration = 300; // evaluation runs inside the submit action in this milestone

type Brief = {
  requirements: string[]; constraints: string[];
  deliverables: { key: string; label: string; description: string; role: string; required: boolean }[];
};

const DENIED: Record<AssignmentDenied | "changes_note_required" | "no_files" | "rationale_too_long" | "unknown_deliverable" | "duplicate_deliverable", string> = {
  not_found: "This assessment does not exist.",
  not_published: "This assessment is not available yet.",
  not_enrolled: "Enroll in this learning path to open its assessment.",
  level_locked: "This level opens when you complete the previous level.",
  lessons_incomplete: "Complete every lesson in this module first.",
  modules_incomplete: "Finish every module in this level first, including its assessment.",
  remediation_required: "You have used all your attempts. Complete targeted remediation to earn more.",
  unknown_deliverable: "That file does not match anything this assessment asks for.",
  duplicate_deliverable: "Each deliverable can be uploaded once.",
  already_passed: "You have already passed this assessment.",
  no_attempts_left: "You have used all your attempts and any remediation resets. You can appeal your last result for human review.",
  in_progress: "You already have a submission being assessed.",
  retry_evaluation: "Your last submission could not be assessed. Open it to retry; this does not use up an attempt.",
  changes_note_required: "Tell us what you changed since the last attempt (at least a few words).",
  no_files: "Add at least your final poster image.",
  rationale_too_long: "Your rationale is too long. Keep it under 4000 characters.",
};

async function submitWork(formData: FormData) {
  "use server";
  const user = await requireUser();
  const assignmentId = String(formData.get("assignmentId"));
  // Fields are the assignment's own deliverable keys. The server maps each to a role; the client cannot choose one.
  const asg = await db.assignment.findUnique({ where: { id: assignmentId } });
  const defs = ((asg?.brief ?? {}) as { deliverables?: { key: string }[] }).deliverables ?? [];
  const files: UploadedFile[] = [];
  for (const d of defs) {
    const f = formData.get(d.key);
    if (f instanceof File && f.size > 0) files.push({ slot: d.key, name: f.name, data: Buffer.from(await f.arrayBuffer()) });
  }

  let target = `/learn/assignment/${assignmentId}`;
  try {
    const { submissionId } = await createSubmission(user.id, assignmentId, {
      files, rationale: String(formData.get("rationale") ?? ""), changesNote: String(formData.get("changesNote") ?? ""),
    });
    target = `/learn/submission/${submissionId}`;
    await evaluateSubmission(submissionId); // result, or a clear state, is shown on the results page
  } catch (e) {
    if (e instanceof SubmissionError) target = `/learn/assignment/${assignmentId}?error=${e.code}`;
    else if (e instanceof UploadError) target = `/learn/assignment/${assignmentId}?upload=${encodeURIComponent(e.message)}`;
    else throw e;
  }
  redirect(target);
}

export default async function AssignmentPage({
  params, searchParams,
}: { params: { assignmentId: string }; searchParams: { error?: string; upload?: string } }) {
  const user = await requireUser();
  const a = await db.assignment.findUnique({
    where: { id: params.assignmentId },
    include: { rubricVersion: { include: { criteria: { orderBy: { weight: "desc" } } } } },
  });
  const access = await getAssignmentAccess(user.id, params.assignmentId);
  const blocked = !a ? "not_found"
    : !access.allowed && ["not_found", "not_published", "not_enrolled", "level_locked"].includes(access.reason) ? access.reason : null;
  if (!a || blocked) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24">
        <StateBadge state="locked" />
        <h1 className="mt-4 font-display text-3xl">Not available</h1>
        <p className="mt-3 text-muted">{DENIED[(blocked ?? "not_found") as AssignmentDenied]}</p>
        <Link href="/learn" className="mt-6 inline-block underline">Back to my learning</Link>
      </div>
    );
  }
  const brief = a.brief as unknown as Brief;
  const rv = a.rubricVersion;
  const amending = access.allowed && access.amending;
  const error = searchParams.error as keyof typeof DENIED | undefined;

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <nav className="text-sm"><Link href="/learn" className="underline">My learning</Link></nav>
      <p className="mt-6 text-sm uppercase tracking-widest text-muted">{a.kind === "CAPSTONE" ? "Level capstone" : "Module assessment"}</p>
      <h1 className="mt-1 font-display text-4xl">{a.title}</h1>
      <p className="mt-3 max-w-measure text-muted">{a.objective}</p>
      <p className="mt-2 text-sm text-muted">About {a.estimatedMinutes} minutes · difficulty {a.difficulty} of 5 · pass mark {rv.threshold}%</p>

      <section className="mt-8 space-y-6">
        <div><h2 className="font-display text-2xl">Scenario</h2><p className="mt-2 max-w-measure">{a.scenario}</p></div>
        <div><h2 className="font-display text-2xl">Requirements</h2><ul className="mt-2 list-disc space-y-1 pl-5">{brief.requirements.map((r) => <li key={r}>{r}</li>)}</ul></div>
        <div><h2 className="font-display text-2xl">Constraints</h2><ul className="mt-2 list-disc space-y-1 pl-5">{brief.constraints.map((r) => <li key={r}>{r}</li>)}</ul></div>
        <div>
          <h2 className="font-display text-2xl">What to submit</h2>
          <ul className="mt-2 space-y-1">{brief.deliverables.map((d) => (
            <li key={d.key}><strong>{d.label}</strong> {d.required ? "(required)" : "(optional)"}. {d.description}</li>
          ))}</ul>
          <p className="mt-2 text-sm text-muted">Only images are inspected: PNG, JPEG or WebP, up to 8 MB each. PDFs, videos and prototype links are not assessed yet.</p>
        </div>
        <div>
          <h2 className="font-display text-2xl">How it is assessed</h2>
          <p className="mt-2 max-w-measure text-muted">This is the published rubric. You are scored on each criterion and the weighted total must reach {rv.threshold}%. Criteria marked required must also reach their own minimum, whatever your total.</p>
          <table className="mt-3 w-full text-sm [&_th]:py-2 [&_th]:text-left">
            <thead><tr><th scope="col">Criterion</th><th scope="col">Weight</th><th scope="col">Required minimum</th></tr></thead>
            <tbody>{rv.criteria.map((c) => (
              <tr key={c.id} className="border-t border-line align-top">
                <td className="py-2 pr-3"><strong>{c.title}</strong><details className="mt-1"><summary className="cursor-pointer text-muted">What is assessed</summary><p className="mt-1 whitespace-pre-line text-muted">{c.description.trim()}</p></details></td>
                <td className="py-2">{c.weight}%</td>
                <td className="py-2">{c.mandatory ? `${c.minScore}%` : "None"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="mt-12 border-t border-line pt-8">
        <h2 className="font-display text-2xl">Your submission</h2>
        <p className="mt-2 text-sm text-muted">
          Attempt {access.allowed ? access.attempt : (access.attemptsUsed ?? 0)} of {access.maxAttempts ?? 3}.
          Attempts are used only when you receive a completed assessment.
        </p>
        {(error || searchParams.upload) && (
          <p role="alert" className="mt-4 text-danger">{searchParams.upload ?? DENIED[error!] ?? "Something went wrong."}</p>
        )}
        {!access.allowed ? (
          <div className="mt-4 rounded border border-line bg-raised p-4">
            <StateBadge state={access.reason === "already_passed" ? "completed" : access.reason === "in_progress" || access.reason === "retry_evaluation" ? "awaiting" : access.reason === "remediation_required" ? "failed" : "locked"} />
            <p className="mt-3">{DENIED[access.reason]}</p>
            {access.missing && <p className="mt-2 text-sm text-muted">Still to complete: {access.missing.join(", ")}.</p>}
            {access.submissionId && <p className="mt-3"><Link className="underline" href={`/learn/submission/${access.submissionId}`}>Open your submission</Link></p>}
            {access.reason === "remediation_required" && <p className="mt-3"><Link className="underline" href={`/learn/remediation/${a.id}`}>Go to remediation</Link></p>}
            {access.reason === "already_passed" && a.kind === "CAPSTONE" && a.levelId && <p className="mt-3"><Link className="underline" href={`/learn/level/${a.levelId}`}>See your level status</Link></p>}
          </div>
        ) : (
          <form action={submitWork} encType="multipart/form-data" className="mt-4 space-y-5">
            <input type="hidden" name="assignmentId" value={a.id} />
            {amending && <p className="rounded border border-line bg-raised p-3 text-sm">Your last submission needs more evidence. Add the missing items below and it will be assessed again. This does not use another attempt.</p>}
            {brief.deliverables.map((d) => (
              <div key={d.key}>
                <label htmlFor={d.key} className="block text-sm font-medium">{d.label} ({d.required ? "required" : "optional"})</label>
                <p id={`${d.key}-hint`} className="text-sm text-muted">{d.description}</p>
                {/* Only the first required file is browser-required: a missing one is reported by the server as needs-evidence. */}
                <input id={d.key} name={d.key} type="file" accept="image/png,image/jpeg,image/webp" aria-describedby={`${d.key}-hint`} className="mt-1 block min-h-11" />
              </div>
            ))}
            <div><label htmlFor="rationale" className="block text-sm font-medium">Rationale: explain three design decisions and how each uses contrast</label>
              <textarea id="rationale" name="rationale" required rows={6} maxLength={4000} className="mt-1 w-full rounded border border-line bg-raised p-3" /></div>
            {!amending && access.attemptsUsed > 0 && (
              <div><label htmlFor="changesNote" className="block text-sm font-medium">What did you change after the last feedback?</label>
                <textarea id="changesNote" name="changesNote" required rows={3} className="mt-1 w-full rounded border border-line bg-raised p-3" /></div>
            )}
            <Button type="submit">Submit for assessment</Button>
            <p className="text-sm text-muted">Assessment can take a minute. Please keep this page open after you submit.</p>
          </form>
        )}
      </section>
    </article>
  );
}
