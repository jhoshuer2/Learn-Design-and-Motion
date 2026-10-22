import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { projectAccess } from "./access";
import { PortfolioError } from "./errors";
import { screenFields } from "@/lib/safety/screen";

/**
 * Peer feedback. By design this module reads and writes ONLY peer-review, block, report and audit rows:
 * it must never touch progression or assessment tables (a test greps this file to keep it that way).
 */

export const REVIEW_MIN = 20;
export const REVIEW_MAX = 1500;
export const QUESTION_MAX = 500;
export const REASON_MIN = 10;
export const REASON_MAX = 500;
export const MAX_REVIEWS_PER_HOUR = 10;
export const MAX_REPORTS_PER_HOUR = 10;

/** Plain text only: control characters removed, runs of blank lines collapsed. Rendering escapes the rest. */
export function cleanText(s: string): string {
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function underLimit(actorId: string, action: string, max: number) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  return (await db.auditEvent.count({ where: { actorId, action, createdAt: { gte: since } } })) < max;
}

export async function createReview(
  reviewerId: string, slug: string, input: { strengths: string; improvements: string; question?: string },
) {
  const strengths = cleanText(input.strengths ?? "");
  const improvements = cleanText(input.improvements ?? "");
  const question = cleanText(input.question ?? "");
  for (const [label, text] of [["Strengths", strengths], ["Suggestions", improvements]] as const) {
    if (text.length < REVIEW_MIN) throw new PortfolioError("invalid", `${label} needs at least ${REVIEW_MIN} characters. Be specific.`);
    if (text.length > REVIEW_MAX) throw new PortfolioError("invalid", `${label} can be at most ${REVIEW_MAX} characters.`);
  }
  const screened = screenFields([{ label: "Strengths", text: strengths }, { label: "Suggestions", text: improvements }, { label: "Your question", text: question }]);
  if (screened.refuse) throw new PortfolioError("invalid", screened.refuse);
  if (screened.flags.length > 0) throw new PortfolioError("invalid", "Some of that text cannot be posted. Please rephrase it.");
  if (question.length > QUESTION_MAX) throw new PortfolioError("invalid", `Your question can be at most ${QUESTION_MAX} characters.`);

  const [reviewer, project] = await Promise.all([
    db.user.findUnique({ where: { id: reviewerId }, select: { id: true, role: true, displayName: true } }),
    db.portfolioProject.findUnique({ where: { slug } }),
  ]);
  if (!reviewer) throw new PortfolioError("sign_in_required");
  // Missing, private and held projects are indistinguishable to the reviewer.
  if (!project || projectAccess(reviewer, project) === "none") throw new PortfolioError("not_visible");
  if (project.userId === reviewerId) throw new PortfolioError("own_project", "You cannot review your own work.");
  if (!reviewer.displayName) throw new PortfolioError("display_name_required", "Choose a display name before you leave feedback.");
  if (await db.reviewerBlock.findUnique({ where: { ownerId_blockedId: { ownerId: project.userId, blockedId: reviewerId } } })) {
    throw new PortfolioError("blocked", "You cannot review this project.");
  }
  if (!(await underLimit(reviewerId, "review.created", MAX_REVIEWS_PER_HOUR))) {
    throw new PortfolioError("rate_limited", "You have left a lot of feedback in the last hour. Please try again later.");
  }
  try {
    const review = await db.peerReview.create({
      data: { projectId: project.id, reviewerId, strengths, improvements, questions: question || null },
    });
    await db.auditEvent.create({ data: { actorId: reviewerId, action: "review.created", subject: `review:${review.id}`, detail: { projectId: project.id } } });
    return review;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new PortfolioError("duplicate_review", "You have already reviewed this project.");
    throw e;
  }
}

/** A reviewer can take back their own review. */
export async function withdrawReview(reviewerId: string, reviewId: string) {
  const r = await db.peerReview.findFirst({ where: { id: reviewId, reviewerId } });
  if (!r) throw new PortfolioError("not_found");
  await db.$transaction([
    db.report.deleteMany({ where: { targetType: "REVIEW", targetId: reviewId } }),
    db.peerReview.delete({ where: { id: reviewId } }),
    db.auditEvent.create({ data: { actorId: reviewerId, action: "review.withdrawn", subject: `review:${reviewId}`, detail: {} } }),
  ]);
}

async function ownedReview(ownerId: string, reviewId: string) {
  const r = await db.peerReview.findUnique({ where: { id: reviewId }, include: { project: true } });
  if (!r || r.project.userId !== ownerId) throw new PortfolioError("not_found");
  return r;
}

/** Owner: hide (or restore) a review on one of their projects. Hidden reviews stay visible to the owner only. */
export async function setReviewHidden(ownerId: string, reviewId: string, hidden: boolean) {
  const r = await ownedReview(ownerId, reviewId);
  await db.peerReview.update({ where: { id: r.id }, data: { hidden, hiddenBy: hidden ? ownerId : null } });
  await db.auditEvent.create({ data: { actorId: ownerId, action: hidden ? "review.hidden" : "review.restored", subject: `review:${reviewId}`, detail: {} } });
}

/** Owner: delete a review on one of their projects. */
export async function deleteReview(ownerId: string, reviewId: string) {
  const r = await ownedReview(ownerId, reviewId);
  await db.$transaction([
    db.report.deleteMany({ where: { targetType: "REVIEW", targetId: r.id } }),
    db.peerReview.delete({ where: { id: r.id } }),
    db.auditEvent.create({ data: { actorId: ownerId, action: "review.deleted", subject: `review:${reviewId}`, detail: {} } }),
  ]);
}

/** Owner: stop a person reviewing their work. Their existing reviews on the owner's projects are hidden. */
export async function blockReviewer(ownerId: string, blockedId: string) {
  if (ownerId === blockedId) throw new PortfolioError("invalid", "You cannot block yourself.");
  if (!(await db.user.findUnique({ where: { id: blockedId }, select: { id: true } }))) throw new PortfolioError("not_found");
  await db.$transaction([
    db.reviewerBlock.upsert({ where: { ownerId_blockedId: { ownerId, blockedId } }, update: {}, create: { ownerId, blockedId } }),
    db.peerReview.updateMany({ where: { reviewerId: blockedId, project: { userId: ownerId } }, data: { hidden: true, hiddenBy: ownerId } }),
    db.auditEvent.create({ data: { actorId: ownerId, action: "reviewer.blocked", subject: `user:${blockedId}`, detail: {} } }),
  ]);
}

/** Owner: block the author of a review on one of their projects, without ever exposing the reviewer's user id. */
export async function blockReviewerOfReview(ownerId: string, reviewId: string) {
  const r = await ownedReview(ownerId, reviewId);
  await blockReviewer(ownerId, r.reviewerId);
}

export async function unblockReviewer(ownerId: string, blockedId: string) {
  await db.reviewerBlock.deleteMany({ where: { ownerId, blockedId } });
  await db.auditEvent.create({ data: { actorId: ownerId, action: "reviewer.unblocked", subject: `user:${blockedId}`, detail: {} } });
}

export async function listBlocked(ownerId: string) {
  const rows = await db.reviewerBlock.findMany({ where: { ownerId }, include: { blocked: { select: { displayName: true } } }, orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({ userId: r.blockedId, name: r.blocked.displayName ?? "Learner" }));
}

async function createReport(reporterId: string, targetType: "PROJECT" | "REVIEW", targetId: string, reasonIn: string) {
  const reason = cleanText(reasonIn ?? "");
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    throw new PortfolioError("invalid", `Tell us what is wrong in ${REASON_MIN} to ${REASON_MAX} characters.`);
  }
  if (!(await underLimit(reporterId, "report.created", MAX_REPORTS_PER_HOUR))) throw new PortfolioError("rate_limited", "You have made a lot of reports in the last hour.");
  try {
    const report = await db.report.create({ data: { targetType, targetId, reporterId, reason } });
    await db.auditEvent.create({ data: { actorId: reporterId, action: "report.created", subject: `report:${report.id}`, detail: { targetType } } });
    return report;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new PortfolioError("already_reported", "You have already reported this.");
    throw e;
  }
}

/** Any signed-in user can report a project they are able to see (never their own). */
export async function reportProject(reporterId: string, slug: string, reason: string) {
  const p = await db.portfolioProject.findUnique({ where: { slug } });
  if (!p || projectAccess({ id: reporterId, role: "LEARNER" }, p) !== "public") throw new PortfolioError("not_visible");
  return createReport(reporterId, "PROJECT", p.id, reason);
}

/** Any signed-in user can report a review that is visible on a project they can see (never their own). */
export async function reportReview(reporterId: string, reviewId: string, reason: string) {
  const r = await db.peerReview.findUnique({ where: { id: reviewId }, include: { project: true } });
  if (!r || r.hidden) throw new PortfolioError("not_visible");
  const access = projectAccess({ id: reporterId, role: "LEARNER" }, r.project);
  if (access === "none") throw new PortfolioError("not_visible");
  if (r.reviewerId === reporterId) throw new PortfolioError("forbidden", "You cannot report your own review. You can withdraw it instead.");
  return createReport(reporterId, "REVIEW", reviewId, reason);
}
