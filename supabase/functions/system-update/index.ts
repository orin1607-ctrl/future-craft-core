// Bridge between the Super Admin UI and the VPS ops webhook.
//
// Actions:
//   - "pending"  — what would change if you deployed now (commits + pending migrations)
//   - "deploy"   — pull latest production branch, install, build, atomic-swap dist
//   - "migrate"  — apply pending Supabase migrations
//
// Auth: caller must be authenticated AND have role 'super_admin'.
// Audit: every deploy/migrate call writes a row to system_update_audit.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface WebhookResult {
  status: "success" | "failed";
  sha_before?: string;
  sha_after?: string;
  migrations_applied?: string[];
  log_excerpt?: string;
  error?: string;
  duration_ms?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const OPS_WEBHOOK_URL = Deno.env.get("OPS_WEBHOOK_URL");
  const OPS_WEBHOOK_SECRET = Deno.env.get("OPS_WEBHOOK_SECRET");
  if (!OPS_WEBHOOK_URL || !OPS_WEBHOOK_SECRET) {
    return json({ error: "ops_webhook_not_configured" }, 500);
  }

  // ---- AuthN: get the caller's JWT and resolve user
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Resolve the user from the JWT (uses anon key + the caller's bearer token)
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: "unauthorized" }, 401);
  }
  const user = userData.user;

  // ---- AuthZ: verify role via service role (RLS-bypassing)
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: roleRow } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin")
    .maybeSingle();

  if (!roleRow) {
    return json({ error: "forbidden", reason: "super_admin role required" }, 403);
  }

  // ---- Parse body
  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const action = body.action;
  if (action !== "pending" && action !== "deploy" && action !== "migrate") {
    return json({ error: "invalid_action", allowed: ["pending", "deploy", "migrate"] }, 400);
  }

  // ---- Read-only: pending check (no audit row needed)
  if (action === "pending") {
    try {
      const r = await fetch(`${OPS_WEBHOOK_URL}/pending`, {
        method: "GET",
        headers: { Authorization: `Bearer ${OPS_WEBHOOK_SECRET}` },
      });
      const text = await r.text();
      if (!r.ok) return json({ error: "webhook_failed", status: r.status, body: text }, 502);
      try {
        return json(JSON.parse(text));
      } catch {
        return json({ error: "webhook_bad_response", body: text }, 502);
      }
    } catch (e) {
      return json({ error: "webhook_unreachable", message: String(e) }, 502);
    }
  }

  // ---- Mutating: deploy / migrate (with audit log)
  const startedAt = new Date().toISOString();
  const auditInsert = await adminClient
    .from("system_update_audit")
    .insert({
      action,
      triggered_by: user.id,
      triggered_by_email: user.email,
      status: "started",
      started_at: startedAt,
    })
    .select("id")
    .single();

  if (auditInsert.error) {
    console.error("audit insert failed:", auditInsert.error);
  }
  const auditId = auditInsert.data?.id;
  const auditError = auditInsert.error?.message;

  let result: WebhookResult;
  try {
    const r = await fetch(`${OPS_WEBHOOK_URL}/${action}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPS_WEBHOOK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const text = await r.text();
    try {
      result = JSON.parse(text) as WebhookResult;
    } catch {
      result = { status: "failed", error: `non-json response: ${text.slice(0, 500)}` };
    }
    if (!r.ok && !result.error) {
      result.status = "failed";
      result.error = `webhook returned ${r.status}`;
    }
  } catch (e) {
    result = { status: "failed", error: `webhook unreachable: ${String(e)}` };
  }

  if (auditId) {
    await adminClient
      .from("system_update_audit")
      .update({
        status: result.status,
        sha_before: result.sha_before ?? null,
        sha_after: result.sha_after ?? null,
        migrations_applied: result.migrations_applied ?? null,
        log_excerpt: result.log_excerpt ?? null,
        error: result.error ?? null,
        duration_ms: result.duration_ms ?? null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", auditId);
  }

  return json({ ...result, audit_id: auditId, audit_error: auditError });
});
