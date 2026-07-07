/**
 * CO.CO דליה — Evidence Report v2 Viewer + Task Approval Queue
 * Staging only: approvals are stored locally — NO WordPress / Production publish.
 */
(function () {
  'use strict';

  var VERSION = '2.0.0-evidence-view';
  var REPORT_PATH = 'project-001/evidence-report-v2.json';
  var APPROVAL_KEY = 'coco-dalia-task-approvals-v1';
  var APPROVAL_QUEUE_IDS = ['TASK-0014', 'TASK-0015', 'TASK-0016'];
  var PUBLISH_POLICY = {
    productionPublish: false,
    note: 'אישור לביצוע אינו מפרסם לאתר Production — דורש שלב נפרד לאחר אישור יוני',
  };

  var _report = null;
  var _loadPromise = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function saveLs(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function getBasePath() {
    if (window.COCO_PAGES_BASE) {
      var b = window.COCO_PAGES_BASE;
      return b.charAt(0) === '/' ? b : (b.endsWith('/') ? b : b + '/');
    }
    return '/future-craft-core/';
  }

  function assetUrl(rel) {
    var base = getBasePath();
    if (base.charAt(0) === '/') return location.origin + base + rel;
    try { return new URL(rel, base).href; } catch (e) { return rel; }
  }

  function loadReport(force) {
    if (_report && !force) return Promise.resolve(_report);
    if (_loadPromise && !force) return _loadPromise;
    _loadPromise = fetch(assetUrl(REPORT_PATH), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        _report = data;
        return data;
      })
      .catch(function (err) {
        _loadPromise = null;
        throw err;
      });
    return _loadPromise;
  }

  function getApprovals() {
    return parseLs(APPROVAL_KEY) || { tasks: {}, policy: PUBLISH_POLICY, updatedAt: null };
  }

  function saveApprovals(store) {
    store.updatedAt = new Date().toISOString();
    saveLs(APPROVAL_KEY, store);
    return store;
  }

  function getTaskById(taskId) {
    if (!_report || !_report.tasks) return null;
    return _report.tasks.find(function (t) { return t.id === taskId; }) || null;
  }

  function getApprovalQueue() {
    return APPROVAL_QUEUE_IDS.map(function (id) {
      var task = getTaskById(id);
      var approvals = getApprovals();
      var rec = approvals.tasks[id] || null;
      return {
        taskId: id,
        task: task,
        approval: rec,
        readyToExecute: !!(task && task.systemCanExecute),
        requiresOwner: !!(task && task.requiresOwnerApproval),
        status: rec && rec.status === 'approved_for_execution' ? 'מאושר לביצוע (לא פורסם)' : 'ממתין לאישור',
        approved: !!(rec && rec.status === 'approved_for_execution'),
      };
    });
  }

  function approveTask(taskId, opts) {
    opts = opts || {};
    if (APPROVAL_QUEUE_IDS.indexOf(taskId) < 0) {
      return { ok: false, error: 'משימה לא ברשימת האישור הנוכחית' };
    }
    var task = getTaskById(taskId);
    if (!task) return { ok: false, error: 'משימה לא נמצאה בדוח' };

    var store = getApprovals();
    store.tasks[taskId] = {
      taskId: taskId,
      title: task.title,
      status: 'approved_for_execution',
      approvedAt: new Date().toISOString(),
      approvedBy: opts.approvedBy || 'יוני',
      publishExecuted: false,
      productionBlocked: true,
      note: PUBLISH_POLICY.note,
    };
    saveApprovals(store);

    if (window.ProjectBrief && ProjectBrief.appendActivity) {
      try {
        ProjectBrief.appendActivity({
          type: 'task_approval',
          taskId: taskId,
          title: task.title,
          message: 'אושר לביצוע — ללא פרסום Production',
        });
      } catch (e) { /* optional */ }
    }

    return { ok: true, approval: store.tasks[taskId], published: false };
  }

  function revokeApproval(taskId) {
    var store = getApprovals();
    if (store.tasks[taskId]) {
      delete store.tasks[taskId];
      saveApprovals(store);
    }
    return { ok: true };
  }

  function buildTaskRow(item) {
    var t = item.task;
    if (!t) {
      return '<div class="ev-task-card ev-task-missing"><b>' + esc(item.taskId) + '</b> — לא נמצא בדוח</div>';
    }
    var readyBadge = item.readyToExecute
      ? '<span class="bd bd-g">מוכן לביצוע (מערכת)</span>'
      : '<span class="bd bd-x">לא אוטומטי</span>';
    var ownerBadge = item.requiresOwner
      ? '<span class="bd bd-y">דורש אישור יוני</span>'
      : '<span class="bd bd-g">ללא אישור</span>';
    var statusCls = item.approved ? 'bd-g' : 'bd-y';
    var actions = '';
    if (!item.approved) {
      actions = '<button type="button" class="btn btn-go btn-sm ev-approve-btn" data-task="' + esc(t.id) + '">✅ אשר לביצוע</button>';
    } else {
      actions = '<span class="bd bd-g">מאושר ' + esc((item.approval.approvedAt || '').slice(0, 10)) + '</span>' +
        ' <button type="button" class="btn btn-g btn-sm ev-revoke-btn" data-task="' + esc(t.id) + '">בטל אישור</button>';
    }
    return (
      '<div class="ev-task-card" id="ev-task-' + esc(t.id) + '">' +
        '<div class="ev-task-head"><span class="ev-task-id">' + esc(t.id) + '</span> ' + readyBadge + ' ' + ownerBadge + '</div>' +
        '<div class="ev-task-title">' + esc(t.title) + '</div>' +
        '<div class="ev-task-row"><span class="ev-lbl">קיים:</span><code class="ev-val">' + esc(t.currentValue) + '</code></div>' +
        '<div class="ev-task-row"><span class="ev-lbl">מומלץ:</span><code class="ev-val ev-rec">' + esc(t.recommendedValue) + '</code></div>' +
        '<div class="ev-task-meta">' +
          '<span>עדיפות: ' + esc(t.priority) + '</span> · ' +
          '<span>' + esc(t.estimateHours) + ' שעות</span> · ' +
          '<span>יעד: ' + esc(t.dueDate || '—') + '</span>' +
        '</div>' +
        '<div class="ev-task-src">מקור: ' + esc((t.evidence && t.evidence[0] && t.evidence[0].file) || 'evidence-report') + '</div>' +
        '<div class="ev-task-actions">' + actions + ' <span class="bd ' + statusCls + '">' + esc(item.status) + '</span></div>' +
        '<div class="ev-publish-note">🔒 ' + esc(PUBLISH_POLICY.note) + '</div>' +
      '</div>'
    );
  }

  function buildApprovalQueueHtml() {
    var queue = getApprovalQueue();
    var approved = queue.filter(function (q) { return q.approved; }).length;
    return (
      '<div class="ev-queue">' +
        '<div class="ev-queue-head">' +
          '<div class="ev-queue-title">📋 תור אישור — עמוד הבית (TASK-0014–0016)</div>' +
          '<div class="ev-queue-sub">' + approved + '/' + queue.length + ' מאושרים · פרסום Production חסום</div>' +
        '</div>' +
        queue.map(buildTaskRow).join('') +
      '</div>'
    );
  }

  function buildEvidenceTable(rows, headers) {
    if (!rows || !rows.length) return '<p class="ev-muted">אין נתונים</p>';
    return (
      '<div class="ev-table-wrap"><table class="ev-table"><thead><tr>' +
      headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      rows.map(function (row) {
        return '<tr>' + row.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
      }).join('') +
      '</tbody></table></div>'
    );
  }

  function buildFullReportHtml(report) {
    report = report || _report;
    if (!report) return '<p>טוען דוח...</p>';

    var prov = report.dataProvenance || {};
    var gsc = report.googleReports && report.googleReports.gsc;
    var ga4 = report.googleReports && report.googleReports.ga4;
    var broken = (report.evidence && report.evidence.brokenUrls) || [];
    var brokenRows = broken.slice(0, 13).map(function (b) {
      return [
        esc(b.path),
        '<span class="bd bd-r">' + b.httpStatus + '</span>',
        String(b.ga4Sessions || 0),
        esc(b.recommendation),
      ];
    });

    var gscKw = (gsc && gsc.keywords || []).filter(function (k) {
      return /צי|עסק|חבילות|ניהול/i.test(k.query);
    }).slice(0, 6).map(function (k) {
      return [esc(k.query), String(k.impressions), '#' + (k.position || 0).toFixed(1), String(k.clicks || 0)];
    });

    var ga4Top = (ga4 && ga4.topPages || []).slice(0, 8).map(function (p) {
      return [esc(p.pagePath), String(p.sessions), String(p.screenPageViews)];
    });

    var orch = report.orchestrator || {};
    var self = report.selfAudit || {};

    return (
      '<div class="ev-doc">' +
        '<header class="ev-header">' +
          '<div class="ev-h1">דוח Evidence v2</div>' +
          '<div class="ev-client">' + esc(report.client && report.client.name) + '</div>' +
          '<div class="ev-meta">' +
            'נוצר: ' + esc((report.generatedAt || '').slice(0, 19).replace('T', ' ')) +
            ' · אתר נתונים: ' + esc(report.client && report.client.dataSite) +
          '</div>' +
          '<div class="ev-badges">' +
            '<span class="bd bd-g">סטנדרט מאושר</span>' +
            '<span class="bd bd-r">Production חסום</span>' +
            '<span class="bd bd-y">Cache: dashboard.json</span>' +
          '</div>' +
        '</header>' +

        '<section class="ev-sec">' +
          '<h2 class="ev-sec-t">מקורות נתונים</h2>' +
          '<ul class="ev-ul">' +
            '<li><b>GSC</b>: ' + esc(prov.gsc && prov.gsc.range && prov.gsc.range.start) + ' – ' + esc(prov.gsc && prov.gsc.range && prov.gsc.range.end) +
              ' · <a href="' + esc(prov.gsc && prov.gsc.link) + '" target="_blank" rel="noopener">Search Console</a></li>' +
            '<li><b>GA4</b>: ' + esc(prov.ga4 && prov.ga4.days) + ' ימים · Property ' + esc(prov.ga4 && prov.ga4.property) + '</li>' +
            '<li><b>סריקה</b>: ' + esc(prov.crawl && prov.crawl.crawledAt) + ' (' + esc(prov.crawl && prov.crawl.method) + ')</li>' +
            '<li><b>Sync</b>: ' + esc(prov.dashboard && prov.dashboard.sync && prov.dashboard.sync.timestamp) + '</li>' +
          '</ul>' +
        '</section>' +

        '<section class="ev-sec">' +
          '<h2 class="ev-sec-t">החלטת Orchestrator</h2>' +
          '<p class="ev-p"><b>' + esc(orch.decision) + '</b></p>' +
          '<div class="ev-sub">נתונים שהכריעו:</div>' +
          '<ul class="ev-ul">' + (orch.decisiveData || []).map(function (d) {
            return '<li>' + esc(d.data) + ' <span class="ev-src">(' + esc(d.source) + ')</span></li>';
          }).join('') + '</ul>' +
        '</section>' +

        '<section class="ev-sec">' +
          '<h2 class="ev-sec-t">ראיות — Title עמוד הבית</h2>' +
          '<div class="ev-compare">' +
            '<div><span class="ev-lbl">קיים</span><code>' + esc(report.evidence && report.evidence.title && report.evidence.title.current) + '</code></div>' +
            '<div><span class="ev-lbl">מומלץ</span><code class="ev-rec">' + esc(report.evidence && report.evidence.title && report.evidence.title.recommended) + '</code></div>' +
          '</div>' +
        '</section>' +

        '<section class="ev-sec">' +
          '<h2 class="ev-sec-t">404 עם תנועת GA4 (' + broken.length + ')</h2>' +
          buildEvidenceTable(brokenRows, ['נתיב', 'HTTP', 'GA4 Sessions', 'המלצה']) +
          '<p class="ev-src-note">מקור: docs/audit-reports/project-001/GA4-URL-AUDIT.json</p>' +
        '</section>' +

        '<section class="ev-sec">' +
          '<h2 class="ev-sec-t">GSC — שאילתות B2B</h2>' +
          buildEvidenceTable(gscKw, ['שאילתה', 'חשיפות', 'מיקום', 'קליקים']) +
        '</section>' +

        '<section class="ev-sec">' +
          '<h2 class="ev-sec-t">GA4 — דפים מובילים</h2>' +
          buildEvidenceTable(ga4Top, ['דף', 'Sessions', 'Views']) +
          '<p class="ev-src-note">מקורות כניסה (channel): ' + esc(ga4 && ga4.channelData) + '</p>' +
        '</section>' +

        '<section class="ev-sec">' +
          '<h2 class="ev-sec-t">תור אישור משימות</h2>' +
          buildApprovalQueueHtml() +
        '</section>' +

        '<section class="ev-sec">' +
          '<h2 class="ev-sec-t">ביקורת עצמית</h2>' +
          '<div class="ev-sub">בטוחים:</div><ul class="ev-ul">' + (self.confident || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
          '<div class="ev-sub">חלקיים:</div><ul class="ev-ul">' + (self.partial || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
          '<div class="ev-sub">חסרים:</div><ul class="ev-ul">' + (self.missing || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
        '</section>' +
      '</div>'
    );
  }

  function bindApprovalButtons(root) {
    if (!root) return;
    root.querySelectorAll('.ev-approve-btn').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-task');
        var res = approveTask(id);
        if (res.ok) {
          if (typeof window.toast === 'function') toast('✅ ' + id + ' אושר לביצוע — לא פורסם ב-Production');
          refreshUI();
        } else if (typeof window.toast === 'function') toast('⚠️ ' + (res.error || 'שגיאה'));
      };
    });
    root.querySelectorAll('.ev-revoke-btn').forEach(function (btn) {
      btn.onclick = function () {
        revokeApproval(btn.getAttribute('data-task'));
        if (typeof window.toast === 'function') toast('בוטל אישור');
        refreshUI();
      };
    });
  }

  function refreshUI() {
    var queueEl = document.getElementById('evidence-approval-queue');
    var contentEl = document.getElementById('evidence-report-content');
    if (queueEl) {
      queueEl.innerHTML = buildApprovalQueueHtml();
      bindApprovalButtons(queueEl);
    }
    if (contentEl && _report) {
      contentEl.innerHTML = buildFullReportHtml(_report);
      bindApprovalButtons(contentEl);
    }
    if (typeof window._cocoV5RenderReports === 'function') window._cocoV5RenderReports();
  }

  function renderReportsBanner() {
    var el = document.getElementById('evidence-report-banner');
    if (!el || !_report) return;
    var q = getApprovalQueue();
    var pending = q.filter(function (x) { return !x.approved; }).length;
    el.innerHTML =
      '<div class="ev-featured-card">' +
        '<div class="ev-featured-top">' +
          '<div><div class="ev-featured-title">📊 דוח Evidence v2 — דליה</div>' +
          '<div class="ev-featured-sub">סטנדרט מאושר · ' + esc((_report.generatedAt || '').slice(0, 10)) + '</div></div>' +
          '<span class="bd bd-g">Live Cache</span>' +
        '</div>' +
        '<div class="ev-featured-stats">' +
          '<span>' + ((_report.tasks || []).length) + ' משימות</span> · ' +
          '<span>' + pending + ' ממתינות לאישורך</span> · ' +
          '<span class="ev-warn">Production חסום</span>' +
        '</div>' +
        '<div class="ev-featured-actions">' +
          '<button type="button" class="btn btn-p btn-sm" id="ev-open-report-btn">📄 פתח דוח מלא</button>' +
          '<button type="button" class="btn btn-g btn-sm" id="ev-download-report-btn">⬇️ הורד HTML</button>' +
        '</div>' +
      '</div>';
    var openBtn = document.getElementById('ev-open-report-btn');
    var dlBtn = document.getElementById('ev-download-report-btn');
    if (openBtn) openBtn.onclick = openViewer;
    if (dlBtn) dlBtn.onclick = downloadHtml;
  }

  function openViewer() {
    var modal = document.getElementById('evidence-report-modal');
    var content = document.getElementById('evidence-report-content');
    if (!modal || !content) return;
    loadReport().then(function (r) {
      content.innerHTML = buildFullReportHtml(r);
      bindApprovalButtons(content);
      modal.classList.add('on');
    }).catch(function () {
      content.innerHTML = '<p class="ev-muted">לא ניתן לטעון evidence-report-v2.json — הרץ: npm run project-001:evidence-report</p>';
      modal.classList.add('on');
    });
  }

  function closeViewer() {
    var modal = document.getElementById('evidence-report-modal');
    if (modal) modal.classList.remove('on');
  }

  function downloadHtml() {
    loadReport().then(function (r) {
      var body = buildFullReportHtml(r);
      var html = '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>Evidence v2 — דליה</title>' +
        '<style>body{font-family:Heebo,Arial,sans-serif;background:#071022;color:#fff;padding:20px;max-width:900px;margin:0 auto}' +
        '.ev-rec{color:#22c55e}.ev-src{color:#94a3b8;font-size:12px}table{width:100%;border-collapse:collapse;font-size:12px}' +
        'th,td{border:1px solid #1e3a5f;padding:6px 8px;text-align:right}</style></head><body>' + body + '</body></html>';
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      a.download = 'evidence-report-v2-dalia-' + new Date().toISOString().slice(0, 10) + '.html';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  function mountReportsScreen() {
    var queueEl = document.getElementById('evidence-approval-queue');
    if (queueEl) {
      queueEl.innerHTML = buildApprovalQueueHtml();
      bindApprovalButtons(queueEl);
    }
    renderReportsBanner();
  }

  function init(opts) {
    opts = opts || {};
    return loadReport(opts.force).then(function (r) {
      mountReportsScreen();
      return r;
    });
  }

  function buildApprovalsForEngine() {
    return getApprovalQueue().map(function (q) {
      return {
        id: 'ap-' + q.taskId,
        name: q.taskId + ': ' + (q.task ? q.task.title : '—'),
        status: q.approved ? 'אושר לביצוע (לא פורסם)' : 'ממתין לאישור יוני',
        taskId: q.taskId,
        blocked: !q.approved,
        note: PUBLISH_POLICY.note,
        readyToExecute: q.readyToExecute,
        requiresOwner: q.requiresOwner,
      };
    });
  }

  window.CocoDaliaEvidenceReportView = {
    VERSION: VERSION,
    REPORT_PATH: REPORT_PATH,
    APPROVAL_QUEUE_IDS: APPROVAL_QUEUE_IDS,
    PUBLISH_POLICY: PUBLISH_POLICY,
    loadReport: loadReport,
    getReport: function () { return _report; },
    getApprovals: getApprovals,
    getApprovalQueue: getApprovalQueue,
    approveTask: approveTask,
    revokeApproval: revokeApproval,
    buildFullReportHtml: buildFullReportHtml,
    buildApprovalQueueHtml: buildApprovalQueueHtml,
    openViewer: openViewer,
    closeViewer: closeViewer,
    downloadHtml: downloadHtml,
    mountReportsScreen: mountReportsScreen,
    init: init,
    buildApprovalsForEngine: buildApprovalsForEngine,
    refreshUI: refreshUI,
  };
})();
