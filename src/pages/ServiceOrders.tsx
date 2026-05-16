import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase, Plus, Search, ArrowRight, Clock, CheckCircle, MessageSquareReply,
  Filter, Car, User, Building2, Calendar, Truck, Trash2, Edit, History, Download,
} from 'lucide-react';
import { exportToCsv } from '@/utils/exportCsv';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ImageUpload from '@/components/ImageUpload';
import ServiceOrderChat from '@/components/service-orders/ServiceOrderChat';
import ServiceOrderReferral from '@/components/service-orders/ServiceOrderReferral';

interface ServiceRow {
  id: string;
  service_category: string;
  description: string;
  vehicle_plate: string;
  driver_name: string;
  driver_phone: string;
  vendor_name: string;
  vendor_phone: string;
  service_date: string;
  service_time: string;
  treatment_status: string;
  odometer: number;
  notes: string;
  created_at: string;
  created_by: string;
  company_name: string;
  manager_approval: string;
  ordering_user: string;
  reference_number: string;
  urgency: string;
  towing_requested: boolean;
  towing_address: string;
  towing_time: string;
  towing_contact: string;
  images: string;
}

const STATUS_CONFIG: Record<string, { text: string; cls: string }> = {
  pending_approval: { text: 'ממתין לאישור', cls: 'status-pending' },
  approved: { text: 'אושר', cls: 'status-active' },
  new: { text: 'חדש', cls: 'status-new' },
  in_progress: { text: 'בטיפול', cls: 'status-pending' },
  completed: { text: 'הושלם', cls: 'status-active' },
  rejected: { text: 'נדחה', cls: 'status-inactive' },
  cancelled: { text: 'בוטל', cls: 'status-inactive' },
};

const SERVICE_CATEGORIES = [
  'טיפול תקופתי', 'תיקון תקלה', 'טסט', 'פחחות וצבע',
  'בדיקה כללית', 'תיקון תאונה', 'אחר',
];

const URGENCY_LABELS: Record<string, string> = { normal: 'רגיל', urgent: 'דחוף' };
const URGENCY_COLORS: Record<string, string> = { normal: 'bg-muted text-muted-foreground', urgent: 'bg-destructive/10 text-destructive' };

export default function ServiceOrders() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const [orders, setOrders] = useState<ServiceRow[]>([]);
  const [vehiclesByPlate, setVehiclesByPlate] = useState<Record<string, { id: string; internal_number: string }>>({});
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editOrder, setEditOrder] = useState<ServiceRow | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterName, setFilterName] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterVehicle, setFilterVehicle] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ServiceRow | null>(null);
  const [replyDialog, setReplyDialog] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState('');

  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';

  const loadOrders = async () => {
    const [oRes, vRes] = await Promise.all([
      applyCompanyScope(supabase.from('service_orders').select('*').order('created_at', { ascending: false }), companyFilter),
      applyCompanyScope(supabase.from('vehicles').select('id, license_plate, internal_number'), companyFilter),
    ]);
    if (oRes.data) setOrders(oRes.data as unknown as ServiceRow[]);
    if (vRes.data) {
      const map: Record<string, { id: string; internal_number: string }> = {};
      (vRes.data as any[]).forEach(v => { if (v.license_plate) map[v.license_plate] = { id: v.id, internal_number: v.internal_number || '' }; });
      setVehiclesByPlate(map);
    }
  };

  useEffect(() => {
    loadOrders();
    // Load WhatsApp config
    if (user?.company_name) {
      supabase.from('company_settings').select('whatsapp_phone').eq('company_name', user.company_name).maybeSingle()
        .then(({ data }) => { if (data?.whatsapp_phone) setWhatsappPhone(data.whatsapp_phone); });
    }
  }, [companyFilter]);

  const filtered = orders.filter(o => {
    const internal = vehiclesByPlate[o.vehicle_plate]?.internal_number || '';
    const matchSearch = !search ||
      o.vehicle_plate?.includes(search) || (internal && internal === search.trim()) || o.service_category?.includes(search) ||
      o.driver_name?.includes(search) || o.company_name?.includes(search) ||
      o.ordering_user?.includes(search) || o.reference_number?.includes(search);
    const matchStatus = !filterStatus || o.treatment_status === filterStatus;
    const matchName = !filterName || o.driver_name?.includes(filterName) || o.ordering_user?.includes(filterName);
    const matchCompany = !filterCompany || o.company_name?.includes(filterCompany);
    const matchVehicle = !filterVehicle || o.vehicle_plate?.includes(filterVehicle) || (internal && internal === filterVehicle.trim());
    return matchSearch && matchStatus && matchName && matchCompany && matchVehicle;
  });

  const activeFilterCount = [filterName, filterCompany, filterVehicle].filter(Boolean).length;

  // Dashboard stats
  const today = new Date().toISOString().split('T')[0];
  const stats = {
    newToday: orders.filter(o => o.created_at?.startsWith(today)).length,
    pending: orders.filter(o => o.treatment_status === 'pending_approval' || o.treatment_status === 'new').length,
    withTowing: orders.filter(o => o.towing_requested).length,
    urgent: orders.filter(o => o.urgency === 'urgent' && o.treatment_status !== 'completed' && o.treatment_status !== 'cancelled').length,
  };

  const handleReply = async () => {
    if (!selectedOrder) return;
    setSendingReply(true);
    const updates: Record<string, any> = {};
    if (replyText) updates.manager_approval = replyText;
    if (replyStatus) updates.treatment_status = replyStatus;

    const { error } = await supabase.from('service_orders').update(updates).eq('id', selectedOrder.id);

    if (!error) {
      // Log to system_logs
      await supabase.from('system_logs').insert({
        user_id: user?.id, user_name: user?.full_name || '',
        company_name: selectedOrder.company_name,
        action_type: 'update', entity_type: 'service_order', entity_id: selectedOrder.id,
        vehicle_plate: selectedOrder.vehicle_plate,
        old_status: selectedOrder.treatment_status, new_status: replyStatus || selectedOrder.treatment_status,
        details: replyText ? `מענה: ${replyText}` : `סטטוס שונה ל: ${STATUS_CONFIG[replyStatus]?.text || replyStatus}`,
      });

      // Notify ordering user
      if (selectedOrder.ordering_user) {
        const { data: profiles } = await supabase.from('profiles').select('id').eq('full_name', selectedOrder.ordering_user).limit(1);
        if (profiles?.[0]) {
          await supabase.from('driver_notifications').insert({
            user_id: profiles[0].id, type: 'service',
            title: '📋 עדכון שירות ותחזוקה',
            message: `${selectedOrder.service_category} - רכב ${selectedOrder.vehicle_plate}: ${replyText || STATUS_CONFIG[replyStatus]?.text || ''}`,
            link: '/service-orders',
          });
        }
      }
    }

    setSendingReply(false);
    if (error) { toast.error('שגיאה'); }
    else {
      toast.success('המענה נשלח בהצלחה');
      setReplyDialog(false); setReplyText(''); setReplyStatus('');
      setSelectedOrder(prev => prev ? { ...prev, treatment_status: replyStatus || prev.treatment_status, manager_approval: replyText || prev.manager_approval } : null);
      loadOrders();
    }
  };

  const handleDelete = async (order: ServiceRow) => {
    if (!confirm('למחוק הזמנה זו?')) return;
    const { error } = await supabase.from('service_orders').delete().eq('id', order.id);
    if (error) toast.error('שגיאה במחיקה');
    else { toast.success('ההזמנה נמחקה'); setSelectedOrder(null); loadOrders(); }
  };

  if (showForm || editOrder) {
    return <ServiceOrderForm onDone={() => { setShowForm(false); setEditOrder(null); loadOrders(); }} user={user} editData={editOrder} />;
  }

  if (selectedOrder) {
    const o = selectedOrder;
    const st = STATUS_CONFIG[o.treatment_status] || STATUS_CONFIG.new;
    const canEdit = o.created_by === user?.id && o.treatment_status === 'pending_approval';
    const canDelete = canEdit || user?.role === 'super_admin';

    return (
      <div className="animate-fade-in">
        <button onClick={() => setSelectedOrder(null)} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]">
          <ArrowRight size={20} /> חזרה
        </button>
        <div className="card-elevated space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">{o.service_category}</h1>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 rounded-lg text-xs font-bold ${URGENCY_COLORS[o.urgency] || URGENCY_COLORS.normal}`}>
                {URGENCY_LABELS[o.urgency] || 'רגיל'}
              </span>
              <span className={`status-badge ${st.cls}`}>{st.text}</span>
            </div>
          </div>

          {o.description && <p className="text-muted-foreground">{o.description}</p>}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoBox label="רכב" value={o.vehicle_plate} />
            <InfoBox label="נהג" value={o.driver_name} />
            {o.company_name && <InfoBox label="חברה" value={o.company_name} />}
            {o.ordering_user && <InfoBox label="מזמין" value={o.ordering_user} />}
            {o.service_date && <InfoBox label="תאריך" value={new Date(o.service_date).toLocaleDateString('he-IL')} />}
            {o.service_time && <InfoBox label="שעה" value={o.service_time} />}
            {o.odometer > 0 && <InfoBox label='ק"מ' value={o.odometer.toLocaleString()} />}
            {o.reference_number && <InfoBox label="אסמכתא" value={o.reference_number} />}
            {o.vendor_name && <InfoBox label="ספק" value={o.vendor_name} />}
            {o.vendor_phone && <InfoBox label="טלפון ספק" value={o.vendor_phone} />}
          </div>

          {o.towing_requested && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 space-y-1">
              <p className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-2"><Truck size={18} /> שינוע מבוקש</p>
              {o.towing_address && <p className="text-sm">כתובת: {o.towing_address}</p>}
              {o.towing_time && <p className="text-sm">שעה: {o.towing_time}</p>}
              {o.towing_contact && <p className="text-sm">איש קשר: {o.towing_contact}</p>}
            </div>
          )}

          {o.images && (
            <div className="space-y-2">
              <p className="text-sm font-bold">תמונות מצורפות</p>
              <div className="flex gap-2 flex-wrap">
                {o.images.split(',').filter(Boolean).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt="" className="w-20 h-20 rounded-xl object-cover border-2 border-border" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {o.notes && <p className="p-3 bg-muted rounded-xl text-muted-foreground text-sm">{o.notes}</p>}

          {o.manager_approval && (
            <div className="p-3 bg-primary/10 rounded-xl">
              <p className="text-sm text-muted-foreground">מענה מנהל</p>
              <p className="font-bold text-primary">{o.manager_approval}</p>
            </div>
          )}

          {/* Supplier work order */}
          <ServiceOrderReferral serviceOrderId={o.id} companyName={o.company_name} isManager={isManager} />

          {/* Internal chat */}
          <ServiceOrderChat orderId={o.id} companyName={o.company_name} />

          <div className="flex gap-2 flex-wrap">
            {isManager && (
              <button onClick={() => { setReplyDialog(true); setReplyStatus(o.treatment_status || 'new'); }}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 min-h-[48px]">
                <MessageSquareReply size={18} /> הגב / שנה סטטוס
              </button>
            )}
            {canEdit && (
              <button onClick={() => setEditOrder(o)}
                className="py-3 px-5 rounded-xl bg-muted text-muted-foreground font-bold flex items-center gap-2 min-h-[48px]">
                <Edit size={18} /> ערוך
              </button>
            )}
            {canDelete && (
              <button onClick={() => handleDelete(o)}
                className="py-3 px-5 rounded-xl bg-destructive/10 text-destructive font-bold flex items-center gap-2 min-h-[48px]">
                <Trash2 size={18} /> מחק
              </button>
            )}
          </div>

          {/* WhatsApp button */}
          {whatsappPhone && (
            <a href={`https://wa.me/${whatsappPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`שלום, לגבי שירותים ותחזוקה ${o.service_category} - רכב ${o.vehicle_plate}`)}`}
              target="_blank" rel="noreferrer"
              className="block w-full py-3 rounded-xl bg-[#25D366] text-white font-bold text-center text-lg">
              💬 וואטסאפ למוקד
            </a>
          )}
        </div>

        {/* Reply dialog */}
        <Dialog open={replyDialog} onOpenChange={setReplyDialog}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader><DialogTitle>מענה / שינוי סטטוס</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-xl text-sm">
                <p className="font-bold">{selectedOrder?.service_category} - {selectedOrder?.vehicle_plate}</p>
                {selectedOrder?.ordering_user && <p className="text-muted-foreground">מזמין: {selectedOrder.ordering_user}</p>}
              </div>
              <div>
                <label className="block font-medium mb-2">סטטוס</label>
                <select value={replyStatus} onChange={e => setReplyStatus(e.target.value)}
                  className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none">
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.text}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-2">תגובה / מענה</label>
                <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={3}
                  className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm resize-none focus:border-primary focus:outline-none"
                  placeholder="כתוב מענה..." />
              </div>
              <button onClick={handleReply} disabled={sendingReply || (!replyText && !replyStatus)}
                className="w-full py-3 rounded-xl text-lg font-bold bg-primary text-primary-foreground disabled:opacity-50">
                {sendingReply ? 'שולח...' : '📨 שלח מענה'}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-header mb-0 flex items-center gap-3"><Briefcase size={28} /> שירותים ותחזוקה</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => exportToCsv('service_orders', [
            { key: 'vehicle_plate', label: 'מספר רכב' },
            { key: 'driver_name', label: 'נהג' },
            { key: 'service_category', label: 'קטגוריה' },
            { key: 'description', label: 'תיאור' },
            { key: 'vendor_name', label: 'ספק' },
            { key: 'treatment_status', label: 'סטטוס' },
            { key: 'urgency', label: 'דחיפות' },
            { key: 'created_at', label: 'תאריך' },
          ], filtered)} className="flex items-center gap-1 px-3 py-2 rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 text-sm font-medium min-h-[48px]">
            <Download size={18} /> ייצוא
          </button>
          <button onClick={() => navigate('/service-order-history')}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-muted text-foreground font-bold text-sm min-h-[48px]">
            <History size={18} /> היסטוריה
          </button>
        </div>
      </div>

      {/* Dashboard stats - managers only */}
      {isManager && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatCard label="חדשות היום" value={stats.newToday} />
          <StatCard label="ממתינות" value={stats.pending} highlight={stats.pending > 0} />
          <StatCard label="עם שינוע" value={stats.withTowing} />
          <StatCard label="דחופות" value={stats.urgent} highlight={stats.urgent > 0} />
        </div>
      )}

      {/* Search */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..."
            className="w-full pr-12 p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none" />
        </div>
        {isManager && (
          <button onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`relative flex items-center gap-1 px-4 py-3 rounded-xl border-2 font-bold transition-colors ${showAdvancedFilters ? 'border-primary bg-primary/10 text-primary' : 'border-input text-foreground'}`}>
            <Filter size={20} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">{activeFilterCount}</span>
            )}
          </button>
        )}
      </div>

      {/* Advanced filters */}
      {isManager && showAdvancedFilters && (
        <div className="card-elevated mb-4 space-y-3">
          <h3 className="font-bold text-sm text-muted-foreground">סינון מתקדם</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">שם</label>
              <input value={filterName} onChange={e => setFilterName(e.target.value)}
                className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none" placeholder="נהג / מזמין..." />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">חברה</label>
              <input value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
                className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none" placeholder="חברה..." />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">מספר רכב</label>
              <input value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)}
                className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none" placeholder="לוחית..." />
            </div>
          </div>
          {activeFilterCount > 0 && (
            <button onClick={() => { setFilterName(''); setFilterCompany(''); setFilterVehicle(''); }}
              className="text-sm text-primary font-medium">✕ נקה סינון</button>
          )}
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        <button onClick={() => setFilterStatus('')}
          className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${!filterStatus ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          הכל ({orders.length})
        </button>
        {Object.entries(STATUS_CONFIG).map(([key, val]) => {
          const count = orders.filter(o => o.treatment_status === key).length;
          if (count === 0 && key !== 'pending_approval') return null;
          return (
            <button key={key} onClick={() => setFilterStatus(filterStatus === key ? '' : key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${filterStatus === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {val.text} ({count})
            </button>
          );
        })}
      </div>

      {/* Orders list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Briefcase size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-xl">אין קריאות שירות ותחזוקה</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(o => {
            const st = STATUS_CONFIG[o.treatment_status] || STATUS_CONFIG.new;
            return (
              <button key={o.id} onClick={() => setSelectedOrder(o)} className="card-elevated w-full text-right hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {o.treatment_status === 'completed' ? <CheckCircle size={24} className="text-primary" /> : <Clock size={24} className="text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-lg font-bold">{o.service_category}</p>
                      <div className="flex items-center gap-1.5">
                        {o.urgency === 'urgent' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-destructive/10 text-destructive">דחוף</span>}
                        <span className={`status-badge ${st.cls} text-xs`}>{st.text}</span>
                      </div>
                    </div>
                    {o.description && <p className="text-muted-foreground text-sm line-clamp-1">{o.description}</p>}
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Car size={12} /> {o.vehicle_plate}</span>
                      {o.driver_name && <span className="flex items-center gap-1"><User size={12} /> {o.driver_name}</span>}
                      {o.company_name && <span className="flex items-center gap-1"><Building2 size={12} /> {o.company_name}</span>}
                      {o.service_date && <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(o.service_date).toLocaleDateString('he-IL')}</span>}
                      {o.towing_requested && <span className="flex items-center gap-1 text-amber-600"><Truck size={12} /> שינוע</span>}
                    </div>
                    {o.manager_approval && <p className="text-xs text-primary mt-1 font-medium">✅ יש מענה מנהל</p>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Floating + button */}
      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-24 left-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-xl hover:shadow-2xl transition-all flex items-center justify-center hover:scale-110"
        title="הזמנה חדשה"
      >
        <Plus size={28} />
      </button>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 text-center ${highlight ? 'bg-destructive/10 border border-destructive/30' : 'bg-muted'}`}>
      <p className={`text-2xl font-bold ${highlight ? 'text-destructive' : 'text-foreground'}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}

/* ======================== Form ======================== */

function ServiceOrderForm({ onDone, user, editData }: { onDone: () => void; user: any; editData?: ServiceRow | null }) {
  const [serviceCategory, setServiceCategory] = useState(editData?.service_category || '');
  const [otherCategory, setOtherCategory] = useState('');
  const [description, setDescription] = useState(editData?.description || '');
  const [vehiclePlate, setVehiclePlate] = useState(editData?.vehicle_plate || '');
  const [driverName, setDriverName] = useState(editData?.driver_name || '');
  const [driverPhone, setDriverPhone] = useState(editData?.driver_phone || '');
  const [vendorName, setVendorName] = useState(editData?.vendor_name || '');
  const [vendorPhone, setVendorPhone] = useState(editData?.vendor_phone || '');
  const [serviceDate, setServiceDate] = useState(editData?.service_date || '');
  const [serviceTime, setServiceTime] = useState(editData?.service_time || '');
  const [odometer, setOdometer] = useState(editData?.odometer?.toString() || '');
  const [notes, setNotes] = useState(editData?.notes || '');
  const [urgency, setUrgency] = useState(editData?.urgency || 'normal');
  const [towingRequested, setTowingRequested] = useState(editData?.towing_requested || false);
  const [towingAddress, setTowingAddress] = useState(editData?.towing_address || '');
  const [towingTime, setTowingTime] = useState(editData?.towing_time || '');
  const [towingContact, setTowingContact] = useState(editData?.towing_contact || '');
  const [imageUrl, setImageUrl] = useState(editData?.images || '');
  const [loading, setLoading] = useState(false);

  const [dbVehicles, setDbVehicles] = useState<{ id: string; license_plate: string; manufacturer: string; model: string }[]>([]);
  const [dbDrivers, setDbDrivers] = useState<{ full_name: string; phone: string }[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from('vehicles').select('id, license_plate, manufacturer, model'),
      supabase.from('drivers').select('full_name, phone'),
    ]).then(([v, d]) => {
      if (v.data) setDbVehicles(v.data as any);
      if (d.data) setDbDrivers(d.data);
    });
  }, []);

  const handleDriverChange = (name: string) => {
    setDriverName(name);
    const driver = dbDrivers.find(d => d.full_name === name);
    if (driver) setDriverPhone(driver.phone || '');
  };

  const isValid = (serviceCategory || otherCategory) && vehiclePlate;
  const inputClass = "w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    const matchedVehicle = dbVehicles.find(v => v.license_plate === vehiclePlate);
    const payload: any = {
      service_category: serviceCategory === 'אחר' ? otherCategory || 'אחר' : serviceCategory,
      description, vehicle_plate: vehiclePlate,
      vehicle_id: matchedVehicle?.id || null,
      driver_name: driverName, driver_phone: driverPhone,
      vendor_name: vendorName, vendor_phone: vendorPhone,
      service_date: serviceDate || null, service_time: serviceTime,
      odometer: parseInt(odometer) || 0, notes,
      urgency, towing_requested: towingRequested,
      towing_address: towingAddress, towing_time: towingTime, towing_contact: towingContact,
      images: imageUrl,
      company_name: user?.company_name || '',
      treatment_status: 'pending_approval',
    };

    let error;
    if (editData) {
      ({ error } = await supabase.from('service_orders').update(payload).eq('id', editData.id));
    } else {
      ({ error } = await supabase.from('service_orders').insert({
        ...payload,
        created_by: user?.id,
        ordering_user: user?.full_name || '',
      }));
    }

    setLoading(false);
    if (error) { toast.error('שגיאה בשמירה'); console.error(error); }
    else {
      toast.success(editData ? 'ההזמנה עודכנה' : 'הזמנת השירות נשלחה – ממתינה לאישור');
      // Send email notification for new orders (or urgent updates)
      if (!editData) {
        const isUrgent = urgency === 'critical' || urgency === 'urgent';
        supabase.functions.invoke('notify-service-order-email', {
          body: {
            record: { ...payload, created_by: user?.id, ordering_user: user?.full_name || '' },
            type: isUrgent ? 'urgent_order' : 'new_order',
          },
        }).catch(err => console.error('Email notification error:', err));
      }
      onDone();
    }
  };

  return (
    <div className="animate-fade-in">
      <button onClick={onDone} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]">
        <ArrowRight size={20} /> חזרה
      </button>
      <h1 className="text-2xl font-bold mb-6">{editData ? 'עריכת קריאה' : 'קריאת שירות ותחזוקה חדשה'}</h1>
      <div className="space-y-5">
        {/* Category */}
        <div>
          <label className="block text-lg font-medium mb-2">סוג שירות *</label>
          <select value={serviceCategory} onChange={e => setServiceCategory(e.target.value)} className={inputClass}>
            <option value="">בחר...</option>
            {SERVICE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {serviceCategory === 'אחר' && (
            <input value={otherCategory} onChange={e => setOtherCategory(e.target.value)} placeholder="פרט סוג שירות..."
              className={`${inputClass} mt-2`} />
          )}
        </div>

        {/* Vehicle */}
        <div>
          <label className="block text-lg font-medium mb-2">רכב *</label>
          <select value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)} className={inputClass}>
            <option value="">בחר רכב...</option>
            {dbVehicles.map(v => <option key={v.license_plate} value={v.license_plate}>{v.license_plate} - {v.manufacturer} {v.model}</option>)}
          </select>
        </div>

        {/* Driver */}
        <div>
          <label className="block text-lg font-medium mb-2">נהג</label>
          <select value={driverName} onChange={e => handleDriverChange(e.target.value)} className={inputClass}>
            <option value="">בחר נהג...</option>
            {dbDrivers.map(d => <option key={d.full_name} value={d.full_name}>{d.full_name}</option>)}
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="block text-lg font-medium mb-2">תיאור הבעיה / שירות</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
            placeholder="פרט את הבעיה..." className={`${inputClass} resize-none`} />
        </div>

        {/* Images */}
        <div>
          <label className="block text-lg font-medium mb-2">תמונות</label>
          <ImageUpload label="צרף תמונה" imageUrl={imageUrl || null} onImageUploaded={(url) => setImageUrl(url || '')} folder="service-orders" />
        </div>

        {/* Date & Time */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-lg font-medium mb-2">תאריך מבוקש</label>
            <input type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-lg font-medium mb-2">שעה מועדפת</label>
            <input type="time" value={serviceTime} onChange={e => setServiceTime(e.target.value)} className={inputClass} />
          </div>
        </div>

        {/* Urgency */}
        <div>
          <label className="block text-lg font-medium mb-2">דחיפות</label>
          <div className="flex gap-3">
            {Object.entries(URGENCY_LABELS).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setUrgency(key)}
                className={`flex-1 py-3 rounded-xl text-lg font-medium transition-colors ${urgency === key
                  ? key === 'urgent' ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'}`}>
                {key === 'urgent' && '🚨 '}{label}
              </button>
            ))}
          </div>
        </div>

        {/* KM */}
        <div>
          <label className="block text-lg font-medium mb-2">קילומטראז׳</label>
          <input type="number" value={odometer} onChange={e => setOdometer(e.target.value)} placeholder="0" className={inputClass} />
        </div>

        {/* Towing */}
        <div className="rounded-xl border-2 border-border p-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={towingRequested} onChange={e => setTowingRequested(e.target.checked)} className="rounded w-5 h-5" />
            <span className="text-lg font-medium flex items-center gap-2"><Truck size={20} /> מעוניין בשינוע</span>
          </label>
          {towingRequested && (
            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-sm font-medium mb-1">כתובת איסוף</label>
                <input value={towingAddress} onChange={e => setTowingAddress(e.target.value)} className={inputClass} placeholder="כתובת..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">שעת איסוף</label>
                <input type="time" value={towingTime} onChange={e => setTowingTime(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">איש קשר</label>
                <input value={towingContact} onChange={e => setTowingContact(e.target.value)} className={inputClass} placeholder="שם + טלפון..." />
              </div>
            </div>
          )}
        </div>

        {/* Vendor */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-lg font-medium mb-2">שם ספק</label>
            <input value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="מוסך/ספק..." className={inputClass} />
          </div>
          <div>
            <label className="block text-lg font-medium mb-2">טלפון ספק</label>
            <input type="tel" value={vendorPhone} onChange={e => setVendorPhone(e.target.value)} placeholder="050-..." className={inputClass} dir="ltr" style={{ textAlign: 'right' }} />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-lg font-medium mb-2">הערות</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
        </div>

        <button onClick={handleSubmit} disabled={!isValid || loading}
          className={`w-full py-5 rounded-xl text-xl font-bold transition-colors ${isValid && !loading ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
          {loading ? 'שומר...' : editData ? '💾 עדכן קריאה' : '📋 שלח קריאה'}
        </button>
      </div>
    </div>
  );
}
