/**
 * CO.CO דליה — Reports Engine (Phase 4 E2E)
 * Real reports from Brief, WorkPlan, Progress, PreBuild modules.
 */
(function () {
  'use strict';

  var VERSION = '5.0.0-reports-evidence';
  var REPORTS_KEY = 'coco-dalia-reports-v1';

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function saveLs(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function bizName() {
    var brief = parseLs('dalia_project_brief');
    if (brief && brief.biz) return brief.biz.companyName || brief.biz.bizName || 'לקוח';
    var a = parseLs('dalia_part_a') || {};
    return a.bizName || a.name || 'לקוח';
  }

  function buildReportsList(apiSnap) {
    var list = [];
    var progress = parseLs('coco-dalia-progress-v1') || {};
    var partB = parseLs('dalia_part_b');
    var wp = (apiSnap && apiSnap.workPlan) || (parseLs('coco-dalia-api-cache-v1') || {}).workPlan;
    var dash = (apiSnap && apiSnap.dashboard) || (parseLs('coco-dalia-api-cache-v1') || {}).dashboard;

    list.unshift({
      id: 'r-evidence-v2',
      name: 'דוח Evidence v2 — דליה',
      type: 'Evidence Report · סטנדרט חדש',
      date: today(),
      status: 'אושר',
      source: 'project-001/evidence-report-v2.json',
      real: true,
      featured: true,
      meta: { standard: 'CO.CO Evidence v2', productionBlocked: true },
    });

    list.unshift({
      id: 'r-daily-progress',
      name: 'דוח התקדמות יומי',
      type: 'Daily Progress · Read Only',
      date: today(),
      status: 'מוכן',
      source: 'coco-reports/.../daily/latest.html',
      real: true,
      meta: { readOnly: true, pipeline: false },
    });

    list.push({
      id: 'r-brief',
      name: 'דוח Business Discovery',
      type: 'Brief · חלק א׳',
      date: today(),
      status: progress.parts && progress.parts.a && progress.parts.a.status === 'completed' ? 'אושר' : 'בתהליך',
      source: 'wired-ls',
      real: true,
    });

    if (partB) {
      list.push({
        id: 'r-seo',
        name: 'דוח SEO · מילות מפתח',
        type: 'SEO · חלק ב׳',
        date: today(),
        status: partB.approved ? 'אושר' : 'בתהליך',
        source: 'wired-ls',
        real: true,
      });
    }

    if (wp && wp.summary) {
      list.push({
        id: 'r-workplan',
        name: 'דוח תוכנית עבודה · אתר',
        type: 'Work Plan',
        date: today(),
        status: (wp.summary.progressPercent || 0) >= 80 ? 'אושר' : 'בתהליך',
        source: 'api-readonly',
        real: true,
        meta: { pages: wp.summary.pageCount, open: wp.summary.actionsOpen },
      });
    }

    if (dash && dash.connections) {
      list.push({
        id: 'r-integrations',
        name: 'דוח אינטגרציות Google',
        type: 'API Status',
        date: today(),
        status: 'אושר',
        source: 'dashboard.json',
        real: true,
      });
    }

    if (dash && dash.stats) {
      var st = dash.stats;
      list.push({
        id: 'r-gsc-live',
        name: 'דוח Search Console חי',
        type: 'GSC · 28 ימים',
        date: today(),
        status: (st.totalClicks || 0) > 0 ? 'אושר' : 'בתהליך',
        source: 'dashboard.json',
        real: true,
        meta: { clicks: st.totalClicks, impressions: st.totalImpressions, keywords: st.keywordCount },
      });
      if (st.ga4Sessions != null) {
        list.push({
          id: 'r-ga4-live',
          name: 'דוח Analytics 4 חי',
          type: 'GA4 · סשנים',
          date: today(),
          status: 'אושר',
          source: 'dashboard.json',
          real: true,
          meta: { sessions: st.ga4Sessions, users: st.ga4Users },
        });
      }
    }

    var preBuild = parseLs('coco-pre-build-work-report-v1');
    if (preBuild) {
      list.push({
        id: 'r-prebuild',
        name: 'דוח Pre-Build · לפני בניית אתר',
        type: 'Build Gate',
        date: preBuild.generatedAt ? preBuild.generatedAt.slice(0, 10) : today(),
        status: parseLs('coco-pre-build-report-approved-v1') ? 'אושר' : 'ממתין',
        source: 'pre-build-module',
        real: true,
      });
    }

    var asst = parseLs('coco-dalia-assistant-reports-v1');
    if (asst && asst.assistants) {
      var done = asst.assistants.filter(function (a) { return a.status === 'הושלם'; }).length;
      list.push({
        id: 'r-assistants',
        name: 'דוח 50 עוזרי AI',
        type: 'Assistants · שלב ד׳',
        date: asst.ranAt ? asst.ranAt.slice(0, 10) : today(),
        status: done >= 40 ? 'אושר' : 'בתהליך',
        source: 'assistants-engine',
        real: true,
        meta: { done: done, total: 50 },
      });
    }

    if (asst && asst.consultants) {
      var cDone = asst.consultants.filter(function (c) { return /אושר/.test(c.status); }).length;
      list.push({
        id: 'r-consultants',
        name: 'דוח 10 יועצי AI',
        type: 'Consultants · שלב ה׳',
        date: asst.ranAt ? asst.ranAt.slice(0, 10) : today(),
        status: cDone >= 7 ? 'אושר' : 'ממתין',
        source: 'assistants-engine',
        real: true,
        meta: { done: cDone, total: 10 },
      });
    }

    var engStore = parseLs('coco-dalia-engines-v1');
    if (engStore && engStore.engines) {
      var engReady = engStore.engines.filter(function (e) { return e.ready || e.status === 'מוכן' || e.status === 'הושלם'; }).length;
      var engDone = engStore.engines.filter(function (e) { return e.status === 'הושלם'; }).length;
      list.push({
        id: 'r-engines',
        name: 'דוח 13 מנועי בנייה',
        type: 'Build Engines · שלב ג׳',
        date: engStore.ranAt ? engStore.ranAt.slice(0, 10) : today(),
        status: engDone >= 1 ? 'בתהליך' : (engReady >= 3 ? 'בתהליך' : 'ממתין'),
        source: 'build-engines-engine',
        real: true,
        meta: { ready: engReady, done: engDone, total: 13 },
      });
    }

    list.push({
      id: 'r-final',
      name: 'דוח סיכום אסטרטגי · ' + bizName(),
      type: 'Strategic Summary',
      date: today(),
      status: 'בתהליך',
      source: 'dalia-first-client-report',
      real: !!(window.DaliaFirstClientReport || parseLs('dalia_project_brief')),
    });

    saveLs(REPORTS_KEY, { reports: list, builtAt: new Date().toISOString() });
    return list;
  }

  function buildApprovalsList(reports) {
    var taskApprovals = [];
    if (window.CocoDaliaEvidenceReportView && CocoDaliaEvidenceReportView.buildApprovalsForEngine) {
      taskApprovals = CocoDaliaEvidenceReportView.buildApprovalsForEngine();
    }
    return taskApprovals.concat(
      (reports || []).filter(function (r) { return r.status !== 'אושר' && r.id !== 'r-evidence-v2'; }).map(function (r) {
        return { name: r.name, status: r.status === 'ממתין' ? 'ממתין' : 'בתהליך', id: r.id };
      })
    ).concat([
      { name: 'אישור שליחת Google Ads', status: 'ממתין', id: 'ap-gads-send', blocked: true, note: 'דורש אישור סופי' },
      { name: 'פרסום Production (WordPress)', status: 'חסום', id: 'ap-wp-publish', blocked: true, note: 'לא פעיל עד אישור יוני מפורש' },
    ]);
  }

  function exportReportHtml(reportId) {
    if (reportId === 'r-evidence-v2' && window.CocoDaliaEvidenceReportView) {
      var r = CocoDaliaEvidenceReportView.getReport();
      var body = r ? CocoDaliaEvidenceReportView.buildFullReportHtml(r) : '<p>טוען...</p>';
      return '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>Evidence v2</title></head><body>' + body + '</body></html>';
    }
    if (reportId === 'r-final' && window.DaliaFirstClientReport && DaliaFirstClientReport.buildFullReport) {
      var model = DaliaFirstClientReport.buildFullReport();
      return '<html dir="rtl"><head><meta charset="utf-8"><title>דוח אסטרטגי</title></head><body><pre>' +
        JSON.stringify(model, null, 2).replace(/</g, '&lt;') + '</pre></body></html>';
    }
    if (reportId === 'r-prebuild' && window.PreBuildWorkReport && PreBuildWorkReport.buildPreBuildReportModel) {
      var pb = PreBuildWorkReport.buildPreBuildReportModel();
      return '<html dir="rtl"><head><meta charset="utf-8"><title>Pre-Build</title></head><body><pre>' +
        JSON.stringify(pb, null, 2).replace(/</g, '&lt;') + '</pre></body></html>';
    }
    var reports = parseLs(REPORTS_KEY);
    var r = (reports && reports.reports || []).find(function (x) { return x.id === reportId; });
    return '<html dir="rtl"><head><meta charset="utf-8"><title>' + (r ? r.name : 'דוח') + '</title></head><body><h1>' +
      (r ? r.name : reportId) + '</h1><p>מקור: ' + (r ? r.source : '—') + '</p><pre>' +
      JSON.stringify(r || {}, null, 2).replace(/</g, '&lt;') + '</pre></body></html>';
  }

  function downloadReport(reportId) {
    var html = exportReportHtml(reportId);
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (reportId || 'report') + '-' + today() + '.html';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function overlayToV5Data(data, apiSnap) {
    if (!data) return data;
    var reports = buildReportsList(apiSnap);
    var approvals = buildApprovalsList(reports);
    if (!data.reports_data) data.reports_data = { reports: [], approvals: [] };
    data.reports_data.reports = reports;
    data.reports_data.approvals = approvals;
    data._reportsEngine = { version: VERSION, count: reports.length, realCount: reports.filter(function (r) { return r.real; }).length };
    return data;
  }

  window.CocoDaliaReportsEngine = {
    VERSION: VERSION,
    buildReportsList: buildReportsList,
    buildApprovalsList: buildApprovalsList,
    exportReportHtml: exportReportHtml,
    downloadReport: downloadReport,
    overlayToV5Data: overlayToV5Data,
  };
})();
