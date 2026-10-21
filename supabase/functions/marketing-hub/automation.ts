// Outreach automation: channel registry + per-channel policy, campaigns (one message → many companies in the
// owner's order, at a cadence, inside active days/hours), the scheduler tick, and the control-screen summary.
//
// Sending rule: a queue item is sent automatically ONLY when its channel has a connector implemented here,
// the channel row is marked connected + auto_allowed, and the recipient passes the channel's consent rule.
// No connector is implemented yet, so every item is released as "ready" for the owner to send by hand,
// in queue order. Adding a channel later = add a connector to CONNECTORS; nothing else changes.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Channel = "facebook" | "instagram" | "whatsapp" | "email" | "linkedin" | "phone";
const TZ = "Asia/Jerusalem";

export const CHANNELS: Record<Channel, {
  he: string; maxLen: number; subject?: boolean; phase: "active" | "future";
  autoRule: string; manualHow: string; needs: string[];
}> = {
  facebook: {
    he: "פייסבוק (Messenger)", maxLen: 2000, phase: "active",
    autoRule: "אוטומטי רק כתשובה למי שכתב לעמוד ב-24 השעות האחרונות, עם הרשאת pages_messaging שאושרה ב-App Review. פנייה יזומה לעסק שלא פנה – אסורה.",
    manualHow: "פתיחת השיחה ב-Messenger, ההודעה מועתקת, שולחים בלחיצה.",
    needs: ["הרשאת pages_messaging + App Review", "תיבת דואר נכנס (Webhook) לזיהוי מי פנה אלינו"],
  },
  instagram: {
    he: "אינסטגרם (Direct)", maxLen: 1000, phase: "active",
    autoRule: "אוטומטי רק כתשובה למי שכתב לחשבון ב-24 השעות האחרונות, עם instagram_manage_messages שאושרה ב-App Review.",
    manualHow: "פתיחת השיחה ב-Instagram, ההודעה מועתקת, שולחים בלחיצה.",
    needs: ["הרשאת instagram_manage_messages + App Review", "Webhook להודעות נכנסות"],
  },
  whatsapp: {
    he: "וואטסאפ", maxLen: 4096, phase: "future",
    autoRule: "אוטומטי רק דרך WhatsApp Business API, בתבנית שאושרה מראש ע\"י Meta, ולנמען שנתן הסכמה (opt-in) מתועדת.",
    manualHow: "פתיחת וואטסאפ עם ההודעה כתובה, שולחים בלחיצה.",
    needs: ["חשבון WhatsApp Business API (ספק כמו Gupshup / Meta Cloud API)", "תבניות הודעה מאושרות", "תיעוד הסכמה לכל נמען"],
  },
  email: {
    he: "אימייל", maxLen: 20000, subject: true, phase: "future",
    autoRule: "דיוור פרסומי אוטומטי מותר רק לנמען שנתן הסכמה (חוק התקשורת, סעיף 30א), עם קישור הסרה וזיהוי השולח. פנייה חד-פעמית לעסק לבקשת הסכמה – לבדיקה משפטית.",
    manualHow: "פתיחת תוכנת הדואר עם נושא וגוף מוכנים, שולחים בלחיצה.",
    needs: ["ספק דיוור מחובר (למשל Resend) ודומיין שולח מאומת", "תיעוד הסכמה", "קישור הסרה פעיל"],
  },
  linkedin: {
    he: "לינקדאין", maxLen: 1900, phase: "future",
    autoRule: "ל-LinkedIn אין API פתוח לשליחת הודעות לאנשים שאינם בקשר – מותר רק לשותפים מאושרים. שליחה אוטומטית אינה זמינה.",
    manualHow: "פתיחת הפרופיל / העמוד בלינקדאין, ההודעה מועתקת, שולחים בלחיצה.",
    needs: ["שותפות LinkedIn מאושרת (לא זמין לרוב העסקים)"],
  },
  phone: {
    he: "טלפון", maxLen: 2000, phase: "active",
    autoRule: "שיחה – ידנית בלבד.", manualHow: "חיוג בלחיצה, תסריט השיחה מוצג.", needs: [],
  },
};

// Implemented automatic-send connectors. Empty on purpose: nothing is sent automatically yet.
const CONNECTORS: Partial<Record<Channel, (item: any, contact: any, settings: any) => Promise<{ ref: string }>>> = {};

export function hasChannel(c: any, ch: Channel) {
  return ch === "facebook" ? !!c.facebook_handle : ch === "instagram" ? !!c.instagram_handle
    : ch === "whatsapp" ? !!(c.whatsapp || c.phone_norm) : ch === "email" ? !!c.email
    : ch === "linkedin" ? !!c.linkedin_url : !!c.phone;
}

/** Can this item be sent automatically right now? Returns the reason either way (shown in the UI). */
export function autoDecision(ch: Channel, row: any, contact: any) {
  if (!CONNECTORS[ch]) return { auto: false, reason: "אין חיבור אוטומטי לערוץ הזה – שליחה ידנית מהתור" };
  if (!row?.connected || !row?.auto_allowed) return { auto: false, reason: "הערוץ לא מוגדר לשליחה אוטומטית" };
  if ((ch === "email" || ch === "whatsapp") && !contact?.consent?.[ch]) return { auto: false, reason: "אין הסכמה מתועדת מהנמען" };
  if (ch === "facebook" || ch === "instagram") return { auto: false, reason: "Meta מתירה רק מענה למי שפנה אלינו ב-24 שעות" };
  return { auto: true, reason: "" };
}

/* ---------- content ---------- */
export function render(tpl: string, c: any, ourName: string) {
  const v: Record<string, string> = {
    "שם_העסק": c.company_name || "", "איש_קשר": c.contact_name || "", "עיר": c.city || "",
    "תחום": c.industry || "", "העסק_שלנו": ourName,
  };
  return String(tpl || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, k) => v[k] ?? "").replace(/[ \t]{2,}/g, " ").trim();
}

/** Channel adaptation: length, subject, mandatory footer (email), and warnings for the preview. */
export function adapt(ch: Channel, body: string, subject: string | null, settings: any = {}) {
  const spec = CHANNELS[ch];
  const warnings: string[] = [];
  let text = body;
  if (ch === "email") {
    const footer = settings.unsubscribe_text || "לא מעוניינים לקבל מאיתנו פניות? השיבו \"הסר\" ונסיר אתכם מיד.";
    if (!text.includes(footer)) text = `${text}\n\n${settings.signature ? settings.signature + "\n" : ""}${footer}`;
    if (!subject) warnings.push("חסר נושא לאימייל");
  }
  if (ch === "linkedin" && text.length > 300) warnings.push("בקשת חברות בלינקדאין מוגבלת ל-300 תווים – ההודעה מתאימה להודעה רגילה בלבד");
  if (text.length > spec.maxLen) warnings.push(`ארוך מהמותר בערוץ (${text.length}/${spec.maxLen} תווים)`);
  if (/\{\{[^}]+\}\}/.test(text)) warnings.push("נשאר משתנה שלא הוחלף");
  return { body: text, subject: spec.subject ? (subject || "") : null, length: text.length, maxLen: spec.maxLen, warnings };
}

/* ---------- time windows (Israel time) ---------- */
function localParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { dow, min: Number(p.hour) * 60 + Number(p.minute) };
}
const toMin = (t: string) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0); };
export function inWindow(c: any, d = new Date()) {
  const { dow, min } = localParts(d);
  return (c.active_days || []).includes(dow) && min >= toMin(c.active_from) && min < toMin(c.active_to);
}
/** First moment ≥ from that is inside the campaign's active days/hours (5-minute steps, max 8 days ahead). */
export function nextSlot(c: any, from: Date) {
  const t = new Date(Math.floor(from.getTime() / 60000) * 60000);
  for (let i = 0; i < 8 * 288; i++) {
    if (inWindow(c, t)) return t;
    t.setTime(t.getTime() + 5 * 60000);
  }
  return null;
}

/* ---------- campaigns ---------- */
const CAMP_COLS = "id,name,channel,subject,body,media_asset_id,status,cadence_minutes,active_days,active_from,active_to,max_ready,next_at,started_at,finished_at,created_at,updated_at";
const ITEM_COLS = "id,campaign_id,contact_id,channel,body,subject,custom_body,status,position,send_mode,due_at,ready_at,done_at,error,external_ref,attempts";
const CONTACT_MINI = "id,company_name,contact_name,role,city,industry,phone,phone_norm,whatsapp,email,linkedin_url,facebook_handle,facebook_url,instagram_handle,instagram_url,website,status,do_not_contact,opt_out_channels,consent";

type Ctx = { db: SupabaseClient; biz: string; bizName: string; log: (contactId: string, type: string, detail?: string, channel?: string) => Promise<void> };
const must = <T>(r: { data: T; error: any }) => { if (r.error) throw r.error; return r.data; };

export async function channelsList(ctx: Ctx) {
  const rows = must(await ctx.db.from("outreach_channels").select("*").eq("business_id", ctx.biz)) as any[];
  return {
    channels: (Object.keys(CHANNELS) as Channel[]).map((id) => {
      const r = rows.find((x) => x.channel === id) || {};
      return { id, ...CHANNELS[id], enabled: r.enabled ?? true, connected: !!r.connected, auto_allowed: !!r.auto_allowed,
        connector: !!CONNECTORS[id], settings: r.settings || {} };
    }),
  };
}
export async function channelUpdate(ctx: Ctx, b: any) {
  const ch = b.channel as Channel;
  if (!CHANNELS[ch]) throw new Error("ערוץ לא מוכר");
  const patch: any = { updated_at: new Date().toISOString() };
  if (b.enabled !== undefined) patch.enabled = !!b.enabled;
  if (b.settings !== undefined) patch.settings = b.settings || {};
  if (b.auto_allowed) {
    if (!CONNECTORS[ch]) throw new Error("לערוץ הזה אין עדיין חיבור לשליחה אוטומטית");
    patch.auto_allowed = true;
  } else if (b.auto_allowed === false) patch.auto_allowed = false;
  must(await ctx.db.from("outreach_channels").upsert({ business_id: ctx.biz, channel: ch, ...patch }));
  return channelsList(ctx);
}

function blockReason(c: any, ch: Channel) {
  if (c.do_not_contact) return "ביקש לא ליצור קשר (רשימת הסרה)";
  if ((c.opt_out_channels || []).includes(ch)) return "ביקש לא לקבל פניות בערוץ הזה";
  if (["not_interested", "customer"].includes(c.status)) return c.status === "customer" ? "כבר לקוח" : "לא מעוניין";
  if (!hasChannel(c, ch)) return "אין פרטי קשר לערוץ הזה";
  return "";
}

export async function campaignCreate(ctx: Ctx, b: any) {
  const ch = b.channel as Channel;
  if (!CHANNELS[ch]) throw new Error("ערוץ לא תקין");
  if (!String(b.name || "").trim()) throw new Error("תנו שם לקמפיין");
  const camp: any = must(await ctx.db.from("outreach_campaigns").insert({
    business_id: ctx.biz, name: String(b.name).slice(0, 120), channel: ch, subject: b.subject || null,
    body: String(b.body || ""), media_asset_id: b.media_asset_id || null,
    cadence_minutes: Math.max(5, Math.min(1440, Number(b.cadence_minutes) || 30)),
    active_days: (b.active_days || [0, 1, 2, 3, 4]).map(Number).filter((d: number) => d >= 0 && d <= 6),
    active_from: b.active_from || "09:00", active_to: b.active_to || "17:00",
  }).select(CAMP_COLS).single());
  const add = await campaignAddContacts(ctx, { id: camp.id, contact_ids: b.contact_ids || [] });
  return { campaign: camp, ...add };
}

export async function campaignAddContacts(ctx: Ctx, b: any) {
  const camp: any = must(await ctx.db.from("outreach_campaigns").select("*").eq("business_id", ctx.biz).eq("id", b.id).single());
  if (["cancelled", "completed"].includes(camp.status)) throw new Error("הקמפיין הסתיים");
  const ids: string[] = (b.contact_ids || []).slice(0, 1000);
  if (!ids.length) return { added: 0, skipped: [] };
  const contacts = must(await ctx.db.from("outreach_contacts").select(CONTACT_MINI).eq("business_id", ctx.biz).in("id", ids)) as any[];
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const last = must(await ctx.db.from("outreach_queue").select("position").eq("campaign_id", camp.id).order("position", { ascending: false }).limit(1)) as any[];
  let pos = (last[0]?.position || 0) + 1;
  let added = 0; const skipped: { name: string; why: string }[] = [];
  for (const id of ids) {                                      // keeps the order the owner chose
    const c = byId.get(id); if (!c) continue;
    const why = blockReason(c, camp.channel);
    if (why) { skipped.push({ name: c.company_name, why }); continue; }
    const { error } = await ctx.db.from("outreach_queue").insert({
      business_id: ctx.biz, contact_id: c.id, campaign_id: camp.id, channel: camp.channel, position: pos,
      body: render(camp.body, c, ctx.bizName), subject: camp.subject ? render(camp.subject, c, ctx.bizName) : null,
      media_asset_id: camp.media_asset_id, status: "queued", due_at: new Date().toISOString(),
    });
    if (error) {
      skipped.push({ name: c.company_name, why: /campaign_contact/.test(error.message) ? "כבר בקמפיין הזה" : /unique|duplicate/i.test(error.message) ? "כבר יש לו פנייה פתוחה בערוץ הזה" : error.message });
      continue;
    }
    pos++; added++;
    if (c.status === "new") await ctx.db.from("outreach_contacts").update({ status: "ready", updated_at: new Date().toISOString() }).eq("id", c.id);
    await ctx.log(c.id, "queued", `נוסף לקמפיין "${camp.name}"`, camp.channel);
  }
  return { added, skipped };
}

export async function campaignsList(ctx: Ctx) {
  const camps = must(await ctx.db.from("outreach_campaigns").select(CAMP_COLS).eq("business_id", ctx.biz).order("created_at", { ascending: false }).limit(100)) as any[];
  const items = camps.length ? must(await ctx.db.from("outreach_queue").select("campaign_id,status").in("campaign_id", camps.map((c) => c.id))) as any[] : [];
  return {
    campaigns: camps.map((c) => {
      const counts: Record<string, number> = {};
      for (const i of items) if (i.campaign_id === c.id) counts[i.status] = (counts[i.status] || 0) + 1;
      return { ...c, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
    }),
  };
}

export async function campaignGet(ctx: Ctx, id: string) {
  const camp: any = must(await ctx.db.from("outreach_campaigns").select(CAMP_COLS).eq("business_id", ctx.biz).eq("id", id).single());
  const items = must(await ctx.db.from("outreach_queue").select(`${ITEM_COLS},contact:outreach_contacts(${CONTACT_MINI})`)
    .eq("campaign_id", id).order("position", { ascending: true })) as any[];
  const ch = must(await ctx.db.from("outreach_channels").select("*").eq("business_id", ctx.biz).eq("channel", camp.channel).maybeSingle()) as any;
  return {
    campaign: camp, channel: { id: camp.channel, ...CHANNELS[camp.channel as Channel], connector: !!CONNECTORS[camp.channel as Channel], row: ch },
    items: items.map((i) => ({ ...i, auto: autoDecision(camp.channel, ch, i.contact) })),
  };
}

export async function campaignUpdate(ctx: Ctx, b: any) {
  const camp: any = must(await ctx.db.from("outreach_campaigns").select("*").eq("business_id", ctx.biz).eq("id", b.id).single());
  if (["cancelled", "completed"].includes(camp.status)) throw new Error("הקמפיין הסתיים");
  const patch: any = { updated_at: new Date().toISOString() };
  for (const k of ["name", "subject", "body", "media_asset_id", "active_from", "active_to"]) if (b[k] !== undefined) patch[k] = b[k];
  if (b.cadence_minutes !== undefined) patch.cadence_minutes = Math.max(5, Math.min(1440, Number(b.cadence_minutes) || 30));
  if (b.active_days !== undefined) patch.active_days = (b.active_days || []).map(Number);
  if (b.max_ready !== undefined) patch.max_ready = Math.max(1, Math.min(50, Number(b.max_ready) || 3));
  const upd: any = must(await ctx.db.from("outreach_campaigns").update(patch).eq("id", camp.id).select("*").single());
  // The general message changed: re-render every waiting item that was not edited by hand.
  if (b.body !== undefined || b.subject !== undefined || b.media_asset_id !== undefined) {
    const items = must(await ctx.db.from("outreach_queue").select(`id,custom_body,contact:outreach_contacts(${CONTACT_MINI})`)
      .eq("campaign_id", camp.id).in("status", ["queued", "ready"])) as any[];
    for (const it of items) {
      const p: any = { media_asset_id: upd.media_asset_id };
      if (!it.custom_body) { p.body = render(upd.body, it.contact, ctx.bizName); p.subject = upd.subject ? render(upd.subject, it.contact, ctx.bizName) : null; }
      await ctx.db.from("outreach_queue").update(p).eq("id", it.id);
    }
  }
  if (upd.status === "running") {
    await ctx.db.from("outreach_campaigns").update({ next_at: nextSlot(upd, new Date())?.toISOString() || null }).eq("id", upd.id);
  }
  return campaignGet(ctx, camp.id);
}

export async function campaignControl(ctx: Ctx, b: any) {
  const camp: any = must(await ctx.db.from("outreach_campaigns").select("*").eq("business_id", ctx.biz).eq("id", b.id).single());
  const now = new Date();
  const act = b.action;
  if (act === "start" || act === "resume") {
    if (!["draft", "paused"].includes(camp.status)) throw new Error("אפשר להפעיל רק קמפיין בטיוטה או בהשהיה");
    const slot = nextSlot(camp, now);
    if (!slot) throw new Error("אין ימים / שעות פעילות מוגדרים");
    must(await ctx.db.from("outreach_campaigns").update({ status: "running", next_at: slot.toISOString(), started_at: camp.started_at || now.toISOString(), updated_at: now.toISOString() }).eq("id", camp.id));
  } else if (act === "pause") {
    if (camp.status !== "running") throw new Error("הקמפיין לא פעיל");
    must(await ctx.db.from("outreach_campaigns").update({ status: "paused", updated_at: now.toISOString() }).eq("id", camp.id));
  } else if (act === "cancel") {
    if (["cancelled", "completed"].includes(camp.status)) throw new Error("הקמפיין כבר הסתיים");
    must(await ctx.db.from("outreach_campaigns").update({ status: "cancelled", next_at: null, finished_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", camp.id));
    must(await ctx.db.from("outreach_queue").update({ status: "cancelled", done_at: now.toISOString() }).eq("campaign_id", camp.id).in("status", ["queued", "ready"]));
  } else throw new Error("פעולה לא מוכרת");
  return campaignGet(ctx, camp.id);
}

export async function campaignReorder(ctx: Ctx, b: any) {
  const camp: any = must(await ctx.db.from("outreach_campaigns").select("id").eq("business_id", ctx.biz).eq("id", b.id).single());
  const ids: string[] = b.item_ids || [];
  for (let i = 0; i < ids.length; i++) {
    must(await ctx.db.from("outreach_queue").update({ position: i + 1 }).eq("campaign_id", camp.id).eq("id", ids[i]));
  }
  return { ok: true };
}

export async function itemEdit(ctx: Ctx, b: any) {
  const it: any = must(await ctx.db.from("outreach_queue").select(`*,contact:outreach_contacts(${CONTACT_MINI}),campaign:outreach_campaigns(*)`).eq("business_id", ctx.biz).eq("id", b.id).single());
  if (!["queued", "ready", "attention", "failed"].includes(it.status)) throw new Error("אפשר לערוך רק פנייה שעדיין לא נשלחה");
  const patch: any = {};
  if (b.reset) {
    patch.custom_body = false;
    patch.body = render(it.campaign?.body || it.body, it.contact, ctx.bizName);
    patch.subject = it.campaign?.subject ? render(it.campaign.subject, it.contact, ctx.bizName) : null;
  } else {
    if (b.body !== undefined) { patch.body = String(b.body); patch.custom_body = true; }
    if (b.subject !== undefined) { patch.subject = b.subject; patch.custom_body = true; }
  }
  must(await ctx.db.from("outreach_queue").update(patch).eq("id", it.id));
  return { ok: true };
}

export async function itemPreview(ctx: Ctx, id: string) {
  const it: any = must(await ctx.db.from("outreach_queue").select(`*,contact:outreach_contacts(${CONTACT_MINI})`).eq("business_id", ctx.biz).eq("id", id).single());
  const ch = must(await ctx.db.from("outreach_channels").select("*").eq("business_id", ctx.biz).eq("channel", it.channel).maybeSingle()) as any;
  return { item: { id: it.id, channel: it.channel }, contact: it.contact, ...adapt(it.channel, it.body, it.subject, ch?.settings), auto: autoDecision(it.channel, ch, it.contact) };
}

/** Outcome of one queue item. Only items that were not sent yet can become "sent" — no double send. */
export async function itemOutcome(ctx: Ctx, b: any) {
  const it: any = must(await ctx.db.from("outreach_queue").select("*").eq("business_id", ctx.biz).eq("id", b.id).single());
  const now = new Date().toISOString();
  const r = b.result as string;
  const from: Record<string, string[]> = {
    sent: ["queued", "ready", "attention", "failed"], failed: ["queued", "ready", "attention"],
    attention: ["queued", "ready", "failed", "sent"], replied: ["sent", "attention"], skipped: ["queued", "ready", "attention", "failed"],
    queued: ["attention", "failed", "skipped"],
  };
  if (!from[r]) throw new Error("תוצאה לא מוכרת");
  const { data, error } = await ctx.db.from("outreach_queue")
    .update({ status: r, done_at: ["sent", "skipped", "replied"].includes(r) ? now : null, error: r === "failed" || r === "attention" ? (b.note || null) : null })
    .eq("id", it.id).in("status", from[r]).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error(r === "sent" ? "הפנייה כבר סומנה כנשלחה" : "לא ניתן לשנות את הסטטוס מהמצב הנוכחי");
  if (r === "sent") {
    const days = Math.max(1, Math.min(30, Number(b.follow_up_days) || 3));
    await ctx.db.from("outreach_contacts").update({ status: "awaiting_reply", last_contact_at: now, next_action_at: new Date(Date.now() + days * 864e5).toISOString(), updated_at: now }).eq("id", it.contact_id);
  }
  if (r === "replied") await ctx.db.from("outreach_contacts").update({ next_action_at: null, updated_at: now }).eq("id", it.contact_id);
  const he: Record<string, string> = { sent: "נשלח", failed: "נכשל", attention: "דורש טיפול", replied: "נענה", skipped: "דולג", queued: "הוחזר לתור" };
  await ctx.log(it.contact_id, r === "replied" ? "replied" : r, he[r] + (b.note ? ` — ${b.note}` : ""), it.channel);
  return { ok: true };
}

/** Scheduler tick (pg_cron, every minute): releases the next company of each running campaign when due. */
export async function tick(db: SupabaseClient, logFor: (biz: string) => Ctx["log"]) {
  const now = new Date();
  const camps = must(await db.from("outreach_campaigns").select("*").eq("status", "running").lte("next_at", now.toISOString()).limit(50)) as any[];
  const out: any[] = [];
  for (const camp of camps) {
    const log = logFor(camp.business_id);
    if (!inWindow(camp, now)) {
      await db.from("outreach_campaigns").update({ next_at: nextSlot(camp, now)?.toISOString() || null }).eq("id", camp.id);
      out.push({ id: camp.id, wait: "outside window" }); continue;
    }
    const ready = (await db.from("outreach_queue").select("id", { count: "exact", head: true }).eq("campaign_id", camp.id).eq("status", "ready")).count || 0;
    if (ready >= camp.max_ready) {
      // Manual sending is behind: hold instead of piling up; check again in 5 minutes.
      await db.from("outreach_campaigns").update({ next_at: new Date(now.getTime() + 5 * 60000).toISOString() }).eq("id", camp.id);
      out.push({ id: camp.id, wait: "manual backlog" }); continue;
    }
    const nextItems = must(await db.from("outreach_queue").select(`*,contact:outreach_contacts(${CONTACT_MINI})`)
      .eq("campaign_id", camp.id).eq("status", "queued").order("position", { ascending: true }).limit(1)) as any[];
    const it = nextItems[0];
    if (!it) {
      if (!ready) await db.from("outreach_campaigns").update({ status: "completed", next_at: null, finished_at: now.toISOString() }).eq("id", camp.id);
      else await db.from("outreach_campaigns").update({ next_at: new Date(now.getTime() + 5 * 60000).toISOString() }).eq("id", camp.id);
      out.push({ id: camp.id, done: !ready }); continue;
    }
    const why = blockReason(it.contact, camp.channel);
    if (why) {
      await db.from("outreach_queue").update({ status: "skipped", done_at: now.toISOString(), error: why }).eq("id", it.id).eq("status", "queued");
      await log(it.contact_id, "skipped", `דולג אוטומטית: ${why}`, camp.channel);
      out.push({ id: camp.id, skipped: it.id }); continue;      // next company on the next tick, no delay lost
    }
    const chRow = (await db.from("outreach_channels").select("*").eq("business_id", camp.business_id).eq("channel", camp.channel).maybeSingle()).data;
    const dec = autoDecision(camp.channel, chRow, it.contact);
    // claim the item atomically so two ticks can never release / send it twice
    const claim = await db.from("outreach_queue").update({ status: "ready", ready_at: now.toISOString(), send_mode: dec.auto ? "auto" : "manual" })
      .eq("id", it.id).eq("status", "queued").select("id");
    if (!claim.data?.length) continue;
    if (dec.auto) {
      try {
        const res = await CONNECTORS[camp.channel as Channel]!(it, it.contact, chRow?.settings || {});
        await db.from("outreach_queue").update({ status: "sent", done_at: now.toISOString(), external_ref: res.ref, attempts: it.attempts + 1 }).eq("id", it.id);
        await log(it.contact_id, "sent", "נשלח אוטומטית", camp.channel);
      } catch (e) {
        await db.from("outreach_queue").update({ status: "failed", error: (e as Error).message, attempts: it.attempts + 1 }).eq("id", it.id);
      }
    } else {
      await log(it.contact_id, "ready", "הגיע תורו – מוכן לשליחה ידנית", camp.channel);
    }
    await db.from("outreach_campaigns").update({ next_at: nextSlot(camp, new Date(now.getTime() + camp.cadence_minutes * 60000))?.toISOString() || null }).eq("id", camp.id);
    out.push({ id: camp.id, released: it.id, auto: dec.auto });
  }
  return { ran: out.length, out };
}

/** Everything the control screen needs, for one business. */
export async function summary(ctx: Ctx) {
  const db = ctx.db;
  const camps = must(await db.from("outreach_campaigns").select(CAMP_COLS).eq("business_id", ctx.biz).in("status", ["draft", "running", "paused"]).order("created_at", { ascending: false })) as any[];
  const ids = camps.map((c) => c.id);
  const items = ids.length ? must(await db.from("outreach_queue").select(`id,campaign_id,status,position,body,subject,channel,ready_at,contact:outreach_contacts(company_name,contact_name)`).in("campaign_id", ids)) as any[] : [];
  const all = must(await db.from("outreach_queue").select("status,done_at").eq("business_id", ctx.biz)) as any[];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const perCamp = camps.map((c) => {
    const mine = items.filter((i) => i.campaign_id === c.id);
    const queued = mine.filter((i) => i.status === "queued").sort((a, b) => a.position - b.position);
    const ready = mine.filter((i) => i.status === "ready").sort((a, b) => a.position - b.position);
    const next = ready[0] || queued[0] || null;
    return {
      id: c.id, name: c.name, channel: c.channel, channel_he: CHANNELS[c.channel as Channel].he, status: c.status,
      cadence_minutes: c.cadence_minutes, next_at: c.next_at, active_days: c.active_days, active_from: c.active_from, active_to: c.active_to,
      queued: queued.length, ready: ready.length,
      sent: mine.filter((i) => i.status === "sent" || i.status === "replied").length,
      attention: mine.filter((i) => ["attention", "failed"].includes(i.status)).length,
      next: next ? { id: next.id, status: next.status, company: next.contact?.company_name, contact: next.contact?.contact_name, body: next.body, subject: next.subject, when: next.status === "ready" ? "עכשיו (ממתין לשליחה שלכם)" : c.next_at } : null,
    };
  });
  return {
    campaigns: perCamp,
    totals: {
      in_queue: items.filter((i) => ["queued", "ready"].includes(i.status)).length,
      ready_now: items.filter((i) => i.status === "ready").length,
      sent_total: all.filter((i) => ["sent", "replied"].includes(i.status)).length,
      sent_today: all.filter((i) => ["sent", "replied"].includes(i.status) && i.done_at && new Date(i.done_at) >= today).length,
      attention: all.filter((i) => ["attention", "failed"].includes(i.status)).length,
      replied: all.filter((i) => i.status === "replied").length,
    },
  };
}
