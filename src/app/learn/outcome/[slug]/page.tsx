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
import { Button, PillLink, Arrow } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
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
  const lessonCount = await db.lesson.count({ where: { module: { level: { path: { slug: o.path } } } } });
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
    <article className="mx-auto max-w-page px-6 pb-20 pt-10 sm:pt-16">
      <p className="label rise">By the end you can make</p>
      <h1 className="display display-xl mt-4 max-w-[16ch] rise" style={{ ["--d" as string]: 1 }}>{o.title}</h1>
      <p className="lede mt-6 rise" style={{ ["--d" as string]: 3 }}>{o.promise}</p>
      {o.status === "DRAFT" && <p className="label mt-5 inline-block rounded-full bg-paper-2 px-4 py-2">Draft: still being written and checked</p>}

      {o.showcase && <div className="mx-auto mt-12 max-w-4xl"><LessonVideo name={o.showcase} caption={`What you will make: ${o.title}`} transcript={transcript} /></div>}

      <section className="mt-16 grid gap-5 sm:grid-cols-3" aria-label="At a glance" data-reveal>
        <StatCard value={String(o.hours)} label="hours, at your own pace" tone="butter" />
        <StatCard value={String(o.skills.length)} label="skills you will practise" tone="sage" />
        <StatCard value={String(lessonCount)} label="short lessons" tone="terra" />
      </section>

      <section className="mt-24 grid gap-14 lg:grid-cols-2" data-reveal>
        <div>
          <p className="label">Skills</p>
          <h2 className="display display-m mt-3">What you will <em>learn</em></h2>
          <ul className="mt-6 divide-y divide-line border-y border-line">{o.skills.map((s) => <li key={s} className="flex gap-3 py-4"><span aria-hidden className="text-accent">✓</span><span>{titles[s] ?? s}</span></li>)}</ul>
        </div>
        <div>
          <p className="label">The way it goes</p>
          <h2 className="display display-m mt-3">How it works</h2>
          <ul className="mt-6 list-disc space-y-3 pl-5 text-lg text-ink-2 marker:text-accent">
            <li>Short steps. Watch or read, your choice.</li>
            <li>You make a small piece at every step.</li>
            <li>Stuck? Your buddy shows what to fix, using your own work.</li>
            <li>About {o.hours} hours in total. Go at your own pace.</li>
          </ul>
          <p className="label mt-8">For: {o.forWho}.{o.tools.length > 0 && <> Works with free tools: {o.tools.join(", ")}.</>}</p>
        </div>
      </section>

      <PlacementCheck slug={o.slug} action={check} questions={questions} result={result} limited={searchParams.placed === "limited"} />

      <div className="mt-14">
        {!pathRow ? (
          <p className="surface-card p-5 text-ink-2">This path is not open yet. Check back soon.</p>
        ) : enrolled ? (
          <PillLink href="/learn" arrow>Continue where you left off</PillLink>
        ) : session?.user ? (
          <form action={start}><input type="hidden" name="path" value={o.path} /><Button type="submit" variant="accent">Start this path<Arrow /></Button></form>
        ) : (
          <PillLink href="/signup" variant="accent" arrow>Create a free account to start</PillLink>
        )}
      </div>
    </article>
  );
}
