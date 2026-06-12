import { useState } from 'react';
import { ChevronLeft, MapPin, Navigation } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FleetOSFuelAnomaly, FleetOSChargeRow, FleetOSFuelRow } from './fleetosFuelTypes';
import type { FleetOSVehicleRow } from './fleetosData';

export type FuelSheetId =
  | 'actions'
  | 'add-fuel'
  | 'add-charge'
  | 'fuel-log'
  | 'charge-log'
  | 'anomalies'
  | 'savings'
  | 'reports'
  | null;

const STATUS_FUEL: Record<string, { label: string; cls: string }> = {
  ok: { label: 'תקין', cls: 'text-success' },
  anomaly: { label: 'חריגה', cls: 'text-destructive' },
  no_invoice: { label: 'חסרה קבלה', cls: 'text-warning' },
};

function formatDisplayDate(iso: string): string {
  if (!iso || iso === '—') return '—';
  try {
    return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return iso;
  }
}

export function exportActionSoon(label: string) {
  toast.info(`${label} — בקרוב`);
}

export function ExportActionsRow({ compact }: { compact?: boolean }) {
  const items = ['PDF', 'Excel', 'WhatsApp', 'Email', 'הדפסה'];
  return (
    <div className={cn('flex flex-wrap gap-2', compact && 'gap-1.5')}>
      {items.map((l) => (
        <Button key={l} type="button" variant="outline" size="sm" className="text-xs h-8" onClick={() => exportActionSoon(l)}>
          {l}
        </Button>
      ))}
    </div>
  );
}

function DetailGrid({ items }: { items: [string, string][] }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-4">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-xl bg-muted/40 p-3 text-right">
          <p className="text-[10px] font-bold text-muted-foreground mb-0.5">{k}</p>
          <p className="text-sm font-bold text-foreground break-words">{v}</p>
        </div>
      ))}
    </div>
  );
}

export function FuelLogContent({
  rows,
  onSelect,
}: {
  rows: FleetOSFuelRow[];
  onSelect: (row: FleetOSFuelRow) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-8">אין תדלוקים להצגה — שנה סינון ולחץ חפש</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => {
        const st = STATUS_FUEL[row.status] || STATUS_FUEL.ok;
        return (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onSelect(row)}
              className="w-full flex items-center gap-3 py-3 text-right hover:bg-muted/40 rounded-lg px-1 min-h-[56px]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  <span className="font-bold text-primary text-sm" dir="ltr">{row.plate}</span>
                  <span className="text-xs text-muted-foreground truncate">{row.driver}</span>
                  <span className={cn('text-xs font-bold mr-auto', st.cls)}>{st.label}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {formatDisplayDate(row.date)} {row.time} · {row.station} · {row.liters != null ? `${row.liters}ל׳` : '—'} · ₪{row.total}
                  {!row.has_invoice && <span className="text-warning"> · חסרה קבלה</span>}
                </p>
              </div>
              <ChevronLeft size={16} className="text-muted-foreground shrink-0" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function FuelLogDetail({ row }: { row: FleetOSFuelRow }) {
  const st = STATUS_FUEL[row.status] || STATUS_FUEL.ok;
  return (
    <>
      <DetailGrid
        items={[
          ['תאריך', formatDisplayDate(row.date)],
          ['שעה', row.time],
          ['מספר רישוי', row.plate],
          ['מספר פנימי', row.internal],
          ['נהג', row.driver],
          ['חברה', row.company],
          ['לקוח', row.customer],
          ['מיקום', row.location],
          ['תחנה', row.station],
          ['כתובת', row.station_address],
          ['ליטרים', row.liters != null ? `${row.liters}ל׳` : '—'],
          ['מחיר לליטר', row.price_per_liter != null ? `₪${row.price_per_liter}` : '—'],
          ['סכום', `₪${row.total}`],
          ['ק״מ', row.odometer != null ? row.odometer.toLocaleString('he-IL') : '—'],
          ['משך', row.duration],
          ['חשבונית', row.has_invoice ? 'קיימת' : 'חסרה'],
          ['סטטוס', st.label],
          ['הערות', row.notes || '—'],
        ]}
      />
      <ExportActionsRow />
    </>
  );
}

export function ChargeLogContent({
  rows,
  onSelect,
}: {
  rows: FleetOSChargeRow[];
  onSelect: (row: FleetOSChargeRow) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-8">אין טעינות להצגה — שנה סינון ולחץ חפש</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            onClick={() => onSelect(row)}
            className="w-full flex items-center gap-3 py-3 text-right hover:bg-muted/40 rounded-lg px-1 min-h-[56px]"
          >
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <span className="font-bold text-primary text-sm" dir="ltr">{row.plate}</span>
                <span className="text-xs text-muted-foreground">{row.driver}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {formatDisplayDate(row.date)} · {row.station} · {row.kwh ?? '—'} קוט״ש · ₪{row.total}
                {row.bat_before != null && ` · ${row.bat_before}%→${row.bat_after}%`}
              </p>
            </div>
            <ChevronLeft size={16} className="text-muted-foreground shrink-0" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ChargeLogDetail({ row }: { row: FleetOSChargeRow }) {
  return (
    <>
      <DetailGrid
        items={[
          ['תאריך', formatDisplayDate(row.date)],
          ['שעה', row.time],
          ['רכב', row.plate],
          ['פנימי', row.internal],
          ['נהג', row.driver],
          ['עמדה', row.station],
          ['קוט״ש', row.kwh != null ? String(row.kwh) : '—'],
          ['עלות', `₪${row.total}`],
          ['% לפני', row.bat_before != null ? `${row.bat_before}%` : '—'],
          ['% אחרי', row.bat_after != null ? `${row.bat_after}%` : '—'],
          ['משך', row.duration],
          ['חשבונית', row.has_invoice ? 'קיימת' : 'חסרה'],
        ]}
      />
      <ExportActionsRow />
    </>
  );
}

export function AnomaliesContent({ rows }: { rows: FleetOSFuelAnomaly[] }) {
  const open = rows.filter((a) => !a.handled);
  const done = rows.filter((a) => a.handled);
  return (
    <div className="space-y-4">
      <p className="text-xs font-bold text-muted-foreground">פעילות ({open.length})</p>
      {open.length === 0 && <p className="text-sm text-muted-foreground">אין חריגות פתוחות</p>}
      {open.map((a) => (
        <div
          key={a.id}
          className={cn(
            'card-elevated p-3 border-r-4',
            a.severity === 'critical' ? 'border-r-destructive' : 'border-r-warning',
          )}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-sm font-bold flex-1">{a.type}</p>
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', a.severity === 'critical' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning')}>
              {a.severity === 'critical' ? 'קריטי' : 'אזהרה'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-1">{a.plate} · {a.driver} · {a.date} {a.time}</p>
          <p className="text-xs text-foreground mb-3 leading-relaxed">{a.ai_note}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => toast.success('סומן לטיפול — בקרוב')}>טפל</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => toast.info('התעלמות — בקרוב')}>התעלם</Button>
          </div>
        </div>
      ))}
      {done.length > 0 && (
        <>
          <p className="text-xs font-bold text-muted-foreground pt-2">טופלו ({done.length})</p>
          {done.map((a) => (
            <div key={a.id} className="rounded-lg bg-muted/40 p-3 opacity-70 text-sm">
              <p className="font-bold">{a.type}</p>
              <p className="text-xs text-muted-foreground">{a.plate} · {a.date}</p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function openWaze(label: string) {
  const url = `https://waze.com/ul?q=${encodeURIComponent(label)}&navigate=yes`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function SavingsContent() {
  const fuelStations = [
    { name: 'פז ת״א — ויצמן', price: '₪5.29/ל׳', deal: true, dist: '1.2 ק״מ', save: '₪0.20/ל׳' },
    { name: 'סונול — דרך פ״ת', price: '₪5.31/ל׳', deal: true, dist: '2.4 ק״מ', save: '₪0.18/ל׳' },
    { name: 'דלק — קיבוץ גלויות', price: '₪5.44/ל׳', deal: false, dist: '3.1 ק״מ', save: null },
  ];
  const chargeStations = [
    { name: 'אבנר TLV', price: '₪0.82/קוט״ש', deal: true, dist: '0.8 ק״מ', avail: '3/4 פנויות' },
    { name: 'EvEdge HQ', price: '₪0.89/קוט״ש', deal: false, dist: '1.6 ק״מ', avail: '1/2 פנויה' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-right">
          <p className="text-[10px] font-bold text-success mb-1">חיסכון חודשי צפוי</p>
          <p className="text-xl font-black text-success">₪1,240</p>
          <p className="text-[10px] text-muted-foreground">תחנות בהסדר</p>
        </div>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-right">
          <p className="text-[10px] font-bold text-primary mb-1">חיסכון שנתי צפוי</p>
          <p className="text-xl font-black text-primary">₪14,880</p>
          <p className="text-[10px] text-muted-foreground">על בסיס השנה</p>
        </div>
      </div>

      <div className="relative min-h-[120px] rounded-xl border border-border bg-muted/30 overflow-hidden">
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="absolute bottom-2 right-2 bg-card border border-border rounded-lg px-2 py-1 text-[10px] font-bold text-muted-foreground flex items-center gap-1">
          <MapPin size={12} /> מפת תחנות — הכנה ל-Waze
        </div>
      </div>

      <p className="text-xs font-bold text-muted-foreground">תחנות דלק</p>
      {fuelStations.map((s) => (
        <div key={s.name} className="flex items-center gap-2 card-elevated p-3">
          <div className="flex-1 min-w-0 text-right">
            <p className="text-sm font-bold truncate">{s.name}</p>
            <p className="text-xs text-muted-foreground">{s.dist} · {s.price}{s.save && ` · חיסכון ${s.save}`}</p>
          </div>
          {s.deal && <span className="text-[10px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full shrink-0">הסדר</span>}
          <Button type="button" size="sm" className="shrink-0 gap-1 h-8" onClick={() => openWaze(s.name)}>
            <Navigation size={14} /> Waze
          </Button>
        </div>
      ))}

      <p className="text-xs font-bold text-muted-foreground pt-2">עמדות טעינה</p>
      {chargeStations.map((s) => (
        <div key={s.name} className="flex items-center gap-2 card-elevated p-3">
          <div className="flex-1 min-w-0 text-right">
            <p className="text-sm font-bold truncate">{s.name}</p>
            <p className="text-xs text-muted-foreground">{s.dist} · {s.price} · {s.avail}</p>
          </div>
          {s.deal && <span className="text-[10px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full shrink-0">הסדר</span>}
          <Button type="button" size="sm" className="shrink-0 gap-1 h-8" onClick={() => openWaze(s.name)}>
            <Navigation size={14} /> Waze
          </Button>
        </div>
      ))}
    </div>
  );
}

const REPORT_LIST = [
  'דוח תדלוקים מלא',
  'דוח טעינות מלא',
  'דוח צריכה לפי רכב',
  'דוח צריכה לפי נהג',
  'דוח צריכה לפי חברה',
  'דוח עלות לק״מ',
  'דוח חריגות',
  'דוח חשבוניות חסרות',
  'דוח חיסכון',
  'דוח ROI',
  'דוח חודשי',
  'דוח שנתי',
];

export function ReportsContent() {
  return (
    <div className="space-y-2">
      {REPORT_LIST.map((label) => (
        <div key={label} className="flex flex-col sm:flex-row sm:items-center gap-2 card-elevated p-3">
          <span className="flex-1 text-sm font-semibold text-right">{label}</span>
          <ExportActionsRow compact />
        </div>
      ))}
    </div>
  );
}

export function ActionsContent() {
  const items = [
    ['PDF', 'ייצוא PDF'],
    ['Excel', 'ייצוא Excel'],
    ['WhatsApp', 'שליחה ב-WhatsApp'],
    ['Email', 'שליחה באימייל'],
    ['הדפסה', 'הדפסה'],
    ['שיתוף', 'שיתוף'],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map(([short, full]) => (
        <Button key={full} type="button" variant="outline" className="h-auto py-4 flex flex-col gap-1" onClick={() => exportActionSoon(full)}>
          <span className="text-xs font-bold">{short}</span>
        </Button>
      ))}
    </div>
  );
}

export function AddFuelContent({
  selectedVehicle,
  onClose,
}: {
  selectedVehicle: FleetOSVehicleRow | null;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'pick' | 'manual' | 'photo'>('pick');
  const [form, setForm] = useState({ total: '', liters: '', station: '', notes: '' });

  const now = new Date();
  const auto = {
    date: now.toLocaleDateString('he-IL'),
    time: now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
    plate: selectedVehicle?.plate || '—',
    internal: selectedVehicle?.internal_number || '—',
    driver: selectedVehicle?.driver_name || '—',
    company: selectedVehicle?.company_name || '—',
    fuel: 'דיזל',
    km: selectedVehicle?.odometer?.toLocaleString('he-IL') || '—',
    location: selectedVehicle?.location || '—',
  };

  if (mode === 'pick') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button type="button" onClick={() => setMode('photo')} className="card-elevated p-6 text-center hover:bg-muted/40 transition-colors min-h-[120px]">
          <p className="text-sm font-bold text-primary mb-1">צילום חשבונית</p>
          <p className="text-xs text-muted-foreground">OCR — בקרוב</p>
        </button>
        <button type="button" onClick={() => setMode('manual')} className="card-elevated p-6 text-center hover:bg-muted/40 transition-colors min-h-[120px]">
          <p className="text-sm font-bold text-primary mb-1">הזנה ידנית</p>
          <p className="text-xs text-muted-foreground">מלא פרטי תדלוק</p>
        </button>
      </div>
    );
  }

  if (mode === 'photo') {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground mb-4">לחץ לצילום / העלאת קבלה</p>
        <p className="text-xs text-muted-foreground mb-6">OCR — בקרוב</p>
        <Button type="button" variant="outline" onClick={() => setMode('pick')}>חזור</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[['סכום (₪)', 'total'], ['ליטרים', 'liters'], ['תחנה', 'station'], ['הערה', 'notes']].map(([l, k]) => (
          <div key={k}>
            <label className="text-[11px] font-bold text-muted-foreground">{l}</label>
            <input
              className="filter-input w-full min-h-[40px] text-sm mt-1"
              value={form[k as keyof typeof form]}
              onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 mb-4 text-right">
        <p className="text-xs font-bold text-primary mb-2">ממולא אוטומטית מדליה</p>
        <div className="grid grid-cols-2 gap-1 text-xs">
          {Object.entries(auto).map(([k, v]) => (
            <div key={k}><span className="text-muted-foreground">{k}: </span>{v}</div>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" className="flex-1" onClick={() => { toast.success('שמירת תדלוק — בקרוב'); onClose(); }}>שמור תדלוק</Button>
        <Button type="button" variant="outline" onClick={() => setMode('pick')}>חזור</Button>
      </div>
    </div>
  );
}

export function AddChargeContent({ selectedVehicle, onClose }: { selectedVehicle: FleetOSVehicleRow | null; onClose: () => void }) {
  const [form, setForm] = useState({ kwh: '', total: '', batBefore: '', batAfter: '', station: '' });
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[['קוט״ש', 'kwh'], ['סכום', 'total'], ['% לפני', 'batBefore'], ['% אחרי', 'batAfter'], ['עמדה', 'station']].map(([l, k]) => (
          <div key={k} className={k === 'station' ? 'col-span-2' : ''}>
            <label className="text-[11px] font-bold text-muted-foreground">{l}</label>
            <input className="filter-input w-full min-h-[40px] text-sm mt-1" value={form[k as keyof typeof form]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} />
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 mb-4 text-xs text-right">
        רכב: {selectedVehicle?.plate || '—'} · נהג: {selectedVehicle?.driver_name || '—'} · חברה: {selectedVehicle?.company_name || '—'}
      </div>
      <Button type="button" className="w-full" onClick={() => { toast.success('שמירת טעינה — בקרוב'); onClose(); }}>שמור טעינה</Button>
    </div>
  );
}
