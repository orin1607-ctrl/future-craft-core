import { useEffect, useState } from 'react';
import { listAssignableAgents } from '@/features/telemarketing/services/leadDirectoryService';
import { previewStuckAction, releaseStuckAction, type StuckPreview } from '@/features/telemarketing/services/stuckActionService';

function formatSince(value?: string | null): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('he-IL');
  } catch {
    return value;
  }
}

export function StuckActionResetPanel({
  selectedAgentName,
  inspect = false,
}: {
  selectedAgentName?: string | null;
  inspect?: boolean;
}) {
  const [agents, setAgents] = useState<{ id: string; displayName: string }[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [preview, setPreview] = useState<StuckPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listAssignableAgents().then(setAgents).catch(() => setAgents([]));
  }, []);

  useEffect(() => {
    if (!selectedAgentName || !agents.length) return;
    const match = agents.find((a) => a.displayName === selectedAgentName);
    if (match) setEmployeeId(match.id);
  }, [selectedAgentName, agents]);

  const selected = agents.find((a) => a.id === employeeId) || null;

  const loadPreview = async () => {
    if (!employeeId || inspect) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setPreview(await previewStuckAction(employeeId));
    } catch (e: unknown) {
      setPreview(null);
      setError(e instanceof Error ? e.message : 'שגיאה בבדיקת מצב');
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = async () => {
    if (!employeeId || inspect || !preview?.hasStuck) return;
    setBusy(true);
    setError(null);
    try {
      const result = await releaseStuckAction(employeeId);
      setMessage(result.didReset ? `אופס מצב תקוע עבור ${result.employeeName || selected?.displayName || 'העובד'}` : (result.message || 'אין מצב פעיל'));
      setPreview(await previewStuckAction(employeeId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה באיפוס');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-testid="tele-stuck-reset" className="space-y-3 rounded-2xl border border-amber-500/40 bg-card p-4">
      <h3 className="text-lg font-black">איפוס פעולה תקועה</h3>
      <p className="text-sm text-muted-foreground">
        למנהל-על בלבד. מאפס מצב UI/נעילה תקוע ומחזיר את העובד ל-idle. לא מוחק שיחות שהושלמו, לא מוסיף זמן, לא יוצר Follow-up ולא משנה רמזור.
      </p>
      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <label className="text-xs font-semibold">
          עובד
          <select
            data-testid="tele-stuck-reset-agent"
            value={employeeId}
            onChange={(e) => {
              setEmployeeId(e.target.value);
              setPreview(null);
              setMessage(null);
            }}
            disabled={inspect || busy}
            className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-2 text-sm"
          >
            <option value="">בחרו עובד</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          data-testid="tele-stuck-reset-preview"
          onClick={() => void loadPreview()}
          disabled={!employeeId || busy || inspect}
          className="mt-5 min-h-12 rounded-xl border border-border bg-background px-4 text-sm font-black disabled:opacity-50"
        >
          {busy ? 'בודק...' : 'בדיקת מצב'}
        </button>
      </div>
      {preview && (
        <div data-testid="tele-stuck-reset-preview-box" className="space-y-2 rounded-xl border border-border bg-background p-3 text-sm">
          <p className="font-black">{preview.employeeName || selected?.displayName}</p>
          {!preview.hasStuck ? (
            <p data-testid="tele-stuck-reset-idle">אין מצב פעיל — אין מה לאפס.</p>
          ) : (
            <>
              {preview.openCall && (
                <p>
                  שיחה פתוחה: {String(preview.openCall.company_name || preview.openCall.companyName || '')}
                  {' · '}
                  {String(preview.openCall.kind || '') === 'pending_report' ? 'דיווח ממתין' : 'שיחה פעילה'}
                  {' · מ־'}
                  {formatSince(String(preview.openCall.ended_at || preview.openCall.endedAt || preview.openCall.started_at || preview.openCall.startedAt || ''))}
                </p>
              )}
              {preview.openWork && (
                <p>
                  משימה פתוחה: {String(preview.openWork.company_name || preview.openWork.task_type || '')}
                  {' · מ־'}
                  {formatSince(String(preview.openWork.ended_at || preview.openWork.started_at || ''))}
                </p>
              )}
              {preview.claimedLeads.length > 0 && (
                <p>נעילות ליד לשחרור: {preview.claimedLeads.length}</p>
              )}
              <p className="font-semibold">מה יאופס:</p>
              <ul className="list-disc pr-5">
                {preview.willReset.map((item, i) => (
                  <li key={i}>{item.label}{item.since ? ` · מ־${formatSince(item.since)}` : ''}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{preview.willNot.join(' · ')}</p>
              <button
                type="button"
                data-testid="tele-stuck-reset-confirm"
                onClick={() => void confirmReset()}
                disabled={busy || inspect}
                className="min-h-12 w-full rounded-xl bg-amber-700 px-4 text-sm font-black text-white disabled:opacity-50"
              >
                אשר איפוס פעולה תקועה
              </button>
            </>
          )}
        </div>
      )}
      {message && <p className="text-sm font-semibold text-emerald-700">{message}</p>}
      {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
    </section>
  );
}
