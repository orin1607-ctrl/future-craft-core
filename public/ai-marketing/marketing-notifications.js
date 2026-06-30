/**
 * Marketing Notifications — infrastructure stub (Mission 30).
 * Queues notifications locally; Resend send via marketing-notify-email Edge.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'coco-marketing-notifications-v1';
  var MAX_ITEMS = 200;
  var EDGE_NAME = 'marketing-notify-email';
  var STAGING_SUPABASE_URL = 'https://usfeoerkpcafxxlyuldl.supabase.co';
  var DEFAULT_APPROVAL_EMAIL = 'orin1607@gmail.com';

  var TYPES = {
    action_completed: { label: 'פעולה הושלמה', priority: 'normal' },
    approval_required: { label: 'נדרש אישור', priority: 'high' },
    page_ready: { label: 'עמוד מוכן', priority: 'normal' },
    daily_digest: { label: 'סיכום יומי', priority: 'low' },
    critical_alert: { label: 'התראה קריטית', priority: 'critical' },
  };

  function readQueue() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) { return []; }
  }

  function writeQueue(items) {
    try {
      if (items.length > MAX_ITEMS) items.length = MAX_ITEMS;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) { /* ignore quota */ }
  }

  function getGmailRequirements() {
    return {
      status: 'resend_phase1',
      path: 'Resend via Supabase Edge (marketing-notify-email) — not native Gmail OAuth',
      missing: [
        'Deploy marketing-notify-email to Supabase Staging',
        'MARKETING_CRON_SECRET for headless dispatch (optional)',
        'marketing_approvals + tokens tables (Mission 27 Phase 1)',
        'GMAIL_SEND_ENABLED + OAuth (Phase 2 — optional)',
        'Webhook inbound parser לתשובות "אשר 123" (Phase 3)',
      ],
      wired: [
        'localStorage queue',
        'approval_required → tryDispatchApprovalEmail stub',
        'notification type registry',
        'test harness',
      ],
      edgeFunction: EDGE_NAME,
    };
  }

  function getSupabaseUrl() {
    try {
      if (window.CocoEnv && CocoEnv.SUPABASE_URL) return CocoEnv.SUPABASE_URL;
      if (window.__SUPABASE_URL__) return window.__SUPABASE_URL__;
    } catch (e) { /* ignore */ }
    return STAGING_SUPABASE_URL;
  }

  /**
   * Stub: when approval_required is queued, POST to Edge if configured.
   * GH Pages cannot hold secrets — production uses cron/outbox with service role.
   */
  function tryDispatchApprovalEmail(item) {
    if (!item || item.type !== 'approval_required') return Promise.resolve({ ok: false, skipped: 'not_approval' });
    var base = getSupabaseUrl();
    var endpoint = base.replace(/\/$/, '') + '/functions/v1/' + EDGE_NAME;
    var payload = item.payload || {};
    var body = {
      recipient: payload.recipient || payload.managerEmail || DEFAULT_APPROVAL_EMAIL,
      approvalId: payload.approvalId || payload.pageId || item.id,
      subject: payload.emailSubject || ('📢 עמוד מוכן לאישור – ' + (payload.pageTitle || payload.pageName || 'עמוד')),
      html: payload.emailHtml || null,
      dryRun: !payload.emailHtml,
    };
    if (!body.recipient || !body.html) {
      return Promise.resolve({
        ok: false,
        skipped: 'missing_recipient_or_html',
        note: 'Run scripts/send-gmail-approval-trial.mjs --v2 or wire Edge outbox',
        edgeEndpoint: endpoint,
      });
    }
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); })
      .catch(function (e) { return { ok: false, error: String(e.message || e) }; });
  }

  function enqueue(type, payload) {
    if (!TYPES[type]) return { ok: false, error: 'unknown_type' };
    var item = {
      id: 'ntf-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      type: type,
      at: new Date().toISOString(),
      payload: payload || {},
      sent: false,
      channel: 'local_queue',
    };
    var q = readQueue();
    q.unshift(item);
    writeQueue(q);
    document.dispatchEvent(new CustomEvent('coco:notification-queued', { detail: item }));
    if (type === 'approval_required') {
      tryDispatchApprovalEmail(item).then(function (dispatch) {
        item.edgeDispatch = dispatch;
        document.dispatchEvent(new CustomEvent('coco:approval-email-dispatch', { detail: { item: item, dispatch: dispatch } }));
      });
    }
    return { ok: true, item: item, gmail: getGmailRequirements() };
  }

  function getPending() {
    return readQueue().filter(function (n) { return !n.sent; });
  }

  function getHistory(limit) {
    return readQueue().slice(0, limit || 50);
  }

  function markSent(id) {
    var q = readQueue();
    q.forEach(function (n) { if (n.id === id) n.sent = true; });
    writeQueue(q);
  }

  function testAll() {
    var results = [];
    Object.keys(TYPES).forEach(function (type) {
      results.push(enqueue(type, { test: true, label: TYPES[type].label }));
    });
    return { ok: true, count: results.length, results: results, gmail: getGmailRequirements() };
  }

  window.MarketingNotifications = {
    TYPES: TYPES,
    enqueue: enqueue,
    getPending: getPending,
    getHistory: getHistory,
    markSent: markSent,
    testAll: testAll,
    getGmailRequirements: getGmailRequirements,
    tryDispatchApprovalEmail: tryDispatchApprovalEmail,
    EDGE_NAME: EDGE_NAME,
  };
})();
