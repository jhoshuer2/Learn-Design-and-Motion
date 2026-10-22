import { afterAll, afterEach, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { clientKey, hit, limitViewer, purgeExpired } from "../src/lib/ratelimit";

afterEach(async () => { await db.rateBucket.deleteMany({}); delete process.env.TRUST_PROXY; });
afterAll(async () => { await db.$disconnect(); });
const L = (max: number) => ({ bucket: "t", max, windowMs: 60_000 });

describe("rate limiting", () => {
  it("allows up to the limit then refuses, with a retry hint", async () => {
    const now = new Date("2030-01-01T00:00:10Z");
    const r = [];
    for (let i = 0; i < 4; i++) r.push(await hit("c", L(3), now));
    expect(r.map((x) => x.allowed)).toEqual([true, true, true, false]);
    expect(r[3].retryAfterSec).toBe(50);
  });
  it("counts correctly under concurrency", async () => {
    const now = new Date("2030-01-01T00:00:10Z");
    const rs = await Promise.all(Array.from({ length: 20 }, () => hit("c", L(5), now)));
    expect(rs.filter((x) => x.allowed)).toHaveLength(5);
    expect(Math.max(...rs.map((x) => x.count))).toBe(20);
  });
  it("starts fresh in the next window and keeps subjects apart", async () => {
    await hit("a", L(1), new Date("2030-01-01T00:00:10Z"));
    expect((await hit("a", L(1), new Date("2030-01-01T00:00:20Z"))).allowed).toBe(false);
    expect((await hit("b", L(1), new Date("2030-01-01T00:00:20Z"))).allowed).toBe(true);
    expect((await hit("a", L(1), new Date("2030-01-01T00:01:05Z"))).allowed).toBe(true);
  });
  it("hashes the client and only trusts x-forwarded-for when told to", async () => {
    const h = (ip: string) => new Headers({ "x-forwarded-for": ip });
    expect(clientKey(h("1.2.3.4"))).toBe(clientKey(h("9.9.9.9"))); // not believed: one shared bucket
    process.env.TRUST_PROXY = "true";
    expect(clientKey(h("1.2.3.4"))).not.toBe(clientKey(h("9.9.9.9")));
    expect(clientKey(h("1.2.3.4, 10.0.0.1"))).toBe(clientKey(h("1.2.3.4")));
    await limitViewer("page", h("1.2.3.4"));
    const ids = (await db.rateBucket.findMany()).map((b) => b.id).join(" ");
    expect(ids).not.toContain("1.2.3.4");
  });
  it("signed-in viewers use their own, larger bucket", async () => {
    process.env.RATE_PAGE_ANON_PER_MIN = "1";
    try {
      expect((await limitViewer("page", new Headers())).allowed).toBe(true);
      expect((await limitViewer("page", new Headers())).allowed).toBe(false);
      expect((await limitViewer("page", new Headers(), "user-1")).allowed).toBe(true);
    } finally { delete process.env.RATE_PAGE_ANON_PER_MIN; }
  });
  it("purges expired buckets only", async () => {
    await hit("old", L(1), new Date("2020-01-01T00:00:00Z"));
    await hit("new", L(1), new Date(Date.now() + 3_600_000));
    expect(await purgeExpired()).toBe(1);
    expect(await db.rateBucket.count()).toBe(1);
  });
});
