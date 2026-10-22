import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";
import { createProject, updateProject } from "../src/lib/portfolio";
import { getProjectView } from "../src/lib/portfolio/view";
import { CONTACT_RETENTION_DAYS, TakedownError, listOpenTakedowns, resolveTakedown, scrubOldContacts, submitTakedown } from "../src/lib/safety/takedown";
import { cleanup, evaluatedSubmission, learnerWithName, makeUser, useTempStorage } from "./helpers";

beforeAll(async () => {
  await useTempStorage();
  process.env.CONTENT_PREVIEW = "true";
  await publishContent(db, loadContent());
});
afterEach(async () => { await db.takedownRequest.deleteMany({}); await db.rateBucket.deleteMany({}); });
afterAll(async () => { await cleanup(); await db.takedownRequest.deleteMany({}); await db.$disconnect(); });

const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return e instanceof TakedownError ? e.code : String(e); } };
const mod = async (role: "REVIEWER" | "ADMIN" = "REVIEWER") => ({ id: await makeUser({ role, enroll: false }), role });
const REASON = "This image shows something that should not be hosted here.";
async function sharedProject() {
  const u = await learnerWithName("Owner");
  const s = await evaluatedSubmission(u);
  const p = await createProject(u, s.submissionId);
  await updateProject(u, p.id, { visibility: "LINK" });
  return { u, p };
}

describe("takedown requests", () => {
  it("anyone can file; the project is found from the link; plain text only", async () => {
    const { p } = await sharedProject();
    await submitTakedown({ link: `https://example.test/p/${p.slug}?x=1`, reason: `${REASON}\u0000`, name: "A Person", email: "a@b.co" }, "client-1");
    const [r] = await listOpenTakedowns(await mod());
    expect(r).toMatchObject({ projectSlug: p.slug, reporterEmail: "a@b.co", project: { id: p.id, held: false } });
    expect(r.reason).not.toContain("\u0000");
  });
  it("validates, rate-limits per client, and ignores honeypot submissions", async () => {
    expect(await code(submitTakedown({ reason: "too short" }, "c"))).toBe("invalid");
    expect(await code(submitTakedown({ reason: "x".repeat(2001) }, "c"))).toBe("invalid");
    expect(await code(submitTakedown({ reason: REASON, email: "not-an-email" }, "c"))).toBe("invalid");
    expect(await submitTakedown({ reason: REASON, website: "http://spam" }, "c")).toEqual({ id: null });
    expect(await db.takedownRequest.count()).toBe(0);
    for (let i = 0; i < 5; i++) await submitTakedown({ reason: REASON }, "flood");
    expect(await code(submitTakedown({ reason: REASON }, "flood"))).toBe("rate_limited");
    expect(await code(submitTakedown({ reason: REASON }, "someone-else"))).toBe("ok");
  });
  it("hold takes the project down, closes duplicates, tells the owner why, and is audited", async () => {
    const { u, p } = await sharedProject();
    await submitTakedown({ link: `/p/${p.slug}`, reason: REASON }, "a");
    await submitTakedown({ link: `/p/${p.slug}`, reason: `${REASON} Second report.` }, "b");
    const m = await mod();
    const [first] = await listOpenTakedowns(m);
    await resolveTakedown(m, first.id, "hold", "Hosting this would break the policy.");
    const row = await db.portfolioProject.findUniqueOrThrow({ where: { id: p.id } });
    expect(row).toMatchObject({ moderationHold: true, visibility: "PRIVATE", publicApproval: "NONE" });
    expect(await getProjectView(null, p.slug)).toBeNull();
    expect(await listOpenTakedowns(m)).toHaveLength(0);
    const n = await db.notification.findFirstOrThrow({ where: { userId: u, kind: "project_held" } });
    expect(n.text).toContain("Hosting this would break the policy.");
    expect(await db.auditEvent.count({ where: { actorId: m.id, action: "takedown.hold" } })).toBe(1);
  });
  it("dismiss leaves the project alone; a reason is required; only reviewers; never your own work; one winner", async () => {
    const { u, p } = await sharedProject();
    await submitTakedown({ link: `/p/${p.slug}`, reason: REASON }, "a");
    const m = await mod();
    const [r] = await listOpenTakedowns(m);
    expect(await code(resolveTakedown(m, r.id, "dismiss", "  "))).toBe("invalid");
    expect(await code(resolveTakedown({ id: await makeUser({ enroll: false }), role: "LEARNER" }, r.id, "dismiss", "no reason needed"))).toBe("forbidden");
    expect(await code(resolveTakedown({ id: u, role: "REVIEWER" }, r.id, "hold", "my own project"))).toBe("own_project");
    const results = await Promise.all([mod(), mod(), mod()].map(async (x) => code(resolveTakedown(await x, r.id, "dismiss", "Nothing wrong here."))));
    expect(results.filter((x) => x === "ok")).toHaveLength(1);
    expect((await db.portfolioProject.findUniqueOrThrow({ where: { id: p.id } })).moderationHold).toBe(false);
  });
  it("cannot hold a complaint that matches no project", async () => {
    await submitTakedown({ link: "https://elsewhere.test/nothing", reason: REASON }, "a");
    const m = await mod();
    const [r] = await listOpenTakedowns(m);
    expect(r.project).toBeNull();
    expect(await code(resolveTakedown(m, r.id, "hold", "Cannot find it."))).toBe("no_project");
    expect(await code(resolveTakedown(m, r.id, "dismiss", "No project to act on."))).toBe("ok");
  });
  it("removes complainant contact details only after the retention period, and only for handled requests", async () => {
    await submitTakedown({ reason: REASON, name: "Old", email: "old@x.co" }, "a");
    await submitTakedown({ reason: REASON, name: "Open", email: "open@x.co" }, "b");
    const m = await mod();
    const rows = await listOpenTakedowns(m);
    const old = rows.find((r) => r.reporterName === "Old")!;
    await resolveTakedown(m, old.id, "dismiss", "Not a policy problem.");
    const soon = new Date(Date.now() + (CONTACT_RETENTION_DAYS - 1) * 86_400_000);
    expect(await scrubOldContacts(soon)).toBe(0);
    const later = new Date(Date.now() + (CONTACT_RETENTION_DAYS + 1) * 86_400_000);
    expect(await scrubOldContacts(later)).toBe(1);
    expect(await db.takedownRequest.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ reporterEmail: null, reporterName: null });
    expect((await db.takedownRequest.findFirstOrThrow({ where: { status: "OPEN" } })).reporterEmail).toBe("open@x.co");
  });
});
