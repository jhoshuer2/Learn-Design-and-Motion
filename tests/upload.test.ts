import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { LocalDiskStorage } from "../src/lib/storage";
import { LIMITS, UploadError, assertFileCount, safeName, validateImage } from "../src/lib/storage/validate";
import { canReadSubmission } from "../src/lib/submissions/access";

const png = (w = 200, h = 300) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#336699" } }).png().toBuffer();

const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof UploadError ? e.code : `other:${e}`));

describe("validateImage", () => {
  it("accepts a real PNG and reports detected facts", async () => {
    const v = await validateImage("poster.png", await png(200, 300));
    expect(v).toMatchObject({ mime: "image/png", width: 200, height: 300 });
    expect(v.sha256).toHaveLength(64);
  });

  it("accepts JPEG and WebP", async () => {
    const base = sharp({ create: { width: 64, height: 64, channels: 3, background: "#fff" } });
    expect((await validateImage("a.jpg", await base.clone().jpeg().toBuffer())).mime).toBe("image/jpeg");
    expect((await validateImage("a.webp", await base.clone().webp().toBuffer())).mime).toBe("image/webp");
  });

  it("decides by content, not by name or declared type: a renamed executable is rejected", async () => {
    const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(2000, 1)]);
    expect(await code(validateImage("poster.png", exe))).toBe("corrupt");
  });

  it("rejects text and HTML renamed to .png", async () => {
    expect(await code(validateImage("p.png", Buffer.from("<html><script>alert(1)</script></html>")))).toBe("corrupt");
  });

  it("rejects SVG (can carry script)", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(1)</script></svg>');
    expect(await code(validateImage("p.svg", svg))).toBe("unsupported");
  });

  it("rejects a truncated image", async () => {
    const good = await png(800, 800);
    expect(await code(validateImage("p.png", good.subarray(0, Math.floor(good.length / 2))))).toBe("corrupt");
  });

  it("rejects oversize and empty files", async () => {
    expect(await code(validateImage("p.png", Buffer.alloc(LIMITS.maxBytes + 1)))).toBe("too_large");
    expect(await code(validateImage("p.png", Buffer.alloc(0)))).toBe("empty");
  });

  it("rejects images too small to assess", async () => {
    expect(await code(validateImage("p.png", await png(10, 10)))).toBe("too_small");
  });

  it("rejects animated images", async () => {
    const frame = (c: string) => sharp({ create: { width: 64, height: 64, channels: 3, background: c } }).png().toBuffer();
    const animated = await sharp([await frame("#f00"), await frame("#00f")], { join: { animated: true } }).webp().toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2); // the fixture really is animated
    expect(await code(validateImage("a.webp", animated))).toBe("unsupported");
  });

  it("limits the number of files", () => {
    expect(() => assertFileCount(LIMITS.maxFiles)).not.toThrow();
    expect(() => assertFileCount(LIMITS.maxFiles + 1)).toThrow(UploadError);
  });
});

describe("safeName", () => {
  it("strips paths and control characters", () => {
    expect(safeName("../../etc/passwd")).toBe("passwd");
    expect(safeName("C:\\Users\\me\\poster.png")).toBe("poster.png");
    expect(safeName('a"b\u0000c.png')).toBe("abc.png");
    expect(safeName("")).toBe("upload");
  });
});

describe("LocalDiskStorage", () => {
  it("round-trips data under a server-generated key and refuses path-like keys", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cm-store-"));
    const s = new LocalDiskStorage(dir);
    const key = await s.put(Buffer.from("hello"));
    expect((await s.get(key)).toString()).toBe("hello");
    await expect(s.get("../../etc/passwd")).rejects.toThrow(/Invalid storage key/);
    await expect(s.get(`${key}/../${key}`)).rejects.toThrow(/Invalid storage key/);
    await s.delete(key);
    await expect(s.get(key)).rejects.toThrow();
  });
});

describe("canReadSubmission", () => {
  const sub = { userId: "owner" };
  it("allows the owner, reviewers and admins only", () => {
    expect(canReadSubmission({ id: "owner", role: "LEARNER" }, sub)).toBe(true);
    expect(canReadSubmission({ id: "x", role: "REVIEWER" }, sub)).toBe(true);
    expect(canReadSubmission({ id: "x", role: "ADMIN" }, sub)).toBe(true);
    expect(canReadSubmission({ id: "x", role: "LEARNER" }, sub)).toBe(false);
    expect(canReadSubmission({ id: "x", role: "AUTHOR" }, sub)).toBe(false);
  });
});
