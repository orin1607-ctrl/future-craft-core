// supabase/functions/help-ai-chat/claimsTools.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
export const CLAIMS_GEMINI_TOOLS = [
  {
    functionDeclarations: [
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
        description: "רשימת כל התמונות והמסמכים הקיימים בתיק הפתוח (תמונות שמאי, חשבוניות, שמאות, רישיון רכב וכו')",
        parameters: {
          type: "OBJECT",
          properties: {
            filter_type: {
              type: "STRING",
              description: "סוג סינון: 'photos' (תמונות בלבד), 'docs' (מסמכים ומסמכי PDF בלבד), או 'all' (הכל)",
            },
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
        description: "הכנת תצוגה מקדימה (Preview) לשליחת מייל מתוך התיק דרך Gmail. אם לא צוינו נושא, גוף או מזהי קבצים, המערכת תבחר אוטומטית נושא מתאים, גוף מקצועי ואת תמונות/מסמכי התיק. דורש אישור מפורש של המשתמש לפני שליחה בפועל.",
        parameters: {
          type: "OBJECT",
          properties: {
            to: {
              type: "STRING",
              description: "כתובת מייל הנמען (חובה)",
            },
            cc: {
              type: "STRING",
              description: "כתובת מייל להעתק (אופציונלי)",
            },
            subject: {
              type: "STRING",
              description: "נושא המייל (אופציונלי - ברירת מחדל: נושא מתאים עם מספר התביעה/הרכב)",
            },
            body: {
              type: "STRING",
              description: "תוכן גוף המייל (אופציונלי - ברירת מחדל: נוסח פנייה מקצועי ממוסך אורן)",
            },
            file_ids: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "מזהי קבצים מתוך התיק לצירוף (אופציונלי - אם לא צוין, מצרף אוטומטית את תמונות התיק)",
            },
          },
        },
      },
      {
        name: "preview_create_claim_share_link",
        description: "הכנת תצוגה מקדימה ליצירת קישור שיתוף מאובטח לתמונות ומסמכים בתיק. אם לא צוינו מזהי קבצים ספציפיים, המערכת בוחרת אוטומטית את תמונות התיק. דורש אישור מפורש של המשתמש לפני יצירה.",
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
              description: "מייל הנמען (אופציונלי)",
            },
            recipient_phone: {
              type: "STRING",
              description: "טלפון הנמען (אופציונלי)",
            },
            file_ids: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "מזהי הקבצים לשיתוף (אופציונלי - אם לא צוין, נבחרות אוטומטית תמונות התיק)",
            },
            ttl_hours: {
              type: "NUMBER",
              description: "תוקף הקישור בשעות (ברירת מחדל 72)",
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
        description: "הכנת תצוגה מקדימה ליצירת משימה חדשה בתיק התביעה. דורש אישור מפורש של המשתמש.",
        parameters: {
          type: "OBJECT",
          properties: {
            task_description: {
              type: "STRING",
              description: "תיאור המשימה לביצוע",
            },
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
              description: "מספר רישוי הרכב (חובה, או 'חסר')",
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
              description: "שם המוסך (ברירת מחדל 'מוסך אורן')",
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
          required: ["client_name", "plate"],
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
              description: "מספר רישוי הרכב (חובה, או 'חסר')",
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
              description: "שם המוסך (ברירת מחדל 'מוסך אורן')",
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
          required: ["client_name", "plate"],
        },
      },
    ],
  },
];

// -------------------------------------------------------------
// 3. SYSTEM PROMPTS
// -------------------------------------------------------------
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
7. קישורי שיתוף: הצגת קישורים פעילים, יצירת קישורי שיתוף מאובטחים חדשים לשמאי/ביטוח/לקוח (preview_create_claim_share_link), וביטול קישורים (preview_revoke_claim_share_link).
8. שליחת מיילים: שליחת מיילים ללקוח או לחברת הביטוח עם קבצים מצורפים מתוך התיק (preview_send_claim_email).
9. תפעול התיק: שינוי סטטוס (preview_update_claim_status), יצירת וסגירת משימות (preview_create_claim_task, preview_close_claim_task), הוספת הערות בתיק (preview_add_claim_note).
10. לקוחות: יצירת לקוח חדש (preview_create_customer), עדכון טלפון/מייל (preview_update_claim_client_contact), קישור לקוח לתביעה (preview_link_client_to_claim), ובדיקת כפילויות (check_claim_and_customer_duplicates).

כללי בטיחות ואישורים קריטיים:
- פעולות קריאה (READ): כגון חיפוש מיילים, בדיקת מענה מביטוח, רשימת תמונות/מסמכים, בדיקת חוסרים, בדיקת קישורים, מי טיפל, בדיקת כפילויות — מבוצעות באופן אוטומטי מיידי דרך הכלים הרלוונטיים. ענה תמיד בעברית ברורה ותמציתית עם הנתונים האמיתיים שנשלפו.
- פעולות כתיבה (WRITE / SEND / REVOKE / UPDATE): כגון שליחת מייל, יצירת קישור שיתוף, שמירת מסמכים לתיק, ביטול קישור, שינוי סטטוס תיק, יצירת משימה, סגירת משימה, הוספת הערה, יצירת/עדכון לקוח — אסור לבצע ישירות ללא אישור!
- עבור כל פעולת כתיבה, חובה לקרוא לכלי ה-Preview המתאים.
- כלי ה-Preview מכין את הפעולה ומציג למשתמש כרטיס אישור אינטראקטיבי בממשק. בתשובתך, הסבר בעברית מה הכנת ובקש מהמשתמש ללחוץ על "אישור" כדי לבצע.
- לעולם אל תמציא מידע שאינו קיים בתיק. השתמש תמיד בכלים לקבלת נתונים חיים.
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

2. סקירת תביעות וסטטיסטיקות:
   - כמות תביעות כוללת, תביעות פתוחות, סגורות, בארכיון (get_claims_summary, count_claims).
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

5. חיפוש תביעות:
   - חיפוש לפי מספר רכב, שם לקוח, מספר תביעה, חברת ביטוח (search_claims).

6. בדיקת כפילויות ישירה:
   - בדיקת כפילויות לקוח או תיק (check_claim_and_customer_duplicates).

כללי פעולה קריטיים:
- ענה תמיד בעברית ברורה, מקצועית ומסודרת.
- השתמש תמיד בכלים הייעודיים לקבלת נתונים אמיתיים. לעולם אל תנחש או תמציא מספרים או שמות.
- כל פעולת יצירה או שינוי דורשת כרטיס Preview ואישור מפורש של המשתמש לפני ביצוע.
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

  const plate = norm(args.plate);
  const make = norm(args.make);
  const model = norm(args.model);
  const year = norm(args.year);

  const insuranceCompany = norm(args.insurance_company);
  const claimNumber = norm(args.claim_number);
  const accidentDate = norm(args.accident_date);
  const surveyor = norm(args.surveyor);
  const garage = args.garage ? String(args.garage).trim() : "מוסך אורן";
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
  let summary = `📋 פתיחת תיק תביעה חדש וקליטת לקוח מתוך מסמכים:
👤 לקוח: ${clientName} | טלפון: ${clientPhone} | מייל: ${clientEmail} | ת"ז/ח"פ: ${businessId}
🚗 רכב: מספר רישוי ${plate} | יצרן: ${make} | דגם: ${model} | שנה: ${year}
🏢 תביעה: ביטוח: ${insuranceCompany} | מס' תביעה: ${claimNumber} | תאריך אירוע: ${accidentDate}
🔧 מוסך: ${garage} | שמאי: ${surveyor}
💥 נזק: ${damageDescription}
📁 קבצים שיצורפו לתיק (${classifiedFiles.length}):
${classifiedFiles.length > 0 ? classifiedFiles.map((f, i) => `${i + 1}. ${f.name} — ${f.category}`).join("\n") : "לא הועלו קבצים"}
${missingFields.length > 0 ? `⚠️ שדות חסרים שסומנו כ-"חסר": ${missingFields.join(", ")}` : "✨ כל השדות זוהו בהצלחה."}`;

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
): Promise<{ result: unknown; preview?: ClaimsPendingAction }> {
  try {
    switch (name) {
      case "search_claim_emails": {
        const direction = String(args.direction || "all").toLowerCase();
        const query = String(args.query || "").trim().toLowerCase();
        const limit = Math.min(Number(args.limit || 15), 30);

        let imports: Array<Record<string, unknown>> = [];
        let outbox: Array<Record<string, unknown>> = [];

        if (direction === "inbound" || direction === "all") {
          const { data } = await supabase
            .from("claims_gmail_imports")
            .select("id, gmail_message_id, gmail_thread_id, from_addr, to_addr, subject, body_text, sent_at, attachment_count")
            .eq("claim_id", claimId)
            .order("sent_at", { ascending: false })
            .limit(limit);
          imports = (data || []).map((m) => ({
            id: m.id,
            direction: "inbound",
            from: m.from_addr,
            to: m.to_addr,
            subject: m.subject,
            snippet: (m.body_text || "").slice(0, 200),
            sent_at: m.sent_at,
            attachments: m.attachment_count || 0,
          }));
        }

        if (direction === "outbound" || direction === "all") {
          const { data } = await supabase
            .from("claims_gmail_outbox")
            .select("id, gmail_message_id, gmail_thread_id, to_addr, subject, body_text, sent_at, status, file_ids")
            .eq("claim_id", claimId)
            .order("sent_at", { ascending: false })
            .limit(limit);
          outbox = (data || []).map((m) => ({
            id: m.id,
            direction: "outbound",
            from: "מוסך אורן",
            to: m.to_addr,
            subject: m.subject,
            snippet: (m.body_text || "").slice(0, 200),
            sent_at: m.sent_at,
            status: m.status,
            attachments: Array.isArray(m.file_ids) ? m.file_ids.length : 0,
          }));
        }

        let combined = [...imports, ...outbox];
        if (query) {
          combined = combined.filter((m) =>
            String(m.subject || "").toLowerCase().includes(query) ||
            String(m.snippet || "").toLowerCase().includes(query) ||
            String(m.from || "").toLowerCase().includes(query) ||
            String(m.to || "").toLowerCase().includes(query)
          );
        }
        combined.sort((a, b) => new Date(String(b.sent_at || "")).getTime() - new Date(String(a.sent_at || "")).getTime());

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
            emails: combined.slice(0, limit),
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
              direction: "inbound",
              from: data.from_addr,
              to: data.to_addr,
              subject: data.subject,
              body_snippet: (data.body_text || "").slice(0, 400),
              sent_at: data.sent_at,
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
              direction: "outbound",
              from: "מוסך אורן",
              to: data.to_addr,
              subject: data.subject,
              body_snippet: (data.body_text || "").slice(0, 400),
              sent_at: data.sent_at,
              status: data.status,
              attachments: Array.isArray(data.file_ids) ? data.file_ids.length : 0,
            };
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
          const { data } = await supabase
            .from("claims_gmail_imports")
            .select("*")
            .eq("id", emailId)
            .eq("claim_id", claimId)
            .maybeSingle();
          if (data) {
            emailData = {
              id: data.id,
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
          const { data } = await supabase
            .from("claims_gmail_outbox")
            .select("*")
            .eq("id", emailId)
            .eq("claim_id", claimId)
            .maybeSingle();
          if (data) {
            emailData = {
              id: data.id,
              direction: "outbound",
              from: "מוסך אורן",
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
          .select("id, original_name, mime_type, byte_size, storage_path, created_at, source")
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

        return {
          result: {
            claim_id: claimId,
            email_id: emailId,
            count: emailAttachments.length,
            attachments: emailAttachments.map((a) => ({
              id: a.id,
              name: a.original_name,
              size_bytes: a.byte_size,
              mime_type: a.mime_type,
            })),
          },
        };
      }

      case "check_insurance_reply": {
        const { data } = await supabase
          .from("claims_gmail_imports")
          .select("id, from_addr, to_addr, subject, body_text, sent_at, attachment_count")
          .eq("claim_id", claimId)
          .order("sent_at", { ascending: false });

        const insuranceKeywords = ["ביטוח", "שומרה", "מגדל", "כלל", "הראל", "הפניקס", "שלמה", "איילון", "מנורה", "shlomo", "migdal", "clal", "harel", "fnx", "menora", "ayalon"];
        const insuranceMails = (data || []).filter((m) => {
          const from = String(m.from_addr || "").toLowerCase();
          const subj = String(m.subject || "").toLowerCase();
          return insuranceKeywords.some((kw) => from.includes(kw) || subj.includes(kw));
        });

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
          const { data } = await supabase
            .from("claims_gmail_imports")
            .select("*")
            .eq("id", importId)
            .eq("claim_id", claimId)
            .maybeSingle();
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
            original_date: targetImport.sent_at,
            original_snippet: (targetImport.body_text || "").slice(0, 200),
            suggested_opening: "שלום רב,\\nבהמשך לפנייתכם בנושא תביעה זו, להלן המידע והמסמכים הנדרשים:",
          },
        };
      }

      case "list_claim_documents": {
        const filterType = String(args.filter_type || "all").toLowerCase();

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

        const numberedList = filtered.map((d, idx) => `${idx + 1}. ${formatDocLabel(d)} (${d.original_name})`);

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "list_documents",
          status: "success",
        });

        return {
          result: {
            claim_id: claimId,
            filter: filterType,
            total_count: filtered.length,
            selection_instruction: "ניתן לבחור מסמכים לפי מספרם (לדוגמה: 'שלח ללקוח 1 ו-2' או 'תכין קישור לתמונות 3 ו-4').",
            numbered_list: numberedList,
            documents: filtered.map((d, idx) => ({
              index: idx + 1,
              id: d.id,
              name: d.original_name,
              label: formatDocLabel(d),
              mime: d.mime_type,
              size: d.byte_size,
              kind: d.doc_kind || "מסמך",
              created_at: d.created_at,
            })),
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
        let to = String(args.to || "").trim();
        const cc = String(args.cc || "").trim();
        let subject = String(args.subject || "").trim();
        let body = String(args.body || "").trim();
        let fileIds = Array.isArray(args.file_ids) ? (args.file_ids as string[]) : [];

        const { data: claimRec } = await supabase
          .from("claims_records")
          .select("id, plate, client_name, row_data")
          .eq("id", claimId)
          .maybeSingle();

        const claimRow = (claimRec?.row_data && typeof claimRec.row_data === "object" ? claimRec.row_data : {}) as Record<string, unknown>;
        const claimNum = String(claimRow.claimNum || claimId);
        const plate = String(claimRec?.plate || claimRow.plate || "");

        if (!to) {
          to = String(claimRow.insEmail || claimRow.clientEmail || "").trim();
        }

        if (!to) {
          return {
            result: {
              error: "נדרשת כתובת מייל של הנמען. אנא ציין למי לשלוח את המייל.",
            },
          };
        }

        if (!subject) {
          subject = `תיק תביעה ${claimNum} - רכב ${plate} - מסמכים ותמונות ממוסך אורן`;
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

        if (fileIds.length === 0) {
          const { data: defaultDocs } = await supabase
            .from("claims_documents")
            .select("id, original_name")
            .eq("claim_id", claimId)
            .limit(15);
          if (defaultDocs && defaultDocs.length > 0) {
            fileIds = defaultDocs.map((d) => d.id);
          }
        }

        if (!body) {
          body = `שלום רב,
מצורפים בזאת מסמכים ותמונות עבור תיק תביעה ${claimNum} (רכב ${plate}).
בברכה,
מוסך אורן`;
        }

        const previewId = `P-SEND-${Date.now()}`;
        const summary = `שליחת מייל אל ${to} (נושא: "${subject}", ${fileIds.length} קבצים מצורפים)`;

        const preview: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "send_email",
          parameters: {
            claim_id: claimId,
            to,
            cc: cc || null,
            subject,
            body,
            file_ids: fileIds,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "send_email",
          previewSummary: summary,
          previewPayload: preview.parameters,
          status: "preview_created",
        });

        return {
          result: {
            preview_id: previewId,
            status: "pending_approval",
            message: "הוכנה תצוגה מקדימה לשליחת המייל. נדרש אישור המשתמש לביצוע.",
            details: {
              to,
              cc: cc || "ללא",
              subject,
              body_excerpt: body.slice(0, 300),
              attachments_count: fileIds.length,
            },
          },
          preview,
        };
      }

      case "preview_create_claim_share_link": {
        const recipientName = String(args.recipient_name || "").trim();
        const recipientKind = normalizeShareRecipientKind(String(args.recipient_kind || "other"));
        const recipientEmail = String(args.recipient_email || "").trim();
        const recipientPhone = String(args.recipient_phone || "").trim();
        const ttlHours = Number(args.ttl_hours || 72);
        let fileIds = Array.isArray(args.file_ids) ? (args.file_ids as string[]) : [];

        if (fileIds.length === 0) {
          const { data: defaultDocs } = await supabase
            .from("claims_documents")
            .select("id")
            .eq("claim_id", claimId)
            .limit(20);
          if (defaultDocs && defaultDocs.length > 0) {
            fileIds = defaultDocs.map((d) => d.id);
          }
        }

        const previewId = `P-SHARE-${Date.now()}`;
        const summary = `יצירת קישור שיתוף עבור "${recipientName}" לתוקף של ${ttlHours} שעות (${fileIds.length} קבצים)`;

        const preview: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "create_share_link",
          parameters: {
            claim_id: claimId,
            recipient_name: recipientName,
            recipient_kind: recipientKind,
            recipient_email: recipientEmail || null,
            recipient_phone: recipientPhone || null,
            file_ids: fileIds,
            ttl_hours: ttlHours,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
          toolName: name,
          actionType: "create_share_link",
          previewSummary: summary,
          previewPayload: preview.parameters,
          status: "preview_created",
        });

        return {
          result: {
            preview_id: previewId,
            status: "pending_approval",
            message: "הוכנה תצוגה מקדימה ליצירת קישור שיתוף. נדרש אישור המשתמש לביצוע.",
            details: {
              recipient_name: recipientName,
              recipient_kind: recipientKind,
              ttl_hours: ttlHours,
              files_count: fileIds.length,
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
        const taskDescription = String(args.task_description || "").trim();
        const previewId = `P-TASK-${Date.now()}`;
        const summary = `יצירת משימה חדשה בתיק: "${taskDescription}"`;

        const preview: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "create_task",
          parameters: {
            claim_id: claimId,
            task_description: taskDescription,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
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
        const taskId = String(args.task_id || "").trim();
        const previewId = `P-CLOSETASK-${Date.now()}`;
        const summary = `סגירת משימה בתיק (מזהה: ${taskId})`;

        const preview: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "close_task",
          parameters: {
            claim_id: claimId,
            task_id: taskId,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
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
        const note = String(args.note || "").trim();
        const previewId = `P-NOTE-${Date.now()}`;
        const summary = `הוספת הערה לתיק: "${note}"`;

        const preview: ClaimsPendingAction = {
          preview_id: previewId,
          summary,
          tool_name: name,
          action_type: "add_note",
          parameters: {
            claim_id: claimId,
            note,
          },
        };

        await recordAiAudit(supabase, {
          userId,
          userName,
          claimId,
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
): Promise<{ result: unknown; preview?: ClaimsPendingAction }> {
  try {
    const todayStart = getTodayStart();

    switch (name) {
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
            from: "מוסך אורן",
            to: m.to_addr,
            subject: m.subject,
            time: m.sent_at || m.created_at,
            status: m.status,
          })),
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

    switch (action_type) {
      case "send_email": {
        const { to, cc, subject, body, file_ids } = parameters as {
          to: string;
          cc?: string | null;
          subject: string;
          body: string;
          file_ids?: string[];
        };

        const idempotencyKey = `IDEMP-${Date.now()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;

        const res = await supabase.functions.invoke("claims-gmail", {
          body: {
            action: "send_claim",
            claim_id: claimId,
            to,
            cc: cc || undefined,
            subject,
            body,
            file_ids: file_ids || [],
            idempotency_key: idempotencyKey,
            confirm: true,
          },
        });

        if (res.error || !res.data?.success) {
          const errMsg = res.data?.error || res.error?.message || "שליחת המייל דרך Gmail נכשלה";
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
          return { success: false, message: `שליחת המייל נכשלה: ${errMsg}`, error: errMsg };
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
        return {
          success: true,
          message: `המייל נשלח בהצלחה לנמען ${to}${msgId ? ` (מזהה: ${msgId})` : ""}`,
        };
      }

      case "create_share_link": {
        const { recipient_name, recipient_kind, recipient_email, recipient_phone, file_ids, ttl_hours } = parameters as {
          recipient_name: string;
          recipient_kind: string;
          recipient_email?: string | null;
          recipient_phone?: string | null;
          file_ids?: string[];
          ttl_hours?: number;
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

        const token = res.data?.token || "";
        const shareUrl = token ? `https://orin1607-ctrl.github.io/future-craft-core/claims-share?t=${token}` : "";
        const displayMsg = shareUrl
          ? `קישור שיתוף מאובטח נוצר בהצלחה עבור ${recipient_name}:\n${shareUrl}`
          : `קישור שיתוף מאובטח נוצר בהצלחה עבור ${recipient_name}`;

        return {
          success: true,
          message: displayMsg,
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
        const { task_description } = parameters as { task_description: string };
        const taskId = `TSK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

        const taskRow = {
          id: taskId,
          done: "false",
          workStatus: "open",
          action: task_description,
          claimId,
          source: `דליה AI (${userName || "משתמש"})`,
          createdAt: new Date().toISOString(),
        };

        const { error: taskErr } = await supabase.from("claims_tasks").insert({
          id: taskId,
          claim_id: claimId,
          row_data: taskRow,
        });

        if (taskErr) {
          return { success: false, message: `יצירת המשימה נכשלה: ${taskErr.message}`, error: taskErr.message };
        }

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

        const trd = (curTask?.row_data && typeof curTask.row_data === "object" ? curTask.row_data : {}) as Record<string, unknown>;
        const patchTrd = { ...trd, done: "true", workStatus: "done", closedAt: new Date().toISOString() };

        const { error: closeErr } = await supabase
          .from("claims_tasks")
          .update({ row_data: patchTrd })
          .eq("id", task_id)
          .eq("claim_id", claimId);

        if (closeErr) {
          return { success: false, message: `סגירת המשימה נכשלה: ${closeErr.message}`, error: closeErr.message };
        }

        await supabase.from("claims_history").insert({
          id: `HIS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          claim_id: claimId,
          row_data: {
            action: "סגירת משימה",
            note: `משימה ${task_id} נסגרה דרך דליה AI`,
            type: "task_closed",
            by: userName || "דליה AI",
            at: new Date().toLocaleString("he-IL"),
          },
        });

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
        const histId = `HIS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

        const { error: insErr } = await supabase.from("claims_history").insert({
          id: histId,
          claim_id: claimId,
          row_data: {
            action: "הערת דליה AI",
            note,
            type: "ai_note",
            by: userName || "דליה AI",
            at: new Date().toLocaleString("he-IL"),
          },
        });

        if (insErr) {
          return { success: false, message: `הוספת ההערה נכשלה: ${insErr.message}`, error: insErr.message };
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

        // 2. Claim Counter Bump
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

        const newClaimId = `DAL-${new Date().getFullYear()}-${String(nextCount).padStart(4, "0")}`;
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
          claimNumber: claim.claim_number !== "חסר" ? claim.claim_number : "",
          insClaim: claim.claim_number !== "חסר" ? claim.claim_number : "",
          accidentDate: claim.accident_date !== "חסר" ? claim.accident_date : "",
          surveyorName: claim.surveyor !== "חסר" ? claim.surveyor : "",
          garageName: claim.garage || "מוסך אורן",
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
