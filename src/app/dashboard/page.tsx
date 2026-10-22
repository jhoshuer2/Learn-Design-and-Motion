import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getTimeline, getWeakCompetencies } from "@/lib/progression";
import { nextHref } from "@/lib/progression/links";
import { Button } from "@/components/ui/Button";
import { StateBadge } from "@/components/ui/StateBadge";

async function enroll(formData: FormData) {
  "use server";
  const user = await requireUser();
  const pathId = String(formData.get("pathId"));
  const path = await db.path.findUnique({ where: { id: pathId } });
  if (!path) return;
  await db.enrollment.upsert({
    where: { userId_pathId: { userId: user.id, pathId } },
    update: {},
    create: { userId: user.id, pathId },
  });
  revalidatePath("/dashboard");
}

async function logout() {
  "use server";
  await signOut({ redirectTo: "/" });
}

export default async function Dashboard() {
  const user = await requireUser();
  const [paths, enrollments] = await Promise.all([
    db.path.findMany({ include: { discipline: true, levels: { include: { modules: true } } } }),
    db.enrollment.findMany({ where: { userId: user.id } }),
  ]);
  const enrolled = new Set(enrollments.map((e) => e.pathId));
  const timelines = await Promise.all(enrollments.map((e) => getTimeline(user.id, e.pathId)));
  const next = timelines.find((t) => t?.next)?.next ?? null;
  const weak = await getWeakCompetencies(user.id);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-4xl">Welcome, {user.name ?? user.email}</h1>
        <form action={logout}><Button variant="secondary" type="submit">Sign out</Button></form>
      </header>
      <section className="mt-8 grid gap-6 border-y border-line py-6 sm:grid-cols-3">
        <div>
          <h2 className="text-sm uppercase tracking-widest text-muted">Where am I</h2>
          <p className="mt-2">{timelines.find((t) => t)?.pathTitle ?? "Not enrolled yet"}</p>
          <Link href="/learn" className="text-sm underline">My learning</Link>
        </div>
        <div>
          <h2 className="text-sm uppercase tracking-widest text-muted">Do next</h2>
          {next ? <Link className="mt-2 inline-block underline" href={nextHref(next)}>{next.title}</Link>
            : <p className="mt-2 text-muted">Enroll in a path to get a next step.</p>}
        </div>
        <div>
          <h2 className="text-sm uppercase tracking-widest text-muted">Improve</h2>
          {weak.length === 0 ? <p className="mt-2 text-muted">No weak areas found yet. This is based on check results only.</p>
            : <ul className="mt-2 text-sm">{weak.map((w) => <li key={w.title}>{w.title} ({w.score}%)</li>)}</ul>}
        </div>
      </section>
      <h2 className="mt-12 font-display text-2xl">Learning paths</h2>
      {paths.length === 0 && <p className="mt-4 text-muted">No paths published yet. Run the seed script.</p>}
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {paths.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="font-medium">{p.discipline.title}: {p.title}</p>
              <p className="text-sm text-muted">
                {p.levels.reduce((n, l) => n + l.modules.length, 0)} module(s) · content in draft
              </p>
            </div>
            {enrolled.has(p.id) ? (
              <StateBadge state="active" />
            ) : (
              <form action={enroll}>
                <input type="hidden" name="pathId" value={p.id} />
                <Button type="submit">Enroll</Button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
