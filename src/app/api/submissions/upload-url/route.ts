import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requestUploadUrl } from "@/lib/submissions/direct";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  const body = await req.json().catch(() => null);
  const r = await requestUploadUrl(session?.user?.id, body);
  return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
