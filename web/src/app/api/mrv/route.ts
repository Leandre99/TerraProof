import { NextResponse } from "next/server";
import { runMrv } from "@/lib/mrv";
import type { LatLng } from "@/lib/geo";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  let body: { polygon?: LatLng[]; areaHa?: number; simulateLoss?: boolean; asOf?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { polygon, areaHa, simulateLoss, asOf } = body;
  const valid =
    Array.isArray(polygon) &&
    polygon.length >= 3 &&
    polygon.length <= 200 &&
    polygon.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) &&
    typeof areaHa === "number" &&
    areaHa > 0 &&
    areaHa < 50;
  if (!valid) return NextResponse.json({ error: "Invalid polygon or area" }, { status: 400 });
  if (asOf !== undefined && (!ISO_DATE.test(asOf) || Number.isNaN(Date.parse(asOf)) || Date.parse(asOf) > Date.now())) {
    return NextResponse.json({ error: "asOf must be a past date (YYYY-MM-DD)" }, { status: 400 });
  }

  const report = await runMrv({ polygon: polygon!, areaHa: areaHa!, simulateLoss: !!simulateLoss, asOf });
  return NextResponse.json(report);
}
