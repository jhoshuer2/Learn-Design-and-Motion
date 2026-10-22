import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PortfolioError } from "@/lib/portfolio";
import { setDisplayName } from "@/lib/portfolio/names";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { AuthFlowError, changePassword, sendVerification, signOutEverywhere } from "@/lib/auth/account";
import { MIN_PASSWORD } from "@/lib/auth/password";

async function resend() {
  "use server";
  const user = await requireUser();
  let r = "";
  try { r = await sendVerification(user.id); } catch (e) { if (e instanceof AuthFlowError) redirect(`/profile?error=${encodeURIComponent(e.message)}`); throw e; }
  redirect(`/profile?mail=${r}`);
}

async function change(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await changePassword(user.id, String(formData.get("current") ?? ""), String(formData.get("next") ?? ""));
  } catch (e) {
    if (e instanceof AuthFlowError) redirect(`/profile?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect("/signin?reset=1"); // every session, including this one, now has to sign in again
}

async function everywhere() {
  "use server";
  const user = await requireUser();
  await signOutEverywhere(user.id);
  redirect("/signin");
}

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

export default async function Profile({ searchParams }: { searchParams: { error?: string; saved?: string; mail?: string } }) {
  const user = await requireUser();
  const me = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { displayName: true, email: true, emailVerifiedAt: true } });
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
      {searchParams.mail && <p role="status" className="mt-4">{searchParams.mail === "sent" ? "We sent a confirmation link. It works for 48 hours." : searchParams.mail === "already_verified" ? "Your email is already confirmed." : "Email delivery is not set up on this server, so no message could be sent. Tell the site operator."}</p>}
      <section className="mt-8 rounded border border-line bg-raised p-4" aria-labelledby="email-status">
        <h2 id="email-status" className="font-medium">Email address</h2>
        <p className="mt-1 text-sm text-muted">{me.email}: {me.emailVerifiedAt ? "confirmed" : "not confirmed yet. Sharing work, leaving feedback, reporting and appeals need a confirmed address."}</p>
        {!me.emailVerifiedAt && <form action={resend} className="mt-3"><Button type="submit" variant="secondary">Send the confirmation email again</Button></form>}
      </section>
      <form action={save} className="mt-6 flex flex-col gap-4">
        <Field id="displayName" label="Display name (2 to 40 characters)" defaultValue={me.displayName ?? ""} required maxLength={40} autoComplete="nickname" />
        <Button type="submit">Save display name</Button>
      </form>
      <section className="mt-12 border-t border-line pt-8" aria-labelledby="security">
        <h2 id="security" className="font-display text-2xl">Password and sessions</h2>
        <form action={change} className="mt-4 flex flex-col gap-4">
          <Field id="current" label="Current password" type="password" required autoComplete="current-password" />
          <Field id="next" label={`New password (${MIN_PASSWORD}+ characters)`} type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" />
          <Button type="submit">Change password</Button>
          <p className="text-sm text-muted">Changing your password signs you out everywhere, including here.</p>
        </form>
        <form action={everywhere} className="mt-6"><Button type="submit" variant="secondary">Sign out everywhere</Button></form>
      </section>
      <p className="mt-12 border-t border-line pt-6 text-sm text-muted">Want to leave? <Link className="underline" href="/profile/delete">Delete my account</Link>.</p>
    </div>
  );
}
