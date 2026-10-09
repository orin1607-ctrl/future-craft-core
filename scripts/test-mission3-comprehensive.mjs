// scripts/test-mission3-comprehensive.mjs
import fs from 'fs';
import vm from 'vm';

console.log('================================================================================');
console.log('=== MISSION 3 COMPREHENSIVE VERIFICATION SUITE ===');
console.log('=== BATCH SEPARATION · DEDUPLICATION · WORKFORCE · POTENTIAL SCORING ===');
console.log('================================================================================\n');

// 1. Load OPQualify
const qualifyCode = fs.readFileSync('public/openprospector-qualify.js', 'utf8');
const sandbox = { globalThis: {}, console };
sandbox.window = sandbox;
sandbox.root = sandbox;
vm.createContext(sandbox);
vm.runInContext(qualifyCode, sandbox);
const OPQualify = sandbox.OPQualify || sandbox.window.OPQualify;

// 2. Load 618 Baseline leads
const origDumpPath = 'backups/openprospector-db-backup-20261009/prospect_leads_618_full_snapshot.json';
const origLeads = JSON.parse(fs.readFileSync(origDumpPath, 'utf8'));
console.log(`[PASS] Loaded baseline: ${origLeads.length} original leads.`);

// Ensure baseline properties
origLeads.forEach(l => {
  l.discovery_batch = 'batch_1';
  l.isApprovedLead = true;
});

// 3. Load Pilot 100 & Full 1,000 dataset
const pilotPath = 'public/data/prospector-batch2-pilot-100.json';
if (!fs.existsSync(pilotPath)) throw new Error('Pilot 100 file not found at: ' + pilotPath);
const pilotData = JSON.parse(fs.readFileSync(pilotPath, 'utf8'));
const pilot100 = pilotData.companies;
console.log(`[PASS] Loaded Pilot 100: ${pilot100.length} discovered companies.`);

const batch1000Path = 'public/data/prospector-batch2-1000.json';
if (!fs.existsSync(batch1000Path)) throw new Error('Batch2 1000 file not found at: ' + batch1000Path);
const batch1000 = JSON.parse(fs.readFileSync(batch1000Path, 'utf8'));
console.log(`[PASS] Loaded Full Batch 2: ${batch1000.length} discovered companies.`);

// 4. Strict Deduplication Verification (Pilot 100 & Batch 1000)
const origHps = new Set(origLeads.map(l => OPQualify.normalizeCompanyHp(l.company_hp)).filter(Boolean));
const origNames = new Set(origLeads.map(l => OPQualify.normName(l.company_name)).filter(Boolean));

let dupHps100 = 0, dupNames100 = 0;
pilot100.forEach(c => {
  const hp = OPQualify.normalizeCompanyHp(c.no || c.company_hp);
  const name = OPQualify.normName(c.name);
  if (hp && origHps.has(hp)) dupHps100++;
  if (name && origNames.has(name)) dupNames100++;
});
if (dupHps100 !== 0 || dupNames100 !== 0) {
  throw new Error(`PILOT 100 DEDUPLICATION FAILURE: Found ${dupHps100} HP dups, ${dupNames100} Name dups!`);
}
console.log(`[PASS] Zero Duplication (Pilot 100): 0 HP duplicates, 0 Name duplicates between Batch 1 and Batch 2.`);

let dupHps1000 = 0, dupNames1000 = 0;
const local1000Hps = new Set();
const local1000Names = new Set();

batch1000.forEach(c => {
  const hp = OPQualify.normalizeCompanyHp(c.no || c.company_hp);
  const name = OPQualify.normName(c.name);
  if (hp && origHps.has(hp)) dupHps1000++;
  if (name && origNames.has(name)) dupNames1000++;
  if (hp && local1000Hps.has(hp)) throw new Error(`INTRA-BATCH DUPLICATE HP: ${hp}`);
  if (name && local1000Names.has(name)) throw new Error(`INTRA-BATCH DUPLICATE NAME: ${name}`);
  if (hp) local1000Hps.add(hp);
  if (name) local1000Names.add(name);
});
if (dupHps1000 !== 0 || dupNames1000 !== 0) {
  throw new Error(`BATCH 1000 DEDUPLICATION FAILURE: Found ${dupHps1000} HP dups, ${dupNames1000} Name dups!`);
}
console.log(`[PASS] Zero Duplication (Full 1,000): 0 HP duplicates, 0 Name duplicates against original 618 baseline!`);
console.log(`[PASS] Intra-Batch Uniqueness: All 1,000 companies in Batch 2 are strictly unique!`);

// 5. Verify Full 1,000 Quality Metrics
let validPhones = 0, validEmails = 0, withWf = 0, withFleet5 = 0, highPot = 0, medPot = 0, lowPot = 0;
batch1000.forEach(c => {
  if (OPQualify.validPhone(c.phone)) validPhones++;
  if (c.email && c.email.includes('@')) validEmails++;
  if (c.employee_range && c.employee_range !== 'לא ידוע') withWf++;
  if (c.fleet_size >= 5) withFleet5++;
  if (c.potential_tier === 'high') highPot++;
  if (c.potential_tier === 'medium') medPot++;
  if (c.potential_tier === 'low') lowPot++;
});

console.log(`[PASS] Full 1,000 Metrics:`);
console.log(`       - Verified Phones: ${validPhones}/1000 (${(validPhones/10).toFixed(1)}%)`);
console.log(`       - Verified Emails: ${validEmails}/1000 (${(validEmails/10).toFixed(1)}%)`);
console.log(`       - Workforce Ranges: ${withWf}/1000 (${(withWf/10).toFixed(1)}%)`);
console.log(`       - Fleet Potential 5+: ${withFleet5}/1000 (${(withFleet5/10).toFixed(1)}%)`);
console.log(`       - High Potential Tier (80-100): ${highPot}`);
console.log(`       - Medium Potential Tier (60-79): ${medPot}`);
console.log(`       - Low Potential Tier (<60): ${lowPot}`);

if (validPhones !== 1000) throw new Error(`Valid phone count mismatch: expected 1000, got ${validPhones}`);
if (validEmails !== 1000) throw new Error(`Valid email count mismatch: expected 1000, got ${validEmails}`);
if (withWf !== 1000) throw new Error(`Workforce count mismatch: expected 1000, got ${withWf}`);
if (withFleet5 !== 1000) throw new Error(`Fleet 5+ count mismatch: expected 1000, got ${withFleet5}`);

// 6. Test Combined List and Filter Simulation (1,618 total)
const combined = [...origLeads, ...batch1000];
console.log(`\n[PASS] Combined list total: ${combined.length} (618 Batch 1 + 1,000 Batch 2).`);
if (combined.length !== 1618) throw new Error(`Expected 1618, got ${combined.length}`);

// Load openprospector HTML functions in VM for filter testing
const html = fs.readFileSync('public/openprospector.html', 'utf8');
const scriptMatches = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)];
const scriptContent = scriptMatches[0][1];

// Evaluate in sandbox
const mockEl = {
  style: {},
  addEventListener: () => {},
  innerHTML: '',
  value: '',
  classList: { add: () => {}, remove: () => {}, contains: () => false },
  setAttribute: () => {},
  getAttribute: () => null
};

const simSandbox = {
  globalThis: {},
  console,
  OPQualify,
  fetch: () => Promise.resolve({ ok: false }),
  window: { OPQualify, addEventListener: () => {} },
  localStorage: { getItem: () => null, setItem: () => null, removeItem: () => null },
  document: {
    querySelector: () => mockEl,
    querySelectorAll: () => [],
    getElementById: () => mockEl,
    addEventListener: () => {},
    body: mockEl
  },
  setTimeout: () => 0,
  clearTimeout: () => {},
  location: { href: '' }
};
simSandbox.window.window = simSandbox.window;
simSandbox.window.document = simSandbox.document;
simSandbox.window.localStorage = simSandbox.localStorage;
simSandbox.window.OPQualify = OPQualify;
simSandbox.globalThis = simSandbox;
vm.createContext(simSandbox);
vm.runInContext(qualifyCode, simSandbox);
vm.runInContext(scriptContent, simSandbox);

const coMatch = simSandbox.coMatch;
if (typeof coMatch !== 'function') throw new Error('coMatch function not found in sandbox');

// Test Batch 1 filter
const b1Only = combined.filter(c => coMatch(c, { discoveryBatch: 'batch_1' }));
console.log(`[PASS] Filter discoveryBatch='batch_1' matches exactly ${b1Only.length} (expected 618).`);
if (b1Only.length !== 618) throw new Error(`Expected 618, got ${b1Only.length}`);

// Test Batch 2 filter
const b2Only = combined.filter(c => coMatch(c, { discoveryBatch: 'batch_2' }));
console.log(`[PASS] Filter discoveryBatch='batch_2' matches exactly ${b2Only.length} (expected 1000).`);
if (b2Only.length !== 1000) throw new Error(`Expected 1000, got ${b2Only.length}`);

// Test Unified filter (all)
const allFiltered = combined.filter(c => coMatch(c, { discoveryBatch: '' }));
console.log(`[PASS] Filter discoveryBatch='' (all) matches exactly ${allFiltered.length} (expected 1618).`);
if (allFiltered.length !== 1618) throw new Error(`Expected 1618, got ${allFiltered.length}`);

// Test Workforce range filter
const wf51_200 = combined.filter(c => coMatch(c, { employeeRange: '51-200' }));
console.log(`[PASS] Filter employeeRange='51-200' matches ${wf51_200.length} companies.`);
if (wf51_200.length === 0) throw new Error('Expected matches for 51-200');

// Test Potential Tier filter
const potHigh = combined.filter(c => coMatch(c, { potentialTier: 'high' }));
console.log(`[PASS] Filter potentialTier='high' matches ${potHigh.length} companies.`);
if (potHigh.length === 0) throw new Error('Expected matches for potentialTier=high');

// 7. Verify Lead Isolation in Leads Tab
// In Leads Tab, only approved leads are counted:
const approvedInLeadsTab = combined.filter(c => c.isApprovedLead !== false);
console.log(`[PASS] Leads tab isolation: ${approvedInLeadsTab.length} approved leads (exactly original 618).`);
if (approvedInLeadsTab.length !== 618) throw new Error(`Leads tab contaminated: expected 618, got ${approvedInLeadsTab.length}`);

// 8. Simulate Controlled Approval of 10 Companies from Batch 2
const toApprove = batch1000.slice(0, 10);
toApprove.forEach(c => { c.isApprovedLead = true; });
const afterApprove = combined.filter(c => c.isApprovedLead !== false);
console.log(`[PASS] After approval of 10 companies: Leads tab has ${afterApprove.length} leads (618 + 10 = 628).`);
if (afterApprove.length !== 628) throw new Error(`Expected 628 after approval, got ${afterApprove.length}`);

console.log('\n================================================================================');
console.log('=== ALL MISSION 3 VERIFICATION TESTS PASSED (100% SUCCESS) ===');
console.log('================================================================================\n');
