import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
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

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-4xl">Welcome, {user.name ?? user.email}</h1>
        <form action={logout}><Button variant="secondary" type="submit">Sign out</Button></form>
      </header>
      <p className="mt-4 text-muted">
        Lessons, assessments and progression arrive in the next milestones. For now you can enroll in a path.
      </p>
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
