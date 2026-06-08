import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildVehicleHubUrl } from '@/lib/entityNavContext';
import { formatExpiry } from '@/components/vehicles/vehicleHubUtils';
import type { TrackingVehicleRow } from '@/lib/vehicleTrackingData';
import type { VehicleHistoryEntry } from '@/lib/vehicleHistory';

const TABS = [
  { id: 'current', label: 'מצב נוכחי' },
  { id: 'open', label: 'פעילות פתוחה' },
  { id: 'history', label: 'היסטוריה' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function TrackingVehicleDetail({
  vehicle,
  history,
  onBack,
}: {
  vehicle: TrackingVehicleRow;
  history: VehicleHistoryEntry[];
  onBack: () => void;
}) {
  const [tab, setTab] = useState<TabId>('current');
  const v = vehicle;

  const openItems = [
    v.has_open_fault && { type: 'תקלה', desc: 'תקלה פתוחה — ממתינה לטיפול' },
    v.has_open_defect && { type: 'ליקוי', desc: 'ליקוי פתוח' },
    v.has_open_accident && { type: 'תאונה', desc: 'תאונה בטיפול' },
    v.has_open_alert && { type: 'התראה', desc: 'דורש טיפול / תוקף' },
    v.has_active_service && { type: 'שירות', desc: v.service_status || 'טיפול פעיל' },
    v.has_active_transport && { type: 'שינוע', desc: 'שינוע פעיל' },
  ].filter(Boolean) as { type: string; desc: string }[];

  return (
    <div className="animate-fade-in pb-8">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-primary font-medium mb-4 min-h-[48px]"
      >
        <ArrowRight size={20} /> חזרה לרשימה
      </button>

      <div className="card-elevated mb-4">
        <div className="flex flex-wrap items-start gap-4 mb-4">
          <span className="text-2xl font-black bg-muted px-4 py-2 rounded-xl">{v.license_plate}</span>
          <div>
            <p className="font-bold text-lg">{v.manufacturer} {v.model} {v.year || ''}</p>
            <p className="text-sm text-muted-foreground">
              {v.internal_number} · {v.company_name}
              {v.department ? ` — ${v.department}` : ''}
            </p>
          </div>
          <span className={`status-badge ${v.status === 'active' ? 'status-active' : 'status-pending'}`}>
            {v.status_text}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <Info label="נהג" value={v.driver_name || '—'} />
          <Info label="מיקום" value={v.current_location || '—'} />
          <Info label='ק"מ' value={v.odometer.toLocaleString('he-IL')} />
          <Info label="טסט" value={formatExpiry(v.test_expiry)} />
          <Info label="ביטוח" value={formatExpiry(v.insurance_expiry)} />
          {v.in_garage && <Info label="זמן במוסך" value={`${v.days_in_garage} ימים`} warn />}
        </div>
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
          {v.has_open_defect && <span className="status-badge status-pending">ליקוי פתוח</span>}
          {v.has_open_fault && <span className="status-badge status-urgent">תקלה פתוחה</span>}
          {v.has_open_accident && <span className="status-badge status-urgent">תאונה פתוחה</span>}
          {v.has_open_alert && <span className="status-badge status-pending">התראה פעילה</span>}
        </div>
      </div>

      <Link
        to={buildVehicleHubUrl(v.id)}
        className="flex items-center justify-center gap-2 w-full mb-4 py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-base shadow-lg hover:opacity-95 transition-opacity min-h-[52px]"
      >
        <Car size={22} />
        כניסה לכרטיס הרכב
      </Link>
      <p className="text-xs text-muted-foreground text-center mb-4">
        פעולות (תקלות, מסמכים, עריכה) — רק מכרטיס הרכב
      </p>

      <div className="card-elevated p-0 overflow-hidden">
        <div className="flex overflow-x-auto border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-muted-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === 'current' && (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="טיפול פעיל" value={v.has_active_service ? 'כן' : 'לא'} />
              <Stat label="שינוע פעיל" value={v.has_active_transport ? 'כן' : 'לא'} />
              <Stat label="במוסך" value={v.in_garage ? `כן — ${v.days_in_garage} ימים` : 'לא'} />
              <Stat label="תקלות / ליקויים" value={[v.has_open_fault && 'תקלה', v.has_open_defect && 'ליקוי'].filter(Boolean).join(', ') || '—'} />
            </div>
          )}
          {tab === 'open' && (
            openItems.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">אין פעילות פתוחה לרכב זה</p>
            ) : (
              <ul className="space-y-2">
                {openItems.map((item, i) => (
                  <li key={i} className="card-elevated py-3 px-4 flex justify-between gap-2">
                    <span className="font-bold">{item.type}</span>
                    <span className="text-sm text-muted-foreground">{item.desc}</span>
                  </li>
                ))}
              </ul>
            )
          )}
          {tab === 'history' && (
            history.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">אין נתונים לרכב זה</p>
            ) : (
              <ul className="space-y-3 max-h-[420px] overflow-y-auto">
                {history.slice(0, 30).map((h) => (
                  <li key={h.id} className="border-b border-border pb-2 last:border-0">
                    <p className="font-bold text-sm">{h.title}</p>
                    <p className="text-xs text-muted-foreground">{h.date} · {h.userName}</p>
                    {h.description && <p className="text-sm mt-1">{h.description}</p>}
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
      <p className={`font-semibold ${warn ? 'text-warning' : ''}`}>{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-[11px] font-bold text-muted-foreground mb-1">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}
