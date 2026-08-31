/**
 * Claims mail dispatch — Dry Run only.
 * Staging. No Gmail API. No OAuth. Never sends real mail.
 */
import { edgeCorsHeaders, requireAuth, jsonResponse } from "../_shared/edgeAuth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: edgeCorsHeaders });
  const auth = await requireAuth(req, { roles: ["super_admin"] });
  if ("error" in auth) return auth.error;
  const sb = admin();

  const { data: modeRow } = await sb.from("claims_config").select("value").eq("key", "MAIL_DISPATCH_MODE").maybeSingle();
  const mode = modeRow?.value || "dry_run";
  if (mode !== "dry_run") {
    return jsonResponse({
      success: false,
      blocked: true,
      reason: "live_blocked_until_oauth",
      realEmailSend: false,
      gmailTouched: false,
    }, 409);
  }

  const { data, error } = await sb.rpc("claims_mail_dispatch_now");
  if (error) return jsonResponse({ success: false, error: error.message, realEmailSend: false }, 400);
  return jsonResponse({ ...(data as Record<string, unknown>), realEmailSend: false, gmailTouched: false });
});
