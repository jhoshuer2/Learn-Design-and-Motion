import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientKey } from "@/lib/ratelimit";
import { TakedownError, REASON_MAX, submitTakedown } from "@/lib/safety/takedown";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

export const dynamic = "force-dynamic";

async function send(formData: FormData) {
  "use server";
  try {
    await submitTakedown(
      { link: String(formData.get("link") ?? ""), reason: String(formData.get("reason") ?? ""), name: String(formData.get("name") ?? ""), email: String(formData.get("email") ?? ""), website: String(formData.get("website") ?? "") },
      clientKey(headers()),
    );
  } catch (e) {
    if (e instanceof TakedownError) redirect(`/report-abuse?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect("/report-abuse?sent=1");
}

export default function ReportAbuse({ searchParams }: { searchParams: { error?: string; sent?: string } }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <nav className="text-sm"><Link href="/" className="underline">Creative Mastery</Link></nav>
      <h1 className="mt-4 font-display text-4xl">Report content</h1>
      <p className="mt-3 max-w-measure text-muted">Use this to report shared work that breaks our <Link className="underline" href="/policy">content policy</Link>, or to ask for work of yours to be taken down. You do not need an account. A reviewer reads every report.</p>
      {searchParams.sent ? (
        <p role="status" className="mt-8 rounded border border-line bg-raised p-4">Thank you. Your report was received and will be looked at by a person. We cannot promise a reply time. If you gave an email address we may use it to ask a question or tell you the outcome.</p>
      ) : (
        <form action={send} className="mt-8 flex flex-col gap-4">
          {searchParams.error && <p role="alert" className="text-danger">{searchParams.error}</p>}
          <Field id="link" label="Link to the page (the address starts with /p/)" maxLength={300} placeholder="https://…/p/…" />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="reason" className="text-sm font-medium">What is the problem? (at least 20 characters)</label>
            <textarea id="reason" name="reason" required minLength={20} maxLength={REASON_MAX} rows={6} className="rounded border border-line bg-raised p-3" />
          </div>
          <Field id="name" label="Your name (optional)" maxLength={100} autoComplete="name" />
          <Field id="email" label="Your email, only if you want a reply (optional)" type="email" maxLength={200} autoComplete="email" />
          <p className="text-sm text-muted">If you give your name or email we keep them only to follow up, and remove them 90 days after your report is handled. The owner of the work is never told who reported it.</p>
          <div aria-hidden className="absolute left-[-9999px]"><label>Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <Button type="submit">Send report</Button>
        </form>
      )}
    </div>
  );
}
