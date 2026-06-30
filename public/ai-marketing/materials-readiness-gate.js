/**
 * Materials Readiness Gate — mandatory checklist + uploads metadata before site build.
 * Staging only · functional panels in existing strategy export area.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var GATE_KEY = 'coco-materials-gate-v1';

  var CHECKLIST_ITEMS = [
    { id: 'site_scanned', label: 'האתר הקיים נסרק' },
    { id: 'pages_analyzed', label: 'כל עמודי האתר נותחו' },
    { id: 'competitors_analyzed', label: 'המתחרים נותחו' },
    { id: 'keywords_collected', label: 'מילות המפתח נאספו' },
    { id: 'services_identified', label: 'השירותים זוהו' },
    { id: 'goals_defined', label: 'מטרות העסק הוגדרו' },
    { id: 'audience_defined', label: 'קהל היעד הוגדר' },
    { id: 'materials_analyzed', label: 'החומרים שנמצאו נותחו' },
  ];

  var MATERIAL_TYPES = [
    'מסמכים', 'מצגות', 'תמונות', 'מפרטים', 'מדריכים', 'סרטונים',
    'מידע תוכנה', 'מידע אפליקציה', 'צילומי מסך מערכת', 'שירותים חדשים',
    'אינטגרציות (GPS, מצלמות, חיישנים, CANBUS, טלמטיקה, FleetOS, AI)',
  ];

  function parseLs() {
    try { return JSON.parse(localStorage.getItem(GATE_KEY) || 'null'); } catch (e) { return null; }
  }

  function save(state) {
    try { localStorage.setItem(GATE_KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
  }

  function getDefault() {
    var state = {
      version: VERSION,
      checklist: {},
      hasAdditionalInfo: null,
      additionalNote: '',
      uploads: [],
      materialsConfirmed: false,
      confirmedAt: null,
      updatedAt: new Date().toISOString(),
    };
    CHECKLIST_ITEMS.forEach(function (item) { state.checklist[item.id] = false; });
    return state;
  }

  function get() {
    var state = parseLs();
    if (!state) return getDefault();
    CHECKLIST_ITEMS.forEach(function (item) {
      if (state.checklist[item.id] == null) state.checklist[item.id] = false;
    });
    return state;
  }

  function isChecklistComplete(state) {
    state = state || get();
    return CHECKLIST_ITEMS.every(function (item) { return !!state.checklist[item.id]; });
  }

  function isReady() {
    if (window.StrategicBriefing && !StrategicBriefing.isReady()) return false;
    var state = get();
    if (!isChecklistComplete(state)) return false;
    if (state.hasAdditionalInfo === true && !state.materialsConfirmed) return false;
    if (state.hasAdditionalInfo === null) return false;
    return !!state.materialsConfirmed;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function confirmMaterials(state) {
    state = state || get();
    if (window.StrategicBriefing && !StrategicBriefing.isReady()) {
      return { ok: false, reason: 'briefing_not_ready' };
    }
    if (!isChecklistComplete(state)) return { ok: false, reason: 'checklist_incomplete' };
    if (state.hasAdditionalInfo === null) return { ok: false, reason: 'additional_info_unanswered' };
    state.materialsConfirmed = true;
    state.confirmedAt = new Date().toISOString();
    state.updatedAt = state.confirmedAt;
    save(state);
    if (window.MarketingActivityLog) MarketingActivityLog.log('materials_gate_confirmed', { uploads: state.uploads.length });
    if (window.MarketingLifecycle) MarketingLifecycle.advance('materials', 'completed');
    if (window.AiStageAdvisor) AiStageAdvisor.advise('materials');
    return { ok: true };
  }

  function addUploadMeta(meta) {
    var state = get();
    state.uploads.push({
      id: 'mat-' + Date.now(),
      name: meta.name || 'קובץ',
      type: meta.type || 'מסמך',
      note: meta.note || '',
      at: new Date().toISOString(),
    });
    state.updatedAt = new Date().toISOString();
    save(state);
    if (window.MarketingActivityLog) MarketingActivityLog.log('materials_upload_meta', { name: meta.name, type: meta.type });
    return state;
  }

  function assertGate() {
    if (window.StrategicBriefing && !StrategicBriefing.assertGate()) return false;
    if (!isReady()) {
      if (typeof showToast === 'function') showToast('⚠️ יש להשלים רשימת חומרים ולאשר לפני המשך');
      return false;
    }
    return true;
  }

  function renderInlinePanel(container) {
    if (!container) return;
    var briefingReady = !window.StrategicBriefing || StrategicBriefing.isReady();
    if (!briefingReady) {
      container.innerHTML = '<div class="card" style="margin-top:12px;"><div class="ph-t">📦 שער חומרים — חובה לפני בניית אתר</div>' +
        '<div class="alt alt-warn">יש להשלים ולאשר את השאלון האסטרטגי לפני שער חומרים</div></div>';
      return;
    }
    var state = get();
    var complete = isChecklistComplete(state);
    var ready = isReady();

    var checklistHtml = CHECKLIST_ITEMS.map(function (item) {
      var checked = !!state.checklist[item.id];
      return '<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--w80);margin:4px 0;">' +
        '<input type="checkbox" data-mat-check="' + item.id + '" ' + (checked ? 'checked' : '') + ' /> ' + esc(item.label) + '</label>';
    }).join('');

    var uploadsHtml = (state.uploads || []).map(function (u) {
      return '<div style="font-size:11px;color:var(--w50);">• ' + esc(u.type) + ': ' + esc(u.name) + (u.note ? ' — ' + esc(u.note) : '') + '</div>';
    }).join('') || '<div style="font-size:11px;color:var(--w50);">אין חומרים נוספים עדיין</div>';

    container.innerHTML =
      '<div class="card" style="margin-top:12px;">' +
      '<div class="ph-t">📦 שער חומרים — חובה לפני בניית אתר</div>' +
      '<div class="s">יש לאשר את כל הסעיפים לפני מחקר SEO ובניית אתר</div>' +
      '<div id="mat-checklist" style="margin-top:10px;">' + checklistHtml + '</div>' +
      '<div style="margin-top:12px;font-size:12px;color:var(--w80);font-weight:600;">האם יש עוד חומר שלא הועלה?</div>' +
      '<div style="display:flex;gap:12px;margin-top:6px;">' +
      '<label style="font-size:12px;color:var(--w80);"><input type="radio" name="mat-additional" value="yes" ' + (state.hasAdditionalInfo === true ? 'checked' : '') + ' /> כן</label>' +
      '<label style="font-size:12px;color:var(--w80);"><input type="radio" name="mat-additional" value="no" ' + (state.hasAdditionalInfo === false ? 'checked' : '') + ' /> לא</label>' +
      '</div>' +
      '<div id="mat-upload-section" style="margin-top:10px;' + (state.hasAdditionalInfo === true ? '' : 'display:none;') + '">' +
      '<div class="s" style="margin-bottom:6px;">ניתן להוסיף: ' + esc(MATERIAL_TYPES.join(' · ')) + '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">' +
      '<input type="text" id="mat-upload-name" placeholder="שם קובץ/חומר" style="flex:1;min-width:120px;font-size:12px;padding:6px 8px;border-radius:6px;border:1px solid var(--w10);background:var(--bg4);color:var(--w);" />' +
      '<select id="mat-upload-type" style="font-size:12px;padding:6px 8px;border-radius:6px;border:1px solid var(--w10);background:var(--bg4);color:var(--w);">' +
      MATERIAL_TYPES.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') +
      '</select>' +
      '<button type="button" class="btn btn-p" id="mat-add-upload" style="padding:4px 10px;font-size:11px;">+ הוסף</button>' +
      '</div>' +
      '<div id="mat-uploads-list">' + uploadsHtml + '</div>' +
      '</div>' +
      '<div style="margin-top:10px;">' +
      '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--w80);">' +
      '<input type="checkbox" id="mat-confirm-all" ' + (state.materialsConfirmed ? 'checked disabled' : '') + ' /> ' +
      'אני מאשר שאין כרגע מידע נוסף להעלות.' +
      '</label></div>' +
      '<div style="margin-top:10px;">' +
      '<button type="button" class="btn btn-go" id="mat-confirm-btn" ' + (ready ? 'disabled' : '') + '>✅ אשר חומרים והמשך ל-SEO</button>' +
      '</div>' +
      '<div id="mat-status" class="alt ' + (ready ? 'alt-ok' : 'alt-warn') + '" style="margin-top:10px;">' +
      (ready ? '✅ חומרים מאושרים — ניתן להמשיך למודול SEO' : (complete ? '⚠️ יש לענות על שאלת מידע נוסף ולאשר' : '⚠️ יש לסמן את כל סעיפי הרשימה')) +
      '</div></div>';

    container.querySelectorAll('[data-mat-check]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var st = get();
        st.checklist[cb.getAttribute('data-mat-check')] = cb.checked;
        st.updatedAt = new Date().toISOString();
        save(st);
        renderInlinePanel(container);
        if (window.PreBuildWorkReport) PreBuildWorkReport.updateBuildButtonsGate();
      });
    });

    container.querySelectorAll('input[name="mat-additional"]').forEach(function (rb) {
      rb.addEventListener('change', function () {
        var st = get();
        st.hasAdditionalInfo = rb.value === 'yes';
        st.updatedAt = new Date().toISOString();
        save(st);
        renderInlinePanel(container);
      });
    });

    var addBtn = container.querySelector('#mat-add-upload');
    if (addBtn) addBtn.addEventListener('click', function () {
      var nameEl = container.querySelector('#mat-upload-name');
      var typeEl = container.querySelector('#mat-upload-type');
      var name = nameEl && nameEl.value.trim();
      if (!name) {
        if (typeof showToast === 'function') showToast('⚠️ הזן/י שם חומר');
        return;
      }
      addUploadMeta({ name: name, type: typeEl ? typeEl.value : 'מסמך' });
      if (nameEl) nameEl.value = '';
      renderInlinePanel(container);
    });

    var confirmBtn = container.querySelector('#mat-confirm-btn');
    if (confirmBtn) confirmBtn.addEventListener('click', function () {
      var st = get();
      var chk = container.querySelector('#mat-confirm-all');
      if (chk && !chk.checked) {
        if (typeof showToast === 'function') showToast('⚠️ סמן/י אישור חומרים');
        return;
      }
      if (st.hasAdditionalInfo === true && (!st.uploads || !st.uploads.length)) {
        if (typeof showToast === 'function') showToast('⚠️ ציינת מידע נוסף — הוסף/י לפחות חומר אחד או בחר "לא"');
        return;
      }
      var res = confirmMaterials(st);
      if (!res.ok) {
        if (typeof showToast === 'function') showToast('⚠️ יש להשלים את הרשימה');
        return;
      }
      if (typeof showToast === 'function') showToast('✅ חומרים מאושרים — המשך למודול SEO');
      renderInlinePanel(container);
      if (window.SeoStrategy && SeoStrategy.mountPanel) SeoStrategy.mountPanel('seo-strategy-root');
      if (window.PreBuildWorkReport) PreBuildWorkReport.updateBuildButtonsGate();
    });
  }

  function mountPanel(rootId) {
    var root = document.getElementById(rootId || 'materials-gate-root');
    if (!root) return;
    renderInlinePanel(root);
  }

  window.MaterialsReadinessGate = {
    VERSION: VERSION,
    CHECKLIST_ITEMS: CHECKLIST_ITEMS,
    get: get,
    isReady: isReady,
    isChecklistComplete: isChecklistComplete,
    confirmMaterials: confirmMaterials,
    addUploadMeta: addUploadMeta,
    assertGate: assertGate,
    mountPanel: mountPanel,
  };
})();
