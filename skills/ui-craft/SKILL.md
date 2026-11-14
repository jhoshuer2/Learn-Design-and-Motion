---
name: ui-craft
description: Design and build calm, editorial, premium web UI - warm cream ground, large serif display type with an italic phrase, one painterly hero image per screen, a friendly illustrated companion, pill controls, hairline detail, and physical scroll and pointer motion. Use when someone asks to make a site, landing page, app screen, dashboard, lesson or onboarding flow look premium, clean, editorial, modern or "like the references", to rebuild a design system, to choose typography, layout, imagery or motion, or to audit why a UI looks cheap. Includes tokens, layout templates, an imagery brief, a motion spec, component specs, and screenshot, audit and animation frame-strip scripts for Next.js + Tailwind.
---

# UI Craft

A UI feels premium when it makes **one confident decision per screen** and repeats the same few decisions everywhere. This skill encodes that as: *one hero image, one display voice, one action, quiet everything else, and motion that feels like touching something.*

Mood anchored on: soft editorial cream with serif. Inspired by studio portfolios and product sites (floating pill nav, one subject per screen, big thin serif words over scenes, tiny tracked labels, themed micro-interactions, a warm illustrated companion). Details of what was taken from where: `references/sources.md`.

## Use it in this order
1. **Audit** the current UI: `node scripts/shoot.mjs <url>` and `node scripts/audit.mjs <url>`; look at the screenshots; write the three biggest reasons it feels cheap.
2. **Decide the screen's one thing**: the single image, the single sentence, the single action. If a screen has two, split it.
3. **Tokens first**: `references/system.md` (type, colour, space, radius, elevation, motion). Put them in CSS variables and Tailwind; no one-off values in components.
4. **Layouts**: pick from `references/layout.md` (hero, editorial section, app shell with pill dock, lesson, card grid). Do not invent new page structures.
5. **Imagery**: `references/imagery.md`. Painterly, warm, one scene per screen, text-safe space, a consistent companion character.
6. **Components and motion**: `references/components.md` and `references/motion.md`. Build the component once, use it everywhere.
7. **Critique**: `node scripts/shoot.mjs`, `node scripts/frames.mjs <url>` (animation frame strip), `node scripts/audit.mjs`. Remove one thing. Check dark mode, 390 px, keyboard focus, reduced motion, contrast.

## The ten rules
1. **One hero image per screen**, large, soft-cornered, carrying the colour. Never a screenshot of the app as decoration, never stock photos of laptops.
2. **One display voice**: a variable serif at huge size, tight leading (0.95 to 1.05), balanced wrapping, with *one* italic phrase in the accent colour per page.
3. **Tiny labels**: 11 to 12 px uppercase, wide tracking (0.14em), for kickers, captions and counters ("02 / 10"). Big against tiny is the contrast that reads as expensive.
4. **Cream ground, ink text, one accent**: paper `#f6f0e4`, ink `#1d1a16`, terracotta accent; sage and butter only inside illustrations and small chips.
5. **Pills for actions and navigation**: one filled pill per view (ink or terracotta); secondary actions are quiet text links with an underline on hover. Navigation is a floating pill dock, not a banner.
6. **Hairlines, not boxes**: 1 px lines at 12% ink, big radii (20 to 28 px) on media, almost no borders on cards (a soft shadow instead).
7. **Negative space is content**: sections 96 to 160 px apart on desktop; reading width 60 to 68 characters; never fill a gap just because it is there.
8. **A companion, not a mascot sticker**: one consistent illustrated character appears where help or feedback happens (empty states, feedback, rest screens), small, with its own voice. Never decorative repeats.
9. **Motion is physical and short**: reveals on scroll (translate 24 px + blur to sharp), image settle (scale 1.06 to 1), magnetic and lift hover on pills, themed toggles. 180 to 700 ms, ease-out-expo. Everything has a `prefers-reduced-motion` version that is instant.
10. **Honest content**: never invent logos, testimonials, user counts, ratings or press. Show true numbers or nothing. Original art only; do not imitate a named artist or copy a reference's illustration.

## Quality floor
AA contrast in light and dark, visible focus ring, 44 px touch targets, no layout shift (explicit image dimensions), images as optimised webp with `priority` only on the first one, bundled fonts (no render-blocking third party), 390 px works first, keyboard and screen reader order matches visual order, motion never hides content from assistive tech.

## Files
- `references/system.md` tokens: type, colour (light+dark), space, radius, elevation, motion.
- `references/layout.md` page templates with wireframes.
- `references/components.md` component specs and states.
- `references/imagery.md` how to brief, generate, optimise and place images; the companion character.
- `references/motion.md` interaction and scroll spec with timings and reduced-motion rules.
- `references/sources.md` what each reference contributed.
- `scripts/shoot.mjs` screenshots at 1440, 768, 390 in light and dark.
- `scripts/audit.mjs` measurable signals (type, spacing, radii, contrast, labels, image dimensions).
- `scripts/frames.mjs` records a page and writes a frame strip PNG so animation can be reviewed by eye.
