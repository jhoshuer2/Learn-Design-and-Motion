# Calibration report (2026-10-24)

Model: claude-opus-5-5. 6 runs in 1 file(s).

| Sample | Runs ok/total | Overall mean (min-max) | Pass rate | Max criterion range | Expectations met | Mean s | Mean $ |
|---|---|---|---|---|---|---|---|
| typo-strong | 2/2 | 81.5 (81-82) | 1 | 1 | 8/8 | 63 | 0.1371 |
| typo-weak | 2/2 | 16 (15-17) | 0 | 8 | 6/6 | 52 | 0.1158 |
| imagery-strong | 1/2 | 79 (79-79) | 0 | 0 | 4/4 | 57 | 0.1341 |

## Per-criterion scores (mean, min-max across runs)

**typo-strong**: design-rationale 76 (76-76); grid-and-alignment 80 (80-80); legibility-at-small-size 80 (80-80); text-settings 87.5 (87-88); type-hierarchy 80.5 (80-81); type-pairing 84.5 (84-85)

**typo-weak**: design-rationale 12.5 (10-15); grid-and-alignment 11 (10-12); legibility-at-small-size 26 (22-30); text-settings 11 (10-12); type-hierarchy 22.5 (20-25); type-pairing 15 (15-15)

**imagery-strong**: brand-voice 84 (84-84); design-rationale 66 (66-66); image-style-rules 78 (78-78); layout-template 86 (86-86); legibility-at-small-size 78 (78-78)

## Findings

- imagery-strong: 1 of 2 runs failed (provider error or invalid output).
