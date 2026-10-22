import { db } from "@/lib/db";
import { learnerMessage, type ProviderErrorKind } from "@/lib/assessment/errors";
import { getPause } from "./flags";
import { positionOf } from "./queue";

/** What a learner can be told about their submission's assessment. Never carries provider detail. */
export type AssessmentPhase = "queued" | "running" | "paused" | "retrying" | "attention" | "idle" | "finished";
export type AssessmentStatus = { phase: AssessmentPhase; submissionStatus: string; position: number | null; message: string };

export async function getAssessmentStatus(submissionId: string): Promise<AssessmentStatus | null> {
  const sub = await db.submission.findUnique({ where: { id: submissionId }, select: { status: true } });
  if (!sub) return null;
  const base = { submissionStatus: sub.status, position: null as number | null };
  if (sub.status === "EVALUATING") return { ...base, phase: "running", message: "Your work is being assessed now. This usually takes a minute or two." };
  if (sub.status !== "SUBMITTED" && sub.status !== "FAILED_TO_EVALUATE") return { ...base, phase: "finished", message: "" };

  const active = await db.evaluationJob.findUnique({ where: { activeKey: submissionId } });
  if (active) {
    if (await getPause()) return { ...base, phase: "paused", message: learnerMessage("billing") };
    if (active.lastErrorKind && active.runAfter.getTime() > Date.now()) {
      return { ...base, phase: "retrying", message: learnerMessage(active.lastErrorKind as ProviderErrorKind) };
    }
    const position = await positionOf(submissionId);
    return { ...base, phase: "queued", position, message: "Your work is saved and waiting to be assessed." };
  }
  if (sub.status === "FAILED_TO_EVALUATE") {
    const last = await db.evaluationJob.findFirst({ where: { submissionId, status: "FAILED_FINAL" }, orderBy: { createdAt: "desc" }, select: { lastErrorKind: true } });
    return { ...base, phase: "attention", message: learnerMessage((last?.lastErrorKind as ProviderErrorKind | undefined) ?? "refusal") };
  }
  return { ...base, phase: "idle", message: "Your work is saved. No assessment has been queued yet." };
}
