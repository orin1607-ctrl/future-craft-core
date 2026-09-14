import { useEffect, useState } from 'react';
import { Car, Users, Radio, Building2, BarChart3, Shield, Radar, Bus, UserCog, Megaphone, Warehouse, Scale, Phone, Smartphone } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyScope } from '@/contexts/CompanyScopeContext';
import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import DashboardCardGate from '@/components/home/DashboardCardGate';
import HomeAlertsWidget from '@/components/home/HomeAlertsWidget';
import { countTrackingAttention } from '@/lib/vehicleTrackingData';
import { useHomeAlertPrefs } from '@/hooks/useHomeAlertPrefs';
import { applyExcludeArchivedVehicles } from '@/lib/vehicleArchive';
import { garageShopScopeOf } from '@/modules/garage-management/garageTenant';
import { listCases } from '@/modules/garage-management/garageBook';
import { computeGarageOpsMetrics, type GarageOpsMetric } from '@/lib/garageOpsMetrics';
import { isClosedStatus } from '@/features/claims/claimsConstants';

export default function HomeDashboard() {
  const { user } = useAuth();
  const { selectedCompany } = useCompanyScope();
  const isSuperAdmin = user?.role === 'super_admin';
  const garageOps = !!user?.garageOps;
  const canFleetOS = user?.role === 'super_admin' || user?.role === 'fleet_manager';
  const canClaims = isSuperAdmin || !!user?.hasClaimsAccess;
  const companyFilter = isSuperAdmin ? selectedCompany : user?.company_name || null;
  const { prefs, setPrefs } = useHomeAlertPrefs(user?.id);

  const [loading, setLoading] = useState(true);
  const [vehiclesCount, setVehiclesCount] = useState(0);
  const [driversCount, setDriversCount] = useState(0);
  const [fleetManagersCount, setFleetManagersCount] = useState(0);
  const [trackingAttention, setTrackingAttention] = useState(0);
  const [garageMetrics, setGarageMetrics] = useState<GarageOpsMetric[] | null>(null);
  const [garageMetricsLoading, setGarageMetricsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      const [vehiclesRes, driversRes, rolesRes] = await Promise.all([
        applyExcludeArchivedVehicles(
          applyCompanyScope(
            supabase.from('vehicles').select('id', { count: 'exact', head: true }),
            companyFilter,
          ),
        ),
        applyCompanyScope(
          supabase.from('drivers').select('id', { count: 'exact', head: true }),
          companyFilter,
        ),
        supabase.from('user_roles').select('user_id, role'),
      ]);

      if (cancelled) return;

      setVehiclesCount(vehiclesRes.count || 0);
      setDriversCount(driversRes.count || 0);

      const fmIds = new Set(
        (rolesRes.data || []).filter((r) => r.role === 'fleet_manager').map((r) => r.user_id),
      );

      if (fmIds.size > 0) {
        let profilesQuery = supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .in('id', Array.from(fmIds));
        if (companyFilter) profilesQuery = profilesQuery.eq('company_name', companyFilter);
        const fmRes = await profilesQuery;
        if (!cancelled) setFleetManagersCount(fmRes.count || 0);
      } else {
        setFleetManagersCount(0);
      }

      try {
        const attention = await countTrackingAttention(companyFilter);
        if (!cancelled) setTrackingAttention(attention);
      } catch {
        if (!cancelled) setTrackingAttention(0);
      }

      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [companyFilter, user?.id]);

  useEffect(() => {
    if (!garageOps) {
      setGarageMetrics(null);
      setGarageMetricsLoading(false);
      return;
    }
    let cancelled = false;
    setGarageMetricsLoading(true);
    const loadGarage = async () => {
      try {
        const cases = await listCases(garageShopScopeOf(user));
        let openClaimsCount: number | null = null;
        if (canClaims) {
          const { data, error } = await supabase
            .from('claims_records' as never)
            .select('id, status, row_data');
          if (!error) {
            openClaimsCount = ((data || []) as Array<{
              status?: string;
              row_data?: { archived?: string };
            }>).filter((row) => !isClosedStatus(String(row.status || ''), row.row_data?.archived)).length;
          }
        }
        if (!cancelled) setGarageMetrics(computeGarageOpsMetrics({ cases, openClaimsCount }));
      } catch {
        if (!cancelled) {
          setGarageMetrics(computeGarageOpsMetrics({ cases: [], openClaimsCount: canClaims ? 0 : null }));
        }
      } finally {
        if (!cancelled) setGarageMetricsLoading(false);
      }
    };
    void loadGarage();
    return () => {
      cancelled = true;
    };
  }, [garageOps, canClaims, user?.id, user?.company_name, user?.role]);

  const countLabel = (n: number) => (loading ? '…' : String(n));
  const attentionLabel = loading ? '…' : trackingAttention > 0 ? String(trackingAttention) : undefined;
  const showGarageModule = isSuperAdmin || garageOps;

  return (
    <div className="animate-fade-in space-y-6 pb-8">
      <header className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-black text-foreground">
          {garageOps ? 'מרכז תפעול למוסך' : 'דליה — מרכז שליטה'}
        </h1>
        <p className="text-muted-foreground text-sm md:text-base">
          {user?.full_name}
          {user?.company_name ? ` · ${isSuperAdmin && selectedCompany ? selectedCompany : user.company_name}` : ''}
        </p>
      </header>

      {garageOps && (
        <section
          className="grid grid-cols-2 lg:grid-cols-3 gap-3"
          data-testid="garage-ops-home-metrics"
        >
          {(garageMetricsLoading || !garageMetrics
            ? [
                { key: 'in_shop', title: 'רכבים במוסך עכשיו', value: '…', subtitle: '', available: true },
                { key: 'open_files', title: 'תיקים / תביעות פתוחים', value: '…', subtitle: '', available: true },
                { key: 'due_today', title: 'דורש טיפול היום', value: '…', subtitle: '', available: false },
                { key: 'quotes_waiting', title: 'הצעות ממתינות לאישור', value: '…', subtitle: '', available: true },
                { key: 'entered_month', title: 'רכבים שנכנסו החודש', value: '…', subtitle: '', available: true },
                { key: 'closed_month', title: 'עבודות שנסגרו החודש', value: '…', subtitle: '', available: true },
              ]
            : garageMetrics
          ).map((metric) => (
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
      )}

      <HomeAlertsWidget companyFilter={companyFilter} prefs={prefs} onPrefsChange={setPrefs} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {garageOps && (
          <>
            {showGarageModule && (
              <DashboardCardGate
                path="/garage-management"
                to="/garage-management"
                icon={Warehouse}
                title="ניהול מוסך"
                subtitle="תיקי עבודה · הצעות · קבלת רכב"
              />
            )}
            {canClaims && (
              <DashboardCardGate
                path="/claims"
                to="/claims"
                icon={Scale}
                title="ניהול תביעות"
                subtitle="תיקי תביעה · סטטוס · שיוך לרכב"
                accent="primary"
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
          </>
        )}
        <DashboardCardGate
          path="/vehicles"
          to="/vehicles"
          icon={Car}
          title="רכבים"
          subtitle="רשימת צי וכרטיסי רכב"
          badge={countLabel(vehiclesCount)}
        />
        <DashboardCardGate
          path="/drivers"
          to="/drivers"
          icon={Users}
          title="נהגים"
          subtitle="רשימת נהגים וכרטיסי נהג"
          badge={countLabel(driversCount)}
          accent="info"
        />
        <DashboardCardGate
          path="/vehicle-tracking"
          to="/vehicle-tracking"
          icon={Radio}
          title="מעקב רכבים"
          subtitle="צפייה ובקרה על מצב הצי"
          badge={attentionLabel}
          accent="warning"
        />
        {canFleetOS && (
          <DashboardCardGate
            path="/fleetos-ai"
            to="/fleetos-ai"
            icon={Radar}
            title="מיקום צי חכם"
            subtitle="FleetOS AI — מצב צי"
            accent="primary"
          />
        )}
        <DashboardCardGate
          path="/transport"
          to="/transport"
          icon={Bus}
          title="חברות הסעות"
          subtitle="מרכז הסעות · לקוחות · מסלולים"
          accent="info"
        />
        {!garageOps && (
          <DashboardCardGate
            path="/reports"
            to="/reports"
            icon={BarChart3}
            title="דוחות"
            subtitle="דוחות וניתוחים"
            accent="success"
          />
        )}
        {!garageOps && showGarageModule && (
          <DashboardCardGate
            path="/garage-management"
            to="/garage-management"
            icon={Warehouse}
            title="ניהול מוסך"
            subtitle="תיקי עבודה · הצעות · קבלת רכב"
          />
        )}
        {!garageOps && canClaims && (
          <DashboardCardGate
            path="/claims"
            to="/claims"
            icon={Scale}
            title="ניהול תביעות"
            subtitle="תיקי תביעה · סטטוס · שיוך לרכב"
            accent="primary"
          />
        )}
        <DashboardCardGate
          path="/fleet-managers"
          to="/fleet-managers"
          icon={Building2}
          title="מנהלי צי"
          subtitle="ניהול וכרטיסי מנהל"
          badge={countLabel(fleetManagersCount)}
        />
        {isSuperAdmin && (
          <DashboardCardGate
            path="/user-management"
            to="/user-management"
            icon={UserCog}
            title="משתמשים"
            subtitle="ניהול משתמשים והרשאות"
            accent="primary"
          />
        )}
        {isSuperAdmin && (
          <DashboardCardGate
            path="/ai-marketing"
            to="/ai-marketing"
            icon={Megaphone}
            title="ניהול שיווק"
            subtitle="שיווק · Google · AI — מערכת אחת"
            accent="primary"
          />
        )}
        {isSuperAdmin && (
          <DashboardCardGate
            path="/telemarketing/admin"
            to="/telemarketing/admin"
            icon={Phone}
            title="טלמיטינג"
            subtitle="מאגר לידים · שיוך לעובדים · Follow-up"
            accent="primary"
          />
        )}
        {isSuperAdmin && (
          <DashboardCardGate
            path="/driver-area-settings"
            to="/driver-area-settings"
            icon={Smartphone}
            title="הגדרות אזור נהג"
            subtitle="כפתורים · התראות · חירום · קילומטראז׳"
            accent="primary"
          />
        )}
        {isSuperAdmin && (
          <DashboardCardGate
            path="/admin-home"
            to="/admin-home"
            icon={Shield}
            title="מרכז ניהול"
            subtitle="Dalia Settings · בקרה · לוגים"
            accent="primary"
          />
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center pt-2">
        {garageOps
          ? 'ברירת המחדל היא ניהול מוסך, תביעות ודוחות. מנהל על יכול להוסיף או להסתיר מודולים לפי חברה.'
          : 'בחר תחום כדי להיכנס — פעולות מתבצעות מתוך כרטיס הרכב, הנהג או מנהל הצי.'}
      </p>
    </div>
  );
}
