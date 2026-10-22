import { Prisma, type Visibility } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { slotOf, type StoredFile } from "@/lib/submissions/access";
import { PortfolioError } from "./errors";
import { screenFields } from "@/lib/safety/screen";

export { PortfolioError } from "./errors";

/** Unguessable (96 bits). LINK visibility is only as private as this token. */
export const newSlug = () => randomBytes(12).toString("base64url");
const newHandle = () => `u-${randomBytes(6).toString("base64url").toLowerCase().replace(/[_-]/g, "x")}`;

export const GALLERY_PAGE_SIZE = 24;

const patchSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  summary: z.string().trim().max(600).nullable().optional(),
  visibility: z.enum(["PRIVATE", "LINK", "PUBLIC"]).optional(),
  shownFiles: z.array(z.number().int().min(0)).max(8).optional(),
  showRationale: z.boolean().optional(),
  showEvaluation: z.boolean().optional(),
});
export type ProjectPatch = z.infer<typeof patchSchema>;

/** Submissions this learner could turn into a project: their own, with a completed evaluation, not already shared. */
export async function listEligibleSubmissions(userId: string) {
  const subs = await db.submission.findMany({
    where: { userId, status: "EVALUATED", portfolio: null, evaluations: { some: { status: "complete" } } },
    include: { assignment: true, evaluations: { where: { status: "complete" }, orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });
  return subs.map((s) => ({ submissionId: s.id, assignment: s.assignment.title, attempt: s.attempt, score: s.evaluations[0]?.overallScore ?? null, passed: s.evaluations[0]?.passed ?? null }));
}

/** Always created PRIVATE. Only the owner's own, evaluated submissions qualify. */
export async function createProject(userId: string, submissionId: string) {
  const sub = await db.submission.findFirst({
    where: { id: submissionId, userId },
    include: { assignment: true, portfolio: true, evaluations: { where: { status: "complete" }, take: 1 } },
  });
  if (!sub) throw new PortfolioError("not_found");
  if (sub.status !== "EVALUATED" || sub.evaluations.length === 0) throw new PortfolioError("not_evaluated", "Only work that has been assessed can be added to your portfolio.");
  if (sub.portfolio) throw new PortfolioError("already_exists");

  const files = sub.files as unknown as StoredFile[];
  const shownFiles = files.map((f, i) => ({ f, i })).filter(({ f }) => f.role !== "process").map(({ i }) => i);
  try {
    const project = await db.portfolioProject.create({
      data: { userId, submissionId, slug: newSlug(), title: sub.assignment.title, visibility: "PRIVATE", shownFiles, showRationale: true, showEvaluation: false },
    });
    await db.auditEvent.create({ data: { actorId: userId, action: "project.created", subject: `project:${project.id}`, detail: { submissionId } } });
    return project;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new PortfolioError("already_exists");
    throw e;
  }
}

export async function listMyProjects(userId: string) {
  return db.portfolioProject.findMany({
    where: { userId }, orderBy: { createdAt: "desc" },
    include: { submission: { include: { assignment: true } }, _count: { select: { reviews: true } } },
  });
}

export async function getMyProject(userId: string, projectId: string) {
  const p = await db.portfolioProject.findFirst({
    where: { id: projectId, userId },
    include: { submission: { include: { assignment: true } }, user: { select: { displayName: true, portfolioHandle: true } } },
  });
  if (!p) throw new PortfolioError("not_found");
  return p;
}

/**
 * Owner-only. Publishing (LINK or PUBLIC) needs a display name, at least one image to show, and no moderator
 * hold. Visibility changes take effect on the very next request (nothing about access is cached).
 */
export async function updateProject(userId: string, projectId: string, input: ProjectPatch) {
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) throw new PortfolioError("invalid", parsed.error.issues[0]?.message ?? "Invalid input");
  const patch = parsed.data;

  const p = await db.portfolioProject.findFirst({ where: { id: projectId, userId }, include: { submission: true, user: true } });
  if (!p) throw new PortfolioError("not_found");
  const files = p.submission.files as unknown as StoredFile[];

  let shownFiles = patch.shownFiles ? [...new Set(patch.shownFiles)].sort((a, b) => a - b) : p.shownFiles;
  if (shownFiles.some((i) => i >= files.length)) throw new PortfolioError("invalid", "One of the chosen images does not exist.");

  const visibility: Visibility = patch.visibility ?? p.visibility;
  const publishing = visibility !== "PRIVATE";
  if (publishing && p.moderationHold) throw new PortfolioError("held", "This project is on hold and cannot be shared.");
  if (publishing && !p.user.displayName) throw new PortfolioError("display_name_required", "Choose a display name before you share work.");
  if (publishing && shownFiles.length === 0) throw new PortfolioError("nothing_to_show", "Choose at least one image to show.");

  // Text others will read must not carry contact details or links. Blocklist hits are refused for link sharing and shown to the
  // reviewer for Public (which a person approves anyway).
  const title = patch.title ?? p.title;
  const summary = patch.summary === undefined ? p.summary : patch.summary;
  const showRationale = patch.showRationale ?? p.showRationale;
  const showEvaluation = patch.showEvaluation ?? p.showEvaluation;
  if (publishing) {
    const screened = screenFields([{ label: "The title", text: title }, { label: "The summary", text: summary }, ...(showRationale ? [{ label: "The rationale", text: p.submission.rationale }] : [])]);
    if (screened.refuse) throw new PortfolioError("invalid", screened.refuse);
    if (visibility === "LINK" && screened.flags.length > 0) throw new PortfolioError("invalid", "Some of the text cannot be shared. Change it, or ask for a reviewer to look at a Public share instead.");
  }

  // Approval follows the content: anything a visitor would see that changed since a reviewer looked sends it back to pending.
  const contentChanged = title !== p.title || (summary ?? null) !== (p.summary ?? null) || showRationale !== p.showRationale
    || showEvaluation !== p.showEvaluation || shownFiles.join(",") !== p.shownFiles.join(",");
  let approval = p.publicApproval;
  if (visibility !== "PUBLIC") approval = "NONE";
  else if (p.visibility !== "PUBLIC" || approval === "NONE" || (contentChanged && approval !== "PENDING")) approval = "PENDING";

  let handle = p.user.portfolioHandle;
  if (visibility === "PUBLIC" && !handle) {
    for (let i = 0; i < 5 && !handle; i++) {
      const candidate = newHandle();
      try {
        await db.user.update({ where: { id: userId }, data: { portfolioHandle: candidate } });
        handle = candidate;
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      }
    }
  }

  const updated = await db.portfolioProject.update({
    where: { id: projectId },
    data: {
      title: patch.title, summary: patch.summary === undefined ? undefined : patch.summary || null,
      visibility, shownFiles, showRationale: patch.showRationale, showEvaluation: patch.showEvaluation,
      publicApproval: approval, ...(approval === "PENDING" && p.publicApproval !== "PENDING" ? { approvalNote: null, approvedBy: null, approvedAt: null } : {}),
      publishedAt: publishing ? p.publishedAt ?? new Date() : p.publishedAt,
    },
  });
  if (approval !== p.publicApproval) {
    await db.auditEvent.create({ data: { actorId: userId, action: "project.approval_reset", subject: `project:${projectId}`, detail: { from: p.publicApproval, to: approval } } });
  }
  if (visibility !== p.visibility) {
    await db.auditEvent.create({ data: { actorId: userId, action: "project.visibility", subject: `project:${projectId}`, detail: { from: p.visibility, to: visibility } } });
  }
  return updated;
}

/** Removes the project, its reviews and any reports about them. The submission and its files are untouched. */
export async function deleteProject(userId: string, projectId: string) {
  const p = await db.portfolioProject.findFirst({ where: { id: projectId, userId }, include: { reviews: { select: { id: true } } } });
  if (!p) throw new PortfolioError("not_found");
  await db.$transaction([
    db.report.deleteMany({ where: { OR: [{ targetType: "PROJECT", targetId: projectId }, { targetType: "REVIEW", targetId: { in: p.reviews.map((r) => r.id) } }] } }),
    db.peerReview.deleteMany({ where: { projectId } }),
    db.portfolioProject.delete({ where: { id: projectId } }),
    db.auditEvent.create({ data: { actorId: userId, action: "project.deleted", subject: `project:${projectId}`, detail: {} } }),
  ]);
}

/** Signed-in learners only. PUBLIC and not held. Never lists LINK projects. */
export async function listGallery(viewerId: string | null, page = 0) {
  if (!viewerId) throw new PortfolioError("sign_in_required");
  const rows = await db.portfolioProject.findMany({
    where: { visibility: "PUBLIC", publicApproval: "APPROVED", moderationHold: false },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    skip: Math.max(0, page) * GALLERY_PAGE_SIZE, take: GALLERY_PAGE_SIZE,
    include: { user: { select: { displayName: true } }, submission: { include: { assignment: { select: { title: true } } } } },
  });
  return rows.map((p) => {
    const files = p.submission.files as unknown as StoredFile[];
    const idx = p.shownFiles.find((i) => i < files.length);
    return { slug: p.slug, title: p.title, owner: p.user.displayName ?? "Learner", assignment: p.submission.assignment.title, cover: idx ?? null, coverLabel: idx !== undefined ? slotOf(files[idx]) : null, publishedAt: p.publishedAt };
  });
}
