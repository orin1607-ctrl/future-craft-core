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
    // enrichment report + review queue
    report: null, reportError: "", reportLoading: false, review: null, reviewPage: 0,
    modal: null, timer: null, busy: false,
    // marketing work lists (read only – nothing is sent from this screen)
    out: { filters: { fleet: "any", sort: "fleet" }, rows: null, afters: [0], page: 0, loading: false, error: "", summary: null, sumLoading: false },
    pendingBiz: Number(new URLSearchParams(location.search).get("biz")) || 0,
    // industry classification: taxonomy + counts per industry (cached on the server)
    ind: null,
    // Dalia leads streamed from the registry into prospect_leads (the 7 rules run only there)
    leads: { f: {}, data: null, stats: null, page: 0, loading: false, err: "" },
    // Marketing Center link: registry businesses already transferred (by id) → their outreach status
    mk: {},
    // engine control panel + open alerts (banner on every registry screen)
    ctl: null, ctlLoading: false, ctlErr: "", alerts: [], alertsAt: 0,
  };
  const persist = () => { try { localStorage.setItem(LS_KEY, JSON.stringify({ sub: ST.sub, filters: ST.filters, sort: ST.sort, pageSize: ST.pageSize })); } catch (e) { /* storage blocked */ } };

  const STATUS = {
    pending: ["ממתין", "b-no"], collecting: ["אוסף", "b-blue"], completed: ["הושלם", "b-ok"], partial: ["חלקי", "b-est"],
    blocked: ["חסום", "b-bad"], unsupported: ["לא נתמך", "b-no"], error: ["שגיאה", "b-bad"],
  };
  const KIND = { ckan: "API מידע פתוח (CKAN)", arcgis: "GIS עירוני (ArcGIS)", overpass: "OpenStreetMap", fleet_ckan: "צי רכב (API)", website: "אתרי עסקים", alias: "כפול למקור אחר", discovery: "גילוי מקורות", discovered: "התגלה – טרם מופה", manual: "ידני", paid: "בתשלום / מנוי", blocked: "חסום",
    enrich_jobs_gov: "משרות – אתר ממשלתי", enrich_gov_contracts: "העשרה – API מידע פתוח", enrich_web_discovery: "גילוי אתר מדומיין האימייל", enrich_web_deep: "סריקת אתר החברה", enrich_rss: "כותרות RSS" };
  const MATCH = { evidence_record: "רשומת מקור שכבר מקושרת לעסק", registered_name: "שם רשום מלא וייחודי", manual_review: "אושר ידנית", existing_business: "עסק קיים", created: "נוצר מרשומה זו", reg_id: "התאמה לפי ח.פ./מזהה רשמי", "name+city": "שם זהה + אותה עיר", name_unique: "שם זהה ויחיד במאגר", business_website: "אתר העסק עצמו" };
  const BIZ_STATUS = { active: "פעילה", inactive: "לא פעילה", unknown: "לא ידוע" };
  const ROLES = { ceo: "מנכ\"ל", owner: "בעלים", manager: "מנהל/ממונה", operations: "תפעול/לוגיסטיקה", fleet: "קצין רכב / צי", professional: "מנהל מקצועי", other: "תפקיד אחר" };
  const MARKS = { review: ["לבדיקה", "b-est"], irrelevant: ["לא רלוונטי", "b-no"], archived: ["בארכיון", "b-bad"] };
  const BANDS = ["1-5", "6-10", "11-50", "51-100", "101-500", "500+", "unknown"];
  // ── enrichment: what was found, how important, how sure ──
  const FCAT = {
    hiring: "גיוס עובדים", hiring_drivers: "גיוס נהגים", hiring_logistics: "גיוס לוגיסטיקה / תפעול", hiring_operations: "גיוס מנהלי תפעול",
    new_phone: "טלפון חדש", new_email: "אימייל חדש", new_website: "אתר חדש", new_social: "רשת חברתית / קישור חדש",
    person: "איש קשר עסקי", ceo: "מנכ\"ל", operations_manager: "מנהל תפעול / צי", expansion: "התרחבות", branch_opened: "פתיחת סניף / מרכז",
    tender_won: "זכייה במכרז", gov_contract: "התקשרות ממשלתית", fleet: "צי רכב", employees: "מספר עובדים (לפי החברה)", news: "חדשות עסקיות",
  };
  if (!document.getElementById("nrEnrichCss")) {
    const st = document.createElement("style");
    st.id = "nrEnrichCss";
    st.textContent = `.nr-imp{background:#ea580c;color:#fff;font-weight:700}
      .nr-find{border-inline-start:4px solid var(--blue);padding:6px 10px;border-radius:6px;background:var(--blue-100);display:grid;gap:3px}
      .nr-find.imp{border-color:#ea580c;background:var(--est-bg)} .nr-find.ver{border-color:var(--ok);background:var(--ok-bg)}
      .nr-find.pend{border-color:var(--no);background:var(--no-bg)} .nr-find .t{white-space:normal;font-size:13px}
      .nr-ic{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 4px;margin:1px;border-radius:6px;font-size:11px;font-weight:700;text-decoration:none;background:var(--no-bg);color:var(--text,inherit)}
      .nr-ic-facebook{background:#1877f2;color:#fff}.nr-ic-instagram{background:#c13584;color:#fff}.nr-ic-linkedin{background:#0a66c2;color:#fff}
      .nr-ic-tiktok{background:#111;color:#fff}.nr-ic-youtube{background:#ff0000;color:#fff}.nr-ic-twitter{background:#000;color:#fff}.nr-ic-whatsapp{background:#25d366;color:#fff}
      .nr-hl{display:flex;flex-wrap:wrap;gap:4px;align-items:baseline;margin-top:3px;font-size:12px;white-space:normal;min-width:240px;max-width:460px}`;
    document.head.appendChild(st);
  }
  // colour + words: never colour alone
  function fmark(f, pending) {
    if (pending) return `<span class="badge b-no">⏳ ממתין לבדיקת שיוך</span>`;
    const chips = [];
    if (f.importance === "important") chips.push(`<span class="badge nr-imp">★ מידע חשוב חדש</span>`);
    else chips.push(`<span class="badge b-blue">● מידע חדש</span>`);
    chips.push(f.verification === "verified" ? `<span class="badge b-ok">✓ מאומת (2 מקורות)</span>` : `<span class="badge b-no">לא מאומת</span>`);
    if (f.fact_kind === "indication") chips.push(`<span class="badge b-no" title="סימן לצורך אפשרי – לא עובדה מתועדת">אינדיקציה</span>`);
    return chips.join(" ");
  }
  const fclass = (f, pending) => pending ? "pend" : f.importance === "important" ? "imp" : f.verification === "verified" ? "ver" : "";
  // clickable icons for the company's own site and its social / WhatsApp pages
  const NETS = [["website", "🌐", "אתר החברה"], ["facebook", "f", "פייסבוק"], ["instagram", "IG", "אינסטגרם"], ["linkedin", "in", "לינקדאין"],
    ["tiktok", "♪", "טיקטוק"], ["youtube", "▶", "יוטיוב"], ["twitter", "X", "X / טוויטר"], ["whatsapp", "WA", "וואטסאפ עסקי"]];
  function linkIcons(b) {
    const so = b.socials || {};
    const url = (k) => k === "website" ? b.website : k === "whatsapp" ? (so.whatsapp || b.whatsapp) : so[k];
    const a = NETS.filter(([k]) => url(k)).map(([k, ic, l]) => `<a href="${esc(url(k))}" target="_blank" rel="noopener" data-nr-stop="1" title="${l}" class="nr-ic nr-ic-${k}">${ic}</a>`).join("");
    return a || '<span class="xs muted">—</span>';
  }
  const legend = () => `<div class="row xs" style="gap:6px;flex-wrap:wrap"><span class="muted">מקרא:</span>
    <span class="badge nr-imp">★ מידע חשוב חדש</span><span class="badge b-blue">● מידע חדש</span><span class="badge b-ok">✓ מאומת (2 מקורות)</span>
    <span class="badge b-no">לא מאומת / אינדיקציה / ממתין לבדיקה</span></div>`;
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
  // ── Marketing Center (מרכז השיווק) link ──
  // Selected businesses are transferred to the Marketing Center outreach list through the marketing-hub function
  // (shared owner sign-in, window.Hub). Nothing is sent to anyone from here; existing outreach data is never overwritten.
  const MK_ST = { new: "חדש", ready: "מוכן לפנייה", sent: "נשלח", awaiting_reply: "ממתין לתגובה", interested: "התעניין", not_interested: "לא מעוניין", customer: "לקוח" };
  const MK_URL = "./outreach.html";
  function mkReady() { return !!(window.Hub && Hub.key); }
  // An expired / disconnected sign-in drops back to the sign-in field instead of a dead-end error.
  if (window.Hub) Hub.onAuthFail = () => {
    Hub.clearKey();
    if (ST.modal && ST.modal.type === "mk") { ST.modal.error = ""; ST.modal.authErr = "החיבור למרכז השיווק בדפדפן הזה פג. התחברו מחדש עם קוד מ\"📱 חיבור טלפון\" או עם מפתח הגישה."; rerender(); }
  };
  function markStatus(ids) {
    if (!mkReady() || !ids || !ids.length) return;
    Hub.hub("prospector/status", { ids }).then((d) => {
      ids.forEach((id) => { ST.mk[id] = (d.map || {})[String(id)] || null; });
      rerender();
    }).catch(() => {});
  }
  function mkBadge(id) {
    const s = ST.mk[id];
    if (!s || !s.length) return "";
    const x = s[0];
    return ` <a class="badge ${x.dnc ? "b-bad" : x.status === "customer" ? "b-ok" : "b-blue"}" href="${MK_URL}" target="_blank" rel="noopener" data-nr-stop="1" title="כבר במרכז השיווק – פניות ללקוחות עסקיים">📣 ${x.dnc ? "פניות עצורות" : "במרכז השיווק · " + esc(MK_ST[x.status] || x.status)}</a>`;
  }
  async function mkIds(m) {
    if (m.ids) return m.ids;
    if (!ST.selectAllMatching) return [...ST.selected];
    const out = [];
    let after = 0;
    while (out.length < 500) {
      const rows = await rpc("nr_export_page", { p_filters: cleanFilters(), p_after: after, p_limit: 500 });
      rows.forEach((r) => { if (out.length < 500) out.push(r.id); });
      if (rows.length < 500) break;
      after = rows[rows.length - 1].id;
    }
    return out;
  }
  function mkBody(m) {
    if (!window.Hub) return `<div class="badge b-bad">מודול מרכז השיווק לא נטען. רעננו את העמוד.</div>`;
    if (!mkReady()) return `<div class="xs" style="white-space:normal">כדי להעביר עסקים צריך להתחבר פעם אחת למרכז השיווק בדפדפן הזה.
        הזינו את הקוד בן 6 הספרות ממסך "📱 חיבור טלפון" במרכז השיווק, או את מפתח הגישה.</div>
      <div class="row"><input class="input" id="nrMkKey" autocomplete="one-time-code" placeholder="קוד בן 6 ספרות / מפתח גישה" style="max-width:280px;direction:ltr">
        <button class="btn btn-sm btn-primary" data-nr="mkauth">התחברות</button></div>
      ${m.authErr ? `<div class="badge b-bad" style="white-space:normal">${esc(m.authErr)}</div>` : ""}`;
    if (m.result) {
      const r = m.result;
      return `<div class="badge b-ok" style="white-space:normal;font-size:14px">✅ הועברו ${n(r.imported)} עסקים חדשים למרכז השיווק${r.merged.length ? ` · ${n(r.merged.length)} כבר היו שם (הנתונים שלהם נשמרו, רק שדות ריקים הושלמו)` : ""}${r.skipped.length ? ` · ${n(r.skipped.length)} דולגו` : ""}</div>
        ${r.skipped.length ? `<div class="xs" style="white-space:normal">דולגו: ${r.skipped.slice(0, 20).map((x) => esc(x.name) + " – " + esc(x.why)).join(" · ")}</div>` : ""}
        <div class="xs muted" style="white-space:normal">שום הודעה לא נשלחה. במרכז השיווק אפשר להכין פניות, לנהל תור עבודה ולעקוב אחרי כל חברה.</div>
        <div class="row"><a class="btn btn-sm btn-primary" href="${MK_URL}" target="_blank" rel="noopener">📣 פתיחת "פניות ללקוחות עסקיים"</a><button class="btn btn-sm" data-nr="close">סגור</button></div>`;
    }
    const bizs = m.businesses || [];
    const count = m.ids ? n(m.ids.length) : ST.selectAllMatching ? "כל התוצאות (עד 500 הראשונות)" : n(ST.selected.size);
    return `<div class="xs" style="white-space:normal"><b>${count}</b> עסקים יועברו לרשימת "פניות ללקוחות עסקיים" במרכז השיווק,
        כולל טלפון (המאומת ביותר), וואטסאפ, אימייל, פייסבוק, אינסטגרם, אתר, עיר, תחום, איש קשר רלוונטי (קצין רכב / תפעול / הנהלה) ומידע על צי הרכב, עם קישור חזרה לכרטיס כאן.</div>
      <div class="xs muted" style="white-space:normal">עסק שכבר קיים במרכז השיווק לא ייווצר פעמיים, והנתונים שכבר הוזנו לו לא יידרסו – רק שדות ריקים יושלמו. שום הודעה לא נשלחת בשלב הזה.</div>
      <div class="row"><label class="xs">לאיזה עסק שלנו? <select class="input" id="nrMkBiz" style="width:auto">${bizs.map((b) => `<option value="${esc(b.id)}" ${b.id === (m.biz || Hub.biz) ? "selected" : ""}>${esc(b.name)}</option>`).join("") || '<option value="dalia">דליה</option>'}</select></label>
        <button class="btn btn-sm btn-primary" data-nr="mkgo" ${m.busy ? "disabled" : ""}>${m.busy ? "⏳ " + esc(m.progress || "מעביר…") : "📣 העברה למרכז השיווק"}</button></div>
      ${m.error ? `<div class="badge b-bad" style="white-space:normal">${esc(m.error)}</div>` : ""}`;
  }
  async function openMk(ids) {
    ST.modal = { type: "mk", title: "העברה למרכז השיווק", ids: ids || null };
    rerender();
    if (mkReady()) { try { ST.modal.businesses = await Hub.businesses(); } catch (e) { if (mkReady()) ST.modal.error = e.message; } rerender(); }
  }
  async function mkAuth() {
    const m = ST.modal, el = document.getElementById("nrMkKey"), raw = el ? el.value : "";
    const digits = String(raw).replace(/\s/g, "");
    m.authErr = "";
    try {
      let key;
      if (/^\d{6}$/.test(digits)) { const p = await Hub.pairWithCode(digits); if (p.error) throw new Error(p.error); key = p.token; }
      else { key = Hub.normalizeKey(raw); const msg = await Hub.verifyKey(key); if (msg) throw new Error(msg); }
      Hub.setKey(key);
      m.businesses = await Hub.businesses();
    } catch (e) { m.authErr = e.message || String(e); }
    rerender();
  }
  async function mkGo() {
    const m = ST.modal;
    const sel = document.getElementById("nrMkBiz");
    m.biz = sel ? sel.value : Hub.biz; m.busy = true; m.error = ""; m.progress = "אוסף את הרשימה…"; rerender();
    try {
      const ids = await mkIds(m);
      if (!ids.length) throw new Error("לא נבחרו עסקים");
      const total = { imported: 0, merged: [], skipped: [] };
      for (let i = 0; i < ids.length; i += 100) {
        m.progress = `מעביר ${n(Math.min(i + 100, ids.length))} / ${n(ids.length)}…`; rerender();
        const r = await Hub.hub("prospector/import", { business_id: m.biz, ids: ids.slice(i, i + 100) });
        total.imported += r.imported; total.merged.push(...r.merged); total.skipped.push(...r.skipped);
      }
      m.result = total; m.busy = false;
      markStatus(ids.slice(0, 500));
      if (!m.ids) { ST.selected.clear(); ST.selectAllMatching = false; }
    } catch (e) { m.error = e.message || String(e); m.busy = false; }
    rerender();
  }

  // redraw once at a time: replacing the view removes a focused filter box, whose "change" event (fired on blur) starts
  // a new search and asks for a redraw while the first one is still running – that one waits and runs right after
  let rendering = false, renderAgain = false;
  const rerender = () => {
    if (!(S.view === "prospector" && S.tab === TAB)) return;
    if (rendering) { renderAgain = true; return; }
    rendering = true;
    try { const v = document.querySelector("#view"); if (v) v.innerHTML = V[TAB](); }
    catch (e) { console.error("[national registry] redraw", e); }
    finally { rendering = false; }
    if (renderAgain) { renderAgain = false; setTimeout(rerender, 0); }
  };

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
  async function loadReport() {
    if (ST.reportLoading) return;
    ST.reportLoading = true; rerender();
    try {
      const [rep, rq, intel, wu, sc, hl] = await Promise.all([rpc("nr_enrichment_report"), rpc("nr_review_queue", { p_limit: 25, p_offset: ST.reviewPage * 25, p_source: null }),
        rpc("nr_intel_report"), rpc("nr_watch_updates", { p_limit: 60 }), rpc("nr_scale_report"), rpc("nr_engine_health").catch(() => null)]);
      ST.report = rep; ST.review = rq; ST.intel = intel; ST.watchUpd = wu; ST.scale = sc; ST.health = hl; ST.reportError = "";
    } catch (e) { ST.reportError = e.message || String(e); }
    ST.reportLoading = false; rerender();
  }
  async function reviewDecision(findingId, businessId, accept) {
    try {
      const r = await rpc("nr_review_finding", { p_id: Number(findingId), p_business_id: businessId ? Number(businessId) : null, p_accept: accept });
      toast(accept ? `השיוך אושר${r.jobs_attached ? ` – ${n(r.jobs_attached)} משרות צורפו לחברה` : ""}` : "השיוך נדחה – המידע לא יצורף");
      if (ST.modal && ST.modal.type === "biz") openBiz(ST.modal.id);
      loadReport();
    } catch (e) { toast(e.message); }
  }
  async function loadFacets() {
    if (ST.facetsLoading) return;
    ST.facetsLoading = true;
    try { ST.facets = await rpc("nr_facets"); } catch (e) { ST.facets = ST.facets || {}; /* the filters stay usable without counts */ }
    ST.facetsLoading = false;
    rerender();
  }
  async function loadIndustries() {
    try {
      const d = await rpc("nr_industry_summary");
      // the server sends the sub-industry label as "sub" – keep one field name for the screen
      if (d && Array.isArray(d.taxonomy)) d.taxonomy = d.taxonomy.map((t) => ({ ...t, sub_label: t.sub_label || t.sub || t.code, main_label: t.main_label || t.main || "" }));
      ST.ind = d;
    } catch (e) { /* the filters stay usable without counts */ }
    rerender();
  }
  // industry labels: sub-industry → main label, profession
  const TAX = () => Object.fromEntries(((ST.ind && ST.ind.taxonomy) || []).map((t) => [t.code, t]));
  const MAINS = () => { const m = new Map(); ((ST.ind && ST.ind.taxonomy) || []).forEach((t) => { if (!m.has(t.main)) m.set(t.main, { code: t.main, label: t.main_label, subs: [] }); m.get(t.main).subs.push(t); }); return [...m.values()]; };
  function indBadges(codes) {
    const tax = TAX(), list = codes || [];
    if (!list.length) return "";
    if (list.length === 1 && list[0] === "unclassified") return '<div><span class="badge b-no" title="אין במידע שנאסף בסיס לסיווג – לא מנחשים">לא מסווג</span></div>';
    return '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px">' + list.filter((c) => tax[c]).map((c) => { const sub = String(tax[c].sub_label || tax[c].sub || c); return '<span class="badge b-blue" title="' + esc((tax[c].main_label || "") + " › " + sub) + '">' + esc(sub.split(" – ")[0].split(",")[0]) + '</span>'; }).join("") + '</div>';
  }
  function industryCard() {
    const d = ST.ind;
    if (!d || !d.mains) return "";
    const row = (code, label, x, sub) => x ? '<tr data-nr="indpick" data-v="' + code + '" style="cursor:pointer"><td class="' + (sub ? "xs" : "co-name") + '" style="' + (sub ? "padding-inline-start:22px" : "") + '">' + esc(label) + '</td><td class="num">' + n(x.total) + '</td><td class="num">' + n(x.phone) + '</td><td class="num">' + n(x.email) + '</td><td class="num">' + n(x.contact) + '</td><td class="num">' + n(x.people) + '</td><td class="num">' + n(x.fleet) + '</td><td class="num">' + n(x.fleet_strong) + '</td></tr>' : "";
    const open = ST.indOpen || {};
    const body = MAINS().map((m) => row(m.code, (open[m.code] ? "▾ " : "▸ ") + m.label, d.mains[m.code]) + (open[m.code] ? m.subs.map((t) => row(t.code, t.sub_label, (d.subs || {})[t.code], true)).join("") : "")).join("") +
      row("unclassified", "לא מסווג (אין בסיס לסיווג)", d.mains.unclassified);
    return '<details class="card" ' + (ST.openGroups && ST.openGroups.indcard ? "open" : "") + ' data-nr-group="indcard"><summary class="card-h" style="cursor:pointer"><h2>🏷️ עסקים לפי ענף ומקצוע<span class="h-bar"></span></h2><span class="spacer"></span><span class="xs muted">' +
      (d.classified < d.total ? "⏳ סווגו " + n(d.classified) + " מתוך " + n(d.total) + " – הסיווג ממשיך ברקע · " : "") + n(d.multi) + " עסקים משויכים ליותר מענף אחד · עודכן " + when(d.at) + '</span></summary>' +
      '<div class="tbl-wrap"><table><thead><tr><th>ענף (לחיצה על ▸ פותחת תתי־ענפים; לחיצה על שורה מסננת)</th><th>עסקים</th><th>עם טלפון</th><th>עם אימייל</th><th>טלפון או אימייל</th><th>עם איש קשר</th><th>פוטנציאל צי</th><th>צי – סימנים חזקים / 5+</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<div class="card-b xs muted">הסיווג נעשה רק לפי מידע שנאסף: ענף או תחום פעילות מהמקור, סוג התאגדות, או מילת מקצוע מפורשת בשם העסק. עסק בלי בסיס מסומן "לא מסווג". עסק יכול להופיע בכמה ענפים. הסיווג לא מסנן ולא מוחק עסקים מהמאגר.</div></details>';
  }
  // every search ends: rows, "no businesses found", or a clear error with a retry button. A newer search cancels the
  // older one (its request is aborted, so the server stops working on it), and no search waits more than 30 s.
  let browseSeq = 0, browseAbort = null;
  async function browse() {
    const seq = ++browseSeq;
    if (browseAbort) try { browseAbort.abort(); } catch (e) { /* already done */ }
    const ac = new AbortController(); browseAbort = ac;
    const timer = setTimeout(() => ac.abort(), 30000);
    ST.browsing = true; ST.browseError = ""; rerender();
    try {
      const sb = await client();
      const r = await sb.rpc("nr_browse", { p_filters: cleanFilters(), p_sort: ST.sort, p_page: ST.page, p_page_size: ST.pageSize }).abortSignal(ac.signal);
      if (seq !== browseSeq) return;
      if (r.error) throw new Error(r.error.message || "שגיאת שרת");
      ST.result = r.data && Array.isArray(r.data.rows) ? r.data : { total: 0, rows: [] };
      markStatus(ST.result.rows.map((x) => x.id));
    } catch (e) {
      if (seq === browseSeq) {
        const m = String((e && e.message) || e || "");
        ST.browseError = ac.signal.aborted ? "החיפוש לקח יותר מ-30 שניות ונעצר. נסו שוב או צמצמו את הסינון."
          : /statement timeout|canceling statement/i.test(m) ? "השרת עמוס כרגע והחיפוש נעצר. נסו שוב בעוד רגע."
          : /Failed to fetch|NetworkError|network/i.test(m) ? "אין חיבור לשרת. בדקו את החיבור ונסו שוב."
          : m || "החיפוש נכשל";
      }
    } finally {
      clearTimeout(timer);
      if (seq === browseSeq) { browseAbort = null; ST.browsing = false; rerender(); }
    }
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
      if (!document.hidden && !ST.modal) { loadStats(true); if (ST.sub === "enrich") loadReport(); }
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
    if (ST.sub === "enrich" && !ST.report && !ST.reportLoading && !ST.reportError) setTimeout(loadReport, 0);
    if (ST.sub === "outreach" && !ST.out.summary && !ST.out.sumLoading) setTimeout(loadOutreachSummary, 0);
    if (!ST.ind && !ST.indLoading) { ST.indLoading = true; setTimeout(loadIndustries, 0); }
    if (ST.sub === "leads" && !ST.leads.data && !ST.leads.loading && !ST.leads.err) setTimeout(loadLeads, 0);
    if (ST.sub === "control" && !ST.ctl && !ST.ctlLoading && !ST.ctlErr) setTimeout(loadControl, 0);
    if (Date.now() - ST.alertsAt > 60000) { ST.alertsAt = Date.now(); setTimeout(loadAlerts, 0); }
    if (ST.sub === "outreach" && !ST.out.rows && !ST.out.loading && !ST.out.error) setTimeout(loadOutreach, 0);
    if (ST.pendingBiz && !ST.modal) { const id = ST.pendingBiz; ST.pendingBiz = 0; setTimeout(() => openBiz(id), 0); }
    if (!ST.timer) autoRefresh();
    const subTabs = `<div class="row" style="gap:6px">
      <button class="btn btn-sm ${ST.sub === "browse" ? "btn-primary" : ""}" data-nr="sub" data-v="browse">📋 מאגר העסקים</button>
      <button class="btn btn-sm ${ST.sub === "enrich" ? "btn-primary" : ""}" data-nr="sub" data-v="enrich">✨ העשרה – מידע חדש ודוח התקדמות</button>
      <button class="btn btn-sm ${ST.sub === "leads" ? "btn-primary" : ""}" data-nr="sub" data-v="leads">🚚 לידים לדליה – מתעדכן אוטומטית${ST.leads.stats ? ` <span class="badge b-ok">${n(ST.leads.stats.total)}</span>` : ""}</button>
      <button class="btn btn-sm ${ST.sub === "outreach" ? "btn-primary" : ""}" data-nr="sub" data-v="outreach">🎯 רשימות עבודה לשיווק</button>
      <button class="btn btn-sm ${ST.sub === "collection" ? "btn-primary" : ""}" data-nr="sub" data-v="collection">⚙️ איסוף ומקורות</button>
      <button class="btn btn-sm ${ST.sub === "control" ? "btn-primary" : ""}" data-nr="sub" data-v="control">🎛️ מסך שליטה${ST.alerts.length ? ` <span class="badge b-bad">${n(ST.alerts.length)}</span>` : ""}</button>
      <span class="spacer"></span><span class="badge b-ok">STAGING</span><span class="badge b-est">ללא 7 חוקי הסינון – אין מחיקה</span></div>`;
    // a drawing error in one part must never freeze the screen (e.g. the table staying on "searching…")
    const safe = (fn, what) => { try { return fn(); } catch (e) { console.error("[national registry] " + what, e); return `<div class="card card-b"><span class="badge b-bad" style="white-space:normal">⚠️ שגיאה בהצגת ${what}: ${esc(e.message || String(e))}</span> <button class="btn btn-sm" data-nr="apply">🔄 נסה שוב</button></div>`; } };
    const body = safe(() => ST.sub === "control" ? controlView() : ST.sub === "leads" ? leadsView() : ST.sub === "browse" ? safe(industryCard, "טבלת הענפים") + browseView() : ST.sub === "enrich" ? enrichView() : ST.sub === "outreach" ? outreachView() : collectionView(), "המסך");
    return `<div style="display:grid;gap:14px">${subTabs}${safe(alertBanner, "ההתרעות")}${safe(kpiStrip, "הסיכום")}${body}</div>${safe(modal, "החלון")}`;
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
        <details ${!ST.openGroups || ST.openGroups.ind !== false ? "open" : ""} data-nr-group="ind"><summary class="bold">🏷️ ענף, תת־ענף ומקצוע <span class="xs muted">(אפשר לבחור כמה יחד)</span></summary><div style="display:grid;gap:6px;margin-top:8px">
          ${ST.ind ? MAINS().map((m) => { const x = (ST.ind.mains || {})[m.code] || {}; return '<div><div class="row" style="flex-wrap:wrap;gap:4px">' + multi("ind", m.code, '<b>' + esc(m.label) + '</b> <span class="muted">' + n(x.total) + '</span>') +
            '<details style="display:inline-block"><summary class="xs muted" style="cursor:pointer">תתי־ענפים</summary><div class="row" style="flex-wrap:wrap;gap:4px">' + m.subs.map((t) => multi("ind", t.code, esc(t.sub_label) + (t.profession ? ' <span class="muted">(' + esc(t.profession) + ')</span>' : "") + ' <span class="muted">' + n(((ST.ind.subs || {})[t.code] || {}).total) + '</span>')).join("") + '</div></details></div></div>'; }).join("") +
            '<div class="row">' + multi("ind", "unclassified", 'לא מסווג <span class="muted">' + n(((ST.ind.mains || {}).unclassified || {}).total) + '</span>') + chk("ind_any", "כולל עסקים שהתחום מופיע אצלם רק כפעילות משנית (למשל רישיון עסק נוסף)") + '</div>' : '<div class="xs muted">⏳ טוען ענפים…</div>'}
          <div class="grid g-3" style="gap:10px">
            ${sel("fleet_level", [["any", "כל פוטנציאל לצי רכב"], ["strong", "סימנים חזקים או ראיה ל-5+ רכבים"], ["documented", "ראיה מבוססת ל-5+ רכבים"]], "פוטנציאל צי רכב")}
            ${txt("fleet_min", "רכבים ידועים – לפחות", "5", "number")}
            ${sel("contact_level", [["official", "טלפון / אימייל ממאגר רשמי"], ["own_site", "טלפון / אימייל מאתר החברה"], ["two_groups", "פרט שנמצא בשני סוגי מקורות"]], "רמת אימות פרטי הקשר")}
          </div>
        </div></details>
        <details ${!ST.openGroups || ST.openGroups.enr !== false ? "open" : ""} data-nr-group="enr"><summary class="bold">✨ מידע חדש, גיוס והתרחבות</summary><div style="display:grid;gap:8px;margin-top:8px">
          <div class="row" style="flex-wrap:wrap">${chk("important_new", "★ עם מידע חשוב חדש")}${chk("new_info", "עם מידע חדש כלשהו")}${chk("new_week", "מידע חדש מהשבוע האחרון")}${chk("enrich_verified", "✓ מידע מאומת בלבד")}${chk("needs_review", "נדרשת בדיקה")}${chk("watched", "👁 חברות במעקב")}</div>
          <div class="row" style="flex-wrap:wrap"><span class="xs muted">קשרים:</span>${chk("relations", "נמצאו חברות קשורות")}${chk("partners", "נמצאו שותפים / לקוחות / ספקים")}</div>
          <div class="row" style="flex-wrap:wrap"><span class="xs muted">גיוס:</span>${chk("hiring", "מגייסות עובדים")}${chk("hiring_drivers", "מגייסות נהגים")}${chk("hiring_logistics", "מגייסות לוגיסטיקה / תפעול")}${chk("jobs_open", "עם משרה פעילה")}</div>
          <div class="row" style="flex-wrap:wrap"><span class="xs muted">פעילות:</span>${chk("expanded", "התרחבו")}${chk("branch_opened", "פתחו סניף / מרכז")}${chk("tender_won", "זכו במכרז")}${chk("gov_contract", "התקשרות עם הממשלה")}${chk("fleet_info", "מידע על צי רכב")}</div>
          <div class="row" style="flex-wrap:wrap"><span class="xs muted">אנשים ופרטי קשר:</span>${chk("ceo", "מנכ\"ל מזוהה")}${chk("ops_manager", "מנהל תפעול / צי מזוהה")}${chk("corp_email", "אימייל עסקי (דומיין החברה)")}${chk("new_phone", "נמצא טלפון חדש")}${chk("new_website", "נמצא אתר חדש")}</div>
          <div class="grid g-3" style="gap:10px">
            ${txt("jobs_min", "מספר משרות שפורסמו – לפחות", "1", "number")}
            ${sel("finding_source", ((ST.facets && ST.facets.finding_sources) || []).map((s) => [s.v, s.name]), "מקור המידע החדש")}
            ${txt("found_from", "התגלה מתאריך", "", "date")}${txt("found_to", "התגלה עד תאריך", "", "date")}
            ${txt("job_from", "משרה פורסמה מתאריך", "", "date")}
          </div>
          <div class="xs muted">מספר משרות ≠ מספר עובדים. המסננים האלה לשימושך אחרי האיסוף – 7 חוקי דליה לא מופעלים.</div>
        </div></details>
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
          <div class="grid g-3" style="gap:10px">${yesno("fb", "פייסבוק")}${yesno("ig", "אינסטגרם")}${yesno("li", "לינקדאין")}${yesno("tt", "טיקטוק")}${yesno("yt", "יוטיוב")}</div>
          <div class="row">${chk("whatsapp", "וואטסאפ עסקי")}${chk("social_any", "פעילות ברשתות חברתיות (קישור כלשהו)")}</div>
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
        <b class="num" style="font-size:18px">${ST.browsing ? "⏳ מחפש…" : r && r.total_exact === false ? "יותר מ-" + n(r.count_cap || 10000) : n(total)}</b><span>עסקים עונים לתנאים${r && r.total_exact === false ? ` <span class="xs muted" title="הספירה המדויקת נעצרת ב-${n(r.count_cap || 10000)} כדי שהתוצאות יוצגו מהר">(הערכת המערכת: כ-${n(Math.max(total, (r.count_cap || 10000) + 1))})</span>` : ""}</span>
        <span class="spacer"></span>
        <label class="xs muted">מיון <select class="input" style="width:auto;height:32px" data-nr="sort">${[["sources", "מספר מקורות"], ["fleet", "🚚 פוטנציאל צי רכב"], ["important", "★ מידע חשוב חדש קודם"], ["relations", "מספר קשרים"], ["found", "מידע חדש – האחרון קודם"], ["jobs", "מספר משרות שפורסמו"], ["name", "שם"], ["city", "עיר"], ["employees", "מספר עובדים"], ["founded", "שנת הקמה (ישן→חדש)"], ["founded_desc", "שנת הקמה (חדש→ישן)"], ["updated", "עדכון אחרון"], ["collected", "תאריך איסוף"]].map(([v, l]) => `<option value="${v}" ${ST.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
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
        <button class="btn btn-sm btn-primary" data-nr="tomk" ${selCount ? "" : "disabled"} title="העברת העסקים שנבחרו לרשימת הפניות במרכז השיווק">📣 למרכז השיווק</button>
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
      ${ST.browseError ? `<div class="card-b row" style="gap:8px"><div class="badge b-bad" style="white-space:normal">⚠️ ${esc(ST.browseError)}</div><button class="btn btn-sm btn-primary" data-nr="apply">🔄 נסה שוב</button></div>` : ""}
      <div class="card-b" style="padding-bottom:0">${legend()}</div>
      <div class="tbl-wrap"><table><thead><tr>
        <th style="width:32px"><input type="checkbox" data-nr="selpage" ${allOnPage ? "checked" : ""} ${ST.selectAllMatching ? "disabled" : ""}></th>
        <th>עסק</th><th>ח.פ.</th><th>עיר / אזור</th><th>תחום עיסוק</th><th>טלפון</th><th>אימייל</th><th>אתרים ורשתות חברתיות</th><th>עובדים</th><th>מקורות</th></tr></thead>
        <tbody>${rows.map((b) => `<tr data-nr="biz" data-v="${b.id}">
          <td data-nr-stop="1"><input type="checkbox" data-nr="selrow" data-v="${b.id}" ${ST.selectAllMatching || ST.selected.has(b.id) ? "checked" : ""} ${ST.selectAllMatching ? "disabled" : ""}></td>
          <td><div class="co-name">${esc(b.name)}</div><div class="xs muted">${esc(BIZ_STATUS[b.status] || "")}${b.corp_type ? " · " + esc(b.corp_type) : ""}${b.founded_year ? " · הוקם " + b.founded_year : ""}
            ${(b.marks || []).map((m) => MARKS[m] ? ` <span class="badge ${MARKS[m][1]}">${MARKS[m][0]}</span>` : "").join("")}${b.has_conflict ? ` <span class="badge b-est" title="יש סתירה מתועדת בין מקורות">סתירה</span>` : ""}${mkBadge(b.id)}</div>
            ${b.enr_findings ? `<div class="nr-hl">${b.enr_important ? `<span class="badge nr-imp">★ חשוב</span>` : `<span class="badge b-blue">● חדש</span>`}${b.enr_verified ? `<span class="badge b-ok">✓</span>` : ""}
              <span>${esc(String(b.enr_headline || "").slice(0, 130))}</span><span class="muted">${day(b.enr_last_found_at)}${b.enr_findings > 1 ? ` · עוד ${n(b.enr_findings - 1)}` : ""}</span></div>` : ""}
            ${b.enr_needs_review ? `<div class="nr-hl"><span class="badge b-no">⏳ ממתין לבדיקת שיוך</span></div>` : ""}
            ${b.enr_jobs_count ? `<div class="xs muted">💼 ${n(b.enr_jobs_count)} משרות פורסמו${b.enr_jobs_open ? ` (${n(b.enr_jobs_open)} פעילות)` : ""}${b.enr_hiring_drivers ? " · 🚚 מגייסת נהגים" : ""}</div>` : ""}</td>
          <td class="num">${esc(b.reg_id || "—")}</td>
          <td>${esc(b.city || "—")}<div class="xs muted">${esc(b.district || "")}</div></td>
          <td class="xs" style="max-width:220px;white-space:normal">${esc(b.main_activity || b.sector || "—")}${indBadges(b.ind_codes)}${b.fleet_level ? '<div class="xs">🚚 ' + esc(b.fleet_level === "documented" ? "ראיה ל-5+ רכבים" : b.fleet_level === "strong" ? "סימנים חזקים לצי" : "פוטנציאל לצי") + (b.fleet_min ? " · " + n(b.fleet_min) + "+" : "") + '</div>' : ""}</td>
          <td class="num" dir="ltr">${esc(b.phone_main || (b.branch_phones ? "סניפים: " + b.branch_phones : "—"))}${b.has_verified_phone ? ' <span class="badge b-ok" title="אותו מספר מ-2 מקורות עצמאיים">✓</span>' : ""}</td>
          <td class="xs" dir="ltr">${esc(b.email_main || "—")}</td>
          <td style="min-width:120px">${linkIcons(b)}</td>
          <td class="num">${b.employees_count ? n(b.employees_count) + '<div class="xs muted">פורסם</div>' : '<span class="xs muted">לא ידוע</span>'}</td>
          <td class="num">${n(b.source_count)}${b.has_people ? '<div class="xs muted">👤 איש קשר</div>' : ""}${b.fleet_known ? '<div class="xs">🚌 צי</div>' : ""}${b.rel_count ? `<div class="xs muted">🔗 ${n(b.rel_count)} קשרים</div>` : ""}${b.watched ? '<div class="xs">👁 במעקב</div>' : ""}</td></tr>`).join("") || `<tr><td colspan="10" class="muted">${ST.browsing ? "⏳ מחפש…" : "לא נמצאו עסקים בתנאים האלה"}</td></tr>`}</tbody></table></div>
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
    else if (m.type === "mk") body = mkBody(m);
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
      ${watchBlock(d)}
      <div><b>🌐 אתרים ורשתות חברתיות</b> <span style="margin-inline-start:6px">${linkIcons(b)}</span></div>
      ${findingsBlock(d)}
      ${relationsBlock(d)}
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

  // one finding: colour + words + what / when / from where
  function findingRow(f, pending) {
    const src = f.source_name || f.source_key || "";
    const items = (f.detail && f.detail.items) || [];
    return `<div class="nr-find ${fclass(f, pending)}">
      <div class="row" style="gap:4px;flex-wrap:wrap">${fmark(f, pending)}<span class="badge b-no">${esc(FCAT[f.category] || f.category)}</span></div>
      <div class="t">${esc(f.title)}</div>
      <div class="xs muted">התגלה ${when(f.discovered_at)}${f.published_at ? ` · פורסם במקור ${day(f.published_at)}` : ""} · מקור: ${f.source_url ? `<a href="${esc(f.source_url)}" target="_blank" rel="noopener">${esc(src)}</a>` : esc(src)}</div>
      ${items.length > 1 ? `<details class="xs"><summary>${n((f.detail && f.detail.count) || items.length)} רשומות – פירוט</summary>${items.slice(0, 25).map((x) => `<div>${esc(x.date || "")} · ${esc(x.ministry || "")} · ${esc(x.procedure || x.topic || "")}${x.amount ? ` · ₪${n(Math.round(Number(String(x.amount).replace(/[^0-9.]/g, ""))))}` : ""} ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">רשומה</a>` : ""}</div>`).join("")}</details>` : ""}
    </div>`;
  }
  function findingsBlock(d) {
    const fs = d.findings || [], pend = d.pending || [], jobs = d.jobs || [];
    if (!fs.length && !pend.length && !jobs.length) return `<div class="xs muted">מידע חדש: עדיין לא התגלה מידע חדש על העסק הזה במקורות ההעשרה.</div>`;
    const imp = fs.filter((f) => f.importance === "important").length;
    return `<div style="display:grid;gap:6px"><div class="row"><b>✨ מידע חדש שהתגלה (${n(fs.length)})</b>${imp ? `<span class="badge nr-imp">★ ${n(imp)} חשובים</span>` : ""}<span class="spacer"></span>${legend()}</div>
      ${fs.map((f) => findingRow(f, false)).join("")}
      ${pend.length ? `<div class="xs muted" style="margin-top:4px">ממצאים שייתכן שהם של העסק הזה – לא צורפו עד שתאשר:</div>${pend.map((f) => `${findingRow(f, true)}<div class="row" style="gap:6px"><button class="btn btn-sm" data-nr="revok" data-id="${f.id}" data-b="${d.business.id}">✓ כן, זה העסק הזה</button><button class="btn btn-sm" data-nr="revno" data-id="${f.id}">✗ לא שייך</button></div>`).join("")}` : ""}
      ${jobs.length ? `<details ${jobs.length <= 8 ? "open" : ""}><summary class="bold">💼 משרות שפורסמו (${n(jobs.length)}) – מספר משרות אינו מספר עובדים</summary><div class="tbl-wrap"><table><thead><tr><th>משרה</th><th>עיר</th><th>פורסם / עודכן</th><th>מצב</th><th>סוג</th><th>קישור</th></tr></thead><tbody>
        ${jobs.map((j) => `<tr><td class="xs">${esc(j.title || "")}<div class="muted">${esc(j.occupation || "")}</div></td><td class="xs">${esc(j.city || "—")}</td><td class="xs">${day(j.posted_date)}</td>
          <td>${j.status === "open" ? `<span class="badge b-ok">פעילה</span>` : j.status === "closed" ? `<span class="badge b-no">נסגרה</span>` : `<span class="badge b-no">לא ידוע</span>`}</td>
          <td class="xs">${[j.is_driver ? "🚚 נהג" : "", j.is_logistics ? "📦 לוגיסטיקה" : "", j.is_operations ? "⚙️ תפעול" : ""].filter(Boolean).join(" ") || "—"}</td>
          <td class="xs"><a href="${esc(j.url)}" target="_blank" rel="noopener">מודעה</a></td></tr>`).join("")}</tbody></table></div></details>` : ""}
    </div>`;
  }

  const SITE_ST = { queued: "ממתינים", claimed: "בעבודה", matched: "שויכו לעסק קיים", created: "עסקים חדשים", review: "לבדיקה", no_identity: "ללא זהות ברורה",
    not_business: "מפנים לאתר אחר", parked: "חונים", robots: "חסום ב-robots", unreachable: "לא זמינים", known: "כבר במאגר", error: "שגיאה" };
  const REL = { client: "לקוח של החברה", partner: "שותף עסקי", supplier: "ספק של החברה", parent: "חברת אם", subsidiary: "חברה בת", owner: "בעלים", owned: "בבעלות החברה",
    brand: "מותג קשור", mention: "אזכור / קישור באתר", client_of: "החברה היא לקוחה שלו", supplier_of: "החברה היא ספקית שלו", mentioned_by: "מזכיר את החברה" };
  const LEVEL = { verified: ["✓ קשר עסקי מאומת", "b-ok"], stated: ["קשר עסקי לפי אתר החברה", "b-blue"], mention: ["אזכור בלבד – לא קשר מסחרי מוכח", "b-no"] };
  function relationsBlock(d) {
    const rs = d.relations || [];
    if (!rs.length) return "";
    return `<details ${rs.length <= 10 ? "open" : ""}><summary class="bold">🔗 חברות קשורות (${n(rs.length)})</summary>
      <div class="xs muted" style="margin:4px 0">"קשר עסקי מאומת" = מקור מובנה או שני מקורות. "לפי אתר החברה" = עמוד לקוחות / שותפים / ספקים. "אזכור" = קישור בלבד, ללא הוכחה לקשר מסחרי.</div>
      <div class="tbl-wrap"><table><thead><tr><th>חברה</th><th>סוג הקשר</th><th>רמת ודאות</th><th>מקור</th></tr></thead><tbody>
      ${rs.map((r) => `<tr ${r.other_id ? `data-nr="biz" data-v="${r.other_id}" style="cursor:pointer"` : ""}><td>${esc(r.other_name || r.other_domain || "—")}${r.other_city ? `<div class="xs muted">${esc(r.other_city)}</div>` : ""}${!r.other_id && r.other_domain ? `<div class="xs muted" dir="ltr">${esc(r.other_domain)} · טרם זוהה במאגר</div>` : ""}</td>
        <td class="xs">${esc(REL[r.relation] || r.relation)}</td><td><span class="badge ${(LEVEL[r.level] || ["", "b-no"])[1]}">${esc((LEVEL[r.level] || [r.level])[0])}</span></td>
        <td class="xs">${r.source_url ? `<a href="${esc(r.source_url)}" target="_blank" rel="noopener" data-nr-stop="1">${esc(r.source_name || "מקור")}</a>` : esc(r.source_name || "")}<div class="muted">${day(r.discovered_at)}</div></td></tr>`).join("")}
      </tbody></table></div></details>`;
  }
  function watchBlock(d) {
    const w = d.watch, id = d.business.id;
    return `<div class="row" style="gap:6px;align-items:center;flex-wrap:wrap;padding:8px;border:1px dashed var(--border);border-radius:8px">
      ${w ? `<span class="badge b-blue">👁 במעקב ${w.frequency === "daily" ? "יומי" : "שבועי"}</span>
        <span class="xs muted">בדיקה אחרונה: ${when(w.last_checked_at)} · הבאה: ${when(w.next_due_at)}${w.last_result ? " · " + esc(w.last_result) : ""}</span>
        <span class="spacer"></span><button class="btn btn-sm" data-nr="watch" data-id="${id}" data-v="${w.frequency === "daily" ? "weekly" : "daily"}">עבור למעקב ${w.frequency === "daily" ? "שבועי" : "יומי"}</button>
        <button class="btn btn-sm" data-nr="watch" data-id="${id}" data-v="">בטל מעקב</button>`
      : `<span class="xs">הפעל מעקב אחר החברה – השרת יבדוק מידע עסקי חדש באתר החברה ובמקורות המותרים, גם כשהמחשב כבוי:</span><span class="spacer"></span>
        <button class="btn btn-sm btn-primary" data-nr="watch" data-id="${id}" data-v="daily">👁 הפעל מעקב יומי</button>
        <button class="btn btn-sm" data-nr="watch" data-id="${id}" data-v="weekly">👁 מעקב שבועי</button>`}
    </div>`;
  }
  async function setWatch(id, freq) {
    try {
      await rpc("nr_watch_set", { p_business: Number(id), p_frequency: freq || null });
      toast(freq ? `המעקב הופעל (${freq === "daily" ? "יומי" : "שבועי"}) – הבדיקה הראשונה תתבצע בדקות הקרובות` : "המעקב בוטל");
      if (ST.modal && ST.modal.type === "biz") openBiz(ST.modal.id);
      if (ST.sub === "enrich") loadReport();
    } catch (e) { toast(e.message); }
  }

  // ── enrichment: progress report, sources, examples, review queue ──
  function enrichView() {
    const r = ST.report;
    if (ST.reportError && !r) return `<div class="card card-b"><div class="badge b-bad" style="white-space:normal">${esc(ST.reportError)}</div></div>`;
    if (!r) return `<div class="card card-b muted">⏳ טוען דוח העשרה מ-Supabase STAGING…</div>`;
    const j = r.jobs || {}, dq = r.domains || {};
    const filt = (k) => ` data-nr-enfilter="${k}" style="cursor:pointer" title="לחץ כדי לראות את החברות במאגר"`;
    const head = `<div class="card"><div class="card-h"><h2>העשרת המאגר הארצי – דוח התקדמות<span class="h-bar"></span></h2><span class="spacer"></span>
        ${r.control && r.control.enrich_running ? `<span class="badge b-blue">● ההעשרה פועלת בשרת${r.control.enrich_current ? " – " + esc(r.control.enrich_current) : ""}</span>` : `<span class="badge b-no">⏸ ההעשרה עצורה</span>`}
        <button class="btn btn-sm" data-nr="enrichrun" data-v="${r.control && r.control.enrich_running ? "0" : "1"}">${r.control && r.control.enrich_running ? "⏸ עצור העשרה" : "▶ הפעל העשרה"}</button>
        <button class="btn btn-sm" data-nr="enrichrefresh">${ST.reportLoading ? "⏳" : "🔄"} רענן</button></div>
      <div class="card-b xs muted" style="display:grid;gap:4px;white-space:normal">
        <div>המידע נכנס לכרטיס החברה הקיים במאגר – לא נוצרת רשימת לידים חדשה. שיוך לא ודאי נשאר "ממתין לבדיקה" ולא מצורף. רץ בשרת כל 2 דקות (pg_cron → nr-enrichment), במנות, עם נקודת המשך. עודכן ${when(r.generated_at)}.</div>
        <div>${legend()}</div></div></div>`;
    const kpis = `<div class="grid g-kpi tiles">
      ${kpi("מקורות שנבדקו", n(r.sources_checked), `${n(r.sources_auto)} באיסוף אוטומטי · ${n(r.sources_unavailable)} חסומים / לא מותרים`)}
      ${kpi("חברות קיימות שקיבלו מידע חדש", n(r.businesses_enriched), `${n(r.findings)} ממצאים`, filt("new_info"))}
      ${kpi("סומנו ★ מידע חשוב חדש", n(r.important), "לחץ לרשימה", filt("important_new"))}
      ${kpi("חברות חדשות שנוספו", n(r.businesses_new), `ההעשרה לא יוצרת רשומות בלי ח.פ.; ${n(j.employers_not_in_registry)} מעסיקים שלא זוהו לא נוספו`)}
      ${kpi("טלפונים חדשים", n(r.new_phones), "לא נדרס אף טלפון קיים", filt("new_phone"))}
      ${kpi("אימיילים חדשים", n(r.new_emails), `${n(r.new_websites)} אתרים חדשים · ${n(r.new_socials)} קישורים`, filt("new_website"))}
      ${kpi("מגייסות עובדים", n(r.hiring), `${n(r.hiring_logistics)} מגייסות לוגיסטיקה / תפעול`, filt("hiring"))}
      ${kpi("מגייסות נהגים", n(r.hiring_drivers), "", filt("hiring_drivers"))}
      ${kpi("פתחו סניף / התרחבו", `${n(r.branch_opened)} / ${n(r.expansion)}`, "מתוך אתרי החברות – אינדיקציה", filt("expanded"))}
      ${kpi("זכו במכרז / התקשרו עם הממשלה", `${n(r.tender_won)} / ${n(r.gov_contract)}`, "כולל היקף כספי מ-data.gov.il", filt("gov_contract"))}
      ${kpi("מנהלים ואנשי קשר שזוהו", n(r.people_found), `${n(r.ceo_found)} מנכ"לים · ${n(r.ops_found)} מנהלי תפעול / צי`)}
      ${kpi("נתונים חדשים שאומתו", n(r.verified), "אותו פרט מ-2 מקורות עצמאיים", filt("enrich_verified"))}
      ${kpi("כפילויות שנמנעו", n(r.duplicates_avoided), "רשומות מקור שצורפו לחברה קיימת במקום רשומה חדשה")}
      ${kpi("ממתינים לבדיקת שיוך", n(r.pending_review), "לא צורפו – ראו למטה", filt("needs_review"))}
      ${kpi("צי רכב (מאתר החברה)", n(r.fleet), "", filt("fleet_info"))}
      ${kpi("אתרים לגילוי / סריקה", `${n(dq.queued || 0)} / ${n(r.sites_left)}`, `נמצאו ${n(dq.found || 0)} · לא נמצא ${n((dq.not_found || 0) + (dq.parked || 0) + (dq.error || 0))}`)}
    </div>`;
    const ex = (list, title) => list && list.length ? `<div class="card"><div class="card-h"><h2>${title}<span class="h-bar"></span></h2></div><div class="tbl-wrap"><table><thead><tr><th>חברה</th><th>מה התגלה</th><th>סימון</th><th>מתי</th><th>מקור</th></tr></thead><tbody>
      ${list.map((x) => `<tr data-nr="biz" data-v="${x.business_id}" style="cursor:pointer"><td><div class="co-name">${esc(x.name)}</div><div class="xs muted">${esc(x.city || "")}${x.reg_id ? " · ח.פ. " + esc(x.reg_id) : ""}</div></td>
        <td class="xs" style="white-space:normal;max-width:420px">${esc(x.title)}</td><td>${fmark(x, false)}</td><td class="xs">${when(x.discovered_at)}</td>
        <td class="xs">${x.source_url ? `<a href="${esc(x.source_url)}" target="_blank" rel="noopener" data-nr-stop="1">${esc(x.source_name || "מקור")}</a>` : esc(x.source_name || "")}</td></tr>`).join("")}</tbody></table></div>
      <div class="card-b xs muted">לחיצה על שורה פותחת את כרטיס החברה במאגר; הקישור במקור פותח את הרשומה המקורית.</div></div>` : "";
    const sources = `<div class="card"><div class="card-h"><h2>מקורות ההעשרה – מה נבדק ומה נאסף (${n((r.sources || []).length)})<span class="h-bar"></span></h2></div><div class="tbl-wrap"><table>
      <thead><tr><th>מקור</th><th>סטטוס</th><th>נקראו</th><th>חברות שהועשרו</th><th>פרטים</th><th>סיבה / הערה</th></tr></thead><tbody>
      ${(r.sources || []).map((s) => `<tr><td><div class="co-name">${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}</div><div class="xs muted">${esc(KIND[s.kind] || s.kind)}${s.last_run_at ? " · ריצה אחרונה " + when(s.last_run_at) : ""}</div></td>
        <td>${badge(s.status)}${s.total ? `<div class="bar" style="margin-top:4px;height:5px"><i style="width:${Math.min(100, (s.cursor / s.total) * 100)}%"></i></div>` : ""}</td>
        <td class="num">${s.read ? n(s.read) : "—"}${s.total ? `<div class="xs muted">מתוך ${n(s.total)}</div>` : ""}</td><td class="num">${s.enriched ? n(s.enriched) : "—"}</td><td class="num">${s.details ? n(s.details) : "—"}</td>
        <td class="xs muted" style="white-space:normal;max-width:420px">${esc(s.reason || "")}</td></tr>`).join("")}</tbody></table></div></div>`;
    const rq = ST.review || { total: 0, rows: [] };
    const review = `<div class="card"><div class="card-h"><h2>ממתינים לבדיקת שיוך (${n(rq.total)})<span class="h-bar"></span></h2><span class="spacer"></span>
        <span class="xs muted">שם דומה בלבד אינו מספיק לשיוך – בחר את החברה הנכונה או דחה</span></div>
      <div class="card-b" style="display:grid;gap:8px">${(rq.rows || []).map((f) => `${findingRow(f, true)}
        <div class="row" style="gap:6px;flex-wrap:wrap">${f.jobs ? `<span class="xs muted">${n(f.jobs)} משרות תחת השם הזה</span>` : ""}
          ${(f.candidates || []).map((c) => `<button class="btn btn-sm" data-nr="revok" data-id="${f.id}" data-b="${c.id}" title="${esc(c.activity || "")}">✓ ${esc(c.name)}${c.city ? " – " + esc(c.city) : ""}${c.reg_id ? " (ח.פ. " + esc(c.reg_id) + ")" : ""}</button>
            <button class="btn btn-sm btn-ghost" data-nr="biz" data-v="${c.id}">👁 כרטיס</button>`).join("")}
          <button class="btn btn-sm" data-nr="revno" data-id="${f.id}">✗ לא שייך לאף אחת</button></div>`).join("") || `<div class="xs muted">אין ממצאים שממתינים לבדיקה</div>`}
      ${rq.total > 25 ? `<div class="row" style="justify-content:center;gap:8px"><button class="btn btn-sm" data-nr="revpage" data-v="${ST.reviewPage - 1}" ${ST.reviewPage <= 0 ? "disabled" : ""}>‹ הקודם</button>
        <span class="xs">עמוד ${n(ST.reviewPage + 1)} מתוך ${n(Math.ceil(rq.total / 25))}</span><button class="btn btn-sm" data-nr="revpage" data-v="${ST.reviewPage + 1}" ${(ST.reviewPage + 1) * 25 >= rq.total ? "disabled" : ""}>הבא ›</button></div>` : ""}
      </div></div>`;
    const it = ST.intel || {}, rsq = it.related_sites || {};
    const intel = `<div class="card"><div class="card-h"><h2>מודיעין עסקי – אתרים, רשתות וקשרים<span class="h-bar"></span></h2><span class="spacer"></span>
        <span class="xs muted">ריצה אחרונה: ${when(it.last_run)} · ${n(it.runs_last_hour)} מנות בשעה האחרונה${it.failed_last_hour ? ` · ${n(it.failed_last_hour)} נכשלו` : ""} · מנוע ${it.engine_running ? "פועל" : "עצור"}</span></div>
      <div class="card-b"><div class="grid g-kpi tiles">
      ${kpi("עסקים חדשים שנמצאו", n(it.new_businesses), "ח.פ. תקין באתר, או זהות ברורה: שם + טלפון + עיר, ללא עסק דומה במאגר")}
      ${kpi("אתרי אינטרנט שהתגלו", n(it.websites_found), `${n(it.with_website)} עסקים עם אתר כיום`, filt("new_website"))}
      ${kpi("קישורי פייסבוק", n(it.facebook), "עסקים עם עמוד פייסבוק", ` data-nr-enfilter="fb_yes" style="cursor:pointer"`)}
      ${kpi("קישורי לינקדאין", n(it.linkedin), "")}
      ${kpi("אינסטגרם / טיקטוק / יוטיוב", `${n(it.instagram)} / ${n(it.tiktok)} / ${n(it.youtube)}`, `${n(it.whatsapp)} עם וואטסאפ עסקי`)}
      ${kpi("קשרים בין חברות", n(Number(it.relations_verified || 0) + Number(it.relations_stated || 0) + Number(it.relations_mention || 0)),
          `${n(it.relations_verified)} מאומתים · ${n(it.relations_stated)} לפי אתר החברה · ${n(it.relations_mention)} אזכורים בלבד`, filt("relations"))}
      ${kpi("חברות קשורות שזוהו במאגר", n(it.relations_resolved), `${n(it.businesses_with_relations)} עסקים עם קשרים · אתרים קשורים בתור: ${n(rsq.queued || 0)}`)}
      ${kpi("חברות במעקב", n(it.watched), `${n(it.watched_with_important)} קיבלו עדכון עסקי חשוב`, filt("watched"))}
      ${kpi("מקורות", `${n(it.sources_active)} פעילים`, `${n(it.sources_blocked)} חסומים · ${n(it.sources_awaiting)} ממתינים להרשאה`)}
      </div></div></div>`;
    const wu = ST.watchUpd || { watched: [], updates: [] };
    const watchCard = `<div class="card"><div class="card-h"><h2>👁 עדכונים מחברות במעקב (${n((wu.watched || []).length)} חברות)<span class="h-bar"></span></h2></div><div class="card-b" style="display:grid;gap:6px">
      ${(wu.watched || []).length ? `<div class="row" style="flex-wrap:wrap;gap:4px">${wu.watched.map((w) => `<button class="btn btn-sm" data-nr="biz" data-v="${w.id}">${esc(w.name)} <span class="xs muted">${w.frequency === "daily" ? "יומי" : "שבועי"} · ${w.last_checked_at ? "נבדק " + when(w.last_checked_at) : "ממתין לבדיקה ראשונה"}</span></button>`).join("")}</div>` : `<div class="xs muted">עדיין לא סימנת חברות למעקב. פתח כרטיס חברה ולחץ "הפעל מעקב".</div>`}
      ${(wu.updates || []).slice(0, 30).map((f) => `<div data-nr="biz" data-v="${f.business_id}" style="cursor:pointer">${findingRow(Object.assign({}, f, { title: f.name + " – " + f.title }), false)}</div>`).join("") || ((wu.watched || []).length ? `<div class="xs muted">אין עדיין שינויים מאז שהופעל המעקב.</div>` : "")}
      </div></div>`;
    const relEx = (it.relation_examples || []).length ? `<div class="card"><div class="card-h"><h2>דוגמאות לקשרים בין חברות<span class="h-bar"></span></h2></div><div class="tbl-wrap"><table><thead><tr><th>חברה</th><th>קשר</th><th>חברה קשורה</th><th>ודאות</th><th>מקור</th></tr></thead><tbody>
      ${it.relation_examples.map((x) => `<tr><td data-nr="biz" data-v="${x.from_business_id}" style="cursor:pointer" class="co-name">${esc(x.from_name)}</td><td class="xs">${esc(REL[x.relation] || x.relation)}</td>
        <td data-nr="biz" data-v="${x.to_business_id}" style="cursor:pointer">${esc(x.to_name)}</td><td><span class="badge ${(LEVEL[x.level] || ["", "b-no"])[1]}">${esc((LEVEL[x.level] || [x.level])[0])}</span></td>
        <td class="xs">${x.source_url ? `<a href="${esc(x.source_url)}" target="_blank" rel="noopener">${esc(x.source_name || "מקור")}</a>` : ""}</td></tr>`).join("")}</tbody></table></div></div>` : "";
    const sc = ST.scale || {}, sv = sc.saved_today || {}, so = sc.social_today || {}, q = sc.queues || {}, sq = sc.site_queue || {}, rl = sc.relations_today || {}, wk = sc.workers || {};
    const errs = Object.entries(sc.errors_last_hour || {});
    const scale = `<div class="card"><div class="card-h"><h2>⚡ קצב, תורים והתקדמות היום<span class="h-bar"></span></h2><span class="spacer"></span>
        <span class="xs muted">${n(wk.identify_workers)} עובדי זיהוי במקביל + מנוע ההעשרה · היום מתחיל ${when(sc.day_start)}</span></div>
      <div class="card-b" style="display:grid;gap:10px"><div class="grid g-kpi tiles">
      ${kpi("עסקים חדשים היום", n(sc.new_businesses_today), Object.entries(sc.new_businesses_by_source_today || {}).map(([k, v]) => `${esc(k)}: ${n(v)}`).join(" · ") || "—")}
      ${kpi("עסקים קיימים שהועשרו היום", n(sc.enriched_today), "עם ממצא שנשמר בכרטיס")}
      ${kpi("טלפונים / אימיילים חדשים היום", `${n(sv.phone)} / ${n(sv.email)}`, `${n(sc.verified_today)} פרטי קשר אומתו היום (2 מקורות)`)}
      ${kpi("אתרים וקישורים לרשתות היום", n(Number(sv.website || 0) + Number(sv.social || 0) + Number(sv.whatsapp || 0)),
          `אתרים ${n(so.website)} · פייסבוק ${n(so.facebook)} · אינסטגרם ${n(so.instagram)} · לינקדאין ${n(so.linkedin)} · יוטיוב ${n(so.youtube)} · טיקטוק ${n(so.tiktok)} · וואטסאפ ${n(Number(so.whatsapp || 0))}`)}
      ${kpi("קשרים עסקיים היום", n(Number(rl.verified || 0) + Number(rl.stated || 0) + Number(rl.mention || 0)), `${n(rl.verified)} מאומתים · ${n(rl.stated)} לפי אתר החברה · ${n(rl.mention)} אזכורים`)}
      ${kpi("נמצא / אומת / נשמר היום", `${n(sc.findings_today)} / ${n(sc.verified_today)} / ${n(sc.findings_matched_today)}`, `${n(sc.findings_pending_today)} ממתינים לבדיקה · ${n(sc.findings_rejected_today)} נדחו`)}
      ${kpi("קצב – רשומות מקור", `${n(sc.records_last_hour)} לשעה`, `${n(sc.records_last_24h)} ב-24 השעות האחרונות`)}
      ${kpi("קצב – אתרים שזוהו", `${n(sc.sites_checked_last_hour)} לשעה`, `${n(sc.sites_checked_last_24h)} ביממה · הצלחה ${sc.site_success_rate ?? "—"}%`)}
      ${kpi("תורים ממתינים", n(q.sites), `סריקת עומק ${n(q.deep_crawl)} · דומייני אימייל ${n(q.email_domains)} · אתרים קשורים ${n(q.related_sites)} · לבדיקה ${n(q.review)}`)}
      ${kpi("מקורות", `${n(sc.sources_active)} פעילים`, `${n(sc.sources_blocked)} חסומים / לא מותרים${errs.length ? " · שגיאות בשעה האחרונה: " + errs.map(([k, v]) => `${esc(k)} ${n(v)}`).join(", ") : " · אין שגיאות בשעה האחרונה"}`)}
      </div>
      ${healthLine(ST.health)}
      <div class="xs muted">תור הזיהוי: ${Object.entries(sq).map(([k, v]) => `${esc(SITE_ST[k] || k)} ${n(v)}`).join(" · ")}</div></div></div>`;
    return head + kpis + scale + intel + watchCard + relEx + ex(r.examples, "דוגמאות אמיתיות – חברה אחת לכל סוג מידע") + ex(r.recent_important, "★ מידע חשוב חדש – האחרונים") + review + sources;
  }

  // engine health: server calls in the last 15 minutes / hour, and what the self-feeding sources added
  function healthLine(h) {
    if (!h) return "";
    const pct = (a, b) => (Number(b) ? Math.round((Number(a) / Number(b)) * 100) : 0);
    const ok15 = pct(h.ok_15m, h.calls_15m);
    const cls = !Number(h.calls_15m) ? "b-no" : ok15 >= 85 ? "b-ok" : ok15 >= 65 ? "b-est" : "b-bad";
    const graphs = (h.cc_graphs_harvested || []).length;
    return `<div class="row" style="flex-wrap:wrap;gap:6px;align-items:center">
      <span class="badge ${cls}">בריאות המנוע: ${ok15}% קריאות תקינות ב־15 הדקות האחרונות</span>
      <span class="xs muted">${n(h.calls_15m)} קריאות · ${n(h.cpu_limit_15m)} נקטעו במגבלת המעבד (חוזרות לתור) · ${n(h.other_errors_15m)} שגיאות אחרות · ${n(h.sites_checked_15m)} אתרים נבדקו</span>
      <span class="xs muted">· בשעה האחרונה: ${n(h.ok_last_hour)}/${n(h.calls_last_hour)} תקינות</span>
      <span class="xs muted">· גילוי דרך קישורים: ${n(h.links_seen_last_hour)} אתרים ישראליים מקושרים נראו בשעה האחרונה, ${n(h.links_new_last_hour)} חדשים לתור (סה"כ ${n(h.link_discovered_queued)})</span>
      <span class="xs muted">· Common Crawl: ${n(graphs)} גרפים נקראו</span>
      ${h.last_error ? `<span class="xs muted" title="${esc(h.last_error)}">· שגיאה אחרונה ${when(h.last_error_at)}</span>` : ""}</div>`;
  }

  // ── marketing work lists ──
  const SEGS = [["dalia", "פוטנציאל לדליה – צי רכב, מוסכים, סחר רכב, דלק"], ["dalia_wide", "פוטנציאל רחב – כולל קבלנים ותעשייה"], ["fleet", "צי רכב / נהגים / שליחויות"],
    ["garages", "מוסכים ושירותי רכב"], ["vehicle_trade", "סחר, יבוא וייצור רכב"], ["fuel", "דלק ותחנות תדלוק"], ["construction", "בנייה וקבלנות"], ["industry", "תעשייה וייצור"], ["all", "כל הענפים"]];
  const SEG_NAME = Object.fromEntries(SEGS);
  const LEVELS = [["any", "כל פרט קשר"], ["phone", "יש טלפון"], ["phone_email", "יש טלפון וגם אימייל"], ["official", "טלפון / אימייל ממאגר רשמי"],
    ["own_site", "טלפון / אימייל מאתר החברה עצמה"], ["two_groups", "פרט שנמצא בשני סוגי מקורות (רשמי + אתר / אחר)"]];
  const FLEETS = [["", "ללא סינון צי"], ["any", "כל פוטנציאל לצי רכב"], ["strong", "סימנים חזקים או ראיה ל-5+ רכבים"], ["documented", "ראיה מבוססת ל-5+ רכבים"]];
  const ROLES_F = [["", "ללא סינון אנשי קשר"], ["any", "יש איש קשר רלוונטי (צי / תפעול / בעלים)"], ["ops", "קצין רכב / מנהל צי / תפעול / לוגיסטיקה"], ["fleet", "קצין רכב / מנהל צי בלבד"]];
  const SORTS = [["fleet", "פוטנציאל צי – החזק ביותר קודם"], ["id", "סדר המאגר"]];
  const FLEET_LV = { documented: ["ראיה ל-5+ רכבים", "b-ok"], strong: ["סימנים חזקים לצי", "b-blue"], possible: ["פוטנציאל – אינדיקציה בלבד", "b-no"] };
  const ROLE_CAT = { fleet: "צי / רכב", ops: "תפעול / לוגיסטיקה", owner: "בעלים / הנהלה" };
  const byFleet = () => (ST.out.filters.sort || "fleet") === "fleet";
  const cardUrl = (id) => `${location.origin}${location.pathname}?tab=${TAB}&biz=${id}`;
  function readOutFilters() {
    const f = {};
    document.querySelectorAll("[data-no-f]").forEach((el) => {
      const k = el.getAttribute("data-no-f");
      if (el.type === "checkbox") { if (el.checked) f[k] = true; } else if (el.value.trim()) f[k] = el.value.trim();
    });
    const ind = [...document.querySelectorAll("[data-no-fm=ind]:checked")].map((el) => el.dataset.v);
    if (ind.length) f.ind = ind;
    return f;
  }
  async function loadOutreachSummary() {
    ST.out.sumLoading = true; rerender();
    try { ST.out.summary = await rpc("nr_outreach_summary"); } catch (e) { ST.out.error = e.message; }
    ST.out.sumLoading = false; rerender();
  }
  async function loadOutreach() {
    ST.out.loading = true; ST.out.error = ""; rerender();
    try { ST.out.rows = await rpc("nr_outreach_page", { p_filters: ST.out.filters, p_after: ST.out.afters[ST.out.page] || 0, p_limit: 50 }); markStatus(ST.out.rows.map((x) => x.id)); }
    catch (e) { ST.out.error = e.message; ST.out.rows = []; }
    ST.out.loading = false; rerender();
  }
  // where a detail was found – never "verified" / "active": that is only known after a call
  function relTags(rel) {
    const r = rel || {}, t = [];
    if (r.official) t.push(`<span class="badge b-ok" title="נמצא במאגר ממשלתי / רשמי">רשמי</span>`);
    if (r.own_site) t.push(`<span class="badge b-blue" title="פורסם באתר האינטרנט של החברה עצמה">אתר החברה</span>`);
    if (r.other) t.push(`<span class="badge b-no" title="מקור אחר (למשל OpenStreetMap)">מקור אחר</span>`);
    if (Number(r.groups) >= 2) t.push(`<span class="badge b-est" title="אותו פרט נמצא בשני סוגי מקורות בלתי תלויים">2 סוגי מקורות</span>`);
    return t.join(" ");
  }
  const relText = (rel) => { const r = rel || {}; return [r.official && "רשמי", r.own_site && "אתר החברה", r.other && "מקור אחר"].filter(Boolean).join(" + "); };
  const contactsOf = (r, kind) => (r.contacts || []).filter((c) => c.kind === kind);
  function contactChips(r, kind) {
    const one = (c) => {
      const v = esc(c.v), href = kind === "phone" ? `tel:${esc(String(c.v).replace(/[^\d+]/g, ""))}` : `mailto:${v}`;
      const sub = c.sub === "mobile" ? " (נייד)" : c.sub === "branch" ? ` (סניף${c.branch ? " " + esc(c.branch) : ""})` : "";
      return `<div class="xs" title="${esc((c.sources || []).join(" · "))}"><a href="${href}" data-nr-stop="1">${v}</a>${sub} ${relTags(c.rel)}</div>`;
    };
    const list = contactsOf(r, kind);
    return list.length ? list.slice(0, 4).map(one).join("") + (list.length > 4 ? `<div class="xs muted">+${list.length - 4} נוספים בכרטיס</div>` : "") : '<span class="xs muted">—</span>';
  }
  function fleetCell(r) {
    if (!r.fleet_level) return '<span class="xs muted">אין סימן לצי רכב</span>';
    const [l, cls] = FLEET_LV[r.fleet_level] || [r.fleet_level, "b-no"];
    const ev = (r.fleet_evidence || []).slice(0, 4).map((x) => `<div class="xs">${x.kind === "fact" ? '<span class="badge b-ok">עובדה</span>' : '<span class="badge b-no" title="סימן – לא ספירת רכבים">אינדיקציה</span>'}
      ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener" data-nr-stop="1">${esc(x.t)}</a>` : esc(x.t)} <span class="muted">– ${esc(x.src || "")}</span>${x.note ? ` <span class="badge b-est">${esc(x.note)}</span>` : ""}</div>`).join("");
    return `<div><span class="badge ${cls}">${l}</span>${r.fleet_min ? ` <b>${n(r.fleet_min)}+</b> <span class="xs muted">רכבים ידועים</span>` : ""}</div>${ev}`;
  }
  function peopleCell(r) {
    return (r.people || []).slice(0, 4).map((p) => `<div title="${esc(p.source || "")}">${p.cat ? `<span class="badge ${p.cat === "fleet" ? "b-ok" : p.cat === "ops" ? "b-blue" : "b-no"}">${ROLE_CAT[p.cat]}</span> ` : ""}${esc(p.name)} – ${esc(p.role || "")}
      ${p.phone ? ` · <a href="tel:${esc(String(p.phone).replace(/[^\d+]/g, ""))}" data-nr-stop="1">${esc(p.phone)}</a>` : ""}${p.email ? ` · <a href="mailto:${esc(p.email)}" data-nr-stop="1">${esc(p.email)}</a>` : ""}</div>`).join("") || "—";
  }
  function outreachView() {
    const o = ST.out, f = o.filters, su = o.summary, fl = (su && su.fleet) || {};
    const sumCard = !su ? `<div class="card card-b muted">${o.sumLoading ? "⏳ סופר את המוכנות לשיווק…" : ""}</div>` : `<div class="card"><div class="card-h"><h2>מוכנות לשיווק – מתוך המאגר הקיים<span class="h-bar"></span></h2><span class="spacer"></span>
        <span class="xs muted">עודכן ${when(su.at)}</span><button class="btn btn-sm" data-nr="osum">🔄</button></div>
      <div class="card-b" style="display:grid;gap:10px">
      <div class="grid g-kpi tiles">
        ${kpi("חברות עם פוטנציאל לצי רכב", n(fl.total), `${n(fl.usable)} עם טלפון או אימייל · ${n(fl.phone_email)} עם שניהם`, ` data-nr="ofleet" data-v="any" style="cursor:pointer"`)}
        ${kpi("ראיה מבוססת ל-5+ רכבים", n(fl.documented), `${n(fl.documented_usable)} עם פרט קשר · מאגר רשמי או מספר שהחברה מפרסמת`, ` data-nr="ofleet" data-v="documented" style="cursor:pointer"`)}
        ${kpi("סימנים חזקים לצי (ללא ספירה)", n(fl.strong), `${n(fl.strong_usable)} עם פרט קשר · גיוס נהגים, צי באתר, מפעיל מורשה, סיווג קבלני גבוה`, ` data-nr="ofleet" data-v="strong" style="cursor:pointer"`)}
        ${kpi("פוטנציאל – אינדיקציה בלבד", n(fl.possible), `${n(fl.possible_usable)} עם פרט קשר · ענף, גודל`)}
        ${kpi("עם איש קשר רלוונטי", n(fl.contact_any), `${n(fl.contact_fleet)} קצין רכב / מנהל צי · ${n(fl.contact_ops)} תפעול / לוגיסטיקה · ${n(fl.contact_owner)} בעלים / הנהלה`)}
      </div>
      <div class="grid g-kpi tiles">
        ${kpi("עסקים פעילים עם פרט קשר", n(su.with_contact), `${n(su.with_phone)} עם טלפון · ${n(su.with_email)} עם אימייל · ${n(su.with_phone_and_email)} עם שניהם`)}
        ${kpi("טלפון ממאגר רשמי", n(su.phone_official), `${n(su.phone_own_site)} עם טלפון שפורסם באתר החברה`)}
        ${kpi("פרט שנמצא בשני סוגי מקורות", n(su.verified_any), `${n(su.verified_phone)} טלפון · ${n(su.verified_email)} אימייל · לא בדיקה שהמספר פעיל`)}
      </div>
      <div class="tbl-wrap"><table><thead><tr><th>פלח</th><th>עם פרט קשר</th><th>עם טלפון</th><th>טלפון + אימייל</th><th>פרט בשני סוגי מקורות</th><th>עם בעלי תפקידים</th></tr></thead><tbody>
        ${SEGS.filter(([k]) => (su.segments || {})[k]).map(([k, l]) => { const x = su.segments[k]; return `<tr data-nr="oseg" data-v="${k}" style="cursor:pointer"><td class="co-name">${esc(l)}</td><td>${n(x.total)}</td><td>${n(x.phone)}</td><td>${n(x.phone_email)}</td><td>${n(x.verified)}</td><td>${n(x.people)}</td></tr>`; }).join("")}
      </tbody></table></div>
      <div class="xs muted">פוטנציאל הצי נקבע רק מראיות שנשמרו בכרטיס, וכל ראיה מסומנת "עובדה" או "אינדיקציה" עם המקור שלה. "ראיה ל-5+ רכבים" = מספר רכבים ממאגר רשמי, או מספר שהחברה עצמה מפרסמת באתרה.
        מוסכים וסוחרי רכב אינם נספרים כבעלי צי.</div></div></div>`;
    const sel = (k, opts, dflt) => `<select data-no-f="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(f[k] ?? dflt) === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    const filters = `<div class="card card-b" style="display:grid;gap:8px">
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
        <label class="xs">צי רכב ${sel("fleet", FLEETS, "")}</label>
        <label class="xs">רכבים ידועים לפחות <input data-no-f="fleet_min" value="${esc(f.fleet_min || "")}" inputmode="numeric" style="width:60px" placeholder="5"></label>
        <label class="xs">איש קשר ${sel("contact_role", ROLES_F, "")}</label>
        <label class="xs">פרטי קשר ${sel("level", LEVELS, "any")}</label>
        <label class="xs">פלח ${sel("segment", SEGS, "all")}</label>
      </div>
      <details ${(f.ind || []).length ? "open" : ""}><summary class="xs bold" style="cursor:pointer">🏷️ ענף ומקצוע ${(f.ind || []).length ? '<span class="badge b-blue">' + n(f.ind.length) + ' נבחרו</span>' : '<span class="muted">(כל הענפים – לחץ לבחירה, אפשר כמה יחד)</span>'}</summary>
        <div style="display:grid;gap:4px;margin-top:6px">${MAINS().map((m) => '<div class="row" style="flex-wrap:wrap;gap:4px"><label class="chip"><input type="checkbox" data-no-fm="ind" data-v="' + m.code + '" ' + ((f.ind || []).includes(m.code) ? "checked" : "") + '> <b>' + esc(m.label) + '</b></label>' +
          m.subs.map((t) => '<label class="chip xs"><input type="checkbox" data-no-fm="ind" data-v="' + t.code + '" ' + ((f.ind || []).includes(t.code) ? "checked" : "") + '> ' + esc(t.sub_label) + '</label>').join("") + '</div>').join("") || '<span class="xs muted">⏳ טוען ענפים…</span>'}</div></details>
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
        <label class="xs">אזור <input data-no-f="district" value="${esc(f.district || "")}" placeholder="למשל מרכז" style="width:100px"></label>
        <label class="xs">עיר <input data-no-f="city" value="${esc(f.city || "")}" style="width:100px"></label>
        <label class="xs">שם <input data-no-f="q" value="${esc(f.q || "")}" style="width:130px"></label>
        <label class="xs"><input type="checkbox" data-no-f="has_people" ${f.has_people ? "checked" : ""}> עם בעלי תפקידים</label>
        <label class="xs"><input type="checkbox" data-no-f="has_website" ${f.has_website ? "checked" : ""}> עם אתר</label>
        <label class="xs" title="למשל מפעילי אוטובוסים מהמאגר הרשמי שעדיין אין להם טלפון במאגר"><input type="checkbox" data-no-f="include_no_contact" ${f.include_no_contact ? "checked" : ""}> כולל חברות ללא פרטי קשר (להשלמה ידנית)</label>
        <label class="xs">מיון ${sel("sort", SORTS, "fleet")}</label>
        <button class="btn btn-sm btn-primary" data-nr="oapply">הצג רשימה</button>
        <button class="btn btn-sm" data-nr="oexport">⬇️ ייצוא הרשימה ל-CSV / אקסל</button>
      </div>
      <div class="xs muted">ליד כל טלפון ואימייל מופיע איפה הוא נמצא: <b>רשמי</b> (מאגר ממשלתי), <b>אתר החברה</b> (פורסם באתר שלה), <b>מקור אחר</b>. "2 סוגי מקורות" = אותו פרט נמצא גם במאגר רשמי וגם באתר / מקור אחר.
        זה לא אישור שהמספר פעיל – את זה יודעים רק אחרי שיחה. ממצאים שטרם אומתו מוצגים כמספר בלבד.
        מהמסך לא נשלחות הודעות. לפני דיוור באימייל, SMS או וואטסאפ יש לוודא עמידה בחוק הספאם (סעיף 30א לחוק התקשורת).</div></div>`;
    const rows = o.rows || [];
    const table = o.loading ? `<div class="card card-b muted">⏳ טוען רשימה…</div>` : o.error ? `<div class="card card-b"><span class="badge b-bad" style="white-space:normal">${esc(o.error)}</span></div>` :
      `<div class="card"><div class="card-h"><h2>רשימת עבודה – עמוד ${o.page + 1}<span class="h-bar"></span></h2><span class="spacer"></span>
        <button class="btn btn-sm" data-nr="opage" data-v="-1" ${o.page ? "" : "disabled"}>→ הקודם</button>
        <button class="btn btn-sm" data-nr="opage" data-v="1" ${rows.length === 50 ? "" : "disabled"}>הבא ←</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>חברה</th><th>פוטנציאל צי רכב וראיות</th><th>אנשי קשר רלוונטיים</th><th>טלפונים</th><th>אימיילים</th><th>תחום ועיר</th><th>אתר</th><th>טרם אומתו</th></tr></thead><tbody>
      ${rows.map((r) => `<tr>
        <td><div class="co-name" data-nr="biz" data-v="${r.id}" style="cursor:pointer">${esc(r.name)}</div>${mkBadge(r.id) ? `<div>${mkBadge(r.id)}</div>` : `<button class="btn btn-sm" data-nr="tomk1" data-v="${r.id}" style="margin:2px 0">📣 למרכז השיווק</button>`}<div class="xs muted">${r.reg_id ? "ח.פ. " + esc(r.reg_id) : esc(r.corp_type || "")}</div>
          <a class="xs" href="${esc(cardUrl(r.id))}" target="_blank" rel="noopener" data-nr-stop="1">🔗 קישור לכרטיס</a></td>
        <td style="max-width:340px;white-space:normal">${fleetCell(r)}</td>
        <td class="xs" style="max-width:260px;white-space:normal">${peopleCell(r)}</td>
        <td>${contactChips(r, "phone")}</td><td>${contactChips(r, "email")}</td>
        <td class="xs" style="max-width:200px;white-space:normal">${esc(r.activity || "—")}${indBadges(r.ind_codes)}<div class="muted">${esc(r.city || "")}${r.district ? " · " + esc(r.district) : ""}</div></td>
        <td class="xs">${r.website ? `<a href="${esc(r.website)}" target="_blank" rel="noopener" data-nr-stop="1">${esc(String(r.website).replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a>` : "—"}</td>
        <td class="xs">${r.pending_review ? `<span class="badge b-no">${n(r.pending_review)} ממצאים</span>` : "—"}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">אין חברות שתואמות את הסינון.</td></tr>`}
      </tbody></table></div></div>`;
    return sumCard + filters + table;
  }
  async function exportOutreach() {
    const f = ST.out.filters, cap = 50000, fleetSort = byFleet();
    ST.modal = { type: "export", title: "ייצוא רשימת עבודה", msg: "⏳ מכין קובץ…" }; rerender();
    try {
      const pick = (r, kind, test) => contactsOf(r, kind).filter((c) => test(c.rel || {})).map((c) => c.v + (c.sub === "mobile" ? " (נייד)" : c.sub === "branch" ? " (סניף)" : "")).join("; ");
      const rel = (r) => (r.people || []).filter((p) => p.cat);
      const cols = [["שם חברה", (r) => r.name], ["ח.פ.", (r) => r.reg_id],
        ["פוטנציאל צי רכב", (r) => (FLEET_LV[r.fleet_level] || ["אין סימן"])[0]], ["רכבים ידועים (לפחות)", (r) => r.fleet_min || ""],
        ["ראיות לצי – עובדות", (r) => (r.fleet_evidence || []).filter((x) => x.kind === "fact").map((x) => `${x.t} [${x.src || ""}]${x.url ? " " + x.url : ""}`).join(" | ")],
        ["ראיות לצי – אינדיקציות", (r) => (r.fleet_evidence || []).filter((x) => x.kind !== "fact").map((x) => `${x.t} [${x.src || ""}]${x.url ? " " + x.url : ""}`).join(" | ")],
        ["איש קשר רלוונטי", (r) => rel(r).map((p) => `${p.name} – ${p.role}${p.phone ? " · " + p.phone : ""}${p.email ? " · " + p.email : ""}`).join("; ")],
        ["סוג איש הקשר", (r) => [...new Set(rel(r).map((p) => ROLE_CAT[p.cat]))].join("; ")],
        ["טלפון ממאגר רשמי", (r) => pick(r, "phone", (x) => x.official)], ["טלפון מאתר החברה", (r) => pick(r, "phone", (x) => x.own_site && !x.official)],
        ["טלפון ממקור אחר בלבד", (r) => pick(r, "phone", (x) => !x.official && !x.own_site)],
        ["אימייל ממאגר רשמי", (r) => pick(r, "email", (x) => x.official)], ["אימייל מאתר החברה", (r) => pick(r, "email", (x) => x.own_site && !x.official)],
        ["אימייל ממקור אחר בלבד", (r) => pick(r, "email", (x) => !x.official && !x.own_site)],
        ["אתר", (r) => r.website], ["תחום פעילות", (r) => r.activity], ["ענף / תת־ענף", (r) => (r.ind_codes || []).map((c) => (TAX()[c] || {}).sub_label || (c === "unclassified" ? "לא מסווג" : c)).join("; ")], ["עיר", (r) => r.city], ["אזור", (r) => r.district],
        ["בעלי תפקידים נוספים", (r) => (r.people || []).filter((p) => !p.cat).map((p) => `${p.name} – ${p.role}`).join("; ")],
        ["ממצאים שטרם אומתו", (r) => r.pending_review || ""], ["קישור לכרטיס", (r) => cardUrl(r.id)]];
      const q = (v) => { const t = v == null ? "" : String(v); return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
      const lines = [cols.map((c) => c[0]).join(",")];
      let after = 0, got = 0;
      for (;;) {
        const rows = await rpc("nr_outreach_page", { p_filters: f, p_after: after, p_limit: 1000 });
        for (const r of rows) lines.push(cols.map(([, fn]) => q(fn(r))).join(","));
        got += rows.length; ST.modal.msg = `⏳ הוכנו ${n(got)} שורות…`; rerender();
        if (rows.length < 1000 || got >= cap) break;
        after = fleetSort ? got : rows[rows.length - 1].id;
      }
      const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `dalia-work-list-${f.fleet ? "fleet-" + f.fleet : f.segment || "all"}-${new Date().toISOString().slice(0, 10)}-${got}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      ST.modal.msg = `✅ יוצאו ${n(got)} חברות. טלפונים ואימיילים מופרדים לפי מקום הימצאם (רשמי / אתר החברה / אחר), וראיות הצי לפי עובדה / אינדיקציה.${got >= cap ? " (הגבלה של 50,000 שורות)" : ""}`;
    } catch (e) { ST.modal.msg = "⛔ " + e.message; }
    rerender();
  }

  // ── Dalia leads (live list) ──
  const LEAD_ST = [["new", "חדש"], ["in_progress", "בטיפול"], ["contacted", "יצרנו קשר"], ["follow_up", "מעקב"], ["closed", "נסגר"],
    ["meeting", "נקבעה פגישה"], ["quote", "הצעת מחיר"], ["won", "הפך ללקוח"], ["irrelevant", "לא רלוונטי"], ["review", "בבדיקה"]];
  const LEAD_ST_NAME = Object.fromEntries(LEAD_ST);
  async function loadLeads(silent) {
    const L = ST.leads;
    if (!silent) { L.loading = true; L.err = ""; rerender(); }
    try {
      const [d, s] = await Promise.all([rpc("nr_leads_page", { p_filters: L.f, p_offset: L.page * 50, p_limit: 50 }), rpc("nr_leads_stats")]);
      L.data = d; L.stats = s; L.at = Date.now();
    } catch (e) { if (!silent) L.err = e.message || String(e); }
    L.loading = false; rerender();
    // the list follows the cloud stream: refreshed every minute while it is on screen
    if (!ST.leadsTimer) ST.leadsTimer = setInterval(() => {
      if (S.view === "prospector" && S.tab === TAB && ST.sub === "leads" && !document.hidden && !ST.modal && !document.activeElement?.matches?.("[data-nl-f],[data-nl-status]")) loadLeads(true);
    }, 60000);
  }
  async function setLeadStatus(id, status) {
    try {
      const sb = await client();
      const r = await sb.from("prospect_leads").update({ status, updated_date: new Date().toLocaleDateString("he-IL"), updated_at: new Date().toISOString() }).eq("id", id).select("id");
      if (r.error) throw new Error(r.error.message);
      if (!r.data || !r.data.length) throw new Error("אין הרשאה לעדכן את הליד");
      const row = ((ST.leads.data && ST.leads.data.rows) || []).find((x) => x.id === id); if (row) row.status = status;
      toast(`הסטטוס עודכן: ${LEAD_ST_NAME[status] || status}`);
      rpc("nr_leads_stats").then((s) => { ST.leads.stats = s; rerender(); }).catch(() => {});
    } catch (e) { toast("הסטטוס לא נשמר: " + e.message); loadLeads(true); }
  }
  function readLeadFilters() {
    const f = {};
    document.querySelectorAll("[data-nl-f]").forEach((el) => { const k = el.getAttribute("data-nl-f"); if (el.type === "checkbox") { if (el.checked) f[k] = true; } else if (el.value.trim()) f[k] = el.value.trim(); });
    const ind = [...document.querySelectorAll("[data-nl-fm=ind]:checked")].map((el) => el.dataset.v);
    if (ind.length) f.ind = ind;
    return f;
  }
  // site quotes may still carry HTML entities ("&ndash;"); missing-field keys get the rules module's Hebrew labels
  const ent = (t) => String(t || "").replace(/&ndash;/g, "–").replace(/&mdash;/g, "—").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  const missLabel = (k) => (window.OPQualify && OPQualify.missingLabel ? OPQualify.missingLabel(k) : k);
  function leadsView() {
    const L = ST.leads, f = L.f, s = L.stats || {}, d = L.data || { total: 0, rows: [] };
    const tier = (t) => t === "A" ? '<span class="badge b-ok" title="7 החוקים: חברה פעילה עם ח.פ., צי 5+, טלפון ואימייל עסקיים, אימות טלפון ב-2 סוגי מקורות">A – מוכן לפנייה</span>' : t === "B" ? '<span class="badge b-est" title="7 החוקים: בסיס צי / עובדים מבוסס, חסר פרט קשר או מקור אימות שני">B – להשלמה</span>' : '<span class="badge b-no">' + esc(t || "") + '</span>';
    const head = `<div class="card"><div class="card-h"><h2>🚚 לידים לדליה – זרם אוטומטי מהמאגר הארצי<span class="h-bar"></span></h2><span class="spacer"></span>
        <span class="xs muted">${L.at ? "עודכן " + new Date(L.at).toLocaleTimeString("he-IL") + " · מתעדכן כל דקה" : ""}</span><button class="btn btn-sm" data-nr="lrefresh">🔄</button></div>
      <div class="card-b" style="display:grid;gap:10px"><div class="grid g-kpi tiles">
        ${kpi("לידים בזרם", n(s.total), `${n(s.today)} היום · ${n(s.last_hour)} בשעה האחרונה`)}
        ${kpi("A – מוכנים לפנייה", n((s.by_tier || {}).A), "טלפון ואימייל עסקיים, אימות ב-2 סוגי מקורות, צי 5+", ` data-nr="ltier" data-v="A" style="cursor:pointer"`)}
        ${kpi("B – להשלמת פרטים", n((s.by_tier || {}).B), "בסיס צי מבוסס, חסר פרט קשר או מקור שני", ` data-nr="ltier" data-v="B" style="cursor:pointer"`)}
        ${kpi("בטיפול / מעקב", `${n((s.by_status || {}).in_progress)} / ${n((s.by_status || {}).follow_up)}`, `${n((s.by_status || {}).contacted)} יצרנו קשר · ${n((s.by_status || {}).closed)} נסגרו`)}
        ${kpi("חברות שנבדקו ב-7 החוקים", n(s.evaluated), `${n(s.waiting)} ממתינות לבדיקה · בדיקה אחרונה ${when(s.last_run)}`)}
      </div>
      <div class="xs muted">האיסוף הרחב ממשיך בלי סינון. כאן בלבד מופעלים 7 חוקי הסינון הקיימים של דליה (אותו קוד שהתוכנה משתמשת בו), על חברות עם סימני צי רכב.
        נכנסות רק חברות בדירוג A או B עם צי משוער של 5 רכבים ומעלה. ליד קיים לא נדרס, ואין כפילויות (ח.פ. ייחודי). הלידים מופיעים גם במסך הלידים הראשי. לא נשלחות הודעות.</div></div></div>`;
    const sel = (k, opts, all) => `<select data-nl-f="${k}"><option value="">${all}</option>${opts.map(([v, l]) => `<option value="${v}" ${f[k] === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    const filters = `<div class="card card-b" style="display:grid;gap:8px"><div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
        <label class="xs">סטטוס טיפול ${sel("status", LEAD_ST, "כל הסטטוסים")}</label>
        <label class="xs">דירוג ${sel("tier", [["A", "A – מוכן לפנייה"], ["B", "B – להשלמה"]], "A + B")}</label>
        <label class="xs">אזור <input data-nl-f="district" value="${esc(f.district || "")}" style="width:100px" placeholder="מרכז"></label>
        <label class="xs">שם <input data-nl-f="q" value="${esc(f.q || "")}" style="width:130px"></label>
        <label class="xs"><input type="checkbox" data-nl-f="reachable" ${f.reachable ? "checked" : ""}> עם טלפון או אימייל</label>
        <label class="xs"><input type="checkbox" data-nl-f="fleet_contact" ${f.fleet_contact ? "checked" : ""}> עם איש קשר רלוונטי</label>
        <button class="btn btn-sm btn-primary" data-nr="lapply">הצג</button></div>
      <details ${(f.ind || []).length ? "open" : ""}><summary class="xs bold" style="cursor:pointer">🏷️ ענף ${(f.ind || []).length ? '<span class="badge b-blue">' + n(f.ind.length) + ' נבחרו</span>' : '<span class="muted">(כל הענפים)</span>'}</summary>
        <div class="row" style="flex-wrap:wrap;gap:4px;margin-top:6px">${MAINS().map((m) => '<label class="chip"><input type="checkbox" data-nl-fm="ind" data-v="' + m.code + '" ' + ((f.ind || []).includes(m.code) ? "checked" : "") + '> ' + esc(m.label) + '</label>').join("")}</div></details></div>`;
    const phones = (r) => { const list = (r.multi_phones || []).length ? r.multi_phones : (r.phone ? [{ v: r.phone }] : []);
      return list.slice(0, 3).map((p) => `<div class="xs"><a href="tel:${esc(String(p.v || "").replace(/[^\d+]/g, ""))}" data-nr-stop="1">${esc(p.v || "")}</a>${p.sub === "mobile" ? " (נייד)" : ""} ${(p.groups || []).map((g) => `<span class="badge ${/^מאגר רשמי/.test(g) ? "b-ok" : /^אתר החברה/.test(g) ? "b-blue" : "b-no"}" title="${esc(g)}">${esc(/^מאגר רשמי/.test(g) ? "רשמי" : /^אתר החברה/.test(g) ? "אתר החברה" : "מקור אחר")}</span>`).join(" ")}</div>`).join("") || '<span class="xs muted">—</span>'; };
    const mails = (r) => { const list = (r.multi_mails || []).length ? r.multi_mails : (r.email ? [{ v: r.email }] : []);
      return list.slice(0, 2).map((m) => `<div class="xs"><a href="mailto:${esc(m.v || "")}" data-nr-stop="1">${esc(m.v || "")}</a></div>`).join("") || '<span class="xs muted">—</span>'; };
    const fleet = (r) => { const fe = r.fleet_estimate || {}; const ev = (r.fleet_evidence || []).slice(0, 3);
      return `<div class="xs"><b>${esc(fe.fleet_size_display || (r.fleet_size ? r.fleet_size + " רכבים" : "—"))}</b></div><div class="xs muted">${esc(ent(fe.fleet_method_label || ""))}</div>` +
        ev.map((x) => `<div class="xs">${x.kind === "fact" ? '<span class="badge b-ok">עובדה</span>' : '<span class="badge b-no">אינדיקציה</span>'} ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener" data-nr-stop="1">${esc(ent(x.t))}</a>` : esc(ent(x.t))}</div>`).join(""); };
    const rows = d.rows || [];
    const table = L.loading && !L.data ? `<div class="card card-b muted">⏳ טוען לידים…</div>` : L.err ? `<div class="card card-b"><span class="badge b-bad" style="white-space:normal">${esc(L.err)}</span></div>` :
      `<div class="card"><div class="card-h"><h2>${n(d.total)} לידים<span class="h-bar"></span></h2><span class="spacer"></span>
        <button class="btn btn-sm" data-nr="lpage" data-v="-1" ${L.page ? "" : "disabled"}>→ הקודם</button><span class="xs muted">עמוד ${L.page + 1}</span>
        <button class="btn btn-sm" data-nr="lpage" data-v="1" ${rows.length === 50 ? "" : "disabled"}>הבא ←</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>חברה</th><th>סטטוס טיפול</th><th>למה מתאימה לדליה</th><th>רכבים, נהגים ולוגיסטיקה</th><th>איש קשר</th><th>טלפונים (מקור)</th><th>אימייל</th><th>קישורים</th></tr></thead><tbody>
      ${rows.map((r) => `<tr>
        <td style="min-width:170px"><div class="co-name"${r.registry_id ? ` data-nr="biz" data-v="${r.registry_id}" style="cursor:pointer"` : ""}>${esc(r.company_name)}</div><div class="xs muted">ח.פ. ${esc(r.company_hp || "")} · ${esc(r.city || "")}${r.region ? " · " + esc(r.region) : ""}</div>${indBadges(r.ind_codes)}</td>
        <td><select data-nl-status="${esc(r.id)}" class="input" style="height:30px;width:auto">${LEAD_ST.map(([v, l]) => `<option value="${v}" ${r.status === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select><div style="margin-top:4px">${tier(r.tier)}</div></td>
        <td class="xs" style="max-width:300px;white-space:normal">${esc(ent(String(r.lead_reason || "").split(" ראיות:")[0]))}${(r.missing_fields || []).length ? `<div class="muted">${esc(r.missing_fields.slice(0, 4).map(missLabel).join(" · "))}</div>` : ""}<div class="muted">אימות: ${esc(r.verification_status === "verified" ? "מאומת" : r.verification_status === "partial" ? "חלקי" : "לא מאומת")}</div></td>
        <td style="max-width:280px;white-space:normal">${fleet(r)}</td>
        <td class="xs" style="max-width:200px;white-space:normal">${r.contact_name ? `<b>${esc(r.contact_name)}</b><div>${esc(r.contact_role || "")}</div>${r.contact_phone ? `<div><a href="tel:${esc(String(r.contact_phone).replace(/[^\d+]/g, ""))}" data-nr-stop="1">${esc(r.contact_phone)}</a></div>` : ""}${r.contact_email ? `<div><a href="mailto:${esc(r.contact_email)}" data-nr-stop="1">${esc(r.contact_email)}</a></div>` : ""}` : '<span class="muted">טרם נמצא</span>'}</td>
        <td>${phones(r)}</td><td>${mails(r)}</td>
        <td>${linkIcons({ website: r.website, socials: r.socials || {}, whatsapp: r.public_whatsapp })}${r.registry_id ? `<div><a class="xs" href="${esc(cardUrl(r.registry_id))}" target="_blank" rel="noopener" data-nr-stop="1">🔗 כרטיס החברה</a></div>` : ""}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">${L.loading ? "⏳ טוען…" : "אין לידים בתנאים האלה עדיין – הזרם ממשיך לבדוק חברות כל 2 דקות."}</td></tr>`}
      </tbody></table></div></div>`;
    return head + filters + table;
  }

  // ── engine control & alerts ──
  async function loadAlerts() {
    try { ST.alerts = (await rpc("nr_open_alerts")) || []; } catch (e) { /* banner stays as it was */ }
    rerender();
  }
  async function loadControl() {
    ST.ctlLoading = true; ST.ctlErr = ""; rerender();
    try { ST.ctl = await rpc("nr_control_panel"); ST.alerts = (ST.ctl.alerts || []).filter((a) => !a.resolved_at); ST.alertsAt = Date.now(); }
    catch (e) { ST.ctlErr = e.message || String(e); }
    ST.ctlLoading = false; rerender();
  }
  async function setEngine(engine, on) {
    if (engine === "all" && !on && !window.confirm("עצירת חירום: כל מנועי OpenProspector יפסיקו להתחיל ריצות חדשות (ריצה שכבר רצה תסתיים). הנתונים וההתקדמות נשמרים. להמשיך?")) return;
    try {
      await rpc("nr_set_engine", { p_engine: engine, p_on: on });
      toast(engine === "all" ? (on ? "כל המנועים הופעלו מחדש – ממשיכים מאותה נקודה" : "עצירת חירום הופעלה – לא יתחילו ריצות חדשות") : (on ? "המנוע הופעל – ממשיך מאותה נקודה" : "המנוע ייעצר אחרי הריצה הנוכחית"));
    } catch (e) { toast("השינוי לא נשמר: " + e.message); }
    loadControl();
  }
  function alertBanner() {
    const a = ST.alerts || [];
    if (!a.length) return "";
    return `<div class="card" style="border:2px solid var(--bad);background:var(--bad-bg)"><div class="card-b" style="display:grid;gap:4px">
      <div class="row"><b style="color:var(--bad)">🚨 ${n(a.length)} התרעות פתוחות במנועי האיסוף</b><span class="spacer"></span><button class="btn btn-sm" data-nr="sub" data-v="control">למסך השליטה</button></div>
      ${a.slice(0, 4).map((x) => `<div class="xs"><span class="badge ${x.level === "critical" ? "b-bad" : "b-est"}">${x.level === "critical" ? "קריטי" : "אזהרה"}</span> ${esc(x.title)} <span class="muted">· ${esc(x.detail || "")} · מאז ${when(x.since || x.first_seen)}</span></div>`).join("")}
    </div></div>`;
  }
  function controlView() {
    const c = ST.ctl;
    if (ST.ctlErr) return `<div class="card card-b"><span class="badge b-bad" style="white-space:normal">${esc(ST.ctlErr)}</span></div>`;
    if (!c) return `<div class="card card-b muted">⏳ טוען את מצב המנועים…</div>`;
    const can = !!c.can_control;
    const state = (e) => {
      if (c.emergency_stop) return ["⛔ עצירת חירום", "b-bad"];
      if (!e.enabled) return ["⏸ כבוי (מתג המנוע)", "b-no"];
      if (!e.legacy_on) return ["⏸ כבוי (מתג איסוף / העשרה כללי)", "b-no"];
      const stale = e.has_work && (!e.last_ok || Date.now() - Date.parse(e.last_ok) > parseInterval(e.stale_after));
      if (stale) return ["🚨 תקוע – אין הצלחה", "b-bad"];
      if (!e.has_work) return ["✓ פעיל – אין עבודה ממתינה", "b-ok"];
      return ["✓ פעיל", "b-ok"];
    };
    const pct = c.max_db_mb ? Math.round((100 * c.db_mb) / c.max_db_mb) : 0;
    const head = `<div class="card"><div class="card-h"><h2>🎛️ מסך שליטה – כל המנועים<span class="h-bar"></span></h2><span class="spacer"></span>
        <span class="xs muted">עודכן ${when(c.at)} · כלב השמירה בדק לאחרונה ${when(c.watchdog_at)}</span><button class="btn btn-sm" data-nr="ctlrefresh">🔄</button>
        ${can ? (c.emergency_stop ? `<button class="btn btn-sm btn-primary" data-nr="engine" data-v="all" data-on="1">▶ הפעל את כל המנועים</button>`
                                  : `<button class="btn btn-sm" style="background:var(--bad);color:#fff" data-nr="engine" data-v="all" data-on="0">⛔ עצור הכול (חירום)</button>`) : ""}</div>
      <div class="card-b" style="display:grid;gap:10px"><div class="grid g-kpi tiles">
        ${kpi("נפח מסד הנתונים", `${n(c.db_mb)} MB`, `${pct}% מתקרת האיסוף (${n(c.max_db_mb)} MB) · הדיסק הכלול: 8GB`)}
        ${kpi("קריאות שרת בשעה האחרונה", n(c.edge_calls_hour), `${n(c.edge_cut_hour)} נקטעו במגבלת המעבד · ${n(c.edge_err_hour)} שגיאות אחרות`)}
        ${kpi("התרעות פתוחות", n((c.alerts || []).filter((a) => !a.resolved_at).length), "מנוע עם עבודה בלי הצלחה 15 דק', נפח, קטיעות")}
      </div>
      <div class="xs muted">עצירה: ריצה שכבר התחילה מסתיימת, ושום ריצה חדשה לא מתחילה (תוך 1–2 דקות). ההתקדמות נשמרת, והפעלה מחדש ממשיכה מאותה נקודה.
        כפתורי ההפעלה והעצירה זמינים רק למשתמש עם הרשאת ניהול איסוף.${can ? "" : " <b>למשתמש הנוכחי אין הרשאת ניהול – תצוגה בלבד.</b>"}</div></div></div>`;
    const table = `<div class="card"><div class="tbl-wrap"><table><thead><tr><th>מנוע</th><th>מצב</th><th>הצלחה אחרונה</th><th>שגיאה אחרונה</th><th>עבודה ממתינה</th><th></th></tr></thead><tbody>
      ${(c.engines || []).map((e) => { const [l, cls] = state(e); return `<tr>
        <td><div class="co-name">${esc(e.label)}</div><div class="xs muted" style="max-width:360px;white-space:normal">${esc(e.covers)}</div></td>
        <td><span class="badge ${cls}">${l}</span></td>
        <td class="xs">${e.last_ok ? when(e.last_ok) : "—"}</td>
        <td class="xs" style="max-width:280px;white-space:normal">${e.last_err ? `${when(e.last_err)}<div class="muted">${esc(String(e.last_err_msg || "").slice(0, 140))}</div>` : "—"}</td>
        <td class="xs">${e.has_work ? "כן" : "לא"}</td>
        <td>${can && !c.emergency_stop ? (e.enabled ? `<button class="btn btn-sm" data-nr="engine" data-v="${esc(e.engine)}" data-on="0">⏸ עצור</button>` : `<button class="btn btn-sm btn-primary" data-nr="engine" data-v="${esc(e.engine)}" data-on="1">▶ הפעל</button>`) : ""}</td></tr>`; }).join("")}
      </tbody></table></div></div>`;
    const al = (c.alerts || []);
    const alerts = `<div class="card"><div class="card-h"><h2>התרעות – פתוחות ומ-24 השעות האחרונות<span class="h-bar"></span></h2></div><div class="card-b" style="display:grid;gap:4px">
      ${al.map((a) => `<div class="xs">${a.resolved_at ? '<span class="badge b-ok">נפתרה</span>' : `<span class="badge ${a.level === "critical" ? "b-bad" : "b-est"}">${a.level === "critical" ? "קריטי" : "אזהרה"}</span>`}
        <b>${esc(a.title)}</b> <span class="muted">· ${esc(a.detail || "")} · נפתחה ${when(a.first_seen)}${a.resolved_at ? " · נפתרה " + when(a.resolved_at) : ""}</span></div>`).join("") || '<div class="xs muted">אין התרעות.</div>'}
      <div class="xs muted">כלב השמירה בודק כל 5 דקות. התרעה מוצגת כאן ובראש כל מסכי המאגר, ונרשמת ביומן האירועים. אין שליחת אימייל או הודעה (תדרוש שירות שליחה חיצוני).</div></div></div>`;
    return head + table + alerts;
  }
  // "00:15:00" / "1 day 06:00:00" → milliseconds
  function parseInterval(s) {
    const t = String(s || "");
    const d = t.match(/(\d+) days?/), h = t.match(/(\d+):(\d+):(\d+)/);
    if (!d && !h) return 15 * 60000;
    return ((Number(d ? d[1] : 0) * 24 + Number(h ? h[1] : 0)) * 3600 + Number(h ? h[2] : 0) * 60 + Number(h ? h[3] : 0)) * 1000;
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
      const cols = [["name", "שם"], ["reg_id", "ח.פ."], ["status", "סטטוס"], ["corp_type", "סוג התאגדות"], ["founded_year", "שנת הקמה"], ["main_activity", "תחום עיסוק"], ["sector", "ענף"], ["industries", "ענף / תת־ענף (סיווג)"], ["fleet_level", "פוטנציאל צי"], ["fleet_min", "רכבים ידועים"],
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
    // text / number / date filters apply as soon as the field is left (or Enter) – every choice updates the table at once
    if (el.matches("[data-nr-f]")) { readFilterInput(el); applyFilters(); return; }
    if (el.matches("select[data-nl-status]")) { setLeadStatus(el.getAttribute("data-nl-status"), el.value); return; }
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
    const el = e.target.closest("[data-nr],[data-nr-filter],[data-nr-enfilter]");
    if (!el) return;
    if (stop && el.getAttribute("data-nr") === "close" && !el.matches("button")) return;
    if (e.target.closest("a[href]")) return;
    e.preventDefault(); e.stopPropagation();
    if (el.hasAttribute("data-nr-enfilter")) {
      const fk = el.getAttribute("data-nr-enfilter");
      ST.sub = "browse"; ST.filters = fk === "fb_yes" ? { hide_archived: true, fb: "yes" } : { hide_archived: true, [fk]: true };
      ST.sort = "important"; ST.page = 1; ST.openGroups = Object.assign(ST.openGroups || {}, { enr: true }); persist(); browse(); return;
    }
    if (el.hasAttribute("data-nr-filter")) {
      const k = el.getAttribute("data-nr-filter");
      ST.sub = "browse";
      if (k === "employees") ST.filters.emp_bands = BANDS.filter((b) => b !== "unknown"); else ST.filters[k] = "yes";
      ST.page = 1; persist(); browse(); return;
    }
    const act = el.getAttribute("data-nr"), v = el.getAttribute("data-v");
    if (act === "sub") { ST.sub = v; persist(); rerender(); if (v === "browse" && !ST.result) browse(); if (v === "enrich") loadReport(); }
    else if (act === "apply") applyFilters();
    else if (act === "clear") { ST.filters = { hide_archived: true }; ST.page = 1; ST.selected.clear(); ST.selectAllMatching = false; persist(); browse(); }
    else if (act === "page") { ST.page = Math.max(1, Number(v)); browse(); window.scrollTo(0, 0); }
    else if (act === "selall") { ST.selectAllMatching = true; rerender(); }
    else if (act === "selnone") { ST.selectAllMatching = false; ST.selected.clear(); rerender(); }
    else if (act === "markset") setMark(v);
    else if (act === "markone") setMark(v, [Number(el.dataset.id)]);
    else if (act === "togroup") { ST.modal = { type: "group", title: "הוספה לקבוצת עבודה" }; rerender(); }
    else if (act === "groupadd") addToGroup(v);
    else if (act === "tomk") openMk(null);
    else if (act === "tomk1") openMk([Number(v)]);
    else if (act === "mkauth") mkAuth();
    else if (act === "mkgo") mkGo();
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
    else if (act === "indpick") {
      const isMain = MAINS().some((m) => m.code === v);
      if (isMain && !(ST.indOpen || {})[v] && e.target.closest("td") && e.target.closest("td").cellIndex === 0) { ST.indOpen = Object.assign({}, ST.indOpen, { [v]: true }); rerender(); return; }
      ST.filters = Object.assign({}, ST.filters, { ind: [v] }); ST.page = 1; persist(); browse(); window.scrollTo(0, 0);
    }
    else if (act === "oapply") { ST.out.filters = readOutFilters(); ST.out.afters = [0]; ST.out.page = 0; loadOutreach(); }
    else if (act === "ofleet") { ST.out.filters = Object.assign({}, ST.out.filters, { fleet: v, sort: "fleet" }); ST.out.afters = [0]; ST.out.page = 0; loadOutreach(); }
    else if (act === "oseg") { ST.out.filters = Object.assign({}, ST.out.filters, { segment: v }); ST.out.afters = [0]; ST.out.page = 0; loadOutreach(); }
    else if (act === "opage") { const d = Number(v); if (d > 0 && ST.out.rows && ST.out.rows.length === 50) { ST.out.afters[ST.out.page + 1] = byFleet() ? (ST.out.page + 1) * 50 : ST.out.rows[ST.out.rows.length - 1].id; ST.out.page++; } else if (d < 0 && ST.out.page > 0) ST.out.page--; loadOutreach(); window.scrollTo(0, 0); }
    else if (act === "oexport") exportOutreach();
    else if (act === "lapply") { ST.leads.f = readLeadFilters(); ST.leads.page = 0; loadLeads(); }
    else if (act === "lrefresh") loadLeads();
    else if (act === "ctlrefresh") loadControl();
    else if (act === "engine") setEngine(v, el.dataset.on === "1");
    else if (act === "ltier") { ST.leads.f = Object.assign({}, ST.leads.f, { tier: v }); ST.leads.page = 0; loadLeads(); }
    else if (act === "lpage") { ST.leads.page = Math.max(0, ST.leads.page + Number(v)); loadLeads(); window.scrollTo(0, 0); }
    else if (act === "osum") loadOutreachSummary();
    else if (act === "close") { ST.modal = null; rerender(); }
    else if (act === "enrichrefresh") loadReport();
    else if (act === "watch") setWatch(el.dataset.id, v);
    else if (act === "enrichrun") rpc("nr_set_enrich_running", { p_running: v === "1" }).then(() => { toast(v === "1" ? "ההעשרה הופעלה – השרת ממשיך מנקודת ההתקדמות" : "ההעשרה תיעצר אחרי המנה הנוכחית"); loadReport(); }).catch((er) => toast(er.message));
    else if (act === "revok") reviewDecision(el.dataset.id, el.dataset.b, true);
    else if (act === "revno") reviewDecision(el.dataset.id, null, false);
    else if (act === "revpage") { ST.reviewPage = Math.max(0, Number(v)); loadReport(); }
  }, true);
  document.addEventListener("keydown", (e) => {
    if (!(S.view === "prospector" && S.tab === TAB)) return;
    if (e.key === "Enter" && e.target && e.target.matches && e.target.matches("[data-nr-f]")) { e.preventDefault(); applyFilters(); }
    if (e.key === "Enter" && e.target && e.target.matches && e.target.matches("[data-no-f]")) { e.preventDefault(); ST.out.filters = readOutFilters(); ST.out.afters = [0]; ST.out.page = 0; loadOutreach(); }
    if (e.key === "Escape" && ST.modal) { ST.modal = null; rerender(); }
  });

  if (typeof renderTabs === "function" && S.view === "prospector") renderTabs();
})();
