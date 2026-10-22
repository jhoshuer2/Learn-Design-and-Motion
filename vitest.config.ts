import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    // Integration tests share one Postgres database and the content publisher rewrites rows,
    // so test files must not run concurrently.
    fileParallelism: false,
    // Tests must never reach the real API (it costs money): blank the key even though Prisma loads .env.
    env: { ANTHROPIC_API_KEY: "", EVALUATION_PROVIDER: "", BCRYPT_ROUNDS: "4", EMAIL_TRANSPORT: "outbox", APP_URL: "http://app.test" },
  },
});
