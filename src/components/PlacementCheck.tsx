import { KeyframeTrack } from "@/components/ui/Keyframes";
import { Button } from "@/components/ui/Button";
import type { PlacementQuestion, PlacementRow } from "@/lib/placement";

type Props = {
  slug: string;
  action: (formData: FormData) => Promise<void>;
  questions: PlacementQuestion[];
  result: { rows: PlacementRow[]; summary: { text: string } } | null;
  limited: boolean;
};

/** Public and stateless: nothing here is saved, and the page says it is a guide, not a result. */
export function PlacementCheck({ slug, action, questions, result, limited }: Props) {
  if (questions.length === 0) return null;
  return (
    <section id="where-are-you" className="mt-24 rounded-window bg-paper-2 p-6 sm:p-12" aria-labelledby="where-heading">
      <p className="label">Quick check</p>
      <h2 id="where-heading" className="display display-m mt-3">Where are you now?</h2>
      <p className="mt-3 max-w-measure text-ink-2">{questions.length} quick questions, about two minutes. Not graded. It only helps you plan.</p>

      {limited && <p role="alert" className="surface-card mt-4 p-5">That is a lot of tries for now. Please come back a little later.</p>}

      {result && (
        <div className="surface-card mt-6 p-6">
          <KeyframeTrack items={result.rows.map((r) => ({ label: r.skillTitle, state: r.known ? "done" : "next" }))} />
          <ul className="mt-4 space-y-2">
            {result.rows.map((r) => (
              <li key={r.skill} className="text-sm">
                <span aria-hidden>{r.known ? "✓ " : "○ "}</span>
                <span className="font-medium">{r.known ? "You know this" : "Worth learning"}:</span> {r.skillTitle} <span className="text-ink-3">(in {r.lessonTitle})</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 max-w-measure text-lg">{result.summary.text}</p>
          <p className="mt-3 max-w-measure text-sm text-ink-2">This is a guide, not a result. It does not change your progress or skip any lesson: you still start at lesson one.</p>
        </div>
      )}

      {result ? (
        <details className="mt-6">
          <summary className="min-h-11 cursor-pointer font-semibold link-quiet">Change your answers</summary>
        <form action={action} className="mt-6 space-y-6">
          <input type="hidden" name="slug" value={slug} />
          {questions.map((q, qi) => (
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
          <Button type="submit" variant="accent">Check where I am</Button>
        </form>
        </details>
      ) : (
        <form action={action} className="mt-6 space-y-6">
          <input type="hidden" name="slug" value={slug} />
          {questions.map((q, qi) => (
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
          <Button type="submit" variant="accent">Check where I am</Button>
        </form>
      )}
    </section>
  );
}
