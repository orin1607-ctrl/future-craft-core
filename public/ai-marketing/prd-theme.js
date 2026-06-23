/**
 * Project 001 — PRD Dashboard Theme (צבעי דשבורד לפי חברה/לקוח)
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'coco-prd-theme-v1';

  var DEFAULT = {
    primary: '#003366',
    secondary: '#2563eb',
    buttons: '#2563eb',
    cards: '#ffffff',
    background: '#f0f4f8',
    accent: '#16a34a',
  };

  var LABELS = {
    primary: 'צבע ראשי',
    secondary: 'צבע משני',
    buttons: 'צבע כפתורים',
    cards: 'צבע כרטיסים',
    background: 'צבע רקע',
    accent: 'צבע הדגשות',
  };

  var themeByCompany = loadAll();
  var activeCompanyKey = 'default';

  function loadAll() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { default: Object.assign({}, DEFAULT) };
  }

  function saveAll() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(themeByCompany)); } catch (e) { /* ignore */ }
  }

  function getTheme(companyKey) {
    var key = companyKey || activeCompanyKey || 'default';
    return Object.assign({}, DEFAULT, themeByCompany[key] || themeByCompany.default || DEFAULT);
  }

  function darken(hex, pct) {
    var n = parseInt(hex.replace('#', ''), 16);
    if (isNaN(n)) return hex;
    var r = Math.max(0, (n >> 16) - Math.round(255 * pct));
    var g = Math.max(0, ((n >> 8) & 0xff) - Math.round(255 * pct));
    var b = Math.max(0, (n & 0xff) - Math.round(255 * pct));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function applyTheme(t) {
    var root = document.documentElement;
    root.style.setProperty('--navy', t.primary);
    root.style.setProperty('--blue', t.buttons || t.secondary);
    root.style.setProperty('--blue2', darken(t.buttons || t.secondary, 0.08));
    root.style.setProperty('--green', t.accent);
    root.style.setProperty('--bg', t.background);
    root.style.setProperty('--surface', t.cards);
    root.style.setProperty('--surface2', t.background);
    root.style.setProperty('--prd-primary', t.primary);
    root.style.setProperty('--prd-secondary', t.secondary);
    root.style.setProperty('--prd-buttons', t.buttons);
    root.style.setProperty('--prd-cards', t.cards);
    root.style.setProperty('--prd-bg', t.background);
    root.style.setProperty('--prd-accent', t.accent);
  }

  function setCompanyKey(key) {
    activeCompanyKey = key || 'default';
    applyTheme(getTheme(activeCompanyKey));
  }

  function mountSettings() {
    var screen = document.getElementById('sc-settings');
    if (!screen || screen.querySelector('#prdThemeCard')) return;

    var col = screen.querySelector('.g2 > div:first-child');
    if (!col) return;

    var card = document.createElement('div');
    card.className = 'card mb-12';
    card.id = 'prdThemeCard';
    card.innerHTML =
      '<div class="card-header">🎨 צבעי דשבורד <span class="badge-cs" style="font-size:9px">לפי חברה</span></div>' +
      '<div class="card-body" id="prdThemeBody"></div>';

    var apiCard = col.querySelector('.card');
    if (apiCard) col.insertBefore(card, apiCard);
    else col.appendChild(card);

    renderForm();
  }

  function renderForm() {
    var body = document.getElementById('prdThemeBody');
    if (!body) return;
    var t = getTheme(activeCompanyKey);
    var html = '<p class="fs11 text3 mb-12">הגדרות נשמרות במערכת — ניתן להתאים לכל חברה או לקוח. שינוי מיידי בתצוגה.</p>';
    html += '<div class="prd-theme-grid">';
    Object.keys(LABELS).forEach(function (key) {
      html += '<div class="prd-theme-row">' +
        '<label class="fs11 fw7 text3">' + LABELS[key] + '</label>' +
        '<div class="prd-theme-inputs">' +
        '<input type="color" class="prd-theme-color" data-key="' + key + '" value="' + t[key] + '">' +
        '<input type="text" class="srch prd-theme-hex" data-key="' + key + '" value="' + t[key] + '" style="width:100px">' +
        '</div></div>';
    });
    html += '</div>';
    html += '<div class="prd-theme-actions mt-12">' +
      '<button type="button" class="btn btn-primary" id="prdThemeSave">💾 שמור צבעים</button>' +
      '<button type="button" class="btn btn-outline" id="prdThemeReset">↺ איפוס לברירת מחדל</button>' +
      '</div>';
    html += '<p class="fs11 text3 mt-8" id="prdThemeStatus"></p>';
    body.innerHTML = html;

    body.querySelectorAll('.prd-theme-color').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var hex = body.querySelector('.prd-theme-hex[data-key="' + inp.dataset.key + '"]');
        if (hex) hex.value = inp.value;
        previewFromForm();
      });
    });
    body.querySelectorAll('.prd-theme-hex').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var v = inp.value.trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
        var color = body.querySelector('.prd-theme-color[data-key="' + inp.dataset.key + '"]');
        if (color) color.value = v;
        previewFromForm();
      });
    });

    document.getElementById('prdThemeSave')?.addEventListener('click', function () {
      var next = readForm();
      themeByCompany[activeCompanyKey] = next;
      saveAll();
      applyTheme(next);
      var st = document.getElementById('prdThemeStatus');
      if (st) st.textContent = 'נשמר בהצלחה — חל על כל המסכים.';
    });

    document.getElementById('prdThemeReset')?.addEventListener('click', function () {
      themeByCompany[activeCompanyKey] = Object.assign({}, DEFAULT);
      saveAll();
      applyTheme(DEFAULT);
      renderForm();
    });
  }

  function readForm() {
    var out = {};
    document.querySelectorAll('.prd-theme-color').forEach(function (inp) {
      out[inp.dataset.key] = inp.value;
    });
    return out;
  }

  function previewFromForm() {
    applyTheme(readForm());
  }

  function syncCompanyFromFilter() {
    if (!window.PrdFilter) return;
    var st = window.PrdFilter.getState();
    var key = st.companyId || 'default';
    if (key !== activeCompanyKey) {
      activeCompanyKey = key;
      applyTheme(getTheme(key));
    }
  }

  function init() {
    applyTheme(getTheme('default'));
    mountSettings();
    window.addEventListener('prd-filter-change', syncCompanyFromFilter);
    window.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'dalia-coco-scope' && e.data.selectedCompany) {
        var key = 'dalia-' + String(e.data.selectedCompany).replace(/\s+/g, '-').toLowerCase();
        if (!themeByCompany[key]) themeByCompany[key] = Object.assign({}, getTheme('default'));
        setCompanyKey(key);
      }
    });
  }

  window.PrdTheme = {
    get: getTheme,
    apply: applyTheme,
    setCompanyKey: setCompanyKey,
    mountSettings: mountSettings,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
