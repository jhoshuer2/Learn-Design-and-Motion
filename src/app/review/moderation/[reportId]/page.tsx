import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { PortfolioError } from "@/lib/portfolio";
import { getReportDetail, releaseHold, resolveReport, type ModAction } from "@/lib/portfolio/moderation";
import { Button } from "@/components/ui/Button";

async function resolve(formData: FormData) {
  "use server";
  const user = await requireUser(["REVIEWER", "ADMIN"]);
  const id = String(formData.get("reportId"));
  try {
    await resolveReport(user, id, String(formData.get("action")) as ModAction, String(formData.get("note") ?? ""));
  } catch (e) {
    if (e instanceof PortfolioError) redirect(`/review/moderation/${id}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect("/review/moderation");
}

async function release(formData: FormData) {
  "use server";
  const user = await requireUser(["REVIEWER", "ADMIN"]);
  await releaseHold(user, String(formData.get("projectId")));
  redirect(`/review/moderation/${formData.get("reportId")}`);
}

export default async function ReportDetail({ params, searchParams }: { params: { reportId: string }; searchParams: { error?: string } }) {
  const user = await requireUser(["REVIEWER", "ADMIN"]);
  let d;
  try {
    d = await getReportDetail(user, params.reportId);
  } catch (e) {
    if (e instanceof PortfolioError) {
      return (
        <div className="mx-auto max-w-xl px-6 py-24">
          <h1 className="font-display text-3xl">Cannot open this report</h1>
          <p className="mt-3 text-muted">{e.code === "own_project" ? "You cannot moderate your own work." : "It does not exist, or you do not have access."}</p>
          <Link href="/review/moderation" className="mt-6 inline-block underline">Back to the queue</Link>
        </div>
      );
    }
    throw e;
  }
  const open = d.report.status === "OPEN";
  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/review/moderation" className="text-sm underline">Reports</Link>
      <h1 className="mt-4 font-display text-4xl">{d.project.title}</h1>
      <p className="mt-1 text-muted">By {d.project.owner} · {d.project.visibility.toLowerCase()}{d.project.held ? " · on hold" : ""}</p>
      <section className="mt-6 rounded border border-line bg-raised p-4">
        <h2 className="font-medium">{d.report.type === "PROJECT" ? "Report about the project" : "Report about one piece of feedback"}</h2>
        <p className="mt-1 whitespace-pre-line">{d.report.reason}</p>
      </section>

      {d.project.summary && <p className="mt-6 max-w-measure whitespace-pre-line">{d.project.summary}</p>}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {d.images.map((i) => (
          <figure key={i.idx} className="rounded border border-line bg-raised p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/submissions/${d.project.submissionId}/files/${i.idx}`} alt={`${i.label} shown on the project`} className="max-h-96 w-full object-contain" />
            <figcaption className="mt-2 text-sm text-muted">{i.label}</figcaption>
          </figure>
        ))}
      </div>
      {d.project.rationale && <><h2 className="mt-6 font-medium">Rationale shown</h2><p className="mt-1 max-w-measure whitespace-pre-line text-muted">{d.project.rationale}</p></>}

      <h2 className="mt-8 font-display text-2xl">Feedback on this project</h2>
      <ul className="mt-3 space-y-3">
        {d.reviews.map((v) => (
          <li key={v.id} className={`rounded border p-3 text-sm ${v.flagged ? "border-danger" : "border-line"} bg-raised`}>
            <p className="text-muted">{v.reviewer}{v.hidden ? " · hidden" : ""}{v.flagged ? " · reported" : ""}</p>
            <p className="mt-1 whitespace-pre-line">{v.strengths}</p><p className="mt-1 whitespace-pre-line">{v.improvements}</p>{v.question && <p className="mt-1 whitespace-pre-line">{v.question}</p>}
          </li>
        ))}
        {d.reviews.length === 0 && <li className="text-muted">None.</li>}
      </ul>

      {open ? (
        <form action={resolve} className="mt-10 space-y-4">
          <input type="hidden" name="reportId" value={d.report.id} />
          {searchParams.error && <p role="alert" className="text-danger">{searchParams.error}</p>}
          <label className="block text-sm font-medium">Decision note (kept in the audit log)
            <textarea name="note" required minLength={5} rows={3} className="mt-1 w-full rounded border border-line bg-raised p-3 font-normal" /></label>
          <div className="flex flex-wrap gap-3">
            {d.report.type === "REVIEW" && <Button type="submit" name="action" value="hide_review">Hide this feedback</Button>}
            <Button type="submit" name="action" value="hold_project">Put the project on hold</Button>
            <Button type="submit" name="action" value="dismiss" variant="secondary">Dismiss the report</Button>
          </div>
          <p className="text-sm text-muted">A hold makes the project private and stops its owner sharing it again until a moderator lifts it.</p>
        </form>
      ) : (
        <p className="mt-10 rounded border border-line bg-raised p-4">This report is already {d.report.status.toLowerCase()}.</p>
      )}
      {d.project.held && (
        <form action={release} className="mt-6"><input type="hidden" name="projectId" value={d.project.id} /><input type="hidden" name="reportId" value={d.report.id} /><Button type="submit" variant="secondary">Lift the hold</Button></form>
      )}
    </article>
  );
}
