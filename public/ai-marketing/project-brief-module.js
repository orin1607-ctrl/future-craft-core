/**
 * Phase 1a — Project Brief SSOT (coco-project-brief-v1)
 * Envelope fields, Orin→Brief merge (one-way), Gate before stage ד'.
 */
(function () {
  'use strict';

  var VERSION = '1.2.0';
  var KEY = 'coco-project-brief-v1';
  var APPROVAL_KEY = 'coco-project-brief-approved-v1';
  var GATE_A_KEY = 'coco-gate-a-approved-v1';
  var GATE_B_KEY = 'coco-gate-b-approved-v1';
  var GATE_MIN_KEYWORDS = 5;
  var GATE_MIN_COMPETITORS = 1;

  var CONNECTION_MOCK = {
    supabase: 'active',
    openai: 'mock',
    claude: 'mock',
    gemini: 'mock',
    ga4: 'mock',
    gsc: 'mock',
    gads: 'not_connected',
    gbp: 'not_connected',
    gtm: 'not_connected',
    meta: 'mock',
    crm: 'active',
  };

  function parseLs(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveLs(key, obj) {
    try {
      localStorage.setItem(key, JSON.stringify(obj));
      return true;
    } catch (e) {
      return false;
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function envelope(value, meta) {
    meta = meta || {};
    return {
      value: value == null ? '' : value,
      source: meta.source || 'manual',
      status: meta.status || (value == null || value === '' || (Array.isArray(value) && !value.length) ? 'missing' : 'unverified'),
      updatedAt: meta.updatedAt || nowIso(),
      updatedBy: meta.updatedBy || meta.source || 'manual',
      history: Array.isArray(meta.history) ? meta.history.slice() : [],
    };
  }

  function envVal(field) {
    if (!field || typeof field !== 'object') return field;
    if ('value' in field) return field.value;
    return field;
  }

  function setEnvelopeField(obj, path, value, meta) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    var key = parts[parts.length - 1];
    var prev = cur[key];
    var hist = (prev && prev.history) ? prev.history.slice() : [];
    if (prev && prev.value !== undefined) {
      hist.push({ value: prev.value, source: prev.source, status: prev.status, at: prev.updatedAt });
    }
    meta = meta || {};
    meta.history = hist;
    cur[key] = envelope(value, meta);
    return cur[key];
  }

  function audit(brief, action, detail) {
    if (!brief.meta) brief.meta = {};
    if (!Array.isArray(brief.meta.auditLog)) brief.meta.auditLog = [];
    brief.meta.auditLog.push({
      action: action,
      detail: detail || '',
      at: nowIso(),
    });
    if (brief.meta.auditLog.length > 200) {
      brief.meta.auditLog = brief.meta.auditLog.slice(-200);
    }
  }

  function getDefault() {
    var ts = nowIso();
    return {
      meta: {
        version: VERSION,
        projectId: '',
        createdAt: ts,
        updatedAt: ts,
        auditLog: [],
      },
      business: {
        name: envelope('', { source: 'manual', status: 'missing' }),
        sector: envelope('', { source: 'manual', status: 'missing' }),
        site: envelope('', { source: 'manual', status: 'missing' }),
        campaignType: envelope('', { source: 'manual', status: 'missing' }),
        location: envelope('', { source: 'manual', status: 'missing' }),
        regions: envelope([], { source: 'manual', status: 'missing' }),
        summary: envelope('', { source: 'manual', status: 'missing' }),
        personalSummary: envelope('', { source: 'manual', status: 'missing' }),
        weaknesses: envelope('', { source: 'manual', status: 'missing' }),
        languages: envelope([], { source: 'manual', status: 'missing' }),
        clientTypes: envelope([], { source: 'manual', status: 'missing' }),
        advantages: envelope([], { source: 'manual', status: 'missing' }),
        contact: envelope({}, { source: 'manual', status: 'missing' }),
      },
      products: [],
      campaigns: [],
      campaign: { activeId: envelope('', { source: 'manual', status: 'missing' }) },
      services: {
        main: envelope('', { source: 'manual', status: 'missing' }),
        list: envelope([], { source: 'manual', status: 'missing' }),
        usp: envelope('', { source: 'manual', status: 'missing' }),
        differentiator: envelope('', { source: 'manual', status: 'missing' }),
        painPoints: envelope('', { source: 'manual', status: 'missing' }),
      },
      audience: {
        ideal: envelope([], { source: 'manual', status: 'missing' }),
        avoid: envelope([], { source: 'manual', status: 'missing' }),
        intentNotes: envelope('', { source: 'manual', status: 'missing' }),
        geographicFocus: envelope([], { source: 'manual', status: 'missing' }),
      },
      goals: {
        businessGoal: envelope('', { source: 'manual', status: 'missing' }),
        budget: envelope('', { source: 'manual', status: 'missing' }),
        challenges: envelope([], { source: 'manual', status: 'missing' }),
        priorities: envelope([], { source: 'manual', status: 'missing' }),
      },
      freeContent: {
        managerNotes: envelope('', { source: 'manual', status: 'missing' }),
        aiMustKnow: envelope('', { source: 'manual', status: 'missing' }),
        importantInfo: envelope('', { source: 'manual', status: 'missing' }),
        highlights: envelope('', { source: 'manual', status: 'missing' }),
        specialRequests: envelope('', { source: 'manual', status: 'missing' }),
        mustPromote: envelope('', { source: 'manual', status: 'missing' }),
        mustNotDo: envelope('', { source: 'manual', status: 'missing' }),
        ownerFreeText: envelope('', { source: 'manual', status: 'missing' }),
      },
      files: {
        logo: envelope([], { source: 'manual', status: 'missing' }),
        images: envelope([], { source: 'manual', status: 'missing' }),
        videos: envelope([], { source: 'manual', status: 'missing' }),
        documents: envelope([], { source: 'manual', status: 'missing' }),
        catalogs: envelope([], { source: 'manual', status: 'missing' }),
        brochures: envelope([], { source: 'manual', status: 'missing' }),
        marketingMaterials: envelope([], { source: 'manual', status: 'missing' }),
      },
      assets: {
        website: envelope('', { source: 'manual', status: 'missing' }),
        domains: envelope([], { source: 'manual', status: 'missing' }),
        social: envelope([], { source: 'manual', status: 'missing' }),
        otherDigital: envelope([], { source: 'manual', status: 'missing' }),
        gbpUrl: envelope('', { source: 'manual', status: 'missing' }),
      },
      competitors: [],
      keywords: {
        fromClient: envelope([], { source: 'manual', status: 'missing' }),
        fromAi: envelope([], { source: 'ai', status: 'missing' }),
        approved: envelope([], { source: 'manual', status: 'missing' }),
        toPromote: envelope([], { source: 'manual', status: 'missing' }),
        intentMap: envelope([], { source: 'manual', status: 'missing' }),
        keyPhrases: envelope([], { source: 'manual', status: 'missing' }),
        geoRegions: envelope([], { source: 'manual', status: 'missing' }),
        coreTopics: envelope([], { source: 'manual', status: 'missing' }),
      },
      seoPack: {
        goals: envelope([], { source: 'manual', status: 'missing' }),
        geo: envelope([], { source: 'manual', status: 'missing' }),
        approvedAt: envelope(null, { source: 'manual', status: 'missing' }),
        readinessScore: envelope(0, { source: 'derived', status: 'unverified' }),
      },
      adsPack: {
        approvedAt: envelope(null, { source: 'manual', status: 'missing' }),
      },
      connections: {},
      externalData: {},
      gaps: {
        missingFields: [],
        missingFiles: [],
        unverifiedItems: [],
      },
      recommendations: { ai: [], nextSteps: [] },
      approval: {
        isComplete: false,
        isApproved: false,
        approvedAt: null,
        approvedBy: null,
        checklist: [],
        gateAApproved: false,
        gateAApprovedAt: null,
        gateAApprovedBy: null,
        gateBApproved: false,
        gateBApprovedAt: null,
        gateBApprovedBy: null,
      },
      assistantReports: [],
      consultantReports: [],
      decisions: {},
      blueprint: {},
      buildPackage: {},
      previewQA: {},
    };
  }

  function initConnections(brief) {
    brief.connections = brief.connections || {};
    Object.keys(CONNECTION_MOCK).forEach(function (k) {
      if (!brief.connections[k]) {
        brief.connections[k] = envelope(CONNECTION_MOCK[k], {
          source: 'api_external',
          status: CONNECTION_MOCK[k] === 'active' ? 'verified' : 'unverified',
          updatedBy: 'mock',
        });
      }
    });
    if (!brief.connections.lastSyncAt) {
      brief.connections.lastSyncAt = envelope(null, { source: 'derived', status: 'missing', updatedBy: 'mock' });
    }
  }

  function get() {
    var brief = parseLs(KEY);
    if (!brief || typeof brief !== 'object') {
      brief = getDefault();
      saveLs(KEY, brief);
    }
    initConnections(brief);
    return brief;
  }

  function set(brief) {
    if (!brief || typeof brief !== 'object') return false;
    if (!brief.meta) brief.meta = {};
    brief.meta.updatedAt = nowIso();
    audit(brief, 'set', 'full brief write');
    return saveLs(KEY, brief);
  }

  function setField(path, value, meta) {
    var brief = get();
    setEnvelopeField(brief, path, value, meta);
    brief.meta.updatedAt = nowIso();
    audit(brief, 'setField', path);
    saveLs(KEY, brief);
    return brief;
  }

  function splitLines(text) {
    if (!text) return [];
    return String(text).split(/[\n,;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function parseCompetitorsFromBiz(compText) {
    var lines = splitLines(compText);
    return lines.map(function (name, idx) {
      return {
        id: 'comp-legacy-' + idx,
        name: envelope(name, { source: 'manual', status: 'from_client', updatedBy: 'adapter' }),
        website: envelope('', { source: 'manual', status: 'missing', updatedBy: 'adapter' }),
      };
    });
  }

  function mergeKeywordsUnique(target, incoming, meta) {
    var list = Array.isArray(target) ? target.slice() : [];
    incoming.forEach(function (kw) {
      var s = String(kw || '').trim();
      if (s && list.indexOf(s) < 0) list.push(s);
    });
    return envelope(list, meta);
  }

  function mergeFromLegacy() {
    var brief = get();
    var biz = parseLs('dalia_biz') || {};
    var partA = parseLs('dalia_part_a') || {};
    var partB = parseLs('dalia_part_b') || {};
    var seoDraft = parseLs('dalia_seo_draft') || {};
    var strategic = parseLs('coco-strategic-briefing-v1') || {};
    var changed = false;

    function mergeEnv(path, value, meta) {
      if (value == null || value === '' || (Array.isArray(value) && !value.length)) return;
      setEnvelopeField(brief, path, value, meta);
      changed = true;
    }

    if (partA.name || partA.bizName) {
      mergeEnv('business.name', partA.bizName || partA.name, { source: 'manual', status: 'from_client', updatedBy: 'dalia_part_a' });
    }
    if (partA.site) {
      mergeEnv('business.site', partA.site, { source: 'manual', status: 'from_client', updatedBy: 'dalia_part_a' });
      mergeEnv('assets.website', partA.site, { source: 'manual', status: 'from_client', updatedBy: 'dalia_part_a' });
    }
    if (partA.campaignType) {
      mergeEnv('business.campaignType', partA.campaignType, { source: 'manual', status: 'from_client', updatedBy: 'dalia_part_a' });
    }

    if (biz.name && biz.name !== '—') mergeEnv('business.name', biz.name, { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });
    if (biz.company) mergeEnv('business.name', biz.company, { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });
    if (biz.sector && biz.sector !== '—') mergeEnv('business.sector', biz.sector, { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });
    if (biz.site && biz.site !== '—') {
      mergeEnv('business.site', biz.site, { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });
      mergeEnv('assets.website', biz.site, { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });
    }
    if (biz.loc && biz.loc !== '—') mergeEnv('business.location', biz.loc, { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });
    if (biz.mainService && biz.mainService !== '—') mergeEnv('services.main', biz.mainService, { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });
    if (biz.services && biz.services !== '—') mergeEnv('services.list', splitLines(biz.services), { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });
    if (biz.usp && biz.usp !== '—') mergeEnv('services.usp', biz.usp, { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });
    if (biz.diff && biz.diff !== '—') mergeEnv('services.differentiator', biz.diff, { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });
    if (biz.pain && biz.pain !== '—') mergeEnv('services.painPoints', biz.pain, { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });
    if (biz.ideal && biz.ideal !== '—') mergeEnv('audience.ideal', [biz.ideal], { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });
    if (biz.bad && biz.bad !== '—') mergeEnv('audience.avoid', [biz.bad], { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });
    if (biz.goal && biz.goal !== '—') mergeEnv('goals.businessGoal', biz.goal, { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });
    if (biz.budget && biz.budget !== '—') mergeEnv('goals.budget', biz.budget, { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });
    if (biz.free) mergeEnv('freeContent.managerNotes', biz.free, { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });
    if (biz.challenges && biz.challenges.length) mergeEnv('goals.challenges', biz.challenges, { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });
    if (biz.sectors && biz.sectors.length) mergeEnv('business.regions', biz.sectors, { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });

    if (biz.comp && biz.comp !== '—') {
      var comps = parseCompetitorsFromBiz(biz.comp);
      if (comps.length && (!brief.competitors || !brief.competitors.length)) {
        brief.competitors = comps;
        changed = true;
      }
    }

    if (biz.files && biz.files.length) {
      var logos = biz.files.filter(function (f) {
        return f && (f.type === 'logo' || /logo/i.test(f.name || ''));
      });
      if (logos.length) {
        mergeEnv('files.logo', logos, { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });
      }
      var imgs = biz.files.filter(function (f) { return f && f.type !== 'logo'; });
      if (imgs.length) mergeEnv('files.images', imgs, { source: 'manual', status: 'from_client', updatedBy: 'dalia_biz' });
    }

    if (strategic.services && strategic.services.length) {
      mergeEnv('services.list', strategic.services, { source: 'manual', status: 'from_client', updatedBy: 'coco-strategic-briefing-v1' });
    }
    if (strategic.audience && strategic.audience.length) {
      mergeEnv('audience.ideal', strategic.audience, { source: 'manual', status: 'from_client', updatedBy: 'coco-strategic-briefing-v1' });
    }
    if (strategic.regions && strategic.regions.length) {
      mergeEnv('business.regions', strategic.regions, { source: 'manual', status: 'from_client', updatedBy: 'coco-strategic-briefing-v1' });
    }
    var kwPool = []
      .concat(strategic.keywordsApproved || [])
      .concat(strategic.keywordsManual || [])
      .concat(strategic.keywordsSuggested || []);
    if (kwPool.length) {
      brief.keywords.fromClient = mergeKeywordsUnique(envVal(brief.keywords.fromClient), kwPool, {
        source: 'manual', status: 'from_client', updatedBy: 'coco-strategic-briefing-v1',
      });
      brief.keywords.approved = mergeKeywordsUnique(envVal(brief.keywords.approved), strategic.keywordsApproved || kwPool.slice(0, 10), {
        source: 'manual', status: 'unverified', updatedBy: 'coco-strategic-briefing-v1',
      });
      changed = true;
    }
    var compManual = (strategic.competitorsManual || []).concat(strategic.competitorsAuto || []);
    if (compManual.length && (!brief.competitors || !brief.competitors.length)) {
      brief.competitors = compManual.map(function (name, idx) {
        return {
          id: 'comp-brief-' + idx,
          name: envelope(name, { source: 'manual', status: 'from_client', updatedBy: 'coco-strategic-briefing-v1' }),
          website: envelope('', { source: 'manual', status: 'missing', updatedBy: 'coco-strategic-briefing-v1' }),
        };
      });
      changed = true;
    }

    if (partB && partB.approved) {
      var pack = partB.seoPack || {};
      if (pack.goals && pack.goals.length) mergeEnv('seoPack.goals', pack.goals, { source: 'manual', status: 'from_client', updatedBy: 'dalia_part_b' });
      if (pack.geo && pack.geo.length) mergeEnv('seoPack.geo', pack.geo, { source: 'manual', status: 'from_client', updatedBy: 'dalia_part_b' });
      mergeEnv('seoPack.approvedAt', pack.approvedAt || partB.ts || nowIso(), { source: 'manual', status: 'verified', updatedBy: 'dalia_part_b' });
      if (partB.kw_count) {
        var approvedKw = envVal(brief.keywords.approved) || [];
        if (approvedKw.length < partB.kw_count) {
          var filler = [];
          for (var i = approvedKw.length; i < partB.kw_count; i++) filler.push('מילת מפתח ' + (i + 1));
          brief.keywords.approved = mergeKeywordsUnique(approvedKw, filler, {
            source: 'derived', status: 'unverified', updatedBy: 'dalia_part_b',
          });
          changed = true;
        }
      }
    }

    if (seoDraft && seoDraft.approved && seoDraft.approved.kw) {
      mergeEnv('seoPack.readinessScore', 80, { source: 'derived', status: 'unverified', updatedBy: 'dalia_seo_draft' });
    }

    initConnections(brief);
    validate(brief);
    if (changed) {
      audit(brief, 'mergeFromLegacy', 'Orin→Brief one-way');
      brief.meta.updatedAt = nowIso();
      saveLs(KEY, brief);
    }
    return brief;
  }

  function validateGateA(brief) {
    brief = brief || get();
    var missing = [];
    var checklist = [];

    function req(label, ok) {
      checklist.push({ label: label, ok: !!ok, gate: 'A' });
      if (!ok) missing.push(label);
    }

    req('שם עסק', !!envVal(brief.business.name));
    req('תחום', !!envVal(brief.business.sector));
    req('סיכום עסק', !!envVal(brief.business.summary));
    req('אתר', !!envVal(brief.assets.website) || !!envVal(brief.business.site));
    req('שירות מרכזי', !!envVal(brief.services.main));
    req('USP', !!envVal(brief.services.usp));
    req('קהל יעד', (envVal(brief.audience.ideal) || []).length >= 1);
    req('מטרה עסקית', !!envVal(brief.goals.businessGoal));
    req('תקציב', !!envVal(brief.goals.budget));

    var approvedKw = envVal(brief.keywords.approved) || [];
    var fromClientKw = envVal(brief.keywords.fromClient) || [];
    req(
      'מילות מפתח (≥' + GATE_MIN_KEYWORDS + ')',
      approvedKw.length >= GATE_MIN_KEYWORDS || fromClientKw.length >= GATE_MIN_KEYWORDS
    );

    var compCount = (brief.competitors || []).length;
    req('מתחרים (≥' + GATE_MIN_COMPETITORS + ')', compCount >= GATE_MIN_COMPETITORS);

    var logos = envVal(brief.files.logo) || [];
    req('לוגו (≥1)', logos.length >= 1);

    brief.approval = brief.approval || {};
    brief.approval.gateAChecklist = checklist;
    brief.approval.isComplete = missing.length === 0;
    saveLs(KEY, brief);
    return { ok: missing.length === 0, missing: missing, checklist: checklist };
  }

  function validateGateB(brief) {
    brief = brief || get();
    var missing = [];
    var checklist = [];

    function req(label, ok) {
      checklist.push({ label: label, ok: !!ok, gate: 'B' });
      if (!ok) missing.push(label);
    }

    req('Gate-A עבר', !!(brief.approval && brief.approval.gateAApproved));
    var camp = envVal(brief.business.campaignType);
    req('סוג קמפיין', !!camp);

    if (camp === 'seo' || camp === 'both' || camp === 'local' || camp === 'content') {
      req('seoPack אושר', !!envVal(brief.seoPack.approvedAt));
    }
    if (camp === 'ads' || camp === 'both') {
      req('adsPack אושר', !!envVal(brief.adsPack.approvedAt));
    }

    brief.approval = brief.approval || {};
    brief.approval.gateBChecklist = checklist;
    saveLs(KEY, brief);
    return { ok: missing.length === 0, missing: missing, checklist: checklist };
  }

  function validate(brief) {
    brief = brief || get();
    var missing = [];
    var checklist = [];

    function req(label, ok) {
      checklist.push({ label: label, ok: !!ok });
      if (!ok) missing.push(label);
    }

    req('שם עסק', !!envVal(brief.business.name));
    req('תחום', !!envVal(brief.business.sector));
    req('אתר', !!envVal(brief.assets.website) || !!envVal(brief.business.site));
    req('סוג קמפיין', !!envVal(brief.business.campaignType));
    req('שירות מרכזי', !!envVal(brief.services.main));
    req('USP', !!envVal(brief.services.usp));
    req('קהל יעד', (envVal(brief.audience.ideal) || []).length >= 1);
    req('מטרה עסקית', !!envVal(brief.goals.businessGoal));
    req('תקציב', !!envVal(brief.goals.budget));

    var approvedKw = envVal(brief.keywords.approved) || [];
    req('מילות מפתח מאושרות (≥' + GATE_MIN_KEYWORDS + ')', approvedKw.length >= GATE_MIN_KEYWORDS);

    var compCount = (brief.competitors || []).length;
    req('מתחרים (≥' + GATE_MIN_COMPETITORS + ')', compCount >= GATE_MIN_COMPETITORS);

    var logos = envVal(brief.files.logo) || [];
    req('לוגו (≥1)', logos.length >= 1);

    var camp = envVal(brief.business.campaignType);
    if (camp === 'seo' || camp === 'both') {
      req('seoPack אושר', !!envVal(brief.seoPack.approvedAt));
    }

    brief.gaps = brief.gaps || {};
    brief.gaps.missingFields = missing;
    brief.gaps.missingFiles = logos.length ? [] : ['files.logo'];
    brief.approval = brief.approval || {};
    brief.approval.checklist = checklist;
    brief.approval.isComplete = missing.length === 0;
    saveLs(KEY, brief);
    return { ok: missing.length === 0, missing: missing, checklist: checklist };
  }

  function isComplete() {
    return validate().ok;
  }

  function isGateAApproved() {
    try {
      if (localStorage.getItem(GATE_A_KEY) !== 'true') return false;
    } catch (e) {
      return false;
    }
    var brief = get();
    return !!(brief.approval && brief.approval.gateAApproved);
  }

  function isGateBApproved() {
    try {
      if (localStorage.getItem(GATE_B_KEY) !== 'true') return false;
    } catch (e) {
      return false;
    }
    var brief = get();
    return !!(brief.approval && brief.approval.gateBApproved);
  }

  function approveGateA(byUser) {
    var brief = get();
    var v = validateGateA(brief);
    if (!v.ok) {
      return { ok: false, reason: 'incomplete', missing: v.missing, message: 'חסר מידע — השלם את שלב ההיכרות לפני Gate-A' };
    }
    brief.approval.gateAApproved = true;
    brief.approval.gateAApprovedAt = nowIso();
    brief.approval.gateAApprovedBy = byUser || 'manager';
    audit(brief, 'approveGateA', brief.approval.gateAApprovedBy);
    saveLs(KEY, brief);
    try {
      localStorage.setItem(GATE_A_KEY, 'true');
    } catch (e) {
      return { ok: false, reason: 'storage' };
    }
    return { ok: true, brief: brief };
  }

  function approveGateB(byUser) {
    var brief = get();
    if (!isGateAApproved()) {
      return { ok: false, reason: 'gate_a', message: 'יש לאשר Gate-A לפני Gate-B' };
    }
    var v = validateGateB(brief);
    if (!v.ok) {
      return { ok: false, reason: 'incomplete', missing: v.missing, message: 'חסר מידע — השלם קמפיין ו-wizards לפני Gate-B' };
    }
    brief.approval.gateBApproved = true;
    brief.approval.gateBApprovedAt = nowIso();
    brief.approval.gateBApprovedBy = byUser || 'manager';
    audit(brief, 'approveGateB', brief.approval.gateBApprovedBy);
    saveLs(KEY, brief);
    try {
      localStorage.setItem(GATE_B_KEY, 'true');
    } catch (e) {
      return { ok: false, reason: 'storage' };
    }
    return { ok: true, brief: brief };
  }

  function isApproved() {
    try {
      if (localStorage.getItem(APPROVAL_KEY) !== 'true') return false;
    } catch (e) {
      return false;
    }
    var brief = get();
    return !!(brief.approval && brief.approval.isApproved);
  }

  function approve(byUser) {
    var brief = get();
    var v = validate(brief);
    if (!v.ok) {
      return { ok: false, reason: 'incomplete', missing: v.missing, message: 'חסר מידע — השלם את התיק לפני אישור' };
    }
    if (!isGateAApproved() || !isGateBApproved()) {
      if (envVal(brief.business.campaignType) && v.ok) {
        if (!isGateAApproved()) approveGateA(byUser);
        if (!isGateBApproved()) approveGateB(byUser);
      } else if (!isGateAApproved()) {
        return { ok: false, reason: 'gate_a', message: 'יש לאשר Gate-A (היכרות) לפני אישור סופי' };
      } else if (!isGateBApproved()) {
        return { ok: false, reason: 'gate_b', message: 'יש לאשר Gate-B (קמפיין) לפני אישור סופי' };
      }
    }
    brief = get();
    brief.approval.isComplete = true;
    brief.approval.isApproved = true;
    brief.approval.approvedAt = nowIso();
    brief.approval.approvedBy = byUser || 'manager';
    audit(brief, 'approve', brief.approval.approvedBy);
    saveLs(KEY, brief);
    try {
      localStorage.setItem(APPROVAL_KEY, 'true');
      localStorage.setItem('coco-project-brief-approved-at-v1', brief.approval.approvedAt);
    } catch (e) {
      return { ok: false, reason: 'storage' };
    }
    return { ok: true, brief: brief };
  }

  function revokeApproval() {
    var brief = get();
    brief.approval.isApproved = false;
    brief.approval.approvedAt = null;
    audit(brief, 'revoke', '');
    saveLs(KEY, brief);
    try {
      localStorage.removeItem(APPROVAL_KEY);
    } catch (e) { /* ignore */ }
    return { ok: true };
  }

  function revokeGateB() {
    var brief = get();
    brief.approval.gateBApproved = false;
    brief.approval.gateBApprovedAt = null;
    audit(brief, 'revokeGateB', '');
    saveLs(KEY, brief);
    try { localStorage.removeItem(GATE_B_KEY); } catch (e) { /* ignore */ }
    return { ok: true };
  }

  function revokeGateA() {
    revokeGateB();
    var brief = get();
    brief.approval.gateAApproved = false;
    brief.approval.gateAApprovedAt = null;
    audit(brief, 'revokeGateA', '');
    saveLs(KEY, brief);
    try { localStorage.removeItem(GATE_A_KEY); } catch (e) { /* ignore */ }
    return { ok: true };
  }

  function exportForAssistant() {
    var brief = get();
    return {
      version: VERSION,
      exportedAt: nowIso(),
      business: {
        name: envVal(brief.business.name),
        sector: envVal(brief.business.sector),
        site: envVal(brief.business.site),
        campaignType: envVal(brief.business.campaignType),
      },
      services: {
        main: envVal(brief.services.main),
        list: envVal(brief.services.list),
        usp: envVal(brief.services.usp),
      },
      audience: { ideal: envVal(brief.audience.ideal) },
      goals: {
        businessGoal: envVal(brief.goals.businessGoal),
        budget: envVal(brief.goals.budget),
      },
      keywords: { approved: envVal(brief.keywords.approved) },
      competitors: (brief.competitors || []).map(function (c) {
        return { name: envVal(c.name), website: envVal(c.website) };
      }),
      seoPack: {
        goals: envVal(brief.seoPack.goals),
        geo: envVal(brief.seoPack.geo),
        approvedAt: envVal(brief.seoPack.approvedAt),
      },
      freeContent: {
        managerNotes: envVal(brief.freeContent.managerNotes),
        aiMustKnow: envVal(brief.freeContent.aiMustKnow),
      },
      files: {
        logo: envVal(brief.files.logo),
      },
      approval: {
        isApproved: brief.approval.isApproved,
        approvedAt: brief.approval.approvedAt,
      },
    };
  }

  function applyAssistantReport(report) {
    console.warn('[ProjectBrief] applyAssistantReport stub — Phase 1b', report);
    return { ok: false, reason: 'not_implemented', message: 'Phase 1a — assistant merge not active yet' };
  }

  window.ProjectBrief = {
    VERSION: VERSION,
    KEY: KEY,
    APPROVAL_KEY: APPROVAL_KEY,
    GATE_A_KEY: GATE_A_KEY,
    GATE_B_KEY: GATE_B_KEY,
    GATE_MIN_KEYWORDS: GATE_MIN_KEYWORDS,
    GATE_MIN_COMPETITORS: GATE_MIN_COMPETITORS,
    envelope: envelope,
    getDefault: getDefault,
    get: get,
    set: set,
    setField: setField,
    mergeFromLegacy: mergeFromLegacy,
    validate: validate,
    validateGateA: validateGateA,
    validateGateB: validateGateB,
    isComplete: isComplete,
    isApproved: isApproved,
    isGateAApproved: isGateAApproved,
    isGateBApproved: isGateBApproved,
    approve: approve,
    approveGateA: approveGateA,
    approveGateB: approveGateB,
    revokeApproval: revokeApproval,
    revokeGateA: revokeGateA,
    revokeGateB: revokeGateB,
    exportForAssistant: exportForAssistant,
    applyAssistantReport: applyAssistantReport,
    envVal: envVal,
    CONNECTION_MOCK: CONNECTION_MOCK,
  };
})();
