#!/usr/bin/env node
/**
 * Verify Business Strategy module files + Staging HTML references.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VER = process.env.VER || 'v3-biz-strategy-1';

const REQUIRED = [
  'public/ai-marketing/business-strategy-module.js',
  'public/ai-marketing/business-strategy-wizard.js',
  'public/ai-marketing/business-strategy-wizard.css',
  'public/ai-marketing-platform.html',
  'public/ai-marketing/coco-claude-screens.html',
];

const report = { ok: true, ver: VER, checks: [], missing: [] };

for (const rel of REQUIRED) {
  const p = join(ROOT, rel);
  const exists = existsSync(p);
  report.checks.push({ file: rel, exists });
  if (!exists) {
    report.ok = false;
    report.missing.push(rel);
  }
}

const platform = readFileSync(join(ROOT, 'public/ai-marketing-platform.html'), 'utf8');
const screens = readFileSync(join(ROOT, 'public/ai-marketing/coco-claude-screens.html'), 'utf8');
const moduleJs = readFileSync(join(ROOT, 'public/ai-marketing/business-strategy-module.js'), 'utf8');

const snippets = [
  { name: 'platform loads module', ok: platform.includes('business-strategy-module.js') },
  { name: 'platform loads wizard', ok: platform.includes('business-strategy-wizard.js') },
  { name: 'platform loads css', ok: platform.includes('business-strategy-wizard.css') },
  { name: 'screen-business-strategy', ok: screens.includes('id="screen-business-strategy"') },
  { name: 'hub card BusinessStrategyWizard', ok: screens.includes('BusinessStrategyWizard.open()') },
  { name: 'hub label חברות ועסקים', ok: screens.includes('חברות ועסקים') },
  { name: 'module dalia-c-official', ok: moduleJs.includes('dalia-c-official') },
  { name: 'exportToPlatform', ok: moduleJs.includes('exportToPlatform') },
];

snippets.forEach(function (s) {
  report.checks.push(s);
  if (!s.ok) report.ok = false;
});

report.stagingUrl =
  `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${VER}`;

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
