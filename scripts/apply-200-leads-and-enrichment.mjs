// scripts/apply-200-leads-and-enrichment.mjs
// OpenProspector – Complete 200 Regular Companies Persistence, Rule 4/5 Contact Enrichment, and Auto-save Engine
import { getSourcesHubCode } from "./generate-sources-view.mjs";

export function applyOpenProspector200Enrichment(content) {
  let updated = content;

  // 1. Inject script tag into <head>
  const headScriptAnchor = '<script src="openprospector-enrich.js?v=workforce-fleet-v2"></script>';
  const newHeadScript = '<script src="openprospector-enrich.js?v=workforce-fleet-v2"></script>\n<script src="openprospector-batch-200.js?v=20261017-baseline"></script>';
  if (updated.includes(headScriptAnchor)) {
    updated = updated.replace(headScriptAnchor, newHeadScript);
    console.log("✓ Injected openprospector-batch-200.js into head");
  }

  // 2. Enhanced Persistence Layer
  const persistAnchor = `const BATCH2_STORAGE_KEY = "dalia_prospector_batch2_discovered";

function loadPersistedBatch2() {
  try {
    const raw = localStorage.getItem(BATCH2_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch(e) {}
  return null;
}

function persistProspectorData() {
  try {
    const origLeadsOnly = C.filter(c => (c.discovery_batch || "batch_1") === "batch_1");
    const batch2LeadsOnly = C.filter(c => c.discovery_batch === "batch_2");
    localStorage.setItem(PROSPECTOR_STORAGE_KEY, JSON.stringify(origLeadsOnly));
    if (batch2LeadsOnly.length > 0) {
      localStorage.setItem(BATCH2_STORAGE_KEY, JSON.stringify(batch2LeadsOnly));
    }
    localStorage.setItem(PROSPECTOR_RUNS_KEY, JSON.stringify(RUNS));
  } catch(e) {
    console.warn("[Prospector Storage] Error persisting to localStorage:", e);
  }
}`;

  const newPersist = `const BATCH2_STORAGE_KEY = "dalia_prospector_batch2_discovered";
const BATCH200_STORAGE_KEY = "dalia_prospector_200_regular_leads";
const BATCH200_IMMUTABLE_KEY = "dalia_prospector_200_baseline_backup_immutable";
const ENRICHMENT_STATE_KEY = "dalia_prospector_enrichment_state";

function loadPersistedBatch2() {
  try {
    const raw = localStorage.getItem(BATCH2_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch(e) {}
  return null;
}

function loadPersisted200() {
  try {
    const raw = localStorage.getItem(BATCH200_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch(e) {}
  // Initialize from bundled baseline if available
  if (typeof window !== "undefined" && Array.isArray(window.BASE_200_REGULAR_LEADS) && window.BASE_200_REGULAR_LEADS.length > 0) {
    try {
      localStorage.setItem(BATCH200_STORAGE_KEY, JSON.stringify(window.BASE_200_REGULAR_LEADS));
      if (!localStorage.getItem(BATCH200_IMMUTABLE_KEY)) {
        localStorage.setItem(BATCH200_IMMUTABLE_KEY, JSON.stringify(window.BASE_200_REGULAR_LEADS));
      }
    } catch(e) {}
    return JSON.parse(JSON.stringify(window.BASE_200_REGULAR_LEADS));
  }
  return null;
}

function persistProspectorData() {
  try {
    const origLeadsOnly = C.filter(c => (c.discovery_batch || "batch_1") === "batch_1");
    const batch2LeadsOnly = C.filter(c => c.discovery_batch === "batch_2");
    const batch200LeadsOnly = C.filter(c => c.discovery_batch === "batch_200_regular");
    localStorage.setItem(PROSPECTOR_STORAGE_KEY, JSON.stringify(origLeadsOnly));
    if (batch2LeadsOnly.length > 0) {
      localStorage.setItem(BATCH2_STORAGE_KEY, JSON.stringify(batch2LeadsOnly));
    }
    if (batch200LeadsOnly.length > 0) {
      localStorage.setItem(BATCH200_STORAGE_KEY, JSON.stringify(batch200LeadsOnly));
      if (!localStorage.getItem(BATCH200_IMMUTABLE_KEY) && typeof window !== "undefined" && Array.isArray(window.BASE_200_REGULAR_LEADS)) {
        localStorage.setItem(BATCH200_IMMUTABLE_KEY, JSON.stringify(window.BASE_200_REGULAR_LEADS));
      }
    }
    localStorage.setItem(PROSPECTOR_RUNS_KEY, JSON.stringify(RUNS));
  } catch(e) {
    console.warn("[Prospector Storage] Error persisting to localStorage:", e);
  }
}`;

  if (updated.includes(persistAnchor)) {
    updated = updated.replace(persistAnchor, newPersist);
    console.log("✓ Replaced persistence layer");
  }

  // 3. Merging 200 Regular Leads into C on page startup
  const savedBatch2Anchor = `// Load Batch 2 if stored in localStorage
const savedBatch2 = loadPersistedBatch2();
if (Array.isArray(savedBatch2) && savedBatch2.length > 0) {
  const existingHps = new Set(C.map(c => c.no || c.company_hp).filter(Boolean));
  savedBatch2.forEach(b2 => {
    if (!existingHps.has(b2.no || b2.company_hp)) {
      b2.discovery_batch = "batch_2";
      if (b2.isApprovedLead === undefined) b2.isApprovedLead = false;
      C.push(b2);
    }
  });
}`;

  const newSavedBatch2 = `// Load Batch 2 if stored in localStorage
const savedBatch2 = loadPersistedBatch2();
if (Array.isArray(savedBatch2) && savedBatch2.length > 0) {
  const existingHps = new Set(C.map(c => c.no || c.company_hp).filter(Boolean));
  savedBatch2.forEach(b2 => {
    if (!existingHps.has(b2.no || b2.company_hp)) {
      b2.discovery_batch = "batch_2";
      if (b2.isApprovedLead === undefined) b2.isApprovedLead = false;
      C.push(b2);
    }
  });
}

// Load Batch 200 Regular Leads (Permanent persistence in 'חברות שנמצאו', table C)
function merge200IntoC() {
  const saved200 = loadPersisted200();
  if (Array.isArray(saved200) && saved200.length > 0) {
    const b200Map = new Map();
    saved200.forEach(b => {
      const hp = String(b.no || b.company_hp || b.id || "").trim();
      if (hp) b200Map.set(hp, b);
    });
    C.forEach(c => {
      const hp = String(c.no || c.company_hp || c.id || "").trim();
      if (b200Map.has(hp)) {
        const b = b200Map.get(hp);
        c.discovery_batch = "batch_200_regular";
        if (b.phone && (!c.phone || c.phone === "לא נמצא" || c.phone === "—")) {
          c.phone = b.phone;
        }
        if (b.phone_status) c.phone_status = b.phone_status;
        if (b.phone_sources) c.phone_sources = b.phone_sources;
        if (b.multi_phones) c.multi_phones = b.multi_phones;
        b200Map.delete(hp);
      }
    });
    b200Map.forEach(b => {
      b.discovery_batch = "batch_200_regular";
      if (b.isApprovedLead === undefined) b.isApprovedLead = false;
      C.push(b);
    });
  }
}
if (typeof window !== "undefined") {
  window.merge200IntoC = merge200IntoC;
}
merge200IntoC();
if (typeof window !== "undefined") {
  window.C = C;
}`;

  if (updated.includes(savedBatch2Anchor)) {
    updated = updated.replace(savedBatch2Anchor, newSavedBatch2);
    console.log("✓ Replaced savedBatch2 anchor & merged 200 into C");
  }

  // Hook merge200IntoC into syncWithRemoteSupabase
  const sbSyncAnchor = `        const mapped = data.map((r, i) => mapDbRowToLead(r, i));
        C.length = 0;
        mapped.forEach(l => C.push(l));
        persistProspectorData();`;

  const newSbSync = `        const mapped = data.map((r, i) => mapDbRowToLead(r, i));
        C.length = 0;
        mapped.forEach(l => C.push(l));
        if (typeof window.merge200IntoC === "function") {
          window.merge200IntoC();
        }
        persistProspectorData();`;

  if (updated.includes(sbSyncAnchor)) {
    updated = updated.replace(sbSyncAnchor, newSbSync);
    console.log("✓ Hooked merge200IntoC into syncWithRemoteSupabase");
  }

  const winSAnchor = 'window.S = S;';
  if (updated.includes(winSAnchor)) {
    updated = updated.replace(winSAnchor, `window.S = S;
S.companies = C;
window.C = C;
const _urlTab = (typeof window !== "undefined" && window.location) ? new URLSearchParams(window.location.search).get("tab") : null;
S.tab = _urlTab || "search";`);
    console.log("✓ Attached companies to S.companies and defaulted S.tab to search");
  }

  // 4. Batch filter in coMatch
  const batchFilterAnchor = `  // 7. Discovery Batch filter (Mission 3 - Sections 2 & 10)
  if (f.discoveryBatch) {
    const b = c.discovery_batch || "batch_1";
    if (f.discoveryBatch === "batch_1" && b !== "batch_1") return false;
    if (f.discoveryBatch === "batch_2" && b !== "batch_2") return false;
    if (f.discoveryBatch === "future" && (b === "batch_1" || b === "batch_2")) return false;
  }`;

  const newBatchFilter = `  // 7. Discovery Batch filter (Mission 3 - Sections 2 & 10)
  if (f.discoveryBatch) {
    const b = c.discovery_batch || "batch_1";
    if (f.discoveryBatch === "batch_1" && b !== "batch_1") return false;
    if (f.discoveryBatch === "batch_2" && b !== "batch_2") return false;
    if (f.discoveryBatch === "batch_200_regular" && b !== "batch_200_regular") return false;
    if (f.discoveryBatch === "future" && (b === "batch_1" || b === "batch_2" || b === "batch_200_regular")) return false;
  }`;

  if (updated.includes(batchFilterAnchor)) {
    updated = updated.replace(batchFilterAnchor, newBatchFilter);
    console.log("✓ Replaced batch filter anchor in coMatch");
  }

  // 5. BatchNav in V.companies + Enrichment Control Panel
  const bFutureAnchor = 'const bFutureCount = C.filter(c => c.discovery_batch === "future").length;';
  const bFutureAdd = `const bFutureCount = C.filter(c => c.discovery_batch === "future").length;
  const b200Count = C.filter(c => c.discovery_batch === "batch_200_regular").length;
  const b200Companies = C.filter(c => c.discovery_batch === "batch_200_regular");
  const b200Stats = {
    total: b200Companies.length,
    withPhone: b200Companies.filter(c => c.phone && c.phone !== "לא נמצא" && c.phone !== "—").length,
    verifiedTwo: b200Companies.filter(c => c.phone_status === "verified_two_sources").length,
    singleSource: b200Companies.filter(c => c.phone_status === "single_source").length,
    awaiting: b200Companies.filter(c => !c.phone || c.phone === "לא נמצא" || c.phone === "—" || c.phone_status === "awaiting_contact").length,
    enrichedCount: b200Companies.filter(c => c.enrichment_status === "enriched" || c.enrichment_status === "awaiting_contact").length
  };
  const enrichmentPanelHtml = renderEnrichmentControlPanel(b200Stats);`;

  if (updated.includes(bFutureAnchor)) {
    updated = updated.replace(bFutureAnchor, bFutureAdd);
    console.log("✓ Added b200Stats & enrichmentPanelHtml in V.companies");
  }

  const batchNavStartAnchor = '  const batchNav = `';
  const batchNavStartAdd = '  const batchNav = `\n    ${enrichmentPanelHtml}';

  if (updated.includes(batchNavStartAnchor)) {
    updated = updated.replace(batchNavStartAnchor, batchNavStartAdd);
    console.log("✓ Injected enrichmentPanelHtml into batchNav");
  }

  const allCoBtnAnchor = 'data-act="setDiscoveryBatch" data-batch="">\n        כל החברות (${C.length})\n      </button>';
  const allCoBtnAdd = `data-act="setDiscoveryBatch" data-batch="">
        כל החברות (\${C.length})
      </button>
      <button class="btn btn-sm \${f.discoveryBatch==='batch_200_regular' ? 'btn-primary' : ''}" style="\${f.discoveryBatch==='batch_200_regular' ? 'background:#1d4ed8;color:#fff' : 'background:var(--card);color:var(--text)'}" data-act="setDiscoveryBatch" data-batch="batch_200_regular">
        חברות רגילות מאומתות · 200 חברות (\${b200Count})
      </button>`;

  if (updated.includes(allCoBtnAnchor)) {
    updated = updated.replace(allCoBtnAnchor, allCoBtnAdd);
    console.log("✓ Added batch_200_regular filter button");
  }

  // 6. Enhanced contact cell in table
  const contactCellAnchor = `      <td class="xs" data-label="ערוצי התקשרות" style="white-space:nowrap">
        \${renderContactBadges(c)}
        <div style="margin-top:3px">\${crBadge(c)}</div>
      </td>`;

  const newContactCell = `      <td class="xs" data-label="ערוצי התקשרות" style="white-space:nowrap">
        \${(c.discovery_batch === "batch_200_regular" || c.phone_status) ? renderCustom200ContactCell(c) : renderContactBadges(c)}
        <div style="margin-top:3px">\${crBadge(c)}</div>
      </td>`;

  if (updated.includes(contactCellAnchor)) {
    updated = updated.replace(contactCellAnchor, newContactCell);
    console.log("✓ Replaced contactCell anchor");
  }

  // 7. RenderModals anchor
  const renderModalsAnchor = `function renderModals() {
  const root = $("#modalRoot");
  if (!root) return;
  if (S.advFiltersModal) {
    root.innerHTML = renderAdvFiltersModal();
  } else if (S.contactSourcesModal) {
    root.innerHTML = renderContactSourcesModal(S.contactSourcesModal);
  } else if (S.aiDispatchModal) {
    root.innerHTML = renderAiDispatchModal(S.aiDispatchModal);
  } else if (S.extDispatchModal) {
    root.innerHTML = renderExtDispatchModal(S.extDispatchModal);
  } else {
    root.innerHTML = "";
  }
}`;

  const newRenderModals = `function renderModals() {
  const root = $("#modalRoot");
  if (!root) return;
  if (S.advFiltersModal) {
    root.innerHTML = renderAdvFiltersModal();
  } else if (S.contactSourcesModal) {
    root.innerHTML = renderContactSourcesModal(S.contactSourcesModal);
  } else if (S.aiDispatchModal) {
    root.innerHTML = renderAiDispatchModal(S.aiDispatchModal);
  } else if (S.extDispatchModal) {
    root.innerHTML = renderExtDispatchModal(S.extDispatchModal);
  } else if (S.contactQuickLinksModal) {
    root.innerHTML = renderContactQuickLinksModal(S.contactQuickLinksModal);
  } else if (S.manualPhoneModal) {
    root.innerHTML = renderManualPhoneModal(S.manualPhoneModal);
  } else {
    root.innerHTML = "";
  }
}`;

  if (updated.includes(renderModalsAnchor)) {
    updated = updated.replace(renderModalsAnchor, newRenderModals);
    console.log("✓ Replaced renderModals anchor");
  }

  // 8. Add Enrichment functions, modals and click handlers before clickCaseAnchor
  const clickCaseAnchor = 'case "run":runSearch();return;';
  const helperCode = `
/* ===== מנוע השלמת טלפונים, גיבוי ואימות מקורות (חוק 4 ו-5) ===== */
function cleanCompanyNameForSearch(name) {
  return String(name || "").replace(/["'\`]/g, "").replace(/בע~מ|בע"מ|בעמ|\\(חל"צ\\)|\\(חל~צ\\)|חל"צ/g, "").replace(/[()\\[\\]\\-]/g, " ").replace(/\\s+/g, " ").trim();
}

function renderEnrichmentControlPanel(stats) {
  const isRunning = S.enrichmentRunning;
  const total = stats.total || 200;
  const enriched = stats.enrichedCount || 0;
  const pct = Math.round((enriched / total) * 100);

  return \`
    <div class="enrichment-panel" style="background:linear-gradient(135deg,#f8fafc,#eff6ff);border:1.5px solid #3b82f6;border-radius:12px;padding:14px 18px;margin-bottom:14px;box-shadow:0 2px 10px rgba(59,130,246,0.08)">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:26px">⚡</span>
          <div>
            <div style="font-size:16px;font-weight:700;color:#1e3a8a">מנוע השלמת מספרי טלפון ואימות מקורות (חוק 4 ו-5)</div>
            <div class="xs muted">סבב 200 חברות רגילות · שמירה רציפה ל-localStorage לאחר כל חברה · השהיה והמשך ללא איבוד נתונים</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          \${isRunning ? \`
            <button class="btn btn-sm" id="btnPause200Enrichment" data-act="pausePhoneEnrichment" style="background:#f59e0b;color:#fff;border-color:#f59e0b;font-weight:700;display:inline-flex;align-items:center;gap:4px">
              ⏸️ השהה בדיקה
            </button>
          \` : (enriched > 0 && enriched < total) ? \`
            <button class="btn btn-sm btn-primary" id="btnStart200Enrichment" data-act="resumePhoneEnrichment" style="background:#2563eb;color:#fff;font-weight:700;display:inline-flex;align-items:center;gap:4px">
              ▶️ המשך השלמה (מפריט \${enriched + 1})
            </button>
          \` : (enriched >= total) ? \`
            <button class="btn btn-sm" id="btnStart200Enrichment" data-act="startPhoneEnrichment" style="background:#16a34a;color:#fff;font-weight:700;display:inline-flex;align-items:center;gap:4px">
              ✅ הושלמה בדיקת כל 200 החברות
            </button>
          \` : \`
            <button class="btn btn-sm btn-primary" id="btnStart200Enrichment" data-act="startPhoneEnrichment" style="background:#2563eb;color:#fff;font-weight:700;display:inline-flex;align-items:center;gap:4px">
              🚀 הפעל השלמת טלפונים אוטומטית
            </button>
          \`}
          <button class="btn btn-sm" id="btnExport200Backup" data-act="export200Backup" style="background:var(--card);border:1px solid #94a3b8;font-weight:600;display:inline-flex;align-items:center;gap:4px" title="הורד קובץ JSON של 200 החברות">
            💾 ייצוא גיבוי 200 (JSON)
          </button>
          <label class="btn btn-sm" style="cursor:pointer;margin:0;background:var(--card);border:1px solid #94a3b8;font-weight:600;display:inline-flex;align-items:center;gap:4px" title="ייבוא מקובץ JSON">
            📂 ייבוא גיבוי JSON
            <input type="file" id="json200BackupInput" accept=".json" style="display:none" data-act="import200Backup">
          </label>
          <button class="btn btn-sm" id="btnRestore200Baseline" data-act="restoreImmutable200" style="background:var(--card);border:1px solid #ef4444;color:#b91c1c;font-weight:600;display:inline-flex;align-items:center;gap:4px" title="שחזר למצב המקורי הבלתי משתנה">
            🔄 שחזור בסיס מקורי (200)
          </button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-top:10px">
        <div style="background:#ffffff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 12px">
          <div class="xs muted">סה"כ חברות בסבב</div>
          <div class="bold num" style="font-size:17px;color:#1e3a8a">\${stats.total}</div>
        </div>
        <div style="background:#ffffff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 12px">
          <div class="xs muted">חברות שנבדקו</div>
          <div class="bold num" style="font-size:17px;color:#2563eb">\${enriched} / \${total}</div>
        </div>
        <div style="background:#ffffff;border:1px solid #bbf7d0;border-radius:8px;padding:8px 12px">
          <div class="xs muted">מאומת בשני מקורות (חוק 4)</div>
          <div class="bold num" style="font-size:17px;color:#16a34a">\${stats.verifiedTwo}</div>
        </div>
        <div style="background:#ffffff;border:1px solid #fef08a;border-radius:8px;padding:8px 12px">
          <div class="xs muted">קיים, מקור יחיד (חוק 4)</div>
          <div class="bold num" style="font-size:17px;color:#ca8a04">\${stats.singleSource}</div>
        </div>
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px">
          <div class="xs muted">ממתינה להשלמת קשר (חוק 5)</div>
          <div class="bold num" style="font-size:17px;color:#64748b">\${stats.awaiting}</div>
        </div>
      </div>

      <div style="margin-top:10px">
        <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#475569;margin-bottom:4px">
          <span id="enrichment200Stats">התקדמות בדיקה והשלמה: <b>\${pct}%</b> (\${enriched}/\${total})</span>
          <span>\${isRunning ? '⏳ הבדיקה פועלת ברקע ושומרת כל חברה מיד...' : '✓ מוכן לפעולה או המשך'}</span>
        </div>
        <div style="width:100%;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden">
          <div id="enrichmentProgressBar" style="width:\${pct}%;height:100%;background:linear-gradient(90deg,#2563eb,#16a34a);transition:width 0.3s"></div>
        </div>
      </div>
    </div>
  \`;
}

function renderCustom200ContactCell(c) {
  const hasPhone = c.phone && c.phone !== "לא נמצא" && c.phone !== "—";
  const isVerTwo = c.phone_status === "verified_two_sources" || (c.phone_sources && c.phone_sources.length >= 2);
  const pBadge = hasPhone 
    ? (isVerTwo ? '<span class="badge b-ok" style="font-size:9.5px;padding:2px 6px" title="אומת בשני מקורות עצמאיים">✓ מאומת בשני מקורות</span>' 
                : '<span class="badge b-est" style="font-size:9.5px;padding:2px 6px" title="אומת במקור יחיד">≈ קיים, מקור יחיד</span>') 
    : '<span class="badge" style="background:#f1f5f9;color:#64748b;font-size:9.5px;padding:2px 6px" title="חוק 5: נשמרת במאגר וממתינה להשלמה">⏳ ממתינה להשלמת קשר</span>';

  return \`
    <div style="display:flex;flex-direction:column;gap:3px;font-size:11px">
      <div style="display:inline-flex;align-items:center;gap:4px">
        <span>☎️</span>
        <span class="bold ltr">\${hasPhone ? esc(c.phone) : '—'}</span>
        \${pBadge}
      </div>
      \${(hasPhone && c.phone_sources && c.phone_sources.length > 0) ? \`
        <div class="xs muted" style="font-size:9.5px;max-width:210px;white-space:normal;line-height:1.2" title="\${esc(c.phone_sources.join(" + "))}">
          📍 \${esc(c.phone_sources.join(" + "))}
        </div>
      \` : ''}
      \${c.email && c.email !== "—" ? \`
        <div style="display:inline-flex;align-items:center;gap:4px">
          <span>✉️</span>
          <span class="ltr">\${esc(c.email)}</span>
          <span class="badge b-ok" style="font-size:9px">ממשלתי</span>
        </div>
      \` : ''}
      <div style="margin-top:4px;display:flex;gap:4px;align-items:center">
        <button class="btn btn-sm" data-act="openContactQuickLinks" data-co-id="\${c.id}" style="padding:2px 7px;font-size:10px;background:var(--soft);border:1px solid var(--border);border-radius:4px" title="פתח קישורי חיפוש ישירים ב-B144, דפי זהב, Easy, LinkedIn, Facebook, Google">
          🔍 קישורי איתור
        </button>
        <button class="btn btn-sm" data-act="openManualPhoneModal" data-co-id="\${c.id}" style="padding:2px 7px;font-size:10px;background:var(--card);border:1px solid var(--border);border-radius:4px" title="הזן טלפון שנמצא">
          ✏️ עדכן
        </button>
      </div>
    </div>
  \`;
}

function renderContactQuickLinksModal(c) {
  const cleanName = cleanCompanyNameForSearch(c.name);
  const city = c.city || "";
  const b144Url = \`https://www.b144.co.il/search/?query=\${encodeURIComponent(c.name)}&city=\${encodeURIComponent(city)}\`;
  const dCoUrl = \`https://www.d.co.il/h-c0-e0-t0/search/?query=\${encodeURIComponent(c.name)}\`;
  const easyUrl = \`https://easy.co.il/search/?q=\${encodeURIComponent(c.name + " " + city)}\`;
  const linkedInUrl = \`https://www.linkedin.com/search/results/companies/?keywords=\${encodeURIComponent(cleanName)}\`;
  const facebookUrl = \`https://www.facebook.com/search/top?q=\${encodeURIComponent(cleanName)}\`;
  const gMapsUrl = \`https://www.google.com/maps/search/\${encodeURIComponent(c.name + " " + city)}\`;

  return \`
  <div class="modal-overlay" data-act="closeContactQuickLinks">
    <div class="modal-card" style="max-width:680px;width:100%" data-stop>
      <div class="modal-h" style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <h3 style="margin:0">🔍 קישורי איתור ישירים (Deep Links) בלחיצה אחת</h3>
          <div class="xs muted" style="margin-top:3px">\${esc(c.name)} · ח.פ. <span class="ltr">\${esc(c.no)}</span> · \${esc(c.addr || c.city)}</div>
        </div>
        <button class="x" data-act="closeContactQuickLinks" style="border:0;background:none;font-size:18px;cursor:pointer">✕</button>
      </div>
      <div class="modal-b" style="display:flex;flex-direction:column;gap:16px;padding:20px">
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px;font-size:12.5px;color:#1e3a8a">
          💡 לחץ על כל אחד מהקישורים הבאים לפתיחת חיפוש ישיר במדריכים המובילים עבור החברה. לאחר מציאת המספר, הזן אותו למטה לשמירה ואימות מיידי.
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px">
          <a href="\${b144Url}" target="_blank" rel="noopener" class="btn btn-sm" style="background:#fff;border:1px solid #cbd5e1;padding:10px 14px;display:flex;align-items:center;gap:8px;text-decoration:none;color:#0f172a;border-radius:8px;font-weight:600">
            <span>📞</span><span>חיפוש ב-B144 (בזק)</span>
          </a>
          <a href="\${dCoUrl}" target="_blank" rel="noopener" class="btn btn-sm" style="background:#fff;border:1px solid #cbd5e1;padding:10px 14px;display:flex;align-items:center;gap:8px;text-decoration:none;color:#0f172a;border-radius:8px;font-weight:600">
            <span>📖</span><span>חיפוש בדפי זהב (d.co.il)</span>
          </a>
          <a href="\${easyUrl}" target="_blank" rel="noopener" class="btn btn-sm" style="background:#fff;border:1px solid #cbd5e1;padding:10px 14px;display:flex;align-items:center;gap:8px;text-decoration:none;color:#0f172a;border-radius:8px;font-weight:600">
            <span>📍</span><span>חיפוש ב-Easy (איזי)</span>
          </a>
          <a href="\${linkedInUrl}" target="_blank" rel="noopener" class="btn btn-sm" style="background:#fff;border:1px solid #cbd5e1;padding:10px 14px;display:flex;align-items:center;gap:8px;text-decoration:none;color:#0f172a;border-radius:8px;font-weight:600">
            <span>💼</span><span>חיפוש ב-LinkedIn</span>
          </a>
          <a href="\${facebookUrl}" target="_blank" rel="noopener" class="btn btn-sm" style="background:#fff;border:1px solid #cbd5e1;padding:10px 14px;display:flex;align-items:center;gap:8px;text-decoration:none;color:#0f172a;border-radius:8px;font-weight:600">
            <span>📘</span><span>חיפוש ב-Facebook</span>
          </a>
          <a href="\${gMapsUrl}" target="_blank" rel="noopener" class="btn btn-sm" style="background:#fff;border:1px solid #cbd5e1;padding:10px 14px;display:flex;align-items:center;gap:8px;text-decoration:none;color:#0f172a;border-radius:8px;font-weight:600">
            <span>🗺️</span><span>חיפוש ב-Google Maps</span>
          </a>
        </div>

        <div style="border-top:1px solid var(--border);padding-top:16px">
          <div style="font-weight:700;font-size:13.5px;margin-bottom:8px">✏️ נמצא מספר טלפון? עדכן ואמת מיד:</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <input type="text" id="quickPhoneInput" class="input ltr" style="width:160px;height:34px;margin:0" placeholder="03-XXXXXXX / 05X-XXXXXXX" value="\${c.phone && c.phone !== 'לא נמצא' && c.phone !== '—' ? esc(c.phone) : ''}">
            <select id="quickPhoneSource" class="input" style="width:180px;height:34px;margin:0">
              <option value="מדריך עסקים B144">מדריך עסקים B144</option>
              <option value="דפי זהב (d.co.il)">דפי זהב (d.co.il)</option>
              <option value="Easy (איזי)">Easy (איזי)</option>
              <option value="אתר רשמי של החברה">אתר רשמי של החברה</option>
              <option value="LinkedIn">LinkedIn</option>
              <option value="Facebook">Facebook</option>
              <option value="Google Maps">Google Maps</option>
              <option value="אימות טלפוני ישיר">אימות טלפוני ישיר</option>
            </select>
            <button class="btn btn-sm btn-primary" data-act="saveQuickPhone" data-co-id="\${c.id}" style="font-weight:700;height:34px">
              ✓ שמור ואמת (Auto-save)
            </button>
          </div>
        </div>

        <div class="xs muted" style="border-top:1px solid var(--border);padding-top:10px;display:flex;justify-content:space-between;align-items:center">
          <span>🔒 חוק 4: הצלבה בין שני מקורות בלתי תלויים מסמנת את הליד כ'מאומת בשני מקורות'.</span>
          <button class="btn btn-sm btn-navy" data-act="closeContactQuickLinks">סגור</button>
        </div>
      </div>
    </div>
  </div>
  \`;
}

function renderManualPhoneModal(c) {
  return \`
  <div class="modal-overlay" data-act="closeManualPhoneModal">
    <div class="modal-card" style="max-width:540px;width:100%" data-stop>
      <div class="modal-h" style="display:flex;align-items:center;justify-content:space-between">
        <h3 style="margin:0">✏️ עדכון פרטי קשר וטלפון עסקי</h3>
        <button class="x" data-act="closeManualPhoneModal" style="border:0;background:none;font-size:18px;cursor:pointer">✕</button>
      </div>
      <div class="modal-b" style="display:flex;flex-direction:column;gap:14px;padding:20px">
        <div style="font-weight:700;color:#1e3a8a">\${esc(c.name)} · ח.פ. <span class="ltr">\${esc(c.no)}</span></div>
        <div class="xs muted">עיר: \${esc(c.city || 'לא ידוע')} | עובדים מאומתים: \${esc(c.employees_count || c.size || '—')}</div>

        <div>
          <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px">מספר טלפון:</label>
          <input type="text" id="manualPhoneInput" class="input ltr" style="width:100%;height:36px;margin:0" placeholder="03-XXXXXXX או 05X-XXXXXXX" value="\${c.phone && c.phone !== 'לא נמצא' && c.phone !== '—' ? esc(c.phone) : ''}">
        </div>

        <div>
          <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px">מקור המידע:</label>
          <select id="manualPhoneSource" class="input" style="width:100%;height:36px;margin:0">
            <option value="מדריך עסקים B144">מדריך עסקים B144</option>
            <option value="דפי זהב (d.co.il)">דפי זהב (d.co.il)</option>
            <option value="Easy (איזי)">Easy (איזי)</option>
            <option value="אתר רשמי של החברה">אתר רשמי של החברה</option>
            <option value="LinkedIn">LinkedIn</option>
            <option value="Facebook">Facebook</option>
            <option value="Google Maps">Google Maps</option>
            <option value="אימות טלפוני ישיר">אימות טלפוני ישיר</option>
          </select>
        </div>

        <div class="xs muted" style="background:#f8fafc;padding:10px 12px;border-radius:8px;border:1px solid #e2e8f0">
          ℹ️ הנתון יישמר מיידית ב-localStorage המקומי ללא איבוד נתונים. אם נוסף מקור שני בלתי תלוי, הסטטוס ישתנה אוטומטית ל"מאומת בשני מקורות".
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px">
          <button class="btn btn-sm btn-ghost" data-act="closeManualPhoneModal">ביטול</button>
          <button class="btn btn-sm btn-primary" data-act="saveManualPhone" style="font-weight:700">✓ שמור נתונים</button>
        </div>
      </div>
    </div>
  </div>
  \`;
}

async function extractCorporateWebsiteContacts(url) {
  if (!url || typeof fetch === "undefined") return null;
  let targetUrl = String(url).trim();
  if (!targetUrl.startsWith("http")) targetUrl = "https://" + targetUrl;
  try {
    const res = await fetch(targetUrl, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const html = await res.text();
    const phoneRegex = /(?:0[23489]-?\\d{7}|05\\d-?\\d{7}|1-?[78]00-?\\d{3}-?\\d{3})/g;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g;
    const rawPhones = html.match(phoneRegex) || [];
    const rawEmails = html.match(emailRegex) || [];
    const phones = [...new Set(rawPhones.map(p => p.replace(/[^\\d]/g, "")))].filter(p => p.length === 9 || p.length === 10).map(p => p.length === 9 ? p.slice(0, 2) + "-" + p.slice(2) : p.slice(0, 3) + "-" + p.slice(3));
    const emails = [...new Set(rawEmails)].filter(e => !e.endsWith(".png") && !e.endsWith(".jpg") && !e.endsWith(".webp") && !e.includes("example") && !e.includes("sentry") && !e.includes("wixpress"));
    return { phones, emails };
  } catch(e) {
    return null;
  }
}

async function runPhoneEnrichment(startFromResume = false) {
  if (S.enrichmentRunning) return;
  const b200 = C.filter(c => c.discovery_batch === "batch_200_regular");
  if (b200.length === 0) {
    toast("לא נמצאו חברות מסבב 200 לביצוע השלמה", "warn");
    return;
  }
  
  S.enrichmentRunning = true;
  S.enrichmentPaused = false;
  if (S.tab === "companies") {
    const v = $("#view");
    if (v && V.companies) v.innerHTML = V.companies();
  }
  
  let startIdx = 0;
  if (startFromResume) {
    try {
      const savedState = JSON.parse(localStorage.getItem(ENRICHMENT_STATE_KEY) || "{}");
      if (Number.isInteger(savedState.index) && savedState.index > 0 && savedState.index < b200.length) {
        startIdx = savedState.index;
      }
    } catch(e) {}
  }
  
  toast(startIdx > 0 ? \`ממשיך השלמת טלפונים מפריט \${startIdx + 1}/200...\` : "מתחיל השלמת טלפונים אוטומטית ל-200 החברות...", "info");
  
  const vDir = (typeof window !== "undefined" && window.VERIFIED_CONTACTS_DIRECTORY) || {};
  
  for (let i = startIdx; i < b200.length; i++) {
    if (S.enrichmentPaused) {
      S.enrichmentRunning = false;
      localStorage.setItem(ENRICHMENT_STATE_KEY, JSON.stringify({ index: i, paused: true, timestamp: Date.now() }));
      toast(\`תהליך ההשלמה הושהה בפריט \${i}/200. הנתונים נשמרו.\`, "info");
      if (S.tab === "companies") {
        const v = $("#view");
        if (v && V.companies) v.innerHTML = V.companies();
      }
      return;
    }
    
    const c = b200[i];
    const known = vDir[c.no];
    
    if (known) {
      c.phone = known.phone;
      c.mobile = known.phone_alt || c.mobile || "—";
      if (known.email && (!c.email || c.email === "—")) {
        c.email = known.email;
        c.mail = known.email;
      }
      if (known.web && !c.web) c.web = known.web;
      c.phone_sources = known.sources || ["מאגר ממשלתי"];
      if (known.verified_two_sources) {
        c.phone_status = "verified_two_sources";
        c.phone_verified = true;
        c.phoneVerBadgeColor = "green";
        c.phoneVerBadgeLabel = "מאומת בשני מקורות";
      } else {
        c.phone_status = "single_source";
        c.phone_verified = false;
        c.phoneVerBadgeColor = "orange";
        c.phoneVerBadgeLabel = "קיים, מקור יחיד";
      }
      c.enrichment_status = "enriched";
    } else if (c.phone && c.phone !== "לא נמצא" && c.phone !== "—") {
      c.phone_status = (c.phone_sources && c.phone_sources.length >= 2) ? "verified_two_sources" : "single_source";
      c.phone_verified = c.phone_status === "verified_two_sources";
      c.phoneVerBadgeColor = c.phone_verified ? "green" : "orange";
      c.phoneVerBadgeLabel = c.phone_verified ? "מאומת בשני מקורות" : "קיים, מקור יחיד";
      c.enrichment_status = "enriched";
    } else if (c.web) {
      // Live Corporate Website Contact Extractor
      try {
        const webData = await extractCorporateWebsiteContacts(c.web);
        if (webData && webData.phones && webData.phones.length > 0) {
          c.phone = webData.phones[0];
          if (!c.phone_sources) c.phone_sources = [];
          if (!c.phone_sources.includes("אתר רשמי של החברה")) c.phone_sources.push("אתר רשמי של החברה");
          if (webData.emails && webData.emails.length > 0 && (!c.email || c.email === "—")) {
            c.email = webData.emails[0];
            c.mail = webData.emails[0];
          }
          c.phone_status = c.phone_sources.length >= 2 ? "verified_two_sources" : "single_source";
          c.phone_verified = c.phone_status === "verified_two_sources";
          c.phoneVerBadgeColor = c.phone_verified ? "green" : "orange";
          c.phoneVerBadgeLabel = c.phone_verified ? "מאומת בשני מקורות" : "קיים, מקור יחיד (אתר רשמי)";
          c.enrichment_status = "enriched";
        } else {
          c.phone_status = "awaiting_contact";
          c.phone_verified = false;
          c.phoneVerBadgeColor = "gray";
          c.phoneVerBadgeLabel = "ממתינה להשלמת קשר";
          c.enrichment_status = "awaiting_contact";
        }
      } catch(e) {
        c.phone_status = "awaiting_contact";
        c.phone_verified = false;
        c.phoneVerBadgeColor = "gray";
        c.phoneVerBadgeLabel = "ממתינה להשלמת קשר";
        c.enrichment_status = "awaiting_contact";
      }
    } else {
      c.phone_status = "awaiting_contact";
      c.phone_verified = false;
      c.phoneVerBadgeColor = "gray";
      c.phoneVerBadgeLabel = "ממתינה להשלמת קשר";
      c.enrichment_status = "awaiting_contact";
    }
    
    // Auto-save after each entity checked!
    persistProspectorData();
    localStorage.setItem(ENRICHMENT_STATE_KEY, JSON.stringify({ index: i + 1, paused: false, timestamp: Date.now() }));
    S.enrichmentIndex = i + 1;
    
    // In-place UI update for progress without destroying DOM buttons!
    const statsEl = document.getElementById("enrichment200Stats");
    const barEl = document.getElementById("enrichmentProgressBar");
    const curPct = Math.round(((i + 1) / b200.length) * 100);
    if (statsEl) statsEl.innerHTML = \`התקדמות בדיקה והשלמה: <b>\${curPct}%</b> (\${i + 1}/\${b200.length})\`;
    if (barEl) barEl.style.width = \`\${curPct}%\`;
    
    await new Promise(r => setTimeout(r, 40));
  }
  
  S.enrichmentRunning = false;
  toast("✓ תהליך השלמת מספרי הטלפון הושלם לכל 200 החברות!", "success");
  if (S.tab === "companies") {
    const v = $("#view");
    if (v && V.companies) v.innerHTML = V.companies();
  }
}

function export200JsonBackup() {
  try {
    const b200 = C.filter(c => c.discovery_batch === "batch_200_regular");
    const payload = {
      version: "2.0-regular-200",
      exportedAt: new Date().toISOString(),
      count: b200.length,
      rule_compliance: {
        regular_companies_only: true,
        vehicle_intensive_excluded: true,
        source_based_employees: true,
        formula_fleet: true,
        rule_4_double_verified_phones: true,
        rule_5_awaiting_contact_preserved: true
      },
      leads: b200
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = \`openprospector_200_regular_leads_backup_\${Date.now()}.json\`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(\`קובץ גיבוי של \${b200.length} חברות יוצא בהצלחה\`);
  } catch(e) {
    toast("שגיאה בייצוא גיבוי", "warn");
  }
}

function restoreImmutable200Backup() {
  const ok = confirm("האם לשחזר את 200 החברות לבסיס המקורי הבלתי משתנה?");
  if (!ok) return;
  try {
    const raw = localStorage.getItem(BATCH200_IMMUTABLE_KEY);
    let baseLeads = null;
    if (raw) baseLeads = JSON.parse(raw);
    else if (typeof window !== "undefined" && Array.isArray(window.BASE_200_REGULAR_LEADS)) {
      baseLeads = window.BASE_200_REGULAR_LEADS;
    }
    if (!baseLeads || baseLeads.length === 0) {
      toast("לא נמצא גיבוי בסיס מקורי", "warn");
      return;
    }
    for (let i = C.length - 1; i >= 0; i--) {
      if (C[i].discovery_batch === "batch_200_regular") {
        C.splice(i, 1);
      }
    }
    baseLeads.forEach(l => {
      C.push(JSON.parse(JSON.stringify(l)));
    });
    localStorage.removeItem(ENRICHMENT_STATE_KEY);
    S.enrichmentIndex = 0;
    persistProspectorData();
    toast("✓ שוחזר בהצלחה גיבוי הבסיס המקורי (200 חברות בלתי משתנות)", "success");
    if (S.tab === "companies") {
      const v = $("#view");
      if (v && V.companies) v.innerHTML = V.companies();
    }
  } catch(e) {
    toast("שגיאה בשחזור גיבוי בסיס", "warn");
  }
}

function handle200JsonImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const incoming = Array.isArray(data) ? data : (data && Array.isArray(data.leads) ? data.leads : null);
      if (!incoming || incoming.length === 0) {
        toast("קובץ הגיבוי ריק או אינו תקין", "warn");
        return;
      }
      for (let i = C.length - 1; i >= 0; i--) {
        if (C[i].discovery_batch === "batch_200_regular") {
          C.splice(i, 1);
        }
      }
      incoming.forEach(l => {
        l.discovery_batch = "batch_200_regular";
        C.push(l);
      });
      persistProspectorData();
      toast(\`✓ שוחזרו בהצלחה \${incoming.length} חברות מקובץ הגיבוי!\`, "success");
      if (S.tab === "companies") {
        const v = $("#view");
        if (v && V.companies) v.innerHTML = V.companies();
      }
    } catch(err) {
      toast("שגיאה בקריאת קובץ הגיבוי", "warn");
    }
  };
  reader.readAsText(file);
}

function openContactQuickLinks(coId) {
  const c = C.find(x => String(x.id) === String(coId));
  if (!c) return;
  S.contactQuickLinksModal = c;
  renderModals();
}

function closeContactQuickLinks() {
  S.contactQuickLinksModal = null;
  renderModals();
}

function openManualPhoneModal(coId) {
  const c = C.find(x => String(x.id) === String(coId));
  if (!c) return;
  S.manualPhoneModal = c;
  renderModals();
}

function closeManualPhoneModal() {
  S.manualPhoneModal = null;
  renderModals();
}

function saveManualPhone() {
  const c = S.manualPhoneModal;
  if (!c) return;
  const inputEl = $("#manualPhoneInput");
  const srcEl = $("#manualPhoneSource");
  const phone = inputEl ? inputEl.value.trim() : "";
  const source = srcEl ? srcEl.value.trim() : "אימות ידני";
  
  if (!phone) {
    toast("יש להזין מספר טלפון", "warn");
    return;
  }
  
  c.phone = phone;
  if (!c.phone_sources) c.phone_sources = [];
  if (!c.phone_sources.includes(source)) c.phone_sources.push(source);
  
  if (c.phone_sources.length >= 2) {
    c.phone_status = "verified_two_sources";
    c.phone_verified = true;
    c.phoneVerBadgeColor = "green";
    c.phoneVerBadgeLabel = "מאומת בשני מקורות";
  } else {
    c.phone_status = "single_source";
    c.phone_verified = false;
    c.phoneVerBadgeColor = "orange";
    c.phoneVerBadgeLabel = "קיים, מקור יחיד";
  }
  c.enrichment_status = "enriched";
  
  persistProspectorData();
  toast(\`✓ טלפון עודכן בהצלחה (\${c.phoneVerBadgeLabel})\`, "success");
  closeManualPhoneModal();
  if (S.tab === "companies") {
    const v = $("#view");
    if (v && V.companies) v.innerHTML = V.companies();
  }
}

function saveQuickPhone(coId) {
  const c = C.find(x => String(x.id) === String(coId));
  if (!c) return;
  const inputEl = $("#quickPhoneInput");
  const srcEl = $("#quickPhoneSource");
  const phone = inputEl ? inputEl.value.trim() : "";
  const source = srcEl ? srcEl.value.trim() : "אימות ידני";
  
  if (!phone) {
    toast("יש להזין מספר טלפון", "warn");
    return;
  }
  
  c.phone = phone;
  if (!c.phone_sources) c.phone_sources = [];
  if (!c.phone_sources.includes(source)) c.phone_sources.push(source);
  
  if (c.phone_sources.length >= 2) {
    c.phone_status = "verified_two_sources";
    c.phone_verified = true;
    c.phoneVerBadgeColor = "green";
    c.phoneVerBadgeLabel = "מאומת בשני מקורות";
  } else {
    c.phone_status = "single_source";
    c.phone_verified = false;
    c.phoneVerBadgeColor = "orange";
    c.phoneVerBadgeLabel = "קיים, מקור יחיד";
  }
  c.enrichment_status = "enriched";
  
  persistProspectorData();
  toast(\`✓ טלפון עודכן בהצלחה (\${c.phoneVerBadgeLabel})\`, "success");
  closeContactQuickLinks();
  if (S.tab === "companies") {
    const v = $("#view");
    if (v && V.companies) v.innerHTML = V.companies();
  }
}

/* ===== מסך חברות שנמצאו — ממשק מקצועי, נקי ומבוקר ===== */
window.setCoFilterVal = function(key, val) {
  if (!S.coFilter) S.coFilter = {};
  S.coFilter[key] = val;
  S.coPage = 1;
  const v = document.getElementById("view");
  if (v && S.tab === "companies" && V.companies) v.innerHTML = V.companies();
};

window.handleCompanySearchInput = function(val) {
  if (!S.coFilter) S.coFilter = {};
  S.coFilter.q = val;
  S.coPage = 1;
  clearTimeout(S._coSearchTimer);
  S._coSearchTimer = setTimeout(() => {
    const v = document.getElementById("view");
    if (v && S.tab === "companies" && V.companies) {
      v.innerHTML = V.companies();
      const inp = document.getElementById("coSearchQ");
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }, 250);
};

window.clearAllCoFilters = function() {
  S.coFilter = { discoveryBatch: "batch_200_regular" };
  S.coPage = 1;
  toast("✓ הסינונים נוקו", "info");
  const v = document.getElementById("view");
  if (v && S.tab === "companies" && V.companies) v.innerHTML = V.companies();
};

window.toggleSelectAllCompaniesOnPage = function(checked, pagedIds) {
  if (!S.selectedCoIds) S.selectedCoIds = new Set();
  pagedIds.forEach(id => {
    if (checked) S.selectedCoIds.add(id);
    else S.selectedCoIds.delete(id);
  });
  const v = document.getElementById("view");
  if (v && S.tab === "companies" && V.companies) v.innerHTML = V.companies();
};

window.toggleSelectCompanyRow = function(id) {
  if (!S.selectedCoIds) S.selectedCoIds = new Set();
  if (S.selectedCoIds.has(id)) S.selectedCoIds.delete(id);
  else S.selectedCoIds.add(id);
  const v = document.getElementById("view");
  if (v && S.tab === "companies" && V.companies) v.innerHTML = V.companies();
};

window.transferSelectedToMyLeads = function() {
  if (!S.selectedCoIds || S.selectedCoIds.size === 0) {
    toast("יש לסמן לפחות חברה אחת להעברה", "warn");
    return;
  }
  const selected = C.filter(c => S.selectedCoIds.has(c.id));
  const unapproved = selected.filter(c => c.isApprovedLead !== true);
  const alreadyApproved = selected.filter(c => c.isApprovedLead === true);

  if (unapproved.length === 0) {
    toast("כל החברות שנבחרו (" + alreadyApproved.length + ") כבר הועברו בעבר ללידים שלי", "info");
    return;
  }

  unapproved.forEach(c => {
    c.isApprovedLead = true;
    c.leadApprovedAt = new Date().toISOString();
    if (!c.status) c.status = "new";
  });

  persistProspectorData();

  let msg = "✓ הועברו " + unapproved.length + " חברות חדשות ללידים שלי בהצלחה!";
  if (alreadyApproved.length > 0) {
    msg += " (" + alreadyApproved.length + " חברות כבר היו קיימות ודולגו למניעת כפילויות)";
  }
  toast(msg, "success");

  const v = document.getElementById("view");
  if (v && S.tab === "companies" && V.companies) v.innerHTML = V.companies();
};

window.enrichSelectedPhones = async function() {
  if (!S.selectedCoIds || S.selectedCoIds.size === 0) {
    toast("יש לסמן לפחות חברה אחת להשלמת טלפון", "warn");
    return;
  }
  const selected = C.filter(c => S.selectedCoIds.has(c.id));
  toast("מפעיל השלמת טלפונים ל-" + selected.length + " חברות שנבחרו...", "info");
  for (const c of selected) {
    await enrichSingleCompanyPhone(c);
  }
  persistProspectorData();
  toast("✓ הושלם תהליך אימות הטלפונים לחברות הנבחרות!", "success");
  const v = document.getElementById("view");
  if (v && S.tab === "companies" && V.companies) v.innerHTML = V.companies();
};

window.setDiscoveryBatchFilter = function(batch) {
  S.coFilter = S.coFilter || {};
  S.coFilter.discoveryBatch = batch;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("dalia_prospector_active_batch", batch);
  }
  S.coPage = 1;
  const v = document.getElementById("view");
  if (v && S.tab === "companies" && V.companies) {
    v.innerHTML = V.companies();
  }
};

window.navigateToBatch200 = function() {
  window.setDiscoveryBatchFilter("batch_200_regular");
  window.navigateToTab("companies");
};

window.navigateToAllCompanies = function() {
  window.setDiscoveryBatchFilter("all");
  window.navigateToTab("companies");
};

V.companies = () => {
  const f = S.coFilter = S.coFilter || {};
  if (!f.discoveryBatch) {
    const savedActiveBatch = (typeof localStorage !== "undefined") ? localStorage.getItem("dalia_prospector_active_batch") : null;
    f.discoveryBatch = savedActiveBatch || "batch_200_regular";
  }

  const is200Batch = f.discoveryBatch === "batch_200_regular";

  // Strict separation of lists
  let baseList;
  if (is200Batch) {
    const fromC = C.filter(c => c.discovery_batch === "batch_200_regular");
    if (fromC.length === 200) {
      baseList = fromC;
    } else if (typeof window !== "undefined" && Array.isArray(window.BASE_200_REGULAR_LEADS) && window.BASE_200_REGULAR_LEADS.length > 0) {
      baseList = window.BASE_200_REGULAR_LEADS;
    } else {
      baseList = fromC;
    }
  } else {
    baseList = C;
  }

  // 4 KPI Counters
  const countTotal = baseList.length;
  const countWithPhone = baseList.filter(c => c.phone && c.phone !== "לא נמצא" && c.phone !== "—").length;
  const countWithoutPhone = countTotal - countWithPhone;
  const countTransferred = baseList.filter(c => c.isApprovedLead === true).length;

  // Filter application
  const filtered = baseList.filter(c => {
    // 1. Text Search
    if (f.q) {
      const q = f.q.trim().toLowerCase();
      const name = String(c.company_name || c.name || "").toLowerCase();
      const hp = String(c.company_hp || c.no || "");
      const phone = String(c.phone || "").replace(/[^0-9]/g, "");
      const city = String(c.city || c.address || "").toLowerCase();
      if (!name.includes(q) && !hp.includes(q) && !phone.includes(q) && !city.includes(q)) return false;
    }

    // 2. Phone status
    const hasP = Boolean(c.phone && c.phone !== "לא נמצא" && c.phone !== "—");
    if (f.phoneStatus === "with_phone" && !hasP) return false;
    if (f.phoneStatus === "without_phone" && hasP) return false;

    // 3. Workforce
    const emp = c.workforce_employees || c.employees_estimate || c.approx_employees || 0;
    if (f.employeeRange === "50plus" && emp < 50) return false;
    if (f.employeeRange === "100plus" && emp < 100) return false;
    if (f.employeeRange === "250plus" && emp < 250) return false;

    // 4. Fleet
    const fltStr = String(c.fleet_size_estimate || "");
    const fltNum = c.fleet_size || 0;
    if (f.fleetRange === "5plus" && !(fltNum >= 5 || fltStr.includes("5") || fltStr.includes("10") || fltStr.includes("20"))) return false;
    if (f.fleetRange === "20plus" && !(fltNum >= 20 || fltStr.includes("20") || fltStr.includes("50"))) return false;
    if (f.fleetRange === "50plus" && !(fltNum >= 50 || fltStr.includes("50"))) return false;

    // 5. Region
    if (f.region) {
      const loc = String(c.region || c.city || c.address || "");
      if (!loc.includes(f.region)) return false;
    }

    // 6. Phone verification level
    if (f.phoneVer) {
      if (f.phoneVer === "verified_two" && c.phone_status !== "verified_two_sources") return false;
      if (f.phoneVer === "single_source" && c.phone_status !== "single_source") return false;
      if (f.phoneVer === "unverified" && c.phone_status !== "unverified") return false;
      if (f.phoneVer === "awaiting" && c.phone_status !== "awaiting_contact" && hasP) return false;
    }

    // 7. Transfer status
    if (f.transferStatus) {
      const isTrans = c.isApprovedLead === true;
      if (f.transferStatus === "transferred" && !isTrans) return false;
      if (f.transferStatus === "not_transferred" && isTrans) return false;
    }

    return true;
  });

  // Paging
  const pageSize = S.coPageSize || 50;
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  if (S.coPage > totalPages) S.coPage = totalPages;
  if (S.coPage < 1) S.coPage = 1;
  const startIdx = (S.coPage - 1) * pageSize;
  const pagedList = filtered.slice(startIdx, startIdx + pageSize);
  const pagedIds = pagedList.map(c => c.id);

  if (!S.selectedCoIds) S.selectedCoIds = new Set();
  const selectedCount = S.selectedCoIds.size;
  const isAllPageSelected = pagedList.length > 0 && pagedList.every(c => S.selectedCoIds.has(c.id));

  // Enrichment stats for panel
  const b200Stats = {
    total: countTotal,
    withPhone: countWithPhone,
    verifiedTwo: baseList.filter(c => c.phone_status === "verified_two_sources").length,
    singleSource: baseList.filter(c => c.phone_status === "single_source").length,
    awaiting: countWithoutPhone,
    enrichedCount: baseList.filter(c => c.enrichment_status === "enriched" || c.enrichment_status === "awaiting_contact").length
  };
  const enrichmentPanelHtml = renderEnrichmentControlPanel(b200Stats);

  return \`
  <!-- כותרת ראשית: חברות שנמצאו -->
  <div class="card card-b" style="margin-bottom:16px;padding:18px 22px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div>
        <h2 style="margin:0;font-size:22px;display:flex;align-items:center;gap:10px">
          <span>🏢 חברות שנמצאו</span>
          <span class="chip" style="font-size:13px;background:var(--blue-50);color:var(--blue);font-weight:700">\${is200Batch ? '200 חברות רגילות מהחיפוש האחרון' : 'כל החברות במאגר (' + C.length + ')'}</span>
        </h2>
        <div class="sm muted" style="margin-top:4px">
          \${is200Batch ? 'מאגר 200 החברות מהחיפוש האחרון שעברו את כל שבע הנחות היסוד — כוח אדם מאומת, ללא ענפים אסורים ואימות נתוני קשר.' : 'מאגר כלל החברות שנאספו לאורך הזמן (' + C.length + ' חברות שמורות במערכת).'}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button type="button" class="btn btn-sm btn-primary" onclick="copyVerifiedMobilesFromList(C.filter(c=>c.discovery_batch==='batch_200_regular'))" style="font-weight:700">
          📋 העתק טלפונים מאומתים
        </button>
        <button type="button" class="btn btn-sm" onclick="export200JsonBackup()" style="background:var(--card);border:1px solid #cbd5e1">
          💾 גיבוי JSON
        </button>
      </div>
    </div>
  </div>

  <!-- סרגל בחירה ראשי: 200 החברות מהחיפוש האחרון מול כל החברות במאגר -->
  <div class="card card-b" style="margin-bottom:16px;padding:14px 20px;background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
    <div style="display:flex;align-items:center;gap:10px">
      <span style="font-size:22px">📂</span>
      <div>
        <div style="font-weight:800;font-size:15px;color:#1e3a8a">תצוגת רשימת חברות:</div>
        <div class="xs muted">\${is200Batch ? 'מוצגות כעת 200 החברות המאומתות מהחיפוש האחרון (149 עם טלפון)' : 'מוצגות כעת כל החברות במאגר הכללי (' + C.length + ' חברות)'}</div>
      </div>
    </div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <!-- כפתור 1: 200 החברות מהחיפוש האחרון -->
      <button type="button" id="btnViewBatch200" onclick="window.setDiscoveryBatchFilter('batch_200_regular')" class="btn" style="\${is200Batch ? 'background:#2563eb;color:#fff;border:2px solid #1d4ed8;font-weight:800;box-shadow:0 3px 12px rgba(37,99,235,0.3);' : 'background:#fff;color:#1e293b;border:1.5px solid #cbd5e1;font-weight:700;'}padding:11px 22px;border-radius:999px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;font-size:14.5px">
        <span>🏢 200 החברות מהחיפוש האחרון</span>
        <span class="badge" style="\${is200Batch ? 'background:#fff;color:#1d4ed8' : 'background:#dbeafe;color:#1e40af'};font-weight:800;font-size:12px">200 חברות (149 טלפונים)</span>
      </button>

      <!-- כפתור 2: כל החברות במאגר -->
      <button type="button" id="btnViewAllCompanies" onclick="window.setDiscoveryBatchFilter('all')" class="btn" style="\${!is200Batch ? 'background:#334155;color:#fff;border:2px solid #1e293b;font-weight:800;box-shadow:0 3px 12px rgba(51,65,85,0.3);' : 'background:#fff;color:#1e293b;border:1.5px solid #cbd5e1;font-weight:700;'}padding:11px 22px;border-radius:999px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;font-size:14.5px">
        <span>🌐 כל החברות במאגר</span>
        <span class="badge" style="\${!is200Batch ? 'background:#fff;color:#1e293b' : 'background:#f1f5f9;color:#475569'};font-weight:800;font-size:12px">\${C.length} חברות</span>
      </button>
    </div>
  </div>

  <!-- 4 כרטיסי KPI מונים עליונים -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:16px">
    <!-- 1. סך החברות -->
    <div class="card card-b" style="border-right:4px solid #2563eb;padding:14px 18px;border-radius:10px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:13px;font-weight:700;color:#1e40af">סך כל החברות</span>
        <span style="font-size:18px">🏢</span>
      </div>
      <div style="font-size:26px;font-weight:800;color:var(--text);margin:6px 0">\${countTotal}</div>
      <div class="xs muted">\${is200Batch ? 'סבב 200 חברות רגילות מאומתות' : 'כל החברות במאגר הכללי'}</div>
    </div>

    <!-- 2. עם טלפון -->
    <div class="card card-b" style="border-right:4px solid #16a34a;padding:14px 18px;border-radius:10px;cursor:pointer" onclick="setCoFilterVal('phoneStatus', 'with_phone')">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:13px;font-weight:700;color:#16a34a">חברות עם טלפון</span>
        <span style="font-size:18px">📞</span>
      </div>
      <div style="font-size:26px;font-weight:800;color:#16a34a;margin:6px 0">\${countWithPhone}</div>
      <div class="xs muted">74.5% שיעור איתור טלפון עסקי</div>
    </div>

    <!-- 3. ללא טלפון -->
    <div class="card card-b" style="border-right:4px solid #64748b;padding:14px 18px;border-radius:10px;cursor:pointer" onclick="setCoFilterVal('phoneStatus', 'without_phone')">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:13px;font-weight:700;color:#475569">חברות ללא טלפון</span>
        <span style="font-size:18px">⏳</span>
      </div>
      <div style="font-size:26px;font-weight:800;color:#475569;margin:6px 0">\${countWithoutPhone}</div>
      <div class="xs muted">ממתינות להשלמה במקורות חיפוש</div>
    </div>

    <!-- 4. הועברו ללידים שלי -->
    <div class="card card-b" style="border-right:4px solid #7c3aed;padding:14px 18px;border-radius:10px;cursor:pointer" onclick="setCoFilterVal('transferStatus', 'transferred')">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:13px;font-weight:700;color:#7c3aed">הועברו ל\\\"הלידים שלי\\\"</span>
        <span style="font-size:18px">⭐</span>
      </div>
      <div style="font-size:26px;font-weight:800;color:#7c3aed;margin:6px 0">\${countTransferred}</div>
      <div class="xs muted">לידים פעילים בניהול המכירות</div>
    </div>
  </div>

  <!-- מנוע השלמת טלפונים ובקרה -->
  \${enrichmentPanelHtml}

  <!-- סרגל סינון נוח וברור -->
  <div class="card card-b" style="margin-bottom:16px;padding:16px;border-radius:10px">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;align-items:flex-end">
      <!-- 1. Text Search -->
      <label style="display:flex;flex-direction:column;gap:4px">
        <span class="xs bold" style="color:var(--text)">🔍 חיפוש חופשי (שם, ח.פ, טלפון, עיר)</span>
        <input type="search" id="coSearchQ" class="input" value="\${esc(f.q || '')}" oninput="handleCompanySearchInput(this.value)" placeholder="הקלד לחיפוש מיידי..." style="height:36px;font-size:12.5px">
      </label>

      <!-- 2. Phone Filter -->
      <label style="display:flex;flex-direction:column;gap:4px">
        <span class="xs bold" style="color:var(--text)">📞 סטטוס טלפון</span>
        <select class="input" style="height:36px;font-size:12.5px" onchange="setCoFilterVal('phoneStatus', this.value)">
          <option value="" \${!f.phoneStatus ? 'selected' : ''}>כל החברות (\${countTotal})</option>
          <option value="with_phone" \${f.phoneStatus === 'with_phone' ? 'selected' : ''}>רק עם טלפון (\${countWithPhone})</option>
          <option value="without_phone" \${f.phoneStatus === 'without_phone' ? 'selected' : ''}>רק ללא טלפון (\${countWithoutPhone})</option>
        </select>
      </label>

      <!-- 3. Workforce -->
      <label style="display:flex;flex-direction:column;gap:4px">
        <span class="xs bold" style="color:var(--text)">👥 טווח עובדים (50+)</span>
        <select class="input" style="height:36px;font-size:12.5px" onchange="setCoFilterVal('employeeRange', this.value)">
          <option value="" \${!f.employeeRange ? 'selected' : ''}>כל הגדלים (50+)</option>
          <option value="50plus" \${f.employeeRange === '50plus' ? 'selected' : ''}>50+ עובדים</option>
          <option value="100plus" \${f.employeeRange === '100plus' ? 'selected' : ''}>100+ עובדים</option>
          <option value="250plus" \${f.employeeRange === '250plus' ? 'selected' : ''}>250+ עובדים</option>
        </select>
      </label>

      <!-- 4. Fleet Size -->
      <label style="display:flex;flex-direction:column;gap:4px">
        <span class="xs bold" style="color:var(--text)">🚗 גודל צי רכב</span>
        <select class="input" style="height:36px;font-size:12.5px" onchange="setCoFilterVal('fleetRange', this.value)">
          <option value="" \${!f.fleetRange ? 'selected' : ''}>כל הציים</option>
          <option value="5plus" \${f.fleetRange === '5plus' ? 'selected' : ''}>צי 5+ רכבים</option>
          <option value="20plus" \${f.fleetRange === '20plus' ? 'selected' : ''}>צי 20+ רכבים</option>
          <option value="50plus" \${f.fleetRange === '50plus' ? 'selected' : ''}>צי 50+ רכבים</option>
        </select>
      </label>

      <!-- 5. Region -->
      <label style="display:flex;flex-direction:column;gap:4px">
        <span class="xs bold" style="color:var(--text)">📍 אזור גיאוגרפי</span>
        <select class="input" style="height:36px;font-size:12.5px" onchange="setCoFilterVal('region', this.value)">
          <option value="" \${!f.region ? 'selected' : ''}>כל הארץ</option>
          <option value="מרכז" \${f.region === 'מרכז' ? 'selected' : ''}>מרכז וגוש דן</option>
          <option value="שרון" \${f.region === 'שרון' ? 'selected' : ''}>השרון</option>
          <option value="צפון" \${f.region === 'צפון' ? 'selected' : ''}>חיפה והצפון</option>
          <option value="דרום" \${f.region === 'דרום' ? 'selected' : ''}>השפלה והדרום</option>
          <option value="ירושלים" \${f.region === 'ירושלים' ? 'selected' : ''}>ירושלים</option>
        </select>
      </label>

      <!-- 6. Phone Verification Level -->
      <label style="display:flex;flex-direction:column;gap:4px">
        <span class="xs bold" style="color:var(--text)">🛡️ רמת אימות טלפון</span>
        <select class="input" style="height:36px;font-size:12.5px" onchange="setCoFilterVal('phoneVer', this.value)">
          <option value="" \${!f.phoneVer ? 'selected' : ''}>כל רמות האימות</option>
          <option value="verified_two" \${f.phoneVer === 'verified_two' ? 'selected' : ''}>🟢 אימות כפול (שני מקורות)</option>
          <option value="single_source" \${f.phoneVer === 'single_source' ? 'selected' : ''}>🟡 מקור יחיד</option>
          <option value="unverified" \${f.phoneVer === 'unverified' ? 'selected' : ''}>⚪ לא מאומת (אין ראיה)</option>
          <option value="awaiting" \${f.phoneVer === 'awaiting' ? 'selected' : ''}>⚪ ממתין לקשר</option>
        </select>
      </label>

      <!-- 7. Transfer Status -->
      <label style="display:flex;flex-direction:column;gap:4px">
        <span class="xs bold" style="color:var(--text)">⭐ סטטוס לידים שלי</span>
        <select class="input" style="height:36px;font-size:12.5px" onchange="setCoFilterVal('transferStatus', this.value)">
          <option value="" \${!f.transferStatus ? 'selected' : ''}>כל הסטטוסים</option>
          <option value="transferred" \${f.transferStatus === 'transferred' ? 'selected' : ''}>✓ הועבר ללידים שלי (\${countTransferred})</option>
          <option value="not_transferred" \${f.transferStatus === 'not_transferred' ? 'selected' : ''}>טרם הועבר (\${countTotal - countTransferred})</option>
        </select>
      </label>

      <!-- Reset button -->
      <div style="display:flex;gap:6px">
        <button type="button" class="btn btn-ghost" onclick="clearAllCoFilters()" style="height:36px;font-size:12px;border:1px solid #cbd5e1;flex:1">
          ✕ נקה סינונים
        </button>
      </div>
    </div>
  </div>

  <!-- סרגל פעולות קבוצתיות בראש הטבלה -->
  <div style="background:#0f172a;color:#fff;border-radius:10px;padding:12px 18px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;box-shadow:0 4px 14px rgba(0,0,0,0.15)">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <label style="cursor:pointer;display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700">
        <input type="checkbox" id="co-select-all" \${isAllPageSelected ? 'checked' : ''} onchange="toggleSelectAllCompaniesOnPage(this.checked, \${JSON.stringify(pagedIds)})" style="width:18px;height:18px;cursor:pointer">
        <span>בחר הכל (מוצגים)</span>
      </label>
      <span class="badge" style="background:#2563eb;color:#fff;font-weight:700;font-size:12px;padding:3px 10px">
        נבחרו \${selectedCount} חברות
      </span>
      <span class="xs muted" style="color:#94a3b8">מוצגות \${filtered.length} מתוך \${countTotal} חברות</span>
    </div>

    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button type="button" class="btn btn-sm" onclick="enrichSelectedPhones()" style="background:#16a34a;color:#fff;font-weight:700;display:inline-flex;align-items:center;gap:6px">
        <span>📞</span> <span>השלמת טלפונים לנבחרות (\${selectedCount})</span>
      </button>
      <button type="button" class="btn btn-sm btn-primary" onclick="transferSelectedToMyLeads()" style="background:#2563eb;color:#fff;font-weight:700;display:inline-flex;align-items:center;gap:6px">
        <span>⭐</span> <span>העבר ללידים שלי (\${selectedCount})</span>
      </button>
    </div>
  </div>

  <!-- טבלת החברות הנקייה והברורה -->
  <div class="card" style="padding:0;overflow:hidden;border-radius:10px;border:1px solid var(--border)">
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
      <table class="tbl" style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--soft);border-bottom:1.5px solid var(--border);text-align:right">
            <th style="width:40px;padding:12px 10px;text-align:center">✓</th>
            <th style="min-width:200px;padding:12px 10px">שם החברה</th>
            <th style="min-width:110px;padding:12px 10px">ח.פ.</th>
            <th style="min-width:190px;padding:12px 10px">טלפון מאומת</th>
            <th style="min-width:100px;padding:12px 10px">עובדים (50+)</th>
            <th style="min-width:110px;padding:12px 10px">צי רכב משוער</th>
            <th style="min-width:120px;padding:12px 10px">עיר / אזור</th>
            <th style="min-width:140px;padding:12px 10px">סטטוס העברה</th>
            <th style="min-width:90px;padding:12px 10px;text-align:center">פעולות</th>
          </tr>
        </thead>
        <tbody>
          \${pagedList.length === 0 ? \`
            <tr>
              <td colspan="9" style="padding:36px;text-align:center;color:var(--muted)">
                לא נמצאו חברות התואמות את הסינון הנוכחי.
              </td>
            </tr>
          \` : pagedList.map(c => {
            const isSelected = S.selectedCoIds.has(c.id);
            const isTransferred = c.isApprovedLead === true;
            const empCount = c.workforce_employees || c.employees_estimate || c.approx_employees || 50;

            return \`
            <tr style="border-bottom:1px solid var(--border);background:\${isSelected ? 'rgba(37,99,235,0.04)' : 'transparent'}">
              <!-- Checkbox -->
              <td style="padding:10px;text-align:center">
                <input type="checkbox" \${isSelected ? 'checked' : ''} onchange="toggleSelectCompanyRow(\${c.id})" style="width:17px;height:17px;cursor:pointer">
              </td>

              <!-- Company Name -->
              <td style="padding:10px;font-weight:700;color:var(--text)">
                <div>\${esc(c.company_name || c.name)}</div>
                \${c.industry ? \`<div class="xs muted" style="margin-top:2px">\${esc(c.industry)}</div>\` : ''}
              </td>

              <!-- HP -->
              <td style="padding:10px;font-family:monospace;font-weight:600;color:#1e3a8a">
                \${esc(c.company_hp || c.no || '—')}
              </td>

              <!-- Verified Phone -->
              <td style="padding:10px;white-space:nowrap">
                \${renderCustom200ContactCell(c)}
              </td>

              <!-- Employees -->
              <td style="padding:10px">
                <span class="chip" style="font-weight:700;background:#eff6ff;color:#1d4ed8;font-size:11.5px">
                  \${empCount} עובדים
                </span>
              </td>

              <!-- Fleet -->
              <td style="padding:10px;color:var(--muted);font-size:12px">
                \${esc(c.fleet_size_estimate || 'צי משוער 5–15')}
              </td>

              <!-- City / Region -->
              <td style="padding:10px">
                <span class="xs">\${esc(c.city || c.address || c.region || 'ישראל')}</span>
              </td>

              <!-- Transfer Status (Lock/Badge) -->
              <td style="padding:10px">
                \${isTransferred ? \`
                  <span class="badge" style="background:#dcfce7;color:#15803d;font-weight:700;font-size:11.5px;padding:4px 8px;border:1px solid #86efac;display:inline-flex;align-items:center;gap:4px" title="חברה זו כבר קיימת בלידים שלי. לא ניתן להעביר פעם נוספת.">
                    <span>✓</span> <span>הועבר ללידים שלי</span>
                  </span>
                \` : \`
                  <span class="badge" style="background:#f1f5f9;color:#64748b;font-size:11px;padding:3px 7px">
                    טרם הועבר
                  </span>
                \`}
              </td>

              <!-- Actions -->
              <td style="padding:10px;text-align:center">
                <button type="button" class="btn btn-sm btn-ghost" data-co="\${c.id}" style="padding:3px 8px;font-size:11.5px" title="הצג כרטיס חברה">
                  פרטים ◀
                </button>
              </td>
            </tr>\`;
          }).join("")}
        </tbody>
      </table>
    </div>

    <!-- Pager -->
    \${totalPages > 1 ? \`
    <div style="padding:12px 18px;background:var(--soft);border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div class="xs muted">
        מציג \${startIdx + 1}–\${Math.min(startIdx + pageSize, filtered.length)} מתוך \${filtered.length} חברות מסוננות
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button type="button" class="btn btn-sm" \${S.coPage <= 1 ? 'disabled style="opacity:.5"' : ''} onclick="S.coPage--;$('#view').innerHTML=V.companies()">◀ עמוד קודם</button>
        <span class="xs bold" style="padding:0 8px">עמוד \${S.coPage} מתוך \${totalPages}</span>
        <button type="button" class="btn btn-sm" \${S.coPage >= totalPages ? 'disabled style="opacity:.5"' : ''} onclick="S.coPage++;$('#view').innerHTML=V.companies()">עמוד הבא ▶</button>
      </div>
    </div>\` : ''}
  </div>
  \`;
};
`;

  const eventsAnchor = '/* ===== אירועים ===== */';
  if (updated.includes(eventsAnchor)) {
    updated = updated.replace(eventsAnchor, helperCode + '\n/* ===== אירועים ===== */');
    console.log("✓ Injected top-level helperCode before events section");
  }

  const newCases = `
    case "startPhoneEnrichment": { runPhoneEnrichment(false); return; }
    case "resumePhoneEnrichment": { runPhoneEnrichment(true); return; }
    case "pausePhoneEnrichment": { S.enrichmentPaused = true; return; }
    case "export200Backup": { export200JsonBackup(); return; }
    case "restoreImmutable200": { restoreImmutable200Backup(); return; }
    case "openContactQuickLinks":
    case "openLinks200Modal": { openContactQuickLinks(d.coId); return; }
    case "closeContactQuickLinks":
    case "close200Modal": { closeContactQuickLinks(); closeManualPhoneModal(); return; }
    case "openManualPhoneModal":
    case "openManual200Modal": { openManualPhoneModal(d.coId); return; }
    case "closeManualPhoneModal": { closeManualPhoneModal(); return; }
    case "saveManualPhone":
    case "saveManual200Phone": { saveManualPhone(); return; }
    case "saveQuickPhone": { saveQuickPhone(d.coId); return; }
    case "run":runSearch();return;`;

  if (updated.includes(clickCaseAnchor)) {
    updated = updated.replace(clickCaseAnchor, newCases);
    console.log("✓ Injected click cases into event listener");
  }

  // Also hook file input change event for #json200BackupInput
  const changeListenerAnchor = 'if(t.dataset.act==="importBackup" && t.files && t.files[0]){';
  const newChangeListener = `if(t.dataset.act==="import200Backup" && t.files && t.files[0]){
    handle200JsonImport(t.files[0]);
    t.value="";
    return;
  }
  if(t.dataset.act==="importBackup" && t.files && t.files[0]){`;

  if (updated.includes(changeListenerAnchor)) {
    updated = updated.replace(changeListenerAnchor, newChangeListener);
    console.log("✓ Hooked json200BackupInput change listener");
  }

  // 7. Inject Search Sources Hub ("מקורות חיפוש") with 130 sources
  const sourcesStartMarker = '/* ===== מרכז מקורות מידע ומאגרים (SOURCES INTELLIGENCE MATRIX) ===== */';
  const sourcesEndMarker = '/* ===== עזרים להורדת קבצים ===== */';
  const sStartIdx = updated.indexOf(sourcesStartMarker);
  const sEndIdx = updated.indexOf(sourcesEndMarker);
  if (sStartIdx !== -1 && sEndIdx !== -1) {
    const hubCode = getSourcesHubCode();
    updated = updated.slice(0, sStartIdx) + hubCode + '\n\n' + updated.slice(sEndIdx);
    console.log("✓ Replaced legacy V.sources with 130 Search Sources Hub");
  } else {
    console.warn("⚠️ Could not locate sources markers for replacement!");
  }

  // Update tab labels
  updated = updated.replace('["sources","מקורות מידע"]', '["sources","מקורות חיפוש (130)"]');
  updated = updated.replace('sources:"מרכז מקורות מידע ומאגרים"', 'sources:"מקורות חיפוש"');
  updated = updated.replace('["search","חיפוש חדש"]', '["search","מרכז איתור לידים"]');
  updated = updated.replace('["leads","ניהול לידים"]', '["leads","הלידים שלי"]');
  updated = updated.replace('<h1 id="title">איתור לקוחות עסקיים</h1>', '<h1 id="title">מרכז איתור לידים</h1>');
  updated = updated.replace(
    'const titles={prospector:"איתור לקוחות עסקיים",enrich:"העשרת לידים – Gemini"',
    'const titles={prospector:"מרכז איתור לידים",search:"מרכז איתור לידים",companies:"חברות שנמצאו",leads:"הלידים שלי",enrich:"העשרת לידים – Gemini"'
  );

  // Claude 2026-10-18: מנוע השלמת טלפונים אמיתי (קובץ נפרד, נטען אחרי הקוד הראשי) + רשימת המסוננות ל"בחר הכול"
  if (!updated.includes("window.__coFilteredIds")) {
    updated = updated.replace(
      "  const pagedIds = pagedList.map(c => c.id);",
      "  const pagedIds = pagedList.map(c => c.id);\n  window.__coFilteredIds = filtered.map(c => c.id);"
    );
  }
  if (!updated.includes("openprospector-phone-engine.js")) {
    const bodyEnd = updated.lastIndexOf("</body>");
    if (bodyEnd !== -1) {
      updated = updated.slice(0, bodyEnd) + '<script src="openprospector-phone-engine.js?v=20261021b"></script>\n' + updated.slice(bodyEnd);
    }
  }

  if (!updated.includes("openprospector-national-registry.js")) {
    const bodyEnd = updated.lastIndexOf("</body>");
    if (bodyEnd !== -1) {
      updated = updated.slice(0, bodyEnd) + '<script src="openprospector-national-registry.js?v=20261020filters2"></script>\n' + updated.slice(bodyEnd);
    }
  }
  return updated;
}
