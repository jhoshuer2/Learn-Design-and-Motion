export function TooManyRequests({ seconds }: { seconds: number }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-24">
      <h1 className="display display-m">Too many requests</h1>
      <p className="mt-3 text-ink-2">You are loading pages faster than we allow. Please wait about {seconds} seconds and try again.</p>
    </div>
  );
}
