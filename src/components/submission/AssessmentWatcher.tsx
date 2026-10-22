"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Status = { phase: string; submissionStatus: string; position: number | null; message: string };

/**
 * Keeps an in-progress assessment page current. Polls every 3 s, easing to 10 s, and gives up after 10 minutes
 * (it says so; the page still works without it). When the submission's status changes it refreshes the page.
 */
export function AssessmentWatcher({ submissionId, initial }: { submissionId: string; initial: Status }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initial);
  const [gaveUp, setGaveUp] = useState(false);
  const known = useRef(`${initial.submissionStatus}:${initial.phase}`);

  useEffect(() => {
    const started = Date.now();
    let delay = 3000;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - started > 10 * 60_000) { setGaveUp(true); return; }
      try {
        const res = await fetch(`/api/submissions/${submissionId}/status`, { cache: "no-store" });
        if (res.ok) {
          const next = (await res.json()) as Status;
          setStatus(next);
          const key = `${next.submissionStatus}:${next.phase}`;
          if (key !== known.current) router.refresh();
          known.current = key;
        }
      } catch { /* offline or restarting: try again */ }
      delay = Math.min(10_000, Math.round(delay * 1.3));
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, delay);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [submissionId, router]);

  return (
    <div role="status" aria-live="polite" data-phase={status.phase}>
      <p className="text-muted">
        {status.message}
        {status.phase === "queued" && status.position !== null && status.position > 0 && ` ${status.position} ahead of you.`}
      </p>
      <p className="mt-2 text-sm text-muted">
        {gaveUp ? "We stopped checking automatically. " : "This page updates by itself. "}
        <a className="underline" href={`/learn/submission/${submissionId}`}>Refresh</a> to check now. No score or attempt is used until a result is recorded.
      </p>
    </div>
  );
}
