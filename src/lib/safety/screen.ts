/**
 * A deliberately weak text filter. It catches the easy, common problems (contact details, links, obvious spam) in text
 * that other people will read. It does NOT detect abuse, harassment, hate, or anything clever, and must never be
 * presented as a safety guarantee. Human review is the control; this only saves reviewers the obvious cases.
 */
export type ScreenResult = { refuse: string | null; flags: string[] };

const EMAIL = /[A-Z0-9._%+-]+\s?(?:@|\(at\)|\[at\])\s?[A-Z0-9.-]+\s?(?:\.|\(dot\)|\[dot\])\s?[A-Z]{2,}/i;
const URL_LIKE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(?:com|net|org|io|co|me|ly|app|dev|xyz|info|biz|link|site|online|shop)\b/i;
/** Nine or more digits once separators are ignored: a phone number, not a year or a dimension. */
const PHONE = /(?:\+?\d[\s().-]{0,2}){9,}/;

const BUILT_IN_BLOCKLIST = ["viagra", "casino", "porn", "free crypto", "giveaway winner"];
const blocklist = () => [...BUILT_IN_BLOCKLIST, ...(process.env.CONTENT_BLOCKLIST ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)];

export function screenText(text: string | null | undefined): ScreenResult {
  const s = (text ?? "").trim();
  if (!s) return { refuse: null, flags: [] };
  if (EMAIL.test(s)) return { refuse: "an email address", flags: [] };
  if (URL_LIKE.test(s)) return { refuse: "a web address", flags: [] };
  if (PHONE.test(s)) return { refuse: "a phone number", flags: [] };
  const lower = s.toLowerCase();
  const flags = blocklist().filter((w) => lower.includes(w));
  return { refuse: null, flags };
}

export type ScreenField = { label: string; text: string | null | undefined };

/** Screen several fields; returns the first refusal (with its field) and every flag. */
export function screenFields(fields: ScreenField[]): { refuse: string | null; flags: string[] } {
  const flags: string[] = [];
  for (const f of fields) {
    const r = screenText(f.text);
    if (r.refuse) return { refuse: `${f.label} contains ${r.refuse}. Remove it before sharing: shared text must not include contact details or links.`, flags };
    flags.push(...r.flags.map((w) => `${f.label}: "${w}"`));
  }
  return { refuse: null, flags };
}
