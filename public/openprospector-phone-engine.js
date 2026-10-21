/* OpenProspector – מנוע השלמת טלפונים אמיתי (Claude, 2026-10-18)
 * מחליף את מנוע ההשלמה שלא פנה לאף מקור: פונה בפועל למקורות האוטומטיים שנבחרו ומחזירים טלפון,
 * לפי ח.פ. מדויק או שם חברה מלא, ושומר ראיה (מקור, קישור, אופן התאמה, זמן) לכל מספר.
 * כללים: לא מחליף טלפון קיים; "מאומת" רק כשאותו מספר הגיע מ-2 מקורות עצמאיים; אין המצאת נתונים.
 */
(function () {
  "use strict";
  const CKAN = "https://data.gov.il/api/3/action/datastore_search?resource_id=";
  const DS = "https://data.gov.il/dataset/";

  // המקורות האוטומטיים היחידים מתוך 130 שהוכח שמחזירים טלפון מתוך הדפדפן (בדיקה חיה 2026-10-18)
  const PHONE_SOURCES = [
    { catId: 61, key: "contractors", label: "פנקס הקבלנים (data.gov.il)", rid: "4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8", by: "hp", hpField: "MISPAR_YESHUT", phoneFields: ["MISPAR_TEL"], emailField: "EMAIL", nameField: "SHEM_YESHUT" },
    { catId: 63, key: "plants", label: "מרשם המפעלים מפל״ס (data.gov.il)", rid: "7ad8ddc7-87f4-45f9-84e4-d7f972662153", by: "hp", hpField: "MisparTaagidShutfutMenifa", phoneFields: ["TelefonAtarSvivatiMenifa"], nameField: "ShemTaagidShutfut" },
    { catId: 62, key: "business_licenses", label: "רישוי עסקים ממשלתי (data.gov.il)", rid: "7d4c61e2-2416-453e-8efb-bd02ec89db35", by: "name", nameField: "שם עסק", phoneFields: ["טלפון בעסק"], emailField: "מייל בעסק" },
    { catId: 64, key: "asbestos", label: "מרשם הנדסת סביבה ואסבסט (data.gov.il)", rid: "512d916e-07f0-4774-b84a-3a989e45e7eb", by: "name", nameField: "Name", phoneFields: ["Phone", "AdditionalTelephone"], emailField: "Email" },
    { catId: 71, key: "garages", label: "מוסכים ומכוני רישוי – משרד התחבורה (data.gov.il)", rid: "bb68386a-a331-4bbc-b668-bba2766d517d", by: "hp", hpField: "rasham_havarot", nameField: "shem_mosah", phoneFields: ["telephone"] },
    { catId: 72, key: "tourism", label: "עסקים בהחזר מע״מ לתייר – משרד התיירות (data.gov.il)", rid: "b2a6567c-b6d9-439e-9044-7874f4480797", by: "name", nameField: "name", phoneFields: ["phone"] },
    { catId: 27, key: "osm", label: "OpenStreetMap / Nominatim", by: "osm" },
    // מקור חדש (לא ברשימת 130): מעונות יום – משרד העבודה; ח.פ. של הארגון המפעיל + טלפון המעון (טלפון סניף, לא בהכרח מטה)
    { catId: "daycare", key: "daycare", label: "מעונות יום – משרד העבודה (data.gov.il, טלפון מעון של הארגון)", rid: "0f67a263-d9f4-44d4-9816-c96e9dfbc7e5", by: "hp", hpField: "ח.פ. ארגון", phoneFields: ["מספר טלפון"], nameField: "שם מעון" },
    // מקורות נוספים מ-data.gov.il (סריקה 2026-10-18 של 523 מאגרים, 58 עם שדה טלפון)
    { catId: "welfare", key: "welfare", label: "מסגרות רווחה – משרד הרווחה (data.gov.il, טלפון מסגרת של הארגון)", rid: "de069ddf-bcbc-4754-bda0-84873a353f7b", by: "hp", hpField: "Registered_Business_Id", hpNumeric: true, phoneFields: ["Telephone"], nameField: "Name" },
    { catId: "museums", key: "museums", label: "מוזאונים מוכרים – משרד התרבות (data.gov.il)", rid: "0309ee10-21a0-4ee9-8094-8fb474ca208a", by: "name", nameField: "שם המוזאון", phoneFields: ["מספר  טלפון"], emailField: "כתובת מייל" },
    { catId: "protected_housing", key: "protected_housing", label: "בתי דיור מוגן (data.gov.il)", rid: "7c390473-42b8-4fd2-a72d-07fa126ffeee", by: "name", nameField: "company", phoneFields: ["telephone"] },
    { catId: "mail_permits", key: "mail_permits", label: "בעלי היתר שירותי דואר – משרד התקשורת (data.gov.il)", rid: "d6add630-6731-4534-9383-cb780fb0c268", by: "name", nameField: "שם בעל היתר", phoneFields: ["טלפון", "נייד"], emailField: "מייל" }
  ];
  // אתר החברה עצמה כפי שנסרק במאגר הלאומי (nr_contact_points.src_own_site) – מקור עצמאי מהמאגרים הממשלתיים; דורש משתמש מחובר
  PHONE_SOURCES.push({ catId: "registry_site", key: "registry_site", label: "אתר החברה – סריקת המאגר הלאומי", by: "registry" });
  // מסגרות רווחה ומעונות: טלפון של מסגרת שהארגון מפעיל – לא בהכרח טלפון ההנהלה
  const BRANCH_SOURCES = ["daycare", "welfare"];

  async function queryRegistrySite(hp) {
    const url = typeof SUPABASE_STAGING_URL !== "undefined" ? SUPABASE_STAGING_URL : "";
    const anon = typeof SUPABASE_STAGING_ANON !== "undefined" ? SUPABASE_STAGING_ANON : "";
    let sess = null;
    try { sess = (typeof userSession === "function") ? await userSession() : null; } catch (e) {}
    if (!url || !sess || !sess.accessToken) return { error: "דורש התחברות לדליה" };
    const q = url + "/rest/v1/nr_businesses?select=id,website,nr_contact_points(value,subkind,branch_name,src_own_site,kind)&reg_id=eq." + encodeURIComponent(hp) + "&nr_contact_points.kind=eq.phone";
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15000);
    try {
      const r = await fetch(q, { signal: ac.signal, headers: { apikey: anon, Authorization: "Bearer " + sess.accessToken } });
      clearTimeout(t);
      if (!r.ok) return { error: "HTTP " + r.status };
      const rows = await r.json();
      const hits = [];
      (rows || []).forEach(b => (b.nr_contact_points || []).forEach(p => {
        if (!p.src_own_site) return;
        const n = normPhone(p.value);
        if (n) hits.push({ phone: n, website: b.website || "", branch: !!p.branch_name || p.subkind === "branch", branchName: p.branch_name || "" });
      }));
      return { hits };
    } catch (e) {
      clearTimeout(t);
      return { error: e.name === "AbortError" ? "timeout" : "שגיאת רשת" };
    }
  }

  // ═══ שמירה מרכזית ב-Supabase STAGING (prospect_leads.raw_payload.batch200) ═══
  // כל שינוי בחברה נכנס לתור "ממתין לשמירה" (נשמר גם בדפדפן), ונשלח אוטומטית כשהמשתמש מחובר.
  // בטעינה: קודם נשלח מה שממתין, ואז נטענות התוצאות מהמאגר – כך שסגירת הדפדפן לא מוחקת דבר.
  const PENDING_KEY = "dalia_prospector_batch200_pending";
  const CENTRAL = { state: "idle", lastOkAt: "", lastCount: 0, lastError: "", loaded: false };
  const readPending = () => { try { return new Set(JSON.parse(localStorage.getItem(PENDING_KEY) || "[]")); } catch (e) { return new Set(); } };
  const writePending = (set) => { try { localStorage.setItem(PENDING_KEY, JSON.stringify([...set])); } catch (e) {} };
  function toDbItem(c) {
    const keep = ["no", "name", "city", "phone", "mobile", "phone_status", "phone_type", "phone_note", "phone_sources", "phone_reported_sources", "phone_reported_status",
      "phone_evidence", "phone_candidates", "phone_candidates_rejected", "phone_history", "phone_approved", "phone_live_sources", "email", "mail", "email_sources", "email_status",
      "verification_rule_v", "enrichment_status", "saved_at"];
    const o = {};
    keep.forEach(k => { if (c[k] !== undefined) o[k] = c[k]; });
    if (c.phone_check_log) o.phone_check = { checked_at: c.phone_check_log.checked_at, result: c.phone_check_log.result, sources: (c.phone_check_log.sources || []).map(s => ({ source: s.source, result: s.result })) };
    // עמודת הטלפון הראשית במאגר מתמלאת (רק אם ריקה) אך ורק בטלפון עם ראיה מתועדת – לא במספר "לא מאומת"
    o.phone_db = normPhone(c.phone) && (c.phone_status === "single_source" || c.phone_status === "verified_two_sources") ? c.phone : "";
    return o;
  }
  async function authHeaders() {
    let sess = null;
    try { sess = (typeof userSession === "function") ? await userSession() : null; } catch (e) {}
    if (!sess || !sess.accessToken || typeof SUPABASE_STAGING_URL === "undefined") return null;
    return { "Content-Type": "application/json", apikey: SUPABASE_STAGING_ANON, Authorization: "Bearer " + sess.accessToken };
  }
  async function rpcCall(name, body, headers) {
    const r = await fetch(SUPABASE_STAGING_URL + "/rest/v1/rpc/" + name, { method: "POST", headers, body: JSON.stringify(body) });
    if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 160));
    return r.json();
  }
  let flushTimer = null, flushing = false;
  function queueSave(c) {
    if (!c || !c.no) return;
    c.saved_at = new Date().toISOString();
    CACHE.set(String(c.no), toDbItem(c));
    const p = readPending(); p.add(String(c.no)); writePending(p);
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => { flushSaves(); }, 2500);
  }
  async function flushSaves() {
    if (flushing) return CENTRAL;
    const pending = readPending();
    if (!pending.size) return CENTRAL;
    const headers = await authHeaders();
    if (!headers) { CENTRAL.state = "not_signed_in"; updateCentralBadge(); return CENTRAL; }
    flushing = true;
    try {
      const items = C.filter(c => c.discovery_batch === "batch_200_regular" && pending.has(String(c.no))).map(toDbItem);
      for (let i = 0; i < items.length; i += 50) {
        await rpcCall("op_batch200_save", { p_items: items.slice(i, i + 50) }, headers);
        const p = readPending(); items.slice(i, i + 50).forEach(it => p.delete(String(it.no))); writePending(p);
      }
      CENTRAL.state = "ok"; CENTRAL.lastOkAt = new Date().toISOString(); CENTRAL.lastCount = items.length; CENTRAL.lastError = "";
    } catch (e) {
      CENTRAL.state = "error"; CENTRAL.lastError = String(e.message || e);
      console.warn("[phone-engine] central save failed", e);
    } finally { flushing = false; updateCentralBadge(); }
    return CENTRAL;
  }
  async function loadFromCentral() {
    const headers = await authHeaders();
    if (!headers) { CENTRAL.state = "not_signed_in"; updateCentralBadge(); return CENTRAL; }
    await flushSaves(); // שינויים מקומיים שלא נשמרו עוברים קודם למאגר
    const batch = C.filter(c => c.discovery_batch === "batch_200_regular");
    if (!batch.length) return CENTRAL;
    try {
      const rows = await rpcCall("op_batch200_load", { p_hps: batch.map(c => String(c.no)) }, headers);
      const byHp = new Map((rows || []).map(r => [String(r.company_hp), r.batch200]));
      const pending = readPending();
      let applied = 0;
      batch.forEach(c => {
        const db = byHp.get(String(c.no));
        if (db) { const cur = CACHE.get(String(c.no)); if (!cur || !cur.saved_at || (db.saved_at && db.saved_at >= cur.saved_at)) CACHE.set(String(c.no), db); }
        if (db && !pending.has(String(c.no)) && (!c.saved_at || !db.saved_at || db.saved_at >= c.saved_at)) {
          Object.keys(db).forEach(k => { if (k !== "phone_db" && k !== "phone_check") c[k] = db[k]; });
          if (db.phone_check) c.phone_check_log = Object.assign({}, c.phone_check_log || {}, db.phone_check);
          applied++;
        } else if (!db && (normPhone(c.phone) || c.phone_check_log)) {
          pending.add(String(c.no)); // עדיין לא במאגר – יישמר עכשיו
        }
      });
      writePending(pending);
      if (applied && typeof persistProspectorData === "function") persistProspectorData();
      CENTRAL.loaded = true; CENTRAL.loadedCount = byHp.size;
      if (pending.size) await flushSaves();
      else { CENTRAL.state = "ok"; CENTRAL.lastOkAt = CENTRAL.lastOkAt || new Date().toISOString(); }
      rerender();
    } catch (e) {
      CENTRAL.state = "error"; CENTRAL.lastError = String(e.message || e);
    }
    updateCentralBadge();
    return CENTRAL;
  }
  function centralBadgeHtml() {
    const n = readPending().size;
    if (CENTRAL.state === "ok" && !n) return '☁️ התוצאות נשמרות במאגר המרכזי (Supabase STAGING)' + (CENTRAL.lastOkAt ? " · נשמר " + new Date(CENTRAL.lastOkAt).toLocaleTimeString("he-IL") : "") + (CENTRAL.loadedCount ? " · " + CENTRAL.loadedCount + " חברות במאגר" : "");
    if (CENTRAL.state === "error") return "⚠️ שמירה למאגר נכשלה – ינוסה שוב (" + (CENTRAL.lastError || "") + ")" + (n ? " · " + n + " ממתינות" : "");
    if (CENTRAL.state === "not_signed_in" || n) return "⚠️ לא מחובר לדליה – התוצאות נשמרות בדפדפן בלבד" + (n ? " (" + n + " חברות ממתינות לשמירה במאגר)" : "") + ". התחבר כדי לשמור לצמיתות.";
    return "☁️ שמירה מרכזית – בודק חיבור…";
  }
  function updateCentralBadge() {
    const el = document.getElementById("op200CentralBadge");
    if (el) el.textContent = centralBadgeHtml();
  }
  // עותק בזיכרון של התוצאות העדכניות לכל ח.פ. – מוחל מחדש אחרי שהסנכרון של המערכת מחליף את רשימת החברות בשורות מהמאגר
  const CACHE = new Map();
  function cacheFromC() {
    if (typeof C === "undefined") return;
    C.forEach(c => { if (c.discovery_batch === "batch_200_regular" && (c.phone_check_log || c.verification_rule_v === 2)) {
      const cur = CACHE.get(String(c.no));
      if (!cur || !cur.saved_at || (c.saved_at && c.saved_at >= cur.saved_at)) CACHE.set(String(c.no), toDbItem(c));
    } });
  }
  function applyCache() {
    if (typeof C === "undefined") return 0;
    let n = 0;
    C.forEach(c => {
      const it = CACHE.get(String(c.no));
      if (!it || c.discovery_batch !== "batch_200_regular") return;
      if (c.saved_at && it.saved_at && c.saved_at > it.saved_at) return;
      Object.keys(it).forEach(k => { if (k !== "phone_db" && k !== "phone_check") c[k] = it[k]; });
      if (it.phone_check) c.phone_check_log = Object.assign({}, c.phone_check_log || {}, it.phone_check);
      n++;
    });
    return n;
  }
  if (typeof window.merge200IntoC === "function" && !window.merge200IntoC.__opWrapped) {
    const origMerge = window.merge200IntoC;
    window.merge200IntoC = function () {
      const r = origMerge.apply(this, arguments);
      try { applyCache(); } catch (e) {}
      return r;
    };
    window.merge200IntoC.__opWrapped = true;
  }
  window.OPCentral = { flushSaves, loadFromCentral, queueSave, state: CENTRAL, pending: () => [...readPending()], cacheSize: () => CACHE.size };

  // סטטוס אימות לפי ראיות מתועדות בלבד (מקור + קישור) עבור המספר הנוכחי; מקורות מדווחים בלי ראיה נשמרים בנפרד ולא נמחקים
  function documentedSources(c) {
    const cur = normPhone(c.phone);
    if (!cur) return [];
    return [...new Set((c.phone_evidence || []).filter(e => normPhone(e.phone) === cur && e.url).map(e => e.source))];
  }
  function applyVerificationStatus(c) {
    const cur = normPhone(c.phone);
    if (!Array.isArray(c.phone_reported_sources)) {
      c.phone_reported_sources = Array.isArray(c.phone_sources) ? c.phone_sources.slice() : [];
      c.phone_reported_status = c.phone_status || "";
    }
    if (!cur) {
      c.phone_status = "awaiting_contact"; c.phone_verified = false; c.phone_sources = [];
      c.phoneVerBadgeColor = "gray"; c.phoneVerBadgeLabel = "ממתינה להשלמת קשר"; c.phone_type = "";
      return;
    }
    const doc = documentedSources(c);
    c.phone_sources = doc;
    c.phone_status = doc.length >= 2 ? "verified_two_sources" : (doc.length === 1 ? "single_source" : "unverified");
    c.phone_verified = doc.length >= 2;
    c.phoneVerBadgeColor = doc.length >= 2 ? "green" : (doc.length === 1 ? "orange" : "gray");
    c.phoneVerBadgeLabel = doc.length >= 2 ? "מאומת בשני מקורות" : (doc.length === 1 ? "מקור חי אחד" : "לא מאומת");
    const evCur = (c.phone_evidence || []).filter(e => normPhone(e.phone) === cur && e.url);
    c.phone_type = !evCur.length ? "unknown" : (evCur.every(e => e.branch) ? "branch" : "main");
    c.verification_rule_v = 2;
  }
  function migrateBatchVerification() {
    if (typeof C === "undefined" || !Array.isArray(C)) return 0;
    let n = 0;
    C.forEach(c => { if (c.discovery_batch === "batch_200_regular" && c.verification_rule_v !== 2) { applyVerificationStatus(c); n++; } });
    if (n && typeof persistProspectorData === "function") persistProspectorData();
    return n;
  }

  // תיקון סטטוס במאגר 130 המקורות לפי בדיקה חיה (2026-10-18): מקורות שסומנו "מחובר אוטומטית" אך נחסמים בדפדפן או לא רלוונטיים
  const BLOCKED_LIVE = {
    13: "GitHub Orgs מחזיר 404 לשמות חברות ישראליות – לא רלוונטי לאיתור טלפונים",
    37: "OpenCorporates חוסם קריאה מהדפדפן (CORS) ודורש מפתח API",
    121: "Start-Up Nation Finder חוסם קריאה מהדפדפן (CORS) – נדרש שרת מתווך",
    122: "IVC חוסם קריאה מהדפדפן (CORS) ובתשלום",
    123: "IATI חוסם קריאה מהדפדפן (CORS) – נדרש שרת מתווך",
    124: "התאחדות הקבלנים חוסמת קריאה מהדפדפן (CORS) – נדרש שרת מתווך",
    125: "איגוד חברות הניקיון חוסם קריאה מהדפדפן (CORS) – נדרש שרת מתווך",
    127: "איגוד המסעדות חוסם קריאה מהדפדפן (CORS) – נדרש שרת מתווך",
    128: "אתר המל״ג חוסם קריאה מהדפדפן (CORS) – נדרש שרת מתווך",
    129: "JGive חוסם קריאה מהדפדפן (CORS) – נדרש שרת מתווך"
  };
  if (Array.isArray(window.ALL_130_SOURCES)) {
    window.ALL_130_SOURCES.forEach(s => {
      if (BLOCKED_LIVE[s.id] && s.status === "connected_live") {
        s.status = "inaccessible_or_unfit";
        s.statusLabel = "נבדק – לא מחזיר מידע אוטומטית";
        s.blockReason = BLOCKED_LIVE[s.id];
      }
    });
    try {
      const sel = JSON.parse(localStorage.getItem("dalia_prospector_active_sources") || "null");
      if (Array.isArray(sel)) localStorage.setItem("dalia_prospector_active_sources", JSON.stringify(sel.filter(id => !BLOCKED_LIVE[id])));
    } catch (e) {}
  }

  const normPhone = (raw) => {
    let d = String(raw || "").replace(/\D/g, "");
    if (/^1(700|800|599)\d{6}$/.test(d)) return d; // מספרי 1-800 / 1-700 / 1-599 ארציים
    if (d.startsWith("972")) d = "0" + d.slice(3);
    if (d.length === 8 || (d.length === 9 && !d.startsWith("0"))) d = "0" + d;
    return /^0(5\d{8}|7\d{8}|[23489]\d{7})$/.test(d) ? d : "";
  };
  const fmtPhone = (p) => /^1\d{9}$/.test(p) ? p.slice(0, 1) + "-" + p.slice(1, 4) + "-" + p.slice(4, 7) + "-" + p.slice(7) : /^0(5|7)/.test(p) ? p.slice(0, 3) + "-" + p.slice(3, 6) + "-" + p.slice(6) : p.slice(0, 2) + "-" + p.slice(2, 5) + "-" + p.slice(5);
  const hasPhone = (c) => Boolean(c.phone && c.phone !== "לא נמצא" && c.phone !== "—" && normPhone(c.phone));
  const coreName = (s) => String(s || "")
    .replace(/\(חל.?צ\)|חל"צ|חל״צ/g, "")
    .replace(/בע"?מ|בע״מ|בעמ|בע~מ|ltd\.?|limited/gi, "")
    .replace(/מוזיאו/g, "מוזאו") // כתיב מלא/חסר: "מוזיאון" במרשם החברות, "מוזאון" במאגר משרד התרבות
    .replace(/[~"'״׳().,\-–_/\\]/g, " ")
    .replace(/\s+/g, "").toLowerCase();
  const hpOf = (c) => String(c.no || c.company_hp || "").replace(/\D/g, "");
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function getJson(url, timeoutMs) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs || 15000);
    try {
      const r = await fetch(url, { signal: ac.signal });
      clearTimeout(t);
      if (!r.ok) return { error: "HTTP " + r.status };
      return { data: await r.json() };
    } catch (e) {
      clearTimeout(t);
      return { error: e.name === "AbortError" ? "timeout" : "חסימת רשת/CORS" };
    }
  }

  // מאגרים שנבדקים לפי שם נטענים פעם אחת לכל הרצה (מאות עד אלפי רשומות) ונבנה אינדקס לפי שם מנורמל
  const nameIndexCache = {};
  async function nameIndex(src) {
    if (nameIndexCache[src.key]) return nameIndexCache[src.key];
    const res = await getJson(CKAN + src.rid + "&limit=32000", 60000);
    if (res.error || !res.data || !res.data.success) {
      nameIndexCache[src.key] = { error: res.error || "API error" };
      return nameIndexCache[src.key];
    }
    const idx = new Map();
    for (const rec of res.data.result.records) {
      const k = coreName(rec[src.nameField]);
      if (k.length < 4) continue;
      if (!idx.has(k)) idx.set(k, []);
      idx.get(k).push(rec);
    }
    nameIndexCache[src.key] = { idx, total: res.data.result.records.length };
    return nameIndexCache[src.key];
  }

  let lastOsmCall = 0;
  async function queryOsm(c) {
    const wait = 1100 - (Date.now() - lastOsmCall); // מדיניות השימוש של Nominatim: עד בקשה אחת בשנייה
    if (wait > 0) await sleep(wait);
    lastOsmCall = Date.now();
    const q = String(c.name || "").replace(/\(חל.?צ\)|בע"?מ|בע״מ|בעמ/g, "").trim() + (c.city ? " " + c.city : "");
    const url = "https://nominatim.openstreetmap.org/search?format=json&countrycodes=il&extratags=1&namedetails=1&limit=5&q=" + encodeURIComponent(q);
    const res = await getJson(url, 15000);
    if (res.error) return { error: res.error, url };
    const want = coreName(c.name);
    const hits = [];
    for (const p of res.data || []) {
      const names = Object.values(p.namedetails || {}).concat([p.name || ""]).map(coreName);
      // התאמה רק כששם המקום ב-OSM זהה לשם החברה (לא "מכיל") – למניעת שיוך טלפון לגוף אחר
      if (!names.some(n => n && n === want)) continue;
      const tags = p.extratags || {};
      ["phone", "contact:phone", "contact:mobile"].forEach(k => String(tags[k] || "").split(/[;,]/).forEach(v => {
        const n = normPhone(v);
        if (n) hits.push({ phone: n, email: tags.email || tags["contact:email"] || "", recUrl: "https://www.openstreetmap.org/" + p.osm_type + "/" + p.osm_id });
      }));
    }
    return { hits, url };
  }

  // בדיקת חברה אחת מול כל המקורות שנבחרו; מחזירה יומן מלא ומעדכנת את הכרטיס
  async function enrichSingleCompanyPhone(c) {
    const active = (typeof window.getActiveSourcesList === "function") ? window.getActiveSourcesList().map(Number) : PHONE_SOURCES.map(s => s.catId);
    const hp = hpOf(c);
    const want = coreName(c.name);
    const log = { checked_at: new Date().toISOString(), hp, sources: [] };
    const found = new Map(); // phone -> [evidence]
    const emails = new Map(); // email -> [evidence]

    for (const src of PHONE_SOURCES) {
      if (typeof src.catId === "number" && !active.includes(src.catId)) { log.sources.push({ source: src.label, result: "לא נבחר במקורות החיפוש" }); continue; }
      let recs = [], matchedBy = "", recUrl = "", err = "";
      if (src.by === "hp") {
        if (!hp) { log.sources.push({ source: src.label, result: "אין ח.פ. לחיפוש" }); continue; }
        recUrl = CKAN + src.rid + "&filters=" + encodeURIComponent(JSON.stringify({ [src.hpField]: src.hpNumeric ? Number(hp) : hp }));
        const res = await getJson(recUrl + "&limit=20");
        if (res.error || !res.data.success) err = res.error || "API error";
        else { recs = res.data.result.records; matchedBy = "ח.פ. " + hp; }
      } else if (src.by === "name") {
        const ix = await nameIndex(src);
        if (ix.error) err = ix.error;
        else { recs = ix.idx.get(want) || []; matchedBy = "שם מלא זהה"; recUrl = DS + "?q=" + encodeURIComponent(c.name); }
      } else if (src.by === "osm") {
        const r = await queryOsm(c);
        if (r.error) err = r.error;
        else r.hits.forEach(h => {
          const ev = { source: src.label, url: h.recUrl, matched_by: "שם זהה + עיר", checked_at: log.checked_at };
          if (!found.has(h.phone)) found.set(h.phone, []);
          found.get(h.phone).push(ev);
          if (h.email) { const m = h.email.toLowerCase(); if (!emails.has(m)) emails.set(m, []); emails.get(m).push(ev); }
        });
        log.sources.push({ source: src.label, result: err ? "שגיאה: " + err : (r.hits.length ? "נמצא " + r.hits.length + " טלפון" : "לא נמצא"), url: r.url });
        continue;
      } else if (src.by === "registry") {
        if (!hp) { log.sources.push({ source: src.label, result: "אין ח.פ. לחיפוש" }); continue; }
        const r = await queryRegistrySite(hp);
        if (r.error) { log.sources.push({ source: src.label, result: r.error.startsWith("דורש") ? r.error : "שגיאה: " + r.error }); continue; }
        r.hits.forEach(h => {
          const ev = { source: src.label, url: h.website, matched_by: "ח.פ. " + hp + " במאגר הלאומי + הטלפון מופיע באתר החברה", record_name: h.branchName, checked_at: log.checked_at, branch: h.branch };
          if (!found.has(h.phone)) found.set(h.phone, []);
          if (!found.get(h.phone).some(e => e.source === src.label)) found.get(h.phone).push(ev);
        });
        log.sources.push({ source: src.label, result: r.hits.length ? "נמצא " + r.hits.length + " טלפון באתר החברה" : "לא נמצא" });
        continue;
      }
      if (err) { log.sources.push({ source: src.label, result: "שגיאה: " + err }); continue; }
      let n = 0;
      for (const rec of recs) {
        // קישור ראיה שמחזיר את הרשומה עצמה (לפי ח.פ. או לפי השם המדויק במאגר)
        const recLink = src.by === "hp" ? recUrl : CKAN + src.rid + "&filters=" + encodeURIComponent(JSON.stringify({ [src.nameField]: rec[src.nameField] }));
        const ev = { source: src.label, url: recLink, matched_by: matchedBy, record_name: String(rec[src.nameField] || ""), checked_at: log.checked_at, branch: BRANCH_SOURCES.includes(src.key) };
        for (const f of src.phoneFields) {
          const p = normPhone(rec[f]);
          if (!p) continue;
          if (!found.has(p)) found.set(p, []);
          if (!found.get(p).some(e => e.source === src.label)) { found.get(p).push(ev); n++; }
        }
        const m = src.emailField ? String(rec[src.emailField] || "").trim().toLowerCase() : "";
        if (m.includes("@")) { if (!emails.has(m)) emails.set(m, []); if (!emails.get(m).some(e => e.source === src.label)) emails.get(m).push(ev); }
      }
      log.sources.push({ source: src.label, result: recs.length ? (n ? "נמצא " + n + " טלפון" : "נמצאה רשומה ללא טלפון") : "לא נמצא", matched_by: recs.length ? matchedBy : "" });
    }

    // עדכון הכרטיס – בלי להחליף טלפון קיים
    const existing = normPhone(c.phone);
    c.phone_evidence = Array.isArray(c.phone_evidence) ? c.phone_evidence : [];
    const addEvidence = (p, evs) => evs.forEach(ev => {
      if (!c.phone_evidence.some(e => e.phone === p && e.source === ev.source)) c.phone_evidence.push(Object.assign({ phone: fmtPhone(p) }, ev));
    });
    let newPhone = false;
    // מועמד = מספר שונה מהקיים; נשמר עם הראיות וסימון סניף כדי שאפשר יהיה לאשר אותו ידנית
    const toCandidate = ([p, evs]) => ({ phone: fmtPhone(p), sources: evs.map(e => e.source), branch: evs.every(e => e.branch), evidence: evs.map(e => Object.assign({ phone: fmtPhone(p) }, e)) });
    const keepRejected = (list) => list.filter(x => !(c.phone_candidates_rejected || []).some(r => normPhone(r.phone) === normPhone(x.phone)));
    if (existing) {
      if (found.has(existing)) addEvidence(existing, found.get(existing));
      const others = [...found.entries()].filter(([p]) => p !== existing);
      if (others.length) {
        c.phone_candidates = keepRejected(others.map(toCandidate));
        log.note = "נמצא מספר שונה מהקיים – נשמר כמועמד לבדיקה ואישור, הקיים לא הוחלף";
      }
    } else if (found.size) {
      // עדיפות לטלפון ראשי (לא סניף), ואז למספר עם הכי הרבה מקורות עצמאיים
      const best = [...found.entries()].sort((a, b) => (a[1].every(e => e.branch) ? 1 : 0) - (b[1].every(e => e.branch) ? 1 : 0) || b[1].length - a[1].length)[0];
      c.phone = fmtPhone(best[0]);
      if (/^05/.test(best[0])) c.mobile = c.phone;
      addEvidence(best[0], best[1]);
      // טלפון שמקורו רק במעון/סניף שהארגון מפעיל – מסומן כטלפון סניף ולא כטלפון ההנהלה
      c.phone_note = best[1].every(e => e.branch) ? "טלפון של מעון/סניף שהארגון מפעיל (" + (best[1][0].record_name || "") + ") – לא בהכרח טלפון ההנהלה" + (found.size > 1 ? "; נמצאו " + found.size + " מספרי סניפים" : "") : "";
      newPhone = true;
      if (found.size > 1) c.phone_candidates = keepRejected([...found.entries()].filter(([p]) => p !== best[0]).map(toCandidate));
    }
    const cur = normPhone(c.phone);
    const liveSources = [...new Set(c.phone_evidence.filter(e => normPhone(e.phone) === cur).map(e => e.source))];
    // סטטוס לפי ראיות מתועדות בלבד; "מאומת" רק עם 2 מקורות עצמאיים שלכל אחד ראיה
    applyVerificationStatus(c);
    c.enrichment_status = cur ? "enriched" : "awaiting_contact";
    if (c.phone_type === "branch" && !c.phone_note) c.phone_note = "טלפון של סניף/מסגרת שהארגון מפעיל – לא בהכרח טלפון ההנהלה";
    if (c.phone_type === "main") c.phone_note = "";
    c.phone_live_sources = liveSources;
    if ((!c.email || c.email === "—") && emails.size) {
      const bestM = [...emails.entries()].sort((a, b) => b[1].length - a[1].length)[0];
      c.email = c.mail = bestM[0];
      c.email_sources = bestM[1].map(e => e.source);
      c.email_status = bestM[1].length >= 2 ? "verified_two_sources" : "single_source";
    }
    log.result = newPhone ? "טלפון חדש: " + c.phone + " (" + liveSources.length + " מקורות)" + (c.phone_note ? " – טלפון סניף" : "") : (existing ? (liveSources.length ? "הטלפון הקיים נמצא ב-" + liveSources.length + " מקורות חיים" : "הטלפון הקיים לא נמצא במקורות החיים") : "לא נמצא טלפון");
    log.new_phone = newPhone;
    c.phone_check_log = log;
    return log;
  }

  function batchList() {
    const f = (window.S && S.coFilter) || {};
    const b = f.discoveryBatch && f.discoveryBatch !== "all" ? f.discoveryBatch : "batch_200_regular";
    return C.filter(c => c.discovery_batch === b);
  }

  function rerender() {
    const v = document.getElementById("view");
    if (v && S.tab === "companies" && V.companies) v.innerHTML = V.companies();
  }

  async function runList(list, title) {
    if (S.enrichmentRunning) { toast("השלמת טלפונים כבר רצה", "warn"); return; }
    S.enrichmentRunning = true;
    S.enrichmentPaused = false;
    const run = { title, started_at: new Date().toISOString(), total: list.length, checked: 0, new_phones: 0, verified2: 0, confirmed_existing: 0, errors: 0, items: [] };
    S.lastPhoneRun = run;
    rerender();
    toast(title + ": בודק " + list.length + " חברות מול המקורות שנבחרו...", "info");
    for (const c of list) {
      if (S.enrichmentPaused) break;
      const log = await enrichSingleCompanyPhone(c);
      run.checked++;
      if (log.new_phone) { run.new_phones++; if (c.phone_status === "verified_two_sources") run.verified2++; }
      else if (normPhone(c.phone) && (c.phone_live_sources || []).length) run.confirmed_existing++;
      if (log.sources.some(s => String(s.result).startsWith("שגיאה"))) run.errors++;
      run.items.push({ name: c.name, hp: log.hp, result: log.result, sources: log.sources });
      persistProspectorData(); // שמירה אחרי כל חברה
      queueSave(c); // ושמירה במאגר המרכזי
      const st = document.getElementById("phoneRunProgress");
      if (st) st.textContent = "נבדקו " + run.checked + "/" + run.total + " · טלפונים חדשים: " + run.new_phones;
    }
    run.finished_at = new Date().toISOString();
    await flushSaves();
    run.stopped = S.enrichmentPaused;
    try { localStorage.setItem("dalia_prospector_last_phone_run", JSON.stringify(run)); } catch (e) {}
    S.enrichmentRunning = false;
    rerender();
    toast("✓ " + title + " הסתיים: נבדקו " + run.checked + ", טלפונים חדשים " + run.new_phones + (run.errors ? ", שגיאות מקור " + run.errors : ""), run.new_phones ? "success" : "info");
    return run;
  }

  // כפתור "השלמת טלפונים לנבחרות"
  window.enrichSelectedPhones = async function () {
    if (!S.selectedCoIds || S.selectedCoIds.size === 0) { toast("יש לסמן לפחות חברה אחת להשלמת טלפון", "warn"); return; }
    return runList(C.filter(c => S.selectedCoIds.has(c.id)), "השלמת טלפונים לנבחרות");
  };

  // הפעלה כללית: כל החברות בסבב שחסר להן טלפון
  window.runPhoneEnrichment = async function () {
    return runList(batchList().filter(c => !hasPhone(c)), "השלמת טלפונים לחברות ללא טלפון");
  };

  // כפתור "השלמת טלפונים" במרכז האיתור: פותח את 200 החברות מסוננות ל"ללא טלפון" ומריץ עליהן
  window.triggerPhoneEnrichmentFromHub = function () {
    if (typeof window.navigateToBatch200 === "function") window.navigateToBatch200(); else window.navigateToTab("companies");
    S.coFilter = S.coFilter || {};
    S.coFilter.phoneStatus = "without_phone";
    rerender();
    setTimeout(() => window.runPhoneEnrichment(), 250);
  };

  window.selectAllFilteredCompanies = function () {
    const ids = Array.isArray(window.__coFilteredIds) ? window.__coFilteredIds : [];
    S.selectedCoIds = S.selectedCoIds || new Set();
    ids.forEach(id => S.selectedCoIds.add(id));
    rerender();
    toast("נבחרו " + ids.length + " חברות (כל המסוננות)", "info");
  };
  window.clearCompanySelection = function () {
    if (S.selectedCoIds) S.selectedCoIds.clear();
    rerender();
  };

  window.showLastPhoneRun = function () {
    let run = S.lastPhoneRun;
    if (!run) { try { run = JSON.parse(localStorage.getItem("dalia_prospector_last_phone_run") || "null"); } catch (e) {} }
    if (!run) { toast("עדיין לא הורצה השלמת טלפונים", "info"); return; }
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
    const rows = run.items.map(it => "<tr><td>" + esc(it.name) + "</td><td>" + esc(it.hp) + "</td><td>" + esc(it.result) + "</td><td style='font-size:11px'>" +
      it.sources.map(s => esc(s.source) + ": " + esc(s.result)).join("<br>") + "</td></tr>").join("");
    const box = document.createElement("div");
    box.id = "phoneRunLogModal";
    box.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px";
    box.innerHTML = "<div style='background:var(--card,#fff);color:var(--text,#111);border-radius:12px;max-width:1100px;width:100%;max-height:88vh;overflow:auto;padding:18px' dir='rtl'>" +
      "<div style='display:flex;justify-content:space-between;align-items:center;gap:8px'><h3 style='margin:0'>📋 יומן השלמת טלפונים</h3><button class='btn btn-sm' onclick=\"document.getElementById('phoneRunLogModal').remove()\">סגור</button></div>" +
      "<p class='xs'>" + esc(run.title) + " · נבדקו " + run.checked + "/" + run.total + " · טלפונים חדשים " + run.new_phones + " (מאומתים ב-2 מקורות: " + run.verified2 + ") · טלפונים קיימים שנמצאו במקורות חיים: " + run.confirmed_existing + " · חברות עם שגיאת מקור: " + run.errors + " · " + esc(run.finished_at || "רץ...") + "</p>" +
      "<table class='tbl' style='width:100%;font-size:12px'><thead><tr><th>חברה</th><th>ח.פ.</th><th>תוצאה</th><th>מקורות שנבדקו</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
    document.body.appendChild(box);
  };

  // הוספת כפתורי "בחר את כל המסוננות", "נקה בחירה" ו"יומן השלמה" ליד כפתור ההשלמה הקיים
  function wrapView(orig) {
    if (typeof orig !== "function" || orig.__phoneEngineWrapped) return orig;
    const wrapped = function () {
      const html = orig.apply(this, arguments);
      const marker = '<button type="button" class="btn btn-sm" onclick="enrichSelectedPhones()"';
      if (typeof html !== "string" || !html.includes(marker)) return html;
      const n = Array.isArray(window.__coFilteredIds) ? window.__coFilteredIds.length : 0;
      const sel = S.selectedCoIds ? S.selectedCoIds.size : 0;
      const extra =
        '<button type="button" class="btn btn-sm" onclick="selectAllFilteredCompanies()">☑ בחר את כל המסוננות (' + n + ')</button>' +
        '<button type="button" class="btn btn-sm" onclick="clearCompanySelection()"' + (sel ? "" : " disabled") + '>✕ נקה בחירה</button>' +
        '<button type="button" class="btn btn-sm" onclick="showLastPhoneRun()">📋 יומן השלמה</button>' +
        '<div id="op200CentralBadge" class="xs" style="flex-basis:100%;font-weight:700;margin-top:2px">' + centralBadgeHtml() + '</div>' +
        '<span id="phoneRunProgress" class="xs" style="font-weight:700">' + (S.enrichmentRunning ? "מריץ השלמת טלפונים..." : "") + '</span>';
      return html.replace(marker, extra + marker);
    };
    wrapped.__phoneEngineWrapped = true;
    return wrapped;
  }
  // הקוד הראשי מגדיר את V.companies מחדש גם אחרי טעינת הקובץ – העטיפה מוחלת בכל הגדרה
  if (typeof V !== "undefined" && V) {
    let current = wrapView(V.companies);
    Object.defineProperty(V, "companies", {
      configurable: true,
      enumerable: true,
      get() { return current; },
      set(fn) { current = wrapView(fn); }
    });
  }

  // בדיקת חיבור אמיתית: מקור "תקין" רק אם החזיר נתונים בפועל; חסימה/שגיאה מוצגת כשגיאה (לא "שרת זמין")
  window.pingSingleSource = async function (id, btn) {
    const src = (window.ALL_130_SOURCES || []).find(s => s.id === id);
    if (!src) return;
    const resSpan = document.getElementById("ping-res-" + id);
    const show = (ok, text) => { if (resSpan) resSpan.innerHTML = '<span style="color:' + (ok ? "#16a34a" : "#dc2626") + ';font-weight:700">' + (ok ? "✓ " : "✗ ") + text + "</span>"; };
    if (btn) btn.disabled = true;
    if (resSpan) resSpan.innerHTML = '<span class="muted" style="font-size:11px">בודק חיבור…</span>';
    const start = Date.now();
    try {
      if (BLOCKED_LIVE[id]) { show(false, BLOCKED_LIVE[id]); src.status = "inaccessible_or_unfit"; return; }
      let url = src.url, kind = "other";
      if (src.mechanism === "CKAN_API") { url = src.url.includes("limit=") ? src.url : src.url + "&limit=1"; kind = "ckan"; }
      else if (src.id === 27) { url = "https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent("עיריית חיפה") + "&format=json&limit=1"; kind = "json"; }
      else if (src.id === 77) { url = "https://gisn.tel-aviv.gov.il/arcgis/rest/services?f=pjson"; kind = "json"; }
      else if (src.status !== "connected_live") { show(false, src.statusLabel || "לא מחובר אוטומטית"); return; }
      const res = await getJson(url, 10000);
      const ms = Date.now() - start;
      if (res.error) { show(false, "לא החזיר נתונים: " + res.error + " (" + ms + "ms)"); src.status = "connected_failing"; return; }
      let n = 0;
      if (kind === "ckan") n = res.data && res.data.success ? res.data.result.total : 0;
      else if (Array.isArray(res.data)) n = res.data.length;
      else if (res.data && typeof res.data === "object") n = Object.keys(res.data).length;
      if (n > 0) { show(true, "מחזיר נתונים (" + n.toLocaleString("he-IL") + (kind === "ckan" ? " רשומות" : " פריטים") + ", " + ms + "ms)"); src.status = "connected_live"; }
      else { show(false, "החיבור נפתח אך לא חזרו נתונים (" + ms + "ms)"); src.status = "connected_failing"; }
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  // המקורות החדשים מוצגים גם במסך מקורות החיפוש (לא היו בקטלוג 130)
  if (Array.isArray(window.ALL_130_SOURCES)) {
    const extra = [
      ["daycare", "מעונות יום – משרד העבודה", "ח.פ. ארגון מפעיל + טלפון מעון"],
      ["welfare", "מסגרות רווחה – משרד הרווחה", "ח.פ. ארגון + טלפון מסגרת"],
      ["museums", "מוזאונים מוכרים – משרד התרבות", "שם מוזאון + טלפון + אימייל"],
      ["protected_housing", "בתי דיור מוגן", "שם חברה מפעילה + טלפון"],
      ["mail_permits", "בעלי היתר שירותי דואר – משרד התקשורת", "שם חברה + טלפון + אימייל"],
      ["registry_site", "אתר החברה – סריקת המאגר הלאומי (דורש התחברות)", "טלפון שמופיע באתר החברה + קישור לאתר"]
    ];
    extra.forEach(([key, name, types], i) => {
      if (window.ALL_130_SOURCES.some(s => s.engineKey === key)) return;
      const src = PHONE_SOURCES.find(s => s.key === key);
      window.ALL_130_SOURCES.push({ id: 131 + i, engineKey: key, cat: "gov", catName: "מאגרים ממשלתיים (data.gov.il)", name, nameEn: key,
        url: src.rid ? CKAN + src.rid : "https://usfeoerkpcafxxlyuldl.supabase.co/rest/v1/nr_businesses", mechanism: src.rid ? "CKAN_API" : "SUPABASE_AUTH", status: "connected_live", statusLabel: "מחובר אוטומטית – מנוע הטלפונים",
        dataTypes: types.split(" + "), isIsraeliRelevant: true, authRequired: false, paidRequired: false, blockReason: "" });
    });
  }

  // עדכון טלפון ידני: מספר שונה מהקיים מתחיל מאפס מקורות (המקורות הקודמים שייכים למספר הקודם)
  function manualSave(c, phone, source) {
    if (!phone) { toast("יש להזין מספר טלפון", "warn"); return false; }
    const n = normPhone(phone);
    if (!n) { toast("מספר טלפון לא תקין", "warn"); return false; }
    const same = normPhone(c.phone) === n;
    if (!same) {
      if (normPhone(c.phone)) {
        c.phone_history = Array.isArray(c.phone_history) ? c.phone_history : [];
        c.phone_history.push({ phone: c.phone, sources: c.phone_sources || [], replaced_at: new Date().toISOString(), replaced_by: source });
      }
      c.phone = fmtPhone(n);
      c.phone_sources = [];
      c.phone_live_sources = [];
      c.phone_note = "";
    }
    c.phone_sources = c.phone_sources || [];
    if (!c.phone_sources.includes(source)) c.phone_sources.push(source);
    c.phone_evidence = Array.isArray(c.phone_evidence) ? c.phone_evidence : [];
    c.phone_evidence.push({ phone: c.phone, source, url: "", matched_by: "הזנה ידנית", checked_at: new Date().toISOString() });
    // הזנה ידנית נרשמת כמקור מדווח; אימות נקבע רק לפי ראיות מתועדות (מקור + קישור)
    c.phone_reported_sources = Array.isArray(c.phone_reported_sources) ? c.phone_reported_sources : [];
    if (!c.phone_reported_sources.includes(source)) c.phone_reported_sources.push(source);
    applyVerificationStatus(c);
    c.enrichment_status = "enriched";
    persistProspectorData();
    queueSave(c);
    toast("✓ טלפון עודכן (" + c.phoneVerBadgeLabel + (same ? "" : " – מספר חדש, המקורות הקודמים נשמרו בהיסטוריה") + ")", "success");
    return true;
  }
  window.saveManualPhone = function () {
    const c = S.manualPhoneModal; if (!c) return;
    const inp = document.getElementById("manualPhoneInput"), srcEl = document.getElementById("manualPhoneSource");
    if (!manualSave(c, inp ? inp.value.trim() : "", srcEl ? srcEl.value.trim() : "אימות ידני")) return;
    if (typeof closeManualPhoneModal === "function") closeManualPhoneModal();
    rerender();
  };
  window.saveQuickPhone = function (coId) {
    const c = C.find(x => String(x.id) === String(coId)); if (!c) return;
    const inp = document.getElementById("quickPhoneInput"), srcEl = document.getElementById("quickPhoneSource");
    if (!manualSave(c, inp ? inp.value.trim() : "", srcEl ? srcEl.value.trim() : "אימות ידני")) return;
    rerender();
  };

  // תא איש הקשר ב-200: מציג ראיות חיות מהמנוע, טלפון סניף, מספרים מועמדים ומקור האימייל במקום "ממשלתי" קבוע
  if (typeof window.renderCustom200ContactCell === "function" && !window.renderCustom200ContactCell.__wrapped) {
    const origCell = window.renderCustom200ContactCell;
    const esc2 = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
    window.renderCustom200ContactCell = function (c) {
      let html = origCell(c);
      const emailSrc = (c.email_sources && c.email_sources.length) ? c.email_sources.join(" + ") : "";
      html = html.replace('<span class="badge b-ok" style="font-size:9px">ממשלתי</span>',
        emailSrc ? '<span class="badge ' + (c.email_status === "verified_two_sources" ? "b-ok" : "b-est") + '" style="font-size:9px" title="' + esc2(emailSrc) + '">' + (c.email_status === "verified_two_sources" ? "✓ 2 מקורות" : "מקור יחיד") + "</span>"
          : '<span class="badge" style="font-size:9px;background:#f1f5f9;color:#64748b" title="מקור האימייל לא תועד">מקור לא מתועד</span>');
      if (c.discovery_batch === "batch_200_regular" && c.verification_rule_v !== 2) applyVerificationStatus(c);
      // תווית סטטוס לפי ראיות מתועדות: מאומת (2) / מקור חי אחד (1) / לא מאומת (0)
      const single = '<span class="badge b-est" style="font-size:9.5px;padding:2px 6px" title="אומת במקור יחיד">≈ קיים, מקור יחיד</span>';
      if (c.phone_status === "unverified") html = html.replace(single, '<span class="badge" style="font-size:9.5px;padding:2px 6px;background:#f1f5f9;color:#475569" title="אין ראיה מתועדת (מקור + קישור) למספר הזה">⚠️ לא מאומת</span>');
      else if (c.phone_status === "single_source") html = html.replace(single, '<span class="badge b-est" style="font-size:9.5px;padding:2px 6px" title="נמצא במקור חי אחד עם ראיה">◐ מקור חי אחד</span>');
      const live = c.phone_live_sources || [];
      let extra = "";
      if (c.phone_type === "main" || c.phone_type === "branch") {
        extra += '<div class="xs" style="font-size:9.5px">' + (c.phone_type === "main" ? "🏢 טלפון ראשי של החברה" : "🏬 טלפון סניף/מסגרת") + "</div>";
      }
      const reported = (c.phone_reported_sources || []).filter(s => !(c.phone_sources || []).includes(s));
      if (reported.length && normPhone(c.phone)) extra += '<div class="xs" style="font-size:9.5px;max-width:220px;white-space:normal;color:#64748b" title="שמות מקורות שנרשמו בלי קישור ראיה – לא נספרים כאימות">🗒️ מקורות מדווחים (לא נבדקו): ' + esc2(reported.join(" + ")) + "</div>";
      if (c.phone_check_log) {
        extra += '<div class="xs" style="font-size:9.5px;max-width:220px;white-space:normal;line-height:1.25;color:' + (live.length ? "#15803d" : "#64748b") + '" title="נבדק ' + esc2(c.phone_check_log.checked_at) + '">🔎 ' +
          (live.length ? "נמצא במקור חי: " + esc2(live.join(" + ")) : "לא נמצא במקורות החיים שנבדקו") + "</div>";
      }
      if (c.phone_note) extra += '<div class="xs" style="font-size:9.5px;max-width:220px;white-space:normal;color:#b45309">⚠️ ' + esc2(c.phone_note) + "</div>";
      if (c.phone_candidates && c.phone_candidates.length) {
        extra += '<div class="xs" style="font-size:9.5px;max-width:240px;white-space:normal;color:#7c3aed;margin-top:2px">📋 מספרים נוספים לבדיקה ואישור:</div>';
        c.phone_candidates.slice(0, 4).forEach(p => {
          extra += '<div class="xs" style="font-size:9.5px;display:flex;gap:4px;align-items:center;flex-wrap:wrap"><span class="ltr bold">' + esc2(p.phone) + "</span>" +
            '<span class="muted">' + (p.branch ? "סניף · " : "") + esc2((p.sources || []).join(" + ")) + "</span>" +
            '<button class="btn btn-sm" style="padding:0 5px;font-size:9.5px" onclick="promoteCandidatePhone(' + JSON.stringify(String(c.id)).replace(/"/g, "&quot;") + "," + JSON.stringify(p.phone).replace(/"/g, "&quot;") + ')">✓ קבע כראשי</button>' +
            '<button class="btn btn-sm" style="padding:0 5px;font-size:9.5px" onclick="rejectCandidatePhone(' + JSON.stringify(String(c.id)).replace(/"/g, "&quot;") + "," + JSON.stringify(p.phone).replace(/"/g, "&quot;") + ')">✕ דחה</button></div>';
        });
        if (c.phone_candidates.length > 4) extra += '<div class="xs muted" style="font-size:9.5px">ועוד ' + (c.phone_candidates.length - 4) + " מספרים</div>";
      }
      if (!extra) return html;
      const at = html.indexOf('<div style="margin-top:4px;display:flex;gap:4px;align-items:center">');
      return at === -1 ? html + extra : html.slice(0, at) + extra + html.slice(at);
    };
    window.renderCustom200ContactCell.__wrapped = true;
  }

  // אישור ידני של מספר מועמד: המספר הנוכחי עובר להיסטוריה (לא נמחק), הראיות של המועמד נשמרות
  window.promoteCandidatePhone = function (coId, phone) {
    const c = C.find(x => String(x.id) === String(coId)); if (!c) return;
    const cand = (c.phone_candidates || []).find(p => normPhone(p.phone) === normPhone(phone)); if (!cand) return;
    if (!confirm("לקבוע את " + cand.phone + " כטלפון הראשי של " + c.name + "?\nהמספר הנוכחי (" + (c.phone || "—") + ") יישמר בהיסטוריה ולא יימחק.")) return;
    if (normPhone(c.phone)) {
      c.phone_history = Array.isArray(c.phone_history) ? c.phone_history : [];
      c.phone_history.push({ phone: c.phone, sources: c.phone_sources || [], reported_sources: c.phone_reported_sources || [], replaced_at: new Date().toISOString(), replaced_by: "אישור ידני של מספר מועמד" });
      c.phone_candidates.push({ phone: c.phone, sources: c.phone_sources || [], branch: c.phone_type === "branch", evidence: (c.phone_evidence || []).filter(e => normPhone(e.phone) === normPhone(c.phone)) });
    }
    c.phone = cand.phone;
    if (/^05/.test(normPhone(cand.phone))) c.mobile = cand.phone;
    c.phone_evidence = Array.isArray(c.phone_evidence) ? c.phone_evidence : [];
    (cand.evidence || []).forEach(e => { if (!c.phone_evidence.some(x => normPhone(x.phone) === normPhone(e.phone) && x.source === e.source)) c.phone_evidence.push(e); });
    c.phone_candidates = c.phone_candidates.filter(p => normPhone(p.phone) !== normPhone(cand.phone));
    c.phone_reported_sources = [];
    c.phone_note = cand.branch ? "טלפון של סניף/מסגרת שהארגון מפעיל – לא בהכרח טלפון ההנהלה" : "";
    c.phone_approved = { phone: cand.phone, at: new Date().toISOString() };
    applyVerificationStatus(c);
    persistProspectorData();
    rerender();
    queueSave(c);
    toast("✓ " + cand.phone + " נקבע כטלפון הראשי (" + c.phoneVerBadgeLabel + ")", "success");
  };
  window.rejectCandidatePhone = function (coId, phone) {
    const c = C.find(x => String(x.id) === String(coId)); if (!c) return;
    const cand = (c.phone_candidates || []).find(p => normPhone(p.phone) === normPhone(phone)); if (!cand) return;
    c.phone_candidates = c.phone_candidates.filter(p => p !== cand);
    c.phone_candidates_rejected = Array.isArray(c.phone_candidates_rejected) ? c.phone_candidates_rejected : [];
    c.phone_candidates_rejected.push(Object.assign({ rejected_at: new Date().toISOString() }, cand));
    persistProspectorData();
    rerender();
    queueSave(c);
    toast("המספר " + cand.phone + " סומן כלא רלוונטי (נשמר ברשימת הנדחים)", "info");
  };

  // החלת כלל האימות על 200 החברות בטעינה (חד-פעמי לכל דפדפן; לא מוחק מספרים, רק מעדכן סטטוס ומעביר מקורות מדווחים לשדה נפרד)
  try { migrateBatchVerification(); } catch (e) { console.warn("[phone-engine] verification migration", e); }
  try { cacheFromC(); } catch (e) {}
  // טעינה מהמאגר המרכזי אחרי שהחיבור לדליה מאותחל, ושליחה חוזרת של שמירות שממתינות
  setTimeout(() => { loadFromCentral().catch(() => {}); }, 2500);
  window.addEventListener("online", () => { flushSaves(); });
  setInterval(() => { if (readPending().size) flushSaves(); }, 60000);

  window.OPPhoneEngine = { PHONE_SOURCES, enrichSingleCompanyPhone, normPhone };
  window.enrichSingleCompanyPhone = enrichSingleCompanyPhone;
})();
