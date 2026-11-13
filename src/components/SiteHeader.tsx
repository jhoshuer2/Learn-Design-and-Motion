import Link from "next/link";

/** A small wordmark with a keyframe diamond. It is the only thing in the header: every page already has its own navigation. */
export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-5xl items-center px-6 pt-6">
      <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-display text-lg" aria-label="Creative Mastery, home">
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
          <rect x="4.5" y="4.5" width="13" height="13" transform="rotate(45 11 11)" fill="var(--key)" stroke="var(--ink)" strokeWidth="2" />
        </svg>
        Creative Mastery
      </Link>
    </header>
  );
}
