import type { ReactNode } from "react";
import { Scene } from "@/components/art/Scene";

/** Sign-in and sign-up: the form on the left, the product's illustrated world on the right (hidden on small screens). */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-6 pb-12 pt-6 lg:min-h-[calc(100vh-6rem)] lg:grid-cols-2">
      <div className="flex items-center justify-center lg:justify-start">{children}</div>
      <aside aria-hidden className="relative hidden overflow-hidden rounded-window border border-line shadow-float lg:block">
        <Scene className="absolute inset-0 h-full w-full" />
        <p className="absolute left-10 right-10 top-12 font-display text-5xl text-ink">Your path, one small step at a time.</p>
      </aside>
    </div>
  );
}
