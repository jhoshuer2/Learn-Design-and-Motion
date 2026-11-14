import type { Config } from "tailwindcss";

/** Colour tokens are CSS variables; this makes opacity modifiers (text-paper/70) work with them. */
const cv = (v: string) => `color-mix(in srgb, var(${v}) calc(<alpha-value> * 100%), transparent)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: cv("--surface"),
        raised: cv("--raised"),
        ink: cv("--ink"),
        muted: cv("--muted"),
        line: cv("--line"),
        accent: cv("--accent"),
        playhead: cv("--playhead"),
        key: cv("--key"),
        paper: cv("--paper"),
        "paper-2": cv("--paper-2"),
        card: cv("--card"),
        "ink-2": cv("--ink-2"),
        "ink-3": cv("--ink-3"),
        "accent-soft": cv("--accent-soft"),
        sage: cv("--sage"),
        butter: cv("--butter"),
        "accent-ink": cv("--accent-ink"),
        success: cv("--success"),
        warn: cv("--warn"),
        danger: cv("--danger"),
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"],
      },
      maxWidth: { measure: "38rem", page: "1200px" },
      borderRadius: { card: "20px", window: "28px", input: "14px" },
      boxShadow: { card: "var(--shadow-card)", float: "var(--shadow-float)" },
    },
  },
  plugins: [],
} satisfies Config;
