import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GITHUB_REPO = Deno.env.get('GITHUB_REPO') || 'orin1607-ctrl/future-craft-core';

async function requireSuperAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Unauthorized', status: 401 };
  }
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return { error: 'Unauthorized', status: 401 };

  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (roleRow?.role !== 'super_admin') {
    return { error: 'Forbidden — super_admin only', status: 403 };
  }
  return { admin, user };
}

async function dispatchWorkflow(
  workflowFile: string,
  ref: string,
  inputs: Record<string, string>,
) {
  const pat = Deno.env.get('GITHUB_PAT');
  if (!pat) {
    return { ok: false, error: 'GITHUB_PAT not configured on edge function' };
  }

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref, inputs }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `GitHub dispatch failed: ${res.status} ${text.slice(0, 300)}` };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await requireSuperAdmin(req);
    if ('error' in auth && auth.error) {
      return new Response(JSON.stringify({ success: false, error: auth.error }), {
        status: auth.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { admin, user } = auth as { admin: ReturnType<typeof createClient>; user: { id: string; email?: string } };
    const body = await req.json();
    const action = body.action as string;

    if (action === 'list') {
      const { data, error } = await admin
        .from('deploy_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, runs: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'deploy_production') {
      const deployRunId = body.deploy_run_id || '';
      const commitSha = body.commit_sha || 'main';

      if (deployRunId) {
        await admin.from('deploy_runs').update({
          status: 'deploying',
          deployed_by: user.id,
          deployed_by_email: user.email,
          updated_at: new Date().toISOString(),
        }).eq('id', deployRunId);
      }

      const result = await dispatchWorkflow('deploy-production-vps.yml', 'main', {
        commit_sha: commitSha === 'main' ? '' : commitSha,
        deploy_run_id: deployRunId,
      });

      if (!result.ok) {
        return new Response(JSON.stringify({ success: false, error: result.error }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Production deploy started — GitHub Actions',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'rollback') {
      const backupPath = body.backup_path || '';
      const result = await dispatchWorkflow('rollback-production-vps.yml', 'main', {
        backup_path: backupPath,
      });

      if (!result.ok) {
        return new Response(JSON.stringify({ success: false, error: result.error }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Rollback started — GitHub Actions',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: false, error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : 'Unexpected error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
