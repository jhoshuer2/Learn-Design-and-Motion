/** Days are the learner's own calendar days. Everything here is pure so it can be tested across time zones. */
export const DEFAULT_TZ = "UTC";

export function safeTz(tz?: string | null): string {
  if (!tz || tz.length > 64) return DEFAULT_TZ;
  try { new Intl.DateTimeFormat("en-CA", { timeZone: tz }); return tz; } catch { return DEFAULT_TZ; }
}

/** `YYYY-MM-DD` of an instant in a time zone. */
export function localDay(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: safeTz(tz), year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const activityDays = (stamps: Date[], tz: string) => new Set(stamps.map((s) => localDay(s, tz)));

/**
 * Consecutive active days ending today, or ending yesterday when today has no activity yet (the day is not over, so it
 * is not a break). A gap simply starts a new run: there is no "lost streak" anywhere in the product.
 */
export function currentRun(days: Set<string>, today: string): number {
  let day = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(day)) { n++; day = addDays(day, -1); }
  return n;
}

export function weekStrip(days: Set<string>, today: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    return { day, active: days.has(day), isToday: day === today };
  });
}
