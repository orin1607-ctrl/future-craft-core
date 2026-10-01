/* OpenProspector – lead verification & qualification rules.
 * Shared by public/openprospector.html and scripts/verify-openprospector-registry.mjs.
 * Pure functions over a prospect_leads row (snake_case). No I/O, no estimates:
 * a value is "v" only when it matches an official registry or was verified manually.
 */
(function (root) {
  "use strict";

  const STAGES = [
    ["basic", "רשומה בסיסית"],
    ["review", "ליד לבדיקה"],
    ["verified", "ליד מאומת"],
    ["qualified", "ליד מתאים"],
    ["quality", "ליד איכותי"],
    ["ready", "מוכן לפנייה"],
    ["rejected", "לא מתאים"],
  ];
  const STAGE_LABEL = Object.fromEntries(STAGES);

  const FLEET_SIZE_LABEL = {
    verified: "גודל צי מאומת",
    exists_size_unknown: "צי קיים – גודל לא ידוע",
    indication_needs_verification: "אינדיקציה לצי – דורש אימות",
    unknown: "אין מידע על צי",
  };

  const FIELD_STATUS_LABEL = { v: "מאומת", f: "נמצא – דורש אימות", n: "חסר" };

  const FIELDS = [
    ["company", "חברה (רישום רשמי)", "required"],
    ["hp", "ח.פ.", "required"],
    ["source", "מקור", "required"],
    ["phone", "טלפון", "required"],
    ["fleet", "צי רכב", "required"],
    ["relevance", "רלוונטיות לדליה", "required"],
    ["email", "מייל", "desired"],
    ["website", "אתר", "desired"],
    ["contact_name", "איש קשר", "desired"],
    ["contact_role", "תפקיד", "desired"],
    ["fleet_size", "גודל צי", "desired"],
    ["fleet_types", "סוגי כלי רכב", "desired"],
    ["fleet_manager", "קצין רכב / מנהל צי", "desired"],
    ["safety_officer", "קצין בטיחות", "desired"],
    ["verification_date", "תאריך אימות", "info"],
  ];

  const SRC_CONTRACTORS = "פנקס הקבלנים (data.gov.il)";
  const SRC_COMPANIES = "רשם החברות (data.gov.il)";
  const SRC_MANUAL = "אימות ידני";

  /* OVDIM, contractor licence, fleet guesses and AI are never proof of a safety officer */
  const NOT_SAFETY_PROOF = /OVDIM|פנקס הקבלנים|איש מקצוע כשיר|Gemini|\bAI\b|הערכה/i;

  /* Activity that plausibly runs heavy vehicles / machinery – an indication only, never proof */
  const RELEVANT_RE = /כביש|תשתי|פיתוח|עפר|חפיר|חציב|הובל|שינוע|היסע|אוטובוס|תחבור|צמ"?ה|משאי|מנוף|סלילה|גשר|מחצב|לוגיסט/;

  const digits = (s) => String(s || "").replace(/\D/g, "");
  function normPhone(s) {
    let d = digits(s);
    if (d.startsWith("972")) d = "0" + d.slice(3);
    if (d.length === 8 || d.length === 9) d = d.startsWith("0") ? d : "0" + d;
    return d;
  }
  /* Israeli landline (0X-XXXXXXX), mobile (05X-XXXXXXX) or 07X */
  const validPhone = (s) => /^0(?:5\d{8}|7\d{8}|[2-489]\d{7})$/.test(normPhone(s));
  const normName = (s) => String(s || "").replace(/[\s"'~`׳״.-]/g, "");
  const has = (s) => !!String(s == null ? "" : s).trim() && String(s).trim() !== "לא נמצא";

  function fieldOf(s, val, src) {
    return { s, val: val == null ? "" : val, src: src || "" };
  }

  function evaluate(row, opts) {
    row = row || {};
    opts = opts || {};
    const reg = row.registry_check || {};
    const con = reg.contractors || {};
    const co = reg.companies || {};
    const conRecs = Array.isArray(con.records) ? con.records : [];
    const manual = (row.field_status && row.field_status.manual) || {};
    const fs = {};
    const warnings = [];

    const inContractors = !!con.found;
    const inCompanies = !!co.found;
    const registryConfirmed = inContractors || inCompanies;

    // company + active status
    const companyActive = co.status ? co.status === "פעילה" : null;
    fs.company = registryConfirmed
      ? fieldOf("v", row.company_name, [inCompanies && SRC_COMPANIES, inContractors && SRC_CONTRACTORS].filter(Boolean).join(" + "))
      : fieldOf("f", row.company_name, "רשומה קיימת – לא אותרה ברשם/בפנקס");
    fs.hp = has(row.company_hp)
      ? fieldOf(registryConfirmed ? "v" : "f", row.company_hp, registryConfirmed ? fs.company.src : "")
      : fieldOf("n");

    const sources = [];
    if (inContractors) sources.push(SRC_CONTRACTORS);
    if (inCompanies) sources.push(SRC_COMPANIES);
    if (Object.keys(manual).length) sources.push(SRC_MANUAL);
    fs.source = sources.length ? fieldOf("v", sources.join(" + ")) : fieldOf("f", "נתוני רשומה בלבד");

    // phone: verified only when it matches the official contractors registry (or manual check)
    const regPhones = conRecs.map((r) => normPhone(r.phone)).filter((p) => p.length >= 9);
    const phone = normPhone(row.phone);
    if (!has(row.phone) || !validPhone(row.phone)) fs.phone = fieldOf("n", has(row.phone) ? row.phone + " (לא תקין)" : "");
    else if (manual.phone) fs.phone = fieldOf("v", row.phone, `${SRC_MANUAL} (${manual.phone.by || ""} ${manual.phone.at || ""})`.trim());
    else if (regPhones.includes(phone)) fs.phone = fieldOf("v", row.phone, SRC_CONTRACTORS);
    else fs.phone = fieldOf("f", row.phone, "לא תואם לפנקס הקבלנים");

    // email
    const regMails = conRecs.map((r) => String(r.email || "").trim().toLowerCase()).filter(Boolean);
    const mail = String(row.email || "").trim().toLowerCase();
    if (!mail) fs.email = fieldOf("n");
    else if (manual.email) fs.email = fieldOf("v", row.email, SRC_MANUAL);
    else if (regMails.includes(mail)) fs.email = fieldOf("v", row.email, SRC_CONTRACTORS);
    else fs.email = fieldOf("f", row.email, "לא תואם לפנקס הקבלנים");

    fs.website = has(row.website) ? fieldOf(manual.website ? "v" : "f", row.website, manual.website ? SRC_MANUAL : "") : fieldOf("n");
    fs.contact_name = has(row.contact_name) ? fieldOf(manual.contact ? "v" : "f", row.contact_name, manual.contact ? SRC_MANUAL : "") : fieldOf("n");
    fs.contact_role = has(row.contact_role) ? fieldOf(manual.contact ? "v" : "f", row.contact_role, manual.contact ? SRC_MANUAL : "") : fieldOf("n");

    // relevance – activity branches from the registry, else stored industry/name
    const activityText = [conRecs.map((r) => r.anaf).join(" "), row.industry, row.company_name, row.fleet_type].join(" ");
    const relevant = RELEVANT_RE.test(activityText);
    fs.relevance = relevant ? fieldOf(conRecs.length ? "v" : "f", conRecs.map((r) => r.anaf).filter(Boolean).join(", ") || row.industry) : fieldOf("n");

    // fleet – never inferred as fact; size is never estimated
    let fleetSizeStatus;
    if (manual.fleet && row.fleet_exists === true) {
      fs.fleet = fieldOf("v", "צי קיים", `${SRC_MANUAL} (${manual.fleet.by || ""} ${manual.fleet.at || ""})`.trim());
      fleetSizeStatus = Number.isInteger(row.fleet_size) && row.fleet_size > 0 ? "verified" : "exists_size_unknown";
    } else if (row.fleet_exists === false && manual.fleet) {
      fs.fleet = fieldOf("n", "אין צי (אומת ידנית)", SRC_MANUAL);
      fleetSizeStatus = "unknown";
    } else if (relevant) {
      fs.fleet = fieldOf("f", FLEET_SIZE_LABEL.indication_needs_verification, "תחום פעילות בפנקס");
      fleetSizeStatus = "indication_needs_verification";
    } else {
      fs.fleet = fieldOf("n");
      fleetSizeStatus = "unknown";
    }
    fs.fleet_size = fleetSizeStatus === "verified" ? fieldOf("v", row.fleet_size, SRC_MANUAL) : fieldOf("n", FLEET_SIZE_LABEL[fleetSizeStatus]);
    const types = Array.isArray(row.fleet_types) ? row.fleet_types.filter(Boolean) : [];
    fs.fleet_types = types.length ? fieldOf(manual.fleet ? "v" : "f", types.join(", "), manual.fleet ? SRC_MANUAL : "") : fieldOf("n");

    fs.fleet_manager = has(row.fleet_manager_name)
      ? fieldOf(manual.fleet_manager && has(row.fleet_manager_source) ? "v" : "f", row.fleet_manager_name, row.fleet_manager_source || "")
      : fieldOf("n");

    // safety officer – explicit, verified, non-OVDIM source only
    const soSource = String(row.safety_officer_source || "");
    const soProofOk = has(soSource) && !NOT_SAFETY_PROOF.test(soSource);
    const certName = row.certified_professional && row.certified_professional.name;
    if (!has(row.safety_officer_name)) fs.safety_officer = fieldOf("n");
    else if (certName && normName(certName) === normName(row.safety_officer_name)) {
      fs.safety_officer = fieldOf("n", "", "OVDIM אינו קצין בטיחות");
      warnings.push("שם קצין הבטיחות זהה לאיש המקצוע (OVDIM) – לא נחשב קצין בטיחות");
    } else if (row.safety_officer_verified && soProofOk) fs.safety_officer = fieldOf("v", row.safety_officer_name, soSource);
    else fs.safety_officer = fieldOf("f", row.safety_officer_name, soSource);

    fs.verification_date = row.verification_date ? fieldOf("v", row.verification_date) : fieldOf("n");

    // registry discrepancies (stored data vs. official source)
    if (certName && conRecs.length) {
      // token match, tolerant to word order and ו/י spelling (מועלם = מעלם)
      const toks = (s) => String(s || "").split(/[\s,;\-–]+/).map((t) => normName(t).replace(/[וי]/g, "")).filter((t) => t.length > 1);
      const regTok = new Set(conRecs.flatMap((r) => toks(r.ovdim)));
      const certTok = toks(certName);
      if (regTok.size && certTok.length && !certTok.every((t) => regTok.has(t)))
        warnings.push(`איש מקצוע (OVDIM) ברשומה "${certName}" שונה מהרשום בפנקס: ${conRecs.map((r) => r.ovdim).filter(Boolean).join(", ")}`);
    }
    if (has(row.phone) && regPhones.length && fs.phone.s === "f") warnings.push("הטלפון ברשומה שונה מהטלפון בפנקס הקבלנים");
    if (registryConfirmed === false && reg.checked_at) warnings.push("החברה לא אותרה בפנקס הקבלנים או ברשם החברות");

    // rejection
    let rejectedReason = row.rejected_reason || "";
    if (!rejectedReason && companyActive === false) rejectedReason = `החברה אינה פעילה ברשם החברות (${co.status})`;
    if (!rejectedReason && ["lost", "rejected"].includes(row.status)) rejectedReason = "נפסל בעבר בטיפול";
    if (!rejectedReason && row.lead_stage === "rejected" && manual.rejected) rejectedReason = manual.rejected.reason || "סומן ידנית כלא מתאים";

    const mandatoryOk =
      fs.company.s === "v" && fs.hp.s === "v" && fs.source.s === "v" && fs.phone.s === "v" &&
      fs.fleet.s === "v" && relevant && !opts.duplicate && !rejectedReason;
    const desiredKeys = ["email", "website", "contact_name", "contact_role", "fleet_size", "fleet_manager", "safety_officer"];
    const desiredVerified = desiredKeys.filter((k) => fs[k].s === "v").length;
    const desiredPresent = desiredKeys.filter((k) => fs[k].s !== "n").length;

    const isVerified = registryConfirmed && fs.phone.s === "v";
    const isQualified = isVerified && relevant;
    let stage;
    if (rejectedReason) stage = "rejected";
    else if (mandatoryOk) stage = "ready";
    else if (isQualified && desiredVerified >= 2) stage = "quality";
    else if (isQualified) stage = "qualified";
    else if (isVerified) stage = "verified";
    else if (registryConfirmed) stage = "review";
    else stage = "basic";

    const missing = FIELDS.filter(([k, , kind]) => kind !== "info" && fs[k] && fs[k].s !== "v").map(([k]) => k);
    const blockers = FIELDS.filter(([k, , kind]) => kind === "required" && fs[k] && fs[k].s !== "v").map(([, l]) => l);
    if (opts.duplicate) blockers.push("כפילות");
    if (rejectedReason) blockers.push("נפסל");

    return {
      field_status: { ...fs, manual, warnings },
      missing_fields: missing,
      blockers,
      source_list: sources,
      tier: registryConfirmed ? "A" : "C",
      verification_status: isVerified ? "verified" : registryConfirmed ? "partial" : "unverified",
      company_active_status: co.status || (inContractors ? "רשום בפנקס הקבלנים" : null),
      fleet_size_status: fleetSizeStatus,
      lead_stage: stage,
      lead_quality: desiredPresent >= 4 ? "high" : desiredPresent >= 2 ? "medium" : "low",
      ready_for_contact: stage === "ready",
      rejected_reason: rejectedReason || null,
      relevant,
    };
  }

  const api = { STAGES, STAGE_LABEL, FLEET_SIZE_LABEL, FIELD_STATUS_LABEL, FIELDS, NOT_SAFETY_PROOF, normPhone, validPhone, evaluate };
  root.OPQualify = api;
})(typeof window !== "undefined" ? window : globalThis);
