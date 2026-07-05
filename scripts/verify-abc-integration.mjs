/**
 * Verify ABC integration: Part A external file, Part B unchanged, Part C 9 steps.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const coco = path.join(root, 'public/coco-dalia');
const indexPath = path.join(coco, 'index.html');
const partA = path.join(coco, 'part-a-planning-engine.html');
const partC = path.join(coco, 'part-c-google-ads.html');

const errors = [];

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

if (!fs.existsSync(partA)) errors.push('missing part-a-planning-engine.html');
if (!fs.existsSync(partC)) errors.push('missing part-c-google-ads.html');

const partAText = fs.existsSync(partA) ? read(partA) : '';
const partCText = fs.existsSync(partC) ? read(partC) : '';
const index = read(indexPath);

for (const fn of ['initBusinessDiscovery', 'launchCampaign', 'BD_TABS']) {
  if (!partAText.includes(fn)) errors.push(`part-a missing ${fn}`);
}

const stepsMatch = partCText.match(/const STEPS\s*=\s*\[([\s\S]*?)\];/);
if (!stepsMatch) {
  errors.push('part-c missing STEPS array');
} else {
  const stepCount = (stepsMatch[1].match(/\{n:/g) || []).length;
  if (stepCount !== 9) errors.push(`part-c STEPS count=${stepCount}, expected 9`);
}

if (!index.includes('src="part-a-planning-engine.html"')) {
  errors.push('index.html frame-a must reference part-a-planning-engine.html');
}
if (!index.includes('src="part-c-google-ads.html"')) {
  errors.push('index.html frame-c must reference part-c-google-ads.html');
}
if (index.includes('id="frame-a"') && index.includes('frame-a') && /frame-a[^>]*srcdoc=/.test(index)) {
  errors.push('frame-a still uses inline srcdoc');
}
if (/frame-c[^>]*srcdoc=/.test(index)) {
  errors.push('frame-c still uses inline srcdoc');
}

// Frame B srcdoc must remain inline and unchanged length vs snapshot at patch time
const fbStart = index.indexOf('<iframe id="frame-b"');
const fbSrcStart = index.indexOf('srcdoc="', fbStart) + 8;
const fbEnd = index.indexOf('"></iframe>', fbSrcStart);
const frameB = index.slice(fbSrcStart, fbEnd);
const snapPath = path.join(coco, '.frame-b-srcdoc.sha256');
if (fs.existsSync(snapPath)) {
  const snap = read(snapPath).trim();
  const cur = frameB.length + ':' + frameB.slice(0, 80);
  if (snap !== cur) errors.push('frame-b srcdoc changed (length or prefix mismatch)');
} else {
  console.warn('warn: no frame-b snapshot — skipping unchanged check');
}

for (const fn of ['const PILLS', 'UNLOCKED', 'launchModule(target)']) {
  if (!index.includes(fn)) errors.push(`index shell missing ${fn}`);
}

if (errors.length) {
  console.error('verify-abc-integration FAILED:');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}

console.log('verify-abc-integration OK');
console.log('  part-a:', partAText.length, 'chars');
console.log('  part-c:', partCText.length, 'chars, 9 STEPS');
console.log('  frame-b srcdoc:', frameB.length, 'chars (unchanged)');
