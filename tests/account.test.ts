import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import { AccountError, DELETE_PHRASE, deleteAccount } from "../src/lib/account/delete";
import { createProject, updateProject } from "../src/lib/portfolio";
import { createReview, reportProject } from "../src/lib/portfolio/peer";
import { decideApproval, contentFingerprint } from "../src/lib/portfolio/moderation";
import { getSharedImage } from "../src/lib/portfolio/images";
import { getHandlePage, getProjectView } from "../src/lib/portfolio/view";
import { createAppeal } from "../src/lib/review";
import { getStorage } from "../src/lib/storage";
import type { StoredFile } from "../src/lib/submissions/access";
import { cleanup, created, evaluatedSubmission, learnerWithName, makeUser, useTempStorage } from "./helpers";

const PW = "correct-horse-battery";
beforeAll(async () => {
  await useTempStorage();
  process.env.CONTENT_PREVIEW = "true";
  await publishContent(db, loadContent());
});
afterAll(async () => { await cleanup(); await db.$disconnect(); });

const withPassword = async (id: string) => { await db.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(PW, 4) } }); return id; };
const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return e instanceof AccountError ? e.code : String(e); } };
const ok = "The hierarchy is clear and the title reads first at a glance.";

describe("deleteAccount", () => {
  it("refuses a wrong password, a missing confirmation, and an account with no password; nothing is deleted", async () => {
    const u = await withPassword(await learnerWithName("Careful"));
    expect(await code(deleteAccount(u, { password: "nope", confirm: DELETE_PHRASE }))).toBe("wrong_password");
    expect(await code(deleteAccount(u, { password: PW, confirm: "yes" }))).toBe("confirm_required");
    const nopw = await makeUser();
    expect(await code(deleteAccount(nopw, { password: PW, confirm: DELETE_PHRASE }))).toBe("no_password");
    expect(await code(deleteAccount("missing", { password: PW, confirm: DELETE_PHRASE }))).toBe("not_found");
    expect(await db.user.count({ where: { id: { in: [u, nopw] } } })).toBe(2);
  });

  it("removes the account, its work, shared pages and images, and files; leaves other people's data and de-identifies the log", async () => {
    const u = await withPassword(await learnerWithName("Leaving Learner"));
    const s = await evaluatedSubmission(u, "[fake:score=60]");
    const p = await createProject(u, s.submissionId);
    await updateProject(u, p.id, { visibility: "PUBLIC" });
    const mod = { id: await makeUser({ role: "REVIEWER", enroll: false }), role: "REVIEWER" as const };
    const full = await db.portfolioProject.findUniqueOrThrow({ where: { id: p.id }, include: { submission: true } });
    await decideApproval(mod, p.id, "approve", "", contentFingerprint(full));
    const handle = (await db.user.findUniqueOrThrow({ where: { id: u } })).portfolioHandle!;
    expect(await getSharedImage(null, p.slug, 0)).not.toBeNull();

    // Interactions with others.
    const friend = await learnerWithName("Friend");
    await createReview(friend, p.slug, { strengths: ok, improvements: ok });                // received
    const fs = await evaluatedSubmission(friend);
    const fp = await createProject(friend, fs.submissionId);
    await updateProject(friend, fp.id, { visibility: "LINK" });
    await createReview(u, fp.slug, { strengths: ok, improvements: ok });                    // written
    await reportProject(u, fp.slug, "Reporting this for a test of deletion.");              // filed
    await createAppeal(u, s.evaluationId, "I think the contrast was judged too harshly here, please look again.");
    await db.reviewerBlock.create({ data: { ownerId: friend, blockedId: u } });
    await db.notification.create({ data: { userId: u, kind: "x", text: "hello" } });
    await db.appeal.updateMany({ where: { userId: u }, data: { reviewerId: mod.id } });
    const files = (await db.submission.findUniqueOrThrow({ where: { id: s.submissionId } })).files as unknown as StoredFile[];
    expect(await getStorage().get(files[0].key)).toBeInstanceOf(Buffer);
    await db.auditEvent.create({ data: { actorId: u, action: "test.action", subject: "x", detail: {} } });

    const out = await deleteAccount(u, { password: PW, confirm: ` ${DELETE_PHRASE.toUpperCase()} ` });
    expect(out).toMatchObject({ submissions: 1, projects: 1, filesRemoved: 2, filesFailed: 0 });

    // Gone: account, shared page, image, handle page, files.
    expect(await db.user.findUnique({ where: { id: u } })).toBeNull();
    expect(await getProjectView(null, p.slug)).toBeNull();
    expect(await getSharedImage(null, p.slug, 0)).toBeNull();
    expect(await getHandlePage(handle)).toBeNull();
    await expect(getStorage().get(files[0].key)).rejects.toThrow();
    for (const [model, where] of [
      ["submission", { userId: u }], ["notification", { userId: u }], ["peerReview", { reviewerId: u }], ["peerReview", { projectId: p.id }],
      ["report", { reporterId: u }], ["appeal", { userId: u }], ["reviewerBlock", { blockedId: u }], ["progress", { userId: u }], ["enrollment", { userId: u }],
    ] as const) {
      expect(await (db[model] as unknown as { count: (a: unknown) => Promise<number> }).count({ where }), model).toBe(0);
    }
    expect(await db.evaluation.count({ where: { submissionId: s.submissionId } })).toBe(0);
    expect(await db.report.count({ where: { targetId: { in: [p.id, fp.id] } } })).toBe(0);

    // Kept: the friend's project, intact, without the leaver's review; the reviewer's decision, without a link to anyone.
    expect(await getProjectView(null, fp.slug)).not.toBeNull();
    expect(await db.peerReview.count({ where: { projectId: fp.id } })).toBe(0);
    expect(await db.auditEvent.findFirst({ where: { action: "test.action" } })).toMatchObject({ actorId: null });
    expect(await db.auditEvent.count({ where: { action: "account.deleted" } })).toBeGreaterThan(0);
    const audit = JSON.stringify(await db.auditEvent.findMany({ where: { action: "account.deleted" } }));
    expect(audit).not.toContain(u);
    created.splice(created.indexOf(u), 1);
  });

  it("clears a reviewer's name from decisions on other people's work, and keeps the decisions", async () => {
    const rev = await withPassword(await makeUser({ role: "REVIEWER", enroll: false }));
    const owner = await learnerWithName("Owner");
    const s = await evaluatedSubmission(owner, "[fake:score=60]");
    const p = await createProject(owner, s.submissionId);
    await updateProject(owner, p.id, { visibility: "PUBLIC" });
    const full = await db.portfolioProject.findUniqueOrThrow({ where: { id: p.id }, include: { submission: true } });
    await decideApproval({ id: rev, role: "REVIEWER" }, p.id, "approve", "", contentFingerprint(full));
    await createAppeal(owner, s.evaluationId, "I think the contrast was judged too harshly here, please look again.");
    await db.appeal.updateMany({ where: { userId: owner }, data: { reviewerId: rev, status: "UPHELD", resolution: "Confirmed." } });
    await deleteAccount(rev, { password: PW, confirm: DELETE_PHRASE });
    expect(await db.portfolioProject.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ publicApproval: "APPROVED", approvedBy: null });
    expect(await db.appeal.findFirstOrThrow({ where: { userId: owner } })).toMatchObject({ status: "UPHELD", reviewerId: null });
    created.splice(created.indexOf(rev), 1);
  });

  it("refuses to delete the last administrator, but lets one of several go", async () => {
    // Other admins may exist in a shared dev database: demote them for the duration of this test.
    const others = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
    await db.user.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { role: "LEARNER" } });
    try {
      const a = await withPassword(await makeUser({ role: "ADMIN", enroll: false }));
      expect(await code(deleteAccount(a, { password: PW, confirm: DELETE_PHRASE }))).toBe("last_admin");
      expect(await db.user.count({ where: { id: a } })).toBe(1);
      const b = await withPassword(await makeUser({ role: "ADMIN", enroll: false }));
      expect(await code(deleteAccount(b, { password: PW, confirm: DELETE_PHRASE }))).toBe("ok");
      created.splice(created.indexOf(b), 1);
    } finally {
      await db.user.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { role: "ADMIN" } });
    }
  });
});
