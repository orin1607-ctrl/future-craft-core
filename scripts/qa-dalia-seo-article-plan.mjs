/**
 * QA for Dalia SEO → יצירת תוכן → תוכנית מאמר (staging UI only).
 * Does not call WordPress, Imagen, or a live image model.
 * Live Gemini is mocked in the browser. Service helpers are checked offline.
 */
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const ROOT = new URL('../public/', import.meta.url);
const OUT = '/tmp/dalia-seo-article-plan-qa';
mkdirSync(OUT, { recursive: true });

const { stripGeneratedImages, normalizeOutlineHeadings, generateArticleWithGemini } = await import('./project-001/gemini-article-service.mjs');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

const stripped = stripGeneratedImages('<p>טקסט</p><img src="https://example.com/a.jpg" alt="x"><figure><img src="https://cdn.example/b.png"></figure><h2>נשאר</h2>');
check('strip images from guided html', stripped === '<p>טקסט</p><h2>נשאר</h2>', stripped);
check('plain html unchanged by strip', stripGeneratedImages('<h2>כותרת</h2><p>בלי תמונה</p>') === '<h2>כותרת</h2><p>בלי תמונה</p>');
const headings = normalizeOutlineHeadings([
  { h2: 'א', h3s: ['א1', ''] },
  { text: 'ב', h3s: [] },
  { h2: 'ג', h3s: ['ג1'] }
], 2);
check('outline clamp', headings.length === 2 && headings[0].h3s.length === 1 && headings[1].h2 === 'ב', JSON.stringify(headings));
const emptyArticle = await generateArticleWithGemini({ keyword: '  ' });
const emptyOutline = await generateArticleWithGemini({ action: 'outline', keyword: '' });
check('legacy call rejects empty keyword', emptyArticle.ok === false && /מילת מפתח/.test(emptyArticle.error || ''));
check('outline call rejects empty keyword', emptyOutline.ok === false && /מילת מפתח/.test(emptyOutline.error || ''));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
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
const base = `http://127.0.0.1:${port}/openseo.html#produce`;

let puppeteer;
try {
  puppeteer = await import('puppeteer-core');
} catch {
  puppeteer = await import('/tmp/puppeteer-qa/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js');
}
const browser = await puppeteer.default.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
const net = [];
page.on('request', (req) => {
  net.push({ method: req.method(), url: req.url() });
});
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));
await page.evaluateOnNewDocument(() => {
  const orig = window.fetch.bind(window);
  window.__calls = [];
  window.fetch = async (url, opts) => {
    const u = String(url);
    const body = opts && opts.body ? String(opts.body) : '';
    window.__calls.push({ url: u, method: (opts && opts.method) || 'GET', body });
    if (u.includes('/api/project-001/generate-article')) {
      let parsed = {};
      try { parsed = JSON.parse(body || '{}'); } catch { parsed = {}; }
      if (parsed.action === 'outline') {
        return new Response(JSON.stringify({
          ok: true,
          action: 'outline',
          title: 'כותרת שהוצעה',
          meta_description: 'תיאור מטא שהוצע לבדיקה',
          headings: [
            { h2: 'פרק שהוצע ראשון', h3s: ['תת שהוצע'] },
            { h2: 'פרק שהוצע שני', h3s: [] }
          ],
          word_count: 900
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: false, error: 'QA blocked live generation' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    return orig(url, opts);
  };
});

async function shot(name) {
  await page.screenshot({ path: join(OUT, name), fullPage: false });
}

try {
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#pLength');
  const lengths = await page.$$eval('#pLength option', (opts) => opts.map((o) => o.value));
  check('short medium long', lengths.includes('short') && lengths.includes('medium') && lengths.includes('long'), lengths.join(','));

  const before = await page.evaluate(() => {
    const p = POSTS.find((x) => x.id === 1001);
    const old = POSTS.find((x) => x.id === 6);
    return {
      html: p.content_html,
      hasPlan: Object.prototype.hasOwnProperty.call(p, 'article_plan'),
      wp: p.wp_draft_id,
      oldHtml: old.content_html,
      oldPlan: Object.prototype.hasOwnProperty.call(old, 'article_plan')
    };
  });

  await page.type('#pKw', 'בדיקת מסלול קיים');
  await page.select('#pLength', 'medium');
  await page.click('[data-act="genArticle"]');
  await page.waitForFunction(() => window.__calls.some((c) => c.url.includes('generate-article')));
  const legacy = await page.evaluate(() => JSON.parse(window.__calls.find((c) => c.url.includes('generate-article')).body));
  check('legacy generate payload', legacy.keyword === 'בדיקת מסלול קיים' && legacy.length === 'medium' && !legacy.action && !legacy.outline && !legacy.images, JSON.stringify(legacy));
  await page.waitForFunction(() => !S.produce.busy && document.querySelector('[data-edit="1001"]'));
  await page.click('[data-act="closeCompose"]').catch(() => {});

  await page.click('[data-edit="1001"]');
  await page.waitForSelector('[data-cf="content_html"]');
  const opened = await page.evaluate(() => {
    const html = document.querySelector('[data-cf="content_html"]').value;
    const badge = document.body.innerText;
    return {
      hasPlanUi: !!document.getElementById('articlePlan'),
      hasMarker: html.includes('מהו קצין רכב'),
      wp: badge.includes('6255'),
      same: html === POSTS.find((x) => x.id === 1001).content_html,
      noPlanOnPost: !POSTS.find((x) => x.id === 1001).article_plan
    };
  });
  check('draft 1001 opens without plan', opened.hasMarker && !opened.hasPlanUi && opened.same && opened.noPlanOnPost, JSON.stringify(opened));
  check('wp draft 6255 badge', opened.wp);
  await page.click('[data-act="sitePreview"]');
  await page.waitForSelector('.dalia-mock-body');
  const oldPreview = await page.evaluate(() => ({
    imgs: document.querySelectorAll('.dalia-mock-body img').length,
    h2: document.querySelectorAll('.dalia-mock-body h2').length,
    planFigs: document.querySelectorAll('.dalia-plan-fig').length
  }));
  check('old preview keeps content and adds no plan images', oldPreview.h2 > 3 && oldPreview.planFigs === 0, JSON.stringify(oldPreview));
  await page.click('.site-preview-modal [data-act="close"]');
  await page.click('[data-act="closeCompose"]');
  await page.waitForSelector('#pKw');

  await page.click('[data-edit="6"]');
  await page.waitForSelector('[data-cf="content_html"]');
  const oldDraft = await page.evaluate(() => ({
    plan: !!document.getElementById('articlePlan'),
    text: document.querySelector('[data-cf="content_html"]').value.includes('רכב חלופי')
  }));
  check('older draft without article_plan opens', oldDraft.text && !oldDraft.plan, JSON.stringify(oldDraft));
  await page.click('[data-act="closeCompose"]');
  await page.waitForSelector('#pKw');

  await page.$eval('#pKw', (el) => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.type('#pKw', 'ניהול צי בדיקה');
  await page.select('#pLength', 'short');
  await page.type('#pWords', '420');
  await page.type('#pH2', '2');
  await page.click('[data-act="openArticlePlan"]');
  await page.waitForSelector('#articlePlan');
  let planState = await page.evaluate(() => ({
    h2: document.querySelectorAll('.plan-h2-card').length,
    images: document.querySelectorAll('.plan-image-card').length,
    disabled: document.getElementById('composeGenBtn').disabled,
    length: document.querySelector('[data-pfld="length"]').value,
    words: document.querySelector('[data-pfld="word_count"]').value
  }));
  check('plan opens with chosen H2 count and zero images', planState.h2 === 2 && planState.images === 0 && planState.length === 'short' && planState.words === '420', JSON.stringify(planState));
  check('generation blocked before approval', planState.disabled === true);

  await page.click('[data-act="approvePlan"]');
  planState = await page.evaluate(() => ({ approved: S.compose.article_plan.approved, disabled: document.getElementById('composeGenBtn').disabled }));
  check('cannot approve an empty plan', planState.approved === false && planState.disabled === true, JSON.stringify(planState));

  await page.click('[data-act="planAddH2"]');
  await page.click('[data-act="planAddH3"]');
  let counts = await page.evaluate(() => ({
    h2: S.compose.article_plan.headings.length,
    h3: S.compose.article_plan.headings[0].h3s.length
  }));
  check('add H2 and H3', counts.h2 === 3 && counts.h3 === 1, JSON.stringify(counts));
  await page.click('[data-act="planRemoveH3"]');
  await page.click('.plan-h2-card:last-child [data-act="planRemoveH2"]');
  counts = await page.evaluate(() => ({
    h2: S.compose.article_plan.headings.length,
    h3: S.compose.article_plan.headings.reduce((n, h) => n + h.h3s.length, 0)
  }));
  check('remove H2 and H3', counts.h2 === 2 && counts.h3 === 0, JSON.stringify(counts));

  await page.type('.plan-h2-card [data-h2]', 'כותרת שנערכה');
  await page.type('[data-pfld="title"]', 'כותרת המאמר לבדיקה');
  await page.type('[data-pfld="meta_description"]', 'תיאור מטא לבדיקת התוכנית');
  const summary = await page.$eval('#planSummary', (el) => el.innerText);
  check('plan edits show before approval', summary.includes('כותרת שנערכה') && summary.includes('כותרת המאמר לבדיקה') && summary.includes('תיאור מטא לבדיקת התוכנית'), summary.slice(0, 240));

  await page.click('[data-act="planImgMode"][data-mode="hero"]');
  await page.waitForSelector('.plan-image-card');
  let imgState = await page.evaluate(() => ({
    n: S.compose.article_plan.images.items.length,
    role: S.compose.article_plan.images.items[0].role,
    mode: S.compose.article_plan.images.mode
  }));
  check('hero only', imgState.n === 1 && imgState.role === 'hero' && imgState.mode === 'hero', JSON.stringify(imgState));

  await page.click('[data-act="planImgMode"][data-mode="hero_inline"]');
  imgState = await page.evaluate(() => S.compose.article_plan.images.items.map((i) => i.role));
  check('hero plus inline', imgState[0] === 'hero' && imgState.includes('inline') && imgState.length >= 2, imgState.join(','));

  await page.click('[data-act="planImgMode"][data-mode="none"]');
  imgState = await page.evaluate(() => S.compose.article_plan.images.items.length);
  check('zero images', imgState === 0);

  await page.click('[data-act="planImgMode"][data-mode="custom"]');
  await page.$eval('#planImgCount', (el) => { el.value = '2'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForFunction(() => document.querySelectorAll('.plan-image-card').length === 2);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  writeFileSync(join(OUT, 'pixel.png'), png);
  const inputs = await page.$$('[data-plan-file]');
  await inputs[0].uploadFile(join(OUT, 'pixel.png'));
  await inputs[1].uploadFile(join(OUT, 'pixel.png'));
  await page.waitForFunction(() => S.compose.article_plan.images.items.every((i) => i.src && i.src.startsWith('data:image')));
  await page.type('.plan-image-card:last-child [data-ifld="alt"]', 'טקסט אלט לבדיקה');
  await page.select('.plan-image-card:last-child [data-ifld="placement"]', 'after_h2');
  await page.select('.plan-image-card:last-child [data-ifld="afterH2"]', '1');
  imgState = await page.evaluate(() => {
    const inline = S.compose.article_plan.images.items.find((i) => i.role !== 'hero') || S.compose.article_plan.images.items[1];
    return { alt: inline.alt, after: inline.afterH2, placement: inline.placement, file: inline.fileName };
  });
  check('alt and H2 placement saved', imgState.alt === 'טקסט אלט לבדיקה' && Number(imgState.after) === 1 && imgState.placement === 'after_h2', JSON.stringify(imgState));

  const beforeDelete = await page.evaluate(() => S.compose.article_plan.images.items.length);
  await page.click('.plan-image-card:last-child [data-act="planRemoveImage"]');
  const afterDelete = await page.evaluate(() => S.compose.article_plan.images.items.length);
  check('delete image', beforeDelete === 2 && afterDelete === 1);

  await page.click('[data-act="planImgMode"][data-mode="custom"]');
  await page.$eval('#planImgCount', (el) => { el.value = '2'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForFunction(() => document.querySelectorAll('[data-plan-file]').length === 2);
  const again = await page.$$('[data-plan-file]');
  await again[1].uploadFile(join(OUT, 'pixel.png'));
  await page.waitForFunction(() => S.compose.article_plan.images.items[1] && S.compose.article_plan.images.items[1].src);
  await page.type('.plan-image-card:last-child [data-ifld="alt"]', 'אלט אחרי החלפה');
  await page.select('.plan-image-card:last-child [data-ifld="role"]', 'inline');
  await page.select('.plan-image-card:last-child [data-ifld="placement"]', 'after_h2');
  await page.select('.plan-image-card:last-child [data-ifld="afterH2"]', '1');
  check('replace upload', await page.evaluate(() => S.compose.article_plan.images.items[1].fileName === 'pixel.png'));

  const aiDisabled = await page.$eval('[data-act="planAiImage"]', (el) => el.disabled);
  check('AI image button is inert', aiDisabled === true);

  await page.click('[data-act="planH2Mode"][data-mode="ai_edit"]');
  await page.click('[data-act="planSuggest"]');
  await page.waitForFunction(() => (S.compose.article_plan.headings[0].text || '').includes('פרק שהוצע'));
  const suggested = await page.evaluate(() => ({
    h2: S.compose.article_plan.headings.map((h) => h.text),
    h3: S.compose.article_plan.headings[0].h3s,
    html: S.compose.content_html,
    approved: S.compose.article_plan.approved,
    calls: window.__calls.filter((c) => c.url.includes('generate-article')).map((c) => JSON.parse(c.body).action || 'article')
  }));
  check('AI suggests headings without writing the article', suggested.h2[0] === 'פרק שהוצע ראשון' && suggested.h3[0] === 'תת שהוצע' && suggested.html === '' && suggested.approved === false, JSON.stringify(suggested));
  await page.click('.plan-h2-card [data-h2]', { clickCount: 3 });
  await page.type('.plan-h2-card [data-h2]', 'פרק אחרי עריכה');

  await page.click('[data-act="approvePlan"]');
  await page.waitForFunction(() => document.getElementById('composeGenBtn') && !document.getElementById('composeGenBtn').disabled);
  check('approved plan unlocks generation', true);
  await shot('plan-approved-desktop.png');

  await page.evaluate(() => {
    S.compose.content_html = '<h2>פרק ראשון</h2><p>פסקה א</p><h2>פרק שני</h2><p>פסקה ב</p><h3>תת כותרת</h3><p>פסקה ג</p>';
    const inline = S.compose.article_plan.images.items.find((i) => i.role === 'inline');
    if (inline) { inline.placement = 'after_h2'; inline.afterH2 = 1; inline.alt = 'אלט אחרי החלפה'; }
    render();
  });
  const stored = await page.evaluate(() => S.compose.content_html);
  check('content_html has no injected image', !/<img/i.test(stored) && stored.includes('פרק ראשון'));
  await page.click('[data-act="sitePreview"]');
  await page.waitForSelector('.dalia-mock-body h2');
  const preview = await page.evaluate(() => {
    const body = document.querySelector('.dalia-mock-body');
    const h2s = [...body.querySelectorAll('h2')];
    const next = h2s[1] && h2s[1].nextElementSibling;
    const img = next && next.querySelector('img');
    const hero = document.querySelector('.dalia-plan-hero img');
    const heroBefore = !!(hero && body && (hero.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING));
    return {
      title: document.querySelector('.dalia-mock-h1').textContent,
      outline: document.querySelector('.dalia-plan-outline').innerText,
      nextTag: next && next.tagName,
      alt: img && img.alt,
      heroAlt: hero && hero.getAttribute('alt'),
      heroBefore,
      bodyImgs: body.querySelectorAll('img').length
    };
  });
  check('preview places inline image after chosen H2', preview.nextTag === 'FIGURE' && preview.alt === 'אלט אחרי החלפה' && preview.bodyImgs >= 1, JSON.stringify(preview));
  check('preview shows title, outline and hero', preview.title.includes('כותרת') && preview.outline.includes('H2') && preview.heroBefore, JSON.stringify(preview));
  await shot('preview-desktop.png');
  await page.click('[data-prevdevice="mobile"]');
  await page.waitForSelector('.site-preview-canvas.mobile-mode');
  const mobilePreview = await page.$eval('.site-preview-viewport', (el) => Math.round(el.getBoundingClientRect().width));
  check('local preview mobile frame', mobilePreview <= 420, String(mobilePreview));
  await page.click('.site-preview-modal [data-act="close"]');

  const callsBefore = await page.evaluate(() => window.__calls.length);
  await page.click('#composeGenBtn');
  await page.waitForFunction((n) => window.__calls.length > n, {}, callsBefore);
  const articleCall = await page.evaluate(() => {
    const call = [...window.__calls].reverse().find((c) => c.url.includes('generate-article'));
    return JSON.parse(call.body);
  });
  check('approved article sends outline and no image payload', articleCall.action === 'article' && articleCall.outline && articleCall.outline.headings.length > 0 && !articleCall.images && !String(JSON.stringify(articleCall)).includes('data:image'), JSON.stringify({ action: articleCall.action, h2: articleCall.outline.headings.map((h) => h.h2) }));
  const htmlAfterGen = await page.evaluate(() => S.compose.content_html);
  check('failed generation does not invent html', htmlAfterGen.includes('פרק ראשון') && !/<img/i.test(htmlAfterGen));

  await page.waitForFunction(() => !S.produce.busy && document.querySelector('[data-act="editPlan"]'));
  await page.click('[data-act="editPlan"]');
  const relocked = await page.evaluate(() => ({ approved: S.compose.article_plan.approved, disabled: document.getElementById('composeGenBtn').disabled }));
  check('editing the plan locks generation again', relocked.approved === false && relocked.disabled === true, JSON.stringify(relocked));
  await page.click('[data-act="approvePlan"]');
  await page.waitForFunction(() => S.compose.article_plan.approved);
  await page.click('[data-act="composeSave"]');
  await page.waitForSelector('#pKw');
  const saved = await page.evaluate(() => {
    const post = POSTS.find((p) => p.keyword === 'ניהול צי בדיקה');
    const legacyPost = POSTS.find((p) => p.id === 1001);
    return {
      has: !!(post && post.article_plan && post.article_plan.approved),
      htmlClean: post && !/<img/i.test(post.content_html || ''),
      legacyUntouched: legacyPost.content_html.length === POSTS.find((p) => p.id === 1001).content_html.length && !legacyPost.article_plan,
      legacyWp: legacyPost.wp_draft_id
    };
  });
  check('saved draft keeps optional plan and legacy post', saved.has && saved.htmlClean && saved.legacyWp === 6255 && !saved.legacyUntouched === false, JSON.stringify(saved));

  await page.setViewport({ width: 390, height: 844 });
  await page.click('[data-edit="' + (await page.evaluate(() => POSTS.find((p) => p.keyword === 'ניהול צי בדיקה').id)) + '"]');
  await page.waitForSelector('#articlePlan');
  const overflow = await page.evaluate(() => {
    const el = document.getElementById('articlePlan');
    const view = document.getElementById('view');
    return {
      plan: el.scrollWidth - el.clientWidth,
      view: view.scrollWidth - document.documentElement.clientWidth,
      buttons: [...el.querySelectorAll('button')].slice(0, 6).map((b) => b.getBoundingClientRect().width > 0)
    };
  });
  check('mobile 390 plan fits', overflow.plan <= 8 && overflow.buttons.every(Boolean), JSON.stringify(overflow));
  await shot('plan-mobile-390.png');

  const knownBootProbe = 'https://dalia-c.com/wp-json/wp/v2/pages?per_page=1';
  const bootProbes = net.filter((r) => r.method === 'GET' && r.url === knownBootProbe);
  const badNet = net.filter((r) => {
    const u = r.url.toLowerCase();
    if (r.method === 'GET' && r.url === knownBootProbe) return false;
    if (r.method !== 'GET' && r.method !== 'HEAD') return true;
    return /imagen|generativelanguage|wp-json|wp-admin/.test(u);
  });
  check('no new wordpress or image-model requests', badNet.length === 0 && bootProbes.length <= 1, badNet.map((r) => r.method + ' ' + r.url).join(' | ') || `pre-existing boot probe x${bootProbes.length}`);
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('legacy html unchanged in memory', await page.evaluate((html) => POSTS.find((p) => p.id === 1001).content_html === html, before.html));
  check('legacy post never gained article_plan', await page.evaluate(() => !POSTS.find((p) => p.id === 1001).article_plan && !POSTS.find((p) => p.id === 6).article_plan));
} catch (err) {
  check('qa run', false, err && err.stack ? err.stack.split('\n').slice(0, 6).join(' | ') : String(err));
  await shot('failure.png').catch(() => {});
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
