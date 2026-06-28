/**
 * Actions Demo Code — session-only, lightweight. No code in localStorage history.
 * Staging / Actions screen only.
 */
(function () {
  'use strict';

  var SESSION_PREFIX = 'dalia-act-demo:';
  var DEMO_OK_PREFIX = 'dalia-act-demo-ok:';
  var HISTORY_KEY = 'dalia-actions-upload-history-v1';
  var PENDING_KEY = 'dalia-actions-staging-pending-v1';
  var MAX_FIELD_CHARS = 51200;
  var MAX_HISTORY = 80;
  var MAX_PENDING = 20;
  var TTL_MS = 2 * 60 * 60 * 1000;
  var STAGING_BASE = 'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html';

  var _mem = {};
  var _activeModalActionId = null;

  function readJson(key, fallback) {
    try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch (e) { return fallback; }
  }

  function writeJson(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* quota — ignore */ }
  }

  function trimField(s) {
    s = String(s == null ? '' : s);
    return s.length > MAX_FIELD_CHARS ? s.slice(0, MAX_FIELD_CHARS) : s;
  }

  function emptyDemo() {
    return { html: '', css: '', js: '', at: 0 };
  }

  function getDemo(actionId) {
    if (!actionId) return emptyDemo();
    if (_mem[actionId]) return _mem[actionId];
    try {
      var raw = sessionStorage.getItem(SESSION_PREFIX + actionId);
      if (!raw) return emptyDemo();
      var p = JSON.parse(raw);
      if (!p.at || Date.now() - p.at > TTL_MS) {
        clearDemo(actionId);
        return emptyDemo();
      }
      _mem[actionId] = p;
      return p;
    } catch (e) {
      return emptyDemo();
    }
  }

  function setDemo(actionId, patch) {
    if (!actionId) return emptyDemo();
    var cur = getDemo(actionId);
    var next = {
      html: trimField(patch.html !== undefined ? patch.html : cur.html),
      css: trimField(patch.css !== undefined ? patch.css : cur.css),
      js: trimField(patch.js !== undefined ? patch.js : cur.js),
      at: Date.now(),
    };
    _mem[actionId] = next;
    try {
      sessionStorage.setItem(SESSION_PREFIX + actionId, JSON.stringify(next));
    } catch (e) {
      try {
        next.js = '';
        sessionStorage.setItem(SESSION_PREFIX + actionId, JSON.stringify(next));
      } catch (e2) { /* session full */ }
    }
    return next;
  }

  function clearDemo(actionId) {
    if (!actionId) return;
    delete _mem[actionId];
    try {
      sessionStorage.removeItem(SESSION_PREFIX + actionId);
      sessionStorage.removeItem(DEMO_OK_PREFIX + actionId);
    } catch (e) { /* ignore */ }
  }

  function isDemoApproved(actionId) {
    try { return sessionStorage.getItem(DEMO_OK_PREFIX + actionId) === '1'; } catch (e) { return false; }
  }

  function approveDemo(actionId) {
    try { sessionStorage.setItem(DEMO_OK_PREFIX + actionId, '1'); } catch (e) { /* ignore */ }
  }

  function revokeDemoApproval(actionId) {
    try { sessionStorage.removeItem(DEMO_OK_PREFIX + actionId); } catch (e) { /* ignore */ }
  }

  function buildSrcdoc(html, css, js) {
    return '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>body{font-family:Heebo,Arial,sans-serif;margin:0;padding:16px;line-height:1.5}' +
      ' .coco-demo-banner{background:#fef3c7;color:#92400e;padding:8px 12px;font-size:12px;margin:-16px -16px 16px;border-bottom:1px solid #fcd34d}' +
      (css || '') + '</style></head><body>' +
      '<div class="coco-demo-banner">⚠️ דמו זמני — Staging בלבד · לא Production · לא נשמר בהיסטוריה</div>' +
      (html || '<p style="color:#64748b">הדבק HTML לתצוגה</p>') +
      '<script>' + (js || '') + '<\/script></body></html>';
  }

  function purgePreviewFrame() {
    var frame = document.getElementById('coco-act-demo-preview-frame');
    if (frame) frame.srcdoc = 'about:blank';
  }

  function getHistory() {
    return readJson(HISTORY_KEY, []);
  }

  function addHistoryEntry(entry) {
    var list = getHistory();
    list.unshift(entry);
    writeJson(HISTORY_KEY, list.slice(0, MAX_HISTORY));
  }

  function getPendingUploads() {
    return readJson(PENDING_KEY, []);
  }

  function approveStagingUpload(meta) {
    if (!meta || !meta.actionId) return { ok: false, reason: 'missing_action' };
    if (!isDemoApproved(meta.actionId)) return { ok: false, reason: 'demo_not_approved' };

    var demo = getDemo(meta.actionId);
    var bytes = demo.html.length + demo.css.length + demo.js.length;
    var at = new Date().toISOString();
    var stagingUrl = meta.stagingUrl || (STAGING_BASE + '?v=' + (meta.uiVersion || 'staging'));

    addHistoryEntry({
      id: 'hist-' + Date.now(),
      taskName: meta.taskName || meta.actionId,
      status: 'approved_for_staging',
      date: at,
      assignee: meta.assignee || '',
      commit: meta.commit || '—',
      stagingUrl: stagingUrl,
      note: meta.note || 'אושר להעלאה ל-Staging',
      actionId: meta.actionId,
      codeBytes: bytes,
    });

    var pending = getPendingUploads();
    pending.unshift({
      actionId: meta.actionId,
      taskName: meta.taskName || '',
      pagePath: meta.pagePath || '',
      at: at,
      assignee: meta.assignee || '',
      codeBytes: bytes,
      uiVersion: meta.uiVersion || '',
      note: meta.note || '',
      deployRequested: true,
    });
    writeJson(PENDING_KEY, pending.slice(0, MAX_PENDING));

    return { ok: true, bytes: bytes, stagingUrl: stagingUrl };
  }

  function formatDateHe(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }); }
    catch (e) { return iso; }
  }

  function renderHistoryHtml(limit) {
    var items = getHistory().slice(0, limit || 12);
    if (!items.length) {
      return '<div class="coco-act-demo-history-empty">אין רשומות היסטוריה · נשמרים רק שם, סטטוס, תאריך, מבצע, commit, קישור והערה קצרה</div>';
    }
    return '<div class="coco-act-demo-history-list">' + items.map(function (h) {
      return '<div class="coco-act-demo-history-row">' +
        '<div class="coco-act-demo-history-main">' +
        '<strong>' + escapeHtml(h.taskName || '—') + '</strong> · ' + escapeHtml(h.status || '') +
        '</div>' +
        '<div class="coco-act-demo-history-meta">' +
        formatDateHe(h.date) + ' · ' + escapeHtml(h.assignee || '—') +
        (h.commit && h.commit !== '—' ? ' · commit ' + escapeHtml(h.commit) : '') +
        (h.codeBytes ? ' · ~' + Math.round(h.codeBytes / 1024) + 'KB דemo (לא נשמר)' : '') +
        '</div>' +
        (h.note ? '<div class="coco-act-demo-history-note">' + escapeHtml(h.note) + '</div>' : '') +
        (h.stagingUrl ? '<a href="' + escapeHtml(h.stagingUrl) + '" target="_blank" rel="noopener" class="coco-act-path-link">Staging ↗</a>' : '') +
        '</div>';
    }).join('') + '</div>';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function ensureDemoModal() {
    var el = document.getElementById('coco-act-demo-preview-modal');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'coco-act-demo-preview-modal';
    el.className = 'coco-act-lite-preview-overlay coco-act-demo-overlay';
    el.style.display = 'none';
    el.innerHTML =
      '<div class="coco-act-lite-preview-dialog coco-act-demo-dialog" role="dialog" aria-modal="true">' +
      '<div class="coco-act-lite-preview-head">' +
      '<div><div class="coco-act-lite-preview-title">📋 קוד לדemo — תצוגה מקדימה</div>' +
      '<div class="coco-act-lite-preview-sub" id="coco-act-demo-preview-sub"></div></div>' +
      '<button type="button" class="btn-icon coco-act-demo-close" aria-label="סגור">✕</button></div>' +
      '<div class="coco-act-demo-modal-body">' +
      '<div class="coco-act-demo-editors">' +
      '<label class="coco-act-lite-editor-label">HTML<textarea rows="5" class="coco-act-lite-editor" data-demo-html></textarea></label>' +
      '<label class="coco-act-lite-editor-label">CSS<textarea rows="3" class="coco-act-lite-editor" data-demo-css></textarea></label>' +
      '<label class="coco-act-lite-editor-label">JavaScript<textarea rows="2" class="coco-act-lite-editor" data-demo-js></textarea></label>' +
      '</div>' +
      '<div class="coco-act-demo-modal-actions">' +
      '<button type="button" class="btn btn-primary coco-act-btn-sm" data-demo-apply>▶ הצג Preview</button>' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-demo-clear-code>🗑 מחק קוד</button>' +
      '<button type="button" class="btn btn-green coco-act-btn-sm" data-demo-confirm>✓ מאשר את הדemo</button>' +
      '<button type="button" class="btn btn-primary coco-act-btn-sm coco-act-demo-staging-btn" data-demo-staging-upload style="display:none">🚀 אשר העלאה ל-Staging</button>' +
      '</div>' +
      '<iframe id="coco-act-demo-preview-frame" class="coco-act-lite-preview-frame" title="Demo Preview" sandbox="allow-scripts"></iframe>' +
      '</div></div>';
    (document.getElementById('screen-actions') || document.body).appendChild(el);

    el.querySelector('.coco-act-demo-close').addEventListener('click', function () { closeDemoModal(true); });
    el.addEventListener('click', function (e) { if (e.target === el) closeDemoModal(true); });
    el.querySelector('[data-demo-apply]').addEventListener('click', applyDemoPreview);
    el.querySelector('[data-demo-clear-code]').addEventListener('click', clearDemoFromModal);
    el.querySelector('[data-demo-confirm]').addEventListener('click', confirmDemoFromModal);
    el.querySelector('[data-demo-staging-upload]').addEventListener('click', stagingUploadFromModal);

    ['data-demo-html', 'data-demo-css', 'data-demo-js'].forEach(function (attr) {
      var ta = el.querySelector('[' + attr + ']');
      if (!ta) return;
      ta.addEventListener('input', function () {
        if (!_activeModalActionId) return;
        var patch = {};
        if (attr === 'data-demo-html') patch.html = ta.value;
        if (attr === 'data-demo-css') patch.css = ta.value;
        if (attr === 'data-demo-js') patch.js = ta.value;
        setDemo(_activeModalActionId, patch);
      });
      ta.addEventListener('paste', function () {
        setTimeout(function () {
          if (!_activeModalActionId) return;
          var patch = {};
          if (attr === 'data-demo-html') patch.html = ta.value;
          if (attr === 'data-demo-css') patch.css = ta.value;
          if (attr === 'data-demo-js') patch.js = ta.value;
          setDemo(_activeModalActionId, patch);
        }, 0);
      });
    });

    return el;
  }

  function updateStagingButton(modal) {
    var btn = modal.querySelector('[data-demo-staging-upload]');
    if (!btn || !_activeModalActionId) return;
    btn.style.display = isDemoApproved(_activeModalActionId) ? '' : 'none';
  }

  function applyDemoPreview() {
    var modal = document.getElementById('coco-act-demo-preview-modal');
    if (!modal || !_activeModalActionId) return;
    var html = modal.querySelector('[data-demo-html]').value;
    var css = modal.querySelector('[data-demo-css]').value;
    var js = modal.querySelector('[data-demo-js]').value;
    setDemo(_activeModalActionId, { html: html, css: css, js: js });
    var frame = document.getElementById('coco-act-demo-preview-frame');
    if (frame) frame.srcdoc = buildSrcdoc(html, css, js);
  }

  function clearDemoFromModal() {
    if (!_activeModalActionId) return;
    clearDemo(_activeModalActionId);
    var modal = document.getElementById('coco-act-demo-preview-modal');
    if (modal) {
      modal.querySelector('[data-demo-html]').value = '';
      modal.querySelector('[data-demo-css]').value = '';
      modal.querySelector('[data-demo-js]').value = '';
      updateStagingButton(modal);
    }
    purgePreviewFrame();
    if (typeof showToast === 'function') showToast('קוד הדemo נמחק מהזיכרון');
  }

  function confirmDemoFromModal() {
    if (!_activeModalActionId) return;
    applyDemoPreview();
    approveDemo(_activeModalActionId);
    updateStagingButton(document.getElementById('coco-act-demo-preview-modal'));
    if (typeof showToast === 'function') showToast('✓ הדemo אושר — ניתן לאשר העלאה ל-Staging');
    if (window.ActionsWorkbench && ActionsWorkbench.rerender) ActionsWorkbench.rerender();
  }

  function stagingUploadFromModal() {
    if (!_activeModalActionId) return;
    if (!isDemoApproved(_activeModalActionId)) {
      if (typeof showToast === 'function') showToast('יש לאשר את הדemo לפני העלאה');
      return;
    }
    var ok = window.confirm(
      'אישור סופי:\n\n• Deploy יתבצע ל-Orin Staging בלבד\n• לא Production\n• לא dalia-c.com\n• הקוד לא יישמר בהיסטוריה\n\nלהמשיך?'
    );
    if (!ok) return;

    var meta = (window.ActionsDemoCode && ActionsDemoCode._stagingMeta) || {};
    meta.actionId = _activeModalActionId;
    var res = approveStagingUpload(meta);
    if (!res.ok) {
      if (typeof showToast === 'function') showToast('לא ניתן לאשר — ' + (res.reason || 'שגיאה'));
      return;
    }
    if (typeof showToast === 'function') {
      showToast('✓ אושר להעלאה ל-Staging · Deploy ידני בלבד · אין Production');
    }
    closeDemoModal(false);
    if (window.ActionsWorkbench && ActionsWorkbench.rerender) ActionsWorkbench.rerender();
  }

  function openDemoModal(actionId, meta) {
    _activeModalActionId = actionId;
    ActionsDemoCode._stagingMeta = meta || {};
    var modal = ensureDemoModal();
    var demo = getDemo(actionId);
    modal.querySelector('[data-demo-html]').value = demo.html || '';
    modal.querySelector('[data-demo-css]').value = demo.css || '';
    modal.querySelector('[data-demo-js]').value = demo.js || '';
    var sub = document.getElementById('coco-act-demo-preview-sub');
    if (sub) {
      sub.textContent = (meta && meta.taskName ? meta.taskName + ' · ' : '') +
        'זמני בלבד · נמחק בסגירה · לא נשמר ב-localStorage';
    }
    updateStagingButton(modal);
    modal.style.display = 'flex';
    applyDemoPreview();
  }

  function closeDemoModal(clearCode) {
    purgePreviewFrame();
    var modal = document.getElementById('coco-act-demo-preview-modal');
    if (modal) modal.style.display = 'none';
    if (clearCode && _activeModalActionId) {
      clearDemo(_activeModalActionId);
    }
    _activeModalActionId = null;
  }

  function renderDemoSection(actionId, expanded) {
    if (!expanded || !window.ActionsDemoCode) return '';
    var demo = getDemo(actionId);
    var approved = isDemoApproved(actionId);
    return '<div class="coco-act-work-section coco-act-demo-section">' +
      '<span class="coco-act-work-section-title">📋 קוד לדemo / העלאת קוד</span>' +
      '<p class="coco-act-demo-hint">הדבק קוד מ-ChatGPT, Claude, Gemini או כל AI · נשמר ב-session בלבד (עד 2 שעות) · מקס ~50KB לשדה</p>' +
      '<label class="coco-act-fb-field"><span class="coco-act-fb-label">HTML</span>' +
      '<textarea rows="3" class="coco-act-code-input" spellcheck="false" autocorrect="off" autocapitalize="off" data-demo-inline="html" data-demo-inline-id="' + escapeHtml(actionId) + '"></textarea></label>' +
      '<label class="coco-act-fb-field"><span class="coco-act-fb-label">CSS</span>' +
      '<textarea rows="2" class="coco-act-code-input" spellcheck="false" autocorrect="off" autocapitalize="off" data-demo-inline="css" data-demo-inline-id="' + escapeHtml(actionId) + '"></textarea></label>' +
      '<label class="coco-act-fb-field"><span class="coco-act-fb-label">JavaScript</span>' +
      '<textarea rows="2" class="coco-act-code-input" spellcheck="false" autocorrect="off" autocapitalize="off" data-demo-inline="js" data-demo-inline-id="' + escapeHtml(actionId) + '"></textarea></label>' +
      '<div class="coco-act-demo-inline-actions">' +
      '<button type="button" class="btn btn-primary coco-act-btn-sm" data-demo-open="' + escapeHtml(actionId) + '">▶ Preview מלא</button>' +
      '<button type="button" class="btn btn-ghost coco-act-btn-sm" data-demo-inline-clear="' + escapeHtml(actionId) + '">🗑 מחק קוד</button>' +
      (approved
        ? '<span class="badge badge-green">✓ דemo מאושר</span>'
        : '<button type="button" class="btn btn-green coco-act-btn-sm" data-demo-inline-ok="' + escapeHtml(actionId) + '">✓ מאשר את הדemo</button>') +
      (approved
        ? '<button type="button" class="btn btn-primary coco-act-btn-sm" data-demo-inline-staging="' + escapeHtml(actionId) + '">🚀 אשר העלאה ל-Staging</button>'
        : '') +
      '</div></div>';
  }

  window.ActionsDemoCode = {
    getDemo: getDemo,
    setDemo: setDemo,
    clearDemo: clearDemo,
    isDemoApproved: isDemoApproved,
    approveDemo: approveDemo,
    revokeDemoApproval: revokeDemoApproval,
    buildSrcdoc: buildSrcdoc,
    openDemoModal: openDemoModal,
    closeDemoModal: closeDemoModal,
    purgePreviewFrame: purgePreviewFrame,
    approveStagingUpload: approveStagingUpload,
    getHistory: getHistory,
    renderHistoryHtml: renderHistoryHtml,
    renderDemoSection: renderDemoSection,
    restoreInlineFields: restoreInlineFields,
    MAX_FIELD_CHARS: MAX_FIELD_CHARS,
    _stagingMeta: {},
  };

  function restoreInlineFields(root) {
    root = root || document.getElementById('coco-live-actions-pending');
    if (!root) return;
    root.querySelectorAll('[data-demo-inline]').forEach(function (ta) {
      var aid = ta.getAttribute('data-demo-inline-id');
      var field = ta.getAttribute('data-demo-inline');
      if (!aid || !field) return;
      var demo = getDemo(aid);
      var val = (demo && demo[field]) || '';
      if (document.activeElement !== ta) ta.value = val;
    });
  }
})();
