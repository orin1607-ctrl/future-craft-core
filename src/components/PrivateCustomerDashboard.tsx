import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Car, Wrench, Phone, Shield,
  ClipboardList, Bell, Tag, Truck, Scale,
  History, Upload, CarFront, MessageCircle, RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useDriverVehicle } from '@/hooks/useDriverVehicle';

interface ServiceAction {
  label: string;
  description: string;
  icon: any;
  link: string;
  color: string;
  category: 'primary' | 'service' | 'info';
}

const serviceActions: ServiceAction[] = [
  // Primary actions
  {
    label: 'דיווח תקלה / תאונה',
    description: 'דיווח על פנצ\'ר, תאונה או בעיה טכנית',
    icon: AlertTriangle,
    link: '/faults',
    color: 'bg-destructive/10 text-destructive border-destructive/20',
    category: 'primary',
  },
  {
    label: 'הזמנת טיפול',
    description: 'שירותים ותחזוקה או תחזוקה לרכב',
    icon: Wrench,
    link: '/service-orders',
    color: 'bg-primary/10 text-primary border-primary/20',
    category: 'primary',
  },
  // Service actions
  {
    label: 'החלפת רכב',
    description: 'תיעוד מסירה וקבלה של רכב',
    icon: RefreshCw,
    link: '/vehicle-exchange',
    color: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    category: 'service',
  },
  {
    label: 'שינוע רכב לטסט',
    description: 'בקשת שינוע הרכב לבדיקת טסט',
    icon: Truck,
    link: '/towing',
    color: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    category: 'service',
  },
  {
    label: 'חידוש ביטוח',
    description: 'בקשה לחידוש פוליסת ביטוח',
    icon: Shield,
    link: '/service-orders',
    color: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
    category: 'service',
  },
  {
    label: 'השוואת מחירים לביטוח',
    description: 'בקשת השוואת מחירים בין חברות ביטוח',
    icon: Scale,
    link: '/service-orders',
    color: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
    category: 'service',
  },
  {
    label: 'בקשה ידנית אחרת',
    description: 'שליחת בקשה מותאמת אישית',
    icon: MessageCircle,
    link: '/service-orders',
    color: 'bg-muted text-muted-foreground border-border',
    category: 'service',
  },
  // Info actions
  {
    label: 'היסטוריית טיפולים',
    description: 'צפייה בהיסטוריית טיפולים ואירועים',
    icon: History,
    link: '/history',
    color: 'bg-muted text-muted-foreground border-border',
    category: 'info',
  },
  {
    label: 'העלאת חשבוניות',
    description: 'צירוף חשבוניות דלק והוצאות',
    icon: Upload,
    link: '/expenses',
    color: 'bg-muted text-muted-foreground border-border',
    category: 'info',
  },
  {
    label: 'הכנת הרכב למכירה',
    description: 'בקשה להכנת הרכב למכירה',
    icon: CarFront,
    link: '/service-orders',
    color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    category: 'info',
  },
  {
    label: 'אנשי קשר וחירום',
    description: 'מספרי חירום ואנשי קשר',
    icon: Phone,
    link: '/emergency',
    color: 'bg-muted text-muted-foreground border-border',
    category: 'info',
  },
];

interface RecentActivity {
  id: string;
  title: string;
  status: string;
  date: string;
  type: 'fault' | 'service';
}

export default function PrivateCustomerDashboard() {
  const { user } = useAuth();
  const { vehicle } = useDriverVehicle();
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const loadRecent = async () => {
      const [faultsRes, ordersRes, notifRes] = await Promise.all([
        supabase.from('faults')
          .select('id, description, status, created_at')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase.from('service_orders')
          .select('id, description, treatment_status, created_at')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase.from('driver_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false),
      ]);

      const activities: RecentActivity[] = [];
      (faultsRes.data || []).forEach(f => activities.push({
        id: f.id, title: f.description || 'תקלה', status: f.status || 'new', date: f.created_at || '', type: 'fault',
      }));
      (ordersRes.data || []).forEach(o => activities.push({
        id: o.id, title: o.description || 'שירותים ותחזוקה', status: o.treatment_status || 'new', date: o.created_at || '', type: 'service',
      }));
      activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRecentActivities(activities.slice(0, 5));
      setUnreadCount(notifRes.count || 0);
    };

    loadRecent();
  }, [user]);

  const STATUS_MAP: Record<string, { label: string; class: string }> = {
    new: { label: 'חדש', class: 'bg-primary/10 text-primary' },
    open: { label: 'פתוח', class: 'bg-warning/10 text-warning' },
    opened: { label: 'נפתח', class: 'bg-primary/10 text-primary' },
    in_progress: { label: 'בטיפול', class: 'bg-sky-500/10 text-sky-600' },
    in_treatment: { label: 'בטיפול', class: 'bg-sky-500/10 text-sky-600' },
    completed: { label: 'הושלם', class: 'bg-emerald-500/10 text-emerald-600' },
    closed: { label: 'נסגר', class: 'bg-muted text-muted-foreground' },
  };

  const primaryActions = serviceActions.filter(a => a.category === 'primary');
  const serviceGroup = serviceActions.filter(a => a.category === 'service');
  const infoGroup = serviceActions.filter(a => a.category === 'info');

  return (
    <div className="animate-fade-in space-y-6">
      {/* Welcome header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">ברוך הבא,</p>
          <h1 className="text-2xl font-black text-foreground">{user?.full_name}</h1>
        </div>
        <Link to="/driver-notifications" className="relative p-3 rounded-2xl bg-muted hover:bg-muted/80 transition-colors">
          <Bell size={24} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>
      </div>

      {/* Vehicle card */}
      {vehicle && (
        <div className="card-elevated overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">הרכב שלי</p>
              <p className="text-xl font-black">{vehicle.manufacturer} {vehicle.model} {vehicle.year}</p>
              <p className="text-lg font-bold text-primary" dir="ltr">{vehicle.license_plate}</p>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Car size={32} className="text-primary" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-bold">תקין ופעיל</span>
            <span className="text-xs text-muted-foreground">ק״מ: {vehicle.odometer?.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Primary Actions - full width */}
      <div className="space-y-3">
        {primaryActions.map(action => {
          const Icon = action.icon;
          return (
            <Link key={action.label} to={action.link}
              className={`flex items-center gap-4 p-5 rounded-2xl border-2 ${action.color} hover:shadow-md transition-shadow`}>
              <div className="w-14 h-14 rounded-2xl bg-background/50 flex items-center justify-center flex-shrink-0">
                <Icon size={28} />
              </div>
              <div>
                <p className="text-lg font-bold">{action.label}</p>
                <p className="text-sm opacity-75">{action.description}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Service Actions */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-3">שירותים</h2>
        <div className="grid grid-cols-2 gap-3">
          {serviceGroup.map(action => {
            const Icon = action.icon;
            return (
              <Link key={action.label} to={action.link}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 ${action.color} hover:shadow-md transition-shadow text-center min-h-[100px]`}>
                <Icon size={26} className="mb-2" />
                <p className="font-bold text-xs leading-tight">{action.label}</p>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Info & Management */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-3">ניהול ומידע</h2>
        <div className="grid grid-cols-2 gap-3">
          {infoGroup.map(action => {
            const Icon = action.icon;
            return (
              <Link key={action.label} to={action.link}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 ${action.color} hover:shadow-md transition-shadow text-center min-h-[100px]`}>
                <Icon size={26} className="mb-2" />
                <p className="font-bold text-xs leading-tight">{action.label}</p>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Promotions banner */}
      <Link to="/promotions" className="block card-elevated bg-gradient-to-l from-emerald-500/10 to-primary/10 border-2 border-emerald-500/20 hover:shadow-lg transition-shadow">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <Tag size={28} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-emerald-600">מבצעים והטבות</p>
            <p className="text-sm text-muted-foreground">צפייה במבצעים והטבות ייחודיות</p>
          </div>
        </div>
      </Link>

      {/* Recent activity */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-3">פעילות אחרונה</h2>
        {recentActivities.length === 0 ? (
          <div className="card-elevated text-center py-6">
            <ClipboardList size={32} className="mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-muted-foreground">אין פעילות עדיין</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentActivities.map(a => {
              const statusInfo = STATUS_MAP[a.status] || STATUS_MAP.new;
              return (
                <div key={a.id} className="card-elevated flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${a.type === 'fault' ? 'bg-warning/10' : 'bg-primary/10'}`}>
                      {a.type === 'fault' ? <AlertTriangle size={18} className="text-warning" /> : <Wrench size={18} className="text-primary" />}
                    </div>
                    <div>
                      <p className="font-bold text-sm line-clamp-1">{a.title}</p>
                      <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold ${statusInfo.class}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {a.date ? new Date(a.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
