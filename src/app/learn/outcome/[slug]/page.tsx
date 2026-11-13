import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { loadContentCompetencyTitles } from "@/lib/content/titles";
import { loadOutcome } from "@/lib/content/outcomes";
import { vttToTranscript } from "@/lib/content/media";
import { LessonVideo } from "@/components/Media";
import { Button } from "@/components/ui/Button";
import { PlacementCheck } from "@/components/PlacementCheck";
import { getPlacementQuestions, parseBits, scorePlacement, summarise, toBits } from "@/lib/placement";
import { LIMITS, clientKey, hit } from "@/lib/ratelimit";

/** Public on purpose: this is the page you share. Enrolling asks you to sign in. */
export const dynamic = "force-dynamic";

async function start(formData: FormData) {
  "use server";
  const user = await requireUser();
  const pathSlug = String(formData.get("path"));
  const row = await db.path.findFirst({ where: { slug: pathSlug } });
  if (!row) redirect("/dashboard");
  await db.enrollment.upsert({ where: { userId_pathId: { userId: user.id, pathId: row.id } }, update: {}, create: { userId: user.id, pathId: row.id } });
  redirect("/learn");
}

async function check(formData: FormData) {
  "use server";
  const slug = String(formData.get("slug"));
  const o = loadOutcome(slug);
  if (!o) redirect("/");
  // Public scoring could be used to probe answers, so it is limited per (hashed) visitor.
  if (!(await hit(clientKey(headers()), LIMITS.placement())).allowed) redirect(`/learn/outcome/${slug}?placed=limited#where-are-you`);
  const answers: Record<string, string[]> = {};
  for (const id of formData.getAll("qid").map(String)) answers[id] = formData.getAll(`q_${id}`).map(String);
  const rows = await scorePlacement(o, answers);
  redirect(`/learn/outcome/${slug}?placed=${toBits(rows)}#where-are-you`);
}

export default async function OutcomePage({ params, searchParams }: { params: { slug: string }; searchParams: { placed?: string } }) {
  const o = loadOutcome(params.slug);
  if (!o) notFound();
  const session = await auth();
  const pathRow = await db.path.findFirst({ where: { slug: o.path } });
  const titles = loadContentCompetencyTitles();
  let transcript: string[] = [];
  if (o.showcase) {
    try { transcript = vttToTranscript(fs.readFileSync(path.join(process.cwd(), "public", "lessons", `${o.showcase}.vtt`), "utf8")); } catch { /* none */ }
  }
  const questions = await getPlacementQuestions(o);
  const bits = parseBits(searchParams.placed, questions.length);
  const result = bits ? (() => {
    const rows = questions.map((q, i) => ({ skill: q.skill, skillTitle: q.skillTitle, lessonTitle: q.lessonTitle, known: bits[i] }));
    return { rows, summary: summarise(rows) };
  })() : null;
  const enrolled = session?.user?.id && pathRow
    ? !!(await db.enrollment.findUnique({ where: { userId_pathId: { userId: session.user.id, pathId: pathRow.id } } }))
    : false;

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-sm font-medium text-muted">By the end you can make</p>
      <h1 className="mt-2 font-display text-5xl leading-tight">{o.title}</h1>
      <p className="mt-4 max-w-measure text-xl">{o.promise}</p>
      {o.status === "DRAFT" && <p className="mt-3 inline-block rounded border border-line px-3 py-1 text-sm text-muted">Draft: still being written and checked</p>}

      {o.showcase && <div className="mt-8"><LessonVideo name={o.showcase} caption={`What you will make: ${o.title}`} transcript={transcript} /></div>}

      <section className="mt-10 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl">What you will learn</h2>
          <ul className="mt-3 space-y-2">{o.skills.map((s) => <li key={s} className="flex gap-2"><span aria-hidden>✓</span><span>{titles[s] ?? s}</span></li>)}</ul>
        </div>
        <div>
          <h2 className="font-display text-2xl">How it works</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
            <li>Short steps. Watch or read, your choice.</li>
            <li>You make a small piece at every step.</li>
            <li>Stuck? Your buddy shows what to fix, using your own work.</li>
            <li>About {o.hours} hours in total. Go at your own pace.</li>
          </ul>
          <p className="mt-3 text-sm text-muted">For: {o.forWho}.{o.tools.length > 0 && <> Works with free tools: {o.tools.join(", ")}.</>}</p>
        </div>
      </section>

      <PlacementCheck slug={o.slug} action={check} questions={questions} result={result} limited={searchParams.placed === "limited"} />

      <div className="mt-10">
        {!pathRow ? (
          <p className="rounded border border-line bg-raised p-4 text-muted">This path is not open yet. Check back soon.</p>
        ) : enrolled ? (
          <Link href="/learn"><Button>Continue where you left off</Button></Link>
        ) : session?.user ? (
          <form action={start}><input type="hidden" name="path" value={o.path} /><Button type="submit">Start this path</Button></form>
        ) : (
          <Link href="/signup"><Button>Create a free account to start</Button></Link>
        )}
      </div>
    </article>
  );
}
