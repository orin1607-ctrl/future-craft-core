import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, ClipboardPlus, Scale, UserPlus, Warehouse } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import DashboardCardGate from '@/components/home/DashboardCardGate';
import { garageShopScopeOf } from '@/modules/garage-management/garageTenant';
import { listCases } from '@/modules/garage-management/garageBook';
import {
  buildGarageOpsWorkQueues,
  computeGarageOpsMetrics,
  type GarageOpsMetric,
  type GarageOpsQueueItem,
} from '@/lib/garageOpsMetrics';
import { isClosedStatus } from '@/features/claims/claimsConstants';
import { supabase } from '@/integrations/supabase/client';

const EMPTY_METRICS: GarageOpsMetric[] = [
  { key: 'in_shop', title: 'רכבים במוסך עכשיו', value: '…', subtitle: '', available: true },
  { key: 'open_files', title: 'תיקים / תביעות פתוחים', value: '…', subtitle: '', available: true },
  { key: 'due_today', title: 'דורש טיפול היום', value: '…', subtitle: '', available: false },
  { key: 'quotes_waiting', title: 'הצעות ממתינות לאישור', value: '…', subtitle: '', available: true },
  { key: 'entered_month', title: 'רכבים שנכנסו החודש', value: '…', subtitle: '', available: true },
  { key: 'closed_month', title: 'עבודות שנסגרו החודש', value: '…', subtitle: '', available: true },
];

type OpenClaimRow = { id: string; status: string };

export default function GarageOpsHomeDashboard() {
  const { user } = useAuth();
  const canClaims = !!user?.hasClaimsAccess;
  const [metrics, setMetrics] = useState<GarageOpsMetric[] | null>(null);
  const [openFiles, setOpenFiles] = useState<GarageOpsQueueItem[]>([]);
  const [inWork, setInWork] = useState<GarageOpsQueueItem[]>([]);
  const [waitingApproval, setWaitingApproval] = useState<GarageOpsQueueItem[]>([]);
  const [openClaims, setOpenClaims] = useState<OpenClaimRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      try {
        const cases = await listCases(garageShopScopeOf(user));
        let openClaimsCount: number | null = null;
        let openClaimRows: OpenClaimRow[] | null = null;
        if (canClaims) {
          const { data, error } = await supabase
            .from('claims_records' as never)
            .select('id, status, row_data');
          if (!error) {
            openClaimRows = ((data || []) as Array<{ id: string; status?: string; row_data?: { archived?: string } }>)
              .filter((row) => !isClosedStatus(String(row.status || ''), row.row_data?.archived))
              .map((row) => ({ id: row.id, status: String(row.status || '') }));
            openClaimsCount = openClaimRows.length;
          }
        }
        if (cancelled) return;
        const queues = buildGarageOpsWorkQueues(cases);
        setMetrics(computeGarageOpsMetrics({ cases, openClaimsCount }));
        setOpenFiles(queues.openFiles);
        setInWork(queues.inWork);
        setWaitingApproval(queues.waitingApproval);
        setOpenClaims(openClaimRows);
      } catch {
        if (!cancelled) {
          setMetrics(computeGarageOpsMetrics({ cases: [], openClaimsCount: canClaims ? 0 : null }));
          setOpenFiles([]);
          setInWork([]);
          setWaitingApproval([]);
          setOpenClaims(canClaims ? [] : null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [canClaims, user?.id, user?.company_name, user?.role]);

  const shownMetrics = loading || !metrics ? EMPTY_METRICS : metrics;

  return (
    <div className="animate-fade-in space-y-6 pb-8" data-testid="garage-ops-home">
      <header className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-black text-foreground">מרכז תפעול למוסך</h1>
        <p className="text-muted-foreground text-sm md:text-base">
          {user?.full_name}
          {user?.company_name ? ` · ${user.company_name}` : ''}
        </p>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-3 gap-3" data-testid="garage-ops-home-metrics">
        {shownMetrics.map((metric) => (
          <div
            key={metric.key}
            className="rounded-2xl border bg-card p-3 md:p-4 min-h-[92px] flex flex-col justify-between"
            data-testid={`garage-ops-metric-${metric.key}`}
          >
            <p className="text-xs md:text-sm text-muted-foreground leading-snug">{metric.title}</p>
            <p className="text-2xl font-black text-foreground mt-2">{metric.value}</p>
            {metric.subtitle ? (
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{metric.subtitle}</p>
            ) : null}
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        <DashboardCardGate
          path="/garage-management"
          to="/garage-management"
          icon={Warehouse}
          title="ניהול מוסך"
          subtitle="תיקי עבודה · הצעות · קבלת רכב"
        />
        {canClaims && (
          <DashboardCardGate
            path="/claims"
            to="/claims"
            icon={Scale}
            title="ניהול תביעות"
            subtitle="תיקי תביעה · סטטוס · שיוך לרכב"
            accent="primary"
            badge={openClaims ? String(openClaims.length) : undefined}
          />
        )}
        <DashboardCardGate
          path="/reports"
          to="/reports"
          icon={BarChart3}
          title="דוחות"
          subtitle="דוחות וניתוחים"
          accent="success"
        />
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="garage-ops-quick-actions">
        <Link to="/garage-management?new=1" className="home-world-card min-h-[96px] p-4">
          <div className="home-world-card-icon mb-3">
            <ClipboardPlus size={22} className="text-primary" />
          </div>
          <p className="font-black text-foreground">תיק מוסך חדש</p>
        </Link>
        <Link to="/garage-management?customer=1" className="home-world-card min-h-[96px] p-4">
          <div className="home-world-card-icon mb-3">
            <UserPlus size={22} className="text-primary" />
          </div>
          <p className="font-black text-foreground">הקמת לקוח</p>
        </Link>
        {canClaims && (
          <Link to="/claims" className="home-world-card min-h-[96px] p-4">
            <div className="home-world-card-icon mb-3">
              <Scale size={22} className="text-primary" />
            </div>
            <p className="font-black text-foreground">פתיחת תביעות</p>
          </Link>
        )}
        <Link to="/reports" className="home-world-card min-h-[96px] p-4">
          <div className="home-world-card-icon mb-3">
            <BarChart3 size={22} className="text-primary" />
          </div>
          <p className="font-black text-foreground">דוחות החברה</p>
        </Link>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
        <QueueCard title="תיקים פתוחים" empty="אין תיקים פתוחים" items={openFiles} testId="garage-ops-queue-open" />
        <QueueCard title="רכבים בעבודה" empty="אין רכבים בעבודה" items={inWork} testId="garage-ops-queue-in-work" />
        <QueueCard title="ממתינים לאישור" empty="אין הצעות ממתינות" items={waitingApproval} testId="garage-ops-queue-waiting" />
      </section>

      <section className="rounded-2xl border bg-card p-4 md:p-5" data-testid="garage-ops-open-claims">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-black text-foreground">תביעות פתוחות</h2>
          {canClaims && (
            <Link to="/claims" className="text-sm text-primary font-bold">
              לכל התביעות
            </Link>
          )}
        </div>
        {!canClaims ? (
          <p className="text-sm text-muted-foreground">אין הרשאת claims_can_access — תביעות לא נספרו ולא מוצג אפס.</p>
        ) : !openClaims || loading ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : openClaims.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין תביעות פתוחות</p>
        ) : (
          <ul className="space-y-2">
            {openClaims.slice(0, 8).map((row) => (
              <li key={row.id}>
                <Link to="/claims" className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 hover:bg-muted/40">
                  <span className="font-bold text-sm truncate">{row.id}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{row.status || 'פתוח'}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground text-center pt-2">
        ברירת המחדל היא ניהול מוסך, תביעות ודוחות. מנהל על יכול להוסיף או להסתיר מודולים לפי חברה.
      </p>
    </div>
  );
}

function QueueCard({
  title,
  empty,
  items,
  testId,
}: {
  title: string;
  empty: string;
  items: GarageOpsQueueItem[];
  testId: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 md:p-5 min-h-[220px]" data-testid={testId}>
      <h2 className="font-black text-foreground mb-3">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={item.href}
                className="block rounded-xl border px-3 py-2 hover:bg-muted/40"
              >
                <p className="font-bold text-sm text-foreground">{item.title}</p>
                {item.meta ? <p className="text-xs text-muted-foreground mt-0.5">{item.meta}</p> : null}
                <p className="text-xs text-primary mt-1">{item.nextAction}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
