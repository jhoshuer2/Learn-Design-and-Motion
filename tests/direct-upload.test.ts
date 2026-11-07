import http from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Env must be set before the storage module first builds its adapter.
const objects = new Map<string, Buffer>();
let server: http.Server;
let base = "";

/** In-process stand-in for S3 (path style). It stores what is PUT, serves it back, and does NOT verify signatures. */
function startStub() {
  server = http.createServer((req, res) => {
    const key = decodeURIComponent((req.url ?? "").split("?")[0]).replace(/^\/bucket\//, "");
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => { objects.set(key, Buffer.concat(chunks)); res.writeHead(200, { ETag: '"x"' }).end(); });
    } else if (req.method === "GET") {
      const o = objects.get(key);
      if (!o) { res.writeHead(404, { "Content-Type": "application/xml" }).end('<?xml version="1.0"?><Error><Code>NoSuchKey</Code><Message>missing</Message></Error>'); return; }
      res.writeHead(200, { "Content-Length": String(o.length) }).end(o);
    } else if (req.method === "DELETE") { objects.delete(key); res.writeHead(204).end(); }
    else res.writeHead(405).end();
  });
  return new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => { base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; resolve(); }));
}

const png = (w = 800, h = 1200) => sharp({ create: { width: w, height: h, channels: 3, background: "#aa3322" } }).png().toBuffer();

let db: typeof import("../src/lib/db").db;
let direct: typeof import("../src/lib/submissions/direct");
let subs: typeof import("../src/lib/submissions");
let helpers: typeof import("./helpers");
let assignmentId: string;

async function readyUser() {
  const u = await helpers.makeUser();
  const lessons = await db.lesson.findMany({ where: { module: { slug: "understanding-contrast" } }, select: { id: true } });
  await db.progress.createMany({ data: lessons.map((l) => ({ userId: u, nodeType: "LESSON", nodeId: l.id, state: "COMPLETED" as const, completedAt: new Date() })), skipDuplicates: true });
  return u;
}
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e as { code?: string }).code ?? `other:${e}`);

/** Request a URL, then PUT the bytes the way the browser does. */
async function upload(userId: string, data: Buffer, mime = "image/png", slot = "final") {
  const r = await direct.requestUploadUrl(userId, { assignmentId, slot, size: data.length, mime });
  if (r.status !== 200) throw new Error(`presign ${r.status}`);
  const put = await fetch(r.body.url, { method: "PUT", headers: r.body.headers, body: new Uint8Array(data) });
  expect(put.ok).toBe(true);
  return r.body;
}

beforeAll(async () => {
  await startStub();
  Object.assign(process.env, {
    S3_BUCKET: "bucket", S3_ENDPOINT: base, S3_REGION: "us-east-1", S3_FORCE_PATH_STYLE: "true",
    S3_ACCESS_KEY_ID: "test", S3_SECRET_ACCESS_KEY: "test", CONTENT_PREVIEW: "true",
  });
  ({ db } = await import("../src/lib/db"));
  direct = await import("../src/lib/submissions/direct");
  subs = await import("../src/lib/submissions");
  helpers = await import("./helpers");
  const { loadContent } = await import("../src/lib/content/loader");
  const { publishContent } = await import("../src/lib/content/publish");
  await publishContent(db, loadContent());
  assignmentId = (await db.assignment.findUniqueOrThrow({ where: { slug: "high-contrast-event-poster" } })).id;
});
afterAll(async () => {
  await helpers.cleanup();
  await db.rateBucket.deleteMany({ where: { id: { startsWith: "upload-url:" } } });
  await db.$disconnect();
  server.close();
});

describe("upload URL requests", () => {
  it("refuse anonymous callers, bad bodies, bad files and people who cannot submit", async () => {
    const u = await readyUser();
    const ok = { assignmentId, slot: "final", size: 1000, mime: "image/png" };
    expect((await direct.requestUploadUrl(undefined, ok)).status).toBe(401);
    expect((await direct.requestUploadUrl(u, null)).status).toBe(400);
    expect((await direct.requestUploadUrl(u, { ...ok, size: "big" })).status).toBe(400);
    expect((await direct.requestUploadUrl(u, { ...ok, size: 0 })).status).toBe(400);
    expect((await direct.requestUploadUrl(u, { ...ok, size: 9 * 1024 * 1024 })).status).toBe(400);
    expect((await direct.requestUploadUrl(u, { ...ok, mime: "image/svg+xml" })).status).toBe(400);
    expect((await direct.requestUploadUrl(u, { ...ok, slot: "nonsense" })).status).toBe(400);
    expect((await direct.requestUploadUrl(u, ok, null)).status).toBe(404); // direct upload not configured
    const notReady = await helpers.makeUser(); // enrolled, lessons not done
    expect((await direct.requestUploadUrl(notReady, ok)).status).toBe(403);
    const stranger = await helpers.makeUser({ enroll: false });
    expect((await direct.requestUploadUrl(stranger, ok)).status).toBe(403);
  });

  it("signs the size and type, and keeps the object under the caller's own prefix", async () => {
    const u = await readyUser();
    const r = await direct.requestUploadUrl(u, { assignmentId, slot: "final", size: 1234, mime: "image/png" });
    if (r.status !== 200) throw new Error("expected 200");
    const url = new URL(r.body.url);
    expect(url.pathname).toBe(`/bucket/pending/${u}/${r.body.token}`);
    const signed = (url.searchParams.get("X-Amz-SignedHeaders") ?? "").split(";");
    expect(signed).toEqual(expect.arrayContaining(["content-length", "content-type"]));
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
  });

  it("is rate limited per person", async () => {
    const u = await readyUser();
    process.env.RATE_UPLOAD_URL_PER_HOUR = "2";
    try {
      const ask = () => direct.requestUploadUrl(u, { assignmentId, slot: "final", size: 100, mime: "image/png" }).then((r) => r.status);
      expect([await ask(), await ask(), await ask()]).toEqual([200, 200, 429]);
    } finally { delete process.env.RATE_UPLOAD_URL_PER_HOUR; }
  });
});

describe("direct upload round trip", () => {
  it("stores the final image from a bucket upload and removes the pending object", async () => {
    const u = await readyUser();
    const body = await upload(u, await png());
    const preview = await upload(u, await png(267, 400), "image/png", "preview");
    expect([...objects.keys()].filter((k) => k.startsWith(`pending/${u}/`))).toHaveLength(2);

    const { files, cleanup } = await direct.readPendingUploads(u, [
      { key: "final", token: body.token, name: "poster.png" }, { key: "preview", token: preview.token, name: "small.png" },
    ]);
    const before = objects.size;
    const { submissionId } = await subs.createSubmission(u, assignmentId, { files, rationale: `${helpers.RATIONALE}` });
    await cleanup();
    const sub = await db.submission.findUniqueOrThrow({ where: { id: submissionId } });
    const stored = sub.files as unknown as { key: string; width: number; role: string }[];
    expect(stored.map((f) => f.role).sort()).toEqual(["final", "preview"]);
    for (const f of stored) expect(objects.has(`uploads/${f.key}`)).toBe(true);
    expect(objects.size).toBe(before); // two final objects added, two pending objects removed
    expect([...objects.keys()].some((k) => k.startsWith(`pending/${u}/`))).toBe(false);
    await Promise.all(stored.map((f) => (async () => { objects.delete(`uploads/${f.key}`); })()));
  });

  it("does not hand out another person's pending object", async () => {
    const owner = await readyUser();
    const other = await readyUser();
    const mine = await upload(owner, await png());
    await expect(direct.readPendingUploads(other, [{ key: "final", token: mine.token, name: "x.png" }])).rejects.toMatchObject({ code: "missing" });
    await expect(direct.readPendingUploads(owner, [{ key: "final", token: "../../etc/passwd", name: "x.png" }])).rejects.toMatchObject({ code: "missing" });
    await direct.readPendingUploads(owner, [{ key: "final", token: mine.token, name: "x.png" }]).then((r) => r.cleanup());
  });

  it("still decodes and validates what arrived: a renamed non-image stores nothing and is cleaned up", async () => {
    const u = await readyUser();
    const bad = await upload(u, Buffer.from("MZ not an image at all, just bytes pretending to be a png"));
    const { files, cleanup } = await direct.readPendingUploads(u, [{ key: "final", token: bad.token, name: "poster.png" }]);
    const storedBefore = [...objects.keys()].filter((k) => k.startsWith("uploads/")).length;
    expect(await code(subs.createSubmission(u, assignmentId, { files, rationale: helpers.RATIONALE }))).toBe("corrupt");
    await cleanup();
    expect([...objects.keys()].filter((k) => k.startsWith("uploads/")).length).toBe(storedBefore);
    expect([...objects.keys()].some((k) => k.startsWith(`pending/${u}/`))).toBe(false);
    expect(await db.submission.count({ where: { userId: u } })).toBe(0);
  });

  it("reports an expired or missing upload clearly", async () => {
    const u = await readyUser();
    const ghost = "123e4567-e89b-42d3-a456-426614174000";
    await expect(direct.readPendingUploads(u, [{ key: "final", token: ghost, name: "x.png" }])).rejects.toMatchObject({ code: "missing" });
  });
});
