"use client";
import { useEffect, useRef } from "react";

/** Stops the form from being submitted while any direct upload inside it is still running. */
export function BlockWhileUploading() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const stop = (e: Event) => { if (form.querySelector('[data-upload-busy="true"]')) e.preventDefault(); };
    form.addEventListener("submit", stop);
    return () => form.removeEventListener("submit", stop);
  }, []);
  return <span ref={ref} hidden />;
}
