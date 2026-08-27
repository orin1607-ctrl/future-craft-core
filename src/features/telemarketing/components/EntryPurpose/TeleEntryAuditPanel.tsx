import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TELE_AUDIT_ACTION } from '@/features/telemarketing/lib/teleEntryMode';

type AuditRow = {
  id: string;
  occurred_at: string;
  actor_email: string | null;
  actor_username: string | null;
  action_label: string | null;
};

const ACTIONS = Object.values(TELE_AUDIT_ACTION);

export function TeleEntryAuditPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);

  useEffect(() => {
    void supabase
      .from('security_audit_events' as 'profiles')
      .select('id, occurred_at, actor_email, actor_username, action_label')
      .order('occurred_at' as never, { ascending: false })
      .limit(80)
      .then(({ data }) => {
        const wanted = new Set(ACTIONS);
        setRows(((data as AuditRow[]) || []).filter((row) => wanted.has(row.action_label as (typeof ACTIONS)[number])).slice(0, 20));
      })
      .catch(() => setRows([]));
  }, []);

  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card p-4" data-testid="tele-entry-audit">
      <h3 className="text-sm font-black">יומן כניסה / מצב בדיקה</h3>
      <p className="text-xs text-muted-foreground">Audit טכני בלבד — לא נספר כזמן עבודה ולא נכנס לדוח ביצועים.</p>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">אין רשומות עדיין</p>}
      <ul className="space-y-1 text-sm">
        {rows.map((row) => (
          <li key={row.id} data-testid="tele-entry-audit-row">
            {new Date(row.occurred_at).toLocaleString('he-IL')} · {row.actor_username || row.actor_email || 'משתמש'} · {row.action_label}
          </li>
        ))}
      </ul>
    </section>
  );
}
