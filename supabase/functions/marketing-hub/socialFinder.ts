// Facebook / Instagram finder for companies the owner selected in the outreach center.
// Only allowed, verifiable sources — nothing is guessed, nothing is scraped from Facebook or Instagram:
//   1. links already on the company's card (never overwritten)
//   2. the OpenProspector record behind the card (contact points with their source quality)
//   3. the company's own website (home + contact/about page), respecting robots.txt — a link the company
//      itself publishes to its page is the strongest proof
//   4. Wikidata official-account properties (P2013 Facebook, P2003 Instagram), matched by the website
// Meta's own lookups (Instagram Business Discovery, public Page metadata) need extra App Review features
// that this app does not have, so they are not used. Every finding is a suggestion until the owner approves.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const UA = "DaliaMarketingCenter/1.0 (checks a company's own website for its social links; staging)";
const FB_RX = /https?:\/\/(?:www\.|m\.|he-il\.|he\.)?facebook\.com\/(?!sharer|share|tr\b|plugins|dialog|login|policies|groups\/|events\/|watch|hashtag|help|privacy|legal|ads\b|business\b|gaming)([^"'<>\s?#\\]{2,120})/gi;
const IG_RX = /https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel|reels\/|explore|accounts|stories|tv\/|about|developer|legal)([A-Za-z0-9._]{2,30})/gi;
// Platform / builder accounts that appear in page footers and are never the company's own page.
const PLATFORM_HANDLES = /^(wix|wixcom|wordpress|wordpressdotcom|elementor|godaddy|shopify|facebook|instagram|meta|fb|weebly|squarespace|webflow|yoast|google|youtube|whatsapp|login|home|pages|profile\.php|people)$/i;
const FREE_MAIL = /@(gmail|walla|hotmail|yahoo|outlook|live|icloud|me|012|netvision|bezeqint|zahav|smile|actcom|017|013)\./i;

type Finding = { platform: "facebook" | "instagram"; url: string | null; handle: string | null; confidence: "existing" | "high" | "medium" | "none"; source: string; evidence: string };

const hostOf = (u?: string | null) => { try { return new URL(/^https?:/i.test(u || "") ? u! : "https://" + u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

function cleanFb(raw: string) {
  let h = decodeURIComponent(raw).replace(/\/+$/, "").split("/")[0];
  if (/^pages$/i.test(h)) {
    const id = (raw.match(/\/(\d{10,})/) || [])[1];
    return id ? { handle: id, url: `https://www.facebook.com/${id}` } : null;
  }
  // scrapers sometimes store a website domain as the "page" – that is not a Facebook page
  if (/^www\.|\.(co\.il|org\.il|com|net|org|co|il)$/i.test(h)) return null;
  if (/^profile\.php/i.test(raw)) { const id = (raw.match(/id=(\d{5,})/) || [])[1]; return id ? { handle: id, url: `https://www.facebook.com/profile.php?id=${id}` } : null; }
  if (PLATFORM_HANDLES.test(h) || /\.(php|html?|js|css|png|jpg)$/i.test(h)) return null;
  const tail = h.match(/-(\d{10,})$/); // vanity name ending in the page id
  const handle = (tail ? tail[1] : h).toLowerCase();
  return { handle, url: `https://www.facebook.com/${tail ? tail[1] : h}` };
}
function cleanIg(raw: string) {
  const h = raw.replace(/\/+$/, "").toLowerCase();
  if (PLATFORM_HANDLES.test(h) || h.length < 2) return null;
  return { handle: h, url: `https://www.instagram.com/${h}/` };
}

/* ---------- website (robots.txt respected) ---------- */
async function robotsAllows(origin: string, path: string) {
  try {
    const r = await fetch(origin + "/robots.txt", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return true;
    const txt = await r.text();
    let applies = false; const dis: string[] = [];
    for (const line of txt.split(/\r?\n/)) {
      const [k, ...rest] = line.split(":"); const v = rest.join(":").trim();
      if (/^user-agent$/i.test(k.trim())) applies = v === "*" || /dalia/i.test(v);
      else if (applies && /^disallow$/i.test(k.trim()) && v) dis.push(v);
    }
    return !dis.some((d) => path.startsWith(d));
  } catch { return true; }
}
async function fetchPage(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "he,en" }, redirect: "follow", signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get("content-type") || "";
  if (!/html|text/i.test(ct)) throw new Error("לא דף HTML");
  return { html: (await r.text()).slice(0, 1_500_000), finalUrl: r.url };
}
function extract(html: string) {
  const fb = new Map<string, { url: string; n: number }>(), ig = new Map<string, { url: string; n: number }>();
  const text = html.replace(/\\\//g, "/").replace(/&amp;/g, "&");
  for (const m of text.matchAll(FB_RX)) { const c = cleanFb(m[1]); if (c) { const e = fb.get(c.handle) || { url: c.url, n: 0 }; e.n++; fb.set(c.handle, e); } }
  for (const m of text.matchAll(IG_RX)) { const c = cleanIg(m[1]); if (c) { const e = ig.get(c.handle) || { url: c.url, n: 0 }; e.n++; ig.set(c.handle, e); } }
  const best = (m: Map<string, { url: string; n: number }>) => [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  return { fb: best(fb), ig: best(ig) };
}
async function fromWebsite(site: string) {
  const host = hostOf(site);
  if (!host) return { fb: [], ig: [], note: "" };
  const origins = [`https://${host}`, `https://www.${host}`];
  for (const origin of origins) {
    try {
      if (!(await robotsAllows(origin, "/"))) return { fb: [], ig: [], note: `האתר ${host} חוסם סריקה (robots.txt)` };
      const home = await fetchPage(origin + "/");
      let found = extract(home.html);
      if (!found.fb.length || !found.ig.length) {
        // one extra page: contact / about, on the same site only
        const link = (home.html.match(/href=["']([^"']*(contact|צור-קשר|%d7%a6%d7%95%d7%a8|about|אודות|%d7%90%d7%95%d7%93%d7%95%d7%aa)[^"']*)["']/i) || [])[1];
        if (link) {
          try {
            const u = new URL(link, home.finalUrl);
            if (hostOf(u.href) === hostOf(home.finalUrl) && await robotsAllows(u.origin, u.pathname)) {
              const extra = extract((await fetchPage(u.href)).html);
              if (!found.fb.length) found = { ...found, fb: extra.fb };
              if (!found.ig.length) found = { ...found, ig: extra.ig };
            }
          } catch { /* extra page is optional */ }
        }
      }
      return { ...found, host: hostOf(home.finalUrl), note: "" };
    } catch (e) { if (origin === origins[1]) return { fb: [], ig: [], note: `האתר ${host} לא נפתח (${(e as Error).message})` }; }
  }
  return { fb: [], ig: [], note: "" };
}

/* ---------- Wikidata (official account properties) ---------- */
async function fromWikidata(host: string) {
  if (!host) return {};
  const vals = [`https://${host}/`, `https://www.${host}/`, `http://${host}/`, `http://www.${host}/`, `https://${host}`, `https://www.${host}`].map((u) => `<${u}>`).join(" ");
  const q = `SELECT ?fb ?ig WHERE { VALUES ?w { ${vals} } ?c wdt:P856 ?w . OPTIONAL { ?c wdt:P2013 ?fb } OPTIONAL { ?c wdt:P2003 ?ig } } LIMIT 3`;
  try {
    const r = await fetch("https://query.wikidata.org/sparql?query=" + encodeURIComponent(q), { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return {};
    const j = await r.json() as any;
    const b = j.results.bindings[0] || {};
    return { fb: b.fb?.value as string | undefined, ig: b.ig?.value as string | undefined };
  } catch { return {}; }
}

/* ---------- OpenProspector record ---------- */
async function fromProspector(db: SupabaseClient, c: any, host: string) {
  let bid = c.source === "openprospector" && c.source_ref ? Number(c.source_ref) : 0;
  if (!bid && host) {
    const { data } = await db.rpc("nr_business_by_domain", { p_domain: host });
    if (data) bid = Number(data);
  }
  if (!bid) return { bid: 0, fb: null as any, ig: null as any, website: null as string | null };
  const [{ data: b }, { data: cps }] = await Promise.all([
    db.from("nr_businesses").select("id,website,socials").eq("id", bid).maybeSingle(),
    db.from("nr_contact_points").select("subkind,value,verified,src_official,src_own_site").eq("business_id", bid).eq("kind", "social").in("subkind", ["facebook", "instagram"]),
  ]);
  const pick = (k: string) => {
    const list = (cps || []).filter((x: any) => x.subkind === k).sort((a: any, z: any) => (Number(z.verified) * 4 + Number(z.src_own_site) * 2 + Number(z.src_official)) - (Number(a.verified) * 4 + Number(a.src_own_site) * 2 + Number(a.src_official)));
    if (list[0]) return { url: list[0].value, strong: !!(list[0].verified || list[0].src_own_site || list[0].src_official) };
    const so = (b?.socials || {})[k];
    return so ? { url: so, strong: false } : null;
  };
  return { bid, fb: pick("facebook"), ig: pick("instagram"), website: b?.website || null };
}

/** Looks up the missing links of one company. Existing links are reported, never replaced. */
export async function findForContact(db: SupabaseClient, c: any): Promise<{ findings: Finding[]; notes: string[] }> {
  const notes: string[] = [];
  const out: Finding[] = [];
  const need = { facebook: !c.facebook_url, instagram: !c.instagram_url };
  if (!need.facebook) out.push({ platform: "facebook", url: c.facebook_url, handle: c.facebook_handle, confidence: "existing", source: "card", evidence: "כבר קיים בכרטיס החברה" });
  if (!need.instagram) out.push({ platform: "instagram", url: c.instagram_url, handle: c.instagram_handle, confidence: "existing", source: "card", evidence: "כבר קיים בכרטיס החברה" });
  if (!need.facebook && !need.instagram) return { findings: out, notes };

  // website: the card's, else the company e-mail domain (not a free mailbox), else the OpenProspector record's
  let site = c.website || (c.email && !FREE_MAIL.test(c.email) ? c.email.split("@")[1] : "");
  const op = await fromProspector(db, c, hostOf(site));
  if (!site && op.website) site = op.website;
  const host = hostOf(site);
  const add = (platform: "facebook" | "instagram", url: string | null, confidence: "high" | "medium", source: string, evidence: string) => {
    if (!need[platform] || !url || out.some((f) => f.platform === platform && f.confidence !== "none")) return;
    const c2 = platform === "facebook" ? cleanFb(url.replace(/^https?:\/\/[^/]+\//, "")) : cleanIg(url.replace(/^https?:\/\/[^/]+\//, "").split("/")[0]);
    if (!c2) return;
    out.push({ platform, url: c2.url, handle: c2.handle, confidence, source, evidence });
  };

  // 1) OpenProspector — strong when the registry saw it on the company's own site / official source
  if (op.fb) add("facebook", op.fb.url, op.fb.strong ? "high" : "medium", "openprospector", op.fb.strong ? "נמצא ב-OpenProspector מאתר החברה / מקור רשמי" : "נמצא ב-OpenProspector ממקור משני – לבדוק");
  if (op.ig) add("instagram", op.ig.url, op.ig.strong ? "high" : "medium", "openprospector", op.ig.strong ? "נמצא ב-OpenProspector מאתר החברה / מקור רשמי" : "נמצא ב-OpenProspector ממקור משני – לבדוק");

  // 2) the company's own website
  if (host && ((need.facebook && !out.some((f) => f.platform === "facebook")) || (need.instagram && !out.some((f) => f.platform === "instagram")))) {
    const w = await fromWebsite(host);
    if (w.note) notes.push(w.note);
    const pickSite = (list: [string, { url: string; n: number }][], platform: "facebook" | "instagram") => {
      if (!list.length) return;
      const [, top] = list[0];
      // more than one different page linked equally often → ambiguous, offer it only as "medium"
      const ambiguous = list.length > 1 && list[1][1].n === top.n;
      add(platform, top.url, ambiguous ? "medium" : "high", "website",
        ambiguous ? `באתר ${w.host || host} מופיעים כמה עמודים – לבחור את הנכון (${list.slice(0, 3).map(([h]) => h).join(", ")})` : `מקושר מהאתר הרשמי של החברה (${w.host || host})`);
    };
    pickSite(w.fb as any, "facebook");
    pickSite(w.ig as any, "instagram");
  }

  // 3) Wikidata official accounts
  if (host && ((need.facebook && !out.some((f) => f.platform === "facebook")) || (need.instagram && !out.some((f) => f.platform === "instagram")))) {
    const wd = await fromWikidata(host);
    if (wd.fb) add("facebook", "https://www.facebook.com/" + wd.fb, "high", "wikidata", "חשבון רשמי לפי Wikidata (לפי אתר החברה)");
    if (wd.ig) add("instagram", "https://www.instagram.com/" + wd.ig, "high", "wikidata", "חשבון רשמי לפי Wikidata (לפי אתר החברה)");
  }

  for (const p of ["facebook", "instagram"] as const) {
    if (need[p] && !out.some((f) => f.platform === p)) {
      out.push({ platform: p, url: null, handle: null, confidence: "none", source: "", evidence: host ? `לא נמצא באתר החברה (${host}) ובמקורות הפתוחים` : "אין אתר לחברה – אין מקור מאומת לחיפוש" });
    }
  }
  return { findings: out, notes };
}
