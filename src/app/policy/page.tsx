import Link from "next/link";
import { DraftBanner } from "@/components/DraftBanner";

export default function Policy() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <nav className="text-sm"><Link href="/" className="underline">Creative Mastery</Link></nav>
      <h1 className="mt-4 font-display text-4xl">Content policy</h1>
      <div className="mt-4"><DraftBanner /></div>
      <div className="mt-8 space-y-6 [&_h2]:font-display [&_h2]:text-2xl [&_p]:mt-2 [&_p]:max-w-measure [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        <section><h2>What this site is for</h2><p>Learners share their own creative work so they can get feedback and show what they can do. Everything you share must be your own work, or work you have the right to share.</p></section>
        <section><h2>What you may not share</h2>
          <ul>
            <li>Anything illegal, or that sexually exploits or endangers a child.</li>
            <li>Sexually explicit, graphically violent or hateful content, or content that harasses or threatens a person.</li>
            <li>Other people&rsquo;s work passed off as yours, or work that infringes someone&rsquo;s copyright or trademark.</li>
            <li>Other people&rsquo;s personal information, and your own contact details or links in titles, introductions, rationales and feedback. Shared text is checked for these and refused.</li>
            <li>Spam, advertising or attempts to trick or harm other users.</li>
          </ul></section>
        <section><h2>How sharing is controlled</h2>
          <p><strong>Private</strong> work is visible only to you. <strong>Anyone with the link</strong> is not listed anywhere, but anyone who has the link can see it. <strong>Public</strong> work is checked by a person before anyone else can see it, and checked again if you change what it shows.</p>
          <p>We check text with a basic automatic filter and images by looking at them. Neither check is perfect, and passing a check does not mean we have endorsed your work.</p></section>
        <section><h2>Peer feedback</h2><p>Feedback must be specific, respectful and about the work. You can hide or delete feedback on your work and block people from reviewing it.</p></section>
        <section><h2>Reporting and taking work down</h2>
          <p>Any signed-in person can report a project or a piece of feedback. Anyone, signed in or not, can <Link className="underline" href="/report-abuse">report content or ask for it to be taken down</Link>. A reviewer looks at each report. They can put a project on hold, which makes it private and stops it being shared again, or dismiss the report. The owner is told what was decided, and why, but never who reported it.</p></section>
        <section><h2>What happens if you break these rules</h2><p>Work can be taken down. Repeated or serious breaches can lead to the account being closed. There is no appeals process for takedowns yet; you can reply to the reviewer by reporting the decision to the site operator.</p></section>
      </div>
    </article>
  );
}
