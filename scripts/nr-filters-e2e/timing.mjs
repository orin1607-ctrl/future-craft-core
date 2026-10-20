import { createClient } from "@supabase/supabase-js";
import { getSession } from "./session.mjs";
const { session, anon, url } = await getSession();
const sb = createClient(url, anon, { global: { headers: { Authorization: "Bearer " + session.access_token } }, auth: { persistSession: false } });
const can = await sb.rpc("nr_can_read"); console.log("nr_can_read as regular user:", can.data, can.error?.message || "");
const cases = JSON.parse(process.argv[2]);
for (const [label, f, sort, page] of cases) {
  const t0 = Date.now();
  const r = await sb.rpc("nr_browse", { p_filters: { hide_archived: true, ...f }, p_sort: sort || "sources", p_page: page || 1, p_page_size: 50 });
  const ms = Date.now() - t0;
  console.log(`${String(ms).padStart(6)} ms  ${label.padEnd(34)} ${r.error ? "ERROR " + r.error.message : `total=${r.data.total}${r.data.total_exact === false ? "~" : ""} rows=${r.data.rows.length}`}`);
}
