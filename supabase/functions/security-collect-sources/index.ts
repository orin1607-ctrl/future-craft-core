import { requireAuth, jsonResponse, edgeCorsHeaders } from '../_shared/edgeAuth.ts';

const GITHUB_REPO = 'orin1607-ctrl/future-craft-core';

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
        actor?: { login?: string };
        payload?: { ref?: string };
      }>;
      for (const ev of events) {
        const type = ev.type || 'UnknownEvent';
        if (!['PushEvent', 'PullRequestEvent', 'CreateEvent', 'DeleteEvent', 'ReleaseEvent', 'WorkflowRunEvent'].includes(type)) {
          continue;
        }
        const { error } = await supabaseAdmin.rpc('security_ingest_external', {
          p_source: 'github',
          p_event_type: type,
          p_action_label: type === 'PushEvent' ? 'Push' : type.replace('Event', ''),
          p_result_label: 'נקלט',
          p_outcome: 'success',
          p_identity_status: ev.actor?.login ? 'identified' : 'identity_unavailable',
          p_severity: 'info',
          p_source_ref: ev.id,
          p_actor_email: ev.actor?.login ? `${ev.actor.login}@users.noreply.github.com` : null,
          p_actor_role: 'github_actor',
          p_occurred_at: ev.created_at,
          p_details: { repo: GITHUB_REPO, ref: ev.payload?.ref || null, actor: ev.actor?.login || null },
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
        const payload = (row as { payload?: { action?: string; actor_username?: string } }).payload || {};
        const { error: insErr } = await supabaseAdmin.rpc('security_ingest_external', {
          p_source: 'supabase',
          p_event_type: payload.action || 'auth_audit',
          p_action_label: payload.action || 'אירוע Auth',
          p_result_label: 'נקלט',
          p_outcome: 'unknown',
          p_identity_status: payload.actor_username ? 'identified' : 'identity_unavailable',
          p_severity: 'info',
          p_source_ref: String((row as { id: string }).id),
          p_actor_email: payload.actor_username || null,
          p_occurred_at: (row as { created_at: string }).created_at,
          p_details: { note: 'auth.audit_log_entries — ללא ניחוש זהות' },
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
