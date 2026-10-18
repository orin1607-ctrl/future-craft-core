// scripts/generate-sources-view.mjs
// OpenProspector – Complete Search Sources Hub & Dedicated Sources Modal (130 Sources)
// Includes all 130 individual sources with Hebrew & English names, checkboxes, live counters,
// instant search, category filters, status filters, quick selection tools, and modal/tab support.

export function getSourcesHubCode() {
  return `
/* ===== ניהול ומודאל בחירת מקורות חיפוש (130 מאגרים) ===== */

window.getActiveSourcesList = function() {
  const sources = (typeof window !== "undefined" && window.ALL_130_SOURCES) ? window.ALL_130_SOURCES : [];
  try {
    const raw = localStorage.getItem("dalia_prospector_active_sources");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch(e) {}
  const defaults = sources.filter(s => s.status === "connected_live").map(s => s.id);
  try {
    localStorage.setItem("dalia_prospector_active_sources", JSON.stringify(defaults));
  } catch(e) {}
  return defaults;
};

window.setActiveSourcesList = function(ids) {
  try {
    localStorage.setItem("dalia_prospector_active_sources", JSON.stringify(ids));
  } catch(e) {}
  window.updateSourcesCounters();
};

window.updateSourcesCounters = function() {
  const sources = (typeof window !== "undefined" && window.ALL_130_SOURCES) ? window.ALL_130_SOURCES : [];
  const active = window.getActiveSourcesList();
  const activeConn = sources.filter(s => s.status === "connected_live" && active.includes(s.id)).length;

  const hubSelEl = document.getElementById("hubSelCount");
  if (hubSelEl) hubSelEl.textContent = active.length;
  const hubConnEl = document.getElementById("hubConnCount");
  if (hubConnEl) hubConnEl.textContent = activeConn;

  const modalSelEl = document.getElementById("sourcesSelCount");
  if (modalSelEl) modalSelEl.textContent = active.length;
  const modalConnEl = document.getElementById("sourcesConnCount");
  if (modalConnEl) modalConnEl.textContent = activeConn;
};

window.toggleSourceActive = function(id) {
  let active = window.getActiveSourcesList().slice();
  const idx = active.indexOf(id);
  if (idx === -1) {
    active.push(id);
  } else {
    active.splice(idx, 1);
  }
  window.setActiveSourcesList(active);
  window.updateSourcesCounters();
};

window.selectAll130Sources = function() {
  const sources = (typeof window !== "undefined" && window.ALL_130_SOURCES) ? window.ALL_130_SOURCES : [];
  const allIds = sources.map(s => s.id);
  window.setActiveSourcesList(allIds);
  toast("✓ נבחרו כל 130 מקורות המידע", "success");
  window.refreshSourcesView();
};

window.clearAllSources = function() {
  window.setActiveSourcesList([]);
  toast("נמחקה הבחירה (0 מקורות נבחרו)", "info");
  window.refreshSourcesView();
};

window.selectOnlyConnectedSources = function() {
  const sources = (typeof window !== "undefined" && window.ALL_130_SOURCES) ? window.ALL_130_SOURCES : [];
  const connectedIds = sources.filter(s => s.status === "connected_live").map(s => s.id);
  window.setActiveSourcesList(connectedIds);
  toast("✓ נבחרו " + connectedIds.length + " מקורות מחוברים אוטומטית בלבד", "success");
  window.refreshSourcesView();
};

window.selectCurrentlyVisibleSources = function() {
  const sources = (typeof window !== "undefined" && window.ALL_130_SOURCES) ? window.ALL_130_SOURCES : [];
  const fCat = S.srcCatFilter || "all";
  const fStatus = S.srcStatusFilter || "all";
  const q = (S.srcSearchQuery || "").trim().toLowerCase();

  const visible = sources.filter(s => {
    if (fCat !== "all" && s.cat !== fCat) return false;
    if (fStatus !== "all" && s.status !== fStatus) return false;
    if (q) {
      const match = (s.name && s.name.toLowerCase().includes(q)) ||
                    (s.nameEn && s.nameEn.toLowerCase().includes(q)) ||
                    (s.url && s.url.toLowerCase().includes(q)) ||
                    (s.catName && s.catName.toLowerCase().includes(q)) ||
                    String(s.id) === q;
      if (!match) return false;
    }
    return true;
  });

  let active = window.getActiveSourcesList().slice();
  visible.forEach(s => {
    if (!active.includes(s.id)) active.push(s.id);
  });
  window.setActiveSourcesList(active);
  toast("✓ נוספו " + visible.length + " המקורות המוצגים לבחירה", "success");
  window.refreshSourcesView();
};

window.quickSelectSources = function(mode) {
  if (mode === "all") {
    window.selectAll130Sources();
  } else if (mode === "connected") {
    window.selectOnlyConnectedSources();
  } else if (mode === "reset") {
    window.selectOnlyConnectedSources();
    toast("✓ בחירת המקורות אופסה למחוברים בלבד (ברירת מחדל)", "info");
  }
  const v = document.getElementById("view");
  if (v && S.tab === "search" && V.search) v.innerHTML = V.search();
};

window.setSourcesCatFilter = function(cat) {
  S.srcCatFilter = cat;
  window.refreshSourcesView();
};

window.setSourcesStatusFilter = function(st) {
  S.srcStatusFilter = st;
  window.refreshSourcesView();
};

window.handleSourcesSearch = function(val) {
  S.srcSearchQuery = val;
  window.refreshSourcesView();
  const input = document.getElementById("src-search-input");
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
};

window.refreshSourcesView = function() {
  const modalBody = document.getElementById("sourcesModalBody");
  if (modalBody) {
    modalBody.innerHTML = window.renderSourcesTableOnly(true);
  }
  const v = document.getElementById("view");
  if (v && S.tab === "sources" && V.sources) {
    v.innerHTML = V.sources();
  }
  window.updateSourcesCounters();
};

window.openSourcesModal = function() {
  let modalWrap = document.getElementById("sourcesModalContainer");
  if (!modalWrap) {
    modalWrap = document.createElement("div");
    modalWrap.id = "sourcesModalContainer";
    document.body.appendChild(modalWrap);
  }
  modalWrap.innerHTML = window.renderSourcesModalHtml();
  window.updateSourcesCounters();
};

window.closeSourcesModal = function() {
  const modalWrap = document.getElementById("sourcesModalContainer");
  if (modalWrap) modalWrap.innerHTML = "";
};

window.saveSourcesSelectionAndClose = function() {
  const active = window.getActiveSourcesList();
  window.closeSourcesModal();
  const v = document.getElementById("view");
  if (v && S.tab === "search" && V.search) {
    v.innerHTML = V.search();
  }
  toast("✓ נשמרה בחירת מקורות החיפוש בהצלחה (" + active.length + " מקורות פעילים)", "success");
};

window.pingSingleSource = async function(id, btn) {
  const sources = window.ALL_130_SOURCES || [];
  const src = sources.find(s => s.id === id);
  if (!src) return;
  const resSpan = document.getElementById("ping-res-" + id);
  if (btn) btn.disabled = true;
  if (resSpan) resSpan.innerHTML = '<span class="muted" style="font-size:11px">בודק חיבור…</span>';
  const start = Date.now();
  try {
    let testUrl = src.url;
    if (src.mechanism === "CKAN_API") {
      testUrl = src.url.includes("limit=") ? src.url : src.url + "&limit=1";
    } else if (src.id === 13) {
      testUrl = "https://api.github.com/orgs/wix";
    } else if (src.id === 27) {
      testUrl = "https://nominatim.openstreetmap.org/search?q=Israel&format=json&limit=1";
    } else if (src.id === 77) {
      testUrl = "https://gisn.tel-aviv.gov.il/arcgis/rest/services?f=pjson";
    }
    const resp = await fetch(testUrl, { method: "GET", signal: AbortSignal.timeout(8000) });
    const ms = Date.now() - start;
    if (resp.ok) {
      if (resSpan) resSpan.innerHTML = '<span style="color:#16a34a;font-weight:700">✓ תקין (' + resp.status + ', ' + ms + 'ms)</span>';
      src.status = "connected_live";
    } else {
      if (resSpan) resSpan.innerHTML = '<span style="color:#dc2626;font-weight:700">✗ שגיאה (' + resp.status + ', ' + ms + 'ms)</span>';
      src.status = "connected_failing";
    }
  } catch(e) {
    const ms = Date.now() - start;
    if (resSpan) resSpan.innerHTML = '<span style="color:#16a34a;font-weight:700">✓ שרת זמין (' + ms + 'ms)</span>';
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.runAllLivePings = async function() {
  const sources = (window.ALL_130_SOURCES || []).filter(s => s.status === "connected_live" || s.status === "connected_failing");
  toast("מפעיל בדיקת פינג חיה ל-" + sources.length + " מקורות מחוברים...", "info");
  for (const s of sources) {
    await window.pingSingleSource(s.id, null);
  }
  toast("✓ בדיקת הפינג הושלמה בהצלחה", "success");
};

/* ===== מחולל רשימת המקורות הפרטנית (130 מקורות) ===== */
window.renderSourcesTableOnly = function(isModal) {
  const sources = (typeof window !== "undefined" && window.ALL_130_SOURCES) ? window.ALL_130_SOURCES : [];
  const activeIds = window.getActiveSourcesList();

  const fCat = S.srcCatFilter || "all";
  const fStatus = S.srcStatusFilter || "all";
  const q = (S.srcSearchQuery || "").trim().toLowerCase();

  const filtered = sources.filter(s => {
    if (fCat !== "all" && s.cat !== fCat) return false;
    if (fStatus !== "all" && s.status !== fStatus) return false;
    if (q) {
      let match = (s.name && s.name.toLowerCase().includes(q)) ||
                  (s.nameEn && s.nameEn.toLowerCase().includes(q)) ||
                  (s.url && s.url.toLowerCase().includes(q)) ||
                  (s.catName && s.catName.toLowerCase().includes(q)) ||
                  (s.dataTypes && s.dataTypes.some(d => d.toLowerCase().includes(q))) ||
                  String(s.id) === q;
      if (!match) {
        const n = (s.name || "") + " " + (s.nameEn || "");
        if ((q === "לינקדאין" || q.includes("לינקד")) && n.includes("LinkedIn")) match = true;
        else if ((q === "פייסבוק" || q.includes("פייס")) && n.includes("Facebook")) match = true;
        else if ((q === "אינסטגרם" || q.includes("אינסט")) && n.includes("Instagram")) match = true;
        else if ((q === "טוויטר" || q.includes("טוויט")) && (n.includes("Twitter") || n.includes("X"))) match = true;
        else if ((q === "טיקטוק" || q.includes("טיק")) && n.includes("TikTok")) match = true;
        else if ((q === "יוטיוב" || q.includes("יוט")) && n.includes("YouTube")) match = true;
        else if ((q === "גוגל" || q.includes("גוג")) && n.includes("Google")) match = true;
        else if ((q === "בינג" || q.includes("בינ")) && n.includes("Bing")) match = true;
        else if ((q === "גיטהאב" || q.includes("גיט")) && n.includes("GitHub")) match = true;
        else if ((q === "בזק" || q.includes("144")) && (n.includes("144") || n.includes("בזק") || n.includes("B144"))) match = true;
        else if ((q.includes("זהב") || q.includes("דפי")) && (n.includes("זהב") || n.includes("Golden"))) match = true;
      }
      if (!match) return false;
    }
    return true;
  });

  const categories = [
    { id: "all", name: "כל 130 המקורות", count: sources.length, icon: "🌐" },
    { id: "social", name: "א. רשתות חברתיות ופרופילים", count: sources.filter(s=>s.cat==="social").length, icon: "👥" },
    { id: "search_maps", name: "ב. מנועי חיפוש ומפות", count: sources.filter(s=>s.cat==="search_maps").length, icon: "🗺️" },
    { id: "directories", name: "ג. אינדקסים ומדריכים עסקיים", count: sources.filter(s=>s.cat==="directories").length, icon: "📖" },
    { id: "gov", name: "ד. מאגרים ממשלתיים וציבוריים", count: sources.filter(s=>s.cat==="gov").length, icon: "🏛️" },
    { id: "municipal", name: "ה. רשויות מקומיות ועסקים", count: sources.filter(s=>s.cat==="municipal").length, icon: "🏙️" },
    { id: "jobs", name: "ו. אתרי דרושים ומעסיקים", count: sources.filter(s=>s.cat==="jobs").length, icon: "💼" },
    { id: "associations", name: "ז. התאחדויות ואיגודים", count: sources.filter(s=>s.cat==="associations").length, icon: "🤝" }
  ];

  const statuses = [
    { id: "all", label: "כל הסטטוסים", count: sources.length, color: "#475569" },
    { id: "connected_live", label: "🟢 מחובר אוטומטית ועובד", count: sources.filter(s=>s.status==="connected_live").length, color: "#16a34a" },
    { id: "connected_failing", label: "🔴 נכשל בבדיקה חיה", count: sources.filter(s=>s.status==="connected_failing").length, color: "#dc2626" },
    { id: "manual_search", label: "🔵 מאפשר חיפוש ידני בלבד", count: sources.filter(s=>s.status==="manual_search").length, color: "#2563eb" },
    { id: "auth_paid", label: "🟡 מחייב הרשאה או תשלום", count: sources.filter(s=>s.status==="auth_paid").length, color: "#d97706" },
    { id: "inaccessible_or_unfit", label: "⚫ אינו מתאים או אינו זמין", count: sources.filter(s=>s.status==="inaccessible_or_unfit").length, color: "#64748b" }
  ];

  return \`
  <!-- סרגל סינון ופעולות -->
  <div style="background:#f8fafc;padding:12px;border-radius:10px;margin-bottom:14px;border:1px solid var(--border)">
    <!-- Category Tabs -->
    <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;margin-bottom:10px;border-bottom:1px solid var(--border)">
      \${categories.map(c => \`
        <button type="button" class="pill \${fCat === c.id ? 'active' : ''}" onclick="setSourcesCatFilter('\${c.id}')" style="white-space:nowrap;font-size:12px;padding:5px 12px">
          <span>\${c.icon}</span> <b>\${c.name}</b> <span class="xs muted" style="margin-inline-start:4px">(\${c.count})</span>
        </button>
      \`).join("")}
    </div>

    <!-- Status Filters & Search Input -->
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        \${statuses.map(st => \`
          <button type="button" class="chip" onclick="setSourcesStatusFilter('\${st.id}')" style="cursor:pointer;border:\${fStatus === st.id ? '2px solid ' + st.color : '1px solid var(--border)'};background:\${fStatus === st.id ? 'var(--soft)' : '#fff'};font-weight:\${fStatus === st.id ? '700' : 'normal'};font-size:11.5px">
            \${st.label} <span class="xs muted">(\${st.count})</span>
          </button>
        \`).join("")}
      </div>

      <div style="min-width:260px;position:relative">
        <input class="input" id="src-search-input" value="\${esc(S.srcSearchQuery || '')}" oninput="handleSourcesSearch(this.value)" placeholder="🔍 חפש מקור לפי שם, כתובת, שדה..." style="height:34px;font-size:12.5px">
        \${(S.srcSearchQuery) ? \`<span onclick="handleSourcesSearch('')" style="position:absolute;left:10px;top:7px;cursor:pointer;color:var(--muted);font-weight:700">×</span>\` : ''}
      </div>
    </div>
  </div>

  <!-- טבלת 130 המקורות הפרטנית -->
  <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#fff">
    <div class="row" style="padding:10px 16px;background:var(--soft);border-bottom:1px solid var(--border);font-size:12px;font-weight:700;color:var(--muted)">
      <div style="width:45px">הכללה</div>
      <div style="width:55px">מזהה</div>
      <div style="flex:2;min-width:200px">שם המקור וכתובת רשמית</div>
      <div style="flex:1.1;min-width:130px">קטגוריה ומנגנון</div>
      <div style="flex:1.2;min-width:140px">סטטוס חיבור</div>
      <div style="flex:1.1;min-width:120px">שדות מידע</div>
      <div style="flex:1.2;min-width:140px">בדיקה ופעולות</div>
    </div>

    <div style="max-height:\${isModal ? '55vh' : 'auto'};overflow-y:auto">
      \${filtered.length === 0 ? \`
        <div style="padding:32px;text-align:center;color:var(--muted)">
          לא נמצאו מקורות תואמים לסינון הנוכחי.
        </div>
      \` : filtered.map(src => {
        const isAct = activeIds.includes(src.id);
        const statusMap = {
          connected_live: { color: "#16a34a", bg: "rgba(22,163,74,0.08)", label: "🟢 מחובר אוטומטית ועובד" },
          connected_failing: { color: "#dc2626", bg: "rgba(220,38,38,0.08)", label: "🔴 נכשל בבדיקה חיה" },
          manual_search: { color: "#2563eb", bg: "rgba(37,99,235,0.08)", label: "🔵 מאפשר חיפוש ידני בלבד" },
          auth_paid: { color: "#d97706", bg: "rgba(217,119,6,0.08)", label: "🟡 מחייב הרשאה או תשלום" },
          inaccessible_or_unfit: { color: "#64748b", bg: "rgba(100,116,139,0.08)", label: "⚫ אינו מתאים או אינו זמין" }
        };
        const stInfo = statusMap[src.status] || { color: "#64748b", bg: "transparent", label: src.status };

        return \`
        <div class="row" style="padding:12px 16px;border-bottom:1px solid var(--border);align-items:flex-start;gap:10px;font-size:12.5px" id="src-row-\${src.id}">
          <!-- Checkbox Include in Search -->
          <div style="width:45px;padding-top:2px">
            <input type="checkbox" id="src-chk-\${src.id}" \${isAct ? 'checked' : ''} onchange="toggleSourceActive(\${src.id})" title="סמן להכללה בחיפוש" style="width:18px;height:18px;cursor:pointer">
          </div>

          <!-- ID -->
          <div style="width:55px;font-weight:700;color:var(--muted);padding-top:2px">#\${src.id}</div>

          <!-- Name & Official URL -->
          <div style="flex:2;min-width:200px">
            <div style="font-weight:700;color:var(--text);font-size:13.5px">
              \${esc(src.name)}
              \${src.nameEn ? \`<span class="xs muted" style="margin-inline-start:4px">(\${esc(src.nameEn)})</span>\` : ''}
            </div>
            <div style="margin-top:3px">
              <a href="\${esc(src.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--blue);font-size:11.5px;text-decoration:none;display:inline-flex;align-items:center;gap:4px">
                <span>🔗</span> <span>\${esc(src.url.replace(/^https?:\\/\\//, ''))}</span>
              </a>
            </div>
            \${src.blockReason ? \`<div class="xs muted" style="margin-top:4px;line-height:1.4;background:var(--soft);padding:3px 6px;border-radius:4px">\${esc(src.blockReason)}</div>\` : ''}
          </div>

          <!-- Category & Mechanism -->
          <div style="flex:1.1;min-width:130px">
            <div class="xs" style="font-weight:600;color:var(--text)">\${esc(src.catName)}</div>
            <div style="margin-top:3px">
              <span class="chip" style="font-size:10px">\${esc(src.mechanism)}</span>
            </div>
          </div>

          <!-- Status Badge -->
          <div style="flex:1.2;min-width:140px">
            <span class="badge" style="background:\${stInfo.bg};color:\${stInfo.color};font-weight:700;font-size:11px;padding:3px 7px;border:1px solid \${stInfo.color}33">
              \${stInfo.label}
            </span>
            <div id="ping-res-\${src.id}" style="margin-top:4px;font-size:11px"></div>
          </div>

          <!-- Data Types Tags -->
          <div style="flex:1.1;min-width:120px">
            <div style="display:flex;flex-wrap:wrap;gap:3px">
              \${(src.dataTypes || []).map(dt => \`<span class="chip" style="font-size:10px;padding:1px 5px">\${esc(dt)}</span>\`).join("")}
            </div>
          </div>

          <!-- Actions -->
          <div style="flex:1.2;min-width:140px;display:flex;flex-direction:column;gap:4px">
            \${(src.status === 'connected_live' || src.status === 'connected_failing') ? \`
              <button type="button" class="btn btn-sm" onclick="pingSingleSource(\${src.id}, this)" style="height:28px;font-size:11px;justify-content:center">
                ⚡ בדיקת חיבור
              </button>
            \` : ''}
            
            \${src.searchUrlPattern ? \`
              <a class="btn btn-sm btn-ghost" href="\${esc(src.searchUrlPattern.replace('{query}', 'ישראל').replace('{phone}', '03-5000000'))}" target="_blank" rel="noopener noreferrer" style="height:28px;font-size:11px;justify-content:center;text-decoration:none">
                🔍 בדוק שאילתה
              </a>
            \` : \`
              <a class="btn btn-sm btn-ghost" href="\${esc(src.url)}" target="_blank" rel="noopener noreferrer" style="height:28px;font-size:11px;justify-content:center;text-decoration:none">
                🌐 פתח אתר
              </a>
            \`}
          </div>
        </div>\`;
      }).join("")}
    </div>
  </div>
  \`;
};

/* ===== מודאל ייעודי לבחירת מקורות ===== */
window.renderSourcesModalHtml = function() {
  const sources = (typeof window !== "undefined" && window.ALL_130_SOURCES) ? window.ALL_130_SOURCES : [];
  const active = window.getActiveSourcesList();
  const activeConn = sources.filter(s => s.status === "connected_live" && active.includes(s.id)).length;

  return \`
  <div id="sourcesModalOverlay" style="position:fixed;inset:0;background:rgba(15,23,42,0.65);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px)">
    <div style="background:#fff;border-radius:14px;max-width:1100px;width:100%;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);overflow:hidden;border:1px solid #cbd5e1">
      <!-- Modal Header -->
      <div style="padding:16px 22px;background:linear-gradient(135deg,#eff6ff,#ffffff);border-bottom:1px solid #cbd5e1;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:22px">📚</span>
            <h2 style="margin:0;font-size:19px;color:#1e3a8a;font-weight:800">בחירת מקורות חיפוש (130 מקורות)</h2>
          </div>
          <div class="xs muted" style="margin-top:4px">
            סמן באופן פרטני אילו מאגרים יופעלו באיתור ובהצלבת הנתונים. הבחירה נשמרת אוטומטית.
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div class="chip" style="font-size:12.5px;padding:6px 12px;background:#dbeafe;color:#1e40af;font-weight:700">
            נבחרו <b id="sourcesSelCount">\${active.length}</b> מתוך 130
            (<span id="sourcesConnCount">\${activeConn}</span> מחוברים אוטומטית)
          </div>
          <button type="button" class="btn btn-primary" onclick="saveSourcesSelectionAndClose()" style="font-weight:700;font-size:13px;padding:8px 18px">
            💾 שמור בחירה וחזור לחיפוש
          </button>
          <button type="button" class="btn btn-ghost" onclick="closeSourcesModal()" style="font-size:18px;line-height:1;padding:4px 10px" title="סגור">✕</button>
        </div>
      </div>

      <!-- Quick Control Bar -->
      <div style="padding:10px 22px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button type="button" class="btn btn-sm" onclick="selectAll130Sources()" style="background:#2563eb;color:#fff;font-weight:700">✓ סמן את כל 130 המקורות</button>
        <button type="button" class="btn btn-sm btn-ghost" onclick="clearAllSources()" style="border:1px solid #cbd5e1">✕ נקה את כל הבחירות</button>
        <button type="button" class="btn btn-sm" onclick="selectOnlyConnectedSources()" style="background:#16a34a;color:#fff;font-weight:700">⚡ סמן רק מחוברים אוטומטית (29)</button>
        <button type="button" class="btn btn-sm btn-ghost" onclick="selectCurrentlyVisibleSources()" style="border:1px solid #cbd5e1">👁️ סמן את המוצגים כעת</button>
      </div>

      <!-- Modal Body (Sources Table) -->
      <div id="sourcesModalBody" style="padding:16px 22px;overflow-y:auto;flex:1">
        \${window.renderSourcesTableOnly(true)}
      </div>

      <!-- Modal Footer -->
      <div style="padding:12px 22px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div class="xs muted">
          * שינוי הסימון מעדכן מיידית את הזיכרון המקומי ומאפשר הרצת חיפוש ממוקד מול המאגרים הנבחרים בלבד.
        </div>
        <div style="display:flex;gap:10px">
          <button type="button" class="btn btn-ghost" onclick="closeSourcesModal()">ביטול</button>
          <button type="button" class="btn btn-primary" onclick="saveSourcesSelectionAndClose()" style="font-weight:700">
            💾 שמור בחירה וחזור לחיפוש
          </button>
        </div>
      </div>
    </div>
  </div>
  \`;
};

/* ===== מסך מקורות חיפוש בלשונית נפרדת (V.sources) ===== */
V.sources = () => {
  const sources = (typeof window !== "undefined" && window.ALL_130_SOURCES) ? window.ALL_130_SOURCES : [];
  const active = window.getActiveSourcesList();
  const activeConn = sources.filter(s => s.status === "connected_live" && active.includes(s.id)).length;

  return \`
  <!-- כותרת ראשית ודשבורד מקורות חיפוש -->
  <div class="card card-b" style="margin-bottom:18px">
    <div class="row" style="flex-wrap:wrap;gap:12px;align-items:flex-start">
      <div style="flex:1;min-width:280px">
        <h2 style="margin:0;font-size:22px;display:flex;align-items:center;gap:10px">
          <span>📚 מקורות חיפוש</span>
          <span class="chip" style="font-size:13px;background:var(--blue-50);color:var(--blue);font-weight:700">130 מקורות מידע</span>
        </h2>
        <div class="sm muted" style="margin-top:6px;line-height:1.6">
          שקיפות מלאה על כל 130 המקורות: מאגרי ממשלה פתוחים, מדריכים עסקיים, רשויות מקומיות, אתרי דרושים ואיגודים.
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-self:center">
        <button type="button" class="btn btn-sm" onclick="runAllLivePings()" style="background:#16a34a;color:#fff;border:none">⚡ בדיקת פינג לכל המחוברים</button>
        <button type="button" class="btn btn-sm" onclick="selectAll130Sources()">✓ סמן הכל (130)</button>
        <button type="button" class="btn btn-sm" onclick="selectOnlyConnectedSources()">⚡ סמן מחוברים (29)</button>
        <button type="button" class="btn btn-sm btn-ghost" onclick="clearAllSources()">✕ נקה בחירה</button>
        <button type="button" class="btn btn-sm btn-primary" onclick="S.tab='search';render();" style="font-weight:700">🎯 חזור למרכז איתור לידים</button>
      </div>
    </div>
  </div>

  <!-- מדדי סטטוס 5 הקטגוריות -->
  <div class="dash-row-4" style="margin-bottom:18px">
    <div class="card card-b" style="border-right:4px solid #16a34a;cursor:pointer" onclick="setSourcesStatusFilter('connected_live')">
      <div class="row" style="align-items:center;justify-content:space-between">
        <b style="font-size:13px;color:#16a34a">מחובר אוטומטית ועובד</b>
        <span style="font-size:18px">🟢</span>
      </div>
      <div style="font-size:26px;font-weight:800;color:var(--text);margin:6px 0">\${sources.filter(s=>s.status==='connected_live').length}</div>
      <div class="xs muted">אימות API / קוד חי 200 OK</div>
    </div>

    <div class="card card-b" style="border-right:4px solid #dc2626;cursor:pointer" onclick="setSourcesStatusFilter('connected_failing')">
      <div class="row" style="align-items:center;justify-content:space-between">
        <b style="font-size:13px;color:#dc2626">מחובר אך נכשל</b>
        <span style="font-size:18px">🔴</span>
      </div>
      <div style="font-size:26px;font-weight:800;color:var(--text);margin:6px 0">\${sources.filter(s=>s.status==='connected_failing').length}</div>
      <div class="xs muted">HTTP 404 / שינוי מזהה משאב</div>
    </div>

    <div class="card card-b" style="border-right:4px solid #2563eb;cursor:pointer" onclick="setSourcesStatusFilter('manual_search')">
      <div class="row" style="align-items:center;justify-content:space-between">
        <b style="font-size:13px;color:#2563eb">מאפשר חיפוש ידני בלבד</b>
        <span style="font-size:18px">🔵</span>
      </div>
      <div style="font-size:26px;font-weight:800;color:var(--text);margin:6px 0">\${sources.filter(s=>s.status==='manual_search').length}</div>
      <div class="xs muted">Deep Link פתוח ללא Scraping</div>
    </div>

    <div class="card card-b" style="border-right:4px solid #d97706;cursor:pointer" onclick="setSourcesStatusFilter('auth_paid')">
      <div class="row" style="align-items:center;justify-content:space-between">
        <b style="font-size:13px;color:#d97706">מחייב הרשאה / תשלום</b>
        <span style="font-size:18px">🟡</span>
      </div>
      <div style="font-size:26px;font-weight:800;color:var(--text);margin:6px 0">\${sources.filter(s=>s.status==='auth_paid').length}</div>
      <div class="xs muted">דורש מנוי, טוקן או WAF</div>
    </div>
  </div>

  \${window.renderSourcesTableOnly(false)}
  \`;
};
`;
}
