import Link from "next/link";
import { DraftBanner } from "@/components/DraftBanner";

export default function Terms() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <nav className="text-sm"><Link href="/" className="underline">Creative Mastery</Link></nav>
      <h1 className="mt-4 font-display text-4xl">Terms of use</h1>
      <div className="mt-4"><DraftBanner /></div>
      <div className="mt-8 space-y-6 [&_h2]:font-display [&_h2]:text-2xl [&_p]:mt-2 [&_p]:max-w-measure">
        <section><h2>Your work stays yours</h2><p>You keep ownership of what you submit. You give the site permission to store it, show it to the people you choose to share it with, and have it assessed. You can stop sharing at any time, and you can delete your account and everything in it.</p></section>
        <section><h2>Assessment is a learning aid</h2><p>Results are produced by an automated assessor or by a reviewer, against a published rubric, and are meant to help you improve. They are not a qualification, a certificate or a guarantee of professional competence. Where a result came from a test evaluator, it is labelled as one and is not an assessment of your work.</p></section>
        <section><h2>Following the content policy</h2><p>You agree to follow the <Link className="underline" href="/policy">content policy</Link>. Work that breaks it can be taken down.</p></section>
        <section><h2>No guarantees</h2><p>The site is provided as it is. It may be unavailable, assessments may be wrong, and features may change. Where the law allows, the operator is not liable for losses from using it.</p></section>
        <section><h2>Changes and contact</h2><p>These terms may change. The site operator&rsquo;s name, address and contact details, and the governing law, are not filled in yet and must be added before launch.</p></section>
      </div>
    </article>
  );
}
