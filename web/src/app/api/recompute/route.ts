import { NextResponse } from "next/server";
import { runMrv } from "@/lib/mrv";
import type { LatLng } from "@/lib/geo";

/**
 * Independent re-computation of a published MRV report.
 *
 * Takes the parcel polygon plus the exact Sentinel-2 scenes and analysis date written in the report,
 * re-fetches the pixel statistics from the public archive and re-runs the decision logic. The result
 * is compared with the evidence hash that was anchored on-chain: if they match, nothing was altered
 * and the oracle did not invent the numbers. Nothing here is trusted from the caller except the inputs
 * that anyone can read from the chain.
 */

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SCENE_ID = /^S2[AB]_MSIL2A_\d{8}T\d{6}_R\d{3}_T[0-9A-Z]{5}_\d{8}T\d{6}$/;

export async function POST(req: Request) {
  let body: { polygon?: LatLng[]; areaHa?: number; asOf?: string; sceneIds?: string[]; evidenceHash?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { polygon, areaHa, asOf, sceneIds, evidenceHash } = body;
  const valid =
    Array.isArray(polygon) &&
    polygon.length >= 3 &&
    polygon.length <= 200 &&
    polygon.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) &&
    typeof areaHa === "number" &&
    areaHa > 0 &&
    areaHa < 50 &&
    typeof asOf === "string" &&
    ISO_DATE.test(asOf) &&
    Array.isArray(sceneIds) &&
    sceneIds.length > 0 &&
    sceneIds.length <= 40 &&
    sceneIds.every((s) => typeof s === "string" && SCENE_ID.test(s));
  if (!valid) return NextResponse.json({ error: "Invalid recompute request" }, { status: 400 });

  const report = await runMrv({ polygon: polygon!, areaHa: areaHa!, asOf, sceneIds });
  return NextResponse.json({
    recomputed: report.evidenceHash,
    expected: evidenceHash ?? null,
    match: !!evidenceHash && report.evidenceHash?.toLowerCase() === evidenceHash.toLowerCase(),
    report,
  });
}
