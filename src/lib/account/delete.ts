import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import type { StoredFile } from "@/lib/submissions/access";

export const DELETE_PHRASE = "delete my account";

export class AccountError extends Error {
  constructor(public code: "not_found" | "wrong_password" | "confirm_required" | "last_admin" | "no_password", message?: string) { super(message ?? code); }
}

/**
 * Permanently delete a learner's account and everything they made. Needs the password and a typed confirmation.
 *
 * Removed: the account, every submission, uploaded file, assessment, appeal, progress and skill record, every portfolio
 * project (so every shared page and image), peer feedback they wrote or received, reports and blocks involving them,
 * and their notices. References to them on other people's rows (reviewer, handler, approver) are cleared.
 * Kept: de-identified audit rows (the actor is removed; the action and time remain) and aggregate counts. Nothing that
 * could identify them stays in the database. Uploaded files are removed from storage after the database commit.
 */
export async function deleteAccount(userId: string, input: { password: string; confirm: string }) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new AccountError("not_found");
  if (!user.passwordHash) throw new AccountError("no_password", "This account has no password to confirm with.");
  if (!(await bcrypt.compare(input.password, user.passwordHash))) throw new AccountError("wrong_password", "That password is not right.");
  if (input.confirm.trim().toLowerCase() !== DELETE_PHRASE) throw new AccountError("confirm_required", `Type "${DELETE_PHRASE}" to confirm.`);

  const keys: string[] = [];
  const result = await db.$transaction(async (tx) => {
    if (user.role === "ADMIN" && (await tx.user.count({ where: { role: "ADMIN" } })) <= 1) {
      throw new AccountError("last_admin", "You are the only administrator. Make someone else an administrator first.");
    }
    const subs = await tx.submission.findMany({ where: { userId }, select: { id: true, files: true } });
    for (const s of subs) for (const f of s.files as unknown as StoredFile[]) if (f?.key) keys.push(f.key);
    const sid = subs.map((s) => s.id);
    const evs = await tx.evaluation.findMany({ where: { submissionId: { in: sid } }, select: { id: true } });
    const eid = evs.map((e) => e.id);
    const projects = await tx.portfolioProject.findMany({ where: { OR: [{ userId }, { submissionId: { in: sid } }] }, select: { id: true } });
    const pid = projects.map((p) => p.id);
    const reviews = await tx.peerReview.findMany({ where: { OR: [{ projectId: { in: pid } }, { reviewerId: userId }] }, select: { id: true } });
    const rid = reviews.map((r) => r.id);

    await tx.report.deleteMany({ where: { OR: [{ reporterId: userId }, { targetId: { in: [...pid, ...rid] } }] } });
    await tx.peerReview.deleteMany({ where: { id: { in: rid } } });
    await tx.reviewerBlock.deleteMany({ where: { OR: [{ ownerId: userId }, { blockedId: userId }] } });
    await tx.portfolioProject.deleteMany({ where: { id: { in: pid } } });
    await tx.appeal.deleteMany({ where: { OR: [{ userId }, { evaluationId: { in: eid } }] } });
    await tx.criterionScore.deleteMany({ where: { evaluationId: { in: eid } } });
    await tx.evaluation.updateMany({ where: { supersedesId: { in: eid } }, data: { supersedesId: null } });
    await tx.evaluation.deleteMany({ where: { id: { in: eid } } });
    await tx.evaluationJob.deleteMany({ where: { submissionId: { in: sid } } });
    await tx.submission.deleteMany({ where: { id: { in: sid } } });
    await tx.skillEvidence.deleteMany({ where: { userId } });
    await tx.quizAttempt.deleteMany({ where: { userId } });
    await tx.blockView.deleteMany({ where: { userId } });
    await tx.progress.deleteMany({ where: { userId } });
    await tx.levelCompletion.deleteMany({ where: { userId } });
    await tx.remediation.deleteMany({ where: { userId } });
    await tx.enrollment.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.authToken.deleteMany({ where: { userId } });

    // Their decisions on other people's work stay, without their identity.
    await tx.appeal.updateMany({ where: { reviewerId: userId }, data: { reviewerId: null } });
    await tx.report.updateMany({ where: { handledBy: userId }, data: { handledBy: null } });
    await tx.peerReview.updateMany({ where: { hiddenBy: userId }, data: { hiddenBy: null } });
    await tx.portfolioProject.updateMany({ where: { approvedBy: userId }, data: { approvedBy: null } });
    await tx.auditEvent.updateMany({ where: { actorId: userId }, data: { actorId: null } });

    await tx.user.delete({ where: { id: userId } });
    await tx.auditEvent.create({ data: { actorId: null, action: "account.deleted", subject: "account", detail: { submissions: sid.length, projects: pid.length } } });
    return { submissions: sid.length, projects: pid.length };
  });

  // After the commit: if a file cannot be removed it is logged by key (not by person) for a sweep, never retried silently.
  const storage = getStorage();
  const failed: string[] = [];
  await Promise.all(keys.map((k) => storage.delete(k).catch(() => { failed.push(k); })));
  if (failed.length > 0) console.error(`account deletion: ${failed.length} stored file(s) need a manual sweep:`, failed.join(","));
  return { ...result, filesRemoved: keys.length - failed.length, filesFailed: failed.length };
}
