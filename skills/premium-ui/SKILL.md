---
name: premium-ui
description: Make a product's UI look premium and finished, in the style of studio-grade landing pages (big serif headlines with an italic accent phrase, a framed product mockup as the hero over a rich illustrated or dark backdrop, stat cards, quiet navigation, layered soft shadows). Use whenever someone asks to make a site, landing page, hero, sign-in screen, dashboard or app screen look premium, expensive, polished, modern or "like Stripe, Linear, Lovable or Pave", or asks to audit or redesign a UI for visual quality. Includes an audit checklist, layout recipes, design tokens, an illustration kit, screenshot and audit scripts, and Next.js + Tailwind example components.
---

# Premium UI

"Premium" is not decoration. It is **confidence made visible**: one clear idea, a hero that shows the real product, type with a point of view, generous space, and the same few choices repeated everywhere. This skill turns that into a process you can run on any UI.

Source material: six studio landing pages (Crest, Tenure, Pave, Ember, Lovable, Plait). See `references/traits.md` for what each does and what transfers.

## When to use it
Any request to raise the visual quality of a page or app: landing pages, hero sections, sign-in screens, dashboards, pricing, onboarding. Also for audits ("why does this look cheap?").

## The process (do all five, in order)

1. **Audit.** Screenshot the real UI (`scripts/shoot.mjs`), run `scripts/audit.mjs`, and score it against `references/audit-checklist.md`. Name the three biggest reasons it feels cheap before touching code. Keep the before screenshots.
2. **Concept.** Write one sentence: *what does this product let someone become or make?* Pick the **hero recipe** from `references/recipes.md` that shows it best (framed product window, illustrated scene, dark glow, split sign-in). Decide the single **world** (one hue family + one accent) the page lives in.
3. **Tokens.** Set type, colour, radius, shadow, spacing and motion from `references/tokens.md` *before* building. Fewer choices, applied everywhere.
4. **Build.** Use the recipes and `assets/` examples. Work top-down: hero first, then rhythm of sections, then details (borders, shadows, icons, microcopy). Draw any illustration in code with `references/illustration-kit.md` and look at a render before using it.
5. **Critique.** Re-shoot, compare with the before shots, rerun the audit, fix the biggest remaining gap. Take one thing away (the "mirror" rule). Check dark mode, 390 px wide, keyboard focus, reduced motion and contrast.

## The eight traits (rules, not suggestions)

1. **One display voice.** A large serif (or equally characterful) headline, tight leading, balanced line breaks, at most one coloured, italic *phrase* that carries the benefit, once per page. Body in a clean, readable sans.
2. **Show the product.** The hero's main image is the real UI in a floating, framed window or phone, slightly larger than feels safe, overlapping the backdrop. Never a stock photo of people at laptops.
3. **One world.** A single illustrated, photographic or dark backdrop in one hue family plus one accent. Depth by layers, not by many colours.
4. **Space is the luxury.** Big vertical rhythm (96 to 160 px between major sections on desktop), centred or strongly left-aligned compositions, short line lengths (45 to 75 characters).
5. **Quiet chrome.** Thin nav, small type, pill CTAs (one primary per view), 1 px borders, no heavy outlines.
6. **Layered depth.** Soft multi-layer shadows, subtle gradients, consistent radii (one scale), glass or blur only where it separates layers.
7. **Numbers as design.** Big numerals in cards (stat cards, progress, scores) with a tiny label, using **true** values only.
8. **Restraint and motion.** One orchestrated motion moment on load or scroll, tasteful hover states, `prefers-reduced-motion` honoured. Nothing bounces for its own sake.

## Honesty rules (non-negotiable)
- **Never invent proof**: no fake logos, testimonials, ratings, user counts or press quotes. Use true proof (what the product does, real numbers, real screens) or leave the strip out.
- **Original art only**: draw illustrations yourself in code or use licensed assets. Do not trace or imitate a specific artist's piece.
- Screens shown in mockups must be real states of the product (seeded demo data is fine and should look like plausible, not exaggerated, use).

## Working with an existing design system
Keep the system's names and tokens; change values, scale and composition. If the project has its own rules (for example "no italics" or a brand typeface), the project wins and you adapt the recipe. If another design skill advises against a trait (for example accenting a headline phrase), say so and follow the user's brief, which wins.

## Quality floor (always)
Responsive to 390 px, visible keyboard focus, AA contrast, readable at small sizes, reduced motion respected, no layout shift from fonts or images, images optimised and lazy below the fold, bundled fonts (no render-blocking third-party font requests).

## Files
- `references/traits.md`: what the six reference sites do and the principle behind each.
- `references/recipes.md`: six layout recipes with wireframes and Tailwind/CSS.
- `references/tokens.md`: starter tokens, light and dark.
- `references/illustration-kit.md`: draw original layered SVG scenes in code.
- `references/audit-checklist.md`: the 25-point scored audit and fix order.
- `scripts/shoot.mjs`: screenshots at 1440, 768, 390 in light and dark.
- `scripts/audit.mjs`: measures type, spacing, contrast, images and accessibility and prints a report.
- `assets/`: Next.js + Tailwind examples (`FramedWindow`, `SerifHeadline`, `StatCard`, `SceneBackdrop`).
