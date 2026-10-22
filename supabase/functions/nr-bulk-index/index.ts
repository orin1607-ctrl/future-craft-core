// nr-bulk-index – inverted-index bulk import for the national registry (STAGING, runs in Frankfurt).
// Downloads, in one pass each, every public record that ties an Israeli organisation to social accounts:
//   Wikidata  – Israeli company number (P10889) / GuideStar ID (P3914) / Israeli organisations with
//               Facebook (P2013) / Instagram (P2003) / LinkedIn company (P4264) and official website (P856)
//   OpenStreetMap (Overpass) – Israeli places tagged with facebook / instagram / linkedin + phone + website
// and matches them against the registry in one set-based lookup (nr_bulk_lookup).
// Rules (measured on the first manual run, see the migration 20261022020000):
//   * high confidence only with an exact identifier AND name agreement: company number, a phone unique to one
//     business, or the business's own website domain (OSM domain-only matches can be another branch → review);
//   * conflicting identifiers, shared phones and name mismatches → review queue (nr_put_finding), never saved;
//   * saved through nr_ingest, which never overwrites existing values; official websites go to nr_site_queue,
//     where the identify engine confirms them against the page before attaching them.
// Facebook / Instagram / LinkedIn themselves are never fetched or searched (terms of use / robots.txt).
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { edgeCorsHeaders, jsonResponse, requireAuth } from "../_shared/edgeAuth.ts";

const UA = { "User-Agent": "DaliaLeadFinder/1.0 (Israeli business presence research; staging)" };
type Socials = Partial<Record<"facebook" | "instagram" | "linkedin", string>>;
type Rec = { ref: string; url: string; name: string | null; socials: Socials; hps: string[]; phones: string[]; hosts: string[]; websites: string[] };

const normPhone = (p: unknown) => { let d = String(p ?? "").replace(/\D/g, ""); if (d.startsWith("972")) d = "0" + d.slice(3); if (d.length === 8 || (d.length === 9 && !d.startsWith("0"))) d = "0" + d; return /^0\d{8,9}$/.test(d) ? d : null; };
const host = (u: unknown) => String(u ?? "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[/:?#].*$/, "");
const PROFILE: Record<string, RegExp> = {
  facebook: /^https?:\/\/(www\.|m\.|he-il\.)?(facebook|fb)\.com\/(?!sharer|share|plugins|dialog|tr\b)[^\s?#]{2,}/i,
  instagram: /^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]{1,30}\/?$/i,
  linkedin: /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/(company|school)\/[^\s?#]{2,}/i,
};
const BASE: Record<string, string> = { facebook: "https://www.facebook.com/", instagram: "https://www.instagram.com/", linkedin: "https://www.linkedin.com/company/" };
function socialUrl(pf: string, v: unknown): string | null {
  const s = String(v ?? "").trim().split(";")[0];
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return PROFILE[pf].test(s) ? s.replace(/^http:/i, "https:") : null;
  const h = s.replace(/^@/, "");
  return /^[A-Za-z0-9._\-%]{2,60}$/.test(h) ? BASE[pf] + h + (pf === "instagram" || pf === "linkedin" ? "/" : "") : null;
}
const STOP = /^(ע"ר|ער|חל"צ|חלצ|בע"מ|בעמ|ע"ש|עש|ltd|inc|the|of|and|israel|ישראל|עמותת|עמותה|העמותה|חברת|החברה|ארגון|הארגון|מרכז|המרכז|אגודת|האגודה|ל|ה|ו|ב)$/i;
const toks = (s: unknown) => String(s ?? "").replace(/~/g, '"').replace(/\(.*?\)/g, " ").replace(/[-–_.,:;!?'"״׳()[\]]/g, " ").toLowerCase()
  .split(/\s+/).map((t) => t.replace(/^[והלבמכש](?=[א-ת]{3,})/, "")).filter((t) => t.length >= 2 && !STOP.test(t));
// both directions: most of the public label AND a fair share of the registry name (a shared city word is not enough)
function agree(bizName: unknown, label: unknown) {
  const a = new Set(toks(bizName)), b = toks(label);
  if (!b.length || !a.size) return false;
  const hit = b.filter((t) => a.has(t)).length;
  return hit / b.length >= 0.6 && (hit >= 2 || hit / a.size >= 0.4);
}

async function sparql(q: string) {
  const r = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q), { headers: UA, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error("wikidata HTTP " + r.status);
  return (await r.json()).results.bindings as Record<string, { value: string }>[];
}
async function fromWikidata(): Promise<Rec[]> {
  const opt = `OPTIONAL { ?item wdt:P2013 ?fb } OPTIONAL { ?item wdt:P2003 ?ig } OPTIONAL { ?item wdt:P4264 ?li } OPTIONAL { ?item wdt:P856 ?site }
    OPTIONAL { ?item rdfs:label ?he FILTER(lang(?he)="he") } OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en)="en") }`;
  const rows = [
    ...(await sparql(`SELECT ?item ?hp ?gs ?fb ?ig ?li ?site ?he ?en WHERE { { ?item wdt:P10889 ?hp } UNION { ?item wdt:P3914 ?gs } ${opt} }`)),
    ...(await sparql(`SELECT ?item ?fb ?ig ?li ?site ?he ?en WHERE { { ?item wdt:P17 wd:Q801 } UNION { ?item wdt:P159/wdt:P17 wd:Q801 }
      FILTER NOT EXISTS { ?item wdt:P31 wd:Q5 } { ?item wdt:P2013 ?fb } UNION { ?item wdt:P2003 ?ig } UNION { ?item wdt:P4264 ?li } ${opt} }`)),
  ];
  const by = new Map<string, Rec>();
  for (const b of rows) {
    const qid = b.item.value.split("/").pop()!;
    const r = by.get(qid) || { ref: qid, url: `https://www.wikidata.org/wiki/${qid}`, name: null, socials: {}, hps: [], phones: [], hosts: [], websites: [] };
    for (const k of ["hp", "gs"]) if (b[k]) r.hps.push(b[k].value.replace(/\D/g, ""));
    for (const [k, pf] of [["fb", "facebook"], ["ig", "instagram"], ["li", "linkedin"]] as const) if (b[k] && !r.socials[pf]) { const u = socialUrl(pf, b[k].value); if (u) r.socials[pf] = u; }
    if (b.site) { r.websites.push(b.site.value); r.hosts.push(host(b.site.value)); }
    r.name = r.name || b.he?.value || b.en?.value || null;
    by.set(qid, r);
  }
  return [...by.values()].map((r) => ({ ...r, hps: [...new Set(r.hps)].filter((h) => /^\d{8,9}$/.test(h)).map((h) => h.padStart(9, "0")), hosts: [...new Set(r.hosts)], websites: [...new Set(r.websites)] }));
}
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
async function fromOsm(): Promise<Rec[]> {
  const q = `[out:json][timeout:180];area["ISO3166-1"="IL"][admin_level=2]->.il;
    (nwr(area.il)["contact:facebook"];nwr(area.il)["facebook"];nwr(area.il)["contact:instagram"];nwr(area.il)["instagram"];nwr(area.il)["contact:linkedin"];nwr(area.il)["linkedin"];);out tags center;`;
  let lastErr = "";
  for (const ep of OVERPASS) {
    try {
      const r = await fetch(ep, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(100_000) });
      if (!r.ok) { lastErr = `${ep} HTTP ${r.status}`; continue; }
      const els = (await r.json()).elements as { type: string; id: number; tags?: Record<string, string> }[];
      return els.map((e) => {
        const t = e.tags || {}, socials: Socials = {};
        for (const pf of ["facebook", "instagram", "linkedin"] as const) { const u = socialUrl(pf, t["contact:" + pf] || t[pf]); if (u) socials[pf] = u; }
        const phones = [t.phone, t["contact:phone"], t["contact:mobile"], t.mobile].flatMap((v) => String(v ?? "").split(/[;,]/)).map(normPhone).filter(Boolean) as string[];
        const sites = [t.website, t["contact:website"]].filter(Boolean) as string[];
        return { ref: `${e.type}/${e.id}`, url: `https://www.openstreetmap.org/${e.type}/${e.id}`, name: t["name:he"] || t.name || t["name:en"] || null, socials,
          hps: [], phones: [...new Set(phones)], hosts: [...new Set(sites.map(host))], websites: sites };
      });
    } catch (e) { lastErr = `${ep} ${(e as Error).message}`; }
  }
  throw new Error("overpass unavailable: " + lastErr);
}

type Lookup = { hp: Record<string, number[]>; phones: Record<string, number[]>; hosts: Record<string, number[]>; names: Record<string, { n: string; c: string | null }> };
async function lookup(sb: SupabaseClient, recs: Rec[]): Promise<Lookup> {
  const { data, error } = await sb.rpc("nr_bulk_lookup", {
    p_hps: [...new Set(recs.flatMap((r) => r.hps))], p_phones: [...new Set(recs.flatMap((r) => r.phones))], p_hosts: [...new Set(recs.flatMap((r) => r.hosts))].filter(Boolean),
  });
  if (error) throw new Error("lookup: " + error.message);
  return data as Lookup;
}

async function run(sb: SupabaseClient, source: "wikidata" | "osm") {
  const t0 = Date.now();
  const key = source === "wikidata" ? "enr:wikidata_bulk" : "enr:osm_bulk";
  const tag = source === "wikidata" ? "bulk_wikidata" : "bulk_osm";
  const recs = (source === "wikidata" ? await fromWikidata() : await fromOsm()).filter((r) => Object.keys(r.socials).length || r.websites.length);
  const L = await lookup(sb, recs);
  const high: { business_id: number; rec: Rec; method: string }[] = [], review: { business_id: number; rec: Rec; method: string; why: string; cands: number[] }[] = [];
  const queueSites = new Set<string>();
  const st = { records: recs.length, high: 0, review: 0, unmatched: 0 };
  for (const r of recs) {
    const byId = [...new Set(r.hps.flatMap((h) => L.hp[h] || []))];
    const byPhone = [...new Set(r.phones.flatMap((p) => L.phones[p] || []))];
    const bySite = [...new Set(r.hosts.flatMap((h) => L.hosts[h] || []))];
    const strong = source === "wikidata" ? byId : byPhone;           // the exact identifier this source carries
    let biz: number | null = null, method = "";
    if (strong.length === 1 && (!bySite.length || bySite.includes(strong[0]))) { biz = strong[0]; method = `${tag}_${source === "wikidata" ? "hp" : "phone"}${bySite.length ? "_and_site" : ""}`; }
    else if (!strong.length && bySite.length === 1) { biz = bySite[0]; method = `${tag}_site`; }
    if (biz !== null) {
      const name = L.names[String(biz)]?.n;
      const both = method.endsWith("_and_site");
      const siteOnlyOsm = source === "osm" && method === `${tag}_site`;   // a chain domain can point to another branch's page
      if (!both && (siteOnlyOsm || !agree(name, r.name))) {
        review.push({ business_id: biz, rec: r, method: method + "_review", cands: [biz], why: siteOnlyOsm ? "התאמה לפי דומיין בלבד – ייתכן שזה עמוד של סניף אחר" : `השם במקור ("${r.name}") שונה מהשם במאגר ("${name}")` });
      } else {
        if (Object.keys(r.socials).length) high.push({ business_id: biz, rec: r, method });
        // a website from the public record is only queued: the identify engine confirms it on the page first
        if (source === "wikidata" && !bySite.length) r.hosts.filter((h) => /\.[a-z]{2,}$/.test(h)).forEach((h) => queueSites.add(h));
      }
    } else if (strong.length > 1 || bySite.length > 1 || (strong.length && bySite.length)) {
      const cands = [...new Set([...strong, ...bySite])].slice(0, 3);
      for (const c of cands) review.push({ business_id: c, rec: r, method: `${tag}_ambiguous`, cands, why: "המזהה במקור מתאים לכמה עסקים במאגר" });
    } else st.unmatched++;
  }
  // save high: nr_ingest never overwrites; the source key is kept on every contact point
  const now = new Date().toISOString();
  const rows = high.map((h) => ({ business_id: h.business_id, name: L.names[String(h.business_id)]?.n || h.rec.name, rid: `${tag}:${h.rec.ref}`, url: h.rec.url,
    websites: [], emails: [], socials: h.rec.socials, fields: { located_at: now, method: h.method, ref: h.rec.url } }));
  for (let i = 0; i < rows.length; i += 100) { const { error } = await sb.rpc("nr_ingest", { p_source: key, p_rows: rows.slice(i, i + 100) }); if (error) throw new Error("ingest: " + error.message); }
  const PN: Record<string, string> = { facebook: "פייסבוק", instagram: "אינסטגרם", linkedin: "לינקדאין" };
  let nReview = 0;
  for (const r of review) for (const [pf, url] of Object.entries(r.rec.socials)) {
    await sb.rpc("nr_put_finding", { f: { business_id: r.business_id, candidates: r.cands, subject_name: r.rec.name, subject_city: null, source_key: key, source_url: url,
      category: "new_social", title: `${PN[pf] || pf} אפשרי: ${String(url).replace(/^https?:\/\/(www\.)?/, "")}`,
      detail: { platform: pf, url, handle: String(url).replace(/\/$/, "").split("/").pop(), confidence: "medium", evidence: r.why, source: tag, ref: r.rec.url },
      importance: "normal", fact_kind: "indication", verification: "unverified", match_status: "pending_review", match_method: tag,
      dedup_key: `${tag}:${r.business_id}:${pf}:${String(url).toLowerCase()}` } });
    nReview++;
  }
  if (queueSites.size) await sb.from("nr_site_queue").upsert([...queueSites].map((d) => ({ domain: d, source: key, priority: 5, status: "queued", note: `אתר רשמי לפי ${tag} (התאמת ח.פ.)` })), { onConflict: "domain", ignoreDuplicates: true });
  st.high = rows.length; st.review = nReview;
  await sb.from("nr_sources").update({ status: "completed", last_run_at: now, finished_at: now, duration_ms: Date.now() - t0,
    records_read: recs.length, details_added: rows.length, last_error: null }).eq("key", key);
  return { source, ...st, sites_queued: queueSites.size, ms: Date.now() - t0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: edgeCorsHeaders });
  const auth = await requireAuth(req, { roles: ["super_admin"], allowInternal: true });
  if ("error" in auth) return auth.error;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({})) as { action?: string };
  const action = body.action || "all";
  const out: Record<string, unknown> = {};
  for (const s of (action === "all" ? ["wikidata", "osm"] : [action]) as ("wikidata" | "osm")[]) {
    try { out[s] = await run(sb, s); }
    catch (e) {
      out[s] = { error: (e as Error).message };
      await sb.from("nr_sources").update({ last_error: (e as Error).message.slice(0, 300), last_run_at: new Date().toISOString() }).eq("key", s === "wikidata" ? "enr:wikidata_bulk" : "enr:osm_bulk");
    }
  }
  return jsonResponse({ ok: true, ...out });
});
