import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { createLearner } from "@/lib/signup";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

async function signup(formData: FormData) {
  "use server";
  const res = await createLearner({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!res.ok) redirect(`/signup?error=${encodeURIComponent(res.error)}`);
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (e) {
    if (e instanceof AuthError) redirect("/signin");
    throw e;
  }
}

export default function SignUp({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <form action={signup} className="mx-auto flex max-w-sm flex-col gap-5 px-6 py-24">
      <h1 className="font-display text-3xl">Create your account</h1>
      {searchParams.error && <p role="alert" className="text-danger">{searchParams.error}</p>}
      <Field id="name" label="Name" required autoComplete="name" />
      <Field id="email" label="Email" type="email" required autoComplete="email" />
      <Field id="password" label="Password (10+ characters)" type="password" required minLength={10} autoComplete="new-password" />
      <Button type="submit">Sign up</Button>
    </form>
  );
}
