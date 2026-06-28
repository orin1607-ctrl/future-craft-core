/**
 * Actions Workbench — Staging preview only. Approvals stored in localStorage; no live site writes.
 */
(function () {
  'use strict';

  var EXECUTION_MODE = 'preview';
  var APPROVAL_KEY = 'dalia-action-approvals-v1';

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
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getApprovals() {
    try {
      var raw = localStorage.getItem(APPROVAL_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveApproval(actionId, status) {
    var map = getApprovals();
    map[actionId] = { status: status, at: new Date().toISOString(), mode: EXECUTION_MODE };
    try {
      localStorage.setItem(APPROVAL_KEY, JSON.stringify(map));
    } catch (e) { /* ignore */ }
  }

  function approvalStatus(actionId) {
    var a = getApprovals()[actionId];
    return a && a.status ? a.status : null;
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

  function renderBeforeAfter(ba) {
    return '<div class="coco-act-ba-grid">' +
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

  function renderActionItem(action, page, idx) {
    var ba = buildBeforeAfterFallback(page, action);
    var appr = approvalStatus(action.id);
    var approved = appr === 'approved_for_execution';
    var panelId = 'coco-act-item-' + idx + '-' + (action.recommendationType || 'x');

    return '<div class="coco-act-item action-card" data-action-id="' + esc(action.id) + '" data-page-id="' + esc(action.pageId || '') + '">' +
      '<div class="coco-act-item-head">' +
      '<div class="coco-act-item-title">' + esc(action.category || action.title) + '</div>' +
      '<div class="coco-act-item-badges">' + sourceBadge(action.source) + ' ' +
      priorityBadge(action.urgency || action.priority) + ' ' + actionStatusBadge(action) + '</div></div>' +
      renderBeforeAfter(ba) +
      '<div class="coco-act-item-footer">' +
      (approved
        ? '<span class="badge badge-green" style="font-size:12px;">✓ מאושר לביצוע · ' + esc(new Date(getApprovals()[action.id].at).toLocaleString('he-IL')) + '</span>' +
          ' <button type="button" class="btn btn-ghost coco-act-btn-sm" onclick="CocoActRevokeApproval(\'' + esc(action.id) + '\')">↩ בטל אישור</button>'
        : '<button type="button" class="btn btn-green coco-act-btn-sm" onclick="CocoActApprove(\'' + esc(action.id) + '\',this)">✅ אישור ביצוע</button>') +
      ' <span class="coco-act-approval-note">לא משנה את dalia-c.com</span>' +
      '</div></div>';
  }

  function renderPageCard(page, actions, idx) {
    var panelId = 'coco-act-page-panel-' + idx;
    var openCount = actions.length;
    var gsc = page.gsc || {};
    var gscLine = gsc.impressions ? (gsc.clicks || 0) + ' קליקים · ' + gsc.impressions + ' חשיפות' : 'GSC: —';

    var actionsHtml = openCount
      ? actions.map(function (a, i) { return renderActionItem(a, page, idx * 100 + i); }).join('')
      : '<div class="alert alert-ok" style="margin:0;">אין פעולות פתוחות לעמוד זה 🎉</div>';

    return '<div class="coco-act-page-card card" data-page-id="' + esc(page.id) + '">' +
      '<div class="coco-act-page-head">' +
      '<div class="coco-act-page-info">' +
      '<div class="coco-act-page-title">#' + (page.rank || idx + 1) + ' · ' + esc(page.title || page.path) + '</div>' +
      '<div class="coco-act-page-meta">' +
      '<a href="' + esc(page.url || page.pageUrl || '#') + '" target="_blank" rel="noopener" class="coco-act-path-link">' + esc(page.path) + ' ↗</a>' +
      ' · SEO ' + esc(page.seoScore != null ? page.seoScore + '/10' : '—') +
      ' · ' + esc(gscLine) +
      ' · <strong>' + openCount + '</strong> פעולות</div></div>' +
      '<div class="coco-act-page-btns">' +
      '<a href="' + esc(page.url || page.pageUrl || '#') + '" target="_blank" rel="noopener" class="btn btn-primary coco-act-btn-sm">👁 צפה בעמוד</a>' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" onclick="CocoActTogglePage(\'' + panelId + '\',this)">' +
      '📋 פירוט תיקונים <span class="coco-act-chevron">▼</span></button>' +
      '</div></div>' +
      '<div id="' + panelId + '" class="coco-act-page-panel" style="display:none;">' +
      actionsHtml + '</div></div>';
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

    var pendingHeader = previewBanner() +
      '<div class="alert alert-info" style="margin-bottom:14px;">⚙️ ' +
      pending.length + ' פעולות פתוחות · ' + pages.length + ' עמודים · קמפיין: ' +
      esc((wp && wp.campaign && wp.campaign.name) || 'SEO') + '</div>';

    var cardsHtml = pageGroups.map(function (grp, idx) {
      return renderPageCard(grp.page, grp.items, idx);
    }).join('');

    setHtml('coco-live-actions-pending', pages.length ? pendingHeader + cardsHtml : emptyStatus('אין עמודים ב-SSOT'));

    setHtml('coco-live-actions-done', done.length ? done.slice(0, 50).map(function (a) {
      return '<tr><td>' + esc(a.title) + '</td><td>' + esc(a.pagePath || '—') + '</td><td>' + esc(a.category) + '</td><td>' + esc(a.source) + '</td><td>' + (statusBadge ? statusBadge('done') : 'done') + '</td></tr>';
    }).join('') : '<tr><td colspan="5">אין פעולות שהושלמו עדיין</td></tr>');

    var sub = document.querySelector('#screen-actions .page-subtitle');
    if (sub && isLiveGoalsActionsMode && isLiveGoalsActionsMode()) {
      sub.textContent = pending.length + ' פעולות · ' + pages.length + ' עמודים · מסך עבודה (תצוגה בלבד)';
    }

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

  window.CocoActApprove = function (actionId, btn) {
    if (EXECUTION_MODE !== 'preview') return;
    saveApproval(actionId, 'approved_for_execution');
    if (typeof showToast === 'function') showToast('✓ אושר לביצוע (Staging בלבד — לא שונה באתר החי)');
    if (window.CocoData && CocoData.bindScreen) CocoData.bindScreen('screen-actions');
  };

  window.CocoActRevokeApproval = function (actionId) {
    var map = getApprovals();
    delete map[actionId];
    try { localStorage.setItem(APPROVAL_KEY, JSON.stringify(map)); } catch (e) { /* ignore */ }
    if (typeof showToast === 'function') showToast('אישור בוטל');
    if (window.CocoData && CocoData.bindScreen) CocoData.bindScreen('screen-actions');
  };

  window.ActionsWorkbench = {
    render: render,
    getApprovals: getApprovals,
    EXECUTION_MODE: EXECUTION_MODE,
    APPROVAL_KEY: APPROVAL_KEY,
  };
})();
