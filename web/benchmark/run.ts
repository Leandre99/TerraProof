/**
 * Step 2 of the benchmark: run the MRV engine on the ground-truth sites and measure its errors.
 *
 *   npx tsx benchmark/run.ts            fetch Sentinel-2 observations (cached in observations.json), then evaluate
 *   npx tsx benchmark/run.ts --offline  evaluate from the cache only (instant, no network)
 *
 * Protocol (fixed before looking at results):
 *  - Every site is evaluated "as of" 31 December of its loss year (cleared sites) or of 2022/2023 (intact
 *    sites, alternating). For a cleared site the reference scenes one year earlier are therefore BEFORE the
 *    clearing and the latest scenes are AFTER it, so the label has no timing ambiguity.
 *  - Sites of each class are split by index parity: even = calibration half, odd = held-out test half.
 *    Thresholds are chosen on the calibration half only. All headline numbers are on the test half.
 *  - A decision of "uncertain" (no clear recent scene) is counted as an abstention, never as a success.
 *  - Baseline v0 is the previous engine rule re-implemented on the same observations: credits are issued when
 *    the mean NDVI of the 6 most recent observations is above 0.15; freeze when the latest NDVI is 30 % below
 *    the mean of the earlier ones.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { THRESHOLDS, analyse, fetchObservations, type Observation } from "../src/lib/mrv";
import type { Site } from "./scan";

const DIR = __dirname;
const OFFLINE = process.argv.includes("--offline");

interface SiteObs {
  asOf: string;
  series: Observation[];
}

const asOfFor = (s: Site, index: number) => `${s.lossYear ?? (index % 2 === 0 ? 2022 : 2023)}-12-31`;

async function collect(sites: Site[]): Promise<Record<string, SiteObs>> {
  const cachePath = join(DIR, "observations.json");
  const cache: Record<string, SiteObs> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
  if (OFFLINE) return cache;
  let i = 0;
  for (const [idx, s] of sites.entries()) {
    i++;
    if (cache[s.id]) continue;
    const asOf = asOfFor(s, idx);
    try {
      const series = await fetchObservations(s.polygon, new Date(`${asOf}T23:59:59Z`));
      cache[s.id] = { asOf, series };
      console.log(`[${i}/${sites.length}] ${s.id} ${s.label} asOf ${asOf}: ${series.length} clear observations`);
    } catch (e) {
      console.log(`[${i}/${sites.length}] ${s.id} failed: ${(e as Error).message}`);
    }
    writeFileSync(cachePath, JSON.stringify(cache));
  }
  return cache;
}

type Gate = "eligible" | "not-eligible" | "uncertain";
const wilson = (k: number, n: number) => {
  if (n === 0) return "n/a";
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return `${(100 * p).toFixed(0)}% [${(100 * Math.max(0, c - h)).toFixed(0)}–${(100 * Math.min(1, c + h)).toFixed(0)}]`;
};

function v0Gate(series: Observation[]): Gate {
  const last6 = series.slice(-6);
  if (!last6.length) return "uncertain";
  return last6.reduce((a, o) => a + o.ndvi, 0) / last6.length > 0.15 ? "eligible" : "not-eligible";
}

function v0Flag(series: Observation[]): boolean | null {
  const last6 = series.slice(-6);
  if (last6.length < 2) return null;
  const latest = last6[last6.length - 1];
  const prior = last6.slice(0, -1).reduce((a, o) => a + o.ndvi, 0) / (last6.length - 1);
  return prior > 0.02 && ((prior - latest.ndvi) / prior) * 100 >= 30;
}

interface Row {
  site: Site;
  split: "calibration" | "test";
  asOf: string;
  n: number;
  v1Gate: Gate;
  v1Flag: boolean;
  v0Gate: Gate;
  v0Flag: boolean | null;
  latestNdvi: number;
  latestNdmi: number;
  drop: number;
}

function evaluate(sites: Site[], obs: Record<string, SiteObs>, t: typeof THRESHOLDS): Row[] {
  const byClass: Record<string, number> = { cleared: 0, intact: 0 };
  const rows: Row[] = [];
  for (const s of sites) {
    const o = obs[s.id];
    const k = byClass[s.label]++;
    if (!o) continue;
    const a = analyse(o.series, new Date(`${o.asOf}T23:59:59Z`), t);
    rows.push({
      site: s,
      split: k % 2 === 0 ? "calibration" : "test",
      asOf: o.asOf,
      n: o.series.length,
      v1Gate: a.verdict,
      v1Flag: a.flag,
      v0Gate: v0Gate(o.series),
      v0Flag: v0Flag(o.series),
      latestNdvi: a.ndviLatest,
      latestNdmi: a.ndmiLatest,
      drop: a.dropPct,
    });
  }
  return rows;
}

/** Balanced accuracy of the freeze decision. */
function flagScore(rows: Row[]): number {
  const cl = rows.filter((r) => r.site.label === "cleared");
  const it = rows.filter((r) => r.site.label === "intact");
  if (!cl.length || !it.length) return 0;
  return (cl.filter((r) => r.v1Flag).length / cl.length + it.filter((r) => !r.v1Flag).length / it.length) / 2;
}

/** Balanced accuracy of the eligibility gate; an abstention counts as a miss. */
function gateScore(rows: Row[]): number {
  const cl = rows.filter((r) => r.site.label === "cleared");
  const it = rows.filter((r) => r.site.label === "intact");
  if (!cl.length || !it.length) return 0;
  const tnr = cl.filter((r) => r.v1Gate === "not-eligible").length / cl.length;
  const tpr = it.filter((r) => r.v1Gate === "eligible").length / it.length;
  return (tnr + tpr) / 2;
}

async function main() {
  // sites-<tile>.json files come from running scan.ts once per tile (in parallel); sites.json is the merged list.
  const files = readdirSync(DIR).filter((f) => /^sites(-.+)?\.json$/.test(f)).sort();
  const sites: Site[] = files.flatMap((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as Site[]);
  // Neighbouring windows are not independent samples: keep sites at least 40 pixels (~1.1 km) apart within a tile.
  const kept: Site[] = [];
  for (const s of sites) {
    const [x, y] = s.id.split("-").slice(-2).map(Number);
    const near = kept.some((k) => {
      if (k.tile !== s.tile) return false;
      const [kx, ky] = k.id.split("-").slice(-2).map(Number);
      return Math.abs(kx - x) < 40 && Math.abs(ky - y) < 40;
    });
    if (!near && !kept.some((k) => k.id === s.id)) kept.push(s);
  }
  sites.length = 0;
  sites.push(...kept);
  const obs = await collect(sites);

  // 1. Calibrate on the calibration half only.
  const ndviGrid = [0.25, 0.3, 0.35, 0.4, 0.45, 0.5];
  const ndmiGrid = [0, 0.04, 0.08, 0.12, 0.16, 0.2];
  let best = { score: -1, t: THRESHOLDS };
  for (const ndviMin of ndviGrid)
    for (const ndmiMin of ndmiGrid) {
      const t = { ...THRESHOLDS, ndviMin, ndmiMin };
      const score = gateScore(evaluate(sites, obs, t).filter((r) => r.split === "calibration"));
      if (score > best.score + 1e-9) best = { score, t };
    }
  // Freeze rule: pick the moisture-only trigger on the calibration half, with the gate thresholds already fixed.
  let bestFlag = { score: -1, t: best.t };
  for (const ndmiDropAlone of [101, 30, 40, 50, 60]) {
    const t = { ...best.t, ndmiDropAlone };
    const score = flagScore(evaluate(sites, obs, t).filter((r) => r.split === "calibration"));
    if (score > bestFlag.score + 1e-9) bestFlag = { score, t };
  }
  const calibrated = bestFlag.t;
  console.log(
    `Calibrated on the calibration half: ndviMin=${calibrated.ndviMin} ndmiMin=${calibrated.ndmiMin} (gate balanced accuracy ${(best.score * 100).toFixed(0)}%), ndmiDropAlone=${calibrated.ndmiDropAlone} (freeze balanced accuracy ${(bestFlag.score * 100).toFixed(0)}%)`
  );

  // 2. Report on the held-out half with the calibrated thresholds, and with the shipped defaults for transparency.
  const rows = evaluate(sites, obs, calibrated);
  const shipped = evaluate(sites, obs, THRESHOLDS);
  const test = rows.filter((r) => r.split === "test");
  const testShipped = shipped.filter((r) => r.split === "test");

  const cleared = test.filter((r) => r.site.label === "cleared");
  const intact = test.filter((r) => r.site.label === "intact");
  const count = (rs: Row[], f: (r: Row) => boolean) => rs.filter(f).length;

  const lines: string[] = [];
  const L = (s = "") => lines.push(s);
  L("# TerraProof MRV benchmark");
  L();
  L(`Generated by \`npx tsx benchmark/run.ts\` on ${new Date().toISOString().slice(0, 10)}. Methodology ${THRESHOLDS ? "v1" : ""}.`);
  L();
  L("**Ground truth:** Hansen Global Forest Change v1.11 (UMD / Google, 30 m): a site is *cleared* if ≥ 50 % of a ~390 m window (≈ 15 ha) lost its trees in one year (2022 or 2023) after being ≥ 50 % tree-covered; it is *intact* if tree cover was ≥ 70 % in 2000 and no pixel was lost through 2023. Sites are sampled at random (seeded) in the southern Amazon tile (Mato Grosso). Two West-African tiles (Benin / Togo / Nigeria and Côte d'Ivoire / Liberia / Ghana) were also scanned, but 600+ random forest-belt rows yielded no window meeting the strict criteria (the forest there is too fragmented at the scale of ~15 ha), so **this benchmark does not validate TerraProof in Benin or West Africa**.");
  L();
  L(`**Protocol:** each site is evaluated as of 31 December of its loss year (so the reference scenes one year earlier are before the clearing and the latest scenes after). Half of the sites of each class calibrate the two thresholds (NDVI floor ${calibrated.ndviMin}, NDMI floor ${calibrated.ndmiMin}, moisture-only freeze at ${calibrated.ndmiDropAlone > 100 ? "never" : "−" + calibrated.ndmiDropAlone + "%"}); **all numbers below are on the held-out half**. An "uncertain" decision (no clear recent scene) is counted as an abstention, not as a success.`);
  L();
  L(`Sites: ${sites.length} total, ${rows.length} with usable Sentinel-2 data; held-out test half: ${cleared.length} cleared + ${intact.length} intact.`);
  L();
  const pct = (k: number, n: number) => wilson(k, n);
  L("## 1. Eligibility gate: would the registry issue credits?");
  L();
  L("| | cleared sites (should be refused) | intact sites (should be accepted) |");
  L("|---|---|---|");
  L(`| **v0** (previous engine: mean NDVI of last 6 scenes > 0.15) | wrongly accepted: ${pct(count(cleared, (r) => r.v0Gate === "eligible"), cleared.length)} | accepted: ${pct(count(intact, (r) => r.v0Gate === "eligible"), intact.length)} |`);
  L(`| **v1** (NDVI + independent NDMI, cloud-masked) | wrongly accepted: ${pct(count(cleared, (r) => r.v1Gate === "eligible"), cleared.length)} · refused: ${pct(count(cleared, (r) => r.v1Gate === "not-eligible"), cleared.length)} · abstained: ${count(cleared, (r) => r.v1Gate === "uncertain")} | accepted: ${pct(count(intact, (r) => r.v1Gate === "eligible"), intact.length)} · wrongly refused: ${count(intact, (r) => r.v1Gate === "not-eligible")} · abstained: ${count(intact, (r) => r.v1Gate === "uncertain")} |`);
  L(`| v1 with the shipped defaults (${THRESHOLDS.ndviMin} / ${THRESHOLDS.ndmiMin}) | wrongly accepted: ${pct(count(testShipped.filter((r) => r.site.label === "cleared"), (r) => r.v1Gate === "eligible"), cleared.length)} | accepted: ${pct(count(testShipped.filter((r) => r.site.label === "intact"), (r) => r.v1Gate === "eligible"), intact.length)} |`);
  L();
  L("Values are rate [95 % Wilson interval]. With this few sites the intervals are wide: read them as an order of magnitude, not as a precise accuracy.");
  L();
  L("## 2. Monitoring: would the registry freeze the parcel?");
  L();
  const decidedV0 = (rs: Row[]) => rs.filter((r) => r.v0Flag !== null);
  L("| | cleared sites (should freeze) | intact sites (should NOT freeze) |");
  L("|---|---|---|");
  L(`| **v0** (latest vs trailing mean, NDVI only) | frozen: ${pct(count(decidedV0(cleared), (r) => r.v0Flag === true), decidedV0(cleared).length)} | false alarms: ${pct(count(decidedV0(intact), (r) => r.v0Flag === true), decidedV0(intact).length)} |`);
  L(`| **v1** (same season last year, NDMI-corroborated) | frozen: ${pct(count(cleared, (r) => r.v1Flag), cleared.length)} | false alarms: ${pct(count(intact, (r) => r.v1Flag), intact.length)} |`);
  L();
  L("## 3. Per-region breakdown (test half, v1)");
  L();
  L("| region | cleared refused / frozen | intact accepted / not frozen |");
  L("|---|---|---|");
  for (const region of [...new Set(test.map((r) => r.site.region))]) {
    const c = cleared.filter((r) => r.site.region === region);
    const i = intact.filter((r) => r.site.region === region);
    L(`| ${region} | ${count(c, (r) => r.v1Gate === "not-eligible")}/${c.length} refused · ${count(c, (r) => r.v1Flag)}/${c.length} frozen | ${count(i, (r) => r.v1Gate === "eligible")}/${i.length} accepted · ${count(i, (r) => !r.v1Flag)}/${i.length} not frozen |`);
  }
  L();
  L("## Honest limits");
  L("- Hansen labels are 30 m and annual; a few \"cleared\" windows may be partly regrowth, logging or a fire scar rather than conversion to cropland.");
  L("- Sentinel-2 cannot see through persistent cloud: in the rainy tropics many sites abstain (\"uncertain\"). Abstaining is the right behaviour, but it lowers coverage.");
  L("- This tests *presence of standing vegetation and its loss*. It does **not** validate the carbon quantity: the credit formula remains a proxy (area × (NDVI − 0.15) × 60 tCO2e).");
  L("- Calibration and test halves come from the same sampling frame; a different biome (dry savanna, mangrove) may need its own thresholds.");
  L("- Few sites per class: see the intervals.");
  L();
  L("## All sites (test half marked)");
  L();
  L("| site | class | split | as of | clear scenes | latest NDVI | latest NDMI | drop % | v0 gate | v1 gate | v1 freeze |");
  L("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    L(`| ${r.site.id} | ${r.site.label}${r.site.lossYear ? " " + r.site.lossYear : ""} | ${r.split} | ${r.asOf} | ${r.n} | ${r.latestNdvi} | ${r.latestNdmi} | ${r.drop} | ${r.v0Gate} | ${r.v1Gate} | ${r.v1Flag ? "yes" : "no"} |`);
  }
  writeFileSync(join(DIR, "RESULTS.md"), lines.join("\n") + "\n");
  writeFileSync(join(DIR, "results.json"), JSON.stringify({ calibrated, rows }, null, 2) + "\n");
  console.log(lines.slice(0, 40).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
