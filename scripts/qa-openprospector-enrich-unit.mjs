// QA (unit): OpenProspector enrichment logic with MOCK Gemini answers only. Read-only on Supabase.
// Usage: node scripts/qa-openprospector-enrich-unit.mjs
import fs from 'fs';
import vm from 'vm';

const ctx = { globalThis: {} };
vm.runInNewContext(fs.readFileSync('public/openprospector-qualify.js', 'utf8') + '\n' + fs.readFileSync('public/openprospector-enrich.js', 'utf8'), ctx);
const Q = ctx.globalThis.OPQualify, E = ctx.globalThis.OPEnrich;

const html = fs.readFileSync('public/openprospector.html', 'utf8');
const ANON = html.match(/SUPABASE_STAGING_ANON\s*=\s*"([^"]+)"/)[1];
const rows = [];
for (let from = 0; ; from += 1000) {
  const r = await fetch(`https://usfeoerkpcafxxlyuldl.supabase.co/rest/v1/prospect_leads?select=*&order=lead_number.asc`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, Range: `${from}-${from + 999}` } });
  const d = await r.json(); rows.push(...d); if (d.length < 1000) break;
}
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' — ' + d : ''}`); };
check('618 leads loaded (read-only)', rows.length === 618);

// ---- batch selection
const pick = E.selectBatch(rows, new Set(), 20);
const hps = pick.map((r) => r.company_hp);
check('Batch of exactly 20', pick.length === 20);
check('No duplicates in batch', new Set(hps).size === hps.length);
check('No "לא מתאים" in batch', pick.every((r) => Q.evaluate(r).lead_stage !== 'rejected'));
check('All picked are ליד מתאים/איכותי with phone', pick.every((r) => { const q = Q.evaluate(r); return ['qualified', 'quality'].includes(q.lead_stage) && q.field_status.phone.s !== 'n'; }));
check('Prefers missing contact + unverified fleet', pick.every((r) => { const f = Q.evaluate(r).field_status; return f.contact_name.s === 'n' && f.fleet.s !== 'v'; }));
const open = new Set(pick.map((r) => r.id));
check('Lead already in batch is not eligible', !E.eligibility(pick[0], open).ok && E.eligibility(pick[0], open).reason.includes('בתור'));
const rejected = rows.find((r) => Q.evaluate(r).lead_stage === 'rejected');
check('Rejected lead is not eligible', rejected ? !E.eligibility(rejected, new Set()).ok : true, rejected ? rejected.company_name : 'none in DB');
check('Never more than 20 even if asked', E.selectBatch(rows, new Set(), 50).length === 20);

// ---- payload
const lead = pick[0];
const p = E.buildPayload(lead);
check('Payload has required fields', ['company_name', 'company_hp', 'address', 'city', 'website', 'phone', 'industry', 'data_gov_il', 'existing_evidence', 'missing_fields'].every((k) => k in p));
check('Payload carries OVDIM as "not safety officer"', Array.isArray(p.certified_professional_not_safety_officer));
check('Payload has no secrets', !/AIza|x-goog|apikey|GEMINI_API_KEY/i.test(JSON.stringify(p)));

// ---- validation
const ovdimLead = rows.find((r) => r.certified_professional && r.certified_professional.name) || lead;
const J = (findings, extra = {}) => JSON.stringify({ company_hp: String(lead.company_hp), findings, missing_fields: [], notes: '', ...extra });
let v = E.validateResponse('this is not json {', lead);
check('Invalid JSON -> failed, nothing usable', !v.ok && v.error.includes('תשובה לא תקינה') && v.findings.length === 0);
v = E.validateResponse(JSON.stringify({ company_hp: '999999999', findings: [] }), lead);
check('Wrong ח.פ. -> failed', !v.ok && v.error.includes('לא תואם'));
v = E.validateResponse('```json\n' + J([{ field: 'website', value: 'https://example.co.il', source: 'אתר החברה', url: 'https://example.co.il/contact', status: 'verified' }]) + '\n```', lead);
check('Valid JSON (code fence) + source+url -> verified', v.ok && v.findings[0].status === 'verified');
v = E.validateResponse(J([{ field: 'contact_name', value: 'דנה לוי', status: 'verified' }]), lead);
check('Finding without source -> not verified (found)', v.ok && v.findings[0].status === 'found' && v.findings[0].reasons.length > 0);
v = E.validateResponse(J([{ field: 'phone', value: '03-5551234', source: 'Gemini', url: 'https://x.co.il', status: 'verified' }]), lead);
check('AI as source -> not verified', v.ok && v.findings[0].status === 'found');
v = E.validateResponse(JSON.stringify({ company_hp: String(ovdimLead.company_hp), findings: [{ field: 'safety_officer_name', value: ovdimLead.certified_professional ? ovdimLead.certified_professional.name : 'x', source: 'אתר', url: 'https://a.co.il', status: 'verified' }] }), ovdimLead);
check('OVDIM as safety officer -> rejected', v.ok && v.findings.length === 0 && v.warnings.some((w) => w.includes('OVDIM')), ovdimLead.certified_professional ? 'tested with real OVDIM name' : 'no OVDIM in data');
v = E.validateResponse(J([{ field: 'safety_officer_name', value: 'רון אברהם', status: 'verified' }]), lead);
check('Safety officer without source -> found, not verified', v.ok && v.findings[0].status === 'found');
v = E.validateResponse(J([{ field: 'safety_officer_name', value: 'רון אברהם', source: 'פנקס הקבלנים', url: 'https://data.gov.il/x', status: 'verified' }]), lead);
check('Safety officer from contractors registry -> not verified', v.ok && v.findings[0].status === 'found');
v = E.validateResponse(J([{ field: 'fleet_size', value: 40, status: 'verified' }]), lead);
check('Fleet size without proof -> not verified', v.ok && v.findings[0].status === 'found');
v = E.validateResponse(J([{ field: 'fleet_size', value: 'הרבה', source: 'x', url: 'https://x.co.il', status: 'found' }]), lead);
check('Fleet size not a number -> dropped', v.ok && v.findings.length === 0);
v = E.validateResponse(J([{ field: 'phone', value: '12345', source: 'x', url: 'https://x.co.il', status: 'found' }]), lead);
check('Invalid phone -> dropped', v.ok && v.findings.length === 0);
v = E.validateResponse(J([{ field: 'email', value: 'a@b.co.il', status: 'found' }, { field: 'email', value: 'c@d.co.il', source: 's', url: 'https://d.co.il', status: 'verified' }]), lead);
check('Duplicate field -> keeps the verified one', v.ok && v.findings.length === 1 && v.findings[0].value === 'c@d.co.il');
v = E.validateResponse(J([{ field: 'website', status: 'not_found' }, { field: 'email', status: 'not_found' }]), lead);
check('No result -> ok, zero findings, notFound listed', v.ok && v.findings.length === 0 && v.notFound.length === 2);
v = E.validateResponse(J([{ field: 'favorite_color', value: 'blue', status: 'found' }]), lead);
check('Unknown field -> dropped', v.ok && v.findings.length === 0);

// ---- diff / patch: never overwrite, rules decide stage
const withPhone = pick.find((r) => r.phone);
v = E.validateResponse(JSON.stringify({ company_hp: String(withPhone.company_hp), findings: [
  { field: 'phone', value: '03-5559999', source: 'אתר', url: 'https://x.co.il', status: 'verified' },
  { field: 'contact_name', value: 'דנה לוי', source: 'אתר החברה', url: 'https://x.co.il/team', status: 'verified' },
  { field: 'fleet_size', value: 40, status: 'found' },
  { field: 'safety_officer_name', value: 'רון אברהם', status: 'found' },
] }), withPhone);
const d = E.diff(withPhone, v.findings);
check('Existing different phone -> conflict', d.find((f) => f.field === 'phone').change === 'conflict');
const { patch, evidence, conflicts } = E.buildPatch(withPhone, v.findings, { model: 'm', batchId: 'b' });
check('Patch never overwrites existing phone', !('phone' in patch) && conflicts.length === 1);
check('Patch fills empty contact', patch.contact_name === 'דנה לוי');
check('Safety officer written as NOT verified', patch.safety_officer_verified === false);
check('Evidence objects carry source/url/status', evidence.every((e) => 'source' in e && 'url' in e && 'status' in e && e.by === 'gemini'));
check('Conflicting finding not stored as evidence', !evidence.some((e) => e.field === 'phone'));
const after = Q.evaluate({ ...withPhone, ...patch, evidence: [...(withPhone.evidence || []), ...evidence] });
check('After patch: fleet size shown as not verified', after.field_status.fleet_size.s !== 'v');
check('After patch: safety officer not verified', after.field_status.safety_officer.s !== 'v');
check('After patch: contact verified only via source+url', after.field_status.contact_name.s === 'v');
check('ready_for_contact only by rules (fleet unverified -> false)', after.ready_for_contact === false);

// ---- summary / cost / errors
const sm = E.summarize([{ status: 'done', findings: { findings: d }, tokens_used: 100, request_count: 1 }, { status: 'failed', request_count: 2 }]);
check('Summary counts', sm.done === 1 && sm.failed === 1 && sm.contacts === 1 && sm.tokens === 100 && sm.requests === 3);
check('Cost unknown without confirmed prices', E.estimateCost({ promptTokenCount: 1000, candidatesTokenCount: 100 }) === null);
check('402 stops the batch', E.classifyError(402).stop && !E.classifyError(402).retry);
check('429 stops the batch', E.classifyError(429).stop);
check('500 retries once', E.classifyError(500).retry && !E.classifyError(500).stop);

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
