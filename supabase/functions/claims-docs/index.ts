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

async function sha256HexBytes(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
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

const DOC_KINDS = new Set([
  "general",
  "surveyor_report",
  "surveyor_photo",
  "surveyor_attachment",
  "garage_invoice",
]);

function kindFromUpload(docKey: string, mime: string, explicit: string) {
  if (explicit && DOC_KINDS.has(explicit)) return explicit;
  if (docKey === "surveyor_report") return mime.startsWith("image/") ? "surveyor_photo" : "surveyor_report";
  if (docKey === "garage_invoice") return "garage_invoice";
  return "general";
}

function cleanMeta(raw: unknown) {
  const src = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const out: Record<string, string> = {};
  for (const k of ["surveyorName", "reportDate", "reportNumber", "invoiceDate", "invoiceAmount", "garageName"]) {
    const v = src[k];
    if (v !== undefined && v !== null && String(v).trim()) out[k] = String(v).trim();
  }
  return out;
}

function sanitizeFileName(name: string) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const safeBase = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 60) || "file";
  return ext ? `${safeBase}.${ext}` : safeBase;
}

function resolveStoredMime(filename: string, declared: string, bytes?: Uint8Array) {
  const name = String(filename || "").toLowerCase();
  const d = String(declared || "").toLowerCase().split(";")[0].trim();
  if (d === "application/pdf" || /^image\/(jpeg|jpg|png|webp|heic|heif)$/.test(d)) {
    return d === "image/jpg" ? "image/jpeg" : d;
  }
  if (bytes && bytes.length >= 4) {
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return "image/webp";
  }
  if (name.endsWith(".pdf")) return "application/pdf";
  if (/\.jpe?g$/.test(name)) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (/\.heic$/.test(name)) return "image/heic";
  return d || "";
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
      const buf = new Uint8Array(await file.arrayBuffer());
      const storedMime = resolveStoredMime(file.name, file.type, buf);
      if (!ALLOWED.has(storedMime)) return jsonResponse({ success: false, error: "mime_not_allowed" }, 400);
      const resolved = await resolveLink(sb, token);
      if ("error" in resolved) return jsonResponse({ success: false, error: resolved.error }, 404);
      const claimId = resolved.data.claim_id;
      const { data: reqRow } = await sb.from("claims_doc_requests").select("id, claim_id, label, doc_key").eq("id", docRequestId).eq("claim_id", claimId).maybeSingle();
      if (!reqRow) return jsonResponse({ success: false, error: "doc_not_in_claim" }, 400);
      const path = `${claimId}/${docRequestId}/${nid("F")}-${sanitizeFileName(file.name)}`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: storedMime, upsert: false });
      if (upErr) return jsonResponse({ success: false, error: upErr.message }, 400);
      await sb.from("claims_documents").insert({
        id: nid("CDM"),
        claim_id: claimId,
        doc_request_id: docRequestId,
        storage_path: path,
        original_name: file.name,
        mime_type: storedMime,
        byte_size: file.size,
        source: "customer",
        uploaded_by_name: "לקוח",
        doc_kind: kindFromUpload(String(reqRow.doc_key || ""), storedMime, ""),
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
      const { data: files } = await sb.from("claims_documents").select("id, doc_request_id, original_name, mime_type, byte_size, source, uploaded_by_name, created_at, gmail_message_id, gmail_thread_id, doc_kind, doc_meta").eq("claim_id", claimId).order("created_at", { ascending: false });
      return jsonResponse({ success: true, requests: reqs || [], files: files || [] });
    }

    if (action === "set_doc_kind") {
      const claimId = String(body.claim_id || "");
      const fileId = String(body.file_id || "");
      const kind = String(body.doc_kind || "general");
      const meta = cleanMeta(body.doc_meta);
      if (!DOC_KINDS.has(kind)) return jsonResponse({ success: false, error: "invalid_kind" }, 400);
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      const { data: file } = await sb.from("claims_documents").select("id, gmail_message_id, mime_type, doc_meta").eq("id", fileId).eq("claim_id", claimId).maybeSingle();
      if (!file) return jsonResponse({ success: false, error: "not_found" }, 404);
      const merged = { ...((file.doc_meta && typeof file.doc_meta === "object") ? file.doc_meta as Record<string, string> : {}), ...meta };
      const { error: upErr } = await sb.from("claims_documents").update({ doc_kind: kind, doc_meta: merged }).eq("id", fileId).eq("claim_id", claimId);
      if (upErr) return jsonResponse({ success: false, error: upErr.message }, 400);
      if (kind === "surveyor_report" && file.gmail_message_id) {
        await sb.from("claims_documents")
          .update({ doc_kind: "surveyor_photo" })
          .eq("claim_id", claimId)
          .eq("gmail_message_id", file.gmail_message_id)
          .neq("id", fileId)
          .like("mime_type", "image/%")
          .eq("doc_kind", "general");
        await sb.from("claims_documents")
          .update({ doc_kind: "surveyor_attachment" })
          .eq("claim_id", claimId)
          .eq("gmail_message_id", file.gmail_message_id)
          .neq("id", fileId)
          .not("mime_type", "like", "image/%")
          .eq("doc_kind", "general");
      }
      await history(sb, claimId, "סווג מסמך", `${kind} · ${fileId}`, actorName);
      return jsonResponse({ success: true, copied: false });
    }

    if (action === "update_doc_meta") {
      const claimId = String(body.claim_id || "");
      const fileId = String(body.file_id || "");
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      const STAFF_TYPES = new Set(["", "vehicle_license", "driver_license", "no_claim_form", "accident_notice", "policy", "police", "surveyor_report", "garage_invoice", "damage_photos", "other"]);
      const STATUSES = new Set(["", "received", "missing", "pending", "ok", "sent", "needs_update"]);
      const { data: file } = await sb.from("claims_documents").select("id, original_name, doc_kind, doc_meta").eq("id", fileId).eq("claim_id", claimId).maybeSingle();
      if (!file) return jsonResponse({ success: false, error: "not_found" }, 404);
      const prev = (file.doc_meta && typeof file.doc_meta === "object") ? file.doc_meta as Record<string, string> : {};
      const next = { ...prev };
      if (body.staff_title !== undefined) next.staff_title = String(body.staff_title || "").trim().slice(0, 120);
      if (body.staff_type !== undefined) {
        const t = String(body.staff_type || "");
        if (!STAFF_TYPES.has(t)) return jsonResponse({ success: false, error: "invalid_staff_type" }, 400);
        next.staff_type = t;
      }
      if (body.staff_note !== undefined) next.staff_note = String(body.staff_note || "").trim().slice(0, 500);
      if (body.important !== undefined) next.important = body.important === true || body.important === "true" ? "true" : "";
      if (body.doc_status !== undefined) {
        const s = String(body.doc_status || "");
        if (!STATUSES.has(s)) return jsonResponse({ success: false, error: "invalid_doc_status" }, 400);
        next.doc_status = s;
      }
      if (body.related_file_id !== undefined) {
        const rel = String(body.related_file_id || "").trim();
        if (rel) {
          const { data: other } = await sb.from("claims_documents").select("id").eq("id", rel).eq("claim_id", claimId).maybeSingle();
          if (!other || other.id === fileId) return jsonResponse({ success: false, error: "invalid_related_file" }, 400);
          next.related_file_id = rel;
        } else {
          next.related_file_id = "";
        }
      }
      const { error: upErr } = await sb.from("claims_documents").update({ doc_meta: next }).eq("id", fileId).eq("claim_id", claimId);
      if (upErr) return jsonResponse({ success: false, error: upErr.message }, 400);
      await history(sb, claimId, "עודכנו פרטי מסמך", `${file.original_name} · סוג ${next.staff_type || "לא סווג"} · סטטוס ${next.doc_status || "—"} · חשוב ${next.important === "true" ? "כן" : "לא"}`, actorName);
      return jsonResponse({ success: true, copied: false, doc_kind: file.doc_kind, doc_meta: next });
    }

    if (action === "signed_url") {
      const claimId = String(body.claim_id || "");
      const fileId = String(body.file_id || "");
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      const { data: file } = await sb.from("claims_documents").select("storage_path, claim_id").eq("id", fileId).eq("claim_id", claimId).maybeSingle();
      if (!file) return jsonResponse({ success: false, error: "not_found" }, 404);
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(file.storage_path, 600);
      if (error) return jsonResponse({ success: false, error: error.message }, 400);
      return jsonResponse({ success: true, url: data.signedUrl });
    }

    if (action === "signed_urls") {
      const claimId = String(body.claim_id || "");
      const ids = Array.isArray(body.file_ids) ? body.file_ids.map((x) => String(x)).filter(Boolean).slice(0, 200) : [];
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      if (!ids.length) return jsonResponse({ success: true, urls: {} });
      const { data: files } = await sb.from("claims_documents").select("id, storage_path").eq("claim_id", claimId).in("id", ids);
      const rows = files || [];
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(rows.map((f) => f.storage_path), 600);
      if (error) return jsonResponse({ success: false, error: error.message }, 400);
      const urls: Record<string, string> = {};
      rows.forEach((f, i) => {
        const signed = (data || [])[i]?.signedUrl || "";
        if (signed) urls[f.id] = signed;
      });
      return jsonResponse({ success: true, urls });
    }

    if (action === "staff_upload") {
      const claimId = String(form?.get("claim_id") || "");
      const docRequestId = String(form?.get("doc_request_id") || "") || null;
      const explicitKind = String(form?.get("doc_kind") || "");
      const file = form?.get("file");
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      if (!(file instanceof File)) return jsonResponse({ success: false, error: "file_required" }, 400);
      if (file.size > MAX_BYTES) return jsonResponse({ success: false, error: "file_too_large" }, 400);
      const buf = new Uint8Array(await file.arrayBuffer());
      const storedMime = resolveStoredMime(file.name, file.type, buf);
      if (!ALLOWED.has(storedMime)) return jsonResponse({ success: false, error: "mime_not_allowed" }, 400);
      const digest = await sha256HexBytes(buf);
      const { data: existing } = await sb.from("claims_documents").select("id, source").eq("claim_id", claimId).eq("content_sha256", digest).maybeSingle();
      if (existing?.id) {
        return jsonResponse({ success: true, file_id: existing.id, reused: true, source: existing.source, copied: false });
      }
      let reqKey = "";
      if (docRequestId) {
        const { data: reqRow } = await sb.from("claims_doc_requests").select("doc_key").eq("id", docRequestId).eq("claim_id", claimId).maybeSingle();
        reqKey = String(reqRow?.doc_key || "");
      }
      const fileId = nid("CDM");
      const path = `${claimId}/staff/${nid("F")}-${sanitizeFileName(file.name)}`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: storedMime, upsert: false });
      if (upErr) return jsonResponse({ success: false, error: upErr.message }, 400);
      const { error: insErr } = await sb.from("claims_documents").insert({
        id: fileId,
        claim_id: claimId,
        doc_request_id: docRequestId,
        storage_path: path,
        original_name: file.name,
        mime_type: storedMime,
        byte_size: file.size,
        source: "staff",
        uploaded_by: user.id,
        uploaded_by_name: actorName,
        doc_kind: kindFromUpload(reqKey, storedMime, explicitKind),
        content_sha256: digest,
      });
      if (insErr) return jsonResponse({ success: false, error: insErr.message }, 400);
      if (docRequestId) {
        await sb.from("claims_doc_requests").update({ status: "received", received_at: new Date().toISOString() }).eq("id", docRequestId).eq("claim_id", claimId);
      }
      await history(sb, claimId, "מסמך הועלה ע״י העובד", file.name, actorName);
      return jsonResponse({ success: true, file_id: fileId, reused: false, source: "staff" });
    }

    return jsonResponse({ success: false, error: "unknown_action" }, 400);
  } catch (e) {
    return jsonResponse({ success: false, error: String((e as Error).message || e) }, 500);
  }
});
