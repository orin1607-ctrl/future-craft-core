/**
 * Deep read-only dump of #1 Obligo rows: V18 registry JSON vs NEW צקים sheet.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { getAuthenticatedClient, loadGoogleAuthLibrary } from '../../../../scripts/google/_lib/auth.mjs';

const SS = '1ZuuKKw9_wGMAlMgkyrPrCRP4ijaY8dIScbOSACqyCN8';
const FP =
  '208099cea85889879b7503d44fc6b59c2d5edf26d078153f93a6274e90a33902';
const MID = '19fabd95498421fd';

mkdirSync('backups/button19-obligo1-audit', { recursive: true });

const auth = await getAuthenticatedClient();
const google = await loadGoogleAuthLibrary();
const sheets = google.sheets({ version: 'v4', auth });

async function values(title, range = 'A1:AZ500') {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SS,
    range: `'${title}'!${range}`,
  });
  return res.data.values || [];
}

function toObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h || '').trim());
  return rows.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, i) => {
      o[h] = r[i] != null ? r[i] : '';
    });
    return o;
  });
}

const registry = toObjects(await values('רישום קליטה'));
const checks = toObjects(await values('צקים'));
const archive = toObjects(await values('ארכיון צקים'));

const v18Rec =
  registry.find((r) => String(r['מספר קליטה'] || '') === '1') ||
  registry.find((r) => String(r['מזהה דוח'] || r['fingerprint'] || '') === FP) ||
  registry.find((r) => String(r['Message ID'] || r['מזהה מייל'] || '').includes(MID));

writeFileSync(
  'backups/button19-obligo1-audit/v18-registry-row-meta.json',
  JSON.stringify(
    v18Rec
      ? Object.fromEntries(
          Object.entries(v18Rec).filter(([k]) => !/JSON|json|שורות|עמודות/.test(k)),
        )
      : { error: 'not found' },
    null,
    2,
  ),
);

let cols = [];
let rows = [];
try {
  cols = JSON.parse(v18Rec['עמודות JSON'] || '[]');
} catch {
  cols = [];
}
try {
  rows = JSON.parse(v18Rec['שורות JSON'] || '[]');
} catch {
  rows = [];
}

const v18Entities = rows.map((r, i) => ({
  i: i + 1,
  raw: r,
  colMap: Object.fromEntries(cols.map((c, idx) => [c, r[idx]])),
  name: r[1],
  key: r[0],
  amountCandidates: r.map((x, idx) => ({ col: cols[idx] || idx, val: x })),
}));

writeFileSync(
  'backups/button19-obligo1-audit/v18-rows.json',
  JSON.stringify({ cols, count: rows.length, entities: v18Entities }, null, 2),
);

function matchCheck(r) {
  const h = String(r['מזהה דוח'] || '').trim();
  const n = String(r['מספר קליטה'] || '').trim();
  const m = String(r['מזהה מייל קליטה'] || r['מזהה מייל'] || '').replace(/^gmail:/, '');
  return h === FP || n === '1' || m.includes(MID);
}

const neuMatched = checks.filter(matchCheck);
const archMatched = archive.filter(matchCheck);

const neuSlim = neuMatched.map((r, i) => ({
  i: i + 1,
  'מספר קליטה': r['מספר קליטה'],
  שם: r['שם'] || r['שם המוטב'] || r['מוטב'],
  אסמכתא: r['אסמכתא'] || r['מספר צ׳ק'] || r['מספר צק'],
  סכום: r['סכום'] || r['סכום כולל'],
  'מזהה דוח': r['מזהה דוח'],
  'שם קובץ מקור': r['שם קובץ מקור'],
  'מזהה מייל קליטה': r['מזהה מייל קליטה'] || r['מזהה מייל'],
  סטטוס: r['סטטוס'],
  בנק: r['בנק'],
  'תאריך פירעון': r['תאריך פירעון'],
  כיוון: r['כיוון'],
  keys: Object.keys(r),
}));

writeFileSync(
  'backups/button19-obligo1-audit/new-checks-matched.json',
  JSON.stringify({ count: neuSlim.length, rows: neuSlim, allHeaders: checks[0] ? Object.keys(checks[0]) : [] }, null, 2),
);
writeFileSync(
  'backups/button19-obligo1-audit/archive-matched.json',
  JSON.stringify({ count: archMatched.length, sample: archMatched.slice(0, 5) }, null, 2),
);

// Also dump ALL checks with intake 1 or same fingerprint for clarity
const byIntake = checks.filter((r) => String(r['מספר קליטה'] || '').trim() === '1');
const byFp = checks.filter((r) => String(r['מזהה דוח'] || '').trim() === FP);

writeFileSync(
  'backups/button19-obligo1-audit/new-by-intake-or-fp.json',
  JSON.stringify(
    {
      byIntake: byIntake.length,
      byFp: byFp.length,
      byIntakeOrFp: neuMatched.length,
      intakeValues: [...new Set(neuMatched.map((r) => r['מספר קליטה']))],
      names: neuMatched.map((r) => r['שם'] || r['שם המוטב']),
      amounts: neuMatched.map((r) => r['סכום'] || r['סכום כולל']),
      refs: neuMatched.map((r) => r['אסמכתא'] || r['מספר צ׳ק']),
    },
    null,
    2,
  ),
);

console.log(
  JSON.stringify(
    {
      v18Meta: v18Rec
        ? {
            num: v18Rec['מספר קליטה'],
            type: v18Rec['סוג דוח'] || v18Rec['קטגוריה'],
            file: v18Rec['שם קובץ'],
            mid: v18Rec['Message ID'] || v18Rec['מזהה מייל'],
            hash: v18Rec['מזהה דוח'],
            records: v18Rec['מספר רשומות'],
            amount: v18Rec['סכום תצוגה'],
            rowCount: rows.length,
            cols,
          }
        : null,
      v18Rows: v18Entities.map((e) => ({
        i: e.i,
        key: e.key,
        name: e.name,
        map: e.colMap,
      })),
      neuCount: neuSlim.length,
      neuRows: neuSlim.map((r) => ({
        i: r.i,
        intake: r['מספר קליטה'],
        name: r.שם,
        ref: r.אסמכתא,
        amount: r.סכום,
        status: r.סטטוס,
      })),
      intakeValues: [...new Set(neuMatched.map((r) => String(r['מספר קליטה'] || '')))],
    },
    null,
    2,
  ),
);
