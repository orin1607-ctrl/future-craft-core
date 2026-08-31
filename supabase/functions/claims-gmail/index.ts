/**
 * Claims Gmail — Staging only.
 * OAuth tokens stay on the server. No live send. No mailbox mutation of existing mail.
 */
import { edgeCorsHeaders, requireAuth, jsonResponse } from "../_shared/edgeAuth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ACCOUNT = "yoni122222@gmail.com";
const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
];
const BUCKET = "claims-docs";
const MAX_ATTACH = 80;
const MAX_BYTES = 12 * 1024 * 1024;
const BATCH = 12;
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/i;

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

function bytesToB64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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

function sanitizeName(name: string) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 60) || "file";
  return ext ? `${safe}.${ext}` : safe;
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
    return jsonResponse({
      success: true,
      connected: !!conn,
      email: conn?.connected_email || null,
      accountExpected: ALLOWED_ACCOUNT,
      sendEnabled: false,
      realEmailSend: false,
      scopes: SCOPES,
      canConnect: role === "super_admin",
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
    const { data } = await sb.from("claims_gmail_imports").select("id, gmail_message_id, gmail_thread_id, from_addr, subject, snippet, sent_at, attachment_count, imported_by_name, created_at").eq("claim_id", claimId).order("created_at", { ascending: false });
    return jsonResponse({ success: true, data: data || [] });
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

  if (action === "list_messages") {
    const claimId = String(body.claim_id || "");
    if (!claimId || !(await canWork(sb, user.id, role, claimId))) {
      return jsonResponse({ success: false, error: "forbidden_claim" }, 403);
    }
    const q = String(body.q || "newer_than:30d").slice(0, 180);
    const listed = await gmailGet(access, `messages?maxResults=20&q=${encodeURIComponent(q)}`);
    const messages: Array<Record<string, unknown>> = [];
    for (const m of (listed.messages || []).slice(0, 20)) {
      const full = await gmailGet(access, `messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
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
    const files = parts
      .filter((p) => p.filename)
      .map((p) => ({
        filename: String(p.filename),
        mime: String(p.mimeType || ""),
        size: Number((p.body as { size?: number } | undefined)?.size || 0),
        attachmentId: (p.body as { attachmentId?: string } | undefined)?.attachmentId || "",
      }));
    const htmlPart = parts.find((p) => p.mimeType === "text/html");
    const textPart = parts.find((p) => p.mimeType === "text/plain");
    return jsonResponse({
      success: true,
      message: {
        id: full.id,
        threadId: full.threadId,
        from: header(headers, "From"),
        subject: header(headers, "Subject"),
        date: header(headers, "Date"),
        bodyText: decodeBody(textPart) || decodeBody(htmlPart).replace(/<[^>]+>/g, " ").slice(0, 8000),
        attachments: files,
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
    const start = Number(body.start || 0) || 0;
    const { data: profile } = await sb.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const actorName = profile?.full_name || user.email || user.id;

    const full = await gmailGet(access, `messages/${encodeURIComponent(messageId)}?format=full`);
    const headers = full.payload?.headers as Array<{ name?: string; value?: string }> | undefined;
    const threadId = String(full.threadId || "");
    const parts: Array<Record<string, unknown>> = [];
    if (full.payload) walkParts(full.payload as Record<string, unknown>, parts);
    const files = parts.filter((p) => String(p.filename || "").trim());
    const htmlPart = parts.find((p) => p.mimeType === "text/html");
    const textPart = parts.find((p) => p.mimeType === "text/plain");
    const bodyText = decodeBody(textPart) || decodeBody(htmlPart).replace(/<[^>]+>/g, " ").slice(0, 12000);

    if (start === 0) {
      await sb.from("claims_gmail_imports").upsert({
        id: `GIM-${claimId}-${String(full.id)}`.slice(0, 80),
        claim_id: claimId,
        gmail_message_id: String(full.id),
        gmail_thread_id: threadId,
        from_addr: header(headers, "From"),
        subject: header(headers, "Subject"),
        snippet: full.snippet || "",
        body_text: bodyText,
        sent_at: full.internalDate ? new Date(Number(full.internalDate)).toISOString() : null,
        attachment_count: Math.min(files.length, MAX_ATTACH),
        imported_by: user.id,
        imported_by_name: actorName,
      }, { onConflict: "id" });
      await sb.from("claims_records").update({
        gmail_message_id: String(full.id),
        gmail_thread_id: threadId,
        last_activity_at: new Date().toISOString(),
      }).eq("id", claimId);
    }

    const slice = files.slice(start, Math.min(files.length, start + BATCH, MAX_ATTACH));
    let uploaded = 0;
    for (const p of slice) {
      const filename = sanitizeName(String(p.filename));
      const mime = String(p.mimeType || "application/octet-stream");
      const attId = (p.body as { attachmentId?: string; data?: string } | undefined)?.attachmentId;
      const inline = (p.body as { data?: string } | undefined)?.data;
      let bytes: Uint8Array | null = null;
      if (inline) bytes = b64urlToBytes(inline);
      else if (attId) {
        const att = await gmailGet(access, `messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attId)}`);
        bytes = b64urlToBytes(String(att.data || ""));
      }
      if (!bytes || bytes.byteLength === 0) continue;
      if (bytes.byteLength > MAX_BYTES) continue;
      if (mime && !ALLOWED_MIME.test(mime) && !/\.(jpg|jpeg|png|gif|webp|pdf|heic)$/i.test(filename)) continue;
      const path = `${claimId}/gmail/${full.id}/${nid("F")}-${filename}`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, {
        contentType: mime || "application/octet-stream",
        upsert: false,
      });
      if (upErr) continue;
      await sb.from("claims_documents").insert({
        id: nid("CDM"),
        claim_id: claimId,
        storage_path: path,
        original_name: String(p.filename),
        mime_type: mime,
        byte_size: bytes.byteLength,
        source: "gmail",
        gmail_message_id: String(full.id),
        gmail_thread_id: threadId,
        gmail_attachment_id: attId || null,
        uploaded_by: user.id,
        uploaded_by_name: actorName,
      });
      uploaded += 1;
    }

    const next = start + slice.length;
    const done = next >= Math.min(files.length, MAX_ATTACH);
    if (done) {
      await sb.from("claims_history").insert({
        id: nid("HIS"),
        claim_id: claimId,
        row_data: {
          action: "יובא מייל מ-Gmail כולל כל המצורפים",
          note: `${header(headers, "Subject")} · ${Math.min(files.length, MAX_ATTACH)} קבצים`,
          type: "gmail_import",
          by: actorName,
          at: new Date().toLocaleString("he-IL"),
          gmail_message_id: full.id,
          gmail_thread_id: threadId,
        },
      });
    }
    return jsonResponse({
      success: true,
      done,
      start: next,
      uploaded,
      total: Math.min(files.length, MAX_ATTACH),
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
    const requestedSubject = String(body.subject || `טיוטה תביעה ${claimId}`);
    const subject = requestedSubject.includes("לא לשלוח")
      ? requestedSubject
      : `[STAGING-QA-DO-NOT-SEND] ${requestedSubject}`;
    const text = `[STAGING QA — טיוטה בלבד, לא לשלוח לחברת ביטוח]\n\n${String(body.body || "")}`;
    if (!to) return jsonResponse({ success: false, error: "to required" }, 400);
    const raw = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      text,
    ].join("\r\n");
    const encoded = bytesToB64url(new TextEncoder().encode(raw));
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { raw: encoded, threadId: body.thread_id || undefined } }),
    });
    const json = await res.json();
    if (!res.ok) return jsonResponse({ success: false, error: json.error?.message || "draft_failed", realEmailSend: false }, 400);
    const { data: profile } = await sb.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    await sb.from("claims_history").insert({
      id: nid("HIS"),
      claim_id: claimId,
      row_data: {
        action: "נוצרה טיוטת Gmail (לא נשלח)",
        note: subject,
        type: "gmail_draft",
        by: profile?.full_name || user.email,
        at: new Date().toLocaleString("he-IL"),
        gmail_draft_id: json.id,
        gmail_message_id: json.message?.id,
        gmail_thread_id: json.message?.threadId,
      },
    });
    if (json.message?.id) {
      await sb.from("claims_records").update({
        gmail_message_id: json.message.id,
        gmail_thread_id: json.message.threadId || null,
        last_activity_at: new Date().toISOString(),
      }).eq("id", claimId);
    }
    return jsonResponse({
      success: true,
      draftId: json.id,
      gmail_message_id: json.message?.id || null,
      gmail_thread_id: json.message?.threadId || null,
      realEmailSend: false,
      sent: false,
    });
  }

  return jsonResponse({ success: false, error: "unknown_action" }, 400);
});

function whyScope(s: string) {
  if (s === "openid") return "זיהוי חשבון Google בלי לגשת לתוכן.";
  if (s.includes("userinfo.email")) return "לוודא שהחשבון הוא בדיוק yoni122222@gmail.com.";
  if (s.includes("gmail.readonly")) return "קריאת מיילים ומצורפים לייבוא לתביעה. לא מוחק, לא מסמן כנקרא, לא מעביר.";
  if (s.includes("gmail.compose")) return "יצירת טיוטה בלבד. האפליקציה חוסמת send. Google עצמו מאפשר שליחה ב-scope הזה — אנחנו לא קוראים ל-send.";
  return s;
}
