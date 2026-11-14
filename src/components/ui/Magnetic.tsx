"use client";
import { useRef } from "react";

/** Pulls its child a few pixels toward the pointer. Disabled for reduced motion and touch. */
export function Magnetic({ children, strength = 6 }: { children: React.ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const move = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = ref.current!.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) / r.width, y = (e.clientY - (r.top + r.height / 2)) / r.height;
    ref.current!.style.transform = `translate(${x * strength * 2}px, ${y * strength * 2}px)`;
  };
  const reset = () => { if (ref.current) ref.current.style.transform = ""; };
  return (
    <span ref={ref} onPointerMove={move} onPointerLeave={reset} className="inline-block transition-transform duration-300 [transition-timing-function:var(--ease)]">
      {children}
    </span>
  );
}
