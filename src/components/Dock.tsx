"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, React.ReactNode> = {
  today: <path d="M12 3v2m0 14v2M5 12H3m18 0h-2M6.3 6.3 4.9 4.9m14.2 14.2-1.4-1.4M17.7 6.3l1.4-1.4M6.3 17.7l-1.4 1.4M12 8a4 4 0 100 8 4 4 0 000-8z" />,
  learn: <path d="M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 004 21.5v-16zM20 17H6.5A2.5 2.5 0 004 19.5" />,
  skills: <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7L12 3z" />,
  portfolio: <path d="M4 7h16v12H4zM9 7V5h6v2" />,
  profile: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" />,
};

const ITEMS = [
  { id: "today", href: "/today", label: "Today", match: ["/today"] },
  { id: "learn", href: "/learn", label: "Learn", match: ["/learn"] },
  { id: "skills", href: "/profile/skills", label: "Skills", match: ["/profile/skills"] },
  { id: "portfolio", href: "/portfolio", label: "Work", match: ["/portfolio"] },
  { id: "profile", href: "/dashboard", label: "Home", match: ["/dashboard", "/profile"] },
];

/** Floating pill dock: the app's navigation. Signed-in pages only. */
export function Dock() {
  const path = usePathname();
  const active = (m: string[]) => m.some((p) => path === p || (p !== "/profile" && path.startsWith(p + "/")) || (p === "/profile" && path === "/profile"));
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <ul className="dock flex items-center gap-1 rounded-full p-1.5 shadow-float" style={{ background: "color-mix(in srgb, var(--ink) 94%, transparent)" }}>
        {ITEMS.map((it) => {
          const on = active(it.match);
          return (
            <li key={it.id}>
              <Link
                href={it.href}
                aria-current={on ? "page" : undefined}
                aria-label={`${it.label} (navigation)`}
                className={`group relative flex h-11 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors duration-300 sm:px-4 ${on ? "bg-paper text-ink" : "text-paper/70 hover:text-paper"}`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[it.id]}</svg>
                <span className={on ? "inline" : "hidden sm:inline"} aria-hidden>{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
