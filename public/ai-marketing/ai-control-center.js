/**
 * AI Control Center — functional wiring for screen-ai-center (Mission 25).
 * Minimal UI injection; no layout/color changes.
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderEngineStatus() {
    var el = document.getElementById('coco-ai-control-engines');
    if (!el || !window.COCO_AI_CONTROL) return;
    var engines = COCO_AI_CONTROL.getEngineStatus();
    if (!engines.length) {
      el.textContent = 'טוען סטטוס מנועי AI…';
      return;
    }
    el.innerHTML = engines.map(function (e) {
      var st = e.apiEnabled && e.wired ? 'badge-green' : (e.wired ? 'badge-yellow' : 'badge-gray');
      var lbl = e.apiEnabled && e.wired ? 'פעיל' : (e.wired ? 'תשתית' : 'לא מחובר');
      return '<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;">' +
        '<span>' + esc(e.icon || '') + ' ' + esc(e.label || e.id) + '</span>' +
        '<span class="badge ' + st + '">' + lbl + '</span></div>';
    }).join('');
  }

  function renderSnapshot() {
    var el = document.getElementById('coco-ai-control-stats');
    if (!el || !window.COCO_AI_CONTROL) return;
    var snap = COCO_AI_CONTROL.getSnapshot();
    el.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;font-size:11px;">' +
      '<div><span style="color:var(--white50);">פעולות</span><br><strong>' + snap.counts.pending + '/' + snap.counts.actions + '</strong></div>' +
      '<div><span style="color:var(--white50);">עמודים</span><br><strong>' + snap.counts.pages + '</strong></div>' +
      '<div><span style="color:var(--white50);">DailyEngine</span><br><strong>' + snap.daily.runs + ' ריצות</strong></div>' +
      '<div><span style="color:var(--white50);">Multi-AI</span><br><strong>' + snap.multiAiRuns + ' הרצות</strong></div>' +
      '</div>';
  }

  function askControlCenter(question) {
    var box = document.getElementById('ai-status-box');
    if (!window.COCO_AI_CONTROL) {
      if (box) box.innerHTML = '⚠️ מרכז בקרה AI לא נטען';
      return Promise.resolve(null);
    }
    if (box) {
      box.style.color = 'var(--accent2)';
      box.style.borderColor = 'rgba(37,99,235,0.4)';
      box.innerHTML = '⏳ מנתח נתונים מכל המערכת…';
    }
    var hasLive = !!(window.COCO_STAGING && window.COCO_STAGING.accessToken);
    return COCO_AI_CONTROL.ask(question, { enrichAi: hasLive }).then(function (result) {
      var text = result.summary || '';
      if (result.aiInsight) text += '\n\n' + result.aiInsight;
      if (box) {
        box.style.color = 'var(--green)';
        box.style.borderColor = 'rgba(34,197,94,0.4)';
        box.style.textAlign = 'right';
        box.innerHTML = '<div style="white-space:pre-wrap;line-height:1.7;font-size:13px;color:var(--white);">' + esc(text) + '</div>';
      }
      renderSnapshot();
      if (typeof showToast === 'function') showToast('✓ מרכז בקרה AI — תשובה מוכנה');
      return result;
    }).catch(function (e) {
      if (box) {
        box.style.color = 'var(--red)';
        box.innerHTML = '⚠️ ' + esc(e.message || 'שגיאה');
      }
      return null;
    });
  }

  function injectControlPanel() {
    var overview = document.getElementById('tab-ai-overview');
    if (!overview || document.getElementById('coco-ai-control-panel')) return;

    var section = document.createElement('div');
    section.className = 'section';
    section.style.paddingBottom = '0';
    section.innerHTML =
      '<div class="card" id="coco-ai-control-panel">' +
      '<div class="sec-title">🤖 מרכז בקרה AI — שאילתות חכמות</div>' +
      '<div id="coco-ai-control-stats" style="margin-bottom:12px;font-size:12px;color:var(--white50);">טוען…</div>' +
      '<div id="coco-ai-control-engines" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">' +
      '<button type="button" class="btn btn-ghost" style="font-size:11px;padding:4px 10px;" data-coco-cc-q="מה דחוף היום?">מה דחוף?</button>' +
      '<button type="button" class="btn btn-ghost" style="font-size:11px;padding:4px 10px;" data-coco-cc-q="פעולות ממתינות לאישור">ממתין לאישור</button>' +
      '<button type="button" class="btn btn-ghost" style="font-size:11px;padding:4px 10px;" data-coco-cc-q="סיכום פעולות">סיכום פעולות</button>' +
      '<button type="button" class="btn btn-ghost" style="font-size:11px;padding:4px 10px;" data-coco-cc-q="היסטוריה שבועית">היסטוריה</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;">' +
      '<input type="text" id="coco-ai-control-input" placeholder="שאל את מרכז הבקרה…" ' +
      'style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg4);color:var(--white);font-size:13px;" />' +
      '<button type="button" id="coco-ai-control-ask" class="btn btn-primary" style="font-size:12px;padding:5px 14px;">שאל</button>' +
      '</div></div>';

    var statusSection = overview.querySelector('.section:last-of-type');
    if (statusSection && statusSection.querySelector('#ai-status-box')) {
      statusSection.parentNode.insertBefore(section, statusSection);
    } else {
      overview.appendChild(section);
    }

    section.querySelectorAll('[data-coco-cc-q]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        askControlCenter(btn.getAttribute('data-coco-cc-q'));
      });
    });
    document.getElementById('coco-ai-control-ask')?.addEventListener('click', function () {
      var q = document.getElementById('coco-ai-control-input')?.value?.trim();
      if (q) askControlCenter(q);
    });
    document.getElementById('coco-ai-control-input')?.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var q = e.target.value.trim();
        if (q) askControlCenter(q);
      }
    });

    renderSnapshot();
    renderEngineStatus();
  }

  function wireRunAiAnalysis() {
    if (window._cocoRunAiAnalysisWired) return;
    window._cocoRunAiAnalysisWired = true;
    var orig = window.runAiAnalysis;
    window.runAiAnalysis = function () {
      if (window.COCO_AI_CONTROL) {
        return askControlCenter('ניתוח מנהל AI: מה דחוף, פעולות ממתינות, המלצות SEO ותוכן');
      }
      if (typeof orig === 'function') return orig();
    };
  }

  function init() {
    injectControlPanel();
    wireRunAiAnalysis();
    document.addEventListener('coco:filter-changed', function () {
      renderSnapshot();
    });
  }

  document.addEventListener('coco:ai-control-ready', init);
  if (window.COCO_AI_CONTROL) init();

  window.AiControlCenter = { init: init, ask: askControlCenter, renderSnapshot: renderSnapshot };
})();
