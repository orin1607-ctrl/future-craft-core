import { useState, useEffect } from 'react';
import { Download, GitCommit, Loader2, AlertTriangle, CheckCircle2, Clock, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CommitInfo {
  sha: string;
  short: string;
  message: string;
  author: string;
  date: string;
}

interface PendingResponse {
  current_sha: string;
  current_short: string;
  production_branch: string;
  commits_ahead: CommitInfo[];
  pending_migrations: string[];
  webhook_ok: true;
}

interface DeployResult {
  status: 'success' | 'failed';
  sha_before?: string;
  sha_after?: string;
  log_excerpt?: string;
  error?: string;
  duration_ms?: number;
  audit_id?: number;
}

interface AuditRow {
  id: number;
  status: string;
  sha_before: string | null;
  sha_after: string | null;
  duration_ms: number | null;
  triggered_by_email: string | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
}

export default function SystemUpdateCode() {
  const { realUser, isImpersonating } = useAuth();
  const isAllowed = realUser?.role === 'super_admin' && !isImpersonating;

  const [loadingPending, setLoadingPending] = useState(true);
  const [pending, setPending] = useState<PendingResponse | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [lastResult, setLastResult] = useState<DeployResult | null>(null);
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
      setPendingError(error.message || 'שגיאה בבדיקת עדכונים');
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
      .select('id,status,sha_before,sha_after,duration_ms,triggered_by_email,started_at,finished_at,error')
      .eq('action', 'deploy')
      .order('started_at', { ascending: false })
      .limit(5);
    setRecent((data as AuditRow[]) || []);
  };

  const runDeploy = async () => {
    setConfirming(false);
    setDeploying(true);
    setLastResult(null);
    const { data, error } = await supabase.functions.invoke('system-update', {
      body: { action: 'deploy' },
    });
    setDeploying(false);
    if (error) {
      setLastResult({ status: 'failed', error: error.message });
      toast.error('עדכון הקוד נכשל');
    } else {
      const result = data as DeployResult;
      setLastResult(result);
      if (result.status === 'success') {
        toast.success('עדכון הקוד הושלם בהצלחה');
      } else {
        toast.error('עדכון הקוד נכשל');
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

  const commitsCount = pending?.commits_ahead.length ?? 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Download size={26} className="text-primary" />
          עדכון קוד
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          משיכת גרסת קוד עדכנית מהמאגר ובנייה מחדש של האתר. הפעולה ידנית בלבד.
        </p>
      </header>

      {/* Current state */}
      <section className="bg-card border border-border rounded-2xl p-5">
        <h2 className="text-lg font-bold mb-3">המצב הנוכחי</h2>
        {loadingPending ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="animate-spin" size={18} />
            <span>בודק עדכונים זמינים...</span>
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
        ) : pending ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ענף פרודקשן:</span>
              <span className="font-mono">{pending.production_branch}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">גרסת קוד נוכחית:</span>
              <span className="font-mono">{pending.current_short}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">עדכונים ממתינים:</span>
              <span className={`font-bold ${commitsCount > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                {commitsCount === 0 ? 'אין' : `${commitsCount} עדכונים`}
              </span>
            </div>
          </div>
        ) : null}
      </section>

      {/* Pending commits list */}
      {pending && commitsCount > 0 && (
        <section className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <GitCommit size={20} />
            עדכונים שיותקנו ({commitsCount})
          </h2>
          <ul className="space-y-2 text-sm">
            {pending.commits_ahead.map((c) => (
              <li key={c.sha} className="border-r-2 border-primary/40 pr-3 py-1">
                <div className="font-medium">{c.message}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-mono">{c.short}</span>
                  {' · '}
                  <span>{c.author}</span>
                  {' · '}
                  <span>{new Date(c.date).toLocaleString('he-IL')}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Action button */}
      <section className="bg-card border border-border rounded-2xl p-5">
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={deploying || loadingPending || commitsCount === 0}
            className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold text-lg
                       hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed
                       flex items-center justify-center gap-2 transition-colors"
          >
            {deploying ? (
              <>
                <Loader2 className="animate-spin" size={22} />
                מעדכן את האתר...
              </>
            ) : commitsCount === 0 ? (
              'אין עדכונים זמינים'
            ) : (
              <>
                <Download size={22} />
                עדכן קוד עכשיו
              </>
            )}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="bg-warning/10 text-warning-foreground border border-warning/30 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="text-warning shrink-0 mt-0.5" size={20} />
                <div className="text-sm">
                  <p className="font-bold mb-1">לאשר עדכון קוד?</p>
                  <p>תתבצע משיכה של {commitsCount} עדכונים, התקנה ובנייה. התהליך אורך בדרך כלל 1-3 דקות. אין צורך לרענן את הדף.</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={runDeploy} disabled={deploying}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 disabled:opacity-40">
                כן, עדכן עכשיו
              </button>
              <button onClick={() => setConfirming(false)} disabled={deploying}
                className="flex-1 py-3 rounded-xl bg-muted text-foreground font-bold hover:bg-muted/80 disabled:opacity-40">
                ביטול
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Last result */}
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
                {lastResult.status === 'success' ? 'העדכון הסתיים בהצלחה' : 'העדכון נכשל'}
              </p>
              {lastResult.sha_before && lastResult.sha_after && (
                <p className="font-mono text-xs">
                  {lastResult.sha_before.slice(0, 7)} → {lastResult.sha_after.slice(0, 7)}
                </p>
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

      {/* Recent deploys */}
      {recent.length > 0 && (
        <section className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Clock size={20} />
            עדכונים אחרונים
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
                  <span className="font-mono text-xs">
                    {r.sha_before?.slice(0, 7)} → {r.sha_after?.slice(0, 7)}
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
