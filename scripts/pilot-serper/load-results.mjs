// results.jsonl → op_test.serper_pilot_result (test schema, STAGING) + a summary per group. Never touches nr_* tables.
//   node scripts/pilot-serper/load-results.mjs <data dir> [--mock]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const DIR = process.argv[2];
const MOCK = process.argv.includes("--mock");
if (!DIR) throw new Error("data dir required");
if (fs.readFileSync("supabase/.temp/project-ref", "utf8").trim() !== "usfeoerkpcafxxlyuldl") throw new Error("not linked to STAGING");
const rows = fs.readFileSync(path.join(DIR, MOCK ? "results-mock.jsonl" : "results.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const q = (v) => v === null || v === undefined ? "null" : "'" + String(v).replace(/'/g, "''") + "'";
const run = MOCK ? "mock" : "serper1000";
const vals = rows.map((r) => {
  const f = r.found_on_site || {};
  const n = (k) => (f[k] || []).length;
  return `(${q(run)},${r.business_id},${q(r.grp)},${q(r.query)},${r.serp_n ?? "null"},${q(r.kg_site)},${q(r.verified_domain)},${q(r.verified_why)},${q(r.review_domain)},` +
    `${n("facebook")},${n("instagram")},${n("linkedin")},${n("whatsapp")},${n("emails")},${(r.serp_social_candidates || []).length},${q(JSON.stringify(r.candidates || []))}::jsonb,${q(r.error)},${r.ms | 0})`;
});
let sql = `create table if not exists op_test.serper_pilot_result (run text, business_id bigint, grp text, query text, serp_n int, kg_site text,
  verified_domain text, verified_why text, review_domain text, fb int, ig int, li int, wa int, emails int, serp_social int, candidates jsonb,
  error text, ms int, loaded_at timestamptz default now(), primary key (run, business_id));
delete from op_test.serper_pilot_result where run = ${q(run)};\n`;
for (let i = 0; i < vals.length; i += 300) sql += `insert into op_test.serper_pilot_result (run,business_id,grp,query,serp_n,kg_site,verified_domain,verified_why,review_domain,fb,ig,li,wa,emails,serp_social,candidates,error,ms) values\n${vals.slice(i, i + 300).join(",\n")};\n`;
sql += `select grp, count(*) companies, count(*) filter (where error is not null) errors, count(verified_domain) verified_site,
  round(100.0 * count(verified_domain) / count(*), 1) pct, count(review_domain) for_review,
  count(*) filter (where fb + ig + li > 0) with_social_on_site, count(*) filter (where emails > 0) with_email_on_site,
  count(*) filter (where serp_social > 0) social_candidates_in_search
  from op_test.serper_pilot_result where run = ${q(run)} group by rollup(grp) order by grp nulls last;`;
const f = path.join(DIR, ".load.sql");
fs.writeFileSync(f, sql);
const out = execFileSync("supabase", ["db", "query", "--linked", "-o", "table", "-f", `"${f}"`], { encoding: "utf8", shell: true, maxBuffer: 1 << 28 });
fs.unlinkSync(f);
console.log(out.split("\n").filter((l) => !/new version|recommend|Initialising/.test(l)).join("\n"));
