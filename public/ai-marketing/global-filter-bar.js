/**
 * Global Filter Bar — unified cascade filter UI on all marketing screens (Phase B).
 * Compact primary row + expandable advanced filters. Writes only via GlobalFilterContext.
 */
(function () {
  'use strict';

  var _wired = false;
  var _uiGuard = false;
  var SEARCH_DEBOUNCE = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function el(id) {
    return document.getElementById(id);
  }

  function fillSelect(sel, items, placeholder, selectedId) {
    if (!sel) return;
    var html = '<option value="">' + esc(placeholder) + '</option>';
    items.forEach(function (it) {
      var id = it.id || it.value || '';
      var label = it.labelHe || it.name || it.label || id;
      html += '<option value="' + esc(id) + '"' + (selectedId === id ? ' selected' : '') + '>' + esc(label) + '</option>';
    });
    sel.innerHTML = html;
    sel.disabled = items.length === 0;
  }

  function summaryText(ctx) {
    var parts = [];
    if (ctx.clientName || ctx.clientId) parts.push(ctx.clientName || ctx.clientId);
    if (ctx.activityType) {
      var act = window.FilterTaxonomy && FilterTaxonomy.getActivityType(ctx.activityType);
      parts.push(act ? act.labelHe : ctx.activityType);
    }
    if (ctx.campaignName || ctx.campaignId) parts.push((ctx.campaignName || ctx.campaignId).slice(0, 24));
    if (ctx.assetLabel) parts.push(ctx.assetLabel);
    if (ctx.subCategory && ctx.subCategory.labelHe) parts.push(ctx.subCategory.labelHe);
    if (ctx.specificItem && ctx.specificItem.label) parts.push(String(ctx.specificItem.label).slice(0, 20));
    return parts.length ? parts.join(' › ') : 'סינון: כללי';
  }

  function renderFiltersHtml() {
    return (
      '<div class="gfc-primary">' +
      '<select id="gfc-client" class="filter-select gfc-select" title="לקוח"><option value="">לקוח…</option></select>' +
      '<select id="gfc-activity" class="filter-select gfc-select" title="סוג פעילות" disabled><option value="">סוג פעילות…</option></select>' +
      '<select id="gfc-campaign" class="filter-select gfc-select" title="קמפיין" disabled><option value="">קמפיין…</option></select>' +
      '<select id="gfc-asset" class="filter-select gfc-select" title="נכס דיגיטלי" disabled><option value="">נכס…</option></select>' +
      '<button type="button" id="gfc-advanced-toggle" class="btn btn-ghost gfc-adv-btn" title="סינון מתקדם">▾ עוד</button>' +
      '</div>' +
      '<div class="gfc-advanced" id="gfc-advanced" style="display:none;">' +
      '<select id="gfc-subcat" class="filter-select gfc-select" title="תת-קטגוריה" disabled><option value="">תת-קטגוריה…</option></select>' +
      '<select id="gfc-item" class="filter-select gfc-select gfc-item-select" title="פריט ספציפי" disabled><option value="">פריט ספציפי…</option></select>' +
      '<select id="gfc-date" class="filter-select gfc-select" title="תאריך"><option value="">תאריך…</option></select>' +
      '<select id="gfc-status" class="filter-select gfc-select" title="סטטוס"><option value="">סטטוס…</option></select>' +
      '<input id="coco-central-search" class="filter-input cfc-search gfc-search" placeholder="🔍 חיפוש מהיר">' +
      '<button type="button" id="gfc-reset" class="btn btn-ghost gfc-reset-btn" title="איפוס סינון">✕ איפוס</button>' +
      '<span id="gfc-date-custom" class="gfc-date-custom" style="display:none;">' +
      '<input type="date" id="gfc-date-from" class="filter-input gfc-date-inp">' +
      '<input type="date" id="gfc-date-to" class="filter-input gfc-date-inp">' +
      '</span>' +
      '<button type="button" id="coco-sync-google-btn" class="btn btn-ghost cfc-sync-btn">🔄 Google</button>' +
      '</div>'
    );
  }

  function mountIntoBar() {
    var filtersRow = el('coco-cfc-filters');
    if (!filtersRow) return false;
    if (el('gfc-client')) return true;
    filtersRow.innerHTML = renderFiltersHtml();
    filtersRow.classList.add('gfc-mounted');
    wireControls();
    return true;
  }

  function populateFromContext() {
    if (!window.GlobalFilterContext || !window.FilterEntityIndex) return;
    _uiGuard = true;
    var ctx = GlobalFilterContext.get();
    var clients = FilterEntityIndex.getClients();
    fillSelect(el('gfc-client'), clients, 'לקוח…', ctx.clientId);

    var acts = (window.FilterTaxonomy && FilterTaxonomy.ACTIVITY_TYPES) || [];
    fillSelect(el('gfc-activity'), acts, 'סוג פעילות…', ctx.activityType);
    el('gfc-activity').disabled = !ctx.clientId;

    var camps = ctx.clientId ? FilterEntityIndex.getCampaigns(ctx.clientId) : [];
    fillSelect(el('gfc-campaign'), camps, 'קמפיין…', ctx.campaignId);
    el('gfc-campaign').disabled = !ctx.activityType;

    var assets = ctx.campaignId ? FilterEntityIndex.getAssets(ctx.campaignId) : [];
    var assetOpts = assets.map(function (a) {
      return { id: a.id, labelHe: (a.domain || a.label) + ' (' + (a.type || 'asset') + ')' };
    });
    fillSelect(el('gfc-asset'), assetOpts, 'נכס…', ctx.assetId);
    el('gfc-asset').disabled = !ctx.campaignId;

    var schemaId = ctx.activityType && FilterTaxonomy.subSchemaForActivity(ctx.activityType);
    var subOpts = schemaId ? FilterTaxonomy.getSubSchema(schemaId) : [];
    fillSelect(el('gfc-subcat'), subOpts, 'תת-קטגוריה…', ctx.subCategory && ctx.subCategory.id);
    el('gfc-subcat').disabled = !ctx.assetId;

    populateSpecificItems(ctx);

    var dates = (window.FilterTaxonomy && FilterTaxonomy.DATE_PRESETS) || [];
    fillSelect(el('gfc-date'), dates, 'תאריך…', ctx.dateRange && ctx.dateRange.preset);
    var stats = (window.FilterTaxonomy && FilterTaxonomy.STATUS_OPTIONS) || [];
    fillSelect(el('gfc-status'), stats, 'סטטוס…', ctx.status);

    var search = el('coco-central-search');
    if (search) search.value = ctx.freeSearch || '';
    var chip = el('coco-unified-filter-chip');
    if (chip) chip.textContent = summaryText(ctx);
    var clientChip = el('coco-unified-client-chip');
    if (clientChip && ctx.clientId) {
      clientChip.textContent = 'לקוח: ' + String(ctx.clientName || ctx.clientId).slice(0, 32);
    }
    var assetChip = el('coco-unified-asset-chip');
    if (assetChip) {
      assetChip.textContent = 'נכס: ' + String(ctx.assetLabel || '—').slice(0, 28);
    }
    var custom = el('gfc-date-custom');
    if (custom) custom.style.display = (ctx.dateRange && ctx.dateRange.preset === 'custom') ? 'inline-flex' : 'none';
    if (ctx.dateRange) {
      if (el('gfc-date-from')) el('gfc-date-from').value = ctx.dateRange.from || '';
      if (el('gfc-date-to')) el('gfc-date-to').value = ctx.dateRange.to || '';
    }
    _uiGuard = false;
  }

  function populateSpecificItems(ctx) {
    var itemSel = el('gfc-item');
    if (!itemSel) return;
    if (!ctx.assetId) {
      itemSel.disabled = true;
      itemSel.innerHTML = '<option value="">פריט ספציפי…</option>';
      return;
    }
    var kind = ctx.subCategory && FilterTaxonomy.isPageKind && FilterTaxonomy.isPageKind(ctx.subCategory.id)
      ? ctx.subCategory.id : null;
    var res = FilterEntityIndex.getSpecificItems(ctx.assetId, { kind: kind, limit: 100 });
    var items = res.items || [];
    var html = '<option value="">פריט ספציפי…</option>';
    items.forEach(function (it) {
      var sel = ctx.specificItem && ctx.specificItem.id === it.id;
      html += '<option value="' + esc(it.id) + '"' + (sel ? ' selected' : '') + ' data-type="' + esc(it.type) + '" data-path="' + esc(it.path || '') + '">' + esc(it.label) + '</option>';
    });
    if (res.total > items.length) {
      html += '<option value="" disabled>… +' + (res.total - items.length) + ' (השתמש בחיפוש)</option>';
    }
    itemSel.innerHTML = html;
    itemSel.disabled = items.length === 0 && !ctx.assetId;
  }

  function onClientChange(val) {
    var client = FilterEntityIndex.findClient(val);
    GlobalFilterContext.set({
      clientId: val || null,
      clientName: client ? client.name : '',
    }, { source: 'gfc-bar' });
  }

  function onActivityChange(val) {
    GlobalFilterContext.set({ activityType: val || null }, { source: 'gfc-bar' });
  }

  function onCampaignChange(val) {
    var ctx = GlobalFilterContext.get();
    var camp = FilterEntityIndex.findCampaign(ctx.clientId, val);
    GlobalFilterContext.set({
      campaignId: val || null,
      campaignName: camp ? camp.name : '',
      campaign: val || '',
    }, { source: 'gfc-bar' });
  }

  function onAssetChange(val) {
    var ctx = GlobalFilterContext.get();
    var asset = FilterEntityIndex.findAsset(ctx.campaignId, val);
    GlobalFilterContext.set({
      assetId: val || null,
      assetType: asset ? asset.type : null,
      assetLabel: asset ? (asset.domain || asset.label) : '',
    }, { source: 'gfc-bar' });
  }

  function onSubcatChange(val) {
    if (!val) {
      GlobalFilterContext.set({ subCategory: null }, { source: 'gfc-bar' });
      return;
    }
    var ctx = GlobalFilterContext.get();
    var schemaId = FilterTaxonomy.subSchemaForActivity(ctx.activityType);
    var sub = (FilterTaxonomy.getSubSchema(schemaId) || []).find(function (s) { return s.id === val; });
    GlobalFilterContext.set({
      subCategory: sub ? { id: sub.id, labelHe: sub.labelHe, matchType: sub.matchType, type: sub.matchType } : null,
    }, { source: 'gfc-bar' });
  }

  function onItemChange(val) {
    if (!val) {
      GlobalFilterContext.set({ specificItem: null }, { source: 'gfc-bar' });
      return;
    }
    var sel = el('gfc-item');
    var opt = sel && sel.options[sel.selectedIndex];
    GlobalFilterContext.set({
      specificItem: {
        type: (opt && opt.getAttribute('data-type')) || 'page',
        id: val,
        label: opt ? opt.textContent : val,
        path: opt ? opt.getAttribute('data-path') : '',
      },
    }, { source: 'gfc-bar' });
  }

  function onDateChange(val) {
    var ctx = GlobalFilterContext.get();
    var dr = Object.assign({}, ctx.dateRange || { from: '', to: '' }, { preset: val || 'month' });
    GlobalFilterContext.set({ dateRange: dr }, { skipCascade: true, source: 'gfc-bar', allowInvalid: true });
    var custom = el('gfc-date-custom');
    if (custom) custom.style.display = val === 'custom' ? 'inline-flex' : 'none';
  }

  function onStatusChange(val) {
    GlobalFilterContext.set({ status: val || null }, { skipCascade: true, source: 'gfc-bar', allowInvalid: true });
  }

  function onSearchInput(val) {
    clearTimeout(SEARCH_DEBOUNCE);
    SEARCH_DEBOUNCE = setTimeout(function () {
      GlobalFilterContext.set({ freeSearch: val || '' }, { skipCascade: true, source: 'gfc-bar', allowInvalid: true });
    }, 300);
  }

  function onResetClick() {
    GlobalFilterContext.set({
      subCategory: null,
      specificItem: null,
      status: null,
      freeSearch: '',
      dateRange: { preset: 'month', from: '', to: '' },
    }, { skipCascade: true, source: 'gfc-bar', allowInvalid: true });
  }

  function wireControls() {
    if (_wired) return;
    _wired = true;

    el('gfc-client')?.addEventListener('change', function (e) { if (!_uiGuard) onClientChange(e.target.value); });
    el('gfc-activity')?.addEventListener('change', function (e) { if (!_uiGuard) onActivityChange(e.target.value); });
    el('gfc-campaign')?.addEventListener('change', function (e) { if (!_uiGuard) onCampaignChange(e.target.value); });
    el('gfc-asset')?.addEventListener('change', function (e) { if (!_uiGuard) onAssetChange(e.target.value); });
    el('gfc-subcat')?.addEventListener('change', function (e) { if (!_uiGuard) onSubcatChange(e.target.value); });
    el('gfc-item')?.addEventListener('change', function (e) { if (!_uiGuard) onItemChange(e.target.value); });
    el('gfc-date')?.addEventListener('change', function (e) { if (!_uiGuard) onDateChange(e.target.value); });
    el('gfc-status')?.addEventListener('change', function (e) { if (!_uiGuard) onStatusChange(e.target.value); });
    el('coco-central-search')?.addEventListener('input', function (e) { if (!_uiGuard) onSearchInput(e.target.value); });
    el('gfc-date-from')?.addEventListener('change', function () {
      if (_uiGuard) return;
      var ctx = GlobalFilterContext.get();
      GlobalFilterContext.set({
        dateRange: Object.assign({}, ctx.dateRange, { from: el('gfc-date-from').value, preset: 'custom' }),
      }, { skipCascade: true, source: 'gfc-bar', allowInvalid: true });
    });
    el('gfc-date-to')?.addEventListener('change', function () {
      if (_uiGuard) return;
      var ctx = GlobalFilterContext.get();
      GlobalFilterContext.set({
        dateRange: Object.assign({}, ctx.dateRange, { to: el('gfc-date-to').value, preset: 'custom' }),
      }, { skipCascade: true, source: 'gfc-bar', allowInvalid: true });
    });
    el('gfc-reset')?.addEventListener('click', function () { if (!_uiGuard) onResetClick(); });
    el('gfc-advanced-toggle')?.addEventListener('click', function () {
      var adv = el('gfc-advanced');
      var btn = el('gfc-advanced-toggle');
      if (!adv) return;
      var open = adv.style.display !== 'none';
      adv.style.display = open ? 'none' : 'flex';
      if (btn) btn.textContent = open ? '▾ עוד' : '▴ פחות';
      el('coco-unified-context-bar')?.classList.toggle('gfc-expanded', !open);
    });
    el('coco-cfc-toggle')?.addEventListener('click', function () {
      el('coco-unified-context-bar')?.classList.toggle('is-expanded');
    });
  }

  function init() {
    return (window.GlobalFilterContext && GlobalFilterContext.whenReady
      ? GlobalFilterContext.whenReady()
      : Promise.resolve()
    ).then(function () {
      mountIntoBar();
      populateFromContext();
      window.GlobalFilterBar._inited = true;
      if (window.GlobalFilterContext && !GlobalFilterContext._barListener) {
        GlobalFilterContext._barListener = true;
        GlobalFilterContext.onChange(function (detail) {
          if (detail && detail.source === 'gfc-bar') return;
          populateFromContext();
        });
      }
    });
  }

  function place(screenId) {
    if (screenId === 'screen-crm') return;
    if (window.CocoUnified && CocoUnified.placeContextBar) {
      CocoUnified.placeContextBar(screenId);
    }
    mountIntoBar();
    populateFromContext();
  }

  window.GlobalFilterBar = {
    init: init,
    place: place,
    mountIntoBar: mountIntoBar,
    populateFromContext: populateFromContext,
    summaryText: summaryText,
  };
})();
