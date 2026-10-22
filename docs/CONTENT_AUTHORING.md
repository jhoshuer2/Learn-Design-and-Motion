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
