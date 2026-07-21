/**
 * CO.CO Mission Control — משימה אחת מתמשכת
 * מרכז יכולות, שלבי צינור, דוח עדכון קבוע, ניווט למודולים.
 * Staging בלבד · ללא פרסום Production.
 */
(function () {
  'use strict';

  var VERSION = '1.0.1-mission';
  var STATE_KEY = 'coco-mission-state-v1';
  var MISSION_ID = 'dalia-full-stack-2026';

  var MISSION = {
    id: MISSION_ID,
    title: 'דליה — מערכת ייעוץ שיווקי מלאה',
    subtitle: 'משימה אחת מתמשכת · Orin Staging',
    productionBlocked: true,
    latestFocus: 'UI E2E OK: FLT-2026-000003 via /faults as יוני — WA+Email sent (Staging)',
  };

  var STAGES = [
    { id: 's1', name: 'חיבורי Google + נתונים חיים', status: 'done', module: 'integrations' },
    { id: 's2', name: '50 עוזרים + 10 יועצים', status: 'done', module: 'assistants' },
    { id: 's3', name: 'דוח Evidence v2 + ראיות', status: 'done', module: 'evidence' },
    { id: 's4', name: 'תור אישור Owner (ללא פרסום)', status: 'active', module: 'approvals' },
    { id: 's5', name: '13 מנועי בנייה', status: 'active', module: 'engines' },
    { id: 's6', name: 'יישום WordPress Production', status: 'blocked', module: 'publish', blocker: 'owner' },
    { id: 's7', name: 'GBP + Ads לאחר אישור Google', status: 'blocked', module: 'google-gates', blocker: 'google' },
  ];

  /** יכולות במערכת — כרטיסי למידה */
  var CAPABILITIES = [
    {
      id: 'evidence-v2',
      icon: '📊',
      name: 'דוח Evidence v2',
      screen: 'reports',
      open: 'openEvidenceReport',
      where: 'דוחות → כרטיס Evidence v2 או רשימת דוחות',
      dataFrom: 'project-001/evidence-report-v2.json ← dashboard, crawl, work-plan, GA4 audit',
      decides: 'כל טענה מקושרת למקור; משימות נוצרות אוטומטית מ-work-plan + 404 audit',
      returns: 'HTML מלא + תור TASK-0014–0016 + ביקורת עצמית',
      howTo: ['פתח AI Control Center', 'לחץ דוחות (📊)', 'כרטיס "דוח Evidence v2"', 'פתח דוח מלא / אשר משימות'],
      status: 'live',
    },
    {
      id: 'assistants',
      icon: '🤖',
      name: '50 עוזרים',
      screen: 'assistants',
      where: 'קטגוריות → 50 העוזרים',
      dataFrom: 'dashboard.json, site-work-plan, Brief (localStorage)',
      decides: 'מנוע כללים לפי תחום — ממצאים + פערים לכל עוזר',
      returns: 'סטטוס, ממצאים, המלצות → מועבר ליועצים',
      howTo: ['מרכז שליטה → 50 העוזרים', 'פתח עוזר → קרא checked/found/recommended', 'עדכן QA'],
      status: 'live',
    },
    {
      id: 'consultants',
      icon: '👨‍💼',
      name: '10 יועצים',
      screen: 'consultants',
      where: 'קטגוריות → 10 היועצים',
      dataFrom: 'פלט 50 העוזרים באותה הרצה',
      decides: 'ציון השלמה + איחוד פערים לפי תחום',
      returns: 'אושר / אושר עם תיקון + עדיפויות',
      howTo: ['מרכז שליטה → 10 היועצים', 'בדוק mustFix והמלצות'],
      status: 'live',
    },
    {
      id: 'orchestrator',
      icon: '🎯',
      name: 'Orchestrator',
      screen: 'mission',
      where: 'מרכז משימה → שלבי צינור',
      dataFrom: 'assistants + engines + evidence + approvals',
      decides: 'שערים: Stage D/E, engines ready, Chief Architect',
      returns: 'pipeline state ב-localStorage (coco-dalia-pipeline-v1)',
      howTo: ['מרכז משימה', 'הרץ צינור (אוטומטי בטעינה)', 'בדוק gates'],
      status: 'live',
    },
    {
      id: 'approvals',
      icon: '✅',
      name: 'תור אישור Owner',
      screen: 'reports',
      open: 'openEvidenceReport',
      where: 'דוחות → תור אישור עמוד הבית',
      dataFrom: 'evidence-report tasks TASK-0014–0016',
      decides: 'אישור שומר ב-localStorage בלבד — לא מפרסם WP',
      returns: 'מאושר לביצוע (לא פורסם)',
      howTo: ['דוחות → TASK-0014/15/16', 'לחץ אשר לביצוע', 'אין פרסום אוטומטי'],
      status: 'waiting-owner',
    },
    {
      id: 'engines',
      icon: '⚙️',
      name: '13 מנועי בנייה',
      screen: 'workspace',
      where: 'סביבת עבודה → Build Engines Hub',
      dataFrom: 'Brief, Pre-Build, Edge functions',
      decides: 'runner לכל מנוע; חסמים → OWNER-ACTIONS',
      returns: 'סטטוס מנוע + artifacts',
      howTo: ['סביבת עבודה', 'גלול ל-Build Engines', 'הרץ מנוע'],
      status: 'partial',
    },
    {
      id: 'work-plan',
      icon: '📋',
      name: 'תוכנית עבודה',
      screen: 'workspace',
      where: 'סביבת עבודה → רשימת עמודים',
      dataFrom: 'site-work-plan.json (28 עמודים, 395 פעולות)',
      decides: 'checklist per page + implementationPackage',
      returns: 'פעולות פתוחות + שעות משוערות',
      howTo: ['סביבת עבודה', 'בחר עמוד', 'ראה checklist וחבילת יישום'],
      status: 'live',
    },
    {
      id: 'google-layer',
      icon: '🔌',
      name: 'שכבת Google',
      screen: 'integrations',
      where: 'ממשקים',
      dataFrom: 'dashboard.json connections + sync',
      decides: 'סטטוס חיבור לכל API',
      returns: 'GSC/GA4 live; GBP quota; Ads 403',
      howTo: ['ממשקים', 'בדוק סטטוס ירוק/צהוב/אדום'],
      status: 'live',
    },
    {
      id: 'environment-ops',
      icon: '🛠️',
      name: 'סביבת עבודה · Secrets · Deploy',
      screen: 'workspace',
      where: 'docs/ENVIRONMENT-AND-SECRETS-HE.md + project-001/environment-status.json',
      dataFrom: 'GitHub Secrets, Supabase Edge Secrets, VPS dalia-ops (שמות בלבד)',
      decides: 'Staging vs Preview vs Production; מה חסר לפריסה בלי עצירות',
      returns: 'מטריצת Secrets + npm run env:health + Actions Environment Health',
      howTo: [
        'קרא docs/ENVIRONMENT-AND-SECRETS-HE.md',
        'Gupshup חסום? docs/OWNER-GUPSHUP-RECREATE-OR-RECOVER-HE.md',
        'רמזי חשבון: project-001/gupshup-account-hunt.json',
        'הרץ npm run env:health',
        'Actions → Environment Health',
        'Owner Actions בלבד: docs/OWNER-ACTIONS-FINAL-HE.md',
      ],
      status: 'partial',
    },
    {
      id: 'wa-bot-latency',
      icon: '⏱️',
      name: 'WhatsApp Bot — ביצועים',
      screen: 'reports',
      where: 'docs/.../WA-BOT-LATENCY-HE.md + project-001/wa-bot-latency-summary.json',
      dataFrom: 'Make scenario 5797671 logs · wa-bot-latency-audit.mjs (ללא שינוי לוגיקה)',
      decides: 'צוואר בקבוק = AI Agent 84 (~2–3.6ש׳); Sleep 1ש׳ אחרי שליחה; Sheets משני',
      returns: 'תשובה למשתמש ~3–4.5ש׳ · ריצת Make ~6.2ש׳ · המלצות חיסכון',
      howTo: [
        'קרא docs/audit-reports/claims-incident-process/WA-BOT-LATENCY-HE.md',
        'JSON: public/project-001/wa-bot-latency-summary.json',
        'Actions → Whatsapp Bot latency audit (בלי Blueprint PATCH)',
        'שיפור AI/Sleep רק אחרי אישור Owner',
      ],
      status: 'live',
    },
  ];

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function saveLs(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getState() {
    return parseLs(STATE_KEY) || { missionId: MISSION_ID, lastUpdate: null, changelog: [] };
  }

  function recordChangelog(entry) {
    var st = getState();
    st.lastUpdate = new Date().toISOString();
    st.changelog = (st.changelog || []).slice(0, 19);
    st.changelog.unshift(entry);
    saveLs(STATE_KEY, st);
    return st;
  }

  function getLiveMetrics() {
    var dash = parseLs('coco-dalia-api-cache-v1');
    dash = dash && dash.dashboard;
    var evidence = window.CocoDaliaEvidenceReportView && CocoDaliaEvidenceReportView.getReport();
    var approvals = window.CocoDaliaEvidenceReportView && CocoDaliaEvidenceReportView.getApprovalQueue();
    var pipeline = parseLs('coco-dalia-pipeline-v1');
    var approved = approvals ? approvals.filter(function (a) { return a.approved; }).length : 0;
    return {
      gscKeywords: dash && dash.stats && dash.stats.activeKeywords,
      ga4Sessions: dash && dash.stats && dash.stats.ga4Sessions,
      tasksOpen: evidence && evidence.tasks && evidence.tasks.length,
      approvalsPending: approvals ? 3 - approved : 3,
      assistantsDone: pipeline && pipeline.assistants && pipeline.assistants.assistantsDone,
      productionBlocked: true,
    };
  }

  function buildStageHtml() {
    return STAGES.map(function (s) {
      var cls = s.status === 'done' ? 'bd-g' : s.status === 'active' ? 'bd-y' : s.status === 'blocked' ? 'bd-r' : 'bd-x';
      var label = s.status === 'done' ? 'הושלם' : s.status === 'active' ? 'פעיל' : s.status === 'blocked' ? 'חסום' : 'ממתין';
      var extra = s.blocker === 'owner' ? ' · ממתין ליוני' : s.blocker === 'google' ? ' · ממתין Google' : '';
      return (
        '<div class="mc-stage">' +
          '<div class="mc-stage-name">' + esc(s.name) + '</div>' +
          '<span class="bd ' + cls + '">' + label + extra + '</span>' +
        '</div>'
      );
    }).join('');
  }

  function buildCapabilityCard(cap) {
    var stCls = cap.status === 'live' ? 'bd-g' : cap.status === 'waiting-owner' ? 'bd-y' : 'bd-x';
    var stLbl = cap.status === 'live' ? 'פעיל' : cap.status === 'waiting-owner' ? 'ממתין Owner' : 'חלקי';
    var rid = 'mc-cap-' + cap.id;
    return (
      '<div class="acc-item">' +
        '<div class="acc-head" onclick="toggleAcc(\'' + rid + '\')">' +
          '<span class="acc-chev" id="chev-' + rid + '">▸</span>' +
          '<span class="acc-name">' + cap.icon + ' ' + esc(cap.name) + '</span>' +
          '<span class="bd ' + stCls + '">' + stLbl + '</span>' +
        '</div>' +
        '<div class="acc-body" id="body-' + rid + '">' +
          '<div class="mc-cap-row"><b>איפה:</b> ' + esc(cap.where) + '</div>' +
          '<div class="mc-cap-row"><b>נתונים:</b> ' + esc(cap.dataFrom) + '</div>' +
          '<div class="mc-cap-row"><b>החלטות:</b> ' + esc(cap.decides) + '</div>' +
          '<div class="mc-cap-row"><b>תוצאה:</b> ' + esc(cap.returns) + '</div>' +
          '<div class="mc-cap-row"><b>שימוש:</b><ol class="mc-ol">' +
            cap.howTo.map(function (step, i) { return '<li>' + esc(step) + '</li>'; }).join('') +
          '</ol></div>' +
          '<button type="button" class="btn btn-p btn-sm mc-go-btn" data-screen="' + esc(cap.screen) + '" data-open="' + esc(cap.open || '') + '">פתח במערכת ›</button>' +
        '</div>' +
      '</div>'
    );
  }

  function buildFixedUpdateReportHtml() {
    var m = getLiveMetrics();
    var latest = (getState().changelog || [])[0];
    return (
      '<div class="mc-update-report">' +
        '<div class="cat-title">דוח עדכון אחרון</div>' +
        '<div class="card" style="font-size:11px;line-height:1.65;">' +
          '<div class="mc-cap-row"><b>מה נבנה</b><br>E2E התראות דרך ממשק Staging כמנהל על יוני — תקלה FLT-2026-000003 · WA+Email נשלחו</div>' +
          '<div class="mc-cap-row"><b>איפה</b><br>docs/.../WA-UI-ALERT-E2E-HE.md · project-001/wa-ui-alert-e2e-summary.json · צילומים ui-alert-e2e/</div>' +
          '<div class="mc-cap-row"><b>איך משתמשים</b><br>1. בדוק WhatsApp 0534338601 2. בדוק מייל orin1607@gmail.com 3. פתח /faults לאירוע</div>' +
          '<div class="mc-cap-row"><b>איך זה עובד</b><br>UI /faults → notify-accident-email → Gupshup + Resend · לא קריאה ישירה מסקריפט</div>' +
          '<div class="mc-cap-row"><b>מה השתנה</b><br>' + esc(latest && latest.summary || 'מסלול התראות מלא עבר ב-Staging דרך התוכנה') + '</div>' +
          '<div class="mc-cap-row"><b>מדדים חיים</b><br>WA msg f8642799… · Email b64b737e… · status sent</div>' +
          '<div class="mc-cap-row"><b>ממתין ליוני</b><br>אישור קבלה בטלפון + בתיבת המייל (לא Production)</div>' +
        '</div>' +
      '</div>'
    );
  }

  function buildMissionHtml() {
    var m = getLiveMetrics();
    return (
      '<div class="mc-hero">' +
        '<div class="mc-hero-title">🚀 ' + esc(MISSION.title) + '</div>' +
        '<div class="mc-hero-sub">' + esc(MISSION.subtitle) + '</div>' +
        '<div class="mc-badges">' +
          '<span class="bd bd-g">GSC: ' + esc(m.gscKeywords || '—') + ' KW</span>' +
          '<span class="bd bd-g">GA4: ' + esc(m.ga4Sessions || '—') + ' sessions</span>' +
          '<span class="bd bd-y">' + esc(m.approvalsPending || 0) + ' אישורים ממתינים</span>' +
          '<span class="bd bd-r">Production חסום</span>' +
        '</div>' +
      '</div>' +
      '<div class="cat-title">שלבי המשימה</div>' +
      '<div class="mc-stages">' + buildStageHtml() + '</div>' +
      '<div class="cat-title">יכולות במערכת — מדריך שימוש</div>' +
      '<div id="mc-capabilities">' + CAPABILITIES.map(buildCapabilityCard).join('') + '</div>' +
      '<div class="cat-title">עדכונים אחרונים</div>' +
      '<div class="mc-changelog">' + buildChangelogHtml() + '</div>' +
      buildFixedUpdateReportHtml()
    );
  }

  function buildChangelogHtml() {
    var st = getState();
    var items = st.changelog || [];
    if (!items.length) {
      return '<div class="card" style="font-size:11px;color:var(--w50);">אין עדיין — עדכונים יופיעו כאן אחרי כל שלב.</div>';
    }
    return items.slice(0, 5).map(function (c) {
      return '<div class="card" style="font-size:11px;"><b>' + esc((c.at || '').slice(0, 10)) + '</b> — ' + esc(c.summary) + '</div>';
    }).join('');
  }

  function bindNavigation(root) {
    if (!root) return;
    root.querySelectorAll('.mc-go-btn').forEach(function (btn) {
      btn.onclick = function () {
        var screen = btn.getAttribute('data-screen');
        var openFn = btn.getAttribute('data-open');
        if (screen && typeof window.openScreen === 'function') {
          openScreen(screen);
        }
        if (openFn && typeof window[openFn] === 'function') {
          setTimeout(function () { window[openFn](); }, 300);
        }
      };
    });
  }

  function mount() {
    var el = document.getElementById('mission-control-root');
    if (!el) return;
    el.innerHTML = buildMissionHtml();
    bindNavigation(el);
    if (typeof window.reapplyOpenState === 'function') reapplyOpenState();
  }

  function runPipelineQuiet(apiSnap) {
    if (window.CocoDaliaOrchestrator && CocoDaliaOrchestrator.runPipeline) {
      return CocoDaliaOrchestrator.runPipeline(apiSnap, { silent: true });
    }
    return null;
  }

  function init(apiSnap) {
    recordChangelog({
      at: new Date().toISOString(),
      summary: 'מרכז משימה v' + VERSION + ' — יכולות מאוחדות',
    });
    runPipelineQuiet(apiSnap);
    if (window.CocoDaliaEvidenceReportView) {
      return CocoDaliaEvidenceReportView.init().then(function () {
        mount();
      });
    }
    mount();
    return Promise.resolve();
  }

  function getCapability(id) {
    return CAPABILITIES.find(function (c) { return c.id === id; });
  }

  function getUpdateReport() {
    var st = getState();
    return {
      mission: MISSION,
      stages: STAGES,
      capabilities: CAPABILITIES.length,
      metrics: getLiveMetrics(),
      lastUpdate: st.lastUpdate,
      changelog: st.changelog || [],
    };
  }

  window.CocoMissionControl = {
    VERSION: VERSION,
    MISSION: MISSION,
    STAGES: STAGES,
    CAPABILITIES: CAPABILITIES,
    init: init,
    mount: mount,
    getState: getState,
    recordChangelog: recordChangelog,
    getLiveMetrics: getLiveMetrics,
    getCapability: getCapability,
    getUpdateReport: getUpdateReport,
  };

  recordChangelog({
    at: new Date().toISOString(),
    summary: 'הגדרת משימה מתמשכת — מרכז Mission Control',
  });
})();
