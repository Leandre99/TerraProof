"use client";

import { useId } from "react";
import type { MrvReport } from "@/lib/registry/types";

interface Props {
  report?: MrvReport;
  height?: number;
}

/** Hand-drawn SVG NDVI timeline: smooth area, latest-point marker, drop highlighting. */
export function NdviChart({ report, height = 120 }: Props) {
  const gid = useId().replace(/:/g, "");
  if (!report || report.series.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-line text-xs text-mute"
        style={{ height }}
      >
        No satellite analysis yet
      </div>
    );
  }

  const W = 320;
  const H = height;
  const pad = { l: 28, r: 10, t: 12, b: 20 };
  const s = report.series;
  const hasNdmi = s.every((o) => typeof o.ndmi === "number");
  const min = Math.min(0.1, ...s.map((o) => o.ndvi), ...(hasNdmi ? s.map((o) => o.ndmi as number) : [])) - 0.05;
  const max = Math.max(0.7, ...s.map((o) => o.ndvi)) + 0.03;
  const x = (i: number) => pad.l + (i / (s.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);

  const pts = s.map((o, i) => [x(i), y(o.ndvi)] as const);
  // Catmull-Rom → Bézier for a smooth curve
  const path = pts
    .map((p, i) => {
      if (i === 0) return `M ${p[0]} ${p[1]}`;
      const p0 = pts[i - 2] ?? pts[i - 1];
      const p1 = pts[i - 1];
      const p2 = p;
      const p3 = pts[i + 1] ?? p;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      return `C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
    })
    .join(" ");
  const last = pts[pts.length - 1];
  const bad = report.flag ?? report.dropPct >= 30;
  const color = bad ? "rgb(var(--danger))" : "rgb(var(--brand))";
  const ticks = [0.2, 0.4, 0.6].filter((t) => t > min && t < max);
  const fmt = (d: string) => new Date(d).toLocaleDateString("en", { month: "short", year: "2-digit" });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="NDVI timeline">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" strokeDasharray="2 4" />
          <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="rgb(var(--mute))">
            {t.toFixed(1)}
          </text>
        </g>
      ))}
      <path d={`${path} L ${last[0]} ${H - pad.b} L ${pts[0][0]} ${H - pad.b} Z`} fill={`url(#${gid})`} />
      {hasNdmi && (
        <polyline
          points={s.map((o, i) => `${x(i)},${y(o.ndmi as number)}`).join(" ")}
          fill="none"
          stroke="rgb(var(--mute))"
          strokeWidth="1.4"
          strokeDasharray="3 3"
        />
      )}
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 4.5 : 2.5} fill="rgb(var(--bg))" stroke={color} strokeWidth="1.8" />
      ))}
      <text x={pts[0][0]} y={H - 5} fontSize="9" fill="rgb(var(--mute))" textAnchor="start">
        {fmt(s[0].date)}
      </text>
      {hasNdmi && (
        <text x={W - pad.r} y={pad.t - 2} fontSize="9" fill="rgb(var(--mute))" textAnchor="end">
          ── NDVI · - - NDMI (moisture)
        </text>
      )}
      <text x={last[0]} y={H - 5} fontSize="9" fill="rgb(var(--mute))" textAnchor="end">
        {report.simulated ? "simulated" : fmt(s[s.length - 1].date)}
      </text>
    </svg>
  );
}
