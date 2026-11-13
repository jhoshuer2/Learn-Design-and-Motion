/** Our own explainer: captions are required by the loader, so the track is always present, with the transcript under it. */
export function LessonVideo({ name, caption, transcript }: { name: string; caption: string; transcript: string[] }) {
  return (
    <figure className="rounded border border-line bg-raised p-4">
      <video controls preload="metadata" playsInline className="w-full rounded bg-black" aria-label={caption}>
        <source src={`/lessons/${name}.mp4`} type="video/mp4" />
        <track kind="captions" src={`/lessons/${name}.vtt`} srcLang="en" label="English" default />
      </video>
      <figcaption className="mt-3 max-w-measure text-sm text-muted">{caption}</figcaption>
      {transcript.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium">Transcript</summary>
          <p className="mt-2 max-w-measure space-y-2 text-muted">{transcript.join(" ")}</p>
        </details>
      )}
    </figure>
  );
}

/** A curated outside tutorial. We say why it is worth watching and link out; the player loads only when asked (privacy-friendly host). */
export function WatchCard({ id, title, why }: { id: string; title: string; why: string }) {
  return (
    <figure className="rounded border border-line bg-raised p-4">
      <p className="text-xs font-medium uppercase tracking-widest text-muted">Worth watching</p>
      <p className="mt-1 font-medium">{title}</p>
      <p className="mt-1 max-w-measure text-sm text-muted">{why}</p>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium">Play here</summary>
        <div className="mt-3 aspect-video">
          <iframe className="h-full w-full rounded" loading="lazy" title={title} src={`https://www.youtube-nocookie.com/embed/${id}`} allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        </div>
      </details>
      <p className="mt-3 text-sm"><a className="underline" href={`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noopener noreferrer">Open on YouTube</a> (outside our platform)</p>
    </figure>
  );
}
