import { mkdirSync, writeFileSync } from 'fs';
import { P001 } from './_lib/config.mjs';
import { buildOwnerGatesReport, renderOwnerGatesMarkdown } from './_lib/owner-gates.mjs';

const OUT_JSON = `${P001.auditOut}/owner-gates.json`;
const OUT_MD = `${P001.auditOut}/OWNER-GATES-GBP-ADS.md`;

async function main() {
  const report = buildOwnerGatesReport();
  const md = renderOwnerGatesMarkdown(report);

  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  writeFileSync(OUT_MD, md);

  console.log('\n=== Owner Gates (GBP + Ads) ===\n');
  console.log('GBP blocked:', report.gates.gbp.blocked ? 'YES — Basic API Access' : 'NO');
  console.log('Ads blocked:', report.gates.ads.blocked ? 'YES — Developer Token' : 'NO');
  console.log('\nWritten:', OUT_MD);
  console.log('Written:', OUT_JSON, '\n');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
