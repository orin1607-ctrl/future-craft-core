// supabase/functions/help-ai-chat/garageTools.ts
// Fully-featured AI tools for Garage Management & Dashboard execution in Hebrew
// Complete isolation from claims data, full coverage of all manual garage operations

export interface GaragePendingAction {
  preview_id: string;
  summary: string;
  tool_name: string;
  action_type: string;
  parameters: Record<string, unknown>;
}

export const GARAGE_SYSTEM_PROMPT_INSTRUCTIONS = `
אתה "דליה AI" – העוזר האישי החכם והמתקדם של ניהול המוסך והדשבורד הראשי של אורן קאר (Orin Car).
תפקידך לסייע למנהל המוסך, ליועצי השירות ולצוות התפעול בניהול כלל פעילויות המוסך, ביצוע פעולות אמיתיות במערכת, מתן מידע מדויק והפקת דוחות.

--- עקרונות ברזל והתנהגות נדרשת ---
1. הפרדה מוחלטת מניהול התביעות:
   - אתה פועל אך ורק בהקשר מוסך ודשבורד.
   - אל תציג או תזכיר מספרי תביעות (כמו DAL-), חברות ביטוח או טפסים של תביעות, אלא אם מדובר בתיק מוסך בלבד.
   - מספרי התיקים של המוסך הם במבנה GM-YYYY-XXXX (לדוגמה: GM-2026-0043) או UUID.

2. ביצוע פעולות אמיתיות (Preview & Approval):
   - כל פעולת שינוי, יצירה או שמירה במערכת (פתיחת לקוח, עדכון לקוח, הקמת רכב, פתיחת כרטיס עבודה, עדכון סטטוס, קליטת רכב/בדיקה, הצעת מחיר, פחחות/צבע/חלקים, משימות, תזכורות ותיעוד) חייבת לעבור דרך כרטיס אישור (Preview Action Card).
   - אל תבצע שינוי ללא הפקת כרטיס תצוגה מקדימה לאישור המשתמש.

3. ספר הלקוחות ורכבים:
   - חיפוש לקוחות (search_garage_customers) לפי שם, טלפון, ח.פ./ת.ז.
   - הקמת לקוח חדש (preview_create_garage_customer) עבור לקוח פרטי, עסקי או צי רכב.
   - עדכון פרטי לקוח (preview_update_garage_customer) כגון טלפון, דוא"ל, כתובת, איש קשר והערות.
   - חיפוש רכבים (search_garage_vehicles) לפי מספר לוחית רישוי.
   - הקמת רכב ושיוכו ללקוח (preview_create_garage_vehicle).
   - היסטוריית טיפולים ועבודות ללקוח/רכב (get_garage_customer_history).

4. קבלת רכב ופתיחת כרטיס עבודה:
   - פתיחת כרטיס עבודה (preview_create_garage_case) במסלול קליטה (intake_first) או הצעת מחיר (quote_first).
   - קליטה ובדיקת רכב (preview_update_garage_intake): ק"מ, דלק, מפתחות, תאורה, פנים הרכב, תלונת לקוח והערות בוחן.
   - שלבי עבודה וסטטוסים (preview_update_garage_case_status): בדיקת רכב, הצעה בהכנה, ממתין לאישור, עבודה התחילה / בעבודה, עבודה הסתיימה, תיק סגור.

5. הצעות מחיר, פחחות, צבע וחלקים:
   - עריכת הצעת מחיר (preview_update_garage_quote): תוקף הצעה, אישור לקוח, סכום מאושר, הערות.
   - פירוט נזקים, עבודות פחחות/צבע, חלקי חילוף ואישורים חריגים (preview_update_garage_repair_details).
   - חישוב סכומים ומע"מ (17%).

6. משימות, תזכורות, מסמכים ודוחות:
   - יצירת משימות למעקב (preview_create_garage_task).
   - הגדרת תזכורות בזמן מוגדר (preview_create_garage_reminder).
   - איתור ופירוט תמונות ומסמכים (list_garage_case_media).
   - הוספת תיעוד/מסמך לתיק (preview_add_garage_media_note).
   - הפקת טבלת דוח תיקים פתוחים (get_garage_status_report_table): מחזיר טבלה עם מספר כרטיס, לקוח, לוחית, סטטוס, שלב וקישור ישיר.
   - הפקת דוח סיכום מלא של כרטיס עבודה (get_garage_case_summary_report).

7. פענוח מסמכים ותמונות (OCR & Vision):
   - קליטה מרישיון רכב: כאשר מועלה צילום/PDF של רישיון רכב, חלץ בדיוק: מספר לוחית רישוי, יצרן, דגם, שנת ייצור, צבע, שלדה (VIN), נפח/סוג מנוע, שם בעל הרכב הרשום, ת.ז./ח.פ. בעלים ותוקף הרישיון. בדוק אם הלקוח/רכב כבר קיימים למניעת כפילויות, הבדל בין בעל הרכב למזמין התיקון, והכן כרטיס preview_garage_onboard_from_vehicle_license לקליטה ופתיחת כרטיס עבודה.
   - קליטת הזמנת עבודה של לקוח/צי/ביטוח: כאשר מועלית הזמנה/פקודת עבודה, חלץ: מספר הזמנה, שם מזמין, תאריך הזמנה, איש קשר, נהג, לוחית רישוי, תלונות/עבודות נדרשות, סכום מאושר והוראות מיוחדות. הכן כרטיס preview_garage_create_customer_order לשמירה ב-garage_orders.
   - שליחת הצעה ואישור לקוח: הכן כרטיס preview_send_garage_quote לשליחת הצעת מחיר ללקוח (WhatsApp/SMS/מייל), ולאחר אישור הלקוח רשום אותו עם preview_approve_garage_quote לעדכון הסטטוס ל-'אושר לביצוע'.
   - דיוק מרבי: אל תמציא נתונים. אם שדה לא קריא, ציין שלא זוהה.

8. הצעות מחיר מרובות שורות ורציפות:
   - תמיכה מלאה בהכתבה או כתיבה של מספר עבודות וחלקי חילוף בפעם אחת (preview_update_garage_repair_details ו-preview_update_garage_quote).
   - חשב תמיד סכום ביניים, מע"מ 17% וסה"כ לתשלום, ללא מחיקת פריטים קיימים (מצב append).

9. שפה וסגנון:
   - השב תמיד בעברית מקצועית, בהירה, אדיבה ותמציתית.
   - השתמש בעיצוב Markdown קריא ומסודר.
   - אל תמציא נתונים או מספרי תיקים – בדוק תמיד דרך הכלים המחוברים למסד הנתונים.
`;

export const GARAGE_GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "get_garage_dashboard_summary",
        description: "קבלת תמונת מצב וסטטיסטיקות עדכניות על כלל תיקי המוסך: מספר תיקים פתוחים, פילוח לפי סטטוסים (בדיקה, הצעת מחיר, ממתין לאישור, בעבודה, הושלם), עומסים ורכבים בטיפול פעיל.",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
      {
        name: "get_garage_status_report_table",
        description: "הפקת טבלת דוח מובנית של כל כרטיסי העבודה הפעילים במוסך עם מספר כרטיס, שם לקוח, לוחית רישוי, סטטוס, שלב וקישור ישיר לתיק.",
        parameters: {
          type: "OBJECT",
          properties: {
            status: {
              type: "STRING",
              description: "סינון לפי סטטוס (ריק עבור כל התיקים הפתוחים)",
            },
            limit: {
              type: "NUMBER",
              description: "מספר מקסימלי של תיקים להצגה (ברירת מחדל 50)",
            },
          },
        },
      },
      {
        name: "search_garage_cases",
        description: "חיפוש תיקי מוסך וכרטיסי עבודה לפי מספר תיק (כגון GM-2026-0043), שם לקוח, מספר לוחית רישוי של הרכב, סטטוס או מסלול.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "מחרוזת חיפוש חופשית (מספר תיק, לוחית רישוי, שם לקוח, טלפון וכו')",
            },
            status: {
              type: "STRING",
              description: "סינון לפי סטטוס מסוים (למשל 'בדיקת רכב', 'הצעה בהכנה', 'ממתין לאישור', 'עבודה התחילה', 'עבודה הסתיימה', 'תיק סגור') או ריק לכל הסטטוסים",
            },
          },
        },
      },
      {
        name: "get_garage_case_details",
        description: "קבלת הפרטים המלאים של כרטיס עבודה במוסך: פרטי לקוח, פרטי רכב, קליטה ובדיקה, נזקים, הצעת מחיר, עבודות, חלקים, אישורים חריגים, שלב בטיפול, משימות, תזכורות והיסטוריה.",
        parameters: {
          type: "OBJECT",
          properties: {
            case_id: {
              type: "STRING",
              description: "מזהה התיק (UUID) או מספר התיק (GM-2026-XXXX)",
            },
          },
          required: ["case_id"],
        },
      },
      {
        name: "search_garage_customers",
        description: "חיפוש לקוחות בספר הלקוחות של המוסך לפי שם, מספר טלפון, ח.פ./ת.ז., שם חברה או דוא\"ל.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "שם לקוח, טלפון, חברה או ת.ז.",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "preview_create_garage_customer",
        description: "הכנת כרטיס אישור להקמת לקוח חדש בספר הלקוחות של המוסך (לקוח פרטי, עסקי או צי רכב).",
        parameters: {
          type: "OBJECT",
          properties: {
            name: {
              type: "STRING",
              description: "שם הלקוח המלא או שם העסק",
            },
            customer_type: {
              type: "STRING",
              description: "סוג הלקוח: 'private' (פרטי), 'business' (עסקי), 'fleet' (צי רכב)",
            },
            phone: {
              type: "STRING",
              description: "מספר טלפון עיקרי של הלקוח",
            },
            second_phone: {
              type: "STRING",
              description: "טלפון משני (אופציונלי)",
            },
            email: {
              type: "STRING",
              description: "כתובת דוא\"ל (אופציונלי)",
            },
            address: {
              type: "STRING",
              description: "כתובת מגורים / עסק (אופציונלי)",
            },
            business_id: {
              type: "STRING",
              description: "ת.ז. או ח.פ. / עוסק מורשה (אופציונלי)",
            },
            contact_person: {
              type: "STRING",
              description: "איש קשר בעסק או בצי הרכב (אופציונלי)",
            },
            notes: {
              type: "STRING",
              description: "הערות כלליות על הלקוח",
            },
          },
          required: ["name", "phone"],
        },
      },
      {
        name: "preview_update_garage_customer",
        description: "הכנת כרטיס אישור לעדכון פרטי לקוח קיים בספר הלקוחות (טלפון, דוא\"ל, כתובת, איש קשר, סוג לקוח או הערות).",
        parameters: {
          type: "OBJECT",
          properties: {
            customer_id: {
              type: "STRING",
              description: "מזהה הלקוח (UUID) או שאילתת איתור לפי שם/טלפון",
            },
            name: { type: "STRING", description: "שם מעודכן (אם שונה)" },
            customer_type: { type: "STRING", description: "סוג לקוח: private, business, fleet" },
            phone: { type: "STRING", description: "טלפון מעודכן" },
            second_phone: { type: "STRING", description: "טלפון משני מעודכן" },
            email: { type: "STRING", description: "דוא\"ל מעודכן" },
            address: { type: "STRING", description: "כתובת מעודכנת" },
            business_id: { type: "STRING", description: "ת.ז. / ח.פ. מעודכן" },
            contact_person: { type: "STRING", description: "איש קשר מעודכן" },
            notes: { type: "STRING", description: "הערות מעודכנות" },
          },
          required: ["customer_id"],
        },
      },
      {
        name: "get_garage_customer_history",
        description: "איתור היסטוריית כרטיסי עבודה, טיפולים ותיקונים קודמים עבור לקוח מסוים או מספר רכב מסוים.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "שם לקוח, מספר טלפון, או מספר לוחית רישוי של הרכב",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "search_garage_vehicles",
        description: "חיפוש רכבים בספר הרכבים של המוסך לפי מספר לוחית רישוי, יצרן, דגם או שם לקוח משויך.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "מספר לוחית רישוי או דגם",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "preview_create_garage_vehicle",
        description: "הכנת כרטיס אישור להקמת רכב חדש בספר הרכבים ושיוכו ללקוח קיים.",
        parameters: {
          type: "OBJECT",
          properties: {
            plate: {
              type: "STRING",
              description: "מספר לוחית רישוי של הרכב",
            },
            customer_id: {
              type: "STRING",
              description: "מזהה הלקוח המשויך (UUID) או שם הלקוח",
            },
            make: { type: "STRING", description: "יצרן הרכב (למשל: יונדאי, טויוטה, קיה)" },
            model: { type: "STRING", description: "דגם הרכב (למשל: איוניק, קורולה, ספורטאז')" },
            year: { type: "NUMBER", description: "שנת ייצור" },
            color: { type: "STRING", description: "צבע הרכב" },
            vin: { type: "STRING", description: "מספר שלדה (VIN)" },
            notes: { type: "STRING", description: "הערות על הרכב" },
          },
          required: ["plate"],
        },
      },
      {
        name: "preview_create_garage_case",
        description: "הכנת כרטיס אישור לפתיחת כרטיס עבודה חדש במוסך. ניתן לפתוח במסלול קליטה (intake_first) או הצעת מחיר (quote_first).",
        parameters: {
          type: "OBJECT",
          properties: {
            customer_id: {
              type: "STRING",
              description: "מזהה לקוח קיים (אם ידוע)",
            },
            customer_name: {
              type: "STRING",
              description: "שם הלקוח המלא",
            },
            customer_phone: {
              type: "STRING",
              description: "טלפון של הלקוח",
            },
            vehicle_id: {
              type: "STRING",
              description: "מזהה רכב קיים (אם ידוע)",
            },
            vehicle_plate: {
              type: "STRING",
              description: "מספר לוחית רישוי של הרכב",
            },
            vehicle_model: {
              type: "STRING",
              description: "יצרן ודגם הרכב (למשל 'מאזדה 3 2021')",
            },
            route: {
              type: "STRING",
              description: "מסלול הטיפול: 'intake_first' (קליטת רכב ובדיקה תחילה) או 'quote_first' (הצעת מחיר תחילה)",
            },
            status: {
              type: "STRING",
              description: "סטטוס ראשוני (ברירת מחדל: 'בדיקת רכב' לקליטה, או 'הצעה בהכנה' להצעה)",
            },
            notes: {
              type: "STRING",
              description: "תלונת לקוח או תיאור הנזק הראשוני",
            },
            damage_items: {
              type: "ARRAY",
              description: "מוקדי נזק ידועים (למשל: כנף ימין, פגוש קדמי)",
              items: {
                type: "OBJECT",
                properties: {
                  part: { type: "STRING" },
                  status: { type: "STRING" },
                },
              },
            },
          },
          required: ["vehicle_plate"],
        },
      },
      {
        name: "preview_update_garage_case_status",
        description: "הכנת כרטיס אישור לעדכון סטטוס ושלב כרטיס עבודה (בדיקת רכב, הצעה בהכנה, ממתין לאישור, עבודה התחילה, עבודה הסתיימה, תיק סגור).",
        parameters: {
          type: "OBJECT",
          properties: {
            case_id: {
              type: "STRING",
              description: "מזהה התיק (UUID) או מספר תיק (GM-2026-XXXX)",
            },
            status: {
              type: "STRING",
              description: "הסטטוס החדש (לדוגמה: 'הצעה בהכנה', 'ממתין לאישור', 'עבודה התחילה', 'עבודה הסתיימה', 'תיק סגור')",
            },
            flow_stage: {
              type: "STRING",
              description: "שלב בתהליך: 'inspection', 'quote', 'approval', 'work', 'done', 'closed'",
            },
            notes: {
              type: "STRING",
              description: "הערת ציר זמן המפרטת את הסיבה לשינוי הסטטוס",
            },
          },
          required: ["case_id", "status"],
        },
      },
      {
        name: "preview_update_garage_intake",
        description: "הכנת כרטיס אישור לעדכון פרטי קליטה ובדיקת רכב (ק\"מ, כמות דלק, מספר מפתחות, תקינות תאורה, מצב פנים הרכב, תלונת לקוח, הערות בוחן).",
        parameters: {
          type: "OBJECT",
          properties: {
            case_id: {
              type: "STRING",
              description: "מזהה התיק (UUID) או מספר תיק (GM-2026-XXXX)",
            },
            intake_km: {
              type: "STRING",
              description: "מד אוץ (קילומטראז') בכניסה למוסך",
            },
            intake_fuel: {
              type: "STRING",
              description: "כמות דלק (למשל: 'רבע', 'חצי', 'שלושת רבעי', 'מלא')",
            },
            intake_keys: {
              type: "STRING",
              description: "מספר מפתחות שנמסרו (למשל: '1', '2')",
            },
            intake_lights: {
              type: "STRING",
              description: "בדיקת תאורה (למשל: 'תקין', 'נורה שרופה')",
            },
            intake_interior: {
              type: "STRING",
              description: "מצב פנים הרכב (למשל: 'נקי', 'שריטה בריפוד')",
            },
            complaints: {
              type: "STRING",
              description: "תלונת לקוח ופירוט תקלות לטיפול",
            },
            damage_notes: {
              type: "STRING",
              description: "הערות בוחן/קולט הרכב לגבי נזקים קיימים",
            },
            intake_worker: {
              type: "STRING",
              description: "שם העובד שקלט ובדק את הרכב",
            },
          },
          required: ["case_id"],
        },
      },
      {
        name: "preview_update_garage_quote",
        description: "הכנת כרטיס אישור לעדכון נתוני הצעת מחיר ואישור לקוח (תוקף הצעה, אישור לקוח, סכום מאושר והערות).",
        parameters: {
          type: "OBJECT",
          properties: {
            case_id: {
              type: "STRING",
              description: "מזהה התיק (UUID) או מספר תיק (GM-2026-XXXX)",
            },
            quote_notes: {
              type: "STRING",
              description: "הערות כלליות להצעת המחיר",
            },
            quote_validity: {
              type: "STRING",
              description: "תוקף ההצעה (למשל '14 יום', '30 יום')",
            },
            quote_approved: {
              type: "BOOLEAN",
              description: "האם הלקוח אישר את הצעת המחיר (true/false)",
            },
            approved_by: {
              type: "STRING",
              description: "שם המאשר מטעם הלקוח",
            },
            work_order_amount: {
              type: "NUMBER",
              description: "סכום מאושר סופי לפני מע\"מ",
            },
            work_order_notes: {
              type: "STRING",
              description: "הערות נוספות להזמנת העבודה",
            },
          },
          required: ["case_id"],
        },
      },
      {
        name: "preview_update_garage_repair_details",
        description: "הכנת כרטיס אישור לעדכון פרטי תיקון, פחחות וצבע: עבודות, חלקי חילוף, מוקדי נזק ואישורים חריגים.",
        parameters: {
          type: "OBJECT",
          properties: {
            case_id: {
              type: "STRING",
              description: "מזהה התיק (UUID) או מספר תיק (GM-2026-XXXX)",
            },
            damage_items: {
              type: "ARRAY",
              description: "פריטי נזק לפחחות וצבע (למשל: כנף קדמית, דלת שמאל)",
              items: {
                type: "OBJECT",
                properties: {
                  part: { type: "STRING", description: "חלק/אזור" },
                  status: { type: "STRING", description: "תיאור הנזק" },
                },
              },
            },
            quote_works: {
              type: "ARRAY",
              description: "עבודות פחחות, צבע ומכונאות לביצוע",
              items: {
                type: "OBJECT",
                properties: {
                  part: { type: "STRING", description: "חלק או מכלול" },
                  type: { type: "STRING", description: "סוג עבודה: 'פחחות', 'צבע', 'פירוק והרכבה', 'מכונאות'" },
                  price: { type: "NUMBER", description: "מחיר בש\"ח" },
                  qty: { type: "NUMBER", description: "כמות שעות או יחידות (ברירת מחדל 1)" },
                  desc: { type: "STRING", description: "פירוט נוסף" },
                },
              },
            },
            quote_parts: {
              type: "ARRAY",
              description: "חלקי חילוף נדרשים לתיקון",
              items: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING", description: "שם החלק" },
                  price: { type: "NUMBER", description: "מחיר בש\"ח" },
                  qty: { type: "NUMBER", description: "כמות" },
                  supplier: { type: "STRING", description: "ספק החלק" },
                  sku: { type: "STRING", description: "מק\"ט" },
                },
              },
            },
            extra_approvals: {
              type: "ARRAY",
              description: "אישורים חריגים (עבודה או חלק נוסף שנתגלה במהלך התיקון)",
              items: {
                type: "OBJECT",
                properties: {
                  text: { type: "STRING", description: "תיאור העבודה/החלק החריג" },
                  price: { type: "NUMBER", description: "תוספת מחיר בש\"ח" },
                  status: { type: "STRING", description: "'approved', 'pending' או 'rejected'" },
                },
              },
            },
            mode: {
              type: "STRING",
              description: "'append' להוספה על הקיים (ברירת מחדל) או 'replace' להחלפה מלאה",
            },
          },
          required: ["case_id"],
        },
      },
      {
        name: "preview_create_garage_task",
        description: "הכנת כרטיס אישור ליצירת משימה חדשה למעקב או טיפול בתיק מוסך.",
        parameters: {
          type: "OBJECT",
          properties: {
            case_id: {
              type: "STRING",
              description: "מזהה התיק (UUID) או מספר תיק (GM-2026-XXXX)",
            },
            title: {
              type: "STRING",
              description: "כותרת ותיאור המשימה (לדוגמה: 'להזמין פגוש מקורי מספק', 'לעדכן את הלקוח שהרכב מוכן')",
            },
            due_date: {
              type: "STRING",
              description: "תאריך יעד לביצוע (בפורמט YYYY-MM-DD או תיאור כגון 'מחר')",
            },
            assignee: {
              type: "STRING",
              description: "שם האחראי לביצוע",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "preview_create_garage_reminder",
        description: "הכנת כרטיס אישור להגדרת תזכורת עתידית עבור תיק מוסך.",
        parameters: {
          type: "OBJECT",
          properties: {
            case_id: {
              type: "STRING",
              description: "מזהה התיק (UUID) או מספר תיק (GM-2026-XXXX)",
            },
            title: {
              type: "STRING",
              description: "תוכן התזכורת",
            },
            remind_at: {
              type: "STRING",
              description: "מועד התזכורת (תאריך ושעה או תיאור כגון 'מחר בבוקר')",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "list_garage_case_media",
        description: "רשימת כל המסמכים, התמונות והקבצים המצורפים לכרטיס עבודה (garage_media).",
        parameters: {
          type: "OBJECT",
          properties: {
            case_id: {
              type: "STRING",
              description: "מזהה התיק (UUID) או מספר תיק (GM-2026-XXXX)",
            },
          },
          required: ["case_id"],
        },
      },
      {
        name: "preview_add_garage_media_note",
        description: "הכנת כרטיס אישור להוספת רישום מסמך/תמונה או תיעוד קובץ לכרטיס העבודה במוסך.",
        parameters: {
          type: "OBJECT",
          properties: {
            case_id: {
              type: "STRING",
              description: "מזהה התיק (UUID) או מספר תיק (GM-2026-XXXX)",
            },
            title: {
              type: "STRING",
              description: "שם או כותרת המסמך/התמונה (למשל 'צילום מוקד נזק כנף', 'אישור הזמנת חלקים')",
            },
            category: {
              type: "STRING",
              description: "קטגוריה: 'damage' (נזק), 'document' (מסמך), 'quote' (הצעה), 'invoice' (חשבונית), 'other'",
            },
            notes: {
              type: "STRING",
              description: "הערות נוספות על המסמך/התמונה",
            },
          },
          required: ["case_id", "title"],
        },
      },
      {
        name: "preview_garage_onboard_from_vehicle_license",
        description: "קליטת לקוח ורכב מרישיון רכב (צילום/קובץ) ובדיקת כפילויות לפני פתיחת כרטיס עבודה. מזהה לוחית, יצרן, דגם, שנת ייצור, צבע, שלדה, בעל רכב לעומת מזמין.",
        parameters: {
          type: "OBJECT",
          properties: {
            plate_number: { type: "STRING", description: "מספר לוחית רישוי (חובה)" },
            make: { type: "STRING", description: "יצרן הרכב (למשל טויוטה, יונדאי, מאזדה)" },
            model: { type: "STRING", description: "דגם הרכב (למשל קורולה, איוניק, 3)" },
            year: { type: "STRING", description: "שנת ייצור" },
            color: { type: "STRING", description: "צבע הרכב" },
            vin: { type: "STRING", description: "מספר שלדה (VIN)" },
            engine_volume: { type: "STRING", description: "נפח או סוג מנוע" },
            owner_name: { type: "STRING", description: "שם בעל הרכב הרשום ברישיון" },
            owner_id_number: { type: "STRING", description: "ת.ז. או ח.פ. של בעל הרכב הרשום ברישיון" },
            valid_until: { type: "STRING", description: "תוקף רישיון הרכב" },
            orderer_name: { type: "STRING", description: "שם המזמין/הלקוח בפועל (אם שונה מבעל הרכב)" },
            orderer_phone: { type: "STRING", description: "טלפון המזמין/הלקוח" },
            orderer_is_owner: { type: "BOOLEAN", description: "האם המזמין הוא גם בעל הרכב הרשום (ברירת מחדל true)" },
            complaints: { type: "STRING", description: "תלונות הלקוח או סיבת הכניסה למוסך" },
            route: { type: "STRING", description: "'intake_first' (קליטה תחילה, ברירת מחדל) או 'quote_first' (הצעת מחיר תחילה)" },
          },
          required: ["plate_number"],
        },
      },
      {
        name: "preview_garage_create_customer_order",
        description: "קליטת הזמנת עבודה / פקודת עבודה של לקוח, חברה או צי רכב ושמירתה במערכת המוסך ובטבלת garage_orders.",
        parameters: {
          type: "OBJECT",
          properties: {
            case_id: { type: "STRING", description: "מזהה התיק (UUID), מספר תיק (GM-2026-XXXX) או לוחית רישוי" },
            order_number: { type: "STRING", description: "מספר הזמנת הלקוח / פקודת עבודה (חובה)" },
            customer_name: { type: "STRING", description: "שם הלקוח / החברה המזמינה" },
            customer_phone: { type: "STRING", description: "טלפון איש הקשר" },
            plate_number: { type: "STRING", description: "מספר לוחית רישוי של הרכב" },
            order_date: { type: "STRING", description: "תאריך ההזמנה" },
            approved_amount: { type: "NUMBER", description: "סכום מאושר להזמנה לפני מע\"מ" },
            contact_name: { type: "STRING", description: "שם איש קשר בהזמנה" },
            driver_name: { type: "STRING", description: "שם הנהג" },
            description: { type: "STRING", description: "פירוט העבודות או התלונות הנדרשות בהזמנה" },
            special_instructions: { type: "STRING", description: "הוראות מיוחדות או דגשים" },
            approval_reference: { type: "STRING", description: "אסמכתא או מספר אישור" },
          },
          required: ["order_number"],
        },
      },
      {
        name: "preview_send_garage_quote",
        description: "הכנת כרטיס אישור לשליחת הצעת מחיר ללקוח בערוצי תקשורת (WhatsApp, SMS, אימייל) עם פירוט הסכומים וקישור מעקב.",
        parameters: {
          type: "OBJECT",
          properties: {
            case_id: { type: "STRING", description: "מזהה התיק (UUID) או מספר תיק (GM-2026-XXXX)" },
            recipient_name: { type: "STRING", description: "שם הנמען / הלקוח" },
            recipient_phone: { type: "STRING", description: "מספר טלפון לשליחת WhatsApp / SMS" },
            recipient_email: { type: "STRING", description: "כתובת אימייל" },
            channel: { type: "STRING", description: "'whatsapp', 'sms' או 'email' (ברירת מחדל 'whatsapp')" },
            quote_notes: { type: "STRING", description: "הודעה מלווה או הערות להצעה" },
          },
          required: ["case_id"],
        },
      },
      {
        name: "preview_approve_garage_quote",
        description: "רישום אישור לקוח להצעת מחיר, עדכון סטטוס כרטיס העבודה והזמנת העבודה ל-'אושר לביצוע' והעברה לתחילת עבודה.",
        parameters: {
          type: "OBJECT",
          properties: {
            case_id: { type: "STRING", description: "מזהה התיק (UUID) או מספר תיק (GM-2026-XXXX)" },
            approved_by: { type: "STRING", description: "שם המאשר מטעם הלקוח" },
            approved_amount: { type: "NUMBER", description: "סכום מאושר סופי לפני מע\"מ (אופציונלי)" },
            approval_notes: { type: "STRING", description: "הערות או תנאי אישור הלקוח" },
          },
          required: ["case_id"],
        },
      },
      {
        name: "get_garage_case_summary_report",
        description: "הפקת דוח סיכום מקיף, מקצועי ומפורט על כרטיס עבודה במוסך (פרטי לקוח, רכב, פירוט נזקים, עבודות, חלקים, עלויות, סטטוס ומסמכים).",
        parameters: {
          type: "OBJECT",
          properties: {
            case_id: {
              type: "STRING",
              description: "מזהה התיק (UUID) או מספר תיק (GM-2026-XXXX)",
            },
          },
          required: ["case_id"],
        },
      },
    ],
  },
];

// Helper to resolve case ID by UUID, case_number, or plate snapshot
async function resolveGarageCase(supabase: any, caseIdentifier: string) {
  const clean = String(caseIdentifier || "").trim();
  if (!clean) return null;

  // Try UUID match
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
    const { data } = await supabase.from("garage_cases").select("*").eq("id", clean).single();
    if (data) return data;
  }

  // Try case_number match
  const { data } = await supabase.from("garage_cases").select("*").ilike("case_number", `%${clean}%`).limit(1);
  if (data && data.length > 0) return data[0];

  // Try plate snapshot match
  const { data: plateData } = await supabase.from("garage_cases").select("*").ilike("vehicle_plate_snapshot", `%${clean}%`).limit(1);
  if (plateData && plateData.length > 0) return plateData[0];

  return null;
}

export async function executeGarageTool(
  toolName: string,
  args: Record<string, unknown>,
  supabase: any,
  caseId: string | null,
  userId: string,
  actorName: string,
): Promise<{ result: unknown; preview?: GaragePendingAction }> {
  const targetCaseId = String(args?.case_id || caseId || "").trim();

  switch (toolName) {
    case "get_garage_dashboard_summary": {
      const { data: cases, error } = await supabase
        .from("garage_cases")
        .select("id, case_number, status, customer_name_snapshot, vehicle_plate_snapshot, created_at, updated_at, case_data")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw new Error(`שגיאה בטעינת נתוני מוסך: ${error.message}`);
      const list = cases || [];
      const total = list.length;

      const byStatus: Record<string, number> = {};
      let inWorkCount = 0;
      let quoteWaitingCount = 0;
      let inspectionCount = 0;
      let closedCount = 0;

      for (const c of list) {
        const st = c.status || "ללא סטטוס";
        byStatus[st] = (byStatus[st] || 0) + 1;
        if (st.includes("עבודה") || st.includes("בעבודה") || st.includes("התחילה")) inWorkCount++;
        if (st.includes("ממתין") || st.includes("הצעה")) quoteWaitingCount++;
        if (st.includes("בדיק")) inspectionCount++;
        if (st.includes("סגור") || st.includes("הושלם")) closedCount++;
      }

      const recentCases = list.slice(0, 8).map((c: any) => ({
        case_id: c.id,
        case_number: c.case_number,
        customer: c.customer_name_snapshot,
        plate: c.vehicle_plate_snapshot,
        status: c.status,
        date: c.created_at ? new Date(c.created_at).toLocaleDateString("he-IL") : "",
      }));

      return {
        result: {
          total_cases: total,
          active_cases: total - closedCount,
          cars_in_work: inWorkCount,
          quotes_pending_approval: quoteWaitingCount,
          cars_in_inspection: inspectionCount,
          closed_cases: closedCount,
          breakdown_by_status: byStatus,
          recent_cases: recentCases,
        },
      };
    }

    case "get_garage_status_report_table": {
      const statusFilter = String(args?.status || "").trim();
      const limit = Number(args?.limit) || 50;

      let q = supabase
        .from("garage_cases")
        .select("id, case_number, customer_name_snapshot, vehicle_plate_snapshot, status, case_data, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (statusFilter && statusFilter !== "all") {
        q = q.ilike("status", `%${statusFilter}%`);
      }

      const { data, error } = await q;
      if (error) throw new Error(`שגיאה בהפקת דוח תיקי מוסך: ${error.message}`);
      const rows = data || [];

      // Format markdown table that ClaimsAiWorkspace docks automatically
      const tableRows = rows.map((c: any) => {
        const cd = c.case_data || {};
        const dateStr = c.created_at ? new Date(c.created_at).toLocaleDateString("he-IL") : "—";
        const stage = cd.flowStage === "inspection" ? "קליטה ובדיקה"
          : cd.flowStage === "quote" ? "הצעת מחיר"
          : cd.flowStage === "approval" ? "אישור לקוח"
          : cd.flowStage === "work" ? "בעבודה"
          : cd.flowStage === "done" ? "הסתיים"
          : cd.flowStage === "closed" ? "סגור"
          : cd.flowStage || "פעיל";

        return `|[${c.case_number}](#/garage-management/${c.id})|${c.customer_name_snapshot || "—"}|${c.vehicle_plate_snapshot || "—"}|${c.status || "—"}|${stage}|${dateStr}|[פתח תיק](#/garage-management/${c.id})|`;
      });

      const reportMarkdown = [
        `# 🚗 דוח כרטיסי עבודה במוסך (סה״כ: ${rows.length} תיקים)`,
        `עודכן בתאריך: ${new Date().toLocaleDateString("he-IL")} · שעה: ${new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`,
        "",
        "| כרטיס עבודה | שם לקוח | לוחית רישוי | סטטוס | שלב | תאריך פתיחה | פעולות |",
        "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
        ...tableRows,
      ].join("\n");

      return {
        result: {
          total_found: rows.length,
          table_markdown: reportMarkdown,
        },
      };
    }

    case "search_garage_cases": {
      const query = String(args?.query || "").trim();
      const statusFilter = String(args?.status || "").trim();

      let dbQuery = supabase
        .from("garage_cases")
        .select("id, case_number, customer_name_snapshot, vehicle_plate_snapshot, vehicle_label_snapshot, status, created_at, updated_at, case_data")
        .order("created_at", { ascending: false })
        .limit(25);

      if (query) {
        dbQuery = dbQuery.or(`case_number.ilike.%${query}%,customer_name_snapshot.ilike.%${query}%,vehicle_plate_snapshot.ilike.%${query}%`);
      }
      if (statusFilter && statusFilter !== "all") {
        dbQuery = dbQuery.ilike("status", `%${statusFilter}%`);
      }

      const { data, error } = await dbQuery;
      if (error) throw new Error(`חיפוש תיקים נכשל: ${error.message}`);

      return {
        result: {
          total_found: data?.length || 0,
          cases: (data || []).map((c: any) => ({
            id: c.id,
            case_number: c.case_number,
            customer_name: c.customer_name_snapshot,
            vehicle_plate: c.vehicle_plate_snapshot,
            vehicle_label: c.vehicle_label_snapshot,
            status: c.status,
            flow_stage: c.case_data?.flowStage || "inspection",
            created_at: c.created_at,
          })),
        },
      };
    }

    case "get_garage_case_details": {
      const gCase = await resolveGarageCase(supabase, targetCaseId);
      if (!gCase) {
        return { result: { error: `לא נמצא תיק מוסך תואם עבור: "${targetCaseId}"` } };
      }

      let customerRecord = null;
      if (gCase.customer_id) {
        const { data: cust } = await supabase.from("garage_customers").select("*").eq("id", gCase.customer_id).single();
        customerRecord = cust;
      }

      let vehicleRecord = null;
      if (gCase.vehicle_id) {
        const { data: veh } = await supabase.from("garage_vehicles").select("*").eq("id", gCase.vehicle_id).single();
        vehicleRecord = veh;
      }

      const cd = gCase.case_data || {};
      return {
        result: {
          id: gCase.id,
          case_number: gCase.case_number,
          status: gCase.status,
          flow_stage: cd.flowStage || "inspection",
          route: cd.route || "intake_first",
          opened_by_name: gCase.opened_by_name,
          created_at: gCase.created_at,
          customer: {
            id: gCase.customer_id,
            name: gCase.customer_name_snapshot || customerRecord?.name || "—",
            phone: customerRecord?.phone || "—",
            email: customerRecord?.email || "—",
            type: customerRecord?.customer_type || "פרטי",
            address: customerRecord?.address || "—",
          },
          vehicle: {
            id: gCase.vehicle_id,
            plate: gCase.vehicle_plate_snapshot || vehicleRecord?.plate || "—",
            make: vehicleRecord?.make || "",
            model: vehicleRecord?.model || gCase.vehicle_label_snapshot || "",
            year: vehicleRecord?.year || null,
            color: vehicleRecord?.color || "",
            vin: vehicleRecord?.vin || "",
          },
          intake: {
            km: cd.intakeKm || "—",
            fuel: cd.intakeFuel || "—",
            keys: cd.intakeKeys || "—",
            lights: cd.intakeLights || "—",
            interior: cd.intakeInterior || "—",
            worker: cd.intakeWorker || "—",
            done: !!cd.intakeDone,
          },
          quote: {
            notes: cd.quoteNotes || "",
            validity: cd.quoteValidity || "14 יום",
            approved: !!cd.quoteApproved,
            amount: cd.workOrderAmount || null,
          },
          damage_items: cd.damageItems || [],
          quote_works: cd.quoteWorks || [],
          quote_parts: cd.quoteParts || [],
          extra_approvals: cd.extraApprovals || [],
          tasks: cd.tasks || [],
          reminders: cd.reminders || [],
          timeline: (cd.timeline || []).slice(-10),
        },
      };
    }

    case "search_garage_customers": {
      const query = String(args?.query || "").trim();
      let dbQuery = supabase
        .from("garage_customers")
        .select("id, customer_number, customer_type, name, company_name, phone, second_phone, email, address, business_id, contact_person, notes")
        .order("name", { ascending: true })
        .limit(20);

      if (query) {
        dbQuery = dbQuery.or(`name.ilike.%${query}%,phone.ilike.%${query}%,company_name.ilike.%${query}%,business_id.ilike.%${query}%`);
      }

      const { data, error } = await dbQuery;
      if (error) throw new Error(`חיפוש לקוחות נכשל: ${error.message}`);

      return {
        result: {
          total_found: data?.length || 0,
          customers: (data || []).map((c: any) => ({
            id: c.id,
            customer_number: c.customer_number,
            customer_type: c.customer_type,
            name: c.name,
            company_name: c.company_name,
            phone: c.phone,
            second_phone: c.second_phone,
            email: c.email,
            address: c.address,
            business_id: c.business_id,
            contact_person: c.contact_person,
            notes: c.notes,
          })),
        },
      };
    }

    case "preview_create_garage_customer": {
      const name = String(args?.name || "").trim();
      const phone = String(args?.phone || "").trim();
      const customerType = String(args?.customer_type || "private").trim();
      const email = String(args?.email || "").trim();
      const address = String(args?.address || "").trim();
      const businessId = String(args?.business_id || "").trim();
      const contactPerson = String(args?.contact_person || "").trim();
      const notes = String(args?.notes || "").trim();
      const secondPhone = String(args?.second_phone || "").trim();

      if (!name || !phone) {
        return { result: { error: "חובה לספק שם וטלפון לפתיחת לקוח חדש." } };
      }

      const typeLabel = customerType === "business" ? "עסקי" : customerType === "fleet" ? "צי רכב" : "פרטי";
      const summary = `הקמת לקוח חדש בספר הלקוחות: "${name}" (${typeLabel}) · טלפון: ${phone}${email ? ` · דוא"ל: ${email}` : ""}${address ? ` · כתובת: ${address}` : ""}`;

      const pendingAction: GaragePendingAction = {
        preview_id: `g_cust_new_${Date.now()}`,
        summary,
        tool_name: "preview_create_garage_customer",
        action_type: "garage_create_customer",
        parameters: {
          name,
          phone,
          customer_type: customerType,
          email,
          address,
          business_id: businessId,
          contact_person: contactPerson,
          notes,
          second_phone: secondPhone,
        },
      };

      return {
        result: {
          status: "pending_user_confirmation",
          preview_card: pendingAction,
          message: `הכנתי כרטיס אישור להקמת לקוח חדש: "${name}". לחץ על 'אישור' לביצוע השמירה במערכת.`,
        },
        preview: pendingAction,
      };
    }

    case "preview_update_garage_customer": {
      const customerQuery = String(args?.customer_id || "").trim();
      if (!customerQuery) return { result: { error: "חובה לספק מזהה לקוח לעדכון." } };

      let targetCust = null;
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerQuery)) {
        const { data } = await supabase.from("garage_customers").select("*").eq("id", customerQuery).single();
        targetCust = data;
      } else {
        const { data } = await supabase.from("garage_customers").select("*").or(`name.ilike.%${customerQuery}%,phone.ilike.%${customerQuery}%`).limit(1);
        if (data && data.length > 0) targetCust = data[0];
      }

      if (!targetCust) {
        return { result: { error: `לא נמצא לקוח תואם לעדכון עבור: "${customerQuery}"` } };
      }

      const updates: Record<string, unknown> = {};
      const changesList: string[] = [];
      if (args.name && String(args.name).trim() !== targetCust.name) {
        updates.name = String(args.name).trim();
        changesList.push(`שם: ${updates.name}`);
      }
      if (args.phone && String(args.phone).trim() !== targetCust.phone) {
        updates.phone = String(args.phone).trim();
        changesList.push(`טלפון: ${updates.phone}`);
      }
      if (args.email && String(args.email).trim() !== targetCust.email) {
        updates.email = String(args.email).trim();
        changesList.push(`דוא"ל: ${updates.email}`);
      }
      if (args.address && String(args.address).trim() !== targetCust.address) {
        updates.address = String(args.address).trim();
        changesList.push(`כתובת: ${updates.address}`);
      }
      if (args.notes && String(args.notes).trim() !== targetCust.notes) {
        updates.notes = String(args.notes).trim();
        changesList.push(`הערות: ${updates.notes}`);
      }
      if (args.contact_person && String(args.contact_person).trim() !== targetCust.contact_person) {
        updates.contact_person = String(args.contact_person).trim();
        changesList.push(`איש קשר: ${updates.contact_person}`);
      }

      const summary = `עדכון פרטי לקוח "${targetCust.name}": ${changesList.join(", ") || "שמירת שינויים"}`;

      const pendingAction: GaragePendingAction = {
        preview_id: `g_cust_upd_${Date.now()}`,
        summary,
        tool_name: "preview_update_garage_customer",
        action_type: "garage_update_customer",
        parameters: {
          customer_id: targetCust.id,
          customer_name: targetCust.name,
          ...updates,
        },
      };

      return {
        result: {
          status: "pending_user_confirmation",
          preview_card: pendingAction,
          message: `הכנתי כרטיס אישור לעדכון פרטי לקוח "${targetCust.name}". לחץ על 'אישור' לשמירה.`,
        },
        preview: pendingAction,
      };
    }

    case "get_garage_customer_history": {
      const query = String(args?.query || "").trim();
      if (!query) return { result: { error: "חובה לספק שם לקוח או מספר לוחית רישוי." } };

      const { data: cases, error } = await supabase
        .from("garage_cases")
        .select("id, case_number, customer_name_snapshot, vehicle_plate_snapshot, status, case_data, created_at")
        .or(`customer_name_snapshot.ilike.%${query}%,vehicle_plate_snapshot.ilike.%${query}%`)
        .order("created_at", { ascending: false });

      if (error) throw new Error(`שגיאה בשליפת היסטוריה: ${error.message}`);
      const list = cases || [];

      return {
        result: {
          query,
          total_cases_found: list.length,
          history: list.map((c: any) => {
            const cd = c.case_data || {};
            const works = cd.quoteWorks || [];
            const parts = cd.quoteParts || [];
            const amount = cd.workOrderAmount || (works.reduce((s: number, w: any) => s + (Number(w.price) || 0) * (Number(w.qty) || 1), 0) + parts.reduce((s: number, p: any) => s + (Number(p.price) || 0) * (Number(p.qty) || 1), 0));
            return {
              case_id: c.id,
              case_number: c.case_number,
              plate: c.vehicle_plate_snapshot,
              status: c.status,
              date: c.created_at ? new Date(c.created_at).toLocaleDateString("he-IL") : "",
              amount_ils: amount || "—",
              works_count: works.length,
              parts_count: parts.length,
            };
          }),
        },
      };
    }

    case "search_garage_vehicles": {
      const query = String(args?.query || "").trim();
      let dbQuery = supabase
        .from("garage_vehicles")
        .select("id, customer_id, plate, make, model, year, color, vin, vehicle_type, notes")
        .order("plate", { ascending: true })
        .limit(20);

      if (query) {
        dbQuery = dbQuery.or(`plate.ilike.%${query}%,make.ilike.%${query}%,model.ilike.%${query}%,vin.ilike.%${query}%`);
      }

      const { data, error } = await dbQuery;
      if (error) throw new Error(`חיפוש רכבים נכשל: ${error.message}`);

      return {
        result: {
          total_found: data?.length || 0,
          vehicles: (data || []).map((v: any) => ({
            id: v.id,
            customer_id: v.customer_id,
            plate: v.plate,
            make: v.make,
            model: v.model,
            year: v.year,
            color: v.color,
            vin: v.vin,
            notes: v.notes,
          })),
        },
      };
    }

    case "preview_create_garage_vehicle": {
      const plate = String(args?.plate || "").trim();
      const customerQuery = String(args?.customer_id || "").trim();
      const make = String(args?.make || "").trim();
      const model = String(args?.model || "").trim();
      const year = args?.year ? Number(args.year) : null;
      const color = String(args?.color || "").trim();
      const vin = String(args?.vin || "").trim();
      const notes = String(args?.notes || "").trim();

      if (!plate) return { result: { error: "חובה לספק מספר לוחית רישוי להקמת רכב." } };

      let customerId = "";
      let customerName = "";
      if (customerQuery) {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerQuery)) {
          const { data } = await supabase.from("garage_customers").select("id, name, company_name").eq("id", customerQuery).single();
          if (data) {
            customerId = data.id;
            customerName = data.name || data.company_name;
          }
        } else {
          const { data } = await supabase
            .from("garage_customers")
            .select("id, name, company_name")
            .or(`name.ilike.%${customerQuery}%,company_name.ilike.%${customerQuery}%,phone.ilike.%${customerQuery}%`)
            .limit(1);
          if (data && data.length > 0) {
            customerId = data[0].id;
            customerName = data[0].name || data[0].company_name;
          }
        }
      }

      const summary = `הקמת רכב חדש בספר הרכבים: לוחית ${plate} (${make} ${model} ${year || ""})${customerName ? ` המשויך ללקוח "${customerName}"` : ""}`;

      const pendingAction: GaragePendingAction = {
        preview_id: `g_veh_new_${Date.now()}`,
        summary,
        tool_name: "preview_create_garage_vehicle",
        action_type: "garage_create_vehicle",
        parameters: {
          plate,
          customer_id: customerId || null,
          customer_name: customerName || customerQuery || null,
          make,
          model,
          year,
          color,
          vin,
          notes,
        },
      };

      return {
        result: {
          status: "pending_user_confirmation",
          preview_card: pendingAction,
          message: `הכנתי כרטיס אישור להקמת רכב ${plate}. לחץ על 'אישור' לשמירה במערכת.`,
        },
        preview: pendingAction,
      };
    }

    case "preview_create_garage_case": {
      let custName = String(args?.customer_name || "").trim();
      let custPhone = String(args?.customer_phone || "").trim();
      const vehPlate = String(args?.vehicle_plate || "").replace(/[^0-9A-Za-z]/g, "").trim();
      let vehModel = String(args?.vehicle_model || "").trim();
      const route = String(args?.route || "intake_first").trim();
      const status = String(args?.status || (route === "quote_first" ? "הצעה בהכנה" : "בדיקת רכב")).trim();
      const notes = String(args?.notes || "").trim();
      const damageItems = Array.isArray(args?.damage_items) ? args.damage_items : [];

      if (!vehPlate) {
        return { result: { error: "חובה לספק מספר לוחית רישוי של הרכב." } };
      }

      let existingVehicleId: string | null = null;
      let existingCustomerId: string | null = null;

      const { data: existingVehs } = await supabase
        .from("garage_vehicles")
        .select("id, customer_id, make, model, year")
        .eq("plate", vehPlate)
        .limit(1);
      if (existingVehs && existingVehs.length > 0) {
        const v = existingVehs[0];
        existingVehicleId = v.id;
        existingCustomerId = v.customer_id || null;
        if (!vehModel) {
          vehModel = [v.make, v.model, v.year].filter(Boolean).join(" ").trim();
        }
        if (existingCustomerId && (!custName || !custPhone)) {
          const { data: cRow } = await supabase
            .from("garage_customers")
            .select("name, company_name, phone")
            .eq("id", existingCustomerId)
            .maybeSingle();
          if (cRow) {
            if (!custName) custName = cRow.name || cRow.company_name || "";
            if (!custPhone) custPhone = cRow.phone || "";
          }
        }
      }

      if (!custName && !custPhone) {
        custName = `לקוח רכב ${vehPlate}`;
      }

      const summary = `פתיחת כרטיס עבודה חדש במוסך: רכב ${vehPlate} (${vehModel || "רכב"}) עבור הלקוח ${custName || custPhone} במסלול ${route === "quote_first" ? "הצעת מחיר תחילה" : "קליטה ובדיקה תחילה"}. סטטוס ראשוני: "${status}".`;

      const pendingAction: GaragePendingAction = {
        preview_id: `g_case_new_${Date.now()}`,
        summary,
        tool_name: "preview_create_garage_case",
        action_type: "garage_create_case",
        parameters: {
          customer_id: existingCustomerId,
          vehicle_id: existingVehicleId,
          customer_name: custName,
          customer_phone: custPhone,
          vehicle_plate: vehPlate,
          vehicle_model: vehModel,
          route,
          status,
          notes,
          damage_items: damageItems,
        },
      };

      return {
        result: {
          status: "pending_user_confirmation",
          preview_card: pendingAction,
          message: `הכנתי כרטיס אישור לפתיחת כרטיס העבודה עבור רכב ${vehPlate}. לחץ על 'אישור' לביצוע הפעולה במערכת.`,
        },
        preview: pendingAction,
      };
    }

    case "preview_update_garage_case_status": {
      const gCase = await resolveGarageCase(supabase, targetCaseId);
      if (!gCase) return { result: { error: `לא נמצא תיק מוסך תואם עבור: "${targetCaseId}"` } };

      const newStatus = String(args?.status || "").trim();
      const flowStage = String(args?.flow_stage || "").trim();
      const notes = String(args?.notes || "").trim();

      const summary = `עדכון סטטוס כרטיס עבודה ${gCase.case_number} מ-"${gCase.status}" ל-"${newStatus}"${flowStage ? ` (שלב: ${flowStage})` : ""}${notes ? `. הערה: ${notes}` : ""}`;

      const pendingAction: GaragePendingAction = {
        preview_id: `g_status_${Date.now()}`,
        summary,
        tool_name: "preview_update_garage_case_status",
        action_type: "garage_update_status",
        parameters: {
          case_id: gCase.id,
          case_number: gCase.case_number,
          old_status: gCase.status,
          status: newStatus,
          flow_stage: flowStage,
          notes,
        },
      };

      return {
        result: {
          status: "pending_user_confirmation",
          preview_card: pendingAction,
          message: `הכנתי כרטיס אישור לשינוי הסטטוס ל-"${newStatus}". לחץ על 'אישור' לשמירה.`,
        },
        preview: pendingAction,
      };
    }

    case "preview_update_garage_intake": {
      const gCase = await resolveGarageCase(supabase, targetCaseId);
      if (!gCase) return { result: { error: `לא נמצא תיק מוסך תואם עבור: "${targetCaseId}"` } };

      const intakeKm = String(args?.intake_km || "").trim();
      const intakeFuel = String(args?.intake_fuel || "").trim();
      const intakeKeys = String(args?.intake_keys || "").trim();
      const intakeLights = String(args?.intake_lights || "").trim();
      const intakeInterior = String(args?.intake_interior || "").trim();
      const complaints = String(args?.complaints || "").trim();
      const damageNotes = String(args?.damage_notes || "").trim();
      const intakeWorker = String(args?.intake_worker || actorName).trim();

      const detailsList: string[] = [];
      if (intakeKm) detailsList.push(`ק"מ: ${intakeKm}`);
      if (intakeFuel) detailsList.push(`דלק: ${intakeFuel}`);
      if (intakeKeys) detailsList.push(`מפתחות: ${intakeKeys}`);
      if (intakeLights) detailsList.push(`תאורה: ${intakeLights}`);
      if (intakeInterior) detailsList.push(`פנים: ${intakeInterior}`);
      if (complaints) detailsList.push(`תלונה: ${complaints}`);
      if (damageNotes) detailsList.push(`הערות נזק: ${damageNotes}`);

      const summary = `עדכון קליטה ובדיקת רכב לכרטיס ${gCase.case_number}: ${detailsList.join(" · ") || "רישום קליטה"}`;

      const pendingAction: GaragePendingAction = {
        preview_id: `g_intake_${Date.now()}`,
        summary,
        tool_name: "preview_update_garage_intake",
        action_type: "garage_update_intake",
        parameters: {
          case_id: gCase.id,
          case_number: gCase.case_number,
          intake_km: intakeKm,
          intake_fuel: intakeFuel,
          intake_keys: intakeKeys,
          intake_lights: intakeLights,
          intake_interior: intakeInterior,
          complaints,
          damage_notes: damageNotes,
          intake_worker: intakeWorker,
        },
      };

      return {
        result: {
          status: "pending_user_confirmation",
          preview_card: pendingAction,
          message: `הכנתי כרטיס אישור לעדכון קליטה ובדיקה בכרטיס עבודה ${gCase.case_number}. לחץ על 'אישור' לשמירה.`,
        },
        preview: pendingAction,
      };
    }

    case "preview_update_garage_quote": {
      const gCase = await resolveGarageCase(supabase, targetCaseId);
      if (!gCase) return { result: { error: `לא נמצא תיק מוסך תואם עבור: "${targetCaseId}"` } };

      const quoteNotes = String(args?.quote_notes || "").trim();
      const quoteValidity = String(args?.quote_validity || "").trim();
      const quoteApproved = args?.quote_approved === true;
      const approvedBy = String(args?.approved_by || "").trim();
      const workOrderAmount = args?.work_order_amount ? Number(args.work_order_amount) : null;
      const workOrderNotes = String(args?.work_order_notes || "").trim();

      const summary = `עדכון הצעת מחיר לכרטיס ${gCase.case_number}: ${quoteApproved ? `✅ אישור לקוח התקבל${approvedBy ? ` ע"י ${approvedBy}` : ""}` : "עדכון פרטי הצעה"}${workOrderAmount ? ` · סכום: ₪${workOrderAmount.toLocaleString()}` : ""}${quoteValidity ? ` · תוקף: ${quoteValidity}` : ""}`;

      const pendingAction: GaragePendingAction = {
        preview_id: `g_quote_${Date.now()}`,
        summary,
        tool_name: "preview_update_garage_quote",
        action_type: "garage_update_quote",
        parameters: {
          case_id: gCase.id,
          case_number: gCase.case_number,
          quote_notes: quoteNotes,
          quote_validity: quoteValidity,
          quote_approved: quoteApproved,
          approved_by: approvedBy,
          work_order_amount: workOrderAmount,
          work_order_notes: workOrderNotes,
        },
      };

      return {
        result: {
          status: "pending_user_confirmation",
          preview_card: pendingAction,
          message: `הכנתי כרטיס אישור לעדכון הצעת המחיר בכרטיס ${gCase.case_number}. לחץ על 'אישור' לשמירה.`,
        },
        preview: pendingAction,
      };
    }

    case "preview_update_garage_repair_details": {
      const gCase = await resolveGarageCase(supabase, targetCaseId);
      if (!gCase) return { result: { error: `לא נמצא תיק מוסך תואם עבור: "${targetCaseId}"` } };

      const damageItems = Array.isArray(args?.damage_items) ? args.damage_items : [];
      const quoteWorks = Array.isArray(args?.quote_works) ? args.quote_works : [];
      const quoteParts = Array.isArray(args?.quote_parts) ? args.quote_parts : [];
      const extraApprovals = Array.isArray(args?.extra_approvals) ? args.extra_approvals : [];
      const mode = String(args?.mode || "append");

      const totalWorks = quoteWorks.reduce((sum: number, w: any) => sum + (Number(w.price) || 0) * (Number(w.qty) || 1), 0);
      const totalParts = quoteParts.reduce((sum: number, p: any) => sum + (Number(p.price) || 0) * (Number(p.qty) || 1), 0);

      const summary = `עדכון פרטי תיקון (פחחות, צבע וחלקים) בכרטיס עבודה ${gCase.case_number}: ${damageItems.length} מוקדי נזק, ${quoteWorks.length} עבודות (סה"כ ₪${totalWorks.toLocaleString()}), ${quoteParts.length} חלקי חילוף (סה"כ ₪${totalParts.toLocaleString()})${extraApprovals.length > 0 ? `, ${extraApprovals.length} אישורים חריגים` : ""}. מצב שמירה: ${mode === "replace" ? "החלפה מלאה" : "הוספה על הקיים"}.`;

      const pendingAction: GaragePendingAction = {
        preview_id: `g_repair_${Date.now()}`,
        summary,
        tool_name: "preview_update_garage_repair_details",
        action_type: "garage_update_repair_details",
        parameters: {
          case_id: gCase.id,
          case_number: gCase.case_number,
          damage_items: damageItems,
          quote_works: quoteWorks,
          quote_parts: quoteParts,
          extra_approvals: extraApprovals,
          mode,
        },
      };

      return {
        result: {
          status: "pending_user_confirmation",
          preview_card: pendingAction,
          message: `הכנתי כרטיס אישור לעדכון פרטי התיקון, הפחחות והחלקים. לחץ על 'אישור' לשמירה.`,
        },
        preview: pendingAction,
      };
    }

    case "preview_create_garage_task": {
      const gCase = await resolveGarageCase(supabase, targetCaseId);
      if (!gCase) return { result: { error: `לא נמצא תיק מוסך תואם עבור: "${targetCaseId}"` } };

      const title = String(args?.title || "").trim();
      const dueDate = String(args?.due_date || "").trim();
      const assignee = String(args?.assignee || "").trim();

      if (!title) return { result: { error: "חובה לספק כותרת למשימה." } };

      const summary = `יצירת משימה חדשה לכרטיס עבודה ${gCase.case_number}: "${title}"${dueDate ? ` (יעד: ${dueDate})` : ""}${assignee ? ` [הוקצה ל: ${assignee}]` : ""}`;

      const pendingAction: GaragePendingAction = {
        preview_id: `g_task_${Date.now()}`,
        summary,
        tool_name: "preview_create_garage_task",
        action_type: "garage_create_task",
        parameters: {
          case_id: gCase.id,
          case_number: gCase.case_number,
          title,
          due_date: dueDate,
          assignee,
        },
      };

      return {
        result: {
          status: "pending_user_confirmation",
          preview_card: pendingAction,
          message: `הכנתי כרטיס אישור ליצירת המשימה: "${title}". לחץ על 'אישור' לשמירה.`,
        },
        preview: pendingAction,
      };
    }

    case "preview_create_garage_reminder": {
      const gCase = await resolveGarageCase(supabase, targetCaseId);
      if (!gCase) return { result: { error: `לא נמצא תיק מוסך תואם עבור: "${targetCaseId}"` } };

      const title = String(args?.title || "").trim();
      const remindAt = String(args?.remind_at || "").trim();

      if (!title) return { result: { error: "חובה לספק תוכן לתזכורת." } };

      const summary = `הגדרת תזכורת לכרטיס עבודה ${gCase.case_number}: "${title}"${remindAt ? ` [מועד: ${remindAt}]` : ""}`;

      const pendingAction: GaragePendingAction = {
        preview_id: `g_rem_${Date.now()}`,
        summary,
        tool_name: "preview_create_garage_reminder",
        action_type: "garage_create_reminder",
        parameters: {
          case_id: gCase.id,
          case_number: gCase.case_number,
          title,
          remind_at: remindAt,
        },
      };

      return {
        result: {
          status: "pending_user_confirmation",
          preview_card: pendingAction,
          message: `הכנתי כרטיס אישור להגדרת התזכורת: "${title}". לחץ על 'אישור' לשמירה.`,
        },
        preview: pendingAction,
      };
    }

    case "list_garage_case_media": {
      const gCase = await resolveGarageCase(supabase, targetCaseId);
      if (!gCase) return { result: { error: `לא נמצא תיק מוסך תואם עבור: "${targetCaseId}"` } };

      const { data, error } = await supabase
        .from("garage_media")
        .select("id, category, title, storage_path, mime_type, byte_size, created_at, original_name")
        .eq("garage_case_id", gCase.id)
        .order("created_at", { ascending: false });

      if (error) throw new Error(`שגיאה בטעינת מדיה: ${error.message}`);
      return {
        result: {
          case_number: gCase.case_number,
          total_files: data?.length || 0,
          files: (data || []).map((m: any) => ({
            id: m.id,
            category: m.category,
            title: m.title || m.original_name,
            mime_type: m.mime_type,
            size_kb: m.byte_size ? Math.round(m.byte_size / 1024) : 0,
            uploaded_at: m.created_at,
          })),
        },
      };
    }

    case "preview_add_garage_media_note": {
      const gCase = await resolveGarageCase(supabase, targetCaseId);
      if (!gCase) return { result: { error: `לא נמצא תיק מוסך תואם עבור: "${targetCaseId}"` } };

      const title = String(args?.title || "").trim();
      const category = String(args?.category || "document").trim();
      const notes = String(args?.notes || "").trim();

      if (!title) return { result: { error: "חובה לספק כותרת למסמך/תמונה." } };

      const summary = `הוספת רישום מסמך/תיעוד לכרטיס עבודה ${gCase.case_number}: "${title}" (קטגוריה: ${category})${notes ? ` · הערה: ${notes}` : ""}`;

      const pendingAction: GaragePendingAction = {
        preview_id: `g_media_${Date.now()}`,
        summary,
        tool_name: "preview_add_garage_media_note",
        action_type: "garage_add_media_note",
        parameters: {
          case_id: gCase.id,
          case_number: gCase.case_number,
          title,
          category,
          notes,
        },
      };

      return {
        result: {
          status: "pending_user_confirmation",
          preview_card: pendingAction,
          message: `הכנתי כרטיס אישור להוספת התיעוד "${title}". לחץ על 'אישור' לשמירה.`,
        },
        preview: pendingAction,
      };
    }

    case "get_garage_case_summary_report": {
      const gCase = await resolveGarageCase(supabase, targetCaseId);
      if (!gCase) return { result: { error: `לא נמצא תיק מוסך תואם עבור: "${targetCaseId}"` } };

      const cd = gCase.case_data || {};
      const works = cd.quoteWorks || [];
      const parts = cd.quoteParts || [];
      const damage = cd.damageItems || [];
      const extras = cd.extraApprovals || [];
      const tasks = cd.tasks || [];
      const reminders = cd.reminders || [];

      const totalWorks = works.reduce((sum: number, w: any) => sum + (Number(w.price) || 0) * (Number(w.qty) || 1), 0);
      const totalParts = parts.reduce((sum: number, p: any) => sum + (Number(p.price) || 0) * (Number(p.qty) || 1), 0);
      const totalExtras = extras.reduce((sum: number, e: any) => sum + (Number(e.price) || 0), 0);
      const grandTotal = totalWorks + totalParts + totalExtras;

      const reportText = `
# 📋 דוח סיכום כרטיס עבודה מוסך · [${gCase.case_number}](#/garage-management/${gCase.id})
**תאריך הפקה:** ${new Date().toLocaleDateString("he-IL")} · שעה: ${new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
**פותח התיק:** ${gCase.opened_by_name || "מערכת"}
**סטטוס נוכחי:** ${gCase.status} (שלב: ${cd.flowStage || "inspection"})

---
### 👤 פרטי לקוח ורכב
- **שם לקוח:** ${gCase.customer_name_snapshot || "—"}
- **מספר רכב (לוחית):** ${gCase.vehicle_plate_snapshot || "—"}
- **דגם רכב:** ${gCase.vehicle_label_snapshot || "—"}
- **מסלול טיפול:** ${cd.route === "quote_first" ? "הצעת מחיר תחילה" : "קליטה ובדיקה תחילה"}

---
### 🚗 קליטה ובדיקת רכב
- **מד אוץ (ק"מ):** ${cd.intakeKm || "—"}
- **כמות דלק:** ${cd.intakeFuel || "—"}
- **מפתחות:** ${cd.intakeKeys || "—"}
- **תאורה ופנים:** ${cd.intakeLights ? `תאורה: ${cd.intakeLights}` : ""}${cd.intakeInterior ? ` · פנים: ${cd.intakeInterior}` : ""}

---
### 🚗 פירוט נזקים ופחחות (${damage.length} פריטים)
${damage.length > 0 ? damage.map((d: any, i: number) => `${i + 1}. **${d.part || "חלק"}**: ${d.status || "נדרש תיקון"}`).join("\n") : "אין פריטי נזק רשומים"}

---
### 🛠️ עבודות לביצוע (${works.length} עבודות · סה"כ: ₪${totalWorks.toLocaleString()})
${works.length > 0 ? works.map((w: any, i: number) => `${i + 1}. ${w.type || "עבודה"} - ${w.part || ""}${w.desc ? ` (${w.desc})` : ""} | מחיר: ₪${(Number(w.price) || 0).toLocaleString()} (כמות: ${w.qty || 1})`).join("\n") : "אין עבודות רשומות"}

---
### 📦 חלקי חילוף (${parts.length} חלפים · סה"כ: ₪${totalParts.toLocaleString()})
${parts.length > 0 ? parts.map((p: any, i: number) => `${i + 1}. ${p.name || "חלק"}${p.sku ? ` [מק"ט ${p.sku}]` : ""} | מחיר: ₪${(Number(p.price) || 0).toLocaleString()} (כמות: ${p.qty || 1})${p.supplier ? ` ספק: ${p.supplier}` : ""}`).join("\n") : "אין חלפים רשומים"}

${extras.length > 0 ? `---
### ⚠️ אישורים חריגים (${extras.length} פריטים · סה"כ: ₪${totalExtras.toLocaleString()})
${extras.map((e: any, i: number) => `${i + 1}. ${e.text} | תוספת: ₪${(Number(e.price) || 0).toLocaleString()} [סטטוס: ${e.status || "ממתין"}]`).join("\n")}` : ""}

---
### 💰 סיכום כספי
- **עבודות:** ₪${totalWorks.toLocaleString()}
- **חלקים:** ₪${totalParts.toLocaleString()}
${totalExtras > 0 ? `- **חריגים:** ₪${totalExtras.toLocaleString()}\n` : ""}- **סה"כ משוער לפני מע"מ:** ₪${grandTotal.toLocaleString()}
- **סה"כ כולל מע"מ (17%):** ₪${Math.round(grandTotal * 1.17).toLocaleString()}

---
### 📌 משימות ותזכורות
- **משימות פתוחות:** ${tasks.length > 0 ? tasks.map((t: any) => `\n  • ${t.title}${t.due_date ? ` (יעד: ${t.due_date})` : ""}`).join("") : "אין משימות פתוחות"}
- **תזכורות:** ${reminders.length > 0 ? reminders.map((r: any) => `\n  • ${r.title} [${r.remind_at || ""}]`).join("") : "אין תזכורות"}
`;
      return { result: { report: reportText, grandTotal } };
    }

    case "preview_garage_onboard_from_vehicle_license": {
      const plateNumber = String(args?.plate_number || "").replace(/[^0-9]/g, "");
      if (!plateNumber) return { result: { error: "חובה לזהות או לספק מספר לוחית רישוי של הרכב." } };

      const make = String(args?.make || "").trim();
      const model = String(args?.model || "").trim();
      const year = String(args?.year || "").trim();
      const color = String(args?.color || "").trim();
      const vin = String(args?.vin || "").trim();
      const engineVolume = String(args?.engine_volume || "").trim();
      const ownerName = String(args?.owner_name || "").trim();
      const ownerIdNumber = String(args?.owner_id_number || "").replace(/[^0-9]/g, "");
      const validUntil = String(args?.valid_until || "").trim();
      const ordererName = String(args?.orderer_name || "").trim();
      const ordererPhone = String(args?.orderer_phone || "").replace(/[^0-9]/g, "");
      const ordererIsOwner = args?.orderer_is_owner !== false;
      const complaints = String(args?.complaints || "").trim();
      const route = String(args?.route || "intake_first").trim();

      const { data: existingVehicles } = await supabase
        .from("garage_vehicles")
        .select("id, plate, make, model, year, customer_id")
        .eq("plate", plateNumber)
        .limit(1);
      const existingVehicle = existingVehicles?.[0] || null;

      const effectiveCustomerName = (!ordererIsOwner && ordererName) ? ordererName : (ownerName || `לקוח רכב ${plateNumber}`);
      const effectivePhone = ordererPhone || "";

      let existingCustomer = null;
      if (effectivePhone) {
        const { data: byPhone } = await supabase.from("garage_customers").select("id, name, phone, business_id").eq("phone", effectivePhone).limit(1);
        if (byPhone && byPhone.length > 0) existingCustomer = byPhone[0];
      }
      if (!existingCustomer && ownerIdNumber) {
        const { data: byId } = await supabase.from("garage_customers").select("id, name, phone, business_id").eq("business_id", ownerIdNumber).limit(1);
        if (byId && byId.length > 0) existingCustomer = byId[0];
      }

      let summary = `קליטת רכב ולקוח מרישיון רכב: לוחית ${plateNumber} (${make || "רכב"} ${model} ${year})`;
      if (existingVehicle) summary += ` [רכב קיים במערכת]`;
      if (existingCustomer) summary += ` [לקוח קיים: ${existingCustomer.name}]`;
      else summary += ` [לקוח חדש: ${effectiveCustomerName}]`;
      if (!ordererIsOwner && ordererName) summary += ` · בעלים רשום: ${ownerName} (${ownerIdNumber || "—"}) לעומת מזמין התיקון: ${ordererName}`;
      if (complaints) summary += ` · תלונות/סיבת כניסה: ${complaints}`;

      const pendingAction: GaragePendingAction = {
        preview_id: `g_onboard_${Date.now()}`,
        summary,
        tool_name: "preview_garage_onboard_from_vehicle_license",
        action_type: "garage_onboard_from_license",
        parameters: {
          plate_number: plateNumber,
          make,
          model,
          year,
          color,
          vin,
          engine_volume: engineVolume,
          owner_name: ownerName,
          owner_id_number: ownerIdNumber,
          valid_until: validUntil,
          orderer_name: ordererName,
          orderer_phone: ordererPhone,
          orderer_is_owner: ordererIsOwner,
          effective_customer_name: effectiveCustomerName,
          effective_phone: effectivePhone,
          complaints,
          route,
          existing_vehicle_id: existingVehicle?.id || null,
          existing_customer_id: existingCustomer?.id || existingVehicle?.customer_id || null,
        },
      };

      return {
        result: {
          status: "pending_user_confirmation",
          preview_card: pendingAction,
          extracted_license: {
            plate_number: plateNumber,
            vehicle: `${make} ${model} ${year}`.trim(),
            color,
            vin,
            owner_name: ownerName,
            owner_id_number: ownerIdNumber,
            valid_until: validUntil,
            orderer_is_owner: ordererIsOwner,
            customer_exists: Boolean(existingCustomer),
            vehicle_exists: Boolean(existingVehicle),
          },
          message: `זיהיתי את פרטי רישיון הרכב: לוחית ${plateNumber}, ${make} ${model} ${year}. הכנתי כרטיס אישור לקליטת הרכב והלקוח ופתיחת כרטיס עבודה.`,
        },
        preview: pendingAction,
      };
    }

    case "preview_garage_create_customer_order": {
      const orderNumber = String(args?.order_number || "").trim();
      if (!orderNumber) return { result: { error: "חובה לספק מספר הזמנת עבודה." } };

      const plateNumber = String(args?.plate_number || "").replace(/[^0-9]/g, "");
      const customerName = String(args?.customer_name || "").trim();
      const customerPhone = String(args?.customer_phone || "").replace(/[^0-9]/g, "");
      const orderDate = String(args?.order_date || "").trim();
      const approvedAmount = Number(args?.approved_amount) || 0;
      const contactName = String(args?.contact_name || "").trim();
      const driverName = String(args?.driver_name || "").trim();
      const description = String(args?.description || "").trim();
      const specialInstructions = String(args?.special_instructions || "").trim();
      const approvalReference = String(args?.approval_reference || "").trim();

      let gCase = null;
      if (targetCaseId) {
        gCase = await resolveGarageCase(supabase, targetCaseId);
      }
      if (!gCase && plateNumber) {
        gCase = await resolveGarageCase(supabase, plateNumber);
      }

      let existingOrder = null;
      const { data: oList } = await supabase.from("garage_orders").select("id, order_number, case_id").eq("order_number", orderNumber).limit(1);
      if (oList && oList.length > 0) existingOrder = oList[0];

      let summary = `קליטת הזמנת לקוח מס' ${orderNumber}${gCase ? ` לכרטיס עבודה ${gCase.case_number}` : (plateNumber ? ` לרכב ${plateNumber}` : "")}${approvedAmount > 0 ? ` (סכום מאושר: ₪${approvedAmount.toLocaleString()})` : ""}`;
      if (existingOrder) summary += ` [הזמנה קיימת במערכת - תעודכן]`;
      if (contactName) summary += ` · איש קשר: ${contactName}`;
      if (driverName) summary += ` · נהג: ${driverName}`;
      if (description) summary += ` · פירוט: ${description}`;

      const pendingAction: GaragePendingAction = {
        preview_id: `g_order_${Date.now()}`,
        summary,
        tool_name: "preview_garage_create_customer_order",
        action_type: "garage_create_customer_order",
        parameters: {
          case_id: gCase?.id || null,
          case_number: gCase?.case_number || null,
          customer_id: gCase?.customer_id || null,
          vehicle_id: gCase?.vehicle_id || null,
          order_number: orderNumber,
          customer_name: customerName,
          customer_phone: customerPhone,
          plate_number: plateNumber,
          order_date: orderDate || new Date().toISOString().split("T")[0],
          approved_amount: approvedAmount,
          contact_name: contactName,
          driver_name: driverName,
          description,
          special_instructions: specialInstructions,
          approval_reference: approvalReference,
          existing_order_id: existingOrder?.id || null,
        },
      };

      return {
        result: {
          status: "pending_user_confirmation",
          preview_card: pendingAction,
          message: `זיהיתי את פרטי הזמנת הלקוח מס' ${orderNumber}. הכנתי כרטיס אישור לשמירתה בתיק. לחץ על 'אישור' לביצוע.`,
        },
        preview: pendingAction,
      };
    }

    case "preview_send_garage_quote": {
      const gCase = await resolveGarageCase(supabase, targetCaseId);
      if (!gCase) return { result: { error: `לא נמצא תיק מוסך תואם עבור: "${targetCaseId}"` } };

      const cd = gCase.case_data || {};
      const works = cd.quoteWorks || [];
      const parts = cd.quoteParts || [];
      const totalWorks = works.reduce((sum: number, w: any) => sum + (Number(w.price) || 0) * (Number(w.qty) || 1), 0);
      const totalParts = parts.reduce((sum: number, p: any) => sum + (Number(p.price) || 0) * (Number(p.qty) || 1), 0);
      const subtotal = totalWorks + totalParts;
      const vat = Math.round(subtotal * 0.17);
      const grandTotal = subtotal + vat;

      const recipientName = String(args?.recipient_name || gCase.customer_name_snapshot || "לקוח").trim();
      const recipientPhone = String(args?.recipient_phone || "").replace(/[^0-9]/g, "");
      const recipientEmail = String(args?.recipient_email || "").trim();
      const channel = String(args?.channel || "whatsapp").trim();
      const quoteNotes = String(args?.quote_notes || "").trim();

      const summary = `שליחת הצעת מחיר לתיק ${gCase.case_number} ל-${recipientName} (${channel === "whatsapp" ? "WhatsApp" : (channel === "sms" ? "SMS" : "אימייל")}). סכום לתשלום: ₪${grandTotal.toLocaleString()} כולל מע"מ (עבודות: ₪${totalWorks.toLocaleString()}, חלקים: ₪${totalParts.toLocaleString()}).`;

      const pendingAction: GaragePendingAction = {
        preview_id: `g_send_quote_${Date.now()}`,
        summary,
        tool_name: "preview_send_garage_quote",
        action_type: "garage_send_quote",
        parameters: {
          case_id: gCase.id,
          case_number: gCase.case_number,
          recipient_name: recipientName,
          recipient_phone: recipientPhone,
          recipient_email: recipientEmail,
          channel,
          quote_notes: quoteNotes,
          subtotal,
          vat,
          grand_total: grandTotal,
        },
      };

      return {
        result: {
          status: "pending_user_confirmation",
          preview_card: pendingAction,
          message: `הכנתי הצעת מחיר לשליחה ל-${recipientName} על סך ₪${grandTotal.toLocaleString()} כולל מע"מ 17%. לחץ על 'אישור' לשליחה.`,
        },
        preview: pendingAction,
      };
    }

    case "preview_approve_garage_quote": {
      const gCase = await resolveGarageCase(supabase, targetCaseId);
      if (!gCase) return { result: { error: `לא נמצא תיק מוסך תואם עבור: "${targetCaseId}"` } };

      const approvedBy = String(args?.approved_by || gCase.customer_name_snapshot || "הלקוח").trim();
      const approvedAmount = args?.approved_amount !== undefined && args?.approved_amount !== null ? Number(args?.approved_amount) : null;
      const approvalNotes = String(args?.approval_notes || "").trim();

      const summary = `רישום אישור לקוח להצעת מחיר בכרטיס עבודה ${gCase.case_number}: אושר ע"י ${approvedBy}${approvedAmount ? ` בסכום ₪${approvedAmount.toLocaleString()}` : ""}${approvalNotes ? ` · תנאים: ${approvalNotes}` : ""}. סטטוס התיק יעודכן ל-'אושר לביצוע'.`;

      const pendingAction: GaragePendingAction = {
        preview_id: `g_appr_quote_${Date.now()}`,
        summary,
        tool_name: "preview_approve_garage_quote",
        action_type: "garage_approve_quote",
        parameters: {
          case_id: gCase.id,
          case_number: gCase.case_number,
          approved_by: approvedBy,
          approved_amount: approvedAmount,
          approval_notes: approvalNotes,
        },
      };

      return {
        result: {
          status: "pending_user_confirmation",
          preview_card: pendingAction,
          message: `הכנתי כרטיס אישור לקוח להצעת המחיר בכרטיס עבודה ${gCase.case_number}. לחץ על 'אישור' לעדכון הסטטוס ל-'אושר לביצוע'.`,
        },
        preview: pendingAction,
      };
    }

    default:
      return { result: { error: `כלי מוסך לא מוכר: ${toolName}` } };
  }
}

/** Execution of user-confirmed pending actions for Garage */
export async function executeGaragePendingAction(
  supabase: any,
  pendingAction: GaragePendingAction,
  userId: string,
  actorName: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { action_type, parameters } = pendingAction;

    if (action_type === "batch_action" && Array.isArray(parameters?.actions)) {
      const messages: string[] = [];
      for (const subAction of parameters.actions as GaragePendingAction[]) {
        const res = await executeGaragePendingAction(supabase, subAction, userId, actorName);
        if (!res.success) return res;
        if (res.message) messages.push(res.message);
      }
      return {
        success: true,
        message: messages.join("\n"),
      };
    }

    switch (action_type) {
      case "garage_create_customer": {
        const name = String(parameters.name || "").trim();
        const phone = String(parameters.phone || "").trim();
        const rawCustomerType = String(parameters.customer_type || "private").trim();
        const customerType = (rawCustomerType === "business" || rawCustomerType === "fleet") ? rawCustomerType : "private";
        const companyName = (customerType === "business" || customerType === "fleet")
          ? String(parameters.company_name || name).trim()
          : String(parameters.company_name || "").trim();
        const email = String(parameters.email || "").trim();
        const address = String(parameters.address || "").trim();
        const businessId = String(parameters.business_id || "").trim();
        const contactPerson = String(parameters.contact_person || "").trim();
        const notes = String(parameters.notes || "").trim();
        const secondPhone = String(parameters.second_phone || "").trim();

        if (!name && !companyName) throw new Error("חובה לספק שם לפתיחת לקוח.");

        const { data: newCust, error: custErr } = await supabase
          .from("garage_customers")
          .insert({
            name: name || companyName,
            company_name: companyName,
            phone: phone || "לא צוין",
            second_phone: secondPhone || "",
            email: email || "",
            address: address || "",
            business_id: businessId || "",
            contact_person: contactPerson || "",
            notes: notes || "",
            customer_type: customerType,
          })
          .select("id, name, company_name, customer_number, phone")
          .single();

        if (custErr) throw new Error(`יצירת לקוח נכשלה: ${custErr.message}`);

        return {
          success: true,
          message: `✅ לקוח חדש הוקם בהצלחה: "${newCust.name || newCust.company_name}" (מספר לקוח: ${newCust.customer_number || newCust.id}, טלפון: ${newCust.phone}).`,
        };
      }

      case "garage_update_customer": {
        const customerId = String(parameters.customer_id || "");
        if (!customerId) throw new Error("מזהה לקוח חסר לעדכון");

        const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (parameters.name) updatePayload.name = String(parameters.name).trim();
        if (parameters.company_name) updatePayload.company_name = String(parameters.company_name).trim();
        if (parameters.phone) updatePayload.phone = String(parameters.phone).trim();
        if (parameters.second_phone) updatePayload.second_phone = String(parameters.second_phone).trim();
        if (parameters.email) updatePayload.email = String(parameters.email).trim();
        if (parameters.address) updatePayload.address = String(parameters.address).trim();
        if (parameters.business_id) updatePayload.business_id = String(parameters.business_id).trim();
        if (parameters.contact_person) updatePayload.contact_person = String(parameters.contact_person).trim();
        if (parameters.notes) updatePayload.notes = String(parameters.notes).trim();
        if (parameters.customer_type) {
          const ct = String(parameters.customer_type).trim();
          updatePayload.customer_type = ct;
          if ((ct === "business" || ct === "fleet") && !updatePayload.company_name) {
            updatePayload.company_name = String(parameters.name || parameters.customer_name || "").trim();
          }
        }

        const { error: updErr } = await supabase
          .from("garage_customers")
          .update(updatePayload)
          .eq("id", customerId);

        if (updErr) throw new Error(`עדכון לקוח נכשל: ${updErr.message}`);

        return {
          success: true,
          message: `✅ פרטי הלקוח ${parameters.customer_name || ""} עודכנו בהצלחה בספר הלקוחות.`,
        };
      }

      case "garage_create_vehicle": {
        const plate = String(parameters.plate || "").trim();
        let customerId = String(parameters.customer_id || "").trim();
        const customerName = String(parameters.customer_name || "").trim();
        const make = String(parameters.make || "").trim();
        const model = String(parameters.model || "").trim();
        const year = parameters.year ? Number(parameters.year) : null;
        const color = String(parameters.color || "").trim();
        const vin = String(parameters.vin || "").trim();
        const notes = String(parameters.notes || "").trim();

        if (!plate) throw new Error("חובה לספק מספר לוחית רישוי להקמת רכב.");

        if (!customerId && customerName) {
          const { data: foundCust } = await supabase
            .from("garage_customers")
            .select("id")
            .or(`name.ilike.%${customerName}%,company_name.ilike.%${customerName}%`)
            .limit(1);
          if (foundCust && foundCust.length > 0) {
            customerId = foundCust[0].id;
          }
        }

        if (!customerId) {
          const { data: autoCust, error: autoCustErr } = await supabase
            .from("garage_customers")
            .insert({
              name: customerName || `לקוח רכב ${plate}`,
              company_name: "",
              phone: "לא צוין",
              customer_type: "private",
            })
            .select("id")
            .single();
          if (autoCustErr) throw new Error(`הקמת לקוח משויך לרכב נכשלה: ${autoCustErr.message}`);
          customerId = autoCust.id;
        }

        const { data: existingVeh } = await supabase
          .from("garage_vehicles")
          .select("id")
          .eq("plate", plate)
          .limit(1);

        let newVeh: any = null;
        if (existingVeh && existingVeh.length > 0) {
          const { data: updatedVeh, error: updVehErr } = await supabase
            .from("garage_vehicles")
            .update({
              customer_id: customerId,
              make: make || "",
              model: model || "",
              year: year || null,
              color: color || "",
              vin: vin || "",
              notes: notes || "",
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingVeh[0].id)
            .select("id, plate, make, model")
            .single();
          if (updVehErr) throw new Error(`עדכון רכב קיים נכשל: ${updVehErr.message}`);
          newVeh = updatedVeh;
        } else {
          const { data: insertedVeh, error: vehErr } = await supabase
            .from("garage_vehicles")
            .insert({
              plate,
              customer_id: customerId,
              make: make || "",
              model: model || "",
              year: year || null,
              color: color || "",
              vin: vin || "",
              notes: notes || "",
            })
            .select("id, plate, make, model")
            .single();
          if (vehErr) throw new Error(`הקמת רכב נכשלה: ${vehErr.message}`);
          newVeh = insertedVeh;
        }

        return {
          success: true,
          message: `✅ רכב ${newVeh.plate} (${newVeh.make} ${newVeh.model}) הוקם בהצלחה בספר הרכבים.`,
        };
      }

      case "garage_create_case": {
        let customerId = String(parameters.customer_id || "").trim();
        let vehicleId = String(parameters.vehicle_id || "").trim();
        const customerName = String(parameters.customer_name || "").trim();
        const customerPhone = String(parameters.customer_phone || "").trim();
        const vehiclePlate = String(parameters.vehicle_plate || "").trim();
        const vehicleModel = String(parameters.vehicle_model || "").trim();
        const route = String(parameters.route || "intake_first").trim();
        const status = String(parameters.status || "בדיקת רכב").trim();
        const notes = String(parameters.notes || "").trim();
        const damageItems = Array.isArray(parameters.damage_items) ? parameters.damage_items : [];

        // 1. Ensure customer exists
        if (!customerId) {
          if (!customerName && !customerPhone) {
            throw new Error("חובה לספק שם או טלפון של הלקוח לפתיחת תיק.");
          }
          if (customerPhone) {
            const { data: byPhone } = await supabase.from("garage_customers").select("id").eq("phone", customerPhone).limit(1);
            if (byPhone && byPhone.length > 0) customerId = byPhone[0].id;
          }
          if (!customerId && customerName) {
            const { data: byName } = await supabase.from("garage_customers").select("id").or(`name.eq.${customerName},company_name.eq.${customerName}`).limit(1);
            if (byName && byName.length > 0) customerId = byName[0].id;
          }
          if (!customerId) {
            const { data: newCust, error: custErr } = await supabase
              .from("garage_customers")
              .insert({
                name: customerName || "לקוח ללא שם",
                company_name: "",
                phone: customerPhone || "לא צוין",
                customer_type: "private",
              })
              .select("id, name, phone")
              .single();
            if (custErr) throw new Error(`יצירת לקוח נכשלה: ${custErr.message}`);
            customerId = newCust.id;
          }
        }

        // 2. Ensure vehicle exists
        if (!vehicleId) {
          if (!vehiclePlate) {
            throw new Error("חובה לספק מספר לוחית רישוי של הרכב לפתיחת תיק.");
          }
          const { data: byPlate } = await supabase.from("garage_vehicles").select("id").eq("plate", vehiclePlate).limit(1);
          if (byPlate && byPlate.length > 0) {
            vehicleId = byPlate[0].id;
          } else {
            const { data: newVeh, error: vehErr } = await supabase
              .from("garage_vehicles")
              .insert({
                customer_id: customerId,
                plate: vehiclePlate,
                make: vehicleModel.split(" ")[0] || "",
                model: vehicleModel.split(" ").slice(1).join(" ") || "",
                color: "",
                vin: "",
                notes: "",
              })
              .select("id, plate, make, model")
              .single();
            if (vehErr) throw new Error(`יצירת רכב נכשלה: ${vehErr.message}`);
            vehicleId = newVeh.id;
          }
        }

        // 3. Insert garage case
        const initialCaseData = {
          route,
          flowStage: route === "quote_first" ? "quote" : "inspection",
          damageItems,
          quoteWorks: [],
          quoteParts: [],
          extraApprovals: [],
          tasks: [],
          reminders: [],
          timeline: [
            {
              at: new Date().toISOString(),
              text: `התיק נפתח ע"י ${actorName || "דליה AI"}. ${notes ? `הערות: ${notes}` : ""}`.trim(),
            },
          ],
        };

        const ALLOWED_GARAGE_STATUSES = new Set([
          "בדיקת רכב",
          "הצעה בהכנה",
          "הצעה נשלחה",
          "ממתין לאישור",
          "אושר",
          "אושר לביצוע",
          "ממתין לעבודה",
          "הרכב התקבל",
          "עבודה התחילה",
          "בעבודה",
          "עבודה הסתיימה",
          "מוכן למסירה",
          "סגור",
          "תיק סגור",
        ]);
        const safeStatus = ALLOWED_GARAGE_STATUSES.has(status)
          ? status
          : (route === "quote_first" ? "הצעה בהכנה" : "בדיקת רכב");

        const insertPayload: Record<string, unknown> = {
          customer_id: customerId,
          vehicle_id: vehicleId,
          status: safeStatus,
          opened_by: userId,
          opened_by_name: actorName,
          customer_name_snapshot: customerName || "לקוח",
          vehicle_plate_snapshot: vehiclePlate,
          vehicle_label_snapshot: vehicleModel || vehiclePlate,
          case_data: initialCaseData,
        };

        const { data: createdCase, error: caseErr } = await supabase
          .from("garage_cases")
          .insert(insertPayload)
          .select("id, case_number, customer_name_snapshot, vehicle_plate_snapshot, status")
          .single();

        if (caseErr) throw new Error(`פתיחת כרטיס עבודה נכשלה: ${caseErr.message}`);

        return {
          success: true,
          message: `✅ כרטיס עבודה [${createdCase.case_number}](#/garage-management/${createdCase.id}) נפתח בהצלחה עבור רכב ${createdCase.vehicle_plate_snapshot} (${createdCase.customer_name_snapshot})! התיק הועבר לשלב ${route === "quote_first" ? "הצעת מחיר" : "בדיקה"}.`,
        };
      }

      case "garage_update_status": {
        const caseId = String(parameters.case_id || "");
        const rawNewStatus = String(parameters.status || "").trim();
        const ALLOWED_GARAGE_STATUSES = new Set([
          "בדיקת רכב",
          "הצעה בהכנה",
          "הצעה נשלחה",
          "ממתין לאישור",
          "אושר",
          "אושר לביצוע",
          "ממתין לעבודה",
          "הרכב התקבל",
          "עבודה התחילה",
          "בעבודה",
          "עבודה הסתיימה",
          "מוכן למסירה",
          "סגור",
          "תיק סגור",
        ]);
        let newStatus = rawNewStatus;
        if (!ALLOWED_GARAGE_STATUSES.has(newStatus)) {
          if (newStatus.includes("סגור")) newStatus = "סגור";
          else if (newStatus.includes("מסירה") || newStatus.includes("מוכן")) newStatus = "מוכן למסירה";
          else if (newStatus.includes("הסתיימה") || newStatus.includes("הושלם")) newStatus = "עבודה הסתיימה";
          else if (newStatus.includes("התחילה")) newStatus = "עבודה התחילה";
          else if (newStatus.includes("בעבודה") || newStatus.includes("בביצוע")) newStatus = "בעבודה";
          else if (newStatus.includes("התקבל")) newStatus = "הרכב התקבל";
          else if (newStatus.includes("לביצוע")) newStatus = "אושר לביצוע";
          else if (newStatus.includes("אושר")) newStatus = "אושר";
          else if (newStatus.includes("נשלחה")) newStatus = "הצעה נשלחה";
          else if (newStatus.includes("הצעה")) newStatus = "הצעה בהכנה";
          else if (newStatus.includes("ממתין")) newStatus = "ממתין לאישור";
          else newStatus = "בדיקת רכב";
        }
        const flowStage = String(parameters.flow_stage || "");
        const notes = String(parameters.notes || "");

        const { data: existing, error: loadErr } = await supabase.from("garage_cases").select("id, case_number, case_data, status").eq("id", caseId).single();
        if (loadErr || !existing) throw new Error("תיק מוסך לא נמצא לעדכון");

        const cd = existing.case_data || {};
        const timeline = Array.isArray(cd.timeline) ? [...cd.timeline] : [];
        timeline.push({
          at: new Date().toISOString(),
          text: `סטטוס שונה מ-"${existing.status}" ל-"${newStatus}" ע"י ${actorName || "דליה AI"}${notes ? `. ${notes}` : ""}`,
        });

        const patchCaseData = {
          ...cd,
          timeline,
          ...(flowStage ? { flowStage } : {}),
          ...(newStatus.includes("התחילה") || newStatus.includes("בעבודה") ? { workStarted: true } : {}),
          ...(newStatus.includes("הסתיימה") || newStatus.includes("הושלם") ? { workFinished: true, workFinishedAt: new Date().toISOString() } : {}),
          ...(newStatus.includes("סגור") ? { caseClosed: true, caseClosedAt: new Date().toISOString(), caseClosedBy: actorName } : {}),
        };

        const { error: updateErr } = await supabase
          .from("garage_cases")
          .update({
            status: newStatus,
            case_data: patchCaseData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", caseId);

        if (updateErr) throw new Error(`עדכון סטטוס נכשל: ${updateErr.message}`);

        return {
          success: true,
          message: `✅ סטטוס כרטיס עבודה [${existing.case_number}](#/garage-management/${existing.id}) עודכן בהצלחה ל-"${newStatus}".`,
        };
      }

      case "garage_update_intake": {
        const caseId = String(parameters.case_id || "");
        const intakeKm = String(parameters.intake_km || "");
        const intakeFuel = String(parameters.intake_fuel || "");
        const intakeKeys = String(parameters.intake_keys || "");
        const intakeLights = String(parameters.intake_lights || "");
        const intakeInterior = String(parameters.intake_interior || "");
        const complaints = String(parameters.complaints || "");
        const damageNotes = String(parameters.damage_notes || "");
        const intakeWorker = String(parameters.intake_worker || actorName);

        const { data: existing, error: loadErr } = await supabase.from("garage_cases").select("id, case_number, case_data").eq("id", caseId).single();
        if (loadErr || !existing) throw new Error("תיק מוסך לא נמצא לעדכון קליטה");

        const cd = existing.case_data || {};
        const timeline = Array.isArray(cd.timeline) ? [...cd.timeline] : [];
        timeline.push({
          at: new Date().toISOString(),
          text: `עודכנו פרטי קליטה ובדיקת רכב ע"י ${intakeWorker}. ${complaints ? `תלונת לקוח: ${complaints}` : ""}`.trim(),
        });

        const patchCaseData = {
          ...cd,
          intakeDone: true,
          intakeKm: intakeKm || cd.intakeKm,
          intakeFuel: intakeFuel || cd.intakeFuel,
          intakeKeys: intakeKeys || cd.intakeKeys,
          intakeLights: intakeLights || cd.intakeLights,
          intakeInterior: intakeInterior || cd.intakeInterior,
          intakeWorker: intakeWorker || cd.intakeWorker,
          workOrderNotes: complaints || cd.workOrderNotes,
          finishNotes: damageNotes || cd.finishNotes,
          timeline,
        };

        const { error: updateErr } = await supabase
          .from("garage_cases")
          .update({
            case_data: patchCaseData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", caseId);

        if (updateErr) throw new Error(`עדכון קליטה נכשל: ${updateErr.message}`);

        return {
          success: true,
          message: `✅ פרטי קליטה ובדיקה נשמרו בהצלחה בכרטיס עבודה [${existing.case_number}](#/garage-management/${existing.id}).`,
        };
      }

      case "garage_update_quote": {
        const caseId = String(parameters.case_id || "");
        const quoteNotes = String(parameters.quote_notes || "");
        const quoteValidity = String(parameters.quote_validity || "");
        const quoteApproved = parameters.quote_approved === true;
        const approvedBy = String(parameters.approved_by || "");
        const workOrderAmount = parameters.work_order_amount;
        const workOrderNotes = String(parameters.work_order_notes || "");

        const { data: existing, error: loadErr } = await supabase.from("garage_cases").select("id, case_number, case_data, status").eq("id", caseId).single();
        if (loadErr || !existing) throw new Error("תיק מוסך לא נמצא לעדכון הצעת מחיר");

        const cd = existing.case_data || {};
        const timeline = Array.isArray(cd.timeline) ? [...cd.timeline] : [];
        timeline.push({
          at: new Date().toISOString(),
          text: quoteApproved
            ? `הצעת מחיר אושרה ע"י הלקוח (${approvedBy || actorName}). סכום: ₪${workOrderAmount || cd.workOrderAmount || "—"}`
            : `עודכנו פרטי הצעת מחיר ע"י ${actorName}.`,
        });

        const patchCaseData = {
          ...cd,
          quoteCreated: true,
          ...(quoteNotes ? { quoteNotes } : {}),
          ...(quoteValidity ? { quoteValidity } : {}),
          ...(quoteApproved ? { quoteApproved: true, quoteApprovedAt: new Date().toISOString(), quoteApprovedBy: approvedBy || actorName } : {}),
          ...(workOrderAmount !== null && workOrderAmount !== undefined ? { workOrderAmount, workOrderSaved: true } : {}),
          ...(workOrderNotes ? { workOrderNotes } : {}),
          timeline,
        };

        const nextStatus = quoteApproved && existing.status.includes("הצעה") ? "ממתין לעבודה" : existing.status;

        const { error: updateErr } = await supabase
          .from("garage_cases")
          .update({
            status: nextStatus,
            case_data: patchCaseData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", caseId);

        if (updateErr) throw new Error(`עדכון הצעת מחיר נכשל: ${updateErr.message}`);

        return {
          success: true,
          message: `✅ הצעת המחיר עודכנה בהצלחה בכרטיס עבודה [${existing.case_number}](#/garage-management/${existing.id})${quoteApproved ? " ואישור הלקוח נרשם" : ""}.`,
        };
      }

      case "garage_update_repair_details": {
        const caseId = String(parameters.case_id || "");
        const damageItems = Array.isArray(parameters.damage_items) ? parameters.damage_items : [];
        const quoteWorks = Array.isArray(parameters.quote_works) ? parameters.quote_works : [];
        const quoteParts = Array.isArray(parameters.quote_parts) ? parameters.quote_parts : [];
        const extraApprovals = Array.isArray(parameters.extra_approvals) ? parameters.extra_approvals : [];
        const mode = String(parameters.mode || "append");

        const { data: existing, error: loadErr } = await supabase.from("garage_cases").select("id, case_number, case_data").eq("id", caseId).single();
        if (loadErr || !existing) throw new Error("תיק מוסך לא נמצא לעדכון");

        const cd = existing.case_data || {};
        const timeline = Array.isArray(cd.timeline) ? [...cd.timeline] : [];

        const nextDamage = mode === "replace" ? damageItems : [...(cd.damageItems || []), ...damageItems];
        const nextWorks = mode === "replace" ? quoteWorks : [...(cd.quoteWorks || []), ...quoteWorks];
        const nextParts = mode === "replace" ? quoteParts : [...(cd.quoteParts || []), ...quoteParts];
        const nextExtras = mode === "replace" ? extraApprovals : [...(cd.extraApprovals || []), ...extraApprovals];

        timeline.push({
          at: new Date().toISOString(),
          text: `עודכנו פרטי תיקון (פחחות/חלקים/עבודות) ע"י ${actorName || "דליה AI"}.`,
        });

        const patchCaseData = {
          ...cd,
          damageItems: nextDamage,
          quoteWorks: nextWorks,
          quoteParts: nextParts,
          extraApprovals: nextExtras,
          timeline,
        };

        const { error: updateErr } = await supabase
          .from("garage_cases")
          .update({
            case_data: patchCaseData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", caseId);

        if (updateErr) throw new Error(`עדכון פרטי תיקון נכשל: ${updateErr.message}`);

        return {
          success: true,
          message: `✅ פרטי התיקון, הפחחות והחלקים נשמרו בהצלחה בכרטיס עבודה [${existing.case_number}](#/garage-management/${existing.id}).`,
        };
      }

      case "garage_create_task": {
        const caseId = String(parameters.case_id || "");
        const title = String(parameters.title || "");
        const dueDate = String(parameters.due_date || "");
        const assignee = String(parameters.assignee || "");

        const { data: existing, error: loadErr } = await supabase.from("garage_cases").select("id, case_number, case_data").eq("id", caseId).single();
        if (loadErr || !existing) throw new Error("תיק מוסך לא נמצא ליצירת משימה");

        const cd = existing.case_data || {};
        const tasks = Array.isArray(cd.tasks) ? [...cd.tasks] : [];
        const timeline = Array.isArray(cd.timeline) ? [...cd.timeline] : [];

        const newTask = {
          id: `task_${Date.now()}`,
          title,
          due_date: dueDate || null,
          assignee: assignee || actorName,
          done: false,
          created_at: new Date().toISOString(),
          created_by: actorName,
        };
        tasks.push(newTask);
        timeline.push({
          at: new Date().toISOString(),
          text: `נוצרה משימה: "${title}"${assignee ? ` עבור ${assignee}` : ""}`,
        });

        const { error: updateErr } = await supabase
          .from("garage_cases")
          .update({
            case_data: { ...cd, tasks, timeline },
            updated_at: new Date().toISOString(),
          })
          .eq("id", caseId);

        if (updateErr) throw new Error(`שמירת המשימה נכשלה: ${updateErr.message}`);

        try {
          await supabase.from("garage_tasks").insert({
            case_id: caseId,
            title,
            due_date: dueDate || null,
            assigned_to: assignee || actorName,
            status: "pending",
            created_by: userId,
          });
        } catch (e) {
          console.warn("garage_tasks table insert:", e);
        }

        return {
          success: true,
          message: `✅ משימה חדשה ("${title}") נוספה בהצלחה לכרטיס עבודה [${existing.case_number}](#/garage-management/${existing.id}).`,
        };
      }

      case "garage_create_reminder": {
        const caseId = String(parameters.case_id || "");
        const title = String(parameters.title || "");
        const remindAt = String(parameters.remind_at || "");

        const { data: existing, error: loadErr } = await supabase.from("garage_cases").select("id, case_number, case_data").eq("id", caseId).single();
        if (loadErr || !existing) throw new Error("תיק מוסך לא נמצא להגדרת תזכורת");

        const cd = existing.case_data || {};
        const reminders = Array.isArray(cd.reminders) ? [...cd.reminders] : [];
        const timeline = Array.isArray(cd.timeline) ? [...cd.timeline] : [];

        const newReminder = {
          id: `rem_${Date.now()}`,
          title,
          remind_at: remindAt,
          status: "pending",
          created_at: new Date().toISOString(),
          created_by: actorName,
        };
        reminders.push(newReminder);
        timeline.push({
          at: new Date().toISOString(),
          text: `הוגדרה תזכורת: "${title}" (${remindAt})`,
        });

        const { error: updateErr } = await supabase
          .from("garage_cases")
          .update({
            case_data: { ...cd, reminders, timeline },
            updated_at: new Date().toISOString(),
          })
          .eq("id", caseId);

        if (updateErr) throw new Error(`שמירת התזכורת נכשלה: ${updateErr.message}`);

        return {
          success: true,
          message: `✅ תזכורת ("${title}") הוגדרה בהצלחה לכרטיס עבודה [${existing.case_number}](#/garage-management/${existing.id}).`,
        };
      }

      case "garage_add_media_note": {
        const caseId = String(parameters.case_id || "");
        const title = String(parameters.title || "");
        const rawCategory = String(parameters.category || "document").trim();
        const categoryMap: Record<string, string> = {
          damage: "damage",
          document: "intake_docs",
          quote: "quotes",
          invoice: "parts_invoices",
          other: "other",
          customer_order: "customer_order",
          quote_photos: "quote_photos",
          intake: "intake",
          angles: "angles",
          during_work: "during_work",
          finish: "finish",
          parts_invoices: "parts_invoices",
          quotes: "quotes",
          customer_approvals: "customer_approvals",
          intake_docs: "intake_docs",
          delivery: "delivery",
        };
        const category = categoryMap[rawCategory] || "other";
        const notes = String(parameters.notes || "");

        const { data: existing, error: loadErr } = await supabase.from("garage_cases").select("id, case_number, case_data").eq("id", caseId).single();
        if (loadErr || !existing) throw new Error("תיק מוסך לא נמצא להוספת מסמך/תיעוד");

        const storagePath = `notes/${existing.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
        const { error: mediaErr } = await supabase
          .from("garage_media")
          .insert({
            garage_case_id: existing.id,
            category,
            title,
            original_name: title,
            storage_path: storagePath,
            mime_type: "text/plain",
            byte_size: 0,
            created_by: userId,
            source: "staff",
          });

        if (mediaErr) throw new Error(`שמירת התיעוד נכשלה: ${mediaErr.message}`);

        const cd = existing.case_data || {};
        const timeline = Array.isArray(cd.timeline) ? [...cd.timeline] : [];
        timeline.push({
          at: new Date().toISOString(),
          text: `נוסף תיעוד/מסמך: "${title}" (${rawCategory})${notes ? ` · ${notes}` : ""}`,
        });

        await supabase.from("garage_cases").update({
          case_data: { ...cd, timeline },
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);

        return {
          success: true,
          message: `✅ התיעוד "${title}" נוסף בהצלחה למסמכי כרטיס עבודה [${existing.case_number}](#/garage-management/${existing.id}).`,
        };
      }

      case "garage_onboard_from_license": {
        const plateNumber = String(parameters.plate_number || "");
        const make = String(parameters.make || "");
        const model = String(parameters.model || "");
        const year = String(parameters.year || "");
        const color = String(parameters.color || "");
        const vin = String(parameters.vin || "");
        const engineVolume = String(parameters.engine_volume || "");
        const ownerName = String(parameters.owner_name || "");
        const ownerIdNumber = String(parameters.owner_id_number || "");
        const ordererName = String(parameters.orderer_name || "");
        const ordererPhone = String(parameters.orderer_phone || "");
        const complaints = String(parameters.complaints || "");
        const route = String(parameters.route || "intake_first");
        const existingVehicleId = parameters.existing_vehicle_id as string | null;
        const existingCustomerId = parameters.existing_customer_id as string | null;
        const effectiveCustomerName = String(parameters.effective_customer_name || ownerName || `לקוח ${plateNumber}`);
        const effectivePhone = String(parameters.effective_phone || ordererPhone || "");

        // 1. Resolve or create Customer
        let customerId = existingCustomerId;
        if (!customerId) {
          const { data: newCust, error: cErr } = await supabase
            .from("garage_customers")
            .insert({
              name: effectiveCustomerName,
              company_name: "",
              phone: effectivePhone || "לא צוין",
              second_phone: "",
              email: "",
              address: "",
              business_id: ownerIdNumber || "",
              contact_person: ordererName || "",
              customer_type: "private",
              notes: (!parameters.orderer_is_owner && ownerName) ? `בעל הרכב ברישיון: ${ownerName} (${ownerIdNumber})` : "",
            })
            .select("id, name")
            .single();
          if (cErr) throw new Error(`יצירת לקוח נכשלה: ${cErr.message}`);
          customerId = newCust.id;
        }

        // 2. Resolve or create Vehicle
        let vehicleId = existingVehicleId;
        if (!vehicleId) {
          const { data: newVeh, error: vErr } = await supabase
            .from("garage_vehicles")
            .insert({
              plate: plateNumber,
              customer_id: customerId,
              make: make || "",
              model: model || "",
              year: year ? parseInt(year, 10) || null : null,
              color: color || "",
              vin: vin || "",
              notes: engineVolume ? `נפח מנוע: ${engineVolume}` : "",
            })
            .select("id, plate")
            .single();
          if (vErr) throw new Error(`הקמת רכב נכשלה: ${vErr.message}`);
          vehicleId = newVeh.id;
        } else {
          const vehPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (make) vehPatch.make = make;
          if (model) vehPatch.model = model;
          if (year && parseInt(year, 10)) vehPatch.year = parseInt(year, 10);
          if (color) vehPatch.color = color;
          if (vin) vehPatch.vin = vin;
          if (engineVolume) vehPatch.notes = `נפח מנוע: ${engineVolume}`;
          await supabase.from("garage_vehicles").update(vehPatch).eq("id", vehicleId);
        }

        // 3. Create garage case (trigger garage_cases_assign_number assigns case_number automatically)
        const caseData = {
          route,
          flowStage: route === "quote_first" ? "quote" : "inspection",
          intakeDone: false,
          intakeUnlocked: route === "intake_first",
          workOrderNotes: complaints || "",
          registeredOwner: ownerName || "",
          registeredOwnerId: ownerIdNumber || "",
          timeline: [
            { at: new Date().toISOString(), text: `קליטת לקוח ורכב מרישיון רכב ע"י ${actorName || "דליה AI"}` },
          ],
        };

        const { data: newCase, error: caseErr } = await supabase
          .from("garage_cases")
          .insert({
            customer_id: customerId,
            vehicle_id: vehicleId,
            vehicle_plate_snapshot: plateNumber,
            vehicle_label_snapshot: `${make} ${model} ${year}`.trim() || plateNumber,
            customer_name_snapshot: effectiveCustomerName,
            status: "בדיקת רכב",
            case_data: caseData,
            opened_by: userId,
            opened_by_name: actorName || "דליה AI",
          })
          .select("id, case_number")
          .single();

        if (caseErr) throw new Error(`פתיחת כרטיס עבודה נכשלה: ${caseErr.message}`);

        return {
          success: true,
          message: `✅ הרכב והלקוח נקלטו בהצלחה מרישיון הרכב! נפתח כרטיס עבודה חדש [${newCase.case_number}](#/garage-management/${newCase.id}) עבור רכב ${plateNumber} (${make} ${model}) ולקוח [${effectiveCustomerName}](#/garage-management/customers/${customerId}).`,
        };
      }

      case "garage_create_customer_order": {
        const orderNumber = String(parameters.order_number || "");
        const caseId = parameters.case_id as string | null;
        const customerId = parameters.customer_id as string | null;
        const vehicleId = parameters.vehicle_id as string | null;
        const orderDate = String(parameters.order_date || "");
        const approvedAmount = Number(parameters.approved_amount) || 0;
        const contactName = String(parameters.contact_name || "");
        const driverName = String(parameters.driver_name || "");
        const description = String(parameters.description || "");
        const specialInstructions = String(parameters.special_instructions || "");
        const approvalReference = String(parameters.approval_reference || "");
        const existingOrderId = parameters.existing_order_id as string | null;

        let shopCompanyName = "";
        if (caseId) {
          const { data: gcShop } = await supabase.from("garage_cases").select("shop_company_name").eq("id", caseId).single();
          if (gcShop?.shop_company_name) shopCompanyName = gcShop.shop_company_name;
        }

        if (existingOrderId) {
          const { error } = await supabase
            .from("garage_orders")
            .update({
              order_date: orderDate,
              approved_amount: approvedAmount,
              contact_name: contactName,
              driver_name: driverName,
              description,
              special_instructions: specialInstructions,
              approval_reference: approvalReference,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingOrderId);
          if (error) throw new Error(`עדכון הזמנת עבודה נכשל: ${error.message}`);
        } else {
          const { error } = await supabase
            .from("garage_orders")
            .insert({
              case_id: caseId,
              customer_id: customerId,
              vehicle_id: vehicleId,
              order_number: orderNumber,
              order_date: orderDate,
              approved_amount: approvedAmount,
              contact_name: contactName,
              driver_name: driverName,
              description,
              special_instructions: specialInstructions,
              approval_reference: approvalReference,
              status: "received",
              shop_company_name: shopCompanyName,
              created_by: userId,
            });
          if (error) throw new Error(`שמירת הזמנת עבודה נכשלה: ${error.message}`);
        }

        if (caseId) {
          const { data: gCase } = await supabase.from("garage_cases").select("id, case_number, case_data").eq("id", caseId).single();
          if (gCase) {
            const cd = gCase.case_data || {};
            const timeline = Array.isArray(cd.timeline) ? [...cd.timeline] : [];
            timeline.push({
              at: new Date().toISOString(),
              text: `נקלטה הזמנת לקוח ${orderNumber} (סכום מאושר: ₪${approvedAmount.toLocaleString()}) ע"י ${actorName || "דליה AI"}`,
            });
            await supabase.from("garage_cases").update({
              case_data: {
                ...cd,
                workOrderSaved: true,
                workOrderNumber: orderNumber,
                workOrderAmount: approvedAmount,
                workOrderStatus: "received",
                timeline,
              },
              updated_at: new Date().toISOString(),
            }).eq("id", caseId);
          }
        }

        return {
          success: true,
          message: `✅ הזמנת עבודה מס' ${orderNumber} נשמרה בהצלחה בטבלת הזמנות המוסך${caseId ? ` ושויכה לכרטיס עבודה [${parameters.case_number || "הנוכחי"}](#/garage-management/${caseId})` : ""}${approvedAmount > 0 ? ` (סכום מאושר: ₪${approvedAmount.toLocaleString()})` : ""}.`,
        };
      }

      case "garage_send_quote": {
        const caseId = String(parameters.case_id || "");
        const recipientName = String(parameters.recipient_name || "");
        const channel = String(parameters.channel || "whatsapp");
        const grandTotal = Number(parameters.grand_total) || 0;

        const { data: existing, error: loadErr } = await supabase.from("garage_cases").select("id, case_number, case_data").eq("id", caseId).single();
        if (loadErr || !existing) throw new Error("תיק מוסך לא נמצא לשליחת הצעת מחיר");

        const cd = existing.case_data || {};
        const timeline = Array.isArray(cd.timeline) ? [...cd.timeline] : [];
        timeline.push({
          at: new Date().toISOString(),
          text: `הצעת מחיר (₪${grandTotal.toLocaleString()}) נשלחה ל-${recipientName} בערוץ ${channel} ע"י ${actorName || "דליה AI"}`,
        });

        const { error: updErr } = await supabase.from("garage_cases").update({
          status: "הצעה נשלחה",
          case_data: {
            ...cd,
            quoteSent: true,
            quoteSentAt: new Date().toISOString(),
            quoteSentTo: recipientName,
            quoteSentChannel: channel,
            quoteStatus: "sent",
            timeline,
          },
          updated_at: new Date().toISOString(),
        }).eq("id", caseId);
        if (updErr) throw new Error(`עדכון שליחת הצעה נכשל: ${updErr.message}`);

        await supabase.from("garage_orders").update({
          status: "quote_sent",
          updated_at: new Date().toISOString(),
        }).eq("case_id", caseId);

        return {
          success: true,
          message: `✅ הצעת המחיר נשלחה בהצלחה ל-${recipientName} (${channel}) עבור כרטיס עבודה [${existing.case_number}](#/garage-management/${existing.id}). הסטטוס עודכן ל-'הצעה נשלחה'.`,
        };
      }

      case "garage_approve_quote": {
        const caseId = String(parameters.case_id || "");
        const approvedBy = String(parameters.approved_by || "");
        const approvedAmount = parameters.approved_amount;
        const approvalNotes = String(parameters.approval_notes || "");

        const { data: existing, error: loadErr } = await supabase.from("garage_cases").select("id, case_number, case_data").eq("id", caseId).single();
        if (loadErr || !existing) throw new Error("תיק מוסך לא נמצא לאישור הצעת מחיר");

        const cd = existing.case_data || {};
        const timeline = Array.isArray(cd.timeline) ? [...cd.timeline] : [];
        timeline.push({
          at: new Date().toISOString(),
          text: `הצעת מחיר אושרה ע"י ${approvedBy}${approvedAmount ? ` (סכום: ₪${Number(approvedAmount).toLocaleString()})` : ""}${approvalNotes ? ` [${approvalNotes}]` : ""}`,
        });

        const { error: updErr } = await supabase.from("garage_cases").update({
          status: "אושר לביצוע",
          case_data: {
            ...cd,
            quoteApproved: true,
            quoteApprovedAt: new Date().toISOString(),
            quoteApprovedBy: approvedBy,
            quoteStatus: "approved",
            ...(approvedAmount ? { workOrderAmount: approvedAmount } : {}),
            timeline,
          },
          updated_at: new Date().toISOString(),
        }).eq("id", caseId);
        if (updErr) throw new Error(`עדכון אישור הצעה נכשל: ${updErr.message}`);

        await supabase.from("garage_orders").update({
          status: "approved",
          updated_at: new Date().toISOString(),
        }).eq("case_id", caseId);

        return {
          success: true,
          message: `✅ הצעת המחיר אושרה בהצלחה ע"י ${approvedBy}! סטטוס כרטיס עבודה [${existing.case_number}](#/garage-management/${existing.id}) עודכן ל-'אושר לביצוע'.`,
        };
      }

      default:
        return { success: false, error: `פעולה לא נתמכת: ${action_type}` };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
