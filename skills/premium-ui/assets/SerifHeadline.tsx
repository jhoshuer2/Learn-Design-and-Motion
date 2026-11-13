/** Display headline with ONE italic, coloured phrase that carries the benefit. Once per page. */
export function SerifHeadline({ before, accent, after = "", as: Tag = "h1" }: { before: string; accent: string; after?: string; as?: "h1" | "h2" }) {
  return (
    <Tag className="display text-balance text-[length:var(--step-hero)]">
      {before} <em className="italic text-[var(--accent-warm)]">{accent}</em>{after}
    </Tag>
  );
}
