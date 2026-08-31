/**
 * Isolated claims documents + customer upload links.
 * Staging only. Does not touch document-request / WhatsApp / Gmail.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { edgeCorsHeaders, requireAuth, jsonResponse } from "../_shared/edgeAuth.ts";

const BUCKET = "claims-docs";
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"]);
const MAX_BYTES = 15 * 1024 * 1024;

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return bytesToHex(new Uint8Array(hash));
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function nid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function sanitizeFileName(name: string) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const safeBase = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 60) || "file";
  return ext ? `${safeBase}.${ext}` : safeBase;
}

async function hasClaimsAccess(sb: ReturnType<typeof admin>, uid: string, role: string) {
  if (role === "super_admin") return true;
  const { data } = await sb.from("claims_access").select("user_id").eq("user_id", uid).maybeSingle();
  return !!data;
}

async function canWork(sb: ReturnType<typeof admin>, uid: string, role: string, claimId: string) {
  if (!(await hasClaimsAccess(sb, uid, role))) return false;
  if (role === "super_admin") return true;
  const { data } = await sb.from("claims_records").select("id, assigned_to, created_by").eq("id", claimId).maybeSingle();
  return !!data && (data.assigned_to === uid || data.created_by === uid);
}

async function history(sb: ReturnType<typeof admin>, claimId: string, action: string, note: string, by: string) {
  await sb.from("claims_history").insert({
    id: nid("HIS"),
    claim_id: claimId,
    row_data: { action, note, type: "docs", by, at: new Date().toLocaleString("he-IL") },
  });
}

async function notify(sb: ReturnType<typeof admin>, claimId: string, message: string) {
  await sb.from("claims_notifications").insert({
    id: nid("NTF"),
    claim_id: claimId,
    row_data: { claimId, type: "docs", message, read: "false", createdAt: new Date().toLocaleString("he-IL") },
  });
}

async function resolveLink(sb: ReturnType<typeof admin>, token: string) {
  if (!token || token.length < 32) return { error: "invalid_token" as const };
  const tokenHash = await sha256Hex(token);
  const { data } = await sb.from("claims_upload_links").select("id, claim_id, expires_at, revoked_at").eq("token_hash", tokenHash).maybeSingle();
  if (!data) return { error: "not_found" as const };
  if (data.revoked_at) return { error: "revoked" as const };
  if (new Date(data.expires_at).getTime() < Date.now()) return { error: "expired" as const };
  return { data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: edgeCorsHeaders });
  const sb = admin();
  const url = new URL(req.url);
  let action = url.searchParams.get("action") || "";
  let body: Record<string, unknown> = {};
  const contentType = req.headers.get("content-type") || "";
  let form: FormData | null = null;

  if (contentType.includes("multipart/form-data")) {
    form = await req.formData();
    action = String(form.get("action") || action || "public_upload");
  } else if (req.method !== "GET") {
    try { body = await req.json(); } catch { body = {}; }
    action = String(body.action || action || "");
  } else {
    action = action || "public_get";
  }

  try {
    if (action === "public_get") {
      const token = String(url.searchParams.get("token") || body.token || "");
      const resolved = await resolveLink(sb, token);
      if ("error" in resolved) return jsonResponse({ success: false, error: resolved.error }, 404);
      const claimId = resolved.data.claim_id;
      const { data: claim } = await sb.from("claims_records").select("client_name, plate").eq("id", claimId).maybeSingle();
      const { data: docs } = await sb.from("claims_doc_requests").select("id, label, status, received_at").eq("claim_id", claimId).order("created_at");
      return jsonResponse({
        success: true,
        clientName: claim?.client_name || "לקוח",
        plate: claim?.plate || "",
        expiresAt: resolved.data.expires_at,
        docs: (docs || []).map((d) => ({ id: d.id, label: d.label, status: d.status, receivedAt: d.received_at })),
      });
    }

    if (action === "public_upload") {
      const token = String(form?.get("token") || body.token || "");
      const docRequestId = String(form?.get("doc_request_id") || body.doc_request_id || "");
      const file = form?.get("file");
      if (!(file instanceof File)) return jsonResponse({ success: false, error: "file_required" }, 400);
      if (file.size > MAX_BYTES) return jsonResponse({ success: false, error: "file_too_large" }, 400);
      if (file.type && !ALLOWED.has(file.type)) return jsonResponse({ success: false, error: "mime_not_allowed" }, 400);
      const resolved = await resolveLink(sb, token);
      if ("error" in resolved) return jsonResponse({ success: false, error: resolved.error }, 404);
      const claimId = resolved.data.claim_id;
      const { data: reqRow } = await sb.from("claims_doc_requests").select("id, claim_id, label").eq("id", docRequestId).eq("claim_id", claimId).maybeSingle();
      if (!reqRow) return jsonResponse({ success: false, error: "doc_not_in_claim" }, 400);
      const path = `${claimId}/${docRequestId}/${nid("F")}-${sanitizeFileName(file.name)}`;
      const buf = new Uint8Array(await file.arrayBuffer());
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upErr) return jsonResponse({ success: false, error: upErr.message }, 400);
      await sb.from("claims_documents").insert({
        id: nid("CDM"),
        claim_id: claimId,
        doc_request_id: docRequestId,
        storage_path: path,
        original_name: file.name,
        mime_type: file.type || "",
        byte_size: file.size,
        source: "customer",
        uploaded_by_name: "לקוח",
      });
      await sb.from("claims_doc_requests").update({ status: "received", received_at: new Date().toISOString() }).eq("id", docRequestId);
      await history(sb, claimId, "מסמך התקבל מהלקוח", reqRow.label, "לקוח");
      await notify(sb, claimId, `התקבל מסמך: ${reqRow.label}`);
      const { data: left } = await sb.from("claims_doc_requests").select("id").eq("claim_id", claimId).neq("status", "received");
      if ((left || []).length > 0) {
        await sb.from("claims_records").update({ status: "ממתין למסמכים", last_activity_at: new Date().toISOString() }).eq("id", claimId).eq("status", "חדש");
      }
      return jsonResponse({ success: true });
    }

    const auth = await requireAuth(req);
    if ("error" in auth) return auth.error;
    const { user, role } = auth.ctx;
    if (!(await hasClaimsAccess(sb, user.id, role))) return jsonResponse({ success: false, error: "forbidden" }, 403);
    const profile = await sb.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const actorName = profile.data?.full_name || user.email || user.id;

    if (action === "create_link") {
      const claimId = String(body.claim_id || "");
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      await sb.from("claims_upload_links").update({ revoked_at: new Date().toISOString() }).eq("claim_id", claimId).is("revoked_at", null);
      const token = randomToken();
      const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      await sb.from("claims_upload_links").insert({
        id: nid("LNK"),
        claim_id: claimId,
        token_hash: await sha256Hex(token),
        expires_at: expires,
        created_by: user.id,
      });
      await history(sb, claimId, "נוצר קישור להעלאת מסמכים", "", actorName);
      return jsonResponse({ success: true, token, expiresAt: expires });
    }

    if (action === "revoke_link") {
      const claimId = String(body.claim_id || "");
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      await sb.from("claims_upload_links").update({ revoked_at: new Date().toISOString() }).eq("claim_id", claimId).is("revoked_at", null);
      await history(sb, claimId, "קישור העלאה בוטל", "", actorName);
      return jsonResponse({ success: true });
    }

    if (action === "get_link") {
      const claimId = String(body.claim_id || url.searchParams.get("claim_id") || "");
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      const { data } = await sb.from("claims_upload_links").select("id, expires_at, revoked_at, created_at").eq("claim_id", claimId).is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return jsonResponse({ success: true, link: data });
    }

    if (action === "save_doc_requests") {
      const claimId = String(body.claim_id || "");
      const items = Array.isArray(body.items) ? body.items as Array<{ label?: string; doc_key?: string }> : [];
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      const { data: existing } = await sb.from("claims_doc_requests").select("id, label, status").eq("claim_id", claimId);
      const keep = new Set((existing || []).filter((e) => e.status === "received").map((e) => e.label));
      const labels = items.map((i) => String(i.label || "").trim()).filter(Boolean);
      for (const row of existing || []) {
        if (row.status !== "received" && !labels.includes(row.label)) {
          await sb.from("claims_doc_requests").delete().eq("id", row.id);
        }
      }
      for (const item of items) {
        const label = String(item.label || "").trim();
        if (!label || keep.has(label) || (existing || []).some((e) => e.label === label)) continue;
        await sb.from("claims_doc_requests").insert({
          id: nid("DCR"),
          claim_id: claimId,
          label,
          doc_key: String(item.doc_key || "custom"),
          status: "requested",
          created_by: user.id,
        });
      }
      const { data: open } = await sb.from("claims_doc_requests").select("id").eq("claim_id", claimId).eq("status", "requested");
      if ((open || []).length > 0) {
        await sb.from("claims_records").update({ status: "ממתין למסמכים", last_activity_at: new Date().toISOString() }).eq("id", claimId);
      }
      await history(sb, claimId, "עודכנה רשימת מסמכים מבוקשים", labels.join(", "), actorName);
      return jsonResponse({ success: true });
    }

    if (action === "list_docs") {
      const claimId = String(body.claim_id || url.searchParams.get("claim_id") || "");
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      const { data: reqs } = await sb.from("claims_doc_requests").select("id, label, doc_key, status, received_at, created_at").eq("claim_id", claimId).order("created_at");
      const { data: files } = await sb.from("claims_documents").select("id, doc_request_id, original_name, mime_type, byte_size, source, uploaded_by_name, created_at").eq("claim_id", claimId).order("created_at", { ascending: false });
      return jsonResponse({ success: true, requests: reqs || [], files: files || [] });
    }

    if (action === "signed_url") {
      const claimId = String(body.claim_id || "");
      const fileId = String(body.file_id || "");
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      const { data: file } = await sb.from("claims_documents").select("storage_path, claim_id").eq("id", fileId).eq("claim_id", claimId).maybeSingle();
      if (!file) return jsonResponse({ success: false, error: "not_found" }, 404);
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(file.storage_path, 120);
      if (error) return jsonResponse({ success: false, error: error.message }, 400);
      return jsonResponse({ success: true, url: data.signedUrl });
    }

    if (action === "staff_upload") {
      const claimId = String(form?.get("claim_id") || "");
      const docRequestId = String(form?.get("doc_request_id") || "") || null;
      const file = form?.get("file");
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      if (!(file instanceof File)) return jsonResponse({ success: false, error: "file_required" }, 400);
      if (file.size > MAX_BYTES) return jsonResponse({ success: false, error: "file_too_large" }, 400);
      if (file.type && !ALLOWED.has(file.type)) return jsonResponse({ success: false, error: "mime_not_allowed" }, 400);
      const path = `${claimId}/staff/${nid("F")}-${sanitizeFileName(file.name)}`;
      const buf = new Uint8Array(await file.arrayBuffer());
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upErr) return jsonResponse({ success: false, error: upErr.message }, 400);
      await sb.from("claims_documents").insert({
        id: nid("CDM"),
        claim_id: claimId,
        doc_request_id: docRequestId,
        storage_path: path,
        original_name: file.name,
        mime_type: file.type || "",
        byte_size: file.size,
        source: "staff",
        uploaded_by: user.id,
        uploaded_by_name: actorName,
      });
      if (docRequestId) {
        await sb.from("claims_doc_requests").update({ status: "received", received_at: new Date().toISOString() }).eq("id", docRequestId).eq("claim_id", claimId);
      }
      await history(sb, claimId, "מסמך הועלה ע״י העובד", file.name, actorName);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ success: false, error: "unknown_action" }, 400);
  } catch (e) {
    return jsonResponse({ success: false, error: String((e as Error).message || e) }, 500);
  }
});
