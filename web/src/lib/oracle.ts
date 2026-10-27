import { Contract, JsonRpcProvider, Wallet } from "ethers";
import deployment from "@/contracts/deployment.json";
import { TERRAPROOF_ABI } from "@/lib/registry/abi";

/**
 * Server-side verifier wallets. `VERIFIER_PRIVATE_KEYS` (comma separated) lists the verifier keys; the
 * single `VERIFIER_PRIVATE_KEY` of the first deployment still works. When the contract requires a
 * quorum, the oracle casts one vote per key until the contract executes the action.
 *
 * In this demo every key is held by the same server, so the quorum shows the mechanism but not
 * independence. The contract supports truly independent verifiers: grant VERIFIER_ROLE to wallets run
 * by different organisations, then raise the threshold with setThreshold.
 */

export interface Oracle {
  contracts: Contract[]; // one per verifier wallet
  read: Contract;
  threshold: number;
}

function keys(): string[] {
  const raw = process.env.VERIFIER_PRIVATE_KEYS || process.env.VERIFIER_PRIVATE_KEY || "";
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export async function getOracle(): Promise<Oracle> {
  const rpc = process.env.RPC_URL || deployment.rpcUrl;
  const list = keys();
  if (!list.length || !rpc || !deployment.address) {
    throw new Error("Oracle is not configured (VERIFIER_PRIVATE_KEYS, RPC_URL, deployment).");
  }
  const provider = new JsonRpcProvider(rpc);
  const contracts = list.map((k) => new Contract(deployment.address, TERRAPROOF_ABI, new Wallet(k, provider)));
  const read = new Contract(deployment.address, TERRAPROOF_ABI, provider);
  let threshold = 1;
  try {
    // Contracts deployed before the quorum upgrade have no threshold(): one vote is enough.
    threshold = Math.max(1, Number(await read.threshold()));
  } catch {
    threshold = 1;
  }
  return { contracts, read, threshold };
}

/**
 * Cast votes with successive verifier wallets until the quorum is reached.
 * Returns the hash of the transaction that executed the action.
 */
export async function castVotes(o: Oracle, call: (c: Contract) => Promise<{ hash: string; wait: () => Promise<unknown> }>): Promise<string> {
  const needed = Math.min(o.threshold, o.contracts.length);
  if (o.threshold > o.contracts.length) {
    throw new Error(`The contract requires ${o.threshold} verifiers but only ${o.contracts.length} key(s) are configured.`);
  }
  let last = "";
  let cast = 0;
  for (const c of o.contracts) {
    if (cast >= needed) break;
    try {
      const tx = await call(c);
      await tx.wait();
      last = tx.hash;
      cast++;
    } catch (e) {
      // A verifier that already approved this exact action in an earlier, interrupted round is skipped.
      if (String((e as Error).message).includes("AlreadyApproved")) continue;
      throw e;
    }
  }
  if (!last) throw new Error("No vote was cast.");
  return last;
}
