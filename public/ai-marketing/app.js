/**
 * CO.CO Dalia — Data Layer + UI + API (Google Sheets / OpenAI)
 */
(function () {
  'use strict';

  var API = '';
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    API = location.port === '8888' ? 'http://127.0.0.1:8787' : '';
  }

  var COCO = { data: null, ai: { connected: false, busy: false }, state: { approvalCount: 7 } };
  var FALLBACK_URLS = ['./ai-marketing/data.json', './project-001/dashboard.json'];

  function showToast(msg, type) {
    var el = document.getElementById('cocoToast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'coco-toast show' + (type ? ' coco-toast-' + type : '');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 3800);
  }

  function apiFetch(path, opts) {
    if (!API) return Promise.reject(new Error('offline'));
    return fetch(API + path, opts || {}).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, data: d }; });
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
    var src = document.getElementById('dataSourceLabel');
    if (src) src.textContent = 'מקור: ' + (d.meta?.source || 'demo');
    if (d.meta?.spreadsheetUrl) {
      var link = document.getElementById('sheetsLink');
      if (link) { link.href = d.meta.spreadsheetUrl; link.style.display = 'inline'; }
    }
    COCO.state.approvalCount = d.badges?.pendingApproval ?? COCO.state.approvalCount;
    updateBadges();
    renderKeywordsTable(document.querySelector('#kw-active tbody'), d.keywords, false);
    var dashTb = document.querySelector('#sc-dashboard .section table tbody');
    if (dashTb && d.keywords?.length) renderKeywordsTable(dashTb, d.keywords.slice(0, 5), true);
  }

  function renderKeywordsTable(tbody, list, compact) {
    if (!tbody || !list?.length) return;
    tbody.innerHTML = list.map(function (kw) {
      var rc = kw.change > 0 ? 'rank-up' : kw.change < 0 ? 'rank-down' : 'rank-same';
      var cc = kw.change > 0 ? 'chip-green">▲ ' + kw.change : kw.change < 0 ? 'chip-red">▼ ' + Math.abs(kw.change) : 'chip-gray">—';
      var btn = (kw.score || 99) < 70
        ? '<button class="btn btn-warn btn-xs" onclick="openKwMo(\'' + esc(kw.keyword) + '\')">שפר</button>'
        : '<button class="btn btn-outline btn-xs" onclick="openKwMo(\'' + esc(kw.keyword) + '\')">ניתוח</button>';
      if (compact) {
        return '<tr><td><span class="kw-txt">' + esc(kw.keyword) + '</span></td><td><span class="' + rc + '">' + kw.rank + '</span></td><td class="text3">' + (kw.prev || '—') + '</td><td><span class="chip ' + cc + '</span></td><td>' + kw.clicks + '</td><td>' + fmt(kw.volume) + '</td><td>' + kw.ctr + '</td><td><span class="url-txt">' + esc(kw.url) + '</span></td><td>' + btn + '</td></tr>';
      }
      return '<tr><td><span class="kw-txt">' + esc(kw.keyword) + '</span></td><td><span class="' + rc + '">' + kw.rank + '</span></td><td><span class="chip ' + cc + '</span></td><td>' + kw.clicks + '</td><td>' + fmt(kw.volume) + '</td><td>' + kw.ctr + '</td><td>—</td><td><span class="pill pill-orange">בינוני</span></td><td><span class="url-txt">' + esc(kw.url) + '</span></td><td><span style="font-weight:800">' + (kw.score || '—') + '</span></td><td>' + btn + '</td></tr>';
    }).join('');
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&#39;'); }
  function fmt(n) { return n != null ? Number(n).toLocaleString() : '—'; }

  function updateBadges() {
    var n = COCO.state.approvalCount;
    document.querySelectorAll('.sb-item[data-sc="approval"] .sb-badge').forEach(function (el) { el.textContent = n; });
    var chip = document.querySelector('#sc-approval .chip-orange');
    if (chip) chip.textContent = n + ' ממתינות';
  }

  function updateAiStatus(ok) {
    COCO.ai.connected = ok;
    var chip = document.getElementById('aiStatusChip');
    if (!chip) return;
    chip.style.display = 'inline-flex';
    chip.className = 'chip ' + (ok ? 'chip-green' : 'chip-orange');
    chip.textContent = ok ? '🟢 OpenAI מחובר' : (API ? '🟠 OpenAI — בדוק .env.openai' : '🟠 OpenAI — npm run ai-marketing:dev');
  }

  function loadData() {
    if (API) {
      return apiFetch('/api/data').then(function (res) {
        if (res.ok && res.data.data) { COCO.data = res.data.data; bindDataToUI(); return; }
        throw new Error(res.data.message || 'API');
      }).catch(fallbackLoad);
    }
    return fallbackLoad();
  }

  function fallbackLoad() {
    return fetch(FALLBACK_URLS[0]).then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .catch(function () { return fetch(FALLBACK_URLS[1]).then(function (r) { return r.ok ? r.json() : null; }); })
      .then(function (raw) {
        if (raw?.meta?.kpis) COCO.data = raw;
        else if (raw?.stats) {
          COCO.data = {
            meta: { source: 'dashboard.json (static)', generatedAt: raw.generatedAt },
            kpis: {
              avgPosition: { value: String(raw.stats.avgPosition ?? '—'), change: '—', trend: 'neutral' },
              weeklyClicks: { value: String(raw.stats.totalClicks ?? 0), change: '—', trend: 'up' },
              activeKeywords: { value: String(raw.stats.activeKeywords ?? 0), change: '—', trend: 'neutral' },
              pendingDrafts: { value: String(raw.stats.pendingDrafts ?? 0), change: 'לאישורך', trend: 'neutral' },
              aiOpportunities: { value: String(raw.stats.opportunities ?? 0), change: '—', trend: 'neutral' },
              weakPages: { value: String(raw.stats.weakPages ?? 0), change: '—', trend: 'down' },
              weeklyImpressions: { value: String(raw.stats.totalImpressions ?? 0), change: '—', trend: 'up' },
              avgCtr: { value: raw.stats.avgCtr != null ? raw.stats.avgCtr + '%' : '—', change: '—', trend: 'neutral' },
            },
            keywords: (raw.searchConsole?.keywords || []).slice(0, 10).map(function (k) {
              return { keyword: k.query, rank: Math.round(k.position), clicks: k.clicks, volume: k.impressions, ctr: '—', url: '—', score: 70, change: 0, prev: 0 };
            }),
            badges: { pendingApproval: raw.stats.pendingDrafts || 0 },
          };
        }
        bindDataToUI();
      });
  }

  function syncNow() {
    showToast('🔄 מסנכרן Google Sheets + GSC + GA4...', 'info');
    if (!API) { showToast('סנכרון מלא דורש: npm run ai-marketing:dev', 'warn'); return loadData(); }
    return apiFetch('/api/sync', { method: 'POST' }).then(function (res) {
      if (res.ok && res.data.data) { COCO.data = res.data.data; bindDataToUI(); showToast('✓ סנכרון הושלם', 'success'); }
      else showToast(res.data.message || 'שגיאת סנכרון', 'warn');
    }).catch(function (e) { showToast('סנכרון נכשל: ' + e.message, 'warn'); });
  }

  function saveAction(payload) {
    if (!API) { showToast('שמירה ל-Google Sheets דורשת שרת מקומי (ai-marketing:dev)', 'warn'); return Promise.resolve(); }
    return apiFetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (res) {
        if (res.ok && res.data.data) { COCO.data = res.data.data; bindDataToUI(); }
        if (!res.ok) showToast(res.data.message || 'שגיאת שמירה', 'warn');
        return res;
      });
  }

  function runAi(module, prompt, title) {
    if (COCO.ai.busy) { showToast('AI עסוק — המתן', 'warn'); return; }
    if (!API) { showToast('OpenAI דורש: npm run ai-marketing:dev + .env.openai', 'warn'); return; }
    COCO.ai.busy = true;
    showToast('🤖 שולח ל-OpenAI...', 'info');
    apiFetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ module: module, prompt: prompt }) })
      .then(function (res) {
        COCO.ai.busy = false;
        if (res.ok && res.data.text) openActionModal(title, '<div style="white-space:pre-wrap;line-height:1.7">' + esc(res.data.text) + '</div>', [{ label: 'סגור', cls: 'btn-ghost' }]);
        else showToast(res.data.message || 'שגיאת OpenAI', 'warn');
      })
      .catch(function (e) { COCO.ai.busy = false; showToast('שגיאה: ' + e.message, 'warn'); });
  }

  function openActionModal(title, body, actions) {
    var ov = document.getElementById('actionModal');
    if (!ov) return;
    document.getElementById('actionModalTitle').textContent = title;
    document.getElementById('actionModalBody').innerHTML = body;
    var foot = document.getElementById('actionModalFoot');
    foot.innerHTML = '';
    (actions || [{ label: 'סגור', cls: 'btn-ghost' }]).forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'btn ' + (a.cls || 'btn-ghost');
      b.textContent = a.label;
      b.onclick = function () { if (a.fn) a.fn(); closeActionModal(); };
      foot.appendChild(b);
    });
    ov.classList.add('open');
  }

  function closeActionModal() { document.getElementById('actionModal')?.classList.remove('open'); }

  function approveItem(btn) {
    var item = btn.closest('.appr-item');
    var title = item ? (item.querySelector('.fw7')?.textContent || '') : '';
    var draftId = item?.dataset?.draftId || '';
    if (item) {
      var pill = item.querySelector('.pill-orange');
      if (pill) { pill.className = 'pill pill-green'; pill.textContent = 'אושר'; }
      item.style.opacity = '0.55';
    }
    COCO.state.approvalCount = Math.max(0, COCO.state.approvalCount - 1);
    updateBadges();
    saveAction({ action: 'approved', draftId: draftId, title: title, status: 'approved', note: 'אושר מהדשבורד' });
    showToast('✓ אושר: ' + title + ' (לא פורסם)', 'success');
  }

  function rejectItem(btn) {
    var item = btn.closest('.appr-item');
    var title = item?.querySelector('.fw7')?.textContent || '';
    openActionModal('דחיית פריט', '<p>לדחות <strong>' + esc(title) + '</strong>?</p>', [
      { label: 'ביטול', cls: 'btn-ghost' },
      { label: '✕ דחה', cls: 'btn-danger', fn: function () {
        item?.remove();
        COCO.state.approvalCount = Math.max(0, COCO.state.approvalCount - 1);
        updateBadges();
        saveAction({ action: 'rejected', title: title, status: 'rejected' });
        showToast('נדחה: ' + title, 'warn');
      }},
    ]);
  }

  function previewItem(btn) {
    var title = btn.closest('.appr-item')?.querySelector('.fw7')?.textContent || '';
    openActionModal('👁 תצוגה מקדימה', '<p><strong>' + esc(title) + '</strong></p><p class="fs12 text2">נטען מ-Google Docs / Sheets</p>', [
      { label: 'סגור', cls: 'btn-ghost' },
      { label: '✓ אשר', cls: 'btn-success', fn: function () { approveItem(btn); } },
    ]);
  }

  function editItem(btn) {
    var title = btn.closest('.appr-item')?.querySelector('.fw7')?.textContent || '';
    openActionModal('✏️ עריכה', '<textarea class="srch" id="editArea" style="width:100%;min-height:100px"></textarea>', [
      { label: 'ביטול', cls: 'btn-ghost' },
      { label: '💾 שמור', cls: 'btn-primary', fn: function () {
        saveAction({ action: 'edited', title: title, note: document.getElementById('editArea')?.value || '' });
        showToast('נשמר', 'success');
      }},
    ]);
  }

  function scheduleItem(btn) {
    var title = btn.closest('.appr-item')?.querySelector('.fw7')?.textContent || '';
    openActionModal('📅 תזמון פרסום', '<p>' + esc(title) + '</p>', [
      { label: 'ביטול', cls: 'btn-ghost' },
      { label: '📅 תזמן', cls: 'btn-primary', fn: function () { showToast('תוזמן (הדגמה)', 'success'); gotoSc('scheduler'); } },
    ]);
  }

  function handleAiButton(btn) {
    var t = btn.textContent.trim();
    if (/הרץ AI|הרץ ניתוח|AI Keyword|מחקר מילות|יצירת תוכן|צור תוכן|🤖/.test(t)) {
      if (/AI Image|סטודיו תמונות|Landing Page/.test(t) && /Studio|תמונות/.test(t)) {
        showToast('סטודיו תמונות AI — בקרוב', 'info'); return true;
      }
      var sc = btn.closest('.screen');
      var mod = sc ? sc.id.replace('sc-', '') : 'general';
      var title = sc?.querySelector('.sec-title')?.textContent || 'AI';
      runAi(mod, 'ניתוח שיווקי קצר (5 נקודות) עבור ' + title + ' — dalia-c.com', '🤖 ' + title);
      return true;
    }
    return false;
  }

  function exportFile(format, btn) {
    var screen = btn.closest('.screen');
    var table = screen?.querySelector('table');
    var rows = [];
    table?.querySelectorAll('tr').forEach(function (tr) {
      var c = []; tr.querySelectorAll('th,td').forEach(function (td) { c.push('"' + td.textContent.trim().replace(/"/g, '""') + '"'); });
      if (c.length) rows.push(c.join(','));
    });
    var blob = new Blob(['\ufeff' + (rows.join('\n') || 'export')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'dalia-export.' + (format === 'pdf' ? 'txt' : 'csv'); a.click();
    showToast('יצוא ' + format.toUpperCase() + ' הוכן', 'success');
  }

  function initSearchFilters() {
    document.querySelectorAll('.srch').forEach(function (input) {
      if (input.tagName === 'SELECT') return;
      input.addEventListener('input', function () {
        var table = (input.closest('.tbl-wrap') || input.closest('.screen'))?.querySelector('table');
        if (!table) return;
        var q = input.value.trim().toLowerCase();
        table.querySelectorAll('tbody tr').forEach(function (row) {
          row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      });
    });
  }

  function onClick(e) {
    var btn = e.target.closest('.btn');
    if (!btn || btn.disabled) return;
    var t = btn.textContent.trim();
    if (handleAiButton(btn)) return;
    if (/סנכרן|Sync Now|סנכron/.test(t)) { syncNow(); return; }
    if (/רענן.*GSC|GSC/.test(t) && /רענן/.test(t)) { syncNow(); return; }
    if (/יצוא PDF|📥 יצוא PDF|📄 יצוא/.test(t)) { exportFile('pdf', btn); return; }
    if (/Excel|CSV/.test(t)) { exportFile(/CSV/.test(t) ? 'csv' : 'excel', btn); return; }
    if (/שמור הגדרות/.test(t)) { showToast('הגדרות נשמרו (הדגמה)', 'success'); return; }
    if (btn.closest('#sc-approval')) {
      if (/אשר הכל/.test(t)) {
        document.querySelectorAll('#sc-approval .appr-item').forEach(function (it) {
          var p = it.querySelector('.pill-orange'); if (p) { p.className = 'pill pill-green'; p.textContent = 'אושר'; it.style.opacity = '0.55'; }
        });
        COCO.state.approvalCount = 0; updateBadges();
        saveAction({ action: 'approved_all', status: 'approved' });
        showToast('כל הפריטים אושרו', 'success'); return;
      }
      if (/דחה|✕/.test(t)) { rejectItem(btn); return; }
      if (/תצוגה|👁/.test(t)) { previewItem(btn); return; }
      if (/עריכה|✏️/.test(t)) { editItem(btn); return; }
      if (/תזמן|📅/.test(t)) { scheduleItem(btn); return; }
      if (/אשר|✓/.test(t)) { approveItem(btn); return; }
    }
  }

  function init() {
    initSearchFilters();
    document.body.addEventListener('click', onClick);
    document.getElementById('actionModal')?.addEventListener('click', function (e) {
      if (e.target.id === 'actionModal') closeActionModal();
    });
    loadData().then(function () { showToast('CO.CO דליה — נטען', 'success'); });
    if (API) {
      apiFetch('/api/ai/health').then(function (r) { updateAiStatus(!!r.data?.ok); }).catch(function () { updateAiStatus(false); });
    } else updateAiStatus(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.COCO = COCO;
  window.closeActionModal = closeActionModal;
  window.showToast = showToast;
  window.syncNow = syncNow;
  window.runAi = runAi;
})();
