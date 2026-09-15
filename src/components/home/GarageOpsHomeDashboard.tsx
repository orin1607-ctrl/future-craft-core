import { BarChart3, Scale, Warehouse } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import HomeWorldCard from '@/components/home/HomeWorldCard';

/** Dedicated garage-ops home. Regular fleet_manager and super_admin keep HomeDashboard. */
export default function GarageOpsHomeDashboard() {
  const { user } = useAuth();

  return (
    <div className="animate-fade-in space-y-6 pb-8" data-testid="garage-ops-home">
      <header className="space-y-1">
        <p className="text-xs font-bold tracking-wide text-primary">מנהל מוסך</p>
        <h1 className="text-2xl md:text-3xl font-black text-foreground">מרכז תפעול למוסך</h1>
        <p className="text-muted-foreground text-sm md:text-base">
          {user?.full_name}
          {user?.company_name ? ` · ${user.company_name}` : ''}
        </p>
        <p className="text-sm text-muted-foreground">
          שלושת אזורי העבודה של המוסך — ללא דשבורד ניהול הצי.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4" data-testid="garage-ops-core-cards">
        <HomeWorldCard
          to="/garage-management"
          icon={Warehouse}
          title="ניהול מוסך"
          subtitle="תיקי מוסך, קליטה, הצעות מחיר ועבודה"
          accent="primary"
        />
        <HomeWorldCard
          to="/claims"
          icon={Scale}
          title="ניהול תביעות"
          subtitle="תיקי תביעה · סטטוס · שיוך לרכב"
          accent="info"
        />
        <HomeWorldCard
          to="/reports"
          icon={BarChart3}
          title="דוחות"
          subtitle="דוחות וניתוחים קיימים"
          accent="success"
        />
      </div>
    </div>
  );
}
