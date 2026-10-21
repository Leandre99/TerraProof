import { createHash } from "crypto";
import type { LatLng } from "./geo";
import type { MrvReport } from "./registry/types";

/**
 * Measurement / Reporting / Verification (MRV) oracle.
 *
 * 1. Searches Sentinel-2 L2A scenes over the parcel (Microsoft Planetary Computer, free STAC API).
 * 2. Computes the median NDVI inside the polygon for up to 6 scenes across the last 13 months.
 * 3. Proposes credits from a vegetation-vigour proxy and detects sudden vegetation loss.
 * 4. Hashes the report so it can be anchored on-chain as evidence.
 *
 * METHODOLOGY v0 IS A PROOF OF CONCEPT. NDVI is a proxy for vegetation vigour, not a measured
 * carbon stock. A production registry needs a validated methodology (allometry, ground truth,
 * permanence buffers) reviewed by an accredited standard body.
 */

const STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
const STATS = "https://planetarycomputer.microsoft.com/api/data/v1/item/statistics";
const NDVI_EXPR = "(B08-B04)/(B08+B04)";

export const NDVI_BARE_SOIL = 0.15;
export const TCO2E_PER_HA_PER_NDVI = 60;
export const FLAG_DROP_PCT = 30;
export const METHODOLOGY =
  "v0 proof-of-concept: credits = area_ha × max(0, median NDVI − 0.15) × 60 tCO2e. NDVI is a vegetation-vigour proxy, not a carbon stock.";

interface Observation {
  date: string;
  ndvi: number;
}

function withTimeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

function toGeoJson(polygon: LatLng[]) {
  const ring = polygon.map(([lat, lng]) => [lng, lat]);
  ring.push(ring[0]);
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

function bbox(polygon: LatLng[]): [number, number, number, number] {
  const lats = polygon.map((p) => p[0]);
  const lngs = polygon.map((p) => p[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

async function liveObservations(polygon: LatLng[]): Promise<Observation[]> {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - 13);

  const search = await fetch(STAC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      collections: ["sentinel-2-l2a"],
      bbox: bbox(polygon),
      datetime: `${start.toISOString()}/${end.toISOString()}`,
      query: { "eo:cloud_cover": { lt: 30 } },
      limit: 100,
      sortby: [{ field: "datetime", direction: "desc" }],
    }),
    signal: withTimeout(15_000),
    cache: "no-store",
  });
  if (!search.ok) throw new Error(`STAC ${search.status}`);
  const { features } = (await search.json()) as {
    features: { id: string; properties: { datetime: string; "eo:cloud_cover": number } }[];
  };

  // One scene per calendar month (least cloudy), keep the 6 most recent months.
  const byMonth = new Map<string, (typeof features)[number]>();
  for (const f of features) {
    const key = f.properties.datetime.slice(0, 7);
    const cur = byMonth.get(key);
    if (!cur || f.properties["eo:cloud_cover"] < cur.properties["eo:cloud_cover"]) byMonth.set(key, f);
  }
  const picked = [...byMonth.values()]
    .sort((a, b) => b.properties.datetime.localeCompare(a.properties.datetime))
    .slice(0, 6);

  const geojson = toGeoJson(polygon);
  const results = await Promise.all(
    picked.map(async (f): Promise<Observation | null> => {
      try {
        const url = `${STATS}?collection=sentinel-2-l2a&item=${encodeURIComponent(f.id)}&expression=${encodeURIComponent(
          NDVI_EXPR
        )}&asset_as_band=true`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geojson),
          signal: withTimeout(20_000),
          cache: "no-store",
        });
        if (!res.ok) return null;
        const json = (await res.json()) as {
          properties: { statistics: Record<string, { median: number; valid_percent: number }> };
        };
        const s = Object.values(json.properties.statistics)[0];
        if (!s || s.valid_percent < 50 || !Number.isFinite(s.median)) return null;
        return { date: f.properties.datetime.slice(0, 10), ndvi: round(s.median) };
      } catch {
        return null;
      }
    })
  );
  return results.filter((r): r is Observation => r !== null).sort((a, b) => a.date.localeCompare(b.date));
}

/** Deterministic, clearly-labelled fallback used only if the satellite API is unreachable. */
function cachedSample(polygon: LatLng[]): Observation[] {
  const seed = Math.abs(Math.sin(polygon[0][0] * 12.9898 + polygon[0][1] * 78.233) * 43758.5453) % 1;
  const base = 0.38 + seed * 0.2;
  const out: Observation[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i * 2, 15);
    const season = Math.sin(((d.getMonth() + 1) / 12) * Math.PI * 2 - 1.2) * 0.07;
    out.push({ date: d.toISOString().slice(0, 10), ndvi: round(base + season) });
  }
  return out;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export interface MrvInput {
  polygon: LatLng[];
  areaHa: number;
  simulateLoss?: boolean;
}

export async function runMrv({ polygon, areaHa, simulateLoss }: MrvInput): Promise<MrvReport> {
  let source: MrvReport["source"] = "sentinel-2";
  let series: Observation[] = [];
  try {
    series = await liveObservations(polygon);
  } catch {
    series = [];
  }
  if (series.length < 2) {
    source = "cached-sample";
    series = cachedSample(polygon);
  }

  let simulated = false;
  if (simulateLoss) {
    // DEMO ONLY: inject a synthetic clearing event as the newest observation.
    simulated = true;
    const prior = series.reduce((a, o) => a + o.ndvi, 0) / series.length;
    series = [...series, { date: new Date().toISOString().slice(0, 10), ndvi: round(prior * 0.52) }];
  }

  const latest = series[series.length - 1];
  const prior = series.slice(0, -1);
  const priorMean = prior.reduce((a, o) => a + o.ndvi, 0) / prior.length;
  const dropPct = Math.max(0, ((priorMean - latest.ndvi) / priorMean) * 100);
  const ndviMean = series.reduce((a, o) => a + o.ndvi, 0) / series.length;
  const credits = Math.floor(areaHa * Math.max(0, ndviMean - NDVI_BARE_SOIL) * TCO2E_PER_HA_PER_NDVI);

  const body = {
    source,
    simulated,
    generatedAt: new Date().toISOString(),
    series,
    ndviMean: round(ndviMean),
    ndviLatest: latest.ndvi,
    dropPct: round(dropPct),
    credits,
    methodology: METHODOLOGY,
  };
  const hash = "0x" + createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return { ...body, hash };
}
