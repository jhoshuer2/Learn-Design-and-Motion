import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { PracticeError, getToday, submitWarmup } from "@/lib/practice";
import { Button } from "@/components/ui/Button";
import { Pip, PipSays } from "@/components/ui/Pip";
import { KeyframeTrack } from "@/components/ui/Keyframes";
import { TimeZoneCookie } from "@/components/TimeZoneCookie";

export const dynamic = "force-dynamic";

async function warmup(formData: FormData) {
  "use server";
  const user = await requireUser();
  const answers: Record<string, string[]> = {};
  for (const id of formData.getAll("qid").map(String)) answers[id] = formData.getAll(`q_${id}`).map(String);
  let target = "/today";
  try {
    await submitWarmup(user.id, cookies().get("tz")?.value, answers);
  } catch (e) {
    if (e instanceof PracticeError) target = `/today?note=${e.code}`;
    else throw e;
  }
  redirect(target);
}

const NOTES: Record<string, string> = {
  already_done: "You have already done today's warm-up. Nice. It will be fresh again tomorrow.",
  nothing_to_practise: "There is no warm-up yet. Finish a lesson first.",
  bad_answers: "Those answers did not match today's questions. Try again.",
};
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const dayName = (d: string) => WEEKDAY.format(new Date(`${d}T12:00:00Z`));

export default async function Today({ searchParams }: { searchParams: { note?: string } }) {
  const user = await requireUser();
  const t = await getToday(user.id, cookies().get("tz")?.value);
  const practised = t.week.filter((d) => d.active).map((d) => dayName(d.day));
  const finished = t.warmup.state === "done" && t.learnedToday;

  return (
    <div className="mx-auto max-w-3xl px-6 pb-16 pt-10 sm:pt-16">
      <TimeZoneCookie current={t.tz} />
      <nav className="text-sm"><Link href="/dashboard" className="link-quiet font-semibold">Dashboard</Link></nav>
      <div className="mt-8 flex items-end justify-between gap-6">
        <div>
          <p className="label rise">About 15 minutes</p>
          <h1 className="display display-xl mt-3 rise" style={{ ["--d" as string]: 1 }}>Today&rsquo;s <em>session</em></h1>
          <p className="lede mt-4">Small steps count.</p>
        </div>
        <div className="hidden sm:block"><Pip size={140} label="Pip" /></div>
      </div>

      <section className="mt-14" aria-labelledby="week" data-reveal>
        <h2 id="week" className="display display-m">This week</h2>
        <KeyframeTrack showLabels items={t.week.map((d) => ({ label: dayName(d.day), pin: d.isToday, state: d.active ? "done" : d.isToday ? "current" : "next" }))} />
        <p className="mt-3 text-sm text-ink-2">
          {t.run >= 2 ? `${t.run} days in a row. ` : ""}
          {practised.length > 0 ? `You practised on ${practised.join(", ")}.` : "A fresh week. Today is a good day to start."}
        </p>
      </section>

      {searchParams.note && NOTES[searchParams.note] && <p role="alert" className="surface-card mt-6 p-5">{NOTES[searchParams.note]}</p>}

      <section className="mt-16" aria-labelledby="warm" data-reveal>
        <h2 id="warm" className="display display-m">Warm-up{t.warmup.state !== "none" ? `: ${t.warmup.skill}` : ""}</h2>
        {t.warmup.state === "none" && <p className="mt-3 max-w-measure text-ink-2">Finish your first lesson and a short warm-up will appear here.</p>}
        {t.warmup.state === "open" && (
          <>
            <p className="mt-2 max-w-measure text-ink-2">Three quick questions to keep it fresh. Practice only: it does not change your results.</p>
            <form action={warmup} className="mt-6 space-y-6 surface-card p-6">
              {t.warmup.questions.map((q, qi) => (
                <fieldset key={q.id} className="space-y-1">
                  <input type="hidden" name="qid" value={q.id} />
                  <legend className="title mb-2 !text-xl">{qi + 1}. {q.prompt}</legend>
                  {q.type === "MULTIPLE_SELECT" && <p className="label">Select all that apply.</p>}
                  {q.options.map((o) => (
                    <label key={o} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-input px-2 transition hover:bg-paper-2">
                      <input className="h-4 w-4 accent-[var(--accent)]" type={q.type === "MULTIPLE_SELECT" ? "checkbox" : "radio"} name={`q_${q.id}`} value={o} />
                      <span>{o}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
              <Button type="submit" variant="accent">Check my answers</Button>
            </form>
          </>
        )}
        {t.warmup.state === "done" && (
          <>
            <p className="mt-3 text-lg">{t.warmup.correct} of {t.warmup.total} right. {t.warmup.correct === t.warmup.total ? "That is fresh." : "A little practice and it will stick."}</p>
            <p className="mt-1 text-sm text-ink-2">Practice only: it does not change your results.</p>
            <ul className="mt-4 space-y-4">
              {t.warmup.items.map((it, i) => (
                <li key={i} className="border-t border-line pt-3 text-sm">
                  <p className="font-medium"><span aria-hidden>{it.correct ? "✓ " : "✗ "}</span>{it.correct ? "Right: " : "Not this time: "}{it.prompt}</p>
                  {!it.correct && (
                    <p className="mt-1 text-ink-2">{it.explanation} <Link className="link-quiet font-semibold" href={it.ideaHref}>Revisit the idea in {it.lessonTitle}</Link></p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {t.fix && (
        <section className="mt-16" aria-labelledby="fix" data-reveal>
          <h2 id="fix" className="display display-m">Fix this next</h2>
          <p className="mt-2 font-medium">{t.fix.fix.title} <span className="text-ink-2">{t.fix.fix.score}%</span></p>
          <p className="mt-1 max-w-measure text-ink-2">{t.fix.fix.improvement}</p>
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {t.fix.fix.links.map((l) => <Link key={l.lessonId} className="link-quiet font-semibold" href={l.practice ?? l.idea}>Try it again with support: {l.title}</Link>)}
            <Link className="link-quiet font-semibold" href={`/learn/submission/${t.fix.submissionId}`}>See the full feedback</Link>
          </p>
        </section>
      )}

      <section className="mt-16" aria-labelledby="next" data-reveal>
        <h2 id="next" className="display display-m">Your next step</h2>
        {t.next ? (
          <p className="mt-2 text-lg"><Link className="link-quiet font-semibold" href={t.next.href}>{t.next.title}</Link> <span className="text-ink-2">(about 5 minutes)</span></p>
        ) : <p className="mt-2 text-ink-2">Enroll in a path to get a next step.</p>}
      </section>

      {finished && (
        <div className="mt-16"><PipSays>That is today done. Come back tomorrow, or keep going if you feel like it. <Link className="link-quiet font-semibold" href="/learn">My learning</Link></PipSays></div>
      )}
    </div>
  );
}
