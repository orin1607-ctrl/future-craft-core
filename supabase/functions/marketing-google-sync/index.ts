import { edgeCorsHeaders, requireAuth, jsonResponse } from "../_shared/edgeAuth.ts";

const corsHeaders = edgeCorsHeaders;

const PROVIDERS = [
  "google_search_console",
  "google_analytics",
  "google_ads",
  "google_business",
  "google_tag_manager",
  "gmail",
  "google_workspace",
] as const;

async function googleAccessToken(): Promise<string | null> {
  const refresh = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!refresh || !clientId || !clientSecret) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  return data.access_token || null;
}

async function fetchGscSummary(token: string, siteUrl: string) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 28);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const q = new URLSearchParams({
    startDate: fmt(start),
    endDate: fmt(end),
    dimensions: "query",
    rowLimit: "25",
  });
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      startDate: fmt(start),
      endDate: fmt(end),
      dimensions: ["query"],
      rowLimit: 25,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return { ok: false, error: err.slice(0, 200) };
  }
  const data = await res.json();
  const rows = data.rows || [];
  let clicks = 0;
  let impressions = 0;
  rows.forEach((r: { clicks?: number; impressions?: number }) => {
    clicks += r.clicks || 0;
    impressions += r.impressions || 0;
  });
  return {
    ok: true,
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    keywords: rows.map((r: { keys?: string[]; clicks?: number; impressions?: number; position?: number }) => ({
      query: r.keys?.[0] || "",
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      position: r.position || 0,
    })),
  };
}

async function fetchGa4Summary(token: string, propertyId: string) {
  const prop = propertyId.replace(/^properties\//, "");
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${prop}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    return { ok: false, error: err.slice(0, 200) };
  }
  const data = await res.json();
  const row = data.rows?.[0]?.metricValues || [];
  return {
    ok: true,
    sessions: Number(row[0]?.value || 0),
    activeUsers: Number(row[1]?.value || 0),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAuth(req, { roles: ["super_admin"] });
    if ("error" in auth) return auth.error;
    const { ctx } = auth;

    const body = await req.json().catch(() => ({}));
    const action = body.action || "status";
    const customerId = body.customerId as string | undefined;

    const hasGoogleCreds = !!(
      Deno.env.get("GOOGLE_REFRESH_TOKEN") &&
      Deno.env.get("GOOGLE_CLIENT_ID") &&
      Deno.env.get("GOOGLE_CLIENT_SECRET")
    );
    const gscSite = Deno.env.get("GOOGLE_GSC_SITE") || "https://dalia-c.com/";
    const ga4Property = Deno.env.get("GOOGLE_GA4_PROPERTY") || "properties/427711798";
    const adsToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
    const adsCustomer = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID");

    const status = {
      google_search_console: { status: hasGoogleCreds ? "ready" : "missing_credentials", site: gscSite },
      google_analytics: { status: hasGoogleCreds ? "ready" : "missing_credentials", property: ga4Property },
      google_ads: {
        status: adsToken && adsCustomer ? "ready" : adsToken ? "pending_customer_id" : "pending_developer_token",
        note: adsToken
          ? "API v24 — אם 403: בקש Basic/Standard access ב-API Center"
          : "GOOGLE_ADS_DEVELOPER_TOKEN חסר",
      },
      google_business: { status: "pending_google_api_approval", note: "ממתין לאישור Google API (quota=0)" },
      google_tag_manager: {
        status: hasGoogleCreds ? "pending_oauth_scope" : "missing_credentials",
        note: "דורש scope tagmanager.readonly ב-OAuth + npm run project-001:gtm-probe",
      },
      gmail: { status: "pending_not_implemented", note: "אין סנכרון Gmail API בקוד" },
      google_workspace: { status: hasGoogleCreds ? "oauth_ready" : "missing_credentials", note: "OAuth בלבד — ללא sync" },
      google_sheets: { status: hasGoogleCreds ? "oauth_ready" : "missing_credentials", note: "CLI בלבד — project-001-sync" },
      google_drive: { status: hasGoogleCreds ? "oauth_ready" : "missing_credentials", note: "CLI בלבד" },
      google_docs: { status: hasGoogleCreds ? "oauth_ready" : "missing_credentials", note: "CLI probe בלבד" },
      openai: {
        status: Deno.env.get("MARKETING_OPENAI_API_KEY") || Deno.env.get("OPENAI_API_KEY") ? "connected" : "missing",
      },
      gemini: {
        status: Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY") ? "connected" : "missing",
      },
      claude: {
        status: Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("MARKETING_ANTHROPIC_API_KEY") ? "connected" : "missing",
        note: "Edge marketing-claude-chat",
      },
    };

    if (action === "status") {
      return jsonResponse({ ok: true, providers: status, customerId: customerId || null });
    }

    if (action !== "sync" || !customerId) {
      return jsonResponse({ ok: false, error: "sync_requires_customerId" }, 400);
    }

    if (!hasGoogleCreds) {
      return jsonResponse({ ok: false, error: "google_credentials_missing", providers: status }, 503);
    }

    const token = await googleAccessToken();
    if (!token) {
      return jsonResponse({ ok: false, error: "google_token_refresh_failed" }, 502);
    }

    const [gsc, ga4] = await Promise.all([
      fetchGscSummary(token, gscSite),
      fetchGa4Summary(token, ga4Property),
    ]);

    const supabase = ctx.supabaseAdmin;
    const now = new Date().toISOString();
    const periodEnd = now.slice(0, 10);
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - 28);

    if (gsc.ok) {
      await supabase.from("marketing_metrics").upsert({
        customer_id: customerId,
        provider: "google_search_console",
        metric_key: "summary_28d",
        metric_value: gsc,
        period_start: periodStart.toISOString().slice(0, 10),
        period_end: periodEnd,
        synced_at: now,
      }, { onConflict: "customer_id,provider,metric_key,period_start" });
      await supabase.from("marketing_connections").upsert({
        customer_id: customerId,
        provider: "google_search_console",
        status: "connected",
        config: { site: gscSite, synced_at: now },
        updated_at: now,
      }, { onConflict: "customer_id,provider" });
    }

    if (ga4.ok) {
      await supabase.from("marketing_metrics").upsert({
        customer_id: customerId,
        provider: "google_analytics",
        metric_key: "summary_28d",
        metric_value: ga4,
        period_start: periodStart.toISOString().slice(0, 10),
        period_end: periodEnd,
        synced_at: now,
      }, { onConflict: "customer_id,provider,metric_key,period_start" });
      await supabase.from("marketing_connections").upsert({
        customer_id: customerId,
        provider: "google_analytics",
        status: "connected",
        config: { property: ga4Property, synced_at: now },
        updated_at: now,
      }, { onConflict: "customer_id,provider" });
    }

    await supabase.from("marketing_activity_log").insert({
      customer_id: customerId,
      module: "sync",
      action: "google_sync",
      title: "סנכרון Google הושלם",
      detail: `GSC: ${gsc.ok ? "OK" : "שגיאה"} | GA4: ${ga4.ok ? "OK" : "שגיאה"}`,
      actor_id: ctx.user.id,
      meta: { gsc: gsc.ok, ga4: ga4.ok },
    });

    return jsonResponse({
      ok: true,
      synced_at: now,
      gsc,
      ga4,
      providers: status,
    });
  } catch (e) {
    console.error("marketing-google-sync:", e);
    return jsonResponse(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});
