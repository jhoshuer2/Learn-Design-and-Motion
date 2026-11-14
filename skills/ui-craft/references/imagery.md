# Imagery

## Style bible (all generated art)
Soft hand-painted gouache, warm cream and terracotta palette, sage green and butter yellow accents, gentle film grain, calm editorial mood, plenty of text-safe empty space, no text, no logos, no real people or brands. One scene per image; one focal object.

## The companion
Pip: a small round copper-and-cream pebble robot, one large amber glass lens eye, tiny arms and legs, a green leaf sprout as its antenna. Always the same character: when generating new scenes, pass the approved Pip image as a reference and say "same character as the reference". Expressions come from lens glow, head tilt and leaf pose. Pip never speaks in a bubble longer than 25 words.

## Briefing an image
Name the subject, the lighting (afternoon window light), palette, camera (wide, eye-level), and which area must stay empty for text. State "no text". Generate one variation, look at it, only then regenerate once if needed (each generation costs credits).

## Pipeline
Generate at the largest size offered, download, crop to the template ratio, convert to webp quality 80 at 2400 px wide (hero) and 1200 px (cards) with `sharp`, put in `public/art/`, add width and height to every `<img>`. Keep a prompt log in `public/art/PROMPTS.md`. Alt text describes the scene in one sentence or is empty if decorative.

## Placement rules
Heroes full-bleed or framed with 28 px radius; never stretched; `object-fit: cover` with a chosen `object-position`; text over images needs a 40% cream or ink scrim or sits in the designated empty area; never place the companion over text.
