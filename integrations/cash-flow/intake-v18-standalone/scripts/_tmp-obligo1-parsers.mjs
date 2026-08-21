/**
 * Pull obligo parser snippets from NEW Code.gs + V18 Business + compare UI index.
 * Read-only.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { getAuthenticatedClient, loadGoogleAuthLibrary } from '../../../../scripts/google/_lib/auth.mjs';

const NEW = '1s3-gi5kusn2bl3HfiJT34Ig42n0sf7myQarohvtoAh9Im9c2Sdrc4qzG';
const V18 = '1yn8zeIV2WJkox-0nEmIT4ozrtRmCdzdgu8xwmnOt7soIZ0Jiju0Au0dc';
const DEP = 'AKfycbz2csN5kyFURg2MV08z70prtszZDXwXdoL8sXxslvO-35BNcRFeAaJpL3sYcZqmyr5f';

mkdirSync('backups/button19-obligo1-audit', { recursive: true });

const auth = await getAuthenticatedClient();
const google = await loadGoogleAuthLibrary();
const api = google.script({ version: 'v1', auth });

const neu = (await api.projects.getContent({ scriptId: NEW })).data;
const v18 = (await api.projects.getContent({ scriptId: V18 })).data;

const neuCode = neu.files.find((f) => f.name === 'Code')?.source || '';
const index = neu.files.find((f) => f.name === 'index')?.source || '';
const cmp = neu.files.find((f) => f.name === 'V18Compare')?.source || '';

// Find obligo parse functions in NEW
const markers = [
  'parseObligo',
  'Obligo',
  'אובליגו',
  'syncObligo',
  'applyObligo',
  'checksObligo',
  'OBLIGO',
];
const hits = [];
for (const m of markers) {
  let idx = 0;
  while ((idx = neuCode.indexOf(m, idx)) >= 0) {
    hits.push({ m, idx });
    idx += m.length;
    if (hits.length > 80) break;
  }
}

function extractFunction(src, nameHint) {
  const re = new RegExp('function\\s+' + nameHint + '\\s*\\(');
  const m = re.exec(src);
  if (!m) return null;
  let i = m.index;
  let brace = -1;
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') {
      if (brace < 0) brace = i;
      depth++;
    } else if (src[i] === '}') {
      depth--;
      if (depth === 0 && brace >= 0) return src.slice(m.index, i + 1);
    }
  }
  return src.slice(m.index, m.index + 2000);
}

const fnNames = [
  ...new Set(
    (neuCode.match(/function\s+\w*[Oo]bligo\w*\s*\(/g) || []).map((s) =>
      s.replace(/^function\s+/, '').replace(/\s*\($/, ''),
    ),
  ),
];
const more = [
  ...new Set(
    (neuCode.match(/function\s+\w*(?:Check|צק|Cheque)\w*\s*\(/gi) || []).map((s) =>
      s.replace(/^function\s+/i, '').replace(/\s*\($/, ''),
    ),
  ),
].slice(0, 40);

writeFileSync(
  'backups/button19-obligo1-audit/new-fn-names.json',
  JSON.stringify({ fnNames, more, hitCount: hits.length }, null, 2),
);

for (const name of fnNames) {
  const body = extractFunction(neuCode, name);
  if (body) writeFileSync(`backups/button19-obligo1-audit/fn-NEW-${name}.js`, body);
}

// V18 business obligo sections
const v18Biz =
  v18.files.find((f) => /Business|IntakeV18/i.test(f.name))?.source ||
  v18.files.find((f) => f.name === 'Code')?.source ||
  '';
writeFileSync(
  'backups/button19-obligo1-audit/v18-files.json',
  JSON.stringify(
    v18.files.map((f) => ({ name: f.name, len: (f.source || '').length })),
    null,
    2,
  ),
);

// Search V18 for how obligo rows are built (aggregate?)
const v18ObligoIdx = v18Biz.search(/reportType === 'אובליגו'|אובליגו/);
if (v18ObligoIdx >= 0) {
  writeFileSync(
    'backups/button19-obligo1-audit/v18-obligo-context.txt',
    v18Biz.slice(Math.max(0, v18ObligoIdx - 200), v18ObligoIdx + 3500),
  );
}

// Also search all V18 files
for (const f of v18.files) {
  const src = f.source || '';
  if (!/אובליגו/.test(src)) continue;
  const idx = src.indexOf("reportType === 'אובליגו'");
  if (idx >= 0) {
    writeFileSync(
      `backups/button19-obligo1-audit/v18-${f.name}-obligo.txt`,
      src.slice(Math.max(0, idx - 100), idx + 4000),
    );
  }
}

// UI card renderer for intake display
const uiStart = index.indexOf('function contentCells');
const uiAlt = index.indexOf('root.innerHTML=(data.items||[]).map');
writeFileSync(
  'backups/button19-obligo1-audit/ui-render-snip.js',
  index.slice(uiStart >= 0 ? uiStart : uiAlt, (uiStart >= 0 ? uiStart : uiAlt) + 3500),
);

// Live compare again + simulate UI fields
const WEB = 'https://script.google.com/macros/s/' + DEP + '/exec';
const live = await (await fetch(WEB + '?action=compareV18&_=' + Date.now())).json();
const it = live.items.find((x) => String(x.intakeNum) === '1');
const uiSim = {
  status: it.status,
  vNum: (it.v18 && it.v18.intakeNumber) || it.intakeNum || '',
  nNum: (it.neu && it.neu.intakeNumber) || '',
  displayV: '#' + ((it.v18 && it.v18.intakeNumber) || it.intakeNum || ''),
  displayN: '#' + ((it.neu && it.neu.intakeNumber) || '—' || ''),
  wouldShowDash: !(it.neu && it.neu.intakeNumber),
  records: { v: it.v18.records, n: it.neu.records },
  entities: it.entities,
  note: it.note,
  checks: it.checks,
};

writeFileSync('backups/button19-obligo1-audit/ui-sim-item1.json', JSON.stringify(uiSim, null, 2));
console.log(JSON.stringify({ fnNames, uiSim, v18FileCount: v18.files.length }, null, 2));
