// Strict Wikidata bulk (STAGING), source enr:wikidata_bulk. Separate from the weekly enr:wikidata step.
// A company number (P10889) or a website domain is saved only when the Hebrew or English name agrees.
// A contradiction goes to review and is not written onto the card. CC0. One page per call.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { socialUrl } from "../_shared/socialUrl.ts";

const UA = "DaliaOpenProspector/1.0 (Israeli business registry research; staging) orin1607@gmail.com";
const TYPES = "wd:Q4830453 wd:Q783794 wd:Q6881511 wd:Q891723 wd:Q167037 wd:Q1589009 wd:Q163740 wd:Q658255 wd:Q206361 wd:Q22687 wd:Q507619 wd:Q18388277 wd:Q1058914 wd:Q2659904";

async function sparql(q: string): Promise<Record<string, string>[]> {
  const r = await fetch("https://query.wikidata.org/sparql?query=" + encodeURIComponent(q), {
    headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
    signal: AbortSignal.timeout(55_000),
  });
  if (!r.ok) throw new Error("Wikidata HTTP " + r.status);
  const j = await r.json() as { results: { bindings: Record<string, { value: string }>[] } };
  return j.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
}

function hostOf(raw?: string): string {
  try { return raw ? new URL(raw).hostname.replace(/^www\./, "").toLowerCase() : ""; } catch { return ""; }
}

export async function stepWikidataBulk(sb: SupabaseClient): Promise<Record<string, unknown>> {
  const { data: on, error: onErr } = await sb.rpc("nr_engine_on", { p_engine: "wd_bulk" });
  if (onErr) throw new Error(onErr.message);
  if (on !== true) return { skipped: "stopped" };
  const { data: src } = await sb.from("nr_sources").select("cursor,records_read,businesses_enriched,details_added,config").eq("key", "enr:wikidata_bulk").maybeSingle();
  if (!src) return { skipped: "no_source" };
  if ((src.config as { done?: boolean } | null)?.done) return { done: true };
  const off = Number(src.cursor || 0);
  const q = `SELECT ?c ?he ?en ?reg ?web ?fb ?ig ?li WHERE {
    { SELECT DISTINCT ?c WHERE {
        ?c wdt:P17 wd:Q801 ; wdt:P31 ?t . VALUES ?t { ${TYPES} }
        { ?c wdt:P10889 ?s } UNION { ?c wdt:P856 ?s } UNION { ?c wdt:P2013 ?s } UNION { ?c wdt:P2003 ?s } UNION { ?c wdt:P4264 ?s }
      } ORDER BY ?c LIMIT 80 OFFSET ${off} }
    OPTIONAL { ?c rdfs:label ?he FILTER(LANG(?he)="he") }
    OPTIONAL { ?c rdfs:label ?en FILTER(LANG(?en)="en") }
    OPTIONAL { ?c wdt:P10889 ?reg }
    OPTIONAL { ?c wdt:P856 ?web }
    OPTIONAL { ?c wdt:P2013 ?fb }
    OPTIONAL { ?c wdt:P2003 ?ig }
    OPTIONAL { ?c wdt:P4264 ?li } }`;
  let rows: Record<string, string>[];
  try { rows = await sparql(q); }
  catch (e) {
    const msg = (e as Error).message;
    if (/HTTP 429/.test(msg)) {
      await sb.from("nr_sources").update({ last_error: "Wikidata ביקש להאט (429). העמוד לא סומן כגמור.", updated_at: new Date().toISOString() }).eq("key", "enr:wikidata_bulk");
      return { throttled: true, cursor: off };
    }
    await sb.rpc("nr_beat", { p_engine: "wd_bulk", p_ok: false, p_msg: msg.slice(0, 300) });
    throw e;
  }
  const by = new Map<string, Record<string, Set<string>>>();
  for (const r of rows) {
    const e = by.get(r.c) || {};
    for (const [k, v] of Object.entries(r)) if (v) (e[k] = e[k] || new Set()).add(v);
    by.set(r.c, e);
  }
  const one = (e: Record<string, Set<string>>, k: string) => e[k] ? [...e[k]][0] : "";
  const page: Record<string, unknown>[] = [];
  for (const [c, e] of by) {
    const socials: Record<string, string> = {};
    const fb = one(e, "fb"), ig = one(e, "ig"), li = one(e, "li");
    if (fb && !/^groups\//i.test(fb)) {
      const u = socialUrl("facebook", /^https?:/i.test(fb) ? fb : "https://www.facebook.com/" + fb);
      if (u && !/\/groups\//i.test(u)) socials.facebook = u;
    }
    if (ig) { const u = socialUrl("instagram", /^https?:/i.test(ig) ? ig : "https://www.instagram.com/" + ig.replace(/^@/, "")); if (u) socials.instagram = u; }
    if (li) { const u = socialUrl("linkedin", /^https?:/i.test(li) ? li : "https://www.linkedin.com/company/" + li); if (u) socials.linkedin = u; }
    const web = one(e, "web");
    let site = ""; try { site = web ? new URL(web).origin : ""; } catch { /* ignore */ }
    page.push({
      rid: (c.split("/").pop() || c),
      url: c,
      name: one(e, "he"),
      name_en: one(e, "en"),
      reg_id: (one(e, "reg").match(/\d{5,}/) || [""])[0],
      domain: /facebook\.|instagram\.|linkedin\.|youtube\.|twitter\.|x\.com|google\.|wix\./i.test(hostOf(web)) ? "" : hostOf(web),
      websites: site ? [site] : [],
      socials,
    });
  }
  let matched = 0, review = 0, unmatched = 0;
  for (let i = 0; i < page.length; i += 40) {
    const { data, error } = await sb.rpc("nr_apply_cross_rows", { p_source: "enr:wikidata_bulk", p_rows: page.slice(i, i + 40) });
    if (error) throw new Error(error.message);
    const d = data as { matched?: number; review?: number; unmatched?: number };
    matched += Number(d?.matched || 0); review += Number(d?.review || 0); unmatched += Number(d?.unmatched || 0);
  }
  const done = by.size < 80;
  const next = done ? off : off + 80;
  await sb.from("nr_sources").update({
    status: done ? "completed" : "collecting",
    cursor: next,
    records_read: Number(src.records_read || 0) + by.size,
    businesses_enriched: Number(src.businesses_enriched || 0) + matched,
    details_added: Number(src.details_added || 0) + review,
    last_run_at: new Date().toISOString(),
    last_error: null,
    finished_at: done ? new Date().toISOString() : null,
    config: { ...(src.config as object), ...(done ? { done: true, last_full_run: new Date().toISOString() } : {}) },
    updated_at: new Date().toISOString(),
    status_reason: done
      ? "העמודים נגמרו. התאמה מחמירה: שם סותר לא נשמר."
      : `עמוד מ־${off}. בסבב: ${matched} נשמרו, ${review} לבדיקה, ${unmatched} בלי התאמה. לא סומנו ישויות שלא נקראו.`,
  }).eq("key", "enr:wikidata_bulk");
  await sb.rpc("nr_beat", { p_engine: "wd_bulk", p_ok: true, p_msg: null });
  return { cursor: next, read: by.size, matched, review, unmatched, done };
}
