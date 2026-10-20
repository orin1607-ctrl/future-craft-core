import { createClient } from "@supabase/supabase-js";
import { getSession } from "./session.mjs";
const { session, anon, url } = await getSession();
const sb = createClient(url, anon, { global: { headers: { Authorization: "Bearer " + session.access_token } }, auth: { persistSession: false } });
for (const fn of ["nr_stats", "nr_facets", "nr_industry_summary"]) { const t0 = Date.now(); const r = await sb.rpc(fn); console.log(fn, Date.now() - t0, "ms", r.error ? r.error.message : fn === "nr_stats" ? `businesses=${r.data.businesses} counts_at=${r.data.counts_at}` : "ok"); }
