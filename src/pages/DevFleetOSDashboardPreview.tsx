import { Link } from 'react-router-dom';
import { Car, Users, Radio, Building2, BarChart3, Radar } from 'lucide-react';
import HomeWorldCard from '@/components/home/HomeWorldCard';

/**
 * תצוגת פיתוח — כרטיס "מיקום צי חכם" בדשבורד (ללא DB).
 * פתיחה: /dev/fleetos-dashboard
 */
export default function DevFleetOSDashboardPreview() {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="hidden md:block fixed inset-y-0 right-0 w-72 bg-[hsl(218,58%,15%)] z-10" aria-hidden />
      <main className="md:mr-72 p-4 md:p-6 max-w-7xl mx-auto pb-24 relative z-20">
        <h1 className="page-header text-2xl md:text-3xl mb-2">דשבורד</h1>
        <p className="text-sm text-muted-foreground mb-6">תצוגת פיתוח — כרטיסי עולמות</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <HomeWorldCard to="/dev/fleetos-module1" icon={Car} title="רכבים" subtitle="ניהול צי ומעקב" badge="15" />
          <HomeWorldCard to="/dev/fleetos-module1" icon={Users} title="נהגים" subtitle="כרטיסי נהג ושיבוץ" badge="8" />
          <HomeWorldCard to="/dev/fleetos-module1" icon={Radio} title="מעקב רכבים" subtitle="מיקום וסטטוס בזמן אמת" badge="3" />
          <HomeWorldCard
            to="/dev/fleetos-module1"
            icon={Radar}
            title="מיקום צי חכם"
            subtitle="FleetOS AI — מצב צי"
            accent="primary"
          />
          <HomeWorldCard to="/dev/fleetos-module1" icon={Building2} title="מנהלי צי" subtitle="ניהול וכרטיסי מנהל" />
          <HomeWorldCard to="/dev/fleetos-module1" icon={BarChart3} title="דוחות" subtitle="ניתוח ותובנות" />
        </div>
        <p className="text-xs text-muted-foreground mt-6 text-center">
          <Link to="/dev/fleetos-module1" className="text-primary underline">
            פתח FleetOS AI
          </Link>
        </p>
      </main>
    </div>
  );
}
