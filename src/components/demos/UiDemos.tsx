// Fixed colours on purpose: size, spacing and colour ARE the lesson. All artwork is original and uses an invented ferry operator.
const Tag = ({ children }: { children: React.ReactNode }) => <p className="mb-2 text-xs font-medium text-muted">{children}</p>;
const Pair = ({ children }: { children: React.ReactNode }) => <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
const Phone = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto w-full max-w-[260px] overflow-hidden rounded-[22px] border-2 p-3" style={{ background: "#ffffff", borderColor: "#2b2a24", color: "#1c1b16" }}>{children}</div>
);

const TIMES: [string, string][] = [["07:40", "12 seats"], ["09:10", "3 seats"], ["11:30", "Sold out"]];

export function SpacingRhythm() {
  return (
    <Pair>
      <div><Tag>Flat: one size and one gap, so nothing leads</Tag>
        <Phone><div className="space-y-1.5 text-[12px]">
          <p>Harbour Quay to Northpoint</p><p>Saturday 14 March</p>
          {TIMES.map(([t, s]) => <p key={t}>{t} {s}</p>)}
          <p>Continue</p><p>Prices include tax</p>
        </div></Phone></div>
      <div><Tag>Ranked: clear title, grouped departures, one strong action</Tag>
        <Phone><div className="text-[12px]">
          <p className="text-[15px] font-bold leading-tight">Harbour Quay to Northpoint</p>
          <p className="mt-1" style={{ color: "#4a463b" }}>Saturday 14 March</p>
          <div className="mt-4 space-y-2">
            {TIMES.map(([t, s]) => (
              <div key={t} className="flex items-center justify-between rounded px-3 py-2.5" style={{ background: "#f1efe8", opacity: s === "Sold out" ? 0.6 : 1 }}>
                <span className="font-semibold">{t}</span><span style={{ color: "#4a463b" }}>{s}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded py-3 text-center text-[13px] font-semibold" style={{ background: "#1a2fb8", color: "#fff" }}>Continue</div>
          <p className="mt-3 text-[10px]" style={{ color: "#4a463b" }}>Prices include tax</p>
        </div></Phone></div>
    </Pair>
  );
}

export function TouchTargets() {
  const Row = ({ size, gap, label }: { size: number; gap: number; label: string }) => (
    <div><Tag>{label}</Tag>
      <div className="flex rounded p-3" style={{ background: "#f1efe8", gap }}>
        {["Seat", "Bag", "Pet", "Bike"].map((t) => (
          <span key={t} className="inline-flex items-center justify-center rounded text-[12px] font-semibold" style={{ width: size, height: size, background: "#fff", border: "1.5px dashed #1a2fb8", color: "#1c1b16" }}>{t}</span>
        ))}
      </div></div>
  );
  return (
    <Pair>
      <Row size={26} gap={3} label="About 26 points with 3 points between: easy to mis-tap (dashed line = tappable area)" />
      <Row size={48} gap={12} label="48 points with 12 points between: comfortable (dashed line = tappable area)" />
    </Pair>
  );
}

export function FormStates() {
  const Field = ({ label, children, note }: { label: string; children: React.ReactNode; note?: React.ReactNode }) => (
    <div className="text-[12px]"><p className="mb-1 font-semibold">{label}</p>{children}{note}</div>
  );
  const box = "flex h-10 items-center rounded px-3 text-[13px]";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div><Tag>Colour only: the states are hard to tell apart</Tag>
        <div className="space-y-3 rounded p-3" style={{ background: "#fff" }}>
          <Field label="Default"><div className={box} style={{ border: "1.5px solid #8a8676" }}>Passenger name</div></Field>
          <Field label="Error"><div className={box} style={{ border: "1.5px solid #d94a4a" }}>Passenger name</div></Field>
          <Field label="Disabled"><div className={box} style={{ border: "1.5px solid #cfcab9", color: "#cfcab9" }}>Passenger name</div></Field>
        </div></div>
      <div><Tag>Colour plus a second cue: outline, icon, text</Tag>
        <div className="space-y-3 rounded p-3" style={{ background: "#fff" }}>
          <Field label="Focused"><div className={box} style={{ border: "3px solid #1a2fb8", boxShadow: "0 0 0 3px #c9d0ff" }}>Passenger name</div></Field>
          <Field label="Error" note={<p className="mt-1 flex items-center gap-1 font-medium" style={{ color: "#a11d1d" }}><span aria-hidden>⚠</span>Enter the passenger&rsquo;s full name</p>}>
            <div className={box} style={{ border: "3px solid #a11d1d" }}>Passenger</div></Field>
          <Field label="Disabled (not available for sold-out sailings)"><div className={box} style={{ border: "1.5px dashed #6b675a", color: "#6b675a", background: "#f1efe8" }}>Passenger name</div></Field>
        </div></div>
    </div>
  );
}
