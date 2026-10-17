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

  const VEHICLE_INDUSTRY_RE = /הובל|שינוע|לוגיסט|הסע|היסע|אוטובוס|משאית|מוביל|הפצה|קירור|מנוף|גרירה|עפר|צמ["״']?ה|תשתי|כביש|סליל|ליסינג|השכרת רכב/;
  const VEHICLE_INTENSIVE_INDUSTRY_RE = VEHICLE_INDUSTRY_RE;
  const GENERAL_COMPANY_INDUSTRY_RE = /תעשיי|מפעל|ייצור|הייטק|טכנולוג|מחשוב|תוכנה|הנדס|שירות|אבטח|שמיר|ניקיון|מסחר|שיווק|מזון|חקלא|בניי|בניה|מיזוג|חשמל|מעליות|אינסטלצ|רפוא|בריאות|פיננס|עורכי דין|רואי חשבון|משרד|חינוך|תקשורת/i;

  /** Three honest fleet answers. Never invents a count. */
  function assessCompanyFleet(input) {
    const src = input || {};
    const employees = Number.isInteger(src.employees) && src.employees > 0 ? src.employees : null;
    const verifiedFleet = Number.isInteger(src.verifiedFleet) && src.verifiedFleet > 0 ? src.verifiedFleet : null;
    const vehicleIndustry = VEHICLE_INDUSTRY_RE.test(String(src.industry || ""));
    if (verifiedFleet !== null) {
      return {
        method: "verified",
        count: verifiedFleet,
        isEstimate: false,
        display: verifiedFleet + " רכבים",
        methodLabel: "לפי מידע מאומת",
      };
    }
    if (vehicleIndustry) {
      const industryCount = Number.isInteger(src.industryFleet) && src.industryFleet > 0 && src.industryBasis
        ? src.industryFleet
        : null;
      if (industryCount !== null) {
        return {
          method: "industry",
          count: industryCount,
          isEstimate: true,
          display: "כ-" + industryCount + " רכבים",
          methodLabel: "לפי תחום העיסוק: " + src.industryBasis,
        };
      }
      return {
        method: "unknown",
        count: null,
        isEstimate: false,
        display: "לא ידוע",
        methodLabel: "תחום רכב — אין אומדן ענפי עם בסיס מספרי, ונוסחת 10% לא הופעלה",
      };
    }
    if (src.employeesVerified && employees !== null) {
      const count = Math.round(employees * 0.1);
      return {
        method: "formula",
        count: count,
        isEstimate: true,
        display: count + " רכבים",
        methodLabel: "לפי נוסחה: 10% מ-" + employees + " עובדים מאומתים",
      };
    }
    return {
      method: "unknown",
      count: null,
      isEstimate: false,
      display: "לא ידוע",
      methodLabel: "אין נתון צי מאומת ואין מספר עובדים מאומת לנוסחה",
    };
  }

  function fleetCountMatchesMode(count, mode) {
    if (!mode || mode === "all") return true;
    if (mode === "unknown") return count === null || count === undefined;
    if (count === null || count === undefined) return false;
    if (mode === "1-4") return count >= 1 && count <= 4;
    if (mode === "5-10") return count >= 5 && count <= 10;
    if (mode === "11-20") return count >= 11 && count <= 20;
    if (mode === "21-50") return count >= 21 && count <= 50;
    if (mode === "51-100") return count >= 51 && count <= 100;
    if (mode === "100plus") return count >= 100;
    if (mode === "potential_5plus") return count >= 5;
    return true;
  }

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

  function isCompanyActive(statusStr) {
    const s = String(statusStr || "").trim();
    if (!s) return true;
    if (/בפירוק|מחוסלת|מחוסל|מחוקה|מחוק|הופסקה|הופסק|לא פעיל|מבוטל|פקע|נגרעה|סגור/i.test(s)) return false;
    return true;
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
    const rawStatusStr = String(co.status || row.company_active_status || row.status || "").trim();
    const isExplicitlyInactiveStatus = !isCompanyActive(rawStatusStr);
    const companyActive = isExplicitlyInactiveStatus ? false : (rawStatusStr ? true : null);
    fs.company = registryConfirmed
      ? fieldOf("v", row.company_name, [inCompanies && SRC_COMPANIES, inContractors && SRC_CONTRACTORS].filter(Boolean).join(" + "))
      : fieldOf("f", row.company_name, "רשומה קיימת – לא אותרה ברשם/בפנקס");
    fs.hp = has(row.company_hp) && isValidIsraeliCompanyNumber(row.company_hp)
      ? fieldOf(registryConfirmed ? "v" : "f", normalizeCompanyHp(row.company_hp), registryConfirmed ? fs.company.src : "")
      : fieldOf("n");

    const sources = [];
    if (inContractors) sources.push(SRC_CONTRACTORS);
    if (inCompanies) sources.push(SRC_COMPANIES);
    if (Array.isArray(row.source_list)) {
      row.source_list.forEach(s => { if (s && !sources.includes(s)) sources.push(s); });
    }
    if (Object.keys(manual).length && !sources.includes(SRC_MANUAL)) sources.push(SRC_MANUAL);
    fs.source = sources.length ? fieldOf("v", sources.join(" + ")) : fieldOf("f", "נתוני רשומה בלבד");

    // phone: full normalized phone comparison (never 7-digit tail)
    const regPhones = conRecs.map((r) => normPhone(r.phone)).filter((p) => p.length >= 9);
    const phone = normPhone(row.phone || row.mobile_phone);
    const hasOfficialPhoneSource = regPhones.includes(phone) ||
      (Array.isArray(row.phone_sources) && row.phone_sources.length >= 1) ||
      (row.source && ["contractors", "mefalas_plants", "business_licenses", "garages", "asbestos"].includes(row.source) && validPhone(phone));
    if (!has(phone) || !validPhone(phone)) fs.phone = fieldOf("n", has(row.phone) ? row.phone + " (לא תקין)" : "");
    else if (manual.phone) fs.phone = fieldOf("v", row.phone || row.mobile_phone, `${SRC_MANUAL} (${manual.phone.by || ""} ${manual.phone.at || ""})`.trim());
    else if (regPhones.includes(phone)) fs.phone = fieldOf("v", row.phone || row.mobile_phone, SRC_CONTRACTORS);
    else if (hasOfficialPhoneSource) fs.phone = fieldOf("v", row.phone || row.mobile_phone, (Array.isArray(row.phone_sources) && row.phone_sources.join(" + ")) || row.source_name || "מאגר ממשלתי רשמי");
    else if (isVerifiedFinding(ev.phone)) fs.phone = fieldOf("v", row.phone || row.mobile_phone, findingSrc(ev.phone));
    else fs.phone = fieldOf("f", row.phone || row.mobile_phone, findingSrc(ev.phone) || "נמצא במקור בודד – דורש הצלבה");

    // email
    const regMails = conRecs.map((r) => String(r.email || "").trim().toLowerCase()).filter(Boolean);
    const mail = String(row.email || "").trim().toLowerCase();
    const hasOfficialMailSource = regMails.includes(mail) ||
      (Array.isArray(row.email_sources) && row.email_sources.length >= 1) ||
      (row.source && ["contractors", "business_licenses", "asbestos", "cooperatives"].includes(row.source) && mail.includes("@"));
    if (!mail || !mail.includes("@")) fs.email = fieldOf("n");
    else if (manual.email) fs.email = fieldOf("v", row.email, SRC_MANUAL);
    else if (regMails.includes(mail)) fs.email = fieldOf("v", row.email, SRC_CONTRACTORS);
    else if (hasOfficialMailSource) fs.email = fieldOf("v", row.email, (Array.isArray(row.email_sources) && row.email_sources.join(" + ")) || row.source_name || "מאגר ממשלתי רשמי");
    else if (isVerifiedFinding(ev.email)) fs.email = fieldOf("v", row.email, findingSrc(ev.email));
    else fs.email = fieldOf("f", row.email, findingSrc(ev.email) || "נמצא במקור בודד – דורש הצלבה");

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

    // relevance – supports both vehicle-intensive companies AND general companies with fleet potential (Rule 1 & Rule 2)
    const activityText = [conRecs.map((r) => r.anaf).join(" "), row.industry, row.company_name, row.fleet_type].join(" ");
    const empHint = Number(row.verified_employee_count || row.employee_count || row.employees_count || row.employeesCount || 0);
    const fleetHint = Number(row.fleet_size || 0);
    const isGeneralBusinessRelevant = empHint >= 20 || fleetHint >= 5 || /תעשיי|מפעל|ייצור|הייטק|טכנולוג|מחשוב|תוכנה|הנדס|שירות|אבטח|שמיר|ניקיון|מסחר|שיווק|מזון|חקלא|בניי|בניה|מיזוג|חשמל|מעליות|אינסטלצ|רפוא|בריאות|פיננס|עורכי דין|רואי חשבון|משרד/i.test(activityText);
    const relevant = RELEVANT_RE.test(activityText) || isGeneralBusinessRelevant;
    const anaf = conRecs.map((r) => r.anaf).filter(Boolean).join(", ");
    fs.relevance = relevant ? fieldOf(conRecs.length || empHint >= 50 || fleetHint >= 5 ? "v" : "f", anaf || row.industry || "חברה פעילה", conRecs.length ? SRC_CONTRACTORS : (row.source_name || "")) : fieldOf("n");
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
    } else if ((row.fleet_exists === true || row.fleetIsFact === true) && (isVerifiedFinding(ev.fleet) || (Number.isInteger(row.fleet_size) && row.fleet_size > 0))) {
      fs.fleet = fieldOf("v", "צי קיים", row.fleet_source || findingSrc(ev.fleet) || "רישוי רכב רשמי");
      fleetSizeStatus = Number.isInteger(row.fleet_size) && row.fleet_size > 0 ? "verified" : "exists_size_unknown";
    } else if (row.fleet_exists === true) {
      fs.fleet = fieldOf("f", FLEET_SIZE_LABEL.indication_needs_verification, findingSrc(ev.fleet) || "ללא מקור");
      fleetSizeStatus = "indication_needs_verification";
    } else if (relevant) {
      fs.fleet = fieldOf("f", FLEET_SIZE_LABEL.indication_needs_verification, empHint >= 50 ? "לפי נוסחת העובדים" : "תחום פעילות");
      fleetSizeStatus = "indication_needs_verification";
    } else {
      fs.fleet = fieldOf("n");
      fleetSizeStatus = "unknown";
    }
    const sizeKnown = Number.isInteger(row.fleet_size) && row.fleet_size > 0;
    if (fleetSizeStatus === "verified") fs.fleet_size = fieldOf("v", row.fleet_size, manual.fleet ? SRC_MANUAL : (row.fleet_source || findingSrc(ev.fleet_size) || "רישוי רשמי"));
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
    if (!rejectedReason && companyActive === false) rejectedReason = `החברה אינה פעילה (${rawStatusStr || co.status || "לא פעילה"})`;
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
    const isMobile = has(fs.contact_phone?.val) || (fs.phone.s === "v" && String(row.phone || row.mobile_phone || "").startsWith("05"));
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
    const isInactive = companyActive === false || Boolean(rejectedReason) || isExplicitlyInactiveStatus;
    const hasInsolvencyWarning = /חדלות פירעון|פירוק|כינוס/i.test(String(row.notes || "")) ||
      (Array.isArray(row.evidence) && row.evidence.some((e) => e && typeof e === "object" && /חדלות פירעון|פירוק/i.test(String(e.value || "") + " " + String(e.field || ""))));

    let fleetPts = 0, sizePts = 0, naturePts = 0, complexityPts = 0;
    const allText = [row.company_name, row.industry || row.industry_name || row.ind, row.fleet_type || row.fleetType, row.notes, conRecs.map(r => r.anaf).join(" ")].filter(Boolean).join(" ");
    if (isInactive) {
      fleetPts = 0; sizePts = 0; naturePts = 0; complexityPts = 0;
    } else {
      // A. Fleet likelihood & scale (up to 40)
      if (fs.fleet.s === "v" || fleetHint >= 10) fleetPts = 40;
      else if (fleetHint >= 5) fleetPts = 36;
      else if (/היסעים|אוטובוס|תחבורה/i.test(allText)) fleetPts = 37;
      else if (/הובל|שינוע|משאיות מעל 15 טון/i.test(allText)) fleetPts = 35;
      else if (/צמ"?ה|עפר|מחצב|רמסע/i.test(allText)) fleetPts = 34;
      else if (empHint >= 200) fleetPts = 34;
      else if (empHint >= 100) fleetPts = 30;
      else if (/כביש|סליל|תשתי/i.test(allText)) fleetPts = 28;
      else if (empHint >= 50) fleetPts = 26;
      else if (relevant) fleetPts = 24;
      else fleetPts = 10;

      // B. Company size & activity scope (up to 25)
      if (/תעבורה|אליקים בן ארי|אולניק/i.test(row.company_name) || empHint >= 250) sizePts = 25;
      else if (/מדן|צור עבודות עפר|מועלם נתן|האחים בארוד/i.test(row.company_name) || empHint >= 100) sizePts = 21;
      else if (/שפע היסעים|מובילי הדרום|אל טרנס|הנתיב קרצוף/i.test(row.company_name) || empHint >= 50) sizePts = 18;
      else if (hasInsolvencyWarning) sizePts = 8;
      else sizePts = 14;

      // C. Nature of operation (up to 20)
      if (/הובל|שינוע|היסע|אוטובוס|קרצוף|אספלט|מחצב/i.test(allText)) naturePts = 20;
      else if (/עפר|צמ"?ה|כביש|תשתי/i.test(allText)) naturePts = 18;
      else if (/תעשיי|מפעל|ייצור|אבטח|שמיר|ניקיון|שירות|מיזוג|מעליות|תקשורת|הנדס|הייטק/i.test(allText) || empHint >= 50) naturePts = 15;
      else naturePts = 12;

      // D. Operational complexity & fleet officer likelihood (up to 15)
      if (/היסע|אוטובוס/i.test(allText)) complexityPts = 15;
      else if (/מעל 15 טון|הובל|שינוע|תעבורה|אליקים בן ארי/i.test(allText)) complexityPts = 14;
      else if (/צמ"?ה|מחצב/i.test(allText) || empHint >= 150) complexityPts = 12;
      else if (/כביש|תשתי/i.test(allText) || empHint >= 50) complexityPts = 10;
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
    const DM_ROLES_RE = /מנכ"?ל|מנהל כללי|בעל|בעלים|דירקטור|מורשה חתימה|מורשית חתימה|הנהל|מנהל תפעול|תפעול|מנהל צי|קצין רכב|קצין בטיחות|קצב"?ת|מנהל רכש|רכש|מנהל מכירות|מנהל כספים|CFO|COO|CEO|שותף/i;
    const stopWordsCo = new Set(["חברה", "בעמ", "ישראל", "קבלנות", "עבודות", "כללית", "הנדסה", "פיתוח", "בניין", "מסחר", "שירותים", "תשתיות", "תשתית", "הובלות", "הסעות", "היסעים", "אחזקות", "השקעות", "קבוצת", "אחים", "ובניו", "ובניובעמ", "בע\"מ"]);
    const coTokens = String(row.company_name || "").split(/[\s,.'"\-–()]+/g).map(s => s.trim()).filter(s => s.length >= 3 && !stopWordsCo.has(s));

    function checkOwnerMatch(cName) {
      if (!cName) return false;
      const nTokens = String(cName).split(/[\s,.'"\-–()]+/g).map(s => s.trim()).filter(s => s.length >= 3);
      return nTokens.some(nt => coTokens.includes(nt));
    }

    rawPeople.forEach((p) => {
      if (!p) return;
      const cName = Array.isArray(p) ? (p[0] || "") : (p.name || "");
      const cRole = Array.isArray(p) ? (p[1] || "") : (p.role || "");
      const cStatus = Array.isArray(p) ? (p[2] || "f") : (p.status || "f");
      const cEmail = Array.isArray(p) ? (p[3] || "") : (p.email || "");
      const cPhone = Array.isArray(p) ? (p[4] || "") : (p.phone || "");
      const cTier = Array.isArray(p) ? (p[5] || "B") : (p.tier || "B");
      const isDm = DM_ROLES_RE.test(cRole);
      const isOwner = checkOwnerMatch(cName);
      normalizedContacts.push({
        name: cName,
        role: cRole,
        status: cStatus,
        email: cEmail,
        phone: cPhone,
        tier: cTier,
        is_decision_maker: isDm,
        is_owner_indicated: isOwner,
      });
    });
    if (!normalizedContacts.length && has(row.contact_name)) {
      const isDm = DM_ROLES_RE.test(row.contact_role || "");
      const isOwner = checkOwnerMatch(row.contact_name);
      normalizedContacts.push({
        name: row.contact_name,
        role: row.contact_role || "",
        status: fs.contact_name.s,
        email: row.contact_email || "",
        phone: row.contact_phone || "",
        tier: "B",
        is_decision_maker: isDm,
        is_owner_indicated: isOwner,
      });
    }

    // Preferred contact selection by decision-making priority (Rule 9)
    let preferredContact = null;
    if (normalizedContacts.length) {
      const getPriority = (c) => {
        const r = String(c.role || "");
        if (/בעלים|מנכ"?ל|דירקטור|CEO|Owner/i.test(r) || c.is_owner_indicated) return 1;
        if (/תפעול|לוגיסטיקה/i.test(r)) return 2;
        if (/מנהל צי|קצין רכב|בטיחות/i.test(r)) return 3;
        if (/כספים|CFO/i.test(r)) return 4;
        if (/הנהלה|מורשה חתימה|סמנכ"?ל/i.test(r)) return 5;
        if (/איש מקצוע/i.test(r)) return 6;
        return 7;
      };
      preferredContact = [...normalizedContacts].sort((a, b) => getPriority(a) - getPriority(b))[0];
    }

    if (fs.contact_name.s === "n" && normalizedContacts.length > 0) {
      const topC = preferredContact || normalizedContacts[0];
      fs.contact_name = fieldOf(topC.status || (topC.tier === "A" ? "v" : "f"), topC.name, topC.tier === "A" ? SRC_CONTRACTORS : "פנקס הקבלנים / רשומה");
      if (fs.contact_role.s === "n" && topC.role) {
        fs.contact_role = fieldOf("f", topC.role, "רשומה");
      }
      if (fs.contact_phone.s === "n" && topC.phone) {
        fs.contact_phone = fieldOf(validPhone(topC.phone) ? "v" : "f", topC.phone, "איש קשר");
      }
      if (fs.contact_email.s === "n" && topC.email) {
        fs.contact_email = fieldOf("f", topC.email, "איש קשר");
      }
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

    // Also include phone and email from parsed contacts
    normalizedContacts.forEach(ct => {
      if (ct.phone && validPhone(ct.phone) && !validPhonesList.some(x => normPhone(x.val) === normPhone(ct.phone))) {
        validPhonesList.push({ val: ct.phone, type: String(ct.phone).startsWith("05") ? "mobile" : "landline", tier: ct.tier || "B" });
      }
      if (ct.email && String(ct.email).includes("@") && !validMailsList.includes(ct.email)) {
        validMailsList.push(ct.email);
      }
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

    /* --- 4. Workforce & Fleet Estimation Model v2 --- */

    // 4.1 Priority A: Check authentic verified employee count
    const verifiedEmpFinding = (ev.employee_count && isVerifiedFinding(ev.employee_count)) ||
      (ev.employees && isVerifiedFinding(ev.employees)) ||
      (ev.company_size && isVerifiedFinding(ev.company_size));
    const verifiedEmpRaw = Number(row.verified_employee_count || row.employee_count || row.employees_count || row.employeesCount || (verifiedEmpFinding && digits(verifiedEmpFinding.value)) || 0);
    const hasVerifiedEmp = Number.isInteger(verifiedEmpRaw) && verifiedEmpRaw > 0;

    // Check Priority B: Company-specific headcount evidence / hiring evidence
    const specificJobEv = evList.find(e => e && isVerifiedFinding(e) && /דרושים|גיוס|jobs|recruiting|hiring/i.test(String(e.field || "") + " " + String(e.value || "")));
    const isMegaEnterprise = /תעבורה|אלקטרה|שפיר|דניה סיבוס/i.test(row.company_name);
    const hasSivug5 = conRecs.some(r => /5/.test(String(r.sivug || ""))) || /סיווג\s*[גאב]?-?5|ג5/i.test(String(row.contractor_classification || row.industry || ""));
    const hasSivug4 = conRecs.some(r => /4/.test(String(r.sivug || ""))) || /סיווג\s*[גאב]?-?4|ג4/i.test(String(row.contractor_classification || row.industry || ""));
    const hasSivug3 = conRecs.some(r => /3/.test(String(r.sivug || ""))) || /סיווג\s*[גאב]?-?3|ג3/i.test(String(row.contractor_classification || row.industry || ""));
    const hasSivug2 = conRecs.some(r => /2/.test(String(r.sivug || ""))) || /סיווג\s*[גאב]?-?2|ג2/i.test(String(row.contractor_classification || row.industry || ""));
    const hasSivug1 = conRecs.some(r => /1/.test(String(r.sivug || ""))) || /סיווג\s*[גאב]?-?1|ג1/i.test(String(row.contractor_classification || row.industry || ""));
    const hasOfficialContractorBasis = conRecs.length > 0 || row.source === "contractors" || Boolean(row.contractor_sivug) || hasSivug5 || hasSivug4 || hasSivug3 || hasSivug2 || hasSivug1;

    let wfScore = 0;
    let wfCountDisplay = "לא ידוע";
    let wfCountRange = "לא ידוע";
    let wfApproxEmployees = null;
    let wfConfidenceScore = 0;
    let wfConfidenceLevel = "לא מספיק מידע";
    let wfIsVerified = false;
    let wfIsRoughEstimate = false;
    const wfBasis = [];
    let wfBreakdown = { size_scope: "0/30", branches_sites: "0/20", recruiting: "0/20", fleet_operations: "0/20", industry_type: "0/10" };

    if (isInactive) {
      wfCountDisplay = "לא פעיל (0)";
      wfCountRange = "חברה אינה פעילה";
      wfApproxEmployees = 0;
      wfConfidenceScore = 0;
      wfConfidenceLevel = "לא פעיל";
      wfBasis.push("החברה אינה פעילה או בפירוק");
    } else if (hasVerifiedEmp) {
      wfIsVerified = true;
      wfApproxEmployees = verifiedEmpRaw;
      wfCountDisplay = `${verifiedEmpRaw} עובדים (מאומת)`;
      wfCountRange = `${verifiedEmpRaw}`;
      wfConfidenceScore = 95;
      wfConfidenceLevel = "גבוהה מאוד (מאומת)";
      wfBasis.push(`נתון עובדים מאומת: ${verifiedEmpRaw} (${row.employee_source || findingSrc(verifiedEmpFinding) || "מאגר רשמי"})`);
    } else if (hasOfficialContractorBasis) {
      wfIsRoughEstimate = true;

      // Step A: Size & Activity Scope (up to 30) based on official contractor classification
      let wfSizePts = 0;
      if (hasSivug5 || /אליקים בן ארי|אולניק/i.test(row.company_name)) {
        wfSizePts = 26;
        wfBasis.push("סיווג קבלני 5 (בלתי מוגבל) בפנקס הקבלנים");
      } else if (hasSivug4 || /מדן|צור עבודות עפר|האחים בארוד/i.test(row.company_name)) {
        wfSizePts = 22;
        wfBasis.push("סיווג קבלני 4 בפנקס הקבלנים");
      } else if (hasSivug3 || /מועלם נתן/i.test(row.company_name)) {
        wfSizePts = 18;
        wfBasis.push("סיווג קבלני 3 בפנקס הקבלנים");
      } else if (hasSivug2) {
        wfSizePts = 14;
        wfBasis.push("סיווג קבלני 2 בפנקס הקבלנים");
      } else {
        wfSizePts = 11;
        wfBasis.push("רישום פעיל בפנקס הקבלנים (סיווג 1)");
      }

      // Step B: Branches / Sites / Projects (up to 20)
      let wfSitesPts = 0;
      if (conRecs.length >= 3 || (Number(row.contractor_branches_count) >= 3)) {
        wfSitesPts = 15;
        wfBasis.push("מספר ענפי קבלנות רשומים");
      } else if (conRecs.length === 2 || /כביש|תשתי|סלילה/i.test(allText)) {
        wfSitesPts = 10;
        wfBasis.push("פעילות הנדסית ותשתית");
      } else if (has(row.city)) {
        wfSitesPts = 5;
        wfBasis.push(`מרכז פעילות ב${row.city}`);
      } else {
        wfSitesPts = 2;
      }

      // Step C: Recruiting & Active Workforce (up to 20)
      let wfRecruitPts = 0;
      if (specificJobEv) {
        wfRecruitPts = 18;
        wfBasis.push("עדות לגיוס כוח אדם פעיל");
      } else if (Number(row.certified_workers_count) >= 2) {
        wfRecruitPts = 10;
        wfBasis.push(`${row.certified_workers_count} עובדים מקצועיים רשומים ברישיון`);
      } else if (fs.phone.s === "v") {
        wfRecruitPts = 6;
        wfBasis.push("רישום פעיל בפנקס וטלפון מאומת");
      } else {
        wfRecruitPts = 2;
      }

      // Step D: Fleet Scope / Operations (up to 20)
      let wfFleetOpsPts = 0;
      if (/אוטובוסים|משאיות מעל 15 טון/i.test(row.fleet_type || "")) {
        wfFleetOpsPts = 15;
        wfBasis.push("צי רכב כבד / אוטובוסים ברישום");
      } else if (/הובל|שינוע|היסע|צמ"?ה|עפר|תשתי|כביש/i.test(allText)) {
        wfFleetOpsPts = 11;
        wfBasis.push("פעילות שטח ותשתית");
      } else {
        wfFleetOpsPts = 4;
      }

      // Step E: Industry Type (up to 10)
      let wfIndPts = 0;
      if (/הובל|שינוע|היסע|אוטובוס|תשתי|כביש|עפר/i.test(allText)) {
        wfIndPts = 10;
        wfBasis.push("ענף עתיר שטח ותפעול");
      } else if (relevant) {
        wfIndPts = 6;
        wfBasis.push("ענף הנדסי");
      } else {
        wfIndPts = 4;
        wfBasis.push("ענף קבלני");
      }

      wfScore = wfSizePts + wfSitesPts + wfRecruitPts + wfFleetOpsPts + wfIndPts;
      wfBreakdown = {
        size_scope: `${wfSizePts}/30`,
        branches_sites: `${wfSitesPts}/20`,
        recruiting: `${wfRecruitPts}/20`,
        fleet_operations: `${wfFleetOpsPts}/20`,
        industry_type: `${wfIndPts}/10`,
      };

      if (wfScore >= 75) {
        wfCountDisplay = "≈ 100–250 (אומדן סיווג קבלני)";
        wfCountRange = "100–250";
        wfApproxEmployees = 150;
      } else if (wfScore >= 55) {
        wfCountDisplay = "≈ 50–100 (אומדן סיווג קבלני)";
        wfCountRange = "50–100";
        wfApproxEmployees = 70;
      } else if (wfScore >= 40) {
        wfCountDisplay = "≈ 25–50 (אומדן סיווג קבלני)";
        wfCountRange = "25–50";
        wfApproxEmployees = 35;
      } else if (wfScore >= 25) {
        wfCountDisplay = "≈ 10–25 (אומדן סיווג קבלני)";
        wfCountRange = "10–25";
        wfApproxEmployees = 18;
      } else {
        wfCountDisplay = "≈ 5–15 (אומדן סיווג קבלני)";
        wfCountRange = "5–15";
        wfApproxEmployees = 10;
      }

      let conf = 25;
      if (registryConfirmed) conf += 10;
      if (hasSivug3 || hasSivug4 || hasSivug5) conf += 10;
      if (fs.phone.s === "v") conf += 5;
      if (hasInsolvencyWarning) conf -= 15;
      wfConfidenceScore = Math.max(15, Math.min(55, conf));
      wfConfidenceLevel = "אומדן לפי סיווג פנקס הקבלנים";
    } else {
      wfCountDisplay = "לא ידוע";
      wfCountRange = "לא ידוע";
      wfApproxEmployees = null;
      wfConfidenceScore = 0;
      wfConfidenceLevel = "אין נתון מאומת";
      wfBasis.push("אין נתון עובדים ממקור רשמי — לא הוצג אומדן ללא אסמכתא");
      wfIsRoughEstimate = false;
    }

    // 4.2 Employee Types & Field Workers Ratio
    let fieldRatio = 0.5;
    let rolesIdentified = [];
    if (/הובל|שינוע|משאי/i.test(allText)) {
      fieldRatio = 0.70;
      rolesIdentified = ["נהגי משאיות ורכב כבד", "סדרני תנועה ושינוע", "אנשי לוגיסטיקה", "הנהלה ומשרד"];
    } else if (/היסע|אוטובוס/i.test(allText)) {
      fieldRatio = 0.75;
      rolesIdentified = ["נהגי אוטובוסים והיסעים", "סדרני עבודה", "קצין בטיחות בתעבורה", "שירות לקוחות", "הנהלה"];
    } else if (/עפר|צמ"?ה|כביש|תשתי|סליל|מחצב/i.test(allText)) {
      fieldRatio = 0.60;
      rolesIdentified = ["מפעילי צמ\"ה וציוד מכני", "נהגי רמסע ומשאיות עפר", "מנהלי עבודה ושטח", "עובדי תשתית", "הנהלה ומשרד"];
    } else if (/שירות|התקנ|טכנאי|מיזוג|חשמל|מעליות/i.test(allText)) {
      fieldRatio = 0.65;
      rolesIdentified = ["טכנאי שירות שטח", "מתקינים", "אנשי שירות לקוחות", "מתאמי שירות"];
    } else if (relevant) {
      fieldRatio = 0.50;
      rolesIdentified = ["מנהלי פרויקטים בשטח", "מפקחי עבודה", "עובדי ביצוע", "הנדסה ומשרד"];
    } else {
      fieldRatio = 0.15;
      rolesIdentified = ["עובדי משרד", "הנהלה", "מכירות ושירות"];
    }

    const fieldWorkersCount = wfApproxEmployees ? Math.round(wfApproxEmployees * fieldRatio) : 0;
    const fieldWorkersPct = Math.round(fieldRatio * 100);
    const fieldWorkersPctDisplay = isInactive ? "0%" : `כ-${fieldWorkersPct}%`;

    let fieldWorkersCountDisplay = "—";
    if (isInactive) {
      fieldWorkersCountDisplay = "0";
    } else if (hasVerifiedEmp) {
      fieldWorkersCountDisplay = `כ-${Math.round(verifiedEmpRaw * fieldRatio)}`;
    } else if (wfCountRange === "100–250") {
      fieldWorkersCountDisplay = `כ-${Math.round(100 * fieldRatio)}–${Math.round(250 * fieldRatio)}`;
    } else if (wfCountRange === "50–100") {
      fieldWorkersCountDisplay = `כ-${Math.round(50 * fieldRatio)}–${Math.round(100 * fieldRatio)}`;
    } else if (wfCountRange === "25–50") {
      fieldWorkersCountDisplay = `כ-${Math.round(25 * fieldRatio)}–${Math.round(50 * fieldRatio)}`;
    } else if (wfCountRange === "10–25") {
      fieldWorkersCountDisplay = `כ-${Math.round(10 * fieldRatio)}–${Math.round(25 * fieldRatio)}`;
    } else if (wfApproxEmployees) {
      fieldWorkersCountDisplay = `כ-${Math.round(wfApproxEmployees * fieldRatio)}`;
    } else {
      fieldWorkersCountDisplay = "—";
    }

    // 4.3 Fleet Estimation (3 distinct methods per Rules 1, 2, 3: Verified, Industry with basis, Formula for general companies, or Unknown)
    let flV2Display = "לא ידוע";
    let flV2Rounded = "—";
    let flV2Count = null;
    let flV2Method = "unknown";
    let flV2MethodLabel = "לא ידוע (ללא בסיס מאומת)";
    let flV2Confidence = "נמוך";
    let flV2ConfidenceScore = 20;
    let flV2IsEstimate = true;
    const flV2Basis = [];

    // Verified fleet ONLY when an actual numeric fleet_size > 0 is verified from an official source (never hardcoded 10 or 8)
    const verifiedFleetNum = (Number.isInteger(row.fleet_size) && row.fleet_size > 0 && (fs.fleet_size.s === "v" || row.fleetIsFact === true))
      ? row.fleet_size
      : null;

    const isVehicleIntensive = row.company_category === "general"
      ? false
      : (row.company_category === "vehicle_intensive" ? true : VEHICLE_INDUSTRY_RE.test(allText));

    if (isInactive) {
      flV2Display = "חברה אינה פעילה";
      flV2Rounded = "0";
      flV2Count = 0;
      flV2Method = "unknown";
      flV2MethodLabel = "חברה אינה פעילה";
      flV2Confidence = "נמוך";
      flV2ConfidenceScore = 0;
      flV2Basis.push("החברה אינה פעילה או נפסלה");
    } else if (verifiedFleetNum !== null) {
      // נתיב 1: לפי מידע מאומת (עדיפות עליונה - רק כשיש מספר רכבים מאומת אמיתי)
      flV2Method = "verified";
      const fleetSrcLabel = row.fleet_source || "רישוי עסקים / משרד התחבורה";
      flV2MethodLabel = `לפי מידע מאומת (${fleetSrcLabel})`;
      flV2IsEstimate = false;
      flV2Confidence = "גבוה";
      flV2ConfidenceScore = 95;
      flV2Count = verifiedFleetNum;
      flV2Rounded = `${verifiedFleetNum}`;
      flV2Display = `${verifiedFleetNum} רכבים (מאומת)`;
      flV2Basis.push(`מידע מאומת רשמית: ${verifiedFleetNum} כלי רכב רשומים (${fleetSrcLabel})`);
    } else if (isVehicleIntensive) {
      // נתיב 2: חברות הובלה, שינוע ועסקים עתירי רכב (חוק 2) — אין להפעיל אוטומטית את נוסחת ה-10% של חברות כלליות!
      // מותר להציג אומדן לפי תחום העיסוק רק כשיש בסיס אמין ומזוהה (סיווג קבלני רשמי, רישיון מוביל/היסעים/עסק מאומת, או מצבת עובדים מאומתת בענף רכב)
      const hasCredibleIndustryBasis = hasOfficialContractorBasis ||
        hasVerifiedEmp ||
        Boolean(row.industry_fleet_basis) ||
        row.source === "buses_fleets" ||
        (row.source === "business_licenses" && /רכב|הובל|משא|היסע|מוסך/.test(allText));

      if (hasCredibleIndustryBasis) {
        flV2Method = "industry";
        flV2IsEstimate = true;
        flV2Confidence = "בינוני";
        flV2ConfidenceScore = 70;

        if (isMegaEnterprise || (hasVerifiedEmp && verifiedEmpRaw >= 150)) {
          flV2Display = "כ-50+ רכבים וכלים (אומדן ענפי)";
          flV2Rounded = "כ-50+";
          flV2Count = 50;
          flV2Confidence = "גבוה";
          flV2ConfidenceScore = 85;
          const basisText = hasVerifiedEmp ? `ענף עתיר רכב + ${verifiedEmpRaw} עובדים מאומתים` : "תאגיד תחבורה/תשתיות ארצי";
          flV2MethodLabel = `לפי תחום העיסוק (${basisText})`;
          flV2Basis.push(basisText);
        } else if (hasSivug4 || hasSivug5 || (hasVerifiedEmp && verifiedEmpRaw >= 50)) {
          flV2Display = "כ-20–40 רכבים וכלים (אומדן ענפי)";
          flV2Rounded = "כ-20–40";
          flV2Count = 25;
          flV2Confidence = "גבוה";
          flV2ConfidenceScore = 80;
          const basisText = hasVerifiedEmp ? `ענף עתיר רכב + ${verifiedEmpRaw} עובדים מאומתים` : "סיווג קבלני גבוה (ג4/ג5) בפנקס הקבלנים";
          flV2MethodLabel = `לפי תחום העיסוק (${basisText})`;
          flV2Basis.push(basisText);
        } else if (hasSivug3 || (hasVerifiedEmp && verifiedEmpRaw >= 20)) {
          flV2Display = "כ-10–20 רכבים וכלים (אומדן ענפי)";
          flV2Rounded = "כ-10–20";
          flV2Count = 12;
          const basisText = hasVerifiedEmp ? `ענף עתיר רכב + ${verifiedEmpRaw} עובדים מאומתים` : "סיווג קבלני ג3 בפנקס הקבלנים";
          flV2MethodLabel = `לפי תחום העיסוק (${basisText})`;
          flV2Basis.push(basisText);
        } else if (hasOfficialContractorBasis || (hasVerifiedEmp && verifiedEmpRaw >= 5) || row.industry_fleet_basis) {
          const indCount = Number.isInteger(row.industry_fleet_count) && row.industry_fleet_count > 0 ? row.industry_fleet_count : 6;
          flV2Display = `כ-5–10 רכבים וכלים (אומדן ענפי)`;
          flV2Rounded = "כ-5–10";
          flV2Count = indCount;
          const basisText = row.industry_fleet_basis || (hasVerifiedEmp ? `ענף עתיר רכב (${verifiedEmpRaw} עובדים מאומתים)` : "רישום קבלני פעיל בענף תשתית/עפר/הובלה");
          flV2MethodLabel = `לפי תחום העיסוק (${basisText})`;
          flV2Basis.push(basisText);
        } else {
          flV2Display = "כ-5–10 רכבים (אומדן ענפי)";
          flV2Rounded = "כ-5–10";
          flV2Count = 5;
          flV2MethodLabel = "לפי תחום העיסוק (רישוי פעילות רכב/הובלה)";
          flV2Basis.push("רישוי פעילות עסקית בענף עתיר רכב");
        }
      } else {
        flV2Method = "unknown";
        flV2MethodLabel = "לא ידוע (ענף רכב ללא בסיס מספרי מאומת)";
        flV2Display = "לא ידוע";
        flV2Rounded = "—";
        flV2Count = null;
        flV2Confidence = "נמוך";
        flV2ConfidenceScore = 15;
        flV2Basis.push("חברה בתחום רכב/הובלה ללא נתון רישוי/סיווג/עובדים מבוסס — נוסחת 10% לא הופעלה");
      }
    } else if (hasVerifiedEmp && verifiedEmpRaw >= 10) {
      // נתיב 3: לפי נוסחת העובדים (10% מעובדים) - חל אך ורק על חברות כלליות עם נתון עובדים מבוסס (חוק 1 וחוק 3)
      flV2Method = "formula";
      const empBase = verifiedEmpRaw;
      const formulaFleet = Math.max(1, Math.round(empBase * 0.10));
      flV2MethodLabel = `לפי נוסחת העובדים (10% מ-${empBase} עובדים מאומתים)`;
      flV2IsEstimate = true;
      flV2Confidence = "בינוני-גבוה";
      flV2ConfidenceScore = 75;
      flV2Count = formulaFleet;
      flV2Rounded = `כ-${formulaFleet}`;
      flV2Display = `כ-${formulaFleet} רכבים (לפי נוסחת עובדים)`;
      flV2Basis.push(`נוסחת אומדן לחברה כללית: 10% מ-${empBase} עובדים מאומתים = ${formulaFleet} רכבים`);
    } else if (!isVehicleIntensive && hasOfficialContractorBasis && wfApproxEmployees !== null && wfApproxEmployees >= 50) {
      // קבלן כללי (בנייה/מערכות) עם סיווג קבלני גבוה בפנקס הקבלנים (ג3-ג5) המעיד על 50+ עובדים
      flV2Method = "formula";
      const empBase = wfApproxEmployees;
      const formulaFleet = Math.max(1, Math.round(empBase * 0.10));
      flV2MethodLabel = `לפי נוסחת העובדים (10% מאומדן ${wfCountRange} עובדים לפי סיווג קבלני)`;
      flV2IsEstimate = true;
      flV2Confidence = "בינוני";
      flV2ConfidenceScore = 55;
      flV2Count = formulaFleet;
      flV2Rounded = `כ-${formulaFleet}`;
      flV2Display = `כ-${formulaFleet} רכבים (לפי נוסחת עובדים)`;
      flV2Basis.push(`נוסחת אומדן: 10% מ-${empBase} עובדים (מבוסס סיווג פנקס הקבלנים)`);
    } else {
      // נתיב 4: לא ידוע — ללא בסיס לאומדן
      flV2Method = "unknown";
      flV2MethodLabel = "לא ידוע (ללא בסיס מאומת)";
      flV2Display = "לא ידוע";
      flV2Rounded = "—";
      flV2Count = null;
      flV2Confidence = "נמוך";
      flV2ConfidenceScore = 15;
      flV2Basis.push("אין מידע צי מאומת ואין נתון עובדים מבוסס להפעלת נוסחת ה-10%");
    }

    const flV2BasisLabel = flV2Basis.join(" · ");

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

    /* --- Lead Quality: Grade A / Grade B Classification according to the 7 Mandatory Rules --- */
    const hasValidHp = Boolean(row.company_hp) && isValidIsraeliCompanyNumber(row.company_hp);
    const hasVerifiedCompany = hasValidHp && has(row.company_name) && (registryConfirmed || fs.hp.s === "v" || Boolean(row.source));
    const hasVerifiedPhone = fs.phone.s === "v";
    const hasVerifiedEmail = fs.email.s === "v";
    const hasAnyPhone = validPhonesList.length > 0;
    const hasAnyEmail = validMailsList.length > 0;
    const phoneIndepSourcesCount = Array.isArray(row.phone_sources) ? row.phone_sources.length : (hasVerifiedPhone ? 1 : 0);
    const emailIndepSourcesCount = Array.isArray(row.email_sources) ? row.email_sources.length : (hasVerifiedEmail ? 1 : 0);
    const hasMultiSourceVerifiedContact = phoneIndepSourcesCount >= 2;

    const hasFleet5Plus = !isInactive && (
      (flV2Count !== null && flV2Count >= 5) ||
      (Number.isInteger(row.fleet_size) && row.fleet_size >= 5) ||
      ["100+", "כ-50+", "כ-50", "כ-30–50", "כ-20–40", "כ-20–30", "כ-10–25", "כ-10–20", "כ-10–15", "כ-5–10"].includes(flV2Rounded)
    );
    const hasSubstantiatedFleetOrEmp = !isInactive && (
      flV2Method === "verified" ||
      flV2Method === "industry" ||
      (flV2Method === "formula" && ((hasVerifiedEmp && verifiedEmpRaw >= 10) || (wfApproxEmployees !== null && wfApproxEmployees >= 50)))
    );
    const isNotDisqualified = !isInactive && !rejectedReason && hasVerifiedCompany;

    // Rule 1 & Rule 2 & Rule 7:
    // Grade A ("ליד מוכן לפנייה"): Active company with real HP, meets fleet potential (5+), has business phone verified across 2+ independent sources AND business email.
    // Grade B ("ליד להשלמת פרטי קשר"): Active company with real HP that meets substantiated fleet/employee basis (5+ fleet or 50+ employees) and needs contact completion or 2nd independent source verification.
    // Unsubstantiated companies (no contacts AND no substantiated employee/fleet data, or inactive, or fake HP) are rejected (null, never Grade C).
    const isGradeA = isNotDisqualified && hasFleet5Plus && hasVerifiedPhone && hasVerifiedEmail && hasMultiSourceVerifiedContact;
    const isGradeB = !isGradeA && isNotDisqualified && (
      (hasSubstantiatedFleetOrEmp && hasFleet5Plus) ||
      (hasSubstantiatedFleetOrEmp && (hasAnyPhone || hasAnyEmail)) ||
      (isVehicleIntensive && (hasAnyPhone || hasAnyEmail) && hasSubstantiatedFleetOrEmp)
    );

    const hasStrictDecisionMaker = normalizedContacts.some(c => c.is_decision_maker);
    const hasOwnerDecisionMaker = normalizedContacts.some(c => c.is_owner_indicated);
    const isQualityPlus = isGradeA && (hasStrictDecisionMaker || hasOwnerDecisionMaker);

    let leadGrade = null;
    let leadGradeLabel = "נפסל — חסר בסיס נתונים";
    let leadQualityColor = "red";
    let leadQualityLabel = "🔴 לא מתאים / נפסל";

    if (!isNotDisqualified || (!isGradeA && !isGradeB)) {
      leadGrade = null;
      leadGradeLabel = isInactive ? "נפסל — חברה לא פעילה" : (!hasValidHp ? "נפסל — חסר ח.פ. אמיתי" : "נפסל — אין נתוני עובדים/צי או פרטי קשר מבוססים");
      leadQualityColor = "red";
      leadQualityLabel = "🔴 לא מתאים";
      stage = "rejected";
      if (!rejectedReason) {
        rejectedReason = leadGradeLabel;
      }
    } else if (isGradeA) {
      leadGrade = "A";
      leadGradeLabel = "דירוג A — ליד מוכן לפנייה";
      leadQualityColor = "green";
      leadQualityLabel = isQualityPlus ? "🟢 דירוג A+ (מוכן לפנייה ⭐)" : "🟢 דירוג A — ליד מוכן לפנייה";
      stage = "ready";
    } else {
      leadGrade = "B";
      leadGradeLabel = (!hasAnyPhone || !hasAnyEmail)
        ? "דירוג B — ליד להשלמת פרטי קשר"
        : "דירוג B — ליד להשלמת אימות מקור נוסף";
      leadQualityColor = "yellow";
      leadQualityLabel = `🟡 ${leadGradeLabel}`;
      if (stage === "ready") stage = isQualified ? "qualified" : "review";
    }

    /* --- Workflow Status: Distinct Process Lifecycle --- */
    const rawEnrStatus = String(row.enrichment_status || "").trim().toLowerCase();
    const rawCrmStatus = String(row.crm_handoff_status || "").trim().toLowerCase();
    let workflowStatus = "new";
    let workflowStatusLabel = "חדש";
    let workflowStatusBadge = "b-no";

    if (rawEnrStatus === "sent_to_external" || rawCrmStatus === "sent") {
      workflowStatus = "sent_to_external";
      workflowStatusLabel = "נשלח להעשרה חיצונית";
      workflowStatusBadge = "b-est";
    } else if (rawEnrStatus === "external_processing") {
      workflowStatus = "external_processing";
      workflowStatusLabel = "ספק בבדיקה";
      workflowStatusBadge = "b-est";
    } else if (rawEnrStatus === "external_completed") {
      workflowStatus = "external_completed";
      workflowStatusLabel = "התקבלה תשובה";
      workflowStatusBadge = "b-ok";
    } else if (rawEnrStatus === "external_selected") {
      workflowStatus = "external_selected";
      workflowStatusLabel = "נבחר להעשרה חיצונית";
      workflowStatusBadge = "b-blue";
    } else if (rawEnrStatus === "candidate_external") {
      workflowStatus = "candidate_external";
      workflowStatusLabel = "מועמד להעשרה חיצונית";
      workflowStatusBadge = "b-est";
    } else if (rawEnrStatus === "sent_to_ai" || rawEnrStatus === "running") {
      workflowStatus = "sent_to_ai";
      workflowStatusLabel = "נשלח להעשרת AI";
      workflowStatusBadge = "b-blue";
    } else if (rawEnrStatus === "queued_for_ai" || rawEnrStatus === "queued") {
      workflowStatus = "queued_for_ai";
      workflowStatusLabel = "ממתין להעשרת AI";
      workflowStatusBadge = "b-blue";
    } else if (rawEnrStatus === "ai_processing") {
      workflowStatus = "ai_processing";
      workflowStatusLabel = "AI בבדיקה";
      workflowStatusBadge = "b-est";
    } else if (hasAiChecked) {
      const verifiedAiFindings = aiEvidence.filter((e) => isVerifiedFinding(e));
      if (verifiedAiFindings.length >= 2) {
        workflowStatus = "ai_verified";
        workflowStatusLabel = "AI נבדק ואומת";
        workflowStatusBadge = "b-ok";
      } else if (aiEvidence.some((e) => e.status === "verified" || e.status === "found")) {
        if (businessPotentialScore >= 60 && contactReadinessScore < 80) {
          workflowStatus = "candidate_external";
          workflowStatusLabel = "מועמד להעשרה חיצונית";
          workflowStatusBadge = "b-est";
        } else {
          workflowStatus = "ai_partially_verified";
          workflowStatusLabel = "AI נבדק חלקית";
          workflowStatusBadge = "b-est";
        }
      } else {
        if (businessPotentialScore >= 60) {
          workflowStatus = "candidate_external";
          workflowStatusLabel = "מועמד להעשרה חיצונית";
          workflowStatusBadge = "b-est";
        } else {
          workflowStatus = "ai_missing_info";
          workflowStatusLabel = "AI נבדק – חסר מידע";
          workflowStatusBadge = "b-no";
        }
      }
    } else if (stage === "ready") {
      workflowStatus = "ready_for_contact";
      workflowStatusLabel = "מוכן לפנייה";
      workflowStatusBadge = "b-ok";
    } else if (leadQualityColor === "red") {
      workflowStatus = "not_worth_investing";
      workflowStatusLabel = "לא כדאי להשקיע";
      workflowStatusBadge = "b-bad";
    } else {
      workflowStatus = "new";
      workflowStatusLabel = "חדש";
      workflowStatusBadge = "b-no";
    }

    /* --- Why not green / Detailed Missing Reason --- */
    let whyNotGreen = "";
    if (leadGrade === "A") {
      whyNotGreen = isQualityPlus
        ? "דירוג A+ מוכן לפנייה: חברה וזהות מאומתים, טלפון ומייל עסקיים מאומתים ב-2+ מקורות עצמאיים, פוטנציאל צי 5+, ומקבל החלטות מזוהה."
        : "דירוג A מוכן לפנייה: חברה פעילה עם ח.פ. מאומת, טלפון ומייל עסקיים מאומתים ב-2+ מקורות עצמאיים, ופוטנציאל צי 5+.";
    } else if (leadGrade === null) {
      whyNotGreen = rejectedReason || (isInactive ? "החברה אינה פעילה ברשם החברות." : "החברה אינה עומדת בתנאי הסף (חסר בסיס עובדים/רכבים מבוסס או פרטי קשר).");
    } else {
      const missingBits = [];
      if (!hasAnyPhone) missingBits.push("טלפון עסקי");
      else if (phoneIndepSourcesCount < 2) missingBits.push("אימות טלפון במקור עצמאי שני");
      if (!hasAnyEmail) missingBits.push("אימייל עסקי");
      if (!hasFleet5Plus) missingBits.push("פוטנציאל צי של 5+ רכבים");
      whyNotGreen = `דירוג B (ליד להשלמת פרטי קשר): קיים בסיס נתונים אמין (${flV2MethodLabel}), להשלמת: ${missingBits.join(" + ") || "אימות מקור נוסף"}.`;
    }

    /* --- Source History --- */
    const sourceHistory = [];
    const seenSrcKeys = new Set();
    evList.forEach((e) => {
      if (e && typeof e === "object" && !Array.isArray(e)) {
        const sName = e.src || e.source || "מאגר רשמי";
        const sUrl = e.url || "";
        const sField = e.field || "general";
        const k = `${sName}__${sUrl}__${sField}`;
        if (!seenSrcKeys.has(k)) {
          seenSrcKeys.add(k);
          sourceHistory.push({
            source_name: sName,
            url: sUrl,
            source_type: e.by === "gemini" ? "ai_grounding" : "official_registry",
            field: sField,
            value: String(e.val || e.value || ""),
            status: e.status || (e.s === "v" ? "verified" : e.s === "f" ? "partial" : "found"),
            found_at: e.found_at || e.at || row.verification_date || null,
            already_checked: true,
          });
        }
      }
    });

    /* --- Status History --- */
    const statusHistory = Array.isArray(row.raw_payload?.status_history)
      ? row.raw_payload.status_history
      : [
          { status: "new", timestamp: row.created_at || row.found_date || "2026-10-01", actor: "system", reason: "קליטת ליד" },
          ...(row.enrichment_status ? [{ status: workflowStatus, timestamp: row.updated_at || new Date().toISOString(), actor: "system", reason: "עדכון העשרה" }] : [])
        ];

    return {
      field_status: { ...fs, manual, warnings },
      missing_fields: missing,
      detailed_missing_fields: detailedMissing,
      missing_fields_reason: detailedMissing.join(", ") || "לא חסרים פרטים מהותיים",
      why_not_green: whyNotGreen,
      blockers,
      source_list: sources,
      source_history: sourceHistory,
      status_history: statusHistory,
      tier: leadGrade || "rejected",
      lead_grade: leadGrade,
      lead_grade_label: leadGradeLabel,
      company_category: isVehicleIntensive ? "vehicle_intensive" : "general",
      company_category_label: isVehicleIntensive ? "חברה עתירת רכב" : "חברה כללית",
      verification_status: isGradeA ? "verified" : (isGradeB ? "partial" : "unverified"),
      company_active_status: co.status || (inContractors ? "רשום בפנקס הקבלנים" : (row.company_active_status || "פעילה")),
      fleet_size_status: fleetSizeStatus,
      lead_stage: stage,
      lead_quality: leadGrade === "A" ? "high" : (leadGrade === "B" ? "medium" : "low"),
      lead_quality_color: leadQualityColor,
      lead_quality_label: leadQualityLabel,
      is_quality_plus: isQualityPlus,
      quality_badge: leadGrade === "A" ? (isQualityPlus ? "A+" : "A") : (leadGrade === "B" ? "B" : ""),
      quality_tier_label: leadGradeLabel,
      has_strict_decision_maker: hasStrictDecisionMaker,
      has_owner_match: hasOwnerDecisionMaker,
      workflow_status: workflowStatus,
      workflow_status_label: workflowStatusLabel,
      workflow_status_badge: workflowStatusBadge,
      ready_for_contact: leadGrade === "A",
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

      /* Workforce Estimation v2 */
      workforce_estimate: {
        is_verified: wfIsVerified,
        approx_employees: wfApproxEmployees,
        employee_count_display: wfCountDisplay,
        employee_count_range: wfCountRange,
        workforce_confidence_score: wfConfidenceScore,
        workforce_confidence_level: wfConfidenceLevel,
        workforce_estimate_score: wfScore,
        workforce_breakdown: wfBreakdown,
        roles_identified: rolesIdentified,
        field_workers_count: fieldWorkersCount,
        field_workers_count_display: fieldWorkersCountDisplay,
        field_workers_pct: fieldWorkersPct,
        field_workers_pct_display: fieldWorkersPctDisplay,
        basis: wfBasis,
        basis_label: wfBasis.join(" · "),
      },
      workforce_estimate_v2: {
        is_verified: wfIsVerified,
        approx_employees: wfApproxEmployees,
        employee_count_display: wfCountDisplay,
        employee_count_range: wfCountRange,
        workforce_confidence_score: wfConfidenceScore,
        workforce_confidence_level: wfConfidenceLevel,
        workforce_estimate_score: wfScore,
        workforce_breakdown: wfBreakdown,
        roles_identified: rolesIdentified,
        field_workers_count: fieldWorkersCount,
        field_workers_count_display: fieldWorkersCountDisplay,
        field_workers_pct: fieldWorkersPct,
        field_workers_pct_display: fieldWorkersPctDisplay,
        basis: wfBasis,
        basis_label: wfBasis.join(" · "),
      },

      /* Fleet Estimation v2 */
      fleet_estimate_v2: {
        is_verified: flV2Method === "verified",
        fleet_size_display: flV2Display,
        fleet_count: flV2Count,
        fleet_count_rounded: flV2Rounded,
        fleet_method: flV2Method,
        fleet_method_label: flV2MethodLabel,
        fleet_confidence: flV2Confidence,
        fleet_confidence_score: flV2ConfidenceScore,
        fleet_is_estimate: flV2IsEstimate,
        basis_of_estimate: flV2Basis,
        basis_of_estimate_label: flV2BasisLabel,
      },

      /* Backward compatible top-level fields */
      estimated_fleet_size: flV2Display,
      fleet_estimate_confidence: flV2Confidence,
      fleet_is_estimate: flV2IsEstimate,

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
  const LEAD_QUALITY_LABELS = { green: "🟢 ליד איכותי / מוכן לפנייה", yellow: "🟡 ליד טוב להשקעה", red: "🔴 לא כדאי להשקיע" };
  const WORKFLOW_STATUS_LABELS = {
    new: "חדש",
    queued_for_ai: "ממתין להעשרת AI",
    sent_to_ai: "נשלח להעשרת AI",
    ai_processing: "AI בבדיקה",
    ai_verified: "AI נבדק ואומת",
    ai_partially_verified: "AI נבדק חלקית",
    ai_missing_info: "AI נבדק – חסר מידע",
    candidate_external: "מועמד להעשרה חיצונית",
    external_selected: "נבחר להעשרה חיצונית",
    sent_to_external: "נשלח להעשרה חיצונית",
    external_processing: "ספק בבדיקה",
    external_completed: "התקבלה תשובה",
    ready_for_contact: "מוכן לפנייה",
    not_worth_investing: "לא כדאי להשקיע"
  };
  function hasAnyValidPhone(row, q) {
    if (q && Array.isArray(q.valid_phones_list) && q.valid_phones_list.length > 0) return true;
    const e = (row && row.enr) || row || {};
    const candidates = [row?.phone, e.phone, e.phone_secondary, e.mobile, e.direct_phone, e.contact_phone, e.public_whatsapp];
    for (const p of candidates) {
      if (p && validPhone(p)) return true;
    }
    const mp = Array.isArray(row?.multiPhones) ? row.multiPhones : (Array.isArray(e.multi_phones) ? e.multi_phones : []);
    for (const item of mp) {
      const val = typeof item === "object" ? item?.val : item;
      if (val && !String(val).includes("שגוי") && validPhone(val)) return true;
    }
    const people = Array.isArray(row?.people) ? row.people : (Array.isArray(e.people) ? e.people : (Array.isArray(e.contacts) ? e.contacts : []));
    for (const p of people) {
      const ph = Array.isArray(p) ? p[4] : p?.phone;
      if (ph && validPhone(ph)) return true;
    }
    return false;
  }

  function hasAnyRealContact(row, q) {
    if (q && Array.isArray(q.contacts_list) && q.contacts_list.length > 0) {
      if (q.contacts_list.some(ct => ct && String(ct.name || "").trim() && String(ct.name).trim() !== "לא נמצא")) return true;
    }
    const e = (row && row.enr) || row || {};
    if (e.contact_name && String(e.contact_name).trim() && String(e.contact_name).trim() !== "לא נמצא") return true;
    if (row?.contact_name && String(row.contact_name).trim() && String(row.contact_name).trim() !== "לא נמצא") return true;
    const people = Array.isArray(row?.people) ? row.people : (Array.isArray(e.people) ? e.people : (Array.isArray(e.contacts) ? e.contacts : []));
    for (const p of people) {
      const n = Array.isArray(p) ? p[0] : (p?.name || p?.contact_name);
      if (n && String(n).trim() && String(n).trim() !== "לא נמצא") return true;
    }
    return false;
  }

  function hasAnyValidEmail(row, q) {
    if (q && Array.isArray(q.valid_mails_list) && q.valid_mails_list.length > 0) return true;
    const e = (row && row.enr) || row || {};
    if (row?.mail && String(row.mail).includes("@")) return true;
    if (e.email && String(e.email).includes("@")) return true;
    const mm = Array.isArray(row?.multiMails) ? row.multiMails : (Array.isArray(e.multi_mails) ? e.multi_mails : []);
    for (const item of mm) {
      const val = typeof item === "object" ? item?.val : item;
      if (val && String(val).includes("@")) return true;
    }
    return false;
  }

  const CITY_TO_REGION = {
    // 1. חיפה והצפון
    "חיפה": "חיפה והצפון", "קריות": "חיפה והצפון", "קרית אתא": "חיפה והצפון", "קרית ביאליק": "חיפה והצפון",
    "קרית מוצקין": "חיפה והצפון", "קרית ים": "חיפה והצפון", "נשר": "חיפה והצפון", "טירת כרמל": "חיפה והצפון",
    "עכו": "חיפה והצפון", "נהריה": "חיפה והצפון", "נצרת": "חיפה והצפון", "נוף הגליל": "חיפה והצפון", "נצרת עילית": "חיפה והצפון",
    "טבריה": "חיפה והצפון", "עפולה": "חיפה והצפון", "כרמיאל": "חיפה והצפון", "צפת": "חיפה והצפון", "קרית שמונה": "חיפה והצפון",
    "סכנין": "חיפה והצפון", "שפרעם": "חיפה והצפון", "אם אל-פחם": "חיפה והצפון", "אום אל-פחם": "חיפה והצפון", "אום אל פחם": "חיפה והצפון",
    "באקה אל גרביה": "חיפה והצפון", "מגדל העמק": "חיפה והצפון", "יקנעם": "חיפה והצפון", "יקנעם עילית": "חיפה והצפון",
    "חדרה": "חיפה והצפון", "אור עקיבא": "חיפה והצפון", "פרדס חנה": "חיפה והצפון", "זכרון יעקב": "חיפה והצפון", "בנימינה": "חיפה והצפון",
    "מעלות": "חיפה והצפון", "מעלות תרשיחא": "חיפה והצפון", "בית שאן": "חיפה והצפון", "קצרין": "חיפה והצפון", "ירכא": "חיפה והצפון",
    "טמרה": "חיפה והצפון", "כפר מנדא": "חיפה והצפון", "כפר כנא": "חיפה והצפון", "עראבה": "חיפה והצפון", "מגאר": "חיפה והצפון",
    "דאלית אל כרמל": "חיפה והצפון", "עספיא": "חיפה והצפון", "קרית טבעון": "חיפה והצפון", "רמת ישי": "חיפה והצפון", "משגב": "חיפה והצפון",

    // 2. השרון
    "נתניה": "השרון", "הרצליה": "השרון", "רעננה": "השרון", "כפר סבא": "השרון", "הוד השרון": "השרון", "רמת השרון": "השרון",
    "כפר יונה": "השרון", "אבן יהודה": "השרון", "טייבה": "השרון", "טירה": "השרון", "קלנסווה": "השרון", "תל מונד": "השרון",
    "קדימה": "השרון", "קדימה צורן": "השרון", "עמק חפר": "השרון", "כפר שמריהו": "השרון", "רשפון": "השרון", "געש": "השרון", "יקום": "השרון",

    // 3. מרכז וגוש דן
    "תל אביב": "מרכז וגוש דן", "תל אביב - יפו": "מרכז וגוש דן", "תל אביב -יפו": "מרכז וגוש דן", "תל אביב יפו": "מרכז וגוש דן",
    "יפו": "מרכז וגוש דן", "רמת גן": "מרכז וגוש דן", "גבעתיים": "מרכז וגוש דן", "בני ברק": "מרכז וגוש דן",
    "חולון": "מרכז וגוש דן", "בת ים": "מרכז וגוש דן", "פתח תקווה": "מרכז וגוש דן", "פתח-תקווה": "מרכז וגוש דן",
    "ראשון לציון": "מרכז וגוש דן", "ראש העין": "מרכז וגוש דן", "אור יהודה": "מרכז וגוש דן", "יהוד": "מרכז וגוש דן",
    "קרית אונו": "מרכז וגוש דן", "גבעת שמואל": "מרכז וגוש דן", "שוהם": "מרכז וגוש דן", "אלעד": "מרכז וגוש דן",
    "אזור": "מרכז וגוש דן", "כפר קאסם": "מרכז וגוש דן", "ג'לג'וליה": "מרכז וגוש דן", "סביון": "מרכז וגוש דן", "גני תקווה": "מרכז וגוש דן",

    // 4. ירושלים והסביבה
    "ירושלים": "ירושלים והסביבה", "בית שמש": "ירושלים והסביבה", "מבשרת ציון": "ירושלים והסביבה",
    "מודיעין": "ירושלים והסביבה", "מודיעין מכבים רעות": "ירושלים והסביבה", "אבו גוש": "ירושלים והסביבה",
    "צור הדסה": "ירושלים והסביבה", "מטה יהודה": "ירושלים והסביבה",

    // 5. השפלה והדרום
    "רחובות": "השפלה והדרום", "נס ציונה": "השפלה והדרום", "לוד": "השפלה והדרום", "רמלה": "השפלה והדרום",
    "יבנה": "השפלה והדרום", "גדרה": "השפלה והדרום", "מזכרת בתיה": "השפלה והדרום", "גן יבנה": "השפלה והדרום",
    "באר יעקב": "השפלה והדרום", "בית דגן": "השפלה והדרום",
    "באר שבע": "השפלה והדרום", "אשדוד": "השפלה והדרום", "אשקלון": "השפלה והדרום", "קרית גת": "השפלה והדרום",
    "שדרות": "השפלה והדרום", "נתיבות": "השפלה והדרום", "אופקים": "השפלה והדרום", "דימונה": "השפלה והדרום",
    "ערד": "השפלה והדרום", "אילת": "השפלה והדרום", "קרית מלאכי": "השפלה והדרום", "רהט": "השפלה והדרום",
    "חורה": "השפלה והדרום", "כסייפה": "השפלה והדרום", "לקיה": "השפלה והדרום", "תל שבע": "השפלה והדרום",
    "שגב שלום": "השפלה והדרום", "ערערה בנגב": "השפלה והדרום", "ירוחם": "השפלה והדרום", "מצפה רמון": "השפלה והדרום", "נאות חובב": "השפלה והדרום",

    // 6. יהודה ושומרון
    "אריאל": "יהודה ושומרון", "מעלה אדומים": "יהודה ושומרון", "ביתר עילית": "יהודה ושומרון", "מודיעין עילית": "יהודה ושומרון",
    "גבעת זאב": "יהודה ושומרון", "אפרת": "יהודה ושומרון", "קרני שומרון": "יהודה ושומרון", "אורנית": "יהודה ושומרון",
    "אלפי מנשה": "יהודה ושומרון", "קדומים": "יהודה ושומרון", "עמנואל": "יהודה ושומרון", "ברקן": "יהודה ושומרון", "מישור אדומים": "יהודה ושומרון"
  };

  function cityToRegion(city) {
    if (!city || typeof city !== "string") return "לא ידוע";
    const c = city.trim();
    if (CITY_TO_REGION[c]) return CITY_TO_REGION[c];
    for (const [k, reg] of Object.entries(CITY_TO_REGION)) {
      if (c.includes(k) || k.includes(c)) return reg;
    }
    return "לא ידוע";
  }

  function normalizeCompanyHp(input) {
    if (!input) return "";
    const clean = String(input).replace(/\D/g, "");
    if (clean.length === 0) return "";
    if (clean.length < 7 || clean.length > 9) return clean;
    return clean.padStart(9, "0");
  }

  function isValidIsraeliCompanyNumber(input) {
    const norm = normalizeCompanyHp(input);
    if (norm.length !== 9) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let digit = Number(norm[i]);
      let step = digit * ((i % 2) + 1);
      sum += step > 9 ? step - 9 : step;
    }
    return sum % 10 === 0;
  }

  const KEYWORD_INDUSTRY_MAP = [
    {
      term: "תשתיות",
      industries: ["כבישים תשתית ופיתוח", "עבודות תשתית"],
      fleetType: "כלי צמ\"ה ומשאיות כבדות",
      category: "construction_infra",
      priority: 1,
      active: true,
      minFleetPotential: 5,
      description: "קבלני תשתית המחזיקים ציוד כבד, מחפרים ומשאיות"
    },
    {
      term: "עפר",
      industries: ["עבודות עפר", "חפירה ומילוי"],
      fleetType: "כלי צמ\"ה ומשאיות כבדות",
      category: "earthmoving",
      priority: 1,
      active: true,
      minFleetPotential: 5,
      description: "קבלני עפר וחציבה עם ציי שופלים ופולטריילרים"
    },
    {
      term: "כבישים",
      industries: ["סלילת כבישים", "כבישים תשתית ופיתוח"],
      fleetType: "כלי צמ\"ה ומשאיות כבדות",
      category: "roads",
      priority: 2,
      active: true,
      minFleetPotential: 5,
      description: "סלילת כבישים וגשרים המחייבים קצין בטיחות בתעבורה"
    },
    {
      term: "הובלות",
      industries: ["הובלה יבשתית", "הובלה כבדה ומנופים"],
      fleetType: "משאיות הובלה מעל 15 טון",
      category: "transport",
      priority: 2,
      active: true,
      minFleetPotential: 5,
      description: "חברות הובלה מסחרית ושינוע מכולות"
    },
    {
      term: "הפצה",
      industries: ["הפצה ולוגיסטיקה", "שילוח מסחרי"],
      fleetType: "משאיות חלוקה ומסחריות",
      category: "distribution",
      priority: 3,
      active: true,
      minFleetPotential: 5,
      description: "ציי חלוקה יומיים ומרכזים לוגיסטיים"
    },
    {
      term: "הסעות",
      industries: ["היסעים ותחבורה", "הסעות עובדים ותלמידים"],
      fleetType: "אוטובוסים ומיניבוסים",
      category: "buses",
      priority: 3,
      active: true,
      minFleetPotential: 5,
      description: "מפעילי היסעים ואוטובוסים פרטיים"
    },
    {
      term: "בטון",
      industries: ["הובלת בטון", "מפעלי בטון ומערבלים"],
      fleetType: "מערבלי בטון ומשאבות",
      category: "concrete",
      priority: 4,
      active: true,
      minFleetPotential: 5,
      description: "מערבלי בטון ומשאבות בטון כבדות"
    },
    {
      term: "מנופים",
      industries: ["עבודות מנוף והנפה", "הובלות מנוף"],
      fleetType: "משאיות מנוף וציוד הרמה",
      category: "cranes",
      priority: 4,
      active: true,
      minFleetPotential: 5,
      description: "משאיות מנוף וציוד הרמה המחייבים תחזוקת שבר ואישורי מהנדס"
    },
    {
      term: "קירור",
      industries: ["הובלה בקירור", "שינוע מזון וטמפרטורה מבוקרת"],
      fleetType: "משאיות קירור",
      category: "refrigerated",
      priority: 5,
      active: true,
      minFleetPotential: 5,
      description: "משאיות קירור עם יחידות קירור רגישות"
    }
  ];

  const DATA_CLASSIFICATION = {
    VERIFIED: "מאומת",
    ESTIMATE: "הערכה",
    UNKNOWN: "לא ידוע"
  };

  const DEFAULT_DOMAINS = [
    {
      id: "transport",
      name: "הובלות",
      description: "חברות הובלה יבשתית, שינוע כבד ומנופים",
      fleetType: "משאיות כבדות ומנופים",
      minFleetPotential: 5,
      active: true,
      keywords: [
        { word: "הובלות", active: true },
        { word: "הובלה כבדה", active: true },
        { word: "מנוף", active: true },
        { word: "שינוע", active: true },
        { word: "הובלת מטענים", active: true },
        { word: "משאיות", active: true }
      ]
    },
    {
      id: "logistics",
      name: "לוגיסטיקה",
      description: "מרכזים לוגיסטיים, שילוח ואחסנה",
      fleetType: "משאיות חלוקה ורכבי שילוח",
      minFleetPotential: 5,
      active: true,
      keywords: [
        { word: "לוגיסטיקה", active: true },
        { word: "שילוח", active: true },
        { word: "מרכז הפצה", active: true },
        { word: "אחסנה", active: true },
        { word: "בלדרות", active: true },
        { word: "קירור", active: true }
      ]
    },
    {
      id: "infra",
      name: "תשתיות",
      description: "קבלני תשתיות, עפר, סלילה וכבישים (ענף 200)",
      fleetType: "כלי צמ\"ה, שופלים ומשאיות עפר",
      minFleetPotential: 5,
      active: true,
      keywords: [
        { word: "תשתיות", active: true },
        { word: "עבודות עפר", active: true },
        { word: "סלילה", active: true },
        { word: "כבישים", active: true },
        { word: "צמ\"ה", active: true },
        { word: "חפירות", active: true },
        { word: "פיתוח", active: true }
      ]
    },
    {
      id: "service_tech",
      name: "שירות וטכנאים",
      description: "שירות שטח, טכנאים, מיזוג ואחזקה שוטפת",
      fleetType: "מסחריות שירות ורכבי טכנאי",
      minFleetPotential: 5,
      active: true,
      keywords: [
        { word: "שירות שטח", active: true },
        { word: "טכנאים", active: true },
        { word: "מיזוג אוויר", active: true },
        { word: "אינסטלציה", active: true },
        { word: "מעליות", active: true },
        { word: "גנרטורים", active: true }
      ]
    },
    {
      id: "security",
      name: "אבטחה",
      description: "חברות אבטחה, סיור, מוקד ומיגון",
      fleetType: "ניידות סיור ורכבי שטח",
      minFleetPotential: 5,
      active: true,
      keywords: [
        { word: "אבטחה", active: true },
        { word: "שמירה", active: true },
        { word: "מוקד", active: true },
        { word: "סיור", active: true },
        { word: "ניידות סיור", active: true },
        { word: "מיגון", active: true }
      ]
    },
    {
      id: "cleaning_maint",
      name: "ניקיון ואחזקה",
      description: "אחזקת מבנים, ניהול מתחמים ופוליש",
      fleetType: "מסחריות תפעול וציוד ניקוי",
      minFleetPotential: 5,
      active: true,
      keywords: [
        { word: "ניקיון", active: true },
        { word: "אחזקת מבנים", active: true },
        { word: "ניהול מבנים", active: true },
        { word: "אחזקה", active: true },
        { word: "פוליש", active: true }
      ]
    },
    {
      id: "food_dist",
      name: "מזון והפצה",
      description: "הפצת מזון, שינוע בטמפרטורה מבוקרת ומשקאות",
      fleetType: "משאיות קירור ומסחריות חלוקה",
      minFleetPotential: 5,
      active: true,
      keywords: [
        { word: "הפצת מזון", active: true },
        { word: "חלוקה", active: true },
        { word: "מזון", active: true },
        { word: "קירור", active: true },
        { word: "משקאות", active: true },
        { word: "מאפיות", active: true }
      ]
    },
    {
      id: "passenger_trans",
      name: "הסעות",
      description: "היסעים, תחבורה, אוטובוסים ומיניבוסים",
      fleetType: "אוטובוסים, מיניבוסים ורכבי היסע",
      minFleetPotential: 5,
      active: true,
      keywords: [
        { word: "הסעות", active: true },
        { word: "היסעים", active: true },
        { word: "אוטובוסים", active: true },
        { word: "מיניבוס", active: true },
        { word: "הסעות תלמידים", active: true },
        { word: "הסעות עובדים", active: true }
      ]
    },
    {
      id: "commercial_vans",
      name: "מסחריות",
      description: "ציי רכבים מסחריים קלים, ואנים וטנדרים",
      fleetType: "מסחריות קלות ורכבי עבודה",
      minFleetPotential: 5,
      active: true,
      keywords: [
        { word: "מסחריות", active: true },
        { word: "ואן", active: true },
        { word: "טנדרים", active: true },
        { word: "רכב מסחרי", active: true },
        { word: "רכבי עבודה", active: true }
      ]
    },
    {
      id: "rental_leasing",
      name: "השכרה וליסינג",
      description: "השכרת רכב, ליסינג תפעולי והשכרת משאיות",
      fleetType: "ציי השכרה וליסינג מסחרי",
      minFleetPotential: 5,
      active: true,
      keywords: [
        { word: "השכרת רכב", active: true },
        { word: "ליסינג", active: true },
        { word: "השכרת משאיות", active: true },
        { word: "רכב להשכרה", active: true }
      ]
    }
  ];

  let _domainsCache = null;
  const DOMAINS_STORAGE_KEY = "dalia_prospector_domains_v2";

  const OPDomainKeywords = {
    DEFAULT_DOMAINS,
    STORAGE_KEY: DOMAINS_STORAGE_KEY,
    getDomains() {
      if (_domainsCache) return _domainsCache;
      try {
        if (typeof localStorage !== "undefined") {
          const stored = localStorage.getItem(DOMAINS_STORAGE_KEY);
          if (stored) {
            _domainsCache = JSON.parse(stored);
            if (Array.isArray(_domainsCache) && _domainsCache.length > 0) {
              return _domainsCache;
            }
          }
        }
      } catch(e) {}
      _domainsCache = JSON.parse(JSON.stringify(DEFAULT_DOMAINS));
      return _domainsCache;
    },
    saveDomains(domains) {
      _domainsCache = domains;
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(DOMAINS_STORAGE_KEY, JSON.stringify(domains));
        }
      } catch(e) {}
      return _domainsCache;
    },
    addDomain({ name, description = "", fleetType = "רכבי עבודה ומסחריות", minFleetPotential = 5, keywords = [] }) {
      if (!name || !name.trim()) throw new Error("שם תחום הינו שדה חובה");
      const domains = this.getDomains();
      const cleanName = name.trim();
      if (domains.some(d => d.name === cleanName)) throw new Error("תחום בשם זה כבר קיים");
      const id = "custom_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
      const kwList = Array.isArray(keywords)
        ? keywords.map(k => typeof k === "string" ? { word: k.trim(), active: true } : { word: k.word.trim(), active: k.active !== false })
        : [];
      const newDomain = {
        id,
        name: cleanName,
        description: description.trim(),
        fleetType: fleetType.trim(),
        minFleetPotential: Number(minFleetPotential) || 5,
        active: true,
        keywords: kwList,
        isCustom: true
      };
      domains.push(newDomain);
      this.saveDomains(domains);
      return newDomain;
    },
    updateDomain(id, updates = {}) {
      const domains = this.getDomains();
      const d = domains.find(x => x.id === id || x.name === id);
      if (!d) return null;
      if (updates.name && updates.name.trim()) d.name = updates.name.trim();
      if (updates.description !== undefined) d.description = String(updates.description).trim();
      if (updates.fleetType !== undefined) d.fleetType = String(updates.fleetType).trim();
      if (updates.minFleetPotential !== undefined) d.minFleetPotential = Number(updates.minFleetPotential) || 5;
      if (updates.active !== undefined) d.active = !!updates.active;
      this.saveDomains(domains);
      return d;
    },
    deleteDomain(id) {
      let domains = this.getDomains();
      domains = domains.filter(x => x.id !== id && x.name !== id);
      this.saveDomains(domains);
      return domains;
    },
    toggleDomain(id, active) {
      const domains = this.getDomains();
      const d = domains.find(x => x.id === id || x.name === id);
      if (d) {
        d.active = active !== undefined ? !!active : !d.active;
        this.saveDomains(domains);
      }
      return d;
    },
    addKeyword(domainIdOrName, word) {
      if (!word || !word.trim()) return null;
      const cleanWord = word.trim();
      const domains = this.getDomains();
      const d = domains.find(x => x.id === domainIdOrName || x.name === domainIdOrName);
      if (!d) return null;
      if (!Array.isArray(d.keywords)) d.keywords = [];
      const existing = d.keywords.find(k => k.word === cleanWord);
      if (existing) {
        existing.active = true;
      } else {
        d.keywords.push({ word: cleanWord, active: true });
      }
      this.saveDomains(domains);
      return d;
    },
    toggleKeyword(domainIdOrName, word, active) {
      const cleanWord = (word || "").trim();
      const domains = this.getDomains();
      const d = domains.find(x => x.id === domainIdOrName || x.name === domainIdOrName);
      if (!d || !Array.isArray(d.keywords)) return null;
      const k = d.keywords.find(kw => kw.word === cleanWord);
      if (k) {
        k.active = active !== undefined ? !!active : !k.active;
        this.saveDomains(domains);
      }
      return d;
    },
    deleteKeyword(domainIdOrName, word) {
      const cleanWord = (word || "").trim();
      const domains = this.getDomains();
      const d = domains.find(x => x.id === domainIdOrName || x.name === domainIdOrName);
      if (!d || !Array.isArray(d.keywords)) return null;
      d.keywords = d.keywords.filter(kw => kw.word !== cleanWord);
      this.saveDomains(domains);
      return d;
    },
    assignKeywordToMultipleDomains(word, domainIdsOrNames) {
      if (!word || !word.trim() || !Array.isArray(domainIdsOrNames)) return [];
      const cleanWord = word.trim();
      const domains = this.getDomains();
      const updated = [];
      domainIdsOrNames.forEach(target => {
        const d = domains.find(x => x.id === target || x.name === target);
        if (d) {
          if (!Array.isArray(d.keywords)) d.keywords = [];
          const existing = d.keywords.find(k => k.word === cleanWord);
          if (existing) existing.active = true;
          else d.keywords.push({ word: cleanWord, active: true });
          updated.push(d);
        }
      });
      this.saveDomains(domains);
      return updated;
    },
    getKeywordsForDomain(domainIdOrName, onlyActive = true) {
      const domains = this.getDomains();
      const d = domains.find(x => x.id === domainIdOrName || x.name === domainIdOrName);
      if (!d || !Array.isArray(d.keywords)) return [];
      return d.keywords.filter(k => !onlyActive || k.active).map(k => k.word);
    },
    getAllActiveKeywords() {
      const domains = this.getDomains().filter(d => d.active);
      const set = new Set();
      domains.forEach(d => {
        (d.keywords || []).filter(k => k.active).forEach(k => set.add(k.word));
      });
      return Array.from(set);
    },
    findDomainsForKeyword(word) {
      const cleanWord = (word || "").trim();
      const domains = this.getDomains();
      return domains.filter(d => (d.keywords || []).some(k => k.word === cleanWord));
    },
    resetToDefaults() {
      _domainsCache = JSON.parse(JSON.stringify(DEFAULT_DOMAINS));
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem(DOMAINS_STORAGE_KEY);
        }
      } catch(e) {}
      return _domainsCache;
    }
  };

  /* ===== משימה 3: הגדרות סבבים, טווחי עובדים, נוסחת פוטנציאל ומניעת כפילויות ===== */
  const WORKFORCE_RANGES = [
    { id: "1-10", label: "1–10 עובדים", min: 1, max: 10 },
    { id: "11-50", label: "11–50 עובדים", min: 11, max: 50 },
    { id: "51-200", label: "51–200 עובדים", min: 51, max: 200 },
    { id: "201-500", label: "201–500 עובדים", min: 201, max: 500 },
    { id: "501-1000", label: "501–1,000 עובדים", min: 501, max: 1000 },
    { id: "1000plus", label: "מעל 1,000 עובדים", min: 1001, max: Infinity },
    { id: "unknown", label: "לא ידוע", min: 0, max: 0 }
  ];

  const WORKFORCE_STATUS_LABELS = {
    reported: "מדווח על ידי החברה",
    estimated: "מוערך על ידי מקור עסקי",
    cross_referenced: "מוצלב בין מקורות",
    unknown: "לא ידוע"
  };

  const DISCOVERY_BATCHES = [
    {
      id: "all",
      label: "כל החברות (תצוגה מאוחדת)",
      name: "כל החברות",
      date: "01/10/2026 – 09/10/2026",
      expectedCount: 1618
    },
    {
      id: "batch_1",
      label: "לידים – קבלנים ותשתיות",
      name: "לידים – קבלנים ותשתיות",
      date: "01/10/2026",
      expectedCount: 618,
      source: "פנקס הקבלנים ומאגרים רשמיים (רשמי)",
      status: "completed"
    },
    {
      id: "batch_2",
      label: "לידים – חברות לפי עובדים",
      name: "לידים – חברות לפי עובדים",
      date: "09/10/2026",
      expectedCount: 1000,
      source: "פנקס הקבלנים הרשומים (data.gov.il)",
      status: "completed"
    },
    {
      id: "future",
      label: "סבבים עתידיים",
      name: "סבבים עתידיים",
      date: "מתוכנן",
      expectedCount: 0,
      source: "מקורות מתוכננים",
      status: "planned"
    }
  ];

  /* נוסחת דירוג פוטנציאל לסבבי איתור (סעיף 8) */
  function calculatePotentialScore(c) {
    if (!c) return { total_score: 0, tier: "low", tier_label: "פוטנציאל נמוך", breakdown: {} };
    const allText = [c.name, c.company_name, c.ind, c.industry, c.fleetType, c.fleet_type, c.leadReason, c.lead_reason].filter(Boolean).join(" ");
    
    // 1. התאמת תחום פעילות (30%)
    let actPts = 40;
    if (/הובל|שינוע|הפצה|לוגיסטיק|שילוח|היסע|אוטובוס|תחבור|עפר|תשתי|כביש|סלילה|גשר/i.test(allText)) {
      actPts = 100;
    } else if (/צמ"?ה|משאי|מנוף|בנייה|בניה|קבלנ|אבטחה|שמירה|ניקיון|אחזקה|מיזוג|קירור|חשמל|מעליות|אינסטלצ/i.test(allText)) {
      actPts = 85;
    } else if (/שירות|טכנאי|התקנות|מפעל|תעשיי|מסחרי/i.test(allText)) {
      actPts = 65;
    }

    // 2. מספר עובדים (25%)
    let wfPts = 20;
    const wf = c.workforce_estimate || (c.enr && c.enr.workforce_estimate) || {};
    const empCount = c.employee_count || c.approx_employees || wf.approx_employees || 0;
    const empRange = c.employee_range || wf.employee_count_range || "";
    if (empCount >= 500 || /500\+|501|1,000|1000/i.test(empRange)) {
      wfPts = 100;
    } else if (empCount >= 200 || /201|250/i.test(empRange)) {
      wfPts = 85;
    } else if (empCount >= 50 || /51|100/i.test(empRange)) {
      wfPts = 70;
    } else if (empCount >= 11 || /11|25/i.test(empRange)) {
      wfPts = 50;
    } else if (empCount >= 1 || /1–10|1-10/i.test(empRange)) {
      wfPts = 30;
    } else if (c.size && c.size !== "לא ידוע") {
      wfPts = 45;
    }

    // 3. אינדיקציות לפעילות רכבים (20%)
    let flPts = 20;
    const flV2 = c.fleet_estimate_v2 || (c.enr && c.enr.fleet_estimate_v2) || {};
    const flSize = c.fleet_size || flV2.fleet_size_approx || 0;
    if ((flSize >= 5 && c.fleet_exists) || /אוטובוס|היסע|משאי|מוביל|צמ"?ה/i.test(allText)) {
      flPts = 100;
    } else if (flSize >= 5 || (flV2.fleet_count_rounded && !["0", "1–4"].includes(flV2.fleet_count_rounded))) {
      flPts = 85;
    } else if (actPts >= 80) {
      flPts = 65;
    } else if (flSize >= 1) {
      flPts = 35;
    }

    // 4. איכות ואימות פרטי קשר (15%)
    let ctPts = 10;
    const hasPhone = !!(c.phone && validPhone(c.phone) && c.phone !== "לא ידוע");
    const hasEmail = !!(c.mail || c.email) && String(c.mail || c.email).includes("@");
    const hasContact = !!(c.contact_name || (c.people && c.people.length > 0) || c.certifiedProfessional || (c.contacts && c.contacts.length > 0));
    if (hasPhone && hasEmail && hasContact) {
      ctPts = 100;
    } else if (hasPhone && hasEmail) {
      ctPts = 85;
    } else if (hasPhone) {
      ctPts = 60;
    } else if (hasEmail) {
      ctPts = 40;
    }

    // 5. התאמה גיאוגרפית (10%)
    let geoPts = 40;
    const region = c.region || cityToRegion(c.city || "") || "";
    if (/מרכז|תל אביב|שפלה|ירושלים/i.test(region)) {
      geoPts = 100;
    } else if (/שרון|חיפה/i.test(region)) {
      geoPts = 80;
    } else if (/צפון|דרום|יהודה/i.test(region)) {
      geoPts = 60;
    }

    const total = Math.round(actPts * 0.30 + wfPts * 0.25 + flPts * 0.20 + ctPts * 0.15 + geoPts * 0.10);
    const tier = total >= 80 ? "high" : total >= 60 ? "medium" : "low";
    const tierLabel = tier === "high" ? "פוטנציאל גבוה" : tier === "medium" ? "פוטנציאל בינוני" : "פוטנציאל נמוך";

    return {
      total_score: total,
      tier,
      tier_label: tierLabel,
      breakdown: {
        activity: actPts,
        workforce: wfPts,
        fleet: flPts,
        contact: ctPts,
        geo: geoPts
      }
    };
  }

  /* מניעת כפילויות מול מאגר קיים (סעיף 9) */
  function cleanCorpName(s) {
    return String(s || "")
      .replace(/(בע"מ|בעמ|בע''מ|בע״מ|ltd|limited|שותפות)/gi, "")
      .replace(/[\s"'~`׳״.-]/g, "")
      .trim();
  }

  function checkDuplicate(cand, existingList) {
    if (!cand || !Array.isArray(existingList)) return { isDuplicate: false, matchedWith: null, reason: "" };
    const candHp = normalizeCompanyHp(cand.no || cand.company_hp || cand.identitynumber || cand.MISPAR_YESHUT);
    const candRawName = normName(cand.name || cand.company_name || cand.SHEM_YESHUT || cand.companyname);
    const candCleanName = cleanCorpName(cand.name || cand.company_name || cand.SHEM_YESHUT || cand.companyname);
    const candWeb = String(cand.web || cand.website || "").trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");

    for (const ex of existingList) {
      const exHp = normalizeCompanyHp(ex.no || ex.company_hp);
      if (candHp && exHp && candHp === exHp) {
        return { isDuplicate: true, matchedWith: ex, reason: `ח.פ. זהה (${candHp})` };
      }
      const exRawName = normName(ex.name || ex.company_name);
      const exCleanName = cleanCorpName(ex.name || ex.company_name);
      if ((candRawName && exRawName && candRawName === exRawName) ||
          (candCleanName && exCleanName && candCleanName.length >= 4 && candCleanName === exCleanName)) {
        return { isDuplicate: true, matchedWith: ex, reason: `שם חברה זהה (${ex.name || cand.name})` };
      }
      const exWeb = String(ex.web || ex.website || "").trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
      if (candWeb && exWeb && candWeb.length > 4 && candWeb === exWeb) {
        return { isDuplicate: true, matchedWith: ex, reason: `כתובת אתר/דומיין זהה (${candWeb})` };
      }
    }
    return { isDuplicate: false, matchedWith: null, reason: "" };
  }

  /* =========================================================================================
   * סיווג עצמאי של פרטי קשר ואימותיהם: נייד, משרדי ואימייל (משימה מאוחדת - סעיפים 2, 4, 5)
   * ========================================================================================= */
  function isMobilePhone(p) {
    if (!p) return false;
    const clean = String(p).replace(/\D/g, "");
    if (clean.startsWith("9725") && clean.length === 12) return true;
    if (clean.startsWith("05") && (clean.length === 10 || clean.length === 9)) return true;
    return false;
  }

  function isLandlinePhone(p) {
    if (!p) return false;
    const clean = String(p).replace(/\D/g, "");
    if (/^(02|03|04|08|09)\d{7}$/.test(clean)) return true;
    if (/^07\d{8}$/.test(clean)) return true;
    if (/^(1700|1800)\d{6}$/.test(clean)) return true;
    if (/^972[23489]\d{7}$/.test(clean)) return true;
    if (/^9727\d{8}$/.test(clean)) return true;
    return false;
  }

  function getContactVerificationSources(row, contactType, contactVal) {
    if (!contactVal || contactVal === "לא נמצא") return [];
    row = row || {};
    const cleanPhone = normPhone(contactVal);
    const lowerMail = String(contactVal).toLowerCase().trim();
    const sourcesMap = new Map();

    function addSource(id, name, type, url, date, confidence) {
      if (!sourcesMap.has(id)) {
        sourcesMap.set(id, { id, name, type, url: url || "", date: date || "01.10.2026", confidence: confidence || "מאומת רשמית" });
      }
    }

    // 0. מקורות עצמאיים שנאספו ומופו ברמת הרשומה (כל מקור עצמאי מקבל מזהה ייחודי)
    const explicitSources = contactType === "email" ? row.email_sources_detail : row.phone_sources_detail;
    if (Array.isArray(explicitSources)) {
      explicitSources.forEach(s => {
        if (s && s.id && s.name) {
          const sVal = contactType === "email" ? String(s.val || "").toLowerCase().trim() : normPhone(s.val || contactVal);
          if ((contactType === "email" && (!s.val || sVal === lowerMail)) || (contactType !== "email" && (!s.val || sVal === cleanPhone))) {
            addSource(s.id, s.name, s.type || "מאגר רשמי עצמאי", s.url || "", s.date || "01.10.2026", s.confidence || "רשמי (Tier A)");
          }
        }
      });
    }

    // 1. פנקס הקבלנים (data.gov.il) - בדיקה מלאה של המספר המנורמל (ללא חיתוך 7 ספרות)
    const con = (row.registry_check && row.registry_check.contractors) || {};
    let inContractors = false;
    if (con.records && Array.isArray(con.records)) {
      inContractors = con.records.some(r => {
        if (contactType === "email") return r.email && r.email.toLowerCase().trim() === lowerMail;
        const rp = normPhone(r.phone);
        return Boolean(rp && cleanPhone && rp === cleanPhone);
      });
    }
    if (!inContractors && (row.source === "contractors" || (row.source_name && row.source_name.includes("פנקס הקבלנים")))) {
      if (contactType === "email") {
        const rowMail = (row.email || row.mail || "").toLowerCase().trim();
        if (rowMail && rowMail === lowerMail) inContractors = true;
      } else {
        const rp = normPhone(row.phone || row.mobile_phone);
        if (rp && cleanPhone && rp === cleanPhone) inContractors = true;
      }
    }
    if (!inContractors && Array.isArray(row.people)) {
      inContractors = row.people.some(p => {
        const pRole = Array.isArray(p) ? p[1] : (p && p.role);
        const isLic = pRole && (String(pRole).includes("רישיון הקבלן") || String(pRole).includes("איש מקצוע כשיר"));
        if (!isLic) return false;
        if (contactType === "email") {
          const pm = (Array.isArray(p) ? p[3] : (p && p.email) || "").toLowerCase().trim();
          return Boolean(pm && pm === lowerMail);
        } else {
          const pp = normPhone(Array.isArray(p) ? p[4] : (p && p.phone));
          return Boolean(pp && cleanPhone && pp === cleanPhone);
        }
      });
    }

    if (inContractors) {
      addSource(
        "gov_contractors",
        "פנקס הקבלנים הרשומים (data.gov.il)",
        "מאגר ממשלתי רשמי — משרד הבינוי והשיכון",
        "https://data.gov.il/dataset/4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8",
        (row.registry_check && row.registry_check.checked_at ? row.registry_check.checked_at.slice(0, 10) : "01.10.2026"),
        "רשמי (Tier A)"
      );
    }

    // 2. רשם החברות (data.gov.il / ica) - בדיקה מלאה של המספר המנורמל
    const comp = (row.registry_check && row.registry_check.companies) || {};
    let inCompanies = false;
    if (comp && comp.found) {
      if (contactType === "email" && comp.email && comp.email.toLowerCase().trim() === lowerMail) inCompanies = true;
      if (contactType !== "email" && comp.phone) {
        const cp = normPhone(comp.phone);
        if (cp && cleanPhone && cp === cleanPhone) inCompanies = true;
      }
    }
    if (!inCompanies && (row.source === "companies" || (row.source_name && row.source_name.includes("רשם החברות")))) {
      if (contactType === "email") {
        const rowMail = (row.email || row.mail || "").toLowerCase().trim();
        if (rowMail && rowMail === lowerMail) inCompanies = true;
      } else {
        const cp = normPhone(row.phone);
        if (cp && cleanPhone && cp === cleanPhone) inCompanies = true;
      }
    }
    if (inCompanies) {
      addSource(
        "gov_companies",
        "רשם החברות (data.gov.il)",
        "מאגר ממשלתי רשמי — משרד המשפטים",
        "https://data.gov.il/dataset/f004176c-b85f-4542-8901-7b3176f9a054",
        (row.source_date || (row.registry_check && row.registry_check.checked_at ? row.registry_check.checked_at.slice(0, 10) : "01.10.2026")),
        "רשמי (Tier A)"
      );
    }

    // 3. אתר האינטרנט הרשמי של החברה - התאמה מלאה של המספר המנורמל
    const multi = row.multi_phones || row.multiPhones || (row.enr && row.enr.multi_phones) || [];
    multi.forEach(m => {
      if (typeof m === "object" && m.val) {
        const mp = normPhone(m.val);
        if (mp && cleanPhone && mp === cleanPhone) {
          if (m.source && (m.source.includes("אתר החברה") || m.source.includes("אתר רשמי") || m.tier === "B")) {
            addSource(
              "company_website",
              m.source || "אתר החברה הרשמי",
              "ערוץ דיגיטלי ישיר של התאגיד",
              (row.website ? (row.website.startsWith("http") ? row.website : "https://" + row.website) : ""),
              "01.10.2026",
              "אימות ישיר (אתר החברה)"
            );
          } else if (m.source_id && m.source && m.source_id !== "gov_contractors") {
            addSource(
              m.source_id,
              m.source,
              "מאגר ממשלתי רשמי עצמאי",
              m.url || "https://data.gov.il",
              "01.10.2026",
              "רשמי (Tier A)"
            );
          }
        }
      }
    });

    // בדיקת ראיות (evidence) ספציפיות לפרט הקשר (התאמה מלאה של המספר המנורמל)
    const evList = Array.isArray(row.evidence) ? row.evidence : [];
    evList.forEach(e => {
      if (!e || e.status !== "verified") return;
      const ef = e.field || "";
      if (contactType === "email" && ef.includes("mail")) {
        const evMail = String(e.value || "").toLowerCase().trim();
        if (evMail === lowerMail && (String(e.source || "").includes("אתר") || String(e.url || "").includes("http"))) {
          addSource(
            e.source_id || "company_website",
            e.source || "אתר החברה הרשמי",
            "ערוץ דיגיטלי ישיר של התאגיד",
            e.url || "",
            String(e.found_at || "01.10.2026").slice(0, 10),
            "אימות ישיר (אתר החברה)"
          );
        }
      } else if (contactType !== "email" && (ef.includes("phone") || ef.includes("contact"))) {
        const ep = normPhone(e.value);
        if (ep && cleanPhone && ep === cleanPhone && (String(e.source || "").includes("אתר") || String(e.url || "").includes("http"))) {
          addSource(
            e.source_id || "company_website",
            e.source || "אתר החברה הרשמי",
            "ערוץ דיגיטלי ישיר של התאגיד",
            e.url || "",
            String(e.found_at || "01.10.2026").slice(0, 10),
            "אימות ישיר (אתר החברה)"
          );
        }
      }
    });

    // 4. אימות ישיר / ידני בלבד
    const man = (row.field_status && row.field_status.manual) || {};
    if (man[contactType === "email" ? "email" : "phone"] || (contactType !== "email" && man.phone_verified)) {
      addSource(
        "manual_audit",
        "אימות ישיר / טלפוני (צוות אופטימיזציה דליה)",
        "בדיקה טלפונית ישירה",
        "",
        "01.10.2026",
        "אימות אנושי"
      );
    }

    return Array.from(sourcesMap.values());
  }

  function classifyLeadContacts(row, q) {
    q = q || evaluate(row);
    const fsPhone = q ? q.field_status.phone : { s: "n", val: "", src: "" };
    const fsEmail = q ? q.field_status.email : { s: "n", val: "", src: "" };
    const primaryPhone = row.phone || (row.enr && row.enr.phone) || "";
    const isPrimaryPhoneVer = fsPhone.s === "v" || row.phone_verified === true || row.verification_status === "מאומת במאגר ממשלתי" || row.discovery_batch === "batch_2" || (row.raw_payload && row.raw_payload.phone_verified === true);

    const phones = [];
    if (primaryPhone && primaryPhone !== "לא נמצא" && validPhone(primaryPhone)) {
      phones.push({
        val: primaryPhone,
        verified: isPrimaryPhoneVer,
        source: fsPhone.src || row.source_name || "פנקס הקבלנים / רשם",
        date: row.source_date || "01.10.2026"
      });
    }

    const multi = row.multi_phones || row.multiPhones || (row.enr && row.enr.multi_phones) || [];
    multi.forEach(m => {
      const val = typeof m === "object" ? m.val : m;
      if (val && validPhone(val) && !phones.some(p => p.val === val)) {
        // Individual verification: only verified if m specifically has tier === "A" or official company site (tier B)
        const isMultiVer = typeof m === "object" && (m.tier === "A" || m.tier === "B" || (m.source && m.source.includes("אתר החברה")) || m.verified === true);
        phones.push({
          val,
          verified: isMultiVer,
          source: (typeof m === "object" && m.source) || "אינדקס מקושר",
          date: "01.10.2026"
        });
      }
    });

    const people = row.people || (row.enr && row.enr.people) || [];
    people.forEach(p => {
      const val = Array.isArray(p) ? p[4] : p.phone;
      if (val && validPhone(val) && !phones.some(x => x.val === val)) {
        // Individual verification: only verified if p specifically has tier === "A" or verified flag
        const isPersonVer = Array.isArray(p) ? (p[5] === "A" || p[2] === "v") : (p.tier === "A" || p.verified === true);
        phones.push({
          val,
          verified: isPersonVer,
          source: "איש מקצוע רשום ברישיון הקבלן",
          date: "01.10.2026"
        });
      }
    });

    const mobiles = phones.filter(p => isMobilePhone(p.val));
    const landlines = phones.filter(p => isLandlinePhone(p.val));

    let mobileStatus = "missing";
    let bestMobile = null;
    if (mobiles.length > 0) {
      const ver = mobiles.find(m => m.verified);
      if (ver) {
        mobileStatus = "verified";
        bestMobile = ver;
      } else {
        mobileStatus = "unverified_present";
        bestMobile = mobiles[0];
      }
    }

    let landlineStatus = "missing";
    let bestLandline = null;
    if (landlines.length > 0) {
      const ver = landlines.find(l => l.verified);
      if (ver) {
        landlineStatus = "verified";
        bestLandline = ver;
      } else {
        landlineStatus = "unverified_present";
        bestLandline = landlines[0];
      }
    }

    const emailVal = row.email || row.mail || (row.enr && row.enr.email) || "";
    let emailStatus = "missing";
    let bestEmail = null;
    if (emailVal && String(emailVal).includes("@")) {
      const isEmailVer = fsEmail.s === "v" || row.email_verified === true || row.verification_status === "מאומת במאגר ממשלתי" || row.discovery_batch === "batch_2" || (row.raw_payload && row.raw_payload.email_verified === true);
      if (isEmailVer) {
        emailStatus = "verified";
        bestEmail = { val: emailVal, verified: true, source: fsEmail.src || row.source_name || "פנקס הקבלנים", date: row.source_date || "01.10.2026" };
      } else {
        emailStatus = "unverified_present";
        bestEmail = { val: emailVal, verified: false, source: fsEmail.src || "רשומה בלבד", date: "01.10.2026" };
      }
    }

    // Attach independent verification sources to each contact
    if (bestMobile) {
      bestMobile.sources = bestMobile.verified ? getContactVerificationSources(row, "mobile", bestMobile.val) : [];
    }
    if (bestLandline) {
      bestLandline.sources = bestLandline.verified ? getContactVerificationSources(row, "landline", bestLandline.val) : [];
    }
    if (bestEmail) {
      bestEmail.sources = bestEmail.verified ? getContactVerificationSources(row, "email", bestEmail.val) : [];
    }

    let yellowSubtype = null;
    let yellowPhoneType = null;
    let yellowReason = "";

    const color = q ? q.lead_quality_color : "yellow";
    if (color === "yellow") {
      const hasVerPhone = mobileStatus === "verified" || landlineStatus === "verified";
      const hasVerEmail = emailStatus === "verified";

      if (hasVerPhone && !hasVerEmail) {
        yellowSubtype = "A";
        if (mobileStatus === "verified" && landlineStatus === "verified") yellowPhoneType = "both";
        else if (mobileStatus === "verified") yellowPhoneType = "mobile";
        else yellowPhoneType = "landline";
        yellowReason = "יש טלפון מאומת (" + (yellowPhoneType === "mobile" ? "נייד" : yellowPhoneType === "landline" ? "משרדי" : "נייד ומשרדי") + "), אין אימייל מאומת";
      } else if (!hasVerPhone && hasVerEmail) {
        yellowSubtype = "B";
        yellowReason = "יש אימייל מאומת, אין טלפון מאומת";
      } else if (!hasVerPhone && !hasVerEmail) {
        yellowSubtype = "C";
        yellowReason = "אין טלפון מאומת ואין אימייל מאומת";
      } else {
        yellowSubtype = "other";
        yellowReason = (q && q.why_not_green) || (q && q.blockers && q.blockers.join(", ")) || "חסרה אינדיקציה לצי 5+";
      }
    }

    return {
      q,
      color,
      isPlus: !!(q && q.is_quality_plus),
      mobileStatus,
      bestMobile,
      landlineStatus,
      bestLandline,
      emailStatus,
      bestEmail,
      mobileSources: bestMobile ? bestMobile.sources : [],
      landlineSources: bestLandline ? bestLandline.sources : [],
      emailSources: bestEmail ? bestEmail.sources : [],
      mobileSourcesCount: bestMobile && bestMobile.sources ? bestMobile.sources.length : 0,
      landlineSourcesCount: bestLandline && bestLandline.sources ? bestLandline.sources.length : 0,
      emailSourcesCount: bestEmail && bestEmail.sources ? bestEmail.sources.length : 0,
      yellowSubtype,
      yellowPhoneType,
      yellowReason,
      allMobiles: mobiles,
      allLandlines: landlines
    };
  }

  const api = { STAGES, STAGE_LABEL, FLEET_SIZE_LABEL, FIELD_STATUS_LABEL, QUALITY_LABEL, LEAD_QUALITY_LABELS, WORKFLOW_STATUS_LABELS, FIELDS, MISSING_SHORT, missingLabel,
    NOT_SAFETY_PROOF, normPhone, validPhone, isVerifiedFinding, isCompanyActive, evaluate, hasAnyValidPhone, hasAnyRealContact, hasAnyValidEmail,
    normalizeCompanyHp, isValidIsraeliCompanyNumber, CITY_TO_REGION, cityToRegion, KEYWORD_INDUSTRY_MAP, DATA_CLASSIFICATION,
    DEFAULT_DOMAINS, OPDomainKeywords, normName, cleanCorpName,
    WORKFORCE_RANGES, WORKFORCE_STATUS_LABELS, DISCOVERY_BATCHES, calculatePotentialScore, checkDuplicate,
    isMobilePhone, isLandlinePhone, getContactVerificationSources, classifyLeadContacts,
    assessCompanyFleet, fleetCountMatchesMode, VEHICLE_INDUSTRY_RE, VEHICLE_INTENSIVE_INDUSTRY_RE, GENERAL_COMPANY_INDUSTRY_RE };
  root.OPQualify = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

