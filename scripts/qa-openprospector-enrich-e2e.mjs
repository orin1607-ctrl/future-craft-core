// QA (browser, end-to-end): OpenProspector "העשרת לידים" with MOCKS ONLY.
// - Gemini edge function: mocked per lead (valid / invalid JSON / unsourced / OVDIM / fleet size / no result / conflict / 500 / 402)
// - enrichment tables: in-memory PostgREST mock (nothing written to Supabase)
// - prospect_leads: real READ (anon), every PATCH intercepted and recorded (nothing written)
// - fake user session in storage (no real login, no real token)
// Usage: node scripts/qa-openprospector-enrich-e2e.mjs
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const html = fs.readFileSync('public/openprospector.html', 'utf8');
const ANON = html.match(/SUPABASE_STAGING_ANON\s*=\s*"([^"]+)"/)[1];
const srv = http.createServer((q, r) => {
  const f = path.join(path.resolve('public'), decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' }); r.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(8996, r));

const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' — ' + d : ''}`); };

// ---------- in-memory PostgREST for enrichment tables ----------
const db = { prospect_enrichment_batches: [], prospect_enrichment_items: [], prospect_enrichment_audit: [] };
let auditId = 1;
const now = () => new Date().toISOString();
function filt(rows, sp) {
  for (const [k, v] of sp) {
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
    const [op, ...rest] = v.split('.'); const val = rest.join('.');
    rows = rows.filter((r) => op === 'eq' ? String(r[k]) === val : op === 'neq' ? String(r[k]) !== val : true);
  }
  const o = sp.get('order'); if (o) { const [c, dir] = o.split('.'); rows = [...rows].sort((a, b) => (a[c] > b[c] ? 1 : -1) * (dir === 'desc' ? -1 : 1)); }
  const l = sp.get('limit'); if (l) rows = rows.slice(0, +l);
  return rows;
}
async function pgMock(route) {
  const req = route.request(), u = new URL(req.url()), table = u.pathname.split('/').pop(), m = req.method();
  const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  const send = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  const rows = db[table];
  if (m === 'GET') { const r = filt(rows, u.searchParams); return send(200, single ? r[0] : r); }
  if (m === 'POST') {
    const body = JSON.parse(req.postData()); const list = Array.isArray(body) ? body : [body]; const out = [];
    for (const b of list) {
      let row;
      if (table === 'prospect_enrichment_batches') row = { id: crypto.randomUUID(), status: 'draft', dry_run: true, grounding: true, max_leads: 20, request_count: 0, tokens_used: 0, estimated_cost: null, model: null, enrichment_started_at: null, enrichment_finished_at: null, created_at: now(), ...b };
      if (table === 'prospect_enrichment_items') {
        const bt = db.prospect_enrichment_batches.find((x) => x.id === b.batch_id);
        const n = rows.filter((x) => x.batch_id === b.batch_id).length;
        if (n >= (bt ? bt.max_leads : 20)) return send(400, { message: 'batch cap' });
        if (rows.some((x) => x.batch_id === b.batch_id && x.lead_id === b.lead_id)) return send(409, { message: 'duplicate key' });
        row = { id: crypto.randomUUID(), status: 'queued', attempts: 0, request_count: 0, decision: null, findings: null, error: null, tokens_used: null, created_at: now() + String(rows.length).padStart(4, '0'), ...b };
      }
      if (table === 'prospect_enrichment_audit') row = { id: auditId++, at: now(), ...b };
      rows.push(row); out.push(row);
    }
    return send(201, single ? out[0] : out);
  }
  if (m === 'PATCH') { const p = JSON.parse(req.postData()); const r = filt(rows, u.searchParams); r.forEach((x) => Object.assign(x, p)); return send(200, single ? r[0] : r); }
  if (m === 'DELETE') {
    const r = filt(rows, u.searchParams);
    if (r.some((x) => x.status !== 'queued' || x.attempts > 0)) return send(403, { message: 'policy' });
    db[table] = rows.filter((x) => !r.includes(x)); return send(204, null);
  }
  return send(405, {});
}

// ---------- mocked Gemini answers ----------
const leadPatches = [];
let gemCalls = [], marketingCalls = 0, scenario = {}, delayMs = 0, defaultAnswer = 'none';
const answer = (hp, kind, lead) => {
  const F = (findings) => JSON.stringify({ company_hp: hp, findings, missing_fields: [], notes: 'mock' });
  switch (kind) {
    case 'good': return F([
      { field: 'website', value: 'https://mock-company.co.il', source: 'אתר החברה', url: 'https://mock-company.co.il', status: 'verified' },
      { field: 'contact_name', value: 'דנה לוי', source: 'אתר החברה – צוות', url: 'https://mock-company.co.il/team', status: 'verified' },
      { field: 'contact_role', value: 'מנהלת צי', source: 'אתר החברה – צוות', url: 'https://mock-company.co.il/team', status: 'verified' },
      { field: 'fleet_exists', value: true, source: 'אתר החברה – ציוד', url: 'https://mock-company.co.il/equipment', status: 'verified' }]);
    case 'invalid': return 'Sorry, here is some text { not json';
    case 'unsourced': return F([{ field: 'contact_name', value: 'יוסי כהן', status: 'found' }, { field: 'email', value: 'info@mock.co.il', status: 'found' }]);
    case 'ovdim': return F([{ field: 'safety_officer_name', value: (lead.certified_professional_not_safety_officer || [])[0] || 'אבי מקצוען', source: 'אתר', url: 'https://x.co.il', status: 'verified' }]);
    case 'fleetsize': return F([{ field: 'fleet_size', value: 55, status: 'verified' }, { field: 'fleet_exists', value: true, status: 'found' }]);
    case 'so_nosrc': return F([{ field: 'safety_officer_name', value: 'רון אברהם', status: 'verified' }]);
    case 'none': return F([{ field: 'website', status: 'not_found' }, { field: 'contact_name', status: 'not_found' }]);
    case 'conflict': return F([{ field: 'phone', value: '03-5559999', source: 'דפי זהב', url: 'https://www.d.co.il/x', status: 'verified' }]);
    default: return F([]);
  }
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const USER = `${b64({ alg: 'HS256' })}.${b64({ role: 'authenticated', sub: 'qa-user', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(([t]) => { localStorage.setItem('sb-usfeoerkpcafxxlyuldl-auth-token', JSON.stringify({ access_token: t, refresh_token: 'fake', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'qa-user', email: 'qa@mock.local', aud: 'authenticated', role: 'authenticated' } })); }, [USER]);
const realWrites = [];
await ctx.route('https://usfeoerkpcafxxlyuldl.supabase.co/**', async (route) => {
  const req = route.request(), u = new URL(req.url()), m = req.method();
  if (u.pathname.startsWith('/rest/v1/prospect_enrichment_')) return pgMock(route);
  if (u.pathname === '/functions/v1/prospector-enrich') {
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    const body = JSON.parse(req.postData()); const hp = body.lead.company_hp;
    const auth = req.headers()['authorization'];
    gemCalls.push({ hp, auth, grounding: body.grounding, leads: body.leads });
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const kind = scenario[hp] || defaultAnswer;
    if (kind === 'http500' && gemCalls.filter((c) => c.hp === hp).length === 1) return route.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false, error: 'boom' }) });
    if (kind === 'http402') return route.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false, error: 'Payment required', upstream_status: 402, upstream_reason: 'RESOURCE_EXHAUSTED', model: 'gemini-3.8-flash' }) });
    const text = answer(hp, kind === 'http500' ? 'good' : kind, body.lead);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, text, model: 'gemini-3.8-flash', usage: { promptTokenCount: 800, candidatesTokenCount: 120, totalTokenCount: 1000 }, sources: [{ title: 'mock-company.co.il', uri: 'https://mock-company.co.il' }] }) });
  }
  if (u.pathname.startsWith('/functions/v1/marketing-gemini-chat')) { marketingCalls++; return route.abort(); }
  if (u.pathname.startsWith('/auth/v1/')) return route.fulfill({ status: 400, body: '{}' });
  if (u.pathname.startsWith('/rest/v1/prospect_leads')) {
    if (m === 'GET') { const resp = await route.fetch({ headers: { ...req.headers(), apikey: ANON, authorization: `Bearer ${ANON}` } }); return route.fulfill({ response: resp }); }
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    leadPatches.push({ method: m, url: u.search, body: JSON.parse(req.postData() || '{}') });
    return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
  }
  realWrites.push(m + ' ' + u.pathname);
  return route.abort();
});
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:8996/openprospector.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.S && S.remoteStatus === 'connected', null, { timeout: 30000 });
await page.click('.tabs button[data-tab="enrich"]');
await page.waitForFunction(() => S.en.loaded && S.en.user);
check('Enrich tab loads with user session', await page.evaluate(() => S.en.user === 'qa@mock.local'));

// 1. choose batch of 20
await page.click('[data-act="enPick20"]');
await page.waitForFunction(() => S.en.items.length === 20, null, { timeout: 30000 });
const picked = await page.evaluate(() => S.en.items.map((i) => { const c = enLead(i); const q = QF(c); return { hp: i.company_hp, stage: q.lead_stage, rejected: !!q.rejected_reason, ovdim: (c.enr.certified_professional && c.enr.certified_professional.name) || '' }; }));
check('Batch has 20 leads', picked.length === 20);
check('No duplicates / no "לא מתאים"', new Set(picked.map((p) => p.hp)).size === 20 && picked.every((p) => p.stage !== 'rejected' && !p.rejected));
check('Batch status draft + DRY RUN', await page.evaluate(() => S.en.batch.status === 'draft' && S.en.batch.dry_run === true));
check('No Gemini call while selecting', gemCalls.length === 0);

// remove one, add one manually, re-add duplicate rejected, cap 20 enforced
const removedHp = picked[19].hp;
await page.click(`[data-act="enRemove"][data-item="${await page.evaluate(() => S.en.items[19].id)}"]`);
await page.waitForFunction(() => S.en.items.length === 19);
check('Remove lead from batch', !(await page.evaluate((hp) => S.en.items.some((i) => i.company_hp === hp), removedHp)));
await page.fill('#en-hp', removedHp); await page.click('[data-act="enAddHp"]');
await page.waitForFunction(() => S.en.items.length === 20);
check('Add lead by ח.פ.', await page.evaluate((hp) => S.en.items.some((i) => i.company_hp === hp), removedHp));
await page.fill('#en-hp', picked[0].hp); await page.click('[data-act="enAddHp"]'); await page.waitForTimeout(400);
check('Duplicate lead not added', (await page.evaluate(() => S.en.items.length)) === 20);
const rejectedLead = await page.evaluate(() => { const c = C.find((x) => QF(x) && QF(x).lead_stage === 'rejected'); return c ? c.no : null; });
if (rejectedLead) { await page.evaluate(() => S.en.items.pop()); await page.fill('#en-hp', rejectedLead); await page.click('[data-act="enAddHp"]'); await page.waitForTimeout(400);
  check('"לא מתאים" lead not added', !(await page.evaluate((hp) => S.en.items.some((i) => i.company_hp === hp), rejectedLead))); await page.evaluate(() => enLoad()); await page.waitForFunction(() => S.en.items.length === 20); }

// 2. scenarios per item
const items = await page.evaluate(() => S.en.items.map((i) => ({ hp: i.company_hp, ovdim: (enLead(i).enr.certified_professional || {}).name || '' })));
const kinds = ['good', 'invalid', 'unsourced', 'ovdim', 'fleetsize', 'so_nosrc', 'none', 'conflict', 'http500', 'good', 'http402'];
kinds.forEach((k, i) => { scenario[items[i].hp] = k; });
const ovdimItem = items[3];
await page.evaluate(([hp, name]) => { const c = C.find((x) => x.no === hp); if (!(c.enr.certified_professional && c.enr.certified_professional.name)) c.enr.certified_professional = { name: name || 'אבי מקצוען' }; }, [ovdimItem.hp, ovdimItem.ovdim]);
const ovdimName = await page.evaluate((hp) => C.find((x) => x.no === hp).enr.certified_professional.name, ovdimItem.hp);
scenario[ovdimItem.hp] = 'ovdim';
// make the mock return that exact OVDIM name
await page.evaluate(() => 0);
const ovName = ovdimName;
const origAnswer = answer;

check('No lead write before run', leadPatches.length === 0);
// run -> stops automatically on 402 (item 11)
await page.click('[data-act="enRun"]');
await page.waitForFunction(() => !S.en.running, null, { timeout: 60000 });
let st = await page.evaluate(() => ({ b: S.en.batch.status, err: S.en.err, items: S.en.items.map((i) => ({ hp: i.company_hp, s: i.status, e: i.error, n: (i.findings && i.findings.findings || []).length, a: i.attempts })) }));
check('402 stops the batch (paused)', st.b === 'paused' && st.err.includes('קרדיט'));
check('Leads after the 402 are still queued (not called)', st.items.slice(11).every((x) => x.s === 'queued') && gemCalls.filter((c) => items.slice(11).some((i) => i.hp === c.hp)).length === 0);
const byHp = (hp) => st.items.find((x) => x.hp === hp);
check('Valid JSON -> done with findings', byHp(items[0].hp).s === 'done' && byHp(items[0].hp).n === 4);
check('Invalid JSON -> failed "תשובה לא תקינה"', byHp(items[1].hp).s === 'failed' && byHp(items[1].hp).e.includes('תשובה לא תקינה'));
check('No result -> done, 0 findings', byHp(items[6].hp).s === 'done' && byHp(items[6].hp).n === 0);
check('Conflict with existing phone -> manual review', byHp(items[7].hp).s === 'manual_review');
check('500 -> queued for one retry (not failed)', byHp(items[8].hp).s === 'queued' && byHp(items[8].hp).a === 1);
check('402 lead back in queue, attempt not counted', byHp(items[10].hp).s === 'queued' && byHp(items[10].hp).a === 0 && byHp(items[10].hp).e.includes('קרדיט'));
check('Every call: one lead, real user JWT, grounding flag', gemCalls.every((c) => !c.leads && c.auth === `Bearer ${USER}` && typeof c.grounding === 'boolean'));
const fs3 = await page.evaluate((hp) => S.en.items.find((i) => i.company_hp === hp), items[3].hp);
check('OVDIM as safety officer -> dropped + manual review', fs3.status === 'manual_review' && !(fs3.findings.findings || []).some((f) => f.field === 'safety_officer_name') && fs3.validation.warnings.some((w) => w.includes('OVDIM')), ovName);
const fs4 = await page.evaluate((hp) => S.en.items.find((i) => i.company_hp === hp).findings.findings, items[4].hp);
check('Fleet size without proof -> not verified', fs4.find((f) => f.field === 'fleet_size').status === 'found');
const fs5 = await page.evaluate((hp) => S.en.items.find((i) => i.company_hp === hp).findings.findings, items[5].hp);
check('Safety officer without source -> not verified', fs5.find((f) => f.field === 'safety_officer_name').status === 'found');
const fs2 = await page.evaluate((hp) => S.en.items.find((i) => i.company_hp === hp).findings.findings, items[2].hp);
check('Unsourced contact/email -> "found", not verified', fs2.every((f) => f.status === 'found'));
check('Dry run: still no write to any lead', leadPatches.length === 0);

// cost / tokens tracked
const bt = await page.evaluate(() => S.en.batch);
check('Cost tracking: request_count / tokens / model / started_at', bt.request_count === gemCalls.length && bt.tokens_used === 1000 * (gemCalls.length - 2) && bt.estimated_cost === null && bt.model === 'gemini-3.8-flash' && !!bt.enrichment_started_at,
  `requests=${bt.request_count} tokens=${bt.tokens_used}`);

// 3. resume (402 resolved) and manual stop
defaultAnswer = 'none'; scenario[items[10].hp] = 'none';
delayMs = 400;
await page.click('[data-act="enRun"]');
await page.waitForFunction(() => S.en.running && S.en.items.filter((i) => i.status === 'done').length >= 1, null, { timeout: 30000 });
await page.waitForTimeout(900);
await page.click('[data-act="enStop"]');
await page.waitForFunction(() => !S.en.running, null, { timeout: 30000 });
st = await page.evaluate(() => ({ b: S.en.batch.status, q: S.en.items.filter((i) => i.status === 'queued').length }));
check('Stop button pauses the batch', st.b === 'paused' && st.q > 0, `queued left: ${st.q}`);
delayMs = 0;
await page.click('[data-act="enRun"]');
await page.waitForFunction(() => !S.en.running, null, { timeout: 60000 });
st = await page.evaluate(() => ({ b: S.en.batch.status, q: S.en.items.filter((i) => i.status === 'queued' || i.status === 'running').length, fin: S.en.batch.enrichment_finished_at }));
check('Resume finishes the batch', st.b === 'done' && st.q === 0 && !!st.fin);
check('Each lead called at most twice overall', items.every((i) => gemCalls.filter((c) => c.hp === i.hp).length <= 2));
check('500 lead retried exactly once, then done', (await page.evaluate((hp) => S.en.items.find((i) => i.company_hp === hp).status, items[8].hp)) === 'done' && gemCalls.filter((c) => c.hp === items[8].hp).length === 2);
check('Other leads: exactly one successful call each', items.filter((i) => ![items[8].hp, items[10].hp].includes(i.hp)).every((i) => gemCalls.filter((c) => c.hp === i.hp).length === 1));
check('Still no lead write before approval', leadPatches.length === 0);

// 4. preview + summary
await page.click(`tr[data-item="${await page.evaluate((hp) => S.en.items.find((i) => i.company_hp === hp).id, items[0].hp)}"]`);
const pv = await page.locator('#view').innerText();
check('Preview shows before/after/source/URL/change', ['לפני', 'אחרי', 'מקור', 'URL', 'שינוי', 'דנה לוי', 'אתר החברה', 'mock-company.co.il'].every((t) => pv.includes(t)));
const sm = await page.evaluate(() => OPEnrich.summarize(S.en.items));
check('Batch counters (contacts / failed / manual review / fleet)', sm.contacts === 4 && sm.failed === 1 && sm.manual_review === 3 && sm.fleetIndication === 4 && sm.websites === 3 && sm.officers === 1 && sm.total === 20, JSON.stringify({ c: sm.contacts, f: sm.failed, m: sm.manual_review, fl: sm.fleetIndication, w: sm.websites }));
check('"אשר הכול" blocked while unsourced findings exist', await page.locator('[data-act="enApproveAll"]').isDisabled());

// 5. approve / reject
const it2 = await page.evaluate((hp) => S.en.items.find((i) => i.company_hp === hp).id, items[2].hp);
await page.click(`tr[data-item="${it2}"]`);
await page.click(`[data-act="enReject"][data-item="${it2}"]`);
await page.waitForTimeout(300);
check('Reject -> decision rejected, no lead write', (await page.evaluate((hp) => S.en.items.find((i) => i.company_hp === hp).decision, items[2].hp)) === 'rejected' && leadPatches.length === 0);
await page.click('[data-act="enApproveVerified"]');
await page.waitForFunction(() => S.en.items.some((i) => i.decision === 'approved' || i.decision === 'partial'), null, { timeout: 30000 });
await page.waitForTimeout(800);
const patches = leadPatches.filter((p) => p.method === 'PATCH');
check('Approve verified -> writes only approved leads', patches.length >= 1);
const p0 = patches[0].body;
check('Write: only empty fields, verified findings, evidence with source/url', p0.contact_name === 'דנה לוי' && p0.website && !('phone' in p0) && p0.evidence.filter((e) => e && e.by === 'gemini').every((e) => e.source && e.url && e.status === 'verified'));
check('Write keeps legacy evidence rows', p0.evidence.some((e) => Array.isArray(e)));
check('ready_for_contact decided only by the rules (= stage ready)', typeof p0.ready_for_contact === 'boolean' && p0.ready_for_contact === (p0.lead_stage === 'ready') && Array.isArray(p0.missing_fields), `ready=${p0.ready_for_contact} stage=${p0.lead_stage}`);
check('Conflicting phone never written', !patches.some((p) => 'phone' in p.body));
check('Unsourced findings not written by "approve verified"', !patches.some((p) => (p.evidence || p.body.evidence || []).some((e) => e && e.by === 'gemini' && (!e.source || !e.url))));
// approve a lead manually with an unsourced safety officer -> stored NOT verified
const it5 = await page.evaluate((hp) => S.en.items.find((i) => i.company_hp === hp).id, items[5].hp);
await page.click(`tr[data-item="${it5}"]`);
await page.click(`[data-act="enApprove"][data-item="${it5}"]`);
await page.waitForFunction((id) => S.en.items.find((i) => i.id === id).decision, it5, { timeout: 30000 });
const p5 = leadPatches.filter((p) => p.method === 'PATCH').pop().body;
check('Manual approve of safety officer w/o source -> saved as NOT verified', p5.safety_officer_name === 'רון אברהם' && p5.safety_officer_verified === false && (p5.field_status.safety_officer || {}).s !== 'v');

// 6. audit
const audit = db.prospect_enrichment_audit;
check('Audit log: who/when/model/lead/findings/approved/rejected', ['batch_created', 'lead_added', 'lead_removed', 'run_started', 'call_ok', 'call_invalid', 'call_failed', 'run_stopped', 'run_resumed', 'run_finished', 'approved', 'rejected'].every((a) => audit.some((x) => x.action === a))
  && audit.every((x) => x.actor_email === 'qa@mock.local' && x.at) && audit.some((x) => x.action === 'approved' && x.lead_id && x.model && x.details.findings.length));
check('No API key / token in audit or items', !/AIza|x-goog-api-key|GEMINI_API_KEY|eyJ/i.test(JSON.stringify(db)));
check('marketing-gemini-chat not used by batch', marketingCalls === 0);
check('No real Supabase writes (only mocked)', realWrites.length === 0, realWrites.join(', '));

// 7. lead card status + mobile
await page.evaluate((hp) => { const c = C.find((x) => x.no === hp); S.panel = { co: c.id }; renderPanel(); }, items[0].hp);
check('Lead card shows enrichment status', (await page.locator('#panel').innerText()).includes('העשרת Gemini: הושלם'));
await page.evaluate(() => { S.panel = null; renderPanel(); });
await page.setViewportSize({ width: 390, height: 820 });
await page.click('.tabs button[data-tab="enrich"]');
const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('Mobile 390px: enrich screen has no horizontal overflow', ov <= 0, String(ov));
check('No page errors', errors.length === 0, errors.join(' | '));

await browser.close(); srv.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed · Gemini mock calls: ${gemCalls.length} · lead PATCHes (intercepted): ${leadPatches.length}`);
process.exit(failed ? 1 : 0);
