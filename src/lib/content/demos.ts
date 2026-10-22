/** Names of interactive/visual demonstrations lesson content may embed with `<<demo:name|caption>>`. */
export const DEMO_NAMES = [
  "reading-order", "button-visibility", "type-readability", "grouping", "text-on-video",
  "motion-clarity", "brand-lockup", "figure-ground", "contrast-lab",
  // Brand Design
  "position-compare", "logo-clearspace", "lockup-misuse", "palette-roles",
] as const;
export type DemoName = (typeof DEMO_NAMES)[number];

export const DEMO_TOKEN = /^<<demo:([a-z-]+)\|(.+)>>$/;
