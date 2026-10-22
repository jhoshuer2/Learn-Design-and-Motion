import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkLogin } from "@/lib/auth/throttle";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  if ((await checkLogin(email, headers())).blocked) redirect("/signin?error=locked");
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (e) {
    if (e instanceof AuthError) {
      // The attempt that crosses the limit looks the same as any other failure; the next one explains.
      redirect("/signin?error=1");
    }
    throw e;
  }
}

export default function SignIn({ searchParams }: { searchParams: { error?: string; reset?: string } }) {
  return (
    <form action={login} className="mx-auto flex max-w-sm flex-col gap-5 px-6 py-24">
      <h1 className="font-display text-3xl">Sign in</h1>
      {searchParams.error === "locked" && <p role="alert" className="text-danger">Too many failed attempts. Wait a few minutes and try again, or <Link className="underline" href="/forgot-password">reset your password</Link>.</p>}
      {searchParams.error && searchParams.error !== "locked" && <p role="alert" className="text-danger">Email or password is incorrect.</p>}
      {searchParams.reset && <p role="status" className="text-success">Your password was changed. Sign in with the new one.</p>}
      <Field id="email" label="Email" type="email" required autoComplete="email" />
      <Field id="password" label="Password" type="password" required autoComplete="current-password" />
      <Button type="submit">Sign in</Button>
      <p className="text-sm"><Link className="underline" href="/forgot-password">Forgot your password?</Link></p>
    </form>
  );
}
