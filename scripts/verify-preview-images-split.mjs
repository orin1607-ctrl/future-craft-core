/**
 * Local verify: Preview/gates split — NO image generation, NO paid OpenAI Images calls.
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');
const OUT = join(PUBLIC, 'coco-reports', 'dalia-c-official');
const PACK_PATH = join(OUT, 'dalia-coco-knowledge-pack-v1.json');
const RESEARCH_PATH = join(OUT, 'stage-c-research-v1.json');
const PREVIEW = join(PUBLIC, 'client-previews', 'dalia-c-official', 'index.html');
const EXTERNAL =
  'https://orin1607-ctrl.github.io/future-craft-core/client-previews/dalia-c-official/index.html';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = join(PUBLIC, urlPath.replace(/^\//, ''));
      if (!filePath.startsWith(PUBLIC) || !existsSync(filePath) || !statSync(filePath).isFile()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
      res.end(readFileSync(filePath));
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const pack = JSON.parse(readFileSync(PACK_PATH, 'utf8'));
  const research = existsSync(RESEARCH_PATH)
    ? JSON.parse(readFileSync(RESEARCH_PATH, 'utf8'))
    : {};

  const paidCalls = [];
  const { server, base } = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('request', (req) => {
    const u = req.url();
    if (/images\/generations|action=images|"action"\s*:\s*"images"/i.test(u + (req.postData() || ''))) {
      paidCalls.push({ url: u, method: req.method() });
    }
    if (/marketing-site-build/i.test(u) && /images/i.test(req.postData() || '')) {
      paidCalls.push({ url: u, bodyHint: 'images' });
    }
  });

  await page.goto(
    `${base}/ai-marketing/ai-control-center-v5-STANDALONE.html?clientId=dalia-c-official`,
    { waitUntil: 'domcontentloaded', timeout: 60000 },
  );
  await page.waitForTimeout(1200);

  const result = await page.evaluate(async (payload) => {
    const pack = payload.pack;
    const research = payload.research;
    if (window.CocoClientWorkspace && CocoClientWorkspace.importPack) {
      CocoClientWorkspace.importPack(pack);
    } else {
      Object.keys(pack.keys || {}).forEach((k) => {
        try { localStorage.setItem(k, JSON.stringify(pack.keys[k].value)); } catch (e) { /* */ }
      });
    }
    try {
      localStorage.setItem('coco-stage-c-research-v1', JSON.stringify(research));
      localStorage.setItem('coco-stage-d-constraints-v1', JSON.stringify(pack.stageDConstraints || {
        volumesAreEstimates: true,
        fleetOsNotPublic: true,
        positioning: 'פתרון מלא לניהול, תפעול, תחזוקה ומימון של ציי רכב לעסקים.',
      }));
    } catch (e2) { /* */ }

    const pipeline = window.CocoDaliaOrchestrator
      ? CocoDaliaOrchestrator.runPipeline(null, { silent: true, skipPaidImages: true })
      : null;

    const imagesOnly = window.CocoDaliaOrchestrator && CocoDaliaOrchestrator.runImagesOnly
      ? await CocoDaliaOrchestrator.runImagesOnly({ generate: false, forceQuotaBlocked: true })
      : null;

    const engines = JSON.parse(localStorage.getItem('coco-dalia-engines-v1') || 'null');
    const imageStage = JSON.parse(localStorage.getItem('coco-dalia-image-stage-v1') || 'null');
    const c3 = (engines && engines.engines || []).find((e) => e.id === 'c3');
    const c11 = (engines && engines.engines || []).find((e) => e.id === 'c11');
    const c13 = (engines && engines.engines || []).find((e) => e.id === 'c13');

    return {
      modules: {
        imageStage: !!window.CocoImageStage,
        orchestrator: !!window.CocoDaliaOrchestrator,
        runImagesOnly: !!(window.CocoDaliaOrchestrator && CocoDaliaOrchestrator.runImagesOnly),
      },
      gates: pipeline && pipeline.gates,
      siteLabelHe: pipeline && pipeline.siteLabelHe,
      userMessages: pipeline && pipeline.userMessages,
      previewUrl: pipeline && pipeline.previewUrl,
      engines: {
        c3: c3 && { status: c3.status, ready: c3.ready },
        c13: c13 && { status: c13.status, ready: c13.ready, note: c13.note },
        c11: c11 && { status: c11.status, ready: c11.ready, note: c11.note },
      },
      imagesOnly: imagesOnly && {
        ok: imagesOnly.ok,
        imagesOnly: imagesOnly.imagesOnly,
        status: imagesOnly.result && imagesOnly.result.status,
        paidApiCalled: imagesOnly.result && imagesOnly.result.paidApiCalled,
        skippedPipeline: imagesOnly.result && imagesOnly.result.skippedPipeline,
        skippedAssistants: imagesOnly.result && imagesOnly.result.skippedAssistants,
        generateRequested: imagesOnly.result && imagesOnly.result.generateRequested,
      },
      imageStage,
      orchestratorVersion: window.CocoDaliaOrchestrator && CocoDaliaOrchestrator.VERSION,
    };
  }, { pack, research });

  await browser.close();
  server.close();

  const report = {
    at: new Date().toISOString(),
    previewFileExists: existsSync(PREVIEW),
    externalPreview: EXTERNAL,
    paidImageApiCallsDetected: paidCalls.length,
    paidCalls,
    result,
    assertions: {
      sitePreviewReady: !!(result.gates && result.gates.sitePreviewReady),
      imagesReadyFalse: !(result.gates && result.gates.imagesReady),
      finalSiteReadyFalse: !(result.gates && result.gates.finalSiteReady),
      imagesBlockedQuota: (result.gates && result.gates.imagesStatus) === 'imagesBlockedQuota'
        || (result.imageStage && result.imageStage.status) === 'imagesBlockedQuota',
      c3Ready: !!(result.engines.c3 && (result.engines.c3.ready || /מוכן|הושלם/.test(result.engines.c3.status))),
      c13Done: !!(result.engines.c13 && (result.engines.c13.ready || /מוכן|הושלם/.test(result.engines.c13.status))),
      imagesOnlySkipsPipeline: !!(result.imagesOnly && result.imagesOnly.skippedPipeline && result.imagesOnly.skippedAssistants),
      noPaidApi: paidCalls.length === 0 && !(result.imagesOnly && result.imagesOnly.paidApiCalled),
      noGenerate: !(result.imagesOnly && result.imagesOnly.generateRequested),
    },
  };
  report.ok = Object.values(report.assertions).every(Boolean);

  writeFileSync(join(OUT, 'preview-images-split-verify.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
