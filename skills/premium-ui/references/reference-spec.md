# Reference spec: colour, type, spacing and layout of the six pages

Measured from frames of the ToastyDesigns reel (Crest, Tenure, Pave, Ember, Lovable, Plait). Hex values are sampled or eyeballed from video frames, so treat them as starting points, not brand truth. The shared formula is the point.

## The formula (all six follow it)
1. **A warm or deep ground**, never cool grey. Cream `#faf5ed` to `#fbf4ec` (Ember, Plait, Pave's cards), near-white with a warm cast (Crest, Pave), or true black (Lovable), or a saturated sky-blue scene as the whole first screen (Tenure).
2. **One saturated world per brand**, painted as a full-width scene or a product tile colour, never a faint tint:
   | Page | Ground | World colours | CTA |
   |---|---|---|---|
   | Tenure | sky blue `#0d69e5` to `#109df5` to `#19dbda` | pine green, coral and orange autumn trees | white pill, dark text |
   | Pave | white | mesa orange `#e7c3a6` to rust `#6e2e18`, dark app cards | solid amber pill |
   | Ember | cream `#faf5ed` | meadow `#73be50` to `#afd661`, deep red tent | amber/orange pill `#e8a33a`, full width in forms |
   | Plait | cream `#fbf4ec` | deep forest green, coral `#f0654c`, butter yellow | deep green pill, white text |
   | Crest | warm white | tomato red, cream isometric blocks | tomato red pill |
   | Lovable | black | coral to magenta gradient glow | coral pill |
3. **Headline**: a high-contrast serif (Instrument Serif, Fraunces or similar) at 56 to 88 px desktop, two lines, leading about 1.0 to 1.05, centred. Line two (or the last phrase) is **italic and in the accent colour** (Pave: "sleep better at night.", Plait: "Know your day.", Crest: "Serious."). Sans is used for everything else, small and quiet.
4. **Sub-line**: 16 to 18 px sans, muted ink, 45 to 60 characters wide, centred, 2 lines maximum.
5. **One filled pill CTA** (plus at most one quiet text or outline secondary). Small trust line or avatars under it.
6. **Nav**: logo left, 4 to 5 tiny links centred or left, one dark or accent pill right. 12 to 14 px. No borders, no background.
7. **The product is the picture.** A **dense, detailed** real-UI mockup (sidebar, table, chart, cards, many small realistic details) inside a rounded window (radius 16 to 28 px) with a soft long shadow, placed in the **first viewport and cropped by its bottom edge**, so the page promises more below. The scene sits behind and around it (Tenure's trees and sky; Pave's mesa behind the window; Crest's isometric blocks; Plait's phone between tiles).
8. **Below the hero**: one quiet strip (logos or tiles), then colour-blocked tiles with huge numerals (Plait: "10k+", "92%") in the brand's accent colours. Rows of equal rounded tiles (radius 20 to 28 px), no borders, flat colour, one numeral or photo each.
9. **Spacing**: hero top padding 48 to 80 px, gap between headline block and mockup 48 to 64 px, sections 96 to 144 px apart, content max width 1120 to 1200 px, mockup max width about 960 to 1100 px, 8 px base unit.

## Why a UI "looks weird" against these (diagnose with this list)
- Cool lavender or grey ground instead of cream or a saturated scene: reads as a template.
- Mockup is a sparse screenshot (lots of empty margin inside the window): reads as an empty product. Crop to the dense part, or shoot at a narrower viewport so content fills the frame.
- Backdrop is a pale tint, not a saturated scene.
- Hero does not fill the first screen: the mockup starts below the fold, or it ends with a clean bottom edge instead of bleeding off.
- Outline buttons and thick dark borders: the references use flat fills, thin or no borders and soft shadows.
- Headline is correct but everything under it is small grey text in a narrow column floating in empty space: add the colour-blocked tile row and the proof strip so each screen has a focal object.
- Too many accent colours on one page (use the world colours only).

## Applying to an app (not just a landing page)
- App screens keep the **ground** (cream or deep), **type voice** (serif headings, sans body), **radii**, **flat coloured tiles** and **one filled pill** as the primary action. Replace outlined boxes with tinted tiles or white cards on the cream ground with a soft shadow.
- Progress, scores and counts use big serif or tabular numerals in tiles.
- Use the world colours for status and category (never red/green alone).
