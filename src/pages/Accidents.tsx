import { useState, useEffect } from 'react';
import { AlertTriangle, Plus, ArrowRight, Search, Edit2, Mail, Share2, Download, ExternalLink } from 'lucide-react';
import { exportToCsv } from '@/utils/exportCsv';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { useDriverVehicle } from '@/hooks/useDriverVehicle';
import MultiImageUpload from '@/components/MultiImageUpload';
import { plateMatches, useVehicleUrlContext } from '@/lib/entityNavContext';
import { EntityContextBanner } from '@/components/EntityContextBanner';
import VehicleBackToCardButton from '@/components/vehicles/VehicleBackToCardButton';
import { VEHICLE_EMPTY_LIST_MSG } from '@/lib/vehicleScopedUi';

interface AccidentRow {
  id: string;
  date: string;
  vehicle_plate: string;
  driver_name: string;
  location: string;
  description: string;
  has_insurance: boolean;
  third_party: boolean;
  estimated_cost: number;
  status: string;
  notes: string;
  images: string;
}

const statusLabels: Record<string, { text: string; cls: string }> = {
  open: { text: 'פתוח', cls: 'status-urgent' },
  in_progress: { text: 'בטיפול', cls: 'status-pending' },
  closed: { text: 'סגור', cls: 'status-active' },
};

type ViewMode = 'list' | 'detail' | 'form';

export default function Accidents() {
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const { plate: contextPlate, vehicleId: contextVehicleId, action: contextAction, locked } = useVehicleUrlContext();
  const [accidents, setAccidents] = useState<AccidentRow[]>([]);
  const [search, setSearch] = useState('');
  const [initialVehiclePlate, setInitialVehiclePlate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selected, setSelected] = useState<AccidentRow | null>(null);
  const [editItem, setEditItem] = useState<AccidentRow | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAccidents = async () => {
    setLoading(true);
    const { data } = await applyCompanyScope(supabase.from('accidents').select('*'), companyFilter).order('created_at', { ascending: false });
    if (data) setAccidents(data as AccidentRow[]);
    setLoading(false);
  };

  useEffect(() => { loadAccidents(); }, []);

  useEffect(() => {
    if (contextPlate) {
      setSearch(contextPlate);
      setInitialVehiclePlate(contextPlate);
    }
    if (contextAction === 'new') {
      setEditItem(null);
      setViewMode('form');
    }
  }, [contextPlate, contextAction]);

  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';

  const filtered = accidents.filter(a => {
    const matchSearch = !search || a.driver_name?.includes(search) || plateMatches(a.vehicle_plate, search) || a.description?.includes(search);
    const matchStatus = !filterStatus || a.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const handleStatusChange = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('accidents').update({ status: newStatus }).eq('id', id);
    if (error) { toast.error('שגיאה'); } else { toast.success('סטטוס עודכן'); loadAccidents(); }
  };

  if (viewMode === 'form') {
    return <AccidentForm accident={editItem} initialVehiclePlate={initialVehiclePlate} onDone={() => { setViewMode('list'); setEditItem(null); loadAccidents(); }} onBack={() => { setViewMode('list'); setEditItem(null); }} user={user} />;
  }

  if (viewMode === 'detail' && selected) {
    const a = selected;
    const st = statusLabels[a.status] || statusLabels.open;
    return (
      <div className="animate-fade-in">
        <button onClick={() => { setViewMode('list'); setSelected(null); }} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]">
          <ArrowRight size={20} /> חזרה
        </button>
        <div className="card-elevated mb-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">תאונה - {a.vehicle_plate}</h1>
            <div className="flex items-center gap-2">
              <span className={`status-badge ${st.cls}`}>{st.text}</span>
              {isManager && <button onClick={() => { setEditItem(a); setViewMode('form'); }} className="p-2 rounded-xl bg-primary/10 text-primary"><Edit2 size={18} /></button>}
            </div>
          </div>
          <p className="text-lg mb-4">{a.description}</p>
          <div className="grid grid-cols-2 gap-4 text-lg">
            <div><span className="text-muted-foreground text-sm">נהג</span><p className="font-bold">{a.driver_name}</p></div>
            <div><span className="text-muted-foreground text-sm">מיקום</span><p className="font-bold">{a.location || '—'}</p></div>
            <div><span className="text-muted-foreground text-sm">תאריך</span><p className="font-bold">{a.date ? new Date(a.date).toLocaleDateString('he-IL') : '—'}</p></div>
            <div><span className="text-muted-foreground text-sm">עלות משוערת</span><p className="font-bold">₪{(a.estimated_cost || 0).toLocaleString()}</p></div>
          </div>
          <div className="flex gap-3 mt-4">
            {a.has_insurance && <span className="status-badge status-active">ביטוח ✓</span>}
            {a.third_party && <span className="status-badge status-pending">צד ג׳</span>}
          </div>
          {(() => {
            let imgs: string[] = [];
            try { imgs = a.images ? JSON.parse(a.images) : []; } catch { if (a.images) imgs = [a.images]; }
            return imgs.length > 0 ? (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground mb-2">תמונות ({imgs.length})</p>
                <div className="grid grid-cols-2 gap-3">
                  {imgs.map((url, i) => (
                    <img key={i} src={url} alt={`תמונה ${i + 1}`} className="w-full rounded-xl h-36 object-cover" />
                  ))}
                </div>
              </div>
            ) : null;
          })()}
          {a.notes && <p className="mt-4 p-3 bg-muted rounded-xl text-muted-foreground">{a.notes}</p>}

          {/* Share buttons */}
          <div className="mt-6 space-y-3">
            <h3 className="text-lg font-bold">שיתוף ושליחה</h3>
            <div className="flex gap-3 flex-wrap">
              <a
                href={`mailto:?subject=${encodeURIComponent(`דיווח תאונה - ${a.vehicle_plate}`)}&body=${encodeURIComponent(
                  `דיווח תאונה - ${a.vehicle_plate}\n\nנהג: ${a.driver_name}\nמיקום: ${a.location || '—'}\nתאריך: ${a.date ? new Date(a.date).toLocaleDateString('he-IL') : '—'}\nתיאור: ${a.description}\nעלות משוערת: ₪${(a.estimated_cost || 0).toLocaleString()}\nביטוח: ${a.has_insurance ? 'כן' : 'לא'}\nצד ג׳: ${a.third_party ? 'כן' : 'לא'}\n${a.notes ? `הערות: ${a.notes}\n` : ''}${(() => { let imgs: string[] = []; try { imgs = a.images ? JSON.parse(a.images) : []; } catch { if (a.images) imgs = [a.images]; } return imgs.length > 0 ? `\nתמונות:\n${imgs.join('\n')}` : ''; })()}`
                )}`}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-base min-h-[48px]"
              >
                <Mail size={20} /> שלח באימייל
              </a>
              <button
                onClick={() => {
                  let imgs: string[] = [];
                  try { imgs = a.images ? JSON.parse(a.images) : []; } catch { if (a.images) imgs = [a.images]; }
                  const text = `דיווח תאונה - ${a.vehicle_plate}\nנהג: ${a.driver_name}\nתיאור: ${a.description}${imgs.length > 0 ? '\n\nתמונות:\n' + imgs.join('\n') : ''}`;
                  if (navigator.share) {
                    navigator.share({ title: `תאונה - ${a.vehicle_plate}`, text }).catch(() => {});
                  } else {
                    navigator.clipboard.writeText(text);
                    toast.success('הועתק ללוח');
                  }
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-muted text-foreground font-bold text-base min-h-[48px]"
              >
                <Share2 size={20} /> שתף
              </button>
            </div>
            {(() => {
              let imgs: string[] = [];
              try { imgs = a.images ? JSON.parse(a.images) : []; } catch { if (a.images) imgs = [a.images]; }
              return imgs.length > 0 ? (
                <a
                  href={`https://drive.google.com/drive/u/0/my-drive`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-input text-foreground font-bold text-base min-h-[48px] hover:bg-muted transition-colors"
                >
                  <ExternalLink size={20} /> פתח Google Drive
                </a>
              ) : null;
            })()}
          </div>
        </div>
        {isManager && (
          <div className="card-elevated">
            <h2 className="text-lg font-bold mb-3">שנה סטטוס</h2>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(statusLabels).map(([key, { text }]) => (
                <button key={key} onClick={() => { handleStatusChange(a.id, key); setSelected({ ...a, status: key }); }}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${a.status === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-header !mb-0 flex items-center gap-3"><AlertTriangle size={28} /> תאונות</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => exportToCsv('accidents', [
            { key: 'date', label: 'תאריך' },
            { key: 'vehicle_plate', label: 'מספר רכב' },
            { key: 'driver_name', label: 'נהג' },
            { key: 'location', label: 'מיקום' },
            { key: 'description', label: 'תיאור' },
            { key: 'status', label: 'סטטוס' },
            { key: 'estimated_cost', label: 'עלות משוערת' },
            { key: 'has_insurance', label: 'ביטוח' },
            { key: 'third_party', label: 'צד שלישי' },
          ], filtered)} className="flex items-center gap-1 px-3 py-2 rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 text-sm font-medium min-h-[48px]">
            <Download size={18} /> ייצוא
          </button>
          <button onClick={() => { setEditItem(null); setViewMode('form'); }} className="flex items-center gap-2 px-5 py-3 rounded-xl bg-destructive text-destructive-foreground text-lg font-bold min-h-[48px]">
            <Plus size={22} /> דיווח תאונה
          </button>
        </div>
      </div>
      <VehicleBackToCardButton vehicleId={contextVehicleId} />
      {locked && contextPlate && (
        <EntityContextBanner label={`רכב ${contextPlate}`} strict />
      )}
      <div className="relative mb-4">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-12 p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none"
          disabled={locked && !!contextPlate} />
      </div>
      <div className="flex gap-2 mb-5 flex-wrap">
        {(['', 'open', 'in_progress', 'closed'] as const).map(key => (
          <button key={key} onClick={() => setFilterStatus(filterStatus === key ? '' : key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${filterStatus === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {key === '' ? 'הכל' : (statusLabels[key]?.text || key)}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><AlertTriangle size={48} className="mx-auto mb-4 opacity-50" /><p className="text-xl">{locked && contextPlate ? VEHICLE_EMPTY_LIST_MSG : 'אין תאונות'}</p></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(a => {
            const st = statusLabels[a.status] || statusLabels.open;
            return (
              <button key={a.id} onClick={() => { setSelected(a); setViewMode('detail'); }} className="card-elevated w-full text-right hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle size={28} className="text-destructive" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xl font-bold">{a.vehicle_plate}</p>
                      <span className={`status-badge ${st.cls}`}>{st.text}</span>
                    </div>
                    <p className="text-muted-foreground line-clamp-1">{a.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                      <span>👤 {a.driver_name}</span>
                      <span>📅 {a.date ? new Date(a.date).toLocaleDateString('he-IL') : ''}</span>
                      <span>💰 ₪{(a.estimated_cost || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AccidentForm({ accident, initialVehiclePlate = '', onDone, onBack, user }: { accident: AccidentRow | null; initialVehiclePlate?: string; onDone: () => void; onBack: () => void; user: any }) {
  const isEdit = !!accident;
  const { vehicle, isDriver } = useDriverVehicle();
  
  const [vehiclePlate, setVehiclePlate] = useState(accident?.vehicle_plate || initialVehiclePlate);
  const [driverName, setDriverName] = useState(accident?.driver_name || user?.full_name || '');
  const [location, setLocation] = useState(accident?.location || '');
  const [description, setDescription] = useState(accident?.description || '');
  const [hasInsurance, setHasInsurance] = useState(accident?.has_insurance || false);
  const [thirdParty, setThirdParty] = useState(accident?.third_party || false);
  const [estimatedCost, setEstimatedCost] = useState(accident?.estimated_cost?.toString() || '');
  const [notes, setNotes] = useState(accident?.notes || '');
  const [imageUrls, setImageUrls] = useState<string[]>(() => {
    if (!accident?.images) return [];
    try { return JSON.parse(accident.images); } catch { return accident.images ? [accident.images] : []; }
  });
  const [loading, setLoading] = useState(false);

  const [vehicles, setVehicles] = useState<{ license_plate: string; manufacturer: string; model: string }[]>([]);
  useEffect(() => {
    if (!isDriver) {
      supabase.from('vehicles').select('license_plate, manufacturer, model').then(({ data }) => { if (data) setVehicles(data); });
    }
  }, [isDriver]);

  // Auto-fill for drivers
  useEffect(() => {
    if (isDriver && !isEdit && vehicle) {
      setVehiclePlate(vehicle.license_plate);
    }
  }, [isDriver, vehicle, isEdit]);

  useEffect(() => {
    if (isDriver && !isEdit && user) {
      setDriverName(user.full_name);
    }
  }, [isDriver, user, isEdit]);

  const isValid = vehiclePlate && driverName && description;
  const inputClass = "w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    const payload = { vehicle_plate: vehiclePlate, driver_name: driverName, location, description, has_insurance: hasInsurance, third_party: thirdParty, estimated_cost: parseFloat(estimatedCost) || 0, notes, images: JSON.stringify(imageUrls) };
    let error;
    if (isEdit) { ({ error } = await supabase.from('accidents').update(payload).eq('id', accident!.id)); }
    else {
      const insertPayload = { ...payload, company_name: user?.company_name || '', created_by: user?.id };
      ({ error } = await supabase.from('accidents').insert(insertPayload));
      if (!error) {
        supabase.functions.invoke('notify-accident-email', { body: { record: insertPayload } }).catch(console.error);
      }
    }
    setLoading(false);
    if (error) { toast.error('שגיאה'); } else { toast.success(isEdit ? 'עודכן' : 'דיווח נשלח'); onDone(); }
  };

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]"><ArrowRight size={20} /> חזרה</button>
      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'עריכת תאונה' : 'דיווח תאונה'}</h1>
      <div className="space-y-5">
        {/* Vehicle */}
        {isDriver && vehicle && !isEdit ? (
          <div>
            <label className="block text-lg font-medium mb-2">רכב משויך</label>
            <div className="w-full p-4 text-lg rounded-xl border-2 border-input bg-muted/50">
              <p className="font-bold">{vehicle.license_plate}</p>
              <p className="text-sm text-muted-foreground">{vehicle.manufacturer} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ''}</p>
            </div>
          </div>
        ) : (
          <div><label className="block text-lg font-medium mb-2">רכב *</label>
            <select value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)} className={inputClass}>
              <option value="">בחר...</option>
              {vehicles.map(v => <option key={v.license_plate} value={v.license_plate}>{v.license_plate} - {v.manufacturer} {v.model}</option>)}
            </select>
          </div>
        )}
        
        {/* Driver */}
        {isDriver && !isEdit ? (
          <div>
            <label className="block text-lg font-medium mb-2">נהג</label>
            <div className="w-full p-4 text-lg rounded-xl border-2 border-input bg-muted/50 font-bold">{driverName}</div>
          </div>
        ) : (
          <div><label className="block text-lg font-medium mb-2">נהג *</label>
            <input value={driverName} onChange={e => setDriverName(e.target.value)} className={inputClass} /></div>
        )}

        <div><label className="block text-lg font-medium mb-2">מיקום</label>
          <input value={location} onChange={e => setLocation(e.target.value)} placeholder="כתובת / צומת..." className={inputClass} /></div>
        <div><label className="block text-lg font-medium mb-2">תיאור *</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="תאר את האירוע..." className={`${inputClass} resize-none`} /></div>
        <div><label className="block text-lg font-medium mb-2">עלות משוערת (₪)</label>
          <input type="number" value={estimatedCost} onChange={e => setEstimatedCost(e.target.value)} placeholder="0" className={inputClass} /></div>
        <div className="flex gap-4">
          <label className="flex items-center gap-3 flex-1 p-4 rounded-xl border-2 border-input cursor-pointer">
            <input type="checkbox" checked={hasInsurance} onChange={e => setHasInsurance(e.target.checked)} className="w-6 h-6 rounded" />
            <span className="text-lg font-medium">יש ביטוח</span>
          </label>
          <label className="flex items-center gap-3 flex-1 p-4 rounded-xl border-2 border-input cursor-pointer">
            <input type="checkbox" checked={thirdParty} onChange={e => setThirdParty(e.target.checked)} className="w-6 h-6 rounded" />
            <span className="text-lg font-medium">צד ג׳</span>
          </label>
        </div>
        <MultiImageUpload label="תמונות מהתאונה" folder="accidents" imageUrls={imageUrls} onImagesChanged={setImageUrls} max={10} />
        <div><label className="block text-lg font-medium mb-2">הערות</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-none`} /></div>
        <button onClick={handleSubmit} disabled={!isValid || loading}
          className={`w-full py-5 rounded-xl text-xl font-bold transition-colors ${isValid && !loading ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
          {loading ? 'שולח...' : isEdit ? '💾 עדכן' : '🚨 שלח דיווח'}
        </button>
      </div>
    </div>
  );
}
