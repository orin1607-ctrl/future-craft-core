/**
 * יצירת תוכן — free-language brief through ready-for-approval.
 * Unit checks are local. The browser path mocks Gemini with the live error
 * when billing blocks it, and never treats a blocked write as success.
 * It does not POST to dalia-c.com.
 */
import { createServer } from 'http';
import { readFile, writeFile } from 'fs/promises';
import { writeFileSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import vm from 'vm';
import { createRequire } from 'module';

const ROOT = new URL('../public/', import.meta.url);
const OUT = '/tmp/content-brief-qa';
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

const briefSrc = await readFile(new URL('./openseo-content-brief.js', ROOT), 'utf8');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(briefSrc, sandbox);
const CB = sandbox.window.ContentBrief;

const EXAMPLE = 'תכין לי עמוד חדש בנושא ניהול צי רכב לעסקים. תבדוק מה צריך להיות בעמוד, תכין תוכן מלא, SEO ותמונות ותראה לי אותו לפני העלאה.';
const parsed = CB.parseBrief(EXAMPLE);
check('page type', parsed.contentType === 'page', parsed.contentType);
check('topic', parsed.topic === 'ניהול צי רכב לעסקים', parsed.topic);
check('no explicit keyword', parsed.keywordExplicit === false);
check('asks for images seo preview and body', parsed.wantsImages && parsed.wantsSeo && parsed.wantsPreview && parsed.wantsFullContent);
check('article instruction', CB.parseBrief('תכתוב מאמר על ביטוח רכב חברה').contentType === 'article');
check('explicit keyword kept', CB.parseBrief('מאמר על מוסך. מילת המפתח: ליסינג תפעולי').keyword === 'ליסינג תפעולי');

const gsc = [
  { kw: 'ניהול צי', real: true, gsc: { impr: 108, clicks: 0 } },
  { kw: 'ניהול צי רכב', real: true, gsc: { impr: 30, clicks: 0 } },
  { kw: 'מערכת לניהול צי רכב', real: true, gsc: { impr: 56, clicks: 0 } },
  { kw: 'דליה', real: true, gsc: { impr: 500, clicks: 9 } },
  { kw: 'מילת הדגמה', real: false, gsc: { impr: 9999, clicks: 0 } }
];
const chosen = CB.chooseKeyword({ brief: parsed, keywords: gsc });
check('keyword from search console', chosen.source === 'search_console' && chosen.keyword === 'ניהול צי רכב', JSON.stringify(chosen));
const explicit = CB.chooseKeyword({ brief: CB.parseBrief('עמוד חדש בנושא צי. מילת המפתח: ליסינג תפעולי'), keywords: gsc });
check('explicit keyword skips research', explicit.source === 'instruction' && explicit.keyword === 'ליסינג תפעולי');

const pages = [
  { real: true, path: '/ניהול-צי-רכב-חכם-לעסקים-שליטה-סדר-ושק/', title: 'ניהול צי רכב חכם לעסקים', h1: 'ניהול צי רכב חכם לעסקים – שליטה, סדר ושקט תפעולי' },
  { real: true, path: '/about/', title: 'אודות', h1: 'קצת עלינו' }
];
const site = CB.checkExisting({ brief: parsed, keyword: chosen.keyword, pages, drafts: [], scanState: 'real' });
check('high overlap on existing fleet page', site.risk === 'high' && site.pages.some(p => p.url.includes('ניהול-צי-רכב-חכם')), site.risk + ' ' + site.pages.map(p => p.path).join(','));
check('demo scan is not a match', CB.checkExisting({ brief: parsed, pages, scanState: 'demo' }).risk === 'unchecked');
const pack = CB.prepare({ text: EXAMPLE, keywords: gsc, pages, drafts: [{ id: 1, title: 'דוגמה מפורסמת', keyword: 'ניהול צי רכב' }], scanState: 'real' });
check('slug from topic', pack.structure.slug === 'ניהול-צי-רכב-לעסקים', pack.structure.slug);
check('meta not invented', pack.structure.meta_description === '');
check('secondary excludes primary and demo', pack.structure.secondaryKeywords.some(k => k.keyword === 'מערכת לניהול צי רכב') && !pack.structure.secondaryKeywords.some(k => k.keyword === 'ניהול צי רכב' || k.keyword === 'מילת הדגמה'));
check('internal link is the real page', pack.structure.internalLinks.some(l => l.url.includes('ניהול-צי-רכב-חכם')));
check('demo post is not a site match', pack.siteCheck.drafts.length === 0);
check('write step is not done before gemini', pack.steps.find(s => s.id === 'write').state === 'pending');
check('images not marked done', pack.steps.find(s => s.id === 'images').state === 'ready');

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzZmVvZXJrcGNhZnh4bHl1bGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ4NTYsImV4cCI6MjA5NDY5MDg1Nn0.Z1AsULSK9fNsVwjw7iRP_DkSodeTUdtb-eB5s66qtJU';
let live = { ok: false, error: 'הבדיקה החיה לא רצה' };
try {
  const res = await fetch('https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/dalia-seo-ai/generate-article', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ANON, apikey: ANON, Origin: 'http://127.0.0.1:5173' },
    body: JSON.stringify({ action: 'outline', keyword: 'בדיקת חיוב', h2_count: 2, length: 'short' })
  });
  live = await res.json().catch(() => ({ ok: false, error: 'תשובה לא JSON', status: res.status }));
  live.http = res.status;
} catch (err) {
  live = { ok: false, error: err.message };
}
writeFileSync(join(OUT, 'gemini-live.json'), JSON.stringify(live, null, 2));
console.log('LIVE GEMINI', JSON.stringify(live).slice(0, 500));
const liveError = live.error || ('סטטוס ' + (live.http || ''));
check('live gemini did not return article html', !(live.ok && live.content_html), liveError);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.mjs': 'text/javascript' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'openseo.html';
  try {
    const buf = await readFile(join(ROOT.pathname, rel));
    res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

let puppeteer;
try { puppeteer = await import('puppeteer-core'); }
catch { puppeteer = await import('/tmp/puppeteer-qa/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'); }

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const pngPath = join(OUT, 'upload.png');
writeFileSync(pngPath, png);
const pngHero = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const pngHeroPath = join(OUT, 'upload-2.png');
writeFileSync(pngHeroPath, pngHero);

const browser = await puppeteer.default.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
const net = [];
page.on('request', (req) => net.push({ method: req.method(), url: req.url() }));
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));
await page.evaluateOnNewDocument((billingError) => {
  const orig = window.fetch.bind(window);
  window.__calls = [];
  window.fetch = async (url, opts) => {
    const u = String(url);
    const body = opts && opts.body ? String(opts.body) : '';
    if (u.includes('generate-article') || u.includes('generate-image') || u.includes('dalia-c.com')) {
      window.__calls.push({ url: u, method: (opts && opts.method) || 'GET', body });
    }
    if (u.includes('generate-article')) {
      return new Response(JSON.stringify({
        ok: false,
        status: 402,
        code: 'BLOCKED_BY_BILLING',
        error: billingError
      }), { status: 402, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.includes('generate-image')) {
      return new Response(JSON.stringify({ ok: false, error: 'image call should not be automatic' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    return orig(url, opts);
  };
}, liveError);

try {
  await page.setViewport({ width: 1360, height: 900 });
  await page.goto(`http://127.0.0.1:${port}/openseo.html#produce`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#briefText');
  await page.waitForFunction(() => {
    const note = document.getElementById('dataNote');
    const text = note ? note.textContent : '';
    return text.includes('Search Console') && text.includes('סריקת האתר ✓');
  }, { timeout: 20000 });
  check('legacy keyword field still exists', await page.$('#pKw') !== null);
  await page.evaluate((text) => {
    const el = document.getElementById('briefText');
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, EXAMPLE);
  await page.click('#briefRunBtn');
  await page.waitForFunction(() => window.S && S.compose && S.compose.brief && !S.produce.busy, { timeout: 15000 });
  const state = await page.evaluate(() => {
    const c = S.compose;
    const step = (id) => c.brief.steps.find(s => s.id === id);
    return {
      type: c.brief.parsed.contentType,
      topic: c.brief.parsed.topic,
      keyword: c.keyword,
      source: c.brief.keyword.source,
      risk: c.brief.siteCheck.risk,
      pages: c.brief.siteCheck.pages.map(p => p.url),
      slug: c.article_plan.slug,
      meta: c.meta_description,
      html: c.content_html,
      write: step('write'),
      images: step('images'),
      slots: (c.article_plan.images.items || []).map(i => ({ role: i.role, src: !!i.src, alt: i.alt })),
      error: S.produce.lastError,
      calls: window.__calls.filter(c => c.url.includes('generate-')).length
    };
  });
  check('understood a new page', state.type === 'page' && state.topic === 'ניהול צי רכב לעסקים', JSON.stringify({ type: state.type, topic: state.topic }));
  check('keyword chosen from real queries', state.source === 'search_console' && state.keyword === 'ניהול צי רכב', state.source + ' ' + state.keyword);
  check('existing site overlap is high', state.risk === 'high' && state.pages.some(u => u.includes('ניהול-צי')), state.risk);
  check('slug prepared', state.slug === 'ניהול-צי-רכב-לעסקים', state.slug);
  check('write stays open and body empty when gemini is blocked', state.write.state === 'ready' && !state.html && /BLOCKED_BY_BILLING|קרדיט|Gemini|billing/i.test((state.error || '') + (state.write.detail || '')), state.error || state.write.detail);
  check('image slots exist without files', state.images.state !== 'done' && state.slots.length >= 2 && state.slots.every(s => !s.src) && state.slots.every(s => s.alt), JSON.stringify(state.slots));
  check('only the blocked outline call was made', state.calls === 1, String(state.calls));
  await page.screenshot({ path: join(OUT, '01-brief-blocked.png'), fullPage: false });

  const fileInput = await page.$('[data-plan-file]');
  await fileInput.uploadFile(pngPath);
  await page.waitForFunction(() => (S.compose.article_plan.images.items || []).some(i => i.src));
  const uploaded = await page.evaluate(() => {
    const step = S.compose.brief.steps.find(s => s.id === 'images');
    const img = S.compose.article_plan.images.items.find(i => i.src);
    return { state: step.state, alt: img.alt, file: img.fileName };
  });
  check('manual upload keeps the step open until every slot has a file', uploaded.state === 'ready' && !!uploaded.alt && uploaded.file === 'upload.png', JSON.stringify(uploaded));

  const pasted = '<h2>מה כולל ניהול צי רכב לעסקים</h2><p>תוכן שהודבק ידנית מבחוץ.</p><h2>איך בוחרים ספק</h2><p>עוד פסקה שנכתבה מחוץ למערכת.</p>';
  await page.$eval('#briefPaste', (el, html) => {
    el.value = html;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, pasted);
  await page.$eval('[data-bf="meta"]', (el) => {
    el.value = 'ניהול צי רכב לעסקים עם סדר, עלויות ודיווח. טקסט ידני.';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const manual = await page.evaluate(() => {
    const step = (id) => S.compose.brief.steps.find(s => s.id === id);
    return {
      write: step('write').state,
      detail: step('write').detail,
      source: S.compose.content_source,
      html: S.compose.content_html,
      seo: step('seo').state,
      meta: S.compose.meta_description,
      ai: !!S.compose.aiDraft
    };
  });
  check('pasted content counts as manual writing', manual.write === 'done' && manual.source === 'manual' && manual.html.includes('הודבק ידנית') && manual.ai === false && /לא נוצר ב-Gemini/.test(manual.detail), manual.detail);
  check('seo is done only after meta is filled by hand', manual.seo === 'done' && manual.meta.includes('טקסט ידני'), manual.seo + ' ' + manual.meta);
  check('paste field stays editable without gemini', await page.$eval('#briefPaste', (el) => !el.disabled && !el.readOnly));
  check('content gallery button is visible', await page.$eval('#openContentGallery', (el) => el.textContent.trim()) === 'גלריית תמונות');

  await page.click('#openContentGallery');
  await page.waitForFunction(() => {
    const dlg = document.getElementById('contentGalleryDlg');
    return dlg && dlg.open && [...dlg.querySelectorAll('.content-gal-card')].some(el => (el.textContent || '').includes('upload.png'));
  });
  const placed = await page.evaluate(() => {
    const card = [...document.querySelectorAll('#contentGalleryDlg .content-gal-card')].find(el => (el.textContent || '').includes('upload.png'));
    if (!card) return { ok: false, reason: 'gallery card missing' };
    const gid = card.getAttribute('data-gid');
    const slot = card.querySelector('[data-gal-slot]');
    const alt = card.querySelector('[data-gal-alt]');
    const options = [...slot.options].map(o => o.value);
    slot.value = 'after_h2_0';
    alt.value = 'צי רכב בחניון החברה';
    alt.dispatchEvent(new Event('input', { bubbles: true }));
    card.querySelector('[data-act="galleryPlace"]:not([data-gmode])').click();
    const items = S.compose.article_plan.images.items;
    const live = document.getElementById('galleryLivePreview');
    return {
      ok: true,
      gid,
      options,
      roles: items.map(i => ({ role: i.role, placement: i.placement, src: !!i.src, alt: i.alt })),
      images: S.compose.brief.steps.find(s => s.id === 'images').state,
      live: live ? live.textContent : '',
      liveImgs: live ? live.querySelectorAll('img').length : 0,
      open: document.getElementById('contentGalleryDlg').open
    };
  });
  check('gallery image is placed inside the article', placed.ok && placed.open && placed.options.includes('after_h2_0') && placed.roles.some(i => i.placement === 'after_h2' && i.alt === 'צי רכב בחניון החברה' && i.src) && placed.roles.some(i => i.role === 'hero' && i.src) && placed.images === 'done', JSON.stringify(placed));
  check('gallery selection shows in the live preview', placed.live.includes('צי רכב בחניון החברה') && placed.liveImgs >= 2, JSON.stringify({ liveImgs: placed.liveImgs, live: placed.live.slice(0, 180) }));

  const replaced = await page.evaluate(() => {
    const inline = S.compose.article_plan.images.items.find(i => i.placement === 'after_h2');
    const card = [...document.querySelectorAll('#contentGalleryDlg .content-gal-card')].find(el => (el.textContent || '').includes('upload.png'));
    const slot = card.querySelector('[data-gal-slot]');
    const alt = card.querySelector('[data-gal-alt]');
    slot.value = 'replace_' + inline.id;
    alt.value = 'צי רכב אחרי החלפה';
    alt.dispatchEvent(new Event('input', { bubbles: true }));
    card.querySelector('[data-act="galleryPlace"]:not([data-gmode])').click();
    const again = S.compose.article_plan.images.items.find(i => i.id === inline.id);
    const live = document.getElementById('galleryLivePreview');
    return { alt: again && again.alt, src: !!(again && again.src), role: again && again.role, placement: again && again.placement, live: live ? live.textContent : '' };
  });
  check('gallery replace keeps the slot and updates alt', replaced.alt === 'צי רכב אחרי החלפה' && replaced.src && replaced.role !== 'hero' && replaced.placement === 'after_h2' && replaced.live.includes('צי רכב אחרי החלפה'), JSON.stringify(replaced));

  const beforeCards = await page.evaluate(() => document.querySelectorAll('#contentGalleryDlg .content-gal-card').length);
  const galInput = await page.$('#contentGalleryDlg .content-gallery-file');
  await galInput.uploadFile(pngHeroPath);
  await page.waitForFunction((n) => document.querySelectorAll('#contentGalleryDlg .content-gal-card').length > n, {}, beforeCards);
  const heroSet = await page.evaluate(() => {
    const card = [...document.querySelectorAll('#contentGalleryDlg .content-gal-card')].find(el => (el.textContent || '').includes('upload-2.png'));
    if (!card) return { ok: false, reason: 'new upload missing' };
    const alt = card.querySelector('[data-gal-alt]');
    alt.value = 'תמונת Hero מהגלריה';
    alt.dispatchEvent(new Event('input', { bubbles: true }));
    card.querySelector('[data-gmode="hero"]').click();
    const hero = S.compose.article_plan.images.items.find(i => i.role === 'hero' || i.placement === 'hero');
    const live = document.getElementById('galleryLivePreview');
    return {
      ok: true,
      file: hero && hero.fileName,
      alt: hero && hero.alt,
      heroes: S.compose.article_plan.images.items.filter(i => i.role === 'hero' || i.placement === 'hero').length,
      live: live ? live.textContent : ''
    };
  });
  check('new gallery upload can be set as hero', heroSet.ok && heroSet.file === 'upload-2.png' && heroSet.alt === 'תמונת Hero מהגלריה' && heroSet.heroes === 1 && heroSet.live.includes('תמונת Hero מהגלריה') && heroSet.live.includes('צי רכב אחרי החלפה'), JSON.stringify(heroSet));

  const removed = await page.evaluate(() => {
    const items = S.compose.article_plan.images.items;
    const start = items.find(i => i.placement === 'start');
    if (!start) return { ok: false, items: items.map(i => ({ id: i.id, role: i.role, placement: i.placement, file: i.fileName })) };
    const btn = document.querySelector(`#contentGalleryDlg [data-act="galleryUnplace"][data-iid="${start.id}"]`);
    if (!btn) return { ok: false, reason: 'unplace missing', id: start.id };
    btn.click();
    const left = S.compose.article_plan.images.items;
    const step = S.compose.brief.steps.find(s => s.id === 'images');
    return {
      ok: true,
      left: left.length,
      filled: left.filter(i => i.src).length,
      state: step.state,
      hasStart: left.some(i => i.placement === 'start'),
      hero: (left.find(i => i.role === 'hero') || {}).fileName,
      bodyAlt: (left.find(i => i.placement === 'after_h2') || {}).alt,
      gallery: [...document.querySelectorAll('#contentGalleryDlg .content-gal-card')].map(el => el.textContent || '').join('\n')
    };
  });
  check('removing an image from the article keeps it in the gallery', removed.ok && removed.left === removed.filled && removed.filled === 2 && removed.state === 'done' && removed.hasStart === false && removed.hero === 'upload-2.png' && removed.bodyAlt === 'צי רכב אחרי החלפה' && removed.gallery.includes('upload.png'), JSON.stringify(removed));

  await page.click('#contentGalleryDlg [data-act="openSocialGallery"]');
  await page.waitForFunction(() => document.getElementById('socialGalleryDlg') && document.getElementById('socialGalleryDlg').open);
  const library = await page.evaluate(() => ({
    src: document.getElementById('contentGalleryFrame').src,
    localOpen: document.getElementById('contentGalleryDlg').open
  }));
  check('social gallery opens the existing media library', library.src.includes('media-library.html') && library.src.includes('pick=1') && library.localOpen, JSON.stringify(library));
  await page.evaluate(() => document.getElementById('socialGalleryClose').click());
  await page.screenshot({ path: join(OUT, '04-gallery.png'), fullPage: false });
  await page.evaluate(() => document.getElementById('contentGalleryClose').click());
  await page.waitForFunction(() => !document.getElementById('contentGalleryDlg').open && !S.galleryOpen);

  await page.$eval('[data-bf="h1"]', (el) => {
    el.value = 'ניהול צי רכב לעסקים — נערך';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('[data-act="sitePreview"]');
  await page.waitForSelector('#briefSeoStrip');
  const preview = await page.evaluate(() => ({
    h1: document.querySelector('.dalia-mock-h1')?.textContent || '',
    strip: document.querySelector('#briefSeoStrip')?.textContent || '',
    body: document.querySelector('.dalia-mock-body')?.textContent || '',
    imgs: document.querySelectorAll('.dalia-mock-body img, .dalia-plan-hero img').length,
    previewStep: S.compose.brief.steps.find(s => s.id === 'preview').state
  }));
  check('preview shows edited h1, slug, hero and placed image', preview.h1.includes('נערך') && preview.strip.includes('ניהול-צי-רכב-לעסקים') && preview.imgs >= 2 && preview.body.includes('צי רכב אחרי החלפה') && preview.previewStep === 'done', JSON.stringify(preview));
  await page.screenshot({ path: join(OUT, '02-preview.png'), fullPage: true });
  await page.click('.site-preview-modal [data-act="close"], .site-preview-bar [data-act="close"]');
  await page.waitForSelector('#briefApproval');

  await page.click('[data-act="approveWpPackage"]');
  const noApprove = await page.evaluate(() => S.compose.wp_package);
  check('approval without the checkbox does nothing', noApprove == null);

  await page.click('#briefApproveCheck');
  await page.click('[data-act="approveWpPackage"]');
  await page.waitForFunction(() => S.compose.wp_package && S.compose.wp_package.readback);
  const approved = await page.evaluate(() => ({
    uploaded: S.compose.wp_package.uploaded,
    published: S.compose.wp_package.published,
    reason: S.compose.wp_package.reason,
    readback: S.compose.wp_package.readback.detail,
    step: S.compose.brief.steps.find(s => s.id === 'approval').state,
    html: S.compose.content_html
  }));
  check('package prepared and not uploaded', approved.uploaded === false && approved.published === false && approved.step === 'prepared' && approved.html.includes('הודבק ידנית'), JSON.stringify(approved));
  check('readback does not claim a new page', /לא נוצר|לא סומן|אין עמוד/.test(approved.readback || ''), approved.readback);

  await page.click('[data-act="localPublishNow"]');
  const published = await page.evaluate(() => {
    const post = POSTS.find(p => p.id === S.compose.id);
    return {
      note: document.getElementById('localReleaseNote')?.textContent || '',
      intent: S.compose.local_release && S.compose.local_release.intent,
      sent: S.compose.local_release && S.compose.local_release.sent_to_site,
      status: post && post.status,
      url: post && post.published_url,
      at: post && post.published_at,
      uploaded: S.compose.wp_package.uploaded
    };
  });
  check('publish now is a local queue and not a live post', published.intent === 'now' && published.sent === false && published.status === 'draft' && !published.url && !published.at && published.uploaded === false && /לא נשלח/.test(published.note), JSON.stringify(published));

  await page.$eval('#briefScheduleAt', (el) => {
    el.value = '2026-10-22T09:30';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('[data-act="localSchedule"]');
  const scheduled = await page.evaluate(() => {
    const post = POSTS.find(p => p.id === S.compose.id);
    return {
      note: document.getElementById('localReleaseNote')?.textContent || '',
      intent: S.compose.local_release && S.compose.local_release.intent,
      sent: S.compose.local_release && S.compose.local_release.sent_to_site,
      when: S.compose.local_release && S.compose.local_release.scheduled_for,
      status: post && post.status,
      url: post && post.published_url
    };
  });
  check('schedule is stored locally and not sent', scheduled.intent === 'schedule' && scheduled.sent === false && scheduled.status === 'scheduled' && !scheduled.url && String(scheduled.when || '').startsWith('2026-10-22') && /לא נשלח/.test(scheduled.note), JSON.stringify(scheduled));
  const imageCalls = await page.evaluate(() => window.__calls.filter(c => c.url.includes('generate-image')).length);
  check('no automatic image generation', imageCalls === 0, String(imageCalls));
  const writes = net.filter(r => r.method !== 'GET' && /dalia-c\.com/.test(r.url));
  check('no write request to dalia-c.com', writes.length === 0, writes.map(r => r.method + ' ' + r.url).join(' | '));
  await page.screenshot({ path: join(OUT, '03-ready.png'), fullPage: false });

  await page.click('[data-act="openWpPreview"]');
  await page.waitForFunction(() => document.body.innerText.includes('אין טיוטה ב-WordPress'));
  check('wordpress preview does not borrow draft 6255', !(await page.evaluate(() => document.body.innerText.includes('טיוטה #6255'))));
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  check('browser flow', false, err.stack || err.message);
  await page.screenshot({ path: join(OUT, 'fail.png'), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter(r => !r.ok);
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ failed: failed.length, live, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
