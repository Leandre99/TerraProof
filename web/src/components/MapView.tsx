"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CircleMarker, MapContainer, Polygon, Polyline, Rectangle, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { cellBounds, type LatLng } from "@/lib/geo";
import type { Parcel } from "@/lib/registry/types";

interface Props {
  parcels: Parcel[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  draft: LatLng[];
  drawing: boolean;
  onAddPoint: (p: LatLng) => void;
  flashParcelId: number | null;
  me: string | null;
  initialCenter?: LatLng;
}

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const LABELS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

function Clicks({ drawing, onAddPoint }: { drawing: boolean; onAddPoint: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      if (drawing) onAddPoint([e.latlng.lat, e.latlng.lng]);
    },
  });
  const map = useMap();
  useEffect(() => {
    map.getContainer().style.cursor = drawing ? "crosshair" : "";
  }, [drawing, map]);
  return null;
}

/** Survey-style coordinate readout pinned on the map. */
function Readout() {
  const map = useMap();
  const [pos, setPos] = useState<{ lat: number; lng: number; z: number }>(() => ({ ...map.getCenter(), z: map.getZoom() }));
  useMapEvents({
    mousemove: (e) => setPos({ lat: e.latlng.lat, lng: e.latlng.lng, z: map.getZoom() }),
    zoomend: () => setPos((p) => ({ ...p, z: map.getZoom() })),
  });
  const dms = (v: number, pos: string, neg: string) => {
    const a = Math.abs(v);
    const d = Math.floor(a);
    const m = Math.floor((a - d) * 60);
    const s = ((a - d - m / 60) * 3600).toFixed(1);
    return `${d}°${String(m).padStart(2, "0")}′${s.padStart(4, "0")}″${v >= 0 ? pos : neg}`;
  };
  return createPortal(
    <div className="pointer-events-none absolute right-3 top-3 z-[1000] rounded-[4px] border-[1.5px] border-ink bg-raised px-2.5 py-1.5 font-mono text-[11px] leading-snug text-ink">
      <div>{dms(pos.lat, "N", "S")}</div>
      <div>{dms(pos.lng, "E", "W")}</div>
      <div className="text-mute">zoom {pos.z}</div>
    </div>,
    map.getContainer()
  );
}

function FlyTo({ parcel }: { parcel: Parcel | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!parcel || parcel.polygon.length === 0) return;
    const lats = parcel.polygon.map((p) => p[0]);
    const lngs = parcel.polygon.map((p) => p[1]);
    const b: LatLngBoundsExpression = [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ];
    map.flyToBounds(b, { padding: [90, 90], maxZoom: 17, duration: 0.9 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcel?.id]);
  return null;
}

export default function MapView({ parcels, selectedId, onSelect, draft, drawing, onAddPoint, flashParcelId, me, initialCenter }: Props) {
  const selected = parcels.find((p) => p.id === selectedId);
  const center = initialCenter ?? ([7.9335, 2.0595] as LatLng);

  const cellRects = useMemo(
    () => (selected ? selected.cells.map((c) => cellBounds(BigInt(c))) : []),
    [selected]
  );

  const colorOf = (p: Parcel) => {
    if (p.id === flashParcelId) return "#FF4D2E";
    if (p.status === "flagged") return "#FFB020";
    return p.owner === me ? "#C8F169" : "#7FC8FF";
  };

  return (
    <MapContainer center={center} zoom={16} minZoom={3} className="h-full w-full" zoomControl={false} attributionControl>
      <TileLayer url={ESRI} attribution="Imagery © Esri, Maxar, Earthstar Geographics" maxZoom={19} />
      <TileLayer url={LABELS} opacity={0.7} maxZoom={19} />
      <Clicks drawing={drawing} onAddPoint={onAddPoint} />
      <Readout />
      <FlyTo parcel={selected} />

      {parcels.map((p) => {
        const isSel = p.id === selectedId;
        const flashing = p.id === flashParcelId;
        return (
          <Polygon
            key={`${p.id}-${p.status}-${flashing}`}
            positions={p.polygon}
            pathOptions={{
              color: colorOf(p),
              weight: isSel || flashing ? 3 : 2,
              fillColor: colorOf(p),
              fillOpacity: flashing ? 0.45 : isSel ? 0.28 : 0.16,
              dashArray: p.status === "flagged" ? "6 6" : undefined,
            }}
            eventHandlers={{ click: () => !drawing && onSelect(p.id) }}
          >
            <Tooltip sticky direction="top" opacity={1}>
              <span style={{ fontWeight: 600 }}>#{p.id} · {p.name}</span>
            </Tooltip>
          </Polygon>
        );
      })}

      {cellRects.map((b, i) => (
        <Rectangle
          key={i}
          bounds={[
            [b[0], b[1]],
            [b[2], b[3]],
          ]}
          pathOptions={{ color: "#ffffff", weight: 0.4, fillColor: "#ffffff", fillOpacity: 0.06, interactive: false }}
        />
      ))}

      {draft.length > 0 && (
        <>
          {draft.length >= 3 ? (
            <Polygon positions={draft} pathOptions={{ color: "#FFFFFF", weight: 2.5, dashArray: "6 6", fillColor: "#FFFFFF", fillOpacity: 0.22 }} />
          ) : (
            <Polyline positions={draft} pathOptions={{ color: "#FFFFFF", weight: 2.5, dashArray: "6 6" }} />
          )}
          {draft.map((p, i) => (
            <CircleMarker key={i} center={p} radius={6} pathOptions={{ color: "#16140F", weight: 2.5, fillColor: "#C8F169", fillOpacity: 1 }} />
          ))}
        </>
      )}
    </MapContainer>
  );
}
