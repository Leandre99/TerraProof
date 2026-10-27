import { NextResponse } from "next/server";
import { decodeMetadata, encodeDataUri } from "@/lib/registry/abi";
import { cellsAreaHa, polygonToCells, type LatLng } from "@/lib/geo";
import { runMrv } from "@/lib/mrv";
import { castVotes, getOracle } from "@/lib/oracle";

/**
 * On-chain MRV oracle. Holds the VERIFIER keys (server side only), re-runs the satellite
 * analysis itself (it never trusts a report sent by the browser) and submits the
 * transaction(s). Used by the web app in "On-chain" mode.
 */

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_CREDITS_PER_CELL = 50;

export async function POST(req: Request) {
  try {
    const { action, parcelId, simulateLoss } = (await req.json()) as {
      action: "verify" | "monitor" | "revoke" | "clear";
      parcelId: number;
      simulateLoss?: boolean;
    };
    if (!Number.isInteger(parcelId) || parcelId < 1) return NextResponse.json({ error: "Invalid parcel" }, { status: 400 });

    const o = await getOracle();
    const c = o.read;
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
        const uri = encodeDataUri(report);
        tx = await castVotes(o, (v) => v.issueCredits(parcelId, amount, report.hash, uri));
      }
      return NextResponse.json({ report, issued: amount, tx, quorum: o.threshold });
    }

    if (action === "monitor") {
      if (status !== 1) return NextResponse.json({ error: "Parcel is already flagged" }, { status: 409 });
      const allowSim = process.env.ALLOW_SIMULATED_LOSS !== "false";
      const report = await runMrv({ polygon, areaHa, simulateLoss: !!simulateLoss && allowSim });
      const flagged = !!report.flag;
      let tx: string | undefined;
      if (flagged) {
        // ONE verifier is enough to freeze: freezing is reversible and always the safe direction.
        const reason = `NDVI dropped ${report.dropPct.toFixed(0)}% (${report.method}), NDMI corroborates${report.simulated ? " (simulated event)" : ""}`;
        const sent = await o.contracts[0].flagParcel(parcelId, report.hash, reason);
        await sent.wait();
        tx = sent.hash;
      }
      return NextResponse.json({ report, flagged, tx });
    }

    if (action === "revoke") {
      if (status !== 2) return NextResponse.json({ error: "Parcel is not flagged" }, { status: 409 });
      // Credits can sit with the owner and, when the parcel has one, with its community wallet.
      const holders: string[] = [p.owner];
      try {
        const community: string = await c.communityOf(parcelId);
        if (community && community !== "0x0000000000000000000000000000000000000000") holders.push(community);
      } catch {
        /* contract deployed before the community share existed */
      }
      let total = 0;
      let tx = "";
      for (const holder of holders) {
        const amount: bigint = await c.balanceOf(holder, parcelId);
        if (amount === 0n) continue;
        tx = await castVotes(o, (v) => v.revokeCredits(parcelId, holder, amount, p.lastEvidence));
        total += Number(amount);
      }
      if (total === 0) return NextResponse.json({ error: "No credits to revoke" }, { status: 409 });
      return NextResponse.json({ revoked: total, tx, quorum: o.threshold });
    }

    if (action === "clear") {
      if (status !== 2) return NextResponse.json({ error: "Parcel is not flagged" }, { status: 409 });
      const tx = await castVotes(o, (v) => v.clearFlag(parcelId, p.lastEvidence));
      return NextResponse.json({ tx, quorum: o.threshold });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
