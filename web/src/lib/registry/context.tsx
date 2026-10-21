"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SimRegistry } from "./sim";
import { RegistryError, type LedgerEvent, type Parcel, type Registry, type RegistryState, type Retirement } from "./types";

export type ToastKind = "success" | "error" | "warning" | "info";
export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
}

export type Mode = "sim" | "chain";

interface Ctx {
  ready: boolean;
  mode: Mode;
  chainAvailable: boolean;
  setMode: (m: Mode) => void;
  account: string | null;
  registry: Registry | null;
  parcels: Parcel[];
  events: LedgerEvent[];
  retirements: Retirement[];
  refresh: () => Promise<void>;
  /** Runs a registry action, refreshes state, and reports errors as toasts. */
  run: <T>(fn: (r: Registry) => Promise<T>) => Promise<T | undefined>;
  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
  /** Last rejected registration, used to play the "double counting blocked" animation. */
  lastRejection: { parcelId: number; at: number } | null;
}

const RegistryContext = createContext<Ctx | null>(null);

export function useRegistry(): Ctx {
  const ctx = useContext(RegistryContext);
  if (!ctx) throw new Error("useRegistry must be used inside <RegistryProvider>");
  return ctx;
}

export function RegistryProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>("sim");
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [state, setState] = useState<RegistryState>({ parcels: [], events: [], retirements: [] });
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastRejection, setLastRejection] = useState<Ctx["lastRejection"]>(null);
  const toastId = useRef(0);
  const chainAvailable = !!process.env.NEXT_PUBLIC_CHAIN_ENABLED;

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++toastId.current;
      setToasts((cur) => [...cur.slice(-3), { ...t, id }]);
      setTimeout(() => dismissToast(id), t.kind === "error" ? 7000 : 4500);
    },
    [dismissToast]
  );

  // Build the registry adapter for the active mode.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReady(false);
      try {
        let r: Registry;
        if (mode === "chain") {
          const { ChainRegistry } = await import("./chain");
          r = await ChainRegistry.connect();
        } else {
          r = new SimRegistry();
        }
        const s = await r.load();
        if (cancelled) return;
        setRegistry(r);
        setState(s);
      } catch (e) {
        if (cancelled) return;
        toast({ kind: "error", title: "Could not open the registry", detail: (e as Error).message });
        if (mode === "chain") setModeState("sim");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, toast]);

  // The on-chain mode is never remembered: it needs a wallet, so it must always be an explicit choice.
  const setMode = useCallback((m: Mode) => setModeState(m), []);

  const refresh = useCallback(async () => {
    if (!registry) return;
    setState(await registry.load());
  }, [registry]);

  const run = useCallback(
    async <T,>(fn: (r: Registry) => Promise<T>): Promise<T | undefined> => {
      if (!registry) return undefined;
      try {
        const out = await fn(registry);
        setState(await registry.load());
        return out;
      } catch (e) {
        setState(await registry.load().catch(() => state));
        if (e instanceof RegistryError && e.code === "CELL_CLAIMED") {
          setLastRejection({ parcelId: e.conflictParcelId ?? 0, at: Date.now() });
        }
        toast({
          kind: e instanceof RegistryError && e.code === "CELL_CLAIMED" ? "warning" : "error",
          title: e instanceof RegistryError && e.code === "CELL_CLAIMED" ? "Double counting blocked" : "Action failed",
          detail: (e as Error).message,
        });
        return undefined;
      }
    },
    [registry, state, toast]
  );

  const value = useMemo<Ctx>(
    () => ({
      ready,
      mode,
      chainAvailable,
      setMode,
      account: registry?.account ?? null,
      registry,
      parcels: state.parcels,
      events: state.events,
      retirements: state.retirements,
      refresh,
      run,
      toasts,
      toast,
      dismissToast,
      lastRejection,
    }),
    [ready, mode, chainAvailable, setMode, registry, state, refresh, run, toasts, toast, dismissToast, lastRejection]
  );

  return <RegistryContext.Provider value={value}>{children}</RegistryContext.Provider>;
}
