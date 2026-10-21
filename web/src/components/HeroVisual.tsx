/** Decorative hero illustration: a parcel rasterised into on-chain cells, with a blocked overlap. */
export function HeroVisual() {
  const cols = 14;
  const rows = 10;
  const cell = 28;
  // Parcel A (emerald) and the rejected overlapping attempt B (red outline)
  const inA = (c: number, r: number) => c >= 1 && c <= 8 && r >= 2 && r <= 8 && !(c === 1 && r === 2) && !(c === 8 && r === 8);
  const inB = (c: number, r: number) => c >= 6 && c <= 12 && r >= 0 && r <= 5;
  const overlap = (c: number, r: number) => inA(c, r) && inB(c, r);

  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div className="absolute -inset-10 -z-10 rounded-full bg-brand/10 blur-3xl" aria-hidden />
      <div className="card overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-mute">
            <span className="h-2 w-2 rounded-full bg-brand" /> Sentinel-2 · 10 m · NDVI
          </div>
          <span className="font-mono text-[11px] text-mute">geohash/8 cells</span>
        </div>
        <div className="relative bg-[radial-gradient(circle_at_30%_30%,#12301f,#0a1a13_70%)] p-4">
          <svg viewBox={`0 0 ${cols * cell} ${rows * cell}`} className="w-full" role="img" aria-label="Parcel split in cells, overlapping claim rejected">
            {Array.from({ length: rows }).flatMap((_, r) =>
              Array.from({ length: cols }).map((__, c) => {
                const a = inA(c, r);
                const b = inB(c, r);
                const o = overlap(c, r);
                const shade = 0.18 + (((c * 7 + r * 13) % 10) / 10) * 0.35;
                return (
                  <rect
                    key={`${c}-${r}`}
                    x={c * cell + 1}
                    y={r * cell + 1}
                    width={cell - 2}
                    height={cell - 2}
                    rx={4}
                    fill={a ? `rgb(52 229 160 / ${shade})` : "rgb(255 255 255 / 0.03)"}
                    stroke={o ? "rgb(255 107 107)" : b ? "rgb(255 107 107 / 0.55)" : a ? "rgb(52 229 160 / 0.45)" : "rgb(255 255 255 / 0.06)"}
                    strokeWidth={o ? 1.6 : 1}
                    strokeDasharray={b && !o ? "3 3" : undefined}
                    className={o ? "animate-blink" : undefined}
                  />
                );
              })
            )}
          </svg>
          <div className="absolute left-6 top-5 rounded-lg border border-brand/30 bg-bg/80 px-2.5 py-1.5 text-[11px] font-semibold text-brand backdrop-blur">
            Parcel #1 · registered
          </div>
          <div className="absolute right-5 top-5 animate-rise rounded-lg border border-danger/40 bg-bg/85 px-2.5 py-1.5 text-[11px] font-semibold text-danger backdrop-blur">
            ✕ Overlap rejected on-chain
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-line/70 border-t border-line/70 text-center">
          {[
            ["Cells claimed", "63"],
            ["NDVI median", "0.46"],
            ["Credits live", "412"],
          ].map(([k, v]) => (
            <div key={k} className="px-3 py-3">
              <p className="font-display text-xl font-semibold">{v}</p>
              <p className="text-[11px] text-mute">{k}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
