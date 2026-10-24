/** npx tsx scripts/export-scoring-pack.ts [outDir=calibration/pack] [keyPath=calibration/key/pack-key.json] */
import { exportPack } from "./calibration/pack";

const out = process.argv[2] ?? "calibration/pack";
const key = process.argv[3] ?? "calibration/key/pack-key.json";
exportPack(out, key).then((r) => console.log(`wrote ${r.files.length} files to ${out}; key at ${key} (do not open it until scoring is done)`));
