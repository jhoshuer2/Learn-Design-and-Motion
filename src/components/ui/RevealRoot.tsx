"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Scroll reveal. Anything marked data-reveal that starts below the fold fades up as it scrolls in (once).
 * Content is visible before hydration and under reduced motion; elements already on screen are left alone.
 */
export function RevealRoot() {
  const path = usePathname();
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const els = [...document.querySelectorAll<HTMLElement>("[data-reveal]:not(.rv-in)")].filter((el) => el.getBoundingClientRect().top > window.innerHeight * 0.9);
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.remove("rv-pending"); en.target.classList.add("rv-in"); io.unobserve(en.target); }
    }, { threshold: 0.12 });
    els.forEach((el) => { el.classList.add("rv-pending"); io.observe(el); });
    return () => io.disconnect();
  }, [path]);
  return null;
}
