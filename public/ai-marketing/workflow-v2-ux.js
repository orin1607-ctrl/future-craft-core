/**
 * CO.CO Workflow V2 — UX prototype (no real AI, no new APIs).
 * Brief-first: onboarding → Gate-A → campaign picker → Gate-B → Brief → stages ד'-י'.
 */
(function () {
  'use strict';

  var MOCK_CLIENTS = [
    { id: 'client-greentech', name: 'גרין-טק פתרונות', sector: 'ניהול צי רכב', site: 'https://greentech.example.co.il' },
    { id: 'client-dalia', name: 'דליה — FleetOS', sector: 'טכנולוגיה לצי', site: 'https://dalia-c.com' },
    { id: 'client-demo', name: 'עסק לדוגמה', sector: 'שירותים', site: 'https://example.co.il' },
  ];

  var ONBOARDING_STEPS = [
    { id: 'biz', label: 'מידע על העסק', title: 'פרטי העסק', sub: 'שם, תחום, מיקום' },
    { id: 'services', label: 'שירותים', title: 'תחום פעילות ושירותים', sub: 'שירות מרכזי, USP, מוצרים (אופציונלי)' },
    { id: 'audience', label: 'קהל יעד', title: 'קהל יעד', sub: 'מי הלקוחות האידיאליים ומי לא' },
    { id: 'goals', label: 'מטרות', title: 'מטרות ותקציב', sub: 'יעד עסקי ותקציב שיווקי' },
    { id: 'keywords', label: 'מילות מפתח', title: 'מילות מפתח', sub: 'מלקוח + מחקר mock — אישור ≥5' },
    { id: 'competitors', label: 'מתחרים', title: 'מתחרים', sub: 'לפחות מתחרה אחד' },
    { id: 'assets', label: 'נכסים דיגיטליים', title: 'נכסים דיגיטליים', sub: 'אתר, רשתות, GBP, דומיינים' },
    { id: 'files', label: 'קבצים', title: 'קבצים וחומרים', sub: 'לוגו, תמונות, וידאו, מסמכים' },
    { id: 'content', label: 'תוכן חופשי', title: 'תוכן חופשי והנחיות AI', sub: 'סיכום אישי, הערות מנהל, aiMustKnow' },
    { id: 'summary', label: 'סיכום Gate-A', title: 'סיכום ואישור Gate-A', sub: 'בדיקה לפני בחירת קמפיין' },
  ];

  var CAMPAIGN_TYPES = [
    { id: 'seo', ico: '🌱', label: 'SEO' },
    { id: 'ads', ico: '📢', label: 'Google Ads' },
    { id: 'both', ico: '🔀', label: 'SEO + Ads' },
    { id: 'website', ico: '🌐', label: 'בניית אתר' },
    { id: 'local', ico: '📍', label: 'קידום מקומי' },
    { id: 'content', ico: '✍️', label: 'תוכן' },
    { id: 'other', ico: '➕', label: 'אחר' },
  ];

  var V2_STEPS = [
    { id: 'entry', label: 'חברות' },
    { id: 'onboarding', label: 'היכרות' },
    { id: 'picker', label: 'קמפיין' },
    { id: 'wizards', label: 'Wizards' },
    { id: 'brief', label: 'Brief' },
  ];

  var state = {
    client: null,
    obStep: 0,
    campaignType: null,
    phase: 'entry',
  };

  function qs(name) {
    try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; }
  }

  function isV2Active() {
    var flow = qs('flow');
    if (flow === 'legacy' || flow === 'v1') return false;
    return flow === 'coco' || /coco-dalia/i.test(location.pathname || '');
  }

  function platformUrl(extra) {
    var base = window.COCO_PAGES_BASE || '/future-craft-core/';
    if (base.charAt(0) !== '/') base = '/' + base.replace(/^\.\//, '');
    var q = extra || '';
    return (base.charAt(0) === '/' ? location.origin + base : new URL(base, location.href).href) + 'ai-marketing-platform.html' + q;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function splitLines(text) {
    if (!text) return [];
    return String(text).split(/[\n,;]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function setField(path, value) {
    if (window.ProjectBrief && ProjectBrief.setField) {
      ProjectBrief.setField(path, value, { source: 'manual', status: 'from_client', updatedBy: 'workflow-v2-ux' });
    }
  }

  function getVal(path) {
    if (!window.ProjectBrief) return '';
    var brief = ProjectBrief.get();
    var parts = path.split('.');
    var cur = brief;
    for (var i = 0; i < parts.length; i++) {
      if (!cur) return '';
      cur = cur[parts[i]];
    }
    return ProjectBrief.envVal(cur);
  }

  function saveOnboardingFromForm() {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };

    setField('business.name', g('v2-biz-name'));
    setField('business.sector', g('v2-biz-sector'));
    setField('business.location', g('v2-biz-location'));
    setField('business.summary', g('v2-biz-summary'));
    setField('business.personalSummary', g('v2-biz-personal'));
    setField('business.site', g('v2-asset-website'));
    setField('assets.website', g('v2-asset-website'));

    setField('services.main', g('v2-svc-main'));
    setField('services.usp', g('v2-svc-usp'));
    setField('services.list', splitLines(g('v2-svc-list')));
    setField('services.differentiator', g('v2-svc-diff'));

    setField('audience.ideal', splitLines(g('v2-aud-ideal')));
    setField('audience.avoid', splitLines(g('v2-aud-avoid')));

    setField('goals.businessGoal', g('v2-goal-business'));
    setField('goals.budget', g('v2-goal-budget'));

    var kw = splitLines(g('v2-kw-approved'));
    setField('keywords.fromClient', kw);
    setField('keywords.approved', kw.length >= 5 ? kw : kw.concat(['mock-kw-1', 'mock-kw-2', 'mock-kw-3', 'mock-kw-4', 'mock-kw-5']).slice(0, Math.max(5, kw.length)));

    var comps = splitLines(g('v2-comp-list')).map(function (name, idx) {
      return {
        id: 'comp-v2-' + idx,
        name: ProjectBrief.envelope(name, { source: 'manual', status: 'from_client', updatedBy: 'workflow-v2-ux' }),
        website: ProjectBrief.envelope('', { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
      };
    });
    if (comps.length && window.ProjectBrief) {
      var brief = ProjectBrief.get();
      brief.competitors = comps;
      ProjectBrief.set(brief);
    }

    var social = [];
    ['facebook', 'instagram', 'linkedin', 'youtube', 'tiktok'].forEach(function (p) {
      var url = g('v2-social-' + p);
      if (url) social.push({ platform: p, url: url });
    });
    setField('assets.social', social);
    setField('assets.gbpUrl', g('v2-asset-gbp'));

    var logos = g('v2-file-logo') ? [{ name: g('v2-file-logo'), type: 'logo', mock: true }] : [];
    if (logos.length) setField('files.logo', logos);

    setField('freeContent.managerNotes', g('v2-free-notes'));
    setField('freeContent.aiMustKnow', g('v2-free-ai'));

    if (state.client) {
      setField('meta.projectId', state.client.id);
    }

    try {
      localStorage.setItem('dalia_biz', JSON.stringify({
        name: g('v2-biz-name'),
        company: g('v2-biz-name'),
        sector: g('v2-biz-sector'),
        loc: g('v2-biz-location'),
        site: g('v2-asset-website'),
        mainService: g('v2-svc-main'),
        usp: g('v2-svc-usp'),
        services: g('v2-svc-list'),
        ideal: g('v2-aud-ideal'),
        goal: g('v2-goal-business'),
        budget: g('v2-goal-budget'),
        comp: g('v2-comp-list'),
        free: g('v2-free-notes'),
        files: logos,
      }));
      localStorage.setItem('dalia_part_a', JSON.stringify({
        bizName: g('v2-biz-name'),
        name: g('v2-biz-name'),
        site: g('v2-asset-website'),
        ts: new Date().toISOString(),
      }));
    } catch (e) { /* ignore */ }

    if (window.ProjectBrief) ProjectBrief.mergeFromLegacy();
  }

  function hydrateFormFromBrief() {
    var set = function (id, val) {
      var el = document.getElementById(id);
      if (el && val != null) el.value = Array.isArray(val) ? val.join('\n') : String(val);
    };
    set('v2-biz-name', getVal('business.name'));
    set('v2-biz-sector', getVal('business.sector'));
    set('v2-biz-location', getVal('business.location'));
    set('v2-biz-summary', getVal('business.summary'));
    set('v2-biz-personal', getVal('business.personalSummary'));
    set('v2-asset-website', getVal('assets.website') || getVal('business.site'));
    set('v2-svc-main', getVal('services.main'));
    set('v2-svc-usp', getVal('services.usp'));
    set('v2-svc-list', (getVal('services.list') || []).join('\n'));
    set('v2-svc-diff', getVal('services.differentiator'));
    set('v2-aud-ideal', (getVal('audience.ideal') || []).join('\n'));
    set('v2-aud-avoid', (getVal('audience.avoid') || []).join('\n'));
    set('v2-goal-business', getVal('goals.businessGoal'));
    set('v2-goal-budget', getVal('goals.budget'));
    set('v2-kw-approved', (getVal('keywords.approved') || []).join('\n'));
    var comps = (window.ProjectBrief && ProjectBrief.get().competitors) || [];
    set('v2-comp-list', comps.map(function (c) { return ProjectBrief.envVal(c.name); }).filter(Boolean).join('\n'));
    set('v2-free-notes', getVal('freeContent.managerNotes'));
    set('v2-free-ai', getVal('freeContent.aiMustKnow'));
  }

  function renderBreadcrumb() {
    var el = document.getElementById('v2-breadcrumb');
    if (!el) return;
    var clientName = state.client ? state.client.name : '—';
    el.innerHTML =
      '<a href="' + esc(platformUrl('')) + '">ניהול שיווק</a><span class="sep">›</span>' +
      '<a href="#" id="v2-bc-companies">חברות ועסקים</a><span class="sep">›</span>' +
      '<span>' + esc(clientName) + '</span><span class="sep">›</span>' +
      '<span class="cur">היכרות</span>';
    var bc = document.getElementById('v2-bc-companies');
    if (bc) bc.addEventListener('click', function (e) { e.preventDefault(); goPhase('entry'); });
  }

  function renderTopStepper() {
    var el = document.getElementById('v2-top-stepper');
    if (!el) return;
    var phaseIdx = { entry: 0, onboarding: 1, picker: 2, wizards: 3, brief: 4 }[state.phase] || 0;
    el.innerHTML = V2_STEPS.map(function (s, i) {
      var cls = i === phaseIdx ? 'active' : i < phaseIdx ? 'done' : '';
      var num = i < phaseIdx ? '✓' : (i + 1);
      return '<div class="v2-step ' + cls + '"><span class="v2-step-n">' + num + '</span>' + esc(s.label) + '</div>';
    }).join('');
  }

  function renderOnboardingChips() {
    var el = document.getElementById('v2-ob-chips');
    if (!el) return;
    el.innerHTML = ONBOARDING_STEPS.map(function (s, i) {
      var cls = i === state.obStep ? 'active' : i < state.obStep ? 'done' : '';
      return '<button type="button" class="v2-wiz-chip ' + cls + '" data-ob="' + i + '">' + esc(s.label) + '</button>';
    }).join('');
    el.querySelectorAll('[data-ob]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        saveOnboardingFromForm();
        state.obStep = parseInt(btn.getAttribute('data-ob'), 10);
        renderOnboardingPane();
      });
    });
  }

  function onboardingPaneHtml(step) {
    var commonHead = function (s) {
      return '<div class="v2-head"><div class="v2-head-part">שלב א׳ — היכרות · ' + esc(s.label) + '</div>' +
        '<div class="v2-head-t">' + esc(s.title) + '</div><div class="v2-head-s">' + esc(s.sub) + '</div></div>';
    };
    switch (step.id) {
      case 'biz':
        return commonHead(step) + '<div class="v2-sec v2-card v2-g2">' +
          '<div class="v2-fl"><label>שם העסק *</label><input class="v2-inp" id="v2-biz-name"></div>' +
          '<div class="v2-fl"><label>תחום *</label><input class="v2-inp" id="v2-biz-sector"></div>' +
          '<div class="v2-fl"><label>מיקום *</label><input class="v2-inp" id="v2-biz-location" placeholder="עיר / אזור"></div>' +
          '<div class="v2-fl"><label>סיכום עסק (מומלץ)</label><textarea class="v2-ta" id="v2-biz-summary" placeholder="2–5 משפטים"></textarea></div></div>';
      case 'services':
        return commonHead(step) + '<div class="v2-sec v2-card">' +
          '<div class="v2-fl"><label>שירות מרכזי *</label><input class="v2-inp" id="v2-svc-main"></div>' +
          '<div class="v2-fl"><label>USP *</label><input class="v2-inp" id="v2-svc-usp"></div>' +
          '<div class="v2-fl"><label>רשימת שירותים (שורה לכל שירות)</label><textarea class="v2-ta" id="v2-svc-list"></textarea></div>' +
          '<div class="v2-fl"><label>מבדל / יתרון</label><input class="v2-inp" id="v2-svc-diff"></div></div>';
      case 'audience':
        return commonHead(step) + '<div class="v2-sec v2-card">' +
          '<div class="v2-fl"><label>קהל יעד אידיאלי *</label><textarea class="v2-ta" id="v2-aud-ideal"></textarea></div>' +
          '<div class="v2-fl"><label>קהל להימנע ממנו</label><textarea class="v2-ta" id="v2-aud-avoid"></textarea></div></div>';
      case 'goals':
        return commonHead(step) + '<div class="v2-sec v2-card v2-g2">' +
          '<div class="v2-fl"><label>מטרה עסקית *</label><input class="v2-inp" id="v2-goal-business"></div>' +
          '<div class="v2-fl"><label>תקציב שיווק *</label><input class="v2-inp" id="v2-goal-budget" placeholder="₪ / חודש"></div></div>';
      case 'keywords':
        return commonHead(step) + '<div class="v2-sec v2-card">' +
          '<div class="v2-alt v2-alt-i">מחקר mock — הזן ≥5 מילות מפתח (שורה לכל מילה) או השתמש בכפתור מילוי מהיר.</div>' +
          '<div class="v2-fl"><label>מילות מפתח מאושרות *</label><textarea class="v2-ta" id="v2-kw-approved" rows="6"></textarea></div>' +
          '<button type="button" class="v2-btn v2-btn-g" id="v2-kw-mock">🔍 מילוי mock (10 מילים)</button></div>';
      case 'competitors':
        return commonHead(step) + '<div class="v2-sec v2-card">' +
          '<div class="v2-fl"><label>מתחרים (שורה לכל מתחרה) *</label><textarea class="v2-ta" id="v2-comp-list"></textarea></div></div>';
      case 'assets':
        return commonHead(step) + '<div class="v2-sec v2-card">' +
          '<div class="v2-fl"><label>אתר *</label><input class="v2-inp" id="v2-asset-website" placeholder="https://"></div>' +
          '<div class="v2-g2">' +
          ['facebook', 'instagram', 'linkedin', 'youtube', 'tiktok'].map(function (p) {
            return '<div class="v2-fl"><label>' + p + '</label><input class="v2-inp" id="v2-social-' + p + '"></div>';
          }).join('') +
          '</div><div class="v2-fl"><label>Google Business Profile URL</label><input class="v2-inp" id="v2-asset-gbp"></div></div>';
      case 'files':
        return commonHead(step) + '<div class="v2-sec v2-card">' +
          '<div class="v2-alt v2-alt-w">העלאה mock — הזן שם קובץ לוגו לסימולציה.</div>' +
          '<div class="v2-fl"><label>לוגו (שם קובץ) *</label><input class="v2-inp" id="v2-file-logo" placeholder="logo.png"></div>' +
          '<div class="v2-fl"><label>תמונות / וידאו / מסמכים</label><input class="v2-inp" disabled placeholder="mock — בקרוב"></div></div>';
      case 'content':
        return commonHead(step) + '<div class="v2-sec v2-card">' +
          '<div class="v2-fl"><label>תקציר אישי / מי אני</label><textarea class="v2-ta" id="v2-biz-personal"></textarea></div>' +
          '<div class="v2-fl"><label>הערות מנהל</label><textarea class="v2-ta" id="v2-free-notes"></textarea></div>' +
          '<div class="v2-fl"><label>הנחיות AI (aiMustKnow)</label><textarea class="v2-ta" id="v2-free-ai"></textarea></div></div>';
      case 'summary':
        return commonHead(step) + '<div class="v2-sec"><div class="v2-card" id="v2-gate-a-checklist"></div>' +
          '<button type="button" class="v2-btn v2-btn-go" id="v2-btn-gate-a">✅ אשר Gate-A — המשך לבחירת קמפיין</button></div>';
      default:
        return '';
    }
  }

  function renderGateAChecklist() {
    saveOnboardingFromForm();
    var el = document.getElementById('v2-gate-a-checklist');
    if (!el || !window.ProjectBrief) return;
    var v = ProjectBrief.validateGateA();
    el.innerHTML = '<div class="v2-checklist">' +
      v.checklist.map(function (c) {
        return '<div class="' + (c.ok ? 'ok' : 'miss') + '">' + (c.ok ? '✅' : '🔴') + ' ' + esc(c.label) + '</div>';
      }).join('') + '</div>';
    var btn = document.getElementById('v2-btn-gate-a');
    if (btn) {
      btn.disabled = !v.ok || ProjectBrief.isGateAApproved();
      btn.onclick = function () {
        saveOnboardingFromForm();
        var res = ProjectBrief.approveGateA('manager');
        if (!res.ok) {
          setFooter(res.message || 'לא ניתן לאשר Gate-A');
          renderGateAChecklist();
          return;
        }
        setFooter('✅ Gate-A אושר — בחר סוג קמפיין');
        goPhase('picker');
        if (typeof window.refreshProjectBrief === 'function') refreshProjectBrief('gate-a');
      };
    }
  }

  function renderOnboardingPane() {
    var pane = document.getElementById('v2-pane-onboarding');
    if (!pane) return;
    var step = ONBOARDING_STEPS[state.obStep];
    pane.innerHTML = onboardingPaneHtml(step);
    hydrateFormFromBrief();
    renderOnboardingChips();
    if (step.id === 'keywords') {
      var mockBtn = document.getElementById('v2-kw-mock');
      if (mockBtn) mockBtn.onclick = function () {
        document.getElementById('v2-kw-approved').value = [
          'ניהול צי רכב', 'מערכת GPS לרכב', 'Fleet management', 'תחזוקת צי', 'ביטוח צי',
          'ניהול רכב חברה', 'מעקב רכבים', 'FleetOS', 'חיסכון בעלויות צי', 'ניהול צי עסקי',
        ].join('\n');
      };
    }
    if (step.id === 'summary') renderGateAChecklist();
    var backBtn = document.getElementById('v2-btn-back');
    var nextBtn = document.getElementById('v2-btn-next');
    if (backBtn) backBtn.disabled = state.obStep <= 0 && state.phase === 'onboarding';
    if (nextBtn) nextBtn.textContent = state.obStep >= ONBOARDING_STEPS.length - 1 ? 'סיכום Gate-A' : 'הבא ←';
  }

  function renderCompaniesPane() {
    var pane = document.getElementById('v2-pane-entry');
    if (!pane) return;
    pane.innerHTML =
      '<div class="v2-head"><div class="v2-head-part">ניהול שיווק › חברות ועסקים</div>' +
      '<div class="v2-head-t">בחר לקוח / פתיחת לקוח</div>' +
      '<div class="v2-head-s">בחר עסק קיים כדי להיכנס לזרימת CO.CO V2 — היכרות לפני קמפיין.</div></div>' +
      '<div class="v2-sec">' + MOCK_CLIENTS.map(function (c) {
        var sel = state.client && state.client.id === c.id ? ' selected' : '';
        return '<div class="v2-client-row' + sel + '" data-client="' + esc(c.id) + '">' +
          '<div class="v2-client-ico">🏢</div><div><div class="v2-client-name">' + esc(c.name) + '</div>' +
          '<div class="v2-client-sub">' + esc(c.sector) + ' · ' + esc(c.site) + '</div></div></div>';
      }).join('') + '</div>';
    pane.querySelectorAll('[data-client]').forEach(function (row) {
      row.addEventListener('click', function () {
        var id = row.getAttribute('data-client');
        state.client = MOCK_CLIENTS.filter(function (c) { return c.id === id; })[0] || null;
        pane.querySelectorAll('.v2-client-row').forEach(function (r) { r.classList.remove('selected'); });
        row.classList.add('selected');
        setField('business.name', state.client.name);
        setField('business.sector', state.client.sector);
        setField('assets.website', state.client.site);
        setField('business.site', state.client.site);
        setField('meta.projectId', state.client.id);
        renderBreadcrumb();
        setFooter('לקוח נבחר — לחץ "פתח לקוח" להמשיך');
        var next = document.getElementById('v2-btn-next');
        if (next) next.disabled = false;
      });
    });
  }

  function renderCampaignPicker() {
    var pane = document.getElementById('v2-pane-picker');
    if (!pane) return;
    if (!window.ProjectBrief || !ProjectBrief.isGateAApproved()) {
      pane.innerHTML = '<div class="v2-alt v2-alt-w">יש להשלים ולאשר Gate-A (היכרות) לפני בחירת קמפיין.</div>';
      return;
    }
    pane.innerHTML =
      '<div class="v2-head"><div class="v2-head-part">שלב ב׳ — בחירת קמפיין</div>' +
      '<div class="v2-head-t">איזה סוג קמפיין?</div>' +
      '<div class="v2-head-s">רק לאחר Gate-A — בחר כיוון שיווקי. Wizards B/C ייפתחו בהתאם.</div></div>' +
      '<div class="v2-sec v2-camp-grid" id="v2-camp-grid">' +
      CAMPAIGN_TYPES.map(function (c) {
        var sel = state.campaignType === c.id ? ' selected' : '';
        return '<div class="v2-camp-card' + sel + '" data-camp="' + c.id + '"><div class="v2-camp-ico">' + c.ico +
          '</div><div class="v2-camp-t">' + esc(c.label) + '</div></div>';
      }).join('') + '</div>' +
      '<div class="v2-sec"><button type="button" class="v2-btn v2-btn-p" id="v2-btn-camp-confirm" disabled>המשך ל-Wizards →</button></div>';
    pane.querySelectorAll('[data-camp]').forEach(function (card) {
      card.addEventListener('click', function () {
        state.campaignType = card.getAttribute('data-camp');
        pane.querySelectorAll('.v2-camp-card').forEach(function (x) { x.classList.remove('selected'); });
        card.classList.add('selected');
        setField('business.campaignType', state.campaignType);
        document.getElementById('v2-btn-camp-confirm').disabled = false;
      });
    });
    var confirm = document.getElementById('v2-btn-camp-confirm');
    if (confirm) confirm.onclick = function () {
      setField('business.campaignType', state.campaignType);
      goPhase('wizards');
    };
  }

  function renderWizardStub() {
    var pane = document.getElementById('v2-pane-wizards');
    if (!pane) return;
    var ct = state.campaignType || getVal('business.campaignType') || 'seo';
    var needsSeo = ['seo', 'both', 'local', 'content'].indexOf(ct) >= 0;
    var needsAds = ['ads', 'both'].indexOf(ct) >= 0;
    pane.innerHTML =
      '<div class="v2-head"><div class="v2-head-part">שלב ב׳/ג׳ — Wizards מותנים</div>' +
      '<div class="v2-head-t">קמפיין: ' + esc(ct) + '</div></div>' +
      '<div class="v2-sec">' +
      (needsSeo ? '<div class="v2-card"><b>🌱 SEO Wizard</b><p style="font-size:12px;color:rgba(255,255,255,.6);margin:8px 0;">12 שלבים — פתח את ה-Wizard המלא או אשר mock.</p>' +
        '<button type="button" class="v2-btn v2-btn-g" id="v2-open-seo">פתח Wizard SEO</button> ' +
        '<button type="button" class="v2-btn v2-btn-go" id="v2-mock-seo">✓ אשר seoPack (mock)</button></div>' : '') +
      (needsAds ? '<div class="v2-card"><b>📢 Google Ads Wizard</b><p style="font-size:12px;color:rgba(255,255,255,.6);margin:8px 0;">9 שלבים — בקרוב / stub.</p>' +
        '<button type="button" class="v2-btn v2-btn-go" id="v2-mock-ads">✓ אשר adsPack (mock)</button></div>' : '') +
      (!needsSeo && !needsAds ? '<div class="v2-card"><b>Gate-B meta בלבד</b><p style="font-size:12px;color:rgba(255,255,255,.6);">אין wizards חובה לסוג קמפיין זה.</p></div>' : '') +
      '<button type="button" class="v2-btn v2-btn-p" id="v2-btn-gate-b" style="margin-top:12px;">✅ אשר Gate-B → Brief</button></div>';

    var openSeo = document.getElementById('v2-open-seo');
    if (openSeo) openSeo.onclick = function () {
      var abc = document.getElementById('abc-app');
      if (abc) abc.classList.add('v2-show-wizards');
      if (typeof window.showPart === 'function') window.showPart('b');
      abc && abc.scrollIntoView({ behavior: 'smooth' });
    };
    var mockSeo = document.getElementById('v2-mock-seo');
    if (mockSeo) mockSeo.onclick = function () {
      try {
        localStorage.setItem('dalia_part_b', JSON.stringify({
          approved: true, kw_count: 6, ts: new Date().toISOString(),
          seoPack: { approvedAt: new Date().toISOString(), goals: ['SEO'], geo: ['מרכז'] },
        }));
      } catch (e) { /* ignore */ }
      setField('seoPack.approvedAt', new Date().toISOString());
      if (window.ProjectBrief) ProjectBrief.mergeFromLegacy();
      setFooter('seoPack אושר (mock)');
    };
    var mockAds = document.getElementById('v2-mock-ads');
    if (mockAds) mockAds.onclick = function () {
      setField('adsPack.approvedAt', new Date().toISOString());
      setFooter('adsPack אושר (mock)');
    };
    var gateB = document.getElementById('v2-btn-gate-b');
    if (gateB) gateB.onclick = function () {
      if (needsSeo && !getVal('seoPack.approvedAt')) {
        setFooter('אשר seoPack לפני Gate-B');
        return;
      }
      if (needsAds && !getVal('adsPack.approvedAt')) {
        setFooter('אשר adsPack לפני Gate-B');
        return;
      }
      var res = ProjectBrief.approveGateB('manager');
      if (!res.ok) { setFooter(res.message || 'Gate-B נכשל'); return; }
      goPhase('brief');
    };
  }

  function setFooter(msg) {
    var el = document.getElementById('v2-finfo');
    if (el) el.textContent = msg;
  }

  function showPane(phase) {
    document.querySelectorAll('.v2-pane').forEach(function (p) { p.classList.remove('on'); });
    var id = 'v2-pane-' + phase;
    var pane = document.getElementById(id);
    if (pane) pane.classList.add('on');
  }

  function goPhase(phase) {
    state.phase = phase;
    renderTopStepper();
    renderBreadcrumb();
    showPane(phase);
    if (phase === 'entry') renderCompaniesPane();
    if (phase === 'onboarding') { renderOnboardingPane(); }
    if (phase === 'picker') renderCampaignPicker();
    if (phase === 'wizards') renderWizardStub();
    if (phase === 'brief') {
      document.getElementById('coco-v2-app').style.display = 'none';
      document.body.classList.remove('coco-v2-mode');
      if (typeof window.refreshProjectBrief === 'function') refreshProjectBrief('gate-b');
      if (typeof window.scrollToProjectBrief === 'function') scrollToProjectBrief();
      setFooter('עוברים ל-Brief Panel');
    }
    var next = document.getElementById('v2-btn-next');
    if (next) next.disabled = phase === 'entry' && !state.client;
  }

  function onNext() {
    if (state.phase === 'entry') {
      if (!state.client) { setFooter('בחר לקוח קודם'); return; }
      goPhase('onboarding');
      return;
    }
    if (state.phase === 'onboarding') {
      saveOnboardingFromForm();
      if (state.obStep < ONBOARDING_STEPS.length - 1) {
        state.obStep++;
        renderOnboardingPane();
      } else {
        renderGateAChecklist();
      }
      return;
    }
  }

  function onBack() {
    if (state.phase === 'onboarding' && state.obStep > 0) {
      saveOnboardingFromForm();
      state.obStep--;
      renderOnboardingPane();
      return;
    }
    if (state.phase === 'onboarding') goPhase('entry');
    else if (state.phase === 'picker') goPhase('onboarding');
    else if (state.phase === 'wizards') goPhase('picker');
  }

  function buildShell() {
    if (document.getElementById('coco-v2-app')) return;
    var root = document.createElement('div');
    root.id = 'coco-v2-app';
    root.className = 'v2-active';
    root.innerHTML =
      '<div class="v2-brandbar"><div class="logo"><span>CO.CO</span> <em>דליה</em></div>' +
      '<span class="v2-badge">Workflow V2 · UX Prototype</span>' +
      '<a href="' + esc(platformUrl('?flow=legacy')) + '" style="font-size:11px;color:#94a3b8;">← ניהול שיווק</a></div>' +
      '<nav class="v2-breadcrumb" id="v2-breadcrumb"></nav>' +
      '<div class="v2-stepper-wrap"><div class="v2-stepper" id="v2-top-stepper"></div></div>' +
      '<div class="v2-alt v2-alt-i">תצוגת UX בלבד — ללא AI אמיתי, ללא APIs חדשים. סדר: היכרות → Gate-A → קמפיין → Brief → עוזרים.</div>' +
      '<div class="v2-main">' +
      '<div class="v2-pane on" id="v2-pane-entry"></div>' +
      '<div class="v2-pane" id="v2-pane-onboarding"></div>' +
      '<div class="v2-pane" id="v2-pane-picker"></div>' +
      '<div class="v2-pane" id="v2-pane-wizards"></div>' +
      '</div>' +
      '<div class="v2-footer">' +
      '<button type="button" class="v2-btn v2-btn-g" id="v2-btn-back">← חזור</button>' +
      '<div class="v2-finfo" id="v2-finfo">בחר לקוח להתחלה</div>' +
      '<button type="button" class="v2-btn v2-btn-p" id="v2-btn-next" disabled>פתח לקוח ←</button></div>';
    document.body.insertBefore(root, document.body.firstChild);
    document.getElementById('v2-btn-next').addEventListener('click', onNext);
    document.getElementById('v2-btn-back').addEventListener('click', onBack);
  }

  function resumeFromState() {
    if (window.ProjectBrief && ProjectBrief.isGateBApproved()) {
      goPhase('brief');
      return;
    }
    if (window.ProjectBrief && ProjectBrief.isGateAApproved()) {
      state.phase = 'picker';
      if (getVal('business.campaignType')) {
        state.campaignType = getVal('business.campaignType');
        state.phase = 'wizards';
      }
    }
    var clientId = qs('client') || getVal('meta.projectId');
    if (clientId) {
      state.client = MOCK_CLIENTS.filter(function (c) { return c.id === clientId; })[0] || state.client;
    }
    if (state.client && state.phase === 'entry') goPhase('onboarding');
    else goPhase(state.phase);
  }

  function init() {
    if (!isV2Active()) return;
    buildShell();
    document.body.classList.add('coco-v2-mode');
    if (window.ProjectBrief) ProjectBrief.mergeFromLegacy();
    var clientId = qs('client');
    if (clientId) state.client = MOCK_CLIENTS.filter(function (c) { return c.id === clientId; })[0] || null;
    var stage = qs('stage');
    if (stage === 'onboarding') state.phase = 'onboarding';
    if (stage === 'picker') state.phase = 'picker';
    resumeFromState();
    window.CocoWorkflowV2 = {
      goPhase: goPhase,
      isActive: function () { return true; },
      state: state,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
