// marketing-hub — Media Library + B2B Outreach for the Marketing Center (ניהול שיווק 2). STAGING ONLY.
//
// Security: every route requires `x-social-key` = owner key or a paired device token (see _shared/socialAuth.ts).
// Tables are service-role only; every query is scoped by business_id.
// Outreach never sends anything by itself: it prepares messages and a work queue, and a person sends
// through the channel's own app (Messenger / Instagram / WhatsApp / mail). See OUTREACH_POLICY below.
// OpenProspector (nr_businesses) is read-only here: search + import of up to 50 chosen businesses.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkSocialKey, listDevices, pairComplete, pairStart, revokeDevice } from "../_shared/socialAuth.ts";

const BUCKET = "media-library";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-social-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const env = (k: string) => (Deno.env.get(k) || "").trim();

const must = <T>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data; };

async function business(id: string) {
  const { data } = await db.from("social_businesses").select("id,name,website").eq("id", id).maybeSingle();
  if (!data) throw new Error("עסק לא מוכר");
  return data;
}

/* =============== Media library =============== */
const MEDIA_COLS = "id,parent_id,title,category,tags,url,thumb_url,mime,bytes,width,height,preset,sort_order,created_at";

async function mediaList(biz: string, b: any) {
  let q = db.from("media_assets").select(MEDIA_COLS).eq("business_id", biz).is("deleted_at", null)
    .order("sort_order", { ascending: false }).limit(Math.min(Number(b.limit) || 500, 1000));
  if (b.category) q = q.eq("category", b.category);
  if (b.q) q = q.or(`title.ilike.%${String(b.q).replace(/[%,()]/g, "")}%,tags.cs.{${String(b.q).replace(/[{},"]/g, "")}}`);
  const assets = must(await q) as any[];
  const cats = must(await db.from("media_assets").select("category").eq("business_id", biz).is("deleted_at", null)) as any[];
  return {
    assets,
    categories: [...new Set(cats.map((c) => c.category))].sort(),
    totalBytes: assets.reduce((s, a) => s + (a.bytes || 0), 0),
  };
}

// Signed upload URLs let the browser upload straight to Storage (fast for 100 files, no base64 through the function).
async function mediaSign(biz: string, files: any[]) {
  if (!Array.isArray(files) || !files.length || files.length > 120) throw new Error("יש לשלוח בין 1 ל-120 קבצים");
  const day = new Date().toISOString().slice(0, 10);
  const out = [];
  for (const f of files) {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(f.mime || "")) throw new Error(`סוג קובץ לא נתמך: ${f.name}`);
    if ((f.bytes || 0) > 25 * 1024 * 1024) throw new Error(`הקובץ ${f.name} גדול מ-25MB`);
    const ext = f.mime.split("/")[1].replace("jpeg", "jpg");
    const id = crypto.randomUUID();
    const path = `${biz}/${day}/${id}.${ext}`;
    const thumb = `${biz}/${day}/${id}_t.jpg`;
    const a = must(await db.storage.from(BUCKET).createSignedUploadUrl(path)) as any;
    const t = must(await db.storage.from(BUCKET).createSignedUploadUrl(thumb)) as any;
    out.push({ key: f.key, path, uploadUrl: a.signedUrl, thumbPath: thumb, thumbUploadUrl: t.signedUrl });
  }
  return { uploads: out };
}

async function mediaRegister(biz: string, items: any[]) {
  if (!Array.isArray(items) || !items.length) throw new Error("אין פריטים לרישום");
  const pub = (p: string) => db.storage.from(BUCKET).getPublicUrl(p).data.publicUrl;
  const rows = [];
  for (const it of items) {
    if (!String(it.path || "").startsWith(biz + "/")) throw new Error("נתיב קובץ לא שייך לעסק");
    if (it.thumb_path && !String(it.thumb_path).startsWith(biz + "/")) throw new Error("נתיב קובץ לא שייך לעסק");
    if (it.parent_id) {
      const { data: p } = await db.from("media_assets").select("business_id").eq("id", it.parent_id).maybeSingle();
      if (!p || p.business_id !== biz) throw new Error("תמונת המקור לא נמצאה בעסק");
    }
    rows.push({
      business_id: biz, parent_id: it.parent_id || null, title: String(it.title || "").slice(0, 200),
      category: String(it.category || "כללי").slice(0, 60), tags: (it.tags || []).slice(0, 20).map(String),
      path: it.path, url: pub(it.path), thumb_path: it.thumb_path || null, thumb_url: it.thumb_path ? pub(it.thumb_path) : null,
      mime: it.mime, bytes: it.bytes, width: it.width, height: it.height, preset: it.preset || null,
    });
  }
  return { assets: must(await db.from("media_assets").insert(rows).select(MEDIA_COLS)) };
}

async function mediaUpdate(biz: string, b: any) {
  const patch: any = { updated_at: new Date().toISOString() };
  if (b.title !== undefined) patch.title = String(b.title).slice(0, 200);
  if (b.category !== undefined) patch.category = String(b.category || "כללי").slice(0, 60);
  if (b.tags !== undefined) patch.tags = (b.tags || []).slice(0, 20).map(String);
  const ids: string[] = b.ids || [b.id];
  return { assets: must(await db.from("media_assets").update(patch).eq("business_id", biz).in("id", ids).select(MEDIA_COLS)) };
}

async function mediaReorder(biz: string, ids: string[]) {
  const top = Date.now() / 1000;
  for (let i = 0; i < ids.length; i++) {
    must(await db.from("media_assets").update({ sort_order: top - i }).eq("business_id", biz).eq("id", ids[i]));
  }
  return { ok: true };
}

async function mediaDelete(biz: string, ids: string[]) {
  const rows = must(await db.from("media_assets").select("id,path,thumb_path").eq("business_id", biz).in("id", ids)) as any[];
  const paths = rows.flatMap((r) => [r.path, r.thumb_path].filter(Boolean));
  if (paths.length) await db.storage.from(BUCKET).remove(paths);
  must(await db.from("media_assets").delete().eq("business_id", biz).in("id", rows.map((r) => r.id)));
  return { deleted: rows.length };
}

/* =============== Outreach =============== */
// What Meta actually allows (verified against the connected app's permissions, Oct 2026):
//  - Messenger / Instagram DMs via API: only to people who messaged the Page/IG account first, inside the
//    24h window (or HUMAN_AGENT tag, 7 days) and only with pages_messaging / instagram_manage_messages
//    approved in App Review. Cold, business-initiated DMs to other businesses are not permitted.
//  - WhatsApp Business API: business-initiated only with an approved template AND prior opt-in.
// Therefore this module prepares messages and a queue; a person sends each one in the channel's own app.
const OUTREACH_POLICY = {
  automaticSend: false,
  channels: {
    facebook: { manual: true, api: "רק מענה למי שפנה לעמוד ב-24 השעות האחרונות; מחייב הרשאת pages_messaging ו-App Review" },
    instagram: { manual: true, api: "רק מענה למי שפנה לחשבון ב-24 השעות האחרונות; מחייב instagram_manage_messages ו-App Review" },
    whatsapp: { manual: true, api: "רק בתבנית מאושרת ולנמען שנתן הסכמה מראש (opt-in)" },
    email: { manual: true, api: "דורש בדיקת חוק הספאם (תיקון 40) לפני שליחה אוטומטית" },
    phone: { manual: true, api: "שיחה ידנית" },
  },
};

const STATUSES = ["new", "ready", "sent", "awaiting_reply", "interested", "not_interested", "customer"];
const normName = (s: string) => String(s || "").toLowerCase()
  .replace(/בע["״]?מ/g, "").replace(/["'״׳`]/g, "").replace(/\b(ltd|inc|llc)\b/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function normPhone(s?: string | null) {
  let d = String(s || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "972" + d.slice(1);
  return d.length >= 9 ? d : null;
}
function fbHandle(url?: string | null) {
  if (!url) return null;
  try {
    const u = new URL(/^https?:/.test(url) ? url : "https://" + url);
    if (!/facebook\.com|fb\.com|fb\.me/.test(u.hostname)) return null;
    if (u.pathname.startsWith("/profile.php")) return u.searchParams.get("id");
    const parts = u.pathname.split("/").filter(Boolean);
    // Share/plugin links and groups are not a business page; skip them.
    if (!parts.length || /^(sharer|sharer\.php|share|dialog|plugins|tr|groups|events|watch|login|hashtag|policies|help)$/i.test(parts[0])) return null;
    if (parts[0] === "pages") { const id = parts.find((p) => /^\d{6,}$/.test(p)); return id || null; }
    const h = decodeURIComponent(parts[0]).toLowerCase();
    // Scrapers sometimes store a website domain here (e.g. "www.example.co.il") — not a page username.
    if (/^www\.|\.(co\.il|org\.il|com|net|org|co)$/i.test(h)) return null;
    return /^[\p{L}\p{N}.\-]{2,80}$/u.test(h) ? h : null;
  } catch { return String(url).replace(/^@/, "").toLowerCase() || null; }
}
function igHandle(url?: string | null) {
  if (!url) return null;
  if (!/[/.]/.test(url)) return url.replace(/^@/, "").toLowerCase();
  try {
    const u = new URL(/^https?:/.test(url) ? url : "https://" + url);
    if (!/instagram\.com/.test(u.hostname)) return null;
    const h = u.pathname.split("/").filter(Boolean)[0];
    if (!h || /^(p|reel|reels|explore|stories|accounts|tv)$/i.test(h)) return null;
    return /^[a-z0-9._]{1,30}$/i.test(h) ? h.toLowerCase() : null;
  } catch { return null; }
}

const CONTACT_COLS = "id,company_name,contact_name,role,phone,email,website,facebook_url,facebook_handle,instagram_url,instagram_handle,whatsapp,city,industry,notes,tags,status,do_not_contact,dnc_reason,source,source_ref,next_action_at,last_contact_at,created_at,updated_at";

async function logEvent(biz: string, contactId: string, type: string, detail?: string, channel?: string) {
  await db.from("outreach_events").insert({ business_id: biz, contact_id: contactId, type, detail: detail || null, channel: channel || null });
}

function contactRow(biz: string, c: any) {
  const phone_norm = normPhone(c.phone) || normPhone(c.whatsapp);
  return {
    business_id: biz,
    company_name: String(c.company_name || "").trim().slice(0, 200),
    name_norm: normName(c.company_name),
    contact_name: c.contact_name || null, role: c.role || null,
    phone: c.phone || null, phone_norm, email: c.email ? String(c.email).trim().toLowerCase() : null,
    website: c.website || null,
    facebook_url: c.facebook_url || null, facebook_handle: fbHandle(c.facebook_url),
    instagram_url: c.instagram_url || null, instagram_handle: igHandle(c.instagram_url),
    whatsapp: c.whatsapp || null, city: c.city || null, industry: c.industry || null, notes: c.notes || null,
    tags: (c.tags || []).slice(0, 20).map(String),
    source: c.source || "manual", source_ref: c.source_ref || null,
    updated_at: new Date().toISOString(),
  };
}

async function findDuplicate(biz: string, row: any, exceptId?: string) {
  const qv = (v: string) => `"${String(v).replace(/["\\]/g, "")}"`;
  const ors = [`name_norm.eq.${qv(row.name_norm)}`];
  if (row.facebook_handle) ors.push(`facebook_handle.eq.${qv(row.facebook_handle)}`);
  if (row.instagram_handle) ors.push(`instagram_handle.eq.${qv(row.instagram_handle)}`);
  if (row.phone_norm) ors.push(`phone_norm.eq.${qv(row.phone_norm)}`);
  if (row.source_ref) ors.push(`source_ref.eq.${qv(row.source_ref)}`);
  let q = db.from("outreach_contacts").select("id,company_name,facebook_handle,instagram_handle,phone_norm,name_norm,source_ref")
    .eq("business_id", biz).or(ors.join(",")).limit(5);
  if (exceptId) q = q.neq("id", exceptId);
  const hits = must(await q) as any[];
  for (const h of hits) {
    const why = h.facebook_handle && h.facebook_handle === row.facebook_handle ? "אותו עמוד פייסבוק"
      : h.instagram_handle && h.instagram_handle === row.instagram_handle ? "אותו חשבון אינסטגרם"
      : h.phone_norm && h.phone_norm === row.phone_norm ? "אותו מספר טלפון"
      : h.source_ref && h.source_ref === row.source_ref ? "אותה רשומה מ-OpenProspector"
      : "אותו שם עסק";
    return { id: h.id, company_name: h.company_name, why, hard: why !== "אותו שם עסק" };
  }
  return null;
}

async function contactSave(biz: string, c: any, force = false) {
  const row = contactRow(biz, c);
  if (!row.company_name) throw new Error("שם החברה חובה");
  const dup = await findDuplicate(biz, row, c.id);
  if (dup && (dup.hard || !force)) return { duplicate: dup };
  if (c.id) {
    if (c.source === undefined) { delete (row as any).source; delete (row as any).source_ref; }
    const data = must(await db.from("outreach_contacts").update(row).eq("business_id", biz).eq("id", c.id).select(CONTACT_COLS).single());
    await logEvent(biz, c.id, "edited");
    return { contact: data };
  }
  const data: any = must(await db.from("outreach_contacts").insert(row).select(CONTACT_COLS).single());
  await logEvent(biz, data.id, "created", row.source === "manual" ? "נוסף ידנית" : `יובא מ-${row.source}`);
  return { contact: data };
}

async function contactsList(biz: string, b: any) {
  let q = db.from("outreach_contacts").select(CONTACT_COLS).eq("business_id", biz)
    .order("updated_at", { ascending: false }).limit(1000);
  if (b.status && STATUSES.includes(b.status)) q = q.eq("status", b.status);
  if (b.dnc === true) q = q.eq("do_not_contact", true);
  if (b.q) {
    const s = String(b.q).replace(/[%,()]/g, "");
    q = q.or(`company_name.ilike.%${s}%,contact_name.ilike.%${s}%,city.ilike.%${s}%,industry.ilike.%${s}%`);
  }
  const contacts = must(await q) as any[];
  const all = must(await db.from("outreach_contacts").select("status,do_not_contact,next_action_at").eq("business_id", biz)) as any[];
  const counts: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  let dnc = 0, followups = 0;
  const now = Date.now();
  for (const r of all) {
    counts[r.status] = (counts[r.status] || 0) + 1;
    if (r.do_not_contact) dnc++;
    else if (r.next_action_at && new Date(r.next_action_at).getTime() <= now) followups++;
  }
  const queued = await db.from("outreach_queue").select("id", { count: "exact", head: true })
    .eq("business_id", biz).eq("status", "queued").lte("due_at", new Date().toISOString());
  return { contacts, counts, dnc, followupsDue: followups, queuedDue: queued.count ?? 0, total: all.length, policy: OUTREACH_POLICY };
}

async function contactStatus(biz: string, b: any) {
  if (!STATUSES.includes(b.status)) throw new Error("סטטוס לא תקין");
  const patch: any = { status: b.status, updated_at: new Date().toISOString() };
  if (["not_interested", "customer"].includes(b.status)) patch.next_action_at = null;
  if (b.next_action_at !== undefined) patch.next_action_at = b.next_action_at;
  const data = must(await db.from("outreach_contacts").update(patch).eq("business_id", biz).in("id", b.ids || [b.id]).select(CONTACT_COLS)) as any[];
  for (const c of data) await logEvent(biz, c.id, "status", b.note ? `${b.status} — ${b.note}` : b.status);
  if (["not_interested", "customer"].includes(b.status)) {
    await db.from("outreach_queue").update({ status: "cancelled", done_at: new Date().toISOString() })
      .eq("business_id", biz).in("contact_id", data.map((c) => c.id)).eq("status", "queued");
  }
  return { contacts: data };
}

async function contactDnc(biz: string, b: any) {
  const data: any = must(await db.from("outreach_contacts").update({
    do_not_contact: !!b.on, dnc_reason: b.on ? (b.reason || "בקשת הלקוח") : null,
    next_action_at: b.on ? null : undefined, updated_at: new Date().toISOString(),
  }).eq("business_id", biz).eq("id", b.id).select(CONTACT_COLS).single());
  if (b.on) {
    await db.from("outreach_queue").update({ status: "cancelled", done_at: new Date().toISOString() })
      .eq("business_id", biz).eq("contact_id", b.id).eq("status", "queued");
  }
  await logEvent(biz, b.id, "dnc", b.on ? `הפניות נעצרו: ${data.dnc_reason}` : "הפניות חודשו");
  return { contact: data };
}

async function contactHistory(biz: string, id: string) {
  const events = must(await db.from("outreach_events").select("type,channel,detail,created_at")
    .eq("business_id", biz).eq("contact_id", id).order("created_at", { ascending: false }).limit(200));
  const queue = must(await db.from("outreach_queue").select("id,channel,status,due_at,done_at,body")
    .eq("business_id", biz).eq("contact_id", id).order("created_at", { ascending: false }).limit(50));
  return { events, queue };
}

async function contactDelete(biz: string, id: string) {
  must(await db.from("outreach_contacts").delete().eq("business_id", biz).eq("id", id));
  return { ok: true };
}

async function templatesList(biz: string) {
  return { templates: must(await db.from("outreach_templates").select("id,name,body,media_asset_id,updated_at").eq("business_id", biz).order("updated_at", { ascending: false })) };
}
async function templateSave(biz: string, t: any) {
  const row = { business_id: biz, name: String(t.name || "תבנית").slice(0, 80), body: String(t.body || ""), media_asset_id: t.media_asset_id || null, updated_at: new Date().toISOString() };
  if (!row.body.trim()) throw new Error("נוסח ההודעה ריק");
  const q = t.id ? db.from("outreach_templates").update(row).eq("business_id", biz).eq("id", t.id) : db.from("outreach_templates").insert(row);
  return { template: must(await q.select("id,name,body,media_asset_id,updated_at").single()) };
}
async function templateDelete(biz: string, id: string) {
  must(await db.from("outreach_templates").delete().eq("business_id", biz).eq("id", id));
  return { ok: true };
}

function render(tpl: string, c: any, ourName: string) {
  const v: Record<string, string> = {
    "שם_העסק": c.company_name || "", "איש_קשר": c.contact_name || "", "עיר": c.city || "",
    "תחום": c.industry || "", "העסק_שלנו": ourName,
  };
  return tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, k) => v[k] ?? "").replace(/[ \t]{2,}/g, " ").trim();
}
const hasChannel = (c: any, ch: string) =>
  ch === "facebook" ? !!c.facebook_handle : ch === "instagram" ? !!c.instagram_handle
  : ch === "whatsapp" ? !!(c.whatsapp || c.phone_norm) : ch === "email" ? !!c.email : !!c.phone;

async function queueCreate(biz: string, b: any) {
  const bizRow = await business(biz);
  if (!["facebook", "instagram", "whatsapp", "email", "phone"].includes(b.channel)) throw new Error("ערוץ לא תקין");
  let body = String(b.body || "");
  if (b.template_id) body = (must(await db.from("outreach_templates").select("body").eq("business_id", biz).eq("id", b.template_id).single()) as any).body;
  if (!body.trim()) throw new Error("נוסח ההודעה ריק");
  const ids: string[] = (b.contact_ids || []).slice(0, 500);
  const contacts = must(await db.from("outreach_contacts").select("*").eq("business_id", biz).in("id", ids)) as any[];
  const perDay = Math.max(0, Number(b.per_day) || 0);       // spread the queue over days (work-load, not automation)
  const start = b.due_at ? new Date(b.due_at) : new Date();
  const created: string[] = [], skipped: { name: string; why: string }[] = [];
  let n = 0;
  for (const c of contacts) {
    if (c.do_not_contact) { skipped.push({ name: c.company_name, why: "הפניות אליו נעצרו" }); continue; }
    if (["not_interested", "customer"].includes(c.status)) { skipped.push({ name: c.company_name, why: c.status === "customer" ? "כבר לקוח" : "לא מעוניין" }); continue; }
    if (!hasChannel(c, b.channel)) { skipped.push({ name: c.company_name, why: "אין פרטי קשר לערוץ הזה" }); continue; }
    const due = new Date(start.getTime() + (perDay ? Math.floor(n / perDay) * 864e5 : 0));
    const { data, error } = await db.from("outreach_queue").insert({
      business_id: biz, contact_id: c.id, template_id: b.template_id || null, channel: b.channel,
      body: render(body, c, bizRow.name), media_asset_id: b.media_asset_id || null, due_at: due.toISOString(),
    }).select("id").single();
    if (error) { skipped.push({ name: c.company_name, why: /duplicate|unique/i.test(error.message) ? "כבר יש לו פנייה פתוחה בערוץ הזה" : error.message }); continue; }
    created.push(data.id); n++;
    if (c.status === "new") await db.from("outreach_contacts").update({ status: "ready", updated_at: new Date().toISOString() }).eq("id", c.id);
    await logEvent(biz, c.id, "queued", `נוספה לתור ל-${due.toLocaleDateString("he-IL")}`, b.channel);
  }
  return { created: created.length, skipped };
}

async function queueList(biz: string, b: any) {
  let q = db.from("outreach_queue")
    .select(`id,channel,body,status,due_at,done_at,media_asset_id,contact:outreach_contacts(${CONTACT_COLS})`)
    .eq("business_id", biz).order("due_at", { ascending: true }).limit(500);
  q = q.eq("status", b.status || "queued");
  if (b.scope === "today") q = q.lte("due_at", new Date(new Date().setHours(23, 59, 59, 999)).toISOString());
  const items = must(await q) as any[];
  const mediaIds = [...new Set(items.map((i) => i.media_asset_id).filter(Boolean))];
  const media = mediaIds.length ? must(await db.from("media_assets").select("id,url,thumb_url,title").in("id", mediaIds)) as any[] : [];
  const byId = Object.fromEntries(media.map((m) => [m.id, m]));
  return { items: items.map((i) => ({ ...i, media: i.media_asset_id ? byId[i.media_asset_id] || null : null })) };
}

async function queueDone(biz: string, b: any) {
  const item: any = must(await db.from("outreach_queue").select("*").eq("business_id", biz).eq("id", b.id).single());
  if (item.status !== "queued") throw new Error("הפריט כבר טופל");
  const result = b.result === "sent" ? "sent" : "skipped";
  must(await db.from("outreach_queue").update({ status: result, done_at: new Date().toISOString() }).eq("id", b.id));
  if (result === "sent") {
    const followDays = Math.max(1, Math.min(30, Number(b.follow_up_days) || 3));
    must(await db.from("outreach_contacts").update({
      status: "awaiting_reply", last_contact_at: new Date().toISOString(),
      next_action_at: new Date(Date.now() + followDays * 864e5).toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", item.contact_id));
    await logEvent(biz, item.contact_id, "sent", `נשלח ידנית; תזכורת מעקב בעוד ${followDays} ימים`, item.channel);
  } else {
    await logEvent(biz, item.contact_id, "skipped", b.note || "דולג", item.channel);
  }
  return { ok: true };
}

async function queueReschedule(biz: string, b: any) {
  must(await db.from("outreach_queue").update({ due_at: b.due_at }).eq("business_id", biz).eq("id", b.id).eq("status", "queued"));
  return { ok: true };
}
async function queueCancel(biz: string, b: any) {
  must(await db.from("outreach_queue").update({ status: "cancelled", done_at: new Date().toISOString() }).eq("business_id", biz).eq("id", b.id).eq("status", "queued"));
  return { ok: true };
}

async function contactRemind(biz: string, b: any) {
  must(await db.from("outreach_contacts").update({ next_action_at: b.at || null, updated_at: new Date().toISOString() }).eq("business_id", biz).eq("id", b.id));
  await logEvent(biz, b.id, "reminder", b.at ? `תזכורת ל-${new Date(b.at).toLocaleString("he-IL")}${b.note ? " — " + b.note : ""}` : "התזכורת בוטלה");
  return { ok: true };
}

async function followups(biz: string) {
  return {
    contacts: must(await db.from("outreach_contacts").select(CONTACT_COLS).eq("business_id", biz).eq("do_not_contact", false)
      .not("next_action_at", "is", null).lte("next_action_at", new Date().toISOString()).order("next_action_at").limit(200)),
  };
}

/* =============== OpenProspector (read-only) =============== */
const NR_COLS = "id,name,city,phone_main,email_main,website,socials,whatsapp,main_activity,sector,has_facebook,has_instagram,employees_range";
async function prospectorSearch(b: any) {
  const s = String(b.q || "").trim().replace(/[%,()]/g, "");
  const city = String(b.city || "").trim().replace(/[%,()]/g, "");
  if (s.length < 2 && city.length < 2 && !b.has) throw new Error("הזינו לפחות 2 תווים בשם או בעיר");
  let q = db.from("nr_businesses").select(NR_COLS).limit(Math.min(Number(b.limit) || 30, 50));
  if (s.length >= 2) q = q.ilike("name", `%${s}%`);
  if (city.length >= 2) q = q.ilike("city", `%${city}%`);
  if (b.has === "facebook") q = q.eq("has_facebook", true);
  if (b.has === "instagram") q = q.eq("has_instagram", true);
  if (b.has === "social") q = q.or("has_facebook.eq.true,has_instagram.eq.true");
  return { results: must(await q) };
}

async function prospectorImport(biz: string, ids: number[]) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 50) throw new Error("ניתן לייבא 1–50 עסקים בכל פעם");
  const rows = must(await db.from("nr_businesses").select(NR_COLS).in("id", ids)) as any[];
  const imported: string[] = [], dups: { name: string; why: string }[] = [];
  for (const r of rows) {
    const so = r.socials || {};
    const res: any = await contactSave(biz, {
      company_name: r.name, phone: r.phone_main, email: r.email_main, website: r.website,
      facebook_url: so.facebook || null, instagram_url: so.instagram || null,
      whatsapp: r.whatsapp || (so.whatsapp ? (String(so.whatsapp).match(/phone=(\d+)/) || [])[1] || null : null),
      city: r.city, industry: r.main_activity || r.sector, source: "openprospector", source_ref: String(r.id),
    });
    if (res.duplicate) dups.push({ name: r.name, why: res.duplicate.why });
    else imported.push(res.contact.id);
  }
  return { imported: imported.length, duplicates: dups };
}

/* =============== router =============== */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const route = new URL(req.url).pathname.split("/marketing-hub/")[1]?.replace(/\/$/, "") || "";
  try {
    const b = await req.json().catch(() => ({}));
    // The phone's only unauthenticated call: trade the one-time code for its own device token.
    if (route === "auth/pair-complete") return json(await pairComplete(db, b.code, b.device_name));
    const auth = await checkSocialKey(db, req.headers.get("x-social-key") || "");
    if (!auth.ok) return json({ error: "מפתח גישה שגוי או חסר", code: "AUTH" }, 401);
    if (route === "auth/pair-start") return json(await pairStart(db));
    if (route === "auth/devices") return json({ ...(await listDevices(db)), current: auth.kind === "device" ? auth.deviceId : null });
    if (route === "auth/revoke") return json(await revokeDevice(db, b.id));
    const biz = String(b.business_id || "");
    if (route !== "ping" && !route.startsWith("prospector/search")) await business(biz);

    switch (route) {
      case "ping": return json({ ok: true });
      case "media/list": return json(await mediaList(biz, b));
      case "media/sign": return json(await mediaSign(biz, b.files));
      case "media/register": return json(await mediaRegister(biz, b.items));
      case "media/update": return json(await mediaUpdate(biz, b));
      case "media/reorder": return json(await mediaReorder(biz, b.ids || []));
      case "media/delete": return json(await mediaDelete(biz, b.ids || [b.id]));

      case "outreach/policy": return json(OUTREACH_POLICY);
      case "contacts/list": return json(await contactsList(biz, b));
      case "contacts/save": return json(await contactSave(biz, b.contact || {}, !!b.force));
      case "contacts/status": return json(await contactStatus(biz, b));
      case "contacts/dnc": return json(await contactDnc(biz, b));
      case "contacts/history": return json(await contactHistory(biz, b.id));
      case "contacts/delete": return json(await contactDelete(biz, b.id));
      case "contacts/remind": return json(await contactRemind(biz, b));
      case "contacts/followups": return json(await followups(biz));
      case "templates/list": return json(await templatesList(biz));
      case "templates/save": return json(await templateSave(biz, b.template || {}));
      case "templates/delete": return json(await templateDelete(biz, b.id));
      case "queue/create": return json(await queueCreate(biz, b));
      case "queue/list": return json(await queueList(biz, b));
      case "queue/done": return json(await queueDone(biz, b));
      case "queue/reschedule": return json(await queueReschedule(biz, b));
      case "queue/cancel": return json(await queueCancel(biz, b));
      case "prospector/search": return json(await prospectorSearch(b));
      case "prospector/import": return json(await prospectorImport(biz, b.ids));
      default: return json({ error: "route not found", route }, 404);
    }
  } catch (e) {
    console.error(route, e);
    return json({ error: (e as any)?.message || String(e) }, 400);
  }
});
