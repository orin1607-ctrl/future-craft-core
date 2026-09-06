/**
 * Customer accident intake — Staging only.
 * Public token actions never return claim IDs, other claims, Gmail, history, or docs.
 * Staff JWT required for create_link. Tokens stored as SHA-256 only.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { edgeCorsHeaders, requireAuth, jsonResponse } from "../_shared/edgeAuth.ts";

const BUCKET = "claims-docs";
const STAGING_REF = "usfeoerkpcafxxlyuldl";
const DRAFT_MAX = 80_000;
const SIG_MAX = 400_000;
const PDF_MAX = 8_000_000;
const LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const ALLOWED_KEYS = new Set([
  "clientName", "clientPhone", "clientEmail", "clientId", "clientAddress", "clientZip",
  "plate", "carMake", "carModel", "carYear", "carType",
  "insCompany", "insType", "policyNum", "claimNum", "claimKind",
  "driverDifferent", "driverName", "driverId", "driverPhone", "driverLicense",
  "driverLicenseType", "driverLicenseValid", "driverLicenseYear", "driverBirthDate",
  "driverGender", "driverPermission",
  "eventDate", "eventTime", "eventPlace", "eventCity", "eventStreet", "eventDesc",
  "damageDesc", "damageLocation", "police", "policeStation", "policeFile", "policeDate",
  "tow", "witnesses",
  "thirdDriver", "thirdOwner", "thirdId", "thirdPhone", "thirdPlate", "thirdMakeModel",
  "thirdInsCompany", "thirdPolicy", "thirdClaimNum", "thirdDamage",
  "declarationAck", "formFilledBy", "contactPrefEmail", "contactPrefMobile", "contactPrefPost",
  "missingFlags",
]);

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

function clientIp(req: Request) {
  const h = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "";
  return h.split(",")[0].trim().slice(0, 64) || "unknown";
}

function sanitizeDraft(raw: unknown): Record<string, string> {
  const src = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(src)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (v === undefined || v === null) continue;
    const s = String(v).slice(0, k === "eventDesc" || k === "damageDesc" || k === "witnesses" ? 4000 : 240);
    out[k] = s;
  }
  return out;
}

function looksLikeEmail(s: string) {
  return !s || /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(s);
}

async function rateLimit(sb: ReturnType<typeof admin>, ip: string, action: string, max: number) {
  const key = await sha256Hex(`${ip}|${action}`);
  const now = Date.now();
  const { data } = await sb.from("claims_intake_rate").select("window_start, hits").eq("key_hash", key).maybeSingle();
  const start = data?.window_start ? new Date(data.window_start).getTime() : 0;
  if (!data || now - start > 60_000) {
    await sb.from("claims_intake_rate").upsert({
      key_hash: key,
      window_start: new Date(now).toISOString(),
      hits: 1,
    });
    return true;
  }
  if (Number(data.hits || 0) >= max) return false;
  await sb.from("claims_intake_rate").update({ hits: Number(data.hits || 0) + 1 }).eq("key_hash", key);
  return true;
}

async function hasClaimsAccess(sb: ReturnType<typeof admin>, uid: string, role: string) {
  if (role === "super_admin") return true;
  const { data } = await sb.from("claims_access").select("user_id").eq("user_id", uid).maybeSingle();
  return !!data;
}

async function resolvePending(sb: ReturnType<typeof admin>, token: string) {
  if (!token || token.length < 32 || token.length > 128 || !/^[a-f0-9]+$/i.test(token)) {
    return { error: "invalid_token" as const };
  }
  const hash = await sha256Hex(token);
  const { data } = await sb.from("claims_intake_links").select("*").eq("token_hash", hash).maybeSingle();
  if (!data) return { error: "invalid_token" as const };
  if (data.status === "revoked") return { error: "revoked" as const };
  if (new Date(data.expires_at).getTime() < Date.now() && data.status === "pending") {
    return { error: "expired" as const };
  }
  return { row: data };
}

function decodePng(dataUrl: string): Uint8Array | null {
  const m = String(dataUrl || "").match(/^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return null;
  try {
    const bin = atob(m[1].replace(/\s/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    if (out.byteLength < 40 || out.byteLength > SIG_MAX) return null;
    if (out[0] !== 0x89 || out[1] !== 0x50) return null;
    return out;
  } catch {
    return null;
  }
}

function decodePdfBase64(raw: string): Uint8Array | null {
  const s = String(raw || "").replace(/\s/g, "");
  if (!s || s.length < 80) return null;
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    if (out.byteLength < 200 || out.byteLength > PDF_MAX) return null;
    if (out[0] !== 0x25 || out[1] !== 0x50 || out[2] !== 0x44 || out[3] !== 0x46) return null;
    return out;
  } catch {
    return null;
  }
}

async function sha256HexBytes(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(hash));
}

async function storeSignedOpeningPdf(
  sb: ReturnType<typeof admin>,
  claimId: string,
  linkId: string,
  pdfB64: string,
) {
  const pdf = decodePdfBase64(pdfB64);
  if (!pdf) return;
  const digest = await sha256HexBytes(pdf);
  const { data: existing } = await sb.from("claims_documents").select("id").eq("claim_id", claimId).eq("content_sha256", digest).maybeSingle();
  if (existing?.id) return;
  const pdfPath = `intake/${linkId}/signed-opening-form.pdf`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(pdfPath, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) return;
  await sb.from("claims_documents").insert({
    id: nid("CDM"),
    claim_id: claimId,
    storage_path: pdfPath,
    original_name: "טופס פתיחת תביעה חתום.pdf",
    mime_type: "application/pdf",
    byte_size: pdf.byteLength,
    source: "customer",
    uploaded_by_name: "Customer Accident Intake",
    doc_kind: "general",
    doc_meta: { staff_type: "accident_notice", staff_title: "טופס פתיחת תביעה חתום" },
    content_sha256: digest,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: edgeCorsHeaders });
  const url = new URL(req.url);
  if (url.hostname.includes("supabase.co") && !url.hostname.startsWith(STAGING_REF)) {
    return jsonResponse({ success: false, error: "staging_only" }, 403);
  }
  const sb = admin();
  let body: Record<string, unknown> = {};
  try {
    if (req.method === "POST") body = await req.json();
  } catch {
    body = {};
  }
  const action = String(body.action || url.searchParams.get("action") || "public_get");
  const ip = clientIp(req);

  if (action === "public_get" || action === "public_save_draft" || action === "public_submit") {
    const max = action === "public_submit" ? 8 : action === "public_save_draft" ? 30 : 60;
    if (!(await rateLimit(sb, ip, action, max))) {
      return jsonResponse({ success: false, error: "rate_limited" }, 429);
    }
    const token = String(body.token || url.searchParams.get("t") || url.searchParams.get("token") || "");
    const resolved = await resolvePending(sb, token);
    if ("error" in resolved) return jsonResponse({ success: false, error: resolved.error }, 404);

    const row = resolved.row;

    if (action === "public_get") {
      if (row.status === "submitted" || (row.status === "submitting" && row.claim_id)) {
        return jsonResponse({
          success: true,
          submitted: true,
          message: "הדיווח התקבל בהצלחה",
        });
      }
      if (row.status === "submitting") {
        return jsonResponse({ success: true, submitting: true, draft: sanitizeDraft(row.draft) });
      }
      return jsonResponse({
        success: true,
        submitted: false,
        expiresAt: row.expires_at,
        draft: sanitizeDraft(row.draft),
      });
    }

    if (action === "public_save_draft") {
      if (row.status !== "pending") {
        return jsonResponse({ success: false, error: "already_used" }, 409);
      }
      const draft = sanitizeDraft(body.draft);
      const packed = JSON.stringify(draft);
      if (packed.length > DRAFT_MAX) return jsonResponse({ success: false, error: "draft_too_large" }, 400);
      await sb.from("claims_intake_links").update({
        draft,
        updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("status", "pending");
      return jsonResponse({ success: true, saved: true });
    }

    if (action === "public_submit") {
      if (row.status === "submitted" && row.claim_id) {
        return jsonResponse({ success: true, submitted: true, already: true });
      }
      if (row.status === "submitting") {
        const age = Date.now() - new Date(String(row.updated_at || 0)).getTime();
        if (Number.isFinite(age) && age < 120_000) {
          return jsonResponse({ success: false, error: "submit_in_progress" }, 409);
        }
      }
      const draft = sanitizeDraft({ ...(row.draft || {}), ...(body.draft || {}) });
      if (!String(draft.clientName || "").trim()) return jsonResponse({ success: false, error: "client_name_required" }, 400);
      if (!String(draft.plate || "").trim()) return jsonResponse({ success: false, error: "plate_required" }, 400);
      if (!String(draft.eventDate || "").trim()) return jsonResponse({ success: false, error: "event_date_required" }, 400);
      if (!String(draft.claimKind || "").trim()) return jsonResponse({ success: false, error: "kind_required" }, 400);
      if (String(draft.declarationAck || "") !== "true") return jsonResponse({ success: false, error: "declaration_required" }, 400);
      if (draft.clientEmail && !looksLikeEmail(draft.clientEmail)) {
        return jsonResponse({ success: false, error: "email_invalid" }, 400);
      }
      const png = decodePng(String(body.signature || ""));
      if (!png) return jsonResponse({ success: false, error: "signature_required" }, 400);

      const { data: locked } = await sb.from("claims_intake_links")
        .update({ status: "submitting", draft, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .in("status", ["pending", "submitting"])
        .select("id, created_by, status, claim_id")
        .maybeSingle();
      if (!locked) {
        const { data: raced } = await sb.from("claims_intake_links").select("status, claim_id").eq("id", row.id).maybeSingle();
        if (raced?.status === "submitted" && raced?.claim_id) return jsonResponse({ success: true, submitted: true, already: true });
        return jsonResponse({ success: false, error: "submit_in_progress" }, 409);
      }

      const sigPath = `intake/${row.id}/signature.png`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(sigPath, png, {
        contentType: "image/png",
        upsert: true,
      });
      if (upErr) {
        await sb.from("claims_intake_links").update({ status: "pending" }).eq("id", row.id);
        return jsonResponse({ success: false, error: "signature_store_failed" }, 400);
      }

      const plate = draft.plate.trim();
      const eventDate = draft.eventDate.trim();
      const claimNum = String(draft.claimNum || "").trim();
      const boundClaimId = String((locked as { claim_id?: string }).claim_id || row.claim_id || "").trim();
      let duplicateSuspect = false;
      if (!boundClaimId && claimNum) {
        const { data: byNum } = await sb.from("claims_records").select("id").filter("row_data->>claimNum", "eq", claimNum).limit(1);
        if ((byNum || []).length) duplicateSuspect = true;
      }
      if (!boundClaimId && !duplicateSuspect && plate && eventDate) {
        const { data: byPlate } = await sb.from("claims_records")
          .select("id, plate, row_data")
          .eq("plate", plate)
          .limit(40);
        if ((byPlate || []).some((c) => String((c.row_data as Record<string, unknown> | null)?.eventDate || "") === eventDate)) {
          duplicateSuspect = true;
        }
      }

      let claimId = boundClaimId;
      const signedAt = new Date().toISOString();
      if (boundClaimId) {
        const { data: existing } = await sb.from("claims_records").select("id, row_data, status, company_name").eq("id", boundClaimId).maybeSingle();
        if (!existing) {
          await sb.from("claims_intake_links").update({ status: "pending" }).eq("id", row.id);
          return jsonResponse({ success: false, error: "bound_claim_missing" }, 400);
        }
        const prev = (existing.row_data && typeof existing.row_data === "object") ? existing.row_data as Record<string, string> : {};
        const rowData: Record<string, string> = {
          ...prev,
          ...draft,
          id: boundClaimId,
          status: String(prev.status || existing.status || "חדש"),
          clientName: draft.clientName,
          clientPhone: draft.clientPhone || prev.clientPhone || "",
          clientEmail: draft.clientEmail || prev.clientEmail || "",
          plate,
          carModel: [draft.carMake, draft.carModel].filter(Boolean).join(" ").trim() || draft.carModel || prev.carModel || "",
          insCompany: draft.insCompany || prev.insCompany || "",
          policyNum: draft.policyNum || prev.policyNum || "",
          claimNum: claimNum || prev.claimNum || "",
          claimKind: draft.claimKind || prev.claimKind || "",
          eventDate,
          thirdParty: draft.thirdDriver || prev.thirdParty || "",
          thirdPlate: draft.thirdPlate || prev.thirdPlate || "",
          thirdPhone: draft.thirdPhone || prev.thirdPhone || "",
          signaturePath: sigPath,
          signedAt,
        };
        const { error: upClaimErr } = await sb.from("claims_records").update({
          plate,
          client_name: draft.clientName,
          company_name: draft.insCompany || existing.company_name || null,
          row_data: rowData,
          updated_by: row.created_by,
          updated_by_name: "Customer Accident Intake",
          last_activity_at: signedAt,
        }).eq("id", boundClaimId);
        if (upClaimErr) {
          await sb.from("claims_intake_links").update({ status: "pending" }).eq("id", row.id);
          return jsonResponse({ success: false, error: "claim_update_failed" }, 500);
        }
        await sb.from("claims_history").insert({
          id: nid("HIS"),
          claim_id: boundClaimId,
          row_data: {
            action: "טופס פתיחה נחתם ע״י הלקוח",
            type: "intake",
            source: "Customer Accident Intake",
            signedAt,
            at: new Date().toLocaleString("he-IL"),
          },
        });
      } else {
        const { data: dalId, error: dalErr } = await sb.rpc("claims_next_dal_id");
        if (dalErr || !dalId) {
          await sb.from("claims_intake_links").update({ status: "pending" }).eq("id", row.id);
          return jsonResponse({ success: false, error: "dal_failed" }, 500);
        }
        claimId = String(dalId);
        const rowData: Record<string, string> = {
          ...draft,
          id: claimId,
          status: "חדש",
          clientName: draft.clientName,
          clientPhone: draft.clientPhone || "",
          clientEmail: draft.clientEmail || "",
          plate,
          carModel: [draft.carMake, draft.carModel].filter(Boolean).join(" ").trim() || draft.carModel || "",
          insCompany: draft.insCompany || "",
          policyNum: draft.policyNum || "",
          claimNum,
          claimKind: draft.claimKind,
          eventDate,
          thirdParty: draft.thirdDriver || "",
          thirdPlate: draft.thirdPlate || "",
          thirdPhone: draft.thirdPhone || "",
          source: "Customer Accident Intake",
          signaturePath: sigPath,
          signedAt,
          duplicateSuspect: duplicateSuspect ? "true" : "false",
          createdAt: new Date().toLocaleString("he-IL"),
        };

        const { error: insErr } = await sb.from("claims_records").insert({
          id: claimId,
          plate,
          client_name: draft.clientName,
          status: "חדש",
          company_name: draft.insCompany || null,
          vehicle_id: null,
          row_data: rowData,
          created_by: row.created_by,
          created_by_name: "Customer Accident Intake",
          updated_by: row.created_by,
          updated_by_name: "Customer Accident Intake",
          last_activity_at: signedAt,
        });
        if (insErr) {
          await sb.from("claims_intake_links").update({ status: "pending" }).eq("id", row.id);
          return jsonResponse({ success: false, error: "claim_insert_failed" }, 500);
        }

        await sb.from("claims_history").insert({
          id: nid("HIS"),
          claim_id: claimId,
          row_data: {
            action: "תיק נפתח מטופס דיווח לקוח",
            type: "intake",
            note: duplicateSuspect ? "duplicate_suspect" : "",
            source: "Customer Accident Intake",
            signedAt,
            at: new Date().toLocaleString("he-IL"),
          },
        });
      }

      await sb.from("claims_documents").insert({
        id: nid("CDM"),
        claim_id: claimId,
        storage_path: sigPath,
        original_name: "signature.png",
        mime_type: "image/png",
        byte_size: png.byteLength,
        source: "customer",
        uploaded_by_name: "Customer Accident Intake",
        doc_kind: "general",
      });
      await storeSignedOpeningPdf(sb, claimId, row.id, String(body.signed_pdf_base64 || ""));

      await sb.from("claims_intake_links").update({
        status: "submitted",
        claim_id: claimId,
        submitted_at: signedAt,
        duplicate_suspect: duplicateSuspect,
        signature_path: sigPath,
        updated_at: signedAt,
      }).eq("id", row.id);

      return jsonResponse({
        success: true,
        submitted: true,
        duplicateSuspect,
        message: "הדיווח התקבל בהצלחה",
      });
    }
  }

  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;
  const { user, role } = auth.ctx;
  if (!(await hasClaimsAccess(sb, user.id, role))) return jsonResponse({ success: false, error: "forbidden" }, 403);

  if (action === "create_link") {
    if (!(await rateLimit(sb, user.id, "create_link", 20))) {
      return jsonResponse({ success: false, error: "rate_limited" }, 429);
    }
    const token = randomToken();
    const id = nid("INL");
    const claimId = String(body.claim_id || "").trim();
    if (claimId) {
      const { data: claim } = await sb.from("claims_records").select("id").eq("id", claimId).maybeSingle();
      if (!claim) return jsonResponse({ success: false, error: "claim_not_found" }, 400);
    }
    const { error } = await sb.from("claims_intake_links").insert({
      id,
      token_hash: await sha256Hex(token),
      status: "pending",
      expires_at: new Date(Date.now() + LINK_TTL_MS).toISOString(),
      created_by: user.id,
      ...(claimId ? { claim_id: claimId } : {}),
    });
    if (error) return jsonResponse({ success: false, error: error.message }, 400);
    return jsonResponse({
      success: true,
      token,
      expiresAt: new Date(Date.now() + LINK_TTL_MS).toISOString(),
    });
  }

  if (action === "revoke_link") {
    const id = String(body.id || "");
    if (!id) return jsonResponse({ success: false, error: "id_required" }, 400);
    await sb.from("claims_intake_links").update({ status: "revoked" }).eq("id", id).eq("status", "pending");
    return jsonResponse({ success: true });
  }

  return jsonResponse({ success: false, error: "unknown_action" }, 400);
});
