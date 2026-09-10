import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { FleetOSVehicleRow } from './fleetosData';
import type { VehicleStatus } from './fleetosTypes';
import { STATUS_LABEL } from './fleetosFilters';
import { DEFAULT_MAP_VIEW, MAP_BASEMAPS, type MapBasemapId } from './starlink/mapProviders';

const PIN_COLOR: Record<VehicleStatus, string> = {
  driving: 'hsl(var(--success))',
  stopped: 'hsl(var(--muted-foreground))',
  fault: 'hsl(var(--destructive))',
  offline: 'hsl(var(--warning))',
};

function pinStatus(v: FleetOSVehicleRow): VehicleStatus {
  if (v.telematics?.freshness === 'stale') return 'offline';
  if (v.telematics?.motion === 'driving') return 'driving';
  if (v.telematics?.motion === 'stopped') return 'stopped';
  return v.status;
}

function divIcon(status: VehicleStatus, selected: boolean, stale: boolean, qa: boolean) {
  const size = selected ? 44 : 34;
  const qaMark = qa
    ? `<span style="position:absolute;bottom:-2px;left:50%;transform:translateX(-50%);font:700 8px/1 sans-serif;color:#fff;background:hsl(218 58% 27%);padding:1px 4px;border-radius:6px;">QA</span>`
    : '';
  return L.divIcon({
    className: 'fleetos-gps-marker',
    iconSize: [size, size + (qa ? 8 : 0)],
    iconAnchor: [size / 2, size / 2],
    html: `<span data-origin="${qa ? 'qa' : 'device'}" style="
      position:relative;display:flex;align-items:center;justify-content:center;
      width:${size}px;height:${size}px;border-radius:9999px;
      background:${PIN_COLOR[status]};
      border:2px solid hsl(var(--background));
      box-shadow:0 2px 8px rgba(0,0,0,.25);
      opacity:${stale ? 0.45 : 1};
      ${selected ? 'box-shadow:0 0 0 4px hsl(var(--primary)/.45);' : ''}
    ">${qaMark}</span>`,
  });
}

function FitSelected({
  selectedId,
  lat,
  lng,
  trail,
}: {
  selectedId: string | null | undefined;
  lat: number | null | undefined;
  lng: number | null | undefined;
  trail: { lat: number; lng: number }[];
}) {
  const map = useMap();
  const lastId = useRef<string | null>(null);

  const fittedTrail = useRef(false);

  useEffect(() => {
    if (!selectedId) {
      lastId.current = null;
      fittedTrail.current = false;
      return;
    }
    if (lat == null || lng == null) return;

    const idChanged = lastId.current !== selectedId;
    if (idChanged) {
      lastId.current = selectedId;
      fittedTrail.current = false;
      if (trail.length > 1) {
        const bounds = L.latLngBounds(trail.map((p) => [p.lat, p.lng] as [number, number]));
        bounds.extend([lat, lng]);
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15, animate: true });
        fittedTrail.current = true;
        return;
      }
      map.flyTo([lat, lng], 14, { duration: 0.55 });
      return;
    }

    if (!fittedTrail.current && trail.length > 1) {
      fittedTrail.current = true;
      const bounds = L.latLngBounds(trail.map((p) => [p.lat, p.lng] as [number, number]));
      bounds.extend([lat, lng]);
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15, animate: true });
    }
  }, [selectedId, lat, lng, trail, map]);

  return null;
}

function InitialFit({ points }: { points: [number, number][] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || points.length === 0) return;
    done.current = true;
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }
    map.fitBounds(points, { padding: [40, 48], maxZoom: 13 });
  }, [map, points]);
  return null;
}

export default function FleetOSLeafletMap({
  vehicles,
  selectedId,
  onSelect,
  basemap,
}: {
  vehicles: FleetOSVehicleRow[];
  selectedId?: string | null;
  onSelect: (v: FleetOSVehicleRow) => void;
  basemap: MapBasemapId;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);

  const tile = MAP_BASEMAPS[basemap];
  const selected = vehicles.find((v) => v.id === selectedId) || null;
  const trail = selected?.telematics?.trail || [];
  const initialPoints = useMemo(
    () =>
      vehicles
        .filter((v) => v.telematics?.lat != null && v.telematics?.lng != null)
        .map((v) => [v.telematics!.lat as number, v.telematics!.lng as number] as [number, number]),
    [vehicles],
  );

  if (!ready) {
    return <div className="absolute inset-0 bg-muted/30" aria-hidden />;
  }

  return (
    <MapContainer
      center={DEFAULT_MAP_VIEW.center}
      zoom={DEFAULT_MAP_VIEW.zoom}
      className="absolute inset-0 z-0 h-full w-full"
      scrollWheelZoom
      attributionControl
      zoomControl
      dir="ltr"
    >
      <TileLayer
        key={tile.id}
        url={tile.url}
        attribution={tile.attribution}
        maxZoom={tile.maxZoom}
        {...(tile.subdomains ? { subdomains: tile.subdomains } : {})}
      />
      <InitialFit points={initialPoints} />
      <FitSelected
        selectedId={selectedId}
        lat={selected?.telematics?.lat}
        lng={selected?.telematics?.lng}
        trail={trail}
      />
      {trail.length > 1 && (
        <Polyline
          positions={trail.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={{ color: 'hsl(218 58% 27%)', weight: 3, opacity: 0.75 }}
        />
      )}
      {vehicles.map((v) => {
        const lat = v.telematics?.lat;
        const lng = v.telematics?.lng;
        if (lat == null || lng == null) return null;
        const status = pinStatus(v);
        const stale = v.telematics?.freshness === 'stale';
        const qa = v.telematics?.dataOrigin === 'qa';
        const liveDevice = v.telematics?.live === true;
        const speed = v.telematics?.speedKmh;
        const originNote = qa ? 'QA/TEST' : liveDevice ? 'Live' : stale ? 'GPS ישן' : STATUS_LABEL[status];
        return (
          <Marker
            key={v.id}
            position={[lat, lng]}
            icon={divIcon(status, v.id === selectedId, stale, Boolean(qa))}
            eventHandlers={{ click: () => onSelect(v) }}
            title={`${v.plate} — ${originNote}${speed != null ? ` · ${speed} קמ״ש` : ''}`}
          />
        );
      })}
    </MapContainer>
  );
}
