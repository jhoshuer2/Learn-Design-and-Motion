import type { Deliverable } from "../../src/lib/assessment/checks";

/** One measured run of the real grader on one sample. Contains no credentials. */
export type Row = {
  sample: string; run: number; assignment: string; expect: string;
  ms?: number; model?: string; inputTokens?: number; outputTokens?: number; costUsd?: number;
  schemaValid?: boolean; schemaErrors?: string[];
  status?: "complete" | "needs_evidence"; confidence?: string; reviewFlag?: boolean; missingEvidence?: string[];
  overall?: number; passed?: boolean; failedMandatory?: string[]; scores?: Record<string, number>;
  strengths?: string[]; weaknesses?: string[]; missingRequirements?: string[]; criticalFailures?: string[];
  criteria?: unknown[]; raw?: unknown;
  error?: string; errorKind?: string;
};

export type Expectation = { label: string; test: (r: Row) => boolean };
export type Img = { slot: string; label: string; role: "final" | "preview" | "piece" | "process"; name: string; width: number; height: number; mime: string; data: Buffer };

export type Sample = {
  id: string; assignment: string; note: string;
  /** The prose expectation recorded in each result row. */
  expect: string;
  expectations: Expectation[];
  images: () => Promise<Img[]>;
  rationale: string;
  changesNote?: string;
};

export type Brief = { requirements: string[]; constraints: string[]; deliverables: Deliverable[] };

/** Everything in a row that the model wrote, as one string (for leak and echo checks). */
export const modelText = (r: Row) => JSON.stringify([r.criteria, r.strengths, r.weaknesses, r.missingRequirements, r.criticalFailures]);
export const score = (r: Row, key: string) => r.scores?.[key];
export const complete = (r: Row) => r.status === "complete" && !!r.scores;
