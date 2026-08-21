import { writeFileSync } from 'node:fs';

const WEB =
  'https://script.google.com/macros/s/AKfycbz2csN5kyFURg2MV08z70prtszZDXwXdoL8sXxslvO-35BNcRFeAaJpL3sYcZqmyr5f/exec';

const html = await (await fetch(WEB, { redirect: 'follow' })).text();
const cmp = await (await fetch(WEB + '?action=compareV18&_=' + Date.now(), { redirect: 'follow' })).json();
const i4 = cmp.items.find((i) => String(i.intakeNum) === '4');

const checks = {
  hasP20: html.includes('id="p20"'),
  hasTableHeader: html.includes('NEW v167</th>') || html.includes('data-v18c-detail'),
  hasOpenBtn: html.includes('data-v18c-detail'),
  hasTechBtn: html.includes('data-v18c-tech'),
  noOldFpLine: !html.includes('fingerprint: <code style="font-size:11px'),
  btn19: html.includes('btnV18Compare'),
  headline: cmp.summary.headline,
  pass: cmp.summary.pass,
  fail: cmp.summary.fail,
  nums: cmp.items.map((i) => i.intakeNum),
  statuses: cmp.items.map((i) => ({ n: i.intakeNum, s: i.status })),
  item4: {
    status: i4.status,
    vAmt: i4.v18?.amount,
    nAmt: i4.neu?.amount,
    vRec: i4.v18?.records,
    nRec: i4.neu?.records,
    business: i4.checks?.business,
  },
  has7: cmp.items.some((i) => i.intakeNum === '7'),
  has9: cmp.items.some((i) => i.intakeNum === '9'),
};

writeFileSync('backups/button19-ui-simplify/verify.json', JSON.stringify(checks, null, 2));
console.log(JSON.stringify(checks, null, 2));
