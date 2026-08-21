/**
 * Write formal AUDIT-ONLY report for #1 (no mutations).
 */
import { writeFileSync, readFileSync } from 'node:fs';

const item1 = JSON.parse(readFileSync('backups/button19-obligo1-audit/compare-item1.json', 'utf8'));
const v18rows = JSON.parse(readFileSync('backups/button19-obligo1-audit/v18-rows.json', 'utf8'));
const neu = JSON.parse(readFileSync('backups/button19-obligo1-audit/new-checks-matched.json', 'utf8'));
const uiSim = JSON.parse(readFileSync('backups/button19-obligo1-audit/ui-sim-item1.json', 'utf8'));

function money(n) {
  const x = Number(String(n).replace(/[^\d.-]/g, ''));
  return isFinite(x) ? x : n;
}

const v18Entities = v18rows.entities.map((e) => {
  const map = e.colMap || e.map || {};
  return {
    i: e.i,
    name: map['שם המוטב'] || e.name,
    amount: money(map['סכום']),
    checkNo: map['מספר צ׳ק'] || '',
    due: map['תאריך פירעון'] || '',
    bank: map['בנק'] || '',
  };
});

const neuRows = neu.rows.map((r) => ({
  i: r.i,
  name: r.שם,
  amount: money(r.סכום),
  ref: r.אסמכתא,
  intake: r['מספר קליטה'],
  status: r.סטטוס,
}));

const pinsV18 = v18Entities.find((e) => /פינס/.test(e.name));
const pinsNeu = neuRows.filter((e) => /פינס/.test(e.name));
const pinsSum = pinsNeu.reduce((s, r) => s + Number(r.amount), 0);

const audit = {
  metaTable: [
    { field: 'intake number', v18: item1.v18.intakeNumber, neu: item1.neu.intakeNumber, match: item1.v18.intakeNumber === item1.neu.intakeNumber },
    { field: 'category', v18: item1.type, neu: item1.type, match: true },
    { field: 'filename', v18: item1.v18.file, neu: item1.neu.file, match: item1.v18.file === item1.neu.file },
    { field: 'Message ID', v18: item1.v18.messageId, neu: item1.neu.messageId, match: item1.v18.messageId === item1.neu.messageId },
    { field: 'fingerprint', v18: item1.v18.fingerprint, neu: item1.neu.fingerprint, match: item1.v18.fingerprint === item1.neu.fingerprint },
    { field: 'records', v18: item1.v18.records, neu: item1.neu.records, match: item1.v18.records === item1.neu.records },
    { field: 'total amount', v18: item1.v18.amount, neu: item1.neu.amount, match: item1.v18.amount === item1.neu.amount },
    { field: 'entities (unique names)', v18: item1.entities?.v18, neu: item1.entities?.neu, match: item1.entities?.v18 === item1.entities?.neu },
  ],
  v18Rows: v18Entities,
  neuRows,
  fourthRow: {
    which: neuRows[3],
    explanation:
      'NEW row #4 is the second due-month payment for מ.פינס בע"מ (amount 3954). V18 stored one aggregated party total 8319 (=4365+3954).',
    pinsV18Amount: pinsV18?.amount,
    pinsNeuAmounts: pinsNeu.map((p) => p.amount),
    pinsNeuSum: Math.round(pinsSum * 100) / 100,
    sumMatchesV18PartyTotal: Math.abs(Number(pinsV18?.amount) - pinsSum) < 0.02,
  },
  rootCauseRecords: {
    summary:
      'Grain mismatch: V18 #1 stored 3 party-total rows (empty check/due fields). NEW stored 4 payment rows (per due-month) from parseObligoReportGas_/parsePartySegment. Not a TOTAL line, not a duplicate phantom, not missing intake.',
    not: [
      'not a TOTAL/summary row misread',
      'not header/footer',
      'not random cache',
      'not missing fingerprint',
    ],
    codeRefs: {
      newParser: 'parseObligoReportGas_ → parsePartySegment (one payment per month cell)',
      v18StoredShape: 'registry שורות JSON: 3 payee totals with empty מספר צ׳ק/בנק/תאריך פירעון',
      compareNote: item1.note,
    },
  },
  rootCauseIntakeDash: {
    liveNeuIntake: item1.neu.intakeNumber,
    allNeuRowsHaveIntake1: neuRows.every((r) => String(r.intake) === '1'),
    compareCheckIntake: item1.checks.intakeNumber,
    liveStatus: item1.status,
    conclusion:
      'Live data and compareV18 currently have NEW intakeNumber="1" (not missing). If UI showed #—, it was UI/ stale view — not missing sheet data. Current API would render #1.',
    uiSim,
  },
  problemsAre: 'ONE primary data-shape mismatch (3 party totals vs 4 payments). Intake #— is NOT reproduced in live sources.',
  recommendedFix:
    'Reparse/align V18 #1 to payment-level rows (4) using the same obligo matrix parser, without changing intakeNumber/fingerprint/messageId; OR keep party grain on both sides. Do NOT delete NEW payment rows. Do NOT fake PASS in compare by ignoring row #4.',
};

writeFileSync('backups/button19-obligo1-audit/AUDIT-REPORT.json', JSON.stringify(audit, null, 2));
console.log(JSON.stringify(audit, null, 2));
