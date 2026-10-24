# Calibration report (2026-10-24)

Model: claude-opus-5-5. 10 runs in 3 file(s).

| Sample | Runs ok/total | Overall mean (min-max) | Pass rate | Max criterion range | Expectations met | Mean s | Mean $ |
|---|---|---|---|---|---|---|---|
| campaign-consistent | 1/1 | 74 (74-74) | 0 | 0 | 3/3 | 57 | 0.1238 |
| campaign-inconsistent | 1/1 | 22 (22-22) | 0 | 0 | 3/3 | 53 | 0.1176 |
| brand-strong | 2/2 | 69.5 (69-70) | 0 | 5 | 4/8 | 66 | 0.1477 |
| brand-illegible | 2/2 | 34.5 (34-35) | 0 | 7 | 6/6 | 55 | 0.1245 |
| ui-strong | 2/2 | 86.5 (86-87) | 1 | 4 | 8/8 | 52 | 0.1181 |
| ui-weak-targets | 2/2 | 18.5 (18-19) | 0 | 7 | 6/6 | 47 | 0.1083 |

## Per-criterion scores (mean, min-max across runs)

**campaign-consistent**: accessible-contrast 86 (86-86); campaign-hierarchy 64 (64-64); consistency-across-pieces 76 (76-76); contrast 80 (80-80); design-rationale 60 (60-60); legibility-across-formats 80 (80-80); typography 64 (64-64)

**campaign-inconsistent**: accessible-contrast 18 (18-18); campaign-hierarchy 35 (35-35); consistency-across-pieces 15 (15-15); contrast 30 (30-30); design-rationale 12 (12-12); legibility-across-formats 8 (8-8); typography 30 (30-30)

**brand-strong**: brief-fit 71 (70-72); colour-system 63 (62-64); design-rationale 57.5 (55-60); legibility-at-small-size 71 (70-72); logo-and-lockup 75.5 (74-77); type-system 76 (76-76)

**brand-illegible**: brief-fit 41.5 (38-45); colour-system 27.5 (25-30); design-rationale 15 (15-15); legibility-at-small-size 32.5 (30-35); logo-and-lockup 41 (40-42); type-system 45 (45-45)

**ui-strong**: design-rationale 87 (87-87); hierarchy-and-layout 89 (89-89); legibility-at-small-size 86.5 (85-88); readable-text-and-contrast 80 (78-82); spacing-and-grouping 86.5 (85-88); targets-and-states 90 (90-90)

**ui-weak-targets**: design-rationale 11 (10-12); hierarchy-and-layout 26.5 (25-28); legibility-at-small-size 18.5 (15-22); readable-text-and-contrast 12.5 (10-15); spacing-and-grouping 32.5 (30-35); targets-and-states 11 (10-12)

## Findings

- brand-strong: expectation "passes" held in 0 of 2 runs.
- brand-strong: expectation "colour-system >= 70" held in 0 of 2 runs.
