import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { probeAndResume, runDueJobs } from "@/lib/jobs/ops";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorised(req: Request, secret: string) {
  const given = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * For hosts without a long-running process: a scheduler calls this every minute. Same loop as the worker, bounded in
 * time. Disabled (404) unless JOBS_TICK_SECRET is set, so it does not exist by accident.
 */
export async function POST(req: Request) {
  const secret = process.env.JOBS_TICK_SECRET;
  if (!secret) return new NextResponse(null, { status: 404 });
  if (!authorised(req, secret)) return new NextResponse(null, { status: 401 });
  const probe = await probeAndResume();
  const summary = await runDueJobs({ workerId: `tick-${process.pid}`, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2), timeBudgetMs: 200_000 });
  return NextResponse.json({ probe, ...summary });
}
