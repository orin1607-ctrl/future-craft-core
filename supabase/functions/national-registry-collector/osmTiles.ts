// OpenStreetMap tile cross-match (STAGING). One or two small tiles per call, checkpointed on osm:tiles.
// Does not run the existing cat:27 category crawl. Creates no companies. Strict name agreement is applied in
// nr_apply_cross_rows. © OpenStreetMap contributors (ODbL).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { socialUrl } from "../_shared/socialUrl.ts";

const UA = "DaliaOpenProspector/1.0 (Israeli business registry research; staging; ODbL attribution)";
const OVERPASS = ["https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const SOCIAL: Record<string, string[]> = {
  facebook: ["contact:facebook", "facebook"],
  instagram: ["contact:instagram", "instagram"],
  linkedin: ["contact:linkedin", "linkedin"],
};

function normPhone(raw: string): string {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("972")) d = "0" + d.slice(3);
  if (d.length === 8 || (d.length === 9 && !d.startsWith("0"))) d = "0" + d;
  return /^0(5\d{8}|7\d{8}|[23489]\d{7})$/.test(d) || /^1(700|800|599)\d{6}$/.test(d) ? d : "";
}
function hostOf(raw: string): string {
  try { return new URL(/^https?:/i.test(raw) ? raw : "https://" + raw).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

type El = { type: string; id: number; tags?: Record<string, string> };

export async function stepOsmTiles(sb: SupabaseClient): Promise<Record<string, unknown>> {
  const { data: on, error: onErr } = await sb.rpc("nr_engine_on", { p_engine: "osm_cross" });
  if (onErr) throw new Error(onErr.message);
  if (on !== true) return { skipped: "stopped" };

  const { data: cat } = await sb.from("nr_sources").select("status,updated_at").eq("key", "cat:27").maybeSingle();
  if (cat?.status === "collecting" && cat.updated_at && Date.now() - Date.parse(cat.updated_at) < 120_000) {
    return { skipped: "cat27_active" };
  }

  const { data: src } = await sb.from("nr_sources").select("cursor,records_read,businesses_enriched,details_added,config,errors").eq("key", "osm:tiles").maybeSingle();
  if (!src) return { skipped: "no_source" };
  const cfg = (src.config || {}) as { south?: number; north?: number; west?: number; east?: number; dlat?: number; dlon?: number };
  const south0 = cfg.south ?? 29.45, north0 = cfg.north ?? 33.4, west0 = cfg.west ?? 34.22, east0 = cfg.east ?? 35.92;
  const dlat = cfg.dlat ?? 0.18, dlon = cfg.dlon ?? 0.18;
  const cols = Math.ceil((east0 - west0) / dlon);
  const rowsN = Math.ceil((north0 - south0) / dlat);
  const total = cols * rowsN;
  let idx = Number(src.cursor || 0);
  if (idx >= total) {
    await sb.from("nr_sources").update({ status: "completed", finished_at: new Date().toISOString(), status_reason: "כל אריחי ישראל נבדקו. © OpenStreetMap contributors", updated_at: new Date().toISOString() }).eq("key", "osm:tiles");
    return { done: true, tiles: total };
  }

  const t0 = Date.now();
  let matched = 0, review = 0, unmatched = 0, read = 0, tiles = 0;
  while (idx < total && tiles < 2 && Date.now() - t0 < 70_000) {
    const r = Math.floor(idx / cols), c = idx % cols;
    const south = south0 + r * dlat, west = west0 + c * dlon;
    const north = Math.min(north0, south + dlat), east = Math.min(east0, west + dlon);
    const q = `[out:json][timeout:40][bbox:${south},${west},${north},${east}];(nwr["name"]["phone"];nwr["name"]["contact:phone"];nwr["name"]["contact:mobile"];nwr["name"]["website"];nwr["name"]["contact:website"];nwr["name"]["contact:facebook"];nwr["name"]["facebook"];nwr["name"]["contact:instagram"];nwr["name"]["instagram"];nwr["name"]["contact:linkedin"];nwr["name"]["linkedin"];);out tags center;`;
    let elements: El[] | null = null;
    let lastErr = "";
    for (const ep of OVERPASS) {
      try {
        const res = await fetch(ep, {
          method: "POST",
          headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body: "data=" + encodeURIComponent(q),
          signal: AbortSignal.timeout(50_000),
        });
        if (!res.ok) { lastErr = new URL(ep).host + " HTTP " + res.status; continue; }
        elements = ((await res.json()) as { elements?: El[] }).elements || [];
        break;
      } catch (e) { lastErr = new URL(ep).host + ": " + (e as Error).message; }
    }
    if (!elements) {
      const progressed = idx > Number(src.cursor || 0);
      await sb.from("nr_sources").update({
        cursor: idx,
        records_read: Number(src.records_read || 0) + read,
        businesses_enriched: Number(src.businesses_enriched || 0) + matched,
        details_added: Number(src.details_added || 0) + review,
        errors: Number(src.errors || 0) + 1, last_error: lastErr.slice(0, 300), updated_at: new Date().toISOString(),
        ...(progressed ? { status: "collecting" } : {}),
        status_reason: "Overpass לא ענה. האריח שנכשל לא סומן כנבדק. אריחים שכבר נשמרו בסבב נשארים. © OpenStreetMap contributors",
      }).eq("key", "osm:tiles");
      return { ok: false, error: lastErr, tile: idx, saved_through: idx };
    }
    const out: Record<string, unknown>[] = [];
    for (const el of elements) {
      const t = el.tags || {};
      const name = t["name:he"] || t.name || "";
      if (!name) continue;
      const phones: { v: string; d: string; sub: string }[] = [];
      for (const k of ["phone", "contact:phone", "contact:mobile", "mobile"]) {
        for (const part of String(t[k] || "").split(/[;,]/)) {
          const p = normPhone(part);
          if (p && !phones.some((x) => x.v === p)) phones.push({ v: p, d: p, sub: p.startsWith("05") ? "mobile" : "main" });
        }
      }
      const socials: Record<string, string> = {};
      for (const [net, keys] of Object.entries(SOCIAL)) {
        for (const k of keys) {
          let v = String(t[k] || "").trim();
          if (!v || /groups\//i.test(v)) continue;
          if (!/^https?:\/\//i.test(v)) {
            v = net === "facebook" ? "https://www.facebook.com/" + v.replace(/^@/, "")
              : net === "instagram" ? "https://www.instagram.com/" + v.replace(/^@/, "")
              : net === "linkedin" ? "https://www.linkedin.com/company/" + v.replace(/^@/, "") : v;
          }
          const u = socialUrl(net, v);
          if (u && !/\/groups\//i.test(u)) { socials[net] = u; break; }
        }
      }
      const web = t.website || t["contact:website"] || t.url || "";
      const website = /^https?:\/\//i.test(web) ? web : "";
      if (!phones.length && !website && !Object.keys(socials).length) continue;
      out.push({
        rid: `${el.type}/${el.id}`,
        url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
        name, name_en: t["name:en"] || "",
        city: t["addr:city"] || "",
        address: [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" "),
        domain: /facebook\.|instagram\.|linkedin\.|youtube\.|google\.|wix\./i.test(hostOf(website)) ? "" : hostOf(website),
        phones, websites: website ? [website] : [], socials,
      });
    }
    read += out.length;
    for (let i = 0; i < out.length; i += 40) {
      const { data, error } = await sb.rpc("nr_apply_cross_rows", { p_source: "osm:tiles", p_rows: out.slice(i, i + 40) });
      if (error) throw new Error(error.message);
      const d = data as { matched?: number; review?: number; unmatched?: number };
      matched += Number(d?.matched || 0); review += Number(d?.review || 0); unmatched += Number(d?.unmatched || 0);
    }
    idx += 1; tiles += 1;
    await sb.from("nr_sources").update({
      status: "collecting", cursor: idx, updated_at: new Date().toISOString(),
      records_read: Number(src.records_read || 0) + read,
      businesses_enriched: Number(src.businesses_enriched || 0) + matched,
      details_added: Number(src.details_added || 0) + review,
    }).eq("key", "osm:tiles");
    if (out.length > 80) break;
  }
  const done = idx >= total;
  await sb.from("nr_sources").update({
    status: done ? "completed" : "collecting",
    cursor: idx,
    records_read: Number(src.records_read || 0) + read,
    businesses_enriched: Number(src.businesses_enriched || 0) + matched,
    details_added: Number(src.details_added || 0) + review,
    last_run_at: new Date().toISOString(),
    last_error: null,
    finished_at: done ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
    status_reason: `אריח ${idx}/${total}. בסבב: ${matched} נשמרו, ${review} לבדיקה, ${unmatched} בלי התאמה. לא סומנו עסקים שלא נבדקו. © OpenStreetMap contributors`,
  }).eq("key", "osm:tiles");
  await sb.rpc("nr_beat", { p_engine: "osm_cross", p_ok: true, p_msg: null });
  return { tile: idx, total, read, matched, review, unmatched, done };
}
