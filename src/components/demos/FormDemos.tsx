// Fixed colours on purpose: structure, cues and states ARE the lesson. Invented ferry operator; no real app is copied.
const Tag = ({ children }: { children: React.ReactNode }) => <p className="mb-2 text-xs font-medium text-muted">{children}</p>;
const Pair = ({ children }: { children: React.ReactNode }) => <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
const Phone = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto w-full max-w-[260px] overflow-hidden rounded-[22px] border-2 p-3" style={{ background: "#ffffff", borderColor: "#2b2a24", color: "#1c1b16" }}>{children}</div>
);
const MUTED = "#4a463b", BLUE = "#1a2fb8", RED = "#b3261e";

export function FormLayout() {
  return (
    <Pair>
      <div><Tag>Weak: placeholder-only labels, no grouping, a vague button</Tag>
        <Phone><div className="space-y-2 text-[12px]">
          {["Name", "Email", "Phone", "Seat type", "Notes"].map((p) => <div key={p} className="h-7 rounded border px-2 py-1" style={{ borderColor: "#d8d4c6", color: "#9b9788" }}>{p}</div>)}
          <div className="rounded py-1.5 text-center" style={{ background: "#e6e3d8", color: MUTED }}>Submit</div>
        </div></Phone></div>
      <div><Tag>Strong: labels above fields, grouped, optional marked, a specific button</Tag>
        <Phone><div className="text-[12px]">
          <p className="text-[14px] font-bold">Passenger details</p>
          <p className="mt-3 text-[11px] font-semibold uppercase" style={{ color: MUTED, letterSpacing: ".08em" }}>Who is travelling</p>
          {[["Full name", ""], ["Email for your ticket", ""]].map(([l]) => (
            <div key={l} className="mt-2"><p className="mb-1 font-semibold">{l}</p><div className="h-10 rounded border" style={{ borderColor: "#6b675a" }} /></div>
          ))}
          <p className="mt-3 text-[11px] font-semibold uppercase" style={{ color: MUTED, letterSpacing: ".08em" }}>Extras</p>
          <div className="mt-2"><p className="mb-1 font-semibold">Bicycle space <span className="font-normal" style={{ color: MUTED }}>(optional)</span></p><div className="h-10 rounded border" style={{ borderColor: "#6b675a" }} /></div>
          <div className="mt-4 rounded py-3 text-center text-[13px] font-semibold" style={{ background: BLUE, color: "#fff" }}>Continue to payment</div>
        </div></Phone></div>
    </Pair>
  );
}

export function NavPatterns() {
  const items = ["Tickets", "Timetable", "Account"];
  return (
    <Pair>
      <div><Tag>Unclear: icons only, no current location, tiny targets</Tag>
        <Phone><div className="text-[12px]">
          <p className="text-[14px] font-bold">Passenger details</p>
          <div className="h-28" />
          <div className="flex justify-around border-t pt-2" style={{ borderColor: "#d8d4c6" }}>
            {["○", "△", "□"].map((g) => <span key={g} className="text-[14px]" style={{ color: "#9b9788" }}>{g}</span>)}
          </div>
        </div></Phone></div>
      <div><Tag>Clear: labels, the current tab marked twice (colour and underline), a way back</Tag>
        <Phone><div className="text-[12px]">
          <p className="text-[11px]" style={{ color: BLUE }}>‹ Back to departures</p>
          <p className="mt-1 text-[14px] font-bold">Passenger details</p>
          <div className="h-20" />
          <div className="flex justify-around border-t pt-1" style={{ borderColor: "#d8d4c6" }}>
            {items.map((t, i) => (
              <span key={t} className="px-1 pb-1 text-[11px]" style={{ color: i === 0 ? BLUE : MUTED, fontWeight: i === 0 ? 700 : 400, borderBottom: i === 0 ? `3px solid ${BLUE}` : "3px solid transparent" }}>{t}</span>
            ))}
          </div>
        </div></Phone></div>
    </Pair>
  );
}

export function FeedbackStates() {
  return (
    <Pair>
      <div><Tag>Weak: red border only, a vague message, nothing says it is saving</Tag>
        <Phone><div className="text-[12px]">
          <p className="mb-1 font-semibold">Email for your ticket</p>
          <div className="flex h-10 items-center rounded px-3" style={{ border: `2px solid ${RED}` }}>sam@harbour</div>
          <p className="mt-1" style={{ color: RED }}>Error</p>
          <div className="mt-4 rounded py-3 text-center text-[13px] font-semibold" style={{ background: BLUE, color: "#fff" }}>Continue to payment</div>
        </div></Phone></div>
      <div><Tag>Strong: icon, outline and a message that says how to fix it; a visible saving state</Tag>
        <Phone><div className="text-[12px]">
          <p className="mb-1 font-semibold">Email for your ticket</p>
          <div className="flex h-10 items-center rounded px-3" style={{ border: `2px solid ${RED}` }}>sam@harbour</div>
          <p className="mt-1 font-semibold" style={{ color: RED }}>⚠ Add the part after the dot, for example .com</p>
          <div className="mt-4 rounded py-3 text-center text-[13px] font-semibold" style={{ background: "#e6e3d8", color: "#1c1b16" }}>Saving your details…</div>
          <p className="mt-3 text-[11px]" style={{ color: MUTED }}>No tickets yet? Choose a departure to see them here.</p>
        </div></Phone></div>
    </Pair>
  );
}
