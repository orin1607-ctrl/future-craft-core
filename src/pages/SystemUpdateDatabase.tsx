import { useState, useEffect } from 'react';
import { Database, FileText, Loader2, AlertTriangle, CheckCircle2, Clock, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PendingResponse {
  current_sha: string;
  current_short: string;
  production_branch: string;
  commits_ahead: unknown[];
  pending_migrations: string[];
  webhook_ok: true;
}

interface MigrateResult {
  status: 'success' | 'failed';
  migrations_applied?: string[];
  log_excerpt?: string;
  error?: string;
  duration_ms?: number;
  audit_id?: number;
}

interface AuditRow {
  id: number;
  status: string;
  migrations_applied: string[] | null;
  duration_ms: number | null;
  triggered_by_email: string | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
}

export default function SystemUpdateDatabase() {
  const { realUser, isImpersonating } = useAuth();
  const isAllowed = realUser?.role === 'super_admin' && !isImpersonating;

  const [loadingPending, setLoadingPending] = useState(true);
  const [pending, setPending] = useState<PendingResponse | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [lastResult, setLastResult] = useState<MigrateResult | null>(null);
  const [recent, setRecent] = useState<AuditRow[]>([]);

  useEffect(() => {
    if (isAllowed) {
      loadPending();
      loadRecent();
    }
  }, [isAllowed]);

  const loadPending = async () => {
    setLoadingPending(true);
    setPendingError(null);
    const { data, error } = await supabase.functions.invoke('system-update', {
      body: { action: 'pending' },
    });
    if (error) {
      setPendingError(error.message || 'שגיאה בבדיקת מיגרציות');
      setPending(null);
    } else if ((data as { error?: string })?.error) {
      setPendingError((data as { error?: string }).error || 'שגיאה');
      setPending(null);
    } else {
      setPending(data as PendingResponse);
    }
    setLoadingPending(false);
  };

  const loadRecent = async () => {
    const { data } = await supabase
      .from('system_update_audit')
      .select('id,status,migrations_applied,duration_ms,triggered_by_email,started_at,finished_at,error')
      .eq('action', 'migrate')
      .order('started_at', { ascending: false })
      .limit(5);
    setRecent((data as AuditRow[]) || []);
  };

  const runMigrate = async () => {
    setConfirming(false);
    setMigrating(true);
    setLastResult(null);
    const { data, error } = await supabase.functions.invoke('system-update', {
      body: { action: 'migrate' },
    });
    setMigrating(false);
    if (error) {
      setLastResult({ status: 'failed', error: error.message });
      toast.error('עדכון מסד הנתונים נכשל');
    } else {
      const result = data as MigrateResult;
      setLastResult(result);
      if (result.status === 'success') {
        toast.success('עדכון מסד הנתונים הושלם בהצלחה');
      } else {
        toast.error('עדכון מסד הנתונים נכשל');
      }
    }
    loadPending();
    loadRecent();
  };

  if (!isAllowed) {
    return (
      <div className="max-w-3xl mx-auto p-6 bg-card rounded-2xl border border-border text-center">
        <Lock className="mx-auto mb-3 text-muted-foreground" size={32} />
        <p className="font-medium">דף זה זמין רק למנהל על</p>
      </div>
    );
  }

  const migrationsCount = pending?.pending_migrations.length ?? 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database size={26} className="text-primary" />
          עדכון מסד נתונים
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          הרצת מיגרציות חדשות (טבלאות, עמודות, פונקציות) על מסד הנתונים. הפעולה ידנית בלבד ובלתי הפיכה.
        </p>
      </header>

      <section className="bg-warning/10 border border-warning/30 rounded-2xl p-4 text-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle className="text-warning shrink-0 mt-0.5" size={18} />
          <div>
            <p className="font-bold mb-1">חשוב לדעת</p>
            <ul className="list-disc pr-5 space-y-0.5 text-foreground/80">
              <li>שינויי מסד נתונים אינם הפיכים אוטומטית</li>
              <li>מומלץ להריץ קודם עדכון קוד, ואז עדכון מסד נתונים</li>
              <li>כל פעולה נשמרת ביומן הביקורת</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="bg-card border border-border rounded-2xl p-5">
        <h2 className="text-lg font-bold mb-3">מיגרציות ממתינות</h2>
        {loadingPending ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="animate-spin" size={18} />
            <span>בודק מיגרציות חדשות...</span>
          </div>
        ) : pendingError ? (
          <div className="flex items-start gap-2 text-destructive bg-destructive/5 p-3 rounded-lg">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">לא ניתן להתחבר לשרת העדכונים</p>
              <p className="text-sm opacity-80 mt-1">{pendingError}</p>
              <button onClick={loadPending} className="mt-2 text-sm underline">נסה שוב</button>
            </div>
          </div>
        ) : migrationsCount === 0 ? (
          <div className="text-muted-foreground text-sm">אין מיגרציות ממתינות.</div>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {pending?.pending_migrations.map((m) => (
              <li key={m} className="flex items-center gap-2 font-mono text-xs bg-muted/50 px-3 py-2 rounded-lg">
                <FileText size={14} className="text-primary shrink-0" />
                {m}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card border border-border rounded-2xl p-5">
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={migrating || loadingPending || migrationsCount === 0}
            className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold text-lg
                       hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed
                       flex items-center justify-center gap-2 transition-colors"
          >
            {migrating ? (
              <>
                <Loader2 className="animate-spin" size={22} />
                מריץ מיגרציות...
              </>
            ) : migrationsCount === 0 ? (
              'אין מיגרציות זמינות'
            ) : (
              <>
                <Database size={22} />
                הרץ מיגרציות עכשיו
              </>
            )}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="bg-destructive/10 text-foreground border border-destructive/40 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="text-destructive shrink-0 mt-0.5" size={20} />
                <div className="text-sm">
                  <p className="font-bold mb-1">אישור הרצת מיגרציות</p>
                  <p>תורצנה {migrationsCount} מיגרציות על מסד הנתונים. שינויים אלו אינם הפיכים אוטומטית.</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={runMigrate} disabled={migrating}
                className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground font-bold hover:bg-destructive/90 disabled:opacity-40">
                כן, הרץ עכשיו
              </button>
              <button onClick={() => setConfirming(false)} disabled={migrating}
                className="flex-1 py-3 rounded-xl bg-muted text-foreground font-bold hover:bg-muted/80 disabled:opacity-40">
                ביטול
              </button>
            </div>
          </div>
        )}
      </section>

      {lastResult && (
        <section className={`rounded-2xl p-5 border ${lastResult.status === 'success'
          ? 'bg-primary/5 border-primary/30'
          : 'bg-destructive/5 border-destructive/30'}`}>
          <div className="flex items-start gap-3">
            {lastResult.status === 'success' ? (
              <CheckCircle2 className="text-primary shrink-0" size={22} />
            ) : (
              <AlertTriangle className="text-destructive shrink-0" size={22} />
            )}
            <div className="flex-1 text-sm space-y-1">
              <p className="font-bold">
                {lastResult.status === 'success' ? 'המיגרציות הסתיימו בהצלחה' : 'המיגרציות נכשלו'}
              </p>
              {lastResult.migrations_applied && lastResult.migrations_applied.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">הותקנו:</p>
                  <ul className="space-y-0.5 font-mono text-xs">
                    {lastResult.migrations_applied.map((m) => <li key={m}>· {m}</li>)}
                  </ul>
                </div>
              )}
              {lastResult.duration_ms && (
                <p className="text-muted-foreground text-xs">
                  משך: {(lastResult.duration_ms / 1000).toFixed(1)} שניות
                </p>
              )}
              {lastResult.error && (
                <pre className="bg-background/60 rounded p-2 mt-2 text-xs overflow-auto max-h-40 whitespace-pre-wrap">
                  {lastResult.error}
                </pre>
              )}
              {lastResult.log_excerpt && (
                <details className="mt-2">
                  <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">
                    הצג לוג
                  </summary>
                  <pre className="bg-background/60 rounded p-2 mt-2 text-xs overflow-auto max-h-60 whitespace-pre-wrap">
                    {lastResult.log_excerpt}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Clock size={20} />
            עדכוני מסד נתונים אחרונים
          </h2>
          <ul className="space-y-2 text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between border-b border-border pb-2 last:border-b-0">
                <div className="flex items-center gap-2">
                  {r.status === 'success' ? (
                    <CheckCircle2 size={16} className="text-primary" />
                  ) : (
                    <AlertTriangle size={16} className="text-destructive" />
                  )}
                  <span className="text-xs">
                    {r.migrations_applied?.length || 0} מיגרציות
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(r.started_at).toLocaleString('he-IL')}
                  {r.triggered_by_email && ` · ${r.triggered_by_email}`}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
