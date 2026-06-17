import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Rocket,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type DeployRun = {
  id: string;
  created_at: string;
  updated_at: string;
  commit_sha: string;
  commit_message: string | null;
  status: string;
  staging_url: string;
  preview_url: string | null;
  production_url: string;
  staging_bundle: string | null;
  preview_bundle: string | null;
  production_bundle: string | null;
  deployed_by_email: string | null;
  backup_path: string | null;
  tests: { passed?: boolean; failures?: string[] };
  changed_screens: string[];
  error_message: string | null;
  github_run_id: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  preview_ready: 'Preview מוכן',
  tests_passed: 'בדיקות עברו',
  tests_failed: 'בדיקות נכשלו',
  awaiting_approval: 'ממתין לאישור',
  deploying: 'מעלה ל-Production…',
  production_live: 'פעיל ב-Production',
  deploy_failed: 'העלאה נכשלה',
  rolled_back: 'בוצע Rollback',
};

async function invokeDeployControl(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('deploy-control', { body });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; error?: string; message?: string; runs?: DeployRun[] };
}

function StatusBadge({ status }: { status: string }) {
  const ok = ['preview_ready', 'tests_passed', 'production_live'].includes(status);
  const bad = ['tests_failed', 'deploy_failed'].includes(status);
  const Icon = ok ? CheckCircle2 : bad ? XCircle : Loader2;
  const cls = ok ? 'text-green-600' : bad ? 'text-destructive' : 'text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${cls}`}>
      <Icon size={16} className={!ok && !bad ? 'animate-spin' : ''} />
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export default function DaliaDeploy() {
  const { user } = useAuth();
  const [runs, setRuns] = useState<DeployRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await invokeDeployControl({ action: 'list' });
    setLoading(false);
    if (res.success && res.runs) setRuns(res.runs);
    else if (res.error) setError(res.error);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  if (user?.role !== 'super_admin') {
    return (
      <div className="text-center py-16 text-muted-foreground">
        אין הרשאה — Deploy למנהל על בלבד
      </div>
    );
  }

  const latest = runs[0];
  const canDeploy = latest && ['preview_ready', 'tests_passed', 'awaiting_approval'].includes(latest.status);
  const canRollback = runs.some((r) => r.status === 'production_live' && r.backup_path);

  const handleDeploy = async () => {
    if (!latest) return;
    setActionLoading('deploy');
    setError('');
    setMessage('');
    const res = await invokeDeployControl({
      action: 'deploy_production',
      deploy_run_id: latest.id,
      commit_sha: latest.commit_sha,
    });
    setActionLoading(null);
    if (res.success) {
      setMessage(res.message || 'העלאה ל-Production התחילה');
      load();
    } else {
      setError(res.error || 'שגיאה');
    }
  };

  const handleRollback = async () => {
    const live = runs.find((r) => r.status === 'production_live');
    setActionLoading('rollback');
    setError('');
    setMessage('');
    const res = await invokeDeployControl({
      action: 'rollback',
      backup_path: live?.backup_path || '',
    });
    setActionLoading(null);
    if (res.success) {
      setMessage(res.message || 'Rollback התחיל');
      load();
    } else {
      setError(res.error || 'שגיאה');
    }
  };

  return (
    <div className="animate-fade-in space-y-6 pb-8">
      <Link to="/dalia-settings" className="text-primary text-sm font-medium inline-flex items-center gap-1">
        <ArrowLeft size={16} /> חזרה ל-Dalia Settings
      </Link>

      <header>
        <h1 className="page-header flex items-center gap-3 mb-2">
          <Rocket size={28} className="text-primary" />
          Deploy — Staging → Preview → Production
        </h1>
        <p className="text-muted-foreground text-sm">
          תהליך אוטומטי: push ל-main → Staging → Preview → אישור → Production
        </p>
      </header>

      {message && (
        <div className="bg-green-500/10 text-green-700 rounded-xl p-4 text-sm">{message}</div>
      )}
      {error && (
        <div className="bg-destructive/10 text-destructive rounded-xl p-4 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-elevated p-5 space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Staging Build</p>
          <p className="font-mono text-sm truncate">{latest?.staging_bundle || '—'}</p>
          <a
            href={latest?.staging_url || 'https://orin1607-ctrl.github.io/future-craft-core/'}
            target="_blank"
            rel="noreferrer"
            className="text-primary text-sm inline-flex items-center gap-1"
          >
            GitHub Pages <ExternalLink size={14} />
          </a>
        </div>
        <div className="card-elevated p-5 space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Preview Build</p>
          <p className="font-mono text-sm truncate">{latest?.preview_bundle || '—'}</p>
          {latest?.preview_url && (
            <a
              href={latest.preview_url}
              target="_blank"
              rel="noreferrer"
              className="text-primary text-sm inline-flex items-center gap-1"
            >
              {latest.preview_url} <ExternalLink size={14} />
            </a>
          )}
        </div>
        <div className="card-elevated p-5 space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Production Build</p>
          <p className="font-mono text-sm truncate">{latest?.production_bundle || '—'}</p>
          <a
            href={latest?.production_url || 'https://dalia-car.online'}
            target="_blank"
            rel="noreferrer"
            className="text-primary text-sm inline-flex items-center gap-1"
          >
            dalia-car.online <ExternalLink size={14} />
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={handleDeploy}
          disabled={!canDeploy || actionLoading !== null}
          className="gap-2"
        >
          {actionLoading === 'deploy' ? <Loader2 className="animate-spin" size={18} /> : <Rocket size={18} />}
          מאשר העלאה ל-Production
        </Button>
        <Button
          variant="outline"
          onClick={handleRollback}
          disabled={!canRollback || actionLoading !== null}
          className="gap-2"
        >
          {actionLoading === 'rollback' ? <Loader2 className="animate-spin" size={18} /> : <RotateCcw size={18} />}
          Rollback לגרסה קודמת
        </Button>
        <Button variant="ghost" onClick={load} disabled={loading}>
          רענון
        </Button>
      </div>

      {loading && !runs.length ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : (
        <div className="card-elevated overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-right">
                <th className="p-3">תאריך</th>
                <th className="p-3">Commit</th>
                <th className="p-3">סטטוס</th>
                <th className="p-3">Preview</th>
                <th className="p-3">Production</th>
                <th className="p-3">מי העלה</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="p-3 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString('he-IL')}
                  </td>
                  <td className="p-3 font-mono text-xs" title={r.commit_message || ''}>
                    {r.commit_sha.slice(0, 7)}
                  </td>
                  <td className="p-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="p-3 font-mono text-xs">{r.preview_bundle || '—'}</td>
                  <td className="p-3 font-mono text-xs">{r.production_bundle || '—'}</td>
                  <td className="p-3">{r.deployed_by_email || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {latest?.changed_screens?.length > 0 && (
        <div className="card-elevated p-5">
          <p className="font-bold mb-2">מסכים שהשתנו (אחרון)</p>
          <p className="text-sm text-muted-foreground">{latest.changed_screens.join(' · ')}</p>
        </div>
      )}
    </div>
  );
}
