// supabase/functions/help-ai-chat/claimsTools.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { documentDisplayTitle, documentLabel } from "../_shared/claimDocumentLabel.ts";
import { isApprovedQaClaimId, isQaClaimRow } from "../_shared/claimQaScope.ts";
import { CLAIM_EDIT_FIELDS, applyClaimFieldEdit, describeChanges, planClaimFieldEdit, type FieldChange } from "../_shared/claimFieldEdit.ts";
import {
  historyRow,
  normalizeDate,
  nowHe as nowHeRecords,
  planReminder,
  planReminderUpdate,
  planTask,
  planWaSchedule,
  reminderRecords,
  resolveWaWhen,
  taskRecords,
  waScheduleRecords,
  withShareLink,
  checkWaRecipient,
  claimPhoneOwners,
  newId,
  type DbRow,
} from "../_shared/claimChatRecords.ts";

/**
 * Document text, summaries and extracted fields are passed to the AI model (Gemini, or the
 * Claude fallback) only when this is true. Until the owner approves, the model gets the title,
 * type and read status; the user sees the content in the chat card, which reads it in the browser.
 */
export const CLAIMS_CHAT_DOC_TEXT_TO_MODEL = false;

/** UI-only card. Sent to the chat screen, never to the model. */
export interface ClaimsDocumentCard {
  kind: "document";
  claim_id: string;
  file_id: string;
  title: string;
  original_name: string;
  mime_type: string;
  read_status: string;
  needs_read: boolean;
}

export interface ClaimsPendingAction {
  preview_id: string;
  summary: string;
  tool_name: string;
  action_type: string;
  parameters: Record<string, unknown>;
}

// -------------------------------------------------------------
// 1. CLAIMS_GEMINI_TOOLS (Inside Open Claim mode - claimId != "")
// -------------------------------------------------------------
const CLAIM_FIELD_CHANGES_PARAM = {
  type: "ARRAY",
  description: "השדות לתיקון. field = שם השדה בטופס (למשל claimNum, eventDate, plate, insCompany, policyNum, clientName, thirdParty, thirdPlate, surveyor) או שמו בעברית. value = הערך החדש בדיוק כפי שהמשתמש מסר.",
  items: {
    type: "OBJECT",
    properties: {
      field: { type: "STRING", description: "שם השדה" },
      value: { type: "STRING", description: "הערך החדש" },
    },
    required: ["field", "value"],
  },
};

const PREVIEW_UPDATE_CLAIM_FIELDS_DESC = "הכנת תצוגה מקדימה לתיקון פרטי תביעה (מספר תביעה בחברת הביטוח, תאריך אירוע, מספר רכב, דגם, סוג תביעה, חברת ביטוח, פוליסה, נציג ביטוח, פרטי לקוח, צד ג׳, שמאי, כספים, משפטי). מציג ערך נוכחי מול ערך חדש ואזהרות, ודורש אישור מפורש. השתמש רק בערכים שהמשתמש מסר במפורש — לעולם אל תשלים ערך חסר. סטטוס משנים עם preview_update_claim_status.";

export const CLAIMS_GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "get_claims_status_report",
        description: "הפקת דוח סטטוס מקיף ומלא על כל תיקי התביעות במערכת. מחזיר טבלה מפורטת עם כל התיקים שאושרו למשתמש לראות, ללא השמטה. עבור כל תיק כולל: מספר תיק, מספר תביעה, שם לקוח, ת.ז./מספר לקוח, חברת ביטוח, סטטוס, פעולה אחרונה ומתי בוצעה, מצב אימיילים (האם נשלח, למי ומתי, או מתוזמן/טיוטה), תשובה אחרונה מחברת הביטוח, למה ממתינים כרגע, גורם מטפל, מה צריך לעשות עכשיו (next action), מועד מעקב הבא, התראות פתוחות ורמת דחיפותן, וקישור ישיר לפתיחת התיק.",
        parameters: {
          type: "OBJECT",
          properties: {
            filter_status: {
              type: "STRING",
              description: "סינון לפי סטטוס מסוים או 'all' לכלל התיקים (ברירת מחדל 'all')",
            },
            include_closed: {
              type: "BOOLEAN",
              description: "האם לכלול גם תיקים סגורים/הושלמו (ברירת מחדל true)",
            },
          },
        },
      },
      {
        name: "search_claim_emails",
        description: "חיפוש מיילים שנכנסו או יצאו עבור התיק הפתוח (כותרת, תוכן, שולח, נמען, תאריך)",
        parameters: {
          type: "OBJECT",
          properties: {
            direction: {
              type: "STRING",
              description: "כיוון המייל: 'inbound' (נכנסים), 'outbound' (יוצאים), או 'all' (הכל)",
            },
            query: {
              type: "STRING",
              description: "מחרוזת חיפוש בנושא או בתוכן",
            },
            limit: {
              type: "NUMBER",
              description: "מספר תוצאות מקסימלי (ברירת מחדל 15)",
            },
          },
        },
      },
      {
        name: "get_latest_claim_email",
        description: "קבלת המייל האחרון ביותר בתיק (נכנס או יוצא) עם פרטים מלאים ותקציר תוכן",
        parameters: {
          type: "OBJECT",
          properties: {
            direction: {
              type: "STRING",
              description: "כיוון: 'inbound' (המייל הנכנס האחרון), 'outbound' (המייל היוצא האחרון), או 'any' (האחרון ביותר מכל סוג)",
            },
          },
        },
      },
      {
        name: "read_email_content",
        description: "קריאת תוכן מלא של מייל ספציפי בתיק לפי מזהה המייל",
        parameters: {
          type: "OBJECT",
          properties: {
            email_id: {
              type: "STRING",
              description: "מזהה המייל (id)",
            },
            direction: {
              type: "STRING",
              description: "כיוון המייל: 'inbound' או 'outbound'",
            },
          },
          required: ["email_id"],
        },
      },
      {
        name: "get_email_attachments",
        description: "פירוט הקבצים המצורפים למייל ספציפי בתיק (שמות, גדלים, סוגים)",
        parameters: {
          type: "OBJECT",
          properties: {
            email_id: {
              type: "STRING",
              description: "מזהה המייל",
            },
          },
          required: ["email_id"],
        },
      },
      {
        name: "check_insurance_reply",
        description: "בדיקה האם חברת הביטוח ענתה לתיק, מתי ענתה, ומה היה תוכן התשובה האחרונה",
      },
      {
        name: "check_customer_email_sent",
        description: "בדיקה האם נשלח מייל ללקוח התיק, מתי נשלח, מה היה הנושא ומה הסטטוס",
      },
      {
        name: "draft_email_reply",
        description: "הכנת טיוטת תשובה למייל נכנס בתיק (כולל כתובת נמען, נושא Re: וציטוט)",
        parameters: {
          type: "OBJECT",
          properties: {
            import_id: {
              type: "STRING",
              description: "מזהה המייל הנכנס (אופציונלי - ברירת מחדל: המייל הנכנס האחרון)",
            },
          },
        },
      },
      {
        name: "list_claim_documents",
        description: "רשימת התמונות והמסמכים בתיק הפתוח, עם שם בעברית, סוג וסטטוס קריאה. לחיפוש מסמך מסוים (למשל 'דוח שמאי', 'החשבונית האחרונה') העבר query.",
        parameters: {
          type: "OBJECT",
          properties: {
            filter_type: {
              type: "STRING",
              description: "סוג סינון: 'photos' (תמונות בלבד), 'docs' (מסמכים ומסמכי PDF בלבד), או 'all' (הכל)",
            },
            query: {
              type: "STRING",
              description: "מילות חיפוש בעברית או באנגלית: סוג מסמך, שם, שולח או מילה מהמסמך (אופציונלי)",
            },
            page: { type: "NUMBER", description: "עמוד (40 מסמכים לעמוד; ברירת מחדל 1)" },
          },
        },
      },
      {
        name: "show_claim_document",
        description: "הצגת המסמך המקורי מהתיק למשתמש בתוך הצ'אט, עם פתיחה והורדה. אם המסמך עוד לא נקרא, הכרטיס מפעיל את הקריאה הקיימת בדפדפן ומציג את התוצאה. השתמש אחרי list_claim_documents כשהמשתמש מבקש להביא, להציג, להוריד או לקרוא מסמך.",
        parameters: {
          type: "OBJECT",
          properties: {
            file_id: {
              type: "STRING",
              description: "file_id של המסמך מתוך list_claim_documents (מועדף)",
            },
            index: { type: "NUMBER", description: "מספר המסמך ברשימה של list_claim_documents (אם אין file_id)" },
            name: { type: "STRING", description: "שם המסמך או הכותרת שלו (אם אין file_id)" },
          },
        },
      },
      {
        name: "read_claim_document",
        description: "קריאת התוכן של מסמך אחד מהתיק (כולל קובץ שצורף למייל) כדי לענות על שאלה: מה כתוב, סכומים, מספר חשבונית, שם בעל רישיון, מספר רישיון נהיגה, ת.ז., מספר רכב, החלטת מבטח, חוסרים — עם ציטוט ושם המסמך. אם המסמך עוד לא נקרא, הוא נקרא עכשיו כשהדבר מאושר. מספר רכב, תעודת זהות ומספר רישיון נהיגה הם שדות נפרדים — אל תחליף ביניהם. גם מציג למשתמש את המסמך בכרטיס. קריאה בלבד, ללא אישור, ללא שינוי בתיק.",
        parameters: {
          type: "OBJECT",
          properties: {
            file_id: { type: "STRING", description: "file_id של המסמך מתוך list_claim_documents (מועדף)" },
            index: { type: "NUMBER", description: "מספר המסמך ברשימה של list_claim_documents (אם אין file_id)" },
            name: { type: "STRING", description: "שם המסמך או הכותרת שלו (אם אין file_id)" },
          },
        },
      },
      {
        name: "list_claim_share_links",
        description: "רשימת קישורי שיתוף פעילים והיסטוריים שנוצרו עבור התיק (עבור שמאי, ביטוח, לקוח)",
      },
      {
        name: "get_missing_claim_documents",
        description: "בדיקה מקיפה מה חסר בתיק הפתוח: סורק את כל המסמכים שהועלו ומשווה מול דרישות החובה (רישיון רכב, דוח שמאי, חשבונית מוסך, טופס הודעה/הצהרת נהג, תמונות נזק, פרטי צד ג')",
      },
      {
        name: "get_claim_handler_and_history",
        description: "בירור מי טיפל בתיק: מחזיר את פרטי העובד המטפל, מי פתח את התיק, ואת היסטוריית הפעולות האחרונות שנרשמו בתיק",
        parameters: {
          type: "OBJECT",
          properties: {
            limit: {
              type: "NUMBER",
              description: "מספר פעולות אחרונות להצגה (ברירת מחדל 10)",
            },
          },
        },
      },
      {
        name: "get_claim_next_action",
        description: "בירור מה הפעולה הבאה בתיק: מחזיר את מועד היעד הבא, תיאור הפעולה הבאה ומשימות פתוחות הממתינות לביצוע",
      },
      {
        name: "preview_send_claim_email",
        description: "הכנת תצוגה מקדימה (Preview) לשליחת מייל דרך Gmail. תומך בנמען יחיד או בריבוי נמענים במקביל (שליחה מרוכזת אחת ל-2, 3, 5+ נמענים). תומך בשדות to, cc, bcc ובתפקידי נמענים (recipient_roles: 'insurer', 'client', 'surveyor', 'lawyer', 'third_party'). אם לא צוינו נושא, גוף או קבצים, המערכת בוחרת אוטומטית. דורש אישור מפורש של המשתמש לפני שליחה.",
        parameters: {
          type: "OBJECT",
          properties: {
            to: {
              type: "STRING",
              description: "כתובת מייל הנמען הראשי, או רשימת כתובות מופרדות בפסיקים/נקודה-פסיק לשליחה מרוכזת. אם המשתמש מבקש לשלוח לעצמו, השאר ריק וקבע send_to_self=true",
            },
            send_to_self: {
              type: "BOOLEAN",
              description: "true כשהמשתמש מבקש 'שלח לי' — המייל יישלח לכתובת של המשתמש המחובר",
            },
            thread_id: {
              type: "STRING",
              description: "להשבה בתוך שרשור קיים: gmail_thread_id של המייל שמשיבים לו (מ-draft_email_reply או read_email_content).",
            },
            cc: {
              type: "STRING",
              description: "כתובת מייל או רשימת כתובות מופרדות בפסיקים להעתק (CC) (אופציונלי)",
            },
            bcc: {
              type: "STRING",
              description: "כתובת מייל או רשימת כתובות מופרדות בפסיקים להעתק מוסתר (BCC) (אופציונלי)",
            },
            recipient_roles: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "תפקידי נמענים מתוך התיק לשליפה אוטומטית של כתובות המייל שלהם: 'insurer' (חברת ביטוח), 'surveyor' (שמאי), 'client' (לקוח), 'lawyer' (עורך דין), 'third_party' (צד ג') (אופציונלי)",
            },
            subject: {
              type: "STRING",
              description: "נושא המייל (אופציונלי - ברירת מחדל: נושא מתאים עם מספר התביעה/הרכב)",
            },
            body: {
              type: "STRING",
              description: "תוכן גוף המייל (אופציונלי - ברירת מחדל: נוסח פנייה מקצועי בחתימת דליה ניהול תביעות)",
            },
            file_ids: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "מזהי קבצים מתוך התיק לצירוף. כשהמשתמש מבקש מסמך מסוים, העבר רק את המזהה שלו מתוך list_claim_documents (אם לא צוין, מצורפים קבצי התיק)",
            },
            send_at: {
              type: "STRING",
              description: "תאריך ושעה מתוזמנים לשליחה (למשל '2026-10-21 10:00', או 'בעוד 3 ימים ב-10:00'). המערכת תתזמן את המייל לשליחה אוטומטית ע״י השרת במועד זה באישור אחד מראש.",
            },
            relative_days: {
              type: "NUMBER",
              description: "מספר ימים מעכשיו לתזמון השליחה (למשל 3 עבור 'בעוד שלושה ימים')",
            },
            send_time: {
              type: "STRING",
              description: "שעת השליחה המתוזמנת בפורמט HH:mm (למשל '10:00', ברירת מחדל 09:00 אם לא צוינה שעה)",
            },
          },
        },
      },
      {
        name: "list_scheduled_claim_emails",
        description: "רשימת אימיילים מתוזמנים שממתינים לשליחה עתידית (קריאה בלבד). מחזיר מזהה תזכורת (reminder_id), תאריך ושעת שליחה מתוכננת, נמען, נושא ומספר קבצים מצורפים.",
        parameters: {
          type: "OBJECT",
          properties: {
            claim_ref: {
              type: "STRING",
              description: "מזהה תיק (אופציונלי). אם לא צוין במצב כללי, מחזיר את כל המיילים המתוזמנים המאושרים לשליחה.",
            },
          },
        },
      },
      {
        name: "preview_cancel_scheduled_claim_email",
        description: "הכנת כרטיס אישור לביטול אימייל מתוזמן טרם מועד השליחה שלו. דורש אישור מפורש של המשתמש לפני הביטול בפועל. ביטול ימנע את שליחת המייל ויתעד את הביטול בהיסטוריית התיק.",
        parameters: {
          type: "OBJECT",
          properties: {
            reminder_id: {
              type: "STRING",
              description: "מזהה התזכורת/המייל המתוזמן מתוך list_scheduled_claim_emails (חובה)",
            },
            reason: {
              type: "STRING",
              description: "סיבת הביטול (אופציונלי)",
            },
            claim_ref: {
              type: "STRING",
              description: "מזהה התיק (אופציונלי)",
            },
          },
          required: ["reminder_id"],
        },
      },
      {
        name: "preview_send_customer_link",
        description: "הכנת תצוגה מקדימה וכרטיס אישור נפרד לשליחת קישור פתיחת תיק חדש ללקוח (טופס דיווח מקוון) או קישור העלאת מסמכים ללקוח. בכרטיס פתיחת תיק מוקצה מספר תיק קבוע (DAL-YYYY-XXXX) בסטטוס 'ממתין למילוי הלקוח', ומוצג קישור לפתיחת הטופס בלבד (ללא קישור מסמכים) עם כפתור 'פתח ובדוק קישור', 'העתק קישור' ו-WhatsApp. בכרטיס העלאת מסמכים מוצג קישור העלאת מסמכים בלבד.",
        parameters: {
          type: "OBJECT",
          properties: {
            recipient_name: {
              type: "STRING",
              description: "שם הלקוח (למשל: אילנה אטיאס). אם לא צוין, נשלף שם הלקוח מהתיק",
            },
            recipient_phone: {
              type: "STRING",
              description: "מספר טלפון של הלקוח לשליחה ב-WhatsApp (אם לא צוין, נשלף מהתיק)",
            },
            recipient_email: {
              type: "STRING",
              description: "כתובת אימייל של הלקוח לשליחה במייל (אם לא צוין, נשלף מהתיק)",
            },
            link_type: {
              type: "STRING",
              description: "סוג הקישור המבוקש: 'intake' (קישור לפתיחת תיק חדש ומילוי טופס תביעה - ברירת מחדל), או 'upload' (קישור להעלאת מסמכים בלבד). לעולם אין לשלב את שני הקישורים באותו כרטיס!",
            },
            channel: {
              type: "STRING",
              description: "ערוץ שליחה מבוקש: 'whatsapp', 'email', 'both' (אימייל ו-WhatsApp), או 'copy' (העתקה בלבד). ברירת מחדל: לפי פרטי הקשר שסופקו",
            },
            custom_message: {
              type: "STRING",
              description: "נוסח הודעה מותאם אישית ללקוח (אופציונלי)",
            },
          },
        },
      },
      {
        name: "preview_create_claim_share_link",
        description: "הכנת תצוגה מקדימה וכרטיס נפרד לשיתוף מסמכים ותמונות קיימים בתיק (דוח שמאי, רישיון רכב, תמונות נזק). מאתר בדיוק את המסמכים שביקש המשתמש (כולל כל עמודי דוח השמאות), מציג את רשימת הקבצים המדויקת וכמותם, ואם מסמך מסוים חסר בתיק (למשל רישיון רכב) — עוצר, מתריע על המסמך החסר ומאפשר להעלות אותו ישירות. אינו מצרף מסמכים שלא התבקשו ואינו משלב קישור לפתיחת תיק.",
        parameters: {
          type: "OBJECT",
          properties: {
            recipient_name: {
              type: "STRING",
              description: "שם הנמען עבורו מיועד הקישור (למשל: שמאי משה כהן, חברת שלמה, הלקוח)",
            },
            recipient_kind: {
              type: "STRING",
              description: "סוג נמען: 'surveyor', 'insurance', 'client', 'garage', או 'other'",
            },
            recipient_email: {
              type: "STRING",
              description: "מייל הנמען (אופציונלי - לשליחה אוטומטית במייל לאחר אישור)",
            },
            recipient_phone: {
              type: "STRING",
              description: "טלפון הנמען (אופציונלי - להכנת קישור WhatsApp לאחר אישור)",
            },
            channel: {
              type: "STRING",
              description: "ערוץ מסירה: 'whatsapp', 'email', 'both', או 'copy' (ברירת מחדל 'copy')",
            },
            ttl_hours: {
              type: "NUMBER",
              description: "תוקף הקישור בשעות (ברירת מחדל 72 שעות)",
            },
            document_query: {
              type: "STRING",
              description: "טקסט או מילות חיפוש של המסמכים המבוקשים לשיתוף (למשל: 'דוח שמאות, רישיון רכב ו-3 תמונות נזק')",
            },
            requested_items: {
              type: "ARRAY",
              description: "רשימת המסמכים המדויקת המבוקשת לשיתוף (למשל: ['דוח שמאות', 'רישיון רכב', '3 תמונות נזק'])",
              items: { type: "STRING" },
            },
            file_ids: {
              type: "ARRAY",
              description: "מזהי מסמכים ספציפיים לשיתוף מתוך התיק (אופציונלי)",
              items: { type: "STRING" },
            },
            custom_message: {
              type: "STRING",
              description: "הודעה מותאמת אישית לנמען (אופציונלי)",
            },
          },
          required: ["recipient_name"],
        },
      },
      {
        name: "preview_revoke_claim_share_link",
        description: "הכנת תצוגה מקדימה לביטול קישור שיתוף קיים בתיק. דורש אישור מפורש של המשתמש.",
        parameters: {
          type: "OBJECT",
          properties: {
            share_id: {
              type: "STRING",
              description: "מזהה קישור השיתוף לביטול",
            },
          },
          required: ["share_id"],
        },
      },
      {
        name: "preview_update_claim_status",
        description: "הכנת תצוגה מקדימה לעדכון סטטוס התיק. דורש אישור מפורש של המשתמש.",
        parameters: {
          type: "OBJECT",
          properties: {
            new_status: {
              type: "STRING",
              description: "הסטטוס החדש המבוקש (למשל: 'חדש', 'בטיפול מוסך', 'ממתין למסמכים', 'ממתין לשמאי', 'ממתין לביטוח', 'הושלם')",
            },
            reason: {
              type: "STRING",
              description: "סיבת שינוי הסטטוס",
            },
          },
          required: ["new_status"],
        },
      },
      {
        name: "preview_create_claim_task",
        description: "הכנת כרטיס אישור ליצירת משימה בתיק (נשמרת ברשימת המשימות של התיק). לא יוצר כפילות של משימה פתוחה זהה.",
        parameters: {
          type: "OBJECT",
          properties: {
            task_description: {
              type: "STRING",
              description: "תיאור המשימה לביצוע",
            },
            due_date: { type: "STRING", description: "תאריך יעד YYYY-MM-DD (אופציונלי, רק אם המשתמש ציין)" },
            owner: { type: "STRING", description: "אחראי (אופציונלי; ברירת מחדל: המשתמש)" },
            note: { type: "STRING", description: "הערה למשימה (אופציונלי)" },
          },
          required: ["task_description"],
        },
      },
      {
        name: "preview_close_claim_task",
        description: "הכנת תצוגה מקדימה לסגירת משימה פתוחה בתיק. דורש אישור מפורש של המשתמש.",
        parameters: {
          type: "OBJECT",
          properties: {
            task_id: {
              type: "STRING",
              description: "מזהה המשימה לסגירה",
            },
          },
          required: ["task_id"],
        },
      },
      {
        name: "preview_add_claim_note",
        description: "הכנת תצוגה מקדימה להוספת הערה להיסטוריית התיק. דורש אישור מפורש של המשתמש.",
        parameters: {
          type: "OBJECT",
          properties: {
            note: {
              type: "STRING",
              description: "תוכן ההערה להוספה לתיק",
            },
          },
          required: ["note"],
        },
      },
      {
        name: "list_claim_reminders",
        description: "רשימת התזכורות הפעילות בתיק (קריאה בלבד, ללא אישור).",
      },
      {
        name: "preview_create_claim_reminder",
        description: "הכנת כרטיס אישור לתזכורת בתיק (המנגנון הקיים של תזכורות). date בפורמט YYYY-MM-DD — חשב לפי התאריך של היום שבהקשר.",
        parameters: {
          type: "OBJECT",
          properties: {
            date: { type: "STRING", description: "תאריך התזכורת YYYY-MM-DD" },
            note: { type: "STRING", description: "מה להזכיר" },
          },
          required: ["date", "note"],
        },
      },
      {
        name: "preview_update_claim_reminder",
        description: "הכנת כרטיס אישור לשינוי תאריך/נוסח של תזכורת פעילה, או לביטולה. תזכורת שבוטלה או שכבר הופעלה לא מופעלת מחדש.",
        parameters: {
          type: "OBJECT",
          properties: {
            reminder_id: { type: "STRING", description: "מזהה התזכורת מתוך list_claim_reminders" },
            date: { type: "STRING", description: "תאריך חדש YYYY-MM-DD (אופציונלי)" },
            note: { type: "STRING", description: "נוסח חדש (אופציונלי)" },
            cancel: { type: "BOOLEAN", description: "true לביטול התזכורת" },
          },
          required: ["reminder_id"],
        },
      },
      {
        name: "list_claim_whatsapp",
        description: "הודעות WhatsApp בתיק: מתוזמנות שממתינות לשליחה ידנית, ומה סומן כנשלח (קריאה בלבד).",
      },
      {
        name: "preview_schedule_claim_whatsapp",
        description: "הכנת הודעת WhatsApp לשליחה ידנית במסלול הקיים: נמען, נוסח ומועד; אפשר לצרף מסמכים מהתיק כקישור מאובטח (מוגבל לתיק, עם תוקף). בכרטיס אחד: יצירת הקישור (אם יש מסמכים) ושמירת התזמון. ההודעה לא נשלחת אוטומטית — במועד מופיעה התראה, המשתמש פותח WhatsApp ושולח בעצמו ומסמן 'שלחתי'. לעולם אל תאמר שההודעה נשלחה.",
        parameters: {
          type: "OBJECT",
          properties: {
            phone: { type: "STRING", description: "מספר הנמען (למשל טלפון הלקוח מהתיק). אל תמציא מספר." },
            contact_name: { type: "STRING", description: "שם הנמען" },
            recipient_role: { type: "STRING", description: "תפקיד הנמען: לקוח / שמאי / חברת ביטוח / צד ג׳ / עו״ד. ברירת מחדל לקוח. המערכת בודקת שהמספר שייך לנמען הזה בתיק." },
            body: { type: "STRING", description: "נוסח ההודעה. אפשר לכתוב {link} במקום שבו יופיע הקישור למסמכים." },
            when: { type: "STRING", description: "'now' להתראה מיידית; אחרת השתמש ב-relative_day או date" },
            relative_day: { type: "NUMBER", description: "0 = היום, 1 = מחר וכו׳" },
            date: { type: "STRING", description: "תאריך YYYY-MM-DD" },
            time: { type: "STRING", description: "שעה HH:MM (ברירת מחדל 09:00)" },
            file_ids: { type: "ARRAY", items: { type: "STRING" }, description: "מסמכים מהתיק לשליחה כקישור מאובטח (מזהים מ-list_claim_documents)" },
          },
          required: ["phone", "body"],
        },
      },
      {
        name: "preview_create_customer",
        description: "הכנת תצוגה מקדימה לפתיחת לקוח חדש במערכת הלקוחות (שם, טלפון, מייל, סוג לקוח). דורש אישור מפורש של המשתמש.",
        parameters: {
          type: "OBJECT",
          properties: {
            name: {
              type: "STRING",
              description: "שם הלקוח המלא (חובה)",
            },
            phone: {
              type: "STRING",
              description: "מספר טלפון של הלקוח",
            },
            email: {
              type: "STRING",
              description: "כתובת אימייל של הלקוח",
            },
            customer_type: {
              type: "STRING",
              description: "סוג לקוח: 'private' (פרטי) או 'company' (עסקי)",
            },
            notes: {
              type: "STRING",
              description: "הערות ללקוח",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "preview_update_claim_client_contact",
        description: "הכנת תצוגה מקדימה לעדכון פרטי התקשרות (טלפון או מייל) של לקוח התיק הפתוח. דורש אישור מפורש של המשתמש.",
        parameters: {
          type: "OBJECT",
          properties: {
            phone: {
              type: "STRING",
              description: "מספר טלפון מעודכן",
            },
            email: {
              type: "STRING",
              description: "כתובת מייל מעודכנת",
            },
            reason: {
              type: "STRING",
              description: "סיבת העדכון",
            },
          },
        },
      },
      {
        name: "preview_update_claim_fields",
        description: PREVIEW_UPDATE_CLAIM_FIELDS_DESC + " פועל על התיק הפתוח בלבד.",
        parameters: {
          type: "OBJECT",
          properties: { changes: CLAIM_FIELD_CHANGES_PARAM },
          required: ["changes"],
        },
      },
      {
        name: "preview_link_client_to_claim",
        description: "הכנת תצוגה מקדימה לקישור לקוח קיים ממערכת הלקוחות לתיק התביעה הנוכחי. דורש אישור מפורש של המשתמש.",
        parameters: {
          type: "OBJECT",
          properties: {
            customer_name: {
              type: "STRING",
              description: "שם הלקוח לקישור",
            },
            customer_id: {
              type: "STRING",
              description: "מזהה הלקוח (אם ידוע)",
            },
          },
          required: ["customer_name"],
        },
      },
      {
        name: "check_claim_and_customer_duplicates",
        description: "בדיקת כפילויות לפני פתיחת תיק או לקוח חדש: בודק לקוחות קיימים (לפי ת\"ז/ח\"פ, טלפון, אימייל או שם) ותביעות קיימות (לפי מספר רכב או מספר תביעה).",
        parameters: {
          type: "OBJECT",
          properties: {
            client_name: {
              type: "STRING",
              description: "שם הלקוח לבדיקה (אופציונלי)",
            },
            client_phone: {
              type: "STRING",
              description: "מספר טלפון של הלקוח (אופציונלי)",
            },
            client_email: {
              type: "STRING",
              description: "אימייל של הלקוח (אופציונלי)",
            },
            business_id: {
              type: "STRING",
              description: "ת\"ז או ח\"פ של הלקוח (אופציונלי)",
            },
            plate: {
              type: "STRING",
              description: "מספר רישוי של הרכב (אופציונלי)",
            },
            claim_number: {
              type: "STRING",
              description: "מספר תביעה בביטוח (אופציונלי)",
            },
          },
        },
      },
      {
        name: "search_pending_gmail_messages",
        description: "איתור מיילים נכנסים מ-Gmail הממתינים לשיוך או ייבוא לתיק: מחפש בתיבת המיילים לפי שולח, נושא, מספר רכב או מזהה הודעה. מחזיר רשימת מיילים עם מזהה הודעה (message_id), שולח, נושא, תאריך וכמות קבצים מצורפים (attachment_count).",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "מילות חיפוש: כתובת שולח, שם, מספר רכב, מספר תביעה או נושא (אופציונלי)",
            },
            claim_ref: {
              type: "STRING",
              description: "מזהה תיק (אופציונלי)",
            },
          },
        },
      },
      {
        name: "preview_import_claim_email",
        description: "הכנת תצוגה מקדימה (Preview) לייבוא מייל וכל הקבצים המצורפים אליו מ-Gmail ישירות לתיק תביעה (באמצעות מנגנון import_message הקיים של המערכת). מציג כרטיס אישור למשתמש עם פרטי המייל וכמות הקבצים שייובאו. דורש אישור מפורש של המשתמש לפני הורדה ושמירה.",
        parameters: {
          type: "OBJECT",
          properties: {
            message_id: {
              type: "STRING",
              description: "מזהה הודעת Gmail או pending_id מתוצאת חיפוש המיילים (חובה)",
            },
            claim_ref: {
              type: "STRING",
              description: "מזהה התיק (DAL-YYYY-NNNN) או מספר רכב/לקוח שאליו ישויכו הקבצים",
            },
          },
          required: ["message_id"],
        },
      },
      {
        name: "preview_save_attachment_to_claim",
        description: "הכנת תצוגה מקדימה (Preview) לשמירת תמונות או מסמכים שהועלו בצ'אט ישירות לתוך תיק התביעה הפתוח. תמונות ישמרו לגלריית התיק ומסמכים לספריית המסמכים. דורש אישור מפורש של המשתמש לפני שמירה.",
        parameters: {
          type: "OBJECT",
          properties: {
            description: {
              type: "STRING",
              description: "תיאור הקבצים לשמירה (למשל: 'רישיון רכב מעודכן', 'תמונות מוקד נזק ימני')",
            },
            doc_kind: {
              type: "STRING",
              description: "סוג המסמך: 'driver_license', 'insurance_policy', 'surveyor_report', 'damage_photos', 'invoice', או 'general'",
            },
          },
        },
      },
      {
        name: "preview_create_claim_from_onboarding",
        description: "הכנת תצוגה מקדימה (Preview) לפתיחת תיק תביעה חדש וקליטת לקוח מתוך מסמכים ותמונות שהועלו בצ'אט. מציג את פרטי הלקוח, הרכב, התביעה, המסמכים שהועלו, וסימון 'חסר' עבור כל פרט שלא זוהה בוודאות. מציג אזהרת כפילות אם נמצא לקוח או תיק קיים. דורש אישור מפורש של המשתמש לפני ביצוע.",
        parameters: {
          type: "OBJECT",
          properties: {
            client_name: {
              type: "STRING",
              description: "שם הלקוח המלא (חובה, או 'חסר')",
            },
            client_phone: {
              type: "STRING",
              description: "מספר טלפון (או 'חסר')",
            },
            client_email: {
              type: "STRING",
              description: "אימייל (או 'חסר')",
            },
            business_id: {
              type: "STRING",
              description: "ת\"ז / ח\"פ (או 'חסר')",
            },
            customer_type: {
              type: "STRING",
              description: "סוג לקוח: 'private' או 'company'",
            },
            existing_customer_id: {
              type: "STRING",
              description: "מזהה לקוח קיים במערכת (אם זוהתה כפילות)",
            },
            plate: {
              type: "STRING",
              description: "מספר רישוי הרכב — רק אם המשתמש מסר אותו או שהוא מופיע במסמך שצורף. אחרת 'חסר'. לעולם אל תמציא מספר.",
            },
            is_test: {
              type: "BOOLEAN",
              description: "true רק כשהמשתמש מבקש במפורש תיק בדיקה / QA / פיקטיבי. נוצר תיק עם מזהה DAL-QA-… שלא נספר במונה התיקים.",
            },
            make: {
              type: "STRING",
              description: "יצרן הרכב (או 'חסר')",
            },
            model: {
              type: "STRING",
              description: "דגם הרכב (או 'חסר')",
            },
            year: {
              type: "STRING",
              description: "שנת ייצור הרכב (או 'חסר')",
            },
            insurance_company: {
              type: "STRING",
              description: "חברת הביטוח (או 'חסר')",
            },
            claim_number: {
              type: "STRING",
              description: "מספר תביעה בביטוח (או 'חסר')",
            },
            accident_date: {
              type: "STRING",
              description: "תאריך אירוע התאונה (או 'חסר')",
            },
            surveyor: {
              type: "STRING",
              description: "שם השמאי (או 'חסר')",
            },
            garage: {
              type: "STRING",
              description: "שם המוסך המתקן — רק אם צוין במפורש או מופיע במסמכים (אחרת השאר ריק)",
            },
            damage_description: {
              type: "STRING",
              description: "תיאור הנזק ומוקדי הפגיעה (או 'חסר')",
            },
            third_party: {
              type: "STRING",
              description: "פרטי צד ג' (או 'חסר')",
            },
            status: {
              type: "STRING",
              description: "סטטוס התחלתי (ברירת מחדל 'חדש')",
            },
          },
          required: ["client_name"],
        },
      },
    ],
  },
];

// -------------------------------------------------------------
// 2. CLAIMS_GENERAL_GEMINI_TOOLS (General Claims mode - no claimId)
// -------------------------------------------------------------
export const CLAIMS_GENERAL_GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "preview_update_claim_fields",
        description: PREVIEW_UPDATE_CLAIM_FIELDS_DESC + " במצב כללי חובה לציין claim_ref — מזהה התיק (DAL-YYYY-NNNN) שהתקבל ביצירת התיק או מחיפוש. אם התיק לא ברור, שאל את המשתמש.",
        parameters: {
          type: "OBJECT",
          properties: {
            claim_ref: { type: "STRING", description: "מזהה התיק (DAL-YYYY-NNNN) או מספר התביעה בחברת הביטוח — חייב להתאים לתיק אחד בדיוק" },
            changes: CLAIM_FIELD_CHANGES_PARAM,
          },
          required: ["claim_ref", "changes"],
        },
      },
      {
        name: "get_claims_status_report",
        description: "הפקת דוח סטטוס מקיף ומלא על כל תיקי התביעות במערכת. מחזיר טבלה מפורטת עם כל התיקים שאושרו למשתמש לראות, ללא השמטה. עבור כל תיק כולל: מספר תיק, מספר תביעה, שם לקוח, ת.ז./מספר לקוח, חברת ביטוח, סטטוס, פעולה אחרונה ומתי בוצעה, מצב אימיילים (האם נשלח, למי ומתי, או מתוזמן/טיוטה), תשובה אחרונה מחברת הביטוח, למה ממתינים כרגע, גורם מטפל, מה צריך לעשות עכשיו (next action), מועד מעקב הבא, התראות פתוחות ורמת דחיפותן, וקישור ישיר לפתיחת התיק.",
        parameters: {
          type: "OBJECT",
          properties: {
            filter_status: {
              type: "STRING",
              description: "סינון לפי סטטוס מסוים, או 'open' עבור תביעות פתוחות, או 'all' לכלל התיקים (ברירת מחדל 'all')",
            },
            include_closed: {
              type: "BOOLEAN",
              description: "האם לכלול גם תיקים סגורים/הושלמו/שולמו (ברירת מחדל false עבור דוח תביעות פתוחות)",
            },
            open_only: {
              type: "BOOLEAN",
              description: "האם להציג אך ורק תביעות פתוחות ללא סגורות/שולמו (ברירת מחדל true כאשר המשתמש מבקש תביעות פתוחות)",
            },
          },
        },
      },
      {
        name: "get_claims_summary",
        description: "סיכום מקיף של תיקי התביעות במערכת: סך הכל תיקים, התפלגות לפי סטטוסים, התפלגות לפי חברות ביטוח, ותיקים הדורשים טיפול",
      },
      {
        name: "count_claims",
        description: "ספירת תביעות עם אפשרות לסינון לפי סטטוס, חברת ביטוח, תאריך פתיחה, או תיקים הדורשים טיפול",
        parameters: {
          type: "OBJECT",
          properties: {
            status: {
              type: "STRING",
              description: "סינון לפי סטטוס (אופציונלי)",
            },
            insurance_company: {
              type: "STRING",
              description: "סינון לפי חברת ביטוח (אופציונלי)",
            },
            created_today_only: {
              type: "BOOLEAN",
              description: "האם לספור רק תביעות שנפתחו היום (ברירת מחדל false)",
            },
            needing_attention_only: {
              type: "BOOLEAN",
              description: "האם לספור רק תביעות הדורשות טיפול (ברירת מחדל false)",
            },
          },
        },
      },
      {
        name: "get_claims_by_status",
        description: "שליפת תביעות לפי סטטוס מסוים (למשל 'חדש', 'בטיפול מוסך', 'ממתין למסמכים', 'ממתין לביטוח', 'הושלם') או רשימת כלל התביעות מקובצות לפי סטטוס",
        parameters: {
          type: "OBJECT",
          properties: {
            status: {
              type: "STRING",
              description: "סטטוס מבוקש (אם ריק - מחזיר חלוקה של כלל הסטטוסים)",
            },
            limit: {
              type: "NUMBER",
              description: "מקסימום תוצאות (ברירת מחדל 15)",
            },
          },
        },
      },
      {
        name: "get_claims_created_today",
        description: "שליפת כל התביעות שנפתחו היום במערכת כולל מספר תביעה, מספר רכב, שם לקוח, חברת ביטוח וסטטוס",
      },
      {
        name: "get_recent_claims",
        description: "שליפת התביעות האחרונות שנפתחו במערכת (ברירת מחדל 5) עם פרטים מלאים",
        parameters: {
          type: "OBJECT",
          properties: {
            limit: {
              type: "NUMBER",
              description: "מספר תביעות אחרונות להצגה (ברירת מחדל 5)",
            },
          },
        },
      },
      {
        name: "get_claims_needing_attention",
        description: "איתור תיקים הדורשים טיפול מיידי (תיקים במצב ממתין, תיקים עם משימות פתוחות, או תיקים ללא פעילות בימים האחרונים)",
        parameters: {
          type: "OBJECT",
          properties: {
            limit: {
              type: "NUMBER",
              description: "מקסימום תיקים להצגה (ברירת מחדל 10)",
            },
          },
        },
      },
      {
        name: "get_open_tasks_summary",
        description: "סיכום כלל המשימות הפתוחות במערכת ניהול התביעות, כולל פירוט משימות, תאריכי יעד ושיוך לתיקים",
      },
      {
        name: "get_today_claim_activity",
        description: "סיכום הפעילות שהתרחשה היום בניהול תביעות (עדכוני סטטוס, הערות שנרשמו, מיילים שנכנסו ופעולות AI)",
      },
      {
        name: "count_today_incoming_emails",
        description: "ספירת כמות המיילים שנכנסו היום לניהול התביעות מ-Gmail",
      },
      {
        name: "count_today_outgoing_emails",
        description: "ספירת כמות המיילים שיצאו היום מניהול התביעות",
      },
      {
        name: "get_today_claim_emails",
        description: "רשימת המיילים הנכנסים והיוצאים שנרשמו היום במערכת התביעות (שולח, נמען, נושא, שעה ושיוך לתביעה)",
        parameters: {
          type: "OBJECT",
          properties: {
            limit: {
              type: "NUMBER",
              description: "מקסימום תוצאות (ברירת מחדל 20)",
            },
          },
        },
      },
      {
        name: "get_unhandled_claim_emails",
        description: "רשימת מיילים נכנסים מ-Gmail שטרם טופלו (ללא מענה, ללא משימה פתוחה או הדורשים בדיקה)",
      },
      {
        name: "search_claims",
        description: "חיפוש חופשי של תביעות לפי מספר רכב, שם לקוח, מספר תביעה, פוליסה, שמאי או חברת ביטוח",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "מחרוזת החיפוש",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "check_claim_and_customer_duplicates",
        description: "בדיקת כפילויות לפני פתיחת תיק או לקוח חדש: בודק לקוחות קיימים (לפי ת\"ז/ח\"פ, טלפון, אימייל או שם) ותביעות קיימות (לפי מספר רכב או מספר תביעה).",
        parameters: {
          type: "OBJECT",
          properties: {
            client_name: {
              type: "STRING",
              description: "שם הלקוח לבדיקה (אופציונלי)",
            },
            client_phone: {
              type: "STRING",
              description: "מספר טלפון של הלקוח (אופציונלי)",
            },
            client_email: {
              type: "STRING",
              description: "אימייל של הלקוח (אופציונלי)",
            },
            business_id: {
              type: "STRING",
              description: "ת\"ז או ח\"פ של הלקוח (אופציונלי)",
            },
            plate: {
              type: "STRING",
              description: "מספר רישוי של הרכב (אופציונלי)",
            },
            claim_number: {
              type: "STRING",
              description: "מספר תביעה בביטוח (אופציונלי)",
            },
          },
        },
      },
      {
        name: "preview_create_claim_from_onboarding",
        description: "הכנת תצוגה מקדימה (Preview) לפתיחת תיק תביעה חדש וקליטת לקוח מתוך מסמכים ותמונות שהועלו בצ'אט. מציג את פרטי הלקוח, הרכב, התביעה, המסמכים שהועלו, וסימון 'חסר' עבור כל פרט שלא זוהה בוודאות. מציג אזהרת כפילות אם נמצא לקוח או תיק קיים. דורש אישור מפורש של המשתמש לפני ביצוע.",
        parameters: {
          type: "OBJECT",
          properties: {
            client_name: {
              type: "STRING",
              description: "שם הלקוח המלא (חובה, או 'חסר')",
            },
            client_phone: {
              type: "STRING",
              description: "מספר טלפון (או 'חסר')",
            },
            client_email: {
              type: "STRING",
              description: "אימייל (או 'חסר')",
            },
            business_id: {
              type: "STRING",
              description: "ת\"ז / ח\"פ (או 'חסר')",
            },
            customer_type: {
              type: "STRING",
              description: "סוג לקוח: 'private' או 'company'",
            },
            existing_customer_id: {
              type: "STRING",
              description: "מזהה לקוח קיים במערכת (אם זוהתה כפילות)",
            },
            plate: {
              type: "STRING",
              description: "מספר רישוי הרכב — רק אם המשתמש מסר אותו או שהוא מופיע במסמך שצורף. אחרת 'חסר'. לעולם אל תמציא מספר.",
            },
            is_test: {
              type: "BOOLEAN",
              description: "true רק כשהמשתמש מבקש במפורש תיק בדיקה / QA / פיקטיבי. נוצר תיק עם מזהה DAL-QA-… שלא נספר במונה התיקים.",
            },
            make: {
              type: "STRING",
              description: "יצרן הרכב (או 'חסר')",
            },
            model: {
              type: "STRING",
              description: "דגם הרכב (או 'חסר')",
            },
            year: {
              type: "STRING",
              description: "שנת ייצור הרכב (או 'חסר')",
            },
            insurance_company: {
              type: "STRING",
              description: "חברת הביטוח (או 'חסר')",
            },
            claim_number: {
              type: "STRING",
              description: "מספר תביעה בביטוח (או 'חסר')",
            },
            accident_date: {
              type: "STRING",
              description: "תאריך אירוע התאונה (או 'חסר')",
            },
            surveyor: {
              type: "STRING",
              description: "שם השמאי (או 'חסר')",
            },
            garage: {
              type: "STRING",
              description: "שם המוסך המתקן — רק אם צוין במפורש או מופיע במסמכים (אחרת השאר ריק)",
            },
            damage_description: {
              type: "STRING",
              description: "תיאור הנזק ומוקדי הפגיעה (או 'חסר')",
            },
            third_party: {
              type: "STRING",
              description: "פרטי צד ג' (או 'חסר')",
            },
            status: {
              type: "STRING",
              description: "סטטוס התחלתי (ברירת מחדל 'חדש')",
            },
          },
          required: ["client_name"],
        },
      },
    ],
  },
];

/**
 * Claim tools the general chat can also use, on one claim named by claim_ref (resolved to exactly one live
 * claim). Declarations are derived from CLAIMS_GEMINI_TOOLS so both chats stay the same.
 */
export const GENERAL_CLAIM_SCOPED_TOOLS = [
  "list_claim_documents",
  "show_claim_document",
  "read_claim_document",
  "get_missing_claim_documents",
  "list_claim_share_links",
  "preview_create_claim_share_link",
  "preview_revoke_claim_share_link",
  "preview_update_claim_status",
  "check_insurance_reply",
  "search_claim_emails",
  "get_latest_claim_email",
  "read_email_content",
  "get_email_attachments",
  "draft_email_reply",
  "preview_send_claim_email",
  "get_claim_next_action",
  "get_claim_handler_and_history",
  "preview_create_claim_task",
  "preview_close_claim_task",
  "preview_add_claim_note",
  "list_claim_reminders",
  "preview_create_claim_reminder",
  "preview_update_claim_reminder",
  "list_claim_whatsapp",
  "preview_schedule_claim_whatsapp",
  "preview_send_customer_link",
  "search_pending_gmail_messages",
  "preview_import_claim_email",
  "list_scheduled_claim_emails",
  "preview_cancel_scheduled_claim_email",
] as const;

{
  type Decl = { name: string; description?: string; parameters?: { type?: string; properties?: Record<string, unknown>; required?: string[] } };
  const claimDecls = (CLAIMS_GEMINI_TOOLS[0] as { functionDeclarations: Decl[] }).functionDeclarations;
  const generalDecls = (CLAIMS_GENERAL_GEMINI_TOOLS[0] as { functionDeclarations: Decl[] }).functionDeclarations;
  for (const name of GENERAL_CLAIM_SCOPED_TOOLS) {
    const decl = claimDecls.find((d) => d.name === name);
    if (!decl || generalDecls.some((d) => d.name === name)) continue;
    const params = decl.parameters || { type: "OBJECT", properties: {} };
    const isOptionalClaim = name === "preview_send_claim_email" || name === "search_pending_gmail_messages" || name === "preview_import_claim_email" || name === "list_scheduled_claim_emails" || name === "preview_cancel_scheduled_claim_email" || name === "preview_send_customer_link";
    generalDecls.push({
      ...decl,
      description: isOptionalClaim
        ? `${decl.description || ""} (במצב כללי: ניתן לציין claim_ref של תיק קיים, או להשאיר ריק להקצאת תיק קבוע חדש בסטטוס ממתין למילוי הלקוח)`
        : `${decl.description || ""} (במצב כללי: חובה claim_ref של התיק)`,
      parameters: {
        type: "OBJECT",
        properties: {
          ...(params.properties || {}),
          claim_ref: {
            type: "STRING",
            description: isOptionalClaim
              ? "מזהה התיק (DAL-YYYY-NNNN), מספר רכב או שם לקוח (אופציונלי - לפתיחת תיק חדש השאר ריק)"
              : "מזהה התיק (DAL-YYYY-NNNN), מספר התביעה בחברת הביטוח, מספר רכב או שם הלקוח המלא — חייב להתאים לתיק פעיל אחד",
          },
        },
        required: isOptionalClaim ? (params.required || []) : [...(params.required || []), "claim_ref"],
      },
    });
  }
}

// -------------------------------------------------------------
// 3. SYSTEM PROMPTS
// -------------------------------------------------------------

/** Grounding rules shared by the claim chat and the general chat. */
const CLAIMS_GROUNDING_RULES = `
אמינות — כללים מחייבים:
- נתוני מערכת מוצגים רק מתוצאת כלי שהופעל בתשובה הזו או שמופיע בהקשר המערכת. אסור להציג מזיכרון השיחה, מניחוש או מתוכן מייל כאילו הם רשומות במערכת.
- משימות ותזכורות: רק מ-get_claim_next_action ו-list_claim_reminders. אל תהפוך בקשה או משפט מתוך מייל למשימה או לתזכורת, ואל תמציא מועד.
- מיילים: רק מ-search_claim_emails / read_email_content / get_latest_claim_email. מסמכים: רק מ-list_claim_documents / read_claim_document. סטטוס ופרטי תיק: רק מהקשר התיק או מכלי התיקים.
- פעולה שבוצעה (נשלח, נשמר, נוצר, עודכן): רק לפי תוצאת הביצוע אחרי אישור המשתמש. כרטיס שהוכן ולא אושר — "ממתין לאישור", לא "בוצע".
- אם לא הפעלת את הכלי המתאים, או שהוא נכשל או החזיר שגיאה — אמור במפורש "לא בדקתי" / "הבדיקה נכשלה" ואל תציג מידע כאילו אומת. אם לא נמצא — "לא נמצא".
- כשאתה מציג נתונים, ציין מאיזה כלי הם הגיעו (למשל: "לפי רשימת המשימות של התיק").
`;

export const CLAIMS_SYSTEM_PROMPT_INSTRUCTIONS = `
אתה עוזר AI תפעולי חכם של דליה במודול ניהול תביעות (תיק פתוח).
התפקיד שלך הוא לסייע למשתמש לעבוד על התיק הפתוח בכל פעולה:
1. מיילים בתיק (Gmail): חיפוש מיילים, הצגת המייל האחרון, בדיקה האם חברת הביטוח ענתה, בדיקה האם נשלח מייל ללקוח, קריאת שרשורים והכנת טיוטות מענה.
2. תמונות ומסמכים:
   - הצגת כל התמונות והמסמכים הקיימים בתיק (שמאות, חשבוניות, רישיון רכב, תמונות שמאי, תמונות מוסך) באמצעות list_claim_documents.
   - כאשר המשתמש שואל "איזה מסמכים יש בתיק?", "תראי לי את כל התמונות", "איזה מסמכים חסרים?", "יש פוליסה בתיק?", "יש רישיון רכב?", "יש תמונות נזק?":
     קרא לכלי list_claim_documents (או get_missing_claim_documents).
     הצג למשתמש רשימה ממוספרת ברורה ונקייה, לדוגמה:
     1. רישיון רכב (car_license.pdf)
     2. פוליסת ביטוח (policy.pdf)
     3. תמונת נזק קדמי (damage_front.jpg)
     4. דו"ח שמאי (surveyor_report.pdf)
     ציין בפני המשתמש שהוא יכול לבחור מסמכים לפי המספרים שלהם (לדוגמה: "שלח ללקוח 1 ו-2" או "תכין קישור עבור 1 ו-3").
   - בחירת מסמכים לפי מספרים:
     כאשר המשתמש כותב "שלח ללקוח 1, 2 ו-5" או "תכין קישור לתמונות 1 ו-3" או "שלח ל-X מסמכים 1 ו-2":
     אם עדיין לא שלפת את רשימת המסמכים בשיחה, קרא קודם לכלי list_claim_documents לקבלת רשימת המסמכים וה-file_ids שלהם.
     זהה את המספרים שצוינו (למשל: 1, 2), מפה אותם למזהי הקבצים (file_ids) המתאימים מתוך הרשימה הממוספרת, וקרא מיידית לכלי המתאים:
     • לשליחת מייל: preview_send_claim_email עם to (כתובת המייל שצוינה או מייל הלקוח/שמאי מהתיק) ו-file_ids שנבחרו.
     • ליצירת קישור שיתוף: preview_create_claim_share_link עם recipient_name ו-file_ids שנבחרו.
3. שמירת קבצים שהועלו בצ'אט לתיק הפתוח:
   - אם המשתמש מצרף קובץ/תמונה בצ'אט (למשל: "זה דו\"ח שמאי...", "שמור את זה בתיק", "זה רישיון הרכב החדש", "תוסיף את התמונות האלה לתיק"):
     חובה לקרוא מיידית לכלי preview_save_attachment_to_claim עם תיאור וסוג המסמך (doc_kind). הפעולה תציג כרטיס Preview לאישור המשתמש, ולאחר אישור תישמר ישירות לגלריה/ספריית המסמכים של התיק.
4. בדיקת חוסרים: בדיקה מקיפה מה חסר בתיק (רישיון, שמאי, חשבונית, טופס הודעה, צד ג') באמצעות הכלי get_missing_claim_documents.
5. גורם מטפל והיסטוריה: בירור מי טיפל בתיק והצגת היסטוריית פעולות באמצעות get_claim_handler_and_history.
6. פעולה הבאה: בדיקת פעולה הבאה ומשימות ממתינות באמצעות get_claim_next_action.
7. קישורי שיתוף והעלאה ללקוח/גורמים חיצוניים:
   - קישור פתיחת תיק / העלאת מסמכים ללקוח (למשל: "שלחי ללקוח אילנה אטיאס קישור לפתיחת התיק שלה", "שלח קישור להעלאת מסמכים ללקוח"):
     חובה לקרוא מיידית לכלי preview_send_customer_link עם שם הלקוח, טלפון, אימייל וערוץ שליחה (whatsapp / email / both / copy). לעולם אל תסרב ואל תאמר שאינך יכולה! הכלי יכין כרטיס אישור לתצוגה מקדימה, ובאישור המשתמש המערכת תייצר את הקישור במנגנון create_link הקיים, תאפשר שליחה באימייל/WhatsApp, ותתעד ב-claims_history.
   - קישור שיתוף למסמכים נבחרים (דוח שמאי, תמונות נזק, פוליסה, רישיון) עבור שמאי/ביטוח/לקוח (למשל: "שלחי ללקוח קישור לדוח השמאות", "תכיני קישור לשליחת 5 התמונות והמסמכים שבחרתי", "תכין קישור רק לדו\"ח שמאי ולתמונות"):
     חובה לקרוא מיידית לכלי preview_create_claim_share_link עם recipient_name, recipient_kind, file_ids או document_query וערוץ מסירה (whatsapp / email / both / copy). המערכת תאתר את המסמכים המבוקשים (כולל דוח שמאי על כל עמודיו), תציג כרטיס אישור, ובאישור תיצור קישור מאובטח, תשלח במייל/וואטסאפ ותתעד בתיק.
   - ביטול קישורים: preview_revoke_claim_share_link.
8. שליחת ותזמון מיילים: שליחת מיילים ללקוח או לחברת הביטוח עם קבצים מצורפים מתוך התיק (preview_send_claim_email).
   - תזמון שליחה עתידית ואישור מראש: כשהמשתמש מבקש לתזמן או לשלוח במועד עתידי (למשל: "שלח אימייל בעוד שלושה ימים בשעה 10:00", "תתזמן מייל למחר ב-09:00", "שלח בעוד יומיים"):
     חובה לבקש שעה אם לא צוינה: אם המשתמש ציין יום בלבד ללא שעה מפורשת (למשל "תתזמן למחר", "שלח בעוד שלושה ימים"), המערכת חייבת לבקש ממנו שעה ("באיזו שעה ביום המבוקש לשלוח את המייל?") ואסור להחליט על שעה בעצמך!
     העבר את מועד השליחה דרך פרמטרי send_at, relative_days, ו/או send_time ל-preview_send_claim_email. הכרטיס יציג את מועד השליחה המדויק לפי שעון ישראל ויציין במפורש שמדובר באישור אחד מראש. כשהמשתמש מאשר ("מאשר"/"שלח"), האימייל נשמר כמתוזמן ומאושר לשליחה, והשרת ישלח אותו אוטומטית במועד שנקבע ללא צורך באישור נוסף!
   - צפייה וביטול תזמונים: לצפייה במיילים מתוזמנים הפעל list_scheduled_claim_emails. לביטול אימייל מתוזמן טרם מועד השליחה הפעל preview_cancel_scheduled_claim_email עם reminder_id.
   - שליחת מספר אימיילים נפרדים: כשהמשתמש מבקש לשלוח מספר אימיילים נפרדים לתיקים שונים או לנמענים שונים (למשל: מייל ראשון לביטוח, מייל שני לשמאי, מייל שלישי ללקוח) — קרא ל-preview_send_claim_email עבור כל אחת מההודעות בנפרד בתשובתך. המערכת תאגד אותן לקבוצה לאישור אחד, ובאישור המשתמש כל מייל יישלח או יתוזמן בנפרד ויתועד בתיק שלו.
9. תפעול התיק: שינוי סטטוס (preview_update_claim_status), יצירת וסגירת משימות (preview_create_claim_task, preview_close_claim_task), הוספת הערות בתיק (preview_add_claim_note).
10. לקוחות: יצירת לקוח חדש (preview_create_customer), עדכון טלפון/מייל (preview_update_claim_client_contact), קישור לקוח לתביעה (preview_link_client_to_claim), ובדיקת כפילויות (check_claim_and_customer_duplicates).
11. תיקון פרטי התיק: כשהמשתמש מבקש לתקן פרט בתיק (מספר תביעה בחברת הביטוח, תאריך אירוע/תאונה, מספר רכב, חברת ביטוח, פוליסה, צד ג׳, שמאי, סכומים וכו׳) — קרא ל-preview_update_claim_fields עם השדות והערכים שהמשתמש מסר בלבד. הכרטיס יציג ערך נוכחי מול חדש ואזהרות. אם ערך לא נמסר במפורש — שאל, אל תשלים.
12. תזכורות: הצגה (list_claim_reminders), יצירה (preview_create_claim_reminder), שינוי מועד/נוסח או ביטול (preview_update_claim_reminder). תזכורת שבוטלה לא מופעלת מחדש — אפשר ליצור חדשה.
13. WhatsApp (שליחה ידנית בלבד, במסלול הקיים): "תכין ללקוח הודעה ותתזמן למחר" → preview_schedule_claim_whatsapp עם הטלפון מהתיק, נוסח, relative_day=1. "תשלח לו את דוח השמאי בוואטסאפ" → מצא את המסמך עם list_claim_documents והעבר file_ids — המסמך יישלח כקישור מאובטח. ההודעה לא נשלחת אוטומטית: אמור "ממתין לשליחה ידנית", לעולם לא "נשלח". מצב ההודעות: list_claim_whatsapp.
14. מיילים: חיפוש וקריאה מיידיים. להשבה בשרשור: draft_email_reply ואז preview_send_claim_email עם thread_id. דווח "נשלח" רק לפי תשובת המערכת אחרי האישור.
15. משימות: preview_create_claim_task (עם due_date ו-owner אם צוינו). אם קיימת משימה פתוחה זהה — אמור זאת ואל תיצור כפילות. לסגירה: get_claim_next_action ואז preview_close_claim_task.
16. שאלות על תוכן מסמך ("מה החליטה חברת הביטוח?", "כמה השמאי אישר?"): מצא את המסמך עם list_claim_documents ואז read_claim_document. ענה רק ממה שכתוב, ציין את שם המסמך והציטוט. אם התוכן לא זמין או לא מופיע — אמור זאת.
17. הורדת קבצים וייבוא מייל מ-Gmail לתיק: כשהמשתמש מבקש לייבא מייל או להוריד נספחים/קבצים שנשלחו במייל (למשל 'תורידי את הקבצים מהמייל של שמאי/ביטוח', 'יש מייל עם קבצים שצריך לצרף לתיק', 'הגיע מייל עם 112 קבצים תוריד אותם לתיק'):
קרא ל-search_pending_gmail_messages לאיתור המייל, ואז קרא ל-preview_import_claim_email עם message_id ו-claim_ref. כרטיס האישור יציג את פרטי המייל וכמות הקבצים שיורדו (במנות של 12 תוך מניעת כפילויות מלאה). לאחר אישור המשתמש, המערכת מבצעת את ההורדה במלואה.
18. דוח סטטוס מקיף על כלל התביעות במערכת ("תוציא לי דוח כללי על כל התיקים", "מה מצב התביעות?", "דוח כללי", "טבלת תביעות"):
כאשר המשתמש מבקש דוח כללי על כל התיקים או שואל על מצב התביעות:
חובה לקרוא מיידית אך ורק לכלי get_claims_status_report בפנייה אחת בלבד!
אסור בהחלט לקרוא לכלי תיק בודד בלולאה. הכלי get_claims_status_report כבר מספק את כל הנתונים בפנייה אחת מהירה.
הצג תמיד טבלת Markdown מלאה ומסודרת של כל התיקים שהוחזרו ללא יוצא מן הכלל (לא להסתפק בסיכום או בחלק מהתיקים).
הטבלה חייבת לכלול את כל 13 העמודות:
1. מספר תיק (עם קישור לחיץ [DAL-YYYY-NNNN](claim:DAL-YYYY-NNNN) או [פתח תיק](claim:DAL-YYYY-NNNN)) ומספר תביעה
2. שם לקוח ומספר לקוח/ת.ז.
3. חברת הביטוח ומצב הטיפול מולה
4. סטטוס התביעה הנוכחי
5. הפעולה האחרונה ותאריך ביצועה
6. מצב אימייל (האם נשלח, למי ומתי, או מתוזמן/טיוטה)
7. מה הייתה התשובה האחרונה מחברת הביטוח (או "לא תועד מענה")
8. למה אנחנו ממתינים כרגע (ביטוח/שמאי/מסמכים/מוסך/טיפול פנימי)
9. מי הגורם המטפל בתביעה
10. מה צריך לעשות עכשיו (הפעולה הבאה לקידום התיק)
11. מועד המעקב הבא
12. התראות פתוחות, מסמכים חסרים ורמת דחיפות (הדגש ב-🔴 [דחוף] התראות דחופות)
13. קישור ישיר לפתיחת התיק: [פתח תיק](claim:DAL-YYYY-NNNN)
מיין תמיד תיקים דחופים תחילה, אחריהם בטיפול, ממתינים ולבסוף סגורים. לעולם אל תמציא נתונים: נתון שאינו קיים יוצג כ"לא ידוע" או "לא עודכן".

חתימה: הודעות חדשות (מייל, WhatsApp) נחתמות בשם "דליה ניהול תביעות" בלבד. אל תכתוב "מוסך אורן" ואל תמציא שם אחר.
אישורים: קריאה, חיפוש, הצגת מסמכים וניסוח טיוטות — מיד, בלי כרטיס. כל כתיבה או שליחה — כרטיס אישור אחד שמרכז את כל הפרטים (לא לבקש אישור לכל שלב). אחרי ביצוע דווח את התוצאה האמיתית: בוצע / נכשל / ממתין לשליחה ידנית.

כללי בטיחות ואישורים קריטיים:
- פעולות קריאה (READ): כגון חיפוש מיילים, בדיקת מענה מביטוח, רשימת תמונות/מסמכים, בדיקת חוסרים, בדיקת קישורים, מי טיפל, בדיקת כפילויות — מבוצעות באופן אוטומטי מיידי דרך הכלים הרלוונטיים. ענה תמיד בעברית ברורה ותמציתית עם הנתונים האמיתיים שנשלפו.
- פעולות כתיבה (WRITE / SEND / REVOKE / UPDATE): כגון שליחת מייל, יצירת קישור שיתוף, שמירת מסמכים לתיק, ביטול קישור, שינוי סטטוס תיק, יצירת משימה, סגירת משימה, הוספת הערה, יצירת/עדכון לקוח — אסור לבצע ישירות ללא אישור!
- עבור כל פעולת כתיבה, חובה לקרוא לכלי ה-Preview המתאים.
- במצב כללי, אם המשתמש מסר מזהה תיק (DAL-YYYY-NNNN), העבר אותו ישירות כ-claim_ref לכלי ההכנה (preview_send_claim_email וכו') — בלי לחפש קודם.
- שליחה בפועל: כלי ה-Preview אינו שולח. אחרי שהצגת כרטיס, המשתמש מאשר בלחיצה על "אישור" או בכתיבת "מאשר"/"שלח" בצ'אט, והמערכת עצמה מבצעת את השליחה דרך Gmail ומחזירה אישור. לעולם אל תאמר שאין לך יכולת לשלוח; אמור שהכנת מייל לאישור. אל תכתוב "נשלח" לפני שהמערכת אישרה, ואל תכין כרטיס נוסף לאותו מייל אחרי אישור.
- כלי ה-Preview מכין את הפעולה ומציג למשתמש כרטיס אישור אינטראקטיבי בממשק. בתשובתך, הסבר בעברית מה הכנת ובקש מהמשתמש ללחוץ על "אישור" כדי לבצע.
- לעולם אל תמציא מידע שאינו קיים בתיק. השתמש תמיד בכלים לקבלת נתונים חיים.
${CLAIMS_GROUNDING_RULES}
`;

export const CLAIMS_GENERAL_SYSTEM_PROMPT_INSTRUCTIONS = `
אתה עוזר AI תפעולי וניהולי חכם של דליה במודול ניהול תביעות (מצב כללי - Claims General).
המשתמש נמצא כעת במסך הראשי של ניהול תביעות, ללא תיק פתוח ספציפי.
התפקיד שלך הוא לנהל את תהליך התביעות, לפתוח תיקים חדשים, לקלוט לקוחות, ולספק נתונים על כלל התיקים:

1. פתיחת תיק חדש וקליטת לקוח מתוך מסמכים (AI Claim & Customer Onboarding):
   כאשר המשתמש מעלה מסמכים ותמונות בצ'אט (רישיון רכב, פוליסת ביטוח, דוח שמאי, חשבוניות, תמונות נזק) ומבקש לפתוח תיק ("פתח לי תיק חדש מהמסמכים שהעליתי", "תיצור תיק ללקוח הזה", "פתח תביעה מהרישיון והתמונות"):
   א. נתח ביסודיות את כל המסמכים והתמונות שצורפו בצ'אט.
   ב. זהה וחלץ:
      • לקוח: שם מלא, טלפון, אימייל, ת"ז / ח"פ.
      • רכב: מספר רישוי, יצרן, דגם, שנת ייצור.
      • תביעה: חברת ביטוח, מספר תביעה, תאריך אירוע תאונה, שמאי, מוסך, תיאור הנזק ומוקדי הפגיעה, צד ג'.
      • מסמכים: רשימת כל הקבצים שצורפו (תמונות נזק יסומנו לגלריה, מסמכי PDF וטפסים יסומנו לספריית המסמכים).
   ג. בדיקת כפילויות חובה:
      הפעל את הכלי check_claim_and_customer_duplicates עם שם הלקוח, טלפון, ת"ז, מספר רישוי ומספר תביעה שחולצו.
      אם נמצא לקוח קיים - סמן את existing_customer_id כדי לקשר אליו ולא ליצור כפילות.
      אם נמצא תיק תביעה קיים לרכב זה - הוסף אזהרה ברורה למשתמש.
   ד. מניעת הזיות (Strict No-Hallucination):
      כל פרט שלא זוהה בוודאות מתוך המסמכים - חובה לסמן כ-"חסר"! לעולם אל תמציא מספרי טלפון, ת"ז, דגמים או חברות ביטוח.
   ה. קרא לכלי preview_create_claim_from_onboarding עם כל השדות שחולצו, רשימת החוסרים והכפילויות.
   ו. הכלי יציג כרטיס אישור (Preview) מסודר למשתמש. לאחר לחיצת "אישור" של המשתמש:
      המערכת תיצור את הלקוח (אם אינו קיים), תקדם את מונה התביעות (DAL-YYYY-XXXX), תיצור את תיק התביעה ב-claims_records, תשמור את כל הקבצים והתמונות ב-claims-docs וב-claims_documents (תמונות לגלריה, מסמכים לספרייה), ותתעד Audit מלא.

2. סקירת תביעות ודוח סטטוס כלל התיקים במערכת:
   - כאשר המשתמש מבקש "תוציא לי דוח כללי על כל התיקים", "מה מצב התביעות?", "דוח כללי", "סטטוס תביעות", "דוח על כל התביעות הפתוחות", "דוח תביעות פתוחות", "דוח שלם על כל התביעות", "טבלת סטטוסים", או שואל על כלל התיקים:
     חובה מוחלטת לקרוא מיידית אך ורק לכלי get_claims_status_report!
     כאשר המשתמש מבקש תביעות פתוחות/פעילות, העבר open_only: true ו-include_closed: false כדי להציג את כל התביעות הפתוחות ללא סגורות/שולמו.
     חוק בל יעבור (Zero-Loop Rule): אסור בהחלט לקרוא לכלי תיק בודד בלולאה (כגון check_insurance_reply, get_claim_next_action, get_missing_claim_documents) עבור כל תיק בנפרד!
     הכלי get_claims_status_report כבר שולף ומחזיר במרוכז ובפנייה אחת מהירה את כל 14 העמודות לכלל התיקים וטבלת markdown_table מוכנה ומלאה.
     לעולם אל תסתפק בתשובה טקסטואלית כללית, ואל תציג רק חלק מהתיקים. הצג תמיד טבלת Markdown מסודרת אחת יחידה ומלאה של כל התיקים שהוחזרו ללא יוצא מן הכלל.
     הכותרת בראש התשובה חייבת להכיל מספר ברור: "## דוח סטטוס תביעות (סה״כ תביעות פתוחות: X)".
     הטבלה חייבת לכלול את כל 14 העמודות:
     1. מספר תיק (עם קישור לחיץ [DAL-YYYY-NNNN](claim:DAL-YYYY-NNNN) או [פתח תיק](claim:DAL-YYYY-NNNN)) ומספר תביעה
     2. שם לקוח ומספר לקוח/ת.ז.
     3. חברת הביטוח ומצב הטיפול מולה
     4. סטטוס התביעה הנוכחי
     5. הפעולה האחרונה ותאריך ביצועה
     6. מצב אימייל (האם נשלח, למי ומתי, או מתוזמן/טיוטה)
     7. מה הייתה התשובה האחרונה מחברת הביטוח (או "לא תועד מענה")
     8. למה אנחנו ממתינים כרגע (ביטוח/שמאי/מסמכים/מוסך/טיפול פנימי)
     9. מי הגורם המטפל בתביעה
     10. מה צריך לעשות עכשיו (הפעולה הבאה לקידום התיק)
     11. מועד המעקב הבא
     12. התראות פתוחות, מסמכים חסרים ורמת דחיפות (הדגש ב-🔴 [דחוף] התראות דחופות)
     13. קישור ישיר לפתיחת התיק: [פתח תיק](claim:DAL-YYYY-NNNN)
     - מיין תמיד תיקים דחופים תחילה, אחריהם בטיפול, ממתינים ולבסוף סגורים.
     - אל תמציא שום נתון: אם מידע חסר הצג "לא ידוע" או "לא תועד".
     - הבחן בבירור בין פעולה שבוצעה לבין פעולה מתוכננת.
   - סקירות כמותיות ספציפיות:
     - כמות תביעות כוללת (get_claims_summary, count_claims).
     - חלוקה לפי סטטוסים (get_claims_by_status).
     - חלוקה לפי חברות ביטוח (get_claims_summary).
     - תביעות שנפתחו היום (get_claims_created_today).
     - תביעות אחרונות שנפתחו (get_recent_claims).
     - תיקים שדורשים טיפול דחוף (get_claims_needing_attention).

3. פעילות ומיילים יומיים (Gmail):
   - כמה מיילים נכנסו היום (count_today_incoming_emails).
   - כמה מיילים יצאו היום (count_today_outgoing_emails).
   - רשימת המיילים של היום (get_today_claim_emails).
   - מיילים נכנסים שטרם טופלו (get_unhandled_claim_emails).
   - סיכום פעילות היום בניהול תביעות (get_today_claim_activity).

4. משימות במערכת:
   - סיכום משימות פתוחות בכלל התיקים (get_open_tasks_summary).

5. תיקון פרטי תיק קיים (גם מיד אחרי פתיחת תיק): קרא ל-preview_update_claim_fields עם claim_ref (מזהה התיק שנפתח או שנמצא בחיפוש) והשדות לתיקון. אם יש יותר מתיק אחד מתאים — שאל. לעולם אל תשלים ערך שהמשתמש לא מסר.
   חתימה: הודעות חדשות (מייל, WhatsApp) נחתמות בשם "דליה ניהול תביעות" בלבד. אל תכתוב "מוסך אורן" ואל תמציא שם אחר.
   גם בלי לפתוח את התיק אפשר לעבוד על תיק מסוים עם claim_ref: מסמכים (list_claim_documents, show_claim_document), מיילים (search_claim_emails, read_email_content, draft_email_reply, preview_send_claim_email), משימות, הערות, תזכורות ו-WhatsApp ידני (preview_schedule_claim_whatsapp — לעולם לא "נשלח", רק "ממתין לשליחה ידנית"). קריאה מיידית; כתיבה ושליחה בכרטיס אישור אחד.

5ב. קישורים ללקוח ולמסמכים מתוך ה-AI (כרטיס א' לפתיחת תיק, כרטיס ב' למסמכים — לעולם לא באותו כרטיס!):
   - כרטיס א' – קישור פתיחת תיק חדש ללקוח (טופס דיווח מקוון):
     כאשר המשתמש מבקש: "פתחי תיק חדש ללקוח והכיני לי קישור לשליחה", "שלחי ללקוח קישור לפתיחת התיק שלו", "הכיני קישור לפתיחת תיק חדש":
     1. הפעל מיד את preview_send_customer_link עם link_type: "intake" (ו-recipient_name, phone, email אם ידועים).
     2. המערכת מקצה מיד מספר תיק קבוע (DAL-2026-XXXX) ממונה התביעות הקיים בסטטוס "ממתין למילוי הלקוח", ומכינה קישור מאובטח לפתיחת התיק בלבד (claims-intake).
     3. בכרטיס זה מופיע אך ורק הקישור לפתיחת התיק — חל איסור מוחלט לשלב בכרטיס זה קישור למסמכים!
     4. הכרטיס מציג: מספר תיק קבוע, שם לקוח, קישור לפתיחת התיק, כפתור "פתח ובדוק קישור" (לצפייה בטוחה ללא יצירת תיק נוסף וללא הגשה), כפתור "העתק קישור", וכפתור "שלח בוואטסאפ" עם נוסח ייעודי לפתיחת תיק בלבד.
   - כרטיס ב' – קישור מסמכים (בנפרד לחלוטין):
     1. קישור להעלאת מסמכים ע"י הלקוח (Customer Upload Link):
        כאשר המשתמש מבקש במפורש קישור שהלקוח יעלה דרכו מסמכים ("שלחי לאותו לקוח קישור להעלאת מסמכים", "קישור שהלקוח יעלה מסמכים"):
        הפעל preview_send_customer_link עם link_type: "upload". הכרטיס מציג קישור העלאת מסמכים בלבד (claims-upload), ללא קישור פתיחת תיק!
     2. קישור לשיתוף מסמכים קיימים לצפייה והורדה (Exact Documents Share Link):
        כאשר המשתמש מבקש לשלוח מסמכים קיימים מהתיק (למשל: "דליה, הכיני קישור למסמכים של אותו תיק", "אני רוצה לשלוח את דוח השמאות, רישיון הרכב ושלוש תמונות הנזק שבחרתי"):
        הפעל את preview_create_claim_share_link עם document_query או requested_items.
        - המערכת מאתרת בדיוק את המסמכים שהתבקשו:
          • דוח שמאות: מזהה את כל עמודי הדוח (אם יש 2 עמודים, שניהם נכללים ומדווחים!).
          • רישיון רכב: מאתרת את רישיון הרכב.
          • תמונות נזק: מאתרת בדיוק את הכמות המבוקשת (למשל 3 תמונות).
          • חל איסור מוחלט לצרף מסמכים שלא התבקשו!
        - חוסר במסמך: אם מסמך שהתבקש חסר בתיק (למשל רישיון רכב), המערכת עוצרת מיידית, לא מנחשת ולא מצרפת מסמך אחר. היא מודיעה: "המסמך [שם] חסר בתיק. האם תרצה להעלות אותו עכשיו?", ומציגה אפשרות להעלאת המסמך ישירות מתוך כרטיס הפעולה! רק לאחר שהמסמך הועלה ואושר — נוצר קישור השיתוף.
        - הקישור מוביל לדף claims-share המוגבל בדיוק למסמכים שאושרו. בכרטיס זה מופיעים כפתורי "פתח ובדוק", "העתק", ו-"שלח בוואטסאפ". לעולם אין לשלב קישור פתיחת תיק בכרטיס זה.

6. חיפוש תביעות:
   - חיפוש לפי מספר רכב, שם לקוח, מספר תביעה, חברת ביטוח (search_claims).

7. בדיקת כפילויות ישירה:
   - בדיקת כפילויות לקוח או תיק (check_claim_and_customer_duplicates).

8. שליחת ותזמון אימיילים מתוך ה-AI הכללי בשם כל תיק וריבוי נמענים:
   - כאשר המשתמש מבקש לשלוח או לתזמן אימייל לגבי תיק תביעה (למשל: "שלח אימייל לחברת הביטוח לגבי תיק DAL-2026-0245", "תתזמן מייל לביטוח בתיק 20 לעוד שלושה ימים ב-10:00"):
     א. זיהוי תיק: אם נמסר מזהה תיק (DAL-YYYY-NNNN), מספר רכב או לקוח — העבר אותו כ-claim_ref לכלי preview_send_claim_email.
     ב. חוסר ודאות / תיק לא צוין: אם המשתמש ביקש לשלוח מייל לביטוח/שמאי/לקוח בלי לציין תיק, או שיש כמה תיקים אפשריים — בקש הבהרה מהמשתמש ("באיזה תיק תביעה מדובר?") לפני הכנת המייל!
     ג. ריבוי נמענים במקביל: ניתן לשלוח בפעולה אחת ל-2, 3, 5+ נמענים דרך to, cc, bcc ו-recipient_roles ('insurer', 'surveyor', 'client', 'lawyer', 'third_party'). המערכת תמזג, תנקה כפילויות ותציג כרטיס אחד.
     ד. תזמון שליחה עתידית ואישור מראש: כשהמשתמש מבקש תזמון ("בעוד 3 ימים בשעה 10:00", "מחר ב-14:00", "עוד שבוע"):
        חובה לבקש שעה אם לא צוינה: אם המשתמש ציין יום בלבד ללא שעה (למשל "תתזמן למחר"), חובה לבקש ממנו שעה ("באיזו שעה ביום המבוקש לשלוח?") ואסור להחליט על שעה בעצמך!
        העבר את הפרמטרים send_at, relative_days, ו/או send_time ל-preview_send_claim_email. המשתמש מאשר פעם אחת מראש ("מאשר"/"שלח"), האימייל נשמר כמתוזמן ומאושר לשליחה, והשרת ישלח אותו אוטומטית במועד שנקבע לפי שעון ישראל בלי לבקש אישור נוסף במועד השליחה!
     ה. צפייה וביטול תזמונים: לצפייה בכל המיילים המתוזמנים הפעל list_scheduled_claim_emails (עם או בלי claim_ref). לביטול מייל מתוזמן טרם מועדו הפעל preview_cancel_scheduled_claim_email עם reminder_id.
     ו. אישור ושליחה מיידית: כשהמשתמש כותב "מאשר", "שלח" או לוחץ על כפתור "אישור" — האימייל נשלח בפועל דרך Gmail API והשליחה נרשמת בהיסטוריה של אותו תיק.
     ז. הכנה ושליחה/תזמון של מספר אימיילים שונים במקביל (Multi-Email Group Sending / Scheduling באישור אחד):
        כאשר המשתמש מבקש לשלוח או לתזמן כמה אימיילים שונים לתיקים או נמענים שונים (לדוגמה: "שלח עדכון לביטוח בתיק 20, ותזמן דוח לשמאי בתיק 35 למחר"):
        - קרא ל-preview_send_claim_email עבור כל אחד מהמיילים במקביל בתשובתך.
        - המערכת תאגד אותם לכרטיס משותף (batch_send_email או batch_schedule_email).
        - כשהמשתמש כותב "מאשר", "מאשר לשלוח את הכול", "שלח את כולם" — המערכת תבצע את כל הפעולות באופן עצמאי אחד אחד ותתעד כל אחד בתיק שלו.

9. איתור וייבוא מיילים וקבצים מצורפים מ-Gmail לתיק תביעה (Gmail Import):
   - המערכת תומכת באיתור מיילים מתיבת הדואר והורדת קבצים מצורפים ישירות לתיק תביעה קיים או הכנת תיק חדש.
   - לאיתור מיילים נכנסים מ-Gmail: השתמש בכלי search_pending_gmail_messages (עם query, lookback וכו').
   - להכנת כרטיס ייבוא וצירוף מסמכים לתיק: השתמש בכלי preview_import_claim_email עם message_id, claim_ref ונושא.
   - כשהמשתמש כותב "מאשר" / "ייבא" / "הורד קבצים" — המערכת מפעילה את מנגנון ה-import_message הקיים, מורידה את כל הקבצים (כולל 112+ קבצים במנות של 12), מונעת כפילויות, שומרת ב-Storage ומתעדת בהיסטוריית התיק. לעולם אל תגיד שאינך מסוגל להוריד קבצים!

כללי פעולה קריטיים:
- ענה תמיד בעברית ברורה, מקצועית ומסודרת.
- השתמש תמיד בכלים הייעודיים לקבלת נתונים אמיתיים. לעולם אל תנחש או תמציא מספרים או שמות.
- כל פעולת יצירה או שינוי דורשת כרטיס Preview ואישור מפורש של המשתמש לפני ביצוע.
- במצב כללי, אם המשתמש מסר מזהה תיק (DAL-YYYY-NNNN), העבר אותו ישירות כ-claim_ref לכלי ההכנה (preview_send_claim_email וכו') — בלי לחפש קודם.
- שליחה בפועל: כלי ה-Preview אינו שולח. אחרי שהצגת כרטיס, המשתמש מאשר בלחיצה על "אישור" או בכתיבת "מאשר"/"שלח" בצ'אט, והמערכת עצמה מבצעת את השליחה דרך Gmail ומחזירה אישור. לעולם אל תאמר שאין לך יכולת לשלוח; אמור שהכנת מייל לאישור. אל תכתוב "נשלח" לפני שהמערכת אישרה, ואל תכין כרטיס נוסף לאותו מייל אחרי אישור.
${CLAIMS_GROUNDING_RULES}
`;

export function normalizeShareRecipientKind(kind: string): string {
  const k = String(kind || "").trim().toLowerCase();
  if (k === "surveyor" || k.includes("שמאי")) return "surveyor";
  if (k === "lawyer" || k.includes("עו\"ד") || k.includes("עורך דין")) return "lawyer";
  if (k === "insurer" || k.includes("ביטוח") || k.includes("חברת ביטוח")) return "insurer";
  if (k === "agent" || k.includes("סוכן")) return "agent";
  if (k === "client" || k.includes("לקוח")) return "client";
  if (["surveyor", "lawyer", "insurer", "agent", "client", "other"].includes(k)) return k;
  return "other";
}

// -------------------------------------------------------------
// 4. AUDIT LOGGING HELPER
// -------------------------------------------------------------

// -------------------------------------------------------------
// ONBOARDING & STORAGE HELPERS
// -------------------------------------------------------------
function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}

function parseSearchTokens(query: string): string[] {
  if (!query) return [];
  const STOP_WORDS = new Set([
    "של", "על", "את", "זה", "זהו", "או", "אם", "גם", "רק", "כל", "הוא", "היא",
    "עבור", "בנושא", "נושא", "תיק", "תביעה", "תביעות", "אימייל", "אימיילים",
    "מייל", "מיילים", "הודעה", "הודעות", "חברת", "חברה", "ביטוח", "שנשלח",
    "שנכנס", "נכנס", "יוצא", "נכנסים", "יוצאים", "לייבא", "ייבוא", "לחפש",
    "חפשי", "תמצאי", "מצא", "בדוק", "בדיקה", "email", "emails", "mail", "mails",
    "claim", "claims", "for", "about", "the", "with", "from", "to", "in", "at"
  ]);
  return query
    .toLowerCase()
    .replace(/[,\-_/:|()]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

function matchesEmailSearch(haystack: string, query: string): boolean {
  if (!query || !query.trim()) return true;
  const hayNorm = haystack.toLowerCase().replace(/[,\-_/:|()]/g, " ");
  const rawQ = query.toLowerCase().trim();
  if (hayNorm.includes(rawQ)) return true;

  // Normalize numbers by removing whitespace between digits
  const hayDigitsClean = hayNorm.replace(/(\d)\s+(\d)/g, "$1$2");

  const tokens = parseSearchTokens(query);
  if (!tokens.length) return hayNorm.includes(rawQ) || hayDigitsClean.includes(rawQ.replace(/[^0-9a-z\u0590-\u05fe]/gi, ""));

  // High confidence anchor: 7-8 digit vehicle plate or 9-16 digit claim number
  const anchor = tokens.find((t) => /^\d{7,16}$/.test(t));
  if (anchor && (hayNorm.includes(anchor) || hayDigitsClean.includes(anchor))) return true;

  return tokens.every((tok) => hayNorm.includes(tok) || hayDigitsClean.includes(tok));
}

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^;]+;base64,/, "").trim();
  const binaryString = atob(clean);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function sha256Hex(buf: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sanitizeFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const safeBase = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 60) || "file";
  return ext ? `${safeBase}.${ext}` : safeBase;
}

function sanitizeDbDocKind(kind: string | undefined, isPhoto: boolean): string {
  if (isPhoto) return "garage_photo";
  const k = String(kind || "").toLowerCase().trim();
  const allowed = [
    "general",
    "surveyor_report",
    "surveyor_photo",
    "surveyor_attachment",
    "garage_invoice",
    "garage_photo",
  ];
  if (allowed.includes(k)) return k;
  if (k === "invoice") return "garage_invoice";
  return "general";
}

function classifyAttachment(name: string, mime: string) {
  const lowerName = name.toLowerCase();
  const lowerMime = mime.toLowerCase();
  const isImg = lowerMime.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(lowerName);

  if (isImg) {
    return {
      doc_kind: "garage_photo",
      staff_type: "garage_photos",
      category: "תמונת נזק / רכב (תישמר בגלריה)",
      is_photo: true,
    };
  }
  if (lowerName.includes("רישיון") || lowerName.includes("license")) {
    return {
      doc_kind: "general",
      staff_type: "driver_license",
      category: "רישיון רכב / נהג",
      is_photo: false,
    };
  }
  if (lowerName.includes("פוליס") || lowerName.includes("policy") || lowerName.includes("ביטוח") || lowerName.includes("insur")) {
    return {
      doc_kind: "general",
      staff_type: "policy",
      category: "פוליסת ביטוח",
      is_photo: false,
    };
  }
  if (lowerName.includes("שמאי") || lowerName.includes("surveyor") || lowerName.includes("report")) {
    return {
      doc_kind: "surveyor_report",
      staff_type: "surveyor_report",
      category: "דו\"ח שמאי",
      is_photo: false,
    };
  }
  if (lowerName.includes("חשבונית") || lowerName.includes("invoice")) {
    return {
      doc_kind: "garage_invoice",
      staff_type: "garage_invoice",
      category: "חשבונית מוסך",
      is_photo: false,
    };
  }
  return {
    doc_kind: "general",
    staff_type: "general",
    category: "מסמך כללי",
    is_photo: false,
  };
}

function formatDocLabel(d: { original_name?: string; mime_type?: string; doc_kind?: string; doc_meta?: any }): string {
  const kind = String(d.doc_kind || "").toLowerCase();
  const name = String(d.original_name || "").toLowerCase();
  const mime = String(d.mime_type || "").toLowerCase();
  const meta = (d.doc_meta && typeof d.doc_meta === "object" ? d.doc_meta : {}) as Record<string, any>;
  const staffType = String(meta.staff_type || "").toLowerCase();

  if (kind === "driver_license" || staffType.includes("license") || name.includes("רישיון") || name.includes("license")) {
    return "רישיון רכב / נהג";
  }
  if (kind === "insurance_policy" || staffType.includes("policy") || name.includes("פוליס") || name.includes("policy")) {
    return "פוליסת ביטוח";
  }
  if (kind === "surveyor_report" || staffType.includes("surveyor_report") || name.includes("שמאי") || name.includes("שמאות")) {
    return "דו\"ח שמאי";
  }
  if (kind === "invoice" || staffType.includes("invoice") || name.includes("חשבונית") || name.includes("invoice")) {
    return "חשבונית מוסך";
  }
  if (kind === "garage_photo" || kind === "surveyor_photo" || staffType.includes("photo") || mime.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(name)) {
    return "תמונת נזק / רכב";
  }
  return d.original_name || "מסמך";
}

/**
 * The saved read of a document, as the model may see it.
 * Content flag off: title, type and status only. Content flag on: a short summary per document in lists,
 * and the full text with its sources only for one document (`full`), via read_claim_document.
 */
/**
 * Content of a stored read may reach the model only when approved: all claims (code gate, off), or an
 * approved fictitious QA claim — approved id in code AND the claim row marked isQa and not deleted.
 */
export async function docTextToModelAllowed(supabase: any, claimId: unknown) {
  if (CLAIMS_CHAT_DOC_TEXT_TO_MODEL) return true;
  if (!isApprovedQaClaimId(claimId)) return false;
  const { data } = await supabase.from("claims_records").select("row_data").eq("id", String(claimId).trim()).maybeSingle();
  return !!data && isQaClaimRow(data.row_data);
}

function hasFinalRead(meta: unknown) {
  const status = String(((meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>).read_status || "");
  return status === "ready" || status === "unreadable";
}

/**
 * Asks claims-doc-read to read one document now. Only called for an approved QA claim; claims-doc-read
 * checks the same gates again (approved id, claim marked QA, stop switch). Returns counts only, never text.
 */
async function readDocumentNow(claimId: string, fileId: string): Promise<Record<string, unknown>> {
  const url = `${Deno.env.get("SUPABASE_URL") || ""}/functions/v1/claims-doc-read`;
  const key = Deno.env.get("DALIA_EDGE_INTERNAL_SECRET") || "";
  if (!key) return { ok: false, error: "no_internal_key" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-dalia-internal-key": key },
      body: JSON.stringify({ action: "read_one", claim_id: claimId, file_id: fileId }),
      signal: AbortSignal.timeout(100_000),
    });
    const out = await res.json().catch(() => ({})) as Record<string, unknown>;
    const pick = ["ok", "error", "taken", "ready", "ocr_read", "photos", "unreadable", "needs_ocr", "too_large", "retry", "failed", "read_status"];
    return Object.fromEntries(pick.filter((k) => k in out).map((k) => [k, out[k]]));
  } catch {
    return { ok: false, error: "read_now_failed" };
  }
}

function storedDocumentRead(meta: unknown, opts: { full?: boolean; contentAllowed?: boolean } = {}) {
  const row = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  const status = String(row.read_status || "");
  if (!status) return undefined;
  if (status === "pending") {
    return { status, instruction: "המסמך ממתין לקריאה ולא נותח עדיין. אל תנחש את תוכנו." };
  }
  if (status === "processing") {
    return { status, instruction: "המסמך בעיבוד. אין עדיין תוצאה. אל תנחש את תוכנו." };
  }
  if (status === "failed") {
    return { status, instruction: "הקריאה נכשלה. אל תנחש פרטים ואל תמציא נתונים." };
  }
  const label = documentLabel(row as Record<string, string>);
  if (opts.contentAllowed !== true) {
    return {
      status,
      title: label?.title || "",
      doc_type: label?.docType || "",
      needs_review: label?.needsReview ?? status === "unreadable",
      content_withheld: true,
      instruction: "תוכן המסמך לא מועבר למודל (לא אושר). אל תנחש את תוכנו. כדי שהמשתמש יראה את התוכן, הצג לו את המסמך עם show_claim_document — הכרטיס מציג את הקריאה השמורה.",
    };
  }
  if (!opts.full) {
    return {
      status,
      title: label?.title || "",
      doc_type: label?.docType || String(row.read_doc_type || ""),
      needs_review: label?.needsReview ?? status === "unreadable",
      description: label?.description || "",
      summary: String(row.read_summary || "").slice(0, 200),
      instruction: "זה תקציר בלבד. לתשובה על תוכן המסמך (סכומים, החלטות, חוסרים) קרא ל-read_claim_document עם file_id.",
    };
  }
  return {
    status,
    title: label?.title || "",
    needs_review: label?.needsReview ?? status === "unreadable",
    sender: label?.sender || "",
    sender_source: label?.senderSource || "",
    description: label?.description || "",
    source: String(row.read_source || ""),
    summary: String(row.read_summary || ""),
    text: String(row.read_text || ""),
    evidence: String(row.read_evidence || ""),
    doc_type: label?.docType || String(row.read_doc_type || ""),
    claim_numbers: String(row.read_claim_nums || ""),
    claim_source: String(row.read_claim_src || ""),
    plates: String(row.read_plates || ""),
    plate_source: String(row.read_plate_src || ""),
    dates: String(row.read_dates || ""),
    date_source: String(row.read_date_src || ""),
    amounts: String(row.read_amounts || ""),
    amount_source: String(row.read_amount_src || ""),
    id_numbers: String(row.read_id_numbers || ""),
    id_number_source: String(row.read_id_src || ""),
    driving_license_numbers: String(row.read_license_numbers || ""),
    driving_license_source: String(row.read_license_src || ""),
    invoice_numbers: String(row.read_invoice_numbers || ""),
    invoice_number_source: String(row.read_invoice_src || ""),
    names: String(row.read_names || ""),
    name_source: String(row.read_name_src || ""),
    file_name_note: "שם הקובץ אינו מקור למידע. ענה רק ממה שכתוב במסמך עצמו (text), וציין את שם המסמך.",
    insurer_decision: String(row.read_insurer_decision || ""),
    missing: String(row.read_missing || ""),
    recommendation: String(row.read_recommendation || ""),
    instruction: status === "unreadable"
      ? "הקובץ אינו קריא. אמור זאת במפורש ואל תנחש פרטים."
      : "ענה רק מתוך text ו-evidence של המסמך הזה. אם הפרט לא מופיע, אמור שאינו במסמך. אל תשנה סטטוס ואל תשלח הודעה.",
  };
}

// ---- Verified writes: an action is reported done only when the saved row comes back ----

function rowOf(r: { id: unknown; row_data?: unknown }): Record<string, string> {
  return { ...((r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, string>), id: String(r.id) };
}

async function insertVerified(supabase: ReturnType<typeof createClient>, table: string, row: DbRow) {
  const { data, error } = await supabase.from(table).insert(row).select("id");
  if (error) return { ok: false as const, error: error.message };
  if (!data || !(data as unknown[]).length) return { ok: false as const, error: "השמירה לא אושרה (אין הרשאה לתיק?)" };
  return { ok: true as const };
}

/** History row, then last activity on the claim — as appendHistory does in the claims screen. */
async function writeHistory(supabase: ReturnType<typeof createClient>, row: DbRow, userId: string, userName: string) {
  const saved = await insertVerified(supabase, "claims_history", row);
  if (saved.ok) {
    await supabase.from("claims_records").update({
      last_activity_at: new Date().toISOString(),
      updated_by: userId,
      updated_by_name: userName,
    }).eq("id", row.claim_id);
  }
  return saved;
}

function pendingResult(preview: ClaimsPendingAction, message: string, extra: Record<string, unknown> = {}) {
  return {
    result: { preview_id: preview.preview_id, status: "pending_approval", message, summary: preview.summary, ...extra },
    preview,
  };
}

const SHARE_BASE_URL = "https://orin1607-ctrl.github.io/future-craft-core/claims-share?t=";

const DOC_PAGE_SIZE = 40;

/** Sender name on new messages from the claims system (same as the claims screen templates). */
export const CLAIMS_SENDER_NAME = "דליה ניהול תביעות";

type ClaimDocRow = { id: string; claim_id: string; original_name: string | null; mime_type: string | null; doc_meta: unknown };

/**
 * One document of this claim, by file_id, by its number in list_claim_documents (newest first, unfiltered),
 * or by a unique name / title match. Never a document of another claim, never a guess between several.
 */
async function resolveClaimDocRef(
  supabase: ReturnType<typeof createClient>,
  claimId: string,
  args: Record<string, unknown>,
): Promise<{ ok: true; doc: ClaimDocRow } | { ok: false; error: string; candidates?: Array<{ file_id: string; title: string }> }> {
  const fileId = String(args.file_id || "").trim();
  const { data } = await supabase
    .from("claims_documents")
    .select("id, claim_id, original_name, mime_type, doc_meta, created_at")
    .eq("claim_id", claimId)
    .order("created_at", { ascending: false });
  const docs = ((data || []) as ClaimDocRow[]).filter((d) => d.claim_id === claimId);
  const titleOf = (d: ClaimDocRow) => documentDisplayTitle({ original_name: String(d.original_name || ""), doc_meta: d.doc_meta as Record<string, string> });
  if (fileId) {
    const hit = docs.find((d) => String(d.id) === fileId);
    return hit ? { ok: true, doc: hit } : { ok: false, error: "המסמך לא נמצא בתיק הזה. אל תציג מסמך מתיק אחר." };
  }
  const index = Number(args.index);
  if (Number.isInteger(index) && index >= 1) {
    const hit = docs[index - 1];
    return hit ? { ok: true, doc: hit } : { ok: false, error: `אין מסמך מספר ${index} בתיק (יש ${docs.length}).` };
  }
  const name = String(args.name || "").trim().toLowerCase();
  if (name.length >= 2) {
    const hits = docs.filter((d) => titleOf(d).toLowerCase().includes(name) || String(d.original_name || "").toLowerCase().includes(name));
    if (hits.length === 1) return { ok: true, doc: hits[0] };
    if (hits.length > 1) {
      return {
        ok: false,
        error: `נמצאו ${hits.length} מסמכים מתאימים. שאל את המשתמש איזה, או העבר file_id.`,
        candidates: hits.slice(0, 10).map((d) => ({ file_id: String(d.id), title: titleOf(d) })),
      };
    }
    return { ok: false, error: `לא נמצא מסמך בשם "${args.name}" בתיק הזה.` };
  }
  return { ok: false, error: "לא צוין איזה מסמך. העבר file_id מתוך list_claim_documents (או index / name)." };
}

// ---- Claim field edits from the chat (same fields and storage as the claim edit form) ----

function nowHeIL() {
  return new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
}

export function resolveScheduledWhen(args: { send_at?: unknown; relative_days?: unknown; send_time?: unknown }):
  | { ok: true; plannedAt: string; label: string; date: string; time: string }
  | { ok: false; error: "missing_time"; message: string } {
  const rawAt = String(args.send_at || "").trim();
  const rawTime = String(args.send_time || "").trim();

  // Check explicit time like 10:00 or 14:30 or 'בשעה 10' or 'ב-10'
  let hour = -1;
  let minute = 0;
  const timeMatch = (rawTime || rawAt).match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    hour = parseInt(timeMatch[1], 10);
    minute = parseInt(timeMatch[2], 10);
  } else {
    const singleHourMatch = (rawTime || rawAt).match(/(?:בשעה|ב-)\s*(\d{1,2})(?!\d)/);
    if (singleHourMatch) {
      hour = parseInt(singleHourMatch[1], 10);
      minute = 0;
    }
  }

  // If no time is specified, user explicitly requires the system to ask for the hour rather than deciding on its own!
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return {
      ok: false,
      error: "missing_time",
      message: "לא צוינה שעת שליחה. אנא ציין באיזו שעה ביום המבוקש לשלוח את האימייל (למשל: 10:00 או 14:30).",
    };
  }

  const now = new Date();
  const ilFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = ilFormatter.formatToParts(now).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  let year = parseInt(parts.year, 10);
  let month = parseInt(parts.month, 10);
  let day = parseInt(parts.day, 10);
  let daysOffset = typeof args.relative_days === "number" ? args.relative_days : 0;

  if (daysOffset === 0 && rawAt) {
    if (/מחרתיים/i.test(rawAt)) daysOffset = 2;
    else if (/מחר/i.test(rawAt)) daysOffset = 1;
    else if (/שלושה\s*ימים|3\s*ימים/i.test(rawAt)) daysOffset = 3;
    else if (/ארבעה\s*ימים|4\s*ימים/i.test(rawAt)) daysOffset = 4;
    else if (/חמישה\s*ימים|5\s*ימים/i.test(rawAt)) daysOffset = 5;
    else if (/שבוע|7\s*ימים/i.test(rawAt)) daysOffset = 7;
    else {
      const dMatch = rawAt.match(/(?:בעוד|עוד)\s*(\d+)\s*ימים/);
      if (dMatch) daysOffset = parseInt(dMatch[1], 10);
    }
  }

  const dateMatch = rawAt.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    year = parseInt(dateMatch[1], 10);
    month = parseInt(dateMatch[2], 10);
    day = parseInt(dateMatch[3], 10);
  } else {
    const tempDay = new Date(Date.UTC(year, month - 1, day + daysOffset, 12, 0, 0));
    year = tempDay.getUTCFullYear();
    month = tempDay.getUTCMonth() + 1;
    day = tempDay.getUTCDate();
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const targetDateStr = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`;

  const guessUtc = new Date(targetDateStr + "Z");
  const guessParts = ilFormatter.formatToParts(guessUtc).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const guessHour = parseInt(guessParts.hour, 10);
  const diffHours = (guessHour - guessUtc.getUTCHours() + 24) % 24;
  const targetUtc = new Date(guessUtc.getTime() - diffHours * 3600000);

  const label = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(targetUtc);

  return {
    ok: true,
    plannedAt: targetUtc.toISOString(),
    label: `${label} (שעון ישראל)`,
    date: `${year}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}`,
  };
}

function isDeletedClaim(rowData: unknown) {
  return !!(rowData && typeof rowData === "object" && String((rowData as Record<string, unknown>).deletedAt || ""));
}

/** Atomically allocate the next permanent DAL claim ID (DAL-YYYY-XXXX). */
async function allocateNextDalClaimId(supabase: ReturnType<typeof createClient>): Promise<string> {
  try {
    const { data, error } = await supabase.rpc("claims_next_dal_id");
    if (!error && data && typeof data === "string" && data.startsWith("DAL-")) {
      return data;
    }
  } catch {}
  try {
    const { data: cfg } = await supabase
      .from("claims_config")
      .select("key, value")
      .eq("key", "CLAIM_COUNTER")
      .maybeSingle();
    const currentVal = parseInt(String(cfg?.value || "0"), 10) || 0;
    const nextVal = currentVal + 1;
    await supabase
      .from("claims_config")
      .upsert({
        key: "CLAIM_COUNTER",
        value: String(nextVal),
        updated_at: new Date().toISOString(),
      });
    const year = new Date().getFullYear();
    return `DAL-${year}-${String(nextVal).padStart(4, "0")}`;
  } catch {
    const year = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `DAL-${year}-${rand}`;
  }
}

/** One live claim by its id or by its insurer claim number. Never guesses between several. */
async function resolveClaimRef(
  supabase: ReturnType<typeof createClient>,
  ref: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const key = String(ref || "").trim();
  if (!key) return { ok: false, error: "לא צוין תיק. ציין מזהה תיק (DAL-YYYY-NNNN) או מספר תביעה." };
  const { data: byId } = await supabase.from("claims_records").select("id, row_data").eq("id", key).maybeSingle();
  if (byId && !isDeletedClaim(byId.row_data)) return { ok: true, id: String(byId.id) };
  const { data: byNum } = await supabase.from("claims_records").select("id, row_data").ilike("row_data->>claimNum", key);
  const live = (byNum || []).filter((r) => !isDeletedClaim(r.row_data));
  if (live.length === 1) return { ok: true, id: String(live[0].id) };
  if (live.length > 1) return { ok: false, error: `נמצאו ${live.length} תיקים עם מספר התביעה ${key}: ${live.map((r) => r.id).join(", ")}. ציין מזהה תיק.` };

  // Plate number (7–8 digits) or client name — still exactly one live claim, never a guess.
  const { data: all } = await supabase.from("claims_records").select("id, plate, client_name, row_data");
  const liveAll = (all || []).filter((r) => !isDeletedClaim(r.row_data));
  const digits = key.replace(/\D/g, "");
  let hits: typeof liveAll = [];
  let by = "";
  if (/^\d{7,8}$/.test(digits) && digits.length >= key.replace(/[\s-]/g, "").length) {
    hits = liveAll.filter((r) => String(r.plate || "").replace(/\D/g, "") === digits
      || String((r.row_data as Record<string, unknown>)?.plate || "").replace(/\D/g, "") === digits);
    by = "מספר הרכב";
  } else if (key.length >= 3) {
    const name = key.replace(/\s+/g, " ").toLowerCase();
    hits = liveAll.filter((r) => String(r.client_name || (r.row_data as Record<string, unknown>)?.clientName || "").replace(/\s+/g, " ").trim().toLowerCase() === name);
    by = "שם הלקוח";
  }
  if (hits.length === 1) return { ok: true, id: String(hits[0].id) };
  if (hits.length > 1) return { ok: false, error: `נמצאו ${hits.length} תיקים פעילים לפי ${by} "${key}": ${hits.map((r) => r.id).join(", ")}. ציין מזהה תיק.` };
  return { ok: false, error: `לא נמצא תיק פעיל עבור "${key}". אפשר לחפש עם search_claims.` };
}

const digitsOnly = (v: unknown) => String(v ?? "").replace(/\D/g, "");

async function previewUpdateClaimFields(
  supabase: ReturnType<typeof createClient>,
  claimId: string,
  args: Record<string, unknown>,
  userId: string,
  userName: string,
  toolName: string,
): Promise<{ result: unknown; preview?: ClaimsPendingAction }> {
  const { data: claim } = await supabase
    .from("claims_records")
    .select("id, row_data")
    .eq("id", claimId)
    .maybeSingle();
  if (!claim || isDeletedClaim(claim.row_data)) {
    return { result: { error: `התיק ${claimId} לא נמצא או שנמחק. לא בוצע שינוי.` } };
  }
  const rowData = (claim.row_data && typeof claim.row_data === "object" ? claim.row_data : {}) as Record<string, unknown>;
  const requested = (Array.isArray(args.changes) ? args.changes : [])
    .map((c) => (c && typeof c === "object" ? c as Record<string, unknown> : {}))
    .map((c) => ({ field: String(c.field || ""), value: String(c.value ?? "") }));
  const plan = planClaimFieldEdit(rowData, requested);

  if (!plan.changes.length) {
    return {
      result: {
        claim_id: claimId,
        status: "no_change",
        message: plan.errors.length ? "לא הוכן עדכון — יש שדות לא תקינים." : "הערכים כבר קיימים בתיק. אין מה לעדכן.",
        rejected: plan.errors,
        unchanged: plan.unchanged,
      },
    };
  }

  // Changes that may move mail matching to or from another claim.
  const warnings: string[] = [];
  for (const c of plan.changes) if (c.risk) warnings.push(`${c.label}: ${c.risk}`);
  const needsConflictCheck = plan.changes.some((c) => c.field === "plate" || c.field === "claimNum");
  if (needsConflictCheck) {
    const { data: others } = await supabase.from("claims_records").select("id, plate, row_data").neq("id", claimId);
    const live = (others || []).filter((r) => !isDeletedClaim(r.row_data));
    for (const c of plan.changes) {
      if (c.field === "plate") {
        const want = digitsOnly(c.after);
        const hits = live.filter((r) => digitsOnly(r.plate) === want || digitsOnly((r.row_data as Record<string, unknown>)?.plate) === want);
        if (hits.length) warnings.push(`⚠️ מספר הרכב ${c.after} כבר קיים בתיק אחר: ${hits.map((h) => h.id).join(", ")}. מיילים עלולים להיות משויכים לתיק הלא נכון.`);
      }
      if (c.field === "claimNum") {
        const want = c.after.trim().toUpperCase();
        const hits = live.filter((r) => String((r.row_data as Record<string, unknown>)?.claimNum || "").trim().toUpperCase() === want);
        if (hits.length) warnings.push(`⚠️ מספר התביעה ${c.after} כבר קיים בתיק אחר: ${hits.map((h) => h.id).join(", ")}.`);
      }
    }
  }

  const lines = describeChanges(plan.changes);
  const summary = [
    `תיקון פרטים בתיק ${claimId}:`,
    ...lines.map((l) => `• ${l}`),
    ...(warnings.length ? ["", "שים לב:", ...warnings.map((w) => `• ${w}`)] : []),
    ...(plan.errors.length ? ["", "לא ייכלל בעדכון:", ...plan.errors.map((e) => `• ${e}`)] : []),
  ].join("\n");

  const preview: ClaimsPendingAction = {
    preview_id: `P-FIELDS-${Date.now()}`,
    summary,
    tool_name: toolName,
    action_type: "update_claim_fields",
    parameters: { claim_id: claimId, changes: plan.changes, warnings },
  };

  await recordAiAudit(supabase, {
    userId,
    userName,
    claimId,
    toolName,
    actionType: "update_claim_fields",
    previewSummary: summary,
    previewPayload: preview.parameters,
    status: "preview_created",
  });

  return {
    result: {
      preview_id: preview.preview_id,
      status: "pending_approval",
      claim_id: claimId,
      message: "הוכן כרטיס אישור עם הערך הנוכחי מול הערך החדש. השינוי יישמר רק אחרי אישור המשתמש.",
      changes: lines,
      warnings,
      rejected: plan.errors,
      unchanged: plan.unchanged,
    },
    preview,
  };
}

async function checkDuplicatesHelper(
  supabase: ReturnType<typeof createClient>,
  args: {
    client_name?: string;
    client_phone?: string;
    client_email?: string;
    business_id?: string;
    plate?: string;
    claim_number?: string;
  }
) {
  const cleanPhone = String(args.client_phone || "").replace(/\D/g, "");
  const cleanPlate = String(args.plate || "").replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
  const cleanBusinessId = String(args.business_id || "").replace(/\D/g, "");
  const clientName = String(args.client_name || "").trim();
  const clientEmail = String(args.client_email || "").trim().toLowerCase();
  const claimNum = String(args.claim_number || "").trim();

  const matchedCustomers: Array<{
    id: string;
    name: string;
    phone: string;
    email: string;
    business_id?: string;
    reason: string;
  }> = [];

  // 1. Search customers
  if (cleanBusinessId && cleanBusinessId.length >= 5 && cleanBusinessId !== "חסר") {
    const { data: byBiz } = await supabase
      .from("customers")
      .select("id, name, phone, email, business_id")
      .eq("business_id", cleanBusinessId)
      .limit(5);
    for (const c of byBiz || []) {
      if (!matchedCustomers.some((x) => x.id === c.id)) {
        matchedCustomers.push({
          id: c.id,
          name: c.name,
          phone: c.phone || "",
          email: c.email || "",
          business_id: c.business_id || "",
          reason: `תעודת זהות / ח"פ תואם (${cleanBusinessId})`,
        });
      }
    }
  }

  if (cleanPhone && cleanPhone.length >= 7 && cleanPhone !== "חסר") {
    const { data: byPhone } = await supabase
      .from("customers")
      .select("id, name, phone, email, business_id")
      .ilike("phone", `%${cleanPhone.slice(-7)}%`)
      .limit(5);
    for (const c of byPhone || []) {
      if (!matchedCustomers.some((x) => x.id === c.id)) {
        matchedCustomers.push({
          id: c.id,
          name: c.name,
          phone: c.phone || "",
          email: c.email || "",
          business_id: c.business_id || "",
          reason: `מספר טלפון תואם (${c.phone})`,
        });
      }
    }
  }

  if (clientEmail && clientEmail.includes("@") && clientEmail !== "חסר") {
    const { data: byEmail } = await supabase
      .from("customers")
      .select("id, name, phone, email, business_id")
      .ilike("email", clientEmail)
      .limit(5);
    for (const c of byEmail || []) {
      if (!matchedCustomers.some((x) => x.id === c.id)) {
        matchedCustomers.push({
          id: c.id,
          name: c.name,
          phone: c.phone || "",
          email: c.email || "",
          business_id: c.business_id || "",
          reason: `כתובת מייל תואמת (${c.email})`,
        });
      }
    }
  }

  if (clientName && clientName.length >= 3 && clientName !== "חסר") {
    const { data: byName } = await supabase
      .from("customers")
      .select("id, name, phone, email, business_id")
      .ilike("name", `%${clientName}%`)
      .limit(5);
    for (const c of byName || []) {
      if (!matchedCustomers.some((x) => x.id === c.id)) {
        matchedCustomers.push({
          id: c.id,
          name: c.name,
          phone: c.phone || "",
          email: c.email || "",
          business_id: c.business_id || "",
          reason: `שם לקוח תואם (${c.name})`,
        });
      }
    }
  }

  // 2. Search claims_records
  const matchedClaims: Array<{
    id: string;
    plate: string;
    client_name: string;
    status: string;
    created_at?: string;
    reason: string;
  }> = [];

  if (cleanPlate && cleanPlate.length >= 5 && cleanPlate !== "חסר") {
    const { data: byPlate } = await supabase
      .from("claims_records")
      .select("id, plate, client_name, status, created_at")
      .ilike("plate", `%${cleanPlate}%`)
      .limit(5);
    for (const cl of byPlate || []) {
      matchedClaims.push({
        id: cl.id,
        plate: cl.plate || "",
        client_name: cl.client_name || "",
        status: cl.status || "",
        created_at: cl.created_at,
        reason: `מספר רישוי רכב תואם (${cl.plate})`,
      });
    }
  }

  if (claimNum && claimNum.length >= 3 && claimNum !== "חסר") {
    const { data: allClaims } = await supabase
      .from("claims_records")
      .select("id, plate, client_name, status, created_at, row_data")
      .limit(100);
    for (const cl of allClaims || []) {
      const rd = (cl.row_data && typeof cl.row_data === "object" ? cl.row_data : {}) as Record<string, unknown>;
      const cNum = String(rd.claimNumber || rd.insClaim || rd.claimNum || cl.id);
      if (cNum.includes(claimNum) && !matchedClaims.some((x) => x.id === cl.id)) {
        matchedClaims.push({
          id: cl.id,
          plate: cl.plate || "",
          client_name: cl.client_name || "",
          status: cl.status || "",
          created_at: cl.created_at,
          reason: `מספר תביעה תואם (${claimNum})`,
        });
      }
    }
  }

  return {
    has_duplicates: matchedCustomers.length > 0 || matchedClaims.length > 0,
    duplicate_customer_found: matchedCustomers.length > 0,
    matched_customers: matchedCustomers,
    duplicate_claim_found: matchedClaims.length > 0,
    matched_claims: matchedClaims,
    summary_message: (matchedCustomers.length > 0 || matchedClaims.length > 0)
      ? `נמצאו כפילויות אפשריות: ${matchedCustomers.length} לקוחות מתאימים, ${matchedClaims.length} תביעות מתאימות.`
      : `לא נמצאו כפילויות במערכת (הלקוח והתביעה חדשים).`,
  };
}

async function handlePreviewSaveAttachmentToClaim(
  supabase: ReturnType<typeof createClient>,
  claimId: string,
  args: Record<string, unknown>,
  userId: string,
  userName: string,
  attachments?: any[],
) {
  const desc = String(args.description || "הוספת קבצים לתיק מתוך הצ'אט").trim();
  const docKind = String(args.doc_kind || "general").trim();
  const chatFiles = (attachments || []).filter((a) => a && (a.data_base64 || a.dataBase64 || a.name));

  if (chatFiles.length === 0) {
    return {
      result: {
        error: "לא זוהו קבצים מצורפים בהודעת הצ'אט לשמירה בתיק. יש לצרף קובץ או תמונה כדי לשמור אותם בתיק.",
      },
    };
  }

  const previewId = `P-SAVE-${Date.now()}`;
  const filesList = chatFiles.map((f, i) => {
    const isPhoto = (f.mime_type || f.mimeType || "").startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(f.name);
    return `${i + 1}. ${f.name} (${isPhoto ? "תמונה לגלריה" : "מסמך לספרייה"})`;
  }).join("\n");

  const summary = `שמירת ${chatFiles.length} קבצים בתיק ${claimId}:\n${filesList}\nתיאור: ${desc}`;

  const preview: ClaimsPendingAction = {
    preview_id: previewId,
    summary,
    tool_name: "preview_save_attachment_to_claim",
    action_type: "save_attachment_to_claim",
    parameters: {
      claim_id: claimId,
      description: desc,
      doc_kind: docKind,
      files: chatFiles.map((f) => ({
        name: f.name,
        mime_type: f.mime_type || f.mimeType || "application/octet-stream",
        byte_size: f.byte_size || f.size || 0,
        data_base64: f.data_base64 || f.dataBase64 || "",
        doc_kind: docKind,
      })),
    },
  };

  await recordAiAudit(supabase, {
    userId,
    userName,
    claimId,
    toolName: "preview_save_attachment_to_claim",
    actionType: "save_attachment_to_claim",
    previewSummary: summary,
    previewPayload: preview.parameters,
    status: "preview_created",
  });

  return {
    result: {
      preview_id: previewId,
      status: "pending_approval",
      message: "הוכנה תצוגה מקדימה לשמירת הקבצים בתיק. נדרש אישור המשתמש לביצוע.",
      details: {
        claim_id: claimId,
        files_count: chatFiles.length,
        files_names: chatFiles.map((f) => f.name),
        description: desc,
      },
    },
    preview,
  };
}

async function handlePreviewCreateClaimFromOnboarding(
  supabase: ReturnType<typeof createClient>,
  args: Record<string, unknown>,
  userId: string,
  userName: string,
  attachments?: any[],
) {
  const norm = (v: unknown): string => {
    if (!v) return "חסר";
    const s = String(v).trim();
    if (!s || s === "null" || s === "undefined" || s === "לא צוין" || s === "unknown" || s === "N/A") return "חסר";
    return s;
  };

  const clientName = norm(args.client_name);
  const clientPhone = norm(args.client_phone);
  const clientEmail = norm(args.client_email);
  const businessId = norm(args.business_id);
  const customerType = String(args.customer_type || "private").trim();
  const existingCustId = args.existing_customer_id ? String(args.existing_customer_id).trim() : "";

  // A plate is 7–8 digits; anything else is treated as missing rather than saved as given.
  const plateRaw = norm(args.plate);
  const plateDigits = plateRaw.replace(/\D/g, "");
  const plate = plateRaw !== "חסר" && /^\d{7,8}$/.test(plateDigits) ? plateRaw : "חסר";
  const plateRejected = plateRaw !== "חסר" && plate === "חסר";
  const isTest = args.is_test === true || String(args.is_test || "") === "true";
  const make = norm(args.make);
  const model = norm(args.model);
  const year = norm(args.year);

  const insuranceCompany = norm(args.insurance_company);
  const claimNumber = norm(args.claim_number);
  const accidentDate = norm(args.accident_date);
  const surveyor = norm(args.surveyor);
  const garage = args.garage ? String(args.garage).trim() : "חסר";
  const damageDescription = norm(args.damage_description);
  const thirdParty = norm(args.third_party);
  const status = args.status ? String(args.status).trim() : "חדש";

  const missingFields: string[] = [];
  if (clientName === "חסר") missingFields.push("שם לקוח");
  if (clientPhone === "חסר") missingFields.push("טלפון לקוח");
  if (clientEmail === "חסר") missingFields.push("אימייל לקוח");
  if (businessId === "חסר") missingFields.push("ת\"ז / ח\"פ לקוח");
  if (plate === "חסר") missingFields.push("מספר רישוי");
  if (make === "חסר") missingFields.push("יצרן רכב");
  if (model === "חסר") missingFields.push("דגם רכב");
  if (year === "חסר") missingFields.push("שנת ייצור");
  if (insuranceCompany === "חסר") missingFields.push("חברת ביטוח");
  if (claimNumber === "חסר") missingFields.push("מספר תביעה בביטוח");
  if (accidentDate === "חסר") missingFields.push("תאריך אירוע");
  if (surveyor === "חסר") missingFields.push("שם שמאי");
  if (damageDescription === "חסר") missingFields.push("תיאור נזק ומוקדי פגיעה");

  // Check duplicates
  const dupCheck = await checkDuplicatesHelper(supabase, {
    client_name: clientName,
    client_phone: clientPhone,
    client_email: clientEmail,
    business_id: businessId,
    plate: plate,
    claim_number: claimNumber,
  });

  const chatFiles = (attachments || []).filter((a) => a && (a.data_base64 || a.dataBase64 || a.name));
  const classifiedFiles = chatFiles.map((f, idx) => {
    const classification = classifyAttachment(f.name || `קובץ_${idx + 1}`, f.mime_type || f.mimeType || "");
    return {
      name: f.name || `קובץ_${idx + 1}`,
      mime_type: f.mime_type || f.mimeType || "application/octet-stream",
      byte_size: f.byte_size || f.size || 0,
      data_base64: f.data_base64 || f.dataBase64 || "",
      doc_kind: classification.doc_kind,
      staff_type: classification.staff_type,
      category: classification.category,
      is_photo: classification.is_photo,
    };
  });

  const previewId = `P-ONBOARD-${Date.now()}`;
  let summary = `${isTest ? "🧪 תיק בדיקה (QA) — מזהה DAL-QA-…, לא נספר במונה התיקים\n" : ""}📋 פתיחת תיק תביעה חדש וקליטת לקוח מתוך מסמכים:
👤 לקוח: ${clientName} | טלפון: ${clientPhone} | מייל: ${clientEmail} | ת"ז/ח"פ: ${businessId}
🚗 רכב: מספר רישוי ${plate} | יצרן: ${make} | דגם: ${model} | שנה: ${year}
🏢 תביעה: ביטוח: ${insuranceCompany} | מס' תביעה: ${claimNumber} | תאריך אירוע: ${accidentDate}
🔧 מוסך: ${garage} | שמאי: ${surveyor}
💥 נזק: ${damageDescription}
📁 קבצים שיצורפו לתיק (${classifiedFiles.length}):
${classifiedFiles.length > 0 ? classifiedFiles.map((f, i) => `${i + 1}. ${f.name} — ${f.category}`).join("\n") : "לא הועלו קבצים"}
${missingFields.length > 0 ? `⚠️ שדות חסרים שסומנו כ-"חסר": ${missingFields.join(", ")}` : "✨ כל השדות זוהו בהצלחה."}${plateRejected ? `
⚠️ מספר הרישוי "${plateRaw}" אינו תקין (7–8 ספרות) ולא יישמר.` : ""}
🗄️ יעד השמירה: מערכת ניהול התביעות של סביבת STAGING (dalia-staging) בלבד.`;

  if (dupCheck.has_duplicates) {
    summary += `\n⚠️ אזהרת כפילות במערכת:\n`;
    if (dupCheck.matched_customers.length > 0) {
      summary += dupCheck.matched_customers.map((c) => `• לקוח קיים במערכת: ${c.name} (${c.reason}) - מזהה: ${c.id}`).join("\n") + "\n";
    }
    if (dupCheck.matched_claims.length > 0) {
      summary += dupCheck.matched_claims.map((cl) => `• תיק תביעה קיים: ${cl.id} (${cl.reason}) - סטטוס: ${cl.status}`).join("\n");
    }
  }

  const preview: ClaimsPendingAction = {
    preview_id: previewId,
    summary,
    tool_name: "preview_create_claim_from_onboarding",
    action_type: "create_claim_from_onboarding",
    parameters: {
      client: {
        name: clientName,
        phone: clientPhone,
        email: clientEmail,
        business_id: businessId,
        customer_type: customerType,
        existing_customer_id: existingCustId || (dupCheck.matched_customers[0]?.id || null),
      },
      vehicle: {
        plate,
        make,
        model,
        year,
      },
      is_test: isTest,
      claim: {
        insurance_company: insuranceCompany,
        claim_number: claimNumber,
        accident_date: accidentDate,
        surveyor,
        garage,
        damage_description: damageDescription,
        third_party: thirdParty,
        status,
      },
      files: classifiedFiles,
      missing_fields: missingFields,
      duplicates: dupCheck,
    },
  };

  await recordAiAudit(supabase, {
    userId,
    userName,
    toolName: "preview_create_claim_from_onboarding",
    actionType: "create_claim_from_onboarding",
    previewSummary: summary,
    previewPayload: preview.parameters,
    status: "preview_created",
  });

  return {
    result: {
      preview_id: previewId,
      status: "pending_approval",
      message: "הוכנה תצוגה מקדימה לפתיחת תיק תביעה ולקוח. נדרש אישור המשתמש לביצוע.",
      client_name: clientName,
      plate,
      missing_fields: missingFields,
      duplicates_found: dupCheck.has_duplicates,
      files_count: classifiedFiles.length,
    },
    preview,
  };
}


export async function recordAiAudit(
  supabase: ReturnType<typeof createClient>,
  entry: {
    userId: string;
    userName?: string;
    claimId?: string | null;
    conversationId?: string | null;
    toolName: string;
    actionType: string;
    userPrompt?: string;
    previewSummary?: string;
    previewPayload?: Record<string, unknown> | null;
    approvedBy?: string | null;
    approvedByName?: string | null;
    executionAction?: string;
    stateBefore?: Record<string, unknown> | null;
    stateAfter?: Record<string, unknown> | null;
    status: "success" | "preview_created" | "approved" | "executed" | "cancelled" | "failed";
    errorMessage?: string | null;
  },
) {
  try {
    await supabase.from("claims_ai_audit_log").insert({
      user_id: entry.userId,
      user_name: entry.userName || "",
      claim_id: entry.claimId || null,
      conversation_id: entry.conversationId || null,
      tool_name: entry.toolName,
      action_type: entry.actionType,
      user_prompt: entry.userPrompt || "",
      preview_summary: entry.previewSummary || null,
      preview_payload: entry.previewPayload || null,
      approved_by: entry.approvedBy || null,
      approved_by_name: entry.approvedByName || null,
      execution_action: entry.executionAction || null,
      state_before: entry.stateBefore || null,
      state_after: entry.stateAfter || null,
      status: entry.status,
      error_message: entry.errorMessage || null,
    });
  } catch (err) {
    console.error("Failed to insert claims_ai_audit_log:", err);
  }
}

function getTodayStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// -------------------------------------------------------------
// 5. TOOL EXECUTION: Open Claim Mode (executeClaimsTool)
// -------------------------------------------------------------
export async function executeClaimsTool(
  name: string,
  args: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  claimId: string,
  userId: string,
  userName: string,
  attachments?: Array<{ name: string; mime_type: string; data_base64?: string; file_id?: string; byte_size?: number }>,
): Promise<{ result: unknown; preview?: ClaimsPendingAction; card?: ClaimsDocumentCard }> {
  try {
    switch (name) {
      case "get_claims_status_report": {
        return await handleGetClaimsStatusReport(supabase, args, userId, userName, name);
      }

      case "search_claim_emails": {
        const direction = String(args.direction || "all").toLowerCase();
        const query = String(args.query || "").trim().toLowerCase();
        const limit = Math.min(Number(args.limit || 15), 30);

        let imports: Array<Record<string, unknown>> = [];
        let outbox: Array<Record<string, unknown>> = [];
        let pending: Array<Record<string, unknown>> = [];

        if (direction === "inbound" || direction === "all") {
          let impQuery = supabase
            .from("claims_gmail_imports")
            .select("id, gmail_message_id, gmail_thread_id, from_addr, to_addr, subject, body_text, sent_at, attachment_count");
          if (claimId) {
            impQuery = impQuery.eq("claim_id", claimId);
          }
          const { data } = await impQuery.order("sent_at", { ascending: false }).limit(limit);
          imports = (data || []).map((m) => ({
            id: m.id,
            gmail_message_id: m.gmail_message_id,
            direction: "inbound",
            from: m.from_addr,
            to: m.to_addr,
            subject: m.subject,
            snippet: (m.body_text || "").slice(0, 200),
            sent_at: m.sent_at,
            status: "מיובא לתיק",
            source: "claims_gmail_imports",
            attachments: m.attachment_count || 0,
          }));
        }

        if (direction === "outbound" || direction === "all") {
          let outQuery = supabase
            .from("claims_gmail_outbox")
            .select("id, gmail_message_id, gmail_thread_id, to_addr, subject, body_excerpt, sent_at, status, file_ids, file_names");
          if (claimId) {
            outQuery = outQuery.eq("claim_id", claimId);
          }
          const { data } = await outQuery.order("sent_at", { ascending: false }).limit(limit);
          outbox = (data || []).map((m) => ({
            id: m.id,
            gmail_message_id: m.gmail_message_id,
            direction: "outbound",
            from: CLAIMS_SENDER_NAME,
            to: m.to_addr,
            subject: m.subject,
            snippet: (m.body_excerpt || "").slice(0, 200),
            sent_at: m.sent_at,
            status: m.status,
            source: "claims_gmail_outbox",
            file_ids: m.file_ids || [],
            file_names: m.file_names || [],
            attachments: Array.isArray(m.file_ids) ? m.file_ids.length : 0,
          }));
        }

        // Cross-reference claims_gmail_pending: holds live scanned emails directly from Gmail
        let pendQuery = supabase
          .from("claims_gmail_pending")
          .select("id, gmail_message_id, gmail_thread_id, from_addr, subject, snippet, sent_at, decision, reason, assigned_claim_id, candidates");

        if (claimId) {
          pendQuery = pendQuery.or(`assigned_claim_id.eq.${claimId},candidates.cs.{"${claimId}"},assigned_claim_id.is.null`);
        }
        const { data: pendData } = await pendQuery.order("sent_at", { ascending: false }).limit(limit * 2);

        // Fetch claim plate / client if inside claim
        let claimPlateForSearch = "";
        let claimNumForSearch = "";
        if (claimId) {
          const { data: cRec } = await supabase.from("claims_records").select("plate, row_data").eq("id", claimId).maybeSingle();
          if (cRec) {
            const rd = (cRec.row_data && typeof cRec.row_data === "object" ? cRec.row_data : {}) as Record<string, unknown>;
            claimPlateForSearch = String(cRec.plate || rd.plate || "").trim();
            claimNumForSearch = String(rd.claimNum || "").trim();
          }
        }

        const seenMsgIds = new Set<string>([
          ...imports.map((m) => String(m.gmail_message_id || "")).filter(Boolean),
          ...outbox.map((m) => String(m.gmail_message_id || "")).filter(Boolean),
        ]);

        for (const p of pendData || []) {
          const msgId = String(p.gmail_message_id || "");
          if (seenMsgIds.has(msgId)) continue;

          // If unassigned in pending, only include if relevant to this claim or matches query
          if (claimId && !p.assigned_claim_id) {
            const hay = [p.from_addr || "", p.subject || "", p.snippet || ""].join(" ");
            const rel = (claimPlateForSearch && matchesEmailSearch(hay, claimPlateForSearch)) ||
                        (claimNumForSearch && matchesEmailSearch(hay, claimNumForSearch)) ||
                        (query && matchesEmailSearch(hay, query));
            if (!rel) continue;
          }

          seenMsgIds.add(msgId);

          const from = String(p.from_addr || "");
          const isUserSend = from.includes("yoni122222") || from.includes("yoni atias") || from.toLowerCase().includes("atias");
          const dir = isUserSend ? "outbound" : "inbound";
          if (direction !== "all" && direction !== dir) continue;

          pending.push({
            id: p.id,
            gmail_message_id: p.gmail_message_id,
            direction: dir,
            from: isUserSend ? CLAIMS_SENDER_NAME : p.from_addr,
            to: isUserSend ? "נמען ב-Gmail" : CLAIMS_SENDER_NAME,
            subject: p.subject,
            snippet: p.snippet,
            sent_at: p.sent_at,
            status: isUserSend ? "נשלח מ-Gmail (ממתין לסנכרון בתיק)" : "התקבל ב-Gmail (ממתין לסנכרון בתיק)",
            source: "claims_gmail_pending",
            decision: p.decision,
            attachments: 0,
          });
        }

        let combined = [...imports, ...outbox, ...pending];
        if (query) {
          combined = combined.filter((m) => {
            const hay = [
              m.subject || "",
              m.snippet || "",
              m.from || "",
              m.to || "",
              m.gmail_message_id || "",
            ].join(" ");
            return matchesEmailSearch(hay, query);
          });
        }
        combined.sort((a, b) => new Date(String(b.sent_at || "")).getTime() - new Date(String(a.sent_at || "")).getTime());

        // Check for duplicate sends in outbound emails
        const allOutbounds = combined.filter((m) => m.direction === "outbound");
        let duplicateAlert: string | null = null;
        if (allOutbounds.length >= 2) {
          for (let i = 0; i < allOutbounds.length - 1; i++) {
            const m1 = allOutbounds[i];
            const m2 = allOutbounds[i + 1];
            const s1 = String(m1.subject || "").trim().toLowerCase();
            const s2 = String(m2.subject || "").trim().toLowerCase();
            const t1 = new Date(String(m1.sent_at || "")).getTime();
            const t2 = new Date(String(m2.sent_at || "")).getTime();
            const diffSeconds = Math.abs(t1 - t2) / 1000;
            if (s1 && s2 && s1 === s2 && diffSeconds < 600) {
              duplicateAlert = `שים לב: זוהתה שליחה כפולה ב-Gmail של אותו אימייל ("${m1.subject}") בהפרש של ${Math.round(diffSeconds)} שניות (מזהי הודעות: ${m1.gmail_message_id || m1.id} ו-${m2.gmail_message_id || m2.id}).`;
              break;
            }
          }
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "search_emails",
          status: "success",
        });

        return {
          result: {
            claim_id: claimId,
            found_count: combined.length,
            duplicate_send_alert: duplicateAlert,
            verification_note: "הנתונים מוצלבים מול כל תיבת ה-Gmail (הודעות שנשלחו מהמערכת, וכן הודעות שנשלחו או התקבלו ב-Gmail וממתינות לסנכרון)",
            emails: combined.slice(0, limit),
          },
        };
      }

      case "list_scheduled_claim_emails": {
        let query = supabase
          .from("claims_reminders")
          .select("id, claim_id, mail_to, mail_subject, next_run_at, status, row_data, created_at")
          .eq("action", "send_email")
          .eq("status", "scheduled")
          .order("next_run_at", { ascending: true });

        if (claimId) {
          query = query.eq("claim_id", claimId);
        } else if (args.claim_ref) {
          const resolved = await resolveClaimRef(supabase, String(args.claim_ref));
          if (resolved.ok) {
            query = query.eq("claim_id", resolved.id);
          }
        }

        const { data: rows, error: qErr } = await query.limit(25);
        if (qErr) {
          return { result: { error: `שגיאה בשליפת מיילים מתוזמנים: ${qErr.message}` } };
        }

        const scheduled = (rows || []).map((r) => {
          const rd = (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>;
          const fids = String(rd.file_ids || "").split(",").map((s) => s.trim()).filter(Boolean);
          const attTitles = Array.isArray(rd.attachment_titles) ? rd.attachment_titles : [];
          return {
            reminder_id: r.id,
            claim_id: r.claim_id,
            to: r.mail_to,
            subject: r.mail_subject,
            next_run_at: r.next_run_at,
            scheduled_at_label: String(rd.scheduled_at_label || r.next_run_at || ""),
            attachments_count: fids.length,
            attachments: attTitles,
            pre_approved: true,
          };
        });

        return {
          result: {
            claim_id: claimId || (args.claim_ref ? String(args.claim_ref) : null),
            count: scheduled.length,
            scheduled_emails: scheduled,
            message: scheduled.length === 0
              ? (claimId ? "אין אימיילים מתוזמנים בתיק זה." : "אין אימיילים מתוזמנים פעילים במערכת.")
              : `נמצאו ${scheduled.length} אימיילים מתוזמנים שממתינים לשליחה אוטומטית ע״י השרת.`,
          },
        };
      }

      case "get_latest_claim_email": {
        const direction = String(args.direction || "any").toLowerCase();
        let latestInbound: Record<string, unknown> | null = null;
        let latestOutbound: Record<string, unknown> | null = null;

        if (direction === "inbound" || direction === "any") {
          const { data } = await supabase
            .from("claims_gmail_imports")
            .select("id, gmail_message_id, gmail_thread_id, from_addr, to_addr, subject, body_text, sent_at, attachment_count")
            .eq("claim_id", claimId)
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) {
            latestInbound = {
              id: data.id,
              gmail_message_id: data.gmail_message_id,
              direction: "inbound",
              from: data.from_addr,
              to: data.to_addr,
              subject: data.subject,
              body_snippet: (data.body_text || "").slice(0, 400),
              sent_at: data.sent_at,
              status: "מיובא לתיק",
              attachments: data.attachment_count || 0,
            };
          }
        }

        if (direction === "outbound" || direction === "any") {
          const { data } = await supabase
            .from("claims_gmail_outbox")
            .select("id, gmail_message_id, gmail_thread_id, to_addr, subject, body_text, sent_at, status, file_ids")
            .eq("claim_id", claimId)
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) {
            latestOutbound = {
              id: data.id,
              gmail_message_id: data.gmail_message_id,
              direction: "outbound",
              from: CLAIMS_SENDER_NAME,
              to: data.to_addr,
              subject: data.subject,
              body_snippet: (data.body_text || "").slice(0, 400),
              sent_at: data.sent_at,
              status: data.status,
              attachments: Array.isArray(data.file_ids) ? data.file_ids.length : 0,
            };
          }
        }

        // Cross-reference claims_gmail_pending for live messages in Gmail
        if (claimId) {
          const { data: pendRows } = await supabase
            .from("claims_gmail_pending")
            .select("id, gmail_message_id, from_addr, subject, snippet, sent_at")
            .or(`assigned_claim_id.eq.${claimId},candidates.cs.{"${claimId}"}`)
            .order("sent_at", { ascending: false })
            .limit(5);

          for (const p of pendRows || []) {
            const from = String(p.from_addr || "");
            const isUserSend = from.includes("yoni122222") || from.includes("yoni atias") || from.toLowerCase().includes("atias");
            const pTime = new Date(String(p.sent_at || "")).getTime();
            if (isUserSend && (direction === "outbound" || direction === "any")) {
              const curOutTime = latestOutbound ? new Date(String(latestOutbound.sent_at || "")).getTime() : 0;
              if (pTime > curOutTime) {
                latestOutbound = {
                  id: p.id,
                  gmail_message_id: p.gmail_message_id,
                  direction: "outbound",
                  from: CLAIMS_SENDER_NAME,
                  to: "נמען ב-Gmail",
                  subject: p.subject,
                  body_snippet: (p.snippet || "").slice(0, 400),
                  sent_at: p.sent_at,
                  status: "נשלח מ-Gmail (ממתין לסנכרון בתיק)",
                  attachments: 0,
                };
              }
            } else if (!isUserSend && (direction === "inbound" || direction === "any")) {
              const curInTime = latestInbound ? new Date(String(latestInbound.sent_at || "")).getTime() : 0;
              if (pTime > curInTime) {
                latestInbound = {
                  id: p.id,
                  gmail_message_id: p.gmail_message_id,
                  direction: "inbound",
                  from: p.from_addr,
                  to: CLAIMS_SENDER_NAME,
                  subject: p.subject,
                  body_snippet: (p.snippet || "").slice(0, 400),
                  sent_at: p.sent_at,
                  status: "התקבל ב-Gmail (ממתין לסנכרון בתיק)",
                  attachments: 0,
                };
              }
            }
          }
        }

        let selected = latestInbound || latestOutbound;
        if (direction === "inbound") selected = latestInbound;
        else if (direction === "outbound") selected = latestOutbound;
        else if (latestInbound && latestOutbound) {
          const tIn = new Date(String(latestInbound.sent_at || "")).getTime();
          const tOut = new Date(String(latestOutbound.sent_at || "")).getTime();
          selected = tIn >= tOut ? latestInbound : latestOutbound;
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "get_latest_email",
          status: "success",
        });

        return {
          result: {
            claim_id: claimId,
            has_email: !!selected,
            latest_email: selected,
          },
        };
      }

      case "read_email_content": {
        const emailId = String(args.email_id || "").trim();
        const direction = String(args.direction || "").toLowerCase();

        if (!emailId) {
          return { result: { error: "email_id is required" } };
        }

        let emailData: Record<string, unknown> | null = null;
        if (direction !== "outbound") {
          let impQ = supabase
            .from("claims_gmail_imports")
            .select("*")
            .or(`id.eq.${emailId},gmail_message_id.eq.${emailId}`);
          if (claimId) {
            impQ = impQ.eq("claim_id", claimId);
          }
          const { data } = await impQ.maybeSingle();
          if (data) {
            emailData = {
              id: data.id,
              gmail_message_id: data.gmail_message_id,
              direction: "inbound",
              from: data.from_addr,
              to: data.to_addr,
              cc: data.cc_addr,
              subject: data.subject,
              body: data.body_text,
              sent_at: data.sent_at,
              attachments_count: data.attachment_count || 0,
            };
          }
        }

        if (!emailData && direction !== "inbound") {
          let outQ = supabase
            .from("claims_gmail_outbox")
            .select("*")
            .or(`id.eq.${emailId},gmail_message_id.eq.${emailId}`);
          if (claimId) {
            outQ = outQ.eq("claim_id", claimId);
          }
          const { data } = await outQ.maybeSingle();
          if (data) {
            emailData = {
              id: data.id,
              gmail_message_id: data.gmail_message_id,
              direction: "outbound",
              from: CLAIMS_SENDER_NAME,
              to: data.to_addr,
              cc: data.cc_addr,
              subject: data.subject,
              body: data.body_text,
              sent_at: data.sent_at,
              status: data.status,
              file_ids: data.file_ids,
            };
          }
        }

        // Check claims_gmail_pending if not found in imports or outbox
        if (!emailData) {
          const { data: pendItem } = await supabase
            .from("claims_gmail_pending")
            .select("*")
            .or(`id.eq.${emailId},gmail_message_id.eq.${emailId}`)
            .maybeSingle();

          if (pendItem) {
            const from = String(pendItem.from_addr || "");
            const isUserSend = from.includes("yoni122222") || from.includes("yoni atias") || from.toLowerCase().includes("atias");
            emailData = {
              id: pendItem.id,
              gmail_message_id: pendItem.gmail_message_id,
              direction: isUserSend ? "outbound" : "inbound",
              from: isUserSend ? CLAIMS_SENDER_NAME : pendItem.from_addr,
              to: isUserSend ? "נמען ב-Gmail" : CLAIMS_SENDER_NAME,
              subject: pendItem.subject,
              body: pendItem.snippet,
              sent_at: pendItem.sent_at,
              status: isUserSend ? "נשלח מ-Gmail (ממתין לסנכרון בתיק)" : "התקבל ב-Gmail (ממתין לסנכרון בתיק)",
              attachments_count: Number(pendItem.attachment_count || 0),
            };
          }
        }

        // If email only has snippet or was found directly, fetch full message body and attachments via claims-gmail read_message
        const rawMsgId = String(emailData?.gmail_message_id || emailId).replace(/^GIP-|^GIM-[^-]+-/, "");
        if (rawMsgId && (!emailData || !emailData.body || emailData.body.length <= 250)) {
          try {
            const readRes = await supabase.functions.invoke("claims-gmail", {
              body: { action: "read_message", message_id: rawMsgId, claim_id: claimId || undefined },
            });
            if (readRes.data?.message) {
              const msg = readRes.data.message;
              emailData = {
                id: emailData?.id || msg.id,
                gmail_message_id: msg.id,
                direction: emailData?.direction || "inbound",
                from: msg.from || emailData?.from,
                to: msg.to || emailData?.to,
                cc: msg.cc || emailData?.cc,
                subject: msg.subject || emailData?.subject,
                body: msg.bodyText || emailData?.body || "",
                sent_at: msg.date || emailData?.sent_at,
                attachments_count: msg.attachments?.length ?? (emailData?.attachments_count || 0),
                attachments: msg.attachments || [],
              };
            }
          } catch {
            // keep existing emailData
          }
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "read_email_content",
          status: "success",
        });

        return {
          result: {
            claim_id: claimId,
            found: !!emailData,
            email: emailData,
          },
        };
      }

      case "get_email_attachments": {
        const emailId = String(args.email_id || "").trim();
        if (!emailId) {
          return { result: { error: "email_id is required" } };
        }

        const { data: docs } = await supabase
          .from("claims_documents")
          .select("id, original_name, mime_type, byte_size, storage_path, created_at, source, doc_meta")
          .eq("claim_id", claimId);

        const emailAttachments = (docs || []).filter((d) => {
          return d.source === "gmail" || (d.storage_path && d.storage_path.includes(emailId));
        });

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "get_email_attachments",
          status: "success",
        });

        // Stored document text reaches the model only for an approved QA claim (see claimQaScope.ts).
        const contentAllowed = await docTextToModelAllowed(supabase, claimId);
        return {
          result: {
            claim_id: claimId,
            email_id: emailId,
            count: emailAttachments.length,
            read_instruction: "הקבצים המצורפים שמורים כמסמכי התיק. כדי לענות על תוכן קובץ (סכום, מספר חשבונית, שם, מספר רישיון) קרא ל-read_claim_document עם id של הקובץ. אל תענה משם הקובץ.",
            attachments: emailAttachments.map((a) => ({
              id: a.id,
              name: a.original_name,
              size_bytes: a.byte_size,
              mime_type: a.mime_type,
              document_read: storedDocumentRead(a.doc_meta, { contentAllowed }),
            })),
          },
        };
      }

      case "check_insurance_reply": {
        let importsQuery = supabase
          .from("claims_gmail_imports")
          .select("id, from_addr, to_addr, subject, body_text, sent_at, attachment_count");
        if (claimId) {
          importsQuery = importsQuery.eq("claim_id", claimId);
        }
        const { data } = await importsQuery.order("sent_at", { ascending: false });

        const insuranceKeywords = ["ביטוח", "שומרה", "מגדל", "כלל", "הראל", "הפניקס", "שלמה", "איילון", "מנורה", "aig", "איג", "shlomo", "migdal", "clal", "harel", "fnx", "menora", "ayalon"];
        const insuranceMails = (data || []).filter((m) => {
          const from = String(m.from_addr || "").toLowerCase();
          const subj = String(m.subject || "").toLowerCase();
          return insuranceKeywords.some((kw) => from.includes(kw) || subj.includes(kw));
        });

        // Also check claims_gmail_pending for incoming insurance emails
        let pendQuery = supabase
          .from("claims_gmail_pending")
          .select("id, gmail_message_id, from_addr, subject, snippet, sent_at");
        if (claimId) {
          pendQuery = pendQuery.or(`assigned_claim_id.eq.${claimId},candidates.cs.{"${claimId}"}`);
        }
        const { data: pendRows } = await pendQuery.order("sent_at", { ascending: false });

        for (const p of pendRows || []) {
          const from = String(p.from_addr || "").toLowerCase();
          const subj = String(p.subject || "").toLowerCase();
          const isUserSend = from.includes("yoni122222") || from.includes("yoni atias") || from.includes("atias");
          if (!isUserSend && insuranceKeywords.some((kw) => from.includes(kw) || subj.includes(kw))) {
            insuranceMails.push({
              id: p.id,
              from_addr: p.from_addr,
              to_addr: CLAIMS_SENDER_NAME,
              subject: p.subject,
              body_text: p.snippet,
              sent_at: p.sent_at,
              attachment_count: 0,
            });
          }
        }

        insuranceMails.sort((a, b) => new Date(String(b.sent_at || "")).getTime() - new Date(String(a.sent_at || "")).getTime());
        const latestReply = insuranceMails[0] || null;

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "check_insurance_reply",
          status: "success",
        });

        return {
          result: {
            claim_id: claimId,
            insurance_replied: !!latestReply,
            replies_count: insuranceMails.length,
            latest_reply: latestReply ? {
              from: latestReply.from_addr,
              date: latestReply.sent_at,
              subject: latestReply.subject,
              summary: (latestReply.body_text || "").slice(0, 300),
              attachments: latestReply.attachment_count || 0,
            } : null,
          },
        };
      }

      case "check_customer_email_sent": {
        const { data: rec } = await supabase
          .from("claims_records")
          .select("client_name, row_data")
          .eq("id", claimId)
          .maybeSingle();

        const row = (rec?.row_data && typeof rec.row_data === "object" ? rec.row_data : {}) as Record<string, unknown>;
        const clientEmail = String(row.clientEmail || "").trim().toLowerCase();
        const clientName = String(rec?.client_name || row.clientName || "");

        const { data: outbox } = await supabase
          .from("claims_gmail_outbox")
          .select("id, to_addr, subject, body_text, sent_at, status")
          .eq("claim_id", claimId)
          .order("sent_at", { ascending: false });

        const customerMails = (outbox || []).filter((m) => {
          const to = String(m.to_addr || "").toLowerCase();
          return clientEmail && to.includes(clientEmail);
        });

        const latestSent = customerMails[0] || (outbox && outbox[0]) || null;

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "check_customer_email_sent",
          status: "success",
        });

        return {
          result: {
            claim_id: claimId,
            customer_name: clientName,
            customer_email: clientEmail || "לא מוגדרת כתובת מייל בתיק",
            email_sent: !!latestSent,
            sent_count: customerMails.length,
            latest_email: latestSent ? {
              to: latestSent.to_addr,
              date: latestSent.sent_at,
              subject: latestSent.subject,
              status: latestSent.status,
            } : null,
          },
        };
      }

      case "draft_email_reply": {
        const importId = String(args.import_id || "").trim();
        let targetImport: Record<string, unknown> | null = null;

        if (importId) {
          let q = supabase
            .from("claims_gmail_imports")
            .select("*")
            .or(`id.eq.${importId},gmail_message_id.eq.${importId}`);
          if (claimId) {
            q = q.eq("claim_id", claimId);
          }
          const { data } = await q.maybeSingle();
          targetImport = data;
        } else {
          const { data } = await supabase
            .from("claims_gmail_imports")
            .select("*")
            .eq("claim_id", claimId)
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          targetImport = data;
        }

        if (!targetImport) {
          return {
            result: {
              success: false,
              message: "לא נמצא מייל נכנס בתיק לניסוח תשובה",
            },
          };
        }

        const replyTo = targetImport.from_addr;
        const subject = String(targetImport.subject || "").startsWith("Re:")
          ? targetImport.subject
          : `Re: ${targetImport.subject || "פנייה בנושא תביעה"}`;

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "draft_email_reply",
          status: "success",
        });

        return {
          result: {
            claim_id: claimId,
            reply_to: replyTo,
            subject,
            in_reply_to_message_id: targetImport.gmail_message_id,
            gmail_thread_id: (targetImport as Record<string, unknown>).gmail_thread_id || null,
            reply_instruction: "להשבה בתוך השרשור העבר את gmail_thread_id כ-thread_id ל-preview_send_claim_email.",
            original_date: targetImport.sent_at,
            original_snippet: (targetImport.body_text || "").slice(0, 200),
            suggested_opening: "שלום רב,\\nבהמשך לפנייתכם בנושא תביעה זו, להלן המידע והמסמכים הנדרשים:",
          },
        };
      }

      case "list_claim_documents": {
        const filterType = String(args.filter_type || "all").toLowerCase();
        const query = String(args.query || "").trim().toLowerCase();

        const { data: docs } = await supabase
          .from("claims_documents")
          .select("id, original_name, mime_type, byte_size, doc_kind, doc_meta, created_at, source")
          .eq("claim_id", claimId)
          .order("created_at", { ascending: false });

        let filtered = docs || [];
        if (filterType === "photos") {
          filtered = filtered.filter((d) =>
            String(d.mime_type || "").startsWith("image/") ||
            String(d.doc_kind || "").includes("photo") ||
            /\.(jpe?g|png|webp|heic|heif)$/i.test(d.original_name || "")
          );
        } else if (filterType === "docs") {
          filtered = filtered.filter((d) =>
            String(d.mime_type || "").includes("pdf") ||
            String(d.doc_kind || "").includes("report") ||
            String(d.doc_kind || "").includes("invoice") ||
            String(d.doc_kind || "").includes("license") ||
            String(d.doc_kind || "").includes("policy")
          );
        }

        if (query) {
          const words = query.split(/\s+/).filter((w) => w.length >= 2);
          filtered = filtered.filter((d) => {
            const meta = (d.doc_meta && typeof d.doc_meta === "object" ? d.doc_meta : {}) as Record<string, string>;
            const hay = [
              documentDisplayTitle({ original_name: String(d.original_name || ""), doc_meta: meta }),
              documentLabel(meta)?.docType || "",
              formatDocLabel(d),
              d.original_name,
              d.doc_kind,
              meta.staff_type,
              meta.read_text,
            ].join(" ").toLowerCase();
            return words.every((w) => hay.includes(w));
          });
        }

        // Pages of 40 so a claim with many documents stays readable for the model.
        const pageSize = DOC_PAGE_SIZE;
        const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
        const page = Math.min(Math.max(Number.parseInt(String(args.page || "1"), 10) || 1, 1), pages);
        const pageDocs = filtered.slice((page - 1) * pageSize, page * pageSize);

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "list_documents",
          status: "success",
        });

        // Stored document text reaches the model only for an approved QA claim (see claimQaScope.ts).
        const contentAllowed = await docTextToModelAllowed(supabase, claimId);
        return {
          result: {
            claim_id: claimId,
            filter: filterType,
            query: query || undefined,
            total_count: filtered.length,
            ...(query && !filtered.length ? { not_found: "לא נמצא מסמך מתאים בתיק הזה. אל תנחש — אמור למשתמש שלא נמצא." } : {}),
            page,
            pages,
            selection_instruction: "להצגה/קריאה/שליחה העבר את file_id של המסמך (show_claim_document, read_claim_document, preview_send_claim_email). אם יש יותר מעמוד אחד — צמצם עם query או בקש page הבא.",
            documents: pageDocs.map((d, idx) => ({
              index: (page - 1) * pageSize + idx + 1,
              file_id: String(d.id),
              title: documentDisplayTitle({ original_name: String(d.original_name || ""), doc_meta: d.doc_meta as Record<string, string> }),
              name: d.original_name,
              kind: formatDocLabel(d),
              mime: d.mime_type,
              created_at: d.created_at,
              read_status: String(((d.doc_meta && typeof d.doc_meta === "object" ? d.doc_meta : {}) as Record<string, unknown>).read_status || "not_read"),
              document_read: storedDocumentRead(d.doc_meta, { contentAllowed }),
            })),
          },
        };
      }

      case "preview_update_claim_fields": {
        // Inside a claim the tool acts on the open claim only, whatever the model passes.
        return await previewUpdateClaimFields(supabase, claimId, args, userId, userName, name);
      }

      case "read_claim_document": {
        // Same lookup and card as show_claim_document, plus the saved read (full only when content is approved).
        const shown = await executeClaimsTool("show_claim_document", args, supabase, claimId, userId, userName, attachments);
        const base = shown.result as Record<string, unknown>;
        if (!base || base.found !== true) return shown;
        const loadMeta = async () => (await supabase
          .from("claims_documents")
          .select("doc_meta")
          .eq("id", String(base.file_id))
          .eq("claim_id", claimId)
          .maybeSingle()).data?.doc_meta;
        const contentAllowed = await docTextToModelAllowed(supabase, claimId);
        let meta = await loadMeta();
        let readNow: Record<string, unknown> | null = null;
        // Not read yet: for an approved QA claim, read it now on the server (same gates as the schedule).
        if (contentAllowed && !hasFinalRead(meta)) {
          readNow = await readDocumentNow(claimId, String(base.file_id));
          meta = await loadMeta();
        }
        const read = storedDocumentRead(meta, { full: true, contentAllowed });
        return {
          result: {
            ...base,
            ...(readNow ? { read_now: readNow } : {}),
            document_read: read || {
              status: "not_read",
              instruction: contentAllowed
                ? "המסמך לא נקרא (הקריאה בשרת לא הצליחה או נעצרה). אמור זאת ואל תנחש את תוכנו."
                : "המסמך עוד לא נקרא, ותוכן מסמכים של תיקים אמיתיים אינו מועבר ל-AI עד אישור. אמור זאת, הצג את הכרטיס, ואל תנחש את תוכנו.",
            },
          },
          card: shown.card,
        };
      }

      case "show_claim_document": {
        const ref = await resolveClaimDocRef(supabase, claimId, args);
        if (!ref.ok) {
          return { result: { found: false, claim_id: claimId, error: ref.error, ...(ref.candidates ? { candidates: ref.candidates } : {}) } };
        }
        const doc = ref.doc;
        const meta = (doc.doc_meta && typeof doc.doc_meta === "object" ? doc.doc_meta : {}) as Record<string, string>;
        const title = documentDisplayTitle({ original_name: String(doc.original_name || ""), doc_meta: meta });
        const readStatus = String(meta.read_status || "");
        const needsRead = readStatus !== "ready" && readStatus !== "unreadable";
        const card: ClaimsDocumentCard = {
          kind: "document",
          claim_id: claimId,
          file_id: String(doc.id),
          title,
          original_name: String(doc.original_name || ""),
          mime_type: String(doc.mime_type || ""),
          read_status: readStatus,
          needs_read: needsRead,
        };
        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "show_document",
          status: "success",
        });
        return {
          result: {
            found: true,
            claim_id: claimId,
            file_id: String(doc.id),
            title,
            read_status: readStatus || "not_read",
            shown_to_user: "המסמך הוצג למשתמש בכרטיס בצ'אט עם פתיחה והורדה.",
            ...(needsRead ? { reading: "המסמך עוד לא נקרא. הכרטיס מפעיל עכשיו את הקריאה בדפדפן של המשתמש ומציג את התוצאה." } : {}),
          },
          card,
        };
      }

      case "check_claim_and_customer_duplicates": {
        const dupResult = await checkDuplicatesHelper(supabase, {
          client_name: String(args.client_name || ""),
          client_phone: String(args.client_phone || ""),
          client_email: String(args.client_email || ""),
          business_id: String(args.business_id || ""),
          plate: String(args.plate || ""),
          claim_number: String(args.claim_number || ""),
        });

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "check_duplicates",
          status: "success",
        });

        return { result: dupResult };
      }

      case "preview_save_attachment_to_claim": {
        return await handlePreviewSaveAttachmentToClaim(supabase, claimId, args, userId, userName, attachments);
      }

      case "preview_create_claim_from_onboarding": {
        return await handlePreviewCreateClaimFromOnboarding(supabase, args, userId, userName, attachments);
      }

      case "search_pending_gmail_messages": {
        const query = String(args.query || "").trim();
        const effectiveClaim = String(claimId || args.claim_ref || args.claim_id || "").trim();

        const db = getAdminClient() || supabase;

        // 1. If inside a claim or claim_ref specified, load claim metadata for context-aware matching
        let claimPlate = "";
        let claimNum = "";
        let clientName = "";
        let insCompany = "";
        if (effectiveClaim) {
          const { data: claimRow } = await db
            .from("claims")
            .select("id, claim_number, plate_number, client_name, insurance_company, row_data")
            .eq("id", effectiveClaim)
            .maybeSingle();
          if (claimRow) {
            const crd = (claimRow.row_data && typeof claimRow.row_data === "object" ? claimRow.row_data : {}) as Record<string, unknown>;
            claimPlate = String(claimRow.plate_number || crd.plateNumber || crd.carNumber || crd.plate || "").trim();
            claimNum = String(claimRow.claim_number || crd.claimNumber || crd.claimNum || "").trim();
            clientName = String(claimRow.client_name || crd.clientName || crd.customerName || "").trim();
            insCompany = String(claimRow.insurance_company || crd.insuranceCompany || crd.insurer || "").trim();
          }
        }

        // 2. Fetch pending messages
        const { data: pendingRows } = await db
          .from("claims_gmail_pending")
          .select("id, gmail_message_id, from_addr, to_addr, subject, snippet, attachment_count, assigned_claim_id, created_at, imported_at")
          .order("created_at", { ascending: false })
          .limit(80);

        // 3. Fetch imported messages
        let impQuery = db
          .from("claims_gmail_imports")
          .select("id, gmail_message_id, from_addr, to_addr, subject, snippet, attachment_count, claim_id, imported_at, created_at")
          .order("created_at", { ascending: false })
          .limit(80);
        if (effectiveClaim) {
          impQuery = impQuery.eq("claim_id", effectiveClaim);
        }
        const { data: impRows } = await impQuery;

        type MessageMatch = {
          id: string;
          gmail_message_id: string;
          from_addr: string;
          to_addr: string;
          subject: string;
          snippet: string;
          attachment_count: number;
          assigned_claim_id: string | null;
          created_at: string;
          imported_at: string | null;
          already_imported: boolean;
          status_label: string;
        };

        const matched: MessageMatch[] = [];
        const seenMessageIds = new Set<string>();

        // Process imported rows first (if assigned to current claim or matching search)
        for (const imp of impRows || []) {
          const msgId = String(imp.gmail_message_id || imp.id || "").replace(/^GIP-/, "");
          if (!msgId || seenMessageIds.has(msgId)) continue;
          const hay = [
            imp.from_addr || "",
            imp.subject || "",
            imp.snippet || "",
            imp.claim_id || "",
            msgId,
          ].join(" ");

          let matches = false;
          if (query) {
            matches = matchesEmailSearch(hay, query);
          } else if (effectiveClaim) {
            matches = String(imp.claim_id) === effectiveClaim;
          }

          if (matches) {
            seenMessageIds.add(msgId);
            matched.push({
              id: imp.id,
              gmail_message_id: msgId,
              from_addr: imp.from_addr || "",
              to_addr: imp.to_addr || "",
              subject: imp.subject || "",
              snippet: imp.snippet || "",
              attachment_count: Number(imp.attachment_count || 0),
              assigned_claim_id: imp.claim_id || null,
              created_at: imp.imported_at || imp.created_at || new Date().toISOString(),
              imported_at: imp.imported_at || imp.created_at || new Date().toISOString(),
              already_imported: true,
              status_label: `כבר מיובא לתיק ${imp.claim_id || ""}`,
            });
          }
        }

        // Process pending rows
        for (const p of pendingRows || []) {
          const msgId = String(p.gmail_message_id || p.id || "").replace(/^GIP-/, "");
          if (!msgId || seenMessageIds.has(msgId)) continue;
          const hay = [
            p.from_addr || "",
            p.subject || "",
            p.snippet || "",
            p.assigned_claim_id || "",
            msgId,
          ].join(" ");

          let matches = false;
          if (query) {
            matches = matchesEmailSearch(hay, query);
          } else if (effectiveClaim) {
            matches = (p.assigned_claim_id === effectiveClaim) ||
              (!!claimPlate && matchesEmailSearch(hay, claimPlate)) ||
              (!!claimNum && matchesEmailSearch(hay, claimNum)) ||
              (!!clientName && matchesEmailSearch(hay, clientName));
          } else {
            matches = true;
          }

          if (matches) {
            seenMessageIds.add(msgId);
            const isImported = !!p.imported_at;
            matched.push({
              id: p.id,
              gmail_message_id: msgId,
              from_addr: p.from_addr || "",
              to_addr: p.to_addr || "",
              subject: p.subject || "",
              snippet: p.snippet || "",
              attachment_count: Number(p.attachment_count || 0),
              assigned_claim_id: p.assigned_claim_id || null,
              created_at: p.created_at || new Date().toISOString(),
              imported_at: p.imported_at || null,
              already_imported: isImported,
              status_label: isImported ? "כבר יובא" : (p.assigned_claim_id ? `משויך לתיק ${p.assigned_claim_id} (טרם יובא)` : "ממתין לשיוך וייבוא"),
            });
          }
        }

        // 4. Fallback to fast live Gmail search if no local match
        if (matched.length === 0 && (query || claimPlate || claimNum)) {
          try {
            const searchQuery = query || [claimPlate, claimNum].filter(Boolean).join(" ");
            const listRes = await supabase.functions.invoke("claims-gmail", {
              body: { action: "list_messages", q: searchQuery, claim_id: effectiveClaim || undefined },
            });
            const liveMsgs = (listRes.data?.messages || []) as Array<Record<string, unknown>>;
            for (const lm of liveMsgs) {
              const msgId = String(lm.id || "");
              if (!msgId || seenMessageIds.has(msgId)) continue;
              seenMessageIds.add(msgId);
              matched.push({
                id: msgId,
                gmail_message_id: msgId,
                from_addr: String(lm.from || ""),
                to_addr: String(lm.to || ""),
                subject: String(lm.subject || ""),
                snippet: String(lm.snippet || ""),
                attachment_count: 0,
                assigned_claim_id: effectiveClaim || null,
                created_at: String(lm.date || new Date().toISOString()),
                imported_at: null,
                already_imported: false,
                status_label: "קיים ב-Gmail (טרם יובא לתיק)",
              });
            }
          } catch (_) {
            // gracefully continue
          }
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId: effectiveClaim || null,
          toolName: name,
          actionType: "search_pending_emails",
          status: "success",
        });

        return {
          result: {
            found_count: matched.length,
            instruction: "נמצאו מיילים רלוונטיים. אם המייל טרם יובא, קרא לכלי preview_import_claim_email עם message_id (וגם claim_ref אם אינך בתוך תיק פתוח). אם המייל כבר מיובא לתיק, ציין זאת למשתמש.",
            emails: matched.slice(0, 15).map((m) => ({
              message_id: m.gmail_message_id,
              from: m.from_addr,
              subject: m.subject,
              snippet: m.snippet,
              sent_at: m.created_at,
              attachment_count: m.attachment_count || 0,
              assigned_claim_id: m.assigned_claim_id || null,
              already_imported: m.already_imported,
              status_label: m.status_label,
            })),
          },
        };
      }

      case "preview_import_claim_email": {
        const messageId = String(args.message_id || "").replace(/^GIP-/, "").trim();
        const targetClaim = String(claimId || args.claim_ref || args.claim_id || "").trim();

        if (!messageId) {
          return { result: { error: "נדרש מזהה הודעה (message_id) לייבוא." } };
        }
        if (!targetClaim) {
          return {
            result: {
              error: "נדרש מזהה תיק (claim_ref) לשיוך המייל. אם מדובר בלקוח/תביעה חדשה, הכן כרטיס פתיחת תיק באמצעות preview_create_claim_from_onboarding.",
            },
          };
        }

        let fromAddr = "";
        let subject = "";
        let attCount = 0;
        const db = getAdminClient() || supabase;
        const { data: pRow } = await db
          .from("claims_gmail_pending")
          .select("from_addr, subject, attachment_count")
          .or(`gmail_message_id.eq.${messageId},id.eq.GIP-${messageId},id.eq.${messageId}`)
          .maybeSingle();

        if (pRow) {
          fromAddr = pRow.from_addr || "";
          subject = pRow.subject || "";
          attCount = pRow.attachment_count || 0;
        }

        if (!fromAddr) {
          const { data: impRow } = await db
            .from("claims_gmail_imports")
            .select("from_addr, subject, attachment_count")
            .or(`gmail_message_id.eq.${messageId},id.eq.${messageId}`)
            .maybeSingle();
          if (impRow) {
            fromAddr = impRow.from_addr || "";
            subject = impRow.subject || "";
            attCount = impRow.attachment_count || 0;
          }
        }

        if (!fromAddr) {
          try {
            const liveRes = await supabase.functions.invoke("claims-gmail", {
              body: { action: "read_message", message_id: messageId, claim_id: targetClaim },
            });
            if (liveRes.data?.success) {
              const msg = (liveRes.data.message || liveRes.data) as Record<string, unknown>;
              fromAddr = String(msg.from || "");
              subject = String(msg.subject || "");
              const atts = Array.isArray(msg.attachments) ? msg.attachments : [];
              attCount = Number(msg.attachment_count || atts.length || 0);
            }
          } catch (_) {
            // continue
          }
        }

        const { data: curDocs } = await supabase
          .from("claims_documents")
          .select("id, original_name, byte_size")
          .eq("claim_id", targetClaim);
        const existingDocsCount = curDocs?.length || 0;

        const summary = `ייבוא מייל "${subject || messageId}"${fromAddr ? ` מאת ${fromAddr}` : ""}${attCount ? ` וכל ${attCount} הקבצים המצורפים אליו` : " והקבצים המצורפים"} ישירות לתיק ${targetClaim}`;

        const previewAction: ClaimsPendingAction = {
          preview_id: `IMP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          summary,
          tool_name: "preview_import_claim_email",
          action_type: "import_claim_email",
          parameters: {
            claim_id: targetClaim,
            claim_ref: targetClaim,
            message_id: messageId,
            subject: subject || "מייל נכנס מ-Gmail",
            from_addr: fromAddr || "לא ידוע",
            attachment_count: attCount,
            existing_docs_count: existingDocsCount,
          },
        };

        return {
          result: {
            prepared: true,
            claim_id: targetClaim,
            message_id: messageId,
            subject: subject || "מייל נכנס מ-Gmail",
            from: fromAddr || "לא ידוע",
            attachment_count: attCount,
            existing_documents_in_claim: existingDocsCount,
            instruction: "כרטיס הייבוא הוכן בהצלחה. הסבר למשתמש בעברית איזה מייל יובא, לאיזה תיק, וכמה קבצים יורדו וישמרו בתיק, ובקש את אישורו לביצוע הפעולה.",
          },
          preview: previewAction,
        };
      }

      case "get_missing_claim_documents": {
        const { data: docs } = await supabase
          .from("claims_documents")
          .select("id, original_name, mime_type, doc_kind")
          .eq("claim_id", claimId);

        const allDocs = docs || [];
        const hasLicense = allDocs.some((d) =>
          d.doc_kind === "car_license" || /רישיון.*רכב|רשיון.*רכב|license/i.test(d.original_name || "")
        );
        const hasPhotos = allDocs.some((d) =>
          String(d.mime_type || "").startsWith("image/") ||
          d.doc_kind === "damage_photo" ||
          d.doc_kind === "surveyor_photo"
        );
        const hasSurveyorReport = allDocs.some((d) =>
          d.doc_kind === "surveyor_report" || /שמאי|שמאות|אומדן/i.test(d.original_name || "")
        );
        const hasInvoice = allDocs.some((d) =>
          d.doc_kind === "garage_invoice" || /חשבונית|קבלה/i.test(d.original_name || "")
        );
        const hasDeclaration = allDocs.some((d) =>
          d.doc_kind === "claim_declaration" || /הודעה|הצהרה|טופס.*תאונה/i.test(d.original_name || "")
        );

        const requirements = [
          { item: "רישיון רכב בתוקף", present: hasLicense, required: true },
          { item: "תמונות נזק ומוקד", present: hasPhotos, required: true },
          { item: "דוח / הערכת שמאי", present: hasSurveyorReport, required: true },
          { item: "חשבונית תיקון מוסך", present: hasInvoice, required: true },
          { item: "טופס הודעה על תאונה / הצהרת מבוטח", present: hasDeclaration, required: true },
        ];

        const missing = requirements.filter((r) => !r.present).map((r) => r.item);
        const present = requirements.filter((r) => r.present).map((r) => r.item);

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "get_missing_documents",
          status: "success",
        });

        return {
          result: {
            claim_id: claimId,
            is_complete: missing.length === 0,
            present_documents: present,
            missing_documents: missing,
            total_documents_in_claim: allDocs.length,
            recommendation: missing.length === 0
              ? "כל מסמכי החובה קיימים בתיק! התיק מוכן להמשך טיפול/סגירה מול חברת הביטוח."
              : `יש להשלים בתיק: ${missing.join(", ")}.`,
          },
        };
      }

      case "get_claim_handler_and_history": {
        const limit = Math.min(Number(args.limit || 10), 30);
        const { data: claimRow } = await supabase
          .from("claims_records")
          .select("id, assigned_to_name, created_by_name, created_at, status")
          .eq("id", claimId)
          .maybeSingle();

        const { data: hist } = await supabase
          .from("claims_history")
          .select("id, row_data, created_at")
          .eq("claim_id", claimId)
          .order("created_at", { ascending: false })
          .limit(limit);

        const historyItems = (hist || []).map((h) => {
          const rd = (h.row_data && typeof h.row_data === "object" ? h.row_data : {}) as Record<string, unknown>;
          return {
            id: h.id,
            action: rd.action || "פעולה",
            by: rd.by || "מערכת",
            note: rd.note || "",
            type: rd.type || "general",
            at: rd.at || h.created_at,
            files: rd.files || [],
            files_count: Array.isArray(rd.files) ? rd.files.length : 0,
            requested_count: rd.requested_count,
            verified_count: rd.verified_count,
            is_full_match: rd.is_full_match,
            verified_files: rd.verified_files,
            missing_files: rd.missing_files,
            gmail_message_id: rd.gmail_message_id,
          };
        });

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "get_handler_and_history",
          status: "success",
        });

        return {
          result: {
            claim_id: claimId,
            assigned_handler: claimRow?.assigned_to_name || "טרם שויך עובד מטפל",
            opened_by: claimRow?.created_by_name || "מערכת",
            opened_at: claimRow?.created_at,
            current_status: claimRow?.status,
            recent_activity: historyItems,
          },
        };
      }

      case "get_claim_next_action": {
        const { data: claimRow } = await supabase
          .from("claims_records")
          .select("id, row_data, status")
          .eq("id", claimId)
          .maybeSingle();

        const rd = (claimRow?.row_data && typeof claimRow.row_data === "object" ? claimRow.row_data : {}) as Record<string, unknown>;

        const { data: tasks } = await supabase
          .from("claims_tasks")
          .select("id, row_data, created_at")
          .eq("claim_id", claimId);

        const openTasks = (tasks || []).filter((t) => {
          const trd = (t.row_data && typeof t.row_data === "object" ? t.row_data : {}) as Record<string, unknown>;
          return String(trd.done || "").toLowerCase() !== "true" && String(trd.workStatus || "").toLowerCase() !== "done";
        }).map((t) => {
          const trd = t.row_data as Record<string, unknown>;
          return {
            id: t.id,
            action: trd.action || "משימה",
            note: trd.note || "",
            created_at: t.created_at,
          };
        });

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "get_next_action",
          status: "success",
        });

        return {
          result: {
            claim_id: claimId,
            next_action_title: rd.nextAction || "לא הוגדרה פעולה הבאה ידנית",
            next_date: rd.nextDate || null,
            open_tasks_count: openTasks.length,
            open_tasks: openTasks,
            status: claimRow?.status,
          },
        };
      }

      case "list_claim_share_links": {
        const { data: shares } = await supabase
          .from("claims_share_links")
          .select("id, recipient_name, recipient_kind, recipient_email, recipient_phone, expires_at, revoked_at, created_at, created_by_name")
          .eq("claim_id", claimId)
          .order("created_at", { ascending: false });

        const now = new Date();
        const formatted = (shares || []).map((s) => ({
          id: s.id,
          recipient: s.recipient_name,
          kind: s.recipient_kind,
          email: s.recipient_email,
          phone: s.recipient_phone,
          is_active: !s.revoked_at && new Date(s.expires_at) > now,
          expires_at: s.expires_at,
          created_at: s.created_at,
          created_by: s.created_by_name,
        }));

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "list_share_links",
          status: "success",
        });

        return {
          result: {
            claim_id: claimId,
            total_links: formatted.length,
            active_links: formatted.filter((x) => x.is_active),
            all_links: formatted,
          },
        };
      }

      // PREVIEW TOOLS (Write operations)
      case "preview_send_claim_email": {
        const { data: claimRec } = claimId
          ? await supabase
            .from("claims_records")
            .select("id, plate, client_name, row_data")
            .eq("id", claimId)
            .maybeSingle()
          : { data: null };

        const claimRow = (claimRec?.row_data && typeof claimRec.row_data === "object" ? claimRec.row_data : {}) as Record<string, unknown>;
        const claimNum = claimId ? String(claimRow.claimNum || claimId) : "";
        const plate = String(claimRec?.plate || claimRow.plate || "");

        // Helper to parse comma/semicolon separated email lists into clean lowercase array
        const parseAddressList = (raw: unknown): string[] => {
          if (!raw) return [];
          const items = Array.isArray(raw) ? raw : String(raw).split(/[,;\n]+/);
          const out: string[] = [];
          for (const item of items) {
            const trimmed = String(item || "").trim().toLowerCase();
            if (!trimmed) continue;
            if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
              out.push(trimmed);
            }
          }
          return out;
        };

        const sendToSelf = args.send_to_self === true || String(args.send_to_self || "") === "true";
        let recipientNote = "";
        const rawToAddrs = parseAddressList(args.to);
        const rawCcAddrs = parseAddressList(args.cc);
        const rawBccAddrs = parseAddressList(args.bcc);

        if (sendToSelf) {
          const { data: me } = await supabase.auth.getUser();
          const myEmail = String(me?.user?.email || "").trim().toLowerCase();
          if (!myEmail) {
            return { result: { error: "לא נמצאה כתובת מייל למשתמש המחובר. ציין כתובת נמען." } };
          }
          rawToAddrs.push(myEmail);
          recipientNote = "הכתובת של המשתמש המחובר";
        }

        // Auto-resolve claim contacts if recipient_roles provided
        const requestedRoles = Array.isArray(args.recipient_roles) ? args.recipient_roles.map((r) => String(r).toLowerCase().trim()) : [];
        if (claimId && requestedRoles.length > 0) {
          for (const role of requestedRoles) {
            if (/insur|ביטוח/.test(role)) {
              const ins = String(claimRow.insEmail || claimRow.insRepEmail || "").trim();
              if (ins) rawToAddrs.push(...parseAddressList(ins));
            }
            if (/surv|apprais|שמאי/.test(role)) {
              const s = String(claimRow.survEmail || "").trim();
              if (s) rawToAddrs.push(...parseAddressList(s));
            }
            if (/client|custom|לקוח/.test(role)) {
              const c = String(claimRow.clientEmail || "").trim();
              if (c) rawToAddrs.push(...parseAddressList(c));
            }
            if (/lawyer|legal|עו"ד|עורך דין/.test(role)) {
              const l = String(claimRow.legalEmail || "").trim();
              if (l) rawToAddrs.push(...parseAddressList(l));
            }
            if (/third|צד ג/.test(role)) {
              const t = String(claimRow.thirdEmail || "").trim();
              if (t) rawToAddrs.push(...parseAddressList(t));
            }
          }
        }

        // Fallback to claim contacts if To is empty
        if (rawToAddrs.length === 0 && claimId) {
          const autoEmail = String(claimRow.insEmail || claimRow.clientEmail || claimRow.survEmail || "").trim();
          if (autoEmail) {
            rawToAddrs.push(...parseAddressList(autoEmail));
            recipientNote = claimRow.insEmail ? "נבחר אוטומטית: מייל חברת הביטוח מהתיק" : claimRow.clientEmail ? "נבחר אוטומטית: מייל הלקוח מהתיק" : "נבחר אוטומטית: מייל השמאי מהתיק";
          }
        }

        // Deduplication across To, CC, and BCC
        const toSet = new Set(rawToAddrs);
        const ccSet = new Set(rawCcAddrs.filter((e) => !toSet.has(e)));
        const bccSet = new Set(rawBccAddrs.filter((e) => !toSet.has(e) && !ccSet.has(e)));

        if (toSet.size === 0) {
          return {
            result: {
              error: "נדרשת כתובת מייל של הנמען. אנא ציין למי לשלוח את המייל (למשל כתובת מייל, או תפקיד כמו חברת ביטוח / שמאי / לקוח).",
            },
          };
        }

        const to = Array.from(toSet).join(", ");
        const cc = Array.from(ccSet).join(", ");
        const bcc = Array.from(bccSet).join(", ");
        const totalRecipients = toSet.size + ccSet.size + bccSet.size;

        let subject = String(args.subject || "").trim();
        let body = String(args.body || "").trim();
        let fileIds = Array.isArray(args.file_ids) ? (args.file_ids as string[]) : [];

        if (!subject) {
          subject = claimId
            ? `תיק תביעה ${claimNum} - רכב ${plate} - מסמכים ותמונות מ${CLAIMS_SENDER_NAME}`
            : `הודעה מ${CLAIMS_SENDER_NAME}`;
        }

        const attachedFileIds = (attachments || []).map((a) => a.file_id).filter(Boolean) as string[];
        if (attachedFileIds.length > 0) {
          if (fileIds.length === 0) {
            fileIds = [...attachedFileIds];
          } else {
            for (const fid of attachedFileIds) {
              if (!fileIds.includes(fid)) fileIds.push(fid);
            }
          }
        }

        if (fileIds.length === 0 && claimId) {
          const { data: defaultDocs } = await supabase
            .from("claims_documents")
            .select("id, original_name")
            .eq("claim_id", claimId)
            .limit(15);
          if (defaultDocs && defaultDocs.length > 0) {
            fileIds = defaultDocs.map((d) => d.id);
          }
        }

        // Attach only files that belong to this claim, and show their names before approval.
        let attachmentTitles: string[] = [];
        let droppedFileIds: string[] = [];
        let totalAttachmentBytes = 0;
        let knownDocsMap = new Map<string, any>();
        if (fileIds.length > 0) {
          const docQuery = claimId
            ? supabase.from("claims_documents").select("id, original_name, doc_meta, byte_size").eq("claim_id", claimId).in("id", fileIds)
            : supabase.from("claims_documents").select("id, original_name, doc_meta, byte_size").in("id", fileIds);
          const { data: inClaim } = await docQuery;
          knownDocsMap = new Map((inClaim || []).map((d) => [d.id, d]));
          droppedFileIds = fileIds.filter((id) => !knownDocsMap.has(id));
          fileIds = fileIds.filter((id) => knownDocsMap.has(id));
          attachmentTitles = fileIds.map((id) => {
            const d = knownDocsMap.get(id)!;
            return documentDisplayTitle({ original_name: String(d.original_name || ""), doc_meta: d.doc_meta as Record<string, string> });
          });
          totalAttachmentBytes = fileIds.reduce((sum, id) => {
            const d = knownDocsMap.get(id);
            return sum + (Number(d?.byte_size) || 0);
          }, 0);
        }

        const PACKAGE_LIMIT = 18 * 1024 * 1024; // 18MB raw bytes limit (~24MB MIME encoded inside Gmail 25MB threshold)
        const isOverLimit = totalAttachmentBytes > PACKAGE_LIMIT;

        if (isOverLimit) {
          // Auto-split into numbered emails using split groups
          const filesForSplit = fileIds.map((id) => {
            const d = knownDocsMap.get(id)!;
            return { id, name: String(d.original_name || ""), bytes: Number(d.byte_size || 0) };
          });
          const splitGroups: Array<{ bytes: number; files: Array<{ id: string; name: string; bytes: number }> }> = [];
          let curGroup: Array<{ id: string; name: string; bytes: number }> = [];
          let curBytes = 0;
          for (const f of filesForSplit) {
            if (curGroup.length && curBytes + f.bytes > PACKAGE_LIMIT) {
              splitGroups.push({ files: curGroup, bytes: curBytes });
              curGroup = [];
              curBytes = 0;
            }
            curGroup.push(f);
            curBytes += f.bytes;
          }
          if (curGroup.length) splitGroups.push({ files: curGroup, bytes: curBytes });

          const subActions: ClaimsPendingAction[] = splitGroups.map((g, idx) => ({
            preview_id: `P-SEND-${Date.now()}-${idx + 1}`,
            summary: `שליחת אימייל חלק ${idx + 1}/${splitGroups.length} (${g.files.length} קבצים, ${(g.bytes / (1024 * 1024)).toFixed(1)}MB)`,
            tool_name: name,
            action_type: "send_email",
            parameters: {
              claim_id: claimId || null,
              to,
              cc: cc || null,
              bcc: bcc || null,
              subject: `${subject} (חלק ${idx + 1}/${splitGroups.length})`,
              body: `${body}\n\n[הערת מערכת: אימייל ${idx + 1} מתוך ${splitGroups.length} עקב מגבלת נפח של 25MB לחבילה ב-Gmail]`,
              file_ids: g.files.map((f) => f.id),
              attachment_titles: g.files.map((f) => f.name),
              ...(threadId ? { thread_id: threadId } : {}),
            },
          }));

          const batchSummary = `פיצול אוטומטי ל-${splitGroups.length} אימיילים ממוספרים (סך הכול ${fileIds.length} קבצים, ${(totalAttachmentBytes / (1024 * 1024)).toFixed(1)}MB מעל מגבלת Gmail של 25MB) אל ${to}`;
          const batchPreview: ClaimsPendingAction = {
            preview_id: `P-BATCH-${Date.now()}`,
            summary: batchSummary,
            tool_name: "batch_send_email",
            action_type: "batch_send_email",
            parameters: {
              claim_id: claimId || null,
              count: splitGroups.length,
              total_bytes: totalAttachmentBytes,
              actions: subActions,
            },
          };

          await recordAiAudit(supabase, {
            userId,
            userName,
            claimId,
            toolName: "batch_send_email",
            actionType: "batch_send_email",
            previewSummary: batchSummary,
            previewPayload: batchPreview.parameters,
            status: "preview_created",
          });

          return {
            result: {
              preview_id: batchPreview.preview_id,
              status: "pending_approval",
              over_limit: true,
              total_bytes: totalAttachmentBytes,
              split_count: splitGroups.length,
              message: `משקל כל ${fileIds.length} הקבצים שנבחרו הוא ${(totalAttachmentBytes / (1024 * 1024)).toFixed(1)}MB, החורג ממגבלת Gmail (25MB). הוכן פיצול אוטומטי ל-${splitGroups.length} אימיילים ממוספרים (חלק 1/${splitGroups.length}, 2/${splitGroups.length}...) לשליחה מסודרת באישור אחד מראש. לחלופין, ניתן לבקש שליחת קישור מאובטח ומוגן סיסמה להורדת כל הקבצים.`,
              details: {
                to,
                subject,
                total_files: fileIds.length,
                total_bytes: totalAttachmentBytes,
                parts: splitGroups.map((g, i) => ({ part: i + 1, file_count: g.files.length, size_mb: (g.bytes / (1024 * 1024)).toFixed(1) })),
              },
            },
          };
        }

        if (!body) {
          body = claimId
            ? `שלום רב,\nמצורפים בזאת מסמכים ותמונות עבור תיק תביעה ${claimNum} (רכב ${plate}).\nבברכה,\n${CLAIMS_SENDER_NAME}`
            : `שלום רב,\n\nבברכה,\n${CLAIMS_SENDER_NAME}`;
        }

        const isScheduled = !!(args.send_at || args.relative_days != null || args.send_time);
        let scheduledInfo: { plannedAt: string; label: string; date: string; time: string } | null = null;
        if (isScheduled) {
          const schedRes = resolveScheduledWhen(args);
          if (!schedRes.ok) {
            return {
              result: {
                error: schedRes.message,
                missing_parameter: "send_time",
                status: "needs_time",
              },
            };
          }
          scheduledInfo = schedRes;
        }

        const previewId = isScheduled ? `P-SCHED-${Date.now()}` : `P-SEND-${Date.now()}`;
        const attachList = attachmentTitles.length ? `: ${attachmentTitles.slice(0, 5).join(", ")}${attachmentTitles.length > 5 ? ` ועוד ${attachmentTitles.length - 5}` : ""}` : "";
        const sizeInfo = totalAttachmentBytes > 0 ? ` (${(totalAttachmentBytes / (1024 * 1024)).toFixed(1)}MB)` : "";
        const threadId = String(args.thread_id || "").trim();

        let recSummary = `אל: ${to}`;
        if (cc) recSummary += ` · CC: ${cc}`;
        if (bcc) recSummary += ` · BCC: ${bcc}`;
        const summary = isScheduled
          ? `${threadId ? "השבה בשרשור — " : ""}תזמון שליחת אימייל ל-${scheduledInfo!.label} (${totalRecipients} נמענים) ${recSummary} — נושא: "${subject}", ${fileIds.length} קבצים מצורפים${attachList}${sizeInfo}`
          : `${threadId ? "השבה בשרשור — " : ""}שליחת מייל (${totalRecipients} נמענים) ${recSummary} — נושא: "${subject}", ${fileIds.length} קבצים מצורפים${attachList}${sizeInfo}`;

        const preview: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: isScheduled ? "schedule_email" : "send_email",
          parameters: {
            claim_id: claimId || null,
            to,
            cc: cc || null,
            bcc: bcc || null,
            subject,
            body,
            file_ids: fileIds,
            attachment_titles: attachmentTitles,
            total_bytes: totalAttachmentBytes,
            ...(threadId ? { thread_id: threadId } : {}),
            ...(isScheduled ? {
              send_at: scheduledInfo!.plannedAt,
              send_at_label: scheduledInfo!.label,
              relative_days: args.relative_days ?? undefined,
              send_time: args.send_time ?? undefined,
            } : {}),
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: isScheduled ? "schedule_email" : "send_email",
          previewSummary: summary,
          previewPayload: preview.parameters,
          status: "preview_created",
        });

        return {
          result: {
            preview_id: previewId,
            status: "pending_approval",
            message: isScheduled
              ? `הוכנה תצוגה מקדימה לתזמון המייל ל-${scheduledInfo!.label}. באישור אחד מראש המייל יישמר כמתוזמן ויישלח אוטומטית במועד שנקבע ללא צורך באישור נוסף.`
              : "הוכנה תצוגה מקדימה לשליחת המייל. נדרש אישור המשתמש לביצוע.",
            details: {
              to,
              to_list: Array.from(toSet),
              cc: cc || "ללא",
              cc_list: Array.from(ccSet),
              bcc: bcc || "ללא",
              bcc_list: Array.from(bccSet),
              total_recipients: totalRecipients,
              subject,
              body_excerpt: body.slice(0, 300),
              attachments_count: fileIds.length,
              attachments: attachmentTitles,
              ...(isScheduled ? {
                scheduled_for: scheduledInfo!.label,
                planned_at: scheduledInfo!.plannedAt,
                single_approval_in_advance: true,
              } : {}),
              ...(recipientNote ? { recipient_note: recipientNote } : {}),
              ...(droppedFileIds.length ? { not_attached: `${droppedFileIds.length} מזהים לא שייכים לתיק הזה ולא צורפו` } : {}),
            },
          },
          preview,
        };
      }

      case "preview_cancel_scheduled_claim_email": {
        const remId = String(args.reminder_id || "").trim();
        if (!remId) {
          return { result: { error: "חובה לציין reminder_id מתוך list_scheduled_claim_emails לביטול." } };
        }

        const { data: rem, error: fetchErr } = await supabase
          .from("claims_reminders")
          .select("id, claim_id, mail_to, mail_subject, next_run_at, status, row_data")
          .eq("id", remId)
          .maybeSingle();

        if (fetchErr || !rem) {
          return { result: { error: "האימייל המתוזמן לא נמצא במערכת." } };
        }
        if (rem.status !== "scheduled") {
          return { result: { error: `לא ניתן לבטל אימייל זה (סטטוס נוכחי: ${rem.status}).` } };
        }

        const targetClaim = rem.claim_id || claimId || null;
        const rd = (rem.row_data && typeof rem.row_data === "object" ? rem.row_data : {}) as Record<string, unknown>;
        const scheduledLabel = String(rd.scheduled_at_label || rem.next_run_at || "");
        const reason = String(args.reason || "ביטול לבקשת המשתמש").trim();

        const previewId = `P-CANC-${Date.now()}`;
        const summary = `ביטול אימייל מתוזמן (מזהה ${rem.id}) שתוכנן ל-${scheduledLabel} אל ${rem.mail_to} בנושא "${rem.mail_subject}"`;

        const preview: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "cancel_scheduled_email",
          parameters: {
            claim_id: targetClaim,
            reminder_id: rem.id,
            recipient: rem.mail_to,
            subject: rem.mail_subject,
            send_at_label: scheduledLabel,
            reason,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId: targetClaim,
          toolName: name,
          actionType: "cancel_scheduled_email",
          previewSummary: summary,
          previewPayload: preview.parameters,
          status: "preview_created",
        });

        return {
          result: {
            preview_id: previewId,
            status: "pending_approval",
            message: `הוכנה בקשת ביטול לאימייל המתוזמן ל-${scheduledLabel} אל ${rem.mail_to}. נדרש אישור לביטול.`,
            details: {
              reminder_id: rem.id,
              claim_id: targetClaim,
              to: rem.mail_to,
              subject: rem.mail_subject,
              scheduled_for: scheduledLabel,
              reason,
            },
          },
          preview,
        };
      }

      case "preview_send_customer_link": {
        let targetClaimId = String(claimId || args.claim_id || args.claim_ref || "").trim();
        if (!targetClaimId) {
          targetClaimId = await allocateNextDalClaimId(supabase);
        }

        const { data: claimRec } = await supabase
          .from("claims_records")
          .select("id, plate, client_name, row_data, status")
          .eq("id", targetClaimId)
          .maybeSingle();

        const claimRow = (claimRec?.row_data && typeof claimRec.row_data === "object" ? claimRec.row_data : {}) as Record<string, unknown>;
        const clientName = String(args.recipient_name || claimRec?.client_name || claimRow.clientName || "").trim();
        const clientPhone = String(args.recipient_phone || claimRow.clientPhone || claimRow.phone || "").trim();
        const clientEmail = String(args.recipient_email || claimRow.clientEmail || claimRow.email || "").trim();
        const channel = String(args.channel || (clientPhone && clientEmail ? "both" : clientPhone ? "whatsapp" : clientEmail ? "email" : "copy")).toLowerCase();
        const customMessage = String(args.custom_message || "").trim();
        const linkType = String(args.link_type || "intake").toLowerCase();
        const cleanPhone = String(clientPhone || "").replace(/\D/g, "");

        // Ensure stub record in claims_records with status 'ממתין למילוי הלקוח'
        if (!claimRec) {
          const nowIso = new Date().toISOString();
          await supabase.from("claims_records").insert({
            id: targetClaimId,
            status: "ממתין למילוי הלקוח",
            client_name: clientName || null,
            created_at: nowIso,
            last_activity_at: nowIso,
            row_data: {
              id: targetClaimId,
              status: "ממתין למילוי הלקוח",
              clientName: clientName || "",
              clientPhone: clientPhone || "",
              clientEmail: clientEmail || "",
              createdAt: nowIso,
              source: "dalia_ai_customer_link",
            },
          });
        }

        const previewId = `P-CUSTLINK-${Date.now()}`;
        let intakeUrl = "";
        let uploadUrl = "";
        let waLink = "";
        let actionType = "send_customer_intake_link";
        let summary = "";
        let message = "";

        if (linkType === "upload") {
          actionType = "send_customer_upload_link";
          summary = `שליחת קישור להעלאת מסמכים ללקוח "${clientName || "הלקוח"}" (תיק ${targetClaimId})`;
          try {
            const docsRes = await supabase.functions.invoke("claims-docs", {
              body: {
                action: "create_link",
                claim_id: targetClaimId,
              },
            });
            if (docsRes.data?.token) {
              uploadUrl = `https://orin1607-ctrl.github.io/future-craft-core/claims-upload?t=${encodeURIComponent(docsRes.data.token)}`;
              const waText = customMessage || `שלום ${clientName || 'לקוח יקר'},\nלהעלאת מסמכים ותמונות עבור תיק תביעה ${targetClaimId} באורן קאר, היכנס/י לקישור המאובטח:\n${uploadUrl}`;
              waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}` : `https://wa.me/?text=${encodeURIComponent(waText)}`;
            }
          } catch (e) {
            console.error("claims-docs create_link error:", e);
          }
          message = `הוכנה תצוגה מקדימה לשליחת קישור העלאת מסמכים עבור ${clientName || "הלקוח"}. הקישור מוכן לבדיקה, העתקה או שליחה בתיק ${targetClaimId}.`;
        } else {
          actionType = "send_customer_intake_link";
          summary = `שליחת קישור פתיחת תיק חדש ללקוח "${clientName || "הלקוח"}" (תיק ${targetClaimId})`;
          try {
            const intakeRes = await supabase.functions.invoke("claims-intake", {
              body: {
                action: "create_link",
                claim_id: targetClaimId,
              },
            });
            if (intakeRes.data?.token) {
              intakeUrl = `https://orin1607-ctrl.github.io/future-craft-core/claims-intake?t=${encodeURIComponent(intakeRes.data.token)}`;
              const waText = customMessage || `שלום ${clientName || 'לקוח יקר'},\nנפתח עבורך תיק תביעה ${targetClaimId} באורן קאר. למילוי טופס פתיחת התיק היכנס/י לקישור המאובטח:\n${intakeUrl}`;
              waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}` : `https://wa.me/?text=${encodeURIComponent(waText)}`;
            }
          } catch (e) {
            console.error("claims-intake create_link error:", e);
          }
          message = `הוכנה תצוגה מקדימה לשליחת קישור פתיחת תיק חדש עבור ${clientName || "הלקוח"}. הוקצה מספר תיק קבוע ${targetClaimId} בסטטוס "ממתין למילוי הלקוח". הקישור מוכן לבדיקה בלחיצה, להעתקה או לשליחה.`;
        }

        const preview: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: actionType,
          parameters: {
            claim_id: targetClaimId,
            recipient_name: clientName,
            recipient_phone: clientPhone || null,
            recipient_email: clientEmail || null,
            channel,
            link_type: linkType,
            intake_url: intakeUrl || null,
            upload_url: uploadUrl || null,
            wa_link: waLink || null,
            custom_message: customMessage || null,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId: targetClaimId,
          toolName: name,
          actionType,
          previewSummary: summary,
          previewPayload: preview.parameters,
          status: "preview_created",
        });

        return {
          result: {
            preview_id: previewId,
            status: "pending_approval",
            message,
            details: {
              claim_id: targetClaimId,
              claim_status: "ממתין למילוי הלקוח",
              recipient_name: clientName,
              recipient_phone: clientPhone,
              recipient_email: clientEmail,
              channel,
              link_type: linkType,
              intake_url: intakeUrl || null,
              upload_url: uploadUrl || null,
              wa_link: waLink || null,
            },
          },
          preview,
        };
      }

      case "preview_create_claim_share_link": {
        let targetClaimId = String(claimId || args.claim_id || args.claim_ref || "").trim();
        const { data: claimRec } = targetClaimId
          ? await supabase
            .from("claims_records")
            .select("id, plate, client_name, row_data")
            .eq("id", targetClaimId)
            .maybeSingle()
          : { data: null };

        const claimRow = (claimRec?.row_data && typeof claimRec.row_data === "object" ? claimRec.row_data : {}) as Record<string, unknown>;
        let recipientName = String(args.recipient_name || "").trim();
        let recipientKind = normalizeShareRecipientKind(String(args.recipient_kind || ""));
        let recipientEmail = String(args.recipient_email || "").trim();
        let recipientPhone = String(args.recipient_phone || "").trim();
        const channel = String(args.channel || (recipientEmail && recipientPhone ? "both" : recipientEmail ? "email" : recipientPhone ? "whatsapp" : "copy")).toLowerCase();
        const ttlHours = Number(args.ttl_hours || 72);
        const docQuery = String(args.document_query || "").trim().toLowerCase();
        const customMessage = String(args.custom_message || "").trim();
        const requestedItems = Array.isArray(args.requested_items)
          ? (args.requested_items as string[]).map(String).filter(Boolean)
          : [];

        // If recipient not fully specified or is client, fill from claim
        if (!recipientName || recipientKind === "client" || /לקוח/.test(recipientName)) {
          if (!recipientName) recipientName = String(claimRec?.client_name || claimRow.clientName || "לקוח");
          recipientKind = "client";
          if (!recipientPhone) recipientPhone = String(claimRow.clientPhone || claimRow.phone || "");
          if (!recipientEmail) recipientEmail = String(claimRow.clientEmail || claimRow.email || "");
        } else if (recipientKind === "surveyor" || /שמאי/.test(recipientName)) {
          if (!recipientPhone) recipientPhone = String(claimRow.survPhone || "");
          if (!recipientEmail) recipientEmail = String(claimRow.survEmail || "");
        }

        let fileIds = Array.isArray(args.file_ids) ? (args.file_ids as string[]).map(String).filter(Boolean) : [];
        let fileTitles: string[] = [];
        const missingDocuments: string[] = [];

        const { data: allDocs } = await supabase
          .from("claims_documents")
          .select("id, original_name, doc_kind, doc_meta, created_at, byte_size, mime_type")
          .eq("claim_id", targetClaimId)
          .order("created_at", { ascending: false });

        const docsList = allDocs || [];

        if (fileIds.length > 0) {
          const map = new Map(docsList.map((d) => [String(d.id), d]));
          for (const id of fileIds) {
            const d = map.get(id);
            if (d) {
              fileTitles.push(documentDisplayTitle({ original_name: String(d.original_name || ""), doc_meta: (d.doc_meta || {}) as Record<string, string> }));
            } else {
              missingDocuments.push(`קובץ מזהה ${id}`);
            }
          }
        } else {
          const matchedSet = new Set<string>();

          // 1. Check for surveyor report (דוח שמאי / דוח שמאות / שמאות)
          const wantsSurveyor = /שמא[יו]|survey|apprais/i.test(docQuery) || requestedItems.some((it) => /שמא[יו]|survey|apprais/i.test(it));
          if (wantsSurveyor) {
            const surveyorDocs = docsList.filter((d) => {
              const meta = (d.doc_meta && typeof d.doc_meta === "object" ? d.doc_meta : {}) as Record<string, string>;
              return String(d.doc_kind || "").includes("report") ||
                /שמא[יו]/i.test(String(d.original_name || "")) ||
                /survey|apprais/i.test(String(d.original_name || "")) ||
                String(meta.staff_type || "").includes("report");
            });
            if (surveyorDocs.length > 0) {
              // Add all pages/files of surveyor report
              for (const d of surveyorDocs) {
                if (!matchedSet.has(String(d.id))) {
                  matchedSet.add(String(d.id));
                  fileIds.push(String(d.id));
                  fileTitles.push(documentDisplayTitle({ original_name: String(d.original_name || ""), doc_meta: (d.doc_meta || {}) as Record<string, string> }));
                }
              }
            } else {
              missingDocuments.push("דוח שמאות");
            }
          }

          // 2. Check for vehicle license (רישיון רכב)
          const wantsVehicleLicense = /ר[י]?שיון\s*רכב|license_vehicle/i.test(docQuery) || requestedItems.some((it) => /ר[י]?שיון\s*רכב/i.test(it));
          if (wantsVehicleLicense) {
            const licenseDoc = docsList.find((d) => {
              const meta = (d.doc_meta && typeof d.doc_meta === "object" ? d.doc_meta : {}) as Record<string, string>;
              return /ר[י]?שיון\s*רכב|license_vehicle/i.test(String(d.original_name || "")) ||
                /license_vehicle/i.test(String(meta.staff_type || ""));
            });
            if (licenseDoc) {
              if (!matchedSet.has(String(licenseDoc.id))) {
                matchedSet.add(String(licenseDoc.id));
                fileIds.push(String(licenseDoc.id));
                fileTitles.push(documentDisplayTitle({ original_name: String(licenseDoc.original_name || ""), doc_meta: (licenseDoc.doc_meta || {}) as Record<string, string> }));
              }
            } else {
              missingDocuments.push("רישיון רכב");
            }
          }

          // 3. Check for driver license (רישיון נהיגה)
          const wantsDriverLicense = /ר[י]?שיון\s*נהיגה|license_driver/i.test(docQuery) || requestedItems.some((it) => /ר[י]?שיון\s*נהיגה/i.test(it));
          if (wantsDriverLicense) {
            const driverDoc = docsList.find((d) => {
              const meta = (d.doc_meta && typeof d.doc_meta === "object" ? d.doc_meta : {}) as Record<string, string>;
              return /ר[י]?שיון\s*נהיגה|license_driver/i.test(String(d.original_name || "")) ||
                /license_driver/i.test(String(meta.staff_type || ""));
            });
            if (driverDoc) {
              if (!matchedSet.has(String(driverDoc.id))) {
                matchedSet.add(String(driverDoc.id));
                fileIds.push(String(driverDoc.id));
                fileTitles.push(documentDisplayTitle({ original_name: String(driverDoc.original_name || ""), doc_meta: (driverDoc.doc_meta || {}) as Record<string, string> }));
              }
            } else {
              missingDocuments.push("רישיון נהיגה");
            }
          }

          // 4. Check for policy (פוליסה)
          const wantsPolicy = /פוליס|policy/i.test(docQuery) || requestedItems.some((it) => /פוליס/i.test(it));
          if (wantsPolicy) {
            const policyDoc = docsList.find((d) => {
              const meta = (d.doc_meta && typeof d.doc_meta === "object" ? d.doc_meta : {}) as Record<string, string>;
              return /פוליס/i.test(String(d.original_name || "")) || /policy/i.test(String(meta.staff_type || ""));
            });
            if (policyDoc) {
              if (!matchedSet.has(String(policyDoc.id))) {
                matchedSet.add(String(policyDoc.id));
                fileIds.push(String(policyDoc.id));
                fileTitles.push(documentDisplayTitle({ original_name: String(policyDoc.original_name || ""), doc_meta: (policyDoc.doc_meta || {}) as Record<string, string> }));
              }
            } else {
              missingDocuments.push("פוליסת ביטוח");
            }
          }

          // 5. Check for damage photos (תמונות נזק)
          const wantsDamagePhotos = /תמונ|נזק|damage|photo/i.test(docQuery) || requestedItems.some((it) => /תמונ|damage|photo/i.test(it));
          if (wantsDamagePhotos) {
            let countRequested = 3;
            if (/שלוש[ה]?\s*תמונ|3\s*תמונ/i.test(docQuery)) countRequested = 3;
            else if (/שת[יי]\s*תמונ|2\s*תמונ/i.test(docQuery)) countRequested = 2;
            else if (/ארבע[ה]?\s*תמונ|4\s*תמונ/i.test(docQuery)) countRequested = 4;
            else if (/חמש[ה]?\s*תמונ|5\s*תמונ/i.test(docQuery)) countRequested = 5;
            else if (/תמונה\s*אחת|1\s*תמונ/i.test(docQuery)) countRequested = 1;
            else {
              const numMatch = docQuery.match(/(\d+)\s*תמונ/);
              if (numMatch) countRequested = parseInt(numMatch[1], 10);
            }

            const damagePhotos = docsList.filter((d) => {
              const meta = (d.doc_meta && typeof d.doc_meta === "object" ? d.doc_meta : {}) as Record<string, string>;
              return String(d.doc_kind || "").includes("photo") ||
                /תמונ|נזק|damage|photo/i.test(String(d.original_name || "")) ||
                /damage_photos/i.test(String(meta.staff_type || "")) ||
                String(d.mime_type || "").startsWith("image/");
            });

            if (damagePhotos.length > 0) {
              const toTake = damagePhotos.slice(0, countRequested);
              for (const d of toTake) {
                if (!matchedSet.has(String(d.id))) {
                  matchedSet.add(String(d.id));
                  fileIds.push(String(d.id));
                  fileTitles.push(documentDisplayTitle({ original_name: String(d.original_name || ""), doc_meta: (d.doc_meta || {}) as Record<string, string> }));
                }
              }
            } else {
              missingDocuments.push("תמונות נזק");
            }
          }

          // 6. Keyword fallback if none of above triggered
          if (!wantsSurveyor && !wantsVehicleLicense && !wantsDriverLicense && !wantsPolicy && !wantsDamagePhotos && docQuery) {
            const words = docQuery.split(/\s+/).filter((w) => w.length >= 2);
            const matched = docsList.filter((d) => {
              const meta = (d.doc_meta && typeof d.doc_meta === "object" ? d.doc_meta : {}) as Record<string, string>;
              const hay = [d.original_name, d.doc_kind, meta.staff_type, meta.read_text].join(" ").toLowerCase();
              return words.every((w) => hay.includes(w));
            });
            if (matched.length > 0) {
              for (const d of matched) {
                if (!matchedSet.has(String(d.id))) {
                  matchedSet.add(String(d.id));
                  fileIds.push(String(d.id));
                  fileTitles.push(documentDisplayTitle({ original_name: String(d.original_name || ""), doc_meta: (d.doc_meta || {}) as Record<string, string> }));
                }
              }
            } else {
              missingDocuments.push(docQuery);
            }
          }
        }

        // Pre-mint share link if all requested documents are present and none are missing!
        let shareToken = "";
        let shareUrl = "";
        let waLink = "";
        const cleanPhone = String(recipientPhone || "").replace(/\D/g, "");

        if (fileIds.length > 0 && missingDocuments.length === 0) {
          try {
            const shareRes = await supabase.functions.invoke("claims-docs", {
              body: {
                action: "create_share",
                claim_id: targetClaimId,
                recipient_name: recipientName,
                recipient_kind: recipientKind,
                recipient_email: recipientEmail || undefined,
                recipient_phone: recipientPhone || undefined,
                file_ids: fileIds,
                ttl_hours: ttlHours,
              },
            });
            if (shareRes.data?.success && shareRes.data?.token) {
              shareToken = String(shareRes.data.token);
              shareUrl = `https://orin1607-ctrl.github.io/future-craft-core/claims-share/?t=${encodeURIComponent(shareToken)}`;
              const defaultWaText = customMessage || `שלום ${recipientName},\nמצורף קישור מאובטח לצפייה ולהורדת המסמכים בתיק תביעה ${targetClaimId}:\n${shareUrl}`;
              waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(defaultWaText)}` : `https://wa.me/?text=${encodeURIComponent(defaultWaText)}`;
            }
          } catch (e) {
            console.error("claims-docs create_share error:", e);
          }
        }

        const previewId = `P-SHARE-${Date.now()}`;
        const summary = missingDocuments.length > 0
          ? `הכנת שיתוף מסמכים עבור "${recipientName}" — חסר: ${missingDocuments.join(", ")}`
          : `יצירת קישור שיתוף עבור "${recipientName}" לתוקף של ${ttlHours} שעות (${fileIds.length} קבצים)`;

        const preview: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "create_share_link",
          parameters: {
            claim_id: targetClaimId,
            recipient_name: recipientName,
            recipient_kind: recipientKind,
            recipient_email: recipientEmail || null,
            recipient_phone: recipientPhone || null,
            channel,
            file_ids: fileIds,
            file_titles: fileTitles,
            missing_documents: missingDocuments,
            share_url: shareUrl || null,
            wa_link: waLink || null,
            ttl_hours: ttlHours,
            custom_message: customMessage || null,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId: targetClaimId,
          toolName: name,
          actionType: "create_share_link",
          previewSummary: summary,
          previewPayload: preview.parameters,
          status: "preview_created",
        });

        let responseMsg = "";
        if (missingDocuments.length > 0) {
          responseMsg = `המסמך ${missingDocuments.map((m) => `"${m}"`).join(", ")} חסר בתיק ${targetClaimId}. האם תרצה להעלות אותו עכשיו ישירות מהמכשיר? ${fileTitles.length > 0 ? `אותרו ${fileTitles.length} קבצים קיימים: ${fileTitles.join(", ")}.` : ""}`;
        } else {
          responseMsg = `הוכנה תצוגה מקדימה לשיתוף ${fileIds.length} מסמכים עבור ${recipientName} בתיק ${targetClaimId}. הקישור מוכן לבדיקה, העתקה או שליחה.`;
        }

        return {
          result: {
            preview_id: previewId,
            status: missingDocuments.length > 0 ? "needs_missing_documents" : "pending_approval",
            message: responseMsg,
            details: {
              recipient_name: recipientName,
              recipient_kind: recipientKind,
              recipient_email: recipientEmail,
              recipient_phone: recipientPhone,
              channel,
              ttl_hours: ttlHours,
              files_count: fileIds.length,
              file_titles: fileTitles,
              missing_documents: missingDocuments,
              share_url: shareUrl || null,
              wa_link: waLink || null,
            },
          },
          preview,
        };
      }

      case "preview_revoke_claim_share_link": {
        const shareId = String(args.share_id || "").trim();
        const previewId = `P-REVOKE-${Date.now()}`;
        const summary = `ביטול קישור שיתוף מאובטח (מזהה: ${shareId})`;

        const preview: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "revoke_share_link",
          parameters: {
            claim_id: claimId,
            share_id: shareId,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "revoke_share_link",
          previewSummary: summary,
          previewPayload: preview.parameters,
          status: "preview_created",
        });

        return {
          result: {
            preview_id: previewId,
            status: "pending_approval",
            message: "הוכנה תצוגה מקדימה לביטול הקישור. נדרש אישור המשתמש לביצוע.",
            share_id: shareId,
          },
          preview,
        };
      }

      case "preview_update_claim_status": {
        const newStatus = String(args.new_status || "").trim();
        const reason = String(args.reason || "בקשת משתמש").trim();

        const { data: currentRec } = await supabase
          .from("claims_records")
          .select("status")
          .eq("id", claimId)
          .maybeSingle();

        const currentStatus = currentRec?.status || "לא ידוע";
        const previewId = `P-STATUS-${Date.now()}`;
        const summary = `שינוי סטטוס התיק מ-"${currentStatus}" ל-"${newStatus}" (סיבה: ${reason})`;

        const preview: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "update_status",
          parameters: {
            claim_id: claimId,
            new_status: newStatus,
            old_status: currentStatus,
            reason,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "update_status",
          previewSummary: summary,
          previewPayload: preview.parameters,
          status: "preview_created",
        });

        return {
          result: {
            preview_id: previewId,
            status: "pending_approval",
            message: "הוכנה תצוגה מקדימה לעדכון הסטטוס. נדרש אישור המשתמש לביצוע.",
            current_status: currentStatus,
            new_status: newStatus,
            reason,
          },
          preview,
        };
      }

      case "preview_create_claim_task": {
        const effectiveClaim = String(claimId || args.claim_ref || args.claim_id || "").trim();
        if (!effectiveClaim) {
          return { result: { error: "נדרש מזהה תיק (claim_ref) ליצירת משימה." } };
        }
        const { data: existingTasks } = await supabase.from("claims_tasks").select("id, row_data").eq("claim_id", effectiveClaim);
        const openRows = (existingTasks || []).map((t) => rowOf(t));
        const plan = planTask(effectiveClaim, { action: args.task_description, dueDate: args.due_date, owner: args.owner, note: args.note }, openRows);
        if (!plan.ok) {
          return { result: { status: plan.duplicateId ? "duplicate" : "invalid", error: plan.error, claim_id: effectiveClaim } };
        }
        const taskDescription = plan.task.action;
        const previewId = `P-TASK-${Date.now()}`;
        const summary = [
          `יצירת משימה בתיק ${effectiveClaim}: "${taskDescription}"`,
          plan.task.dueDate ? `יעד: ${plan.task.dueDate}` : "",
          `אחראי: ${plan.task.owner || userName || "המשתמש"}`,
          plan.task.note ? `הערה: ${plan.task.note}` : "",
        ].filter(Boolean).join("\n");

        const preview: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "create_task",
          parameters: {
            claim_id: effectiveClaim,
            task_description: taskDescription,
            due_date: plan.task.dueDate,
            owner: plan.task.owner,
            note: plan.task.note,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId: effectiveClaim,
          toolName: name,
          actionType: "create_task",
          previewSummary: summary,
          previewPayload: preview.parameters,
          status: "preview_created",
        });

        return {
          result: {
            preview_id: previewId,
            status: "pending_approval",
            message: "הוכנה תצוגה מקדימה ליצירת המשימה. נדרש אישור המשתמש לביצוע.",
            task_description: taskDescription,
          },
          preview,
        };
      }

      case "preview_close_claim_task": {
        const effectiveClaim = String(claimId || args.claim_ref || args.claim_id || "").trim();
        const taskId = String(args.task_id || "").trim();
        const previewId = `P-CLOSETASK-${Date.now()}`;
        const summary = `סגירת משימה בתיק ${effectiveClaim || ""}: (מזהה: ${taskId})`;

        const preview: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "close_task",
          parameters: {
            claim_id: effectiveClaim,
            task_id: taskId,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId: effectiveClaim || null,
          toolName: name,
          actionType: "close_task",
          previewSummary: summary,
          previewPayload: preview.parameters,
          status: "preview_created",
        });

        return {
          result: {
            preview_id: previewId,
            status: "pending_approval",
            message: "הוכנה תצוגה מקדימה לסגירת המשימה. נדרש אישור המשתמש לביצוע.",
            task_id: taskId,
          },
          preview,
        };
      }

      case "preview_add_claim_note": {
        const effectiveClaim = String(claimId || args.claim_ref || args.claim_id || "").trim();
        if (!effectiveClaim) {
          return { result: { error: "נדרש מזהה תיק (claim_ref) להוספת הערה." } };
        }
        const note = String(args.note || "").trim();
        const previewId = `P-NOTE-${Date.now()}`;
        const summary = `הוספת הערה לתיק ${effectiveClaim}: "${note}"`;

        const preview: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "add_note",
          parameters: {
            claim_id: effectiveClaim,
            note,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId: effectiveClaim,
          toolName: name,
          actionType: "add_note",
          previewSummary: summary,
          previewPayload: preview.parameters,
          status: "preview_created",
        });

        return {
          result: {
            preview_id: previewId,
            status: "pending_approval",
            message: "הוכנה תצוגה מקדימה להוספת ההערה. נדרש אישור המשתמש לביצוע.",
            note,
          },
          preview,
        };
      }

      case "list_claim_reminders": {
        const effectiveClaim = String(claimId || args.claim_ref || args.claim_id || "").trim();
        let remQuery = supabase
          .from("claims_reminders")
          .select("id, row_data")
          .order("created_at", { ascending: false });
        if (effectiveClaim) {
          remQuery = remQuery.eq("claim_id", effectiveClaim);
        }
        const { data: rems } = await remQuery;
        const active = (rems || [])
          .map((r) => rowOf(r))
          .filter((r) => r.cancelled !== "true")
          .map((r) => ({ id: r.id, date: r.date, note: r.note, owner: r.owner, fired: r.sent === "true" }));
        await recordAiAudit(supabase, { userId, userName, claimId: effectiveClaim || null, toolName: name, actionType: "list_reminders", status: "success" });
        return { result: { claim_id: claimId, total: active.length, reminders: active } };
      }

      case "preview_create_claim_reminder": {
        const plan = planReminder(claimId, { date: args.date, note: args.note, owner: userName });
        if (!plan.ok) return { result: { status: "invalid", error: plan.error, claim_id: claimId } };
        const preview: ClaimsPendingAction = {
          preview_id: `P-REM-${Date.now()}`,
          summary: `תזכורת בתיק ${claimId} לתאריך ${plan.reminder.date}:\n${plan.reminder.note}`,
          tool_name: name,
          action_type: "create_reminder",
          parameters: { claim_id: claimId, date: plan.reminder.date, note: plan.reminder.note },
        };
        await recordAiAudit(supabase, { userId, userName, claimId, toolName: name, actionType: "create_reminder", previewSummary: preview.summary, previewPayload: preview.parameters, status: "preview_created" });
        return pendingResult(preview, "הוכן כרטיס אישור לתזכורת. היא תישמר רק אחרי אישור.");
      }

      case "preview_update_claim_reminder": {
        const remId = String(args.reminder_id || "").trim();
        const { data: rem } = await supabase.from("claims_reminders").select("id, row_data, action").eq("id", remId).eq("claim_id", claimId).maybeSingle();
        if (!rem || rem.action !== "note") return { result: { status: "not_found", error: "התזכורת לא נמצאה בתיק הזה." } };
        const current = rowOf(rem);
        const plan = planReminderUpdate(current, { date: args.date, note: args.note, cancel: args.cancel });
        if (!plan.ok) return { result: { status: "invalid", error: plan.error } };
        const preview: ClaimsPendingAction = {
          preview_id: `P-REMUP-${Date.now()}`,
          summary: `${plan.cancelled ? "ביטול" : "עדכון"} תזכורת בתיק ${claimId} (${current.date} · ${current.note}):\n${plan.changes.join("\n")}`,
          tool_name: name,
          action_type: "update_reminder",
          parameters: {
            claim_id: claimId,
            reminder_id: remId,
            date: args.date ?? null,
            note: args.note ?? null,
            cancel: plan.cancelled,
            expected_date: current.date || "",
            expected_note: current.note || "",
          },
        };
        await recordAiAudit(supabase, { userId, userName, claimId, toolName: name, actionType: "update_reminder", previewSummary: preview.summary, previewPayload: preview.parameters, status: "preview_created" });
        return pendingResult(preview, "הוכן כרטיס אישור לעדכון התזכורת.");
      }

      case "list_claim_whatsapp": {
        const { data: comm } = await supabase.from("claims_comm_log").select("id, row_data").eq("claim_id", claimId);
        const wa = (comm || [])
          .map((c) => rowOf(c))
          .filter((c) => c.type === "wa")
          .map((c) => ({
            id: c.id,
            phone: c.phone,
            contact_name: c.contactName,
            planned_at: c.plannedAt || "",
            status: c.waStatus === "scheduled_blocked" ? "ממתין לשליחה ידנית (לא נשלח)"
              : c.waStatus === "marked_sent_by_user" ? "המשתמש סימן שנשלח"
              : c.waStatus === "cancelled" ? "בוטל" : c.waStatus === "opened_not_sent" ? "נפתח, לא סומן כנשלח" : c.waStatus,
            body_excerpt: String(c.body || "").slice(0, 120),
          }));
        await recordAiAudit(supabase, { userId, userName, claimId, toolName: name, actionType: "list_whatsapp", status: "success" });
        return { result: { claim_id: claimId, total: wa.length, messages: wa, note: "הודעה נחשבת נשלחה רק כשהמשתמש סימן 'שלחתי'." } };
      }

      case "preview_schedule_claim_whatsapp": {
        const when = resolveWaWhen({ when: args.when, date: args.date, time: args.time, relative_day: args.relative_day });
        if (!when.ok) return { result: { status: "invalid", error: when.error } };
        const { data: claimRow } = await supabase.from("claims_records").select("row_data").eq("id", claimId).maybeSingle();
        const crd = (claimRow?.row_data && typeof claimRow.row_data === "object" ? claimRow.row_data : {}) as Record<string, unknown>;
        const { data: comm } = await supabase.from("claims_comm_log").select("id, row_data").eq("claim_id", claimId);
        const held = (comm || []).map((c) => rowOf(c));
        const plan = planWaSchedule(claimId, { phone: args.phone, body: args.body, contact_name: args.contact_name || crd.clientName }, when, held);
        if (!plan.ok) return { result: { status: "invalid", error: plan.error } };

        // Whose number is it? Never e.g. the surveyor's number for a message to the client.
        const contactRows: Array<{ full_name?: unknown; role?: unknown; phones?: unknown[] }> = [];
        try {
          const { data: links } = await supabase.from("claims_claim_contacts").select("contact_id, role_on_claim").eq("claim_id", claimId);
          const ids = (links || []).map((l) => String(l.contact_id));
          if (ids.length) {
            const { data: people } = await supabase.from("claims_contacts").select("id, full_name, role").in("id", ids);
            const { data: channels } = await supabase.from("claims_contact_channels").select("contact_id, kind, value").in("contact_id", ids);
            for (const p of people || []) {
              const link = (links || []).find((l) => String(l.contact_id) === String(p.id));
              contactRows.push({
                full_name: p.full_name,
                role: link?.role_on_claim || p.role,
                phones: (channels || []).filter((c) => String(c.contact_id) === String(p.id) && /phone|whatsapp|mobile|tel/i.test(String(c.kind || ""))).map((c) => c.value),
              });
            }
          }
        } catch { /* contacts are optional; the claim's own fields still count */ }
        const recipient = checkWaRecipient(claimPhoneOwners(crd, contactRows), plan.wa.phone, args.recipient_role || "client");
        if (!recipient.ok) return { result: { status: "invalid", error: recipient.error } };

        // Documents go as one secure link (created on approval), only files of this claim.
        const requestedIds = Array.isArray(args.file_ids) ? (args.file_ids as unknown[]).map((x) => String(x)).filter(Boolean) : [];
        let fileTitles: string[] = [];
        let fileIds: string[] = [];
        if (requestedIds.length) {
          const { data: docs } = await supabase.from("claims_documents").select("id, original_name, doc_meta").eq("claim_id", claimId).in("id", requestedIds);
          const known = new Map((docs || []).map((d) => [String(d.id), d]));
          const missing = requestedIds.filter((id) => !known.has(id));
          if (missing.length) return { result: { status: "invalid", error: `${missing.length} מסמכים לא שייכים לתיק הזה. לא הוכן כרטיס.` } };
          fileIds = requestedIds;
          fileTitles = requestedIds.map((id) => {
            const d = known.get(id)!;
            return documentDisplayTitle({ original_name: String(d.original_name || ""), doc_meta: d.doc_meta as Record<string, string> });
          });
        }
        const bodyPreview = fileIds.length ? withShareLink(plan.wa.body, "[קישור מאובטח ייווצר באישור]") : plan.wa.body;
        const summary = [
          `WhatsApp ידני בתיק ${claimId} — אל ${plan.wa.contactName || "הנמען"} (${plan.wa.phone})`,
          recipient.ownerLabel ? `המספר שמור בתיק כ: ${recipient.ownerLabel}` : `⚠️ ${recipient.warning}`,
          `מועד התראה: ${plan.wa.plannedLabel}`,
          fileIds.length ? `מסמכים בקישור מאובטח (בתוקף 72 שעות, רק לתיק הזה): ${fileTitles.join(", ")}` : "",
          "",
          bodyPreview,
          "",
          "ההודעה לא תישלח אוטומטית: במועד תופיע התראה, תפתח WhatsApp, תשלח ותסמן 'שלחתי'.",
        ].filter((l, i, a) => l || (i > 0 && a[i - 1])).join("\n");

        const preview: ClaimsPendingAction = {
          preview_id: `P-WA-${Date.now()}`,
          summary,
          tool_name: name,
          action_type: "schedule_whatsapp",
          parameters: {
            claim_id: claimId,
            phone: plan.wa.phone,
            contact_name: plan.wa.contactName,
            body: plan.wa.body,
            planned_at: plan.wa.plannedAt,
            planned_label: plan.wa.plannedLabel,
            file_ids: fileIds,
            file_titles: fileTitles,
            recipient_role: String(args.recipient_role || "client"),
          },
        };
        await recordAiAudit(supabase, { userId, userName, claimId, toolName: name, actionType: "schedule_whatsapp", previewSummary: summary, previewPayload: preview.parameters, status: "preview_created" });
        return pendingResult(preview, "הוכן כרטיס אחד לאישור: שמירת התזמון" + (fileIds.length ? " ויצירת הקישור המאובטח." : ".") + " ההודעה עצמה תישלח ידנית.");
      }

      case "preview_create_customer": {
        const nameCust = String(args.name || "").trim();
        const phone = String(args.phone || "").trim();
        const email = String(args.email || "").trim();
        const customerType = String(args.customer_type || "private").trim();
        const notes = String(args.notes || "").trim();

        const previewId = `P-CUST-${Date.now()}`;
        const summary = `יצירת לקוח חדש במערכת: "${nameCust}" (טלפון: ${phone || "—"}, מייל: ${email || "—"})`;

        const preview: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "create_customer",
          parameters: {
            name: nameCust,
            phone: phone || null,
            email: email || null,
            customer_type: customerType,
            notes: notes || null,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "create_customer",
          previewSummary: summary,
          previewPayload: preview.parameters,
          status: "preview_created",
        });

        return {
          result: {
            preview_id: previewId,
            status: "pending_approval",
            message: "הוכנה תצוגה מקדימה ליצירת הלקוח. נדרש אישור המשתמש לביצוע.",
            customer_name: nameCust,
            phone: phone || "—",
            email: email || "—",
          },
          preview,
        };
      }

      case "preview_update_claim_client_contact": {
        const phone = String(args.phone || "").trim();
        const email = String(args.email || "").trim();
        const reason = String(args.reason || "בקשת משתמש").trim();

        const previewId = `P-UPDATECONTACT-${Date.now()}`;
        const summary = `עדכון פרטי קשר ללקוח התיק (${phone ? `טלפון: ${phone} ` : ""}${email ? `מייל: ${email}` : ""})`;

        const preview: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "update_claim_client_contact",
          parameters: {
            claim_id: claimId,
            phone: phone || null,
            email: email || null,
            reason,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "update_claim_client_contact",
          previewSummary: summary,
          previewPayload: preview.parameters,
          status: "preview_created",
        });

        return {
          result: {
            preview_id: previewId,
            status: "pending_approval",
            message: "הוכנה תצוגה מקדימה לעדכון פרטי הלקוח. נדרש אישור המשתמש לביצוע.",
            phone: phone || "ללא שינוי",
            email: email || "ללא שינוי",
          },
          preview,
        };
      }

      case "preview_link_client_to_claim": {
        const custName = String(args.customer_name || "").trim();
        const custId = String(args.customer_id || "").trim();

        let foundCust: Record<string, unknown> | null = null;
        if (custId) {
          const { data } = await supabase.from("customers").select("*").eq("id", custId).maybeSingle();
          foundCust = data;
        } else if (custName) {
          const { data } = await supabase.from("customers").select("*").ilike("name", `%${custName}%`).limit(1).maybeSingle();
          foundCust = data;
        }

        if (!foundCust) {
          return {
            result: {
              error: `לא נמצא לקוח במערכת התואם ל-"${custName || custId}". אנא בדוק את שם הלקוח או פתח לקוח חדש.`,
            },
          };
        }

        const previewId = `P-LINKCUST-${Date.now()}`;
        const summary = `קישור הלקוח "${foundCust.name}" (טלפון: ${foundCust.phone || "—"}) לתיק התביעה הנוכחי`;

        const preview: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "link_client_to_claim",
          parameters: {
            claim_id: claimId,
            customer_id: foundCust.id,
            customer_name: foundCust.name,
            phone: foundCust.phone || null,
            email: foundCust.email || null,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "link_client_to_claim",
          previewSummary: summary,
          previewPayload: preview.parameters,
          status: "preview_created",
        });

        return {
          result: {
            preview_id: previewId,
            status: "pending_approval",
            message: "הוכנה תצוגה מקדימה לקישור הלקוח לתיק. נדרש אישור המשתמש לביצוע.",
            customer_name: foundCust.name,
            customer_id: foundCust.id,
          },
          preview,
        };
      }

      default:
        return { result: { error: `כלי לא מוכר: ${name}` } };
    }
  } catch (err) {
    console.error("executeClaimsTool error:", err);
    return {
      result: { error: err instanceof Error ? err.message : "שגיאה בביצוע הכלי" },
    };
  }
}

function formatHeDateTime(val?: string | null): string {
  if (!val) return "";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleString("he-IL", {
      timeZone: "Asia/Jerusalem",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(val);
  }
}

async function handleGetClaimsStatusReport(
  supabase: ReturnType<typeof createClient>,
  args: Record<string, unknown>,
  userId: string,
  userName: string,
  toolName = "get_claims_status_report",
): Promise<{ result: unknown }> {
  const CLOSED_STATUS_SET = new Set(["הסתיים", "שולם", "נדחה", "הושלם", "סגור", "בוטל"]);
  const isClaimClosed = (status: string, rowData?: Record<string, unknown>): boolean => {
    const st = String(status || rowData?.status || "").trim();
    const archived = String(rowData?.archived || "").toLowerCase() === "true";
    return archived || CLOSED_STATUS_SET.has(st);
  };

  const filterStatus = String(args.filter_status || "all").trim();
  const openOnly = args.open_only === true || args.include_closed === false || filterStatus === "open" || filterStatus === "פתוח" || filterStatus === "פתוחות";

  // 1. Fetch claims records
  const { data: recs, error: recsErr } = await supabase
    .from("claims_records")
    .select("id, status, company_name, row_data, created_at, last_activity_at")
    .order("created_at", { ascending: false });

  if (recsErr) {
    return { result: { error: `שגיאה בשליפת תביעות: ${recsErr.message}` } };
  }

  // Filter non-deleted and non-hidden
  let activeRecs = (recs || []).filter((r) => {
    const rd = (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>;
    const isDeleted = !!rd.deletedAt || r.status === "נמחק" || rd.status === "נמחק";
    const isHidden = !!rd.hidden || !!rd.is_hidden;
    return !isDeleted && !isHidden;
  });

  const totalOpenInSystem = activeRecs.filter((r) => !isClaimClosed(r.status, (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>)).length;

  if (openOnly) {
    activeRecs = activeRecs.filter((r) => {
      const rd = (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>;
      return !isClaimClosed(r.status, rd);
    });
  } else if (filterStatus && filterStatus !== "all" && filterStatus !== "closed") {
    activeRecs = activeRecs.filter((r) => {
      const rd = (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>;
      const st = String(r.status || rd.status || "");
      return st === filterStatus;
    });
  } else if (filterStatus === "closed") {
    activeRecs = activeRecs.filter((r) => {
      const rd = (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>;
      return isClaimClosed(r.status, rd);
    });
  }

  const claimIds = activeRecs.map((r) => r.id);

  // 2. Fetch latest history per claim
  const latestHistoryByClaim = new Map<string, { at: string; action: string; by: string; note: string }>();
  if (claimIds.length > 0) {
    const { data: histRows } = await supabase
      .from("claims_history")
      .select("claim_id, row_data, created_at")
      .in("claim_id", claimIds)
      .order("created_at", { ascending: false });

    for (const h of histRows || []) {
      if (!latestHistoryByClaim.has(h.claim_id)) {
        const rd = (h.row_data && typeof h.row_data === "object" ? h.row_data : {}) as Record<string, unknown>;
        latestHistoryByClaim.set(h.claim_id, {
          at: String(rd.at || formatHeDateTime(h.created_at)),
          action: String(rd.action || rd.note || "פעולה מתועדת"),
          by: String(rd.by || ""),
          note: String(rd.note || ""),
        });
      }
    }
  }

  // 3. Fetch mail jobs and reminders
  const sentEmailsByClaim = new Map<string, { to: string; when: string; subject: string }>();
  const scheduledEmailsByClaim = new Map<string, { to: string; when: string; subject: string }>();
  const pendingEmailsByClaim = new Map<string, { to: string; subject: string }>();

  if (claimIds.length > 0) {
    const { data: jobs } = await supabase
      .from("claims_mail_jobs")
      .select("claim_id, status, preview, planned_at, finished_at, created_at")
      .in("claim_id", claimIds)
      .order("created_at", { ascending: false });

    for (const j of jobs || []) {
      const prev = (j.preview && typeof j.preview === "object" ? j.preview : {}) as Record<string, unknown>;
      const to = String(prev.to || "");
      const subject = String(prev.subject || "");
      if (j.status === "sent" || j.status === "dry_run_sent") {
        if (!sentEmailsByClaim.has(j.claim_id)) {
          sentEmailsByClaim.set(j.claim_id, {
            to,
            when: formatHeDateTime(j.finished_at || j.planned_at || j.created_at),
            subject,
          });
        }
      } else if (j.status === "pending") {
        if (!pendingEmailsByClaim.has(j.claim_id)) {
          pendingEmailsByClaim.set(j.claim_id, { to, subject });
        }
      }
    }

    const { data: rems } = await supabase
      .from("claims_reminders")
      .select("claim_id, status, mail_to, mail_subject, next_run_at, action")
      .in("claim_id", claimIds)
      .eq("action", "send_email")
      .eq("status", "scheduled")
      .order("created_at", { ascending: false });

    for (const r of rems || []) {
      if (!scheduledEmailsByClaim.has(r.claim_id)) {
        scheduledEmailsByClaim.set(r.claim_id, {
          to: String(r.mail_to || ""),
          when: formatHeDateTime(r.next_run_at),
          subject: String(r.mail_subject || ""),
        });
      }
    }
  }

  // 4. Inbound emails from claims_gmail_imports
  const inboundByClaim = new Map<string, { from_addr: string; subject: string; sent_at: string; received_at: string }>();
  if (claimIds.length > 0) {
    const { data: imports } = await supabase
      .from("claims_gmail_imports")
      .select("claim_id, from_addr, subject, sent_at, received_at")
      .in("claim_id", claimIds)
      .order("sent_at", { ascending: false });

    for (const m of imports || []) {
      if (!inboundByClaim.has(m.claim_id)) {
        inboundByClaim.set(m.claim_id, {
          from_addr: String(m.from_addr || ""),
          subject: String(m.subject || ""),
          sent_at: formatHeDateTime(m.sent_at || m.received_at),
          received_at: formatHeDateTime(m.received_at),
        });
      }
    }
  }

  // 5. Open tasks
  const openTasksByClaim = new Map<string, Array<Record<string, unknown>>>();
  if (claimIds.length > 0) {
    const { data: tasks } = await supabase
      .from("claims_tasks")
      .select("id, claim_id, row_data, created_at")
      .in("claim_id", claimIds)
      .order("created_at", { ascending: false });

    for (const t of tasks || []) {
      const rd = (t.row_data && typeof t.row_data === "object" ? t.row_data : {}) as Record<string, unknown>;
      if (rd.done !== "true" && rd.workStatus !== "done") {
        const list = openTasksByClaim.get(t.claim_id) || [];
        list.push(rd);
        openTasksByClaim.set(t.claim_id, list);
      }
    }
  }

  // 6. Documents
  const docsByClaim = new Map<string, string[]>();
  if (claimIds.length > 0) {
    const { data: docs } = await supabase
      .from("claims_documents")
      .select("claim_id, original_name")
      .in("claim_id", claimIds)
      .eq("is_archived", false);

    for (const d of docs || []) {
      const list = docsByClaim.get(d.claim_id) || [];
      list.push(String(d.original_name || "").toLowerCase());
      docsByClaim.set(d.claim_id, list);
    }
  }

  // Build items with all 13 required fields
  const items = activeRecs.map((r) => {
    const rd = (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>;
    const claimId = r.id;
    const isQa = rd.isQa === "true" || rd.isQa === true || claimId.startsWith("DAL-QA-") || String(rd.clientName || "").includes("QA") || String(rd.clientName || "").includes("בדיקה");
    const rawClientName = String(rd.clientName || "").trim() || "לא צוין";
    const clientName = isQa ? `${rawClientName} 🧪 [בדיקה / QA]` : rawClientName;
    const claimNum = String(rd.claimNum || "").trim() || (isQa ? "QA-TEST" : "לא צוין");
    const clientId = String(rd.clientId || rd.driverId || "").trim() || "לא תועד";
    const insCompany = String(rd.insCompany || r.company_name || "").trim() || "לא הוגדרה";
    const status = String(r.status || rd.status || "חדש").trim();
    const handler = String(rd.assigned_to_name || rd.createdByName || "").trim() || "לא שויך";
    const nextDate = String(rd.nextDate || "").trim() || "לא נקבע";
    const nextAction = String(rd.nextAction || "").trim() || "לא תועדה פעולה הבאה";

    // Last action
    const hist = latestHistoryByClaim.get(claimId);
    let lastActionDate = "";
    let lastActionStr = "לא תועדה פעולה";
    if (hist) {
      lastActionDate = hist.at;
      lastActionStr = `${hist.action}${hist.by ? ` (ע״י ${hist.by})` : ""}`;
    } else if (r.created_at) {
      lastActionDate = formatHeDateTime(r.created_at);
      lastActionStr = "פתיחת תיק במערכת";
    }

    // Email status
    const sent = sentEmailsByClaim.get(claimId);
    const sched = scheduledEmailsByClaim.get(claimId);
    const pend = pendingEmailsByClaim.get(claimId);
    let emailStatus = "טרם נשלח אימייל";
    if (sent) {
      emailStatus = `נשלח אל ${sent.to} ב-${sent.when}`;
    } else if (sched) {
      emailStatus = `📅 מתוזמן ל-${sched.when} אל ${sched.to}`;
    } else if (pend) {
      emailStatus = `טיוטה ממתינה לאישור אל ${pend.to}`;
    }

    // Insurer reply
    const inbound = inboundByClaim.get(claimId);
    let insurerReply = "לא תועד מענה מחברת הביטוח";
    if (inbound) {
      insurerReply = `${inbound.sent_at}: מאת ${inbound.from_addr} - "${inbound.subject.slice(0, 35)}"`;
    }

    // Waiting for
    let waitingFor = "טיפול פנימי";
    if (rd.treatmentPendingAction) {
      waitingFor = String(rd.treatmentPendingAction);
    } else if (rd.treatmentPending) {
      waitingFor = `ממתין ל-${rd.treatmentPending}`;
    } else if (status.includes("ממתין לביטוח")) {
      waitingFor = "מענה מחברת הביטוח";
    } else if (status.includes("ממתין לשמאי")) {
      waitingFor = "דוח / בדיקת שמאי";
    } else if (status.includes("ממתין למסמכים")) {
      waitingFor = "מסמכים מהלקוח/סוכן";
    } else if (status.includes("בטיפול מוסך")) {
      waitingFor = "השלמת טיפול במוסך";
    } else if (status === "חדש") {
      waitingFor = "פתיחה וקליטה ראשונית";
    }

    // Missing documents check
    const docNames = docsByClaim.get(claimId) || [];
    const missingDocsList: string[] = [];
    if (!docNames.some((n) => n.includes("רישיון") || n.includes("רשיון") || n.includes("license"))) missingDocsList.push("רישיון רכב");
    if (!docNames.some((n) => n.includes("שמאי") || n.includes("surveyor"))) missingDocsList.push("דוח שמאי");
    if (!docNames.some((n) => n.includes("חשבונית") || n.includes("invoice"))) missingDocsList.push("חשבונית מוסך");
    if (!docNames.some((n) => n.includes("הודעה") || n.includes("טופס") || n.includes("notice"))) missingDocsList.push("טופס הודעה");

    // Open alerts & tasks
    const openTasks = openTasksByClaim.get(claimId) || [];
    const alerts: string[] = [];
    let isUrgent = false;

    for (const t of openTasks) {
      if (t.replyReceived === "true") {
        alerts.push("מענה חדש התקבל");
        isUrgent = true;
      }
    }
    if (inbound && (!sent || new Date(inbound.sent_at).getTime() > new Date(sent.when).getTime())) {
      alerts.push("מייל חדש מחברת הביטוח");
      isUrgent = true;
    }
    if (missingDocsList.length > 0) {
      alerts.push(`חסר: ${missingDocsList.slice(0, 2).join(", ")}`);
    }
    if (nextDate && nextDate !== "לא נקבע") {
      const nd = new Date(nextDate).getTime();
      if (!isNaN(nd) && nd < Date.now()) {
        alerts.push("מועד מעקב עבר");
        isUrgent = true;
      }
    }

    const openAlertsFormatted = alerts.length > 0
      ? (isUrgent ? `🔴 [דחוף] ${alerts.join(" · ")}` : `🟡 [ממתין] ${alerts.join(" · ")}`)
      : "אין התראות פתוחות";

    // Urgency score
    let urgencyScore = 0;
    if (isUrgent) urgencyScore += 100;
    if (status.includes("בטיפול") || status === "חדש") urgencyScore += 50;
    else if (status.includes("ממתין")) urgencyScore += 30;
    else if (status === "הושלם" || status === "סגור") urgencyScore -= 50;

    return {
      claim_id: claimId,
      claim_num: claimNum,
      client_name: clientName,
      client_id: clientId,
      ins_company: insCompany,
      status,
      last_action_date: lastActionDate,
      last_action: lastActionStr,
      email_status: emailStatus,
      insurer_last_reply: insurerReply,
      waiting_for: waitingFor,
      handler,
      next_action: nextAction,
      next_followup_date: nextDate,
      missing_docs: missingDocsList.length > 0 ? missingDocsList.join(", ") : "אין חוסרים מתועדים",
      open_alerts: openAlertsFormatted,
      is_urgent: isUrgent,
      is_qa: isQa,
      claim_type: isQa ? "בדיקה (QA)" : "תביעה אמיתית",
      urgency_score: urgencyScore,
      claim_link: `[פתח תיק ${claimId}](claim:${claimId})`,
    };
  });

  items.sort((a, b) => b.urgency_score - a.urgency_score);

  const tableHeaders = [
    "מספר תיק",
    "שם לקוח",
    "חברת ביטוח",
    "סטטוס נוכחי",
    "פעולה אחרונה",
    "מועד פעולה",
    "מצב אימייל",
    "תשובת מבטחת אחרונה",
    "למה ממתינים",
    "גורם מטפל",
    "פעולה נדרשת",
    "מועד מעקב",
    "התראות פתוחות",
    "פתח תיק",
  ];

  const tableRows = items.map((it) => {
    const claimDisplay = it.claim_num && it.claim_num !== it.claim_id
      ? `[${it.claim_id}](claim:${it.claim_id}) · ${it.claim_num}`
      : `[${it.claim_id}](claim:${it.claim_id})`;
    const clientDisplay = it.client_name ? `${it.client_name}${it.client_id ? ` · ${it.client_id}` : ""}` : "לא צוין";
    return [
      claimDisplay,
      clientDisplay,
      it.ins_company || "לא צוין",
      it.status || "חדש",
      it.last_action || "—",
      it.last_action_date || "—",
      it.email_status || "טרם נשלח אימייל",
      it.insurer_last_reply || "לא תועד מענה",
      it.waiting_for || "—",
      it.handler || "לא שויך",
      it.next_action || "—",
      it.next_followup_date || "לא נקבע",
      it.open_alerts || "אין התראות פתוחות",
      `[פתח תיק](claim:${it.claim_id})`,
    ];
  });

  const markdownLines = [
    `| ${tableHeaders.join(" | ")} |`,
    `| ${tableHeaders.map(() => "---").join(" | ")} |`,
    ...tableRows.map((row) => `| ${row.map((cell) => String(cell).replace(/\|/g, " ").replace(/\r?\n/g, " ")).join(" | ")} |`),
  ];
  const markdownTable = markdownLines.join("\n");
  const reportTitle = openOnly
    ? `דוח סטטוס תביעות פתוחות (סה״כ תביעות פתוחות: ${items.length})`
    : `דוח סטטוס תביעות (סה״כ תביעות פתוחות: ${totalOpenInSystem} מתוך ${items.length} תיקים)`;

  await recordAiAudit(supabase, {
    userId,
    userName,
    toolName,
    actionType: "get_claims_status_report",
    status: "success",
  });

  return {
    result: {
      total_claims: items.length,
      open_claims: totalOpenInSystem,
      urgent_claims: items.filter((x) => x.is_urgent).length,
      title: reportTitle,
      headers: tableHeaders,
      rows: tableRows,
      markdown_table: markdownTable,
      claims: items,
    },
  };
}

// -------------------------------------------------------------
// 6. TOOL EXECUTION: General Claims Mode (executeClaimsGeneralTool)
// -------------------------------------------------------------
export async function executeClaimsGeneralTool(
  name: string,
  args: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  userId: string,
  userName: string,
  attachments?: any[],
): Promise<{ result: unknown; preview?: ClaimsPendingAction; card?: ClaimsDocumentCard }> {
  try {
    const todayStart = getTodayStart();

    if ((GENERAL_CLAIM_SCOPED_TOOLS as readonly string[]).includes(name)) {
      const claimRefStr = String(args.claim_ref || "").trim();
      let resolvedId = "";
      if (claimRefStr) {
        const resolved = await resolveClaimRef(supabase, claimRefStr);
        if (!resolved.ok) return { result: { error: resolved.error } };
        resolvedId = resolved.id;
      } else if (name === "preview_send_customer_link") {
        const recipientName = String(args.recipient_name || "").trim();
        const recipientPhone = String(args.recipient_phone || "").replace(/\D/g, "");
        let existingPendingId = "";
        if (recipientName || recipientPhone) {
          const { data: pendings } = await supabase
            .from("claims_records")
            .select("id, client_name, row_data, status")
            .eq("status", "ממתין למילוי הלקוח")
            .order("created_at", { ascending: false });
          for (const p of pendings || []) {
            const rd = (p.row_data && typeof p.row_data === "object" ? p.row_data : {}) as Record<string, unknown>;
            const pPhone = String(rd.clientPhone || rd.phone || "").replace(/\D/g, "");
            const pName = String(p.client_name || rd.clientName || "").trim();
            if ((recipientPhone && pPhone && recipientPhone === pPhone) || (recipientName && pName && recipientName === pName)) {
              existingPendingId = String(p.id);
              break;
            }
          }
        }
        if (existingPendingId) {
          resolvedId = existingPendingId;
        } else {
          resolvedId = await allocateNextDalClaimId(supabase);
        }
      } else if (name === "preview_create_claim_share_link" && !claimRefStr) {
        const recipientName = String(args.recipient_name || "").trim();
        let matchedId = "";
        if (recipientName) {
          const { data: matched } = await supabase
            .from("claims_records")
            .select("id, client_name")
            .ilike("client_name", `%${recipientName}%`)
            .order("created_at", { ascending: false })
            .limit(1);
          if (matched && matched.length > 0) {
            matchedId = String(matched[0].id);
          }
        }
        if (matchedId) {
          resolvedId = matchedId;
        } else {
          return { result: { error: "נדרש מזהה תיק (claim_ref) לשיתוף מסמכים." } };
        }
      } else if (name !== "preview_send_claim_email") {
        return { result: { error: "נדרש מזהה תיק (claim_ref) לביצוע פעולה זו." } };
      }
      const { claim_ref: _ref, ...rest } = args;
      const res = await executeClaimsTool(name, rest, supabase, resolvedId, userId, userName, attachments);
      const result = res.result && typeof res.result === "object" && !Array.isArray(res.result)
        ? { ...(resolvedId ? { claim_id: resolvedId } : {}), ...(res.result as Record<string, unknown>) }
        : res.result;
      return { ...res, result };
    }

    switch (name) {
      case "get_claims_status_report": {
        return await handleGetClaimsStatusReport(supabase, args, userId, userName, name);
      }

      case "preview_update_claim_fields": {
        const resolved = await resolveClaimRef(supabase, String(args.claim_ref || ""));
        if (!resolved.ok) return { result: { error: resolved.error } };
        return await previewUpdateClaimFields(supabase, resolved.id, args, userId, userName, name);
      }

      case "get_claims_summary": {
        const { data: recs } = await supabase
          .from("claims_records")
          .select("id, status, company_name, row_data, created_at, last_activity_at");

        const activeRecs = (recs || []).filter((r) => {
          const rd = (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>;
          return !rd.deletedAt;
        });

        const statusCounts: Record<string, number> = {};
        const insurerCounts: Record<string, number> = {};
        let needingAttention = 0;
        let todayCount = 0;

        const nowMs = Date.now();
        const sevenDaysAgo = nowMs - (7 * 24 * 60 * 60 * 1000);

        for (const r of activeRecs) {
          const st = r.status || "חדש";
          statusCounts[st] = (statusCounts[st] || 0) + 1;

          const rd = (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>;
          const ins = String(r.company_name || rd.insCompany || "אחר");
          insurerCounts[ins] = (insurerCounts[ins] || 0) + 1;

          if (st.includes("ממתין") || (r.last_activity_at && new Date(r.last_activity_at).getTime() < sevenDaysAgo && st !== "הושלם")) {
            needingAttention += 1;
          }

          if (r.created_at && new Date(r.created_at).getTime() >= new Date(todayStart).getTime()) {
            todayCount += 1;
          }
        }

        const { count: tasksCount } = await supabase
          .from("claims_tasks")
          .select("id", { count: "exact", head: true });

        await recordAiAudit(supabase, {
          userId,
          userName,
          toolName: name,
          actionType: "get_claims_summary",
          status: "success",
        });

        return {
          result: {
            total_active_claims: activeRecs.length,
            claims_opened_today: todayCount,
            claims_needing_attention: needingAttention,
            total_tasks_in_system: tasksCount || 0,
            status_breakdown: statusCounts,
            insurance_company_breakdown: insurerCounts,
          },
        };
      }

      case "count_claims": {
        const filterStatus = String(args.status || "").trim();
        const filterInsurer = String(args.insurance_company || "").trim();
        const todayOnly = Boolean(args.created_today_only);
        const attentionOnly = Boolean(args.needing_attention_only);

        const { data: recs } = await supabase
          .from("claims_records")
          .select("id, status, company_name, row_data, created_at, last_activity_at");

        let filtered = (recs || []).filter((r) => {
          const rd = (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>;
          return !rd.deletedAt;
        });

        if (filterStatus) {
          filtered = filtered.filter((r) => String(r.status || "").toLowerCase().includes(filterStatus.toLowerCase()));
        }
        if (filterInsurer) {
          filtered = filtered.filter((r) => {
            const rd = (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>;
            const ins = String(r.company_name || rd.insCompany || "");
            return ins.toLowerCase().includes(filterInsurer.toLowerCase());
          });
        }
        if (todayOnly) {
          filtered = filtered.filter((r) => r.created_at && new Date(r.created_at).getTime() >= new Date(todayStart).getTime());
        }
        if (attentionOnly) {
          filtered = filtered.filter((r) => String(r.status || "").includes("ממתין"));
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          toolName: name,
          actionType: "count_claims",
          status: "success",
        });

        return {
          result: {
            count: filtered.length,
            applied_filters: {
              status: filterStatus || null,
              insurance_company: filterInsurer || null,
              today_only: todayOnly,
              attention_only: attentionOnly,
            },
          },
        };
      }

      case "get_claims_by_status": {
        const requestedStatus = String(args.status || "").trim();
        const limit = Math.min(Number(args.limit || 15), 50);

        const { data: recs } = await supabase
          .from("claims_records")
          .select("id, plate, client_name, status, company_name, row_data, created_at")
          .order("created_at", { ascending: false });

        const activeRecs = (recs || []).filter((r) => {
          const rd = (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>;
          return !rd.deletedAt;
        });

        if (requestedStatus) {
          const matched = activeRecs.filter((r) =>
            String(r.status || "").toLowerCase().includes(requestedStatus.toLowerCase())
          ).slice(0, limit).map((r) => {
            const rd = (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>;
            return {
              id: r.id,
              claim_num: rd.claimNum || r.id,
              plate: r.plate || rd.plate,
              client: r.client_name || rd.clientName,
              status: r.status,
              insurer: r.company_name || rd.insCompany,
              created_at: r.created_at,
            };
          });

          return {
            result: {
              status_filter: requestedStatus,
              count: matched.length,
              claims: matched,
            },
          };
        }

        // Return group breakdown
        const grouped: Record<string, number> = {};
        for (const r of activeRecs) {
          const st = r.status || "חדש";
          grouped[st] = (grouped[st] || 0) + 1;
        }

        await recordAiAudit(supabase, { userId, userName, claimId: null, toolName: name, actionType: "claims_by_status", status: "success" });
        return {
          result: {
            total_active: activeRecs.length,
            by_status: grouped,
          },
        };
      }

      case "get_claims_created_today": {
        const { data: recs } = await supabase
          .from("claims_records")
          .select("id, plate, client_name, status, company_name, row_data, created_at, created_by_name")
          .gte("created_at", todayStart)
          .order("created_at", { ascending: false });

        const activeRecs = (recs || []).filter((r) => {
          const rd = (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>;
          return !rd.deletedAt;
        }).map((r) => {
          const rd = (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>;
          return {
            id: r.id,
            claim_num: rd.claimNum || r.id,
            plate: r.plate || rd.plate,
            client: r.client_name || rd.clientName,
            status: r.status,
            insurer: r.company_name || rd.insCompany,
            opened_at: r.created_at,
            opened_by: r.created_by_name,
          };
        });

        await recordAiAudit(supabase, {
          userId,
          userName,
          toolName: name,
          actionType: "get_claims_created_today",
          status: "success",
        });

        return {
          result: {
            count_today: activeRecs.length,
            claims: activeRecs,
          },
        };
      }

      case "get_recent_claims": {
        const limit = Math.min(Number(args.limit || 5), 20);

        const { data: recs } = await supabase
          .from("claims_records")
          .select("id, plate, client_name, status, company_name, row_data, created_at, assigned_to_name")
          .order("created_at", { ascending: false })
          .limit(limit * 2);

        const activeRecs = (recs || []).filter((r) => {
          const rd = (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>;
          return !rd.deletedAt;
        }).slice(0, limit).map((r) => {
          const rd = (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>;
          return {
            id: r.id,
            claim_num: rd.claimNum || r.id,
            plate: r.plate || rd.plate,
            client: r.client_name || rd.clientName,
            status: r.status,
            insurer: r.company_name || rd.insCompany,
            assigned_to: r.assigned_to_name || "לא משויך",
            created_at: r.created_at,
          };
        });

        await recordAiAudit(supabase, {
          userId,
          userName,
          toolName: name,
          actionType: "get_recent_claims",
          status: "success",
        });

        return {
          result: {
            count: activeRecs.length,
            claims: activeRecs,
          },
        };
      }

      case "get_claims_needing_attention": {
        const limit = Math.min(Number(args.limit || 10), 20);

        const { data: recs } = await supabase
          .from("claims_records")
          .select("id, plate, client_name, status, company_name, row_data, last_activity_at, created_at")
          .order("created_at", { ascending: false });

        const nowMs = Date.now();
        const attentionList: Array<Record<string, unknown>> = [];

        for (const r of recs || []) {
          const rd = (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>;
          if (rd.deletedAt) continue;

          const st = r.status || "חדש";
          const reasons: string[] = [];

          if (st === "ממתין למסמכים") reasons.push("ממתין להשלמת מסמכים מהלקוח/מוסך");
          else if (st === "ממתין לשמאי") reasons.push("ממתין לשומה או דוח שמאי");
          else if (st === "ממתין לביטוח") reasons.push("ממתין למענה/אישור מחברת הביטוח");

          if (r.last_activity_at) {
            const daysSinceActivity = (nowMs - new Date(r.last_activity_at).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceActivity > 5 && st !== "הושלם") {
              reasons.push(`ללא פעילות מעל ${Math.round(daysSinceActivity)} ימים`);
            }
          }

          if (reasons.length > 0) {
            attentionList.push({
              id: r.id,
              claim_num: rd.claimNum || r.id,
              plate: r.plate || rd.plate,
              client: r.client_name || rd.clientName,
              status: st,
              insurer: r.company_name || rd.insCompany,
              attention_reasons: reasons,
              last_activity: r.last_activity_at,
            });
          }
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          toolName: name,
          actionType: "get_claims_needing_attention",
          status: "success",
        });

        return {
          result: {
            total_needing_attention: attentionList.length,
            claims: attentionList.slice(0, limit),
          },
        };
      }

      case "get_open_tasks_summary": {
        const { data: tasks } = await supabase
          .from("claims_tasks")
          .select("id, claim_id, row_data, created_at")
          .order("created_at", { ascending: false });

        const openList: Array<Record<string, unknown>> = [];
        for (const t of tasks || []) {
          const rd = (t.row_data && typeof t.row_data === "object" ? t.row_data : {}) as Record<string, unknown>;
          if (String(rd.done || "").toLowerCase() === "true" || String(rd.workStatus || "").toLowerCase() === "done") {
            continue;
          }
          openList.push({
            id: t.id,
            claim_id: t.claim_id,
            action: rd.action || "משימה",
            source: rd.source || "ידני",
            note: rd.note || "",
            created_at: t.created_at,
          });
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          toolName: name,
          actionType: "get_open_tasks_summary",
          status: "success",
        });

        return {
          result: {
            total_open_tasks: openList.length,
            tasks: openList.slice(0, 20),
          },
        };
      }

      case "get_today_claim_activity": {
        const { data: hist } = await supabase
          .from("claims_history")
          .select("id, claim_id, row_data, created_at")
          .gte("created_at", todayStart)
          .order("created_at", { ascending: false })
          .limit(25);

        const timeline = (hist || []).map((h) => {
          const rd = (h.row_data && typeof h.row_data === "object" ? h.row_data : {}) as Record<string, unknown>;
          return {
            id: h.id,
            claim_id: h.claim_id,
            action: rd.action || "פעולה",
            by: rd.by || "מערכת",
            note: rd.note || "",
            time: rd.at || h.created_at,
          };
        });

        await recordAiAudit(supabase, {
          userId,
          userName,
          toolName: name,
          actionType: "get_today_claim_activity",
          status: "success",
        });

        return {
          result: {
            activity_count_today: timeline.length,
            timeline,
          },
        };
      }

      case "count_today_incoming_emails": {
        const { count } = await supabase
          .from("claims_gmail_imports")
          .select("id", { count: "exact", head: true })
          .gte("created_at", todayStart);

        await recordAiAudit(supabase, {
          userId,
          userName,
          toolName: name,
          actionType: "count_today_incoming_emails",
          status: "success",
        });

        return {
          result: {
            incoming_emails_today: count || 0,
            date: new Date().toLocaleDateString("he-IL"),
          },
        };
      }

      case "count_today_outgoing_emails": {
        const { count } = await supabase
          .from("claims_gmail_outbox")
          .select("id", { count: "exact", head: true })
          .gte("created_at", todayStart);

        await recordAiAudit(supabase, {
          userId,
          userName,
          toolName: name,
          actionType: "count_today_outgoing_emails",
          status: "success",
        });

        return {
          result: {
            outgoing_emails_today: count || 0,
            date: new Date().toLocaleDateString("he-IL"),
          },
        };
      }

      case "get_today_claim_emails": {
        const limit = Math.min(Number(args.limit || 20), 40);

        const { data: imp } = await supabase
          .from("claims_gmail_imports")
          .select("id, claim_id, from_addr, to_addr, subject, sent_at, created_at, attachment_count")
          .gte("created_at", todayStart)
          .order("created_at", { ascending: false });

        const { data: out } = await supabase
          .from("claims_gmail_outbox")
          .select("id, claim_id, to_addr, subject, sent_at, created_at, status")
          .gte("created_at", todayStart)
          .order("created_at", { ascending: false });

        const { data: pends } = await supabase
          .from("claims_gmail_pending")
          .select("id, gmail_message_id, from_addr, subject, snippet, sent_at, created_at, assigned_claim_id")
          .gte("created_at", todayStart)
          .order("created_at", { ascending: false });

        const seenMids = new Set<string>([
          ...(imp || []).map((m) => String(m.id || "")),
          ...(out || []).map((m) => String(m.id || "")),
        ]);

        const pendingToday = (pends || [])
          .filter((p) => !seenMids.has(p.id) && !seenMids.has(p.gmail_message_id))
          .map((p) => {
            const from = String(p.from_addr || "");
            const isUserSend = from.includes("yoni122222") || from.includes("yoni atias") || from.toLowerCase().includes("atias");
            return {
              id: p.id,
              direction: isUserSend ? "outbound" : "inbound",
              claim_id: p.assigned_claim_id || null,
              from: isUserSend ? CLAIMS_SENDER_NAME : p.from_addr,
              to: isUserSend ? "נמען ב-Gmail" : CLAIMS_SENDER_NAME,
              subject: p.subject,
              time: p.sent_at || p.created_at,
              status: isUserSend ? "נשלח מ-Gmail (ממתין לסנכרון בתיק)" : "התקבל ב-Gmail (ממתין לסנכרון בתיק)",
              attachments: 0,
            };
          });

        const allEmails = [
          ...(imp || []).map((m) => ({
            id: m.id,
            direction: "inbound",
            claim_id: m.claim_id,
            from: m.from_addr,
            to: m.to_addr,
            subject: m.subject,
            time: m.sent_at || m.created_at,
            attachments: m.attachment_count || 0,
          })),
          ...(out || []).map((m) => ({
            id: m.id,
            direction: "outbound",
            claim_id: m.claim_id,
            from: CLAIMS_SENDER_NAME,
            to: m.to_addr,
            subject: m.subject,
            time: m.sent_at || m.created_at,
            status: m.status,
          })),
          ...pendingToday,
        ].sort((a, b) => new Date(String(b.time || "")).getTime() - new Date(String(a.time || "")).getTime());

        await recordAiAudit(supabase, {
          userId,
          userName,
          toolName: name,
          actionType: "get_today_claim_emails",
          status: "success",
        });

        return {
          result: {
            total_today: allEmails.length,
            emails: allEmails.slice(0, limit),
          },
        };
      }

      case "get_unhandled_claim_emails": {
        const { data: imp } = await supabase
          .from("claims_gmail_imports")
          .select("id, claim_id, from_addr, to_addr, subject, snippet, body_text, sent_at, created_at")
          .order("created_at", { ascending: false })
          .limit(30);

        const { data: out } = await supabase
          .from("claims_gmail_outbox")
          .select("claim_id");

        const repliedClaimIds = new Set((out || []).map((o) => o.claim_id).filter(Boolean));

        const unhandled = (imp || []).filter((m) => !repliedClaimIds.has(m.claim_id)).slice(0, 15).map((m) => ({
          id: m.id,
          claim_id: m.claim_id,
          from: m.from_addr,
          subject: m.subject,
          snippet: m.snippet || (m.body_text || "").slice(0, 150),
          received_at: m.sent_at || m.created_at,
        }));

        await recordAiAudit(supabase, {
          userId,
          userName,
          toolName: name,
          actionType: "get_unhandled_claim_emails",
          status: "success",
        });

        return {
          result: {
            unhandled_count: unhandled.length,
            emails: unhandled,
          },
        };
      }

      case "search_claims": {
        const q = String(args.query || "").trim().toLowerCase();
        if (!q) {
          return { result: { error: "יש לציין מחרוזת חיפוש (query)" } };
        }

        const { data: recs } = await supabase
          .from("claims_records")
          .select("id, plate, client_name, status, company_name, row_data, created_at")
          .order("created_at", { ascending: false });

        const matched = (recs || []).filter((r) => {
          const rd = (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>;
          if (rd.deletedAt) return false;

          const idMatch = String(r.id || "").toLowerCase().includes(q);
          const plateMatch = String(r.plate || rd.plate || "").toLowerCase().includes(q);
          const clientMatch = String(r.client_name || rd.clientName || "").toLowerCase().includes(q);
          const insMatch = String(r.company_name || rd.insCompany || "").toLowerCase().includes(q);
          const carMatch = String(rd.carModel || rd.carMake || "").toLowerCase().includes(q);
          const policyMatch = String(rd.policyNum || "").toLowerCase().includes(q);
          const surveyorMatch = String(rd.surveyor || "").toLowerCase().includes(q);

          return idMatch || plateMatch || clientMatch || insMatch || carMatch || policyMatch || surveyorMatch;
        }).slice(0, 15).map((r) => {
          const rd = (r.row_data && typeof r.row_data === "object" ? r.row_data : {}) as Record<string, unknown>;
          return {
            id: r.id,
            claim_num: rd.claimNum || r.id,
            plate: r.plate || rd.plate,
            client: r.client_name || rd.clientName,
            status: r.status,
            insurer: r.company_name || rd.insCompany,
            car_model: rd.carModel,
            policy_num: rd.policyNum,
            created_at: r.created_at,
          };
        });

        await recordAiAudit(supabase, {
          userId,
          userName,
          toolName: name,
          actionType: "search_claims",
          userPrompt: q,
          status: "success",
        });

        return {
          result: {
            query: q,
            matches_count: matched.length,
            claims: matched,
          },
        };
      }

      case "check_claim_and_customer_duplicates": {
        const dupResult = await checkDuplicatesHelper(supabase, {
          client_name: String(args.client_name || ""),
          client_phone: String(args.client_phone || ""),
          client_email: String(args.client_email || ""),
          business_id: String(args.business_id || ""),
          plate: String(args.plate || ""),
          claim_number: String(args.claim_number || ""),
        });

        await recordAiAudit(supabase, {
          userId,
          userName,
          toolName: name,
          actionType: "check_duplicates",
          status: "success",
        });

        return { result: dupResult };
      }

      case "preview_create_claim_from_onboarding": {
        return await handlePreviewCreateClaimFromOnboarding(supabase, args, userId, userName, attachments);
      }

      default:
        return { result: { error: `כלי כללי לא מוכר: ${name}` } };
    }
  } catch (err) {
    console.error("executeClaimsGeneralTool error:", err);
    return {
      result: { error: err instanceof Error ? err.message : "שגיאה בביצוע הכלי הכללי" },
    };
  }
}

// -------------------------------------------------------------
// 7. EXECUTION OF CONFIRMED PENDING ACTIONS
// -------------------------------------------------------------
export async function executeClaimsPendingAction(
  supabase: ReturnType<typeof createClient>,
  claimIdOrPendingAction: string | ClaimsPendingAction,
  userIdOrPendingAction: string | ClaimsPendingAction,
  userNameOrUserId?: string,
  maybePendingActionOrUserName?: ClaimsPendingAction | string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    let claimId = "";
    let userId = "";
    let userName = "";
    let pendingAction: ClaimsPendingAction;

    if (claimIdOrPendingAction && typeof claimIdOrPendingAction === "object" && "action_type" in claimIdOrPendingAction) {
      pendingAction = claimIdOrPendingAction as ClaimsPendingAction;
      userId = String(userIdOrPendingAction || "");
      userName = String(userNameOrUserId || "");
      claimId = String(maybePendingActionOrUserName || (pendingAction.parameters as any)?.claim_id || "");
    } else {
      claimId = String(claimIdOrPendingAction || "");
      userId = String(userIdOrPendingAction || "");
      userName = String(userNameOrUserId || "");
      pendingAction = (maybePendingActionOrUserName || {}) as ClaimsPendingAction;
    }

    if (!claimId && (pendingAction?.parameters as any)?.claim_id) {
      claimId = String((pendingAction.parameters as any).claim_id);
    }

    const { action_type, parameters, summary } = pendingAction;

    // A card always runs on the claim it was prepared for, never on another one.
    const cardClaim = String((parameters as Record<string, unknown> | undefined)?.claim_id || "");
    if (cardClaim && claimId && cardClaim !== claimId) {
      return { success: false, message: "הפעולה לא בוצעה: כרטיס האישור שייך לתיק אחר.", error: "claim_mismatch" };
    }

    switch (action_type) {
      case "send_email": {
        const { to, cc, bcc, subject, body, file_ids, attachment_titles } = parameters as {
          to: string;
          cc?: string | null;
          bcc?: string | null;
          subject: string;
          body: string;
          file_ids?: string[];
          attachment_titles?: string[];
        };
        const threadId = String((parameters as Record<string, unknown>).thread_id || "").trim();

        // Stable per approval card: the same card can never produce two real emails (claims-gmail answers 409 already_sent).
        const cardKey = String(pendingAction.preview_id || "").replace(/[^A-Za-z0-9_-]/g, "");
        const idempotencyKey = cardKey.length >= 6
          ? `AIAPPR-${claimId || "GEN"}-${cardKey}`
          : `IDEMP-${Date.now()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;

        const res = await supabase.functions.invoke("claims-gmail", {
          body: {
            action: "send_claim",
            claim_id: claimId || undefined,
            to,
            cc: cc || undefined,
            bcc: bcc || undefined,
            subject,
            body,
            ...(threadId ? { thread_id: threadId } : {}),
            file_ids: file_ids || [],
            idempotency_key: idempotencyKey,
            confirm: true,
          },
        });

        if (res.error || !res.data?.success || res.data?.realEmailSend !== true) {
          let errCode = String(res.data?.error || "");
          if (!errCode && res.error) {
            try {
              const ctx = (res.error as any).context;
              if (ctx) {
                const j = typeof ctx.json === "function" ? await ctx.clone().json().catch(() => null) : null;
                if (j) {
                  errCode = String(j.error || j.code || "");
                }
              }
            } catch (_) { /* keep generic message */ }
          }
          const knownSendErrors: Record<string, string> = {
            already_sent: "המייל הזה כבר נשלח (אישור כפול נחסם, לא נשלח מייל נוסף)",
            send_in_progress: "שליחה של המייל הזה כבר מתבצעת כעת",
            send_disabled: "השליחה כבויה כרגע בהגדרות Gmail של ניהול התביעות",
            forbidden_claim: "אין הרשאה לשלוח מתיק זה",
            files_not_on_claim: "אחד הקבצים שנבחרו אינו שייך לתיק",
            package_too_large: "הקבצים המצורפים גדולים מדי למייל אחד",
            WORKER_RESOURCE_LIMIT: "נפח הקבצים המצורפים חרג ממגבלת משאבי השרת לשליחה בודדת. יש לבחור פחות קבצים או לשלוח כקישור שיתוף.",
            internal_content_blocked: "תוכן המייל כולל מידע פנימי ונחסם",
            subject_required: "חסר נושא למייל",
            body_required: "חסר תוכן למייל",
          };
          const rawErr = errCode || res.error?.message || String(res.data?.message || "");
          const gmailAuthExpired = /expired or revoked|invalid_grant|invalid_token|not_connected|gmail_not_connected|reauth/i.test(rawErr);
          const errMsg = gmailAuthExpired
            ? "חיבור ה-Gmail של ניהול התביעות פג תוקף או בוטל ב-Google. יש לחבר מחדש את החשבון במסך הגדרות Gmail בניהול התביעות (חיבור מחדש בלחיצה אחת). לא נשלח מייל."
            : (knownSendErrors[errCode] || rawErr || "שליחת המייל דרך Gmail נכשלה");
          await recordAiAudit(supabase, {
            userId,
            userName,
            claimId,
            toolName: "preview_send_claim_email",
            actionType: "send_email",
            previewSummary: summary,
            previewPayload: parameters,
            approvedBy: userId,
            approvedByName: userName,
            executionAction: "send_email",
            status: "failed",
            errorMessage: errMsg,
          });
          return { success: false, message: `המייל לא נשלח: ${errMsg}`, error: errMsg };
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: "preview_send_claim_email",
          actionType: "send_email",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "send_email",
          status: "executed",
        });

        const msgId = res.data?.message_id || res.data?.gmail_message_id || "";
        const recipientsSummary = [
          `אל ${to}`,
          cc ? `CC: ${cc}` : null,
          bcc ? `BCC: ${bcc}` : null,
        ].filter(Boolean).join(" · ");
        const isFullMatch = res.data?.is_full_match !== false;
        const verifiedCount = res.data?.verified_count ?? (file_ids || []).length;
        const requestedCount = res.data?.requested_count ?? (file_ids || []).length;
        const missingList = Array.isArray(res.data?.missing_files) && res.data.missing_files.length
          ? ` (חסרים ב-Gmail: ${res.data.missing_files.join(", ")})`
          : "";
        const matchWarning = !isFullMatch
          ? ` ⚠️ אזהרה: אומתו ב-Gmail רק ${verifiedCount} מתוך ${requestedCount} קבצים שהתבקשו!${missingList}`
          : "";
        return {
          success: true,
          message: `המייל נשלח (${recipientsSummary})${verifiedCount ? ` עם ${verifiedCount} קבצים מאומתים ב-Gmail` : " ללא קבצים מצורפים"}${matchWarning}${msgId ? ` (מזהה Gmail: ${msgId})` : ""}`,
        };
      }

      case "import_claim_email": {
        const targetClaimId = claimId || String((parameters as Record<string, unknown>)?.claim_id || "");
        const messageId = String((parameters as Record<string, unknown>)?.message_id || "");
        if (!targetClaimId) return { success: false, message: "חסר מזהה תיק לשיוך המייל", error: "missing_claim_id" };
        if (!messageId) return { success: false, message: "חסר מזהה הודעת Gmail לייבוא", error: "missing_message_id" };

        let start = Number((parameters as Record<string, unknown>)?.start || 0);
        let totalImported = 0;
        let totalFound = 0;
        let totalSkipped = 0;
        let totalFailed = 0;
        let done = false;

        // Loop in chunks of 12 (BATCH) up to 40 steps = up to 480 files
        for (let step = 0; step < 40; step++) {
          const res = await supabase.functions.invoke("claims-gmail", {
            body: {
              action: "import_message",
              claim_id: targetClaimId,
              message_id: messageId,
              allow_reassign: true,
              start,
            },
          });

          if (res.error || !res.data?.success) {
            const err = res.data?.error || res.error?.message || "import_failed";
            await recordAiAudit(supabase, {
              userId,
              userName,
              claimId: targetClaimId,
              toolName: "preview_import_claim_email",
              actionType: "import_claim_email",
              previewSummary: summary,
              previewPayload: parameters,
              approvedBy: userId,
              approvedByName: userName,
              executionAction: "import_claim_email",
              status: "failed",
              errorMessage: String(err),
            });
            return {
              success: false,
              message: `ייבוא הנספחים נתקל בשגיאה (יובאו ${totalImported} קבצים עד כה): ${err}`,
              error: String(err),
            };
          }

          totalFound = Number(res.data.found || totalFound);
          totalImported = Number(res.data.imported || totalImported);
          totalSkipped += Number(res.data.skippedExisting || 0);
          totalFailed = Number(res.data.failed || 0);
          done = res.data.done === true;

          if (done) break;
          start = Number(res.data.start || (start + 12));
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId: targetClaimId,
          toolName: "preview_import_claim_email",
          actionType: "import_claim_email",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "import_claim_email",
          status: "executed",
        });

        const detailMsg = `ייבוא המייל והמסמכים לתיק ${targetClaimId} הושלם בהצלחה: נמצאו ${totalFound} קבצים, יובאו ${totalImported} קבצים חדשים${totalSkipped ? ` (${totalSkipped} קבצים כפולים דולגו)` : ""}${totalFailed ? ` (${totalFailed} נכשלו)` : ""}. כל הקבצים שויכו לתיק.`;
        return {
          success: true,
          message: detailMsg,
        };
      }

      case "batch_send_email": {
        const actions = ((parameters as Record<string, unknown>)?.actions as ClaimsPendingAction[]) || [];
        if (!actions.length) {
          return { success: false, message: "לא סופקו הודעות לשליחה בקבוצה", error: "empty_batch" };
        }

        const results: Array<{ claim_id?: string; to: string; success: boolean; message?: string; error?: string }> = [];
        let successCount = 0;
        let failCount = 0;

        for (const act of actions) {
          const actClaim = String((act.parameters as any)?.claim_id || claimId || "");
          const actTo = String((act.parameters as any)?.to || "");
          const res = await executeClaimsPendingAction(
            supabase,
            actClaim,
            userId,
            userName,
            act
          );
          if (res.success) {
            successCount++;
            results.push({ claim_id: actClaim, to: actTo, success: true, message: res.message });
          } else {
            failCount++;
            results.push({ claim_id: actClaim, to: actTo, success: false, error: res.error || res.message });
          }
        }

        if (failCount === 0) {
          return {
            success: true,
            message: `כל ${successCount} האימיילים נשלחו בהצלחה ובנפרד: ${results.map(r => `${r.claim_id ? `תיק ${r.claim_id}` : "כללי"} אל ${r.to}`).join("; ")}.`,
          };
        } else if (successCount > 0) {
          const failedDetails = results.filter(r => !r.success).map(r => `${r.claim_id ? `תיק ${r.claim_id}` : "כללי"} אל ${r.to}: ${r.error}`).join("; ");
          return {
            success: false,
            message: `נשלחו בהצלחה ${successCount} מתוך ${actions.length} אימיילים. ${failCount} אימיילים נכשלו: ${failedDetails}. (האימיילים שהצליחו לא יישלחו שוב).`,
            error: "partial_failure",
          };
        } else {
          const failedDetails = results.map(r => `${r.claim_id ? `תיק ${r.claim_id}` : "כללי"} אל ${r.to}: ${r.error}`).join("; ");
          return {
            success: false,
            message: `כל ${failCount} האימיילים נכשלו בשליחה: ${failedDetails}`,
            error: "all_failed",
          };
        }
      }

      case "schedule_email": {
        const { to, cc, bcc, subject, body, file_ids, attachment_titles, send_at, send_at_label } = parameters as {
          to: string;
          cc?: string | null;
          bcc?: string | null;
          subject: string;
          body: string;
          file_ids?: string[];
          attachment_titles?: string[];
          send_at: string;
          send_at_label: string;
        };
        const threadId = String((parameters as Record<string, unknown>).thread_id || "").trim();

        if (!send_at) {
          return { success: false, message: "חסר מועד שליחה מתוזמן", error: "missing_send_at" };
        }

        const remId = newId("REM");
        const jobNid = newId("MJB");
        const filesArray = Array.isArray(file_ids) ? file_ids : [];
        const titlesArray = Array.isArray(attachment_titles) ? attachment_titles : [];
        const plannedAt = send_at;
        const sendLabel = send_at_label || plannedAt;

        const { error: remErr } = await supabase.from("claims_reminders").insert({
          id: remId,
          claim_id: claimId || null,
          action: "send_email",
          mail_kind: "email_once",
          mail_to: to,
          mail_subject: subject,
          mail_body: body,
          attach_mode: filesArray.length > 0 ? "received" : "none",
          next_run_at: plannedAt,
          status: "scheduled",
          created_by: userId,
          row_data: {
            action: "send_email",
            purpose: "scheduled_send",
            scheduled_at_label: sendLabel,
            note: subject,
            owner: userName,
            sent: "false",
            mail_to: to,
            mail_cc: cc || null,
            mail_bcc: bcc || null,
            file_ids: filesArray.join(","),
            attachment_titles: titlesArray,
            thread_id: threadId || null,
            pre_approved: true,
            pre_approved_by: userName || userId,
            pre_approved_at: new Date().toISOString(),
          },
        });

        if (remErr) {
          return { success: false, message: `שגיאה בשמירת התזמון: ${remErr.message}`, error: remErr.message };
        }

        const { error: jobErr } = await supabase.from("claims_mail_jobs").insert({
          id: jobNid,
          reminder_id: remId,
          claim_id: claimId || null,
          planned_at: plannedAt,
          status: "pending",
        });

        if (jobErr) {
          await supabase.from("claims_reminders").delete().eq("id", remId);
          return { success: false, message: `שגיאה ביצירת משימת התזמון: ${jobErr.message}`, error: jobErr.message };
        }

        if (claimId) {
          await supabase.from("claims_history").insert({
            id: newId("HIS"),
            claim_id: claimId,
            row_data: {
              action: "תוזמן אימייל לשליחה עתידית",
              note: `אל: ${to} · מועד שליחה: ${sendLabel} · נושא: "${subject}" · ${filesArray.length} קבצים מצורפים`,
              type: "mail_scheduled",
              by: userName || userId,
              at: new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }),
              reminder_id: remId,
              planned_at: plannedAt,
            },
          });
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: "preview_send_claim_email",
          actionType: "schedule_email",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "schedule_email",
          status: "executed",
        });

        return {
          success: true,
          message: `האימייל תוזמן בהצלחה לשליחה ב-${sendLabel}. האישור נשמר סופית בשרת והמערכת תשלח אותו אוטומטית במועד זה ללא צורך באישור נוסף. (מזהה תזמון: ${remId})`,
        };
      }

      case "batch_schedule_email": {
        const actions = ((parameters as Record<string, unknown>)?.actions as ClaimsPendingAction[]) || [];
        if (!actions.length) {
          return { success: false, message: "לא סופקו הודעות לתזמון בקבוצה", error: "empty_batch" };
        }

        const results: Array<{ claim_id?: string; to: string; success: boolean; message?: string; error?: string }> = [];
        let successCount = 0;
        let failCount = 0;

        for (const act of actions) {
          const actClaim = String((act.parameters as any)?.claim_id || claimId || "");
          const actTo = String((act.parameters as any)?.to || "");
          const res = await executeClaimsPendingAction(
            supabase,
            actClaim,
            userId,
            userName,
            act,
          );
          if (res.success) {
            successCount++;
            results.push({ claim_id: actClaim, to: actTo, success: true, message: res.message });
          } else {
            failCount++;
            results.push({ claim_id: actClaim, to: actTo, success: false, error: res.error || res.message });
          }
        }

        if (failCount === 0) {
          return {
            success: true,
            message: `כל ${successCount} האימיילים תוזמנו בהצלחה: ${results.map((r) => `${r.claim_id ? `תיק ${r.claim_id}` : "כללי"} אל ${r.to}`).join("; ")}. הם יישלחו אוטומטית במועדם ללא צורך באישור נוסף.`,
          };
        } else if (successCount > 0) {
          const failedDetails = results.filter((r) => !r.success).map((r) => `${r.claim_id ? `תיק ${r.claim_id}` : "כללי"} אל ${r.to}: ${r.error}`).join("; ");
          return {
            success: false,
            message: `תוזמנו בהצלחה ${successCount} מתוך ${actions.length} אימיילים. ${failCount} אימיילים נכשלו: ${failedDetails}.`,
            error: "partial_failure",
          };
        } else {
          const failedDetails = results.map((r) => `${r.claim_id ? `תיק ${r.claim_id}` : "כללי"} אל ${r.to}: ${r.error}`).join("; ");
          return {
            success: false,
            message: `כל ${failCount} האימיילים נכשלו בתזמון: ${failedDetails}`,
            error: "all_failed",
          };
        }
      }

      case "cancel_scheduled_email": {
        const { reminder_id, reason } = parameters as { reminder_id: string; reason?: string };
        const remId = String(reminder_id || "").trim();
        if (!remId) return { success: false, message: "חסר מזהה תזכורת לביטול", error: "missing_id" };

        const { data: rem, error: fetchErr } = await supabase
          .from("claims_reminders")
          .select("id, claim_id, mail_to, mail_subject, status, row_data")
          .eq("id", remId)
          .maybeSingle();

        if (fetchErr || !rem) return { success: false, message: "האימייל המתוזמן לא נמצא במערכת", error: "not_found" };
        if (rem.status !== "scheduled") {
          return { success: false, message: `האימייל אינו בסטטוס מתוזמן (סטטוס נוכחי: ${rem.status})`, error: "not_scheduled" };
        }

        const targetClaim = rem.claim_id || claimId || null;
        const nowIso = new Date().toISOString();

        await supabase
          .from("claims_reminders")
          .update({ status: "cancelled", cancelled_at: nowIso, cancelled_by: userId })
          .eq("id", remId);

        await supabase
          .from("claims_mail_jobs")
          .update({ status: "cancelled", finished_at: nowIso, fail_reason: "user_cancelled" })
          .eq("reminder_id", remId)
          .in("status", ["pending", "sending"]);

        if (targetClaim) {
          await supabase.from("claims_history").insert({
            id: newId("HIS"),
            claim_id: targetClaim,
            row_data: {
              action: "בוטל אימייל מתוזמן",
              note: `בוטלה שליחת אימייל מתוזמן אל ${rem.mail_to} בנושא "${rem.mail_subject}"${reason ? ` · סיבה: ${reason}` : ""}`,
              type: "mail_cancelled",
              by: userName || userId,
              at: new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }),
              reminder_id: remId,
            },
          });
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId: targetClaim,
          toolName: "preview_cancel_scheduled_claim_email",
          actionType: "cancel_scheduled_email",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "cancel_scheduled_email",
          status: "executed",
        });

        return {
          success: true,
          message: `האימייל המתוזמן אל ${rem.mail_to} (מזהה ${remId}) בוטל בהצלחה ולא יישלח.`,
        };
      }

      case "send_customer_link":
      case "send_customer_intake_link":
      case "send_customer_upload_link": {
        const { claim_id, recipient_name, recipient_phone, recipient_email, channel, custom_message, link_type, intake_url, upload_url, wa_link } = parameters as {
          claim_id?: string | null;
          recipient_name?: string | null;
          recipient_phone?: string | null;
          recipient_email?: string | null;
          channel?: string | null;
          custom_message?: string | null;
          link_type?: string;
          intake_url?: string | null;
          upload_url?: string | null;
          wa_link?: string | null;
        };

        const targetClaimId = String(claim_id || claimId || "").trim() || (await allocateNextDalClaimId(supabase));
        const clientName = recipient_name || "לקוח יקר";
        const selectedChannel = String(channel || "copy").toLowerCase();
        const effectiveLinkType = String(link_type || (name === "send_customer_upload_link" ? "upload" : "intake")).toLowerCase();
        const cleanPhone = String(recipient_phone || "").replace(/\D/g, "");

        // 1. Ensure claim record exists in claims_records with status 'ממתין למילוי הלקוח'
        const { data: existingClaim } = await supabase
          .from("claims_records")
          .select("id, status, client_name, row_data")
          .eq("id", targetClaimId)
          .maybeSingle();

        const nowIso = new Date().toISOString();
        if (!existingClaim) {
          await supabase.from("claims_records").insert({
            id: targetClaimId,
            status: "ממתין למילוי הלקוח",
            client_name: recipient_name || "ממתין לפרטי לקוח",
            company_name: null,
            plate: "",
            created_by: userId,
            created_by_name: userName,
            updated_by: userId,
            updated_by_name: userName,
            created_at: nowIso,
            last_activity_at: nowIso,
            row_data: {
              id: targetClaimId,
              status: "ממתין למילוי הלקוח",
              clientName: recipient_name || "",
              clientPhone: recipient_phone || "",
              clientEmail: recipient_email || "",
              createdAt: nowIso,
              source: "dalia_ai_customer_link",
            },
          });
        }

        let finalIntakeUrl = intake_url || "";
        let finalUploadUrl = upload_url || "";
        let finalWaLink = wa_link || "";
        let emailSentStatus = "";

        if (effectiveLinkType === "upload") {
          // Upload link only!
          if (!finalUploadUrl) {
            const docsRes = await supabase.functions.invoke("claims-docs", {
              body: { action: "create_link", claim_id: targetClaimId },
            });
            if (docsRes.data?.token) {
              finalUploadUrl = `https://orin1607-ctrl.github.io/future-craft-core/claims-upload?t=${encodeURIComponent(docsRes.data.token)}`;
            }
          }
          const defaultWaText = custom_message || `שלום ${clientName},\nלהעלאת מסמכים ותמונות עבור תיק תביעה ${targetClaimId} באורן קאר, היכנס/י לקישור המאובטח:\n${finalUploadUrl}`;
          if (!finalWaLink) {
            finalWaLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(defaultWaText)}` : `https://wa.me/?text=${encodeURIComponent(defaultWaText)}`;
          }

          if ((selectedChannel === "email" || selectedChannel === "both") && recipient_email) {
            const emailSubject = `קישור להעלאת מסמכים - תיק תביעה ${targetClaimId} - דליה ניהול תביעות`;
            const emailBody = [
              `שלום ${clientName},`,
              ``,
              custom_message || `נפתח עבורך תיק תביעה ${targetClaimId} באורן קאר.`,
              `להעלאת מסמכים ותמונות הדרושים לטיפול בתביעה, אנא היכנס/י לקישור המאובטח:`,
              ``,
              finalUploadUrl,
              ``,
              `הקישור מאובטח ובתוקף ל-24 שעות.`,
              ``,
              `בברכה,`,
              `דליה ניהול תביעות - אורן קאר`,
            ].join("\n");

            const mailRes = await supabase.functions.invoke("claims-gmail", {
              body: {
                action: "send_claim",
                claim_id: targetClaimId,
                to: recipient_email,
                subject: emailSubject,
                body: emailBody,
                idempotency_key: `CUSTUP-${targetClaimId}-${Date.now()}`,
                confirm: true,
              },
            });
            if (mailRes.data?.success && mailRes.data?.realEmailSend === true) {
              emailSentStatus = `ונשלח בהצלחה באימייל אל ${recipient_email}`;
            } else {
              emailSentStatus = `(הקישור נוצר, אך שליחת המייל ל-${recipient_email} נכשלה)`;
            }
          }

          await supabase.from("claims_history").insert({
            id: newId("HIS"),
            claim_id: targetClaimId,
            row_data: {
              action: "נוצר קישור העלאת מסמכים ללקוח",
              note: `קישור להעלאת מסמכים עבור ${clientName} (תיק ${targetClaimId})${emailSentStatus ? ` ${emailSentStatus}` : ""}`,
              type: "customer_upload_link_created",
              by: userName || "דליה AI",
              at: new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }),
            },
          });

          await recordAiAudit(supabase, {
            userId,
            userName,
            claimId: targetClaimId,
            toolName: "preview_send_customer_link",
            actionType: "send_customer_upload_link",
            previewSummary: summary,
            previewPayload: parameters,
            approvedBy: userId,
            approvedByName: userName,
            executionAction: "send_customer_upload_link",
            status: "executed",
          });

          const lines = [
            `✅ קישור להעלאת מסמכים הוכן בהצלחה עבור ${clientName}!`,
            `📁 **מספר תיק:** ${targetClaimId}`,
            `📤 **קישור ישיר להעלאת מסמכים:** ${finalUploadUrl}`,
          ];
          if (emailSentStatus) lines.push(`📧 ${emailSentStatus}`);
          if (finalWaLink) lines.push(`💬 **WhatsApp:** [פתיחה ושליחה ב-WhatsApp](${finalWaLink})`);

          return {
            success: true,
            message: lines.join("\n"),
            claim_id: targetClaimId,
            upload_url: finalUploadUrl,
            wa_link: finalWaLink,
          };
        } else {
          // Intake link only!
          if (!finalIntakeUrl) {
            const intakeRes = await supabase.functions.invoke("claims-intake", {
              body: { action: "create_link", claim_id: targetClaimId },
            });
            if (intakeRes.data?.token) {
              finalIntakeUrl = `https://orin1607-ctrl.github.io/future-craft-core/claims-intake?t=${encodeURIComponent(intakeRes.data.token)}`;
            }
          }
          const defaultWaText = customMessage || `שלום ${clientName},\nנפתח עבורך תיק תביעה ${targetClaimId} באורן קאר. למילוי טופס פתיחת התיק היכנס/י לקישור המאובטח:\n${finalIntakeUrl}`;
          if (!finalWaLink) {
            finalWaLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(defaultWaText)}` : `https://wa.me/?text=${encodeURIComponent(defaultWaText)}`;
          }

          if ((selectedChannel === "email" || selectedChannel === "both") && recipient_email) {
            const emailSubject = `פתיחת תיק תביעה ${targetClaimId} - דליה ניהול תביעות`;
            const emailBody = [
              `שלום ${clientName},`,
              ``,
              customMessage || `נפתח עבורך תיק תביעה ${targetClaimId} באורן קאר.`,
              `למילוי פרטי האירוע והשלמת הדיווח, אנא היכנס/י לקישור המאובטח:`,
              ``,
              finalIntakeUrl,
              ``,
              `הקישור מאובטח וזמין למילוי.`,
              ``,
              `בברכה,`,
              `דליה ניהול תביעות - אורן קאר`,
            ].join("\n");

            const mailRes = await supabase.functions.invoke("claims-gmail", {
              body: {
                action: "send_claim",
                claim_id: targetClaimId,
                to: recipient_email,
                subject: emailSubject,
                body: emailBody,
                idempotency_key: `CUSTINT-${targetClaimId}-${Date.now()}`,
                confirm: true,
              },
            });
            if (mailRes.data?.success && mailRes.data?.realEmailSend === true) {
              emailSentStatus = `ונשלח בהצלחה באימייל אל ${recipient_email}`;
            } else {
              emailSentStatus = `(הקישור נוצר, אך שליחת המייל ל-${recipient_email} נכשלה)`;
            }
          }

          // Seed default document requests in claims_doc_requests so slots are ready
          const defaultRequests = [
            { label: "רישיון רכב", doc_key: "license_vehicle" },
            { label: "רישיון נהיגה", doc_key: "license_driver" },
            { label: "דוח שמאי", doc_key: "surveyor_report" },
            { label: "תמונות נזק", doc_key: "damage_photos" },
            { label: "טופס הודעה על תאונה", doc_key: "accident_notice" },
          ];
          for (const req of defaultRequests) {
            const { data: ex } = await supabase
              .from("claims_doc_requests")
              .select("id")
              .eq("claim_id", targetClaimId)
              .eq("doc_key", req.doc_key)
              .maybeSingle();
            if (!ex) {
              await supabase.from("claims_doc_requests").insert({
                id: newId("DCR"),
                claim_id: targetClaimId,
                label: req.label,
                doc_key: req.doc_key,
                status: "requested",
                created_by: userId,
              });
            }
          }

          await supabase.from("claims_history").insert({
            id: newId("HIS"),
            claim_id: targetClaimId,
            row_data: {
              action: "נוצר קישור פתיחת תיק חדש ללקוח",
              note: `הוקצה תיק ${targetClaimId} (ממתין למילוי הלקוח) עבור ${clientName}${recipient_email ? ` · אימייל: ${recipient_email}` : ""}${recipient_phone ? ` · טלפון: ${recipient_phone}` : ""} ${emailSentStatus}`.trim(),
              type: "customer_intake_link_created",
              by: userName || "דליה AI",
              at: new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }),
            },
          });

          await recordAiAudit(supabase, {
            userId,
            userName,
            claimId: targetClaimId,
            toolName: "preview_send_customer_link",
            actionType: "send_customer_intake_link",
            previewSummary: summary,
            previewPayload: parameters,
            approvedBy: userId,
            approvedByName: userName,
            executionAction: "send_customer_intake_link",
            status: "executed",
          });

          const lines = [
            `✅ קישור פתיחת תיק הוכן בהצלחה עבור ${clientName}!`,
            `📁 **מספר תיק קבוע שהוקצה:** ${targetClaimId} (סטטוס: ממתין למילוי הלקוח)`,
            `🔗 **קישור מילוי טופס פתיחת תיק:** ${finalIntakeUrl}`,
          ];
          if (emailSentStatus) lines.push(`📧 ${emailSentStatus}`);
          if (finalWaLink) lines.push(`💬 **WhatsApp:** [פתיחה ושליחה ב-WhatsApp](${finalWaLink})`);

          return {
            success: true,
            message: lines.join("\n"),
            claim_id: targetClaimId,
            claim_status: "ממתין למילוי הלקוח",
            intake_url: finalIntakeUrl,
            wa_link: finalWaLink,
          };
        }
      }

      case "create_share_link": {
        const { recipient_name, recipient_kind, recipient_email, recipient_phone, channel, file_ids, ttl_hours, custom_message } = parameters as {
          recipient_name: string;
          recipient_kind: string;
          recipient_email?: string | null;
          recipient_phone?: string | null;
          channel?: string | null;
          file_ids?: string[];
          ttl_hours?: number;
          custom_message?: string | null;
        };

        const normalizedKind = normalizeShareRecipientKind(recipient_kind);

        const res = await supabase.functions.invoke("claims-docs", {
          body: {
            action: "create_share",
            claim_id: claimId,
            recipient_name,
            recipient_kind: normalizedKind,
            recipient_email: recipient_email || undefined,
            recipient_phone: recipient_phone || undefined,
            file_ids: file_ids || [],
            ttl_hours: ttl_hours || 72,
          },
        });

        if (res.error || !res.data?.success) {
          const errMsg = res.data?.error || res.error?.message || "יצירת קישור השיתוף נכשלה";
          await recordAiAudit(supabase, {
            userId,
            userName,
            claimId,
            toolName: "preview_create_claim_share_link",
            actionType: "create_share_link",
            previewSummary: summary,
            previewPayload: parameters,
            approvedBy: userId,
            approvedByName: userName,
            executionAction: "create_share_link",
            status: "failed",
            errorMessage: errMsg,
          });
          return { success: false, message: `יצירת קישור השיתוף נכשלה: ${errMsg}`, error: errMsg };
        }

        const token = res.data?.token || "";
        const shareUrl = token ? `https://orin1607-ctrl.github.io/future-craft-core/claims-share/?t=${encodeURIComponent(token)}` : "";
        const selectedChannel = String(channel || "copy").toLowerCase();

        // 1. WhatsApp link preparation
        let waLink = "";
        const cleanPhone = String(recipient_phone || "").replace(/\D/g, "");
        const defaultWaText = custom_message || `שלום ${recipient_name},\nמצורף קישור מאובטח לצפייה ולהורדת המסמכים והתמונות בתיק תביעה ${claimId}.\nהקישור בתוקף ל-${ttl_hours || 72} שעות בלבד:\n${shareUrl}`;
        if (cleanPhone) {
          waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(defaultWaText)}`;
        } else {
          waLink = `https://wa.me/?text=${encodeURIComponent(defaultWaText)}`;
        }

        // 2. Email sending if requested and email provided
        let emailSentStatus = "";
        if ((selectedChannel === "email" || selectedChannel === "both") && recipient_email) {
          const emailSubject = `קישור שיתוף מאובטח למסמכי תביעה ${claimId} - דליה ניהול תביעות`;
          const emailBody = [
            `שלום ${recipient_name},`,
            ``,
            custom_message || `מצורף קישור מאובטח לצפייה ולהורדת מסמכים ותמונות מתיק תביעה ${claimId}:`,
            ``,
            shareUrl,
            ``,
            `הקישור מוגן וזמין למשך ${ttl_hours || 72} שעות בלבד. יש להוריד ולשמור את החומרים לפני פקיעת התוקף.`,
            ``,
            `בברכה,`,
            `דליה ניהול תביעות - אורן קאר`,
          ].join("\n");

          const mailIdempKey = `SHARELNK-${claimId}-${token.slice(0, 10)}`;
          const mailRes = await supabase.functions.invoke("claims-gmail", {
            body: {
              action: "send_claim",
              claim_id: claimId,
              to: recipient_email,
              subject: emailSubject,
              body: emailBody,
              idempotency_key: mailIdempKey,
              confirm: true,
            },
          });

          if (mailRes.data?.success && mailRes.data?.realEmailSend === true) {
            emailSentStatus = `ונשלח בהצלחה באימייל אל ${recipient_email}`;
          } else {
            const mErr = mailRes.data?.error || mailRes.error?.message || "שגיאה בשליחת המייל";
            emailSentStatus = `(הקישור נוצר, אך שליחת המייל ל-${recipient_email} נכשלה: ${mErr})`;
          }
        }

        // 3. Log to claims_history
        await supabase.from("claims_history").insert({
          id: newId("HIS"),
          claim_id: claimId,
          row_data: {
            action: `נוצר קישור שיתוף מאובטח (${(file_ids || []).length} קבצים)`,
            note: `קישור שיתוף נוצר עבור ${recipient_name} (${recipient_kind})${recipient_email ? ` · מייל: ${recipient_email}` : ""}${recipient_phone ? ` · טלפון: ${recipient_phone}` : ""} ${emailSentStatus}`.trim(),
            type: "share_link_created",
            by: userName || "דליה AI",
            at: new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }),
          },
        });

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: "preview_create_claim_share_link",
          actionType: "create_share_link",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "create_share_link",
          status: "executed",
        });

        const displayLines = [
          `קישור שיתוף מאובטח נוצר בהצלחה עבור ${recipient_name}:`,
          shareUrl,
        ];
        if (emailSentStatus) displayLines.push(emailSentStatus);
        if (waLink) displayLines.push(`WhatsApp: [פתיחה ושליחה ב-WhatsApp](${waLink})`);

        return {
          success: true,
          message: displayLines.join("\n"),
          share_url: shareUrl,
          wa_link: waLink,
        };
      }

      case "revoke_share_link": {
        const { share_id } = parameters as { share_id: string };

        const res = await supabase.functions.invoke("claims-docs", {
          body: {
            action: "revoke_share",
            claim_id: claimId,
            share_id,
          },
        });

        if (res.error || !res.data?.success) {
          const errMsg = res.data?.error || res.error?.message || "ביטול קישור השיתוף נכשל";
          await recordAiAudit(supabase, {
            userId,
            userName,
            claimId,
            toolName: "preview_revoke_claim_share_link",
            actionType: "revoke_share_link",
            previewSummary: summary,
            previewPayload: parameters,
            approvedBy: userId,
            approvedByName: userName,
            executionAction: "revoke_share_link",
            status: "failed",
            errorMessage: errMsg,
          });
          return { success: false, message: `ביטול קישור השיתוף נכשל: ${errMsg}`, error: errMsg };
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: "preview_revoke_claim_share_link",
          actionType: "revoke_share_link",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "revoke_share_link",
          status: "executed",
        });

        return {
          success: true,
          message: `קישור השיתוף בוטל בהצלחה`,
        };
      }

      case "update_status": {
        const { new_status, reason, old_status } = parameters as {
          new_status: string;
          reason?: string;
          old_status?: string;
        };

        const { data: cur } = await supabase
          .from("claims_records")
          .select("row_data")
          .eq("id", claimId)
          .maybeSingle();

        const rd = (cur?.row_data && typeof cur.row_data === "object" ? cur.row_data : {}) as Record<string, unknown>;
        const patchRd = { ...rd, status: new_status };

        const { error: updErr } = await supabase
          .from("claims_records")
          .update({
            status: new_status,
            row_data: patchRd,
            updated_at: new Date().toISOString(),
            updated_by: userId,
            updated_by_name: userName,
            last_activity_at: new Date().toISOString(),
          })
          .eq("id", claimId);

        if (updErr) {
          return { success: false, message: `עדכון הסטטוס נכשל: ${updErr.message}`, error: updErr.message };
        }

        await supabase.from("claims_history").insert({
          id: `HIS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          claim_id: claimId,
          row_data: {
            action: `עדכון סטטוס: ${new_status}`,
            note: reason || "עודכן דרך דליה AI",
            type: "status_update",
            by: userName || "דליה AI",
            at: new Date().toLocaleString("he-IL"),
          },
        });

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: "preview_update_claim_status",
          actionType: "update_status",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "update_status",
          stateBefore: { status: old_status },
          stateAfter: { status: new_status },
          status: "executed",
        });

        return {
          success: true,
          message: `סטטוס התיק עודכן בהצלחה ל-"${new_status}"`,
        };
      }

      case "create_task": {
        const p = parameters as { task_description?: string; due_date?: string; owner?: string; note?: string };
        const task_description = String(p.task_description || "");
        // Same shape as the claims screen's saveTask; no duplicate of an open task; saved row confirmed.
        const { data: existingTasks } = await supabase.from("claims_tasks").select("id, row_data").eq("claim_id", claimId);
        const openRows = (existingTasks || []).map((t) => rowOf(t));
        const plan = planTask(claimId, { action: task_description, dueDate: p.due_date, owner: p.owner, note: p.note }, openRows);
        if (!plan.ok) return { success: false, message: `המשימה לא נוצרה: ${plan.error}`, error: plan.duplicateId ? "duplicate" : "invalid" };
        const by = userName || "דליה AI";
        const at = nowHeRecords();
        const recs = taskRecords(plan.task, by, at);
        const savedTask = await insertVerified(supabase, "claims_tasks", recs.task);
        if (!savedTask.ok) {
          return { success: false, message: `המשימה לא נוצרה: ${savedTask.error}`, error: savedTask.error };
        }
        await writeHistory(supabase, recs.history, userId, by);
        await supabase.from("claims_notifications").insert(recs.notification);

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: "preview_create_claim_task",
          actionType: "create_task",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "create_task",
          status: "executed",
        });

        return {
          success: true,
          message: `המשימה "${task_description}" נוצרה בהצלחה בתיק`,
        };
      }

      case "close_task": {
        const { task_id } = parameters as { task_id: string };

        const { data: curTask } = await supabase
          .from("claims_tasks")
          .select("row_data")
          .eq("id", task_id)
          .eq("claim_id", claimId)
          .maybeSingle();

        if (!curTask) {
          return { success: false, message: "המשימה לא נמצאה בתיק הזה. לא נסגר דבר.", error: "task_not_found" };
        }
        const trd = (curTask.row_data && typeof curTask.row_data === "object" ? curTask.row_data : {}) as Record<string, unknown>;
        if (trd.done === "true") {
          return { success: true, message: "המשימה כבר סגורה. לא בוצע שינוי." };
        }
        const patchTrd = { ...trd, done: "true", workStatus: "done", closedAt: new Date().toISOString(), closedBy: userName || "דליה AI" };

        const { data: closedRows, error: closeErr } = await supabase
          .from("claims_tasks")
          .update({ row_data: patchTrd })
          .eq("id", task_id)
          .eq("claim_id", claimId)
          .select("id");

        if (closeErr || !closedRows || !(closedRows as unknown[]).length) {
          const why = closeErr?.message || "השמירה לא אושרה (אין הרשאה לתיק?)";
          return { success: false, message: `המשימה לא נסגרה: ${why}`, error: why };
        }

        await writeHistory(supabase, historyRow({
          claimId,
          action: `משימה נסגרה: ${String(trd.action || task_id)}`,
          note: "נסגרה דרך דליה AI לאחר אישור המשתמש",
          type: "task",
          before: "false",
          after: "true",
          by: userName || "דליה AI",
          at: nowHeRecords(),
        }), userId, userName || "דליה AI");

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: "preview_close_claim_task",
          actionType: "close_task",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "close_task",
          status: "executed",
        });

        return {
          success: true,
          message: `המשימה נסגרה בהצלחה`,
        };
      }

      case "add_note": {
        const { note } = parameters as { note: string };
        const cleanNote = String(note || "").trim().slice(0, 2000);
        if (!cleanNote) return { success: false, message: "ההערה ריקה. לא נשמר דבר.", error: "empty_note" };

        const savedNote = await writeHistory(supabase, historyRow({
          claimId,
          action: "הערת דליה AI",
          note: cleanNote,
          type: "ai_note",
          by: userName || "דליה AI",
          at: nowHeRecords(),
        }), userId, userName || "דליה AI");

        if (!savedNote.ok) {
          return { success: false, message: `ההערה לא נשמרה: ${savedNote.error}`, error: savedNote.error };
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: "preview_add_claim_note",
          actionType: "add_note",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "add_note",
          status: "executed",
        });

        return {
          success: true,
          message: `ההערה נוספה בהצלחה להיסטוריית התיק`,
        };
      }

      case "create_customer": {
        const { name: nameCust, phone, email, customer_type, notes } = parameters as {
          name: string;
          phone?: string | null;
          email?: string | null;
          customer_type?: string;
          notes?: string | null;
        };

        const { data: newCust, error: custErr } = await supabase.from("customers").insert({
          name: nameCust,
          phone: phone || "",
          email: email || "",
          customer_type: customer_type || "private",
          notes: notes || "נוצר דרך דליה AI במודול תביעות",
          status: "active",
          company_name: "Oren Car",
          created_by: userId,
        }).select().single();

        if (custErr) {
          return { success: false, message: `פתיחת הלקוח נכשלה: ${custErr.message}`, error: custErr.message };
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId: claimId || null,
          toolName: "preview_create_customer",
          actionType: "create_customer",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "create_customer",
          status: "executed",
        });

        return {
          success: true,
          message: `לקוח חדש "${nameCust}" נפתח בהצלחה במערכת הלקוחות`,
        };
      }

      case "create_reminder": {
        const p = parameters as { date?: string; note?: string };
        const plan = planReminder(claimId, { date: p.date, note: p.note, owner: userName });
        if (!plan.ok) return { success: false, message: `התזכורת לא נשמרה: ${plan.error}`, error: "invalid" };
        const by = userName || "דליה AI";
        const recs = reminderRecords(plan.reminder, by, nowHeRecords());
        const saved = await insertVerified(supabase, "claims_reminders", recs.reminder);
        if (!saved.ok) return { success: false, message: `התזכורת לא נשמרה: ${saved.error}`, error: saved.error };
        await writeHistory(supabase, recs.history, userId, by);
        await recordAiAudit(supabase, { userId, userName, claimId, toolName: "preview_create_claim_reminder", actionType: "create_reminder", previewSummary: summary, previewPayload: parameters, approvedBy: userId, approvedByName: userName, executionAction: "create_reminder", status: "executed" });
        return { success: true, message: `נשמרה תזכורת לתאריך ${plan.reminder.date}: ${plan.reminder.note}` };
      }

      case "update_reminder": {
        const p = parameters as { reminder_id?: string; date?: string | null; note?: string | null; cancel?: boolean; expected_date?: string; expected_note?: string };
        const remId = String(p.reminder_id || "");
        const { data: rem } = await supabase.from("claims_reminders").select("id, row_data, action").eq("id", remId).eq("claim_id", claimId).maybeSingle();
        if (!rem || rem.action !== "note") return { success: false, message: "התזכורת לא נמצאה בתיק הזה.", error: "not_found" };
        const current = rowOf(rem);
        if ((current.date || "") !== (p.expected_date || "") || (current.note || "") !== (p.expected_note || "")) {
          return { success: false, message: "התזכורת השתנתה מאז שהוכן הכרטיס. בקש כרטיס חדש.", error: "stale" };
        }
        const plan = planReminderUpdate(current, { date: p.date ?? undefined, note: p.note ?? undefined, cancel: p.cancel });
        if (!plan.ok) return { success: false, message: `התזכורת לא עודכנה: ${plan.error}`, error: "invalid" };
        const { data: upd, error: updErr } = await supabase.from("claims_reminders").update({ row_data: plan.next }).eq("id", remId).eq("claim_id", claimId).select("id");
        if (updErr || !upd || !(upd as unknown[]).length) {
          const why = updErr?.message || "השמירה לא אושרה";
          return { success: false, message: `התזכורת לא עודכנה: ${why}`, error: why };
        }
        await writeHistory(supabase, historyRow({
          claimId,
          action: plan.cancelled ? `תזכורת בוטלה: ${current.date}` : `תזכורת עודכנה: ${plan.next.date}`,
          note: plan.changes.join(" · "),
          type: "reminder",
          before: current.date || "",
          after: plan.cancelled ? "cancelled" : plan.next.date,
          by: userName || "דליה AI",
          at: nowHeRecords(),
        }), userId, userName || "דליה AI");
        await recordAiAudit(supabase, { userId, userName, claimId, toolName: "preview_update_claim_reminder", actionType: "update_reminder", previewSummary: summary, previewPayload: parameters, approvedBy: userId, approvedByName: userName, executionAction: "update_reminder", status: "executed" });
        return { success: true, message: plan.cancelled ? "התזכורת בוטלה." : `התזכורת עודכנה: ${plan.changes.join(" · ")}` };
      }

      case "schedule_whatsapp": {
        const p = parameters as { phone?: string; contact_name?: string; body?: string; planned_at?: string; planned_label?: string; file_ids?: string[]; file_titles?: string[]; recipient_role?: string };
        const when = { plannedAt: String(p.planned_at || ""), label: String(p.planned_label || "") };
        if (!when.plannedAt || Number.isNaN(Date.parse(when.plannedAt))) return { success: false, message: "מועד לא תקין. לא נשמר דבר.", error: "invalid" };
        const { data: comm } = await supabase.from("claims_comm_log").select("id, row_data").eq("claim_id", claimId);
        const held = (comm || []).map((c) => rowOf(c));
        const plan = planWaSchedule(claimId, { phone: p.phone, body: p.body, contact_name: p.contact_name }, when, held);
        if (!plan.ok) return { success: false, message: `ההודעה לא נשמרה: ${plan.error}`, error: "invalid" };

        // 1. Secure link (only when documents were approved): claim-scoped, expires, created by claims-docs.
        let body = plan.wa.body;
        const fileIds = Array.isArray(p.file_ids) ? p.file_ids.map(String).filter(Boolean) : [];
        if (fileIds.length) {
          const share = await supabase.functions.invoke("claims-docs", {
            body: {
              action: "create_share",
              claim_id: claimId,
              recipient_name: plan.wa.contactName || "נמען WhatsApp",
              recipient_kind: normalizeShareRecipientKind(String(p.recipient_role || "client")),
              recipient_phone: plan.wa.phone,
              file_ids: fileIds,
              ttl_hours: 72,
            },
          });
          const token = share.data?.token || "";
          if (share.error || !share.data?.success || !token) {
            const why = share.data?.error || share.error?.message || "יצירת הקישור נכשלה";
            return { success: false, message: `לא נשמר דבר: הקישור המאובטח לא נוצר (${why}).`, error: why };
          }
          body = withShareLink(body, `${SHARE_BASE_URL}${token}`);
        }

        // 2. The manual schedule — the same row the WhatsApp modal saves; the existing due list alerts on it.
        const by = userName || "דליה AI";
        const recs = waScheduleRecords({ ...plan.wa, body }, by, nowHeRecords());
        const saved = await insertVerified(supabase, "claims_comm_log", recs.comm);
        if (!saved.ok) {
          return {
            success: false,
            message: `ההודעה לא נשמרה: ${saved.error}${fileIds.length ? ". שים לב: הקישור המאובטח נוצר — אפשר לבטל אותו ברשימת השיתופים." : ""}`,
            error: saved.error,
          };
        }
        await writeHistory(supabase, recs.history, userId, by);
        await recordAiAudit(supabase, { userId, userName, claimId, toolName: "preview_schedule_claim_whatsapp", actionType: "schedule_whatsapp", previewSummary: summary, previewPayload: parameters, approvedBy: userId, approvedByName: userName, executionAction: "schedule_whatsapp", status: "executed" });
        return {
          success: true,
          message: `ממתין לשליחה ידנית — לא נשלח. נשמר ל-${plan.wa.plannedLabel} אל ${plan.wa.contactName || plan.wa.phone}${fileIds.length ? ` עם קישור מאובטח ל-${fileIds.length} מסמכים` : ""}. במועד תופיע התראה: פתח WhatsApp, שלח וסמן 'שלחתי'.`,
        };
      }

      case "update_claim_fields": {
        const params = parameters as { claim_id?: string; changes?: FieldChange[] };
        const target = String(params.claim_id || "");
        if (!target || (claimId && claimId !== target)) {
          return { success: false, message: "העדכון לא בוצע: התיק בכרטיס האישור אינו התיק הפתוח.", error: "claim_mismatch" };
        }
        const previewChanges = Array.isArray(params.changes) ? params.changes : [];
        if (!previewChanges.length || previewChanges.some((c) => !CLAIM_EDIT_FIELDS[String(c?.field || "")])) {
          return { success: false, message: "העדכון לא בוצע: שדות לא מוכרים בכרטיס האישור.", error: "invalid_fields" };
        }

        const { data: cur } = await supabase.from("claims_records").select("id, row_data").eq("id", target).maybeSingle();
        if (!cur || isDeletedClaim(cur.row_data)) {
          return { success: false, message: "העדכון לא בוצע: התיק לא נמצא או שנמחק.", error: "claim_not_found" };
        }
        const latest = (cur.row_data && typeof cur.row_data === "object" ? cur.row_data : {}) as Record<string, unknown>;

        // Re-validate on the server from the approved new values; the screen only echoes the preview.
        const revalidated = planClaimFieldEdit(latest, previewChanges.map((c) => ({ field: c.field, value: c.after })));
        if (revalidated.errors.length) {
          return { success: false, message: `העדכון לא בוצע: ${revalidated.errors.join("; ")}`, error: "invalid_values" };
        }
        const approved = previewChanges.filter((c) => !revalidated.unchanged.includes(CLAIM_EDIT_FIELDS[c.field].label));
        if (!approved.length) {
          return { success: true, message: "הערכים כבר קיימים בתיק. לא נדרש עדכון." };
        }
        const applied = applyClaimFieldEdit(latest, approved, { nowHe: nowHeIL(), actorName: userName || "דליה AI" });
        if (!applied.ok) {
          return {
            success: false,
            message: `העדכון לא בוצע: השדות ${applied.stale.join(", ")} השתנו מאז שהוכן הכרטיס. בקש תצוגה מקדימה חדשה.`,
            error: "stale",
          };
        }

        const nowIso = new Date().toISOString();
        const { data: saved, error: updErr } = await supabase
          .from("claims_records")
          .update({
            row_data: applied.rowData,
            ...applied.columns,
            updated_at: nowIso,
            updated_by: userId,
            updated_by_name: userName,
            last_activity_at: nowIso,
          })
          .eq("id", target)
          .select("id, row_data");
        if (updErr) {
          return { success: false, message: `העדכון לא בוצע: ${updErr.message}`, error: updErr.message };
        }
        const savedRow = (saved || [])[0] as { row_data?: Record<string, unknown> } | undefined;
        if (!savedRow) {
          return { success: false, message: "העדכון לא בוצע: אין הרשאה לעדכן את התיק או שהתיק לא נמצא.", error: "not_updated" };
        }
        const notSaved = approved.filter((c) => String(savedRow.row_data?.[c.field] ?? "") !== c.after).map((c) => c.label);
        if (notSaved.length) {
          return { success: false, message: `השמירה לא אומתה עבור: ${notSaved.join(", ")}.`, error: "not_verified" };
        }

        // History — one entry per field, in the same shape as the claim edit screen (appendHistory).
        const at = nowHeIL();
        for (const c of approved) {
          const histId = `HIS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          await supabase.from("claims_history").insert({
            id: histId,
            claim_id: target,
            row_data: {
              id: histId,
              claimId: target,
              action: "עדכון פרטי תיק",
              note: `${c.label} — עודכן דרך דליה AI לאחר אישור המשתמש`,
              type: "update",
              valueBefore: c.before,
              valueAfter: c.after,
              by: userName || "דליה AI",
              at,
            },
          });
        }

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId: target,
          toolName: "preview_update_claim_fields",
          actionType: "update_claim_fields",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "update_claim_fields",
          status: "executed",
        });

        return {
          success: true,
          message: `עודכנו ${approved.length} שדות בתיק ${target}: ${approved.map((c) => `${c.label}: ${c.after}`).join(" · ")}`,
        };
      }

      case "update_claim_client_contact": {
        const { phone, email, reason } = parameters as {
          phone?: string | null;
          email?: string | null;
          reason?: string;
        };

        const { data: cur } = await supabase
          .from("claims_records")
          .select("row_data, client_name")
          .eq("id", claimId)
          .maybeSingle();

        const rd = (cur?.row_data && typeof cur.row_data === "object" ? cur.row_data : {}) as Record<string, unknown>;
        const patchRd = { ...rd };
        if (phone) patchRd.clientPhone = phone;
        if (email) patchRd.clientEmail = email;

        const { error: updErr } = await supabase
          .from("claims_records")
          .update({
            row_data: patchRd,
            updated_at: new Date().toISOString(),
            updated_by: userId,
            updated_by_name: userName,
            last_activity_at: new Date().toISOString(),
          })
          .eq("id", claimId);

        if (updErr) {
          return { success: false, message: `עדכון פרטי הלקוח נכשל: ${updErr.message}`, error: updErr.message };
        }

        // Also update customers table if matched
        if (cur?.client_name) {
          const patchCust: Record<string, string> = {};
          if (phone) patchCust.phone = phone;
          if (email) patchCust.email = email;
          await supabase.from("customers").update(patchCust).eq("name", cur.client_name);
        }

        await supabase.from("claims_history").insert({
          id: `HIS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          claim_id: claimId,
          row_data: {
            action: "עדכון פרטי קשר ללקוח",
            note: `עודכן ע"י דליה AI: ${phone ? `טלפון: ${phone} ` : ""}${email ? `מייל: ${email}` : ""}`,
            type: "client_contact_updated",
            by: userName || "דליה AI",
            at: new Date().toLocaleString("he-IL"),
          },
        });

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: "preview_update_claim_client_contact",
          actionType: "update_claim_client_contact",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "update_claim_client_contact",
          status: "executed",
        });

        return {
          success: true,
          message: `פרטי ההתקשרות של הלקוח עודכנו בהצלחה בתיק`,
        };
      }

      case "link_client_to_claim": {
        const { customer_id, customer_name, phone, email } = parameters as {
          customer_id?: string;
          customer_name: string;
          phone?: string | null;
          email?: string | null;
        };

        const { data: cur } = await supabase
          .from("claims_records")
          .select("row_data")
          .eq("id", claimId)
          .maybeSingle();

        const rd = (cur?.row_data && typeof cur.row_data === "object" ? cur.row_data : {}) as Record<string, unknown>;
        const patchRd = {
          ...rd,
          clientName: customer_name,
          clientPhone: phone || rd.clientPhone,
          clientEmail: email || rd.clientEmail,
        };

        const { error: updErr } = await supabase
          .from("claims_records")
          .update({
            client_name: customer_name,
            row_data: patchRd,
            updated_at: new Date().toISOString(),
            updated_by: userId,
            updated_by_name: userName,
            last_activity_at: new Date().toISOString(),
          })
          .eq("id", claimId);

        if (updErr) {
          return { success: false, message: `קישור הלקוח לתיק נכשל: ${updErr.message}`, error: updErr.message };
        }

        await supabase.from("claims_history").insert({
          id: `HIS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          claim_id: claimId,
          row_data: {
            action: "קישור לקוח לתיק",
            note: `קושר לקוח: ${customer_name}`,
            type: "client_linked",
            by: userName || "דליה AI",
            at: new Date().toLocaleString("he-IL"),
          },
        });

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: "preview_link_client_to_claim",
          actionType: "link_client_to_claim",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "link_client_to_claim",
          status: "executed",
        });

        return {
          success: true,
          message: `הלקוח "${customer_name}" קושר בהצלחה לתיק התביעה`,
        };
      }

            case "create_claim_from_onboarding": {
        const { client, vehicle, claim, files } = parameters as {
          client: {
            name: string;
            phone: string;
            email: string;
            business_id: string;
            customer_type?: string;
            existing_customer_id?: string | null;
          };
          vehicle: {
            plate: string;
            make: string;
            model: string;
            year: string;
          };
          claim: {
            insurance_company: string;
            claim_number: string;
            accident_date: string;
            surveyor: string;
            garage: string;
            damage_description: string;
            third_party: string;
            status: string;
          };
          files?: Array<{
            name: string;
            mime_type: string;
            byte_size?: number;
            data_base64?: string;
            doc_kind?: string;
            staff_type?: string;
          }>;
        };

        // 1. Customer Handling
        let customerId = client.existing_customer_id || null;
        let customerName = client.name !== "חסר" ? client.name : "לקוח חדש";

        if (!customerId) {
          const dup = await checkDuplicatesHelper(supabase, {
            client_name: client.name !== "חסר" ? client.name : "",
            client_phone: client.phone !== "חסר" ? client.phone : "",
            client_email: client.email !== "חסר" ? client.email : "",
            business_id: client.business_id !== "חסר" ? client.business_id : "",
          });

          if (dup.matched_customers.length > 0) {
            customerId = dup.matched_customers[0].id;
            customerName = dup.matched_customers[0].name;
          } else {
            const { data: newCust, error: custErr } = await supabase.from("customers").insert({
              name: customerName,
              phone: client.phone !== "חסר" ? (client.phone || "") : "",
              email: client.email !== "חסר" ? (client.email || "") : "",
              business_id: client.business_id !== "חסר" ? (client.business_id || null) : null,
              customer_type: client.customer_type || "private",
              notes: "נוצר דרך דליה AI Onboarding בתביעות",
              status: "active",
              company_name: "Oren Car",
              created_by: userId,
            }).select().single();

            if (!custErr && newCust?.id) {
              customerId = newCust.id;
            }
          }
        }

        // 2. Claim id: a QA claim gets DAL-QA-… and never moves the real claim counter.
        const isTestClaim = (parameters as Record<string, unknown>).is_test === true;
        let newClaimId = "";
        if (isTestClaim) {
          const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
          newClaimId = `DAL-QA-AI-${stamp}`;
        } else {
          const { data: cfgRow } = await supabase
            .from("claims_config")
            .select("key, value")
            .eq("key", "CLAIM_COUNTER")
            .maybeSingle();

          const curCount = parseInt(String(cfgRow?.value || "0"), 10);
          const nextCount = curCount + 1;
          await supabase.from("claims_config").upsert({
            key: "CLAIM_COUNTER",
            value: String(nextCount),
            updated_at: new Date().toISOString(),
          });
          newClaimId = `DAL-${new Date().getFullYear()}-${String(nextCount).padStart(4, "0")}`;
        }
        const nowStr = new Date().toLocaleString("he-IL");

        // 3. Claims Record
        const rowData: Record<string, unknown> = {
          id: newClaimId,
          clientName: customerName,
          clientPhone: client.phone !== "חסר" ? client.phone : "",
          clientEmail: client.email !== "חסר" ? client.email : "",
          clientBusinessId: client.business_id !== "חסר" ? client.business_id : "",
          customerId: customerId || null,
          plate: vehicle.plate !== "חסר" ? vehicle.plate : "",
          carManufacturer: vehicle.make !== "חסר" ? vehicle.make : "",
          carModel: vehicle.model !== "חסר" ? vehicle.model : "",
          carYear: vehicle.year !== "חסר" ? vehicle.year : "",
          insCompany: claim.insurance_company !== "חסר" ? claim.insurance_company : "",
          // Claim form fields (FC_MAP): what the claim card shows and edits.
          claimNum: claim.claim_number !== "חסר" ? claim.claim_number : "",
          eventDate: claim.accident_date !== "חסר" ? (normalizeDate(claim.accident_date) || "") : "",
          surveyor: claim.surveyor !== "חסר" ? claim.surveyor : "",
          thirdParty: claim.third_party !== "חסר" ? claim.third_party : "",
          ...(isTestClaim ? { isTest: "true", claimKind: "בדיקה" } : {}),
          // Earlier onboarding keys, kept for anything that reads them.
          claimNumber: claim.claim_number !== "חסר" ? claim.claim_number : "",
          insClaim: claim.claim_number !== "חסר" ? claim.claim_number : "",
          accidentDate: claim.accident_date !== "חסר" ? claim.accident_date : "",
          surveyorName: claim.surveyor !== "חסר" ? claim.surveyor : "",
          garageName: claim.garage && claim.garage !== "חסר" ? claim.garage : "",
          damageDescription: claim.damage_description !== "חסר" ? claim.damage_description : "",
          thirdPartyName: claim.third_party !== "חסר" ? claim.third_party : "",
          status: claim.status || "חדש",
          source: "Dalia AI Onboarding",
          docsOrderStatus: "organized",
          createdAt: nowStr,
          updatedAt: nowStr,
          lastActivityAt: nowStr,
          createdByName: userName || "דליה AI",
          updatedByName: userName || "דליה AI",
          assigned_to: userId,
          assigned_to_name: userName,
        };

        const { error: insErr } = await supabase.from("claims_records").insert({
          id: newClaimId,
          plate: vehicle.plate !== "חסר" ? vehicle.plate : null,
          client_name: customerName,
          status: claim.status || "חדש",
          company_name: claim.insurance_company !== "חסר" ? claim.insurance_company : "Oren Car",
          row_data: rowData,
          created_by: userId,
          created_by_name: userName,
          updated_by: userId,
          updated_by_name: userName,
          assigned_to: userId,
          assigned_to_name: userName,
          assigned_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        });

        if (insErr) {
          return {
            success: false,
            error: insErr.message,
            message: `שגיאה ביצירת תיק התביעה: ${insErr.message}`,
          };
        }

        // 4. Save attachments to claims-docs bucket and claims_documents table
        const adminSb = getAdminClient() || supabase;
        let savedFilesCount = 0;
        const savedDocIds: string[] = [];

        for (let i = 0; i < (files || []).length; i++) {
          const f = files[i];
          if (!f.data_base64) continue;
          const buf = base64ToBytes(f.data_base64);
          const digest = await sha256Hex(buf);
          const safeName = sanitizeFileName(f.name || `file_${i + 1}`);
          const path = `${newClaimId}/staff/F-${Date.now()}-${i}-${safeName}`;
          let mime = String(f.mime_type || "application/octet-stream").toLowerCase();
          if (mime === "image/jpg") mime = "image/jpeg";

          const { error: upErr } = await adminSb.storage.from("claims-docs").upload(path, buf, {
            contentType: mime,
            upsert: false,
          });
          if (upErr) console.error("Upload file error:", upErr);

          const fileId = `CDM-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
          const isPhoto = mime.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(safeName);
          const docKind = sanitizeDbDocKind(f.doc_kind, isPhoto);
          const staffType = isPhoto ? "garage_photos" : (f.staff_type || f.doc_kind || "general");

          const { error: insDocErr } = await adminSb.from("claims_documents").insert({
            id: fileId,
            claim_id: newClaimId,
            storage_path: path,
            original_name: f.name || safeName,
            mime_type: mime,
            byte_size: buf.length,
            source: "staff",
            uploaded_by: userId,
            uploaded_by_name: userName,
            doc_kind: docKind,
            doc_meta: {
              staff_type: staffType,
              staff_title: f.name || safeName,
            },
            content_sha256: digest,
          });

          if (!insDocErr) {
            savedFilesCount++;
            savedDocIds.push(fileId);
          }
        }

        // 5. Audit & History
        await supabase.from("claims_history").insert({
          id: `HIS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          claim_id: newClaimId,
          row_data: {
            action: "פתיחת תיק חדש דרך דליה AI",
            note: `תיק תביעה נפתח אוטומטית ממסמכים שהועלו בצ'אט. לקוח: ${customerName}, רכב: ${vehicle.plate}. נשמרו ${savedFilesCount} קבצים.`,
            type: "claim_onboarding",
            by: userName || "דליה AI",
            at: nowStr,
          },
        });

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId: newClaimId,
          toolName: "preview_create_claim_from_onboarding",
          actionType: "create_claim_from_onboarding",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "create_claim_from_onboarding",
          status: "executed",
        });

        return {
          success: true,
          claim_id: newClaimId,
          customer_id: customerId,
          files_count: savedFilesCount,
          message: `תיק תביעה חדש ${newClaimId} נפתח בהצלחה עבור הלקוח ${customerName} (רכב ${vehicle.plate})! נוספו ${savedFilesCount} קבצים (תמונות לגלריה ומסמכים לספרייה).`,
        };
      }

      case "save_attachment_to_claim": {
        const { claim_id, files, description, doc_kind } = parameters as {
          claim_id: string;
          files: Array<{ name: string; mime_type: string; data_base64: string; doc_kind?: string }>;
          description?: string;
          doc_kind?: string;
        };

        const targetClaimId = claimId || claim_id;
        if (!targetClaimId) {
          return { success: false, error: "missing_claim_id", message: "חסר מזהה תיק תביעה" };
        }

        const adminSb = getAdminClient() || supabase;
        let savedCount = 0;

        for (let i = 0; i < (files || []).length; i++) {
          const f = files[i];
          if (!f.data_base64) continue;
          const buf = base64ToBytes(f.data_base64);
          const digest = await sha256Hex(buf);
          const safeName = sanitizeFileName(f.name || `file_${i + 1}`);
          const path = `${targetClaimId}/staff/F-${Date.now()}-${i}-${safeName}`;
          let mime = String(f.mime_type || "application/octet-stream").toLowerCase();
          if (mime === "image/jpg") mime = "image/jpeg";

          const { error: upErr } = await adminSb.storage.from("claims-docs").upload(path, buf, {
            contentType: mime,
            upsert: false,
          });
          if (upErr) console.error("Save attachment storage upload error:", upErr);

          const fileId = `CDM-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
          const isPhoto = mime.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(safeName);
          const chosenKind = sanitizeDbDocKind(f.doc_kind || doc_kind, isPhoto);
          const chosenStaffType = isPhoto ? "garage_photos" : (f.doc_kind || doc_kind || "general");

          const { error: insErr } = await adminSb.from("claims_documents").insert({
            id: fileId,
            claim_id: targetClaimId,
            storage_path: path,
            original_name: f.name || safeName,
            mime_type: mime,
            byte_size: buf.length,
            source: "staff",
            uploaded_by: userId,
            uploaded_by_name: userName,
            doc_kind: chosenKind,
            doc_meta: {
              staff_type: chosenStaffType,
              staff_title: description || f.name || safeName,
            },
            content_sha256: digest,
          });

          if (!insErr) {
            savedCount++;
          }
        }

        await supabase.from("claims_history").insert({
          id: `HIS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          claim_id: targetClaimId,
          row_data: {
            action: "הוספת מסמכים לתיק מצ'אט דליה AI",
            note: `${description || "קבצים נוספו דרך הצ'אט"}: נשמרו ${savedCount} קבצים.`,
            type: "docs_added_from_chat",
            by: userName || "דליה AI",
            at: new Date().toLocaleString("he-IL"),
          },
        });

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId: targetClaimId,
          toolName: "preview_save_attachment_to_claim",
          actionType: "save_attachment_to_claim",
          previewSummary: summary,
          previewPayload: parameters,
          approvedBy: userId,
          approvedByName: userName,
          executionAction: "save_attachment_to_claim",
          status: "executed",
        });

        return {
          success: true,
          message: `נשמרו בהצלחה ${savedCount} קבצים בתיק ${targetClaimId} (נוספו לגלריה ולספריית המסמכים).`,
          files_count: savedCount,
        };
      }

      default:
        return { success: false, message: `פעולה לא מוכרת: ${action_type}`, error: "unknown_action_type" };
    }
  } catch (err) {
    console.error("executeClaimsPendingAction error:", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "שגיאה בביצוע הפעולה",
      error: "execution_error",
    };
  }
}
