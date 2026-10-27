"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import type { Parcel } from "@/lib/registry/types";
import { shortHash } from "./ui";
import { useT } from "@/lib/i18n";

type Result = { match: boolean; recomputed: string; expected: string | null } | { error: string };

/**
 * "Don't trust us, recompute it": re-fetches the pixel statistics of the exact Sentinel-2 scenes named in
 * the report from the public archive, re-runs the decision logic and compares the result with the
 * evidence hash that was anchored with the credits.
 */
export function RecomputeBox({ parcel }: { parcel: Parcel }) {
  const t = useT();
  const r = parcel.lastReport;
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  const scenes = r?.series.map((o) => o.scene).filter((s): s is string => !!s && s !== "cached-sample" && s !== "simulated") ?? [];
  const recomputable = !!r && r.source === "sentinel-2" && !r.simulated && !!r.evidenceHash && !!r.asOf && scenes.length > 0 && scenes.length === r.series.length;

  if (!r) return null;

  const run = async () => {
    setBusy(true);
    setRes(null);
    try {
      const resp = await fetch("/api/recompute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ polygon: parcel.polygon, areaHa: r.areaHa ?? parcel.areaHa, asOf: r.asOf, sceneIds: scenes, evidenceHash: r.evidenceHash }),
      });
      const json = await resp.json();
      setRes(resp.ok ? { match: json.match, recomputed: json.recomputed, expected: json.expected } : { error: json.error ?? "Recompute failed" });
    } catch {
      setRes({ error: "The satellite archive could not be reached. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 border-[1.5px] border-ink bg-surface p-4">
      <p className="font-display text-2xl leading-none">{t("Recompute it yourself")}</p>
      {recomputable ? (
        <>
          <p className="mt-2 text-[13px] leading-snug text-mute">
            This re-downloads the statistics of the {scenes.length} Sentinel-2 scenes listed in the report (as of {r.asOf}), runs the decision logic again and
            compares the result with the evidence hash stored with the credits. If a single number had been altered, the hashes would differ.
          </p>
          <button className="btn btn-ghost btn-sm mt-3" onClick={run} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} {busy ? "…" : t("Recompute from the satellite archive")}
          </button>
        </>
      ) : (
        <p className="mt-2 text-[13px] leading-snug text-mute">
          {r.simulated
            ? "This report contains a simulated loss event, so it cannot be recomputed from the archive."
            : r.source !== "sentinel-2"
              ? "This report was produced from the cached sample, not from satellite scenes."
              : "This report was written by an earlier methodology that did not record its scenes: it cannot be recomputed. Run a new verification to produce a recomputable one."}
        </p>
      )}
      {res && "error" in res && <p className="mt-3 text-sm text-danger">{res.error}</p>}
      {res && "match" in res && (
        <div className={`mt-3 flex items-start gap-2.5 rounded-[6px] border p-3 text-[13px] leading-snug ${res.match ? "border-brand/50 bg-brand/5" : "border-danger/50 bg-danger/5"}`}>
          {res.match ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
          <div>
            <p className="font-semibold">{res.match ? "Identical: the evidence is exactly what the satellite archive says." : "Different: the report does not match the archive."}</p>
            <p className="mt-1 font-mono text-[11px] text-mute">
              recomputed {shortHash(res.recomputed)} · stored {res.expected ? shortHash(res.expected) : "none"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
