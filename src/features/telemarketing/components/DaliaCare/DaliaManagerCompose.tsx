import { useEffect, useState } from 'react';
import { createManagerInternalChat, getTelemarketingAgents } from '@/features/telemarketing/services/teamChatService';
import type { UrgencyLevel } from '@/features/telemarketing/types';

export function DaliaManagerCompose({
  actorName,
  onCreated,
}: {
  actorName: string;
  onCreated?: () => void;
}) {
  const [agents, setAgents] = useState<{ id: string; displayName: string }[]>([]);
  const [agentId, setAgentId] = useState('');
  const [body, setBody] = useState('');
  const [urgency, setUrgency] = useState<UrgencyLevel>('רגיל');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getTelemarketingAgents()
      .then(setAgents)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'שגיאה בטעינת עובדים'));
  }, []);

  const submit = async () => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) {
      setError('חובה לבחור עובד');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createManagerInternalChat({
        agentId: agent.id,
        agentName: agent.displayName,
        body,
        urgency,
        companyName: companyName.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setBody('');
      setCompanyName('');
      setPhone('');
      onCreated?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה בפתיחת פנייה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
      <p className="font-black">פנייה פנימית לעובד — ללא חובת לקוח</p>
      <p className="text-xs text-muted-foreground">
        {actorName} שולח הודעה לעובד. הלקוח אופציונלי. העובד רואה Unread ויכול לענות בתוך ה-Thread.
      </p>
      <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="min-h-12 w-full rounded-lg border border-border bg-background p-2 text-sm">
        <option value="">בחירת עובד</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>{agent.displayName}</option>
        ))}
      </select>
      <select value={urgency} onChange={(e) => setUrgency(e.target.value as UrgencyLevel)} className="min-h-12 w-full rounded-lg border border-border bg-background p-2 text-sm">
        <option value="רגיל">דחיפות רגילה</option>
        <option value="חשוב">חשוב</option>
        <option value="דחוף">דחוף</option>
      </select>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="min-h-20 w-full rounded-xl border border-border bg-background p-3" placeholder="הודעה לעובד..." />
      <div className="grid gap-2 md:grid-cols-2">
        <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm" placeholder="לקוח (אופציונלי)" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className="min-h-12 rounded-lg border border-border bg-background p-2 text-sm" placeholder="טלפון (אופציונלי)" dir="ltr" />
      </div>
      {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
      <button type="button" disabled={saving} onClick={() => void submit()} className="min-h-12 w-full rounded-xl bg-violet-700 font-bold text-white disabled:opacity-50">
        {saving ? 'שולח...' : 'שלח פנייה לעובד'}
      </button>
    </div>
  );
}
