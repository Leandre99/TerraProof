"use client";

import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from "lucide-react";
import Link from "next/link";
import { useRegistry } from "@/lib/registry/context";
import type { ParcelStatus } from "@/lib/registry/types";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="TerraProof home">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
        <rect x="1" y="1" width="30" height="30" rx="9" fill="rgb(var(--brand) / 0.12)" stroke="rgb(var(--brand) / 0.5)" />
        <path d="M16 6 24 10v6c0 4.6-3.2 8.4-8 10-4.8-1.6-8-5.4-8-10v-6l8-4Z" stroke="rgb(var(--brand))" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="m12 16 3 3 5.5-6" stroke="rgb(var(--brand))" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-display text-[19px] font-semibold tracking-tight">
        Terra<span className="text-brand">Proof</span>
      </span>
    </Link>
  );
}

export function StatusPill({ status }: { status: ParcelStatus }) {
  return status === "active" ? (
    <span className="pill pill-brand">
      <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Active
    </span>
  ) : (
    <span className="pill pill-amber">
      <span className="h-1.5 w-1.5 animate-blink rounded-full bg-amber" /> Frozen
    </span>
  );
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
    <div className="pointer-events-none fixed bottom-4 right-4 z-[2000] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="card pointer-events-auto flex animate-rise items-start gap-3 p-3.5 shadow-2xl">
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
