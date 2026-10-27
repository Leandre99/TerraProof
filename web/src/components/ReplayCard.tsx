"use client";

import { useState } from "react";
import { History, Loader2 } from "lucide-react";
import { polygonToCells } from "@/lib/geo";
import { REPLAYS, type ReplaySite } from "@/lib/replay";
import { useRegistry } from "@/lib/registry/context";
import { useT } from "@/lib/i18n";

/**
 * Replays a REAL clearing event with REAL Sentinel-2 history: the parcel is registered, credits are issued
 * from the scenes as they were before the loss, then monitoring is run as of a date after it. Nothing is
 * injected: the freeze, if it happens, comes from the satellite archive. Simulation mode only, because the
 * on-chain registry has no notion of a past "as of" date.
 */
export function ReplayCard({ onDone }: { onDone: (parcelId: number) => void }) {
  const t = useT();
  const { run, toast, parcels } = useRegistry();
  const [busy, setBusy] = useState<string | null>(null);

  if (REPLAYS.length === 0) return null;

  const play = async (site: ReplaySite) => {
    if (parcels.some((p) => p.name === site.title)) {
      toast({ kind: "info", title: "Already replayed", detail: "This real parcel is already on the ledger. Open it from the Parcels tab, or reset the demo." });
      return;
    }
    setBusy(site.id);
    try {
      const parcel = await run((r) => r.register(site.title, site.polygon, polygonToCells(site.polygon)));
      if (!parcel) return;
      onDone(parcel.id);
      toast({ kind: "info", title: "Real parcel registered", detail: `Reading Sentinel-2 as it was on ${site.before}…` });
      const before = await run((r) => r.verify(parcel.id, { asOf: site.before }));
      if (!before) return;
      toast({
        kind: before.credits > 0 ? "success" : "warning",
        title: before.credits > 0 ? `${before.credits} credits issued, forest standing` : "No credits at that date",
        detail: `As of ${site.before}: NDVI ${before.ndviLatest.toFixed(2)}, canopy moisture ${before.ndmiLatest?.toFixed(2) ?? "–"}. Now replaying to ${site.after}…`,
      });
      const out = await run((r) => r.monitor(parcel.id, { asOf: site.after }));
      if (!out) return;
      toast(
        out.flagged
          ? {
              kind: "warning",
              title: "Real clearing detected: credits frozen",
              detail: `As of ${site.after}, NDVI fell ${out.report.dropPct.toFixed(0)}% against the same season a year earlier and canopy moisture confirms it. No simulated data.`,
            }
          : {
              kind: "info",
              title: "Monitoring did not freeze this parcel",
              detail: out.report.reasons?.find((x) => x.includes("not corroborate")) ?? `NDVI changed by ${out.report.dropPct.toFixed(0)}%, below the freezing threshold.`,
            }
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2 rounded-[6px] border border-ink/20 bg-surface p-3">
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        <History className="h-4 w-4 text-brand" /> {t("Replay a real clearing")}
      </p>
      <p className="text-xs leading-snug text-mute">
        Real parcels where the Hansen forest-loss dataset records a clearing. TerraProof issues credits from the satellite as it was before, then runs
        monitoring as of a later date. Nothing is simulated.
      </p>
      {REPLAYS.map((site) => (
        <button key={site.id} className="btn btn-ghost btn-sm w-full justify-between text-left" disabled={!!busy} onClick={() => play(site)}>
          <span className="truncate">
            {site.label} · {site.lossYear}
          </span>
          {busy === site.id ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <span className="shrink-0 text-[11px] text-mute">{site.region}</span>}
        </button>
      ))}
    </div>
  );
}
