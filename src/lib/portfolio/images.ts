import sharp from "sharp";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import type { StoredFile } from "@/lib/submissions/access";
import { projectAccess, type Viewer } from "./access";

const OUT = { "image/png": "image/png", "image/jpeg": "image/jpeg", "image/webp": "image/webp" } as const;

/**
 * Re-encode for public serving. Sharp drops all metadata (EXIF including GPS, XMP, text chunks) unless asked
 * to keep it, and `rotate()` bakes in the orientation first so the picture is not turned sideways.
 * The stored original is never modified or served.
 */
export async function serveableImage(data: Buffer, mime: string): Promise<{ data: Buffer; mime: string }> {
  const img = sharp(data, { limitInputPixels: 40_000_000 }).rotate();
  if (mime === "image/jpeg") return { data: await img.jpeg({ quality: 90 }).toBuffer(), mime: OUT["image/jpeg"] };
  if (mime === "image/webp") return { data: await img.webp({ quality: 90 }).toBuffer(), mime: OUT["image/webp"] };
  return { data: await img.png().toBuffer(), mime: OUT["image/png"] };
}

/** Null (a 404) unless this viewer may see the project right now AND the owner chose to show this image. */
export async function getSharedImage(viewer: Viewer, slug: string, idx: number) {
  if (!Number.isInteger(idx) || idx < 0) return null;
  const p = await db.portfolioProject.findUnique({ where: { slug }, include: { submission: { select: { files: true } } } });
  if (!p || projectAccess(viewer, p) === "none") return null;
  if (!p.shownFiles.includes(idx)) return null;
  const file = (p.submission.files as unknown as StoredFile[])[idx];
  if (!file) return null;
  const raw = await getStorage().get(file.key).catch(() => null);
  return raw ? serveableImage(raw, file.mime) : null;
}
