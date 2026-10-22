import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { LIMITS, hit } from "@/lib/ratelimit";

export class TakedownError extends Error {
  constructor(public code: "invalid" | "rate_limited" | "forbidden" | "not_found" | "own_project" | "no_project", message?: string) { super(message ?? code); }
}

export const REASON_MIN = 20;
export const REASON_MAX = 2000;
/** Contact details a complainant gave are removed this long after the request is handled. */
export const CONTACT_RETENTION_DAYS = 90;

const clean = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
const SLUG = /\/p\/([A-Za-z0-9_-]{8,40})/;

/** Anyone can file. Plain text only; a honeypot field and a per-client hourly limit keep it from being a spam channel. */
export async function submitTakedown(input: { link?: string; reason: string; name?: string; email?: string; website?: string }, clientSubject: string) {
  if (input.website) return { id: null }; // honeypot: pretend it worked
  const reason = clean(input.reason, REASON_MAX + 1);
  if (reason.length < REASON_MIN) throw new TakedownError("invalid", `Please explain the problem in at least ${REASON_MIN} characters.`);
  if (reason.length > REASON_MAX) throw new TakedownError("invalid", `Please keep it under ${REASON_MAX} characters.`);
  const email = clean(input.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TakedownError("invalid", "That email address does not look right. Leave it blank if you prefer.");
  const limited = await hit(clientSubject, LIMITS.takedown());
  if (!limited.allowed) throw new TakedownError("rate_limited", "You have sent several reports recently. Please try again later.");
  const link = clean(input.link, 300) || null;
  const slug = link ? SLUG.exec(link)?.[1] ?? null : null;
  const row = await db.takedownRequest.create({ data: { link, projectSlug: slug, reason, reporterName: clean(input.name, 100) || null, reporterEmail: email || null } });
  return { id: row.id };
}

type Mod = { id: string; role: Role };
const need = (m: Mod) => { if (m.role !== "REVIEWER" && m.role !== "ADMIN") throw new TakedownError("forbidden"); };

export async function listOpenTakedowns(mod: Mod) {
  need(mod);
  const rows = await db.takedownRequest.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" } });
  const out = [];
  for (const r of rows) {
    const p = r.projectSlug ? await db.portfolioProject.findUnique({ where: { slug: r.projectSlug }, select: { id: true, title: true, visibility: true, moderationHold: true, userId: true } }) : null;
    out.push({ ...r, project: p ? { id: p.id, title: p.title, visibility: p.visibility, held: p.moderationHold, mine: p.userId === mod.id } : null });
  }
  return out;
}

/**
 * `hold` takes the project down (forced Private, cannot be re-shared) and tells its owner why; `dismiss` closes the
 * complaint. Atomic: one reviewer wins. Every decision is audited and every other open complaint about the same project
 * is closed with it.
 */
export async function resolveTakedown(mod: Mod, id: string, action: "hold" | "dismiss", note: string) {
  need(mod);
  const n = clean(note, 500);
  if (n.length < 5) throw new TakedownError("invalid", "Record a short reason for the decision.");
  const req = await db.takedownRequest.findUnique({ where: { id } });
  if (!req) throw new TakedownError("not_found");
  const project = req.projectSlug ? await db.portfolioProject.findUnique({ where: { slug: req.projectSlug } }) : null;
  if (action === "hold") {
    if (!project) throw new TakedownError("no_project", "No project matches this complaint. Dismiss it, or ask the reporter for the link.");
    if (project.userId === mod.id) throw new TakedownError("own_project", "You cannot moderate your own work.");
  }
  return db.$transaction(async (tx) => {
    const claim = await tx.takedownRequest.updateMany({ where: { id, status: "OPEN" }, data: { status: action === "hold" ? "ACTIONED" : "DISMISSED", handledBy: mod.id, handledAt: new Date(), note: n } });
    if (claim.count === 0) throw new TakedownError("invalid", "This complaint has already been handled.");
    if (action === "hold" && project) {
      await tx.portfolioProject.update({ where: { id: project.id }, data: { moderationHold: true, visibility: "PRIVATE", publicApproval: "NONE" } });
      await tx.takedownRequest.updateMany({ where: { projectSlug: project.slug, status: "OPEN" }, data: { status: "ACTIONED", handledBy: mod.id, handledAt: new Date(), note: n } });
      await notify(tx, project.userId, "project_held", `Your project "${project.title}" was taken down after a complaint and is now private. Reason: ${n}`, project.id);
    }
    await tx.auditEvent.create({ data: { actorId: mod.id, action: `takedown.${action}`, subject: `takedown:${id}`, detail: { projectId: project?.id ?? null } } });
    return { action };
  });
}

/** Remove complainants' contact details once a request has been handled for CONTACT_RETENTION_DAYS. */
export async function scrubOldContacts(now = new Date()) {
  const cutoff = new Date(now.getTime() - CONTACT_RETENTION_DAYS * 86_400_000);
  const { count } = await db.takedownRequest.updateMany({
    where: { status: { not: "OPEN" }, handledAt: { lt: cutoff }, OR: [{ reporterEmail: { not: null } }, { reporterName: { not: null } }] },
    data: { reporterEmail: null, reporterName: null },
  });
  return count;
}
