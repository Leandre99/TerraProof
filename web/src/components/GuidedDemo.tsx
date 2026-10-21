"use client";

import { Check } from "lucide-react";
import type { LedgerEvent, Parcel, Retirement } from "@/lib/registry/types";

export function GuidedDemo({
  parcels,
  events,
  retirements,
  account,
}: {
  parcels: Parcel[];
  events: LedgerEvent[];
  retirements: Retirement[];
  account: string | null;
}) {
  const mine = parcels.filter((p) => p.owner === account);
  const steps = [
    { label: "Register a parcel", hint: "Draw a polygon on the map, then register it.", done: mine.length > 0 },
    { label: "Verify with satellite", hint: "Select your parcel and run the satellite verification.", done: mine.some((p) => p.issued > 0) },
    { label: "Try to double count", hint: "Use “Claim land that's already registered” and watch it fail.", done: events.some((e) => e.type === "RegistrationRejected") },
    { label: "Simulate deforestation", hint: "Run the deforestation simulation, then revoke the credits.", done: events.some((e) => e.type === "ParcelFlagged") },
    { label: "Retire credits", hint: "Clear the flag, re-verify to earn credits again, then retire them as a buyer.", done: retirements.length > 0 },
  ];
  const next = steps.findIndex((s) => !s.done);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Guided demo</p>
        <span className="font-mono text-[11px] text-mute">
          {steps.filter((s) => s.done).length}/{steps.length}
        </span>
      </div>
      <ol className="mt-3 flex items-center gap-1.5" aria-label="Demo progress">
        {steps.map((s, i) => (
          <li key={s.label} className="flex flex-1 items-center gap-1.5">
            <span
              title={s.label}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
                s.done
                  ? "border-brand bg-brand text-bg"
                  : i === next
                    ? "animate-pulseRing border-brand text-brand"
                    : "border-line text-mute"
              }`}
            >
              {s.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
            </span>
            {i < steps.length - 1 && <span className={`h-px flex-1 ${s.done ? "bg-brand/60" : "bg-line"}`} />}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[13px] leading-snug text-mute">
        {next === -1 ? (
          <span className="text-brand">Full lifecycle complete. Open a public proof page to share it.</span>
        ) : (
          <>
            <span className="font-semibold text-ink">Next · {steps[next].label}.</span> {steps[next].hint}
          </>
        )}
      </p>
    </div>
  );
}
