import fs from 'fs';
import vm from 'vm';

const qualifyCode = fs.readFileSync('public/openprospector-qualify.js', 'utf8');
const leadsPath = fs.existsSync('data/prospector/prospector-real-leads-618.json') ? 'data/prospector/prospector-real-leads-618.json' : 'public/data/prospector-real-leads-618.json';
const b2Path = fs.existsSync('data/prospector/prospector-batch2-1000.json') ? 'data/prospector/prospector-batch2-1000.json' : 'public/data/prospector-batch2-1000.json';
const snap = JSON.parse(fs.readFileSync(leadsPath, 'utf8'));
const b2 = JSON.parse(fs.readFileSync(b2Path, 'utf8'));

const sandbox = { globalThis: {}, console };
vm.createContext(sandbox);
vm.runInContext(qualifyCode, sandbox);
const OPQualify = sandbox.globalThis.OPQualify || sandbox.OPQualify;

const C = [];
snap.forEach(r => {
  r.discovery_batch = 'batch_1';
  r.isApprovedLead = true;
  C.push(r);
});
b2.forEach(r => {
  r.discovery_batch = 'batch_2';
  r.isApprovedLead = false;
  C.push(r);
});

function testFilter(items, f) {
  return items.filter(c => {
    const q = OPQualify.evaluate(c);
    const ct = OPQualify.classifyLeadContacts(c, q);

    if (f.discoveryBatch) {
      const b = c.discovery_batch || 'batch_1';
      if (b !== f.discoveryBatch) return false;
    }

    if (f.qualColor) {
      if (f.qualColor === 'green_plus') {
        if (!q || q.lead_quality_color !== 'green' || !q.is_quality_plus) return false;
      } else {
        if ((q ? q.lead_quality_color : 'red') !== f.qualColor) return false;
      }
    }

    if (f.yellowSubtype) {
      if (!ct || ct.yellowSubtype !== f.yellowSubtype) return false;
    }

    const mobVer = ct ? ct.mobileStatus === 'verified' : false;
    const landVer = ct ? ct.landlineStatus === 'verified' : false;
    const mailVer = ct ? ct.emailStatus === 'verified' : false;
    const verFilter = f.verState;

    if (f.contactType) {
      const t = f.contactType;
      if (t === 'mobile') {
        if (verFilter === 'unverified') { if (!ct || ct.mobileStatus !== 'unverified_present') return false; }
        else if (verFilter === 'missing') { if (!ct || ct.mobileStatus !== 'missing') return false; }
        else { if (!mobVer) return false; }
      } else if (t === 'landline') {
        if (verFilter === 'unverified') { if (!ct || ct.landlineStatus !== 'unverified_present') return false; }
        else if (verFilter === 'missing') { if (!ct || ct.landlineStatus !== 'missing') return false; }
        else { if (!landVer) return false; }
      } else if (t === 'email') {
        if (verFilter === 'unverified') { if (!ct || ct.emailStatus !== 'unverified_present') return false; }
        else if (verFilter === 'missing') { if (!ct || ct.emailStatus !== 'missing') return false; }
        else { if (!mailVer) return false; }
      } else if (t === 'mobile_only') {
        if (!mobVer || landVer) return false;
      } else if (t === 'landline_only') {
        if (!landVer || mobVer) return false;
      } else if (t === 'email_only') {
        if (!mailVer || mobVer || landVer) return false;
      } else if (t === 'mobile_email') {
        if (!mobVer || !mailVer) return false;
      } else if (t === 'landline_email') {
        if (!landVer || !mailVer) return false;
      } else if (t === 'phone_email') {
        if (!(mobVer || landVer) || !mailVer) return false;
      } else if (t === 'phone_no_email') {
        if (!(mobVer || landVer) || mailVer) return false;
      } else if (t === 'email_no_phone') {
        if (!mailVer || (mobVer || landVer)) return false;
      } else if (t === 'no_verified') {
        if (mobVer || landVer || mailVer) return false;
      } else if (t === 'all_contacts') {
        if (!mobVer || !landVer || !mailVer) return false;
      }
    } else if (verFilter) {
      if (verFilter === 'verified_only') {
        if (!(mobVer || landVer || mailVer)) return false;
      }
    }

    if (f.readyOnly) {
      if (!q || !q.ready_for_contact) return false;
    }

    if (f.workforceOnly) {
      if (!c.approx_employees && !c.employee_range) return false;
    }

    if (f.fleet5PlusOnly) {
      if (c.potential_tier !== 'high' && !(c.potential_score >= 60)) return false;
    }

    if (f.wfStatus) {
      const curWf = (q ? q.workflow_status : (c.enr?.enrichment_status || 'new'));
      if (f.wfStatus === 'sent_to_ai') {
        if (curWf !== 'sent_to_ai' && c.enr?.enrichment_status !== 'sent_to_ai') return false;
      } else if (f.wfStatus === 'queued_for_ai') {
        if (curWf !== 'queued_for_ai' && c.enr?.enrichment_status !== 'queued_for_ai') return false;
      } else {
        if (curWf !== f.wfStatus) return false;
      }
    }

    return true;
  });
}

const approvedC = C.filter(c => c.isApprovedLead !== false);
const allC = C;

const cardsToTest = [
  // 1. כרטיסי איכות וניהול לידים
  { id: 'total_companies', label: '🏢 סה"כ חברות במערכת', items: allC, targetTab: 'companies', filter: {}, expected: 1618 },
  { id: 'leads_all', label: '📋 סה"כ לידים מאושרים ופעילים', items: approvedC, targetTab: 'leads', filter: {}, expected: 618 },
  { id: 'leads_green', label: '🟢 לידים ירוקים', items: approvedC, targetTab: 'leads', filter: { qualColor: 'green' }, expected: 584 },
  { id: 'leads_green_plus', label: '⭐ לידים איכותיים+', items: approvedC, targetTab: 'leads', filter: { qualColor: 'green_plus' }, expected: 208 },
  { id: 'leads_yellow', label: '🟡 לידים צהובים', items: approvedC, targetTab: 'leads', filter: { qualColor: 'yellow' }, expected: 29 },
  { id: 'leads_red', label: '🔴 לידים אדומים', items: approvedC, targetTab: 'leads', filter: { qualColor: 'red' }, expected: 5 },
  { id: 'leads_ready', label: '✅ מוכנים לפנייה', items: approvedC, targetTab: 'leads', filter: { readyOnly: true }, expected: 584 },

  // 2. ערוצי התקשרות ואימות (כלל החברות במאגר)
  { id: 'all_ver_mobile', label: '📱 נייד מאומת', items: allC, targetTab: 'companies', filter: { contactType: 'mobile', verState: 'verified_only' }, expected: 1593 },
  { id: 'all_ver_landline', label: '☎️ טלפון משרדי מאומת', items: allC, targetTab: 'companies', filter: { contactType: 'landline', verState: 'verified_only' }, expected: 3 },
  { id: 'all_ver_email', label: '✉️ אימייל מאומת', items: allC, targetTab: 'companies', filter: { contactType: 'email', verState: 'verified_only' }, expected: 1605 },
  { id: 'all_ver_mob_email', label: '📱✉️ נייד ואימייל מאומתים', items: allC, targetTab: 'companies', filter: { contactType: 'mobile_email', verState: 'verified_only' }, expected: 1592 },
  { id: 'all_ver_land_email', label: '☎️✉️ טלפון משרדי ואימייל מאומתים', items: allC, targetTab: 'companies', filter: { contactType: 'landline_email', verState: 'verified_only' }, expected: 3 },
  { id: 'all_ver_phone_only', label: '📞 טלפון מאומת בלבד', items: allC, targetTab: 'companies', filter: { contactType: 'phone_no_email' }, expected: 1 },
  { id: 'all_ver_email_only', label: '✉️ אימייל מאומת בלבד', items: allC, targetTab: 'companies', filter: { contactType: 'email_no_phone' }, expected: 12 },
  { id: 'all_no_ver_contact', label: '⚠️ ללא פרטי קשר מאומתים', items: allC, targetTab: 'companies', filter: { contactType: 'no_verified' }, expected: 12 },

  // 3. ארבעת כרטיסי ההעשרה (כלל החברות במאגר)
  { id: 'enr_queued', label: '⏳ ממתין להעשרה', items: allC, targetTab: 'companies', filter: { wfStatus: 'queued_for_ai' }, expected: 0 },
  { id: 'enr_sent', label: '🚀 נשלח להעשרה', items: allC, targetTab: 'companies', filter: { wfStatus: 'sent_to_ai' }, expected: 0 },
  { id: 'enr_candidate_ext', label: '🎯 מועמד להעשרה חיצונית', items: allC, targetTab: 'companies', filter: { wfStatus: 'candidate_external' }, expected: 2 },
  { id: 'enr_sent_ext', label: '🌐 נשלח להעשרה חיצונית', items: allC, targetTab: 'companies', filter: { wfStatus: 'sent_to_external' }, expected: 0 },

  // 4. חלוקת הלידים הצהובים (ניהול לידים)
  { id: 'yellow_A', label: '🟡 צהוב A (טלפון בלבד)', items: approvedC, targetTab: 'leads', filter: { qualColor: 'yellow', yellowSubtype: 'A' }, expected: 1 },
  { id: 'yellow_B', label: '🟡 צהוב B (אימייל בלבד)', items: approvedC, targetTab: 'leads', filter: { qualColor: 'yellow', yellowSubtype: 'B' }, expected: 12 },
  { id: 'yellow_C', label: '🟡 צהוב C (ללא טלפון/אימייל)', items: approvedC, targetTab: 'leads', filter: { qualColor: 'yellow', yellowSubtype: 'C' }, expected: 12 },
  { id: 'yellow_other', label: '🟡 צהוב חוסר אחר (יש טלפון ומייל)', items: approvedC, targetTab: 'leads', filter: { qualColor: 'yellow', yellowSubtype: 'other' }, expected: 4 },

  // 5. צירופים שימושיים ופניות מהירות (ניהול לידים)
  { id: 'combo_green_mob', label: '🟢 ירוקים עם נייד מאומת', items: approvedC, targetTab: 'leads', filter: { qualColor: 'green', contactType: 'mobile', verState: 'verified_only' }, expected: 584 },
  { id: 'combo_green_plus_mob', label: '⭐ ירוק+ עם נייד מאומת', items: approvedC, targetTab: 'leads', filter: { qualColor: 'green_plus', contactType: 'mobile', verState: 'verified_only' }, expected: 208 },
  { id: 'combo_green_mob_email', label: '🟢✉️ ירוקים עם נייד ואימייל', items: approvedC, targetTab: 'leads', filter: { qualColor: 'green', contactType: 'mobile_email', verState: 'verified_only' }, expected: 584 },
  { id: 'combo_yellow_mob', label: '🟡 צהובים עם נייד מאומת', items: approvedC, targetTab: 'leads', filter: { qualColor: 'yellow', contactType: 'mobile', verState: 'verified_only' }, expected: 5 }
];

console.log('================================================================================');
console.log('=== TEST ALL 27 UNIFIED DASHBOARD CARDS & VERIFIED COUNTS ===');
console.log('================================================================================\n');

let allPassed = true;
cardsToTest.forEach((c, idx) => {
  const result = testFilter(c.items, c.filter);
  const match = result.length === c.expected;
  if (!match) allPassed = false;
  console.log(`[${match ? 'PASS' : 'FAIL'}] #${idx + 1} ${c.label} (${c.id}) -> Target: ${c.targetTab} | Card Count = ${c.expected} | Filtered List Result = ${result.length}`);
});

if (allPassed) {
  console.log('\n>>> SUCCESS! Every single card count EXACTLY matches the filtered list results 100%! <<<');
} else {
  console.error('\n>>> SOME CARDS FAILED! <<<');
  process.exit(1);
}
