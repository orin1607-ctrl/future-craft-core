import { writeFileSync, readFileSync } from 'node:fs';

const audit = JSON.parse(readFileSync('backups/button19-obligo1-audit/AUDIT-REPORT.json', 'utf8'));
const WEB =
  'https://script.google.com/macros/s/AKfycbz2csN5kyFURg2MV08z70prtszZDXwXdoL8sXxslvO-35BNcRFeAaJpL3sYcZqmyr5f/exec';
const cmp = await (await fetch(WEB + '?action=compareV18&_=' + Date.now())).json();
const i1 = cmp.items.find((i) => String(i.intakeNum) === '1');
const i4 = cmp.items.find((i) => String(i.intakeNum) === '4');

const closeout = {
  phase: 'AUDIT_COMPLETE_FIX_BLOCKED',
  claimComplete: false,
  reason:
    'Cannot reparse V18 #1 from PDF without Gmail access / scripts.run permission / V18 web deploy. Refused to copy NEW→V18 or weaken compare to fake PASS.',
  rootCauseRecords: audit.rootCauseRecords.summary,
  rootCauseIntake: audit.rootCauseIntakeDash.conclusion,
  problemsCount: 1,
  fourthRow: audit.fourthRow,
  metaTable: audit.metaTable,
  v18Rows: audit.v18Rows,
  neuRows: audit.neuRows,
  liveNow: {
    headline: cmp.summary.headline,
    pass: cmp.summary.pass,
    fail: cmp.summary.fail,
    item1Status: i1.status,
    item1Intake: { v18: i1.v18.intakeNumber, neu: i1.neu.intakeNumber },
    item1Records: { v18: i1.v18.records, neu: i1.neu.records },
    item1Amount: { v18: i1.v18.amount, neu: i1.neu.amount },
    entities: i1.entities,
    item4: i4.status,
    has7: cmp.items.some((i) => i.intakeNum === '7'),
    has9: cmp.items.some((i) => i.intakeNum === '9'),
    statuses: cmp.items.map((i) => ({ n: i.intakeNum, s: i.status })),
  },
  blockers: [
    'Local Gmail API: 0 messages for אובליגו (wrong mailbox / no access)',
    'Drive: PDF Metal Comuters Ver 4.31-5.pdf not found',
    'Apps Script scripts.run on V18: 403 permission',
    'User rule: deploy only NEW (cannot deploy V18 web app to expose reparse-one)',
  ],
  preparedButNotExecuted: [
    'V18 IntakeV18_Data: added intakeReparseOneStored_(num) — ready when execution allowed',
  ],
  notDone: [
    'No sheet data rewrite',
    'No compare rule change to hide 4th row',
    'No NEW צקים deletion',
    'No standing/#4 touch',
  ],
  needFromOwner: [
    'Allow V18 web-app deploy for intake-reparse-one&num=1',
    'OR enable scripts.run on IntakeV18 Demo',
    'OR attach/upload Metal Comuters Ver 4.31-5.pdf for local parse',
  ],
};

writeFileSync('backups/button19-obligo1-audit/CLOSEOUT-AUDIT.json', JSON.stringify(closeout, null, 2));
console.log(JSON.stringify(closeout, null, 2));
