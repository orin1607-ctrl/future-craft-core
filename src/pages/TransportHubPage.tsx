import { Link } from 'react-router-dom';
import {
  BarChart3,
  Bus,
  CalendarClock,
  ClipboardList,
  Map,
  Upload,
  UserCheck,
  Users,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import HomeWorldCard from '@/components/home/HomeWorldCard';
import { useTransportModule } from '@/hooks/useTransportModule';
import { TRANSPORT_FEATURES, type TransportFeatureId } from '@/lib/transportSettings';

const FEATURE_ICONS: Record<TransportFeatureId, LucideIcon> = {
  customers: Users,
  companions: UserCheck,
  routes: Map,
  'work-orders': ClipboardList,
  pickup: CalendarClock,
  teams: UsersRound,
  import: Upload,
  reports: BarChart3,
};

export default function TransportHubPage() {
  const { enabled, loading, isFeatureVisible } = useTransportModule();

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="animate-fade-in text-center py-16 space-y-4">
        <Bus size={48} className="mx-auto text-muted-foreground opacity-50" />
        <p className="text-xl text-muted-foreground">מודול הסעות אינו פעיל לחברה זו</p>
        <Link to="/dashboard" className="text-primary text-sm font-medium inline-block">
          ← חזרה לדשבורד
        </Link>
      </div>
    );
  }

  const visibleFeatures = TRANSPORT_FEATURES.filter((f) => isFeatureVisible(f.id));

  return (
    <div className="animate-fade-in space-y-6 pb-8">
      <div>
        <Link to="/dashboard" className="text-primary text-sm font-medium">
          ← חזרה לדשבורד
        </Link>
      </div>

      <header>
        <h1 className="page-header flex items-center gap-3 mb-2">
          <Bus size={28} className="text-primary" />
          חברות הסעות
        </h1>
        <p className="text-muted-foreground text-sm">
          לקוחות · מסלולים · סידור עבודה · צוותים · תיאומים
        </p>
      </header>

      {visibleFeatures.length === 0 ? (
        <div className="card-elevated text-center py-12 text-muted-foreground">
          <p className="text-lg">אין מסכים זמינים — בדוק הגדרות מודול הסעות</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {visibleFeatures.map((feature) => {
            const Icon = FEATURE_ICONS[feature.id];
            return (
              <HomeWorldCard
                key={feature.id}
                to={feature.to}
                icon={Icon}
                title={feature.label}
                subtitle={feature.subtitle}
                accent="info"
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
