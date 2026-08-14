import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  FileText,
  AlertTriangle,
  StickyNote,
  Car,
  LayoutDashboard,
  Edit2,
  Phone,
  Mail,
  Save,
  Loader2,
  Upload,
  MoreVertical,
  Search,
  Filter,
  Bell,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { buildDriverDashboardUrl, buildDriverAccidentReportUrl } from '@/lib/entityNavContext';
import { EntityContextBanner } from '@/components/EntityContextBanner';
import { DocumentCard, useDocumentPreview } from '@/components/documents/DocumentViewer';
import EntityDocumentRequestsPanel from '@/components/documents/EntityDocumentRequestsPanel';
import AdminUploadDocumentDialog from '@/components/documents/AdminUploadDocumentDialog';
import DriverDeclaration from '@/components/DriverDeclaration';
import DriverExamsTab from '@/components/driving-exam/DriverExamsTab';
import NotificationsAndSendsButton from '@/components/notifications/NotificationsAndSendsButton';
import CreateAlertModal from '@/components/CreateAlertModal';
import { useHiddenButtonsState } from '@/hooks/useHiddenButtons';
import { isDriverHubDashboardHidden } from '@/lib/hiddenButtons';
import {
  loadDriverHubData,
  hubVersionsByType,
  parseDriverHubSection,
  isDocumentsHubSection,
  documentsHubTileValue,
  drivingTileValue,
  activityTileValue,
  DRIVER_LICENSE_TYPE,
  TRAFFIC_INFO_TYPE,
  TRAFFIC_TICKET_TYPE,
  HEALTH_DECLARATION_TYPE,
  type DriverHubSection,
  type DriverHubData,
  type DriverDocumentVersionRow,
  type DriverActivityItem,
  type DriverActivityKind,
} from '@/lib/driverHubData';
import {
  documentExpiryStatusLabel,
  formatIsraelDate,
  daysUntilDate,
} from '@/lib/driverDocumentExpiry';
export interface DriverHubDriver {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  license_number: string;
  license_expiry: string | null;
  license_types: string[];
  city: string;
  street: string;
  status: string;
  notes: string;
  show_notes_on_list?: boolean | null;
  company_name: string;
  id_number: string;
  license_image_url?: string;
  last_exam_date?: string | null;
  exam_expiry?: string | null;
  department?: string | null;
}

type Props = {
  driver: DriverHubDriver;
  isManager: boolean;
  onBack: () => void;
  onEdit: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  fromFleetManager?: boolean;
  filterCompany?: string;
  onNotesSaved?: (patch: { notes: string; show_notes_on_list: boolean }) => void;
};

function HubTile({
  label,
  description,
  status,
  onClick,
}: {
  label: string;
  description: string;
  status?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl p-5 sm:p-6 text-right w-full min-h-[124px] sm:min-h-[148px] border border-white/10 bg-[hsl(218,58%,18%)] hover:bg-[hsl(218,58%,21%)] focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background transition-colors"
    >
      <p className="text-xl sm:text-2xl font-extrabold text-white leading-tight">{label}</p>
      <p className="text-sm text-white/70 mt-2 leading-snug">{description}</p>
      {status ? <p className="text-[11px] text-white/40 mt-1.5 leading-snug">{status}</p> : null}
      <p className="text-sm font-semibold mt-3 text-primary">לחץ לפריט</p>
    </button>
  );
}

function DocVersionCard({ doc }: { doc: DriverDocumentVersionRow }) {
  const statusCls =
    doc.status === 'expired'
      ? 'text-destructive'
      : doc.status === 'warning'
        ? 'text-amber-600'
        : doc.status === 'valid'
          ? 'text-green-700'
          : 'text-muted-foreground';
  return (
    <DocumentCard
      url={doc.public_url}
      fileName={doc.original_name || doc.label_he}
      label={doc.label_he}
      meta={
        <span className="text-xs text-muted-foreground block space-y-0.5">
          <span className="block">הועלה: {formatIsraelDate(doc.created_at)}</span>
          {doc.expiry_date && <span className="block">תוקף: {formatIsraelDate(doc.expiry_date)}</span>}
          <span className={`block font-bold ${statusCls}`}>{documentExpiryStatusLabel(doc.status)}</span>
        </span>
      }
      compact
    />
  );
}

function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2 mb-4 items-center">
      <Filter size={14} className="text-muted-foreground shrink-0" />
      {children}
    </div>
  );
}

function selectCls() {
  return 'p-2 rounded-xl border border-input bg-background text-sm min-h-[40px]';
}

export default function DriverHub({
  driver: d,
  isManager,
  onBack,
  onEdit,
  onArchive,
  onDelete,
  fromFleetManager,
  filterCompany,
  onNotesSaved,
}: Props) {
  const navigate = useNavigate();
  const { hiddenButtons, ready: hiddenReady } = useHiddenButtonsState();
  const showDriverDashboard = hiddenReady && !isDriverHubDashboardHidden(hiddenButtons);
  const [searchParams, setSearchParams] = useSearchParams();
  const [section, setSectionState] = useState<DriverHubSection>(() =>
    parseDriverHubSection(searchParams.get('section')),
  );
  const [hubData, setHubData] = useState<DriverHubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState(d.notes || '');
  const [showNotesOnList, setShowNotesOnList] = useState(!!d.show_notes_on_list);
  const [savingNotes, setSavingNotes] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadPresetType, setUploadPresetType] = useState<string | undefined>();
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const { PreviewDialog } = useDocumentPreview();

  // Documents filters
  const [docTypeFilter, setDocTypeFilter] = useState(searchParams.get('docType') || '');
  const [docStatusFilter, setDocStatusFilter] = useState('all');
  const [docHistoryFilter, setDocHistoryFilter] = useState<'current' | 'history' | 'all'>('current');
  const [docSearch, setDocSearch] = useState('');
  const [docDateFrom, setDocDateFrom] = useState('');
  const [docDateTo, setDocDateTo] = useState('');

  // Driving filters
  const [driveKind, setDriveKind] = useState<'all' | 'exams' | 'accidents'>('all');
  const [driveSearch, setDriveSearch] = useState('');
  const [driveStatus, setDriveStatus] = useState('all');

  // Activity filters
  const [actKind, setActKind] = useState<'all' | DriverActivityKind>('all');
  const [actSearch, setActSearch] = useState('');
  const [actSort, setActSort] = useState<'new' | 'old'>('new');
  const [actDateFrom, setActDateFrom] = useState('');
  const [actDateTo, setActDateTo] = useState('');

  const setSection = useCallback(
    (next: DriverHubSection, extra?: Record<string, string | null>) => {
      setSectionState(next);
      const q = new URLSearchParams(searchParams);
      q.set('driverId', d.id);
      if (next === 'home') q.delete('section');
      else q.set('section', next);
      if (extra) {
        Object.entries(extra).forEach(([k, v]) => {
          if (v == null || v === '') q.delete(k);
          else q.set(k, v);
        });
      }
      setSearchParams(q, { replace: true });
    },
    [d.id, searchParams, setSearchParams],
  );

  useEffect(() => {
    const fromUrl = parseDriverHubSection(searchParams.get('section'));
    setSectionState(fromUrl);
    const dt = searchParams.get('docType');
    if (dt) setDocTypeFilter(dt);
  }, [searchParams]);

  const openUpload = (typeKey?: string) => {
    setUploadPresetType(typeKey);
    setUploadOpen(true);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadDriverHubData({
        driverId: d.id,
        driverName: d.full_name,
        companyName: d.company_name,
        licenseExpiry: d.license_expiry,
        examExpiry: d.exam_expiry,
      });
      setHubData(data);
    } catch {
      setHubData(null);
    } finally {
      setLoading(false);
    }
  }, [d.id, d.full_name, d.company_name, d.license_expiry, d.exam_expiry]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (section !== 'requests' || loading) return;
    const el = document.getElementById('hub-doc-requests');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [section, loading]);

  useEffect(() => {
    setNotes(d.notes || '');
    setShowNotesOnList(!!d.show_notes_on_list);
  }, [d.id, d.notes, d.show_notes_on_list]);

  const saveNotes = async () => {
    setSavingNotes(true);
    const { error } = await supabase
      .from('drivers')
      .update({ notes, show_notes_on_list: showNotesOnList })
      .eq('id', d.id);
    setSavingNotes(false);
    if (error) {
      toast.error('שגיאה בשמירת הערות');
      return;
    }
    toast.success('הערות נשמרו');
    onNotesSaved?.({ notes, show_notes_on_list: showNotesOnList });
  };

  const versions = hubData?.versions || [];
  const allVersions = hubData?.allVersions || [];
  const accidents = hubData?.accidents || [];
  const counters = hubData?.counters;
  const assigned = hubData?.assignedVehicle;

  const docsTile = counters
    ? documentsHubTileValue(counters)
    : { value: '…', warn: false };
  const driveTile = counters ? drivingTileValue(counters) : { value: '…', warn: false };
  const actTile = counters
    ? activityTileValue(counters, !!d.notes?.trim())
    : { value: '…', warn: false };

  const licenseDays = daysUntilDate(d.license_expiry);
  const licenseWarn = licenseDays !== null && licenseDays <= 30;
  const licenseExpired = licenseDays !== null && licenseDays < 0;

  const filteredDocs = useMemo(() => {
    const source = docHistoryFilter === 'current' ? versions : docHistoryFilter === 'history' ? allVersions.filter((v) => !v.is_current) : allVersions;
    return source.filter((doc) => {
      if (docTypeFilter && doc.document_type_key !== docTypeFilter) return false;
      if (docStatusFilter !== 'all' && doc.status !== docStatusFilter) return false;
      if (docSearch.trim()) {
        const q = docSearch.trim().toLowerCase();
        if (
          !doc.label_he.toLowerCase().includes(q) &&
          !(doc.original_name || '').toLowerCase().includes(q) &&
          !doc.document_type_key.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (docDateFrom && doc.created_at.slice(0, 10) < docDateFrom) return false;
      if (docDateTo && doc.created_at.slice(0, 10) > docDateTo) return false;
      return true;
    });
  }, [versions, allVersions, docHistoryFilter, docTypeFilter, docStatusFilter, docSearch, docDateFrom, docDateTo]);

  const filteredAccidents = useMemo(() => {
    return accidents.filter((a) => {
      if (driveStatus !== 'all' && a.status !== driveStatus) return false;
      if (driveSearch.trim()) {
        const q = driveSearch.trim().toLowerCase();
        if (
          !a.vehicle_plate.toLowerCase().includes(q) &&
          !a.status.toLowerCase().includes(q) &&
          !(a.description || '').toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [accidents, driveStatus, driveSearch]);

  const filteredActivity = useMemo(() => {
    let list = [...(hubData?.activity || [])];
    if (actKind !== 'all') list = list.filter((i) => i.kind === actKind);
    if (actSearch.trim()) {
      const q = actSearch.trim().toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          (i.subtitle || '').toLowerCase().includes(q),
      );
    }
    if (actDateFrom) list = list.filter((i) => i.at.slice(0, 10) >= actDateFrom);
    if (actDateTo) list = list.filter((i) => i.at.slice(0, 10) <= actDateTo);
    list.sort((a, b) => {
      const diff = new Date(b.at).getTime() - new Date(a.at).getTime();
      return actSort === 'new' ? diff : -diff;
    });
    return list;
  }, [hubData?.activity, actKind, actSearch, actDateFrom, actDateTo, actSort]);

  const docTypeOptions = useMemo(() => {
    const keys = new Map<string, string>();
    for (const t of hubData?.typeDefs || []) keys.set(t.key, t.label_he);
    for (const v of allVersions) {
      if (!keys.has(v.document_type_key)) keys.set(v.document_type_key, v.label_he);
    }
    return [...keys.entries()];
  }, [hubData?.typeDefs, allVersions]);

  const backLabel = section === 'home' ? 'חזרה לרשימה' : 'חזרה לכרטיס הנהג';

  const sectionTitle: Record<DriverHubSection, string> = {
    home: '',
    documents: 'מסמכים',
    requests: 'מסמכים',
    driving: 'מבחנים ותאונות',
    activity: 'היסטוריה והערות',
  };

  const renderDocuments = () => (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-bold">רישיון ומסמכים</h3>
          <p className="text-xs text-muted-foreground mt-1">
            קבצים שכבר בתיק. העלאה מכאן בלבד. «הצהרת בריאות» כאן היא מסמך קובץ — לא תצהיר הנהג למטה.
          </p>
        </div>
      {isManager && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="gap-2" onClick={() => openUpload()}>
            <Upload size={16} />
            העלה מסמך
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={() => openUpload(DRIVER_LICENSE_TYPE)}>
            העלה רישיון
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={() => openUpload(TRAFFIC_INFO_TYPE)}>
            מידע תעבורתי
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={() => openUpload(HEALTH_DECLARATION_TYPE)}>
            הצהרת בריאות
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={() => openUpload(TRAFFIC_TICKET_TYPE)}>
            דוח תעבורה
          </Button>
        </div>
      )}

      <div className="rounded-xl border border-border p-3 space-y-2">
        <p className="text-sm font-bold">רישיון נהיגה</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground text-xs">מספר</span>
            <p className="font-bold">{d.license_number || '—'}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">תוקף</span>
            <p
              className={`font-bold ${
                licenseExpired ? 'text-destructive' : licenseWarn ? 'text-amber-600' : 'text-green-700'
              }`}
            >
              {d.license_expiry ? formatIsraelDate(d.license_expiry) : '—'}
            </p>
          </div>
        </div>
        {d.license_types?.length > 0 && (
          <p className="text-xs text-muted-foreground">סוגים: {d.license_types.join(', ')}</p>
        )}
        {d.license_image_url && (
          <DocumentCard url={d.license_image_url} fileName="תמונת רישיון" label="רישיון" compact />
        )}
        {hubVersionsByType(versions, DRIVER_LICENSE_TYPE)[0] && (
          <DocVersionCard doc={hubVersionsByType(versions, DRIVER_LICENSE_TYPE)[0]} />
        )}
      </div>

      <FilterBar>
        <select className={selectCls()} value={docTypeFilter} onChange={(e) => setDocTypeFilter(e.target.value)}>
          <option value="">כל הסוגים</option>
          {docTypeOptions.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select className={selectCls()} value={docStatusFilter} onChange={(e) => setDocStatusFilter(e.target.value)}>
          <option value="all">כל הסטטוסים</option>
          <option value="valid">תקף</option>
          <option value="warning">מתקרב</option>
          <option value="expired">פג</option>
          <option value="unknown">ללא תוקף</option>
        </select>
        <select
          className={selectCls()}
          value={docHistoryFilter}
          onChange={(e) => setDocHistoryFilter(e.target.value as typeof docHistoryFilter)}
        >
          <option value="current">נוכחי</option>
          <option value="history">היסטוריה</option>
          <option value="all">הכול</option>
        </select>
        <input type="date" className={selectCls()} value={docDateFrom} onChange={(e) => setDocDateFrom(e.target.value)} />
        <input type="date" className={selectCls()} value={docDateTo} onChange={(e) => setDocDateTo(e.target.value)} />
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          <input
            value={docSearch}
            onChange={(e) => setDocSearch(e.target.value)}
            placeholder="חיפוש…"
            className={`${selectCls()} w-full pr-8`}
          />
        </div>
      </FilterBar>

      {loading && !hubData ? (
        <p className="text-sm text-muted-foreground text-center py-6">טוען…</p>
      ) : filteredDocs.length === 0 ? (
        <div className="text-center py-8 space-y-3">
          <p className="text-sm text-muted-foreground">אין מסמכים תואמים</p>
          {isManager && (
            <Button type="button" onClick={() => openUpload()}>
              העלה מסמך ראשון
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDocs.map((doc) => (
            <DocVersionCard key={doc.id} doc={doc} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        מידע תעבורתי = 3 שנים · הצהרת בריאות (מסמך) = 5 שנים
      </p>
      </section>

      <section id="hub-doc-requests" className="space-y-4 scroll-mt-4">
        <div>
          <h3 className="text-lg font-bold">בקשות מהנהג</h3>
          <p className="text-xs text-muted-foreground mt-1">
            קישור לנהג להעלאה. שונה מהעלאה הישירה למעלה.
          </p>
        </div>
        {!isManager ? (
          <p className="text-sm text-muted-foreground">אין הרשאה לניהול בקשות</p>
        ) : (
          <EntityDocumentRequestsPanel
            entityType="driver"
            entityId={d.id}
            entityLabel={d.full_name}
            recipientName={d.full_name}
            recipientPhone={d.phone}
            recipientEmail={d.email}
            companyName={d.company_name}
            onHubRefresh={() => void refresh()}
            hideUpload
            hideVersions
          />
        )}
      </section>

      {isManager && (
        <section id="hub-doc-declaration" className="space-y-3">
          <div>
            <h3 className="text-lg font-bold">תצהיר נהג</h3>
            <p className="text-xs text-muted-foreground mt-1">
              תהליך חתימה מול הנהג. לא אותו דבר כמו «הצהרת בריאות» (מסמך קובץ) למעלה.
            </p>
          </div>
          <div className="rounded-xl border border-border p-4">
            <DriverDeclaration
              driverId={d.id}
              driverName={d.full_name}
              idNumber={d.id_number}
              licenseNumber={d.license_number}
              companyName={d.company_name}
              driverPhone={d.phone}
              mode="manager"
            />
          </div>
        </section>
      )}
    </div>
  );

  const renderDriving = () => (
    <div className="space-y-6">
      <FilterBar>
        <select
          className={selectCls()}
          value={driveKind}
          onChange={(e) => setDriveKind(e.target.value as typeof driveKind)}
        >
          <option value="all">הכול</option>
          <option value="exams">מבחנים</option>
          <option value="accidents">תאונות</option>
        </select>
        <select className={selectCls()} value={driveStatus} onChange={(e) => setDriveStatus(e.target.value)}>
          <option value="all">כל סטטוסי תאונה</option>
          {[...new Set(accidents.map((a) => a.status))].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          value={driveSearch}
          onChange={(e) => setDriveSearch(e.target.value)}
          placeholder="חיפוש רכב / תיאור…"
          className={`${selectCls()} flex-1 min-w-[140px]`}
        />
      </FilterBar>

      {(driveKind === 'all' || driveKind === 'exams') && (
        <div className="space-y-2">
          <h3 className="text-lg font-bold">מבחני כשירות נהיגה</h3>
          {d.exam_expiry && (
            <p className={`text-sm ${examNeedsAttentionClass(d.exam_expiry)}`}>
              תוקף מבחן: {formatIsraelDate(d.exam_expiry)}
            </p>
          )}
          <DriverExamsTab
            driverId={d.id}
            driverName={d.full_name}
            driverIdNumber={d.id_number}
            driverPhone={d.phone}
            companyName={d.company_name}
            vehiclePlate={assigned?.license_plate}
          />
        </div>
      )}

      {(driveKind === 'all' || driveKind === 'accidents') && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold">תאונות</h3>
            {isManager && (
              <Button
                type="button"
                className="gap-2"
                onClick={() =>
                  navigate(
                    buildDriverAccidentReportUrl({
                      driverId: d.id,
                      driverName: d.full_name,
                      plate: assigned?.license_plate,
                    }),
                  )
                }
              >
                <AlertTriangle size={16} />
                דווח על תאונה
              </Button>
            )}
          </div>
          {filteredAccidents.length === 0 ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-muted-foreground">אין תאונות רשומות לנהג זה</p>
              {isManager && (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() =>
                    navigate(
                      buildDriverAccidentReportUrl({
                        driverId: d.id,
                        driverName: d.full_name,
                        plate: assigned?.license_plate,
                      }),
                    )
                  }
                >
                  <AlertTriangle size={16} />
                  דווח על תאונה
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3 md:space-y-0">
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-2 text-right">תאריך</th>
                      <th className="p-2 text-right">רכב</th>
                      <th className="p-2 text-right">סטטוס</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAccidents.map((a) => (
                      <tr key={a.id} className="border-b border-border/50">
                        <td className="p-2 whitespace-nowrap">{formatIsraelDate(a.date)}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono">{a.vehicle_plate}</span>
                            {a.imageUrls.slice(0, 2).map((url, i) => (
                              <img
                                key={i}
                                src={url}
                                alt=""
                                className="w-8 h-8 rounded object-cover border border-border shrink-0"
                              />
                            ))}
                          </div>
                        </td>
                        <td className="p-2">{a.status}</td>
                        <td className="p-2">
                          <Link
                            to={`/accidents?id=${a.id}`}
                            className="text-primary font-bold text-sm whitespace-nowrap"
                          >
                            פתח תאונה →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden space-y-3">
                {filteredAccidents.map((a) => (
                  <div key={a.id} className="rounded-xl border border-border p-3 space-y-2">
                    <div className="flex justify-between gap-2">
                      <span className="font-bold font-mono">{a.vehicle_plate}</span>
                      <span className="text-xs text-muted-foreground">{formatIsraelDate(a.date)}</span>
                    </div>
                    <p className="text-sm">{a.status}</p>
                    {a.imageUrls.length > 0 && (
                      <div className="flex gap-1 overflow-x-auto">
                        {a.imageUrls.slice(0, 3).map((url, i) => (
                          <img key={i} src={url} alt="" className="w-12 h-12 rounded object-cover border border-border shrink-0" />
                        ))}
                      </div>
                    )}
                    <Link to={`/accidents?id=${a.id}`} className="text-primary font-bold text-sm inline-block">
                      פתח תאונה →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderActivity = () => (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <StickyNote size={18} />
          הערות לנהג
        </h3>
        <p className="text-xs text-muted-foreground">נשמר ב-drivers.notes — ללא היסטוריית גרסאות</p>
        {isManager ? (
          <>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full p-4 rounded-xl border-2 border-input bg-background text-sm resize-none"
              placeholder="הערות על הנהג…"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showNotesOnList}
                onChange={(e) => setShowNotesOnList(e.target.checked)}
              />
              הצג ברשימת הנהגים
            </label>
            <Button type="button" className="w-full gap-2" onClick={() => void saveNotes()} disabled={savingNotes}>
              {savingNotes ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              שמור הערות
            </Button>
          </>
        ) : (
          <div className="rounded-xl bg-muted p-4 text-sm">{notes || 'אין הערות'}</div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-bold">היסטוריה מתועדת</h3>
        <p className="text-xs text-muted-foreground">
          רק אירועים עם חותמת זמן ממקורות קיימים — לא audit מלא של שינויי שדות
        </p>
        <FilterBar>
          <select
            className={selectCls()}
            value={actKind}
            onChange={(e) => setActKind(e.target.value as typeof actKind)}
          >
            <option value="all">כל הסוגים</option>
            <option value="document_version">מסמכים</option>
            <option value="document_request">בקשות</option>
            <option value="accident">תאונות</option>
            <option value="declaration">תצהירים</option>
            <option value="exam">מבחנים</option>
          </select>
          <select className={selectCls()} value={actSort} onChange={(e) => setActSort(e.target.value as 'new' | 'old')}>
            <option value="new">חדש → ישן</option>
            <option value="old">ישן → חדש</option>
          </select>
          <input type="date" className={selectCls()} value={actDateFrom} onChange={(e) => setActDateFrom(e.target.value)} />
          <input type="date" className={selectCls()} value={actDateTo} onChange={(e) => setActDateTo(e.target.value)} />
          <input
            value={actSearch}
            onChange={(e) => setActSearch(e.target.value)}
            placeholder="חיפוש…"
            className={`${selectCls()} flex-1 min-w-[140px]`}
          />
        </FilterBar>

        {filteredActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">אין פעילות מתועדת עדיין</p>
        ) : (
          <ul className="space-y-2">
            {filteredActivity.map((item: DriverActivityItem) => (
              <li key={item.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex justify-between gap-2 flex-wrap">
                  <span className="font-bold">{item.title}</span>
                  <span className="text-xs text-muted-foreground">{formatIsraelDate(item.at)}</span>
                </div>
                {item.subtitle && <p className="text-xs text-muted-foreground mt-1">{item.subtitle}</p>}
                {item.href && (
                  item.href.startsWith('http') ? (
                    <a href={item.href} target="_blank" rel="noreferrer" className="text-primary text-xs font-medium">
                      פתח
                    </a>
                  ) : (
                    <Link to={item.href} className="text-primary text-xs font-medium">
                      פתח
                    </Link>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  const renderSectionContent = () => {
    if (isDocumentsHubSection(section)) return renderDocuments();
    if (section === 'driving') return renderDriving();
    if (section === 'activity') return renderActivity();
    return null;
  };

  return (
    <div className="animate-fade-in pb-8">
      {PreviewDialog}
      {isManager && (
        <AdminUploadDocumentDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          entityType="driver"
          entityId={d.id}
          entityLabel={d.full_name}
          companyName={d.company_name}
          defaultDocumentTypeKey={uploadPresetType}
          onUploaded={() => void refresh()}
        />
      )}
      {showAlertModal && (
        <CreateAlertModal
          driverId={d.id}
          driverName={d.full_name}
          onClose={() => setShowAlertModal(false)}
          onCreated={() => {
            setShowAlertModal(false);
            void refresh();
          }}
        />
      )}
      {fromFleetManager && filterCompany && (
        <EntityContextBanner label={`נהגים באחריות מנהל צי · ${filterCompany}`} strict />
      )}

      <button
        type="button"
        onClick={section === 'home' ? onBack : () => setSection('home')}
        className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]"
      >
        <ArrowRight size={20} />
        {backLabel}
      </button>

      {section === 'home' && (
        <>
          <div className="card-elevated mb-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold truncate">{d.full_name}</h1>
                <span
                  className={`status-badge mt-1 inline-flex ${
                    d.status === 'active' ? 'status-active' : 'status-inactive'
                  }`}
                >
                  {d.status === 'active' ? 'פעיל' : d.status === 'archived' ? 'ארכיון' : 'לא פעיל'}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isManager && (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"
                    aria-label="עריכה"
                  >
                    <Edit2 size={18} className="text-primary" />
                  </button>
                )}
                {isManager && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="w-10 h-10 rounded-xl border border-border flex items-center justify-center"
                        aria-label="פעולות נוספות"
                      >
                        <MoreVertical size={18} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem
                        onClick={() =>
                          navigate(
                            `/attach-customer?driverId=${d.id}&driverName=${encodeURIComponent(d.full_name)}`,
                          )
                        }
                      >
                        הצמדת נהג ללקוח
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          navigate(
                            `/work-orders?driverId=${d.id}&driverName=${encodeURIComponent(d.full_name)}`,
                          )
                        }
                      >
                        סידור עבודה
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {d.status !== 'archived' && onArchive && (
                        <DropdownMenuItem onClick={onArchive}>העבר לארכיון</DropdownMenuItem>
                      )}
                      {onDelete && (
                        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                          מחק נהג
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-3">
              <div>
                <span className="text-muted-foreground text-xs">טלפון</span>
                <p className="font-bold">{d.phone || '—'}</p>
              </div>
              {isManager && (
                <div>
                  <span className="text-muted-foreground text-xs">ת.ז</span>
                  <p className="font-bold">{d.id_number || '—'}</p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground text-xs">מחלקה</span>
                <p className="font-bold">{d.department || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">רישיון</span>
                <p className="font-bold">{d.license_number || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">תוקף רישיון</span>
                <p
                  className={`font-bold ${
                    licenseExpired ? 'text-destructive' : licenseWarn ? 'text-amber-600' : ''
                  }`}
                >
                  {d.license_expiry ? formatIsraelDate(d.license_expiry) : '—'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">רכב משויך</span>
                <p className="font-bold flex items-center gap-1">
                  <Car size={14} className="text-muted-foreground shrink-0" />
                  {assigned
                    ? `${assigned.license_plate}${assigned.manufacturer ? ` · ${assigned.manufacturer}` : ''}`
                    : 'אין'}
                </p>
              </div>
            </div>

            {isManager && (
              <div className="mb-4 space-y-2">
                <p className="text-sm font-bold">התראות לנהג</p>
                <Button
                  type="button"
                  className="w-full h-12 font-bold gap-2"
                  onClick={() => setShowAlertModal(true)}
                >
                  <Bell size={18} />
                  הוסף התראה · התראה חופשית
                </Button>
                <NotificationsAndSendsButton driverId={d.id} driverName={d.full_name} />
              </div>
            )}

            <button
              type="button"
              className="text-sm text-primary font-medium mb-4"
              onClick={() => setShowMoreDetails((v) => !v)}
            >
              {showMoreDetails ? 'הסתר פרטים נוספים' : 'הצג פרטים נוספים'}
            </button>

            {showMoreDetails && (
              <div className="grid grid-cols-2 gap-3 text-sm mb-4 p-3 rounded-xl bg-muted/40">
                <div>
                  <span className="text-muted-foreground text-xs">אימייל</span>
                  <p className="font-medium break-all">{d.email || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">כתובת</span>
                  <p className="font-medium">
                    {[d.street, d.city].filter(Boolean).join(', ') || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">סוגי רישיון</span>
                  <p className="font-medium">{d.license_types?.join(', ') || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">חברה</span>
                  <p className="font-medium">{d.company_name || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">מבחן אחרון</span>
                  <p className="font-medium">{d.last_exam_date ? formatIsraelDate(d.last_exam_date) : '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">תוקף מבחן</span>
                  <p className="font-medium">{d.exam_expiry ? formatIsraelDate(d.exam_expiry) : '—'}</p>
                </div>
                {d.license_image_url && (
                  <div className="col-span-2">
                    <DocumentCard url={d.license_image_url} fileName="תמונת רישיון" label="רישיון" compact />
                  </div>
                )}
              </div>
            )}

            {isManager && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {d.phone && (
                  <a
                    href={`tel:${d.phone}`}
                    className="min-h-[48px] rounded-xl bg-primary text-primary-foreground flex items-center justify-center gap-2 font-bold text-sm"
                  >
                    <Phone size={16} /> התקשר
                  </a>
                )}
                {d.email && (
                  <a
                    href={`mailto:${d.email}`}
                    className="min-h-[48px] rounded-xl bg-muted flex items-center justify-center gap-2 font-bold text-sm"
                  >
                    <Mail size={16} /> מייל
                  </a>
                )}
                {showDriverDashboard && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[48px] gap-2"
                  onClick={() => navigate(buildDriverDashboardUrl({ driverId: d.id, driverName: d.full_name }))}
                >
                  <LayoutDashboard size={16} />
                  דשבורד
                </Button>
                )}
                <Button type="button" variant="outline" className="min-h-[48px] gap-2" onClick={onEdit}>
                  <Edit2 size={16} />
                  עריכה
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <HubTile
                label="מסמכים"
                description="רישיון, מסמכים, בקשות, תצהירים, תוקפים"
                status={docsTile.value}
                onClick={() => setSection('documents')}
              />
              <HubTile
                label="מבחנים ותאונות"
                description="מבחני כשירות, תאונות, דיווחים, תמונות"
                status={driveTile.value}
                onClick={() => setSection('driving')}
              />
              <HubTile
                label="היסטוריה והערות"
                description="יומן פעילות, הערות, תיעוד"
                status={actTile.value}
                onClick={() => setSection('activity')}
              />
            </div>
          </div>

          {isManager && (
            <div className="mt-2">
              <Button type="button" className="w-full h-12 font-bold gap-2" onClick={() => setShowAlertModal(true)}>
                <Bell size={18} />
                הוסף התראה · התראה חופשית
              </Button>
            </div>
          )}
        </>
      )}

      {section !== 'home' && (
        <>
          <div className="card-elevated mb-4 p-3">
            <h1 className="text-xl font-bold">{d.full_name}</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              {isDocumentsHubSection(section) && <FileText size={14} />}
              {section === 'driving' && <AlertTriangle size={14} />}
              {section === 'activity' && <StickyNote size={14} />}
              {sectionTitle[section]}
            </p>
          </div>
          <div className="card-elevated">{renderSectionContent()}</div>
        </>
      )}
    </div>
  );
}

function examNeedsAttentionClass(examExpiry: string): string {
  const days = daysUntilDate(examExpiry);
  if (days === null) return '';
  if (days < 0) return 'text-destructive font-bold';
  if (days <= 30) return 'text-amber-600 font-bold';
  return 'text-muted-foreground';
}
