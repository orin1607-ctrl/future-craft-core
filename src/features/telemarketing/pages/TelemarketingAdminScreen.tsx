import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SummaryCards } from '@/features/telemarketing/components/AdminDashboard/SummaryCards';
import { CallsTable } from '@/features/telemarketing/components/AdminDashboard/CallsTable';
import { EmployeeCards } from '@/features/telemarketing/components/AdminDashboard/EmployeeCards';
import { FollowUpBoard } from '@/features/telemarketing/components/FollowUp/FollowUpBoard';
import { useTelemarketingDashboard } from '@/features/telemarketing/hooks/useTelemarketingDashboard';
import { useAgentPerformance } from '@/features/telemarketing/hooks/useAgentPerformance';
import { getFollowUpWorkItems } from '@/features/telemarketing/services/telemarketingService';
import { getTelemarketingSettings, updateTelemarketingSetting } from '@/features/telemarketing/config/telemarketingSettings';
import type { FollowUpWorkItem } from '@/features/telemarketing/types';

export function TelemarketingAdminScreen({ currentManagerId: _currentManagerId }: { currentManagerId: string }) {
  const { calls, summary, loading, error, lastUpdated, reload, autoRefresh, setAutoRefresh } = useTelemarketingDashboard();
  const { agents, reload: reloadAgents } = useAgentPerformance();
  const [followUps, setFollowUps] = useState<FollowUpWorkItem[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [waNumber, setWaNumber] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

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
    setSavingSettings(true);
    try {
      await updateTelemarketingSetting('manager_whatsapp_number', waNumber.trim());
      await updateTelemarketingSetting('manager_notification_email', managerEmail.trim());
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black">מסך מנהל — טלמיטינג</h1>
          <p className="text-xs text-muted-foreground">
            {lastUpdated ? `עודכן: ${lastUpdated.toLocaleTimeString('he-IL')}` : 'טוען...'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
          disabled={savingSettings}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {savingSettings ? 'שומר...' : 'שמור הגדרות'}
        </button>
      </div>

      {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</p>}

      {summary && <SummaryCards summary={summary} />}

      <h3 className="mb-2 text-lg font-bold">החזרות — כל הנציגים</h3>
      <FollowUpBoard items={followUps} />

      <EmployeeCards agents={agents} selectedAgent={selectedAgent} onSelectAgent={setSelectedAgent} />

      <div>
        <h3 className="mb-2 text-lg font-bold">כל השיחות</h3>
        {loading ? <p className="text-muted-foreground">טוען...</p> : <CallsTable calls={calls} forcedAgentFilter={selectedAgent} />}
      </div>
    </div>
  );
}
