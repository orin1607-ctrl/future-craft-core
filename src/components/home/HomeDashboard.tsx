import { useEffect, useState } from 'react';
import { Car, Users, Radio, Building2, BarChart3, Shield, Radar, Bus, UserCog, Megaphone } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyScope } from '@/contexts/CompanyScopeContext';
import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import DashboardCardGate from '@/components/home/DashboardCardGate';
import HomeAlertsWidget from '@/components/home/HomeAlertsWidget';
import { countTrackingAttention } from '@/lib/vehicleTrackingData';
import { useHomeAlertPrefs } from '@/hooks/useHomeAlertPrefs';
import { applyExcludeArchivedVehicles } from '@/lib/vehicleArchive';

export default function HomeDashboard() {
  const { user } = useAuth();
  const { selectedCompany } = useCompanyScope();
  const isSuperAdmin = user?.role === 'super_admin';
  const canFleetOS = user?.role === 'super_admin' || user?.role === 'fleet_manager';
  const companyFilter = isSuperAdmin ? selectedCompany : user?.company_name || null;
  const { prefs, setPrefs } = useHomeAlertPrefs(user?.id);

  const [loading, setLoading] = useState(true);
  const [vehiclesCount, setVehiclesCount] = useState(0);
  const [driversCount, setDriversCount] = useState(0);
  const [fleetManagersCount, setFleetManagersCount] = useState(0);
  const [trackingAttention, setTrackingAttention] = useState(0);

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

  const countLabel = (n: number) => (loading ? '…' : String(n));
  const attentionLabel = loading ? '…' : trackingAttention > 0 ? String(trackingAttention) : undefined;

  return (
    <div className="animate-fade-in space-y-6 pb-8">
      <header className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-black text-foreground">דליה — מרכז שליטה</h1>
        <p className="text-muted-foreground text-sm md:text-base">
          {user?.full_name}
          {user?.company_name ? ` · ${isSuperAdmin && selectedCompany ? selectedCompany : user.company_name}` : ''}
        </p>
      </header>

      <HomeAlertsWidget companyFilter={companyFilter} prefs={prefs} onPrefsChange={setPrefs} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
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
        <DashboardCardGate
          path="/reports"
          to="/reports"
          icon={BarChart3}
          title="דוחות"
          subtitle="דוחות וניתוחים"
          accent="success"
        />
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
        בחר תחום כדי להיכנס — פעולות מתבצעות מתוך כרטיס הרכב, הנהג או מנהל הצי.
      </p>
    </div>
  );
}
