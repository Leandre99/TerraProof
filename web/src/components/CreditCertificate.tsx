type State = "active" | "frozen" | "revoked";

const STAMP: Record<State, { text: string; cls: string }> = {
  active: { text: "Verified", cls: "stamp-brand" },
  frozen: { text: "Frozen", cls: "stamp-amber" },
  revoked: { text: "Revoked", cls: "stamp-danger" },
};

const LINE: Record<State, string> = {
  active: "M4 44 C 24 40, 40 46, 60 34 S 96 22, 116 14",
  frozen: "M4 36 C 24 32, 40 34, 60 30 S 84 26, 92 24 L 96 52",
  revoked: "M4 36 C 24 32, 40 34, 60 30 S 84 26, 92 24 L 96 56 L 116 58",
};

/** Illustrative credit certificate used on the landing page to show the three lifecycle states. */
export function CreditCertificate({
  state,
  serial,
  parcel,
  tonnes,
  rotate = 0,
}: {
  state: State;
  serial: string;
  parcel: string;
  tonnes: number;
  rotate?: number;
}) {
  const s = STAMP[state];
  return (
    <div className="card-hard relative p-5" style={{ transform: `rotate(${rotate}deg)` }}>
      <div className="flex items-center justify-between">
        <p className="label">Carbon credit</p>
        <p className="label">{serial}</p>
      </div>
      <p className="mt-3 font-display text-[26px] leading-tight">{parcel}</p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className={`font-display text-[56px] leading-none ${state === "revoked" ? "text-ink/40 line-through decoration-danger decoration-[3px]" : ""}`}>
            {tonnes}
          </p>
          <p className="label mt-1">tCO₂e</p>
        </div>
        <svg viewBox="0 0 120 64" className="h-16 w-32 shrink-0" aria-hidden>
          <line x1="4" x2="116" y1="60" y2="60" stroke="rgb(var(--ink) / 0.25)" strokeDasharray="2 3" />
          <path d={LINE[state]} fill="none" stroke={state === "active" ? "rgb(var(--brand))" : state === "frozen" ? "rgb(var(--amber))" : "rgb(var(--danger))"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="mt-4 border-t border-dashed border-ink/30 pt-3">
        <p className="label">Evidence · Sentinel-2 NDVI</p>
        <p className="mt-1 font-mono text-[11px] text-ink/70">sha256 0x7e98a9c6…f06134</p>
      </div>
      <span className={`stamp stamp-lg ${s.cls} absolute bottom-[78px] right-3 animate-stampIn !text-[17px]`}>{s.text}</span>
    </div>
  );
}
