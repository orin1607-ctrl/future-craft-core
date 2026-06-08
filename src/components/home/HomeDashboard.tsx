import { useEffect, useState } from 'react';
import { Car, Users, Radio, Building2, BarChart3, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyScope } from '@/contexts/CompanyScopeContext';
import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import HomeWorldCard from '@/components/home/HomeWorldCard';
import { countTrackingAttention } from '@/lib/vehicleTrackingData';

export default function HomeDashboard() {
  const { user } = useAuth();
  const { selectedCompany } = useCompanyScope();
  const isSuperAdmin = user?.role === 'super_admin';
  const companyFilter = isSuperAdmin ? selectedCompany : user?.company_name || null;

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
        applyCompanyScope(
          supabase.from('vehicles').select('id', { count: 'exact', head: true }),
          companyFilter,
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        <HomeWorldCard
          to="/vehicles"
          icon={Car}
          title="רכבים"
          subtitle="רשימת צי וכרטיסי רכב"
          badge={countLabel(vehiclesCount)}
        />
        <HomeWorldCard
          to="/drivers"
          icon={Users}
          title="נהגים"
          subtitle="רשימת נהגים וכרטיסי נהג"
          badge={countLabel(driversCount)}
          accent="info"
        />
        <HomeWorldCard
          to="/vehicle-tracking"
          icon={Radio}
          title="מעקב רכבים"
          subtitle="צפייה ובקרה על מצב הצי"
          badge={attentionLabel}
          accent="warning"
        />
        <HomeWorldCard
          to="/fleet-managers"
          icon={Building2}
          title="מנהלי צי"
          subtitle="ניהול וכרטיסי מנהל"
          badge={countLabel(fleetManagersCount)}
        />
        <HomeWorldCard
          to="/reports"
          icon={BarChart3}
          title="דוחות"
          subtitle="דוחות וניתוחים"
          accent="success"
        />
        {isSuperAdmin && (
          <HomeWorldCard
            to="/admin-home"
            icon={Shield}
            title="מנהל על"
            subtitle="משתמשים, הרשאות והגדרות"
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
