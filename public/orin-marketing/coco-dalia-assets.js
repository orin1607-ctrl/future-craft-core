/**
 * Orin Pirsum assets UI — Multi-Asset (N). Uses AssetRegistry when available.
 * Never use aliav property 427711798 / G-F1J5ETTY8B for Dalia.
 */
(function () {
  'use strict';

  var CLIENT = {
    clientId: 'dalia-c-official',
    clientName: 'דליה פתרונות תפעול ותחזוקה לרכב',
    company: 'דליה פתרונות תפעול ותחזוקה לרכב',
    contactName: 'orin1607@gmail.com',
  };

  function getAssets() {
    if (window.AssetRegistry && AssetRegistry.list) return AssetRegistry.list(CLIENT.clientId);
    return [];
  }

  function pagesBase() {
    var b = window.COCO_PAGES_BASE || '/orin-marketing/';
    if (b.charAt(0) === '/') return location.origin + b;
    try {
      return new URL(b, location.href).href;
    } catch (e) {
      return location.origin + '/orin-marketing/';
    }
  }

  function abs(rel) {
    return pagesBase().replace(/\/?$/, '/') + String(rel || '').replace(/^\//, '');
  }

  function readJson(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function resolveClient() {
    var q = new URLSearchParams(location.search);
    var fromLs = readJson('coco-pirsum-client-v1') || {};
    var flow = readJson('coco-flow-context-v2') || {};
    var clientId = q.get('clientId') || fromLs.clientId || flow.clientId || CLIENT.clientId;
    if (!clientId || clientId === 'dalia' || String(clientId).indexOf('dalia') === 0) {
      clientId = CLIENT.clientId;
    }
    return {
      clientId: clientId,
      clientName: q.get('clientName') || fromLs.clientName || flow.clientName || CLIENT.clientName,
      company: CLIENT.company,
      assets: getAssets(),
      autoDetected: true,
    };
  }

  function currentAssetId(client) {
    var assets = getAssets();
    var q = new URLSearchParams(location.search);
    var wanted = q.get('asset') || q.get('domain') || q.get('site') || '';
    wanted = String(wanted).replace(/^www\./, '');
    var fromLs = readJson('coco-pirsum-active-asset-v1');
    if (!wanted && fromLs && fromLs.clientId === client.clientId) {
      wanted = fromLs.assetId || fromLs.domain || '';
    }
    if (window.AssetRegistry && !wanted) wanted = AssetRegistry.getActiveId();
    var hit = assets.find(function (a) {
      return a.id === wanted || a.domain === wanted || a.shortLabel === wanted;
    });
    return (hit || assets[0] || {}).id;
  }

  function pickAsset(client, assetId) {
    var assets = getAssets();
    var asset = assets.find(function (a) { return a.id === assetId; }) || assets[0];
    if (!asset) return { ctx: client, asset: null };
    if (window.AssetRegistry) AssetRegistry.setActive(asset.id);
    var ctx = {
      clientId: client.clientId,
      clientName: client.clientName,
      company: client.company,
      site: asset.domain,
      domain: asset.domain,
      url: asset.url,
      mySiteUrl: asset.mySiteUrl || asset.url,
      assetId: asset.id,
      ga4: asset.ga4,
      measurementId: asset.measurementId,
      gtm: asset.gtm,
      assets: assets.map(function (a) { return a.id; }),
      autoDetected: true,
    };
    return { ctx: ctx, asset: asset };
  }

  function qs(ctx) {
    return [
      'clientId=' + encodeURIComponent(ctx.clientId || ''),
      'clientName=' + encodeURIComponent(ctx.clientName || ''),
      'site=' + encodeURIComponent(ctx.site || ''),
      'domain=' + encodeURIComponent(ctx.domain || ''),
      'asset=' + encodeURIComponent(ctx.assetId || ''),
      'embedded=0',
      'from=pirsum-home',
    ].join('&');
  }

  function statusLabel(a) {
    if (!a) return 'Pending';
    if (a.status === 'live' && a.measurementId) return 'LIVE / מחובר';
    if (a.status === 'live') return 'LIVE';
    if (a.status === 'pending') return 'Pending';
    return 'Pending';
  }

  function renderCompare() {
    var body = document.getElementById('compare-body');
    if (!body) return;
    var assets = getAssets().filter(function (a) { return !a.isMock; });
    var modeEl = document.getElementById('asset-mode');
    var mode = (window.AssetRegistry && AssetRegistry.getMode()) || 'single';
    if (modeEl) modeEl.value = mode;

    var selected = assets;
    if (mode === 'single' && window.AssetRegistry) {
      selected = [AssetRegistry.getActive()].filter(Boolean);
    } else if (mode === 'compare' && window.AssetRegistry) {
      var ids = AssetRegistry.getSelectedForCompare();
      selected = assets.filter(function (a) { return ids.indexOf(a.id) >= 0; });
      if (selected.length < 2) selected = assets.slice(0, Math.min(3, assets.length));
    }

    var header =
      '<tr><th>שדה</th>' +
      selected
        .map(function (a) {
          return '<th>' + (a.shortLabel || a.label) + '</th>';
        })
        .join('') +
      '</tr>';

    function row(label, fn) {
      return (
        '<tr><th>' +
        label +
        '</th>' +
        selected
          .map(function (a) {
            return '<td>' + fn(a) + '</td>';
          })
          .join('') +
        '</tr>'
      );
    }

    body.innerHTML =
      header +
      row('תפקיד', function (a) { return a.role || ''; }) +
      row('סטטוס', statusLabel) +
      row('URL', function (a) { return a.url || ''; }) +
      row('GSC', function (a) { return a.gsc || 'Pending'; }) +
      row('GA4', function (a) { return a.ga4 || 'Pending'; }) +
      row('Measurement', function (a) { return a.measurementId || '—'; }) +
      row('GTM', function (a) { return a.gtm || 'Pending'; }) +
      row('הערה', function (a) { return a.dataNote || ''; });
  }

  function renderModeControls() {
    var host = document.getElementById('asset-mode-bar');
    if (!host || !window.AssetRegistry) return;
    var mode = AssetRegistry.getMode();
    host.innerHTML =
      '<label style="font-size:12px;margin-left:8px">מצב: ' +
      '<select id="asset-mode">' +
      '<option value="single"' + (mode === 'single' ? ' selected' : '') + '>Single</option>' +
      '<option value="compare"' + (mode === 'compare' ? ' selected' : '') + '>Compare</option>' +
      '<option value="portfolio"' + (mode === 'portfolio' ? ' selected' : '') + '>Portfolio</option>' +
      '</select></label>' +
      '<span style="font-size:11px;opacity:.7;margin-right:8px">N=' +
      getAssets().length +
      ' נכסים</span>';
    var sel = document.getElementById('asset-mode');
    if (sel) {
      sel.addEventListener('change', function () {
        AssetRegistry.setMode(sel.value);
        renderCompare();
        renderAssets(AssetRegistry.getActiveId());
      });
    }
  }

  function renderAssets(activeId) {
    var row = document.getElementById('asset-row');
    if (!row) return;
    var assets = getAssets().filter(function (a) { return !a.isMock; });
    row.innerHTML = assets
      .map(function (a) {
        var on = a.id === activeId ? ' on' : '';
        var chip = a.status === 'live' && a.measurementId ? 'LIVE' : a.status === 'live' ? 'LIVE' : 'Pending';
        return (
          '<button type="button" class="asset' +
          on +
          '" data-asset="' +
          a.id +
          '">' +
          '<strong>' +
          (a.shortLabel || a.label) +
          '</strong>' +
          '<span>' +
          (a.role || '') +
          '</span>' +
          '<span class="chip">' +
          chip +
          '</span>' +
          '</button>'
        );
      })
      .join('');
    row.querySelectorAll('[data-asset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-asset');
        var u = new URL(location.href);
        u.searchParams.set('asset', id);
        var a = getAssets().find(function (x) { return x.id === id; }) || {};
        u.searchParams.set('domain', a.domain || '');
        u.searchParams.set('clientId', CLIENT.clientId);
        location.href = u.toString();
      });
    });
  }

  function wireLinks(ctx, asset) {
    var work = document.getElementById('link-work');
    var control = document.getElementById('link-control');
    var site = document.getElementById('link-site');
    var daily = document.getElementById('link-daily');
    var google = document.getElementById('link-google');
    var q = qs(ctx);
    if (work) work.href = abs('coco-dalia/work-center-lite.html') + '?' + q;
    if (control) control.href = abs('ai-marketing/ai-control-center-v5-STANDALONE.html') + '?' + q;
    if (site) {
      // "האתר שלי" = URL of the ACTIVE asset (not always brand site)
      site.href = (asset && (asset.mySiteUrl || asset.url)) || '#';
      site.target = '_blank';
      site.rel = 'noopener';
    }
    if (daily) {
      daily.href = abs('coco-reports/' + encodeURIComponent(ctx.clientId) + '/daily/latest.html');
      daily.removeAttribute('target');
    }
    if (google) {
      google.href = '/orin-marketing/ai-marketing/google-connections-owner.html?customerHint=dalia';
    }
    var sub = document.getElementById('active-sub');
    if (sub && asset) {
      sub.textContent =
        'נכס פעיל: ' +
        asset.label +
        ' · ' +
        statusLabel(asset) +
        ' · ' +
        (asset.dataNote || '') +
        ' · Multi-Asset N=' +
        getAssets().length;
    }
  }

  function boot() {
    var client = resolveClient();
    var activeId = currentAssetId(client);
    var picked = pickAsset(client, activeId);
    var nameEl = document.getElementById('client-name');
    var metaEl = document.getElementById('client-meta');
    if (nameEl) nameEl.textContent = picked.ctx.clientName;
    if (metaEl) {
      metaEl.textContent =
        'Client ID: ' +
        picked.ctx.clientId +
        ' · נכסים: ' +
        getAssets()
          .filter(function (a) { return !a.isMock; })
          .map(function (a) { return a.shortLabel || a.label; })
          .join(' · ') +
        ' · Multi-Asset';
    }
    renderModeControls();
    renderAssets(activeId);
    renderCompare();
    wireLinks(picked.ctx, picked.asset);
    window.__PIRSUM_CTX = picked.ctx;
    window.__PIRSUM_ASSETS = getAssets();
    window.__PIRSUM_ACTIVE_ASSET = picked.asset;
    window.__DALIA_LIVE_ASSETS = getAssets();
    window.__COCO_AI_CONTEXT = window.AssetRegistry ? AssetRegistry.aiContext() : null;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
