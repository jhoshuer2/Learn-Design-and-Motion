import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { PortfolioError } from "./errors";
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
      await tx.peerReview.update({ where: { id: r.targetId }, data: { hidden: true, hiddenBy: mod.id } });
      await tx.report.updateMany({ where: { targetType: "REVIEW", targetId: r.targetId, status: "OPEN" }, data: { status: "ACTIONED", handledBy: mod.id, handledAt: new Date() } });
    }
    if (action === "hold_project") {
      await tx.portfolioProject.update({ where: { id: detail.project.id }, data: { moderationHold: true, visibility: "PRIVATE" } });
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
  await db.portfolioProject.update({ where: { id: projectId }, data: { moderationHold: false } });
  await db.auditEvent.create({ data: { actorId: mod.id, action: "moderation.hold_released", subject: `project:${projectId}`, detail: {} } });
}
