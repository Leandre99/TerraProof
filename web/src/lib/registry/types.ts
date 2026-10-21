import type { LatLng } from "../geo";

export type ParcelStatus = "active" | "flagged";

export interface MrvReport {
  source: "sentinel-2" | "cached-sample";
  simulated: boolean; // true when a synthetic loss was injected for the demo
  generatedAt: string;
  series: { date: string; ndvi: number }[];
  ndviMean: number;
  ndviLatest: number;
  dropPct: number; // latest vs trailing mean, in %
  credits: number; // proposed issuance (tCO2e proxy)
  hash: string; // 0x… sha-256 of the report body, anchored on-chain as evidence
  methodology: string;
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
  register(name: string, polygon: LatLng[], cells: bigint[]): Promise<Parcel>;
  /** MRV oracle run: analyse satellite data and issue the credits it supports. */
  verify(parcelId: number): Promise<MrvReport>;
  /** Continuous monitoring run; freezes the parcel if vegetation loss is detected. */
  monitor(parcelId: number, opts?: { simulateLoss?: boolean }): Promise<{ report: MrvReport; flagged: boolean }>;
  /** Burn the credits of a flagged parcel (confirmed loss). */
  revoke(parcelId: number): Promise<void>;
  /** Lift a flag after a false alarm. */
  clearFlag(parcelId: number): Promise<void>;
  retire(parcelId: number, amount: number, beneficiary: string, reason: string): Promise<void>;
  reset?(): Promise<void>;
}

export const FLAG_DROP_PCT = 30;

/** Fetch an MRV report from the oracle API route. */
export async function fetchMrv(parcel: Pick<Parcel, "polygon" | "areaHa">, simulateLoss = false): Promise<MrvReport> {
  const res = await fetch("/api/mrv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ polygon: parcel.polygon, areaHa: parcel.areaHa, simulateLoss }),
  });
  if (!res.ok) throw new RegistryError("OTHER", "The MRV oracle could not analyse this parcel.");
  return (await res.json()) as MrvReport;
}

/** Credits per cell ceiling mirrored from the contract. */
export const MAX_CREDITS_PER_CELL = 50;
