import Link from "next/link";
import { auth } from "@/auth";

/** Wordmark left; signed-out visitors get Sign in and a Start pill on the right. Signed-in navigation is the dock. */
export async function SiteHeader() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);
  return (
    <header className="mx-auto flex max-w-page items-center justify-between px-6 pt-6">
      <Link href={signedIn ? "/dashboard" : "/"} className="inline-flex min-h-11 items-center gap-2.5">
        <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-ink text-paper"><span className="display text-lg italic leading-none">c</span></span>
        <span className="display text-xl">Creative Mastery</span>
      </Link>
      {!signedIn && (
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link href="/signin" className="link-quiet hidden px-3 text-sm font-semibold sm:inline">Sign in</Link>
          <Link href="/signup" className="pill pill-ink !min-h-10 !px-5 !text-sm">Start</Link>
        </nav>
      )}
    </header>
  );
}
