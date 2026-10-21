import { NextResponse } from "next/server";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import deployment from "@/contracts/deployment.json";
import { TERRAPROOF_ABI, decodeMetadata, encodeDataUri } from "@/lib/registry/abi";
import { cellsAreaHa, polygonToCells, type LatLng } from "@/lib/geo";
import { FLAG_DROP_PCT, runMrv } from "@/lib/mrv";

/**
 * On-chain MRV oracle. Holds the VERIFIER key (server side only), re-runs the satellite
 * analysis itself (it never trusts a report sent by the browser) and submits the
 * transaction. Used by the web app in "On-chain" mode.
 */

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_CREDITS_PER_CELL = 50;

function oracle() {
  const key = process.env.VERIFIER_PRIVATE_KEY;
  const rpc = process.env.RPC_URL || deployment.rpcUrl;
  if (!key || !rpc || !deployment.address) throw new Error("Oracle is not configured (VERIFIER_PRIVATE_KEY, RPC_URL, deployment).");
  const wallet = new Wallet(key, new JsonRpcProvider(rpc));
  return new Contract(deployment.address, TERRAPROOF_ABI, wallet);
}

export async function POST(req: Request) {
  try {
    const { action, parcelId, simulateLoss } = (await req.json()) as {
      action: "verify" | "monitor" | "revoke" | "clear";
      parcelId: number;
      simulateLoss?: boolean;
    };
    if (!Number.isInteger(parcelId) || parcelId < 1) return NextResponse.json({ error: "Invalid parcel" }, { status: 400 });

    const c = oracle();
    const p = await c.getParcel(parcelId);
    const meta = decodeMetadata(p.metadataURI);
    if (!meta) return NextResponse.json({ error: "Parcel metadata unreadable" }, { status: 422 });
    const polygon = meta.polygon as LatLng[];
    const areaHa = cellsAreaHa(polygonToCells(polygon));
    const status = Number(p.status); // 1 active, 2 flagged

    if (action === "verify") {
      if (status !== 1) return NextResponse.json({ error: "Parcel is frozen" }, { status: 409 });
      const report = await runMrv({ polygon, areaHa });
      const outstanding = Number(p.issued) - Number(p.revoked);
      const ceiling = Number(p.cellCount) * MAX_CREDITS_PER_CELL;
      const amount = Math.min(Math.max(0, report.credits - outstanding), ceiling - outstanding);
      let tx: string | undefined;
      if (amount > 0) {
        // The full report travels in the event log so anyone can re-check the evidence from the chain alone.
        const sent = await c.issueCredits(parcelId, amount, report.hash, encodeDataUri(report));
        await sent.wait();
        tx = sent.hash;
      }
      return NextResponse.json({ report, issued: amount, tx });
    }

    if (action === "monitor") {
      if (status !== 1) return NextResponse.json({ error: "Parcel is already flagged" }, { status: 409 });
      const allowSim = process.env.ALLOW_SIMULATED_LOSS !== "false";
      const report = await runMrv({ polygon, areaHa, simulateLoss: !!simulateLoss && allowSim });
      const flagged = report.dropPct >= FLAG_DROP_PCT;
      let tx: string | undefined;
      if (flagged) {
        const reason = `NDVI dropped ${report.dropPct.toFixed(0)}% below the trailing average${report.simulated ? " (simulated event)" : ""}`;
        const sent = await c.flagParcel(parcelId, report.hash, reason);
        await sent.wait();
        tx = sent.hash;
      }
      return NextResponse.json({ report, flagged, tx });
    }

    if (action === "revoke") {
      if (status !== 2) return NextResponse.json({ error: "Parcel is not flagged" }, { status: 409 });
      const amount: bigint = await c.balanceOf(p.owner, parcelId);
      if (amount === 0n) return NextResponse.json({ error: "No credits to revoke" }, { status: 409 });
      const sent = await c.revokeCredits(parcelId, p.owner, amount, p.lastEvidence);
      await sent.wait();
      return NextResponse.json({ revoked: Number(amount), tx: sent.hash });
    }

    if (action === "clear") {
      if (status !== 2) return NextResponse.json({ error: "Parcel is not flagged" }, { status: 409 });
      const sent = await c.clearFlag(parcelId, p.lastEvidence);
      await sent.wait();
      return NextResponse.json({ tx: sent.hash });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
