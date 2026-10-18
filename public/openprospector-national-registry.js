/* OpenProspector – "מאגר עסקים ארצי — איסוף נתונים" (Claude, 2026-10-18, STAGING)
 * מסך ניהול לאיסוף הארצי הרחב (ללא 7 חוקי הסינון). האיסוף עצמו רץ בשרת (pg_cron → national-registry-collector),
 * המסך רק מציג סטטיסטיקות אמיתיות מ-Supabase, מפעיל/עוצר, ומציג ראיות לכל עסק ולכל מקור.
 * כל קריאה עוברת ב-session של משתמש מחובר (RLS + בדיקת תפקיד בפונקציות nr_*).
 */
(function () {
  "use strict";
  if (typeof TABS === "undefined" || typeof V === "undefined") return;

  const TAB = "national";
  if (!TABS.some(([k]) => k === TAB)) {
    const at = TABS.findIndex(([k]) => k === "search");
    TABS.splice(at + 1, 0, [TAB, "מאגר עסקים ארצי"]);
  }

  const ST = {
    loading: false, error: "", stats: null, sources: [], loadedAt: 0,
    srcFilter: "all", q: "", filter: "all", results: null, searching: false,
    modal: null, timer: null, busy: false,
  };
  const STATUS = {
    pending: ["ממתין", "b-no"], collecting: ["אוסף", "b-blue"], completed: ["הושלם", "b-ok"], partial: ["חלקי", "b-est"],
    blocked: ["חסום", "b-bad"], unsupported: ["לא נתמך", "b-no"], error: ["שגיאה", "b-bad"],
  };
  const KIND = { ckan: "API מידע פתוח (CKAN)", arcgis: "GIS עירוני (ArcGIS)", overpass: "OpenStreetMap", fleet_ckan: "צי רכב (API)", website: "אתרי עסקים", alias: "כפול למקור אחר", discovery: "גילוי מקורות", discovered: "התגלה – טרם מופה", manual: "ידני", paid: "בתשלום / מנוי", blocked: "חסום" };
  const MATCH = { created: "נוצר מרשומה זו", reg_id: "התאמה לפי ח.פ./מזהה רשמי", "name+city": "שם זהה + אותה עיר", name_unique: "שם זהה ויחיד במאגר", business_website: "אתר העסק עצמו" };
  const n = (x) => Number(x || 0).toLocaleString("he-IL");
  const catalog = () => (Array.isArray(window.ALL_130_SOURCES) ? window.ALL_130_SOURCES : []);

  async function client() {
    const sess = (typeof userSession === "function") ? await userSession() : null;
    if (!sess || !sess.accessToken || !window.supabase) throw new Error("נדרשת התחברות לדליה (משתמש מנהל) כדי לצפות במאגר");
    return window.supabase.createClient(SUPABASE_STAGING_URL, SUPABASE_STAGING_ANON, {
      global: { headers: { Authorization: "Bearer " + sess.accessToken } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  const rerender = () => { if (S.view === "prospector" && S.tab === TAB) { const v = document.querySelector("#view"); if (v) v.innerHTML = V[TAB](); } };

  async function load(force) {
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

  function autoRefresh() {
    clearInterval(ST.timer);
    ST.timer = setInterval(() => {
      if (S.view === "prospector" && S.tab === TAB && !document.hidden && !ST.modal) load(true);
      else if (!(S.view === "prospector" && S.tab === TAB)) clearInterval(ST.timer), ST.timer = null;
    }, 20000);
  }

  const reasonOf = (s) => s.status_reason || (catalog().find((c) => String(c.id) === String(s.catalog_id)) || {}).blockReason || "";
  const dur = (ms) => { const sec = Math.round(Number(ms || 0) / 1000); return sec < 60 ? sec + " שנ׳" : sec < 3600 ? Math.round(sec / 60) + " דק׳" : (sec / 3600).toFixed(1) + " שע׳"; };
  const when = (t) => (t ? new Date(t).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" }) : "—");
  const badge = (status) => { const [l, c] = STATUS[status] || [status, "b-no"]; return `<span class="badge ${c}">${l}</span>`; };

  function kpi(label, value, sub, extra) {
    return `<div class="card kpi"${extra || ""}><div class="l">${label}</div><div class="v num">${value}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;
  }

  V[TAB] = () => {
    if (!ST.stats && !ST.loading && !ST.error) setTimeout(() => load(true), 0);
    if (!ST.timer) autoRefresh();
    const s = ST.stats;
    const ctl = (s && s.control) || {};
    const target = ctl.target || 100000;
    const total = s ? s.businesses : 0;
    const pct = Math.min(100, (total / target) * 100);
    const byStatus = (s && s.sources_by_status) || {};
    const cur = ST.sources.find((x) => x.key === ctl.current_source);
    const head = `<div class="card">
      <div class="card-h">
        <h2>מאגר עסקים ארצי — איסוף נתונים<span class="h-bar"></span></h2>
        <span class="badge b-est">ללא 7 חוקי הסינון – שלב איסוף רחב</span>
        <span class="badge b-ok">STAGING</span>
        <span class="spacer"></span>
        ${ctl.running ? `<span class="badge b-blue">● האיסוף פועל בשרת</span>` : `<span class="badge b-no">⏸ האיסוף עצור</span>`}
        <button class="btn btn-sm btn-primary" data-nr="start" ${ctl.running || ST.busy ? "disabled" : ""}>${(s && s.businesses) ? "▶ המשך איסוף" : "▶ התחל איסוף"}</button>
        <button class="btn btn-sm" data-nr="stop" ${!ctl.running || ST.busy ? "disabled" : ""}>⏸ עצור</button>
        <button class="btn btn-sm" data-nr="refresh">${ST.loading ? "⏳" : "🔄"} רענן סטטוס</button>
      </div>
      <div class="card-b" style="display:grid;gap:12px">
        ${ST.error ? `<div class="badge b-bad" style="white-space:normal">${esc(ST.error)}</div>` : ""}
        <div class="row" style="justify-content:space-between">
          <div><b class="num">${n(total)}</b> עסקים ייחודיים מתוך יעד <b class="num">${n(target)}</b>
            ${total >= target ? `<span class="badge b-ok">היעד הושג במאגר</span>` : `<span class="xs muted">(${pct.toFixed(1)}%)</span>`}</div>
          <div class="xs muted">האיסוף רץ בשרת כל 2 דקות ושומר נקודת התקדמות אחרי כל מנה – ממשיך גם כשהמסך סגור${s ? ` · עודכן ${when(s.generated_at)}` : ""}</div>
        </div>
        <div class="bar" title="${pct.toFixed(1)}%"><i style="width:${pct}%"></i></div>
        <div class="row xs muted">
          <span>מקור נוכחי: <b>${cur ? esc(cur.name) : ctl.running ? "בין מנות" : "—"}</b></span>
          ${cur && cur.total_records ? `<span class="num">(${n(cur.cursor)} / ${n(cur.total_records)} רשומות)</span>` : ""}
          <span>· קצב בשעה האחרונה: <b class="num">${n(s && s.rate_last_hour)}</b> עסקים חדשים, <b class="num">${n(s && s.records_last_hour)}</b> רשומות נקראו</span>
          <span>· נקודות בקרה שהושגו: ${(ctl.checkpoints_done || []).length ? (ctl.checkpoints_done || []).map((c) => `<span class="chip num">${n(c)}</span>`).join(" ") : "—"}</span>
        </div>
      </div>
    </div>`;

    const tiles = s ? `<div class="grid g-kpi tiles">
      ${kpi("עסקים ייחודיים", n(s.businesses), `${n(s.with_reg_id)} עם ח.פ./מזהה רשמי · ${n(s.active)} פעילים`)}
      ${kpi("עסקים עם טלפון", n(s.with_phone), `${n(s.phones)} מספרים במאגר`, ` data-nr-filter="phone" style="cursor:pointer"`)}
      ${kpi("עסקים עם אימייל", n(s.with_email), `${n(s.emails)} כתובות`, ` data-nr-filter="email" style="cursor:pointer"`)}
      ${kpi("עסקים עם אתר", n(s.with_website), `${n(s.with_social)} עם רשת חברתית`, ` data-nr-filter="website" style="cursor:pointer"`)}
      ${kpi("עסקים עם אנשי קשר", n(s.with_people), `${n(s.people)} אנשי קשר עסקיים`)}
      ${kpi("עסקים עם מידע על צי רכב", n(s.with_fleet), "רק כשיש רשומת מקור", ` data-nr-filter="fleet" style="cursor:pointer"`)}
      ${kpi("רשומות כפולות שמוזגו", n(s.merged_records), `${n(s.multi_source)} עסקים ממקורות מרובים`, ` data-nr-filter="multi" style="cursor:pointer"`)}
      ${kpi("פרטי קשר מאומתים / לא מאומתים", `${n(s.contact_points_verified)} / ${n(s.contact_points_unverified)}`, "מאומת = אותו פרט מ-2 מקורות עצמאיים")}
      ${kpi("מקורות שהושלמו", n(byStatus.completed), `${n(byStatus.collecting)} בטיפול · ${n(byStatus.pending)} ממתינים`)}
      ${kpi("חסומים / לא נתמכים / שגיאה", `${n(byStatus.blocked)} / ${n(byStatus.unsupported)} / ${n(byStatus.error)}`, "מתועדים עם הסיבה – לא סומנו כהושלמו")}
      ${kpi("ראיות מתועדות", n(s.evidence), `${n(s.conflicts)} עסקים עם סתירה בין מקורות`)}
      ${kpi("אחסון", `${n(s.registry_mb)} MB`, `מסד הנתונים כולו ${n(s.db_mb)} MB · תקרה ${n(ctl.max_db_mb)} MB`)}
    </div>` : ST.loading ? `<div class="card card-b muted">⏳ טוען נתונים מ-Supabase STAGING…</div>` : "";

    return `<div style="display:grid;gap:18px">${head}${tiles}${sourcesCard()}${searchCard()}${eventsCard()}</div>${modal()}`;
  };

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

  function searchCard() {
    const filters = [["all", "הכול"], ["phone", "עם טלפון"], ["email", "עם אימייל"], ["website", "עם אתר"], ["social", "עם רשת חברתית"], ["fleet", "עם צי רכב"], ["multi", "ממקורות מרובים"]];
    const res = ST.results;
    const rows = (res || []).map((b) => `<tr data-nr="biz" data-v="${b.id}">
      <td><div class="co-name">${esc(b.name)}</div><div class="xs muted">${esc(b.main_activity || b.sector || "")}</div></td>
      <td class="num">${esc(b.reg_id || "—")}</td><td>${esc(b.city || "—")}</td>
      <td class="num" dir="ltr">${esc(b.phone_main || "—")}</td><td dir="ltr" class="xs">${esc(b.email_main || "—")}</td>
      <td class="xs">${b.website ? `<a href="${esc(b.website)}" target="_blank" rel="noopener" data-nr-stop="1">אתר</a>` : "—"}${Object.keys(b.socials || {}).map((k) => ` <a href="${esc(b.socials[k])}" target="_blank" rel="noopener" data-nr-stop="1">${esc(k)}</a>`).join("")}</td>
      <td>${b.fleet_known ? `<span class="badge b-ok">${b.fleet_vehicles ? n(b.fleet_vehicles) + " רכבים" : "יש צי"}</span>` : "—"}</td>
      <td class="num">${n(b.source_count)}${b.has_conflict ? ` <span class="badge b-est">סתירה</span>` : ""}</td></tr>`).join("");
    return `<div class="card"><div class="card-h"><h2>חיפוש במאגר<span class="h-bar"></span></h2>
      <span class="xs muted">שם, ח.פ., עיר או ענף · הסינון לפי 7 החוקים יבוצע בשלב הבא – כאן רואים את כל מה שנאסף</span></div>
      <div class="card-b" style="display:grid;gap:10px">
        <div class="row"><input class="input" id="nrQ" style="max-width:360px" placeholder="לדוגמה: מוסך / 51-555 / חיפה" value="${esc(ST.q)}">
          <button class="btn btn-primary btn-sm" data-nr="search">חפש</button>
          ${filters.map(([k, l]) => `<button class="btn btn-sm ${ST.filter === k ? "btn-navy" : ""}" data-nr="filter" data-v="${k}">${l}</button>`).join("")}</div>
        ${ST.searching ? `<div class="muted">⏳ מחפש…</div>` : res ? (res.length ? `<div class="tbl-wrap"><table><thead><tr><th>עסק</th><th>ח.פ.</th><th>עיר</th><th>טלפון</th><th>אימייל</th><th>אתר / רשתות</th><th>צי רכב</th><th>מקורות</th></tr></thead><tbody>${rows}</tbody></table></div><div class="xs muted">מוצגות עד 100 תוצאות – לחיצה על עסק מציגה את כל הראיות</div>` : `<div class="muted">לא נמצאו עסקים</div>`) : ""}
      </div></div>`;
  }

  function eventsCard() {
    const ev = (ST.stats && ST.stats.events) || [];
    const icon = { info: "ℹ️", warn: "⚠️", error: "⛔", checkpoint: "🏁" };
    return `<div class="card"><div class="card-h"><h2>יומן איסוף ותקלות<span class="h-bar"></span></h2></div>
      <div class="card-b" style="display:grid;gap:6px;max-height:320px;overflow:auto">
      ${ev.length ? ev.map((e) => `<div class="xs"><span class="muted num">${when(e.at)}</span> ${icon[e.level] || ""} ${esc(e.message)}</div>`).join("") : `<div class="muted xs">אין אירועים עדיין</div>`}
      </div></div>`;
  }

  // ── modal: source detail / business detail ──
  function modal() {
    const m = ST.modal;
    if (!m) return "";
    let body = `<div class="muted">⏳ טוען…</div>`;
    if (m.error) body = `<div class="badge b-bad" style="white-space:normal">${esc(m.error)}</div>`;
    else if (m.data && m.type === "source") body = sourceDetail(m.data);
    else if (m.data && m.type === "biz") body = bizDetail(m.data);
    return `<div data-nr="close" style="position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:900;display:flex;align-items:flex-start;justify-content:center;padding:4vh 12px;overflow:auto">
      <div class="card" data-nr-stop="1" style="width:min(920px,100%);max-height:92vh;overflow:auto">
        <div class="card-h"><h2>${esc(m.title || "")}<span class="h-bar"></span></h2><span class="spacer"></span><button class="btn btn-sm" data-nr="close">✕ סגור</button></div>
        <div class="card-b" style="display:grid;gap:12px">${body}</div></div></div>`;
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
      <div class="xs muted">התחלה ${when(s.started_at)} · סיום ${when(s.finished_at)} · ריצה אחרונה ${when(s.last_run_at)}${s.last_error ? ` · שגיאה אחרונה: ${esc(s.last_error)}` : ""}</div>
      ${(d.samples || []).length ? `<div><b>דוגמאות אחרונות עם ראיה:</b><div class="tbl-wrap"><table><thead><tr><th>עסק</th><th>ח.פ.</th><th>התאמה</th><th>רשומת מקור</th></tr></thead><tbody>
        ${d.samples.map((x) => `<tr data-nr="biz" data-v="${x.id}"><td>${esc(x.name)}</td><td class="num">${esc(x.reg_id || "—")}</td><td class="xs">${esc(MATCH[x.match_method] || x.match_method)}</td><td class="xs">${x.source_url ? `<a href="${esc(x.source_url)}" target="_blank" rel="noopener" data-nr-stop="1">פתח רשומה</a>` : "—"}</td></tr>`).join("")}
      </tbody></table></div></div>` : ""}
      ${(d.runs || []).length ? `<div><b>מנות אחרונות:</b><div class="tbl-wrap"><table><thead><tr><th>זמן</th><th>טווח</th><th>נקראו</th><th>חדשים</th><th>הועשרו</th><th>פרטים</th><th>משך</th><th></th></tr></thead><tbody>
        ${d.runs.map((r) => `<tr><td class="xs">${when(r.started_at)}</td><td class="num xs">${n(r.cursor_from)}–${n(r.cursor_to)}</td><td class="num">${n(r.records_read)}</td><td class="num">${n(r.businesses_new)}</td><td class="num">${n(r.businesses_enriched)}</td><td class="num">${n(r.details_added)}</td><td class="xs">${dur(r.duration_ms)}</td><td class="xs">${r.ok ? "" : `<span class="badge b-bad">${esc((r.error || "").slice(0, 60))}</span>`}</td></tr>`).join("")}
      </tbody></table></div></div>` : ""}`;
  }

  function bizDetail(d) {
    const b = d.business || {};
    const kindL = { phone: "טלפון", email: "אימייל", website: "אתר", social: "רשת חברתית", fax: "פקס", contact_form: "טופס קשר", whatsapp: "WhatsApp" };
    const subL = { main: "ראשי", mobile: "נייד", branch: "סניף / מסגרת", service: "שירות לקוחות", fax: "פקס" };
    const isUrl = (v) => /^https?:\/\//.test(v);
    const field = (l, v) => (v || v === 0) && String(v) !== "" ? `<div><span class="muted xs">${l}</span><div>${esc(v)}</div></div>` : "";
    return `<div class="grid g-3" style="gap:10px">
        ${field("ח.פ. / מזהה רשמי", b.reg_id)}${field("סוג התאגדות", b.corp_type)}${field("סטטוס", b.status_raw || b.status)}
        ${field("שנת הקמה", b.founded_year)}${field("ענף", b.sector)}${field("תחום עיסוק", b.main_activity)}
        ${field("כתובת", [b.address, b.city, b.zip].filter(Boolean).join(", "))}${field("אזור", b.region)}${field("מספר עובדים (פורסם)", b.employees_count)}
        ${field("שם באנגלית", b.name_en)}${field("שמות נוספים", (b.names_alt || []).join(" · "))}${field("תחומי עיסוק נוספים", (b.activities || []).join(" · "))}
      </div>
      ${b.description ? `<div class="xs" style="white-space:normal"><span class="muted">תיאור:</span> ${esc(b.description)}</div>` : ""}
      ${b.fleet_known ? `<div class="badge b-ok" style="white-space:normal">צי רכב: ${b.fleet_vehicles ? n(b.fleet_vehicles) + " רכבים לפי רשומת מקור" : "קיים"}${(b.fleet_types || []).length ? " · " + esc(b.fleet_types.join(", ")) : ""}</div>` : `<div class="xs muted">צי רכב: לא ידוע (אין רשומת מקור)</div>`}
      ${(b.logistics_indicators || []).length ? `<div class="xs">אינדיקציות לפעילות שטח/לוגיסטיקה: ${esc(b.logistics_indicators.join(" · "))}</div>` : ""}
      <div><b>פרטי קשר (${n((d.contacts || []).length)})</b><div class="tbl-wrap"><table><thead><tr><th>סוג</th><th>ערך</th><th>סניף</th><th>מקורות</th><th>אימות</th></tr></thead><tbody>
        ${(d.contacts || []).map((c) => `<tr><td class="xs">${kindL[c.kind] || c.kind}${c.subkind && c.subkind !== c.kind ? ` · ${esc(subL[c.subkind] || c.subkind)}` : ""}</td>
          <td dir="ltr" class="xs">${isUrl(c.display || c.value) ? `<a href="${esc(c.display || c.value)}" target="_blank" rel="noopener">${esc(c.display || c.value)}</a>` : esc(c.display || c.value)}</td>
          <td class="xs">${esc([c.branch_name, c.branch_address].filter(Boolean).join(" – ") || "—")}</td>
          <td class="xs">${(c.sources || []).map((k) => esc((ST.sources.find((x) => x.key === k) || {}).name || k)).join("<br>")}</td>
          <td>${c.verified ? `<span class="badge b-ok">מאומת (2+ מקורות)</span>` : `<span class="badge b-no">לא מאומת</span>`}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">לא נמצאו פרטי קשר עדיין</td></tr>`}
      </tbody></table></div></div>
      ${(d.people || []).length ? `<div><b>אנשי קשר עסקיים</b><div class="tbl-wrap"><table><thead><tr><th>שם</th><th>תפקיד</th><th>מקור</th></tr></thead><tbody>
        ${d.people.map((p) => `<tr><td>${esc(p.full_name)}</td><td class="xs">${esc(p.role)}</td><td class="xs">${p.source_url ? `<a href="${esc(p.source_url)}" target="_blank" rel="noopener">${esc((ST.sources.find((x) => x.key === p.source_key) || {}).name || p.source_key)}</a>` : esc(p.source_key)}</td></tr>`).join("")}
      </tbody></table></div></div>` : ""}
      <div><b>ראיות – מאיפה הגיע כל פרט (${n((d.evidence || []).length)})</b><div class="tbl-wrap"><table><thead><tr><th>מקור</th><th>אופן התאמה</th><th>מה התקבל</th><th>מועד</th><th>קישור</th></tr></thead><tbody>
        ${(d.evidence || []).map((e) => `<tr><td class="xs">${esc(e.source_name || e.source_key)}</td><td class="xs">${esc(MATCH[e.match_method] || e.match_method)}${e.entry_mode === "manual" ? " · ידני" : " · אוטומטי"}${e.conflicts ? `<div class="badge b-est" style="white-space:normal">סתירה: ${esc(JSON.stringify(e.conflicts))}</div>` : ""}</td>
          <td class="xs" dir="auto" style="max-width:300px;white-space:normal">${esc(Object.entries(e.fields || {}).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v === true ? "✓" : v}`).join(" · "))}</td>
          <td class="xs">${when(e.collected_at)}</td><td class="xs">${e.source_url ? `<a href="${esc(e.source_url)}" target="_blank" rel="noopener">פתח</a>` : "—"}</td></tr>`).join("")}
      </tbody></table></div></div>`;
  }

  async function openSource(key) {
    const s = ST.sources.find((x) => x.key === key);
    ST.modal = { type: "source", title: s ? s.name : key }; rerender();
    try { const sb = await client(); const r = await sb.rpc("nr_source_detail", { p_key: key }); if (r.error) throw new Error(r.error.message); ST.modal.data = r.data; }
    catch (e) { ST.modal.error = e.message; }
    rerender();
  }
  async function openBiz(id) {
    ST.modal = { type: "biz", title: "טוען עסק…" }; rerender();
    try {
      const sb = await client(); const r = await sb.rpc("nr_business_detail", { p_id: Number(id) });
      if (r.error) throw new Error(r.error.message);
      ST.modal.data = r.data; ST.modal.title = (r.data.business || {}).name || "עסק";
    } catch (e) { ST.modal.error = e.message; }
    rerender();
  }
  async function search() {
    ST.searching = true; rerender();
    try { const sb = await client(); const r = await sb.rpc("nr_search", { p_q: ST.q, p_filter: ST.filter, p_limit: 100 }); if (r.error) throw new Error(r.error.message); ST.results = r.data || []; }
    catch (e) { ST.results = []; toast(e.message); }
    ST.searching = false; rerender();
  }
  async function setRunning(on) {
    ST.busy = true; rerender();
    try { const sb = await client(); const r = await sb.rpc("nr_set_running", { p_running: on }); if (r.error) throw new Error(r.error.message); toast(on ? "האיסוף הופעל – השרת ימשיך מנקודת ההתקדמות האחרונה" : "האיסוף נעצר אחרי המנה הנוכחית"); }
    catch (e) { toast(e.message); }
    ST.busy = false; await load(true);
  }

  document.addEventListener("click", (e) => {
    if (!(S.view === "prospector" && S.tab === TAB)) return;
    const stop = e.target.closest("[data-nr-stop]");
    const el = e.target.closest("[data-nr],[data-nr-filter]");
    if (!el) return;
    if (stop && el.getAttribute("data-nr") === "close" && !el.matches("button")) return; // click inside the dialog
    if (e.target.closest("a[href]")) return; // links open normally
    e.preventDefault(); e.stopPropagation();
    if (el.hasAttribute("data-nr-filter")) { ST.filter = el.getAttribute("data-nr-filter"); ST.q = ""; search(); setTimeout(() => { const c = document.getElementById("nrQ"); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); }, 50); return; }
    const act = el.getAttribute("data-nr"), v = el.getAttribute("data-v");
    if (act === "start") setRunning(true);
    else if (act === "stop") setRunning(false);
    else if (act === "refresh") load(true);
    else if (act === "srcfilter") { ST.srcFilter = v; rerender(); }
    else if (act === "filter") { ST.filter = v; search(); }
    else if (act === "search") { ST.q = (document.getElementById("nrQ") || {}).value || ""; search(); }
    else if (act === "source") openSource(v);
    else if (act === "biz") openBiz(v);
    else if (act === "close") { ST.modal = null; rerender(); }
  }, true);
  document.addEventListener("keydown", (e) => {
    if (!(S.view === "prospector" && S.tab === TAB)) return;
    if (e.key === "Enter" && e.target && e.target.id === "nrQ") { ST.q = e.target.value; search(); }
    if (e.key === "Escape" && ST.modal) { ST.modal = null; rerender(); }
  });

  if (typeof renderTabs === "function" && S.view === "prospector") renderTabs();
})();
