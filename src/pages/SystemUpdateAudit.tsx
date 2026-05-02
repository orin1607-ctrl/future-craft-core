import { useState, useEffect } from 'react';
import { ScrollText, CheckCircle2, AlertTriangle, Loader2, Lock, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface AuditRow {
  id: number;
  action: 'deploy' | 'migrate';
  status: 'started' | 'success' | 'failed';
  triggered_by_email: string | null;
  sha_before: string | null;
  sha_after: string | null;
  migrations_applied: string[] | null;
  log_excerpt: string | null;
  error: string | null;
  duration_ms: number | null;
  started_at: string;
  finished_at: string | null;
}

const ACTION_LABEL: Record<string, string> = {
  deploy: 'עדכון קוד',
  migrate: 'עדכון מסד נתונים',
};

const STATUS_LABEL: Record<string, string> = {
  started: 'בתהליך',
  success: 'הצליח',
  failed: 'נכשל',
};

export default function SystemUpdateAudit() {
  const { realUser, isImpersonating } = useAuth();
  const isAllowed = realUser?.role === 'super_admin' && !isImpersonating;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'deploy' | 'migrate'>('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (isAllowed) load();
  }, [isAllowed, filter]);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from('system_update_audit')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(100);
    if (filter !== 'all') q = q.eq('action', filter);
    const { data } = await q;
    setRows((data as AuditRow[]) || []);
    setLoading(false);
  };

  if (!isAllowed) {
    return (
      <div className="max-w-3xl mx-auto p-6 bg-card rounded-2xl border border-border text-center">
        <Lock className="mx-auto mb-3 text-muted-foreground" size={32} />
        <p className="font-medium">דף זה זמין רק למנהל על</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ScrollText size={26} className="text-primary" />
          יומן עדכונים
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          היסטוריית כל פעולות עדכון הקוד ומסד הנתונים שבוצעו במערכת.
        </p>
      </header>

      <div className="flex gap-2">
        {([
          ['all', 'הכל'],
          ['deploy', 'קוד'],
          ['migrate', 'מסד נתונים'],
        ] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === val ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="animate-spin" size={18} />
            <span>טוען...</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">אין רישומים</div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const isOpen = expanded === r.id;
              return (
                <li key={r.id}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    className="w-full p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors text-right"
                  >
                    {r.status === 'success' ? (
                      <CheckCircle2 size={18} className="text-primary shrink-0" />
                    ) : r.status === 'failed' ? (
                      <AlertTriangle size={18} className="text-destructive shrink-0" />
                    ) : (
                      <Loader2 size={18} className="animate-spin text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-bold">{ACTION_LABEL[r.action]}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          r.status === 'success' ? 'bg-primary/10 text-primary' :
                          r.status === 'failed' ? 'bg-destructive/10 text-destructive' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(r.started_at).toLocaleString('he-IL')}
                        {r.triggered_by_email && ` · ${r.triggered_by_email}`}
                        {r.duration_ms != null && ` · ${(r.duration_ms / 1000).toFixed(1)}s`}
                      </div>
                    </div>
                    <ChevronDown size={18} className={`text-muted-foreground transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 text-xs space-y-2 bg-muted/20">
                      {r.sha_before && r.sha_after && (
                        <div>
                          <span className="text-muted-foreground">גרסה: </span>
                          <span className="font-mono">{r.sha_before.slice(0, 7)} → {r.sha_after.slice(0, 7)}</span>
                        </div>
                      )}
                      {r.migrations_applied && r.migrations_applied.length > 0 && (
                        <div>
                          <p className="text-muted-foreground">מיגרציות:</p>
                          <ul className="font-mono mt-1 space-y-0.5">
                            {r.migrations_applied.map((m) => <li key={m}>· {m}</li>)}
                          </ul>
                        </div>
                      )}
                      {r.error && (
                        <div>
                          <p className="text-destructive font-medium">שגיאה:</p>
                          <pre className="bg-background rounded p-2 mt-1 overflow-auto max-h-40 whitespace-pre-wrap">
                            {r.error}
                          </pre>
                        </div>
                      )}
                      {r.log_excerpt && (
                        <details>
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">לוג מלא</summary>
                          <pre className="bg-background rounded p-2 mt-1 overflow-auto max-h-80 whitespace-pre-wrap">
                            {r.log_excerpt}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
