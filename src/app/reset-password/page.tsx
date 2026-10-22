import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthFlowError, resetLinkIsLive, resetPassword } from "@/lib/auth/account";
import { MIN_PASSWORD } from "@/lib/auth/password";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

export const dynamic = "force-dynamic";

async function reset(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  try {
    await resetPassword(token, String(formData.get("password") ?? ""));
  } catch (e) {
    if (e instanceof AuthFlowError) redirect(`/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect("/signin?reset=1");
}

export default async function ResetPassword({ searchParams }: { searchParams: { token?: string; error?: string } }) {
  const token = searchParams.token ?? "";
  const live = token ? await resetLinkIsLive(token) : false;
  return (
    <div className="mx-auto max-w-sm px-6 py-24">
      <h1 className="font-display text-3xl">Choose a new password</h1>
      {!live ? (
        <p role="alert" className="mt-6 rounded border border-line bg-raised p-4">This link has expired or was already used. <Link className="underline" href="/forgot-password">Ask for a new one</Link>.</p>
      ) : (
        <form action={reset} className="mt-6 flex flex-col gap-5">
          <input type="hidden" name="token" value={token} />
          {searchParams.error && <p role="alert" className="text-danger">{searchParams.error}</p>}
          <Field id="password" label={`New password (${MIN_PASSWORD}+ characters)`} type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" />
          <p className="text-sm text-muted">Changing your password signs you out everywhere.</p>
          <Button type="submit">Change password</Button>
        </form>
      )}
    </div>
  );
}
