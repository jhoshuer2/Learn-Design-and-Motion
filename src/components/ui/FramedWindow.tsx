import type { ReactNode } from "react";

/** A floating app window: the hero's main picture. Put a real screenshot (or live UI) inside. Decorative chrome is hidden from assistive technology. */
export function FramedWindow({ children, title = "", className = "" }: { children: ReactNode; title?: string; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-window border border-line bg-raised shadow-float ${className}`}>
      <div className="flex items-center gap-2 border-b border-line px-5 py-3" aria-hidden>
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" /><span className="h-3 w-3 rounded-full bg-[#febc2e]" /><span className="h-3 w-3 rounded-full bg-[#28c840]" />
        {title && <span className="ml-3 truncate text-xs text-muted">{title}</span>}
      </div>
      {children}
    </div>
  );
}
