import { createHash } from "node:crypto";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { PortfolioError } from "./errors";
import { getStorage } from "@/lib/storage";
import { notify } from "@/lib/notify";
import { screenFields } from "@/lib/safety/screen";
import { getImageScreener } from "@/lib/safety/images";
import type { StoredFile } from "@/lib/submissions/access";

/**
 * Moderation. REVIEWER and ADMIN only, enforced here (not just by the page). Like peer.ts, this module must not
 * touch progression or assessment tables. A moderator cannot act on content they own.
 */
type Mod = { id: string; role: Role };
const isMod = (m: Mod) => m.role === "REVIEWER" || m.role === "ADMIN";
const need = (m: Mod) => { if (!isMod(m)) throw new PortfolioError("forbidden"); };

export async function listOpenReports(mod: Mod) {
  need(mod);
  const reports = await db.report.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" } });
  const out = [];
  for (const r of reports) {
    if (r.targetType === "PROJECT") {
      const p = await db.portfolioProject.findUnique({ where: { id: r.targetId }, include: { user: { select: { displayName: true } } } });
      if (p) out.push({ id: r.id, type: "PROJECT" as const, reason: r.reason, createdAt: r.createdAt, title: p.title, owner: p.user.displayName ?? "Learner", visibility: p.visibility, held: p.moderationHold, projectId: p.id, excerpt: null as string | null });
    } else {
      const v = await db.peerReview.findUnique({ where: { id: r.targetId }, include: { project: { include: { user: { select: { displayName: true } } } }, reviewer: { select: { displayName: true } } } });
      if (v) out.push({ id: r.id, type: "REVIEW" as const, reason: r.reason, createdAt: r.createdAt, title: v.project.title, owner: v.project.user.displayName ?? "Learner", visibility: v.project.visibility, held: v.project.moderationHold, projectId: v.projectId, excerpt: `${v.strengths}\n\n${v.improvements}${v.questions ? `\n\n${v.questions}` : ""}` });
    }
  }
  return out;
}

/** What a moderator needs to judge a report: the project's shown images (via the reviewer-only file route) and text. */
export async function getReportDetail(mod: Mod, reportId: string) {
  need(mod);
  const r = await db.report.findUnique({ where: { id: reportId } });
  if (!r) throw new PortfolioError("not_found");
  const projectId = r.targetType === "PROJECT" ? r.targetId : (await db.peerReview.findUnique({ where: { id: r.targetId } }))?.projectId;
  const p = projectId ? await db.portfolioProject.findUnique({ where: { id: projectId }, include: { submission: true, user: { select: { displayName: true } }, reviews: { include: { reviewer: { select: { displayName: true } } }, orderBy: { createdAt: "desc" } } } }) : null;
  if (!p) throw new PortfolioError("not_found");
  if (p.userId === mod.id) throw new PortfolioError("own_project", "You cannot moderate your own work.");
  const files = p.submission.files as unknown as StoredFile[];
  return {
    report: { id: r.id, type: r.targetType, reason: r.reason, status: r.status, targetId: r.targetId },
    project: { id: p.id, title: p.title, summary: p.summary, owner: p.user.displayName ?? "Learner", visibility: p.visibility, held: p.moderationHold, submissionId: p.submissionId, rationale: p.showRationale ? p.submission.rationale : null },
    images: p.shownFiles.filter((i) => i < files.length).map((i) => ({ idx: i, label: files[i].slot ?? files[i].role })),
    reviews: p.reviews.map((v) => ({ id: v.id, reviewer: v.reviewer.displayName ?? "Learner", strengths: v.strengths, improvements: v.improvements, question: v.questions, hidden: v.hidden, flagged: r.targetType === "REVIEW" && r.targetId === v.id })),
  };
}

export type ModAction = "hide_review" | "hold_project" | "dismiss";

/**
 * Resolve a report. The claim is atomic (only one moderator acts). `hold_project` forces the project PRIVATE and
 * blocks re-publishing; `hide_review` hides one review; either closes every open report on the same target.
 */
export async function resolveReport(mod: Mod, reportId: string, action: ModAction, note: string) {
  need(mod);
  const n = note.trim();
  if (n.length < 5) throw new PortfolioError("invalid", "Give a short reason for the decision.");
  const r = await db.report.findUnique({ where: { id: reportId } });
  if (!r) throw new PortfolioError("not_found");
  const detail = await getReportDetail(mod, reportId); // also refuses own content
  if (action === "hide_review" && r.targetType !== "REVIEW") throw new PortfolioError("invalid", "Only a reported review can be hidden.");

  return db.$transaction(async (tx) => {
    const claim = await tx.report.updateMany({ where: { id: reportId, status: "OPEN" }, data: { status: action === "dismiss" ? "DISMISSED" : "ACTIONED", handledBy: mod.id, handledAt: new Date() } });
    if (claim.count === 0) throw new PortfolioError("invalid", "This report has already been handled.");
    if (action === "hide_review") {
      const hidden = await tx.peerReview.update({ where: { id: r.targetId }, data: { hidden: true, hiddenBy: mod.id } });
      await notify(tx, hidden.reviewerId, "review_hidden", `A moderator hid your feedback on "${detail.project.title}". Reason: ${n}`, hidden.id);
      await tx.report.updateMany({ where: { targetType: "REVIEW", targetId: r.targetId, status: "OPEN" }, data: { status: "ACTIONED", handledBy: mod.id, handledAt: new Date() } });
    }
    if (action === "hold_project") {
      const held = await tx.portfolioProject.update({ where: { id: detail.project.id }, data: { moderationHold: true, visibility: "PRIVATE", publicApproval: "NONE" } });
      await notify(tx, held.userId, "project_held", `Your project "${held.title}" was put on hold by a moderator and is now private. Reason: ${n}`, held.id);
      await tx.report.updateMany({ where: { targetType: "PROJECT", targetId: detail.project.id, status: "OPEN" }, data: { status: "ACTIONED", handledBy: mod.id, handledAt: new Date() } });
    }
    await tx.auditEvent.create({ data: { actorId: mod.id, action: "moderation.resolved", subject: `report:${reportId}`, detail: { action, note: n, projectId: detail.project.id } } });
    return { action };
  });
}

/** Lift a hold. The owner still has to choose to share again. */
export async function releaseHold(mod: Mod, projectId: string) {
  need(mod);
  const p = await db.portfolioProject.findUnique({ where: { id: projectId } });
  if (!p) throw new PortfolioError("not_found");
  if (p.userId === mod.id) throw new PortfolioError("own_project");
  await db.$transaction([
    db.portfolioProject.update({ where: { id: projectId }, data: { moderationHold: false } }),
    db.auditEvent.create({ data: { actorId: mod.id, action: "moderation.hold_released", subject: `project:${projectId}`, detail: {} } }),
    db.notification.create({ data: { userId: p.userId, kind: "hold_released", text: `The hold on "${p.title}" was lifted. It stays private until you choose to share it again.`, subjectId: p.id } }),
  ]);
}

// ───────── Pre-moderation of Public sharing

type ApprovalSubject = {
  title: string; summary: string | null; shownFiles: number[]; showRationale: boolean; showEvaluation: boolean;
  submission: { rationale: string | null };
};
/** What a visitor would see, as one hash. A decision applies to exactly this and to nothing the owner changed afterwards. */
export const contentFingerprint = (p: ApprovalSubject) =>
  createHash("sha256").update(JSON.stringify([p.title, p.summary ?? null, p.shownFiles, p.showRationale, p.showEvaluation, p.showRationale ? p.submission.rationale ?? "" : null])).digest("hex");

export async function listPendingApprovals(mod: Mod) {
  need(mod);
  const rows = await db.portfolioProject.findMany({
    where: { visibility: "PUBLIC", publicApproval: "PENDING", moderationHold: false }, orderBy: { publishedAt: "asc" },
    include: { user: { select: { displayName: true } } },
  });
  return rows.map((p) => ({ id: p.id, title: p.title, owner: p.user.displayName ?? "Learner", since: p.publishedAt ?? p.createdAt, mine: p.userId === mod.id }));
}

export async function getApprovalDetail(mod: Mod, projectId: string) {
  need(mod);
  const p = await db.portfolioProject.findUnique({ where: { id: projectId }, include: { submission: true, user: { select: { displayName: true } } } });
  if (!p) throw new PortfolioError("not_found");
  if (p.userId === mod.id) throw new PortfolioError("own_project", "You cannot moderate your own work.");
  const files = p.submission.files as unknown as StoredFile[];
  const shown = p.shownFiles.filter((i) => i < files.length);
  const storage = getStorage();
  const verdict = await getImageScreener().screen(await Promise.all(shown.map(async (i) => ({ data: await storage.get(files[i].key), mime: files[i].mime }))));
  const screened = screenFields([{ label: "Title", text: p.title }, { label: "Summary", text: p.summary }, ...(p.showRationale ? [{ label: "Rationale", text: p.submission.rationale }] : [])]);
  return {
    id: p.id, title: p.title, summary: p.summary, owner: p.user.displayName ?? "Learner", status: p.publicApproval, visibility: p.visibility, held: p.moderationHold,
    submissionId: p.submissionId, rationale: p.showRationale ? p.submission.rationale : null, showsEvaluation: p.showEvaluation,
    images: shown.map((i) => ({ idx: i, label: files[i].slot ?? files[i].role })),
    textFlags: screened.flags, textRefusal: screened.refuse, imageScreening: verdict,
    fingerprint: contentFingerprint(p),
  };
}

/**
 * Approve or reject what a project would show publicly. Atomic (one moderator wins) and bound to the content the
 * moderator actually looked at: if the owner changed anything meanwhile, the decision is refused.
 */
export async function decideApproval(mod: Mod, projectId: string, decision: "approve" | "reject", note: string, seenFingerprint: string) {
  need(mod);
  const n = note.trim();
  if (decision === "reject" && n.length < 5) throw new PortfolioError("invalid", "Tell the owner why, in a few words.");
  const p = await db.portfolioProject.findUnique({ where: { id: projectId }, include: { submission: true } });
  if (!p) throw new PortfolioError("not_found");
  if (p.userId === mod.id) throw new PortfolioError("own_project", "You cannot moderate your own work.");
  if (contentFingerprint(p) !== seenFingerprint) throw new PortfolioError("invalid", "The owner changed this project while you were looking. Review it again.");
  return db.$transaction(async (tx) => {
    const claim = await tx.portfolioProject.updateMany({
      where: { id: projectId, visibility: "PUBLIC", publicApproval: "PENDING", moderationHold: false },
      data: { publicApproval: decision === "approve" ? "APPROVED" : "REJECTED", approvalNote: n || null, approvedBy: mod.id, approvedAt: new Date() },
    });
    if (claim.count === 0) throw new PortfolioError("invalid", "This project is no longer waiting for approval.");
    await tx.auditEvent.create({ data: { actorId: mod.id, action: decision === "approve" ? "moderation.approved" : "moderation.rejected", subject: `project:${projectId}`, detail: { note: n } } });
    await notify(tx, p.userId, decision === "approve" ? "approved" : "not_approved",
      decision === "approve" ? `"${p.title}" was approved and is now public.` : `"${p.title}" was not approved for public sharing. ${n} You can change it and ask again, or share it by link.`, p.id);
    return { decision };
  });
}
