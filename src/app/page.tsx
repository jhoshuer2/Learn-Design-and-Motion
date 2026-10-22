import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function Landing({ searchParams }: { searchParams: { deleted?: string } }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24">
      {searchParams.deleted && <p role="status" className="mb-8 rounded border border-line bg-raised p-4">Your account and everything in it were deleted.</p>}
      <p className="text-sm uppercase tracking-widest text-muted">Creative Mastery</p>
      <h1 className="mt-4 font-display text-5xl leading-tight sm:text-6xl">
        Don&rsquo;t just learn the craft. Prove you can do it.
      </h1>
      <p className="mt-6 max-w-measure text-lg text-muted">
        Structured paths, rubric-based assessment and a portfolio of assessed work. You advance on
        demonstrated skill, not on videos watched.
      </p>
      <div className="mt-10 flex gap-4">
        <Link href="/signup"><Button>Create an account</Button></Link>
        <Link href="/signin"><Button variant="secondary">Sign in</Button></Link>
      </div>
    </div>
  );
}
