/** WCAG 2.x relative luminance and contrast ratio. Also used for deterministic checks in assessment. */
export type RGB = [number, number, number];

export function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}

export function relativeLuminance([r, g, b]: RGB): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function hexContrast(a: string, b: string): number | null {
  const ca = parseHex(a), cb = parseHex(b);
  return ca && cb ? contrastRatio(ca, cb) : null;
}

/** Thresholds: AA text 4.5 (large text 3), AAA text 7 (large 4.5), non-text UI 3. */
export function wcagResults(ratio: number) {
  return {
    aaText: ratio >= 4.5,
    aaLargeText: ratio >= 3,
    aaaText: ratio >= 7,
    aaaLargeText: ratio >= 4.5,
    nonText: ratio >= 3,
  };
}
