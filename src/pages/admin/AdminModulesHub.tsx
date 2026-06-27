import { Link } from 'react-router-dom';
import { LayoutGrid, Car, Users, Building2, AlertTriangle, FileText, Wrench, Shield, Settings2, ClipboardList } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import HomeWorldCard from '@/components/home/HomeWorldCard';

const MODULE_HUBS = [
  {
    to: '/admin/modules/vehicles',
    icon: Car,
    title: 'ניהול רכבים',
    subtitle: 'שדות חובה בכרטיס רכב · ביטוחים · רישיון',
  },
  {
    to: '/admin/modules/drivers',
    icon: Users,
    title: 'ניהול נהגים',
    subtitle: 'שדות חובה בטופס נהג',
  },
  {
    to: '/admin/modules/customers',
    icon: Building2,
    title: 'ניהול לקוחות',
    subtitle: 'שדות חובה בטופס לקוח',
  },
  {
    to: '/admin/modules/accidents',
    icon: AlertTriangle,
    title: 'תאונות',
    subtitle: 'שדות חובה בטופס תאונה',
  },
  {
    to: '/admin/modules/documents',
    icon: FileText,
    title: 'מסמכים',
    subtitle: 'שדות חובה בטופס מסמך',
  },
  {
    to: '/admin/modules/treatments',
    icon: Wrench,
    title: 'טיפולים',
    subtitle: 'שדות חובה בטופס טיפול',
  },
  {
    to: '/admin/modules/insurance',
    icon: Shield,
    title: 'ביטוחים',
    subtitle: 'שדות חובה במודול ביטוח',
  },
  {
    to: '/admin/modules/tasks',
    icon: ClipboardList,
    title: 'ליקויים / משימות',
    subtitle: 'שדות חובה בפתיחת ליקוי',
  },
];

export default function AdminModulesHub() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in text-center py-16">
        <LayoutGrid size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-xl text-muted-foreground">אין הרשאה — מודול זה למנהל מערכת בלבד</p>
        <Link to="/admin-home" className="text-primary text-sm mt-4 inline-block">
          → חזרה למרכז ניהול
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6 pb-8">
      <div>
        <Link to="/admin-home" className="text-primary text-sm font-medium">
          ← חזרה למרכז ניהול
        </Link>
      </div>

      <header>
        <h1 className="page-header flex items-center gap-3 mb-2">
          <LayoutGrid size={28} className="text-primary" />
          כפתורים ומודולים
        </h1>
        <p className="text-muted-foreground text-sm">
          ניהול מודולים, שדות חובה והגדרות מערכת לפי תחום
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-base font-bold border-b border-border pb-2">מודולים לפי תחום</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MODULE_HUBS.map((item) => (
            <HomeWorldCard key={item.to} {...item} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold border-b border-border pb-2">הגדרות לפי חברה</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <HomeWorldCard
            to="/alert-settings"
            icon={Settings2}
            title="כפתורים ומודולים לפי חברה"
            subtitle="הסתרת כפתורים · מודול הסעות · תזכורות · חובות רכב"
          />
        </div>
      </section>
    </div>
  );
}
