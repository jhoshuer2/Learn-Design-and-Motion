import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getAssignmentAccess, type AssignmentDenied } from "@/lib/progression";
import { getStorage } from "@/lib/storage";
import { UploadError, assertFileCount, validateImage } from "@/lib/storage/validate";
import type { StoredFile } from "./access";

export const MAX_RATIONALE_CHARS = 4000;
export const MIN_CHANGES_WORDS = 5;

export type SubmitErrorCode = AssignmentDenied | "changes_note_required" | "no_files" | "rationale_too_long";
export class SubmissionError extends Error {
  constructor(public code: SubmitErrorCode, public detail?: { missing?: string[]; submissionId?: string }) {
    super(`Cannot submit: ${code}`);
  }
}

export type UploadedFile = { role: StoredFile["role"]; name: string; data: Buffer };

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Create a submission (or amend the open one that was waiting for more evidence). Every rule is enforced
 * here, on the server: access and attempts come from getAssignmentAccess, and files are decoded and validated
 * before anything is stored. Attempts are unique per (user, assignment), so two simultaneous submits cannot
 * both create the same attempt.
 */
export async function createSubmission(
  userId: string, assignmentId: string,
  input: { files: UploadedFile[]; rationale: string; changesNote?: string },
): Promise<{ submissionId: string; amended: boolean }> {
  const access = await getAssignmentAccess(userId, assignmentId);
  if (!access.allowed) throw new SubmissionError(access.reason, { missing: access.missing, submissionId: access.submissionId });

  const rationale = input.rationale.trim();
  if (rationale.length > MAX_RATIONALE_CHARS) throw new SubmissionError("rationale_too_long");
  if (!access.amending && access.attemptsUsed > 0 && words(input.changesNote ?? "") < MIN_CHANGES_WORDS) {
    throw new SubmissionError("changes_note_required");
  }
  if (input.files.length === 0) throw new SubmissionError("no_files");
  assertFileCount(input.files.length);

  const validated = await Promise.all(input.files.map(async (f) => ({ role: f.role, v: await validateImage(f.name, f.data) })));
  const storage = getStorage();
  const stored: StoredFile[] = [];
  try {
    for (const { role, v } of validated) {
      const key = await storage.put(v.buffer);
      stored.push({ key, name: v.name, mime: v.mime, size: v.size, sha256: v.sha256, width: v.width, height: v.height, role });
    }

    if (access.amending) {
      const prev = await db.submission.findUniqueOrThrow({ where: { id: access.amending.id } });
      await db.submission.update({
        where: { id: prev.id },
        data: { files: stored as unknown as Prisma.InputJsonValue, rationale, status: "SUBMITTED" },
      });
      await Promise.all((prev.files as unknown as StoredFile[]).map((f) => storage.delete(f.key).catch(() => undefined)));
      await db.auditEvent.create({ data: { actorId: userId, action: "submission.amended", subject: `submission:${prev.id}`, detail: {} } });
      return { submissionId: prev.id, amended: true };
    }

    const sub = await db.submission.create({
      data: {
        userId, assignmentId, attempt: access.attempt, status: "SUBMITTED",
        files: stored as unknown as Prisma.InputJsonValue, rationale, changesNote: input.changesNote?.trim() || null,
      },
    });
    await db.auditEvent.create({ data: { actorId: userId, action: "submission.created", subject: `submission:${sub.id}`, detail: { attempt: access.attempt } } });
    return { submissionId: sub.id, amended: false };
  } catch (e) {
    await Promise.all(stored.map((f) => storage.delete(f.key).catch(() => undefined)));
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new SubmissionError("in_progress");
    throw e;
  }
}

export { UploadError };

import { evaluateSubmission, type EvaluateOutcome } from "@/lib/assessment/evaluate";

/** Owner-only. Re-runs evaluation for a submission that never produced a result (failed, or the assessor was not configured). */
export async function retryEvaluation(userId: string, submissionId: string): Promise<EvaluateOutcome> {
  const sub = await db.submission.findFirst({ where: { id: submissionId, userId } });
  if (!sub) return { state: "failed", reason: "provider_error" };
  if (sub.status !== "SUBMITTED" && sub.status !== "FAILED_TO_EVALUATE") return { state: "busy" };
  return evaluateSubmission(sub.id);
}
