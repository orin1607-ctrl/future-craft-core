import { useEffect, useMemo, useState } from 'react';
import { Layers, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FleetOSVehicleRow } from './fleetosData';
import type { VehicleStatus } from './fleetosTypes';
import { STATUS_LABEL } from './fleetosFilters';

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

function pinPosition(id: string, index: number): { top: string; left: string } {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const angle = ((hash % 360) * Math.PI) / 180;
  const ring = (index % 4) + 1;
  const radiusX = 12 + ring * 14;
  const radiusY = 10 + ring * 12;
  const cx = 50 + Math.cos(angle + index * 0.35) * radiusX * 0.75;
  const cy = 48 + Math.sin(angle + index * 0.35) * radiusY * 0.65;
  return {
    top: `${Math.max(10, Math.min(86, cy))}%`,
    left: `${Math.max(6, Math.min(94, cx))}%`,
  };
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

  const toggle = (id: VehicleStatus) => {
    setActive((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const visible = useMemo(
    () => vehicles.filter((v) => active.includes(v.status)),
    [vehicles, active],
  );

  useEffect(() => {
    if (!selectedId) return;
    const row = vehicles.find((v) => v.id === selectedId);
    if (!row) return;
    setActive((prev) => (prev.includes(row.status) ? prev : [...prev, row.status]));
  }, [selectedId, vehicles]);

  const filteredFromTotal = totalCount != null && totalCount !== vehicles.length;

  return (
    <div className="relative w-full min-h-[320px] sm:min-h-[400px] lg:min-h-[460px] rounded-2xl overflow-hidden border border-border shadow-sm">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-muted/30 to-background" aria-hidden />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
        aria-hidden
      />

      <div className="absolute top-2.5 sm:top-3 right-2.5 sm:right-3 left-2.5 sm:left-3 flex items-start justify-between gap-2 z-10">
        <div className="bg-card/95 backdrop-blur border border-border rounded-xl px-3 py-2 shadow-sm min-w-0 max-w-[70%]">
          <p className="text-[10px] sm:text-xs font-bold text-muted-foreground">מפת צי (Mock)</p>
          <p className="text-base sm:text-lg font-black text-primary leading-tight">
            {visible.length} רכבים על המפה
          </p>
          {filteredFromTotal && (
            <p className="text-[10px] text-muted-foreground truncate">מתוך {totalCount} בצי</p>
          )}
        </div>
        <div className="relative shrink-0">
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

      <div className="absolute inset-0 pt-[4.5rem] sm:pt-16 pb-12 px-2 sm:px-4">
        {vehicles.length === 0 ? (
          <div className="h-full flex items-center justify-center px-4">
            <p className="text-sm text-muted-foreground bg-card/90 px-4 py-3 rounded-lg border border-border text-center">
              אין רכבים להצגה — שנה את הסינון ולחץ חפש
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="h-full flex items-center justify-center px-4">
            <p className="text-sm text-muted-foreground bg-card/90 px-4 py-3 rounded-lg border border-border text-center">
              אין רכבים בשכבות הנבחרות
            </p>
          </div>
        ) : (
          <div className="relative w-full h-full min-h-[220px]">
            {visible.map((v, i) => {
              const pos = pinPosition(v.id, i);
              const isSelected = v.id === selectedId;
              return (
                <button
                  key={v.id}
                  type="button"
                  title={`${v.plate} — ${STATUS_LABEL[v.status]}`}
                  onClick={() => onSelect(v)}
                  className={cn(
                    'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-md flex items-center justify-center transition-all hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    STATUS_PIN[v.status],
                    isSelected ? 'w-12 h-12 sm:w-14 sm:h-14 ring-4 ring-primary/50 scale-110 z-10' : 'w-9 h-9 sm:w-10 sm:h-10',
                  )}
                  style={{ top: pos.top, left: pos.left }}
                  aria-label={`${v.plate} ${STATUS_LABEL[v.status]}`}
                  aria-pressed={isSelected}
                >
                  <MapPin size={isSelected ? 18 : 14} className="text-primary-foreground" />
                </button>
              );
            })}
            {selectedId && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-card/95 border border-primary/30 rounded-full px-3 py-1.5 text-[11px] sm:text-xs font-bold text-primary shadow-sm max-w-[92%] truncate">
                {visible.find((v) => v.id === selectedId)?.plate ?? ''} — נבחר
              </div>
            )}
          </div>
        )}
      </div>

      <div className="absolute bottom-2.5 left-2.5 right-2.5 sm:left-3 sm:right-auto flex flex-wrap gap-1.5 z-10">
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
