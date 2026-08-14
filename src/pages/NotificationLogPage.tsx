import { useMemo, useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  ClipboardList,
  DollarSign,
  History,
  MessageCircle,
  Plus,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CreateAlertModal from '@/components/CreateAlertModal';
import WhatsAppSendDialog from '@/components/whatsapp/WhatsAppSendDialog';
import { buildNotificationLogUrl } from '@/lib/notificationLogNav';
import {
  CHANNEL_LABELS,
  STATUS_LABELS,
  SCOPE_LABELS,
  filterMockEntries,
  resolveLogViewMode,
  formatLogEntryMeta,
  mockCostSummary,
  calendarEventDates,
  entriesForDate,
  type LogChannel,
  type LogStatus,
  type LogTab,
  type LogViewMode,
  type NotificationLogEntry,
} from '@/lib/notificationLogMock';
import {
  deactivateCustomAlert,
  fetchUnifiedAlertLogEntries,
} from '@/lib/notificationLogService';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { buildMockPreviewMessage, type WhatsAppSendKind } from '@/lib/whatsappUiMock';

const LOG_TABS: { id: LogTab; label: string; icon: typeof Bell }[] = [
  { id: 'active', label: 'התראות פעילות', icon: Bell },
  { id: 'future', label: 'התראות עתידיות', icon: Clock },
  { id: 'history', label: 'היסטוריה', icon: History },
  { id: 'costs', label: 'עלויות', icon: DollarSign },
  { id: 'calendar', label: 'לוח שנה', icon: CalendarDays },
];

function topicToKind(topic: string): WhatsAppSendKind {
  const map: Record<string, WhatsAppSendKind> = {
    טסט: 'test',
    'ביטוח חובה': 'mandatory_insurance',
    'ביטוח מקיף': 'comprehensive_insurance',
    'ביטוח צד ג׳': 'third_party_insurance',
    'מסמך רכב': 'document',
    'רישיון נהיגה': 'driver_reminder',
    'תזכיר לנהג': 'driver_reminder',
    'אישור לנהג': 'driver_approval',
  };
  return map[topic] ?? 'driver_reminder';
}

function statusBadgeClass(status: LogStatus): string {
  switch (status) {
    case 'sent':
      return 'bg-green-500/15 text-green-700 dark:text-green-400';
    case 'pending':
      return 'bg-amber-500/15 text-amber-700';
    case 'blocked':
      return 'bg-muted text-muted-foreground';
    case 'missing_phone':
      return 'bg-destructive/15 text-destructive';
    case 'failed':
      return 'bg-destructive/15 text-destructive';
    default:
      return 'bg-muted';
  }
}

function LogEntryRow({
  entry,
  viewMode,
  onSendWa,
  onDismiss,
}: {
  entry: NotificationLogEntry;
  viewMode: LogViewMode;
  onSendWa?: (entry: NotificationLogEntry) => void;
  onDismiss?: (entry: NotificationLogEntry) => void;
}) {
  const createdAt = new Date(entry.createdAt);
  const scheduledFor = entry.scheduledFor ? new Date(entry.scheduledFor) : null;
  const waLabel =
    entry.channel === 'whatsapp' && entry.waSent != null
      ? `${entry.waSent}/${entry.waMax ?? 3}${entry.status === 'blocked' ? ' חסום' : ''}`
      : '—';

  return (
    <div className="rounded-xl border border-border p-3 sm:p-4 hover:bg-muted/30 transition-colors">
      <div className="flex flex-wrap items-start gap-2 justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-sm">{entry.topic}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusBadgeClass(entry.status)}`}>
              {STATUS_LABELS[entry.status]}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {CHANNEL_LABELS[entry.channel]}
            </span>
            {entry.source === 'auto' && (
              <span className="text-[10px] text-muted-foreground">אוטומטי</span>
            )}
            {viewMode === 'general' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {SCOPE_LABELS[entry.scope]}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
            {scheduledFor && (
              <span className="font-semibold text-foreground">
                מועד ההתראה: {format(scheduledFor, 'dd/MM/yyyy', { locale: he })}
              </span>
            )}
            <span>
              {scheduledFor ? 'נוצרה' : 'תאריך'}: {format(createdAt, 'dd/MM/yyyy HH:mm', { locale: he })}
            </span>
          </p>
          <p className="text-sm">{formatLogEntryMeta(entry, viewMode)}</p>
          {entry.notes && <p className="text-xs text-muted-foreground">{entry.notes}</p>}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {entry.channel === 'whatsapp' && (
            <span className="text-xs font-semibold tabular-nums">WA {waLabel}</span>
          )}
          {entry.channel === 'whatsapp' &&
            entry.status !== 'blocked' &&
            entry.status !== 'missing_phone' &&
            (entry.waSent ?? 0) < (entry.waMax ?? 3) &&
            onSendWa && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1 border-[#25D366]/30"
                onClick={() => onSendWa(entry)}
              >
                <MessageCircle size={12} className="text-[#25D366]" />
                שלח WhatsApp
              </Button>
            )}
          {onDismiss && entry.customAlertId && entry.timing !== 'history' && (
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onDismiss(entry)}>
              הסר מהפעילות
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NotificationLogPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const vehicleId = searchParams.get('vehicleId');
  const vehiclePlate = searchParams.get('plate');
  const driverId = searchParams.get('driverId');
  const driverName = searchParams.get('driverName');
  const tab = (searchParams.get('tab') as LogTab) || 'active';
  const viewMode = resolveLogViewMode({ driverId, vehicleId, vehiclePlate });

  const [addOpen, setAddOpen] = useState(false);
  const [filterCompany, setFilterCompany] = useState('');
  const [filterChannel, setFilterChannel] = useState<LogChannel | ''>('');
  const [filterStatus, setFilterStatus] = useState<LogStatus | ''>('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [waDialog, setWaDialog] = useState<{ entry: NotificationLogEntry } | null>(null);
  const [dbEntries, setDbEntries] = useState<NotificationLogEntry[]>([]);

  const reloadAlerts = () => {
    void fetchUnifiedAlertLogEntries({
      companyName: user?.role === 'super_admin' ? (filterCompany || null) : user?.company_name,
      vehicleId,
      vehiclePlate,
      driverId,
    }).then(setDbEntries);
  };

  useEffect(() => {
    reloadAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.company_name, vehicleId, vehiclePlate, driverId, filterCompany]);

  const sourceEntries = dbEntries;
  const scoped = viewMode !== 'general';
  const canDismiss = user?.role === 'fleet_manager' || user?.role === 'super_admin';

  const baseEntries = useMemo(() => {
    return filterMockEntries(sourceEntries, {
      viewMode,
      vehicleId,
      vehiclePlate,
      driverId,
      company: filterCompany || undefined,
      channel: filterChannel || undefined,
      status: filterStatus || undefined,
    });
  }, [sourceEntries, viewMode, vehicleId, vehiclePlate, driverId, filterCompany, filterChannel, filterStatus]);

  const activeEntries = useMemo(
    () => filterMockEntries(baseEntries, { timing: 'active' }),
    [baseEntries],
  );
  const futureEntries = useMemo(
    () => filterMockEntries(baseEntries, { timing: 'future' }),
    [baseEntries],
  );
  const historyEntries = useMemo(
    () => filterMockEntries(baseEntries, { timing: 'history' }),
    [baseEntries],
  );

  const dismissAlert = async (entry: NotificationLogEntry) => {
    if (!entry.customAlertId) return;
    const res = await deactivateCustomAlert(entry.customAlertId);
    if (!res.ok) {
      toast.error(res.error || 'שגיאה בהסרת ההתראה');
      return;
    }
    toast.success('ההתראה הוסרה מהפעילות (ההיסטוריה נשמרה)');
    reloadAlerts();
  };

  const costSummary = useMemo(() => mockCostSummary(baseEntries), [baseEntries]);
  const calendarDates = useMemo(() => calendarEventDates(baseEntries), [baseEntries]);
  const dayEntries = selectedDate ? entriesForDate(baseEntries, selectedDate) : [];

  const setTab = (t: LogTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', t);
    setSearchParams(next, { replace: true });
  };

  const backUrl = vehicleId
    ? `/vehicles?vehicleId=${vehicleId}&view=hub`
    : driverId
      ? `/drivers?driverId=${driverId}`
      : '/alerts';

  const backLabel = vehiclePlate
    ? `חזרה לרכב ${vehiclePlate}`
    : driverName
      ? `חזרה לנהג ${driverName}`
      : 'חזרה להתראות';

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(backUrl)}
          className="flex items-center gap-2 text-primary text-sm font-medium min-h-[44px]"
        >
          <ArrowRight size={18} />
          {backLabel}
        </button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-header flex items-center gap-3 !mb-1">
            <ClipboardList size={28} />
            התראות ושליחות
          </h1>
          <p className="text-sm text-muted-foreground">
            {viewMode === 'driver' && 'יומן נהג — רישיון, מבחן, התראות חופשיות (אותם מקורות כמו מסך התראות)'}
            {viewMode === 'vehicle' && 'יומן רכב — טסט, ביטוח, קצין רכב, התראות חופשיות (אותם מקורות כמו מסך התראות)'}
            {viewMode === 'general' && 'יומן כללי — תוקפים אוטומטיים + התראות ידניות. פגות תוקף בהיסטוריה בלבד.'}
          </p>
        </div>
        <Button type="button" className="gap-2 min-h-[44px]" onClick={() => setAddOpen(true)}>
          <Plus size={18} />
          הוסף התראה
        </Button>
      </div>

      {scoped && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
          <span>
            {viewMode === 'driver' && (
              <>
                יומן נהג בלבד · <strong>{driverName || 'נהג'}</strong>
              </>
            )}
            {viewMode === 'vehicle' && (
              <>
                יומן רכב בלבד · <strong>{vehiclePlate || 'רכב'}</strong>
              </>
            )}
          </span>
          <Link
            to={buildNotificationLogUrl({ tab: 'active' })}
            className="text-primary text-xs font-medium underline"
          >
            יומן כללי
          </Link>
        </div>
      )}

      {!scoped && (
        <div className="flex flex-wrap gap-2">
          <select
            value={filterCompany}
            onChange={(e) => setFilterCompany(e.target.value)}
            className="p-2 rounded-xl border border-input bg-background text-sm min-h-[40px]"
          >
            <option value="">כל החברות</option>
            <option value="דליה">דליה</option>
            <option value="אורן">אורן</option>
          </select>
          <select
            value={filterChannel}
            onChange={(e) => setFilterChannel(e.target.value as LogChannel | '')}
            className="p-2 rounded-xl border border-input bg-background text-sm min-h-[40px]"
          >
            <option value="">כל הערוצים</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">אימייל</option>
            <option value="system">מערכת</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as LogStatus | '')}
            className="p-2 rounded-xl border border-input bg-background text-sm min-h-[40px]"
          >
            <option value="">כל הסטטוסים</option>
            {(Object.keys(STATUS_LABELS) as LogStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-3 py-1.5 rounded-full bg-muted">
          סה״כ: {baseEntries.length}
        </span>
        <span className="px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-800">
          פעילות: {activeEntries.length}
        </span>
        <span className="px-3 py-1.5 rounded-full bg-blue-500/15 text-blue-800">
          עתידיות: {futureEntries.length}
        </span>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as LogTab)} dir="rtl">
        <TabsList className="w-full flex flex-wrap h-auto gap-1 p-1">
          {LOG_TABS.map(({ id, label, icon: Icon }) => (
            <TabsTrigger
              key={id}
              value={id}
              className="flex-1 min-w-[100px] text-xs sm:text-sm gap-1.5 py-2.5"
            >
              <Icon size={14} />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="active" className="mt-4 space-y-3">
          {activeEntries.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">אין התראות פעילות</p>
          ) : (
            activeEntries.map((e) => (
              <LogEntryRow
                key={e.id}
                entry={e}
                viewMode={viewMode}
                onSendWa={(entry) => setWaDialog({ entry })}
                onDismiss={canDismiss ? dismissAlert : undefined}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="future" className="mt-4 space-y-3">
          {futureEntries.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">אין התראות עתידיות</p>
          ) : (
            futureEntries.map((e) => (
              <LogEntryRow
                key={e.id}
                entry={e}
                viewMode={viewMode}
                onDismiss={canDismiss ? dismissAlert : undefined}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-3">
          {historyEntries.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">אין היסטוריה</p>
          ) : (
            historyEntries.map((e) => <LogEntryRow key={e.id} entry={e} viewMode={viewMode} />)
          )}
        </TabsContent>

        <TabsContent value="costs" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'החודש (Mock)', value: `₪${costSummary.total.toFixed(2)}` },
              { label: 'הודעות WA', value: String(costSummary.count) },
              { label: 'ממוצע/הודעה', value: '₪0.28' },
              { label: 'חיסכון 3/3', value: `~₪${costSummary.savedEstimate}` },
            ].map((c) => (
              <div key={c.label} className="card-elevated !p-4 !items-start !text-right">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-xl font-bold mt-1">{c.value}</p>
              </div>
            ))}
          </div>
          <div className="card-elevated !p-4 !items-start !text-right w-full">
            <h3 className="font-bold mb-3">לפי סוג התראה</h3>
            <div className="space-y-2 w-full">
              {Object.entries(costSummary.byTopic).map(([topic, { count, cost }]) => (
                <div key={topic} className="flex justify-between text-sm border-b border-border pb-2">
                  <span>{topic}</span>
                  <span className="tabular-nums">
                    {count} הודעות · ₪{cost.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card-elevated !p-2 flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                locale={he}
                modifiers={{ hasEvent: calendarDates }}
                modifiersClassNames={{ hasEvent: 'bg-primary/20 font-bold rounded-md' }}
              />
            </div>
            <div className="space-y-3">
              <h3 className="font-bold text-sm">
                {selectedDate
                  ? format(selectedDate, 'dd MMMM yyyy', { locale: he })
                  : 'בחר תאריך'}
              </h3>
              {dayEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">אין אירועים בתאריך זה</p>
              ) : (
                dayEntries.map((e) => <LogEntryRow key={e.id} entry={e} viewMode={viewMode} />)
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {addOpen && (
        <CreateAlertModal
          vehiclePlate={vehiclePlate || undefined}
          vehicleId={vehicleId || undefined}
          driverId={driverId || undefined}
          driverName={driverName || undefined}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            reloadAlerts();
          }}
        />
      )}

      {waDialog && (
        <WhatsAppSendDialog
          open={Boolean(waDialog)}
          onOpenChange={(o) => !o && setWaDialog(null)}
          recipientName={waDialog.entry.driverName || 'נהג'}
          recipientPhone="0534338601"
          kind={topicToKind(waDialog.entry.topic)}
          sentCount={waDialog.entry.waSent ?? 0}
          vehiclePlate={waDialog.entry.vehiclePlate}
          expiryDate={waDialog.entry.scheduledFor}
          previewMessage={buildMockPreviewMessage({
            recipientName: waDialog.entry.driverName || 'נהג',
            kind: topicToKind(waDialog.entry.topic),
            vehiclePlate: waDialog.entry.vehiclePlate,
            expiryDate: waDialog.entry.scheduledFor,
          })}
          blocked={waDialog.entry.status === 'blocked' || (waDialog.entry.waSent ?? 0) >= 3}
          onConfirmSend={() => {
            setWaDialog(null);
          }}
        />
      )}
    </div>
  );
}
