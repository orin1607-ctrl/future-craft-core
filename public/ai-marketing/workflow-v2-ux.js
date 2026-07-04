/**
 * CO.CO Workflow V2 — Stage א' Business Discovery wizard (UX prototype).
 * Brief-first: onboarding A1–A9 → Gate-A → campaign picker (SEO|Ads) → Gate-B → Brief → stages ד'-י'.
 */
(function () {
  'use strict';

  var MOCK_CLIENTS = [
    { id: 'client-greentech', name: 'גרין-טק פתרונות', sector: 'ניהול צי רכב', site: 'https://greentech.example.co.il' },
    { id: 'client-dalia', name: 'דליה — FleetOS', sector: 'טכנולוגיה לצי', site: 'https://dalia-c.com' },
    { id: 'client-demo', name: 'עסק לדוגמה', sector: 'שירותים', site: 'https://example.co.il' },
  ];

  var ONBOARDING_STEPS = [
    { id: 'a1', label: 'A1 פרטי עסק', title: 'פרטי העסק', sub: 'שם, תחום, סיכום, שפות, סוגי לקוחות' },
    { id: 'a2', label: 'A2 שירותים', title: 'שירותים ומוצרים', sub: 'שירותים, מוצרים, יתרונות, חולשות' },
    { id: 'a3', label: 'A3 קהל', title: 'קהל ומטרות', sub: 'קהל יעד, מטרות, אזורים גיאוגרפיים' },
    { id: 'a4', label: 'A4 מחקר', title: 'מחקר שיווקי', sub: 'מילות מפתח, כוונות, ביטויים, נושאים' },
    { id: 'a5', label: 'A5 מתחרים', title: 'מתחרים', sub: 'כרטיס מתחרה דינמי — לפחות אחד' },
    { id: 'a6', label: 'A6 נכסים', title: 'נכסים דיגיטליים', sub: 'אתר, דומיינים, רשתות, GBP' },
    { id: 'a7', label: 'A7 קבצים', title: 'קבצים וחומרים', sub: 'לוגו, תמונות, וידאו, מסמכים (mock upload)' },
    { id: 'a8', label: 'A8 חופשי', title: 'מידע חופשי', sub: 'הערות מנהל, הנחיות AI, בקשות מיוחדות' },
    { id: 'a9', label: 'A9 סיכום', title: 'Brief Report + Gate-A', sub: 'סיכום מובנה + checklist לפני אישור' },
  ];

  var CAMPAIGN_TYPES = [
    { id: 'seo', ico: '🌱', label: 'SEO', sub: 'קידום אורגני — Google Search' },
    { id: 'ads', ico: '📢', label: 'Google Ads', sub: 'קמפיין ממומן — Google Ads' },
  ];

  var V2_STEPS = [
    { id: 'entry', label: 'חברות' },
    { id: 'onboarding', label: 'היכרות' },
    { id: 'picker', label: 'קמפיין' },
    { id: 'wizards', label: 'Wizards' },
    { id: 'brief', label: 'Brief' },
  ];

  var SOCIAL_PLATFORMS = [
    { id: 'facebook', label: 'Facebook' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'gbp', label: 'Google Business' },
    { id: 'youtube', label: 'YouTube' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'whatsapp', label: 'WhatsApp' },
  ];

  var FILE_BUCKETS = [
    { id: 'logo', label: 'לוגו *', single: false },
    { id: 'images', label: 'תמונות', single: false },
    { id: 'videos', label: 'וידאו', single: false },
    { id: 'documents', label: 'מסמכים', single: false },
    { id: 'catalogs', label: 'קטלוגים', single: false },
    { id: 'brochures', label: 'חוברות', single: false },
    { id: 'marketingMaterials', label: 'חומרי שיווק', single: false },
  ];

  var state = {
    client: null,
    obStep: 0,
    campaignType: null,
    phase: 'entry',
    competitorsDraft: [],
    productsDraft: [],
    fileDraft: {},
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
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function splitLines(text) {
    if (!text) return [];
    return String(text).split(/[\n,;]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function g(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
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

  function envComp(c, field) {
    return ProjectBrief && c ? ProjectBrief.envVal(c[field]) : '';
  }

  function makeCompetitor(id) {
    var env = ProjectBrief.envelope;
    return {
      id: id || 'comp-' + Date.now(),
      name: env('', { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
      website: env('', { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
      facebook: env('', { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
      instagram: env('', { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
      gbp: env('', { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
      notes: env('', { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
      strengths: env('', { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
      weaknesses: env('', { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
      keywords: env([], { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
      learnFrom: env('', { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
    };
  }

  function makeProduct(id) {
    return {
      id: id || 'prod-' + Date.now(),
      name: ProjectBrief.envelope('', { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
      description: ProjectBrief.envelope('', { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
      price: ProjectBrief.envelope('', { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
      category: ProjectBrief.envelope('', { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
    };
  }

  function loadCompetitorsDraft() {
    var brief = ProjectBrief.get();
    state.competitorsDraft = (brief.competitors || []).map(function (c) {
      return {
        id: c.id || 'comp-' + Math.random(),
        name: envComp(c, 'name'),
        website: envComp(c, 'website'),
        facebook: envComp(c, 'facebook'),
        instagram: envComp(c, 'instagram'),
        gbp: envComp(c, 'gbp'),
        notes: envComp(c, 'notes'),
        strengths: envComp(c, 'strengths'),
        weaknesses: envComp(c, 'weaknesses'),
        keywords: (envComp(c, 'keywords') || []).join('\n'),
        learnFrom: envComp(c, 'learnFrom'),
      };
    });
    if (!state.competitorsDraft.length) state.competitorsDraft.push({ id: 'comp-0', name: '', website: '', facebook: '', instagram: '', gbp: '', notes: '', strengths: '', weaknesses: '', keywords: '', learnFrom: '' });
  }

  function loadProductsDraft() {
    var brief = ProjectBrief.get();
    state.productsDraft = (brief.products || []).map(function (p) {
      return {
        id: p.id || 'prod-' + Math.random(),
        name: ProjectBrief.envVal(p.name),
        description: ProjectBrief.envVal(p.description),
        price: ProjectBrief.envVal(p.price),
        category: ProjectBrief.envVal(p.category),
      };
    });
  }

  function saveCompetitorsToBrief() {
    if (!window.ProjectBrief) return;
    var comps = state.competitorsDraft.filter(function (c) { return c.name.trim(); }).map(function (c, idx) {
      var env = ProjectBrief.envelope;
      return {
        id: c.id || 'comp-v2-' + idx,
        name: env(c.name.trim(), { source: 'manual', status: 'from_client', updatedBy: 'workflow-v2-ux' }),
        website: env(c.website.trim(), { source: 'manual', status: c.website ? 'from_client' : 'missing', updatedBy: 'workflow-v2-ux' }),
        facebook: env(c.facebook.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
        instagram: env(c.instagram.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
        gbp: env(c.gbp.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
        notes: env(c.notes.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
        strengths: env(c.strengths.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
        weaknesses: env(c.weaknesses.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
        keywords: env(splitLines(c.keywords), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
        learnFrom: env(c.learnFrom.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
      };
    });
    var brief = ProjectBrief.get();
    brief.competitors = comps;
    ProjectBrief.set(brief);
  }

  function saveProductsToBrief() {
    if (!window.ProjectBrief) return;
    var prods = state.productsDraft.filter(function (p) { return p.name.trim(); }).map(function (p, idx) {
      var env = ProjectBrief.envelope;
      return {
        id: p.id || 'prod-v2-' + idx,
        name: env(p.name.trim(), { source: 'manual', status: 'from_client', updatedBy: 'workflow-v2-ux' }),
        description: env(p.description.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
        price: env(p.price.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
        category: env(p.category.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
      };
    });
    var brief = ProjectBrief.get();
    brief.products = prods;
    ProjectBrief.set(brief);
  }

  function saveFilesToBrief() {
    FILE_BUCKETS.forEach(function (b) {
      if (state.fileDraft[b.id] && state.fileDraft[b.id].length) {
        setField('files.' + b.id, state.fileDraft[b.id]);
      }
    });
  }

  function saveOnboardingFromForm() {
    setField('business.name', g('v2-biz-name'));
    setField('business.sector', g('v2-biz-sector'));
    setField('business.location', g('v2-biz-location'));
    setField('business.summary', g('v2-biz-summary'));
    setField('business.languages', splitLines(g('v2-biz-languages')));
    setField('business.clientTypes', splitLines(g('v2-biz-client-types')));
    setField('business.weaknesses', g('v2-biz-weaknesses'));
    setField('business.advantages', splitLines(g('v2-biz-advantages')));

    setField('services.main', g('v2-svc-main'));
    setField('services.usp', g('v2-svc-usp'));
    setField('services.list', splitLines(g('v2-svc-list')));
    setField('services.differentiator', g('v2-svc-diff'));
    setField('services.painPoints', g('v2-svc-pain'));

    saveProductsToBrief();

    setField('audience.ideal', splitLines(g('v2-aud-ideal')));
    setField('audience.avoid', splitLines(g('v2-aud-avoid')));
    setField('audience.intentNotes', g('v2-aud-intent'));
    setField('audience.geographicFocus', splitLines(g('v2-aud-geo')));
    setField('business.regions', splitLines(g('v2-aud-regions')));

    setField('goals.businessGoal', g('v2-goal-business'));
    setField('goals.budget', g('v2-goal-budget'));
    setField('goals.challenges', splitLines(g('v2-goal-challenges')));
    setField('goals.priorities', splitLines(g('v2-goal-priorities')));

    var fromClient = splitLines(g('v2-kw-from-client'));
    var approved = splitLines(g('v2-kw-approved'));
    setField('keywords.fromClient', fromClient);
    setField('keywords.approved', approved.length ? approved : fromClient);
    setField('keywords.toPromote', splitLines(g('v2-kw-promote')));
    setField('keywords.intentMap', splitLines(g('v2-kw-intent')));
    setField('keywords.keyPhrases', splitLines(g('v2-kw-phrases')));
    setField('keywords.geoRegions', splitLines(g('v2-kw-geo')));
    setField('keywords.coreTopics', splitLines(g('v2-kw-topics')));

    saveCompetitorsToBrief();

    var website = g('v2-asset-website');
    setField('business.site', website);
    setField('assets.website', website);
    setField('assets.domains', splitLines(g('v2-asset-domains')));
    setField('assets.gbpUrl', g('v2-asset-gbp'));
    setField('assets.otherDigital', splitLines(g('v2-asset-other')));

    var social = [];
    SOCIAL_PLATFORMS.forEach(function (p) {
      var url = g('v2-social-' + p.id);
      if (url) social.push({ platform: p.id, url: url });
    });
    setField('assets.social', social);

    saveFilesToBrief();

    setField('freeContent.managerNotes', g('v2-free-manager'));
    setField('freeContent.aiMustKnow', g('v2-free-ai'));
    setField('freeContent.importantInfo', g('v2-free-important'));
    setField('freeContent.highlights', g('v2-free-highlights'));
    setField('freeContent.specialRequests', g('v2-free-special'));
    setField('freeContent.mustPromote', g('v2-free-promote'));
    setField('freeContent.mustNotDo', g('v2-free-notdo'));
    setField('freeContent.ownerFreeText', g('v2-free-owner'));

    if (state.client) setField('meta.projectId', state.client.id);

    try {
      localStorage.setItem('dalia_biz', JSON.stringify({
        name: g('v2-biz-name'), company: g('v2-biz-name'), sector: g('v2-biz-sector'),
        loc: g('v2-biz-location'), site: website, mainService: g('v2-svc-main'),
        usp: g('v2-svc-usp'), services: g('v2-svc-list'), ideal: g('v2-aud-ideal'),
        goal: g('v2-goal-business'), budget: g('v2-goal-budget'),
        comp: state.competitorsDraft.map(function (c) { return c.name; }).filter(Boolean).join('\n'),
        free: g('v2-free-manager'),
        files: state.fileDraft.logo || [],
      }));
      localStorage.setItem('dalia_part_a', JSON.stringify({
        bizName: g('v2-biz-name'), name: g('v2-biz-name'), site: website, ts: new Date().toISOString(),
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
    set('v2-biz-languages', getVal('business.languages'));
    set('v2-biz-client-types', getVal('business.clientTypes'));
    set('v2-biz-weaknesses', getVal('business.weaknesses'));
    set('v2-biz-advantages', getVal('business.advantages'));
    set('v2-svc-main', getVal('services.main'));
    set('v2-svc-usp', getVal('services.usp'));
    set('v2-svc-list', (getVal('services.list') || []).join('\n'));
    set('v2-svc-diff', getVal('services.differentiator'));
    set('v2-svc-pain', getVal('services.painPoints'));
    set('v2-aud-ideal', (getVal('audience.ideal') || []).join('\n'));
    set('v2-aud-avoid', (getVal('audience.avoid') || []).join('\n'));
    set('v2-aud-intent', getVal('audience.intentNotes'));
    set('v2-aud-geo', (getVal('audience.geographicFocus') || []).join('\n'));
    set('v2-aud-regions', (getVal('business.regions') || []).join('\n'));
    set('v2-goal-business', getVal('goals.businessGoal'));
    set('v2-goal-budget', getVal('goals.budget'));
    set('v2-goal-challenges', (getVal('goals.challenges') || []).join('\n'));
    set('v2-goal-priorities', (getVal('goals.priorities') || []).join('\n'));
    set('v2-kw-from-client', (getVal('keywords.fromClient') || []).join('\n'));
    set('v2-kw-approved', (getVal('keywords.approved') || []).join('\n'));
    set('v2-kw-promote', (getVal('keywords.toPromote') || []).join('\n'));
    set('v2-kw-intent', (getVal('keywords.intentMap') || []).join('\n'));
    set('v2-kw-phrases', (getVal('keywords.keyPhrases') || []).join('\n'));
    set('v2-kw-geo', (getVal('keywords.geoRegions') || []).join('\n'));
    set('v2-kw-topics', (getVal('keywords.coreTopics') || []).join('\n'));
    set('v2-asset-website', getVal('assets.website') || getVal('business.site'));
    set('v2-asset-domains', (getVal('assets.domains') || []).join('\n'));
    set('v2-asset-gbp', getVal('assets.gbpUrl'));
    set('v2-asset-other', (getVal('assets.otherDigital') || []).join('\n'));
    var socialList = getVal('assets.social') || [];
    if (Array.isArray(socialList)) {
      socialList.forEach(function (s) {
        if (s && s.platform) {
          var inp = document.getElementById('v2-social-' + s.platform);
          if (inp) inp.value = s.url || '';
        }
      });
    }
    set('v2-free-manager', getVal('freeContent.managerNotes'));
    set('v2-free-ai', getVal('freeContent.aiMustKnow'));
    set('v2-free-important', getVal('freeContent.importantInfo'));
    set('v2-free-highlights', getVal('freeContent.highlights'));
    set('v2-free-special', getVal('freeContent.specialRequests'));
    set('v2-free-promote', getVal('freeContent.mustPromote'));
    set('v2-free-notdo', getVal('freeContent.mustNotDo'));
    set('v2-free-owner', getVal('freeContent.ownerFreeText'));

    FILE_BUCKETS.forEach(function (b) {
      var files = getVal('files.' + b.id) || [];
      state.fileDraft[b.id] = Array.isArray(files) ? files.slice() : [];
    });
  }

  function renderBreadcrumb() {
    var el = document.getElementById('v2-breadcrumb');
    if (!el) return;
    var clientName = state.client ? state.client.name : '—';
    var phaseLabel = state.phase === 'entry' ? 'חברות ועסקים' : 'היכרות';
    el.innerHTML =
      '<a href="' + esc(platformUrl('')) + '">ניהול שיווק</a><span class="sep">›</span>' +
      '<a href="#" id="v2-bc-companies">חברות ועסקים</a><span class="sep">›</span>' +
      '<span>' + esc(clientName) + '</span><span class="sep">›</span>' +
      '<span class="cur">' + esc(phaseLabel) + '</span>';
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

  function fieldBlock(label, id, type, placeholder, rows) {
    if (type === 'textarea') {
      return '<div class="v2-fl"><label>' + esc(label) + '</label><textarea class="v2-ta" id="' + id + '" rows="' + (rows || 3) + '" placeholder="' + esc(placeholder || '') + '"></textarea></div>';
    }
    return '<div class="v2-fl"><label>' + esc(label) + '</label><input class="v2-inp" id="' + id + '" placeholder="' + esc(placeholder || '') + '"></div>';
  }

  function onboardingPaneHtml(step) {
    var head = '<div class="v2-head"><div class="v2-head-part">שלב א׳ — היכרות · ' + esc(step.label) + '</div>' +
      '<div class="v2-head-t">' + esc(step.title) + '</div><div class="v2-head-s">' + esc(step.sub) + '</div></div>';
    switch (step.id) {
      case 'a1':
        return head + '<div class="v2-sec v2-card v2-g2">' +
          fieldBlock('שם העסק *', 'v2-biz-name', 'input') +
          fieldBlock('תחום *', 'v2-biz-sector', 'input') +
          fieldBlock('מיקום', 'v2-biz-location', 'input', 'עיר / אזור') +
          fieldBlock('שפות (שורה לכל שפה)', 'v2-biz-languages', 'textarea', 'עברית\nEnglish') +
          fieldBlock('סוגי לקוחות', 'v2-biz-client-types', 'textarea', 'B2B, SMB...') +
          '</div><div class="v2-sec v2-card">' +
          fieldBlock('סיכום העסק *', 'v2-biz-summary', 'textarea', '2–5 משפטים — מה העסק עושה', 4) +
          '</div>';
      case 'a2':
        return head + '<div class="v2-sec v2-card">' +
          fieldBlock('שירות מרכזי *', 'v2-svc-main', 'input') +
          fieldBlock('USP *', 'v2-svc-usp', 'input') +
          fieldBlock('רשימת שירותים', 'v2-svc-list', 'textarea', 'שורה לכל שירות', 4) +
          fieldBlock('מבדל / יתרון', 'v2-svc-diff', 'input') +
          fieldBlock('נקודות כאב של לקוח', 'v2-svc-pain', 'textarea', '', 2) +
          fieldBlock('יתרונות (שורה לכל יתרון)', 'v2-biz-advantages', 'textarea') +
          fieldBlock('חולשות / אתגרים פנימיים', 'v2-biz-weaknesses', 'textarea', '', 2) +
          '</div><div class="v2-sec"><div class="v2-card" id="v2-products-wrap"></div>' +
          '<button type="button" class="v2-btn v2-btn-g" id="v2-add-product">+ הוסף מוצר</button></div>';
      case 'a3':
        return head + '<div class="v2-sec v2-card">' +
          fieldBlock('קהל יעד אידיאלי *', 'v2-aud-ideal', 'textarea', 'שורה לכל פרופיל', 4) +
          fieldBlock('קהל להימנע ממנו', 'v2-aud-avoid', 'textarea', '', 2) +
          fieldBlock('הערות כוונה / intent', 'v2-aud-intent', 'textarea', '', 2) +
          fieldBlock('מיקוד גיאוגרפי', 'v2-aud-geo', 'textarea', 'אזורים / ערים') +
          fieldBlock('אזורי פעילות (regions)', 'v2-aud-regions', 'textarea') +
          '</div><div class="v2-sec v2-card v2-g2">' +
          fieldBlock('מטרה עסקית *', 'v2-goal-business', 'input') +
          fieldBlock('תקציב שיווק *', 'v2-goal-budget', 'input', '₪ / חודש') +
          fieldBlock('אתגרים', 'v2-goal-challenges', 'textarea') +
          fieldBlock('עדיפויות', 'v2-goal-priorities', 'textarea') +
          '</div>';
      case 'a4':
        return head + '<div class="v2-sec v2-card">' +
          '<div class="v2-alt v2-alt-i">מחקר mock — הזן מילות מפתח (≥5 מאושרות או מלקוח).</div>' +
          fieldBlock('מילות מפתח מהלקוח', 'v2-kw-from-client', 'textarea', 'שורה לכל מילה', 5) +
          fieldBlock('מילות מפתח מאושרות', 'v2-kw-approved', 'textarea', 'שורה לכל מילה', 5) +
          fieldBlock('מילים לקידום', 'v2-kw-promote', 'textarea') +
          fieldBlock('מפת כוונות (intentMap)', 'v2-kw-intent', 'textarea', 'מילה → כוונה') +
          fieldBlock('ביטויי מפתח', 'v2-kw-phrases', 'textarea') +
          fieldBlock('אזורים גיאוגרפיים (SEO)', 'v2-kw-geo', 'textarea') +
          fieldBlock('נושאי ליבה', 'v2-kw-topics', 'textarea') +
          '<button type="button" class="v2-btn v2-btn-g" id="v2-kw-mock">🔍 מילוי mock (10 מילים)</button></div>';
      case 'a5':
        return head + '<div class="v2-sec" id="v2-competitors-wrap"></div>' +
          '<div class="v2-sec"><button type="button" class="v2-btn v2-btn-g" id="v2-add-competitor">+ הוסף מתחרה</button></div>';
      case 'a6':
        return head + '<div class="v2-sec v2-card">' +
          fieldBlock('אתר *', 'v2-asset-website', 'input', 'https://') +
          fieldBlock('דומיינים (שורה לכל דומיין)', 'v2-asset-domains', 'textarea') +
          fieldBlock('Google Business Profile URL', 'v2-asset-gbp', 'input') +
          fieldBlock('נכסים דיגיטליים אחרים', 'v2-asset-other', 'textarea') +
          '<div class="v2-g2" style="margin-top:10px;">' +
          SOCIAL_PLATFORMS.map(function (p) {
            return fieldBlock(p.label, 'v2-social-' + p.id, 'input', 'https://');
          }).join('') +
          '</div></div>';
      case 'a7':
        return head + '<div class="v2-sec v2-card"><div class="v2-alt v2-alt-w">העלאה mock — קבצים נשמרים כ-metadata ב-Brief (ללא שרת).</div>' +
          '<div id="v2-files-wrap"></div></div>';
      case 'a8':
        return head + '<div class="v2-sec v2-card">' +
          fieldBlock('הערות מנהל', 'v2-free-manager', 'textarea', '', 4) +
          fieldBlock('AI חייב לדעת', 'v2-free-ai', 'textarea', '', 4) +
          fieldBlock('מידע חשוב', 'v2-free-important', 'textarea', '', 3) +
          fieldBlock('נקודות בולטות', 'v2-free-highlights', 'textarea', '', 3) +
          fieldBlock('בקשות מיוחדות', 'v2-free-special', 'textarea', '', 3) +
          fieldBlock('חובה לקדם', 'v2-free-promote', 'textarea', '', 2) +
          fieldBlock('אסור לעשות', 'v2-free-notdo', 'textarea', '', 2) +
          fieldBlock('טקסט חופשי (בעלים)', 'v2-free-owner', 'textarea', '', 6) +
          '</div>';
      case 'a9':
        return head + '<div class="v2-sec"><div class="v2-card v2-brief-report" id="v2-brief-report"></div>' +
          '<div class="v2-card" id="v2-gate-a-checklist"></div>' +
          '<button type="button" class="v2-btn v2-btn-go" id="v2-btn-gate-a">✅ אשר Gate-A והמשך לבחירת קמפיין</button></div>';
      default:
        return head;
    }
  }

  function renderProductsUI() {
    var wrap = document.getElementById('v2-products-wrap');
    if (!wrap) return;
    loadProductsDraft();
    wrap.innerHTML = '<div class="v2-subhead">מוצרים (אופציונלי)</div>' + state.productsDraft.map(function (p, i) {
      return '<div class="v2-dyn-card" data-prod-idx="' + i + '">' +
        fieldBlock('שם מוצר', 'v2-prod-name-' + i, 'input') +
        fieldBlock('תיאור', 'v2-prod-desc-' + i, 'textarea', '', 2) +
        '<div class="v2-g2">' + fieldBlock('מחיר', 'v2-prod-price-' + i, 'input') +
        fieldBlock('קטגוריה', 'v2-prod-cat-' + i, 'input') + '</div>' +
        '<button type="button" class="v2-btn v2-btn-g v2-btn-sm v2-rm-prod" data-idx="' + i + '">הסר</button></div>';
    }).join('');
    state.productsDraft.forEach(function (p, i) {
      var n = document.getElementById('v2-prod-name-' + i);
      if (n) n.value = p.name || '';
      var d = document.getElementById('v2-prod-desc-' + i);
      if (d) d.value = p.description || '';
      var pr = document.getElementById('v2-prod-price-' + i);
      if (pr) pr.value = p.price || '';
      var c = document.getElementById('v2-prod-cat-' + i);
      if (c) c.value = p.category || '';
    });
    wrap.querySelectorAll('.v2-rm-prod').forEach(function (btn) {
      btn.onclick = function () {
        syncProductsFromDom();
        state.productsDraft.splice(parseInt(btn.getAttribute('data-idx'), 10), 1);
        renderProductsUI();
      };
    });
  }

  function syncProductsFromDom() {
    state.productsDraft.forEach(function (p, i) {
      p.name = g('v2-prod-name-' + i);
      p.description = g('v2-prod-desc-' + i);
      p.price = g('v2-prod-price-' + i);
      p.category = g('v2-prod-cat-' + i);
    });
  }

  function renderCompetitorsUI() {
    var wrap = document.getElementById('v2-competitors-wrap');
    if (!wrap) return;
    loadCompetitorsDraft();
    wrap.innerHTML = state.competitorsDraft.map(function (c, i) {
      return '<div class="v2-dyn-card v2-comp-card" data-comp-idx="' + i + '">' +
        '<div class="v2-subhead">מתחרה ' + (i + 1) + '</div>' +
        fieldBlock('שם *', 'v2-comp-name-' + i, 'input') +
        '<div class="v2-g2">' + fieldBlock('אתר', 'v2-comp-web-' + i, 'input') +
        fieldBlock('Facebook', 'v2-comp-fb-' + i, 'input') + '</div>' +
        '<div class="v2-g2">' + fieldBlock('Instagram', 'v2-comp-ig-' + i, 'input') +
        fieldBlock('GBP', 'v2-comp-gbp-' + i, 'input') + '</div>' +
        fieldBlock('חוזקות', 'v2-comp-str-' + i, 'textarea', '', 2) +
        fieldBlock('חולשות', 'v2-comp-weak-' + i, 'textarea', '', 2) +
        fieldBlock('מילות מפתח', 'v2-comp-kw-' + i, 'textarea') +
        fieldBlock('מה ללמוד', 'v2-comp-learn-' + i, 'textarea', '', 2) +
        fieldBlock('הערות', 'v2-comp-notes-' + i, 'textarea', '', 2) +
        '<button type="button" class="v2-btn v2-btn-g v2-btn-sm v2-rm-comp" data-idx="' + i + '">הסר מתחרה</button></div>';
    }).join('');
    state.competitorsDraft.forEach(function (c, i) {
      var map = { name: 'v2-comp-name-', website: 'v2-comp-web-', facebook: 'v2-comp-fb-', instagram: 'v2-comp-ig-', gbp: 'v2-comp-gbp-', strengths: 'v2-comp-str-', weaknesses: 'v2-comp-weak-', keywords: 'v2-comp-kw-', learnFrom: 'v2-comp-learn-', notes: 'v2-comp-notes-' };
      Object.keys(map).forEach(function (k) {
        var el = document.getElementById(map[k] + i);
        if (el) el.value = c[k] || '';
      });
    });
    wrap.querySelectorAll('.v2-rm-comp').forEach(function (btn) {
      btn.onclick = function () {
        syncCompetitorsFromDom();
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        if (state.competitorsDraft.length <= 1) { state.competitorsDraft[0] = { id: 'comp-0', name: '', website: '', facebook: '', instagram: '', gbp: '', notes: '', strengths: '', weaknesses: '', keywords: '', learnFrom: '' }; }
        else state.competitorsDraft.splice(idx, 1);
        renderCompetitorsUI();
      };
    });
  }

  function syncCompetitorsFromDom() {
    state.competitorsDraft.forEach(function (c, i) {
      c.name = g('v2-comp-name-' + i);
      c.website = g('v2-comp-web-' + i);
      c.facebook = g('v2-comp-fb-' + i);
      c.instagram = g('v2-comp-ig-' + i);
      c.gbp = g('v2-comp-gbp-' + i);
      c.strengths = g('v2-comp-str-' + i);
      c.weaknesses = g('v2-comp-weak-' + i);
      c.keywords = g('v2-comp-kw-' + i);
      c.learnFrom = g('v2-comp-learn-' + i);
      c.notes = g('v2-comp-notes-' + i);
    });
  }

  function renderFilesUI() {
    var wrap = document.getElementById('v2-files-wrap');
    if (!wrap) return;
    wrap.innerHTML = FILE_BUCKETS.map(function (b) {
      var files = state.fileDraft[b.id] || [];
      var list = files.map(function (f) {
        return '<span class="v2-file-chip">' + esc(f.name) + ' <button type="button" data-bucket="' + b.id + '" data-name="' + esc(f.name) + '" class="v2-rm-file">×</button></span>';
      }).join('');
      return '<div class="v2-file-bucket"><label>' + esc(b.label) + '</label>' +
        '<input type="file" class="v2-file-inp" data-bucket="' + b.id + '" ' + (b.id === 'logo' ? '' : 'multiple') + '>' +
        '<div class="v2-file-list">' + list + '</div></div>';
    }).join('');
    wrap.querySelectorAll('.v2-file-inp').forEach(function (inp) {
      inp.onchange = function () {
        var bucket = inp.getAttribute('data-bucket');
        var files = inp.files;
        if (!files || !files.length) return;
        if (!state.fileDraft[bucket]) state.fileDraft[bucket] = [];
        Array.prototype.forEach.call(files, function (file) {
          var entry = { name: file.name, type: file.type, size: file.size, mock: true };
          if (file.size < 500000) {
            var reader = new FileReader();
            reader.onload = function () { entry.dataUrl = String(reader.result).slice(0, 200) + '…'; saveOnboardingFromForm(); renderFilesUI(); };
            reader.readAsDataURL(file);
          }
          state.fileDraft[bucket].push(entry);
        });
        saveOnboardingFromForm();
        renderFilesUI();
      };
    });
    wrap.querySelectorAll('.v2-rm-file').forEach(function (btn) {
      btn.onclick = function () {
        var bucket = btn.getAttribute('data-bucket');
        var name = btn.getAttribute('data-name');
        state.fileDraft[bucket] = (state.fileDraft[bucket] || []).filter(function (f) { return f.name !== name; });
        saveOnboardingFromForm();
        renderFilesUI();
      };
    });
  }

  function renderBriefReport() {
    saveOnboardingFromForm();
    var el = document.getElementById('v2-brief-report');
    if (!el || !window.ProjectBrief) return;
    var brief = ProjectBrief.get();
    var ev = ProjectBrief.envVal;
    var section = function (title, body) {
      return '<div class="v2-report-sec"><div class="v2-report-h">' + esc(title) + '</div><div class="v2-report-b">' + body + '</div></div>';
    };
    var list = function (arr) { return (arr || []).length ? esc((arr || []).join(', ')) : '<span class="v2-muted">—</span>'; };
    var comps = (brief.competitors || []).map(function (c) { return ev(c.name); }).filter(Boolean);
    var logos = ev(brief.files.logo) || [];
    el.innerHTML =
      section('מי העסק / מה עושה',
        '<b>' + esc(ev(brief.business.name) || '—') + '</b> · ' + esc(ev(brief.business.sector) || '—') +
        '<br>' + esc(ev(brief.business.summary) || '—')) +
      section('שירותים, מוצרים, נכסים',
        'שירות: ' + esc(ev(brief.services.main) || '—') + ' · USP: ' + esc(ev(brief.services.usp) || '—') +
        '<br>מוצרים: ' + (brief.products || []).length +
        '<br>אתר: ' + esc(ev(brief.assets.website) || '—')) +
      section('מתחרים, מילות מפתח, קהל',
        'מתחרים: ' + list(comps) +
        '<br>מילות מפתח: ' + list(ev(brief.keywords.approved) || ev(brief.keywords.fromClient)) +
        '<br>קהל: ' + list(ev(brief.audience.ideal))) +
      section('קבצים', 'לוגו: ' + logos.length + ' · תמונות: ' + (ev(brief.files.images) || []).length);
  }

  function renderGateAChecklist() {
    saveOnboardingFromForm();
    renderBriefReport();
    var el = document.getElementById('v2-gate-a-checklist');
    if (!el || !window.ProjectBrief) return;
    var v = ProjectBrief.validateGateA();
    el.innerHTML = '<div class="v2-subhead">Checklist Gate-A</div><div class="v2-checklist">' +
      v.checklist.map(function (c) {
        return '<div class="' + (c.ok ? 'ok' : 'miss') + '">' + (c.ok ? '✅' : '🔴') + ' ' + esc(c.label) + '</div>';
      }).join('') + '</div>';
    if (v.missing.length) {
      el.innerHTML += '<div class="v2-alt v2-alt-w" style="margin-top:10px;">חסר: ' + esc(v.missing.join(' · ')) + '</div>';
    }
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

  function wireStepInputs() {
    var pane = document.getElementById('v2-pane-onboarding');
    if (!pane) return;
    pane.querySelectorAll('input, textarea').forEach(function (el) {
      if (el.id && el.id.indexOf('v2-comp-') === 0) return;
      if (el.id && el.id.indexOf('v2-prod-') === 0) return;
      el.addEventListener('change', function () { saveOnboardingFromForm(); });
    });
  }

  function renderOnboardingPane() {
    var pane = document.getElementById('v2-pane-onboarding');
    if (!pane) return;
    var step = ONBOARDING_STEPS[state.obStep];
    pane.innerHTML = '<div class="v2-wiz-steps" id="v2-ob-chips"></div>' + onboardingPaneHtml(step);
    hydrateFormFromBrief();
    renderOnboardingChips();
    if (step.id === 'a2') {
      renderProductsUI();
      var addProd = document.getElementById('v2-add-product');
      if (addProd) addProd.onclick = function () { syncProductsFromDom(); state.productsDraft.push({ id: 'prod-' + Date.now(), name: '', description: '', price: '', category: '' }); renderProductsUI(); };
    }
    if (step.id === 'a4') {
      var mockBtn = document.getElementById('v2-kw-mock');
      if (mockBtn) mockBtn.onclick = function () {
        var kw = ['ניהול צי רכב', 'מערכת GPS לרכב', 'Fleet management', 'תחזוקת צי', 'ביטוח צי', 'ניהול רכב חברה', 'מעקב רכבים', 'FleetOS', 'חיסכון בעלויות צי', 'ניהול צי עסקי'];
        document.getElementById('v2-kw-from-client').value = kw.join('\n');
        document.getElementById('v2-kw-approved').value = kw.join('\n');
        saveOnboardingFromForm();
      };
    }
    if (step.id === 'a5') {
      renderCompetitorsUI();
      var addComp = document.getElementById('v2-add-competitor');
      if (addComp) addComp.onclick = function () { syncCompetitorsFromDom(); state.competitorsDraft.push({ id: 'comp-' + Date.now(), name: '', website: '', facebook: '', instagram: '', gbp: '', notes: '', strengths: '', weaknesses: '', keywords: '', learnFrom: '' }); renderCompetitorsUI(); };
    }
    if (step.id === 'a7') renderFilesUI();
    if (step.id === 'a9') renderGateAChecklist();
    wireStepInputs();
    var saveStep = document.getElementById('v2-btn-save-step');
    if (saveStep) saveStep.style.display = state.phase === 'onboarding' ? 'inline-flex' : 'none';
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

  function createCampaignStub(type) {
    if (!window.ProjectBrief) return;
    var brief = ProjectBrief.get();
    var campId = 'camp-' + Date.now();
    brief.campaigns = [{
      id: campId,
      type: type,
      status: 'draft',
      createdAt: new Date().toISOString(),
      selectedBy: 'manager',
      loadedStages: type === 'seo' ? ['b'] : type === 'ads' ? ['c'] : [],
      goals: { budget: ProjectBrief.envelope(getVal('goals.budget'), { source: 'manual', status: 'from_client', updatedBy: 'workflow-v2-ux' }) },
      keywords: { campaign: [] },
      seoPack: { goals: [], geo: [], approvedAt: null, readinessScore: 0 },
      adsPack: { approvedAt: null, budget: {}, campaigns: [], conversionGoals: [] },
      approval: { gateBApproved: false, isApproved: false, approvedAt: null },
    }];
    brief.campaign = { activeId: ProjectBrief.envelope(campId, { source: 'derived', status: 'verified', updatedBy: 'workflow-v2-ux' }) };
    setField('business.campaignType', type);
    ProjectBrief.set(brief);
    try { localStorage.setItem('coco-campaign-active-v1', campId); } catch (e) { /* ignore */ }
  }

  function renderCampaignPicker() {
    var pane = document.getElementById('v2-pane-picker');
    if (!pane) return;
    if (!window.ProjectBrief || !ProjectBrief.isGateAApproved()) {
      pane.innerHTML = '<div class="v2-alt v2-alt-w">יש להשלים ולאשר Gate-A (היכרות) לפני בחירת קמפיין.</div>';
      return;
    }
    pane.innerHTML =
      '<div class="v2-head"><div class="v2-head-part">שלב ב׳ — בחירת קמפיין (Google בלבד)</div>' +
      '<div class="v2-head-t">SEO או Google Ads</div>' +
      '<div class="v2-head-s">רק לאחר Gate-A — בחר כיוון שיווקי. Wizards B/C ייפתחו בהתאם.</div></div>' +
      '<div class="v2-sec v2-camp-grid" id="v2-camp-grid">' +
      CAMPAIGN_TYPES.map(function (c) {
        var sel = state.campaignType === c.id ? ' selected' : '';
        return '<div class="v2-camp-card' + sel + '" data-camp="' + c.id + '"><div class="v2-camp-ico">' + c.ico +
          '</div><div class="v2-camp-t">' + esc(c.label) + '</div><div class="v2-camp-s">' + esc(c.sub) + '</div></div>';
      }).join('') + '</div>' +
      '<div class="v2-sec"><button type="button" class="v2-btn v2-btn-p" id="v2-btn-camp-confirm" disabled>המשך ל-Wizards →</button></div>';
    pane.querySelectorAll('[data-camp]').forEach(function (card) {
      card.addEventListener('click', function () {
        state.campaignType = card.getAttribute('data-camp');
        pane.querySelectorAll('.v2-camp-card').forEach(function (x) { x.classList.remove('selected'); });
        card.classList.add('selected');
        document.getElementById('v2-btn-camp-confirm').disabled = false;
      });
    });
    var confirm = document.getElementById('v2-btn-camp-confirm');
    if (confirm) confirm.onclick = function () {
      createCampaignStub(state.campaignType);
      goPhase('wizards');
    };
  }

  function renderWizardStub() {
    var pane = document.getElementById('v2-pane-wizards');
    if (!pane) return;
    var ct = state.campaignType || getVal('business.campaignType') || 'seo';
    var needsSeo = ct === 'seo';
    var needsAds = ct === 'ads';
    pane.innerHTML =
      '<div class="v2-head"><div class="v2-head-part">שלב ב׳/ג׳ — Wizards מותנים</div>' +
      '<div class="v2-head-t">קמפיין: ' + esc(ct) + '</div></div>' +
      '<div class="v2-sec">' +
      (needsSeo ? '<div class="v2-card"><b>🌱 SEO Wizard</b><p class="v2-muted" style="margin:8px 0;">12 שלבים — פתח את ה-Wizard המלא או אשר mock.</p>' +
        '<button type="button" class="v2-btn v2-btn-g" id="v2-open-seo">פתח Wizard SEO</button> ' +
        '<button type="button" class="v2-btn v2-btn-go" id="v2-mock-seo">✓ אשר seoPack (mock)</button></div>' : '') +
      (needsAds ? '<div class="v2-card"><b>📢 Google Ads Wizard</b><p class="v2-muted" style="margin:8px 0;">9 שלבים — stub / mock.</p>' +
        '<button type="button" class="v2-btn v2-btn-go" id="v2-mock-ads">✓ אשר adsPack (mock)</button></div>' : '') +
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
      if (needsSeo && !getVal('seoPack.approvedAt')) { setFooter('אשר seoPack לפני Gate-B'); return; }
      if (needsAds && !getVal('adsPack.approvedAt')) { setFooter('אשר adsPack לפני Gate-B'); return; }
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
    var pane = document.getElementById('v2-pane-' + phase);
    if (pane) pane.classList.add('on');
  }

  function goPhase(phase) {
    state.phase = phase;
    renderTopStepper();
    renderBreadcrumb();
    showPane(phase);
    if (phase === 'entry') renderCompaniesPane();
    if (phase === 'onboarding') renderOnboardingPane();
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

  function onSaveStep() {
    if (state.phase === 'onboarding') {
      if (state.obStep === 4) syncCompetitorsFromDom();
      if (state.obStep === 1) syncProductsFromDom();
      saveOnboardingFromForm();
      setFooter('✓ שלב נשמר');
    }
  }

  function onNext() {
    if (state.phase === 'entry') {
      if (!state.client) { setFooter('בחר לקוח קודם'); return; }
      goPhase('onboarding');
      return;
    }
    if (state.phase === 'onboarding') {
      if (ONBOARDING_STEPS[state.obStep].id === 'a5') syncCompetitorsFromDom();
      if (ONBOARDING_STEPS[state.obStep].id === 'a2') syncProductsFromDom();
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
      '<span class="v2-badge">Workflow V2 · Stage א׳ Discovery</span>' +
      '<a href="' + esc(platformUrl('?flow=legacy')) + '" style="font-size:11px;color:#94a3b8;">← ניהול שיווק</a></div>' +
      '<nav class="v2-breadcrumb" id="v2-breadcrumb"></nav>' +
      '<div class="v2-stepper-wrap"><div class="v2-stepper" id="v2-top-stepper"></div></div>' +
      '<div class="v2-alt v2-alt-i">תצוגת UX בלבד — ללא AI אמיתי, ללא APIs חדשים. סדר: היכרות A1–A9 → Gate-A → קמפיין → Brief → עוזרים.</div>' +
      '<div class="v2-main">' +
      '<div class="v2-pane on" id="v2-pane-entry"></div>' +
      '<div class="v2-pane" id="v2-pane-onboarding"></div>' +
      '<div class="v2-pane" id="v2-pane-picker"></div>' +
      '<div class="v2-pane" id="v2-pane-wizards"></div>' +
      '</div>' +
      '<div class="v2-footer">' +
      '<button type="button" class="v2-btn v2-btn-g" id="v2-btn-back">← חזור</button>' +
      '<button type="button" class="v2-btn v2-btn-g" id="v2-btn-save-step">שמור שלב</button>' +
      '<div class="v2-finfo" id="v2-finfo">בחר לקוח להתחלה</div>' +
      '<button type="button" class="v2-btn v2-btn-p" id="v2-btn-next" disabled>פתח לקוח ←</button></div>';
    document.body.insertBefore(root, document.body.firstChild);
    document.getElementById('v2-btn-next').addEventListener('click', onNext);
    document.getElementById('v2-btn-back').addEventListener('click', onBack);
    document.getElementById('v2-btn-save-step').addEventListener('click', onSaveStep);
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
      saveOnboardingFromForm: saveOnboardingFromForm,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
