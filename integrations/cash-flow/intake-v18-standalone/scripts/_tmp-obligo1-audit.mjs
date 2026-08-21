/**
 * READ-ONLY audit for Button19 #1 Obligo (V18 vs NEW).
 * No writes, no deploy.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { getAuthenticatedClient, loadGoogleAuthLibrary } from '../../../../scripts/google/_lib/auth.mjs';

const NEW = '1s3-gi5kusn2bl3HfiJT34Ig42n0sf7myQarohvtoAh9Im9c2Sdrc4qzG';
const DEP = 'AKfycbz2csN5kyFURg2MV08z70prtszZDXwXdoL8sXxslvO-35BNcRFeAaJpL3sYcZqmyr5f';
const V18 = '1yn8zeIV2WJkox-0nEmIT4ozrtRmCdzdgu8xwmnOt7soIZ0Jiju0Au0dc';
const WEB = 'https://script.google.com/macros/s/' + DEP + '/exec';
const SS = '1ZuuKKw9_wGMAlMgkyrPrCRP4ijaY8dIScbOSACqyCN8';

mkdirSync('backups/button19-obligo1-audit', { recursive: true });

const cmp = await (await fetch(WEB + '?action=compareV18&_=' + Date.now(), { redirect: 'follow' })).json();
const item1 = (cmp.items || []).find((i) => String(i.intakeNum) === '1');
writeFileSync('backups/button19-obligo1-audit/compare-item1.json', JSON.stringify(item1, null, 2));
writeFileSync(
  'backups/button19-obligo1-audit/compare-summary.json',
  JSON.stringify(
    {
      headline: cmp.summary?.headline,
      pass: cmp.summary?.pass,
      fail: cmp.summary?.fail,
      statuses: (cmp.items || []).map((i) => ({ n: i.intakeNum, s: i.status, type: i.type })),
      item1Keys: item1 ? Object.keys(item1) : [],
      v18Keys: item1?.v18 ? Object.keys(item1.v18) : [],
      neuKeys: item1?.neu ? Object.keys(item1.neu) : [],
      checks: item1?.checks,
      gaps: item1?.gaps,
      entities: item1?.entities,
      note: item1?.note,
    },
    null,
    2,
  ),
);

const auth = await getAuthenticatedClient();
const google = await loadGoogleAuthLibrary();
const sheets = google.sheets({ version: 'v4', auth });
const api = google.script({ version: 'v1', auth });

// Spreadsheet sheet names
const meta = await sheets.spreadsheets.get({ spreadsheetId: SS });
const sheetNames = (meta.data.sheets || []).map((s) => s.properties.title);
writeFileSync('backups/button19-obligo1-audit/sheet-names.json', JSON.stringify(sheetNames, null, 2));

const obligoLike = sheetNames.filter((n) => /אובליגו|צ.?ק|obligo|checks/i.test(n));
console.log('obligo-like sheets:', obligoLike);

async function readSheet(title, range = 'A1:Z200') {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SS,
      range: `'${title}'!${range}`,
    });
    return res.data.values || [];
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

// Registry / intake log often holds V18 side
const registryCandidates = sheetNames.filter((n) => /רישום|קליטה|registry|intake/i.test(n));
const dumps = {};
for (const name of [...new Set([...obligoLike, ...registryCandidates])]) {
  dumps[name] = await readSheet(name);
}
writeFileSync('backups/button19-obligo1-audit/sheet-dumps.json', JSON.stringify(dumps, null, 2));

// Pull V18Compare.gs + Code.gs obligo-related snippets from NEW
const neuContent = (await api.projects.getContent({ scriptId: NEW })).data;
const v18Content = (await api.projects.getContent({ scriptId: V18 })).data;

function findFns(src, patterns) {
  const out = {};
  for (const p of patterns) {
    const re = new RegExp(p, 'g');
    const m = src.match(re);
    out[p] = m ? [...new Set(m)].slice(0, 40) : [];
  }
  return out;
}

const neuCode = neuContent.files.find((f) => f.name === 'Code')?.source || '';
const neuCmp = neuContent.files.find((f) => f.name === 'V18Compare')?.source || '';
const v18Code = v18Content.files.find((f) => f.name === 'Code')?.source || '';

writeFileSync(
  'backups/button19-obligo1-audit/code-markers.json',
  JSON.stringify(
    {
      new: {
        Code: findFns(neuCode, [
          'parse.*[Oo]bligo|parse.*[Cc]heck|אובליגו|applyChecks|checksObligo|obligo',
          'function\\s+\\w*[Oo]bligo\\w*',
          'function\\s+\\w*[Cc]heck\\w*',
        ]),
        V18Compare: findFns(neuCmp, [
          'אובליגו|obligo|intakeNumber|entities|records',
          'function\\s+\\w+',
        ]),
      },
      v18: {
        Code: findFns(v18Code, [
          'parse.*[Oo]bligo|אובליגו|obligo|checks',
          'function\\s+\\w*[Oo]bligo\\w*',
        ]),
      },
    },
    null,
    2,
  ),
);

// Extract obligo-related function bodies from V18Compare (NEW)
const cmpIdx = neuCmp.search(/אובליגו|obligo|Obligo|checks.?obligo/i);
writeFileSync(
  'backups/button19-obligo1-audit/v18compare-obligo-snip.txt',
  cmpIdx >= 0 ? neuCmp.slice(Math.max(0, cmpIdx - 800), cmpIdx + 4000) : 'NO MATCH',
);

console.log(
  JSON.stringify(
    {
      headline: cmp.summary?.headline,
      item1Status: item1?.status,
      v18: item1?.v18,
      neu: item1?.neu,
      checks: item1?.checks,
      gapsCount: (item1?.gaps || []).length,
      entities: item1?.entities,
      obligoSheets: obligoLike,
      registrySheets: registryCandidates,
    },
    null,
    2,
  ),
);
