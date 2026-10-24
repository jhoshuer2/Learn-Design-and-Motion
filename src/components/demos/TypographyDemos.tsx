// Fixed colours and faces on purpose: size, measure and alignment ARE the lesson. Text is invented.
const Tag = ({ children }: { children: React.ReactNode }) => <p className="mb-2 text-xs font-medium text-muted">{children}</p>;
const serif = "Georgia, 'Times New Roman', serif";
const sans = "Arial, Helvetica, sans-serif";
const INK = "#1c1b16", SOFT = "#4a463b", PAPER = "#fbf9f3";

const SESSIONS: [string, string, string][] = [
  ["Tue 7 Oct", "The Lighthouse Keeper's Letters", "Mara Quinn"],
  ["Tue 14 Oct", "Short Stories from the Coast", "Joe Alder"],
  ["Tue 21 Oct", "Poems for Winter", "Priya Nair"],
];

export function TypePairing() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div><Tag>Flat: one size and weight for everything</Tag>
        <div className="rounded p-3 text-[12px]" style={{ background: PAPER, color: INK, fontFamily: sans }}>
          <p>Harbour Reading Group</p><p>Autumn season</p>
          {SESSIONS.map(([d, t, l]) => <p key={d}>{d} {t} led by {l}</p>)}
          <p>Quay Library, Room 2, 18:30, free</p>
        </div></div>
      <div><Tag>Clear hierarchy: serif headlines, sans body, four levels</Tag>
        <div className="rounded p-3" style={{ background: PAPER, color: INK }}>
          <p className="text-[18px] font-bold leading-tight" style={{ fontFamily: serif }}>Harbour Reading Group</p>
          <p className="text-[11px] uppercase" style={{ fontFamily: sans, letterSpacing: "0.14em", color: SOFT }}>Autumn season</p>
          <div className="mt-3 space-y-2">
            {SESSIONS.map(([d, t, l]) => (
              <div key={d}><p className="text-[13px] font-bold" style={{ fontFamily: serif }}>{t}</p><p className="text-[11px]" style={{ fontFamily: sans, color: SOFT }}>{d}, led by {l}</p></div>
            ))}
          </div>
          <p className="mt-3 text-[10px]" style={{ fontFamily: sans, color: SOFT }}>Quay Library, Room 2 · 18:30 · Free</p>
        </div></div>
      <div><Tag>Near-identical faces: looks like a mistake</Tag>
        <div className="rounded p-3" style={{ background: PAPER, color: INK }}>
          <p className="text-[18px] font-bold leading-tight" style={{ fontFamily: "Georgia, serif" }}>Harbour Reading Group</p>
          <p className="text-[11px]" style={{ fontFamily: "'Times New Roman', serif", color: SOFT }}>Autumn season</p>
          <div className="mt-3 space-y-2">
            {SESSIONS.map(([d, t, l]) => (
              <div key={d}><p className="text-[13px] font-bold" style={{ fontFamily: "'Palatino Linotype', Palatino, serif" }}>{t}</p><p className="text-[11px]" style={{ fontFamily: "'Book Antiqua', 'Times New Roman', serif", color: SOFT }}>{d}, led by {l}</p></div>
            ))}
          </div>
        </div></div>
    </div>
  );
}

const PARA = "The reading group meets on Tuesday evenings in the library, and each session takes one book, one theme or one poet. Members bring their own copies and a few thoughts, and the leader keeps the conversation moving so that everyone can speak.";

export function LineLengthLeading() {
  const Para = ({ ch, lh, label }: { ch: number; lh: number; label: string }) => (
    <div><Tag>{label}</Tag>
      <div className="overflow-hidden rounded p-3" style={{ background: PAPER, color: INK }}>
        <p className="text-[13px]" style={{ fontFamily: serif, maxWidth: `${ch}ch`, lineHeight: lh }}>{PARA}</p>
      </div></div>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Para ch={140} lh={1.5} label="Line far too long (about 140 characters)" />
        <Para ch={60} lh={1.5} label="Comfortable measure (about 60 characters)" />
        <Para ch={20} lh={1.5} label="Too narrow (about 20 characters)" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Para ch={60} lh={1.0} label="Line spacing 1.0: lines collide" />
        <Para ch={60} lh={1.5} label="Line spacing 1.5: comfortable" />
        <Para ch={60} lh={2.4} label="Line spacing 2.4: the paragraph falls apart" />
      </div>
    </div>
  );
}

export function GridAlignment() {
  const guide = { backgroundImage: "linear-gradient(to right, rgba(26,47,184,.18) 1px, transparent 1px)", backgroundSize: "50% 100%" } as const;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div><Tag>Placed by eye: near-miss edges and uneven gaps</Tag>
        <div className="relative h-72 overflow-hidden rounded" style={{ background: PAPER, color: INK }}>
          <p className="absolute text-[18px] font-bold" style={{ fontFamily: serif, left: 14, top: 12 }}>Harbour Reading Group</p>
          <p className="absolute text-[11px]" style={{ fontFamily: sans, left: 19, top: 40, color: SOFT }}>Autumn season</p>
          {SESSIONS.map(([d, t, l], i) => (
            <div key={d} className="absolute" style={{ left: [12, 23, 8][i], top: [74, 128, 170][i], width: 190 }}>
              <p className="text-[13px] font-bold" style={{ fontFamily: serif }}>{t}</p><p className="text-[11px]" style={{ fontFamily: sans, color: SOFT }}>{d}, led by {l}</p>
            </div>
          ))}
          <p className="absolute text-[10px]" style={{ fontFamily: sans, left: 16, top: 250, color: SOFT }}>Quay Library, Room 2 · 18:30 · Free</p>
        </div></div>
      <div><Tag>On a grid (blue lines = two columns): shared edges, one spacing scale, parallel sessions</Tag>
        <div className="relative h-72 overflow-hidden rounded px-5 py-4" style={{ background: PAPER, color: INK, ...guide }}>
          <p className="text-[18px] font-bold" style={{ fontFamily: serif }}>Harbour Reading Group</p>
          <p className="text-[11px] uppercase" style={{ fontFamily: sans, letterSpacing: "0.14em", color: SOFT }}>Autumn season</p>
          <div className="mt-6 space-y-4">
            {SESSIONS.map(([d, t, l]) => (
              <div key={d}><p className="text-[13px] font-bold" style={{ fontFamily: serif }}>{t}</p><p className="text-[11px]" style={{ fontFamily: sans, color: SOFT }}>{d}, led by {l}</p></div>
            ))}
          </div>
          <p className="mt-6 text-[10px]" style={{ fontFamily: sans, color: SOFT }}>Quay Library, Room 2 · 18:30 · Free</p>
        </div></div>
    </div>
  );
}
