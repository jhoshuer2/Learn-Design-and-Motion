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
    <section id="where-are-you" className="mt-12" aria-labelledby="where-heading">
      <h2 id="where-heading" className="font-display text-3xl">Where are you now?</h2>
      <p className="mt-2 max-w-measure text-muted">{questions.length} quick questions, about two minutes. Not graded. It only helps you plan.</p>

      {limited && <p role="alert" className="mt-4 rounded-lg border-2 border-line bg-raised p-4">That is a lot of tries for now. Please come back a little later.</p>}

      {result && (
        <div className="mt-6 rounded-lg border-2 border-ink p-5">
          <KeyframeTrack items={result.rows.map((r) => ({ label: r.skillTitle, state: r.known ? "done" : "next" }))} />
          <ul className="mt-4 space-y-2">
            {result.rows.map((r) => (
              <li key={r.skill} className="text-sm">
                <span aria-hidden>{r.known ? "✓ " : "○ "}</span>
                <span className="font-medium">{r.known ? "You know this" : "Worth learning"}:</span> {r.skillTitle} <span className="text-muted">(in {r.lessonTitle})</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 max-w-measure text-lg">{result.summary.text}</p>
          <p className="mt-3 max-w-measure text-sm text-muted">This is a guide, not a result. It does not change your progress or skip any lesson: you still start at lesson one.</p>
        </div>
      )}

      {result ? (
        <details className="mt-6">
          <summary className="min-h-11 cursor-pointer font-semibold underline underline-offset-4">Change your answers</summary>
        <form action={action} className="mt-6 space-y-6">
          <input type="hidden" name="slug" value={slug} />
          {questions.map((q, qi) => (
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
          <Button type="submit" variant="primary">Check where I am</Button>
        </form>
        </details>
      ) : (
        <form action={action} className="mt-6 space-y-6">
          <input type="hidden" name="slug" value={slug} />
          {questions.map((q, qi) => (
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
          <Button type="submit" variant="primary">Check where I am</Button>
        </form>
      )}
    </section>
  );
}
