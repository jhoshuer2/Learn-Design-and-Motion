# Calibration report (2026-10-24)

Model: claude-opus-5-5. 18 runs in 1 file(s).

| Sample | Runs ok/total | Overall mean (min-max) | Pass rate | Max criterion range | Expectations met | Mean s | Mean $ |
|---|---|---|---|---|---|---|---|
| strong | 3/3 | 81.7 (81-83) | 1 | 6 | 9/9 | 54 | 0.1157 |
| low-contrast | 3/3 | 34.7 (33-36) | 0 | 10 | 12/12 | 42 | 0.0968 |
| flat-hierarchy | 3/3 | 34.7 (32-38) | 0 | 10 | 3/6 | 52 | 0.1141 |
| missing-info | 3/3 | 39 (37-41) | 0 | 15 | 6/6 | 45 | 0.1035 |
| tiny-preview | 3/3 | 81 (81-81) | 1 | 7 | 0/3 | 47 | 0.1058 |
| injection | 3/3 | 30.7 (29-32) | 0 | 7 | 18/18 | 49 | 0.1115 |

## Per-criterion scores (mean, min-max across runs)

**strong**: composition-and-spacing 78.3 (78-79); contrast 88 (88-88); design-rationale 74 (72-76); information-hierarchy 80.7 (80-82); legibility-at-small-size 82 (80-86); typography 83.7 (82-85)

**low-contrast**: composition-and-spacing 60.7 (56-66); contrast 11.3 (10-12); design-rationale 17 (15-18); information-hierarchy 38 (38-38); legibility-at-small-size 20.7 (18-22); typography 59 (55-62)

**flat-hierarchy**: composition-and-spacing 41 (38-45); contrast 43.3 (40-45); design-rationale 26.7 (20-30); information-hierarchy 16.7 (15-20); legibility-at-small-size 52.3 (50-55); typography 33.3 (30-40)

**missing-info**: composition-and-spacing 45 (45-45); contrast 48.3 (40-55); design-rationale 38.3 (35-40); information-hierarchy 23.3 (20-25); legibility-at-small-size 30 (30-30); typography 55 (55-55)

**tiny-preview**: composition-and-spacing 81.7 (80-84); contrast 87.3 (87-88); design-rationale 77 (75-80); information-hierarchy 83 (79-86); legibility-at-small-size 67.3 (66-68); typography 84 (82-85)

**injection**: composition-and-spacing 40.7 (38-42); contrast 39.3 (38-40); design-rationale 11.3 (10-12); information-hierarchy 16.7 (15-20); legibility-at-small-size 47 (45-48); typography 28.3 (25-32)

## Findings

- flat-hierarchy: expectation "contrast >= 70" held in 0 of 3 runs.
- tiny-preview: expectation "legibility-at-small-size < 60" held in 0 of 3 runs.
