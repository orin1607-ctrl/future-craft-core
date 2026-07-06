/**
 * CO.CO דליה — Integration Layer (Phase 1)
 * Bridges WIRED main system ↔ Control Center v5 ↔ Orin legacy (read-only overlay).
 * Does NOT modify Orin screens; uses localStorage SSOT + optional GlobalFilterContext.
 */
(function () {
  'use strict';

  var VERSION = '3.0.0-phase3';

  var KEYS = {
    projectBrief: 'dalia_project_brief',
    partA: 'dalia_part_a',
    partB: 'dalia_part_b',
    partC: 'dalia_part_c',
    biz: 'dalia_biz',
    trackComplete: 'dalia_track_complete',
    seoDraft: 'dalia_seo_draft',
    gadsDraft: 'dalia_gads_draft',
    globalFilter: 'coco-global-filter-v3',
    qa: 'coco-v5-qa-v1',
    schedule: 'coco-v5-schedule-v1',
    activeAsset: 'coco-active-asset-v1',
    pendingAssets: 'coco-pending-assets-v1',
    progress: 'coco-dalia-progress-v1',
    apiCache: 'coco-dalia-api-cache-v1',
  };

  var WIRED_FILE = 'coco-dalia-full-A-J-WIRED%20(1).html';
  var V5_FILE = 'ai-control-center-v5-STANDALONE.html';
  var _busy = { hydrate: false, refresh: false };

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

  function getBasePath() {
    if (window.COCO_PAGES_BASE) {
      var b = window.COCO_PAGES_BASE;
      return b.charAt(0) === '/' ? b : (b.endsWith('/') ? b : b + '/');
    }
    var host = location.hostname;
    if (/orin1607-ctrl\.github\.io/i.test(host)) return '/future-craft-core/';
    if (host === 'localhost' || host === '127.0.0.1') {
      var p = location.pathname || '';
      var i = p.indexOf('/public/');
      if (i >= 0) return p.substring(0, i + 8);
      i = p.indexOf('ai-marketing');
      if (i >= 0) return p.substring(0, i);
      i = p.indexOf('coco-dalia');
      if (i >= 0) return p.substring(0, i);
    }
    return '/future-craft-core/';
  }

  function absUrl(rel) {
    var base = getBasePath();
    if (base.charAt(0) === '/') return location.origin + base + rel;
    try {
      return new URL(rel, base).href;
    } catch (e) {
      return rel;
    }
  }

  function wiredUrl(opts) {
    opts = opts || {};
    var url = absUrl('coco-dalia/' + WIRED_FILE);
    var qs = [];
    if (opts.part) qs.push('part=' + encodeURIComponent(opts.part));
    if (opts.tab) qs.push('tab=' + encodeURIComponent(opts.tab));
    if (qs.length) url += '?' + qs.join('&');
    return url;
  }

  function v5Url() {
    return absUrl('ai-marketing/' + V5_FILE);
  }

  function hasLiveData() {
    return !!(
      parseLs(KEYS.projectBrief) ||
      parseLs(KEYS.partA) ||
      parseLs(KEYS.partB) ||
      parseLs(KEYS.biz) ||
      parseLs(KEYS.apiCache)
    );
  }

  /* ── Unified progress SSOT (WIRED writes → v5 reads) ── */
  function publishProgress(opts) {
    opts = opts || {};
    var brief = parseLs(KEYS.projectBrief);
    var partA = parseLs(KEYS.partA) || {};
    var partB = parseLs(KEYS.partB);
    var partC = parseLs(KEYS.partC);
    var track = parseLs(KEYS.trackComplete);
    var biz = readBiz();
    var qa = loadQA();
    var sched = loadSchedule();

    var aStatus = brief ? 'completed' : (partA.bizName || partA.name ? 'in_progress' : 'pending');
    var bStatus = partB && partB.approved ? 'completed' : (track && track.track === 'seo' ? 'completed' : 'pending');
    var cStatus = partA.gads_ready ? 'ready' : (track && track.track === 'ads' ? 'completed' : 'pending');
    var teamStatus = (partB && partB.approved) || (track && track.track) ? 'unlocked' : 'locked';

    var qaCount = 0;
    ['assistants', 'consultants'].forEach(function (b) {
      var bucket = qa[b] || {};
      Object.keys(bucket).forEach(function (id) {
        var q = bucket[id];
        if (q && (q.relevant != null || q.helped != null || q.quality_rating != null)) qaCount++;
      });
    });

    var progress = {
      version: 2,
      updatedAt: new Date().toISOString(),
      client: {
        name: biz.companyName || biz.bizName || '',
        site: biz.site || '',
        sector: biz.sector || '',
      },
      parts: {
        a: { status: aStatus, hasBrief: !!brief },
        b: { status: bStatus, kw_count: partB && partB.kw_count, approved: !!(partB && partB.approved) },
        c: { status: cStatus, gads_ready: !!partA.gads_ready },
        team: { status: teamStatus },
        d: { status: 'preview' },
      },
      track: track,
      qaRated: qaCount,
      schedule: sched,
      competitors: (readCompetitors() || []).length,
    };
    saveLs(KEYS.progress, progress);
    if (opts.emit) {
      try {
        window.dispatchEvent(new CustomEvent('coco:dalia-progress', { detail: progress }));
      } catch (e) { /* ignore */ }
    }
    return progress;
  }

  function readProgress() {
    return parseLs(KEYS.progress);
  }

  function readBiz() {
    var brief = parseLs(KEYS.projectBrief);
    if (brief && brief.biz) return brief.biz;
    var a = parseLs(KEYS.partA) || {};
    var b = parseLs(KEYS.biz) || {};
    return {
      bizName: a.bizName || b.company || b.name || '',
      companyName: a.bizName || b.company || '',
      sector: b.sector || '',
      site: a.site || b.site || b.website || '',
      targetAudience: b.ideal || '',
      summary: b.summary || '',
      goals: b.goal || b.goals || '',
    };
  }

  function readCompetitors() {
    var brief = parseLs(KEYS.projectBrief);
    if (brief && Array.isArray(brief.competitors)) return brief.competitors;
    return [];
  }

  function readActiveAsset() {
    return parseLs(KEYS.activeAsset);
  }

  function buildLiveSnapshot() {
    var biz = readBiz();
    var partB = parseLs(KEYS.partB);
    var partA = parseLs(KEYS.partA) || {};
    var track = parseLs(KEYS.trackComplete);
    var asset = readActiveAsset();
    var gfc = parseLs(KEYS.globalFilter) || {};
    return {
      at: new Date().toISOString(),
      hasLive: hasLiveData(),
      biz: biz,
      competitors: readCompetitors(),
      partA: partA,
      partB: partB,
      track: track,
      asset: asset,
      filter: gfc,
      clientName: gfc.clientName || biz.companyName || biz.bizName || '',
      campaignName: gfc.campaignName || partA.campaignType || '',
      assetLabel: gfc.assetLabel || asset && (asset.label || asset.url || asset.domain) || biz.site || '',
    };
  }

  function overlayKpis(data, snap) {
    if (!snap.hasLive) return;
    var biz = snap.biz || {};
    var partA = snap.partA || {};
    var partB = snap.partB;
    var track = snap.track;

    data.kpis.forEach(function (k) {
      if (k.id === 'kpi6' && biz.site) {
        k.value = biz.site.replace(/^https?:\/\//, '').split('/')[0] || k.value;
      }
      if (k.id === 'kpi4' && partB && partB.approved && partB.kw_count) {
        k.value = partB.kw_count + ' מילות מפתח';
      }
      if (k.id === 'kpi5' && (partA.gads_ready || (track && track.track === 'ads'))) {
        k.value = 'מוכן להגדרה';
      }
      if (k.id === 'kpi8' && track) {
        k.value = track.track === 'seo' ? 'SEO הושלם' : k.value;
      }
    });
  }

  function overlayAudience(data, snap) {
    var biz = snap.biz || {};
    if (!biz.targetAudience && !biz.summary) return;
    var acc = data.audience_acc || [];
    acc.forEach(function (item) {
      if (item.t === 'קהלי יעד' && biz.targetAudience) {
        item.body = biz.targetAudience;
      }
    });
  }

  function overlayCompetitors(data, snap) {
    var comps = snap.competitors || [];
    if (!comps.length) return;
    data.competitors_accordion = comps.map(function (c, i) {
      var name = c.name || c.bizName || c.companyName || ('מתחרה ' + (i + 1));
      var note = c.strengths || c.weaknesses || c.notes || c.summary || '';
      return { t: name, body: note || 'נתונים מ-Business Discovery (חלק א׳)' };
    });
  }

  function overlayAssets(data, snap) {
    var biz = snap.biz || {};
    var asset = snap.asset;
    if (biz.site) {
      var host = biz.site.replace(/^https?:\/\//, '').split('/')[0];
      var exists = data.assets.some(function (a) { return a.name === host; });
      if (!exists && host) {
        data.assets.unshift({ icon: '🌐', name: host, type: 'אתר (מחלק א׳)', status: 'מחובר' });
      }
    }
    if (asset && (asset.url || asset.domain || asset.label)) {
      var label = asset.label || asset.url || asset.domain;
      var ex2 = data.assets.some(function (a) { return a.name === label; });
      if (!ex2) {
        data.assets.unshift({ icon: '⭐', name: label, type: 'נכס פעיל', status: 'נבחר' });
      }
    }
  }

  function mergeListByName(existing, incoming, key) {
    key = key || 'name';
    var map = {};
    (existing || []).forEach(function (item) { map[item[key]] = item; });
    (incoming || []).forEach(function (item) {
      if (!item[key]) return;
      map[item[key]] = Object.assign({}, map[item[key]] || {}, item);
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function overlayFromApi(data, apiSnap) {
    if (!apiSnap || !data) return;
    if (apiSnap.integrations && apiSnap.integrations.length) {
      data.integrations = mergeListByName(data.integrations, apiSnap.integrations, 'name');
    }
    if (apiSnap.assets && apiSnap.assets.length) {
      data.assets = mergeListByName(data.assets, apiSnap.assets, 'name');
    }
    if (apiSnap.keywords && apiSnap.keywords.length) {
      var wiredKws = data.keywords.filter(function (k) { return !k.source || k.source !== 'api'; });
      data.keywords = wiredKws.concat(apiSnap.keywords);
    }
    if (apiSnap.seo_accordion && apiSnap.seo_accordion.length) {
      data.seo_accordion = apiSnap.seo_accordion.concat(
        data.seo_accordion.filter(function (s) { return /Mock|דמו/i.test(s.body); })
      ).slice(0, 12);
    }
    if (apiSnap.ads_accordion && apiSnap.ads_accordion.length) {
      data.ads_accordion = apiSnap.ads_accordion;
    }
    if (apiSnap.pages && apiSnap.pages.length) {
      data.pages = mergeListByName(data.pages, apiSnap.pages, 'name');
    }
    if (apiSnap.stats) {
      var st = apiSnap.stats;
      data.kpis.forEach(function (k) {
        if (k.id === 'kpi4' && st.avgPosition) k.value = '#' + st.avgPosition + ' ממוצע';
        if (k.id === 'kpi13' && apiSnap.workPlan && apiSnap.workPlan.summary) {
          k.value = apiSnap.workPlan.summary.actionsOpen || k.value;
        }
      });
    }
    if (apiSnap.clientFromDb && apiSnap.clientFromDb.name) {
      data._liveClient = apiSnap.clientFromDb;
    }
    if (apiSnap.workPlanProgress) {
      var wp = apiSnap.workPlanProgress;
      data.kpis.forEach(function (k) {
        if (k.id === 'kpi8' && wp.assistantsCompletedEstimate) {
          k.value = wp.assistantsCompletedEstimate + ' הושלמו (work-plan)';
        }
        if (k.id === 'kpi9' && wp.consultantsCompletedEstimate) {
          k.value = wp.consultantsCompletedEstimate + ' הושלמו (work-plan)';
        }
        if (k.id === 'kpi13' && wp.actionsOpen != null) {
          k.value = wp.actionsOpen + ' פתוחות';
        }
      });
      var doneCount = wp.assistantsCompletedEstimate || 0;
      if (doneCount > 0 && data.assistants) {
        data.assistants.forEach(function (a, i) {
          if (i < doneCount && a.status === 'ממתין') a.status = 'הושלם';
          else if (i < doneCount + 5 && a.status === 'ממתין') a.status = 'בתהליך';
        });
      }
    }
    if (apiSnap.googleAds) {
      var g = apiSnap.googleAds;
      data.kpis.forEach(function (k) {
        if (k.id === 'kpi5') {
          k.value = g.customerId
            ? ('CID ' + g.customerId + ' · ' + g.statusHe)
            : k.value;
        }
      });
      data._googleAdsReadOnly = g;
    }
  }

  function overlayProgress(data, progress) {
    if (!progress || !data) return;
    var p = progress.parts || {};
    data.kpis.forEach(function (k) {
      if (k.id === 'kpi8' && p.b && p.b.status === 'completed') k.value = (p.b.kw_count || '') + ' KW · אושר';
      if (k.id === 'kpi9' && progress.qaRated) k.value = progress.qaRated + ' דירוגי QA';
      if (k.id === 'kpi12' && p.a && p.a.status === 'completed') k.value = 'Brief אושר';
      if (k.id === 'kpi13' && p.b) k.value = p.b.approved ? 'SEO מאושר' : k.value;
    });
    if (progress.client && progress.client.name) {
      data._clientLabel = progress.client.name;
    }
  }

  function hydrateDashboard(data, apiSnap) {
    if (!data || typeof data !== 'object') return { data: data, snap: buildLiveSnapshot(), live: false };
    if (_busy.hydrate) return { data: data, snap: buildLiveSnapshot(), live: false, skipped: true };
    _busy.hydrate = true;
    try {
      var snap = buildLiveSnapshot();
      var progress = readProgress();
      if (!progress) progress = publishProgress({ silent: true });
    var hasWired = snap.hasLive;
      var hasApi = !!(apiSnap && apiSnap.dashboard);

      if (hasWired) {
        overlayKpis(data, snap);
        overlayAudience(data, snap);
        overlayCompetitors(data, snap);
        overlayAssets(data, snap);
      }
      if (hasApi) overlayFromApi(data, apiSnap);
      overlayProgress(data, progress);
      applyQAToData(data);

      return {
        data: data,
        snap: snap,
        progress: progress,
        api: apiSnap,
        live: hasWired || hasApi,
        mode: hasWired && hasApi ? 'wired+api' : (hasApi ? 'api' : (hasWired ? 'wired' : 'mock')),
      };
    } finally {
      _busy.hydrate = false;
    }
  }

  /* ── QA persistence ── */
  function loadQA() {
    return parseLs(KEYS.qa) || { assistants: {}, consultants: {} };
  }

  function saveQAEntry(kind, id, field, value) {
    var store = loadQA();
    var bucket = kind === 'a' ? 'assistants' : 'consultants';
    if (!store[bucket]) store[bucket] = {};
    if (!store[bucket][id]) store[bucket][id] = {};
    store[bucket][id][field] = value;
    store.updatedAt = new Date().toISOString();
    saveLs(KEYS.qa, store);
    return store;
  }

  function applyQAToData(data) {
    var store = loadQA();
    ['assistants', 'consultants'].forEach(function (bucket) {
      var list = bucket === 'assistants' ? data.assistants : data.consultants;
      var saved = store[bucket] || {};
      list.forEach(function (item) {
        if (saved[item.id]) {
          Object.assign(item.qa || (item.qa = {}), saved[item.id]);
        }
      });
    });
  }

  /* ── Schedule persistence ── */
  function loadSchedule() {
    return parseLs(KEYS.schedule);
  }

  function saveScheduleState(state) {
    state = state || {};
    state.updatedAt = new Date().toISOString();
    saveLs(KEYS.schedule, state);
    return state;
  }

  /* ── Global filter (v5 ↔ GFC) ── */
  function readFilter() {
    if (window.GlobalFilterContext && GlobalFilterContext.get) {
      return GlobalFilterContext.get();
    }
    return parseLs(KEYS.globalFilter) || {};
  }

  function writeFilterFromV5(fields) {
    fields = fields || {};
    var partial = {
      clientName: fields.client || '',
      campaignName: fields.campaign || '',
      assetLabel: fields.asset || '',
      dateRange: {
        preset: 'custom',
        from: fields.dateFrom || '',
        to: fields.dateTo || '',
      },
    };
    if (window.GlobalFilterContext && GlobalFilterContext.set) {
      return GlobalFilterContext.set(partial, { source: 'v5-dashboard', skipCascade: true });
    }
    var cur = parseLs(KEYS.globalFilter) || {};
    Object.assign(cur, partial);
    cur.version = 3;
    saveLs(KEYS.globalFilter, cur);
    return { ok: true };
  }

  function populateV5FilterBar() {
    var f = readFilter();
    var biz = readBiz();
    var clientSel = document.getElementById('f-client');
    var campSel = document.getElementById('f-campaign');
    var assetSel = document.getElementById('f-asset');
    var fromEl = document.getElementById('f-date-from');
    var toEl = document.getElementById('f-date-to');
    if (!clientSel) return;

    function ensureOption(sel, val) {
      if (!val) return;
      var found = false;
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].text === val || sel.options[i].value === val) { found = true; break; }
      }
      if (!found) {
        var opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        sel.appendChild(opt);
      }
      sel.value = val;
    }

    var clientName = f.clientName || biz.companyName || biz.bizName;
    var campaign = f.campaignName || (parseLs(KEYS.partA) || {}).campaignType;
    var asset = f.assetLabel || biz.site;
    if (clientName) ensureOption(clientSel, clientName);
    if (campaign) ensureOption(campSel, campaign);
    if (asset) ensureOption(assetSel, asset.replace(/^https?:\/\//, '').split('/')[0]);
    if (fromEl && f.dateRange && f.dateRange.from) fromEl.value = f.dateRange.from;
    if (toEl && f.dateRange && f.dateRange.to) toEl.value = f.dateRange.to;

    [clientSel, campSel, assetSel, fromEl, toEl].forEach(function (el) {
      if (!el || el._cocoFilterBound) return;
      el._cocoFilterBound = true;
      el.addEventListener('change', function () {
        writeFilterFromV5({
          client: clientSel.value,
          campaign: campSel.value,
          asset: assetSel.value,
          dateFrom: fromEl ? fromEl.value : '',
          dateTo: toEl ? toEl.value : '',
        });
      });
    });
  }

  function updateLiveBadge(result) {
    var badge = document.querySelector('.mockbadge');
    if (!badge) return;
    var r = result || {};
    if (r.live) {
      var labels = { 'wired+api': '🔗 WIRED + API', api: '📡 API אמיתי', wired: '🔗 WIRED · LS' };
      badge.textContent = labels[r.mode] || '🔗 מחובר';
      badge.style.background = 'rgba(34,197,94,.14)';
      badge.style.color = '#22c55e';
      badge.style.borderColor = 'rgba(34,197,94,.28)';
    }
  }

  function navigateToV5(opts) {
    opts = opts || {};
    var url = v5Url();
    if (opts.newTab) window.open(url, '_blank', 'noopener');
    else location.href = url;
  }

  function navigateToWired(opts) {
    opts = opts || {};
    var url = wiredUrl(opts);
    if (opts.newTab) {
      window.open(url, '_blank', 'noopener');
    } else {
      location.href = url;
    }
  }

  function refreshFromApis(data, hooks) {
    hooks = hooks || {};
    if (_busy.refresh) return Promise.resolve({ skipped: true });
    _busy.refresh = true;
    var done = function (result) {
      _busy.refresh = false;
      return result;
    };
    if (!window.CocoDaliaApiReader) {
      var result = hydrateDashboard(data, parseLs(KEYS.apiCache));
      updateLiveBadge(result);
      return Promise.resolve(done(result));
    }
    return CocoDaliaApiReader.fetchAll({ force: false }).then(function (apiSnap) {
      var result = hydrateDashboard(data, apiSnap);
      updateLiveBadge(result);
      populateV5FilterBar();
      if (apiSnap.clientFromDb && apiSnap.clientFromDb.name) {
        var f = readFilter();
        if (!f.clientName) writeFilterFromV5({ client: apiSnap.clientFromDb.name });
      }
      if (typeof hooks.onRefresh === 'function') hooks.onRefresh();
      return done(result);
    }).catch(function () {
      var result = hydrateDashboard(data, parseLs(KEYS.apiCache));
      updateLiveBadge(result);
      return done(result);
    });
  }

  function initV5Dashboard(data, hooks) {
    hooks = hooks || {};
    publishProgress({ silent: true });
    var result = hydrateDashboard(data, parseLs(KEYS.apiCache));
    updateLiveBadge(result);
    populateV5FilterBar();

    var sched = loadSchedule();
    if (sched && sched.preset) {
      var sel = document.getElementById('sched-select');
      if (sel) sel.value = sched.preset;
      var status = document.getElementById('schedule-status');
      if (status && sched.label) status.textContent = 'תזמון פעיל: ' + sched.label;
    }

    refreshFromApis(data, hooks);

    window.addEventListener('coco:auth-ready', function () {
      if (_busy.refresh) return;
      refreshFromApis(data, hooks);
    });

    var watchKeys = [KEYS.projectBrief, KEYS.partA, KEYS.partB, KEYS.biz, KEYS.trackComplete, KEYS.globalFilter, KEYS.qa, KEYS.progress, KEYS.apiCache];
    window.addEventListener('storage', function (e) {
      if (!e || !e.key) return;
      if (watchKeys.indexOf(e.key) >= 0) {
        if (_busy.hydrate || _busy.refresh) return;
        publishProgress({ silent: true });
        hydrateDashboard(data, parseLs(KEYS.apiCache));
        populateV5FilterBar();
        if (typeof hooks.onRefresh === 'function') hooks.onRefresh();
      }
    });

    return result;
  }

  function patchV5Handlers(data, renderAll) {
    var origUpdateQA = window.updateQA;
    window.updateQA = function (id, kind, field, value) {
      if (origUpdateQA) origUpdateQA(id, kind, field, value);
      else {
        var list = kind === 'a' ? data.assistants : data.consultants;
        var item = list.find(function (x) { return x.id === id; });
        if (item) {
          if (value === 'true') value = true;
          else if (value === 'false') value = false;
          else if (value === 'null') value = null;
          else if (field === 'quality_rating') value = value ? parseInt(value, 10) : null;
          item.qa[field] = value;
        }
      }
      saveQAEntry(kind, id, field, value);
    };

    var origSaveSchedule = window.saveSchedule;
    window.saveSchedule = function () {
      var preset = window.CURRENT_SCHEDULE || 'once';
      var labels = { once: 'חד פעמי', daily: 'כל יום', weekly: 'כל שבוע', monthly: 'כל חודש', custom: 'מותאם אישית' };
      saveScheduleState({ preset: preset, label: labels[preset] || preset });
      if (origSaveSchedule) origSaveSchedule();
    };

    window.cocoNavigateToWired = navigateToWired;
    window.cocoNavigateToV5 = navigateToV5;
  }

  function initWiredProgressWatcher() {
    publishProgress({ silent: true });
    var watchKeys = [KEYS.projectBrief, KEYS.partA, KEYS.partB, KEYS.partC, KEYS.trackComplete, KEYS.seoDraft, KEYS.gadsDraft, KEYS.qa];
    window.addEventListener('storage', function (e) {
      if (e && e.key && watchKeys.indexOf(e.key) >= 0) publishProgress({ silent: true });
    });
    setInterval(function () { publishProgress({ silent: true }); }, 15000);
  }

  /* ── WIRED shell: unlock + deep link ── */
  function applyWiredUnlockState(unlocked) {
    if (!unlocked || typeof unlocked !== 'object') return;
    var partA = parseLs(KEYS.partA);
    var partB = parseLs(KEYS.partB);
    var track = parseLs(KEYS.trackComplete);
    var brief = parseLs(KEYS.projectBrief);

    if (brief || partA) unlocked.a = true;
    if (partB && partB.approved) unlocked.b = true;
    if (partA && partA.gads_ready) unlocked.c = true;
    if (track) {
      if (track.track === 'seo') unlocked.b = true;
      if (track.track === 'ads') unlocked.c = true;
      unlocked.team = true;
    }
    if (partB && partB.approved) unlocked.team = true;
    unlocked.d = true;
  }

  function initWiredShell(opts) {
    opts = opts || {};
    var unlocked = opts.unlocked;
    if (unlocked) {
      applyWiredUnlockState(unlocked);
      ['b', 'c', 'team'].forEach(function (p) {
        if (unlocked[p]) {
          var mt = document.getElementById('mt-' + p);
          if (mt) mt.style.opacity = '1';
        }
      });
    }

    var params = new URLSearchParams(location.search);
    var part = params.get('part');
    if (part && typeof opts.showPart === 'function' && unlocked && unlocked[part]) {
      if (part === 'b' || part === 'c' || part === 'team') {
        unlocked[part] = true;
        var mt = document.getElementById('mt-' + part);
        if (mt) mt.style.opacity = '1';
      }
      opts.showPart(part);
    }

    window.addEventListener('storage', function (e) {
      if (!e || !e.key || !unlocked) return;
      if ([KEYS.partB, KEYS.trackComplete, KEYS.partA].indexOf(e.key) >= 0) {
        applyWiredUnlockState(unlocked);
      }
    });

    if (window.CocoDataAdapter) {
      CocoDataAdapter.syncPartAToBiz();
    }
    initWiredProgressWatcher();
  }

  function syncProjectBriefToLegacy() {
    var brief = parseLs(KEYS.projectBrief);
    if (!brief || !brief.biz) return null;
    var biz = brief.biz;
    var partA = {
      name: biz.contact || biz.bizName || '',
      bizName: biz.companyName || biz.bizName || '',
      site: biz.site || biz.website || '',
      ts: brief.ts || new Date().toISOString(),
      _source: 'dalia_project_brief',
    };
    saveLs(KEYS.partA, Object.assign(parseLs(KEYS.partA) || {}, partA));
    if (window.CocoDataAdapter && CocoDataAdapter.syncPartAToBiz) {
      CocoDataAdapter.syncPartAToBiz();
    }
    if (window.ProjectBrief && ProjectBrief.mergeFromLegacy) {
      ProjectBrief.mergeFromLegacy();
    }
    return partA;
  }

  window.CocoDaliaIntegration = {
    VERSION: VERSION,
    KEYS: KEYS,
    getBasePath: getBasePath,
    wiredUrl: wiredUrl,
    v5Url: v5Url,
    hasLiveData: hasLiveData,
    buildLiveSnapshot: buildLiveSnapshot,
    publishProgress: publishProgress,
    readProgress: readProgress,
    hydrateDashboard: hydrateDashboard,
    refreshFromApis: refreshFromApis,
    initV5Dashboard: initV5Dashboard,
    patchV5Handlers: patchV5Handlers,
    navigateToWired: navigateToWired,
    navigateToV5: navigateToV5,
    populateV5FilterBar: populateV5FilterBar,
    saveQAEntry: saveQAEntry,
    loadQA: loadQA,
    saveScheduleState: saveScheduleState,
    loadSchedule: loadSchedule,
    initWiredShell: initWiredShell,
    initWiredProgressWatcher: initWiredProgressWatcher,
    applyWiredUnlockState: applyWiredUnlockState,
    syncProjectBriefToLegacy: syncProjectBriefToLegacy,
    readFilter: readFilter,
    writeFilterFromV5: writeFilterFromV5,
  };

  window.addEventListener('storage', function (e) {
    if (e && e.key === KEYS.projectBrief) syncProjectBriefToLegacy();
  });
  if (parseLs(KEYS.projectBrief)) syncProjectBriefToLegacy();
})();
