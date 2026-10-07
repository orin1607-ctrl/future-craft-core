import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const EDGE = `${STAGING_URL}/functions/v1`;

// Load qualify and enrich logic
const ctx = { globalThis: {} };
vm.runInNewContext(
  fs.readFileSync('public/openprospector-qualify.js', 'utf8') + '\n' +
  fs.readFileSync('public/openprospector-enrich.js', 'utf8'),
  ctx
);
const Q = ctx.globalThis.OPQualify;
const E = ctx.globalThis.OPEnrich;

async function runEvaluation() {
  console.log('[QA] Connecting to Staging Supabase and fetching API keys...');
  const keys = JSON.parse(
    execSync(`npx supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' })
  );
  const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key;
  const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;

  if (!service || !anon) throw new Error('Missing service_role or anon key');

  const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1. Fetch 4 selected representative leads from Supabase prospect_leads
  const targetHps = ['512891581', '510761349', '516801214', '516097466'];
  const { data: leads, error: fetchErr } = await admin
    .from('prospect_leads')
    .select('*')
    .in('company_hp', targetHps);

  if (fetchErr) throw new Error('Failed to fetch leads: ' + fetchErr.message);
  console.log(`[QA] Loaded ${leads.length} representative leads from Supabase.`);

  // 2. Create ephemeral super_admin session for prospector-enrich
  const runId = Date.now();
  const email = `eval-qa-${runId}@staging-e2e.local`;
  const password = `Eval!${runId}Aa`;

  console.log('[QA] Creating ephemeral super_admin session for AI enrichment...');
  const createRes = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const uid = createRes.data?.user?.id;
  if (!uid) throw new Error('Failed to create test user: ' + JSON.stringify(createRes.error));

  await admin.from('profiles').upsert({
    id: uid,
    full_name: 'QA Evaluator',
    company_name: 'דליה',
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', uid);
  await admin.from('user_roles').insert({ user_id: uid, role: 'super_admin' });
  await new Promise((r) => setTimeout(r, 600));

  const userClient = createClient(STAGING_URL, anon);
  const { data: auth, error: authErr } = await userClient.auth.signInWithPassword({ email, password });
  if (authErr || !auth?.session?.access_token) throw new Error('Failed to login: ' + (authErr?.message || 'no token'));

  const token = auth.session.access_token;
  const headers = { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 3. Process each lead with Gemini prospector-enrich
  const evaluations = [];

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    console.log(`\n[QA] [${i + 1}/${leads.length}] Researching lead: "${lead.company_name}" (HP: ${lead.company_hp})...`);

    const payload = E.buildPayload(lead);
    const t0 = Date.now();
    let geminiRes = null;
    let geminiError = null;

    try {
      const res = await fetch(`${EDGE}/prospector-enrich`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ lead: payload, grounding: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        geminiRes = data;
        console.log(`  -> HTTP 200 (${Date.now() - t0}ms), model: ${data.model}, sources: ${data.sources?.length || 0}`);
      } else {
        geminiError = data.error || `HTTP ${res.status}`;
        console.warn(`  -> FAILED: HTTP ${res.status}: ${geminiError}`);
      }
    } catch (e) {
      geminiError = e.message;
      console.error(`  -> Exception: ${e.message}`);
    }

    // Parse validation and findings
    let validated = null;
    let findings = [];
    let notFound = [];
    let aiChecked = false;

    if (geminiRes && geminiRes.text) {
      aiChecked = true;
      validated = E.validateResponse(geminiRes.text, lead);
      findings = validated.findings || [];
      notFound = validated.notFound || [];
    }

    // Merge existing lead data + new AI findings to assess current comprehensive state
    const findingMap = {};
    findings.forEach((f) => { findingMap[f.field] = f; });

    // Determine 10 Core Parameter Evaluation
    // 1. Company Name
    const companyName = lead.company_name;
    const companyHp = lead.company_hp;
    const hpVerified = !!(lead.registry_check?.companies?.found || lead.registry_check?.contractors?.found);

    // 2. Phone (Company main phone)
    const phoneVal = lead.phone || findingMap.phone?.value || '';
    const phoneOk = Q.validPhone(phoneVal);
    const phoneVerified = lead.registry_check?.contractors?.records?.some(r => Q.normPhone(r.phone) === Q.normPhone(phoneVal)) || (findingMap.phone?.status === 'verified');

    // 3. Direct / Mobile Phone
    const mobileVal = findingMap.contact_phone?.value || (phoneVal && phoneVal.startsWith('05') ? phoneVal : '');
    const mobileVerified = (findingMap.contact_phone?.status === 'verified') || (phoneVal && phoneVal.startsWith('05') && phoneVerified);

    // 4. Email
    const emailVal = lead.email || findingMap.email?.value || findingMap.contact_email?.value || '';
    const emailVerified = !!(lead.email && lead.registry_check?.contractors?.records?.some(r => r.email?.toLowerCase() === lead.email.toLowerCase())) || (findingMap.email?.status === 'verified');

    // 5. Address / City
    const addressVal = lead.address || lead.city || findingMap.address?.value || '';
    const addressVerified = !!(lead.city || lead.address || findingMap.address?.status === 'verified');

    // 6. Website
    const websiteVal = lead.website || findingMap.website?.value || '';
    const websiteVerified = !!(findingMap.website?.status === 'verified' || (lead.website && !lead.website.includes('לא נמצא')));

    // 7. Contact Person Name
    const contactNameVal = lead.contact_name || findingMap.contact_name?.value || '';
    const contactNameVerified = findingMap.contact_name?.status === 'verified';

    // 8. Contact Role & Decision Maker
    const contactRoleVal = lead.contact_role || findingMap.contact_role?.value || '';
    const isDecisionMaker = /מנכ"?ל|בעלים|דירקטור|מנהל צי|קצין רכב|סמנכ"?ל|שותף/i.test(contactRoleVal);
    const contactRoleVerified = findingMap.contact_role?.status === 'verified';

    // 9. Fleet Indication / Evidence
    const fleetIndication = lead.fleet_type || (findingMap.fleet_exists?.value ? 'אינדיקציית צי קיימת' : '') || (lead.registry_check?.contractors?.found ? 'ציוד כבד / קבלנות רשומה' : '');
    const fleetVerified = (findingMap.fleet_exists?.status === 'verified') || (lead.fleet_info?.s === 'v');

    // 10. Fleet Size / Vehicle Types
    const fleetSizeVal = lead.fleet_size || findingMap.fleet_size?.value || null;
    const fleetSizeVerified = (findingMap.fleet_size?.status === 'verified');

    // Certified Professional (OVDIM) strictly tracked
    const ovdimName = lead.certified_professional?.name || lead.registry_check?.contractors?.records?.[0]?.ovdim || null;

    // Safety Officer
    const safetyOfficerVal = lead.safety_officer_name || findingMap.safety_officer_name?.value || null;
    const safetyOfficerVerified = (lead.safety_officer_verified || findingMap.safety_officer_name?.status === 'verified');

    // EVALUATION OF MISSING FIELDS (out of key business items)
    const missingFields = [];
    const externalMissingFields = [];

    if (!phoneOk) { missingFields.push('חסר טלפון חברה'); externalMissingFields.push('phone'); }
    if (!mobileVal) { missingFields.push('חסר פלאפון / נייד'); externalMissingFields.push('mobile_phone'); }
    if (!findingMap.contact_phone?.value && !phoneVal.startsWith('05')) { missingFields.push('חסר טלפון ישיר'); externalMissingFields.push('direct_phone'); }
    if (!emailVal) { missingFields.push('חסר אימייל'); externalMissingFields.push('email'); }
    if (!contactNameVal) { missingFields.push('חסר איש קשר'); externalMissingFields.push('contact_name'); }
    if (!contactRoleVal) { missingFields.push('חסר תפקיד'); externalMissingFields.push('role'); }
    if (!isDecisionMaker) { missingFields.push('חסר מקבל החלטות'); externalMissingFields.push('decision_maker'); }
    if (!fleetSizeVal) { missingFields.push('חסר גודל חברה / גודל צי'); externalMissingFields.push('company_size'); }
    if (!fleetVerified) { missingFields.push('חסר אימות צי רכב'); externalMissingFields.push('fleet_indication'); }
    if (!websiteVal) { missingFields.push('חסר אתר אינטרנט'); }

    // Missing Data Level & Completeness Score (Base 10 items)
    // 10 core items evaluated:
    // [company_hp_verified, phone_verified, mobile_phone, email, address, website, contact_name, decision_maker, fleet_verified, fleet_size]
    const coreChecks = [
      hpVerified,
      phoneOk && phoneVerified,
      !!mobileVal,
      !!emailVal,
      !!addressVal,
      !!websiteVal,
      !!contactNameVal,
      isDecisionMaker,
      fleetVerified,
      !!fleetSizeVal
    ];
    const verifiedCount = coreChecks.filter(Boolean).length;
    const completenessScore = Math.round((verifiedCount / coreChecks.length) * 100);
    const missingDataPct = 100 - completenessScore;

    let missingLevelLabel = '';
    if (missingDataPct <= 20) missingLevelLabel = 'מצב טוב';
    else if (missingDataPct <= 40) missingLevelLabel = 'חסר מעט מידע';
    else if (missingDataPct <= 60) missingLevelLabel = 'חסר מידע משמעותי';
    else if (missingDataPct <= 80) missingLevelLabel = 'ליד חלש';
    else missingLevelLabel = 'כמעט אין מידע שימושי';

    // AI Status Determination
    let aiStatusLabel = '❌ AI לא אומת';
    let aiStatusBadge = 'unverified';
    if (aiChecked) {
      const verifiedFindings = findings.filter(f => f.status === 'verified');
      if (verifiedFindings.length >= 2) {
        aiStatusLabel = '✅ AI נבדק ואומת';
        aiStatusBadge = 'verified';
      } else if (findings.length > 0) {
        aiStatusLabel = '🟡 AI נבדק חלקית';
        aiStatusBadge = 'partial';
      } else {
        aiStatusLabel = '⚠️ AI נבדק – חסר מידע';
        aiStatusBadge = 'missing_info';
      }
    }

    // Ready for Contact Strict Rules:
    // - Real company confirmed in registry
    // - Important info verified (phone valid & verified)
    // - Good way to contact exists (phone or mobile)
    // - No critical blockers
    // - Relevant for fleet / garage
    const hasContactMethod = phoneOk || !!mobileVal;
    const isRealCompany = hpVerified;
    const isFleetRelevant = /כביש|תשתית|עפר|הובל|שינוע|היסע|אוטובוס|צמ"?ה|משאי/i.test(lead.industry || lead.fleet_type || lead.company_name);
    const hasBlockers = !isRealCompany || !hasContactMethod || !isFleetRelevant;

    const readyForContact = !hasBlockers && phoneVerified && fleetVerified;

    // Recommendation / Next Action
    let nextAction = '';
    if (readyForContact) {
      nextAction = 'מוכן לפנייה';
    } else if (!phoneOk) {
      nextAction = 'להשלים טלפון חברה';
    } else if (!mobileVal) {
      nextAction = 'להשלים פלאפון';
    } else if (!contactNameVal) {
      nextAction = 'לאתר איש קשר';
    } else if (!isDecisionMaker) {
      nextAction = 'לאתר מקבל החלטות';
    } else if (!fleetVerified) {
      nextAction = 'לבדוק צי רכב';
    } else if (findings.length === 0) {
      nextAction = 'לבצע חיפוש נוסף ב-Gemini';
    } else {
      nextAction = 'לבצע בדיקה ידנית';
    }

    // External Enrichment Recommendation & Reason
    let extRec = 'לא נדרש';
    let extReason = '';
    let worthPaying = false;
    let worthPayingReason = '';

    if (readyForContact && mobileVal && isDecisionMaker) {
      extRec = 'לא נדרש';
      extReason = 'המידע הקיים שלם, אומת ברשומות רשמיות וכולל איש קשר ומספר ישיר ליצירת קשר.';
      worthPaying = false;
      worthPayingReason = 'הליד כבר שלם ומאומת ברמה מספקת לפנייה ראשונית; חבל להוציא כסף.';
    } else if (isRealCompany && isFleetRelevant && phoneOk && (!mobileVal || !contactNameVal || !isDecisionMaker)) {
      extRec = 'מומלץ';
      extReason = `החברה אמיתית ורלוונטית מאוד לצי רכב, אך חסר איש קשר ישיר (פלאפון / מקבל החלטות) שלא אותר במקורות החינמיים.`;
      worthPaying = true;
      worthPayingReason = `כן, החברה בעלת צי פוטנציאלי משמעותי; השגת פלאפון ישיר של מקבל החלטות תעלה דרמטית את אחוזי ההמרה.`;
    } else if (isRealCompany && !isFleetRelevant) {
      extRec = 'לא כדאי להשקיע';
      extReason = 'אין אינדיקציה לצי רכב רלוונטי למוסך.';
      worthPaying = false;
      worthPayingReason = 'לא כדאי להשקיע, הליד אינו מתאים לקהל היעד של מוסך ציי רכב.';
    } else {
      extRec = 'אפשרי';
      extReason = 'ניתן להעשיר פרטי קשר נוספים אך מומלץ למצות קודם בדיקה ידנית.';
      worthPaying = false;
      worthPayingReason = 'בשלב זה מומלץ למצות שיחת בירור בטלפון החברה הקיים לפני פנייה לספק בתשלום.';
    }

    evaluations.push({
      lead_id: lead.id,
      company_name: companyName,
      company_hp: companyHp,
      ai_checked: aiChecked ? 'כן' : 'לא',
      ai_status_label: aiStatusLabel,
      ai_status_badge: aiStatusBadge,
      found_data: {
        company_name: companyName,
        website: websiteVal || 'לא נמצא',
        address: addressVal || 'לא צוין',
        phone: phoneVal || 'לא נמצא',
        email: emailVal || 'לא נמצא',
        industry: lead.industry || 'לא צוין',
        company_size: lead.company_size || 'לא צוין',
        fleet_indication: fleetIndication || 'לא צוין',
        contact_name: contactNameVal || 'לא אותר',
        contact_role: contactRoleVal || 'לא אותר',
        is_decision_maker: isDecisionMaker ? 'כן' : 'לא ידוע',
        direct_phone: findingMap.contact_phone?.value || 'לא אותר',
        mobile_phone: mobileVal || 'לא אותר',
        contact_email: findingMap.contact_email?.value || emailVal || 'לא אותר',
      },
      verified_data: {
        hp_verified: hpVerified,
        phone_verified: phoneVerified,
        email_verified: emailVerified,
        fleet_verified: fleetVerified,
        safety_officer_verified: safetyOfficerVerified,
        evidence_sources: [
          ...(lead.evidence || []),
          ...findings.map(f => ({ field: f.field, value: f.value, source: f.source, url: f.url, status: f.status }))
        ].slice(0, 10),
      },
      missing_fields: missingFields,
      missing_data_pct: missingDataPct,
      completeness_score: completenessScore,
      missing_level_label: missingLevelLabel,
      ready_for_contact: readyForContact,
      next_action: nextAction,
      external_enrichment: {
        recommendation: extRec,
        reason: extReason,
        missing_fields: externalMissingFields,
        worth_paying: worthPaying,
        worth_paying_reason: worthPayingReason,
      },
      notes: validated?.notes || lead.notes || '',
    });
  }

  // Cleanup test user
  console.log('\n[QA] Cleaning up ephemeral test user...');
  await admin.from('user_roles').delete().eq('user_id', uid);
  await admin.from('profiles').delete().eq('id', uid);
  await admin.auth.admin.deleteUser(uid);

  // Write evaluation report JSON to scratch
  const outPath = 'scripts/eval-3-5-leads-result.json';
  fs.writeFileSync(outPath, JSON.stringify(evaluations, null, 2), 'utf8');
  console.log(`[QA] Results saved to ${outPath}`);

  return evaluations;
}

runEvaluation()
  .then((res) => {
    console.log('\n======================================================');
    console.log(`[QA SUCCESS] Completed audit on ${res.length} real leads.`);
    console.log('======================================================');
  })
  .catch((e) => {
    console.error('[QA FATAL ERROR]', e);
    process.exit(1);
  });
