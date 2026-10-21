// Contact finder v2 — a multi-step investigation for the companies the owner selected (never the whole registry).
// Finds Facebook, Instagram, LinkedIn, website, general and role e-mails, phone, contact form and WhatsApp.
//
// Steps (each one logged per company, so "not found" always says what was checked):
//   A. what is already known: the card, the OpenProspector record (all contact points + people with roles)
//   B. the official website: card → registry → company e-mail domain → registry English name, confirmed only if
//      the site itself shows the company's phone, registration number or Hebrew name
//   C. the website: home + up to 3 pages (contact / about / team), robots.txt respected — social links, mailto and
//      published e-mails on the company domain, tel: links and phone numbers, contact form, WhatsApp
//   D. Wikidata official properties (by domain, or by exact name with corroboration)
//   E. licensed web search (Brave Search API, its own index) when a key is configured — several phrasings per
//      missing field, results cross-checked against name tokens, city, phone and domain; a daily quota protects
//      the free credit. Without a key this step is skipped and reported.
// Nothing is invented: every value comes from a source that is shown with its evidence.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Field = "facebook" | "instagram" | "linkedin" | "website" | "email" | "phone" | "contact_form" | "whatsapp";
export type Conf = "existing" | "high" | "medium" | "low" | "none";
export type Finding = { platform: Field; url: string | null; handle: string | null; confidence: Conf; source: string; evidence: string; detail?: any };
type Step = { step: string; ok: boolean; note: string };

const UA = "DaliaMarketingCenter/1.0 (business contact research for companies selected by the owner; staging)";
const FIELDS: Field[] = ["facebook", "instagram", "linkedin", "website", "email", "phone", "contact_form", "whatsapp"];
const CARD_FIELD: Record<Field, string> = { facebook: "facebook_url", instagram: "instagram_url", linkedin: "linkedin_url", website: "website", email: "email", phone: "phone", contact_form: "contact_form_url", whatsapp: "whatsapp" };
const FREE_MAIL = /@(gmail|walla|hotmail|yahoo|outlook|live|icloud|me|012|netvision|bezeqint|zahav|smile|actcom|017|013|msn|aol|nana10?)\./i;
const FB_RX = /https?:\/\/(?:www\.|m\.|he-il\.|he\.)?facebook\.com\/(?!sharer|share|tr\b|plugins|dialog|login|policies|groups\/|events\/|watch|hashtag|help|privacy|legal|ads\b|business\b|gaming|search)([^"'<>\s?#\\]{2,400})/gi; // Hebrew page names URL-encode to 6 characters a letter
const IG_RX = /https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel|reels\/|explore|accounts|stories|tv\/|about|developer|legal)([A-Za-z0-9._]{2,30})/gi;
const LI_RX = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(company|school|showcase)\/([^"'<>\s?#\\/]{2,100})/gi;
const WA_RX = /https?:\/\/(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=|web\.whatsapp\.com\/send\?phone=)(\+?\d{9,15})/gi;
const MAIL_RX = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]+\.[A-Za-z]{2,10}/g;
const PLATFORM_HANDLES = /^(wix|wixcom|wordpress|wordpressdotcom|elementor|godaddy|shopify|facebook|instagram|meta|fb|weebly|squarespace|webflow|yoast|google|youtube|whatsapp|login|home|pages|profile\.php|people|linkedin)$/i;
const ROLE_MAIL: [string, RegExp][] = [
  ["צי רכב / רכב", /fleet|rechev|rehev|car|vehicle|cars|רכב/i], ["תפעול / לוגיסטיקה", /ops|operation|tiful|logistic|lojistic|shiluach/i],
  ["רכש", /purchas|procure|rechesh|buying|supply/i], ["הנהלה", /ceo|manag|director|hanhala|mankal|gm\b/i],
  ["כספים", /finance|cfo|account|hashbon|billing/i], ["משרד / כללי", /^(info|office|contact|mail|hello|service|sales|support|admin|kesher|pniot|misrad)\b/i],
];
const PAGE_RX = /href=["']([^"'#]*(contact|צור-קשר|צרו-קשר|יצירת-קשר|%d7%a6%d7%95%d7%a8|%d7%a6%d7%a8%d7%95|about|אודות|%d7%90%d7%95%d7%93%d7%95%d7%aa|team|הצוות|הנהלה|%d7%94%d7%a0%d7%94%d7%9c%d7%94|management|staff)[^"'#]*)["']/gi;

const hostOf = (u?: string | null) => { try { return new URL(/^https?:/i.test(u || "") ? u! : "https://" + u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const digits = (s: string) => String(s || "").replace(/\D/g, "");
function ilPhone(raw: string) {
  let d = digits(raw);
  if (d.startsWith("972")) d = "0" + d.slice(3);
  if (/^1(700|800|599)\d{6}$/.test(d)) return d;
  return /^0(5\d{8}|7\d{8}|[23489]\d{7})$/.test(d) ? d : "";
}
const fmtPhone = (p: string) => /^1\d{9}$/.test(p) ? `${p[0]}-${p.slice(1, 4)}-${p.slice(4, 7)}-${p.slice(7)}` : /^0(5|7)/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : `${p.slice(0, 2)}-${p.slice(2)}`;

/* ---------- names ---------- */
const GENERIC = new Set(["חברה", "חברת", "בעמ", "בע\"מ", "בעמ.", "ישראל", "ltd", "inc", "llc", "group", "company", "co", "il", "the", "שירותי", "שירותים", "בע~מ", "ע\"ר", "ער"]);
export function nameVariants(name: string, nameEn?: string | null) {
  const base = String(name || "").replace(/~/g, '"').replace(/\(.*?\)/g, " ").replace(/\b(בע["״]?מ|בעמ|ע["״]?ר|ltd\.?|inc\.?)\b/gi, " ").replace(/בע"מ|בע״מ|בעמ/g, " ").replace(/\s+/g, " ").trim();
  const out = new Set<string>([base]);
  const noPrefix = base.replace(/^(חברת|קבוצת)\s+/, "").trim(); if (noPrefix.length > 1) out.add(noPrefix);
  const firstTwo = noPrefix.split(" ").slice(0, 2).join(" "); if (firstTwo.length > 2 && firstTwo !== noPrefix) out.add(firstTwo);
  if (nameEn) out.add(String(nameEn).replace(/\b(ltd\.?|limited|inc\.?|company)\b/gi, "").replace(/\s+/g, " ").trim());
  return [...out].filter((x) => x.length > 1);
}
const tokens = (s: string) => String(s || "").toLowerCase().replace(/["'״׳`~]/g, "").split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1 && !GENERIC.has(t));
function nameScore(variants: string[], text: string) {
  const hay = String(text || "").toLowerCase().replace(/["'״׳`~]/g, "");
  let best = 0;
  for (const v of variants) {
    const t = tokens(v); if (!t.length) continue;
    best = Math.max(best, t.filter((x) => hay.includes(x)).length / t.length);
  }
  return best;
}

/* ---------- link cleaning ---------- */
function cleanFb(raw: string) {
  let h0 = raw;
  try { h0 = decodeURIComponent(raw); } catch { /* keep raw */ }
  h0 = h0.replace(/\/+$/, "");
  // new-style page address: facebook.com/p/Name-100064123456789 → the numeric page id
  const pm = h0.match(/^p\/[^/]*?(\d{10,})$/i);
  if (pm) return { handle: pm[1], url: `https://www.facebook.com/${pm[1]}` };
  if (raw.length >= 400) return null; // cut off by the pattern limit: not a whole address
  const h = h0.split("/")[0];
  // markup or escaped JSON caught by the link pattern (&quot;]}…) is not a page name
  if (!/^profile\.php/i.test(h0) && !/^[\p{L}\p{N}._-]{2,100}$/u.test(h)) return null;
  if (/^pages$/i.test(h)) { const id = (h0.match(/\/(\d{10,})/) || [])[1]; return id ? { handle: id, url: `https://www.facebook.com/${id}` } : null; }
  if (/^profile\.php/i.test(h0)) { const id = (h0.match(/id=(\d{5,})/) || [])[1]; return id ? { handle: id, url: `https://www.facebook.com/profile.php?id=${id}` } : null; }
  if (PLATFORM_HANDLES.test(h) || /\.(php|html?|js|css|png|jpg)$/i.test(h) || /^www\.|\.(co\.il|org\.il|com|net|org|co|il)$/i.test(h)) return null;
  const tail = h.match(/-(\d{10,})$/);
  return { handle: (tail ? tail[1] : h).toLowerCase(), url: `https://www.facebook.com/${tail ? tail[1] : h}` };
}
function cleanIg(raw: string) { const h = raw.replace(/\/+$/, "").toLowerCase(); return PLATFORM_HANDLES.test(h) ? null : { handle: h, url: `https://www.instagram.com/${h}/` }; }
function cleanLi(kind: string, raw: string) { const h = decodeURIComponent(raw).toLowerCase(); return { handle: `${kind}/${h}`, url: `https://www.linkedin.com/${kind}/${h}/` }; }

/* ---------- web ---------- */
async function robotsAllows(origin: string, path: string, cache: Map<string, string[]>) {
  if (!cache.has(origin)) {
    let dis: string[] = [];
    try {
      const r = await fetch(origin + "/robots.txt", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        let applies = false;
        for (const line of (await r.text()).split(/\r?\n/)) {
          const i = line.indexOf(":"); if (i < 0) continue;
          const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
          if (k === "user-agent") applies = v === "*" || /dalia/i.test(v);
          else if (applies && k === "disallow" && v) dis.push(v);
        }
      }
    } catch { /* no robots → allowed */ }
    cache.set(origin, dis);
  }
  return !cache.get(origin)!.some((d) => path.startsWith(d));
}
async function fetchPage(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "he,en" }, redirect: "follow", signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  if (!/html|text/i.test(r.headers.get("content-type") || "")) throw new Error("לא דף HTML");
  return { html: (await r.text()).slice(0, 1_500_000), finalUrl: r.url };
}
const decodeEnt = (s: string) => s.replace(/\\\//g, "/").replace(/&amp;/g, "&").replace(/&#64;|&#x40;|\[at\]|\(at\)/gi, "@").replace(/&#46;|\[dot\]|\(dot\)/gi, ".");

type SiteFacts = { fb: Map<string, any>; ig: Map<string, any>; li: Map<string, any>; wa: Set<string>; emails: Map<string, { page: string; mailto: boolean }>; phones: Map<string, { page: string; tel: boolean }>; forms: string[]; pages: string[]; text: string };
function collect(html: string, page: string, f: SiteFacts, siteHost: string) {
  const t = decodeEnt(html);
  const bump = (m: Map<string, any>, c: any) => { if (!c) return; const e = m.get(c.handle) || { ...c, n: 0 }; e.n++; m.set(c.handle, e); };
  for (const m of t.matchAll(FB_RX)) bump(f.fb, cleanFb(m[1]));
  for (const m of t.matchAll(IG_RX)) bump(f.ig, cleanIg(m[1]));
  for (const m of t.matchAll(LI_RX)) bump(f.li, cleanLi(m[1].toLowerCase(), m[2]));
  for (const m of t.matchAll(WA_RX)) { const p = ilPhone(m[1]); if (p) f.wa.add(p); }
  // stop at & and \ too: inside escaped JSON a mailto runs on into &quot;&gt;… (office@x.co.il\"&gt;office@…)
  const mailtos = new Set([...t.matchAll(/mailto:([^"'?<>\s&\\]+)/gi)].map((m) => { try { return decodeURIComponent(m[1]).toLowerCase(); } catch { return m[1].toLowerCase(); } })
    .filter((em) => /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(em)));
  const visible = t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  for (const em of new Set([...mailtos, ...(visible.match(MAIL_RX) || []).map((x) => x.toLowerCase())])) {
    if (/\.(png|jpe?g|gif|svg|webp)$/i.test(em) || /example|sentry|wixpress|domain\.com|email\.com|yourmail|@2x/i.test(em)) continue;
    const dom = em.split("@")[1];
    // keep e-mails on the company's own domain, or any address the site itself links with mailto
    if (!(dom === siteHost || dom.endsWith("." + siteHost) || mailtos.has(em))) continue;
    if (!f.emails.has(em)) f.emails.set(em, { page, mailto: mailtos.has(em) });
  }
  const tels = [...t.matchAll(/href=["']tel:([^"']+)["']/gi)].map((m) => ilPhone(m[1])).filter(Boolean);
  for (const p of tels) if (!f.phones.has(p)) f.phones.set(p, { page, tel: true });
  for (const m of visible.matchAll(/(?:\+972[-\s]?|0)(?:[23489]|5\d|7\d)[-\s]?\d{3}[-\s]?\d{4}|\*?\d{4}|1[-\s]?(?:700|800|599)[-\s]?\d{2,3}[-\s]?\d{3,4}/g)) {
    const p = ilPhone(m[0]); if (p && !f.phones.has(p)) f.phones.set(p, { page, tel: false });
  }
  if (/<form[\s\S]{0,4000}?(type=["']email["']|<textarea|name=["'][^"']*(message|הודעה|email|phone)[^"']*["'])/i.test(t) && !f.forms.includes(page)) f.forms.push(page);
  f.text += " " + visible.slice(0, 200_000).toLowerCase();
}
/** Social / WhatsApp / e-mail links on one page — same reader as the site crawl (used by the OpenProspector locator
 *  for an archived copy of a company site). */
export function linksOnPage(html: string, pageUrl: string) {
  const f: SiteFacts = { fb: new Map(), ig: new Map(), li: new Map(), wa: new Set(), emails: new Map(), phones: new Map(), forms: [], pages: [], text: "" };
  collect(html, pageUrl, f, hostOf(pageUrl));
  const top = (m: Map<string, any>) => [...m.values()].sort((a, b) => b.n - a.n);
  return { facebook: top(f.fb), instagram: top(f.ig), linkedin: top(f.li), whatsapp: [...f.wa], emails: [...f.emails.keys()] };
}
async function crawlSite(host: string, steps: Step[]): Promise<{ facts: SiteFacts; host: string } | null> {
  const robots = new Map<string, string[]>();
  const facts: SiteFacts = { fb: new Map(), ig: new Map(), li: new Map(), wa: new Set(), emails: new Map(), phones: new Map(), forms: [], pages: [], text: "" };
  for (const origin of [`https://${host}`, `https://www.${host}`, `http://${host}`]) {
    try {
      if (!(await robotsAllows(origin, "/", robots))) { steps.push({ step: "אתר", ok: false, note: `${host} חוסם סריקה (robots.txt)` }); return null; }
      const home = await fetchPage(origin + "/");
      const siteHost = hostOf(home.finalUrl);
      collect(home.html, home.finalUrl, facts, siteHost); facts.pages.push(home.finalUrl);
      const links = [...home.html.matchAll(PAGE_RX)].map((m) => { try { return new URL(m[1], home.finalUrl).href; } catch { return ""; } })
        .filter((u) => u && hostOf(u) === siteHost && !facts.pages.includes(u));
      for (const u of [...new Set(links)].slice(0, 3)) {
        try {
          const uu = new URL(u);
          if (!(await robotsAllows(uu.origin, uu.pathname, robots))) continue;
          const pg = await fetchPage(u); collect(pg.html, pg.finalUrl, facts, siteHost); facts.pages.push(pg.finalUrl);
        } catch { /* optional page */ }
      }
      steps.push({ step: "אתר החברה", ok: true, note: `נבדקו ${facts.pages.length} עמודים ב-${siteHost}` });
      return { facts, host: siteHost };
    } catch (e) { if (origin.startsWith("http://")) steps.push({ step: "אתר", ok: false, note: `${host} לא נפתח (${(e as Error).message.slice(0, 60)})` }); }
  }
  return null;
}

/* ---------- Wikidata ---------- */
async function wikidata(host: string, names: string[]) {
  const sel = `?c ?web ?fb ?ig ?li`;
  const opt = `OPTIONAL{?c wdt:P856 ?web} OPTIONAL{?c wdt:P2013 ?fb} OPTIONAL{?c wdt:P2003 ?ig} OPTIONAL{?c wdt:P4264 ?li}`;
  const run = async (q: string) => {
    const r = await fetch("https://query.wikidata.org/sparql?query=" + encodeURIComponent(q), { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    const b = ((await r.json()) as any).results.bindings;
    return b.length ? Object.fromEntries(Object.entries(b[0]).map(([k, v]: any) => [k, v.value])) as Record<string, string> : null;
  };
  try {
    if (host) {
      const vals = [`https://${host}/`, `https://www.${host}/`, `http://${host}/`, `http://www.${host}/`, `https://${host}`, `https://www.${host}`].map((u) => `<${u}>`).join(" ");
      const hit = await run(`SELECT ${sel} WHERE { VALUES ?w { ${vals} } ?c wdt:P856 ?w . ${opt} } LIMIT 1`);
      if (hit) return { ...hit, by: "domain" };
    }
    for (const n of names.slice(0, 2)) {
      const lit = JSON.stringify(n);
      const hit = await run(`SELECT ${sel} WHERE { { ?c rdfs:label ${lit}@he } UNION { ?c rdfs:label ${lit}@en } ?c wdt:P17 wd:Q801 . ${opt} } LIMIT 2`);
      if (hit) return { ...hit, by: "name" };
    }
  } catch { /* optional */ }
  return null;
}

/* ---------- licensed search (Brave) ---------- */
export function searchConfigured() { return !!(Deno.env.get("BRAVE_SEARCH_API_KEY") || "").trim(); }
const DAILY_LIMIT = () => Number(Deno.env.get("SEARCH_DAILY_LIMIT") || 30);
const PER_COMPANY = () => Number(Deno.env.get("SEARCH_PER_COMPANY") || 6);
async function braveSearch(db: SupabaseClient, q: string) {
  const ok = (await db.rpc("search_usage_take", { p_provider: "brave", p_limit: DAILY_LIMIT(), p_n: 1 })).data;
  if (!ok) throw new Error("QUOTA");
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10&country=il&search_lang=he`, {
    headers: { Accept: "application/json", "X-Subscription-Token": Deno.env.get("BRAVE_SEARCH_API_KEY")! }, signal: AbortSignal.timeout(10000),
  });
  if (r.status === 429) throw new Error("RATE");
  if (!r.ok) throw new Error(`Brave HTTP ${r.status}`);
  const j = await r.json() as any;
  return ((j.web && j.web.results) || []).map((x: any) => ({ url: x.url as string, title: String(x.title || ""), snippet: String(x.description || "") + " " + (x.extra_snippets || []).join(" ") }));
}

/** Scores search results for one field. Exported so it can be tested against fixtures. */
export function scoreResults(field: Field, results: { url: string; title: string; snippet: string }[], ctx: { variants: string[]; city?: string | null; phones: string[]; host?: string }) {
  const out: { url: string; handle: string; conf: Conf; why: string; score: number }[] = [];
  for (const r of results) {
    let c: any = null;
    if (field === "facebook") { const m = [...r.url.matchAll(FB_RX)][0]; c = m && cleanFb(m[1]); }
    if (field === "instagram") { const m = [...r.url.matchAll(IG_RX)][0]; c = m && cleanIg(m[1]); }
    if (field === "linkedin") { const m = [...r.url.matchAll(LI_RX)][0]; c = m && cleanLi(m[1].toLowerCase(), m[2]); }
    if (!c || out.some((o) => o.handle === c.handle)) continue;
    const text = `${r.title} ${r.snippet} ${c.handle}`;
    const ns = nameScore(ctx.variants, text);
    const city = !!(ctx.city && text.includes(ctx.city));
    const phone = ctx.phones.some((p) => p && digits(text).includes(p.slice(1)));
    const domain = !!(ctx.host && text.toLowerCase().includes(ctx.host));
    let conf: Conf = "none", why = "";
    if (ns >= 0.7 && (phone || domain)) { conf = "high"; why = `השם תואם ו${phone ? "מספר הטלפון של החברה" : "דומיין האתר"} מופיע בתוצאה`; }
    else if (ns >= 0.7 && city) { conf = "medium"; why = "השם והעיר תואמים – לבדוק"; }
    else if (ns >= 0.6) { conf = "low"; why = "השם תואם חלקית בלבד – רק להצעה"; }
    if (conf !== "none") out.push({ url: c.url, handle: c.handle, conf, why, score: ns + (city ? .2 : 0) + (phone || domain ? .4 : 0) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

/* ---------- registry ---------- */
async function registry(db: SupabaseClient, c: any, host: string) {
  let bid = c.source === "openprospector" && c.source_ref ? Number(c.source_ref) : 0;
  if (!bid && host) { const { data } = await db.rpc("nr_business_by_domain", { p_domain: host }); if (data) bid = Number(data); }
  if (!bid) return null;
  const [{ data: b }, { data: cps }, { data: people }] = await Promise.all([
    db.from("nr_businesses").select("id,name,name_en,city,address,website,socials,phone_main,email_main,whatsapp,reg_id").eq("id", bid).maybeSingle(),
    db.from("nr_contact_points").select("kind,subkind,value,verified,src_official,src_own_site").eq("business_id", bid),
    db.from("nr_people").select("full_name,role,phone,email").eq("business_id", bid),
  ]);
  return b ? { b, cps: cps || [], people: people || [] } : null;
}
const cpStrength = (x: any) => (x.verified ? 4 : 0) + (x.src_own_site ? 2 : 0) + (x.src_official ? 1 : 0);

/** Investigates one company. `skip` = fields to leave alone (rerun of missing fields only). */
export async function investigate(db: SupabaseClient, c: any, opts: { skip?: Field[] } = {}) {
  const t0 = Date.now();
  const steps: Step[] = [];
  const out: Finding[] = [];
  const need: Record<Field, boolean> = Object.fromEntries(FIELDS.map((f) => [f, !c[CARD_FIELD[f]] && !(opts.skip || []).includes(f)])) as any;
  for (const f of FIELDS) if (c[CARD_FIELD[f]]) out.push({ platform: f, url: c[CARD_FIELD[f]], handle: null, confidence: "existing", source: "card", evidence: "כבר קיים בכרטיס החברה" });
  const has = (f: Field) => out.some((x) => x.platform === f && x.confidence !== "none" && x.confidence !== "low");
  // E-mail is multi-value: even when the card has one, further role addresses (fleet, ops, purchasing,
  // management) are offered and, once approved, kept as extra contacts — the card's own value never changes.
  const cardEmail = String(c.email || "").toLowerCase();
  const add = (f: Field, url: string | null, handle: string | null, confidence: Conf, source: string, evidence: string, detail: any = {}) => {
    if (!url) return;
    if ((c.profile?.extra_contacts || []).some((x: any) => x.type === f && String(x.value).toLowerCase() === url.toLowerCase())) return; // already approved as an extra contact
    if (f === "email") { if ((opts.skip || []).includes("email") || url.toLowerCase() === cardEmail) return; }
    else if (!need[f]) return;
    if (out.some((x) => x.platform === f && (x.handle && x.handle === handle || x.url === url))) return;
    out.push({ platform: f, url, handle, confidence, source, evidence, detail });
  };

  // A. registry
  let site = c.website || (c.email && !FREE_MAIL.test(c.email) ? c.email.split("@")[1] : "");
  const reg = await registry(db, c, hostOf(site));
  const variants = nameVariants(c.company_name, reg?.b?.name_en);
  const knownPhones = new Set<string>([c.phone, c.whatsapp, reg?.b?.phone_main].map((x) => ilPhone(x || "")).filter(Boolean));
  if (reg) {
    steps.push({ step: "OpenProspector", ok: true, note: `רשומה ${reg.b.id}: ${reg.cps.length} פרטי קשר, ${reg.people.length} בעלי תפקידים` });
    const best = (pred: (x: any) => boolean) => reg.cps.filter(pred).sort((a: any, z: any) => cpStrength(z) - cpStrength(a))[0];
    const strongTxt = (x: any) => x.verified ? "מאומת ב-2 מקורות" : x.src_own_site ? "מאתר החברה" : x.src_official ? "ממאגר רשמי" : "ממקור משני";
    const conf = (x: any): Conf => cpStrength(x) ? "high" : "medium";
    const fb = best((x) => x.kind === "social" && x.subkind === "facebook"); if (fb) { const k = cleanFb(fb.value.replace(/^https?:\/\/[^/]+\//, "")); if (k) add("facebook", k.url, k.handle, conf(fb), "openprospector", `OpenProspector – ${strongTxt(fb)}`); }
    const ig = best((x) => x.kind === "social" && x.subkind === "instagram"); if (ig) { const k = cleanIg(ig.value.replace(/^https?:\/\/[^/]+\//, "").split("/")[0]); if (k) add("instagram", k.url, k.handle, conf(ig), "openprospector", `OpenProspector – ${strongTxt(ig)}`); }
    const li = best((x) => x.kind === "social" && x.subkind === "linkedin"); if (li) { const m = [...li.value.matchAll(LI_RX)][0]; if (m) { const k = cleanLi(m[1].toLowerCase(), m[2]); add("linkedin", k.url, k.handle, conf(li), "openprospector", `OpenProspector – ${strongTxt(li)}`); } }
    const ph = best((x) => x.kind === "phone" && x.subkind !== "branch") || best((x) => x.kind === "phone");
    if (ph) { const p = ilPhone(ph.value); if (p) { knownPhones.add(p); add("phone", fmtPhone(p), p, conf(ph), "openprospector", `OpenProspector – ${strongTxt(ph)}`); } }
    const em = best((x) => x.kind === "email"); if (em) add("email", em.value.toLowerCase(), em.value.toLowerCase(), conf(em), "openprospector", `OpenProspector – ${strongTxt(em)}`, { kind: FREE_MAIL.test(em.value) ? "personal_free" : "general" });
    const wa = best((x) => x.kind === "whatsapp"); if (wa) { const p = ilPhone(wa.value.replace(/\D/g, "")); if (p) add("whatsapp", fmtPhone(p), p, conf(wa), "openprospector", `OpenProspector – ${strongTxt(wa)}`); }
    const form = best((x) => x.kind === "contact_form"); if (form) add("contact_form", form.value, null, conf(form), "openprospector", `OpenProspector – ${strongTxt(form)}`);
    if (!site && reg.b.website) site = reg.b.website;
    for (const p of reg.people) {
      if (p.email && !FREE_MAIL.test(p.email)) add("email", p.email.toLowerCase(), p.email.toLowerCase(), "medium", "openprospector", `כתובת שפורסמה ל${p.full_name || "בעל תפקיד"}${p.role ? ` (${p.role})` : ""}`, { kind: "role", person: p.full_name, role: p.role });
    }
  } else steps.push({ step: "OpenProspector", ok: false, note: "אין רשומה מקושרת במאגר" });

  // B. website from the registry English name — accepted only when the site confirms the company
  if (!site && reg?.b?.name_en) {
    const label = tokens(reg.b.name_en).join("");
    for (const cand of label.length >= 3 ? [`${label}.co.il`, `${label}.com`] : []) {
      try {
        const pg = await fetchPage(`https://${cand}/`);
        const page = pg.html.toLowerCase();
        const confirm = (reg.b.reg_id && page.includes(String(reg.b.reg_id))) || [...knownPhones].some((p) => digits(page).includes(p.slice(1))) || nameScore([nameVariants(c.company_name)[0]], page) >= 0.9;
        if (confirm) { site = cand; add("website", `https://${hostOf(pg.finalUrl)}`, hostOf(pg.finalUrl), "high", "domain_check", `האתר ${cand} מציג את פרטי החברה (ח.פ./טלפון/שם)`); steps.push({ step: "איתור אתר", ok: true, note: `${cand} אומת מול פרטי החברה` }); break; }
      } catch { /* candidate not reachable */ }
    }
    if (!site) steps.push({ step: "איתור אתר", ok: false, note: "לא נמצא אתר שמאשר את פרטי החברה" });
  }
  const host = hostOf(site);
  if (host && need.website) add("website", `https://${host}`, host, c.website ? "existing" : "high", c.email && host === c.email.split("@")[1] ? "email_domain" : "openprospector", c.email && host === c.email.split("@")[1] ? "הדומיין של כתובת האימייל העסקית" : "אתר החברה לפי המאגר");

  // C. website crawl
  if (host) {
    const s = await crawlSite(host, steps);
    if (s) {
      const f = s.facts;
      const top = (m: Map<string, any>) => [...m.values()].sort((a, b) => b.n - a.n);
      const offer = (field: Field, list: any[]) => {
        if (!list.length) return;
        const ambiguous = list.length > 1 && list[1].n === list[0].n;
        list.slice(0, ambiguous ? 3 : 1).forEach((x) => add(field, x.url, x.handle, ambiguous ? "medium" : "high", "website", ambiguous ? `באתר ${s.host} מופיעים כמה עמודים – לבחור את הנכון` : `מקושר מהאתר הרשמי של החברה (${s.host})`, ambiguous ? { options: list.slice(0, 3).map((o) => o.url) } : {}));
      };
      offer("facebook", top(f.fb)); offer("instagram", top(f.ig)); offer("linkedin", top(f.li));
      // Business addresses first (general / department). Personal employee addresses are personal data:
      // offered only when the site has no business address at all, at most one, at low confidence.
      const mails = [...f.emails].map(([em, info]) => {
        const local = em.split("@")[0];
        const role = ROLE_MAIL.find(([, rx]) => rx.test(local));
        return { em, info, role, personal: !role };
      });
      const business = mails.filter((m) => !m.personal).sort((a, b) => Number(b.info.mailto) - Number(a.info.mailto)).slice(0, 4);
      for (const m of business) {
        add("email", m.em, m.em, m.info.mailto ? "high" : "medium", "website", `פורסם באתר החברה (${new URL(m.info.page).pathname || "/"}) · ${m.role![0]}`, { kind: m.role![0] === "משרד / כללי" ? "general" : "role", role: m.role![0] });
      }
      const personals = mails.filter((m) => m.personal);
      if (!business.length && !cardEmail && personals.length && personals.length <= 3) {
        const m = personals.sort((a, b) => Number(b.info.mailto) - Number(a.info.mailto))[0];
        add("email", m.em, m.em, "low", "website", "כתובת אישית שפורסמה באתר – רק אם אין חלופה עסקית; שימוש בכפוף לחוק הגנת הפרטיות", { kind: "personal" });
      } else if (personals.length > 3) {
        steps.push({ step: "אימיילים", ok: false, note: `באתר ${personals.length} כתובות אישיות של עובדים (מדריך) – לא הוצעו מטעמי פרטיות` });
      }
      const phones = [...f.phones.entries()].sort((a, b) => Number(b[1].tel) - Number(a[1].tel));
      for (const [p, info] of phones.slice(0, 3)) add("phone", fmtPhone(p), p, info.tel ? "high" : "medium", "website", `פורסם באתר החברה${info.tel ? " (קישור חיוג)" : ""}`);
      for (const p of f.wa) add("whatsapp", fmtPhone(p), p, "high", "website", "קישור וואטסאפ באתר החברה");
      if (f.forms[0]) add("contact_form", f.forms[0], null, "high", "website", "טופס יצירת קשר באתר החברה");
      for (const p of f.phones.keys()) knownPhones.add(p);
    }
  } else steps.push({ step: "אתר החברה", ok: false, note: "אין אתר ידוע לחברה" });

  // D. Wikidata
  if (["facebook", "instagram", "linkedin", "website"].some((x) => need[x as Field] && !has(x as Field))) {
    const wd = await wikidata(host, variants);
    if (wd) {
      const corroborated = wd.by === "domain" || (wd.web && (!host || hostOf(wd.web) === host));
      const conf: Conf = corroborated ? "high" : "medium";
      const why = wd.by === "domain" ? "Wikidata – לפי אתר החברה" : corroborated ? "Wikidata – לפי שם, והאתר תואם" : "Wikidata – לפי שם בלבד, לבדוק";
      if (wd.fb) { const k = cleanFb(wd.fb); if (k) add("facebook", k.url, k.handle, conf, "wikidata", why); }
      if (wd.ig) { const k = cleanIg(wd.ig); if (k) add("instagram", k.url, k.handle, conf, "wikidata", why); }
      if (wd.li) add("linkedin", `https://www.linkedin.com/company/${wd.li}/`, `company/${wd.li}`, conf, "wikidata", why);
      if (wd.web && !host) add("website", wd.web, hostOf(wd.web), "medium", "wikidata", why);
      steps.push({ step: "Wikidata", ok: true, note: why });
    } else steps.push({ step: "Wikidata", ok: false, note: "אין רשומה" });
  }

  // E. licensed web search
  let queries = 0;
  const missing = (["facebook", "instagram", "linkedin", "email"] as Field[]).filter((x) => need[x] && !has(x));
  if (missing.length) {
    if (!searchConfigured()) steps.push({ step: "חיפוש אינטרנט", ok: false, note: "לא הופעל – אין מפתח לשירות חיפוש מורשה (Brave Search API)" });
    else {
      const v0 = variants[0], city = c.city || reg?.b?.city || "";
      const plan: [Field, string][] = [];
      if (missing.includes("facebook")) plan.push(["facebook", `"${v0}" site:facebook.com`], ["facebook", `${v0} ${city} פייסבוק`]);
      if (missing.includes("instagram")) plan.push(["instagram", `"${v0}" site:instagram.com`]);
      if (missing.includes("linkedin")) plan.push(["linkedin", `"${v0}" site:linkedin.com/company`]);
      if (variants[variants.length - 1] !== v0 && missing.includes("facebook")) plan.push(["facebook", `"${variants[variants.length - 1]}" facebook`]);
      if (missing.includes("email")) plan.push(["email", `"${v0}" ${host ? `site:${host} ` : ""}אימייל OR "צור קשר"`]);
      const ctx = { variants, city, phones: [...knownPhones], host };
      for (const [field, q] of plan.slice(0, PER_COMPANY())) {
        if (has(field)) continue;
        try {
          const res = await braveSearch(db, q); queries++;
          if (field === "email") {
            for (const r of res) for (const em of (r.snippet.match(MAIL_RX) || []).map((x) => x.toLowerCase())) {
              const dom = em.split("@")[1];
              if (host && (dom === host || dom.endsWith("." + host))) add("email", em, em, "medium", "search", `נמצא בתוצאת חיפוש מדומיין החברה (${hostOf(r.url)})`, { kind: "general" });
            }
          } else {
            for (const s of scoreResults(field, res, ctx)) add(field, s.url, s.handle, s.conf, "search", `חיפוש: ${s.why}`, { query: q });
          }
        } catch (e) {
          const m = (e as Error).message;
          steps.push({ step: "חיפוש אינטרנט", ok: false, note: m === "QUOTA" ? `הגעתם למכסת החיפושים היומית (${DAILY_LIMIT()})` : m === "RATE" ? "שירות החיפוש ביקש להאט" : m });
          break;
        }
      }
      steps.push({ step: "חיפוש אינטרנט", ok: queries > 0, note: `${queries} חיפושים (Brave Search)` });
    }
  }

  for (const f of FIELDS) {
    if (need[f] && !out.some((x) => x.platform === f)) {
      out.push({ platform: f, url: null, handle: null, confidence: "none", source: "", evidence: "לא אותר לאחר חיפוש מורחב · נבדקו: " + steps.map((s) => s.step).filter((v, i, a) => a.indexOf(v) === i).join(", ") });
    }
  }
  return { findings: out, steps, queries, ms: Date.now() - t0 };
}

/** Offline check of the search-result scoring (fixed fixtures, no network, no quota). */
export function selftest() {
  const ctx = { variants: nameVariants('הובלות מור - אלי בע"מ'), city: "חולון", phones: ["0501234567"], host: "mor-eli.co.il" };
  const res = [
    { url: "https://www.facebook.com/moreli.hovalot/", title: "הובלות מור אלי - דף הבית", snippet: "הובלות מור אלי, חולון. טלפון 050-123-4567" },
    { url: "https://www.facebook.com/mor.flowers/", title: "מור פרחים", snippet: "חנות פרחים בחולון" },
    { url: "https://www.facebook.com/hovalot.mor.eli.south/", title: "הובלות מור אלי דרום", snippet: "הובלות בחולון והסביבה" },
    { url: "https://www.facebook.com/sharer/sharer.php?u=x", title: "share", snippet: "" },
  ];
  const got = scoreResults("facebook", res, ctx);
  const cases = [
    { name: "page with company phone → high", ok: got.find((g) => g.handle === "moreli.hovalot")?.conf === "high" },
    { name: "same name + city, no phone → medium (needs review)", ok: got.find((g) => g.handle === "hovalot.mor.eli.south")?.conf === "medium" },
    { name: "different business with one shared word → not offered", ok: !got.some((g) => g.handle === "mor.flowers") },
    { name: "share links ignored", ok: !got.some((g) => /sharer/.test(g.url)) },
    { name: "best match first", ok: got[0]?.handle === "moreli.hovalot" },
  ];
  return { pass: cases.every((c) => c.ok), cases, scored: got };
}
