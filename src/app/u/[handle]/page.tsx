import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { getHandlePage } from "@/lib/portfolio/view";
import { limitViewer } from "@/lib/ratelimit";
import { TooManyRequests } from "@/components/TooManyRequests";

export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

export default async function PublicPortfolio({ params }: { params: { handle: string } }) {
  const session = await auth();
  const limited = await limitViewer("page", headers(), session?.user?.id);
  if (!limited.allowed) return <TooManyRequests seconds={limited.retryAfterSec} />;
  const page = await getHandlePage(params.handle);
  if (!page) notFound();
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <nav className="text-sm"><Link href="/" className="link-quiet font-semibold">Creative Mastery</Link></nav>
      <h1 className="mt-4 display display-m">{page.displayName}</h1>
      <p className="mt-2 text-ink-2">Assessed work shared on Creative Mastery.</p>
      <ul className="mt-8 grid gap-6 sm:grid-cols-2">
        {page.projects.map((p) => (
          <li key={p.slug} className="surface-card p-3">
            <Link href={`/p/${p.slug}`} className="block">
              {p.cover !== null && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/portfolio/${p.slug}/files/${p.cover}`} alt={`${p.title}, by ${page.displayName}`} className="h-56 w-full object-contain" />
              )}
              <span className="mt-2 block font-medium link-quiet font-semibold">{p.title}</span>
              <span className="text-sm text-ink-2">{p.assignment}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
