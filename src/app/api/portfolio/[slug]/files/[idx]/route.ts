import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSharedImage } from "@/lib/portfolio/images";
import { limitViewer } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** Public image route. Access is re-checked on every request, so un-sharing takes effect immediately. */
export async function GET(req: Request, { params }: { params: { slug: string; idx: string } }) {
  const session = await auth();
  const viewer = session?.user?.id ? { id: session.user.id, role: session.user.role } : null;
  const limited = await limitViewer("image", req.headers, viewer?.id);
  if (!limited.allowed) return new NextResponse("Too many requests", { status: 429, headers: { "Retry-After": String(limited.retryAfterSec), "X-Robots-Tag": "noindex" } });
  const img = await getSharedImage(viewer, params.slug, Number(params.idx));
  // One response for missing, private, held, or not-shown, so nothing can be probed.
  if (!img) return new NextResponse("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  return new NextResponse(new Uint8Array(img.data), {
    headers: {
      "Content-Type": img.mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, noimageindex",
    },
  });
}
