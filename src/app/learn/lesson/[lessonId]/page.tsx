import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import {
  AccessError, getAttemptView, getLessonView, recordBlockView, submitCheck, type LessonView,
} from "@/lib/progression";
import { Prose } from "@/components/Prose";
import { Button } from "@/components/ui/Button";
import { StateBadge } from "@/components/ui/StateBadge";

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
        <div className="mx-auto max-w-xl px-6 py-24">
          <StateBadge state="locked" />
          <h1 className="mt-4 font-display text-3xl">Not available</h1>
          <p className="mt-3 text-muted">{DENIED[e.reason]}</p>
          {e.missing && <p className="mt-2">Complete first: {e.missing.join(", ")}.</p>}
          <Link href="/learn" className="mt-6 inline-block underline">Back to my learning</Link>
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

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <nav className="text-sm"><Link href="/learn" className="underline">My learning</Link></nav>
      <h1 className="mt-4 font-display text-4xl">{view.title}</h1>
      <p className="mt-2 max-w-measure text-muted">{view.objective}</p>
      <div className="mt-6 flex items-center justify-between text-sm">
        <span>Step {step + 1} of {view.blocks.length}: <strong>{KIND_LABEL[block.kind] ?? block.kind}</strong></span>
        {view.completed && <StateBadge state="completed" />}
      </div>
      <div className="mt-2 h-1.5 rounded bg-line" role="progressbar" aria-label="Lesson progress" aria-valuemin={0} aria-valuemax={view.blocks.length} aria-valuenow={step + 1}>
        <div className="h-full rounded bg-accent" style={{ width: `${((step + 1) / view.blocks.length) * 100}%` }} />
      </div>

      <section className="mt-8">
        <h2 className="font-display text-2xl">{block.title}</h2>
        <div className="mt-4"><Prose body={block.body} /></div>

        {block.kind === "check" && (
          <div className="mt-6">
            {attempt && (
              <div role="status" className="mb-6 rounded border border-line bg-raised p-4">
                <p className="font-medium">
                  Score {attempt.score}% · {attempt.passed ? "Passed" : `Not yet. You need ${view.checkThreshold}%.`}
                </p>
                {attempt.items.map((it, i) => !it.correct && (
                  <p key={i} className="mt-3 text-sm"><strong>Question {i + 1}:</strong> {it.explanation}</p>
                ))}
              </div>
            )}
            {!passedCheck && (
              <form action={submit} className="space-y-6">
                <input type="hidden" name="lessonId" value={view.id} />
                <input type="hidden" name="index" value={step} />
                {view.questions.map((q, qi) => (
                  <fieldset key={q.id} className="space-y-2">
                    <input type="hidden" name="qid" value={q.id} />
                    <legend className="font-medium">{qi + 1}. {q.prompt}</legend>
                    {q.type === "MULTIPLE_SELECT" && <p className="text-sm text-muted">Select all that apply.</p>}
                    {q.options.map((o) => (
                      <label key={o} className="flex min-h-11 items-center gap-3">
                        <input type={q.type === "MULTIPLE_SELECT" ? "checkbox" : "radio"} name={`q_${q.id}`} value={o} />
                        <span>{o}</span>
                      </label>
                    ))}
                  </fieldset>
                ))}
                <Button type="submit">Submit answers</Button>
              </form>
            )}
          </div>
        )}
        {block.kind === "task" && (
          <p className="mt-4 rounded border border-line bg-raised p-3 text-sm text-muted">
            Prototype note: submitting and assessing this task is not built yet (milestone M3). It does not count towards completion in this milestone.
          </p>
        )}
      </section>

      <div className="mt-10 flex items-center gap-4">
        {step > 0 && <Link href={`/learn/lesson/${view.id}?step=${step - 1}`} className="underline">Back</Link>}
        {(block.kind !== "check" || passedCheck) && (
          <form action={advance}>
            <input type="hidden" name="lessonId" value={view.id} />
            <input type="hidden" name="index" value={step} />
            <input type="hidden" name="last" value={last ? "1" : "0"} />
            <Button type="submit">{last ? "Finish lesson" : "Continue"}</Button>
          </form>
        )}
      </div>
      {searchParams.done && (
        <p role="status" className="mt-8 rounded border border-line bg-raised p-4">
          {view.completed ? "Lesson complete." : "You reached the end, but this lesson is not complete yet. Finish the required steps."}{" "}
          <Link className="underline" href={view.completed && view.nextLessonId ? `/learn/lesson/${view.nextLessonId}` : "/learn"}>
            {view.completed && view.nextLessonId ? "Next lesson" : "Back to my learning"}
          </Link>
        </p>
      )}
    </article>
  );
}
