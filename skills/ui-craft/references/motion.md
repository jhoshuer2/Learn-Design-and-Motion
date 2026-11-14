# Motion spec
Principle: motion confirms touch and reveals hierarchy. It never loops decoratively and never blocks reading.
| Moment | Effect | Timing |
|---|---|---|
| Page load, hero | headline lines rise 0.4em and unblur (8 px to 0), staggered 80 ms; image settles scale 1.06 to 1 | 700 ms headline, 1400 ms image, ease-out-expo |
| Scroll reveal | element translateY 24 px, opacity 0, blur 6 px to rest when 15% in view, once | 700 ms |
| Pill hover | lift 2 px, magnetic pull toward cursor (max 6 px), arrow +4 px | 180 ms |
| Card hover | image scale 1.04, hover action fades in | 320 ms |
| Dock | active dot slides between items; icon label expands on hover/focus | 320 ms |
| Watch/Read switch | thumb slides, icon crossfades | 320 ms |
| Progress dots | current dot ring pulses once on step change; completed dot fills | 700 ms |
| Step change | content crossfades 180 ms; focus moves to the step heading | 180 ms |
| Companion | idle blink of the lens every 6 s (CSS opacity, 140 ms); hint bubble pops from 0.92 scale | 320 ms |
| Page transition | main fades 180 ms out, 320 ms in (View Transitions API if available) | |
## Reduced motion
`@media (prefers-reduced-motion: reduce)`: no transforms, no blur, no pulses, no idle blink; reveals are instant opacity 1; hover keeps colour change only. Content is never hidden waiting for JS: reveals use `data-reveal` plus a class added by a tiny observer, with a `<noscript>` and a no-JS default of visible.
## Implementation
CSS first (custom properties, `@keyframes`, `animation-timeline: view()` where supported, IntersectionObserver fallback), no animation library unless the effect needs physics. Never animate layout properties; use transform and opacity. Test with frames: `node scripts/frames.mjs <url>`.
