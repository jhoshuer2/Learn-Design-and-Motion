import { createHash } from "node:crypto";
import path from "node:path";
import sharp, { type Metadata } from "sharp";

export const LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  maxFiles: 4,
  maxPixels: 40_000_000,
  minSide: 32,
} as const;

const FORMATS = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;

export type UploadErrorCode = "too_large" | "unsupported" | "corrupt" | "too_many" | "too_small" | "empty";
export class UploadError extends Error {
  constructor(public code: UploadErrorCode, message: string) {
    super(message);
  }
}

export type ValidatedImage = {
  name: string; mime: string; size: number; sha256: string; width: number; height: number; buffer: Buffer;
};

/** Strip any path and control characters; the display name is never used to build a path. */
export function safeName(name: string) {
  const base = path.basename(name.replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  return (base || "upload").slice(0, 120);
}

/**
 * The declared MIME type and file extension are ignored: the bytes are fully decoded and the detected format
 * decides. A renamed executable, a truncated file, an SVG and an animated image are all rejected.
 */
export async function validateImage(name: string, buffer: Buffer): Promise<ValidatedImage> {
  if (buffer.length === 0) throw new UploadError("empty", "The file is empty.");
  if (buffer.length > LIMITS.maxBytes) throw new UploadError("too_large", "Each file must be 8 MB or smaller.");
  let meta: Metadata;
  try {
    const img = sharp(buffer, { limitInputPixels: LIMITS.maxPixels, failOn: "error" });
    meta = await img.metadata();
    if (!meta.format || !(meta.format in FORMATS)) {
      throw new UploadError("unsupported", "Only PNG, JPEG and WebP images are accepted.");
    }
    if ((meta.pages ?? 1) > 1) throw new UploadError("unsupported", "Animated images are not accepted.");
    await img.resize(16, 16, { fit: "inside" }).raw().toBuffer(); // forces a full decode
  } catch (e) {
    if (e instanceof UploadError) throw e;
    throw new UploadError("corrupt", "This file could not be read as an image. Export it again and retry.");
  }
  const width = meta.width ?? 0, height = meta.height ?? 0;
  if (Math.min(width, height) < LIMITS.minSide) throw new UploadError("too_small", "The image is too small to assess.");
  return {
    name: safeName(name), mime: FORMATS[meta.format as keyof typeof FORMATS], size: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"), width, height, buffer,
  };
}

export function assertFileCount(n: number) {
  if (n > LIMITS.maxFiles) throw new UploadError("too_many", `Upload at most ${LIMITS.maxFiles} images.`);
}
