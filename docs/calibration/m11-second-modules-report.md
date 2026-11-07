# Calibration report (2026-11-07)

Model: claude-opus-5-5. 13 runs in 1 file(s).

| Sample | Runs ok/total | Overall mean (min-max) | Pass rate | Max criterion range | Expectations met | Mean s | Mean $ |
|---|---|---|---|---|---|---|---|
| typo-strong | 2/2 | 81.5 (81-82) | 1 | 1 | 8/8 | 63 | 0.1371 |
| typo-weak | 2/2 | 16 (15-17) | 0 | 8 | 6/6 | 52 | 0.1158 |
| imagery-strong | 2/3 | 78 (77-79) | 0 | 10 | 8/8 | 60 | 0.1356 |
| imagery-weak | 2/2 | 9 (9-9) | 0 | 2 | 6/6 | 35 | 0.0877 |
| form-weak | 2/2 | 13 (13-13) | 0 | 5 | 8/8 | 44 | 0.1036 |
| form-strong | 2/2 | 82 (81-83) | 1 | 4 | 8/8 | 66 | 0.1421 |

## Per-criterion scores (mean, min-max across runs)

**typo-strong**: design-rationale 76 (76-76); grid-and-alignment 80 (80-80); legibility-at-small-size 80 (80-80); text-settings 87.5 (87-88); type-hierarchy 80.5 (80-81); type-pairing 84.5 (84-85)

**typo-weak**: design-rationale 12.5 (10-15); grid-and-alignment 11 (10-12); legibility-at-small-size 26 (22-30); text-settings 11 (10-12); type-hierarchy 22.5 (20-25); type-pairing 15 (15-15)

**imagery-strong**: brand-voice 79 (74-84); design-rationale 63 (60-66); image-style-rules 79 (78-80); layout-template 85.5 (85-86); legibility-at-small-size 80 (78-82)

**imagery-weak**: brand-voice 11 (10-12); design-rationale 5 (5-5); image-style-rules 5 (5-5); layout-template 5 (5-5); legibility-at-small-size 25 (25-25)

**form-weak**: design-rationale 10 (10-10); feedback-and-recovery 11 (10-12); form-structure 22.5 (20-25); legibility-at-small-size 27.5 (25-30); navigation-clarity 0 (0-0); readable-text-and-contrast 9 (8-10); targets-and-states 10 (10-10)

**form-strong**: design-rationale 71 (70-72); feedback-and-recovery 89 (88-90); form-structure 74 (72-76); legibility-at-small-size 84.5 (84-85); navigation-clarity 90 (88-92); readable-text-and-contrast 79 (78-80); targets-and-states 82 (82-82)

## Findings

- imagery-strong: 1 of 3 runs failed (provider error or invalid output).
