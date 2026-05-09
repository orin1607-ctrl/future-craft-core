import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Calendar, Clock, MapPin, Phone, User, Car, CheckCircle2, XCircle, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

type Appointment = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  vehicle_plate: string | null;
  driver_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  location: string | null;
  notes: string | null;
  status: string;
  source: string;
  company_name: string | null;
  conversation_id: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'מתוזמן',
  in_progress: 'בביצוע',
  completed: 'הושלם',
  cancelled: 'בוטל',
  no_show: 'לא הגיע',
};

const STATUS_COLOR: Record<string, string> = {
  scheduled: 'bg-blue-500/15 text-blue-400',
  in_progress: 'bg-amber-500/15 text-amber-400',
  completed: 'bg-emerald-500/15 text-emerald-400',
  cancelled: 'bg-red-500/15 text-red-400',
  no_show: 'bg-muted text-muted-foreground',
};

export default function PickupAppointments() {
  const { user } = useAuth();
  const role = user?.role;
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [drivers, setDrivers] = useState<{ id: string; full_name: string; phone: string | null }[]>([]);
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    vehicle_plate: '',
    driver_id: '',
    scheduled_date: '',
    scheduled_time: '',
    location: '',
    notes: '',
  });

  const isDriver = role === 'driver';

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pickup_appointments')
      .select('*')
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .order('scheduled_time', { ascending: true, nullsFirst: false });
    if (error) {
      toast.error('שגיאה בטעינה: ' + error.message);
    } else {
      setItems((data || []) as Appointment[]);
    }
    setLoading(false);
  };

  const loadDrivers = async () => {
    const { data } = await supabase.from('drivers').select('id, full_name, phone').eq('status', 'active');
    setDrivers((data || []) as any);
  };

  useEffect(() => {
    load();
    if (!isDriver) loadDrivers();

    const ch = supabase
      .channel('pickup_appointments_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickup_appointments' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isDriver]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('pickup_appointments').update({ status }).eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('סטטוס עודכן');
  };

  const createAppointment = async () => {
    if (!form.customer_name && !form.vehicle_plate) {
      return toast.error('נדרש לפחות שם לקוח או לוחית רכב');
    }
    const drv = drivers.find(d => d.id === form.driver_id);
    const { error } = await supabase.from('pickup_appointments').insert({
      customer_name: form.customer_name || null,
      customer_phone: form.customer_phone || null,
      vehicle_plate: form.vehicle_plate || null,
      driver_id: form.driver_id || null,
      driver_name: drv?.full_name || null,
      driver_phone: drv?.phone || null,
      scheduled_date: form.scheduled_date || null,
      scheduled_time: form.scheduled_time || null,
      location: form.location || null,
      notes: form.notes || null,
      status: 'scheduled',
      source: 'manual',
      created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success('תיאום נוצר');
    setShowAdd(false);
    setForm({ customer_name: '', customer_phone: '', vehicle_plate: '', driver_id: '', scheduled_date: '', scheduled_time: '', location: '', notes: '' });
  };

  return (
    <div className="container mx-auto p-4 pb-24" dir="rtl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">🚗 תיאומי איסוף רכב</h1>
        <p className="text-muted-foreground">
          {isDriver ? 'תיאומים ששובצו אליך' : 'כל תיאומי איסוף הרכב במערכת'}
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">טוען...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-card rounded-xl border">
          <Calendar className="mx-auto mb-3 opacity-30" size={48} />
          אין תיאומי איסוף כרגע
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map(a => (
            <div key={a.id} className="bg-card border rounded-xl p-4 hover:border-primary/40 transition-colors">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[a.status] || 'bg-muted'}`}>
                    {STATUS_LABEL[a.status] || a.status}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                    {a.source === 'voice_ai' ? '🎙️ Voice AI' : '✍️ ידני'}
                  </span>
                </div>
                {!isDriver && a.status === 'scheduled' && (
                  <div className="flex gap-2">
                    <button onClick={() => updateStatus(a.id, 'completed')}
                      className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm hover:bg-emerald-500/20">
                      <CheckCircle2 size={14} /> השלם
                    </button>
                    <button onClick={() => updateStatus(a.id, 'cancelled')}
                      className="flex items-center gap-1 px-3 py-1 rounded-lg bg-red-500/10 text-red-400 text-sm hover:bg-red-500/20">
                      <XCircle size={14} /> בטל
                    </button>
                  </div>
                )}
                {isDriver && a.status === 'scheduled' && (
                  <button onClick={() => updateStatus(a.id, 'in_progress')}
                    className="px-3 py-1 rounded-lg bg-amber-500/10 text-amber-400 text-sm hover:bg-amber-500/20">
                    התחל איסוף
                  </button>
                )}
                {isDriver && a.status === 'in_progress' && (
                  <button onClick={() => updateStatus(a.id, 'completed')}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm hover:bg-emerald-500/20">
                    <CheckCircle2 size={14} /> סיים איסוף
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                {a.customer_name && (
                  <div className="flex items-center gap-2"><User size={14} className="text-muted-foreground" /><span>{a.customer_name}</span></div>
                )}
                {a.customer_phone && (
                  <div className="flex items-center gap-2"><Phone size={14} className="text-muted-foreground" />
                    <a href={`tel:${a.customer_phone}`} className="text-primary">{a.customer_phone}</a>
                  </div>
                )}
                {a.vehicle_plate && (
                  <div className="flex items-center gap-2"><Car size={14} className="text-muted-foreground" /><span>{a.vehicle_plate}</span></div>
                )}
                {a.driver_name && (
                  <div className="flex items-center gap-2"><User size={14} className="text-muted-foreground" /><span>נהג: {a.driver_name}</span></div>
                )}
                {a.scheduled_date && (
                  <div className="flex items-center gap-2"><Calendar size={14} className="text-muted-foreground" /><span>{a.scheduled_date}</span></div>
                )}
                {a.scheduled_time && (
                  <div className="flex items-center gap-2"><Clock size={14} className="text-muted-foreground" /><span>{a.scheduled_time}</span></div>
                )}
                {a.location && (
                  <div className="flex items-center gap-2 md:col-span-2"><MapPin size={14} className="text-muted-foreground" /><span>{a.location}</span></div>
                )}
              </div>
              {a.notes && <p className="mt-3 text-sm text-muted-foreground border-t pt-2">{a.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {!isDriver && (
        <button
          onClick={() => setShowAdd(true)}
          className="fixed bottom-24 left-6 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
          aria-label="הוסף תיאום"
        >
          <Plus size={24} />
        </button>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>תיאום איסוף חדש</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>שם לקוח</Label><Input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} /></div>
            <div><Label>טלפון לקוח</Label><Input dir="ltr" value={form.customer_phone} onChange={e => setForm({ ...form, customer_phone: e.target.value })} /></div>
            <div><Label>לוחית רכב</Label><Input dir="ltr" value={form.vehicle_plate} onChange={e => setForm({ ...form, vehicle_plate: e.target.value })} /></div>
            <div>
              <Label>נהג משובץ</Label>
              <Select value={form.driver_id} onValueChange={v => setForm({ ...form, driver_id: v })}>
                <SelectTrigger><SelectValue placeholder="בחר נהג" /></SelectTrigger>
                <SelectContent>
                  {drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>תאריך</Label><Input type="date" value={form.scheduled_date} onChange={e => setForm({ ...form, scheduled_date: e.target.value })} /></div>
              <div><Label>שעה</Label><Input type="time" value={form.scheduled_time} onChange={e => setForm({ ...form, scheduled_time: e.target.value })} /></div>
            </div>
            <div><Label>מיקום</Label><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
            <div><Label>הערות</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <Button onClick={createAppointment}>שמור תיאום</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
