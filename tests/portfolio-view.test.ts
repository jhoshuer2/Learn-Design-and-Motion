import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import { createProject, listGallery, updateProject } from "../src/lib/portfolio";
import { projectAccess } from "../src/lib/portfolio/access";
import { assessorLabel, isVerified } from "../src/lib/portfolio/evidence";
import { getSharedImage, serveableImage } from "../src/lib/portfolio/images";
import { getHandlePage, getProjectView } from "../src/lib/portfolio/view";
import { getStorage } from "../src/lib/storage";
import { createAppeal } from "../src/lib/review";
import { cleanup, evaluatedSubmission, learnerWithName, makeUser, useTempStorage } from "./helpers";

const anon = null;
const as = (id: string, role: "LEARNER" | "REVIEWER" | "ADMIN" = "LEARNER") => ({ id, role });

async function shared(visibility: "PRIVATE" | "LINK" | "PUBLIC", opts: { name?: string; marker?: string; evaluation?: boolean } = {}) {
  const u = await learnerWithName(opts.name ?? "Display Name");
  const s = await evaluatedSubmission(u, opts.marker ?? "[fake:score=90]");
  const p = await createProject(u, s.submissionId);
  await updateProject(u, p.id, { visibility, showEvaluation: opts.evaluation ?? false });
  return { u, s, p: await db.portfolioProject.findUniqueOrThrow({ where: { id: p.id } }) };
}

beforeAll(async () => {
  await useTempStorage();
  process.env.CONTENT_PREVIEW = "true";
  await publishContent(db, loadContent());
});
afterAll(async () => { await cleanup(); await db.$disconnect(); });

describe("who can see a project", () => {
  it("pure access rule", () => {
    const base = { userId: "o", visibility: "PRIVATE" as const, moderationHold: false };
    expect(projectAccess(null, base)).toBe("none");
    expect(projectAccess(as("o"), base)).toBe("owner");
    expect(projectAccess(as("x"), { ...base, visibility: "LINK" })).toBe("public");
    expect(projectAccess(null, { ...base, visibility: "PUBLIC" })).toBe("public");
    expect(projectAccess(null, { ...base, visibility: "PUBLIC", moderationHold: true })).toBe("none");
    expect(projectAccess(as("o"), { ...base, visibility: "PUBLIC", moderationHold: true })).toBe("owner");
    expect(projectAccess(as("m", "REVIEWER"), base)).toBe("none"); // moderators use their own screen
  });

  it("PRIVATE is invisible to everyone but the owner, and looks identical to a missing slug", async () => {
    const { u, p } = await shared("PRIVATE");
    const other = await makeUser({ enroll: false });
    expect(await getProjectView(anon, p.slug)).toBeNull();
    expect(await getProjectView(as(other), p.slug)).toBeNull();
    expect(await getProjectView(as(other, "ADMIN"), p.slug)).toBeNull();
    expect(await getProjectView(anon, "does-not-exist-123")).toBeNull();
    expect((await getProjectView(as(u), p.slug))?.isOwner).toBe(true);
  });

  it("LINK is readable by anyone with the link but is never listed and does not reveal the public handle", async () => {
    const { p } = await shared("LINK", { name: "Link Person" });
    const v = (await getProjectView(anon, p.slug))!;
    expect(v).toMatchObject({ visibility: "LINK", isOwner: false, owner: { displayName: "Link Person", handle: null } });
    expect((await listGallery(await makeUser({ enroll: false }))).map((c) => c.slug)).not.toContain(p.slug);
  });

  it("PUBLIC is readable by anyone, listed, and on the owner's public page; a hold removes it from all three", async () => {
    const { u, p } = await shared("PUBLIC", { name: "Public Person" });
    const handle = (await db.user.findUniqueOrThrow({ where: { id: u } })).portfolioHandle!;
    const v = (await getProjectView(anon, p.slug))!;
    expect(v.owner).toEqual({ displayName: "Public Person", handle });
    expect((await getHandlePage(handle))?.projects.map((x) => x.slug)).toEqual([p.slug]);
    expect((await listGallery(await makeUser({ enroll: false }))).map((c) => c.slug)).toContain(p.slug);

    await db.portfolioProject.update({ where: { id: p.id }, data: { moderationHold: true } });
    expect(await getProjectView(anon, p.slug)).toBeNull();
    expect(await getHandlePage(handle)).toBeNull();
    expect((await listGallery(await makeUser({ enroll: false }))).map((c) => c.slug)).not.toContain(p.slug);
    expect((await getProjectView(as(u), p.slug))?.held).toBe(true); // the owner still sees it, with the hold
  });

  it("LINK projects never appear on the handle page", async () => {
    const { u, p } = await shared("PUBLIC", { name: "Mixed Person" });
    const s2 = await evaluatedSubmission(u, "[fake:score=90]", 2);
    const p2 = await createProject(u, s2.submissionId);
    await updateProject(u, p2.id, { visibility: "LINK" });
    const handle = (await db.user.findUniqueOrThrow({ where: { id: u } })).portfolioHandle!;
    expect((await getHandlePage(handle))!.projects.map((x) => x.slug)).toEqual([p.slug]);
  });

  it("un-sharing revokes the page and the images on the very next request", async () => {
    const { u, p } = await shared("PUBLIC");
    expect(await getSharedImage(anon, p.slug, p.shownFiles[0])).not.toBeNull();
    await updateProject(u, p.id, { visibility: "PRIVATE" });
    expect(await getProjectView(anon, p.slug)).toBeNull();
    expect(await getSharedImage(anon, p.slug, p.shownFiles[0])).toBeNull();
    expect(await getSharedImage(as(u), p.slug, p.shownFiles[0])).not.toBeNull(); // the owner keeps access
  });

  it("an unknown handle is a 404", async () => {
    expect(await getHandlePage("u-nonexistent")).toBeNull();
  });
});

describe("the public read model is an allow-list", () => {
  it("never contains private identifiers, storage details, notes, appeals or raw output", async () => {
    const u = await learnerWithName("Careful Person");
    await db.user.update({ where: { id: u }, data: { name: "SECRET LEGAL NAME" } });
    const email = (await db.user.findUniqueOrThrow({ where: { id: u } })).email;
    const s = await evaluatedSubmission(u, "[fake:score=60]"); // failed, so an appeal is possible
    await db.submission.update({ where: { id: s.submissionId }, data: { changesNote: "PRIVATE-CHANGE-NOTE" } });
    const p = await createProject(u, s.submissionId);
    await updateProject(u, p.id, { visibility: "PUBLIC", showEvaluation: true });
    await createAppeal(u, s.evaluationId, "PRIVATE-APPEAL-REASON that is long enough to be accepted here.");

    const sub = await db.submission.findUniqueOrThrow({ where: { id: s.submissionId } });
    const files = sub.files as { key: string; sha256: string; name: string }[];
    const json = JSON.stringify(await getProjectView(anon, p.slug));
    const secrets = [email, "SECRET LEGAL NAME", u, s.submissionId, s.evaluationId, sub.userId, "PRIVATE-CHANGE-NOTE", "PRIVATE-APPEAL-REASON",
      "no image was inspected", "rawOutput", "passwordHash", ...files.flatMap((f) => [f.key, f.sha256, f.name])];
    for (const secret of secrets) expect(json, `leaked: ${secret}`).not.toContain(secret);
    expect(json).toContain("Careful Person"); // only the display name identifies the owner
  });

  it("hides the rationale when the owner chooses, and shows only chosen images", async () => {
    const { u, p } = await shared("PUBLIC");
    expect((await getProjectView(anon, p.slug))!.rationale).toMatch(/largest and darkest/);
    await updateProject(u, p.id, { showRationale: false, shownFiles: [1] });
    const v = (await getProjectView(anon, p.slug))!;
    expect(v.rationale).toBeNull();
    expect(v.images.map((i) => i.idx)).toEqual([1]);
    expect(await getSharedImage(anon, p.slug, 0)).toBeNull(); // not chosen, so not served
    expect(await getSharedImage(anon, p.slug, 1)).not.toBeNull();
  });
});

describe("assessment evidence on a project", () => {
  it("is absent unless the owner opts in", async () => {
    const { p } = await shared("PUBLIC");
    const v = (await getProjectView(anon, p.slug))!;
    expect(v.evidence).toBeNull();
    expect(v.skills).toEqual([]);
  });

  it("labels the test evaluator and never calls it verified", async () => {
    const { p } = await shared("PUBLIC", { evaluation: true });
    const e = (await getProjectView(anon, p.slug))!.evidence!;
    expect(e).toMatchObject({ testEvaluator: true, verified: false, passed: true, score: 90 });
    expect(e.assessedBy).toMatch(/TEST EVALUATOR/);
    expect(e.rubric).toEqual({ slug: "high-contrast-poster", version: 1 });
    expect(e.criteria).toHaveLength(6);
  });

  it("verifies only a passed result from a real assessor", async () => {
    const { p, s } = await shared("PUBLIC", { evaluation: true });
    const setProvider = (provider: string, passed: boolean) =>
      db.evaluation.update({ where: { id: s.evaluationId }, data: { provider, passed, model: provider === "claude" ? "claude-opus-5-5" : null } });
    await setProvider("claude", true);
    expect((await getProjectView(anon, p.slug))!.evidence).toMatchObject({ verified: true, testEvaluator: false });
    expect((await getProjectView(anon, p.slug))!.evidence!.assessedBy).toBe("AI assessor (claude-opus-5-5)");
    await setProvider("claude", false);
    expect((await getProjectView(anon, p.slug))!.evidence!.verified).toBe(false); // a failed result is shown but never verified
    await setProvider("human", true);
    expect((await getProjectView(anon, p.slug))!.evidence).toMatchObject({ verified: true });
  });

  it("shows skills only with the evidence behind them", async () => {
    const { p } = await shared("PUBLIC", { evaluation: true, marker: "[fake:score=90]" });
    expect((await getProjectView(anon, p.slug))!.skills.sort()).toEqual(["Accessible colour contrast", "Applying contrast to establish hierarchy", "Recognising contrast in real work"]);
    const weak = await shared("PUBLIC", { evaluation: true, marker: "[fake:score=60]" });
    expect((await getProjectView(anon, weak.p.slug))!.skills).toEqual([]);
  });

  it("verification rule and labels, in isolation", () => {
    expect(isVerified({ passed: true, provider: "claude" })).toBe(true);
    expect(isVerified({ passed: true, provider: "human" })).toBe(true);
    expect(isVerified({ passed: true, provider: "test-only-fake" })).toBe(false);
    expect(isVerified({ passed: true, provider: "deterministic-checks" })).toBe(false);
    expect(isVerified({ passed: false, provider: "claude" })).toBe(false);
    expect(isVerified({ passed: null, provider: "claude" })).toBe(false);
    expect(assessorLabel("human", null)).toBe("Human reviewer");
  });
});

describe("image serving", () => {
  const MARK = "PRIVATE-GPS-MARKER";
  const withExif = (w: number, h: number, orientation?: number) =>
    sharp({ create: { width: w, height: h, channels: 3, background: "#884422" } })
      .jpeg().withExif({ IFD0: { Copyright: MARK } }).withMetadata(orientation ? { orientation } : {}).toBuffer();

  it("strips EXIF and other metadata from what is served, and bakes in the orientation", async () => {
    const original = await withExif(40, 20, 6);
    expect(original.includes(Buffer.from(MARK))).toBe(true); // the fixture really carries the marker
    const served = await serveableImage(original, "image/jpeg");
    expect(served.data.includes(Buffer.from(MARK))).toBe(false);
    const meta = await sharp(served.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect([meta.width, meta.height]).toEqual([20, 40]); // rotated upright, not left sideways
  });

  it("serves a stored original without metadata, and never modifies the original", async () => {
    const { p, s } = await shared("PUBLIC");
    const buf = await withExif(60, 40);
    const key = await getStorage().put(buf);
    const sub = await db.submission.findUniqueOrThrow({ where: { id: s.submissionId } });
    const files = (sub.files as { key: string; mime: string }[]).map((f, i) => (i === 0 ? { ...f, key, mime: "image/jpeg" } : f));
    await db.submission.update({ where: { id: s.submissionId }, data: { files: files as never } });

    const out = (await getSharedImage(anon, p.slug, 0))!;
    expect(out.mime).toBe("image/jpeg");
    expect(out.data.includes(Buffer.from(MARK))).toBe(false);
    expect((await getStorage().get(key)).includes(Buffer.from(MARK))).toBe(true); // the private original is untouched
  });

  it("rejects bad indexes", async () => {
    const { p } = await shared("PUBLIC");
    for (const idx of [-1, 99, NaN, 1.5]) expect(await getSharedImage(anon, p.slug, idx), String(idx)).toBeNull();
  });
});

describe("peer review state on the page", () => {
  it("tells each viewer whether they can review, without revealing blocks", async () => {
    const { u, p } = await shared("PUBLIC");
    const named = await learnerWithName("Reviewer Named", { enroll: false });
    const unnamed = await makeUser({ enroll: false });
    const blocked = await learnerWithName("Blocked Person", { enroll: false });
    await db.reviewerBlock.create({ data: { ownerId: u, blockedId: blocked } });
    const reason = async (viewer: ReturnType<typeof as> | null) => (await getProjectView(viewer, p.slug))!.viewer.reviewBlockedReason;

    expect(await reason(anon)).toBe("sign_in");
    expect(await reason(as(u))).toBe("cannot_review");
    expect(await reason(as(unnamed))).toBe("display_name");
    expect(await reason(as(blocked))).toBe("cannot_review"); // same answer as the owner case: no hint that a block exists
    expect(await reason(as(named))).toBeNull();
    await db.peerReview.create({ data: { projectId: p.id, reviewerId: named, strengths: "s".repeat(25), improvements: "i".repeat(25) } });
    expect(await reason(as(named))).toBe("already_reviewed");
  });

  it("hides hidden reviews from the public but not from the owner", async () => {
    const { u, p } = await shared("PUBLIC");
    const r = await learnerWithName("Rev Two", { enroll: false });
    await db.peerReview.create({ data: { projectId: p.id, reviewerId: r, strengths: "s".repeat(25), improvements: "i".repeat(25), hidden: true } });
    expect((await getProjectView(anon, p.slug))!.reviews).toHaveLength(0);
    expect((await getProjectView(as(u), p.slug))!.reviews).toMatchObject([{ hidden: true, reviewer: "Rev Two" }]);
  });
});
