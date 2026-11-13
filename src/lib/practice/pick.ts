export type EvidenceRow = { competencyId: string; score: number; createdAt: Date };

/**
 * Which skill to warm up on, among skills the learner has already been taught (completed lessons in their own path):
 * the weakest latest result under the pass mark first, otherwise the one practised longest ago (spaced review).
 * Ties break on the id so the answer is stable. Null when nothing has been taught yet.
 */
export function pickWarmupSkill(evidence: EvidenceRow[], available: Set<string>, passMark = 80): string | null {
  if (available.size === 0) return null;
  const latest = new Map<string, EvidenceRow>();
  for (const e of [...evidence].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) if (!latest.has(e.competencyId)) latest.set(e.competencyId, e);
  const rows = [...available].map((id) => ({ id, ev: latest.get(id) ?? null }));
  const weak = rows.filter((r) => r.ev && r.ev.score < passMark)
    .sort((a, b) => a.ev!.score - b.ev!.score || a.ev!.createdAt.getTime() - b.ev!.createdAt.getTime() || a.id.localeCompare(b.id));
  if (weak.length > 0) return weak[0].id;
  const stalest = rows.filter((r) => r.ev).sort((a, b) => a.ev!.createdAt.getTime() - b.ev!.createdAt.getTime() || a.id.localeCompare(b.id));
  if (stalest.length > 0) return stalest[0].id;
  return rows.map((r) => r.id).sort()[0];
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The same seed always gives the same questions in the same order, so a refresh does not reshuffle the day. */
export function pickQuestions<T extends { id: string }>(pool: T[], seed: string, n = 3): T[] {
  const items = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  const rand = mulberry32(hash(seed));
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  return items.slice(0, n);
}
