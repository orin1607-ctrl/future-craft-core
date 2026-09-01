/**
 * Claims Gmail — Staging only.
 * OAuth tokens stay on the server. Manual claim send only after Preview + explicit SEND.
 * No automatic / scheduled send. No mailbox mutation of existing mail.
 */
import { edgeCorsHeaders, requireAuth, jsonResponse } from "../_shared/edgeAuth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { matchIncomingMail, type MatchClaim } from "./matchIncoming.ts";

const ALLOWED_ACCOUNT = "yoni122222@gmail.com";
const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
];
const BUCKET = "claims-docs";
const MAX_ATTACH = 400;
const MAX_BYTES = 12 * 1024 * 1024;
const BATCH = 12;
const PACKAGE_LIMIT = 18 * 1024 * 1024;
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/i;

type Failure = { filename: string; reason: string };

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function nid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function htmlPage(title: string, body: string, ok = true) {
  return new Response(
    `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Heebo,Arial,sans-serif;background:#071022;color:#fff;padding:40px;text-align:center}
h1{color:${ok ? "#22c55e" : "#ef4444"}}p{line-height:1.6;color:#cbd5e1}</style></head>
<body><h1>${title}</h1><p>${body}</p></body></html>`,
    { headers: { ...edgeCorsHeaders, "Content-Type": "text/html; charset=utf-8" } },
  );
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

async function loadConnection(sb: ReturnType<typeof admin>) {
  const { data } = await sb.from("claims_gmail_connection").select("*").eq("id", "staging").maybeSingle();
  if (!data || data.revoked_at) return null;
  return data as {
    connected_email: string;
    refresh_token: string;
    scopes: string;
    revoked_at: string | null;
  };
}

async function googleAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("CLAIMS_GOOGLE_CLIENT_ID") || "",
      client_secret: Deno.env.get("CLAIMS_GOOGLE_CLIENT_SECRET") || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(json.error_description || json.error || "token_refresh_failed");
  return String(json.access_token);
}

async function loadMatchClaims(sb: ReturnType<typeof admin>): Promise<MatchClaim[]> {
  const { data: recs } = await sb.from("claims_records").select("id, plate, client_name, row_data, gmail_thread_id");
  const { data: imps } = await sb.from("claims_gmail_imports").select("claim_id, gmail_thread_id");
  const threads: Record<string, string[]> = {};
  for (const i of imps || []) {
    const cid = String(i.claim_id || "");
    if (!cid || !i.gmail_thread_id) continue;
    (threads[cid] ||= []).push(String(i.gmail_thread_id));
  }
  return (recs || []).map((r) => {
    const rd = (r.row_data && typeof r.row_data === "object") ? r.row_data as Record<string, string> : {};
    return {
      id: String(r.id),
      claimNum: String(rd.claimNum || r.id || ""),
      plate: String(r.plate || rd.plate || ""),
      eventDate: String(rd.eventDate || ""),
      clientName: String(r.client_name || rd.clientName || ""),
      insCompany: String(rd.insCompany || ""),
      policyNum: String(rd.policyNum || ""),
      surveyor: String(rd.surveyor || ""),
      threads: [...new Set([String(r.gmail_thread_id || ""), ...(threads[String(r.id)] || [])].filter(Boolean))],
    };
  });
}

async function gmailGet(access: string, path: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `gmail ${res.status}`);
  return json;
}

function header(headers: Array<{ name?: string; value?: string }> | undefined, name: string) {
  return (headers || []).find((h) => (h.name || "").toLowerCase() === name.toLowerCase())?.value || "";
}

function b64urlToBytes(data: string) {
  const pad = data.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256HexBytes(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function guessDocKind(filename: string, mime: string, subject: string) {
  const fileHay = `${filename || ""}`.toLowerCase();
  const subj = `${subject || ""}`.toLowerCase();
  const img = String(mime || "").startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(fileHay);
  const surv = /שמאי|שמאות|survey/.test(subj) || /שמאי|שמאות|survey/.test(fileHay);
  const invoice = /חשבונ|invoice|קבלה|receipt/.test(fileHay) || /חשבונ|invoice/.test(subj);
  const garage = /מוסך|garage/.test(fileHay) || /מוסך/.test(subj);
  if (invoice && garage) return "garage_invoice";
  if (surv && img) return "surveyor_photo";
  if (surv && !img) return "surveyor_report";
  return "general";
}

function bytesToB64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesToB64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function walkParts(part: Record<string, unknown>, acc: Array<Record<string, unknown>>) {
  acc.push(part);
  const parts = part.parts as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(parts)) parts.forEach((p) => walkParts(p, acc));
}

function decodeBody(part: Record<string, unknown> | undefined) {
  const data = (part?.body as { data?: string } | undefined)?.data;
  if (!data) return "";
  try {
    return new TextDecoder().decode(b64urlToBytes(data));
  } catch {
    return "";
  }
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|blockquote|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function decodePartBody(access: string, messageId: string, part: Record<string, unknown> | undefined) {
  if (!part) return "";
  const body = (part.body || {}) as { data?: string; attachmentId?: string };
  if (body.data) {
    try { return new TextDecoder().decode(b64urlToBytes(body.data)); } catch { return ""; }
  }
  if (body.attachmentId) {
    try {
      const att = await gmailGet(access, `messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(body.attachmentId)}`);
      return new TextDecoder().decode(b64urlToBytes(String(att.data || "")));
    } catch {
      return "";
    }
  }
  return "";
}

function mimeOf(p: Record<string, unknown>) {
  return String(p.mimeType || "").toLowerCase();
}

async function extractMailBody(
  access: string,
  messageId: string,
  payload: Record<string, unknown> | undefined,
  parts: Array<Record<string, unknown>>,
  snippet = "",
) {
  let html = "";
  let text = "";
  for (const p of parts) {
    const mime = mimeOf(p);
    if (mime.startsWith("text/html")) {
      const d = await decodePartBody(access, messageId, p);
      if (d.length > html.length) html = d;
    } else if (mime.startsWith("text/plain") && !String(p.filename || "").trim()) {
      const d = await decodePartBody(access, messageId, p);
      if (d.length > text.length) text = d;
    }
  }
  const fromHtml = html ? htmlToText(html) : "";
  const fromText = text.replace(/^[\s\r\n]+$/, "").trim();
  const readable = (fromHtml.length >= fromText.length ? fromHtml : fromText) || fromHtml || fromText;
  if (readable) return { bodyText: readable.slice(0, 20000), bodyHtml: html.slice(0, 40000) };
  const root = payload ? await decodePartBody(access, messageId, payload) : "";
  const rootText = htmlToText(root) || root.replace(/^[\s\r\n]+$/, "").trim();
  if (rootText) return { bodyText: rootText.slice(0, 20000), bodyHtml: html.slice(0, 40000) };
  const snip = String(snippet || "").trim();
  if (snip) return { bodyText: snip.slice(0, 20000), bodyHtml: html.slice(0, 40000) };
  if (html.trim() || text.trim()) {
    const note = "המייל התקבל ללא טקסט בגוף — רק מצורפים.\n\n--- מקור HTML מהמייל ---\n" + html.slice(0, 4000);
    return { bodyText: note.slice(0, 20000), bodyHtml: html.slice(0, 40000), emptyBody: true };
  }
  return { bodyText: "", bodyHtml: html.slice(0, 40000) };
}

function collectFiles(parts: Array<Record<string, unknown>>) {
  const out: Array<{ filename: string; mime: string; attachmentId: string; inline?: string; part: Record<string, unknown> }> = [];
  let unnamed = 0;
  for (const p of parts) {
    const mime = String(p.mimeType || "");
    if (mime.startsWith("text/plain") || mime.startsWith("text/html") || mime.startsWith("multipart/")) continue;
    const rawName = String(p.filename || "").trim();
    const body = (p.body || {}) as { attachmentId?: string; data?: string; size?: number };
    const attId = String(body.attachmentId || "");
    const inline = body.data || "";
    if (!rawName && !attId && !inline) continue;
    if (!rawName && !(attId || inline) ) continue;
    if (!rawName && !ALLOWED_MIME.test(mime) && !mime.startsWith("image/") && mime !== "application/pdf") continue;
    unnamed += rawName ? 0 : 1;
    const ext = mime.includes("pdf") ? "pdf" : mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const filename = rawName || `image-${unnamed}.${ext}`;
    out.push({ filename, mime: mime || "application/octet-stream", attachmentId: attId, inline, part: p });
  }
  return out.slice(0, MAX_ATTACH);
}

function sanitizeName(name: string) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 60) || "file";
  return ext ? `${safe}.${ext}` : safe;
}

function rfc2047(s: string) {
  if (!s) return "";
  if (/^[\x20-\x7E]+$/.test(s)) return s;
  return `=?UTF-8?B?${bytesToB64(new TextEncoder().encode(s))}?=`;
}

function packageSuggestion(bytes: number) {
  if (bytes <= PACKAGE_LIMIT) return "";
  return "הקבצים גדולים מדי לשליחה במייל. בחר פחות קבצים, פצל למספר מיילים, או שלח קישור מאובטח — לא אוטומטית.";
}

function splitPlan(files: Array<{ id: string; name: string; bytes: number }>, limit = PACKAGE_LIMIT) {
  const groups: Array<{ bytes: number; files: Array<{ id: string; name: string; bytes: number }>; tooLargeSingle?: boolean }> = [];
  let cur: Array<{ id: string; name: string; bytes: number }> = [];
  let bytes = 0;
  for (const f of files) {
    const b = Number(f.bytes || 0);
    if (b > limit) {
      if (cur.length) {
        groups.push({ files: cur, bytes });
        cur = [];
        bytes = 0;
      }
      groups.push({ files: [f], bytes: b, tooLargeSingle: true });
      continue;
    }
    if (cur.length && bytes + b > limit) {
      groups.push({ files: cur, bytes });
      cur = [];
      bytes = 0;
    }
    cur.push(f);
    bytes += b;
  }
  if (cur.length) groups.push({ files: cur, bytes });
  return groups;
}

async function isSendEnabled(sb: ReturnType<typeof admin>) {
  const { data } = await sb.from("claims_config").select("value").eq("key", "GMAIL_SEND_ENABLED").maybeSingle();
  return String(data?.value || "") === "true";
}

function stripMailNoise(raw: string) {
  return String(raw || "")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u00ad\u200b-\u200d\ufeff]/g, "")
    .replace(/\uFF20/g, "@")
    .replace(/[\uFF0E\uFF61]/g, ".")
    .trim();
}

function parseEmailListStrict(raw: string, required: boolean) {
  const parts = stripMailNoise(raw).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) {
    return required
      ? { ok: false as const, emails: [] as string[], error: "to_required" }
      : { ok: true as const, emails: [] as string[] };
  }
  const emails: string[] = [];
  const re = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  for (const p of parts) {
    if (!re.test(p)) {
      return { ok: false as const, emails: [] as string[], error: required ? "to_required" : "cc_invalid" };
    }
    emails.push(p.toLowerCase());
  }
  return { ok: true as const, emails };
}

function hasInternalLeak(text: string) {
  return /היסטוריה פנימית — לא לשלוח לחברת ביטוח|היסטוריה פנימית — לא לשלוח/i.test(String(text || ""));
}

function parseEmails(raw: string): string[] {
  return String(raw || "")
    .split(/[,;]/)
    .map((s) => {
      const m = String(s).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      return (m?.[0] || "").toLowerCase();
    })
    .filter(Boolean);
}

function assertSelfAllowlist(raw: string, required: boolean) {
  const emails = parseEmails(raw);
  if (!emails.length) return required ? { ok: false as const, emails, error: "recipient_required" } : { ok: true as const, emails };
  if (emails.some((e) => e !== ALLOWED_ACCOUNT)) {
    return { ok: false as const, emails, error: "recipient_not_allowlisted" };
  }
  return { ok: true as const, emails };
}

async function gmailPost(access: string, path: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}

async function encodeMixedMessage(
  sb: ReturnType<typeof admin>,
  opts: {
    to: string;
    cc: string;
    subject: string;
    text: string;
    extraHeaders?: string[];
    files: Array<{ id: string; original_name: string; mime_type: string; byte_size: number; storage_path: string }>;
  },
) {
  const packageBytes = opts.files.reduce((s, f) => s + Number(f.byte_size || 0), 0);
  if (packageBytes > PACKAGE_LIMIT) {
    return { error: "package_too_large" as const, packageBytes };
  }
  const boundary = `mix_${crypto.randomUUID().replace(/-/g, "")}`;
  const chunks: string[] = [
    `To: ${opts.to}`,
    ...(opts.cc ? [`Cc: ${opts.cc}`] : []),
    `Subject: ${rfc2047(opts.subject)}`,
    ...(opts.extraHeaders || []),
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    bytesToB64(new TextEncoder().encode(opts.text)),
  ];
  const attached: Array<{ id: string; name: string; bytes: number }> = [];
  for (const f of opts.files) {
    const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(f.storage_path);
    if (dlErr || !blob) {
      return { error: "attachment_download_failed" as const, filename: f.original_name, reason: dlErr?.message || "empty" };
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mime = f.mime_type || "application/octet-stream";
    const safe = sanitizeName(f.original_name || "file");
    chunks.push(
      `--${boundary}`,
      `Content-Type: ${mime}; name="${safe}"`,
      `Content-Disposition: attachment; filename="${safe}"`,
      "Content-Transfer-Encoding: base64",
      "",
      bytesToB64(bytes),
    );
    attached.push({ id: f.id, name: f.original_name, bytes: bytes.byteLength });
  }
  chunks.push(`--${boundary}--`);
  const raw = chunks.join("\r\n");
  return {
    encoded: bytesToB64url(new TextEncoder().encode(raw)),
    attached,
    packageBytes,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: edgeCorsHeaders });
  const url = new URL(req.url);
  const sb = admin();

  if (req.method === "GET" && (url.searchParams.get("code") || url.searchParams.get("error"))) {
    const err = url.searchParams.get("error");
    if (err) return htmlPage("חיבור Gmail נכשל", `Google: ${err}`, false);
    return htmlPage(
      "קוד התקבל",
      "החיבור ל-Claims מתבצע ממסך האישור המקומי (127.0.0.1:4521), לא מדף זה. אפשר לסגור.",
      true,
    );
  }

  let body: Record<string, unknown> = {};
  try {
    if (req.method === "POST") body = await req.json();
  } catch {
    body = {};
  }
  const action = String(body.action || url.searchParams.get("action") || "status");

  if (action === "send" || action === "send_email" || action === "drafts.send" || action === "messages.send") {
    return jsonResponse({
      success: false,
      blocked: true,
      reason: "live_send_not_approved",
      realEmailSend: false,
    }, 403);
  }

  if (action === "scopes") {
    return jsonResponse({
      success: true,
      account: ALLOWED_ACCOUNT,
      realEmailSend: false,
      scopes: SCOPES.map((s) => ({ scope: s, why: whyScope(s) })),
      tokenStorage: "public.claims_gmail_connection.refresh_token — RLS, no GRANT to authenticated/anon; Edge service_role only",
      revoke: "Super Admin → בטל חיבור Gmail, plus Google Account → Third-party access",
      workerIsolation: "Workers never receive the Google token. They may import/list only inside a claim they can work.",
    });
  }

  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;
  const { user, role } = auth.ctx;
  if (!(await hasClaimsAccess(sb, user.id, role))) return jsonResponse({ success: false, error: "forbidden" }, 403);

  if (action === "status") {
    const conn = await loadConnection(sb);
    const { count: selfTestCount } = await sb.from("claims_gmail_outbox").select("id", { count: "exact", head: true }).eq("kind", "self_test");
    const sendEnabled = await isSendEnabled(sb);
    return jsonResponse({
      success: true,
      connected: !!conn,
      email: conn?.connected_email || null,
      accountExpected: ALLOWED_ACCOUNT,
      sendEnabled,
      realEmailSend: false,
      selfTestSendUsed: Number(selfTestCount || 0) > 0,
      scopes: SCOPES,
      canConnect: role === "super_admin",
      autoDispatch: false,
    });
  }

  if (action === "revoke") {
    if (role !== "super_admin") return jsonResponse({ success: false, error: "super_admin only" }, 403);
    const conn = await loadConnection(sb);
    if (conn?.refresh_token) {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: conn.refresh_token }),
      }).catch(() => undefined);
    }
    await sb.from("claims_gmail_connection").update({
      revoked_at: new Date().toISOString(),
      refresh_token: "revoked",
    }).eq("id", "staging");
    return jsonResponse({ success: true, connected: false, realEmailSend: false });
  }

  if (action === "list_imports") {
    const claimId = String(body.claim_id || "");
    if (!claimId || !(await canWork(sb, user.id, role, claimId))) {
      return jsonResponse({ success: false, error: "forbidden_claim" }, 403);
    }
    const { data } = await sb.from("claims_gmail_imports")
      .select("id, gmail_message_id, gmail_thread_id, from_addr, to_addr, cc_addr, subject, snippet, body_text, sent_at, attachment_count, found_count, imported_count, failed_count, failures, imported_by_name, created_at")
      .eq("claim_id", claimId)
      .order("sent_at", { ascending: true });
    return jsonResponse({ success: true, data: data || [] });
  }

  if (action === "package_preview") {
    const claimId = String(body.claim_id || "");
    if (!claimId || !(await canWork(sb, user.id, role, claimId))) {
      return jsonResponse({ success: false, error: "forbidden_claim" }, 403);
    }
    const ids = Array.isArray(body.file_ids) ? body.file_ids.map((x) => String(x)).filter(Boolean) : [];
    if (!ids.length) {
      return jsonResponse({
        success: true,
        packageBytes: 0,
        limitBytes: PACKAGE_LIMIT,
        overLimit: false,
        files: [],
        suggestion: "",
        realEmailSend: false,
      });
    }
    const { data: files } = await sb.from("claims_documents")
      .select("id, original_name, mime_type, byte_size")
      .eq("claim_id", claimId)
      .in("id", ids);
    const rows = files || [];
    const listed = rows.map((f) => ({ id: f.id, name: f.original_name, bytes: Number(f.byte_size || 0), mime: f.mime_type }));
    const packageBytes = listed.reduce((s, f) => s + f.bytes, 0);
    const overLimit = packageBytes > PACKAGE_LIMIT;
    const split = splitPlan(listed);
    return jsonResponse({
      success: true,
      packageBytes,
      limitBytes: PACKAGE_LIMIT,
      overLimit,
      files: listed,
      missing: ids.filter((id) => !rows.some((f) => f.id === id)),
      suggestion: packageSuggestion(packageBytes),
      split: split.map((g, i) => ({
        index: i + 1,
        bytes: g.bytes,
        tooLargeSingle: g.tooLargeSingle === true,
        file_ids: g.files.map((f) => f.id),
        names: g.files.map((f) => f.name),
      })),
      omitted: false,
      realEmailSend: false,
    });
  }

  if (action === "validate_claim_send") {
    const claimId = String(body.claim_id || "");
    if (!claimId || !(await canWork(sb, user.id, role, claimId))) {
      return jsonResponse({ success: false, error: "forbidden_claim", realEmailSend: false }, 403);
    }
    const toCheck = parseEmailListStrict(String(body.to || ""), true);
    const ccCheck = parseEmailListStrict(String(body.cc || ""), false);
    if (!toCheck.ok) return jsonResponse({ success: false, error: toCheck.error, realEmailSend: false }, 400);
    if (!ccCheck.ok) return jsonResponse({ success: false, error: ccCheck.error, realEmailSend: false }, 400);
    const to = toCheck.emails.join(", ");
    const cc = ccCheck.emails.join(", ");
    const subject = String(body.subject || "").trim();
    const text = String(body.body || "").trim();
    const ids = Array.isArray(body.file_ids) ? body.file_ids.map((x) => String(x)).filter(Boolean) : [];
    if (!subject) return jsonResponse({ success: false, error: "subject_required", realEmailSend: false }, 400);
    if (!text) return jsonResponse({ success: false, error: "body_required", realEmailSend: false }, 400);
    if (hasInternalLeak(text)) {
      return jsonResponse({ success: false, error: "internal_content_blocked", realEmailSend: false }, 400);
    }
    const { data: fileRows } = ids.length
      ? await sb.from("claims_documents")
        .select("id, original_name, mime_type, byte_size")
        .eq("claim_id", claimId)
        .in("id", ids)
      : { data: [] as Array<{ id: string; original_name: string; mime_type: string; byte_size: number }> };
    const rows = fileRows || [];
    const missing = ids.filter((id) => !rows.some((f) => f.id === id));
    if (missing.length) {
      return jsonResponse({ success: false, error: "files_not_on_claim", missing, omitted: false, realEmailSend: false }, 400);
    }
    const files = rows.map((f) => ({ id: f.id, name: f.original_name, bytes: Number(f.byte_size || 0) }));
    const packageBytes = files.reduce((s, f) => s + f.bytes, 0);
    const overLimit = packageBytes > PACKAGE_LIMIT;
    return jsonResponse({
      success: !overLimit,
      error: overLimit ? "package_too_large" : undefined,
      preview: {
        from: ALLOWED_ACCOUNT,
        to,
        cc: cc || null,
        subject,
        body: text,
        files,
        fileCount: files.length,
        packageBytes,
      },
      overLimit,
      omitted: false,
      suggestion: packageSuggestion(packageBytes),
      split: splitPlan(files).map((g, i) => ({
        index: i + 1,
        bytes: g.bytes,
        tooLargeSingle: g.tooLargeSingle === true,
        file_ids: g.files.map((f) => f.id),
        names: g.files.map((f) => f.name),
      })),
      sendEnabled: await isSendEnabled(sb),
      realEmailSend: false,
    }, overLimit ? 413 : 200);
  }

  if (action === "match_dry_run") {
    const mail = (body.mail && typeof body.mail === "object") ? body.mail as Record<string, unknown> : {};
    const claimsIn = Array.isArray(body.claims) && body.claims.length
      ? body.claims as MatchClaim[]
      : await loadMatchClaims(sb);
    const result = matchIncomingMail({
      messageId: String(mail.messageId || "dry"),
      threadId: String(mail.threadId || ""),
      subject: String(mail.subject || ""),
      body: String(mail.body || ""),
      from: String(mail.from || ""),
      filenames: Array.isArray(mail.filenames) ? mail.filenames.map((x) => String(x)) : [],
    }, claimsIn);
    return jsonResponse({ success: true, result, mailboxMutated: false, realEmailSend: false });
  }

  if (action === "list_pending") {
    const { data } = await sb.from("claims_gmail_pending")
      .select("id, gmail_message_id, gmail_thread_id, from_addr, subject, snippet, sent_at, decision, reason, via, candidates, assigned_claim_id, imported_at, created_at")
      .order("created_at", { ascending: false })
      .limit(80);
    return jsonResponse({ success: true, data: data || [], mailboxMutated: false, realEmailSend: false });
  }

  if (action === "assign_pending") {
    const pendingId = String(body.pending_id || "");
    const claimId = String(body.claim_id || "");
    if (!pendingId || !claimId) return jsonResponse({ success: false, error: "pending_id and claim_id required" }, 400);
    if (!(await canWork(sb, user.id, role, claimId))) return jsonResponse({ success: false, error: "forbidden_claim" }, 403);
    const { data: row } = await sb.from("claims_gmail_pending").select("id, gmail_message_id, assigned_claim_id, imported_at").eq("id", pendingId).maybeSingle();
    if (!row) return jsonResponse({ success: false, error: "not_found" }, 404);
    if (row.imported_at) {
      return jsonResponse({ success: false, error: "already_imported", claim_id: row.assigned_claim_id, mailboxMutated: false, realEmailSend: false }, 409);
    }
    await sb.from("claims_gmail_pending").update({ assigned_claim_id: claimId, decision: "manual" }).eq("id", pendingId);
    return jsonResponse({
      success: true,
      claim_id: claimId,
      message_id: row.gmail_message_id,
      mailboxMutated: false,
      realEmailSend: false,
    });
  }

  const conn = await loadConnection(sb);
  if (!conn) return jsonResponse({ success: false, error: "gmail_not_connected" }, 409);
  if (conn.connected_email.toLowerCase() !== ALLOWED_ACCOUNT) {
    return jsonResponse({ success: false, error: "wrong_account", email: conn.connected_email }, 403);
  }

  let access = "";
  try {
    access = await googleAccessToken(conn.refresh_token);
    await sb.from("claims_gmail_connection").update({ last_ok_at: new Date().toISOString() }).eq("id", "staging");
  } catch (e) {
    return jsonResponse({ success: false, error: String((e as Error).message || e) }, 400);
  }

  if (action === "scan_inbox") {
    const dry = body.dry === true;
    const listed = await gmailGet(access, `messages?maxResults=15&q=${encodeURIComponent("in:inbox newer_than:2d")}`);
    const ids = ((listed.messages || []) as Array<{ id?: string }>).map((m) => String(m.id || "")).filter(Boolean).slice(0, 15);
    const { data: importedRows } = await sb.from("claims_gmail_imports").select("gmail_message_id");
    const importedSet = new Set((importedRows || []).map((r) => String(r.gmail_message_id || "")).filter(Boolean));
    const { data: pendingRows } = await sb.from("claims_gmail_pending").select("id, gmail_message_id, imported_at, decision");
    const pendingByMsg = new Map((pendingRows || []).map((r) => [String(r.gmail_message_id), r]));
    const claims = await loadMatchClaims(sb);
    const auto: Array<Record<string, unknown>> = [];
    const needsReview: Array<Record<string, unknown>> = [];
    let skippedImported = 0;
    let skippedPending = 0;
    for (const messageId of ids) {
      if (importedSet.has(messageId)) {
        skippedImported += 1;
        continue;
      }
      const existingPending = pendingByMsg.get(messageId);
      if (existingPending?.imported_at) {
        skippedImported += 1;
        continue;
      }
      if (existingPending && !dry) {
        skippedPending += 1;
        continue;
      }
      const full = await gmailGet(access, `messages/${encodeURIComponent(messageId)}?format=full`);
      const headers = full.payload?.headers as Array<{ name?: string; value?: string }> | undefined;
      const parts: Array<Record<string, unknown>> = [];
      if (full.payload) walkParts(full.payload as Record<string, unknown>, parts);
      const files = collectFiles(parts);
      const extracted = await extractMailBody(access, messageId, full.payload as Record<string, unknown>, parts, String(full.snippet || ""));
      const fromAddr = header(headers, "From");
      const subject = header(headers, "Subject");
      const sentAt = full.internalDate ? new Date(Number(full.internalDate)).toISOString() : null;
      const match = matchIncomingMail({
        messageId,
        threadId: String(full.threadId || ""),
        subject,
        body: extracted.bodyText,
        from: fromAddr,
        filenames: files.map((f) => f.filename),
      }, claims);
      const pendingId = `GIP-${messageId}`.slice(0, 80);
      const row = {
        id: pendingId,
        gmail_message_id: messageId,
        gmail_thread_id: String(full.threadId || ""),
        from_addr: fromAddr,
        subject,
        snippet: String(full.snippet || extracted.bodyText.slice(0, 180)),
        sent_at: sentAt,
        decision: match.decision,
        reason: match.reason,
        via: match.via || null,
        candidates: match.candidates,
        assigned_claim_id: match.decision === "auto" ? (match.claimId || null) : null,
      };
      const item = {
        pending_id: pendingId,
        message_id: messageId,
        thread_id: String(full.threadId || ""),
        from: fromAddr,
        subject,
        sent_at: sentAt,
        claim_id: match.claimId || null,
        ...match,
      };
      if (match.decision === "auto" && match.claimId) auto.push(item);
      else needsReview.push(item);
      if (dry) continue;
      await sb.from("claims_gmail_pending").upsert(row, { onConflict: "gmail_message_id" });
      const ntfId = nid("NTF");
      const claimLabel = match.claimId || "";
      const whenHe = sentAt ? new Date(sentAt).toLocaleString("he-IL") : new Date().toLocaleString("he-IL");
      const message = match.decision === "auto" && match.claimId
        ? `מייל חדש התקבל בתביעה ${claimLabel}\nשולח: ${fromAddr}\nנושא: ${subject || "(ללא נושא)"}\nשעה: ${whenHe}`
        : `מייל חדש דורש בדיקת שיוך\nשולח: ${fromAddr}\nנושא: ${subject || "(ללא נושא)"}\nשעה: ${whenHe}`;
      await sb.from("claims_notifications").insert({
        id: ntfId,
        claim_id: match.claimId || null,
        row_data: {
          id: ntfId,
          claimId: match.claimId || "",
          type: match.decision === "auto" ? "gmail_auto" : "gmail_review",
          message,
          read: "false",
          createdAt: new Date().toLocaleString("he-IL"),
          from: fromAddr,
          subject,
          pendingId,
          gmail_message_id: messageId,
        },
      });
    }
    return jsonResponse({
      success: true,
      dry,
      scanned: ids.length,
      auto,
      needs_review: needsReview,
      skippedImported,
      skippedPending,
      mailboxMutated: false,
      realEmailSend: false,
      scheduler: false,
      oauthChanged: false,
    });
  }

  if (action === "list_messages") {
    const claimId = String(body.claim_id || "");
    if (!claimId || !(await canWork(sb, user.id, role, claimId))) {
      return jsonResponse({ success: false, error: "forbidden_claim" }, 403);
    }
    const q = String(body.q || "newer_than:30d").slice(0, 180);
    const listed = await gmailGet(access, `messages?maxResults=20&q=${encodeURIComponent(q)}`);
    const messages: Array<Record<string, unknown>> = [];
    for (const m of (listed.messages || []).slice(0, 20)) {
      const full = await gmailGet(access, `messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`);
      const headers = full.payload?.headers as Array<{ name?: string; value?: string }> | undefined;
      messages.push({
        id: full.id,
        threadId: full.threadId,
        from: header(headers, "From"),
        subject: header(headers, "Subject"),
        date: header(headers, "Date"),
        snippet: full.snippet || "",
        attachmentsApprox: Number(full.payload?.mimeType?.includes("multipart") ? 1 : 0),
      });
    }
    return jsonResponse({ success: true, messages, mailboxMutated: false, realEmailSend: false });
  }

  if (action === "enrich_headers") {
    const claimId = String(body.claim_id || "");
    if (!claimId || !(await canWork(sb, user.id, role, claimId))) {
      return jsonResponse({ success: false, error: "forbidden_claim" }, 403);
    }
    const { data: rows } = await sb.from("claims_gmail_imports")
      .select("id, gmail_message_id")
      .eq("claim_id", claimId);
    const existing = rows || [];
    let updated = 0;
    let missing = 0;
    const errors: Array<{ id: string; error: string }> = [];
    for (const row of existing) {
      const messageId = String(row.gmail_message_id || "");
      if (!messageId) continue;
      try {
        const full = await gmailGet(
          access,
          `messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`,
        );
        const headers = full.payload?.headers as Array<{ name?: string; value?: string }> | undefined;
        const patch: Record<string, string | null> = {
          to_addr: header(headers, "To") || null,
          cc_addr: header(headers, "Cc") || null,
        };
        if (header(headers, "From")) patch.from_addr = header(headers, "From");
        const { data: touched, error: upErr } = await sb.from("claims_gmail_imports")
          .update(patch)
          .eq("id", row.id)
          .eq("claim_id", claimId)
          .eq("gmail_message_id", messageId)
          .select("id");
        if (upErr) errors.push({ id: row.id, error: upErr.message });
        else if (touched?.length) updated += 1;
      } catch (e) {
        missing += 1;
        errors.push({ id: row.id, error: String((e as Error).message || e) });
      }
    }
    return jsonResponse({
      success: true,
      claim_id: claimId,
      existing: existing.length,
      updated,
      missing,
      inserted: 0,
      documentsTouched: 0,
      mailboxMutated: false,
      realEmailSend: false,
      errors: errors.slice(0, 20),
    });
  }

  if (action === "read_message") {
    const claimId = String(body.claim_id || "");
    if (!claimId || !(await canWork(sb, user.id, role, claimId))) {
      return jsonResponse({ success: false, error: "forbidden_claim" }, 403);
    }
    const messageId = String(body.message_id || "");
    if (!messageId) return jsonResponse({ success: false, error: "message_id required" }, 400);
    const full = await gmailGet(access, `messages/${encodeURIComponent(messageId)}?format=full`);
    const headers = full.payload?.headers as Array<{ name?: string; value?: string }> | undefined;
    const parts: Array<Record<string, unknown>> = [];
    if (full.payload) walkParts(full.payload as Record<string, unknown>, parts);
    const files = collectFiles(parts);
    const extracted = await extractMailBody(access, messageId, full.payload as Record<string, unknown>, parts, String(full.snippet || ""));
    return jsonResponse({
      success: true,
      message: {
        id: full.id,
        threadId: full.threadId,
        from: header(headers, "From"),
        to: header(headers, "To"),
        subject: header(headers, "Subject"),
        date: header(headers, "Date"),
        messageIdHeader: header(headers, "Message-ID") || header(headers, "Message-Id"),
        labelIds: Array.isArray(full.labelIds) ? full.labelIds : [],
        cc: header(headers, "Cc"),
        bodyText: extracted.bodyText,
        bodyHtml: extracted.bodyHtml?.slice(0, 4000) || "",
        partsMeta: parts.slice(0, 40).map((p) => ({
          mime: String(p.mimeType || ""),
          filename: String(p.filename || ""),
          size: Number((p.body as { size?: number } | undefined)?.size || 0),
          hasData: Boolean((p.body as { data?: string } | undefined)?.data),
        })),
        attachments: files.map((f) => ({
          filename: f.filename,
          mime: f.mime,
          size: Number((f.part.body as { size?: number } | undefined)?.size || 0),
          attachmentId: f.attachmentId,
        })),
      },
      mailboxMutated: false,
      realEmailSend: false,
    });
  }

  if (action === "import_message") {
    const claimId = String(body.claim_id || "");
    if (!claimId || !(await canWork(sb, user.id, role, claimId))) {
      return jsonResponse({ success: false, error: "forbidden_claim" }, 403);
    }
    const messageId = String(body.message_id || "");
    if (!messageId) return jsonResponse({ success: false, error: "message_id required" }, 400);
    const { data: existingImp } = await sb.from("claims_gmail_imports").select("claim_id").eq("gmail_message_id", messageId).limit(5);
    const otherClaim = (existingImp || []).find((r) => String(r.claim_id) !== claimId);
    if (otherClaim) {
      return jsonResponse({
        success: false,
        error: "already_imported_other_claim",
        existing_claim_id: otherClaim.claim_id,
        done: true,
        mailboxMutated: false,
        realEmailSend: false,
      }, 409);
    }
    const start = Number(body.start || 0) || 0;
    const { data: profile } = await sb.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const actorName = profile?.full_name || user.email || user.id;

    const full = await gmailGet(access, `messages/${encodeURIComponent(messageId)}?format=full`);
    const headers = full.payload?.headers as Array<{ name?: string; value?: string }> | undefined;
    const threadId = String(full.threadId || "");
    const subject = header(headers, "Subject");
    const parts: Array<Record<string, unknown>> = [];
    if (full.payload) walkParts(full.payload as Record<string, unknown>, parts);
    const files = collectFiles(parts);
    const extracted = await extractMailBody(access, messageId, full.payload as Record<string, unknown>, parts, String(full.snippet || ""));
    const importId = `GIM-${claimId}-${String(full.id)}`.slice(0, 80);

    if (start === 0) {
      await sb.from("claims_gmail_imports").upsert({
        id: importId,
        claim_id: claimId,
        gmail_message_id: String(full.id),
        gmail_thread_id: threadId,
        from_addr: header(headers, "From"),
        to_addr: header(headers, "To"),
        cc_addr: header(headers, "Cc") || null,
        subject,
        snippet: (full.snippet || extracted.bodyText.slice(0, 180)),
        body_text: extracted.bodyText,
        sent_at: full.internalDate ? new Date(Number(full.internalDate)).toISOString() : null,
        attachment_count: files.length,
        found_count: files.length,
        imported_count: 0,
        failed_count: 0,
        failures: [],
        imported_by: user.id,
        imported_by_name: actorName,
      }, { onConflict: "id" });
      const { data: rec } = await sb.from("claims_records").select("gmail_message_id").eq("id", claimId).maybeSingle();
      if (!rec?.gmail_message_id) {
        await sb.from("claims_records").update({
          gmail_message_id: String(full.id),
          gmail_thread_id: threadId,
          last_activity_at: new Date().toISOString(),
        }).eq("id", claimId);
      } else {
        await sb.from("claims_records").update({ last_activity_at: new Date().toISOString() }).eq("id", claimId);
      }
    } else if (extracted.bodyText) {
      await sb.from("claims_gmail_imports").update({
        body_text: extracted.bodyText,
        snippet: (full.snippet || extracted.bodyText.slice(0, 180)),
      }).eq("id", importId).eq("claim_id", claimId);
    }

    const { data: existingRows } = await sb.from("claims_documents").select("id, original_name, byte_size, gmail_attachment_id, gmail_message_id, content_sha256").eq("claim_id", claimId);
    const haveAtt = new Set((existingRows || []).map((r) => String(r.gmail_attachment_id || "")).filter(Boolean));
    const haveHash = new Set((existingRows || []).map((r) => String(r.content_sha256 || "")).filter(Boolean));
    const haveMsgAtt = new Set((existingRows || []).filter((r) => r.gmail_attachment_id).map((r) => `${r.gmail_message_id || ""}:${r.gmail_attachment_id}`));

    const slice = files.slice(start, Math.min(files.length, start + BATCH));
    let uploaded = 0;
    let skippedExisting = 0;
    const failures: Failure[] = [];
    for (const f of slice) {
      const filename = f.filename;
      const mime = f.mime;
      if ((f.attachmentId && haveAtt.has(f.attachmentId)) || haveMsgAtt.has(`${full.id}:${f.attachmentId || ""}`)) {
        skippedExisting += 1;
        continue;
      }
      let bytes: Uint8Array | null = null;
      try {
        if (f.inline) bytes = b64urlToBytes(f.inline);
        else if (f.attachmentId) {
          const att = await gmailGet(access, `messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(f.attachmentId)}`);
          bytes = b64urlToBytes(String(att.data || ""));
        }
      } catch (e) {
        failures.push({ filename, reason: `download_error: ${String((e as Error).message || e).slice(0, 180)}` });
        continue;
      }
      if (!bytes || bytes.byteLength === 0) {
        failures.push({ filename, reason: "empty" });
        continue;
      }
      if (bytes.byteLength > MAX_BYTES) {
        failures.push({ filename, reason: `too_large:${bytes.byteLength}` });
        continue;
      }
      if (mime && !ALLOWED_MIME.test(mime) && !/\.(jpg|jpeg|png|gif|webp|pdf|heic)$/i.test(filename)) {
        failures.push({ filename, reason: `mime_not_allowed:${mime || "unknown"}` });
        continue;
      }
      const digest = await sha256HexBytes(bytes);
      if (haveHash.has(digest)) {
        skippedExisting += 1;
        continue;
      }
      const path = `${claimId}/gmail/${full.id}/${nid("F")}-${sanitizeName(filename)}`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, {
        contentType: mime || "application/octet-stream",
        upsert: false,
      });
      if (upErr) {
        failures.push({ filename, reason: `upload_error:${upErr.message}` });
        continue;
      }
      const { error: insErr } = await sb.from("claims_documents").insert({
        id: nid("CDM"),
        claim_id: claimId,
        storage_path: path,
        original_name: filename,
        mime_type: mime,
        byte_size: bytes.byteLength,
        source: "gmail",
        gmail_message_id: String(full.id),
        gmail_thread_id: threadId,
        gmail_attachment_id: f.attachmentId || null,
        content_sha256: digest,
        doc_kind: guessDocKind(filename, mime, subject),
        uploaded_by: user.id,
        uploaded_by_name: actorName,
      });
      if (insErr) {
        failures.push({ filename, reason: `db_error:${insErr.message}` });
        continue;
      }
      uploaded += 1;
      if (f.attachmentId) haveAtt.add(f.attachmentId);
      haveHash.add(digest);
    }

    const next = start + slice.length;
    const done = next >= files.length;

    const { data: afterRows } = await sb.from("claims_documents")
      .select("original_name")
      .eq("claim_id", claimId)
      .eq("gmail_message_id", String(full.id));
    const importedCount = new Set((afterRows || []).map((r) => String(r.original_name || "").toLowerCase())).size;

    const { data: prevImp } = await sb.from("claims_gmail_imports").select("failures").eq("id", importId).maybeSingle();
    const prevFail = Array.isArray(prevImp?.failures) ? prevImp.failures as Failure[] : [];
    const allFail = [...prevFail, ...failures];
    await sb.from("claims_gmail_imports").update({
      found_count: files.length,
      imported_count: importedCount,
      failed_count: allFail.length,
      failures: allFail,
      attachment_count: files.length,
      body_text: extracted.bodyText || undefined,
    }).eq("id", importId);

    if (done) {
      await sb.from("claims_history").insert({
        id: nid("HIS"),
        claim_id: claimId,
        row_data: {
          action: "יובא מייל מ-Gmail כולל כל המצורפים",
          note: `${header(headers, "Subject")} · Found ${files.length} · Imported ${importedCount} · Failed ${allFail.length}`,
          type: "gmail_import",
          by: actorName,
          at: new Date().toLocaleString("he-IL"),
          gmail_message_id: full.id,
          gmail_thread_id: threadId,
        },
      });
      await sb.from("claims_gmail_pending").update({
        imported_at: new Date().toISOString(),
        assigned_claim_id: claimId,
      }).eq("gmail_message_id", String(full.id));
    }
    return jsonResponse({
      success: true,
      done,
      start: next,
      uploaded,
      skippedExisting,
      found: files.length,
      imported: importedCount,
      failed: allFail.length,
      failures: allFail,
      total: files.length,
      body_len: extracted.bodyText.length,
      gmail_message_id: full.id,
      gmail_thread_id: threadId,
      mailboxMutated: false,
      realEmailSend: false,
    });
  }

  if (action === "create_draft") {
    const claimId = String(body.claim_id || "");
    if (!claimId || !(await canWork(sb, user.id, role, claimId))) {
      return jsonResponse({ success: false, error: "forbidden_claim" }, 403);
    }
    const to = String(body.to || "").trim();
    const cc = String(body.cc || "").trim();
    const requestedSubject = String(body.subject || `טיוטה תביעה ${claimId}`);
    const subject = requestedSubject.includes("לא לשלוח") || requestedSubject.includes("STAGING-QA")
      ? requestedSubject
      : `[STAGING-QA-DO-NOT-SEND] ${requestedSubject}`;
    const text = `[STAGING QA — טיוטה בלבד, לא לשלוח לחברת ביטוח / עורך דין / לקוח]\n\n${String(body.body || "")}`;
    if (!to) return jsonResponse({ success: false, error: "to required" }, 400);

    const ids = Array.isArray(body.file_ids) ? body.file_ids.map((x) => String(x)).filter(Boolean) : [];
    const { data: fileRows } = ids.length
      ? await sb.from("claims_documents")
        .select("id, original_name, mime_type, byte_size, storage_path, claim_id")
        .eq("claim_id", claimId)
        .in("id", ids)
      : { data: [] as Array<{ id: string; original_name: string; mime_type: string; byte_size: number; storage_path: string; claim_id: string }> };
    const rows = fileRows || [];
    const missing = ids.filter((id) => !rows.some((f) => f.id === id));
    if (missing.length) {
      return jsonResponse({
        success: false,
        error: "files_not_on_claim",
        missing,
        realEmailSend: false,
      }, 400);
    }
    const packageBytes = rows.reduce((s, f) => s + Number(f.byte_size || 0), 0);
    if (packageBytes > PACKAGE_LIMIT) {
      return jsonResponse({
        success: false,
        error: "package_too_large",
        packageBytes,
        limitBytes: PACKAGE_LIMIT,
        suggestion: packageSuggestion(packageBytes),
        files: rows.map((f) => ({ id: f.id, name: f.original_name, bytes: Number(f.byte_size || 0) })),
        omitted: false,
        realEmailSend: false,
      }, 413);
    }

    const boundary = `mix_${crypto.randomUUID().replace(/-/g, "")}`;
    const chunks: string[] = [
      `To: ${to}`,
      ...(cc ? [`Cc: ${cc}`] : []),
      `Subject: ${rfc2047(subject)}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      bytesToB64(new TextEncoder().encode(text)),
    ];
    const attached: Array<{ id: string; name: string; bytes: number }> = [];
    for (const f of rows) {
      const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(f.storage_path);
      if (dlErr || !blob) {
        return jsonResponse({
          success: false,
          error: "attachment_download_failed",
          filename: f.original_name,
          reason: dlErr?.message || "empty",
          omitted: false,
          realEmailSend: false,
        }, 400);
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const mime = f.mime_type || "application/octet-stream";
      const safe = sanitizeName(f.original_name || "file");
      chunks.push(
        `--${boundary}`,
        `Content-Type: ${mime}; name="${safe}"`,
        `Content-Disposition: attachment; filename="${safe}"`,
        "Content-Transfer-Encoding: base64",
        "",
        bytesToB64(bytes),
      );
      attached.push({ id: f.id, name: f.original_name, bytes: bytes.byteLength });
    }
    chunks.push(`--${boundary}--`);
    const raw = chunks.join("\r\n");
    const encoded = bytesToB64url(new TextEncoder().encode(raw));
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { raw: encoded } }),
    });
    const json = await res.json();
    if (!res.ok) return jsonResponse({ success: false, error: json.error?.message || "draft_failed", realEmailSend: false }, 400);
    const { data: profile } = await sb.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    await sb.from("claims_history").insert({
      id: nid("HIS"),
      claim_id: claimId,
      row_data: {
        action: "נוצרה טיוטת Gmail (לא נשלח)",
        note: `${subject} · to ${to}${cc ? ` · cc ${cc}` : ""} · ${attached.length} קבצים · ${packageBytes} bytes`,
        type: "gmail_draft",
        by: profile?.full_name || user.email,
        at: new Date().toLocaleString("he-IL"),
        gmail_draft_id: json.id,
        gmail_message_id: json.message?.id,
        gmail_thread_id: json.message?.threadId,
      },
    });
    await sb.from("claims_records").update({
      last_activity_at: new Date().toISOString(),
    }).eq("id", claimId);
    return jsonResponse({
      success: true,
      draftId: json.id,
      gmail_message_id: json.message?.id || null,
      gmail_thread_id: json.message?.threadId || null,
      to,
      cc: cc || null,
      subject,
      packageBytes,
      attached,
      sent: false,
      realEmailSend: false,
    });
  }

  if (action === "send_self_test" || action === "reply_self_test") {
    if (role !== "super_admin") return jsonResponse({ success: false, error: "super_admin only", realEmailSend: false }, 403);
    const claimId = String(body.claim_id || "");
    if (!claimId || !(await canWork(sb, user.id, role, claimId))) {
      return jsonResponse({ success: false, error: "forbidden_claim", realEmailSend: false }, 403);
    }
    const isReply = action === "reply_self_test";
    const kind = isReply ? "self_test_reply" : "self_test";
    const toCheck = assertSelfAllowlist(String(body.to || ""), true);
    const ccRaw = String(body.cc || "").trim();
    const ccCheck = assertSelfAllowlist(ccRaw, false);
    if (!toCheck.ok) {
      return jsonResponse({ success: false, error: toCheck.error, emails: toCheck.emails, realEmailSend: false }, 403);
    }
    if (!ccCheck.ok) {
      return jsonResponse({ success: false, error: ccCheck.error, emails: ccCheck.emails, realEmailSend: false }, 403);
    }
    const to = ALLOWED_ACCOUNT;
    const cc = ccRaw ? ALLOWED_ACCOUNT : "";
    const requestedSubject = String(body.subject || "");
    if (!/test|בדיקה/i.test(requestedSubject)) {
      return jsonResponse({ success: false, error: "subject_must_include_TEST", realEmailSend: false }, 400);
    }
    const text = String(body.body || "").trim();
    if (!text) return jsonResponse({ success: false, error: "body required", realEmailSend: false }, 400);
    const ids = Array.isArray(body.file_ids) ? body.file_ids.map((x) => String(x)).filter(Boolean) : [];
    if (!isReply && (ids.length < 1 || ids.length > 3)) {
      return jsonResponse({ success: false, error: "self_test_requires_1_to_3_files", realEmailSend: false }, 400);
    }
    if (isReply && ids.length > 0) {
      return jsonResponse({ success: false, error: "reply_test_no_extra_files", realEmailSend: false }, 400);
    }

    const { data: existingKind } = await sb.from("claims_gmail_outbox").select("id, gmail_message_id").eq("kind", kind).maybeSingle();
    if (existingKind) {
      return jsonResponse({
        success: false,
        error: "already_sent",
        kind,
        existing_id: existingKind.id,
        gmail_message_id: existingKind.gmail_message_id,
        realEmailSend: false,
      }, 409);
    }

    let extraHeaders: string[] = [];
    let threadId: string | undefined;
    if (isReply) {
      const { data: orig } = await sb.from("claims_gmail_outbox").select("*").eq("kind", "self_test").maybeSingle();
      if (!orig?.gmail_message_id || !orig.gmail_thread_id) {
        return jsonResponse({ success: false, error: "original_self_test_missing", realEmailSend: false }, 400);
      }
      threadId = String(orig.gmail_thread_id);
      const origFull = await gmailGet(access, `messages/${encodeURIComponent(String(orig.gmail_message_id))}?format=metadata&metadataHeaders=Message-ID`);
      const origHeaders = origFull.payload?.headers as Array<{ name?: string; value?: string }> | undefined;
      const rfc = orig.rfc_message_id || header(origHeaders, "Message-ID") || header(origHeaders, "Message-Id");
      if (rfc) {
        extraHeaders = [`In-Reply-To: ${rfc}`, `References: ${rfc}`];
      }
    }

    const { data: fileRows } = ids.length
      ? await sb.from("claims_documents")
        .select("id, original_name, mime_type, byte_size, storage_path, claim_id")
        .eq("claim_id", claimId)
        .in("id", ids)
      : { data: [] as Array<{ id: string; original_name: string; mime_type: string; byte_size: number; storage_path: string; claim_id: string }> };
    const rows = fileRows || [];
    if (ids.length && rows.length !== ids.length) {
      return jsonResponse({ success: false, error: "files_not_on_claim", realEmailSend: false }, 400);
    }

    const encodedMsg = await encodeMixedMessage(sb, {
      to,
      cc,
      subject: requestedSubject,
      text,
      extraHeaders,
      files: rows,
    });
    if ("error" in encodedMsg && encodedMsg.error) {
      return jsonResponse({ success: false, ...encodedMsg, realEmailSend: false }, encodedMsg.error === "package_too_large" ? 413 : 400);
    }

    const sent = await gmailPost(access, "messages/send", {
      raw: (encodedMsg as { encoded: string }).encoded,
      ...(threadId ? { threadId } : {}),
    });
    if (!sent.ok) {
      return jsonResponse({
        success: false,
        error: sent.json?.error?.message || "gmail_send_failed",
        status: sent.status,
        realEmailSend: false,
      }, 400);
    }

    const gmailMessageId = String(sent.json.id || "");
    const gmailThreadId = String(sent.json.threadId || threadId || "");
    let rfcMessageId = "";
    let labelIds: string[] = [];
    try {
      const got = await gmailGet(access, `messages/${encodeURIComponent(gmailMessageId)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=From&metadataHeaders=Cc`);
      const hd = got.payload?.headers as Array<{ name?: string; value?: string }> | undefined;
      rfcMessageId = header(hd, "Message-ID") || header(hd, "Message-Id");
      labelIds = Array.isArray(got.labelIds) ? got.labelIds.map(String) : [];
    } catch {
      rfcMessageId = "";
    }

    const { data: profile } = await sb.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const actorName = profile?.full_name || user.email || user.id;
    const outId = nid(isReply ? "GOR" : "GOS");
    const attached = (encodedMsg as { attached: Array<{ id: string; name: string; bytes: number }> }).attached || [];
    const { error: outErr } = await sb.from("claims_gmail_outbox").insert({
      id: outId,
      claim_id: claimId,
      kind,
      gmail_message_id: gmailMessageId,
      gmail_thread_id: gmailThreadId,
      rfc_message_id: rfcMessageId || null,
      to_addr: to,
      cc_addr: cc || null,
      subject: requestedSubject,
      sender: ALLOWED_ACCOUNT,
      body_excerpt: text.slice(0, 500),
      file_ids: ids,
      sent_at: new Date().toISOString(),
      created_by: user.id,
    });
    if (outErr) {
      return jsonResponse({
        success: false,
        error: "outbox_insert_failed_mail_may_have_sent",
        gmail_message_id: gmailMessageId,
        gmail_thread_id: gmailThreadId,
        db: outErr.message,
        realEmailSend: true,
      }, 500);
    }

    await sb.from("claims_history").insert({
      id: nid("HIS"),
      claim_id: claimId,
      row_data: {
        action: isReply ? "Reply TEST נשלח (אותו thread, בלי שיוך אוטומטי)" : "נשלח מייל TEST אמיתי (רק לעצמי)",
        note: `${requestedSubject} · to ${to}${cc ? ` · cc ${cc}` : ""} · ${attached.length} קבצים`,
        type: isReply ? "gmail_self_test_reply" : "gmail_self_test_send",
        by: actorName,
        at: new Date().toLocaleString("he-IL"),
        gmail_message_id: gmailMessageId,
        gmail_thread_id: gmailThreadId,
        sender: ALLOWED_ACCOUNT,
        sent_at: new Date().toISOString(),
      },
    });
    await sb.from("claims_comm_log").insert({
      id: nid("COM"),
      claim_id: claimId,
      row_data: {
        id: nid("COM"),
        claimId,
        type: "mail",
        direction: "out",
        email: to,
        cc,
        subject: requestedSubject,
        body: text,
        at: new Date().toLocaleString("he-IL"),
        by: actorName,
        note: isReply ? "Reply TEST — לא שויך אוטומטית" : "LIVE SEND QA — יעד עצמי בלבד",
        gmail_message_id: gmailMessageId,
        gmail_thread_id: gmailThreadId,
        sender: ALLOWED_ACCOUNT,
        sent_at: new Date().toISOString(),
        attachments: attached.map((a) => a.name),
      },
    });
    await sb.from("claims_records").update({ last_activity_at: new Date().toISOString() }).eq("id", claimId);

    return jsonResponse({
      success: true,
      kind,
      sent: true,
      realEmailSend: true,
      to,
      cc: cc || null,
      subject: requestedSubject,
      sender: ALLOWED_ACCOUNT,
      gmail_message_id: gmailMessageId,
      gmail_thread_id: gmailThreadId,
      rfc_message_id: rfcMessageId || null,
      sent_at: new Date().toISOString(),
      attached,
      labelIds,
      generalSendEnabled: false,
      followUpLive: false,
    });
  }

  if (action === "send_claim") {
    if (body.confirm !== true) {
      return jsonResponse({
        success: false,
        error: "confirm_required",
        realEmailSend: false,
        hint: "שליחה רק אחרי Preview ואישור מפורש בתוך התיק",
      }, 400);
    }
    if (!(await isSendEnabled(sb))) {
      return jsonResponse({ success: false, error: "send_disabled", realEmailSend: false }, 403);
    }
    const claimId = String(body.claim_id || "");
    if (!claimId || !(await canWork(sb, user.id, role, claimId))) {
      return jsonResponse({ success: false, error: "forbidden_claim", realEmailSend: false }, 403);
    }
    const toCheck = parseEmailListStrict(String(body.to || ""), true);
    const ccCheck = parseEmailListStrict(String(body.cc || ""), false);
    if (!toCheck.ok) return jsonResponse({ success: false, error: toCheck.error, realEmailSend: false }, 400);
    if (!ccCheck.ok) return jsonResponse({ success: false, error: ccCheck.error, realEmailSend: false }, 400);
    const to = toCheck.emails.join(", ");
    const cc = ccCheck.emails.join(", ");
    const subject = String(body.subject || "").trim();
    const text = String(body.body || "").trim();
    const ids = Array.isArray(body.file_ids) ? [...new Set(body.file_ids.map((x) => String(x)).filter(Boolean))] : [];
    const idempotencyKey = String(body.idempotency_key || "").trim();
    if (!subject) return jsonResponse({ success: false, error: "subject_required", realEmailSend: false }, 400);
    if (!text) return jsonResponse({ success: false, error: "body_required", realEmailSend: false }, 400);
    if (hasInternalLeak(text)) {
      return jsonResponse({ success: false, error: "internal_content_blocked", realEmailSend: false }, 400);
    }
    if (!idempotencyKey || idempotencyKey.length < 8) {
      return jsonResponse({ success: false, error: "idempotency_required", realEmailSend: false }, 400);
    }

    const { data: existing } = await sb.from("claims_gmail_outbox").select("*").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing?.status === "sent" && existing.gmail_message_id) {
      return jsonResponse({
        success: false,
        error: "already_sent",
        gmail_message_id: existing.gmail_message_id,
        gmail_thread_id: existing.gmail_thread_id,
        realEmailSend: false,
      }, 409);
    }
    if (existing?.status === "pending") {
      const ageMs = Date.now() - new Date(String(existing.created_at || 0)).getTime();
      if (Number.isFinite(ageMs) && ageMs < 5 * 60 * 1000) {
        return jsonResponse({ success: false, error: "send_in_progress", realEmailSend: false }, 409);
      }
      await sb.from("claims_gmail_outbox").update({ status: "failed" }).eq("id", existing.id);
    }
    if (existing?.status === "failed") {
      await sb.from("claims_gmail_outbox").delete().eq("id", existing.id);
    }

    const { data: fileRows } = ids.length
      ? await sb.from("claims_documents")
        .select("id, original_name, mime_type, byte_size, storage_path, claim_id")
        .eq("claim_id", claimId)
        .in("id", ids)
      : { data: [] as Array<{ id: string; original_name: string; mime_type: string; byte_size: number; storage_path: string; claim_id: string }> };
    const rows = fileRows || [];
    if (ids.length !== rows.length) {
      return jsonResponse({ success: false, error: "files_not_on_claim", omitted: false, realEmailSend: false }, 400);
    }
    const ordered = ids.map((id) => rows.find((f) => f.id === id)!).filter(Boolean);
    const encodedMsg = await encodeMixedMessage(sb, {
      to,
      cc,
      subject,
      text,
      files: ordered,
    });
    if ("error" in encodedMsg && encodedMsg.error) {
      return jsonResponse({
        success: false,
        ...encodedMsg,
        omitted: false,
        suggestion: encodedMsg.error === "package_too_large" ? packageSuggestion(Number(encodedMsg.packageBytes || 0)) : undefined,
        realEmailSend: false,
      }, encodedMsg.error === "package_too_large" ? 413 : 400);
    }

    const outId = nid("GOS");
    const attached = (encodedMsg as { attached: Array<{ id: string; name: string; bytes: number }> }).attached || [];
    const packageBytes = Number((encodedMsg as { packageBytes?: number }).packageBytes || 0);
    const { error: lockErr } = await sb.from("claims_gmail_outbox").insert({
      id: outId,
      claim_id: claimId,
      kind: "claim_send",
      idempotency_key: idempotencyKey,
      status: "pending",
      to_addr: to,
      cc_addr: cc || null,
      subject,
      sender: ALLOWED_ACCOUNT,
      from_addr: ALLOWED_ACCOUNT,
      body_excerpt: text.slice(0, 500),
      file_ids: ids,
      file_names: attached.map((a) => a.name),
      package_bytes: packageBytes,
      created_by: user.id,
    });
    if (lockErr) {
      const { data: raced } = await sb.from("claims_gmail_outbox").select("*").eq("idempotency_key", idempotencyKey).maybeSingle();
      if (raced?.status === "sent" && raced.gmail_message_id) {
        return jsonResponse({
          success: false,
          error: "already_sent",
          gmail_message_id: raced.gmail_message_id,
          gmail_thread_id: raced.gmail_thread_id,
          realEmailSend: false,
        }, 409);
      }
      return jsonResponse({ success: false, error: "send_in_progress", db: lockErr.message, realEmailSend: false }, 409);
    }

    const sent = await gmailPost(access, "messages/send", {
      raw: (encodedMsg as { encoded: string }).encoded,
    });
    if (!sent.ok) {
      await sb.from("claims_gmail_outbox").update({ status: "failed" }).eq("id", outId);
      const errMsg = String(sent.json?.error?.message || "gmail_send_failed");
      const safeErr = errMsg.includes("Bearer") || /ya29\.|1\/\/|refresh_token|GOCSPX-/i.test(errMsg) ? "gmail_send_failed" : errMsg.slice(0, 240);
      await sb.from("claims_history").insert({
        id: nid("HIS"),
        claim_id: claimId,
        row_data: {
          action: "שליחת מייל נכשלה",
          type: "gmail_claim_send_failed",
          note: `To ${to} · ${subject} · ${safeErr}`,
          error: safeErr,
          sent: false,
          at: new Date().toLocaleString("he-IL"),
        },
      });
      return jsonResponse({
        success: false,
        error: safeErr,
        status: sent.status,
        realEmailSend: false,
      }, 400);
    }

    const gmailMessageId = String(sent.json.id || "");
    const gmailThreadId = String(sent.json.threadId || "");
    let rfcMessageId = "";
    try {
      const got = await gmailGet(access, `messages/${encodeURIComponent(gmailMessageId)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=From`);
      const hd = got.payload?.headers as Array<{ name?: string; value?: string }> | undefined;
      rfcMessageId = header(hd, "Message-ID") || header(hd, "Message-Id");
    } catch {
      rfcMessageId = "";
    }
    const sentAt = new Date().toISOString();
    const { data: profile } = await sb.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const actorName = profile?.full_name || user.email || user.id;
    await sb.from("claims_gmail_outbox").update({
      status: "sent",
      gmail_message_id: gmailMessageId,
      gmail_thread_id: gmailThreadId,
      rfc_message_id: rfcMessageId || null,
      sent_at: sentAt,
    }).eq("id", outId);

    const fileList = attached.map((a) => `${a.name} (${a.bytes} bytes)`).join(", ");
    await sb.from("claims_history").insert({
      id: nid("HIS"),
      claim_id: claimId,
      row_data: {
        action: "נשלח מייל מתיק התביעה",
        note: `From ${ALLOWED_ACCOUNT} · To ${to}${cc ? ` · CC ${cc}` : ""} · ${subject} · ${attached.length} קבצים · ${fileList} · msgid ${gmailMessageId} · thread ${gmailThreadId}`,
        type: "gmail_claim_send",
        by: actorName,
        at: new Date().toLocaleString("he-IL"),
        from: ALLOWED_ACCOUNT,
        to,
        cc,
        subject,
        files: attached.map((a) => ({ id: a.id, name: a.name, bytes: a.bytes })),
        gmail_message_id: gmailMessageId,
        gmail_thread_id: gmailThreadId,
        sent_at: sentAt,
      },
    });
    await sb.from("claims_comm_log").insert({
      id: nid("COM"),
      claim_id: claimId,
      row_data: {
        id: nid("COM"),
        claimId,
        type: "mail",
        direction: "out",
        email: to,
        cc,
        subject,
        body: text,
        at: new Date().toLocaleString("he-IL"),
        by: actorName,
        note: "נשלח מ-Gmail מתוך התיק",
        from: ALLOWED_ACCOUNT,
        gmail_message_id: gmailMessageId,
        gmail_thread_id: gmailThreadId,
        sender: ALLOWED_ACCOUNT,
        sent_at: sentAt,
        attachments: attached.map((a) => a.name),
        files: attached,
      },
    });
    await sb.from("claims_records").update({ last_activity_at: sentAt }).eq("id", claimId);

    return jsonResponse({
      success: true,
      sent: true,
      realEmailSend: true,
      from: ALLOWED_ACCOUNT,
      to,
      cc: cc || null,
      subject,
      fileCount: attached.length,
      files: attached,
      packageBytes,
      gmail_message_id: gmailMessageId,
      gmail_thread_id: gmailThreadId,
      rfc_message_id: rfcMessageId || null,
      sent_at: sentAt,
    });
  }

  return jsonResponse({ success: false, error: "unknown_action" }, 400);
});

function whyScope(s: string) {
  if (s === "openid") return "זיהוי חשבון Google בלי לגשת לתוכן.";
  if (s.includes("userinfo.email")) return "לוודא שהחשבון הוא בדיוק yoni122222@gmail.com.";
  if (s.includes("gmail.readonly")) return "קריאת מיילים ומצורפים לייבוא לתביעה. לא מוחק, לא מסמן כנקרא, לא מעביר.";
  if (s.includes("gmail.compose")) return "יצירת טיוטה, ושליחת מייל מתוך תיק תביעה רק אחרי Preview ואישור SEND מפורש. אין גישה כללית לתיבה. שליחה אוטומטית כבויה.";
  return s;
}
