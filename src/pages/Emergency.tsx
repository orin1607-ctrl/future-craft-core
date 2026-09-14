import { useState, useEffect } from 'react';
import { Phone, AlertTriangle, Car, Wrench, Shield, HelpCircle, Clock, Navigation } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { dispatchDriverEvent, checkDriverEmergencySla } from '@/lib/dispatchDriverEvent';
import { resolveEmergencyDialNumber } from '@/lib/resolveEmergencyPhone';
import { useDriverVehicle } from '@/hooks/useDriverVehicle';

interface EmergencyService {
  id: string;
  title: string;
  description: string;
  icon: typeof Car;
  phone: string;
  colorCls: string;
  targetType: string;
  autoMessage: string;
}

const iconMap: Record<string, typeof Car> = {
  accident: AlertTriangle,
  tow: Car,
  fault: Wrench,
  tire: Shield,
  other: HelpCircle,
};

const colorMap: Record<string, string> = {
  accident: 'bg-destructive/10 text-destructive',
  tow: 'bg-destructive/10 text-destructive',
  fault: 'bg-warning/10 text-warning',
  tire: 'bg-warning/10 text-warning',
  other: 'bg-primary/10 text-primary',
};

const defaultServices: EmergencyService[] = [
  { id: 'tow', title: 'גרר', description: 'שירות גרירה לרכב תקוע', icon: Car, phone: '', colorCls: 'bg-destructive/10 text-destructive', targetType: 'phone', autoMessage: '' },
  { id: 'tire', title: 'פנצ׳ר / צמיגים', description: 'החלפת צמיג בדרך', icon: Shield, phone: '', colorCls: 'bg-warning/10 text-warning', targetType: 'phone', autoMessage: '' },
  { id: 'fault', title: 'תקלה דחופה', description: 'תקלה מכנית או חשמלית', icon: Wrench, phone: '', colorCls: 'bg-warning/10 text-warning', targetType: 'phone', autoMessage: '' },
  { id: 'accident', title: 'תאונה', description: 'דיווח וסיוע בתאונת דרכים', icon: AlertTriangle, phone: '', colorCls: 'bg-destructive/10 text-destructive', targetType: 'phone', autoMessage: '' },
];

export default function Emergency() {
  const { user } = useAuth();
  const { vehicle } = useDriverVehicle();
  const [services, setServices] = useState<EmergencyService[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<EmergencyService | null>(null);
  const [location, setLocation] = useState('');
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [logId, setLogId] = useState<string | null>(null);
  const [escalated, setEscalated] = useState(false);
  const [dialNumber, setDialNumber] = useState('');

  useEffect(() => {
    loadEmergencyConfig();
  }, [user?.company_name, user?.full_name]);

  useEffect(() => {
    if (vehicle?.license_plate && !vehiclePlate) {
      setVehiclePlate(vehicle.license_plate);
    }
  }, [vehicle?.license_plate]);

  useEffect(() => {
    if (!sent || !logId) return;
    let cancelled = false;
    const tick = async () => {
      await checkDriverEmergencySla();
      const { data } = await supabase
        .from('emergency_logs')
        .select('escalated_at')
        .eq('id', logId)
        .maybeSingle();
      if (!cancelled && data?.escalated_at) {
        setEscalated(true);
      }
    };
    tick();
    const interval = window.setInterval(tick, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [sent, logId]);

  const loadEmergencyConfig = async () => {
    if (!user) return;
    setLoading(true);
    const companyName = user.company_name || user.full_name || '';

    const [catsRes, configRes, daliaRes] = await Promise.all([
      supabase
        .from('emergency_categories')
        .select('*')
        .eq('company_name', companyName)
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('driver_app_company_config')
        .select('emergency_phone, service_phone, contact_name')
        .eq('company_name', companyName)
        .maybeSingle(),
      supabase
        .from('dalia_contact_settings')
        .select('phone, contact_name')
        .eq('id', 'global')
        .maybeSingle(),
    ]);

    const resolved = resolveEmergencyDialNumber({
      companyEmergencyPhone: (configRes.data as { emergency_phone?: string } | null)?.emergency_phone,
      daliaPhone: (daliaRes.data as { phone?: string } | null)?.phone,
    });
    setDialNumber(resolved);

    const applyPhone = (raw: string | null | undefined) =>
      resolveEmergencyDialNumber({
        companyEmergencyPhone: resolved,
        categoryPhone: raw,
      });

    if (catsRes.data && catsRes.data.length > 0) {
      const mapped: EmergencyService[] = catsRes.data.map((cat) => ({
        id: cat.category_key,
        title: cat.category_label,
        description: '',
        icon: iconMap[cat.category_icon] || HelpCircle,
        phone: applyPhone(cat.target_value),
        colorCls: colorMap[cat.category_icon] || 'bg-primary/10 text-primary',
        targetType: cat.target_type,
        autoMessage: cat.auto_message_template || '',
      }));
      setServices(mapped);
    } else {
      setServices(defaultServices.map((svc) => ({ ...svc, phone: resolved })));
    }
    setLoading(false);
  };

  const getLocation = () => {
    if (!navigator.geolocation) {
      toast.error('הדפדפן לא תומך במיקום');
      return;
    }
    setLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        setLoadingLocation(false);
        toast.success('המיקום נקלט');
      },
      () => {
        setLoadingLocation(false);
        toast.error('לא ניתן לקבל מיקום');
      },
    );
  };

  const handleCall = (phone: string) => {
    if (!phone) {
      toast.error('מספר מוקד לא הוגדר לחברה');
      return;
    }
    window.open(`tel:${phone}`, '_self');
  };

  const persistAndNotify = async (service: EmergencyService, targetType: string) => {
    const insertPayload = {
      user_id: user?.id || '',
      user_name: user?.full_name || '',
      company_name: user?.company_name || user?.full_name || '',
      category_key: service.id,
      category_label: service.title,
      target_type: targetType,
      target_value: dialNumber || service.phone,
      vehicle_plate: vehiclePlate || null,
      location: location || null,
      notes: description || null,
    };
    const { data, error } = await supabase
      .from('emergency_logs')
      .insert(insertPayload)
      .select('id')
      .single();
    if (error) {
      console.error(error);
      toast.error('שמירת בקשת החירום נכשלה');
      return null;
    }
    const record = {
      ...insertPayload,
      id: data.id,
      driver_name: user?.full_name || '',
      description: description || service.title,
    };
    dispatchDriverEvent({
      action_key: 'emergency',
      record,
      title: 'בקשת חירום',
      message: `${user?.full_name || ''} פתח בקשת חירום: ${service.title}`,
      link: '/emergency-settings',
    }).catch(console.error);
    return data.id as string;
  };

  const handleSubmit = async () => {
    if (!selectedService) return;
    setSending(true);
    const id = await persistAndNotify(selectedService, 'request');
    setSending(false);
    if (!id) return;
    setLogId(id);
    setSent(true);
    toast.success('בקשת החירום נשלחה');
  };

  if (loading) {
    return (
      <div className="animate-fade-in text-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
      </div>
    );
  }

  if (sent) {
    return (
      <div className="animate-fade-in text-center py-12">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <Clock size={40} className="text-primary" />
        </div>
        <h1 className="text-2xl font-bold mb-3">הבקשה נשלחה!</h1>
        <p className="text-lg text-muted-foreground mb-2">שירות {selectedService?.title} בטיפול</p>
        <p className="text-muted-foreground mb-8">
          {escalated
            ? 'אין מענה בזמן — חייג עכשיו למוקד.'
            : 'המוקד קיבל את הבקשה. אם אין מענה, חייג למוקד.'}
        </p>

        <button
          onClick={() => handleCall(dialNumber)}
          disabled={!dialNumber}
          className="w-full py-5 rounded-xl bg-primary text-primary-foreground text-xl font-bold flex items-center justify-center gap-3 mb-4 disabled:opacity-50"
        >
          <Phone size={24} />
          {dialNumber ? `חייג עכשיו למוקד — ${dialNumber}` : 'מספר מוקד לא הוגדר'}
        </button>

        <button
          onClick={() => {
            setSelectedService(null);
            setSent(false);
            setDescription('');
            setLocation('');
            setLogId(null);
            setEscalated(false);
          }}
          className="w-full py-4 rounded-xl bg-muted text-muted-foreground text-lg font-medium"
        >
          חזרה לשירותי חירום
        </button>
      </div>
    );
  }

  if (selectedService) {
    const Icon = selectedService.icon;
    const inputClass = 'w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none';

    return (
      <div className="animate-fade-in">
        <button onClick={() => setSelectedService(null)} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]">
          ← חזרה
        </button>

        <div className={`w-16 h-16 rounded-2xl ${selectedService.colorCls} flex items-center justify-center mx-auto mb-4`}>
          <Icon size={32} />
        </div>
        <h1 className="text-2xl font-bold text-center mb-1">{selectedService.title}</h1>
        <p className="text-center text-muted-foreground mb-6">{selectedService.description}</p>

        <div className="space-y-4">
          <button
            onClick={() => handleCall(dialNumber || selectedService.phone)}
            disabled={!(dialNumber || selectedService.phone)}
            className="w-full py-4 rounded-xl bg-destructive text-destructive-foreground text-lg font-bold flex items-center justify-center gap-3 disabled:opacity-50"
          >
            <Phone size={22} />
            {dialNumber || selectedService.phone
              ? `חייג עכשיו למוקד — ${dialNumber || selectedService.phone}`
              : 'מספר מוקד לא הוגדר'}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center"><span className="bg-background px-4 text-muted-foreground text-sm">או שלח בקשה עם פרטים</span></div>
          </div>

          <div>
            <label className="block text-lg font-medium mb-2">מיקום</label>
            <div className="flex gap-2">
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="כתובת / צומת / כביש..." className={`flex-1 ${inputClass}`} />
              <button onClick={getLocation} disabled={loadingLocation} className="px-4 py-4 rounded-xl bg-primary text-primary-foreground flex-shrink-0">
                <Navigation size={22} className={loadingLocation ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-lg font-medium mb-2">מספר רכב</label>
            <input value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} placeholder="12-345-67" className={inputClass} dir="ltr" style={{ textAlign: 'right' }} />
          </div>

          <div>
            <label className="block text-lg font-medium mb-2">פרטים נוספים</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="תאר את המצב..." className={`${inputClass} resize-none`} />
          </div>

          <button onClick={handleSubmit} disabled={sending} className="w-full py-5 rounded-xl bg-primary text-primary-foreground text-xl font-bold disabled:opacity-50">
            {sending ? 'שולח...' : '🚨 שלח בקשת חירום'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-3">
          <Phone size={32} className="text-destructive" />
        </div>
        <h1 className="text-2xl font-bold">שירותי חירום 24/7</h1>
        <p className="text-muted-foreground">בחר את סוג השירות הנדרש</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {services.map((svc) => {
          const Icon = svc.icon;
          return (
            <button
              key={svc.id}
              onClick={() => setSelectedService(svc)}
              className="card-elevated flex flex-col items-center text-center p-5 hover:shadow-lg transition-shadow min-h-[140px] justify-center"
            >
              <div className={`w-14 h-14 rounded-2xl ${svc.colorCls} flex items-center justify-center mb-3`}>
                <Icon size={28} />
              </div>
              <p className="text-lg font-bold">{svc.title}</p>
              {svc.description && <p className="text-sm text-muted-foreground mt-1">{svc.description}</p>}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => handleCall(dialNumber)}
        disabled={!dialNumber}
        className="w-full py-5 rounded-xl bg-destructive text-destructive-foreground text-xl font-bold flex items-center justify-center gap-3 disabled:opacity-50"
      >
        <Phone size={24} />
        {dialNumber ? `חייג עכשיו למוקד — ${dialNumber}` : 'מספר מוקד לא הוגדר בהגדרות'}
      </button>

      <p className="text-center text-sm text-muted-foreground mt-4">המוקד פעיל 24 שעות, 7 ימים בשבוע</p>
    </div>
  );
}
