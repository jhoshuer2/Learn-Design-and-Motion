import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { blockHasMedia, parseMediaLine, vttToTranscript } from "@/lib/content/media";
import { requireUser } from "@/lib/session";
import {
  AccessError, getAttemptView, getLessonView, recordBlockView, submitCheck, type LessonView,
} from "@/lib/progression";
import { Prose } from "@/components/Prose";
import { Button, PillLink, Arrow } from "@/components/ui/Button";
import { PipSays } from "@/components/ui/Pip";
import { StateBadge } from "@/components/ui/StateBadge";
import { KeyframeProgress } from "@/components/ui/Keyframes";

const KIND_LABEL: Record<string, string> = {
  objective: "Objective", concept: "Concept", demo: "See it", realWorld: "In real work", goodVsBad: "Good vs bad",
  guided: "Guided practice", check: "Knowledge check", task: "Independent task", reflection: "Reflection", feedback: "Feedback",
};

const DENIED: Record<string, string> = {
  not_found: "This lesson does not exist.",
  not_published: "This lesson is not available yet.",
  not_enrolled: "Enroll in this learning path to open its lessons.",
  prerequisites: "This lesson is locked until you complete its prerequisites.",
  level_locked: "This level opens when you complete the previous level.",
  out_of_order: "Work through the lesson in order.",
  no_check: "This lesson has no knowledge check.",
};

async function advance(formData: FormData) {
  "use server";
  const user = await requireUser();
  const lessonId = String(formData.get("lessonId"));
  const index = Number(formData.get("index"));
  const last = formData.get("last") === "1";
  try {
    await recordBlockView(user.id, lessonId, index);
  } catch (e) {
    if (e instanceof AccessError) redirect(`/learn/lesson/${lessonId}`);
    throw e;
  }
  redirect(last ? `/learn/lesson/${lessonId}?done=1` : `/learn/lesson/${lessonId}?step=${index + 1}`);
}

async function submit(formData: FormData) {
  "use server";
  const user = await requireUser();
  const lessonId = String(formData.get("lessonId"));
  const index = Number(formData.get("index"));
  const answers: Record<string, string[]> = {};
  for (const id of formData.getAll("qid").map(String)) answers[id] = formData.getAll(`q_${id}`).map(String);
  try {
    const res = await submitCheck(user.id, lessonId, answers);
    redirect(`/learn/lesson/${lessonId}?step=${index}&attempt=${res.attemptId}`);
  } catch (e) {
    if (e instanceof AccessError) redirect(`/learn/lesson/${lessonId}`);
    throw e;
  }
}

async function setMode(formData: FormData) {
  "use server";
  await requireUser();
  const mode = formData.get("mode") === "read" ? "read" : "watch";
  const lessonId = String(formData.get("lessonId")).replace(/[^A-Za-z0-9_-]/g, "");
  const step = Math.max(0, Math.floor(Number(formData.get("step")) || 0));
  cookies().set("lesson-mode", mode, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  redirect(`/learn/lesson/${lessonId}?step=${step}`);
}

/** Caption cues of the videos a block uses, as readable text. A missing file just means no transcript. */
function transcriptsFor(body: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const line of body.split("\n")) {
    const m = parseMediaLine(line);
    if (m?.type !== "video") continue;
    try { out[m.name] = vttToTranscript(fs.readFileSync(path.join(process.cwd(), "public", "lessons", `${m.name}.vtt`), "utf8")); } catch { /* no transcript */ }
  }
  return out;
}

function prefixLength(view: LessonView) {
  let n = 0;
  while (view.viewed.includes(n)) n++;
  return n;
}

export default async function LessonPage({
  params, searchParams,
}: { params: { lessonId: string }; searchParams: { step?: string; attempt?: string; done?: string } }) {
  const user = await requireUser();
  let view: LessonView;
  try {
    view = await getLessonView(user.id, params.lessonId);
  } catch (e) {
    if (e instanceof AccessError) {
      return (
        <div className="mx-auto max-w-2xl px-6 py-24">
          <StateBadge state="locked" />
          <h1 className="display display-l mt-5">Not available</h1>
          <p className="lede mt-4">{DENIED[e.reason]}</p>
          {e.missing && <p className="mt-2">Complete first: {e.missing.join(", ")}.</p>}
          <div className="mt-8"><PillLink href="/learn" variant="secondary">Back to my learning</PillLink></div>
        </div>
      );
    }
    throw e;
  }

  const reachable = Math.min(prefixLength(view), view.blocks.length - 1);
  const requested = Number.isInteger(Number(searchParams.step)) ? Number(searchParams.step) : reachable;
  const step = Math.max(0, Math.min(requested, reachable));
  const block = view.blocks[step];
  const last = step === view.blocks.length - 1;
  const attempt = searchParams.attempt ? await getAttemptView(user.id, view.id, searchParams.attempt) : null;
  const passedCheck = view.completed || attempt?.passed;
  const mode = cookies().get("lesson-mode")?.value === "read" ? "read" : "watch";
  const lessonHasMedia = view.blocks.some((b) => blockHasMedia(b.body));

  return (
    <article className="mx-auto grid max-w-page gap-x-16 px-6 pb-24 pt-10 lg:grid-cols-[14rem_1fr]">
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <nav className="text-sm"><Link href="/learn" className="link-quiet font-semibold">My learning</Link></nav>
        {view.completed && <div className="mt-6 hidden lg:block"><StateBadge state="completed" /></div>}
      </aside>

      <div className="max-w-3xl">
        <p className="label rise">Lesson</p>
        <h1 className="display display-l mt-3 rise" style={{ ["--d" as string]: 1 }}>{view.title}</h1>
        <p className="lede mt-4">{view.objective}</p>
        <p className="mt-6 text-sm text-ink-2">Step {step + 1} of {view.blocks.length}: <strong className="text-ink">{KIND_LABEL[block.kind] ?? block.kind}</strong></p>
        <div className="mt-6 flex flex-wrap items-center gap-6">
          {lessonHasMedia && (
            <form action={setMode} className="switch" data-mode={mode} aria-label="How do you want to learn?">
              <input type="hidden" name="lessonId" value={view.id} />
              <input type="hidden" name="step" value={step} />
              <span className="thumb" aria-hidden />
              <button name="mode" value="watch" aria-pressed={mode === "watch"}><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>Watch</button>
              <button name="mode" value="read" aria-pressed={mode === "read"}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="M2 3h12M2 7h12M2 11h8" /></svg>Read</button>
            </form>
          )}
          <div className="min-w-[10rem] flex-1"><KeyframeProgress total={view.blocks.length} current={step} /></div>
        </div>

        <section className="mt-12">
          <h2 className="display display-m">{block.title}</h2>
          <div className="mt-5"><Prose body={block.body} mode={mode} transcripts={transcriptsFor(block.body)} /></div>

          {block.kind === "check" && (
            <div className="mt-8">
              {attempt && (
                <div role="status" className="surface-card mb-6 p-6">
                  <p className="title">
                    Score {attempt.score}% · {attempt.passed ? "Passed" : `Not yet. You need ${view.checkThreshold}%.`}
                  </p>
                  {attempt.items.map((it, i) => !it.correct && (
                    <p key={i} className="mt-3 text-[0.9375rem] text-ink-2"><strong>Question {i + 1}:</strong> {it.explanation}</p>
                  ))}
                </div>
              )}
              {view.completed && !attempt && (
                <p className="mb-5 rounded-card bg-paper-2 p-4 text-sm text-ink-2">
                  You have already passed this check. You can retake it to refresh your result, for example when remediation or a level requirement asks for it. Your latest result is the one that counts.
                </p>
              )}
              {!attempt?.passed && (
                <form action={submit} className="space-y-8">
                  <input type="hidden" name="lessonId" value={view.id} />
                  <input type="hidden" name="index" value={step} />
                  {view.questions.map((q, qi) => (
                    <fieldset key={q.id} className="surface-card space-y-1 p-6">
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
                  <Button type="submit" variant="accent">Submit answers</Button>
                </form>
              )}
            </div>
          )}
          {block.kind === "task" && (
            <div className="mt-8">
              <PipSays>Practice only: make it, keep the file, and compare it with the example. This step is not graded and does not change your progress. The module assessment is where your work is assessed.</PipSays>
            </div>
          )}
        </section>

        <div className="sticky bottom-24 mt-12 flex w-fit items-center gap-2 rounded-full bg-card py-2 pl-5 pr-2 shadow-float">
          {step > 0 && <Link href={`/learn/lesson/${view.id}?step=${step - 1}`} className="link-quiet mr-2 text-sm font-semibold">Back</Link>}
          {(block.kind !== "check" || passedCheck) && (
            <form action={advance}>
              <input type="hidden" name="lessonId" value={view.id} />
              <input type="hidden" name="index" value={step} />
              <input type="hidden" name="last" value={last ? "1" : "0"} />
              <Button type="submit">{last ? "Finish lesson" : "Continue"}<Arrow /></Button>
            </form>
          )}
        </div>
        {searchParams.done && (
          <p role="status" className="surface-card mt-8 p-5">
            {view.completed ? "Lesson complete." : "You reached the end, but this lesson is not complete yet. Finish the required steps."}{" "}
            <Link className="link-quiet font-semibold" href={view.completed && view.nextLessonId ? `/learn/lesson/${view.nextLessonId}` : "/learn"}>
              {view.completed && view.nextLessonId ? "Next lesson" : "Back to my learning"}
            </Link>
          </p>
        )}
      </div>
    </article>
  );
}
