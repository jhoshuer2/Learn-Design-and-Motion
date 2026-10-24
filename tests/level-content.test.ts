import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { loadContent } from "../src/lib/content/loader";
import { publishContent } from "../src/lib/content/publish";

const SRC = path.join(process.cwd(), "content");

/** Copy the real content to a temp dir, apply an edit, and load it. */
function withEdit(edit: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cm-content-"));
  fs.cpSync(SRC, root, { recursive: true });
  edit(root);
  return () => loadContent(root);
}
const levelFile = (r: string) => path.join(r, "graphic-design/beginner/level.yaml");
const capFile = (r: string) => path.join(r, "graphic-design/beginner/campaign.assignment.yaml");
const rubricFile = (r: string) => path.join(r, "rubrics/contrast-campaign-capstone.yaml");
const edit = (f: string, fn: (o: any) => void) => { const o = YAML.parse(fs.readFileSync(f, "utf8")); fn(o); fs.writeFileSync(f, YAML.stringify(o)); };

describe("level and capstone content", () => {
  const c = loadContent();
  const lv = c.levels.find((l) => l.def.path === "graphic-design")!;

  it("loads the Beginner level with its rules and capstone", () => {
    expect(lv.def).toMatchObject({ tier: "BEGINNER", capstoneThreshold: 85, requiredCompetencies: ["accessibility-contrast"] });
    expect(lv.capstones.map((a) => a.slug)).toEqual(["contrast-campaign-capstone"]);
    expect(lv.capstones[0].deliverables.filter((d) => d.required).map((d) => d.key)).toEqual(["poster", "social-square", "banner"]);
  });

  it("states honestly what the level does and does not cover", () => {
    expect(lv.def.scopeNote).toMatch(/does not show mastery of the full Beginner curriculum/);
  });

  it("makes the required competency measurable and mandatory in the capstone rubric", () => {
    const r = c.rubrics.find((x) => x.slug === "contrast-campaign-capstone")!;
    const cr = r.criteria.find((x) => x.competency === "accessibility-contrast")!;
    expect(cr).toMatchObject({ mandatory: true, minScore: 60 });
    expect(r.criteria.reduce((n, x) => n + x.weight, 0)).toBe(100);
  });

  it("rejects a required competency that is not critical", () => {
    expect(withEdit((r) => edit(levelFile(r), (o) => { o.requiredCompetencies = ["contrast-recognition"]; }))).toThrow(/must be marked critical/);
  });

  it("rejects an unknown required competency", () => {
    expect(withEdit((r) => edit(levelFile(r), (o) => { o.requiredCompetencies = ["nonsense"]; }))).toThrow(/does not exist/);
  });

  it("rejects a rubric threshold that differs from the level's", () => {
    expect(withEdit((r) => edit(rubricFile(r), (o) => { o.threshold = 70; }))).toThrow(/must equal the level capstoneThreshold/);
  });

  it("rejects a capstone rubric that cannot produce evidence for a required competency", () => {
    expect(withEdit((r) => edit(rubricFile(r), (o) => { for (const k of o.criteria) if (k.competency === "accessibility-contrast") delete k.competency; }))).toThrow(/no criterion for required competency/);
  });

  it("rejects a non-mandatory criterion for a required competency", () => {
    expect(withEdit((r) => edit(rubricFile(r), (o) => { for (const k of o.criteria) if (k.competency === "accessibility-contrast") { delete k.mandatory; delete k.minScore; } }))).toThrow(/must be mandatory/);
  });

  it("rejects a required competency measured by more than one criterion", () => {
    expect(withEdit((r) => edit(rubricFile(r), (o) => { o.criteria.find((k: any) => k.key === "typography").competency = "accessibility-contrast"; }))).toThrow(/exactly one criterion/);
  });

  it("rejects a non-capstone next to level.yaml, and a capstone inside a module", () => {
    expect(withEdit((r) => edit(capFile(r), (o) => { o.kind = "MODULE_ASSESSMENT"; }))).toThrow(/must be CAPSTONE/);
    expect(withEdit((r) => {
      const modDir = path.join(r, "graphic-design/beginner/visual-foundations/contrast");
      edit(path.join(modDir, "high-contrast-poster.assignment.yaml"), (o) => { o.kind = "CAPSTONE"; });
    })).toThrow(/belong next to level.yaml/);
  });

  it("allows legacy content with no level.yaml at all, but not a module whose level is missing when others exist", () => {
    expect(withEdit((r) => { for (const p of ["graphic-design", "brand-design", "ui-design"]) fs.rmSync(path.join(r, p, "beginner/level.yaml"), { force: true }); })()).toMatchObject({ levels: [] });
    expect(withEdit((r) => edit(levelFile(r), (o) => { o.tier = "INTERMEDIATE"; }))).toThrow(/no level.yaml for/);
  });
});

describe("level and capstone publishing", () => {
  beforeAll(async () => { process.env.CONTENT_PREVIEW = "true"; await publishContent(db, loadContent()); });
  afterAll(async () => { await db.$disconnect(); });

  it("publishes level rules and the capstone, idempotently", async () => {
    await publishContent(db, loadContent());
    const level = await db.level.findFirstOrThrow({ where: { tier: "BEGINNER", path: { slug: "graphic-design" } }, include: { assignments: true } });
    expect(level).toMatchObject({ capstoneThreshold: 85, scopeLabel: "Contrast foundations", requiredCompetencies: ["accessibility-contrast"] });
    const cap = level.assignments.filter((a) => a.kind === "CAPSTONE");
    expect(cap).toHaveLength(1);
    expect(cap[0]).toMatchObject({ slug: "contrast-campaign-capstone", moduleId: null, maxAttempts: 3 });
    expect(level.assignments.filter((a) => a.kind === "MODULE_ASSESSMENT")).toHaveLength(2);
  });

  it("refuses to change a published level's threshold or required competencies", async () => {
    const level = await db.level.findFirstOrThrow({ where: { tier: "BEGINNER", path: { slug: "graphic-design" } } });
    await db.level.update({ where: { id: level.id }, data: { status: "PUBLISHED" } });
    try {
      const c = loadContent();
      c.levels.find((l) => l.def.path === "graphic-design")!.def.requiredCompetencies = [];
      await expect(publishContent(db, c)).rejects.toThrow(/immutable/);
    } finally {
      await db.level.update({ where: { id: level.id }, data: { status: "DRAFT" } });
    }
  });
});
