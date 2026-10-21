import { NextResponse } from "next/server";
import { runMrv } from "@/lib/mrv";
import type { LatLng } from "@/lib/geo";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { polygon?: LatLng[]; areaHa?: number; simulateLoss?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { polygon, areaHa, simulateLoss } = body;
  const valid =
    Array.isArray(polygon) &&
    polygon.length >= 3 &&
    polygon.length <= 200 &&
    polygon.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) &&
    typeof areaHa === "number" &&
    areaHa > 0 &&
    areaHa < 50;
  if (!valid) return NextResponse.json({ error: "Invalid polygon or area" }, { status: 400 });

  const report = await runMrv({ polygon: polygon!, areaHa: areaHa!, simulateLoss: !!simulateLoss });
  return NextResponse.json(report);
}
