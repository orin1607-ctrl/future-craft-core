// ===== NAVIGATION =====
function goScreen(id) {
  var root = document.getElementById('coco-claude-root');
  var scope = root || document;
  scope.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
  var el = document.getElementById(id);
  if (el) {
    el.classList.add('active');
    var content = el.querySelector('.content');
    if (content && content.scrollTo) content.scrollTo(0, 0);
  }
  document.body.classList.add('coco-claude-layout');
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
  if (!t) { console.log('[toast]', msg); return; }
  t.textContent = msg;
  t.style.opacity = '1';
  t.style.transform = 'translateY(0)';
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(20px)'; }, 3000);
}

function showDaliaToast() {
  showToast('🏠 חוזר למערכת דליה הראשית...');
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
  if (window.CocoClaude && CocoClaude.bindDemoClient) {
    CocoClaude.bindDemoClient(name);
    return;
  }
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

// ===== AGENT DASHBOARD DATA =====
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
function toggleAgentFilter() {
  const panel = document.getElementById('ag-advanced-panel');
  const chevron = document.getElementById('ag-adv-chevron');
  const open = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = open ? 'block' : 'none';
  chevron.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
}

function resetAgentFilter() {
  ['ag-company','ag-project','ag-site','ag-agent','ag-system','ag-status','ag-datatype','ag-priority'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('ag-scandate').value = '3h';
  document.getElementById('ag-domain').value = 'greentech.co.il';
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

function resetHistoryFilter() {
  ['hist-company','hist-site','hist-page','hist-campaign','hist-status','hist-action-type'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const d = document.getElementById('hist-date'); if (d) d.value = '30';
  const c = document.getElementById('hist-company'); if (c) c.value = 'greentech';
  const s = document.getElementById('hist-site'); if (s) s.value = 'greentech.co.il';
  showToast('✓ סינון היסטוריה אופס');
}

function resetAiDecisionsFilter() {
  ['ai-company','ai-site','ai-page','ai-campaign','ai-goal','ai-agent'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const d = document.getElementById('ai-date'); if (d) d.value = '30';
  const c = document.getElementById('ai-company'); if (c) c.value = 'greentech';
  const s = document.getElementById('ai-site'); if (s) s.value = 'greentech.co.il';
  showToast('✓ סינון AI אופס');
}

function resetReportsFilter() {
  ['rep-company','rep-site','rep-page','rep-campaign','rep-channel','rep-status','rep-employee','rep-ai-agent'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const d = document.getElementById('rep-date'); if (d) d.value = '30';
  const c = document.getElementById('rep-company'); if (c) c.value = 'greentech';
  const s = document.getElementById('rep-site'); if (s) s.value = 'greentech.co.il';
  showToast('✓ סינון דוחות אופס');
}

// ===== END STATUS FILTER LOGIC =====

// Init: show only first tabs in each Claude screen
var cocoRootEarly = document.getElementById('coco-claude-root');
if (cocoRootEarly) {
  cocoRootEarly.querySelectorAll('.screen').forEach(screen => {
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
}

// ===== COCO CLAUDE INTEGRATION (Phase C — flow context sync) =====
(function () {
  'use strict';

  window.COCO = window.COCO || {};
  if (!COCO.flowContext) {
    COCO.flowContext = {
      clientId: null,
      company: '',
      clientName: '',
      site: '',
      domain: '',
      page: '',
      campaign: '',
      campaignType: '',
      channel: '',
      goal: '',
      action: '',
      status: '',
      dateRange: '30',
      dateFrom: '',
      dateTo: '',
      agent: '',
      project: '',
      selectedCard: null
    };
  }

  var STORAGE_KEY = 'coco-flow-context-v2';
  var SYNC_GUARD = false;

  var DEMO_CLIENTS = {
    'גרין-טק פתרונות': { id: 'demo-greentech', company: 'greentech', name: 'גרין-טק פתרונות בע"מ', site: 'greentech.co.il', sub: 'ניהול שיווק + ניהול צי' },
    'דלתא לוגיסטיקה': { id: 'demo-delta', company: 'delta', name: 'דלתא לוגיסטיקה בע"מ', site: 'delta-log.co.il', sub: 'ניהול שיווק בלבד' },
    'פתרונות טק': { id: 'demo-techsol', company: 'techsol', name: 'פתרונות טק ישראל', site: 'techsol.co.il', sub: 'ניהול שיווק בלבד' }
  };

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
    'sc-mkt-history': 'screen-history',
    'sc-mkt-assets': 'screen-assets',
    'sc-mkt-ai-decisions': 'screen-ai-decisions',
    'sc-mkt-reports': 'screen-reports',
    'sc-mkt-agents': 'screen-agents'
  };

  var FIELD_MAP = [
    { ctx: 'company', ids: ['gf-company', 'ag-company', 'act-company', 'hist-company', 'ai-company', 'rep-company'], displayIds: ['sf-company-display'] },
    { ctx: 'site', ids: ['sf-site', 'gf-site', 'ag-site', 'act-site', 'hist-site', 'ai-site', 'rep-site'] },
    { ctx: 'domain', ids: ['gf-domain', 'ag-domain', 'act-domain'] },
    { ctx: 'page', ids: ['sf-page', 'gf-page', 'act-page', 'hist-page', 'ai-page', 'rep-page'] },
    { ctx: 'campaign', ids: ['sf-campaign', 'gf-campaign', 'act-campaign', 'hist-campaign', 'ai-campaign', 'rep-campaign'] },
    { ctx: 'campaignType', ids: ['sf-campaign-type', 'gf-campaign-type', 'act-campaign-type'] },
    { ctx: 'channel', ids: ['sf-channel', 'gf-channel', 'rep-channel'] },
    { ctx: 'status', ids: ['sf-status', 'gf-status', 'ag-status', 'act-status-adv', 'hist-status', 'rep-status'] },
    { ctx: 'dateRange', ids: ['sf-daterange', 'gf-date', 'act-date-range', 'hist-date', 'ai-date', 'rep-date'] },
    { ctx: 'dateFrom', ids: ['sf-date-from'] },
    { ctx: 'dateTo', ids: ['sf-date-to'] },
    { ctx: 'agent', ids: ['gf-agent', 'ag-agent', 'act-source', 'ai-agent', 'rep-ai-agent'] },
    { ctx: 'goal', ids: ['gf-goal-category', 'ai-goal', 'act-cat'] },
    { ctx: 'action', ids: ['act-type', 'hist-action-type'] },
    { ctx: 'project', ids: ['sf-project', 'gf-project', 'ag-project', 'act-project'] }
  ];

  var CTX_ID_INDEX = {};
  FIELD_MAP.forEach(function (row) {
    row.ids.forEach(function (id) { CTX_ID_INDEX[id] = row.ctx; });
  });

  function loadContext() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('coco-flow-context-v1');
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

  function normalizeDomain(val) {
    if (!val) return '';
    return String(val).replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  }

  function resolveCompanySlug(name) {
    if (!name) return '';
    for (var key in DEMO_CLIENTS) {
      if (DEMO_CLIENTS[key].name === name || name.indexOf(key) !== -1) return DEMO_CLIENTS[key].company;
    }
    if (/גרין|green/i.test(name)) return 'greentech';
    if (/דלתא|delta/i.test(name)) return 'delta';
    return '';
  }

  function setFieldValue(el, val) {
    if (!el || val == null || val === '') return false;
    if (el.tagName === 'SELECT') {
      if (el.value === val) return false;
      var opts = el.options;
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].value === val || opts[i].text === val) {
          el.value = opts[i].value || opts[i].text;
          return true;
        }
      }
      for (var j = 0; j < opts.length; j++) {
        if (opts[j].text.indexOf(val) !== -1 || String(val).indexOf(opts[j].text) !== -1) {
          el.value = opts[j].value || opts[j].text;
          return true;
        }
      }
      return false;
    }
    if (el.tagName === 'INPUT' && el.type !== 'checkbox') {
      if (el.value === val) return false;
      el.value = val;
      return true;
    }
    if (el.id === 'sf-company-display' || el.id === 'coco-hub-client-name') {
      var text = String(val).indexOf('🏢') === 0 ? val : ('🏢 ' + val);
      if (el.textContent !== text) { el.textContent = text; return true; }
    }
    return false;
  }

  function propagateField(ctxKey, val, skipId) {
    if (SYNC_GUARD || val == null || val === '') return;
    var row = FIELD_MAP.find(function (r) { return r.ctx === ctxKey; });
    if (!row) return;
    SYNC_GUARD = true;
    row.ids.forEach(function (id) {
      if (id === skipId) return;
      var el = document.getElementById(id);
      if (el) setFieldValue(el, val);
    });
    (row.displayIds || []).forEach(function (id) {
      if (id === skipId) return;
      var el = document.getElementById(id);
      if (el) setFieldValue(el, ctxKey === 'company' ? (COCO.flowContext.clientName || val) : val);
    });
    if (ctxKey === 'site' && val) {
      var dom = normalizeDomain(val);
      COCO.flowContext.domain = dom;
      propagateField('domain', dom, skipId);
    }
    SYNC_GUARD = false;
  }

  function syncFromElement(el) {
    if (SYNC_GUARD || !el || !el.id) return;
    var ctxKey = CTX_ID_INDEX[el.id];
    if (!ctxKey) return;
    var val = (el.tagName === 'SELECT' || el.tagName === 'INPUT') ? el.value : (el.textContent || '').trim();
    if (!val && ctxKey !== 'dateRange') return;
    COCO.flowContext[ctxKey] = val;
    if (ctxKey === 'company' && el.tagName === 'SELECT' && el.selectedIndex >= 0) {
      var optText = el.options[el.selectedIndex].text;
      if (optText && optText !== 'כל החברות') COCO.flowContext.clientName = optText;
    }
    saveContext();
    propagateField(ctxKey, val, el.id);
    updateContextBar();
    updateHubClientHeader();
    refreshScreenFilters();
    if (window.CocoData && CocoData.onContextChange) CocoData.onContextChange();
  }

  function applyContextGlobally() {
    SYNC_GUARD = true;
    var ctx = COCO.flowContext;
    FIELD_MAP.forEach(function (row) {
      var val = ctx[row.ctx];
      if (val == null || val === '') return;
      row.ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) setFieldValue(el, val);
      });
      (row.displayIds || []).forEach(function (id) {
        var el = document.getElementById(id);
        if (el) setFieldValue(el, row.ctx === 'company' ? (ctx.clientName || val) : val);
      });
    });
    if (ctx.dateRange === 'custom') {
      var panel = document.getElementById('sf-date-custom');
      if (panel) panel.style.display = 'flex';
    }
    SYNC_GUARD = false;
    updateContextBar();
    updateHubClientHeader();
    refreshScreenFilters();
    if (window.CocoData && CocoData.onContextChange) CocoData.onContextChange();
  }

  function captureContextFromScreen(screenId) {
    var screen = document.getElementById(screenId);
    if (!screen) return;
    screen.querySelectorAll('select[id], input[id].filter-input, input[id][type="date"]').forEach(function (el) {
      if (!CTX_ID_INDEX[el.id]) return;
      var val = el.value;
      if (val) COCO.flowContext[CTX_ID_INDEX[el.id]] = val;
    });
    var disp = document.getElementById('sf-company-display');
    if (disp && disp.textContent) COCO.flowContext.clientName = disp.textContent.replace(/^🏢\s*/, '').trim();
    saveContext();
  }

  function refreshScreenFilters() {
    var active = document.querySelector('#coco-claude-root .screen.active');
    if (!active) return;
    var id = active.id;
    if (id === 'screen-status' && typeof applyStatusFilter === 'function') applyStatusFilter();
    if (id === 'screen-goals' && typeof applyGoalsAgentFilter === 'function') applyGoalsAgentFilter();
    if (id === 'screen-actions' && typeof applyActFilter === 'function') applyActFilter();
    if (id === 'screen-agents' && typeof applyAgentFilter === 'function') applyAgentFilter();
  }

  function ensureContextBar() {
    var root = document.getElementById('coco-claude-root');
    if (!root || document.getElementById('coco-flow-context-bar')) return;
    var bar = document.createElement('div');
    bar.id = 'coco-flow-context-bar';
    bar.className = 'coco-flow-context-bar';
    bar.innerHTML =
      '<div class="cfc-inner">' +
      '<span class="cfc-label">הקשר פעיל:</span>' +
      '<span id="cfc-client" class="cfc-chip cfc-client"></span>' +
      '<span id="cfc-site" class="cfc-chip"></span>' +
      '<span id="cfc-page" class="cfc-chip"></span>' +
      '<span id="cfc-campaign" class="cfc-chip"></span>' +
      '<span id="cfc-channel" class="cfc-chip"></span>' +
      '<span id="cfc-status" class="cfc-chip"></span>' +
      '<span id="cfc-date" class="cfc-chip"></span>' +
      '<span id="cfc-goal" class="cfc-chip"></span>' +
      '<span id="cfc-agent" class="cfc-chip"></span>' +
      '</div>';
    root.insertBefore(bar, root.firstChild);
  }

  function updateContextBar() {
    var bar = document.getElementById('coco-flow-context-bar');
    if (!bar) return;
    var ctx = COCO.flowContext;
    var hasClient = !!(ctx.clientId || ctx.clientName);
    bar.style.display = hasClient ? '' : 'none';
    if (!hasClient) return;
    function chip(id, label, val) {
      var el = document.getElementById(id);
      if (!el) return;
      el.textContent = val ? (label + ': ' + val) : '';
      el.style.display = val ? '' : 'none';
    }
    chip('cfc-client', 'לקוח', ctx.clientName || ctx.company);
    chip('cfc-site', 'אתר', ctx.site);
    chip('cfc-page', 'עמוד', ctx.page);
    chip('cfc-campaign', 'קמפיין', ctx.campaign);
    chip('cfc-channel', 'ערוץ', ctx.channel);
    chip('cfc-status', 'סטטוס', ctx.status);
    var dateLabel = ctx.dateRange === 'custom' ? (ctx.dateFrom + '–' + ctx.dateTo) : (ctx.dateRange ? ctx.dateRange + ' ימים' : '');
    chip('cfc-date', 'תאריך', dateLabel);
    chip('cfc-goal', 'מטרה', ctx.goal);
    chip('cfc-agent', 'עוזר', ctx.agent);
    if (ctx.clientId) {
      var idBadge = document.getElementById('coco-hub-client-id');
      if (idBadge) { idBadge.textContent = 'ID: ' + ctx.clientId; idBadge.style.display = ''; }
    }
  }

  function updateHubClientHeader() {
    var ctx = COCO.flowContext;
    var nameEl = document.getElementById('coco-hub-client-name');
    var subEl = document.getElementById('coco-hub-client-sub');
    if (nameEl && ctx.clientName) nameEl.textContent = '🏢 ' + ctx.clientName;
    if (subEl && ctx.site) subEl.textContent = (ctx.site) + (ctx.clientId ? (' • ID: ' + ctx.clientId) : '');
  }

  function updateUrlClientId() {
    var id = COCO.flowContext.clientId;
    if (!id || String(id).indexOf('demo-') === 0) return;
    try {
      var u = new URL(location.href);
      u.searchParams.set('customer', id);
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) { /* ignore */ }
  }

  function populateSelectOptions(selectIds, items, valueKey, labelKey) {
    selectIds.forEach(function (sid) {
      var sel = document.getElementById(sid);
      if (!sel) return;
      items.forEach(function (item) {
        var val = typeof item === 'string' ? item : (item[valueKey] || item.name || '');
        var label = typeof item === 'string' ? item : (item[labelKey] || item.name || val);
        if (!val) return;
        var exists = Array.prototype.some.call(sel.options, function (o) {
          return o.value === val || o.text === label;
        });
        if (!exists) {
          var o = document.createElement('option');
          o.value = val;
          o.textContent = label;
          sel.appendChild(o);
        }
      });
    });
  }

  function populateSiteOptions(sites) {
    var siteIds = (FIELD_MAP.find(function (r) { return r.ctx === 'site'; }) || {}).ids || [];
    var domains = (sites || []).map(function (s) { return s.domain || s.site_url; }).filter(Boolean).map(normalizeDomain);
    populateSelectOptions(siteIds, domains);
  }

  function populateCampaignOptions(campaigns) {
    var campIds = (FIELD_MAP.find(function (r) { return r.ctx === 'campaign'; }) || {}).ids || [];
    populateSelectOptions(campIds, campaigns || [], 'name', 'name');
  }

  function applyClientContext(patch) {
    Object.assign(COCO.flowContext, patch);
    if (patch.site) COCO.flowContext.domain = normalizeDomain(patch.site);
    saveContext();
    applyContextGlobally();
    updateUrlClientId();
    if (typeof showToast === 'function' && patch.clientName) {
      showToast('🏢 לקוח פעיל: ' + patch.clientName);
    }
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
    applyContextGlobally();
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
      if (!document.getElementById('screen-hub')) {
        console.warn('CocoClaude.init: screen-hub missing');
        return;
      }
      loadContext();
      ensureContextBar();
      document.body.classList.add('coco-claude-layout');
      applyContextGlobally();
      goScreen('screen-hub');
      this.wireFlowNav();
      this.wireContextListeners();
      this.applyPermissions();
      var cid = COCO.flowContext.clientId;
      if (cid && window.CocoData && CocoData.load) {
        CocoData.load(cid);
      } else if (!cid && !COCO.flowContext.clientName) {
        CocoClaude.bindDemoClient('גרין-טק פתרונות');
        if (window.CocoData && CocoData.load) CocoData.load('demo-greentech');
      }
    },
    onScreenChange: function (id) {
      this.updateFlowButtons(id);
      applyContextGlobally();
      if (window.CocoData && CocoData.bindScreen) CocoData.bindScreen(id);
    },
    wireFlowNav: function () {
      FLOW_CHAIN.forEach(function (sid, idx) {
        if (idx >= FLOW_CHAIN.length - 1) return;
        var nextId = FLOW_CHAIN[idx + 1];
        var screen = document.getElementById(sid);
        if (!screen) return;
        if (!screen || screen.querySelector('.flow-next-bar')) return;
        var bar = document.createElement('div');
        bar.className = 'flow-next-bar';
        bar.style.cssText = 'padding:12px 20px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;';
        var labels = {
          'screen-status': 'מצב נוכחי',
          'screen-clients': 'חברות ולקוחות',
          'screen-goals': 'המטרות',
          'screen-actions': 'הפעולות',
          'screen-history': 'היסטוריה',
          'screen-assets': 'הנכסים הדיגיטליים',
          'screen-ai-decisions': 'AI / קבלת החלטות',
          'screen-reports': 'דוחות'
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
      var root = document.getElementById('coco-claude-root');
      if (!root) return;
      root.addEventListener('change', function (e) {
        var t = e.target;
        if (t && t.id && CTX_ID_INDEX[t.id]) syncFromElement(t);
      });
      root.addEventListener('input', function (e) {
        var t = e.target;
        if (t && t.id && CTX_ID_INDEX[t.id] && t.tagName === 'INPUT') syncFromElement(t);
      });
    },
    setClientId: function (id) {
      COCO.flowContext.clientId = id;
      saveContext();
      updateContextBar();
      updateUrlClientId();
    },
    bindDemoClient: function (nameKey) {
      var demo = DEMO_CLIENTS[nameKey];
      if (!demo) {
        COCO.flowContext.clientName = nameKey;
        COCO.flowContext.company = nameKey;
        saveContext();
        applyContextGlobally();
        return;
      }
      applyClientContext({
        clientId: demo.id,
        clientName: demo.name,
        company: demo.company,
        site: demo.site,
        domain: demo.site
      });
      if (demo.sub) {
        var subEl = document.getElementById('coco-hub-client-sub');
        if (subEl) subEl.textContent = demo.sub;
      }
    },
    bindClientFromDalia: function (bundle) {
      if (!bundle || !bundle.customer) return;
      var c = bundle.customer;
      var p = bundle.profile || {};
      var sites = bundle.sites || [];
      var campaigns = bundle.campaigns || [];
      var primary = sites.find(function (s) { return s.site_type !== 'landing'; }) || sites[0];
      var siteVal = primary ? normalizeDomain(primary.domain || primary.site_url || '') : normalizeDomain(p.website || '');
      populateSiteOptions(sites);
      populateCampaignOptions(campaigns);
      applyClientContext({
        clientId: c.id,
        clientName: c.name || '',
        company: resolveCompanySlug(c.name) || COCO.flowContext.company,
        site: siteVal,
        domain: siteVal
      });
      if (window.CocoData && CocoData.setBundle) CocoData.setBundle(bundle);
    },
    bindClientData: function (data) {
      if (!data) return;
      var c = data.client || data.customer || data;
      if (c.id) COCO.flowContext.clientId = c.id;
      if (c.name) {
        COCO.flowContext.clientName = c.name;
        COCO.flowContext.company = c.name;
      }
      saveContext();
      applyContextGlobally();
    },
    applyContextGlobally: applyContextGlobally,
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
