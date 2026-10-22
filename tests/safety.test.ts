import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import { PortfolioError, createProject, listGallery, updateProject, type ProjectPatch } from "../src/lib/portfolio";
import { contentFingerprint, decideApproval, getApprovalDetail, listPendingApprovals } from "../src/lib/portfolio/moderation";
import { getSharedImage } from "../src/lib/portfolio/images";
import { createReview } from "../src/lib/portfolio/peer";
import { getHandlePage, getProjectView } from "../src/lib/portfolio/view";
import { screenFields, screenText } from "../src/lib/safety/screen";
import { cleanup, evaluatedSubmission, learnerWithName, makeUser, useTempStorage } from "./helpers";

beforeAll(async () => {
  await useTempStorage();
  process.env.CONTENT_PREVIEW = "true";
  await publishContent(db, loadContent());
});
afterAll(async () => { await cleanup(); await db.$disconnect(); });

const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return e instanceof PortfolioError ? e.code : String(e); } };
const mod = async (role: "REVIEWER" | "ADMIN" = "REVIEWER") => ({ id: await makeUser({ role, enroll: false }), role });
async function pending(name = "Public Hopeful") {
  const u = await learnerWithName(name);
  const s = await evaluatedSubmission(u);
  const p = await createProject(u, s.submissionId);
  await updateProject(u, p.id, { visibility: "PUBLIC" });
  return { u, id: p.id, slug: p.slug };
}
const row = (id: string) => db.portfolioProject.findUniqueOrThrow({ where: { id } });
const fp = async (id: string) => contentFingerprint(await db.portfolioProject.findUniqueOrThrow({ where: { id }, include: { submission: true } }));
const anonSees = async (slug: string) => !!(await getProjectView(null, slug));

describe("text screening", () => {
  it.each([
    ["email me at jo@example.com", "email"], ["jo (at) example (dot) com", "email"], ["see https://x.example/y", "web"], ["visit www.mysite.net", "web"],
    ["portfolio.io", "web"], ["call +1 (415) 555-0132", "phone"], ["07911 123456", "phone"],
  ])("refuses %s", (text, kind) => {
    const r = screenText(text);
    expect(r.refuse).toMatch(kind === "email" ? /email/ : kind === "web" ? /web address/ : /phone/);
  });
  it.each(["A poster 800x1200 for a 2026 event", "Contrast ratio of 4.5:1 and 21:1", "Version 1.2.3 of the layout", "I used the colours #112233 and #fff"])("allows ordinary design text: %s", (t) => {
    expect(screenText(t)).toEqual({ refuse: null, flags: [] });
  });
  it("flags blocklisted terms, including ones from the environment, without refusing", () => {
    process.env.CONTENT_BLOCKLIST = "badword";
    expect(screenText("this has a BadWord in it").flags).toEqual(["badword"]);
    expect(screenText("free crypto now").flags).toEqual(["free crypto"]);
    delete process.env.CONTENT_BLOCKLIST;
  });
  it("names the offending field", () => {
    expect(screenFields([{ label: "The title", text: "ok" }, { label: "The summary", text: "mail a@b.co" }]).refuse).toMatch(/The summary contains an email/);
  });
});

describe("sharing refuses contact details and links", () => {
  it("in the title, summary and a shown rationale, but not when the rationale is hidden", async () => {
    const u = await learnerWithName("Careful");
    const s = await evaluatedSubmission(u);
    const p = await createProject(u, s.submissionId);
    expect(await code(updateProject(u, p.id, { visibility: "LINK", title: "Call 415 555 0132 now" }))).toBe("invalid");
    expect(await code(updateProject(u, p.id, { visibility: "LINK", summary: "mail me@x.org" }))).toBe("invalid");
    await db.submission.update({ where: { id: s.submissionId }, data: { rationale: `${"I made the title large and dark. ".repeat(3)} Find me at https://me.example` } });
    expect(await code(updateProject(u, p.id, { visibility: "LINK" }))).toBe("invalid");
    expect(await code(updateProject(u, p.id, { visibility: "LINK", showRationale: false }))).toBe("ok");
    expect((await row(p.id)).visibility).toBe("LINK");
  });
  it("in peer feedback", async () => {
    const owner = await learnerWithName("Owner");
    const s = await evaluatedSubmission(owner);
    const p = await createProject(owner, s.submissionId);
    await updateProject(owner, p.id, { visibility: "LINK" });
    const rev = await learnerWithName("Reviewer", { enroll: false });
    const ok = "The hierarchy is clear and the title reads first at a glance.";
    expect(await code(createReview(rev, p.slug, { strengths: `${ok} Contact me at a@b.com`, improvements: ok }))).toBe("invalid");
    expect(await code(createReview(rev, p.slug, { strengths: ok, improvements: ok }))).toBe("ok");
  });
});

describe("pre-moderation of Public", () => {
  it("is invisible to everyone but the owner until approved: page, images, gallery, handle page", async () => {
    const { u, id, slug } = await pending();
    expect((await row(id)).publicApproval).toBe("PENDING");
    expect(await anonSees(slug)).toBe(false);
    expect(await getSharedImage(null, slug, 0)).toBeNull();
    const viewer = await makeUser({ enroll: false });
    expect((await listGallery(viewer)).some((c) => c.slug === slug)).toBe(false);
    const handle = (await db.user.findUniqueOrThrow({ where: { id: u } })).portfolioHandle!;
    expect(await getHandlePage(handle)).toBeNull();
    const own = await getProjectView({ id: u, role: "LEARNER" }, slug);
    expect(own?.approval?.status).toBe("PENDING");

    const m = await mod();
    expect((await listPendingApprovals(m)).some((p) => p.id === id)).toBe(true);
    const d = await getApprovalDetail(m, id);
    expect(d.imageScreening.status).toBe("unscreened");
    await decideApproval(m, id, "approve", "", d.fingerprint);
    expect(await anonSees(slug)).toBe(true);
    expect(await getSharedImage(null, slug, 0)).not.toBeNull();
    expect((await listGallery(viewer)).some((c) => c.slug === slug)).toBe(true);
    expect((await getHandlePage(handle))?.projects.length).toBe(1);
    expect(await db.auditEvent.count({ where: { actorId: m.id, action: "moderation.approved" } })).toBe(1);
  });

  it("goes back to pending, and disappears, when anything shown is changed afterwards", async () => {
    for (const change of [{ title: "A new title" }, { summary: "A summary" }, { showRationale: false }, { shownFiles: [1] }, { showEvaluation: true }] as ProjectPatch[]) {
      const { u, id, slug } = await pending();
      const m = await mod();
      await decideApproval(m, id, "approve", "", await fp(id));
      expect(await anonSees(slug)).toBe(true);
      await updateProject(u, id, change);
      expect((await row(id)).publicApproval).toBe("PENDING");
      expect(await anonSees(slug)).toBe(false);
    }
  });

  it("re-saving without changes keeps the approval; leaving Public and returning needs a new approval", async () => {
    const { u, id, slug } = await pending();
    await decideApproval(await mod(), id, "approve", "", await fp(id));
    await updateProject(u, id, { visibility: "PUBLIC" });
    expect((await row(id)).publicApproval).toBe("APPROVED");
    await updateProject(u, id, { visibility: "LINK" });
    expect((await row(id)).publicApproval).toBe("NONE");
    expect(await anonSees(slug)).toBe(true); // link sharing is unaffected
    await updateProject(u, id, { visibility: "PUBLIC" });
    expect((await row(id)).publicApproval).toBe("PENDING");
    expect(await anonSees(slug)).toBe(false);
  });

  it("a rejection needs a reason, is shown to the owner, and unchanged content stays rejected", async () => {
    const { u, id, slug } = await pending();
    const m = await mod();
    expect(await code(decideApproval(m, id, "reject", " ", await fp(id)))).toBe("invalid");
    await decideApproval(m, id, "reject", "The image is not suitable for a public gallery.", await fp(id));
    const own = await getProjectView({ id: u, role: "LEARNER" }, slug);
    expect(own?.approval).toEqual({ status: "REJECTED", note: "The image is not suitable for a public gallery." });
    await updateProject(u, id, { visibility: "PUBLIC" });
    expect((await row(id)).publicApproval).toBe("REJECTED");
    expect(await anonSees(slug)).toBe(false);
    await updateProject(u, id, { title: "Changed after rejection" });
    expect((await row(id)).publicApproval).toBe("PENDING");
  });

  it("refuses a decision on content the owner changed while the reviewer was looking", async () => {
    const { u, id } = await pending();
    const m = await mod();
    const seen = (await getApprovalDetail(m, id)).fingerprint;
    await updateProject(u, id, { title: "Swapped after the reviewer looked" });
    expect(await code(decideApproval(m, id, "approve", "", seen))).toBe("invalid");
    expect((await row(id)).publicApproval).toBe("PENDING");
  });

  it("only reviewers decide, never on their own work, and only one wins", async () => {
    const { id } = await pending();
    const learner = { id: await makeUser({ enroll: false }), role: "LEARNER" as const };
    expect(await code(decideApproval(learner, id, "approve", "", await fp(id)))).toBe("forbidden");
    expect(await code(getApprovalDetail(learner, id))).toBe("forbidden");

    const rev = await mod();
    const ownerSub = await evaluatedSubmission(rev.id);
    const own = await createProject(rev.id, ownerSub.submissionId);
    await db.user.update({ where: { id: rev.id }, data: { displayName: "Rev Owner" } });
    await updateProject(rev.id, own.id, { visibility: "PUBLIC" });
    expect(await code(decideApproval(rev, own.id, "approve", "", await fp(own.id)))).toBe("own_project");

    const f = await fp(id);
    const results = await Promise.all([mod(), mod(), mod()].map(async (m) => code(decideApproval(await m, id, "approve", "", f))));
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
  });

  it("a held project cannot be approved into view", async () => {
    const { id, slug } = await pending();
    await db.portfolioProject.update({ where: { id }, data: { moderationHold: true } });
    expect(await code(decideApproval(await mod(), id, "approve", "", await fp(id)))).toBe("invalid");
    expect(await anonSees(slug)).toBe(false);
  });

  it("shows the reviewer text flags", async () => {
    process.env.CONTENT_BLOCKLIST = "flagme";
    const u = await learnerWithName("Flagged");
    const s = await evaluatedSubmission(u);
    const p = await createProject(u, s.submissionId);
    await updateProject(u, p.id, { visibility: "PUBLIC", title: "flagme poster" });
    const d = await getApprovalDetail(await mod(), p.id);
    expect(d.textFlags).toContain('Title: "flagme"');
    delete process.env.CONTENT_BLOCKLIST;
  });
});
