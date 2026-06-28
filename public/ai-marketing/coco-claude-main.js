// ===== CLIENT ASSETS =====
const ASSET_DATA = {
  website: {
    icon:'🌐', title:'אתר אינטרנט', subtitle:'greentech.co.il',
    status:'connected', statusLabel:'מחובר', statusBadge:'badge-green',
    lastSync:'לפני 12 דקות',
    hasApi: true,
    autoContent:`<div style="margin-bottom:8px;"><span style="color:var(--green);font-weight:700;">✓ האתר מחובר ונסרק</span></div>
      <div style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--white50);">
        <div style="display:flex;justify-content:space-between;"><span>דומיין</span><strong style="color:var(--white80);">greentech.co.il</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>סריקה אחרונה</span><strong style="color:var(--green);">לפני 12 דק'</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>עמודים שנסרקו</span><strong style="color:var(--white80);">48</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>שגיאות</span><strong style="color:var(--red);">3 (שגיאות 404)</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Sitemap</span><strong style="color:var(--green);">✓ קיים</strong></div>
      </div>`,
    manualFields:['דומיין','כתובת URL','שם משתמש / FTP','הערות']
  },
  gsc: {
    icon:'🔎', title:'Google Search Console', subtitle:'Google SEO',
    status:'pending', statusLabel:'ממתין לחיבור', statusBadge:'badge-yellow',
    lastSync:'טרם חובר',
    hasApi: true,
    autoContent:`<div style="margin-bottom:8px;font-weight:700;color:var(--yellow);">⏳ ממתין לחיבור OAuth</div>
      <div style="font-size:12px;color:var(--white50);line-height:1.7;">
        שלב 1: לחץ "חבר אוטומטית" להפניה ל-Google<br>
        שלב 2: אשר הרשאת קריאה ל-Search Console<br>
        שלב 3: בחר נכס (property): greentech.co.il<br><br>
        <span style="color:var(--white80);">לאחר חיבור יוצגו: קליקים, חשיפות, CTR, מיקום, שאילתות, שגיאות אינדוקס, Core Web Vitals</span>
      </div>`,
    manualFields:['Property URL','Property ID','חשבון Google','הערות']
  },
  ga4: {
    icon:'📊', title:'Google Analytics 4', subtitle:'תנועה ומשתמשים',
    status:'pending', statusLabel:'ממתין לחיבור', statusBadge:'badge-yellow',
    lastSync:'טרם חובר',
    hasApi: true,
    autoContent:`<div style="margin-bottom:8px;font-weight:700;color:var(--yellow);">⏳ ממתין לחיבור OAuth</div>
      <div style="font-size:12px;color:var(--white50);line-height:1.7;">
        שלב 1: לחץ "חבר אוטומטית"<br>
        שלב 2: אשר הרשאת Google Analytics<br>
        שלב 3: בחר Property ID<br><br>
        <span style="color:var(--white80);">לאחר חיבור: סשנים, משתמשים, Bounce Rate, המרות, מקורות תנועה, עמודים</span>
      </div>`,
    manualFields:['Property ID','Measurement ID','חשבון Google','הערות']
  },
  gads: {
    icon:'📢', title:'Google Ads', subtitle:'קמפיינים ממומנים',
    status:'pending', statusLabel:'ממתין לחיבור', statusBadge:'badge-yellow',
    lastSync:'טרם חובר',
    hasApi: true,
    autoContent:`<div style="margin-bottom:8px;font-weight:700;color:var(--yellow);">⏳ ממתין לחיבור Google Ads API</div>
      <div style="font-size:12px;color:var(--white50);line-height:1.7;">
        שלב 1: לחץ "חבר אוטומטית"<br>
        שלב 2: הזן Customer ID<br>
        שלב 3: אשר הרשאות<br><br>
        <span style="color:var(--white80);">לאחר חיבור: קמפיינים, תקציב, קליקים, המרות, ROAS, CPC, Quality Score</span>
      </div>`,
    manualFields:['Customer ID','חשבון Google','מנהל חשבון MCC','הערות']
  },
  gbp: {
    icon:'📍', title:'Google Business Profile', subtitle:'גרין-טק ראשל"צ',
    status:'error', statusLabel:'שגיאה – Token פג', statusBadge:'badge-red',
    lastSync:'לפני 3 ימים (שגיאה)',
    hasApi: true,
    autoContent:`<div style="margin-bottom:8px;font-weight:700;color:var(--red);">⚠️ שגיאה: Token פג תוקף</div>
      <div style="font-size:12px;color:var(--white50);line-height:1.7;">
        <div style="color:var(--red);margin-bottom:6px;">OAuth Token פג תוקף – נדרש חיבור מחדש</div>
        לחץ "חבר אוטומטית" לחידוש ההרשאה<br><br>
        <span style="color:var(--white80);">לאחר חיבור: ביקורות, דירוג, פוסטים, תמונות, שאלות ותשובות, צפיות בכרטיס</span>
      </div>`,
    manualFields:['Business ID','שם עסק בGBP','קישור לכרטיס','הערות']
  },
  facebook: {
    icon:'📘', title:'Facebook Page', subtitle:'Page ID: 10842938174',
    status:'connected', statusLabel:'מחובר (OAuth)', statusBadge:'badge-green',
    lastSync:'לפני שעה',
    hasApi: true,
    autoContent:`<div style="margin-bottom:8px;"><span style="color:var(--green);font-weight:700;">✓ Facebook מחובר ב-OAuth</span></div>
      <div style="font-size:12px;color:var(--white50);line-height:1.7;">
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;justify-content:space-between;"><span>Page ID</span><strong style="color:var(--white80);">10842938174</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>הרשאות</span><strong style="color:var(--green);">pages_read_engagement ✓</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>עוקבים</span><strong style="color:var(--white50);">ממתין לחיבור API נתונים</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>לידים</span><strong style="color:var(--white50);">ממתין לחיבור Lead Ads API</strong></div>
        </div>
      </div>`,
    manualFields:['Page ID','Page URL','Access Token','הערות']
  },
  instagram: {
    icon:'📸', title:'Instagram', subtitle:'@greentech_official',
    status:'connected', statusLabel:'מחובר (Meta OAuth)', statusBadge:'badge-green',
    lastSync:'לפני שעה',
    hasApi: true,
    autoContent:`<div style="margin-bottom:8px;"><span style="color:var(--green);font-weight:700;">✓ Instagram מחובר דרך Meta</span></div>
      <div style="font-size:12px;color:var(--white50);line-height:1.7;">
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;justify-content:space-between;"><span>Account</span><strong style="color:var(--white80);">@greentech_official</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>חיבור</span><strong style="color:var(--green);">Meta Business Suite ✓</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>עוקבים</span><strong style="color:var(--white50);">ממתין לחיבור API נתונים</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Insights</span><strong style="color:var(--white50);">ממתין לחיבור</strong></div>
        </div>
      </div>`,
    manualFields:['Account ID','שם משתמש','קישור לפרופיל','הערות']
  },
  tiktok: {
    icon:'🎵', title:'TikTok', subtitle:'לא מחובר',
    status:'pending', statusLabel:'ממתין לחיבור', statusBadge:'badge-yellow',
    lastSync:'טרם חובר',
    hasApi: true,
    autoContent:`<div style="margin-bottom:8px;font-weight:700;color:var(--yellow);">⏳ ממתין לחיבור TikTok API</div>
      <div style="font-size:12px;color:var(--white50);line-height:1.7;">
        TikTok Business API דורש אישור TikTok for Business<br><br>
        שלב 1: פתח חשבון TikTok for Business<br>
        שלב 2: לחץ "חבר אוטומטית" לאחר אישור<br><br>
        <span style="color:var(--white80);">לאחר חיבור: עוקבים, צפיות, אינטראקציה, סרטונים, Ads (אם קיים)</span>
      </div>`,
    manualFields:['קישור לפרופיל','שם משתמש','Advertiser ID (Ads)','הערות']
  },
  youtube: {
    icon:'▶️', title:'YouTube', subtitle:'לא מחובר',
    status:'pending', statusLabel:'ממתין לחיבור', statusBadge:'badge-yellow',
    lastSync:'טרם חובר',
    hasApi: true,
    autoContent:`<div style="margin-bottom:8px;font-weight:700;color:var(--yellow);">⏳ ממתין לחיבור YouTube Data API</div>
      <div style="font-size:12px;color:var(--white50);line-height:1.7;">
        שלב 1: לחץ "חבר אוטומטית" (Google OAuth)<br>
        שלב 2: אשר הרשאת YouTube Analytics<br>
        שלב 3: בחר Channel ID<br><br>
        <span style="color:var(--white80);">לאחר חיבור: מנויים, צפיות, סרטונים, Watch Time, קהל</span>
      </div>`,
    manualFields:['Channel ID','קישור לערוץ','חשבון Google','הערות']
  },
  linkedin: {
    icon:'💼', title:'LinkedIn', subtitle:'עמוד חברה',
    status:'manual', statusLabel:'חיבור ידני', statusBadge:'badge-purple',
    lastSync:'עודכן ידנית',
    hasApi: false,
    autoContent:`<div style="margin-bottom:8px;font-weight:700;color:var(--purple);">ℹ️ LinkedIn Marketing API – דורש אישור LinkedIn</div>
      <div style="font-size:12px;color:var(--white50);line-height:1.7;">
        LinkedIn API דורש אישור מיוחד מ-LinkedIn Marketing Solutions<br><br>
        כרגע: חיבור ידני מומלץ<br>
        עתידי: API אחרי קבלת הרשאה<br><br>
        <span style="color:var(--white80);">לאחר חיבור מלא: עוקבים, פוסטים, Impressions, לידים</span>
      </div>`,
    manualFields:['קישור לעמוד חברה','Page ID','שם העמוד','עוקבים (הזנה ידנית)','הערות']
  },
  email: {
    icon:'📧', title:'Email / Gmail', subtitle:'מייל עסקי',
    status:'pending', statusLabel:'ממתין לחיבור', statusBadge:'badge-yellow',
    lastSync:'טרם חובר',
    hasApi: true,
    autoContent:`<div style="margin-bottom:8px;font-weight:700;color:var(--yellow);">⏳ ממתין לחיבור Gmail API</div>
      <div style="font-size:12px;color:var(--white50);line-height:1.7;">
        שלב 1: לחץ "חבר אוטומטית" (Google OAuth)<br>
        שלב 2: אשר הרשאת Gmail Read<br><br>
        <span style="color:var(--white80);">לאחר חיבור: מעקב פניות, תבניות, שליחות, לידים ממייל</span>
      </div>`,
    manualFields:['כתובת מייל עסקית','ספק מייל','IMAP/SMTP','הערות']
  },
  whatsapp: {
    icon:'💬', title:'WhatsApp Business', subtitle:'Business API',
    status:'pending', statusLabel:'ממתין לחיבור', statusBadge:'badge-yellow',
    lastSync:'טרם חובר',
    hasApi: true,
    autoContent:`<div style="margin-bottom:8px;font-weight:700;color:var(--yellow);">⏳ ממתין לחיבור WhatsApp Business API</div>
      <div style="font-size:12px;color:var(--white50);line-height:1.7;">
        WhatsApp Business API דורש אישור Meta<br><br>
        שלב 1: פתח חשבון Meta Business<br>
        שלב 2: הגש בקשת גישה ל-WhatsApp API<br>
        שלב 3: לחץ "חבר אוטומטית" אחרי אישור<br><br>
        <span style="color:var(--white80);">לאחר חיבור: מקור לידים, הודעות, שיחות, תבניות</span>
      </div>`,
    manualFields:['מספר עסקי WhatsApp','Phone Number ID','שם העסק','הערות']
  }
};

function openAssetModal(assetId) {
  const a = ASSET_DATA[assetId];
  if (!a) return;
  document.getElementById('mac-icon').textContent      = a.icon;
  document.getElementById('mac-title').textContent     = a.title;
  document.getElementById('mac-subtitle').textContent  = 'CLT-001 • גרין-טק';
  document.getElementById('mac-status-badge').outerHTML =
    `<span id="mac-status-badge" class="badge ${a.statusBadge}">${a.statusLabel}</span>`;
  document.getElementById('mac-last-sync').textContent = a.lastSync;
  document.getElementById('mac-auto-content').innerHTML = a.autoContent;

  // Manual fields
  const mf = document.getElementById('mac-manual-fields');
  mf.innerHTML = a.manualFields.map(f => `
    <div>
      <div style="font-size:11px;color:var(--white50);margin-bottom:3px;">${f}</div>
      <input class="filter-input" style="width:100%;" placeholder="${f}...">
    </div>`).join('');

  // Connect button label
  const btn = document.getElementById('mac-btn-connect');
  if (btn) btn.textContent = a.status === 'error' ? '🔄 חבר מחדש' : a.hasApi ? '🔗 חבר אוטומטית' : '⚠️ API בהמתנה';

  switchMacTab('auto');
  openModal('modal-asset-connect');
}

function switchMacTab(tab) {
  const auto   = document.getElementById('mac-panel-auto');
  const manual = document.getElementById('mac-panel-manual');
  const btnA   = document.getElementById('mac-tab-auto');
  const btnM   = document.getElementById('mac-tab-manual');
  if (tab === 'auto') {
    auto.style.display   = '';
    manual.style.display = 'none';
    btnA.style.background = 'var(--accent)'; btnA.style.color = '#fff'; btnA.style.border = 'none';
    btnM.style.background = 'var(--bg4)';    btnM.style.color = 'var(--white80)'; btnM.style.border = '1px solid var(--border)';
  } else {
    auto.style.display   = 'none';
    manual.style.display = '';
    btnM.style.background = 'var(--accent)'; btnM.style.color = '#fff'; btnM.style.border = 'none';
    btnA.style.background = 'var(--bg4)';    btnA.style.color = 'var(--white80)'; btnA.style.border = '1px solid var(--border)';
  }
}

function doAutoConnect() {
  showToast('🔗 מעביר ל-OAuth...');
  closeModal('modal-asset-connect');
}

function saveManualAsset() {
  showToast('💾 חיבור ידני נשמר');
  closeModal('modal-asset-connect');
}

function filterClientAssets() {
  const type   = document.getElementById('ca-type')?.value   || '';
  const status = document.getElementById('ca-status')?.value || '';
  const search = (document.getElementById('ca-search')?.value || '').toLowerCase();
  document.querySelectorAll('.ca-card').forEach(card => {
    const typeOk   = !type   || card.dataset.type   === type;
    const statusOk = !status || card.dataset.status === status;
    const textOk   = !search || card.textContent.toLowerCase().includes(search);
    card.style.display = (typeOk && statusOk && textOk) ? '' : 'none';
  });
}
// ===== END CLIENT ASSETS =====

// ===== GLOBAL CLIENT CONTEXT =====
// When a client is selected, all 10 modules filter to the same context
const ACTIVE_CONTEXT = {
  clientId: 'CLT-001',
  company: 'גרין-טק פתרונות בע"מ',
  site: 'greentech.co.il',
  campaign: 'Brand Search',
  manager: 'יוני'
};

// ===== AI CENTER =====
function runAiAnalysis() {
  const box = document.getElementById('ai-status-box');
  if (!box) { showToast('▶️ ניתוח AI הופעל'); return; }
  var chat = typeof window.marketingApiChat === 'function'
    ? window.marketingApiChat
    : (window.CocoUnified && CocoUnified.marketingAiChat);
  var hasAuth = !!(window.COCO_STAGING && window.COCO_STAGING.accessToken);
  if (chat && hasAuth) {
    box.style.color = 'var(--accent2)';
    box.style.borderColor = 'rgba(37,99,235,0.4)';
    box.innerHTML = '⏳ שולח נתונים ל-ChatGPT...';
    chat({
      module: 'director',
      prompt: 'ניתוח AI Director: 5 תובנות SEO + 3 פעולות דחופות ל-dalia-c.com לפי GSC ו-GA4. ענה בעברית, מובנה.',
    }).then(function (res) {
      if (res.ok && res.text) {
        box.style.color = 'var(--green)';
        box.style.borderColor = 'rgba(34,197,94,0.4)';
        box.style.textAlign = 'right';
        box.innerHTML = '<div style="white-space:pre-wrap;line-height:1.7;font-size:13px;color:var(--white);">' +
          String(res.text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
        showToast('✓ ניתוח ChatGPT הושלם');
      } else {
        box.style.color = 'var(--yellow)';
        box.innerHTML = '⚠️ ' + (res.message || res.error || 'שגיאת OpenAI');
        showToast('⚠️ שגיאת ChatGPT', 'warn');
      }
    }).catch(function (e) {
      box.style.color = 'var(--red)';
      box.innerHTML = '⚠️ ' + (e.message || 'שגיאה');
      showToast('⚠️ שגיאת ChatGPT', 'warn');
    });
    return;
  }
  box.style.color = 'var(--yellow)';
  box.innerHTML = '⚠️ ממתין להתחברות Super Admin בדליה — ChatGPT דרך Edge marketing-ai-chat';
  showToast('⚠️ התחבר דרך דליה (Super Admin)', 'warn');
}

// ===== END AI CENTER / HISTORY / REPORTS =====

// ===== NAVIGATION =====
function clearNestedActiveScreens(root) {
  if (!root) return;
  root.querySelectorAll('.screen .screen.active').forEach(function (s) {
    s.classList.remove('active');
  });
}

function goScreen(id, opts) {
  opts = opts || {};
  if (id === 'screen-ai-decisions') id = 'screen-ai-center';
  var root = document.getElementById('coco-claude-root');
  var screens = root ? root.querySelectorAll(':scope > .screen') : document.querySelectorAll('.screen');
  screens.forEach(function (s) { s.classList.remove('active'); });
  var el = null;
  if (root) {
    screens.forEach(function (s) { if (s.id === id) el = s; });
  } else {
    el = document.getElementById(id);
  }
  if (el) {
    el.classList.add('active');
    var isMobile = window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
    var skipScroll = opts.preserveScroll || (id === 'screen-actions' && isMobile);
    if (!skipScroll) {
      var content = el.querySelector('.content');
      if (content) content.scrollTo(0, 0);
    }
  }
  if (id !== 'screen-crm') clearNestedActiveScreens(root);
  if (id === 'screen-crm') document.body.classList.add('coco-crm-active');
  else document.body.classList.remove('coco-crm-active');
  document.querySelectorAll('.bottom-nav .bnav-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-screen') === id);
  });
  if (id === 'screen-crm' && window.CocoMarketingCrm && CocoMarketingCrm.ensureVisible) {
    CocoMarketingCrm.ensureVisible();
  }
}

// ===== TABS =====
function setTab(btn, tabId) {
  const tabs = btn.closest('.nav-tabs');
  tabs.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const screen = btn.closest('.screen');
  // hide all tab contents in this screen
  const all = [];
  screen.querySelectorAll('[id^="tab-"]').forEach(t => { t.style.display = 'none'; all.push(t.id); });
  const target = document.getElementById(tabId);
  if (target) target.style.display = '';
}

// ===== MODALS =====
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}
// Close on overlay click
document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('click', e => { if(e.target === o) o.classList.remove('open'); });
});

// ===== TOAST =====
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.opacity = '1';
  t.style.transform = 'translateY(0)';
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(20px)'; }, 3000);
}

function showDaliaToast() {
  showToast('🏠 חוזר למערכת דליה הראשית...');
  if (window.PrdDaliaNav && typeof PrdDaliaNav.exitToDalia === 'function') {
    setTimeout(function () { PrdDaliaNav.exitToDalia(); }, 450);
    return;
  }
  var home = (window.PrdDaliaNav && PrdDaliaNav.getDaliaHomeUrl)
    ? PrdDaliaNav.getDaliaHomeUrl()
    : ((window.COCO_PAGES_BASE || '/future-craft-core/').replace(/\/?$/, '/') + 'admin-home');
  if (home.charAt(0) === '/') home = location.origin + home;
  setTimeout(function () { location.href = home; }, 450);
}

// ===== ACTIONS =====
function approveAction(btn) {
  const card = btn.closest('.action-card');
  card.style.opacity = '0.5';
  card.style.pointerEvents = 'none';
  showToast('✅ הפעולה אושרה ועוברת לביצוע');
  setTimeout(() => card.remove(), 800);
}
function rejectAction(btn) {
  const card = btn.closest('.action-card');
  card.style.opacity = '0.5';
  card.style.pointerEvents = 'none';
  showToast('✗ הפעולה נדחתה');
  setTimeout(() => card.remove(), 800);
}

// ===== THEME =====
function toggleTheme() {
  const checked = document.getElementById('themeToggle').checked;
  document.body.classList.toggle('light', checked);
  document.getElementById('themeKnob').style.right = checked ? 'auto' : '3px';
  document.getElementById('themeKnob').style.left = checked ? '3px' : 'auto';
}

// ===== CLIENT SELECT =====
function selectClient(name) {
  showToast('🏢 עבר ללקוח: ' + name);
}

// ===== AI CHAT =====
function sendAiMessage() {
  const inp = document.getElementById('ai-input');
  const val = inp.value.trim();
  if (!val) return;
  inp.value = '';
  showToast('🤖 AI מעבד את השאלה...');
}
function aiQuickQ(q) {
  document.getElementById('ai-input').value = q;
  setTimeout(sendAiMessage, 100);
}

// ===== CHECKS TABLE =====
const CATEGORIES = [
  '1. תוכן איכותי','2. מחקר מילות מפתח','3. מהירות האתר','4. מבנה SEO',
  '5. UX','6. Mobile First','7. קישורים פנימיים','8. דפי שירות',
  '9. מאמרים','10. תמונות ומדיה','11. SEO לכל עמוד','12. בדיקות יומיות',
  '13. מתחרים','14. Authority','15. מעקב שינויים','16. עמודים חלשים',
  '17. המלצות Google','18. מיקומים בגוגל','19. כניסות ולידים','20. האתר כנכס שיווקי'
];

// Full checks dataset – filter selects WHAT to show, table shows RESULTS only
const ALL_CHECKS = [
  { id:1, catId:3, name:'מהירות טעינה – נייד', score:61, prev:63, target:80, trend:'↓', status:'crit', channel:'SEO', asset:'greentech.co.il',
    problem:'LCP 4.2s, תמונות לא מכווצות (4.2MB)', rec:'כיווץ WebP + Lazy Load + הסרת JS חוסם', source:'⚡ PageSpeed', date:'24.6.25' },
  { id:2, catId:3, name:'מהירות טעינה – דסקטופ', score:88, prev:86, target:90, trend:'↑', status:'good', channel:'SEO', asset:'greentech.co.il',
    problem:'', rec:'תקין – לשמור מעל 85', source:'⚡ PageSpeed', date:'24.6.25' },
  { id:3, catId:18, name:'מיקום ממוצע בגוגל', score:72, prev:68, target:85, trend:'↑', status:'good', channel:'SEO', asset:'greentech.co.il',
    problem:'מיקום 12.3 בממוצע', rec:'שיפור תוכן לביטויים בעמדות 11–20', source:'🔎 Search Console', date:'24.6.25' },
  { id:4, catId:18, name:'ביטויים Top 5', score:50, prev:40, target:70, trend:'↑', status:'warn', channel:'SEO', asset:'greentech.co.il',
    problem:'5 מתוך 10 יעדים בTop5', rec:'תוכן ייעודי לביטויים 6–10', source:'🔎 Search Console', date:'24.6.25' },
  { id:5, catId:4, name:'Meta Descriptions', score:78, prev:65, target:100, trend:'↑', status:'good', channel:'SEO', asset:'greentech.co.il',
    problem:'3 עמודים חסרים', rec:'כתיבת Meta לעמודי שירות', source:'🌐 CMS', date:'24.6.25' },
  { id:6, catId:4, name:'Schema Markup', score:62, prev:55, target:90, trend:'↑', status:'warn', channel:'SEO', asset:'greentech.co.il',
    problem:'12 עמודים ללא Schema', rec:'הוספת Schema.org לכל עמוד שירות', source:'🌐 CMS', date:'24.6.25' },
  { id:7, catId:19, name:'כניסות אורגניות', score:84, prev:75, target:90, trend:'↑', status:'good', channel:'SEO', asset:'greentech.co.il',
    problem:'', rec:'להמשיך אסטרטגיית תוכן', source:'📊 GA4', date:'24.6.25' },
  { id:8, catId:19, name:'לידים מהאתר', score:76, prev:70, target:85, trend:'↑', status:'good', channel:'SEO', asset:'greentech.co.il',
    problem:'', rec:'שיפור CTA בדף הבית', source:'📊 GA4', date:'24.6.25' },
  { id:9, catId:6, name:'Mobile UX', score:72, prev:72, target:85, trend:'→', status:'warn', channel:'SEO', asset:'greentech.co.il',
    problem:'3 עמודים לא מותאמים', rec:'תיקון Responsive ב-3 עמודים', source:'⚡ PageSpeed', date:'24.6.25' },
  { id:10, catId:1, name:'איכות תוכן', score:60, prev:58, target:80, trend:'↑', status:'warn', channel:'SEO', asset:'greentech.co.il',
    problem:'תוכן דל ב-7 עמודים', rec:'שדרוג תוכן + CTA', source:'🌐 CMS', date:'24.6.25' },
  { id:11, catId:2, name:'כיסוי מילות מפתח', score:85, prev:73, target:90, trend:'↑', status:'good', channel:'SEO', asset:'greentech.co.il',
    problem:'18 ביטויים לא מכוסים', rec:'מאמרים ממוקדים', source:'🔎 Search Console', date:'24.6.25' },
  { id:12, catId:12, name:'Google Ads – ביצועים', score:null, prev:null, target:80, trend:'—', status:'wait', channel:'Google Ads', asset:'Google Ads',
    problem:'', rec:'ממתין לחיבור API', source:'📢 Google Ads', date:'24.6.25' },
  { id:13, catId:12, name:'Google Business – כרטיס', score:null, prev:null, target:80, trend:'—', status:'wait', channel:'Google Business', asset:'Google Business',
    problem:'', rec:'ממתין לחיבור (Token פג)', source:'📍 Google Business', date:'24.6.25' },
];

function scoreDisplay(s) {
  if (s===null) return { dot:'⏳', color:'var(--white50)', label:'—' };
  if (s>=90) return { dot:'🟢', color:'var(--green)', label:String(s) };
  if (s>=70) return { dot:'🟡', color:'var(--yellow)', label:String(s) };
  if (s>=50) return { dot:'🟠', color:'#f97316', label:String(s) };
  return       { dot:'🔴', color:'var(--red)', label:String(s) };
}
function trendCol(t){ return t==='↑'?'var(--green)':t==='↓'?'var(--red)':'var(--white30)'; }
function statusBadge(st){
  const m={ok:'badge-green',good:'badge-yellow',warn:'badge badge-yellow',crit:'badge-red',wait:'badge-gray'};
  const l={ok:'מצוין',good:'טוב',warn:'שיפור',crit:'קריטי',wait:'ממתין'};
  return `<span class="badge ${m[st]||'badge-gray'}" style="font-size:10px;">${l[st]||st}</span>`;
}

function renderChecksTable(data) {
  const tbody = document.getElementById('checks-tbody');
  if (!tbody) return;
  tbody.innerHTML = data.length === 0
    ? `<tr><td colspan="12" style="text-align:center;color:var(--white50);padding:20px;">אין תוצאות לסינון שנבחר</td></tr>`
    : data.map((r,i) => {
        const s = scoreDisplay(r.score);
        const prev = r.prev!==null ? `<span style="font-size:13px;color:var(--white50);">${r.prev}</span>` : '—';
        const tgt  = `<span style="font-size:12px;color:var(--accent2);">${r.target}</span>`;
        return `<tr>
          <td style="color:var(--white50);font-size:11px;">${i+1}</td>
          <td style="font-size:12px;font-weight:600;">${r.name}</td>
          <td style="text-align:center;"><span style="font-size:15px;font-weight:800;color:${s.color};">${s.dot} ${s.label}</span></td>
          <td style="text-align:center;">${prev}</td>
          <td style="text-align:center;">${tgt}</td>
          <td style="text-align:center;font-size:15px;color:${trendCol(r.trend)};">${r.trend}</td>
          <td>${statusBadge(r.status)}</td>
          <td style="font-size:11px;color:${r.problem?'var(--red)':'var(--white50)'};">${r.problem||'—'}</td>
          <td style="font-size:11px;color:var(--white80);">${r.rec}</td>
          <td style="font-size:11px;color:var(--white50);white-space:nowrap;">${r.source}</td>
          <td style="font-size:11px;color:var(--white50);white-space:nowrap;">${r.date}</td>
          <td>${r.status!=='wait'?`<button class="btn btn-ghost" style="font-size:10px;padding:2px 7px;" onclick="sendRowToGoals(${r.id})">🎯</button>`:'—'}</td>
        </tr>`;
    }).join('');

  updateOverallScore(data);
}

function updateOverallScore(data) {
  const scored = data.filter(r => r.score !== null);
  const avg = scored.length ? Math.round(scored.reduce((a,r)=>a+r.score,0)/scored.length) : null;
  const el = document.getElementById('ct-overall-score');
  const lbl = document.getElementById('ct-score-label');
  if (!el) return;
  if (avg===null) { el.textContent='—'; el.style.color='var(--white50)'; if(lbl) lbl.textContent='ממתין'; return; }
  el.textContent = avg;
  el.style.color = avg>=90?'var(--green)':avg>=70?'var(--yellow)':avg>=50?'#f97316':'var(--red)';
  if (lbl) lbl.textContent = avg>=90?'מצוין':avg>=70?'טוב':avg>=50?'דורש שיפור':'קריטי';
}

function applyChecksFilter() {
  const catId   = parseInt(document.getElementById('ct-cat')?.value||'0')||0;
  const channel  = document.getElementById('ct-channel')?.value||'';
  const asset    = document.getElementById('ct-asset')?.value||'';
  const filtered = ALL_CHECKS.filter(r => {
    const catOk     = !catId   || r.catId === catId;
    const channelOk = !channel || r.channel === channel;
    const assetOk   = !asset   || r.asset === asset;
    return catOk && channelOk && assetOk;
  });
  renderChecksTable(filtered);
  updateSummaryText();
}

function updateSummaryText() {
  const catEl  = document.getElementById('ct-cat');
  const chEl   = document.getElementById('ct-channel');
  const asEl   = document.getElementById('ct-asset');
  const perEl  = document.getElementById('ct-period');
  const txt    = document.getElementById('ct-summary-text');
  if (!txt||!catEl) return;
  const cat  = catEl.value  ? catEl.options[catEl.selectedIndex].text  : 'כל הקטגוריות';
  const ch   = chEl.value   ? chEl.options[chEl.selectedIndex].text    : 'כל הערוצים';
  const as   = asEl.value   ? asEl.options[asEl.selectedIndex].text    : 'כל הנכסים';
  const per  = perEl.value  ? perEl.options[perEl.selectedIndex].text  : '30 ימים';
  txt.innerHTML = `נבדק: <strong>${cat}</strong> לפי ערוץ <strong>${ch}</strong> | נכס <strong>${as}</strong> | תקופה <strong>${per}</strong>`;
}

function resetChecksFilter() {
  ['ct-cat','ct-channel','ct-asset','ct-campaign'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  const p=document.getElementById('ct-period'); if(p) p.value='30';
  applyChecksFilter();
}

function refreshChecks() {
  showToast('🔄 מרענן בדיקות לפי הסינון הנוכחי...');
  setTimeout(()=>{ applyChecksFilter(); showToast('✅ הבדיקות עודכנו'); }, 1800);
}

function runChecks() {
  showToast('▶️ מפעיל עוזרים...');
  setTimeout(()=>showToast('⏳ עוזרים אוספים נתונים...'),1500);
  setTimeout(()=>{ applyChecksFilter(); showToast('✅ הסריקה הושלמה'); },3500);
}

function exportToGoals() {
  const catEl = document.getElementById('ct-cat');
  const catId = parseInt(catEl?.value||'0')||0;
  const data  = catId ? ALL_CHECKS.filter(r=>r.catId===catId&&r.score!==null) : ALL_CHECKS.filter(r=>r.score!==null);
  // Update transfer status badge
  const st = document.getElementById('ct-transfer-status');
  if (st) st.innerHTML = `<span class="badge badge-green" style="font-size:11px;">✓ הועבר למטרות (${data.length} ציונים)</span>`;
  goScreen('screen-goals');
  showToast('🎯 ' + data.length + ' ציונים הועברו למטרות');
}

function sendRowToGoals(id) {
  const r = ALL_CHECKS.find(x=>x.id===id);
  if (!r) return;
  showToast('🎯 "' + r.name + '" הועבר למטרות');
}

// Init on load
(function(){ try { renderChecksTable(ALL_CHECKS); updateSummaryText(); } catch(e){} })();
// ===== END CHECKS TABLE =====

// ===== AGENT DASHBOARD DATA =====
function _platformAgentStub(name, icon, source) {
  return {
    name: name, icon: icon, source: source,
    status: 'ready', scanTime: 'תשתית מחוברת',
    findings: 0, issues: 0, opportunities: 0, score: 0,
    urgency: 'בינונית', readyToTransfer: false,
    kpis: [{ label: 'חיבור', val: 'תשתית', delta: 'Staging', color: 'var(--accent2)' }],
    findings_table: [],
    aiSummary: name + ' – תשתית מחוברת למערכת ניהול השיווק. חיבור API מלא בשלב הבא.',
    readyCount: 0, readyIssues: 0, readyOpp: 0, urgencyLabel: 'בינונית',
  };
}

const AGENT_DATA = {
  gsc: {
    name: 'Google Search Console AI', icon: '🔎',
    source: 'Google Search Console',
    status: 'done', scanTime: 'לפני 2 שעות',
    findings: 18, issues: 5, opportunities: 13, score: 79,
    urgency: 'גבוהה', readyToTransfer: true,
    kpis: [
      {label:'קליקים (30י׳)', val:'8,420', delta:'↑ +14%', color:'var(--green)'},
      {label:'חשיפות', val:'184,000', delta:'↑ +8%', color:'var(--white)'},
      {label:'CTR', val:'4.6%', delta:'↑ +0.4%', color:'var(--green)'},
      {label:'מיקום ממוצע', val:'12.3', delta:'שיפור מ-14.1', color:'var(--accent2)'},
      {label:'מילות מפתח', val:'342', delta:'↑ +28', color:'var(--white)'},
      {label:'עמוד 1', val:'47', delta:'↑ +6', color:'var(--green)'},
      {label:'שגיאות אינדוקס', val:'5', delta:'↑ +2 (חדש)', color:'var(--red)'},
      {label:'Core Web Vitals', val:'⚠️', delta:'LCP בעיה', color:'var(--yellow)'}
    ],
    findings_table: [
      {type:'בעיה', desc:'5 URLs עם שגיאת 404', src:'Crawl', importance:'קריטי', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'בעיה', desc:'3 עמודי שירות ללא Meta Description', src:'SEO', importance:'גבוה', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'הזדמנות', desc:'18 ביטויים לא מכוסים – נפח >200/חודש', src:'Keywords', importance:'גבוה', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'בעיה', desc:'דף "ביטוח צי" ירד 3 מקומות', src:'Rankings', importance:'בינוני', impact:'בינוני', status:'פתוח', transfer:true},
      {type:'אזהרה', desc:'Sitemap לא מעודכן מ-15.5.25', src:'Sitemap', importance:'בינוני', impact:'נמוך', status:'פתוח', transfer:false},
      {type:'הזדמנות', desc:'CTR עלה – ניתן להמשיך לשפר כותרות', src:'CTR', importance:'נמוך', impact:'בינוני', status:'מטופל', transfer:false}
    ],
    aiSummary: 'בעיה מרכזית: 5 שגיאות 404 פוגעות בסריקה. הזדמנות עיקרית: 18 ביטויים עם נפח גבוה לא מכוסים – פוטנציאל ל-+2,000 קליקים/חודש. מה חסר: נתוני CWV מלאים עדיין בסריקה.',
    readyCount: 4, readyIssues: 3, readyOpp: 1, urgencyLabel: 'גבוהה'
  },
  ga4: {
    name: 'Google Analytics GA4 AI', icon: '📊',
    source: 'Google Analytics 4',
    status: 'done', scanTime: 'לפני 3 שעות',
    findings: 12, issues: 2, opportunities: 10, score: 84,
    urgency: 'בינונית', readyToTransfer: true,
    kpis: [
      {label:'כניסות (30י׳)', val:'14,320', delta:'↑ +12%', color:'var(--green)'},
      {label:'משתמשים חדשים', val:'9,840', delta:'↑ +9%', color:'var(--white)'},
      {label:'משתמשים חוזרים', val:'4,480', delta:'↑ +4%', color:'var(--white)'},
      {label:'Bounce Rate', val:'38.2%', delta:'↓ ירד (טוב)', color:'var(--green)'},
      {label:'זמן שהייה', val:'2:48', delta:'↑ +18 שניות', color:'var(--green)'},
      {label:'המרות', val:'47', delta:'↑ +8', color:'var(--accent2)'},
      {label:'עמוד חזק', val:'שירותים', delta:'32% מהכניסות', color:'var(--white)'},
      {label:'מקור תנועה #1', val:'Organic', delta:'58% מהתנועה', color:'var(--accent2)'}
    ],
    findings_table: [
      {type:'הזדמנות', desc:'עמוד "שירותים" – 32% מהכניסות, Bounce Rate 22%', src:'Pages', importance:'גבוה', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'בעיה', desc:'עמוד "צור קשר" – Bounce Rate 74%', src:'Pages', importance:'בינוני', impact:'בינוני', status:'פתוח', transfer:true},
      {type:'הזדמנות', desc:'תנועה ממובייל – 61% מהמשתמשים', src:'Device', importance:'גבוה', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'אזהרה', desc:'Direct traffic עלה 18% – לא מוסבר', src:'Sources', importance:'נמוך', impact:'נמוך', status:'בבדיקה', transfer:false}
    ],
    aiSummary: 'מגמה חיובית כוללת. בעיה: עמוד "צור קשר" עם Bounce Rate 74% – בזבוז תנועה. הזדמנות: 61% מובייל – PageSpeed נייד גרוע פוגע בהמרות ישירות.',
    readyCount: 3, readyIssues: 1, readyOpp: 2, urgencyLabel: 'בינונית'
  },
  pagespeed: {
    name: 'PageSpeed + Lighthouse AI', icon: '⚡',
    source: 'Google PageSpeed Insights',
    status: 'done', scanTime: 'לפני 2 שעות',
    findings: 9, issues: 4, opportunities: 5, score: 61,
    urgency: 'קריטית', readyToTransfer: true,
    kpis: [
      {label:'Performance נייד', val:'61', delta:'יעד: >80', color:'var(--red)'},
      {label:'Performance דסקטופ', val:'88', delta:'טוב', color:'var(--green)'},
      {label:'Accessibility', val:'92', delta:'מצוין', color:'var(--green)'},
      {label:'SEO Score', val:'84', delta:'טוב', color:'var(--accent2)'},
      {label:'Best Practices', val:'79', delta:'בינוני', color:'var(--yellow)'},
      {label:'LCP נייד', val:'4.2s', delta:'יעד <2.5s', color:'var(--red)'},
      {label:'CLS', val:'0.08', delta:'טוב (<0.1)', color:'var(--green)'},
      {label:'FID/INP', val:'280ms', delta:'יעד <200ms', color:'var(--yellow)'}
    ],
    findings_table: [
      {type:'בעיה קריטית', desc:'8 תמונות לא מכווצות – סה"כ 4.2MB', src:'Images', importance:'קריטי', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'בעיה קריטית', desc:'Render-blocking JavaScript – 3 סקריפטים', src:'JS', importance:'קריטי', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'בעיה', desc:'חסר Lazy Loading לתמונות', src:'Images', importance:'גבוה', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'בעיה', desc:'חסר Browser Caching', src:'Caching', importance:'בינוני', impact:'בינוני', status:'פתוח', transfer:true},
      {type:'הזדמנות', desc:'מעבר לפורמט WebP יחסוך 1.8MB', src:'Images', importance:'גבוה', impact:'גבוה', status:'פתוח', transfer:true}
    ],
    aiSummary: 'בעיה קריטית: PageSpeed נייד 61 – מתחת לסף Google. פוגע ישירות ב-Rankings ובהמרות. תיקון: כיווץ תמונות + Lazy Load + הסרת JS חוסם. צפי שיפור: +21 נקודות.',
    readyCount: 5, readyIssues: 4, readyOpp: 1, urgencyLabel: 'קריטית'
  },
  project001: {
    name: 'Project 001 AI', icon: '🚀',
    source: 'Internal – Daily Report',
    status: 'done', scanTime: 'היום 07:00',
    findings: 21, issues: 6, opportunities: 15, score: 74,
    urgency: 'גבוהה', readyToTransfer: true,
    kpis: [
      {label:'ציון SEO כולל', val:'79', delta:'↑ +4', color:'var(--green)'},
      {label:'ציון תוכן', val:'76', delta:'↑ +2', color:'var(--accent2)'},
      {label:'ציון מתחרים', val:'68', delta:'↓ -3', color:'var(--red)'},
      {label:'משימות מוצעות', val:'8', delta:'מוכנות לאישור', color:'var(--yellow)'},
      {label:'מאמרים לכתיבה', val:'3', delta:'נושאים מוכנים', color:'var(--white)'},
      {label:'עמודים לשדרוג', val:'7', delta:'דורשים תשומת לב', color:'var(--yellow)'},
      {label:'בעיות קריטיות', val:'2', delta:'PageSpeed + מתחרה', color:'var(--red)'},
      {label:'הזדמנויות TOP', val:'18 ביטויים', delta:'לא מכוסים', color:'var(--accent2)'}
    ],
    findings_table: [
      {type:'סדר עדיפויות', desc:'PageSpeed נייד – תיקון דחוף', src:'Technical', importance:'קריטי', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'הזדמנות', desc:'18 ביטויים לא מכוסים – מאמרים חדשים', src:'Keywords', importance:'גבוה', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'תוכן', desc:'3 מאמרים חדשים: GPS לצי, ביטוח, תחזוקה', src:'Content', importance:'גבוה', impact:'בינוני', status:'פתוח', transfer:true},
      {type:'מתחרים', desc:'מתחרה א׳ עלה על "ניהול צי" – תגובה נדרשת', src:'Competitors', importance:'גבוה', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'הזדמנות', desc:'Internal Links – 12 עמודים ללא קישורים', src:'SEO', importance:'בינוני', impact:'בינוני', status:'פתוח', transfer:true}
    ],
    aiSummary: 'דוח יומי מלא מוכן. סדר עדיפויות: 1) PageSpeed נייד (קריטי) 2) מענה למתחרה שעלה 3) כתיבת 3 מאמרים. 8 משימות ממתינות לאישורך.',
    readyCount: 8, readyIssues: 4, readyOpp: 4, urgencyLabel: 'גבוהה'
  },
  cms: {
    name: 'CMS / Website AI', icon: '🌐',
    source: 'WordPress / CMS',
    status: 'done', scanTime: 'לפני 2 שעות',
    findings: 10, issues: 3, opportunities: 7, score: 76,
    urgency: 'בינונית', readyToTransfer: true,
    kpis: [
      {label:'סה"כ עמודים', val:'48', delta:'', color:'var(--white)'},
      {label:'עמודים חזקים', val:'34', delta:'71%', color:'var(--green)'},
      {label:'עמודים חלשים', val:'7', delta:'15%', color:'var(--red)'},
      {label:'ללא תוכן', val:'3', delta:'דפים ריקים', color:'var(--yellow)'},
      {label:'תמונות ללא Alt', val:'8', delta:'דורשות תיקון', color:'var(--yellow)'},
      {label:'Schema חסר', val:'12', delta:'עמודים', color:'var(--red)'},
      {label:'Meta Title חסר', val:'0', delta:'✓ מושלם', color:'var(--green)'},
      {label:'Meta Desc חסר', val:'3', delta:'עמודי שירות', color:'var(--red)'}
    ],
    findings_table: [
      {type:'בעיה', desc:'3 עמודי שירות ללא Meta Description', src:'SEO', importance:'גבוה', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'בעיה', desc:'8 תמונות ללא Alt Text', src:'Accessibility', importance:'בינוני', impact:'בינוני', status:'פתוח', transfer:true},
      {type:'בעיה', desc:'12 עמודים ללא Schema Markup', src:'Structured Data', importance:'גבוה', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'הזדמנות', desc:'7 עמודים חלשים – שדרוג תוכן', src:'Content', importance:'בינוני', impact:'בינוני', status:'פתוח', transfer:true}
    ],
    aiSummary: 'מצב אתר טוב בסך הכל. 3 עמודים ללא Meta Description – תיקון קל. Schema חסר ב-12 עמודים – השפעה גדולה על Rich Results.',
    readyCount: 4, readyIssues: 3, readyOpp: 1, urgencyLabel: 'בינונית'
  },
  seotools: {
    name: 'SEO Tools AI', icon: '🔑',
    source: 'Keyword / Backlink Tools',
    status: 'done', scanTime: 'לפני 2 שעות',
    findings: 14, issues: 4, opportunities: 10, score: 74,
    urgency: 'גבוהה', readyToTransfer: true,
    kpis: [
      {label:'מילות מפתח', val:'186', delta:'↑ +12', color:'var(--white)'},
      {label:'Top 10', val:'42', delta:'23%', color:'var(--green)'},
      {label:'פערי מילים', val:'18', delta:'הזדמנות', color:'var(--accent2)'},
      {label:'Backlinks חדשים', val:'7', delta:'החודש', color:'var(--green)'},
      {label:'Domain Rating', val:'38', delta:'↑ +1', color:'var(--white)'},
      {label:'מתחרים עוקבים', val:'5', delta:'פעילים', color:'var(--yellow)'},
      {label:'Cannibalization', val:'3', delta:'עמודים', color:'var(--red)'},
      {label:'Content Gap', val:'11', delta:'נושאים', color:'var(--accent2)'}
    ],
    findings_table: [
      {type:'הזדמנות', desc:'18 ביטויים לא מכוסים – פוטנציאל +2,000 קליקים', src:'Keywords', importance:'גבוה', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'בעיה', desc:'3 עמודים עם Cannibalization על "ניהול צי"', src:'Keywords', importance:'גבוה', impact:'בינוני', status:'פתוח', transfer:true},
      {type:'הזדמנות', desc:'11 נושאי Content Gap מול מתחרים', src:'Competitors', importance:'בינוני', impact:'גבוה', status:'פתוח', transfer:true}
    ],
    aiSummary: 'מחקר מילות מפתח: 18 הזדמנויות לא מכוסות. Cannibalization ב-3 עמודים – לאחד כוונת חיפוש. Content Gap: 11 נושאים עם ROI גבוה.',
    readyCount: 5, readyIssues: 2, readyOpp: 3, urgencyLabel: 'גבוהה'
  },
  gbp: {
    name: 'Google Business Profile AI', icon: '📍',
    source: 'Google Business Profile',
    status: 'running', scanTime: 'עכשיו (65%)',
    findings: 6, issues: 1, opportunities: 5, score: 78,
    urgency: 'נמוכה', readyToTransfer: false,
    kpis: [
      {label:'דירוג', val:'4.7⭐', delta:'84 ביקורות', color:'var(--green)'},
      {label:'ביקורות לא נענו', val:'2', delta:'דורשות מענה', color:'var(--yellow)'},
      {label:'פוסטים פעילים', val:'3', delta:'עדכני', color:'var(--green)'},
      {label:'תמונות', val:'24', delta:'↑ +2 החודש', color:'var(--white)'},
      {label:'צפיות בכרטיס', val:'1,240', delta:'↑ +8%', color:'var(--accent2)'},
      {label:'לחיצות לאתר', val:'384', delta:'↑ +12%', color:'var(--green)'},
      {label:'שאלות פתוחות', val:'0', delta:'✓ מטופל', color:'var(--green)'},
      {label:'ציון שלמות', val:'78%', delta:'יעד 90%', color:'var(--yellow)'}
    ],
    findings_table: [
      {type:'הזדמנות', desc:'2 ביקורות ללא מענה', src:'Reviews', importance:'בינוני', impact:'בינוני', status:'פתוח', transfer:false},
      {type:'הזדמנות', desc:'תיאור עסק לא מעודכן – 2022', src:'Profile', importance:'בינוני', impact:'בינוני', status:'פתוח', transfer:false},
      {type:'הזדמנות', desc:'פוסט חדש מומלץ – מבצע קיץ', src:'Posts', importance:'נמוך', impact:'נמוך', status:'פתוח', transfer:false}
    ],
    aiSummary: 'בסריקה. ממצאים ראשוניים: כרטיס במצב טוב. 2 ביקורות ללא מענה. תיאור עסק ישן. פוסט חודשי חסר ליוני.',
    readyCount: 0, readyIssues: 0, readyOpp: 0, urgencyLabel: 'נמוכה'
  },
  ads: {
    name: 'Google Ads AI', icon: '📢',
    source: 'Google Ads',
    status: 'done', scanTime: 'לפני 3 שעות',
    findings: 8, issues: 2, opportunities: 6, score: 72,
    urgency: 'בינונית', readyToTransfer: true,
    kpis: [
      {label:'הוצאה חודשית', val:'₪8,400', delta:'מתוך ₪10,000', color:'var(--white)'},
      {label:'ROAS', val:'3.2x', delta:'↑ +0.4', color:'var(--green)'},
      {label:'המרות', val:'28', delta:'↑ +5', color:'var(--accent2)'},
      {label:'CPC ממוצע', val:'₪4.80', delta:'↑ +0.30', color:'var(--yellow)'},
      {label:'CTR קמפיינים', val:'5.2%', delta:'↑ +0.6%', color:'var(--green)'},
      {label:'Quality Score', val:'7.4', delta:'בינוני', color:'var(--yellow)'},
      {label:'קמפיין לא יעיל', val:'Competitor', delta:'0 המרות', color:'var(--red)'},
      {label:'תקציב נותר', val:'₪1,600', delta:'6 ימים', color:'var(--white)'}
    ],
    findings_table: [
      {type:'בעיה', desc:'קמפיין Competitor – ₪800 הוצאה, 0 המרות', src:'Campaigns', importance:'גבוה', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'הזדמנות', desc:'Brand Search – ROAS 4.8x – הגדלת תקציב מומלצת', src:'Campaigns', importance:'גבוה', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'הזדמנות', desc:'Quality Score 7.4 – שיפור Landing Pages', src:'Quality', importance:'בינוני', impact:'בינוני', status:'פתוח', transfer:true},
      {type:'אזהרה', desc:'CPC עלה ₪0.30 – מגמה לעקוב', src:'CPC', importance:'נמוך', impact:'נמוך', status:'בעקיבה', transfer:false}
    ],
    aiSummary: 'ROAS טוב (3.2x). בעיה: קמפיין Competitor ₪800 ללא המרות – מומלץ להשהות. הזדמנות: הגדלת תקציב Brand Search שמציג ROAS 4.8x.',
    readyCount: 3, readyIssues: 1, readyOpp: 2, urgencyLabel: 'בינונית'
  },
  meta: {
    name: 'Meta / Facebook / Instagram AI', icon: '📘',
    source: 'Meta Business Suite',
    status: 'done', scanTime: 'לפני 2 שעות',
    findings: 11, issues: 2, opportunities: 9, score: 71,
    urgency: 'בינונית', readyToTransfer: true,
    kpis: [
      {label:'עוקבים FB', val:'3,240', delta:'↑ +48', color:'var(--white)'},
      {label:'עוקבים IG', val:'1,820', delta:'↑ +120', color:'var(--green)'},
      {label:'אינטראקציה IG', val:'6.1%', delta:'מצוין', color:'var(--green)'},
      {label:'אינטראקציה FB', val:'4.2%', delta:'ממוצע', color:'var(--accent2)'},
      {label:'לידים Meta Ads', val:'8', delta:'↑ +3', color:'var(--accent2)'},
      {label:'חשיפה אורגנית', val:'12,400', delta:'↑ +18%', color:'var(--green)'},
      {label:'Reach FB', val:'8,600', delta:'↑ +5%', color:'var(--white)'},
      {label:'Stories IG', val:'3 פעילות', delta:'', color:'var(--white)'}
    ],
    findings_table: [
      {type:'הזדמנות', desc:'Instagram – אינטראקציה 6.1%, להגדיל תדירות', src:'IG', importance:'גבוה', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'הזדמנות', desc:'LinkedIn – ירד ל-3.8% – נדרש תוכן מקצועי', src:'LinkedIn', importance:'בינוני', impact:'בינוני', status:'פתוח', transfer:true},
      {type:'בעיה', desc:'TikTok – לא מחובר, קהל יעד פעיל שם', src:'TikTok', importance:'בינוני', impact:'גבוה', status:'פתוח', transfer:true}
    ],
    aiSummary: 'Instagram מצוין. הזדמנות: הגדלת תדירות פוסטים. TikTok לא מחובר – קהל הלקוחות פעיל בפלטפורמה. LinkedIn דורש תוכן B2B.',
    readyCount: 3, readyIssues: 1, readyOpp: 2, urgencyLabel: 'בינונית'
  },
  cursor: {
    name: 'Cursor AI', icon: '🖥️',
    source: 'Cursor / Dev Tools',
    status: 'done', scanTime: 'לפני 2 שעות',
    findings: 14, issues: 3, opportunities: 11, score: 80,
    urgency: 'בינונית', readyToTransfer: true,
    kpis: [
      {label:'בדיקות טכניות', val:'14', delta:'', color:'var(--white)'},
      {label:'שגיאות קוד', val:'2', delta:'נמוך', color:'var(--yellow)'},
      {label:'APIs תקינים', val:'7/8', delta:'1 לא מגיב', color:'var(--yellow)'},
      {label:'שיפורי SEO טכני', val:'5', delta:'מוצעים', color:'var(--accent2)'},
      {label:'QA ביצועים', val:'✓', delta:'עבר', color:'var(--green)'},
      {label:'פרסומים ממתינים', val:'3', delta:'לאישור', color:'var(--yellow)'},
      {label:'תיקוני Accessibility', val:'4', delta:'נדרשים', color:'var(--yellow)'},
      {label:'Redirects שגויים', val:'1', delta:'Loop זוהה', color:'var(--red)'}
    ],
    findings_table: [
      {type:'בעיה', desc:'Redirect Loop – עמוד /about-us', src:'Technical', importance:'גבוה', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'בעיה', desc:'API צד שלישי לא מגיב – Widget שיתוף', src:'APIs', importance:'בינוני', impact:'נמוך', status:'פתוח', transfer:true},
      {type:'הזדמנות', desc:'5 שיפורי SEO טכני (Schema, Hreflang, Canonical)', src:'SEO', importance:'גבוה', impact:'גבוה', status:'פתוח', transfer:true}
    ],
    aiSummary: 'מצב טכני טוב. Redirect Loop בעמוד about-us – תיקון קל. API שיתוף לא מגיב – לא קריטי. 5 שיפורי SEO טכניים מוכנים לביצוע.',
    readyCount: 3, readyIssues: 2, readyOpp: 1, urgencyLabel: 'בינונית'
  },
  chatgpt: _platformAgentStub('ChatGPT AI', '💬', 'OpenAI ChatGPT'),
  claude: _platformAgentStub('Claude AI', '🟣', 'Anthropic Claude'),
  gemini: _platformAgentStub('Gemini AI', '✨', 'Google Gemini'),
  youtube: _platformAgentStub('YouTube AI', '▶️', 'YouTube'),
  tiktok: _platformAgentStub('TikTok AI', '🎵', 'TikTok'),
  linkedin: _platformAgentStub('LinkedIn AI', '💼', 'LinkedIn'),
  xtwitter: _platformAgentStub('X AI', '𝕏', 'X (Twitter)'),
  pinterest: _platformAgentStub('Pinterest AI', '📌', 'Pinterest'),
  whatsapp: _platformAgentStub('WhatsApp Business AI', '💬', 'WhatsApp Business'),
  manager: {
    name: 'AI Marketing Manager – Project 001', icon: '🧠',
    source: 'Internal – All Agents',
    status: 'done', scanTime: 'לפני 1 שעה',
    findings: 84, issues: 22, opportunities: 62, score: 76,
    urgency: 'גבוהה', readyToTransfer: true,
    kpis: [
      {label:'ממצאים מאוחדים', val:'84', delta:'מ-10 עוזרים', color:'var(--white)'},
      {label:'פערים מזוהים', val:'12', delta:'קריטי: 3', color:'var(--red)'},
      {label:'המלצות מוכנות', val:'23', delta:'לאישורך', color:'var(--green)'},
      {label:'בעיות קריטיות', val:'3', delta:'PageSpeed, GSC, Ads', color:'var(--red)'},
      {label:'הזדמנויות TOP', val:'8', delta:'ROI גבוה', color:'var(--accent2)'},
      {label:'זמן תיקון משוער', val:'~18 שעות', delta:'סה"כ', color:'var(--white)'},
      {label:'תוכנית עבודה', val:'✓ מוכנה', delta:'8 משימות', color:'var(--green)'},
      {label:'מוכן להעברה', val:'✓ כן', delta:'למטרות', color:'var(--green)'}
    ],
    findings_table: [
      {type:'קריטי', desc:'PageSpeed נייד 61 – פוגע ב-Rankings ובהמרות', src:'PageSpeed AI', importance:'קריטי', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'גבוה', desc:'18 ביטויים לא מכוסים – +2,000 קליקים פוטנציאל', src:'GSC + SEO AI', importance:'גבוה', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'גבוה', desc:'קמפיין Competitor – ₪800 ללא תוצאות', src:'Ads AI', importance:'גבוה', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'גבוה', desc:'3 Meta Descriptions חסרים', src:'CMS AI', importance:'גבוה', impact:'בינוני', status:'פתוח', transfer:true},
      {type:'בינוני', desc:'TikTok לא מחובר – קהל יעד פעיל', src:'Meta AI', importance:'בינוני', impact:'גבוה', status:'פתוח', transfer:true},
      {type:'בינוני', desc:'Redirect Loop + API לא מגיב', src:'Cursor AI', importance:'בינוני', impact:'בינוני', status:'פתוח', transfer:true}
    ],
    aiSummary: 'תוכנית עבודה מוכנה. 3 קריטיות: PageSpeed, מילות מפתח חסרות, קמפיין Competitor. 23 המלצות מחכות לאישורך ב"מטרות שלנו". עדיפות: PageSpeed קודם.',
    readyCount: 23, readyIssues: 12, readyOpp: 11, urgencyLabel: 'גבוהה'
  }
};

function openAgentDashboard(agentId) {
  const a = AGENT_DATA[agentId];
  if (!a) { showToast('⏳ דשבורד בפיתוח'); return; }

  document.getElementById('agent-dash-breadcrumb').textContent = a.name;

  // Build standard filter bar HTML
  const filterHTML = `
    <div style="background:var(--bg2);border-bottom:1px solid var(--border);padding:12px 16px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px;">
        <select class="filter-select" title="חברה"><option>גרין-טק</option></select>
        <select class="filter-select" title="פרויקט"><option>Project 001</option><option>כל הפרויקטים</option></select>
        <select class="filter-select" title="אתר"><option>greentech.co.il</option><option>כל האתרים</option></select>
        <input class="filter-input" placeholder="דומיין..." style="max-width:140px;" value="greentech.co.il">
        <select class="filter-select" title="טווח תאריכים">
          <option>7 ימים</option><option selected>30 ימים</option><option>60 ימים</option><option>90 ימים</option>
        </select>
        <select class="filter-select" title="סטטוס">
          <option value="">כל הסטטוסים</option><option>פתוח</option><option>מטופל</option><option>נסגר</option>
        </select>
        <select class="filter-select" title="רמת חשיבות">
          <option value="">כל הרמות</option><option>קריטי</option><option>גבוה</option><option>בינוני</option><option>נמוך</option>
        </select>
        <select class="filter-select" title="סוג מידע">
          <option value="">כל הסוגים</option><option>בעיה</option><option>הזדמנות</option><option>אזהרה</option><option>מידע</option>
        </select>
        <input class="filter-input" placeholder="🔍 חיפוש חופשי..." style="flex:1;min-width:140px;">
        <button onclick="showToast('🔍 סינון מתקדם – בפיתוח')"
          style="padding:6px 14px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--white80);font-family:'Heebo',sans-serif;font-size:13px;cursor:pointer;white-space:nowrap;flex-shrink:0;">
          🔍 סינון מתקדם ▼
        </button>
        <button onclick="showToast('✓ סינון אופס')"
          style="padding:6px 12px;border-radius:8px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:var(--red);font-family:'Heebo',sans-serif;font-size:12px;cursor:pointer;flex-shrink:0;">
          ✕ נקה
        </button>
      </div>
      <div style="font-size:11px;color:var(--white50);">
        💡 מסנני עומק לעוזר זה יתווספו בשלב הבא: ${getAgentFilterHint(agentId)}
      </div>
    </div>`;

  // Build KPI cards
  const kpiHTML = a.kpis.map(k => `
    <div class="card" style="padding:12px 14px;">
      <div class="card-title">${k.label}</div>
      <div style="font-size:18px;font-weight:800;color:${k.color};margin:4px 0;">${k.val}</div>
      <div style="font-size:11px;color:var(--white50);">${k.delta}</div>
    </div>`).join('');

  // Build findings table
  const rowsHTML = a.findings_table.map(f => `
    <tr>
      <td><span class="badge ${f.importance==='קריטי'?'badge-red':f.importance==='גבוה'?'badge-yellow':'badge-gray'}">${f.type}</span></td>
      <td style="max-width:200px;">${f.desc}</td>
      <td style="color:var(--white50);">${f.src}</td>
      <td><span class="badge ${f.importance==='קריטי'?'badge-red':f.importance==='גבוה'?'badge-yellow':f.importance==='בינוני'?'badge-blue':'badge-gray'}">${f.importance}</span></td>
      <td style="color:var(--white50);">${f.impact}</td>
      <td><span class="badge ${f.status==='פתוח'?'badge-yellow':f.status==='מטופל'?'badge-green':'badge-gray'}">${f.status}</span></td>
      <td>${f.transfer ? '<span style="color:var(--green);font-weight:700;">✓ כן</span>' : '<span style="color:var(--white50);">—</span>'}</td>
    </tr>`).join('');

  // Build chart mockup
  const chartBars = [45,58,52,67,61,74,68,82,76,88,80,95].map(h =>
    `<div class="chart-bar" style="height:${h}%"></div>`).join('');
  const chartLabels = ['1','3','6','9','12','15','18','21','24','27','29','30'].map(l =>
    `<div class="chart-label">${l}</div>`).join('');

  const urgencyColor = a.urgency==='קריטית' ? 'var(--red)' : a.urgency==='גבוהה' ? 'var(--yellow)' : 'var(--accent2)';

  const content = `
    <!-- Page header -->
    <div class="page-header">
      <div class="page-title">${a.icon} ${a.name}</div>
      <div class="page-subtitle">מערכת מקור: ${a.source} • סריקה: ${a.scanTime}</div>
      <hr class="page-rule">
    </div>

    ${filterHTML}

    <!-- 1. Top dashboard -->
    <div class="section">
      <div class="sec-title">דשבורד עליון</div>
      <div class="grid grid-4" style="gap:10px;margin-bottom:10px;">
        <div class="card" style="padding:12px 14px;">
          <div class="card-title">סטטוס חיבור</div>
          <div style="margin-top:4px;"><span class="badge badge-green">● מחובר</span></div>
        </div>
        <div class="card" style="padding:12px 14px;">
          <div class="card-title">נתונים שנאספו</div>
          <div style="font-size:22px;font-weight:800;">${a.findings}</div>
        </div>
        <div class="card" style="padding:12px 14px;">
          <div class="card-title">בעיות</div>
          <div style="font-size:22px;font-weight:800;color:var(--red);">${a.issues}</div>
        </div>
        <div class="card" style="padding:12px 14px;">
          <div class="card-title">הזדמנויות</div>
          <div style="font-size:22px;font-weight:800;color:var(--green);">${a.opportunities}</div>
        </div>
        <div class="card" style="padding:12px 14px;">
          <div class="card-title">ציון כללי</div>
          <div style="font-size:22px;font-weight:800;color:${a.score>=80?'var(--green)':a.score>=65?'var(--yellow)':'var(--red)'};">${a.score}</div>
        </div>
        <div class="card" style="padding:12px 14px;">
          <div class="card-title">רמת דחיפות</div>
          <div style="margin-top:4px;font-size:14px;font-weight:700;color:${urgencyColor};">${a.urgency}</div>
        </div>
        <div class="card" style="padding:12px 14px;">
          <div class="card-title">סריקה אחרונה</div>
          <div style="font-size:13px;font-weight:700;margin-top:4px;">${a.scanTime}</div>
        </div>
        <div class="card" style="padding:12px 14px;">
          <div class="card-title">מוכן למטרות</div>
          <div style="margin-top:4px;">${a.readyToTransfer ? '<span style="color:var(--green);font-size:14px;font-weight:700;">✓ כן</span>' : '<span style="color:var(--yellow);font-size:14px;font-weight:700;">⏳ ממתין</span>'}</div>
        </div>
      </div>
    </div>

    <!-- 2. Middle dashboard – KPIs -->
    <div class="section">
      <div class="sec-title">נתונים מרכזיים</div>
      <div class="grid grid-4" style="gap:10px;">${kpiHTML}</div>
    </div>

    <!-- 3. Charts -->
    <div class="section">
      <div class="sec-title">גרף מגמה – 30 יום</div>
      <div class="card">
        <div class="card-title" style="margin-bottom:10px;">מגמת ביצועים</div>
        <div class="chart-bar-wrap">${chartBars}</div>
        <div class="chart-labels">${chartLabels}</div>
        <div style="font-size:11px;color:var(--white50);margin-top:6px;">מגמה: עלייה מתמשכת</div>
      </div>
    </div>

    <!-- 4. Findings table -->
    <div class="section">
      <div class="sec-title">טבלת ממצאים</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>סוג ממצא</th><th>תיאור</th><th>מקור</th><th>חשיבות</th><th>השפעה</th><th>סטטוס</th><th>להעביר למטרות</th>
            </tr>
          </thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </div>
    </div>

    <!-- 5. AI recommendation -->
    <div class="section">
      <div class="ai-box">
        <div class="ai-box-header"><div class="ai-pulse"></div>${a.icon} המלצת ${a.name}</div>
        <div class="ai-box-text">${a.aiSummary}</div>
      </div>
    </div>

    <!-- 6. Transfer to goals -->
    <div class="section">
      <div style="background:linear-gradient(135deg,rgba(37,99,235,0.12),rgba(139,92,246,0.08));border:1px solid rgba(37,99,235,0.3);border-radius:var(--card-r);padding:18px;">
        <div style="font-size:14px;font-weight:800;color:var(--white);margin-bottom:12px;">🎯 העברה למודול "המטרות שלנו"</div>
        <div class="grid grid-4" style="gap:8px;margin-bottom:14px;">
          <div style="background:var(--bg3);border-radius:8px;padding:10px;"><div style="font-size:10px;color:var(--white50);">ממצאים מוכנים</div><div style="font-size:20px;font-weight:800;color:var(--accent2);">${a.readyCount}</div></div>
          <div style="background:var(--bg3);border-radius:8px;padding:10px;"><div style="font-size:10px;color:var(--white50);">בעיות</div><div style="font-size:20px;font-weight:800;color:var(--red);">${a.readyIssues}</div></div>
          <div style="background:var(--bg3);border-radius:8px;padding:10px;"><div style="font-size:10px;color:var(--white50);">הזדמנויות</div><div style="font-size:20px;font-weight:800;color:var(--green);">${a.readyOpp}</div></div>
          <div style="background:var(--bg3);border-radius:8px;padding:10px;"><div style="font-size:10px;color:var(--white50);">רמת דחיפות</div><div style="font-size:14px;font-weight:800;color:${urgencyColor};margin-top:2px;">${a.urgencyLabel}</div></div>
        </div>
        <div style="font-size:12px;color:var(--white50);margin-bottom:12px;">⚠️ העברה לממצאים בלבד – לא מתבצע שום תיקון בפועל. כל פעולה תאושר ב"מטרות שלנו" ←  "הפעולות".</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${a.readyToTransfer
            ? `<button class="btn btn-primary" onclick="goScreen('screen-goals');showToast('🎯 ${a.readyCount} ממצאים הועברו למטרות')">🎯 העבר ממצאים למטרות</button>`
            : `<button class="btn btn-ghost" disabled style="opacity:0.5;cursor:not-allowed;">⏳ ממתין לסיום סריקה</button>`}
          <button class="btn btn-ghost" onclick="openModal('modal-report')">📄 הפק דוח עוזר</button>
          <button class="btn btn-ghost" onclick="goScreen('screen-agents')">← חזרה לרשימה</button>
        </div>
      </div>
    </div>`;

  document.getElementById('agent-dash-content').innerHTML = content;
  goScreen('screen-agent-dashboard');
}

function getAgentFilterHint(id) {
  const hints = {
    gsc: 'מילות מפתח, עמודים, CTR, מיקום, שגיאות אינדוקס',
    ga4: 'מקורות תנועה, עמודים, אירועים, המרות, מכשיר',
    pagespeed: 'Mobile / Desktop, Core Web Vitals, LCP / CLS / INP',
    project001: 'תחום, עדיפות, קטגוריה, עוזר מקור',
    cms: 'עמוד, סטטוס פרסום, סוג תוכן, תגיות',
    seotools: 'מילת מפתח, קושי, נפח, מתחרה, Backlinks',
    gbp: 'ביקורות, פוסטים, תמונות, שאלות, דירוג',
    ads: 'קמפיין, קבוצת מודעות, מילת מפתח, ROI, עלות',
    meta: 'פלטפורמה (FB/IG), פוסט, קמפיין, קהל, לידים',
    cursor: 'סוג תיקון, עמוד, API, קובץ, QA',
    manager: 'עוזר מקור, קטגוריה, דחיפות, סוג פעולה'
  };
  return hints[id] || 'מסנני עומק יוגדרו לפי סוג הנתונים';
}

// ===== AGENT LIST FILTER =====
function toggleAgentAdvFilter() {
  const p = document.getElementById('ag-adv-panel');
  const btn = document.getElementById('ag-adv-toggle');
  const ico = document.getElementById('ag-adv-icon');
  if (!p) return;
  const open = p.style.display === 'none' || p.style.display === '';
  p.style.display = open ? 'block' : 'none';
  if (ico) ico.textContent = open ? '▲' : '▼';
  if (btn) { btn.style.borderColor = open ? 'var(--accent)' : 'var(--border)'; btn.style.color = open ? 'var(--accent2)' : 'var(--white50)'; }
}
function toggleAgentFilter() { toggleAgentAdvFilter(); }

function resetAgentFilter() {
  ['ag-agent','ag-status','ag-priority'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  const s=document.getElementById('ag-search'); if(s) s.value='';
  showToast('✓ סינון עוזרים אופס');
}
// ===== END AGENT LOGIC =====

// ===== ACTIONS FILTER =====
function toggleActAdvanced() {
  const panel = document.getElementById('act-adv-panel');
  const ch    = document.getElementById('act-adv-ch');
  const btn   = document.getElementById('act-adv-btn');
  if (!panel) return;
  const open = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = open ? 'block' : 'none';
  if (ch)  ch.style.transform  = open ? 'rotate(180deg)' : 'rotate(0)';
  if (btn) btn.style.borderColor = open ? 'var(--accent)' : 'var(--border)';
}
function applyActFilter() {
  const cat    = document.getElementById('act-cat')?.value || '';
  const type   = document.getElementById('act-type')?.value || '';
  const urgency= document.getElementById('act-urgency')?.value || '';
  const search = (document.getElementById('act-search')?.value || '').toLowerCase();
  document.querySelectorAll('.act-item').forEach(item => {
    const catOk  = !cat    || item.dataset.cat    === cat;
    const typeOk = !type   || item.dataset.type   === type;
    const urgOk  = !urgency|| item.dataset.urgency=== urgency;
    const textOk = !search || item.textContent.toLowerCase().includes(search);
    item.style.display = (catOk && typeOk && urgOk && textOk) ? '' : 'none';
  });
  // chips
  const chip = document.getElementById('act-chips');
  const chips = [];
  if (cat)     chips.push(document.getElementById('act-cat').options[document.getElementById('act-cat').selectedIndex].text);
  if (type)    chips.push('סוג: ' + type);
  if (urgency) chips.push('דחיפות: ' + urgency);
  if (chip) {
    if (chips.length) {
      chip.style.display = 'flex';
      chip.innerHTML = chips.map(c => `<span style="display:inline-flex;align-items:center;gap:5px;padding:2px 9px;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.35);border-radius:99px;font-size:11px;color:var(--purple);">${c}</span>`).join('');
    } else {
      chip.style.display = 'none'; chip.innerHTML = '';
    }
  }
}
function resetActFilter() {
  ['act-cat','act-source','act-type','act-urgency',
   'act-company','act-project','act-site','act-page',
   'act-agent-type','act-campaign','act-campaign-type',
   'act-owner','act-date-range','act-status-adv'].forEach(id => {
    const el=document.getElementById(id); if(el) el.value='';
  });
  const s=document.getElementById('act-search'); if(s) s.value='';
  const d=document.getElementById('act-domain'); if(d) d.value='greentech.co.il';
  applyActFilter();
  showToast('✓ סינון פעולות אופס');
}
function returnAction(btn) {
  const card = btn.closest('.action-card');
  card.style.opacity = '0.6';
  card.style.pointerEvents = 'none';
  showToast('🔄 הפעולה הוחזרה לתיקון');
  setTimeout(() => card.remove(), 700);
}
function pauseAction(btn) {
  const card = btn.closest('.action-card');
  showToast('⏸️ הפעולה הושהתה');
  card.style.opacity = '0.5';
}
// ===== END ACTIONS LOGIC =====

// ===== GOALS FILTER ADV =====
function toggleGoalsAdvFilter() {
  const p = document.getElementById('gf-adv-panel');
  const ch = document.getElementById('gf-adv-ch');
  const btn = document.getElementById('gf-adv-btn');
  if (!p) return;
  const open = p.style.display === 'none' || p.style.display === '';
  p.style.display = open ? 'block' : 'none';
  if (ch) ch.textContent = open ? '▲' : '▼';
  if (btn) { btn.style.borderColor = open ? 'var(--accent)' : 'var(--border)'; btn.style.color = open ? 'var(--accent2)' : 'var(--white50)'; }
}
// ===== GOALS LOGIC =====
function applyGoalsAgentFilter() {
  const sel = document.getElementById('gf-agent');
  if (!sel) return;
  const val = sel.value;
  const name = val ? sel.options[sel.selectedIndex].text : '';
  const chip = document.getElementById('goals-filter-chips');
  if (val && chip) {
    chip.style.display = 'flex';
    chip.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;padding:3px 10px;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.35);border-radius:99px;font-size:12px;color:var(--purple);">🤖 עוזר: <strong>${name}</strong><span onclick="clearGoalsAgentFilter()" style="cursor:pointer;font-size:13px;opacity:0.7;">✕</span></span>`;
    document.querySelectorAll('.goal-acc-item').forEach(item => {
      item.style.display = (!val || item.dataset.agent === val) ? '' : 'none';
    });
  } else {
    if (chip) { chip.style.display = 'none'; chip.innerHTML = ''; }
    document.querySelectorAll('.goal-acc-item').forEach(item => { item.style.display = ''; });
  }
}
function clearGoalsAgentFilter() {
  const sel = document.getElementById('gf-agent');
  if (sel) sel.value = '';
  applyGoalsAgentFilter();
}
function resetGoalsFilter() {
  ['gf-company','gf-project','gf-site','gf-agent','gf-agent-type','gf-campaign','gf-campaign-type','gf-channel','gf-status','gf-priority','gf-page','gf-goal-category'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const s = document.getElementById('gf-search'); if (s) s.value = '';
  const d = document.getElementById('gf-date'); if (d) d.value = '30';
  applyGoalsAgentFilter();
  clearGoalCategoryFilter();
  showToast('✓ סינון מטרות אופס');
}
function toggleGoal(id) {
  const panel = document.getElementById(id);
  const chevron = document.getElementById(id + '-chevron');
  if (!panel) return;
  const open = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = open ? 'block' : 'none';
  if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : 'rotate(0)';
}

// ===== CATEGORIES =====
function toggleCat(id) {
  const panel = document.getElementById(id);
  const ch = document.getElementById(id + '-ch');
  if (!panel) return;
  const open = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = open ? 'block' : 'none';
  if (ch) ch.style.transform = open ? 'rotate(180deg)' : 'rotate(0)';
}
function filterCategories() {
  const val = document.getElementById('cat-filter').value;
  document.querySelectorAll('.cat-card').forEach(card => {
    card.style.display = (!val || card.dataset.cat === val) ? '' : 'none';
  });
  showToast(val ? ('מציג קטגוריה: ' + document.getElementById('cat-filter').options[document.getElementById('cat-filter').selectedIndex].text) : '✓ כל הקטגוריות');
}

function applyGoalCategoryFilter() {
  const sel = document.getElementById('gf-goal-category');
  if (!sel) return;
  const val = sel.value;
  const name = val ? sel.options[sel.selectedIndex].text : '';
  const chip = document.getElementById('goals-filter-chips');

  // Show/hide category cards – scroll to & open the selected one
  if (val) {
    // Collapse all first, then open the chosen one
    collapseAllCats();
    document.querySelectorAll('.cat-card').forEach(card => { card.style.display = 'none'; });
    const target = document.getElementById(val);          // the panel
    const card   = target ? target.closest('.cat-card') : null;
    if (card) {
      card.style.display = '';
      if (target) { target.style.display = 'block'; }
      // rotate chevron
      const ch = document.getElementById(val + '-ch');
      if (ch) ch.style.transform = 'rotate(180deg)';
      // scroll to categories area
      setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    }
    // chip
    if (chip) {
      chip.style.display = 'flex';
      const existing = chip.querySelector('[data-chip="goalcat"]');
      const html = `<span data-chip="goalcat" style="display:inline-flex;align-items:center;gap:6px;padding:3px 10px;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.4);border-radius:99px;font-size:12px;color:var(--purple);">🎯 ${name}<span onclick="clearGoalCategoryFilter()" style="cursor:pointer;font-size:13px;opacity:0.7;">✕</span></span>`;
      if (existing) existing.outerHTML = html;
      else chip.insertAdjacentHTML('afterbegin', html);
    }
    showToast('🎯 ' + name.slice(0, 30));
  } else {
    clearGoalCategoryFilter();
  }
}

function clearGoalCategoryFilter() {
  const sel = document.getElementById('gf-goal-category');
  if (sel) sel.value = '';
  // Restore all category cards
  document.querySelectorAll('.cat-card').forEach(card => { card.style.display = ''; });
  // Remove chip
  const chip = document.getElementById('goals-filter-chips');
  if (chip) {
    const existing = chip.querySelector('[data-chip="goalcat"]');
    if (existing) existing.remove();
    if (!chip.children.length) chip.style.display = 'none';
  }
}
function expandAllCats() {
  for (let i = 1; i <= 20; i++) {
    const p = document.getElementById('cat' + i);
    const ch = document.getElementById('cat' + i + '-ch');
    if (p) { p.style.display = 'block'; }
    if (ch) ch.style.transform = 'rotate(180deg)';
  }
}
function collapseAllCats() {
  for (let i = 1; i <= 20; i++) {
    const p = document.getElementById('cat' + i);
    const ch = document.getElementById('cat' + i + '-ch');
    if (p) { p.style.display = 'none'; }
    if (ch) ch.style.transform = 'rotate(0)';
  }
}
function showCatHistory(catName) {
  goScreen('screen-actions');
  setTab(document.querySelector('#screen-actions .nav-tab:last-child'), 'tab-actions-history');
  showToast('📚 היסטוריה – ' + catName);
}
// ===== END CATEGORIES =====
function transferGoalToActions(goalName, agentId) {
  goScreen('screen-actions');
  showToast('⚙️ "' + goalName + '" הועברה לפעולות');
}
// ===== END GOALS LOGIC =====

// ===== CRM =====
const CRM_CLIENTS = {
  greentech: { name:'גרין-טק פתרונות', id:'CLT-001', contact:'ראובן לוי', phone:'054-1234567', email:'reuven@greentech.co.il', site:'greentech.co.il', sector:'ניהול צי', service:'שיווק + צי', status:'פעיל', score:'⭐⭐⭐', owner:'יוני', source:'Google Ads', since:'10.1.24' },
  delta:     { name:'דלתא לוגיסטיקה', id:'CLT-002', contact:'שרה כהן', phone:'052-9876543', email:'sarah@delta.co.il', site:'delta-logistics.co.il', sector:'לוגיסטיקה', service:'שיווק בלבד', status:'פעיל', score:'⭐⭐', owner:'דנה', source:'Google אורגני', since:'3.3.24' },
  alpha:     { name:'אלפא מוטורס', id:'CLT-003', contact:'דוד מזרחי', phone:'050-3456789', email:'david@alpha.co.il', site:'alpha-motors.co.il', sector:'רכב', service:'ניהול צי', status:'הצעת מחיר', score:'⭐⭐⭐', owner:'יוני', source:'הפניה', since:'18.6.25' },
  tech:      { name:'פתרונות טק ישראל', id:'CLT-004', contact:'מיכל אברהם', phone:'053-7654321', email:'michal@tek.co.il', site:'tek-solutions.co.il', sector:'טכנולוגיה', service:'שיווק בלבד', status:'בטיפול', score:'⭐', owner:'Miki', source:'Facebook', since:'20.6.25' },
  lead1:     { name:'בן-דוד תחבורה', id:'CLT-005', contact:'אלי בן-דוד', phone:'058-1122334', email:'eli@bd.co.il', site:'bd-transport.co.il', sector:'תחבורה', service:'לא הוחלט', status:'ליד חדש', score:'⭐⭐', owner:'יוני', source:'Google Business', since:'23.6.25' },
  lead2:     { name:'מגדל ביטוח צי', id:'CLT-006', contact:'רחל שפירא', phone:'054-9988776', email:'rachel@migdal-fleet.co.il', site:'migdal-fleet.co.il', sector:'ביטוח', service:'לא הוחלט', status:'ליד חדש', score:'⭐⭐⭐', owner:'דנה', source:'Google Ads', since:'24.6.25' },
  new:       { name:'לקוח חדש', id:'CLT-NEW', contact:'', phone:'', email:'', site:'', sector:'', service:'', status:'ליד חדש', score:'', owner:'', source:'', since:'' }
};

function openCrmCard(id) {
  const c = CRM_CLIENTS[id] || CRM_CLIENTS['new'];
  document.getElementById('crm-card-breadcrumb').textContent = c.name;

  const statusColor = c.status==='פעיל' ? 'var(--green)' : c.status==='ליד חדש' ? 'var(--accent2)' : c.status==='הצעת מחיר' ? 'var(--purple)' : 'var(--yellow)';

  const infoTab = `
    <div class="page-header">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
        <div>
          <div class="page-title">${c.name}</div>
          <div class="page-subtitle">${c.id} • ${c.sector} • מאז ${c.since}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <span class="badge badge-blue">${c.service || 'לא הוגדר'}</span>
          <span style="font-size:14px;font-weight:700;color:${statusColor};">${c.status}</span>
          <span style="font-size:16px;">${c.score}</span>
        </div>
      </div>
      <hr class="page-rule">
    </div>

    <div class="section" style="padding-bottom:0;">
      <div class="grid grid-2" style="gap:12px;">
        <!-- Contact details -->
        <div class="card">
          <div class="sec-title">פרטי התקשרות</div>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;">
            <div style="display:flex;justify-content:space-between;"><span style="color:var(--white50);">איש קשר</span><strong>${c.contact || '—'}</strong></div>
            <div style="display:flex;justify-content:space-between;"><span style="color:var(--white50);">טלפון</span><strong>${c.phone || '—'}</strong></div>
            <div style="display:flex;justify-content:space-between;"><span style="color:var(--white50);">אימייל</span><strong style="font-size:12px;">${c.email || '—'}</strong></div>
            <div style="display:flex;justify-content:space-between;"><span style="color:var(--white50);">אתר</span><strong style="font-size:12px;">${c.site || '—'}</strong></div>
            <div style="display:flex;justify-content:space-between;"><span style="color:var(--white50);">אחראי</span><strong>${c.owner || '—'}</strong></div>
          </div>
          <div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap;">
            <button class="btn btn-primary" style="font-size:11px;padding:4px 10px;" onclick="showToast('📞 מחייג...')">📞 התקשר</button>
            <button class="btn btn-ghost" style="font-size:11px;padding:4px 10px;" onclick="showToast('💬 WhatsApp...')">💬 WhatsApp</button>
            <button class="btn btn-ghost" style="font-size:11px;padding:4px 10px;" onclick="showToast('📧 מייל...')">📧 מייל</button>
          </div>
        </div>

        <!-- Business details -->
        <div class="card">
          <div class="sec-title">פרטי העסק</div>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;">
            <div style="display:flex;justify-content:space-between;"><span style="color:var(--white50);">Client ID</span><code style="background:var(--bg4);padding:1px 6px;border-radius:4px;font-size:12px;">${c.id}</code></div>
            <div style="display:flex;justify-content:space-between;"><span style="color:var(--white50);">תחום</span><strong>${c.sector || '—'}</strong></div>
            <div style="display:flex;justify-content:space-between;"><span style="color:var(--white50);">שירות</span><strong>${c.service || '—'}</strong></div>
            <div style="display:flex;justify-content:space-between;"><span style="color:var(--white50);">מקור הגעה</span><strong>${c.source || '—'}</strong></div>
            <div style="display:flex;justify-content:space-between;"><span style="color:var(--white50);">ציון ליד</span><strong>${c.score || '—'}</strong></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Leads source summary -->
    <div class="section" style="padding-bottom:0;">
      <div class="card">
        <div class="sec-title">מקורות הגעה – הכנה לחיבור</div>
        <div class="grid grid-4" style="gap:8px;">
          ${['Google אורגני','Google Ads','Google Business','Facebook','Instagram','LinkedIn','WhatsApp','טופס','שיחה','הפניה'].map((s,i) =>
            `<div style="background:var(--bg4);border-radius:7px;padding:8px;text-align:center;opacity:${c.source===s?'1':'0.4'};">
              <div style="font-size:10px;color:var(--white50);">${s}</div>
              <div style="font-size:16px;font-weight:800;color:${c.source===s?'var(--accent2)':'var(--white20)'};">${c.source===s?'✓':'—'}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- Future connections -->
    <div class="section">
      <div class="card">
        <div class="sec-title">חיבורים עתידיים – לפי Client ID: ${c.id}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${['מצב נוכחי','חברות','עוזרים','מטרות','פעולות','היסטוריה','נכסים','AI','דוחות','Supabase'].map(m =>
            `<span style="padding:4px 10px;border-radius:7px;background:var(--bg4);border:1px solid var(--border);font-size:11px;color:var(--white50);">○ ${m}</span>`).join('')}
        </div>
        <div style="font-size:11px;color:var(--white50);margin-top:8px;">💡 לאחר חיבור ב-Cursor: כל מודול יאגד נתונים לפי Client ID ${c.id} בלבד</div>
      </div>
    </div>`;

  document.getElementById('crm-card-content').innerHTML = infoTab +
    `<div id="tab-cc-leads" style="display:none;"><div class="section"><div class="alert alert-info">🔔 לידים של ${c.name} – יתמלא מ-Supabase לאחר חיבור</div></div></div>
     <div id="tab-cc-tasks" style="display:none;"><div class="section"><div class="alert alert-info">📌 משימות של ${c.name} – יתמלא לאחר חיבור</div></div></div>
     <div id="tab-cc-history" style="display:none;"><div class="section">
       <div class="sec-title">Audit Trail – ${c.name}</div>
       <div class="timeline">
         <div class="tl-item"><div class="tl-dot-wrap"><div class="tl-dot" style="background:var(--green)"></div><div class="tl-line"></div></div><div class="tl-content"><div class="tl-title">לקוח נוצר במערכת</div><div class="tl-time">${c.since} | ${c.owner} | מקור: ${c.source}</div></div></div>
         <div class="tl-item"><div class="tl-dot-wrap"><div class="tl-dot" style="background:var(--accent2)"></div><div class="tl-line"></div></div><div class="tl-content"><div class="tl-title">שיחת היכרות</div><div class="tl-time">ממתין לתיעוד</div></div></div>
       </div>
     </div></div>
     <div id="tab-cc-docs" style="display:none;"><div class="section"><div class="alert alert-info">📄 מסמכים – יתמלא לאחר חיבור</div></div></div>
     <div id="tab-cc-marketing" style="display:none;"><div class="section">
       <div class="ai-box"><div class="ai-box-header"><div class="ai-pulse"></div>שיווק – ${c.name}</div><div class="ai-box-text">נתוני שיווק יסונכרנו לאחר חיבור ל-Google Analytics, Google Ads וה-Search Console בעמוד "הנכסים הדיגיטליים".</div></div>
       <div style="margin-top:12px;display:flex;gap:8px;"><button class="btn btn-ghost" style="font-size:12px;" onclick="goScreen('screen-status')">📊 מצב נוכחי</button><button class="btn btn-ghost" style="font-size:12px;" onclick="goScreen('screen-assets')">🌐 נכסים</button></div>
     </div></div>
     <div id="tab-cc-ai" style="display:none;"><div class="section">
       <div class="ai-box"><div class="ai-box-header"><div class="ai-pulse"></div>🤖 AI אישי – ${c.name}</div><div class="ai-box-text">עוזר AI אישי ייצור לאחר חיבור. יכיר: האתר, הקמפיינים, ההיסטוריה, לידים, איכות לידים, משימות, פעולות שבוצעו – ויפיק המלצות, פעולות, סדרי עדיפויות ותובנות.</div></div>
     </div></div>`;

  // Init tabs in new content
  document.querySelectorAll('#crm-card-content [id^="tab-cc-"]').forEach((t,i) => { t.style.display = i===0?'':'none'; });
  goScreen('screen-crm-card');
}

function resetCrmFilter() {
  ['crm-company','crm-source','crm-status','crm-service','crm-owner','crm-score'].forEach(id => {
    const el=document.getElementById(id); if(el) el.value='';
  });
  const d=document.getElementById('crm-date'); if(d) d.value='30';
  const s=document.getElementById('crm-search'); if(s) s.value='';
  showToast('✓ סינון CRM אופס');
}
// ===== END CRM =====

// ===== STATUS FILTER LOGIC =====

// Show/hide custom date range
document.getElementById('sf-daterange').addEventListener('change', function() {
  const custom = document.getElementById('sf-date-custom');
  custom.style.display = (this.value === 'custom') ? 'flex' : 'none';
  applyStatusFilter();
});

// Show campaign ID input when checkbox ticked
document.getElementById('adv-campaign-num').addEventListener('change', function() {
  document.getElementById('adv-campaign-id').style.display = this.checked ? 'block' : 'none';
});

function toggleAdvancedFilter() {
  const panel = document.getElementById('sf-advanced-panel');
  const chevron = document.getElementById('sf-advanced-chevron');
  const btn = document.getElementById('sf-advanced-btn');
  const open = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = open ? 'block' : 'none';
  chevron.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
  btn.style.borderColor = open ? 'var(--accent)' : 'var(--border)';
  btn.style.color = open ? 'var(--accent2)' : 'var(--white80)';
}

function applyStatusFilter() {
  const company  = document.getElementById('sf-company-display').textContent.trim();
  const project  = document.getElementById('sf-project').value;
  const site     = document.getElementById('sf-site').value;
  const page     = document.getElementById('sf-page').value;
  const campaign = document.getElementById('sf-campaign').value;
  const campType = document.getElementById('sf-campaign-type').value;
  const channel  = document.getElementById('sf-channel').value;
  const dateRange= document.getElementById('sf-daterange').value;
  const status   = document.getElementById('sf-status').value;

  // Build chips
  const chips = [];
  if (project)  chips.push({ label: 'פרויקט: ' + document.getElementById('sf-project').options[document.getElementById('sf-project').selectedIndex].text, key: 'sf-project' });
  if (site && site !== '')     chips.push({ label: 'אתר: ' + site, key: 'sf-site' });
  if (page)     chips.push({ label: 'עמוד: ' + document.getElementById('sf-page').options[document.getElementById('sf-page').selectedIndex].text, key: 'sf-page' });
  if (campaign) chips.push({ label: 'קמפיין: ' + document.getElementById('sf-campaign').options[document.getElementById('sf-campaign').selectedIndex].text, key: 'sf-campaign' });
  if (campType) chips.push({ label: 'סוג: ' + document.getElementById('sf-campaign-type').options[document.getElementById('sf-campaign-type').selectedIndex].text, key: 'sf-campaign-type' });
  if (channel)  chips.push({ label: 'ערוץ: ' + document.getElementById('sf-channel').options[document.getElementById('sf-channel').selectedIndex].text, key: 'sf-channel' });
  if (status)   chips.push({ label: 'סטטוס: ' + document.getElementById('sf-status').options[document.getElementById('sf-status').selectedIndex].text, key: 'sf-status' });
  if (dateRange !== '30') chips.push({ label: 'תאריכים: ' + (dateRange === 'custom' ? 'מותאם' : dateRange + ' ימים'), key: 'sf-daterange' });

  renderChips(chips);
  updateStatusSubtitle(company, site, dateRange);
}

function renderChips(chips) {
  const container = document.getElementById('sf-chips');
  if (!chips.length) { container.style.display = 'none'; container.innerHTML = ''; return; }
  container.style.display = 'flex';
  container.innerHTML = chips.map(c =>
    `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;background:rgba(37,99,235,0.15);border:1px solid rgba(37,99,235,0.3);border-radius:99px;font-size:11px;color:var(--accent2);">
      ${c.label}
      <span onclick="clearChip('${c.key}')" style="cursor:pointer;font-size:12px;opacity:0.7;line-height:1;">✕</span>
    </span>`
  ).join('');
}

function clearChip(key) {
  const el = document.getElementById(key);
  if (el) { el.value = el.tagName === 'SELECT' ? '' : '30'; }
  applyStatusFilter();
}

function updateStatusSubtitle(company, site, dateRange) {
  const sub = document.querySelector('#screen-status .page-subtitle');
  if (!sub) return;
  const siteStr = site || 'כל האתרים';
  const dStr = dateRange === 'custom' ? 'טווח מותאם' : dateRange + ' ימים אחרונים';
  sub.textContent = company + ' • ' + siteStr + ' • ' + dStr;
}

function resetStatusFilter() {
  ['sf-project','sf-site','sf-campaign','sf-campaign-type','sf-channel','sf-status'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('sf-page').value = '';
  document.getElementById('sf-daterange').value = '30';
  document.getElementById('sf-date-custom').style.display = 'none';
  document.getElementById('sf-chips').style.display = 'none';
  document.getElementById('sf-chips').innerHTML = '';
  updateStatusSubtitle('גרין-טק פתרונות בע"מ', '', '30');
  // Also reset site to default
  document.getElementById('sf-site').value = 'greentech.co.il';
  showToast('✓ הסינון אופס');
}

function applyAdvancedFilter() {
  // Count checked channels
  const channels = ['adv-ch-seo','adv-ch-ads','adv-ch-gbp','adv-ch-fb','adv-ch-ig','adv-ch-tiktok','adv-ch-li','adv-ch-yt','adv-ch-wa','adv-ch-email'];
  const active = channels.filter(id => document.getElementById(id)?.checked).length;
  document.getElementById('sf-active-label').textContent = active + ' ערוצים פעילים בסינון';
  showToast('✓ סינון מתקדם הוחל – ' + active + ' ערוצים');
}

function resetAdvancedFilter() {
  // Re-check all channel checkboxes (reset to default: all on except tiktok/yt/wa)
  const defaults = { 'adv-ch-seo':true,'adv-ch-ads':true,'adv-ch-gbp':true,'adv-ch-fb':true,'adv-ch-ig':true,'adv-ch-tiktok':false,'adv-ch-li':true,'adv-ch-yt':false,'adv-ch-wa':false,'adv-ch-email':true };
  Object.entries(defaults).forEach(([id, val]) => { const el = document.getElementById(id); if(el) el.checked = val; });
  ['adv-overview','adv-scores','adv-kpis','adv-site','adv-page','adv-campaign'].forEach(id => { const el = document.getElementById(id); if(el) el.checked = true; });
  document.getElementById('adv-landing').checked = false;
  document.getElementById('adv-campaign-num').checked = false;
  document.getElementById('adv-campaign-id').style.display = 'none';
  document.getElementById('sf-active-label').textContent = '';
  showToast('✓ הסינון המתקדם אופס');
}

// ===== END STATUS FILTER LOGIC =====

// Init: show only first tabs in each screen
document.querySelectorAll('.screen').forEach(screen => {
  const tabGroups = {};
  screen.querySelectorAll('[id^="tab-"]').forEach(tab => {
    const prefix = tab.id.split('-').slice(0,3).join('-');
    if (!tabGroups[prefix]) { tabGroups[prefix] = []; }
    tabGroups[prefix].push(tab);
  });
  Object.values(tabGroups).forEach(group => {
    group.forEach((t, i) => { t.style.display = i === 0 ? '' : 'none'; });
  });
});
