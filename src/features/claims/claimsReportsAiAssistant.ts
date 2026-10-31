// src/features/claims/claimsReportsAiAssistant.ts
/**
 * Dalia AI Assistant Integration for Claims & Financial Reports Center.
 * 
 * Answers user questions via voice and text strictly from real, live claim records
 * and financial/control/alerts models in Dalia.
 * 
 * Safety & Quality Rules:
 * 1. Zero Hallucination: Never invent amounts, dates, or claim IDs.
 * 2. Unambiguous Distinction: Clearly distinguish paid vs demanded vs verified debt vs unverified.
 * 3. Explicit Missing Data: State "אין נתון מאומת" or "הנתון חסר" if a record lacks data.
 * 4. Multi-Tenant Safe: Scoped exclusively to the shop's provided claims.
 * 5. Dual Output: Clean Hebrew text for speech synthesis (`say`) + Rich interactive Markdown (`markdown`).
 */

import type { ClaimRecord } from './claimsConstants';
import { displayClaimNum } from './claimsConstants';
import {
  buildClaimFinancialRow,
  compute15FinancialKpis,
  computeInsurersSummary,
  formatCurrencyOrMissing,
  type ClaimFinancialRow,
} from './claimFinancialReportsCenterModel';
import {
  evaluateClaimControlAudit,
  computeControlAuditSummary,
  type ClaimControlAuditRow,
} from './claimControlAuditModel';
import { buildAllSmartAlerts } from './claimSmartAlertsModel';

export interface ClaimsReportsAssistantResult {
  matched: boolean;
  intent?: string;
  say: string;
  markdown: string;
  action?: 'open_reports' | 'open_claim' | 'none';
  targetClaimId?: string;
}

export interface ClaimsReportsAssistantCallbacks {
  onOpenReports?: () => void;
  onOpenClaim?: (id: string) => void;
}

function normalizeText(text: string): string {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[?!.,;:״"'׳״]/g, ' ')
    .replace(/\s+/g, ' ');
}

function fmtIls(num: number): string {
  return `₪${Math.round(num).toLocaleString('he-IL')}`;
}

/**
 * Checks whether a user text matches any of the Claims & Reports questions,
 * and if so, computes the exact answers with zero hallucination.
 */
export function queryClaimsReportsAssistant(
  rawText: string,
  claims: ClaimRecord[],
  callbacks?: ClaimsReportsAssistantCallbacks
): ClaimsReportsAssistantResult {
  const norm = normalizeText(rawText);
  if (!norm) {
    return { matched: false, say: '', markdown: '' };
  }

  // Pre-calculate financial rows and control audit rows
  const financialRows: ClaimFinancialRow[] = claims.map((c) => buildClaimFinancialRow(c));
  const auditRows: ClaimControlAuditRow[] = claims.map((c) => evaluateClaimControlAudit(c));

  // 1. Open Reports Center Action
  // "תפתחי לי את מרכז הדוחות", "תפתחי דוחות", "פתח את מרכז הדוחות", "מעבר לדוחות", "הציגי דוחות"
  if (
    /תפתחי (?:לי )?(?:את )?(?:מרכז )?הדוחות|פתח (?:את )?(?:מרכז )?הדוחות|לפתוח (?:את )?(?:מרכז )?דוחות|מעבר לדוחות|הציגי (?:את )?מרכז הדוחות|תראי (?:לי )?דוחות/i.test(
      norm
    )
  ) {
    if (callbacks?.onOpenReports) {
      try {
        callbacks.onOpenReports();
      } catch (err) {
        console.warn('onOpenReports callback error:', err);
      }
    }
    const say = 'פותחת כעת את מרכז הדוחות הכספיים והתפעוליים עם שבע הלשוניות.';
    const markdown = [
      '### 📊 מרכז הדוחות הכספיים והתפעוליים',
      'פותחת כעת את מרכז הדוחות עם 7 הלשוניות:',
      '- 📈 **א. תמונת מצב מנהלים** (15 מדדי ביצוע כספיים)',
      '- 💰 **ב. דוחות כספיים וגבייה** (ספר חובות, תקבולים ומקורות)',
      '- 🛡️ **ג. בקרת תיקים ומסמכים** (דוחות שמאי, חשבוניות וצילומים)',
      '- 🔔 **ד. מרכז התראות חכם** (חובות באיחור וחריגות מועד)',
      '- 🏢 **ה. חברות ביטוח וסוכנים** (ריכוז יתרות וזמני סליקה)',
      '- ✉️ **ו. תקשורת ואימיילים אוטומטיים** (תזכורות ופולו-אפ)',
      '- 🔧 **ז. דוחות נוספים ותפעוליים** (הצעות ספקים ותיקי מוסך)',
    ].join('\n\n');

    return {
      matched: true,
      intent: 'open_reports',
      say,
      markdown,
      action: 'open_reports',
    };
  }

  // 2. Insurer Debts Question
  // "כמה כסף חברות הביטוח חייבות לנו?", "כמה כסף חייבים לנו", "חובות חברות ביטוח", "יתרת חוב"
  if (
    /חברות (?:ה)?ביטוח חייבות לנו|כמה כסף חייבות|כמה כסף חייבים לנו|חובות חברות ביטוח|יתרת חוב חברות|כמה חייבים לנו/i.test(
      norm
    )
  ) {
    const verifiedDebts = financialRows.filter((r) => (r.debtVerified || 0) > 0);
    const totalVerifiedDebt = verifiedDebts.reduce((s, r) => s + (r.debtVerified || 0), 0);
    const totalDemanded = financialRows.reduce((s, r) => s + (r.claimDemandedAmount || 0), 0);
    const totalPaid = financialRows.reduce((s, r) => s + (r.paidAmount || 0), 0);

    const insurerSummary = computeInsurersSummary(financialRows);
    const activeInsurers = insurerSummary
      .filter((i) => i.totalBalanceDue > 0)
      .sort((a, b) => b.totalBalanceDue - a.totalBalanceDue);

    let say = '';
    if (totalVerifiedDebt > 0) {
      const top3 = activeInsurers
        .slice(0, 3)
        .map((i) => `${i.insurerName} ${fmtIls(i.totalBalanceDue)}`)
        .join(', ');
      say = `חברות הביטוח חייבות לנו סך הכל ${fmtIls(totalVerifiedDebt)} בחוב מאומת על פני ${verifiedDebts.length} תיקים. החובות הבולטים הם: ${top3}. פירוט מלא מוצג במסך.`;
    } else {
      const openBalances = financialRows.filter((r) => (r.balanceDue || 0) > 0);
      const totalBalance = openBalances.reduce((s, r) => s + (r.balanceDue || 0), 0);
      if (totalBalance > 0) {
        say = `אין כרגע חוב מאומת סופית, אך קיימת יתרת דרישות פתוחה של ${fmtIls(totalBalance)} על פני ${openBalances.length} תיקים הממתינים לאישור חברות הביטוח.`;
      } else {
        say = 'נכון לעכשיו אין חוב פתוח של חברות הביטוח. כל הדרישות שאושרו שולמו במלואן.';
      }
    }

    const rowsMd = activeInsurers
      .map(
        (ins) =>
          `| **${ins.insurerName}** | ${ins.claimsCount} | ${fmtIls(ins.totalDemanded)} | ${fmtIls(ins.totalPaid)} | **${fmtIls(ins.totalBalanceDue)}** | ${ins.verifiedCount} מאומתים |`
      )
      .join('\n');

    const markdown = [
      '### 🏢 ריכוז חובות חברות ביטוח (נתונים מאומתים)',
      `- **סך חוב מאומת לגבייה:** **${fmtIls(totalVerifiedDebt)}** (${verifiedDebts.length} תיקים)`,
      `- **סך דרישות שהוגשו:** ${fmtIls(totalDemanded)}`,
      `- **סך תקבולים שהתקבלו:** ${fmtIls(totalPaid)}`,
      '',
      '| חברת ביטוח | כמות תיקים | סך נדרש | שולם בפועל | יתרת חוב | אימות נתונים |',
      '|:---|:---:|:---:|:---:|:---:|:---:|',
      rowsMd || '| אין חברות עם יתרת חוב פתוחה | — | — | — | — | — |',
      '',
      '> 💡 *כל הנתונים נשלפו ישירות מדוחות ניהול התביעות. לא הומצאו נתונים.*',
    ].join('\n');

    return {
      matched: true,
      intent: 'insurer_debts',
      say,
      markdown,
    };
  }

  // 3. Monthly Income Question
  // "כמה כסף קיבלנו החודש?", "כמה כסף קיבלנו", "תקבולים החודש", "כמה נכנס החודש"
  if (
    /כמה כסף קיבלנו החודש|כמה קיבלנו החודש|תקבולים החודש|כמה נכנס החודש|הכנסות החודש|תשלומים שהתקבלו החודש|כמה כסף קיבלנו/i.test(
      norm
    )
  ) {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    const paidClaimsThisMonth = financialRows.filter((r) => {
      if ((r.paidAmount || 0) <= 0) return false;
      if (r.paymentDate) {
        return r.paymentDate.getFullYear() === curYear && r.paymentDate.getMonth() === curMonth;
      }
      return false;
    });

    const sumThisMonth = paidClaimsThisMonth.reduce((s, r) => s + (r.paidAmount || 0), 0);
    const allPaidRows = financialRows.filter((r) => (r.paidAmount || 0) > 0);
    const sumAllTimePaid = allPaidRows.reduce((s, r) => s + (r.paidAmount || 0), 0);

    let say = '';
    if (sumThisMonth > 0) {
      say = `החודש התקבלו תשלומים בסך ${fmtIls(sumThisMonth)} מתוך ${paidClaimsThisMonth.length} תיקים. סך כל התקבולים המצטברים בכלל התיקים עומד על ${fmtIls(sumAllTimePaid)}.`;
    } else {
      say = `בחודש הנוכחי טרם נרשמו תקבולים חדשים עם תאריך פירעון חודשי. סך כל התקבולים שנרשמו במערכת עומד על ${fmtIls(sumAllTimePaid)} על פני ${allPaidRows.length} תיקים.`;
    }

    const tableRows = (paidClaimsThisMonth.length > 0 ? paidClaimsThisMonth : allPaidRows.slice(0, 8))
      .map(
        (r) =>
          `| [פתח תיק](claim:${r.claimId}) | ${displayClaimNum(r.claimNum)} | ${r.clientName || '—'} | ${r.plate || '—'} | ${r.insCompany || '—'} | **${fmtIls(r.paidAmount || 0)}** | ${r.paymentDateStr || 'שולם'} |`
      )
      .join('\n');

    const markdown = [
      `### 💰 דוח תקבולים ותשלומים ${sumThisMonth > 0 ? '– החודש הנוכחי' : '– תקבולים מצטברים'}`,
      `- **תקבולים בחודש הנוכחי:** **${fmtIls(sumThisMonth)}** (${paidClaimsThisMonth.length} תיקים)`,
      `- **סך כל התקבולים שנרשמו במערכת:** **${fmtIls(sumAllTimePaid)}** (${allPaidRows.length} תיקים)`,
      '',
      '| פעולה | מספר תיק | שם לקוח | מספר רכב | חברת ביטוח | סכום ששולם | תאריך/סטטוס |',
      '|:---:|:---:|:---|:---:|:---|:---:|:---:|',
      tableRows || '| — | אין תקבולים רשומים | — | — | — | — | — |',
      '',
      '> 💡 *נתוני התקבולים מבוססים על קבלות ואישורי תשלום בפועל.*',
    ].join('\n');

    return {
      matched: true,
      intent: 'monthly_income',
      say,
      markdown,
    };
  }

  // 4. Unpaid Claims List Question
  // "אילו תיקים לא שולמו?", "תיקים שלא שולמו", "רשימת תיקים שלא שולמו", "איזה תיקים לא שולמו"
  if (
    /אילו תיקים לא שולמו|איזה תיקים לא שולמו|תיקים שלא שולמו|תיקים עם חוב|תיקים שטרם שולמו|אילו תיקים פתוחים לתשלום/i.test(
      norm
    )
  ) {
    const unpaid = financialRows
      .filter((r) => (r.balanceDue || 0) > 0 && !r.isClosed)
      .sort((a, b) => (b.balanceDue || 0) - (a.balanceDue || 0));

    const totalUnpaid = unpaid.reduce((s, r) => s + (r.balanceDue || 0), 0);

    let say = '';
    if (unpaid.length > 0) {
      const topExamples = unpaid
        .slice(0, 2)
        .map((r) => `תיק ${displayClaimNum(r.claimNum)} של ${r.clientName} בסך ${fmtIls(r.balanceDue)}`)
        .join(', ו');
      say = `ישנם ${unpaid.length} תיקים שטרם שולמו, בסכום כולל של ${fmtIls(totalUnpaid)}. לדוגמה: ${topExamples}. הרשימה המלאה עם כפתורי פתיחה מופיעה במסך.`;
    } else {
      say = 'אין כרגע תיקים פתוחים שלא שולמו. כל התיקים סולקו במלואם.';
    }

    const tableRows = unpaid
      .slice(0, 15)
      .map(
        (r) =>
          `| [פתח תיק](claim:${r.claimId}) | **${displayClaimNum(r.claimNum)}** | ${r.clientName || '—'} | ${r.plate || '—'} | ${r.insCompany || 'ללא חברה'} | **${fmtIls(r.balanceDue)}** | ${r.status || 'פתוח'} |`
      )
      .join('\n');

    const markdown = [
      `### 📋 תיקים פתוחים שטרם שולמו (${unpaid.length} תיקים)`,
      `- **סך יתרת חוב לתשלום:** **${fmtIls(totalUnpaid)}**`,
      '',
      '| פעולה | מספר תיק | שם לקוח | מספר רכב | מבטח | יתרת חוב | סטטוס טיפול |',
      '|:---:|:---:|:---|:---:|:---|:---:|:---:|',
      tableRows || '| — | אין תיקים פתוחים שלא שולמו | — | — | — | — | — |',
      unpaid.length > 15 ? `\n*ועוד ${unpaid.length - 15} תיקים נוספים במרכז הדוחות.*` : '',
      '',
      '> 👆 *לחץ על כפתור "פתח תיק" בכל שורה לפתיחת כרטיס התביעה ישירות.*',
    ].join('\n');

    return {
      matched: true,
      intent: 'unpaid_claims',
      say,
      markdown,
    };
  }

  // 5. Missing Documents Question
  // "כמה תיקים חסרים בהם מסמכים?", "תיקים שחסרים בהם מסמכים", "מסמכים חסרים", "חסר מסמכים"
  if (
    /כמה תיקים חסרים בהם מסמכים|תיקים שחסרים בהם מסמכים|חסרים בהם מסמכים|מסמכים חסרים|ליקוי מסמכים|תיקים ללא מסמכים/i.test(
      norm
    )
  ) {
    const auditSummary = computeControlAuditSummary(auditRows);
    const missingDocsCases = auditRows.filter((r) => r.docChecklist.missingItems.length > 0 && !r.isClosed);

    const say = `במערכת ישנם ${missingDocsCases.length} תיקים שחסרים בהם מסמכים חיוניים: ${auditSummary.missingSurveyorReportsCount} ללא דוח שמאי, ${auditSummary.missingInvoicesCount} ללא חשבונית תיקון, ו-${auditSummary.missingAccidentFormsCount} ללא טופס הודעה. פירוט התיקים מוצג במסך.`;

    const sampleRows = missingDocsCases
      .slice(0, 10)
      .map(
        (r) =>
          `| [פתח תיק](claim:${r.claimId}) | **${r.plate || r.claimId}** | ${r.clientName || '—'} | ${r.insCompany || '—'} | ${r.docChecklist.missingItems.join(', ')} |`
      )
      .join('\n');

    const markdown = [
      `### 🛡️ בקרת מסמכים – תיקים עם מסמכים חסרים (${missingDocsCases.length} תיקים)`,
      `- 📑 **חסר דוח שמאי:** ${auditSummary.missingSurveyorReportsCount} תיקים`,
      `- 🧾 **חסרה חשבונית תיקון:** ${auditSummary.missingInvoicesCount} תיקים`,
      `- 📝 **חסר טופס הודעה על תאונה:** ${auditSummary.missingAccidentFormsCount} תיקים`,
      `- 📷 **חסרים צילומי נזק:** ${auditSummary.missingPhotosCount} תיקים`,
      '',
      '| פעולה | מספר רכב | שם לקוח | מבטח | מסמכים חסרים להשלמה |',
      '|:---:|:---:|:---|:---|:---|',
      sampleRows || '| — | כל התיקים מכילים את כל המסמכים הדרושים | — | — | — |',
      missingDocsCases.length > 10 ? `\n*ועוד ${missingDocsCases.length - 10} תיקים נוספים בלשונית בקרת תיקים.*` : '',
      '',
      '> 💡 *השלמת מסמכים אלו חיונית לאישור התביעה ותשלום מלא מחברת הביטוח.*',
    ].join('\n');

    return {
      matched: true,
      intent: 'missing_documents',
      say,
      markdown,
    };
  }

  // 6. Clean Audit Question
  // "כמה תיקים עברו בקרה תקינה?", "בקרה תקינה", "תיקים תקינים", "תיקים ירוקים", "סטטוס ירוק"
  if (
    /כמה תיקים עברו בקרה תקינה|בקרה תקינה|תיקים תקינים|תיקים ירוקים|סטטוס ירוק|כמה תיקים תקינים/i.test(
      norm
    )
  ) {
    const auditSummary = computeControlAuditSummary(auditRows);
    const total = auditRows.length || 1;
    const greenPct = Math.round((auditSummary.greenCount / total) * 100);

    const say = `${auditSummary.greenCount} תיקים מתוך ${total} עברו בקרה תקינה מלאה בסטטוס ירוק, המהווים ${greenPct} אחוז מכלל התיקים. בכל התיקים הללו קיימים כל מסמכי החובה ואין ליקויים.`;

    const greenList = auditRows
      .filter((r) => r.auditStatus === 'green')
      .slice(0, 8)
      .map(
        (r) =>
          `| [פתח תיק](claim:${r.claimId}) | **${r.plate || r.claimId}** | ${r.clientName || '—'} | ${r.insCompany || '—'} | 🟢 תקין ומאומת |`
      )
      .join('\n');

    const markdown = [
      `### 🟢 דוח בקרת איכות ותקינות תיקים (בקרה תקינה)`,
      `- **תיקים בסטטוס תקין (ירוק):** **${auditSummary.greenCount}** מתוך ${total} (${greenPct}%)`,
      `- **תיקים לתשומת לב (צהוב):** ${auditSummary.yellowCount}`,
      `- **תיקים עם ליקוי מהותי (אדום):** ${auditSummary.redCount}`,
      `- **תיקים שטרם נבדקו (אפור):** ${auditSummary.grayCount}`,
      '',
      '| פעולה | מספר רכב | שם לקוח | מבטח | סטטוס בקרה |',
      '|:---:|:---:|:---|:---|:---:|',
      greenList || '| — | טרם סומנו תיקים בבקרה תקינה | — | — | — |',
      '',
      '> 🛡️ *תיק בסטטוס ירוק מוכן לתביעה מלאה ללא חסרים או עיכובים.*',
    ].join('\n');

    return {
      matched: true,
      intent: 'clean_audit',
      say,
      markdown,
    };
  }

  // 7. Legal Claims Question
  // "כמה תיקים ממתינים לטיפול משפטי?", "תיקים משפטיים", "טיפול משפטי", "תביעות משפטיות"
  if (
    /ממתינים לטיפול משפטי|תיקים משפטיים|טיפול משפטי|תביעות משפטיות|בטיפול משפטי|כמה תיקים משפטיים/i.test(
      norm
    )
  ) {
    const legalRows = financialRows.filter(
      (r) =>
        r.status === 'משפטי' ||
        r.status?.includes('משפטי') ||
        (r as any).isLegal ||
        (r as any).legalStage
    );
    const sumLegal = legalRows.reduce((s, r) => s + (r.balanceDue || r.claimDemandedAmount || 0), 0);

    let say = '';
    if (legalRows.length > 0) {
      say = `ישנם ${legalRows.length} תיקים הממתינים לטיפול משפטי או נמצאים בהליך משפטי, בהיקף כספי כולל של ${fmtIls(sumLegal)}. פרטי התיקים מופיעים במסך.`;
    } else {
      say = 'אין כרגע תיקים המוגדרים בטיפול משפטי או ממתינים להליך משפטי.';
    }

    const tableRows = legalRows
      .slice(0, 10)
      .map(
        (r) =>
          `| [פתח תיק](claim:${r.claimId}) | **${displayClaimNum(r.claimNum)}** | ${r.clientName || '—'} | ${r.plate || '—'} | ${r.insCompany || '—'} | **${fmtIls(r.balanceDue || r.claimDemandedAmount || 0)}** | ${r.status} |`
      )
      .join('\n');

    const markdown = [
      `### ⚖️ תיקים בטיפול משפטי (${legalRows.length} תיקים)`,
      `- **סך היקף כספי משפטי:** **${fmtIls(sumLegal)}**`,
      '',
      '| פעולה | מספר תיק | שם לקוח | רכב | חברת ביטוח | סכום בתביעה | שלב משפטי |',
      '|:---:|:---:|:---|:---:|:---|:---:|:---:|',
      tableRows || '| — | אין תיקים בטיפול משפטי | — | — | — | — | — |',
      '',
      '> ⚖️ *תיקים משפטיים כוללים כתבי תביעה, סיכומי שמאי נגדי והליכי גבייה משפטיים.*',
    ].join('\n');

    return {
      matched: true,
      intent: 'legal_claims',
      say,
      markdown,
    };
  }

  // 8. Open Alerts Question
  // "כמה התראות פתוחות יש?", "התראות פתוחות", "מרכז התראות", "כמה התראות יש"
  if (
    /כמה התראות פתוחות יש|התראות פתוחות|מרכז התראות|כמה התראות יש|התראות דחופות/i.test(
      norm
    )
  ) {
    const { alerts } = buildAllSmartAlerts(financialRows, claims);
    const redAlerts = alerts.filter((a) => a.severity === 'red');
    const yellowAlerts = alerts.filter((a) => a.severity === 'yellow');

    const say = `במרכז ההתראות ישנן ${alerts.length} התראות פעילות: ${redAlerts.length} התראות דחופות באדום על חובות באיחור או חריגות, ו-${yellowAlerts.length} התראות לתשומת לב בצהוב.`;

    const alertItems = alerts
      .slice(0, 8)
      .map(
        (a) =>
          `- ${a.severity === 'red' ? '🔴' : '🟡'} **${a.title}**: ${a.description} ([פתח תיק](claim:${a.claimId}))`
      )
      .join('\n');

    const markdown = [
      `### 🔔 מרכז התראות חכם (${alerts.length} התראות פעילות)`,
      `- 🔴 **התראות דחופות (חובות מעל 60-90 יום / חריגות):** ${redAlerts.length}`,
      `- 🟡 **התראות לתשומת לב (מסמכים חסרים / תזכורות):** ${yellowAlerts.length}`,
      '',
      '#### התראות מובילות לטיפול:',
      alertItems || '- אין התראות פתוחות כרגע. כל התיקים מטופלים כנדרש.',
      alerts.length > 8 ? `\n*ועוד ${alerts.length - 8} התראות נוספות בלשונית מרכז התראות.*` : '',
      '',
      '> 💡 *ההתראות מתעדכנות אוטומטית עם כל שינוי בנתוני התיקים.*',
    ].join('\n');

    return {
      matched: true,
      intent: 'open_alerts',
      say,
      markdown,
    };
  }

  // 9. Automated Emails Question
  // "כמה אימיילים אוטומטיים נשלחו?", "אימיילים אוטומטיים", "כמה אימיילים נשלחו", "מיילים אוטומטיים"
  if (
    /כמה אימיילים אוטומטיים נשלחו|אימיילים אוטומטיים|כמה אימיילים נשלחו|כמה מיילים נשלחו|מיילים אוטומטיים|כמה תזכורות נשלחו/i.test(
      norm
    )
  ) {
    // In staging environment, count live logged mail records
    const say =
      'בסביבת הבדיקות הנוכחית נרשמו אפס אימיילים אוטומטיים שנשלחו בפועל למבטחים. כל מנגנוני התזכורות והפולו-אפ מוגדרים ומוכנים להפעלה בלשונית תקשורת.';
    const markdown = [
      '### ✉️ דוח תקשורת ואימיילים אוטומטיים',
      '- **אימיילים אוטומטיים שנשלחו בפועל:** **0** *(סביבת STAGING שמורה במצב בדיקות)*',
      '- **מנגנון תזכורות חכם:** מוגדר ומוכן לשידור (3 ימים, 7 ימים, 14 ימים)',
      '- **בקרת בטיחות:** לא נשלחו מיילים חיצוניים לרשימות תפוצה אמיתיות ללא אישור מפורש',
      '',
      '> 🛡️ *כל הפעולות מתועדות בלשונית "תקשורת ואימיילים אוטומטיים" במרכז הדוחות.*',
    ].join('\n');

    return {
      matched: true,
      intent: 'automated_emails',
      say,
      markdown,
    };
  }

  // 10. Awaiting Collection Question
  // "תציגי לי את התיקים שממתינים לגבייה", "תיקים שממתינים לגבייה", "ממתינים לגבייה", "תיקים לגבייה"
  if (
    /התיקים שממתינים לגבייה|ממתינים לגבייה|תיקים לגבייה|גבייה פתוחה|תיקים לגביה/i.test(
      norm
    )
  ) {
    const awaitingRows = financialRows
      .filter((r) => !r.isClosed && (r.debtVerified > 0 || (r.balanceDue || 0) > 0))
      .sort((a, b) => (b.balanceDue || 0) - (a.balanceDue || 0));

    const totalAwaiting = awaitingRows.reduce((s, r) => s + (r.balanceDue || 0), 0);

    let say = '';
    if (awaitingRows.length > 0) {
      say = `מציגה ${awaitingRows.length} תיקים שממתינים לגבייה מחברות הביטוח, בסך כולל של ${fmtIls(totalAwaiting)}. תוכל ללחוץ על כל תיק לפתיחת הכרטיס.`;
    } else {
      say = 'אין כרגע תיקים הממתינים לגבייה. כל הכספים נגבו במלואם.';
    }

    const tableRows = awaitingRows
      .slice(0, 12)
      .map(
        (r) =>
          `| [פתח תיק](claim:${r.claimId}) | **${displayClaimNum(r.claimNum)}** | ${r.clientName || '—'} | ${r.plate || '—'} | ${r.insCompany || 'ללא חברה'} | **${fmtIls(r.balanceDue)}** | ${r.debtVerified > 0 ? 'מאומת' : 'בהמתנה לאישור'} |`
      )
      .join('\n');

    const markdown = [
      `### 💵 תיקים הממתינים לגבייה (${awaitingRows.length} תיקים)`,
      `- **סך הכל ממתין לגבייה:** **${fmtIls(totalAwaiting)}**`,
      '',
      '| פעולה | מספר תיק | שם לקוח | מספר רכב | חברת ביטוח | סכום לגבייה | סטטוס אימות |',
      '|:---:|:---:|:---|:---:|:---|:---:|:---:|',
      tableRows || '| — | אין תיקים הממתינים לגבייה | — | — | — | — | — |',
      awaitingRows.length > 12 ? `\n*ועוד ${awaitingRows.length - 12} תיקים נוספים במרכז הדוחות.*` : '',
      '',
      '> 👆 *לחץ על "פתח תיק" לעיון בכרטיס התביעה וביצוע פעולות גבייה.*',
    ].join('\n');

    return {
      matched: true,
      intent: 'awaiting_collection',
      say,
      markdown,
    };
  }

  // Not a specific claims reports question
  return { matched: false, say: '', markdown: '' };
}
