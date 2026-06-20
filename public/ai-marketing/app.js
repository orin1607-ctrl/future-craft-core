/**
 * CO.CO Dalia — Data Layer + UI + OpenAI (via secure local proxy)
 */
(function () {
  'use strict';

  var AI_PROXY = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:8787' : '';

  var COCO = {
    data: null,
    ai: { connected: false, busy: false },
    state: { approvalCount: 7 }
  };

  var DATA_URLS = ['./ai-marketing/data.json', './project-001/dashboard.json'];
  var STORAGE_KEY = 'coco-dalia-state-v1';

  var FALLBACK_DATA = {
    meta: { version: '2.0.0', source: 'demo-inline', generatedAt: new Date().toISOString() },
    project: { name: 'דליה — AI Marketing', site: 'https://dalia-c.com/' },
    kpis: {
      avgPosition: { value: '8.3', change: '▲ 1.2', trend: 'up' },
      weeklyClicks: { value: '3,842', change: '▲ 14%', trend: 'up' },
      weeklyImpressions: { value: '124,500', change: '▲ 8%', trend: 'up' },
      avgCtr: { value: '3.1%', change: '▼ 0.2%', trend: 'down' },
      activeKeywords: { value: '248', change: '+12 חדשות', trend: 'neutral' },
      aiOpportunities: { value: '12', change: 'ממתינות לאישור', trend: 'neutral' },
      weakPages: { value: '9', change: 'דורשים תשומת לב', trend: 'down' },
      pendingDrafts: { value: '7', change: 'לאישורך', trend: 'neutral' }
    },
    badges: { pendingApproval: 7, notifications: 12, aiDirector: 5 },
    keywords: [],
    approvals: [],
    scheduler: []
  };

  function showToast(msg, type) {
    var el = document.getElementById('cocoToast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'coco-toast show' + (type ? ' coco-toast-' + type : '');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 3800);
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        approvalCount: COCO.state.approvalCount,
        savedAt: new Date().toISOString()
      }));
    } catch (e) { /* ignore */ }
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (typeof s.approvalCount === 'number') COCO.state.approvalCount = s.approvalCount;
    } catch (e) { /* ignore */ }
  }

  function normalizeData(raw) {
    if (raw.meta && raw.kpis && raw.keywords) return raw;
    var stats = raw.stats || {};
    var base = JSON.parse(JSON.stringify(FALLBACK_DATA));
    base.meta.source = raw.generatedAt ? 'dashboard.json' : 'demo';
    base.meta.generatedAt = raw.generatedAt || base.meta.generatedAt;
    base.project = raw.project || base.project;
    base.connections = raw.connections || {};
    if (stats.avgPosition != null) base.kpis.avgPosition.value = String(stats.avgPosition);
    if (stats.totalClicks) base.kpis.weeklyClicks.value = String(stats.totalClicks);
    if (stats.totalImpressions) base.kpis.weeklyImpressions.value = String(stats.totalImpressions);
    if (stats.activeKeywords) base.kpis.activeKeywords.value = String(stats.activeKeywords);
    if (raw.drafts && raw.drafts.length) base.kpis.pendingDrafts.value = String(raw.drafts.length);
    return base;
  }

  function loadData() {
    return fetch(DATA_URLS[0])
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .catch(function () {
        return fetch(DATA_URLS[1]).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
      })
      .then(function (raw) {
        COCO.data = normalizeData(raw || FALLBACK_DATA);
        if (COCO.data.badges) COCO.state.approvalCount = COCO.data.badges.pendingApproval || COCO.state.approvalCount;
        bindDataToUI();
        renderDataTables();
        updateBadges();
        saveState();
      });
  }

  function bindKpiByLabel(labelPart, kpi) {
    if (!kpi) return;
    document.querySelectorAll('.stat-label').forEach(function (lbl) {
      if (lbl.textContent.indexOf(labelPart) === -1) return;
      var card = lbl.closest('.stat-card');
      if (!card) return;
      var val = card.querySelector('.stat-value');
      var chg = card.querySelector('.stat-change');
      if (val && kpi.value != null) val.textContent = kpi.value;
      if (chg && kpi.change) {
        chg.textContent = kpi.change;
        chg.className = 'stat-change sc-' + (kpi.trend === 'up' ? 'up' : kpi.trend === 'down' ? 'down' : 'neu');
      }
    });
  }

  function bindDataToUI() {
    var d = COCO.data;
    if (!d || !d.kpis) return;
    var k = d.kpis;
    bindKpiByLabel('מיקום ממוצע', k.avgPosition);
    bindKpiByLabel('קליקים', k.weeklyClicks);
    bindKpiByLabel('חשיפות', k.weeklyImpressions);
    bindKpiByLabel('CTR', k.avgCtr);
    bindKpiByLabel('מילות מפתח פעילות', k.activeKeywords);
    bindKpiByLabel('הזדמנויות AI', k.aiOpportunities);
    bindKpiByLabel('עמודים חלשים', k.weakPages);
    bindKpiByLabel('טיוטות ממתינות', k.pendingDrafts);
    var srcEl = document.getElementById('dataSourceLabel');
    if (srcEl) srcEl.textContent = 'מקור: ' + (d.meta.source || 'demo');
  }

  function renderKeywordsTable(tbody, list, compact) {
    if (!tbody || !list || !list.length) return;
    tbody.innerHTML = list.map(function (kw) {
      var rankCls = kw.change > 0 ? 'rank-up' : kw.change < 0 ? 'rank-down' : 'rank-same';
      var chgChip = kw.change > 0 ? 'chip-green">▲ ' + kw.change : kw.change < 0 ? 'chip-red">▼ ' + Math.abs(kw.change) : 'chip-gray">—';
      var btn = kw.score < 70
        ? '<button class="btn btn-warn btn-xs" onclick="openKwMo(\'' + kw.keyword.replace(/'/g, "\\'") + '\')">שפר</button>'
        : '<button class="btn btn-outline btn-xs" onclick="openKwMo(\'' + kw.keyword.replace(/'/g, "\\'") + '\')">ניתוח</button>';
      if (compact) {
        return '<tr><td><span class="kw-txt">' + kw.keyword + '</span></td><td><span class="' + rankCls + '">' + kw.rank + '</span></td><td class="text3">' + kw.prev + '</td><td><span class="chip ' + chgChip + '</span></td><td>' + kw.clicks + '</td><td>' + kw.volume.toLocaleString() + '</td><td>' + kw.ctr + '</td><td><span class="url-txt">' + kw.url + '</span></td><td>' + btn + '</td></tr>';
      }
      return '<tr><td><span class="kw-txt">' + kw.keyword + '</span></td><td><span class="' + rankCls + '">' + kw.rank + '</span></td><td><span class="chip ' + chgChip + '</span></td><td>' + kw.clicks + '</td><td>' + kw.volume.toLocaleString() + '</td><td>' + kw.ctr + '</td><td>' + (kw.volume / 3 | 0) + '</td><td><span class="pill pill-orange">בינוני</span></td><td><span class="url-txt">' + kw.url + '</span></td><td><span style="font-weight:800;color:var(--' + (kw.score >= 80 ? 'green' : kw.score >= 60 ? 'orange' : 'red') + ')">' + kw.score + '</span></td><td>' + btn + '</td></tr>';
    }).join('');
  }

  function renderDataTables() {
    var kw = COCO.data.keywords || [];
    var tb1 = document.querySelector('#kw-active tbody');
    var tbDash = document.querySelector('#sc-dashboard .section table tbody');
    renderKeywordsTable(tb1, kw, false);
    if (tbDash && kw.length) renderKeywordsTable(tbDash, kw.slice(0, 5), true);
  }

  function updateBadges() {
    var appr = COCO.state.approvalCount;
    document.querySelectorAll('.sb-item[data-sc="approval"] .sb-badge').forEach(function (el) { el.textContent = appr; });
    var chip = document.querySelector('#sc-approval .chip-orange');
    if (chip) chip.textContent = appr + ' ממתינות';
  }

  function updateAiStatus(connected) {
    COCO.ai.connected = connected;
    var chip = document.getElementById('aiStatusChip');
    if (!chip) return;
    chip.style.display = 'inline-flex';
    if (connected) {
      chip.className = 'chip chip-green';
      chip.textContent = '🟢 OpenAI מחובר';
    } else {
      chip.className = 'chip chip-orange';
      chip.textContent = '🟠 OpenAI — הרץ npm run ai-marketing:dev';
    }
  }

  function checkAiHealth() {
    if (!AI_PROXY) {
      updateAiStatus(false);
      return Promise.resolve(false);
    }
    return fetch(AI_PROXY + '/api/ai/health', { signal: AbortSignal.timeout(2000) })
      .then(function (r) { return r.json(); })
      .then(function (d) { updateAiStatus(!!d.ok); return !!d.ok; })
      .catch(function () { updateAiStatus(false); return false; });
  }

  function openAiResult(title, html) {
    var ov = document.getElementById('actionModal');
    if (!ov) return;
    document.getElementById('actionModalTitle').textContent = title;
    document.getElementById('actionModalBody').innerHTML = '<div class="ai-result">' + html + '</div>';
    document.getElementById('actionModalFoot').innerHTML = '<button class="btn btn-ghost" onclick="closeActionModal()">סגור</button>';
    ov.classList.add('open');
  }

  function runAi(module, prompt, title) {
    if (COCO.ai.busy) {
      showToast('AI עסוק — המתן לסיום הבקשה הקודמת', 'warn');
      return Promise.resolve();
    }
    if (!AI_PROXY) {
      showToast('OpenAI זמין דרך שרת מקומי: npm run ai-marketing:dev', 'warn');
      return Promise.resolve();
    }
    COCO.ai.busy = true;
    showToast('🤖 שולח בקשה ל-OpenAI...', 'info');
    return fetch(AI_PROXY + '/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module: module, prompt: prompt })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        COCO.ai.busy = false;
        if (!res.ok || !res.data.text) {
          showToast(res.data.message || 'שגיאת OpenAI', 'warn');
          return;
        }
        openAiResult(title || '🤖 תוצאת AI', '<div style="white-space:pre-wrap;line-height:1.7">' + escapeHtml(res.data.text) + '</div>');
        showToast('✓ תשובת AI התקבלה', 'success');
      })
      .catch(function (e) {
        COCO.ai.busy = false;
        showToast('שגיאת חיבור ל-OpenAI: ' + e.message, 'warn');
      });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getAiPrompt(btn) {
    var screen = btn.closest('.screen');
    var screenId = screen ? screen.id : 'general';
    var title = screen ? ((screen.querySelector('.sec-title') || {}).textContent || '') : '';
    var ctx = 'אתר: dalia-c.com | נושא: ניהול צי רכב | מסך: ' + title;
    return { module: screenId.replace('sc-', ''), prompt: ctx + '\n\nבצע ניתוח שיווקי קצר (5 נקודות) בעברית.' };
  }

  function filterTable(table, query) {
    if (!table) return;
    var q = (query || '').trim().toLowerCase();
    table.querySelectorAll('tbody tr').forEach(function (row) {
      row.style.display = !q || row.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
    });
  }

  function initSearchFilters() {
    document.querySelectorAll('.srch').forEach(function (input) {
      if (input.tagName === 'SELECT') {
        input.addEventListener('change', function () {
          showToast('סינון: ' + input.options[input.selectedIndex].text, 'info');
        });
        return;
      }
      input.addEventListener('input', function () {
        var wrap = input.closest('.tbl-wrap') || input.closest('.screen');
        filterTable(wrap ? wrap.querySelector('table') : null, input.value);
      });
    });
  }

  function exportFile(format, btn) {
    var screen = btn.closest('.screen');
    var title = screen ? (screen.querySelector('.sec-title') || {}).textContent || 'export' : 'export';
    var table = screen ? screen.querySelector('table') : null;
    var rows = [];
    if (table) {
      table.querySelectorAll('tr').forEach(function (tr) {
        var cells = [];
        tr.querySelectorAll('th,td').forEach(function (td) { cells.push('"' + td.textContent.replace(/"/g, '""').trim() + '"'); });
        if (cells.length) rows.push(cells.join(','));
      });
    }
    var content = rows.length ? rows.join('\n') : 'CO.CO Dalia\n' + title + '\n' + new Date().toISOString();
    var ext = format === 'pdf' ? 'txt' : 'csv';
    var blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'dalia-export.' + ext;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('יצוא ' + format.toUpperCase() + ' הוכן (הדגמה — לא נשלח לפרסום)', 'success');
  }

  function openActionModal(title, body, actions) {
    var ov = document.getElementById('actionModal');
    if (!ov) return;
    document.getElementById('actionModalTitle').textContent = title;
    document.getElementById('actionModalBody').innerHTML = body;
    var foot = document.getElementById('actionModalFoot');
    foot.innerHTML = '';
    (actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'btn ' + (a.cls || 'btn-ghost');
      b.textContent = a.label;
      b.onclick = function () { if (a.fn) a.fn(); closeActionModal(); };
      foot.appendChild(b);
    });
    ov.classList.add('open');
  }

  function closeActionModal() {
    var el = document.getElementById('actionModal');
    if (el) el.classList.remove('open');
  }

  function approveItem(btn) {
    var item = btn.closest('.appr-item');
    if (!item) return;
    var title = (item.querySelector('.fw7') || {}).textContent || 'פריט';
    var pill = item.querySelector('.pill-orange');
    if (pill) { pill.className = 'pill pill-green'; pill.textContent = 'אושר'; }
    item.style.opacity = '0.55';
    COCO.state.approvalCount = Math.max(0, COCO.state.approvalCount - 1);
    updateBadges();
    saveState();
    showToast('✓ אושר: ' + title + ' (הדגמה — לא פורסם)', 'success');
  }

  function rejectItem(btn) {
    var item = btn.closest('.appr-item');
    if (!item) return;
    var title = (item.querySelector('.fw7') || {}).textContent || 'פריט';
    openActionModal('דחיית פריט', '<p>לדחות את <strong>' + escapeHtml(title) + '</strong>?</p>', [
      { label: 'ביטול', cls: 'btn-ghost' },
      { label: '✕ דחה', cls: 'btn-danger', fn: function () {
        item.remove();
        COCO.state.approvalCount = Math.max(0, COCO.state.approvalCount - 1);
        updateBadges();
        saveState();
        showToast('נדחה: ' + title, 'warn');
      }}
    ]);
  }

  function previewItem(btn) {
    var item = btn.closest('.appr-item');
    var title = item ? ((item.querySelector('.fw7') || {}).textContent) : 'פריט';
    openActionModal('👁 תצוגה מקדימה', '<p><strong>' + escapeHtml(title) + '</strong></p><p class="fs12 text2">תצוגה מקדימה — יחובר ל-Google Docs</p>', [
      { label: 'סגור', cls: 'btn-ghost' },
      { label: '✓ אשר', cls: 'btn-success', fn: function () { approveItem(btn); } }
    ]);
  }

  function editItem(btn) {
    var item = btn.closest('.appr-item');
    var title = item ? ((item.querySelector('.fw7') || {}).textContent) : 'פריט';
    openActionModal('✏️ עריכה', '<p><strong>' + escapeHtml(title) + '</strong></p><textarea class="srch" style="width:100%;min-height:100px">תוכן הדגמה</textarea>', [
      { label: 'ביטול', cls: 'btn-ghost' },
      { label: '💾 שמור', cls: 'btn-primary', fn: function () { showToast('נשמר (הדגמה — Google Docs)', 'success'); } }
    ]);
  }

  function scheduleItem(btn) {
    var item = btn.closest('.appr-item');
    var title = item ? ((item.querySelector('.fw7') || {}).textContent) : 'פריט';
    openActionModal('📅 תזמון פרסום', '<p><strong>' + escapeHtml(title) + '</strong></p>', [
      { label: 'ביטול', cls: 'btn-ghost' },
      { label: '📅 תזמן', cls: 'btn-primary', fn: function () {
        showToast('תוזמן (הדגמה)', 'success');
        if (typeof gotoSc === 'function') gotoSc('scheduler');
      }}
    ]);
  }

  function approveAll() {
    openActionModal('אשר הכל', '<p>לאשר ' + COCO.state.approvalCount + ' פריטים?</p>', [
      { label: 'ביטול', cls: 'btn-ghost' },
      { label: '✓ אשר הכל', cls: 'btn-success', fn: function () {
        document.querySelectorAll('#sc-approval .appr-item .pill-orange').forEach(function (p) {
          p.className = 'pill pill-green'; p.textContent = 'אושר';
        });
        COCO.state.approvalCount = 0;
        updateBadges();
        saveState();
        showToast('כל הפריטים אושרו (הדגמה)', 'success');
      }}
    ]);
  }

  function handleAiButton(btn) {
    var t = btn.textContent.trim();
    var aiPatterns = ['הרץ AI', 'הרץ ניתוח', 'AI Keyword', 'AI Landing', 'צור תוכן', 'ניתוח AI', 'מחקר מילים', 'יצירת תוכן', '🤖'];
    var isAi = aiPatterns.some(function (p) { return t.indexOf(p) !== -1; });
    if (!isAi) return false;

    if (t.indexOf('AI Landing') !== -1 || t.indexOf('AI Image') !== -1) {
      showToast('סטודיו תמונות AI — בקרוב (DALL-E)', 'info');
      return true;
    }

    var p = getAiPrompt(btn);
    runAi(p.module, p.prompt, '🤖 ' + (p.module || 'AI'));
    return true;
  }

  function onClick(e) {
    var btn = e.target.closest('.btn');
    if (!btn || btn.disabled) return;
    var t = btn.textContent.trim();

    if (handleAiButton(btn)) return;

    if (t.indexOf('רענן') !== -1 && t.indexOf('GSC') !== -1) {
      showToast('מרענן Google Search Console — דורש Apps Script', 'info');
      loadData();
      return;
    }
    if (t.indexOf('סנכרון') !== -1 || t.indexOf('Sync') !== -1) {
      showToast('סנכרון — דורש Apps Script / dashboard.json', 'info');
      loadData();
      return;
    }

    if (t.indexOf('יצוא PDF') !== -1 || t.indexOf('📥 יצוא PDF') !== -1 || t.indexOf('📄 יצוא') !== -1) { exportFile('pdf', btn); return; }
    if (t.indexOf('Excel') !== -1) { exportFile('excel', btn); return; }
    if (t.indexOf('CSV') !== -1) { exportFile('csv', btn); return; }
    if (t.indexOf('שלח דוח') !== -1 || t.indexOf('📧 שלח') !== -1) {
      showToast('שליחת דוא"ל — דורש Gmail API (הדגמה)', 'info');
      return;
    }

    if (btn.closest('#sc-approval')) {
      if (t.indexOf('אשר הכל') !== -1) { approveAll(); return; }
      if (t.indexOf('דחה') !== -1 || (t.indexOf('✕') !== -1 && t.indexOf('דחה') !== -1)) { rejectItem(btn); return; }
      if (t.indexOf('תצוגה') !== -1 || t.indexOf('👁') !== -1) { previewItem(btn); return; }
      if (t.indexOf('עריכה') !== -1 || t.indexOf('✏️') !== -1) { editItem(btn); return; }
      if (t.indexOf('תזמן') !== -1) { scheduleItem(btn); return; }
      if (t.indexOf('אשר') !== -1 || t.indexOf('✓') !== -1) { approveItem(btn); return; }
    }
  }

  function init() {
    loadState();
    initSearchFilters();
    document.body.addEventListener('click', onClick);
    var actionOv = document.getElementById('actionModal');
    if (actionOv) actionOv.addEventListener('click', function (e) { if (e.target === actionOv) closeActionModal(); });

    Promise.all([loadData()]).then(function () {
      showToast('CO.CO דליה — מוכן', 'success');
    });
    if (AI_PROXY) {
      setTimeout(function () { checkAiHealth(); }, 500);
    } else {
      updateAiStatus(false);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.COCO = COCO;
  window.closeActionModal = closeActionModal;
  window.showToast = showToast;
  window.runAi = runAi;
})();
