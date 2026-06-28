/**
 * Actions Workbench Lite — Staging only. Lightweight list + per-page workbench + temp code preview.
 * No proxy, no dual iframe, no compare. Live site opens in new tab only.
 */
(function () {
  'use strict';

  var EXECUTION_MODE = 'preview';
  var APPROVAL_KEY = 'dalia-action-approvals-v1';
  var WORKBENCH_KEY = 'dalia-actions-workbench-v1';
  var SEQ_KEY = 'dalia-actions-seq-v1';
  var IGNORED_KEY = 'dalia-actions-ignored-v1';
  var TEMP_PREVIEW_KEY = 'dalia-actions-temp-preview-v1';
  var NEW_PAGES_KEY = 'dalia-actions-new-pages-v1';
  var SHEETS_KEY = 'dalia-actions-sheets-v1';
  var PAGE_SIZE = 8;
  var PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;

  var _bundle = null;
  var _pageGroups = [];
  var _ui = { view: 'list', pageId: null, listPage: 0, expandedActionId: null, showIgnored: false };

  var STATUS_LABELS = {
    pending: 'ממתין',
    in_progress: 'בעבודה',
    approved_for_execution: 'מאושר לביצוע',
    done: 'בוצע',
    not_done: 'לא בוצע',
    deferred: 'נדחה',
    needs_review: 'דורש בדיקה',
    error: 'שגיאה',
  };

  var WORK_MINUTES_BY_TYPE = {
    title: 15, meta: 20, h1: 25, h2: 30, content: 90, alt: 45, schema: 40,
    cta: 25, forms: 35, internalLinks: 30, pageSpeed: 60, mobile: 45, ux: 50,
    accessibility: 55, performance: 60, conversion: 40, aiAdditional: 30,
  };

  var SOURCE_LABELS = { checklist: 'Checklist', crawl: 'Crawl', gsc: 'GSC', ga4: 'GA4', ai: 'AI', chatgpt: 'ChatGPT' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escAttr(s) { return esc(s).replace(/'/g, '&#39;'); }

  function readJson(key, fallback) {
    try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch (e) { return fallback; }
  }
  function writeJson(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  }

  function getApprovals() { return readJson(APPROVAL_KEY, {}); }
  function saveApproval(actionId, status) {
    var m = getApprovals();
    m[actionId] = { status: status, at: new Date().toISOString(), mode: EXECUTION_MODE };
    writeJson(APPROVAL_KEY, m);
  }
  function approvalStatus(actionId) {
    var a = getApprovals()[actionId];
    return a && a.status ? a.status : null;
  }

  function getWorkbenchStore() { return readJson(WORKBENCH_KEY, { items: {}, pages: {} }); }
  function saveWorkbenchStore(s) { writeJson(WORKBENCH_KEY, s); }

  function getActionMeta(actionId) {
    var s = getWorkbenchStore();
    if (!s.items[actionId]) {
      s.items[actionId] = {
        liked: '', disliked: '', changeRequests: '', userNotes: '', chat: [],
        revisionRound: 1, updatedAt: null, assignee: '', startedAt: null,
        completedAt: null, actualMinutes: 0, notDoneReason: '', whatHappened: '',
        workflowStatus: null,
      };
    }
    return s.items[actionId];
  }
  function saveActionMeta(actionId, patch) {
    var s = getWorkbenchStore();
    var m = getActionMeta(actionId);
    Object.keys(patch || {}).forEach(function (k) { m[k] = patch[k]; });
    m.updatedAt = new Date().toISOString();
    s.items[actionId] = m;
    saveWorkbenchStore(s);
  }

  function getSeqState() { return readJson(SEQ_KEY, { nextActionItemNumber: 1, assignments: {} }); }
  function saveSeqState(st) { writeJson(SEQ_KEY, st); }
  function bootstrapSequenceNumbers(all) {
    var st = getSeqState();
    all.slice().sort(function (a, b) {
      return String(a.pagePath || a.pageId).localeCompare(String(b.pagePath || b.pageId)) ||
        String(a.recommendationType || '').localeCompare(String(b.recommendationType || '')) ||
        String(a.id).localeCompare(String(b.id));
    }).forEach(function (a) {
      if (!a.id || st.assignments[a.id]) return;
      st.assignments[a.id] = st.nextActionItemNumber++;
    });
    saveSeqState(st);
    return st;
  }
  function getActionNumber(id) { return getSeqState().assignments[id] || null; }

  function getIgnoredPages() { return readJson(IGNORED_KEY, {}); }
  function setPageIgnored(pageId, ignored) {
    var m = getIgnoredPages();
    if (ignored) m[pageId] = { at: new Date().toISOString() }; else delete m[pageId];
    writeJson(IGNORED_KEY, m);
  }

  function getTempPreview(pageId) {
    var all = readJson(TEMP_PREVIEW_KEY, {});
    var p = all[pageId];
    if (!p) return null;
    if (Date.now() - p.at > PREVIEW_TTL_MS) { delete all[pageId]; writeJson(TEMP_PREVIEW_KEY, all); return null; }
    return p;
  }
  function saveTempPreview(pageId, data) {
    var all = readJson(TEMP_PREVIEW_KEY, {});
    all[pageId] = Object.assign({ at: Date.now() }, data);
    writeJson(TEMP_PREVIEW_KEY, all);
  }
  function deleteTempPreview(pageId) {
    var all = readJson(TEMP_PREVIEW_KEY, {});
    delete all[pageId];
    writeJson(TEMP_PREVIEW_KEY, all);
  }

  function formatHebrewDuration(minutes) {
    var m = Math.max(0, Math.round(Number(minutes) || 0));
    if (m < 60) return m + ' דק׳';
    var h = Math.floor(m / 60), r = m % 60;
    return r ? h + ' שע׳ ' + r + ' דק׳' : h + ' שע׳';
  }
  function getEstimatedWorkMinutes(a) {
    if (!a) return 30;
    if (a.estimatedWorkMinutes) return Number(a.estimatedWorkMinutes);
    var t = String(a.recommendationType || a.category || '').toLowerCase();
    return WORK_MINUTES_BY_TYPE[t] || 30;
  }
  function computeTimeSummary(actions) {
    var total = 0;
    (actions || []).forEach(function (a) { total += getEstimatedWorkMinutes(a); });
    return { totalMin: total };
  }

  function effectiveStatus(action) {
    var appr = approvalStatus(action.id);
    if (appr === 'approved_for_execution') return 'approved_for_execution';
    var meta = getActionMeta(action.id);
    if (meta.workflowStatus) return meta.workflowStatus;
    var s = String(action.status || 'pending');
    if (/done|completed/.test(s)) return 'done';
    if (/progress/.test(s)) return 'in_progress';
    return 'pending';
  }

  function statusBadge(action) {
    var s = effectiveStatus(action);
    var label = STATUS_LABELS[s] || s;
    var cls = 'badge-yellow';
    if (s === 'done' || s === 'approved_for_execution') cls = 'badge-green';
    else if (s === 'in_progress') cls = 'badge-purple';
    else if (s === 'error' || s === 'not_done') cls = 'badge-red';
    else if (s === 'deferred') cls = 'badge-gray';
    return '<span class="badge ' + cls + '">' + esc(label) + '</span>';
  }

  function buildBeforeAfter(page, action) {
    if (action.beforeAfter && action.beforeAfter.current) return action.beforeAfter;
    return {
      current: action.detail || '—', problem: action.problem || action.detail || '—',
      proposed: action.detail || '—', after: action.detail || '—',
      why: action.detail || '—', source: action.source,
    };
  }

  function sourceBadge(src) {
    return '<span class="badge badge-gray">' + esc(SOURCE_LABELS[src] || src || '—') + '</span>';
  }

  function countPageStats(actions) {
    var open = 0, done = 0;
    (actions || []).forEach(function (a) {
      var s = effectiveStatus(a);
      if (s === 'done') done++; else open++;
    });
    return { open: open, done: done };
  }

  function prepareData(bundle) {
    _bundle = bundle;
    var wp = (bundle && bundle.workPlan) || (window.DaliaSite && DaliaSite.getWorkPlan && DaliaSite.getWorkPlan());
    var pages = (wp && wp.pages) ? wp.pages.slice().sort(function (a, b) { return (a.rank || 999) - (b.rank || 999); }) : [];
    var all = (bundle && bundle.actions) || [];
    bootstrapSequenceNumbers(all);
    var byPage = {};
    all.forEach(function (a) {
      if (a.status === 'done' || a.status === 'completed') return;
      var k = a.pageId || 'other';
      if (!byPage[k]) byPage[k] = [];
      byPage[k].push(a);
    });
    _pageGroups = pages.map(function (p) { return { page: p, items: byPage[p.id] || [] }; });
    return { pages: pages, pending: all.filter(function (a) { return a.status !== 'done' && a.status !== 'completed'; }) };
  }

  function visibleGroups() {
    var ign = getIgnoredPages();
    return _pageGroups.filter(function (g) {
      var ignored = !!ign[g.page.id];
      return _ui.showIgnored ? ignored : !ignored;
    });
  }

  function renderListToolbar(totalPages, visibleCount) {
    return '<div class="coco-act-lite-toolbar">' +
      '<button type="button" class="btn btn-primary coco-act-btn-sm" data-act-new-page>➕ בנה עמוד חדש</button>' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-act-export-csv>📊 ייצוא CSV</button>' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-act-toggle-ignored">' +
      (_ui.showIgnored ? '👁️ הצג פעילים' : '📁 עמודים מוסתרים') + '</button>' +
      '<span class="coco-act-lite-count">' + visibleCount + ' עמודים · עמוד ' + (_ui.listPage + 1) + '/' + Math.max(1, Math.ceil(totalPages / PAGE_SIZE)) + '</span>' +
      '</div>';
  }

  function renderLiteCard(grp) {
    var p = grp.page, acts = grp.items;
    var stats = countPageStats(acts);
    var time = computeTimeSummary(acts);
    return '<div class="coco-act-lite-card card" data-page-id="' + escAttr(p.id) + '">' +
      '<div class="coco-act-lite-main">' +
      '<div class="coco-act-lite-title">#' + (p.rank || '—') + ' · ' + esc(p.title || p.path) + '</div>' +
      '<div class="coco-act-lite-meta">' +
      '<a href="' + esc(p.url || '#') + '" target="_blank" rel="noopener" class="coco-act-path-link">' + esc(p.path) + ' ↗</a>' +
      ' · ' + acts.length + ' פעולות · ⏱ ' + formatHebrewDuration(time.totalMin) +
      ' · Tier ' + (p.tier || '—') + ' · ' + esc(p.priority || '—') +
      '</div>' +
      '<div class="coco-act-lite-stats">פתוחות: <strong>' + stats.open + '</strong> · בוצעו: <strong>' + stats.done + '</strong></div>' +
      '</div>' +
      '<div class="coco-act-lite-btns">' +
      '<button type="button" class="btn btn-primary coco-act-btn-sm" data-open-wb="' + escAttr(p.id) + '">🛠️ פתח שולחן עבודה</button>' +
      '<a href="' + esc(p.url || '#') + '" target="_blank" rel="noopener" class="btn btn-ghost coco-act-btn-sm">👁️ עמוד חי</a>' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-ignore-page="' + escAttr(p.id) + '">🚫 הוצא מתוכנית</button>' +
      '</div></div>';
  }

  function renderPagination(total) {
    var pages = Math.ceil(total / PAGE_SIZE);
    if (pages <= 1) return '';
    var h = '<div class="coco-act-lite-pager">';
    if (_ui.listPage > 0) h += '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-list-page="' + (_ui.listPage - 1) + '">← הקודם</button>';
    h += '<span>עמוד ' + (_ui.listPage + 1) + ' / ' + pages + '</span>';
    if (_ui.listPage < pages - 1) h += '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-list-page="' + (_ui.listPage + 1) + '">הבא →</button>';
    return h + '</div>';
  }

  function renderDraftCard(draft) {
    return '<div class="coco-act-lite-card card coco-act-lite-draft" data-page-id="' + escAttr(draft.id) + '">' +
      '<div class="coco-act-lite-main">' +
      '<div class="coco-act-lite-title">📝 ' + esc(draft.title) + ' · ' + esc(draft.pageType) + '</div>' +
      '<div class="coco-act-lite-meta">טיוטה · לא באתר החי · ' + esc(draft.keywords || '') + '</div>' +
      '<div class="coco-act-lite-stats">סטטוס: <strong>' + esc(draft.status || 'draft') + '</strong></div>' +
      '</div>' +
      '<div class="coco-act-lite-btns">' +
      '<button type="button" class="btn btn-primary coco-act-btn-sm" data-open-wb="' + escAttr(draft.id) + '">🛠️ פתח טיוטה</button>' +
      '</div></div>';
  }

  function renderListView(setHtml, emptyStatus) {
    var groups = visibleGroups();
    var drafts = getNewPages().filter(function (d) { return d.status !== 'archived'; });
    var start = _ui.listPage * PAGE_SIZE;
    var slice = groups.slice(start, start + PAGE_SIZE);
    var header = '<div class="coco-act-preview-banner">⚠️ Staging בלבד — אין שינוי באתר החי · שולחן עבודה קל</div>' +
      renderListToolbar(groups.length, groups.length);
    var draftHtml = (_ui.listPage === 0 && !_ui.showIgnored) ? drafts.map(renderDraftCard).join('') : '';
    var cards = slice.length ? slice.map(renderLiteCard).join('') : (_ui.listPage === 0 && !draftHtml ? emptyStatus('אין עמודים להצגה') : '');
    setHtml('coco-live-actions-pending', header + draftHtml + cards + renderPagination(groups.length));
  }

  function renderActionRow(action, page, expanded) {
    var num = getActionNumber(action.id);
    var ba = buildBeforeAfter(page, action);
    var meta = getActionMeta(action.id);
    var head = '<button type="button" class="coco-act-lite-acc-head" data-toggle-action="' + escAttr(action.id) + '">' +
      '<span class="coco-act-num-tag">#' + num + '</span> ' + esc(action.category || action.title) +
      ' · ⏱ ' + formatHebrewDuration(getEstimatedWorkMinutes(action)) + ' · ' +
      statusBadge(action) + ' <span class="coco-act-chevron">' + (expanded ? '▲' : '▼') + '</span></button>';
    if (!expanded) return '<div class="coco-act-lite-acc" data-action-id="' + escAttr(action.id) + '">' + head + '</div>';
    return '<div class="coco-act-lite-acc coco-act-lite-acc-open" data-action-id="' + escAttr(action.id) + '">' + head +
      '<div class="coco-act-lite-acc-body">' +
      '<div class="coco-act-lite-row"><strong>מה קיים:</strong> ' + esc(ba.current) + '</div>' +
      '<div class="coco-act-lite-row"><strong>מה משתנה:</strong> ' + esc(ba.proposed) + '</div>' +
      '<div class="coco-act-lite-row"><strong>למה:</strong> ' + esc(ba.why) + '</div>' +
      '<div class="coco-act-lite-row"><strong>מקור:</strong> ' + sourceBadge(action.source) + '</div>' +
      '<div class="coco-act-lite-row"><strong>עדיפות:</strong> ' + esc(action.priority || action.urgency || '—') + '</div>' +
      '<div class="coco-act-lite-row"><strong>נוצר:</strong> ' + esc(meta.startedAt || action.createdAt || '—') +
      ' · <strong>עודכן:</strong> ' + esc(meta.updatedAt || '—') + '</div>' +
      '<label class="coco-act-fb-field"><span class="coco-act-fb-label">סטטוס</span>' +
      '<select class="filter-select" data-status-action="' + escAttr(action.id) + '">' +
      Object.keys(STATUS_LABELS).map(function (k) {
        return '<option value="' + k + '"' + (effectiveStatus(action) === k ? ' selected' : '') + '>' + STATUS_LABELS[k] + '</option>';
      }).join('') + '</select></label>' +
      '<label class="coco-act-fb-field"><span class="coco-act-fb-label">מי מטפל</span>' +
      '<input class="filter-input" data-meta-field="assignee" data-meta-action="' + escAttr(action.id) + '" value="' + escAttr(meta.assignee || '') + '"></label>' +
      '<label class="coco-act-fb-field"><span class="coco-act-fb-label">הערות שלי</span>' +
      '<textarea rows="2" class="coco-act-fb-input" data-fb-field="userNotes" data-fb-action="' + escAttr(action.id) + '">' + esc(meta.userNotes || '') + '</textarea></label>' +
      '<label class="coco-act-fb-field"><span class="coco-act-fb-label">למה לא בוצע</span>' +
      '<textarea rows="2" class="coco-act-fb-input" data-fb-field="notDoneReason" data-fb-action="' + escAttr(action.id) + '">' + esc(meta.notDoneReason || '') + '</textarea></label>' +
      '<div class="coco-act-item-footer">' +
      '<button type="button" class="btn btn-green coco-act-btn-sm" data-act-approve="' + escAttr(action.id) + '">✅ מאושר לביצוע</button>' +
      '<span class="coco-act-approval-note">Staging בלבד</span></div></div></div>';
  }

  function renderWorkbenchView(setHtml, pageId) {
    var grp = _pageGroups.find(function (g) { return g.page.id === pageId; });
    if (!grp) { _ui.view = 'list'; return renderListView(setHtml, function () { return ''; }); }
    var p = grp.page, acts = grp.items;
    var time = computeTimeSummary(acts);
    var store = getWorkbenchStore();
    if (!store.pages[pageId]) store.pages[pageId] = { openedAt: new Date().toISOString() };
    store.pages[pageId].lastOpenedAt = new Date().toISOString();
    saveWorkbenchStore(store);
    var actionsHtml = acts.map(function (a) {
      return renderActionRow(a, p, _ui.expandedActionId === a.id);
    }).join('');
    var pv = getTempPreview(pageId);
    setHtml('coco-live-actions-pending',
      '<div class="coco-act-wb-view">' +
      '<div class="coco-act-lite-toolbar">' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-back-list>← חזרה לרשימה</button>' +
      '<a href="' + esc(p.url || '#') + '" target="_blank" rel="noopener" class="btn btn-ghost coco-act-btn-sm">👁️ עמוד חי</a>' +
      '<button type="button" class="btn btn-primary coco-act-btn-sm" data-open-lite-preview="' + escAttr(pageId) + '">🔍 Preview זמני</button>' +
      (pv ? '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-delete-preview="' + escAttr(pageId) + '">🗑️ מחק Preview</button>' : '') +
      '</div>' +
      '<div class="coco-act-wb-header card">' +
      '<h2 class="coco-act-lite-title">' + esc(p.title || p.path) + '</h2>' +
      '<div class="coco-act-lite-meta">' + esc(p.path) + ' · ' + acts.length + ' פעולות · ⏱ ' + formatHebrewDuration(time.totalMin) + '</div>' +
      (pv ? '<div class="badge badge-yellow">Preview זמני פעיל · פג תוקף אוטומטי</div>' : '') +
      '</div>' +
      '<div class="coco-act-lite-actions-list">' + (actionsHtml || '<div class="alert alert-ok">אין פעולות</div>') + '</div></div>');
  }

  function buildPreviewDoc(html, css, js) {
    return '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>body{font-family:Heebo,Arial,sans-serif;margin:0;padding:16px;line-height:1.5}' + (css || '') + '</style></head><body>' +
      '<div class="coco-pv-banner">⚠️ Preview זמני — Staging בלבד · לא נשמר באתר</div>' +
      (html || '<p>הדבק HTML כאן</p>') + '<script>' + (js || '') + '<\/script></body></html>';
  }

  function ensureLitePreviewModal() {
    var el = document.getElementById('coco-act-lite-preview');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'coco-act-lite-preview';
    el.className = 'coco-act-preview-overlay';
    el.style.display = 'none';
    el.innerHTML =
      '<div class="coco-act-preview-dialog coco-act-lite-preview-dialog">' +
      '<div class="coco-act-preview-head"><div><div class="coco-act-preview-title">🔍 Preview זמני</div>' +
      '<div class="coco-act-preview-sub" id="coco-act-lite-preview-sub"></div></div>' +
      '<button type="button" class="btn-icon coco-act-lite-preview-close">✕</button></div>' +
      '<div class="coco-act-lite-code-tabs">' +
      '<label>HTML<textarea id="coco-act-code-html" rows="4" class="coco-act-code-input"></textarea></label>' +
      '<label>CSS<textarea id="coco-act-code-css" rows="3" class="coco-act-code-input"></textarea></label>' +
      '<label>JS<textarea id="coco-act-code-js" rows="2" class="coco-act-code-input"></textarea></label></div>' +
      '<div class="coco-act-lite-preview-toolbar">' +
      '<button type="button" class="btn btn-primary coco-act-btn-sm" id="coco-act-run-preview">▶ הצג Preview</button>' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" id="coco-act-save-preview">💾 שמור זמני</button>' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" id="coco-act-del-preview">🗑️ מחק</button></div>' +
      '<iframe id="coco-act-lite-frame" class="coco-act-preview-frame" title="Preview" sandbox="allow-scripts allow-same-origin"></iframe></div>';
    (document.getElementById('screen-actions') || document.body).appendChild(el);
    el.querySelector('.coco-act-lite-preview-close').onclick = closeLitePreview;
    el.addEventListener('click', function (e) { if (e.target === el) closeLitePreview(); });
    document.getElementById('coco-act-run-preview').onclick = runLitePreview;
    document.getElementById('coco-act-save-preview').onclick = saveLitePreviewFromModal;
    document.getElementById('coco-act-del-preview').onclick = deleteLitePreviewFromModal;
    return el;
  }

  var _previewPageId = null;
  function openLitePreview(pageId) {
    _previewPageId = pageId;
    var modal = ensureLitePreviewModal();
    var pv = getTempPreview(pageId) || { html: '', css: '', js: '' };
    document.getElementById('coco-act-code-html').value = pv.html || '';
    document.getElementById('coco-act-code-css').value = pv.css || '';
    document.getElementById('coco-act-code-js').value = pv.js || '';
    document.getElementById('coco-act-lite-preview-sub').textContent = pageId + ' · Preview זמני · לא נוגע באתר החי';
    modal.style.display = 'flex';
    runLitePreview();
  }
  function closeLitePreview() {
    var m = document.getElementById('coco-act-lite-preview');
    if (m) m.style.display = 'none';
  }
  function runLitePreview() {
    var html = document.getElementById('coco-act-code-html').value;
    var css = document.getElementById('coco-act-code-css').value;
    var js = document.getElementById('coco-act-code-js').value;
    document.getElementById('coco-act-lite-frame').srcdoc = buildPreviewDoc(html, css, js);
  }
  function saveLitePreviewFromModal() {
    if (!_previewPageId) return;
    saveTempPreview(_previewPageId, {
      html: document.getElementById('coco-act-code-html').value,
      css: document.getElementById('coco-act-code-css').value,
      js: document.getElementById('coco-act-code-js').value,
    });
    if (typeof showToast === 'function') showToast('Preview זמני נשמר (2 שעות)');
  }
  function deleteLitePreviewFromModal() {
    if (!_previewPageId) return;
    deleteTempPreview(_previewPageId);
    closeLitePreview();
    if (typeof showToast === 'function') showToast('Preview נמחק');
    if (_ui.view === 'workbench') render({ _refresh: true });
  }

  function getNewPages() { return readJson(NEW_PAGES_KEY, []); }
  function saveNewPage(draft) {
    var list = getNewPages();
    draft.id = draft.id || 'new-' + Date.now();
    draft.createdAt = draft.createdAt || new Date().toISOString();
    draft.status = draft.status || 'draft';
    list.unshift(draft);
    writeJson(NEW_PAGES_KEY, list);
    return draft;
  }

  function ensureNewPageModal() {
    var el = document.getElementById('coco-act-new-page-modal');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'coco-act-new-page-modal';
    el.className = 'coco-act-preview-overlay';
    el.style.display = 'none';
    el.innerHTML =
      '<div class="coco-act-preview-dialog coco-act-new-page-dialog">' +
      '<div class="coco-act-preview-head"><div><div class="coco-act-preview-title">➕ בנה עמוד חדש (טיוטה)</div>' +
      '<div class="coco-act-preview-sub">תוכנית עבודה בלבד · לא מעלה ל-WordPress · Preview זמני</div></div>' +
      '<button type="button" class="btn-icon" id="coco-act-new-page-close">✕</button></div>' +
      '<form class="coco-act-new-page-form" id="coco-act-new-page-form">' +
      '<label>סוג עמוד<select name="pageType"><option>דף שירות</option><option>דף נחיתה</option><option>בלוג</option><option>אחר</option></select></label>' +
      '<label>שם / כותרת<input name="title" required placeholder="לדוגמה: שירותי ייעוץ"></label>' +
      '<label>מילות מפתח<textarea name="keywords" rows="2" placeholder="מילה1, מילה2"></textarea></label>' +
      '<label>מבנה / תוכן<textarea name="content" rows="3" placeholder="כותרות, פסקאות, נקודות"></textarea></label>' +
      '<label>CTA<input name="cta" placeholder="לדוגמה: צור קשר"></label>' +
      '<label>מטרות<textarea name="goals" rows="2"></textarea></label>' +
      '<label>פעולות מתוכננות<textarea name="plannedActions" rows="2"></textarea></label>' +
      '<label>HTML ל-Preview<textarea name="html" rows="4" class="coco-act-code-input"></textarea></label>' +
      '<div class="coco-act-lite-preview-toolbar">' +
      '<button type="submit" class="btn btn-primary coco-act-btn-sm">💾 שמור טיוטה</button>' +
      '<button type="button" class="btn btn-green coco-act-btn-sm" id="coco-act-new-page-preview">🔍 Preview</button>' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" id="coco-act-new-page-cancel">ביטול</button></div></form></div>';
    (document.getElementById('screen-actions') || document.body).appendChild(el);
    el.querySelector('#coco-act-new-page-close').onclick = closeNewPageModal;
    el.querySelector('#coco-act-new-page-cancel').onclick = closeNewPageModal;
    el.addEventListener('click', function (e) { if (e.target === el) closeNewPageModal(); });
    el.querySelector('#coco-act-new-page-form').onsubmit = function (ev) {
      ev.preventDefault();
      var fd = new FormData(ev.target);
      var draft = {
        pageType: fd.get('pageType'), title: fd.get('title'), keywords: fd.get('keywords'),
        content: fd.get('content'), cta: fd.get('cta'), goals: fd.get('goals'),
        plannedActions: fd.get('plannedActions'), html: fd.get('html'), css: '', js: '',
      };
      var saved = saveNewPage(draft);
      saveTempPreview(saved.id, { html: draft.html || '<h1>' + esc(draft.title) + '</h1><p>' + esc(draft.content) + '</p>', css: '', js: '' });
      closeNewPageModal();
      if (typeof showToast === 'function') showToast('טיוטת עמוד נשמרה — פתח Preview');
      _ui.view = 'workbench'; _ui.pageId = saved.id; rerender();
    };
    el.querySelector('#coco-act-new-page-preview').onclick = function () {
      var f = el.querySelector('#coco-act-new-page-form');
      var title = f.querySelector('[name=title]').value || 'טיוטה';
      var html = f.querySelector('[name=html]').value || '<h1>' + title + '</h1>';
      var tmpId = 'new-preview-' + Date.now();
      saveTempPreview(tmpId, { html: html, css: '', js: '' });
      openLitePreview(tmpId);
    };
    return el;
  }
  function openNewPageModal() {
    var m = ensureNewPageModal();
    m.style.display = 'flex';
    m.querySelector('#coco-act-new-page-form').reset();
  }
  function closeNewPageModal() {
    var m = document.getElementById('coco-act-new-page-modal');
    if (m) m.style.display = 'none';
  }

  function renderNewPageWorkbench(setHtml, draftId) {
    var drafts = getNewPages();
    var draft = drafts.find(function (d) { return d.id === draftId; });
    if (!draft) { _ui.view = 'list'; return renderListView(setHtml, function () { return ''; }); }
    var pv = getTempPreview(draftId);
    setHtml('coco-live-actions-pending',
      '<div class="coco-act-wb-view">' +
      '<div class="coco-act-lite-toolbar">' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-back-list>← חזרה לרשימה</button>' +
      '<span class="badge badge-purple">טיוטה · לא באתר החי</span>' +
      '<button type="button" class="btn btn-primary coco-act-btn-sm" data-open-lite-preview="' + escAttr(draftId) + '">🔍 Preview זמני</button>' +
      (pv ? '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-delete-preview="' + escAttr(draftId) + '">🗑️ מחק Preview</button>' : '') +
      '<button type="button" class="btn btn-green coco-act-btn-sm" data-draft-approve="' + escAttr(draftId) + '">✅ מאושר לביצוע (עתידי)</button>' +
      '</div>' +
      '<div class="coco-act-wb-header card">' +
      '<h2 class="coco-act-lite-title">' + esc(draft.title) + ' · ' + esc(draft.pageType) + '</h2>' +
      '<div class="coco-act-lite-meta">טיוטה · מילות מפתח: ' + esc(draft.keywords || '—') + '</div>' +
      '<div class="coco-act-lite-row"><strong>CTA:</strong> ' + esc(draft.cta || '—') + '</div>' +
      '<div class="coco-act-lite-row"><strong>מטרות:</strong> ' + esc(draft.goals || '—') + '</div>' +
      '<div class="coco-act-lite-row"><strong>פעולות:</strong> ' + esc(draft.plannedActions || '—') + '</div>' +
      '</div></div>');
  }

  function approveDraft(draftId) {
    var list = getNewPages();
    var d = list.find(function (x) { return x.id === draftId; });
    if (d) { d.status = 'approved_for_execution'; d.approvedAt = new Date().toISOString(); writeJson(NEW_PAGES_KEY, list); }
    if (typeof showToast === 'function') showToast('טיוטה מאושרת — יישום ב-WordPress בעתיד בלבד');
  }

    var rows = [['#', 'page', 'action', 'status', 'source', 'minutes', 'priority']];
    _pageGroups.forEach(function (g) {
      g.items.forEach(function (a) {
        rows.push([getActionNumber(a.id), g.page.path, a.category, effectiveStatus(a), a.source, getEstimatedWorkMinutes(a), a.priority || '']);
      });
    });
    var csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'dalia-actions-' + Date.now() + '.csv';
    a.click();
  }

  function bindEvents(root) {
    if (!root || root._liteBound) return;
    root._liteBound = true;
    root.addEventListener('click', function (e) {
      var wb = e.target.closest('[data-open-wb]');
      if (wb) { _ui.view = 'workbench'; _ui.pageId = wb.getAttribute('data-open-wb'); _ui.expandedActionId = null; rerender(); return; }
      var back = e.target.closest('[data-back-list]');
      if (back) { _ui.view = 'list'; _ui.pageId = null; rerender(); return; }
      var pg = e.target.closest('[data-list-page]');
      if (pg) { _ui.listPage = Number(pg.getAttribute('data-list-page')); rerender(); return; }
      var ign = e.target.closest('[data-ignore-page]');
      if (ign) { setPageIgnored(ign.getAttribute('data-ignore-page'), true); rerender(); if (typeof showToast === 'function') showToast('הוצא מתוכנית'); return; }
      if (e.target.closest('[data-act-toggle-ignored]')) { _ui.showIgnored = !_ui.showIgnored; _ui.listPage = 0; rerender(); return; }
      if (e.target.closest('[data-act-export-csv]')) { exportCsv(); return; }
      if (e.target.closest('[data-act-new-page]')) { openNewPageModal(); return; }
      var prev = e.target.closest('[data-open-lite-preview]');
      if (prev) { openLitePreview(prev.getAttribute('data-open-lite-preview')); return; }
      var delp = e.target.closest('[data-delete-preview]');
      if (delp) { deleteTempPreview(delp.getAttribute('data-delete-preview')); rerender(); return; }
      var tog = e.target.closest('[data-toggle-action]');
      if (tog) {
        var id = tog.getAttribute('data-toggle-action');
        _ui.expandedActionId = _ui.expandedActionId === id ? null : id;
        rerender();
        return;
      }
      var appr = e.target.closest('[data-act-approve]');
      if (appr) { saveApproval(appr.getAttribute('data-act-approve'), 'approved_for_execution'); if (typeof showToast === 'function') showToast('מאושר לביצוע (Staging)'); rerender(); }
      var dappr = e.target.closest('[data-draft-approve]');
      if (dappr) { approveDraft(dappr.getAttribute('data-draft-approve')); rerender(); }
    });
    root.addEventListener('change', function (e) {
      var st = e.target.closest('[data-status-action]');
      if (st) { saveActionMeta(st.getAttribute('data-status-action'), { workflowStatus: st.value }); return; }
    });
    root.addEventListener('input', function (e) {
      var fb = e.target.closest('[data-fb-field]');
      if (fb) { var p = {}; p[fb.getAttribute('data-fb-field')] = fb.value; saveActionMeta(fb.getAttribute('data-fb-action'), p); }
      var meta = e.target.closest('[data-meta-field]');
      if (meta) { var q = {}; q[meta.getAttribute('data-meta-field')] = meta.value; saveActionMeta(meta.getAttribute('data-meta-action'), q); }
    });
  }

  var _lastDeps = null;
  function rerender() {
    if (_lastDeps) render(_lastDeps);
  }

  function render(deps) {
    if (deps && deps.applyCtxFilter) _lastDeps = deps;
    deps = deps || _lastDeps || {};
    var applyCtxFilter = deps.applyCtxFilter;
    var deriveActions = deps.deriveActions;
    var setHtml = deps.setHtml;
    var emptyStatus = deps.emptyStatus || function (m) { return '<div class="alert alert-info">' + m + '</div>'; };
    if (!applyCtxFilter || !deriveActions || !setHtml) return 0;

    var bundle = deps.bundle || {};
    var wp = bundle.workPlan || (window.DaliaSite && DaliaSite.getWorkPlan && DaliaSite.getWorkPlan());
    if (wp) bundle.workPlan = wp;
    bundle.actions = applyCtxFilter(deriveActions(bundle), function (a) {
      return { action: a.category, status: a.status, campaign: a.campaignId };
    });
    prepareData(bundle);

    if (_ui.view === 'workbench' && _ui.pageId) {
      if (String(_ui.pageId).indexOf('new-') === 0) renderNewPageWorkbench(setHtml, _ui.pageId);
      else renderWorkbenchView(setHtml, _ui.pageId);
    }
    else renderListView(setHtml, emptyStatus);

    var root = document.getElementById('coco-live-actions-pending');
    bindEvents(root);
    return bundle.actions.length;
  }

  window.CocoActApprove = function (id) { saveApproval(id, 'approved_for_execution'); rerender(); };
  window.CocoActRevokeApproval = function (id) {
    var m = getApprovals(); delete m[id]; writeJson(APPROVAL_KEY, m); rerender();
  };
  window.CocoActOpenWorkbench = function (pageId) { _ui.view = 'workbench'; _ui.pageId = pageId; rerender(); };
  window.CocoActBackToList = function () { _ui.view = 'list'; _ui.pageId = null; rerender(); };

  window.ActionsWorkbench = {
    render: render,
    getApprovals: getApprovals,
    getSeqState: getSeqState,
    getActionNumber: getActionNumber,
    getActionFeedback: getActionMeta,
    parseImpactFields: function () { return {}; },
    getEstimatedWorkMinutes: getEstimatedWorkMinutes,
    formatHebrewDuration: formatHebrewDuration,
    computeTimeSummary: computeTimeSummary,
    EXECUTION_MODE: EXECUTION_MODE,
    openPagePreview: openLitePreview,
    exportCsv: exportCsv,
  };
})();
