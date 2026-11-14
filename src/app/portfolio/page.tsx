import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { PortfolioError, createProject, listEligibleSubmissions, listMyProjects } from "@/lib/portfolio";
import { Button } from "@/components/ui/Button";
import { StateBadge } from "@/components/ui/StateBadge";

async function add(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    const p = await createProject(user.id, String(formData.get("submissionId")));
    redirect(`/portfolio/${p.id}`);
  } catch (e) {
    if (e instanceof PortfolioError) redirect(`/portfolio?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
}

const VIS = { PRIVATE: "Private: only you", LINK: "Anyone with the link", PUBLIC: "Public" } as const;

export default async function Portfolio({ searchParams }: { searchParams: { error?: string } }) {
  const user = await requireUser();
  const [projects, eligible] = await Promise.all([listMyProjects(user.id), listEligibleSubmissions(user.id)]);
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <nav className="flex gap-4 text-sm"><Link href="/dashboard" className="link-quiet font-semibold">Dashboard</Link><Link href="/profile" className="link-quiet font-semibold">Profile</Link><Link href="/community" className="link-quiet font-semibold">Community</Link></nav>
      <h1 className="mt-4 display display-m">My portfolio</h1>
      <p className="mt-3 max-w-measure text-ink-2">
        A portfolio project is a shareable view of work you submitted and had assessed. Every project starts private. Nothing is visible to anyone until you choose to share it.
      </p>
      {searchParams.error && <p role="alert" className="mt-4 text-danger">{searchParams.error}</p>}

      <h2 className="mt-10 title">Projects</h2>
      {projects.length === 0 ? <p className="mt-3 text-ink-2">No projects yet.</p> : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 py-4">
              <div>
                <Link className="font-medium link-quiet font-semibold" href={`/portfolio/${p.id}`}>{p.title}</Link>
                <p className="text-sm text-ink-2">{p.submission.assignment.title} · {VIS[p.visibility]}{p.moderationHold ? " · on hold" : ""} · {p._count.reviews} review{p._count.reviews === 1 ? "" : "s"}</p>
              </div>
              <StateBadge state={p.moderationHold ? "failed" : p.visibility === "PRIVATE" ? "locked" : "completed"} />
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 title">Add a project</h2>
      {eligible.length === 0 ? <p className="mt-3 text-ink-2">You have no assessed work to add yet. Work becomes available once it has received an assessment.</p> : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {eligible.map((s) => (
            <li key={s.submissionId} className="flex items-center justify-between gap-4 py-4">
              <div><p className="font-medium">{s.assignment}</p><p className="text-sm text-ink-2">Attempt {s.attempt}{s.score !== null ? ` · scored ${s.score}%` : ""}</p></div>
              <form action={add}><input type="hidden" name="submissionId" value={s.submissionId} /><Button type="submit" variant="secondary">Add (private)</Button></form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
