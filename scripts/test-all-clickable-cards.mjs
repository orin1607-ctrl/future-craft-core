import fs from 'fs';
import vm from 'vm';

const qualifyCode = fs.readFileSync('public/openprospector-qualify.js', 'utf8');
const snap = JSON.parse(fs.readFileSync('public/data/prospector-real-leads-618.json', 'utf8'));
const b2 = JSON.parse(fs.readFileSync('public/data/prospector-batch2-1000.json', 'utf8'));

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
      if (ct.yellowSubtype !== f.yellowSubtype) return false;
    }

    const mobVer = ct.mobileStatus === 'verified';
    const landVer = ct.landlineStatus === 'verified';
    const mailVer = ct.emailStatus === 'verified';
    const verFilter = f.verState;

    if (f.contactType) {
      const t = f.contactType;
      if (t === 'mobile') {
        if (verFilter === 'unverified') { if (ct.mobileStatus !== 'unverified_present') return false; }
        else if (verFilter === 'missing') { if (ct.mobileStatus !== 'missing') return false; }
        else { if (!mobVer) return false; }
      } else if (t === 'landline') {
        if (verFilter === 'unverified') { if (ct.landlineStatus !== 'unverified_present') return false; }
        else if (verFilter === 'missing') { if (ct.landlineStatus !== 'missing') return false; }
        else { if (!landVer) return false; }
      } else if (t === 'email') {
        if (verFilter === 'unverified') { if (ct.emailStatus !== 'unverified_present') return false; }
        else if (verFilter === 'missing') { if (ct.emailStatus !== 'missing') return false; }
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

    return true;
  });
}

const approvedC = C.filter(c => c.isApprovedLead !== false);
const batch2C = C.filter(c => c.discovery_batch === 'batch_2');

const cardsToTest = [
  // 1. איכות הלידים (ניהול לידים)
  { id: 'leads_all', label: 'כל הלידים המאושרים', items: approvedC, filter: {}, expected: 618 },
  { id: 'leads_green', label: '🟢 לידים ירוקים', items: approvedC, filter: { qualColor: 'green' }, expected: 584 },
  { id: 'leads_green_plus', label: '⭐ לידים איכותיים+', items: approvedC, filter: { qualColor: 'green_plus' }, expected: 208 },
  { id: 'leads_yellow', label: '🟡 לידים צהובים', items: approvedC, filter: { qualColor: 'yellow' }, expected: 29 },
  { id: 'leads_red', label: '🔴 לידים אדומים', items: approvedC, filter: { qualColor: 'red' }, expected: 5 },
  { id: 'leads_ready', label: '✅ מוכנים לפנייה', items: approvedC, filter: { readyOnly: true }, expected: 584 },

  // 2. פרטי קשר (ניהול לידים)
  { id: 'leads_ver_mobile', label: '📱 בעלי נייד מאומת', items: approvedC, filter: { contactType: 'mobile', verState: 'verified_only' }, expected: 594 },
  { id: 'leads_ver_landline', label: '☎️ בעלי משרדי מאומת', items: approvedC, filter: { contactType: 'landline', verState: 'verified_only' }, expected: 2 },
  { id: 'leads_ver_email', label: '✉️ בעלי אימייל מאומת', items: approvedC, filter: { contactType: 'email', verState: 'verified_only' }, expected: 605 },
  { id: 'leads_ver_mob_email', label: '📱✉️ נייד ואימייל מאומתים', items: approvedC, filter: { contactType: 'mobile_email', verState: 'verified_only' }, expected: 593 },
  { id: 'leads_ver_land_email', label: '☎️✉️ משרדי ואימייל מאומתים', items: approvedC, filter: { contactType: 'landline_email', verState: 'verified_only' }, expected: 2 },
  { id: 'leads_ver_phone_no_mail', label: '📞 טלפון מאומת ללא אימייל', items: approvedC, filter: { contactType: 'phone_no_email' }, expected: 1 },
  { id: 'leads_ver_mail_no_phone', label: '✉️ אימייל מאומת ללא טלפון', items: approvedC, filter: { contactType: 'email_no_phone' }, expected: 12 },
  { id: 'leads_no_ver_contact', label: '⚠️ ללא אמצעי קשר מאומת', items: approvedC, filter: { contactType: 'no_verified' }, expected: 12 },

  // 3. פילוח צהובים
  { id: 'yellow_A', label: '🟡 צהוב A (טלפון בלבד)', items: approvedC, filter: { qualColor: 'yellow', yellowSubtype: 'A' }, expected: 1 },
  { id: 'yellow_B', label: '🟡 צהוב B (אימייל בלבד)', items: approvedC, filter: { qualColor: 'yellow', yellowSubtype: 'B' }, expected: 12 },
  { id: 'yellow_C', label: '🟡 צהוב C (ללא טלפון/אימייל)', items: approvedC, filter: { qualColor: 'yellow', yellowSubtype: 'C' }, expected: 12 },
  { id: 'yellow_other', label: '🟡 צהוב חוסר אחר (יש טלפון ואימייל)', items: approvedC, filter: { qualColor: 'yellow', yellowSubtype: 'other' }, expected: 4 },

  // 4. צירופים שימושיים
  { id: 'combo_green_mob', label: '🟢 ירוקים עם נייד מאומת', items: approvedC, filter: { qualColor: 'green', contactType: 'mobile', verState: 'verified_only' }, expected: 584 },
  { id: 'combo_green_plus_mob', label: '⭐ ירוק+ עם נייד מאומת', items: approvedC, filter: { qualColor: 'green_plus', contactType: 'mobile', verState: 'verified_only' }, expected: 208 },
  { id: 'combo_green_mob_email', label: '🟢✉️ ירוקים עם נייד ואימייל', items: approvedC, filter: { qualColor: 'green', contactType: 'mobile_email', verState: 'verified_only' }, expected: 584 },
  { id: 'combo_yellow_mob', label: '🟡 צהובים עם נייד מאומת', items: approvedC, filter: { qualColor: 'yellow', contactType: 'mobile', verState: 'verified_only' }, expected: 5 },

  // 5. סבב 2 (חברות שנמצאו)
  { id: 'b2_all', label: '📁 אותרו בסבב 2', items: batch2C, filter: { discoveryBatch: 'batch_2' }, expected: 1000 },
  { id: 'b2_mob', label: '📱 סבב 2 עם נייד מאומת', items: batch2C, filter: { discoveryBatch: 'batch_2', contactType: 'mobile', verState: 'verified_only' }, expected: 999 },
  { id: 'b2_mail', label: '✉️ סבב 2 עם אימייל מאומת', items: batch2C, filter: { discoveryBatch: 'batch_2', contactType: 'email', verState: 'verified_only' }, expected: 1000 },
  { id: 'b2_wf', label: '👥 סבב 2 עם נתון עובדים', items: batch2C, filter: { discoveryBatch: 'batch_2', workforceOnly: true }, expected: 1000 },
  { id: 'b2_fleet', label: '🚛 סבב 2 עם פוטנציאל צי 5+', items: batch2C, filter: { discoveryBatch: 'batch_2', fleet5PlusOnly: true }, expected: 1000 }
];

console.log('================================================================================');
console.log('=== TEST ALL 27 CLICKABLE DASHBOARD CARDS & VERIFIED COUNTS ===');
console.log('================================================================================\n');

let allPassed = true;
cardsToTest.forEach((c, idx) => {
  const result = testFilter(c.items, c.filter);
  const match = result.length === c.expected;
  if (!match) allPassed = false;
  console.log(`[${match ? 'PASS' : 'FAIL'}] #${idx + 1} ${c.label}: Card Count = ${c.expected} | Filtered List Result = ${result.length}`);
});

if (allPassed) {
  console.log('\n>>> SUCCESS! Every single card count EXACTLY matches the filtered list results 100%! <<<');
} else {
  console.error('\n>>> SOME CARDS FAILED! <<<');
  process.exit(1);
}
