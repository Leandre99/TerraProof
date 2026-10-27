"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Copy, Loader2, Satellite, SearchX } from "lucide-react";
import { useRegistry } from "@/lib/registry/context";
import { LanguageToggle, useT } from "@/lib/i18n";
import { Logo, shortAddr, shortHash } from "@/components/ui";
import { NdviChart } from "@/components/NdviChart";
import { Ledger } from "@/components/Ledger";
import { RecomputeBox } from "@/components/RecomputeBox";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-ink text-sm text-bg/70">Loading map…</div>,
});

export default function ProofPage() {
  const t = useT();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { ready, parcels, events, retirements, mode, setMode, chainAvailable, toast } = useRegistry();
  const parcel = parcels.find((p) => p.id === id);
  const [url, setUrl] = useState("");
  // Proof links of on-chain parcels carry ?mode=chain so anyone can read them from the public ledger.
  useEffect(() => {
    const wantsChain = new URLSearchParams(window.location.search).get("mode") === "chain";
    if (wantsChain && chainAvailable) setMode("chain");
  }, [chainAvailable, setMode]);
  useEffect(() => {
    const u = new URL(window.location.href);
    if (mode === "chain") u.searchParams.set("mode", "chain");
    else u.searchParams.delete("mode");
    setUrl(u.toString());
  }, [mode]);

  const parcelEvents = useMemo(() => events.filter((e) => e.parcelId === id), [events, id]);
  const parcelRetirements = useMemo(() => retirements.filter((r) => r.parcelId === id), [retirements, id]);
  const r = parcel?.lastReport;
  const retiredTotal = parcelRetirements.reduce((a, x) => a + x.amount, 0);
  const serial = `TP-${String(id).padStart(4, "0")}`;

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <Link href="/app" className="btn btn-ghost btn-sm">
            <ArrowLeft className="h-4 w-4" /> {t("Registry")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-24">
        {!ready ? (
          <div className="flex items-center justify-center py-32 text-mute">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading proof…
          </div>
        ) : !parcel ? (
          <div className="card-hard mx-auto mt-16 max-w-lg p-10 text-center">
            <SearchX className="mx-auto h-10 w-10 text-mute" />
            <h1 className="mt-4 font-display text-4xl">Parcel #{params.id} not found</h1>
            <p className="mt-3 text-sm leading-relaxed text-mute">
              {mode === "sim"
                ? "In simulation mode the ledger lives in your browser, so a proof link only works in the browser that created it. On-chain proofs are public."
                : "This parcel does not exist on the connected contract."}
            </p>
            <Link href="/app" className="btn btn-primary mt-6">
              Open the registry
            </Link>
          </div>
        ) : (
          <article className="card-hard animate-rise overflow-hidden">
            {/* Certificate head */}
            <div className="relative border-b-[1.5px] border-ink bg-topo-soft px-6 pb-8 pt-6 sm:px-10">
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
                <p className="label">TerraProof · public proof</p>
                <p className="label">{serial}</p>
              </div>
              <div className="relative z-10 mt-6 flex flex-wrap items-start justify-between gap-6">
                <div className="min-w-0">
                  <h1 className="font-display text-5xl leading-[0.95] tracking-[-0.015em] sm:text-7xl">{parcel.name}</h1>
                  <p className="label mt-4">
                    Owner {shortAddr(parcel.owner)} · {parcel.areaHa.toFixed(1)} ha · {parcel.cells.length} cells · registered{" "}
                    {new Date(parcel.registeredAt).toLocaleDateString("en", { dateStyle: "medium" })}
                  </p>
                </div>
                <span className={`stamp stamp-lg animate-stampIn ${parcel.status === "active" ? "stamp-brand" : "stamp-amber"}`}>
                  {parcel.status === "active" ? "Verified" : "Frozen"}
                </span>
              </div>
              {parcel.status === "flagged" && (
                <p className="relative z-10 mt-6 border-[1.5px] border-amber bg-amber/10 p-3 text-sm text-amber">
                  This parcel is frozen: satellite monitoring detected vegetation loss. Its credits cannot be transferred or retired.
                </p>
              )}
            </div>

            {/* Numbers */}
            <dl className="grid grid-cols-2 divide-ink/25 border-b-[1.5px] border-ink sm:grid-cols-4 sm:divide-x">
              {[
                ["Issued", parcel.issued, ""],
                ["Retired", parcel.retired, "text-brand"],
                ["Revoked", parcel.revoked, parcel.revoked ? "text-danger" : ""],
                ["Still live", parcel.holdings, ""],
              ].map(([k, v, c]) => (
                <div key={k as string} className="border-b border-dashed border-ink/25 px-6 py-5 sm:border-b-0">
                  <dd className={`font-display text-6xl leading-none ${c}`}>{v}</dd>
                  <dt className="label mt-2">{k} · tCO₂e</dt>
                </div>
              ))}
            </dl>

            {parcel.community && (
              <p className="border-b-[1.5px] border-ink bg-brand/5 px-6 py-3 text-sm sm:px-10">
                <b>{(parcel.community.bps / 100).toFixed(parcel.community.bps % 100 ? 1 : 0)}% of every issuance is reserved for {parcel.community.name}</b>: this share is
                enforced by the contract (currently {parcel.community.holdings} credits held by the community).
              </p>
            )}

            {/* Map + QR */}
            <div className="grid border-b-[1.5px] border-ink lg:grid-cols-[1.5fr_1fr]">
              <div className="h-[340px] border-b-[1.5px] border-ink lg:border-b-0 lg:border-r-[1.5px]">
                <MapView parcels={[parcel]} selectedId={parcel.id} onSelect={() => {}} draft={[]} drawing={false} onAddPoint={() => {}} flashParcelId={null} me={null} />
              </div>
              <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="border-[1.5px] border-ink bg-white p-2.5">
                  {url ? <QRCodeSVG value={url} size={132} fgColor="#16140F" /> : <div className="h-[132px] w-[132px]" />}
                </div>
                <div>
                  <p className="font-display text-2xl">{t("Check it yourself")}</p>
                  <p className="mt-1 text-sm leading-snug text-mute">{t("Scan to open this proof and verify the evidence.")}</p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(url).then(() => toast({ kind: "success", title: "Link copied" }))}>
                  <Copy className="h-3.5 w-3.5" /> {t("Copy link")}
                </button>
              </div>
            </div>

            {/* Evidence + retirements */}
            <div className="grid border-b-[1.5px] border-ink lg:grid-cols-2 lg:divide-x-[1.5px] lg:divide-ink">
              <section className="p-6 sm:p-8">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-3xl">{t("Satellite evidence")}</h2>
                  {r && (
                    <span className={`pill ${r.source === "sentinel-2" ? "pill-brand" : "pill-mute"}`}>
                      <Satellite className="h-3 w-3" /> {r.source === "sentinel-2" ? "Sentinel-2" : "Cached sample"}
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <NdviChart report={r} height={150} />
                </div>
                {r ? (
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between gap-4 border-b border-dashed border-ink/25 pb-2">
                      <dt className="label">Mean NDVI · greenness</dt>
                      <dd className="font-mono">{r.ndviMean.toFixed(2)}</dd>
                    </div>
                    {r.ndmiMean !== undefined && (
                      <div className="flex justify-between gap-4 border-b border-dashed border-ink/25 pb-2">
                        <dt className="label">Mean NDMI · canopy moisture</dt>
                        <dd className="font-mono">{r.ndmiMean.toFixed(2)}</dd>
                      </div>
                    )}
                    {r.verdict && (
                      <div className="flex justify-between gap-4 border-b border-dashed border-ink/25 pb-2">
                        <dt className="label">Eligibility</dt>
                        <dd className="font-mono">{r.verdict}</dd>
                      </div>
                    )}
                    {r.asOf && (
                      <div className="flex justify-between gap-4 border-b border-dashed border-ink/25 pb-2">
                        <dt className="label">Analysis date</dt>
                        <dd className="font-mono">{r.asOf}</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-4 border-b border-dashed border-ink/25 pb-2">
                      <dt className="label">Report hash</dt>
                      <dd className="font-mono text-xs" title={r.hash}>
                        {shortHash(r.hash)}
                      </dd>
                    </div>
                    {r.reasons?.map((x, i) => (
                      <p key={i} className="pt-1 text-xs leading-relaxed text-ink/80">{x}</p>
                    ))}
                    <p className="pt-1 text-xs leading-relaxed text-mute">{r.methodology}</p>
                  </dl>
                ) : (
                  <p className="mt-4 text-sm text-mute">This parcel has not been analysed yet.</p>
                )}
                <RecomputeBox parcel={parcel} />
              </section>

              <section className="p-6 sm:p-8">
                <h2 className="font-display text-3xl">{t("Retirements")}</h2>
                {parcelRetirements.length === 0 ? (
                  <p className="mt-4 text-sm text-mute">No credits from this parcel have been retired yet.</p>
                ) : (
                  <ul className="mt-4 space-y-4">
                    {parcelRetirements.map((x) => (
                      <li key={x.id} className="relative border-[1.5px] border-ink bg-surface p-4">
                        <p className="font-display text-3xl leading-none">
                          {x.amount} <span className="text-lg">tCO₂e</span>
                        </p>
                        <p className="mt-2 text-sm">
                          Retired for <b>{x.beneficiary}</b>
                        </p>
                        <p className="label mt-1">
                          {x.reason} · {new Date(x.ts).toLocaleDateString("en", { dateStyle: "medium" })}
                        </p>
                        <span className="stamp stamp-brand absolute right-3 top-3">Retired</span>
                      </li>
                    ))}
                    <li className="label">Total retired: {retiredTotal} tCO₂e</li>
                  </ul>
                )}
              </section>
            </div>

            <section className="p-6 sm:p-8">
              <h2 className="mb-4 font-display text-3xl">{t("Full history")}</h2>
              <Ledger events={parcelEvents} limit={50} />
            </section>
          </article>
        )}
      </main>
    </div>
  );
}
