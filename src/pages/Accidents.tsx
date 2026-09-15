import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Plus, ArrowRight, Search, Edit2, Mail, Share2, Download, ExternalLink, FileText, Upload, Eye, File } from 'lucide-react';
import { exportToCsv } from '@/utils/exportCsv';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { useDriverVehicle } from '@/hooks/useDriverVehicle';
import { DocumentPreviewDialog } from '@/components/documents/DocumentViewer';
import MultiImageUpload from '@/components/MultiImageUpload';
import { buildVehicleContextUrl, buildVehicleHubUrl, isVehicleScopedContext, useVehicleUrlContext, readDriverContext } from '@/lib/entityNavContext';
import {
  accidentBelongsToVehicle,
  accidentMatchesSearch,
  findVehicleIdentity,
  type VehicleIdentity,
} from '@/lib/accidentListFilter';
import { recordVehicleHubAction } from '@/lib/vehicleActionFollowUp';
import VehicleScopedNavChrome from '@/components/vehicles/VehicleScopedNavChrome';
import { VEHICLE_EMPTY_LIST_MSG } from '@/lib/vehicleScopedUi';
import { createAccidentIncident } from '@/lib/incidentCreate';
import IncidentSubmitSuccess from '@/components/incidents/IncidentSubmitSuccess';
import { formatIsraelDateTime } from '@/lib/incidentEventNumber';
import { InternalNumber } from '@/components/vehicles/vehiclePlateDisplay';
import {
  currentAuthUserId,
  loadAccidentAttachedDocuments,
  parseAccidentImages,
  resolveAccidentFileUrl,
  uploadAccidentAttachedFile,
  type AccidentAttachedDoc,
} from '@/lib/accidentDocuments';
import { fileNameFromDocument, getDocumentKind } from '@/lib/documentDisplayUtils';
import { buildStoragePath } from '@/lib/storage';

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

  const afterFormSave = (savedId?: string) => {
    setEditItem(null);
    if (savedId) {
      const q = new URLSearchParams();
      if (vehicleScoped) {
        if (contextPlate) q.set('plate', contextPlate);
        if (contextVehicleId) q.set('vehicleId', contextVehicleId);
        q.set('context', 'vehicle');
      }
      q.set('id', savedId);
      loadAccidents();
      navigate(`/accidents?${q.toString()}`, { replace: true });
      setViewMode('detail');
      return;
    }
    if (vehicleScoped && contextVehicleId) {
      goBackToHub();
      return;
    }
    if (driverScoped) {
      goBackToDriver();
      return;
    }
    setViewMode('list');
    setSelected(null);
    loadAccidents();
  };
  const [accidents, setAccidents] = useState<AccidentRow[]>([]);
  const [vehicleIdentities, setVehicleIdentities] = useState<VehicleIdentity[]>([]);
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
    const [{ data }, vehiclesRes] = await Promise.all([
      applyCompanyScope(supabase.from('accidents').select('*'), companyFilter).order('created_at', { ascending: false }),
      applyCompanyScope(
        supabase.from('vehicles').select('license_plate, internal_number, department'),
        companyFilter,
      ),
    ]);
    if (data) setAccidents(data as AccidentRow[]);
    setVehicleIdentities(
      (vehiclesRes.data || []).map((v) => ({
        plate: v.license_plate || '',
        internal_number: v.internal_number,
        department: v.department,
      })),
    );
    setLoading(false);
  };

  useEffect(() => { loadAccidents(); }, []);

  useEffect(() => {
    if (contextPlate) {
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
    if (!found) return;
    setSelected(found);
    setViewMode((mode) => (mode === 'form' || mode === 'success' ? mode : 'detail'));
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
          const savedId = successPayload.id;
          setSuccessPayload(null);
          afterFormSave(savedId);
        }}
      />
    );
  }

  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';

  const scopedAccidents = accidents.filter((a) =>
    vehicleScoped ? accidentBelongsToVehicle(a, contextPlate) : true,
  );

  const filtered = scopedAccidents.filter((a) => {
    const identity = findVehicleIdentity(vehicleIdentities, a.vehicle_plate);
    const matchSearch = accidentMatchesSearch(a, search, identity);
    const matchStatus = !filterStatus || a.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const accidentsListUrl = vehicleScoped
    ? buildVehicleContextUrl('/accidents', {
        plate: contextPlate,
        vehicleId: contextVehicleId || undefined,
      })
    : '/accidents';

  const backFromDetailToList = () => {
    if (driverScoped) {
      goBackToDriver();
      return;
    }
    setSelected(null);
    setViewMode('list');
    navigate(accidentsListUrl, { replace: true });
  };

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
          onDone={() => afterFormSave(editItem?.id)}
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
          onClick={backFromDetailToList}
          className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]"
        >
          <ArrowRight size={20} /> {driverScoped ? 'חזרה לכרטיס הנהג' : 'חזרה לרשימת התאונות'}
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
            <div>
              <span className="text-muted-foreground text-sm">מספר פנימי</span>
              <p className="font-bold"><InternalNumber value={findVehicleIdentity(vehicleIdentities, a.vehicle_plate)?.internal_number} /></p>
            </div>
            <div>
              <span className="text-muted-foreground text-sm">מחלקה</span>
              <p className="font-bold">{findVehicleIdentity(vehicleIdentities, a.vehicle_plate)?.department?.trim() || '—'}</p>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            {a.has_insurance && <span className="status-badge status-active">ביטוח ✓</span>}
            {a.third_party && <span className="status-badge status-pending">צד ג׳</span>}
          </div>
          {(() => {
            const imgs = parseAccidentImages(a.images);
            return (
              <div className="mt-4" data-testid="accident-images">
                {imgs.length > 0 ? (
                  <AccidentImageGallery urls={imgs} />
                ) : (
                  <p className="text-sm text-muted-foreground mb-2">אין תמונות לתאונה זו</p>
                )}
                <AccidentImageUpload
                  imageUrls={imgs}
                  onImagesChanged={async (urls) => {
                    const { error } = await supabase
                      .from('accidents')
                      .update({ images: JSON.stringify(urls) })
                      .eq('id', a.id);
                    if (error) {
                      toast.error('שגיאה בשמירת התמונות');
                      return;
                    }
                    setSelected({ ...a, images: JSON.stringify(urls) });
                    loadAccidents();
                  }}
                />
              </div>
            );
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
        <h1 className="page-header !mb-0 flex items-center gap-3"><AlertTriangle size={28} /> {vehicleScoped ? 'תאונות הרכב' : 'תאונות'}</h1>
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
      {vehicleScoped && (
        <p className="text-sm text-muted-foreground mb-3">
          מוצגות תאונות הרכב הזה בלבד. {scopedAccidents.length} רשומות לפי הרשאות.
        </p>
      )}
      <div className="relative mb-4">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש לפי מספר רכב, מספר פנימי, מחלקה, נהג או תביעה..."
          className="w-full pr-12 p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none"
        />
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
            const identity = findVehicleIdentity(vehicleIdentities, a.vehicle_plate);
            return (
              <button
                key={a.id}
                onClick={() => {
                  setSelected(a);
                  setViewMode('detail');
                  const q = new URLSearchParams(searchParams);
                  q.set('id', a.id);
                  navigate(`/accidents?${q.toString()}`);
                }}
                className="card-elevated w-full text-right hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle size={28} className="text-destructive" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xl font-bold">{a.vehicle_plate}</p>
                      <span className={`status-badge ${st.cls}`}>{st.text}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">
                      מספר פנימי: <InternalNumber value={identity?.internal_number} className="text-sm" />
                      {' · '}מחלקה: {identity?.department?.trim() || '—'}
                    </p>
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

async function downloadAccidentBlob(urlOrPath: string, fileName: string) {
  const signed = await resolveAccidentFileUrl(urlOrPath);
  if (!signed) {
    toast.error('לא ניתן לפתוח או להוריד את הקובץ');
    return;
  }
  try {
    const res = await fetch(signed);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(href);
  } catch {
    window.open(signed, '_blank', 'noopener,noreferrer');
  }
}

function AccidentThumb({ url, fileName, onOpen }: { url: string; fileName: string; onOpen: () => void }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let cancelled = false;
    void resolveAccidentFileUrl(url).then((next) => {
      if (!cancelled) setSrc(next);
    });
    return () => { cancelled = true; };
  }, [url]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative overflow-hidden rounded-xl border border-border aspect-square hover:ring-2 hover:ring-primary/40"
      title="תצוגה מלאה"
    >
      {src ? (
        <img src={src} alt={fileName} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">לחץ לפתיחה</span>
      )}
    </button>
  );
}

function AccidentImageGallery({ urls }: { urls: string[] }) {
  const [preview, setPreview] = useState<{ url: string; fileName: string } | null>(null);

  const open = async (url: string, fileName: string) => {
    const signed = await resolveAccidentFileUrl(url);
    if (!signed) {
      toast.error('לא ניתן לפתוח את התמונה');
      return;
    }
    setPreview({ url: signed, fileName });
  };

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-muted-foreground">תמונות מהתאונה ({urls.length})</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {urls.map((url, i) => {
          const fileName = fileNameFromDocument(url, `תמונה ${i + 1}`);
          return (
            <AccidentThumb
              key={`${url}-${i}`}
              url={url}
              fileName={fileName}
              onOpen={() => { void open(url, fileName); }}
            />
          );
        })}
      </div>
      <DocumentPreviewDialog
        open={!!preview}
        url={preview?.url ?? null}
        fileName={preview?.fileName}
        onOpenChange={(openDialog) => { if (!openDialog) setPreview(null); }}
      />
    </div>
  );
}

function AccidentFileCard({
  url,
  fileName,
  meta,
  compact = false,
}: {
  url: string;
  fileName: string;
  meta?: ReactNode;
  compact?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [thumb, setThumb] = useState('');
  const kind = getDocumentKind(`${fileName} ${url}`);

  useEffect(() => {
    if (kind !== 'image') return;
    let cancelled = false;
    void resolveAccidentFileUrl(url).then((next) => {
      if (!cancelled) setThumb(next);
    });
    return () => { cancelled = true; };
  }, [kind, url]);

  const open = async () => {
    const signed = await resolveAccidentFileUrl(url);
    if (!signed) {
      toast.error('לא ניתן לפתוח את הקובץ');
      return;
    }
    if (kind === 'image' || kind === 'pdf') {
      setPreview(signed);
      return;
    }
    await downloadAccidentBlob(signed, fileName);
  };

  return (
    <>
      <div className={`card-elevated flex items-center gap-3 ${compact ? 'p-2.5' : 'p-3'}`}>
        <button
          type="button"
          onClick={() => { void open(); }}
          className={`${compact ? 'h-14 w-14' : 'h-16 w-16'} shrink-0 overflow-hidden rounded-xl border border-border bg-muted`}
        >
          {kind === 'image' && thumb ? (
            <img src={thumb} alt={fileName} className="h-full w-full object-cover" />
          ) : kind === 'pdf' ? (
            <span className="flex h-full w-full flex-col items-center justify-center text-destructive"><FileText size={22} /><span className="text-[10px] font-bold">PDF</span></span>
          ) : (
            <span className="flex h-full w-full items-center justify-center"><File size={22} className="text-muted-foreground" /></span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`truncate font-medium ${compact ? 'text-sm' : ''}`}>{fileName}</p>
          {meta}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {(kind === 'image' || kind === 'pdf') && (
            <button type="button" onClick={() => { void open(); }} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-info hover:bg-info/10">
              <Eye size={16} /> צפייה
            </button>
          )}
          <button
            type="button"
            onClick={() => { void downloadAccidentBlob(url, fileName); }}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10"
          >
            <Download size={16} /> הורדה
          </button>
        </div>
      </div>
      <DocumentPreviewDialog
        open={!!preview}
        url={preview}
        fileName={fileName}
        onOpenChange={(openDialog) => { if (!openDialog) setPreview(null); }}
      />
    </>
  );
}

function AccidentImageUpload({
  imageUrls,
  onImagesChanged,
}: {
  imageUrls: string[];
  onImagesChanged: (urls: string[]) => void | Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const userId = await currentAuthUserId();
    if (!userId) {
      toast.error('יש להתחבר מחדש לפני העלאת תמונה');
      return;
    }
    setUploading(true);
    const path = buildStoragePath(userId, 'accidents', file.name);
    const { error } = await supabase.storage.from('documents').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });
    setUploading(false);
    if (error) {
      toast.error('שגיאה בהעלאת התמונה: ' + error.message);
      return;
    }
    await onImagesChanged([...imageUrls, path]);
    toast.success('התמונה הועלתה');
  };

  return (
    <label className="mt-3 inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded-xl bg-muted px-4 py-3 font-bold hover:bg-muted/80">
      <Upload size={19} />
      {uploading ? 'מעלה...' : 'העלאת תמונה'}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={uploading}
        data-testid="accident-image-upload"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </label>
  );
}

function AccidentDocuments({ accident, user }: { accident: AccidentRow; user: any }) {
  const [documents, setDocuments] = useState<AccidentAttachedDoc[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadDocuments = () => {
    setLoadingDocuments(true);
    void loadAccidentAttachedDocuments({
      id: accident.id,
      claim_number: accident.claim_number,
      vehicle_plate: accident.vehicle_plate,
    }).then(({ docs, error }) => {
      if (error) toast.error('שגיאה בטעינת מסמכי התאונה');
      setDocuments(docs);
      setLoadingDocuments(false);
    });
  };

  useEffect(() => {
    loadDocuments();
  }, [accident.id, accident.claim_number, accident.vehicle_plate]);

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    let allOk = true;
    for (const file of Array.from(files)) {
      const result = await uploadAccidentAttachedFile({
        file,
        storageFolder: 'accident-documents',
        category: 'accident-document',
        companyName: accident.company_name || user?.company_name || '',
        vehiclePlate: accident.vehicle_plate,
        driverName: accident.driver_name,
        displayName: `${accident.claim_number || 'תאונה'} — ${file.name}`,
        documentDate: accident.date?.slice(0, 10),
        accidentId: accident.id,
        claimNumber: accident.claim_number,
      });
      if (!result.ok) {
        allOk = false;
        toast.error(`שגיאה בהעלאת ${file.name}: ${result.error}`);
      }
    }
    setUploading(false);
    if (allOk) toast.success('המסמך הועלה');
    loadDocuments();
  };

  return (
    <div className="mt-4 rounded-xl border border-border p-4" data-testid="accident-documents">
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
            <AccidentFileCard
              key={doc.id}
              url={doc.file_path}
              fileName={doc.original_name}
              meta={<span className="text-xs text-muted-foreground">תביעה {accident.claim_number} · {new Date(accident.date).toLocaleDateString('he-IL')}</span>}
            />
          ))}
        </div>
      )}
      <label className="mt-3 inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded-xl bg-muted px-4 py-3 font-bold hover:bg-muted/80">
        <Upload size={19} />
        {uploading ? 'מעלה...' : 'העלאת קובץ'}
        <input
          type="file"
          multiple
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          disabled={uploading}
          data-testid="accident-file-upload"
          onChange={(e) => {
            void handleUploadFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </label>
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
      const result = await uploadAccidentAttachedFile({
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
