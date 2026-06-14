import { Link } from 'react-router-dom';
import { Shield, Users, Settings, ScrollText, Building2, Mail, SlidersHorizontal } from 'lucide-react';
import HomeWorldCard from '@/components/home/HomeWorldCard';
import RoleViewLauncher from '@/components/admin/RoleViewLauncher';

const ADMIN_LINKS = [
  { to: '/dalia-settings', icon: SlidersHorizontal, title: 'Dalia Settings', subtitle: 'התראות · WhatsApp · אימייל · חברות' },
  { to: '/user-management', icon: Users, title: 'משתמשים', subtitle: 'ניהול משתמשים והרשאות' },
  { to: '/permissions', icon: Shield, title: 'הרשאות', subtitle: 'תפקידים וגישה' },
  { to: '/settings', icon: Settings, title: 'פרופיל אישי', subtitle: 'שם, טלפון, סיסמה' },
  { to: '/system-logs', icon: ScrollText, title: 'Audit / לוגים', subtitle: 'בקרה מערכתית' },
  { to: '/suppliers', icon: Building2, title: 'ספקים', subtitle: 'ניהול ספקים' },
  { to: '/email-templates', icon: Mail, title: 'תבניות מייל', subtitle: 'תקשורת מערכת' },
];

export default function AdminHome() {
  return (
    <div className="animate-fade-in space-y-6 pb-8">
      <div className="flex items-center gap-3 mb-2">
        <Link to="/dashboard" className="text-primary text-sm font-medium">
          ← חזרה לדשבורד
        </Link>
      </div>
      <header>
        <h1 className="page-header flex items-center gap-3 mb-2">
          <Shield size={28} className="text-primary" />
          מרכז ניהול
        </h1>
        <p className="text-muted-foreground text-sm">משתמשים · הרשאות · הגדרות · בקרה</p>
      </header>
      <RoleViewLauncher />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {ADMIN_LINKS.map((item) => (
          <HomeWorldCard
            key={item.to}
            to={item.to}
            icon={item.icon}
            title={item.title}
            subtitle={item.subtitle}
          />
        ))}
      </div>
    </div>
  );
}
