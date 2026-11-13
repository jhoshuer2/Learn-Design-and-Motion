# Starter tokens

Set these first. Adapt hue and font to the brand; keep the structure.

## Type
Pairing options (all bundleable with `npm i @fontsource/<name>` or `@fontsource-variable/<name>`, so there is no third-party request at runtime):
- Display serif: **Instrument Serif** (elegant, one weight plus italic), **Fraunces** (variable, soft, warm), **Newsreader** (editorial).
- Display sans with character: **Bricolage Grotesque**, **Space Grotesk**, **Sora**.
- Text sans: **Atkinson Hyperlegible Next** (accessible), **Inter**, **Geist**, **Figtree**.

Scale (rem, 1.25 ratio at the top, tuned): 0.75, 0.875, 1, 1.25, 1.75, 2.5, 4, 6 (hero on large screens, with `clamp()`).
```css
:root {
  --font-display: "Instrument Serif", "Iowan Old Style", Georgia, serif;
  --font-text: "Atkinson Hyperlegible Next Variable", system-ui, sans-serif;
  --step-hero: clamp(2.75rem, 7vw + 0.5rem, 6rem);
  --step-h2: clamp(2rem, 3.5vw + 0.5rem, 3.5rem);
}
.display { font-family: var(--font-display); font-weight: 400; line-height: 1.02; letter-spacing: -0.02em; text-wrap: balance; }
.display em { font-style: italic; color: var(--accent-warm); }   /* one phrase, once per page */
```

## Colour (one hue family + one accent)
Neutrals tinted toward the hue; test contrast.
```css
:root {            /* light */
  --bg: #f6f4ef;    /* tinted paper */
  --surface: #ffffff;
  --ink: #16181d;
  --muted: #5b6170;
  --line: rgba(22, 24, 29, 0.10);
  --accent: #2a45f5;        /* action */
  --accent-warm: #c2410c;   /* the italic phrase; AA on --bg */
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #0b0d12; --surface: #141824; --ink: #eef0f6; --muted: #a7aec2; --line: rgba(255,255,255,0.10); --accent: #9db0ff; --accent-warm: #ffb27a; }
}
```

## Space and radius
Spacing: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160. Section padding `clamp(64px, 10vw, 160px)`.
Radii: 8 (inputs), 12 (buttons that are not pills), 20 (cards), 28 (framed windows), 999 (pills).

## Shadows (always layered)
```css
--shadow-card: 0 1px 2px rgb(16 24 40 / 0.06), 0 8px 24px -8px rgb(16 24 40 / 0.12);
--shadow-float: 0 2px 4px rgb(16 24 40 / 0.06), 0 24px 48px -12px rgb(16 24 40 / 0.22), 0 60px 120px -40px rgb(16 24 40 / 0.25);
--ring: 0 0 0 1px var(--line);
```

## Motion
Durations 120 ms (hover), 240 ms (state), 700 ms (entrance). Easing `cubic-bezier(0.2, 0.8, 0.2, 1)`. One orchestrated moment per page. Always:
```css
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```
