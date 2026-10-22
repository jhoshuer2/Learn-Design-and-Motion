import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PortfolioError } from "@/lib/portfolio";
import { setDisplayName } from "@/lib/portfolio/names";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

async function save(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await setDisplayName(user.id, String(formData.get("displayName") ?? ""));
  } catch (e) {
    if (e instanceof PortfolioError) redirect(`/profile?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect("/profile?saved=1");
}

export default async function Profile({ searchParams }: { searchParams: { error?: string; saved?: string } }) {
  const user = await requireUser();
  const me = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { displayName: true } });
  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <nav className="flex gap-4 text-sm"><Link href="/dashboard" className="underline">Dashboard</Link><Link href="/portfolio" className="underline">My portfolio</Link></nav>
      <h1 className="mt-4 font-display text-4xl">Profile</h1>
      <p className="mt-3 max-w-measure text-muted">
        Your display name is the only name other people see on shared work and on feedback you leave. It is separate from your account,
        and your email address is never shown. You need one before you can share work or review someone else&rsquo;s.
      </p>
      {searchParams.error && <p role="alert" className="mt-4 text-danger">{searchParams.error}</p>}
      {searchParams.saved && <p role="status" className="mt-4 text-success">Saved.</p>}
      <form action={save} className="mt-6 flex flex-col gap-4">
        <Field id="displayName" label="Display name (2 to 40 characters)" defaultValue={me.displayName ?? ""} required maxLength={40} autoComplete="nickname" />
        <Button type="submit">Save display name</Button>
      </form>
      <p className="mt-12 border-t border-line pt-6 text-sm text-muted">Want to leave? <Link className="underline" href="/profile/delete">Delete my account</Link>.</p>
    </div>
  );
}
