import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { listMine, markAllRead } from "@/lib/notify";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

async function readAll() {
  "use server";
  const user = await requireUser();
  await markAllRead(user.id);
  redirect("/notifications");
}

export default async function Notifications() {
  const user = await requireUser();
  const items = await listMine(user.id);
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/dashboard" className="text-sm underline">Dashboard</Link>
      <h1 className="mt-4 font-display text-4xl">Notices</h1>
      <p className="mt-2 text-muted">Decisions about your shared work. We do not send email yet, so check here.</p>
      {items.length === 0 ? <p className="mt-8 text-muted">Nothing yet.</p> : (
        <>
          {unread > 0 && <form action={readAll} className="mt-4"><Button type="submit" variant="secondary">Mark all as read</Button></form>}
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {items.map((n) => (
              <li key={n.id} className="py-4">
                <p className={n.readAt ? "text-muted" : "font-medium"}>{!n.readAt && <span className="sr-only">Unread: </span>}{n.text}</p>
                <p className="mt-1 text-sm text-muted">{n.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
