import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";

describe("publisher", () => {
  beforeAll(async () => { await publishContent(db, loadContent()); });
  afterAll(async () => { await db.$disconnect(); });

  it("is idempotent", async () => {
    await publishContent(db, loadContent());
    await publishContent(db, loadContent());
    expect(await db.assignment.count({ where: { slug: "high-contrast-event-poster" } })).toBe(1);
    expect(await db.rubricVersion.count({ where: { rubric: { slug: "high-contrast-poster" } } })).toBe(1);
  });

  it("links the assignment to the published rubric version and module", async () => {
    const a = await db.assignment.findUniqueOrThrow({
      where: { slug: "high-contrast-event-poster" }, include: { rubricVersion: { include: { criteria: true } }, module: true },
    });
    expect(a.kind).toBe("MODULE_ASSESSMENT");
    expect(a.module?.slug).toBe("understanding-contrast");
    expect(a.rubricVersion.criteria).toHaveLength(6);
    expect(a.rubricVersion.threshold).toBe(80);
  });

  it("refuses to change a published rubric version", async () => {
    const c = loadContent();
    const r = c.rubrics.find((x) => x.slug === "high-contrast-poster")!;
    r.criteria[0].weight = 30;
    r.criteria[1].weight = 15; // still sums to 100, but the meaning changed
    await expect(publishContent(db, c)).rejects.toThrow(/immutable/);
  });

  it("refuses to change the mandatory minimum of a published rubric version", async () => {
    const c = loadContent();
    c.rubrics.find((x) => x.slug === "high-contrast-poster")!.criteria.find((x) => x.key === "contrast")!.minScore = 10;
    await expect(publishContent(db, c)).rejects.toThrow(/immutable/);
  });
});
