"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Eraser, Hexagon, Layers3, ListTree, Loader2, MousePointer2, PenLine, RotateCcw, ShieldX, Undo2, Wallet } from "lucide-react";
import { useRegistry } from "@/lib/registry/context";
import { MAX_CELLS_PER_PARCEL, cellsAreaHa, polygonToCells, type LatLng } from "@/lib/geo";
import { Logo, StatusPill, shortAddr } from "@/components/ui";
import { GuidedDemo } from "@/components/GuidedDemo";
import { Ledger } from "@/components/Ledger";
import { ParcelDetail } from "@/components/ParcelDetail";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-surface text-sm text-mute">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading satellite map…
    </div>
  ),
});

type Tab = "register" | "parcels" | "ledger";

export default function AppPage() {
  const { ready, mode, setMode, chainAvailable, account, registry, parcels, events, retirements, run, refresh, lastRejection, toast } = useRegistry();

  const [tab, setTab] = useState<Tab>("register");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<LatLng[]>([]);
  const [name, setName] = useState("");
  const [registering, setRegistering] = useState(false);
  const [banner, setBanner] = useState<{ text: string; parcelId: number } | null>(null);

  const cells = useMemo(() => polygonToCells(draft), [draft]);
  const areaHa = useMemo(() => cellsAreaHa(cells), [cells]);
  const tooBig = cells.length > MAX_CELLS_PER_PARCEL;
  const canRegister = draft.length >= 3 && cells.length > 0 && !tooBig && name.trim().length > 0 && !registering;

  const selected = parcels.find((p) => p.id === selectedId) ?? null;
  const mine = useMemo(() => parcels.filter((p) => p.owner === account), [parcels, account]);

  // "Double counting blocked" banner + red flash on the conflicting parcel.
  useEffect(() => {
    if (!lastRejection) return;
    setBanner({ text: `Overlaps parcel #${lastRejection.parcelId}`, parcelId: lastRejection.parcelId });
    const t = setTimeout(() => setBanner(null), 4800);
    return () => clearTimeout(t);
  }, [lastRejection]);

  const select = useCallback((id: number | null) => {
    setSelectedId(id);
    if (id !== null) setTab("parcels");
  }, []);

  const addPoint = useCallback((p: LatLng) => setDraft((d) => [...d, p]), []);

  const register = async (poly: LatLng[], parcelName: string, polyCells: bigint[]) => {
    setRegistering(true);
    try {
      const parcel = await run((r) => r.register(parcelName, poly, polyCells));
      if (parcel) {
        toast({
          kind: "success",
          title: `Parcel #${parcel.id} registered`,
          detail: `${polyCells.length} cells are now exclusively yours. Next: verify it with the satellite.`,
        });
        setDraft([]);
        setName("");
        setDrawing(false);
        select(parcel.id);
      }
    } finally {
      setRegistering(false);
    }
  };

  const tryDoubleCount = async () => {
    const target = parcels.find((p) => p.owner !== account) ?? parcels[0];
    if (!target) {
      toast({ kind: "info", title: "Nothing to overlap yet", detail: "Register a parcel first." });
      return;
    }
    // Same land, nudged a few metres: a different polygon, the same cells.
    const shifted = target.polygon.map(([la, ln]) => [la + 0.00005, ln + 0.0001] as LatLng);
    const polyCells = polygonToCells(shifted);
    setDrawing(false);
    setDraft(shifted);
    await new Promise((r) => setTimeout(r, 700));
    await register(shifted, "Duplicate claim (attack)", polyCells);
    setTimeout(() => setDraft([]), 1800);
  };

  const flashId = banner?.parcelId ?? null;

  return (
    <div className="flex h-screen flex-col bg-bg">
      <header className="z-[1100] flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line/70 bg-surface/80 px-4 backdrop-blur">
        <div className="flex items-center gap-4">
          <Logo size={26} />
          <span className="hidden h-5 w-px bg-line sm:block" />
          <span className="hidden text-sm text-mute sm:block">Registry</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-line bg-bg/60 p-0.5 text-xs font-semibold" role="group" aria-label="Mode">
            <button onClick={() => setMode("sim")} className={`whitespace-nowrap rounded-md px-2.5 py-1.5 transition sm:px-3 ${mode === "sim" ? "bg-brand text-bg" : "text-mute hover:text-ink"}`}>
              Simulation
            </button>
            <button
              onClick={() => chainAvailable && setMode("chain")}
              disabled={!chainAvailable}
              title={chainAvailable ? "Use the deployed smart contract" : "Contract not deployed in this build"}
              className={`whitespace-nowrap rounded-md px-2.5 py-1.5 transition sm:px-3 ${mode === "chain" ? "bg-brand text-bg" : "text-mute hover:text-ink"} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              On-chain
            </button>
          </div>
          {account && (
            <span className="pill pill-mute hidden font-mono sm:inline-flex">
              <Wallet className="h-3 w-3" /> {shortAddr(account)}
            </span>
          )}
          {mode === "sim" && registry?.reset && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                await registry.reset?.();
                setSelectedId(null);
                setDraft([]);
                await refresh();
                toast({ kind: "info", title: "Demo reset" });
              }}
              title="Restore the initial demo data"
            >
              <RotateCcw className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Reset</span>
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* MAP */}
        <div className="relative order-1 h-[46vh] shrink-0 lg:order-2 lg:h-auto lg:flex-1">
          <MapView
            parcels={parcels}
            selectedId={selectedId}
            onSelect={select}
            draft={draft}
            drawing={drawing}
            onAddPoint={addPoint}
            flashParcelId={flashId}
            me={account}
          />

          {/* legend */}
          <div className="pointer-events-none absolute bottom-6 left-3 z-[1000] hidden gap-3 rounded-lg border border-line/70 bg-bg/80 px-3 py-2 text-[11px] text-mute backdrop-blur sm:flex">
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand" /> Yours</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-sky" /> Others</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber" /> Frozen</span>
          </div>

          {drawing && (
            <div className="pointer-events-none absolute left-1/2 top-4 z-[1000] -translate-x-1/2 animate-rise rounded-full border border-brand/40 bg-bg/90 px-4 py-2 text-sm font-medium text-brand backdrop-blur">
              <MousePointer2 className="mr-1.5 inline h-4 w-4" /> Click the map to place corners
            </div>
          )}

          {banner && (
            <div className="pointer-events-none absolute inset-x-3 top-4 z-[1200] mx-auto max-w-md animate-shake rounded-2xl border border-danger/60 bg-bg/95 p-4 shadow-2xl backdrop-blur">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
                  <ShieldX className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-display text-lg font-semibold text-danger">Double counting blocked</p>
                  <p className="text-[13px] leading-snug text-mute">
                    {banner.text}. The registry refused the transaction: a cell can never be claimed twice.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!ready && (
            <div className="absolute inset-0 z-[1300] flex items-center justify-center bg-bg/70 text-sm text-mute backdrop-blur-sm">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting to the registry…
            </div>
          )}
        </div>

        {/* PANEL */}
        <aside className="order-2 flex min-h-0 flex-1 flex-col border-line/70 bg-surface/60 lg:order-1 lg:w-[420px] lg:flex-none lg:border-r">
          <nav className="grid shrink-0 grid-cols-3 gap-1 border-b border-line/70 p-2" role="tablist">
            {(
              [
                ["register", "Register", PenLine],
                ["parcels", `Parcels · ${parcels.length}`, Layers3],
                ["ledger", "Ledger", ListTree],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-[13px] font-semibold transition ${
                  tab === id ? "bg-raised text-ink shadow-inner" : "text-mute hover:text-ink"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <GuidedDemo parcels={parcels} events={events} retirements={retirements} account={account} />

            {tab === "register" && (
              <div className="card animate-rise space-y-4 p-4">
                <div>
                  <p className="text-[15px] font-semibold tracking-tight">Register a parcel</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-mute">
                    Outline your land. It is split into ~38 × 19 m cells; the contract refuses any cell that is already taken.
                  </p>
                </div>

                <input className="input" placeholder="Parcel name (e.g. Cajou Adjigo)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Parcel name" />

                <div className="grid grid-cols-3 gap-2">
                  <button className={`btn btn-sm ${drawing ? "btn-primary" : "btn-ghost"}`} onClick={() => setDrawing((d) => !d)}>
                    <Hexagon className="h-4 w-4" /> {drawing ? "Drawing…" : "Draw"}
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={draft.length === 0} onClick={() => setDraft((d) => d.slice(0, -1))}>
                    <Undo2 className="h-4 w-4" /> Undo
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={draft.length === 0} onClick={() => (setDraft([]), setDrawing(false))}>
                    <Eraser className="h-4 w-4" /> Clear
                  </button>
                </div>

                <dl className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-line/60 bg-bg/50 py-2">
                    <dd className="font-display text-lg font-semibold">{draft.length}</dd>
                    <dt className="text-[10px] uppercase tracking-wider text-mute">Corners</dt>
                  </div>
                  <div className="rounded-lg border border-line/60 bg-bg/50 py-2">
                    <dd className={`font-display text-lg font-semibold ${tooBig ? "text-danger" : ""}`}>{cells.length}</dd>
                    <dt className="text-[10px] uppercase tracking-wider text-mute">Cells / {MAX_CELLS_PER_PARCEL}</dt>
                  </div>
                  <div className="rounded-lg border border-line/60 bg-bg/50 py-2">
                    <dd className="font-display text-lg font-semibold">{areaHa.toFixed(1)}</dd>
                    <dt className="text-[10px] uppercase tracking-wider text-mute">Hectares</dt>
                  </div>
                </dl>
                {tooBig && <p className="text-xs text-danger">This polygon covers more than {MAX_CELLS_PER_PARCEL} cells (~{Math.round(MAX_CELLS_PER_PARCEL * 0.073)} ha). Draw a smaller parcel.</p>}

                <button className="btn btn-primary w-full" disabled={!canRegister} onClick={() => register(draft, name.trim(), cells)}>
                  {registering ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Writing to the ledger…
                    </>
                  ) : (
                    "Register on the ledger"
                  )}
                </button>

                <div className="relative">
                  <div className="absolute inset-x-0 top-1/2 h-px bg-line/70" />
                  <p className="relative mx-auto w-fit bg-[rgb(14_25_21)] px-3 text-[11px] uppercase tracking-widest text-mute">or test the guard rail</p>
                </div>
                <button className="btn btn-danger w-full" disabled={registering || parcels.length === 0} onClick={tryDoubleCount}>
                  <ShieldX className="h-4 w-4" /> Claim land that's already registered
                </button>
              </div>
            )}

            {tab === "parcels" && (
              <div className="space-y-3">
                {selected && <ParcelDetail key={`${selected.id}-${selected.status}-${selected.issued}-${selected.revoked}`} parcel={selected} />}
                <div className="space-y-2">
                  {parcels.length === 0 && <p className="py-6 text-center text-sm text-mute">No parcels yet.</p>}
                  {[...parcels]
                    .sort((a, b) => Number(b.owner === account) - Number(a.owner === account) || b.id - a.id)
                    .map((p) => (
                      <button
                        key={p.id}
                        onClick={() => select(p.id)}
                        className={`card flex w-full items-center justify-between gap-3 p-3 text-left transition hover:border-brand/40 ${
                          p.id === selectedId ? "!border-brand/60" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            <span className="mr-1.5 font-mono text-[11px] text-mute">#{p.id}</span>
                            {p.name}
                          </p>
                          <p className="mt-0.5 text-xs text-mute">
                            {p.owner === account ? "You" : shortAddr(p.owner)} · {p.areaHa.toFixed(1)} ha · {p.holdings} credits
                          </p>
                        </div>
                        <StatusPill status={p.status} />
                      </button>
                    ))}
                </div>
                {mine.length === 0 && (
                  <p className="text-center text-xs text-mute">
                    You haven't registered a parcel yet.{" "}
                    <button className="text-brand underline-offset-2 hover:underline" onClick={() => setTab("register")}>
                      Register one
                    </button>
                  </p>
                )}
              </div>
            )}

            {tab === "ledger" && (
              <div className="card animate-rise p-4">
                <p className="mb-3 text-[15px] font-semibold tracking-tight">Public ledger</p>
                <Ledger events={events} />
              </div>
            )}

            <p className="px-1 pb-4 pt-1 text-center text-[11px] leading-relaxed text-mute/80">
              {mode === "sim"
                ? "Simulation mode: same rules as the smart contract, running in your browser. Satellite data is live."
                : "On-chain mode: transactions are sent to the deployed TerraProof contract."}{" "}
              <Link href="/" className="underline-offset-2 hover:underline">
                About TerraProof
              </Link>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
