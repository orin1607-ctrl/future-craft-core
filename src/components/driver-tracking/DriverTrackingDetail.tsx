import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, UserRound } from 'lucide-react';
import {
  alertStateLabel,
  daysLeftLabel,
  showDate,
  type DriverTrackingRow,
} from '@/lib/driverTrackingData';

const TABS = [
  { id: 'current', label: 'מצב נוכחי' },
  { id: 'open', label: 'התראות פתוחות' },
  { id: 'history', label: 'היסטוריה' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function DriverTrackingDetail({
  driver,
  onBack,
}: {
  driver: DriverTrackingRow;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<TabId>('current');
  const cardUrl = `/drivers?driverId=${encodeURIComponent(driver.id)}`;

  return (
    <div className="animate-fade-in pb-8">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-primary font-medium mb-4 min-h-[48px]">
        <ArrowRight size={20} /> חזרה לרשימה
      </button>

      <div className="card-elevated mb-4">
        <div className="flex flex-wrap items-start gap-4 mb-4">
          <span className="text-2xl font-black bg-muted px-4 py-2 rounded-xl">{driver.fullName}</span>
          <div>
            <p className="font-bold text-lg">{driver.employeeNumber}</p>
            <p className="text-sm text-muted-foreground">
              {driver.companyName}{driver.departmentRaw ? ` — ${driver.department}` : ''}
            </p>
            <p className="text-sm text-muted-foreground">{driver.phone}</p>
          </div>
          <span className={`status-badge ${driver.status === 'active' ? 'status-active' : 'status-pending'}`}>
            {driver.statusText}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <Info label="רכב משויך" value={driver.vehiclePlates} />
          <Info label="מספר רישיון" value={driver.licenseNumber} />
          <Info label="דרגות רישיון" value={driver.licenseGrades} />
          <Info label="תפוגת רישיון" value={driver.licenseExpiry} />
          <Info label="בדיקת רישיון אחרונה" value={driver.licenseCheckLast} />
          <Info label="בדיקת רישיון הבאה" value={driver.licenseCheckNext} />
          <Info label="הדרכת בטיחות" value={driver.safetyDone} />
          <Info label="הדרכה הבאה" value={driver.safetyNext} />
          <Info label="מבחן נהיגה" value={driver.examDone} />
          <Info label="תוצאת מבחן" value={driver.examResult} />
          <Info label="מבחן הבא" value={driver.examNext} />
          <Info label="הצהרת בריאות" value={driver.healthText} />
          <Info label="אישור והתאמה לרכב" value={driver.approvalText} />
          <Info label="תאונות ואירועים" value={driver.accidentsText} />
          <Info label="דוחות תנועה" value={driver.trafficText} />
          <Info label="פעולה אחרונה" value={driver.lastAction} />
          <Info label="פעולה הבאה" value={driver.nextAction} />
        </div>
        {driver.alertItems.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase">התראות פעילות</p>
            {driver.alertItems.map((alert) => (
              <Link
                key={alert.id}
                to={alert.hubLink}
                className={`flex items-center justify-between gap-2 p-3 rounded-xl border transition-colors ${
                  alert.urgent
                    ? 'border-destructive/30 bg-destructive/5 hover:bg-destructive/10'
                    : 'border-border hover:bg-muted/40'
                }`}
              >
                <span className="text-xs text-muted-foreground">{alert.detail}</span>
                <span className={`status-badge shrink-0 ${alert.urgent ? 'bg-destructive/10 text-destructive border border-destructive/30' : 'status-pending'}`}>
                  {alert.label}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap ${
              tab === item.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'current' && (
        <div className="card-elevated text-sm space-y-2">
          <p>חלון התראה אדומה: {driver.alertWindowDays} ימים לפי הגדרת החברה</p>
          <p>התראות פעילות: {driver.alertItems.length}</p>
          <p>רשומות היסטוריה: {driver.history.length}</p>
        </div>
      )}

      {tab === 'open' && (
        <div className="space-y-2">
          {driver.alertItems.length === 0 ? (
            <div className="card-elevated text-center text-muted-foreground py-8">אין התראות פעילות</div>
          ) : (
            driver.alertItems.map((alert) => (
              <Link key={alert.id} to={alert.hubLink} className="card-elevated block hover:border-primary/40 transition-colors space-y-1">
                <p className={`font-bold ${alert.urgent ? 'text-destructive' : ''}`}>{alert.label}</p>
                <p className="text-sm text-muted-foreground">נפתחה: {showDate(alert.openedAt)}</p>
                <p className="text-sm text-muted-foreground">יעד: {showDate(alert.dueAt)}</p>
                <p className="text-sm">סטטוס: {alertStateLabel(alert.state)}</p>
                <p className="text-sm">ימים שנותרו: {daysLeftLabel(alert.daysLeft)}</p>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {driver.history.length === 0 ? (
            <div className="card-elevated text-center text-muted-foreground py-8">אין היסטוריה</div>
          ) : (
            driver.history.map((item) => (
              <div key={item.id} className="card-elevated text-sm space-y-1">
                <p className="font-bold">{item.actionType}</p>
                <p>תאריך: {showDate(item.date)}</p>
                <p>תיאור: {item.description}</p>
                <p>בוצע על ידי: {item.performedBy}</p>
                <p>תוצאה: {item.result}</p>
                <p>
                  מסמך: {item.documentUrl ? (
                    <a href={item.documentUrl} target="_blank" rel="noreferrer" className="text-primary font-semibold">
                      {item.documentName || 'פתיחת מסמך'}
                    </a>
                  ) : 'לא קיים'}
                </p>
                {item.hubLink ? (
                  <p>
                    <Link to={item.hubLink} className="text-primary font-semibold">פתח בכרטיס הנהג</Link>
                  </p>
                ) : null}
                <p>מעקב הבא: {item.nextFollowUp}</p>
              </div>
            ))
          )}
        </div>
      )}

      <Link
        to={cardUrl}
        className="mt-4 flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold min-h-[52px]"
      >
        <UserRound size={20} /> פתח כרטיס נהג
      </Link>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
