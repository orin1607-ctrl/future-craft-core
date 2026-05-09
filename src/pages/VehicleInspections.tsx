import { useState, useEffect } from 'react';
import { ClipboardCheck, ArrowRight, Plus, Search, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { toast } from 'sonner';

interface InspectionRow {
  id: string;
  vehicle_id: string;
  vehicle_plate: string;
  inspection_type: string;
  inspection_date: string;
  inspector_name: string;
  overall_status: string;
  notes: string;
  company_name: string;
  created_at: string;
}

interface InspectionItemRow {
  id?: string;
  inspection_id?: string;
  item_name: string;
  status: string;
  notes: string;
}

interface VehicleBasic {
  id: string;
  license_plate: string;
  internal_number: string;
  manufacturer: string;
  model: string;
}

const DEFAULT_CHECKLIST = [
  'מצב צמיגים', 'בלמים', 'אורות', 'מראות', 'חגורות בטיחות',
  'מגבים', 'מערכת קירור', 'שמן מנוע', 'מצב מרכב חיצוני', 'ניקיון פנימי',
  'מטף כיבוי', 'משולש אזהרה', 'ערכת עזרה ראשונה', 'גלגל חילוף',
];

type ViewMode = 'list' | 'form' | 'detail';

export default function VehicleInspections() {
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleBasic[]>([]);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedInspection, setSelectedInspection] = useState<InspectionRow | null>(null);
  const [inspectionItems, setInspectionItems] = useState<InspectionItemRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const [iRes, vRes] = await Promise.all([
      applyCompanyScope(supabase.from('vehicle_inspections').select('*'), companyFilter).order('inspection_date', { ascending: false }),
      applyCompanyScope(supabase.from('vehicles').select('id, license_plate, internal_number, manufacturer, model'), companyFilter),
    ]);
    if (iRes.data) setInspections(iRes.data as InspectionRow[]);
    if (vRes.data) setVehicles(vRes.data as VehicleBasic[]);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const filtered = inspections.filter(i => {
    if (!search) return true;
    const v = vehicles.find(x => x.id === i.vehicle_id);
    return i.vehicle_plate?.includes(search) || i.inspector_name?.includes(search) || v?.internal_number?.includes(search);
  });

  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';

  if (viewMode === 'form') {
    return <InspectionForm vehicles={vehicles} user={user} onDone={() => { setViewMode('list'); loadData(); }} onBack={() => setViewMode('list')} />;
  }

  if (viewMode === 'detail' && selectedInspection) {
    return <InspectionDetail inspection={selectedInspection} vehicles={vehicles} onBack={() => { setViewMode('list'); setSelectedInspection(null); }} />;
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-header !mb-0 flex items-center gap-3"><ClipboardCheck size={28} /> ביקורת רכב</h1>
      </div>

      <div className="relative mb-4">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי מספר רכב, מספר פנימי או בודק..."
          className="w-full pr-12 p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none" />
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground text-lg">טוען...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardCheck size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-xl">אין ביקורות</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(i => (
            <button key={i.id} onClick={() => { setSelectedInspection(i); setViewMode('detail'); }}
              className="card-elevated w-full text-right hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${i.overall_status === 'passed' ? 'bg-success/10' : 'bg-destructive/10'}`}>
                  {i.overall_status === 'passed' ? <CheckCircle2 size={28} className="text-success" /> : <AlertTriangle size={28} className="text-destructive" />}
                </div>
                {(() => { const v = vehicles.find(x => x.id === i.vehicle_id); return (
                  <div className="flex-1 min-w-0">
                    <p className="text-xl font-bold">רכב {i.vehicle_plate}{v?.internal_number ? ` | מס' פנימי ${v.internal_number}` : ''}</p>
                    <p className="text-muted-foreground">{new Date(i.inspection_date).toLocaleDateString('he-IL')} • {i.inspector_name || 'לא צוין'}</p>
                  </div>
                ); })()}
                <span className={`status-badge ${i.overall_status === 'passed' ? 'status-active' : 'status-inactive'}`}>
                  {i.overall_status === 'passed' ? 'תקין' : 'ליקויים'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {isManager && (
        <button onClick={() => setViewMode('form')}
          className="fixed bottom-24 left-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-xl hover:shadow-2xl transition-all flex items-center justify-center hover:scale-110"
          title="ביקורת חדשה">
          <Plus size={28} />
        </button>
      )}
    </div>
  );
}

function InspectionForm({ vehicles, user, onDone, onBack }: {
  vehicles: VehicleBasic[];
  user: any;
  onDone: () => void;
  onBack: () => void;
}) {
  const [vehicleId, setVehicleId] = useState('');
  const [inspectionType, setInspectionType] = useState('semi_annual');
  const [inspectorName, setInspectorName] = useState(user?.full_name || '');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<InspectionItemRow[]>(
    DEFAULT_CHECKLIST.map(name => ({ item_name: name, status: 'ok', notes: '' }))
  );

  const selectedVehicle = vehicles.find(v => v.id === vehicleId);

  const updateItem = (index: number, field: keyof InspectionItemRow, value: string) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const handleSubmit = async () => {
    if (!vehicleId) { toast.error('יש לבחור רכב'); return; }
    setLoading(true);

    const hasDefects = items.some(i => i.status === 'defect');
    const overallStatus = hasDefects ? 'failed' : 'passed';

    const { data: inspection, error } = await supabase.from('vehicle_inspections').insert({
      vehicle_id: vehicleId,
      vehicle_plate: selectedVehicle?.license_plate || '',
      inspection_type: inspectionType,
      inspector_name: inspectorName,
      overall_status: overallStatus,
      notes,
      company_name: user?.company_name || '',
      created_by: user?.id,
    }).select('id').single();

    if (error || !inspection) {
      toast.error('שגיאה בשמירת הביקורת');
      setLoading(false);
      return;
    }

    // Save items
    const itemsPayload = items.map(item => ({
      inspection_id: inspection.id,
      item_name: item.item_name,
      status: item.status,
      notes: item.notes,
    }));
    await supabase.from('inspection_items').insert(itemsPayload);

    // Create follow-up tasks for defects
    const defects = items.filter(i => i.status === 'defect');
    if (defects.length > 0) {
      const tasks = defects.map(d => ({
        vehicle_id: vehicleId,
        vehicle_plate: selectedVehicle?.license_plate || '',
        inspection_id: inspection.id,
        title: `ליקוי: ${d.item_name}`,
        description: d.notes || `ליקוי שנמצא בביקורת ${new Date().toLocaleDateString('he-IL')}`,
        status: 'open',
        company_name: user?.company_name || '',
        created_by: user?.id,
      }));
      await supabase.from('vehicle_tasks').insert(tasks);
      toast.success(`הביקורת נשמרה, ${defects.length} משימות טיפול נפתחו`);
    } else {
      toast.success('הביקורת נשמרה - הרכב תקין');
    }

    setLoading(false);
    onDone();
  };

  const inputClass = "w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]">
        <ArrowRight size={20} /> חזרה
      </button>
      <h1 className="text-2xl font-bold mb-6">ביקורת רכב חדשה</h1>

      <div className="space-y-5">
        <div>
          <label className="block text-lg font-medium mb-2">רכב *</label>
          <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} className={inputClass}>
            <option value="">בחר רכב...</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.license_plate}{v.internal_number ? ` | ${v.internal_number}` : ''} - {v.manufacturer} {v.model}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-lg font-medium mb-2">סוג ביקורת</label>
            <select value={inspectionType} onChange={e => setInspectionType(e.target.value)} className={inputClass}>
              <option value="semi_annual">חצי שנתי</option>
              <option value="quarterly">רבעוני</option>
              <option value="monthly">חודשי</option>
              <option value="special">מיוחד</option>
            </select>
          </div>
          <div>
            <label className="block text-lg font-medium mb-2">שם הבודק</label>
            <input value={inspectorName} onChange={e => setInspectorName(e.target.value)} placeholder="שם הבודק..." className={inputClass} />
          </div>
        </div>

        {/* Checklist */}
        <div className="border-t border-border pt-5">
          <h2 className="text-xl font-bold mb-4">📋 רשימת בדיקה</h2>
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="border border-border rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{item.item_name}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => updateItem(i, 'status', 'ok')}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${item.status === 'ok' ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                      ✅ תקין
                    </button>
                    <button type="button" onClick={() => updateItem(i, 'status', 'defect')}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${item.status === 'defect' ? 'bg-destructive/20 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                      ⚠️ ליקוי
                    </button>
                  </div>
                </div>
                {item.status === 'defect' && (
                  <input value={item.notes} onChange={e => updateItem(i, 'notes', e.target.value)}
                    placeholder="פירוט הליקוי..." className="w-full p-2 text-sm rounded-lg border border-input bg-background focus:border-primary focus:outline-none" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-lg font-medium mb-2">הערות כלליות</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="הערות..." className={`${inputClass} resize-none`} />
        </div>

        <button onClick={handleSubmit} disabled={!vehicleId || loading}
          className={`w-full py-5 rounded-xl text-xl font-bold transition-colors ${vehicleId && !loading ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
          {loading ? 'שומר...' : '💾 שמור ביקורת'}
        </button>
      </div>
    </div>
  );
}

function InspectionDetail({ inspection, vehicles, onBack }: { inspection: InspectionRow; vehicles: VehicleBasic[]; onBack: () => void }) {
  const vehicleInternal = vehicles.find(v => v.id === inspection.vehicle_id)?.internal_number;
  const [items, setItems] = useState<InspectionItemRow[]>([]);

  useEffect(() => {
    supabase.from('inspection_items').select('*').eq('inspection_id', inspection.id)
      .then(({ data }) => { if (data) setItems(data as InspectionItemRow[]); });
  }, [inspection.id]);

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]">
        <ArrowRight size={20} /> חזרה
      </button>

      <div className="card-elevated mb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">ביקורת רכב {inspection.vehicle_plate}{vehicleInternal ? ` | מס' פנימי ${vehicleInternal}` : ''}</h1>
          <span className={`status-badge ${inspection.overall_status === 'passed' ? 'status-active' : 'status-inactive'}`}>
            {inspection.overall_status === 'passed' ? 'תקין' : 'ליקויים'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 text-lg">
          <div><span className="text-muted-foreground text-sm">תאריך</span><p className="font-bold">{new Date(inspection.inspection_date).toLocaleDateString('he-IL')}</p></div>
          <div><span className="text-muted-foreground text-sm">בודק</span><p className="font-bold">{inspection.inspector_name || '—'}</p></div>
          <div><span className="text-muted-foreground text-sm">סוג</span><p className="font-bold">{
            inspection.inspection_type === 'semi_annual' ? 'חצי שנתי' :
            inspection.inspection_type === 'quarterly' ? 'רבעוני' :
            inspection.inspection_type === 'monthly' ? 'חודשי' : 'מיוחד'
          }</p></div>
        </div>
        {inspection.notes && <p className="mt-4 p-3 bg-muted rounded-xl text-muted-foreground">{inspection.notes}</p>}
      </div>

      <div className="card-elevated">
        <h2 className="text-lg font-bold mb-4">פריטי בדיקה</h2>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <span className="font-medium">{item.item_name}</span>
              <div className="flex items-center gap-2">
                {item.status === 'ok' ? (
                  <span className="text-success text-sm font-medium">✅ תקין</span>
                ) : (
                  <span className="text-destructive text-sm font-medium">⚠️ ליקוי</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
