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
      </body>
    </html>
  );
}
