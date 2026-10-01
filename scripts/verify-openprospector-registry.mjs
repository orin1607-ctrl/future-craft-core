#!/usr/bin/env node
/**
 * OpenProspector – verify prospect_leads against free official registries (STAGING ONLY).
 *
 * Sources (data.gov.il, free, read-only):
 *   - Contractors registry  (resource 4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8): phone, email, branch, OVDIM
 *   - Companies registrar   (resource f004176c-b85f-4542-8901-7b3176f9a054): company status (פעילה / ...)
 *
 * Writes ONLY the enrichment/qualification columns added in
 * 20261001120000_openprospector_enrichment_staging.sql. Never inserts, deletes or
 * overwrites the original lead columns. Never estimates fleet size.
 *
 * Usage:
 *   node scripts/verify-openprospector-registry.mjs            # dry run -> report JSON only
 *   node scripts/verify-openprospector-registry.mjs --apply    # PATCH Supabase STAGING
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STAGING_REF = "usfeoerkpcafxxlyuldl";
const SUPABASE_URL = `https://${STAGING_REF}.supabase.co`;
// Public anon key of STAGING (same key the page ships with)
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzZmVvZXJrcGNhZnh4bHl1bGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ4NTYsImV4cCI6MjA5NDY5MDg1Nn0.Z1AsULSK9fNsVwjw7iRP_DkSodeTUdtb-eB5s66qtJU";
const CONTRACTORS_RES = "4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8";
const COMPANIES_RES = "f004176c-b85f-4542-8901-7b3176f9a054";
const APPLY = process.argv.includes("--apply");

await import(pathToFileURL(path.join(__dirname, "..", "public", "openprospector-qualify.js")).href);
const { evaluate } = globalThis.OPQualify;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sbHeaders = { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" };

async function govSearch(resource, filters, attempt = 1) {
  const url = `https://data.gov.il/api/3/action/datastore_search?resource_id=${resource}&limit=50&filters=${encodeURIComponent(JSON.stringify(filters))}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "dalia-openprospector-staging-verify" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    if (!j.success) throw new Error("API success=false");
    return j.result.records || [];
  } catch (e) {
    if (attempt < 4) { await sleep(800 * attempt); return govSearch(resource, filters, attempt + 1); }
    throw e;
  }
}

async function loadLeads() {
  const cols = "id,company_hp,company_name,industry,phone,email,website,fleet_type,status,certified_professional,safety_officer," +
    "contact_name,contact_role,fleet_exists,fleet_size,fleet_types,fleet_manager_name,fleet_manager_source," +
    "safety_officer_name,safety_officer_source,safety_officer_verified,verification_date,field_status,registry_check,lead_stage,rejected_reason";
  const res = await fetch(`${SUPABASE_URL}/rest/v1/prospect_leads?select=${cols}&order=lead_number.asc&limit=5000`, { headers: sbHeaders });
  if (!res.ok) throw new Error(`Supabase load failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function checkRegistry(hp) {
  const out = { checked_at: new Date().toISOString(), contractors: { found: false, records: [], resource: CONTRACTORS_RES }, companies: { found: false, resource: COMPANIES_RES } };
  const conRecs = await govSearch(CONTRACTORS_RES, { MISPAR_YESHUT: String(hp) });
  out.contractors.found = conRecs.length > 0;
  out.contractors.records = conRecs.map((r) => ({
    name: String(r.SHEM_YESHUT || "").trim(),
    kablan_no: String(r.MISPAR_KABLAN || "").trim(),
    anaf: String(r.TEUR_ANAF || "").trim(),
    kod_anaf: String(r.KOD_ANAF || "").trim(),
    kvutza: String(r.KVUTZA || "").trim(),
    sivug: String(r.SIVUG || "").trim(),
    phone: String(r.MISPAR_TEL || "").trim(),
    email: String(r.EMAIL || "").trim(),
    ovdim: String(r.OVDIM || "").trim(),
    city: String(r.SHEM_YISHUV || "").trim(),
    street: String(r.SHEM_REHOV || "").trim(),
    house: String(r.MISPAR_BAIT || "").trim(),
  }));
  if (/^\d{8,9}$/.test(String(hp))) {
    const coRecs = await govSearch(COMPANIES_RES, { "מספר חברה": Number(hp) });
    if (coRecs.length) {
      const c = coRecs[0];
      out.companies = { found: true, resource: COMPANIES_RES, name: c["שם חברה"] || "", status: c["סטטוס חברה"] || "", sub_status: c["תת סטטוס"] || "", type: c["סוג תאגיד"] || "", city: c["שם עיר"] || "" };
    }
  }
  return out;
}

function buildPatch(row, reg, today) {
  const q = evaluate({ ...row, registry_check: reg, verification_date: today });
  const regPhones = [...new Set(reg.contractors.records.map((r) => globalThis.OPQualify.normPhone(r.phone)).filter((p) => p.length >= 9))];
  const primary = globalThis.OPQualify.normPhone(row.phone);
  const secondary = regPhones.find((p) => p !== primary) || null;
  // Safety officer: only carried over when the stored record names a person (never OVDIM); never marked verified here
  const so = row.safety_officer || {};
  const soName = so.name && !/^טרם/.test(so.name) ? so.name : null;
  return {
    registry_check: reg,
    company_active_status: q.company_active_status,
    phone_secondary: secondary,
    fleet_size_status: q.fleet_size_status,
    fleet_evidence: q.relevant ? [{ type: "activity_branch", s: "f", val: q.field_status.relevance.val, src: "פנקס הקבלנים (data.gov.il)", note: "אינדיקציה בלבד – לא הוכחת צי" }] : [],
    safety_officer_name: row.safety_officer_name || soName,
    safety_officer_source: row.safety_officer_source || (soName ? so.source || null : null),
    verification_status: q.verification_status,
    verification_date: today,
    missing_fields: q.missing_fields,
    source_list: q.source_list,
    field_status: q.field_status,
    tier: q.tier,
    lead_stage: q.lead_stage,
    lead_quality: q.lead_quality,
    ready_for_contact: q.ready_for_contact,
    rejected_reason: q.rejected_reason,
  };
}

async function patchRow(id, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/prospect_leads?id=eq.${id}`, { method: "PATCH", headers: { ...sbHeaders, Prefer: "return=minimal" }, body: JSON.stringify(patch) });
  if (!res.ok) throw new Error(`PATCH ${id} failed: ${res.status} ${await res.text()}`);
}

const rows = await loadLeads();
console.log(`Loaded ${rows.length} leads from STAGING (${STAGING_REF}). Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
const today = new Date().toISOString().slice(0, 10);
const report = { total: rows.length, stages: {}, verification: {}, notInRegistry: [], inactive: [], warnings: 0, errors: [] };
let i = 0;
const CONCURRENCY = 4;
const queue = rows.slice();
async function worker() {
  while (queue.length) {
    const row = queue.shift();
    try {
      const reg = await checkRegistry(row.company_hp);
      const patch = buildPatch(row, reg, today);
      report.stages[patch.lead_stage] = (report.stages[patch.lead_stage] || 0) + 1;
      report.verification[patch.verification_status] = (report.verification[patch.verification_status] || 0) + 1;
      if (!reg.contractors.found && !reg.companies.found) report.notInRegistry.push(`${row.company_hp} ${row.company_name}`);
      if (reg.companies.found && reg.companies.status !== "פעילה") report.inactive.push(`${row.company_hp} ${row.company_name}: ${reg.companies.status}`);
      report.warnings += patch.field_status.warnings.length;
      if (APPLY) await patchRow(row.id, patch);
    } catch (e) {
      report.errors.push(`${row.company_hp}: ${e.message}`);
    }
    if (++i % 50 === 0) console.log(`  ${i}/${rows.length}`);
    await sleep(120);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const outDir = path.join(__dirname, "..", "backups");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `openprospector-registry-verify-${today}${APPLY ? "-applied" : "-dryrun"}.json`);
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, notInRegistry: report.notInRegistry.length, inactive: report.inactive }, null, 2));
console.log(`Report: ${outFile}`);
if (report.errors.length) process.exitCode = 1;
