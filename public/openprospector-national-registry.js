/* OpenProspector – "מאגר עסקים ארצי" (Claude, STAGING)
 * שני מסכים בלשונית אחת:
 *  1. מאגר העסקים – חיפוש, סינון משולב, מיון ודפדוף בצד השרת (nr_browse), כרטיס עסק מלא עם מקורות,
 *     סימון לבדיקה / לא רלוונטי / ארכיון, קבוצות עבודה, ייצוא CSV. אף פעם לא נטען כל המאגר לדפדפן.
 *  2. איסוף ומקורות – מצב האיסוף בשרת (pg_cron → national-registry-collector), מקורות, יומן.
 * כל קריאה עוברת ב-session של משתמש מחובר; ההרשאות נבדקות בשרת (RLS + nr_can_read / nr_can_control).
 * מחיקה ואיפוס: מוכנים בשרת אך נעולים (nr_control.allow_destructive = false) – כאן מוצגים בלבד.
 */
(function () {
  "use strict";
  if (typeof TABS === "undefined" || typeof V === "undefined") return;

  const TAB = "national";
  if (!TABS.some(([k]) => k === TAB)) {
    const at = TABS.findIndex(([k]) => k === "search");
    TABS.splice(at + 1, 0, [TAB, "מאגר עסקים ארצי"]);
  }

  const LS_KEY = "dalia_nr_browse_v1";
  const saved = (() => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "null") || {}; } catch (e) { return {}; } })();
  const ST = {
    sub: saved.sub || "browse",
    // browse
    filters: saved.filters || { hide_archived: true },
    sort: saved.sort || "sources", page: 1, pageSize: saved.pageSize || 50,
    result: null, browsing: false, browseError: "", facets: null,
    selected: new Set(), selectAllMatching: false, showAdvanced: false,
    // collection
    loading: false, error: "", stats: null, sources: [], loadedAt: 0, srcFilter: "all",
    modal: null, timer: null, busy: false,
  };
  const persist = () => { try { localStorage.setItem(LS_KEY, JSON.stringify({ sub: ST.sub, filters: ST.filters, sort: ST.sort, pageSize: ST.pageSize })); } catch (e) { /* storage blocked */ } };

  const STATUS = {
    pending: ["ממתין", "b-no"], collecting: ["אוסף", "b-blue"], completed: ["הושלם", "b-ok"], partial: ["חלקי", "b-est"],
    blocked: ["חסום", "b-bad"], unsupported: ["לא נתמך", "b-no"], error: ["שגיאה", "b-bad"],
  };
  const KIND = { ckan: "API מידע פתוח (CKAN)", arcgis: "GIS עירוני (ArcGIS)", overpass: "OpenStreetMap", fleet_ckan: "צי רכב (API)", website: "אתרי עסקים", alias: "כפול למקור אחר", discovery: "גילוי מקורות", discovered: "התגלה – טרם מופה", manual: "ידני", paid: "בתשלום / מנוי", blocked: "חסום" };
  const MATCH = { created: "נוצר מרשומה זו", reg_id: "התאמה לפי ח.פ./מזהה רשמי", "name+city": "שם זהה + אותה עיר", name_unique: "שם זהה ויחיד במאגר", business_website: "אתר העסק עצמו" };
  const BIZ_STATUS = { active: "פעילה", inactive: "לא פעילה", unknown: "לא ידוע" };
  const ROLES = { ceo: "מנכ\"ל", owner: "בעלים", manager: "מנהל/ממונה", operations: "תפעול/לוגיסטיקה", fleet: "קצין רכב / צי", professional: "מנהל מקצועי", other: "תפקיד אחר" };
  const MARKS = { review: ["לבדיקה", "b-est"], irrelevant: ["לא רלוונטי", "b-no"], archived: ["בארכיון", "b-bad"] };
  const BANDS = ["1-5", "6-10", "11-50", "51-100", "101-500", "500+", "unknown"];
  const n = (x) => Number(x || 0).toLocaleString("he-IL");
  const catalog = () => (Array.isArray(window.ALL_130_SOURCES) ? window.ALL_130_SOURCES : []);

  async function client() {
    const sess = (typeof userSession === "function") ? await userSession() : null;
    if (!sess || !sess.accessToken || !window.supabase) throw new Error("נדרשת התחברות לדליה (משתמש מורשה) כדי לצפות במאגר");
    return window.supabase.createClient(SUPABASE_STAGING_URL, SUPABASE_STAGING_ANON, {
      global: { headers: { Authorization: "Bearer " + sess.accessToken } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  async function rpc(fn, args) {
    const sb = await client();
    const r = await sb.rpc(fn, args || {});
    if (r.error) throw new Error(r.error.message);
    return r.data;
  }
  const rerender = () => { if (S.view === "prospector" && S.tab === TAB) { const v = document.querySelector("#view"); if (v) v.innerHTML = V[TAB](); } };

  // ── data loading ──
  async function loadStats(force) {
    if (ST.loading || (!force && Date.now() - ST.loadedAt < 15000)) return;
    ST.loading = true; rerender();
    try {
      const sb = await client();
      const [st, src] = await Promise.all([
        sb.rpc("nr_stats"),
        sb.from("nr_sources").select("key,catalog_id,name,url,provider,kind,status,status_reason,priority,total_records,cursor,records_read,businesses_new,businesses_enriched,businesses_merged,details_added,errors,last_error,started_at,finished_at,last_run_at,duration_ms,terms,data_types").order("priority").order("key"),
      ]);
      if (st.error) throw new Error(st.error.message);
      if (src.error) throw new Error(src.error.message);
      ST.stats = st.data; ST.sources = src.data || []; ST.error = ""; ST.loadedAt = Date.now();
    } catch (e) { ST.error = e.message || String(e); }
    ST.loading = false; rerender();
  }
  async function loadFacets() {
    try { ST.facets = await rpc("nr_facets"); } catch (e) { /* shown via browse error */ }
    rerender();
  }
  let browseSeq = 0;
  async function browse() {
    const seq = ++browseSeq;
    ST.browsing = true; ST.browseError = ""; rerender();
    try {
      const data = await rpc("nr_browse", { p_filters: cleanFilters(), p_sort: ST.sort, p_page: ST.page, p_page_size: ST.pageSize });
      if (seq !== browseSeq) return;
      ST.result = data;
    } catch (e) { if (seq === browseSeq) ST.browseError = e.message || String(e); }
    if (seq === browseSeq) { ST.browsing = false; rerender(); }
  }
  function cleanFilters() {
    const f = {};
    for (const [k, v] of Object.entries(ST.filters)) {
      if (v === "" || v == null || v === false || (Array.isArray(v) && !v.length)) continue;
      f[k] = v;
    }
    return f;
  }
  function autoRefresh() {
    clearInterval(ST.timer);
    ST.timer = setInterval(() => {
      if (!(S.view === "prospector" && S.tab === TAB)) { clearInterval(ST.timer); ST.timer = null; return; }
      if (!document.hidden && !ST.modal) loadStats(true);
    }, 30000);
  }

  const reasonOf = (s) => s.status_reason || (catalog().find((c) => String(c.id) === String(s.catalog_id)) || {}).blockReason || "";
  const dur = (ms) => { const sec = Math.round(Number(ms || 0) / 1000); return sec < 60 ? sec + " שנ׳" : sec < 3600 ? Math.round(sec / 60) + " דק׳" : (sec / 3600).toFixed(1) + " שע׳"; };
  const when = (t) => (t ? new Date(t).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" }) : "—");
  const day = (t) => (t ? new Date(t).toLocaleDateString("he-IL") : "—");
  const badge = (status) => { const [l, c] = STATUS[status] || [status, "b-no"]; return `<span class="badge ${c}">${l}</span>`; };
  const kpi = (label, value, sub, extra) => `<div class="card kpi"${extra || ""}><div class="l">${label}</div><div class="v num">${value}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;

  // ── main view ──
  V[TAB] = () => {
    if (!ST.stats && !ST.loading && !ST.error) setTimeout(() => loadStats(true), 0);
    if (ST.sub === "browse" && !ST.result && !ST.browsing && !ST.browseError) setTimeout(browse, 0);
    if (ST.sub === "browse" && !ST.facets) setTimeout(loadFacets, 0);
    if (!ST.timer) autoRefresh();
    const subTabs = `<div class="row" style="gap:6px">
      <button class="btn btn-sm ${ST.sub === "browse" ? "btn-primary" : ""}" data-nr="sub" data-v="browse">📋 מאגר העסקים</button>
      <button class="btn btn-sm ${ST.sub === "collection" ? "btn-primary" : ""}" data-nr="sub" data-v="collection">⚙️ איסוף ומקורות</button>
      <span class="spacer"></span><span class="badge b-ok">STAGING</span><span class="badge b-est">ללא 7 חוקי הסינון – אין מחיקה</span></div>`;
    const body = ST.sub === "browse" ? browseView() : collectionView();
    return `<div style="display:grid;gap:14px">${subTabs}${kpiStrip()}${body}</div>${modal()}`;
  };

  function kpiStrip() {
    const s = ST.stats;
    if (ST.error && !s) return `<div class="card card-b"><div class="badge b-bad" style="white-space:normal">${esc(ST.error)}</div></div>`;
    if (!s) return `<div class="card card-b muted">⏳ טוען נתונים מ-Supabase STAGING…</div>`;
    const bs = s.sources_by_status || {};
    const filt = (k) => ` data-nr-filter="${k}" style="cursor:pointer" title="לחץ כדי לסנן"`;
    return `<div class="grid g-kpi tiles">
      ${kpi("עסקים ייחודיים במאגר", n(s.businesses), `${n(s.with_reg_id)} עם ח.פ. · ${n(s.active)} פעילים`)}
      ${kpi("עם טלפון", n(s.with_phone), `${n(s.with_verified_phone)} עם טלפון מאומת`, filt("phone"))}
      ${kpi("עם אימייל", n(s.with_email), `${n(s.emails)} כתובות`, filt("email"))}
      ${kpi("עם אתר / רשתות", `${n(s.with_website)} / ${n(s.with_social)}`, "אתר אינטרנט / פייסבוק, אינסטגרם, לינקדאין", filt("website"))}
      ${kpi("עם אנשי קשר", n(s.with_people), `${n(s.people)} אנשי קשר עסקיים`, filt("people"))}
      ${kpi("עם מספר עובדים (פורסם)", n(s.with_employees), "מספר שפורסם במקור בלבד – לא הערכה", filt("employees"))}
      ${kpi("עם תחום עיסוק", n(s.with_activity), `${n(s.with_fleet)} עם מידע על צי רכב`)}
      ${kpi("כפילויות שאוחדו", n(s.merged_records), `${n(s.multi_source)} עסקים ממקורות מרובים`)}
      ${kpi("מקורות", `${n(bs.completed)} הושלמו`, `${n(bs.blocked)} חסומים · ${n(bs.unsupported)} לא נתמכים · ${n(bs.error)} שגיאה`)}
      ${kpi("ממתינים לעדכון", n((s.sources_waiting || []).length), esc((s.sources_waiting || []).join(", ") || "אין"))}
    </div>`;
  }

  // ── browse ──
  const sel = (key, opts, label) => `<label class="f">${label}<select class="input" data-nr-f="${key}"><option value="">הכול</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(ST.filters[key] || "") === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const txt = (key, label, ph, type) => `<label class="f">${label}<input class="input" data-nr-f="${key}" type="${type || "text"}" placeholder="${esc(ph || "")}" value="${esc(ST.filters[key] || "")}"></label>`;
  const chk = (key, label) => `<label class="chip" style="cursor:pointer"><input type="checkbox" data-nr-fb="${key}" ${ST.filters[key] ? "checked" : ""}> ${label}</label>`;
  const multi = (key, val, label) => { const a = ST.filters[key] || []; return `<label class="chip" style="cursor:pointer"><input type="checkbox" data-nr-fm="${key}" data-v="${val}" ${a.includes(val) ? "checked" : ""}> ${label}</label>`; };
  const yesno = (key, label) => sel(key, [["yes", "יש"], ["no", "אין"]], label);

  function browseView() {
    const fc = ST.facets || {};
    const r = ST.result;
    const total = r ? r.total : 0;
    const pages = r ? Math.max(1, Math.ceil(total / ST.pageSize)) : 1;
    const activeCount = Object.keys(cleanFilters()).filter((k) => k !== "hide_archived").length;
    const filters = `<div class="card"><div class="card-h"><h2>סינון וחיפוש<span class="h-bar"></span></h2>
        <span class="xs muted">כל המסננים עובדים יחד · הסינון מתבצע בשרת</span><span class="spacer"></span>
        ${activeCount ? `<span class="badge b-blue">${activeCount} מסננים פעילים</span>` : ""}
        <button class="btn btn-sm" data-nr="clear">נקה סינון</button>
        <button class="btn btn-sm btn-primary" data-nr="apply">🔍 החל סינון</button></div>
      <div class="card-b" style="display:grid;gap:12px">
        <div class="grid g-3" style="gap:10px">
          ${txt("q", "שם חברה או ח.פ.", "לדוגמה: תנובה / 520022732")}
          ${sel("district", (fc.districts || []).map((d) => [d.v, `${d.v === "unknown" ? "לא ידוע" : d.v} (${n(d.n)})`]), "אזור בארץ")}
          <label class="f">עיר<input class="input" data-nr-f="city" list="nrCities" placeholder="הקלד עיר" value="${esc(ST.filters.city || "")}">
            <datalist id="nrCities">${(fc.cities || []).map((c) => `<option value="${esc(c.v)}">${n(c.n)}</option>`).join("")}</datalist></label>
        </div>
        <details ${ST.openGroups && ST.openGroups.biz ? "open" : ""} data-nr-group="biz"><summary class="bold">פרטי עסק</summary><div class="grid g-3" style="gap:10px;margin-top:8px">
          ${sel("status", Object.entries(BIZ_STATUS), "סטטוס")}
          ${sel("corp_type", (fc.corp_types || []).map((c) => [c.v, `${c.v} (${n(c.n)})`]), "סוג התאגדות")}
          <label class="f">תחום עיסוק ראשי<input class="input" data-nr-f="main_activity" list="nrActs" placeholder="בחר מהרשימה" value="${esc(ST.filters.main_activity || "")}">
            <datalist id="nrActs">${(fc.activities || []).map((a) => `<option value="${esc(a.v)}">${n(a.n)}</option>`).join("")}</datalist></label>
          ${txt("activity", "תחום עיסוק (מילה חופשית, כולל תחומים נוספים)", "לדוגמה: בני / הובלה / מוסך")}
          ${txt("founded_from", "שנת הקמה – מ-", "1990", "number")}
          ${txt("founded_to", "שנת הקמה – עד", "2026", "number")}
        </div></details>
        <details ${ST.openGroups && ST.openGroups.loc ? "open" : ""} data-nr-group="loc"><summary class="bold">מיקום</summary><div class="grid g-3" style="gap:10px;margin-top:8px">
          ${txt("address", "כתובת (חלק מהכתובת)", "רחוב")}
          <div class="row" style="align-items:end">${chk("branches", "עם סניפים / טלפוני סניף")}</div>
        </div></details>
        <details ${ST.openGroups && ST.openGroups.contact ? "open" : ""} data-nr-group="contact"><summary class="bold">פרטי קשר</summary><div style="display:grid;gap:8px;margin-top:8px">
          <div class="grid g-3" style="gap:10px">${yesno("phone", "טלפון")}${sel("verified_phone", [["yes", "מאומת (2+ מקורות)"], ["no", "יש טלפון, לא מאומת"]], "אימות טלפון")}${yesno("email", "אימייל")}${yesno("website", "אתר אינטרנט")}${yesno("people", "איש קשר עסקי")}</div>
          <div class="row">${chk("facebook", "פייסבוק")}${chk("instagram", "אינסטגרם")}${chk("linkedin", "לינקדאין")}</div>
          <div class="row"><span class="xs muted">בעל תפקיד:</span>${Object.entries(ROLES).filter(([k]) => k !== "other").map(([k, l]) => multi("roles", k, l)).join("")}</div>
        </div></details>
        <details ${ST.openGroups && ST.openGroups.emp ? "open" : ""} data-nr-group="emp"><summary class="bold">עובדים</summary><div style="display:grid;gap:8px;margin-top:8px">
          <div class="row"><span class="xs muted">טווח עובדים:</span>${BANDS.map((b) => multi("emp_bands", b, b === "unknown" ? "לא ידוע" : b === "500+" ? "יותר מ-500" : b + " עובדים")).join("")}</div>
          <div class="grid g-3" style="gap:10px">${txt("emp_min", "מספר עובדים מינימלי", "50", "number")}${txt("emp_max", "מספר עובדים מקסימלי", "", "number")}</div>
          <div class="xs muted">מספר עובדים = רק מספר שפורסם במקור (עמותות, חל"צ, משרד העבודה). עסק בלי נתון מסומן "לא ידוע" ואינו נפסל.</div>
        </div></details>
        <details ${ST.openGroups && ST.openGroups.fleet ? "open" : ""} data-nr-group="fleet"><summary class="bold">רכבים ופעילות</summary><div class="grid g-3" style="gap:10px;margin-top:8px">
          <div class="row" style="align-items:end">${chk("fleet", "יש מידע מתועד על צי רכב")}${chk("logistics", "אינדיקציה לפעילות שטח / הובלה / שליחויות")}</div>
          ${txt("vehicles_min", "מספר רכבים מינימלי (כשידוע)", "", "number")}
        </div></details>
        <details ${ST.openGroups && ST.openGroups.src ? "open" : ""} data-nr-group="src"><summary class="bold">מידע, מקורות וניהול</summary><div style="display:grid;gap:8px;margin-top:8px">
          <div class="grid g-3" style="gap:10px">
            ${sel("source", (fc.sources || []).map((s) => [s.v, s.name]), "מקור מידע")}
            ${sel("min_sources", [["2", "2 מקורות ומעלה"], ["3", "3 מקורות ומעלה"], ["4", "4 מקורות ומעלה"]], "מספר מקורות")}
            ${sel("verification", [["verified", "יש פרט מאומת"], ["unverified", "ללא פרט מאומת"]], "רמת אימות")}
            ${txt("collected_from", "נאסף מתאריך", "", "date")}${txt("collected_to", "נאסף עד תאריך", "", "date")}
            ${txt("updated_from", "עודכן מתאריך", "", "date")}
            ${sel("mark", Object.entries(MARKS).map(([k, [l]]) => [k, l]), "סימון")}
            ${sel("group_id", (fc.groups || []).map((g) => [g.id, `${g.name} (${n(g.n)})`]), "קבוצת עבודה")}
          </div>
          <div class="row"><span class="xs muted">חסר מידע:</span>${[["phone", "טלפון"], ["email", "אימייל"], ["address", "כתובת"], ["city", "עיר"], ["activity", "תחום עיסוק"], ["reg_id", "ח.פ."], ["employees", "מספר עובדים"]].map(([k, l]) => multi("missing", k, l)).join("")}</div>
          <div class="row">${chk("hide_archived", "הסתר עסקים בארכיון")}</div>
        </div></details>
      </div></div>`;

    const selCount = ST.selectAllMatching ? total : ST.selected.size;
    const ctl = (ST.stats && ST.stats.control) || {};
    const actions = `<div class="card"><div class="card-b row" style="gap:8px">
        <b class="num" style="font-size:18px">${ST.browsing ? "⏳" : n(total)}</b><span>עסקים עונים לתנאים</span>
        <span class="spacer"></span>
        <label class="xs muted">מיון <select class="input" style="width:auto;height:32px" data-nr="sort">${[["sources", "מספר מקורות"], ["name", "שם"], ["city", "עיר"], ["employees", "מספר עובדים"], ["founded", "שנת הקמה (ישן→חדש)"], ["founded_desc", "שנת הקמה (חדש→ישן)"], ["updated", "עדכון אחרון"], ["collected", "תאריך איסוף"]].map(([v, l]) => `<option value="${v}" ${ST.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="xs muted">בעמוד <select class="input" style="width:auto;height:32px" data-nr="pagesize">${[25, 50, 100, 200].map((x) => `<option ${ST.pageSize === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      </div>
      <div class="card-b row" style="gap:6px;border-top:1px solid var(--border)">
        <span class="xs">${selCount ? `<b>${n(selCount)}</b> נבחרו${ST.selectAllMatching ? " (כל התוצאות)" : ""}` : "לא נבחרו עסקים"}</span>
        ${total && !ST.selectAllMatching ? `<button class="btn btn-sm" data-nr="selall">בחר את כל ${n(total)} התוצאות</button>` : ""}
        ${selCount ? `<button class="btn btn-sm" data-nr="selnone">נקה בחירה</button>` : ""}
        <span class="spacer"></span>
        <button class="btn btn-sm" data-nr="markset" data-v="review" ${selCount ? "" : "disabled"}>🔎 לבדיקה</button>
        <button class="btn btn-sm" data-nr="markset" data-v="irrelevant" ${selCount ? "" : "disabled"}>🚫 לא רלוונטי</button>
        <button class="btn btn-sm" data-nr="markset" data-v="archived" ${selCount ? "" : "disabled"}>🗄️ לארכיון</button>
        <button class="btn btn-sm" data-nr="togroup" ${selCount ? "" : "disabled"}>👥 לקבוצת עבודה</button>
        <button class="btn btn-sm" data-nr="export">⬇️ ייצוא CSV / אקסל${selCount ? " (נבחרים)" : " (תוצאות הסינון)"}</button>
        <button class="btn btn-sm" disabled title="יופעל בשלב הבא – כרגע לא מסננים ולא מוחקים">🧭 7 חוקי הסינון של דליה – בשלב הבא</button>
        <button class="btn btn-sm btn-ghost" data-nr="advanced">${ST.showAdvanced ? "▲" : "▼"} ניהול מתקדם</button>
      </div>
      ${ST.showAdvanced ? `<div class="card-b" style="border-top:1px solid var(--border);display:grid;gap:8px">
        <div class="xs" style="white-space:normal">⚠️ <b>מחיקה ואיפוס – מוכנים אך נעולים.</b> הפעולות קיימות בשרת ודורשות: הרשאת מנהל ראשי, פתיחה מפורשת של מתג
        <code>allow_destructive</code> במסד הנתונים (כרגע: <b>${ctl.allow_destructive ? "פתוח" : "סגור"}</b>), הקלדת משפט אישור מדויק, וגיבוי אוטומטי לפני כל מחיקה
        (עותק מלא נשמר ב-<code>nr_deleted_archive</code> או בסכמת גיבוי). בשלב הזה לא מוחקים נתונים.</div>
        <div class="row"><button class="btn btn-sm" data-nr="delete" ${ctl.allow_destructive && selCount && !ST.selectAllMatching ? "" : "disabled"}>🗑️ מחק עסקים נבחרים</button>
        <button class="btn btn-sm" data-nr="reset" ${ctl.allow_destructive ? "" : "disabled"}>♻️ איפוס המאגר הארצי</button></div></div>` : ""}
    </div>`;

    const rows = (r && r.rows) || [];
    const allOnPage = rows.length && rows.every((b) => ST.selected.has(b.id));
    const table = `<div class="card">
      ${ST.browseError ? `<div class="card-b"><div class="badge b-bad" style="white-space:normal">${esc(ST.browseError)}</div></div>` : ""}
      <div class="tbl-wrap"><table><thead><tr>
        <th style="width:32px"><input type="checkbox" data-nr="selpage" ${allOnPage ? "checked" : ""} ${ST.selectAllMatching ? "disabled" : ""}></th>
        <th>עסק</th><th>ח.פ.</th><th>עיר / אזור</th><th>תחום עיסוק</th><th>טלפון</th><th>אימייל / אתר</th><th>עובדים</th><th>מקורות</th></tr></thead>
        <tbody>${rows.map((b) => `<tr data-nr="biz" data-v="${b.id}">
          <td data-nr-stop="1"><input type="checkbox" data-nr="selrow" data-v="${b.id}" ${ST.selectAllMatching || ST.selected.has(b.id) ? "checked" : ""} ${ST.selectAllMatching ? "disabled" : ""}></td>
          <td><div class="co-name">${esc(b.name)}</div><div class="xs muted">${esc(BIZ_STATUS[b.status] || "")}${b.corp_type ? " · " + esc(b.corp_type) : ""}${b.founded_year ? " · הוקם " + b.founded_year : ""}
            ${(b.marks || []).map((m) => MARKS[m] ? ` <span class="badge ${MARKS[m][1]}">${MARKS[m][0]}</span>` : "").join("")}${b.has_conflict ? ` <span class="badge b-est" title="יש סתירה מתועדת בין מקורות">סתירה</span>` : ""}</div></td>
          <td class="num">${esc(b.reg_id || "—")}</td>
          <td>${esc(b.city || "—")}<div class="xs muted">${esc(b.district || "")}</div></td>
          <td class="xs" style="max-width:220px;white-space:normal">${esc(b.main_activity || b.sector || "—")}</td>
          <td class="num" dir="ltr">${esc(b.phone_main || (b.branch_phones ? "סניפים: " + b.branch_phones : "—"))}${b.has_verified_phone ? ' <span class="badge b-ok" title="אותו מספר מ-2 מקורות עצמאיים">✓</span>' : ""}</td>
          <td class="xs" dir="ltr">${esc(b.email_main || "")}${b.website ? `<div><a href="${esc(b.website)}" target="_blank" rel="noopener" data-nr-stop="1">אתר</a>${Object.keys(b.socials || {}).filter((k) => k !== "contact_form").map((k) => ` <a href="${esc(b.socials[k])}" target="_blank" rel="noopener" data-nr-stop="1">${esc(k)}</a>`).join("")}</div>` : Object.keys(b.socials || {}).length ? Object.keys(b.socials).map((k) => `<a href="${esc(b.socials[k])}" target="_blank" rel="noopener" data-nr-stop="1">${esc(k)}</a>`).join(" ") : (b.email_main ? "" : "—")}</td>
          <td class="num">${b.employees_count ? n(b.employees_count) + '<div class="xs muted">פורסם</div>' : '<span class="xs muted">לא ידוע</span>'}</td>
          <td class="num">${n(b.source_count)}${b.has_people ? '<div class="xs muted">👤 איש קשר</div>' : ""}${b.fleet_known ? '<div class="xs">🚌 צי</div>' : ""}</td></tr>`).join("") || `<tr><td colspan="9" class="muted">${ST.browsing ? "⏳ מחפש…" : "לא נמצאו עסקים בתנאים האלה"}</td></tr>`}</tbody></table></div>
      <div class="card-b row" style="justify-content:center;gap:8px">
        <button class="btn btn-sm" data-nr="page" data-v="1" ${ST.page <= 1 ? "disabled" : ""}>« ראשון</button>
        <button class="btn btn-sm" data-nr="page" data-v="${ST.page - 1}" ${ST.page <= 1 ? "disabled" : ""}>‹ הקודם</button>
        <span class="xs">עמוד <b class="num">${n(ST.page)}</b> מתוך <span class="num">${n(pages)}</span></span>
        <button class="btn btn-sm" data-nr="page" data-v="${ST.page + 1}" ${ST.page >= pages ? "disabled" : ""}>הבא ›</button>
        <button class="btn btn-sm" data-nr="page" data-v="${pages}" ${ST.page >= pages ? "disabled" : ""}>אחרון »</button>
      </div></div>`;
    return filters + actions + table;
  }

  // ── collection (existing dashboard) ──
  function collectionView() {
    const s = ST.stats;
    const ctl = (s && s.control) || {};
    const cur = ST.sources.find((x) => x.key === ctl.current_source);
    const head = `<div class="card"><div class="card-h"><h2>איסוף נתונים לשרת<span class="h-bar"></span></h2><span class="spacer"></span>
        ${ctl.running ? `<span class="badge b-blue">● האיסוף פועל בשרת</span>` : `<span class="badge b-no">⏸ האיסוף עצור</span>`}
        <button class="btn btn-sm btn-primary" data-nr="start" ${ctl.running || ST.busy ? "disabled" : ""}>▶ המשך איסוף</button>
        <button class="btn btn-sm" data-nr="stop" ${!ctl.running || ST.busy ? "disabled" : ""}>⏸ עצור</button>
        <button class="btn btn-sm" data-nr="refresh">${ST.loading ? "⏳" : "🔄"} רענן סטטוס</button></div>
      <div class="card-b xs muted" style="display:grid;gap:4px">
        <div>האיסוף רץ בשרת (pg_cron כל 2 דקות, רק כשיש עבודה) ושומר נקודת התקדמות אחרי כל מנה – ממשיך גם כשהמחשב כבוי.${s ? ` · עודכן ${when(s.generated_at)}` : ""}</div>
        <div>מקור נוכחי: <b>${cur ? esc(cur.name) : "—"}</b> · קצב בשעה האחרונה: <b class="num">${n(s && s.rate_last_hour)}</b> עסקים חדשים · אחסון: <b class="num">${n(s && s.registry_mb)} MB</b> (מסד הנתונים ${n(s && s.db_mb)} MB)</div>
        <div>נקודות בקרה: ${(ctl.checkpoints_done || []).map((c) => `<span class="chip num">${n(c)}</span>`).join(" ") || "—"}</div>
      </div></div>`;
    return head + sourcesCard() + eventsCard();
  }

  function sourcesCard() {
    const list = ST.sources.filter((x) => ST.srcFilter === "all" || x.status === ST.srcFilter);
    const counts = {};
    ST.sources.forEach((x) => { counts[x.status] = (counts[x.status] || 0) + 1; });
    const chips = [["all", "הכול", ST.sources.length], ...Object.keys(STATUS).map((k) => [k, STATUS[k][0], counts[k] || 0])]
      .filter(([k, , c]) => k === "all" || c)
      .map(([k, l, c]) => `<button class="btn btn-sm ${ST.srcFilter === k ? "btn-primary" : ""}" data-nr="srcfilter" data-v="${k}">${l} <span class="num">${n(c)}</span></button>`).join("");
    const rows = list.map((x) => {
      const prog = x.total_records ? Math.min(100, (x.cursor / x.total_records) * 100) : (x.status === "completed" ? 100 : 0);
      return `<tr data-nr="source" data-v="${esc(x.key)}">
        <td><div class="co-name">${esc(x.name)}</div><div class="xs muted">${esc(KIND[x.kind] || x.kind)}${x.catalog_id && /^\d+$/.test(x.catalog_id) ? ` · מקור #${esc(x.catalog_id)} בקטלוג` : ""}</div></td>
        <td>${badge(x.status)}${x.errors ? ` <span class="xs muted">(${x.errors} שגיאות)</span>` : ""}</td>
        <td class="num">${x.records_read ? n(x.records_read) : "—"}${x.total_records ? `<div class="bar" style="margin-top:4px;height:5px"><i style="width:${prog}%"></i></div>` : ""}</td>
        <td class="num">${x.businesses_new ? n(x.businesses_new) : "—"}</td>
        <td class="num">${x.businesses_enriched ? n(x.businesses_enriched) : "—"}</td>
        <td class="num">${x.details_added ? n(x.details_added) : "—"}</td>
        <td class="xs muted" style="max-width:340px;white-space:normal">${esc(x.last_error || reasonOf(x)).slice(0, 160)}</td>
      </tr>`;
    }).join("");
    return `<div class="card"><div class="card-h"><h2>מקורות המידע (${n(ST.sources.length)})<span class="h-bar"></span></h2><span class="spacer"></span><div class="row">${chips}</div></div>
      <div class="tbl-wrap"><table><thead><tr><th>מקור</th><th>סטטוס</th><th>רשומות שנקראו</th><th>עסקים חדשים</th><th>עסקים שהועשרו</th><th>פרטים שנוספו</th><th>הערה / מגבלה</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="muted">אין מקורות בסינון הזה</td></tr>`}</tbody></table></div></div>`;
  }

  function eventsCard() {
    const ev = (ST.stats && ST.stats.events) || [];
    const icon = { info: "ℹ️", warn: "⚠️", error: "⛔", checkpoint: "🏁" };
    return `<div class="card"><div class="card-h"><h2>יומן איסוף ותקלות<span class="h-bar"></span></h2></div>
      <div class="card-b" style="display:grid;gap:6px;max-height:320px;overflow:auto">
      ${ev.length ? ev.map((e) => `<div class="xs"><span class="muted num">${when(e.at)}</span> ${icon[e.level] || ""} ${esc(e.message)}</div>`).join("") : `<div class="muted xs">אין אירועים עדיין</div>`}
      </div></div>`;
  }

  // ── modal: source / business / group / confirm ──
  function modal() {
    const m = ST.modal;
    if (!m) return "";
    let body = `<div class="muted">⏳ טוען…</div>`;
    if (m.error) body = `<div class="badge b-bad" style="white-space:normal">${esc(m.error)}</div>`;
    else if (m.type === "group") body = groupPicker();
    else if (m.type === "confirm") body = confirmBox(m);
    else if (m.type === "export") body = `<div>${esc(m.msg || "")}</div>`;
    else if (m.data && m.type === "source") body = sourceDetail(m.data);
    else if (m.data && m.type === "biz") body = bizDetail(m.data);
    return `<div data-nr="close" style="position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:900;display:flex;align-items:flex-start;justify-content:center;padding:4vh 12px;overflow:auto">
      <div class="card" data-nr-stop="1" style="width:min(980px,100%);max-height:92vh;overflow:auto">
        <div class="card-h"><h2>${esc(m.title || "")}<span class="h-bar"></span></h2><span class="spacer"></span><button class="btn btn-sm" data-nr="close">✕ סגור</button></div>
        <div class="card-b" style="display:grid;gap:12px">${body}</div></div></div>`;
  }

  function groupPicker() {
    const gs = (ST.facets && ST.facets.groups) || [];
    return `<div class="xs muted">${ST.selectAllMatching ? `כל ${n(ST.result && ST.result.total)} התוצאות (עד 100,000)` : `${n(ST.selected.size)} עסקים נבחרים`} יתווספו לקבוצה.</div>
      ${gs.length ? `<div style="display:grid;gap:6px">${gs.map((g) => `<button class="btn btn-sm" data-nr="groupadd" data-v="${g.id}">➕ ${esc(g.name)} <span class="xs muted">(${n(g.n)})</span></button>`).join("")}</div>` : `<div class="xs muted">אין קבוצות עדיין.</div>`}
      <div class="row"><input class="input" id="nrNewGroup" placeholder="שם קבוצה חדשה" style="max-width:320px"><button class="btn btn-sm btn-primary" data-nr="groupnew">צור קבוצה והוסף</button></div>`;
  }
  function confirmBox(m) {
    return `<div class="badge b-bad" style="white-space:normal">${esc(m.warn)}</div>
      <div class="xs">כדי לאשר הקלד בדיוק: <b>${esc(m.phrase)}</b></div>
      <input class="input" id="nrConfirm" placeholder="${esc(m.phrase)}">
      <div class="row"><button class="btn btn-sm" data-nr="confirmrun">אשר והפעל</button><button class="btn btn-sm btn-primary" data-nr="close">ביטול</button></div>`;
  }

  function sourceDetail(d) {
    const s = d.source || {};
    const cp = d.contact_points || {};
    const lbl = { phone: "טלפונים", email: "אימיילים", website: "אתרים", social: "רשתות חברתיות", fax: "פקס", contact_form: "טפסי קשר", whatsapp: "WhatsApp" };
    return `<div class="row">${badge(s.status)} <span class="chip">${esc(KIND[s.kind] || s.kind)}</span> ${s.url ? `<a class="xs" href="${esc(s.url)}" target="_blank" rel="noopener">קישור למקור</a>` : ""}</div>
      ${reasonOf(s) ? `<div class="xs" style="white-space:normal"><b>הערה / מגבלה:</b> ${esc(reasonOf(s))}</div>` : ""}
      ${s.terms ? `<div class="xs muted">תנאי שימוש: ${esc(s.terms)}</div>` : ""}
      <div class="grid g-kpi tiles">
        ${kpi("רשומות שנקראו", n(s.records_read), s.total_records ? `מתוך ${n(s.total_records)} · נקודת התקדמות ${n(s.cursor)}` : "")}
        ${kpi("עסקים חדשים", n(s.businesses_new))}
        ${kpi("עסקים קיימים שהועשרו", n(s.businesses_enriched), `${n(s.businesses_merged)} רשומות מוזגו לעסק קיים`)}
        ${kpi("פרטי מידע שנוספו", n(s.details_added), `${n(d.people)} אנשי קשר · זמן ${dur(s.duration_ms)}`)}
      </div>
      <div class="xs"><b>פרטי קשר במאגר שמקורם כאן:</b> ${Object.keys(cp).length ? Object.entries(cp).map(([k, v]) => `<span class="chip">${lbl[k] || k}: <span class="num">${n(v)}</span></span>`).join(" ") : "—"}</div>
      <div class="xs"><b>אופן ההתאמה לעסקים:</b> ${Object.entries(d.by_match || {}).map(([k, v]) => `<span class="chip">${esc(MATCH[k] || k)}: <span class="num">${n(v)}</span></span>`).join(" ") || "—"}</div>
      ${(d.samples || []).length ? `<div><b>דוגמאות אחרונות עם ראיה:</b><div class="tbl-wrap"><table><thead><tr><th>עסק</th><th>ח.פ.</th><th>התאמה</th><th>רשומת מקור</th></tr></thead><tbody>
        ${d.samples.map((x) => `<tr data-nr="biz" data-v="${x.id}"><td>${esc(x.name)}</td><td class="num">${esc(x.reg_id || "—")}</td><td class="xs">${esc(MATCH[x.match_method] || x.match_method)}</td><td class="xs">${x.source_url ? `<a href="${esc(x.source_url)}" target="_blank" rel="noopener" data-nr-stop="1">פתח רשומה</a>` : "—"}</td></tr>`).join("")}
      </tbody></table></div></div>` : ""}`;
  }

  function bizDetail(d) {
    const b = d.business || {};
    const kindL = { phone: "טלפון", email: "אימייל", website: "אתר", social: "רשת חברתית", fax: "פקס", contact_form: "טופס קשר", whatsapp: "WhatsApp" };
    const subL = { main: "ראשי", mobile: "נייד", branch: "סניף / מסגרת", service: "שירות לקוחות", fax: "פקס" };
    const srcName = (k) => (ST.sources.find((x) => x.key === k) || {}).name || ((ST.facets && ST.facets.sources) || []).find((x) => x.v === k)?.name || k;
    const isUrl = (v) => /^https?:\/\//.test(v);
    const field = (l, v) => (v || v === 0) && String(v) !== "" ? `<div><span class="muted xs">${l}</span><div>${esc(v)}</div></div>` : "";
    const marks = (d.marks || []);
    return `<div class="row">${b.reg_id ? `<span class="chip">ח.פ. ${esc(b.reg_id)}</span>` : `<span class="chip">ללא מזהה רשמי</span>`}
        <span class="badge ${b.status === "active" ? "b-ok" : b.status === "inactive" ? "b-bad" : "b-no"}">${esc(BIZ_STATUS[b.status] || b.status || "")}</span>
        ${b.district ? `<span class="chip">${esc(b.district)}</span>` : ""}<span class="chip">${n((b.sources || []).length)} מקורות</span>
        ${b.has_conflict ? `<span class="badge b-est">יש סתירה מתועדת בין מקורות</span>` : ""}
        <span class="spacer"></span>
        ${Object.entries(MARKS).map(([k, [l]]) => `<button class="btn btn-sm" data-nr="markone" data-v="${k}" data-id="${b.id}">${l}</button>`).join("")}</div>
      <div class="grid g-3" style="gap:10px">
        ${field("סוג התאגדות", b.corp_type)}${field("סטטוס כפי שפורסם", b.status_raw)}${field("שנת הקמה", b.founded_year)}
        ${field("ענף", b.sector)}${field("תחום עיסוק ראשי", b.main_activity)}${field("תחומי עיסוק נוספים", (b.activities || []).join(" · "))}
        ${field("כתובת", [b.address, b.city, b.zip].filter(Boolean).join(", "))}${field("אזור", b.district || b.region)}
        ${field("שם באנגלית", b.name_en)}${field("שמות נוספים", (b.names_alt || []).join(" · "))}
      </div>
      <div class="xs">${b.employees_count ? `<b>מספר עובדים: ${n(b.employees_count)}</b> – מספר שפורסם במקור (ראו ראיות)` : b.employees_estimate ? `מספר עובדים משוער: ${n(b.employees_estimate)} (הערכה – לא נתון מאומת)` : `מספר עובדים: <span class="muted">לא ידוע</span>`}</div>
      ${b.fleet_known ? `<div class="badge b-ok" style="white-space:normal">צי רכב: ${b.fleet_vehicles ? n(b.fleet_vehicles) + " רכבים לפי רשומת מקור" : "קיים"}${(b.fleet_types || []).length ? " · " + esc(b.fleet_types.join(", ")) : ""}</div>` : `<div class="xs muted">צי רכב: לא ידוע (אין רשומת מקור)</div>`}
      ${(b.logistics_indicators || []).length ? `<div class="xs">אינדיקציה (לא עובדה) לפעילות שטח/לוגיסטיקה: ${esc(b.logistics_indicators.join(" · "))}</div>` : ""}
      ${b.description ? `<div class="xs" style="white-space:normal"><span class="muted">תיאור:</span> ${esc(b.description)}</div>` : ""}
      <div><b>פרטי קשר (${n((d.contacts || []).length)})</b><div class="tbl-wrap"><table><thead><tr><th>סוג</th><th>ערך</th><th>סניף</th><th>מקורות</th><th>נמצא לראשונה</th><th>אימות</th></tr></thead><tbody>
        ${(d.contacts || []).map((c) => `<tr><td class="xs">${kindL[c.kind] || c.kind}${c.subkind && c.subkind !== c.kind ? ` · ${esc(subL[c.subkind] || c.subkind)}` : ""}</td>
          <td dir="ltr" class="xs">${isUrl(c.display || c.value) ? `<a href="${esc(c.display || c.value)}" target="_blank" rel="noopener">${esc(c.display || c.value)}</a>` : esc(c.display || c.value)}</td>
          <td class="xs">${esc([c.branch_name, c.branch_address].filter(Boolean).join(" – ") || "—")}</td>
          <td class="xs">${(c.sources || []).map((k) => esc(srcName(k))).join("<br>")}</td>
          <td class="xs">${day(c.first_seen_at)}</td>
          <td>${c.verified ? `<span class="badge b-ok">מאומת (2+ מקורות)</span>` : `<span class="badge b-no">לא מאומת</span>`}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">לא נמצאו פרטי קשר</td></tr>`}
      </tbody></table></div></div>
      ${(d.people || []).length ? `<div><b>אנשי קשר עסקיים (${n(d.people.length)})</b><div class="tbl-wrap"><table><thead><tr><th>שם</th><th>תפקיד</th><th>מקור</th><th>מועד</th></tr></thead><tbody>
        ${d.people.map((p) => `<tr><td>${esc(p.full_name)}</td><td class="xs">${esc(p.role)}</td><td class="xs">${p.source_url ? `<a href="${esc(p.source_url)}" target="_blank" rel="noopener">${esc(srcName(p.source_key))}</a>` : esc(srcName(p.source_key))}</td><td class="xs">${day(p.collected_at)}</td></tr>`).join("")}
      </tbody></table></div></div>` : ""}
      <div><b>ראיות – מאיפה הגיע כל פרט (${n((d.evidence || []).length)})</b><div class="tbl-wrap"><table><thead><tr><th>מקור</th><th>אופן התאמה</th><th>מה התקבל</th><th>מועד בדיקה</th><th>קישור</th></tr></thead><tbody>
        ${(d.evidence || []).map((e) => `<tr><td class="xs">${esc(e.source_name || e.source_key)}</td><td class="xs">${esc(MATCH[e.match_method] || e.match_method)}${e.entry_mode === "manual" ? " · ידני" : " · אוטומטי"}${e.conflicts ? `<div class="badge b-est" style="white-space:normal">סתירה: ${esc(JSON.stringify(e.conflicts))}</div>` : ""}</td>
          <td class="xs" dir="auto" style="max-width:300px;white-space:normal">${esc(Object.entries(e.fields || {}).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v === true ? "✓" : v}`).join(" · "))}</td>
          <td class="xs">${when(e.collected_at)}</td><td class="xs">${e.source_url ? `<a href="${esc(e.source_url)}" target="_blank" rel="noopener">פתח</a>` : "—"}</td></tr>`).join("")}
      </tbody></table></div></div>`;
  }

  // ── actions ──
  async function openSource(key) {
    const s = ST.sources.find((x) => x.key === key);
    ST.modal = { type: "source", title: s ? s.name : key }; rerender();
    try { ST.modal.data = await rpc("nr_source_detail", { p_key: key }); } catch (e) { ST.modal.error = e.message; }
    rerender();
  }
  async function openBiz(id) {
    ST.modal = { type: "biz", title: "טוען עסק…", id: Number(id) }; rerender();
    try {
      const d = await rpc("nr_business_detail", { p_id: Number(id) });
      const row = ((ST.result && ST.result.rows) || []).find((r) => r.id === Number(id));
      d.marks = (row && row.marks) || [];
      ST.modal.data = d; ST.modal.title = (d.business || {}).name || "עסק";
    } catch (e) { ST.modal.error = e.message; }
    rerender();
  }
  function selectionArgs() {
    return ST.selectAllMatching ? { p_ids: null, p_filters: cleanFilters() } : { p_ids: [...ST.selected], p_filters: null };
  }
  async function setMark(mark, ids) {
    try {
      const args = ids ? { p_ids: ids, p_filters: null } : selectionArgs();
      const res = await rpc("nr_mark", { ...args, p_mark: mark, p_on: true, p_note: null });
      toast(`סומנו ${n(res.affected)} עסקים: ${MARKS[mark][0]}`);
      browse(); loadStats(true);
    } catch (e) { toast(e.message); }
  }
  async function addToGroup(groupId) {
    try {
      const a = selectionArgs();
      const res = await rpc("nr_group_add", { p_group: Number(groupId), p_ids: a.p_ids, p_filters: a.p_filters, p_remove: false });
      toast(`נוספו ${n(res.affected)} עסקים לקבוצה`);
      ST.modal = null; await loadFacets(); browse();
    } catch (e) { toast(e.message); }
  }
  async function exportCsv() {
    const filters = ST.selectAllMatching || !ST.selected.size ? cleanFilters() : { ids: [...ST.selected] };
    const cap = 100000;
    ST.modal = { type: "export", title: "ייצוא לקובץ CSV", msg: "⏳ מכין קובץ…" }; rerender();
    try {
      const cols = [["name", "שם"], ["reg_id", "ח.פ."], ["status", "סטטוס"], ["corp_type", "סוג התאגדות"], ["founded_year", "שנת הקמה"], ["main_activity", "תחום עיסוק"], ["sector", "ענף"],
        ["city", "עיר"], ["district", "אזור"], ["address", "כתובת"], ["zip", "מיקוד"], ["phones", "טלפונים"], ["emails", "אימיילים"], ["website", "אתר"], ["socials", "רשתות חברתיות"],
        ["people", "אנשי קשר"], ["employees_count", "עובדים (פורסם)"], ["fleet_vehicles", "רכבים (תועד)"], ["source_count", "מספר מקורות"], ["source_names", "מקורות"]];
      const q = (v) => { const s = v == null ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const lines = [cols.map((c) => c[1]).join(",")];
      let after = 0, got = 0;
      for (;;) {
        const rows = await rpc("nr_export_page", { p_filters: filters, p_after: after, p_limit: 5000 });
        for (const r of rows) lines.push(cols.map(([k]) => q(r[k])).join(","));
        got += rows.length;
        ST.modal.msg = `⏳ הוכנו ${n(got)} שורות…`; rerender();
        if (rows.length < 5000 || got >= cap) break;
        after = rows[rows.length - 1].id;
      }
      const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `national-registry-${new Date().toISOString().slice(0, 10)}-${got}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      ST.modal.msg = `✅ יוצאו ${n(got)} עסקים לקובץ CSV (נפתח באקסל עם עברית תקינה)${got >= cap ? " – הגבלה של 100,000 שורות לייצוא" : ""}.`;
    } catch (e) { ST.modal.msg = "⛔ " + e.message; }
    rerender();
  }
  async function setRunning(on) {
    ST.busy = true; rerender();
    try { await rpc("nr_set_running", { p_running: on }); toast(on ? "האיסוף הופעל – השרת ימשיך מנקודת ההתקדמות האחרונה" : "האיסוף נעצר אחרי המנה הנוכחית"); }
    catch (e) { toast(e.message); }
    ST.busy = false; await loadStats(true);
  }
  async function runConfirm() {
    const m = ST.modal; const typed = (document.getElementById("nrConfirm") || {}).value || "";
    if (typed !== m.phrase) { toast("משפט האישור אינו תואם – לא בוצעה פעולה"); return; }
    try {
      const res = m.action === "delete" ? await rpc("nr_delete_businesses", { p_ids: [...ST.selected], p_confirm: typed, p_reason: "מחיקה ידנית מהמסך" })
        : await rpc("nr_reset_registry", { p_confirm: typed });
      toast(m.action === "delete" ? `נמחקו ${res.deleted} (עותק נשמר בארכיון)` : `המאגר אופס – גיבוי: ${res.backup_schema}`);
      ST.modal = null; ST.selected.clear(); browse(); loadStats(true);
    } catch (e) { toast(e.message); }
  }

  function readFilterInput(el) {
    if (el.dataset.nrF) ST.filters[el.dataset.nrF] = el.value.trim();
    else if (el.dataset.nrFb) ST.filters[el.dataset.nrFb] = el.checked;
    else if (el.dataset.nrFm) {
      const key = el.dataset.nrFm, v = el.dataset.v; const a = new Set(ST.filters[key] || []);
      el.checked ? a.add(v) : a.delete(v); ST.filters[key] = [...a];
    }
  }
  function applyFilters() {
    document.querySelectorAll("[data-nr-f],[data-nr-fb],[data-nr-fm]").forEach(readFilterInput);
    ST.page = 1; ST.selected.clear(); ST.selectAllMatching = false; persist(); browse();
  }

  document.addEventListener("change", (e) => {
    if (!(S.view === "prospector" && S.tab === TAB)) return;
    const el = e.target;
    if (el.matches("[data-nr-fb],[data-nr-fm]") || el.matches("select[data-nr-f]")) { readFilterInput(el); applyFilters(); return; }
    if (el.matches("[data-nr-f]")) { readFilterInput(el); persist(); return; }
    const act = el.getAttribute("data-nr");
    if (act === "sort") { ST.sort = el.value; ST.page = 1; persist(); browse(); }
    else if (act === "pagesize") { ST.pageSize = Number(el.value); ST.page = 1; persist(); browse(); }
    else if (act === "selrow") { const id = Number(el.dataset.v); el.checked ? ST.selected.add(id) : ST.selected.delete(id); rerender(); }
    else if (act === "selpage") { ((ST.result && ST.result.rows) || []).forEach((r) => el.checked ? ST.selected.add(r.id) : ST.selected.delete(r.id)); rerender(); }
  }, true);
  document.addEventListener("toggle", (e) => {
    const g = e.target && e.target.getAttribute && e.target.getAttribute("data-nr-group");
    if (g) { ST.openGroups = ST.openGroups || {}; ST.openGroups[g] = e.target.open; }
  }, true);

  document.addEventListener("click", (e) => {
    if (!(S.view === "prospector" && S.tab === TAB)) return;
    if (e.target.matches("input[type=checkbox],select,input,option,summary") || e.target.closest("summary")) return;
    const stop = e.target.closest("[data-nr-stop]");
    const el = e.target.closest("[data-nr],[data-nr-filter]");
    if (!el) return;
    if (stop && el.getAttribute("data-nr") === "close" && !el.matches("button")) return;
    if (e.target.closest("a[href]")) return;
    e.preventDefault(); e.stopPropagation();
    if (el.hasAttribute("data-nr-filter")) {
      const k = el.getAttribute("data-nr-filter");
      ST.sub = "browse";
      if (k === "employees") ST.filters.emp_bands = BANDS.filter((b) => b !== "unknown"); else ST.filters[k] = "yes";
      ST.page = 1; persist(); browse(); return;
    }
    const act = el.getAttribute("data-nr"), v = el.getAttribute("data-v");
    if (act === "sub") { ST.sub = v; persist(); rerender(); if (v === "browse" && !ST.result) browse(); }
    else if (act === "apply") applyFilters();
    else if (act === "clear") { ST.filters = { hide_archived: true }; ST.page = 1; ST.selected.clear(); ST.selectAllMatching = false; persist(); browse(); }
    else if (act === "page") { ST.page = Math.max(1, Number(v)); browse(); window.scrollTo(0, 0); }
    else if (act === "selall") { ST.selectAllMatching = true; rerender(); }
    else if (act === "selnone") { ST.selectAllMatching = false; ST.selected.clear(); rerender(); }
    else if (act === "markset") setMark(v);
    else if (act === "markone") setMark(v, [Number(el.dataset.id)]);
    else if (act === "togroup") { ST.modal = { type: "group", title: "הוספה לקבוצת עבודה" }; rerender(); }
    else if (act === "groupadd") addToGroup(v);
    else if (act === "groupnew") {
      const name = ((document.getElementById("nrNewGroup") || {}).value || "").trim();
      if (!name) { toast("יש להזין שם לקבוצה"); return; }
      rpc("nr_group_create", { p_name: name }).then((id) => addToGroup(id)).catch((er) => toast(er.message));
    }
    else if (act === "export") exportCsv();
    else if (act === "advanced") { ST.showAdvanced = !ST.showAdvanced; rerender(); }
    else if (act === "delete") { ST.modal = { type: "confirm", title: "מחיקת עסקים", action: "delete", phrase: `מחק ${ST.selected.size} עסקים`, warn: "מחיקה מסירה את העסקים מהמאגר. עותק מלא נשמר בארכיון המחיקות לפני המחיקה." }; rerender(); }
    else if (act === "reset") { ST.modal = { type: "confirm", title: "איפוס המאגר הארצי", action: "reset", phrase: "אני מאשר איפוס מלא של המאגר הארצי", warn: "איפוס מרוקן את כל המאגר הארצי. לפני כן נוצרת סכמת גיבוי מלאה במסד הנתונים." }; rerender(); }
    else if (act === "confirmrun") runConfirm();
    else if (act === "start") setRunning(true);
    else if (act === "stop") setRunning(false);
    else if (act === "refresh") loadStats(true);
    else if (act === "srcfilter") { ST.srcFilter = v; rerender(); }
    else if (act === "source") openSource(v);
    else if (act === "biz") openBiz(v);
    else if (act === "close") { ST.modal = null; rerender(); }
  }, true);
  document.addEventListener("keydown", (e) => {
    if (!(S.view === "prospector" && S.tab === TAB)) return;
    if (e.key === "Enter" && e.target && e.target.matches && e.target.matches("[data-nr-f]")) { e.preventDefault(); applyFilters(); }
    if (e.key === "Escape" && ST.modal) { ST.modal = null; rerender(); }
  });

  if (typeof renderTabs === "function" && S.view === "prospector") renderTabs();
})();
