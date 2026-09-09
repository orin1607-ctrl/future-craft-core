/**
 * Isolated claims documents + customer upload links + outbound secure share.
 * Staging only. Does not touch document-request / WhatsApp / Gmail OAuth.
 *
 * Customer upload token: SHA-256 in DB; staff may reconstruct via HMAC (upload only).
 * Outbound share token: random, shown once at create_share. SHA-256 only in DB.
 * There is no reveal_share. Lost link → revoke and create a new share.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { edgeCorsHeaders, requireAuth, jsonResponse } from "../_shared/edgeAuth.ts";

const BUCKET = "claims-docs";
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"]);
const MAX_BYTES = 15 * 1024 * 1024;
const SIGNED_TTL_SEC = 600;
const SHARE_KINDS = new Set(["surveyor", "lawyer", "insurer", "agent", "client", "other"]);
const MAX_SHARE_FILES = 80;
const MAX_ZIP_BYTES = 40 * 1024 * 1024;

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

function randomShareToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function parseShareIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((x) => String(x || "").trim()).filter(Boolean))].slice(0, MAX_SHARE_FILES);
}

function shareFileIdsOf(row: { file_ids?: unknown }): string[] {
  return parseShareIds(row.file_ids);
}

function isImageName(mime: string, name: string) {
  return /^image\//i.test(mime) || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(name);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function u16(n: number) {
  return Uint8Array.of(n & 255, (n >>> 8) & 255);
}
function u32(n: number) {
  return Uint8Array.of(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255);
}

function zipStore(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name.replace(/\\/g, "/"));
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length + f.data.length);
    local.set([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0);
    local.set(u32(crc), 14);
    local.set(u32(f.data.length), 18);
    local.set(u32(f.data.length), 22);
    local.set(u16(name.length), 26);
    local.set(name, 30);
    local.set(f.data, 30 + name.length);
    locals.push(local);
    const central = new Uint8Array(46 + name.length);
    central.set([0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0);
    central.set(u32(crc), 16);
    central.set(u32(f.data.length), 20);
    central.set(u32(f.data.length), 24);
    central.set(u16(name.length), 28);
    central.set(u32(offset), 42);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  end.set([0x50, 0x4b, 0x05, 0x06], 0);
  end.set(u16(files.length), 8);
  end.set(u16(files.length), 10);
  end.set(u32(centralSize), 12);
  end.set(u32(offset), 16);
  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  for (const l of locals) { out.set(l, p); p += l.length; }
  for (const c of centrals) { out.set(c, p); p += c.length; }
  out.set(end, p);
  return out;
}

function wrapJpegsPdf(pages: Array<{ jpeg: Uint8Array; w: number; h: number }>): Uint8Array {
  const pageW = 595;
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const push = (s: string) => chunks.push(encoder.encode(s));
  push("%PDF-1.4\n");
  const off: number[] = [0];
  const pos = () => chunks.reduce((n, c) => n + c.length, 0);
  const add = (body: string) => { off.push(pos()); push(body); };
  const n = Math.max(1, pages.length);
  const kids = pages.map((_, i) => `${3 + 3 * i} 0 R`).join(" ");
  add("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  add(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${n} >>\nendobj\n`);
  pages.forEach((pg, i) => {
    const pageId = 3 + 3 * i;
    const imgId = pageId + 1;
    const contentId = pageId + 2;
    const pageH = Math.max(200, Math.round((pg.h / Math.max(1, pg.w)) * pageW));
    add(`${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`);
    off.push(pos());
    push(`${imgId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`);
    chunks.push(pg.jpeg);
    push("\nendstream\nendobj\n");
    const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
    add(`${contentId} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
  });
  const xrefAt = pos();
  const objCount = 2 + 3 * n;
  push(`xref\n0 ${objCount + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i <= objCount; i++) push(`${String(off[i]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

function binResponse(body: Uint8Array, contentType: string, filename: string) {
  return new Response(body, {
    status: 200,
    headers: {
      ...edgeCorsHeaders,
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function blocked(reason = "BLOCKED") {
  return jsonResponse({ success: false, error: reason, blocked: true }, 403);
}

/** Domain-separated HMAC key. Never stored. Not the raw token. */
async function uploadLinkMacKey() {
  const material = `claims-upload-link-v1\0${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""}`;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return new Uint8Array(hash);
}

async function hmacSha256Hex(keyBytes: Uint8Array, message: string) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bytesToHex(new Uint8Array(sig));
}

/** Reconstructable staff token. Public lookup still uses token_hash only. */
async function mintUploadToken(linkId: string, claimId: string) {
  return hmacSha256Hex(await uploadLinkMacKey(), `${linkId}|${claimId}`);
}

async function isReconstructableLink(linkId: string, claimId: string, tokenHash: string) {
  const token = await mintUploadToken(linkId, claimId);
  return (await sha256Hex(token)) === tokenHash;
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
  "garage_photo",
]);

const STAFF_TYPES = new Set([
  "",
  "vehicle_license",
  "driver_license",
  "no_claim_form",
  "accident_notice",
  "policy",
  "police",
  "surveyor_report",
  "garage_invoice",
  "garage_photos",
  "damage_photos",
  "other",
  "notice_a",
  "notice_ayin",
  "insurance_history",
  "consent_form",
  "check_photo",
  "power_of_attorney",
  "rejection_letter",
  "demand_form",
]);

const STAFF_TYPE_BY_DOC_KEY: Record<string, string> = {
  notice_a: "notice_a",
  notice_ayin: "notice_ayin",
  no_claim_form: "no_claim_form",
  insurance_history: "insurance_history",
  consent_form: "consent_form",
  check_photo: "check_photo",
  garage_invoice: "garage_invoice",
  garage_photos: "garage_photos",
  surveyor_report: "surveyor_report",
  damage_photos: "damage_photos",
  license_driver: "driver_license",
  license_vehicle: "vehicle_license",
  accident_notice: "accident_notice",
  power_of_attorney: "power_of_attorney",
  rejection_letter: "rejection_letter",
  demand_form: "demand_form",
};
const MULTI_DOC_KEYS = new Set(["surveyor_photos", "damage_photos", "license_driver"]);

function kindFromUpload(docKey: string, mime: string, explicit: string) {
  if (explicit && DOC_KINDS.has(explicit)) return explicit;
  if (docKey === "surveyor_report" || docKey === "surveyor_photos") return mime.startsWith("image/") ? "surveyor_photo" : "surveyor_report";
  if (docKey === "garage_invoice") return "garage_invoice";
  if (docKey === "garage_photos" || explicit === "garage_photo") return "garage_photo";
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

type ShareRow = {
  id: string;
  claim_id: string;
  file_ids: unknown;
  expires_at: string;
  revoked_at: string | null;
  recipient_name: string;
  recipient_kind: string;
  opened_at: string | null;
  open_count: number;
};

async function resolveShare(sb: ReturnType<typeof admin>, token: string) {
  if (!token || token.length < 32) return { error: "invalid_token" as const };
  const tokenHash = await sha256Hex(token);
  const { data } = await sb.from("claims_share_links").select("id, claim_id, file_ids, expires_at, revoked_at, recipient_name, recipient_kind, opened_at, open_count").eq("token_hash", tokenHash).maybeSingle();
  if (!data) return { error: "not_found" as const };
  if (data.revoked_at) return { error: "revoked" as const };
  if (new Date(data.expires_at).getTime() < Date.now()) return { error: "expired" as const };
  return { data: data as ShareRow };
}

function sharePublicError(code: string) {
  const status = code === "revoked" || code === "expired" ? 410 : 404;
  return jsonResponse({ success: false, error: code, blocked: true }, status);
}

async function loadShareFiles(sb: ReturnType<typeof admin>, share: ShareRow, requested?: string[]) {
  const allowed = shareFileIdsOf(share);
  const want = requested?.length ? requested : allowed;
  if (want.some((id) => !allowed.includes(id))) return { error: "BLOCKED" as const, files: [] as Array<{ id: string; claim_id: string; storage_path: string; original_name: string; mime_type: string; byte_size: number }> };
  if (!want.length) return { error: "no_files" as const, files: [] };
  const { data } = await sb.from("claims_documents").select("id, claim_id, storage_path, original_name, mime_type, byte_size").eq("claim_id", share.claim_id).in("id", want);
  const rows = data || [];
  if (rows.some((f) => f.claim_id !== share.claim_id || !allowed.includes(f.id))) return { error: "BLOCKED" as const, files: [] };
  if (rows.length !== want.length) return { error: "BLOCKED" as const, files: [] };
  const byId = new Map(rows.map((f) => [f.id, f]));
  return { files: want.map((id) => byId.get(id)!).filter(Boolean) };
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
      const { data: docs } = await sb.from("claims_doc_requests").select("id, label, doc_key, status, received_at").eq("claim_id", claimId).order("created_at");
      const { data: custFiles } = await sb.from("claims_documents").select("id, doc_request_id").eq("claim_id", claimId).eq("source", "customer");
      const uploadedByReq = new Map<string, number>();
      for (const f of custFiles || []) {
        const k = String(f.doc_request_id || "");
        if (k) uploadedByReq.set(k, (uploadedByReq.get(k) || 0) + 1);
      }
      const { data: taskRows } = await sb.from("claims_tasks").select("id, row_data").eq("claim_id", claimId);
      const letterByReq = new Map<string, Record<string, unknown>>();
      for (const t of taskRows || []) {
        const rd = (t.row_data && typeof t.row_data === "object") ? t.row_data as Record<string, string> : {};
        if (rd.audience !== "customer") continue;
        if (rd.done === "true" || rd.customerStatus === "done" || rd.customerStatus === "cancelled") continue;
        const did = String(rd.docRequestId || "");
        if (!did) continue;
        letterByReq.set(did, {
          title: rd.action || rd.letterSubject || "",
          date: rd.letterDate || "",
          to: rd.letterTo || "",
          subject: rd.letterSubject || "",
          body: rd.letterBody || rd.requestText || "",
          needsSignature: rd.needsSignature === "true",
          kind: rd.customerKind || "",
          allowUpload: rd.allowUpload !== "false",
        });
      }
      return jsonResponse({
        success: true,
        clientName: claim?.client_name || "לקוח",
        plate: claim?.plate || "",
        expiresAt: resolved.data.expires_at,
        docs: (docs || []).map((d) => ({
          id: d.id,
          label: d.label,
          docKey: String(d.doc_key || ""),
          status: d.status,
          receivedAt: d.received_at,
          uploadedCount: uploadedByReq.get(d.id) || 0,
          allowMultiple: MULTI_DOC_KEYS.has(String(d.doc_key || "")),
          formDownload: false,
          letter: letterByReq.get(d.id) || null,
        })),
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
      const reqKey = String(reqRow.doc_key || "");
      const staffType = STAFF_TYPE_BY_DOC_KEY[reqKey] || "";
      const fileId = nid("CDM");
      await sb.from("claims_documents").insert({
        id: fileId,
        claim_id: claimId,
        doc_request_id: docRequestId,
        storage_path: path,
        original_name: file.name,
        mime_type: storedMime,
        byte_size: file.size,
        source: "customer",
        uploaded_by_name: "לקוח",
        doc_kind: kindFromUpload(reqKey, storedMime, ""),
        doc_meta: staffType ? { staff_type: staffType } : {},
      });
      await sb.from("claims_doc_requests").update({ status: "received", received_at: new Date().toISOString() }).eq("id", docRequestId);
      await history(sb, claimId, "מסמך התקבל מהלקוח", reqRow.label, "לקוח");
      await notify(sb, claimId, `התקבל מסמך חדש מהלקוח · ${reqRow.label}`);
      const { data: taskRows } = await sb.from("claims_tasks").select("id, row_data").eq("claim_id", claimId);
      for (const t of taskRows || []) {
        const rd = (t.row_data && typeof t.row_data === "object") ? t.row_data as Record<string, string> : {};
        if (rd.done === "true") continue;
        const matchesCustomer = rd.audience === "customer" && (
          rd.docRequestId === docRequestId
          || (rd.requestType && staffType && rd.requestType === staffType)
          || (rd.action && reqRow.label && rd.action === reqRow.label)
        );
        const matchesTreat = (rd.treatmentItem === "true" || rd.kind === "treatment_item") && Boolean(staffType && rd.requestType && rd.requestType === staffType);
        if (!matchesCustomer && !matchesTreat) continue;
        await sb.from("claims_tasks").update({
          row_data: {
            ...rd,
            workStatus: "doc_received",
            docState: "ready",
            readyFileId: fileId,
            ...(matchesCustomer ? {
              customerStatus: "received",
              receivedAt: new Date().toISOString(),
              done: "false",
            } : {}),
            updatedAt: new Date().toLocaleString("he-IL"),
          },
        }).eq("id", t.id);
      }
      const { data: left } = await sb.from("claims_doc_requests").select("id").eq("claim_id", claimId).neq("status", "received");
      if ((left || []).length > 0) {
        await sb.from("claims_records").update({ status: "ממתין למסמכים", last_activity_at: new Date().toISOString() }).eq("id", claimId).eq("status", "חדש");
      }
      return jsonResponse({ success: true });
    }

    if (action === "public_share_get" || action === "public_share_url" || action === "public_share_zip" || action === "public_share_bundle_pdf") {
      const token = String(url.searchParams.get("token") || body.token || form?.get("token") || "");
      const resolved = await resolveShare(sb, token);
      if ("error" in resolved) return sharePublicError(resolved.error);
      const share = resolved.data;
      const hintedClaim = String(body.claim_id || url.searchParams.get("claim_id") || "");
      if (hintedClaim && hintedClaim !== share.claim_id) return blocked("BLOCKED");

      if (action === "public_share_get") {
        const loaded = await loadShareFiles(sb, share);
        if ("error" in loaded && loaded.error === "BLOCKED") return blocked("BLOCKED");
        await sb.from("claims_share_links").update({
          opened_at: share.opened_at || new Date().toISOString(),
          open_count: Number(share.open_count || 0) + 1,
        }).eq("id", share.id);
        return jsonResponse({
          success: true,
          expiresAt: share.expires_at,
          recipientKind: share.recipient_kind,
          files: loaded.files.map((f) => ({
            id: f.id,
            name: f.original_name,
            mime: f.mime_type,
            bytes: f.byte_size,
            image: isImageName(f.mime_type, f.original_name),
          })),
          note: "read_only",
        });
      }

      const reqIds = parseShareIds(body.file_ids || (body.file_id ? [body.file_id] : url.searchParams.get("file_id") ? [url.searchParams.get("file_id")] : []));

      if (action === "public_share_url") {
        const fileId = String(body.file_id || url.searchParams.get("file_id") || reqIds[0] || "");
        if (!fileId) return blocked("BLOCKED");
        const loaded = await loadShareFiles(sb, share, [fileId]);
        if ("error" in loaded) return blocked("BLOCKED");
        const file = loaded.files[0];
        if (!file || file.claim_id !== share.claim_id) return blocked("BLOCKED");
        const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(file.storage_path, SIGNED_TTL_SEC);
        if (error || !data?.signedUrl) return jsonResponse({ success: false, error: error?.message || "sign_failed" }, 400);
        if (body.purpose === "download") {
          await sb.from("claims_share_links").update({ last_download_at: new Date().toISOString() }).eq("id", share.id);
        }
        return jsonResponse({ success: true, url: data.signedUrl, name: file.original_name, mime: file.mime_type, ttl: SIGNED_TTL_SEC });
      }

      const loaded = await loadShareFiles(sb, share, reqIds.length ? reqIds : undefined);
      if ("error" in loaded) return blocked(loaded.error === "no_files" ? "no_files" : "BLOCKED");
      const files = loaded.files;
      let total = 0;
      const blobs: Array<{ name: string; data: Uint8Array; mime: string; image: boolean }> = [];
      for (const f of files) {
        if (f.claim_id !== share.claim_id) return blocked("BLOCKED");
        const dl = await sb.storage.from(BUCKET).download(f.storage_path);
        if (dl.error || !dl.data) return jsonResponse({ success: false, error: "download_failed" }, 400);
        const buf = new Uint8Array(await dl.data.arrayBuffer());
        total += buf.length;
        if (total > MAX_ZIP_BYTES) return jsonResponse({ success: false, error: "package_too_large" }, 400);
        blobs.push({
          name: sanitizeFileName(f.original_name),
          data: buf,
          mime: f.mime_type,
          image: isImageName(f.mime_type, f.original_name),
        });
      }
      await sb.from("claims_share_links").update({ last_download_at: new Date().toISOString() }).eq("id", share.id);

      if (action === "public_share_zip") {
        const zip = zipStore(blobs.map((b) => ({
          name: `${b.image ? "photos" : "docs"}/${b.name}`,
          data: b.data,
        })));
        return binResponse(zip, "application/zip", "claim-share.zip");
      }

      const pages: Array<{ jpeg: Uint8Array; w: number; h: number }> = [];
      for (const b of blobs) {
        const jpeg = b.data.length > 2 && b.data[0] === 0xff && b.data[1] === 0xd8;
        if (!jpeg) continue;
        pages.push({ jpeg: b.data, w: 1200, h: 1600 });
      }
      if (!pages.length) {
        return jsonResponse({
          success: false,
          error: "bundle_pdf_images_only",
          hint: "אין תמונות שניתן לשלב ב-PDF. קבצי המקור זמינים להורדה ול-ZIP.",
        }, 400);
      }
      const pdf = wrapJpegsPdf(pages);
      return binResponse(pdf, "application/pdf", "claim-share-bundle.pdf");
    }

    const auth = await requireAuth(req);
    if ("error" in auth) return auth.error;
    const { user, role } = auth.ctx;
    const profile = await sb.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const actorName = profile.data?.full_name || user.email || user.id;

    const garageJobCols = "id, claim_id, worker_id, worker_name, status, worker_note, photo_count, assigned_by_name, assigned_at, completed_at, unassigned_at, review_status, review_note, reviewed_by, reviewed_by_name, reviewed_at";

    async function activeGarageJob(claimId: string) {
      const { data } = await sb.from("claims_garage_assignments")
        .select(garageJobCols)
        .eq("claim_id", claimId)
        .is("unassigned_at", null)
        .maybeSingle();
      return data;
    }

    async function workerOwnsGarage(claimId: string) {
      const job = await activeGarageJob(claimId);
      return !!job && job.worker_id === user.id ? job : null;
    }

    function claimPublicSlice(row: { id?: string; client_name?: string; plate?: string; row_data?: Record<string, unknown> | null }) {
      const rd = row.row_data && typeof row.row_data === "object" ? row.row_data : {};
      const str = (k: string) => String((rd as Record<string, unknown>)[k] || "").trim();
      return {
        id: String(row.id || ""),
        client_name: String(row.client_name || str("clientName") || ""),
        plate: String(row.plate || str("plate") || ""),
        car_model: str("carModel"),
        garage_name: str("garageName"),
        event_date: str("eventDate"),
      };
    }

    function claimSoftDeleted(row: { row_data?: Record<string, unknown> | null } | null | undefined) {
      const rd = row?.row_data;
      return Boolean(rd && typeof rd === "object" && rd.deletedAt);
    }

    async function listGaragePhotos(claimId: string) {
      const { data } = await sb.from("claims_documents")
        .select("id, original_name, mime_type, byte_size, created_at, uploaded_by_name, doc_kind, doc_meta")
        .eq("claim_id", claimId)
        .order("created_at", { ascending: true });
      return (data || []).filter((f) => {
        const st = String((f.doc_meta && typeof f.doc_meta === "object" ? (f.doc_meta as Record<string, string>).staff_type : "") || "");
        return f.doc_kind === "garage_photo" || st === "garage_photos";
      });
    }

    if (action === "garage_list_jobs" || action === "garage_get_job" || action === "garage_upload" || action === "garage_list_photos" || action === "garage_complete" || action === "garage_signed_url") {
      const previewWorker = String(body.worker_id || form?.get("worker_id") || "").trim();
      const staffPreview = Boolean(previewWorker && previewWorker !== user.id && await hasClaimsAccess(sb, user.id, role));
      const effectiveWorkerId = staffPreview ? previewWorker : user.id;

      if (action === "garage_list_jobs") {
        const { data: jobs } = await sb.from("claims_garage_assignments")
          .select("id, claim_id, worker_id, worker_name, status, worker_note, photo_count, assigned_at, completed_at, review_status, review_note")
          .eq("worker_id", effectiveWorkerId)
          .is("unassigned_at", null)
          .order("assigned_at", { ascending: false });
        const ids = (jobs || []).map((j) => j.claim_id);
        const claims = ids.length
          ? (await sb.from("claims_records").select("id, client_name, plate, row_data").in("id", ids)).data || []
          : [];
        const byId = new Map(claims.map((c) => [c.id, c]));
        return jsonResponse({
          success: true,
          jobs: (jobs || [])
            .filter((j) => {
              const row = byId.get(j.claim_id);
              return Boolean(row) && !claimSoftDeleted(row);
            })
            .map((j) => ({
              ...j,
              claim: claimPublicSlice(byId.get(j.claim_id) || { id: j.claim_id }),
            })),
        });
      }

      const claimId = String(body.claim_id || form?.get("claim_id") || "");
      let job = await workerOwnsGarage(claimId);
      if (!job && staffPreview) {
        const active = await activeGarageJob(claimId);
        if (active && active.worker_id === previewWorker) job = active;
      }
      if (!job) return jsonResponse({ success: false, error: "forbidden", blocked: true }, 403);
      if ((action === "garage_upload" || action === "garage_complete") && job.worker_id !== user.id) {
        return jsonResponse({ success: false, error: "forbidden", blocked: true }, 403);
      }
      const { data: ownedClaim } = await sb.from("claims_records").select("id, client_name, plate, row_data").eq("id", claimId).maybeSingle();
      if (!ownedClaim || claimSoftDeleted(ownedClaim)) return jsonResponse({ success: false, error: "forbidden", blocked: true }, 403);

      if (action === "garage_get_job" || action === "garage_list_photos") {
        const photos = await listGaragePhotos(claimId);
        return jsonResponse({
          success: true,
          job,
          claim: claimPublicSlice(ownedClaim || { id: claimId }),
          photos: photos.map((p) => ({
            id: p.id,
            original_name: p.original_name,
            mime_type: p.mime_type,
            byte_size: p.byte_size,
            created_at: p.created_at,
            uploaded_by_name: p.uploaded_by_name,
          })),
        });
      }

      if (action === "garage_signed_url") {
        const fileId = String(body.file_id || "");
        const photos = await listGaragePhotos(claimId);
        const hit = photos.find((p) => p.id === fileId);
        if (!hit) return jsonResponse({ success: false, error: "BLOCKED", blocked: true }, 403);
        const { data: file } = await sb.from("claims_documents").select("storage_path, claim_id").eq("id", fileId).eq("claim_id", claimId).maybeSingle();
        if (!file) return jsonResponse({ success: false, error: "not_found" }, 404);
        const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(file.storage_path, SIGNED_TTL_SEC);
        if (error) return jsonResponse({ success: false, error: error.message }, 400);
        return jsonResponse({ success: true, url: data.signedUrl });
      }

      if (action === "garage_complete") {
        const now = new Date().toISOString();
        await sb.from("claims_garage_assignments").update({
          status: "completed",
          completed_at: now,
          review_status: "awaiting_review",
          review_note: "",
          reviewed_by: null,
          reviewed_by_name: "",
          reviewed_at: null,
        }).eq("id", job.id).eq("worker_id", user.id).is("unassigned_at", null);
        await history(sb, claimId, "צילומי מוסך נשלחו לבדיקה", `עובד ${job.worker_name}`, actorName);
        return jsonResponse({ success: true, status: "completed", review_status: "awaiting_review", completed_at: now });
      }

      if (action === "garage_upload") {
        const file = form?.get("file");
        if (!(file instanceof File)) return jsonResponse({ success: false, error: "file_required" }, 400);
        if (file.size > MAX_BYTES) return jsonResponse({ success: false, error: "file_too_large" }, 400);
        const buf = new Uint8Array(await file.arrayBuffer());
        const storedMime = resolveStoredMime(file.name, file.type, buf);
        if (!/^image\//.test(storedMime) || !ALLOWED.has(storedMime)) return jsonResponse({ success: false, error: "image_required" }, 400);
        const digest = await sha256HexBytes(buf);
        const { data: existing } = await sb.from("claims_documents").select("id, source").eq("claim_id", claimId).eq("content_sha256", digest).maybeSingle();
        if (existing?.id) {
          return jsonResponse({ success: true, file_id: existing.id, reused: true, source: existing.source });
        }
        const fileId = nid("CDM");
        const path = `${claimId}/staff/${nid("F")}-${sanitizeFileName(file.name)}`;
        const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: storedMime, upsert: false });
        if (upErr) return jsonResponse({ success: false, error: upErr.message }, 400);
        const { error: insErr } = await sb.from("claims_documents").insert({
          id: fileId,
          claim_id: claimId,
          storage_path: path,
          original_name: file.name,
          mime_type: storedMime,
          byte_size: file.size,
          source: "staff",
          uploaded_by: user.id,
          uploaded_by_name: actorName,
          doc_kind: "garage_photo",
          doc_meta: { staff_type: "garage_photos", staff_title: "תמונות מוסך" },
          content_sha256: digest,
        });
        if (insErr) return jsonResponse({ success: false, error: insErr.message }, 400);
        const photos = await listGaragePhotos(claimId);
        const nextStatus = job.status === "completed" ? "completed" : "in_progress";
        await sb.from("claims_garage_assignments").update({
          photo_count: photos.length,
          status: nextStatus,
        }).eq("id", job.id);
        await history(sb, claimId, "תמונת מוסך הועלתה", file.name, actorName);
        return jsonResponse({ success: true, file_id: fileId, reused: false, photo_count: photos.length, status: nextStatus });
      }
    }

    if (!(await hasClaimsAccess(sb, user.id, role))) return jsonResponse({ success: false, error: "forbidden" }, 403);

    if (action === "list_garage_workers") {
      const { data } = await sb.from("profiles")
        .select("id, full_name, job_title")
        .eq("is_active", true)
        .order("full_name")
        .limit(400);
      const workers = (data || []).map((p) => ({
        id: p.id,
        full_name: p.full_name || p.id,
        garage_photographer: String(p.job_title || "").trim() === "garage_photographer",
      }));
      workers.sort((a, b) => Number(b.garage_photographer) - Number(a.garage_photographer) || a.full_name.localeCompare(b.full_name, "he"));
      return jsonResponse({ success: true, workers });
    }

    if (action === "get_garage_assignment") {
      const claimId = String(body.claim_id || "");
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      const job = await activeGarageJob(claimId);
      const photos = job ? await listGaragePhotos(claimId) : [];
      return jsonResponse({ success: true, assignment: job || null, photo_count: photos.length });
    }

    if (action === "list_garage_reviews") {
      const { data } = await sb.from("claims_garage_assignments")
        .select("claim_id, review_status, review_note, reviewed_by, reviewed_by_name, reviewed_at, status, worker_id, worker_name")
        .is("unassigned_at", null)
        .eq("review_status", "awaiting_review");
      const rows = data || [];
      if (role === "super_admin") return jsonResponse({ success: true, reviews: rows });
      const ids = [...new Set(rows.map((r) => r.claim_id).filter(Boolean))];
      if (!ids.length) return jsonResponse({ success: true, reviews: [] });
      const { data: mine } = await sb.from("claims_records")
        .select("id")
        .in("id", ids)
        .or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`);
      const allowed = new Set((mine || []).map((c) => c.id));
      return jsonResponse({ success: true, reviews: rows.filter((r) => allowed.has(r.claim_id)) });
    }

    if (action === "garage_review_approve" || action === "garage_review_needs_update") {
      const claimId = String(body.claim_id || "");
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      const job = await activeGarageJob(claimId);
      if (!job) return jsonResponse({ success: false, error: "no_assignment" }, 404);
      if (job.review_status !== "awaiting_review") return jsonResponse({ success: false, error: "not_awaiting_review" }, 409);
      const now = new Date().toISOString();
      if (action === "garage_review_approve") {
        await sb.from("claims_garage_assignments").update({
          review_status: "approved",
          reviewed_by: user.id,
          reviewed_by_name: actorName,
          reviewed_at: now,
        }).eq("id", job.id).is("unassigned_at", null);
        await history(sb, claimId, "צילומי מוסך אושרו", actorName, actorName);
        const next = await activeGarageJob(claimId);
        return jsonResponse({ success: true, assignment: next });
      }
      const note = String(body.note || "").trim();
      if (!note) return jsonResponse({ success: false, error: "note_required" }, 400);
      if (note.length > 400) return jsonResponse({ success: false, error: "note_too_long" }, 400);
      await sb.from("claims_garage_assignments").update({
        review_status: "needs_update",
        review_note: note,
        reviewed_by: user.id,
        reviewed_by_name: actorName,
        reviewed_at: now,
        status: "in_progress",
      }).eq("id", job.id).is("unassigned_at", null);
      await history(sb, claimId, "צילומי מוסך — דרושה השלמה", note, actorName);
      const next = await activeGarageJob(claimId);
      return jsonResponse({ success: true, assignment: next });
    }

    if (action === "assign_garage_worker") {
      const claimId = String(body.claim_id || "");
      const workerId = String(body.worker_id || "");
      const workerNote = String(body.worker_note || "").trim().slice(0, 400);
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      if (!workerId) return jsonResponse({ success: false, error: "worker_required" }, 400);
      const { data: worker } = await sb.from("profiles").select("id, full_name, is_active").eq("id", workerId).maybeSingle();
      if (!worker?.id || worker.is_active === false) return jsonResponse({ success: false, error: "worker_not_found" }, 404);
      const prev = await activeGarageJob(claimId);
      if (prev) {
        await sb.from("claims_garage_assignments").update({
          unassigned_at: new Date().toISOString(),
          unassigned_by: user.id,
          unassigned_by_name: actorName,
        }).eq("id", prev.id);
        await history(sb, claimId, prev.worker_id === workerId ? "שיוך צלם מוסך חודש" : "הוחלף צלם מוסך", `${prev.worker_name} → ${worker.full_name || workerId}`, actorName);
      }
      const id = nid("GAR");
      const { error: insErr } = await sb.from("claims_garage_assignments").insert({
        id,
        claim_id: claimId,
        worker_id: worker.id,
        worker_name: worker.full_name || worker.id,
        status: "pending",
        worker_note: workerNote,
        photo_count: 0,
        review_status: "",
        review_note: "",
        reviewed_by: null,
        reviewed_by_name: "",
        reviewed_at: null,
        assigned_by: user.id,
        assigned_by_name: actorName,
      });
      if (insErr) return jsonResponse({ success: false, error: insErr.message }, 400);
      if (!prev) await history(sb, claimId, "שויך צלם מוסך", worker.full_name || workerId, actorName);
      return jsonResponse({
        success: true,
        assignment: {
          id,
          claim_id: claimId,
          worker_id: worker.id,
          worker_name: worker.full_name || worker.id,
          status: "pending",
          worker_note: workerNote,
          assigned_by_name: actorName,
        },
      });
    }

    if (action === "unassign_garage_worker") {
      const claimId = String(body.claim_id || "");
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      const prev = await activeGarageJob(claimId);
      if (!prev) return jsonResponse({ success: true, assignment: null });
      await sb.from("claims_garage_assignments").update({
        unassigned_at: new Date().toISOString(),
        unassigned_by: user.id,
        unassigned_by_name: actorName,
      }).eq("id", prev.id);
      await history(sb, claimId, "בוטל שיוך צלם מוסך", prev.worker_name, actorName);
      return jsonResponse({ success: true, assignment: null });
    }

    if (action === "create_link") {
      const claimId = String(body.claim_id || "");
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      await sb.from("claims_upload_links").update({ revoked_at: new Date().toISOString() }).eq("claim_id", claimId).is("revoked_at", null);
      const linkId = nid("LNK");
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const token = await mintUploadToken(linkId, claimId);
      await sb.from("claims_upload_links").insert({
        id: linkId,
        claim_id: claimId,
        token_hash: await sha256Hex(token),
        expires_at: expires,
        created_by: user.id,
      });
      await history(sb, claimId, "נוצר קישור להעלאת מסמכים", "", actorName);
      return jsonResponse({ success: true, token, expiresAt: expires, id: linkId });
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
      const { data } = await sb.from("claims_upload_links").select("id, claim_id, token_hash, expires_at, revoked_at, created_at").eq("claim_id", claimId).is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!data) return jsonResponse({ success: true, link: null });
      const reconstructable = await isReconstructableLink(data.id, data.claim_id, data.token_hash);
      return jsonResponse({
        success: true,
        link: {
          id: data.id,
          expires_at: data.expires_at,
          revoked_at: data.revoked_at,
          created_at: data.created_at,
          reconstructable,
        },
      });
    }

    if (action === "reveal_link") {
      const claimId = String(body.claim_id || url.searchParams.get("claim_id") || "");
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      const { data } = await sb.from("claims_upload_links").select("id, claim_id, token_hash, expires_at, revoked_at, created_at").eq("claim_id", claimId).is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!data) return jsonResponse({ success: true, reconstructable: false, token: null, link: null });
      if (data.revoked_at) return jsonResponse({ success: false, error: "revoked" }, 410);
      if (new Date(data.expires_at).getTime() < Date.now()) return jsonResponse({ success: false, error: "expired" }, 410);
      const token = await mintUploadToken(data.id, data.claim_id);
      if ((await sha256Hex(token)) !== data.token_hash) {
        return jsonResponse({
          success: true,
          reconstructable: false,
          token: null,
          id: data.id,
          expiresAt: data.expires_at,
          createdAt: data.created_at,
        });
      }
      return jsonResponse({
        success: true,
        reconstructable: true,
        token,
        id: data.id,
        expiresAt: data.expires_at,
        createdAt: data.created_at,
      });
    }

    if (action === "create_share") {
      const claimId = String(body.claim_id || "");
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      const recipientName = String(body.recipient_name || "").trim().slice(0, 160);
      const recipientKind = String(body.recipient_kind || "").trim();
      const recipientNote = String(body.recipient_kind_note || "").trim().slice(0, 160);
      const recipientEmail = String(body.recipient_email || "").trim().slice(0, 200);
      const recipientPhone = String(body.recipient_phone || "").trim().slice(0, 40);
      const fileIds = parseShareIds(body.file_ids);
      if (!recipientName) return jsonResponse({ success: false, error: "recipient_required" }, 400);
      if (!SHARE_KINDS.has(recipientKind)) return jsonResponse({ success: false, error: "recipient_kind_required" }, 400);
      if (!fileIds.length) return jsonResponse({ success: false, error: "files_required" }, 400);
      const { data: claimFiles } = await sb.from("claims_documents").select("id, claim_id, original_name").eq("claim_id", claimId).in("id", fileIds);
      const found = claimFiles || [];
      if (found.length !== fileIds.length || found.some((f) => f.claim_id !== claimId)) {
        return blocked("BLOCKED");
      }
      let expiresAt = "";
      const custom = String(body.expires_at || "").trim();
      const hours = Number(body.ttl_hours || 0);
      if (custom) {
        const t = Date.parse(custom);
        if (!Number.isFinite(t) || t < Date.now() + 60_000) return jsonResponse({ success: false, error: "expires_invalid" }, 400);
        if (t > Date.now() + 90 * 86_400_000) return jsonResponse({ success: false, error: "expires_invalid" }, 400);
        expiresAt = new Date(t).toISOString();
      } else if ([24, 48, 72, 168].includes(hours)) {
        expiresAt = new Date(Date.now() + hours * 3600_000).toISOString();
      } else {
        expiresAt = new Date(Date.now() + 48 * 3600_000).toISOString();
      }
      const token = randomShareToken();
      const shareId = nid("SHR");
      const { error: insErr } = await sb.from("claims_share_links").insert({
        id: shareId,
        claim_id: claimId,
        token_hash: await sha256Hex(token),
        recipient_name: recipientName,
        recipient_kind: recipientKind,
        recipient_kind_note: recipientNote,
        recipient_email: recipientEmail,
        recipient_phone: recipientPhone,
        file_ids: fileIds,
        expires_at: expiresAt,
        created_by: user.id,
        created_by_name: actorName,
      });
      if (insErr) return jsonResponse({ success: false, error: insErr.message }, 400);
      await history(sb, claimId, "נוצר שיתוף מאובטח", `${recipientName} · ${recipientKind} · ${fileIds.length} קבצים · עד ${expiresAt}`, actorName);
      return jsonResponse({
        success: true,
        id: shareId,
        token,
        expiresAt,
        fileCount: fileIds.length,
        once: true,
      });
    }

    if (action === "list_shares") {
      const claimId = String(body.claim_id || url.searchParams.get("claim_id") || "");
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      const { data } = await sb.from("claims_share_links").select("id, claim_id, recipient_name, recipient_kind, recipient_kind_note, recipient_email, recipient_phone, file_ids, expires_at, revoked_at, created_by_name, created_at, opened_at, last_download_at, open_count").eq("claim_id", claimId).order("created_at", { ascending: false }).limit(80);
      const ids = [...new Set((data || []).flatMap((s) => parseShareIds(s.file_ids)))];
      const { data: files } = ids.length
        ? await sb.from("claims_documents").select("id, original_name").eq("claim_id", claimId).in("id", ids)
        : { data: [] as Array<{ id: string; original_name: string }> };
      const names = new Map((files || []).map((f) => [f.id, f.original_name]));
      const now = Date.now();
      return jsonResponse({
        success: true,
        shares: (data || []).map((s) => {
          const fids = parseShareIds(s.file_ids);
          const st = s.revoked_at ? "revoked" : (new Date(s.expires_at).getTime() <= now ? "expired" : "active");
          return {
            id: s.id,
            recipient_name: s.recipient_name,
            recipient_kind: s.recipient_kind,
            recipient_kind_note: s.recipient_kind_note,
            recipient_email: s.recipient_email,
            recipient_phone: s.recipient_phone,
            file_ids: fids,
            file_names: fids.map((id) => names.get(id) || id),
            expires_at: s.expires_at,
            revoked_at: s.revoked_at,
            created_by_name: s.created_by_name,
            created_at: s.created_at,
            opened_at: s.opened_at,
            last_download_at: s.last_download_at,
            open_count: s.open_count,
            status: st,
          };
        }),
      });
    }

    if (action === "revoke_share") {
      const claimId = String(body.claim_id || "");
      const shareId = String(body.share_id || "");
      if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden" }, 403);
      const { data } = await sb.from("claims_share_links").select("id, claim_id, recipient_name").eq("id", shareId).eq("claim_id", claimId).maybeSingle();
      if (!data) return blocked("BLOCKED");
      await sb.from("claims_share_links").update({ revoked_at: new Date().toISOString() }).eq("id", shareId).eq("claim_id", claimId);
      await history(sb, claimId, "בוטל שיתוף מאובטח", data.recipient_name || shareId, actorName);
      return jsonResponse({ success: true });
    }

    if (action === "reveal_share") {
      return jsonResponse({ success: false, error: "reveal_share_disabled", hint: "הקישור מוצג פעם אחת ביצירה. אם אבד — בטל וצור שיתוף חדש." }, 400);
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
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(file.storage_path, SIGNED_TTL_SEC);
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
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(rows.map((f) => f.storage_path), SIGNED_TTL_SEC);
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
      const staffType = String(form?.get("staff_type") || "");
      const staffTitle = String(form?.get("staff_title") || "").trim().slice(0, 120);
      if (staffType && !STAFF_TYPES.has(staffType)) return jsonResponse({ success: false, error: "invalid_staff_type" }, 400);
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
        doc_kind: staffType === "garage_photos" ? "garage_photo" : kindFromUpload(reqKey, storedMime, explicitKind),
        doc_meta: {
          ...(staffType ? { staff_type: staffType } : {}),
          ...(staffTitle ? { staff_title: staffTitle } : {}),
        },
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
