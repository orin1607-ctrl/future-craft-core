import { useState, useEffect } from 'react';
import { Wrench, Search, AlertTriangle, Plus, ArrowRight, Edit2, Lock, Download, Car, User, Calendar, Hash, FileText, MessageSquare, Truck, ExternalLink, Activity, ChevronLeft, Filter } from 'lucide-react';
import { exportToCsv } from '@/utils/exportCsv';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { toast } from 'sonner';
import MultiImageUpload from '@/components/MultiImageUpload';
import FaultChat from '@/components/faults/FaultChat';
import FaultStatusLog, { getStatusLabel } from '@/components/faults/FaultStatusLog';
import FaultReferral from '@/components/faults/FaultReferral';
import FaultTowing from '@/components/faults/FaultTowing';
import WhatsAppButton from '@/components/faults/WhatsAppButton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface FaultRow {
  id: string;
  serial_id: string;
  date: string;
  driver_name: string;
  vehicle_plate: string;
  fault_type: string;
  description: string;
  urgency: string;
  status: string;
  notes: string;
  images: string;
  created_at: string;
  company_name: string;
  towing_required: boolean;
  towing_approved: boolean | null;
  towing_approved_by: string;
  towing_approved_at: string | null;
  towing_completed: boolean | null;
  towing_completed_at: string | null;
}

const urgencyLabels: Record<string, { text: string; cls: string; icon: string }> = {
  normal: { text: 'רגיל', cls: 'status-active', icon: '🟢' },
  urgent: { text: 'דחוף', cls: 'status-pending', icon: '🟡' },
  critical: { text: 'מיידי', cls: 'status-urgent', icon: '🔴' },
};

const orderedStatuses = [
  { key: 'opened', text: 'נפתחה', emoji: '📋' },
  { key: 'pending_approval', text: 'ממתינה לאישור', emoji: '⏳' },
  { key: 'approved', text: 'אושרה', emoji: '✅' },
  { key: 'in_treatment', text: 'בטיפול', emoji: '🔧' },
  { key: 'referred_to_provider', text: 'הופנתה לספק', emoji: '🏪' },
  { key: 'towing_done', text: 'שינוע בוצע', emoji: '🚛' },
  { key: 'completed', text: 'הושלמה', emoji: '✔️' },
  { key: 'closed', text: 'נסגרה', emoji: '🔒' },
];

const statusClasses: Record<string, string> = {
  opened: 'status-new',
  pending_approval: 'status-pending',
  approved: 'status-active',
  in_treatment: 'status-pending',
  referred_to_provider: 'status-pending',
  towing_done: 'status-active',
  completed: 'status-active',
  closed: 'status-inactive',
  new: 'status-new',
  open: 'status-new',
  in_progress: 'status-pending',
  resolved: 'status-active',
};

const statusBorderColors: Record<string, string> = {
  opened: 'border-l-[hsl(var(--info))]',
  pending_approval: 'border-l-[hsl(var(--warning))]',
  approved: 'border-l-[hsl(var(--success))]',
  in_treatment: 'border-l-[hsl(var(--warning))]',
  referred_to_provider: 'border-l-[hsl(var(--warning))]',
  towing_done: 'border-l-[hsl(var(--success))]',
  completed: 'border-l-[hsl(var(--success))]',
  closed: 'border-l-[hsl(var(--muted-foreground))]',
  new: 'border-l-[hsl(var(--info))]',
  open: 'border-l-[hsl(var(--info))]',
  in_progress: 'border-l-[hsl(var(--warning))]',
  resolved: 'border-l-[hsl(var(--success))]',
};

const faultTypes = ['מנוע', 'בלמים', 'צמיגים', 'חשמל', 'מיזוג', 'פחחות', 'תאורה', 'אחר'];

type ViewMode = 'list' | 'detail' | 'form';

function parseImages(images: string | null): string[] {
  if (!images) return [];
  try {
    const parsed = JSON.parse(images);
    return Array.isArray(parsed) ? parsed : [images];
  } catch {
    return images ? [images] : [];
  }
}

// ─── Status Progress Stepper ───
function StatusStepper({ currentStatus }: { currentStatus: string }) {
  const currentIdx = orderedStatuses.findIndex(s => s.key === currentStatus);
  const effectiveIdx = currentIdx >= 0 ? currentIdx : 0;

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex items-center min-w-[600px] gap-0">
        {orderedStatuses.map((s, i) => {
          const isActive = i === effectiveIdx;
          const isPast = i < effectiveIdx;
          const isFuture = i > effectiveIdx;

          return (
            <div key={s.key} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  isActive ? 'bg-primary text-primary-foreground ring-4 ring-primary/20 scale-110' :
                  isPast ? 'bg-success text-success-foreground' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {isPast ? '✓' : s.emoji}
                </div>
                <span className={`text-[10px] text-center leading-tight font-medium ${
                  isActive ? 'text-primary font-bold' : isPast ? 'text-success' : 'text-muted-foreground'
                }`}>
                  {s.text}
                </span>
              </div>
              {i < orderedStatuses.length - 1 && (
                <div className={`h-0.5 w-full min-w-[16px] -mt-4 ${
                  i < effectiveIdx ? 'bg-success' : 'bg-border'
                }`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Status Counters ───
function StatusCounters({ faults, onFilter, activeFilter }: { faults: FaultRow[]; onFilter: (s: string) => void; activeFilter: string }) {
  const counts = {
    all: faults.length,
    active: faults.filter(f => !['closed', 'completed'].includes(f.status)).length,
    critical: faults.filter(f => f.urgency === 'critical' && !['closed', 'completed'].includes(f.status)).length,
    pending: faults.filter(f => f.status === 'pending_approval').length,
  };

  const counters = [
    { key: '', label: 'סה״כ', count: counts.all, style: 'bg-card border-border' },
    { key: 'active', label: 'פעילות', count: counts.active, style: 'bg-info/10 border-info/30' },
    { key: 'critical_urgency', label: 'מיידי', count: counts.critical, style: 'bg-destructive/10 border-destructive/30' },
    { key: 'pending_approval', label: 'ממתינות', count: counts.pending, style: 'bg-warning/10 border-warning/30' },
  ];

  return (
    <div className="grid grid-cols-4 gap-2 md:gap-3">
      {counters.map(c => (
        <button key={c.key} onClick={() => onFilter(activeFilter === c.key ? '' : c.key)}
          className={`rounded-2xl border-2 p-3 md:p-4 text-center transition-all ${c.style} ${activeFilter === c.key ? 'ring-2 ring-primary shadow-md' : 'hover:shadow-sm'}`}>
          <p className="text-2xl md:text-3xl font-black">{c.count}</p>
          <p className="text-xs md:text-sm font-medium text-muted-foreground">{c.label}</p>
        </button>
      ))}
    </div>
  );
}

export default function Faults() {
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const [faults, setFaults] = useState<FaultRow[]>([]);
  const [vehiclesMap, setVehiclesMap] = useState<Record<string, { id: string; internal_number: string }>>({});
  const [vehiclesByPlate, setVehiclesByPlate] = useState<Record<string, { id: string; internal_number: string }>>({});
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterUrgency, setFilterUrgency] = useState('');
  const [quickFilter, setQuickFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedFault, setSelectedFault] = useState<FaultRow | null>(null);
  const [editFault, setEditFault] = useState<FaultRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const loadFaults = async () => {
    setLoading(true);
    const [fRes, vRes] = await Promise.all([
      applyCompanyScope(supabase.from('faults').select('*'), companyFilter).order('created_at', { ascending: false }),
      applyCompanyScope(supabase.from('vehicles').select('id, license_plate, internal_number'), companyFilter),
    ]);
    if (fRes.data) setFaults(fRes.data as FaultRow[]);
    if (vRes.data) {
      const byId: Record<string, { id: string; internal_number: string }> = {};
      const byPlate: Record<string, { id: string; internal_number: string }> = {};
      (vRes.data as any[]).forEach(v => {
        byId[v.id] = { id: v.id, internal_number: v.internal_number || '' };
        if (v.license_plate) byPlate[v.license_plate] = { id: v.id, internal_number: v.internal_number || '' };
      });
      setVehiclesMap(byId);
      setVehiclesByPlate(byPlate);
    }
    setLoading(false);
  };

  useEffect(() => { loadFaults(); }, []);

  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';

  const getInternal = (f: FaultRow) => ((f as any).vehicle_id && vehiclesMap[(f as any).vehicle_id]?.internal_number) || vehiclesByPlate[f.vehicle_plate]?.internal_number || '';
  const getVehicleId = (f: FaultRow) => (f as any).vehicle_id || vehiclesByPlate[f.vehicle_plate]?.id || null;

  const filtered = faults.filter(f => {
    const internal = getInternal(f);
    const matchSearch = !search || f.driver_name?.includes(search) || f.vehicle_plate?.includes(search) || internal.includes(search) || f.fault_type?.includes(search) || f.description?.includes(search) || f.serial_id?.includes(search);
    const matchStatus = !filterStatus || f.status === filterStatus;
    const matchUrgency = !filterUrgency || f.urgency === filterUrgency;
    // Quick filter
    let matchQuick = true;
    if (quickFilter === 'active') matchQuick = !['closed', 'completed'].includes(f.status);
    else if (quickFilter === 'critical_urgency') matchQuick = f.urgency === 'critical' && !['closed', 'completed'].includes(f.status);
    else if (quickFilter === 'pending_approval') matchQuick = f.status === 'pending_approval';
    return matchSearch && matchStatus && matchUrgency && matchQuick;
  });

  const handleStatusChange = async (id: string, oldStatus: string, newStatus: string) => {
    const { error } = await supabase.from('faults').update({ status: newStatus }).eq('id', id);
    if (error) { toast.error('שגיאה בעדכון'); return; }
    const fault = faults.find(f => f.id === id);
    await supabase.from('fault_status_log').insert({
      fault_id: id,
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: user?.id,
      changed_by_name: user?.full_name || '',
      company_name: fault?.company_name || '',
    });
    toast.success('סטטוס עודכן');
    loadFaults();
  };

  if (viewMode === 'form') {
    return (
      <>
        <FaultForm fault={editFault} onDone={() => { setViewMode('list'); setEditFault(null); loadFaults(); }} onBack={() => { setViewMode('list'); setEditFault(null); }} user={user} />
        <WhatsAppButton />
      </>
    );
  }

  if (viewMode === 'detail' && selectedFault) {
    const f = selectedFault;
    const urg = urgencyLabels[f.urgency] || urgencyLabels.normal;
    const stCls = statusClasses[f.status] || 'status-new';
    const isClosed = f.status === 'closed' || f.status === 'completed';
    const faultImages = parseImages(f.images);

    return (
      <div className="animate-fade-in space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => { setViewMode('list'); setSelectedFault(null); }} className="flex items-center gap-2 text-primary text-lg font-medium min-h-[48px]">
            <ArrowRight size={20} /> חזרה לרשימה
          </button>
          {isManager && !isClosed && (
            <button onClick={() => { setEditFault(f); setViewMode('form'); }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary font-medium">
              <Edit2 size={16} /> עריכה
            </button>
          )}
        </div>

        {/* Main Info Card */}
        <div className="card-elevated !p-0 overflow-hidden">
          {/* Urgency banner */}
          <div className={`px-5 py-3 flex items-center justify-between ${
            f.urgency === 'critical' ? 'bg-destructive/10' : f.urgency === 'urgent' ? 'bg-warning/10' : 'bg-info/10'
          }`}>
            <div className="flex items-center gap-2">
              {f.urgency === 'critical' && <AlertTriangle size={20} className="text-destructive" />}
              <span className="font-bold text-lg">{f.fault_type}</span>
              {f.serial_id && <span className="text-sm text-muted-foreground">#{f.serial_id}</span>}
            </div>
            <div className="flex gap-2">
              <span className={`status-badge ${urg.cls}`}>{urg.text}</span>
              <span className={`status-badge ${stCls}`}>{getStatusLabel(f.status)}</span>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Description */}
            <p className="text-lg leading-relaxed">{f.description}</p>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <Car size={18} className="text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">רכב</p>
                  <p className="font-bold">{f.vehicle_plate || '—'}{getInternal(f) ? ` | פנימי ${getInternal(f)}` : ''}</p>
                  {getVehicleId(f) && (
                    <button onClick={() => window.location.assign(`/vehicles?vehicleId=${getVehicleId(f)}`)} className="inline-flex items-center gap-1 text-primary hover:underline text-xs mt-1">
                      <ExternalLink size={12} /> פתח כרטיס רכב
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <User size={18} className="text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">נהג</p>
                  <p className="font-bold">{f.driver_name || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <Calendar size={18} className="text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">תאריך</p>
                  <p className="font-bold">{f.date ? new Date(f.date).toLocaleDateString('he-IL') : '—'}</p>
                </div>
              </div>
              {f.serial_id && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                  <Hash size={18} className="text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">מספר סידורי</p>
                    <p className="font-bold">{f.serial_id}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            {f.notes && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
                <FileText size={18} className="text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">הערות</p>
                  <p className="text-sm">{f.notes}</p>
                </div>
              </div>
            )}

            {/* Images */}
            {faultImages.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-2 font-medium">📷 תמונות ({faultImages.length})</p>
                <div className="grid grid-cols-3 gap-2">
                  {faultImages.map((url, i) => (
                    <img key={i} src={url} alt={`תקלה ${i + 1}`} className="w-full rounded-xl aspect-square object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => window.open(url, '_blank')} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {isClosed && (
            <div className="mx-5 mb-5 flex items-center gap-2 p-3 bg-muted rounded-xl text-muted-foreground">
              <Lock size={16} /><span className="text-sm">תקלה סגורה – לא ניתן לערוך</span>
            </div>
          )}
        </div>

        {/* Progress Stepper */}
        <div className="card-elevated">
          <h2 className="text-base font-bold mb-3 flex items-center gap-2"><Activity size={18} /> מצב התקדמות</h2>
          <StatusStepper currentStatus={f.status} />
        </div>

        {/* Status change for managers */}
        {isManager && !isClosed && (
          <div className="card-elevated">
            <h2 className="text-base font-bold mb-3">שנה סטטוס</h2>
            <div className="flex gap-2 flex-wrap">
              {orderedStatuses.map(({ key, text, emoji }) => (
                <button key={key} onClick={() => { handleStatusChange(f.id, f.status, key); setSelectedFault({ ...f, status: key }); }}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${f.status === key ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                  <span>{emoji}</span> {text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tabs for Towing, Referral, Log, Chat */}
        <Tabs defaultValue="chat" dir="rtl">
          <TabsList className="w-full grid grid-cols-4 h-12">
            <TabsTrigger value="chat" className="text-xs md:text-sm font-bold gap-1">
              <MessageSquare size={14} /> צ׳אט
            </TabsTrigger>
            <TabsTrigger value="towing" className="text-xs md:text-sm font-bold gap-1">
              <Truck size={14} /> שינוע
            </TabsTrigger>
            <TabsTrigger value="referral" className="text-xs md:text-sm font-bold gap-1">
              <ExternalLink size={14} /> הפניה
            </TabsTrigger>
            <TabsTrigger value="log" className="text-xs md:text-sm font-bold gap-1">
              <Activity size={14} /> לוג
            </TabsTrigger>
          </TabsList>
          <TabsContent value="chat"><FaultChat faultId={f.id} companyName={f.company_name || ''} /></TabsContent>
          <TabsContent value="towing">
            <FaultTowing
              faultId={f.id}
              towingRequired={f.towing_required || false}
              towingApproved={f.towing_approved ?? null}
              towingApprovedBy={f.towing_approved_by || ''}
              towingApprovedAt={f.towing_approved_at || null}
              towingCompleted={f.towing_completed ?? null}
              towingCompletedAt={f.towing_completed_at || null}
              isManager={isManager}
              onUpdate={() => { loadFaults().then(() => { const updated = faults.find(ff => ff.id === f.id); if (updated) setSelectedFault(updated); }); }}
            />
          </TabsContent>
          <TabsContent value="referral"><FaultReferral faultId={f.id} companyName={f.company_name || ''} isManager={isManager} /></TabsContent>
          <TabsContent value="log"><FaultStatusLog faultId={f.id} /></TabsContent>
        </Tabs>

        <WhatsAppButton />
      </div>
    );
  }

  // ─── LIST VIEW ───
  return (
    <div className="animate-fade-in space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="page-header !mb-0 flex items-center gap-3"><Wrench size={28} /> מעקב רכב</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => exportToCsv('faults', [
            { key: 'serial_id', label: 'מספר סידורי' },
            { key: 'date', label: 'תאריך' },
            { key: 'driver_name', label: 'נהג' },
            { key: 'vehicle_plate', label: 'מספר רכב' },
            { key: 'fault_type', label: 'סוג תקלה' },
            { key: 'description', label: 'תיאור' },
            { key: 'urgency', label: 'דחיפות' },
            { key: 'status', label: 'סטטוס' },
            { key: 'company_name', label: 'חברה' },
            { key: 'notes', label: 'הערות' },
          ], filtered)} className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-card text-foreground text-sm font-bold min-h-[48px] hover:bg-muted transition-colors">
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* Status Counters */}
      <StatusCounters faults={faults} onFilter={setQuickFilter} activeFilter={quickFilter} />

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי נהג, רכב, סוג, תיאור..."
          className="w-full pr-12 pl-12 p-4 text-lg rounded-2xl border-2 border-input bg-background focus:border-primary focus:outline-none transition-colors" />
        <button onClick={() => setShowFilters(!showFilters)} className={`absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-colors ${showFilters ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
          <Filter size={18} />
        </button>
      </div>

      {/* Expandable Filters */}
      {showFilters && (
        <div className="card-elevated space-y-3 animate-fade-in">
          <p className="text-sm font-bold text-muted-foreground">דחיפות</p>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFilterUrgency('')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${!filterUrgency ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>הכל</button>
            {Object.entries(urgencyLabels).map(([key, { text, icon }]) => (
              <button key={key} onClick={() => setFilterUrgency(filterUrgency === key ? '' : key)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${filterUrgency === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {icon} {text}
              </button>
            ))}
          </div>
          <p className="text-sm font-bold text-muted-foreground">סטטוס</p>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFilterStatus('')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${!filterStatus ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>הכל</button>
            {orderedStatuses.map(({ key, text, emoji }) => (
              <button key={key} onClick={() => setFilterStatus(filterStatus === key ? '' : key)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1 ${filterStatus === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {emoji} {text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results count */}
      {(search || filterStatus || filterUrgency || quickFilter) && (
        <p className="text-sm text-muted-foreground">{filtered.length} תוצאות מתוך {faults.length}</p>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">טוען...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 card-elevated">
          <Wrench size={56} className="mx-auto mb-4 text-muted-foreground opacity-30" />
          <p className="text-xl font-bold">אין רשומות</p>
          <p className="text-muted-foreground mt-2">לא נמצאו רשומות התואמות לחיפוש</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(f => {
            const urg = urgencyLabels[f.urgency] || urgencyLabels.normal;
            const stCls = statusClasses[f.status] || 'status-new';
            const borderCls = statusBorderColors[f.status] || 'border-l-transparent';
            const faultImages = parseImages(f.images);

            return (
              <button key={f.id} onClick={() => { setSelectedFault(f); setViewMode('detail'); }}
                className={`card-elevated w-full text-right hover:shadow-lg transition-all border-l-4 ${borderCls} group`}>
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                    f.urgency === 'critical' ? 'bg-destructive/10' : f.urgency === 'urgent' ? 'bg-warning/10' : 'bg-primary/10'
                  }`}>
                    {f.urgency === 'critical' ? <AlertTriangle size={24} className="text-destructive" /> : <Wrench size={24} className={f.urgency === 'urgent' ? 'text-warning' : 'text-primary'} />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-bold truncate">{f.fault_type}</p>
                        {f.serial_id && <span className="text-xs text-muted-foreground">#{f.serial_id}</span>}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <span className={`status-badge text-xs ${urg.cls}`}>{urg.text}</span>
                        <span className={`status-badge text-xs ${stCls}`}>{getStatusLabel(f.status)}</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">{f.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Car size={12} /> {f.vehicle_plate}</span>
                      <span className="flex items-center gap-1"><User size={12} /> {f.driver_name}</span>
                      <span className="flex items-center gap-1"><Calendar size={12} /> {f.date ? new Date(f.date).toLocaleDateString('he-IL') : ''}</span>
                      {faultImages.length > 0 && <span className="text-primary">📷 {faultImages.length}</span>}
                    </div>
                  </div>

                  {/* Arrow */}
                  <ChevronLeft size={20} className="text-muted-foreground shrink-0 mt-3 group-hover:text-primary transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
      )}
      <WhatsAppButton />

      {/* Floating + button */}
      <button
        onClick={() => { setEditFault(null); setViewMode('form'); }}
        className="fixed bottom-24 left-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-xl hover:shadow-2xl transition-all flex items-center justify-center hover:scale-110"
        title="תקלה חדשה"
      >
        <Plus size={28} />
      </button>
    </div>
  );
}

function FaultForm({ fault, onDone, onBack, user }: { fault: FaultRow | null; onDone: () => void; onBack: () => void; user: any }) {
  const isEdit = !!fault;
  const [vehiclePlate, setVehiclePlate] = useState(fault?.vehicle_plate || '');
  const [driverName, setDriverName] = useState(fault?.driver_name || '');
  const [faultType, setFaultType] = useState(fault?.fault_type || '');
  const [description, setDescription] = useState(fault?.description || '');
  const [urgency, setUrgency] = useState(fault?.urgency || 'normal');
  const [notes, setNotes] = useState(fault?.notes || '');
  const [imageUrls, setImageUrls] = useState<string[]>(parseImages(fault?.images || ''));
  const [loading, setLoading] = useState(false);

  const [vehicles, setVehicles] = useState<{ id: string; license_plate: string; manufacturer: string; model: string }[]>([]);
  const [drivers, setDrivers] = useState<{ full_name: string }[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from('vehicles').select('id, license_plate, manufacturer, model'),
      supabase.from('drivers').select('full_name'),
    ]).then(([v, d]) => {
      if (v.data) setVehicles(v.data as any);
      if (d.data) setDrivers(d.data);
    });
  }, []);

  const isValid = vehiclePlate && driverName && faultType && description;
  const inputClass = "w-full p-4 text-lg rounded-2xl border-2 border-input bg-background focus:border-primary focus:outline-none transition-colors";

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    const matchedVehicle = vehicles.find(v => v.license_plate === vehiclePlate);
    const payload: any = {
      vehicle_plate: vehiclePlate,
      vehicle_id: matchedVehicle?.id || null,
      driver_name: driverName,
      fault_type: faultType,
      description,
      urgency,
      notes,
      images: imageUrls.length > 0 ? JSON.stringify(imageUrls) : '',
    };
    let error;
    if (isEdit) {
      ({ error } = await supabase.from('faults').update(payload).eq('id', fault!.id));
    } else {
      const insertPayload = { ...payload, status: 'opened', company_name: user?.company_name || '', created_by: user?.id };
      ({ error } = await supabase.from('faults').insert(insertPayload));
      if (!error) {
        if (urgency === 'urgent' || urgency === 'critical') {
          supabase.functions.invoke('notify-accident-email', { body: { record: insertPayload, type: 'fault' } }).catch(console.error);
        }
      }
    }
    setLoading(false);
    if (error) { toast.error('שגיאה בשמירה'); console.error(error); }
    else { toast.success(isEdit ? 'התקלה עודכנה' : 'התקלה נוספה'); onDone(); }
  };

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]"><ArrowRight size={20} /> חזרה</button>
      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'עריכת תקלה' : '📋 דיווח תקלה חדשה'}</h1>
      <div className="space-y-5">
        <div>
          <label className="block text-lg font-medium mb-2">🚗 רכב *</label>
          <select value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)} className={inputClass}>
            <option value="">בחר רכב...</option>
            {vehicles.map(v => <option key={v.license_plate} value={v.license_plate}>{v.license_plate} - {v.manufacturer} {v.model}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-lg font-medium mb-2">👤 נהג <span className="text-destructive">*</span></label>
          <select value={driverName} onChange={e => setDriverName(e.target.value)} className={inputClass}>
            <option value="">בחר נהג...</option>
            {drivers.map(d => <option key={d.full_name} value={d.full_name}>{d.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-lg font-medium mb-2">🔧 סוג תקלה *</label>
          <select value={faultType} onChange={e => setFaultType(e.target.value)} className={inputClass}>
            <option value="">בחר סוג...</option>
            {faultTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-lg font-medium mb-2">📝 תיאור *</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="תאר את התקלה..." className={`${inputClass} resize-none`} />
        </div>
        <div>
          <label className="block text-lg font-medium mb-2">⚠️ דחיפות</label>
          <div className="flex gap-3">
            {Object.entries(urgencyLabels).map(([key, { text, icon }]) => (
              <button key={key} type="button" onClick={() => setUrgency(key)}
                className={`flex-1 py-3 rounded-2xl text-lg font-bold border-2 transition-all flex items-center justify-center gap-2 ${urgency === key ? 'border-primary bg-primary/10 text-primary shadow-md' : 'bg-muted text-muted-foreground border-transparent'}`}>
                {icon} {text}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-lg font-medium mb-2">💬 הערות</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="הערות..." className={`${inputClass} resize-none`} />
        </div>
        <MultiImageUpload label="📷 תמונות תקלה" imageUrls={imageUrls} onImagesChanged={setImageUrls} folder="faults" max={5} />
        <button onClick={handleSubmit} disabled={!isValid || loading}
          className={`w-full py-5 rounded-2xl text-xl font-bold transition-all ${isValid && !loading ? 'bg-primary text-primary-foreground shadow-lg hover:shadow-xl' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
          {loading ? 'שומר...' : isEdit ? '💾 עדכן תקלה' : '💾 שמור תקלה'}
        </button>
      </div>
    </div>
  );
}
