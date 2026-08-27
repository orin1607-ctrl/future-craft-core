import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SummaryCards } from '@/features/telemarketing/components/AdminDashboard/SummaryCards';
import { CallsTable } from '@/features/telemarketing/components/AdminDashboard/CallsTable';
import { EmployeeCards } from '@/features/telemarketing/components/AdminDashboard/EmployeeCards';
import { FollowUpBoard } from '@/features/telemarketing/components/FollowUp/FollowUpBoard';
import { LeadsBoard } from '@/features/telemarketing/components/Leads/LeadsBoard';
import { LeadDirectoryBoard } from '@/features/telemarketing/components/Leads/LeadDirectoryBoard';
import { LeadImportPanel } from '@/features/telemarketing/components/Leads/LeadImportPanel';
import { WorkTimeDashboard } from '@/features/telemarketing/components/AdminDashboard/WorkTimeDashboard';
import { ActivityReportPanel } from '@/features/telemarketing/components/AdminDashboard/ActivityReport';
import { DaliaChatBoard } from '@/features/telemarketing/components/DaliaCare/DaliaChatBoard';
import { TeleOverlayNavProvider } from '@/features/telemarketing/components/Nav/TeleInnerNav';
import { useTelemarketingDashboard } from '@/features/telemarketing/hooks/useTelemarketingDashboard';
import { useAgentPerformance } from '@/features/telemarketing/hooks/useAgentPerformance';
import { getFollowUpWorkItems } from '@/features/telemarketing/services/telemarketingService';
import { getTelemarketingSettings, updateTelemarketingSetting } from '@/features/telemarketing/config/telemarketingSettings';
import { InspectBanner } from '@/features/telemarketing/components/EntryPurpose/InspectBanner';
import { TeleEntryAuditPanel } from '@/features/telemarketing/components/EntryPurpose/TeleEntryAuditPanel';
import type { FollowUpWorkItem } from '@/features/telemarketing/types';

export function TelemarketingAdminScreen({
  currentManagerId,
  currentManagerName,
  inspect = false,
  onToggleInspect,
  onTurnOffInspect,
}: {
  currentManagerId: string;
  currentManagerName?: string;
  inspect?: boolean;
  onToggleInspect?: () => void;
  onTurnOffInspect?: () => void;
}) {
  const { calls, summary, loading, error, lastUpdated, reload, autoRefresh, setAutoRefresh } = useTelemarketingDashboard();
  const { agents, reload: reloadAgents } = useAgentPerformance();
  const [followUps, setFollowUps] = useState<FollowUpWorkItem[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [waNumber, setWaNumber] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [leadReload, setLeadReload] = useState(0);

  const reloadFollowUps = async () => {
    try {
      setFollowUps(await getFollowUpWorkItems());
    } catch {
      /* keep previous */
    }
  };

  useEffect(() => {
    void getTelemarketingSettings().then((s) => {
      setWaNumber(s.managerWhatsappNumber);
      setManagerEmail(s.managerNotificationEmail);
    });
    void reloadFollowUps();
  }, []);

  const saveSettings = async () => {
    if (inspect) return;
    setSavingSettings(true);
    try {
      await updateTelemarketingSetting('manager_whatsapp_number', waNumber.trim());
      await updateTelemarketingSetting('manager_notification_email', managerEmail.trim());
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <TeleOverlayNavProvider homePath="/telemarketing/admin" homeAnchorId="tele-admin-home">
    <div id="tele-admin-home" data-testid="tele-admin-home" className="mx-auto max-w-6xl space-y-4 pb-10 scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black">מסך מנהל — טלמיטינג</h1>
          <p className="text-xs text-muted-foreground">
            {lastUpdated ? `עודכן: ${lastUpdated.toLocaleTimeString('he-IL')}` : 'טוען...'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="#lead-directory"
            data-testid="lead-directory-nav"
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-black text-white"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('lead-directory')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            מאגר לידים
          </a>
          <button
            type="button"
            data-testid="tele-admin-inspect-toggle"
            onClick={() => onToggleInspect?.()}
            className={`rounded-lg px-4 py-2 text-sm font-black ${inspect ? 'bg-amber-500 text-black' : 'border border-border'}`}
          >
            {inspect ? '🧪 מצב בדיקה פעיל' : '🧪 מצב בדיקה'}
          </button>
          <Link
            to="/telemarketing"
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold"
          >
            מסך נציג
          </Link>
          <button
            type="button"
            onClick={() => {
              reload();
              reloadFollowUps();
              reloadAgents();
              setLeadReload((n) => n + 1);
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            רענן נתונים
          </button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            רענון אוטומטי
          </label>
        </div>
      </div>

      {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</p>}

      {inspect && (
        <InspectBanner variant="admin" onTurnOffAdmin={onTurnOffInspect} />
      )}

      <LeadDirectoryBoard isAdmin reloadToken={leadReload} readOnly={inspect} />
      <LeadImportPanel isAdmin onImported={() => setLeadReload((n) => n + 1)} readOnly={inspect} />

      <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <h3 className="text-sm font-bold">הגדרות התראות מנהל</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="text-xs">
            WhatsApp מנהל
            <input
              value={waNumber}
              onChange={(e) => setWaNumber(e.target.value)}
              className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3"
              dir="ltr"
            />
          </label>
          <label className="text-xs">
            Email מנהל (ריק = לא שולחים עד שיוגדר)
            <input
              value={managerEmail}
              onChange={(e) => setManagerEmail(e.target.value)}
              placeholder="להגדרה"
              className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3"
              dir="ltr"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={savingSettings || inspect}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {savingSettings ? 'שומר...' : inspect ? 'שמור הגדרות — חסום במצב בדיקה' : 'שמור הגדרות'}
        </button>
      </div>

      {summary && <SummaryCards summary={summary} />}

      <DaliaChatBoard
        currentUserId={currentManagerId}
        currentUserName={currentManagerName || 'מנהל-על'}
        isAdmin
      />

      <h3 className="mb-2 text-lg font-bold">החזרות — כל הנציגים</h3>
      <FollowUpBoard
        items={followUps}
        actor={{ id: currentManagerId, displayName: currentManagerName || 'מנהל-על', isAdmin: true }}
      />

      <LeadsBoard
        currentEmployee={{ id: currentManagerId, displayName: currentManagerName || 'מנהל-על' }}
        daliaActor={{ id: currentManagerId, displayName: currentManagerName || 'מנהל-על', isAdmin: true }}
        readOnly={inspect}
      />

      <WorkTimeDashboard selectedAgent={selectedAgent} />

      <ActivityReportPanel />

      <TeleEntryAuditPanel />

      <EmployeeCards agents={agents} selectedAgent={selectedAgent} onSelectAgent={setSelectedAgent} />

      <div>
        <h3 className="mb-2 text-lg font-bold">כל השיחות</h3>
        {loading ? <p className="text-muted-foreground">טוען...</p> : <CallsTable calls={calls} forcedAgentFilter={selectedAgent} />}
      </div>
    </div>
    </TeleOverlayNavProvider>
  );
}
