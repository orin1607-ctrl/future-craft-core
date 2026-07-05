/**
 * CO.CO Workflow V2 — Stage א' 9-tab Business Discovery wizard.
 * Tabs 1–9 → Gate-A → שלב ד' (50 עוזרים). Campaign picker skipped in this UX pass.
 */
(function () {
  'use strict';

  var MOCK_CLIENTS = [
    { id: 'client-greentech', name: 'גרין-טק פתרונות', sector: 'ניהול צי רכב', site: 'https://greentech.example.co.il' },
    { id: 'client-dalia', name: 'דליה — FleetOS', sector: 'טכנולוגיה לצי', site: 'https://dalia-c.com' },
    { id: 'client-demo', name: 'עסק לדוגמה', sector: 'שירותים', site: 'https://example.co.il' },
  ];

  var ONBOARDING_STEPS = [
    { id: 'a1', label: '1', title: 'פרטי העסק', sub: 'שם, תחום, סיפור, יתרונות, יצירת קשר' },
    { id: 'a2', label: '2', title: 'שירותים ומוצרים', sub: 'שירותים, מוצרים, עדיפויות, הצעות' },
    { id: 'a3', label: '3', title: 'נכסים דיגיטליים', sub: 'אתר, דומיינים, דפי נחיתה, רשתות חברתיות' },
    { id: 'a4', label: '4', title: 'קהל יעד', sub: 'סגמנטים, פרופיל אידיאלי, קהל להימנע ממנו' },
    { id: 'a5', label: '5', title: 'מחקר מילות מפתח', sub: 'מילות מפתח, כוונות, נושאי ליבה, קטגוריות' },
    { id: 'a6', label: '6', title: 'מתחרים', sub: 'כרטיס מתחרה דינמי — לפחות אחד' },
    { id: 'a7', label: '7', title: 'קבצים ומדיה', sub: 'לוגו, תמונות, וידאו, מסמכים (mock upload)' },
    { id: 'a8', label: '8', title: 'מידע חופשי', sub: 'הערות, אסטרטגיה, הנחיות AI, בקשות מיוחדות' },
    { id: 'a9', label: '9', title: 'סיכום', sub: 'סיכום מובנה + checklist לפני אישור Gate-A' },
  ];

  var V2_STEPS = [
    { id: 'entry', label: 'חברות' },
    { id: 'onboarding', label: 'שלב א׳ — היכרות' },
    { id: 'assistants', label: 'שלב ב׳ — 50 עוזרים' },
  ];

  var SOCIAL_PLATFORMS = [
    { id: 'facebook', label: 'Facebook' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'gbp', label: 'Google Business' },
    { id: 'youtube', label: 'YouTube' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'telegram', label: 'Telegram' },
  ];

  var FILE_BUCKETS = [
    { id: 'logo', label: 'לוגו' },
    { id: 'images', label: 'תמונות' },
    { id: 'videos', label: 'וידאו' },
    { id: 'documents', label: 'מסמכים' },
    { id: 'catalogs', label: 'קטלוגים' },
    { id: 'brochures', label: 'חוברות' },
    { id: 'presentations', label: 'מצגות' },
    { id: 'marketingMaterials', label: 'חומרי שיווק' },
    { id: 'pdf', label: 'PDF' },
    { id: 'word', label: 'Word' },
  ];

  var CONN_OPTS = [
    { v: 'active', l: 'פעיל' },
    { v: 'mock', l: 'Mock' },
    { v: 'not_connected', l: 'לא מחובר' },
  ];

  var state = {
    client: null,
    obStep: 0,
    phase: 'entry',
    competitorsDraft: [],
    productsDraft: [],
    segmentsDraft: [],
    socialDraft: {},
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
    if (!el) return '';
    if (el.type === 'checkbox') return el.checked;
    return el.value.trim();
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

  function emptyComp() {
    return {
      id: 'comp-' + Date.now(),
      name: '', website: '', facebook: '', instagram: '', gbp: '', youtube: '', tiktok: '',
      strengths: '', weaknesses: '', keywords: '', audience: '', services: '',
      doesWell: '', doesPoorly: '', learnFrom: '', notes: '',
    };
  }

  function emptySegment() {
    return {
      id: 'seg-' + Date.now(),
      who: '', age: '', region: '', gender: '', interests: '', businessTypes: '',
      ideal: '', notTarget: '', painPoints: '', searchingFor: '', whyChooseUs: '',
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
        youtube: envComp(c, 'youtube') || '',
        tiktok: envComp(c, 'tiktok') || '',
        strengths: envComp(c, 'strengths'),
        weaknesses: envComp(c, 'weaknesses'),
        keywords: (envComp(c, 'keywords') || []).join ? (envComp(c, 'keywords') || []).join('\n') : envComp(c, 'keywords'),
        audience: envComp(c, 'audience') || '',
        services: envComp(c, 'services') || '',
        doesWell: envComp(c, 'doesWell') || '',
        doesPoorly: envComp(c, 'doesPoorly') || '',
        learnFrom: envComp(c, 'learnFrom'),
        notes: envComp(c, 'notes'),
      };
    });
    if (!state.competitorsDraft.length) state.competitorsDraft.push(emptyComp());
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

  function loadSegmentsDraft() {
    var segs = getVal('audience.segments') || [];
    if (!Array.isArray(segs) || !segs.length) {
      state.segmentsDraft = [emptySegment()];
      return;
    }
    state.segmentsDraft = segs.map(function (s) {
      return {
        id: s.id || 'seg-' + Math.random(),
        who: s.who || '', age: s.age || '', region: s.region || '', gender: s.gender || '',
        interests: s.interests || '', businessTypes: s.businessTypes || '',
        ideal: s.ideal || '', notTarget: s.notTarget || '', painPoints: s.painPoints || '',
        searchingFor: s.searchingFor || '', whyChooseUs: s.whyChooseUs || '',
      };
    });
  }

  function loadSocialDraft() {
    var list = getVal('assets.social') || [];
    if (!Array.isArray(list)) list = [];
    state.socialDraft = {};
    SOCIAL_PLATFORMS.forEach(function (p) {
      var found = list.filter(function (s) { return s && s.platform === p.id; })[0];
      state.socialDraft[p.id] = {
        url: found ? (found.url || '') : (p.id === 'gbp' ? getVal('assets.gbpUrl') : ''),
        connectionStatus: found ? (found.connectionStatus || 'not_connected') : 'not_connected',
        isActive: found ? !!found.isActive : false,
        wantToPromote: found ? !!found.wantToPromote : false,
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
        youtube: env(c.youtube.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
        tiktok: env(c.tiktok.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
        strengths: env(c.strengths.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
        weaknesses: env(c.weaknesses.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
        keywords: env(splitLines(c.keywords), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
        audience: env(c.audience.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
        services: env(c.services.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
        doesWell: env(c.doesWell.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
        doesPoorly: env(c.doesPoorly.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
        learnFrom: env(c.learnFrom.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
        notes: env(c.notes.trim(), { source: 'manual', status: 'missing', updatedBy: 'workflow-v2-ux' }),
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

  function saveSegmentsToBrief() {
    var segs = state.segmentsDraft.filter(function (s) { return s.who.trim() || s.ideal.trim(); }).map(function (s, idx) {
      return {
        id: s.id || 'seg-v2-' + idx,
        who: s.who.trim(), age: s.age.trim(), region: s.region.trim(), gender: s.gender.trim(),
        interests: s.interests.trim(), businessTypes: s.businessTypes.trim(),
        ideal: s.ideal.trim(), notTarget: s.notTarget.trim(), painPoints: s.painPoints.trim(),
        searchingFor: s.searchingFor.trim(), whyChooseUs: s.whyChooseUs.trim(),
      };
    });
    setField('audience.segments', segs);
  }

  function saveSocialToBrief() {
    var social = [];
    SOCIAL_PLATFORMS.forEach(function (p) {
      var d = state.socialDraft[p.id] || {};
      if (d.url) {
        social.push({
          platform: p.id,
          url: d.url,
          connectionStatus: d.connectionStatus || 'not_connected',
          isActive: !!d.isActive,
          wantToPromote: !!d.wantToPromote,
        });
      }
      if (p.id === 'gbp' && d.url) setField('assets.gbpUrl', d.url);
    });
    setField('assets.social', social);
  }

  function saveFilesToBrief() {
    FILE_BUCKETS.forEach(function (b) {
      if (state.fileDraft[b.id] && state.fileDraft[b.id].length) {
        setField('files.' + b.id, state.fileDraft[b.id]);
      }
    });
  }

  function syncStepDrafts(stepId) {
    if (stepId === 'a2') syncProductsFromDom();
    if (stepId === 'a3') syncSocialFromDom();
    if (stepId === 'a4') syncSegmentsFromDom();
    if (stepId === 'a6') syncCompetitorsFromDom();
  }

  function saveOnboardingFromForm() {
    syncStepDrafts(ONBOARDING_STEPS[state.obStep].id);

    setField('business.name', g('v2-biz-name'));
    setField('business.legalName', g('v2-biz-legal'));
    setField('business.sector', g('v2-biz-sector'));
    setField('business.shortDescription', g('v2-biz-short'));
    setField('business.summary', g('v2-biz-summary'));
    setField('business.story', g('v2-biz-story'));
    setField('business.yearsInBusiness', g('v2-biz-years'));
    setField('business.differentiator', g('v2-biz-diff'));
    setField('business.vision', g('v2-biz-vision'));
    setField('business.values', splitLines(g('v2-biz-values')));
    setField('business.advantages', splitLines(g('v2-biz-advantages')));
    setField('business.weaknesses', splitLines(g('v2-biz-weaknesses')));
    setField('business.strengths', splitLines(g('v2-biz-strengths')));
    setField('business.weakPoints', splitLines(g('v2-biz-weakpoints')));
    setField('goals.businessGoal', g('v2-biz-goal'));
    setField('goals.yearlyTargets', splitLines(g('v2-biz-targets')));
    setField('business.languages', splitLines(g('v2-biz-languages')));
    setField('business.regions', splitLines(g('v2-biz-regions')));
    setField('business.clientTypes', splitLines(g('v2-biz-client-types')));
    setField('business.businessHours', g('v2-biz-hours'));
    setField('business.contact.phone', g('v2-biz-phone'));
    setField('business.contact.email', g('v2-biz-email'));
    setField('business.contact.address', g('v2-biz-address'));
    setField('business.contact.whatsapp', g('v2-biz-whatsapp'));

    setField('services.list', splitLines(g('v2-svc-list')));
    setField('services.main', g('v2-svc-main'));
    setField('services.priority', splitLines(g('v2-svc-priority')));
    setField('services.profitable', splitLines(g('v2-svc-profitable')));
    setField('services.newServices', splitLines(g('v2-svc-new')));
    setField('services.toPromote', splitLines(g('v2-svc-promote')));
    setField('services.notToPromote', splitLines(g('v2-svc-notpromote')));
    setField('services.competitiveAdvantages', g('v2-svc-compadv'));
    setField('services.averagePrice', g('v2-svc-avgprice'));
    setField('services.specialOffers', splitLines(g('v2-svc-offers')));
    saveProductsToBrief();

    var website = g('v2-asset-website');
    setField('business.site', website);
    setField('assets.website', website);
    setField('assets.domains', splitLines(g('v2-asset-domains')));
    setField('assets.landingPages', splitLines(g('v2-asset-landing')));
    setField('assets.other', splitLines(g('v2-asset-other')));
    saveSocialToBrief();

    setField('audience.ideal', splitLines(g('v2-aud-ideal')));
    setField('audience.avoid', splitLines(g('v2-aud-avoid')));
    saveSegmentsToBrief();

    var fromClient = splitLines(g('v2-kw-from-client'));
    var approved = splitLines(g('v2-kw-approved'));
    setField('keywords.fromClient', fromClient);
    setField('keywords.approved', approved.length ? approved : fromClient);
    setField('keywords.toPromote', splitLines(g('v2-kw-promote')));
    setField('keywords.longTail', splitLines(g('v2-kw-longtail')));
    setField('keywords.local', splitLines(g('v2-kw-local')));
    setField('keywords.brand', splitLines(g('v2-kw-brand')));
    setField('keywords.customerQuestions', splitLines(g('v2-kw-questions')));
    setField('keywords.intentMap', splitLines(g('v2-kw-intent')));
    setField('keywords.coreTopics', splitLines(g('v2-kw-topics')));
    setField('keywords.categories', splitLines(g('v2-kw-categories')));

    saveCompetitorsToBrief();
    saveFilesToBrief();

    setField('freeContent.importantInfo', g('v2-free-important'));
    setField('freeContent.notes', g('v2-free-notes'));
    setField('freeContent.highlights', g('v2-free-highlights'));
    setField('freeContent.mustPromote', g('v2-free-promote'));
    setField('freeContent.mustNotDo', g('v2-free-notdo'));
    setField('freeContent.specialGoals', g('v2-free-goals'));
    setField('freeContent.ideas', g('v2-free-ideas'));
    setField('freeContent.strategy', g('v2-free-strategy'));
    setField('freeContent.specialRequests', g('v2-free-special'));
    setField('freeContent.aiMustKnow', g('v2-free-ai'));
    setField('freeContent.ownerFreeText', g('v2-free-owner'));
    setField('freeContent.managerNotes', g('v2-free-manager'));

    if (state.client) setField('meta.projectId', state.client.id);

    try {
      localStorage.setItem('dalia_biz', JSON.stringify({
        name: g('v2-biz-name'), company: g('v2-biz-name'), sector: g('v2-biz-sector'),
        site: website, mainService: g('v2-svc-main'), services: g('v2-svc-list'),
        ideal: g('v2-aud-ideal'), goal: g('v2-biz-goal'),
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
      if (el && val != null) {
        if (el.type === 'checkbox') el.checked = !!val;
        else el.value = Array.isArray(val) ? val.join('\n') : String(val);
      }
    };
    set('v2-biz-name', getVal('business.name'));
    set('v2-biz-legal', getVal('business.legalName'));
    set('v2-biz-sector', getVal('business.sector'));
    set('v2-biz-short', getVal('business.shortDescription'));
    set('v2-biz-summary', getVal('business.summary'));
    set('v2-biz-story', getVal('business.story'));
    set('v2-biz-years', getVal('business.yearsInBusiness'));
    set('v2-biz-diff', getVal('business.differentiator'));
    set('v2-biz-vision', getVal('business.vision'));
    set('v2-biz-values', getVal('business.values'));
    set('v2-biz-advantages', getVal('business.advantages'));
    set('v2-biz-weaknesses', getVal('business.weaknesses'));
    set('v2-biz-strengths', getVal('business.strengths'));
    set('v2-biz-weakpoints', getVal('business.weakPoints'));
    set('v2-biz-goal', getVal('goals.businessGoal'));
    set('v2-biz-targets', getVal('goals.yearlyTargets'));
    set('v2-biz-languages', getVal('business.languages'));
    set('v2-biz-regions', getVal('business.regions'));
    set('v2-biz-client-types', getVal('business.clientTypes'));
    set('v2-biz-hours', getVal('business.businessHours'));
    set('v2-biz-phone', getVal('business.contact.phone'));
    set('v2-biz-email', getVal('business.contact.email'));
    set('v2-biz-address', getVal('business.contact.address'));
    set('v2-biz-whatsapp', getVal('business.contact.whatsapp'));
    set('v2-svc-list', getVal('services.list'));
    set('v2-svc-main', getVal('services.main'));
    set('v2-svc-priority', getVal('services.priority'));
    set('v2-svc-profitable', getVal('services.profitable'));
    set('v2-svc-new', getVal('services.newServices'));
    set('v2-svc-promote', getVal('services.toPromote'));
    set('v2-svc-notpromote', getVal('services.notToPromote'));
    set('v2-svc-compadv', getVal('services.competitiveAdvantages'));
    set('v2-svc-avgprice', getVal('services.averagePrice'));
    set('v2-svc-offers', getVal('services.specialOffers'));
    set('v2-asset-website', getVal('assets.website') || getVal('business.site'));
    set('v2-asset-domains', getVal('assets.domains'));
    set('v2-asset-landing', getVal('assets.landingPages'));
    set('v2-asset-other', getVal('assets.other'));
    set('v2-aud-ideal', getVal('audience.ideal'));
    set('v2-aud-avoid', getVal('audience.avoid'));
    set('v2-kw-from-client', getVal('keywords.fromClient'));
    set('v2-kw-approved', getVal('keywords.approved'));
    set('v2-kw-promote', getVal('keywords.toPromote'));
    set('v2-kw-longtail', getVal('keywords.longTail'));
    set('v2-kw-local', getVal('keywords.local'));
    set('v2-kw-brand', getVal('keywords.brand'));
    set('v2-kw-questions', getVal('keywords.customerQuestions'));
    set('v2-kw-intent', getVal('keywords.intentMap'));
    set('v2-kw-topics', getVal('keywords.coreTopics'));
    set('v2-kw-categories', getVal('keywords.categories'));
    set('v2-free-important', getVal('freeContent.importantInfo'));
    set('v2-free-notes', getVal('freeContent.notes'));
    set('v2-free-highlights', getVal('freeContent.highlights'));
    set('v2-free-promote', getVal('freeContent.mustPromote'));
    set('v2-free-notdo', getVal('freeContent.mustNotDo'));
    set('v2-free-goals', getVal('freeContent.specialGoals'));
    set('v2-free-ideas', getVal('freeContent.ideas'));
    set('v2-free-strategy', getVal('freeContent.strategy'));
    set('v2-free-special', getVal('freeContent.specialRequests'));
    set('v2-free-ai', getVal('freeContent.aiMustKnow'));
    set('v2-free-owner', getVal('freeContent.ownerFreeText'));
    set('v2-free-manager', getVal('freeContent.managerNotes'));
    FILE_BUCKETS.forEach(function (b) {
      var files = getVal('files.' + b.id) || [];
      state.fileDraft[b.id] = Array.isArray(files) ? files.slice() : [];
    });
  }

  function renderBreadcrumb() {
    var el = document.getElementById('v2-breadcrumb');
    if (!el) return;
    var clientName = state.client ? state.client.name : '—';
    var phaseLabel = state.phase === 'entry' ? 'חברות ועסקים' : 'שלב א׳ — היכרות';
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
    var phaseIdx = { entry: 0, onboarding: 1, assistants: 2 }[state.phase] || 0;
    el.innerHTML = V2_STEPS.map(function (s, i) {
      var cls = i === phaseIdx ? 'active' : i < phaseIdx ? 'done' : '';
      var num = i < phaseIdx ? '✓' : (i + 1);
      return '<div class="v2-step ' + cls + '"><span class="v2-step-n">' + num + '</span>' + esc(s.label) + '</div>';
    }).join('');
  }

  function renderOnboardingStepper() {
    var el = document.getElementById('v2-ob-stepper');
    if (!el) return;
    el.innerHTML = ONBOARDING_STEPS.map(function (s, i) {
      var cls = i === state.obStep ? 'active' : i < state.obStep ? 'done' : '';
      var clickable = i <= state.obStep ? ' v2-ob-click' : '';
      return '<div class="v2-ob-step ' + cls + clickable + '" data-ob="' + i + '" title="' + esc(s.title) + '">' +
        '<span class="v2-ob-num">' + (i < state.obStep ? '✓' : s.label) + '</span>' +
        '<span class="v2-ob-lbl">' + esc(s.title) + '</span></div>';
    }).join('');
    el.querySelectorAll('.v2-ob-click').forEach(function (node) {
      node.addEventListener('click', function () {
        saveOnboardingFromForm();
        state.obStep = parseInt(node.getAttribute('data-ob'), 10);
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

  function selectBlock(label, id, options) {
    return '<div class="v2-fl"><label>' + esc(label) + '</label><select class="v2-sel" id="' + id + '">' +
      options.map(function (o) { return '<option value="' + esc(o.v) + '">' + esc(o.l) + '</option>'; }).join('') +
      '</select></div>';
  }

  function checkBlock(label, id) {
    return '<label class="v2-chk"><input type="checkbox" id="' + id + '"> ' + esc(label) + '</label>';
  }

  function socialPlatformHtml(p) {
    var pid = p.id;
    return '<div class="v2-dyn-card v2-social-card" data-platform="' + pid + '">' +
      '<div class="v2-subhead">' + esc(p.label) + '</div>' +
      fieldBlock('URL', 'v2-social-url-' + pid, 'input', 'https://') +
      selectBlock('סטטוס חיבור', 'v2-social-conn-' + pid, CONN_OPTS) +
      '<div class="v2-chk-row">' + checkBlock('פעיל', 'v2-social-active-' + pid) + checkBlock('רוצה לקדם', 'v2-social-promo-' + pid) + '</div></div>';
  }

  function onboardingPaneHtml(step) {
    var head = '<div class="v2-head"><div class="v2-head-part">שלב א׳ — היכרות · ' + esc(String(state.obStep + 1)) + '/9</div>' +
      '<div class="v2-head-t">' + esc(step.title) + '</div><div class="v2-head-s">' + esc(step.sub) + '</div></div>';
    switch (step.id) {
      case 'a1':
        return head + '<div class="v2-sec v2-card v2-g2">' +
          fieldBlock('שם העסק *', 'v2-biz-name', 'input') +
          fieldBlock('שם משפטי', 'v2-biz-legal', 'input') +
          fieldBlock('תחום *', 'v2-biz-sector', 'input') +
          fieldBlock('תיאור קצר', 'v2-biz-short', 'input') +
          '</div><div class="v2-sec v2-card">' +
          fieldBlock('סיכום העסק *', 'v2-biz-summary', 'textarea', '2–5 משפטים', 3) +
          fieldBlock('סיפור העסק', 'v2-biz-story', 'textarea', '', 3) +
          fieldBlock('שנות פעילות', 'v2-biz-years', 'input') +
          fieldBlock('מבדל', 'v2-biz-diff', 'input') +
          fieldBlock('חזון', 'v2-biz-vision', 'textarea', '', 2) +
          '</div><div class="v2-sec v2-card v2-g2">' +
          fieldBlock('ערכים (שורה לכל ערך)', 'v2-biz-values', 'textarea') +
          fieldBlock('יתרונות', 'v2-biz-advantages', 'textarea') +
          fieldBlock('חולשות', 'v2-biz-weaknesses', 'textarea') +
          fieldBlock('חוזקות', 'v2-biz-strengths', 'textarea') +
          fieldBlock('נקודות חולשה', 'v2-biz-weakpoints', 'textarea') +
          fieldBlock('מטרה עסקית', 'v2-biz-goal', 'input') +
          fieldBlock('יעדים שנתיים', 'v2-biz-targets', 'textarea') +
          fieldBlock('שפות', 'v2-biz-languages', 'textarea') +
          fieldBlock('אזורים', 'v2-biz-regions', 'textarea') +
          fieldBlock('סוגי לקוחות', 'v2-biz-client-types', 'textarea') +
          fieldBlock('שעות פעילות', 'v2-biz-hours', 'input') +
          '</div><div class="v2-sec v2-card v2-g2">' +
          fieldBlock('טלפון', 'v2-biz-phone', 'input') +
          fieldBlock('אימייל', 'v2-biz-email', 'input') +
          fieldBlock('כתובת', 'v2-biz-address', 'input') +
          fieldBlock('WhatsApp', 'v2-biz-whatsapp', 'input') +
          '</div>';
      case 'a2':
        return head + '<div class="v2-sec v2-card">' +
          fieldBlock('רשימת שירותים', 'v2-svc-list', 'textarea', 'שורה לכל שירות', 4) +
          fieldBlock('שירות מרכזי *', 'v2-svc-main', 'input') +
          fieldBlock('עדיפויות', 'v2-svc-priority', 'textarea') +
          fieldBlock('רווחיים', 'v2-svc-profitable', 'textarea') +
          fieldBlock('חדשים', 'v2-svc-new', 'textarea') +
          fieldBlock('לקידום', 'v2-svc-promote', 'textarea') +
          fieldBlock('לא לקדם', 'v2-svc-notpromote', 'textarea') +
          fieldBlock('יתרונות תחרותיים', 'v2-svc-compadv', 'textarea', '', 2) +
          fieldBlock('מחיר ממוצע', 'v2-svc-avgprice', 'input') +
          fieldBlock('הצעות מיוחדות', 'v2-svc-offers', 'textarea') +
          '</div><div class="v2-sec"><div class="v2-card" id="v2-products-wrap"></div>' +
          '<button type="button" class="v2-btn v2-btn-g" id="v2-add-product">+ הוסף מוצר</button></div>';
      case 'a3':
        return head + '<div class="v2-sec v2-card">' +
          fieldBlock('אתר', 'v2-asset-website', 'input', 'https://') +
          fieldBlock('דומיינים', 'v2-asset-domains', 'textarea', 'שורה לכל דומיין') +
          fieldBlock('דפי נחיתה', 'v2-asset-landing', 'textarea', 'שורה לכל URL') +
          fieldBlock('נכסים אחרים', 'v2-asset-other', 'textarea') +
          '</div><div class="v2-sec" id="v2-social-wrap"></div>';
      case 'a4':
        return head + '<div class="v2-sec v2-card v2-g2">' +
          fieldBlock('קהל אידיאלי (כללי)', 'v2-aud-ideal', 'textarea', 'שורה לכל פרופיל', 3) +
          fieldBlock('קהל להימנע ממנו', 'v2-aud-avoid', 'textarea', '', 2) +
          '</div><div class="v2-sec" id="v2-segments-wrap"></div>' +
          '<div class="v2-sec"><button type="button" class="v2-btn v2-btn-g" id="v2-add-segment">+ הוסף סגמנט</button></div>';
      case 'a5':
        return head + '<div class="v2-sec v2-card">' +
          fieldBlock('מילות מפתח מהלקוח', 'v2-kw-from-client', 'textarea', 'שורה לכל מילה', 4) +
          fieldBlock('מילות מאושרות', 'v2-kw-approved', 'textarea', 'שורה לכל מילה', 4) +
          fieldBlock('לקידום', 'v2-kw-promote', 'textarea') +
          fieldBlock('Long tail', 'v2-kw-longtail', 'textarea') +
          fieldBlock('מקומיות', 'v2-kw-local', 'textarea') +
          fieldBlock('מותג', 'v2-kw-brand', 'textarea') +
          fieldBlock('שאלות לקוחות', 'v2-kw-questions', 'textarea') +
          fieldBlock('כוונות (intent)', 'v2-kw-intent', 'textarea', 'מילה → כוונה') +
          fieldBlock('נושאי ליבה', 'v2-kw-topics', 'textarea') +
          fieldBlock('קטגוריות', 'v2-kw-categories', 'textarea') +
          '<button type="button" class="v2-btn v2-btn-g" id="v2-kw-mock">🔍 מילוי mock (10 מילים)</button></div>';
      case 'a6':
        return head + '<div class="v2-sec" id="v2-competitors-wrap"></div>' +
          '<div class="v2-sec"><button type="button" class="v2-btn v2-btn-g" id="v2-add-competitor">+ הוסף מתחרה</button></div>';
      case 'a7':
        return head + '<div class="v2-sec v2-card"><div class="v2-alt v2-alt-w">העלאה mock — קבצים נשמרים כ-metadata ב-Brief.</div>' +
          '<div id="v2-files-wrap"></div></div>';
      case 'a8':
        return head + '<div class="v2-sec v2-card">' +
          fieldBlock('מידע חשוב', 'v2-free-important', 'textarea', '', 4) +
          fieldBlock('הערות', 'v2-free-notes', 'textarea', '', 3) +
          fieldBlock('נקודות בולטות', 'v2-free-highlights', 'textarea', '', 3) +
          fieldBlock('חובה לקדם', 'v2-free-promote', 'textarea', '', 2) +
          fieldBlock('אסור לעשות', 'v2-free-notdo', 'textarea', '', 2) +
          fieldBlock('מטרות מיוחדות', 'v2-free-goals', 'textarea', '', 2) +
          fieldBlock('רעיונות', 'v2-free-ideas', 'textarea', '', 3) +
          fieldBlock('אסטרטגיה', 'v2-free-strategy', 'textarea', '', 3) +
          fieldBlock('בקשות מיוחדות', 'v2-free-special', 'textarea', '', 2) +
          fieldBlock('AI חייב לדעת', 'v2-free-ai', 'textarea', '', 3) +
          fieldBlock('טקסט חופשי (בעלים)', 'v2-free-owner', 'textarea', '', 4) +
          fieldBlock('הערות מנהל', 'v2-free-manager', 'textarea', '', 3) +
          '</div>';
      case 'a9':
        return head + '<div class="v2-sec"><div class="v2-card v2-brief-report" id="v2-brief-report"></div>' +
          '<div class="v2-card" id="v2-gate-a-checklist"></div>' +
          '<button type="button" class="v2-btn v2-btn-go" id="v2-btn-gate-a">✅ אשר ושמור ל-Project Brief</button></div>';
      default:
        return head;
    }
  }

  function renderProductsUI() {
    var wrap = document.getElementById('v2-products-wrap');
    if (!wrap) return;
    loadProductsDraft();
    wrap.innerHTML = '<div class="v2-subhead">מוצרים</div>' + state.productsDraft.map(function (p, i) {
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

  function renderSocialUI() {
    var wrap = document.getElementById('v2-social-wrap');
    if (!wrap) return;
    loadSocialDraft();
    wrap.innerHTML = SOCIAL_PLATFORMS.map(function (p) { return socialPlatformHtml(p); }).join('');
    SOCIAL_PLATFORMS.forEach(function (p) {
      var d = state.socialDraft[p.id] || {};
      var url = document.getElementById('v2-social-url-' + p.id);
      if (url) url.value = d.url || '';
      var conn = document.getElementById('v2-social-conn-' + p.id);
      if (conn) conn.value = d.connectionStatus || 'not_connected';
      var act = document.getElementById('v2-social-active-' + p.id);
      if (act) act.checked = !!d.isActive;
      var promo = document.getElementById('v2-social-promo-' + p.id);
      if (promo) promo.checked = !!d.wantToPromote;
    });
  }

  function syncSocialFromDom() {
    loadSocialDraft();
    SOCIAL_PLATFORMS.forEach(function (p) {
      state.socialDraft[p.id] = {
        url: g('v2-social-url-' + p.id),
        connectionStatus: g('v2-social-conn-' + p.id) || 'not_connected',
        isActive: g('v2-social-active-' + p.id),
        wantToPromote: g('v2-social-promo-' + p.id),
      };
    });
  }

  function renderSegmentsUI() {
    var wrap = document.getElementById('v2-segments-wrap');
    if (!wrap) return;
    loadSegmentsDraft();
    wrap.innerHTML = state.segmentsDraft.map(function (s, i) {
      return '<div class="v2-dyn-card v2-seg-card" data-seg-idx="' + i + '">' +
        '<div class="v2-subhead">סגמנט ' + (i + 1) + '</div>' +
        '<div class="v2-g2">' + fieldBlock('מי', 'v2-seg-who-' + i, 'input') + fieldBlock('גיל', 'v2-seg-age-' + i, 'input') + '</div>' +
        '<div class="v2-g2">' + fieldBlock('אזור', 'v2-seg-region-' + i, 'input') + fieldBlock('מגדר', 'v2-seg-gender-' + i, 'input') + '</div>' +
        fieldBlock('תחומי עניין', 'v2-seg-interests-' + i, 'textarea', '', 2) +
        fieldBlock('סוגי עסקים', 'v2-seg-btypes-' + i, 'textarea', '', 2) +
        fieldBlock('אידיאלי', 'v2-seg-ideal-' + i, 'textarea', '', 2) +
        fieldBlock('לא יעד', 'v2-seg-not-' + i, 'textarea', '', 2) +
        fieldBlock('נקודות כאב', 'v2-seg-pain-' + i, 'textarea', '', 2) +
        fieldBlock('מחפשים', 'v2-seg-search-' + i, 'textarea', '', 2) +
        fieldBlock('למה אנחנו', 'v2-seg-why-' + i, 'textarea', '', 2) +
        '<button type="button" class="v2-btn v2-btn-g v2-btn-sm v2-rm-seg" data-idx="' + i + '">הסר סגמנט</button></div>';
    }).join('');
    state.segmentsDraft.forEach(function (s, i) {
      var map = {
        who: 'v2-seg-who-', age: 'v2-seg-age-', region: 'v2-seg-region-', gender: 'v2-seg-gender-',
        interests: 'v2-seg-interests-', businessTypes: 'v2-seg-btypes-', ideal: 'v2-seg-ideal-',
        notTarget: 'v2-seg-not-', painPoints: 'v2-seg-pain-', searchingFor: 'v2-seg-search-', whyChooseUs: 'v2-seg-why-',
      };
      Object.keys(map).forEach(function (k) {
        var el = document.getElementById(map[k] + i);
        if (el) el.value = s[k] || '';
      });
    });
    wrap.querySelectorAll('.v2-rm-seg').forEach(function (btn) {
      btn.onclick = function () {
        syncSegmentsFromDom();
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        if (state.segmentsDraft.length <= 1) state.segmentsDraft[0] = emptySegment();
        else state.segmentsDraft.splice(idx, 1);
        renderSegmentsUI();
      };
    });
  }

  function syncSegmentsFromDom() {
    state.segmentsDraft.forEach(function (s, i) {
      s.who = g('v2-seg-who-' + i);
      s.age = g('v2-seg-age-' + i);
      s.region = g('v2-seg-region-' + i);
      s.gender = g('v2-seg-gender-' + i);
      s.interests = g('v2-seg-interests-' + i);
      s.businessTypes = g('v2-seg-btypes-' + i);
      s.ideal = g('v2-seg-ideal-' + i);
      s.notTarget = g('v2-seg-not-' + i);
      s.painPoints = g('v2-seg-pain-' + i);
      s.searchingFor = g('v2-seg-search-' + i);
      s.whyChooseUs = g('v2-seg-why-' + i);
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
        '<div class="v2-g2">' + fieldBlock('אתר', 'v2-comp-web-' + i, 'input') + fieldBlock('Facebook', 'v2-comp-fb-' + i, 'input') + '</div>' +
        '<div class="v2-g2">' + fieldBlock('Instagram', 'v2-comp-ig-' + i, 'input') + fieldBlock('GBP', 'v2-comp-gbp-' + i, 'input') + '</div>' +
        '<div class="v2-g2">' + fieldBlock('YouTube', 'v2-comp-yt-' + i, 'input') + fieldBlock('TikTok', 'v2-comp-tiktok-' + i, 'input') + '</div>' +
        fieldBlock('חוזקות', 'v2-comp-str-' + i, 'textarea', '', 2) +
        fieldBlock('חולשות', 'v2-comp-weak-' + i, 'textarea', '', 2) +
        fieldBlock('מילות מפתח', 'v2-comp-kw-' + i, 'textarea') +
        fieldBlock('קהל', 'v2-comp-aud-' + i, 'textarea', '', 2) +
        fieldBlock('שירותים', 'v2-comp-svc-' + i, 'textarea', '', 2) +
        fieldBlock('עושה טוב', 'v2-comp-well-' + i, 'textarea', '', 2) +
        fieldBlock('עושה גרוע', 'v2-comp-poor-' + i, 'textarea', '', 2) +
        fieldBlock('מה ללמוד', 'v2-comp-learn-' + i, 'textarea', '', 2) +
        fieldBlock('הערות', 'v2-comp-notes-' + i, 'textarea', '', 2) +
        '<button type="button" class="v2-btn v2-btn-g v2-btn-sm v2-rm-comp" data-idx="' + i + '">הסר מתחרה</button></div>';
    }).join('');
    state.competitorsDraft.forEach(function (c, i) {
      var map = {
        name: 'v2-comp-name-', website: 'v2-comp-web-', facebook: 'v2-comp-fb-', instagram: 'v2-comp-ig-',
        gbp: 'v2-comp-gbp-', youtube: 'v2-comp-yt-', tiktok: 'v2-comp-tiktok-', strengths: 'v2-comp-str-',
        weaknesses: 'v2-comp-weak-', keywords: 'v2-comp-kw-', audience: 'v2-comp-aud-', services: 'v2-comp-svc-',
        doesWell: 'v2-comp-well-', doesPoorly: 'v2-comp-poor-', learnFrom: 'v2-comp-learn-', notes: 'v2-comp-notes-',
      };
      Object.keys(map).forEach(function (k) {
        var el = document.getElementById(map[k] + i);
        if (el) el.value = c[k] || '';
      });
    });
    wrap.querySelectorAll('.v2-rm-comp').forEach(function (btn) {
      btn.onclick = function () {
        syncCompetitorsFromDom();
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        if (state.competitorsDraft.length <= 1) state.competitorsDraft[0] = emptyComp();
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
      c.youtube = g('v2-comp-yt-' + i);
      c.tiktok = g('v2-comp-tiktok-' + i);
      c.strengths = g('v2-comp-str-' + i);
      c.weaknesses = g('v2-comp-weak-' + i);
      c.keywords = g('v2-comp-kw-' + i);
      c.audience = g('v2-comp-aud-' + i);
      c.services = g('v2-comp-svc-' + i);
      c.doesWell = g('v2-comp-well-' + i);
      c.doesPoorly = g('v2-comp-poor-' + i);
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
        '<input type="file" class="v2-file-inp" data-bucket="' + b.id + '" multiple>' +
        '<div class="v2-file-list">' + list + '</div></div>';
    }).join('');
    wrap.querySelectorAll('.v2-file-inp').forEach(function (inp) {
      inp.onchange = function () {
        var bucket = inp.getAttribute('data-bucket');
        var files = inp.files;
        if (!files || !files.length) return;
        if (!state.fileDraft[bucket]) state.fileDraft[bucket] = [];
        Array.prototype.forEach.call(files, function (file) {
          state.fileDraft[bucket].push({ name: file.name, type: file.type, size: file.size, mock: true });
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
    el.innerHTML =
      section('פרטי עסק', '<b>' + esc(ev(brief.business.name) || '—') + '</b> · ' + esc(ev(brief.business.sector) || '—') +
        '<br>' + esc(ev(brief.business.summary) || '—')) +
      section('שירותים ומוצרים', 'שירות מרכזי: ' + esc(ev(brief.services.main) || '—') +
        '<br>מוצרים: ' + (brief.products || []).length) +
      section('נכסים דיגיטליים', 'אתר: ' + esc(ev(brief.assets.website) || '—')) +
      section('קהל, מילות מפתח, מתחרים',
        'קהל: ' + list(ev(brief.audience.ideal)) +
        '<br>מילות מפתח: ' + list(ev(brief.keywords.approved) || ev(brief.keywords.fromClient)) +
        '<br>מתחרים: ' + list(comps));
  }

  function goToAssistantsAfterGateA() {
    try { localStorage.setItem('coco-v2-skip-gates-assistants-v1', 'true'); } catch (e) { /* ignore */ }
    state.phase = 'assistants';
    document.getElementById('coco-v2-app').style.display = 'none';
    document.body.classList.remove('coco-v2-mode');
    renderTopStepper();
    if (typeof window.refreshProjectBrief === 'function') refreshProjectBrief('gate-a');
    setFooter('✅ Gate-A אושר — עוברים לשלב ב׳ (50 עוזרים)');
    setTimeout(function () {
      var dj = document.getElementById('dj-app');
      if (dj) dj.scrollIntoView({ behavior: 'smooth' });
      if (typeof window.showStage === 'function') window.showStage(0);
    }, 350);
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
        goToAssistantsAfterGateA();
      };
    }
  }

  function wireStepInputs() {
    var pane = document.getElementById('v2-pane-onboarding');
    if (!pane) return;
    pane.querySelectorAll('input, textarea, select').forEach(function (el) {
      if (el.id && (el.id.indexOf('v2-comp-') === 0 || el.id.indexOf('v2-prod-') === 0 ||
          el.id.indexOf('v2-seg-') === 0 || el.id.indexOf('v2-social-') === 0)) return;
      el.addEventListener('change', function () { saveOnboardingFromForm(); });
    });
  }

  function updateFooterButtons() {
    var isLast = state.obStep >= ONBOARDING_STEPS.length - 1;
    var backBtn = document.getElementById('v2-btn-back');
    var saveBtn = document.getElementById('v2-btn-save-step');
    var nextBtn = document.getElementById('v2-btn-next');
    if (backBtn) {
      backBtn.textContent = 'הקודם →';
      backBtn.disabled = state.obStep <= 0 && state.phase === 'onboarding';
    }
    if (saveBtn) saveBtn.textContent = 'שמור והמשך';
    if (nextBtn) {
      nextBtn.style.display = isLast ? 'none' : 'inline-flex';
      nextBtn.textContent = 'שמור והמשך ←';
    }
  }

  function renderOnboardingPane() {
    var pane = document.getElementById('v2-pane-onboarding');
    if (!pane) return;
    var step = ONBOARDING_STEPS[state.obStep];
    pane.innerHTML = '<div class="v2-ob-stepper-wrap"><div class="v2-ob-stepper" id="v2-ob-stepper"></div></div>' +
      '<div class="v2-ob-panel">' + onboardingPaneHtml(step) + '</div>';
    hydrateFormFromBrief();
    renderOnboardingStepper();
    if (step.id === 'a2') {
      renderProductsUI();
      var addProd = document.getElementById('v2-add-product');
      if (addProd) addProd.onclick = function () {
        syncProductsFromDom();
        state.productsDraft.push({ id: 'prod-' + Date.now(), name: '', description: '', price: '', category: '' });
        renderProductsUI();
      };
    }
    if (step.id === 'a3') renderSocialUI();
    if (step.id === 'a4') {
      renderSegmentsUI();
      var addSeg = document.getElementById('v2-add-segment');
      if (addSeg) addSeg.onclick = function () {
        syncSegmentsFromDom();
        state.segmentsDraft.push(emptySegment());
        renderSegmentsUI();
      };
    }
    if (step.id === 'a5') {
      var mockBtn = document.getElementById('v2-kw-mock');
      if (mockBtn) mockBtn.onclick = function () {
        var kw = ['ניהול צי רכב', 'מערכת GPS לרכב', 'Fleet management', 'תחזוקת צי', 'ביטוח צי', 'ניהול רכב חברה', 'מעקב רכבים', 'FleetOS', 'חיסכון בעלויות צי', 'ניהול צי עסקי'];
        document.getElementById('v2-kw-from-client').value = kw.join('\n');
        document.getElementById('v2-kw-approved').value = kw.join('\n');
        saveOnboardingFromForm();
      };
    }
    if (step.id === 'a6') {
      renderCompetitorsUI();
      var addComp = document.getElementById('v2-add-competitor');
      if (addComp) addComp.onclick = function () {
        syncCompetitorsFromDom();
        state.competitorsDraft.push(emptyComp());
        renderCompetitorsUI();
      };
    }
    if (step.id === 'a7') renderFilesUI();
    if (step.id === 'a9') renderGateAChecklist();
    wireStepInputs();
    updateFooterButtons();
  }

  function renderCompaniesPane() {
    var pane = document.getElementById('v2-pane-entry');
    if (!pane) return;
    pane.innerHTML =
      '<div class="v2-head"><div class="v2-head-part">ניהול שיווק › חברות ועסקים</div>' +
      '<div class="v2-head-t">בחר לקוח / פתיחת לקוח</div>' +
      '<div class="v2-head-s">בחר עסק קיים כדי להיכנס לשלב א׳ — היכרות (9 טאבים).</div></div>' +
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
    var next = document.getElementById('v2-btn-next');
    if (next) next.disabled = phase === 'entry' && !state.client;
  }

  function onSaveStep() {
    if (state.phase !== 'onboarding') return;
    syncStepDrafts(ONBOARDING_STEPS[state.obStep].id);
    saveOnboardingFromForm();
    if (state.obStep < ONBOARDING_STEPS.length - 1) {
      state.obStep++;
      renderOnboardingPane();
    }
    setFooter('✓ נשמר');
  }

  function onNext() {
    if (state.phase === 'entry') {
      if (!state.client) { setFooter('בחר לקוח קודם'); return; }
      goPhase('onboarding');
      return;
    }
    if (state.phase === 'onboarding') {
      onSaveStep();
    }
  }

  function onBack() {
    if (state.phase === 'onboarding' && state.obStep > 0) {
      syncStepDrafts(ONBOARDING_STEPS[state.obStep].id);
      saveOnboardingFromForm();
      state.obStep--;
      renderOnboardingPane();
      return;
    }
    if (state.phase === 'onboarding') goPhase('entry');
  }

  function buildShell() {
    if (document.getElementById('coco-v2-app')) return;
    var root = document.createElement('div');
    root.id = 'coco-v2-app';
    root.className = 'v2-active';
    root.innerHTML =
      '<div class="v2-brandbar"><div class="logo"><span>CO.CO</span> <em>דליה</em></div>' +
      '<span class="v2-badge">Workflow V2 · Stage א׳ — 9 טאבים</span>' +
      '<a href="' + esc(platformUrl('?flow=legacy')) + '" style="font-size:11px;color:#94a3b8;">← ניהול שיווק</a></div>' +
      '<nav class="v2-breadcrumb" id="v2-breadcrumb"></nav>' +
      '<div class="v2-stepper-wrap"><div class="v2-stepper" id="v2-top-stepper"></div></div>' +
      '<div class="v2-alt v2-alt-i">שלב א׳: 9 טאבים → Gate-A → שלב ב׳ (50 עוזרים). קמפיין picker מדולג ב-UX זה.</div>' +
      '<div class="v2-main">' +
      '<div class="v2-pane on" id="v2-pane-entry"></div>' +
      '<div class="v2-pane" id="v2-pane-onboarding"></div>' +
      '</div>' +
      '<div class="v2-footer">' +
      '<button type="button" class="v2-btn v2-btn-g" id="v2-btn-back">הקודם →</button>' +
      '<button type="button" class="v2-btn v2-btn-g" id="v2-btn-save-step">שמור והמשך</button>' +
      '<div class="v2-finfo" id="v2-finfo">בחר לקוח להתחלה</div>' +
      '<button type="button" class="v2-btn v2-btn-p" id="v2-btn-next" disabled>פתח לקוח ←</button></div>';
    document.body.insertBefore(root, document.body.firstChild);
    document.getElementById('v2-btn-next').addEventListener('click', onNext);
    document.getElementById('v2-btn-back').addEventListener('click', onBack);
    document.getElementById('v2-btn-save-step').addEventListener('click', onSaveStep);
  }

  function resumeFromState() {
    var skipAssistants = false;
    try { skipAssistants = localStorage.getItem('coco-v2-skip-gates-assistants-v1') === 'true'; } catch (e) { /* ignore */ }
    if (skipAssistants && window.ProjectBrief && ProjectBrief.isGateAApproved()) {
      goToAssistantsAfterGateA();
      return;
    }
    if (window.ProjectBrief && ProjectBrief.isGateAApproved()) {
      state.phase = 'onboarding';
      state.obStep = ONBOARDING_STEPS.length - 1;
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
    if (qs('stage') === 'onboarding') state.phase = 'onboarding';
    resumeFromState();
    window.CocoWorkflowV2 = {
      goPhase: goPhase,
      isActive: function () { return true; },
      state: state,
      saveOnboardingFromForm: saveOnboardingFromForm,
      goToAssistantsAfterGateA: goToAssistantsAfterGateA,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
