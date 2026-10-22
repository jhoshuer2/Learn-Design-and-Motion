import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    // Integration tests share one Postgres database and the content publisher rewrites rows,
    // so test files must not run concurrently.
    fileParallelism: false,
  },
});
