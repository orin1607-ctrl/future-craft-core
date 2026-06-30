/**
 * Website Builder Wizard — staging foundation stabilization.
 */
(function () {
  'use strict';

  var strategyRoot = null;
  var builderRoot = null;
  var TOTAL_STEPS = 8;
  var SHELL_HTML = `
<div class="tb">
  <div style="font-size:13px;font-weight:800;">🌐 Website Builder AI</div>
  <div style="display:flex;gap:8px;align-items:center;">
    <span id="wb-company" style="font-size:11px;color:var(--w50);"></span>
    <button class="btn btn-g" style="padding:4px 10px;font-size:11px;" onclick="closeWebsiteBuilder()">חזרה לאסטרטגיה</button>
  </div>
</div>
<div class="wiz">
  <div id="wb-steps" class="steps"></div>
  <div class="pb"><div id="wb-pf" class="pf"></div></div>
</div>
<div class="main">
  <div class="pane on" id="w1">
    <div class="t">1. ניתוח עסקי ואפיון אתר</div>
    <div class="s">המערכת קוראת את Business Context ומתרגמת אותו לאסטרטגיית אתר.</div>
    <div class="card">
      <div class="kpi">
        <div class="pill">עסק: <span id="wb-k-company">—</span></div>
        <div class="pill">שירות מרכזי: <span id="wb-k-service">—</span></div>
        <div class="pill">אתר קיים: <span id="wb-k-site">—</span></div>
        <div class="pill">תקציב: <span id="wb-k-budget">—</span></div>
      </div>
    </div>
    <div class="card"><div id="wb-analysis-log" class="s">מוכן לניתוח.</div></div>
  </div>

  <div class="pane" id="w2">
    <div class="t">2. מבנה אתר (Site Map)</div>
    <div class="s">מבנה מומלץ בהתאם ליעדים העסקיים.</div>
    <div class="card"><textarea id="wb-structure" class="ta">בית
שירותים
אודות
צור קשר</textarea></div>
  </div>

  <div class="pane" id="w3">
    <div class="t">3. יצירת תוכן שיווקי</div>
    <div class="s">טיוטת מסרים ראשיים, כותרות ותועלות.</div>
    <div class="card"><textarea id="wb-content" class="ta">כותרת ראשית: פתרונות חכמים לניהול ותפעול צי רכב
תת כותרת: חיסכון בעלויות, שליטה מלאה ושירות מקצועי 24/7
CTA: קבלו אפיון ללא התחייבות</textarea></div>
  </div>

  <div class="pane" id="w4">
    <div class="t">4. עיצוב וחווית משתמש</div>
    <div class="s">הגדרת קו עיצוב בסיסי בהתאם למותג (ללא שינוי עיצוב פלטפורמה).</div>
    <div class="card"><textarea id="wb-design" class="ta">סגנון: מקצועי נקי
צבעים: מתוך נתוני המותג בלבד
טיפוגרפיה: Heebo
דגש: קריאות גבוהה במובייל</textarea></div>
  </div>

  <div class="pane" id="w5">
    <div class="t">5. SEO On-Page</div>
    <div class="s">מיפוי מטא-דאטה בסיסי ומילות מפתח.</div>
    <div class="card"><textarea id="wb-seo" class="ta">Title: ניהול צי רכב לעסקים | דליה
Description: פתרונות ניהול ותחזוקת צי רכב לעסקים בכל הארץ.
Keywords: ניהול צי רכב, תפעול צי, GPS לצי</textarea></div>
  </div>

  <div class="pane" id="w6">
    <div class="t">6. תצוגה מקדימה מהירה</div>
    <div class="s">בדיקה לפני יצירת אתר preview מלא.</div>
    <div class="card">
      <div class="info alt">השלב הבא מציג סיכום מלא: כמה עמודים ייבנו, מה כל עמוד מכיל, מילות מפתח ומטרות לכל עמוד.</div>
      <div id="wb-preview" style="margin-top:10px;color:var(--w80);font-size:12px;"></div>
    </div>
  </div>

  <div class="pane" id="w7">
    <div class="t">7. סיכום לפני בנייה</div>
    <div class="s">אישור מפורט של המבנה והתוכן לפני "צור אתר".</div>
    <div class="card">
      <div id="wb-summary" style="font-size:12px;color:var(--w80);line-height:1.8;"></div>
    </div>
  </div>

  <div class="pane" id="w8">
    <div class="t">8. יצירת אתר Preview מלא</div>
    <div class="s">יצירת אתר רב-עמודי מלא לניווט, עם הערות לכל עמוד ולינק זמני לשיתוף.</div>
    <div class="card"><div id="wb-deploy-status" class="warn alt">ממתין ללחיצה על "צור אתר".</div></div>
    <div class="card"><pre id="wb-json" style="font-size:10px;color:#93c5fd;line-height:1.7;white-space:pre-wrap;"></pre></div>
    <div id="wb-complete" style="display:none;">
      <div class="card">
        <div class="ok alt">✅ נוצר אתר Preview מלא (רב-עמודי) עם ניווט והערות.</div>
        <div style="margin-top:10px;font-size:11px;color:var(--w50);" id="wb-complete-note"></div>
      </div>
      <div class="card">
        <div class="pill">לינק שיתוף זמני (מבנה GitHub Pages): <span id="wb-share-url">—</span></div>
      </div>
      <div class="card">
        <label style="display:flex;gap:8px;align-items:flex-start;color:var(--w80);font-size:12px;">
          <input type="checkbox" id="wb-approval-check" onchange="wbToggleApproval(this.checked)" />
          אני מאשר/ת שה-preview נבדק מלא (עמודים/תפריט/כותרת/פוטר/הערות) לפני המשך לעוזרים.
        </label>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
        <button class="btn btn-p" onclick="wbOpenFullPreview()">פתח אתר Preview מלא</button>
        <button class="btn btn-p" id="wb-continue-btn" onclick="wbContinueToAgents()" disabled>המשך לעוזרים</button>
        <button class="btn btn-g" onclick="wbGo(7)">חזרה לסיכום</button>
      </div>
    </div>
  </div>
</div>
<div class="footer">
  <div id="wb-hint" style="font-size:11px;color:var(--w50);">שלב 1 מתוך 8</div>
  <div style="display:flex;gap:8px;">
    <button class="btn btn-g" id="wb-back" onclick="wbPrev()" style="display:none;">← חזרה</button>
    <button class="btn btn-p" id="wb-next" onclick="wbNext()">הבא ←</button>
  </div>
</div>
<div id="wb-toast"></div>`;

  var WB_STEPS = ['ניתוח', 'מבנה', 'תוכן', 'עיצוב', 'SEO', 'תצוגה', 'סיכום', 'בנייה'];
  var WB = { tab: 1, context: null, strategy: null, output: {}, built: false, approved: false, previewSite: null };

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function slugify(value) {
    var txt = String(value || '').trim().toLowerCase();
    txt = txt.replace(/[\u0590-\u05FF]/g, '');
    txt = txt.replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return txt || 'client-preview';
  }

  function parseLines(raw) {
    return String(raw || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function unique(arr) {
    var out = [];
    arr.forEach(function (x) { if (x && out.indexOf(x) < 0) out.push(x); });
    return out;
  }

  function ensureMandatoryPages(rawPages) {
    var pages = rawPages.slice();
    var required = ['בית', 'אודות', 'שירותים', 'צור קשר'];
    required.forEach(function (title) {
      if (!pages.some(function (p) { return p.title === title; })) {
        pages.push({ title: title, slug: slugify(title) });
      }
    });
    return pages;
  }

  function normalizePageSlugs(pages) {
    var used = {};
    return pages.map(function (p, index) {
      var base = slugify(p.title);
      if (!base || base === 'client-preview') base = 'page-' + (index + 1);
      var slug = base;
      var n = 2;
      while (used[slug]) {
        slug = base + '-' + n;
        n += 1;
      }
      used[slug] = true;
      return { title: p.title, slug: slug };
    });
  }

  function extractSeoKeywords() {
    var seoLines = parseLines(document.getElementById('wb-seo').value || '');
    var line = seoLines.find(function (x) { return /^keywords\s*:/i.test(x); }) || '';
    return unique(line.replace(/^keywords\s*:/i, '').split(',').map(function (k) { return k.trim(); }).filter(Boolean));
  }

  function readExportHints() {
    var actions = parseLs('coco-business-strategy-actions-v1');
    if (!Array.isArray(actions)) return [];
    return actions.map(function (a) { return (a && (a.name || a.description)) ? (a.name + ' — ' + (a.description || '')) : ''; }).filter(Boolean).slice(0, 8);
  }

  function inferPurpose(title, service) {
    var t = String(title || '');
    if (/בית|home/i.test(t)) return 'דף נחיתה מרכזי להצגת הערך והנעה לפעולה.';
    if (/אודות|about/i.test(t)) return 'בניית אמון דרך הצגת החברה, ניסיון ויתרון תחרותי.';
    if (/שירות|service/i.test(t)) return 'פירוט השירותים והפתרונות העסקיים.';
    if (/צור קשר|contact/i.test(t)) return 'המרה לליד: יצירת קשר, טופס וקריאה לפעולה.';
    return 'תמיכה ב-SEO והרחבת נוכחות השירות: ' + service + '.';
  }

  function buildPlanFromCurrentInputs() {
    var structureLines = parseLines(document.getElementById('wb-structure').value || '');
    var contentLines = parseLines(document.getElementById('wb-content').value || '');
    var siteKeywords = unique(
      (WB.strategy && WB.strategy.strategy && WB.strategy.strategy.focusKeywords) ||
      (WB.strategy && WB.strategy.siteScan && WB.strategy.siteScan.topKeywords) ||
      []
    ).concat(extractSeoKeywords());
    siteKeywords = unique(siteKeywords).slice(0, 12);

    var pages = structureLines.map(function (x) { return { title: x, slug: '' }; });
    pages = ensureMandatoryPages(unique(pages.map(function (p) { return p.title; })).map(function (t) { return { title: t, slug: '' }; }));
    pages = normalizePageSlugs(pages);

    if (siteKeywords.length >= 4) {
      var seoPage = { title: 'פתרונות לפי מילות מפתח', slug: 'seo-keywords' };
      if (!pages.some(function (p) { return p.slug === seoPage.slug; })) pages.push(seoPage);
    }

    var service = WB.strategy.mainService || WB.context.mainService || 'השירות המרכזי';
    var pagePlan = pages.map(function (p, index) {
      var baseKeywords = siteKeywords.slice(index, index + 4);
      if (!baseKeywords.length) baseKeywords = siteKeywords.slice(0, 4);
      return {
        title: p.title,
        slug: p.slug || ('page-' + (index + 1)),
        purpose: inferPurpose(p.title, service),
        keywords: baseKeywords,
        sections: contentLines.slice(0, 4),
      };
    });

    return {
      company: WB.strategy.company || WB.context.name || 'העסק שלך',
      site: WB.strategy.site || WB.context.site || '',
      service: service,
      clientId: WB.strategy.clientId || 'temp-client',
      slug: slugify((WB.strategy.clientId || WB.strategy.company || WB.context.name || 'client-site')),
      pages: pagePlan,
      keywordPool: siteKeywords,
      actionHints: readExportHints(),
      generatedAt: new Date().toISOString(),
    };
  }

  function generatePageHtml(sitePlan, page, linkResolver) {
    var navHtml = sitePlan.pages.map(function (p) {
      var href = linkResolver(p);
      var activeStyle = p.slug === page.slug ? 'font-weight:700;text-decoration:underline;' : '';
      return '<a href="' + esc(href) + '" style="color:#fff;text-decoration:none;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.14);' + activeStyle + '">' + esc(p.title) + '</a>';
    }).join(' ');
    var kw = (page.keywords || []).map(function (k) { return '<span style="display:inline-block;padding:4px 8px;border:1px solid #dbeafe;border-radius:999px;margin:0 6px 6px 0;">' + esc(k) + '</span>'; }).join('');
    var sections = (page.sections || []).map(function (s) { return '<li style="margin-bottom:6px;">' + esc(s) + '</li>'; }).join('');
    var noteKey = 'coco-preview-notes-' + sitePlan.slug + '-' + page.slug;

    return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + esc(sitePlan.company) + ' | ' + esc(page.title) + '</title>' +
      '<meta name="description" content="' + esc(page.purpose) + '">' +
      '<meta name="keywords" content="' + esc((page.keywords || []).join(', ')) + '">' +
      '<style>body{font-family:Heebo,Arial,sans-serif;margin:0;background:#f7f9fc;color:#111827}header{background:#0b1735;color:#fff;padding:18px}main{max-width:980px;margin:0 auto;padding:20px}section{background:#fff;border:1px solid #dbe3f0;border-radius:12px;padding:16px;margin-bottom:14px}footer{background:#0f172a;color:#fff;padding:16px;text-align:center}textarea{width:100%;min-height:90px;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font-family:inherit}.btn{border:0;border-radius:8px;padding:8px 12px;background:#0b1735;color:#fff;cursor:pointer}</style>' +
      '</head><body>' +
      '<header><div style="font-size:24px;font-weight:800;">' + esc(sitePlan.company) + '</div><div style="margin-top:6px;">' + esc(sitePlan.service) + '</div><nav style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap;">' + navHtml + '</nav></header>' +
      '<main>' +
      '<section><h1 style="margin-top:0;">' + esc(page.title) + '</h1><p>' + esc(page.purpose) + '</p></section>' +
      '<section><h2 style="margin-top:0;">מה העמוד כולל</h2><ul>' + (sections || '<li>תוכן יותאם לפי הקשר עסקי בזמן build.</li>') + '</ul></section>' +
      '<section><h2 style="margin-top:0;">מילות מפתח לעמוד</h2><div>' + (kw || 'אין מילות מפתח זמינות.') + '</div></section>' +
      '<section><h2 style="margin-top:0;">הערות ללקוח על עמוד זה</h2><textarea id="preview-notes" placeholder="הערות שיפור עבור עמוד זה..."></textarea><div style="margin-top:8px;"><button class="btn" id="save-note">שמור הערה</button></div></section>' +
      '</main>' +
      '<footer>Preview זמני בלבד · נתיב עתידי לשיתוף: /client-previews/' + esc(sitePlan.slug) + '/index.html</footer>' +
      '<script>(function(){var key=' + JSON.stringify(noteKey) + ';var ta=document.getElementById("preview-notes");var btn=document.getElementById("save-note");try{ta.value=localStorage.getItem(key)||"";}catch(e){}if(btn){btn.addEventListener("click",function(){try{localStorage.setItem(key,ta.value||"");alert("הערה נשמרה");}catch(e){}});}})();</script>' +
      '</body></html>';
  }

  function buildBlobPreviewSite(sitePlan) {
    var pages = sitePlan.pages.map(function (p, idx) {
      var fileName = idx === 0 ? 'index.html' : (p.slug + '.html');
      return { title: p.title, slug: p.slug, fileName: fileName, purpose: p.purpose, keywords: p.keywords, sections: p.sections, blobUrl: '' };
    });
    var linkMap = {};
    pages.forEach(function (p) { linkMap[p.slug] = '#'; });
    pages.forEach(function (p) {
      var html = generatePageHtml(sitePlan, p, function (navPage) { return linkMap[navPage.slug] || '#'; });
      var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      p.blobUrl = URL.createObjectURL(blob);
      linkMap[p.slug] = p.blobUrl;
    });
    pages.forEach(function (p) {
      URL.revokeObjectURL(p.blobUrl);
      var html = generatePageHtml(sitePlan, p, function (navPage) { return linkMap[navPage.slug] || '#'; });
      p.blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    });
    return {
      mode: 'blob-runtime',
      slug: sitePlan.slug,
      pages: pages,
      previewPath: '/client-previews/' + sitePlan.slug + '/index.html',
      openedAt: new Date().toISOString(),
    };
  }

  function fillPreview() {
    var plan = buildPlanFromCurrentInputs();
    var txt = [
      'עמודים מתוכננים: ' + plan.pages.length,
      'שמות עמודים: ' + plan.pages.map(function (p) { return p.title; }).join(' | '),
      'שירות מוביל: ' + plan.service,
      'מילות מפתח כלליות: ' + (plan.keywordPool.slice(0, 6).join(', ') || '—'),
    ];
    document.getElementById('wb-preview').innerHTML = txt.map(function (x) { return '<div style="margin-bottom:6px;">• ' + esc(x) + '</div>'; }).join('');
  }

  function renderPreBuildSummary() {
    var plan = buildPlanFromCurrentInputs();
    var html = '<div style="margin-bottom:10px;">המערכת תבנה <strong>' + plan.pages.length + '</strong> עמודים עבור <strong>' + esc(plan.company) + '</strong>.</div>';
    html += '<div style="margin-bottom:8px;"><strong>מבנה מלא:</strong> ' + plan.pages.map(function (p) { return esc(p.title); }).join(' → ') + '</div>';
    html += plan.pages.map(function (page, idx) {
      return '<div style="padding:10px;border:1px solid var(--w10);border-radius:8px;margin-bottom:8px;">' +
        '<div style="font-weight:700;">' + (idx + 1) + '. ' + esc(page.title) + '</div>' +
        '<div>מטרה: ' + esc(page.purpose) + '</div>' +
        '<div>מילות מפתח: ' + esc((page.keywords || []).join(', ') || '—') + '</div>' +
        '<div>תוכן: ' + esc((page.sections || []).join(' | ') || '—') + '</div>' +
      '</div>';
    }).join('');
    if (plan.actionHints.length) {
      html += '<div style="margin-top:10px;"><strong>הקשר אסטרטגי שהוזרם:</strong><br>' + plan.actionHints.map(function (x) { return '• ' + esc(x); }).join('<br>') + '</div>';
    }
    document.getElementById('wb-summary').innerHTML = html;
  }

  function buildDeployPayload() {
    var plan = buildPlanFromCurrentInputs();
    WB.output = {
      at: new Date().toISOString(),
      company: WB.strategy.company || WB.context.name || '',
      site: WB.strategy.site || WB.context.site || '',
      structure: document.getElementById('wb-structure').value,
      content: document.getElementById('wb-content').value,
      design: document.getElementById('wb-design').value,
      seo: document.getElementById('wb-seo').value,
      buildMode: 'preview-full-multipage',
      architecture: {
        platformStoresOnly: ['clientName', 'previewUrl', 'productionUrl', 'repo', 'commit', 'status'],
        clientSiteOnDalia: false,
        tempPreviewPath: '/client-previews/' + plan.slug + '/',
      },
      summaryPlan: plan,
    };
    document.getElementById('wb-deploy-status').className = 'warn alt';
    document.getElementById('wb-deploy-status').textContent = 'מוכן ליצירת אתר Preview מלא. בלחיצה על "צור אתר" ייווצרו כל העמודים.';
    document.getElementById('wb-json').textContent = JSON.stringify(WB.output, null, 2);
  }

  function renderCompletionPreview() {
    buildDeployPayload();
    var sitePlan = WB.output.summaryPlan;
    var site = buildBlobPreviewSite(sitePlan);
    WB.previewSite = site;
    WB.output.previewSite = {
      mode: site.mode,
      slug: site.slug,
      pagesCount: site.pages.length,
      previewPath: site.previewPath,
      shareUrlPattern: site.previewPath,
      approved: false,
    };
    WB.output.previewBuiltAt = new Date().toISOString();
    WB.output.deployStatus = 'preview_generated';
    var status = document.getElementById('wb-deploy-status');
    status.className = 'ok alt';
    status.textContent = '✅ האתר נבנה כ-Preview רב-עמודי מלא עם ניווט והערות לכל עמוד.';
    document.getElementById('wb-json').textContent = JSON.stringify(WB.output, null, 2);
    var note = document.getElementById('wb-complete-note');
    if (note) note.textContent = 'זהו preview זמני לבדיקת לקוח. פרודקשן ייפרס רק לריפו/דומיין של הלקוח.';
    var share = document.getElementById('wb-share-url');
    if (share) share.textContent = WB.output.previewSite.shareUrlPattern;
    var complete = document.getElementById('wb-complete');
    if (complete) complete.style.display = '';
    WB.built = true;
    WB.approved = false;
    wbToggleApproval(false);
  }

  function persistOutput() {
    try {
      localStorage.setItem('coco-website-builder-last-output-v1', JSON.stringify(WB.output));
      localStorage.setItem('coco-website-builder-last-context-v1', JSON.stringify({
        dalia_biz: WB.context || null,
        business_context: WB.strategy || null,
      }));
      localStorage.setItem('coco-website-builder-preview-site-v1', JSON.stringify(WB.previewSite || null));
      localStorage.setItem('coco-website-builder-preview-site-slug-v1', (WB.previewSite && WB.previewSite.slug) || '');
    } catch (e) { /* ignore */ }
  }

  function wbGo(step) {
    WB.tab = step;
    document.querySelectorAll('#website-builder-root .pane').forEach(function (p) { p.classList.remove('on'); });
    var pane = document.getElementById('w' + step);
    if (pane) pane.classList.add('on');
    for (var i = 1; i <= TOTAL_STEPS; i += 1) {
      var s = document.getElementById('wbs' + i);
      if (!s) continue;
      s.className = 'step ' + (i < step ? 'done' : i === step ? 'on' : '');
      var sn = s.querySelector('.sn');
      if (sn) sn.textContent = i < step ? '✓' : String(i);
    }
    document.getElementById('wb-pf').style.width = ((step / TOTAL_STEPS) * 100) + '%';
    document.getElementById('wb-back').style.display = step > 1 ? '' : 'none';
    document.getElementById('wb-next').textContent = step === TOTAL_STEPS ? '✅ צור אתר Preview מלא' : 'הבא ←';
    document.getElementById('wb-hint').textContent = 'שלב ' + step + ' מתוך ' + TOTAL_STEPS;
    if (step === 6) fillPreview();
    if (step === 7) renderPreBuildSummary();
    if (step === 8) buildDeployPayload();
    window.scrollTo(0, 0);
  }

  function wbPrev() { if (WB.tab > 1) wbGo(WB.tab - 1); }

  function wbNext() {
    if (WB.tab < TOTAL_STEPS) { wbGo(WB.tab + 1); return; }
    renderCompletionPreview();
    persistOutput();
    wbToast('✅ Preview מלא נוצר. בדוק/י ואשר/י לפני מעבר לעוזרים.');
  }

  function wbOpenFullPreview() {
    if (!WB.previewSite || !Array.isArray(WB.previewSite.pages) || !WB.previewSite.pages.length) {
      wbToast('לא נמצא preview פתוח.');
      return;
    }
    var indexPage = WB.previewSite.pages.find(function (p) { return p.fileName === 'index.html'; }) || WB.previewSite.pages[0];
    if (!indexPage || !indexPage.blobUrl) {
      wbToast('לא נמצא קובץ index ל-preview.');
      return;
    }
    window.open(indexPage.blobUrl, '_blank', 'noopener');
  }

  function wbToggleApproval(checked) {
    WB.approved = !!checked;
    if (WB.output && WB.output.previewSite) WB.output.previewSite.approved = WB.approved;
    var btn = document.getElementById('wb-continue-btn');
    if (btn) btn.disabled = !WB.approved;
    persistOutput();
  }

  function wbContinueToAgents() {
    if (!WB.approved) {
      wbToast('יש לאשר preview לפני המשך לעוזרים.');
      return;
    }
    persistOutput();
    if (typeof goScreen === 'function') goScreen('screen-agents');
    wbToast('🚀 הועבר לעוזרים לאחר אישור Preview.');
  }

  function wbToast(msg) {
    var t = document.getElementById('wb-toast');
    if (!t) return;
    t.textContent = msg;
    t.style.opacity = '1';
    t.style.transform = 'translateY(0)';
    setTimeout(function () {
      t.style.opacity = '0';
      t.style.transform = 'translateY(10px)';
    }, 2200);
  }

  function runAnalysisLog() {
    var lines = [
      'קורא הקשר עסקי מ-dalia_biz',
      'מאמת Business Context מ-coco-business-context-v1',
      'מייצר מבנה אתר לפי שירות וקהל יעד',
      'מכין תבנית רב-עמודית ל-preview מלא',
    ];
    var box = document.getElementById('wb-analysis-log');
    if (!box) return;
    var i = 0;
    box.innerHTML = '';
    var timer = setInterval(function () {
      if (i >= lines.length) { clearInterval(timer); return; }
      box.innerHTML += '<div>• ' + lines[i] + '</div>';
      i += 1;
    }, 300);
  }

  function buildStepBar() {
    var el = document.getElementById('wb-steps');
    if (!el) return;
    el.innerHTML = WB_STEPS.map(function (name, i) {
      return '<div class="step ' + (i === 0 ? 'on' : '') + '" id="wbs' + (i + 1) + '"><div class="sn">' + (i + 1) + '</div>' + name + '</div>';
    }).join('');
  }

  function wbInit() {
    var rawBiz = parseLs('dalia_biz');
    var rawCtx = parseLs('coco-business-context-v1');
    WB.context = rawBiz || {};
    WB.strategy = rawCtx || {};
    WB.output = {};
    WB.built = false;
    WB.approved = false;
    WB.previewSite = null;
    window.WB = WB;
    document.getElementById('wb-company').textContent = WB.context.name || WB.strategy.company || 'עסק לא מזוהה';
    document.getElementById('wb-k-company').textContent = WB.strategy.company || WB.context.name || '—';
    document.getElementById('wb-k-service').textContent = WB.strategy.mainService || WB.context.mainService || '—';
    document.getElementById('wb-k-site').textContent = WB.strategy.site || WB.context.site || '—';
    document.getElementById('wb-k-budget').textContent = WB.strategy.budget || WB.context.budget || '—';
    var complete = document.getElementById('wb-complete');
    if (complete) complete.style.display = 'none';
    buildStepBar();
    runAnalysisLog();
    wbGo(1);
  }

  function setFabVisibility(hidden) {
    var fab = document.getElementById('cocoAiFab');
    if (!fab) return;
    if (hidden) {
      if (!fab.getAttribute('data-wb-prev-display')) {
        fab.setAttribute('data-wb-prev-display', fab.style.display || '');
      }
      fab.style.display = 'none';
      return;
    }
    var prev = fab.getAttribute('data-wb-prev-display');
    fab.style.display = prev == null ? '' : prev;
    fab.removeAttribute('data-wb-prev-display');
  }

  function mountBuilder() {
    strategyRoot = document.getElementById('biz-strategy-root');
    builderRoot = document.getElementById('website-builder-root');
    if (!builderRoot) return Promise.resolve(false);
    builderRoot.innerHTML = SHELL_HTML;
    builderRoot.classList.add('wb-wiz');
    if (strategyRoot) strategyRoot.style.display = 'none';
    builderRoot.style.display = '';
    setFabVisibility(true);
    wbInit();
    return Promise.resolve(true);
  }

  function closeBuilder() {
    strategyRoot = document.getElementById('biz-strategy-root');
    builderRoot = document.getElementById('website-builder-root');
    if (builderRoot) {
      builderRoot.style.display = 'none';
      builderRoot.innerHTML = '';
    }
    if (strategyRoot) {
      strategyRoot.style.display = '';
      strategyRoot.classList.add('biz-wiz');
    }
    setFabVisibility(false);
  }

  function openBuilder() {
    if (typeof goScreen === 'function') goScreen('screen-business-strategy');
    return mountBuilder();
  }

  window.wbGo = wbGo;
  window.wbPrev = wbPrev;
  window.wbNext = wbNext;
  window.wbOpenFullPreview = wbOpenFullPreview;
  window.wbToggleApproval = wbToggleApproval;
  window.wbContinueToAgents = wbContinueToAgents;
  window.closeWebsiteBuilder = closeBuilder;
  window.WebsiteBuilderWizard = {
    VERSION: '2.0.0-foundation-stabilized',
    open: openBuilder,
    close: closeBuilder,
    mount: mountBuilder,
  };
})();
