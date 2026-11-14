import type { Metadata } from "next";
import "@fontsource-variable/fraunces/wght.css";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource-variable/instrument-sans/index.css";
import "./globals.css";
import { auth } from "@/auth";
import { SiteHeader } from "@/components/SiteHeader";
import { Dock } from "@/components/Dock";
import { RevealRoot } from "@/components/ui/RevealRoot";

export const metadata: Metadata = {
  title: "Creative Mastery",
  description: "Don't just learn the craft. Prove you can do it.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-card focus:p-3">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className={signedIn ? "pb-28" : ""}>{children}</main>
        <footer className={`mx-auto max-w-page px-6 py-10 ${signedIn ? "pb-32" : ""}`}>
          <nav aria-label="Site" className="label flex flex-wrap gap-x-6 gap-y-2 !text-ink-3">
            <a className="link-quiet" href="/policy">Content policy</a>
            <a className="link-quiet" href="/terms">Terms</a>
            <a className="link-quiet" href="/privacy">Privacy</a>
            <a className="link-quiet" href="/report-abuse">Report content</a>
          </nav>
        </footer>
        {signedIn && <Dock />}
        <RevealRoot />
      </body>
    </html>
  );
}
