/**
 * Asset Flow SSOT — בחירת נכס פעיל וסנכרון כל מסכי השיווק
 * לקוח חדש נפתח רק מדליה הראשית; כאן מוסיפים נכסים/API/עוזרים ללקוח קיים בלבד.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'coco-active-asset-v1';
  var PENDING_ASSETS_KEY = 'coco-pending-assets-v1';

  var ASSET_TYPES = [
    { id: 'website', icon: '🌐', label: 'אתר נוסף' },
    { id: 'landing', icon: '📄', label: 'דף נחיתה' },
    { id: 'gbp', icon: '📍', label: 'Google Business Profile' },
    { id: 'facebook', icon: '📘', label: 'Facebook' },
    { id: 'instagram', icon: '📸', label: 'Instagram' },
    { id: 'tiktok', icon: '🎵', label: 'TikTok' },
    { id: 'youtube', icon: '▶️', label: 'YouTube' },
    { id: 'linkedin', icon: '💼', label: 'LinkedIn' },
    { id: 'app', icon: '📱', label: 'אפליקציה' },
    { id: 'system', icon: '⚙️', label: 'מערכת נוספת' },
    { id: 'other', icon: '🔗', label: 'נכס דיגיטלי אחר' },
  ];

  var API_TYPES = [
    { id: 'google_ads', icon: '📢', label: 'Google Ads' },
    { id: 'meta_ads', icon: '📘', label: 'Meta Marketing API' },
    { id: 'tiktok_ads', icon: '🎵', label: 'TikTok Business API' },
    { id: 'linkedin_ads', icon: '💼', label: 'LinkedIn Marketing API' },
    { id: 'mailchimp', icon: '📧', label: 'Email / Mailchimp' },
    { id: 'whatsapp', icon: '💬', label: 'WhatsApp Business API' },
    { id: 'custom', icon: '🔌', label: 'API מותאם אישית' },
  ];

  var ASSISTANT_TYPES = [
    { id: 'openai', icon: '🤖', label: 'ChatGPT / OpenAI' },
    { id: 'claude', icon: '🧠', label: 'Claude (Anthropic)' },
    { id: 'gemini', icon: '✨', label: 'Gemini (Google)' },
    { id: 'custom', icon: '🛠️', label: 'עוזר AI ייעודי' },
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function primaryAsset() {
    var off = window.ClientIdSsot && ClientIdSsot.OFFICIAL;
    var camp = window.ClientIdSsot && ClientIdSsot.PRIMARY_CAMPAIGN;
    return {
      id: 'asset-dalia-c-com',
      type: 'website',
      icon: '🌐',
      label: (off && off.domain) || 'dalia-c.com',
      domain: (off && off.domain) || 'dalia-c.com',
      url: (off && off.url) || 'https://dalia-c.com/',
      status: 'active',
      clientId: (off && off.clientId) || 'dalia-c-official',
      campaignId: (camp && camp.id) || 'campaign-dalia-seo-primary',
      campaignName: (camp && camp.name) || 'דליה — קידום dalia-c.com',
      live: true,
    };
  }

  function readPendingAssets() {
    try {
      var raw = localStorage.getItem(PENDING_ASSETS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function writePendingAssets(list) {
    try {
      localStorage.setItem(PENDING_ASSETS_KEY, JSON.stringify(list));
    } catch (e) { /* ignore */ }
  }

  function getAssets() {
    return [primaryAsset()].concat(readPendingAssets());
  }

  function getActiveAssetId() {
    try {
      return localStorage.getItem(STORAGE_KEY) || primaryAsset().id;
    } catch (e) {
      return primaryAsset().id;
    }
  }

  function getActiveAsset() {
    var id = getActiveAssetId();
    var found = getAssets().filter(function (a) { return a.id === id; })[0];
    return found || primaryAsset();
  }

  function applyToFlowContext(asset) {
    if (!window.COCO) window.COCO = {};
    var a = asset || getActiveAsset();
    COCO.flowContext = Object.assign(COCO.flowContext || {}, {
      activeAssetId: a.id,
      site: a.domain || a.label,
      domain: a.domain || a.label,
      assetType: a.type,
      campaign: a.campaignId || COCO.flowContext.campaign,
      campaignName: a.campaignName || COCO.flowContext.campaignName,
    });
    try {
      localStorage.setItem('coco-flow-context-v2', JSON.stringify(COCO.flowContext));
      localStorage.setItem(STORAGE_KEY, a.id);
    } catch (e) { /* ignore */ }
    return COCO.flowContext;
  }

  function refreshAllScreens() {
    applyToFlowContext();
    if (window.CocoClaude && CocoClaude.applyContextGlobally) CocoClaude.applyContextGlobally();
    if (window.DaliaSite) {
      if (typeof DaliaSite.applySiteLabels === 'function') DaliaSite.applySiteLabels();
      if (typeof DaliaSite.renderClientsLive === 'function') DaliaSite.renderClientsLive();
      if (typeof DaliaSite.renderClientsAssetsLive === 'function') DaliaSite.renderClientsAssetsLive();
      if (typeof DaliaSite.renderClientsSetupLive === 'function') DaliaSite.renderClientsSetupLive();
      if (typeof DaliaSite.renderStatusLive === 'function' && DaliaSite.getDashboard) {
        DaliaSite.renderStatusLive(DaliaSite.getDashboard());
      }
      if (typeof DaliaSite.renderAssetsLive === 'function') DaliaSite.renderAssetsLive();
    }
    if (window.MarketingSsot && MarketingSsot.refreshUi) MarketingSsot.refreshUi();
    if (window.CocoData && CocoData.bindAll) CocoData.bindAll();
    if (window.CocoMarketingUnified && CocoMarketingUnified.updateContextBar) CocoMarketingUnified.updateContextBar();
    if (window.CocoUnified && CocoUnified.updateContextBar) CocoUnified.updateContextBar();
    if (window.CocoIntegrationHub && CocoIntegrationHub.renderAgentsLive && window.DaliaSite) {
      CocoIntegrationHub.renderAgentsLive(DaliaSite.getDashboard && DaliaSite.getDashboard());
    }
    wireActionButtons();
  }

  function selectActiveAsset(assetId) {
    var asset = getAssets().filter(function (a) { return a.id === assetId; })[0];
    if (!asset) return;
    if (asset.status === 'draft' || asset.status === 'pending') {
      if (typeof showToast === 'function') {
        showToast('⏳ הנכס «' + asset.label + '» ממתין לחיבור — בחר נכס פעיל');
      }
      return;
    }
    applyToFlowContext(asset);
    refreshAllScreens();
    if (typeof showToast === 'function') {
      showToast('🌐 נכס פעיל: ' + (asset.domain || asset.label));
    }
  }

  function ensureModal(id, title, bodyHtml) {
    var el = document.getElementById(id);
    if (el) return el;
    el = document.createElement('div');
    el.className = 'overlay';
    el.id = id;
    el.innerHTML =
      '<div class="modal" style="max-width:520px;">' +
      '<div class="modal-title">' + esc(title) + '</div>' +
      '<div id="' + id + '-body">' + bodyHtml + '</div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-ghost" onclick="closeModal(\'' + id + '\')">סגור</button>' +
      '</div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target === el) closeModal(id);
    });
    return el;
  }

  function openAddAssetModal() {
    ensureModal('modal-add-asset', '➕ הוספת נכס חדש', '');
    var body = document.getElementById('modal-add-asset-body');
    if (!body) return;
    body.innerHTML =
      '<div class="alert alert-info" style="margin-bottom:12px;font-size:12px;">נכסים חדשים מתווספים ללקוח הקיים בלבד. פתיחת לקוח חדש מתבצעת במערכת דליה הראשית.</div>' +
      '<div style="font-size:12px;color:var(--white50);margin-bottom:6px;">סוג נכס</div>' +
      '<select id="coco-add-asset-type" class="filter-select" style="width:100%;margin-bottom:12px;">' +
      ASSET_TYPES.map(function (t) {
        return '<option value="' + esc(t.id) + '">' + t.icon + ' ' + esc(t.label) + '</option>';
      }).join('') +
      '</select>' +
      '<div style="font-size:12px;color:var(--white50);margin-bottom:6px;">שם / כתובת הנכס</div>' +
      '<input id="coco-add-asset-label" class="filter-input" style="width:100%;margin-bottom:12px;" placeholder="לדוגמה: landing.example.com">' +
      '<div style="font-size:11px;color:var(--white50);margin-bottom:14px;">שלב זה: שמירת תשתית בלבד — חיבור אמיתי יופעל בהמשך.</div>' +
      '<button type="button" class="btn btn-primary" id="coco-add-asset-save">💾 שמור נכס (ממתין)</button>';
    openModal('modal-add-asset');
    document.getElementById('coco-add-asset-save').onclick = function () {
      var typeId = document.getElementById('coco-add-asset-type').value;
      var label = (document.getElementById('coco-add-asset-label').value || '').trim();
      if (!label) {
        if (typeof showToast === 'function') showToast('הזן שם או כתובת לנכס');
        return;
      }
      var typeDef = ASSET_TYPES.filter(function (t) { return t.id === typeId; })[0] || ASSET_TYPES[0];
      var pending = readPendingAssets();
      pending.push({
        id: 'asset-pending-' + Date.now(),
        type: typeId,
        icon: typeDef.icon,
        label: label,
        domain: label.replace(/^https?:\/\//i, '').replace(/\/$/, ''),
        url: /^https?:\/\//i.test(label) ? label : '',
        status: 'draft',
        clientId: (window.ClientIdSsot && ClientIdSsot.OFFICIAL.clientId) || 'dalia-c-official',
        live: false,
      });
      writePendingAssets(pending);
      closeModal('modal-add-asset');
      refreshAllScreens();
      if (typeof showToast === 'function') showToast('✓ נכס «' + label + '» נשמר — ממתין לחיבור');
    };
  }

  function openAddApiModal() {
    ensureModal('modal-add-api', '➕ חיבור API חדש', '');
    var body = document.getElementById('modal-add-api-body');
    if (!body) return;
    body.innerHTML =
      '<div class="alert alert-info" style="margin-bottom:12px;font-size:12px;">חיבורי API מתווספים לנכס הפעיל: <strong>' + esc(getActiveAsset().domain || getActiveAsset().label) + '</strong></div>' +
      '<div style="font-size:12px;color:var(--white50);margin-bottom:6px;">סוג שירות</div>' +
      '<select id="coco-add-api-type" class="filter-select" style="width:100%;margin-bottom:12px;">' +
      API_TYPES.map(function (t) {
        return '<option value="' + esc(t.id) + '">' + t.icon + ' ' + esc(t.label) + '</option>';
      }).join('') +
      '</select>' +
      '<div style="font-size:11px;color:var(--white50);margin-bottom:14px;">שלב זה: תשתית בלבד — OAuth וחיבור אמיתי יופעלו בהמשך.</div>' +
      '<button type="button" class="btn btn-primary" id="coco-add-api-save">🔗 הוסף לרשימה (ממתין)</button>';
    openModal('modal-add-api');
    document.getElementById('coco-add-api-save').onclick = function () {
      closeModal('modal-add-api');
      if (typeof showToast === 'function') showToast('⏳ חיבור API נשמר לתשתית — ממתין להפעלה');
    };
  }

  function openAddAssistantModal() {
    ensureModal('modal-add-assistant', '➕ חיבור עוזר חדש', '');
    var body = document.getElementById('modal-add-assistant-body');
    if (!body) return;
    body.innerHTML =
      '<div class="alert alert-info" style="margin-bottom:12px;font-size:12px;">עוזרים סורקים את הנכס הפעיל: <strong>' + esc(getActiveAsset().domain || getActiveAsset().label) + '</strong></div>' +
      '<div style="font-size:12px;color:var(--white50);margin-bottom:6px;">סוג עוזר</div>' +
      '<select id="coco-add-assistant-type" class="filter-select" style="width:100%;margin-bottom:12px;">' +
      ASSISTANT_TYPES.map(function (t) {
        return '<option value="' + esc(t.id) + '">' + t.icon + ' ' + esc(t.label) + '</option>';
      }).join('') +
      '</select>' +
      '<div style="font-size:11px;color:var(--white50);margin-bottom:14px;">שלב זה: תשתית בלבד — מפתחות API וסריקה אמיתית יופעלו בהמשך.</div>' +
      '<button type="button" class="btn btn-primary" id="coco-add-assistant-save">🤖 הוסף עוזר (ממתין)</button>';
    openModal('modal-add-assistant');
    document.getElementById('coco-add-assistant-save').onclick = function () {
      closeModal('modal-add-assistant');
      if (typeof showToast === 'function') showToast('⏳ עוזר AI נשמר לתשתית — ממתין להפעלה');
    };
  }

  function actionBtn(label, onclickName) {
    return '<button type="button" class="btn btn-primary" style="font-size:12px;padding:5px 12px;" onclick="' + onclickName + '()">' + esc(label) + '</button>';
  }

  function ensureActionMount(tabId, mountId, afterSelector) {
    var tab = document.getElementById(tabId);
    if (!tab) return null;
    var mount = document.getElementById(mountId);
    if (mount) return mount;
    mount = document.createElement('div');
    mount.id = mountId;
    mount.className = 'coco-live-section';
    mount.style.cssText = 'padding:0 20px 12px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;';
    var anchor = tab.querySelector(afterSelector || '.page-header');
    if (anchor) anchor.insertAdjacentElement('afterend', mount);
    else tab.insertBefore(mount, tab.firstChild);
    return mount;
  }

  function wireActionButtons() {
    var setupMount = ensureActionMount('tab-clients-setup', 'coco-live-setup-actions', '.page-header');
    if (setupMount) {
      setupMount.innerHTML = actionBtn('➕ הוספת נכס חדש', 'AssetFlowSsot.openAddAssetModal');
    }

    var apiMount = ensureActionMount('tab-clients-integrations', 'coco-live-api-actions', '.page-header');
    if (apiMount) {
      apiMount.innerHTML = actionBtn('➕ חיבור API חדש', 'AssetFlowSsot.openAddApiModal');
    }

    var agentsScreen = document.getElementById('screen-agents');
    if (agentsScreen) {
      var topbarLeft = agentsScreen.querySelector('.topbar-left');
      if (topbarLeft && !document.getElementById('coco-add-assistant-btn')) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'coco-add-assistant-btn';
        btn.className = 'btn btn-primary';
        btn.style.cssText = 'font-size:12px;padding:5px 12px;';
        btn.textContent = '➕ חיבור עוזר חדש';
        btn.onclick = function () { openAddAssistantModal(); };
        var scanBtn = topbarLeft.querySelector('.btn-primary');
        if (scanBtn) topbarLeft.insertBefore(btn, scanBtn);
        else topbarLeft.insertBefore(btn, topbarLeft.firstChild);
      }
    }
  }

  function hideNewClientButtons() {
    document.querySelectorAll('#screen-clients .btn, #screen-clients button').forEach(function (btn) {
      if (/לקוח חדש/i.test(btn.textContent || '')) btn.style.display = 'none';
    });
  }

  function getChainSnapshot() {
    var ctx = (window.COCO && COCO.flowContext) || {};
    var asset = getActiveAsset();
    return {
      step1_client: ctx.clientId || null,
      step2_activeAsset: asset.id,
      step2_domain: asset.domain || asset.label,
      step3_campaign: ctx.campaign || asset.campaignId,
      step4_channelsSource: asset.live ? 'dashboard.json' : 'pending',
      step5_agentsScope: asset.domain || asset.label,
      step6_goalsSource: 'site-work-plan.json',
      step7_pagesBound: asset.live,
      step8_recommendationsBound: asset.live,
      step9_actionsBound: asset.live,
      step10_historyBound: asset.live,
      step11_reportsBound: asset.live,
      unified: !!(ctx.clientId && ctx.activeAssetId && (ctx.site || ctx.domain)),
    };
  }

  function init() {
    applyToFlowContext();
    wireActionButtons();
    hideNewClientButtons();
  }

  window.AssetFlowSsot = {
    init: init,
    getAssets: getAssets,
    getActiveAsset: getActiveAsset,
    getActiveAssetId: getActiveAssetId,
    selectActiveAsset: selectActiveAsset,
    applyToFlowContext: applyToFlowContext,
    refreshAllScreens: refreshAllScreens,
    wireActionButtons: wireActionButtons,
    hideNewClientButtons: hideNewClientButtons,
    openAddAssetModal: openAddAssetModal,
    openAddApiModal: openAddApiModal,
    openAddAssistantModal: openAddAssistantModal,
    getChainSnapshot: getChainSnapshot,
    ASSET_TYPES: ASSET_TYPES,
    API_TYPES: API_TYPES,
    ASSISTANT_TYPES: ASSISTANT_TYPES,
  };
})();
