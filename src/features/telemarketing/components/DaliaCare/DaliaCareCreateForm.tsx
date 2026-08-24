import { useState } from 'react';
import { DaliaCareFields, EMPTY_DALIA_CARE } from '@/features/telemarketing/components/DaliaCare/DaliaCareFields';
import type { DaliaCareDraft } from '@/features/telemarketing/components/DaliaCare/DaliaCareFields';
import { createTeamChatIfNeeded } from '@/features/telemarketing/services/teamChatService';

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function DaliaCareCreateForm({
  agentId,
  agentName,
  companyName,
  contactName,
  phone,
  email,
  callId,
  followupId,
  workSessionId,
  lastCallSummary,
  onCreated,
}: {
  agentId: string;
  agentName: string;
  companyName?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  callId?: string | null;
  followupId?: string | null;
  workSessionId?: string | null;
  lastCallSummary?: string;
  onCreated?: () => void;
}) {
  const [draft, setDraft] = useState<DaliaCareDraft>({ ...EMPTY_DALIA_CARE, needsDaliaCare: true });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await createTeamChatIfNeeded({
        agentId,
        agentName,
        companyName,
        contactName,
        phone,
        email,
        callId,
        followupId,
        workSessionId,
        lastCallSummary,
        clientToken: `dalia-manual-${uuid()}`,
        care: draft,
      });
      if (!created) {
        setError('יש לבחור כן ולמלא את פרטי הטיפול');
        return;
      }
      setDraft({ ...EMPTY_DALIA_CARE, needsDaliaCare: true });
      onCreated?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה בפתיחת טיפול');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <DaliaCareFields draft={draft} onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))} />
      {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
      <button
        type="button"
        disabled={saving || !draft.needsDaliaCare}
        onClick={() => void submit()}
        className="min-h-12 w-full rounded-xl bg-violet-700 font-bold text-white disabled:opacity-50"
      >
        {saving ? 'פותח...' : 'פתח 🟣 טיפול צוות דליה'}
      </button>
    </div>
  );
}
