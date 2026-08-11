import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ChevronLeft,
  FileText,
  AlertTriangle,
  StickyNote,
  TrafficCone,
  ClipboardList,
  LayoutDashboard,
  Edit2,
  Phone,
  Mail,
  Save,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { buildDriverDashboardUrl } from '@/lib/entityNavContext';
import { EntityContextBanner } from '@/components/EntityContextBanner';
import { DocumentCard, useDocumentPreview } from '@/components/documents/DocumentViewer';
import EntityDocumentRequestsPanel from '@/components/documents/EntityDocumentRequestsPanel';
import DriverDeclaration from '@/components/DriverDeclaration';
import DriverExamsTab from '@/components/driving-exam/DriverExamsTab';
import NotificationsAndSendsButton from '@/components/notifications/NotificationsAndSendsButton';
import {
  loadDriverHubData,
  hubSummaryForType,
  hubVersionsByType,
  hubHasExpiryWarning,
  TRAFFIC_INFO_TYPE,
  TRAFFIC_TICKET_TYPE,
  type DriverHubSection,
  type DriverHubData,
  type DriverDocumentVersionRow,
} from '@/lib/driverHubData';
import {
  documentExpiryStatusLabel,
  formatIsraelDate,
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
      className={`rounded-xl p-3 border min-h-[72px] text-right w-full transition-colors hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/30 ${
        warn ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/50'
      }`}
    >
      <p className="text-[10px] text-muted-foreground leading-snug mb-1 flex items-center justify-between gap-1">
        {label}
        <ChevronLeft size={14} className={`shrink-0 ${warn ? 'text-destructive' : 'text-primary'}`} />
      </p>
      <p className={`text-sm font-bold leading-snug ${warn ? 'text-destructive' : ''}`}>{value}</p>
      <p className="text-[10px] text-primary mt-1 font-semibold">לחץ לפירוט</p>
    </button>
  );
}

function SectionNav({
  section,
  setSection,
}: {
  section: DriverHubSection;
  setSection: (s: DriverHubSection) => void;
}) {
  const items: { id: DriverHubSection; label: string; icon: typeof FileText }[] = [
    { id: 'documents', label: 'מסמכים ותוקפים', icon: FileText },
    { id: 'traffic_info', label: 'מידע תעבורתי', icon: TrafficCone },
    { id: 'traffic_reports', label: 'דוחות תעבורה', icon: ClipboardList },
    { id: 'accidents', label: 'תאונות', icon: AlertTriangle },
    { id: 'notes', label: 'הערות', icon: StickyNote },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 mb-4">
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setSection(id)}
          className={`min-h-[76px] rounded-xl border-2 p-3 flex flex-col items-center justify-center gap-1 font-bold text-sm transition-colors ${
            section === id
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-card hover:border-primary/40'
          }`}
        >
          <Icon size={22} />
          {label}
        </button>
      ))}
    </div>
  );
}

function DocVersionCard({ doc }: { doc: DriverDocumentVersionRow }) {
  const statusCls =
    doc.status === 'expired'
      ? 'text-destructive'
      : doc.status === 'warning'
        ? 'text-amber-600'
        : 'text-green-700';
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
  const [section, setSection] = useState<DriverHubSection>('home');
  const [hubData, setHubData] = useState<DriverHubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState(d.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const { PreviewDialog } = useDocumentPreview();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadDriverHubData({
        driverId: d.id,
        driverName: d.full_name,
        companyName: d.company_name,
      });
      setHubData(data);
    } catch {
      setHubData(null);
    } finally {
      setLoading(false);
    }
  }, [d.id, d.full_name, d.company_name]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
  const accidents = hubData?.accidents || [];
  const docWarn = hubHasExpiryWarning(versions);

  const sectionTitle: Record<DriverHubSection, string> = {
    home: '',
    documents: 'מסמכים ותוקפים',
    traffic_info: 'מידע תעבורתי',
    traffic_reports: 'דוחות תעבורה',
    accidents: 'תאונות',
    notes: 'הערות לנהג',
  };

  const renderSectionContent = () => {
    if (loading && !hubData) {
      return <p className="text-muted-foreground text-sm py-8 text-center">טוען…</p>;
    }

    switch (section) {
      case 'documents':
        return (
          <div className="space-y-4">
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין מסמכים ב-Document Hub — השתמשו בהעלאה או בבקשת קישור למטה</p>
            ) : (
              <div className="space-y-2">
                {versions.map((doc) => (
                  <DocVersionCard key={doc.id} doc={doc} />
                ))}
              </div>
            )}
            {isManager && (
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
            )}
          </div>
        );

      case 'traffic_info': {
        const docs = hubVersionsByType(versions, TRAFFIC_INFO_TYPE);
        const current = docs[0];
        return (
          <div className="space-y-4">
            {current ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-muted p-3">
                    <p className="text-xs text-muted-foreground">הופק / הועלה</p>
                    <p className="font-bold">{formatIsraelDate(current.created_at)}</p>
                  </div>
                  <div className="rounded-xl bg-muted p-3">
                    <p className="text-xs text-muted-foreground">תוקף עד</p>
                    <p className="font-bold">{formatIsraelDate(current.expiry_date)}</p>
                  </div>
                  <div className="rounded-xl bg-muted p-3 col-span-2">
                    <p className="text-xs text-muted-foreground">סטטוס</p>
                    <p className={`font-bold ${current.status === 'expired' ? 'text-destructive' : ''}`}>
                      {documentExpiryStatusLabel(current.status)}
                    </p>
                  </div>
                </div>
                <DocVersionCard doc={current} />
                <p className="text-xs text-muted-foreground">תוקף אוטומטי: 3 שנים מתאריך המסמך (לפי הגדרת סוג המסמך)</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">אין מידע תעבורתי — העלה מסמך מסוג «מידע תעבורתי» באזור המסמכים</p>
            )}
          </div>
        );
      }

      case 'traffic_reports': {
        const tickets = hubVersionsByType(versions, TRAFFIC_TICKET_TYPE);
        return (
          <div className="space-y-3">
            {tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין דוחות תעבורה — העלה מסמך מסוג «דוח תעבורה»</p>
            ) : (
              <div className="overflow-x-auto card-elevated p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-2 text-right">תאריך</th>
                      <th className="p-2 text-right">שם קובץ</th>
                      <th className="p-2 text-right">קובץ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((t) => (
                      <tr key={t.id} className="border-b border-border/50">
                        <td className="p-2">{formatIsraelDate(t.created_at)}</td>
                        <td className="p-2">{t.original_name || '—'}</td>
                        <td className="p-2">
                          <a href={t.public_url} target="_blank" rel="noreferrer" className="text-primary font-medium">
                            צפייה
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      }

      case 'accidents':
        return accidents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">אין תאונות רשומות לנהג זה</p>
        ) : (
          <div className="overflow-x-auto card-elevated">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-2">תאריך</th>
                  <th className="p-2">רכב</th>
                  <th className="p-2">סטטוס</th>
                  <th className="p-2">תמונות</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {accidents.map((a) => (
                  <tr key={a.id} className="border-b border-border/50">
                    <td className="p-2 whitespace-nowrap">{formatIsraelDate(a.date)}</td>
                    <td className="p-2 font-mono">{a.vehicle_plate}</td>
                    <td className="p-2">{a.status}</td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        {a.imageUrls.slice(0, 3).map((url, i) => (
                          <img key={i} src={url} alt="" className="w-10 h-10 rounded object-cover border border-border" />
                        ))}
                        {a.imageUrls.length === 0 && <span className="text-muted-foreground text-xs">—</span>}
                      </div>
                    </td>
                    <td className="p-2">
                      <Link to={`/accidents?id=${a.id}`} className="text-primary font-bold text-sm whitespace-nowrap">
                        פרטים →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case 'notes':
        return (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">נשמר ב-drivers.notes — ללא היסטוריית גרסאות</p>
            {isManager ? (
              <>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
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
        );

      default:
        return null;
    }
  };

  const backLabel = section === 'home' ? 'חזרה לרשימה' : 'חזרה לכרטיס הנהג';

  return (
    <div className="animate-fade-in pb-8">
      {PreviewDialog}
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
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold">{d.full_name}</h1>
              <div className="flex items-center gap-2">
                <span className={`status-badge ${d.status === 'active' ? 'status-active' : 'status-inactive'}`}>
                  {d.status === 'active' ? 'פעיל' : 'לא פעיל'}
                </span>
                {isManager && (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"
                  >
                    <Edit2 size={18} className="text-primary" />
                  </button>
                )}
              </div>
            </div>

            {isManager && (
              <Button
                type="button"
                className="w-full h-14 text-lg font-bold gap-2 mb-4 shadow-md"
                onClick={() => navigate(buildDriverDashboardUrl({ driverId: d.id, driverName: d.full_name }))}
              >
                <LayoutDashboard size={22} />
                פתח דשבורד נהג
              </Button>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><span className="text-muted-foreground">טלפון:</span><p className="font-bold">{d.phone}</p></div>
              <div><span className="text-muted-foreground">רישיון:</span><p className="font-bold">{d.license_number || '—'}</p></div>
              <div><span className="text-muted-foreground">תוקף רישיון:</span><p className="font-bold">{d.license_expiry ? formatIsraelDate(d.license_expiry) : '—'}</p></div>
              <div><span className="text-muted-foreground">מחלקה:</span><p className="font-bold">{d.department || '—'}</p></div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <HubTile
                label="מסמכים"
                value={versions.length ? `${versions.length} מסמכים` : 'אין'}
                warn={docWarn}
                onClick={() => setSection('documents')}
              />
              <HubTile
                label="מידע תעבורתי"
                value={hubSummaryForType(versions, TRAFFIC_INFO_TYPE)}
                warn={hubVersionsByType(versions, TRAFFIC_INFO_TYPE)[0]?.status === 'expired'}
                onClick={() => setSection('traffic_info')}
              />
              <HubTile
                label="דוחות תעבורה"
                value={hubVersionsByType(versions, TRAFFIC_TICKET_TYPE).length ? `${hubVersionsByType(versions, TRAFFIC_TICKET_TYPE).length} דוחות` : 'אין'}
                onClick={() => setSection('traffic_reports')}
              />
              <HubTile
                label="תאונות"
                value={accidents.length ? `${accidents.length}` : 'אין'}
                onClick={() => setSection('accidents')}
              />
              <HubTile
                label="הערות"
                value={d.notes?.trim() ? 'יש הערה' : 'ריק'}
                onClick={() => setSection('notes')}
              />
            </div>
          </div>

          <SectionNav section={section} setSection={setSection} />

          <div className="card-elevated mt-4">
            <DriverDeclaration
              driverId={d.id}
              driverName={d.full_name}
              idNumber={d.id_number}
              licenseNumber={d.license_number}
              companyName={d.company_name}
              driverPhone={d.phone}
              mode={isManager ? 'manager' : 'driver'}
            />
          </div>

          <div className="card-elevated mt-4">
            <h2 className="text-xl font-bold mb-3">מבחני כשירות נהיגה</h2>
            <DriverExamsTab
              driverId={d.id}
              driverName={d.full_name}
              driverIdNumber={d.id_number}
              driverPhone={d.phone}
              companyName={d.company_name}
            />
          </div>

          {isManager && (
            <>
              <div className="flex gap-3 mt-4">
                {d.phone && (
                  <a href={`tel:${d.phone}`} className="flex-1 bg-primary text-primary-foreground rounded-2xl p-4 flex items-center justify-center gap-2 font-bold">
                    <Phone size={20} /> התקשר
                  </a>
                )}
                {d.email && (
                  <a href={`mailto:${d.email}`} className="flex-1 bg-muted rounded-2xl p-4 flex items-center justify-center gap-2 font-bold">
                    <Mail size={20} /> מייל
                  </a>
                )}
              </div>
              <div className="mt-4">
                <NotificationsAndSendsButton driverId={d.id} driverName={d.full_name} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-[48px]"
                  onClick={() => navigate(`/attach-customer?driverId=${d.id}&driverName=${encodeURIComponent(d.full_name)}`)}
                >
                  הצמדת נהג ללקוח
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-[48px]"
                  onClick={() => navigate(`/work-orders?driverId=${d.id}&driverName=${encodeURIComponent(d.full_name)}`)}
                >
                  סידור עבודה
                </Button>
              </div>
              {d.status !== 'archived' && onArchive && (
                <button
                  type="button"
                  onClick={onArchive}
                  className="w-full mt-3 py-3 rounded-xl border-2 border-warning/30 text-warning font-bold flex items-center justify-center gap-2"
                >
                  העבר לארכיון
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="w-full mt-2 py-3 rounded-xl border-2 border-destructive/30 text-destructive font-bold flex items-center justify-center gap-2"
                >
                  מחק נהג
                </button>
              )}
            </>
          )}
        </>
      )}

      {section !== 'home' && (
        <>
          <div className="card-elevated mb-4 p-3">
            <h1 className="text-xl font-bold">{d.full_name}</h1>
            <p className="text-sm text-muted-foreground">{sectionTitle[section]}</p>
          </div>
          <SectionNav section={section} setSection={setSection} />
          <div className="card-elevated">{renderSectionContent()}</div>
        </>
      )}
    </div>
  );
}
