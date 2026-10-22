import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { getStorage } from "../src/lib/storage";
import type { StoredFile } from "../src/lib/submissions/access";

export const created: string[] = [];

export async function useTempStorage() {
  process.env.UPLOAD_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "cm-test-"));
}

export async function makeUser(opts: { enroll?: boolean; role?: "LEARNER" | "REVIEWER" | "ADMIN" } = {}) {
  const u = await db.user.create({
    data: { email: `t-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`, role: opts.role ?? "LEARNER" },
  });
  created.push(u.id);
  if (opts.enroll !== false) {
    const mod = await db.module.findFirstOrThrow({ where: { slug: "understanding-contrast" }, include: { level: true } });
    await db.enrollment.create({ data: { userId: u.id, pathId: mod.level.pathId } });
  }
  return u.id;
}

const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#224488" } }).png().toBuffer();

export async function storeImage(role: StoredFile["role"], w: number, h: number): Promise<StoredFile> {
  const buf = await png(w, h);
  const key = await getStorage().put(buf);
  return { key, name: `${role}.png`, mime: "image/png", size: buf.length, sha256: "x".repeat(64), width: w, height: h, role };
}

export const RATIONALE =
  "I made the event name the largest and darkest element so it reads first, then used a mid tone for the date and place, and a single saturated button colour for the call to action to separate it from everything else.";

export async function makeSubmission(
  userId: string,
  opts: { rationale?: string; withPreview?: boolean; attempt?: number; status?: "SUBMITTED" } = {},
) {
  const assignment = await db.assignment.findUniqueOrThrow({ where: { slug: "high-contrast-event-poster" } });
  const files = [await storeImage("final", 800, 1200)];
  if (opts.withPreview !== false) files.push(await storeImage("preview", 267, 400));
  return db.submission.create({
    data: {
      userId, assignmentId: assignment.id, attempt: opts.attempt ?? 1, status: opts.status ?? "SUBMITTED",
      files: files as unknown as object, rationale: opts.rationale ?? RATIONALE,
    },
  });
}

export async function cleanup() {
  const subs = await db.submission.findMany({ where: { userId: { in: created } }, select: { id: true } });
  const sid = subs.map((s) => s.id);
  const evs = await db.evaluation.findMany({ where: { submissionId: { in: sid } }, select: { id: true } });
  const eid = evs.map((e) => e.id);
  await db.appeal.deleteMany({ where: { evaluationId: { in: eid } } });
  await db.criterionScore.deleteMany({ where: { evaluationId: { in: eid } } });
  await db.evaluation.deleteMany({ where: { id: { in: eid } } });
  await db.portfolioProject.deleteMany({ where: { submissionId: { in: sid } } });
  await db.submission.deleteMany({ where: { id: { in: sid } } });
  await db.auditEvent.deleteMany({ where: { actorId: { in: created } } });
  await db.skillEvidence.deleteMany({ where: { userId: { in: created } } });
  await db.quizAttempt.deleteMany({ where: { userId: { in: created } } });
  await db.blockView.deleteMany({ where: { userId: { in: created } } });
  await db.progress.deleteMany({ where: { userId: { in: created } } });
  await db.enrollment.deleteMany({ where: { userId: { in: created } } });
  await db.user.deleteMany({ where: { id: { in: created } } });
}
