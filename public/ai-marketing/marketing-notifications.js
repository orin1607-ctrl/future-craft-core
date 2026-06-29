/**
 * Marketing Notifications — infrastructure stub (Mission 25.5).
 * Queues notifications locally; live Gmail send requires Edge + OAuth.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'coco-marketing-notifications-v1';
  var MAX_ITEMS = 200;

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
      status: 'stub_only',
      missing: [
        'GMAIL_SEND_ENABLED=true ב-Supabase secrets',
        'OAuth scope: https://www.googleapis.com/auth/gmail.send',
        'Edge function: marketing-notify-email (לא קיים)',
        'Resend fallback: RESEND_API_KEY (קיים ב-FleetOS, לא מחובר לשיווק)',
        'Webhook inbound parser לתשובות "אשר 123" (לא קיים)',
      ],
      wired: ['localStorage queue', 'notification type registry', 'test harness'],
    };
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
  };
})();
