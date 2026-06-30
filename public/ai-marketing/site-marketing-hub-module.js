/**
 * Site Marketing Hub — after site preview, becomes center of marketing workflow.
 * Staging only · no UI/design changes to platform chrome.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var HUB_KEY = 'coco-site-marketing-hub-v1';
  var PROGRESS_KEY = 'coco-marketing-progress-v1';
  var TASKS_KEY = 'coco-site-generated-tasks-v1';

  var TASK_CATEGORIES = [
    { id: 'seo', label: 'SEO', icon: '🔎' },
    { id: 'content', label: 'תוכן', icon: '✍️' },
    { id: 'performance', label: 'ביצועים', icon: '⚡' },
    { id: 'ux', label: 'UX', icon: '🎯' },
    { id: 'gbp', label: 'Google Business', icon: '📍' },
    { id: 'ads', label: 'Google Ads', icon: '📢' },
    { id: 'analytics', label: 'Analytics', icon: '📊' },
    { id: 'gsc', label: 'Search Console', icon: '🔍' },
  ];

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function saveJson(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }

  function getHub() {
    return parseLs(HUB_KEY);
  }

  function getPreviewMeta() {
    return parseLs('coco-site-preview-meta-v1');
  }

  function getBuilderOutput() {
    return parseLs('coco-website-builder-last-output-v1');
  }

  function getPreBuildReport() {
    return parseLs('coco-pre-build-work-report-v1');
  }

  function buildPostLaunchTasks(hub) {
    var pages = (hub && hub.pages) || [];
    var tasks = [];
    var ts = Date.now();

    pages.forEach(function (p, i) {
      tasks.push({
        id: 'site-task-' + ts + '-seo-' + i,
        name: 'SEO: ' + p.title,
        description: 'אופטימיזציה למילות מפתח: ' + ((p.keywords || []).slice(0, 3).join(', ') || '—'),
        category: 'seo',
        status: 'pending',
        priority: i === 0 ? 'גבוה' : 'בינוני',
        source: 'site-marketing-hub',
        pageTitle: p.title,
        created_at: new Date().toISOString(),
      });
      tasks.push({
        id: 'site-task-' + ts + '-content-' + i,
        name: 'תוכן: ' + p.title,
        description: 'העשרת תוכן ו-CTA בעמוד ' + p.title,
        category: 'content',
        status: 'pending',
        priority: 'בינוני',
        source: 'site-marketing-hub',
        pageTitle: p.title,
        created_at: new Date().toISOString(),
      });
    });

    TASK_CATEGORIES.forEach(function (cat, idx) {
      if (cat.id === 'seo' || cat.id === 'content') return;
      tasks.push({
        id: 'site-task-' + ts + '-' + cat.id,
        name: cat.label + ': אתר חדש',
        description: 'הגדרה ומעקב ' + cat.label + ' מול האתר החדש (נפרד ממערכת דליה)',
        category: cat.id,
        status: 'pending',
        priority: idx < 4 ? 'גבוה' : 'בינוני',
        source: 'site-marketing-hub',
        created_at: new Date().toISOString(),
      });
    });

    var autoRules = [
      { name: 'חסר תוכן בעמוד', category: 'content', priority: 'גבוה' },
      { name: 'חסרה תמונה ראשית', category: 'content', priority: 'בינוני' },
      { name: 'חסר Schema markup', category: 'seo', priority: 'גבוה' },
      { name: 'מהירות נמוכה — Lighthouse', category: 'performance', priority: 'גבוה' },
      { name: 'SEO חלש בעמוד', category: 'seo', priority: 'גבוה' },
      { name: 'אין קישורים פנימיים', category: 'seo', priority: 'בינוני' },
      { name: 'עמוד שלא מתקדם', category: 'seo', priority: 'בינוני' },
      { name: 'מילות מפתח חדשות לטיפול', category: 'seo', priority: 'בינוני' },
      { name: 'מתחרה עקף אותנו', category: 'seo', priority: 'גבוה' },
      { name: 'שיפור UX', category: 'ux', priority: 'בינוני' },
      { name: 'שיפור ביצועים', category: 'performance', priority: 'גבוה' },
    ];
    autoRules.forEach(function (rule, i) {
      tasks.push({
        id: 'site-auto-' + ts + '-' + i,
        name: rule.name,
        description: 'משימה אוטומטית מ-Site Hub',
        category: rule.category,
        status: 'pending',
        priority: rule.priority,
        source: 'site-marketing-hub-auto',
        created_at: new Date().toISOString(),
      });
    });

    return tasks;
  }

  function mergeTasksIntoActions(newTasks) {
    var existing = parseLs('coco-business-strategy-actions-v1') || [];
    if (!Array.isArray(existing)) existing = [];
    var ids = {};
    existing.forEach(function (a) { if (a && a.id) ids[a.id] = true; });
    newTasks.forEach(function (t) {
      if (!ids[t.id]) {
        existing.push(t);
        ids[t.id] = true;
      }
    });
    saveJson('coco-business-strategy-actions-v1', existing);
    return existing;
  }

  function mergeTasks(newTasks) {
    return mergeTasksIntoActions(newTasks || []);
  }

  function computeProgress(hub, tasks) {
    var total = tasks.length || 1;
    var done = tasks.filter(function (t) { return t.status === 'completed' || t.status === 'done'; }).length;
    var open = tasks.filter(function (t) { return t.status === 'pending' || t.status === 'in_progress' || t.status === 'pending_approval'; }).length;
    var improved = tasks.filter(function (t) { return t.status === 'completed' && t.category; }).length;
    var needs = tasks.filter(function (t) { return t.priority === 'גבוה' && t.status !== 'completed'; }).length;

    var nextRec = 'המשך אופטימיזציית SEO לעמוד הבית';
    if (needs > 0) nextRec = 'טיפול ב-' + needs + ' משימות בעדיפות גבוהה';
    else if (hub && hub.approved) nextRec = 'האתר מאושר — הכן Deploy לריפו/דומיין נפרד של הלקוח';

    return {
      updatedAt: new Date().toISOString(),
      siteActive: !!(hub && hub.active),
      totalTasks: total,
      completed: done,
      open: open,
      improved: improved,
      needsAttention: needs,
      percentComplete: Math.round((done / total) * 100),
      aiRecommendation: nextRec,
    };
  }

  function activateFromPreview(output) {
    output = output || getBuilderOutput();
    var meta = getPreviewMeta();
    var report = getPreBuildReport();
    var plan = (output && output.summaryPlan) || (report && report.newSiteSitemap && { pages: report.sections && report.sections.pageDetails }) || {};
    var pages = plan.pages || [];

    var hub = {
      version: VERSION,
      active: true,
      activatedAt: new Date().toISOString(),
      clientId: (output && output.summaryPlan && output.summaryPlan.clientId) || 'dalia-c-official',
      company: (output && output.company) || (report && report.company) || '',
      previewPath: (meta && meta.previewPath) || (output && output.previewSite && output.previewSite.previewPath) || '',
      previewSlug: (meta && meta.slug) || '',
      pagesCount: pages.length,
      pages: pages.map(function (p) {
        return { title: p.title, slug: p.slug, keywords: p.keywords || [], purpose: p.purpose || '' };
      }),
      approved: !!(output && output.previewSite && output.previewSite.approved),
      architecture: {
        onDaliaPlatform: false,
        tempGitPath: '/client-previews/' + ((meta && meta.slug) || 'client') + '/',
        productionNote: 'Deploy לדומיין/אחסון לקוח — לא למערכת דליה',
      },
      reportId: report && report.reportId,
    };

    saveJson(HUB_KEY, hub);

    var tasks = buildPostLaunchTasks(hub);
    saveJson(TASKS_KEY, tasks);
    var allActions = mergeTasksIntoActions(tasks);

    var brief = parseLs('coco-business-agent-brief-v1') || {};
    brief.siteHub = {
      active: true,
      previewPath: hub.previewPath,
      pagesCount: hub.pagesCount,
      instructions: 'כל העוזרים עובדים מול האתר החדש (Preview) — לא האתר הישן. האתר נפרד ממערכת דליה.',
    };
    saveJson('coco-business-agent-brief-v1', brief);

    var progress = computeProgress(hub, allActions);
    saveJson(PROGRESS_KEY, progress);

    if (window.COCO) {
      COCO.siteHub = hub;
      COCO.marketingProgress = progress;
      COCO.activeSite = hub.previewPath;
    }

    if (window.ClientIdSsot && ClientIdSsot.applyFlowContext) {
      ClientIdSsot.applyFlowContext({
        activeSitePreview: hub.previewPath,
        siteHubActive: true,
      });
    }

    if (window.DaliaSite && DaliaSite.logWorkProgress) {
      DaliaSite.logWorkProgress('Site Hub פעיל', hub.company + ' · ' + hub.pagesCount + ' עמודים · ' + tasks.length + ' משימות');
    }

    if (window.CocoData && CocoData.bindAll) CocoData.bindAll();
    if (window.CocoUnified && CocoUnified.updateContextBar) CocoUnified.updateContextBar();

    return { ok: true, hub: hub, tasks: tasks, progress: progress };
  }

  function onSiteChange(changeType, detail) {
    var hub = getHub();
    if (!hub || !hub.active) return { ok: false, reason: 'hub_inactive' };

    var ts = Date.now();
    var task = {
      id: 'site-change-' + ts,
      name: 'שינוי באתר: ' + (changeType || 'update'),
      description: detail || 'נדרש עדכון מול האתר החדש',
      category: changeType === 'performance' ? 'performance' : changeType === 'content' ? 'content' : 'seo',
      status: 'pending',
      priority: 'גבוה',
      source: 'site-change',
      created_at: new Date().toISOString(),
    };
    mergeTasksIntoActions([task]);
    var all = parseLs('coco-business-strategy-actions-v1') || [];
    var progress = computeProgress(hub, all);
    saveJson(PROGRESS_KEY, progress);
    if (window.COCO) COCO.marketingProgress = progress;
    if (window.CocoData && CocoData.bindAll) CocoData.bindAll();
    return { ok: true, task: task, progress: progress };
  }

  function getProgress() {
    var hub = getHub();
    var tasks = parseLs('coco-business-strategy-actions-v1') || [];
    var progress = computeProgress(hub, tasks);
    saveJson(PROGRESS_KEY, progress);
    return progress;
  }

  function hydrateOnBoot() {
    var hub = getHub();
    if (!hub || !hub.active) return null;
    if (window.COCO) {
      COCO.siteHub = hub;
      COCO.marketingProgress = getProgress();
      COCO.activeSite = hub.previewPath;
    }
    return hub;
  }

  function renderHubPanel(container) {
    if (!container) return;
    var hub = getHub();
    var progress = getProgress();
    container.innerHTML =
      '<div class="card" style="margin-top:12px;">' +
      '<div class="ph-t">📊 Site Marketing Hub</div>' +
      '<div class="s">ניהול שוטף לאחר Preview — SEO, תוכן, ביצועים</div>' +
      '<div style="font-size:12px;color:var(--w80);margin-top:8px;">' +
      (hub && hub.active ? 'פעיל · ' + esc(hub.company) + ' · ' + hub.pagesCount + ' עמודים' : 'Hub לא פעיל — אשר Preview תחילה') +
      '</div>' +
      (progress ? '<div style="font-size:11px;color:var(--w50);margin-top:4px;">המלצה: ' + esc(progress.aiRecommendation) + '</div>' : '') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">' +
      (window.AiConsultant ? AiConsultant.buttonHtml('hub', 'ac-btn-hub') : '') +
      '</div>' +
      (window.AiConsultant ? AiConsultant.panelHtml('hub', 'ac-panel-hub') : '') +
      '</div>';
    if (window.AiConsultant) AiConsultant.wireStage(container, 'hub', 'ac-btn-hub', 'ac-panel-hub');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function mountPanel(rootId) {
    var root = document.getElementById(rootId || 'site-marketing-hub-root');
    if (!root) return;
    renderHubPanel(root);
  }

  window.SiteMarketingHub = {
    VERSION: VERSION,
    activateFromPreview: activateFromPreview,
    onSiteChange: onSiteChange,
    getHub: getHub,
    getProgress: getProgress,
    mergeTasks: mergeTasks,
    hydrateOnBoot: hydrateOnBoot,
    mountPanel: mountPanel,
    TASK_CATEGORIES: TASK_CATEGORIES,
  };
})();
