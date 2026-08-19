import { requireAuth, jsonResponse, edgeCorsHeaders } from '../_shared/edgeAuth.ts';

const GITHUB_REPO = 'orin1607-ctrl/future-craft-core';

function githubActionLabel(type: string, payload: Record<string, unknown>): string {
  if (type === 'PushEvent') {
    const commits = payload.commits as unknown[] | undefined;
    const n = Array.isArray(commits) ? commits.length : 0;
    return n > 0 ? `Push (${n} commits)` : 'Push';
  }
  if (type === 'DeploymentEvent' || type === 'DeployEvent') return 'Deployment';
  if (type === 'PullRequestEvent') {
    const action = String(payload.action || '');
    const pr = payload.pull_request as { merged?: boolean } | undefined;
    if (action === 'closed' && pr?.merged) return 'Merge';
    return action ? `Pull Request (${action})` : 'Pull Request';
  }
  if (type === 'WorkflowRunEvent') {
    const run = payload.workflow_run as { name?: string } | undefined;
    const name = run?.name || String(payload.workflow || '');
    return name ? `Workflow — ${name}` : 'Workflow';
  }
  if (type === 'ReleaseEvent') return 'Release';
  if (type === 'CreateEvent') return 'Create';
  if (type === 'DeleteEvent') return 'Delete';
  return type.replace(/Event$/, '');
}

function githubBranch(payload: Record<string, unknown>): string | null {
  const run = payload.workflow_run as { head_branch?: string } | undefined;
  if (run?.head_branch) return run.head_branch;
  const ref = String(payload.ref || '');
  if (ref.startsWith('refs/heads/')) return ref.slice('refs/heads/'.length);
  if (ref.startsWith('refs/tags/')) return ref.slice('refs/tags/'.length);
  return ref || null;
}

function githubOutcome(type: string, payload: Record<string, unknown>): { outcome: string; result: string } {
  if (type === 'WorkflowRunEvent') {
    const run = payload.workflow_run as { conclusion?: string } | undefined;
    if (run?.conclusion === 'success') return { outcome: 'success', result: 'הצליח' };
    if (run?.conclusion === 'failure') return { outcome: 'failure', result: 'נכשל' };
    if (run?.conclusion) return { outcome: 'unknown', result: run.conclusion };
  }
  return { outcome: 'success', result: 'הצליח' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: edgeCorsHeaders });
  }

  const auth = await requireAuth(req, { roles: ['super_admin'] });
  if ('error' in auth) return auth.error;
  const { supabaseAdmin } = auth.ctx;

  const ingested: Record<string, number | string> = { github: 0, supabase: 0 };

  try {
    const ghRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/events?per_page=25`,
      { headers: { 'User-Agent': 'dalia-security-center-staging', Accept: 'application/vnd.github+json' } },
    );
    if (ghRes.ok) {
      const events = await ghRes.json() as Array<{
        id: string;
        type: string;
        created_at: string;
        actor?: { login?: string; id?: number };
        payload?: Record<string, unknown>;
      }>;
      for (const ev of events) {
        const type = ev.type || 'UnknownEvent';
        if (!['PushEvent', 'PullRequestEvent', 'CreateEvent', 'DeleteEvent', 'ReleaseEvent', 'WorkflowRunEvent', 'DeploymentEvent'].includes(type)) {
          continue;
        }
        const payload = ev.payload || {};
        const login = ev.actor?.login || null;
        const branch = githubBranch(payload);
        const { outcome, result } = githubOutcome(type, payload);
        const { error } = await supabaseAdmin.rpc('security_ingest_external', {
          p_source: 'github',
          p_event_type: type,
          p_action_label: githubActionLabel(type, payload),
          p_result_label: result,
          p_outcome: outcome,
          p_identity_status: login ? 'identified' : 'identity_unavailable',
          p_severity: 'info',
          p_source_ref: ev.id,
          p_actor_email: null,
          p_actor_role: 'github_actor',
          p_occurred_at: ev.created_at,
          p_details: {
            actor: login,
            actor_id: ev.actor?.id || null,
            repo: GITHUB_REPO,
            branch,
            ref: payload.ref || null,
            github_action: payload.action || null,
            object_type: 'repository',
          },
        });
        if (!error) ingested.github = Number(ingested.github) + 1;
      }
    } else {
      ingested.github = `http_${ghRes.status}`;
    }
  } catch (e) {
    ingested.github = 'error';
    ingested.github_error = e instanceof Error ? e.message : 'github_fetch_failed';
  }

  try {
    const { data, error } = await supabaseAdmin
      .schema('auth')
      .from('audit_log_entries')
      .select('id, payload, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) {
      ingested.supabase = 'not_available';
      ingested.supabase_reason = 'זהות לא זמינה — Supabase לא מספק Audit Log ל-Management דרך API זה בפרויקט';
    } else {
      for (const row of data || []) {
        const payload = (row as { payload?: Record<string, unknown> }).payload || {};
        const actor = String(payload.actor_username || payload.actor || '');
        const action = String(payload.action || 'auth_audit');
        const { error: insErr } = await supabaseAdmin.rpc('security_ingest_external', {
          p_source: 'supabase',
          p_event_type: action,
          p_action_label: action,
          p_result_label: 'נקלט',
          p_outcome: 'unknown',
          p_identity_status: actor ? 'identified' : 'identity_unavailable',
          p_severity: 'info',
          p_source_ref: String((row as { id: string }).id),
          p_actor_email: null,
          p_occurred_at: (row as { created_at: string }).created_at,
          p_details: {
            actor: actor || null,
            object_type: 'supabase',
            note: 'מוצג רק מה ש-Supabase סיפק. אין ניחוש זהות.',
          },
        });
        if (!insErr) ingested.supabase = Number(ingested.supabase) + 1;
      }
    }
  } catch {
    ingested.supabase = 'not_available';
  }

  ingested.vps = 'collector_separate';
  ingested.vps_note = 'אירועי VPS נקלטים בסקריפט ייעודי לקריאה בלבד אל Staging, בלי שינוי בשרת.';

  return jsonResponse({ ok: true, ingested });
});
