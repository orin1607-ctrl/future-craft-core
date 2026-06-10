import { Link } from 'react-router-dom';
import { ArrowRight, MessageCircle, Phone } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import GupshupWhatsAppSection from '@/components/settings/GupshupWhatsAppSection';

export default function WhatsAppSettingsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in text-center py-16">
        <MessageCircle size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-xl text-muted-foreground">אין הרשאה</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6 pb-8">
      <Link
        to="/dalia-settings"
        className="inline-flex items-center gap-2 text-primary text-sm font-medium min-h-[44px]"
      >
        <ArrowRight size={18} />
        חזרה ל-Dalia Settings
      </Link>

      <header>
        <h1 className="page-header flex items-center gap-3 mb-1">
          <MessageCircle size={28} className="text-[#25D366]" />
          WhatsApp Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Gupshup Business API (Staging) — שליחת התראות, תזכורות ויומן שליחות
        </p>
      </header>

      <GupshupWhatsAppSection />

      <div className="card-elevated space-y-3">
        <h2 className="font-bold flex items-center gap-2">
          <Phone size={18} className="text-primary" />
          WhatsApp לפי חברה (חירום / תקלות)
        </h2>
        <p className="text-sm text-muted-foreground">
          מספר WhatsApp, צבע כפתור וקטגוריות חירום מוגדרים בנפרד לכל חברה — לא דרך Gupshup API.
        </p>
        <Link
          to="/emergency-settings"
          className="inline-flex items-center gap-2 text-primary text-sm font-medium underline"
        >
          → הגדרות חירום WhatsApp לפי חברה
        </Link>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm space-y-2">
        <p className="font-bold">מוכן לשלב הבא (DB + שליחה אמיתית)</p>
        <ul className="list-disc list-inside text-muted-foreground space-y-1">
          <li>יומן התראות — כרגע Mock UI (מוכן לחיבור DB)</li>
          <li>Gupshup — Secret ב-Supabase, Edge Function פעיל ב-Staging</li>
          <li>תבניות WhatsApp לפי נושא — יוגדרו עם חיבור יומן השליחות</li>
        </ul>
      </div>
    </div>
  );
}
