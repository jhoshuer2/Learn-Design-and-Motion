import { describe, expect, it } from "vitest";
import { loadContent } from "../src/lib/content/loader";
import { MACHINE_SCORED } from "../src/lib/progression/scoring";

/** Properties every authored path must have, so adding a path cannot quietly skip them. */
const c = loadContent();
const PATHS = [...new Set(c.levels.map((l) => l.def.path))].sort();

describe("authored curriculum", () => {
  it("has the three MVP disciplines, each with a Beginner level", () => {
    expect(PATHS).toEqual(["brand-design", "graphic-design", "ui-design"]);
    for (const p of PATHS) expect(c.levels.some((l) => l.def.path === p && l.def.tier === "BEGINNER"), p).toBe(true);
  });

  describe.each(PATHS)("%s", (path) => {
    const level = c.levels.find((l) => l.def.path === path && l.def.tier === "BEGINNER")!;
    const modules = c.modules.filter((m) => m.def.path === path);
    const rubric = (a: { rubric: { slug: string; version: number } }) => c.rubrics.find((r) => r.slug === a.rubric.slug && r.version === a.rubric.version)!;

    it("is all DRAFT, so it is only shown with CONTENT_PREVIEW and never presented as reviewed", () => {
      expect(level.def.status).toBe("DRAFT");
      for (const m of modules) {
        expect(m.def.status).toBe("DRAFT");
        for (const l of m.lessons) {
          expect(l.meta.status, l.meta.slug).toBe("DRAFT");
          expect(l.meta.reviewNotes, `${l.meta.slug} needs editorial reviewNotes`).toBeTruthy();
        }
        for (const a of [...m.assignments, ...level.capstones]) expect(a.status, a.slug).toBe("DRAFT");
      }
    });

    it("tells the learner honestly what the level does not cover", () => {
      expect(level.def.scopeNote).toMatch(/not (show|written)/i);
    });

    it("has a module assessment with final and preview, and a three-piece capstone", () => {
      for (const m of modules) {
        const ma = m.assignments.filter((a) => a.kind === "MODULE_ASSESSMENT");
        expect(ma, m.def.slug).toHaveLength(1);
        expect(ma[0].deliverables.filter((d) => d.required).map((d) => d.role)).toEqual(expect.arrayContaining(["final", "preview"]));
      }
      expect(level.capstones).toHaveLength(1);
      expect(level.capstones[0].deliverables.filter((d) => d.required && d.role === "piece")).toHaveLength(3);
    });

    it("sequences lessons with prerequisites and tests every lesson's competencies", () => {
      for (const m of modules) {
        m.lessons.forEach((l, i) => {
          if (i > 0) expect(l.meta.prerequisites, l.meta.slug).toContain(m.lessons[i - 1].meta.slug);
          expect(l.meta.competencies.length, l.meta.slug).toBeGreaterThan(0);
          expect(l.questions.length, l.meta.slug).toBeGreaterThanOrEqual(5);
          for (const q of l.questions) {
            expect(MACHINE_SCORED as readonly string[], `${l.meta.slug}: ${q.prompt}`).toContain(q.type);
            expect(q.competency, `${l.meta.slug}: ${q.prompt}`).toBeTruthy();
            expect(l.meta.competencies, `${l.meta.slug}: question competency ${q.competency} not declared by the lesson`).toContain(q.competency);
          }
          expect(new Set(l.questions.map((q) => q.type)).size, `${l.meta.slug}: mix question types`).toBeGreaterThanOrEqual(3);
        });
      }
    });

    it("teaches every required competency in a lesson, and makes it a mandatory capstone criterion", () => {
      const taught = new Set(modules.flatMap((m) => m.lessons.flatMap((l) => l.meta.competencies)));
      const r = rubric(level.capstones[0]);
      for (const req of level.def.requiredCompetencies) {
        expect(taught.has(req), `${req} must be taught in this path`).toBe(true);
        expect(r.criteria.some((cr) => cr.competency === req && cr.mandatory && (cr.minScore ?? 0) >= 60), req).toBe(true);
      }
    });

    it("uses rubrics with weights summing to 100, anchors, and a rationale criterion", () => {
      for (const a of [...modules.flatMap((m) => m.assignments), ...level.capstones]) {
        const r = rubric(a);
        expect(r.criteria.reduce((n, x) => n + x.weight, 0), a.slug).toBe(100);
        for (const cr of r.criteria) expect(cr.description, `${a.slug}/${cr.key}`).toMatch(/Strong \(85-100\)/);
        expect(r.criteria.some((cr) => /rationale/i.test(cr.title)), a.slug).toBe(true);
        expect(a.requirements.some((x) => /rationale/i.test(x)), `${a.slug} requires a rationale`).toBe(true);
      }
    });

    it("states things pixels cannot show, rather than pretending to measure them", () => {
      for (const a of [...modules.flatMap((m) => m.assignments), ...level.capstones]) {
        const text = JSON.stringify(rubric(a));
        expect(text, a.slug).toMatch(/cannot (measure|identify)|judge what is visible|Judge only what/i);
      }
    });
  });
});
