import { NextResponse } from "next/server";
import { decodeMetadata } from "@/lib/registry/abi";
import { cellsAreaHa, polygonToCells, type LatLng } from "@/lib/geo";
import { runMrv } from "@/lib/mrv";
import { getOracle } from "@/lib/oracle";

/**
 * Weekly monitoring job (see vercel.json). Walks the active on-chain parcels, re-runs the satellite
 * analysis and freezes the ones whose vegetation collapsed. It never revokes anything on its own:
 * revoking burns credits and needs a human decision plus the verifier quorum.
 *
 * Vercel calls this with `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET the route is disabled.
 */

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BATCH = 6; // parcels per run, to stay inside the function time limit

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const o = await getOracle();
    const count = Number(await o.read.parcelCount());
    const url = new URL(req.url);
    // Round-robin through the registry: ?from=<n> resumes where the previous run stopped.
    const from = Math.max(1, Number(url.searchParams.get("from") ?? 1));
    const results: { parcelId: number; checked: boolean; flagged?: boolean; dropPct?: number; tx?: string; note?: string }[] = [];
    let next = from;
    for (let id = from; id <= count && results.length < BATCH; id++) {
      next = id + 1;
      const p = await o.read.getParcel(id);
      if (Number(p.status) !== 1) {
        results.push({ parcelId: id, checked: false, note: "already flagged" });
        continue;
      }
      const meta = decodeMetadata(p.metadataURI);
      if (!meta) {
        results.push({ parcelId: id, checked: false, note: "metadata unreadable" });
        continue;
      }
      const polygon = meta.polygon as LatLng[];
      const report = await runMrv({ polygon, areaHa: cellsAreaHa(polygonToCells(polygon)) });
      if (report.flag) {
        const sent = await o.contracts[0].flagParcel(id, report.hash, `Weekly monitoring: NDVI dropped ${report.dropPct.toFixed(0)}% (${report.method}), NDMI corroborates`);
        await sent.wait();
        results.push({ parcelId: id, checked: true, flagged: true, dropPct: report.dropPct, tx: sent.hash });
      } else {
        results.push({ parcelId: id, checked: true, flagged: false, dropPct: report.dropPct });
      }
    }
    return NextResponse.json({ parcels: count, from, next: next > count ? 1 : next, results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
