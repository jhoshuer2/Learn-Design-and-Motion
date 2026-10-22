import { loadContent } from "../src/lib/content/loader";

try {
  const c = loadContent();
  const lessons = c.modules.reduce((n, m) => n + m.lessons.length, 0);
  console.log(`content ok: ${c.modules.length} module(s), ${lessons} lesson(s), ${c.rubrics.length} rubric(s)`);
} catch (e) {
  console.error("content invalid:", e instanceof Error ? e.message : e);
  process.exit(1);
}
