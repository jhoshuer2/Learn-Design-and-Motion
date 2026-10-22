import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL: "http://localhost:3100",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: "npx next start -p 3100",
    env: { AUTH_TRUST_HOST: "true", CONTENT_PREVIEW: "true", EVALUATION_PROVIDER: "fake", ANTHROPIC_API_KEY: "", ALLOW_FAKE_EVALUATOR: "true", UPLOAD_DIR: ".data/e2e-uploads" },
    url: "http://localhost:3100",
    reuseExistingServer: true,
  },
});
