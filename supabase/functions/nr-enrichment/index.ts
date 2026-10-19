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

async function get(url: string, timeoutMs = 12_000, accept = "text/html"): Promise<{ status: number; url: string; type: string; body: string }> {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "he,en;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  const type = r.headers.get("content-type") || "";
  const body = /text|xml|json|html/i.test(type) || !type ? (await r.text()).slice(0, 1_500_000) : "";
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
type Biz = { name: string; name_en?: string | null; phones?: string[]; emails?: string[]; reg_id_type?: string | null };
function siteConfirms(b: Biz, html: string, host: string): string[] {
  const out: string[] = [];
  const digits = html.replace(/\D/g, ""), low = html.toLowerCase();
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
const SOCIAL_RX: [string, RegExp][] = [
  ["facebook", /^https?:\/\/(www\.|m\.|he-il\.)?facebook\.com\/(?!sharer|share|tr\b|plugins|dialog|login|policies|groups\/?$)[^"'?#\s]{2,}/i],
  ["instagram", /^https?:\/\/(www\.)?instagram\.com\/(?!p\/|explore|accounts)[\w.]{2,}/i],
  ["linkedin", /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/(company|school|showcase)\/[^"'?#\s]+/i],
  ["tiktok", /^https?:\/\/(www\.)?tiktok\.com\/@[\w.]+/i],
  ["youtube", /^https?:\/\/(www\.)?youtube\.com\/(channel\/|c\/|user\/|@)[^"'?#\s]+/i],
  ["twitter", /^https?:\/\/(www\.)?(twitter|x)\.com\/(?!intent|share|home)[\w]{2,}/i],
  ["whatsapp", /^https?:\/\/(wa\.me\/\d{9,15}|api\.whatsapp\.com\/send\/?\?phone=\d{9,15})/i],
];
const FREE_MAIL = /@(gmail|walla|hotmail|yahoo|outlook|012|netvision|bezeqint|zahav|smile|actcom|017)\./;
const PAGE_KIND: [string, RegExp][] = [
  ["careers", /career|\/jobs?\b|\/drushim|דרושים|משרות|קריירה|בואו לעבוד|join-us|joinus|%d7%93%d7%a8%d7%95%d7%a9%d7%99%d7%9d/i],
  ["about", /about|אודות|מי[-_ %20]*אנחנו|הצוות|הנהלה|team|management|leadership|%d7%90%d7%95%d7%93%d7%95%d7%aa/i],
  ["contact", /contact|צור[-_ %20]*קשר|יצירת[-_ %20]*קשר|%d7%a6%d7%95%d7%a8/i],
];
const ROLE = `(מנכ["״']?ל(?:ית)?|מנהל(?:ת)? כללי(?:ת)?|סמנכ["״']?ל(?:ית)? (?:תפעול|לוגיסטיקה|רכש)|מנהל(?:ת)? (?:תפעול|לוגיסטיקה|רכש|צי(?: ה)?רכב|תחבורה|הפצה|מחסן|אחזקה)|קצין(?:ת)? (?:בטיחות(?: בתעבורה)?|רכב)|בעלים|מייסד(?:ת)?(?: ומנכ["״']?ל)?|יו["״']?ר)`;
const NAME = `([א-ת][א-ת'"״׳-]{1,14}(?: [א-ת][א-ת'"״׳-]{1,14}){1,2})`;
const PLACE_WORD = /^(רכבת|ירושלים|תל|אביב|חיפה|באר|שבע|צפון|דרום|מרכז|פרויקט|פרויקטים|בניין|בניית|רחוב|כביש|עיריית|משרד|בית|גן|קניון|מגדל|שכונת|אזור|תעשייה|לקוח|לקוחות)$/;
const NOT_NAME = /^(החברה|חברת|של|את|עם|על|הוא|היא|אנחנו|שלנו|ו?ה?מנהל|מנהלת|ניסיון|שנים|בעל|הינו|הינה|כיום|מאז|בתחום|תפקיד|צוות|לקוחות|שירות|המשרד|הנהלת|מחלקת|כל|גם|רב|אשר|לפני|אחרי|יותר|פרטים|לפרטים|טלפון|נייד|דוא"ל|מייל)$/;
function people(text: string): { name: string; role: string }[] {
  const out: { name: string; role: string }[] = [];
  const add = (raw: string, role: string) => {
    const name = raw.replace(/^(מר|גב['׳]?|ד["״]ר|עו["״]ד|רו["״]ח|פרופ['׳]?|אינג['׳]?)\s+/, "");
    const words = name.split(" ");
    if (words.length < 2 || words.some((w) => NOT_NAME.test(w.replace(/^[וה]/, "")) || PLACE_WORD.test(w))) return;
    if (!out.some((p) => p.name === name)) out.push({ name, role: role.replace(/["״']/g, '"') });
  };
  // only "role: name" / "name – role" / "name, role" on ONE line with an explicit separator
  const roleFirst = new RegExp(`${ROLE}\\s*[:\\-–|]\\s*${NAME}\\s*$`);
  const nameFirst = new RegExp(`^\\s*${NAME}\\s*[,\\-–|]\\s*${ROLE}(?![א-ת])`);
  for (const line of text.split("\n")) {
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
const FLEET_N = /(?:צי של|מפעילה|ברשותנו|עם|כ-?|מעל)\s*(\d{2,4})\s*(משאיות|רכבי (?:שירות|חלוקה|הפצה|הובלה)|כלי רכב|רכבים|אוטובוסים|מוניות|טנדרים|מיניבוסים|גרר(?:ים)?)/;
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

async function crawlSite(b: { id: number; name: string; name_en?: string | null; reg_id_type?: string | null; website: string; phones: string[]; emails?: string[]; city: string | null }) {
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
  const ppl: { name: string; role: string }[] = [];
  const jobs: Obj[] = [];
  const findings: Obj[] = [];
  let org: Obj | null = null;
  for (const pg of pages) {
    const hrefs = [...pg.html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => decode(m[1]));
    for (const h of hrefs) {
      if (/^tel:/i.test(h)) addPhone(decodeURIComponent(h.slice(4)));
      else if (/^mailto:/i.test(h)) mails.add(decodeURIComponent(h.slice(7).split("?")[0]).trim().toLowerCase());
      else for (const [net, rx] of SOCIAL_RX) if (!socials[net] && rx.test(h)) socials[net] = h.split("#")[0];
    }
    if (pg.kind === "contact") for (const m of pg.text.match(PHONE_TXT) || []) addPhone(m);
    for (const m of pg.text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []) mails.add(m.toLowerCase());
    if (pg.kind === "contact" && !socials.contact_form && /<form[\s\S]*?(<input|<textarea)/i.test(pg.html)) socials.contact_form = pg.url;
    for (const o of jsonLd(pg.html)) {
      if (typeIs(o, /Organization|LocalBusiness|Corporation|Store|AutoRepair|MovingCompany/)) {
        org = org || o;
        for (const t of [].concat((o.telephone as never) || [])) addPhone(String(t));
        if (o.email) mails.add(String(o.email).replace(/^mailto:/, "").toLowerCase());
        for (const s of [].concat((o.sameAs as never) || [])) for (const [net, rx] of SOCIAL_RX) if (!socials[net] && rx.test(String(s))) socials[net] = String(s);
        for (const f of [].concat((o.founder as never) || [])) if (f && typeof f === "object" && (f as Obj).name) ppl.push({ name: clean((f as Obj).name), role: "מייסד/ת" });
      }
      if (typeIs(o, /JobPosting/)) {
        const hiringOrg = o.hiringOrganization as Obj | undefined;
        const loc = ((o.jobLocation as Obj)?.address as Obj)?.addressLocality;
        jobs.push({ business_id: b.id, url: String(o.url || pg.url + "#" + encodeURIComponent(clean(o.title).slice(0, 60))), title: clean(o.title), employer: clean(hiringOrg?.name || b.name),
          city: clean(loc), posted: clean(o.datePosted).slice(0, 10), status: o.validThrough && Date.parse(String(o.validThrough)) < Date.now() ? "closed" : "open", occupation: clean(o.occupationalCategory) });
      }
    }
    if (pg.kind === "about" || pg.kind === "home") for (const p of people(pg.text)) if (!ppl.some((x) => x.name === p.name)) ppl.push(p);
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
  const fn = allText.match(FLEET_N);
  const fl = fn ? snippet(allText, FLEET_N) : snippet(allText, FLEET);
  if (fl) findings.push({ business_id: b.id, category: "fleet", key: "site", fact_kind: fn ? "fact" : "indication", url: home.url, importance: "important",
    title: (fn ? `צי רכב: החברה מציינת באתרה ${fn[1]} ${fn[2]}` : "אינדיקציה לצי רכב באתר החברה") + ` – "${fl}"`, detail: { quote: fl, vehicles: fn ? Number(fn[1]) : null, type: fn ? fn[2] : null } });
  const emp = (pageOf("about")?.text || pageOf("home")?.text || "").match(EMPLOYEES);
  if (emp && Number(emp[1]) >= 5) findings.push({ business_id: b.id, category: "employees", key: "site", fact_kind: "fact", url: (pageOf("about") || pages[0]).url, importance: "normal",
    title: `החברה מציינת באתרה כ-${Number(emp[1]).toLocaleString("en")} עובדים`, detail: { employees: Number(emp[1]), quote: clean(emp[0]) } });
  const founded = org && clean(org.foundingDate).match(/(19|20)\d{2}/);
  return {
    row: { business_id: b.id, name: b.name, rid: base.origin + "#deep", url: home.url, phones, emails: em, socials, people: ppl.slice(0, 8), founded_year: founded ? founded[0] : undefined,
      fields: { site_confirmed_by: confirmed, pages: pages.map((p) => `${p.kind}: ${p.url}`), phones: phones.map((p) => p.d), emails: em.map((e) => e.v), socials: Object.keys(socials), people: ppl.map((p) => `${p.name} – ${p.role}`) } },
    jobs, findings,
  };
}
async function stepDeep(sb: SupabaseClient, src: Src, deadline: number) {
  const t0 = Date.now();
  let read = 0, enriched = 0, details = 0;
  try {
    while (Date.now() < deadline - 25_000) {
      const batch = await rpc<{ id: number; name: string; name_en: string | null; reg_id_type: string | null; website: string; phones: string[]; emails: string[]; city: string | null; shared_by: number }[]>(sb, "nr_claim_sites", { p_limit: 10 });
      if (!batch.length) break;
      const rows: Obj[] = [], jobs: Obj[] = [], finds: Obj[] = [];
      await pool(batch, 10, async (b) => {
        // a site listed for 3+ businesses (group / umbrella / brand site) says nothing specific about this one
        const r = (b.shared_by >= 3
          ? { row: { business_id: b.id, name: b.name, rid: b.website + "#deep", url: b.website, fields: { shared_site: `האתר רשום ל-${b.shared_by} עסקים – לא נלקח ממנו מידע לעסק בודד` } } }
          : await crawlSite(b)) as { row?: Obj; jobs?: Obj[]; findings?: Obj[] };
        if (r.row) rows.push(r.row);
        if (r.jobs) jobs.push(...r.jobs);
        if (r.findings) finds.push(...r.findings);
      });
      read += batch.length;
      if (rows.length) { const res = await rpc<{ enriched: number; details: number }>(sb, "nr_ingest", { p_source: src.key, p_rows: rows }); enriched += res.enriched; details += res.details; }
      if (jobs.length) await rpc(sb, "nr_ingest_jobs", { p_source: src.key, p_rows: jobs });
      if (finds.length) { const res = await rpc<{ matched: number }>(sb, "nr_ingest_findings", { p_source: src.key, p_rows: finds }); details += res.matched; }
    }
    const { count } = await sb.from("nr_businesses").select("id", { count: "exact", head: true }).not("website", "is", null).is("enr_site_checked_at", null);
    await account(sb, src, t0, { read, enriched, details, done: !count, reason: "כל אתרי העסקים הידועים נסרקו לעומק; אתר חדש שיתגלה ייסרק אוטומטית" });
    return { key: src.key, read, enriched, details, left: count };
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
    const { data: ctl } = await sb.from("nr_control").select("enrich_running").eq("id", 1).single();
    if (!ctl?.enrich_running) return { skipped: "stopped" };
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
    await run("enr:taasuka_jobs", (s) => stepJobs(sb, s, at(0.4)));
    await run("enr:web_discovery", (s) => stepDiscovery(sb, s, at(0.6)));
    await run("enr:web_deep", (s) => stepDeep(sb, s, at(1)));
    const rss = await source(sb, "enr:news_rss");
    if (rss && !["blocked", "unsupported"].includes(rss.status) && (!rss.last_run_at || Date.now() - Date.parse(rss.last_run_at) > 3 * 3600_000) && Date.now() < t0 + TICK_BUDGET_MS + 15_000) steps.push(await stepRss(sb, rss));
    await sb.rpc("nr_refresh_enrich_recent", { p_minutes: 4 });
    await sb.from("nr_control").update({ enrich_current: null }).eq("id", 1);
    return { steps, ms: Date.now() - t0 };
  } finally {
    await sb.rpc("nr_enrich_unlock");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: edgeCorsHeaders });
  const url = Deno.env.get("SUPABASE_URL") || "";
  if (!url.includes(STAGING_REF)) return jsonResponse({ ok: false, error: "staging only" }, 403);
  const auth = await requireAuth(req, { roles: ["super_admin", "fleet_manager"], allowInternal: true });
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({})) as { action?: string; url?: string };
  const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    const action = body.action || "tick";
    if (action === "tick") return jsonResponse({ ok: true, ...(await tick(sb)) });
    // diagnostics: parse one job page without writing anything
    if (action === "probe_job" && body.url) { const r = await get(body.url); return jsonResponse({ ok: true, status: r.status, job: parseJob(r.body, body.url), head: r.body.slice(0, 600) }); }
    return jsonResponse({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    await event(sb, "error", "nr-enrichment: " + (e as Error).message.slice(0, 300)).catch(() => {});
    return jsonResponse({ ok: false, error: (e as Error).message }, 500);
  }
});
