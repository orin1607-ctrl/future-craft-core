import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  const openItems = v.alert_items.map((a) => ({
    type: a.label,
    desc: a.detail,
    link: a.hubLink,
  }));

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
        {v.alert_items.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase">התראות פעילות</p>
            {v.alert_items.map((a) => (
              <Link
                key={`${a.kind}-${a.entityId || a.tier || ''}-${a.detail}`}
                to={a.hubLink}
                className="flex items-center justify-between gap-2 p-3 rounded-xl border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 transition-colors"
              >
                <span className="text-xs text-muted-foreground">{a.detail}</span>
                <span className="status-badge status-urgent shrink-0">{a.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap ${
              tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'current' && (
        <div className="card-elevated text-sm space-y-2">
          <p>סטטוס שירות: {v.service_status || '—'}</p>
          <p>שינוע פעיל: {v.has_active_transport ? 'כן' : 'לא'}</p>
          <p>התראות ביטוח: {v.insurance_alerts_enabled ? 'מופעלות' : 'כבויות (מתג ברכב)'}</p>
        </div>
      )}

      {tab === 'open' && (
        <div className="space-y-2">
          {openItems.length === 0 ? (
            <div className="card-elevated text-center text-muted-foreground py-8">אין פעילות פתוחה</div>
          ) : (
            openItems.map((item, i) => (
              <Link key={i} to={item.link} className="card-elevated block hover:border-primary/40 transition-colors">
                <p className="font-bold text-destructive">{item.type}</p>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
                <p className="text-xs text-primary mt-2 font-semibold">פתח בכרטיס הרכב ←</p>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="card-elevated space-y-2 max-h-[50vh] overflow-y-auto">
          {history.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">אין היסטוריה</p>
          ) : (
            history.slice(0, 40).map((h) => (
              <div key={h.id} className="text-sm py-2 border-b border-border last:border-0">
                <span className="font-bold">{h.typeLabel}</span> — {h.title}
                <span className="text-xs text-muted-foreground block">{h.date}</span>
              </div>
            ))
          )}
        </div>
      )}

      <Link
        to={v.alert_items[0]?.hubLink || `/vehicles?vehicleId=${v.id}&view=hub`}
        className="mt-4 flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold min-h-[52px]"
      >
        <Car size={20} /> פתח כרטיס רכב — לאזור הרלוונטי
      </Link>
    </div>
  );
}

function Info({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`font-semibold ${warn ? 'text-destructive' : ''}`}>{value}</p>
    </div>
  );
}
