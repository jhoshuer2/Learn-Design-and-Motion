import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { loadContentCompetencyTitles } from "@/lib/content/titles";
import { loadOutcome } from "@/lib/content/outcomes";
import { vttToTranscript } from "@/lib/content/media";
import { LessonVideo } from "@/components/Media";
import { Button } from "@/components/ui/Button";

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

export default async function OutcomePage({ params }: { params: { slug: string } }) {
  const o = loadOutcome(params.slug);
  if (!o) notFound();
  const session = await auth();
  const pathRow = await db.path.findFirst({ where: { slug: o.path } });
  const titles = loadContentCompetencyTitles();
  let transcript: string[] = [];
  if (o.showcase) {
    try { transcript = vttToTranscript(fs.readFileSync(path.join(process.cwd(), "public", "lessons", `${o.showcase}.vtt`), "utf8")); } catch { /* none */ }
  }
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
