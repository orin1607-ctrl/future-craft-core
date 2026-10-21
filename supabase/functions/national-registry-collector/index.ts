// OpenProspector – "מאגר עסקים ארצי" collector (STAGING only).
// Runs server-side from pg_cron (x-dalia-internal-key) every 2 minutes, independent of any chat or browser:
// picks the next source in priority order, reads ONE page at a time, merges it into nr_* via nr_ingest(),
// and saves the checkpoint after every page so a crash resumes exactly where it stopped.
// No 7-rule filtering here; no paid services; no login walls; robots.txt respected for websites.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { edgeCorsHeaders, jsonResponse, requireAuth } from "../_shared/edgeAuth.ts";
import { socialUrl, socialsFrom } from "../_shared/socialUrl.ts";
import { CKAN, MAPPERS, Row, TLV_MAPPERS, emails, fmtPhone, genericRow, normPhone, withBase } from "./mappers.ts";

const STAGING_REF = "usfeoerkpcafxxlyuldl";
const UA = "DaliaOpenProspector/1.0 (Israeli business registry research; staging)";
const TICK_BUDGET_MS = 110_000;
const INGEST_CHUNK = 250;
const CHECKPOINTS = [1000, 10000, 25000, 50000, 100000];

type Source = {
  key: string; name: string; kind: string; status: string; priority: number; config: Record<string, unknown>;
  total_records: number | null; cursor: number; records_read: number; businesses_new: number; businesses_enriched: number;
  businesses_merged: number; details_added: number; errors: number; started_at: string | null; duration_ms: number;
};
type Counts = { new: number; enriched: number; merged: number; details: number; skipped: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 60_000, attempts = 3): Promise<unknown> {
  let lastErr = "";
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const r = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(timeoutMs) });
      if (r.status === 429 || r.status >= 500) { lastErr = `HTTP ${r.status}`; await sleep(5000 * (attempt + 1)); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      lastErr = (e as Error).message;
      if (/HTTP 4\d\d/.test(lastErr)) break;
      await sleep(3000 * (attempt + 1));
    }
  }
  throw new Error(lastErr || "fetch failed");
}

async function ingest(sb: SupabaseClient, key: string, rows: Row[]): Promise<Counts> {
  const tot: Counts = { new: 0, enriched: 0, merged: 0, details: 0, skipped: 0 };
  for (let i = 0; i < rows.length; i += INGEST_CHUNK) {
    const { data, error } = await sb.rpc("nr_ingest", { p_source: key, p_rows: rows.slice(i, i + INGEST_CHUNK) });
    if (error) throw new Error("nr_ingest: " + error.message);
    for (const k of Object.keys(tot) as (keyof Counts)[]) tot[k] += Number((data as Counts)[k] || 0);
  }
  return tot;
}

async function event(sb: SupabaseClient, level: string, message: string, source_key?: string, data?: unknown) {
  await sb.from("nr_events").insert({ level, message, source_key: source_key ?? null, data: data ?? null });
}

// ── adapters: each returns how many source records were read, the next cursor and whether the source is exhausted ──
type StepResult = { read: number; cursor: number; total: number | null; done: boolean; counts: Counts; note?: string };

async function stepCkan(sb: SupabaseClient, src: Source, pageSize: number): Promise<StepResult> {
  const rid = String(src.config.rid);
  const generic = src.config.map as Parameters<typeof genericRow>[1] | undefined;
  const mapper = generic ? (rec: Record<string, unknown>) => genericRow(rec, generic) : MAPPERS[String(src.config.mapper)];
  if (!mapper) throw new Error("no mapper " + src.config.mapper);
  const limit = Number(src.config.page || pageSize);
  // municipal CKAN portals (*.datacity.org.il) use the same API as data.gov.il
  const base = String(src.config.ckan_base || CKAN);
  const urlOf = base === CKAN ? undefined : (id: unknown) => `${base}?resource_id=${rid}&filters=${encodeURIComponent(JSON.stringify({ _id: id }))}`;
  let url = `${base}?resource_id=${rid}&limit=${limit}&offset=${src.cursor}&sort=${encodeURIComponent("_id asc")}`;
  if (src.config.filters) url += `&filters=${encodeURIComponent(JSON.stringify(src.config.filters))}`;
  const j = await fetchJson(url) as { success: boolean; result: { total: number; records: Record<string, unknown>[] } };
  if (!j.success) throw new Error("CKAN error");
  const recs = j.result.records || [];
  const rows = recs.map((rec) => withBase(rid, rec, mapper(rec), urlOf)).filter(Boolean) as Row[];
  const counts = rows.length ? await ingest(sb, src.key, rows) : { new: 0, enriched: 0, merged: 0, details: 0, skipped: 0 };
  counts.skipped += recs.length - rows.length;
  const cursor = src.cursor + recs.length;
  return { read: recs.length, cursor, total: j.result.total, done: recs.length === 0 || cursor >= j.result.total, counts };
}

// ArcGIS MapServer layer (municipal GIS), paged by object id
async function stepArcgis(sb: SupabaseClient, src: Source): Promise<StepResult> {
  const layer = String(src.config.layer_url);
  const oid = String(src.config.oid || "OBJECTID");
  const mapper = TLV_MAPPERS[String(src.config.mapper)];
  if (!mapper) throw new Error("no mapper " + src.config.mapper);
  const page = Number(src.config.page || 1000);
  let total = src.total_records;
  if (total == null) {
    const c = await fetchJson(`${layer}/query?where=1%3D1&returnCountOnly=true&f=json`) as { count: number };
    total = c.count;
  }
  const j = await fetchJson(`${layer}/query?where=1%3D1&outFields=*&returnGeometry=false&orderByFields=${oid}&resultOffset=${src.cursor}&resultRecordCount=${page}&f=json`) as { features?: { attributes: Record<string, unknown> }[]; error?: { message: string } };
  if (j.error) throw new Error("ArcGIS: " + j.error.message);
  const feats = j.features || [];
  const urlOf = (id: unknown) => `${layer}/query?where=${encodeURIComponent(`${oid}=${id}`)}&outFields=*&returnGeometry=false&f=json`;
  const rows = feats.map((f) => withBase(layer, { ...f.attributes, _id: f.attributes[oid] }, mapper(f.attributes), urlOf)).filter(Boolean) as Row[];
  const counts = rows.length ? await ingest(sb, src.key, rows) : { new: 0, enriched: 0, merged: 0, details: 0, skipped: 0 };
  counts.skipped += feats.length - rows.length;
  const cursor = src.cursor + feats.length;
  return { read: feats.length, cursor, total, done: feats.length === 0 || cursor >= total, counts };
}

// Bus fleet per operator (Ministry of Transport public-transport vehicle list): counts real vehicle rows per operator.
async function stepFleetBuses(sb: SupabaseClient, src: Source): Promise<StepResult> {
  const rid = String(src.config.rid);
  const per = new Map<string, { n: number; types: Set<string>; ids: number[] }>();
  let offset = 0, total = 0;
  do {
    const j = await fetchJson(`${CKAN}?resource_id=${rid}&limit=5000&offset=${offset}&sort=${encodeURIComponent("_id asc")}`) as { result: { total: number; records: Record<string, unknown>[] } };
    total = j.result.total;
    for (const r of j.result.records) {
      const op = String(r.operator_nm || "").trim();
      if (!op) continue;
      const e = per.get(op) || { n: 0, types: new Set<string>(), ids: [] };
      e.n++;
      [r.BusSize_nm, r.BusType_nm].forEach((t) => t && e.types.add(String(t).trim()));
      if (e.ids.length < 3) e.ids.push(Number(r._id));
      per.set(op, e);
    }
    offset += j.result.records.length;
    if (!j.result.records.length) break;
  } while (offset < total);
  const rows: Row[] = [...per.entries()].map(([op, e]) => ({
    name: op, rid: "operator:" + op, sector: "תחבורה ציבורית – הסעת נוסעים",
    url: `${CKAN}?resource_id=${rid}&filters=${encodeURIComponent(JSON.stringify({ operator_nm: op }))}`,
    fleet: { vehicles: e.n, types: [...e.types] }, logistics: ["הסעת נוסעים / תחבורה ציבורית"],
    fields: { buses_in_registry: e.n, types: [...e.types], sample_record_ids: e.ids },
  }));
  const counts = await ingest(sb, src.key, rows);
  return { read: offset, cursor: offset, total, done: true, counts, note: `${rows.length} מפעילים` };
}

// OpenStreetMap via Overpass (ODbL). One category query per step.
const OSM_SOCIAL: Record<string, string[]> = {
  facebook: ["contact:facebook", "facebook"], instagram: ["contact:instagram", "instagram"], linkedin: ["contact:linkedin", "linkedin"],
  tiktok: ["contact:tiktok", "tiktok"], youtube: ["contact:youtube", "youtube"], twitter: ["contact:twitter", "twitter"], whatsapp: ["contact:whatsapp"],
};
function osmRow(el: { type: string; id: number; tags: Record<string, string> }, category: string): Row | null {
  const t = el.tags || {};
  const own = t["name:he"] || t.name || "";
  if (!own) return null;
  const brand = t["brand:he"] || t.brand || "";
  const branch = Boolean(brand) && brand !== own;
  const kindTag = ["shop", "office", "craft", "amenity", "tourism", "healthcare", "industrial", "company"].find((k) => t[k]);
  const activity = kindTag ? `${kindTag}=${t[kindTag]}` : category;
  const addr = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
  const city = t["addr:city"] || "";
  const ph: { v: string; d: string; sub: string; branch_name?: string; branch_address?: string }[] = [];
  for (const k of ["phone", "contact:phone", "contact:mobile", "mobile"]) for (const part of String(t[k] || "").split(/[;,]/)) {
    const p = normPhone(part);
    if (p && !ph.some((x) => x.v === p)) ph.push(branch ? { v: p, d: fmtPhone(p), sub: "branch", branch_name: own, branch_address: [addr, city].filter(Boolean).join(", ") } : { v: p, d: fmtPhone(p), sub: p.startsWith("05") ? "mobile" : "main" });
  }
  const socials: Record<string, string> = {};
  for (const [net, keys] of Object.entries(OSM_SOCIAL)) for (const k of keys) {
    let v = String(t[k] || "").trim();
    if (!v) continue;
    if (net === "whatsapp") { const d = normPhone(v); if (d) v = "https://wa.me/972" + d.slice(1); }
    // OSM holds full links or bare handles; either way only a whole account address is kept
    if (!/^https?:\/\//.test(v)) v = net === "facebook" ? "https://www.facebook.com/" + v : net === "instagram" ? "https://www.instagram.com/" + v.replace(/^@/, "") : v;
    const u = socialUrl(net, v);
    if (u) { socials[net] = u; break; }
  }
  const web = t.website || t["contact:website"] || t.url || "";
  const url = `https://www.openstreetmap.org/${el.type}/${el.id}`;
  return {
    name: branch ? brand : own, alt_names: branch ? [own] : undefined, name_en: t["name:en"] || "", city: branch ? "" : city,
    address: branch ? "" : addr, zip: branch ? "" : (t["addr:postcode"] || ""), phones: ph, emails: emails([t.email, t["contact:email"]]),
    websites: /^https?:\/\//.test(web) ? [web] : [], socials, activity, activities: [activity],
    rid: `${el.type}/${el.id}`, url,
    fields: { osm: url, category, branch_of: branch ? brand : null, phone: ph.map((p) => p.d), website: web || null, socials: Object.keys(socials) },
  };
}
const OVERPASS = ["https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
async function stepOverpass(sb: SupabaseClient, src: Source): Promise<StepResult> {
  const qs = src.config.queries as { label: string; filter: string }[];
  const i = src.cursor;
  if (i >= qs.length) return { read: 0, cursor: i, total: qs.length, done: true, counts: { new: 0, enriched: 0, merged: 0, details: 0, skipped: 0 } };
  const q = `[out:json][timeout:110];area["ISO3166-1"="IL"][admin_level=2]->.a;(${qs[i].filter.split("|").map((f) => `nwr${f}["name"](area.a);`).join("")});out center tags;`;
  // the main Overpass server rejects / times out requests from the Supabase region, so public mirrors are tried in order
  let j: { elements: { type: string; id: number; tags: Record<string, string> }[] } | null = null;
  let lastErr = "";
  for (const ep of OVERPASS) {
    try {
      j = await fetchJson(ep, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" } }, 120_000, 1) as typeof j;
      break;
    } catch (e) { lastErr = `${new URL(ep).host}: ${(e as Error).message}`; }
  }
  if (!j) throw new Error(lastErr);
  const rows = (j.elements || []).map((el) => osmRow(el, qs[i].label)).filter(Boolean) as Row[];
  for (const r of rows) for (const k of Object.keys(r)) { const v = r[k]; if (v === "" || v == null || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v as object).length)) delete r[k]; }
  const counts = await ingest(sb, src.key, rows);
  return { read: (j.elements || []).length, cursor: i + 1, total: qs.length, done: i + 1 >= qs.length, counts, note: qs[i].label };
}

// ── website enrichment: public homepage of a business website already in the registry ──
const FREE_MAIL = /@(gmail|walla|hotmail|yahoo|outlook|012|netvision|bezeqint|zahav|smile|actcom|017)\./;
async function allowedByRobots(origin: string): Promise<boolean> {
  try {
    const r = await fetch(origin + "/robots.txt", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return true;
    const txt = (await r.text()).slice(0, 20000);
    let applies = false;
    for (const line of txt.split(/\r?\n/)) {
      const [k, ...rest] = line.split(":");
      const v = rest.join(":").trim();
      if (/^user-agent$/i.test(k.trim())) applies = v === "*" || /dalia/i.test(v);
      else if (applies && /^disallow$/i.test(k.trim()) && v === "/") return false;
    }
    return true;
  } catch { return true; }
}
async function crawlOne(b: { id: number; name: string; website: string }): Promise<Row | null> {
  let origin: string;
  try { origin = new URL(b.website).origin; } catch { return null; }
  if (/facebook\.com|instagram\.com|linkedin\.com|wix\.com\/?$|google\./i.test(origin)) return null;
  if (!(await allowedByRobots(origin))) return { business_id: b.id, name: b.name, rid: origin, url: origin, fields: { robots: "disallowed – not crawled" } };
  let html = "", finalUrl = b.website;
  try {
    const r = await fetch(b.website, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(9000) });
    if (!r.ok || !/text\/html/i.test(r.headers.get("content-type") || "")) return { business_id: b.id, name: b.name, rid: origin, url: origin, fields: { http: r.status } };
    finalUrl = r.url;
    html = (await r.text()).slice(0, 500_000);
  } catch (e) { return { business_id: b.id, name: b.name, rid: origin, url: origin, fields: { error: (e as Error).message.slice(0, 80) } }; }
  const host = new URL(finalUrl).hostname.replace(/^www\./, "");
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  const phonesFound: { v: string; d: string; sub: string }[] = [];
  for (const h of hrefs) if (/^tel:/i.test(h)) { const p = normPhone(decodeURIComponent(h.slice(4))); if (p && !phonesFound.some((x) => x.v === p)) phonesFound.push({ v: p, d: fmtPhone(p), sub: p.startsWith("05") ? "mobile" : "main" }); }
  const mails = new Set<string>();
  for (const h of hrefs) if (/^mailto:/i.test(h)) mails.add(decodeURIComponent(h.slice(7).split("?")[0]).trim().toLowerCase());
  for (const m of html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []) mails.add(m.toLowerCase());
  const em = [...mails].filter((m) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(m) && !/\.(png|jpe?g|gif|webp|svg)$/.test(m) && (m.endsWith("@" + host) || m.endsWith("." + host) || FREE_MAIL.test(m)) && !/sentry|wixpress|example\./.test(m)).slice(0, 5).map((v) => ({ v }));
  const socials: Record<string, string> = {};
  socialsFrom(hrefs, socials);
  const contact = hrefs.find((h) => /contact|צור[-_ %20]*קשר|%d7%a6%d7%95%d7%a8/i.test(h) && !/^mailto|^tel/i.test(h));
  if (contact) { try { socials.contact_form = new URL(contact, finalUrl).href; } catch { /* ignore */ } }
  return {
    business_id: b.id, name: b.name, rid: origin, url: finalUrl, phones: phonesFound, emails: em, socials,
    fields: { page: finalUrl, phones_from_tel_links: phonesFound.map((p) => p.d), emails: em.map((e) => e.v), socials: Object.keys(socials) },
  };
}
async function crawlWebsites(sb: SupabaseClient, deadline: number) {
  const { data: src } = await sb.from("nr_sources").select("*").eq("key", "website_crawl").maybeSingle();
  if (!src || !["pending", "collecting", "completed"].includes(src.status)) return null;
  const t0 = Date.now();
  let read = 0;
  const tot: Counts = { new: 0, enriched: 0, merged: 0, details: 0, skipped: 0 };
  while (Date.now() < deadline - 15_000) {
    const { data: batch, error } = await sb.rpc("nr_claim_websites", { p_limit: 12 });
    if (error) throw new Error("nr_claim_websites: " + error.message);
    if (!batch || !batch.length) break;
    const rows = (await Promise.all((batch as { id: number; name: string; website: string }[]).map(crawlOne))).filter(Boolean) as Row[];
    read += batch.length;
    const c = rows.length ? await ingest(sb, "website_crawl", rows) : tot;
    if (c !== tot) for (const k of Object.keys(tot) as (keyof Counts)[]) tot[k] += c[k];
  }
  if (!read) {
    if (src.status === "collecting") await sb.from("nr_sources").update({ status: "completed", finished_at: new Date().toISOString(), status_reason: "כל אתרי האינטרנט הידועים במאגר נסרקו; ימשיך אוטומטית כשיתווספו אתרים" }).eq("key", "website_crawl");
    return null;
  }
  const dt = Date.now() - t0;
  await sb.from("nr_sources").update({
    status: "collecting", started_at: src.started_at || new Date().toISOString(), last_run_at: new Date().toISOString(),
    records_read: src.records_read + read, businesses_enriched: src.businesses_enriched + tot.enriched,
    businesses_merged: src.businesses_merged + tot.merged, details_added: src.details_added + tot.details,
    duration_ms: Number(src.duration_ms) + dt, updated_at: new Date().toISOString(),
  }).eq("key", "website_crawl");
  await sb.from("nr_runs").insert({ source_key: "website_crawl", finished_at: new Date().toISOString(), records_read: read, businesses_enriched: tot.enriched, businesses_merged: tot.merged, details_added: tot.details, duration_ms: dt });
  return { read, ...tot };
}

async function nextSource(sb: SupabaseClient): Promise<Source | null> {
  const { data } = await sb.from("nr_sources").select("*").in("status", ["collecting", "pending"]).in("kind", ["ckan", "fleet_ckan", "overpass", "arcgis"])
    .order("priority", { ascending: true }).order("key").limit(1);
  return (data && data[0]) as Source || null;
}

async function step(sb: SupabaseClient, src: Source, pageSize: number) {
  const t0 = Date.now();
  const startedAt = new Date().toISOString();
  try {
    if (src.status === "pending") {
      await sb.from("nr_sources").update({ status: "collecting", started_at: startedAt }).eq("key", src.key);
      await event(sb, "info", `התחלת איסוף: ${src.name}`, src.key);
    }
    const res = src.kind === "ckan" ? await stepCkan(sb, src, pageSize)
      : src.kind === "arcgis" ? await stepArcgis(sb, src)
      : src.kind === "fleet_ckan" ? await stepFleetBuses(sb, src)
      : await stepOverpass(sb, src);
    const dt = Date.now() - t0;
    const upd = {
      cursor: res.cursor, total_records: res.total ?? src.total_records, records_read: src.records_read + res.read,
      businesses_new: src.businesses_new + res.counts.new, businesses_enriched: src.businesses_enriched + res.counts.enriched,
      businesses_merged: src.businesses_merged + res.counts.merged, details_added: src.details_added + res.counts.details,
      duration_ms: Number(src.duration_ms) + dt, last_run_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      status: res.done ? "completed" : "collecting", finished_at: res.done ? new Date().toISOString() : null, errors: 0, last_error: null,
      status_reason: res.done ? "האיסוף הזמין מהמקור הסתיים" : null,
    };
    await sb.from("nr_sources").update(upd).eq("key", src.key);
    await sb.from("nr_runs").insert({
      source_key: src.key, started_at: startedAt, finished_at: new Date().toISOString(), cursor_from: src.cursor, cursor_to: res.cursor,
      records_read: res.read, businesses_new: res.counts.new, businesses_enriched: res.counts.enriched, businesses_merged: res.counts.merged,
      details_added: res.counts.details, duration_ms: dt, ok: true, error: res.note ?? null,
    });
    if (res.done) {
      await event(sb, "info", `הושלם: ${src.name} – נקראו ${upd.records_read.toLocaleString("en")} רשומות, ${upd.businesses_new.toLocaleString("en")} עסקים חדשים, ${upd.businesses_enriched.toLocaleString("en")} הועשרו, ${upd.details_added.toLocaleString("en")} פרטים נוספו`, src.key,
        { records_read: upd.records_read, new: upd.businesses_new, enriched: upd.businesses_enriched, merged: upd.businesses_merged, details: upd.details_added, duration_ms: upd.duration_ms });
      // catalog entries that point at the same dataset finish together
      await sb.from("nr_sources").update({ status: "completed", finished_at: new Date().toISOString(), status_reason: `אותו מאגר כמו "${src.name}" – נאסף שם` }).eq("config->>alias_of", src.key);
    }
    return { key: src.key, ...res.counts, read: res.read, cursor: res.cursor, done: res.done, ms: dt };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    const errors = (src.errors || 0) + 1;
    await sb.from("nr_sources").update({ errors, last_error: msg, status: errors >= 5 ? "error" : src.status === "pending" ? "collecting" : src.status, status_reason: errors >= 5 ? "5 כשלונות רצופים – " + msg : null, updated_at: new Date().toISOString() }).eq("key", src.key);
    await sb.from("nr_runs").insert({ source_key: src.key, started_at: startedAt, finished_at: new Date().toISOString(), cursor_from: src.cursor, cursor_to: src.cursor, ok: false, error: msg, duration_ms: Date.now() - t0 });
    await event(sb, "error", `שגיאה במקור ${src.name}: ${msg}`, src.key);
    return { key: src.key, error: msg };
  }
}

async function checkpoints(sb: SupabaseClient, done: number[]) {
  const { count } = await sb.from("nr_businesses").select("id", { count: "exact", head: true });
  const n = count || 0;
  const hit = CHECKPOINTS.filter((c) => n >= c && !done.includes(c));
  if (!hit.length) return n;
  const { data: st } = await sb.rpc("nr_stats");
  for (const c of hit) await event(sb, "checkpoint", `נקודת בקרה: ${c.toLocaleString("en")} עסקים ייחודיים במאגר (בפועל ${n.toLocaleString("en")})`, undefined, st);
  await sb.from("nr_control").update({ checkpoints_done: [...done, ...hit] }).eq("id", 1);
  return n;
}

async function tick(sb: SupabaseClient) {
  const t0 = Date.now();
  const { data: locked } = await sb.rpc("nr_try_lock", { p_seconds: 400 });
  if (!locked) return { skipped: "another tick is running" };
  try {
    const { data: ctl } = await sb.from("nr_control").select("*").eq("id", 1).single();
    if (!ctl?.running) return { skipped: "stopped" };
    const { data: mb } = await sb.rpc("nr_db_mb");
    if (Number(mb) >= ctl.max_db_mb) {
      await sb.from("nr_control").update({ running: false }).eq("id", 1);
      await event(sb, "warn", `האיסוף נעצר: נפח מסד הנתונים ${mb}MB הגיע לתקרה שהוגדרה (${ctl.max_db_mb}MB)`);
      return { stopped: "db size cap" };
    }
    const steps = [];
    const mainBudget = TICK_BUDGET_MS * 0.7;
    while (Date.now() - t0 < mainBudget) {
      const src = await nextSource(sb);
      if (!src) break;
      await sb.from("nr_control").update({ current_source: src.key }).eq("id", 1);
      const r = await step(sb, src, ctl.page_size);
      steps.push(r);
      if ("error" in r) break;
      if (src.kind !== "ckan" && src.kind !== "arcgis") break; // heavy single-shot adapters: one per tick
      await sleep(400); // polite pacing toward data.gov.il
    }
    let web = null;
    try { web = await crawlWebsites(sb, t0 + TICK_BUDGET_MS); } catch (e) { await event(sb, "error", "סריקת אתרים: " + (e as Error).message.slice(0, 200), "website_crawl"); }
    const n = await checkpoints(sb, ctl.checkpoints_done || []);
    const left = await nextSource(sb);
    if (!left) await sb.from("nr_control").update({ current_source: null }).eq("id", 1);
    return { steps, web, businesses: n, ms: Date.now() - t0 };
  } finally {
    await sb.rpc("nr_unlock");
  }
}

// ── discovery: scan data.gov.il catalog for new datasets that look like business lists ──
const DETECT: Record<string, RegExp> = {
  hp: /(ח\.?["״]?פ|מספר חברה|מספר תאגיד|מספר עוסק|מספר עמותה|company_?id|identitynumber|business_?(id|num)|registered_business_id|rasham_havarot|employer_number)/i,
  name: /(שם (ה)?(עסק|חברה|ספק|תאגיד|מעסיק|יצרן|יבואן|בעל|מפעל|ארגון|קבלן|ישות|מפעיל)|^name$|company|employer_name|business_?name|shem_?(yeshut|mosah|esek)|operator_nm)/i,
  phone: /(טלפון|^tel|phone|telefon|נייד|mobile)/i,
  email: /(מייל|דוא"?ל|email)/i,
};
async function discover(sb: SupabaseClient) {
  const { data: meta } = await sb.from("nr_sources").select("*").eq("key", "discovery_dgov").maybeSingle();
  const since = String(meta?.config?.last_scan || "2026-10-18T00:00:00Z");
  const started = new Date().toISOString();
  const { data: known } = await sb.from("nr_sources").select("config");
  const knownRids = new Set((known || []).map((k) => String((k.config as Record<string, unknown>)?.rid || "")).filter(Boolean));
  const fq = encodeURIComponent(`metadata_modified:[${since} TO *]`);
  const j = await fetchJson(`https://data.gov.il/api/3/action/package_search?rows=500&fq=${fq}`) as { result: { results: { name: string; title: string; organization?: { title: string }; license_title?: string; resources: { id: string; name: string; datastore_active: boolean }[] }[] } };
  let probed = 0, added = 0;
  for (const p of j.result.results) for (const r of p.resources || []) {
    if (!r.datastore_active || knownRids.has(r.id) || probed >= 60) continue;
    probed++;
    try {
      const f = await fetchJson(`${CKAN}?resource_id=${r.id}&limit=1`, {}, 30_000) as { result: { total: number; fields: { id: string }[] } };
      const fields = f.result.fields.map((x) => x.id);
      const m = Object.fromEntries(Object.entries(DETECT).map(([k, rx]) => [k, fields.filter((x) => rx.test(x))]));
      if (!m.name.length || !(m.hp.length || m.phone.length || m.email.length)) continue;
      await sb.from("nr_sources").upsert({
        key: "dgov:" + r.id.slice(0, 8), catalog_id: null, name: `${p.title} / ${r.name}`.slice(0, 200),
        url: `https://data.gov.il/dataset/${p.name}`, provider: p.organization?.title || "data.gov.il", kind: "discovered",
        data_types: Object.entries(m).filter(([, v]) => v.length).map(([k]) => k), terms: p.license_title || "data.gov.il – מידע ציבורי פתוח",
        status: "unsupported", status_reason: "התגלה בסריקה אוטומטית של data.gov.il – ממתין למיפוי שדות לפני איסוף", priority: 900,
        config: { rid: r.id, detected: m, total: f.result.total, discovered_at: started },
      }, { onConflict: "key", ignoreDuplicates: true });
      added++;
    } catch { /* skip unreachable resource */ }
  }
  await sb.from("nr_sources").update({ config: { ...(meta?.config || {}), last_scan: started }, last_run_at: started, records_read: (meta?.records_read || 0) + probed, status: "completed", status_reason: `סריקה אחרונה: ${probed} משאבים נבדקו, ${added} מקורות עסקיים חדשים נוספו לקטלוג` }).eq("key", "discovery_dgov");
  await event(sb, "info", `גילוי מקורות ב-data.gov.il: נבדקו ${probed} משאבים חדשים/מעודכנים, נוספו ${added} מקורות לקטלוג`, "discovery_dgov");
  return { probed, added };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: edgeCorsHeaders });
  const url = Deno.env.get("SUPABASE_URL") || "";
  if (!url.includes(STAGING_REF)) return jsonResponse({ ok: false, error: "staging only" }, 403);
  const auth = await requireAuth(req, { roles: ["super_admin", "fleet_manager"], allowInternal: true });
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({})) as { action?: string };
  const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    const action = body.action || "tick";
    if (action === "tick") return jsonResponse({ ok: true, ...(await tick(sb)) });
    if (action === "discover") return jsonResponse({ ok: true, ...(await discover(sb)) });
    return jsonResponse({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    await event(sb, "error", "collector: " + (e as Error).message.slice(0, 300)).catch(() => {});
    return jsonResponse({ ok: false, error: (e as Error).message }, 500);
  }
});
