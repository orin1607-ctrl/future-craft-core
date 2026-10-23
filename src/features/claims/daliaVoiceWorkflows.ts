// src/features/claims/daliaVoiceWorkflows.ts
// Interactive Voice Conversation Workflows for Dalia AI in Garage Management

import { supabase } from '@/integrations/supabase/client';

export type DaliaWorkflowType =
  | 'new_customer'
  | 'existing_customer'
  | 'intake'
  | 'quote'
  | 'invoices_credits'
  | 'general_expenses'
  | 'find_case'
  | 'close_case'
  | 'resume_action'
  | 'context_quote_add_work'
  | 'context_quote_add_part'
  | 'context_quote_supplement'
  | 'context_pay_balance'
  | 'context_pay_record';

export interface DaliaWorkflowState {
  id: string;
  workflowType: DaliaWorkflowType;
  stepIndex: number;
  subType?: string; // e.g. 'new_quote' | 'supplement' | 'check_invoice' | 'credit'
  caseId?: string | null;
  caseNumber?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerType?: 'private' | 'business';
  vehiclePlate?: string | null;
  vehicleModel?: string | null;
  isVehicleInGarageNow?: boolean;
  complaint?: string | null;
  intakeKm?: string | null;
  intakeFuel?: string | null;
  intakeKeys?: string | null;
  intakeDamages?: string | null;
  intakePhotosWanted?: boolean;
  works: Array<{ desc: string; price: number | null; qty: number; side?: 'right' | 'left' | 'both' }>;
  parts: Array<{ name: string; price: number | null; qty: number }>;
  vatIncluded?: boolean;
  discount?: number;
  supplementText?: string;
  supplementPrice?: number;
  supplementWorks?: string;
  supplementStatus?: 'pending_customer' | 'approved' | 'rejected';
  supplierName?: string;
  invoiceNumber?: string;
  invoiceAmount?: number;
  paymentAmount?: number;
  paymentMethod?: string;
  paymentRef?: string;
  status: 'in_progress' | 'waiting_confirm' | 'executed' | 'cancelled';
  lastPromptSpoken: string;
  lastUpdated: string;
  summaryText?: string;
  searchQuery?: string;
  searchResults?: any[];
}

const STORAGE_KEY = 'dalia_voice_workflow_state';

export function saveVoiceWorkflowState(state: DaliaWorkflowState): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {}
}

export function loadVoiceWorkflowState(): DaliaWorkflowState | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.status === 'in_progress' || parsed.status === 'waiting_confirm')) {
        return parsed as DaliaWorkflowState;
      }
    }
  } catch {}
  return null;
}

export function clearVoiceWorkflowState(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}

export function initWorkflowState(
  type: DaliaWorkflowType,
  context?: Partial<DaliaWorkflowState>
): DaliaWorkflowState {
  const base: DaliaWorkflowState = {
    id: `wf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    workflowType: type,
    stepIndex: 0,
    caseId: context?.caseId || null,
    caseNumber: context?.caseNumber || null,
    customerName: context?.customerName || null,
    customerPhone: context?.customerPhone || null,
    vehiclePlate: context?.vehiclePlate || null,
    vehicleModel: context?.vehicleModel || null,
    works: context?.works ? [...context.works] : [],
    parts: context?.parts ? [...context.parts] : [],
    status: 'in_progress',
    lastPromptSpoken: '',
    lastUpdated: new Date().toISOString(),
  };

  const step = getWorkflowStep(base);
  base.lastPromptSpoken = step.promptText;
  return base;
}

// -----------------------------------------------------------------------------
// Hebrew Speech & Number Parser
// -----------------------------------------------------------------------------

export function parseHebrewPriceOrNumber(raw: string): number | null {
  if (!raw) return null;
  const clean = raw.replace(/,/g, '').trim();

  // 1. Direct digits
  const digitMatch = clean.match(/(\d+(?:\.\d+)?)/);
  if (digitMatch) {
    return parseFloat(digitMatch[1]);
  }

  let sum = 0;
  let matched = false;

  // Thousands
  if (clean.includes('חמשת אלפים')) { sum += 5000; matched = true; }
  else if (clean.includes('ארבעת אלפים')) { sum += 4000; matched = true; }
  else if (clean.includes('שלושת אלפים')) { sum += 3000; matched = true; }
  else if (clean.includes('אלפיים')) { sum += 2000; matched = true; }
  else if (clean.includes('אלף')) { sum += 1000; matched = true; }

  // Hundreds
  if (clean.includes('תשע מאות')) { sum += 900; matched = true; }
  else if (clean.includes('שמונה מאות')) { sum += 800; matched = true; }
  else if (clean.includes('שבע מאות')) { sum += 700; matched = true; }
  else if (clean.includes('שש מאות')) { sum += 600; matched = true; }
  else if (clean.includes('חמש מאות')) { sum += 500; matched = true; }
  else if (clean.includes('ארבע מאות')) { sum += 400; matched = true; }
  else if (clean.includes('שלוש מאות')) { sum += 300; matched = true; }
  else if (clean.includes('מאתיים')) { sum += 200; matched = true; }
  else if (clean.includes('מאה')) { sum += 100; matched = true; }

  // Tens
  if (clean.includes('תשעים')) { sum += 90; matched = true; }
  else if (clean.includes('שמונים')) { sum += 80; matched = true; }
  else if (clean.includes('שבעים')) { sum += 70; matched = true; }
  else if (clean.includes('שישים')) { sum += 60; matched = true; }
  else if (clean.includes('חמישים')) { sum += 50; matched = true; }
  else if (clean.includes('ארבעים')) { sum += 40; matched = true; }
  else if (clean.includes('שלושים')) { sum += 30; matched = true; }
  else if (clean.includes('עשרים')) { sum += 20; matched = true; }
  else if (clean.includes('עשרה') || clean.includes('עשר')) { sum += 10; matched = true; }

  // Units
  if (clean.includes('תשע') || clean.includes('תשעה')) { sum += 9; matched = true; }
  else if (clean.includes('שמונה')) { sum += 8; matched = true; }
  else if (clean.includes('שבע') || clean.includes('שבעה')) { sum += 7; matched = true; }
  else if (clean.includes('שש') || clean.includes('שישה')) { sum += 6; matched = true; }
  else if (clean.includes('חמש') || clean.includes('חמישה')) { sum += 5; matched = true; }
  else if (clean.includes('ארבע') || clean.includes('ארבעה')) { sum += 4; matched = true; }
  else if (clean.includes('שלוש') || clean.includes('שלושה')) { sum += 3; matched = true; }
  else if (clean.includes('שתיים') || clean.includes('שניים') || clean.includes('שתי')) { sum += 2; matched = true; }
  else if (clean.includes('אחת') || clean.includes('אחד')) { sum += 1; matched = true; }

  return matched && sum > 0 ? sum : null;
}

export function extractPlateNumber(raw: string): string | null {
  if (!raw) return null;
  const m = raw.replace(/[^0-9]/g, '');
  if (m.length >= 7 && m.length <= 8) return m;
  return null;
}

export function extractPhoneNumber(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length === 10 && digits.startsWith('05')) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  if (digits.length >= 9 && digits.length <= 11) return digits;
  return null;
}

export type GlobalVoiceCommand =
  | 'stop'
  | 'resume'
  | 'back'
  | 'cancel'
  | 'summary'
  | 'save'
  | 'none';

export function detectGlobalVoiceCommand(text: string): GlobalVoiceCommand {
  const t = text.trim().toLowerCase();
  if (t.includes('תעצרי') || t.includes('עצירה') || t.includes('עצור') || t.includes('להמתין') || t.includes('המתן')) return 'stop';
  if (t.includes('תמשיכי') || t.includes('להמשיך') || t.includes('המשך')) return 'resume';
  if (
    t.includes('חזרה') ||
    t.includes('תחזרי') ||
    t.includes('שאלה קודמת') ||
    t.includes('טעיתי') ||
    t.includes('תיקון') ||
    t.includes('רגע לא') ||
    t.includes('רגע שגיתי') ||
    t.includes('לתקן')
  ) return 'back';
  if (t.includes('בטל') || t.includes('ביטול') || t.includes('לבטל')) return 'cancel';
  if (t.includes('סיכום') || t.includes('תסכמי') || t.includes('סכמי') || t.includes('מה רשמת') || t.includes('מה כבר רשמת')) return 'summary';
  if (t === 'שמור' || t === 'תשמרי' || t === 'כן תשמרי' || t === 'אשר' || t === 'תאשרי' || t === 'אישור' || t === 'כן' || t.includes('תשמרי את') || t.includes('לאשר')) return 'save';
  return 'none';
}

// -----------------------------------------------------------------------------
// Workflow Definitions & Step Progression
// -----------------------------------------------------------------------------

export interface WorkflowStepSpec {
  promptText: string;
  field: string;
  isConfirmation?: boolean;
}

export function getWorkflowStep(state: DaliaWorkflowState): WorkflowStepSpec {
  switch (state.workflowType) {
    case 'new_customer': {
      switch (state.stepIndex) {
        case 0:
          return { promptText: 'שלום, בוא נפתח לקוח חדש במערכת המוסך. מה שם הלקוח?', field: 'customerName' };
        case 1:
          return { promptText: 'מה מספר הטלפון שלו?', field: 'customerPhone' };
        case 2:
          return { promptText: 'האם מדובר בלקוח פרטי או בחברה?', field: 'customerType' };
        case 3:
          return { promptText: 'מה מספר הרכב (לוחית רישוי)?', field: 'vehiclePlate' };
        case 4:
          return { promptText: 'מה היצרן והדגם של הרכב?', field: 'vehicleModel' };
        case 5:
          return { promptText: 'האם הרכב הגיע עכשיו למוסך?', field: 'isVehicleInGarageNow' };
        case 6:
          return { promptText: 'מה הבעיה או התקלה ברכב?', field: 'complaint' };
        case 7:
        default:
          return {
            promptText: buildNewCustomerSummary(state),
            field: 'confirm',
            isConfirmation: true,
          };
      }
    }

    case 'existing_customer': {
      switch (state.stepIndex) {
        case 0:
          return { promptText: 'שלום, בוא נאתר לקוח קיים. מה שם הלקוח, מספר הטלפון או מספר הרכב?', field: 'searchQuery' };
        case 1:
          return {
            promptText: state.customerName
              ? `מצאתי את הלקוח ${state.customerName}. האם ממשיכים טיפול ברכב קיים ${state.vehiclePlate || ''} או מוסיפים לו רכב חדש?`
              : 'לאיזה רכב של הלקוח תרצה להמשיך?',
            field: 'actionChoice'
          };
        case 2:
        default:
          return {
            promptText: state.summaryText || 'האם לפתוח את כרטיס הרכב כעת?',
            field: 'confirm',
            isConfirmation: true,
          };
      }
    }

    case 'intake': {
      switch (state.stepIndex) {
        case 0:
          return { promptText: 'שלום, בוא נקלוט רכב לעבודה ונפתח תיק חדש. מה מספר הרכב?', field: 'vehiclePlate' };
        case 1:
          return { promptText: 'מה תלונת הלקוח או סיבת הכניסה?', field: 'complaint' };
        case 2:
          return { promptText: 'מה הקילומטראז\' הנוכחי של הרכב?', field: 'intakeKm' };
        case 3:
          return { promptText: 'מה מצב הדלק ברכב (לדוגמה: רבע, חצי, מלא)?', field: 'intakeFuel' };
        case 4:
          return { promptText: 'כמה מפתחות נמסרו למוסך?', field: 'intakeKeys' };
        case 5:
          return { promptText: 'האם יש נזקים קיימים ברכב שצריך לציין?', field: 'intakeDamages' };
        case 6:
          return { promptText: 'האם תרצה לצלם תמונות קבלה כעת?', field: 'intakePhotosWanted' };
        case 7:
        default:
          return {
            promptText: buildIntakeSummary(state),
            field: 'confirm',
            isConfirmation: true,
          };
      }
    }

    case 'quote': {
      if (state.subType === 'supplement') {
        switch (state.stepIndex) {
          case 0:
            return { promptText: 'מה התגלה במהלך העבודה הדורש תוספת?', field: 'supplementText' };
          case 1:
            return { promptText: 'האם מוסיפים עבודה, חלק חילוף או שניהם?', field: 'supplementWorks' };
          case 2:
            return { promptText: 'מה המחיר הנוסף של התוספת?', field: 'supplementPrice' };
          case 3:
            return { promptText: 'האם להכין את התוספת כרישום פנימי שממתין לאישור, או שהלקוח כבר אישר?', field: 'supplementStatus' };
          case 4:
          default:
            return {
              promptText: `רשמתי תוספת עבודה: ${state.supplementText || ''}, סכום ₪${(state.supplementPrice || 0).toLocaleString()} [${state.supplementStatus === 'approved' ? 'אושר ע״י הלקוח' : 'רישום פנימי ממתין'}]. ההצעה המקורית נשמרת. האם לשמור?`,
              field: 'confirm',
              isConfirmation: true,
            };
        }
      }

      // New Quote
      switch (state.stepIndex) {
        case 0:
          return { promptText: 'שלום, בוא נכין הצעת מחיר. לאיזה רכב מכינים הצעה, והאם זו הצעה חדשה או תוספת להצעה קיימת?', field: 'quoteScope' };
        case 1:
          return { promptText: 'אילו עבודות נדרשות לביצוע?', field: 'works' };
        case 2:
          return { promptText: 'אילו חלקי חילוף נדרשים לרכב?', field: 'parts' };
        case 3:
          return { promptText: 'האם המחירים כוללים מע"מ? והאם לתת הנחה?', field: 'vatDiscount' };
        case 4:
        default:
          return {
            promptText: buildQuoteSummary(state),
            field: 'confirm',
            isConfirmation: true,
          };
      }
    }

    case 'invoices_credits': {
      switch (state.stepIndex) {
        case 0:
          return { promptText: 'שלום, מה תרצה לעשות בחשבוניות וזיכויים — לבדוק חשבונית, להכין נתוני חשבונית, או לטפל בזיכוי?', field: 'subType' };
        case 1:
          return { promptText: 'מה מספר הרכב או מספר החשבונית?', field: 'invoiceNumber' };
        case 2:
        default:
          return {
            promptText: 'שים לב: מאחר וטרם מחובר ספק חשבוניות חיצוני, המערכת תכין טיוטת נתונים בלבד ולא תציג מסמך כחשבונית חוקית. האם להמשיך?',
            field: 'confirm',
            isConfirmation: true,
          };
      }
    }

    case 'general_expenses': {
      switch (state.stepIndex) {
        case 0:
          return { promptText: 'שלום, בספקים והוצאות כלליות — מה תרצה לעשות: לחפש ספק, לרשום רכישת חלק, או לבדוק חוב לספק?', field: 'subType' };
        case 1:
          return { promptText: 'מה שם הספק?', field: 'supplierName' };
        case 2:
        default:
          return {
            promptText: state.summaryText || 'האם לפתוח את כרטסת הספק?',
            field: 'confirm',
            isConfirmation: true,
          };
      }
    }

    case 'find_case': {
      switch (state.stepIndex) {
        case 0:
          return { promptText: 'שלום, איזה תיק עבודה אתה מחפש? אפשר לומר מספר רכב, שם לקוח או מספר תיק.', field: 'searchQuery' };
        case 1:
        default:
          return {
            promptText: state.summaryText || 'מצאתי את התיק. תרצה לשמוע סטטוס, לראות עבודות, לבדוק חוב או לפתוח אותו?',
            field: 'actionChoice'
          };
      }
    }

    case 'close_case': {
      switch (state.stepIndex) {
        case 0:
          return { promptText: 'שלום, איזה תיק עבודה תרצה לסגור? אמור מספר רכב או מספר תיק.', field: 'caseRef' };
        case 1:
        default:
          return {
            promptText: state.summaryText || 'בודק מוכנות לסגירה...',
            field: 'confirm',
            isConfirmation: true,
          };
      }
    }

    case 'resume_action': {
      return {
        promptText: state.summaryText || 'מצאתי את הפעולה האחרונה שלך. תרצה להמשיך מאותה נקודה?',
        field: 'confirm',
        isConfirmation: true,
      };
    }

    // Contextual Screen Workflows
    case 'context_quote_add_work': {
      switch (state.stepIndex) {
        case 0:
          return { promptText: 'איזו עבודה להוסיף להצעה, ומה המחיר?', field: 'works' };
        case 1:
        default:
          return {
            promptText: `נוספה עבודה: ${state.works[state.works.length - 1]?.desc || ''} במחיר ₪${(state.works[state.works.length - 1]?.price || 0).toLocaleString()}. לשמור בהצעה?`,
            field: 'confirm',
            isConfirmation: true,
          };
      }
    }

    case 'context_quote_add_part': {
      switch (state.stepIndex) {
        case 0:
          return { promptText: 'איזה חלק חילוף להוסיף, ומה המחיר?', field: 'parts' };
        case 1:
        default:
          return {
            promptText: `נוסף חלק: ${state.parts[state.parts.length - 1]?.name || ''} במחיר ₪${(state.parts[state.parts.length - 1]?.price || 0).toLocaleString()}. לשמור בהצעה?`,
            field: 'confirm',
            isConfirmation: true,
          };
      }
    }

    case 'context_quote_supplement': {
      switch (state.stepIndex) {
        case 0:
          return { promptText: 'מה התוספת הנדרשת להצעת המחיר?', field: 'supplementText' };
        case 1:
          return { promptText: 'מה המחיר של התוספת?', field: 'supplementPrice' };
        case 2:
          return { promptText: 'האם התוספת כבר אושרה ע״י הלקוח, או שהיא רישום פנימי שממתין לאישור?', field: 'supplementStatus' };
        case 3:
        default:
          return {
            promptText: `תוספת: ${state.supplementText || ''}, סכום ₪${(state.supplementPrice || 0).toLocaleString()} [${state.supplementStatus === 'approved' ? 'מאושר לקוח' : 'ממתין'}]. לשמור?`,
            field: 'confirm',
            isConfirmation: true,
          };
      }
    }

    case 'context_pay_balance':
    case 'context_pay_record': {
      switch (state.stepIndex) {
        case 0:
          return { promptText: 'מה סכום התשלום, ובאיזה אמצעי (מזומן, אשראי, העברה, צ\'ק)?', field: 'paymentDetails' };
        case 1:
        default:
          return {
            promptText: `רישום תשלום ע״ס ₪${(state.paymentAmount || 0).toLocaleString()} ב${state.paymentMethod || 'מזומן'}. האם לבצע כעת?`,
            field: 'confirm',
            isConfirmation: true,
          };
      }
    }

    default:
      return { promptText: 'איך אוכל לעזור לך כעת?', field: 'free' };
  }
}

// -----------------------------------------------------------------------------
// Summary Builders
// -----------------------------------------------------------------------------

function buildNewCustomerSummary(state: DaliaWorkflowState): string {
  const parts: string[] = [];
  if (state.customerName) parts.push(`לקוח: ${state.customerName}`);
  if (state.customerPhone) parts.push(`טלפון: ${state.customerPhone}`);
  if (state.customerType) parts.push(`סוג: ${state.customerType === 'business' ? 'עסקי' : 'פרטי'}`);
  if (state.vehiclePlate) parts.push(`רכב: ${state.vehiclePlate}`);
  if (state.vehicleModel) parts.push(`דגם: ${state.vehicleModel}`);
  if (state.complaint) parts.push(`תלונה: ${state.complaint}`);

  return `סיימנו לאסוף את הפרטים: ${parts.join(', ')}. האם לשמור וליצור את כרטיס העבודה במערכת?`;
}

function buildIntakeSummary(state: DaliaWorkflowState): string {
  const parts: string[] = [];
  if (state.vehiclePlate) parts.push(`רכב: ${state.vehiclePlate}`);
  if (state.complaint) parts.push(`תלונה: ${state.complaint}`);
  if (state.intakeKm) parts.push(`ק"מ: ${state.intakeKm}`);
  if (state.intakeFuel) parts.push(`דלק: ${state.intakeFuel}`);
  if (state.intakeKeys) parts.push(`מפתחות: ${state.intakeKeys}`);
  if (state.intakeDamages) parts.push(`נזקים: ${state.intakeDamages}`);

  return `סיכום קליטת הרכב: ${parts.join(', ')}. האם לשמור את קבלת הרכב בתיק?`;
}

function buildQuoteSummary(state: DaliaWorkflowState): string {
  const worksStr = state.works.map(w => `${w.desc} (${w.price ? '₪' + w.price.toLocaleString() : 'ללא מחיר'})`).join(', ');
  const partsStr = state.parts.map(p => `${p.name} (${p.price ? '₪' + p.price.toLocaleString() : 'ללא מחיר'})`).join(', ');
  
  const totalNet = state.works.reduce((s, w) => s + (w.price || 0), 0) + state.parts.reduce((s, p) => s + (p.price || 0), 0);
  const totalGross = Math.round(totalNet * 1.18);

  return `סיכום הצעת המחיר: עבודות: [${worksStr || 'ללא'}], חלפים: [${partsStr || 'ללא'}]. סה"כ לתשלום: ₪${totalGross.toLocaleString()} כולל 18% מע"מ. האם להפיק את הצעת המחיר?`;
}

// -----------------------------------------------------------------------------
// Interactive Voice Input Processor
// -----------------------------------------------------------------------------

export function processVoiceAnswer(
  userText: string,
  currentState: DaliaWorkflowState
): { nextState: DaliaWorkflowState; promptToSpeak: string; shouldExecuteAction?: boolean } {
  const text = userText.trim();
  const next: DaliaWorkflowState = { ...currentState, lastUpdated: new Date().toISOString() };

  // 1. Check Global Control Commands
  const cmd = detectGlobalVoiceCommand(text);
  if (cmd === 'stop') {
    next.lastPromptSpoken = 'עצרתי את ההאזנה. כשתרצה להמשיך, אמור "דליה תמשיכי" או לחץ על כפתור ההמשך.';
    saveVoiceWorkflowState(next);
    return { nextState: next, promptToSpeak: next.lastPromptSpoken };
  }
  if (cmd === 'back') {
    if (next.stepIndex > 0) next.stepIndex -= 1;
    const spec = getWorkflowStep(next);
    next.lastPromptSpoken = `הבנתי, בוא נתקן את התשובה. ${spec.promptText}`;
    saveVoiceWorkflowState(next);
    return { nextState: next, promptToSpeak: next.lastPromptSpoken };
  }
  if (cmd === 'cancel') {
    next.status = 'cancelled';
    clearVoiceWorkflowState();
    return { nextState: next, promptToSpeak: 'ביטלתי את הפעולה. חזרנו לתפריט הראשי.' };
  }
  if (cmd === 'summary') {
    const spec = getWorkflowStep(next);
    const summary = spec.isConfirmation ? spec.promptText : `עד כה רשמנו: ${buildStateRecap(next)}. מה התשובה לשאלה: ${spec.promptText}`;
    next.lastPromptSpoken = summary;
    saveVoiceWorkflowState(next);
    return { nextState: next, promptToSpeak: summary };
  }
  if (cmd === 'save') {
    next.status = 'waiting_confirm';
    saveVoiceWorkflowState(next);
    return { nextState: next, promptToSpeak: 'מבצעת את השמירה במערכת כעת.', shouldExecuteAction: true };
  }

  // 2. Check Natural Speech Adjustments
  // e.g. "תורידי מאתיים", "תעלי מאה"
  if (text.includes('תורידי') || text.includes('תוריד') || text.includes('להוריד')) {
    const amount = parseHebrewPriceOrNumber(text);
    if (amount) {
      if (next.works.length > 0) {
        const last = next.works[next.works.length - 1];
        last.price = Math.max(0, (last.price || 0) - amount);
        const prompt = `הורדתי ₪${amount}. המחיר המעודכן הוא ₪${(last.price).toLocaleString()}. מה השלב הבא?`;
        next.lastPromptSpoken = prompt;
        saveVoiceWorkflowState(next);
        return { nextState: next, promptToSpeak: prompt };
      }
    }
  }

  if (text.includes('התכוונתי לימין') || text.includes('צד ימין')) {
    if (next.works.length > 0) {
      next.works[next.works.length - 1].side = 'right';
      const prompt = `עדכנתי לצד ימין. נמשיך?`;
      next.lastPromptSpoken = prompt;
      saveVoiceWorkflowState(next);
      return { nextState: next, promptToSpeak: prompt };
    }
  }
  if (text.includes('התכוונתי לשמאל') || text.includes('צד שמאל')) {
    if (next.works.length > 0) {
      next.works[next.works.length - 1].side = 'left';
      const prompt = `עדכנתי לצד שמאל. נמשיך?`;
      next.lastPromptSpoken = prompt;
      saveVoiceWorkflowState(next);
      return { nextState: next, promptToSpeak: prompt };
    }
  }

  // 3. Process field based on workflow & current step
  const spec = getWorkflowStep(next);

  // If in confirmation step
  if (spec.isConfirmation) {
    if (text.includes('כן') || text.includes('שמור') || text.includes('תשמרי') || text.includes('אשר') || text.includes('בסדר') || text.includes('מעולה')) {
      next.status = 'waiting_confirm';
      saveVoiceWorkflowState(next);
      return { nextState: next, promptToSpeak: 'מאשרת ומבצעת את הפעולה כעת.', shouldExecuteAction: true };
    }
    if (text.includes('לא') || text.includes('בטל') || text.includes('אל תשמרי')) {
      next.status = 'cancelled';
      clearVoiceWorkflowState();
      return { nextState: next, promptToSpeak: 'הפעולה בוטלה לבקשתך ולא נשמרה.' };
    }
  }

  // Value parsing per field
  switch (spec.field) {
    case 'customerName':
      next.customerName = cleanName(text);
      next.stepIndex += 1;
      break;

    case 'customerPhone': {
      const phone = extractPhoneNumber(text) || text;
      next.customerPhone = phone;
      next.stepIndex += 1;
      break;
    }

    case 'customerType':
      next.customerType = text.includes('חבר') || text.includes('עסק') ? 'business' : 'private';
      next.stepIndex += 1;
      break;

    case 'vehiclePlate': {
      const plate = extractPlateNumber(text) || text.replace(/[^0-9A-Za-z]/g, '');
      next.vehiclePlate = plate;
      next.stepIndex += 1;
      break;
    }

    case 'vehicleModel':
      next.vehicleModel = text;
      next.stepIndex += 1;
      break;

    case 'isVehicleInGarageNow':
      next.isVehicleInGarageNow = text.includes('כן') || text.includes('הגיע') || text.includes('במוסך');
      next.stepIndex += 1;
      break;

    case 'complaint':
      next.complaint = text;
      next.stepIndex += 1;
      break;

    case 'intakeKm':
      next.intakeKm = String(parseHebrewPriceOrNumber(text) || text.replace(/[^0-9]/g, ''));
      next.stepIndex += 1;
      break;

    case 'intakeFuel':
      next.intakeFuel = text;
      next.stepIndex += 1;
      break;

    case 'intakeKeys':
      next.intakeKeys = text;
      next.stepIndex += 1;
      break;

    case 'intakeDamages':
      next.intakeDamages = text;
      next.stepIndex += 1;
      break;

    case 'intakePhotosWanted':
      next.intakePhotosWanted = text.includes('כן') || text.includes('רוצה') || text.includes('צלם');
      next.stepIndex += 1;
      break;

    case 'works': {
      const parsedWork = parseWorkLine(text);
      if (parsedWork) {
        next.works.push(parsedWork);
      } else {
        next.works.push({ desc: text, price: null, qty: 1 });
      }
      next.stepIndex += 1;
      break;
    }

    case 'parts': {
      const parsedPart = parsePartLine(text);
      if (parsedPart) {
        next.parts.push(parsedPart);
      } else if (!text.includes('אין') && !text.includes('ללא') && !text.includes('זהו')) {
        next.parts.push({ name: text, price: null, qty: 1 });
      }
      next.stepIndex += 1;
      break;
    }

    case 'supplementText':
      next.supplementText = text;
      next.stepIndex += 1;
      break;

    case 'supplementWorks':
      next.supplementWorks = text;
      next.stepIndex += 1;
      break;

    case 'supplementPrice':
      next.supplementPrice = parseHebrewPriceOrNumber(text) || 0;
      next.stepIndex += 1;
      break;

    case 'supplementStatus':
      if (text.includes('אושר') || text.includes('לקוח אישר') || text.includes('כן') || text.includes('אישר')) {
        next.supplementStatus = 'approved';
      } else if (text.includes('מסרב') || text.includes('סירב') || text.includes('לא רוצה') || text.includes('דחה')) {
        next.supplementStatus = 'rejected';
      } else {
        next.supplementStatus = 'pending_customer';
      }
      next.stepIndex += 1;
      break;

    case 'quoteScope':
      if (text.includes('תוספת') || text.includes('נוסף') || text.includes('עדכון')) {
        next.subType = 'supplement';
        next.stepIndex = 0;
      } else {
        next.subType = 'new_quote';
        next.stepIndex = 1;
      }
      break;

    case 'paymentDetails': {
      const amt = parseHebrewPriceOrNumber(text) || 0;
      next.paymentAmount = amt;
      if (text.includes('אשראי') || text.includes('כרטיס')) next.paymentMethod = 'כרטיס אשראי';
      else if (text.includes('העברה')) next.paymentMethod = 'העברה בנקאית';
      else if (text.includes('צ\'ק') || text.includes('שיק')) next.paymentMethod = 'צ\'ק';
      else next.paymentMethod = 'מזומן';
      next.stepIndex += 1;
      break;
    }

    default:
      next.stepIndex += 1;
      break;
  }

  // Get next step prompt
  const nextSpec = getWorkflowStep(next);
  next.lastPromptSpoken = nextSpec.promptText;
  saveVoiceWorkflowState(next);
  return { nextState: next, promptToSpeak: nextSpec.promptText };
}

// -----------------------------------------------------------------------------
// Natural Voice Parser Helpers
// -----------------------------------------------------------------------------

function cleanName(raw: string): string {
  return raw.replace(/^(שם|הלקוח|שמו|קוראים לו|השם הוא)\s+/i, '').trim();
}

function parseWorkLine(raw: string): { desc: string; price: number | null; qty: number; side?: 'right' | 'left' | 'both' } | null {
  const price = parseHebrewPriceOrNumber(raw);
  let desc = raw
    .replace(/(?:אלף|אלפיים|מאתיים|מאות|שקל|ש"ח|שח|₪|\d+)/g, '')
    .replace(/,\s*$/, '')
    .trim();
  
  if (!desc) desc = raw;
  let side: 'right' | 'left' | 'both' | undefined = undefined;
  if (raw.includes('ימין')) side = 'right';
  if (raw.includes('שמאל')) side = 'left';

  return { desc, price, qty: 1, side };
}

function parsePartLine(raw: string): { name: string; price: number | null; qty: number } | null {
  const price = parseHebrewPriceOrNumber(raw);
  let name = raw
    .replace(/(?:אלף|אלפיים|מאתיים|מאות|שקל|ש"ח|שח|₪|\d+)/g, '')
    .replace(/,\s*$/, '')
    .trim();
  
  if (!name) name = raw;
  return { name, price, qty: 1 };
}

function buildStateRecap(state: DaliaWorkflowState): string {
  const list: string[] = [];
  if (state.customerName) list.push(`לקוח ${state.customerName}`);
  if (state.vehiclePlate) list.push(`רכב ${state.vehiclePlate}`);
  if (state.works.length > 0) list.push(`${state.works.length} עבודות`);
  if (state.parts.length > 0) list.push(`${state.parts.length} חלפים`);
  if (state.supplementText) list.push(`תוספת: ${state.supplementText}`);
  return list.join(', ') || 'אין נתונים עדיין';
}

// -----------------------------------------------------------------------------
// Direct Database Action Execution for Voice Workflows
// -----------------------------------------------------------------------------

export async function executeVoiceWorkflowAction(
  state: DaliaWorkflowState,
  actor: { id: string; fullName?: string; companyName?: string }
): Promise<{ success: boolean; message: string; caseId?: string; caseNumber?: string }> {
  try {
    switch (state.workflowType) {
      case 'new_customer': {
        const custName = (state.customerName || 'לקוח בדיקה').trim();
        const phone = (state.customerPhone || '050-0000000').trim();
        const plate = (state.vehiclePlate || '00-000-00').replace(/[^0-9A-Za-z]/g, '');

        // 1. Customer Check / Insert
        let customerId = '';
        let customerNum = 1;
        const { data: existingCust } = await supabase
          .from('garage_customers')
          .select('id, customer_number')
          .or(`phone.eq.${phone},name.eq.${custName}`)
          .limit(1)
          .maybeSingle();

        if (existingCust?.id) {
          customerId = existingCust.id;
          customerNum = existingCust.customer_number || 1;
        } else {
          const { data: lastCust } = await supabase
            .from('garage_customers')
            .select('customer_number')
            .order('customer_number', { ascending: false })
            .limit(1)
            .maybeSingle();
          customerNum = (lastCust?.customer_number || 100) + 1;

          const { data: newCust, error: cErr } = await supabase
            .from('garage_customers')
            .insert({
              customer_number: customerNum,
              name: custName,
              phone,
              customer_type: state.customerType || 'private',
              shop_company_name: actor.companyName || null,
            })
            .select('id, customer_number')
            .single();

          if (cErr) throw new Error(`שמירת לקוח נכשלה: ${cErr.message}`);
          customerId = newCust.id;
        }

        // 2. Vehicle Check / Insert
        let vehicleId = '';
        const { data: existingVeh } = await supabase
          .from('garage_vehicles')
          .select('id')
          .eq('plate', plate)
          .limit(1)
          .maybeSingle();

        if (existingVeh?.id) {
          vehicleId = existingVeh.id;
        } else {
          const { data: newVeh, error: vErr } = await supabase
            .from('garage_vehicles')
            .insert({
              customer_id: customerId,
              plate,
              model: state.vehicleModel || 'כללי',
              shop_company_name: actor.companyName || null,
            })
            .select('id')
            .single();

          if (vErr) throw new Error(`שמירת רכב נכשלה: ${vErr.message}`);
          vehicleId = newVeh.id;
        }

        // 3. Case Number & Case Creation
        const year = new Date().getFullYear();
        const { count } = await supabase
          .from('garage_cases')
          .select('id', { count: 'exact', head: true });
        const caseSeq = String((count || 0) + 1).padStart(4, '0');
        const caseNumber = `GM-${year}-${caseSeq}`;

        const caseData = {
          complaint: state.complaint || 'ללא תלונה מוגדרת',
          isVehicleInGarageNow: !!state.isVehicleInGarageNow,
          intakePhotosWanted: !!state.intakePhotosWanted,
          flowStage: state.isVehicleInGarageNow ? 'intake' : 'opened',
          workFinished: false,
          caseClosed: false,
        };

        const { data: newCase, error: caseErr } = await supabase
          .from('garage_cases')
          .insert({
            case_number: caseNumber,
            customer_id: customerId,
            vehicle_id: vehicleId,
            status: state.isVehicleInGarageNow ? 'הרכב התקבל' : 'בדיקת רכב',
            opened_by: actor.id,
            opened_by_name: actor.fullName || 'דליה AI',
            customer_name_snapshot: custName,
            vehicle_plate_snapshot: plate,
            vehicle_label_snapshot: state.vehicleModel || 'כללי',
            case_data: caseData,
            shop_company_name: actor.companyName || null,
          })
          .select('id, case_number')
          .single();

        if (caseErr) throw new Error(`פתיחת כרטיס נכשלה: ${caseErr.message}`);

        clearVoiceWorkflowState();
        return {
          success: true,
          message: `כרטיס עבודה ${newCase.case_number} נפתח בהצלחה עבור ${custName} (רכב ${plate})!`,
          caseId: newCase.id,
          caseNumber: newCase.case_number,
        };
      }

      case 'intake': {
        const plate = state.vehiclePlate?.replace(/[^0-9A-Za-z]/g, '');
        let targetCaseId = state.caseId;

        if (!targetCaseId && plate) {
          const { data: c } = await supabase
            .from('garage_cases')
            .select('id, case_data')
            .eq('vehicle_plate_snapshot', plate)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (c) targetCaseId = c.id;
        }

        if (!targetCaseId) throw new Error('לא אותר כרטיס עבודה פעיל עבור רכב זה לקליטה.');

        const { data: currentCase } = await supabase
          .from('garage_cases')
          .select('case_data, case_number')
          .eq('id', targetCaseId)
          .single();

        const cd = (currentCase?.case_data || {}) as Record<string, any>;
        cd.intakeKm = state.intakeKm;
        cd.intakeFuel = state.intakeFuel;
        cd.intakeKeys = state.intakeKeys;
        cd.intakeDamages = state.intakeDamages;
        cd.intakePhotosWanted = !!state.intakePhotosWanted;
        cd.intakeCompleted = true;
        cd.intakeCompletedAt = new Date().toISOString();

        await supabase
          .from('garage_cases')
          .update({ case_data: cd })
          .eq('id', targetCaseId);

        clearVoiceWorkflowState();
        return {
          success: true,
          message: `קליטת הרכב לתיק ${currentCase?.case_number || ''} נשמרה בהצלחה (ק"מ: ${state.intakeKm || '—'}, דלק: ${state.intakeFuel || '—'}).`,
          caseId: targetCaseId,
          caseNumber: currentCase?.case_number,
        };
      }

      case 'quote':
      case 'context_quote_supplement': {
        const targetCaseId = state.caseId;
        if (!targetCaseId) throw new Error('יש לבחור כרטיס עבודה לעדכון הצעת המחיר.');

        const { data: currentCase } = await supabase
          .from('garage_cases')
          .select('case_data, case_number')
          .eq('id', targetCaseId)
          .single();

        const cd = (currentCase?.case_data || {}) as Record<string, any>;

        if (state.subType === 'supplement' || state.workflowType === 'context_quote_supplement') {
          const supps = Array.isArray(cd.quoteSupplements) ? [...cd.quoteSupplements] : [];
          supps.push({
            id: `supp_${Date.now()}`,
            text: state.supplementText || 'תוספת עבודה',
            price: state.supplementPrice || 0,
            status: state.supplementStatus || 'pending_customer',
            createdAt: new Date().toISOString(),
          });
          cd.quoteSupplements = supps;

          await supabase
            .from('garage_cases')
            .update({ case_data: cd })
            .eq('id', targetCaseId);

          clearVoiceWorkflowState();
          return {
            success: true,
            message: `תוספת להצעת המחיר (${state.supplementText || ''}) ע"ס ₪${(state.supplementPrice || 0).toLocaleString()} נשמרה בהצלחה.`,
            caseId: targetCaseId,
            caseNumber: currentCase?.case_number,
          };
        } else {
          // New Quote works & parts
          cd.quoteWorks = state.works;
          cd.quoteParts = state.parts;
          const net = state.works.reduce((s, w) => s + (w.price || 0), 0) + state.parts.reduce((s, p) => s + (p.price || 0), 0);
          cd.quoteTotalNet = net;
          cd.quoteTotalGross = Math.round(net * 1.18);

          await supabase
            .from('garage_cases')
            .update({ case_data: cd })
            .eq('id', targetCaseId);

          clearVoiceWorkflowState();
          return {
            success: true,
            message: `הצעת מחיר הופקה בהצלחה לתיק ${currentCase?.case_number || ''} ע"ס ₪${cd.quoteTotalGross.toLocaleString()} כולל מע"מ.`,
            caseId: targetCaseId,
            caseNumber: currentCase?.case_number,
          };
        }
      }

      case 'close_case': {
        const caseRef = state.caseId || state.caseNumber;
        if (!caseRef) throw new Error('לא צוין מזהה כרטיס לסגירה.');

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseRef);
        const query = isUuid
          ? supabase.from('garage_cases').select('*').eq('id', caseRef)
          : supabase.from('garage_cases').select('*').eq('case_number', caseRef);

        const { data: c, error: cErr } = await query.maybeSingle();
        if (cErr || !c) throw new Error(`כרטיס ${caseRef} לא אותר לסגירה.`);

        const cd = (c.case_data || {}) as Record<string, any>;

        // Verify gaps
        const pendingSupps = (cd.quoteSupplements || []).filter((s: any) => s.status === 'pending_customer');
        if (pendingSupps.length > 0) {
          throw new Error(`קיימות ${pendingSupps.length} תוספות עבודה הממתינות לאישור לקוח. יש להסדירן לפני סגירת התיק.`);
        }

        cd.caseClosed = true;
        cd.caseClosedAt = new Date().toISOString();
        cd.caseClosedBy = actor.fullName || 'מנהל מוסך';
        cd.workFinished = true;

        await supabase
          .from('garage_cases')
          .update({
            status: 'סגור',
            case_data: cd,
          })
          .eq('id', c.id);

        clearVoiceWorkflowState();
        return {
          success: true,
          message: `כרטיס עבודה ${c.case_number} נסגר בהצלחה. הרכב נמסר ללקוח והתיק הועבר לארכיון.`,
          caseId: c.id,
          caseNumber: c.case_number,
        };
      }

      case 'context_pay_balance':
      case 'context_pay_record': {
        const targetCaseId = state.caseId;
        if (!targetCaseId) throw new Error('יש לבחור כרטיס עבודה לרישום התשלום.');

        const { data: currentCase } = await supabase
          .from('garage_cases')
          .select('case_data, case_number')
          .eq('id', targetCaseId)
          .single();

        const cd = (currentCase?.case_data || {}) as Record<string, any>;
        const payments = Array.isArray(cd.payments) ? [...cd.payments] : [];
        const amt = state.paymentAmount || 0;
        payments.push({
          id: `pay_${Date.now()}`,
          amount: amt,
          method: state.paymentMethod || 'מזומן',
          date: new Date().toISOString(),
          recordedBy: actor.fullName || 'דליה AI',
        });
        cd.payments = payments;
        cd.totalPaid = (cd.totalPaid || 0) + amt;

        await supabase
          .from('garage_cases')
          .update({ case_data: cd })
          .eq('id', targetCaseId);

        clearVoiceWorkflowState();
        return {
          success: true,
          message: `תשלום ע"ס ₪${amt.toLocaleString()} ב${state.paymentMethod || 'מזומן'} נרשם בהצלחה לתיק ${currentCase?.case_number}.`,
          caseId: targetCaseId,
          caseNumber: currentCase?.case_number,
        };
      }

      default:
        clearVoiceWorkflowState();
        return {
          success: true,
          message: 'הפעולה עודכנה בהצלחה במערכת.',
        };
    }
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'שגיאה בביצוע הפעולה',
    };
  }
}
