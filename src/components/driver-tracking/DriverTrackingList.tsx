import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import DriverAlertDot from '@/components/drivers/DriverAlertDot';
import {
  alertStateLabel,
  daysLeftLabel,
  type DriverSortKey,
  type DriverTrackingRow,
} from '@/lib/driverTrackingData';

function AlertChips({ row }: { row: DriverTrackingRow }) {
  if (row.alertItems.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1 justify-end max-w-[240px]" onClick={(e) => e.stopPropagation()}>
      {row.alertItems.map((alert) => (
        <Link
          key={alert.id}
          to={alert.hubLink}
          title={alert.detail}
          className={
            alert.urgent
              ? 'status-badge bg-destructive/10 text-destructive border border-destructive/30 text-[10px] hover:bg-destructive/15'
              : 'status-badge status-pending text-[10px] hover:bg-primary/15'
          }
        >
          {alert.label}
        </Link>
      ))}
    </div>
  );
}

function nextDays(row: DriverTrackingRow): string {
  const urgent = row.alertItems.find((a) => a.daysLeft !== null);
  if (!urgent) return row.nextAction;
  return daysLeftLabel(urgent.daysLeft);
}

export default function DriverTrackingList({
  rows,
  total,
  sort,
  onSort,
  onOpen,
}: {
  rows: DriverTrackingRow[];
  total: number;
  sort: DriverSortKey;
  onSort: (sort: DriverSortKey) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-xs font-bold text-muted-foreground uppercase">רשימת נהגים</p>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="driver-tracking-sort">מיון</label>
          <select
            id="driver-tracking-sort"
            className="filter-input w-auto min-w-[8rem]"
            value={sort}
            onChange={(e) => onSort(e.target.value as DriverSortKey)}
          >
            <option value="urgency">דחיפות</option>
            <option value="date">תאריך</option>
            <option value="name">שם</option>
          </select>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        מוצגים <strong className="text-foreground">{rows.length}</strong> מתוך{' '}
        <strong className="text-foreground">{total}</strong>
      </p>

      {rows.length === 0 ? (
        <div className="card-elevated text-center py-12 text-muted-foreground">לא נמצאו נהגים</div>
      ) : (
        <>
          <div className="hidden md:block card-elevated overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground text-xs">
                  <th className="py-3 px-3 text-right font-bold">נהג</th>
                  <th className="py-3 px-2 text-right">מחלקה</th>
                  <th className="py-3 px-2 text-right">רכב</th>
                  <th className="py-3 px-2 text-right">סטטוס</th>
                  <th className="py-3 px-2 text-right">התראה</th>
                  <th className="py-3 px-2 text-right">מועד הבא</th>
                  <th className="py-3 px-2 text-right">ימים</th>
                  <th className="py-3 px-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-border hover:bg-muted/30 cursor-pointer"
                    onClick={() => onOpen(row.id)}
                  >
                    <td className="py-3 px-3">
                      <div className="font-bold flex items-center gap-1.5">
                        {row.fullName}
                        <DriverAlertDot alerts={row.alertItems} driverId={row.id} />
                      </div>
                      <div className="text-xs text-muted-foreground">{row.employeeNumber} · {row.phone}</div>
                    </td>
                    <td className="py-3 px-2">{row.department}</td>
                    <td className="py-3 px-2">{row.vehiclePlates}</td>
                    <td className="py-3 px-2">
                      <span className={`status-badge ${row.status === 'active' ? 'status-active' : 'bg-muted text-muted-foreground'}`}>
                        {row.statusText}
                      </span>
                    </td>
                    <td className="py-3 px-2"><AlertChips row={row} /></td>
                    <td className="py-3 px-2">{row.nextAction}</td>
                    <td className="py-3 px-2">
                      <span className={row.alertItems.some((a) => a.urgent) ? 'text-destructive font-bold' : ''}>
                        {nextDays(row)}
                      </span>
                    </td>
                    <td className="py-3 px-2" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" onClick={() => onOpen(row.id)}>פתח מעקב</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => onOpen(row.id)}
                className="w-full card-elevated text-right space-y-2 hover:border-primary/30 transition-colors"
              >
                <div className="flex justify-between items-start gap-2">
                  <span className={`status-badge ${row.status === 'active' ? 'status-active' : 'bg-muted text-muted-foreground'}`}>
                    {row.statusText}
                  </span>
                  <div>
                    <p className="text-lg font-black flex items-center gap-1.5">
                      {row.fullName}
                      <DriverAlertDot alerts={row.alertItems} driverId={row.id} />
                    </p>
                    <p className="text-xs text-muted-foreground">{row.employeeNumber} · {row.phone}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{row.department} · רכב: {row.vehiclePlates}</p>
                <div className="flex flex-wrap gap-1 justify-end">
                  <AlertChips row={row} />
                </div>
                <p className={`text-xs ${row.alertItems.some((a) => a.urgent) ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                  {row.nextAction} · {nextDays(row)}
                  {row.alertItems[0] ? ` · ${alertStateLabel(row.alertItems[0].state)}` : ''}
                </p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
