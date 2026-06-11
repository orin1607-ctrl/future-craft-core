import { useState } from 'react';
import { Layers, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FleetOSVehicleRow } from './fleetosData';
import type { VehicleStatus } from './fleetosTypes';

const STATUS_PIN: Record<VehicleStatus, string> = {
  driving: 'bg-success',
  stopped: 'bg-muted-foreground',
  fault: 'bg-destructive',
  offline: 'bg-warning',
};

const LAYERS: { id: VehicleStatus; label: string }[] = [
  { id: 'driving', label: 'בנסיעה' },
  { id: 'stopped', label: 'עצורים' },
  { id: 'fault', label: 'תקלות' },
  { id: 'offline', label: 'לא מחובר' },
];

export default function FleetOSMapSection({
  vehicles,
  selectedId,
  onSelect,
}: {
  vehicles: FleetOSVehicleRow[];
  selectedId?: string | null;
  onSelect: (v: FleetOSVehicleRow) => void;
}) {
  const [layersOpen, setLayersOpen] = useState(false);
  const [active, setActive] = useState<VehicleStatus[]>(['driving', 'stopped', 'fault', 'offline']);

  const toggle = (id: VehicleStatus) => {
    setActive((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const visible = vehicles.filter((v) => active.includes(v.status));

  return (
    <div className="relative w-full min-h-[300px] sm:min-h-[380px] lg:min-h-[440px] rounded-2xl overflow-hidden border border-border shadow-sm">
      <div
        className="absolute inset-0 bg-gradient-to-br from-primary/8 via-muted/30 to-background"
        aria-hidden
      />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
        aria-hidden
      />

      <div className="absolute top-3 right-3 left-3 flex items-start justify-between gap-2 z-10">
        <div className="bg-card/95 backdrop-blur border border-border rounded-xl px-3 py-2 shadow-sm">
          <p className="text-xs font-bold text-muted-foreground">מפת צי</p>
          <p className="text-lg font-black text-primary">{vehicles.length} רכבים</p>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setLayersOpen((o) => !o)}
            className={cn(
              'w-10 h-10 rounded-xl border border-border flex items-center justify-center shadow-sm',
              layersOpen ? 'bg-primary text-primary-foreground' : 'bg-card text-primary',
            )}
            aria-label="שכבות מפה"
          >
            <Layers size={18} />
          </button>
          {layersOpen && (
            <div className="absolute top-12 left-0 min-w-[160px] bg-card border border-border rounded-xl shadow-lg overflow-hidden z-20">
              {LAYERS.map((l) => (
                <label
                  key={l.id}
                  className="flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/60 border-b border-border last:border-0"
                >
                  <input
                    type="checkbox"
                    checked={active.includes(l.id)}
                    onChange={() => toggle(l.id)}
                    className="accent-primary"
                  />
                  {l.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="absolute inset-0 pt-16 pb-4 px-4">
        {visible.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-muted-foreground bg-card/80 px-4 py-2 rounded-lg border border-border">
              אין רכבים בשכבות הנבחרות
            </p>
          </div>
        ) : (
          <div className="relative w-full h-full">
            {visible.map((v, i) => {
              const cols = 4;
              const row = Math.floor(i / cols);
              const col = i % cols;
              const top = 12 + row * 22 + (col % 2) * 4;
              const left = 8 + col * 22 + (row % 2) * 6;
              const isSelected = v.id === selectedId;
              return (
                <button
                  key={v.id}
                  type="button"
                  title={`${v.plate} — ${v.status_text}`}
                  onClick={() => onSelect(v)}
                  className={cn(
                    'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-md flex items-center justify-center transition-transform hover:scale-110',
                    STATUS_PIN[v.status],
                    isSelected ? 'w-11 h-11 ring-4 ring-primary/40 scale-110 z-10' : 'w-9 h-9',
                  )}
                  style={{ top: `${Math.min(top, 85)}%`, left: `${Math.min(left, 92)}%` }}
                >
                  <MapPin size={isSelected ? 16 : 14} className="text-primary-foreground" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="absolute bottom-3 left-3 flex gap-1.5 z-10">
        {(['driving', 'stopped', 'fault', 'offline'] as VehicleStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1 text-[10px] text-muted-foreground bg-card/90 px-2 py-1 rounded-full border border-border">
            <span className={cn('w-2 h-2 rounded-full', STATUS_PIN[s])} />
          </span>
        ))}
      </div>
    </div>
  );
}
