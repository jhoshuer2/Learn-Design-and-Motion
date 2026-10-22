import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { requireUser } from "@/lib/session";
import { PortfolioError } from "@/lib/portfolio";
import { blockReviewerOfReview, createReview, deleteReview, reportProject, reportReview, setReviewHidden, withdrawReview } from "@/lib/portfolio/peer";
import { getProjectView } from "@/lib/portfolio/view";
import { Button } from "@/components/ui/Button";
import { StateBadge } from "@/components/ui/StateBadge";

// Shared pages are not for search engines until that is a deliberate decision.
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

const back = (slug: string, notice?: string, tone: "ok" | "error" = "ok") =>
  redirect(`/p/${slug}${notice ? `?${tone === "ok" ? "notice" : "error"}=${encodeURIComponent(notice)}` : ""}`);

async function act(slug: string, fn: (userId: string) => Promise<string | void>) {
  const user = await requireUser();
  try {
    back(slug, (await fn(user.id)) || undefined);
  } catch (e) {
    if (e instanceof PortfolioError) back(slug, e.message, "error");
    throw e;
  }
}

async function review(formData: FormData) {
  "use server";
  const slug = String(formData.get("slug"));
  await act(slug, async (id) => {
    await createReview(id, slug, { strengths: String(formData.get("strengths") ?? ""), improvements: String(formData.get("improvements") ?? ""), question: String(formData.get("question") ?? "") });
    return "Thank you. Your feedback has been added.";
  });
}
async function withdraw(formData: FormData) { "use server"; await act(String(formData.get("slug")), async (id) => { await withdrawReview(id, String(formData.get("reviewId"))); return "Your feedback was withdrawn."; }); }
async function hide(formData: FormData) { "use server"; await act(String(formData.get("slug")), async (id) => { await setReviewHidden(id, String(formData.get("reviewId")), formData.get("hidden") === "1"); }); }
async function remove(formData: FormData) { "use server"; await act(String(formData.get("slug")), async (id) => { await deleteReview(id, String(formData.get("reviewId"))); return "Feedback deleted."; }); }
async function block(formData: FormData) { "use server"; await act(String(formData.get("slug")), async (id) => { await blockReviewerOfReview(id, String(formData.get("reviewId"))); return "Blocked. Their feedback on your work is hidden."; }); }
async function reportThis(formData: FormData) {
  "use server";
  const slug = String(formData.get("slug"));
  await act(slug, async (id) => {
    const reason = String(formData.get("reason") ?? "");
    if (formData.get("reviewId")) await reportReview(id, String(formData.get("reviewId")), reason);
    else await reportProject(id, slug, reason);
    return "Thank you. A moderator will take a look.";
  });
}

const REVIEW_BLOCKED: Record<string, string> = {
  display_name: "Choose a display name in your profile to leave feedback.",
  already_reviewed: "You have already left feedback on this project.",
  cannot_review: "You cannot leave feedback on this project.",
};

function Report({ slug, reviewId }: { slug: string; reviewId?: string }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted underline">Report {reviewId ? "this feedback" : "this project"}</summary>
      <form action={reportThis} className="mt-2 space-y-2">
        <input type="hidden" name="slug" value={slug} />
        {reviewId && <input type="hidden" name="reviewId" value={reviewId} />}
        <label className="block">What is wrong? <textarea name="reason" required minLength={10} maxLength={500} rows={3} className="mt-1 w-full rounded border border-line bg-raised p-2" /></label>
        <Button type="submit" variant="secondary">Send report</Button>
      </form>
    </details>
  );
}

export default async function ProjectPage({ params, searchParams }: { params: { slug: string }; searchParams: { notice?: string; error?: string } }) {
  const session = await auth();
  const viewer = session?.user?.id ? { id: session.user.id, role: session.user.role } : null;
  const v = await getProjectView(viewer, params.slug);
  if (!v) notFound();
  const e = v.evidence;

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <nav className="flex gap-4 text-sm">
        {viewer ? <><Link href="/community" className="underline">Community</Link>{v.isOwner && <Link href="/portfolio" className="underline">My portfolio</Link>}</> : <Link href="/" className="underline">Creative Mastery</Link>}
      </nav>

      {v.isOwner && (
        <p role="note" className="mt-4 rounded border border-line bg-raised p-3 text-sm">
          This is how others see your project. It is currently <strong>{v.held ? "on hold" : v.visibility === "PRIVATE" ? "private, so only you can see it" : v.visibility === "LINK" ? "shared by link" : v.approval?.status === "APPROVED" ? "public" : "waiting for review, so only you can see it"}</strong>.{" "}
          <Link className="underline" href="/portfolio">Change sharing</Link>
        </p>
      )}
      {searchParams.notice && <p role="status" className="mt-4 text-success">{searchParams.notice}</p>}
      {searchParams.error && <p role="alert" className="mt-4 text-danger">{searchParams.error}</p>}

      <p className="mt-8 text-sm uppercase tracking-widest text-muted">{v.assignment.kind === "CAPSTONE" ? "Capstone" : "Assessed project"} · {v.assignment.title}</p>
      <h1 className="mt-1 font-display text-4xl">{v.title}</h1>
      <p className="mt-2 text-muted">
        By {v.owner.handle ? <Link className="underline" href={`/u/${v.owner.handle}`}>{v.owner.displayName}</Link> : v.owner.displayName}
      </p>
      {v.summary && <p className="mt-4 max-w-measure whitespace-pre-line">{v.summary}</p>}

      <section className="mt-8 grid gap-4 sm:grid-cols-2" aria-label="Work">
        {v.images.map((i) => (
          <figure key={i.idx} className="rounded border border-line bg-raised p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/portfolio/${v.slug}/files/${i.idx}`} alt={`${i.label}: ${v.title}, by ${v.owner.displayName}`} width={i.width} height={i.height} className="max-h-[32rem] w-full object-contain" />
            <figcaption className="mt-2 text-sm text-muted">{i.label}</figcaption>
          </figure>
        ))}
      </section>

      {v.rationale && (
        <section className="mt-8"><h2 className="font-display text-2xl">Designer&rsquo;s rationale</h2><p className="mt-2 max-w-measure whitespace-pre-line text-muted">{v.rationale}</p></section>
      )}

      {e && (
        <section className="mt-10 rounded border border-line bg-raised p-5" aria-labelledby="assessment">
          <h2 id="assessment" className="font-display text-2xl">Assessment</h2>
          {e.testEvaluator && <p role="note" className="mt-3 rounded border border-warn p-3 text-sm text-warn">TEST EVALUATOR. This result came from a deterministic test evaluator that did not look at the work. It is not a genuine assessment.</p>}
          <p className="mt-3 font-display text-3xl">{e.score}%{e.verified && <span className="ml-3 align-middle font-sans text-base"><StateBadge state="completed" /> <span className="text-sm text-muted">Verified</span></span>}</p>
          <p className="text-sm text-muted">Pass mark {e.threshold}% · {e.passed ? "passed" : "not passed"} · assessed by {e.assessedBy}{e.humanReviewed ? ", confirmed by a person" : ""} · rubric {e.rubric.slug} v{e.rubric.version} · {e.date.toISOString().slice(0, 10)}</p>
          <table className="mt-4 w-full text-sm [&_th]:py-1 [&_th]:text-left">
            <thead><tr><th scope="col">Criterion</th><th scope="col">Score</th><th scope="col">Weight</th></tr></thead>
            <tbody>{e.criteria.map((c) => <tr key={c.title} className="border-t border-line"><td className="py-1.5">{c.title}{c.mandatory ? " (required)" : ""}</td><td>{c.score}%</td><td>{c.weight}%</td></tr>)}</tbody>
          </table>
          {e.strengths.length > 0 && <><h3 className="mt-4 font-medium">Strengths noted</h3><ul className="mt-1 list-disc pl-5 text-sm text-muted">{e.strengths.map((s) => <li key={s}>{s}</li>)}</ul></>}
          {v.skills.length > 0 && <p className="mt-4 text-sm"><strong>Skills shown in this work, as assessed:</strong> {v.skills.join(", ")}.</p>}
          <p className="mt-4 text-sm text-muted">This is a learning assessment against a published rubric. It is not a qualification and does not by itself show professional competence.{!e.verified && " It is not marked verified."}</p>
        </section>
      )}

      <section className="mt-12 border-t border-line pt-8" aria-labelledby="feedback">
        <h2 id="feedback" className="font-display text-2xl">Peer feedback</h2>
        <p className="mt-1 text-sm text-muted">Feedback from other learners is for learning. It does not affect anyone&rsquo;s progress or results.</p>
        {v.reviews.length === 0 && <p className="mt-4 text-muted">No feedback yet.</p>}
        <ul className="mt-4 space-y-4">
          {v.reviews.map((r) => (
            <li key={r.id} className="rounded border border-line bg-raised p-4">
              <p className="text-sm text-muted">{r.reviewer} · {r.createdAt.toISOString().slice(0, 10)}{r.hidden ? " · hidden from others" : ""}</p>
              <h3 className="mt-2 font-medium">What works</h3><p className="whitespace-pre-line">{r.strengths}</p>
              <h3 className="mt-3 font-medium">Suggestions</h3><p className="whitespace-pre-line">{r.improvements}</p>
              {r.question && <><h3 className="mt-3 font-medium">A question</h3><p className="whitespace-pre-line">{r.question}</p></>}
              <div className="mt-3 flex flex-wrap items-start gap-4">
                {v.isOwner && (
                  <>
                    <form action={hide}><input type="hidden" name="slug" value={v.slug} /><input type="hidden" name="reviewId" value={r.id} /><input type="hidden" name="hidden" value={r.hidden ? "0" : "1"} /><Button type="submit" variant="secondary">{r.hidden ? "Show" : "Hide"}</Button></form>
                    <form action={remove}><input type="hidden" name="slug" value={v.slug} /><input type="hidden" name="reviewId" value={r.id} /><Button type="submit" variant="secondary">Delete</Button></form>
                    <form action={block}><input type="hidden" name="slug" value={v.slug} /><input type="hidden" name="reviewId" value={r.id} /><Button type="submit" variant="secondary">Block this reviewer</Button></form>
                  </>
                )}
                {r.mine && <form action={withdraw}><input type="hidden" name="slug" value={v.slug} /><input type="hidden" name="reviewId" value={r.id} /><Button type="submit" variant="secondary">Withdraw my feedback</Button></form>}
                {v.viewer.signedIn && !v.isOwner && !r.mine && <Report slug={v.slug} reviewId={r.id} />}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-8">
          {v.viewer.canReview ? (
            <form action={review} className="space-y-4" aria-label="Leave feedback">
              <h3 className="font-display text-xl">Leave feedback</h3>
              <input type="hidden" name="slug" value={v.slug} />
              <p className="text-sm text-muted">Think about what this work was asked to show: {v.reviewRubric.map((c) => c.title).join(", ")}. Be specific and kind. At least 20 characters in each box.</p>
              <label className="block text-sm font-medium">What works, and why <textarea name="strengths" required minLength={20} maxLength={1500} rows={4} className="mt-1 w-full rounded border border-line bg-raised p-3 font-normal" /></label>
              <label className="block text-sm font-medium">What could be improved, and how <textarea name="improvements" required minLength={20} maxLength={1500} rows={4} className="mt-1 w-full rounded border border-line bg-raised p-3 font-normal" /></label>
              <label className="block text-sm font-medium">A question for the designer (optional) <textarea name="question" maxLength={500} rows={2} className="mt-1 w-full rounded border border-line bg-raised p-3 font-normal" /></label>
              <Button type="submit">Send feedback</Button>
            </form>
          ) : v.viewer.reviewBlockedReason === "sign_in" ? (
            <p className="text-muted"><Link className="underline" href="/signin">Sign in</Link> to leave feedback.</p>
          ) : (
            !v.isOwner && <p className="text-muted">{REVIEW_BLOCKED[v.viewer.reviewBlockedReason ?? "cannot_review"]} {v.viewer.reviewBlockedReason === "display_name" && <Link className="underline" href="/profile">Open profile</Link>}</p>
          )}
        </div>
      </section>

      {viewer && !v.isOwner && <section className="mt-8"><Report slug={v.slug} /></section>}
    </article>
  );
}
