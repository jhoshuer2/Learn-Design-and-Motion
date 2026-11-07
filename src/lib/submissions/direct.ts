import { db } from "@/lib/db";
import { getAssignmentAccess } from "@/lib/progression";
import { hit, LIMITS as RATE } from "@/lib/ratelimit";
import { getDirectUpload, type DirectUpload } from "@/lib/storage";
import { LIMITS, UploadError } from "@/lib/storage/validate";
import type { UploadedFile } from "./index";

export type PresignResult =
  | { status: 200; body: { token: string; url: string; headers: Record<string, string> } }
  | { status: 400 | 401 | 403 | 404 | 429; body: { error: string } };

const MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
const fail = (status: 400 | 401 | 403 | 404 | 429, error: string): PresignResult => ({ status, body: { error } });

/**
 * Hand out a short-lived URL for ONE image, only to someone who could submit this assessment right now, for one of its
 * own deliverable slots, within the size limit. The browser's claims about the file are advisory: whatever arrives in the
 * bucket is read back and fully decoded by the server before anything is kept.
 */
export async function requestUploadUrl(userId: string | undefined, body: unknown, direct: DirectUpload | null = getDirectUpload()): Promise<PresignResult> {
  if (!userId) return fail(401, "Sign in to upload.");
  if (!direct) return fail(404, "Direct upload is not enabled.");
  const b = (body ?? {}) as { assignmentId?: unknown; slot?: unknown; size?: unknown; mime?: unknown };
  if (typeof b.assignmentId !== "string" || typeof b.slot !== "string" || typeof b.size !== "number" || typeof b.mime !== "string") return fail(400, "Invalid request.");
  if (!Number.isInteger(b.size) || b.size < 1) return fail(400, "The file is empty.");
  if (b.size > LIMITS.maxBytes) return fail(400, "Each file must be 8 MB or smaller.");
  if (!MIMES.has(b.mime)) return fail(400, "Only PNG, JPEG and WebP images are accepted.");

  const access = await getAssignmentAccess(userId, b.assignmentId);
  if (!access.allowed) return fail(403, "You cannot submit to this assessment right now.");
  const asg = await db.assignment.findUnique({ where: { id: b.assignmentId } });
  const defs = ((asg?.brief ?? {}) as { deliverables?: { key: string }[] }).deliverables ?? [];
  if (!defs.some((d) => d.key === b.slot)) return fail(400, "That file does not match anything this assessment asks for.");

  const limited = await hit(userId, RATE.uploadUrl());
  if (!limited.allowed) return fail(429, "Too many uploads. Try again later.");
  return { status: 200, body: await direct.presignPut(userId, { size: b.size, mime: b.mime }) };
}

/**
 * Read the files a submission refers to by token (`upload_<slot>`) from the bucket. Returns the files and a cleanup that
 * deletes the pending objects; call it whatever happens next. A file in the multipart body wins only if no token is sent.
 */
export async function readPendingUploads(
  userId: string, slots: { key: string; token: string | null; name: string | null }[], direct: DirectUpload | null = getDirectUpload(),
): Promise<{ files: UploadedFile[]; cleanup: () => Promise<void> }> {
  const used: string[] = [];
  const cleanup = async () => { await Promise.all(used.map((t) => direct?.deletePending(userId, t).catch(() => undefined))); };
  const files: UploadedFile[] = [];
  try {
    for (const s of slots) {
      if (!s.token) continue;
      if (!direct) throw new UploadError("missing", "Direct upload is not enabled.");
      used.push(s.token);
      files.push({ slot: s.key, name: s.name || "upload", data: await direct.readPending(userId, s.token) });
    }
  } catch (e) {
    await cleanup();
    throw e;
  }
  return { files, cleanup };
}
