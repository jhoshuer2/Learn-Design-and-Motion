# Layout templates (use these, do not invent others)

## A. Hero (marketing)
```
[ logo ................ floating pill nav ........ Sign in (text) ]
        tiny label: "A good first thing to make"
   Display XL: Learn it by *making it.*   (left 7 cols)
   Body L (max 34rem) + [Start (filled pill)] [See the path (text)]
 +--------------------------------------------------------------+
 |  full-bleed painterly scene, radius 28, 16:9, grain;           |
 |  companion small at bottom-right; label "01 / 04" bottom-left  |
 +--------------------------------------------------------------+
```
The headline sits on cream above the image on phones; on desktop it may overlap the image's empty wall area. Image settles (scale 1.06 to 1) on load.

## B. Editorial section
Two columns: left small label + short sticky heading; right paragraph (max 38rem) and a framed image (radius 28). Hairline above the section. Alternate image side per section.

## C. Path wall (browse)
Grid of 4 large cards (4:5 images, radius 28) with title in serif, tiny label with hours, counter "02 / 04". Hover: image scale 1.04, label arrow slides. Click enters the path.

## D. App shell
Cream ground. Top-left small logo wordmark, top-right avatar pill. **Floating pill dock** fixed bottom-centre (Today, My learning, Skills, Profile) with icons plus labels on hover, ink pill on cream, shadow-2. Page title Display L, tiny label above it. Content max width 1200; reading pages 38rem.

## E. Lesson
Left rail (desktop): tiny index ("Overview, Step 3 of 8"), progress as 8 dots. Centre: one step at a time, title Display M, content, a themed Watch/Read switch, and one filled pill "Continue". Companion appears in hints and feedback only. Phone: index collapses to a dots row at the top.

## F. Card grid (lists)
Pill filters with counts on top ("All 12", "In progress 2"), grid 3 columns (1 on phone), cards 20 px radius with media top, tiny label, serif title, one meta line; hover actions appear on the card.

## G. Auth
Split: left form on cream (label above inputs, 14 px radius inputs, one filled pill), right a painterly scene with the companion and one line in serif italic. Phone: scene becomes a short banner above the form.
