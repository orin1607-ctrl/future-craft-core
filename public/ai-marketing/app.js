/**
 * CO.CO Dalia — Data Layer + UI + API (Google Sheets / OpenAI)
 */
(function () {
  'use strict';

  var API_BASE = '';
  var HAS_API = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (HAS_API) {
    API_BASE = location.port === '8888' ? 'http://127.0.0.1:8787' : '';
  }

  var COCO = { data: null, ai: { connected: false, busy: false }, state: { approvalCount: 7 } };

  function dataUrls() {
    var base = './';
    var path = location.pathname || '';
    if (path.indexOf('ai-marketing-platform') > 0) {
      base = path.substring(0, path.indexOf('ai-marketing-platform'));
    }
    return [base + 'project-001/dashboard.json', base + 'ai-marketing/data.json'];
  }

  var MODULE_PROMPTS = {
    morning: 'תדרוך בוקר: סיכום מצב העסק, 5 פעולות מומלצות, מה דחוף — dalia-c.com. אל תמציא מספרים.',
    director: 'ניתוח AI Director: 5 תובנות SEO + 3 פעולות דחופות ל-dalia-c.com לפי GSC ו-GA4.',
    seo: 'ניתוח SEO: 5 עמודים לשיפור, Meta מומלץ, קישורים פנימיים — dalia-c.com.',
    keywords: 'מחקר מילות מפתח: 10 מילים עם נפח, קושי, עמוד יעד — ניהול צי רכב.',
    content: 'מתווה תוכן SEO: מאמר 800 מילים, H1-H3, Meta Title+Description, FAQ — dalia-c.com.',
    strategy: 'אסטרטגיית שיווק 90 יום: 5 יעדים, ערוצים, KPI, לוח תוכן — dalia-c.com.',
    ailab: '3 רעיונות A/B לכותרות דף נחיתה + נימוק SEO.',
    intel: '5 הזדמנויות תוכן מ-GSC שלא מנוצלות — dalia-c.com.',
    competitors: 'ניתוח 3 מתחרים בניהול צי: חוזקות, חולשות, 5 פערי תוכן.',
    news: '3 נושאים טרנדיים לתוכן שיווקי בתחום ניהול צי רכב.',
    gbp: 'פוסט Google Business: 120 מילים, CTA, האשטags — dalia-c.com.',
    ads: '3 מודעות Google Ads: כותרות 1+2, תיאורים, מילות מפתח, דף נחיתה.',
    landing: 'מבנה דף נחיתה מלא: כותרות, bullets, CTA, Meta, Schema FAQ.',
    pages: 'המלצות SEO ל-5 עמודים: Meta, H1, קישורים פנימיים.',
    warehouse: 'צ\'קליסט SEO לתוכן: URL, Slug, Meta, Schema, FAQ, ALT.',
    briefing: 'תדרוך יומי שיווקי: 3 עליות, 3 ירידות, 3 פעולות להיום.',
    executive: 'סיכום מנהלים: KPI, ROI, המלצות אסטרטגיות לרבעון.',
    roi: 'תחזית ROI ל-3 ערוצי שיווק — SEO, Ads, תוכן.',
    reports: 'מתווה דוח שיווק שבועי: KPI, מילים, תוכן, המלצות.',
    funnel: 'ניתוח משפך: TOFU/MOFU/BOFU — 3 המלצות לשיפור.',
    journey: 'מפת מסע לקוח B2B לניהול צי — 5 נקודות מגע.',
    crm: '3 רעיונות לקמפיין CRM — segment, message, CTA.',
    autonomous: 'מה AI אוטונומי יכול לעשות ב-24 שעות — רשימת פעולות (ללא פרסום).',
    aiimage: 'תיאור 3 תמונות שיווקיות לדף נחיתה (טקst בלבד — יצירת תמונה בקרוב).',
    settings: 'רשימת חיבורי API נדרשים וסטטוס — GSC, GA4, Sheets, OpenAI.',
    general: 'ניתוח שיווקי קצר (5 נקודות) — dalia-c.com.',
  };

  function showToast(msg, type) {
    var el = document.getElementById('cocoToast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'coco-toast show' + (type ? ' coco-toast-' + type : '');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 3800);
  }

  function apiFetch(path, opts) {
    if (!HAS_API) return Promise.reject(new Error('offline'));
    return fetch(API_BASE + path, opts || {}).then(function (r) {
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
    if (src) src.textContent = 'מקור: ' + (isLiveData(d) ? 'חי (GSC/GA4)' : (d.meta?.source || 'דמו'));
    if (d.meta?.spreadsheetUrl) {
      var link = document.getElementById('sheetsLink');
      if (link) { link.href = d.meta.spreadsheetUrl; link.style.display = 'inline-flex'; }
    }
    COCO.state.approvalCount = d.badges?.pendingApproval ?? COCO.state.approvalCount;
    updateBadges();
    var sbAp = document.getElementById('sbBadgeApproval');
    if (sbAp) sbAp.textContent = COCO.state.approvalCount;
    var sbApFull = document.getElementById('sbBadgeApprovalFull');
    if (sbApFull) sbApFull.textContent = COCO.state.approvalCount;
    renderKeywordsTable(document.querySelector('#kw-active tbody'), d.keywords, false);
    var dashTb = document.querySelector('#sc-dashboard .section table tbody');
    if (dashTb && d.keywords?.length) renderKeywordsTable(dashTb, d.keywords.slice(0, 5), true);
    if (d.approvals?.length) bindApprovals(d.approvals);
    bindGbpToUI();
    bindAdsToUI();
    if (window.CocoClaude?.bindClientData) CocoClaude.bindClientData(d);
    if (window.CocoV2?.bindClientData) CocoV2.bindClientData(d);
    if (window.CocoData && CocoData.bindAll) CocoData.bindAll();
  }

  function adsScreen() { return document.getElementById('sc-ads'); }

  function renderAdsLive(d) {
    var ads = d?.adsLive || d?.googleAdsData;
    var screen = adsScreen();
    if (!screen || !ads) return;
    var overlay = screen.querySelector('.cs-overlay');
    if (!ads.ok) {
      if (overlay) overlay.style.display = '';
      var bannerId = 'adsConnBanner';
      var existing = document.getElementById(bannerId);
      if (!existing && overlay) {
        existing = document.createElement('div');
        existing.id = bannerId;
        existing.className = 'card mb-16';
        screen.insertBefore(existing, overlay);
      }
      if (existing) {
        var note = ads.connectionNote || ads.lastError || 'Developer Token חסר — ads.google.com/aw/apicenter';
        existing.innerHTML = '<div class="card-body"><div class="fw7 fs13">💰 Google Ads — ממתין לאישור</div><p class="fs12 text2 mt4">' + esc(note) + '</p><p class="fs11 text2 mt4">לאחר token: npm run project-001:ads-connect</p></div>';
      }
      return;
    }
    if (overlay) overlay.style.display = 'none';
    var k = ads.kpis || {};
    var html = '<div class="g4 mb-16" id="adsLiveKpis">' +
      '<div class="stat-card blue"><div class="stat-label">חשיפות (30 יום)</div><div class="stat-value sm">' + fmt(k.impressions || 0) + '</div></div>' +
      '<div class="stat-card green"><div class="stat-label">קליקים</div><div class="stat-value sm">' + fmt(k.clicks || 0) + '</div></div>' +
      '<div class="stat-card orange"><div class="stat-label">עלות</div><div class="stat-value sm">' + (k.cost != null ? k.cost + ' ' + (k.currency || 'ILS') : '—') + '</div></div>' +
      '<div class="stat-card purple"><div class="stat-label">המרות</div><div class="stat-value sm">' + fmt(k.conversions || 0) + '</div></div>' +
      '</div>';
    var campPane = document.getElementById('adsLiveCampaigns');
    if (!campPane) {
      campPane = document.createElement('div');
      campPane.id = 'adsLiveCampaigns';
      campPane.className = 'card';
      screen.appendChild(campPane);
    }
    var rows = (ads.campaigns || []).slice(0, 10).map(function (c) {
      return '<tr><td class="fw7">' + esc(c.name || '—') + '</td><td><span class="chip chip-blue">' + esc(c.status || '—') + '</span></td><td>' + fmt(c.impressions) + '</td><td>' + fmt(c.clicks) + '</td><td>' + (c.cost != null ? c.cost : '—') + '</td><td>' + fmt(c.conversions) + '</td></tr>';
    }).join('');
    campPane.innerHTML = html + '<div class="card-header">📊 קמפיינים (30 יום)</div><div class="card-body table-wrap"><table class="data-table"><thead><tr><th>קמפיין</th><th>סטטוס</th><th>חשיפות</th><th>קליקים</th><th>עלות</th><th>המרות</th></tr></thead><tbody>' + (rows || '<tr><td colspan="6">אין קמפיינים</td></tr>') + '</tbody></table></div>';
    var title = screen.querySelector('.sec-title');
    if (title && ads.customerName) title.textContent = '💰 Google Ads — ' + ads.customerName;
  }

  function bindAdsToUI() {
    renderAdsLive(COCO.data);
  }

  function gbpScreen() { return document.getElementById('sc-gbp'); }

  function setGbpStat(labelPart, value, change, trend) {
    var screen = gbpScreen();
    if (!screen) return;
    screen.querySelectorAll('.stat-label').forEach(function (lbl) {
      if (lbl.textContent.indexOf(labelPart) === -1) return;
      var card = lbl.closest('.stat-card');
      if (!card) return;
      var val = card.querySelector('.stat-value');
      var chg = card.querySelector('.stat-change');
      if (val && value != null) val.textContent = typeof value === 'number' ? fmt(value) : value;
      if (chg && change) {
        chg.textContent = change;
        chg.className = 'stat-change sc-' + (trend || 'neu');
      }
    });
  }

  function renderGbpConnectionBanner(gbp, live) {
    var screen = gbpScreen();
    if (!screen) return;
    var id = 'gbpConnBanner';
    var existing = document.getElementById(id);
    if (!live) {
      if (existing) existing.remove();
      return;
    }
    var status = gbp.status || 'disconnected';
    var msg = gbp.connectionNote || gbp.lastError || '';
    if (status === 'connected') {
      if (existing) existing.remove();
      return;
    }
    if (!existing) {
      existing = document.createElement('div');
      existing.id = id;
      existing.className = 'card mb-12';
      screen.insertBefore(existing, screen.querySelector('.g4') || screen.firstChild.nextSibling);
    }
    var title = status === 'pending_google_api_approval'
      ? '⏳ Google Business Profile — ממתין לאישור API'
      : '⚠️ Google Business Profile — לא מחובר';
    existing.innerHTML = '<div class="card-body"><div class="fw7 fs13">' + title + '</div><p class="fs12 text2 mt4">' + esc(msg || 'הרץ npm run project-001:gbp-sync לאחר OAuth') + '</p></div>';
  }

  function renderGbpReviews(reviews, unanswered) {
    var pane = document.getElementById('gbp-reviews');
    if (!pane) return;
    var card = pane.querySelector('.card .card-body');
    if (!card || !reviews?.length) return;
    card.style.padding = '0 16px';
    card.innerHTML = reviews.slice(0, 8).map(function (r) {
      var stars = (r.starRating || '').replace('FIVE', '⭐⭐⭐⭐⭐').replace('FOUR', '⭐⭐⭐⭐').replace('THREE', '⭐⭐⭐').replace('TWO', '⭐⭐').replace('ONE', '⭐');
      var btn = r.hasReply
        ? '<span class="pill pill-green">נענה</span>'
        : '<button class="btn btn-primary btn-sm" data-gbp-action="review-reply" data-review="' + esc(r.name || r.reviewer) + '">🤖 הגב עם AI</button>';
      return '<div class="review-style" style="padding:12px 0;border-bottom:1px solid var(--border)"><div style="display:flex;gap:8px;align-items:flex-start"><div style="flex-shrink:0"><div style="color:#f59e0b;font-size:12px">' + stars + '</div></div><div style="flex:1"><div class="fw7 fs13">' + esc((r.comment || '').slice(0, 60) || r.reviewer) + '</div><div class="fs12 text2 mt4">"' + esc(r.comment || '') + '"</div><div class="fs11 text3 mt4">' + esc(r.reviewer) + '</div></div>' + btn + '</div></div>';
    }).join('');
    if (unanswered != null) setGbpStat('ביקורות ללא תגובה', unanswered, unanswered > 0 ? 'דחוף להגיב' : 'הכל נענה', unanswered > 0 ? 'down' : 'up');
  }

  function renderGbpPosts(posts) {
    var pane = document.getElementById('gbp-posts');
    if (!pane) return;
    var tbody = pane.querySelector('table tbody');
    if (!tbody || !posts?.length) return;
    tbody.innerHTML = posts.map(function (p) {
      var dt = (p.createTime || '').slice(0, 10).split('-').reverse().join('.') || '—';
      var st = p.state === 'LIVE' ? '<span class="pill pill-green">פעיל</span>' : '<span class="pill pill-orange">' + esc(p.state || '—') + '</span>';
      return '<tr><td class="fw7">' + esc((p.summary || '').slice(0, 48)) + '</td><td><span class="chip chip-blue">' + esc(p.topicType || '—') + '</span></td><td>' + dt + '</td><td>—</td><td>—</td><td>' + st + '</td><td><button class="btn btn-outline btn-xs" data-gbp-action="post-view">פרטים</button></td></tr>';
    }).join('');
  }

  function renderGbpProfileDetails(profile) {
    if (!profile) return;
    var pane = document.getElementById('gbp-status');
    if (!pane) return;
    var card = pane.querySelector('.card .card-body');
    var rows = pane.querySelectorAll('.card .card-body .row-item');
    var profileCard = rows.length ? rows[0].closest('.card') : null;
    if (!profileCard) return;
    var body = profileCard.querySelector('.card-body');
    if (!body) return;
    body.innerHTML = [
      rowItem('✓', profile.title || '—', 'ri-up'),
      rowItem('✓', profile.primaryCategory || '—', 'ri-up'),
      rowItem(profile.description ? '✓' : '!', profile.description ? 'תיאור עסק — ' + profile.description.slice(0, 80) + (profile.description.length > 80 ? '…' : '') : 'תיאור עסק — חסר', profile.description ? 'ri-up' : 'ri-down', 'עדכן', 'profile-description'),
      rowItem(profile.phone ? '✓' : '!', profile.phone ? 'טלפון: ' + profile.phone : 'טלפון — חסר', profile.phone ? 'ri-up' : 'ri-down'),
      rowItem(profile.website ? '✓' : '!', profile.website ? 'אתר: ' + profile.website : 'אתר — חסר', profile.website ? 'ri-up' : 'ri-down'),
    ].join('');
  }

  function rowItem(icon, text, iconCls, btnLabel, action) {
    var btn = btnLabel ? '<button class="btn btn-outline btn-xs" data-gbp-action="' + (action || 'profile-update') + '">' + btnLabel + '</button>' : '';
    return '<div class="row-item"><div class="row-icon ' + iconCls + '">' + icon + '</div><div class="row-content"><div class="row-text">' + esc(text) + '</div></div>' + btn + '</div>';
  }

  function bindGbpToUI() {
    var d = COCO.data;
    var gbp = d?.gbpLive || d?.businessProfileData;
    if (!gbp) return;
    renderGbpConnectionBanner(gbp, Boolean(gbp.pendingApproval || !gbp.ok));
    if (!gbp.ok && !gbp.kpis) return;
    var k = gbp.kpis || {};
    setGbpStat('ביקורים בפרופיל', k.profileViews, k.profileViews != null ? 'נתונים חיים' : '—', 'up');
    setGbpStat('ניווטים לעסק', k.navigations, k.navigations != null ? 'נתונים חיים' : '—', 'up');
    setGbpStat('דירוג ממוצע', k.averageRating, k.totalReviews != null ? '⭐ ' + k.totalReviews + ' ביקורות' : '—', 'neu');
    setGbpStat('ביקורות ללא תגובה', k.unansweredReviews, k.unansweredReviews > 0 ? 'דחוף להגיב' : 'הכל נענה', k.unansweredReviews > 0 ? 'down' : 'up');
    renderGbpProfileDetails(gbp.profile);
    renderGbpReviews(gbp.reviews, k.unansweredReviews);
    renderGbpPosts(gbp.posts);
    var src = gbpScreen()?.querySelector('.sec-title');
    if (src && gbp.profile?.title) src.textContent = '📍 ' + gbp.profile.title;
  }

  function queueGbpApproval(type, title, body) {
    var item = {
      id: 'gbp-' + Date.now(),
      type: type || 'gbp',
      title: title,
      status: 'pending',
      body: body || '',
      channel: 'Google Business Profile',
    };
    if (!COCO.data) COCO.data = {};
    if (!COCO.data.approvals) COCO.data.approvals = [];
    COCO.data.approvals.unshift(item);
    COCO.state.approvalCount = (COCO.state.approvalCount || 0) + 1;
    updateBadges();
    saveAction({ action: 'gbp_queued', status: 'pending_approval', title: title, note: body, type: type });
    showToast('📋 נשמר למרכז אישורים — לא פורסם ב-GBP', 'success');
  }

  function handleGbpAction(btn) {
    var action = btn.dataset.gbpAction || '';
    var t = btn.textContent.trim();
    if (!action) {
      if (/הגב/.test(t)) action = 'review-reply';
      else if (/פוסט חדש|צור פוסט/.test(t)) action = 'post-create';
      else if (/עדכן/.test(t)) action = 'profile-update';
      else return false;
    }
    var title = action === 'review-reply'
      ? 'תגובה לביקורת GBP: ' + (btn.dataset.review || t.slice(0, 30))
      : action === 'profile-description' || action === 'profile-update'
        ? 'עדכון פרופיל Google Business'
        : action === 'post-create' || action === 'post-view'
          ? 'פוסט Google Business'
          : 'פעולת GBP — ' + t.slice(0, 40);
    queueGbpApproval('gbp', title, 'טיוטה AI — דורש אישור במרכז אישורים לפני פרסום');
    return true;
  }

  function bindApprovals(list) {
    var container = document.querySelector('#sc-approval .card-body');
    if (!container || container.dataset.dynamicBound) return;
    var existing = container.querySelectorAll('.appr-item');
    if (existing.length >= list.length) {
      existing.forEach(function (el, i) {
        if (list[i]?.id) el.dataset.draftId = list[i].id;
      });
      return;
    }
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
    if (ok) chip.textContent = '🟢 OpenAI מחובר';
    else if (HAS_API) chip.textContent = '🟠 OpenAI — בדוק .env.openai';
    else if (window.COCO_STAGING?.accessToken) chip.textContent = '🟠 AI — בודק חיבור…';
    else chip.textContent = '🟠 AI — התחבר דרך דליה (Super Admin)';
  }

  function isLiveData(d) {
    d = d || COCO.data;
    if (!d) return false;
    if (d.meta?.liveOnly) return true;
    var s = d.meta?.source;
    if (s === 'live' || s === 'live-dashboard.json') return true;
    if (s && s !== 'demo' && /dashboard|sheets|live/i.test(String(s))) return true;
    return false;
  }

  function mapDashboardRaw(raw) {
    if (!raw || (!raw.stats && !raw.version)) return null;
    return {
      meta: {
        source: 'live',
        generatedAt: raw.generatedAt,
        spreadsheetUrl: raw.lastSync?.spreadsheet_url,
        liveOnly: true,
        dataSource: raw.dataSource || 'sheets',
      },
      kpis: {
        avgPosition: { value: String(raw.stats.avgPosition ?? '—'), change: '—', trend: 'neutral' },
        weeklyClicks: { value: String(raw.stats.totalClicks ?? 0), change: '—', trend: 'up' },
        activeKeywords: { value: String(raw.stats.activeKeywords ?? 0), change: '—', trend: 'neutral' },
        pendingDrafts: { value: String(raw.stats.pendingDrafts ?? 0), change: 'לאישורך', trend: 'neutral' },
        aiOpportunities: { value: String(raw.stats.opportunities ?? 0), change: '—', trend: 'neutral' },
        weakPages: { value: String(raw.stats.weakPages ?? 0), change: '—', trend: 'down' },
        weeklyImpressions: { value: String(raw.stats.totalImpressions ?? 0), change: '—', trend: 'up' },
        avgCtr: { value: raw.stats.avgCtr != null ? raw.stats.avgCtr + '%' : '—', change: '—', trend: 'neutral' },
        ga4Sessions: { value: String(raw.stats.ga4Sessions ?? 0), change: '—', trend: 'up' },
        ga4PageViews: { value: String(raw.stats.ga4PageViews ?? 0), change: '—', trend: 'up' },
      },
      ga4Sessions: raw.stats.ga4Sessions,
      ga4PageViews: raw.stats.ga4PageViews,
      keywords: (raw.searchConsole?.keywords || []).slice(0, 10).map(function (k) {
        return { keyword: k.query, rank: Math.round(k.position), clicks: k.clicks, volume: k.impressions, ctr: '—', url: k.page || '—', score: 70, change: 0, prev: 0 };
      }),
      badges: { pendingApproval: raw.stats.pendingDrafts || 0 },
      approvals: (raw.drafts || []).filter(function (d) { return d.status === 'pending_approval'; }).map(function (d) {
        return { id: d.id, title: d.title, status: 'pending' };
      }),
      businessProfileData: raw.businessProfileData || raw.gbp || null,
      gbpLive: raw.businessProfileData || raw.gbp || null,
      googleAdsData: raw.googleAdsData || raw.googleAds || null,
      adsLive: raw.googleAdsData || raw.googleAds || null,
      connections: raw.connections || null,
      lastSync: raw.lastSync || null,
      pagesNeedingImprovement: raw.pagesNeedingImprovement || [],
      aiSeoSuggestions: raw.aiSeoSuggestions || [],
    };
  }

  function afterDataLoad() {
    bindDataToUI();
    if (typeof window.HomeV4?.render === 'function') window.HomeV4.render();
  }

  function fetchDashboardJson() {
    var urls = dataUrls();
    return fetch(urls[0] + '?t=' + Date.now()).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('dashboard.json')); })
      .catch(function () { return fetch(urls[1] + '?t=' + Date.now()).then(function (r) { return r.ok ? r.json() : null; }); });
  }

  function marketingApiChat(opts) {
    var staging = window.COCO_STAGING;
    if (staging?.marketingChatUrl && staging?.accessToken) {
      return fetch(staging.marketingChatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + staging.accessToken },
        body: JSON.stringify({
          module: opts.module || 'assistant',
          system: opts.system || '',
          prompt: opts.prompt,
          history: opts.history || [],
        }),
      }).then(function (r) { return r.json(); }).then(function (data) {
        return { ok: !!data.ok, text: data.text, message: data.error || data.message };
      }).catch(function (e) { return { ok: false, message: e.message }; });
    }
    if (HAS_API) {
      return apiFetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      }).then(function (r) {
        return { ok: r.ok && r.data?.ok, text: r.data?.text, message: r.data?.message };
      }).catch(function (e) { return { ok: false, message: e.message }; });
    }
    return Promise.resolve({ ok: false, message: 'AI זמין לאחר התחברות Super Admin בדליה, או npm run ai-marketing:dev מקומית' });
  }

  function probeStagingAi() {
    if (!window.COCO_STAGING?.accessToken) return;
    marketingApiChat({ module: 'assistant', prompt: 'ping', system: 'ענה רק: ok' }).then(function (r) {
      updateAiStatus(!!(r.ok && r.text));
    });
  }

  function loadData() {
    if (HAS_API) {
      return apiFetch('/api/data').then(function (res) {
        if (res.ok && res.data.data) { COCO.data = res.data.data; afterDataLoad(); return; }
        throw new Error(res.data.message || 'API');
      }).catch(function () { return fallbackLoad(); });
    }
    return fallbackLoad();
  }

  function fallbackLoad() {
    return fetchDashboardJson().then(function (raw) {
      if (!raw) return;
      if (raw.kpis && raw.meta?.source !== 'demo') {
        COCO.data = raw;
      } else {
        var mapped = mapDashboardRaw(raw);
        if (mapped) COCO.data = mapped;
      }
      afterDataLoad();
    });
  }

  function syncNow() {
    showToast('🔄 מסנכרן Google Sheets + GSC + GA4...', 'info');
    if (!HAS_API) {
      return fetchDashboardJson().then(function (raw) {
        var mapped = mapDashboardRaw(raw);
        if (mapped) {
          COCO.data = mapped;
          afterDataLoad();
          showToast('✓ נתונים עודכנו מ-dashboard.json', 'success');
        } else {
          showToast('סנכרון מלא דורש מחשב משרד — npm run project-001:sync-and-export', 'warn');
          return fallbackLoad();
        }
      }).catch(function (e) {
        showToast('שגיאת רענון: ' + e.message, 'warn');
      });
    }
    return apiFetch('/api/sync', { method: 'POST' }).then(function (res) {
      if (res.ok && res.data.data) { COCO.data = res.data.data; afterDataLoad(); showToast('✓ סנכרון הושלם', 'success'); }
      else showToast(res.data.message || 'שגיאת סנכרון', 'warn');
    }).catch(function (e) { showToast('סנכרון נכשל: ' + e.message, 'warn'); });
  }

  function saveAction(payload) {
    if (!HAS_API) { showToast('שמירה ל-Google Sheets זמינה בפיתוח מקומי', 'warn'); return Promise.resolve({ ok: false }); }
    return apiFetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (res) {
        if (res.ok && res.data.data) { COCO.data = res.data.data; bindDataToUI(); showToast('✓ נשמר ב-Google Sheets', 'success'); }
        else if (!res.ok) showToast(res.data.message || 'שגיאת שמירה', 'warn');
        return res;
      });
  }

  function runAi(module, prompt, title) {
    if (COCO.ai.busy) { showToast('AI עסוק — המתן', 'warn'); return; }
    var hasStaging = !!(window.COCO_STAGING?.accessToken);
    if (!HAS_API && !hasStaging) {
      showToast('AI: התחבר דרך דליה (Super Admin) או npm run ai-marketing:dev', 'warn');
      return;
    }
    if (HAS_API && !COCO.ai.connected) { showToast('OpenAI לא מחובר — בדוק .env.openai', 'warn'); return; }
    COCO.ai.busy = true;
    showToast('🤖 שולח ל-OpenAI...', 'info');
    var ctx = COCO.data ? '\n\nנתונים: KPI קליקים=' + (COCO.data.kpis?.weeklyClicks?.value || '—') +
      ', מיקום=' + (COCO.data.kpis?.avgPosition?.value || '—') +
      ', GA4 סשנים=' + (COCO.data.kpis?.ga4Sessions?.value || '—') +
      ', מילות=' + (COCO.data.keywords?.length || 0) : '';
    var mod = module || 'general';
    var sys = MODULE_PROMPTS[mod] || MODULE_PROMPTS.general;
    marketingApiChat({
      module: mod,
      prompt: prompt + ctx,
      system: sys,
      history: [],
    }).then(function (res) {
      COCO.ai.busy = false;
      if (res.ok && res.text) {
        openActionModal(title || '🤖 AI', '<div style="white-space:pre-wrap;line-height:1.7">' + esc(res.text) + '</div>', [{ label: 'סגור', cls: 'btn-ghost' }]);
      } else showToast(res.message || 'שגיאת OpenAI', 'warn');
    }).catch(function (e) { COCO.ai.busy = false; showToast('שגיאה: ' + e.message, 'warn'); });
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
      }},
    ]);
  }

  function scheduleItem(btn) {
    var title = btn.closest('.appr-item')?.querySelector('.fw7')?.textContent || '';
    openActionModal('📅 תזמון פרסום', '<p>' + esc(title) + '</p>', [
      { label: 'ביטול', cls: 'btn-ghost' },
      { label: '📅 תזמן', cls: 'btn-primary', fn: function () { showToast('תוזמן — ממתין לאישור סופי', 'success'); gotoSc('scheduler'); } },
    ]);
  }

  function getModulePrompt(sc) {
    var mod = sc ? sc.id.replace('sc-', '') : 'general';
    return { module: mod, prompt: MODULE_PROMPTS[mod] || MODULE_PROMPTS.general, title: sc?.querySelector('.sec-title')?.textContent || 'AI' };
  }

  function handleAiButton(btn) {
    var t = btn.textContent.trim();
    if (/הרץ AI|הרץ ניתוח|AI Keyword|מחקר מילות|יצירת תוכן|צור תוכן|🤖/.test(t)) {
      if (/סטודיו תמונות|AI Image/.test(t)) { showToast('סטודיו תמונות AI — בקרוב', 'info'); return true; }
      var sc = btn.closest('.screen') || document.querySelector('.screen.active');
      var p = getModulePrompt(sc);
      runAi(p.module, p.prompt, '🤖 ' + p.title);
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

  function initGuidePrompts(root) {
    (root || document).querySelectorAll('.guide-prompt[data-ai-prompt]').forEach(function (el) {
      if (el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('click', function () {
        runAi(el.dataset.aiModule || 'general', el.dataset.aiPrompt, el.querySelector('.gp-title')?.textContent || 'AI');
      });
    });
  }

  var manualLoaded = false;
  function manualUrl() {
    var base = './';
    var path = location.pathname || '';
    if (path.indexOf('ai-marketing-platform') > 0) {
      base = path.substring(0, path.indexOf('ai-marketing-platform'));
    }
    return base + 'ai-marketing/usermanual-content.html';
  }

  function loadUserManual() {
    if (manualLoaded) return Promise.resolve();
    return fetch(manualUrl())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (html) {
        var el = document.getElementById('manualBody');
        if (el) { el.innerHTML = html; initGuidePrompts(el); manualLoaded = true; }
      })
      .catch(function () {
        var el = document.getElementById('manualBody');
        if (el) el.innerHTML = '<p class="text2 fs12">לא ניתן לטעון את המדריך. ודא שהקובץ ai-marketing/usermanual-content.html קיים.</p>';
      });
  }

  function onClick(e) {
    var guidePrompt = e.target.closest('.guide-prompt[data-ai-prompt]');
    if (guidePrompt) return;
    var btn = e.target.closest('.btn');
    if (!btn || btn.disabled) return;
    var t = btn.textContent.trim();
    if (btn.id === 'topbarRunAi') {
      var sc = document.querySelector('.screen.active');
      var p = getModulePrompt(sc);
      runAi(p.module, p.prompt, '🤖 ' + p.title);
      return;
    }
    if (handleAiButton(btn)) return;
    if (btn.closest('#sc-gbp') && (btn.dataset.gbpAction || /פוסט חדש|עדכן פרופיל|צור פוסט|אשר כל|הגב/.test(t))) {
      if (handleGbpAction(btn)) return;
      if (/פוסט חדש|צור פוסט/.test(t)) { btn.dataset.gbpAction = 'post-create'; handleGbpAction(btn); return; }
      if (/עדכן פרופיל|עדכן/.test(t)) { btn.dataset.gbpAction = 'profile-update'; handleGbpAction(btn); return; }
      if (/אשר כל/.test(t)) { queueGbpApproval('gbp', 'אישור פעולות GBP מרוכז', 'ממתין לאישור ידני'); return; }
    }
    if (/סנכרן|Sync Now/.test(t)) { syncNow(); return; }
    if (/רענן.*GSC|GSC/.test(t) && /רענן/.test(t)) { syncNow(); return; }
    if (/יצוא PDF|📥 יצוא PDF|📄 יצוא/.test(t)) { exportFile('pdf', btn); return; }
    if (/Excel|CSV/.test(t)) { exportFile(/CSV/.test(t) ? 'csv' : 'excel', btn); return; }
    if (/שמור הגדרות/.test(t)) { saveAction({ action: 'settings_saved', status: 'saved', note: 'הגדרות מהדשבורד' }); return; }
    if (/מדריך שימוש|📘/.test(t) && btn.closest('.sb-item')) { gotoSc('usermanual'); return; }
    if (/מדריך AI|📖/.test(t) && btn.closest('.sb-item')) { gotoSc('aiguide'); return; }
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
    initGuidePrompts();
    if (typeof window.gotoSc === 'function') {
      var _gotoSc = window.gotoSc;
      window.gotoSc = function (id) {
        _gotoSc(id);
        var sid = id.startsWith('sc-') ? id : 'sc-' + id;
        if (sid === 'sc-usermanual') loadUserManual();
      };
    }
    document.body.addEventListener('click', onClick);
    document.getElementById('actionModal')?.addEventListener('click', function (e) {
      if (e.target.id === 'actionModal') closeActionModal();
    });
    loadData().then(function () { showToast('CO.CO דליה — נטען', 'success'); });
    if (HAS_API) {
      apiFetch('/api/ai/health').then(function (r) { updateAiStatus(!!r.data?.ok); }).catch(function () { updateAiStatus(false); });
    } else {
      updateAiStatus(false);
      window.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'dalia-coco-auth') {
          window.COCO_STAGING = e.data;
          probeStagingAi();
          if (window.MarketingClient && typeof window.MarketingClient.renderHub === 'function') {
            window.MarketingClient.renderHub();
          }
        }
      });
      if (window.COCO_STAGING?.accessToken) probeStagingAi();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.COCO = COCO;
  window.COCO_API = { hasApi: HAS_API, base: API_BASE, fetch: apiFetch };
  window.closeActionModal = closeActionModal;
  window.showToast = showToast;
  window.syncNow = syncNow;
  window.runAi = runAi;
  window.loadData = loadData;
  window.isLiveData = isLiveData;
  window.marketingApiChat = marketingApiChat;
  window.loadUserManual = loadUserManual;
  window.queueGbpApproval = queueGbpApproval;
})();
