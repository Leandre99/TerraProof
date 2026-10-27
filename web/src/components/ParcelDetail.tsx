"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Ban, CircleCheck, Flame, Loader2, RefreshCw, Satellite, ScanSearch, Undo2, Users } from "lucide-react";
import { useRegistry } from "@/lib/registry/context";
import { useT } from "@/lib/i18n";
import type { Parcel } from "@/lib/registry/types";
import { NdviChart } from "./NdviChart";
import { StatusPill, shortAddr, shortHash } from "./ui";

const sameAddr = (a: string, b: string | null) => !!b && a.toLowerCase() === b.toLowerCase();

export function ParcelDetail({ parcel }: { parcel: Parcel }) {
  const t = useT();
  const { account, run, toast } = useRegistry();
  const [busy, setBusy] = useState<string | null>(null);
  const [retiring, setRetiring] = useState(false);
  const [amount, setAmount] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [reason, setReason] = useState("2026 voluntary offset");

  const mine = sameAddr(parcel.owner, account) || parcel.owner === account;
  const frozen = parcel.status === "flagged";
  const r = parcel.lastReport;

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const verify = () =>
    act("verify", async () => {
      const report = await run((reg) => reg.verify(parcel.id));
      if (report)
        toast({
          kind: report.verdict === "eligible" || report.verdict === undefined ? "success" : "warning",
          title:
            report.verdict === "uncertain"
              ? "Not enough clear satellite data"
              : report.verdict === "not-eligible"
                ? "Parcel not eligible: no credits"
                : report.credits > 0
                  ? "Satellite verification complete"
                  : "No credits supported",
          detail:
            report.reasons?.[0] ??
            `${report.source === "sentinel-2" ? "Live Sentinel-2" : "Cached sample"} · median NDVI ${report.ndviMean.toFixed(2)} → ${report.credits} tCO₂e supported.`,
        });
    });

  const monitor = (simulateLoss: boolean) =>
    act(simulateLoss ? "loss" : "monitor", async () => {
      const out = await run((reg) => reg.monitor(parcel.id, { simulateLoss }));
      if (!out) return;
      toast(
        out.flagged
          ? {
              kind: "warning",
              title: "Vegetation loss detected — credits frozen",
              detail: `NDVI fell ${out.report.dropPct.toFixed(0)}% ${out.report.method === "same-season" ? "versus the same season last year" : "below the trailing average"}${out.report.ndmiDropPct ? `, confirmed by the moisture signal (NDMI −${out.report.ndmiDropPct.toFixed(0)}%)` : ""}. Transfers and retirement are blocked until reviewed.`,
            }
          : {
              kind: "success",
              title: "Monitoring clear",
              detail: out.report.reasons?.find((x) => x.includes("not corroborate")) ?? `Latest NDVI ${out.report.ndviLatest.toFixed(2)} is within normal range (${out.report.dropPct.toFixed(0)}% below the reference).`,
            }
      );
    });

  const revoke = () =>
    act("revoke", async () => {
      const ok = await run((reg) => reg.revoke(parcel.id));
      if (ok !== undefined) toast({ kind: "info", title: "Credits revoked", detail: "Burned on-chain with the satellite report as evidence." });
    });

  const clear = () =>
    act("clear", async () => {
      const ok = await run((reg) => reg.clearFlag(parcel.id));
      if (ok !== undefined) toast({ kind: "success", title: "Flag cleared", detail: "The parcel is active again." });
    });

  const retire = () =>
    act("retire", async () => {
      const n = Number(amount);
      if (!Number.isInteger(n) || n <= 0 || n > parcel.holdings) {
        toast({ kind: "error", title: "Invalid amount", detail: `Enter a whole number between 1 and ${parcel.holdings}.` });
        return;
      }
      const ok = await run((reg) => reg.retire(parcel.id, n, beneficiary.trim() || "Anonymous", reason.trim() || "Offset"));
      if (ok !== undefined) {
        toast({ kind: "success", title: `${n} credits retired`, detail: "A permanent public record was created." });
        setRetiring(false);
        setAmount("");
      }
    });

  const Spin = ({ k, children }: { k: string; children: React.ReactNode }) =>
    busy === k ? (
      <>
        <Loader2 className="h-4 w-4 animate-spin" /> Working…
      </>
    ) : (
      <>{children}</>
    );

  return (
    <div className="card animate-rise p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label">PARCEL #{parcel.id}</p>
          <h3 className="mt-0.5 truncate font-display text-[28px] leading-tight">{parcel.name}</h3>
          <p className="mt-0.5 text-xs text-mute">
            {mine ? "You" : shortAddr(parcel.owner)} · {parcel.areaHa.toFixed(1)} ha · {parcel.cells.length} cells
          </p>
        </div>
        <StatusPill status={parcel.status} />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        {[
          ["Held", parcel.holdings, "text-brand"],
          ["Issued", parcel.issued, ""],
          ["Retired", parcel.retired, ""],
          ["Revoked", parcel.revoked, parcel.revoked ? "text-danger" : ""],
        ].map(([k, v, c]) => (
          <div key={k as string} className="rounded-[6px] border border-ink/20 bg-surface py-2">
            <p className={`font-display text-lg font-semibold ${c}`}>{v}</p>
            <p className="text-[10px] uppercase tracking-wider text-mute">{k}</p>
          </div>
        ))}
      </div>

      {parcel.community && (
        <div className="mt-3 flex items-start gap-2.5 rounded-[6px] border border-brand/40 bg-brand/5 p-3 text-[12.5px] leading-snug">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <p>
            <b>{(parcel.community.bps / 100).toFixed(parcel.community.bps % 100 ? 1 : 0)}% of every issuance goes to {parcel.community.name}</b> (holds{" "}
            {parcel.community.holdings} credits). This share is written into the contract at registration: the owner cannot change it afterwards.
          </p>
        </div>
      )}

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold text-mute">NDVI · vegetation health</p>
          {r && (
            <span className={`pill ${r.source === "sentinel-2" ? "pill-brand" : "pill-mute"}`}>
              <Satellite className="h-3 w-3" /> {r.source === "sentinel-2" ? "Sentinel-2" : "Cached sample"}
              {r.simulated ? " · simulated loss" : r.asOf && r.asOf !== r.generatedAt.slice(0, 10) ? ` · as of ${r.asOf}` : " · live"}
            </span>
          )}
        </div>
        <NdviChart report={r} />
        {r && (
          <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
            <div>
              <dt className="text-mute">Mean NDVI</dt>
              <dd className="font-mono text-sm">{r.ndviMean.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-mute">Latest</dt>
              <dd className="font-mono text-sm">{r.ndviLatest.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-mute">{r.method === "same-season" ? "vs same season last yr" : "vs trailing avg"}</dt>
              <dd className={`font-mono text-sm ${r.dropPct >= 30 ? "text-danger" : ""}`}>
                {r.dropPct >= 0.5 ? `−${r.dropPct.toFixed(0)}%` : "no drop"}
              </dd>
            </div>
            {r.verdict && (
              <div className="col-span-3 rounded-[6px] border border-ink/20 bg-surface p-2.5">
                <dt className="flex flex-wrap items-center gap-2 text-mute">
                  Two independent signals
                  <span className={`pill ${r.verdict === "eligible" ? "pill-brand" : "pill-mute"}`}>{r.verdict === "eligible" ? "Eligible" : r.verdict === "uncertain" ? "Uncertain" : "Not eligible"}</span>
                </dt>
                <dd className="mt-1.5 grid grid-cols-2 gap-2 font-mono text-xs">
                  <span>NDVI {r.ndviLatest.toFixed(2)} <span className="text-mute">greenness</span></span>
                  <span>NDMI {r.ndmiLatest !== undefined ? r.ndmiLatest.toFixed(2) : "–"} <span className="text-mute">canopy moisture</span></span>
                </dd>
                {r.reasons?.map((x, i) => (
                  <dd key={i} className="mt-1.5 text-[11px] leading-snug text-ink/75">{x}</dd>
                ))}
              </div>
            )}
            <div className="col-span-3">
              <dt className="text-mute">Evidence hash (anchored with the credits)</dt>
              <dd className="truncate font-mono text-xs text-ink/80">{shortHash(r.hash)}</dd>
            </div>
          </dl>
        )}
      </div>

      {frozen && (
        <div className="mt-4 flex gap-2.5 rounded-xl border border-amber/30 bg-amber/10 p-3 text-[13px] leading-snug text-amber">
          <Flame className="mt-0.5 h-4 w-4 shrink-0" />
          {parcel.holdings === 0 && parcel.revoked > 0 ? (
            <p>All credits were revoked. Clear the flag to let this parcel be re-verified and earn credits again.</p>
          ) : (
            <p>Credits are frozen: they can't be transferred or retired until the loss is confirmed (revoke) or dismissed (clear flag).</p>
          )}
        </div>
      )}

      {!mine ? (
        <p className="mt-4 rounded-[6px] border border-ink/20 bg-surface p-3 text-xs text-mute">
          This parcel belongs to another owner. You can inspect it, but only its owner can act on it.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {!frozen ? (
            <>
              <button className="btn btn-primary w-full" disabled={!!busy} onClick={verify}>
                <Spin k="verify">
                  <ScanSearch className="h-4 w-4" /> {parcel.issued ? t("Re-verify with satellite") : t("Verify with satellite & issue credits")}
                </Spin>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-ghost btn-sm" disabled={!!busy || !r} onClick={() => monitor(false)} title={!r ? "Verify first" : ""}>
                  <Spin k="monitor">
                    <RefreshCw className="h-3.5 w-3.5" /> {t("Run monitoring")}
                  </Spin>
                </button>
                <button className="btn btn-amber btn-sm" disabled={!!busy || !r} onClick={() => monitor(true)} title="Demo only: injects a synthetic clearing event">
                  <Spin k="loss">
                    <Flame className="h-3.5 w-3.5" /> {t("Simulate deforestation")}
                  </Spin>
                </button>
              </div>
              {parcel.holdings > 0 && !retiring && (
                <button className="btn btn-ghost w-full" disabled={!!busy} onClick={() => (setRetiring(true), setAmount(String(parcel.holdings)))}>
                  <CircleCheck className="h-4 w-4" /> {t("Retire credits (buyer view)")}
                </button>
              )}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn btn-danger" disabled={!!busy || parcel.holdings === 0} onClick={revoke}>
                <Spin k="revoke">
                  <Ban className="h-4 w-4" /> {t("Revoke credits")}
                </Spin>
              </button>
              <button className="btn btn-ghost" disabled={!!busy} onClick={clear}>
                <Spin k="clear">
                  <Undo2 className="h-4 w-4" /> {t("Clear flag")}
                </Spin>
              </button>
            </div>
          )}

          {retiring && !frozen && (
            <div className="animate-rise space-y-2 rounded-[6px] border-[1.5px] border-ink/40 bg-surface p-3">
              <p className="text-xs font-semibold text-mute">Retire credits permanently</p>
              <div className="grid grid-cols-[90px_1fr] gap-2">
                <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
                <input className="input" placeholder="Beneficiary (e.g. ACME Corp)" value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} aria-label="Beneficiary" />
              </div>
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
              <div className="flex gap-2">
                <button className="btn btn-primary btn-sm flex-1" disabled={!!busy} onClick={retire}>
                  <Spin k="retire">Retire {amount || ""} credits</Spin>
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setRetiring(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <Link href={`/verify/${parcel.id}`} className="mt-4 flex items-center justify-between rounded-[6px] border border-ink/20 px-3 py-2.5 text-sm font-medium text-mute transition hover:border-ink hover:text-ink">
        {t("Public proof page")} <ArrowUpRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
