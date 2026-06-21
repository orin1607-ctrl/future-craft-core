/**
 * UI-only FAB screenshots (no auth) — standalone platform embedded mode.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const BASE = (process.argv[2] || 'https://orin1607-ctrl.github.io/future-craft-core/').replace(/\/?$/, '/');
const OUT = join(process.cwd(), 'docs', 'screenshots', 'ai-fab-staging');
mkdirSync(OUT, { recursive: true });

async function launchBrowser() {
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch({ channel: 'chrome' });
  } catch {
    return await chromium.launch();
  }
}

async function capture(viewport, prefix) {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const url = `${BASE}ai-marketing-platform?embedded=1`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.locator('#cocoAiFab').waitFor({ state: 'visible', timeout: 15000 });
  await page.screenshot({ path: join(OUT, `${prefix}-fab.png`) });
  const fabBox = await page.locator('#cocoAiFab').boundingBox();
  await page.locator('#cocoAiFab').click({ force: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, `${prefix}-chat-open.png`) });
  await browser.close();
  return fabBox;
}

const mobileFab = await capture({ width: 390, height: 844 }, '01-mobile-embedded');
const desktopFab = await capture({ width: 1280, height: 900 }, '04-desktop-embedded');

writeFileSync(
  join(OUT, 'ui-report.json'),
  JSON.stringify({ mobileFab, desktopFab, url: BASE, at: new Date().toISOString() }, null, 2),
);
console.log('Saved to', OUT);
