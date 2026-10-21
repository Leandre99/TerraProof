/**
 * Geospatial helpers: turn a drawn polygon into the set of geohash cells
 * (precision 8, 40 bits, ~38m x 19m at the equator) that the TerraProof
 * contract claims. Cells are encoded as uint64 (z-order interleaved bits).
 */

export type LatLng = [number, number]; // [lat, lng]

export const GEOHASH_BITS = 40; // precision 8
const AXIS_BITS = GEOHASH_BITS / 2; // 20 bits per axis
const AXIS_STEPS = 2 ** AXIS_BITS;
const LAT_STEP = 180 / AXIS_STEPS;
const LNG_STEP = 360 / AXIS_STEPS;

export const MAX_CELLS_PER_PARCEL = 256;

/** Interleave the bits of lng index (even positions, MSB first) and lat index. */
function interleave(latIdx: number, lngIdx: number): bigint {
  let out = 0n;
  for (let b = AXIS_BITS - 1; b >= 0; b--) {
    out = (out << 1n) | BigInt((lngIdx >> b) & 1);
    out = (out << 1n) | BigInt((latIdx >> b) & 1);
  }
  return out;
}

function deinterleave(cell: bigint): { latIdx: number; lngIdx: number } {
  let latIdx = 0;
  let lngIdx = 0;
  for (let b = AXIS_BITS - 1; b >= 0; b--) {
    const shift = BigInt(b * 2);
    lngIdx = (lngIdx << 1) | Number((cell >> (shift + 1n)) & 1n);
    latIdx = (latIdx << 1) | Number((cell >> shift) & 1n);
  }
  return { latIdx, lngIdx };
}

export function cellFromPoint(lat: number, lng: number): bigint {
  const latIdx = Math.min(AXIS_STEPS - 1, Math.max(0, Math.floor((lat + 90) / LAT_STEP)));
  const lngIdx = Math.min(AXIS_STEPS - 1, Math.max(0, Math.floor((lng + 180) / LNG_STEP)));
  return interleave(latIdx, lngIdx);
}

/** [south, west, north, east] bounds of a cell. */
export function cellBounds(cell: bigint): [number, number, number, number] {
  const { latIdx, lngIdx } = deinterleave(cell);
  const south = latIdx * LAT_STEP - 90;
  const west = lngIdx * LNG_STEP - 180;
  return [south, west, south + LAT_STEP, west + LNG_STEP];
}

function pointInPolygon(lat: number, lng: number, poly: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    const crosses = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Cells whose centre falls inside the polygon. Adjacent parcels never share a cell. */
export function polygonToCells(poly: LatLng[]): bigint[] {
  if (poly.length < 3) return [];
  const lats = poly.map((p) => p[0]);
  const lngs = poly.map((p) => p[1]);
  const latMin = Math.floor((Math.min(...lats) + 90) / LAT_STEP);
  const latMax = Math.floor((Math.max(...lats) + 90) / LAT_STEP);
  const lngMin = Math.floor((Math.min(...lngs) + 180) / LNG_STEP);
  const lngMax = Math.floor((Math.max(...lngs) + 180) / LNG_STEP);

  // Guard against absurdly large polygons before looping.
  if ((latMax - latMin + 1) * (lngMax - lngMin + 1) > 40_000) return [];

  const cells: bigint[] = [];
  for (let la = latMin; la <= latMax; la++) {
    for (let lo = lngMin; lo <= lngMax; lo++) {
      const cLat = (la + 0.5) * LAT_STEP - 90;
      const cLng = (lo + 0.5) * LNG_STEP - 180;
      if (pointInPolygon(cLat, cLng, poly)) cells.push(interleave(la, lo));
    }
  }
  return cells;
}

/** Approximate area of the cells in hectares. */
export function cellsAreaHa(cells: bigint[]): number {
  if (cells.length === 0) return 0;
  const [s, w, n, e] = cellBounds(cells[0]);
  const midLat = ((s + n) / 2) * (Math.PI / 180);
  const heightM = (n - s) * 111_320;
  const widthM = (e - w) * 111_320 * Math.cos(midLat);
  return (heightM * widthM * cells.length) / 10_000;
}

export function polygonCentroid(poly: LatLng[]): LatLng {
  const lat = poly.reduce((a, p) => a + p[0], 0) / poly.length;
  const lng = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  return [lat, lng];
}

/** Polygon outline (rectangle) enclosing all cells, handy for drawing a parcel from its cells. */
export function cellsToBBox(cells: bigint[]): [LatLng, LatLng] | null {
  if (cells.length === 0) return null;
  let s = Infinity,
    w = Infinity,
    n = -Infinity,
    e = -Infinity;
  for (const c of cells) {
    const [cs, cw, cn, ce] = cellBounds(c);
    s = Math.min(s, cs);
    w = Math.min(w, cw);
    n = Math.max(n, cn);
    e = Math.max(e, ce);
  }
  return [
    [s, w],
    [n, e],
  ];
}

export const shortCell = (c: bigint) => "0x" + c.toString(16).padStart(10, "0");
