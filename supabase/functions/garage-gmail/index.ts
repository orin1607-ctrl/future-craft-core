/**
 * Garage Gmail — Oren Car PUBLIC STAGING only.
 * Mailbox: yoni191177@gmail.com
 * Never Claims Gmail function, never Claims token table, never yoni122222, never Claims storage.
 */
import { edgeCorsHeaders, requireAuth, jsonResponse } from "../_shared/edgeAuth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  CLAIMS_MAILBOX,
  GARAGE_MAILBOX,
  garageMailIsClaimsMailbox,
  matchGarageMail,
  type GarageMatchCase,
} from "./matchGarage.ts";

const STAGING_REF = "usfeoerkpcafxxlyuldl";
const PROD_REF = "qasomfndnjuixgjmjwcm";
const ALLOWED_ACCOUNT = GARAGE_MAILBOX;
const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
];
const PAGES_REDIRECT = "https://orin1607-ctrl.github.io/future-craft-core/oauth/google-callback.html";
const FUNCTION_REDIRECT = `https://${STAGING_REF}.supabase.co/functions/v1/garage-gmail`;
const BUCKET = "garage-media";

function admin() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  if (url.includes(PROD_REF)) throw new Error("refusing_production_project");
  if (!url.includes(STAGING_REF) && url) throw new Error("refusing_non_staging_project");
  return createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function oauthClient() {
  const googleId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
  const googleSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
  if (googleId && googleSecret) return { clientId: googleId, clientSecret: googleSecret, source: "GOOGLE" };
  const claimsId = Deno.env.get("CLAIMS_GOOGLE_CLIENT_ID") || "";
  const claimsSecret = Deno.env.get("CLAIMS_GOOGLE_CLIENT_SECRET") || "";
  if (claimsId && claimsSecret) return { clientId: claimsId, clientSecret: claimsSecret, source: "CLAIMS_APP" };
  return null;
}

function isMissingRelation(error: { message?: string; code?: string } | null | undefined) {
  const m = `${error?.message || ""} ${error?.code || ""}`;
  return /schema cache|could not find the table|does not exist|PGRST205|42P01/i.test(m);
}

async function hmacHex(message: string) {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "garage-gmail-state";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function makeOauthState(preferPages: boolean) {
  const nonce = crypto.randomUUID();
  const ts = Date.now().toString();
  const kind = preferPages ? "pages" : "fn";
  const payload = `garage-gmail.${kind}.${nonce}.${ts}`;
  return `${payload}.${await hmacHex(payload)}`;
}

async function oauthStateOk(state: string) {
  const parts = String(state || "").split(".");
  if (parts.length !== 5 || parts[0] !== "garage-gmail") return false;
  if (parts[1] !== "pages" && parts[1] !== "fn") return false;
  const ts = Number(parts[3] || 0);
  if (!ts || Math.abs(Date.now() - ts) > 45 * 60 * 1000) return false;
  const sig = parts[4];
  const payload = parts.slice(0, 4).join(".");
  const expect = await hmacHex(payload);
  if (sig.length !== expect.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expect.charCodeAt(i);
  return diff === 0;
}

function htmlPage(ok: boolean, text: string) {
  const color = ok ? "#22c55e" : "#ef4444";
  return new Response(
    `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;background:#071022;color:#fff;padding:40px;text-align:center">
     <h1 style="color:${color}">${ok ? "החיבור הצליח" : "שגיאה בחיבור"}</h1>
     <p>${text}</p><p>אפשר לסגור את החלון ולחזור לניהול המוסך.</p></body>`,
    { headers: { ...edgeCorsHeaders, "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function googleAccessToken(refreshToken: string, client: { clientId: string; clientSecret: string }) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(String(json.error_description || json.error || "token_refresh_failed"));
  return { access: String(json.access_token), newRefresh: json.refresh_token ? String(json.refresh_token) : "" };
}

async function userinfoEmail(access: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${access}` },
  });
  const json = await res.json();
  return String(json.email || "").toLowerCase();
}

async function loadConnection(sb: ReturnType<typeof admin>) {
  const { data, error } = await sb.from("garage_gmail_connection").select("*").eq("id", "staging").maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return null;
    throw new Error(error.message);
  }
  return data as {
    id: string;
    connected_email: string;
    refresh_token: string;
    oauth_state: string;
    last_ok_at?: string;
    revoked_at?: string;
  } | null;
}

async function saveConnection(
  sb: ReturnType<typeof admin>,
  patch: Record<string, unknown>,
) {
  const existing = await loadConnection(sb);
  const row = {
    id: "staging",
    connected_email: existing?.connected_email || "",
    refresh_token: existing?.refresh_token || "",
    oauth_state: existing?.oauth_state || "",
    last_ok_at: existing?.last_ok_at ?? null,
    revoked_at: existing?.revoked_at ?? null,
    updated_at: new Date().toISOString(),
    ...patch,
  };
  const { error } = await sb.from("garage_gmail_connection").upsert(row, { onConflict: "id" });
  if (error) {
    if (isMissingRelation(error)) return false;
    throw new Error(error.message);
  }
  return true;
}

async function softUpsert(
  sb: ReturnType<typeof admin>,
  table: "garage_gmail_pending" | "garage_gmail_imports",
  row: Record<string, unknown>,
  onConflict: string,
) {
  const { error } = await sb.from(table).upsert(row, { onConflict });
  if (error && !isMissingRelation(error)) {
    /* keep the scan going even if auxiliary tables fail */
  }
}

async function resolveGarageRefresh(
  sb: ReturnType<typeof admin>,
  client: { clientId: string; clientSecret: string } | null,
) {
  const conn = await loadConnection(sb);
  if (conn?.refresh_token && String(conn.connected_email || "").toLowerCase() === ALLOWED_ACCOUNT && !conn.revoked_at) {
    return { refresh: conn.refresh_token, email: ALLOWED_ACCOUNT, source: "table", probe: { ok: true as const } };
  }
  const envRefresh = Deno.env.get("GARAGE_GOOGLE_REFRESH_TOKEN") || Deno.env.get("GOOGLE_REFRESH_TOKEN") || "";
  if (envRefresh && client) {
    try {
      const tok = await googleAccessToken(envRefresh, client);
      const email = await userinfoEmail(tok.access);
      if (email === ALLOWED_ACCOUNT) {
        const refresh = tok.newRefresh || envRefresh;
        await saveConnection(sb, {
          connected_email: email,
          refresh_token: refresh,
          last_ok_at: new Date().toISOString(),
          revoked_at: null,
        });
        return { refresh, email, source: "env", probe: { ok: true as const } };
      }
      return {
        refresh: "",
        email: "",
        source: "none",
        probe: { ok: false as const, error: `existing_google_token_is_${email || "unknown"}_not_garage` },
      };
    } catch (e) {
      return {
        refresh: "",
        email: "",
        source: "none",
        probe: { ok: false as const, error: String((e as Error).message || e).slice(0, 120) },
      };
    }
  }
  return { refresh: "", email: conn?.connected_email || "", source: "none", probe: { ok: false as const } };
}

function b64url(raw: string) {
  const pad = raw.replace(/-/g, "+").replace(/_/g, "/");
  const buf = Uint8Array.from(atob(pad.padEnd(pad.length + (4 - pad.length % 4) % 4, "=")), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(buf);
}

function headerValue(headers: Array<{ name?: string; value?: string }> | undefined, name: string) {
  const want = name.toLowerCase();
  return String((headers || []).find((h) => String(h.name || "").toLowerCase() === want)?.value || "");
}

function collectParts(part: Record<string, unknown> | undefined, into: { text: string; filenames: string[]; parts: Array<{ filename: string; mime: string; attachId: string }> }) {
  if (!part) return;
  const filename = String(part.filename || "");
  const mime = String(part.mimeType || "");
  const body = (part.body || {}) as { data?: string; attachmentId?: string };
  if (filename) {
    into.filenames.push(filename);
    if (body.attachmentId) into.parts.push({ filename, mime, attachId: String(body.attachmentId) });
  }
  if (body.data && /^text\/(plain|html)/i.test(mime)) {
    const text = b64url(body.data).replace(/<[^>]+>/g, " ");
    into.text += `\n${text}`;
  }
  for (const child of (part.parts as Array<Record<string, unknown>> || [])) collectParts(child, into);
}

function classifyCategory(input: { subject?: string; filename?: string }) {
  const hay = `${input.subject || ""} ${input.filename || ""}`.toLowerCase();
  if (/מתומחר|אישור מחיר|approved/.test(hay)) return "customer_approvals";
  if (/הזמנה|order|po[-_ ]/.test(hay)) return "customer_order";
  if (/\.pdf$|חשבונית|invoice/.test(hay)) return "parts_invoices";
  if (/\.(jpe?g|png|webp)$/.test(hay) || /תמונ/.test(hay)) return "quote_photos";
  return "other";
}

async function gmailGet(access: string, path: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(String(json.error?.message || json.error || "gmail_get_failed"));
  return json;
}

function caseRowsToMatch(rows: Array<Record<string, unknown>>): GarageMatchCase[] {
  return rows.map((c) => {
    const data = (c.case_data && typeof c.case_data === "object") ? c.case_data as Record<string, unknown> : {};
    const correspondence = Array.isArray(data.correspondence) ? data.correspondence as Array<Record<string, unknown>> : [];
    return {
      id: String(c.id || ""),
      case_number: String(c.case_number || ""),
      plate: String(c.vehicle_plate_snapshot || ""),
      customer_name: String(c.customer_name_snapshot || ""),
      order_number: String(data.workOrderNumber || ""),
      case_ref: String(data.workOrderRef || ""),
      threads: [...new Set(correspondence.map((m) => String(m.gmail_thread_id || "")).filter(Boolean))],
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: edgeCorsHeaders });

  const url = new URL(req.url);
    const qsAction = url.searchParams.get("action") || "";
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { body = {}; }
    }
    let action = String(body.action || qsAction || "");
    if (!action && url.searchParams.get("code") && url.searchParams.get("state")) action = "oauth_callback";
    if (!action) action = "status";

  try {
    if (Deno.env.get("SUPABASE_URL")?.includes(PROD_REF)) {
      return jsonResponse({ success: false, error: "production_forbidden" }, 403);
    }

    const sb = admin();

    if (action === "oauth_callback") {
      const code = String(body.code || url.searchParams.get("code") || "");
      const state = String(body.state || url.searchParams.get("state") || "");
      const conn = await loadConnection(sb);
      const signedOk = await oauthStateOk(state);
      if (!code || !state || (!signedOk && (!conn?.oauth_state || state !== conn.oauth_state))) {
        return req.method === "GET" ? htmlPage(false, "state לא תואם. פתחו מחדש את חיבור Gmail מניהול המוסך.") : jsonResponse({ success: false, error: "oauth_state_mismatch" }, 400);
      }
      const client = oauthClient();
      if (!client) return jsonResponse({ success: false, error: "oauth_client_missing" }, 503);
      const redirectUri = state.includes("pages") ? PAGES_REDIRECT : FUNCTION_REDIRECT;
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
      if (garageMailIsClaimsMailbox(email) || email === CLAIMS_MAILBOX) {
        return jsonResponse({ success: false, error: "claims_mailbox_forbidden" }, 403);
      }
      if (email !== ALLOWED_ACCOUNT) {
        const blocked = email === "orin1607@gmail.com"
          ? `החשבון שאושר הוא orin1607@gmail.com. לא מחברים אותו לניהול המוסך. צריך בדיוק ${ALLOWED_ACCOUNT}.`
          : `החשבון שאושר הוא ${email || "לא ידוע"}. צריך בדיוק ${ALLOWED_ACCOUNT}. לא orin1607 ולא Claims.`;
        return req.method === "GET"
          ? htmlPage(false, blocked)
          : jsonResponse({ success: false, error: "wrong_account", email }, 403);
      }
      await saveConnection(sb, {
        connected_email: email,
        refresh_token: String(tok.refresh_token),
        oauth_state: "",
        last_ok_at: new Date().toISOString(),
        revoked_at: null,
      });
      return req.method === "GET"
        ? htmlPage(true, `${ALLOWED_ACCOUNT} מחובר לסריקת ניהול המוסך.`)
        : jsonResponse({ success: true, connected: true, email, mailbox: ALLOWED_ACCOUNT });
    }

    const auth = await requireAuth(req, { roles: ["super_admin"] });
    if ("error" in auth) return auth.error;

    if (action === "oauth_start") {
      const client = oauthClient();
      if (!client) return jsonResponse({ success: false, error: "oauth_client_missing", pending: true }, 503);
      const preferPages = body.preferPages === true;
      const nonce = await makeOauthState(preferPages);
      await saveConnection(sb, { oauth_state: nonce });
      const redirectUri = preferPages ? PAGES_REDIRECT : FUNCTION_REDIRECT;
      const params = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        access_type: "offline",
        prompt: "consent",
        login_hint: ALLOWED_ACCOUNT,
        scope: SCOPES.join(" "),
        state: nonce,
      });
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      return jsonResponse({
        success: true,
        authUrl,
        clientId: client.clientId,
        redirectUri,
        mailbox: ALLOWED_ACCOUNT,
        clientSource: client.source,
        note: "יש להתחבר בדיוק עם yoni191177@gmail.com. לא yoni122222 ולא Claims.",
      });
    }

    if (action === "status") {
      const client = oauthClient();
      const resolved = await resolveGarageRefresh(sb, client);
      const connected = Boolean(resolved.refresh);
      if (connected) await saveConnection(sb, { last_ok_at: new Date().toISOString() });
      return jsonResponse({
        success: true,
        ok: connected,
        connected,
        pending: !connected,
        mailbox: ALLOWED_ACCOUNT,
        email: connected ? ALLOWED_ACCOUNT : (resolved.email || null),
        claimsMailboxUntouched: CLAIMS_MAILBOX,
        clientPresent: Boolean(client),
        clientId: client?.clientId || null,
        clientSource: client?.source || null,
        tokenSource: resolved.source,
        probe: resolved.probe,
      });
    }

    if (action === "scan_inbox") {
      const client = oauthClient();
      if (!client) return jsonResponse({ success: false, pending: true, error: "oauth_client_missing" }, 503);
      const resolved = await resolveGarageRefresh(sb, client);
      if (!resolved.refresh) {
        return jsonResponse({
          success: false,
          pending: true,
          error: resolved.probe.error || "gmail_not_connected",
          mailbox: ALLOWED_ACCOUNT,
        }, 409);
      }
      const tok = await googleAccessToken(resolved.refresh, client);
      if (tok.newRefresh) await saveConnection(sb, { refresh_token: tok.newRefresh, last_ok_at: new Date().toISOString() });
      const listed = await gmailGet(tok.access, "messages?q=" + encodeURIComponent("in:inbox newer_than:14d") + "&maxResults=25");
      const ids: string[] = (listed.messages || []).map((m: { id: string }) => m.id).filter(Boolean);
      const { data: cases } = await sb.from("garage_cases").select("id, case_number, vehicle_plate_snapshot, customer_name_snapshot, case_data").limit(200);
      const matchCases = caseRowsToMatch((cases || []) as Array<Record<string, unknown>>);
      const messages = [];
      const matched = [];
      const needs_review = [];

      for (const id of ids) {
        const raw = await gmailGet(tok.access, `messages/${id}?format=full`);
        const payload = (raw.payload || {}) as Record<string, unknown>;
        const headers = payload.headers as Array<{ name?: string; value?: string }> | undefined;
        const collected = { text: "", filenames: [] as string[], parts: [] as Array<{ filename: string; mime: string; attachId: string }> };
        collectParts(payload, collected);
        const mail = {
          messageId: id,
          threadId: String(raw.threadId || ""),
          subject: headerValue(headers, "Subject"),
          body: collected.text.slice(0, 8000),
          from: headerValue(headers, "From"),
          to: headerValue(headers, "To") || ALLOWED_ACCOUNT,
          filenames: collected.filenames,
          sentAt: raw.internalDate ? new Date(Number(raw.internalDate)).toISOString() : new Date().toISOString(),
        };
        if (garageMailIsClaimsMailbox(mail.to) || garageMailIsClaimsMailbox(mail.from)) continue;
        const match = matchGarageMail(mail, matchCases);
        const row = { mail, match };
        messages.push({ ...mail, match });
        if (match.decision !== "auto" || !match.caseId) {
          needs_review.push(row);
          await softUpsert(sb, "garage_gmail_pending", {
            gmail_message_id: id,
            gmail_thread_id: mail.threadId,
            subject: mail.subject,
            from_addr: mail.from,
            to_addr: mail.to,
            sent_at: mail.sentAt,
            snippet: mail.body.slice(0, 500),
            reason: match.reason,
            candidates: match.candidates,
            decision: "needs_review",
          }, "gmail_message_id");
          continue;
        }
        matched.push(row);
        const { data: loaded } = await sb.from("garage_cases").select("*").eq("id", match.caseId).maybeSingle();
        if (!loaded) continue;
        const data = (loaded.case_data && typeof loaded.case_data === "object") ? { ...loaded.case_data as Record<string, unknown> } : {};
        const cards = Array.isArray(data.correspondence) ? [...data.correspondence as Array<Record<string, unknown>>] : [];
        if (!cards.some((c) => c.gmail_message_id === id)) {
          cards.push({
            id,
            gmail_message_id: id,
            gmail_thread_id: mail.threadId,
            subject: mail.subject,
            from_addr: mail.from,
            to_addr: mail.to,
            sent_at: mail.sentAt,
            body_text: mail.body,
            direction: "incoming",
            source: "import",
            file_names: mail.filenames,
            unread: true,
          });
        }
        data.correspondence = cards;
        data.unreadMail = true;
        const hay = `${mail.subject}\n${mail.body}\n${mail.filenames.join(" ")}`;
        const hinted = /הזמנה מתומחרת|מתומחרת|אישור מחיר|אושר לתשלום|סכום מאושר|לתשלום|approved amount/i.test(hay);
        const money = hay.match(/(?:סה["״']?כ(?:\s+לתשלום)?|סכום מאושר|מחיר מאושר|לתשלום|total|amount)[^\d₪]{0,24}([₪\d.,]+)/i);
        const rawAmt = money ? Number(String(money[1]).replace(/[^\d.]/g, "").replace(/,/g, "")) : NaN;
        const detectedAmount = Number.isFinite(rawAmt) && rawAmt >= 10 && rawAmt <= 10_000_000 ? Math.round(rawAmt) : null;
        const sent = Number(data.finalApprovedAmount) || Number(data.workOrderAmount) || null;
        if (detectedAmount || hinted) {
          const mismatch = Boolean(sent && detectedAmount && sent !== detectedAmount);
          data.priceReview = {
            status: "priced_order_received",
            detectedAmount,
            sentAmount: sent && sent > 0 ? sent : null,
            compare: mismatch ? "mismatch" : (sent && detectedAmount && sent === detectedAmount ? "match" : "unknown"),
            compareMessage: mismatch ? `פער במחיר: נשלח ${sent} ₪ · חזר ${detectedAmount} ₪. לא מעדכנים אוטומטית.` : "",
            detectionLabel: detectedAmount ? `נמצא מחיר מאושר/מתומחר: ${detectedAmount} ₪` : "ייתכן אישור מחיר — דורש בדיקה ידנית",
            sourceMailId: id,
          };
        }
        const timeline = Array.isArray(data.timeline) ? [...data.timeline as Array<Record<string, unknown>>] : [];
        timeline.push({ at: new Date().toISOString(), text: `התקבל מייל חדש · ${mail.subject || "ללא נושא"} · שויך לתיק` });
        if (mail.filenames.length) timeline.push({ at: new Date().toISOString(), text: `קובץ התקבל במייל · ${mail.filenames.join(", ")}` });
        if (detectedAmount) timeline.push({ at: new Date().toISOString(), text: `הזמנה מתומחרת / מחיר זוהה: ${detectedAmount} ₪ · ממתין לאישור עובד` });
        data.timeline = timeline;
        await sb.from("garage_cases").update({ case_data: data }).eq("id", match.caseId);
        await softUpsert(sb, "garage_gmail_imports", {
          garage_case_id: match.caseId,
          gmail_message_id: id,
          gmail_thread_id: mail.threadId,
          subject: mail.subject,
          from_addr: mail.from,
          to_addr: mail.to,
          sent_at: mail.sentAt,
          body_text: mail.body,
          direction: "incoming",
          file_names: mail.filenames,
        }, "gmail_message_id");
        for (const att of collected.parts.slice(0, 8)) {
          try {
            const bin = await gmailGet(tok.access, `messages/${id}/attachments/${att.attachId}`);
            const bytes = Uint8Array.from(atob(String(bin.data || "").replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
            const category = classifyCategory({ subject: mail.subject, filename: att.filename });
            const path = `${match.caseId}/${category}/${crypto.randomUUID()}-${att.filename.replace(/[^\w.\u0590-\u05FF-]+/g, "_")}`;
            await sb.storage.from(BUCKET).upload(path, bytes, { contentType: att.mime || "application/octet-stream", upsert: false });
            await sb.from("garage_media").insert({
              garage_case_id: match.caseId,
              category,
              title: att.filename,
              storage_path: path,
              mime_type: att.mime || "",
              byte_size: bytes.byteLength,
            });
          } catch {
            /* keep mail even if one attachment fails */
          }
        }
      }

      await saveConnection(sb, { last_ok_at: new Date().toISOString() });
      return jsonResponse({
        success: true,
        pending: false,
        connected: true,
        mailbox: ALLOWED_ACCOUNT,
        scanned: ids.length,
        messages,
        matched,
        needs_review,
      });
    }

    if (action === "list_pending") {
      const { data, error } = await sb.from("garage_gmail_pending").select("id, gmail_message_id, subject, from_addr, sent_at, reason, candidates, decision").eq("decision", "needs_review").order("created_at", { ascending: false }).limit(50);
      if (error && isMissingRelation(error)) return jsonResponse({ success: true, data: [] });
      if (error) throw new Error(error.message);
      return jsonResponse({ success: true, data: data || [] });
    }

    return jsonResponse({ success: false, error: "unknown_action" }, 400);
  } catch (error) {
    const message = String((error as Error).message || error).slice(0, 240);
    return jsonResponse({ success: false, error: message, pending: /not_connected|oauth|token/i.test(message) }, 500);
  }
});
