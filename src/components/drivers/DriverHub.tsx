import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  ChevronLeft,
  FileText,
  AlertTriangle,
  StickyNote,
  Send,
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
import {
  loadDriverHubData,
  hubVersionsByType,
  parseDriverHubSection,
  documentsTileValue,
  requestsTileValue,
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
import { REQUEST_STATUS_LABELS } from '@/lib/documentRequestClient';

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
};

function HubTile({
  label,
  value,
  warn,
  onClick,
}: {
  label: string;
  value: string;
  warn?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl p-4 border min-h-[96px] text-right w-full transition-colors hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/30 ${
        warn ? 'border-amber-500/50 bg-amber-50/40 dark:bg-amber-950/20' : 'border-border bg-muted/50'
      }`}
    >
      <p className="text-xs text-muted-foreground leading-snug mb-1 flex items-center justify-between gap-1">
        {label}
        <ChevronLeft size={16} className={`shrink-0 ${warn ? 'text-amber-600' : 'text-primary'}`} />
      </p>
      <p className={`text-base font-bold leading-snug ${warn ? 'text-amber-700 dark:text-amber-400' : ''}`}>
        {value}
      </p>
      <p className="text-[10px] text-primary mt-2 font-semibold">לחץ לפירוט</p>
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
}: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [section, setSectionState] = useState<DriverHubSection>(() =>
    parseDriverHubSection(searchParams.get('section')),
  );
  const [hubData, setHubData] = useState<DriverHubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState(d.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
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

  // Requests filters
  const [reqStatusFilter, setReqStatusFilter] = useState('all');
  const [reqTypeFilter, setReqTypeFilter] = useState('');
  const [reqSearch, setReqSearch] = useState('');
  const [reqDateFrom, setReqDateFrom] = useState('');

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
    setNotes(d.notes || '');
  }, [d.id, d.notes]);

  const saveNotes = async () => {
    setSavingNotes(true);
    const { error } = await supabase.from('drivers').update({ notes }).eq('id', d.id);
    setSavingNotes(false);
    if (error) {
      toast.error('שגיאה בשמירת הערות');
      return;
    }
    toast.success('הערות נשמרו');
  };

  const versions = hubData?.versions || [];
  const allVersions = hubData?.allVersions || [];
  const accidents = hubData?.accidents || [];
  const counters = hubData?.counters;
  const assigned = hubData?.assignedVehicle;

  const docsTile = counters
    ? documentsTileValue(counters)
    : { value: '…', warn: false };
  const reqsTile = counters ? requestsTileValue(counters) : { value: '…', warn: false };
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
    documents: 'מסמכים ורישיון',
    requests: 'בקשות ושליחה',
    driving: 'נהיגה',
    activity: 'פעילות והערות',
  };

  const renderDocuments = () => (
    <div className="space-y-4">
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
          <Button type="button" variant="secondary" onClick={() => setSection('requests')}>
            בקש מסמך מהנהג →
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
        מידע תעבורתי = 3 שנים · הצהרת בריאות = 5 שנים (לפי הגדרת סוג המסמך ב-Document Hub)
      </p>
    </div>
  );

  const renderRequests = () => (
    <div className="space-y-6">
      {!isManager ? (
        <p className="text-sm text-muted-foreground">אין הרשאה לניהול בקשות</p>
      ) : (
        <>
          <FilterBar>
            <select className={selectCls()} value={reqStatusFilter} onChange={(e) => setReqStatusFilter(e.target.value)}>
              <option value="all">כל הסטטוסים</option>
              {Object.entries(REQUEST_STATUS_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <select className={selectCls()} value={reqTypeFilter} onChange={(e) => setReqTypeFilter(e.target.value)}>
              <option value="">כל הסוגים</option>
              {docTypeOptions.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <input type="date" className={selectCls()} value={reqDateFrom} onChange={(e) => setReqDateFrom(e.target.value)} />
            <input
              value={reqSearch}
              onChange={(e) => setReqSearch(e.target.value)}
              placeholder="חיפוש בקשה…"
              className={`${selectCls()} flex-1 min-w-[140px]`}
            />
          </FilterBar>

          <div className="space-y-2">
            {(hubData?.requests || [])
              .filter((r) => {
                if (reqStatusFilter !== 'all' && r.status !== reqStatusFilter) return false;
                if (reqTypeFilter && r.document_type_key !== reqTypeFilter) return false;
                if (reqDateFrom && r.created_at.slice(0, 10) < reqDateFrom) return false;
                if (reqSearch.trim()) {
                  const q = reqSearch.trim().toLowerCase();
                  if (
                    !r.document_type_key.toLowerCase().includes(q) &&
                    !r.status.toLowerCase().includes(q) &&
                    !(r.notes || '').toLowerCase().includes(q)
                  ) {
                    return false;
                  }
                }
                return true;
              })
              .map((r) => (
                <div key={r.id} className="rounded-xl border border-border p-3 text-sm">
                  <div className="flex justify-between gap-2 flex-wrap">
                    <span className="font-bold">{r.document_type_key}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                      {REQUEST_STATUS_LABELS[r.status] || r.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatIsraelDate(r.created_at)}
                    {r.channel ? ` · ${r.channel}` : ''}
                  </p>
                </div>
              ))}
            {(hubData?.requests || []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">אין בקשות — צרו בקשה למטה</p>
            )}
          </div>

          <EntityDocumentRequestsPanel
            entityType="driver"
            entityId={d.id}
            entityLabel={d.full_name}
            recipientName={d.full_name}
            recipientPhone={d.phone}
            recipientEmail={d.email}
            companyName={d.company_name}
            onHubRefresh={() => void refresh()}
          />

          <div className="card-elevated border border-border rounded-xl p-4">
            <h3 className="text-lg font-bold mb-3">תצהיר נהג</h3>
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
        </>
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
                      <th className="p-2 text-right">תמונות</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAccidents.map((a) => (
                      <tr key={a.id} className="border-b border-border/50">
                        <td className="p-2 whitespace-nowrap">{formatIsraelDate(a.date)}</td>
                        <td className="p-2 font-mono">{a.vehicle_plate}</td>
                        <td className="p-2">{a.status}</td>
                        <td className="p-2">
                          <div className="flex gap-1">
                            {a.imageUrls.slice(0, 3).map((url, i) => (
                              <img
                                key={i}
                                src={url}
                                alt=""
                                className="w-10 h-10 rounded object-cover border border-border"
                              />
                            ))}
                            {a.imageUrls.length === 0 && <span className="text-muted-foreground text-xs">—</span>}
                          </div>
                        </td>
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
                    <div className="flex gap-1 overflow-x-auto">
                      {a.imageUrls.slice(0, 4).map((url, i) => (
                        <img key={i} src={url} alt="" className="w-14 h-14 rounded object-cover border border-border shrink-0" />
                      ))}
                    </div>
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
        <h3 className="text-lg font-bold">פעילות מתועדת</h3>
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
    switch (section) {
      case 'documents':
        return renderDocuments();
      case 'requests':
        return renderRequests();
      case 'driving':
        return renderDriving();
      case 'activity':
        return renderActivity();
      default:
        return null;
    }
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
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[48px] gap-2"
                  onClick={() => navigate(buildDriverDashboardUrl({ driverId: d.id, driverName: d.full_name }))}
                >
                  <LayoutDashboard size={16} />
                  דשבורד
                </Button>
                <Button type="button" variant="outline" className="min-h-[48px] gap-2" onClick={onEdit}>
                  <Edit2 size={16} />
                  עריכה
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <HubTile
                label="מסמכים ורישיון"
                value={docsTile.value}
                warn={docsTile.warn}
                onClick={() => setSection('documents')}
              />
              <HubTile
                label="בקשות ושליחה"
                value={reqsTile.value}
                warn={reqsTile.warn}
                onClick={() => setSection('requests')}
              />
              <HubTile
                label="נהיגה"
                value={driveTile.value}
                warn={driveTile.warn}
                onClick={() => setSection('driving')}
              />
              <HubTile
                label="פעילות והערות"
                value={actTile.value}
                warn={actTile.warn}
                onClick={() => setSection('activity')}
              />
            </div>
          </div>

          {isManager && (
            <div className="mt-2">
              <NotificationsAndSendsButton driverId={d.id} driverName={d.full_name} />
              <p className="text-[10px] text-muted-foreground mt-1 px-1">
                יומן התראות/שליחות קיים — חלק מהשליחות במערכת הן תצוגה/mock
              </p>
            </div>
          )}
        </>
      )}

      {section !== 'home' && (
        <>
          <div className="card-elevated mb-4 p-3">
            <h1 className="text-xl font-bold">{d.full_name}</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              {section === 'documents' && <FileText size={14} />}
              {section === 'requests' && <Send size={14} />}
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
