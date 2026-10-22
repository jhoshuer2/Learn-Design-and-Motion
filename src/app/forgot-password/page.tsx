import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requestPasswordReset } from "@/lib/auth/account";
import { clientKey } from "@/lib/ratelimit";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

export const dynamic = "force-dynamic";

async function request(formData: FormData) {
  "use server";
  await requestPasswordReset(String(formData.get("email") ?? ""), clientKey(headers()));
  redirect("/forgot-password?sent=1");
}

export default function Forgot({ searchParams }: { searchParams: { sent?: string } }) {
  return (
    <div className="mx-auto max-w-sm px-6 py-24">
      <h1 className="font-display text-3xl">Reset your password</h1>
      {searchParams.sent ? (
        <p role="status" className="mt-6 rounded border border-line bg-raised p-4">If an account uses that address, we have sent a link to choose a new password. It works for one hour and once. Check your spam folder if it does not arrive.</p>
      ) : (
        <form action={request} className="mt-6 flex flex-col gap-5">
          <Field id="email" label="Email" type="email" required autoComplete="email" />
          <Button type="submit">Send reset link</Button>
        </form>
      )}
      <p className="mt-6 text-sm"><Link className="underline" href="/signin">Back to sign in</Link></p>
    </div>
  );
}
