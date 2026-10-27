/**
 * Step 1 of the benchmark: find ground-truth sites in the Hansen Global Forest Change dataset
 * (University of Maryland / Google, 30 m, public on Google Cloud Storage; v1.11 covers loss through 2023).
 *
 *   cleared : tree cover in 2000 >= 50 %, and >= 50 % of the window lost in ONE year Y (2022 or 2023),
 *             with no earlier loss (the forest was standing until year Y).
 *   intact  : tree cover in 2000 >= 70 % and NO loss pixel at all through 2023.
 *
 * Each site is a ~390 m square window (~15 ha), about the size of a smallholder parcel.
 * Sampling is random but seeded, so the same sites come back on every run.
 *
 *   npx tsx benchmark/scan.ts [sitesPerClassPerTile=8]
 */
import { fromUrl } from "geotiff";
import { writeFileSync } from "fs";
import { join } from "path";

const BASE = "https://storage.googleapis.com/earthenginepartners-hansen/GFC-2023-v1.11/Hansen_GFC-2023-v1.11_";
const W = 14; // window size in pixels (0.00025 deg each)
const PX = 0.00025;

// Tiles (top-left corner of each 10x10 degree tile). Two West-African tiles around Benin, one Amazon tile for contrast.
const TILES = [
  // `rows` limits the random rows to the forest belt: sampling the whole tile mostly lands on Sahel / savanna with no trees to lose.
  { tile: "10N_000E", name: "West Africa east (Benin, Togo, Ghana, Nigeria)", west: 0, north: 10, rows: [800, 7200] as [number, number] }, // 7.8N to 2.8N
  { tile: "10N_010W", name: "West Africa west (Cote d'Ivoire, Ghana, Guinea)", west: -10, north: 10, rows: [800, 7200] as [number, number] },
  { tile: "10S_060W", name: "Amazon basin (Mato Grosso, Rondonia, Para)", west: -60, north: -10, rows: [0, 39000] as [number, number] },
];

function prng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

/**
 * One remote GeoTIFF layer. geotiff.js occasionally corrupts its internal block cache on a long-running
 * remote file ("ran off the end of the buffer"); re-opening the file clears it, so a failed read re-opens.
 */
class Layer {
  private img: Awaited<ReturnType<Awaited<ReturnType<typeof fromUrl>>["getImage"]>> | null = null;
  failures = 0;
  constructor(private url: string) {}
  private async open() {
    this.img = await (await fromUrl(this.url)).getImage();
  }
  get width() {
    return 40000;
  }
  /** Returns null for a row that cannot be decoded (a few rows of the source file are damaged): the caller skips it. */
  async row(y: number): Promise<Uint8Array | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (!this.img) await this.open();
        const r = (await this.img!.readRasters({ window: [0, y, 40000, y + 1], interleave: false })) as unknown as Uint8Array[];
        return r[0];
      } catch {
        this.img = null;
        await new Promise((res) => setTimeout(res, 300 * (attempt + 1)));
      }
    }
    this.failures++;
    return null;
  }
  /** x, y, w, h window (rows are read whole and sliced). */
  async window(x: number, y: number, w: number, h: number): Promise<Uint8Array | null> {
    const out = new Uint8Array(w * h);
    for (let r = 0; r < h; r++) {
      const row = await this.row(y + r);
      if (!row) return null;
      out.set(row.subarray(x, x + w), r * w);
    }
    return out;
  }
}

export interface Site {
  id: string;
  label: "cleared" | "intact";
  lossYear?: number; // 2022 or 2023 for cleared sites
  tile: string;
  region: string;
  polygon: [number, number][]; // [lat, lng]
  centre: [number, number];
  areaHa: number;
  treeCover2000: number;
}

async function main() {
  const perClass = Number(process.argv[2] ?? 8);
  const only = process.argv[3]; // optional: scan a single tile, so the three tiles can run in parallel
  const sites: Site[] = [];

  for (const t of TILES.filter((x) => !only || x.tile === only)) {
    const rnd = prng(20260527 + t.tile.charCodeAt(1) * 31 + t.tile.charCodeAt(4));
    const loss = new Layer(`${BASE}lossyear_${t.tile}.tif`);
    const cover = new Layer(`${BASE}treecover2000_${t.tile}.tif`);
    const size = loss.width;
    const mk = (label: Site["label"], x: number, y: number, treeCover2000: number, lossYear?: number): Site => {
      const west = t.west + x * PX;
      const north = t.north - y * PX;
      const south = north - W * PX;
      const east = west + W * PX;
      const lat = (north + south) / 2;
      const areaHa = (W * PX * 111_320) * (W * PX * 111_320 * Math.cos((lat * Math.PI) / 180)) / 10_000;
      return {
        id: `${label}-${t.tile}-${x}-${y}`,
        label,
        lossYear,
        tile: t.tile,
        region: t.name,
        polygon: [
          [south, west],
          [north, west],
          [north, east],
          [south, east],
        ],
        centre: [lat, (west + east) / 2],
        areaHa: Math.round(areaHa * 10) / 10,
        treeCover2000: Math.round(treeCover2000),
      };
    };

    const found = { cleared: 0, intact: 0 };
    const seen = new Set<string>();
    let rows = 0;
    while ((found.cleared < perClass || found.intact < perClass) && rows < 700) {
      rows++;
      if (rows % 100 === 0) console.log(`${t.tile}: ${rows} rows, ${found.cleared} cleared, ${found.intact} intact so far, ${loss.failures + cover.failures} failed reads`);
      const y = Math.floor(rnd() * (t.rows[1] - t.rows[0])) + t.rows[0];
      const lossRow = await loss.row(y);
      // The cover row is only needed to pick intact sites; once they are found the loss row alone drives the search.
      const needIntact = found.intact < perClass;
      const coverRow = lossRow && needIntact ? await cover.row(y) : null;
      if (!lossRow || (needIntact && !coverRow)) continue;
      const candidates: { x: number; kind: "cleared" | "intact" }[] = [];
      for (let x = W; x < size - W * 2; x += 7) {
        const l = lossRow[x];
        if ((l === 22 || l === 23) && found.cleared < perClass) candidates.push({ x, kind: "cleared" });
        else if (l === 0 && coverRow && coverRow[x] >= 85 && found.intact < perClass && rnd() < 0.02) candidates.push({ x, kind: "intact" });
      }
      for (const c of candidates.slice(0, 3)) {
        const key = `${c.kind}-${Math.round(c.x / 40)}-${Math.round(y / 40)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const x0 = c.x - Math.floor(W / 2);
        const y0 = y - Math.floor(W / 2);
        const lw = await loss.window(x0, y0, W, W);
        const cw = lw ? await cover.window(x0, y0, W, W) : null;
        if (!lw || !cw) continue;
        const n = lw.length;
        const tc = cw.reduce((a, b) => a + b, 0) / n;
        if (c.kind === "cleared") {
          const Y = lw[Math.floor(n / 2)];
          const sameYear = lw.filter((v) => v === Y).length / n;
          const earlier = lw.filter((v) => v > 0 && v < Y).length / n;
          if (tc >= 50 && sameYear >= 0.5 && earlier <= 0.05 && (Y === 22 || Y === 23) && found.cleared < perClass) {
            sites.push(mk("cleared", x0, y0, tc, 2000 + Y));
            found.cleared++;
          }
        } else {
          const anyLoss = lw.some((v) => v > 0);
          if (tc >= 70 && !anyLoss && found.intact < perClass) {
            sites.push(mk("intact", x0, y0, tc));
            found.intact++;
          }
        }
      }
    }
    console.log(`${t.tile} ${t.name}: ${found.cleared} cleared, ${found.intact} intact (${rows} rows scanned)`);
  }

  const out = join(__dirname, only ? `sites-${only}.json` : "sites.json");
  writeFileSync(out, JSON.stringify(sites, null, 2) + "\n");
  console.log(`Wrote ${sites.length} sites to ${out}`);
}

main().catch((e) => {
  console.error(String(e).slice(0, 200));
  process.exit(1);
});
