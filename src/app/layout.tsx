import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creative Mastery",
  description: "Don't just learn the craft. Prove you can do it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-3 focus:bg-raised">
          Skip to content
        </a>
        <main id="main">{children}</main>
        <footer className="mx-auto max-w-4xl px-6 py-10 text-sm text-muted">
          <nav aria-label="Site" className="flex flex-wrap gap-x-5 gap-y-1">
            <a className="underline" href="/policy">Content policy</a>
            <a className="underline" href="/terms">Terms</a>
            <a className="underline" href="/privacy">Privacy</a>
            <a className="underline" href="/report-abuse">Report content</a>
          </nav>
        </footer>
      </body>
    </html>
  );
}
