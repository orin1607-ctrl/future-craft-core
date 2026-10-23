// Serper pilot (STAGING, dry): can a Google search pointer find the website of fleet companies that have none?
// For each company in the sample: one Serper search "<name> <city>" → candidate sites (directories / social / news removed)
// → our own check of each candidate site with the same rule as the identify engine (company number / known phone / exact
// e-mail on the page = the company's site; name + city only = review) → social links and e-mails on a confirmed site.
// Nothing is written to nr_* tables. Search results are a pointer only and are never stored as a fact.
//
//   node scripts/pilot-serper/run.mts --data <dir> [--limit 1000] [--mock]
//   The key: SERPER_API_KEY in the environment or the file <dir>/.serper-key (never printed). --mock runs without a key.
//   <dir>/sample.json comes from export-sample.sql; output: <dir>/serp.jsonl (raw searches) and <dir>/results.jsonl.
import fs from "node:fs";
import path from "node:path";
(globalThis as any).Deno ??= { env: { get: (_k: string) => undefined } }; // contactFinder.ts reads Deno.env only in search helpers
import { get, allowed, siteConfirms, cityOnPage, type Biz } from "./site.mts";
const { linksOnPage } = await import("../../supabase/functions/marketing-hub/contactFinder.ts");

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DATA = arg("--data") || "";
const LIMIT = Number(arg("--limit", "1000"));
const MOCK = process.argv.includes("--mock");
if (!DATA) throw new Error("--data <dir> is required (outside the repo: results contain business contact details)");
if (path.resolve(DATA).toLowerCase().startsWith(path.resolve(".").toLowerCase())) throw new Error("--data must be outside the repository (public repo)");
// the key comes from the environment or from <data dir>/.serper-key (outside the repo), never from the chat or a commit
const KEY = (process.env.SERPER_API_KEY || (fs.existsSync(path.join(DATA, ".serper-key")) ? fs.readFileSync(path.join(DATA, ".serper-key"), "utf8") : "")).trim();
if (!MOCK && !KEY) throw new Error("SERPER_API_KEY is not set");
if (!(LIMIT > 0 && LIMIT <= 2400)) throw new Error("--limit must be 1..2400 (the free allowance is 2,500 searches)");

type Row = Biz & { business_id: number; grp: string; mock_site?: string };
const raw = JSON.parse(fs.readFileSync(path.join(DATA, MOCK ? "sample-mock.json" : "sample.json"), "utf8"));
const sample: Row[] = (raw.rows || raw).map((r: any) => ({ ...r, phones: r.phones || [], emails: r.emails || [] }));
const SERP = path.join(DATA, MOCK ? "serp-mock.jsonl" : "serp.jsonl");
const OUT = path.join(DATA, MOCK ? "results-mock.jsonl" : "results.jsonl");
const readJsonl = (f: string) => fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const serpDone = new Map<number, any>(readJsonl(SERP).map((x) => [x.business_id, x]));
const resultDone = new Set<number>(readJsonl(OUT).map((x) => x.business_id));

// not the company's own site: directories, registries, social networks, news, job boards, maps, marketplaces
const NOT_OWN = /(^|\.)(b144\.co\.il|d\.co\.il|dapeizahav\.co\.il|144\.co\.il|zap\.co\.il|easy\.co\.il|bizportal\.co\.il|checkid\.co\.il|bizdb\.co\.il|ica\.co\.il|companies\.co\.il|rasham\.co\.il|duns100\.co\.il|bdi\.co\.il|dnb\.com|opencorporates\.com|kompass\.com|zoominfo\.com|lusha\.com|apollo\.io|rocketreach\.co|israelyp\.com|yellowpages|wikipedia\.org|gov\.il|google\.[a-z.]+|youtube\.com|facebook\.com|fb\.com|instagram\.com|linkedin\.com|tiktok\.com|twitter\.com|x\.com|waze\.com|yad2\.co\.il|madlan\.co\.il|ynet\.co\.il|walla\.co\.il|mako\.co\.il|globes\.co\.il|themarker\.com|calcalist\.co\.il|haaretz\.co\.il|maariv\.co\.il|kikar\.co\.il|bhol\.co\.il|alljobs\.co\.il|drushim\.co\.il|jobmaster\.co\.il|indeed\.com|glassdoor\.com|jobnet\.co\.il|tripadvisor\.[a-z.]+|booking\.com|amazon\.[a-z.]+|aliexpress\.com|ebay\.com|apple\.com|muni\.il)$/i;
const SOCIAL_RX = /^https?:\/\/(www\.|m\.)?(facebook\.com|instagram\.com|linkedin\.com\/company)\//i;
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const coreName = (n: string) => n.replace(/\(.*?\)/g, " ").replace(/בע["״'׳~]?מ|בעמ|ע["״]ר|\bltd\.?|\blimited\b/gi, " ").replace(/[~"״']/g, "").replace(/\s+/g, " ").trim();
const queryOf = (r: Row) => `${coreName(r.name)} ${String(r.city || "").replace(/\s*-\s*יפו$/, "")}`.trim();

let searches = serpDone.size;
async function search(r: Row) {
  if (serpDone.has(r.business_id)) return serpDone.get(r.business_id);
  if (MOCK) {
    const x = { business_id: r.business_id, q: queryOf(r), at: new Date().toISOString(), mock: true,
      organic: [{ link: "https://www.b144.co.il/b144_sip/123" }, ...(r.mock_site ? [{ link: r.mock_site }] : []), { link: "https://www.facebook.com/mockpage" }] };
    fs.appendFileSync(SERP, JSON.stringify(x) + "\n"); serpDone.set(r.business_id, x); return x;
  }
  if (searches >= LIMIT) throw new Error("search limit reached");
  searches++; // counted before the call: a crash after it never leads to a second paid search for the same company
  const res = await fetch("https://google.serper.dev/search", { method: "POST", headers: { "X-API-KEY": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ q: queryOf(r), gl: "il", hl: "iw", num: 10 }), signal: AbortSignal.timeout(20_000) });
  if (res.status === 401 || res.status === 403) throw new Error(`Serper refused the key (HTTP ${res.status}) – stopping`);
  if (res.status === 429 || res.status === 402) throw new Error(`Serper limit / credits (HTTP ${res.status}) – stopping`);
  const j: any = await res.json().catch(() => ({}));
  const x = { business_id: r.business_id, q: queryOf(r), at: new Date().toISOString(), http: res.status,
    organic: (j.organic || []).map((o: any) => ({ link: o.link, title: o.title, position: o.position })), kg_website: j.knowledgeGraph?.website || null };
  fs.appendFileSync(SERP, JSON.stringify(x) + "\n"); serpDone.set(r.business_id, x);
  return x;
}

async function checkSite(r: Row, domain: string) {
  for (const root of [`https://${domain}/`, `https://www.${domain}/`, `http://www.${domain}/`]) {
    try {
      if (!(await allowed(root))) return { domain, status: "robots", why: "robots.txt חוסם" };
      const home = await get(root, 10_000);
      if (home.status !== 200 || !/html/i.test(home.type)) continue;
      const host = hostOf(home.url);
      // the home page plus up to two contact / about pages of the same site
      const pages = [home];
      const links = [...home.body.matchAll(/href=["']([^"'#]+)["']/gi)].map((m) => { try { return new URL(m[1], home.url).href; } catch { return ""; } })
        .filter((u) => u && hostOf(u) === host && /contact|צור|קשר|about|אודות|%d7%a6%d7%95%d7%a8|%d7%90%d7%95%d7%93%d7%95%d7%aa/i.test(u));
      for (const u of [...new Set(links)].slice(0, 2)) { try { if (await allowed(u)) { const p = await get(u, 8_000); if (p.status === 200) pages.push(p); } } catch { /* optional */ } }
      const html = pages.map((p) => p.body).join("\n");
      const why = siteConfirms(r, html, host);
      const strong = why.filter((w) => !w.startsWith("שם החברה"));
      if (strong.length) {
        const soc = { facebook: new Set<string>(), instagram: new Set<string>(), linkedin: new Set<string>(), whatsapp: new Set<string>(), emails: new Set<string>() };
        for (const p of pages) { const l = linksOnPage(p.body, p.url); l.facebook.forEach((x: any) => soc.facebook.add(x.url)); l.instagram.forEach((x: any) => soc.instagram.add(x.url));
          l.linkedin.forEach((x: any) => soc.linkedin.add(x.url)); l.whatsapp.forEach((x: any) => soc.whatsapp.add(String(x))); l.emails.forEach((x: string) => soc.emails.add(x)); }
        return { domain: host, status: "verified", why: strong.join(" · "), pages: pages.length,
          found: Object.fromEntries(Object.entries(soc).map(([k, v]) => [k, [...v]])) };
      }
      if (why.length && cityOnPage(r.city, html)) return { domain: host, status: "review", why: why.join(" · ") + " · עיר החברה מופיעה באתר" };
      return { domain: host, status: "no_match", why: why.length ? why.join(" · ") + " (בלי עיר)" : "האתר לא מציג ח.פ. / טלפון / אימייל של החברה" };
    } catch { /* next variant */ }
  }
  return { domain, status: "unreachable", why: "האתר לא נפתח" };
}

async function one(r: Row) {
  const t0 = Date.now();
  try {
    const s = await search(r);
    const links: string[] = [...(s.kg_website ? [s.kg_website] : []), ...(s.organic || []).map((o: any) => o.link)];
    const socials = [...new Set(links.filter((u) => SOCIAL_RX.test(u)))].slice(0, 5);
    const domains = [...new Set(links.map(hostOf).filter((h) => h && !NOT_OWN.test(h)))].slice(0, 3);
    const cands = [];
    let verified: any = null, review: any = null;
    for (const d of domains) {
      const c: any = await checkSite(r, d);
      cands.push({ domain: c.domain, status: c.status, why: c.why, from_kg: hostOf(s.kg_website || "") === d });
      if (c.status === "verified") { verified = c; break; }
      if (c.status === "review" && !review) review = c;
    }
    const out = { business_id: r.business_id, grp: r.grp, query: s.q, serp_n: (s.organic || []).length, kg_site: s.kg_website ? hostOf(s.kg_website) : null,
      candidates: cands, verified_domain: verified?.domain || null, verified_why: verified?.why || null, pages: verified?.pages || 0,
      found_on_site: verified?.found || null, review_domain: verified ? null : review?.domain || null, serp_social_candidates: socials, ms: Date.now() - t0 };
    fs.appendFileSync(OUT, JSON.stringify(out) + "\n");
    return out;
  } catch (e) {
    const msg = (e as Error).message;
    if (/limit reached|refused the key|credits/.test(msg)) throw e;
    const out = { business_id: r.business_id, grp: r.grp, error: msg.slice(0, 200), ms: Date.now() - t0 };
    fs.appendFileSync(OUT, JSON.stringify(out) + "\n");
    return out;
  }
}

const todo = sample.filter((r) => !resultDone.has(r.business_id)).slice(0, LIMIT);
console.log(`${MOCK ? "MOCK " : ""}pilot: ${sample.length} in sample, ${resultDone.size} already done, ${todo.length} to run, search cap ${LIMIT}`);
let i = 0, stop = "";
const worker = async () => {
  while (!stop && i < todo.length) {
    const r = todo[i++];
    try { const o: any = await one(r); if (i % 25 === 0 || MOCK) console.log(`${i}/${todo.length} ${o.verified_domain ? "✓ " + o.verified_domain : o.error ? "! " + o.error : "–"}`); }
    catch (e) { stop = (e as Error).message; }
  }
};
await Promise.all([worker(), worker(), worker(), worker()]);
if (stop) console.log("STOPPED: " + stop);
const all = readJsonl(OUT);
const done = all.filter((x) => !x.error);
console.log(JSON.stringify({ searches_used: MOCK ? 0 : searches, processed: all.length, errors: all.length - done.length,
  verified_sites: done.filter((x) => x.verified_domain).length, for_review: done.filter((x) => x.review_domain).length }, null, 1));
