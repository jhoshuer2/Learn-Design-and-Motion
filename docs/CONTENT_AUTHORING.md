# Content authoring

## Layout
```
content/<discipline>/<level>/<module>/
  module.yaml            title, objectives, prerequisites, thresholds
  <lesson>.mdx           frontmatter + lesson loop blocks
  <lesson>.checks.yaml   knowledge-check questions (answers server-only)
  <assignment>.yaml      brief, deliverables, constraints, rubricRef
rubrics/<id>@<version>.yaml   immutable once published
shared/<module>/          reusable foundations referenced by many paths
```

## Lesson loop blocks
`objective`, `concept`, `demo`, `realWorld`, `goodVsBad`, `guided`, `check`, `task`, `reflection`, `feedback`. Order adapts to the topic; the outcomes do not. Every `demo`/`goodVsBad` visual must carry an explanatory caption and alt text; decorative imagery is rejected by review. Media assets declare source and licence.

## Teaching standard
No isolated definitions. A concept (e.g. contrast) is shown across contexts and the learner must recognise, explain, apply and diagnose its absence in each. The Contrast module covers: landing-page reading order, primary button visibility, type readability, grouping, brand perception, text over video, motion clarity, figure/ground, accessibility (WCAG ratios).

## Pipeline
Author → schema validation (CI) → editorial review checklist (accuracy, clarity, outcomes, difficulty, examples, a11y, licensing, assessment alignment, practical relevance) → publish script creates versioned DB rows. AI-drafted content stays `draft` until a human reviewer approves.


## Levels and capstones (M4)
`content/<discipline>/<level>/level.yaml` defines a level: `scopeLabel`, `scopeNote` (what it does and does not cover, shown to learners), `objectives`, `capstoneThreshold`, `requiredCompetencies`. Capstone assignments (`kind: CAPSTONE`) sit next to `level.yaml`; module assignments sit inside their module. The loader rejects: a required competency that is unknown or not `critical`; a capstone rubric whose threshold differs from the level's; a rubric with no criterion for a required competency, or whose criterion for it is not mandatory (the capstone could not otherwise produce evidence for it); a capstone inside a module; a non-capstone next to `level.yaml`. A published level's threshold and required competencies are immutable.
Assignment deliverables have a `key` (the upload slot), a `label`, and a `role` of `final`, `preview`, `process` or `piece`. The server derives each file's role from the assignment; clients never choose it.

## Paths authored so far (M9, M11)
Each Beginner level has two modules. **Both** modules (lessons and module assessment) must be complete before the capstone opens. The capstones were written for the first module and are unchanged, so each capstone still assesses only module-1 skills; the second module is assessed by its own module assessment, and each level's `scopeNote` says so.

| Path | Module 1 (assessment) | Module 2 (assessment, rubric) | Capstone | Required competencies |
|---|---|---|---|---|
| `graphic-design` | Understanding Contrast (High-contrast event poster) | Typography and Layout: type hierarchy and pairing, readable text settings, grids and alignment (Typographic programme, `typographic-programme@1`) | Contrast campaign (3 pieces) | accessibility-contrast |
| `brand-design` | Brand Identity Foundations (Mini brand sheet) | Imagery and Brand Layouts: image style, layout templates, voice (Imagery and layout guide, `imagery-layout-guide@1`) | Identity kit in three applications | brand-system-consistency |
| `ui-design` | Interface Hierarchy and Accessibility (One mobile screen) | Forms, Navigation and Feedback: forms, navigation, feedback and empty states (Passenger details screen, `form-screen@1`) | Three-screen booking flow | accessibility-contrast, ui-touch-targets-and-states |

Module 2 adds nine competencies (none critical, none required by a level): `type-hierarchy`, `text-readability`, `layout-grid-alignment`, `imagery-style`, `brand-layout-system`, `brand-voice`, `ui-forms`, `ui-navigation`, `ui-feedback`.

All of it is `DRAFT` and **AI-drafted without review by a working practitioner**. Each lesson carries `reviewNotes`; `tests/curriculum.test.ts` refuses to pass if a path loses them or becomes non-draft by accident.

### Rules every path must satisfy (enforced by `tests/curriculum.test.ts` and the loader)
- A level with a scope note that says what is *not* covered; a module assessment with `final` and `preview` deliverables; a capstone with three `piece` deliverables.
- Lessons in order (each lists the previous as a prerequisite), all ten loop blocks, at least five machine-scored questions of at least three types, every question tagged with a competency its lesson declares.
- Every required competency is taught in the path, is `critical`, and is measured by **exactly one** capstone criterion that is mandatory with a minimum (otherwise the level gate would depend on which criterion was written last).
- Rubrics: weights sum to 100, Strong/Adequate/Weak anchors, a rationale criterion, and wording that admits what pixels cannot show (fonts, hex values, target sizes): learners are asked to report measurements and the grader to check them for plausibility.
- A competency may be taught in several paths (skill evidence is global), but remediation and "retake" links only offer lessons from the learner's own path.

### Authoring pitfalls found while building these paths
- YAML flow lists split on commas: an option containing a comma becomes two options. The hygiene test rejects options that start lowercase; quote or rephrase.
- A `: ` inside an unquoted YAML string becomes a mapping. Quote list items and one-line `objective:` values that contain colons.
- Changing which competency a published rubric criterion measures now fails the publisher as "immutable"; bump the rubric version.

### Editorial checklist before any of this is published
Brand Design: do the lesson definitions match how working studios use *brand*, *identity*, *lockup* and *clearspace*? Are the proportions guidance and the fictional bakery brief fair for a beginner? UI Design: are the target-size (about 44 points), type-size (about 16 points) and WCAG 2.x figures current for the platforms you teach? Is a single-screen assessment a fair test of hierarchy? Both: replace generically described real-world examples with licensed ones, and calibrate the rubrics against real submissions with the real grader.
