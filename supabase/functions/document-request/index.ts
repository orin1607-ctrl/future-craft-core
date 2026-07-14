/**
 * Document Request Hub — Stage A
 * Staging only (usfeoerkpcafxxlyuldl). Refuses Production.
 *
 * Actions:
 *  - create (auth) — create request + token + link
 *  - open (public token) — mark opened
 *  - get (public token) — fetch request summary for upload page
 *  - upload (public token + multipart) — store file + version + history
 *  - list_for_entity (auth) — history for driver/vehicle card
 *  - list_types (auth) — catalog
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { edgeCorsHeaders, requireAuth, jsonResponse } from "../_shared/edgeAuth.ts";

const STAGING_REF_EXPECTED = "usfeoerkpcafxxlyuldl";
const PROD_REF_FORBIDDEN = "qasomfndnjuixgjmjwcm";

function assertStagingOnly(): string | null {
  const url = Deno.env.get("SUPABASE_URL") || "";
  if (url.includes(PROD_REF_FORBIDDEN)) {
    return "REFUSED: Production Supabase project — document-request is Staging-only";
  }
  if (
    url &&
    !url.includes(STAGING_REF_EXPECTED) &&
    !url.includes("127.0.0.1") &&
    !url.includes("localhost")
  ) {
    return `REFUSED: unexpected SUPABASE_URL host (${url})`;
  }
  return null;
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(hash));
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function sanitizeFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const safeBase = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 60) || "file";
  return ext ? `${safeBase}.${ext}` : safeBase;
}

async function insertEvent(
  supabase: ReturnType<typeof admin>,
  requestId: string,
  eventType: string,
  actorId: string | null,
  actorName: string,
  payload: Record<string, unknown> = {},
) {
  await supabase.from("document_request_events").insert({
    request_id: requestId,
    event_type: eventType,
    actor_id: actorId,
    actor_name: actorName,
    payload,
  });
}

async function resolveRequestByToken(supabase: ReturnType<typeof admin>, token: string) {
  if (!token || token.length < 32) return { error: "invalid_token" as const };
  const tokenHash = await sha256Hex(token);
  const { data, error } = await supabase
    .from("document_requests")
    .select("*, document_type_defs!inner(*)")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error || !data) return { error: "not_found" as const };
  if (new Date(data.token_expires_at).getTime() < Date.now()) {
    if (data.status !== "expired" && data.status !== "uploaded" && data.status !== "pending_approval" && data.status !== "approved") {
      await supabase.from("document_requests").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", data.id);
      await insertEvent(supabase, data.id, "expired", null, "system", {});
    }
    return { error: "expired" as const, data };
  }
  return { data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: edgeCorsHeaders });
  }

  const stagingErr = assertStagingOnly();
  if (stagingErr) return jsonResponse({ success: false, error: stagingErr }, 403);

  const supabase = admin();
  const url = new URL(req.url);
  let action = url.searchParams.get("action") || "";
  let body: Record<string, unknown> = {};

  const contentType = req.headers.get("content-type") || "";
  let form: FormData | null = null;

  if (contentType.includes("multipart/form-data")) {
    form = await req.formData();
    action = String(form.get("action") || action || "upload");
  } else if (req.method !== "GET") {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    action = String(body.action || action || "");
  } else {
    action = action || "get";
  }

  try {
    // ── Public: get / open ──────────────────────────────────────────
    if (action === "get" || action === "open") {
      const token = String(
        url.searchParams.get("token") || body.token || form?.get("token") || "",
      );
      const resolved = await resolveRequestByToken(supabase, token);
      if ("error" in resolved && resolved.error !== "expired") {
        return jsonResponse({ success: false, error: resolved.error }, 404);
      }
      if (resolved.error === "expired") {
        return jsonResponse({ success: false, error: "expired" }, 410);
      }
      const row = resolved.data!;
      const typeDef = (row as { document_type_defs: Record<string, unknown> }).document_type_defs;

      if (action === "open" && !row.opened_at && row.status !== "uploaded" && row.status !== "pending_approval" && row.status !== "approved") {
        const now = new Date().toISOString();
        await supabase
          .from("document_requests")
          .update({ opened_at: now, status: "opened", updated_at: now })
          .eq("id", row.id);
        await insertEvent(supabase, row.id, "opened", null, "recipient", {});
        row.opened_at = now;
        row.status = "opened";
      }

      return jsonResponse({
        success: true,
        request: {
          id: row.id,
          status: row.status,
          document_type_key: row.document_type_key,
          document_type_label: typeDef?.label_he,
          entity_type: row.entity_type,
          entity_label: row.entity_label,
          recipient_name: row.recipient_name,
          requires_expiry: typeDef?.requires_expiry,
          allowed_mime_types: typeDef?.allowed_mime_types,
          max_file_bytes: typeDef?.max_file_bytes,
          allow_multiple: typeDef?.allow_multiple,
          token_expires_at: row.token_expires_at,
          opened_at: row.opened_at,
          uploaded_at: row.uploaded_at,
        },
      });
    }

    // ── Public: upload ──────────────────────────────────────────────
    if (action === "upload") {
      if (!form) return jsonResponse({ success: false, error: "multipart_required" }, 400);
      const token = String(form.get("token") || "");
      const expiryDate = String(form.get("expiry_date") || "") || null;
      const file = form.get("file");
      if (!(file instanceof File)) {
        return jsonResponse({ success: false, error: "file_required" }, 400);
      }

      const resolved = await resolveRequestByToken(supabase, token);
      if (resolved.error === "expired") return jsonResponse({ success: false, error: "expired" }, 410);
      if (resolved.error || !resolved.data) {
        return jsonResponse({ success: false, error: resolved.error || "not_found" }, 404);
      }
      const row = resolved.data;
      const typeDef = (row as { document_type_defs: Record<string, unknown> }).document_type_defs as {
        allowed_mime_types?: string[];
        max_file_bytes?: number;
        allow_multiple?: boolean;
        storage_folder?: string;
        category?: string;
        requires_manager_approval?: boolean;
        requires_expiry?: boolean;
        label_he?: string;
      };

      if (["approved", "cancelled", "expired"].includes(row.status) && !typeDef.allow_multiple) {
        return jsonResponse({ success: false, error: "request_closed" }, 409);
      }
      if (row.status === "uploaded" || row.status === "pending_approval") {
        if (!typeDef.allow_multiple) {
          return jsonResponse({ success: false, error: "already_uploaded" }, 409);
        }
      }

      const allowed = typeDef.allowed_mime_types || ["image/jpeg", "image/png", "application/pdf"];
      const maxBytes = Number(typeDef.max_file_bytes || 10 * 1024 * 1024);
      if (file.size > maxBytes) {
        return jsonResponse({ success: false, error: "file_too_large", max_file_bytes: maxBytes }, 400);
      }
      const mime = file.type || "application/octet-stream";
      if (allowed.length && !allowed.includes(mime) && !allowed.includes("*")) {
        // allow empty browser mime for some mobile cameras — check by extension later
        const lower = file.name.toLowerCase();
        const okExt =
          (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp") || lower.endsWith(".pdf"));
        if (!okExt) {
          return jsonResponse({ success: false, error: "mime_not_allowed", allowed }, 400);
        }
      }
      if (typeDef.requires_expiry && !expiryDate) {
        return jsonResponse({ success: false, error: "expiry_required" }, 400);
      }

      const folder = String(typeDef.storage_folder || "document-requests");
      const safeName = sanitizeFileName(file.name || "upload.bin");
      const filePath = `request-uploads/${row.id}/${Date.now()}_${safeName}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error: upErr } = await supabase.storage.from("documents").upload(filePath, bytes, {
        contentType: mime,
        upsert: false,
      });
      if (upErr) {
        return jsonResponse({ success: false, error: "storage_failed", details: upErr.message }, 500);
      }
      const { data: pub } = supabase.storage.from("documents").getPublicUrl(filePath);
      const publicUrl = pub?.publicUrl || "";

      // version number
      const { data: lastVer } = await supabase
        .from("document_versions")
        .select("version_no")
        .eq("entity_type", row.entity_type)
        .eq("entity_id", row.entity_id)
        .eq("document_type_key", row.document_type_key)
        .order("version_no", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVer = (lastVer?.version_no || 0) + 1;

      // mark previous versions non-current
      await supabase
        .from("document_versions")
        .update({ is_current: false })
        .eq("entity_type", row.entity_type)
        .eq("entity_id", row.entity_id)
        .eq("document_type_key", row.document_type_key)
        .eq("is_current", true);

      const { data: version, error: verErr } = await supabase
        .from("document_versions")
        .insert({
          company_name: row.company_name,
          document_type_key: row.document_type_key,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          request_id: row.id,
          version_no: nextVer,
          is_current: true,
          file_path: filePath,
          public_url: publicUrl,
          original_name: file.name || safeName,
          content_type: mime,
          file_size_bytes: file.size,
          source: "request_link",
          expiry_date: expiryDate,
        })
        .select("*")
        .single();
      if (verErr || !version) {
        return jsonResponse({ success: false, error: "version_insert_failed", details: verErr?.message }, 500);
      }

      // document_metadata for Documents screen (map to UI category keys)
      const categoryMap: Record<string, string> = {
        driver_license: "driver-license",
        vehicle_license: "vehicle-license",
        mandatory_insurance: "insurance",
        comprehensive_insurance: "comprehensive",
        health_declaration: "health",
        medical_certificate: "health",
        invoice: "vendors",
        receipt: "receipts",
        vehicle_photo: "other",
        general_document: "other",
      };
      const metaCategory = categoryMap[row.document_type_key] || row.document_type_key;
      const vehiclePlate = row.entity_type === "vehicle" ? row.entity_label : "";
      const driverName = row.entity_type === "driver" ? row.entity_label : row.recipient_name;
      const { data: meta } = await supabase
        .from("document_metadata")
        .insert({
          file_path: filePath,
          category: metaCategory,
          company_name: row.company_name,
          vehicle_plate: vehiclePlate,
          driver_name: driverName,
          original_name: file.name || safeName,
        })
        .select("id")
        .maybeSingle();

      if (meta?.id) {
        await supabase.from("document_versions").update({ metadata_id: meta.id }).eq("id", version.id);
      }

      // sync convenience URL fields on driver/vehicle when relevant
      if (row.entity_type === "driver" && row.document_type_key === "driver_license") {
        await supabase.from("drivers").update({ license_image_url: publicUrl }).eq("id", row.entity_id);
      }
      if (row.entity_type === "vehicle") {
        if (row.document_type_key === "vehicle_license") {
          await supabase.from("vehicles").update({ license_doc_url: publicUrl }).eq("id", row.entity_id);
        }
        if (row.document_type_key === "mandatory_insurance") {
          await supabase.from("vehicles").update({ insurance_doc_url: publicUrl }).eq("id", row.entity_id);
        }
        if (row.document_type_key === "comprehensive_insurance") {
          await supabase.from("vehicles").update({ comprehensive_insurance_doc_url: publicUrl }).eq("id", row.entity_id);
        }
      }

      const needsApproval = typeDef.requires_manager_approval !== false;
      const nextStatus = needsApproval ? "pending_approval" : "uploaded";
      const now = new Date().toISOString();
      await supabase
        .from("document_requests")
        .update({
          status: nextStatus,
          uploaded_at: now,
          opened_at: row.opened_at || now,
          current_version_id: version.id,
          upload_count: (row.upload_count || 0) + 1,
          updated_at: now,
        })
        .eq("id", row.id);

      await insertEvent(supabase, row.id, "uploaded", null, row.recipient_name || "recipient", {
        version_id: version.id,
        file_path: filePath,
        version_no: nextVer,
      });
      if (needsApproval) {
        await insertEvent(supabase, row.id, "pending_approval", null, "system", {});
      }

      return jsonResponse({
        success: true,
        status: nextStatus,
        version,
        public_url: publicUrl,
      });
    }

    // ── Auth required below ─────────────────────────────────────────
    const auth = await requireAuth(req, {
      roles: ["super_admin", "fleet_manager"],
    });
    if ("error" in auth) return auth.error;
    const { ctx } = auth;

    if (action === "list_types") {
      const entityType = String(body.entity_type || url.searchParams.get("entity_type") || "");
      let q = supabase
        .from("document_type_defs")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      const { data, error } = await q;
      if (error) return jsonResponse({ success: false, error: error.message }, 500);
      const filtered = entityType
        ? (data || []).filter((t) => (t.entity_scopes || []).includes(entityType))
        : data || [];
      return jsonResponse({ success: true, types: filtered });
    }

    if (action === "list_for_entity") {
      const entityType = String(body.entity_type || "");
      const entityId = String(body.entity_id || "");
      if (!entityType || !entityId) {
        return jsonResponse({ success: false, error: "entity_required" }, 400);
      }
      let reqQuery = supabase
        .from("document_requests")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (ctx.role !== "super_admin" && ctx.companyName) {
        reqQuery = reqQuery.eq("company_name", ctx.companyName);
      }
      const { data: requests, error } = await reqQuery;
      if (error) return jsonResponse({ success: false, error: error.message }, 500);

      const { data: versions } = await supabase
        .from("document_versions")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(200);

      return jsonResponse({ success: true, requests: requests || [], versions: versions || [] });
    }

    if (action === "create") {
      const documentTypeKey = String(body.document_type_key || "");
      const entityType = String(body.entity_type || "");
      const entityId = String(body.entity_id || "");
      const entityLabel = String(body.entity_label || "");
      const recipientName = String(body.recipient_name || "");
      const recipientPhone = String(body.recipient_phone || "");
      const recipientEmail = String(body.recipient_email || "");
      const channel = String(body.channel || "link");
      const notes = String(body.notes || "");
      const publicAppOrigin = String(body.public_app_origin || "").replace(/\/$/, "");
      const expiresHours = Math.min(Math.max(Number(body.expires_hours || 72), 1), 24 * 30);

      if (!documentTypeKey || !entityType || !entityId) {
        return jsonResponse({ success: false, error: "missing_fields" }, 400);
      }
      if (publicAppOrigin.includes("dalia-car.online")) {
        return jsonResponse({
          success: false,
          error: "REFUSED: public_app_origin points to Production",
        }, 403);
      }

      const { data: typeDef, error: typeErr } = await supabase
        .from("document_type_defs")
        .select("*")
        .eq("key", documentTypeKey)
        .eq("is_active", true)
        .maybeSingle();
      if (typeErr || !typeDef) {
        return jsonResponse({ success: false, error: "unknown_document_type" }, 400);
      }
      if (!(typeDef.entity_scopes || []).includes(entityType)) {
        return jsonResponse({
          success: false,
          error: "document_type_not_allowed_for_entity",
          entity_scopes: typeDef.entity_scopes,
        }, 400);
      }

      // company from entity when possible
      let companyName = ctx.companyName || "";
      if (entityType === "driver") {
        const { data: d } = await supabase.from("drivers").select("company_name, full_name, phone, email").eq("id", entityId).maybeSingle();
        if (d?.company_name) companyName = d.company_name;
      } else if (entityType === "vehicle") {
        const { data: v } = await supabase.from("vehicles").select("company_name, license_plate").eq("id", entityId).maybeSingle();
        if (v?.company_name) companyName = v.company_name;
      }
      if (ctx.role !== "super_admin" && ctx.companyName && companyName && companyName !== ctx.companyName) {
        return jsonResponse({ success: false, error: "company_mismatch" }, 403);
      }

      const token = randomToken();
      const tokenHash = await sha256Hex(token);
      const expiresAt = new Date(Date.now() + expiresHours * 3600 * 1000).toISOString();
      const requestedByName = ctx.user.email || ctx.user.id;

      const { data: request, error: insErr } = await supabase
        .from("document_requests")
        .insert({
          company_name: companyName || ctx.companyName || "",
          document_type_key: documentTypeKey,
          entity_type: entityType,
          entity_id: entityId,
          entity_label: entityLabel,
          recipient_name: recipientName,
          recipient_phone: recipientPhone,
          recipient_email: recipientEmail,
          requested_by: ctx.user.id,
          requested_by_name: requestedByName,
          channel,
          token_hash: tokenHash,
          token_expires_at: expiresAt,
          status: "created",
          notes,
        })
        .select("*")
        .single();
      if (insErr || !request) {
        return jsonResponse({ success: false, error: "insert_failed", details: insErr?.message }, 500);
      }

      await insertEvent(supabase, request.id, "created", ctx.user.id, requestedByName, {
        document_type_key: documentTypeKey,
        entity_type: entityType,
        entity_id: entityId,
        channel,
      });

      const origin =
        publicAppOrigin ||
        Deno.env.get("STAGING_PUBLIC_APP_ORIGIN") ||
        "https://orin1607-ctrl.github.io/future-craft-core";
      const uploadUrl = `${origin}/upload-request?t=${token}`;

      // Stage A: mark as sent when link is generated (WhatsApp wire-up = Stage B)
      const now = new Date().toISOString();
      await supabase
        .from("document_requests")
        .update({ status: "sent", sent_at: now, updated_at: now })
        .eq("id", request.id);
      await insertEvent(supabase, request.id, "sent", ctx.user.id, requestedByName, {
        channel,
        upload_url_host: new URL(uploadUrl).host,
      });

      const messagePreview = String(typeDef.message_template_he || "")
        .replaceAll("{{recipient_name}}", recipientName || entityLabel || "שלום")
        .replaceAll("{{upload_url}}", uploadUrl)
        .replaceAll("{{document_type}}", typeDef.label_he || documentTypeKey);

      return jsonResponse({
        success: true,
        request_id: request.id,
        status: "sent",
        token, // one-time return to creator for copy/share — hash only in DB
        upload_url: uploadUrl,
        token_expires_at: expiresAt,
        message_preview: messagePreview,
        whatsapp_hint:
          "שלב A: העתק/י את הקישור. שליחת WhatsApp אמיתית תחובר אחרי שההעלאה עובדת (שלב B). אין לשלוח/לקבל קבצים בצ׳אט WhatsApp.",
      });
    }

    return jsonResponse({ success: false, error: `unknown_action:${action}` }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
