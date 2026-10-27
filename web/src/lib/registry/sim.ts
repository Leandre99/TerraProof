import type { LatLng } from "../geo";
import { cellsAreaHa, polygonToCells, MAX_CELLS_PER_PARCEL } from "../geo";
import {
  FLAG_DROP_PCT,
  MAX_CREDITS_PER_CELL,
  RegistryError,
  fetchMrv,
  type LedgerEvent,
  type LedgerEventType,
  type MrvReport,
  type Parcel,
  type Registry,
  type RegistryState,
  type Retirement,
} from "./types";

/**
 * In-browser simulator that applies EXACTLY the same rules as contracts/TerraProof.sol
 * (cell claiming, issuance ceiling, flag/freeze, revoke, retire). It lets anyone
 * explore the product without a wallet. The on-chain adapter swaps it out 1:1.
 */

const STORAGE_KEY = "terraproof:sim:v4"; // bumped: reseeds visitors who stored an older demo state
export const SIM_ACCOUNT = "0xDE30...0001";
const SEED_OWNER_A = "0x7A3f...c91B";
const SEED_OWNER_B = "0x19d2...44aE";
const SEED_OWNER_C = "0x5Ce8...02d7";

/** The simulator mimics a 2-of-3 verifier quorum (see TerraProof.sol); the 3 verifiers are simulated here. */
export const SIM_QUORUM = { threshold: 2, verifiers: 3 };
const quorumNote = `approved by ${SIM_QUORUM.threshold} of ${SIM_QUORUM.verifiers} verifiers (simulated)`;

function rect(s: number, w: number, n: number, e: number): LatLng[] {
  return [
    [s, w],
    [n, w],
    [n, e],
    [s, e],
  ];
}

function pseudoTx(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function seedState(): RegistryState {
  const now = Date.now();
  const mk = (
    id: number,
    name: string,
    owner: string,
    polygon: LatLng[],
    issued: number,
    ageDays: number,
    community?: { name: string; bps: number }
  ): Parcel => {
    const cells = polygonToCells(polygon);
    const toCommunity = community ? Math.floor((issued * community.bps) / 10_000) : 0;
    return {
      id,
      name,
      owner,
      polygon,
      cells: cells.map(String),
      areaHa: cellsAreaHa(cells),
      status: "active",
      registeredAt: now - ageDays * 86_400_000,
      issued,
      revoked: 0,
      retired: 0,
      holdings: issued - toCommunity,
      community: community ? { name: community.name, bps: community.bps, holdings: toCommunity } : undefined,
    };
  };
  const parcels = [
    mk(1, "Savalou agroforestry cooperative", SEED_OWNER_A, rect(7.9325, 2.056, 7.9345, 2.0595), 420, 41),
    mk(2, "Adjigo cashew farm", SEED_OWNER_B, rect(7.9325, 2.0605, 7.934, 2.063), 180, 17),
    // Mangrove restoration on the Bouche du Roy lagoon (Grand-Popo, Benin); 20 % of every issuance goes to the village.
    mk(3, "Grand-Popo mangrove committee", SEED_OWNER_C, rect(6.2848, 1.8205, 6.2878, 1.8245), 310, 9, {
      name: "Grand-Popo village fund",
      bps: 2000,
    }),
  ];
  const events: LedgerEvent[] = parcels
    .flatMap((p) => [
      {
        id: `seed-i-${p.id}`,
        ts: p.registeredAt + 3_600_000,
        type: "CreditsIssued" as LedgerEventType,
        parcelId: p.id,
        title: `${p.issued} credits issued`,
        detail: p.name,
        tx: pseudoTx(),
      },
      {
        id: `seed-r-${p.id}`,
        ts: p.registeredAt,
        type: "ParcelRegistered" as LedgerEventType,
        parcelId: p.id,
        title: `Parcel #${p.id} registered`,
        detail: `${p.name} · ${p.cells.length} cells`,
        tx: pseudoTx(),
      },
    ])
    .sort((a, b) => b.ts - a.ts);
  return { parcels, events, retirements: [] };
}

export class SimRegistry implements Registry {
  readonly mode = "sim" as const;
  readonly account = SIM_ACCOUNT;
  private state: RegistryState;

  constructor() {
    this.state = this.read() ?? seedState();
    this.write();
  }

  private read(): RegistryState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as RegistryState) : null;
    } catch {
      return null;
    }
  }

  private write() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* storage unavailable (private mode): state lives in memory only */
    }
  }

  private push(type: LedgerEventType, title: string, parcelId?: number, detail?: string): string {
    const tx = pseudoTx();
    this.state.events.unshift({ id: tx.slice(0, 18), ts: Date.now(), type, parcelId, title, detail, tx });
    return tx;
  }

  private parcel(id: number): Parcel {
    const p = this.state.parcels.find((x) => x.id === id);
    if (!p) throw new RegistryError("OTHER", `Unknown parcel #${id}`);
    return p;
  }

  async load(): Promise<RegistryState> {
    return structuredClone(this.state);
  }

  async register(
    name: string,
    polygon: LatLng[],
    cells: bigint[],
    community?: { name: string; address?: string; bps: number }
  ): Promise<Parcel> {
    if (community && (community.bps <= 0 || community.bps > 10_000 || !community.name.trim()))
      throw new RegistryError("OTHER", "A community share needs a name and a share between 0.01% and 100%.");
    if (cells.length === 0) throw new RegistryError("NO_CELLS", "The polygon is too small to contain a single cell.");
    if (cells.length > MAX_CELLS_PER_PARCEL)
      throw new RegistryError("TOO_MANY_CELLS", `A parcel is limited to ${MAX_CELLS_PER_PARCEL} cells.`);

    const claimed = new Map<string, number>();
    for (const p of this.state.parcels) for (const c of p.cells) claimed.set(c, p.id);

    const seen = new Set<string>();
    for (const c of cells) {
      const key = c.toString();
      const owner = claimed.get(key) ?? (seen.has(key) ? this.state.parcels.length + 1 : undefined);
      if (owner !== undefined) {
        this.push(
          "RegistrationRejected",
          "Double counting blocked",
          owner,
          `Cell 0x${c.toString(16)} already belongs to parcel #${owner}`
        );
        this.write();
        throw new RegistryError("CELL_CLAIMED", `Cell 0x${c.toString(16)} is already claimed by parcel #${owner}.`, owner);
      }
      seen.add(key);
    }

    const id = Math.max(0, ...this.state.parcels.map((p) => p.id)) + 1;
    const parcel: Parcel = {
      id,
      name,
      owner: SIM_ACCOUNT,
      polygon,
      cells: cells.map(String),
      areaHa: cellsAreaHa(cells),
      status: "active",
      registeredAt: Date.now(),
      issued: 0,
      revoked: 0,
      retired: 0,
      holdings: 0,
      community: community ? { name: community.name.trim(), bps: community.bps, holdings: 0 } : undefined,
    };
    this.state.parcels.push(parcel);
    this.push("ParcelRegistered", `Parcel #${id} registered`, id, `${name} · ${cells.length} cells`);
    this.write();
    return structuredClone(parcel);
  }

  async verify(parcelId: number, opts?: { asOf?: string }): Promise<MrvReport> {
    const p = this.parcel(parcelId);
    if (p.status !== "active") throw new RegistryError("NOT_ACTIVE", "Parcel is frozen.");
    const report = await fetchMrv(p, false, opts?.asOf);
    // Only issue what is not already outstanding: the report states the supportable total.
    const ceiling = p.cells.length * MAX_CREDITS_PER_CELL;
    const outstanding = p.issued - p.revoked;
    const amount = Math.min(Math.max(0, report.credits - outstanding), ceiling - outstanding);
    p.lastReport = report;
    if (amount > 0) {
      const toCommunity = p.community ? Math.floor((amount * p.community.bps) / 10_000) : 0;
      p.issued += amount;
      p.holdings += amount - toCommunity;
      if (p.community) p.community.holdings += toCommunity;
      this.push(
        "CreditsIssued",
        `${amount} credits issued`,
        parcelId,
        `Evidence ${report.hash.slice(0, 14)}… · ${quorumNote}${toCommunity ? ` · ${toCommunity} to ${p.community!.name}` : ""}`
      );
    }
    this.write();
    return report;
  }

  async monitor(parcelId: number, opts?: { simulateLoss?: boolean; asOf?: string }) {
    const p = this.parcel(parcelId);
    if (p.status !== "active") throw new RegistryError("NOT_ACTIVE", "Parcel is already flagged.");
    const report = await fetchMrv(p, !!opts?.simulateLoss, opts?.asOf);
    p.lastReport = report;
    const flagged = report.flag ?? report.dropPct >= FLAG_DROP_PCT;
    if (flagged) {
      p.status = "flagged";
      this.push(
        "ParcelFlagged",
        "Credits frozen",
        parcelId,
        `NDVI dropped ${report.dropPct.toFixed(0)}% ${report.method === "same-season" ? "vs the same season last year" : "below the trailing average"}${
          report.simulated ? " (simulated event)" : opts?.asOf ? ` (historical replay as of ${opts.asOf})` : ""
        }`
      );
    }
    this.write();
    return { report, flagged };
  }

  async revoke(parcelId: number): Promise<void> {
    const p = this.parcel(parcelId);
    if (p.status !== "flagged") throw new RegistryError("NOT_FLAGGED", "Only flagged parcels can be revoked.");
    const n = p.holdings + (p.community?.holdings ?? 0);
    if (n <= 0) throw new RegistryError("INSUFFICIENT", "No credits left to revoke.");
    p.revoked += n;
    p.holdings = 0;
    if (p.community) p.community.holdings = 0;
    this.push(
      "CreditsRevoked",
      `${n} credits revoked`,
      parcelId,
      `${p.lastReport ? `Evidence ${p.lastReport.hash.slice(0, 14)}… · ` : ""}${quorumNote}${p.community ? " · owner and community burned" : ""}`
    );
    this.write();
  }

  async clearFlag(parcelId: number): Promise<void> {
    const p = this.parcel(parcelId);
    if (p.status !== "flagged") throw new RegistryError("NOT_FLAGGED", "Parcel is not flagged.");
    p.status = "active";
    this.push("FlagCleared", "Flag cleared", parcelId, `Vegetation back to normal · ${quorumNote}`);
    this.write();
  }

  async retire(parcelId: number, amount: number, beneficiary: string, reason: string): Promise<void> {
    const p = this.parcel(parcelId);
    if (p.status !== "active") throw new RegistryError("NOT_ACTIVE", "Credits of a frozen parcel cannot be retired.");
    if (amount <= 0 || amount > p.holdings) throw new RegistryError("INSUFFICIENT", "You do not hold that many credits.");
    p.retired += amount;
    p.holdings -= amount;
    const tx = this.push("CreditsRetired", `${amount} credits retired`, parcelId, `For ${beneficiary}`);
    const r: Retirement = {
      id: this.state.retirements.length,
      parcelId,
      retiree: SIM_ACCOUNT,
      amount,
      beneficiary,
      reason,
      ts: Date.now(),
      tx,
    };
    this.state.retirements.push(r);
    this.write();
  }

  async reset(): Promise<void> {
    this.state = seedState();
    this.write();
  }
}
