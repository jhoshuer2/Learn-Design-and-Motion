# Layout recipes

Pick one hero recipe per page. Examples use Tailwind classes; adapt tokens from `tokens.md`. Matching components are in `assets/`.

## 1. Serif hero + framed product window (default)
```
            [ small eyebrow or proof line ]
      Big serif headline with an *italic phrase*
        one sentence of support, max 60 ch
              [ Primary pill ]  secondary link
   ┌──────────────────────────────────────────┐
   │ ● ● ●   app window (real screenshot)     │  ← overlaps the backdrop,
   │                                          │    floats with --shadow-float
   └──────────────────────────────────────────┘
        quiet proof strip (true facts only)
```
- Centre the text block (max-w 48rem), headline `--step-hero`, balance wrapping.
- The window: `rounded-[28px] border border-line bg-surface shadow-[var(--shadow-float)]`, a thin bar with three dots, the screenshot below it; width up to 72rem; `-mb-24` so it overlaps the next section.
- Backdrop: a soft gradient or an illustrated scene (recipe 2) behind the lower half.

## 2. Illustrated-scene hero
A full-bleed SVG scene (sky gradient, layered hills or mesa, one sun, a trail) in one hue family; the headline sits on the sky, the framed window overlaps the foreground. Draw it with `illustration-kit.md`. Keep the scene's palette and the UI palette in the same family (Pave) or contrast them on purpose (Tenure).

## 3. Dark glow hero
Near-black ground, left-aligned white headline with a gradient on the second line, a small pill CTA, and floating cards in perspective connected by glowing lines (SVG paths with blur). One glow colour only.
```css
.glow { background: radial-gradient(60% 50% at 70% 40%, rgb(255 80 120 / .25), transparent 70%); }
.card3d { transform: perspective(1200px) rotateX(55deg) rotateZ(-25deg); }
```

## 4. Split sign-in with an illustration panel
Left: greeting in the brand's voice, provider buttons (if any), fields with visible labels, one primary button, a quiet legal line. Right: the brand world as an illustration (hidden below 900 px or shown above the form). Keep the form fully usable and unchanged in structure.

## 5. Stat and bento cards
Four to six cards of unequal size: one with a screenshot, one with a phone, one with a big numeral ("12" lessons, "3 min" warm-up), one colour block with a short promise. Big numeral 3.5 to 5 rem, tiny label under it. **Only true numbers.**

## 6. Proof strip
A single quiet row under the hero: logos only if they are real customers with permission; otherwise facts ("6 short lessons, 1 real project, feedback on your own work") in small muted type, separated by space not dots.

## Navigation
Slim, transparent top bar: wordmark left, three or four small links, one pill on the right. No heavy borders; a 1 px line appears after scrolling.
