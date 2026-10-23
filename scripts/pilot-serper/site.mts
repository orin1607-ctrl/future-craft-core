// Site helpers for the Serper pilot – the same rules the identify / social engines use (nr-enrichment):
// robots.txt is honoured, pages are capped, and a site belongs to a company only when the page shows its company number,
// a known phone or its exact e-mail. A name on the page is a lead for review, never proof.
export type Biz = { name: string; name_en?: string | null; phones?: string[]; emails?: string[]; reg_id_type?: string | null; reg_id?: string | null; city?: string | null };

const UA = "DaliaOpenProspector/1.0 (Israeli business registry research; staging)";

export function fmtPhone(p: string): string {
  if (/^1\d{9}$/.test(p)) return `${p[0]}-${p.slice(1, 4)}-${p.slice(4, 7)}-${p.slice(7)}`;
  return /^0(5|7)/.test(p) ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : `${p.slice(0, 2)}-${p.slice(2, 5)}-${p.slice(5)}`;
}
function decode(t: string): string {
  return t.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
export const textOf = (html: string) => decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
  .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|td|section|article)>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t ]+/g, " ").replace(/\n\s*\n+/g, "\n");

const PAGE_CAP = 1_500_000;
export async function get(url: string, timeoutMs = 12_000, accept = "text/html"): Promise<{ status: number; url: string; type: string; body: string }> {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "he,en;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  const type = r.headers.get("content-type") || "";
  let body = "";
  if ((/text|xml|json|html/i.test(type) || !type) && r.body) {
    const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
    try { while (body.length < PAGE_CAP) { const { value, done } = await reader.read(); if (done) break; body += value; } } catch { /* keep what arrived */ }
    reader.cancel().catch(() => {});
    if (body.length > PAGE_CAP) body = body.slice(0, PAGE_CAP);
  } else await r.body?.cancel().catch(() => {});
  return { status: r.status, url: r.url, type, body };
}

const robotsCache = new Map<string, string[]>();
async function robotsRules(origin: string): Promise<string[]> {
  if (robotsCache.has(origin)) return robotsCache.get(origin)!;
  const rules: string[] = [];
  try {
    const r = await get(origin + "/robots.txt", 5000, "text/plain");
    if (r.status === 200 && !/<html/i.test(r.body.slice(0, 500))) {
      let agents: string[] = [], inRules = false;
      for (const raw of r.body.slice(0, 50_000).split(/\r?\n/)) {
        const m = raw.replace(/#.*/, "").trim().match(/^([a-z-]+)\s*:\s*(.*)$/i);
        if (!m) continue;
        const k = m[1].toLowerCase(), v = m[2].trim();
        if (k === "user-agent") { if (inRules) { agents = []; inRules = false; } agents.push(v); }
        else if (k === "disallow" || k === "allow") { inRules = true; if (k === "disallow" && v && agents.some((a) => a === "*" || /dalia/i.test(a))) rules.push(v); }
      }
    }
  } catch { /* no robots.txt: allowed */ }
  robotsCache.set(origin, rules);
  return rules;
}
export async function allowed(url: string): Promise<boolean> {
  let u: URL; try { u = new URL(url); } catch { return false; }
  const rules = await robotsRules(u.origin);
  const path = u.pathname + u.search;
  return !rules.some((p) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$")).test(path));
}

function nameTokens(name: string) {
  return name.replace(/בע["״'׳~]?מ|\(.*?\)|ltd\.?|limited/gi, " ").split(/[^א-תa-zA-Z0-9]+/).filter((w) => w.length >= 3 &&
    !/^(חברה|חברת|שירותים|ישראל|בעמ|ניהול|השקעות|אחזקות|מערכות|הנדסה|קיבוץ|מושב|אגודה|שיתופית|שיתופי|חקלאית|מרכזית|כפר|רמת|עין|בית|גבעת|נווה|קבוצת|מרכז|תעשיות|מפעלי|עמותת|group|the|and)$/i.test(w));
}
function validIlId(d: string) {
  if (!/^5\d{8}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) { let x = Number(d[i]) * (i % 2 ? 2 : 1); if (x > 9) x -= 9; s += x; }
  return s % 10 === 0;
}
function regIdsOn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:ח\.?\s?פ\.?|ח["״׳']פ|ע["״׳']ר|עמותה מס['׳]?|מספר חברה|חברה מס['׳]?|company (?:no|number|reg(?:istration)?)\.?|reg\.? ?no\.?)\s*[:.#-]?\s*(5[\d\s-]{8,12})/gi)) {
    const d = m[1].replace(/\D/g, "").slice(0, 9);
    if (validIlId(d)) out.add(d);
  }
  return [...out];
}
// reasons this page belongs to the company; entries starting with "שם החברה" are name-only (review, not proof)
export function siteConfirms(b: Biz, html: string, host: string): string[] {
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
export const cityOnPage = (city: string | null | undefined, html: string) => {
  const c = String(city || "").replace(/\s*-\s*יפו$|\s*-\s*$/, "").trim();
  return c.length >= 2 && textOf(html).includes(c);
};
