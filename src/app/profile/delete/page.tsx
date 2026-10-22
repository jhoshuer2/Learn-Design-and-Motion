import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { AccountError, DELETE_PHRASE, deleteAccount } from "@/lib/account/delete";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

export const dynamic = "force-dynamic";

async function remove(formData: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await deleteAccount(user.id, { password: String(formData.get("password") ?? ""), confirm: String(formData.get("confirm") ?? "") });
  } catch (e) {
    if (e instanceof AccountError) redirect(`/profile/delete?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  await signOut({ redirectTo: "/?deleted=1" });
}

export default async function DeleteAccount({ searchParams }: { searchParams: { error?: string } }) {
  await requireUser();
  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <nav className="text-sm"><Link href="/profile" className="underline">Profile</Link></nav>
      <h1 className="mt-4 font-display text-4xl">Delete my account</h1>
      <p className="mt-3 text-muted">This cannot be undone. There is no waiting period and no way to get anything back.</p>
      <section className="mt-6 grid gap-6 sm:grid-cols-2" aria-label="What happens">
        <div>
          <h2 className="font-medium">Deleted immediately</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Your account, email address and password.</li>
            <li>Every submission, uploaded file, assessment and appeal.</li>
            <li>All progress, quiz attempts, skill evidence and level records.</li>
            <li>Every portfolio project: shared pages and images stop working at once.</li>
            <li>Feedback you wrote on other people&rsquo;s work, and feedback on yours.</li>
            <li>Your notices, blocks and reports.</li>
          </ul>
        </div>
        <div>
          <h2 className="font-medium">Kept</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>An operational log of actions (for example &ldquo;submission assessed&rdquo;) with <strong>no</strong> link to you.</li>
            <li>If you were a reviewer, your decisions on other people&rsquo;s work stay, without your name.</li>
          </ul>
          <p className="mt-3 text-sm text-muted">We do not offer a data export yet. People who already saw or copied your shared work may still have it. Backups, if any are kept by whoever runs this site, are outside what this button can reach.</p>
        </div>
      </section>
      {searchParams.error && <p role="alert" className="mt-6 text-danger">{searchParams.error}</p>}
      <form action={remove} className="mt-8 flex flex-col gap-4">
        <Field id="password" label="Your password" type="password" required autoComplete="current-password" />
        <Field id="confirm" label={`Type “${DELETE_PHRASE}” to confirm`} required autoComplete="off" />
        <Button type="submit">Delete my account permanently</Button>
      </form>
    </div>
  );
}
