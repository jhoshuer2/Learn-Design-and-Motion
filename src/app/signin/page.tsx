import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

async function login(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (e) {
    if (e instanceof AuthError) redirect("/signin?error=1");
    throw e;
  }
}

export default function SignIn({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <form action={login} className="mx-auto flex max-w-sm flex-col gap-5 px-6 py-24">
      <h1 className="font-display text-3xl">Sign in</h1>
      {searchParams.error && <p role="alert" className="text-danger">Email or password is incorrect.</p>}
      <Field id="email" label="Email" type="email" required autoComplete="email" />
      <Field id="password" label="Password" type="password" required autoComplete="current-password" />
      <Button type="submit">Sign in</Button>
    </form>
  );
}
