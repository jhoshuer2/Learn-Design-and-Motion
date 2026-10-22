import type { StoredFile } from "@/lib/submissions/access";

/**
 * Deterministic facts, computed by code. They are given to the model as facts, and the blocking ones
 * stop the evaluation before any model call (nothing is guessed about work that was not supplied).
 */
export const MIN_RATIONALE_WORDS = 20;

export type DeterministicChecks = {
  hasFinal: boolean; hasPreview: boolean;
  final?: { width: number; height: number }; preview?: { width: number; height: number };
  previewIsSmaller?: boolean; aspectRatioMatches?: boolean;
  rationaleWords: number;
  missingEvidence: string[]; // blocking
};

const long = (f: { width: number; height: number }) => Math.max(f.width, f.height);

export function runChecks(files: StoredFile[], rationale: string): DeterministicChecks {
  const final = files.find((f) => f.role === "final");
  const preview = files.find((f) => f.role === "preview");
  const rationaleWords = rationale.trim().split(/\s+/).filter(Boolean).length;
  const missingEvidence: string[] = [];
  if (!final) missingEvidence.push("An image export of the final poster.");
  if (!preview) missingEvidence.push("A small-scale preview image (about 400 px on the long side).");
  if (rationaleWords < MIN_RATIONALE_WORDS) {
    missingEvidence.push(`A written rationale of at least ${MIN_RATIONALE_WORDS} words explaining three design decisions.`);
  }
  const both = final && preview;
  return {
    hasFinal: !!final, hasPreview: !!preview,
    final: final && { width: final.width, height: final.height },
    preview: preview && { width: preview.width, height: preview.height },
    previewIsSmaller: both ? long(preview) < long(final) : undefined,
    aspectRatioMatches: both
      ? Math.abs(final.width / final.height - preview.width / preview.height) / (final.width / final.height) < 0.05
      : undefined,
    rationaleWords, missingEvidence,
  };
}
