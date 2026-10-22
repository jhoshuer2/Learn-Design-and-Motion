import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import {
  GALLERY_PAGE_SIZE, PortfolioError, createProject, deleteProject, listEligibleSubmissions, listGallery, listMyProjects, updateProject,
} from "../src/lib/portfolio";
import { setDisplayName, validateDisplayName } from "../src/lib/portfolio/names";
import { cleanup, evaluatedSubmission, learnerWithName, makeSubmission, makeUser, useTempStorage } from "./helpers";

const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof PortfolioError ? e.code : `other:${e}`));

beforeAll(async () => {
  await useTempStorage();
  process.env.CONTENT_PREVIEW = "true";
  await publishContent(db, loadContent());
});
afterAll(async () => {
  await db.auditEvent.deleteMany({ where: { action: { startsWith: "project." }, actorId: null } });
  await cleanup();
  await db.$disconnect();
});

async function project(name = "Pat Poster") {
  const u = await learnerWithName(name);
  const s = await evaluatedSubmission(u);
  const p = await createProject(u, s.submissionId);
  return { u, s, p };
}

describe("display names", () => {
  it("accepts ordinary names and normalises whitespace", () => {
    expect(validateDisplayName("  Ada   Lovelace ")).toBe("Ada Lovelace");
    expect(validateDisplayName("Mx. Okafor-Smith")).toBe("Mx. Okafor-Smith");
  });
  it("refuses anything that could leak contact details, or cannot be shown", () => {
    for (const bad of ["a", "x".repeat(41), "me@example.com", "see https://x.example", "www.me.dev", "name.com", "<b>hi</b>", "bad\u0000name"]) {
      expect(() => validateDisplayName(bad), bad).toThrow(PortfolioError);
    }
  });
  it("is stored separately from the account name", async () => {
    const u = await makeUser({ enroll: false });
    await db.user.update({ where: { id: u }, data: { name: "Real Legal Name" } });
    await setDisplayName(u, "Pixel Pat");
    expect(await db.user.findUniqueOrThrow({ where: { id: u } })).toMatchObject({ name: "Real Legal Name", displayName: "Pixel Pat" });
  });
});

describe("creating a project", () => {
  it("is created private, from the owner's assessed work, with an unguessable slug", async () => {
    const { p } = await project();
    expect(p).toMatchObject({ visibility: "PRIVATE", showEvaluation: false, showRationale: true, moderationHold: false, publishedAt: null });
    expect(p.slug.length).toBeGreaterThanOrEqual(16);
    expect(p.shownFiles.length).toBeGreaterThan(0);
  });

  it("refuses unassessed work, someone else's work, and a duplicate", async () => {
    const u = await learnerWithName();
    const unassessed = await makeSubmission(u); // SUBMITTED, never evaluated
    expect(await code(createProject(u, unassessed.id))).toBe("not_evaluated");
    const other = await learnerWithName("Other Person");
    const theirs = await evaluatedSubmission(other);
    expect(await code(createProject(u, theirs.submissionId))).toBe("not_found");
    const mine = await evaluatedSubmission(u, "[fake:score=90]", 2);
    await createProject(u, mine.submissionId);
    expect(await code(createProject(u, mine.submissionId))).toBe("already_exists");
  });

  it("lists only eligible submissions", async () => {
    const u = await learnerWithName();
    const a = await evaluatedSubmission(u);
    await makeSubmission(u, { attempt: 2 }); // not evaluated
    expect((await listEligibleSubmissions(u)).map((s) => s.submissionId)).toEqual([a.submissionId]);
    await createProject(u, a.submissionId);
    expect(await listEligibleSubmissions(u)).toEqual([]);
    expect(await listMyProjects(u)).toHaveLength(1);
  });
});

describe("publishing rules", () => {
  it("needs a display name", async () => {
    const u = await makeUser();
    const s = await evaluatedSubmission(u);
    const p = await createProject(u, s.submissionId);
    expect(await code(updateProject(u, p.id, { visibility: "PUBLIC" }))).toBe("display_name_required");
    expect((await db.portfolioProject.findUniqueOrThrow({ where: { id: p.id } })).visibility).toBe("PRIVATE");
    await setDisplayName(u, "Now Named");
    expect(await code(updateProject(u, p.id, { visibility: "LINK" }))).toBe("ok");
  });

  it("needs at least one image to show, and only existing images", async () => {
    const { u, p } = await project();
    expect(await code(updateProject(u, p.id, { shownFiles: [], visibility: "LINK" }))).toBe("nothing_to_show");
    expect(await code(updateProject(u, p.id, { shownFiles: [7] }))).toBe("invalid");
    expect((await updateProject(u, p.id, { shownFiles: [1, 0, 1] })).shownFiles).toEqual([0, 1]); // deduped and sorted
  });

  it("is refused while a moderator hold is on", async () => {
    const { u, p } = await project();
    await db.portfolioProject.update({ where: { id: p.id }, data: { moderationHold: true } });
    expect(await code(updateProject(u, p.id, { visibility: "PUBLIC" }))).toBe("held");
    expect(await code(updateProject(u, p.id, { visibility: "PRIVATE", title: "Still editable privately" }))).toBe("ok");
  });

  it("only the owner can change a project, and field limits apply", async () => {
    const { u, p } = await project();
    const stranger = await learnerWithName("Stranger");
    expect(await code(updateProject(stranger, p.id, { title: "Hijacked" }))).toBe("not_found");
    expect(await code(updateProject(u, p.id, { title: "" }))).toBe("invalid");
    expect(await code(updateProject(u, p.id, { title: "x".repeat(101) }))).toBe("invalid");
    expect(await code(updateProject(u, p.id, { summary: "x".repeat(601) }))).toBe("invalid");
    expect(await code(updateProject(u, p.id, { visibility: "EVERYONE" as never }))).toBe("invalid");
  });

  it("sets publishedAt once, creates a public handle only for PUBLIC, and audits visibility changes", async () => {
    const { u, p } = await project();
    await updateProject(u, p.id, { visibility: "LINK" });
    expect((await db.user.findUniqueOrThrow({ where: { id: u } })).portfolioHandle).toBeNull();
    const first = (await db.portfolioProject.findUniqueOrThrow({ where: { id: p.id } })).publishedAt!;
    expect(first).toBeInstanceOf(Date);

    await updateProject(u, p.id, { visibility: "PUBLIC" });
    const handle = (await db.user.findUniqueOrThrow({ where: { id: u } })).portfolioHandle;
    expect(handle).toMatch(/^u-[a-z0-9]+$/);
    await updateProject(u, p.id, { visibility: "PRIVATE" });
    await updateProject(u, p.id, { visibility: "PUBLIC" });
    expect((await db.user.findUniqueOrThrow({ where: { id: u } })).portfolioHandle).toBe(handle); // stable
    expect((await db.portfolioProject.findUniqueOrThrow({ where: { id: p.id } })).publishedAt).toEqual(first);
    const audits = await db.auditEvent.findMany({ where: { subject: `project:${p.id}`, action: "project.visibility" }, orderBy: { createdAt: "asc" } });
    expect(audits.map((a) => (a.detail as { to: string }).to)).toEqual(["LINK", "PUBLIC", "PRIVATE", "PUBLIC"]);
  });
});

describe("deleting a project", () => {
  it("removes the project and its reviews but leaves the submission and its files", async () => {
    const { u, s, p } = await project();
    const reviewer = await learnerWithName("Reviewer One");
    await db.peerReview.create({ data: { projectId: p.id, reviewerId: reviewer, strengths: "x".repeat(25), improvements: "y".repeat(25) } });
    const stranger = await learnerWithName("Stranger");
    expect(await code(deleteProject(stranger, p.id))).toBe("not_found");
    await deleteProject(u, p.id);
    expect(await db.portfolioProject.count({ where: { id: p.id } })).toBe(0);
    expect(await db.peerReview.count({ where: { projectId: p.id } })).toBe(0);
    expect(await db.submission.count({ where: { id: s.submissionId } })).toBe(1);
  });
});

describe("gallery", () => {
  it("requires a signed-in viewer", async () => {
    expect(await code(listGallery(null))).toBe("sign_in_required");
  });

  it("lists PUBLIC work only: never PRIVATE, LINK or held, newest first, with display names", async () => {
    const mk = async (name: string, visibility: "PRIVATE" | "LINK" | "PUBLIC", hold = false) => {
      const { u, p } = await project(name);
      if (visibility !== "PRIVATE") await updateProject(u, p.id, { visibility });
      if (hold) await db.portfolioProject.update({ where: { id: p.id }, data: { moderationHold: true } });
      return p;
    };
    const pub1 = await mk("Gallery One", "PUBLIC");
    const priv = await mk("Gallery Priv", "PRIVATE");
    const link = await mk("Gallery Link", "LINK");
    const held = await mk("Gallery Held", "PUBLIC", true);
    const pub2 = await mk("Gallery Two", "PUBLIC");
    const viewer = await makeUser({ enroll: false });
    const slugs = (await listGallery(viewer)).map((c) => c.slug);
    expect(slugs).toEqual(expect.arrayContaining([pub1.slug, pub2.slug]));
    for (const hidden of [priv, link, held]) expect(slugs).not.toContain(hidden.slug);
    expect(slugs.indexOf(pub2.slug)).toBeLessThan(slugs.indexOf(pub1.slug));
    const card = (await listGallery(viewer)).find((c) => c.slug === pub1.slug)!;
    expect(card.owner).toBe("Gallery One");
    expect(JSON.stringify(card)).not.toMatch(/@test\.local|userId|key/);
    expect(slugs.length).toBeLessThanOrEqual(GALLERY_PAGE_SIZE);
  });
});
