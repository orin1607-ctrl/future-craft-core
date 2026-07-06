import { edgeCorsHeaders, requireAuth, jsonResponse } from "../_shared/edgeAuth.ts";

const corsHeaders = edgeCorsHeaders;

const DEFAULT_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/webmasters",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/analytics.edit",
  "https://www.googleapis.com/auth/siteverification",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/script.deployments",
  "https://www.googleapis.com/auth/script.scriptapp",
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/adwords",
  "https://www.googleapis.com/auth/tagmanager.readonly",
];

function stagingRedirectUri(): string {
  const custom = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI");
  if (custom) return custom;
  return "https://orin1607-ctrl.github.io/future-craft-core/oauth/google-callback.html";
}

function buildAuthUrl(state: string): { url: string | null; error?: string } {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  if (!clientId) return { url: null, error: "GOOGLE_CLIENT_ID missing in Edge secrets" };
  const redirectUri = stagingRedirectUri();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: DEFAULT_SCOPES.join(" "),
    state,
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
}

async function exchangeCode(code: string, redirectUri: string) {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return { ok: false, error: "Google OAuth client not configured on server" };
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: data.error_description || data.error || "token_exchange_failed" };
  }
  return { ok: true, tokens: data };
}

async function storeRefreshToken(refreshToken: string, email: string) {
  const projectRef = Deno.env.get("SUPABASE_PROJECT_REF") || "usfeoerkpcafxxlyuldl";
  const accessToken = Deno.env.get("SUPABASE_ACCESS_TOKEN");
  if (!accessToken) {
    return { ok: false, error: "SUPABASE_ACCESS_TOKEN not set — run upload-marketing-edge-secrets or set manually" };
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      { name: "GOOGLE_REFRESH_TOKEN", value: refreshToken },
    ]),
  });
  if (!res.ok) {
    const err = await res.text();
    return { ok: false, error: `secrets_api: ${err.slice(0, 200)}` };
  }
  return { ok: true, email };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let body: Record<string, unknown> = {};
  try {
    if (req.method === "POST") body = await req.json();
  } catch {
    body = {};
  }

  const action = String(body.action || "auth_url");

  if (action === "config") {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const hasRefresh = !!Deno.env.get("GOOGLE_REFRESH_TOKEN");
    return jsonResponse({
      ok: true,
      clientIdPresent: !!clientId,
      refreshTokenPresent: hasRefresh,
      redirectUri: stagingRedirectUri(),
      scopes: DEFAULT_SCOPES.length,
    });
  }

  if (action === "exchange") {
    const auth = await requireAuth(req, { roles: ["super_admin"] });
    if ("error" in auth) return auth.error;
    const code = String(body.code || "");
    if (!code) return jsonResponse({ ok: false, error: "missing code" }, 400);
    const redirectUri = String(body.redirectUri || stagingRedirectUri());
    const exchanged = await exchangeCode(code, redirectUri);
    if (!exchanged.ok) return jsonResponse(exchanged, 400);
    const refresh = exchanged.tokens?.refresh_token;
    if (!refresh) {
      return jsonResponse({
        ok: false,
        error: "no_refresh_token",
        note: "Google did not return refresh_token — revoke app access and retry with prompt=consent",
      }, 400);
    }
    let email = "";
    if (exchanged.tokens?.access_token) {
      try {
        const me = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${exchanged.tokens.access_token}` },
        });
        const info = await me.json();
        email = info.email || "";
      } catch { /* ignore */ }
    }
    const stored = await storeRefreshToken(refresh, email);
    if (!stored.ok) {
      return jsonResponse({
        ok: false,
        error: stored.error,
        note: "Token received but not stored — owner can run upload-marketing-edge-secrets.mjs",
        hasRefreshToken: true,
      }, 502);
    }
    return jsonResponse({ ok: true, email, message: "Google OAuth connected — refresh token stored in Edge secrets" });
  }

  const auth = await requireAuth(req, { roles: ["super_admin"] });
  if ("error" in auth) return auth.error;

  const built = buildAuthUrl(String(body.state || auth.ctx.user.id));
  if (!built.url) return jsonResponse({ ok: false, error: built.error }, 503);
  return jsonResponse({
    ok: true,
    authUrl: built.url,
    redirectUri: stagingRedirectUri(),
    scopes: DEFAULT_SCOPES,
    note: "Add redirect URI in GCP if you see redirect_uri_mismatch",
  });
});
