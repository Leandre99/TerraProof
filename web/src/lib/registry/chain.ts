import { BrowserProvider, Contract, Interface, JsonRpcProvider, type Eip1193Provider, type Signer } from "ethers";
import deployment from "@/contracts/deployment.json";
import { cellsAreaHa, polygonToCells, type LatLng } from "../geo";
import { TERRAPROOF_ABI, STATUS_BY_INDEX, decodeDataUri, decodeMetadata, encodeMetadata } from "./abi";
import {
  RegistryError,
  type LedgerEvent,
  type LedgerEventType,
  type MrvReport,
  type Parcel,
  type Registry,
  type RegistryState,
  type Retirement,
} from "./types";

const REJECTED_KEY = `terraproof:chain:rejected:${deployment.address}`;
const REPORTS_KEY = `terraproof:chain:reports:${deployment.address}`;
const LOG_CHUNK = 9_000;

declare global {
  interface Window {
    ethereum?: Eip1193Provider & { on?: (e: string, cb: () => void) => void };
  }
}

const iface = new Interface(TERRAPROOF_ABI);
const ZERO = "0x0000000000000000000000000000000000000000";
const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function decodeRevert(e: unknown): RegistryError {
  const data = (e as { data?: string; info?: { error?: { data?: string } } })?.data ??
    (e as { info?: { error?: { data?: string } } })?.info?.error?.data;
  if (typeof data === "string" && data.startsWith("0x")) {
    try {
      const parsed = iface.parseError(data);
      if (parsed?.name === "CellAlreadyClaimed") {
        const cell = BigInt(parsed.args[0]);
        const pid = Number(parsed.args[1]);
        return new RegistryError("CELL_CLAIMED", `Cell 0x${cell.toString(16)} is already claimed by parcel #${pid}.`, pid);
      }
      if (parsed?.name === "NoCells") return new RegistryError("NO_CELLS", "The polygon contains no cell.");
      if (parsed?.name === "TooManyCells") return new RegistryError("TOO_MANY_CELLS", "Parcel too large.");
      if (parsed?.name === "ParcelNotActive" || parsed?.name === "ParcelFrozen")
        return new RegistryError("NOT_ACTIVE", "This parcel is frozen.");
      if (parsed?.name === "ExceedsCeiling") return new RegistryError("CEILING", "Exceeds the issuance ceiling.");
    } catch {
      /* fall through */
    }
  }
  const msg = (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? "Transaction failed";
  return new RegistryError("OTHER", msg);
}

export class ChainRegistry implements Registry {
  readonly mode = "chain" as const;
  private reader: JsonRpcProvider | BrowserProvider;
  private contract: Contract;
  private signer: Signer | null;
  readonly account: string | null;

  private constructor(reader: JsonRpcProvider | BrowserProvider, signer: Signer | null, account: string | null) {
    this.reader = reader;
    this.signer = signer;
    this.account = account;
    this.contract = new Contract(deployment.address, TERRAPROOF_ABI, signer ?? reader);
  }

  private requireSigner() {
    if (!this.signer) throw new RegistryError("OTHER", "Read-only view: connect a wallet (MetaMask) to send transactions.");
  }

  static async connect(): Promise<ChainRegistry> {
    if (!deployment.address) throw new Error("No contract deployed yet. Run the deploy script first.");
    if (!window.ethereum) {
      // No wallet: anyone can still read the public ledger and proofs through the public RPC.
      if (deployment.rpcUrl) return new ChainRegistry(new JsonRpcProvider(deployment.rpcUrl, deployment.chainId, { staticNetwork: true }), null, null);
      throw new Error("No wallet found. Install MetaMask or use the simulation mode.");
    }
    const browser = new BrowserProvider(window.ethereum);
    await browser.send("eth_requestAccounts", []);
    const net = await browser.getNetwork();
    if (Number(net.chainId) !== deployment.chainId) {
      try {
        await browser.send("wallet_switchEthereumChain", [{ chainId: "0x" + deployment.chainId.toString(16) }]);
      } catch {
        throw new Error(`Please switch your wallet to ${deployment.network} (chain ${deployment.chainId}).`);
      }
    }
    const fresh = new BrowserProvider(window.ethereum);
    const signer = await fresh.getSigner();
    const reader = deployment.rpcUrl ? new JsonRpcProvider(deployment.rpcUrl, deployment.chainId, { staticNetwork: true }) : fresh;
    return new ChainRegistry(reader, signer, await signer.getAddress());
  }

  private get read() {
    return new Contract(deployment.address, TERRAPROOF_ABI, this.reader);
  }

  private rejected(): LedgerEvent[] {
    try {
      return JSON.parse(localStorage.getItem(REJECTED_KEY) ?? "[]");
    } catch {
      return [];
    }
  }

  private pushRejected(parcelId: number, detail: string) {
    const list = this.rejected();
    list.unshift({
      id: `rej-${Date.now()}`,
      ts: Date.now(),
      type: "RegistrationRejected",
      parcelId,
      title: "Double counting blocked",
      detail: `${detail} (transaction reverted before being sent)`,
    });
    try {
      localStorage.setItem(REJECTED_KEY, JSON.stringify(list.slice(0, 20)));
    } catch {
      /* ignore */
    }
  }

  async load(): Promise<RegistryState> {
    const c = this.read;
    // The activity feed and every parcel are read in parallel: sequential RPC round-trips made the first load slow.
    const logsPromise = this.loadLogs();
    const count = Number(await c.parcelCount());
    const evidence = new Map<number, string>();
    const parcels: Parcel[] = await Promise.all(
      Array.from({ length: count }, async (_, i) => {
        const id = i + 1;
        const p = await c.getParcel(id);
        evidence.set(id, String(p.lastEvidence));
        const meta = decodeMetadata(p.metadataURI);
        const polygon = (meta?.polygon ?? []) as LatLng[];
        const cells = polygonToCells(polygon);
        const holdings = Number(await c.balanceOf(p.owner, id));
        let community: Parcel["community"];
        try {
          const addr: string = await c.communityOf(id);
          if (addr && addr !== ZERO) {
            community = {
              name: meta?.community ?? shortAddress(addr),
              address: addr,
              bps: Number(await c.communityShareBps(id)),
              holdings: Number(await c.balanceOf(addr, id)),
            };
          }
        } catch {
          /* contract deployed before the community share existed */
        }
        return {
          id,
          name: meta?.name ?? `Parcel #${id}`,
          owner: p.owner,
          polygon,
          cells: cells.map(String),
          areaHa: cellsAreaHa(cells),
          status: STATUS_BY_INDEX[Number(p.status)] === "flagged" ? ("flagged" as const) : ("active" as const),
          registeredAt: Number(p.registeredAt) * 1000,
          issued: Number(p.issued),
          revoked: Number(p.revoked),
          retired: Number(p.retired),
          holdings,
          community,
        };
      })
    );

    const { events, retirements, reports, latestIssued } = await logsPromise;
    const cache = this.cachedReports();
    for (const parcel of parcels) {
      const hash = String(evidence.get(parcel.id) ?? "").toLowerCase();
      parcel.lastReport = cache[`p${parcel.id}`] ?? cache[hash] ?? reports.get(hash) ?? latestIssued.get(parcel.id);
    }
    return { parcels, events: [...this.rejected(), ...events].sort((a, b) => b.ts - a.ts), retirements };
  }

  private cachedReports(): Record<string, MrvReport> {
    try {
      return JSON.parse(localStorage.getItem(REPORTS_KEY) ?? "{}");
    } catch {
      return {};
    }
  }

  /** Remember the latest report per parcel (and by hash): shown even when a run issued nothing new. */
  private cacheReport(report: MrvReport, parcelId: number) {
    const all = this.cachedReports();
    all[report.hash.toLowerCase()] = report;
    all[`p${parcelId}`] = report;
    try {
      localStorage.setItem(REPORTS_KEY, JSON.stringify(all));
    } catch {
      /* ignore */
    }
  }

  private async loadLogs(): Promise<{
    events: LedgerEvent[];
    retirements: Retirement[];
    reports: Map<string, MrvReport>;
    latestIssued: Map<number, MrvReport>;
  }> {
    const logs: { blockNumber: number; transactionHash: string; fragmentName: string; args: Record<string, unknown> }[] = [];
    const blockTs = new Map<number, number>();
    try {
      const latest = await this.reader.getBlockNumber();
      const fetchRange = async (from: number, to: number) => {
        const chunk = await this.reader.getLogs({ address: deployment.address, fromBlock: from, toBlock: to });
        for (const l of chunk) {
          try {
            const parsed = iface.parseLog(l);
            if (parsed) {
              logs.push({
                blockNumber: l.blockNumber,
                transactionHash: l.transactionHash,
                fragmentName: parsed.name,
                args: parsed.args.toObject(),
              });
            }
          } catch {
            /* not one of ours */
          }
        }
      };
      try {
        // Most RPCs accept one wide query; some free tiers cap the range, so fall back to chunks.
        await fetchRange(deployment.deployBlock, latest);
      } catch {
        logs.length = 0;
        for (let from = deployment.deployBlock; from <= latest; from += LOG_CHUNK) {
          await fetchRange(from, Math.min(latest, from + LOG_CHUNK - 1));
        }
      }
      await Promise.all(
        [...new Set(logs.map((l) => l.blockNumber))].map(async (b) => {
          const blk = await this.reader.getBlock(b);
          blockTs.set(b, (blk?.timestamp ?? 0) * 1000);
        })
      );
    } catch {
      // The activity feed is a nicety: parcels and balances are read from contract state, so never fail the whole view.
      logs.length = 0;
    }

    const events: LedgerEvent[] = [];
    const retirements: Retirement[] = [];
    const reports = new Map<string, MrvReport>();
    const latestIssued = new Map<number, MrvReport>();
    for (const l of logs) {
      const ts = blockTs.get(l.blockNumber) ?? Date.now();
      const a = l.args as Record<string, bigint | string>;
      const pid = a.parcelId !== undefined ? Number(a.parcelId) : undefined;
      const mk = (type: LedgerEventType, title: string, detail?: string) =>
        events.push({ id: `${l.transactionHash}-${events.length}`, ts, type, parcelId: pid, title, detail, tx: l.transactionHash });
      switch (l.fragmentName) {
        case "ParcelRegistered":
          mk("ParcelRegistered", `Parcel #${pid} registered`, `${a.cellCount} cells`);
          break;
        case "CreditsIssued":
          mk("CreditsIssued", `${a.amount} credits issued`, `Evidence ${String(a.evidence).slice(0, 14)}…`);
          {
            const rep = decodeDataUri<MrvReport>(String(a.evidenceURI));
            if (rep?.hash && pid !== undefined) {
              reports.set(String(a.evidence).toLowerCase(), rep);
              latestIssued.set(pid, rep);
            }
          }
          break;
        case "ParcelFlagged":
          mk("ParcelFlagged", "Credits frozen", String(a.reason));
          break;
        case "FlagCleared":
          mk("FlagCleared", "Flag cleared");
          break;
        case "CreditsRevoked":
          mk("CreditsRevoked", `${a.amount} credits revoked`, `Evidence ${String(a.evidence).slice(0, 14)}…`);
          break;
        case "CreditsRetired":
          mk("CreditsRetired", `${a.amount} credits retired`, `For ${a.beneficiary}`);
          retirements.push({
            id: Number(a.retirementId),
            parcelId: Number(a.parcelId),
            retiree: String(a.retiree),
            amount: Number(a.amount),
            beneficiary: String(a.beneficiary),
            reason: String(a.reason),
            ts,
            tx: l.transactionHash,
          });
          break;
      }
    }
    return { events, retirements, reports, latestIssued };
  }

  async register(
    name: string,
    polygon: LatLng[],
    cells: bigint[],
    community?: { name: string; address?: string; bps: number }
  ): Promise<Parcel> {
    this.requireSigner();
    const useCommunity = !!community?.address && /^0x[0-9a-fA-F]{40}$/.test(community.address);
    if (community && !useCommunity) {
      throw new RegistryError("OTHER", "On-chain mode needs the community wallet address (0x…) to enforce its share.");
    }
    const uri = encodeMetadata({ name, polygon, community: community?.name });
    const send = (fn: "staticCall" | "send") => {
      const m = useCommunity ? this.contract.registerParcelWithCommunity : this.contract.registerParcel;
      const args = useCommunity ? [cells, uri, community!.address, community!.bps] : [cells, uri];
      return fn === "staticCall" ? m.staticCall(...args) : m(...args);
    };
    try {
      // Dry-run first: a double-counting attempt reverts here and never costs gas.
      await send("staticCall");
    } catch (e) {
      const err = decodeRevert(e);
      if (err.code === "CELL_CLAIMED") this.pushRejected(err.conflictParcelId ?? 0, err.message);
      throw err;
    }
    try {
      const tx = await send("send");
      await tx.wait();
    } catch (e) {
      throw decodeRevert(e);
    }
    const state = await this.load();
    return state.parcels[state.parcels.length - 1];
  }

  private async oracle<T>(action: string, parcelId: number, extra: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch("/api/oracle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, parcelId, ...extra }),
    });
    const json = await res.json();
    if (!res.ok) throw new RegistryError("OTHER", json.error ?? "Oracle error");
    return json as T;
  }

  async verify(parcelId: number): Promise<MrvReport> {
    const { report } = await this.oracle<{ report: MrvReport }>("verify", parcelId);
    this.cacheReport(report, parcelId);
    return report;
  }

  async monitor(parcelId: number, opts?: { simulateLoss?: boolean; asOf?: string }) {
    const out = await this.oracle<{ report: MrvReport; flagged: boolean }>("monitor", parcelId, { simulateLoss: !!opts?.simulateLoss });
    this.cacheReport(out.report, parcelId);
    return out;
  }

  async revoke(parcelId: number): Promise<void> {
    await this.oracle("revoke", parcelId);
  }

  async clearFlag(parcelId: number): Promise<void> {
    await this.oracle("clear", parcelId);
  }

  async retire(parcelId: number, amount: number, beneficiary: string, reason: string): Promise<void> {
    this.requireSigner();
    try {
      const tx = await this.contract.retire(parcelId, amount, beneficiary, reason);
      await tx.wait();
    } catch (e) {
      throw decodeRevert(e);
    }
  }
}
