"use client";

import { Ban, CircleCheck, Flame, MapPinned, ShieldX, Sparkles, Undo2 } from "lucide-react";
import type { LedgerEvent, LedgerEventType } from "@/lib/registry/types";
import { shortHash, timeAgo } from "./ui";

const META: Record<LedgerEventType, { icon: React.ElementType; color: string }> = {
  ParcelRegistered: { icon: MapPinned, color: "text-sky" },
  RegistrationRejected: { icon: ShieldX, color: "text-danger" },
  CreditsIssued: { icon: Sparkles, color: "text-brand" },
  ParcelFlagged: { icon: Flame, color: "text-amber" },
  CreditsRevoked: { icon: Ban, color: "text-danger" },
  FlagCleared: { icon: Undo2, color: "text-sky" },
  CreditsRetired: { icon: CircleCheck, color: "text-brand" },
};

export function Ledger({ events, limit = 30, explorer }: { events: LedgerEvent[]; limit?: number; explorer?: string }) {
  if (events.length === 0) return <p className="py-6 text-center text-sm text-mute">No activity yet.</p>;
  return (
    <ol className="relative space-y-0.5 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-px before:bg-ink/20">
      {events.slice(0, limit).map((e) => {
        const { icon: Icon, color } = META[e.type];
        return (
          <li key={e.id} className="relative flex gap-3 rounded-lg px-1 py-2">
            <span className={`relative z-10 mt-0.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink/40 bg-raised ${color}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug">
                {e.title}
                {e.parcelId ? <span className="ml-1.5 font-mono text-[11px] text-mute">#{e.parcelId}</span> : null}
              </p>
              {e.detail && <p className="mt-0.5 break-words text-xs leading-snug text-mute">{e.detail}</p>}
              <p className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-mute/80">
                <span>{timeAgo(e.ts)}</span>
                {e.tx &&
                  (explorer ? (
                    <a className="hover:text-brand" href={`${explorer}/tx/${e.tx}`} target="_blank" rel="noreferrer">
                      {shortHash(e.tx)}
                    </a>
                  ) : (
                    <span>{shortHash(e.tx)}</span>
                  ))}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
