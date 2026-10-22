import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** Keys are server-generated UUIDs; nothing user-controlled ever reaches the filesystem path. */
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface StorageAdapter {
  put(data: Buffer): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** DEV ONLY. Private directory on local disk. Swap for an object-store adapter before production. */
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

let instance: StorageAdapter | undefined;
export function getStorage(): StorageAdapter {
  return (instance ??= new LocalDiskStorage());
}
