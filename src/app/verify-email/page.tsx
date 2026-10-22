import Link from "next/link";
import { peekToken } from "@/lib/auth/tokens";
import { verifyEmail } from "@/lib/auth/account";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

/**
 * Opening the link only shows a button; pressing it verifies. A mail scanner or link preview that fetches the URL
 * therefore cannot spend the token for the person.
 */
async function confirm(formData: FormData) {
  "use server";
  const ok = await verifyEmail(String(formData.get("token") ?? ""));
  const { redirect } = await import("next/navigation");
  redirect(`/verify-email?${ok ? "done=1" : "failed=1"}`);
}

export default async function VerifyEmail({ searchParams }: { searchParams: { token?: string; done?: string; failed?: string } }) {
  const live = searchParams.token ? await peekToken(searchParams.token, "VERIFY_EMAIL") : false;
  return (
    <div className="mx-auto max-w-sm px-6 py-24">
      <h1 className="font-display text-3xl">Confirm your email</h1>
      {searchParams.done ? <p role="status" className="mt-6 rounded border border-line bg-raised p-4">Thank you. Your email address is confirmed. <Link className="underline" href="/dashboard">Continue</Link>.</p>
        : live ? (
          <form action={confirm} className="mt-6">
            <input type="hidden" name="token" value={searchParams.token} />
            <p className="mb-4 text-muted">Press the button to confirm this address.</p>
            <Button type="submit">Confirm my email</Button>
          </form>
        ) : <p role="alert" className="mt-6 rounded border border-line bg-raised p-4">This link has expired or was already used. Sign in and ask for a new one from your <Link className="underline" href="/profile">profile</Link>.</p>}
    </div>
  );
}
