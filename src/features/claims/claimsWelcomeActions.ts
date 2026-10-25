// Dalia AI — claims welcome screen actions (stage 3: read-only).
// Every enabled action opens the conversation in the existing chat: Dalia asks her question, or a
// read-only question is sent as is; the existing chat and its read tools answer. Actions that change claims data stay disabled until they are connected
// to the existing claims flows in a later stage.
import type { ClaimsAiClaimContext } from './claimsAiModel';

export type ClaimsWelcomeActionKind =
  /** Dalia opens a free conversation with her question. */
  | 'chat'
  /** Dalia asks what she needs (claim number, plate, customer…); the answer goes to the existing chat. */
  | 'question'
  /** Send a read-only question as is. */
  | 'ask'
  /** Return to the saved conversation. */
  | 'resume'
  /** Not connected yet — shown disabled, never presented as working. */
  | 'pending';

export type ClaimsWelcomeAction = {
  id: string;
  icon: string;
  title: string;
  hint: string;
  kind: ClaimsWelcomeActionKind;
  /** Shown before "כל הפעולות" is opened. */
  primary?: boolean;
  /** 'ask': the read-only question sent to the chat. */
  text?: string;
  /** 'chat' / 'question': what Dalia says and shows to open the conversation. */
  question?: string;
};

function claimRef(claim: ClaimsAiClaimContext | null): string {
  return claim ? (claim.claimNum || claim.claimId) : '';
}

/** The twelve claims actions, adapted to the open claim when there is one. */
export function claimsWelcomeActions(claim: ClaimsAiClaimContext | null): ClaimsWelcomeAction[] {
  const ref = claimRef(claim);
  const onClaim = (withClaim: Omit<ClaimsWelcomeAction, 'id' | 'icon' | 'title'>, general: Omit<ClaimsWelcomeAction, 'id' | 'icon' | 'title'>) =>
    (ref ? withClaim : general);
  return [
    { id: 'general', icon: '💬', title: 'שיחה כללית', hint: 'שאלות חופשיות על תביעות, לקוחות, סטטוסים, מסמכים ודוחות', kind: 'chat', primary: true,
      question: 'על מה נדבר? אפשר לשאול על תביעות, לקוחות, סטטוסים, מסמכים ודוחות.' },
    {
      id: 'find', icon: '🔎', title: 'איתור תביעה', primary: true,
      ...onClaim(
        { kind: 'ask', hint: `פרטי תביעה ${ref}`, text: `תציגי את פרטי התביעה ${ref}` },
        { kind: 'question', hint: 'לפי מספר תביעה, מספר רכב, לקוח או חברת ביטוח', question: 'איזו תביעה לאתר? אפשר לומר מספר תביעה, מספר רכב, שם לקוח או חברת ביטוח.' },
      ),
    },
    {
      id: 'continue', icon: '▶️', title: 'המשך טיפול בתביעה', primary: true,
      ...onClaim(
        { kind: 'ask', hint: `השלב הבא בתביעה ${ref}`, text: `מה השלב הבא בטיפול בתביעה ${ref}?` },
        { kind: 'question', hint: 'מה השלב הבא ומי מטפל בתביעה', question: 'באיזו תביעה נמשיך לטפל? אפשר לומר מספר תביעה, מספר רכב או שם לקוח.' },
      ),
    },
    {
      id: 'reports', icon: '📊', title: 'דוחות תביעות', primary: true, kind: 'ask',
      hint: 'כל התביעות הפתוחות: סטטוס, חברת ביטוח, תשלומים וחוסרים',
      text: 'דוח על כל התביעות הפתוחות',
    },
    {
      id: 'documents', icon: '📁', title: 'מסמכים וקבצים',
      ...onClaim(
        { kind: 'ask', hint: `מסמכים וחוסרים בתביעה ${ref}`, text: `אילו מסמכים יש ואילו חסרים בתביעה ${ref}?` },
        { kind: 'question', hint: 'איתור מסמכים והצגת חוסרים בתביעה', question: 'באיזו תביעה לבדוק מסמכים וחוסרים? אפשר לומר מספר תביעה, מספר רכב או שם לקוח.' },
      ),
    },
    {
      id: 'emails', icon: '✉️', title: 'מיילים והתכתבויות',
      ...onClaim(
        { kind: 'ask', hint: `המיילים בתביעה ${ref}`, text: `תציגי את המיילים האחרונים בתביעה ${ref}` },
        { kind: 'ask', hint: 'מיילים של תביעות שהתקבלו היום ועדיין לא טופלו', text: 'אילו מיילים של תביעות התקבלו היום ועדיין לא טופלו?' },
      ),
    },
    {
      id: 'tasks', icon: '✅', title: 'משימות ותזכורות',
      ...onClaim(
        { kind: 'ask', hint: `משימות ותזכורות בתביעה ${ref}`, text: `מה המשימות והתזכורות הפתוחות בתביעה ${ref}?` },
        { kind: 'ask', hint: 'משימות ותזכורות פתוחות בכל התביעות', text: 'מה המשימות והתזכורות הפתוחות בתביעות?' },
      ),
    },
    { id: 'resume', icon: '↩️', title: 'המשך פעולה אחרונה', hint: 'חזרה לשיחה האחרונה ששמורה', kind: 'resume' },
    { id: 'new_claim', icon: '🆕', title: 'פתיחת תביעה חדשה', hint: 'יחובר בשלב הבא לתהליך הפתיחה הקיים', kind: 'pending' },
    { id: 'status', icon: '🔄', title: 'עדכון סטטוס', hint: 'יחובר בשלב הבא, לפי ההרשאות הקיימות', kind: 'pending' },
    { id: 'whatsapp', icon: '💚', title: 'WhatsApp והודעות', hint: 'יחובר בשלב הבא למסלול הידני הקיים', kind: 'pending' },
    { id: 'close', icon: '🗄️', title: 'סגירה וארכוב תביעה', hint: 'יחובר בשלב הבא, עם בדיקת הרשאות ואישור', kind: 'pending' },
  ];
}
