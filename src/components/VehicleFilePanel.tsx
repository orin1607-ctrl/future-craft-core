import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Printer, FileDown, Send, Search, Wrench, AlertTriangle, Car, FileText, RefreshCw, Fuel, Phone, MessageSquare, Package, DollarSign, Bell } from 'lucide-react';

type EventType =
  | 'fault' | 'defect' | 'accident' | 'handover' | 'service' | 'expense'
  | 'document' | 'inspection' | 'alert' | 'fuel' | 'call' | 'note' | 'part' | 'order';

const typeConfig: Record<EventType, { label: string; icon: any; cls: string }> = {
  fault:    { label: 'תקלה',        icon: Wrench,         cls: 'bg-warning/10 text-warning' },
  defect:   { label: 'ליקוי',        icon: AlertTriangle,  cls: 'bg-warning/10 text-warning' },
  accident: { label: 'תאונה',        icon: AlertTriangle,  cls: 'bg-destructive/10 text-destructive' },
  handover: { label: 'החלפת רכב',    icon: RefreshCw,      cls: 'bg-info/10 text-info' },
  service:  { label: 'טיפול',        icon: Car,            cls: 'bg-primary/10 text-primary' },
  expense:  { label: 'הוצאה',        icon: DollarSign,     cls: 'bg-accent/10 text-accent-foreground' },
  document: { label: 'מסמך',         icon: FileText,       cls: 'bg-muted text-foreground' },
  inspection:{ label: 'ביקורת',      icon: Car,            cls: 'bg-info/10 text-info' },
  alert:    { label: 'התראה',        icon: Bell,           cls: 'bg-warning/10 text-warning' },
  fuel:     { label: 'תדלוק',        icon: Fuel,           cls: 'bg-info/10 text-info' },
  call:     { label: 'שיחה',         icon: Phone,          cls: 'bg-primary/10 text-primary' },
  note:     { label: 'הערה',         icon: MessageSquare,  cls: 'bg-muted text-foreground' },
  part:     { label: 'החלפת חלק',    icon: Package,        cls: 'bg-primary/10 text-primary' },
  order:    { label: 'הזמנה',        icon: Package,        cls: 'bg-primary/10 text-primary' },
};

interface Ev {
  id: string; type: EventType; date: string; title: string; description: string;
  driver: string; vendor: string; status: string; amount: number | null; meta?: string;
}

interface VehicleProp {
  id: string;
  license_plate: string;
  internal_number?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  vehicle_type?: string | null;
  fuel_type?: string | null;
  company_name?: string | null;
  branch?: string | null;
  assigned_driver_id?: string | null;
}

export default function VehicleFilePanel({ vehicle }: { vehicle: VehicleProp }) {
  const { user } = useAuth();
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<EventType | ''>('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDriver, setFilterDriver] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [sending, setSending] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const plate = vehicle.license_plate;

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [vehicle.id]);

  async function load() {
    setLoading(true);
    const eq = (q: any) => q.eq('vehicle_plate', plate);
    const [faults, accidents, handovers, services, expenses, tasks, inspections, docs, alerts] = await Promise.all([
      eq(supabase.from('faults').select('*')),
      eq(supabase.from('accidents').select('*')),
      eq(supabase.from('vehicle_handovers').select('*')),
      eq(supabase.from('service_orders').select('*')),
      eq(supabase.from('expenses').select('*')),
      eq(supabase.from('vehicle_tasks').select('*')),
      eq(supabase.from('vehicle_inspections').select('*')),
      eq(supabase.from('document_metadata').select('*')),
      // alerts have no plate; filter by description text containing plate
      supabase.from('custom_alerts').select('*').ilike('description', `%${plate}%`),
    ]);

    const all: Ev[] = [];
    (faults.data || []).forEach((f: any) => all.push({
      id: f.id, type: 'fault', date: f.date || f.created_at,
      title: f.fault_type || 'תקלה', description: f.description || '',
      driver: f.driver_name || '', vendor: '', status: f.status || '', amount: null, meta: f.urgency,
    }));
    (accidents.data || []).forEach((a: any) => all.push({
      id: a.id, type: 'accident', date: a.date || a.created_at,
      title: 'תאונה', description: a.description || '',
      driver: a.driver_name || '', vendor: '', status: a.status || '', amount: a.estimated_cost, meta: a.location,
    }));
    (handovers.data || []).forEach((h: any) => all.push({
      id: h.id, type: 'handover', date: h.date_time || h.created_at,
      title: h.action_type === 'return' ? 'החזרת רכב' : 'איסוף רכב',
      description: `${h.giving_driver_name || ''} → ${h.receiving_driver_name || ''}`,
      driver: h.giving_driver_name || '', vendor: '', status: '', amount: null, meta: h.location_name,
    }));
    (services.data || []).forEach((s: any) => {
      const cat = (s.service_category || '').toLowerCase();
      let t: EventType = 'service';
      if (cat.includes('דלק') || cat.includes('תדלוק')) t = 'fuel';
      else if (cat.includes('שיחה')) t = 'call';
      else if (cat.includes('הערה')) t = 'note';
      else if (cat.includes('חלק')) t = 'part';
      else if (cat.includes('הזמנה')) t = 'order';
      all.push({
        id: s.id, type: t, date: s.date_time || s.service_date || s.created_at,
        title: s.service_category || 'טיפול', description: s.description || '',
        driver: s.driver_name || '', vendor: s.vendor_name || '', status: s.treatment_status || '',
        amount: null, meta: s.reference_number,
      });
    });
    (expenses.data || []).forEach((e: any) => {
      const cat = (e.category || '').toLowerCase();
      const t: EventType = cat.includes('דלק') || cat.includes('תדלוק') ? 'fuel' : 'expense';
      all.push({
        id: e.id, type: t, date: e.date || e.created_at,
        title: e.category || 'הוצאה', description: e.notes || '',
        driver: e.driver_name || '', vendor: e.vendor || '', status: '',
        amount: e.amount, meta: e.invoice_number,
      });
    });
    (tasks.data || []).forEach((t: any) => all.push({
      id: t.id, type: 'defect', date: t.created_at,
      title: t.title || 'ליקוי', description: t.description || '',
      driver: '', vendor: t.resolved_by_name || '', status: t.status || '', amount: null,
    }));
    (inspections.data || []).forEach((i: any) => all.push({
      id: i.id, type: 'inspection', date: i.inspection_date || i.created_at,
      title: i.inspection_type === 'pre_trip' ? 'בדיקה לפני נסיעה' : 'ביקורת תקופתית',
      description: i.notes || '', driver: i.inspector_name || '', vendor: '',
      status: i.overall_status || '', amount: null,
    }));
    (docs.data || []).forEach((d: any) => all.push({
      id: d.id, type: 'document', date: d.created_at,
      title: d.original_name || d.category || 'מסמך', description: d.category || '',
      driver: d.driver_name || '', vendor: '', status: '', amount: null,
    }));
    (alerts.data || []).forEach((a: any) => all.push({
      id: a.id, type: 'alert', date: a.alert_date || a.created_at,
      title: a.title || 'התראה', description: a.description || '',
      driver: '', vendor: '', status: a.is_active ? 'פעיל' : '', amount: null, meta: a.alert_type,
    }));

    all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setEvents(all);
    setLoading(false);
  }

  const drivers = useMemo(() => Array.from(new Set(events.map(e => e.driver).filter(Boolean))), [events]);
  const statuses = useMemo(() => Array.from(new Set(events.map(e => e.status).filter(Boolean))), [events]);

  const filtered = events.filter(e => {
    if (filterType && e.type !== filterType) return false;
    if (filterStatus && e.status !== filterStatus) return false;
    if (filterDriver && e.driver !== filterDriver) return false;
    if (fromDate && new Date(e.date) < new Date(fromDate)) return false;
    if (toDate && new Date(e.date) > new Date(toDate + 'T23:59:59')) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!(e.title + e.description + e.driver + e.vendor).toLowerCase().includes(s)) return false;
    }
    return true;
  });

  function buildReportHtml(): string {
    const rows = filtered.map(e => `
      <tr>
        <td>${new Date(e.date).toLocaleDateString('he-IL')}</td>
        <td>${typeConfig[e.type].label}</td>
        <td>${escapeHtml(e.title)}</td>
        <td>${escapeHtml(e.description)}</td>
        <td>${escapeHtml(e.driver)}</td>
        <td>${escapeHtml(e.vendor)}</td>
        <td>${escapeHtml(e.status)}</td>
        <td>${e.amount != null ? '₪' + e.amount.toLocaleString() : ''}</td>
      </tr>`).join('');
    return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><title>תיק רכב ${plate}</title>
      <style>
        body{font-family:Arial,sans-serif;direction:rtl;padding:24px;color:#1a1a1a;background:#fff}
        h1{color:#2563eb;margin:0 0 8px}
        .meta{color:#64748b;margin-bottom:16px;font-size:14px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#f1f5f9;color:#475569;padding:8px;border:1px solid #e2e8f0;text-align:right}
        td{padding:8px;border:1px solid #e2e8f0;vertical-align:top}
      </style></head><body>
      <h1>תיק רכב / היסטוריית רכב</h1>
      <div class="meta">
        <strong>רכב:</strong> ${escapeHtml(plate)} ${vehicle.internal_number ? ' • מס׳ פנימי ' + escapeHtml(vehicle.internal_number) : ''}<br/>
        ${vehicle.manufacturer ? escapeHtml(vehicle.manufacturer) + ' ' + escapeHtml(vehicle.model || '') + '<br/>' : ''}
        ${vehicle.company_name ? '<strong>חברה:</strong> ' + escapeHtml(vehicle.company_name) + '<br/>' : ''}
        <strong>הופק:</strong> ${new Date().toLocaleString('he-IL')} • ${filtered.length} אירועים
      </div>
      <table><thead><tr>
        <th>תאריך</th><th>סוג</th><th>כותרת</th><th>תיאור</th><th>נהג</th><th>ספק</th><th>סטטוס</th><th>סכום</th>
      </tr></thead><tbody>${rows}</tbody></table></body></html>`;
  }

  function handlePrint() {
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { toast.error('חסום פופ-אפ'); return; }
    w.document.write(buildReportHtml());
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  async function handleSendEmail() {
    if (!emailTo) { toast.error('הזן כתובת מייל'); return; }
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('send-vehicle-file-report', {
        body: { to: emailTo, subject: `תיק רכב ${plate}`, html: buildReportHtml() },
      });
      if (error) throw error;
      toast.success('הדוח נשלח');
      setEmailOpen(false); setEmailTo('');
    } catch (e: any) {
      toast.error('שגיאה בשליחה: ' + (e.message || e));
    } finally { setSending(false); }
  }

  return (
    <div className="card-elevated mb-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-bold flex items-center gap-2">📁 תיק רכב / היסטוריית רכב <span className="text-sm text-muted-foreground font-normal">({filtered.length})</span></h2>
        <div className="flex gap-2">
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-1 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold">
            <Plus size={16} /> אירוע ידני
          </button>
          <button onClick={handlePrint} className="p-2 rounded-xl bg-muted text-foreground" title="הדפסה"><Printer size={18} /></button>
          <button onClick={handlePrint} className="p-2 rounded-xl bg-muted text-foreground" title="ייצוא PDF"><FileDown size={18} /></button>
          <button onClick={() => setEmailOpen(true)} className="p-2 rounded-xl bg-muted text-foreground" title="שליחת דוח"><Send size={18} /></button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2 mb-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..."
            className="w-full pr-9 p-2.5 rounded-xl border-2 border-input bg-background text-sm" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <select value={filterType} onChange={e => setFilterType(e.target.value as EventType | '')}
            className="p-2 rounded-xl border-2 border-input bg-background text-sm">
            <option value="">כל הסוגים</option>
            {(Object.entries(typeConfig) as [EventType, any][]).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="p-2 rounded-xl border-2 border-input bg-background text-sm">
            <option value="">כל הסטטוסים</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterDriver} onChange={e => setFilterDriver(e.target.value)}
            className="p-2 rounded-xl border-2 border-input bg-background text-sm">
            <option value="">כל הנהגים</option>
            {drivers.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="flex gap-1">
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="flex-1 p-2 rounded-xl border-2 border-input bg-background text-xs" title="מתאריך" />
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="flex-1 p-2 rounded-xl border-2 border-input bg-background text-xs" title="עד תאריך" />
          </div>
        </div>
      </div>

      {/* List */}
      <div ref={printRef} className="space-y-2 max-h-[600px] overflow-y-auto">
        {loading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">אין אירועים</p>
        ) : filtered.map(ev => {
          const cfg = typeConfig[ev.type];
          const Icon = cfg.icon;
          return (
            <div key={ev.id} className="flex items-start gap-3 p-3 rounded-xl border border-border hover:border-primary/30 transition-colors">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.cls}`}>
                <Icon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${cfg.cls}`}>{cfg.label}</span>
                    <p className="font-bold">{ev.title}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(ev.date).toLocaleDateString('he-IL')}</span>
                </div>
                {ev.description && <p className="text-sm text-muted-foreground mt-1">{ev.description}</p>}
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  {ev.driver && <span>👤 {ev.driver}</span>}
                  {ev.vendor && <span>🏢 {ev.vendor}</span>}
                  {ev.amount != null && <span className="font-bold text-primary">₪{ev.amount.toLocaleString()}</span>}
                  {ev.status && <span className="status-badge status-active text-xs">{ev.status}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Manual Event */}
      <ManualEventDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        vehicle={vehicle}
        onSaved={() => { setAddOpen(false); load(); }}
        userId={user?.id || ''}
      />

      {/* Email Dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>שליחת דוח במייל</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)}
              placeholder="כתובת מייל" className="w-full p-3 rounded-xl border-2 border-input bg-background" />
            <p className="text-sm text-muted-foreground">הדוח יישלח כעמוד HTML המוכן להדפסה/שמירה כ-PDF.</p>
            <button onClick={handleSendEmail} disabled={sending}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50">
              {sending ? 'שולח...' : 'שלח'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===================== Manual Event Dialog =====================

const manualTypes = [
  { value: 'service',  label: 'טיפול' },
  { value: 'note',     label: 'הערה' },
  { value: 'call',     label: 'שיחה' },
  { value: 'accident', label: 'תאונה' },
  { value: 'part',     label: 'החלפת חלק' },
  { value: 'expense',  label: 'הוצאה' },
  { value: 'fuel',     label: 'תדלוק' },
  { value: 'document', label: 'מסמך' },
  { value: 'order',    label: 'הזמנה' },
  { value: 'other',    label: 'אחר' },
];

function ManualEventDialog({ open, onClose, vehicle, onSaved, userId }: {
  open: boolean;
  onClose: () => void;
  vehicle: VehicleProp;
  onSaved: () => void;
  userId: string;
}) {
  const [type, setType] = useState('service');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [driver, setDriver] = useState('');
  const [vendor, setVendor] = useState('');
  const [status, setStatus] = useState('');
  const [amount, setAmount] = useState('');
  const [expiry, setExpiry] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [createAlert, setCreateAlert] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setType('service'); setDate(new Date().toISOString().slice(0, 10));
    setTitle(''); setDescription(''); setDriver(''); setVendor('');
    setStatus(''); setAmount(''); setExpiry(''); setNotes(''); setFile(null); setCreateAlert(false);
  }

  async function uploadFile(): Promise<string | null> {
    if (!file) return null;
    const path = `${userId}/vehicle-file/${vehicle.id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('documents').upload(path, file, { upsert: false });
    if (error) { toast.error('שגיאה בהעלאת קובץ'); return null; }
    return path;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const fileUrl = await uploadFile();
      const common = {
        vehicle_plate: vehicle.license_plate,
        company_name: vehicle.company_name,
        created_by: userId,
        driver_name: driver || null,
      };

      // Route by type
      if (type === 'expense' || type === 'fuel' || type === 'part') {
        const category = type === 'fuel' ? 'תדלוק' : type === 'part' ? 'החלפת חלק' : (title || 'הוצאה');
        await supabase.from('expenses').insert({
          ...common, category, vendor: vendor || null,
          amount: amount ? parseFloat(amount) : null,
          notes: [description, notes].filter(Boolean).join('\n') || null,
          date, image_url: fileUrl,
        } as any);
      } else if (type === 'accident') {
        await supabase.from('accidents').insert({
          ...common, date, description: description || title,
          location: notes || null, estimated_cost: amount ? parseFloat(amount) : null,
          status: status || 'open',
          images: fileUrl ? JSON.stringify([fileUrl]) : null,
        } as any);
      } else if (type === 'document') {
        if (!fileUrl) { toast.error('יש לצרף קובץ'); setSaving(false); return; }
        await supabase.from('document_metadata').insert({
          file_path: fileUrl, original_name: file?.name || title || 'מסמך',
          category: title || 'מסמך רכב', vehicle_plate: vehicle.license_plate,
          driver_name: driver || null, company_name: vehicle.company_name,
          manufacturer: vehicle.manufacturer, model: vehicle.model,
          uploaded_by: userId,
        } as any);
      } else {
        // service/note/call/order/other → service_orders
        const catMap: Record<string, string> = {
          service: 'טיפול', note: 'הערה', call: 'שיחה', order: 'הזמנה', other: 'אחר',
        };
        await supabase.from('service_orders').insert({
          ...common, vehicle_id: vehicle.id,
          service_category: catMap[type] || title || 'אירוע',
          description: description || title || null,
          vendor_name: vendor || null,
          treatment_status: status || 'new',
          date_time: new Date(date).toISOString(),
          service_date: date,
          notes: notes || null,
          manufacturer: vehicle.manufacturer, model: vehicle.model,
          vehicle_type: vehicle.vehicle_type,
          images: fileUrl ? JSON.stringify([fileUrl]) : null,
          ordering_user: userId,
        } as any);
      }

      // Also save document if file attached & not document type
      if (fileUrl && type !== 'document') {
        await supabase.from('document_metadata').insert({
          file_path: fileUrl, original_name: file?.name || 'קובץ',
          category: typeLabel(type), vehicle_plate: vehicle.license_plate,
          driver_name: driver || null, company_name: vehicle.company_name,
          manufacturer: vehicle.manufacturer, model: vehicle.model,
          uploaded_by: userId,
        } as any);
      }

      // Optional alert
      if (createAlert && expiry) {
        await supabase.from('custom_alerts').insert({
          user_id: userId, company_name: vehicle.company_name,
          title: `${typeLabel(type)} - ${vehicle.license_plate}${title ? ' - ' + title : ''}`,
          description: `${vehicle.license_plate}${vehicle.internal_number ? ' (' + vehicle.internal_number + ')' : ''} - ${description || title}`,
          alert_date: expiry, alert_type: 'vehicle', is_active: true,
        } as any);
      }

      toast.success('אירוע נשמר');
      reset();
      onSaved();
    } catch (e: any) {
      toast.error('שגיאה: ' + (e.message || e));
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>הוספת אירוע ידני</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold block mb-1">סוג אירוע</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="w-full p-2.5 rounded-xl border-2 border-input bg-background">
                {manualTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold block mb-1">תאריך אירוע</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full p-2.5 rounded-xl border-2 border-input bg-background" />
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-muted/30 text-xs text-muted-foreground">
            רכב: <strong>{vehicle.license_plate}</strong>
            {vehicle.internal_number && <> • מס׳ פנימי <strong>{vehicle.internal_number}</strong></>}
          </div>

          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="כותרת"
            className="w-full p-2.5 rounded-xl border-2 border-input bg-background" />
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="תיאור"
            className="w-full p-2.5 rounded-xl border-2 border-input bg-background" rows={2} />

          <div className="grid grid-cols-2 gap-2">
            <input value={driver} onChange={e => setDriver(e.target.value)} placeholder="נהג"
              className="p-2.5 rounded-xl border-2 border-input bg-background" />
            <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="ספק"
              className="p-2.5 rounded-xl border-2 border-input bg-background" />
            <input value={status} onChange={e => setStatus(e.target.value)} placeholder="סטטוס"
              className="p-2.5 rounded-xl border-2 border-input bg-background" />
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="סכום ₪"
              className="p-2.5 rounded-xl border-2 border-input bg-background" />
          </div>

          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="הערות"
            className="w-full p-2.5 rounded-xl border-2 border-input bg-background" rows={2} />

          <div>
            <label className="text-xs font-bold block mb-1">העלאת מסמך / תמונה</label>
            <input type="file" onChange={e => setFile(e.target.files?.[0] || null)}
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              className="w-full p-2 rounded-xl border-2 border-input bg-background text-sm" />
          </div>

          <div className="space-y-2 p-3 rounded-xl bg-muted/30">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={createAlert} onChange={e => setCreateAlert(e.target.checked)} />
              <span className="text-sm font-medium">צור התראה</span>
            </label>
            {createAlert && (
              <div>
                <label className="text-xs block mb-1">תאריך תוקף / תאריך התראה</label>
                <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)}
                  className="w-full p-2 rounded-xl border-2 border-input bg-background" />
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={() => { reset(); onClose(); }} className="flex-1 py-3 rounded-xl border-2 border-border font-bold">
              ביטול
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50">
              {saving ? 'שומר...' : 'שמור אירוע'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function typeLabel(t: string): string {
  const m: Record<string, string> = {
    service: 'טיפול', note: 'הערה', call: 'שיחה', accident: 'תאונה',
    part: 'החלפת חלק', expense: 'הוצאה', fuel: 'תדלוק', document: 'מסמך',
    order: 'הזמנה', other: 'אחר',
  };
  return m[t] || t;
}

function escapeHtml(s: string): string {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
