import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import { PortfolioError, createProject, updateProject } from "../src/lib/portfolio";
import {
  MAX_REVIEWS_PER_HOUR, blockReviewer, blockReviewerOfReview, cleanText, createReview, deleteReview, listBlocked, reportProject, reportReview,
  setReviewHidden, unblockReviewer, withdrawReview,
} from "../src/lib/portfolio/peer";
import { getHandlePage, getProjectView } from "../src/lib/portfolio/view";
import { listOpenReports, releaseHold, resolveReport } from "../src/lib/portfolio/moderation";
import { cleanup, evaluatedSubmission, learnerWithName, makeUser, useTempStorage } from "./helpers";

const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof PortfolioError ? e.code : `other:${e}`));
const S = "The event name reads first because it is the largest, darkest element on the page.";
const I = "The date and venue text is close to the background tone. Try darkening it a step.";
const REASON = "This review contains personal abuse about the learner.";
const NOTE = "Reviewed and confirmed.";
const anon = null;
const as = (id: string) => ({ id, role: "LEARNER" as const });

async function project(visibility: "PRIVATE" | "LINK" | "PUBLIC" = "PUBLIC", name = "Owner Person") {
  const u = await learnerWithName(name);
  const s = await evaluatedSubmission(u);
  const p = await createProject(u, s.submissionId);
  if (visibility !== "PRIVATE") await updateProject(u, p.id, { visibility });
  return { u, p: await db.portfolioProject.findUniqueOrThrow({ where: { id: p.id } }) };
}
const reviewer = (n = "Rev") => learnerWithName(n, { enroll: false });
const mod = async (role: "REVIEWER" | "ADMIN" = "REVIEWER") => ({ id: await makeUser({ role, enroll: false }), role });

beforeAll(async () => {
  await useTempStorage();
  process.env.CONTENT_PREVIEW = "true";
  await publishContent(db, loadContent());
});
afterAll(async () => { await cleanup(); await db.$disconnect(); });

describe("leaving a review", () => {
  it("works on LINK and PUBLIC projects, as plain structured text", async () => {
    for (const v of ["LINK", "PUBLIC"] as const) {
      const { p } = await project(v);
      const r = await reviewer();
      const rev = await createReview(r, p.slug, { strengths: S, improvements: I, question: "Did you test the banner at small size?" });
      expect(rev).toMatchObject({ strengths: S, improvements: I, questions: "Did you test the banner at small size?", hidden: false });
      expect((await getProjectView(anon, p.slug))!.reviews).toMatchObject([{ reviewer: "Rev", strengths: S }]);
    }
  });

  it("keeps markup as inert text and removes control characters", async () => {
    const { p } = await project();
    const r = await reviewer();
    const rev = await createReview(r, p.slug, { strengths: `<script>alert(1)</script> ${S}\u0000\u0007`, improvements: I });
    expect(rev.strengths).toBe(`<script>alert(1)</script> ${S}`); // stored as text; the page escapes it
    expect(cleanText("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  it("treats private, held and unknown projects identically", async () => {
    const r = await reviewer();
    const priv = (await project("PRIVATE")).p;
    const held = (await project("PUBLIC")).p;
    await db.portfolioProject.update({ where: { id: held.id }, data: { moderationHold: true } });
    for (const slug of [priv.slug, held.slug, "no-such-project-slug"]) {
      expect(await code(createReview(r, slug, { strengths: S, improvements: I })), slug).toBe("not_visible");
    }
  });

  it("refuses the owner, someone without a display name, and a duplicate", async () => {
    const { u, p } = await project();
    expect(await code(createReview(u, p.slug, { strengths: S, improvements: I }))).toBe("own_project");
    const unnamed = await makeUser({ enroll: false });
    expect(await code(createReview(unnamed, p.slug, { strengths: S, improvements: I }))).toBe("display_name_required");
    const r = await reviewer();
    await createReview(r, p.slug, { strengths: S, improvements: I });
    expect(await code(createReview(r, p.slug, { strengths: S, improvements: I }))).toBe("duplicate_review");
  });

  it("allows exactly one review under a double click", async () => {
    const { p } = await project();
    const r = await reviewer();
    const out = await Promise.all([code(createReview(r, p.slug, { strengths: S, improvements: I })), code(createReview(r, p.slug, { strengths: S, improvements: I }))]);
    expect(out.filter((x) => x === "ok")).toHaveLength(1);
    expect(await db.peerReview.count({ where: { projectId: p.id } })).toBe(1);
  });

  it("enforces length limits", async () => {
    const { p } = await project();
    const r = await reviewer();
    expect(await code(createReview(r, p.slug, { strengths: "too short", improvements: I }))).toBe("invalid");
    expect(await code(createReview(r, p.slug, { strengths: S, improvements: "x".repeat(1501) }))).toBe("invalid");
    expect(await code(createReview(r, p.slug, { strengths: S, improvements: I, question: "q".repeat(501) }))).toBe("invalid");
    expect(await db.peerReview.count({ where: { projectId: p.id } })).toBe(0);
  });

  it("is rate limited per reviewer per hour", async () => {
    const { p } = await project();
    const r = await reviewer();
    await db.auditEvent.createMany({ data: Array.from({ length: MAX_REVIEWS_PER_HOUR }, () => ({ actorId: r, action: "review.created", subject: "x", detail: {} })) });
    expect(await code(createReview(r, p.slug, { strengths: S, improvements: I }))).toBe("rate_limited");
  });

  it("lets a reviewer withdraw their own review, and no one else's", async () => {
    const { p } = await project();
    const r = await reviewer();
    const other = await reviewer("Other");
    const rev = await createReview(r, p.slug, { strengths: S, improvements: I });
    expect(await code(withdrawReview(other, rev.id))).toBe("not_found");
    await withdrawReview(r, rev.id);
    expect(await db.peerReview.count({ where: { id: rev.id } })).toBe(0);
  });
});

describe("owner controls", () => {
  it("hides and restores a review; the owner still sees it hidden, the public does not", async () => {
    const { u, p } = await project();
    const r = await reviewer();
    const rev = await createReview(r, p.slug, { strengths: S, improvements: I });
    await setReviewHidden(u, rev.id, true);
    expect((await getProjectView(anon, p.slug))!.reviews).toHaveLength(0);
    expect((await getProjectView(as(u), p.slug))!.reviews).toMatchObject([{ hidden: true }]);
    await setReviewHidden(u, rev.id, false);
    expect((await getProjectView(anon, p.slug))!.reviews).toHaveLength(1);
  });

  it("only the project owner can hide or delete reviews on it", async () => {
    const { p } = await project();
    const r = await reviewer();
    const rev = await createReview(r, p.slug, { strengths: S, improvements: I });
    const stranger = await learnerWithName("Stranger");
    expect(await code(setReviewHidden(stranger, rev.id, true))).toBe("not_found");
    expect(await code(deleteReview(stranger, rev.id))).toBe("not_found");
    expect(await code(deleteReview(r, rev.id))).toBe("not_found"); // not even the reviewer, who can withdraw instead
  });

  it("blocking hides the person's existing reviews and stops new ones; unblocking allows them again", async () => {
    const a = await project();
    const b = await project("PUBLIC", "Second Owner");
    const r = await reviewer("Pest");
    const mine = await createReview(r, a.p.slug, { strengths: S, improvements: I });
    const elsewhere = await createReview(r, b.p.slug, { strengths: S, improvements: I });
    await blockReviewer(a.u, r);
    expect((await db.peerReview.findUniqueOrThrow({ where: { id: mine.id } })).hidden).toBe(true);
    expect((await db.peerReview.findUniqueOrThrow({ where: { id: elsewhere.id } })).hidden).toBe(false); // other owners are unaffected
    expect((await listBlocked(a.u)).map((x) => x.name)).toEqual(["Pest"]);
    await db.peerReview.delete({ where: { id: mine.id } }); // so the later 'unblocked' review is not a duplicate
    expect(await code(createReview(r, a.p.slug, { strengths: S, improvements: I }))).toBe("blocked");
    await unblockReviewer(a.u, r);
    expect(await code(createReview(r, a.p.slug, { strengths: S, improvements: I }))).toBe("ok");
    expect(await code(blockReviewer(a.u, a.u))).toBe("invalid");
  });

  it("blocks the author of a review without the owner ever handling the reviewer's id", async () => {
    const { u, p } = await project();
    const r = await reviewer("Author X");
    const rev = await createReview(r, p.slug, { strengths: S, improvements: I });
    const stranger = await learnerWithName("Stranger Z");
    expect(await code(blockReviewerOfReview(stranger, rev.id))).toBe("not_found");
    await blockReviewerOfReview(u, rev.id);
    expect(await code(createReview(r, p.slug, { strengths: S, improvements: I }))).toBe("blocked");
    expect((await listBlocked(u)).map((x) => x.name)).toEqual(["Author X"]);
    const view = JSON.stringify(await getProjectView(as(u), p.slug));
    expect(view).not.toContain(r); // the reviewer's id is not in what the owner's page receives
  });

  it("deleting a review removes it and its reports", async () => {
    const { u, p } = await project();
    const r = await reviewer();
    const rev = await createReview(r, p.slug, { strengths: S, improvements: I });
    await reportReview(await reviewer("Reporter"), rev.id, REASON);
    await deleteReview(u, rev.id);
    expect(await db.peerReview.count({ where: { id: rev.id } })).toBe(0);
    expect(await db.report.count({ where: { targetId: rev.id } })).toBe(0);
  });
});

describe("reports", () => {
  it("any signed-in user can report a visible project once, with a real reason", async () => {
    const { p } = await project();
    const r = await reviewer();
    expect(await code(reportProject(r, p.slug, "bad"))).toBe("invalid");
    expect(await code(reportProject(r, p.slug, REASON))).toBe("ok");
    expect(await code(reportProject(r, p.slug, REASON))).toBe("already_reported");
  });

  it("cannot report a private project, your own project, a hidden review or your own review", async () => {
    const priv = (await project("PRIVATE")).p;
    const { u, p } = await project();
    const r = await reviewer();
    expect(await code(reportProject(r, priv.slug, REASON))).toBe("not_visible");
    expect(await code(reportProject(u, p.slug, REASON))).toBe("not_visible");
    const rev = await createReview(r, p.slug, { strengths: S, improvements: I });
    expect(await code(reportReview(r, rev.id, REASON))).toBe("forbidden");
    await setReviewHidden(u, rev.id, true);
    expect(await code(reportReview(await reviewer("Third"), rev.id, REASON))).toBe("not_visible");
  });

  it("is rate limited", async () => {
    const { p } = await project();
    const r = await reviewer();
    await db.auditEvent.createMany({ data: Array.from({ length: 10 }, () => ({ actorId: r, action: "report.created", subject: "x", detail: {} })) });
    expect(await code(reportProject(r, p.slug, REASON))).toBe("rate_limited");
  });
});

describe("moderation", () => {
  async function reported(kind: "PROJECT" | "REVIEW") {
    const { u, p } = await project();
    const r = await reviewer("Author");
    const rev = await createReview(r, p.slug, { strengths: S, improvements: I });
    const reporter = await reviewer("Reporter");
    const report = kind === "PROJECT" ? await reportProject(reporter, p.slug, REASON) : await reportReview(reporter, rev.id, REASON);
    return { u, p, rev, report, reporter };
  }

  it("is closed to learners", async () => {
    const { report } = await reported("PROJECT");
    const learner = { id: await makeUser({ enroll: false }), role: "LEARNER" as const };
    await expect(listOpenReports(learner)).rejects.toMatchObject({ code: "forbidden" });
    expect(await code(resolveReport(learner, report.id, "dismiss", NOTE))).toBe("forbidden");
    expect(await code(releaseHold(learner, report.targetId))).toBe("forbidden");
  });

  it("holds a project: forced private, gone from page, gallery and handle page, and the owner cannot re-share it", async () => {
    const { u, p, report } = await reported("PROJECT");
    const dup = await reportProject(await reviewer("Second Reporter"), p.slug, REASON);
    const handle = (await db.user.findUniqueOrThrow({ where: { id: u } })).portfolioHandle!;
    await resolveReport(await mod(), report.id, "hold_project", NOTE);

    expect(await db.portfolioProject.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ moderationHold: true, visibility: "PRIVATE" });
    expect(await getProjectView(anon, p.slug)).toBeNull();
    expect(await getHandlePage(handle)).toBeNull();
    expect(await code(updateProject(u, p.id, { visibility: "PUBLIC" }))).toBe("held");
    expect((await db.report.findUniqueOrThrow({ where: { id: dup.id } })).status).toBe("ACTIONED"); // sibling reports closed too

    await releaseHold(await mod("ADMIN"), p.id);
    expect(await code(updateProject(u, p.id, { visibility: "PUBLIC" }))).toBe("ok"); // the owner must choose to share again
  });

  it("hides a reported review", async () => {
    const { p, rev, report } = await reported("REVIEW");
    await resolveReport(await mod(), report.id, "hide_review", NOTE);
    expect((await db.peerReview.findUniqueOrThrow({ where: { id: rev.id } })).hidden).toBe(true);
    expect((await getProjectView(anon, p.slug))!.reviews).toHaveLength(0);
    expect(await code(resolveReport(await mod(), report.id, "dismiss", NOTE))).toBe("invalid"); // already handled
  });

  it("dismisses a report without changing anything", async () => {
    const { p, report } = await reported("PROJECT");
    await resolveReport(await mod(), report.id, "dismiss", NOTE);
    expect((await db.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe("DISMISSED");
    expect((await getProjectView(anon, p.slug))).not.toBeNull();
  });

  it("only one of two simultaneous moderators can resolve a report", async () => {
    const { report } = await reported("PROJECT");
    const out = await Promise.all([code(resolveReport(await mod(), report.id, "hold_project", NOTE)), code(resolveReport(await mod(), report.id, "dismiss", NOTE))]);
    expect(out.filter((x) => x === "ok")).toHaveLength(1);
  });

  it("refuses hide_review on a project report, a missing reason, and moderating your own work", async () => {
    const { u, report } = await reported("PROJECT");
    expect(await code(resolveReport(await mod(), report.id, "hide_review", NOTE))).toBe("invalid");
    expect(await code(resolveReport(await mod(), report.id, "dismiss", "no"))).toBe("invalid");
    await db.user.update({ where: { id: u }, data: { role: "REVIEWER" } });
    expect(await code(resolveReport({ id: u, role: "REVIEWER" }, report.id, "dismiss", NOTE))).toBe("own_project");
  });

  it("audits every decision", async () => {
    const { report } = await reported("PROJECT");
    const m = await mod();
    await resolveReport(m, report.id, "dismiss", NOTE);
    expect(await db.auditEvent.count({ where: { actorId: m.id, action: "moderation.resolved", subject: `report:${report.id}` } })).toBe(1);
  });
});

describe("peer feedback never affects progression", () => {
  const tables = async () => ({
    progress: await db.progress.count(), evidence: await db.skillEvidence.count(), evaluations: await db.evaluation.count(),
    scores: await db.criterionScore.count(), completions: await db.levelCompletion.count(), remediation: await db.remediation.count(),
    attempts: await db.quizAttempt.count(), appeals: await db.appeal.count(), submissions: await db.submission.count(),
  });

  it("creating, hiding, blocking, reporting and moderating change no progression or assessment row", async () => {
    const { u, p } = await project();
    const r = await reviewer();
    const before = await tables();
    const rev = await createReview(r, p.slug, { strengths: S, improvements: I });
    const rep = await reportReview(await reviewer("Rp"), rev.id, REASON);
    await setReviewHidden(u, rev.id, true);
    await blockReviewer(u, r);
    await resolveReport(await mod(), rep.id, "hide_review", NOTE);
    await withdrawReview(r, rev.id);
    expect(await tables()).toEqual(before);
  });

  it("the peer and moderation modules cannot reach progression or assessment code or tables", () => {
    for (const f of ["src/lib/portfolio/peer.ts", "src/lib/portfolio/moderation.ts"]) {
      const src = fs.readFileSync(f, "utf8");
      // The only permitted import from these areas is the pure StoredFile type (no database access).
      expect(src, f).not.toMatch(/from "@\/lib\/(progression|assessment|review)/);
      expect(src, f).not.toMatch(/from "@\/lib\/submissions(?!\/access")/);
      expect(src, f).not.toMatch(/\b(db|tx)\.(progress|skillEvidence|evaluation|criterionScore|levelCompletion|remediation|quizAttempt|appeal|submission|competency|enrollment)\b/);
    }
  });
});
