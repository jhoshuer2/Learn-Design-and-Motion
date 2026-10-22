import Link from "next/link";
import { DraftBanner } from "@/components/DraftBanner";

export default function Privacy() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <nav className="text-sm"><Link href="/" className="underline">Creative Mastery</Link></nav>
      <h1 className="mt-4 font-display text-4xl">Privacy notice</h1>
      <div className="mt-4"><DraftBanner /></div>
      <div className="mt-8 space-y-6 [&_h2]:font-display [&_h2]:text-2xl [&_p]:mt-2 [&_p]:max-w-measure [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        <section><h2>What we keep</h2>
          <ul>
            <li>Your account: name, email address and a hashed password.</li>
            <li>Your learning: progress, quiz attempts, submissions (images and text), assessments, appeals and skill records.</li>
            <li>What you choose to share: portfolio projects, your display name, feedback you give and receive.</li>
            <li>A log of actions on the site (for example &ldquo;submission assessed&rdquo;), used to run and protect the service.</li>
            <li>Rate-limit counters, keyed by a one-way hash of your network address, deleted within hours. We do not store your address.</li>
            <li>If you file a complaint: what you write, and your name and email if you give them, kept for {90} days after the complaint is handled.</li>
          </ul></section>
        <section><h2>Who sees it</h2>
          <p>Only you see your private work. Reviewers can open a submission when an assessment needs a person (they do not see who it belongs to). When you choose to share, the people you share with see only what the share page shows: your display name, the images and text you chose, and, if you choose, your assessment result. Never your email or account name.</p>
          <p>Your submitted images and text are sent to an AI service (Anthropic) to be assessed, unless a reviewer assesses them. The service provider&rsquo;s own terms and retention rules apply to that processing and are not summarised here.</p></section>
        <section><h2>Your choices</h2>
          <p>You can unshare or delete any project at any time, and <Link className="underline" href="/profile/delete">delete your account</Link> to remove your account and everything you made. A data export is not available yet. Deletion cannot reach copies other people already made of work you shared, or backups held by the site operator.</p></section>
        <section><h2>Not yet covered</h2><p>The operator&rsquo;s identity and contact details, the legal basis for processing, retention of backups, international transfers and children&rsquo;s use are not written yet and need legal advice before launch.</p></section>
      </div>
    </article>
  );
}
