"use client";

import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from "lucide-react";
import Link from "next/link";
import { useRegistry } from "@/lib/registry/context";
import type { ParcelStatus } from "@/lib/registry/types";

/** Mark: a 3×3 grid of cells with one claimed in highlighter lime. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="TerraProof home">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
        <rect x="1.5" y="1.5" width="29" height="29" rx="3" fill="rgb(var(--raised))" stroke="rgb(var(--ink))" strokeWidth="1.8" />
        {[0, 1, 2].flatMap((r) =>
          [0, 1, 2].map((c) => {
            const claimed = r === 1 && c === 2;
            const owned = (r === 0 && c < 2) || (r === 1 && c === 0);
            return (
              <rect
                key={`${r}${c}`}
                x={5 + c * 8}
                y={5 + r * 8}
                width="6"
                height="6"
                rx="1"
                fill={claimed ? "rgb(var(--lime))" : owned ? "rgb(var(--brand))" : "transparent"}
                stroke="rgb(var(--ink))"
                strokeWidth="1.2"
                className={claimed ? "transition-transform group-hover:translate-x-[1px]" : undefined}
              />
            );
          })
        )}
      </svg>
      <span className="font-display text-[26px] leading-none tracking-tight">
        Terra<span className="italic">Proof</span>
      </span>
    </Link>
  );
}

/** Rubber-stamp status badge. */
export function StatusPill({ status }: { status: ParcelStatus }) {
  return status === "active" ? <span className="stamp stamp-brand">Active</span> : <span className="stamp stamp-amber">Frozen</span>;
}

export function Toasts() {
  const { toasts, dismissToast } = useRegistry();
  const icon = {
    success: <CheckCircle2 className="h-5 w-5 text-brand" />,
    error: <ShieldAlert className="h-5 w-5 text-danger" />,
    warning: <AlertTriangle className="h-5 w-5 text-amber" />,
    info: <Info className="h-5 w-5 text-sky" />,
  } as const;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[2000] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-3" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="card-hard pointer-events-auto flex animate-rise items-start gap-3 p-3.5">
          <div className="mt-0.5">{icon[t.kind]}</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t.title}</p>
            {t.detail && <p className="mt-0.5 break-words text-[13px] leading-snug text-mute">{t.detail}</p>}
          </div>
          <button onClick={() => dismissToast(t.id)} className="text-mute hover:text-ink" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export const shortAddr = (a: string) => (a.includes("...") ? a : `${a.slice(0, 6)}…${a.slice(-4)}`);
export const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;
export const timeAgo = (ts: number) => {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
