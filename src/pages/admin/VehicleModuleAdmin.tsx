import { Link } from 'react-router-dom';
import { Car, Asterisk, ChevronLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import HomeWorldCard from '@/components/home/HomeWorldCard';

const VEHICLE_ADMIN_ITEMS = [
  {
    to: '/admin/modules/vehicles/required-fields',
    icon: Asterisk,
    title: 'שדות חובה בכרטיס רכב',
    subtitle: 'מספר רכב · רישיון · ביטוח חובה · מקיף · צד ג׳ · ועוד',
  },
];

export default function VehicleModuleAdmin() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in space-y-4 pb-8">
        <Link to="/admin-home" className="text-primary text-sm font-medium inline-flex items-center gap-1">
          <ChevronLeft size={16} /> חזרה למרכז ניהול
        </Link>
        <p className="text-muted-foreground">מודול זה זמין למנהל מערכת בלבד.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6 pb-8">
      <nav className="text-sm text-muted-foreground flex flex-wrap items-center gap-1">
        <Link to="/admin-home" className="text-primary hover:underline">
          מרכז ניהול
        </Link>
        <span>/</span>
        <Link to="/admin/modules" className="text-primary hover:underline">
          כפתורים ומודולים
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">ניהול רכבים</span>
      </nav>

      <header>
        <h1 className="page-header flex items-center gap-3 mb-2">
          <Car size={28} className="text-primary" />
          ניהול רכבים
        </h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          כל ההגדרות של כרטיס הרכב במקום אחד — שדות חובה, ביטוחים, רישיון וטסט.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {VEHICLE_ADMIN_ITEMS.map((item) => (
          <HomeWorldCard key={item.to} {...item} />
        ))}
      </div>
    </div>
  );
}
