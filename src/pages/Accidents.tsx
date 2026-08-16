import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Plus, ArrowRight, Search, Edit2, Mail, Share2, Download, ExternalLink, FileText, Upload } from 'lucide-react';
import { exportToCsv } from '@/utils/exportCsv';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { useDriverVehicle } from '@/hooks/useDriverVehicle';
import { DocumentCard, DocumentGallery } from '@/components/documents/DocumentViewer';
import MultiImageUpload from '@/components/MultiImageUpload';
import { buildVehicleHubUrl, isVehicleScopedContext, plateMatches, useVehicleUrlContext, readDriverContext } from '@/lib/entityNavContext';
import { recordVehicleHubAction } from '@/lib/vehicleActionFollowUp';
import VehicleScopedNavChrome from '@/components/vehicles/VehicleScopedNavChrome';
import { VEHICLE_EMPTY_LIST_MSG } from '@/lib/vehicleScopedUi';
import { createAccidentIncident } from '@/lib/incidentCreate';
import IncidentSubmitSuccess from '@/components/incidents/IncidentSubmitSuccess';
import { formatIsraelDateTime } from '@/lib/incidentEventNumber';
import { InternalNumber, InternalPrefixSuffix } from '@/components/vehicles/vehiclePlateDisplay';
import { uploadDocument } from '@/lib/uploadDocument';

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
  claim_number: string;
  event_number?: string | null;
  created_at?: string;
  company_name?: string;
  assignee_name?: string | null;
}

const statusLabels: Record<string, { text: string; cls: string }> = {
  open: { text: 'פתוח', cls: 'status-urgent' },
  opened: { text: 'פתוח', cls: 'status-urgent' },
  in_progress: { text: 'בטיפול', cls: 'status-pending' },
  closed: { text: 'סגור', cls: 'status-active' },
};

type ViewMode = 'list' | 'detail' | 'form' | 'success';

export default function Accidents() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const [searchParams] = useSearchParams();
  const { plate: contextPlate, vehicleId: contextVehicleId, action: contextAction, locked } = useVehicleUrlContext();
  const vehicleScoped = isVehicleScopedContext({ locked, plate: contextPlate, vehicleId: contextVehicleId });
  const driverCtx = readDriverContext(searchParams);
  const driverScoped = searchParams.get('context') === 'driver' && !!driverCtx.driverId;

  const goBackToDriver = () => {
    if (!driverCtx.driverId) return;
    const q = new URLSearchParams();
    q.set('driverId', driverCtx.driverId);
    q.set('section', searchParams.get('section') || 'driving');
    navigate(`/drivers?${q.toString()}`);
  };

  const goBackToHub = () => {
    if (vehicleScoped && contextVehicleId) {
      navigate(buildVehicleHubUrl(contextVehicleId));
    }
  };

  const exitFormOrDetail = () => {
    if (vehicleScoped && contextVehicleId) {
      goBackToHub();
      return;
    }
    if (driverScoped) {
      goBackToDriver();
      return;
    }
    setViewMode('list');
    setEditItem(null);
    setSelected(null);
  };

  const afterFormSave = () => {
    if (vehicleScoped && contextVehicleId) {
      goBackToHub();
      return;
    }
    if (driverScoped) {
      goBackToDriver();
      return;
    }
    setViewMode('list');
    setEditItem(null);
    loadAccidents();
  };
  const [accidents, setAccidents] = useState<AccidentRow[]>([]);
  const [search, setSearch] = useState('');
  const [initialVehiclePlate, setInitialVehiclePlate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selected, setSelected] = useState<AccidentRow | null>(null);
  const [editItem, setEditItem] = useState<AccidentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [successPayload, setSuccessPayload] = useState<{
    eventNumber: string;
    id: string;
    createdAt?: string;
    whatsappPreview?: string;
    emailSubject?: string;
    emailHtml?: string;
  } | null>(null);

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

  useEffect(() => {
    const id = searchParams.get('id');
    if (!id || accidents.length === 0) return;
    const found = accidents.find((a) => a.id === id);
    if (found) {
      setSelected(found);
      setViewMode('detail');
    }
  }, [searchParams, accidents]);

  if (viewMode === 'success' && successPayload) {
    return (
      <IncidentSubmitSuccess
        kind="accident"
        eventNumber={successPayload.eventNumber}
        createdAt={successPayload.createdAt}
        statusLabel="פתוח"
        viewPath={`/accidents?id=${successPayload.id}`}
        whatsappPreview={successPayload.whatsappPreview}
        emailSubject={successPayload.emailSubject}
        emailHtml={successPayload.emailHtml}
        onClose={() => {
          setSuccessPayload(null);
          afterFormSave();
        }}
      />
    );
  }

  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';

  const filtered = accidents.filter(a => {
    const matchSearch = !search || a.driver_name?.includes(search) || plateMatches(a.vehicle_plate, search) || a.description?.includes(search) || (a.event_number || '').includes(search) || a.claim_number?.includes(search);
    const matchStatus = !filterStatus || a.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const handleStatusChange = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('accidents').update({ status: newStatus }).eq('id', id);
    if (error) { toast.error('שגיאה'); } else { toast.success('סטטוס עודכן'); loadAccidents(); }
  };

  const handleTakeTreatment = async (a: AccidentRow) => {
    const { error } = await supabase.from('accidents').update({
      status: 'in_progress',
      assignee_id: user?.id,
      assignee_name: user?.full_name || '',
    }).eq('id', a.id);
    if (error) toast.error('שגיאה');
    else {
      toast.success('התאונה בטיפול שלך');
      loadAccidents();
      setSelected({ ...a, status: 'in_progress', assignee_name: user?.full_name || '' });
    }
  };

  if (viewMode === 'form') {
    return (
      <div className="animate-fade-in">
        <VehicleScopedNavChrome
          vehicleId={contextVehicleId}
          plate={contextPlate}
          pageLabel="תאונה"
          active={vehicleScoped}
        />
        <AccidentForm
          accident={editItem}
          initialVehiclePlate={initialVehiclePlate}
          initialDriverName={driverCtx.driverName || undefined}
          plateLocked={vehicleScoped && !!initialVehiclePlate}
          hubVehicleId={vehicleScoped ? contextVehicleId : undefined}
          onDone={afterFormSave}
          onCreated={(payload) => {
            setEditItem(null);
            setSuccessPayload(payload);
            setViewMode('success');
            loadAccidents();
          }}
          onBack={exitFormOrDetail}
          user={user}
        />
      </div>
    );
  }

  if (viewMode === 'detail' && selected) {
    const a = selected;
    const st = statusLabels[a.status] || statusLabels.open;
    return (
      <div className="animate-fade-in">
        <VehicleScopedNavChrome
          vehicleId={contextVehicleId}
          plate={contextPlate}
          pageLabel="תאונה"
          active={vehicleScoped}
        />
        <button
          onClick={() => {
            if (vehicleScoped && contextVehicleId) {
              goBackToHub();
            } else if (driverScoped) {
              goBackToDriver();
            } else {
              setViewMode('list');
              setSelected(null);
            }
          }}
          className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]"
        >
          <ArrowRight size={20} /> {vehicleScoped ? 'חזרה לכרטיס הרכב' : driverScoped ? 'חזרה לכרטיס הנהג' : 'חזרה'}
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
            <div><span className="text-muted-foreground text-sm">מספר תביעה</span><p className="font-bold">{a.claim_number || '—'}</p></div>
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
                <DocumentGallery urls={imgs} title="תמונות מהתאונה" />
              </div>
            ) : null;
          })()}
          <AccidentDocuments accident={a} user={user} />
          {a.notes && <p className="mt-4 p-3 bg-muted rounded-xl text-muted-foreground">{a.notes}</p>}

          {/* Share buttons */}
          <div className="mt-6 space-y-3">
            <h3 className="text-lg font-bold">שיתוף ושליחה</h3>
            <div className="flex gap-3 flex-wrap">
              <a
                href={`mailto:?subject=${encodeURIComponent(`דיווח תאונה - ${a.vehicle_plate}`)}&body=${encodeURIComponent(
                  `דיווח תאונה - ${a.vehicle_plate}\n\nמספר תביעה: ${a.claim_number || '—'}\nנהג: ${a.driver_name}\nמיקום: ${a.location || '—'}\nתאריך: ${a.date ? new Date(a.date).toLocaleDateString('he-IL') : '—'}\nתיאור: ${a.description}\nעלות משוערת: ₪${(a.estimated_cost || 0).toLocaleString()}\nביטוח: ${a.has_insurance ? 'כן' : 'לא'}\nצד ג׳: ${a.third_party ? 'כן' : 'לא'}\n${a.notes ? `הערות: ${a.notes}\n` : ''}${(() => { let imgs: string[] = []; try { imgs = a.images ? JSON.parse(a.images) : []; } catch { if (a.images) imgs = [a.images]; } return imgs.length > 0 ? `\nתמונות:\n${imgs.join('\n')}` : ''; })()}`
                )}`}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-base min-h-[48px]"
              >
                <Mail size={20} /> שלח באימייל
              </a>
              <button
                onClick={() => {
                  let imgs: string[] = [];
                  try { imgs = a.images ? JSON.parse(a.images) : []; } catch { if (a.images) imgs = [a.images]; }
                  const text = `דיווח תאונה - ${a.vehicle_plate}\nמספר תביעה: ${a.claim_number || '—'}\nנהג: ${a.driver_name}\nתיאור: ${a.description}${imgs.length > 0 ? '\n\nתמונות:\n' + imgs.join('\n') : ''}`;
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
            { key: 'claim_number', label: 'מספר תביעה' },
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
      <VehicleScopedNavChrome
        vehicleId={contextVehicleId}
        plate={contextPlate}
        pageLabel="תאונות"
        active={vehicleScoped}
      />
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
                      {a.claim_number && <span>📄 {a.claim_number}</span>}
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

interface AccidentDocumentVersion {
  id: string;
  file_path: string;
  public_url: string;
  original_name: string;
  created_at: string;
}

function AccidentDocuments({ accident, user }: { accident: AccidentRow; user: any }) {
  const [documents, setDocuments] = useState<AccidentDocumentVersion[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);

  useEffect(() => {
    let query = supabase
      .from('document_versions')
      .select('id, file_path, public_url, original_name, created_at')
      .eq('entity_type', 'accident')
      .eq('entity_id', accident.id)
      .order('created_at', { ascending: false });
    const company = accident.company_name || user?.company_name || '';
    if (company) query = query.eq('company_name', company);
    void query.then(({ data }) => {
      setDocuments((data as AccidentDocumentVersion[]) || []);
      setLoadingDocuments(false);
    });
  }, [accident.id, accident.company_name, user?.company_name]);

  return (
    <div className="mt-4 rounded-xl border border-border p-4">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
        <FileText size={20} /> מסמכי תאונה
      </h2>
      {loadingDocuments ? (
        <p className="text-sm text-muted-foreground">טוען מסמכים...</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">לא הועלו מסמכים לתאונה זו</p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              url={doc.public_url || supabase.storage.from('documents').getPublicUrl(doc.file_path).data.publicUrl}
              fileName={doc.original_name}
              meta={<span className="text-xs text-muted-foreground">תביעה {accident.claim_number} · {new Date(accident.date).toLocaleDateString('he-IL')}</span>}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccidentForm({
  accident,
  initialVehiclePlate = '',
  initialDriverName = '',
  plateLocked = false,
  hubVehicleId,
  onDone,
  onCreated,
  onBack,
  user,
}: {
  accident: AccidentRow | null;
  initialVehiclePlate?: string;
  initialDriverName?: string;
  plateLocked?: boolean;
  hubVehicleId?: string;
  onDone: () => void;
  onCreated?: (payload: {
    eventNumber: string;
    id: string;
    createdAt?: string;
    whatsappPreview?: string;
    emailSubject?: string;
    emailHtml?: string;
  }) => void;
  onBack: () => void;
  user: any;
}) {
  const isEdit = !!accident;
  const { vehicle, vehicles, isDriver, hasNoVehicle, phone } = useDriverVehicle();
  
  const [vehiclePlate, setVehiclePlate] = useState(accident?.vehicle_plate || initialVehiclePlate);
  const [vehicleId, setVehicleId] = useState(hubVehicleId || '');
  const [driverName, setDriverName] = useState(
    accident?.driver_name || initialDriverName || user?.full_name || '',
  );
  const [location, setLocation] = useState(accident?.location || '');
  const [description, setDescription] = useState(accident?.description || '');
  const [hasInsurance, setHasInsurance] = useState(accident?.has_insurance || false);
  const [thirdParty, setThirdParty] = useState(accident?.third_party || false);
  const [estimatedCost, setEstimatedCost] = useState(accident?.estimated_cost?.toString() || '');
  const [claimNumber, setClaimNumber] = useState(accident?.claim_number || '');
  const [notes, setNotes] = useState(accident?.notes || '');
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>(() => {
    if (!accident?.images) return [];
    try { return JSON.parse(accident.images); } catch { return accident.images ? [accident.images] : []; }
  });
  const [loading, setLoading] = useState(false);

  const [allVehicles, setAllVehicles] = useState<{ id: string; license_plate: string; manufacturer: string; model: string; internal_number: string | null; company_name: string }[]>([]);
  useEffect(() => {
    if (!isDriver) {
      supabase.from('vehicles').select('id, license_plate, manufacturer, model, internal_number, company_name').then(({ data }) => {
        if (data) setAllVehicles(data as typeof allVehicles);
      });
    }
  }, [isDriver]);

  useEffect(() => {
    if (isDriver && !isEdit) {
      if (vehicles.length === 1) {
        setVehiclePlate(vehicles[0].license_plate);
        setVehicleId(vehicles[0].id);
      } else if (initialVehiclePlate) {
        const m = vehicles.find((v) => v.license_plate === initialVehiclePlate);
        if (m) {
          setVehiclePlate(m.license_plate);
          setVehicleId(m.id);
        }
      }
      if (user?.full_name) setDriverName(user.full_name);
    }
  }, [isDriver, vehicles, isEdit, user, initialVehiclePlate]);

  const vehicleOptions = isDriver
    ? vehicles.map((v) => ({
        id: v.id,
        license_plate: v.license_plate,
        manufacturer: v.manufacturer || '',
        model: v.model || '',
        internal_number: v.internal_number,
        company_name: v.company_name || user?.company_name || '',
      }))
    : allVehicles;
  const selectedVehicleOption = vehicleOptions.find((v) => v.license_plate === vehiclePlate);
  const incidentCompanyName = selectedVehicleOption?.company_name || user?.company_name || '';

  const isValid = !!vehiclePlate && !!driverName && !!description && !!claimNumber.trim() && !(isDriver && hasNoVehicle);
  const inputClass = "w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  const uploadAccidentDocuments = async (savedAccident: AccidentRow) => {
    if (documentFiles.length === 0) return true;
    let allUploaded = true;
    for (const file of documentFiles) {
      const result = await uploadDocument({
        file,
        storageFolder: 'accident-documents',
        category: 'accident-document',
        companyName: savedAccident.company_name || user?.company_name || '',
        vehiclePlate: savedAccident.vehicle_plate || vehiclePlate,
        driverName: savedAccident.driver_name || driverName,
        displayName: `${savedAccident.claim_number || claimNumber.trim()} — ${file.name}`,
        documentDate: savedAccident.date?.slice(0, 10),
        accidentId: savedAccident.id,
        claimNumber: savedAccident.claim_number || claimNumber.trim(),
      });
      if (!result.ok) {
        allUploaded = false;
        toast.error(`שגיאה בהעלאת ${file.name}: ${result.error}`);
      }
    }
    if (allUploaded) {
      toast.success(`${documentFiles.length} מסמכי תאונה הועלו`);
      setDocumentFiles([]);
    }
    return allUploaded;
  };

  const handleSubmit = async () => {
    if (!claimNumber.trim()) {
      toast.error('חובה להזין מספר תביעה');
      return;
    }
    if (!isValid || loading) return;
    setLoading(true);
    if (isEdit) {
      const payload = {
        vehicle_plate: vehiclePlate,
        driver_name: driverName,
        location,
        description,
        has_insurance: hasInsurance,
        third_party: thirdParty,
        estimated_cost: parseFloat(estimatedCost) || 0,
        claim_number: claimNumber.trim(),
        notes,
        images: JSON.stringify(imageUrls),
      };
      const { data: updated, error } = await supabase.from('accidents').update(payload).eq('id', accident!.id).select('*').single();
      if (!error && updated) await uploadAccidentDocuments(updated as AccidentRow);
      setLoading(false);
      if (error) toast.error('שגיאה');
      else { toast.success('עודכן'); onDone(); }
      return;
    }

    const result = await createAccidentIncident({
      user: {
        id: user?.id,
        role: user?.role,
        company_name: incidentCompanyName,
        full_name: user?.full_name,
        phone: phone || user?.phone,
      },
      vehiclePlate,
      vehicleId: vehicleId || hubVehicleId,
      driverName,
      location,
      description,
      hasInsurance,
      thirdParty,
      estimatedCost: parseFloat(estimatedCost) || 0,
      claimNumber: claimNumber.trim(),
      notes,
      images: imageUrls,
      dryRunNotify: false,
    });

    if (!result.error && result.data && hubVehicleId) {
      await recordVehicleHubAction({
        vehicleId: hubVehicleId || result.vehicle?.id,
        vehiclePlate,
        companyName: incidentCompanyName,
        action: 'דיווח תאונה',
        details: description,
        userId: user?.id,
        userName: user?.full_name,
      });
    }

    if (result.error) {
      setLoading(false);
      toast.error('שגיאה');
      console.error(result.error);
      return;
    }
    await uploadAccidentDocuments(result.data as AccidentRow);
    setLoading(false);
    toast.success('דיווח נשמר');
    onCreated?.({
      eventNumber: result.data.event_number || '',
      id: result.data.id,
      createdAt: result.data.created_at || result.data.date,
      whatsappPreview: result.notify?.whatsappPreview,
      emailSubject: result.notify?.emailSubject,
      emailHtml: result.notify?.emailHtml,
    });
  };

  return (
    <div className="animate-fade-in">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]"><ArrowRight size={20} /> חזרה</button>
      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'עריכת תאונה' : 'דיווח תאונה'}</h1>
      {isDriver && hasNoVehicle && (
        <div className="mb-4 rounded-2xl border-2 border-destructive/40 bg-destructive/10 p-4 text-destructive font-medium">
          אין רכב מורשה לדיווח. פנה למנהל הצי.
        </div>
      )}
      <div className="space-y-5">
        {(isDriver && vehicle && !isEdit && vehicles.length === 1) || (plateLocked && !isEdit) ? (
          <div>
            <label className="block text-lg font-medium mb-2">רכב משויך</label>
            <div className="w-full p-4 text-lg rounded-xl border-2 border-input bg-muted/50">
              <p className="font-bold">{vehiclePlate}</p>
              {vehicle?.internal_number && (
                <p className="text-sm text-muted-foreground">
                  מספר פנימי: <InternalNumber value={vehicle.internal_number} />
                </p>
              )}
              {!plateLocked && vehicle && (
                <p className="text-sm text-muted-foreground">{vehicle.manufacturer} {vehicle.model}</p>
              )}
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-lg font-medium mb-2">רכב *</label>
            <select
              value={vehiclePlate}
              onChange={(e) => {
                setVehiclePlate(e.target.value);
                const m = vehicleOptions.find((v) => v.license_plate === e.target.value);
                setVehicleId(m?.id || '');
              }}
              className={inputClass}
            >
              <option value="">בחר...</option>
              {vehicleOptions.map((v) => (
                <option key={v.id || v.license_plate} value={v.license_plate}>
                  {v.license_plate}
                  {v.internal_number ? ` · פנימי ${v.internal_number}` : ''}
                  {` — ${v.manufacturer || ''} ${v.model || ''}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {isDriver && !isEdit ? (
          <div>
            <label className="block text-lg font-medium mb-2">נהג</label>
            <div className="w-full p-4 text-lg rounded-xl border-2 border-input bg-muted/50 font-bold">{driverName}</div>
            <label className="block text-lg font-medium mb-2 mt-3">טלפון</label>
            <div className="w-full p-4 text-lg rounded-xl border-2 border-input bg-muted/50">{phone || user?.phone || '—'}</div>
          </div>
        ) : (
          <div>
            <label className="block text-lg font-medium mb-2">נהג *</label>
            <input value={driverName} onChange={(e) => setDriverName(e.target.value)} className={inputClass} />
          </div>
        )}

        <div>
          <label className="block text-lg font-medium mb-2">מיקום</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} placeholder="כתובת / מקום האירוע" />
        </div>
        <div>
          <label className="block text-lg font-medium mb-2">תיאור *</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${inputClass} resize-none`} />
        </div>
        <div>
          <label className="block text-lg font-medium mb-2">מספר תביעה *</label>
          <input
            value={claimNumber}
            onChange={(e) => setClaimNumber(e.target.value)}
            className={inputClass}
            required
            aria-required="true"
            placeholder="הזן מספר תביעה"
          />
          {!claimNumber.trim() && <p className="mt-1 text-sm text-destructive">חובה להזין מספר תביעה לפני השמירה</p>}
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-lg">
            <input type="checkbox" checked={hasInsurance} onChange={(e) => setHasInsurance(e.target.checked)} />
            יש ביטוח
          </label>
          <label className="flex items-center gap-2 text-lg">
            <input type="checkbox" checked={thirdParty} onChange={(e) => setThirdParty(e.target.checked)} />
            מעורבות צד ג׳
          </label>
        </div>
        <div>
          <label className="block text-lg font-medium mb-2">עלות משוערת</label>
          <input value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} type="number" className={inputClass} />
        </div>
        <div>
          <label className="block text-lg font-medium mb-2">הערות</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
        </div>
        <MultiImageUpload label="תמונות (אופציונלי)" imageUrls={imageUrls} onImagesChanged={setImageUrls} folder="accidents" max={10} />
        <div className="rounded-xl border-2 border-dashed border-input p-4">
          <label className="block text-lg font-medium mb-2">העלאת מסמכי תאונה</label>
          <p className="text-sm text-muted-foreground mb-3">PDF, טופס תביעה, מסמך ביטוח, אישור משטרה, שמאות או מסמך נוסף</p>
          <label className="inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded-xl bg-muted px-4 py-3 font-bold hover:bg-muted/80">
            <Upload size={19} />
            בחירת מסמכים
            <input
              type="file"
              multiple
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              onChange={(e) => setDocumentFiles(Array.from(e.target.files || []))}
            />
          </label>
          {documentFiles.length > 0 && (
            <div className="mt-3 space-y-1">
              {documentFiles.map((file) => (
                <p key={`${file.name}-${file.lastModified}`} className="flex items-center gap-2 text-sm">
                  <FileText size={15} /> {file.name}
                </p>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={handleSubmit} disabled={!isValid || loading}
          className={`w-full py-5 rounded-2xl text-xl font-bold transition-all ${isValid && !loading ? 'bg-primary text-primary-foreground shadow-lg' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
          {loading ? 'שולח...' : isEdit ? 'עדכן' : 'שלח דיווח'}
        </button>
      </div>
    </div>
  );
}
