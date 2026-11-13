/** npx tsx scripts/make-lesson-videos.ts [name ...]   Renders the silent, captioned explainer videos into public/lessons. */
import path from "node:path";
import { render } from "./videos/engine";
import { VIDEOS } from "./videos/lessons";

const only = process.argv.slice(2);
(async () => {
  for (const v of VIDEOS.filter((x) => only.length === 0 || only.includes(x.name))) {
    const r = await render(v, path.join(process.cwd(), "public", "lessons"));
    console.log(`${r.name}: ${r.seconds}s, ${r.kb} KB`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
