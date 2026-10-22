import { spawn, type ChildProcess } from "node:child_process";

/**
 * The web app only queues work now; a worker assesses it. Start the real worker process (test-only evaluator) for the
 * whole e2e run and stop it afterwards. Set E2E_NO_WORKER=1 to run your own.
 */
export default async function globalSetup() {
  if (process.env.E2E_NO_WORKER) return;
  const child: ChildProcess = spawn("npx", ["tsx", "scripts/worker.ts"], {
    env: {
      ...process.env, EVALUATION_PROVIDER: "fake", ANTHROPIC_API_KEY: "", ALLOW_FAKE_EVALUATOR: "true",
      UPLOAD_DIR: ".data/e2e-uploads", WORKER_POLL_MS: "400", WORKER_CONCURRENCY: "2", WORKER_PROBE_MS: "3600000", NODE_ENV: "production",
    },
    stdio: ["ignore", "inherit", "inherit"],
    detached: true,
  });
  return async () => {
    try { process.kill(-child.pid!, "SIGTERM"); } catch { /* already gone */ }
  };
}
