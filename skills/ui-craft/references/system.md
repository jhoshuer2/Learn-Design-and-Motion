# System tokens

## Type
Fonts (bundled via `@fontsource-variable`): **Fraunces** (display, with italic and optical size) and **Instrument Sans** (UI and reading).
| Role | Size (desktop / phone) | Leading | Notes |
|---|---|---|---|
| Display XL | clamp(3.75rem, 10vw, 8.5rem) | 0.94 | hero only, weight 300 to 400, letter-spacing -0.03em |
| Display L | clamp(2.75rem, 6vw, 5rem) | 1.0 | page titles |
| Display M | clamp(2rem, 4vw, 3.25rem) | 1.05 | section titles |
| Title | 1.5rem | 1.2 | card titles, Fraunces 400 |
| Body L | 1.1875rem (19px) | 1.6 | intros |
| Body | 1.0625rem (17px) | 1.6 | reading |
| Small | 0.9375rem (15px) | 1.5 | secondary |
| Label | 0.72rem (11.5px) | 1.2 | uppercase, tracking 0.14em, weight 600 |
Italic accent: `em` inside display type is italic, accent colour, never bold. Use `text-wrap: balance` on headings and `pretty` on paragraphs.

## Colour
Light (paper): `--paper #f6f0e4`, `--paper-2 #efe6d4` (sunken), `--card #fbf7ee`, `--ink #1d1a16`, `--ink-2 #4a443b` (secondary text), `--ink-3 #6b6355` (tertiary, 5:1 on paper), `--line rgb(29 26 22 / .12)`, `--accent #b4431f` (text and fills, AA with paper and white), `--accent-soft #f1d9cb`, `--sage #2f4a3a`, `--butter #f2c96b`, `--ok #2f6b4a`, `--warn #8a5a00`, `--danger #a8321f`.
Dark (lamp-lit): `--paper #17130f`, `--paper-2 #110e0b`, `--card #211c17`, `--ink #f4ecdd`, `--ink-2 #cbbfae`, `--ink-3 #a89c8a`, `--line rgb(244 236 221 / .14)`, `--accent #ff9a6c`, `--accent-soft #3a2418`.
Rules: accent used for one link style, the italic phrase, the primary pill. Status uses text and icon plus colour, never colour alone.

## Space, radius, elevation
- 4 px base, scale 4 8 12 16 24 32 48 64 96 128 160. Section gap 96 to 160, card padding 24 to 32, content width 1200, reading width 38rem.
- Radius: pill 999px, media 28px, card 20px, input 14px, chip 999px. Nothing else.
- Elevation: `--shadow-1: 0 1px 2px rgb(60 40 10 / .06), 0 8px 24px -12px rgb(60 40 10 / .18)`; `--shadow-2: 0 2px 4px rgb(60 40 10 / .06), 0 24px 60px -20px rgb(60 40 10 / .28)`. Dark: swap rgb for 0 0 0 at higher alpha.
- Grain: 3 to 4% noise overlay on the hero image only (SVG feTurbulence or a tiled png), never over text.

## Motion tokens
`--ease: cubic-bezier(.16,1,.3,1)` (out-expo), `--ease-io: cubic-bezier(.65,0,.35,1)`; durations `--t-fast 180ms`, `--t-med 320ms`, `--t-slow 700ms`, `--t-hero 1400ms`.
