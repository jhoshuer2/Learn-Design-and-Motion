/**
 * An original illustrated world for the product: layered hills under a soft sky, with a winding trail of keyframe
 * diamonds and the magenta playhead (the platform's own idea of progress). Palette comes from CSS variables so the same
 * scene works in light and dark. Decorative only.
 */
const TRAIL: [number, number][] = [[120, 690], [300, 640], [470, 610], [640, 590], [820, 560], [1010, 515], [1210, 450]];
const STARS: [number, number][] = [[140, 90], [260, 170], [420, 60], [560, 140], [700, 80], [880, 40], [980, 150], [1180, 70], [1320, 160], [1390, 60], [60, 200], [1260, 240]];

export function Scene({ className = "" }: { className?: string }) {
  const last = TRAIL[TRAIL.length - 2];
  return (
    <svg viewBox="0 0 1440 720" preserveAspectRatio="xMidYMax slice" aria-hidden className={className}>
      <defs>
        <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--sc-sky-top)" /><stop offset="1" stopColor="var(--sc-sky-bot)" /></linearGradient>
        <radialGradient id="sc-sun"><stop offset="0" stopColor="var(--sc-sun)" /><stop offset="1" stopColor="var(--sc-sun)" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="1440" height="720" fill="url(#sc-sky)" />
      <g fill="#fff" opacity="var(--sc-stars)">{STARS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2 : 1.4} />)}</g>
      <circle cx="1100" cy="250" r="260" fill="url(#sc-sun)" />
      <circle cx="1100" cy="250" r="62" fill="var(--sc-sun)" opacity="0.9" />
      <path d="M0 470 C 180 390 360 430 560 380 S 960 330 1200 400 S 1380 410 1440 390 V720 H0Z" fill="var(--sc-far)" opacity="0.7" />
      <path d="M0 540 C 220 470 420 520 660 470 S 1100 430 1440 500 V720 H0Z" fill="var(--sc-mid)" />
      <path d="M0 620 C 260 560 520 610 780 560 S 1180 520 1440 580 V720 H0Z" fill="var(--sc-near)" />
      <path d="M0 690 C 300 650 640 690 960 650 S 1300 640 1440 670 V720 H0Z" fill="var(--sc-front)" />
      <polyline points={TRAIL.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--key)" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" opacity="0.9" />
      {TRAIL.map(([x, y], i) => (
        <rect key={i} x={x - 9} y={y - 9} width="18" height="18" transform={`rotate(45 ${x} ${y})`} fill={i < TRAIL.length - 2 ? "var(--key)" : "var(--sc-sun)"} stroke="var(--ink)" strokeWidth="2.5" />
      ))}
      <polygon points={`${last[0] - 9},${last[1] - 40} ${last[0] + 9},${last[1] - 40} ${last[0]},${last[1] - 24}`} fill="var(--playhead)" />
    </svg>
  );
}
