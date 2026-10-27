import type { LatLng } from "../geo";

export type ParcelStatus = "active" | "flagged";

export interface MrvObservation {
  date: string;
  ndvi: number;
  ndmi?: number; // canopy moisture, the independent second signal (methodology v1)
  cloudPct?: number; // share of the parcel hidden by cloud / shadow
  vegPct?: number; // share of the parcel classified as vegetation
  scene?: string; // Sentinel-2 item id, lets anyone re-run the analysis
}

export interface MrvReport {
  version?: string; // methodology version; undefined on reports written before v1
  source: "sentinel-2" | "cached-sample";
  simulated: boolean; // true when a synthetic loss was injected for the demo
  generatedAt: string;
  asOf?: string; // the analysis date (YYYY-MM-DD); may be in the past for a historical replay
  series: MrvObservation[];
  ndviMean: number;
  ndviLatest: number;
  ndmiMean?: number;
  ndmiLatest?: number;
  dropPct: number; // latest vs same-season reference (or trailing mean), in %
  ndmiDropPct?: number;
  method?: "same-season" | "trailing" | "none";
  verdict?: "eligible" | "not-eligible" | "uncertain";
  reasons?: string[];
  flag?: boolean; // monitoring decision: freeze the parcel
  areaHa?: number;
  credits: number; // proposed issuance (tCO2e proxy)
  hash: string; // 0x… sha-256 of the report body, anchored on-chain as evidence
  evidenceHash?: string; // sha-256 of the raw scenes only: recomputable by anyone
  methodology: string;
}

/** A community that receives a fixed share of every issuance of a parcel, enforced by the contract. */
export interface Community {
  name: string;
  address?: string; // on-chain mode
  bps: number; // basis points, 2000 = 20%
  holdings: number;
}

export interface Parcel {
  id: number;
  name: string;
  owner: string;
  polygon: LatLng[];
  cells: string[]; // decimal strings of uint64 cell ids
  areaHa: number;
  status: ParcelStatus;
  registeredAt: number; // ms
  issued: number;
  revoked: number;
  retired: number;
  holdings: number; // credits currently held by the parcel owner (issued - revoked - retired)
  community?: Community;
  lastReport?: MrvReport;
}

export type LedgerEventType =
  | "ParcelRegistered"
  | "RegistrationRejected"
  | "CreditsIssued"
  | "ParcelFlagged"
  | "CreditsRevoked"
  | "FlagCleared"
  | "CreditsRetired";

export interface LedgerEvent {
  id: string;
  ts: number;
  type: LedgerEventType;
  parcelId?: number;
  title: string;
  detail?: string;
  tx?: string; // tx hash in chain mode, pseudo-hash in sim mode
}

export interface Retirement {
  id: number;
  parcelId: number;
  retiree: string;
  amount: number;
  beneficiary: string;
  reason: string;
  ts: number;
  tx?: string;
}

export class RegistryError extends Error {
  constructor(
    public code: "CELL_CLAIMED" | "NO_CELLS" | "TOO_MANY_CELLS" | "NOT_ACTIVE" | "NOT_FLAGGED" | "CEILING" | "INSUFFICIENT" | "OTHER",
    message: string,
    public conflictParcelId?: number
  ) {
    super(message);
  }
}

export interface RegistryState {
  parcels: Parcel[];
  events: LedgerEvent[];
  retirements: Retirement[];
}

/** Everything the UI needs; implemented by the in-browser simulator and by the on-chain adapter. */
export interface Registry {
  readonly mode: "sim" | "chain";
  readonly account: string | null;
  load(): Promise<RegistryState>;
  register(name: string, polygon: LatLng[], cells: bigint[], community?: { name: string; address?: string; bps: number }): Promise<Parcel>;
  /** MRV oracle run: analyse satellite data and issue the credits it supports. */
  verify(parcelId: number, opts?: { asOf?: string }): Promise<MrvReport>;
  /** Continuous monitoring run; freezes the parcel if vegetation loss is detected. */
  monitor(parcelId: number, opts?: { simulateLoss?: boolean; asOf?: string }): Promise<{ report: MrvReport; flagged: boolean }>;
  /** Burn the credits of a flagged parcel (confirmed loss). */
  revoke(parcelId: number): Promise<void>;
  /** Lift a flag after a false alarm. */
  clearFlag(parcelId: number): Promise<void>;
  retire(parcelId: number, amount: number, beneficiary: string, reason: string): Promise<void>;
  reset?(): Promise<void>;
}

export const FLAG_DROP_PCT = 30;

/** Fetch an MRV report from the oracle API route. */
export async function fetchMrv(
  parcel: Pick<Parcel, "polygon" | "areaHa">,
  simulateLoss = false,
  asOf?: string
): Promise<MrvReport> {
  const res = await fetch("/api/mrv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ polygon: parcel.polygon, areaHa: parcel.areaHa, simulateLoss, asOf }),
  });
  if (!res.ok) throw new RegistryError("OTHER", "The MRV oracle could not analyse this parcel.");
  return (await res.json()) as MrvReport;
}

/** Credits per cell ceiling mirrored from the contract. */
export const MAX_CREDITS_PER_CELL = 50;
