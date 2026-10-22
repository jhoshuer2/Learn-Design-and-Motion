import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getAssessmentStatus } from "@/lib/jobs/status";

export const dynamic = "force-dynamic";

/** Owner-only, polled by the submission page. Same 404 for "missing" and "not yours". */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
  const owns = await db.submission.findFirst({ where: { id: params.id, userId: session.user.id }, select: { id: true } });
  if (!owns) return new NextResponse("Not found", { status: 404 });
  const status = await getAssessmentStatus(params.id);
  return NextResponse.json(status, { headers: { "Cache-Control": "private, no-store" } });
}
