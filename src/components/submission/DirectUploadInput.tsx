"use client";
import { useRef, useState } from "react";

type Props = { assignmentId: string; slotKey: string; label: string; hint: string; required: boolean };
const MAX = 8 * 1024 * 1024;

/**
 * One deliverable's file field. The browser sends the image straight to the private bucket with a short-lived URL and
 * submits only a token; the server reads the object back and validates it. The plain file input stays in the form, so
 * it still works if this script does not run, and its value is cleared after a successful upload so the big file is not
 * posted twice.
 */
export function DirectUploadInput({ assignmentId, slotKey, label, hint, required }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "done" | "error"; text: string }>({ kind: "idle", text: "" });

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setToken(""); setName("");
    if (!file) { setStatus({ kind: "idle", text: "" }); return; }
    if (file.size > MAX) { setStatus({ kind: "error", text: "Each file must be 8 MB or smaller." }); return; }
    setStatus({ kind: "busy", text: "Uploading…" });
    try {
      const res = await fetch("/api/submissions/upload-url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, slot: slotKey, size: file.size, mime: file.type }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Could not start the upload.");
      const put = await fetch(j.url, { method: "PUT", headers: j.headers, body: file });
      if (!put.ok) throw new Error("The upload did not finish. Try again.");
      setToken(j.token); setName(file.name);
      if (input.current) input.current.value = "";
      setStatus({ kind: "done", text: `Uploaded ${file.name}. It is checked when you submit.` });
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "The upload failed." });
    }
  }

  return (
    <div>
      <label htmlFor={slotKey} className="block text-sm font-medium">{label} ({required ? "required" : "optional"})</label>
      <p id={`${slotKey}-hint`} className="text-sm text-muted">{hint}</p>
      <input ref={input} id={slotKey} name={slotKey} type="file" accept="image/png,image/jpeg,image/webp" aria-describedby={`${slotKey}-hint`} onChange={onChange} className="mt-1 block min-h-11" />
      <input type="hidden" name={`upload_${slotKey}`} value={token} />
      <input type="hidden" name={`name_${slotKey}`} value={name} />
      {/* The submit button reads this: it stays disabled while any upload is in progress. */}
      <input type="hidden" data-upload-busy={status.kind === "busy" ? "true" : "false"} />
      <p role="status" aria-live="polite" className={status.kind === "error" ? "mt-1 text-sm text-danger" : "mt-1 text-sm text-muted"}>{status.text}</p>
    </div>
  );
}
