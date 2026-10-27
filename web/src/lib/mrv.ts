import { createHash } from "crypto";
import type { LatLng } from "./geo";
import type { MrvReport } from "./registry/types";

/**
 * Measurement / Reporting / Verification (MRV) oracle, methodology v1.
 *
 * 1. Searches Sentinel-2 L2A scenes over the parcel (Microsoft Planetary Computer, free STAC API).
 * 2. For each scene computes, INSIDE the polygon: median NDVI, median NDMI (canopy moisture, an
 *    independent signal), and the share of cloud / vegetation pixels from the scene classification.
 *    Scenes that are too cloudy over the parcel itself are discarded.
 * 3. Decides eligibility with two independent signals that must agree (NDVI AND NDMI).
 * 4. Detects loss by comparing the latest observation with the SAME SEASON one year earlier,
 *    which removes the savanna / dry-season false alarms of a plain trailing average.
 * 5. Hashes the report. The hash of the raw evidence (`evidenceHash`) excludes the clock, so anyone
 *    can re-run the analysis on the same scenes and obtain the same value (see /api/recompute).
 *
 * METHODOLOGY v1 IS STILL A PROOF OF CONCEPT. NDVI is a proxy for vegetation vigour, not a
 * measured carbon stock. Accuracy numbers are in benchmark/RESULTS.md. A production registry needs
 * a validated methodology (allometry, ground truth, permanence buffers) reviewed by a standard body.
 */

const STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
const STATS = "https://planetarycomputer.microsoft.com/api/data/v1/item/statistics";
/**
 * Sentinel-2 L2A scenes processed with baseline >= 04.00 (acquired since 25 January 2022) store reflectance
 * with a +1000 offset: reflectance = (DN - 1000) / 10000. The statistics API works on raw DN, so without
 * removing the offset NDVI is biased low (a dense forest reads ~0.5 instead of ~0.85). The offset cancels
 * in the numerators and doubles in the denominators.
 */
const BASELINE_OFFSET_FROM = 4;
const expression = (offset: boolean) =>
  [
    offset ? "(B08-B04)/(B08+B04-2000)" : "(B08-B04)/(B08+B04)", // NDVI
    offset ? "(B08-B11)/(B08+B11-2000)" : "(B08-B11)/(B08+B11)", // NDMI, canopy moisture
    "(SCL==4)", // share of pixels classified as vegetation
    "(SCL==3)|(SCL==8)|(SCL==9)|(SCL==10)", // share of cloud shadow / cloud pixels
  ].join(";");
const needsOffset = (baseline: unknown) => Number.parseFloat(String(baseline ?? "")) >= BASELINE_OFFSET_FROM;

export const METHODOLOGY_VERSION = "v1";
export const NDVI_BARE_SOIL = 0.15;
export const TCO2E_PER_HA_PER_NDVI = 60;
export const FLAG_DROP_PCT = 30;

/**
 * Decision thresholds. Calibrated on the calibration half of the benchmark sites and reported on the
 * held-out half (see benchmark/RESULTS.md). Exported so the benchmark can sweep them.
 */
export const THRESHOLDS = {
  ndviMin: 0.35, // below this the parcel is not eligible
  ndmiMin: 0.08, // independent canopy-moisture check, must also pass
  maxCloudPct: 25, // discard a scene when more than this share of the PARCEL is cloud / shadow
  minObservations: 2,
  ndmiDropCorroboration: 20, // % NDMI drop that must accompany an NDVI drop to freeze
  // A drop of canopy moisture alone also freezes (101 = disabled). Cleared forest turning into green pasture keeps
  // a high NDVI but loses its moisture signal, so NDVI alone misses it. Calibrated on the benchmark calibration half.
  ndmiDropAlone: 30,
};

export const METHODOLOGY =
  "v1 proof-of-concept: credits = area_ha × max(0, mean NDVI − 0.15) × 60 tCO2e, only if NDVI and NDMI both pass. NDVI is a vegetation-vigour proxy, not a carbon stock.";

export interface Observation {
  date: string;
  ndvi: number;
  ndmi: number;
  cloudPct: number;
  vegPct: number;
  scene: string;
}

export type Verdict = "eligible" | "not-eligible" | "uncertain";

export interface Analysis {
  ndviMean: number;
  ndmiMean: number;
  ndviLatest: number;
  ndmiLatest: number;
  dropPct: number;
  ndmiDropPct: number;
  method: "same-season" | "trailing" | "none";
  verdict: Verdict;
  reasons: string[];
  flag: boolean;
}

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const DAY = 86_400_000;

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

/** Sentinel-2 item ids embed the acquisition date: S2B_MSIL2A_20261019T101029_… */
export function sceneDate(id: string): string {
  const m = id.split("_")[2] ?? "";
  return `${m.slice(0, 4)}-${m.slice(4, 6)}-${m.slice(6, 8)}`;
}

async function sceneStats(id: string, geojson: object, offset: boolean): Promise<Observation | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const url = `${STATS}?collection=sentinel-2-l2a&item=${encodeURIComponent(id)}&expression=${encodeURIComponent(
        expression(offset)
      )}&asset_as_band=true`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geojson),
        signal: AbortSignal.timeout(25_000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        properties: { statistics: Record<string, { median: number; mean: number; valid_percent: number }> };
      };
      const [ndvi, ndmi, veg, cloud] = Object.values(json.properties.statistics);
      if (!ndvi || !ndmi || ndvi.valid_percent < 50 || !Number.isFinite(ndvi.median) || !Number.isFinite(ndmi.median)) return null;
      return {
        date: sceneDate(id),
        ndvi: round(ndvi.median),
        ndmi: round(ndmi.median),
        vegPct: round((veg?.mean ?? 0) * 100, 1),
        cloudPct: round((cloud?.mean ?? 0) * 100, 1),
        scene: id,
      };
    } catch {
      /* retry once */
    }
  }
  return null;
}

interface SceneRef {
  id: string;
  offset: boolean;
}

/** Processing baseline of known scene ids (needed to recompute a published report exactly). */
async function sceneRefs(ids: string[]): Promise<SceneRef[]> {
  const res = await fetch(STAC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ collections: ["sentinel-2-l2a"], ids, limit: ids.length }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`STAC ${res.status}`);
  const { features } = (await res.json()) as { features: { id: string; properties: Record<string, unknown> }[] };
  const byId = new Map(features.map((f) => [f.id, needsOffset(f.properties["s2:processing_baseline"])]));
  return ids.map((id) => ({ id, offset: byId.get(id) ?? false }));
}

/** One scene per calendar month (the least cloudy), over the 14 months before `asOf`. */
async function searchScenes(polygon: LatLng[], asOf: Date): Promise<SceneRef[]> {
  const start = new Date(asOf);
  start.setMonth(start.getMonth() - 14);
  const search = await fetch(STAC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      collections: ["sentinel-2-l2a"],
      bbox: bbox(polygon),
      datetime: `${start.toISOString()}/${asOf.toISOString()}`,
      query: { "eo:cloud_cover": { lt: 50 } },
      limit: 200,
      sortby: [{ field: "datetime", direction: "desc" }],
    }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!search.ok) throw new Error(`STAC ${search.status}`);
  const { features } = (await search.json()) as {
    features: { id: string; properties: { datetime: string; "eo:cloud_cover": number; "s2:processing_baseline"?: string } }[];
  };
  // Two candidates per month: if the first is cloudy over the parcel, the second one can save the month.
  const byMonth = new Map<string, typeof features>();
  for (const f of features) {
    const key = f.properties.datetime.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), f].sort((a, b) => a.properties["eo:cloud_cover"] - b.properties["eo:cloud_cover"]).slice(0, 2));
  }
  return [...byMonth.values()].flat().map((f) => ({ id: f.id, offset: needsOffset(f.properties["s2:processing_baseline"]) }));
}

/** Observations usable for the analysis: clear enough over the parcel, one best scene per month. */
export async function fetchObservations(polygon: LatLng[], asOf: Date, sceneIds?: string[]): Promise<Observation[]> {
  const refs = sceneIds ? await sceneRefs(sceneIds) : await searchScenes(polygon, asOf);
  const geojson = toGeoJson(polygon);
  const all: Observation[] = [];
  // Small batches keep the public API happy.
  for (let i = 0; i < refs.length; i += 6) {
    const batch = await Promise.all(refs.slice(i, i + 6).map((r) => sceneStats(r.id, geojson, r.offset)));
    for (const o of batch) if (o) all.push(o);
  }
  const clear = sceneIds ? all : all.filter((o) => o.cloudPct <= THRESHOLDS.maxCloudPct);
  const best = new Map<string, Observation>();
  for (const o of clear) {
    const key = o.date.slice(0, 7);
    const cur = best.get(key);
    if (!cur || o.cloudPct < cur.cloudPct) best.set(key, o);
  }
  return [...(sceneIds ? clear : best.values())].sort((a, b) => a.date.localeCompare(b.date));
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Pure decision logic: same input, same output. Used by the API and by the benchmark. */
export function analyse(series: Observation[], asOf: Date, t = THRESHOLDS): Analysis {
  if (series.length < t.minObservations) {
    return {
      ndviMean: 0,
      ndmiMean: 0,
      ndviLatest: 0,
      ndmiLatest: 0,
      dropPct: 0,
      ndmiDropPct: 0,
      method: "none",
      verdict: "uncertain",
      reasons: [`Only ${series.length} clear observation(s): not enough to decide, no credits are proposed.`],
      flag: false,
    };
  }
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const latestMs = Date.parse(latest.date);
  const ndviMean = mean(sorted.map((o) => o.ndvi));
  const ndmiMean = mean(sorted.map((o) => o.ndmi));

  // Reference = same season one year earlier (300 to 430 days before the latest scene); else trailing mean.
  const sameSeason = sorted.filter((o) => {
    const age = (latestMs - Date.parse(o.date)) / DAY;
    return age >= 300 && age <= 430;
  });
  const trailing = sorted.filter((o) => (latestMs - Date.parse(o.date)) / DAY >= 20 && o !== latest);
  const ref = sameSeason.length ? sameSeason : trailing;
  const method: Analysis["method"] = sameSeason.length ? "same-season" : trailing.length ? "trailing" : "none";
  const refNdvi = ref.length ? mean(ref.map((o) => o.ndvi)) : latest.ndvi;
  const refNdmi = ref.length ? mean(ref.map((o) => o.ndmi)) : latest.ndmi;
  const pct = (a: number, b: number) => (a > 0.02 ? Math.max(0, ((a - b) / a) * 100) : 0);
  const dropPct = pct(refNdvi, latest.ndvi);
  const ndmiDropPct = pct(refNdmi, latest.ndmi);

  // The latest scene must be recent enough to describe the parcel as of now.
  const stale = (asOf.getTime() - latestMs) / DAY > 90;

  const reasons: string[] = [];
  let verdict: Verdict;
  if (stale) {
    verdict = "uncertain";
    reasons.push("The most recent clear scene is older than 90 days.");
  } else if (latest.ndvi < t.ndviMin) {
    verdict = "not-eligible";
    reasons.push(`Latest NDVI ${latest.ndvi.toFixed(2)} is below the vegetation floor ${t.ndviMin}.`);
  } else if (latest.ndmi < t.ndmiMin) {
    verdict = "not-eligible";
    reasons.push(`Canopy-moisture check failed: latest NDMI ${latest.ndmi.toFixed(2)} is below ${t.ndmiMin} although NDVI looks green.`);
  } else {
    verdict = "eligible";
    reasons.push("NDVI and the independent NDMI moisture check both indicate standing vegetation.");
  }

  const byNdvi = dropPct >= FLAG_DROP_PCT && (ndmiDropPct >= t.ndmiDropCorroboration || latest.ndmi < t.ndmiMin);
  const byMoisture = ndmiDropPct >= t.ndmiDropAlone;
  const flag = byNdvi || byMoisture;
  if (byNdvi) reasons.push(`NDVI fell ${dropPct.toFixed(0)}% (${method}) and NDMI corroborates it (−${ndmiDropPct.toFixed(0)}%).`);
  else if (byMoisture) reasons.push(`Canopy moisture (NDMI) fell ${ndmiDropPct.toFixed(0)}% (${method}) while greenness stayed high: typical of forest replaced by pasture or crops.`);
  else if (dropPct >= FLAG_DROP_PCT) reasons.push(`NDVI fell ${dropPct.toFixed(0)}% but NDMI did not corroborate it: treated as seasonal, not frozen.`);

  return {
    ndviMean: round(ndviMean),
    ndmiMean: round(ndmiMean),
    ndviLatest: latest.ndvi,
    ndmiLatest: latest.ndmi,
    dropPct: round(dropPct),
    ndmiDropPct: round(ndmiDropPct),
    method,
    verdict,
    reasons,
    flag,
  };
}

/** Deterministic, clearly-labelled fallback used only if the satellite API is unreachable. */
function cachedSample(polygon: LatLng[], asOf: Date): Observation[] {
  const seed = Math.abs(Math.sin(polygon[0][0] * 12.9898 + polygon[0][1] * 78.233) * 43758.5453) % 1;
  const base = 0.38 + seed * 0.2;
  const out: Observation[] = [];
  for (let i = 13; i >= 0; i -= 2) {
    const d = new Date(asOf.getFullYear(), asOf.getMonth() - i, 15);
    const season = Math.sin(((d.getMonth() + 1) / 12) * Math.PI * 2 - 1.2) * 0.07;
    out.push({
      date: d.toISOString().slice(0, 10),
      ndvi: round(base + season),
      ndmi: round(base * 0.45 + season * 0.6),
      cloudPct: 0,
      vegPct: 60,
      scene: "cached-sample",
    });
  }
  return out;
}

export interface MrvInput {
  polygon: LatLng[];
  areaHa: number;
  /** DEMO ONLY: inject a synthetic clearing event as the newest observation. */
  simulateLoss?: boolean;
  /** Run the analysis as of a past date (historical replay and recomputation). Default: now. */
  asOf?: string;
  /** Use exactly these scenes (recomputation of a published report). */
  sceneIds?: string[];
}

export async function runMrv({ polygon, areaHa, simulateLoss, asOf: asOfIso, sceneIds }: MrvInput): Promise<MrvReport> {
  const asOf = asOfIso ? new Date(`${asOfIso}T23:59:59Z`) : new Date();
  let source: MrvReport["source"] = "sentinel-2";
  let series: Observation[] = [];
  try {
    series = await fetchObservations(polygon, asOf, sceneIds);
  } catch {
    series = [];
  }
  if (series.length < THRESHOLDS.minObservations && !sceneIds && !asOfIso) {
    source = "cached-sample";
    series = cachedSample(polygon, asOf);
  }

  let simulated = false;
  if (simulateLoss && series.length) {
    simulated = true;
    const last = series[series.length - 1];
    series = [
      ...series,
      { date: asOf.toISOString().slice(0, 10), ndvi: round(last.ndvi * 0.52), ndmi: round(last.ndmi * 0.35), cloudPct: 0, vegPct: 20, scene: "simulated" },
    ];
  }

  const a = analyse(series, asOf);
  const credits = a.verdict === "eligible" ? Math.floor(areaHa * Math.max(0, a.ndviMean - NDVI_BARE_SOIL) * TCO2E_PER_HA_PER_NDVI) : 0;

  // Raw evidence: scenes and their statistics. No clock inside, so it can be recomputed bit for bit.
  const evidence = {
    methodology: METHODOLOGY_VERSION,
    asOf: asOf.toISOString().slice(0, 10),
    thresholds: THRESHOLDS,
    scenes: series.map(({ scene, date, ndvi, ndmi, cloudPct, vegPct }) => ({ scene, date, ndvi, ndmi, cloudPct, vegPct })),
  };
  const evidenceHash = "0x" + createHash("sha256").update(JSON.stringify(evidence)).digest("hex");

  const body = {
    version: METHODOLOGY_VERSION,
    source,
    simulated,
    generatedAt: new Date().toISOString(),
    asOf: evidence.asOf,
    series,
    ndviMean: a.ndviMean,
    ndviLatest: a.ndviLatest,
    ndmiMean: a.ndmiMean,
    ndmiLatest: a.ndmiLatest,
    dropPct: a.dropPct,
    ndmiDropPct: a.ndmiDropPct,
    method: a.method,
    verdict: a.verdict,
    reasons: a.reasons,
    flag: a.flag,
    credits,
    areaHa: round(areaHa, 2),
    methodology: METHODOLOGY,
    evidenceHash,
  };
  const hash = "0x" + createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return { ...body, hash };
}
