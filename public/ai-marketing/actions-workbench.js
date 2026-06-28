/**
 * Actions Workbench — Staging preview only. Approvals stored in localStorage; no live site writes.
 */
(function () {
  'use strict';

  var EXECUTION_MODE = 'preview';
  var APPROVAL_KEY = 'dalia-action-approvals-v1';
  var WORKBENCH_KEY = 'dalia-actions-workbench-v1';
  var SEQ_KEY = 'dalia-actions-seq-v1';

  var _crawlCache = null;
  var _crawlPromise = null;
  var _lastRenderActions = [];

  var SOURCE_LABELS = {
    checklist: 'Checklist',
    crawl: 'Crawl',
    gsc: 'GSC',
    GSC: 'GSC',
    ga4: 'GA4',
    GA4: 'GA4',
    ai: 'AI',
    AI: 'AI',
    chatgpt: 'ChatGPT',
    ChatGPT: 'ChatGPT',
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escAttr(s) {
    return esc(s).replace(/'/g, '&#39;');
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { /* ignore */ }
  }

  function getApprovals() {
    return readJson(APPROVAL_KEY, {});
  }

  function saveApproval(actionId, status) {
    var map = getApprovals();
    map[actionId] = { status: status, at: new Date().toISOString(), mode: EXECUTION_MODE };
    writeJson(APPROVAL_KEY, map);
  }

  function approvalStatus(actionId) {
    var a = getApprovals()[actionId];
    return a && a.status ? a.status : null;
  }

  function getWorkbenchStore() {
    return readJson(WORKBENCH_KEY, { items: {}, pages: {} });
  }

  function saveWorkbenchStore(store) {
    writeJson(WORKBENCH_KEY, store);
  }

  function getActionFeedback(actionId) {
    var store = getWorkbenchStore();
    if (!store.items[actionId]) {
      store.items[actionId] = {
        liked: '',
        disliked: '',
        changeRequests: '',
        userNotes: '',
        chat: [],
        revisionRound: 1,
        updatedAt: null,
      };
    }
    return store.items[actionId];
  }

  function saveActionFeedback(actionId, patch) {
    var store = getWorkbenchStore();
    var fb = getActionFeedback(actionId);
    Object.keys(patch || {}).forEach(function (k) { fb[k] = patch[k]; });
    fb.updatedAt = new Date().toISOString();
    store.items[actionId] = fb;
    saveWorkbenchStore(store);
  }

  function getSeqState() {
    return readJson(SEQ_KEY, { nextActionItemNumber: 1, assignments: {} });
  }

  function saveSeqState(state) {
    writeJson(SEQ_KEY, state);
  }

  function sortActionsForNumbering(actions) {
    return actions.slice().sort(function (a, b) {
      var pa = String(a.pagePath || a.pageId || '');
      var pb = String(b.pagePath || b.pageId || '');
      if (pa !== pb) return pa.localeCompare(pb);
      var ra = String(a.recommendationType || a.category || '');
      var rb = String(b.recommendationType || b.category || '');
      if (ra !== rb) return ra.localeCompare(rb);
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }

  function bootstrapSequenceNumbers(allActions) {
    var state = getSeqState();
    var sorted = sortActionsForNumbering(allActions);
    var changed = false;
    sorted.forEach(function (a) {
      if (!a.id || state.assignments[a.id]) return;
      state.assignments[a.id] = state.nextActionItemNumber;
      state.nextActionItemNumber += 1;
      changed = true;
    });
    if (changed) saveSeqState(state);
    return state;
  }

  function getActionNumber(actionId) {
    var state = getSeqState();
    return state.assignments[actionId] || null;
  }

  function getPageRevisionRound(pageId, actions) {
    var max = 1;
    (actions || []).forEach(function (a) {
      var fb = getActionFeedback(a.id);
      if (fb.revisionRound > max) max = fb.revisionRound;
    });
    var store = getWorkbenchStore();
    if (store.pages[pageId] && store.pages[pageId].revisionRound > max) {
      max = store.pages[pageId].revisionRound;
    }
    return max;
  }

  function bumpRevisionRound(pageId, actions) {
    var store = getWorkbenchStore();
    var next = getPageRevisionRound(pageId, actions) + 1;
    store.pages[pageId] = store.pages[pageId] || {};
    store.pages[pageId].revisionRound = next;
    (actions || []).forEach(function (a) {
      saveActionFeedback(a.id, { revisionRound: next });
    });
    saveWorkbenchStore(store);
    return next;
  }

  function sourceBadge(src) {
    var label = SOURCE_LABELS[src] || src || '—';
    var cls = 'badge-gray';
    if (/gsc/i.test(label)) cls = 'badge-green';
    else if (/ga4/i.test(label)) cls = 'badge-purple';
    else if (/crawl/i.test(label)) cls = 'badge-yellow';
    else if (/checklist/i.test(label)) cls = 'badge-blue';
    else if (/ai|chatgpt/i.test(label)) cls = 'badge-purple';
    return '<span class="badge ' + cls + '">' + esc(label) + '</span>';
  }

  function priorityBadge(p) {
    var s = String(p || 'בינוני');
    if (/גבוה|קריטי|high/i.test(s)) return '<span class="badge badge-red">' + esc(s) + '</span>';
    if (/נמוך|low/i.test(s)) return '<span class="badge badge-gray">' + esc(s) + '</span>';
    return '<span class="badge badge-yellow">' + esc(s) + '</span>';
  }

  function actionStatusBadge(action) {
    var appr = approvalStatus(action.id);
    if (appr === 'approved_for_execution') {
      return '<span class="badge badge-green">✓ מאושר לביצוע</span>';
    }
    var s = action.status || 'pending';
    if (/done|completed|בוצע/.test(s)) return '<span class="badge badge-green">● הושלם</span>';
    if (/in_progress|progress/.test(s)) return '<span class="badge badge-purple">📝 בביצוע</span>';
    return '<span class="badge badge-yellow">⏳ ממתין</span>';
  }

  function buildBeforeAfterFallback(page, action) {
    if (action.beforeAfter && action.beforeAfter.current) return action.beforeAfter;
    var rec = (page.recommendations || []).find(function (r) {
      return r.typeId === action.recommendationType;
    });
    return {
      current: action.detail || 'מצב נוכחי — ראה פירוט',
      problem: rec ? (rec.status === 'fail' ? rec.labelHe + ' לא תקין' : rec.detail) : action.detail,
      proposed: action.detail || '—',
      after: action.detail || 'יושם לפי ההמלצה',
      why: action.detail || 'שיפור מומלץ לפי ביקורת',
      impact: 'SEO: בינוני · UX: בינוני',
      source: action.source,
    };
  }

  function previewBanner() {
    return '<div class="coco-act-preview-banner" role="status">' +
      '⚠️ <strong>מצב תצוגה בלבד</strong> — אישור ביצוע לא משנה את האתר החי · Staging preview · ' +
      '<code style="font-size:10px;opacity:0.85;">' + esc(EXECUTION_MODE) + '</code></div>';
  }

  function renderBeforeAfter(ba, itemNum) {
    var numBadge = itemNum
      ? '<span class="coco-act-item-num badge badge-purple" title="מספר פריט יציב">#' + itemNum + '</span> '
      : '';
    return numBadge +
      '<div class="coco-act-ba-grid">' +
      '<div class="coco-act-ba-box coco-act-ba-before">' +
      '<div class="coco-act-ba-label">מצב נוכחי</div>' +
      '<div class="coco-act-ba-text">' + esc(ba.current) + '</div>' +
      '<div class="coco-act-ba-sub"><strong>הבעיה:</strong> ' + esc(ba.problem) + '</div>' +
      '</div>' +
      '<div class="coco-act-ba-box coco-act-ba-after">' +
      '<div class="coco-act-ba-label">אחרי התיקון (צפי)</div>' +
      '<div class="coco-act-ba-text">' + esc(ba.after) + '</div>' +
      '<div class="coco-act-ba-sub"><strong>המלצה:</strong> ' + esc(ba.proposed) + '</div>' +
      '</div></div>' +
      '<div class="coco-act-ba-meta">' +
      '<div><strong>למה:</strong> ' + esc(ba.why) + '</div>' +
      '<div style="margin-top:4px;"><strong>השפעה צפויה:</strong> ' + esc(ba.impact) + '</div>' +
      '</div>';
  }

  function renderFeedbackPanel(action, page, itemNum) {
    var fb = getActionFeedback(action.id);
    var ba = buildBeforeAfterFallback(page, action);
    var aiRec = [ba.proposed, ba.why, ba.impact].filter(Boolean).join(' · ');
    var chatHtml = (fb.chat || []).slice(-6).map(function (m) {
      var cls = m.role === 'user' ? 'coco-act-chat-user' : 'coco-act-chat-ai';
      return '<div class="coco-act-chat-msg ' + cls + '">' + esc(m.text) + '</div>';
    }).join('');

    return '<div class="coco-act-feedback" data-action-id="' + escAttr(action.id) + '">' +
      '<div class="coco-act-fb-head">' +
      '<span class="coco-act-fb-title">💬 משוב ושיחה · פריט #' + (itemNum || '—') + '</span>' +
      '<span class="badge badge-gray coco-act-rev-badge">סבב ' + fb.revisionRound + '</span>' +
      '</div>' +
      '<div class="coco-act-fb-grid">' +
      fbField('liked', 'מה אהבתי', fb.liked, action.id) +
      fbField('disliked', 'מה לא אהבתי', fb.disliked, action.id) +
      fbField('changeRequests', 'מה צריך לשנות', fb.changeRequests, action.id) +
      fbField('userNotes', 'הערות שלי', fb.userNotes, action.id) +
      '</div>' +
      '<div class="coco-act-ai-rec-box">' +
      '<div class="coco-act-ai-rec-label">🤖 המלצות AI</div>' +
      '<div class="coco-act-ai-rec-text">' + esc(aiRec || action.detail || '—') + '</div>' +
      '</div>' +
      '<div class="coco-act-page-chat">' +
      '<div class="coco-act-page-chat-label">שיחה עם AI על העמוד בלבד</div>' +
      '<div class="coco-act-chat-log" data-chat-log="' + escAttr(action.id) + '">' +
      (chatHtml || '<div class="coco-act-chat-empty">שאל על השינוי המוצע, ההשפעה, או בקש תיקון לפריט #' + (itemNum || '') + '</div>') +
      '</div>' +
      '<div class="coco-act-chat-input-row">' +
      '<input type="text" class="coco-act-chat-input filter-input" data-chat-input="' + escAttr(action.id) + '" ' +
      'placeholder="שאל על ' + escAttr(page.path || 'העמוד') + '…" aria-label="שיחה עם AI">' +
      '<button type="button" class="btn btn-primary coco-act-btn-sm coco-act-chat-send" data-chat-send="' + escAttr(action.id) + '" ' +
      'data-page-id="' + escAttr(page.id || '') + '">שלח</button>' +
      '</div></div></div>';
  }

  function fbField(field, label, value, actionId) {
    return '<label class="coco-act-fb-field">' +
      '<span class="coco-act-fb-label">' + esc(label) + '</span>' +
      '<textarea rows="2" class="coco-act-fb-input" data-fb-field="' + field + '" data-fb-action="' + escAttr(actionId) + '">' +
      esc(value || '') + '</textarea></label>';
  }

  function renderActionItem(action, page, idx) {
    var ba = buildBeforeAfterFallback(page, action);
    var appr = approvalStatus(action.id);
    var approved = appr === 'approved_for_execution';
    var itemNum = getActionNumber(action.id);

    return '<div class="coco-act-item action-card" data-action-id="' + escAttr(action.id) + '" data-page-id="' + escAttr(action.pageId || '') + '">' +
      '<div class="coco-act-item-head">' +
      '<div class="coco-act-item-title">' +
      (itemNum ? '<span class="coco-act-num-tag">#' + itemNum + '</span> ' : '') +
      esc(action.category || action.title) + '</div>' +
      '<div class="coco-act-item-badges">' + sourceBadge(action.source) + ' ' +
      priorityBadge(action.urgency || action.priority) + ' ' + actionStatusBadge(action) + '</div></div>' +
      renderBeforeAfter(ba, itemNum) +
      renderFeedbackPanel(action, page, itemNum) +
      '<div class="coco-act-item-footer">' +
      (approved
        ? '<span class="badge badge-green" style="font-size:12px;">✓ מאושר לביצוע · ' + esc(new Date(getApprovals()[action.id].at).toLocaleString('he-IL')) + '</span>' +
          ' <button type="button" class="btn btn-ghost coco-act-btn-sm" data-act-revoke="' + escAttr(action.id) + '" onclick="CocoActRevokeApproval(\'' + escAttr(action.id) + '\')">↩ בטל אישור</button>'
        : '<button type="button" class="btn btn-green coco-act-btn-sm" data-act-approve="' + escAttr(action.id) + '" onclick="CocoActApprove(\'' + escAttr(action.id) + '\',this)">✅ אישור לביצוע</button>') +
      ' <span class="coco-act-approval-note">לא משנה את dalia-c.com · Staging בלבד</span>' +
      '</div></div>';
  }

  function renderPageCard(page, actions, idx) {
    var panelId = 'coco-act-page-panel-' + idx;
    var openCount = actions.length;
    var gsc = page.gsc || {};
    var gscLine = gsc.impressions ? (gsc.clicks || 0) + ' קליקים · ' + gsc.impressions + ' חשיפות' : 'GSC: —';
    var revRound = getPageRevisionRound(page.id, actions);
    var approvedCount = actions.filter(function (a) { return approvalStatus(a.id) === 'approved_for_execution'; }).length;

    var actionsHtml = openCount
      ? actions.map(function (a, i) { return renderActionItem(a, page, idx * 100 + i); }).join('')
      : '<div class="alert alert-ok" style="margin:0;">אין פעולות פתוחות לעמוד זה 🎉</div>';

    return '<div class="coco-act-page-card card" data-page-id="' + escAttr(page.id) + '" data-page-idx="' + idx + '">' +
      '<div class="coco-act-page-head">' +
      '<div class="coco-act-page-info">' +
      '<div class="coco-act-page-title">#' + (page.rank || idx + 1) + ' · ' + esc(page.title || page.path) + '</div>' +
      '<div class="coco-act-page-meta">' +
      '<a href="' + esc(page.url || page.pageUrl || '#') + '" target="_blank" rel="noopener" class="coco-act-path-link">' + esc(page.path) + ' ↗</a>' +
      ' · SEO ' + esc(page.seoScore != null ? page.seoScore + '/10' : '—') +
      ' · ' + esc(gscLine) +
      ' · <strong>' + openCount + '</strong> פעולות' +
      ' · <span class="badge badge-gray" style="font-size:10px;">סבב ' + revRound + '</span>' +
      (approvedCount ? ' · <span class="badge badge-green" style="font-size:10px;">' + approvedCount + ' מאושרים</span>' : '') +
      '</div></div>' +
      '<div class="coco-act-page-btns">' +
      '<a href="' + esc(page.url || page.pageUrl || '#') + '" target="_blank" rel="noopener" class="btn btn-primary coco-act-btn-sm">👁️ צפה בעמוד</a>' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-act-preview="' + escAttr(page.id) + '" data-page-idx="' + idx + '">' +
      '👁️ צפה בעמוד לאחר השינויים</button>' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-act-toggle="' + escAttr(panelId) + '" onclick="CocoActTogglePage(\'' + escAttr(panelId) + '\',this)">' +
      '📋 פירוט תיקונים <span class="coco-act-chevron">▼</span></button>' +
      '</div>' +
      '<div class="coco-act-page-tools">' +
      '<label class="coco-act-compare-toggle">' +
      '<input type="checkbox" data-act-compare="' + escAttr(page.id) + '"> השוואה לפני/אחרי בתצוגה מקדימה</label>' +
      '<span class="badge badge-yellow coco-act-preview-status" data-preview-status="' + escAttr(page.id) + '">תצוגה: מוכן</span>' +
      '</div></div>' +
      '<div id="' + panelId + '" class="coco-act-page-panel" style="display:none;">' +
      actionsHtml + '</div></div>';
  }

  function pagesBase() {
    var base = window.COCO_PAGES_BASE || '/future-craft-core/';
    if (base.charAt(0) !== '/') base = '/' + base.replace(/^\.\//, '');
    return location.origin + base;
  }

  function loadCrawlData() {
    if (_crawlCache) return Promise.resolve(_crawlCache);
    if (_crawlPromise) return _crawlPromise;
    _crawlPromise = fetch(pagesBase() + 'project-001/site-crawl-lite.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        _crawlCache = data;
        return data;
      })
      .catch(function () { return null; });
    return _crawlPromise;
  }

  function findCrawlPage(crawl, page) {
    if (!crawl || !crawl.crawl || !crawl.crawl.pages) return null;
    var path = String(page.path || '/').replace(/\/$/, '') || '/';
    return crawl.crawl.pages.find(function (p) {
      var cp = String(p.path || '/').replace(/\/$/, '') || '/';
      return cp === path || p.url === page.url || p.url === page.pageUrl;
    }) || null;
  }

  function buildPagePreviewState(page, actions, crawlPage) {
    var before = {
      title: (crawlPage && crawlPage.title) || page.title || page.path,
      meta: (crawlPage && crawlPage.metaDescription) || '—',
      h1: (crawlPage && crawlPage.h1) || page.title || '—',
      content: (crawlPage && crawlPage.metaDescription) || 'תוכן העמוד — מבוסס נתוני crawl',
      url: page.url || page.pageUrl || '',
    };
    var after = {
      title: before.title,
      meta: before.meta,
      h1: before.h1,
      content: before.content,
      url: before.url,
    };
    var applied = [];
    (actions || []).forEach(function (action) {
      var ba = buildBeforeAfterFallback(page, action);
      var val = ba.after || ba.proposed;
      if (!val || val === '—') return;
      var type = String(action.recommendationType || '').toLowerCase();
      var num = getActionNumber(action.id);
      var tag = num ? '#' + num + ' ' : '';
      if (type === 'title') { after.title = val; applied.push(tag + 'Title'); }
      else if (type === 'meta') { after.meta = val; applied.push(tag + 'Meta'); }
      else if (type === 'h1') { after.h1 = val; applied.push(tag + 'H1'); }
      else if (type === 'h2') { after.h2 = val; applied.push(tag + 'H2'); }
      else if (type === 'content') { after.content = val; applied.push(tag + 'תוכן'); }
      else { applied.push(tag + (action.category || type)); }
    });
    return { before: before, after: after, applied: applied };
  }

  function buildPreviewDocument(state, compareMode) {
    var b = state.before;
    var a = state.after;
    var appliedList = (state.applied || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');

    function pane(label, data, cls) {
      return '<div class="pane ' + cls + '">' +
        '<div class="pane-label">' + esc(label) + '</div>' +
        '<div class="serp">' +
        '<div class="serp-url">' + esc(data.url || 'dalia-c.com') + '</div>' +
        '<div class="serp-title">' + esc(data.title) + '</div>' +
        '<div class="serp-meta">' + esc(data.meta) + '</div></div>' +
        '<header class="page-head"><h1>' + esc(String(data.h1 || '').replace(/\n/g, ' ')) + '</h1></header>' +
        '<main class="page-body"><p>' + esc(data.content) + '</p></main></div>';
    }

    var body = compareMode
      ? '<div class="compare">' + pane('לפני (חי)', b, 'before') + pane('אחרי (מדומה)', a, 'after') + '</div>'
      : pane('אחרי כל התיקונים המוצעים', a, 'after solo');

    return '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Preview — ' + esc(a.title) + '</title>' +
      '<style>' +
      'body{font-family:Arial,Heebo,sans-serif;margin:0;padding:16px;background:#f8fafc;color:#0f172a;line-height:1.5}' +
      '.banner{background:#fef3c7;border:1px solid #f59e0b;padding:8px 12px;border-radius:8px;font-size:12px;margin-bottom:12px}' +
      '.compare{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
      '.pane{border:1px solid #e2e8f0;border-radius:10px;padding:12px;background:#fff}' +
      '.pane.before{border-color:#fca5a5;background:#fff5f5}' +
      '.pane.after,.pane.after.solo{border-color:#86efac;background:#f0fdf4}' +
      '.pane-label{font-size:11px;font-weight:700;margin-bottom:8px;text-transform:uppercase;color:#64748b}' +
      '.serp{background:#f1f5f9;border-radius:8px;padding:10px;margin-bottom:10px}' +
      '.serp-url{font-size:12px;color:#15803d}.serp-title{font-size:16px;color:#1d4ed8;margin:4px 0}' +
      '.serp-meta{font-size:13px;color:#475569}' +
      '.page-head h1{font-size:20px;margin:0 0 8px}.page-body p{font-size:14px;color:#334155}' +
      '.applied{margin-top:12px;font-size:12px;background:#eff6ff;border-radius:8px;padding:10px}' +
      '.applied ul{margin:6px 0 0;padding-right:18px}' +
      '@media(max-width:700px){.compare{grid-template-columns:1fr}}' +
      '</style></head><body>' +
      '<div class="banner">⚠️ תצוגה מדומה — מבוססת crawl + beforeAfter מ-SSOT · לא האתר החי · Staging preview</div>' +
      body +
      '<div class="applied"><strong>שינויים שהוחלו בתצוגה (' + (state.applied || []).length + '):</strong><ul>' +
      (appliedList || '<li>אין שינויי HTML ישירים — ראה פירוט בכרטיסי הפעולות</li>') +
      '</ul></div></body></html>';
  }

  function ensurePreviewModal() {
    var existing = document.getElementById('coco-act-preview-modal');
    if (existing) return existing;
    var screen = document.getElementById('screen-actions');
    var wrap = document.createElement('div');
    wrap.id = 'coco-act-preview-modal';
    wrap.className = 'coco-act-preview-overlay';
    wrap.style.display = 'none';
    wrap.innerHTML =
      '<div class="coco-act-preview-dialog" role="dialog" aria-modal="true" aria-label="תצוגה מקדימה">' +
      '<div class="coco-act-preview-head">' +
      '<div><div class="coco-act-preview-title">👁️ תצוגה מקדימה — לאחר השינויים</div>' +
      '<div class="coco-act-preview-sub" id="coco-act-preview-sub"></div></div>' +
      '<button type="button" class="btn-icon coco-act-preview-close" aria-label="סגור">✕</button></div>' +
      '<div class="coco-act-preview-toolbar">' +
      '<label class="coco-act-compare-toggle"><input type="checkbox" id="coco-act-preview-compare"> השוואה לפני/אחרי</label>' +
      '<span class="badge badge-yellow" id="coco-act-preview-mode">מדומה · crawl+SSOT</span></div>' +
      '<iframe id="coco-act-preview-frame" class="coco-act-preview-frame" title="תצוגה מקדימה" sandbox="allow-same-origin"></iframe>' +
      '</div>';
    (screen || document.body).appendChild(wrap);
    wrap.querySelector('.coco-act-preview-close').addEventListener('click', closePreviewModal);
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap) closePreviewModal();
    });
    wrap.querySelector('#coco-act-preview-compare').addEventListener('change', function () {
      if (wrap._previewState) renderPreviewFrame(wrap._previewState, this.checked);
    });
    return wrap;
  }

  function renderPreviewFrame(state, compareMode) {
    var frame = document.getElementById('coco-act-preview-frame');
    if (!frame) return;
    var doc = buildPreviewDocument(state, compareMode);
    frame.srcdoc = doc;
  }

  function closePreviewModal() {
    var modal = document.getElementById('coco-act-preview-modal');
    if (modal) modal.style.display = 'none';
  }

  function openPagePreview(pageId, pageIdx) {
    var page = null;
    var actions = [];
    _lastRenderActions.forEach(function (entry) {
      if (entry.page && entry.page.id === pageId) {
        page = entry.page;
        actions = entry.items || [];
      }
    });
    if (!page) return;

    var modal = ensurePreviewModal();
    var sub = document.getElementById('coco-act-preview-sub');
    if (sub) sub.textContent = (page.path || '') + ' · ' + actions.length + ' תיקונים מוצעים';
    modal.style.display = 'flex';

    var statusEl = document.querySelector('[data-preview-status="' + pageId + '"]');
    if (statusEl) {
      statusEl.textContent = 'תצוגה: טוען…';
      statusEl.className = 'badge badge-purple coco-act-preview-status';
    }

    var compareCheck = document.querySelector('[data-act-compare="' + pageId + '"]');
    var compareOn = compareCheck && compareCheck.checked;

    loadCrawlData().then(function (crawl) {
      var crawlPage = findCrawlPage(crawl, page);
      var state = buildPagePreviewState(page, actions, crawlPage);
      modal._previewState = state;
      var prevCompare = document.getElementById('coco-act-preview-compare');
      if (prevCompare) prevCompare.checked = !!compareOn;
      renderPreviewFrame(state, compareOn);
      if (statusEl) {
        statusEl.textContent = 'תצוגה: מדומה ✓';
        statusEl.className = 'badge badge-green coco-act-preview-status';
      }
    });
  }

  function buildActionSystemPrompt(action, page) {
    var ba = buildBeforeAfterFallback(page, action);
    var num = getActionNumber(action.id);
    var fb = getActionFeedback(action.id);
    return [
      'אתה עוזר SEO לעמוד בודד ב-dalia-c.com — Staging בלבד, ללא שינוי באתר החי.',
      'עמוד: ' + (page.path || page.url || '—'),
      'פריט פעולה #' + (num || '?') + ': ' + (action.category || action.title),
      'לפני: ' + ba.current,
      'אחרי מוצע: ' + ba.after,
      'למה: ' + ba.why,
      'משוב משתמש — אהבתי: ' + (fb.liked || '—'),
      'לא אהבתי: ' + (fb.disliked || '—'),
      'לבקש שינוי: ' + (fb.changeRequests || '—'),
      'ענה בעברית, קצר וממוקד לפריט זה בלבד.',
    ].join('\n');
  }

  function apiScopedChat(action, page, prompt, history) {
    var system = buildActionSystemPrompt(action, page);
    var api = window.COCO_API;
    if (api && api.hasApi) {
      return api.fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistant: true,
          module: 'actions-workbench',
          system: system,
          prompt: prompt,
          history: history || [],
          max_tokens: 700,
        }),
      }).then(function (r) {
        return { ok: r.ok && r.data && r.data.ok, text: r.data && r.data.text, message: r.data && r.data.message };
      }).catch(function (e) {
        return { ok: false, message: e.message };
      });
    }
    var ba = buildBeforeAfterFallback(page, action);
    return Promise.resolve({
      ok: true,
      text: 'פריט #' + (getActionNumber(action.id) || '?') + ' — ' + (action.category || '') +
        ': ההמלצה היא «' + (ba.proposed || ba.after) + '». ' +
        (ba.why ? 'סיבה: ' + ba.why + '. ' : '') +
        'זו תצוגת Staging — לאחר אישורך בלבד יוכלו ליישם בעתיד. ' +
        'לשינוי נוסף — מלא «מה צריך לשנות» ולחץ שמור.',
      local: true,
    });
  }

  function findActionAndPage(actionId) {
    var found = { action: null, page: null, items: [] };
    _lastRenderActions.forEach(function (entry) {
      (entry.items || []).forEach(function (a) {
        if (a.id === actionId) {
          found.action = a;
          found.page = entry.page;
          found.items = entry.items;
        }
      });
    });
    return found;
  }

  function sendScopedChat(actionId) {
    var input = document.querySelector('[data-chat-input="' + actionId + '"]');
    if (!input) return;
    var text = (input.value || '').trim();
    if (!text) return;
    var ctx = findActionAndPage(actionId);
    if (!ctx.action || !ctx.page) return;

    var fb = getActionFeedback(actionId);
    fb.chat = fb.chat || [];
    fb.chat.push({ role: 'user', text: text, at: new Date().toISOString() });
    saveActionFeedback(actionId, { chat: fb.chat });
    input.value = '';

    var log = document.querySelector('[data-chat-log="' + actionId + '"]');
    if (log) {
      log.innerHTML = fb.chat.slice(-6).map(function (m) {
        var cls = m.role === 'user' ? 'coco-act-chat-user' : 'coco-act-chat-ai';
        return '<div class="coco-act-chat-msg ' + cls + '">' + esc(m.text) + '</div>';
      }).join('');
      log.scrollTop = log.scrollHeight;
    }

    var hist = fb.chat.slice(-8).map(function (m) {
      return { role: m.role === 'user' ? 'user' : 'assistant', content: m.text };
    });

    apiScopedChat(ctx.action, ctx.page, text, hist.slice(0, -1)).then(function (res) {
      var reply = res.ok && res.text ? res.text : (res.message || 'לא ניתן להתחבר ל-AI כרגע — המשוב נשמר.');
      fb.chat.push({ role: 'ai', text: reply, at: new Date().toISOString(), local: !!res.local });
      saveActionFeedback(actionId, { chat: fb.chat });
      if (log) {
        log.innerHTML = fb.chat.slice(-6).map(function (m) {
          var cls = m.role === 'user' ? 'coco-act-chat-user' : 'coco-act-chat-ai';
          return '<div class="coco-act-chat-msg ' + cls + '">' + esc(m.text) + '</div>';
        }).join('');
        log.scrollTop = log.scrollHeight;
      }
    });
  }

  var _fbSaveTimer = null;
  function scheduleFeedbackSave(actionId, field, value) {
    clearTimeout(_fbSaveTimer);
    _fbSaveTimer = setTimeout(function () {
      var patch = {};
      patch[field] = value;
      saveActionFeedback(actionId, patch);
    }, 350);
  }

  function bindWorkbenchEvents() {
    var root = document.getElementById('coco-live-actions-pending');
    if (!root || root._actWorkbenchBound) return;
    root._actWorkbenchBound = true;

    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-act-toggle]');
      if (t) {
        var panelId = t.getAttribute('data-act-toggle');
        var panel = document.getElementById(panelId);
        if (panel) {
          var open = panel.style.display !== 'none';
          panel.style.display = open ? 'none' : 'block';
          var ch = t.querySelector('.coco-act-chevron');
          if (ch) ch.textContent = open ? '▼' : '▲';
        }
        return;
      }
      var prev = e.target.closest('[data-act-preview]');
      if (prev) {
        openPagePreview(prev.getAttribute('data-act-preview'), prev.getAttribute('data-page-idx'));
        return;
      }
      var appr = e.target.closest('[data-act-approve]');
      if (appr) {
        window.CocoActApprove(appr.getAttribute('data-act-approve'), appr);
        return;
      }
      var rev = e.target.closest('[data-act-revoke]');
      if (rev) {
        window.CocoActRevokeApproval(rev.getAttribute('data-act-revoke'));
        return;
      }
      var send = e.target.closest('[data-chat-send]');
      if (send) sendScopedChat(send.getAttribute('data-chat-send'));
    });

    root.addEventListener('input', function (e) {
      var ta = e.target.closest('[data-fb-field]');
      if (!ta) return;
      scheduleFeedbackSave(ta.getAttribute('data-fb-action'), ta.getAttribute('data-fb-field'), ta.value);
    });

    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var input = e.target.closest('[data-chat-input]');
      if (input) {
        e.preventDefault();
        sendScopedChat(input.getAttribute('data-chat-input'));
      }
    });

    root.addEventListener('change', function (e) {
      var cmp = e.target.closest('[data-act-compare]');
      if (!cmp) return;
      var modal = document.getElementById('coco-act-preview-modal');
      if (modal && modal.style.display !== 'none' && modal._previewState) {
        var prevCompare = document.getElementById('coco-act-preview-compare');
        if (prevCompare) prevCompare.checked = cmp.checked;
        renderPreviewFrame(modal._previewState, cmp.checked);
      }
    });
  }

  function render(bundle, deps) {
    deps = deps || {};
    var applyCtxFilter = deps.applyCtxFilter;
    var deriveActions = deps.deriveActions;
    var setHtml = deps.setHtml;
    var statusBadge = deps.statusBadge;
    var emptyStatus = deps.emptyStatus;
    var isLiveGoalsActionsMode = deps.isLiveGoalsActionsMode;

    if (!applyCtxFilter || !deriveActions || !setHtml) return 0;

    var wp = (bundle && bundle.workPlan) || (window.DaliaSite && DaliaSite.getWorkPlan && DaliaSite.getWorkPlan());
    var pages = (wp && wp.pages) ? wp.pages.slice() : [];
    pages.sort(function (a, b) { return (a.rank || 999) - (b.rank || 999); });

    var allActions = applyCtxFilter(deriveActions(bundle), function (a) {
      return { action: a.category, status: a.status, campaign: a.campaignId };
    });
    bootstrapSequenceNumbers(allActions);

    var pending = allActions.filter(function (a) {
      return a.status !== 'done' && a.status !== 'completed';
    });
    var done = allActions.filter(function (a) {
      return a.status === 'done' || a.status === 'completed';
    });

    var actionsByPage = {};
    pending.forEach(function (a) {
      var key = a.pageId || a.pagePath || 'other';
      if (!actionsByPage[key]) actionsByPage[key] = [];
      actionsByPage[key].push(a);
    });

    var pageGroups = pages.map(function (page) {
      return { page: page, items: actionsByPage[page.id] || [] };
    });
    _lastRenderActions = pageGroups;

    var pendingHeader = previewBanner() +
      '<div class="alert alert-info" style="margin-bottom:14px;">⚙️ ' +
      pending.length + ' פעולות פתוחות · ' + pages.length + ' עמודים · מספור יציב #' +
      (getSeqState().nextActionItemNumber - 1) + ' · קמפיין: ' +
      esc((wp && wp.campaign && wp.campaign.name) || 'SEO') + '</div>';

    var cardsHtml = pageGroups.map(function (grp, idx) {
      return renderPageCard(grp.page, grp.items, idx);
    }).join('');

    setHtml('coco-live-actions-pending', pages.length ? pendingHeader + cardsHtml : emptyStatus('אין עמודים ב-SSOT'));

    setHtml('coco-live-actions-done', done.length ? done.slice(0, 50).map(function (a) {
      var num = getActionNumber(a.id);
      return '<tr><td>' + (num ? '#' + num + ' ' : '') + esc(a.title) + '</td><td>' + esc(a.pagePath || '—') + '</td><td>' + esc(a.category) + '</td><td>' + esc(a.source) + '</td><td>' + (statusBadge ? statusBadge('done') : 'done') + '</td></tr>';
    }).join('') : '<tr><td colspan="5">אין פעולות שהושלמו עדיין</td></tr>');

    var sub = document.querySelector('#screen-actions .page-subtitle');
    if (sub && isLiveGoalsActionsMode && isLiveGoalsActionsMode()) {
      sub.textContent = pending.length + ' פעולות · ' + pages.length + ' עמודים · מסך עבודה (תצוגה בלבד)';
    }

    bindWorkbenchEvents();
    return pending.length;
  }

  window.CocoActTogglePage = function (panelId, btn) {
    var panel = document.getElementById(panelId);
    if (!panel) return;
    var open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'block';
    if (btn) {
      var ch = btn.querySelector('.coco-act-chevron');
      if (ch) ch.textContent = open ? '▼' : '▲';
    }
  };

  window.CocoActOpenPreview = function (pageId, pageIdx) {
    openPagePreview(pageId, pageIdx);
  };

  window.CocoActApprove = function (actionId, btn) {
    if (EXECUTION_MODE !== 'preview') return;
    saveApproval(actionId, 'approved_for_execution');
    if (typeof showToast === 'function') showToast('✓ אושר לביצוע (Staging בלבד — לא שונה באתר החי)');
    if (window.CocoData && CocoData.bindScreen) CocoData.bindScreen('screen-actions');
  };

  window.CocoActRevokeApproval = function (actionId) {
    var map = getApprovals();
    delete map[actionId];
    writeJson(APPROVAL_KEY, map);
    if (typeof showToast === 'function') showToast('אישור בוטל');
    if (window.CocoData && CocoData.bindScreen) CocoData.bindScreen('screen-actions');
  };

  window.ActionsWorkbench = {
    render: render,
    getApprovals: getApprovals,
    getSeqState: getSeqState,
    getActionNumber: getActionNumber,
    getActionFeedback: getActionFeedback,
    buildPagePreviewState: buildPagePreviewState,
    EXECUTION_MODE: EXECUTION_MODE,
    APPROVAL_KEY: APPROVAL_KEY,
    WORKBENCH_KEY: WORKBENCH_KEY,
    SEQ_KEY: SEQ_KEY,
  };
})();
