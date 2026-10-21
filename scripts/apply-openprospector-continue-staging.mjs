// Apply the strict-cross migration to STAGING only, after a dump outside this public repo.
// Refuses Production (qasomfndnjuixgjmjwcm) and any other project.
// Does not enable osm_cross or wd_bulk. Does not print secrets.
//
//   STAGING_SUPABASE_DB_PASSWORD=... node scripts/apply-openprospector-continue-staging.mjs --dump-dir /path/outside/repo
// Add --apply only after the dump file exists and its size is greater than 1 MB.
import { spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STAGING_REF = "usfeoerkpcafxxlyuldl";
const PRODUCTION_REF = "qasomfndnjuixgjmjwcm";
const here = dirname(fileURLToPath(import.meta.url));
const migration = resolve(here, "../supabase/migrations/20261022001000_national_registry_strict_cross_staging.sql");
const dumpDirArg = process.argv[process.argv.indexOf("--dump-dir") + 1];
const apply = process.argv.includes("--apply");
const password = (process.env.STAGING_SUPABASE_DB_PASSWORD || "").trim();

if (!password) {
  console.error("Missing STAGING_SUPABASE_DB_PASSWORD. Nothing was changed.");
  process.exit(1);
}
if (!dumpDirArg || dumpDirArg.startsWith("-")) {
  console.error("Pass --dump-dir pointing outside the git repository. Nothing was changed.");
  process.exit(1);
}
const dumpDir = resolve(dumpDirArg);
if (dumpDir.startsWith(resolve(here, "..") + "/") || dumpDir === resolve(here, "..")) {
  console.error("Dump directory is inside the repository. Refusing.");
  process.exit(1);
}

const host = `db.${STAGING_REF}.supabase.co`;
if (host.includes(PRODUCTION_REF) || STAGING_REF === PRODUCTION_REF) {
  console.error("Refusing production.");
  process.exit(1);
}
const url = `postgresql://postgres:${encodeURIComponent(password)}@${host}:5432/postgres`;
mkdirSync(dumpDir, { recursive: true });
const dumpFile = join(dumpDir, `staging-nr-before-strict-cross-${new Date().toISOString().replace(/[:.]/g, "")}.dump`);
console.log("Dumping staging national-registry tables to a private directory (path not printed).");
const dump = spawnSync("pg_dump", [
  "--format=custom", "--no-owner", "--no-privileges",
  "--table=public.nr_businesses", "--table=public.nr_contact_points", "--table=public.nr_people",
  "--table=public.nr_sources", "--table=public.nr_findings", "--table=public.nr_site_queue",
  "--table=public.nr_runs", "--table=public.nr_social_runs", "--table=public.nr_events",
  url, "--file", dumpFile,
], { stdio: "inherit" });
if (dump.status !== 0) {
  console.error("Dump failed. Migration was not applied.");
  process.exit(dump.status || 1);
}
const size = statSync(dumpFile).size;
if (size < 1_000_000) {
  console.error("Dump is smaller than 1 MB. Migration was not applied.");
  process.exit(1);
}
console.log("Dump bytes:", size);
if (!apply) {
  console.log("Dump verified by size. Re-run with --apply to install the migration. Engines stay off.");
  process.exit(0);
}
const applied = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-f", migration], { stdio: "inherit" });
if (applied.status !== 0) process.exit(applied.status || 1);
console.log("Migration applied on staging. osm_cross and wd_bulk stay off until nr_set_engine.");
