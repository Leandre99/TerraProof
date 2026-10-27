import type { LatLng } from "./geo";

/**
 * Real clearing events for the "Replay a real clearing" demo. Each site comes from the Hansen Global Forest
 * Change dataset (loss recorded in `lossYear`) and was kept only because the Sentinel-2 archive shows the
 * canopy standing at `before` and gone at `after` when run through the published methodology
 * (see benchmark/RESULTS.md). Sites are the Amazon (Mato Grosso) parcels of the benchmark for which the engine issues credits before and freezes after.
 */
export interface ReplaySite {
  id: string;
  title: string; // parcel name on the ledger
  label: string; // button label
  region: string;
  polygon: LatLng[]; // [lat, lng]
  lossYear: number;
  before: string; // analysis date with the forest standing
  after: string; // analysis date after the clearing
}

export const REPLAYS: ReplaySite[] = [
  {
    id: "cleared-10S_060W-56-29634",
    title: "Replay · Mato Grosso parcel 1 (cleared 2023)",
    label: "Mato Grosso parcel 1",
    region: "Brazil",
    polygon: [[-17.412,-59.986],[-17.4085,-59.986],[-17.4085,-59.9825],[-17.412,-59.9825]],
    lossYear: 2023,
    before: "2022-12-31",
    after: "2023-12-31",
  },
  {
    id: "cleared-10S_060W-658-26418",
    title: "Replay · Mato Grosso parcel 2 (cleared 2023)",
    label: "Mato Grosso parcel 2",
    region: "Brazil",
    polygon: [[-16.608,-59.8355],[-16.6045,-59.8355],[-16.6045,-59.832],[-16.608,-59.832]],
    lossYear: 2023,
    before: "2022-12-31",
    after: "2023-12-31",
  },
  {
    id: "cleared-10S_060W-378-23900",
    title: "Replay · Mato Grosso parcel 3 (cleared 2022)",
    label: "Mato Grosso parcel 3",
    region: "Brazil",
    polygon: [[-15.9785,-59.9055],[-15.975,-59.9055],[-15.975,-59.902],[-15.9785,-59.902]],
    lossYear: 2022,
    before: "2021-12-31",
    after: "2022-12-31",
  },
];
