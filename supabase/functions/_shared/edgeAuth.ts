import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const edgeCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-dalia-internal-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export type AppRole = 'super_admin' | 'fleet_manager' | 'driver' | 'private_customer' | 'telemarketing_agent';

export type AuthContext = {
  user: { id: string; email?: string };
  role: AppRole;
  companyName: string | null;
  supabaseAdmin: SupabaseClient;
  /** Supabase client scoped to the caller JWT — RLS applies. */
  supabaseUser: SupabaseClient;
  token: string;
  isInternalCall: boolean;
};

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

function isInternalSecret(req: Request): boolean {
  const secret = Deno.env.get('DALIA_EDGE_INTERNAL_SECRET');
  if (!secret) return false;
  return req.headers.get('x-dalia-internal-key') === secret;
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...edgeCorsHeaders, 'Content-Type': 'application/json' },
  });
}

function jwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isNonUserJwt(token: string): boolean {
  const payload = jwtPayload(token);
  const role = payload?.role;
  return role === 'anon' || role === 'service_role';
}

export async function requireAuth(
  req: Request,
  options?: { roles?: AppRole[]; allowInternal?: boolean },
): Promise<{ ctx: AuthContext } | { error: Response }> {
  const supabaseAdmin = adminClient();

  if (options?.allowInternal && isInternalSecret(req)) {
    return {
      ctx: {
        user: { id: 'internal', email: 'internal@system' },
        role: 'super_admin',
        companyName: null,
        supabaseAdmin,
        supabaseUser: supabaseAdmin,
        token: '',
        isInternalCall: true,
      },
    };
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: jsonResponse({ error: 'Unauthorized' }, 401) };
  }

  const token = authHeader.replace('Bearer ', '').trim();
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if ((anonKey && token === anonKey) || (serviceKey && token === serviceKey) || isNonUserJwt(token)) {
    return { error: jsonResponse({ error: 'Forbidden — user session required' }, 403) };
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return { error: jsonResponse({ error: 'Unauthorized' }, 401) };
  }

  const { data: roleRow } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  const role = roleRow?.role as AppRole | undefined;
  if (!role) {
    return { error: jsonResponse({ error: 'Forbidden — no role assigned' }, 403) };
  }

  if (options?.roles && !options.roles.includes(role)) {
    return { error: jsonResponse({ error: 'Forbidden' }, 403) };
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('company_name, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (profile && profile.is_active === false) {
    return { error: jsonResponse({ error: 'Forbidden — account inactive' }, 403) };
  }

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  return {
    ctx: {
      user: { id: user.id, email: user.email },
      role,
      companyName: profile?.company_name ?? null,
      supabaseAdmin,
      supabaseUser,
      token,
      isInternalCall: false,
    },
  };
}

/** Non-super_admin callers must match the target company. */
export function assertCompanyAccess(
  ctx: AuthContext,
  companyName: string | null | undefined,
): Response | null {
  if (ctx.isInternalCall || ctx.role === 'super_admin') return null;
  if (!companyName || !ctx.companyName || companyName !== ctx.companyName) {
    return jsonResponse({ error: 'Forbidden — company mismatch' }, 403);
  }
  return null;
}

/** Server-side company filter — ignores client override for non-super_admin. */
export function resolveCompanyScope(ctx: AuthContext, requested?: string | null): string | undefined {
  if (ctx.role === 'super_admin') {
    return requested?.trim() || ctx.companyName || undefined;
  }
  return ctx.companyName || undefined;
}
