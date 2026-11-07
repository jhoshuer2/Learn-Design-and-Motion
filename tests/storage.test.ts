import { describe, expect, it } from "vitest";
import { S3Storage } from "../src/lib/storage";

/** The adapter is exercised against an in-memory stand-in for the S3 client; no network. */
function fakeS3() {
  const objects = new Map<string, Buffer>();
  const send = async (cmd: { constructor: { name: string }; input: { Key: string; Body?: Buffer } }) => {
    const n = cmd.constructor.name;
    if (n === "PutObjectCommand") { objects.set(cmd.input.Key, cmd.input.Body!); return {}; }
    if (n === "GetObjectCommand") { const b = objects.get(cmd.input.Key); return { Body: b ? { transformToByteArray: async () => new Uint8Array(b) } : undefined }; }
    if (n === "DeleteObjectCommand") { objects.delete(cmd.input.Key); return {}; }
    throw new Error(n);
  };
  return { objects, client: { send } as never };
}

describe("S3Storage", () => {
  it("stores, reads and deletes under a prefix with server-generated keys", async () => {
    const { objects, client } = fakeS3();
    const s = new S3Storage(client, "bucket");
    const key = await s.put(Buffer.from("hello"));
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect([...objects.keys()]).toEqual([`uploads/${key}`]);
    expect((await s.get(key)).toString()).toBe("hello");
    await s.delete(key);
    expect(objects.size).toBe(0);
  });

  it("refuses keys that are not server-generated UUIDs", async () => {
    const s = new S3Storage(fakeS3().client, "bucket");
    for (const bad of ["../etc/passwd", "uploads/x", "", "a".repeat(36)]) {
      await expect(s.get(bad)).rejects.toThrow(/Invalid storage key/);
      await expect(s.delete(bad)).rejects.toThrow(/Invalid storage key/);
    }
  });
});
