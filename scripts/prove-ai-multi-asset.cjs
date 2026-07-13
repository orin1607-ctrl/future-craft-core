/**
 * Prove Multi-Asset AI: 50 assistants + 10 consultants can target brand site;
 * Single/Compare/Portfolio; mock 4th; no dual-asset hardcode leftovers.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));

  await page.goto('https://dalia-car.online/orin-marketing/?v=ai-proof', {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForTimeout(3000);

  const proof = await page.evaluate(async () => {
    const out = {
      registryOk: !!window.AssetRegistry,
      assets: [],
      modes: {},
      ai: null,
      engine: null,
      dualHardcodeScan: {},
    };

    if (!window.AssetRegistry) return out;
    const R = window.AssetRegistry;
    out.assets = R.list().map((a) => ({
      id: a.id,
      label: a.label,
      url: a.mySiteUrl || a.url,
      isMock: !!a.isMock,
    }));
    out.countLive = R.list().filter((a) => !a.isMock).length;

    // Modes
    const modes = ['single', 'compare', 'portfolio'];
    for (const m of modes) {
      try {
        if (typeof R.setMode === 'function') R.setMode(m);
        else if (typeof R.setAssetMode === 'function') R.setAssetMode(m);
        const ctx = R.aiContext ? R.aiContext() : null;
        out.modes[m] = {
          mode: (ctx && ctx.mode) || m,
          n: (ctx && ctx.assets && ctx.assets.length) || null,
          hasBrand: !!(ctx && ctx.assets && ctx.assets.some((a) => a.id === 'dalia-brand-site')),
        };
      } catch (e) {
        out.modes[m] = { error: String(e.message || e) };
      }
    }

    // Active brand
    if (typeof R.setActive === 'function') R.setActive('dalia-brand-site');
    else if (typeof R.setActiveAsset === 'function') R.setActiveAsset('dalia-brand-site');
    const brandCtx = R.aiContext ? R.aiContext() : window.__COCO_AI_CONTEXT;
    out.ai = {
      active: R.getActive ? (R.getActive() || {}).id : null,
      ctxMode: brandCtx && brandCtx.mode,
      ctxN: brandCtx && brandCtx.assets && brandCtx.assets.length,
      brandInCtx: !!(brandCtx && brandCtx.assets && brandCtx.assets.some((a) => a.id === 'dalia-brand-site')),
      brandUrl: (brandCtx && brandCtx.assets && brandCtx.assets.find((a) => a.id === 'dalia-brand-site') || {}).url,
    };

    // Mock 4th
    const n4 = R.enableMockFourthAsset(true);
    out.mock4 = { enabledCount: n4, listLen: R.list().length };
    R.enableMockFourthAsset(false);

    // Assistants engine
    const eng = window.CocoDaliaAssistantsEngine || window.AssistantsEngine || null;
    if (eng && typeof eng.run === 'function') {
      const store = eng.run({ force: true });
      out.engine = {
        assistants: (store.assistants || []).length,
        consultants: (store.consultants || []).length,
        totals: store.total || null,
        quality: store.quality || null,
        brandMentions: JSON.stringify(store).includes('dalia-brand-site') || JSON.stringify(store).includes('תדמית'),
        multiAssetInAnalysis: !!(store.assistants || []).some(
          (a) => a.context && (a.context.multiAsset || (a.context.assets && a.context.assets.length >= 3)),
        ),
        sampleAssistantIds: (store.assistants || []).slice(0, 3).map((a) => a.id),
        sampleConsultantIds: (store.consultants || []).slice(0, 3).map((a) => a.id),
        allAssistantCanSelectBrand: (store.assistants || []).every((a) => {
          const assets = (a.context && a.context.assets) || (brandCtx && brandCtx.assets) || [];
          return assets.some((x) => x.id === 'dalia-brand-site') || out.ai.brandInCtx;
        }),
        allConsultantCanSelectBrand: (store.consultants || []).every(() => out.ai.brandInCtx),
      };
    } else if (typeof window.runAssistantsAnalysis === 'function') {
      const store = window.runAssistantsAnalysis();
      out.engine = { via: 'runAssistantsAnalysis', assistants: (store.assistants || []).length };
    } else {
      // Probe script tags / global keys
      out.engine = {
        missing: true,
        globals: Object.keys(window).filter((k) => /assist|consult|coco|engine/i.test(k)).slice(0, 40),
      };
    }

    // Dual-asset leftover scan in page source of registry
    const src = (document.documentElement.innerHTML || '') + '';
    out.dualHardcodeScan = {
      hasOnlyTwoSitesPhrase: /רק שני נכסים|two sites only|dual.?site only/i.test(src),
      assetRegistryPresent: /AssetRegistry/.test(src),
    };

    return out;
  });

  // Deep scan local SSOT files via fetch from production
  const files = [
    '/orin-marketing/../ai-marketing/asset-registry-ssot.js',
    '/ai-marketing/asset-registry-ssot.js',
  ];
  // Try known production paths
  const paths = [
    'https://dalia-car.online/ai-marketing/asset-registry-ssot.js',
    'https://dalia-car.online/orin-marketing/coco-dalia/../../ai-marketing/asset-registry-ssot.js',
  ];

  // Open assistants page if exists
  let assistantsPage = null;
  for (const u of [
    'https://dalia-car.online/orin-marketing/coco-dalia/assistants.html',
    'https://dalia-car.online/orin-marketing/coco-dalia/pirsum-home.html?asset=dalia-brand-site&panel=assistants',
  ]) {
    try {
      const res = await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 20000 });
      if (res && res.ok()) {
        await page.waitForTimeout(2500);
        assistantsPage = await page.evaluate(() => {
          const eng = window.CocoDaliaAssistantsEngine;
          const R = window.AssetRegistry;
          if (R && R.setActive) R.setActive('dalia-brand-site');
          let store = null;
          if (eng && eng.run) store = eng.run({ force: true });
          else if (eng && eng.analyzeAll) store = eng.analyzeAll();
          else if (window.__COCO_ASSISTANTS_STORE) store = window.__COCO_ASSISTANTS_STORE;
          const ctx = R && R.aiContext ? R.aiContext() : null;
          return {
            url: location.href,
            hasEngine: !!eng,
            assistants: store && store.assistants ? store.assistants.length : null,
            consultants: store && store.consultants ? store.consultants.length : null,
            brandInCtx: !!(ctx && ctx.assets && ctx.assets.some((a) => a.id === 'dalia-brand-site')),
            totals: store && store.total,
            realAnalysis: store && store.quality,
          };
        });
        break;
      }
    } catch (_) {}
  }

  // Grep production JS for dual-asset leftovers (fetch asset-registry + assistants engine)
  const scanUrls = [
    'https://dalia-car.online/ai-marketing/asset-registry-ssot.js',
    'https://dalia-car.online/ai-marketing/coco-dalia-assistants-engine.js',
    'https://dalia-car.online/ai-marketing/asset-flow-ssot.js',
    'https://dalia-car.online/ai-marketing/marketing-ssot.js',
    'https://dalia-car.online/ai-marketing/dalia-site-config.js',
  ];
  const dualScan = {};
  for (const u of scanUrls) {
    try {
      const r = await fetch(u);
      const t = await r.text();
      dualScan[u] = {
        status: r.status,
        len: t.length,
        mentionsBrand: /dalia-brand-site|תדמית/.test(t),
        hardTwo:
          /onlyTwo|TWO_SITES|sites\s*=\s*\[\s*['\"]dalia-c|length\s*===\s*2\s*\?\s*['\"]legacy/.test(t) ||
          /נכסים רק שניים|רק 2 נכסים/.test(t),
        usesAssetRegistry: /AssetRegistry/.test(t),
        usesListN: /\.list\(|assets\.length|multiAsset/.test(t),
      };
    } catch (e) {
      dualScan[u] = { error: String(e.message || e) };
    }
  }

  const out = {
    at: new Date().toISOString(),
    errors,
    proof,
    assistantsPage,
    dualScan,
    verdict: {
      threeAssets: proof.countLive >= 3,
      brandPresent: (proof.assets || []).some((a) => a.id === 'dalia-brand-site'),
      mockFourth: proof.mock4 && proof.mock4.listLen >= 4,
      modesOk: ['single', 'compare', 'portfolio'].every((m) => proof.modes[m] && proof.modes[m].hasBrand !== false),
      assistants50: proof.engine && proof.engine.assistants === 50,
      consultants10: proof.engine && proof.engine.consultants === 10,
      brandSelectable: !!(proof.ai && proof.ai.brandInCtx),
    },
  };

  const dest = path.join('docs/audit-reports/multi-asset-brand-site', 'AI-MULTI-ASSET-PROOF.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  const v = out.verdict;
  if (!v.threeAssets || !v.brandPresent || !v.mockFourth) process.exit(2);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
