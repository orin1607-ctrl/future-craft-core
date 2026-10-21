// OpenProspector – national registry ENRICHMENT engine (STAGING only).
// Runs server-side from pg_cron (x-dalia-internal-key) every 2 minutes, only when there is work. It never creates a parallel
// business list: every fact is attached to the EXISTING nr_businesses record (through nr_ingest / nr_ingest_jobs /
// nr_ingest_findings / nr_ingest_gov_contracts), and anything whose company match is uncertain waits for review.
// Sources (each one checked for permission first – see nr_sources.status_reason):
//   enr:gov_contracts / enr:gov_tenders  data.gov.il – amounts and procedure type for records already tied to a business
//   enr:taasuka_jobs                     government Employment Service job postings (employer, title, city, date)
//   enr:web_discovery                    the website behind a business's own corporate e-mail domain
//   enr:web_deep                         contact / about / careers pages of the business's own website (robots.txt per path)
//   enr:news_rss                         public RSS headlines with a business event – always sent to review
// No paid services, no login walls, no CAPTCHA / Cloudflare bypass, no 7-rule filtering.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { edgeCorsHeaders, jsonResponse, requireAuth } from "../_shared/edgeAuth.ts";
import { locateSocial } from "./socialLocate.ts";
import { socialUrl, socialsFrom } from "../_shared/socialUrl.ts";
// the 7 Dalia lead rules – the same file the app loads (public/openprospector-qualify.js), so the cloud stream and the
// screen always grade a lead identically; it registers itself as globalThis.OPQualify
import "../../../public/openprospector-qualify.js";

const CKAN = "https://data.gov.il/api/3/action/datastore_search";
// same normalisation as national-registry-collector/mappers.ts, so contact points dedupe across collectors
function normPhone(raw: unknown): string {
  let d = String(raw ?? "").replace(/(\d)\.0+(?!\d)/g, "$1").replace(/\D/g, "");
  if (/^1(700|800|599)\d{6}$/.test(d)) return d;
  if (d.startsWith("972")) d = "0" + d.slice(3);
  if (d.length === 8 || (d.length === 9 && !d.startsWith("0"))) d = "0" + d;
  return /^0(5\d{8}|7\d{8}|[23489]\d{7})$/.test(d) ? d : "";
}
function fmtPhone(p: string): string {
  if (/^1\d{9}$/.test(p)) return `${p[0]}-${p.slice(1, 4)}-${p.slice(4, 7)}-${p.slice(7)}`;
  return /^0(5|7)/.test(p) ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : `${p.slice(0, 2)}-${p.slice(2, 5)}-${p.slice(5)}`;
}

const STAGING_REF = "usfeoerkpcafxxlyuldl";
const UA = "DaliaOpenProspector/1.0 (Israeli business registry research; staging)";
const TICK_BUDGET_MS = 112_000;

type Obj = Record<string, unknown>;
type Src = { key: string; name: string; kind: string; status: string; config: Obj; cursor: number; total_records: number | null;
  records_read: number; businesses_enriched: number; details_added: number; errors: number; started_at: string | null; duration_ms: number; last_run_at: string | null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

function decode(t: string): string {
  return t.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
const textOf = (html: string) => decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
  .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|td|section|article)>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t ]+/g, " ").replace(/\n\s*\n+/g, "\n");

let PAGE_CAP = 1_500_000;
async function get(url: string, timeoutMs = 12_000, accept = "text/html"): Promise<{ status: number; url: string; type: string; body: string }> {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "he,en;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  const type = r.headers.get("content-type") || "";
  let body = "";
  if ((/text|xml|json|html/i.test(type) || !type) && r.body) {
    // stream and stop at the cap: one oversized page must not exhaust the call's memory (546 WORKER_RESOURCE_LIMIT)
    const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
    try {
      while (body.length < PAGE_CAP) { const { value, done } = await reader.read(); if (done) break; body += value; }
    } catch { /* connection dropped mid-page: keep what arrived */ }
    reader.cancel().catch(() => {});
    if (body.length > PAGE_CAP) body = body.slice(0, PAGE_CAP);
  } else await r.body?.cancel().catch(() => {});
  return { status: r.status, url: r.url, type, body };
}

async function rpc<T = unknown>(sb: SupabaseClient, fn: string, args: Obj): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}
async function event(sb: SupabaseClient, level: string, message: string, source_key?: string, data?: unknown) {
  await sb.from("nr_events").insert({ level, message, source_key: source_key ?? null, data: data ?? null });
}
async function source(sb: SupabaseClient, key: string): Promise<Src | null> {
  const { data } = await sb.from("nr_sources").select("*").eq("key", key).maybeSingle();
  return data as Src | null;
}
// add this step's counters to the source row and log the batch
async function account(sb: SupabaseClient, src: Src, t0: number, d: { read: number; enriched: number; details: number; cursor?: number; total?: number | null; done?: boolean; note?: string; reason?: string }) {
  const dt = Date.now() - t0;
  const upd: Obj = {
    records_read: src.records_read + d.read, businesses_enriched: src.businesses_enriched + d.enriched, details_added: src.details_added + d.details,
    duration_ms: Number(src.duration_ms) + dt, last_run_at: now(), updated_at: now(), started_at: src.started_at || now(), errors: 0, last_error: null,
    status: d.done ? "completed" : "collecting",
  };
  if (d.cursor !== undefined) upd.cursor = d.cursor;
  if (d.total !== undefined && d.total !== null) upd.total_records = d.total;
  if (d.done) { upd.finished_at = now(); upd.status_reason = d.reason || "המעבר הנוכחי על המקור הסתיים; ממשיך אוטומטית כשמתווסף מידע"; }
  await sb.from("nr_sources").update(upd).eq("key", src.key);
  Object.assign(src, upd);
  if (d.read) await sb.from("nr_runs").insert({ source_key: src.key, started_at: new Date(t0).toISOString(), finished_at: now(), records_read: d.read,
    businesses_enriched: d.enriched, details_added: d.details, duration_ms: dt, ok: true, error: d.note ?? null });
}
async function fail(sb: SupabaseClient, src: Src, t0: number, e: unknown) {
  const msg = (e as Error).message.slice(0, 300);
  const errors = (src.errors || 0) + 1;
  await sb.from("nr_sources").update({ errors, last_error: msg, updated_at: now(), ...(errors >= 8 ? { status: "error", status_reason: "8 כשלונות רצופים – " + msg } : {}) }).eq("key", src.key);
  await sb.from("nr_runs").insert({ source_key: src.key, started_at: new Date(t0).toISOString(), finished_at: now(), ok: false, error: msg, duration_ms: Date.now() - t0 });
  await event(sb, "error", `העשרה – ${src.name}: ${msg}`, src.key);
}
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const x = items[i++]; try { await fn(x); } catch { /* per-item errors are recorded by fn */ } } }));
}

// ── robots.txt: Disallow prefixes for "*" / dalia (cached per origin for this tick) ──
const robotsCache = new Map<string, string[] | null>();
async function robotsRules(origin: string): Promise<string[] | null> {
  if (robotsCache.has(origin)) return robotsCache.get(origin)!;
  let rules: string[] = [];
  try {
    const r = await get(origin + "/robots.txt", 5000, "text/plain");
    if (r.status === 200 && !/<html/i.test(r.body.slice(0, 500))) {
      // consecutive User-agent lines form one group; its Allow/Disallow lines follow
      let agents: string[] = [], inRules = false;
      for (const raw of r.body.slice(0, 50_000).split(/\r?\n/)) {
        const m = raw.replace(/#.*/, "").trim().match(/^([a-z-]+)\s*:\s*(.*)$/i);
        if (!m) continue;
        const k = m[1].toLowerCase(), v = m[2].trim();
        if (k === "user-agent") { if (inRules) { agents = []; inRules = false; } agents.push(v); }
        else if (k === "disallow" || k === "allow") {
          inRules = true;
          if (k === "disallow" && v && agents.some((a) => a === "*" || /dalia/i.test(a))) rules.push(v);
        }
      }
    }
  } catch { rules = []; }
  robotsCache.set(origin, rules);
  return rules;
}
async function allowed(url: string): Promise<boolean> {
  let u: URL; try { u = new URL(url); } catch { return false; }
  const rules = await robotsRules(u.origin);
  const path = u.pathname + u.search;
  return !(rules || []).some((p) => {
    const rx = new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    return rx.test(path);
  });
}

// ════════════════ 1. government contracts / tenders (amounts, procedure type) ════════════════
const pick = (r: Obj, rx: RegExp) => { for (const [k, v] of Object.entries(r)) if (rx.test(k) && v != null && String(v).trim() !== "") return clean(v); return ""; };
async function stepGov(sb: SupabaseClient, src: Src, deadline: number) {
  const t0 = Date.now();
  const rid = String(src.config.rid);
  let read = 0, enriched = 0, cursor = src.cursor, total = src.total_records;
  try {
    while (Date.now() < deadline) {
      const j = await (await fetch(`${CKAN}?resource_id=${rid}&limit=1000&offset=${cursor}&sort=${encodeURIComponent("_id asc")}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) })).json() as { success: boolean; result: { total: number; records: Obj[] } };
      if (!j.success) throw new Error("CKAN error");
      total = j.result.total;
      const recs = j.result.records || [];
      const rows = recs.map((r) => ({
        rid: String(r._id), amount: pick(r, /היקף כספי|סכום|amount/), currency: pick(r, /^מטבע/), ministry: pick(r, /^שם המשרד/) || pick(r, /יחידה/),
        kind: pick(r, /סוג הליך/), procedure: pick(r, /^שם הליך/), date: pick(r, /תאריך פרסום/), end_date: pick(r, /תאריך סיום/), topic: pick(r, /נושאים/),
        decision: pick(r, /מהות החלטה/), supplier: pick(r, /שם ספק/), reg_id: pick(r, /חפ ספק|ח\.פ/),
        url: `${CKAN}?resource_id=${rid}&filters=${encodeURIComponent(JSON.stringify({ _id: r._id }))}`,
      })).filter((x) => x.supplier && !/נדח|בוטל|לא אושר/.test(x.decision));
      for (let i = 0; i < rows.length; i += 250) {
        const res = await rpc<{ matched: number }>(sb, "nr_ingest_gov_contracts", { p_source: src.key, p_evidence_source: String(src.config.evidence_source), p_tender: Boolean(src.config.tender), p_rows: rows.slice(i, i + 250) });
        enriched += res.matched;
      }
      read += recs.length; cursor += recs.length;
      if (!recs.length || cursor >= total) break;
      await sleep(300);
    }
    const done = cursor >= (total || 0);
    await account(sb, src, t0, { read, enriched, details: enriched, cursor, total, done, reason: done ? `כל ${total?.toLocaleString("en")} רשומות המאגר נקראו; הסכומים וסוג ההליך צורפו לעסקים שכבר מקושרים לרשומה` : undefined });
    return { key: src.key, read, enriched, cursor, done };
  } catch (e) { await fail(sb, src, t0, e); return { key: src.key, error: (e as Error).message }; }
}

// ════════════════ 2. government Employment Service – job postings ════════════════
function parseJob(html: string, url: string) {
  const t = decode(html);
  const g = (rx: RegExp) => clean((t.match(rx) || [])[1] || "");
  const title = g(/class="jobTitle">([^<]*)</);
  if (!title) return null;
  const field = (label: string) => g(new RegExp(`<strong>\\s*${label}\\s*<\\/strong>\\s*<span>([^<]*)<`));
  const statusRaw = field("מצב משרה");
  const d = field("תאריך עדכון").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  const licBlock = (t.match(/<strong>רשיון נהיגה:<\/strong>([\s\S]*?)<(?:div class="text-margin"|strong)/) || [])[1] || "";
  const license = [...licBlock.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => clean(m[1])).filter(Boolean).join("; ");
  return {
    url, title, employer: g(/class="jobSubTitle">([^<]*)</), city: field("מקום עבודה"),
    ext_id: field("מס' משרה באתר") || (url.match(/JobId=([\w-]+)/i) || [])[1] || "",
    status: /פעיל/.test(statusRaw) ? "open" : /סגור/.test(statusRaw) ? "closed" : "unknown",
    posted: d ? `${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}` : "",
    occupation: g(/<strong>עיסוק:<\/strong>\s*<p>([^<]*)</), field: g(/<strong>תחום:<\/strong>\s*<p>([^<]*)</), license,
  };
}
async function loadSitemap(sb: SupabaseClient, src: Src) {
  const r = await get(String(src.config.sitemap), 60_000, "application/xml");
  if (r.status !== 200) throw new Error("sitemap HTTP " + r.status);
  const urls = [...r.body.matchAll(/<loc[^>]*>(https:\/\/www\.taasuka\.gov\.il\/applicants\/jobdetails\/[^<]+)<\/loc>\s*(?:<lastmod[^>]*>([^<]*)<\/lastmod>)?/g)]
    .map((m) => ({ source_key: src.key, url: decode(m[1]).trim(), ext_id: (decode(m[1]).match(/JobId=([\w-]+)/i) || [])[1] || null, lastmod: m[2] || null, status: "queued" }));
  for (let i = 0; i < urls.length; i += 1000) {
    const { error } = await sb.from("nr_jobs").upsert(urls.slice(i, i + 1000), { onConflict: "url", ignoreDuplicates: true });
    if (error) throw new Error("nr_jobs upsert: " + error.message);
  }
  const config = { ...src.config, sitemap_loaded_at: now(), sitemap_urls: urls.length };
  await sb.from("nr_sources").update({ config, total_records: urls.length, status: "collecting", started_at: src.started_at || now() }).eq("key", src.key);
  src.config = config; src.total_records = urls.length; src.status = "collecting";
  await event(sb, "info", `שירות התעסוקה: נטענו ${urls.length.toLocaleString("en")} כתובות משרות ממפת האתר`, src.key);
}
async function stepJobs(sb: SupabaseClient, src: Src, deadline: number) {
  const t0 = Date.now();
  let read = 0, enriched = 0, details = 0;
  try {
    const loaded = src.config.sitemap_loaded_at ? Date.parse(String(src.config.sitemap_loaded_at)) : 0;
    if (!loaded || Date.now() - loaded > 24 * 3600_000) await loadSitemap(sb, src);
    while (Date.now() < deadline - 8000) {
      const { data: batch } = await sb.from("nr_jobs").select("id,url,attempts").eq("source_key", src.key).eq("status", "queued").order("id").limit(24);
      if (!batch || !batch.length) break;
      const rows: Obj[] = [];
      await pool(batch, 4, async (j) => {
        try {
          const r = await get(j.url, 15_000);
          if (r.status === 404 || r.status === 410) { await sb.from("nr_jobs").update({ status: "gone", fetched_at: now() }).eq("id", j.id); return; }
          if (r.status !== 200) throw new Error("HTTP " + r.status);
          const p = parseJob(r.body, j.url);
          if (!p) { await sb.from("nr_jobs").update({ status: "gone", fetched_at: now() }).eq("id", j.id); return; }
          rows.push(p);
        } catch (e) {
          await sb.from("nr_jobs").update({ attempts: j.attempts + 1, ...(j.attempts + 1 >= 3 ? { status: "error" } : {}), fetched_at: now() }).eq("id", j.id);
          if (/HTTP 403|HTTP 429/.test((e as Error).message)) throw e;
        }
      });
      read += batch.length;
      if (rows.length) {
        const res = await rpc<{ matched: number; pending: number; businesses: number }>(sb, "nr_ingest_jobs", { p_source: src.key, p_rows: rows });
        enriched += res.businesses; details += res.matched;
      }
      await sleep(250);
    }
    const { count } = await sb.from("nr_jobs").select("id", { count: "exact", head: true }).eq("source_key", src.key).eq("status", "queued");
    await account(sb, src, t0, { read, enriched, details, cursor: (src.total_records || 0) - (count || 0), done: !count, reason: "כל המשרות במפת האתר נקראו; מפת האתר נבדקת שוב כל 24 שעות ומשרות פעילות נבדקות שוב כל שבוע" });
    return { key: src.key, read, matched: details, left: count };
  } catch (e) { await fail(sb, src, t0, e); return { key: src.key, error: (e as Error).message }; }
}

// ════════════════ 3. website discovery from the business's corporate e-mail domain ════════════════
const PARKED = /domain (is )?for sale|buy this domain|parked|sedoparking|godaddy|this domain (may be|is) for sale|domain has expired|הדומיין (הזה )?(למכירה|פנוי)|under construction|coming soon|אתר בבני(י)?ה|website is under|index of \//i;
const SOCIAL_HOST = /(facebook|instagram|linkedin|tiktok|youtube|twitter|x)\.com$/i;
function nameTokens(name: string) {
  return name.replace(/בע["״'׳~]?מ|\(.*?\)|ltd\.?|limited/gi, " ").split(/[^א-תa-zA-Z0-9]+/).filter((w) => w.length >= 3 &&
    !/^(חברה|חברת|שירותים|ישראל|בעמ|ניהול|השקעות|אחזקות|מערכות|הנדסה|קיבוץ|מושב|אגודה|שיתופית|שיתופי|חקלאית|מרכזית|כפר|רמת|עין|בית|גבעת|נווה|קבוצת|מרכז|תעשיות|מפעלי|עמותת|group|the|and)$/i.test(w));
}
// Does this page belong to THIS business? Strong: its known phone or exact e-mail on the page. Name words count only for a
// registered company/association (a person's name or a common word on someone else's site is not proof), and need two words
// on the page or one distinctive word in the page title / domain.
type Biz = { name: string; name_en?: string | null; phones?: string[]; emails?: string[]; reg_id_type?: string | null; reg_id?: string | null };
// Israeli company / association number with a valid check digit (same algorithm as ת.ז.)
function validIlId(d: string) {
  if (!/^5\d{8}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) { let x = Number(d[i]) * (i % 2 ? 2 : 1); if (x > 9) x -= 9; s += x; }
  return s % 10 === 0;
}
// company numbers printed on a page ("ח.פ. 51-234567-8", "ע\"ר 580012345", "Reg. No 512345678")
function regIdsOn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:ח\.?\s?פ\.?|ח["״׳']פ|ע["״׳']ר|עמותה מס['׳]?|מספר חברה|חברה מס['׳]?|company (?:no|number|reg(?:istration)?)\.?|reg\.? ?no\.?)\s*[:.#-]?\s*(5[\d\s-]{8,12})/gi)) {
    const d = m[1].replace(/\D/g, "").slice(0, 9);
    if (validIlId(d)) out.add(d);
  }
  return [...out];
}
function siteConfirms(b: Biz, html: string, host: string): string[] {
  const out: string[] = [];
  const digits = html.replace(/\D/g, ""), low = html.toLowerCase();
  if (b.reg_id && /^\d{9}$/.test(b.reg_id) && regIdsOn(textOf(html)).includes(b.reg_id)) out.push("ח.פ. " + b.reg_id + " של החברה מופיע באתר");
  const ph = (b.phones || []).find((p) => p.length >= 9 && digits.includes(p.slice(1)));
  if (ph) out.push("טלפון החברה " + fmtPhone(ph) + " מופיע באתר");
  const em = (b.emails || []).find((m) => m && low.includes(m.toLowerCase()));
  if (em) out.push("האימייל " + em + " מופיע באתר");
  if (/^(company|amuta|chalatz|cooperative|government)$/.test(b.reg_id_type || "")) {
    const text = textOf(html).toLowerCase(), title = decode((html.match(/<title[^>]*>([^<]*)/i) || [])[1] || "").toLowerCase();
    const toks = [...new Set([...nameTokens(b.name), ...nameTokens(b.name_en || "")].map((w) => w.toLowerCase()))];
    const hits = toks.filter((w) => text.includes(w));
    const strong = toks.find((w) => w.length >= 4 && (title.includes(w) || host.includes(w)));
    if (hits.length >= 2 || strong) out.push(`שם החברה מופיע באתר (${(strong ? [strong] : hits.slice(0, 2)).join(", ")})`);
  }
  return out;
}
async function stepDiscovery(sb: SupabaseClient, src: Src, deadline: number) {
  const t0 = Date.now();
  let read = 0, enriched = 0, found = 0;
  try {
    while (Date.now() < deadline - 15_000) {
      const batch = await rpc<{ business_id: number; domain: string; name: string; name_en: string | null; reg_id_type: string | null; phones: string[]; emails: string[] }[]>(sb, "nr_claim_domains", { p_limit: 16 });
      if (!batch.length) break;
      await pool(batch, 16, async (b) => {
        let status = "not_found", note = "";
        try {
          let page: Awaited<ReturnType<typeof get>> | null = null;
          for (const u of [`https://${b.domain}/`, `https://www.${b.domain}/`, `http://www.${b.domain}/`]) {
            if (!(await allowed(u))) { status = "robots"; note = "robots.txt"; page = null; break; }
            try { const r = await get(u, 7_000); if (r.status === 200 && /html/i.test(r.type) && r.body.length > 400) { page = r; break; } note = "HTTP " + r.status; } catch (e) { note = (e as Error).message.slice(0, 60); }
          }
          if (page) {
            const host = new URL(page.url).hostname.replace(/^www\./, "");
            const text = textOf(page.body);
            if (SOCIAL_HOST.test(host) || !(host === b.domain || host.endsWith("." + b.domain) || b.domain.endsWith("." + host))) { status = "not_found"; note = "מפנה לאתר אחר: " + host; }
            else if (PARKED.test(text.slice(0, 4000)) && text.length < 6000) { status = "parked"; note = "דומיין חונה / בבנייה"; }
            else {
              // the e-mail domain alone is not proof (a person may use an employer's address): the page must confirm the business
              const confirmed = siteConfirms(b, page.body, host);
              if (!confirmed.length) { status = "not_found"; note = "האתר נטען אך אינו מזכיר את החברה (טלפון / אימייל / שם) – לא צורף"; }
              else {
                const origin = new URL(page.url).origin;
                const res = await rpc<{ details: number }>(sb, "nr_ingest", { p_source: src.key, p_rows: [{
                  business_id: b.business_id, name: b.name, rid: b.domain, url: page.url, websites: [origin],
                  fields: { from_email_domain: b.domain, page: page.url, confirmed },
                }] });
                await rpc(sb, "nr_confirm_site", { p_business: b.business_id, p_url: origin, p_evidence: confirmed });
                status = "found"; note = confirmed.join(", ");
                if (res.details) { enriched++; found++; }
              }
            }
          }
        } catch (e) { status = "error"; note = (e as Error).message.slice(0, 80); }
        await sb.from("nr_domain_queue").update({ status, note, checked_at: now() }).eq("business_id", b.business_id);
      });
      read += batch.length;
    }
    const { count } = await sb.from("nr_domain_queue").select("business_id", { count: "exact", head: true }).eq("status", "queued");
    const { count: total } = await sb.from("nr_domain_queue").select("business_id", { count: "exact", head: true });
    await account(sb, src, t0, { read, enriched, details: found, cursor: (total || 0) - (count || 0), total, done: !count, reason: "כל הדומיינים העסקיים בתור נבדקו; התור מתמלא מחדש כל שבוע" });
    return { key: src.key, read, found };
  } catch (e) { await fail(sb, src, t0, e); return { key: src.key, error: (e as Error).message }; }
}

// ════════════════ 4. deep crawl of the business's own website ════════════════
const FREE_MAIL = /@(gmail|walla|hotmail|yahoo|outlook|012|netvision|bezeqint|zahav|smile|actcom|017)\./;
const PAGE_KIND: [string, RegExp][] = [
  ["careers", /career|\/jobs?\b|\/drushim|דרושים|משרות|קריירה|בואו לעבוד|join-us|joinus|%d7%93%d7%a8%d7%95%d7%a9%d7%99%d7%9d/i],
  ["about", /about|אודות|מי[-_ %20]*אנחנו|הצוות|הנהלה|team|management|leadership|%d7%90%d7%95%d7%93%d7%95%d7%aa/i],
  ["contact", /contact|צור[-_ %20]*קשר|יצירת[-_ %20]*קשר|%d7%a6%d7%95%d7%a8/i],
  ["relations", /לקוחות|לקוחותינו|שותפים|שותפי|ספקים|clients|customers|partners|suppliers|our-clients/i],
];
// outbound links that are platforms / services, not business relations
const NOT_COMPANY = /(^|\.)(facebook|instagram|linkedin|tiktok|youtube|youtu|twitter|x|google|goo|gstatic|googleapis|apple|microsoft|bing|wix|wixsite|wordpress|w|gravatar|cloudflare|jsdelivr|jquery|bootstrapcdn|fontawesome|waze|whatsapp|wa|t|telegram|schema|w3|bit|tinyurl|gov|b144|d|easy|zap|ynet|walla|mako|duns100|dunsguide|bdicoface|cookiedatabase|browsehappy|tase|ontopo|ziperdrop|linkshake|nagich|accessibility-helper|website-files|nipendo|merquly|tepez|wixstatic|paypal|tranzila|cardcom|icount|isracard|adobe|elementor|webflow|shopify|godaddy|mailchimp|hubspot|tripadvisor|booking|amazon|amazonaws|cdninstagram|fbcdn|vimeo|spotify|pinterest|calendly|zoom|weebly|squarespace|github|accessibe|nagish|enable|userway|hotjar|clarity|doubleclick|googletagmanager)\.[a-z.]+$/i;
const ROLE = `(מנכ["״']?ל(?:ית)?|מנהל(?:ת)? כללי(?:ת)?|סמנכ["״']?ל(?:ית)? (?:תפעול|לוגיסטיקה|רכש|כספים)|מנהל(?:ת)? (?:תפעול(?: ולוגיסטיקה)?|לוגיסטיקה|רכש|צי(?: ה)?רכב(?:ים)?|תחבורה|הפצה|מחסן|אחזקה|הובלה|שינוע|משק|אדמיניסטרציה)|קצין(?:ת)? (?:בטיחות(?: בתעבורה)?|רכב)|(?:רכז|אחראי)(?:ת)? (?:רכב|צי(?: ה)?רכב|תחבורה|הפצה|לוגיסטיקה)|סדרן(?:ית)?(?: ראשי(?:ת)?)?|בעלים|שותף מנהל|מייסד(?:ת)?(?: ומנכ["״']?ל)?|יו["״']?ר)`;
const NAME = `([א-ת][א-ת'"״׳-]{1,14}(?: [א-ת][א-ת'"״׳-]{1,14}){1,2})`;
const PLACE_WORD = /^(רכבת|ירושלים|תל|אביב|חיפה|באר|שבע|צפון|דרום|מרכז|פרויקט|פרויקטים|בניין|בניית|רחוב|כביש|עיריית|משרד|בית|גן|קניון|מגדל|שכונת|אזור|תעשייה|לקוח|לקוחות)$/;
const NOT_NAME = /^(החברה|חברת|של|את|עם|על|הוא|היא|אנחנו|שלנו|ו?ה?מנהל|מנהלת|ניסיון|שנים|בעל|הינו|הינה|כיום|מאז|בתחום|תפקיד|צוות|לקוחות|שירות|המשרד|הנהלת|מחלקת|כל|גם|רב|אשר|לפני|אחרי|יותר|פרטים|לפרטים|טלפון|נייד|דוא"ל|מייל|מועמד|מועמדת|מתאים|מתאימה|דרוש|דרושה|דרושים|משרה|מחפשים|מגייסים|ניסיון)$/;
function people(text: string): { name: string; role: string; phone?: string; email?: string }[] {
  const out: { name: string; role: string; phone?: string; email?: string }[] = [];
  let line = "";
  const add = (raw: string, role: string) => {
    const name = raw.replace(/^(מר|גב['׳]?|ד["״]ר|עו["״]ד|רו["״]ח|פרופ['׳]?|אינג['׳]?)\s+/, "").replace(/\s+(טל['׳]?|נ['׳]|נייד|טלפון|מייל)$/, "");
    const words = name.split(" ");
    if (words.length < 2 || words.some((w) => NOT_NAME.test(w.replace(/^[וה]/, "")) || PLACE_WORD.test(w))) return;
    // a phone / e-mail written on the same line belongs to this person (direct line); otherwise none is attached
    const ph = (line.match(PHONE_TXT) || []).map(normPhone).find(Boolean);
    const em = (line.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i) || [])[0];
    if (!out.some((p) => p.name === name)) out.push({ name, role: role.replace(/["״']/g, '"'), phone: ph ? fmtPhone(ph) : undefined, email: em ? em.toLowerCase() : undefined });
  };
  // only "role: name" / "name – role" / "name, role" on ONE line with an explicit separator
  // the name may be followed on the same line by that person's phone / e-mail
  const TAIL = `(?:\\s*[,|–\\-]?\\s*(?:טל['׳]?|טלפון|נייד|נ['׳]|tel|mobile|דוא["״]ל|מייל|email)?\\s*[:.]?\\s*(?:\\+?[\\d][\\d\\s\\-]{7,15}\\d|[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}))*`;
  const roleFirst = new RegExp(`${ROLE}\\s*[:\\-–|]\\s*${NAME}${TAIL}\\s*$`, "i");
  const nameFirst = new RegExp(`^\\s*${NAME}\\s*[,\\-–|]\\s*${ROLE}(?![א-ת])`);
  for (const l of text.split("\n")) {
    line = l;
    if (line.length > 160) continue;
    const a = line.match(roleFirst); if (a) add(a[2], a[1]);
    const b = line.match(nameFirst); if (b) add(b[1], b[2]);
  }
  return out.slice(0, 8);
}
const PHONE_TXT = /(?<!\d)(?:\+972[-\s]?|0)(?:[23489]|5\d|7\d)[-\s]?\d{3}[-\s]?\d{4}(?!\d)/g;
const snippet = (text: string, rx: RegExp, n = 160) => { const m = text.match(rx); if (!m || m.index === undefined) return ""; const s = Math.max(0, m.index - 50); return clean(text.slice(s, s + n)); };
const EXPANSION = /(פתחנו|נפתח(?:ה)?|פתיחת|פותחים|תיפתח|נחנך|חנכנו)\s+(?:את\s+)?(?:ה?סניף|ה?מרכז|ה?מחסן|ה?מפעל|ה?אולם|ה?חנות)|סניף חדש|(?:מרכז (?:לוגיסטי|הפצה)|מחסן|מפעל) חדש|הרחבנו את (?:הפעילות|המפעל|המחסן|הצי)/;
const BRANCH = /(פתחנו|נפתח(?:ה)?|פתיחת|פותחים|תיפתח)\s+(?:את\s+)?ה?סניף|סניף חדש/;
const FLEET_N = /(?:צי של|מפעילה|ברשותנו|עם|כ-?|מעל)\s*(\d{1,4})\s*(משאיות|רכבי (?:שירות|חלוקה|הפצה|הובלה|חברה|עבודה)|רכבים מסחריים|כלי רכב|רכבים|אוטובוסים|מוניות|טנדרים|מיניבוסים|מלגזות|גרר(?:ים)?)/;
const FLEET = /צי (?:ה)?(?:רכב(?:ים)?|משאיות|אוטובוסים|הובלה)|צי רכבים|משאיות מנוף|ציי? הפצה/;
const EMPLOYEES = /(?:מעל|יותר מ-?|כ-?|מונה|מעסיקה?|ובה)\s*(\d{2,5})\s+(?:עובדים|עובדות ועובדים|אנשי צוות)/;
// a role word must start a word (optional ה/ל/ו/ב prefix): "מרכז" is not "רכז", "שליחה" is not "שליח"
const JOB_LINE = /(^|\n)[^\n]{0,60}(?:^|[\s(/"'׳-])[לוב]?(נהג(?:ת|ים|\/ת)?(?![א-ת])|מחסנאי|מלגזן|מנהל(?:ת)? (?:תפעול|לוגיסטיקה|מחסן)|שליח(?:ים|\/ה)?(?![א-ת])|מפיץ|סדרן|טכנאי|מכונאי|נציג|מהנדס|מנהל|רכז(?![א-ת])|עובד(?:ת)? ייצור|מפעיל)[^\n]{0,80}/g;
const CAREERS_PAGE = /דרוש(?:ים|\/ה|ה)?|משרה|משרות|קורות חיים|הגש(?:ת)? מועמדות|career|position|vacanc/i;

function jsonLd(html: string): Obj[] {
  const out: Obj[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (x: unknown) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") { out.push(x as Obj); if ((x as Obj)["@graph"]) walk((x as Obj)["@graph"]); } };
      walk(JSON.parse(m[1].trim()));
    } catch { /* invalid JSON-LD on the page */ }
  }
  return out;
}
const typeIs = (o: Obj, rx: RegExp) => [].concat(o["@type"] as never || []).some((t) => rx.test(String(t)));

async function crawlSite(b: { id: number; name: string; name_en?: string | null; reg_id?: string | null; reg_id_type?: string | null; website: string; phones: string[]; emails?: string[]; city: string | null; depth?: number }) {
  let home: Awaited<ReturnType<typeof get>>;
  try { if (!(await allowed(b.website))) return { robots: true }; home = await get(b.website, 9_000); } catch (e) { return { error: (e as Error).message.slice(0, 80) }; }
  if (home.status !== 200 || !/html/i.test(home.type)) return { error: "HTTP " + home.status };
  const base = new URL(home.url);
  if (SOCIAL_HOST.test(base.hostname)) return { error: "האתר מפנה לרשת חברתית" };
  const pages: { kind: string; url: string; html: string; text: string }[] = [{ kind: "home", url: home.url, html: home.body, text: textOf(home.body) }];
  const links = [...home.body.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)].map((m) => ({ href: decode(m[1]), label: clean(textOf(m[2])) }));
  for (const [kind, rx] of PAGE_KIND) {
    const l = links.find((x) => rx.test(x.href) || rx.test(x.label));
    if (!l) continue;
    let u: URL; try { u = new URL(l.href, base); } catch { continue; }
    if (u.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "") || pages.some((p) => p.url === u.href)) continue;
    try { if (!(await allowed(u.href))) continue; const r = await get(u.href, 7_000); if (r.status === 200 && /html/i.test(r.type)) pages.push({ kind, url: r.url, html: r.body, text: textOf(r.body) }); } catch { /* page not reachable */ }
  }
  const host = base.hostname.replace(/^www\./, "");
  // the registry's website value is trusted only when the site itself confirms the business
  const confirmed = siteConfirms(b, pages.map((p) => p.html).join("\n"), host);
  if (!confirmed.length) return { row: { business_id: b.id, name: b.name, rid: base.origin + "#deep", url: home.url,
    fields: { site_not_confirmed: "האתר אינו מזכיר את שם החברה, הטלפון או דומיין האימייל שלה – לא נלקח ממנו מידע" } } };
  const phones: { v: string; d: string; sub: string }[] = [];
  const addPhone = (raw: string) => { const p = normPhone(raw); if (p && !phones.some((x) => x.v === p)) phones.push({ v: p, d: fmtPhone(p), sub: p.startsWith("05") ? "mobile" : "main" }); };
  const mails = new Set<string>();
  const socials: Record<string, string> = {};
  const ppl: { name: string; role: string; phone?: string; email?: string }[] = [];
  const jobs: Obj[] = [];
  const findings: Obj[] = [];
  let org: Obj | null = null;
  for (const pg of pages) {
    const hrefs = [...pg.html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => decode(m[1]));
    for (const h of hrefs) {
      if (/^tel:/i.test(h)) addPhone(decodeURIComponent(h.slice(4)));
      else if (/^mailto:/i.test(h)) mails.add(decodeURIComponent(h.slice(7).split("?")[0]).trim().toLowerCase());
      else socialsFrom([h], socials);
    }
    if (pg.kind === "contact") for (const m of pg.text.match(PHONE_TXT) || []) addPhone(m);
    for (const m of pg.text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []) mails.add(m.toLowerCase());
    if (pg.kind === "contact" && !socials.contact_form && /<form[\s\S]*?(<input|<textarea)/i.test(pg.html)) socials.contact_form = pg.url;
    for (const o of jsonLd(pg.html)) {
      if (typeIs(o, /Organization|LocalBusiness|Corporation|Store|AutoRepair|MovingCompany/)) {
        org = org || o;
        for (const t of [].concat((o.telephone as never) || [])) addPhone(String(t));
        if (o.email) mails.add(String(o.email).replace(/^mailto:/, "").toLowerCase());
        socialsFrom([].concat((o.sameAs as never) || []).map(String), socials);
        for (const f of [].concat((o.founder as never) || [])) if (f && typeof f === "object" && (f as Obj).name) ppl.push({ name: clean((f as Obj).name), role: "מייסד/ת" });
      }
      if (typeIs(o, /JobPosting/)) {
        const hiringOrg = o.hiringOrganization as Obj | undefined;
        const loc = ((o.jobLocation as Obj)?.address as Obj)?.addressLocality;
        jobs.push({ business_id: b.id, url: String(o.url || pg.url + "#" + encodeURIComponent(clean(o.title).slice(0, 60))), title: clean(o.title), employer: clean(hiringOrg?.name || b.name),
          city: clean(loc), posted: clean(o.datePosted).slice(0, 10), status: o.validThrough && Date.parse(String(o.validThrough)) < Date.now() ? "closed" : "open", occupation: clean(o.occupationalCategory) });
      }
    }
    // contact pages often list the fleet / logistics / operations manager with a direct line
    if (pg.kind === "about" || pg.kind === "home" || pg.kind === "contact") for (const p of people(pg.text)) if (!ppl.some((x) => x.name === p.name)) ppl.push(p);
  }
  const em = [...mails].filter((m) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(m) && !/\.(png|jpe?g|gif|webp|svg)$/.test(m) && (m.endsWith("@" + host) || m.endsWith("." + host) || FREE_MAIL.test(m)) && !/sentry|wixpress|example\.|domain\./.test(m)).slice(0, 6).map((v) => ({ v }));
  const allText = pages.filter((p) => p.kind !== "careers").map((p) => p.text).join("\n");
  const pageOf = (kind: string) => pages.find((p) => p.kind === kind);
  // hiring from the business's own careers page (indication; JSON-LD postings are stored as jobs)
  const careers = pageOf("careers");
  if (careers && CAREERS_PAGE.test(careers.text)) {
    const lines = [...careers.text.matchAll(JOB_LINE)].map((m) => clean(m[0])).filter((l) => l.length > 3 && l.length < 140);
    const uniq = [...new Set(lines)].slice(0, 12);
    if (uniq.length) {
      // "הנהגה / הנהגת" is leadership, not a driver – no ה prefix allowed
      const drivers = uniq.filter((l) => /(^|[^א-ת])[לוב]?נהג(?:ת|ים|י|\/ת|\/ה)?(?![א-ת])|משאית|מלגזן/.test(l));
      const logi = uniq.filter((l) => /מחסנ|לוגיסט|(^|[^א-ת])[לוב]?שליח(?:ים|\/ה)?(?![א-ת])|מפיץ|סדרן|הפצה|מנהל(?:ת)? תפעול/.test(l));
      findings.push({ business_id: b.id, category: "hiring", key: "careers", fact_kind: "indication", url: careers.url, importance: "normal",
        title: `בעמוד הקריירה באתר החברה מפורסמות משרות: ${uniq.slice(0, 3).join(" · ")}`.slice(0, 280), detail: { lines: uniq, page: careers.url } });
      if (drivers.length) findings.push({ business_id: b.id, category: "hiring_drivers", key: "careers", fact_kind: "indication", url: careers.url, importance: "important",
        title: `מידע חשוב חדש – החברה מגייסת נהגים (עמוד הקריירה באתר): ${drivers.slice(0, 2).join(" · ")}`.slice(0, 280), detail: { lines: drivers } });
      if (logi.length) findings.push({ business_id: b.id, category: "hiring_logistics", key: "careers", fact_kind: "indication", url: careers.url, importance: "important",
        title: `מידע חשוב חדש – החברה מגייסת אנשי לוגיסטיקה / תפעול (עמוד הקריירה): ${logi.slice(0, 2).join(" · ")}`.slice(0, 280), detail: { lines: logi } });
    }
  }
  const exp = snippet(allText, EXPANSION);
  if (exp) findings.push({ business_id: b.id, category: BRANCH.test(exp) ? "branch_opened" : "expansion", key: "site", fact_kind: "indication", url: home.url,
    importance: "important", title: `${BRANCH.test(exp) ? "פתיחת סניף / מרכז" : "אינדיקציה להתרחבות"} – מתוך אתר החברה: "${exp}"`.slice(0, 280), detail: { quote: exp } });
  // a count is a fact only from 5 vehicles up ("עם 2 רכבים" is not a fleet)
  const fn0 = allText.match(FLEET_N), fn = fn0 && Number(fn0[1]) >= 5 ? fn0 : null;
  const fl = fn ? snippet(allText, FLEET_N) : snippet(allText, FLEET);
  if (fl) findings.push({ business_id: b.id, category: "fleet", key: "site", fact_kind: fn ? "fact" : "indication", url: home.url, importance: "important",
    title: (fn ? `צי רכב: החברה מציינת באתרה ${fn[1]} ${fn[2]}` : "אינדיקציה לצי רכב באתר החברה") + ` – "${fl}"`, detail: { quote: fl, vehicles: fn ? Number(fn[1]) : null, type: fn ? fn[2] : null } });
  const emp = (pageOf("about")?.text || pageOf("home")?.text || "").match(EMPLOYEES);
  if (emp && Number(emp[1]) >= 5) findings.push({ business_id: b.id, category: "employees", key: "site", fact_kind: "fact", url: (pageOf("about") || pages[0]).url, importance: "normal",
    title: `החברה מציינת באתרה כ-${Number(emp[1]).toLocaleString("en")} עובדים`, detail: { employees: Number(emp[1]), quote: clean(emp[0]) } });
  // ── business relations published by the company itself ──
  // the page chrome (header / footer / navigation) carries credits, widgets and the company's own other sites – ignored
  const mainOf = (html: string) => html.replace(/<(header|footer|nav|aside)\b[\s\S]*?<\/\1>/gi, " ");
  const CREDIT = /בני(?:י)?ת אתרים|בניה ועיצוב|עיצוב ו?(?:בניי?ה|פיתוח)|פותח ע|נבנה ע|website by|web ?design|created by|powered by|developed by|design (?:&|and|by)|קידום אתרים|\bseo\b|נגישות|accessib|cookie|purposes|browser|privacy|מדיניות|תקנון|hosting|אחסון|הזמן שולחן|לכתבה|עדכון פרטים|english|hebrew|עברית|русский|français|español|中文/i;
  // registrable label: "customers.katzd.co.il" → "katzd"
  const mainLabel = (h: string) => h.replace(/\.(co|org|net|ac|gov|muni|k12)\.[a-z]{2}$|\.[a-z]{2,}$/, "").split(".").pop() || h;
  const ownLabel = mainLabel(host);
  const sameBrand = (h: string) => { const l = mainLabel(h); return l === ownLabel || (l.length >= 4 && ownLabel.length >= 4 && (l.includes(ownLabel) || ownLabel.includes(l))); };
  const relations: Obj[] = [];
  const depth = (b.depth || 0) + 1;
  const outLinks = (html: string) => [...html.matchAll(/<a\b[^>]*href\s*=\s*["'](https?:\/\/[^"'#]+)["'][^>]*>([\s\S]{0,400}?)<\/a>/gi)].map((m) => {
    let h = ""; try { h = new URL(decode(m[1])).hostname.replace(/^www\./, "").toLowerCase(); } catch { /* bad url */ }
    const alt = (m[2].match(/alt\s*=\s*["']([^"']{2,60})["']/i) || [])[1] || "";
    return { host: h, url: decode(m[1]), name: clean(textOf(m[2])) || clean(decode(alt)) };
  }).filter((l) => l.host && /\.[a-z]{2,}$/.test(l.host) && l.host !== host && !l.host.endsWith("." + host) && !host.endsWith("." + l.host)
      && !NOT_COMPANY.test(l.host) && !SOCIAL_HOST.test(l.host) && !sameBrand(l.host) && !CREDIT.test(l.name + " " + l.url));
  const relPage = pageOf("relations");
  if (relPage) {
    const lbl = decodeURIComponent(relPage.url) + " " + ((relPage.html.match(/<title[^>]*>([^<]*)/i) || [])[1] || "");
    const kind = /ספק|supplier/i.test(lbl) ? "supplier" : /שותפ|partner/i.test(lbl) ? "partner" : "client";
    const seen = new Set<string>();
    for (const l of outLinks(mainOf(relPage.html))) {
      if (seen.has(l.host) || seen.size >= 40) continue;
      seen.add(l.host);
      relations.push({ from_business_id: b.id, relation: kind, level: "stated", to_domain: l.host, to_name: l.name.slice(0, 80) || null, url: relPage.url, depth, detail: { link: l.url } });
    }
    // logos without links: the company names written in the image alt text
    // (kept only when the name is exactly a registered company – certification badges, social icons and slogans are dropped)
    const own = nameTokens(b.name).map((w) => w.toLowerCase());
    for (const m of mainOf(relPage.html).matchAll(/<img\b[^>]*alt\s*=\s*["']([^"']{3,60})["']/gi)) {
      const nm = clean(decode(m[1]));
      if (seen.size >= 60 || seen.has(nm) || /logo|לוגו|icon|אייקון|image|תמונה|banner|באנר|^\d+$|^img|iso ?\d|תקן|facebook|instagram|youtube|tiktok|linkedin|whatsapp|פייסבוק|אינסטגרם|יוטיוב|וואטסאפ|מיוצר/i.test(nm)
          || nameTokens(nm).length === 0 || nameTokens(nm).some((w) => own.includes(w.toLowerCase()))) continue;
      seen.add(nm);
      relations.push({ from_business_id: b.id, relation: kind, level: "stated", to_name: nm, url: relPage.url, depth, require_match: true, detail: { from_logo_alt: true } });
    }
  }
  // other companies' sites linked from the home page: a mention only (kept, not followed, not a business relation)
  const seenHome = new Set(relations.map((r) => r.to_domain));
  for (const l of outLinks(mainOf(home.body))) {
    if (seenHome.has(l.host) || seenHome.size >= 15) continue;
    seenHome.add(l.host);
    relations.push({ from_business_id: b.id, relation: "mention", level: "mention", to_domain: l.host, to_name: l.name.slice(0, 80) || null, url: home.url, depth, detail: { link: l.url } });
  }
  // structured data the company publishes about its own group
  if (org) for (const [k, rel] of [["parentOrganization", "parent"], ["subOrganization", "subsidiary"], ["brand", "brand"]] as const) {
    for (const o of [].concat((org[k] as never) || [])) {
      const oo = o as unknown as Obj; const nm = clean(typeof o === "string" ? o : oo?.name); let h = "";
      try { h = oo?.url ? new URL(String(oo.url)).hostname.replace(/^www\./, "") : ""; } catch { /* bad url */ }
      if (nm || h) relations.push({ from_business_id: b.id, relation: rel, level: "stated", to_name: nm || null, to_domain: h || null, url: home.url, depth, detail: { json_ld: k } });
    }
  }
  const founded = org && clean(org.foundingDate).match(/(19|20)\d{2}/);
  return {
    row: { business_id: b.id, name: b.name, rid: base.origin + "#deep", url: home.url, phones, emails: em, socials, people: ppl.slice(0, 8), founded_year: founded ? founded[0] : undefined,
      fields: { site_confirmed_by: confirmed, pages: pages.map((p) => `${p.kind}: ${p.url}`), phones: phones.map((p) => p.d), emails: em.map((e) => e.v), socials: Object.keys(socials), people: ppl.map((p) => `${p.name} – ${p.role}`) } },
    jobs, findings, relations,
  };
}
type SiteBiz = { id: number; name: string; name_en: string | null; reg_id: string | null; reg_id_type: string | null; website: string | null; phones: string[]; emails: string[]; city: string | null; shared_by: number; depth: number };
// crawl a batch of businesses' own sites and put everything into their existing records
async function processSites(sb: SupabaseClient, batch: SiteBiz[], sourceKey: string) {
  const rows: Obj[] = [], jobs: Obj[] = [], finds: Obj[] = [], rels: Obj[] = [];
  const res: Record<number, string> = {};
  await pool(batch, 10, async (b) => {
    if (!b.website) { res[b.id] = "אין אתר מאומת לעסק"; return; }
    // a site listed for 3+ businesses (group / umbrella / brand site) says nothing specific about this one
    const r = (b.shared_by >= 3
      ? { row: { business_id: b.id, name: b.name, rid: b.website + "#deep", url: b.website, fields: { shared_site: `האתר רשום ל-${b.shared_by} עסקים – לא נלקח ממנו מידע לעסק בודד` } } }
      : await crawlSite(b as never)) as { row?: Obj; jobs?: Obj[]; findings?: Obj[]; relations?: Obj[]; error?: string; robots?: boolean };
    if (r.row) rows.push(r.row);
    if (r.jobs) jobs.push(...r.jobs);
    if (r.findings) finds.push(...r.findings);
    if (r.relations) rels.push(...r.relations);
    const f = (r.row?.fields || {}) as Obj;
    res[b.id] = r.error ? "האתר לא נטען: " + r.error : r.robots ? "robots.txt חוסם" : f.site_not_confirmed ? "האתר לא אומת כשייך לעסק" : f.shared_site ? "אתר משותף לכמה עסקים" : "האתר נבדק";
  });
  let enriched = 0, details = 0, relCount = 0;
  if (rows.length) { const x = await rpc<{ enriched: number; details: number }>(sb, "nr_ingest", { p_source: sourceKey, p_rows: rows }); enriched += x.enriched; details += x.details; }
  // facts read from the company's site keep ONE identity whoever re-reads it (deep crawl or tracking): a re-check updates, never duplicates
  if (jobs.length) await rpc(sb, "nr_ingest_jobs", { p_source: "enr:web_deep", p_rows: jobs });
  if (finds.length) { const x = await rpc<{ matched: number }>(sb, "nr_ingest_findings", { p_source: "enr:web_deep", p_rows: finds }); details += x.matched; }
  for (let i = 0; i < rels.length; i += 200) { const x = await rpc<{ relations: number }>(sb, "nr_ingest_relations", { p_source: "enr:site_relations", p_rows: rels.slice(i, i + 200) }); relCount += x.relations; }
  await feedDomains(sb, rels.map((r) => String(r.to_domain || "")).filter((d) => /\.(co|org|net)\.il$/.test(d)).map((d) => d.split(".").slice(-3).join(".")), "enr:link_discovery").catch(() => {});
  return { enriched, details, relations: relCount, results: res };
}
async function stepDeep(sb: SupabaseClient, src: Src, deadline: number) {
  const t0 = Date.now();
  let read = 0, enriched = 0, details = 0, relations = 0;
  try {
    // at most 30 sites per call: parsing many pages in one call exceeds the per-call compute allowance
    while (Date.now() < deadline - 25_000 && read < 30) {
      const batch = await rpc<SiteBiz[]>(sb, "nr_claim_sites", { p_limit: 10 });
      if (!batch.length) break;
      const x = await processSites(sb, batch, src.key);
      read += batch.length; enriched += x.enriched; details += x.details; relations += x.relations;
    }
    const { count } = await sb.from("nr_businesses").select("id", { count: "exact", head: true }).not("website", "is", null).is("enr_site_checked_at", null);
    await account(sb, src, t0, { read, enriched, details, done: !count, note: relations ? `${relations} קשרים` : undefined, reason: "כל אתרי העסקים הידועים נסרקו לעומק; אתר חדש שיתגלה ייסרק אוטומטית" });
    return { key: src.key, read, enriched, details, relations, left: count };
  } catch (e) { await fail(sb, src, t0, e); return { key: src.key, error: (e as Error).message }; }
}

// ════════════════ 4b. company → company: identify related sites by the ח.פ. printed on them ════════════════
const LEGAL_NAME = /([א-תA-Za-z0-9"'׳״&.\- ]{2,60}?(?:בע["״׳']?מ|בעמ|ltd\.?|limited|\(ע["״]ר\)))/i;
async function stepRelDiscovery(sb: SupabaseClient, src: Src, deadline: number) {
  const t0 = Date.now();
  let read = 0, matched = 0, created = 0;
  try {
    while (Date.now() < deadline - 15_000) {
      const batch = await rpc<{ domain: string; from_business_id: number; depth: number }[]>(sb, "nr_claim_rel_domains", { p_limit: 10 });
      if (!batch.length) break;
      await pool(batch, 10, async (q) => {
        let status = "no_id", note = "", found: number | null = null;
        try {
          const u = `https://${q.domain}/`;
          if (!(await allowed(u))) { status = "robots"; note = "robots.txt"; }
          else {
            const home = await get(u, 8_000);
            if (home.status !== 200 || !/html/i.test(home.type)) { status = "error"; note = "HTTP " + home.status; }
            else {
              let text = textOf(home.body);
              let ids = regIdsOn(text);
              if (!ids.length) {
                // the company number is usually in the footer, the contact page or the terms page
                const l = [...home.body.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)]
                  .find((m) => /contact|צור[-_ %20]*קשר|אודות|about|תקנון|terms|מדיניות/i.test(decode(m[1]) + " " + textOf(m[2])));
                if (l) {
                  try {
                    const pu = new URL(decode(l[1]), home.url);
                    if (pu.hostname.replace(/^www\./, "") === new URL(home.url).hostname.replace(/^www\./, "") && await allowed(pu.href)) {
                      const p2 = await get(pu.href, 7_000);
                      if (p2.status === 200) { text += "\n" + textOf(p2.body); ids = regIdsOn(text); }
                    }
                  } catch { /* page not reachable */ }
                }
              }
              const origin = new URL(home.url).origin;
              if (ids.length !== 1) { status = "no_id"; note = ids.length ? "כמה מספרי ח.פ. באתר – לא שויך" : "לא נמצא ח.פ. תקין באתר"; }
              else {
                const [hit] = await rpc<{ id: number; name: string; website: string | null }[]>(sb, "nr_business_by_reg", { p_reg: ids[0] });
                if (hit) {
                  found = hit.id; status = "matched"; note = `ח.פ. ${ids[0]} – ${hit.name}`; matched++;
                  if (!hit.website) {
                    await rpc(sb, "nr_ingest", { p_source: src.key, p_rows: [{ business_id: hit.id, name: hit.name, rid: q.domain, url: home.url, websites: [origin],
                      fields: { identified_by_reg_id_on_site: ids[0], found_via_business: q.from_business_id } }] });
                    await rpc(sb, "nr_confirm_site", { p_business: hit.id, p_url: origin, p_evidence: [`ח.פ. ${ids[0]} של החברה מופיע באתר`] });
                    await sb.from("nr_businesses").update({ enr_depth: q.depth }).eq("id", hit.id).eq("enr_depth", 0);
                  }
                } else {
                  // a company that is not in the registry yet: its valid number printed on its own site, with its legal name next to it
                  const flat = text.replace(/\s+/g, " ");
                  const at = flat.indexOf(ids[0].slice(0, 3));
                  const near = at > 0 ? flat.slice(Math.max(0, at - 90), at) : "";
                  const name = clean((near.match(LEGAL_NAME) || [])[1] || "").replace(/^.*?(©|כל הזכויות שמורות( ל-?)?|all rights reserved( to)?|copyright)\s*/i, "");
                  if (name.length < 3) { status = "no_id"; note = `ח.פ. ${ids[0]} תקין אך לא במאגר, ולא נמצא לידו שם החברה – לא נוסף`; }
                  else {
                    await rpc(sb, "nr_ingest", { p_source: src.key, p_rows: [{ reg_id: ids[0], reg_type: ids[0].startsWith("58") ? "amuta" : "company", name, rid: q.domain, url: home.url, websites: [origin],
                      create: true, fields: { identified_by_reg_id_on_site: ids[0], name_on_site: name, found_via_business: q.from_business_id } }] });
                    const [nb] = await rpc<{ id: number; name: string }[]>(sb, "nr_business_by_reg", { p_reg: ids[0] });
                    if (nb) { found = nb.id; status = "created"; note = `חברה חדשה: ${name} (ח.פ. ${ids[0]})`; created++;
                      await sb.from("nr_businesses").update({ enr_depth: q.depth }).eq("id", nb.id); }
                  }
                }
                if (found) await rpc(sb, "nr_resolve_domain", { p_domain: q.domain, p_business: found });
              }
            }
          }
        } catch (e) { status = "error"; note = (e as Error).message.slice(0, 80); }
        await sb.from("nr_rel_domain_queue").update({ status, note, found_business_id: found, checked_at: now() }).eq("domain", q.domain);
      });
      read += batch.length;
    }
    const { count } = await sb.from("nr_rel_domain_queue").select("domain", { count: "exact", head: true }).eq("status", "queued");
    await account(sb, src, t0, { read, enriched: matched, details: matched + created, note: `${matched} זוהו, ${created} חדשות` });
    const { data: cur } = await sb.from("nr_sources").select("businesses_new").eq("key", src.key).single();
    await sb.from("nr_sources").update({ status: "collecting", businesses_new: Number(cur?.businesses_new || 0) + created,
      status_reason: `תור אתרים קשורים: ${count || 0} ממתינים; חברה מזוהה רק לפי ח.פ. תקין שמופיע באתר` }).eq("key", src.key);
    return { key: src.key, read, matched, created, left: count };
  } catch (e) { await fail(sb, src, t0, e); return { key: src.key, error: (e as Error).message }; }
}

// ════════════════ 4c. Wikidata: official social accounts, group structure, CEO, employees ════════════════
const WD_TYPES = "wd:Q4830453 wd:Q783794 wd:Q6881511 wd:Q891723 wd:Q167037 wd:Q1589009 wd:Q163740 wd:Q658255 wd:Q206361 wd:Q22687 wd:Q507619 wd:Q18388277 wd:Q1058914 wd:Q2659904 wd:Q46970 wd:Q740752 wd:Q4287745 wd:Q1331793";
async function sparql(q: string) {
  const r = await fetch("https://query.wikidata.org/sparql?query=" + encodeURIComponent(q), { headers: { "User-Agent": UA + " orin1607@gmail.com", Accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error("Wikidata HTTP " + r.status);
  const j = await r.json() as { results: { bindings: Record<string, { value: string }>[] } };
  return j.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])) as Record<string, string>);
}
const WD_SOCIAL: Record<string, (v: string) => string> = {
  fb: (v) => "https://www.facebook.com/" + v, ig: (v) => "https://www.instagram.com/" + v, li: (v) => "https://www.linkedin.com/company/" + v,
  yt: (v) => "https://www.youtube.com/channel/" + v, tt: (v) => "https://www.tiktok.com/@" + v, tw: (v) => "https://x.com/" + v,
};
const WD_NET: Record<string, string> = { fb: "facebook", ig: "instagram", li: "linkedin", yt: "youtube", tt: "tiktok", tw: "twitter" };
// a Wikidata organisation is attached only by its official website domain or by an exact, unique registered name
async function wdBusiness(sb: SupabaseClient, web: string | undefined, he: string | undefined): Promise<number | null> {
  if (web) { const id = await rpc<number | null>(sb, "nr_business_by_domain", { p_domain: web }); if (id) return id; }
  if (he) { const m = await rpc<{ id?: number; status: string }>(sb, "nr_match_business", { p_name: he, p_city: null, p_reg: null }); if (m.status === "matched" && m.id) return Number(m.id); }
  return null;
}
async function stepWikidata(sb: SupabaseClient, src: Src, deadline: number) {
  const t0 = Date.now();
  const phase = String(src.config.phase || "items");
  let off = src.cursor || 0, read = 0, enriched = 0, details = 0;
  try {
    while (Date.now() < deadline - 20_000) {
      const sub = `{ SELECT DISTINCT ?c WHERE { ?c wdt:P17 wd:Q801; wdt:P31 ?t. VALUES ?t { ${WD_TYPES} } } ORDER BY ?c LIMIT 300 OFFSET ${off} }`;
      const q = phase === "items"
        ? `SELECT ?c ?he ?en ?web ?fb ?ig ?li ?yt ?tt ?tw ?emp ?ceoHe ?ceoEn ?inc WHERE { ${sub}
            OPTIONAL{?c rdfs:label ?he FILTER(LANG(?he)="he")} OPTIONAL{?c rdfs:label ?en FILTER(LANG(?en)="en")} OPTIONAL{?c wdt:P856 ?web}
            OPTIONAL{?c wdt:P2013 ?fb} OPTIONAL{?c wdt:P2003 ?ig} OPTIONAL{?c wdt:P4264 ?li} OPTIONAL{?c wdt:P2397 ?yt} OPTIONAL{?c wdt:P7085 ?tt} OPTIONAL{?c wdt:P2002 ?tw}
            OPTIONAL{?c wdt:P1128 ?emp} OPTIONAL{?c wdt:P571 ?inc} OPTIONAL{?c wdt:P169 ?ceo. OPTIONAL{?ceo rdfs:label ?ceoHe FILTER(LANG(?ceoHe)="he")} OPTIONAL{?ceo rdfs:label ?ceoEn FILTER(LANG(?ceoEn)="en")}} }`
        : `SELECT ?c ?cWeb ?cHe ?rel ?o ?oHe ?oEn ?oWeb WHERE { ${sub}
            { ?c wdt:P749 ?o BIND("parent" AS ?rel) } UNION { ?c wdt:P355 ?o BIND("subsidiary" AS ?rel) } UNION { ?c wdt:P127 ?o FILTER NOT EXISTS { ?o wdt:P31 wd:Q5 } BIND("owner" AS ?rel) } UNION { ?c wdt:P1830 ?o FILTER NOT EXISTS { ?o wdt:P31 wd:Q5 } BIND("subsidiary" AS ?rel) }
            OPTIONAL{?c wdt:P856 ?cWeb} OPTIONAL{?c rdfs:label ?cHe FILTER(LANG(?cHe)="he")}
            OPTIONAL{?o rdfs:label ?oHe FILTER(LANG(?oHe)="he")} OPTIONAL{?o rdfs:label ?oEn FILTER(LANG(?oEn)="en")} OPTIONAL{?o wdt:P856 ?oWeb} }`;
      const rows = await sparql(q);
      // page size is measured on the inner item list: re-count the distinct items this page returned
      const items = new Set(rows.map((r) => r.c));
      if (phase === "items") {
        const by = new Map<string, Record<string, Set<string>>>();
        for (const r of rows) { const e = by.get(r.c) || {}; for (const [k, v] of Object.entries(r)) if (v) (e[k] = e[k] || new Set()).add(v); by.set(r.c, e); }
        const ingest: Obj[] = [], finds: Obj[] = [];
        for (const [c, e] of by) {
          const one = (k: string) => e[k] ? [...e[k]][0] : undefined;
          const bid = await wdBusiness(sb, one("web"), one("he"));
          if (!bid) continue;
          const qid = c.split("/").pop()!;
          const socials: Record<string, string> = {};
          for (const k of Object.keys(WD_SOCIAL)) {
            const v = one(k);
            if (!v || /^groups\//i.test(v)) continue; // a Facebook group is not the company's page
            const u = socialUrl(WD_NET[k], /^https?:\/\//i.test(v) ? v : WD_SOCIAL[k](v));
            if (u) socials[WD_NET[k]] = u;
          }
          const ceo = one("ceoHe") || one("ceoEn");
          let site = ""; try { site = one("web") ? new URL(one("web")!).origin : ""; } catch { /* bad url */ }
          ingest.push({ business_id: bid, name: one("he") || one("en"), rid: qid, url: c, websites: site ? [site] : [], socials,
            people: ceo ? [{ name: ceo, role: 'מנכ"ל' }] : [], founded_year: (one("inc") || "").slice(0, 4) || undefined,
            fields: { wikidata: c, socials: Object.keys(socials), ceo: ceo || null, employees: e.emp ? [...e.emp] : null } });
          const empN = e.emp ? Math.max(...[...e.emp].map(Number).filter((x) => x > 0)) : 0;
          if (empN > 0) finds.push({ business_id: bid, method: "wikidata", category: "employees", key: qid, fact_kind: "fact", url: c, importance: "normal",
            title: `לפי Wikidata: כ-${empN.toLocaleString("en")} עובדים`, detail: { employees: empN, wikidata: c } });
          await sb.from("nr_businesses").update({ wd_id: qid }).eq("id", bid);
        }
        if (ingest.length) { const x = await rpc<{ enriched: number; details: number }>(sb, "nr_ingest", { p_source: src.key, p_rows: ingest }); enriched += x.enriched; details += x.details; }
        if (finds.length) await rpc(sb, "nr_ingest_findings", { p_source: src.key, p_rows: finds });
      } else {
        const rels: Obj[] = [];
        for (const r of rows) {
          const from = await wdBusiness(sb, r.cWeb, r.cHe);
          if (!from) continue;
          let dom = ""; try { dom = r.oWeb ? new URL(r.oWeb).hostname.replace(/^www\./, "") : ""; } catch { /* bad url */ }
          rels.push({ from_business_id: from, relation: r.rel, level: "verified", to_domain: dom || null, to_name: r.oHe || r.oEn || null, url: r.o, depth: 1, detail: { wikidata_from: r.c, wikidata_to: r.o } });
        }
        if (rels.length) { const x = await rpc<{ relations: number }>(sb, "nr_ingest_relations", { p_source: src.key, p_rows: rels }); details += x.relations; }
      }
      read += items.size; off += 300;
      // the relations query only returns items that HAVE a relation, so the end of the list is detected by the item phase size
      const lastPage = phase === "items" ? items.size < 300 : off > Number(src.config.items_total || 0) + 300;
      if (phase === "items" && lastPage) src.config = { ...src.config, items_total: off };
      if (lastPage) {
        if (phase === "items") { src.config = { ...src.config, phase: "relations" }; await sb.from("nr_sources").update({ config: src.config, cursor: 0 }).eq("key", src.key); src.cursor = 0; off = 0; break; }
        await account(sb, src, t0, { read, enriched, details, cursor: 0, done: true, reason: "כל הארגונים הישראליים ב-Wikidata נבדקו (חשבונות רשמיים, מבנה קבוצה, מנכ\"ל, עובדים); רענון שבועי" });
        await sb.from("nr_sources").update({ config: { ...src.config, phase: "items", last_full_run: now() } }).eq("key", src.key);
        return { key: src.key, read, enriched, details, done: true };
      }
      break; // one page per tick: the Wikidata query service rate-limits heavy queries
    }
    await account(sb, src, t0, { read, enriched, details, cursor: off });
    return { key: src.key, phase, read, enriched, details, cursor: off };
  } catch (e) {
    // 429 = the query service asks us to slow down: not a failure, the next tick continues from the same page
    if (/HTTP 429/.test((e as Error).message)) { await sb.from("nr_sources").update({ last_error: "Wikidata ביקש להאט (429) – ממשיך בריצה הבאה", updated_at: now() }).eq("key", src.key); return { key: src.key, throttled: true }; }
    await fail(sb, src, t0, e); return { key: src.key, error: (e as Error).message };
  }
}

// ════════════════ 4d. watched companies: re-check on their own schedule ════════════════
async function stepWatch(sb: SupabaseClient, src: Src, deadline: number) {
  const t0 = Date.now();
  let read = 0, details = 0;
  try {
    while (Date.now() < deadline - 25_000) {
      const batch = await rpc<SiteBiz[]>(sb, "nr_claim_watch", { p_limit: 6 });
      if (!batch.length) break;
      const before = new Date(Date.now() - 1000).toISOString();
      const x = await processSites(sb, batch, "enr:watch");
      details += x.details; read += batch.length;
      for (const b of batch) {
        const { count } = await sb.from("nr_findings").select("id", { count: "exact", head: true }).eq("business_id", b.id).eq("match_status", "matched").gte("discovered_at", before);
        await sb.from("nr_watch").update({ last_result: `${x.results[b.id] || "נבדק"} · ${count || 0} ממצאים חדשים` }).eq("business_id", b.id);
      }
    }
    if (read) await account(sb, src, t0, { read, enriched: read, details });
    return { key: src.key, read, details };
  } catch (e) { await fail(sb, src, t0, e); return { key: src.key, error: (e as Error).message }; }
}

// ════════════════ 5. RSS headlines with a business event (always to review) ════════════════
const EVENTS: [string, string, RegExp][] = [
  ["tender_won", "זכייה במכרז", /זכתה|זכייה במכרז|זוכה במכרז|זכו במכרז/],
  ["branch_opened", "פתיחת סניף / מרכז", /(פותחת|תפתח|פתחה|נפתח)\s+(?:את\s+)?(?:ה?סניף|מרכז|מפעל|חנות)|מרכז (?:לוגיסטי|הפצה)/],
  ["expansion", "רכישה / מיזוג / התרחבות", /רוכשת|רכשה|תרכוש|רכישת|מיזוג|מתמזגת|מתרחבת|הרחבת/],
  ["news", "גיוס הון / הנפקה", /גייסה|סבב גיוס|גיוס של \d|הנפקה|בדרך לבורסה/],
  ["news", "שינוי בהנהלה", /מנכ["״]ל(?:ית)? חדש|מונה ל|מינוי|יסיים את תפקידו|פורש|יו["״]ר חדש/],
];
async function stepRss(sb: SupabaseClient, src: Src) {
  const t0 = Date.now();
  let read = 0, pending = 0;
  try {
    for (const feed of (src.config.feeds as string[]) || []) {
      let xml = "";
      try { if (!(await allowed(feed))) continue; const r = await get(feed, 15_000, "application/rss+xml,application/xml,text/xml"); if (r.status !== 200) continue; xml = r.body; } catch { continue; }
      for (const it of xml.match(/<item>[\s\S]*?<\/item>/g) || []) {
        read++;
        const tag = (n: string) => clean(decode(((it.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`)) || [])[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "")).replace(/<[^>]+>/g, ""));
        const title = tag("title"), link = tag("link").replace(/#.*$/, ""), pub = tag("pubDate");
        const ev = EVENTS.find(([, , rx]) => rx.test(title));
        if (!ev || !link) continue;
        const cands = await rpc<number[]>(sb, "nr_headline_candidates", { p_text: title });
        if (!cands || !cands.length) continue;
        const d = pub ? new Date(pub) : null;
        const { error } = await sb.from("nr_findings").upsert({
          candidate_ids: cands, subject_name: title.slice(0, 200), source_key: src.key, source_url: link, category: ev[0], fact_kind: "indication",
          title: `כותרת חדשות (${ev[1]}): "${title.slice(0, 200)}" – ממתין לאישור שיוך לחברה`, detail: { headline: title, event: ev[1], feed, published: pub },
          importance: "normal", match_status: "pending_review", match_method: "headline_name", published_at: d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null,
          dedup_key: "rss:" + link,
        }, { onConflict: "dedup_key", ignoreDuplicates: true });
        if (!error) pending++;
      }
    }
    await account(sb, src, t0, { read, enriched: 0, details: pending, note: `${pending} כותרות עם אירוע עסקי נשלחו לבדיקה`, done: false });
    await sb.from("nr_sources").update({ status: "collecting", status_reason: "נבדק כל 3 שעות; כותרות עם אירוע עסקי נשלחות לבדיקה ידנית לפני שיוך" }).eq("key", src.key);
    return { key: src.key, read, pending };
  } catch (e) { await fail(sb, src, t0, e); return { key: src.key, error: (e as Error).message }; }
}

// ════════════════ tick ════════════════
async function tick(sb: SupabaseClient) {
  const t0 = Date.now();
  const { data: locked } = await sb.rpc("nr_enrich_try_lock", { p_seconds: 300 });
  if (!locked) return { skipped: "another enrichment tick is running" };
  const steps: unknown[] = [];
  try {
    const { data: ctl } = await sb.from("nr_control").select("enrich_running,engines").eq("id", 1).single();
    if (!ctl?.enrich_running) return { skipped: "stopped" };
    // per-engine switches (missing = on; "all" = emergency stop): watch and deep crawl run inside the tick
    const eng = (ctl.engines || {}) as Record<string, boolean>;
    const on = (e: string) => eng.all !== false && eng[e] !== false;
    const at = (f: number) => t0 + TICK_BUDGET_MS * f;
    const run = async (key: string, f: (s: Src) => Promise<unknown>) => {
      const s = await source(sb, key);
      if (!s || !["pending", "collecting", "completed"].includes(s.status)) return;
      await sb.from("nr_control").update({ enrich_current: key }).eq("id", 1);
      steps.push(await f(s));
    };
    // government contracts first (fast, server-to-server), then the slices for the crawling sources
    for (const k of ["enr:gov_contracts", "enr:gov_tenders"]) {
      const s = await source(sb, k);
      if (s && ["pending", "collecting"].includes(s.status) && Date.now() < at(0.2)) await run(k, (x) => stepGov(sb, x, at(0.2)));
    }
    if (on("watch")) {
      const before = steps.length;
      await run("enr:watch", (s) => stepWatch(sb, s, at(0.25)));
      if (steps.length > before) await sb.rpc("nr_beat", { p_engine: "watch", p_ok: true });
    }
    const wd = await source(sb, "enr:wikidata");
    if (wd && (["pending", "collecting"].includes(wd.status) || (wd.status === "completed" && Date.now() - Date.parse(String(wd.config.last_full_run || 0)) > 7 * 86400_000))) await run("enr:wikidata", (s) => stepWikidata(sb, s, at(0.4)));
    await run("enr:taasuka_jobs", (s) => stepJobs(sb, s, at(0.45)));
    await run("enr:web_discovery", (s) => stepDiscovery(sb, s, at(0.55)));
    if (on("deep")) {
      await run("enr:web_deep", (s) => stepDeep(sb, s, at(0.85)));
      await run("enr:rel_discovery", (s) => stepRelDiscovery(sb, s, at(1)));
    }
    const rss = await source(sb, "enr:news_rss");
    if (rss && !["blocked", "unsupported"].includes(rss.status) && (!rss.last_run_at || Date.now() - Date.parse(rss.last_run_at) > 3 * 3600_000) && Date.now() < t0 + TICK_BUDGET_MS + 15_000) steps.push(await stepRss(sb, rss));
    await sb.rpc("nr_refresh_enrich_recent", { p_minutes: 4 });
    await sb.from("nr_control").update({ enrich_current: null }).eq("id", 1);
    return { steps, ms: Date.now() - t0 };
  } finally {
    await sb.rpc("nr_enrich_unlock");
  }
}

// ════════════════ 6. Common Crawl web graph → Israeli business domains (open data, domain names only) ════════════════
const CC = "https://data.commoncrawl.org/";
async function ccFirstHost(path: string): Promise<string> {
  const r = await fetch(CC + path, { headers: { Range: "bytes=0-65535", "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  const reader = r.body!.pipeThrough(new DecompressionStream("gzip")).pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  try { while (!buf.includes("\n")) { const { value, done } = await reader.read(); if (done) break; buf += value; } } catch { /* truncated range – first line is enough */ }
  reader.cancel().catch(() => {});
  return (buf.split("\n")[0].split("\t")[1] || "").trim();
}
// quarterly host graphs, newest first; each one lists hosts the others may miss
const CC_GRAPHS = ["cc-main-2026-jun-jul-aug", "cc-main-2026-mar-apr-may", "cc-main-2025-26-dec-jan-feb", "cc-main-2025-sep-oct-nov"];
async function harvestCc(sb: SupabaseClient, graphArg?: string) {
  const src = await source(sb, "enr:cc_domains");
  if (!src) return { error: "no source" };
  const t0 = Date.now();
  const done = (src.config.harvested as string[]) || (src.config.harvested_at ? [String(src.config.graph || CC_GRAPHS[0])] : []);
  const graph = graphArg || CC_GRAPHS.find((g) => !done.includes(g));
  if (!graph) return { skipped: "all known graphs harvested" };
  const list = await (await fetch(`${CC}projects/hyperlinkgraph/${graph}/host/${graph}-host-vertices.paths.gz`, { signal: AbortSignal.timeout(30_000) })).body!
    .pipeThrough(new DecompressionStream("gzip")).pipeThrough(new TextDecoderStream());
  let paths = ""; for await (const c of list) paths += c;
  const parts = paths.split("\n").map((x) => x.trim()).filter(Boolean);
  // parts are sorted by reversed host name: find the ones whose range covers "il."
  let idx = graph === String(src.config.graph || CC_GRAPHS[0]) ? Number(src.config.part ?? -1) : -1;
  if (idx < 0) {
    let lo = 0, hi = parts.length - 1;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if ((await ccFirstHost(parts[mid])) <= "il.") lo = mid; else hi = mid - 1; }
    idx = lo;
  }
  const domains = new Set<string>();
  for (const pi of [idx, idx + 1]) {
    if (pi >= parts.length) break;
    if (pi === idx + 1 && !(await ccFirstHost(parts[pi])).startsWith("il.")) break;
    const st = (await fetch(CC + parts[pi], { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90_000) })).body!
      .pipeThrough(new DecompressionStream("gzip")).pipeThrough(new TextDecoderStream());
    let rest = "", seen = false;
    for await (const chunk of st) {
      const lines = (rest + chunk).split("\n"); rest = lines.pop() || "";
      for (const l of lines) {
        const h = l.slice(l.indexOf("\t") + 1);
        if (!h.startsWith("il.")) { if (seen && h > "il.") break; continue; }
        seen = true;
        const p = h.split(".");
        // il.co.example(.www) → example.co.il ; business zones only (no academic / government / municipal / school / army)
        if (p.length >= 3 && (p[1] === "co" || p[1] === "org" || p[1] === "net") && /^[a-z0-9-]{2,63}$/.test(p[2])) domains.add(`${p[2]}.${p[1]}.il`);
      }
      if (seen && rest.slice(rest.indexOf("\t") + 1) > "il.~") break;
    }
  }
  const older = graph !== CC_GRAPHS[0];
  const rows = [...domains].map((d) => ({ domain: d, source: "enr:cc_domains", priority: (d.endsWith(".co.il") ? 100 : 120) + (older ? 20 : 0) }));
  const { count: before } = await sb.from("nr_site_queue").select("domain", { count: "exact", head: true });
  for (let i = 0; i < rows.length; i += 2000) {
    const { error } = await sb.from("nr_site_queue").upsert(rows.slice(i, i + 2000), { onConflict: "domain", ignoreDuplicates: true });
    if (error) throw new Error("nr_site_queue: " + error.message);
  }
  const { count: after } = await sb.from("nr_site_queue").select("domain", { count: "exact", head: true });
  const added = (after || 0) - (before || 0);
  const harvested = [...new Set([...done, graph])];
  await sb.from("nr_sources").update({ status: "completed", total_records: (src.total_records || 0) + added, records_read: src.records_read + rows.length, last_run_at: now(), finished_at: now(),
    duration_ms: Number(src.duration_ms) + Date.now() - t0, businesses_new: 0,
    config: { ...src.config, harvested, [`part_${graph}`]: idx, harvested_at: now(), domains: (src.config.domains as number || 0) + added },
    status_reason: `נקראו ${harvested.length} גרפים (${harvested.join(", ")}); ${((src.total_records || 0) + added).toLocaleString("en")} שמות מתחם ישראליים ייחודיים בתור. גרף חדש נקרא אוטומטית כשהתור מתקצר` }).eq("key", "enr:cc_domains");
  await event(sb, "info", `Common Crawl ${graph}: ${rows.length.toLocaleString("en")} אתרים ישראליים, מתוכם ${added.toLocaleString("en")} חדשים לתור`, "enr:cc_domains");
  return { graph, part: idx, domains: rows.length, added, ms: Date.now() - t0 };
}

// Israeli business domains linked from a page (registrable form, own domain excluded) – the self-feeding source
function ilDomains(html: string, own: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']https?:\/\/([a-z0-9.-]+\.(?:co|org|net)\.il)(?:[:/"'?#]|$)/gi)) {
    const p = m[1].toLowerCase().split(".");
    const d = p.slice(-3).join(".");
    if (d !== own && /^[a-z0-9-]{2,63}\.(co|org|net)\.il$/.test(d)) out.add(d);
    if (out.size >= 40) break;
  }
  return [...out];
}
async function feedDomains(sb: SupabaseClient, domains: string[], via: string): Promise<number> {
  const uniq = [...new Set(domains)];
  if (!uniq.length) return 0;
  const { data, error } = await sb.from("nr_site_queue").upsert(uniq.map((d) => ({ domain: d, source: via, priority: 90 })), { onConflict: "domain", ignoreDuplicates: true }).select("domain");
  if (error) { console.error("feedDomains", error.message); return 0; }
  return (data || []).length;
}

// ════════════════ 7. identify an Israeli site against the registry; add a new business only with a clear identity ════════════════
const COPYRIGHT = /(?:©|&copy;|כל הזכויות שמורות(?:\s*ל-?)?|all rights reserved(?:\s*to)?|copyright)\s*(?:\d{4}\s*[-–]?\s*(?:\d{4})?)?\s*[:|\-–]?\s*([^\n|©<]{2,60})/i;
const GENERIC_NAME = /^(share by|share|שתף|דף הבית|ראשי|home|homepage|welcome|ברוכים הבאים|אתר|website|כל הזכויות שמורות|all rights reserved|בניית אתרים|תקנון|צור קשר|אודות)$/i;
function cleanName(n: string, domain: string): string {
  let s = clean(decode(n)).replace(/\s*(כל הזכויות שמורות|all rights reserved).*$/i, "").replace(/\b(19|20)\d{2}\b/g, "").replace(/[|•·–\-:,.]+\s*$/, "").replace(/^\s*[|•·–\-:,.]+/, "").trim();
  // "1868 - מסעדה בשרית כשרה בירושלים" → "1868": a slogan after the separator is not part of the name
  const seg = s.split(/\s+[-–|]\s+/)[0].trim();
  if (seg.length >= 2) s = seg;
  if (s.toLowerCase() === domain || /\.(co|org|net)\.il$|\.com$/i.test(s) || GENERIC_NAME.test(s) || s.length < 2 || s.length > 60) return "";
  if (/designed by|powered by|developed by|phpbb|wordpress|wix|elementor|בניית אתרים|עיצוב אתרים|קידום אתרים|template|theme/i.test(s)) return "";
  return s;
}
// up to 4 snippets around an address word, each within its line and at most 120 characters to each side.
// (A /[^\n]*word[^\n]*/ scan is quadratic on pages whose text is one long line: 10 s of CPU on an 80 KB line.)
function addressLines(text: string): string[] {
  const out: string[] = [];
  // whole words only: "רחוב" inside "רחובות" is the city Rehovot, not an address line
  for (const m of text.matchAll(/(?<![א-ת])(?:כתובת|רחוב|רח['׳]|ת\.ד|שד['׳]|שדרות)(?![א-ת])|address/gi)) {
    const i = m.index ?? 0;
    const s = Math.max(text.lastIndexOf("\n", i) + 1, i - 120);
    const e0 = text.indexOf("\n", i);
    const e = Math.min(e0 < 0 ? text.length : e0, i + m[0].length + 120);
    const snip = text.slice(s, e);
    if (!out.includes(snip)) out.push(snip);
    if (out.length >= 4) break;
  }
  return out;
}
type Identity = { links?: string[]; cityHint?: string; text?: string; name: string; nameFrom: string; phones: string[]; emails: string[]; ids: string[]; city: string; address: string; socials: Record<string, string>; origin: string; url: string; html: string };
async function readIdentity(domain: string): Promise<{ status: string; note?: string; id?: Identity }> {
  let page: Awaited<ReturnType<typeof get>> | null = null, note = "";
  for (const u of [`https://${domain}/`, `https://www.${domain}/`, `http://www.${domain}/`]) {
    try {
      if (!(await allowed(u))) return { status: "robots", note: "robots.txt" };
      const r = await get(u, 5_000); if (r.status === 200 && /html/i.test(r.type) && r.body.length > 300) { page = r; break; } note = "HTTP " + r.status;
    } catch (e) {
      note = (e as Error).message.slice(0, 60);
      // a name that does not resolve or refuses connections: no point trying the other variants
      if (/dns|resolve|lookup|refused|ENOTFOUND|certificate/i.test(note) && u.startsWith("https://www.")) break;
    }
  }
  if (!page) return { status: "unreachable", note };
  const host = new URL(page.url).hostname.replace(/^www\./, "").toLowerCase();
  const label = (h: string) => h.replace(/\.(co|org|net|ac|gov|muni|k12)\.[a-z]{2}$|\.[a-z]{2,}$/, "").split(".").pop() || h;
  if (SOCIAL_HOST.test(host) || label(host) !== label(domain)) return { status: "not_business", note: "מפנה לאתר אחר: " + host };
  let html = page.body, text = textOf(html);
  if (PARKED.test(text.slice(0, 4000)) && text.length < 6000) return { status: "parked", note: "דומיין חונה / בבנייה" };
  const phones = new Set<string>(), mails = new Set<string>(), socials: Record<string, string> = {};
  let ldName = "", city = "", address = "";
  const collect = (h: string, t: string) => {
    for (const m of h.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
      const x = decode(m[1]);
      if (/^tel:/i.test(x)) { const p = normPhone(decodeURIComponent(x.slice(4))); if (p) phones.add(p); }
      else if (/^mailto:/i.test(x)) mails.add(decodeURIComponent(x.slice(7).split("?")[0]).trim().toLowerCase());
      else socialsFrom([x], socials);
    }
    for (const m of t.match(PHONE_TXT) || []) { const p = normPhone(m); if (p) phones.add(p); }
    for (const m of t.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []) mails.add(m.toLowerCase());
    for (const o of jsonLd(h)) if (typeIs(o, /Organization|LocalBusiness|Corporation|Store|Restaurant|Service|Company/)) {
      if (!ldName && o.name) ldName = clean(o.name);
      for (const tp of [].concat((o.telephone as never) || [])) { const p = normPhone(String(tp)); if (p) phones.add(p); }
      const ad = o.address as Obj | undefined;
      if (ad && typeof ad === "object") { city = city || clean(ad.addressLocality); address = address || clean(ad.streetAddress); }
    }
  };
  collect(html, text);
  let ids = regIdsOn(text);
  if (!ids.length || !phones.size) {
    const l = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)]
      .find((m) => /contact|צור[-_ %20]*קשר|יצירת[-_ %20]*קשר|אודות|about/i.test(decode(m[1]) + " " + textOf(m[2])));
    if (l) {
      try {
        const pu = new URL(decode(l[1]), page.url);
        if (label(pu.hostname.replace(/^www\./, "")) === label(domain) && await allowed(pu.href)) {
          const p2 = await get(pu.href, 6_000);
          if (p2.status === 200 && /html/i.test(p2.type)) { const t2 = textOf(p2.body); collect(p2.body, t2); html += "\n" + p2.body; text += "\n" + t2; ids = regIdsOn(text); }
        }
      } catch { /* contact page not reachable */ }
    }
  }
  if (!address) {
    const m = text.match(/(?:כתובת|כתובתנו|משרדינו|address)\s*[:：]?\s*([^\n]{6,80})/i);
    // "כתובת מייל" / "כתובת למשלוח" is a label, not the business address
    if (m && !/^\s*[-:*]?\s*(מייל|אימייל|דוא|e-?mail|למשלוח|לשליחת|המייל)/i.test(m[1])) address = clean(m[1]);
  }
  if (!city && address.includes(",")) city = clean(address.split(",").pop() || "").replace(/\d+/g, "").replace(/[.]+$/, "").trim();
  const og = (html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i) || [])[1] || "";
  const cr = (text.match(COPYRIGHT) || [])[1] || "";
  const tt = cleanName(decode((html.match(/<title[^>]*>([^<]*)/i) || [])[1] || ""), domain);
  const body = text.replace(/\s+/g, " ");
  const titleName = tt && body.split(tt).length - 1 >= 2 ? tt : "";
  const cands: [string, string][] = [[ldName, "json-ld"], [og, "og:site_name"], [cr, "©"], [titleName, "title"]];
  let name = "", nameFrom = "";
  for (const [n, f] of cands) { const c = cleanName(n, domain); if (c) { name = c; nameFrom = f; break; } }
  const em = [...mails].filter((m) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(m) && !/\.(png|jpe?g|gif|webp|svg)$/.test(m) && (m.endsWith("@" + domain) || m.endsWith("." + domain) || FREE_MAIL.test(m)) && !/sentry|wixpress|example\.|domain\./.test(m)).slice(0, 5);
  // city hints only from address lines – a footer list of served areas or a person's name is not the business's city
  const cityHint = [address, ...addressLines(text)].join("\n");
  return { status: "ok", id: { name, nameFrom, phones: [...phones].slice(0, 8), emails: em, ids, city, address, socials, origin: new URL(page.url).origin, url: page.url, html: "", text, cityHint, links: ilDomains(html, domain) } };
}
type Lookup = { domain: number | null; reg: { id: number; reg_id: string; name: string; website: string | null }[]; phones: { id: number; value: string }[]; emails: { id: number; value: string }[] };
const LINKS_FOUND: string[] = [];
async function identifyOne(sb: SupabaseClient, domain: string): Promise<{ status: string; business_id?: number; method?: string; note?: string }> {
  const r = await readIdentity(domain);
  if (r.status !== "ok" || !r.id) return { status: r.status, note: r.note };
  const id = r.id;
  if (id.links) LINKS_FOUND.push(...id.links);
  const lk = await rpc<Lookup>(sb, "nr_identify_lookup", { p_domain: domain, p_phones: id.phones, p_emails: id.emails, p_reg_ids: id.ids });
  if (lk.domain) return { status: "known", business_id: lk.domain, note: "האתר כבר משויך לעסק במאגר" };
  const attach = async (bid: number, method: string, proof: string[]) => {
    await rpc(sb, "nr_ingest", { p_source: "enr:site_identify", p_rows: [{ business_id: bid, name: id.name || domain, rid: domain, url: id.url, websites: [id.origin],
      phones: id.phones.map((p) => ({ v: p, d: fmtPhone(p), sub: p.startsWith("05") ? "mobile" : "main" })), emails: id.emails.map((v) => ({ v })), socials: id.socials,
      fields: { identified_by: method, proof, name_on_site: id.name || null, name_from: id.nameFrom || null } }] });
    await rpc(sb, "nr_confirm_site", { p_business: bid, p_url: id.origin, p_evidence: proof });
    return { status: "matched", business_id: bid, method, note: proof.join(", ") };
  };
  const low = (id.text || "").toLowerCase();
  const nameHit = (n: string) => nameTokens(n).filter((w) => w.length >= 4).some((w) => low.includes(w.toLowerCase()));
  // the registry and the district map use Hebrew locality names: an English city from the site's structured data is replaced when the page names one
  if (/^[A-Za-z]/.test(id.city) && id.cityHint) { const cs = await rpc<string[] | null>(sb, "nr_cities_in_text", { p_text: id.cityHint }); if (cs && cs.length === 1) id.city = cs[0]; }
  // still English: the official Hebrew name when it is a known locality, otherwise not a city ("Israel", a slogan)
  if (/^[A-Za-z]/.test(id.city)) id.city = (await rpc<string | null>(sb, "nr_city_from_en", { p_city: id.city })) || "";
  if (!id.city && id.address) { const c = await rpc<string | null>(sb, "nr_city_in_text", { p_text: id.address }); if (c) id.city = c; }
  if (!id.city && id.cityHint) { const cs = await rpc<string[] | null>(sb, "nr_cities_in_text", { p_text: id.cityHint }); if (cs && cs.length === 1) id.city = cs[0]; }
  // 1. company number printed on the site
  if (id.ids.length === 1) {
    const hit = lk.reg.find((x) => x.reg_id === id.ids[0]);
    if (hit) return attach(hit.id, "reg_id_on_site", [`ח.פ. ${id.ids[0]} מופיע באתר`]);
  }
  // 2. an e-mail of exactly one registry business appears on its site
  const emIds = [...new Set(lk.emails.map((x) => x.id))];
  if (emIds.length === 1) return attach(emIds[0], "email", [`האימייל ${lk.emails[0].value} של העסק מופיע באתר`]);
  // 3. a phone of exactly one registry business – plus its name on the page
  const phIds = [...new Set(lk.phones.map((x) => x.id))];
  if (phIds.length === 1) {
    const { data: b } = await sb.from("nr_businesses").select("id,name").eq("id", phIds[0]).single();
    if (b && nameHit(b.name)) return attach(b.id, "phone+name", [`הטלפון ${fmtPhone(lk.phones[0].value)} ושם העסק מופיעים באתר`]);
    await rpc(sb, "nr_identify_review", { p_domain: domain, p_name: id.name || null, p_city: id.city || null, p_candidates: phIds, p_reason: "phone_only", p_detail: { phones: id.phones } });
    return { status: "review", note: "טלפון של עסק במאגר, בלי שם העסק באתר – לבדיקה" };
  }
  if (phIds.length > 1) {
    await rpc(sb, "nr_identify_review", { p_domain: domain, p_name: id.name || null, p_city: id.city || null, p_candidates: phIds.slice(0, 5), p_reason: "phone_shared", p_detail: { phones: id.phones } });
    return { status: "review", note: "הטלפון משותף לכמה עסקים – לבדיקה" };
  }
  // 4. the stated name is exactly one registered company
  let similar: number[] = [];
  if (id.name) {
    const nm = await rpc<{ status: string; id?: number; method?: string; candidates?: number[]; similar?: number[] }>(sb, "nr_identify_name", { p_name: id.name, p_city: id.city || null });
    if (nm.status === "matched" && nm.id && (nm.method === "registered_name" || nm.method === "name+city")) return attach(Number(nm.id), "registered_name", [`שם העסק "${id.name}" (${id.nameFrom}) זהה לשם הרשום`]);
    similar = (nm.similar || []).concat(nm.status === "pending_review" ? (nm.candidates || []) : []).map(Number);
  }
  // 5. a company number on the site that is not in the registry, with the legal name beside it
  if (id.ids.length === 1 && !lk.reg.length) {
    const flat = (id.text || "").replace(/\s+/g, " "); const at = flat.indexOf(id.ids[0].slice(0, 3));
    const legal = clean(((at > 0 ? flat.slice(Math.max(0, at - 90), at) : "").match(LEGAL_NAME) || [])[1] || "").replace(/^.*?(©|כל הזכויות שמורות( ל-?)?|all rights reserved( to)?|copyright)\s*/i, "");
    if (legal.length >= 3) {
      await rpc(sb, "nr_ingest", { p_source: "enr:site_identify", p_rows: [{ reg_id: id.ids[0], reg_type: id.ids[0].startsWith("58") ? "amuta" : "company", name: legal, city: id.city || undefined,
        address: id.address || undefined, rid: domain, url: id.url, websites: [id.origin], create: true,
        phones: id.phones.map((p) => ({ v: p, d: fmtPhone(p), sub: p.startsWith("05") ? "mobile" : "main" })), emails: id.emails.map((v) => ({ v })), socials: id.socials,
        fields: { identified_by: "new_reg_id_on_site", reg_id_on_site: id.ids[0], name_on_site: legal } }] });
      const [nb] = await rpc<{ id: number }[]>(sb, "nr_business_by_reg", { p_reg: id.ids[0] });
      return { status: "created", business_id: nb?.id, method: "new_reg_id_on_site", note: `${legal} (ח.פ. ${id.ids[0]})` };
    }
  }
  // 6. a business with no public registry number: a clear identity and nothing similar in the registry
  if (similar.length) {
    await rpc(sb, "nr_identify_review", { p_domain: domain, p_name: id.name, p_city: id.city || null, p_candidates: similar.slice(0, 5), p_reason: "similar_name", p_detail: { phones: id.phones, name_from: id.nameFrom } });
    return { status: "review", note: "שם דומה לעסק קיים – לבדיקה" };
  }
  // a new business needs a real locality (official list) or a structured English address on its own site
  if (id.city && /["{}<>=;]|specs|\.|^.{0,1}$/.test(id.city)) id.city = "";
  // keep the official locality name, never the raw address text ("חיפה בWaze)" → "חיפה"); two localities = unclear
  if (id.city && !/^[A-Za-z]/.test(id.city)) { const ok = await rpc<string[]>(sb, "nr_cities_in_text", { p_text: id.city }); id.city = ok && ok.length === 1 ? ok[0] : ""; }
  if (id.name && id.phones.length && (id.city || id.ids.length) && nameHit(id.name)) {
    await rpc(sb, "nr_ingest", { p_source: "enr:site_identify", p_rows: [{ name: id.name, city: id.city || undefined, address: id.address || undefined, rid: domain, url: id.url,
      websites: [id.origin], create: true, phones: id.phones.map((p) => ({ v: p, d: fmtPhone(p), sub: p.startsWith("05") ? "mobile" : "main" })),
      emails: id.emails.map((v) => ({ v })), socials: id.socials,
      fields: { identified_by: "site_identity", name_from: id.nameFrom, phones: id.phones.map(fmtPhone), city: id.city || null, address: id.address || null } }] });
    const bid = await rpc<number | null>(sb, "nr_business_by_domain", { p_domain: domain });
    return { status: "created", business_id: bid || undefined, method: "site_identity", note: `${id.name} – ${id.city || id.address}` };
  }
  return { status: "no_identity", note: !id.name ? "לא נמצא שם עסק מוצהר באתר" : !id.phones.length ? "לא נמצא טלפון ישראלי באתר" : "חסרים עיר / כתובת" };
}
async function identifyWorker(sb: SupabaseClient, worker: number) {
  const t0 = Date.now();
  const { data: locked } = await sb.rpc("nr_identify_lock", { p_worker: worker, p_seconds: 60 }); // a call killed by the platform cannot unlock: expire soon
  PAGE_CAP = 200_000; // keeps each call within the function's compute allowance (546 WORKER_RESOURCE_LIMIT otherwise)
  if (!locked) return { skipped: "locked or worker not enabled" };
  const tally: Record<string, number> = {};
  let read = 0;
  try {
    const { data: ctl } = await sb.from("nr_control").select("identify_batch").eq("id", 1).single();
    const batchSize = Math.max(2, Math.min(64, Number(ctl?.identify_batch || 4)));
    const one = async (q: { domain: string; attempts: number }) => {
      let res: { status: string; business_id?: number; method?: string; note?: string };
      try { res = await identifyOne(sb, q.domain); } catch (e) { res = { status: q.attempts >= 3 ? "error" : "queued", note: (e as Error).message.slice(0, 120) }; }
      tally[res.status] = (tally[res.status] || 0) + 1;
      await sb.from("nr_site_queue").update({ status: res.status, business_id: res.business_id ?? null, method: res.method ?? null, note: res.note ?? null, checked_at: now() }).eq("domain", q.domain);
    };
    // a site that was in flight when an earlier call was cut off is read first and alone: if its page is the heavy one,
    // only it is charged, and the fresh sites below are not cut off with it
    const suspect = await rpc<{ domain: string; attempts: number }[]>(sb, "nr_claim_site_suspect", {});
    for (const q of suspect) { await one(q); read++; tally.isolated = (tally.isolated || 0) + 1; }
    // read sites for a time budget (cron starts each worker every minute); batchSize is the upper bound per call
    while (Date.now() - t0 < 40_000 && read < batchSize) {
      const batch = await rpc<{ domain: string; attempts: number }[]>(sb, "nr_claim_site_queue", { p_limit: Math.min(8, batchSize - read) });
      if (!batch.length) break;
      await pool(batch, 8, one);
      read += batch.length;
      if (read >= batchSize) break;
    }
    // Israeli sites linked from the sites just read join the queue (duplicates ignored)
    const seen = LINKS_FOUND.splice(0);
    tally.links_seen = new Set(seen).size;
    tally.links_new = await feedDomains(sb, seen, "enr:link_discovery").catch(() => 0);
    const src = await source(sb, "enr:site_identify");
    if (src && read) {
      const created = tally.created || 0, matched = tally.matched || 0;
      await sb.from("nr_sources").update({ records_read: src.records_read + read, businesses_enriched: src.businesses_enriched + matched,
        businesses_new: Number((src as unknown as { businesses_new: number }).businesses_new || 0) + created, details_added: src.details_added + matched + created,
        last_run_at: now(), updated_at: now(), status: "collecting", duration_ms: Number(src.duration_ms) + (Date.now() - t0) }).eq("key", src.key);
      await sb.from("nr_runs").insert({ source_key: "enr:site_identify", started_at: new Date(t0).toISOString(), finished_at: now(), records_read: read,
        businesses_new: created, businesses_enriched: matched, details_added: matched + created, duration_ms: Date.now() - t0, ok: true, error: JSON.stringify(tally).slice(0, 300) });
    }
    return { worker, read, tally, ms: Date.now() - t0 };
  } finally {
    await sb.rpc("nr_identify_unlock", { p_worker: worker });
  }
}

// hourly: when the site queue runs low, read the next Common Crawl graph; unreachable sites get another chance after 30 days
async function feeder(sb: SupabaseClient) {
  const { count: queued } = await sb.from("nr_site_queue").select("domain", { count: "exact", head: true }).eq("status", "queued");
  const out: Record<string, unknown> = { queued };
  if ((queued || 0) < 5000) out.harvest = await harvestCc(sb);
  const { data: rq } = await sb.rpc("nr_requeue_unreachable", { p_days: 30, p_limit: 5000 });
  out.requeued_unreachable = rq;
  return out;
}

// ════════════════ Dalia lead stream: registry companies with fleet signals → the 7 rules → prospect_leads ════════════════
// Collection is not affected; only companies the rules grade A / B with an estimated fleet of 5+ become leads.
type Cand = Record<string, unknown> & { registry_id: number; company_name: string; company_hp: string; people?: { name: string; role: string; cat?: string; phone?: string; email?: string; source?: string; url?: string }[];
  fleet_evidence?: { lvl: string; kind: string; t: string; src?: string; url?: string }[]; ind_codes?: string[]; socials?: Record<string, string>; all_phones?: unknown[]; all_emails?: unknown[] };
const CARD_URL = "https://orin1607-ctrl.github.io/future-craft-core/openprospector.html?tab=national&biz=";
async function leadsStep(sb: SupabaseClient) {
  const t0 = Date.now();
  const Q = (globalThis as unknown as { OPQualify?: { evaluate: (r: Obj) => Obj } }).OPQualify;
  if (!Q) return { error: "rules module not loaded" };
  const cands = await rpc<Cand[]>(sb, "nr_lead_candidates", { p_limit: 150 });
  const { data: tax } = await sb.from("nr_industries").select("code,sub_label,main_label");
  const label = Object.fromEntries((tax || []).map((t: { code: string; sub_label: string; main_label: string }) => [t.code, t]));
  const today = new Date().toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
  const leads: Obj[] = [], results: Obj[] = [];
  for (const c of cands) {
    const ppl = c.people || [];
    const best = ppl.find((p) => p.cat === "fleet") || ppl.find((p) => p.cat === "ops") || ppl.find((p) => p.cat === "owner");
    const row: Obj = { ...c, contact_name: best ? best.name : "", contact_role: best ? best.role : "", contact_phone: best?.phone || "", contact_email: best?.email || "" };
    let q: Obj;
    try { q = Q.evaluate(row); } catch (e) { results.push({ id: c.registry_id, grade: null, result: "שגיאה בהערכה: " + (e as Error).message.slice(0, 80) }); continue; }
    const fl = (q.fleet_estimate_v2 || {}) as Obj;
    const fleetN = Number(fl.fleet_count || 0);
    const grade = q.lead_grade as string | null;
    if (!grade || fleetN < 5) {
      results.push({ id: c.registry_id, grade: null, result: !grade ? String(q.lead_grade_label || "לא עומד ב-7 החוקים") : "צי משוער מתחת ל-5 רכבים" });
      continue;
    }
    results.push({ id: c.registry_id, grade, result: String(q.lead_grade_label) });
    const ind = (c.ind_codes || []).filter((k) => label[k]).map((k) => `${label[k].main_label} – ${label[k].sub_label}`);
    const ev = (c.fleet_evidence || []).slice(0, 5);
    const fleetMgr = ppl.find((p) => p.cat === "fleet");
    const why = [
      `${q.lead_grade_label}.`,
      `צי: ${fl.fleet_size_display || "—"} (${fl.fleet_method_label || ""}).`,
      ev.length ? "ראיות: " + ev.map((x) => `${x.kind === "fact" ? "עובדה" : "אינדיקציה"} – ${x.t}${x.src ? ` [${x.src}]` : ""}`).join(" · ") : "",
      q.why_not_green ? String(q.why_not_green) : "",
    ].filter(Boolean).join(" ");
    const phone = String(c.phone || c.mobile_phone || "");
    leads.push({
      registry_id: c.registry_id, company_name: c.company_name, company_hp: c.company_hp,
      industry: ind.join("; ") || String(c.industry_name || ""), city: c.city, region: c.region, address: c.address, website: c.website,
      phone, phone_secondary: c.phone && c.mobile_phone ? c.mobile_phone : null, email: c.email || "",
      company_size: c.employee_count ? `${c.employee_count} עובדים` : "", score: Number(q.business_potential_score || 0), found_date: today,
      contact_name: row.contact_name || null, contact_role: row.contact_role || null, contact_phone: row.contact_phone || null, contact_email: row.contact_email || null,
      fleet_exists: c.fleet_exists ?? null, fleet_size: c.fleet_size ?? null, fleet_size_status: q.fleet_size_status, fleet_types: c.fleet_types ?? null,
      fleet_evidence: c.fleet_evidence, fleet_manager_name: fleetMgr ? fleetMgr.name : null, fleet_manager_source: fleetMgr ? (fleetMgr.url || fleetMgr.source || null) : null,
      fleet_info: { level: c.fleet_level, min: c.fleet_min, estimate: fl.fleet_size_display, method: fl.fleet_method_label },
      lead_reason: why.slice(0, 1500),
      facts: { fleet_level: c.fleet_level, industries: ind, evaluated_at: new Date().toISOString() },
      evidence: ev.map((x) => ({ field: "fleet", value: x.t, source: x.src || "", url: x.url || "", status: x.kind === "fact" ? "verified" : "partial" })),
      people: ppl, multi_phones: c.all_phones || [], multi_mails: c.all_emails || [],
      company_active_status: c.company_active_status, linkedin_company: c.socials?.linkedin || null, public_whatsapp: (c.whatsapp as string) || c.socials?.whatsapp || null,
      verification_status: q.verification_status, missing_fields: q.missing_fields, source_list: c.source_list, field_status: q.field_status,
      registry_check: c.registry_check, tier: q.tier, lead_stage: q.lead_stage, lead_quality: q.lead_quality, ready_for_contact: q.ready_for_contact, rejected_reason: null,
      raw_payload: { origin: "national_registry_stream", registry_id: c.registry_id, card_url: CARD_URL + c.registry_id, fleet_estimate: fl, why: q.why_not_green,
        lead_grade_label: q.lead_grade_label, socials: c.socials || {}, ind_codes: c.ind_codes || [], evaluated_at: new Date().toISOString() },
    });
  }
  const stored = await rpc<{ inserted: number }>(sb, "nr_lead_store", { p_leads: leads, p_results: results });
  return { evaluated: cands.length, qualified: leads.length, inserted: stored.inserted, ms: Date.now() - t0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: edgeCorsHeaders });
  const url = Deno.env.get("SUPABASE_URL") || "";
  if (!url.includes(STAGING_REF)) return jsonResponse({ ok: false, error: "staging only" }, 403);
  const auth = await requireAuth(req, { roles: ["super_admin", "fleet_manager"], allowInternal: true });
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({})) as { action?: string; url?: string; worker?: number };
  const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  // heartbeat per engine (read by the watchdog: an engine with work and no success for 15 minutes raises an alert)
  const ENGINE: Record<string, string> = { tick: "enrich", identify: "identify", feeder: "identify", leads: "leads", deep: "deep" };
  const action = body.action || "tick";
  const beat = (ok: boolean, msg?: string) => ENGINE[action] ? sb.rpc("nr_beat", { p_engine: ENGINE[action], p_ok: ok, p_msg: msg ?? null }).then(() => {}, () => {}) : Promise.resolve();
  try {
    const done = async (r: Record<string, unknown>) => { await beat(true); return jsonResponse({ ok: true, ...r }); };
    if (action === "tick") return await done(await tick(sb));
    if (action === "identify") return await done(await identifyWorker(sb, Math.max(1, Number(body.worker || 1))));
    if (action === "harvest_cc") return jsonResponse({ ok: true, ...(await harvestCc(sb, (body as { graph?: string }).graph)) });
    if (action === "feeder") return await done(await feeder(sb));
    if (action === "leads") return await done(await leadsStep(sb));
    // social / digital-presence locator for one company (card button) or a measured sample (internal only)
    const deps = { get: (u: string, ms?: number) => get(u, ms), allowed, siteConfirms };
    if (action === "social_locate") {
      const id = Number((body as { business_id?: number }).business_id);
      if (!id) return jsonResponse({ ok: false, error: "business_id required" }, 400);
      return jsonResponse({ ok: true, ...(await locateSocial(sb, deps, id, { mode: "button", userId: auth.ctx.isInternalCall ? null : auth.ctx.user?.id })) });
    }
    if (action === "social_sample") {
      if (!auth.ctx.isInternalCall) return jsonResponse({ ok: false, error: "internal only" }, 403);
      const { ids = [], tag = "sample" } = body as { ids?: number[]; tag?: string };
      const t0 = Date.now(), done: number[] = [], failed: Record<number, string> = {};
      for (const id of ids) {
        if (Date.now() - t0 > 100_000) break;
        try { await locateSocial(sb, deps, Number(id), { mode: "sample", tag }); done.push(Number(id)); }
        catch (e) {
          failed[id] = (e as Error).message.slice(0, 200);
          await sb.from("nr_social_runs").insert({ business_id: Number(id), mode: "sample", tag, error: failed[id], ms: 0 }).then(() => {}, () => {});
        }
      }
      return jsonResponse({ ok: true, done: done.length, failed, left: ids.filter((i) => !done.includes(Number(i)) && !(i in failed)), ms: Date.now() - t0 });
    }
    // a second deep-crawl call on the alternate minute: identification now attaches ~700 sites an hour, more than one
    // 30-site slice per tick reads (claims are SKIP LOCKED, so both calls never read the same site)
    if (action === "deep") {
      const { data: ctl } = await sb.from("nr_control").select("enrich_running").eq("id", 1).single();
      if (!ctl?.enrich_running) return jsonResponse({ ok: true, skipped: "stopped" });
      const src = await source(sb, "enr:web_deep");
      if (!src) return jsonResponse({ ok: false, error: "no source" });
      return await done(await stepDeep(sb, src, Date.now() + 100_000) as Record<string, unknown>);
    }
    // diagnostics: parse one job page without writing anything
    if (action === "probe_job" && body.url) { const r = await get(body.url); return jsonResponse({ ok: true, status: r.status, job: parseJob(r.body, body.url), head: r.body.slice(0, 600) }); }
    return jsonResponse({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    await beat(false, (e as Error).message);
    await event(sb, "error", "nr-enrichment: " + (e as Error).message.slice(0, 300)).catch(() => {});
    return jsonResponse({ ok: false, error: (e as Error).message }, 500);
  }
});
