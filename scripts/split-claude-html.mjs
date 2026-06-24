import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(__dirname, '../public/ai-marketing');
const src = fs.readFileSync(path.join(base, 'claude-source.html'), 'utf8');

const styleMatch = src.match(/<style>([\s\S]*?)<\/style>/);
const scriptMatch = src.match(/<script>([\s\S]*?)<\/script>/);
const bodyMatch = src.match(/<body>([\s\S]*?)<script>/);

if (!styleMatch || !scriptMatch || !bodyMatch) {
  console.error('Failed to parse claude-source.html');
  process.exit(1);
}

const cssExtra = `
/* Integration layer — legacy platform hidden when Claude UI active */
body.coco-claude-layout .sidebar,
body.coco-claude-layout .main,
body.coco-claude-layout .sb-overlay,
body.coco-claude-layout #sbOverlay { display: none !important; }
body.coco-claude-layout #coco-claude-root { display: block; }
#coco-claude-root { display: none; min-height: 100vh; }
#coco-claude-root .screen { display: none; min-height: 100vh; flex-direction: column; }
#coco-claude-root .screen.active { display: flex; }
`;

fs.writeFileSync(path.join(base, 'coco-claude-main.css'), styleMatch[1].trim() + cssExtra, 'utf8');
fs.writeFileSync(path.join(base, 'coco-claude-screens.html'), bodyMatch[1].trim(), 'utf8');

const bridge = `
// ===== COCO CLAUDE INTEGRATION (Phase A+) =====
(function () {
  'use strict';

  window.COCO = window.COCO || {};
  if (!COCO.flowContext) {
    COCO.flowContext = {
      clientId: null,
      company: '',
      clientName: '',
      site: '',
      page: '',
      campaign: '',
      channel: '',
      goal: '',
      action: '',
      status: '',
      dateRange: '30',
      dateFrom: '',
      dateTo: '',
      agent: '',
      selectedCard: null
    };
  }

  var STORAGE_KEY = 'coco-flow-context-v1';

  var FLOW_CHAIN = [
    'screen-hub',
    'screen-status',
    'screen-clients',
    'screen-goals',
    'screen-actions',
    'screen-history',
    'screen-assets',
    'screen-ai-decisions',
    'screen-reports'
  ];

  var GOTO_MAP = {
    hub: 'screen-hub',
    status: 'screen-status',
    clients: 'screen-clients',
    goals: 'screen-goals',
    actions: 'screen-actions',
    history: 'screen-history',
    assets: 'screen-assets',
    'ai-decisions': 'screen-ai-decisions',
    reports: 'screen-reports',
    agents: 'screen-agents',
    'agent-dashboard': 'screen-agent-dashboard',
    'sc-hub': 'screen-hub',
    'sc-mkt-status': 'screen-status',
    'sc-mkt-clients': 'screen-clients',
    'sc-mkt-goals': 'screen-goals',
    'sc-mkt-actions': 'screen-actions',
    'sc-mkt-assets': 'screen-assets',
    'sc-mkt-agents': 'screen-agents'
  };

  var FIELD_MAP = [
    { ctx: 'company', ids: ['sf-company-display', 'gf-company', 'ag-company', 'act-company'] },
    { ctx: 'site', ids: ['sf-site', 'gf-site', 'ag-site', 'act-site'] },
    { ctx: 'page', ids: ['sf-page', 'gf-page', 'act-page'] },
    { ctx: 'campaign', ids: ['sf-campaign', 'gf-campaign', 'act-campaign'] },
    { ctx: 'channel', ids: ['sf-channel', 'gf-channel'] },
    { ctx: 'status', ids: ['sf-status', 'gf-status', 'ag-status', 'act-status-adv'] },
    { ctx: 'dateRange', ids: ['sf-daterange', 'gf-date', 'act-date-range'] },
    { ctx: 'agent', ids: ['gf-agent', 'ag-agent', 'act-source'] },
    { ctx: 'goal', ids: ['gf-goal-category'] },
    { ctx: 'action', ids: ['act-type'] }
  ];

  function loadContext() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) Object.assign(COCO.flowContext, JSON.parse(raw));
    } catch (e) { /* ignore */ }
    var m = location.search.match(/[?&]customer=([^&]+)/);
    if (m) COCO.flowContext.clientId = decodeURIComponent(m[1]);
  }

  function saveContext() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(COCO.flowContext));
    } catch (e) { /* ignore */ }
  }

  function applyContextToScreen(screenId) {
    var ctx = COCO.flowContext;
    FIELD_MAP.forEach(function (row) {
      var val = ctx[row.ctx];
      if (val == null || val === '') return;
      row.ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (el.tagName === 'SELECT' || el.tagName === 'INPUT') {
          if (el.type !== 'checkbox') el.value = val;
        } else {
          el.textContent = val;
        }
      });
    });
    if (screenId === 'screen-status' && typeof applyStatusFilter === 'function') applyStatusFilter();
  }

  function captureContextFromScreen(screenId) {
    FIELD_MAP.forEach(function (row) {
      for (var i = 0; i < row.ids.length; i++) {
        var el = document.getElementById(row.ids[i]);
        if (!el) continue;
        if (el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'checkbox')) {
          if (el.value) COCO.flowContext[row.ctx] = el.value;
          break;
        }
        if (el.textContent && el.id === 'sf-company-display') {
          COCO.flowContext.company = el.textContent.trim();
          break;
        }
      }
    });
    saveContext();
  }

  var _goScreen = window.goScreen;
  window.goScreen = function (id) {
    var active = document.querySelector('#coco-claude-root .screen.active');
    if (active) captureContextFromScreen(active.id);
    if (typeof _goScreen === 'function') _goScreen(id);
    else {
      document.querySelectorAll('#coco-claude-root .screen').forEach(function (s) {
        s.classList.toggle('active', s.id === id);
      });
    }
    document.body.classList.add('coco-claude-layout');
    applyContextToScreen(id);
    if (window.CocoClaude) CocoClaude.onScreenChange(id);
  };

  window.gotoSc = function (id) {
    var key = (id || '').replace(/^sc-/, '');
    var mapped = GOTO_MAP[id] || GOTO_MAP[key];
    if (mapped) {
      goScreen(mapped);
      return;
    }
    document.body.classList.remove('coco-claude-layout');
    if (typeof window._gotoScLegacy === 'function') window._gotoScLegacy(id);
  };

  window.CocoClaude = {
    FLOW_CHAIN: FLOW_CHAIN,
    init: function () {
      loadContext();
      document.body.classList.add('coco-claude-layout');
      goScreen('screen-hub');
      this.wireFlowNav();
      this.wireContextListeners();
      this.applyPermissions();
    },
    onScreenChange: function (id) {
      this.updateFlowButtons(id);
    },
    wireFlowNav: function () {
      FLOW_CHAIN.forEach(function (sid, idx) {
        if (idx >= FLOW_CHAIN.length - 1) return;
        var nextId = FLOW_CHAIN[idx + 1];
        var screen = document.getElementById(sid);
        if (!screen) return;
        var bar = document.createElement('div');
        bar.className = 'flow-next-bar';
        bar.style.cssText = 'padding:12px 20px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;';
        var labels = {
          'screen-status': 'חברות ולקוחות',
          'screen-clients': 'המטרות',
          'screen-goals': 'הפעולות',
          'screen-actions': 'היסטוריה',
          'screen-history': 'נכסים דיגיטליים',
          'screen-assets': 'AI / קבלת החלטות',
          'screen-ai-decisions': 'דוחות'
        };
        bar.innerHTML = '<button type="button" class="btn btn-primary" data-flow-next="' + nextId + '">המשך ל-' + (labels[nextId] || nextId) + ' →</button>';
        var content = screen.querySelector('.content');
        if (content) content.appendChild(bar);
      });
      document.getElementById('coco-claude-root')?.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-flow-next]');
        if (btn) goScreen(btn.getAttribute('data-flow-next'));
      });
    },
    updateFlowButtons: function () { /* reserved */ },
    wireContextListeners: function () {
      document.getElementById('coco-claude-root')?.addEventListener('change', function (e) {
        var t = e.target;
        if (!t.id) return;
        FIELD_MAP.forEach(function (row) {
          if (row.ids.indexOf(t.id) !== -1 && t.value !== undefined) {
            COCO.flowContext[row.ctx] = t.value;
            saveContext();
          }
        });
      });
    },
    bindClientData: function (data) {
      if (!data) return;
      var c = data.client || data.customer || data;
      COCO.flowContext.clientId = c.id || COCO.flowContext.clientId;
      COCO.flowContext.clientName = c.name || COCO.flowContext.clientName;
      COCO.flowContext.company = c.name || COCO.flowContext.company;
      saveContext();
      var nameEl = document.querySelector('#screen-hub [style*="font-size:18px"]');
      if (nameEl && c.name) nameEl.textContent = '🏢 ' + c.name;
    },
    applyPermissions: function () {
      var role = (window.COCO_AUTH && COCO_AUTH.role) || 'super_admin';
      var canAct = role === 'super_admin' || role === 'admin';
      COCO.permissions = COCO.permissions || {};
      COCO.permissions.canAct = canAct;
      if (!canAct) {
        document.querySelectorAll('#coco-claude-root .btn-green, #coco-claude-root .btn-red').forEach(function (btn) {
          if (/אשר|דחה|בצע/.test(btn.textContent)) {
            btn.disabled = true;
            btn.style.opacity = '0.45';
            btn.title = 'צפייה בלבד';
          }
        });
      }
    }
  };

  loadContext();
})();
`;

fs.writeFileSync(
  path.join(base, 'coco-claude-main.js'),
  scriptMatch[1].trim() + '\n' + bridge,
  'utf8'
);

console.log('Split complete:');
console.log('  css:', fs.statSync(path.join(base, 'coco-claude-main.css')).size);
console.log('  screens:', fs.statSync(path.join(base, 'coco-claude-screens.html')).size);
console.log('  js:', fs.statSync(path.join(base, 'coco-claude-main.js')).size);
