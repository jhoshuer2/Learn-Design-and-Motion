import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { canReadSubmission, type StoredFile } from "@/lib/submissions/access";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string; idx: string } }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });

  const submission = await db.submission.findUnique({ where: { id: params.id } });
  // Same response for "missing" and "not yours" so ids cannot be probed.
  if (!submission || !canReadSubmission(session.user, submission)) return new NextResponse("Not found", { status: 404 });

  const files = submission.files as StoredFile[];
  const file = files[Number(params.idx)];
  if (!file) return new NextResponse("Not found", { status: 404 });

  const data = await getStorage().get(file.key).catch(() => null);
  if (!data) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": file.mime, // set from the decoded format at upload, never from the client
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.name)}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
