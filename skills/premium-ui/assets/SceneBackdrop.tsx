/** A decorative layered landscape (original). Swap the palette for the brand's hue family. */
export function SceneBackdrop() {
  return (
    <svg viewBox="0 0 1440 720" preserveAspectRatio="xMidYMax slice" aria-hidden className="absolute inset-0 -z-10 h-full w-full">
      <defs>
        <linearGradient id="sb-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8fb8ff" /><stop offset="1" stopColor="#ffe3c7" /></linearGradient>
        <radialGradient id="sb-sun"><stop offset="0" stopColor="#fff6dc" /><stop offset="1" stopColor="#fff6dc" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="1440" height="720" fill="url(#sb-sky)" />
      <circle cx="1080" cy="260" r="220" fill="url(#sb-sun)" />
      <path d="M0 520 C 240 430 420 470 640 420 S 1080 380 1440 450 V720 H0Z" fill="#7da0e8" opacity=".55" />
      <path d="M0 580 C 200 520 460 560 700 510 S 1160 500 1440 560 V720 H0Z" fill="#4f6fd1" />
      <path d="M0 650 C 260 600 520 640 760 600 S 1180 590 1440 640 V720 H0Z" fill="#2b3f99" />
    </svg>
  );
}
