# Design system (original, editorial, restrained)

## Principles
Minimal but not empty; strong typographic hierarchy; generous spacing; learner work and instructional visuals carry the richness; subtle purposeful motion; no gamified badges, leaderboards, glassmorphism or card-everywhere layouts.

## Tokens (initial)
- Type: a serif display face for headings (editorial), a neutral sans for UI and body; measure 60-75ch for lessons; scale 1.25.
- Colour: warm off-white surface, near-black ink, one accent; semantic state colours that never rely on colour alone (icon + label). All text pairs ≥ 4.5:1 (large 3:1), focus rings ≥ 3:1.
- Space: 4px base, 8-point rhythm. Radius small. Motion ≤ 200ms, respects `prefers-reduced-motion`.

## States
Locked (shows the prerequisite), Active, Completed, Needs work / Failed (shows why and the retry path), Awaiting evaluation.

## Priority screens (of the 20 in the brief)
1 Landing · 2 Onboarding/goal · 3 Placement · 4 Dashboard (where am I / what next / what to improve) · 5 Course overview + path timeline · 6 Lesson workspace · 7 Quiz · 8 Assignment brief · 9 Submission · 10 Evaluation results · 11 Level complete. Then portfolio, peer review, skill profile, recommendations, admin.

## Accessibility and responsive
WCAG 2.1 AA, keyboard-complete, semantic landmarks, captions/transcripts for video, alt text required by content schema. Lessons, quizzes, progress and feedback fully usable on mobile; submission workspace desktop-first.
