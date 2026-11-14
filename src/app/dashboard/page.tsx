/* eslint-disable @next/next/no-img-element */
import { revalidatePath } from "next/cache";
import { loadOutcomes } from "@/lib/content/outcomes";
import { signOut } from "@/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { unreadCount } from "@/lib/notify";
import { requireUser } from "@/lib/session";
import { getTimeline, getWeakCompetencies } from "@/lib/progression";
import { nextHref } from "@/lib/progression/links";
import { Button, Arrow } from "@/components/ui/Button";
import { Pip } from "@/components/ui/Pip";
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
    db.path.findMany({ orderBy: [{ discipline: { title: "asc" } }, { title: "asc" }], include: { discipline: true, levels: { include: { modules: true } } } }),
    db.enrollment.findMany({ where: { userId: user.id } }),
  ]);
  const enrolled = new Set(enrollments.map((e) => e.pathId));
  const timelines = await Promise.all(enrollments.map((e) => getTimeline(user.id, e.pathId)));
  const next = timelines.find((t) => t?.next)?.next ?? null;
  const weak = await getWeakCompetencies(user.id);
  const unread = await unreadCount(user.id);

  const sharing = [
    ["/portfolio", "My portfolio"], ["/community", "Community"], ["/profile", "Profile"],
    ["/notifications", `Notices${unread > 0 ? ` (${unread} unread)` : ""}`],
    ...(user.role === "REVIEWER" || user.role === "ADMIN"
      ? [["/review", "Review appeals"], ["/review/moderation", "Approvals and reports"], ["/review/takedowns", "Takedown requests"], ["/admin/assessments", "Assessment queue"]]
      : []),
  ];
  return (
    <div className="mx-auto max-w-page px-6 pb-16 pt-10 sm:pt-16">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="label">Dashboard</p>
          <h1 className="display display-l mt-3">Welcome, <em>{user.name ?? user.email}</em></h1>
        </div>
        <form action={logout}><Button variant="secondary" type="submit">Sign out</Button></form>
      </header>
      <nav aria-label="Sharing" className="mt-8 flex flex-wrap gap-2">
        {sharing.map(([href, label]) => (
          <Link key={href} href={href} className="rounded-full bg-paper-2 px-4 py-2 text-sm font-semibold transition hover:bg-ink hover:text-paper">{label}</Link>
        ))}
      </nav>

      <section className="mt-12 grid gap-5 lg:grid-cols-[1.5fr_1fr_1fr]" aria-label="Where you are">
        <div className="relative overflow-hidden rounded-window bg-ink p-8 text-paper sm:p-10" data-reveal>
          <h2 className="label !text-paper opacity-70">Do next</h2>
          {next ? (
            <Link className="display mt-4 block max-w-[16ch] text-4xl underline-offset-[6px] hover:underline sm:text-5xl" href={nextHref(next)}>{next.title}</Link>
          ) : (
            <p className="mt-4 max-w-xs text-paper/70">Enroll in a path to get a next step.</p>
          )}
          <Link href="/today" className="pill pill-accent mt-8">Today&rsquo;s session<Arrow /></Link>
          <div className="pointer-events-none absolute -bottom-2 right-6 hidden opacity-95 sm:block"><Pip size={130} /></div>
        </div>
        <div className="surface-card p-7" data-reveal style={{ ["--d" as string]: 1 }}>
          <h2 className="label">Where am I</h2>
          <p className="display mt-4 text-3xl">{timelines.find((t) => t)?.pathTitle ?? "Not enrolled yet"}</p>
          <Link href="/learn" className="link-quiet mt-4 inline-block text-sm font-semibold">My learning</Link>
        </div>
        <div className="surface-card p-7" data-reveal style={{ ["--d" as string]: 2 }}>
          <h2 className="label">Improve</h2>
          {weak.length === 0 ? (
            <p className="mt-4 text-[0.9375rem] text-ink-2">No weak areas found yet. This is based on assessed evidence only.</p>
          ) : (
            <ul className="mt-4 text-[0.9375rem]">{weak.map((w) => <li key={w.title}>{w.title} ({w.score}%)</li>)}</ul>
          )}
          <Link href="/profile/skills" className="link-quiet mt-4 inline-block text-sm font-semibold">All my skills</Link>
        </div>
      </section>

      {loadOutcomes().map((o) => (
        <section key={o.slug} className="mt-16" aria-label="Something to make" data-reveal>
          <Link href={`/learn/outcome/${o.slug}`} className="lift grid items-center gap-8 sm:grid-cols-[1fr_1.2fr]">
            <div className="frame aspect-[16/10]"><img src="/art/path-motion.webp" width={1280} height={720} alt="" className="h-full w-full object-cover" /></div>
            <span>
              <span className="label block">Want something to make?</span>
              <span className="display display-m mt-3 block">{o.title}</span>
              <span className="lede mt-3 block !text-base">{o.promise}</span>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold">See the path<Arrow /></span>
            </span>
          </Link>
        </section>
      ))}

      <h2 className="display display-m mt-20">Learning paths</h2>
      {paths.length === 0 && <p className="mt-4 text-ink-2">No paths published yet. Run the seed script.</p>}
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {paths.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-4 py-5">
            <div>
              <p className="title">{p.discipline.title}: {p.title}</p>
              <p className="label mt-1">{p.levels.reduce((n, l) => n + l.modules.length, 0)} module(s) · content in draft</p>
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
