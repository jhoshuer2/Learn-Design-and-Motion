# Drawing original scenes in code

Premium pages lean on an illustrated world. Make yours original, light and consistent: SVG drawn in code, one hue family plus one accent, depth by layers.

## Rules
- **Original only.** Do not trace, recreate or imitate a specific artist's piece. Reference *techniques* (layered hills, flat gradients), not compositions.
- **One world.** Sky gradient + 3 to 5 layers (far to near, each darker or more saturated) + one focal object + one accent. No outlines, flat fills with gentle gradients.
- **Meaning, not clutter.** The scene should echo the product idea (a trail of milestones for a learning path; a river for a flow of work).
- **Accessibility.** Decorative scenes are `aria-hidden`; text never sits on busy areas; keep contrast AA behind any text.

## Recipe: layered landscape (about 80 lines)
```tsx
export function Landscape() {
  return (
    <svg viewBox="0 0 1440 720" preserveAspectRatio="xMidYMax slice" aria-hidden className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8fb8ff"/><stop offset="1" stopColor="#ffe3c7"/></linearGradient>
        <radialGradient id="sun"><stop offset="0" stopColor="#fff6dc"/><stop offset="1" stopColor="#fff6dc" stopOpacity="0"/></radialGradient>
      </defs>
      <rect width="1440" height="720" fill="url(#sky)"/>
      <circle cx="1080" cy="260" r="220" fill="url(#sun)"/>
      <path d="M0 520 C 240 430 420 470 640 420 S 1080 380 1440 450 V720 H0Z" fill="#7da0e8" opacity=".55"/>
      <path d="M0 580 C 200 520 460 560 700 510 S 1160 500 1440 560 V720 H0Z" fill="#4f6fd1"/>
      <path d="M0 650 C 260 600 520 640 760 600 S 1180 590 1440 640 V720 H0Z" fill="#2b3f99"/>
    </svg>
  );
}
```
Add a focal object (a path of diamonds, a tent, a house, a tree built from circles and triangles) and one accent colour.

## Recipe: isometric blocks
Projection: `x' = (x − y)·cos30°`, `y' = (x + y)·0.5 − z`. Draw each block as three polygons (top, left, right) with three tints of one colour; add a soft ground shadow ellipse.

## Preview before you ship
Render to PNG and look: `npx playwright screenshot` on a page that embeds the SVG, or `sharp(Buffer.from(svg)).png()`. Check: reads at 390 px, no muddy overlaps, text contrast over it, still good in dark mode (use a darker variant, not a filter).
