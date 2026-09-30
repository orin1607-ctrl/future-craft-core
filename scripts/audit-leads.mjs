import fs from 'fs';
import vm from 'vm';

const html = fs.readFileSync('public/openprospector.html', 'utf8');

// Extract C
const startIdx = html.indexOf('const C=[');
const endIdx = html.indexOf('const RUNS=[');
let snippet = html.substring(startIdx, endIdx);
snippet = snippet.replace('const C=[', 'C=[');
const sandbox = { C: [] };
vm.createContext(sandbox);
vm.runInContext(snippet, sandbox);
const C = sandbox.C;

console.log('=== LEAD METRICS AUDIT ===');
console.log('Total companies in system:', C.length);

// Deduplication audit
const ids = new Set();
const nos = new Set();
const names = new Set();
let duplicatesFound = 0;

C.forEach((c) => {
  if (ids.has(c.id)) { console.error('Duplicate ID:', c.id); duplicatesFound++; }
  ids.add(c.id);

  if (c.no && c.no !== 'לא נמצא') {
    if (nos.has(c.no)) { console.error('Duplicate ח.פ.:', c.no, c.name); duplicatesFound++; }
    nos.add(c.no);
  }

  if (names.has(c.name)) { console.error('Duplicate Name:', c.name); duplicatesFound++; }
  names.add(c.name);
});

console.log('Duplicates found:', duplicatesFound);

// Safety Officer Leads
const safetyLeads = C.filter(c => c.isSafetyOfficerLead);
console.log('Total Safety Officer / Fleet Leads:', safetyLeads.length);

let namedOfficers = 0;
let statutoryGovFleet = 0;
let recruitmentSignal = 0;

safetyLeads.forEach(c => {
  const so = c.safetyOfficer;
  const isNamed = so && so.name && !so.name.includes('דרוש') && !so.name.includes('חובת') && !so.name.includes('בתפקיד') && !so.name.includes('במשרה');
  const isRecruitment = so && so.name && so.name.includes('דרוש');

  if (isNamed) namedOfficers++;
  else if (isRecruitment) recruitmentSignal++;
  else statutoryGovFleet++;

  console.log(`[Lead #${c.id}] ${c.name} | ח.פ.: ${c.no} | קצב"ת: ${so ? so.name : 'אין'} (${so ? so.role : ''}) | סוג צי: ${c.fleetType} | צי: ${c.fleet ? c.fleet.val : '—'} | Tier: ${so ? so.tier : '—'} | טלפונים: ${c.multiPhones ? c.multiPhones.length : 1} | מיילים: ${c.multiMails ? c.multiMails.length : 1}`);
});

console.log('\n--- Breakdown ---');
console.log('1. Named Safety Officers / Fleet Managers:', namedOfficers);
console.log('2. Statutory Regulation 579 based on official government fleet registry:', statutoryGovFleet);
console.log('3. Active recruitment job signals (דרושים לקצב"ת):', recruitmentSignal);
console.log('Total Safety Leads:', safetyLeads.length);
