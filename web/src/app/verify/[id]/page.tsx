"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, BadgeCheck, Copy, Loader2, Satellite, SearchX } from "lucide-react";
import { useRegistry } from "@/lib/registry/context";
import { Logo, StatusPill, shortAddr, shortHash } from "@/components/ui";
import { NdviChart } from "@/components/NdviChart";
import { Ledger } from "@/components/Ledger";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-surface text-sm text-mute">Loading map…</div>,
});

export default function ProofPage() {
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

  return (
    <div className="bg-aurora min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Logo />
        <Link href="/app" className="btn btn-ghost btn-sm">
          <ArrowLeft className="h-4 w-4" /> Back to registry
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-20">
        {!ready ? (
          <div className="flex items-center justify-center py-32 text-mute">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading proof…
          </div>
        ) : !parcel ? (
          <div className="card mx-auto mt-16 max-w-lg p-10 text-center">
            <SearchX className="mx-auto h-10 w-10 text-mute" />
            <h1 className="mt-4 font-display text-2xl font-semibold">Parcel #{params.id} not found</h1>
            <p className="mt-2 text-sm leading-relaxed text-mute">
              {mode === "sim"
                ? "In simulation mode the ledger lives in your browser, so a proof link only works in the browser that created it. On-chain proofs are public."
                : "This parcel does not exist on the connected contract."}
            </p>
            <Link href="/app" className="btn btn-primary mt-6">
              Open the registry
            </Link>
          </div>
        ) : (
          <div className="animate-rise space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4 pt-4">
              <div>
                <p className="eyebrow flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4" /> Public proof · Parcel #{parcel.id}
                </p>
                <h1 className="mt-2 font-display text-4xl font-semibold leading-tight tracking-tight">{parcel.name}</h1>
                <p className="mt-2 text-sm text-mute">
                  Owner {shortAddr(parcel.owner)} · {parcel.areaHa.toFixed(1)} ha · {parcel.cells.length} cells · registered{" "}
                  {new Date(parcel.registeredAt).toLocaleDateString("en", { dateStyle: "medium" })}
                </p>
              </div>
              <StatusPill status={parcel.status} />
            </div>

            {parcel.status === "flagged" && (
              <div className="rounded-xl border border-amber/30 bg-amber/10 p-4 text-sm text-amber">
                This parcel is frozen: satellite monitoring detected vegetation loss. Its credits cannot be transferred or retired.
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="card overflow-hidden p-0">
                <div className="h-[340px]">
                  <MapView parcels={[parcel]} selectedId={parcel.id} onSelect={() => {}} draft={[]} drawing={false} onAddPoint={() => {}} flashParcelId={null} me={null} />
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["Credits issued", parcel.issued, ""],
                    ["Credits retired", parcel.retired, "text-brand"],
                    ["Credits revoked", parcel.revoked, parcel.revoked ? "text-danger" : ""],
                    ["Still live", parcel.holdings, ""],
                  ].map(([k, v, c]) => (
                    <div key={k as string} className="card p-4">
                      <p className={`font-display text-3xl font-semibold ${c}`}>{v}</p>
                      <p className="mt-1 text-xs text-mute">{k} · tCO₂e</p>
                    </div>
                  ))}
                </div>
                <div className="card flex items-center gap-4 p-4">
                  <div className="rounded-lg bg-white p-2">{url ? <QRCodeSVG value={url} size={84} /> : <div className="h-[84px] w-[84px]" />}</div>
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">Share this proof</p>
                    <p className="mt-0.5 text-xs leading-snug text-mute">Scan to open this page and verify the evidence yourself.</p>
                    <button
                      className="btn btn-ghost btn-sm mt-2"
                      onClick={() => navigator.clipboard?.writeText(url).then(() => toast({ kind: "success", title: "Link copied" }))}
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy link
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="card p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold tracking-tight">Satellite evidence</h2>
                  {r && (
                    <span className={`pill ${r.source === "sentinel-2" ? "pill-brand" : "pill-mute"}`}>
                      <Satellite className="h-3 w-3" /> {r.source === "sentinel-2" ? "Sentinel-2" : "Cached sample"}
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  <NdviChart report={r} height={150} />
                </div>
                {r ? (
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-mute">Median NDVI</dt>
                      <dd className="font-mono">{r.ndviMean.toFixed(2)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-mute">Report hash</dt>
                      <dd className="font-mono text-xs" title={r.hash}>{shortHash(r.hash)}</dd>
                    </div>
                    <p className="border-t border-line/60 pt-3 text-xs leading-relaxed text-mute">{r.methodology}</p>
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-mute">This parcel has not been analysed yet.</p>
                )}
              </section>

              <section className="card p-5">
                <h2 className="font-semibold tracking-tight">Retirements</h2>
                {parcelRetirements.length === 0 ? (
                  <p className="mt-3 text-sm text-mute">No credits from this parcel have been retired yet.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {parcelRetirements.map((x) => (
                      <li key={x.id} className="rounded-lg border border-line/60 bg-bg/40 p-3">
                        <p className="text-sm font-semibold">
                          {x.amount} tCO₂e retired for <span className="text-brand">{x.beneficiary}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-mute">{x.reason} · {new Date(x.ts).toLocaleDateString("en", { dateStyle: "medium" })}</p>
                      </li>
                    ))}
                    <li className="text-xs text-mute">Total retired: {retiredTotal} tCO₂e</li>
                  </ul>
                )}
              </section>
            </div>

            <section className="card p-5">
              <h2 className="mb-3 font-semibold tracking-tight">Full history</h2>
              <Ledger events={parcelEvents} limit={50} />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
