import { useEffect, useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import 'leaflet/dist/leaflet.css';
import './fleetos-map.css';
import type { FleetOSVehicleRow } from './fleetosData';
import type { VehicleStatus } from './fleetosTypes';
import FleetOSLeafletMap from './FleetOSLeafletMap';
import type { MapBasemapId } from './starlink/mapProviders';
import { commStatusLabel, formatLastSeen, gpsFreshnessLabel, originLabel } from './telematicsDisplay';

const STATUS_PIN: Record<VehicleStatus, string> = {
  driving: 'bg-success',
  stopped: 'bg-muted-foreground',
  fault: 'bg-destructive',
  offline: 'bg-warning',
};

const LAYER_LABELS: Record<VehicleStatus, string> = {
  driving: 'בנסיעה',
  stopped: 'עצורים',
  fault: 'תקלות',
  offline: 'לא מחובר',
};

const LAYERS: { id: VehicleStatus; label: string }[] = (
  Object.keys(LAYER_LABELS) as VehicleStatus[]
).map((id) => ({ id, label: LAYER_LABELS[id] }));

function pinStatus(v: FleetOSVehicleRow): VehicleStatus {
  if (v.telematics?.freshness === 'stale') return 'offline';
  if (v.telematics?.motion === 'driving') return 'driving';
  if (v.telematics?.motion === 'stopped') return 'stopped';
  return v.status;
}

function hasGps(v: FleetOSVehicleRow): boolean {
  const t = v.telematics;
  return Boolean(t && t.freshness !== 'none' && t.lat != null && t.lng != null);
}

export default function FleetOSMapSection({
  vehicles,
  totalCount,
  selectedId,
  onSelect,
}: {
  vehicles: FleetOSVehicleRow[];
  totalCount?: number;
  selectedId?: string | null;
  onSelect: (v: FleetOSVehicleRow) => void;
}) {
  const [layersOpen, setLayersOpen] = useState(false);
  const [active, setActive] = useState<VehicleStatus[]>(['driving', 'stopped', 'fault', 'offline']);
  const [basemap, setBasemap] = useState<MapBasemapId>('streets');

  const toggle = (id: VehicleStatus) => {
    setActive((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const gpsVisible = useMemo(
    () => vehicles.filter((v) => hasGps(v) && active.includes(pinStatus(v))),
    [vehicles, active],
  );

  useEffect(() => {
    if (!selectedId) return;
    const row = vehicles.find((v) => v.id === selectedId);
    if (!row) return;
    const status = pinStatus(row);
    setActive((prev) => (prev.includes(status) ? prev : [...prev, status]));
  }, [selectedId, vehicles]);

  const filteredFromTotal = totalCount != null && totalCount !== vehicles.length;
  const selected = vehicles.find((v) => v.id === selectedId);
  const lastSeen = selected?.telematics?.lastSeen;

  return (
    <div className="relative w-full min-h-[320px] sm:min-h-[400px] lg:min-h-[460px] rounded-2xl overflow-hidden border border-border shadow-sm">
      <FleetOSLeafletMap
        vehicles={gpsVisible}
        selectedId={selectedId}
        onSelect={onSelect}
        basemap={basemap}
      />

      <div className="absolute top-2.5 sm:top-3 right-2.5 sm:right-3 left-2.5 sm:left-3 flex items-start justify-between gap-2 z-[500]">
        <div className="bg-card/95 backdrop-blur border border-border rounded-xl px-3 py-2 shadow-sm min-w-0 max-w-[70%]">
          <p className="text-[10px] sm:text-xs font-bold text-muted-foreground">מפת צי · GPS כאשר זמין</p>
          <p className="text-base sm:text-lg font-black text-primary leading-tight">
            {gpsVisible.length} רכבים על המפה
          </p>
          {filteredFromTotal && (
            <p className="text-[10px] text-muted-foreground truncate">מתוך {totalCount} בצי</p>
          )}
        </div>
        <div className="relative shrink-0 flex flex-col items-end gap-2">
          <div className="flex bg-card/95 border border-border rounded-xl overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => setBasemap('streets')}
              className={cn(
                'px-3 h-11 text-xs font-bold min-h-[44px]',
                basemap === 'streets' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              רחובות
            </button>
            <button
              type="button"
              onClick={() => setBasemap('satellite')}
              className={cn(
                'px-3 h-11 text-xs font-bold min-h-[44px]',
                basemap === 'satellite' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              לוויין
            </button>
          </div>
          <button
            type="button"
            onClick={() => setLayersOpen((o) => !o)}
            className={cn(
              'w-11 h-11 rounded-xl border border-border flex items-center justify-center shadow-sm min-h-[44px] min-w-[44px]',
              layersOpen ? 'bg-primary text-primary-foreground' : 'bg-card text-primary',
            )}
            aria-label="שכבות מפה"
          >
            <Layers size={18} />
          </button>
          {layersOpen && (
            <div className="absolute top-[calc(100%+8px)] left-0 min-w-[168px] bg-card border border-border rounded-xl shadow-lg overflow-hidden z-20">
              {LAYERS.map((l) => (
                <label
                  key={l.id}
                  className="flex items-center gap-2 px-3 py-3 text-sm cursor-pointer hover:bg-muted/60 border-b border-border last:border-0 min-h-[44px]"
                >
                  <input
                    type="checkbox"
                    checked={active.includes(l.id)}
                    onChange={() => toggle(l.id)}
                    className="accent-primary w-4 h-4"
                  />
                  <span className={cn('w-2 h-2 rounded-full shrink-0', STATUS_PIN[l.id])} />
                  {l.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {vehicles.length === 0 && (
        <div className="absolute inset-0 pt-16 flex items-center justify-center px-4 z-[400] pointer-events-none">
          <p className="text-sm text-muted-foreground bg-card/90 px-4 py-3 rounded-lg border border-border text-center">
            אין רכבים להצגה — שנה את הסינון ולחץ חפש
          </p>
        </div>
      )}
      {vehicles.length > 0 && gpsVisible.length === 0 && (
        <div className="absolute inset-0 pt-16 flex items-center justify-center px-4 z-[400] pointer-events-none">
          <p className="text-sm text-muted-foreground bg-card/90 px-4 py-3 rounded-lg border border-border text-center">
            אין מיקום GPS זמין — לא מוצג מיקום מדומה
          </p>
        </div>
      )}

      {selectedId && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-card/95 border border-primary/30 rounded-full px-3 py-1.5 text-[11px] sm:text-xs font-bold text-primary shadow-sm max-w-[92%] truncate z-[500]">
          {selected?.plate ?? ''} — נבחר
          {selected?.telematics && (
            <>
              {` · ${originLabel(selected.telematics)}`}
              {` · ${commStatusLabel(selected.telematics.commStatus)}`}
              {` · ${gpsFreshnessLabel(selected.telematics)}`}
            </>
          )}
          {lastSeen && (
            <span className="font-normal text-muted-foreground">
              {` · נראה ${formatLastSeen(lastSeen)}`}
            </span>
          )}
        </div>
      )}

      <div className="absolute bottom-2.5 left-2.5 right-2.5 sm:left-3 sm:right-auto flex flex-wrap gap-1.5 z-[500]">
        {(['driving', 'stopped', 'fault', 'offline'] as VehicleStatus[]).map((s) => (
          <span
            key={s}
            className="flex items-center gap-1 text-[10px] text-muted-foreground bg-card/90 px-2 py-1 rounded-full border border-border"
          >
            <span className={cn('w-2 h-2 rounded-full shrink-0', STATUS_PIN[s])} />
            {LAYER_LABELS[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
