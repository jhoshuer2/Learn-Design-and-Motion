import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/** Keys are server-generated UUIDs; nothing user-controlled ever reaches the filesystem path. */
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface StorageAdapter {
  put(data: Buffer): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** DEV ONLY. Private directory on local disk. Production uses S3Storage (set S3_BUCKET). */
export class LocalDiskStorage implements StorageAdapter {
  constructor(private root = path.resolve(process.env.UPLOAD_DIR ?? ".data/uploads")) {}

  private file(key: string) {
    if (!KEY.test(key)) throw new Error("Invalid storage key");
    return path.join(this.root, key);
  }

  async put(data: Buffer) {
    await fs.mkdir(this.root, { recursive: true });
    const key = randomUUID();
    await fs.writeFile(this.file(key), data, { flag: "wx", mode: 0o600 });
    return key;
  }

  async get(key: string) {
    return fs.readFile(this.file(key));
  }

  async delete(key: string) {
    await fs.rm(this.file(key), { force: true });
  }
}

/**
 * Private S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, MinIO). Objects are never public: every read goes
 * through the app's own access checks. Keys are the same server-generated UUIDs as on disk.
 */
export class S3Storage implements StorageAdapter {
  constructor(private client: Pick<S3Client, "send">, private bucket: string, private prefix = "uploads/") {}

  private key(key: string) {
    if (!KEY.test(key)) throw new Error("Invalid storage key");
    return `${this.prefix}${key}`;
  }

  async put(data: Buffer) {
    const key = randomUUID();
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: this.key(key), Body: data, ContentType: "application/octet-stream" }));
    return key;
  }

  async get(key: string) {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key(key) }));
    if (!out.Body) throw new Error("Empty storage object");
    return Buffer.from(await out.Body.transformToByteArray());
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(key) }));
  }
}

function fromEnv(): StorageAdapter {
  const bucket = process.env.S3_BUCKET;
  if (bucket) {
    const client = new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } : undefined,
    });
    return new S3Storage(client, bucket, process.env.S3_PREFIX ?? "uploads/");
  }
  // A serverless host has a read-only, throwaway filesystem: fail clearly instead of losing uploads.
  if (process.env.VERCEL) throw new Error("Uploads need object storage on Vercel: set S3_BUCKET (and S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION, S3_ENDPOINT).");
  return new LocalDiskStorage();
}

let instance: StorageAdapter | undefined;
export function getStorage(): StorageAdapter {
  return (instance ??= fromEnv());
}
