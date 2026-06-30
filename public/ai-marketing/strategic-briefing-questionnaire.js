/**
 * Strategic Briefing Questionnaire — mandatory before materials gate / SEO / report / build.
 * Staging only · functional panels in existing strategy export area.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var BRIEFING_KEY = 'coco-strategic-briefing-v1';
  var APPROVAL_KEY = 'coco-strategic-briefing-approved-v1';
  var MISSING_MSG = 'חסר מידע. לא ניתן להמשיך עד להשלמת כל שדות החובה.';
  var MISSING = 'חסר מידע';

  var BUILD_TYPES = [
    'אתר', 'דף נחיתה', 'אפליקציה', 'מערכת', 'סרטון', 'קטלוג', 'קמפיין שיווקי', 'CRM', 'אחר',
  ];
  var MAIN_GOALS = [
    'לידים', 'מכירת תוכנה', 'מכירת אפליקציה', 'קידום שירותים', 'בניית מותג', 'SEO', 'פרסום', 'אחר',
  ];
  var SERVICE_OPTIONS = [
    'FleetOS / תוכנת ניהול צי', 'תפעול צי רכב', 'תחזוקה וטיפולים', 'GPS וטלמטיקה',
    'מצלמות וחיישנים', 'CANBUS', 'ניהול נהגים', 'דוחות והתראות', 'AI בצי', 'אחר',
  ];
  var AUDIENCE_OPTIONS = [
    'עסקים עם צי רכב', 'חברות ליסינג', 'מפעילי הובלות', 'קבלנים', 'רשויות מקומיות',
    'מוסכים ותחזוקה', 'סטארט-אפים', 'ארגונים גדולים', 'אחר',
  ];
  var REGION_OPTIONS = ['כל הארץ', 'אזור', 'עיר', 'בינלאומי'];
  var PLATFORM_OPTIONS = [
    'אתר', 'GSC', 'GA', 'GBP', 'Ads', 'Facebook', 'Instagram', 'LinkedIn', 'YouTube',
    'WhatsApp', 'CRM', 'Email', 'FleetOS', 'אפליקציה', 'אחר',
  ];

  var FLEET_KEYWORD_SEEDS = [
    'תוכנה לניהול צי רכב', 'מערכת לניהול צי רכב', 'FleetOS', 'Fleet Management',
    'ניהול צי רכב לעסקים', 'תוכנת FleetOS', 'מערכת תפעול צי',
    'תחזוקת צי רכב', 'ניהול נהגים', 'GPS לצי', 'טלמטיקה', 'מעקב רכבים בזמן אמת',
  ];

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function save(state) {
    try { localStorage.setItem(BRIEFING_KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getDefault() {
    return {
      version: VERSION,
      buildType: '',
      buildTypeOther: '',
      mainGoal: '',
      mainGoalOther: '',
      services: [],
      servicesOther: '',
      audience: [],
      audienceOther: '',
      regions: [],
      regionDetail: '',
      competitorsAuto: [],
      competitorsManual: [],
      keywordsSuggested: [],
      keywordsApproved: [],
      keywordsManual: [],
      platforms: [],
      platformsOther: '',
      updatedAt: new Date().toISOString(),
    };
  }

  function seedFromContext() {
    var ctx = parseLs('coco-business-context-v1') || {};
    var biz = parseLs('dalia_biz') || {};
    var seeds = {
      competitorsAuto: ctx.competitors || (biz.comp ? String(biz.comp).split('\n').filter(Boolean) : []),
      keywordsSuggested: FLEET_KEYWORD_SEEDS.slice(),
      services: [],
      audience: [],
      platforms: [],
    };
    if (biz.mainService) seeds.services.push(biz.mainService);
    if (biz.services) {
      String(biz.services).split(',').forEach(function (s) {
        var t = s.trim();
        if (t && seeds.services.indexOf(t) < 0) seeds.services.push(t);
      });
    }
    if (biz.ideal) seeds.audience.push(biz.ideal);
    if (ctx.strategy && ctx.strategy.platforms) seeds.platforms = ctx.strategy.platforms.slice();
    if (ctx.strategy && ctx.strategy.focusKeywords) {
      ctx.strategy.focusKeywords.forEach(function (k) {
        var s = typeof k === 'string' ? k : (k.query || k.keyword);
        if (s && seeds.keywordsSuggested.indexOf(s) < 0) seeds.keywordsSuggested.push(s);
      });
    }
    return seeds;
  }

  function get() {
    var state = parseLs(BRIEFING_KEY);
    if (!state) {
      state = getDefault();
      var seed = seedFromContext();
      state.competitorsAuto = seed.competitorsAuto;
      state.keywordsSuggested = seed.keywordsSuggested;
      if (seed.services.length) state.services = seed.services;
      if (seed.audience.length) state.audience = seed.audience;
      if (seed.platforms.length) state.platforms = seed.platforms;
    }
    if (!state.competitorsAuto) state.competitorsAuto = seedFromContext().competitorsAuto;
    if (!state.keywordsSuggested || !state.keywordsSuggested.length) state.keywordsSuggested = FLEET_KEYWORD_SEEDS.slice();
    if (!state.keywordsApproved) state.keywordsApproved = [];
    if (!state.competitorsManual) state.competitorsManual = [];
    if (!state.keywordsManual) state.keywordsManual = [];
    return state;
  }

  function isApproved() {
    try { return localStorage.getItem(APPROVAL_KEY) === 'true'; } catch (e) { return false; }
  }

  function validate(state) {
    state = state || get();
    var missing = [];

    if (!state.buildType) missing.push('buildType');
    if (state.buildType === 'אחר' && !String(state.buildTypeOther || '').trim()) missing.push('buildTypeOther');
    if (!state.mainGoal) missing.push('mainGoal');
    if (state.mainGoal === 'אחר' && !String(state.mainGoalOther || '').trim()) missing.push('mainGoalOther');
    if (!state.services || !state.services.length) missing.push('services');
    if (state.services.indexOf('אחר') >= 0 && !String(state.servicesOther || '').trim()) missing.push('servicesOther');
    if (!state.audience || !state.audience.length) missing.push('audience');
    if (state.audience.indexOf('אחר') >= 0 && !String(state.audienceOther || '').trim()) missing.push('audienceOther');
    if (!state.regions || !state.regions.length) missing.push('regions');
    if ((state.regions.indexOf('אזור') >= 0 || state.regions.indexOf('עיר') >= 0) && !String(state.regionDetail || '').trim()) {
      missing.push('regionDetail');
    }
    if (!state.competitorsManual || !state.competitorsManual.length) missing.push('competitorsManual');
    var allKw = (state.keywordsApproved || []).concat(state.keywordsManual || []);
    if (!allKw.length) missing.push('keywords');
    if (!state.platforms || !state.platforms.length) missing.push('platforms');
    if (state.platforms.indexOf('אחר') >= 0 && !String(state.platformsOther || '').trim()) missing.push('platformsOther');

    return { ok: missing.length === 0, missing: missing };
  }

  function isComplete() {
    return validate(get()).ok;
  }

  function isReady() {
    return isComplete() && isApproved();
  }

  function allKeywords(state) {
    state = state || get();
    var set = [];
    (state.keywordsApproved || []).concat(state.keywordsManual || []).forEach(function (k) {
      if (k && set.indexOf(k) < 0) set.push(k);
    });
    return set;
  }

  function allCompetitors(state) {
    state = state || get();
    var set = [];
    (state.competitorsAuto || []).concat(state.competitorsManual || []).forEach(function (c) {
      if (c && set.indexOf(c) < 0) set.push(c);
    });
    return set;
  }

  function approveBriefing(state) {
    state = state || get();
    var v = validate(state);
    if (!v.ok) return { ok: false, reason: 'incomplete', missing: v.missing };
    save(state);
    try {
      localStorage.setItem(APPROVAL_KEY, 'true');
      localStorage.setItem('coco-strategic-briefing-approved-at-v1', new Date().toISOString());
    } catch (e) { return { ok: false }; }
    syncToContext(state);
    if (window.MarketingActivityLog) MarketingActivityLog.log('strategic_briefing_approved', { buildType: state.buildType, goal: state.mainGoal });
    if (window.MarketingLifecycle) MarketingLifecycle.advance('briefing', 'completed');
    if (window.AiStageAdvisor) AiStageAdvisor.advise('briefing');
    return { ok: true, state: state };
  }

  function syncToContext(state) {
    state = state || get();
    var ctx = parseLs('coco-business-context-v1') || {};
    ctx.strategicBriefing = {
      buildType: state.buildType,
      mainGoal: state.mainGoal,
      services: state.services,
      audience: state.audience,
      regions: state.regions,
      regionDetail: state.regionDetail,
      competitors: allCompetitors(state),
      keywords: allKeywords(state),
      platforms: state.platforms,
      approvedAt: new Date().toISOString(),
    };
    if (!ctx.strategy) ctx.strategy = {};
    ctx.strategy.focusKeywords = allKeywords(state);
    ctx.strategy.platforms = state.platforms;
    ctx.competitors = allCompetitors(state);
    try { localStorage.setItem('coco-business-context-v1', JSON.stringify(ctx)); } catch (e) { /* ignore */ }

    var compData = { version: VERSION, list: allCompetitors(state).map(function (name, i) {
      return { id: 'comp-brief-' + i, name: name, source: (state.competitorsManual.indexOf(name) >= 0 ? 'manual' : 'auto'), manual: state.competitorsManual.indexOf(name) >= 0 };
    }), updatedAt: new Date().toISOString() };
    try { localStorage.setItem('coco-competitors-v1', JSON.stringify(compData)); } catch (e) { /* ignore */ }
  }

  function assertGate() {
    if (!isReady()) {
      if (typeof showToast === 'function') showToast('⚠️ ' + MISSING_MSG);
      return false;
    }
    return true;
  }

  function renderMultiCheck(name, options, selected, otherField) {
    return options.map(function (opt) {
      var checked = selected.indexOf(opt) >= 0;
      return '<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--w80);margin:3px 6px 3px 0;">' +
        '<input type="checkbox" data-sb-multi="' + name + '" value="' + esc(opt) + '" ' + (checked ? 'checked' : '') + ' /> ' + esc(opt) + '</label>';
    }).join('') +
      (otherField ? '<input type="text" id="sb-' + otherField + '" placeholder="פרט/י אחר" value="" style="font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--w10);background:var(--bg4);color:var(--w);margin-top:4px;width:100%;max-width:280px;" />' : '');
  }

  function collectFromForm(state, container) {
    state = state || getDefault();
    var buildEl = container.querySelector('#sb-build-type');
    state.buildType = buildEl ? buildEl.value : state.buildType;
    state.buildTypeOther = (container.querySelector('#sb-build-other') || {}).value || '';
    var goalEl = container.querySelector('#sb-main-goal');
    state.mainGoal = goalEl ? goalEl.value : state.mainGoal;
    state.mainGoalOther = (container.querySelector('#sb-goal-other') || {}).value || '';
    state.services = [];
    container.querySelectorAll('[data-sb-multi="services"]:checked').forEach(function (cb) { state.services.push(cb.value); });
    state.servicesOther = (container.querySelector('#sb-services-other') || {}).value || '';
    state.audience = [];
    container.querySelectorAll('[data-sb-multi="audience"]:checked').forEach(function (cb) { state.audience.push(cb.value); });
    state.audienceOther = (container.querySelector('#sb-audience-other') || {}).value || '';
    state.regions = [];
    container.querySelectorAll('[data-sb-multi="regions"]:checked').forEach(function (cb) { state.regions.push(cb.value); });
    state.regionDetail = (container.querySelector('#sb-region-detail') || {}).value || '';
    state.platforms = [];
    container.querySelectorAll('[data-sb-multi="platforms"]:checked').forEach(function (cb) { state.platforms.push(cb.value); });
    state.platformsOther = (container.querySelector('#sb-platforms-other') || {}).value || '';
    state.updatedAt = new Date().toISOString();
    return state;
  }

  function renderInlinePanel(container) {
    if (!container) return;
    var state = get();
    var approved = isApproved();
    var v = validate(state);
    var complete = v.ok;

    var compAutoHtml = (state.competitorsAuto || []).map(function (c) {
      return '<span style="font-size:11px;color:var(--w50);margin-left:6px;">• ' + esc(c) + ' (אוטומטי)</span>';
    }).join('');
    var compManualHtml = (state.competitorsManual || []).map(function (c) {
      return '<span style="font-size:11px;color:var(--w80);margin-left:6px;">• ' + esc(c) + ' (ידני)</span>';
    }).join('');

    var kwSuggestHtml = (state.keywordsSuggested || []).map(function (k) {
      var checked = (state.keywordsApproved || []).indexOf(k) >= 0;
      return '<label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--w80);margin:2px 6px 2px 0;">' +
        '<input type="checkbox" data-sb-kw-suggest value="' + esc(k) + '" ' + (checked ? 'checked' : '') + ' /> ' + esc(k) + '</label>';
    }).join('');
    var kwManualHtml = (state.keywordsManual || []).map(function (k) {
      return '<span style="font-size:11px;color:var(--w80);">• ' + esc(k) + '</span>';
    }).join(' ');

    container.innerHTML =
      '<div class="card" style="margin-top:12px;">' +
      '<div class="ph-t">📋 שאלון אסטרטגי — חובה לפני בניית אתר</div>' +
      '<div class="s">יש להשלים את כל השדות המסומנים ב-* ולאשר לפני המשך</div>' +
      (!complete ? '<div class="alt alt-warn" style="margin-top:8px;">' + esc(MISSING_MSG) + '</div>' : '') +

      '<div style="margin-top:12px;"><label class="st">* מה אתה רוצה לבנות?</label>' +
      '<select id="sb-build-type" style="font-size:12px;padding:6px 8px;border-radius:6px;border:1px solid var(--w10);background:var(--bg4);color:var(--w);width:100%;max-width:320px;margin-top:4px;">' +
      '<option value="">— בחר —</option>' +
      BUILD_TYPES.map(function (t) { return '<option value="' + esc(t) + '" ' + (state.buildType === t ? 'selected' : '') + '>' + esc(t) + '</option>'; }).join('') +
      '</select>' +
      '<input type="text" id="sb-build-other" placeholder="פרט/י אחר" value="' + esc(state.buildTypeOther) + '" style="font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--w10);background:var(--bg4);color:var(--w);margin-top:4px;width:100%;max-width:280px;' + (state.buildType === 'אחר' ? '' : 'display:none;') + '" /></div>' +

      '<div style="margin-top:12px;"><label class="st">* מה המטרה המרכזית?</label>' +
      '<select id="sb-main-goal" style="font-size:12px;padding:6px 8px;border-radius:6px;border:1px solid var(--w10);background:var(--bg4);color:var(--w);width:100%;max-width:320px;margin-top:4px;">' +
      '<option value="">— בחר —</option>' +
      MAIN_GOALS.map(function (t) { return '<option value="' + esc(t) + '" ' + (state.mainGoal === t ? 'selected' : '') + '>' + esc(t) + '</option>'; }).join('') +
      '</select>' +
      '<input type="text" id="sb-goal-other" placeholder="פרט/י אחר" value="' + esc(state.mainGoalOther) + '" style="font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--w10);background:var(--bg4);color:var(--w);margin-top:4px;width:100%;max-width:280px;' + (state.mainGoal === 'אחר' ? '' : 'display:none;') + '" /></div>' +

      '<div style="margin-top:12px;"><div class="st">* אילו שירותים/מוצרים לקדם?</div>' +
      '<div style="margin-top:4px;">' + renderMultiCheck('services', SERVICE_OPTIONS, state.services || [], 'services-other') + '</div></div>' +

      '<div style="margin-top:12px;"><div class="st">* מי קהל היעד?</div>' +
      '<div style="margin-top:4px;">' + renderMultiCheck('audience', AUDIENCE_OPTIONS, state.audience || [], 'audience-other') + '</div></div>' +

      '<div style="margin-top:12px;"><div class="st">* באילו אזורים?</div>' +
      '<div style="margin-top:4px;">' + renderMultiCheck('regions', REGION_OPTIONS, state.regions || [], null) + '</div>' +
      '<input type="text" id="sb-region-detail" placeholder="פרט אזור/עיר" value="' + esc(state.regionDetail) + '" style="font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--w10);background:var(--bg4);color:var(--w);margin-top:4px;width:100%;max-width:280px;" /></div>' +

      '<div style="margin-top:12px;"><div class="st">* מי המתחרים?</div>' +
      '<div class="s" style="margin-top:2px;">זוהו אוטומטית + חובה להוסיף ידנית לפחות מתחרה אחד</div>' +
      '<div style="margin-top:4px;">' + compAutoHtml + compManualHtml + '</div>' +
      '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">' +
      '<input type="text" id="sb-comp-name" placeholder="שם מתחרה" style="flex:1;min-width:100px;font-size:12px;padding:6px 8px;border-radius:6px;border:1px solid var(--w10);background:var(--bg4);color:var(--w);" />' +
      '<button type="button" class="btn btn-p" id="sb-add-comp" style="padding:4px 10px;font-size:11px;">+ הוסף מתחרה *</button>' +
      '</div></div>' +

      '<div style="margin-top:12px;"><div class="st">* מילות מפתח</div>' +
      '<div class="s" style="margin-top:2px;">אשר/י הצעות FleetOS + הוסף/י ידנית לפחות מילה אחת</div>' +
      '<div style="margin-top:4px;flex-wrap:wrap;display:flex;">' + kwSuggestHtml + '</div>' +
      '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">' +
      '<input type="text" id="sb-kw-manual" placeholder="מילת מפתח" style="flex:1;min-width:100px;font-size:12px;padding:6px 8px;border-radius:6px;border:1px solid var(--w10);background:var(--bg4);color:var(--w);" />' +
      '<button type="button" class="btn btn-p" id="sb-add-kw" style="padding:4px 10px;font-size:11px;">+ הוסף מילה</button>' +
      '</div>' +
      '<div style="margin-top:4px;">' + (kwManualHtml || '<span style="font-size:11px;color:var(--w50);">אין מילים ידניות</span>') + '</div></div>' +

      '<div style="margin-top:12px;"><div class="st">* פלטפורמות</div>' +
      '<div style="margin-top:4px;">' + renderMultiCheck('platforms', PLATFORM_OPTIONS, state.platforms || [], 'platforms-other') + '</div></div>' +

      '<div style="margin-top:14px;border-top:1px solid var(--w10);padding-top:12px;">' +
      (window.AiConsultant ? AiConsultant.buttonHtml('briefing', 'ac-btn-briefing') + AiConsultant.panelHtml('briefing', 'ac-panel-briefing') : '') +
      '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--w80);margin-top:8px;">' +
      '<input type="checkbox" id="sb-approve-check" ' + (approved ? 'checked disabled' : '') + ' /> האם אתה מאשר שהמידע נכון ומלא?</label>' +
      '<button type="button" class="btn btn-go" id="sb-approve-btn" style="margin-top:8px;" ' + (approved ? 'disabled' : '') + '>✅ אשר שאלון והמשך לשער חומרים</button>' +
      '</div>' +
      '<div id="sb-status" class="alt ' + (approved ? 'alt-ok' : 'alt-warn') + '" style="margin-top:10px;">' +
      (approved ? '✅ השאלון האסטרטגי מאושר — ניתן להמשיך לשער חומרים' : (complete ? '⚠️ יש לאשר את השאלון לפני המשך' : '⚠️ ' + MISSING_MSG)) +
      '</div></div>';

    // Restore other field values
    var so = container.querySelector('#sb-services-other');
    if (so) so.value = state.servicesOther || '';
    var ao = container.querySelector('#sb-audience-other');
    if (ao) ao.value = state.audienceOther || '';
    var po = container.querySelector('#sb-platforms-other');
    if (po) po.value = state.platformsOther || '';

    var buildSel = container.querySelector('#sb-build-type');
    if (buildSel) buildSel.addEventListener('change', function () {
      var other = container.querySelector('#sb-build-other');
      if (other) other.style.display = buildSel.value === 'אחר' ? '' : 'none';
      var st = collectFromForm(get(), container);
      save(st);
    });
    var goalSel = container.querySelector('#sb-main-goal');
    if (goalSel) goalSel.addEventListener('change', function () {
      var other = container.querySelector('#sb-goal-other');
      if (other) other.style.display = goalSel.value === 'אחר' ? '' : 'none';
      save(collectFromForm(get(), container));
    });

    container.querySelectorAll('[data-sb-multi]').forEach(function (cb) {
      cb.addEventListener('change', function () { save(collectFromForm(get(), container)); });
    });
    container.querySelectorAll('[data-sb-kw-suggest]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var st = get();
        st.keywordsApproved = [];
        container.querySelectorAll('[data-sb-kw-suggest]:checked').forEach(function (c) { st.keywordsApproved.push(c.value); });
        save(st);
      });
    });

    var addComp = container.querySelector('#sb-add-comp');
    if (addComp) addComp.addEventListener('click', function () {
      var inp = container.querySelector('#sb-comp-name');
      var name = inp && inp.value.trim();
      if (!name) { if (typeof showToast === 'function') showToast('⚠️ הזן/י שם מתחרה'); return; }
      var st = collectFromForm(get(), container);
      if (!st.competitorsManual) st.competitorsManual = [];
      if (st.competitorsManual.indexOf(name) < 0) st.competitorsManual.push(name);
      save(st);
      if (inp) inp.value = '';
      renderInlinePanel(container);
    });

    var addKw = container.querySelector('#sb-add-kw');
    if (addKw) addKw.addEventListener('click', function () {
      var inp = container.querySelector('#sb-kw-manual');
      var kw = inp && inp.value.trim();
      if (!kw) { if (typeof showToast === 'function') showToast('⚠️ הזן/י מילת מפתח'); return; }
      var st = collectFromForm(get(), container);
      if (!st.keywordsManual) st.keywordsManual = [];
      if (st.keywordsManual.indexOf(kw) < 0) st.keywordsManual.push(kw);
      save(st);
      if (inp) inp.value = '';
      renderInlinePanel(container);
    });

    if (window.AiConsultant) AiConsultant.wireStage(container, 'briefing', 'ac-btn-briefing', 'ac-panel-briefing');

    var approveBtn = container.querySelector('#sb-approve-btn');
    if (approveBtn) approveBtn.addEventListener('click', function () {
      var chk = container.querySelector('#sb-approve-check');
      if (chk && !chk.checked) { if (typeof showToast === 'function') showToast('⚠️ סמן/י אישור'); return; }
      var st = collectFromForm(get(), container);
      st.keywordsApproved = [];
      container.querySelectorAll('[data-sb-kw-suggest]:checked').forEach(function (c) { st.keywordsApproved.push(c.value); });
      var res = approveBriefing(st);
      if (!res.ok) {
        if (typeof showToast === 'function') showToast('⚠️ ' + MISSING_MSG);
        renderInlinePanel(container);
        return;
      }
      if (typeof showToast === 'function') showToast('✅ השאלון האסטרטגי מאושר');
      renderInlinePanel(container);
      if (window.MaterialsReadinessGate && MaterialsReadinessGate.mountPanel) {
        MaterialsReadinessGate.mountPanel('materials-gate-root');
      }
      if (window.PreBuildWorkReport && PreBuildWorkReport.updateBuildButtonsGate) {
        PreBuildWorkReport.updateBuildButtonsGate();
      }
    });
  }

  function mountPanel(rootId) {
    var root = document.getElementById(rootId || 'strategic-briefing-root');
    if (!root) return;
    renderInlinePanel(root);
  }

  function computeReadinessScore() {
    var state = get();
    var v = validate(state);
    var scores = {
      businessInfo: 0,
      softwareApp: 0,
      seo: 0,
      competitors: 0,
      audience: 0,
      platforms: 0,
      marketingMaterials: 0,
      siteBuildReady: 0,
    };
    if (state.buildType && state.mainGoal) scores.businessInfo += 50;
    if (state.services && state.services.length) scores.businessInfo += 25;
    if (isApproved()) scores.businessInfo += 25;

    if ((state.services || []).some(function (s) { return /FleetOS|תוכנ|אפליק/i.test(s); })) scores.softwareApp += 60;
    if (allKeywords(state).length >= 3) scores.softwareApp += 20;
    if (isApproved()) scores.softwareApp += 20;

    scores.seo = allKeywords(state).length >= 5 ? 70 : allKeywords(state).length >= 1 ? 40 : 0;
    if (window.SeoStrategy && SeoStrategy.isApproved()) scores.seo = Math.max(scores.seo, 85);

    scores.competitors = allCompetitors(state).length >= 2 ? 80 : allCompetitors(state).length >= 1 ? 50 : 0;
    if ((state.competitorsManual || []).length >= 1) scores.competitors = Math.max(scores.competitors, 70);

    scores.audience = (state.audience || []).length >= 2 ? 80 : (state.audience || []).length >= 1 ? 50 : 0;
    scores.platforms = (state.platforms || []).length >= 3 ? 80 : (state.platforms || []).length >= 1 ? 50 : 0;
    if (window.MaterialsReadinessGate && MaterialsReadinessGate.isReady()) scores.marketingMaterials = 90;
    else if (window.MaterialsReadinessGate && MaterialsReadinessGate.isChecklistComplete()) scores.marketingMaterials = 50;

    var gateCount = 0;
    if (isReady()) gateCount++;
    if (window.MaterialsReadinessGate && MaterialsReadinessGate.isReady()) gateCount++;
    if (window.SeoStrategy && SeoStrategy.isApproved()) gateCount++;
    if (window.PreBuildWorkReport && PreBuildWorkReport.isApproved()) gateCount++;
    scores.siteBuildReady = Math.round((gateCount / 4) * 100);

    scores.overall = Math.round((scores.businessInfo + scores.softwareApp + scores.seo + scores.competitors +
      scores.audience + scores.platforms + scores.marketingMaterials + scores.siteBuildReady) / 8);

    scores.complete = v.ok;
    scores.approved = isApproved();
    scores.missingMsg = v.ok ? null : MISSING_MSG;
    return scores;
  }

  window.StrategicBriefing = {
    VERSION: VERSION,
    MISSING_MSG: MISSING_MSG,
    MISSING: MISSING,
    FLEET_KEYWORD_SEEDS: FLEET_KEYWORD_SEEDS,
    BUILD_TYPES: BUILD_TYPES,
    MAIN_GOALS: MAIN_GOALS,
    get: get,
    validate: validate,
    isComplete: isComplete,
    isApproved: isApproved,
    isReady: isReady,
    approveBriefing: approveBriefing,
    assertGate: assertGate,
    mountPanel: mountPanel,
    allKeywords: allKeywords,
    allCompetitors: allCompetitors,
    syncToContext: syncToContext,
    computeReadinessScore: computeReadinessScore,
  };
})();
