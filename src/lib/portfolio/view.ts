import type { Visibility } from "@prisma/client";
import { db } from "@/lib/db";
import { slotOf, type StoredFile } from "@/lib/submissions/access";
import { projectAccess, type Viewer } from "./access";
import { assessorLabel, isTestEvaluator, isVerified } from "./evidence";

/**
 * The public read model is an ALLOW-LIST built field by field. Nothing is spread from a database row, so a
 * new column can never leak by accident. It contains no email, account name, user id, storage key, hash,
 * file name, change note, appeal, raw model output or reviewer note.
 */
export type ProjectView = {
  slug: string; title: string; summary: string | null; visibility: Visibility;
  isOwner: boolean; held: boolean; publishedAt: Date | null;
  owner: { displayName: string; handle: string | null };
  assignment: { title: string; kind: string };
  images: { idx: number; label: string; width: number; height: number }[];
  rationale: string | null;
  evidence: null | {
    score: number | null; passed: boolean | null; threshold: number; verified: boolean; testEvaluator: boolean;
    assessedBy: string; humanReviewed: boolean; rubric: { slug: string; version: number }; date: Date;
    criteria: { title: string; score: number; weight: number; mandatory: boolean }[];
    strengths: string[]; weaknesses: string[];
  };
  skills: string[];
  reviews: { id: string; reviewer: string; strengths: string; improvements: string; question: string | null; createdAt: Date; hidden: boolean; mine: boolean }[];
  reviewRubric: { title: string }[];
  viewer: { signedIn: boolean; canReview: boolean; reviewBlockedReason: null | "sign_in" | "display_name" | "already_reviewed" | "cannot_review" };
};

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
export const labelFor = (brief: unknown, slot: string) =>
  (brief as { deliverables?: { key: string; label: string }[] }).deliverables?.find((d) => d.key === slot)?.label ?? "Image";


type RubricForEvidence = {
  threshold: number; version: number; rubric: { slug: string };
  criteria: { id: string; title: string; weight: number; mandatory: boolean; competency: { title: string } | null }[];
};
type EvaluationForEvidence = {
  overallScore: number | null; passed: boolean | null; provider: string; model: string | null; humanReviewed: boolean;
  createdAt: Date; feedback: unknown; scores: { criterionId: string; score: number }[];
};

/** Builds the allow-listed evidence block. Shared by the public page and the owner's preview. */
function buildEvidence(rv: RubricForEvidence, ev: EvaluationForEvidence) {
  const fb = (ev.feedback ?? {}) as Record<string, unknown>;
  const scoreOf = (criterionId: string) => ev.scores.find((s) => s.criterionId === criterionId)?.score ?? 0;
  const evidence: NonNullable<ProjectView["evidence"]> = {
    score: ev.overallScore, passed: ev.passed, threshold: rv.threshold, verified: isVerified(ev), testEvaluator: isTestEvaluator(ev.provider),
    assessedBy: assessorLabel(ev.provider, ev.model), humanReviewed: ev.humanReviewed, rubric: { slug: rv.rubric.slug, version: rv.version }, date: ev.createdAt,
    criteria: rv.criteria.map((c) => ({ title: c.title, score: scoreOf(c.id), weight: c.weight, mandatory: c.mandatory })),
    strengths: arr(fb.strengths), weaknesses: arr(fb.weaknesses),
  };
  // Skills are shown only alongside the evidence they rest on: criteria scored 80 or more.
  const skills = [...new Set(rv.criteria.filter((c) => c.competency && scoreOf(c.id) >= 80).map((c) => c.competency!.title))];
  return { evidence, skills };
}

/** Owner only: what the evidence section would show if switched on, whatever the current setting. */
export async function getEvidencePreview(userId: string, projectId: string) {
  const p = await db.portfolioProject.findFirst({
    where: { id: projectId, userId },
    include: { submission: { include: {
      assignment: { include: { rubricVersion: { include: { rubric: true, criteria: { include: { competency: true } } } } } },
      evaluations: { where: { status: "complete" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, include: { scores: true } },
    } } },
  });
  const ev = p?.submission.evaluations[0];
  return p && ev ? buildEvidence(p.submission.assignment.rubricVersion, ev) : null;
}

/** Null for missing, private and held projects alike: the three cases must be indistinguishable. */
export async function getProjectView(viewer: Viewer, slug: string): Promise<ProjectView | null> {
  const p = await db.portfolioProject.findUnique({
    where: { slug },
    include: {
      user: { select: { displayName: true, portfolioHandle: true } },
      submission: {
        include: {
          assignment: { include: { rubricVersion: { include: { rubric: true, criteria: { include: { competency: true } } } } } },
          evaluations: { where: { status: "complete" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, include: { scores: true } },
        },
      },
      reviews: { orderBy: { createdAt: "desc" }, include: { reviewer: { select: { displayName: true } } } },
    },
  });
  if (!p) return null;
  const access = projectAccess(viewer, p);
  if (access === "none") return null;
  const isOwner = access === "owner";

  const sub = p.submission;
  const files = sub.files as unknown as StoredFile[];
  const images = p.shownFiles.filter((i) => i < files.length).map((i) => ({
    idx: i, label: labelFor(sub.assignment.brief, slotOf(files[i])), width: files[i].width, height: files[i].height,
  }));

  const ev = sub.evaluations[0];
  const built = p.showEvaluation && ev ? buildEvidence(sub.assignment.rubricVersion, ev) : null;
  const evidence = built?.evidence ?? null;
  const skills = built?.skills ?? [];

  const reviewsVisible = p.reviews.filter((r) => isOwner || !r.hidden);
  const blocked = viewer ? !!(await db.reviewerBlock.findUnique({ where: { ownerId_blockedId: { ownerId: p.userId, blockedId: viewer.id } } })) : false;
  const me = viewer ? await db.user.findUnique({ where: { id: viewer.id }, select: { displayName: true } }) : null;
  const already = viewer ? p.reviews.some((r) => r.reviewerId === viewer.id) : false;
  const reason: ProjectView["viewer"]["reviewBlockedReason"] =
    !viewer ? "sign_in" : isOwner || blocked ? "cannot_review" : !me?.displayName ? "display_name" : already ? "already_reviewed" : null;

  return {
    slug: p.slug, title: p.title, summary: p.summary, visibility: p.visibility, isOwner, held: isOwner ? p.moderationHold : false, publishedAt: p.publishedAt,
    owner: { displayName: p.user.displayName ?? "Learner", handle: p.visibility === "PUBLIC" ? p.user.portfolioHandle : null },
    assignment: { title: sub.assignment.title, kind: sub.assignment.kind },
    images, rationale: p.showRationale ? sub.rationale : null, evidence, skills,
    reviews: reviewsVisible.map((r) => ({
      id: r.id, reviewer: r.reviewer.displayName ?? "Learner", strengths: r.strengths, improvements: r.improvements,
      question: r.questions, createdAt: r.createdAt, hidden: r.hidden, mine: !!viewer && r.reviewerId === viewer.id,
    })),
    reviewRubric: sub.assignment.rubricVersion.criteria.map((c) => ({ title: c.title })),
    viewer: { signedIn: !!viewer, canReview: reason === null, reviewBlockedReason: reason },
  };
}

export type HandlePage = { displayName: string; projects: { slug: string; title: string; assignment: string; cover: number | null; publishedAt: Date | null }[] };

/** A learner's public page: PUBLIC, un-held projects only. LINK projects are never listed here. */
export async function getHandlePage(handle: string): Promise<HandlePage | null> {
  const u = await db.user.findUnique({ where: { portfolioHandle: handle }, select: { id: true, displayName: true } });
  if (!u) return null;
  const rows = await db.portfolioProject.findMany({
    where: { userId: u.id, visibility: "PUBLIC", moderationHold: false }, orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    include: { submission: { include: { assignment: { select: { title: true } } } } },
  });
  if (rows.length === 0) return null;
  return {
    displayName: u.displayName ?? "Learner",
    projects: rows.map((p) => ({
      slug: p.slug, title: p.title, assignment: p.submission.assignment.title,
      cover: p.shownFiles.find((i) => i < (p.submission.files as unknown as StoredFile[]).length) ?? null, publishedAt: p.publishedAt,
    })),
  };
}
