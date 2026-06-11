import { useState, useEffect } from 'react';
import { ChevronLeft, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { VehiclePlateLine } from '@/components/vehicles/vehiclePlateDisplay';
import {
  loadDashboardDrillDown,
  type DashboardDrillDown,
  type MissingDocItem,
  type InsuranceGapItem,
  type OpenIssueItem,
  type CustomGapItem,
} from '@/lib/vehicleDashboardData';
import { countMissingDocs } from '@/lib/vehicleHistory';
import { addCustomVehicleGap, resolveCustomVehicleGap } from '@/lib/vehicleEventLog';
import type { VehicleHubVehicle } from '@/components/vehicles/VehicleHub';
import type { HubTabId } from '@/lib/vehicleHubData';
import {
  daysUntil,
  formatExpiry,
  insuranceStatusText,
  statusLabel,
} from '@/components/vehicles/vehicleHubUtils';

type DrillKind =
  | 'insurance_licenses'
  | 'documents'
  | 'gaps_alerts'
  | 'service'
  | 'open_issues'
  | 'transport'
  | null;

function DashTile({
  label,
  value,
  warn,
  onClick,
}: {
  label: string;
  value: string;
  warn?: boolean;
  onClick?: () => void;
}) {
  const interactive = !!onClick;
  const Tag = interactive ? 'button' : 'div';
  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={interactive ? onClick : undefined}
      className={`rounded-xl p-3 border min-h-[64px] text-right w-full transition-colors ${
        warn
          ? 'border-destructive/40 bg-destructive/5 hover:bg-destructive/10 cursor-pointer'
          : 'border-border bg-muted/50'
      } ${interactive ? 'hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/30' : ''}`}
    >
      <p className="text-[10px] text-muted-foreground leading-snug mb-1 flex items-center justify-between gap-1">
        {label}
        {interactive && (
          <ChevronLeft size={14} className={`shrink-0 ${warn ? 'text-destructive' : 'text-primary'}`} />
        )}
      </p>
      <p className={`text-sm font-bold leading-snug ${warn ? 'text-destructive' : ''}`}>{value}</p>
      {interactive && (
        <p className="text-[10px] text-primary mt-1 font-semibold">לחץ לפירוט</p>
      )}
    </Tag>
  );
}

function DetailList({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="space-y-2">
      {items.map((row, i) => (
        <div key={i} className="flex justify-between gap-3 py-2 border-b border-border text-sm">
          <span className="text-muted-foreground shrink-0">{row.label}</span>
          <span className="font-medium text-right">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide col-span-2 sm:col-span-3 px-1 pt-1">
      {children}
    </p>
  );
}

export default function VehicleDashboard({
  vehicle: v,
  semiInspection,
  triInspection,
  latestInsurer,
  openIssuesCount,
  onJumpTo,
  previewDrillDown,
  previewMode = false,
  drillRefreshKey = 0,
  onDrillDataChanged,
}: {
  vehicle: VehicleHubVehicle;
  semiInspection: string | null;
  triInspection: string | null;
  latestInsurer: string | null;
  openIssuesCount: number;
  onJumpTo?: (section: 'details' | 'actions' | 'history' | 'manage', tab?: HubTabId) => void;
  previewDrillDown?: DashboardDrillDown | null;
  previewMode?: boolean;
  drillRefreshKey?: number;
  onDrillDataChanged?: () => void;
}) {
  const { user } = useAuth();
  const [drill, setDrill] = useState<DashboardDrillDown | null>(previewDrillDown ?? null);
  const [drillKind, setDrillKind] = useState<DrillKind>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [customGapInput, setCustomGapInput] = useState('');
  const [gapSaving, setGapSaving] = useState(false);

  const sl = statusLabel(v.status);
  const testDays = daysUntil(v.test_expiry);
  const insDays = daysUntil(v.insurance_expiry);
  const compDays = daysUntil(v.comprehensive_insurance_expiry);
  const svcDays = daysUntil(v.next_service_date);
  const missingDocs = countMissingDocs(v);

  const hasLicenseGap = !v.license_doc_url;
  const hasTestGap = !v.test_expiry || (testDays !== null && testDays <= 0);
  const hasInsuranceGap =
    !v.insurance_doc_url ||
    !v.comprehensive_insurance_doc_url ||
    (insDays !== null && insDays <= 14) ||
    (compDays !== null && compDays <= 14);
  const customGapCount = drill?.customGaps?.length ?? 0;
  const equipmentWarn = drill?.equipmentGap?.hasGap ?? false;

  const insuranceLicensesWarn =
    hasLicenseGap || hasTestGap || hasInsuranceGap || (testDays !== null && testDays <= 14);
  const gapsAlertsWarn =
    missingDocs > 0 ||
    hasInsuranceGap ||
    hasLicenseGap ||
    equipmentWarn ||
    customGapCount > 0 ||
    openIssuesCount > 0 ||
    v.needs_transport ||
    v.approval_status === 'pending_approval';

  const insuranceSummary = insuranceLicensesWarn ? 'יש לטפל' : 'בסדר';
  const docsSummary = missingDocs > 0 ? `${missingDocs} חסרים` : 'מלא';
  const gapsSummary = gapsAlertsWarn ? 'דורש טיפול' : 'אין';

  useEffect(() => {
    if (previewDrillDown) {
      setDrill(previewDrillDown);
      return;
    }
    loadDashboardDrillDown(v, latestInsurer).then(setDrill);
  }, [v, latestInsurer, previewDrillDown, drillRefreshKey]);

  const openDrill = (kind: DrillKind) => {
    setDrillKind(kind);
    setSheetOpen(true);
  };

  const handleAddCustomGap = async () => {
    const label = customGapInput.trim();
    if (!label) {
      toast.error('הזן תיאור חוסר');
      return;
    }
    if (previewMode) {
      toast.info('תצוגת פיתוח — לא נשמר');
      return;
    }
    setGapSaving(true);
    const { error } = await addCustomVehicleGap({
      vehicleId: v.id,
      vehiclePlate: v.license_plate,
      companyName: v.company_name || user?.company_name || '',
      label,
      userId: user?.id,
      userName: user?.full_name,
    });
    setGapSaving(false);
    if (error) toast.error('שגיאה בהוספת חוסר');
    else {
      toast.success('חוסר נוסף — נרשם בהיסטוריה');
      setCustomGapInput('');
      onDrillDataChanged?.();
    }
  };

  const handleResolveGap = async (gap: CustomGapItem) => {
    if (previewMode) {
      toast.info('תצוגת פיתוח');
      return;
    }
    const { error } = await resolveCustomVehicleGap({
      gapId: gap.id,
      vehiclePlate: v.license_plate,
      companyName: v.company_name || user?.company_name || '',
      label: gap.label,
      userId: user?.id,
      userName: user?.full_name,
    });
    if (error) toast.error('שגיאה בסגירת חוסר');
    else {
      toast.success('חוסר נסגר — נרשם בהיסטוריה');
      onDrillDataChanged?.();
    }
  };

  const renderInsuranceLicensesSheet = () => {
    if (!drill) return <p className="text-sm py-4 text-muted-foreground">טוען...</p>;
    const hasComp = !!v.comprehensive_insurance_expiry || !!v.comprehensive_insurance_doc_url;
    return (
      <>
        <DetailList
          items={[
            { label: 'ביטוח חובה — סטטוס', value: insuranceStatusText(v.insurance_expiry) },
            { label: 'ביטוח חובה — תפוגה', value: formatExpiry(v.insurance_expiry) },
            { label: 'ביטוח חובה — מסמך', value: v.insurance_doc_url ? 'מצורף' : 'חסר' },
            ...(hasComp
              ? [
                  { label: 'ביטוח מקיף — סטטוס', value: insuranceStatusText(v.comprehensive_insurance_expiry) },
                  { label: 'ביטוח מקיף — תפוגה', value: formatExpiry(v.comprehensive_insurance_expiry) },
                  { label: 'ביטוח מקיף — מסמך', value: v.comprehensive_insurance_doc_url ? 'מצורף' : 'חסר' },
                ]
              : []),
            {
              label: "ביטוח צד ג'",
              value: hasComp
                ? 'בדוק בפוליסת מקיף / אין שדה נפרד במערכת'
                : 'לא הוגדר — עדכן בפרטי רכב',
            },
            { label: 'חברת ביטוח', value: latestInsurer || '—' },
            { label: 'טסט — סטטוס', value: insuranceStatusText(v.test_expiry) },
            { label: 'טסט — תפוגה', value: formatExpiry(v.test_expiry) },
            { label: 'רישיון רכב — קובץ', value: v.license_doc_url ? 'מצורף' : 'חסר' },
          ]}
        />
        {drill.insuranceGaps.map((g: InsuranceGapItem, i) => (
          <div key={i} className="card-elevated p-3 mt-2 border-destructive/20">
            <p className="font-bold text-destructive text-sm">{g.label}</p>
            <p className="text-xs mt-1">{g.action}</p>
          </div>
        ))}
        <Button className="w-full mt-4" onClick={() => { setSheetOpen(false); onJumpTo?.('details'); }}>
          עריכה — פרטי רכב
        </Button>
      </>
    );
  };

  const renderDocumentsSheet = () => {
    if (!drill) return null;
    const uploaded = [
      v.license_doc_url && { name: 'רישיון רכב', ok: true },
      v.insurance_doc_url && { name: 'ביטוח חובה', ok: true },
      v.comprehensive_insurance_doc_url && { name: 'ביטוח מקיף', ok: true },
    ].filter(Boolean) as { name: string; ok: boolean }[];

    return (
      <>
        <p className="text-sm text-muted-foreground mb-3">מסמכים ברכב וחוסרים</p>
        {uploaded.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-bold mb-2">מסמכים במערכת</p>
            {uploaded.map((d) => (
              <p key={d.name} className="text-sm py-1">✓ {d.name}</p>
            ))}
          </div>
        )}
        {drill.missingDocuments.length === 0 ? (
          <p className="text-sm">אין חוסרי מסמכים מזוהים</p>
        ) : (
          drill.missingDocuments.map((m: MissingDocItem) => (
            <div key={m.fieldKey} className="card-elevated p-3 mb-2 border-destructive/25">
              <p className="font-bold text-destructive">{m.label}</p>
              <p className="text-xs">{m.status}</p>
              <p className="text-sm mt-1">{m.action}</p>
            </div>
          ))
        )}
        <Button className="w-full mt-4" onClick={() => { setSheetOpen(false); onJumpTo?.('details'); }}>
          העלאה / עריכה — פרטי רכב
        </Button>
        <Button className="w-full mt-2" variant="outline" onClick={() => { setSheetOpen(false); onJumpTo?.('actions', 'docs'); }}>
          מסמכים — פעולות רכב
        </Button>
      </>
    );
  };

  const renderGapsAlertsSheet = () => (
    <>
      {!drill ? (
        <p className="text-sm py-4">טוען...</p>
      ) : (
        <>
          <DetailList
            items={[
              { label: 'חוסר מסמכים', value: missingDocs ? `${missingDocs}` : 'אין' },
              { label: 'חוסר ביטוח', value: hasInsuranceGap ? 'כן' : 'אין' },
              { label: 'חוסר רישיון', value: hasLicenseGap ? 'כן' : 'אין' },
              { label: 'פג תוקף (טסט/ביטוח)', value: insuranceLicensesWarn ? 'בדוק' : 'אין' },
              { label: 'חוסר ציוד', value: equipmentWarn ? drill.equipmentGap.detail : 'אין' },
              { label: 'דורש השלמה', value: gapsSummary },
              { label: 'התראות פתוחות', value: String(openIssuesCount) },
              { label: 'שינוע פתוח', value: v.needs_transport ? 'כן' : 'לא' },
              {
                label: 'אישור חברה',
                value: v.approval_status === 'pending_approval' ? 'ממתין' : '—',
              },
            ]}
          />

          {drill.customGaps.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-bold mb-2">חוסרים מותאמים</p>
              {drill.customGaps.map((g) => (
                <div key={g.id} className="card-elevated p-3 mb-2 flex justify-between gap-2">
                  <div>
                    <p className="font-bold text-sm">{g.label}</p>
                    <p className="text-xs text-muted-foreground">{g.date}</p>
                  </div>
                  <Button type="button" size="sm" variant="secondary" onClick={() => handleResolveGap(g)}>
                    סגור
                  </Button>
                </div>
              ))}
            </div>
          )}

          {drill.openIssues.slice(0, 5).map((o: OpenIssueItem) => (
            <div key={o.id} className="text-sm py-2 border-b border-border">
              <span className="font-bold">{o.title}</span> · {o.status}
            </div>
          ))}

          <div className="mt-4 border-t pt-4 space-y-2">
            <p className="text-sm font-bold">חוסר אחר — הוספה</p>
            <Input
              value={customGapInput}
              onChange={(e) => setCustomGapInput(e.target.value)}
              placeholder="מפתח חסר, שלט, כרטיס דלק..."
              className="text-right"
            />
            <Button type="button" className="w-full gap-2" disabled={gapSaving} onClick={handleAddCustomGap}>
              <Plus size={16} /> הוסף חוסר
            </Button>
          </div>

          <Button className="w-full mt-3" variant="outline" onClick={() => { setSheetOpen(false); onJumpTo?.('history'); }}>
            היסטוריית רכב
          </Button>
        </>
      )}
    </>
  );

  const sheetTitles: Record<string, string> = {
    insurance_licenses: 'ביטוחים ורישיונות',
    documents: 'מסמכים',
    gaps_alerts: 'חוסרים והתראות',
    service: 'טיפולים',
    open_issues: 'התראות פתוחות',
    transport: 'שינועים',
  };

  const renderSheetBody = () => {
    switch (drillKind) {
      case 'insurance_licenses':
        return renderInsuranceLicensesSheet();
      case 'documents':
        return renderDocumentsSheet();
      case 'gaps_alerts':
        return renderGapsAlertsSheet();
      case 'service':
        return (
          <>
            <DetailList
              items={[
                { label: 'טיפול הבא', value: formatExpiry(v.next_service_date) },
                { label: 'טיפול אחרון', value: formatExpiry(v.last_service_date) },
              ]}
            />
            <Button className="w-full mt-4" onClick={() => { setSheetOpen(false); onJumpTo?.('actions', 'service'); }}>
              פעולות רכב → שירות
            </Button>
          </>
        );
      case 'open_issues':
        return drill ? (
          <>
            {drill.openIssues.map((o) => (
              <div key={o.id} className="card-elevated p-3 mb-2">
                <p className="font-bold text-sm">{o.title}</p>
                <p className="text-xs text-muted-foreground">{o.description}</p>
              </div>
            ))}
            <Button className="w-full mt-2" onClick={() => { setSheetOpen(false); onJumpTo?.('actions', 'faults'); }}>
              פעולות רכב
            </Button>
          </>
        ) : null;
      case 'transport':
        return drill?.transport ? (
          <DetailList
            items={[
              { label: 'סטטוס', value: drill.transport.status },
              { label: 'מאיפה', value: drill.transport.from },
              { label: 'לאן', value: drill.transport.to },
              { label: 'מי ביקש', value: drill.transport.requestedBy },
            ]}
          />
        ) : (
          <p className="text-sm">אין שינוע פתוח</p>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="card-elevated mb-4">
        <div className="px-4 pt-3 pb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold text-muted-foreground uppercase">דשבורד רכב</p>
          <VehiclePlateLine plate={v.license_plate} internal={v.internal_number} className="font-bold" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 px-3 pb-3">
          <SectionLabel>מאוגדים — לחץ לפירוט</SectionLabel>

          <DashTile
            label="ביטוחים ורישיונות"
            value={insuranceSummary}
            warn={insuranceLicensesWarn}
            onClick={() => openDrill('insurance_licenses')}
          />
          <DashTile
            label="מסמכים"
            value={docsSummary}
            warn={missingDocs > 0}
            onClick={() => openDrill('documents')}
          />
          <DashTile
            label="חוסרים והתראות"
            value={gapsSummary}
            warn={gapsAlertsWarn}
            onClick={() => openDrill('gaps_alerts')}
          />

          <SectionLabel>מעקב שוטף</SectionLabel>

          <DashTile label="סטטוס רכב" value={sl.text} warn={v.status === 'out_of_service'} />
          <DashTile
            label="טיפול הבא"
            value={formatExpiry(v.next_service_date)}
            warn={svcDays !== null && svcDays <= 14}
            onClick={() => openDrill('service')}
          />
          <DashTile
            label="מעקב טיפול אחרון"
            value={v.last_service_date ? new Date(v.last_service_date).toLocaleDateString('he-IL') : '—'}
            onClick={() => openDrill('service')}
          />
          <DashTile label='ק"מ נוכחי' value={(v.odometer || 0).toLocaleString()} />
          <DashTile label="בדיקה חצי שנתית" value={formatExpiry(semiInspection)} />
          <DashTile label="בדיקה תלת שנתית" value={formatExpiry(triInspection)} />
          <DashTile
            label="התראות פתוחות"
            value={String(openIssuesCount)}
            warn={openIssuesCount > 0}
            onClick={() => openDrill('open_issues')}
          />
          <DashTile
            label="שינועים פתוחים"
            value={v.needs_transport ? 'פעיל' : 'אין'}
            warn={v.needs_transport}
            onClick={() => openDrill('transport')}
          />
          {v.approval_status === 'pending_approval' && (
            <DashTile
              label="ממתין לאישור"
              value="חברת ביטוח / מנהל"
              warn
              onClick={() => openDrill('gaps_alerts')}
            />
          )}
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-right">
            <SheetTitle>{drillKind ? sheetTitles[drillKind] : 'פירוט'}</SheetTitle>
            <SheetDescription asChild>
              <div>
                <VehiclePlateLine plate={v.license_plate} internal={v.internal_number} />
              </div>
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 pb-6">{renderSheetBody()}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
