// Social / digital-presence locator for ONE registry business ("דליה איתור לידים").
// Reuses the existing contact investigation (marketing-hub/contactFinder.ts → investigate: registry record, website crawl
// of home + contact/about/team pages with robots.txt, Wikidata official properties, licensed search when a key exists) and
// adds what the registry needs around it:
//   1. website resolution: card website → registry websites → company e-mail domains → known Israeli domains that resemble
//      the English name / Hebrew transliteration (≈166k domains already in the identify queue); a site counts as the
//      company's only when the page shows its phone, e-mail or company number (siteConfirms) – an e-mail domain alone is
//      not proof (people use their employer's address)
//   2. links taken from a site that could not be confirmed are never saved – they go to review
//   3. high confidence → saved on the card through nr_ingest (source enr:social_locate, existing values kept);
//      medium / low → nr_findings pending_review with every candidate; rejected candidates are not offered again
// Facebook / Instagram / LinkedIn are not searched or fetched directly: their terms and robots.txt forbid it, and the
// Meta APIs that would allow it (Page Public Metadata, IG Business Discovery) need App Review.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { investigate, linksOnPage, nameVariants } from "../marketing-hub/contactFinder.ts";

type Get = (url: string, timeoutMs?: number) => Promise<{ status: number; url: string; type: string; body: string }>;
type Biz = { name: string; name_en?: string | null; phones?: string[]; emails?: string[]; reg_id_type?: string | null; reg_id?: string | null };
export type LocateDeps = {
  get: Get;
  allowed: (url: string) => Promise<boolean>;
  siteConfirms: (b: Biz, html: string, host: string) => string[];
};
type Step = { step: string; ok: boolean; note: string };
type Out = { platform: string; url: string | null; handle: string | null; confidence: string; source: string; evidence: string; detail?: unknown; action?: string; finding_id?: number };

// free mailboxes and internet providers: their domain is not the company's website
const FREE_MAIL = /@(gmail|gmial|gmai|gmal|gamil|jmail|walla|hotmail|hotmial|yahoo|outlook|live|icloud|me|01\d|01\dnet|netvision|bezeqint|bezeq|zahav|internet-zahav|smile|actcom|msn|aol|nana10?|barak|inter|isdn|t2|xfone|partner|cellcom|orange|golan|hot|ymail|protonmail|mail)\./i;
// a value must look like a real address before it is saved or offered (pages that embed HTML in JavaScript produce fragments)
const VALID: Record<string, RegExp> = {
  email: /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i,
  facebook: /^https:\/\/www\.facebook\.com\/(?:[\p{L}\p{N}._-]{2,100}|profile\.php\?id=\d{5,})$/u,
  instagram: /^https:\/\/www\.instagram\.com\/[a-z0-9._]{2,30}\/?$/,
  linkedin: /^https:\/\/www\.linkedin\.com\/(company|school|showcase)\/[\p{L}\p{N}%._-]{2,100}\/?$/u,
  whatsapp: /^https:\/\/wa\.me\/972\d{8,9}$/,
  website: /^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}\/?$/i,
  contact_form: /^https?:\/\/[^\s"'<>]+$/i,
};
const pathOf = (u: string) => { try { const x = new URL(u); const p = x.pathname + x.hash; try { return decodeURIComponent(p); } catch { return p; } } catch { return ""; } };
const CONTACT_PAGE = /contact|צור|קשר|%d7%a6%d7%95%d7%a8|%d7%a6%d7%a8%d7%95|%d7%a7%d7%a9%d7%a8|kesher|pniot|פניות/i;
const SOCIAL = new Set(["facebook", "instagram", "linkedin", "whatsapp", "contact_form"]);
const hostOf = (u?: string | null) => { try { return new URL(/^https?:/i.test(u || "") ? u! : "https://" + u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const digits = (s: string) => String(s || "").replace(/\D/g, "");

// rough Hebrew → Latin, the way Israeli businesses usually spell their domain ("גל מרין" → galmarin)
const TR: Record<string, string> = { "א": "a", "ב": "b", "ג": "g", "ד": "d", "ה": "h", "ו": "v", "ז": "z", "ח": "ch", "ט": "t", "י": "i", "כ": "k", "ך": "ch", "ל": "l", "מ": "m", "ם": "m",
  "נ": "n", "ן": "n", "ס": "s", "ע": "a", "פ": "p", "ף": "f", "צ": "tz", "ץ": "tz", "ק": "k", "ר": "r", "ש": "sh", "ת": "t" };
const translit = (s: string) => [...s].map((ch) => TR[ch] ?? (/[a-z0-9]/i.test(ch) ? ch.toLowerCase() : "")).join("");
// words that describe a trade, not a company: a domain matching only these is someone else's (dekel.co.il for "דקל הנדסה")
const GENERIC_EN = /^(ltd|limited|inc|company|co|group|israel|international|global|and|the|of|construction|constructions|engineering|engineers|building|buildings|build|builders|stone|stones|marble|energy|property|properties|development|developments|business|works|work|infrastructure|infrastructures|renovation|renovations|holdings|investments|investment|services|service|management|systems|technologies|technology|trading|industries|industry|projects|project|consulting|solutions|electric|electricity|software|logistics|transport|marketing|import|export|real|estate|green|practical|platinum|keter|star|gold|golden)$/i;
const GENERIC_HE = /^(ו?ה?(בני[יה]ה|בניה|בני[י]?ן|הנדסה|עבודות|שיפוצים|תשתיות|יזמות|נכסים|אנרגיה|אבנים|ניהול|השקעות|אחזקות|מערכות|שירותים|פיתוח|ייזום|יזום|עסקית|לבנייה|לבניין|לבנין|ופיתוח|ובנייה|ובניה|ותשתיות|ושיפוצים|והשקעות|קבלנות|קבלני|חברה|חברת|קבוצת|ישראל))$/;
function domainLabels(name: string, nameEn?: string | null): string[] {
  const out = new Set<string>();
  const core = (s: string) => s.replace(/\(.*?\)/g, " ").replace(/בע["״'׳~]?מ|בעמ|ע["״]ר/g, " ").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  // only the distinctive words of the name (a family / brand name), never the trade words around it
  const en = core(nameEn || "").map((w) => w.toLowerCase()).filter((w) => /^[a-z0-9]+$/.test(w) && w.length >= 3 && !GENERIC_EN.test(w));
  if (en.length) { out.add(en.slice(0, 2).join("")); out.add(en.slice(0, 2).join("-")); if (en[0].length >= 5) out.add(en[0]); }
  const he = core(name).filter((w) => /[א-ת]/.test(w) && w.length >= 3 && !GENERIC_HE.test(w)).slice(0, 2).map(translit).filter((w) => w.length >= 3);
  if (he.length) { out.add(he.join("")); out.add(he.join("-")); }
  return [...out].filter((l) => l.replace(/-/g, "").length >= 5 && l.length <= 40);
}
// the company's city written on the page ("תל אביב -יפו" → "תל אביב")
function cityOnPage(city: string | null | undefined, text: string) {
  const c = String(city || "").replace(/\s*-\s*יפו$|\s*-\s*$/, "").trim();
  return c.length >= 2 && text.includes(c);
}

// ── archived copy (Common Crawl, public and free): a site that is down now or does not answer the cloud region may
// still have a recent archived home page; it counts only if it shows the company's phone / e-mail / company number ──
const CC_INDEX = "https://index.commoncrawl.org";
const CC_UA = { "User-Agent": "DaliaLeadFinder/1.0 (company presence research; staging)" };
let CC_COLLS: string[] | null = null;
async function ccCollections() {
  if (!CC_COLLS) {
    try { const r = await fetch(`${CC_INDEX}/collinfo.json`, { headers: CC_UA, signal: AbortSignal.timeout(10_000) }); CC_COLLS = ((await r.json()) as { id: string }[]).slice(0, 2).map((c) => c.id); }
    catch { CC_COLLS = []; }
  }
  return CC_COLLS;
}
async function fromArchive(domain: string): Promise<{ html: string; url: string; crawl: string } | null> {
  for (const c of await ccCollections()) {
    for (const q of [`url=${domain}/&matchType=exact`, `url=${domain}&matchType=domain`]) {
      try {
        const r = await fetch(`${CC_INDEX}/${c}-index?${q}&filter=status:200&filter=mime:text/html&output=json&limit=1`, { headers: CC_UA, signal: AbortSignal.timeout(15_000) });
        if (!r.ok) continue;
        const line = (await r.text()).trim().split("\n")[0];
        if (!line) continue;
        const h = JSON.parse(line) as { filename: string; offset: string; length: string; url: string };
        const off = Number(h.offset), len = Number(h.length);
        if (!(len > 0 && len < 3_000_000)) continue;
        const w = await fetch(`https://data.commoncrawl.org/${h.filename}`, { headers: { ...CC_UA, Range: `bytes=${off}-${off + len - 1}` }, signal: AbortSignal.timeout(20_000) });
        if (!w.ok && w.status !== 206) continue;
        const raw = await new Response(w.body!.pipeThrough(new DecompressionStream("gzip"))).text();
        // WARC headers, blank line, HTTP headers, blank line, page
        const i = raw.indexOf("\r\n\r\n", raw.indexOf("\r\n\r\n") + 4);
        return { html: (i > 0 ? raw.slice(i + 4) : raw).slice(0, 1_500_000), url: h.url, crawl: c };
      } catch { /* next query */ }
    }
  }
  return null;
}

async function confirmSite(deps: LocateDeps, b: Biz & { city?: string | null }, domain: string): Promise<{ ok: boolean; weak?: boolean; city?: boolean; note: string; host?: string }> {
  for (const u of [`https://${domain}/`, `https://www.${domain}/`, `http://www.${domain}/`]) {
    try {
      if (!(await deps.allowed(u))) return { ok: false, note: "robots.txt חוסם" };
      const r = await deps.get(u, 8_000);
      if (r.status !== 200 || !/html/i.test(r.type)) continue;
      const host = hostOf(r.url);
      if (host.split(".")[0] !== domain.split(".")[0]) return { ok: false, note: `מפנה ל-${host}` };
      const why = deps.siteConfirms(b, r.body, host);
      // the company's phone / e-mail / company number on the page is proof; a name alone is only a lead
      const strong = why.filter((w) => !w.startsWith("שם החברה"));
      const city = cityOnPage(b.city, r.body);
      return { ok: strong.length > 0, weak: !strong.length && why.length > 0, city, note: (why.length ? why : ["האתר נפתח אך לא מציג את פרטי החברה"]).join(" · ") + (city && why.length && !strong.length ? " · עיר החברה מופיעה באתר" : ""), host };
    } catch { /* try the next variant */ }
  }
  return { ok: false, note: "האתר לא נפתח" };
}

export async function locateSocial(sb: SupabaseClient, deps: LocateDeps, businessId: number, opts: { mode?: string; tag?: string; userId?: string | null } = {}) {
  const t0 = Date.now();
  const steps: Step[] = [];
  const [{ data: b }, { data: cps }] = await Promise.all([
    sb.from("nr_businesses").select("id,name,name_en,city,address,website,phone_main,email_main,reg_id,reg_id_type").eq("id", businessId).maybeSingle(),
    sb.from("nr_contact_points").select("kind,subkind,value,verified").eq("business_id", businessId),
  ]);
  if (!b) throw new Error("business not found");
  const phones = [...new Set((cps || []).filter((c) => c.kind === "phone").map((c) => digits(c.value).replace(/^972/, "0")).filter((p) => p.length >= 9))];
  const emails = (cps || []).filter((c) => c.kind === "email").map((c) => String(c.value).toLowerCase());
  const biz = { name: b.name, name_en: b.name_en, phones, emails, reg_id: b.reg_id, reg_id_type: b.reg_id_type, city: b.city };

  // 1. which website is really this company's
  let site = "", siteStatus = "none", siteNote = "";
  const candidates: { domain: string; from: string; trusted: boolean; similar?: boolean }[] = [];
  const pushC = (d: string, from: string, trusted = false, similar = false) => { const h = hostOf(d); if (h && !candidates.some((c) => c.domain === h)) candidates.push({ domain: h, from, trusted, similar }); };
  if (b.website) pushC(b.website, "אתר שכבר משויך לעסק במאגר", true);
  for (const c of (cps || []).filter((c) => c.kind === "website")) pushC(c.value, "אתר שנאסף למאגר");
  for (const e of emails.filter((e) => !FREE_MAIL.test(e))) pushC(e.split("@")[1], "דומיין האימייל העסקי");
  const labels = domainLabels(b.name, b.name_en);
  let weakSite = "", tried = 0;
  let archive: { html: string; url: string; crawl: string } | null = null;
  const tryCandidates = async () => {
    for (const c of candidates.slice(tried, 6)) {
      tried++;
      if (c.trusted) { site = c.domain; siteStatus = "registry"; siteNote = c.from; return; }
      const r = await confirmSite(deps, biz, c.domain);
      if (r.ok) { site = r.host || c.domain; siteStatus = "confirmed"; siteNote = `${c.from}: ${r.note}`; return; }
      // the site did not open from here: its latest archived copy, confirmed by the same rule
      // (only for the company's own domains – a domain found by name similarity is not known to be the company's)
      if (/לא נפתח/.test(r.note) && !c.similar) {
        const a = await fromArchive(c.domain);
        if (a) {
          const why = deps.siteConfirms(biz, a.html, c.domain).filter((w) => !w.startsWith("שם החברה"));
          if (why.length) { site = c.domain; siteStatus = "archive"; archive = a; siteNote = `${c.from}: האתר לא נפתח כעת, אך בעותק הארכיון (Common Crawl ${a.crawl}) ${why.join(" · ")}`; return; }
          steps.push({ step: "עותק ארכיון", ok: false, note: `${c.domain}: נמצא עותק (${a.crawl}) אבל הוא לא מציג טלפון / אימייל / ח.פ. של החברה` });
        } else steps.push({ step: "עותק ארכיון", ok: false, note: `${c.domain}: אין עותק בארכיון Common Crawl מהחודשים האחרונים` });
      }
      // name only: from the e-mail domain it is a lead; a domain found by name similarity also needs the company's city on the page
      if (r.weak && !weakSite && (!c.similar || r.city)) weakSite = c.domain;
      steps.push({ step: "אימות אתר", ok: false, note: `${c.domain} (${c.from}) – ${r.note}` });
    }
  };
  await tryCandidates();
  // no confirmed site yet: known Israeli domains whose name resembles the company, each checked against its details
  if (!site && labels.length) {
    const { data: dc } = await sb.rpc("nr_social_domain_candidates", { p_labels: labels, p_business: businessId });
    const free = (dc || []).filter((x: { owner: number | null; domain: string }) => !x.owner && !candidates.some((c) => c.domain === x.domain));
    for (const x of free.slice(0, 4)) pushC(x.domain, `דומיין ישראלי מוכר שדומה לשם (${labels[0]})`, false, true);
    steps.push({ step: "התאמת דומיין", ok: free.length > 0, note: free.length ? `${free.length} דומיינים דומים לשם מתוך האתרים הישראליים המוכרים: ${free.slice(0, 4).map((x: { domain: string }) => x.domain).join(", ")}` : `אין דומיין דומה ל-${labels.slice(0, 2).join(" / ")} באתרים הישראליים המוכרים` });
    await tryCandidates();
  }
  if (!site && weakSite) { site = weakSite; siteStatus = "unconfirmed"; siteNote = "שם החברה מופיע באתר, אבל לא טלפון / אימייל / ח.פ. – הממצאים ממנו עוברים לבדיקה"; }
  steps.push({ step: "אתר החברה", ok: !!site && siteStatus !== "unconfirmed", note: site ? `${site} – ${siteNote}` : "לא נמצא אתר שמאשר את פרטי החברה" });

  // 2. the existing investigation (registry, site crawl, Wikidata, licensed search if configured)
  const contact = { company_name: b.name, website: site ? `https://${site}` : null, email: null, phone: b.phone_main, city: b.city,
    source: "openprospector", source_ref: String(businessId), profile: {} };
  const inv = await investigate(sb, contact);
  steps.push(...inv.steps.filter((s) => s.step !== "OpenProspector"));

  // 3. decide per finding
  // compare by platform + handle (path without host / slashes / query): facebook.com/x, www.facebook.com/x/ and m.facebook.com/x are one page
  const keyOf = (pf: string, v: string) => {
    const s = String(v || "").toLowerCase().trim();
    if (pf === "email") return `email|${s}`;
    if (pf === "website") return `website|${hostOf(s)}`;
    if (pf === "whatsapp") return `whatsapp|${digits(s).replace(/^972/, "0")}`;
    return `${pf}|${s.replace(/^https?:\/\/[^/]+\/?/, "").split(/[?#]/)[0].replace(/\/+$/, "")}`;
  };
  const known = new Set((cps || []).map((c) => keyOf(c.kind === "social" ? c.subkind : c.kind, c.value)));
  const isKnown = (pf: string, v: string) => known.has(keyOf(pf, v));
  const trustedSite = siteStatus === "registry" || siteStatus === "confirmed" || siteStatus === "archive";
  // links on the archived copy of a confirmed company site (the live site could not be read)
  if (archive) {
    const l = linksOnPage(archive.html, archive.url);
    const ev = `מקושר מעותק הארכיון של אתר החברה (${site}, Common Crawl ${archive.crawl})`;
    for (const [pf, list] of [["facebook", l.facebook], ["instagram", l.instagram], ["linkedin", l.linkedin]] as [string, { url: string; handle: string; n: number }[]][]) {
      const amb = list.length > 1 && list[1].n === list[0].n;
      for (const x of list.slice(0, amb ? 3 : 1)) inv.findings.push({ platform: pf as never, url: x.url, handle: x.handle, confidence: amb ? "medium" : "high", source: "archive", evidence: amb ? `${ev} – כמה עמודים באתר, לבחור את הנכון` : ev });
    }
    for (const w of l.whatsapp.slice(0, 1)) inv.findings.push({ platform: "whatsapp", url: w, handle: w, confidence: "high", source: "archive", evidence: ev });
  }
  const findings: Out[] = [];
  const save: Record<string, unknown> = { socials: {} as Record<string, string>, emails: [] as unknown[], websites: [] as string[] };
  // a site this run confirmed (phone / e-mail / company number on the page) is itself a new verified fact
  if ((siteStatus === "confirmed" || siteStatus === "archive") && !isKnown("website", site)) {
    (save.websites as string[]).push(`https://${site}`);
    findings.push({ platform: "website", url: `https://${site}`, handle: site, confidence: "high", source: "site_confirm", evidence: siteNote, action: "saved" });
  } else if (siteStatus === "unconfirmed" && !isKnown("website", site)) {
    inv.findings.push({ platform: "website", url: `https://${site}`, handle: site, confidence: "medium", source: "site_confirm", evidence: siteNote });
  }
  for (const f of inv.findings as Out[]) {
    if (f.confidence === "none" || f.confidence === "existing" || !f.url) continue;
    if (f.platform === "phone") continue;                                  // phones are already collected by the deep crawl
    let conf = f.confidence, evidence = f.evidence;
    if (f.source === "openprospector") { findings.push({ ...f, action: "known" }); continue; }
    // links read from a site that was not confirmed against the company's own details are only leads
    if ((f.source === "website" || f.source === "domain_check") && !trustedSite && conf === "high") { conf = "medium"; evidence += " – האתר לא אומת מול טלפון / אימייל / ח.פ. של החברה"; }
    // Wikidata matched by name only, with no confirmed site to compare, is not proof
    if (f.source === "wikidata" && !trustedSite && conf === "high" && !/לפי אתר החברה/.test(evidence)) { conf = "medium"; evidence += " – אין אתר מאומת להשוואה"; }
    const url = f.platform === "whatsapp" ? `https://wa.me/972${digits(f.handle || f.url).replace(/^0/, "")}` : f.url;
    const kind = f.platform === "email" ? "email" : f.platform;
    if (VALID[f.platform] && !VALID[f.platform].test(url)) { findings.push({ ...f, url, confidence: conf, evidence: "ערך לא תקין שנקרא מהדף – לא נשמר", action: "invalid" }); continue; }
    if (f.platform === "email" && /@(localhost|example\.|test\.)/i.test(url)) { findings.push({ ...f, url, action: "invalid", evidence: "כתובת לדוגמה – לא נשמרה" }); continue; }
    // a form on the home page may be a newsletter sign-up: only a form on a contact page counts
    if (f.platform === "contact_form" && !CONTACT_PAGE.test(pathOf(url))) {
      findings.push({ ...f, url, confidence: conf, evidence: "טופס בעמוד הבית – ייתכן שזה טופס הרשמה ולא טופס יצירת קשר; לא נשמר", action: "skipped" }); continue;
    }
    if (isKnown(kind, url) || (f.platform === "website" && (hostOf(url) === hostOf(b.website) || (trustedSite && hostOf(url) === site)))) { findings.push({ ...f, url, confidence: conf, evidence, action: "known" }); continue; }
    if (conf === "high" && (SOCIAL.has(f.platform) || f.platform === "website" || (f.platform === "email" && (f.detail as { kind?: string })?.kind !== "personal"))) {
      if (SOCIAL.has(f.platform)) (save.socials as Record<string, string>)[f.platform] ??= url;
      else if (f.platform === "website") (save.websites as string[]).push(url);
      else (save.emails as unknown[]).push({ v: url.toLowerCase() });
      findings.push({ ...f, url, confidence: conf, evidence, action: "saved" });
      continue;
    }
    // review: keep every candidate, with the reason
    const id = await sb.rpc("nr_put_finding", { f: {
      business_id: businessId, candidates: [businessId], subject_name: b.name, subject_city: b.city, source_key: "enr:social_locate", source_url: url,
      category: "new_social", title: `${({ facebook: "פייסבוק", instagram: "אינסטגרם", linkedin: "לינקדאין", website: "אתר", email: "אימייל", whatsapp: "וואטסאפ", contact_form: "טופס יצירת קשר" } as Record<string, string>)[f.platform] || f.platform} אפשרי: ${f.handle || url}`,
      detail: { platform: f.platform, url, handle: f.handle, confidence: conf, evidence, source: f.source, options: (f.detail as { options?: string[] })?.options },
      importance: "normal", fact_kind: "indication", verification: "unverified", match_status: "pending_review", match_method: "social_locate",
      dedup_key: `social_locate:${businessId}:${f.platform}:${(f.handle || url).toLowerCase()}` } });
    findings.push({ ...f, url, confidence: conf, evidence, action: "review", finding_id: Number(id.data) || undefined });
  }
  // candidates an earlier run offered that this run no longer finds (stricter rules, page changed) leave the review queue;
  // they are kept (status unmatched), never deleted, and come back if found again
  const keep = findings.filter((f) => f.action === "review").map((f) => `social_locate:${businessId}:${f.platform}:${(f.handle || f.url || "").toLowerCase()}`);
  const { data: stale } = await sb.from("nr_findings").select("id,dedup_key,detail").eq("business_id", businessId).eq("match_status", "pending_review").like("dedup_key", "social_locate:%");
  for (const s of (stale || []).filter((x: { dedup_key: string }) => !keep.includes(x.dedup_key))) {
    await sb.from("nr_findings").update({ match_status: "unmatched", updated_at: new Date().toISOString(),
      detail: { ...(s.detail || {}), withdrawn_at: new Date().toISOString(), withdrawn_reason: "לא נמצא שוב בבדיקה חוזרת" } }).eq("id", s.id);
  }
  const nSave = Object.keys(save.socials as object).length + (save.websites as string[]).length + (save.emails as unknown[]).length;
  if (nSave) {
    const src = findings.find((f) => f.action === "saved" && f.source === "website") ? `https://${site}` : null;
    await sb.rpc("nr_ingest", { p_source: "enr:social_locate", p_rows: [{ business_id: businessId, name: b.name, rid: `social:${businessId}`, url: src,
      websites: save.websites, emails: save.emails, socials: save.socials, fields: { located_at: new Date().toISOString(), site, site_status: siteStatus } }] });
  }
  const review = findings.filter((f) => f.action === "review").length;
  const ms = Date.now() - t0;
  await sb.from("nr_social_runs").insert({ business_id: businessId, ms, mode: opts.mode || "button", tag: opts.tag || null, requested_by: opts.userId || null,
    site: site || null, site_status: siteStatus, steps, findings, saved: findings.filter((f) => f.action === "saved").length, review });
  await sb.from("nr_businesses").update({ social_checked_at: new Date().toISOString() }).eq("id", businessId);
  return { business_id: businessId, site, site_status: siteStatus, saved: findings.filter((f) => f.action === "saved").length, review, ms, findings, steps, variants: nameVariants(b.name, b.name_en) };
}
