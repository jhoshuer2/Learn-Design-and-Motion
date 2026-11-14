/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { Pip } from "@/components/ui/Pip";

/** Sign-in and sign-up: form on cream at left, a painted scene with Pip and one italic line at right (a short banner on phones). */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-page gap-10 px-6 pb-12 pt-8 lg:min-h-[calc(100vh-8rem)] lg:grid-cols-[1fr_1.1fr]">
      <div className="flex items-center justify-center lg:justify-start lg:pr-10">{children}</div>
      <aside aria-hidden className="frame grain relative order-first h-44 lg:order-none lg:h-auto">
        <img src="/art/hero.webp" width={1280} height={720} alt="" className="settle absolute inset-0 h-full w-full object-cover object-[85%_50%]" />
        <p className="display absolute left-8 top-8 z-10 hidden max-w-[12ch] text-5xl text-ink lg:block">Your path, <em>one small step</em> at a time.</p>
        <div className="absolute bottom-0 right-8 z-10 hidden lg:block"><Pip size={190} /></div>
      </aside>
    </div>
  );
}
