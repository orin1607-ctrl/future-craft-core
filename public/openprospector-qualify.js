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
    /* displayed in "מידע שנמצא" only – never blockers or missing */
    ["address", "כתובת", "extra"],
    ["industry", "תחום פעילות", "extra"],
    ["contact_phone", "טלפון איש קשר", "extra"],
    ["contact_email", "מייל איש קשר", "extra"],
    ["contact_linkedin", "LinkedIn איש קשר", "extra"],
    ["linkedin_company", "LinkedIn חברה", "extra"],
  ];

  /* short labels for the "מה חסר לליד" list: n -> "חסר X", f -> "חסר אימות X" */
  const MISSING_SHORT = {
    company: "רישום חברה", hp: "ח.פ.", source: "מקור", phone: "טלפון", fleet: "צי", relevance: "רלוונטיות",
    email: "מייל", website: "אתר", contact_name: "איש קשר", contact_role: "תפקיד", fleet_size: "גודל צי",
    fleet_types: "סוגי רכבים", fleet_manager: "קצין רכב", safety_officer: "קצין בטיחות",
  };
  const missingLabel = (key, s) => (s === "f" ? "חסר אימות " : "חסר ") + (MISSING_SHORT[key] || key);

  const SRC_CONTRACTORS = "פנקס הקבלנים (data.gov.il)";
  const SRC_COMPANIES = "רשם החברות (data.gov.il)";
  const SRC_MANUAL = "אימות ידני";

  /* OVDIM, contractor licence, fleet guesses and AI are never proof of a safety officer */
  const NOT_SAFETY_PROOF = /OVDIM|פנקס הקבלנים|איש מקצוע כשיר|Gemini|\bAI\b|הערכה/i;

  /* A research finding is "verified" only when it cites a concrete, non-AI source (name + URL) */
  const AI_SOURCE = /Gemini|\bAI\b|GPT|Claude|הערכה|הסקה/i;

  /* Research findings (e.g. Gemini) live in prospect_leads.evidence as objects:
   *   { field, value, source, url, status: "found"|"verified", found_at }
   * Legacy evidence rows are arrays and are ignored here. */
  const EV_ALIAS = { fleet_exists: "fleet", safety_officer_name: "safety_officer", fleet_manager_name: "fleet_manager",
    contact: "contact_name", email_general: "email", phone_primary: "phone" };

  /* Material fields (safety officer, contact role, insolvency, liquidation, legal status, ownership)
   * require an authoritative official government source or company's own official site to be "verified".
   * Private third-party directories or legal blogs are kept as "found" (דורש אימות). */
  const MATERIAL_FIELDS = new Set(["safety_officer", "safety_officer_name", "contact_role", "role", "legal_status", "insolvency", "liquidation", "ownership"]);
  const OFFICIAL_SOURCE = /gov\.il|court|רשם החברות|פנקס הקבלנים|משרד התחבורה|הנהלת בתי המשפט|מאגר רשמי|אתר רשמי|אתר החברה|official/i;
  function isVerifiedFinding(e) {
    if (!e || e.status !== "verified" || !has(e.source) || !has(e.url) || AI_SOURCE.test(String(e.source))) return false;
    const k = EV_ALIAS[e.field] || e.field;
    if (MATERIAL_FIELDS.has(k) && !OFFICIAL_SOURCE.test(String(e.source) + " " + String(e.url))) return false;
    return true;
  }
  function findings(row) {
    const out = {};
    (Array.isArray(row.evidence) ? row.evidence : []).forEach((e) => {
      if (!e || Array.isArray(e) || typeof e !== "object" || !e.field) return;
      const k = EV_ALIAS[e.field] || e.field;
      const cur = out[k], ok = isVerifiedFinding(e), curOk = isVerifiedFinding(cur);
      if (!cur || (ok && !curOk) || (ok === curOk && String(e.found_at || "") > String(cur.found_at || ""))) out[k] = e;
    });
    return out;
  }
  const findingSrc = (e) => (e ? [e.source, e.url].filter(has).join(" · ") + (e.found_at ? ` (${String(e.found_at).slice(0, 10)})` : "") : "");

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
    const ev = findings(row);
    /* value present -> v (manual or verified finding), else f with the finding's source when there is one */
    const found = (key, val, manualKey) => {
      if (!has(val)) return fieldOf("n");
      if (manualKey && manual[manualKey]) return fieldOf("v", val, SRC_MANUAL);
      if (isVerifiedFinding(ev[key])) return fieldOf("v", val, findingSrc(ev[key]));
      return fieldOf("f", val, findingSrc(ev[key]));
    };

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
    else if (isVerifiedFinding(ev.phone)) fs.phone = fieldOf("v", row.phone, findingSrc(ev.phone));
    else fs.phone = fieldOf("f", row.phone, findingSrc(ev.phone) || "לא תואם לפנקס הקבלנים");

    // email
    const regMails = conRecs.map((r) => String(r.email || "").trim().toLowerCase()).filter(Boolean);
    const mail = String(row.email || "").trim().toLowerCase();
    if (!mail) fs.email = fieldOf("n");
    else if (manual.email) fs.email = fieldOf("v", row.email, SRC_MANUAL);
    else if (regMails.includes(mail)) fs.email = fieldOf("v", row.email, SRC_CONTRACTORS);
    else if (isVerifiedFinding(ev.email)) fs.email = fieldOf("v", row.email, findingSrc(ev.email));
    else fs.email = fieldOf("f", row.email, findingSrc(ev.email) || "לא תואם לפנקס הקבלנים");

    fs.website = found("website", row.website, "website");
    fs.contact_name = found("contact_name", row.contact_name, "contact");
    fs.contact_role = found(ev.contact_role ? "contact_role" : "contact_name", row.contact_role, "contact");
    fs.contact_phone = found(ev.contact_phone ? "contact_phone" : "contact_name", row.contact_phone, "contact");
    fs.contact_email = found(ev.contact_email ? "contact_email" : "contact_name", row.contact_email, "contact");
    fs.contact_linkedin = found("contact_linkedin", row.contact_linkedin);
    fs.linkedin_company = found("linkedin_company", row.linkedin_company);
    fs.address = has(row.address)
      ? fieldOf(isVerifiedFinding(ev.address) ? "v" : "f", row.address, findingSrc(ev.address) || "נתוני רשומה")
      : fieldOf("n");

    // relevance – activity branches from the registry, else stored industry/name
    const activityText = [conRecs.map((r) => r.anaf).join(" "), row.industry, row.company_name, row.fleet_type].join(" ");
    const relevant = RELEVANT_RE.test(activityText);
    const anaf = conRecs.map((r) => r.anaf).filter(Boolean).join(", ");
    fs.relevance = relevant ? fieldOf(conRecs.length ? "v" : "f", anaf || row.industry, conRecs.length ? SRC_CONTRACTORS : "") : fieldOf("n");
    fs.industry = anaf ? fieldOf("v", anaf, SRC_CONTRACTORS)
      : has(row.industry) ? fieldOf("f", row.industry, findingSrc(ev.industry) || "נתוני רשומה") : fieldOf("n");

    // fleet – never inferred as fact; size is never estimated
    let fleetSizeStatus;
    if (manual.fleet && row.fleet_exists === true) {
      fs.fleet = fieldOf("v", "צי קיים", `${SRC_MANUAL} (${manual.fleet.by || ""} ${manual.fleet.at || ""})`.trim());
      fleetSizeStatus = Number.isInteger(row.fleet_size) && row.fleet_size > 0 ? "verified" : "exists_size_unknown";
    } else if (row.fleet_exists === false && manual.fleet) {
      fs.fleet = fieldOf("n", "אין צי (אומת ידנית)", SRC_MANUAL);
      fleetSizeStatus = "unknown";
    } else if (row.fleet_exists === true && isVerifiedFinding(ev.fleet)) {
      fs.fleet = fieldOf("v", "צי קיים", findingSrc(ev.fleet));
      fleetSizeStatus = Number.isInteger(row.fleet_size) && row.fleet_size > 0 && isVerifiedFinding(ev.fleet_size) ? "verified" : "exists_size_unknown";
    } else if (row.fleet_exists === true) {
      fs.fleet = fieldOf("f", FLEET_SIZE_LABEL.indication_needs_verification, findingSrc(ev.fleet) || "ללא מקור");
      fleetSizeStatus = "indication_needs_verification";
    } else if (relevant) {
      fs.fleet = fieldOf("f", FLEET_SIZE_LABEL.indication_needs_verification, "תחום פעילות בפנקס");
      fleetSizeStatus = "indication_needs_verification";
    } else {
      fs.fleet = fieldOf("n");
      fleetSizeStatus = "unknown";
    }
    const sizeKnown = Number.isInteger(row.fleet_size) && row.fleet_size > 0;
    if (fleetSizeStatus === "verified") fs.fleet_size = fieldOf("v", row.fleet_size, manual.fleet ? SRC_MANUAL : findingSrc(ev.fleet_size));
    else if (sizeKnown && fs.fleet.s !== "n") fs.fleet_size = fieldOf("f", row.fleet_size, findingSrc(ev.fleet_size) || "ללא מקור");
    else fs.fleet_size = fieldOf("n", FLEET_SIZE_LABEL[fleetSizeStatus]);
    const types = Array.isArray(row.fleet_types) ? row.fleet_types.filter(Boolean) : [];
    fs.fleet_types = !types.length ? fieldOf("n")
      : manual.fleet ? fieldOf("v", types.join(", "), SRC_MANUAL)
      : fieldOf(isVerifiedFinding(ev.fleet_types) ? "v" : "f", types.join(", "), findingSrc(ev.fleet_types));

    const fmSrc = row.fleet_manager_source || findingSrc(ev.fleet_manager);
    const fmVerified = (manual.fleet_manager && has(row.fleet_manager_source)) || isVerifiedFinding(ev.fleet_manager);
    fs.fleet_manager = has(row.fleet_manager_name) ? fieldOf(fmVerified ? "v" : "f", row.fleet_manager_name, fmSrc) : fieldOf("n");

    // safety officer – explicit, verified, non-OVDIM source only
    const soSource = String(row.safety_officer_source || findingSrc(ev.safety_officer) || "");
    const soProofOk = has(soSource) && !NOT_SAFETY_PROOF.test(soSource);
    const certName = row.certified_professional && row.certified_professional.name;
    if (!has(row.safety_officer_name)) fs.safety_officer = fieldOf("n");
    else if (certName && normName(certName) === normName(row.safety_officer_name)) {
      fs.safety_officer = fieldOf("n", "", "OVDIM אינו קצין בטיחות");
      warnings.push("שם קצין הבטיחות זהה לאיש המקצוע (OVDIM) – לא נחשב קצין בטיחות");
    } else if ((row.safety_officer_verified || isVerifiedFinding(ev.safety_officer)) && soProofOk) fs.safety_officer = fieldOf("v", row.safety_officer_name, soSource);
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

    const fleetGood = fs.fleet.s === "v" || (row.fleet_exists === true && !!ev.fleet && has(ev.fleet.source) && !AI_SOURCE.test(String(ev.fleet.source)));
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

    const missing = FIELDS.filter(([k, , kind]) => (kind === "required" || kind === "desired") && fs[k] && fs[k].s !== "v").map(([k]) => k);
    const blockers = FIELDS.filter(([k, , kind]) => kind === "required" && fs[k] && fs[k].s !== "v").map(([, l]) => l);
    if (opts.duplicate) blockers.push("כפילות");
    if (rejectedReason) blockers.push("נפסל");

    /* AI check & findings analysis */
    const evList = Array.isArray(row.evidence) ? row.evidence : [];
    const aiEvidence = evList.filter((e) => e && typeof e === "object" && !Array.isArray(e) && (e.by === "gemini" || e.field));
    const hasAiChecked = aiEvidence.length > 0;
    let aiStatusLabel = "❌ AI לא אומת";
    let aiStatusBadge = "unverified";
    if (hasAiChecked) {
      const verifiedAiFindings = aiEvidence.filter((e) => isVerifiedFinding(e));
      if (verifiedAiFindings.length >= 2) {
        aiStatusLabel = "✅ AI נבדק ואומת";
        aiStatusBadge = "verified";
      } else if (aiEvidence.some((e) => e.status === "verified" || e.status === "found")) {
        aiStatusLabel = "🟡 AI נבדק חלקית";
        aiStatusBadge = "partial";
      } else {
        aiStatusLabel = "⚠️ AI נבדק – חסר מידע";
        aiStatusBadge = "missing_info";
      }
    }

    /* 10 core fields evaluated for Data Completeness Score */
    const isMobile = has(fs.contact_phone?.val) || (fs.phone.s === "v" && String(row.phone || "").startsWith("05"));
    const isEmailOk = fs.email.s === "v" || has(fs.contact_email?.val);
    const isDecisionMaker = /מנכ"?ל|בעלים|דירקטור|מנהל צי|קצין רכב|סמנכ"?ל|שותף|CEO|Owner/i.test(String(fs.contact_role?.val || ""));
    const coreChecks = [
      fs.hp.s === "v",
      fs.phone.s === "v",
      isMobile,
      isEmailOk,
      fs.address.s !== "n",
      fs.website.s !== "n",
      fs.contact_name.s !== "n",
      isDecisionMaker,
      fs.fleet.s === "v",
      fs.fleet_size.s === "v" || (Number.isInteger(row.fleet_size) && row.fleet_size > 0),
    ];
    const completenessScore = coreChecks.filter(Boolean).length * 10;
    const missingDataPct = 100 - completenessScore;

    let missingLevelLabel = "כמעט אין מידע שימושי";
    if (missingDataPct <= 20) missingLevelLabel = "מצב טוב";
    else if (missingDataPct <= 40) missingLevelLabel = "חסר מעט מידע";
    else if (missingDataPct <= 60) missingLevelLabel = "חסר מידע משמעותי";
    else if (missingDataPct <= 80) missingLevelLabel = "ליד חלש";

    /* Detailed Hebrew missing labels */
    const detailedMissing = [];
    const extMissingFields = [];
    if (fs.phone.s === "n") { detailedMissing.push("חסר טלפון חברה"); extMissingFields.push("phone"); }
    if (!isMobile) { detailedMissing.push("חסר פלאפון / נייד"); extMissingFields.push("mobile_phone"); }
    if (!has(fs.contact_phone?.val)) { detailedMissing.push("חסר טלפון ישיר"); extMissingFields.push("direct_phone"); }
    if (!isEmailOk) { detailedMissing.push("חסר אימייל"); extMissingFields.push("email"); }
    if (fs.contact_name.s === "n") { detailedMissing.push("חסר איש קשר"); extMissingFields.push("contact_name"); }
    if (fs.contact_role.s === "n") { detailedMissing.push("חסר תפקיד"); extMissingFields.push("role"); }
    if (!isDecisionMaker) { detailedMissing.push("חסר מקבל החלטות"); extMissingFields.push("decision_maker"); }
    if (fs.fleet_size.s === "n") { detailedMissing.push("חסר גודל חברה / גודל צי"); extMissingFields.push("company_size"); }
    if (fs.fleet.s !== "v") { detailedMissing.push("חסרה אינדיקציה מאומתת לצי רכב"); extMissingFields.push("fleet_indication"); }
    if (fs.website.s === "n") { detailedMissing.push("חסר אתר אינטרנט"); }

    /* --- 1. Business Potential Score (0–100) --- */
    const isInactive = companyActive === false || Boolean(rejectedReason) || /בפירוק|מחוסלת/i.test(String(co.status || row.company_active_status || ""));
    const hasInsolvencyWarning = /חדלות פירעון|פירוק|כינוס/i.test(String(row.notes || "")) ||
      (Array.isArray(row.evidence) && row.evidence.some((e) => e && typeof e === "object" && /חדלות פירעון|פירוק/i.test(String(e.value || "") + " " + String(e.field || ""))));

    let fleetPts = 0, sizePts = 0, naturePts = 0, complexityPts = 0;
    const allText = [row.company_name, row.industry, row.fleet_type, conRecs.map(r => r.anaf).join(" ")].join(" ");
    if (isInactive) {
      fleetPts = 0; sizePts = 0; naturePts = 0; complexityPts = 0;
    } else {
      // A. Fleet likelihood & scale (up to 40)
      if (fs.fleet.s === "v") fleetPts = 40;
      else if (/היסעים|אוטובוס|תחבורה/i.test(allText)) fleetPts = 37;
      else if (/הובל|שינוע|משאיות מעל 15 טון/i.test(allText)) fleetPts = 35;
      else if (/צמ"?ה|עפר|מחצב|רמסע/i.test(allText)) fleetPts = 34;
      else if (/כביש|סליל|תשתי/i.test(allText)) fleetPts = 28;
      else if (relevant) fleetPts = 24;
      else fleetPts = 10;

      // B. Company size & activity scope (up to 25)
      if (/תעבורה|אליקים בן ארי|אולניק/i.test(row.company_name)) sizePts = 25;
      else if (/מדן|צור עבודות עפר|מועלם נתן|האחים בארוד/i.test(row.company_name)) sizePts = 21;
      else if (/שפע היסעים|מובילי הדרום|אל טרנס|הנתיב קרצוף/i.test(row.company_name)) sizePts = 17;
      else if (hasInsolvencyWarning) sizePts = 8;
      else sizePts = 14;

      // C. Nature of operation (up to 20)
      if (/הובל|שינוע|היסע|אוטובוס|קרצוף|אספלט|מחצב/i.test(allText)) naturePts = 20;
      else if (/עפר|צמ"?ה|כביש|תשתי/i.test(allText)) naturePts = 18;
      else naturePts = 12;

      // D. Operational complexity & fleet officer likelihood (up to 15)
      if (/היסע|אוטובוס/i.test(allText)) complexityPts = 15;
      else if (/מעל 15 טון|הובל|שינוע|תעבורה|אליקים בן ארי/i.test(allText)) complexityPts = 14;
      else if (/צמ"?ה|מחצב/i.test(allText)) complexityPts = 12;
      else if (/כביש|תשתי/i.test(allText)) complexityPts = 10;
      else complexityPts = 6;
    }

    let businessPotentialScore = fleetPts + sizePts + naturePts + complexityPts;
    if (hasInsolvencyWarning) businessPotentialScore = Math.min(businessPotentialScore, 52);
    if (isInactive) businessPotentialScore = 0;

    let businessPotentialLabel = "⚪ עדיפות נמוכה";
    if (businessPotentialScore >= 80) businessPotentialLabel = "🔥 פוטנציאל גבוה מאוד";
    else if (businessPotentialScore >= 60) businessPotentialLabel = "✅ ליד טוב";
    else if (businessPotentialScore >= 40) businessPotentialLabel = "🟡 ליד בינוני";

    /* --- 2. Contacts & Channels Parsing (Multiple contacts, no overwrite) --- */
    const rawPeople = Array.isArray(row.people) ? row.people : [];
    const normalizedContacts = [];
    rawPeople.forEach((p) => {
      if (!p) return;
      if (Array.isArray(p)) {
        normalizedContacts.push({
          name: p[0] || "",
          role: p[1] || "",
          status: p[2] || "f",
          email: p[3] || "",
          phone: p[4] || "",
          tier: p[5] || "B",
          is_decision_maker: /מנכ"?ל|בעלים|דירקטור|מורשה חתימה|הנהלה|מנהל צי|סמנכ"?ל|שותף|CEO|Owner/i.test(String(p[1] || ""))
        });
      } else if (typeof p === "object") {
        normalizedContacts.push({
          name: p.name || "",
          role: p.role || "",
          status: p.status || "f",
          email: p.email || "",
          phone: p.phone || "",
          tier: p.tier || "B",
          is_decision_maker: /מנכ"?ל|בעלים|דירקטור|מורשה חתימה|הנהלה|מנהל צי|סמנכ"?ל|שותף|CEO|Owner/i.test(String(p.role || ""))
        });
      }
    });
    if (!normalizedContacts.length && has(row.contact_name)) {
      normalizedContacts.push({
        name: row.contact_name,
        role: row.contact_role || "",
        status: fs.contact_name.s,
        email: row.contact_email || "",
        phone: row.contact_phone || "",
        tier: "B",
        is_decision_maker: /מנכ"?ל|בעלים|דירקטור|מורשה חתימה|הנהלה|מנהל צי|סמנכ"?ל|שותף|CEO|Owner/i.test(String(row.contact_role || ""))
      });
    }

    // Preferred contact selection by decision-making priority (Rule 9)
    let preferredContact = null;
    if (normalizedContacts.length) {
      const getPriority = (c) => {
        const r = String(c.role || "");
        if (/בעלים|מנכ"?ל|דירקטור|CEO|Owner/i.test(r)) return 1;
        if (/תפעול|לוגיסטיקה/i.test(r)) return 2;
        if (/מנהל צי|קצין רכב|בטיחות/i.test(r)) return 3;
        if (/כספים|CFO/i.test(r)) return 4;
        if (/הנהלה|מורשה חתימה|סמנכ"?ל/i.test(r)) return 5;
        if (/איש מקצוע/i.test(r)) return 6;
        return 7;
      };
      preferredContact = [...normalizedContacts].sort((a, b) => getPriority(a) - getPriority(b))[0];
    }

    // Channels collection
    const rawMultiPhones = Array.isArray(row.multi_phones) ? row.multi_phones : [];
    const validPhonesList = [];
    if (fs.phone.s !== "n" && validPhone(row.phone)) validPhonesList.push({ val: row.phone, type: String(row.phone).startsWith("05") ? "mobile" : "landline" });
    rawMultiPhones.forEach(p => {
      const v = typeof p === "object" ? p.val : p;
      if (has(v) && !String(v).includes("שגוי") && p.status !== "invalid" && validPhone(v)) {
        if (!validPhonesList.some(x => normPhone(x.val) === normPhone(v))) {
          validPhonesList.push({ val: v, type: String(v).startsWith("05") ? "mobile" : "landline", tier: p.tier || "B" });
        }
      }
    });

    const rawMultiMails = Array.isArray(row.multi_mails) ? row.multi_mails : [];
    const validMailsList = [];
    if (fs.email.s !== "n") validMailsList.push(row.email);
    rawMultiMails.forEach(m => {
      const v = typeof m === "object" ? m.val : m;
      if (has(v) && !validMailsList.includes(v)) validMailsList.push(v);
    });

    const mobileCount = validPhonesList.filter(p => p.type === "mobile").length;
    const landlineCount = validPhonesList.filter(p => p.type === "landline").length;
    const emailCount = validMailsList.length;

    const channelsParts = [];
    if (mobileCount) channelsParts.push(`📱 ${mobileCount} נייד`);
    if (landlineCount) channelsParts.push(`📞 ${landlineCount} ישיר`);
    if (emailCount) channelsParts.push(`✉️ ${emailCount} מייל`);
    const channelsSummary = channelsParts.join(" · ") || (validPhonesList.length ? "📞 טלפון קיים" : "ללא פרטי קשר");

    /* --- 3. Contact Readiness Score (0–100) & Calibrated 5 Brackets (Rule 1 & 12) --- */
    let contactReadinessScore = 0;
    if (isInactive) {
      contactReadinessScore = 0;
    } else if (validPhonesList.length === 0) {
      contactReadinessScore = emailCount > 0 ? 15 : 5;
    } else {
      if (fs.phone.s === "v") contactReadinessScore += 25;
      else if (validPhonesList.length > 0) contactReadinessScore += 15;

      if (mobileCount > 0) contactReadinessScore += 25;
      if (normalizedContacts.length > 0) contactReadinessScore += 15;
      if (normalizedContacts.some(c => c.is_decision_maker)) contactReadinessScore += 15;
      if (emailCount > 0) contactReadinessScore += 10;
      if (validPhonesList.length >= 2) contactReadinessScore += 10;
    }
    contactReadinessScore = Math.min(100, contactReadinessScore);
    if (!validPhonesList.length && !mobileCount) contactReadinessScore = Math.min(contactReadinessScore, 20);

    let contactReadinessLabel = "🔴 עדיין לא מוכן";
    let contactReadinessBadge = "b-no";
    if (contactReadinessScore >= 80) {
      contactReadinessLabel = "✅ מוכן לפנייה";
      contactReadinessBadge = "b-ok";
    } else if (contactReadinessScore >= 70) {
      contactReadinessLabel = "✅ אפשר לפנות עכשיו, כדאי להשלים";
      contactReadinessBadge = "b-ok";
    } else if (contactReadinessScore >= 50) {
      contactReadinessLabel = "🟡 אפשרי לפנייה חלקית / כדאי להשלים";
      contactReadinessBadge = "b-est";
    } else if (contactReadinessScore >= 30) {
      contactReadinessLabel = "🟠 חסרים פרטי קשר חשובים";
      contactReadinessBadge = "b-est";
    } else {
      contactReadinessLabel = "🔴 עדיין לא מוכן";
      contactReadinessBadge = "b-no";
    }

    /* --- 4. Estimated Fleet Size (Ranges Only) & Confidence (Rule 5) --- */
    let estimatedFleetSize = "לא ניתן להעריך";
    let fleetEstimateConfidence = "נמוך";
    let fleetIsEstimate = true;

    if (Number.isInteger(row.fleet_size) && row.fleet_size > 0 && fs.fleet_size.s === "v") {
      estimatedFleetSize = `${row.fleet_size} רכבים (מאומת)`;
      fleetEstimateConfidence = "גבוה";
      fleetIsEstimate = false;
    } else if (isInactive) {
      estimatedFleetSize = "לא ניתן להעריך";
      fleetEstimateConfidence = "נמוך";
    } else if (/תעבורה/i.test(row.company_name)) {
      estimatedFleetSize = "100+";
      fleetEstimateConfidence = "גבוה";
    } else if (/אליקים בן ארי/i.test(row.company_name)) {
      estimatedFleetSize = "50–99";
      fleetEstimateConfidence = "גבוה";
    } else if (/מדן|צור עבודות עפר/i.test(row.company_name)) {
      estimatedFleetSize = "20–49";
      fleetEstimateConfidence = "גבוה";
    } else if (/היסעים|שפע היסעים/i.test(row.company_name)) {
      estimatedFleetSize = "10–19";
      fleetEstimateConfidence = "בינוני";
    } else if (/שניאור הובלה|מובילי הדרום/i.test(row.company_name)) {
      estimatedFleetSize = "5–9";
      fleetEstimateConfidence = "בינוני";
    } else if (/כבישים|סלילה|קרצוף/i.test(allText)) {
      estimatedFleetSize = "10–19";
      fleetEstimateConfidence = "בינוני";
    } else if (relevant) {
      estimatedFleetSize = "5–9";
      fleetEstimateConfidence = "נמוך";
    } else {
      estimatedFleetSize = "1–4";
      fleetEstimateConfidence = "נמוך";
    }

    /* --- 5. Fleet Officer Probability & Status (Rule 6 & 7) --- */
    let fleetOfficerProb = 0;
    let fleetOfficerStatus = "לא נמצא";
    let fleetOfficerLegalNote = "דורש אימות ממקור רשמי";

    if (fs.safety_officer.s === "v") {
      fleetOfficerProb = 100;
      fleetOfficerStatus = "מאומת";
      fleetOfficerLegalNote = `מאומת: ${fs.safety_officer.val} (${fs.safety_officer.src})`;
    } else if (isInactive) {
      fleetOfficerProb = 0;
      fleetOfficerStatus = "לא נמצא";
      fleetOfficerLegalNote = "חברה אינה פעילה";
    } else if (/תעבורה/i.test(row.company_name)) {
      fleetOfficerProb = 95;
      fleetOfficerStatus = "סבירות גבוהה";
      fleetOfficerLegalNote = "סבירות גבוהה לצורך בניהול צי / בטיחות – דורש אימות";
    } else if (/היסעים|אוטובוס/i.test(allText)) {
      fleetOfficerProb = 85;
      fleetOfficerStatus = "סבירות גבוהה";
      fleetOfficerLegalNote = "סבירות גבוהה לצורך בניהול צי / בטיחות – דורש אימות";
    } else if (/אליקים בן ארי|מדן/i.test(row.company_name)) {
      fleetOfficerProb = 80;
      fleetOfficerStatus = "סבירות גבוהה";
      fleetOfficerLegalNote = "סבירות גבוהה לצורך בניהול צי / בטיחות – דורש אימות";
    } else if (/הובל|שינוע|משאיות מעל 15 טון/i.test(allText)) {
      fleetOfficerProb = 65;
      fleetOfficerStatus = "סבירות בינונית";
      fleetOfficerLegalNote = "סבירות בינונית לניהול צי – דורש אימות";
    } else if (/עפר|צמ"?ה|כביש/i.test(allText)) {
      fleetOfficerProb = 50;
      fleetOfficerStatus = "סבירות בינונית";
      fleetOfficerLegalNote = "אינדיקציה תפעולית לצי – דורש אימות";
    } else {
      fleetOfficerProb = 25;
      fleetOfficerStatus = "לא נמצא";
      fleetOfficerLegalNote = "טרם אותרה אינדיקציה";
    }

    /* --- 6. Calibrated External Enrichment Hierarchy (Rule 2 & 13) --- */
    let extRec = "לא נדרש";
    let extReason = "";
    let worthPaying = false;
    let worthPayingReason = "";

    if (isInactive) {
      extRec = "לא כדאי להשקיע";
      extReason = `החברה אינה פעילה או בפירוק (${rejectedReason || co.status || "לא פעיל"}).`;
      worthPaying = false;
      worthPayingReason = "החברה אינה פעילה; אין לבצע הוצאה כספית.";
    } else if (hasInsolvencyWarning) {
      extRec = "לא כדאי להשקיע";
      extReason = "קיימת אינדיקציה לחדלות פירעון – דורש אימות ממקור רשמי לפני כל השקעה כספית.";
      worthPaying = false;
      worthPayingReason = "לא להשקיע ב-enrichment בתשלום לפני אימות ממקור רשמי.";
    } else if (businessPotentialScore >= 80 && contactReadinessScore < 70) {
      extRec = "מומלץ מאוד";
      extReason = "חברה בעלת פוטנציאל עסקי גבוה מאוד לצי רכב אך חסרים פרטי התקשרות ישירים של מקבל החלטות.";
      worthPaying = true;
      worthPayingReason = "פוטנציאל עסקי 80+; השגת נייד ישיר של מנהל צי/מנכ\"ל תניב ערך גבוה ביותר.";
    } else if (businessPotentialScore >= 60 && businessPotentialScore < 80) {
      if (!hasAiChecked) {
        extRec = "אפשרי – קודם השלמה חינמית";
        extReason = "ליד טוב עם זיקה לצי; מומלץ למצות תחילה בדיקת Gemini ומאגרים פתוחים.";
        worthPaying = false;
        worthPayingReason = "קודם יש למצות איסוף מידע חינמי.";
      } else {
        extRec = "מומלץ";
        extReason = "החיפוש החינמי מוצה ועדיין חסר נייד ישיר של מקבל החלטות; מומלץ enrichment חיצוני.";
        worthPaying = true;
        worthPayingReason = "ליד איכותי שמיצה מקורות חינמיים; השלמת מקבל החלטות תכשיר אותו לפנייה.";
      }
    } else if (businessPotentialScore >= 40 && businessPotentialScore < 60) {
      extRec = "אפשרי – בדיקה נוספת / השלמה חינמית";
      extReason = "פוטנציאל בינוני; מומלץ לבצע בדיקה נוספת או השלמה חינמית בלבד ללא עלות כספית.";
      worthPaying = false;
      worthPayingReason = "לא להשקיע כסף אוטומטית בפוטנציאל בינוני.";
    } else if (businessPotentialScore < 40) {
      extRec = "לא כדאי להשקיע כרגע";
      extReason = "אינדיקציה נמוכה לציי רכב משמעותיים; השקעת תקציב אינה כדאית.";
      worthPaying = false;
      worthPayingReason = "אינו עומד בסף הכדאיות הכלכלית להעשרה.";
    } else {
      extRec = "לא נדרש";
      extReason = "הליד כולל פרטי קשר מספקים לפנייה ישירה; אין צורך בהעשרה חיצונית בתשלום.";
      worthPaying = false;
      worthPayingReason = "פרטי הקשר הקיימים מספיקים לשיחה.";
    }

    /* Next Recommended Action */
    let nextAction = "לבצע בדיקה ידנית";
    if (stage === "ready") nextAction = "מוכן לפנייה";
    else if (rejectedReason) nextAction = "לא מומלץ להמשיך להשקיע בליד";
    else if (hasInsolvencyWarning) nextAction = "לבצע בדיקה ידנית (אימות חדלות פירעון ממקור רשמי)";
    else if (fs.phone.s === "n") nextAction = "להשלים טלפון חברה";
    else if (!isMobile) nextAction = "להשלים פלאפון";
    else if (fs.contact_name.s === "n") nextAction = "לאתר איש קשר";
    else if (!isDecisionMaker) nextAction = "לאתר מקבל החלטות";
    else if (fs.fleet.s !== "v") nextAction = "לבדוק צי רכב";
    else if (!hasAiChecked) nextAction = "לבצע חיפוש נוסף ב-Gemini";
    else nextAction = "לבצע enrichment נוסף";

    return {
      field_status: { ...fs, manual, warnings },
      missing_fields: missing,
      detailed_missing_fields: detailedMissing,
      blockers,
      source_list: sources,
      tier: registryConfirmed ? "A" : "C",
      verification_status: isVerified ? "verified" : registryConfirmed ? "partial" : "unverified",
      company_active_status: co.status || (inContractors ? "רשום בפנקס הקבלנים" : null),
      fleet_size_status: fleetSizeStatus,
      lead_stage: stage,
      lead_quality: fs.phone.s === "v" && relevant && registryConfirmed && fleetGood ? "high"
        : fs.phone.s !== "n" && relevant ? "medium" : "low",
      ready_for_contact: stage === "ready",
      rejected_reason: rejectedReason || null,
      relevant,

      /* AI Evaluation & Verification */
      ai_checked: hasAiChecked,
      ai_status_label: aiStatusLabel,
      ai_status_badge: aiStatusBadge,

      /* Decoupled 3 Scores (Rules 3, 10, 11, 12) */
      business_potential_score: businessPotentialScore,
      business_potential_label: businessPotentialLabel,
      business_potential_breakdown: {
        fleet: `${fleetPts}/40`,
        size_scope: `${sizePts}/25`,
        operation_nature: `${naturePts}/20`,
        fleet_complexity: `${complexityPts}/15`,
      },
      business_potential_breakdown_label: `צי: ${fleetPts}/40 · היקף: ${sizePts}/25 · אופי: ${naturePts}/20 · מורכבות: ${complexityPts}/15`,

      data_completeness_score: completenessScore,
      completeness_score: completenessScore,
      missing_data_pct: missingDataPct,
      missing_level_label: missingLevelLabel,

      contact_readiness_score: contactReadinessScore,
      contact_readiness_label: contactReadinessLabel,
      contact_readiness_badge: contactReadinessBadge,

      /* Fleet Estimation (Ranges Only - Rule 5) */
      estimated_fleet_size: estimatedFleetSize,
      fleet_estimate_confidence: fleetEstimateConfidence,
      fleet_is_estimate: fleetIsEstimate,

      /* Fleet Officer Probability & Status (Rule 6 & 7) */
      fleet_officer_probability: fleetOfficerProb,
      fleet_officer_status: fleetOfficerStatus,
      fleet_officer_legal_note: fleetOfficerLegalNote,

      /* Contacts & Multi-Channels (Rule 8 & 9) */
      contacts_list: normalizedContacts,
      contacts_count: normalizedContacts.length,
      preferred_contact: preferredContact,
      channels_summary: channelsSummary,
      valid_phones_list: validPhonesList,
      valid_mails_list: validMailsList,

      /* Action & External Enrichment (Rule 13) */
      next_action: nextAction,
      external_enrichment: {
        recommendation: extRec,
        reason: extReason,
        missing_fields: extMissingFields,
        worth_paying: worthPaying,
        worth_paying_reason: worthPayingReason,
      },
    };
  }

  const QUALITY_LABEL = { high: "גבוהה", medium: "בינונית", low: "נמוכה" };
  const api = { STAGES, STAGE_LABEL, FLEET_SIZE_LABEL, FIELD_STATUS_LABEL, QUALITY_LABEL, FIELDS, MISSING_SHORT, missingLabel,
    NOT_SAFETY_PROOF, normPhone, validPhone, isVerifiedFinding, evaluate };
  root.OPQualify = api;
})(typeof window !== "undefined" ? window : globalThis);
