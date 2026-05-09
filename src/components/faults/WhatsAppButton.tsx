import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { useAuth } from '@/contexts/AuthContext';
import { Phone, X, AlertTriangle, Car, Wrench, Shield, HelpCircle, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

interface EmergencyCategory {
  id: string;
  category_key: string;
  category_label: string;
  category_icon: string;
  target_type: string;
  target_value: string;
  auto_message_template: string;
  is_active: boolean;
}

const iconMap: Record<string, typeof Car> = {
  accident: AlertTriangle,
  tow: Car,
  fault: Wrench,
  tire: Shield,
  other: HelpCircle,
};

const defaultCategories = [
  { key: 'accident', label: 'תאונה', icon: 'accident' },
  { key: 'tow', label: 'גרר / שינוע', icon: 'tow' },
  { key: 'fault', label: 'תקלה דחופה בדרך', icon: 'fault' },
  { key: 'tire', label: 'נזק לשמשה / פנצ׳ר', icon: 'tire' },
  { key: 'other', label: 'אחר', icon: 'other' },
];

export default function WhatsAppButton() {
  const companyFilter = useCompanyFilter();
  const { user } = useAuth();
  const [settings, setSettings] = useState<{ whatsapp_phone: string; whatsapp_enabled: boolean; whatsapp_button_color: string; whatsapp_button_text: string } | null>(null);
  const [categories, setCategories] = useState<EmergencyCategory[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!companyFilter) return;
    
    Promise.all([
      supabase.from('company_settings').select('whatsapp_phone, whatsapp_enabled, whatsapp_button_color, whatsapp_button_text').eq('company_name', companyFilter).maybeSingle(),
      supabase.from('emergency_categories').select('*').eq('company_name', companyFilter).eq('is_active', true).order('sort_order'),
    ]).then(([settingsRes, catsRes]) => {
      if (settingsRes.data) setSettings(settingsRes.data);
      if (catsRes.data && catsRes.data.length > 0) {
        setCategories(catsRes.data as EmergencyCategory[]);
      }
    });
  }, [companyFilter]);

  if (!settings?.whatsapp_enabled) return null;

  const buildMessage = (cat: { category_key: string; category_label: string; auto_message_template?: string }, targetPhone: string) => {
    let msg = cat.auto_message_template || '';
    if (!msg) {
      msg = `שלום, אני צריך שירות חירום\nחברה: ${user?.company_name || ''}\nשם פונה: ${user?.full_name || ''}\nטלפון: ${user?.phone || ''}\nסוג אירוע: ${cat.category_label}`;
    } else {
      msg = msg
        .replace('{company}', user?.company_name || '')
        .replace('{name}', user?.full_name || '')
        .replace('{phone}', user?.phone || '')
        .replace('{category}', cat.category_label);
    }
    return msg;
  };

  const logEmergencyClick = async (cat: { category_key: string; category_label: string }, targetType: string, targetValue: string) => {
    if (!user) return;
    await supabase.from('emergency_logs').insert({
      company_name: user.company_name || '',
      user_id: user.id,
      user_name: user.full_name || '',
      category_key: cat.category_key,
      category_label: cat.category_label,
      target_type: targetType,
      target_value: targetValue,
    });
  };

  const handleCategoryClick = async (cat: EmergencyCategory | { category_key: string; category_label: string; category_icon: string; target_type: string; target_value: string }) => {
    const targetType = cat.target_type || 'whatsapp';
    const targetValue = cat.target_value || settings?.whatsapp_phone || '';
    
    await logEmergencyClick(cat, targetType, targetValue);

    if (targetType === 'phone') {
      window.open(`tel:${targetValue}`, '_self');
    } else {
      // WhatsApp
      const phone = targetValue.replace(/[^0-9]/g, '');
      const msg = buildMessage(cat as EmergencyCategory, phone);
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
      window.open(url, '_blank');
    }
    
    setOpen(false);
    toast.success('בקשת חירום נשלחה');
  };

  const displayCategories = categories.length > 0 
    ? categories 
    : defaultCategories.map(dc => ({
        ...dc,
        id: dc.key,
        category_key: dc.key,
        category_label: dc.label,
        category_icon: dc.icon,
        target_type: 'whatsapp',
        target_value: settings?.whatsapp_phone || '',
        auto_message_template: '',
        is_active: true,
      }));

  if (!settings?.whatsapp_phone && categories.length === 0) {
    // No center configured
    return (
      <div
        className="fixed bottom-24 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg text-white font-bold text-sm opacity-60 cursor-not-allowed"
        style={{ backgroundColor: settings?.whatsapp_button_color || '#666' }}
      >
        <Phone size={22} />
        אין מוקד כרגע
      </div>
    );
  }

  return (
    <>
      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-[60] animate-fade-in" onClick={() => setOpen(false)} />
      )}

      {/* Emergency Menu */}
      {open && (
        <div className="fixed bottom-44 left-4 right-4 md:right-6 md:left-auto md:w-80 z-[70] bg-card rounded-2xl shadow-2xl border border-border overflow-hidden animate-fade-in">
          <div className="p-4 bg-destructive/10 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone size={20} className="text-destructive" />
              <span className="font-bold text-lg">שירותי חירום 24/7</span>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-background/50">
              <X size={20} />
            </button>
          </div>
          <p className="text-sm text-muted-foreground px-4 pt-3">בחר את סוג האירוע:</p>
          <div className="p-3 space-y-1.5 max-h-[60vh] overflow-y-auto">
            {displayCategories.map((cat) => {
              const Icon = iconMap[cat.category_icon] || HelpCircle;
              return (
                <button
                  key={cat.category_key}
                  onClick={() => handleCategoryClick(cat)}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-accent transition-colors text-right"
                >
                  <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
                    <Icon size={20} className="text-destructive" />
                  </div>
                  <span className="font-semibold text-base">{cat.category_label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-24 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg text-white font-bold text-sm transition-transform hover:scale-105 active:scale-95"
        style={{ backgroundColor: settings?.whatsapp_button_color || '#25D366' }}
      >
        {open ? <X size={22} /> : <Phone size={22} />}
        {settings?.whatsapp_button_text || 'שירותי חירום 24/7'}
      </button>
    </>
  );
}
