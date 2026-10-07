/* OpenProspector – Gemini enrichment: pure logic (no I/O).
 * Used by public/openprospector.html and the QA scripts.
 * Rules: a finding is "verified" only with a non-AI source AND a URL; OVDIM is never a safety officer;
 * fleet size is never estimated; nothing is written to a lead without a human approval.
 * Depends on window.OPQualify (openprospector-qualify.js).
 */
(function (root) {
  "use strict";
  const Q = () => root.OPQualify;

  const MAX_BATCH = 20;          // first batch is capped at 20 leads (DB enforces too)
  const MAX_ATTEMPTS = 2;        // one call per lead + at most one retry on a transient error
  const PRICES = { inputPer1M: null, outputPer1M: null }; // fill when the model's price is confirmed – no guess

  const ITEM_STATUS = {
    none: "לא בתור",
    queued: "ממתין להעשרה",
    running: "בתהליך",
    done: "הושלם – ממתין לאישור",
    failed: "נכשל",
    manual_review: "דורש בדיקה ידנית",
  };
  const DECISION_LABEL = { approved: "אושר", rejected: "נדחה", partial: "אושר חלקית" };

  /* fields Gemini may return -> prospect_leads column */
  const FIELD_COL = {
    website: "website", phone: "phone", email: "email", address: "address",
    contact_name: "contact_name", contact_role: "contact_role", contact_phone: "contact_phone",
    contact_email: "contact_email", contact_linkedin: "contact_linkedin", linkedin_company: "linkedin_company",
    fleet_exists: "fleet_exists", fleet_size: "fleet_size", fleet_types: "fleet_types",
    fleet_manager_name: "fleet_manager_name", safety_officer_name: "safety_officer_name",
  };
  const FIELD_LABEL = {
    website: "אתר", phone: "טלפון", email: "מייל", address: "כתובת", contact_name: "איש קשר", contact_role: "תפקיד",
    contact_phone: "טלפון איש קשר", contact_email: "מייל איש קשר", contact_linkedin: "LinkedIn איש קשר",
    linkedin_company: "LinkedIn חברה", fleet_exists: "צי רכב", fleet_size: "גודל צי", fleet_types: "סוגי רכבים",
    fleet_manager_name: "קצין רכב / מנהל צי", safety_officer_name: "קצין בטיחות",
  };
  const ALIAS = {
    linkedin: null, // resolved below (company vs person)
    fleet_manager: "fleet_manager_name", safety_officer: "safety_officer_name", contact: "contact_name",
    mail: "email", web: "website", site: "website", phone_primary: "phone", email_general: "email",
  };
  const STATUSES = ["found", "verified", "not_found"];
  const AI_SOURCE = /Gemini|\bAI\b|GPT|Claude|הערכה|הסקה|model|LLM/i;

  /* JSON Schema of the required Gemini answer (documented + enforced by validateResponse) */
  const RESPONSE_SCHEMA = {
    type: "object",
    required: ["company_hp", "findings"],
    properties: {
      company_hp: { type: "string" },
      findings: {
        type: "array",
        items: {
          type: "object",
          required: ["field", "status"],
          properties: {
            field: { enum: Object.keys(FIELD_COL) },
            value: {},
            source: { type: "string" },
            url: { type: "string" },
            status: { enum: STATUSES },
            evidence: { type: "string" },
            found_at: { type: "string" },
          },
        },
      },
      missing_fields: { type: "array", items: { type: "string" } },
      notes: { type: "string" },
    },
  };

  const has = (v) => v != null && String(v).trim() !== "" && String(v).trim() !== "לא נמצא";
  const norm = (s) => String(s || "").replace(/[\s"'~`׳״.\-–]/g, "").toLowerCase();
  const isUrl = (u) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(String(u || "").trim());
  const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || "").trim());
  const today = () => new Date().toISOString().slice(0, 10);

  function ovdimNames(row) {
    const out = [];
    if (row.certified_professional && row.certified_professional.name) out.push(row.certified_professional.name);
    const recs = row.registry_check && row.registry_check.contractors && row.registry_check.contractors.records;
    (Array.isArray(recs) ? recs : []).forEach((r) => r && r.ovdim && out.push(r.ovdim));
    return out.filter(Boolean);
  }
  /* token match tolerant to word order / ו-י spelling, same idea as the qualify rules */
  function sameName(a, b) {
    const toks = (s) => String(s || "").split(/[\s,;\-–]+/).map((t) => norm(t).replace(/[וי]/g, "")).filter((t) => t.length > 1);
    const A = toks(a), B = new Set(toks(b));
    return A.length > 0 && B.size > 0 && A.every((t) => B.has(t));
  }

  /* ---------- 1. eligibility & batch selection ---------- */
  /* row = prospect_leads row (snake_case, c.enr in the page); openLeadIds = leads already in an open batch */
  function eligibility(row, openLeadIds) {
    const q = Q().evaluate(row);
    if (!row.id) return { ok: false, reason: "אין מזהה ליד", q };
    if (openLeadIds && openLeadIds.has(row.id)) return { ok: false, reason: "כבר בתור העשרה", q };
    if (q.lead_stage === "rejected") return { ok: false, reason: "לא מתאים", q };
    if (q.rejected_reason) return { ok: false, reason: q.rejected_reason, q };
    return { ok: true, reason: "", q };
  }
  /* prefers: qualified/quality, phone present, contact missing, fleet not verified, company active */
  function scoreCandidate(row, q) {
    const fs = q.field_status;
    const active = (row.registry_check && row.registry_check.companies && row.registry_check.companies.status === "פעילה") ||
      row.company_active_status === "פעילה" || !!(row.registry_check && row.registry_check.contractors && row.registry_check.contractors.found);
    let s = 0;
    if (["qualified", "quality"].includes(q.lead_stage)) s += 50;
    if (fs.phone.s === "v") s += 20; else if (fs.phone.s === "f") s += 10;
    if (fs.contact_name.s === "n") s += 10;
    if (fs.fleet.s !== "v") s += 10;
    if (active) s += 10;
    return { s, active };
  }
  function selectBatch(rows, openLeadIds, max) {
    max = Math.min(max || MAX_BATCH, MAX_BATCH);
    const seenHp = new Set();
    const picked = [];
    rows
      .map((r) => ({ r, e: eligibility(r, openLeadIds) }))
      .filter(({ e }) => e.ok)
      .map(({ r, e }) => ({ r, q: e.q, ...scoreCandidate(r, e.q) }))
      .filter((x) => x.active && ["qualified", "quality"].includes(x.q.lead_stage) && x.q.field_status.phone.s !== "n")
      .sort((a, b) => b.s - a.s || String(a.r.company_name).localeCompare(String(b.r.company_name), "he"))
      .forEach((x) => {
        const hp = String(x.r.company_hp || "").trim();
        if (picked.length >= max || !hp || seenHp.has(hp)) return; // no duplicates
        seenHp.add(hp);
        picked.push(x.r);
      });
    return picked;
  }

  /* ---------- 2. payload for one lead (what is sent to the server prompt) ---------- */
  function buildPayload(row) {
    const q = Q().evaluate(row);
    const rc = row.registry_check || {};
    const recs = (rc.contractors && rc.contractors.records) || [];
    const ev = (Array.isArray(row.evidence) ? row.evidence : []).filter((e) => e && typeof e === "object" && !Array.isArray(e) && e.field);
    return {
      company_name: row.company_name || "",
      company_hp: String(row.company_hp || ""),
      address: row.address || "",
      city: row.city || "",
      website: row.website || "",
      phone: has(row.phone) ? row.phone : "",
      industry: row.industry || "",
      data_gov_il: {
        contractors_registry: recs.map((r) => ({ anaf: r.anaf || "", phone: r.phone || "", email: r.email || "" })).slice(0, 5),
        companies_registry: rc.companies ? { found: !!rc.companies.found, status: rc.companies.status || "" } : null,
      },
      /* OVDIM is passed so the model can avoid it – it is NOT a safety officer */
      certified_professional_not_safety_officer: ovdimNames(row).slice(0, 3),
      existing_evidence: ev.map((e) => ({ field: e.field, value: e.value, source: e.source, url: e.url, status: e.status })).slice(0, 20),
      missing_fields: q.missing_fields,
    };
  }

  /* ---------- 3. strict validation + guards ---------- */
  function extractJson(text) {
    if (text && typeof text === "object") return text;
    const t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    try { return JSON.parse(t); } catch (e) { /* fall through */ }
    const i = t.indexOf("{"), j = t.lastIndexOf("}");
    if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch (e) { /* invalid */ } }
    return null;
  }
  function coerceValue(field, v) {
    if (field === "fleet_exists") {
      if (v === true || /^(true|yes|כן|קיים)$/i.test(String(v).trim())) return true;
      if (v === false || /^(false|no|לא|אין)$/i.test(String(v).trim())) return false;
      return undefined;
    }
    if (field === "fleet_size") {
      const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d]/g, ""));
      return Number.isInteger(n) && n > 0 && n < 100000 ? n : undefined;
    }
    if (field === "fleet_types") {
      const arr = Array.isArray(v) ? v : String(v || "").split(/[,;،]/);
      const out = arr.map((x) => String(x).trim()).filter(Boolean).slice(0, 12);
      return out.length ? out : undefined;
    }
    const s = String(v == null ? "" : v).trim();
    if (!s) return undefined;
    if (field === "phone" || field === "contact_phone") return Q().validPhone(s) ? s : undefined;
    if (field === "email" || field === "contact_email") return isEmail(s) ? s.toLowerCase() : undefined;
    if (field === "website") return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/.*)?$/i.test(s) ? s : undefined;
    if (field === "contact_linkedin" || field === "linkedin_company") return /linkedin\.com\//i.test(s) ? s : undefined;
    return s.slice(0, 300);
  }
  const STATUS_RANK = { verified: 2, found: 1, not_found: 0 };

  /* returns { ok, error, findings, notFound, missing_fields, notes, warnings, needsReview } – never throws */
  function validateResponse(text, row) {
    const res = { ok: false, error: "", findings: [], notFound: [], missing_fields: [], notes: "", warnings: [], needsReview: false };
    const j = extractJson(text);
    if (!j || typeof j !== "object" || Array.isArray(j)) { res.error = "נכשל – תשובה לא תקינה (JSON)"; return res; }
    if (!Array.isArray(j.findings)) { res.error = "נכשל – תשובה לא תקינה (חסר findings)"; return res; }
    const hp = String(row.company_hp || "").replace(/\D/g, "");
    if (j.company_hp != null && String(j.company_hp).replace(/\D/g, "") !== hp) { res.error = "נכשל – ח.פ. בתשובה לא תואם לליד"; return res; }

    const ovdim = ovdimNames(row);
    const best = {};
    j.findings.forEach((f, i) => {
      if (!f || typeof f !== "object") { res.warnings.push(`פריט ${i + 1}: לא אובייקט – נדחה`); return; }
      let field = String(f.field || "").trim();
      if (field in ALIAS) field = ALIAS[field] || (has(f.person) || /\/in\//i.test(String(f.value || "")) ? "contact_linkedin" : "linkedin_company");
      if (!(field in FIELD_COL)) { res.warnings.push(`שדה לא מוכר "${field}" – נדחה`); return; }
      const status = STATUSES.includes(f.status) ? f.status : null;
      if (!status) { res.warnings.push(`${FIELD_LABEL[field]}: סטטוס לא תקין – נדחה`); return; }
      if (status === "not_found") { res.notFound.push(field); return; }
      const value = coerceValue(field, f.value);
      if (value === undefined) { res.warnings.push(`${FIELD_LABEL[field]}: ערך לא תקין ("${String(f.value).slice(0, 40)}") – נדחה`); res.needsReview = true; return; }
      const source = String(f.source || "").trim().slice(0, 200);
      let url = String(f.url || "").trim();
      if (url && !isUrl(url)) { res.warnings.push(`${FIELD_LABEL[field]}: כתובת מקור לא תקינה – הוסרה`); url = ""; }
      const g = { field, value, source, url, status, evidence: String(f.evidence || "").slice(0, 400), found_at: String(f.found_at || today()).slice(0, 10), reasons: [] };

      /* guards */
      if (g.status === "verified" && (!g.source || !g.url)) { g.status = "found"; g.reasons.push("אין מקור + URL – לא מאומת"); }
      if (g.status === "verified" && (AI_SOURCE.test(g.source) || AI_SOURCE.test(g.url))) { g.status = "found"; g.reasons.push("מקור AI בלבד – לא מאומת"); }
      if (field === "safety_officer_name") {
        if (ovdim.some((n) => sameName(g.value, n) || sameName(n, g.value))) {
          res.warnings.push(`קצין בטיחות "${g.value}" זהה לאיש המקצוע (OVDIM) – נדחה`); res.needsReview = true; return;
        }
        if (g.status === "verified" && Q().NOT_SAFETY_PROOF.test(`${g.source} ${g.url}`)) { g.status = "found"; g.reasons.push("המקור אינו הוכחה לקצין בטיחות"); }
      }
      /* Material fields require an official / government or official company site to be verified */
      if (["safety_officer_name", "contact_role"].includes(field) && g.status === "verified") {
        const isOfficial = /gov\.il|court|רשם החברות|פנקס הקבלנים|משרד התחבורה|אתר רשמי|אתר החברה/i.test(`${g.source} ${g.url}`);
        if (!isOfficial) {
          g.status = "found";
          g.reasons.push("מידע מהותי ממקור שאינו רשמי – נדרש אימות ממקור רשמי");
        }
      }
      if (field === "fleet_size" && g.status !== "verified") g.reasons.push("גודל צי ללא מקור מאומת – לא יוצג כמאומת");
      if (!g.source && !g.url) g.reasons.push("ללא מקור – נמצא, דורש אימות");
      const cur = best[field];
      if (!cur || STATUS_RANK[g.status] > STATUS_RANK[cur.status]) best[field] = g;
    });
    res.findings = Object.values(best);
    res.missing_fields = Array.isArray(j.missing_fields) ? j.missing_fields.map(String).slice(0, 30) : [];
    res.notes = String(j.notes || "").slice(0, 1000);
    res.ok = true;
    return res;
  }

  /* ---------- 4. before / after + approval patch ---------- */
  function currentValue(row, field) {
    const v = row[FIELD_COL[field]];
    if (field === "fleet_types") return Array.isArray(v) && v.length ? v : null;
    if (field === "fleet_exists") return v === true || v === false ? v : null;
    return has(v) ? v : null;
  }
  const show = (v) => (v == null ? "" : Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "כן" : "לא") : String(v));
  function sameValue(field, a, b) {
    if (field === "phone" || field === "contact_phone") return Q().normPhone(a) === Q().normPhone(b);
    return norm(show(a)) === norm(show(b));
  }
  /* change type per finding: "new" (empty -> value), "same", "conflict" (existing different value – never overwritten) */
  function diff(row, findings) {
    return findings.map((f) => {
      const before = currentValue(row, f.field);
      const change = before == null ? "new" : sameValue(f.field, before, f.value) ? "same" : "conflict";
      return { ...f, before, change };
    });
  }
  /* approved findings -> { patch, evidence, conflicts }. Never overwrites an existing value. */
  function buildPatch(row, approved, meta) {
    meta = meta || {};
    const patch = {}, evidence = [], conflicts = [];
    diff(row, approved).forEach((f) => {
      if (f.change === "conflict") { conflicts.push({ field: f.field, before: f.before, found: f.value, source: f.source, url: f.url }); return; }
      if (f.change === "new") patch[FIELD_COL[f.field]] = f.value;
      if (f.field === "safety_officer_name" && f.change === "new") { patch.safety_officer_source = [f.source, f.url].filter(Boolean).join(" · ") || null; patch.safety_officer_verified = false; }
      if (f.field === "fleet_manager_name" && f.change === "new") patch.fleet_manager_source = [f.source, f.url].filter(Boolean).join(" · ") || null;
      evidence.push({ field: f.field, value: f.value, source: f.source, url: f.url, status: f.status, found_at: f.found_at, by: "gemini", model: meta.model || "", batch_id: meta.batchId || "" });
    });
    return { patch, evidence, conflicts };
  }

  /* ---------- 5. batch summary & cost ---------- */
  function summarize(items) {
    const s = { total: items.length, queued: 0, running: 0, done: 0, failed: 0, manual_review: 0, approved: 0, rejected: 0,
      phones: 0, emails: 0, websites: 0, contacts: 0, fleetIndication: 0, fleetSizeVerified: 0, officers: 0, tokens: 0, requests: 0, unsourced: 0 };
    items.forEach((it) => {
      s[it.status] = (s[it.status] || 0) + 1;
      if (it.decision === "approved" || it.decision === "partial") s.approved++;
      if (it.decision === "rejected") s.rejected++;
      s.tokens += it.tokens_used || 0;
      s.requests += it.request_count || 0;
      const f = (it.findings && it.findings.findings) || [];
      const by = (k) => f.find((x) => x.field === k);
      if (by("phone") || by("contact_phone")) s.phones++;
      if (by("email") || by("contact_email")) s.emails++;
      if (by("website")) s.websites++;
      if (by("contact_name")) s.contacts++;
      if (by("fleet_exists") && by("fleet_exists").value === true) s.fleetIndication++;
      if (by("fleet_size") && by("fleet_size").status === "verified") s.fleetSizeVerified++;
      if (by("safety_officer_name") || by("fleet_manager_name")) s.officers++;
      s.unsourced += f.filter((x) => !x.source || !x.url).length;
    });
    return s;
  }
  function estimateCost(usage) {
    if (!usage || PRICES.inputPer1M == null || PRICES.outputPer1M == null) return null;
    const inp = usage.promptTokenCount || 0, out = (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0);
    return Math.round(((inp * PRICES.inputPer1M + out * PRICES.outputPer1M) / 1e6) * 10000) / 10000;
  }
  /* transient = worth one retry; billing / quota / auth stop the batch */
  function classifyError(http, reason) {
    if (http === 402) return { stop: true, retry: false, label: "💳 נדרש תשלום / קרדיט בפרויקט Gemini" };
    if (http === 429) return { stop: true, retry: false, label: "⚠️ המכסה הסתיימה / Quota exceeded" };
    if (http === 401 || http === 403) return { stop: true, retry: false, label: "❌ אין הרשאה – נדרש super_admin מחובר" };
    if (http === 404) return { stop: true, retry: false, label: "❌ המודל לא זמין" };
    if (http === 400 && /API_KEY|API key/i.test(String(reason || ""))) return { stop: true, retry: false, label: "❌ מפתח Gemini לא תקין" };
    if (!http || http >= 500) return { stop: false, retry: true, label: "❌ Gemini לא זמין כרגע" };
    return { stop: false, retry: false, label: `❌ שגיאה (HTTP ${http})` };
  }

  root.OPEnrich = {
    MAX_BATCH, MAX_ATTEMPTS, PRICES, ITEM_STATUS, DECISION_LABEL, FIELD_COL, FIELD_LABEL, RESPONSE_SCHEMA,
    eligibility, selectBatch, buildPayload, extractJson, validateResponse, diff, buildPatch, summarize, estimateCost, classifyError, show,
  };
})(typeof window !== "undefined" ? window : globalThis);
