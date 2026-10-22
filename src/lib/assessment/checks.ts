import { slotOf, type StoredFile } from "@/lib/submissions/access";

/**
 * Deterministic facts, computed by code. They are given to the model as facts, and the blocking ones
 * stop the evaluation before any model call (nothing is guessed about work that was not supplied).
 */
export const MIN_RATIONALE_WORDS = 20;

export type Deliverable = { key: string; label: string; description: string; role: string; required: boolean };

export type DeterministicChecks = {
  files: { slot: string; role: string; width: number; height: number }[];
  /** Only when the assignment has both a final and a preview deliverable. */
  previewIsSmaller?: boolean; aspectRatioMatches?: boolean;
  rationaleWords: number;
  missingEvidence: string[]; // blocking
};

const long = (f: { width: number; height: number }) => Math.max(f.width, f.height);

export function runChecks(files: StoredFile[], rationale: string, deliverables: Deliverable[]): DeterministicChecks {
  const have = new Set(files.map(slotOf));
  const rationaleWords = rationale.trim().split(/\s+/).filter(Boolean).length;
  const missingEvidence = deliverables.filter((d) => d.required && !have.has(d.key)).map((d) => `${d.label}: ${d.description}`);
  if (rationaleWords < MIN_RATIONALE_WORDS) {
    missingEvidence.push(`A written rationale of at least ${MIN_RATIONALE_WORDS} words explaining three design decisions.`);
  }
  const final = files.find((f) => f.role === "final");
  const preview = files.find((f) => f.role === "preview");
  return {
    files: files.map((f) => ({ slot: slotOf(f), role: f.role, width: f.width, height: f.height })),
    previewIsSmaller: final && preview ? long(preview) < long(final) : undefined,
    aspectRatioMatches: final && preview
      ? Math.abs(final.width / final.height - preview.width / preview.height) / (final.width / final.height) < 0.05
      : undefined,
    rationaleWords, missingEvidence,
  };
}
