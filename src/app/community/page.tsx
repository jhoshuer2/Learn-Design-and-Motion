import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { GALLERY_PAGE_SIZE, listGallery } from "@/lib/portfolio";

export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

export default async function Community({ searchParams }: { searchParams: { page?: string } }) {
  const user = await requireUser();
  const page = Math.max(0, Number(searchParams.page) || 0);
  const cards = await listGallery(user.id, page);
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <nav className="flex gap-4 text-sm"><Link href="/dashboard" className="underline">Dashboard</Link><Link href="/portfolio" className="underline">My portfolio</Link></nav>
      <h1 className="mt-4 font-display text-4xl">Community</h1>
      <p className="mt-2 max-w-measure text-muted">Work that other learners chose to share publicly. Open a project to leave feedback. Feedback is for learning and never affects anyone&rsquo;s progress.</p>
      {cards.length === 0 ? <p className="mt-8 text-muted">Nothing has been shared publicly yet.</p> : (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2">
          {cards.map((c) => (
            <li key={c.slug} className="rounded border border-line bg-raised p-3">
              <Link href={`/p/${c.slug}`} className="block">
                {c.cover !== null && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/portfolio/${c.slug}/files/${c.cover}`} alt={`${c.title}, by ${c.owner}`} className="h-56 w-full object-contain" />
              )}
                <span className="mt-2 block font-medium underline">{c.title}</span>
                <span className="text-sm text-muted">{c.owner} · {c.assignment}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <nav className="mt-8 flex gap-6 text-sm" aria-label="Pages">
        {page > 0 && <Link className="underline" href={`/community?page=${page - 1}`}>Newer</Link>}
        {cards.length === GALLERY_PAGE_SIZE && <Link className="underline" href={`/community?page=${page + 1}`}>Older</Link>}
      </nav>
    </div>
  );
}
