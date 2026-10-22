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
