import { Link } from 'react-router-dom';
import {
  Bell,
  Building2,
  ClipboardList,
  Mail,
  MessageCircle,
  Phone,
  Settings,
  Shield,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import HomeWorldCard from '@/components/home/HomeWorldCard';

const SETTINGS_SECTIONS = [
  {
    title: 'התראות ותזכורות',
    items: [
      {
        to: '/alert-settings',
        icon: Bell,
        title: 'הגדרות חברות',
        subtitle: 'תזכורות, רכב, מסמכים, כפתורים',
      },
      {
        to: '/alerts/log',
        icon: ClipboardList,
        title: 'יומן התראות ושליחות',
        subtitle: 'נהגים · רכבים · עלויות · לוח שנה',
      },
      {
        to: '/email-templates',
        icon: Mail,
        title: 'תבניות מייל',
        subtitle: 'הודעות אוטומטיות למערכת',
      },
    ],
  },
  {
    title: 'WhatsApp',
    items: [
      {
        to: '/dalia-settings/whatsapp',
        icon: MessageCircle,
        title: 'WhatsApp — Gupshup',
        subtitle: 'חיבור API, בדיקת שליחה, Staging',
      },
      {
        to: '/emergency-settings',
        icon: Phone,
        title: 'WhatsApp חירום לפי חברה',
        subtitle: 'כפתור חירום, קטגוריות, מספרים',
      },
    ],
  },
  {
    title: 'משתמשים ואישורים',
    items: [
      {
        to: '/user-management',
        icon: Users,
        title: 'ניהול משתמשים',
        subtitle: 'יצירה, עריכה, 2FA',
      },
      {
        to: '/permissions',
        icon: Shield,
        title: 'הרשאות',
        subtitle: 'תפקידים וגישה',
      },
      {
        to: '/approval-settings',
        icon: ShieldCheck,
        title: 'תור אישורים',
        subtitle: 'בקשות ממתינות לאישור',
      },
    ],
  },
  {
    title: 'מערכת',
    items: [
      {
        to: '/settings',
        icon: Settings,
        title: 'פרופיל אישי',
        subtitle: 'שם, טלפון, סיסמה, גיבוי',
      },
      {
        to: '/system-logs',
        icon: Building2,
        title: 'לוג מערכת',
        subtitle: 'Audit / פעולות משתמשים',
      },
    ],
  },
];

export default function DaliaSettings() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in text-center py-16">
        <Settings size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-xl text-muted-foreground">אין הרשאה — Dalia Settings למנהל על בלבד</p>
        <Link to="/settings" className="text-primary text-sm mt-4 inline-block">
          → הגדרות פרופיל אישי
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-8 pb-8">
      <div>
        <Link to="/admin-home" className="text-primary text-sm font-medium">
          ← חזרה למרכז ניהול
        </Link>
      </div>

      <header>
        <h1 className="page-header flex items-center gap-3 mb-2">
          <Settings size={28} className="text-primary" />
          Dalia Settings
        </h1>
        <p className="text-muted-foreground text-sm">
          התראות · WhatsApp · אימייל · מסמכים · תזכורות · חברות · נהגים · רכבים
        </p>
      </header>

      {SETTINGS_SECTIONS.map((section) => (
        <section key={section.title} className="space-y-3">
          <h2 className="text-base font-bold text-foreground border-b border-border pb-2">
            {section.title}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {section.items.map((item) => (
              <HomeWorldCard
                key={item.to}
                to={item.to}
                icon={item.icon}
                title={item.title}
                subtitle={item.subtitle}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
