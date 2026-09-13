/**
 * Garage Gmail — Staging only. Mailbox yoni191177@gmail.com.
 * Refresh token: public.garage_gmail_connection only.
 * OAuth app credentials: existing Google client that already connected this mailbox.
 * Never reads claims_gmail_connection. Never uses GOOGLE_REFRESH_TOKEN.
 * Never opens Gmail/mailto. Preview + confirm required before live send.
 */
import { edgeCorsHeaders, requireAuth, jsonResponse } from "../_shared/edgeAuth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractPriceCandidates, matchIncomingGarage, type MatchCase } from "./matchIncoming.ts";

const STAGING_REF = "usfeoerkpcafxxlyuldl";
const ALLOWED_ACCOUNT = "yoni191177@gmail.com";
const FORBIDDEN_ACCOUNTS = new Set(["yoni122222@gmail.com", "orin1607@gmail.com", "orin16007@gmail.com"]);
const BUCKET = "garage-media";
const PACKAGE_LIMIT = 18 * 1024 * 1024;
const MAX_ATTACH = 80;
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/i;
const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
  SEND_SCOPE,
];
const PAGES_REDIRECT = "https://orin1607-ctrl.github.io/future-craft-core/oauth/google-callback.html";
const FUNCTION_REDIRECT = `https://${STAGING_REF}.supabase.co/functions/v1/garage-gmail`;

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function nid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function isStaff(role: string) {
  return role === "super_admin";
}

async function loadConnection(sb: ReturnType<typeof admin>) {
  const { data } = await sb.from("garage_gmail_connection").select("connected_email, refresh_token, revoked_at, last_ok_at").eq("id", "staging").maybeSingle();
  if (!data || data.revoked_at) return null;
  const email = String(data.connected_email || "").toLowerCase();
  if (email !== ALLOWED_ACCOUNT) return null;
  if (!data.refresh_token || data.refresh_token === "revoked") return null;
  return data as { connected_email: string; refresh_token: string; revoked_at: string | null; last_ok_at: string | null };
}

function oauthApp() {
  const googleId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
  const googleSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
  if (googleId && googleSecret) return { clientId: googleId, clientSecret: googleSecret, source: "GOOGLE" };
  const claimsId = Deno.env.get("CLAIMS_GOOGLE_CLIENT_ID") || "";
  const claimsSecret = Deno.env.get("CLAIMS_GOOGLE_CLIENT_SECRET") || "";
  if (claimsId && claimsSecret) return { clientId: claimsId, clientSecret: claimsSecret, source: "CLAIMS_APP" };
  return null;
}

async function hmacHex(message: string) {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "garage-gmail-state";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function makeOauthState(kind: "pages" | "fn") {
  const payload = `garage-gmail.${kind}.${crypto.randomUUID()}.${Date.now()}`;
  return `${payload}.${await hmacHex(payload)}`;
}

async function oauthStateOk(state: string) {
  const parts = String(state || "").split(".");
  if (parts.length !== 5 || parts[0] !== "garage-gmail") return false;
  if (parts[1] !== "pages" && parts[1] !== "fn") return false;
  const ts = Number(parts[3] || 0);
  if (!ts || Math.abs(Date.now() - ts) > 45 * 60 * 1000) return false;
  const expect = await hmacHex(parts.slice(0, 4).join("."));
  const sig = parts[4];
  if (sig.length !== expect.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expect.charCodeAt(i);
  return diff === 0;
}

function htmlPage(ok: boolean, text: string) {
  const color = ok ? "#22c55e" : "#ef4444";
  return new Response(
    `<!doctype html><meta charset="utf-8"><body dir="rtl" style="font-family:sans-serif;background:#071022;color:#fff;padding:40px;text-align:center">
     <h1 style="color:${color}">${ok ? "החיבור הצליח" : "שגיאה בחיבור"}</h1>
     <p>${text}</p><p>אפשר לסגור את החלון ולחזור לניהול המוסך.</p></body>`,
    { headers: { ...edgeCorsHeaders, "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function userinfoEmail(access: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${access}` } });
  const json = await res.json();
  return String(json.email || "").toLowerCase();
}

async function tokenHasSendScope(access: string) {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(access)}`);
  const json = await res.json().catch(() => ({}));
  return String((json as { scope?: string }).scope || "").includes(SEND_SCOPE);
}

async function persistGarageMailbox(sb: ReturnType<typeof admin>, refreshToken: string, email: string, scopes: string) {
  const now = new Date().toISOString();
  const { data, error } = await sb.from("garage_gmail_connection").update({
    connected_email: email,
    refresh_token: refreshToken,
    revoked_at: null,
    last_ok_at: now,
    last_error: null,
    scopes,
    updated_at: now,
  }).eq("id", "staging").select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("garage_connection_row_missing");
}

async function completeOauthCallback(sb: ReturnType<typeof admin>, code: string, state: string, req: Request) {
  if (!code || !state || !(await oauthStateOk(state))) {
    return req.method === "GET" ? htmlPage(false, "state לא תואם. פתחו מחדש את חיבור Gmail מניהול המוסך.") : jsonResponse({ success: false, error: "oauth_state_mismatch" }, 400);
  }
  const client = oauthApp();
  if (!client) return jsonResponse({ success: false, error: "oauth_client_missing" }, 503);
  const redirectUri = state.includes(".pages.") ? PAGES_REDIRECT : FUNCTION_REDIRECT;
  const tokRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tok = await tokRes.json();
  if (!tokRes.ok || !tok.refresh_token) {
    const msg = String(tok.error_description || tok.error || "no_refresh_token");
    return req.method === "GET" ? htmlPage(false, msg) : jsonResponse({ success: false, error: msg }, 400);
  }
  const email = await userinfoEmail(String(tok.access_token || ""));
  if (FORBIDDEN_ACCOUNTS.has(email) || email !== ALLOWED_ACCOUNT) {
    const blocked = `החשבון שאושר הוא ${email || "לא ידוע"}. צריך בדיוק ${ALLOWED_ACCOUNT}. לא yoni122222, לא orin1607, ולא Claims.`;
    return req.method === "GET" ? htmlPage(false, blocked) : jsonResponse({ success: false, error: "wrong_account", email, message: blocked }, 403);
  }
  const hasSend = await tokenHasSendScope(String(tok.access_token || ""));
  if (!hasSend) {
    const blocked = "החיבור הצליח אבל חסרה הרשאת Gmail SEND. יש לאשר שליחה בחלון Google.";
    return req.method === "GET" ? htmlPage(false, blocked) : jsonResponse({ success: false, error: "need_send_scope" }, 403);
  }
  await persistGarageMailbox(sb, String(tok.refresh_token), email, String(tok.scope || SCOPES.join(" ")));
  const ok = `${ALLOWED_ACCOUNT} מחובר לניהול המוסך עם הרשאת שליחה.`;
  return req.method === "GET" ? htmlPage(true, ok) : jsonResponse({ success: true, connected: true, email, sendScope: true });
}

async function googleAccessToken(refreshToken: string) {
  const app = oauthApp();
  if (!app) throw new Error("oauth_app_credentials_missing");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(json.error_description || json.error || "token_refresh_failed");
  return String(json.access_token);
}

async function gmailGet(access: string, path: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `gmail ${res.status}`);
  return json;
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

function rfc2047(s: string) {
  if (!s) return "";
  if (/^[\x20-\x7E]+$/.test(s)) return s;
  return `=?UTF-8?B?${bytesToB64(new TextEncoder().encode(s))}?=`;
}

function sanitizeName(name: string) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 60) || "file";
  return ext ? `${safe}.${ext}` : safe;
}

function walkParts(part: Record<string, unknown>, acc: Array<Record<string, unknown>>) {
  acc.push(part);
  const parts = part.parts as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(parts)) parts.forEach((p) => walkParts(p, acc));
}

function decodeBody(part: Record<string, unknown> | undefined) {
  const data = (part?.body as { data?: string } | undefined)?.data;
  if (!data) return "";
  try { return new TextDecoder().decode(b64urlToBytes(data)); } catch { return ""; }
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
    } catch { return ""; }
  }
  return "";
}

async function extractMailBody(access: string, messageId: string, payload: Record<string, unknown> | undefined, parts: Array<Record<string, unknown>>, snippet = "") {
  let html = "";
  let text = "";
  for (const p of parts) {
    const mime = String(p.mimeType || "").toLowerCase();
    if (mime.startsWith("text/html")) {
      const d = await decodePartBody(access, messageId, p);
      if (d.length > html.length) html = d;
    } else if (mime.startsWith("text/plain") && !String(p.filename || "").trim()) {
      const d = await decodePartBody(access, messageId, p);
      if (d.length > text.length) text = d;
    }
  }
  const fromHtml = html ? htmlToText(html) : "";
  const readable = fromHtml.length >= text.trim().length ? fromHtml : text.trim();
  if (readable) return readable.slice(0, 20000);
  const root = payload ? await decodePartBody(access, messageId, payload) : "";
  return (htmlToText(root) || root || snippet || "").slice(0, 20000);
}

function collectFiles(parts: Array<Record<string, unknown>>) {
  const out: Array<{ filename: string; mime: string; attachmentId: string; inline?: string }> = [];
  let unnamed = 0;
  for (const p of parts) {
    const mime = String(p.mimeType || "");
    if (mime.startsWith("text/plain") || mime.startsWith("text/html") || mime.startsWith("multipart/")) continue;
    const rawName = String(p.filename || "").trim();
    const body = (p.body || {}) as { attachmentId?: string; data?: string };
    const attId = String(body.attachmentId || "");
    const inline = body.data || "";
    if (!rawName && !attId && !inline) continue;
    if (!rawName && !ALLOWED_MIME.test(mime) && !mime.startsWith("image/") && mime !== "application/pdf") continue;
    unnamed += rawName ? 0 : 1;
    const ext = mime.includes("pdf") ? "pdf" : mime.includes("png") ? "png" : "jpg";
    out.push({ filename: rawName || `file-${unnamed}.${ext}`, mime: mime || "application/octet-stream", attachmentId: attId, inline });
  }
  return out.slice(0, MAX_ATTACH);
}

function stripMailNoise(raw: string) {
  return String(raw || "").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim();
}

function parseEmailListStrict(raw: string, required: boolean) {
  const parts = stripMailNoise(raw).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) {
    return required ? { ok: false as const, emails: [] as string[], error: "to_required" } : { ok: true as const, emails: [] as string[] };
  }
  const emails: string[] = [];
  const re = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  for (const p of parts) {
    if (!re.test(p)) return { ok: false as const, emails: [] as string[], error: required ? "to_required" : "cc_invalid" };
    const low = p.toLowerCase();
    if (FORBIDDEN_ACCOUNTS.has(low) && low !== ALLOWED_ACCOUNT) {
      return { ok: false as const, emails: [] as string[], error: "recipient_forbidden" };
    }
    emails.push(low);
  }
  return { ok: true as const, emails };
}

function packageSuggestion(bytes: number) {
  if (bytes <= PACKAGE_LIMIT) return "";
  return "הקבצים גדולים מדי לשליחה במייל. בחר פחות קבצים — לא יושמטו קבצים בשקט.";
}

async function loadMatchCases(sb: ReturnType<typeof admin>): Promise<MatchCase[]> {
  const { data: recs } = await sb.from("garage_cases").select("id, case_number, customer_name_snapshot, vehicle_plate_snapshot, case_data, gmail_thread_id");
  const { data: imps } = await sb.from("garage_gmail_imports").select("garage_case_id, gmail_thread_id");
  const { data: outs } = await sb.from("garage_gmail_outbox").select("garage_case_id, gmail_thread_id");
  const threads: Record<string, string[]> = {};
  for (const row of [...(imps || []), ...(outs || [])]) {
    const cid = String((row as { garage_case_id?: string }).garage_case_id || "");
    const th = String((row as { gmail_thread_id?: string }).gmail_thread_id || "");
    if (!cid || !th) continue;
    (threads[cid] ||= []).push(th);
  }
  return (recs || []).map((r) => {
    const cd = (r.case_data && typeof r.case_data === "object") ? r.case_data as Record<string, unknown> : {};
    return {
      id: String(r.id),
      caseNumber: String(r.case_number || ""),
      plate: String(r.vehicle_plate_snapshot || ""),
      customerName: String(r.customer_name_snapshot || ""),
      companyName: String(cd.companyName || r.customer_name_snapshot || ""),
      workOrderNumber: String(cd.workOrderNumber || ""),
      workOrderRef: String(cd.workOrderRef || ""),
      threads: [...new Set([String(r.gmail_thread_id || ""), ...(threads[String(r.id)] || [])].filter(Boolean))],
    };
  });
}

function caseQuoteAmount(caseData: Record<string, unknown> | null) {
  const q = caseData?.quote;
  if (typeof q === "number") return q;
  if (q && typeof q === "object") {
    const amt = Number((q as { amount?: number }).amount || (q as { total?: number }).total || 0);
    if (amt) return amt;
  }
  const wo = Number(caseData?.workOrderAmount || 0);
  return wo || 0;
}

async function addHistory(
  sb: ReturnType<typeof admin>,
  opts: { caseId: string; type: string; summary: string; actorId?: string; actorName?: string; importId?: string; outboxId?: string; pendingId?: string; messageId?: string; threadId?: string; payload?: Record<string, unknown> },
) {
  await sb.from("garage_gmail_history").insert({
    id: nid("GGH"),
    garage_case_id: opts.caseId,
    event_type: opts.type,
    import_id: opts.importId || null,
    outbox_id: opts.outboxId || null,
    pending_id: opts.pendingId || null,
    gmail_message_id: opts.messageId || null,
    gmail_thread_id: opts.threadId || null,
    actor_id: opts.actorId || null,
    actor_name: opts.actorName || null,
    summary: opts.summary,
    payload: opts.payload || {},
  });
}

async function encodeMixedMessage(
  sb: ReturnType<typeof admin>,
  opts: { to: string; cc: string; subject: string; text: string; files: Array<{ id: string; title: string; mime_type: string; byte_size: number; storage_path: string; original_name?: string }> },
) {
  const packageBytes = opts.files.reduce((s, f) => s + Number(f.byte_size || 0), 0);
  if (packageBytes > PACKAGE_LIMIT) return { error: "package_too_large" as const, packageBytes };
  const boundary = `mix_${crypto.randomUUID().replace(/-/g, "")}`;
  const chunks: string[] = [
    `From: ${ALLOWED_ACCOUNT}`,
    `To: ${opts.to}`,
    ...(opts.cc ? [`Cc: ${opts.cc}`] : []),
    `Subject: ${rfc2047(opts.subject)}`,
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
    if (dlErr || !blob) return { error: "attachment_download_failed" as const, filename: f.title || f.original_name, reason: dlErr?.message || "empty" };
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const name = sanitizeName(f.original_name || f.title || "file");
    chunks.push(
      `--${boundary}`,
      `Content-Type: ${f.mime_type || "application/octet-stream"}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      "Content-Transfer-Encoding: base64",
      "",
      bytesToB64(bytes),
    );
    attached.push({ id: f.id, name: f.original_name || f.title, bytes: bytes.byteLength });
  }
  chunks.push(`--${boundary}--`);
  return { encoded: bytesToB64url(new TextEncoder().encode(chunks.join("\r\n"))), attached, packageBytes };
}

async function storeInboundFiles(
  sb: ReturnType<typeof admin>,
  access: string,
  opts: { caseId: string; messageId: string; threadId: string; files: Array<{ filename: string; mime: string; attachmentId: string; inline?: string }>; actorId: string },
) {
  const mediaIds: string[] = [];
  const names: string[] = [];
  const failures: Array<{ filename: string; reason: string }> = [];
  const { data: existing } = await sb.from("garage_media").select("id, gmail_attachment_id, gmail_message_id").eq("garage_case_id", opts.caseId);
  const have = new Set((existing || []).map((r) => `${r.gmail_message_id || ""}:${r.gmail_attachment_id || ""}`));
  for (const f of opts.files) {
    if (f.attachmentId && have.has(`${opts.messageId}:${f.attachmentId}`)) continue;
    let bytes: Uint8Array | null = null;
    try {
      if (f.inline) bytes = b64urlToBytes(f.inline);
      else if (f.attachmentId) {
        const att = await gmailGet(access, `messages/${encodeURIComponent(opts.messageId)}/attachments/${encodeURIComponent(f.attachmentId)}`);
        bytes = b64urlToBytes(String(att.data || ""));
      }
    } catch (e) {
      failures.push({ filename: f.filename, reason: String((e as Error).message || e).slice(0, 180) });
      continue;
    }
    if (!bytes || bytes.byteLength === 0) {
      failures.push({ filename: f.filename, reason: "empty" });
      continue;
    }
    const mime = f.mime || "application/octet-stream";
    if (!ALLOWED_MIME.test(mime) && !mime.startsWith("image/") && mime !== "application/pdf") {
      failures.push({ filename: f.filename, reason: "mime_not_allowed" });
      continue;
    }
    const id = crypto.randomUUID();
    const path = `${opts.caseId}/gmail/${opts.messageId}/${id}-${sanitizeName(f.filename)}`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
    if (upErr) {
      failures.push({ filename: f.filename, reason: upErr.message });
      continue;
    }
    const { error: rowErr } = await sb.from("garage_media").insert({
      id,
      garage_case_id: opts.caseId,
      category: "gmail_in",
      title: f.filename,
      storage_path: path,
      mime_type: mime,
      byte_size: bytes.byteLength,
      created_by: opts.actorId,
      gmail_message_id: opts.messageId,
      gmail_thread_id: opts.threadId,
      gmail_attachment_id: f.attachmentId || null,
      source: "gmail_in",
      original_name: f.filename,
    });
    if (rowErr) {
      failures.push({ filename: f.filename, reason: rowErr.message });
      continue;
    }
    mediaIds.push(id);
    names.push(f.filename);
  }
  return { mediaIds, names, failures, found: opts.files.length, imported: mediaIds.length };
}

async function importToCase(
  sb: ReturnType<typeof admin>,
  access: string,
  opts: {
    caseId: string;
    messageId: string;
    actorId: string;
    actorName: string;
    via: string;
  },
) {
  const { data: already } = await sb.from("garage_gmail_imports").select("id").eq("garage_case_id", opts.caseId).eq("gmail_message_id", opts.messageId).maybeSingle();
  if (already) return { importId: already.id, skipped: true as const };

  const full = await gmailGet(access, `messages/${encodeURIComponent(opts.messageId)}?format=full`);
  const headers = full.payload?.headers as Array<{ name?: string; value?: string }> | undefined;
  const parts: Array<Record<string, unknown>> = [];
  if (full.payload) walkParts(full.payload as Record<string, unknown>, parts);
  const files = collectFiles(parts);
  const bodyText = await extractMailBody(access, opts.messageId, full.payload as Record<string, unknown>, parts, String(full.snippet || ""));
  const threadId = String(full.threadId || "");
  const fromAddr = header(headers, "From");
  const subject = header(headers, "Subject");
  const sentAt = full.internalDate ? new Date(Number(full.internalDate)).toISOString() : null;
  const stored = await storeInboundFiles(sb, access, {
    caseId: opts.caseId,
    messageId: String(full.id),
    threadId,
    files,
    actorId: opts.actorId,
  });
  const { data: rec } = await sb.from("garage_cases").select("case_data, gmail_thread_id").eq("id", opts.caseId).maybeSingle();
  const cd = (rec?.case_data && typeof rec.case_data === "object") ? rec.case_data as Record<string, unknown> : {};
  const sentAmt = caseQuoteAmount(cd);
  const prices = extractPriceCandidates(`${subject}\n${bodyText}`);
  const candidate = prices[0] || null;
  const priceAlert = candidate != null && sentAmt > 0 && Math.abs(candidate - sentAmt) >= 1;
  const importId = `GIM-${opts.caseId.slice(0, 8)}-${String(full.id)}`.slice(0, 80);
  const { error: insErr } = await sb.from("garage_gmail_imports").insert({
    id: importId,
    garage_case_id: opts.caseId,
    gmail_message_id: String(full.id),
    gmail_thread_id: threadId,
    rfc_message_id: header(headers, "Message-ID") || header(headers, "Message-Id") || null,
    from_addr: fromAddr,
    to_addr: header(headers, "To"),
    cc_addr: header(headers, "Cc") || null,
    subject,
    snippet: String(full.snippet || bodyText.slice(0, 180)),
    body_text: bodyText,
    sent_at: sentAt,
    direction: "incoming",
    attachment_count: files.length,
    found_count: stored.found,
    imported_count: stored.imported,
    failed_count: stored.failures.length,
    failures: stored.failures,
    media_ids: stored.mediaIds,
    candidate_amount: candidate,
    candidate_currency: candidate != null ? "ILS" : null,
    price_alert: priceAlert,
    match_via: opts.via,
    imported_by: opts.actorId,
    imported_by_name: opts.actorName,
  });
  if (insErr) throw new Error(insErr.message);
  if (!rec?.gmail_thread_id && threadId) {
    await sb.from("garage_cases").update({ gmail_thread_id: threadId, updated_at: new Date().toISOString() }).eq("id", opts.caseId);
  }
  await addHistory(sb, {
    caseId: opts.caseId,
    type: "received",
    summary: `התקבלה תשובה · ${subject || ""}`,
    actorId: opts.actorId,
    actorName: opts.actorName,
    importId,
    messageId: String(full.id),
    threadId,
    payload: { from: fromAddr, subject, files: stored.names },
  });
  if (stored.names.length) {
    await addHistory(sb, {
      caseId: opts.caseId,
      type: "attachment",
      summary: `קובץ התקבל במייל · ${stored.names.join(", ")}`,
      actorId: opts.actorId,
      actorName: opts.actorName,
      importId,
      messageId: String(full.id),
      threadId,
      payload: { files: stored.names, failures: stored.failures },
    });
  }
  if (candidate != null) {
    await addHistory(sb, {
      caseId: opts.caseId,
      type: "price_candidate",
      summary: priceAlert
        ? `מחיר מועמד ${candidate} ₪ שונה מהמחיר בתיק ${sentAmt} ₪ — דורש אישור עובד`
        : `מחיר מועמד ${candidate} ₪ — דורש אישור עובד (לא אושר אוטומטית)`,
      actorId: opts.actorId,
      actorName: opts.actorName,
      importId,
      payload: { candidate, sentAmt, priceAlert, autoApproved: false },
    });
  }
  return { importId, skipped: false as const, stored, priceAlert, candidate };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: edgeCorsHeaders });
  const sb = admin();
  let body: Record<string, unknown> = {};
  try {
    if (req.method === "POST") body = await req.json();
  } catch { body = {}; }
  const url = new URL(req.url);
  let action = String(body.action || url.searchParams.get("action") || "");
  if (action === "exchange") action = "oauth_callback";
  if (!action && url.searchParams.get("code") && url.searchParams.get("state")) action = "oauth_callback";
  if (!action) action = "status";

  if (action === "oauth_callback") {
    try {
      const code = String(body.code || url.searchParams.get("code") || "");
      const state = String(body.state || url.searchParams.get("state") || "");
      return await completeOauthCallback(sb, code, state, req);
    } catch (e) {
      const msg = String((e as Error).message || e);
      return req.method === "GET" ? htmlPage(false, msg) : jsonResponse({ success: false, error: msg }, 500);
    }
  }

  if (action === "send" || action === "send_email" || action === "mailto") {
    return jsonResponse({ success: false, blocked: true, reason: "use_send_garage", realEmailSend: false }, 403);
  }

  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;
  const { user, role } = auth.ctx;
  if (!(await isStaff(role))) return jsonResponse({ success: false, error: "forbidden" }, 403);

  if (action === "oauth_start") {
    const client = oauthApp();
    if (!client) return jsonResponse({ success: false, error: "oauth_client_missing", pending: true }, 503);
    const fnState = await makeOauthState("fn");
    const pagesState = await makeOauthState("pages");
    const common = {
      client_id: client.clientId,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      login_hint: ALLOWED_ACCOUNT,
      scope: SCOPES.join(" "),
    };
    const fnParams = new URLSearchParams({ ...common, redirect_uri: FUNCTION_REDIRECT, state: fnState });
    const pagesParams = new URLSearchParams({ ...common, redirect_uri: PAGES_REDIRECT, state: pagesState });
    return jsonResponse({
      success: true,
      authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${fnParams.toString()}`,
      pagesAuthUrl: `https://accounts.google.com/o/oauth2/v2/auth?${pagesParams.toString()}`,
      mailbox: ALLOWED_ACCOUNT,
      redirectUri: FUNCTION_REDIRECT,
      pagesRedirectUri: PAGES_REDIRECT,
      note: "יש להתחבר בדיוק עם yoni191177@gmail.com. לא yoni122222 ולא Claims.",
    });
  }

  if (action === "status") {
    const conn = await loadConnection(sb);
    const { data: settings } = await sb.from("garage_gmail_settings").select("allowed_account, send_enabled, package_limit_bytes").eq("id", "staging").maybeSingle();
    const { data: connMeta } = await sb.from("garage_gmail_connection").select("scopes").eq("id", "staging").maybeSingle();
    const sendScope = String(connMeta?.scopes || "").includes(SEND_SCOPE);
    return jsonResponse({
      success: true,
      connected: !!conn,
      email: conn?.connected_email || null,
      accountExpected: ALLOWED_ACCOUNT,
      sendEnabled: settings?.send_enabled !== false,
      sendScope,
      reconnectRequired: !conn || !sendScope,
      lastOkAt: conn?.last_ok_at || null,
      packageLimitBytes: Number(settings?.package_limit_bytes || PACKAGE_LIMIT),
      realEmailSend: false,
    });
  }

  if (action === "list_case_files") {
    const caseId = String(body.case_id || "");
    if (!caseId) return jsonResponse({ success: false, error: "case_id required" }, 400);
    const { data } = await sb.from("garage_media")
      .select("id, title, original_name, mime_type, byte_size, category, storage_path, source, gmail_message_id, created_at")
      .eq("garage_case_id", caseId)
      .order("created_at", { ascending: false });
    return jsonResponse({ success: true, files: data || [], mailboxMutated: false, realEmailSend: false });
  }

  if (action === "list_history") {
    const caseId = String(body.case_id || "");
    if (!caseId) return jsonResponse({ success: false, error: "case_id required" }, 400);
    const { data: hist } = await sb.from("garage_gmail_history").select("*").eq("garage_case_id", caseId).order("created_at", { ascending: true });
    const { data: imps } = await sb.from("garage_gmail_imports").select("*").eq("garage_case_id", caseId).order("sent_at", { ascending: true });
    const { data: outs } = await sb.from("garage_gmail_outbox").select("*").eq("garage_case_id", caseId).order("created_at", { ascending: true });
    return jsonResponse({ success: true, history: hist || [], imports: imps || [], outbox: outs || [], mailboxMutated: false, realEmailSend: false });
  }

  if (action === "list_pending") {
    const { data } = await sb.from("garage_gmail_pending").select("*").order("created_at", { ascending: false }).limit(80);
    return jsonResponse({ success: true, data: data || [], mailboxMutated: false, realEmailSend: false });
  }

  if (action === "package_preview" || action === "validate_send") {
    const caseId = String(body.case_id || "");
    if (!caseId) return jsonResponse({ success: false, error: "case_id required", realEmailSend: false }, 400);
    const ids = Array.isArray(body.file_ids) ? [...new Set(body.file_ids.map((x) => String(x)).filter(Boolean))] : [];
    const toCheck = parseEmailListStrict(String(body.to || ""), action === "validate_send");
    const ccCheck = parseEmailListStrict(String(body.cc || ""), false);
    if (action === "validate_send" && !toCheck.ok) return jsonResponse({ success: false, error: toCheck.error, realEmailSend: false }, 400);
    if (!ccCheck.ok) return jsonResponse({ success: false, error: ccCheck.error, realEmailSend: false }, 400);
    let rows: Array<{ id: string; title: string; original_name: string; mime_type: string; byte_size: number }> = [];
    if (ids.length) {
      const { data } = await sb.from("garage_media").select("id, title, original_name, mime_type, byte_size").eq("garage_case_id", caseId).in("id", ids);
      rows = data || [];
      if (rows.length !== ids.length) return jsonResponse({ success: false, error: "files_not_on_case", omitted: false, realEmailSend: false }, 400);
    }
    const files = rows.map((f) => ({ id: f.id, name: f.original_name || f.title, bytes: Number(f.byte_size || 0), mime: f.mime_type }));
    const packageBytes = files.reduce((s, f) => s + f.bytes, 0);
    const overLimit = packageBytes > PACKAGE_LIMIT;
    return jsonResponse({
      success: !overLimit,
      error: overLimit ? "package_too_large" : undefined,
      preview: {
        from: ALLOWED_ACCOUNT,
        to: toCheck.emails.join(", "),
        cc: ccCheck.emails.join(", ") || null,
        subject: String(body.subject || "").trim(),
        body: String(body.body || "").trim(),
        files,
        fileCount: files.length,
        packageBytes,
      },
      packageBytes,
      limitBytes: PACKAGE_LIMIT,
      overLimit,
      omitted: false,
      suggestion: packageSuggestion(packageBytes),
      realEmailSend: false,
    }, overLimit ? 413 : 200);
  }

  const conn = await loadConnection(sb);
  if (!conn) return jsonResponse({ success: false, error: "gmail_not_connected", reconnectRequired: true }, 409);
  if (FORBIDDEN_ACCOUNTS.has(conn.connected_email.toLowerCase()) || conn.connected_email.toLowerCase() !== ALLOWED_ACCOUNT) {
    return jsonResponse({ success: false, error: "wrong_account", email: conn.connected_email }, 403);
  }

  let access = "";
  try {
    access = await googleAccessToken(conn.refresh_token);
    await sb.from("garage_gmail_connection").update({ last_ok_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", "staging");
  } catch (e) {
    const err = String((e as Error).message || e);
    await sb.from("garage_gmail_connection").update({ last_error: err.slice(0, 240), updated_at: new Date().toISOString() }).eq("id", "staging");
    return jsonResponse({
      success: false,
      error: err,
      oauthUnchanged: true,
      hint: "OAuth Client הקיים לא הצליח לרענן את טוקן Garage. לא נוצר Client/Secret חדש.",
      reconnectRequired: /invalid_grant|revoked|invalid_client/i.test(err),
    }, 400);
  }

  if (action === "scan_inbox") {
    const listed = await gmailGet(access, `messages?maxResults=20&q=${encodeURIComponent("in:inbox newer_than:7d")}`);
    const ids = ((listed.messages || []) as Array<{ id?: string }>).map((m) => String(m.id || "")).filter(Boolean);
    const { data: importedRows } = await sb.from("garage_gmail_imports").select("gmail_message_id");
    const importedSet = new Set((importedRows || []).map((r) => String(r.gmail_message_id || "")));
    const { data: outRows } = await sb.from("garage_gmail_outbox").select("gmail_message_id");
    const outSet = new Set((outRows || []).map((r) => String(r.gmail_message_id || "")).filter(Boolean));
    const { data: pendingRows } = await sb.from("garage_gmail_pending").select("gmail_message_id, decision");
    const pendingSet = new Set((pendingRows || []).map((r) => String(r.gmail_message_id || "")));
    const cases = await loadMatchCases(sb);
    const auto: Array<Record<string, unknown>> = [];
    const needsReview: Array<Record<string, unknown>> = [];
    const { data: profile } = await sb.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const actorName = profile?.full_name || user.email || user.id;
    for (const messageId of ids) {
      if (importedSet.has(messageId) || outSet.has(messageId) || pendingSet.has(messageId)) continue;
      const full = await gmailGet(access, `messages/${encodeURIComponent(messageId)}?format=full`);
      const headers = full.payload?.headers as Array<{ name?: string; value?: string }> | undefined;
      const parts: Array<Record<string, unknown>> = [];
      if (full.payload) walkParts(full.payload as Record<string, unknown>, parts);
      const files = collectFiles(parts);
      const bodyText = await extractMailBody(access, messageId, full.payload as Record<string, unknown>, parts, String(full.snippet || ""));
      const match = matchIncomingGarage({
        messageId,
        threadId: String(full.threadId || ""),
        subject: header(headers, "Subject"),
        body: bodyText,
        from: header(headers, "From"),
        filenames: files.map((f) => f.filename),
      }, cases);
      if (match.decision === "auto" && match.caseId) {
        const imported = await importToCase(sb, access, {
          caseId: match.caseId,
          messageId,
          actorId: user.id,
          actorName,
          via: match.via || "auto",
        });
        auto.push({ messageId, caseId: match.caseId, via: match.via, importId: imported.importId });
      } else {
        await sb.from("garage_gmail_pending").upsert({
          id: `GIP-${messageId}`.slice(0, 80),
          gmail_message_id: messageId,
          gmail_thread_id: String(full.threadId || ""),
          rfc_message_id: header(headers, "Message-ID") || null,
          from_addr: header(headers, "From"),
          to_addr: header(headers, "To"),
          cc_addr: header(headers, "Cc") || null,
          subject: header(headers, "Subject"),
          snippet: String(full.snippet || bodyText.slice(0, 180)),
          body_text: bodyText,
          sent_at: full.internalDate ? new Date(Number(full.internalDate)).toISOString() : null,
          attachment_count: files.length,
          decision: "needs_review",
          reason: match.reason,
          via: match.via || null,
          candidates: match.candidates,
        }, { onConflict: "gmail_message_id" });
        needsReview.push({ messageId, reason: match.reason, candidates: match.candidates, via: match.via });
      }
    }
    return jsonResponse({
      success: true,
      auto: auto.length,
      needsReview: needsReview.length,
      autoItems: auto,
      reviewItems: needsReview,
      mailboxMutated: false,
      realEmailSend: false,
    });
  }

  if (action === "assign_pending") {
    const pendingId = String(body.pending_id || "");
    const caseId = String(body.case_id || "");
    if (!pendingId || !caseId) return jsonResponse({ success: false, error: "pending_id and case_id required" }, 400);
    const { data: row } = await sb.from("garage_gmail_pending").select("*").eq("id", pendingId).maybeSingle();
    if (!row) return jsonResponse({ success: false, error: "not_found" }, 404);
    if (row.decision === "assigned" && row.imported_id) {
      return jsonResponse({ success: false, error: "already_assigned", case_id: row.assigned_case_id }, 409);
    }
    const { data: profile } = await sb.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const actorName = profile?.full_name || user.email || user.id;
    const imported = await importToCase(sb, access, {
      caseId,
      messageId: String(row.gmail_message_id),
      actorId: user.id,
      actorName,
      via: "manual",
    });
    await sb.from("garage_gmail_pending").update({
      decision: "assigned",
      assigned_case_id: caseId,
      imported_id: imported.importId,
      imported_at: new Date().toISOString(),
    }).eq("id", pendingId);
    await addHistory(sb, {
      caseId,
      type: "manual_assign",
      summary: "מסמך שויך ידנית לתיק",
      actorId: user.id,
      actorName,
      importId: imported.importId,
      pendingId,
      messageId: String(row.gmail_message_id),
    });
    return jsonResponse({ success: true, case_id: caseId, importId: imported.importId, mailboxMutated: false, realEmailSend: false });
  }

  if (action === "send_garage") {
    if (body.confirm !== true) {
      return jsonResponse({ success: false, error: "confirm_required", realEmailSend: false }, 400);
    }
    const { data: settings } = await sb.from("garage_gmail_settings").select("send_enabled").eq("id", "staging").maybeSingle();
    if (settings?.send_enabled === false) return jsonResponse({ success: false, error: "send_disabled", realEmailSend: false }, 403);
    const caseId = String(body.case_id || "");
    if (!caseId) return jsonResponse({ success: false, error: "case_id required", realEmailSend: false }, 400);
    const { data: garageCase } = await sb.from("garage_cases").select("id, case_number").eq("id", caseId).maybeSingle();
    if (!garageCase) return jsonResponse({ success: false, error: "case_not_found", realEmailSend: false }, 404);
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
    if (!idempotencyKey || idempotencyKey.length < 8) return jsonResponse({ success: false, error: "idempotency_required", realEmailSend: false }, 400);

    const { data: existing } = await sb.from("garage_gmail_outbox").select("*").eq("idempotency_key", idempotencyKey).maybeSingle();
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
      await sb.from("garage_gmail_outbox").update({ status: "failed", error_text: "stale_pending" }).eq("id", existing.id);
    }

    const { data: fileRows } = ids.length
      ? await sb.from("garage_media").select("id, title, original_name, mime_type, byte_size, storage_path").eq("garage_case_id", caseId).in("id", ids)
      : { data: [] as Array<{ id: string; title: string; original_name: string; mime_type: string; byte_size: number; storage_path: string }> };
    const rows = fileRows || [];
    if (ids.length !== rows.length) {
      return jsonResponse({ success: false, error: "files_not_on_case", omitted: false, realEmailSend: false }, 400);
    }
    const ordered = ids.map((id) => rows.find((f) => f.id === id)!).filter(Boolean);
    const requestedThread = String(body.thread_id || "").trim();
    let sendThreadId = "";
    if (requestedThread) {
      const { count: nImp } = await sb.from("garage_gmail_imports").select("id", { count: "exact", head: true }).eq("garage_case_id", caseId).eq("gmail_thread_id", requestedThread);
      const { count: nOut } = await sb.from("garage_gmail_outbox").select("id", { count: "exact", head: true }).eq("garage_case_id", caseId).eq("gmail_thread_id", requestedThread);
      if (!nImp && !nOut) return jsonResponse({ success: false, error: "thread_not_on_case", realEmailSend: false }, 400);
      sendThreadId = requestedThread;
    }
    const encodedMsg = await encodeMixedMessage(sb, { to, cc, subject, text, files: ordered });
    if ("error" in encodedMsg && encodedMsg.error) {
      return jsonResponse({
        success: false,
        ...encodedMsg,
        omitted: false,
        suggestion: encodedMsg.error === "package_too_large" ? packageSuggestion(Number(encodedMsg.packageBytes || 0)) : undefined,
        realEmailSend: false,
      }, encodedMsg.error === "package_too_large" ? 413 : 400);
    }

    const { data: maxRow } = await sb.from("garage_gmail_outbox").select("send_no").not("send_no", "is", null).order("send_no", { ascending: false }).limit(1).maybeSingle();
    const sendNo = Number(maxRow?.send_no || 0) + 1;
    const outId = existing?.status === "failed" ? existing.id : nid("GOS");
    const attached = (encodedMsg as { attached: Array<{ id: string; name: string; bytes: number }> }).attached || [];
    const packageBytes = Number((encodedMsg as { packageBytes?: number }).packageBytes || 0);
    const { data: profile } = await sb.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const actorName = profile?.full_name || user.email || user.id;
    const lockRow = {
      id: outId,
      garage_case_id: caseId,
      kind: sendThreadId ? "garage_reply" : "garage_send",
      idempotency_key: idempotencyKey,
      status: "pending",
      send_no: existing?.send_no || sendNo,
      from_addr: ALLOWED_ACCOUNT,
      to_addr: to,
      cc_addr: cc || null,
      subject,
      sender: actorName,
      body_text: text,
      body_excerpt: text.slice(0, 500),
      media_ids: ids,
      file_names: attached.map((a) => a.name),
      package_bytes: packageBytes,
      created_by: user.id,
      created_by_name: actorName,
    };
    const lock = existing?.status === "failed"
      ? await sb.from("garage_gmail_outbox").update(lockRow).eq("id", outId)
      : await sb.from("garage_gmail_outbox").insert(lockRow);
    if (lock.error) {
      const { data: raced } = await sb.from("garage_gmail_outbox").select("*").eq("idempotency_key", idempotencyKey).maybeSingle();
      if (raced?.status === "sent" && raced.gmail_message_id) {
        return jsonResponse({ success: false, error: "already_sent", gmail_message_id: raced.gmail_message_id, realEmailSend: false }, 409);
      }
      return jsonResponse({ success: false, error: "send_in_progress", db: lock.error.message, realEmailSend: false }, 409);
    }

    const sentPayload: Record<string, unknown> = { raw: (encodedMsg as { encoded: string }).encoded };
    if (sendThreadId) sentPayload.threadId = sendThreadId;
    const sent = await gmailPost(access, "messages/send", sentPayload);
    if (!sent.ok) {
      const gmailErr = String(sent.json?.error?.message || sent.json?.error || "");
      const needSend = sent.status === 403 || /insufficient|access_denied|invalid_scope/i.test(gmailErr);
      const errCode = needSend ? "need_send_scope" : "gmail_send_failed";
      await sb.from("garage_gmail_outbox").update({ status: "failed", error_text: errCode }).eq("id", outId);
      await addHistory(sb, {
        caseId,
        type: "send_failed",
        summary: `שליחת מייל נכשלה · ${subject}`,
        actorId: user.id,
        actorName,
        outboxId: outId,
        payload: { to, subject },
      });
      return jsonResponse({ success: false, error: errCode, status: sent.status, reconnectRequired: needSend, realEmailSend: false }, 400);
    }
    const gmailMessageId = String(sent.json.id || "");
    const gmailThreadId = String(sent.json.threadId || "");
    const sentAt = new Date().toISOString();
    await sb.from("garage_gmail_outbox").update({
      status: "sent",
      gmail_message_id: gmailMessageId,
      gmail_thread_id: gmailThreadId,
      sent_at: sentAt,
      error_text: null,
    }).eq("id", outId);
    await sb.from("garage_cases").update({ gmail_thread_id: gmailThreadId, updated_at: sentAt }).eq("id", caseId);
    await addHistory(sb, {
      caseId,
      type: "sent",
      summary: `נשלח מייל · From ${ALLOWED_ACCOUNT} · To ${to} · ${subject}`,
      actorId: user.id,
      actorName,
      outboxId: outId,
      messageId: gmailMessageId,
      threadId: gmailThreadId,
      payload: { to, cc, subject, files: attached.map((a) => a.name), from: ALLOWED_ACCOUNT },
    });
    return jsonResponse({
      success: true,
      realEmailSend: true,
      from: ALLOWED_ACCOUNT,
      to,
      cc: cc || null,
      subject,
      gmail_message_id: gmailMessageId,
      gmail_thread_id: gmailThreadId,
      send_id: outId,
      send_no: lockRow.send_no,
      files: attached,
      packageBytes,
      omitted: false,
    });
  }

  return jsonResponse({ success: false, error: "unknown_action" }, 400);
});
