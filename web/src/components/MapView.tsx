"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
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
    if (p.id === flashParcelId) return "#FF6B6B";
    if (p.status === "flagged") return "#F6B94C";
    return p.owner === me ? "#34E5A0" : "#6CB6FF";
  };

  return (
    <MapContainer center={center} zoom={16} minZoom={3} className="h-full w-full" zoomControl={false} attributionControl>
      <TileLayer url={ESRI} attribution="Imagery © Esri, Maxar, Earthstar Geographics" maxZoom={19} />
      <TileLayer url={LABELS} opacity={0.7} maxZoom={19} />
      <Clicks drawing={drawing} onAddPoint={onAddPoint} />
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
            <Polygon positions={draft} pathOptions={{ color: "#BFFF78", weight: 2, dashArray: "5 5", fillColor: "#BFFF78", fillOpacity: 0.18 }} />
          ) : (
            <Polyline positions={draft} pathOptions={{ color: "#BFFF78", weight: 2, dashArray: "5 5" }} />
          )}
          {draft.map((p, i) => (
            <CircleMarker key={i} center={p} radius={5} pathOptions={{ color: "#06140E", weight: 2, fillColor: "#BFFF78", fillOpacity: 1 }} />
          ))}
        </>
      )}
    </MapContainer>
  );
}
