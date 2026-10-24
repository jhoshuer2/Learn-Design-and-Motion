// Fixed colours on purpose: image treatment and layout zones ARE the lesson. "Photos" are drawn with gradients; the bakery is invented.
const Tag = ({ children }: { children: React.ReactNode }) => <p className="mb-2 text-xs font-medium text-muted">{children}</p>;
const serif = "Georgia, 'Times New Roman', serif";
const sans = "Arial, Helvetica, sans-serif";
const INK = "#2b1d14", CREAM = "#fbf3e4", CRUST = "#c9772e";

type Scene = { sky: string; ground: string; item: string; label: string };
const SCENES: Scene[] = [
  { sky: "#f4dcb4", ground: "#d9a566", item: "#9a5a20", label: "Loaf on a board" },
  { sky: "#f2e0c0", ground: "#c98f50", item: "#a3622a", label: "Buns in a tray" },
  { sky: "#f6e4c6", ground: "#d7a05e", item: "#8d4f1c", label: "Hands kneading" },
];

function Tile({ s, filter, crop, overlay }: { s: Scene; filter?: string; crop?: "tight" | "wide"; overlay?: boolean }) {
  const size = crop === "tight" ? 70 : 38;
  return (
    <div className="relative aspect-square overflow-hidden rounded" role="img" aria-label={s.label} style={{ background: `linear-gradient(${s.sky} 0 55%, ${s.ground} 55% 100%)`, filter }}>
      <div className="absolute rounded-[50%]" style={{ background: s.item, width: `${size}%`, height: `${size * 0.6}%`, left: `${(100 - size) / 2}%`, bottom: crop === "tight" ? "12%" : "30%" }} />
      {overlay ? <div className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] font-bold" style={{ background: "rgba(43,29,20,.82)", color: CREAM, fontFamily: sans }}>Baked at 5 a.m.</div> : null}
    </div>
  );
}

export function ImageTreatment() {
  return (
    <div className="space-y-4">
      <div><Tag>Inconsistent: a different filter, crop and caption treatment on every image</Tag>
        <div className="grid grid-cols-3 gap-2">
          <Tile s={SCENES[0]} filter="saturate(2.2) hue-rotate(-15deg)" crop="tight" />
          <Tile s={SCENES[1]} filter="grayscale(1) contrast(1.4)" crop="wide" overlay />
          <Tile s={SCENES[2]} filter="hue-rotate(80deg)" crop="tight" />
        </div></div>
      <div><Tag>Consistent: warm light, the subject filling the frame, one caption bar in the same place</Tag>
        <div className="grid grid-cols-3 gap-2">
          {SCENES.map((s) => <Tile key={s.label} s={s} crop="tight" overlay />)}
        </div></div>
    </div>
  );
}

const CONTENT = [
  { h: "Rye loaf, back on Fridays", c: "Baked slowly, sold until it is gone." },
  { h: "Saturday buns", c: "Cardamom, brown butter, still warm." },
  { h: "Bring a tin, save a bag", c: "Fill your own container at the counter." },
];

export function LayoutTemplate() {
  return (
    <div className="space-y-4">
      <div><Tag>Placed freely: the headline, image and logo move around every time</Tag>
        <div className="grid grid-cols-3 gap-2">
          {CONTENT.map((x, i) => (
            <div key={x.h} className="relative aspect-[3/4] overflow-hidden rounded" style={{ background: CREAM, color: INK }}>
              <p className="absolute text-[11px] font-bold" style={{ fontFamily: serif, top: i === 1 ? "58%" : "6%", left: i === 2 ? "30%" : "8%", width: "60%" }}>{x.h}</p>
              <div className="absolute rounded" style={{ background: CRUST, width: i === 0 ? "70%" : "45%", height: "28%", top: i === 1 ? "8%" : "40%", left: i === 2 ? "6%" : "20%" }} />
              <p className="absolute text-[8px]" style={{ fontFamily: sans, bottom: i === 0 ? "46%" : "4%", right: "6%" }}>{x.c}</p>
              <p className="absolute text-[8px] font-bold" style={{ fontFamily: sans, top: i === 2 ? "70%" : "3%", right: i === 1 ? "40%" : "6%" }}>FERNHILL</p>
            </div>
          ))}
        </div></div>
      <div><Tag>One template: image on top, headline under it, caption below, logo bottom left, every time</Tag>
        <div className="grid grid-cols-3 gap-2">
          {CONTENT.map((x) => (
            <div key={x.h} className="flex aspect-[3/4] flex-col p-2" style={{ background: CREAM, color: INK }}>
              <div className="rounded" style={{ background: CRUST, height: "46%" }} />
              <p className="mt-2 text-[11px] font-bold leading-tight" style={{ fontFamily: serif }}>{x.h}</p>
              <p className="mt-1 text-[8px]" style={{ fontFamily: sans }}>{x.c}</p>
              <p className="mt-auto text-[8px] font-bold tracking-widest" style={{ fontFamily: sans }}>FERNHILL</p>
            </div>
          ))}
        </div></div>
    </div>
  );
}

export function VoiceCompare() {
  const rows: [string, string, string][] = [
    ["Shouting and generic", "AMAZING DEALS!!! BEST BREAD IN TOWN, DON'T MISS OUT!!!", "Hard sell, says nothing specific, could be any shop."],
    ["Corporate and vague", "Fernhill Bakery is pleased to offer a range of artisanal baked products for consumers.", "Correct but stiff, and nobody talks like this."],
    ["Fernhill's voice: warm, plain, specific", "The rye loaf is back on Fridays. Come early, it never lasts the morning.", "Short sentences, a real detail, a friendly nudge."],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {rows.map(([label, text, note]) => (
        <div key={label} className="rounded p-3" style={{ background: CREAM, color: INK }}>
          <p className="text-xs font-semibold" style={{ fontFamily: sans, color: "#6b4a2b" }}>{label}</p>
          <p className="mt-2 text-sm" style={{ fontFamily: serif }}>{text}</p>
          <p className="mt-2 text-xs" style={{ fontFamily: sans, color: "#4a3a2c" }}>{note}</p>
        </div>
      ))}
    </div>
  );
}
