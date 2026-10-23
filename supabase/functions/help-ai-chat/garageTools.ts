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

export interface GarageShopBranding {
  shop_company_name: string;
  shop_name: string;
  shop_title: string;
  subtitle: string;
  logo_url: string;
  phone: string;
  address: string;
  email: string;
  business_id: string;
  footer_note: string;
}

export interface GarageQuoteCardData {
  case_id: string;
  case_number: string;
  quote_token: string;
  quote_url: string;
  quote_version: number;
  quote_title: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  vehicle_plate: string;
  vehicle_label: string;
  quote_date: string;
  work_type: string;
  quote_works: Array<{
    id?: string;
    part?: string;
    type?: string;
    desc?: string;
    qty?: number;
    price?: number | null;
    unpriced?: boolean;
  }>;
  quote_parts: Array<{
    id?: string;
    name?: string;
    sku?: string;
    supplier?: string;
    qty?: number;
    price?: number | null;
  }>;
  priced_subtotal: number;
  global_price?: number | null;
  priced_lines_count: number;
  unpriced_lines_count: number;
  vat_rate: number;
  vat_mode: string;
  quote_notes: string;
  quote_validity: string;
  status: string;
  signed_at?: string | null;
  signer_name?: string;
  signature_data_url?: string;
  damage_photos_attached: boolean;
  damage_photos_count: number;
  damage_photos: Array<{
    id: string;
    title: string;
    category: string;
    signed_url: string;
  }>;
  shop_branding: GarageShopBranding;
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
   - הכתבה מלאה של לקוח + רכב + כרטיס עבודה + הצעת מחיר מרובת שורות (preview_garage_dictate_case_and_quote): כלי מרכזי ומתקדם המאפשר בקריאה אחת:
     * לבדוק אם הלקוח או הרכב כבר קיימים במערכת למניעת כפילויות (או לפתוח אותם ולקשר ביניהם). אם מספר טלפון או דוא"ל אינם ידועים — אל תמציא אותם! השאר ריק.
     * לפתוח כרטיס עבודה מסודר ולשמור את כל שורות העבודות בשורות נפרדות עם התיאור המלא של כל שורה.
     * לשמור שורות ללא מחיר עם price: null (תוצגנה כ-"ללא מחיר בשלב זה" — חל איסור להמציא להן מחיר או לאפס אותן ל-0!).
     * לחשב את סכום השורות המתומחרות בלבד ולציין במפורש אם ישנן שורות נוספות ללא מחיר בשלב זה.
     * לציין מע"מ לפי שיעור המס התקף בישראל, **18%**, בהתאם להגדרת המחירים ככוללים או לא כוללים מע"מ (אין להניח זאת ללא הגדרה).
     * לבדוק אם הועלו תמונות נזק בפועל: אם טרם הועלו תמונות נזק, להציג התראה מפורשת להוספתן ולא לטעון שהן צורפו בפועל עד שיועלו.
     * להכין קישור מאובטח לשליחה ולחתימה דיגיטלית של הלקוח.
   - איתור והצגת הצעת מחיר קיימת בצ'אט (get_garage_quote_for_chat): כאשר המשתמש מבקש לראות או לקבל הצעת מחיר קיימת (למשל: "תביא לי את הצעת המחיר של לירן לוי, רכב 8042376"), השתמש תמיד ב-get_garage_quote_for_chat כדי לשלוף ולהציג את הצעת המחיר השמורה בכרטיס העבודה **בלי ליצור הצעה חדשה ובלי לשנות נתונים**. המערכת תציג כרטיס תצוגה מקדימה מעוצב (עם מיתוג המוסך, למשל "מוסך יוני – פחחות וצבע לרכב") ובו כפתורים להורדת PDF, שיתוף מהטלפון, שליחה בוואטסאפ, שליחה באימייל, הדפסה ופתיחת כרטיס העבודה.
   - עריכת הצעת מחיר קיימת (preview_update_garage_quote): תוקף הצעה, אישור לקוח, סכום מאושר, הערות.
   - פירוט נזקים, עבודות פחחות/צבע, חלקי חילוף ואישורים חריגים (preview_update_garage_repair_details).
   - חישוב סכומים ומע"מ לפי שיעור **18%** התקף בישראל.

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
   - תמיכה מלאה בהכתבה או כתיבה של פרטי לקוח, מספר רכב ומספר עבודות וחלקי חילוף בפעם אחת (השתמש ב-preview_garage_dictate_case_and_quote כאשר המשתמש מכתיב פרטי לקוח, רכב והצעת מחיר חדשה, או ב-preview_update_garage_repair_details לעדכון תיק קיים).
   - שמור כל עבודה בשורה נפרדת ללא איחוד שורות, שמור את התיאור המלא של כל שורה, ואל תמציא מחירים לשורות שנאמר עליהן "ללא מחיר בשלב זה" (העבר price: null).
   - שיעור המע"מ התקף בישראל הוא **18%**. אם לא הוגדר האם המחירים כוללים או לא כוללים מע"מ, ציין: "מע"מ, ככל שחל, יחושב לפי שיעור המס התקף בישראל, 18%, ובהתאם להגדרת המחירים ככוללים או לא כוללים מע"מ. אין להניח זאת ללא הגדרה."

9. סגירת תיק עבודה ורישום תשלום לקוח (Payments & Closeout):
   - רישום תשלום לקוח (preview_garage_record_payment): כאשר הלקוח משלם (במזומן, בהעברה בנקאית, בכרטיס אשראי, ביט או צ'ק), הפק כרטיס רישום תשלום עם הסכום, אמצעי התשלום, מספר אסמכתא, ועדכון יתרת התיק.
   - סגירת תיק עבודה (preview_garage_close_case): סגירת תיק דורשת בדיקת חוסרים קפדנית (שאין שורות ללא מחיר, שהתקבל תשלום/הוסדר, שהושלמה קבלת רכב ובוצעו צילומי סיום/מסירה). הצג תמיד את דוח המוכנות לסגירה ודרוש אישור משתמש מפורש לפני ביצוע הסגירה.

10. שפה וסגנון:
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
        description: "חיפוש וסינון כרטיסי עבודה במוסך לפי שאילתת טקסט חופשית (מספר רכב, שם לקוח, דגם רכב, מספר תיק, אלדן) ו/או סטטוס (all=הכל, open=פתוח, in_work=בעבודה, waiting_approval=ממתין_לאישור, closed=סגור). מחזיר תוצאות מעודכנות ישירות ממסד הנתונים.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "מחרוזת לחיפוש: מספר רכב (למשל 8042376), שם לקוח (לירן לוי, אלדן), דגם רכב (קיה ספורטאז'), מספר תיק (GM-2026-XXXX) או מספר הזמנה",
            },
            status_filter: {
              type: "STRING",
              description: "סינון לפי סטטוס: 'all' (הכל), 'open' (פתוח/כל שאינו סגור), 'in_work' (בעבודה/הרכב התקבל), 'waiting_approval' (ממתין לאישור/הצעה בהכנה), 'closed' (סגור)",
            },
            status: {
              type: "STRING",
              description: "סינון נוסף חלופי לפי סטטוס",
            },
            limit: {
              type: "NUMBER",
              description: "כמות תוצאות מרבית (ברירת מחדל 15)",
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
        name: "read_garage_document",
        description: "קריאת תוכן של מסמך, קובץ PDF או תמונה המשויכים לכרטיס עבודה (מתוך garage_media). מחזיר מידע על הקובץ, קישור מאובטח לצפייה ותוכן.",
        parameters: {
          type: "OBJECT",
          properties: {
            case_id: { type: "STRING", description: "מספר כרטיס עבודה (GM-XXXX-XXXX) או מזהה כרטיס" },
            media_id: { type: "STRING", description: "מזהה ייחודי של המסמך (UUID)" },
            query: { type: "STRING", description: "שם הקובץ, כותרת המסמך או מילת חיפוש (למשל: רישיון, חשבונית, דוח שמאות, הזמנה)" },
          },
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
        name: "preview_garage_dictate_case_and_quote",
        description: "פתיחת/עדכון לקוח, רכב, כרטיס עבודה והכנת הצעת מחיר מלאה מרובת שורות (כולל שורות עם מחיר ושורות ללא מחיר בשלב זה price: null) מוכנה לשליחה ולחתימה דיגיטלית של הלקוח. בודק כפילויות תחילה ומונע המצאת נתונים.",
        parameters: {
          type: "OBJECT",
          properties: {
            customer_name: {
              type: "STRING",
              description: "שם הלקוח המלא (למשל: לירן לוי)",
            },
            customer_type_label: {
              type: "STRING",
              description: "סוג לקוח ותיאור (למשל: 'לקוח פרטי, חד־פעמי')",
            },
            customer_phone: {
              type: "STRING",
              description: "טלפון הלקוח אם ידוע בלבד (אל תמציא מספר טלפון אם לא נמסר! השאר ריק)",
            },
            customer_email: {
              type: "STRING",
              description: "אימייל הלקוח אם ידוע בלבד (אל תמציא אימייל אם לא נמסר! השאר ריק)",
            },
            vehicle_plate: {
              type: "STRING",
              description: "מספר הרכב / לוחית רישוי (למשל: 8042376)",
            },
            vehicle_model: {
              type: "STRING",
              description: "דגם הרכב אם ידוע",
            },
            quote_title: {
              type: "STRING",
              description: "כותרת הצעת המחיר (למשל: 'הצעת מחיר – עבודות פחחות וצבע')",
            },
            quote_date: {
              type: "STRING",
              description: "תאריך הצעת המחיר (למשל: '21.10.2026')",
            },
            work_type: {
              type: "STRING",
              description: "סוג העבודה הכללי (למשל: 'תיקוני פחחות וצבע בחזית הרכב')",
            },
            vat_mode: {
              type: "STRING",
              description: "מצב מע\"מ: 'unspecified' (ברירת מחדל אם לא הוגדר האם כולל או לא כולל מע\"מ), 'plus_vat' (תוספת 18% מע\"מ), או 'includes_vat' (כולל 18% מע\"מ)",
            },
            quote_works: {
              type: "ARRAY",
              description: "פירוט שורות העבודה בהצעת המחיר — כל חלק/עבודה בשורה נפרדת ללא איחוד שורות",
              items: {
                type: "OBJECT",
                properties: {
                  part: { type: "STRING", description: "שם החלק או המכלול (למשל: 'פגוש קדמי', 'כנף קדמית שמאלית')" },
                  type: { type: "STRING", description: "סוג העבודה (למשל: 'פחחות וצבע', 'פחחות', 'יישור', 'כיוון')" },
                  price: { type: "NUMBER", description: "מחיר בש\"ח עבור השורה. אם העבודה היא 'ללא מחיר בשלב זה', אל תעביר 0 ואל תמציא מחיר — השאר ריק/null!" },
                  unpriced: { type: "BOOLEAN", description: "סמן true אם השורה היא 'ללא מחיר בשלב זה'" },
                  qty: { type: "NUMBER", description: "כמות (ברירת מחדל 1)" },
                  desc: { type: "STRING", description: "התיאור המלא והמדויק של העבודה בשורה זו" },
                },
              },
            },
            quote_parts: {
              type: "ARRAY",
              description: "חלקי חילוף (אם ישנם)",
              items: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING", description: "שם החלק" },
                  price: { type: "NUMBER", description: "מחיר בש\"ח" },
                  qty: { type: "NUMBER", description: "כמות" },
                },
              },
            },
            quote_notes: {
              type: "STRING",
              description: "הערות נוספות להצעת המחיר",
            },
          },
          required: ["customer_name", "vehicle_plate", "quote_works"],
        },
      },
      {
        name: "get_garage_quote_for_chat",
        description: "איתור והצגת הצעת מחיר שמורה מתוך כרטיס עבודה קיים ישירות בתוך הצ'אט (לפי שם לקוח, מספר רכב או מספר כרטיס עבודה), בלי ליצור הצעה חדשה ובלי לשנות נתונים. מציג בצ'אט כרטיס הצעת מחיר מעוצב עם כפתורי הורדת PDF, שיתוף, שליחה בוואטסאפ, שליחה באימייל, הדפסה ופתיחת כרטיס העבודה.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "מחרוזת חיפוש חופשית (למשל שם לקוח ו/או מספר רכב או מספר כרטיס עבודה GM-2026-XXXX)",
            },
            customer_name: {
              type: "STRING",
              description: "שם הלקוח (למשל: לירן לוי)",
            },
            vehicle_plate: {
              type: "STRING",
              description: "מספר לוחית רישוי של הרכב (למשל: 8042376)",
            },
            case_id: {
              type: "STRING",
              description: "מזהה התיק (UUID) או מספר כרטיס עבודה (למשל: GM-2026-0056)",
            },
          },
        },
      },
      {
        name: "preview_garage_create_customer_and_vehicle",
        description: "הקמת לקוח חדש ורכב חדש במהלך אחד לאחר בדיקת כפילויות. בודק אם הלקוח או הרכב כבר קיימים. לאחר האישור והשמירה יש לשאול: 'האם צריך להכין ללקוח הצעת מחיר?'.",
        parameters: {
          type: "OBJECT",
          properties: {
            customer_name: { type: "STRING", description: "שם מלא של הלקוח" },
            customer_phone: { type: "STRING", description: "מספר טלפון נייד" },
            customer_type: { type: "STRING", description: "'private' (פרטי) או 'business' (עסקי) או 'fleet' (צי רכב)" },
            company_name: { type: "STRING", description: "שם חברה (עבור לקוח עסקי/צי)" },
            email: { type: "STRING", description: "כתובת דוא\"ל" },
            address: { type: "STRING", description: "כתובת הלקוח" },
            business_id: { type: "STRING", description: "ח.פ. או ת.ז." },
            notes: { type: "STRING", description: "הערות" },
            vehicle_plate: { type: "STRING", description: "מספר רישוי הרכב (חובה)" },
            vehicle_make: { type: "STRING", description: "יצרן הרכב (למשל: יונדאי, טויוטה)" },
            vehicle_model: { type: "STRING", description: "דגם הרכב" },
            vehicle_year: { type: "NUMBER", description: "שנת ייצור" },
            vehicle_color: { type: "STRING", description: "צבע הרכב" },
            vehicle_vin: { type: "STRING", description: "מספר שלדה (VIN)" },
            vehicle_type: { type: "STRING", description: "סוג רכב (פרטי, מסחרי וכו')" },
          },
          required: ["customer_name", "vehicle_plate"],
        },
      },
      {
        name: "preview_garage_intake_inspection",
        description: "קבלת רכב לעבודה עם חובת 5 תמונות ורישום קילומטראז'. חובה לספק 5 תמונות: חזית, אחור, ימין, שמאל, ולוח שעונים/קילומטראז'. ללא התמונות והקילומטראז' לא ניתן להשלים קבלת רכב.",
        parameters: {
          type: "OBJECT",
          properties: {
            case_number: { type: "STRING", description: "מספר תיק עבודה (למשל GM-2026-0056) או מספר לוחית רישוי" },
            intake_km: { type: "STRING", description: "קילומטראז' מד אוץ בפועל (שדה חובה)" },
            front_photo: { type: "STRING", description: "תמונת חזית הרכב (חובה)" },
            rear_photo: { type: "STRING", description: "תמונת אחורי הרכב (חובה)" },
            right_photo: { type: "STRING", description: "תמונת צד ימין של הרכב (חובה)" },
            left_photo: { type: "STRING", description: "תמונת צד שמאל של הרכב (חובה)" },
            dashboard_km_photo: { type: "STRING", description: "תמונת לוח שעונים/מד אוץ (חובה)" },
            intake_fuel: { type: "STRING", description: "כמות דלק (רבע, חצי, מלא וכו')" },
            intake_keys: { type: "STRING", description: "מספר מפתחות שנמסרו" },
            intake_lights: { type: "STRING", description: "בדיקת תאורה" },
            intake_interior: { type: "STRING", description: "מצב פנים הרכב" },
            intake_items: { type: "STRING", description: "חפצים ברכב" },
            inspector_notes: { type: "STRING", description: "הערות בוחן/יועץ שירות" },
          },
          required: ["case_number", "intake_km"],
        },
      },
      {
        name: "preview_garage_create_supplier",
        description: "פתיחת ספק חדש בספר הספקים של המוסך. בודק מראש כפילויות לפי שם או ח.פ/עוסק מורשה, מגדיר קטגוריית ספק ומקצה מספר ספק SUP-xxxx.",
        parameters: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING", description: "שם הספק (חובה)" },
            phone: { type: "STRING", description: "מספר טלפון של הספק" },
            category: { type: "STRING", description: "קטגוריה: 'parts' (חלפים), 'paints' (צבעים), 'materials' (חומרים), 'tires' (צמיגים), 'subcontractor' (קבלן משנה), 'general' (כללי)" },
            business_id: { type: "STRING", description: "ח.פ. / עוסק מורשה" },
            contact_person: { type: "STRING", description: "איש קשר" },
            email: { type: "STRING", description: "דואר אלקטרוני" },
            notes: { type: "STRING", description: "הערות" },
          },
          required: ["name"],
        },
      },
      {
        name: "preview_garage_record_invoice",
        description: "קליטת חשבונית ספק, הוצאה כללית או זיכוי. תומך ב: מסלול א' (חשבונית חלקים לתיק רכב), מסלול ב' (הוצאה כללית ללא שיוך לרכב: צבעים, כלים, ציוד), מסלול ג' (איתור/פתיחת ספק בספר הספקים), מסלול ד' (חשבונית זיכוי והחזרת חלקים).",
        parameters: {
          type: "OBJECT",
          properties: {
            invoice_type: { type: "STRING", description: "'parts_invoice' (חשבונית חלקים לרכב), 'general_expense' (הוצאה כללית של המוסך), או 'credit_note' (חשבונית זיכוי)" },
            invoice_number: { type: "STRING", description: "מספר חשבונית הספק" },
            supplier_name: { type: "STRING", description: "שם הספק" },
            invoice_date: { type: "STRING", description: "תאריך החשבונית (YYYY-MM-DD)" },
            subtotal: { type: "NUMBER", description: "סכום לפני מע\"מ" },
            vat_amount: { type: "NUMBER", description: "סכום מע\"מ (18%)" },
            total_amount: { type: "NUMBER", description: "סה\"כ כולל מע\"מ" },
            case_number: { type: "STRING", description: "מספר תיק עבודה (אם החשבונית שייכת לרכב מסוים)" },
            vehicle_plate: { type: "STRING", description: "מספר רישוי הרכב (אם שייכת לרכב)" },
            expense_category: { type: "STRING", description: "קטגוריה עבור הוצאה כללית: 'paints' (צבעים), 'materials' (חומרי פחחות), 'tools' (כלי עבודה), 'equipment' (ציוד), 'services' (שירותים למוסך), 'parts' (חלקים)" },
            parts_received_confirmed: { type: "BOOLEAN", description: "האם כל החלקים התקבלו בפועל" },
            returned_parts_exist: { type: "BOOLEAN", description: "האם יש חלק שהוחזר" },
            returned_parts_notes: { type: "STRING", description: "פירוט חלקים שהוחזרו" },
            credit_status: { type: "STRING", description: "'none', 'credit_pending' (ממתין לזיכוי), 'credit_received' (התקבל זיכוי)" },
            accounting_notes: { type: "STRING", description: "הערה להנהלת החשבונות" },
            line_items: {
              type: "ARRAY",
              description: "פירוט שורות הפריטים בחשבונית",
              items: {
                type: "OBJECT",
                properties: {
                  item_name: { type: "STRING" },
                  qty: { type: "NUMBER" },
                  price: { type: "NUMBER" },
                },
              },
            },
          },
          required: ["invoice_type", "invoice_number", "supplier_name", "total_amount"],
        },
      },
      {
        name: "preview_garage_record_payment",
        description: "רישום תשלום לקוח (מזומן, העברה בנקאית, כרטיס אשראי, ביט, צ'ק) עבור כרטיס עבודה. מעדכן את יתרת התיק, סטטוס התשלום, ורושם ביומן הפעולות (timeline).",
        parameters: {
          type: "OBJECT",
          properties: {
            case_number: { type: "STRING", description: "מספר תיק עבודה (לדוגמה GM-2026-0042) או מזהה כרטיס" },
            vehicle_plate: { type: "STRING", description: "מספר רישוי הרכב (אם מספר התיק אינו ידוע)" },
            amount: { type: "NUMBER", description: "סכום התשלום שהתקבל בש\"ח (כולל מע\"מ)" },
            payment_method: {
              type: "STRING",
              description: "אמצעי התשלום: 'transfer' (העברה בנקאית), 'cash' (מזומן), 'credit_card' (כרטיס אשראי), 'bit' (ביט / אפליקציית תשלום), 'check' (צ'ק), 'other' (אחר)",
            },
            reference: { type: "STRING", description: "מספר אסמכתא, קבלה, מספר צ'ק, או מספר אישור עסקה" },
            payer_name: { type: "STRING", description: "שם המשלם או הלקוח" },
            payment_date: { type: "STRING", description: "תאריך ביצוע התשלום (YYYY-MM-DD), ברירת מחדל היום" },
            notes: { type: "STRING", description: "הערות נוספות על התשלום" },
          },
          required: ["amount"],
        },
      },
      {
        name: "preview_garage_close_case",
        description: "בדיקת חוסרים וסגירת תיק עבודה למשתמש מורשה. בודק: 1. סיום עבודה בפועל 2. הצעת מחיר מאושרת 3. מסמכים מחייבים ותמונות קבלה 4. סגירת חשבוניות וזיכויים 5. עבור לקוח אלדן/צי: קבלת הזמנה מתומחרת. מציג רשימת חוסרים אם ישנם.",
        parameters: {
          type: "OBJECT",
          properties: {
            case_number: { type: "STRING", description: "מספר התיק לסגירה (למשל GM-2026-0056) או מספר לוחית רישוי" },
            closure_notes: { type: "STRING", description: "הערות סיום עבודה ומסירה" },
            force_override: { type: "BOOLEAN", description: "אישור מנהל מורשה לסגירה חרף חוסרים" },
          },
          required: ["case_number"],
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

const DEFAULT_YONI_LOGO_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80" width="240" height="80"><rect width="240" height="80" rx="14" fill="%230f172a"/><rect x="3" y="3" width="234" height="74" rx="11" fill="none" stroke="%2338bdf8" stroke-width="2"/><g transform="translate(185, 16)"><circle cx="24" cy="24" r="22" fill="%230284c7"/><path d="M12 28 L16 19 L32 19 L36 28 Z" fill="%23ffffff"/><rect x="10" y="26" width="28" height="8" rx="3" fill="%2338bdf8"/><circle cx="16" cy="34" r="4" fill="%230f172a" stroke="%23ffffff" stroke-width="2"/><circle cx="32" cy="34" r="4" fill="%230f172a" stroke="%23ffffff" stroke-width="2"/></g><text x="170" y="36" font-family="Heebo, Arial, sans-serif" font-size="22" font-weight="900" fill="%23ffffff" text-anchor="end" direction="rtl">מוסך יוני</text><text x="170" y="58" font-family="Heebo, Arial, sans-serif" font-size="13" font-weight="700" fill="%2338bdf8" text-anchor="end" direction="rtl">פחחות וצבע לרכב</text></svg>`;

// Helper to resolve case ID by UUID, case_number, plate snapshot, or customer name
async function resolveGarageCase(supabase: any, caseIdentifier: string) {
  const clean = String(caseIdentifier || "").trim();
  if (!clean) return null;

  // Try UUID match
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
    const { data } = await supabase.from("garage_cases").select("*").eq("id", clean).single();
    if (data) return data;
  }

  // Try explicit GM-YYYY-XXXX inside string
  const gmMatch = clean.match(/GM-\d{4}-\d+/i);
  if (gmMatch) {
    const { data } = await supabase.from("garage_cases").select("*").ilike("case_number", `%${gmMatch[0]}%`).order("updated_at", { ascending: false }).limit(1);
    if (data && data.length > 0) return data[0];
  }

  // Try explicit plate digits (5-8 digits) inside string
  const plateMatch = clean.replace(/-/g, "").match(/\b\d{5,8}\b/);
  if (plateMatch) {
    const pNum = plateMatch[0];
    const { data: plateData } = await supabase.from("garage_cases").select("*").ilike("vehicle_plate_snapshot", `%${pNum}%`).order("updated_at", { ascending: false }).limit(1);
    if (plateData && plateData.length > 0) return plateData[0];

    const { data: qlRows } = await supabase.from("garage_quote_links").select("case_id").ilike("vehicle_plate", `%${pNum}%`).order("updated_at", { ascending: false }).limit(1);
    if (qlRows && qlRows.length > 0 && qlRows[0].case_id) {
      const { data: cByLink } = await supabase.from("garage_cases").select("*").eq("id", qlRows[0].case_id).maybeSingle();
      if (cByLink) return cByLink;
    }

    const { data: vehRows } = await supabase.from("garage_vehicles").select("id").ilike("plate", `%${pNum}%`).limit(5);
    if (vehRows && vehRows.length > 0) {
      const vIds = vehRows.map((v: any) => v.id);
      const { data: cByVeh } = await supabase.from("garage_cases").select("*").in("vehicle_id", vIds).order("updated_at", { ascending: false }).limit(1);
      if (cByVeh && cByVeh.length > 0) return cByVeh[0];
    }
  }

  // Try case_number match
  const { data } = await supabase.from("garage_cases").select("*").ilike("case_number", `%${clean}%`).order("updated_at", { ascending: false }).limit(1);
  if (data && data.length > 0) return data[0];

  // Try plate snapshot match
  const { data: plateData } = await supabase.from("garage_cases").select("*").ilike("vehicle_plate_snapshot", `%${clean}%`).order("updated_at", { ascending: false }).limit(1);
  if (plateData && plateData.length > 0) return plateData[0];

  // Try customer_name_snapshot match
  const { data: custData } = await supabase.from("garage_cases").select("*").ilike("customer_name_snapshot", `%${clean}%`).order("updated_at", { ascending: false }).limit(1);
  if (custData && custData.length > 0) return custData[0];

  // Try garage_quote_links customer_name match
  const { data: qlCust } = await supabase.from("garage_quote_links").select("case_id").ilike("customer_name", `%${clean}%`).order("updated_at", { ascending: false }).limit(1);
  if (qlCust && qlCust.length > 0 && qlCust[0].case_id) {
    const { data: cByLink } = await supabase.from("garage_cases").select("*").eq("id", qlCust[0].case_id).maybeSingle();
    if (cByLink) return cByLink;
  }

  // Try garage_customers name match -> garage_cases by customer_id
  const { data: custRows } = await supabase.from("garage_customers").select("id").ilike("name", `%${clean}%`).limit(5);
  if (custRows && custRows.length > 0) {
    const cIds = custRows.map((c: any) => c.id);
    const { data: cByCust } = await supabase.from("garage_cases").select("*").in("customer_id", cIds).order("updated_at", { ascending: false }).limit(1);
    if (cByCust && cByCust.length > 0) return cByCust[0];
  }

  return null;
}

export async function buildGarageQuoteCardFromCase(
  supabase: any,
  gCase: any,
): Promise<GarageQuoteCardData> {
  const cd = gCase.case_data || {};
  const shopCompanyName = String(gCase.shop_company_name || "").trim();

  // 1. Read latest quote link if exists (READ-ONLY — never mutate)
  const { data: linkRows } = await supabase
    .from("garage_quote_links")
    .select("*")
    .eq("case_id", gCase.id)
    .neq("status", "revoked")
    .order("quote_version", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  const linkRow = linkRows && linkRows.length > 0 ? linkRows[0] : null;

  // 2. Read customer & vehicle details (READ-ONLY)
  let customerRecord: any = null;
  if (gCase.customer_id) {
    const { data: cust } = await supabase.from("garage_customers").select("*").eq("id", gCase.customer_id).maybeSingle();
    customerRecord = cust;
  }
  let vehicleRecord: any = null;
  if (gCase.vehicle_id) {
    const { data: veh } = await supabase.from("garage_vehicles").select("*").eq("id", gCase.vehicle_id).maybeSingle();
    vehicleRecord = veh;
  }

  // 3. Read shop branding from garage_shop_settings (READ-ONLY)
  let shopBranding: GarageShopBranding = {
    shop_company_name: shopCompanyName,
    shop_name: shopCompanyName || "מוסך יוני",
    shop_title: shopCompanyName || "מוסך יוני – פחחות וצבע לרכב",
    subtitle: "מומחים לפחחות, צבע ושיקום רכב מתקדם",
    logo_url: DEFAULT_YONI_LOGO_SVG,
    phone: "",
    address: "",
    email: "yoni191177@gmail.com",
    business_id: "",
    footer_note: "תודה שבחרתם במוסך יוני – פחחות וצבע לרכב.",
  };

  try {
    const { data: shopRow } = await supabase
      .from("garage_shop_settings")
      .select("*")
      .in("shop_company_name", [shopCompanyName, ""])
      .order("shop_company_name", { ascending: false })
      .limit(1);
    if (shopRow && shopRow.length > 0) {
      const s = shopRow[0];
      shopBranding = {
        shop_company_name: s.shop_company_name || shopCompanyName,
        shop_name: s.shop_name || "מוסך יוני",
        shop_title: s.shop_title || "מוסך יוני – פחחות וצבע לרכב",
        subtitle: s.subtitle || "פחחות וצבע לרכב",
        logo_url: s.logo_url || DEFAULT_YONI_LOGO_SVG,
        phone: s.phone && s.phone !== "050-0000000" ? s.phone : "",
        address: s.address && s.address !== "ישראל" ? s.address : "",
        email: s.email || "yoni191177@gmail.com",
        business_id: s.business_id || "",
        footer_note: s.footer_note || "תודה שבחרתם במוסך יוני – פחחות וצבע לרכב.",
      };
    }
  } catch {
    // Fallback to default Yoni's Garage branding
  }

  // 4. Read damage/quote photos (READ-ONLY)
  const damagePhotos: Array<{ id: string; title: string; category: string; signed_url: string }> = [];
  try {
    const { data: mediaRows } = await supabase
      .from("garage_media")
      .select("id, title, category, storage_path, mime_type")
      .eq("garage_case_id", gCase.id)
      .in("category", ["damage", "quote_photos", "intake", "angles"])
      .limit(8);
    if (Array.isArray(mediaRows)) {
      for (const m of mediaRows) {
        if (m.storage_path && String(m.mime_type || "").startsWith("image/")) {
          const { data: signed } = await supabase.storage.from("garage-media").createSignedUrl(m.storage_path, 3600);
          if (signed?.signedUrl) {
            damagePhotos.push({
              id: m.id,
              title: m.title || "תמונת נזק",
              category: m.category || "damage",
              signed_url: signed.signedUrl,
            });
          }
        }
      }
    }
  } catch {
    // Ignore media errors
  }

  const works = Array.isArray(linkRow?.quote_works) && linkRow.quote_works.length > 0
    ? linkRow.quote_works
    : (Array.isArray(cd.quoteWorks) ? cd.quoteWorks : []);
  const parts = Array.isArray(linkRow?.quote_parts) && linkRow.quote_parts.length > 0
    ? linkRow.quote_parts
    : (Array.isArray(cd.quoteParts) ? cd.quoteParts : []);

  const pricedWorks = works.filter((w: any) => w.price !== null && w.price !== undefined && String(w.price).trim() !== "" && !w.unpriced);
  const unpricedWorks = works.filter((w: any) => w.price === null || w.price === undefined || String(w.price).trim() === "" || w.unpriced);
  const worksSubtotal = pricedWorks.reduce((acc: number, w: any) => acc + (Number(w.price) || 0) * (Number(w.qty) || 1), 0);
  const partsSubtotal = parts
    .filter((p: any) => p.supplier !== "customer")
    .reduce((acc: number, p: any) => acc + (Number(p.price) || 0) * (Number(p.qty) || 1), 0);
  const pricedSubtotal = Number(linkRow?.priced_subtotal ?? cd.quotePricedSubtotal ?? (worksSubtotal + partsSubtotal));
  const globalPrice = cd.finalApprovedAmount || cd.workOrderAmount || null;
  const quoteToken = String(linkRow?.token || cd.quoteToken || "");

  return {
    case_id: gCase.id,
    case_number: gCase.case_number,
    quote_token: quoteToken,
    quote_url: quoteToken ? `/garage-quote?t=${quoteToken}` : "",
    quote_version: Number(linkRow?.quote_version || cd.quoteVersion || 1),
    quote_title: String(linkRow?.quote_title || cd.quoteTitle || "הצעת מחיר – עבודות פחחות וצבע"),
    customer_name: String(linkRow?.customer_name || gCase.customer_name_snapshot || customerRecord?.name || ""),
    customer_phone: String(linkRow?.recipient_phone || customerRecord?.phone || ""),
    customer_email: String(linkRow?.recipient_email || customerRecord?.email || ""),
    vehicle_plate: String(linkRow?.vehicle_plate || gCase.vehicle_plate_snapshot || vehicleRecord?.plate || ""),
    vehicle_label: String(gCase.vehicle_label_snapshot || [vehicleRecord?.make, vehicleRecord?.model, vehicleRecord?.year].filter(Boolean).join(" ") || ""),
    quote_date: String(linkRow?.quote_date || cd.quoteDate || (gCase.created_at ? new Date(gCase.created_at).toLocaleDateString("he-IL") : "")),
    work_type: String(linkRow?.work_type || cd.workType || ""),
    quote_works: works,
    quote_parts: parts,
    priced_subtotal: pricedSubtotal,
    global_price: globalPrice ? Number(globalPrice) : null,
    priced_lines_count: pricedWorks.length,
    unpriced_lines_count: unpricedWorks.length,
    vat_rate: Number(linkRow?.vat_rate || cd.vatRate || 18),
    vat_mode: String(linkRow?.vat_mode || cd.vatMode || "unspecified"),
    quote_notes: String(linkRow?.quote_notes || cd.quoteNotes || ""),
    quote_validity: String(cd.quoteValidity || "14 יום"),
    status: String(linkRow?.status || (cd.quoteSigned ? "signed" : cd.quoteStatus || "ready_to_send")),
    signed_at: linkRow?.signed_at || cd.quoteSignedAt || null,
    signer_name: String(linkRow?.signer_name || cd.quoteSignerName || ""),
    signature_data_url: String(linkRow?.signature_data_url || cd.quoteSignatureDataUrl || ""),
    damage_photos_attached: Boolean(damagePhotos.length > 0 || linkRow?.damage_photos_attached || cd.damagePhotosAttached),
    damage_photos_count: Math.max(damagePhotos.length, Number(linkRow?.damage_photos_count || cd.damagePhotosCount || 0)),
    damage_photos: damagePhotos,
    shop_branding: shopBranding,
  };
}

export async function executeGarageTool(
  toolName: string,
  args: Record<string, unknown>,
  supabase: any,
  caseId: string | null,
  userId: string,
  actorName: string,
): Promise<{ result: unknown; preview?: GaragePendingAction; quoteCard?: GarageQuoteCardData }> {
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
      const q = String(args?.query || args?.q || "").trim();
      const rawStatus = String(args?.status_filter || args?.status || "all").toLowerCase();
      const limit = Math.min(Math.max(Number(args?.limit) || 15, 1), 50);

      let dbQuery = supabase
        .from("garage_cases")
        .select("id, case_number, customer_name_snapshot, vehicle_plate_snapshot, vehicle_label_snapshot, status, created_at, updated_at, case_data")
        .order("created_at", { ascending: false });

      if (shopScope?.company_name) {
        dbQuery = dbQuery.ilike("shop_company_name", `%${shopScope.company_name}%`);
      }

      if (rawStatus === "closed" || rawStatus === "סגור") {
        dbQuery = dbQuery.eq("status", "סגור");
      } else if (rawStatus === "open" || rawStatus === "פתוח") {
        dbQuery = dbQuery.neq("status", "סגור");
      } else if (rawStatus === "in_work" || rawStatus === "בעבודה") {
        dbQuery = dbQuery.in("status", ["בעבודה", "הרכב התקבל"]);
      } else if (rawStatus === "waiting_approval" || rawStatus === "ממתין לאישור") {
        dbQuery = dbQuery.in("status", ["ממתין לאישור", "הצעה בהכנה", "בדיקת רכב"]);
      }

      if (q) {
        const cleanQ = q.replace(/[%_,]/g, "").trim();
        const digits = cleanQ.replace(/[^0-9]/g, "");
        if (digits && digits.length >= 5) {
          dbQuery = dbQuery.or(`vehicle_plate_snapshot.ilike.%${digits}%,vehicle_plate_snapshot.ilike.%${cleanQ}%,case_number.ilike.%${cleanQ}%,customer_name_snapshot.ilike.%${cleanQ}%`);
        } else {
          dbQuery = dbQuery.or(`case_number.ilike.%${cleanQ}%,customer_name_snapshot.ilike.%${cleanQ}%,vehicle_plate_snapshot.ilike.%${cleanQ}%,vehicle_label_snapshot.ilike.%${cleanQ}%`);
        }
      }

      dbQuery = dbQuery.limit(limit);

      const { data: rows, error: qErr } = await dbQuery;
      if (qErr) {
        return { result: { error: `שגיאה בשליפת כרטיסי עבודה: ${qErr.message}` } };
      }

      let cases = rows || [];
      if (q) {
        const qLower = q.toLowerCase();
        cases = cases.filter((c: any) => {
          const cd = c.case_data || {};
          const hay = [
            c.case_number,
            c.customer_name_snapshot,
            c.vehicle_plate_snapshot,
            c.vehicle_label_snapshot,
            cd.workOrderNumber,
            cd.claimNumber,
            c.status,
          ].filter(Boolean).join(" ").toLowerCase();
          return hay.includes(qLower);
        });
      }

      const formattedCases = cases.map((c: any) => {
        const cd = c.case_data || {};
        return {
          id: c.id,
          case_number: c.case_number,
          customer_name: c.customer_name_snapshot || "—",
          vehicle_plate: c.vehicle_plate_snapshot || "—",
          vehicle_label: c.vehicle_label_snapshot || "—",
          status: c.status,
          created_at: c.created_at,
          order_number: cd.workOrderNumber || "—",
          claim_number: cd.claimNumber || "—",
          closed_at: cd.caseClosedAt || cd.workFinishedAt || null,
        };
      });

      let mdTable = "";
      if (formattedCases.length === 0) {
        mdTable = `לא נמצאו כרטיסי עבודה התואמים לחיפוש "${q || rawStatus}".`;
      } else {
        mdTable = `נמצאו **${formattedCases.length}** כרטיסי עבודה:\n\n` +
          `| מספר תיק | לקוח | מספר רכב | דגם | סטטוס | פעולה |\n` +
          `| :--- | :--- | :--- | :--- | :--- | :--- |\n` +
          formattedCases.map((c: any) =>
            `| **${c.case_number}** | ${c.customer_name} | **${c.vehicle_plate}** | ${c.vehicle_label} | \`${c.status}\` | [פתח כרטיס עבודה](#/garage-management/${c.id}) |`
          ).join("\n");
      }

      return {
        result: {
          success: true,
          found_count: formattedCases.length,
          cases: formattedCases,
          summary_markdown: mdTable,
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
            title: cd.quoteTitle || "הצעת מחיר – עבודות פחחות וצבע",
            date: cd.quoteDate || "",
            work_type: cd.workType || "",
            notes: cd.quoteNotes || "",
            validity: cd.quoteValidity || "14 יום",
            approved: !!cd.quoteApproved,
            signed: !!cd.quoteSigned,
            signed_at: cd.quoteSignedAt || null,
            signer_name: cd.quoteSignerName || null,
            version: cd.quoteVersion || 1,
            token: cd.quoteToken || null,
            quote_url: cd.quoteToken ? `/garage-quote?t=${cd.quoteToken}` : null,
            status: cd.quoteStatus || "draft",
            priced_subtotal: cd.quotePricedSubtotal ?? null,
            priced_lines_count: cd.quotePricedLinesCount ?? null,
            unpriced_lines_count: cd.quoteUnpricedLinesCount ?? null,
            vat_rate: cd.vatRate || 18,
            vat_mode: cd.vatMode || "unspecified",
            damage_photos_attached: !!cd.damagePhotosAttached,
            damage_photos_count: cd.damagePhotosCount || 0,
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

    case "get_garage_quote_for_chat": {
      const explicitCaseId = String(args?.case_id || "").trim();
      const vehiclePlate = String(args?.vehicle_plate || "").replace(/[^0-9A-Za-z]/g, "").trim();
      const customerName = String(args?.customer_name || "").trim();
      const freeQuery = String(args?.query || targetCaseId || "").trim();

      let gCase: any = null;
      if (explicitCaseId) {
        gCase = await resolveGarageCase(supabase, explicitCaseId);
      }
      if (!gCase && vehiclePlate) {
        gCase = await resolveGarageCase(supabase, vehiclePlate);
      }
      if (!gCase && freeQuery) {
        gCase = await resolveGarageCase(supabase, freeQuery);
      }
      if (!gCase && customerName) {
        gCase = await resolveGarageCase(supabase, customerName);
      }
      if (!gCase && caseId) {
        gCase = await resolveGarageCase(supabase, caseId);
      }

      if (!gCase) {
        return {
          result: {
            error: `לא נמצאה הצעת מחיר או כרטיס עבודה עבור: "${[customerName, vehiclePlate, explicitCaseId, freeQuery].filter(Boolean).join(" / ")}"`,
          },
        };
      }

      const quoteCard = await buildGarageQuoteCardFromCase(supabase, gCase);
      const workLinesFormatted = (quoteCard.quote_works || [])
        .map((w: any, idx: number) => {
          const hasPrice = w.price !== null && w.price !== undefined && String(w.price).trim() !== "" && !w.unpriced;
          const priceLabel = hasPrice
            ? `${Number(w.price).toLocaleString()} ₪`
            : "ללא מחיר בשלב זה";
          return `${idx + 1}. **${w.part || w.type || "עבודה"}** – **${priceLabel}**${w.desc ? `\n   ${w.desc}` : ""}`;
        })
        .join("\n\n");

      const formattedReply = [
        `📄 **הצעת המחיר אותרה בכרטיס העבודה [${quoteCard.case_number}](#/garage-management/${quoteCard.case_id}) (ללא שינוי נתונים או יצירת הצעה חדשה):**`,
        `- **מוסך:** ${quoteCard.shop_branding.shop_title}`,
        `- **לכבוד:** ${quoteCard.customer_name}`,
        `- **מספר רכב:** ${quoteCard.vehicle_plate}${quoteCard.vehicle_label ? ` (${quoteCard.vehicle_label})` : ""}`,
        `- **תאריך ההצעה:** ${quoteCard.quote_date} · **גרסה:** #${quoteCard.quote_version}`,
        quoteCard.work_type ? `- **סוג עבודה:** ${quoteCard.work_type}` : "",
        "",
        `### 🛠️ פירוט העבודות (${quoteCard.quote_works.length} שורות):`,
        workLinesFormatted || "אין שורות עבודה מתומחרות.",
        "",
        `### 💰 סיכום כספי ומע"מ:`,
        `- **סה"כ עבור ${quoteCard.priced_lines_count} השורות המתומחרות בלבד:** **${Number(quoteCard.priced_subtotal || 0).toLocaleString()} ₪**`,
        ...(quoteCard.unpriced_lines_count > 0
          ? [`- ⚠️ **שים לב:** סכום הביניים (${Number(quoteCard.priced_subtotal || 0).toLocaleString()} ₪) מתייחס ל-${quoteCard.priced_lines_count} העבודות המתומחרות בלבד ואינו סופי (${quoteCard.unpriced_lines_count} שורות מוגדרות "ללא מחיר בשלב זה").`]
          : []),
        `- **מע"מ (${quoteCard.vat_rate || 18}%):** מע"מ, ככל שחל, יחושב לפי שיעור המס התקף בישראל, **18%**, ובהתאם להגדרת המחירים ככוללים או לא כוללים מע"מ.`,
        "",
        `👇 **כרטיס הצעת המחיר המעוצב מוצג להלן עם כפתורי הורדת PDF, שיתוף ישיר מהטלפון, וואטסאפ, אימייל, הדפסה ופתיחת כרטיס העבודה:**`,
      ].filter(Boolean).join("\n");

      return {
        result: {
          found: true,
          read_only: true,
          message: formattedReply,
          case_id: quoteCard.case_id,
          case_number: quoteCard.case_number,
          customer_name: quoteCard.customer_name,
          vehicle_plate: quoteCard.vehicle_plate,
          quote_version: quoteCard.quote_version,
          quote_url: quoteCard.quote_url,
          priced_subtotal: quoteCard.priced_subtotal,
          priced_lines_count: quoteCard.priced_lines_count,
          unpriced_lines_count: quoteCard.unpriced_lines_count,
          status: quoteCard.status,
          shop_title: quoteCard.shop_branding.shop_title,
        },
        quoteCard,
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
        const cleanQ = query.replace(/[%_,]/g, "").trim();
        const digits = cleanQ.replace(/[^0-9]/g, "");
        if (digits && digits.length >= 7) {
          dbQuery = dbQuery.or(`name.ilike.%${cleanQ}%,phone.ilike.%${digits}%,phone.ilike.%${cleanQ}%,second_phone.ilike.%${digits}%,company_name.ilike.%${cleanQ}%,business_id.ilike.%${cleanQ}%,customer_number.ilike.%${cleanQ}%`);
        } else {
          dbQuery = dbQuery.or(`name.ilike.%${cleanQ}%,phone.ilike.%${cleanQ}%,company_name.ilike.%${cleanQ}%,business_id.ilike.%${cleanQ}%,customer_number.ilike.%${cleanQ}%`);
        }
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

    case "read_garage_document": {
      const gCase = await resolveGarageCase(supabase, args?.case_id || targetCaseId);
      const mediaId = String(args?.media_id || "").trim();
      const query = String(args?.query || "").trim();

      let dbQuery = supabase.from("garage_media").select("*");
      if (mediaId) {
        dbQuery = dbQuery.eq("id", mediaId);
      } else if (gCase) {
        dbQuery = dbQuery.eq("garage_case_id", gCase.id);
        if (query) {
          dbQuery = dbQuery.or(`title.ilike.%${query}%,original_name.ilike.%${query}%,category.ilike.%${query}%`);
        }
      } else if (query) {
        dbQuery = dbQuery.or(`title.ilike.%${query}%,original_name.ilike.%${query}%`);
      }
      dbQuery = dbQuery.order("created_at", { ascending: false }).limit(5);

      const { data: mediaRows, error: mErr } = await dbQuery;
      if (mErr) throw new Error(`שגיאה באיתור מסמך: ${mErr.message}`);
      if (!mediaRows || mediaRows.length === 0) {
        return { result: { error: `לא נמצאו מסמכים תואמים עבור: "${query || mediaId || targetCaseId}"` } };
      }

      const file = mediaRows[0];
      let signedUrl = "";
      if (file.storage_path) {
        const { data: sData } = await supabase.storage.from("garage-media").createSignedUrl(file.storage_path, 3600);
        signedUrl = sData?.signedUrl || "";
      }

      return {
        result: {
          id: file.id,
          title: file.title || file.original_name,
          category: file.category,
          mime_type: file.mime_type,
          size_kb: file.byte_size ? Math.round(file.byte_size / 1024) : 0,
          created_at: file.created_at,
          signed_url: signedUrl,
          meta: file.meta || {},
          message: `מסמך "${file.title || file.original_name}" אותר בהצלחה (${file.category || "מדיה"}). קישור לצפייה: ${signedUrl}`,
        },
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

    case "preview_garage_create_customer_and_vehicle": {
      const custName = String(args.customer_name || "").trim();
      const phone = String(args.customer_phone || "").trim();
      const plate = String(args.vehicle_plate || "").replace(/[^0-9]/g, "").trim();

      // Check duplicates
      const [{ data: existingCust }, { data: existingVeh }] = await Promise.all([
        phone ? supabase.from("garage_customers").select("id, name, customer_number, phone").eq("phone", phone).maybeSingle() : Promise.resolve({ data: null }),
        plate ? supabase.from("garage_vehicles").select("id, plate, make, model, customer_id").eq("plate", plate).maybeSingle() : Promise.resolve({ data: null }),
      ]);

      const warnings: string[] = [];
      if (existingCust) {
        warnings.push(`⚠️ לקוח עם טלפון זה כבר קיים: "${existingCust.name}" (מספר לקוח: ${existingCust.customer_number || existingCust.id})`);
      }
      if (existingVeh) {
        warnings.push(`⚠️ רכב עם לוחית ${existingVeh.plate} כבר קיים במערכת (${existingVeh.make || ""} ${existingVeh.model || ""})`);
      }

      const pendingAction: GaragePendingAction = {
        preview_id: `prev_cust_veh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        summary: `פתיחת לקוח ורכב חדשים: ${custName} (טלפון: ${phone || "לא צוין"}), רכב ${plate} (${args.vehicle_make || ""} ${args.vehicle_model || ""})${warnings.length ? " [נמצאו אזהרות כפילות]" : ""}`,
        tool_name: "preview_garage_create_customer_and_vehicle",
        action_type: "garage_create_customer_and_vehicle",
        parameters: { ...args, plate, customer_name: custName, warnings },
      };

      return {
        result: {
          success: true,
          warnings,
          summary: pendingAction.summary,
          prompt_quote_followup: true,
        },
        preview: pendingAction,
      };
    }

    case "preview_garage_intake_inspection": {
      const caseRef = String(args.case_number || targetCaseId || "").trim();
      const intakeKm = String(args.intake_km || "").trim();

      const missing: string[] = [];
      if (!intakeKm) missing.push("קילומטראז' (מד אוץ)");
      if (!args.front_photo) missing.push("תמונת חזית הרכב");
      if (!args.rear_photo) missing.push("תמונת אחורי הרכב");
      if (!args.right_photo) missing.push("תמונת צד ימין");
      if (!args.left_photo) missing.push("תמונת צד שמאל");
      if (!args.dashboard_km_photo) missing.push("תמונת לוח שעונים/מד אוץ");

      const pendingAction: GaragePendingAction = {
        preview_id: `prev_intake_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        summary: `קבלת רכב לעבודה עבור תיק ${caseRef}: מד אוץ ${intakeKm} ק"מ, 5 תמונות חובה, בדיקת מערכות ואישור קבלה${missing.length ? ` (חסרים: ${missing.join(', ')})` : ""}`,
        tool_name: "preview_garage_intake_inspection",
        action_type: "garage_intake_inspection",
        parameters: { ...args, caseRef, missing },
      };

      return {
        result: {
          success: missing.length === 0,
          missing,
          summary: pendingAction.summary,
        },
        preview: pendingAction,
      };
    }

    case "preview_garage_create_supplier": {
      const name = String(args.name || "").trim();
      if (!name) throw new Error("שם ספק הוא שדה חובה");
      let dupQuery = supabase.from("garage_suppliers").select("id, supplier_number, name").ilike("name", name);
      if (shopScope?.company_name) {
        dupQuery = dupQuery.ilike("shop_company_name", `%${shopScope.company_name}%`);
      }
      const { data: existing } = await dupQuery.maybeSingle();
      if (existing) {
        return {
          result: {
            success: true,
            already_exists: true,
            supplier_number: existing.supplier_number,
            message: `הספק "${name}" כבר קיים במערכת עם מספר ספק ${existing.supplier_number}.`,
          },
        };
      }
      const suppNum = `SUP-${Math.floor(1000 + Math.random() * 9000)}`;
      const pendingAction: GaragePendingAction = {
        preview_id: `prev_supp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        summary: `פתיחת ספק חדש: "${name}" (קטגוריה: ${args.category || "חלפים"}, יוקצה מספר ${suppNum})`,
        tool_name: "preview_garage_create_supplier",
        action_type: "garage_create_supplier",
        parameters: { ...args, name, supplier_number: suppNum },
      };
      return {
        result: {
          success: true,
          supplier_number: suppNum,
          summary: pendingAction.summary,
        },
        preview: pendingAction,
      };
    }

    case "preview_garage_record_invoice": {
      const invNum = String(args.invoice_number || "").trim();
      const supplier = String(args.supplier_name || "").trim();
      const invType = String(args.invoice_type || "parts_invoice");
      const total = Number(args.total_amount || 0);

      const typeLabel = invType === "parts_invoice" ? "חשבונית חלקים לרכב" : invType === "credit_note" ? "חשבונית זיכוי" : "הוצאה כללית למוסך";
      const pendingAction: GaragePendingAction = {
        preview_id: `prev_inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        summary: `קליטת ${typeLabel} מס' ${invNum} מאת ספק "${supplier}" ע"ס ${total.toLocaleString()} ₪${args.case_number ? ` (עבור תיק ${args.case_number})` : ""}`,
        tool_name: "preview_garage_record_invoice",
        action_type: "garage_record_invoice",
        parameters: { ...args, invoice_type: invType, total_amount: total },
      };

      return {
        result: {
          success: true,
          summary: pendingAction.summary,
          invoice_type: invType,
          supplier_name: supplier,
          total_amount: total,
        },
        preview: pendingAction,
      };
    }

    case "preview_garage_record_payment": {
      const caseRef = String(args.case_number || args.case_ref || targetCaseId || "").trim();
      const plate = String(args.vehicle_plate || "").trim();
      const amount = Number(args.amount || 0);

      let foundCase: any = null;
      if (caseRef) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseRef);
        const query = isUuid
          ? supabase.from("garage_cases").select("*").eq("id", caseRef)
          : supabase.from("garage_cases").select("*").eq("case_number", caseRef);
        const { data: direct } = await query.maybeSingle();
        foundCase = direct;
      }
      if (!foundCase && (plate || caseRef)) {
        foundCase = await resolveGarageCase(supabase, caseRef || plate);
      }

      if (!foundCase) {
        return {
          result: {
            error: `לא נמצא תיק עבודה תואם עבור "${caseRef || plate}" לרישום תשלום.`,
          },
        };
      }

      const methodMap: Record<string, string> = {
        transfer: "העברה בנקאית",
        cash: "מזומן",
        credit_card: "כרטיס אשראי",
        bit: "ביט",
        check: "צ'ק",
        other: "אחר",
      };
      const method = String(args.payment_method || "transfer");
      const methodLabel = methodMap[method] || method;
      const ref = String(args.reference || "");
      const payer = String(args.payer_name || foundCase.customer_name_snapshot || "לקוח");
      const payDate = String(args.payment_date || new Date().toISOString().split("T")[0]);

      const cd = foundCase.case_data || {};
      const existingPayments = Array.isArray(cd.payments) ? cd.payments : [];
      const currentTotalPaid = Number(cd.totalPaid || existingPayments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0));
      const newTotalPaid = currentTotalPaid + amount;
      const caseTotal = Number(cd.quotePricedSubtotal || cd.finishAmount || cd.totalAmount || 0);
      const newBalanceRemaining = Math.max(0, caseTotal - newTotalPaid);
      const newPaymentStatus = newBalanceRemaining <= 0 && caseTotal > 0 ? "paid" : (newTotalPaid > 0 ? "partial" : "pending");

      const pendingAction: GaragePendingAction = {
        preview_id: `prev_pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        summary: `רישום תשלום לקוח ע"ס ${amount.toLocaleString()} ₪ ב${methodLabel} עבור תיק ${foundCase.case_number}${ref ? ` (אסמכתא: ${ref})` : ""}`,
        tool_name: "preview_garage_record_payment",
        action_type: "garage_record_payment",
        parameters: {
          ...args,
          case_id: foundCase.id,
          case_number: foundCase.case_number,
          amount,
          payment_method: method,
          payment_method_label: methodLabel,
          reference: ref,
          payer_name: payer,
          payment_date: payDate,
          current_total_paid: currentTotalPaid,
          new_total_paid: newTotalPaid,
          case_total: caseTotal,
          new_balance: newBalanceRemaining,
          new_payment_status: newPaymentStatus,
        },
      };

      return {
        result: {
          success: true,
          case_number: foundCase.case_number,
          customer_name: foundCase.customer_name_snapshot,
          amount,
          payment_method_label: methodLabel,
          reference: ref,
          previous_paid: currentTotalPaid,
          new_total_paid: newTotalPaid,
          case_total: caseTotal,
          balance_remaining: newBalanceRemaining,
          new_payment_status: newPaymentStatus,
          summary: pendingAction.summary,
        },
        preview: pendingAction,
      };
    }

    case "preview_garage_close_case": {
      const caseRef = String(args.case_number || targetCaseId || "").trim();

      // Look up case
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseRef);
      const query = isUuid
        ? supabase.from("garage_cases").select("*").eq("id", caseRef)
        : supabase.from("garage_cases").select("*").eq("case_number", caseRef);
      let { data: foundCase } = await query.maybeSingle();
      if (!foundCase && caseRef) {
        foundCase = await resolveGarageCase(supabase, caseRef);
      }

      const gaps: string[] = [];
      let totalWorks = 0;
      let unpricedWorksCount = 0;
      let totalPaid = 0;
      let caseTotal = 0;
      let balanceRemaining = 0;

      if (!foundCase) {
        gaps.push(`תיק עבודה ${caseRef} לא נמצא במסד הנתונים`);
      } else {
        const cd = foundCase.case_data || {};
        const quoteWorks = cd.quoteWorks || [];
        const quoteParts = cd.quoteParts || [];

        // 1. Unpriced works check
        const unpriced = quoteWorks.filter((w: any) => w.price === null || w.price === undefined || w.price === "" || Number(w.price) === 0);
        unpricedWorksCount = unpriced.length;
        if (unpricedWorksCount > 0) {
          gaps.push(`קיימות ${unpricedWorksCount} שורות עבודה ללא מחיר מאושר`);
        }

        // 2. Work completion check
        const isFinished = cd.workFinished || foundCase.status === "work_finished" || foundCase.status === "עבודה הסתיימה" || foundCase.status === "מוכן למסירה";
        if (!isFinished) {
          gaps.push("העבודה טרם סומנה כהסתיימה");
        }

        // 3. Quote / approval check
        if (!cd.quoteApproved && !cd.priceReview && !cd.quoteCreated) {
          gaps.push("אין הצעת מחיר מאושרת שמורה בתיק");
        }

        // 4. Intake check
        if (!cd.intakeDone && !cd.intakeKm) {
          gaps.push("טרם הושלמה קבלת רכב עם תמונות וקילומטראז'");
        }

        // 5. Financial / balance check
        const worksSum = quoteWorks.reduce((s: number, w: any) => s + (Number(w.price) || 0) * (Number(w.qty) || 1), 0);
        const partsSum = quoteParts.reduce((s: number, p: any) => s + (Number(p.price) || 0) * (Number(p.qty) || 1), 0);
        caseTotal = Number(cd.quotePricedSubtotal || cd.finishAmount || cd.totalAmount || (worksSum + partsSum));

        const payments = Array.isArray(cd.payments) ? cd.payments : [];
        totalPaid = Number(cd.totalPaid || payments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0));
        balanceRemaining = Math.max(0, caseTotal - totalPaid);
        const paymentStatus = cd.paymentStatus || "";

        if (caseTotal > 0 && balanceRemaining > 0 && paymentStatus !== "settled" && paymentStatus !== "invoiced" && paymentStatus !== "paid") {
          gaps.push(`קיימת יתרת חוב לתשלום ע"ס ₪${balanceRemaining.toLocaleString()} (סה"כ שולם: ₪${totalPaid.toLocaleString()} מתוך ₪${caseTotal.toLocaleString()})`);
        }

        // 6. Fleet / Eldan check
        const custName = String(foundCase.customer_name_snapshot || "");
        if (custName.includes("אלדן") && !cd.pricedOrderReceived && !cd.workOrderNumber) {
          gaps.push("חסרה הזמנת עבודה מתומחרת מצי רכב אלדן");
        }
      }

      const isReady = gaps.length === 0;
      const pendingAction: GaragePendingAction = {
        preview_id: `prev_close_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        summary: `סגירת תיק עבודה ${foundCase?.case_number || caseRef}${isReady ? " [כל התנאים מולאו בהצלחה ✅]" : ` [נמצאו ${gaps.length} חוסרים הדורשים התייחסות ⚠️]`}`,
        tool_name: "preview_garage_close_case",
        action_type: "garage_close_case",
        parameters: {
          ...args,
          caseRef: foundCase?.case_number || caseRef,
          case_id: foundCase?.id,
          gaps,
          ready_for_closure: isReady,
          case_total: caseTotal,
          total_paid: totalPaid,
          balance_remaining: balanceRemaining,
          unpriced_count: unpricedWorksCount,
        },
      };

      return {
        result: {
          ready_for_closure: isReady,
          gaps,
          case_number: foundCase?.case_number || caseRef,
          customer_name: foundCase?.customer_name_snapshot,
          case_total: caseTotal,
          total_paid: totalPaid,
          balance_remaining: balanceRemaining,
          summary: pendingAction.summary,
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

      const totalWorks = works.reduce((sum: number, w: any) => sum + (w.price !== null && w.price !== undefined && Number(w.price) > 0 ? Number(w.price) * (Number(w.qty) || 1) : 0), 0);
      const totalParts = parts.reduce((sum: number, p: any) => sum + (p.price !== null && p.price !== undefined && Number(p.price) > 0 ? Number(p.price) * (Number(p.qty) || 1) : 0), 0);
      const totalExtras = extras.reduce((sum: number, e: any) => sum + (Number(e.price) || 0), 0);
      const grandTotal = totalWorks + totalParts + totalExtras;
      const unpricedCount = works.filter((w: any) => w.price === null || w.price === undefined || w.price === "").length;

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
### 🛠️ עבודות לביצוע (${works.length} שורות · סה"כ מתומחר: ₪${totalWorks.toLocaleString()}${unpricedCount > 0 ? ` + ${unpricedCount} שורות ללא מחיר בשלב זה` : ""})
${works.length > 0 ? works.map((w: any, i: number) => `${i + 1}. **${w.part || w.type || "עבודה"}** — ${w.price !== null && w.price !== undefined && Number(w.price) > 0 ? `${Number(w.price).toLocaleString()} ₪` : "ללא מחיר בשלב זה"}${w.desc ? `\n   ${w.desc}` : ""}`).join("\n") : "אין עבודות רשומות"}

---
### 📦 חלקי חילוף (${parts.length} חלפים · סה"כ: ₪${totalParts.toLocaleString()})
${parts.length > 0 ? parts.map((p: any, i: number) => `${i + 1}. ${p.name || "חלק"}${p.sku ? ` [מק"ט ${p.sku}]` : ""} | מחיר: ₪${(Number(p.price) || 0).toLocaleString()} (כמות: ${p.qty || 1})${p.supplier ? ` ספק: ${p.supplier}` : ""}`).join("\n") : "אין חלפים רשומים"}

${extras.length > 0 ? `---
### ⚠️ אישורים חריגים (${extras.length} פריטים · סה"כ: ₪${totalExtras.toLocaleString()})
${extras.map((e: any, i: number) => `${i + 1}. ${e.text} | תוספת: ₪${(Number(e.price) || 0).toLocaleString()} [סטטוס: ${e.status || "ממתין"}]`).join("\n")}` : ""}

---
### 💰 סיכום כספי
- **סה"כ עבודות מתומחרות:** ${totalWorks.toLocaleString()} ₪${unpricedCount > 0 ? ` (מתוך ${works.length} שורות; ${unpricedCount} שורות ללא מחיר בשלב זה — סכום זה אינו המחיר הסופי לכל העבודות)` : ""}
- **חלקים:** ${totalParts.toLocaleString()} ₪
${totalExtras > 0 ? `- **חריגים:** ${totalExtras.toLocaleString()} ₪\n` : ""}- **סה"כ לשורות המתומחרות:** ${grandTotal.toLocaleString()} ₪
- **מע"מ:** מע"מ, ככל שחל, יחושב לפי שיעור המס התקף בישראל, **18%**, ובהתאם להגדרת המחירים ככוללים או לא כוללים מע"מ. אין להניח זאת ללא הגדרה.

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
      const totalWorks = works.reduce((sum: number, w: any) => sum + (w.price !== null && w.price !== undefined && Number(w.price) > 0 ? Number(w.price) * (Number(w.qty) || 1) : 0), 0);
      const totalParts = parts.reduce((sum: number, p: any) => sum + (p.price !== null && p.price !== undefined && Number(p.price) > 0 ? Number(p.price) * (Number(p.qty) || 1) : 0), 0);
      const subtotal = totalWorks + totalParts;
      const vat = Math.round(subtotal * 0.18);
      const grandTotal = subtotal + vat;

      const recipientName = String(args?.recipient_name || gCase.customer_name_snapshot || "לקוח").trim();
      const recipientPhone = String(args?.recipient_phone || "").replace(/[^0-9]/g, "");
      const recipientEmail = String(args?.recipient_email || "").trim();
      const channel = String(args?.channel || "whatsapp").trim();
      const quoteNotes = String(args?.quote_notes || "").trim();

      const summary = `שליחת הצעת מחיר וקישור לחתימה דיגיטלית לתיק ${gCase.case_number} ל-${recipientName} (${channel === "whatsapp" ? "WhatsApp" : (channel === "sms" ? "SMS" : "אימייל/קישור")}). סה"כ לשורות המתומחרות: ₪${subtotal.toLocaleString()} (עבודות: ₪${totalWorks.toLocaleString()}, חלקים: ₪${totalParts.toLocaleString()}).`;

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
          message: `הכנתי הצעת מחיר וקישור לחתימה דיגיטלית לשליחה ל-${recipientName} (סה"כ לשורות המתומחרות: ₪${subtotal.toLocaleString()}). לחץ על 'אישור' להפקת הקישור ושליחה.`,
        },
        preview: pendingAction,
      };
    }

    case "preview_garage_dictate_case_and_quote": {
      let customerName = String(args?.customer_name || "").trim();
      const customerTypeLabel = String(args?.customer_type_label || "לקוח פרטי, חד־פעמי").trim();
      let customerPhone = String(args?.customer_phone || "").trim();
      let customerEmail = String(args?.customer_email || "").trim();
      let vehiclePlate = String(args?.vehicle_plate || "").replace(/[^0-9A-Za-z]/g, "").trim();
      let vehicleModel = String(args?.vehicle_model || "").trim();
      const quoteTitle = String(args?.quote_title || "הצעת מחיר – עבודות פחחות וצבע").trim();
      const quoteDate = String(args?.quote_date || new Date().toLocaleDateString("he-IL")).trim();
      const workType = String(args?.work_type || "תיקוני פחחות וצבע בחזית הרכב").trim();
      const vatMode = String(args?.vat_mode || "unspecified").trim();
      const quoteNotes = String(args?.quote_notes || "").trim();

      // Resolve customer if name provided or vehicle provided
      let matchedCustomer: any = null;
      let matchedVehicle: any = null;

      if (customerName) {
        const cleanName = customerName.replace(/[%_,]/g, "").trim();
        const { data: foundCusts } = await supabase
          .from("garage_customers")
          .select("id, name, phone, email, customer_type, notes")
          .or(`name.ilike.%${cleanName}%,company_name.ilike.%${cleanName}%`)
          .limit(5);

        if (foundCusts && foundCusts.length === 1) {
          matchedCustomer = foundCusts[0];
          customerName = matchedCustomer.name;
          if (!customerPhone && matchedCustomer.phone) customerPhone = matchedCustomer.phone;
          if (!customerEmail && matchedCustomer.email) customerEmail = matchedCustomer.email;
        } else if (foundCusts && foundCusts.length > 1) {
          const list = foundCusts.map((c: any) => `• ${c.name} (טל' ${c.phone || "ללא"})`).join("\n");
          return {
            result: {
              status: "clarification_needed",
              message: `נמצאו מספר לקוחות תואמים לשם "${customerName}":\n${list}\nאנא ציין לאיזה לקוח לפתוח את כרטיס העבודה וההצעה.`,
            }
          };
        }
      }

      // If vehicle plate provided, look up vehicle
      if (vehiclePlate) {
        const { data: foundVehs } = await supabase
          .from("garage_vehicles")
          .select("id, plate, customer_id, make, model, year")
          .eq("plate", vehiclePlate)
          .limit(1);
        if (foundVehs && foundVehs.length > 0) {
          matchedVehicle = foundVehs[0];
          if (!vehicleModel) {
            vehicleModel = [matchedVehicle.make, matchedVehicle.model].filter(Boolean).join(" ");
          }
          if (!matchedCustomer && matchedVehicle.customer_id) {
            const { data: cRow } = await supabase.from("garage_customers").select("id, name, phone, email").eq("id", matchedVehicle.customer_id).maybeSingle();
            if (cRow) {
              matchedCustomer = cRow;
              customerName = cRow.name;
              if (!customerPhone && cRow.phone) customerPhone = cRow.phone;
              if (!customerEmail && cRow.email) customerEmail = cRow.email;
            }
          }
        }
      }

      // If customer exists but vehiclePlate was omitted by user, find customer's vehicles
      if (!vehiclePlate && matchedCustomer) {
        const { data: cVehs } = await supabase
          .from("garage_vehicles")
          .select("id, plate, make, model, year")
          .eq("customer_id", matchedCustomer.id)
          .limit(5);

        if (cVehs && cVehs.length === 1) {
          matchedVehicle = cVehs[0];
          vehiclePlate = matchedVehicle.plate;
          if (!vehicleModel) {
            vehicleModel = [matchedVehicle.make, matchedVehicle.model].filter(Boolean).join(" ");
          }
        } else if (cVehs && cVehs.length > 1) {
          const vList = cVehs.map((v: any) => `• רכב ${v.plate} (${[v.make, v.model, v.year].filter(Boolean).join(" ")})`).join("\n");
          return {
            result: {
              status: "clarification_needed",
              message: `ללקוח ${customerName} יש ${cVehs.length} רכבים רשומים:\n${vList}\nלאיזה מספר רכב לפתוח את כרטיס העבודה והצעת המחיר?`,
            }
          };
        } else {
          // Check recent case for this customer
          const { data: rCases } = await supabase
            .from("garage_cases")
            .select("vehicle_plate_snapshot, vehicle_label_snapshot")
            .eq("customer_name_snapshot", customerName)
            .order("created_at", { ascending: false })
            .limit(1);
          if (rCases && rCases.length > 0 && rCases[0].vehicle_plate_snapshot) {
            vehiclePlate = rCases[0].vehicle_plate_snapshot;
            if (!vehicleModel) vehicleModel = rCases[0].vehicle_label_snapshot || "";
          }
        }
      }

      if (!customerName) {
        return { result: { error: "חובה לספק שם לקוח לפתיחת כרטיס העבודה והכנת הצעת המחיר." } };
      }
      if (!vehiclePlate) {
        return { result: { error: `איתרתי את הלקוח ${customerName}, אך לא צוין רכב עבורו. מה מספר הרישוי של הרכב?` } };
      }

      const rawWorks = Array.isArray(args?.quote_works) ? args.quote_works : [];
      const normalizedWorks = rawWorks.map((w: any, idx: number) => {
        const descStr = String(w?.desc || "").trim();
        const isExplicitlyUnpriced =
          w?.unpriced === true ||
          w?.price === null ||
          w?.price === undefined ||
          w?.price === "" ||
          /ללא מחיר/i.test(descStr);
        const numericPrice = !isExplicitlyUnpriced && Number.isFinite(Number(w?.price)) && Number(w?.price) > 0
          ? Number(w.price)
          : null;
        return {
          row_number: idx + 1,
          part: String(w?.part || "").trim(),
          type: String(w?.type || "פחחות וצבע").trim(),
          price: numericPrice,
          qty: Number(w?.qty) > 0 ? Number(w.qty) : 1,
          desc: descStr,
        };
      });

      const rawParts = Array.isArray(args?.quote_parts) ? args.quote_parts : [];
      const normalizedParts = rawParts.map((p: any, idx: number) => ({
        row_number: idx + 1,
        name: String(p?.name || "").trim(),
        price: Number.isFinite(Number(p?.price)) && Number(p?.price) > 0 ? Number(p.price) : null,
        qty: Number(p?.qty) > 0 ? Number(p.qty) : 1,
      }));

      // Duplicate check in STAGING DB
      const { data: existingCustomers } = await supabase
        .from("garage_customers")
        .select("id, name, phone, email, customer_type, notes")
        .or(`name.eq.${customerName},company_name.eq.${customerName}`)
        .limit(1);
      const existingCustomer = existingCustomers?.[0] || null;

      const { data: existingVehicles } = await supabase
        .from("garage_vehicles")
        .select("id, plate, customer_id, make, model, year")
        .eq("plate", vehiclePlate)
        .limit(1);
      const existingVehicle = existingVehicles?.[0] || null;

      const { data: existingCases } = await supabase
        .from("garage_cases")
        .select("id, case_number, status, case_data")
        .eq("vehicle_plate_snapshot", vehiclePlate)
        .eq("customer_name_snapshot", customerName)
        .order("created_at", { ascending: false })
        .limit(1);
      const existingCase = existingCases?.[0] || null;

      const pricedWorks = normalizedWorks.filter((w: any) => w.price !== null && w.price > 0);
      const unpricedWorks = normalizedWorks.filter((w: any) => w.price === null);
      const pricedWorksTotal = pricedWorks.reduce((s: number, w: any) => s + Number(w.price) * (Number(w.qty) || 1), 0);
      const pricedPartsTotal = normalizedParts
        .filter((p: any) => p.price !== null && p.price > 0)
        .reduce((s: number, p: any) => s + Number(p.price) * (Number(p.qty) || 1), 0);
      const pricedSubtotal = pricedWorksTotal + pricedPartsTotal;

      const summary = [
        `פתיחת/עדכון כרטיס עבודה והכנת הצעת מחיר מובנית מוכנה לשליחה ולחתימת לקוח:`,
        `• לקוח: ${customerName} (${customerTypeLabel})${existingCustomer ? " [קיים במערכת]" : " [לקוח חדש]"}`,
        `• מספר רכב: ${vehiclePlate}${existingVehicle ? " [קיים במערכת]" : " [רכב חדש]"}`,
        `• תאריך הצעת המחיר: ${quoteDate} · סוג עבודה: ${workType}`,
        `• פירוט שורות: ${normalizedWorks.length} שורות עבודה נפרדות (${pricedWorks.length} מתומחרות בסך ${pricedSubtotal.toLocaleString()} ₪ + ${unpricedWorks.length} שורות ללא מחיר בשלב זה)`,
        `• מע"מ: יחושב לפי שיעור המס התקף בישראל, 18%, ובהתאם להגדרת המחירים ככוללים או לא כוללים מע"מ.`,
      ].join("\n");

      const pendingAction: GaragePendingAction = {
        preview_id: `g_dictate_quote_${Date.now()}`,
        summary,
        tool_name: "preview_garage_dictate_case_and_quote",
        action_type: "garage_dictate_case_and_quote",
        parameters: {
          customer_name: customerName,
          customer_type_label: customerTypeLabel,
          customer_phone: customerPhone,
          customer_email: customerEmail,
          vehicle_plate: vehiclePlate,
          vehicle_model: vehicleModel,
          quote_title: quoteTitle,
          quote_date: quoteDate,
          work_type: workType,
          vat_mode: vatMode,
          quote_works: normalizedWorks,
          quote_parts: normalizedParts,
          quote_notes: quoteNotes,
          existing_customer_id: existingCustomer?.id || null,
          existing_vehicle_id: existingVehicle?.id || null,
          existing_case_id: existingCase?.id || null,
          existing_case_number: existingCase?.case_number || null,
          priced_subtotal: pricedSubtotal,
          priced_lines_count: pricedWorks.length,
          unpriced_lines_count: unpricedWorks.length,
        },
      };

      return {
        result: {
          status: "pending_user_confirmation",
          duplicate_check: {
            customer_exists: Boolean(existingCustomer),
            existing_customer_id: existingCustomer?.id || null,
            vehicle_exists: Boolean(existingVehicle),
            existing_vehicle_id: existingVehicle?.id || null,
            case_exists: Boolean(existingCase),
            existing_case_number: existingCase?.case_number || null,
          },
          quote_preview: {
            title: quoteTitle,
            customer_name: customerName,
            customer_type_label: customerTypeLabel,
            vehicle_plate: vehiclePlate,
            quote_date: quoteDate,
            work_type: workType,
            works: normalizedWorks,
            priced_subtotal_ils: pricedSubtotal,
            priced_lines_count: pricedWorks.length,
            unpriced_lines_count: unpricedWorks.length,
            vat_rate_percent: 18,
            vat_notice: "מע\"מ, ככל שחל, יחושב לפי שיעור המס התקף בישראל, 18%, ובהתאם להגדרת המחירים ככוללים או לא כוללים מע\"מ. אין להניח זאת ללא הגדרה.",
          },
          preview_card: pendingAction,
          message: `בדקתי כפילויות במערכת והכנתי כרטיס אישור לפתיחת הלקוח "${customerName}", רכב ${vehiclePlate}, כרטיס העבודה והצעת המחיר המלאה (${normalizedWorks.length} שורות נפרדות, סה"כ לשורות המתומחרות: ${pricedSubtotal.toLocaleString()} ₪). לחץ על 'אישור' לשמירה והפקת הצעת המחיר לחתימה.`,
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
      case "garage_create_customer_and_vehicle": {
        const custName = String(parameters.customer_name || "").trim();
        const phone = String(parameters.customer_phone || "").trim();
        const plate = String(parameters.vehicle_plate || parameters.plate || "").replace(/[^0-9]/g, "").trim();

        // 1. Create or locate customer
        let customerId = "";
        let customerNumber = "";
        if (phone) {
          const { data: existingC } = await supabase.from("garage_customers").select("id, customer_number").eq("phone", phone).maybeSingle();
          if (existingC) {
            customerId = existingC.id;
            customerNumber = existingC.customer_number || existingC.id;
          }
        }

        if (!customerId) {
          const { data: newCust, error: cErr } = await supabase.from("garage_customers").insert({
            name: custName,
            phone: phone || "לא צוין",
            customer_type: String(parameters.customer_type || "private"),
            company_name: String(parameters.company_name || ""),
            email: String(parameters.email || ""),
            address: String(parameters.address || ""),
            business_id: String(parameters.business_id || ""),
            notes: String(parameters.notes || ""),
          }).select("id, customer_number").single();
          if (cErr) throw new Error(`יצירת לקוח נכשלה: ${cErr.message}`);
          customerId = newCust.id;
          customerNumber = newCust.customer_number || newCust.id;
        }

        // 2. Create or sync vehicle linked to customer (satisfy composite FK)
        let vehicleId = "";
        const { data: existingV } = await supabase.from("garage_vehicles").select("id").eq("plate", plate).maybeSingle();
        if (existingV) {
          vehicleId = existingV.id;
          await supabase.from("garage_vehicles").update({
            customer_id: customerId,
            ...(parameters.vehicle_make ? { make: String(parameters.vehicle_make) } : {}),
            ...(parameters.vehicle_model ? { model: String(parameters.vehicle_model) } : {}),
            ...(parameters.vehicle_year ? { year: Number(parameters.vehicle_year) } : {}),
            ...(parameters.vehicle_color ? { color: String(parameters.vehicle_color) } : {}),
            ...(parameters.vehicle_vin ? { vin: String(parameters.vehicle_vin) } : {}),
            updated_at: new Date().toISOString(),
          }).eq("id", vehicleId);
        } else {
          const { data: newVeh, error: vErr } = await supabase.from("garage_vehicles").insert({
            customer_id: customerId,
            plate,
            make: String(parameters.vehicle_make || ""),
            model: String(parameters.vehicle_model || ""),
            year: parameters.vehicle_year ? Number(parameters.vehicle_year) : null,
            color: String(parameters.vehicle_color || ""),
            vin: String(parameters.vehicle_vin || ""),
            vehicle_type: String(parameters.vehicle_type || ""),
          }).select("id").single();
          if (vErr) throw new Error(`שמירת רכב נכשלה: ${vErr.message}`);
          vehicleId = newVeh.id;
        }

        return {
          success: true,
          message: `✅ לקוח "${custName}" (לקוח #${customerNumber}) ורכב מס' ${plate} נשמרו בהצלחה במערכת!\n\nהאם תרצה להכין ללקוח הצעת מחיר בשלב זה?`,
          data: { customer_id: customerId, vehicle_id: vehicleId, customer_number: customerNumber, plate },
        };
      }

      case "garage_intake_inspection": {
        const caseRef = String(parameters.caseRef || parameters.case_number || "");
        const intakeKm = String(parameters.intake_km || "");

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseRef);
        const query = isUuid
          ? supabase.from("garage_cases").select("*").eq("id", caseRef)
          : supabase.from("garage_cases").select("*").eq("case_number", caseRef);
        const { data: cData, error: cErr } = await query.single();
        if (cErr || !cData) throw new Error(`תיק עבודה ${caseRef} לא נמצא: ${cErr?.message || ""}`);

        const cd = cData.case_data || {};
        cd.intakeDone = true;
        cd.intakeKm = intakeKm;
        cd.intakeAngles = {
          front: parameters.front_photo || "captured",
          rear: parameters.rear_photo || "captured",
          right: parameters.right_photo || "captured",
          left: parameters.left_photo || "captured",
          dash: parameters.dashboard_km_photo || "captured",
        };
        cd.intakeFuel = parameters.intake_fuel || "חצי";
        cd.intakeKeys = parameters.intake_keys || "1";
        cd.intakeLights = parameters.intake_lights || "תקין";
        cd.intakeInterior = parameters.intake_interior || "";
        cd.intakeItems = parameters.intake_items || "";
        cd.intakeWorker = actorName || "מנהל מוסך";
        cd.flowStage = "inspection_completed";

        const { error: updErr } = await supabase.from("garage_cases").update({
          case_data: cd,
          status: "in_progress",
        }).eq("id", cData.id);
        if (updErr) throw new Error(`עדכון קבלת רכב נכשל: ${updErr.message}`);

        return {
          success: true,
          message: `✅ קבלת רכב עבור תיק ${cData.case_number} הושלמה בהצלחה! 5 תמונות נקלטו, קילומטראז' (${intakeKm} ק"מ) עודכן והתיק הועבר לטיפול.`,
        };
      }

      case "garage_create_supplier": {
        const name = String(parameters.name || "").trim();
        const suppNum = String(parameters.supplier_number || `SUP-${Math.floor(1000 + Math.random() * 9000)}`);
        const { data: created, error: sErr } = await supabase.from("garage_suppliers").insert({
          supplier_number: suppNum,
          name,
          phone: parameters.phone ? String(parameters.phone).trim() : null,
          email: parameters.email ? String(parameters.email).trim() : null,
          business_id: parameters.business_id ? String(parameters.business_id).trim() : null,
          contact_person: parameters.contact_person ? String(parameters.contact_person).trim() : null,
          category: String(parameters.category || "parts"),
          notes: parameters.notes ? String(parameters.notes).trim() : null,
          shop_company_name: actorShopName || "מוסך יוני – פחחות וצבע לרכב",
        }).select("*").single();
        if (sErr) throw new Error(`פתיחת ספק נכשלה: ${sErr.message}`);
        return {
          success: true,
          message: `🏭 הספק "${name}" נפתח בהצלחה בספר הספקים! הוקצה מספר ספק: ${suppNum}.`,
        };
      }

      case "garage_record_invoice": {
        const invType = String(parameters.invoice_type || "parts_invoice");
        const invNum = String(parameters.invoice_number || "");
        const supplierName = String(parameters.supplier_name || "").trim();
        const total = Number(parameters.total_amount || 0);
        const subtotal = Number(parameters.subtotal || Math.round(total / 1.18));
        const vat = Number(parameters.vat_amount || Math.round(total - subtotal));

        // 1. Resolve or create supplier
        let supplierId = "";
        let supplierNumber = "";
        const { data: existingSupp } = await supabase.from("garage_suppliers").select("id, supplier_number").eq("name", supplierName).maybeSingle();
        if (existingSupp) {
          supplierId = existingSupp.id;
          supplierNumber = existingSupp.supplier_number || "";
        } else {
          supplierNumber = `SUP-${Math.floor(1000 + Math.random() * 9000)}`;
          const { data: newSupp, error: sErr } = await supabase.from("garage_suppliers").insert({
            name: supplierName,
            supplier_number: supplierNumber,
            category: String(parameters.expense_category || "general"),
          }).select("id, supplier_number").single();
          if (!sErr && newSupp) {
            supplierId = newSupp.id;
            supplierNumber = newSupp.supplier_number;
          }
        }

        // 2. Insert into garage_invoices
        const { data: invRow, error: invErr } = await supabase.from("garage_invoices").insert({
          invoice_type: invType,
          invoice_number: invNum,
          supplier_id: supplierId || null,
          supplier_name: supplierName,
          case_number: parameters.case_number ? String(parameters.case_number) : null,
          vehicle_plate: parameters.vehicle_plate ? String(parameters.vehicle_plate) : null,
          expense_category: String(parameters.expense_category || "parts"),
          subtotal,
          vat_amount: vat,
          total_amount: total,
          parts_received_confirmed: Boolean(parameters.parts_received_confirmed),
          returned_parts_exist: Boolean(parameters.returned_parts_exist),
          returned_parts_notes: String(parameters.returned_parts_notes || ""),
          credit_status: String(parameters.credit_status || "none"),
          accounting_notes: String(parameters.accounting_notes || ""),
          payment_status: "pending_accounting",
        }).select("id").single();

        if (invErr) throw new Error(`שמירת חשבונית נכשלה: ${invErr.message}`);

        // 3. If linked to case, update case_data
        if (parameters.case_number) {
          const { data: c } = await supabase.from("garage_cases").select("id, case_data").eq("case_number", parameters.case_number).maybeSingle();
          if (c) {
            const cd = c.case_data || {};
            cd.invoices = cd.invoices || [];
            cd.invoices.push({
              invoice_id: invRow.id,
              invoice_number: invNum,
              supplier: supplierName,
              total,
              type: invType,
              credit_status: parameters.credit_status,
              recorded_at: new Date().toISOString(),
            });
            await supabase.from("garage_cases").update({ case_data: cd }).eq("id", c.id);
          }
        }

        return {
          success: true,
          message: `✅ חשבונית מס' ${invNum} (${supplierName}) ע"ס ${total.toLocaleString()} ₪ נקלטה בהצלחה ושויכה לספר הספקים (ספק ${supplierNumber || supplierName}) ולהנהלת החשבונות.`,
        };
      }

      case "garage_record_payment": {
        const caseRef = String(parameters.case_id || parameters.case_number || parameters.caseRef || "");
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseRef);
        const query = isUuid
          ? supabase.from("garage_cases").select("*").eq("id", caseRef)
          : supabase.from("garage_cases").select("*").eq("case_number", caseRef);
        const { data: cData, error: cErr } = await query.single();
        if (cErr || !cData) throw new Error(`תיק עבודה ${caseRef} לא נמצא: ${cErr?.message || ""}`);

        const amount = Number(parameters.amount || 0);
        if (amount <= 0) throw new Error("סכום התשלום חייב להיות גדול מ-0.");

        const methodMap: Record<string, string> = {
          transfer: "העברה בנקאית",
          cash: "מזומן",
          credit_card: "כרטיס אשראי",
          bit: "ביט",
          check: "צ'ק",
          other: "אחר",
        };
        const method = String(parameters.payment_method || "transfer");
        const methodLabel = parameters.payment_method_label || methodMap[method] || method;
        const ref = String(parameters.reference || "");
        const payerName = String(parameters.payer_name || cData.customer_name_snapshot || "לקוח");
        const paymentDate = String(parameters.payment_date || new Date().toISOString().split("T")[0]);

        const cd = cData.case_data || {};
        const payments = Array.isArray(cd.payments) ? [...cd.payments] : [];

        const paymentEntry = {
          id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          amount,
          payment_method: method,
          payment_method_label: methodLabel,
          reference: ref,
          payer_name: payerName,
          payment_date: paymentDate,
          created_at: new Date().toISOString(),
          created_by: actorName || "דליה AI",
          notes: String(parameters.notes || ""),
        };
        payments.push(paymentEntry);

        const totalPaid = payments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
        const caseTotal = Number(cd.quotePricedSubtotal || cd.finishAmount || cd.totalAmount || 0);
        const balanceRemaining = Math.max(0, caseTotal - totalPaid);
        const paymentStatus = balanceRemaining <= 0 && caseTotal > 0 ? "paid" : (totalPaid > 0 ? "partial" : "pending");

        const timeline = Array.isArray(cd.timeline) ? [...cd.timeline] : [];
        timeline.push({
          at: new Date().toISOString(),
          text: `נרשם תשלום ע"ס ₪${amount.toLocaleString()} ב${methodLabel}${ref ? ` (אסמכתא: ${ref})` : ""} ע"י ${actorName || "דליה AI"}. סה"כ שולם: ₪${totalPaid.toLocaleString()}, יתרה: ₪${balanceRemaining.toLocaleString()}`,
        });

        cd.payments = payments;
        cd.totalPaid = totalPaid;
        cd.balanceRemaining = balanceRemaining;
        cd.paymentStatus = paymentStatus;
        cd.timeline = timeline;

        const { error: updErr } = await supabase.from("garage_cases").update({
          case_data: cd,
          updated_at: new Date().toISOString(),
        }).eq("id", cData.id);

        if (updErr) throw new Error(`שמירת תשלום נכשלה: ${updErr.message}`);

        return {
          success: true,
          message: `💳 תשלום ע"ס ${amount.toLocaleString()} ₪ ב${methodLabel}${ref ? ` (אסמכתא: ${ref})` : ""} נרשם בהצלחה בתיק [${cData.case_number}](#/garage-management/${cData.id})!\n- סה"כ שולם: ₪${totalPaid.toLocaleString()}\n- יתרה לתשלום: ₪${balanceRemaining.toLocaleString()}\n- סטטוס תשלום: ${paymentStatus === "paid" ? "✅ שולם במלואו" : "⏳ תשלום חלקי"}`,
        };
      }

      case "garage_close_case": {
        const caseRef = String(parameters.case_id || parameters.caseRef || parameters.case_number || "");
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseRef);
        const query = isUuid
          ? supabase.from("garage_cases").select("*").eq("id", caseRef)
          : supabase.from("garage_cases").select("*").eq("case_number", caseRef);
        const { data: cData, error: cErr } = await query.single();
        if (cErr || !cData) throw new Error(`תיק ${caseRef} לא נמצא: ${cErr?.message || ""}`);

        const cd = cData.case_data || {};
        cd.caseClosed = true;
        cd.caseClosedAt = new Date().toISOString();
        cd.caseClosedBy = actorName || "מנהל מוסך";
        cd.closeNote = String(parameters.closure_notes || "תיק נסגר לאחר סיום עבודות ואימות כלל המסמכים");
        cd.flowStage = "delivery";
        cd.deliveryDone = true;

        const timeline = Array.isArray(cd.timeline) ? [...cd.timeline] : [];
        timeline.push({
          at: new Date().toISOString(),
          text: `תיק עבודה נסגר בסטטוס סופי ע"י ${actorName || "דליה AI"}. הערות סגירה: ${cd.closeNote}`,
        });
        cd.timeline = timeline;

        const { error: updErr } = await supabase.from("garage_cases").update({
          status: "תיק סגור",
          case_data: cd,
          updated_at: new Date().toISOString(),
        }).eq("id", cData.id);
        if (updErr) throw new Error(`סגירת תיק נכשלה: ${updErr.message}`);

        return {
          success: true,
          message: `🔒 תיק עבודה מס' [${cData.case_number}](#/garage-management/${cData.id}) נסגר בהצלחה בסטטוס סופי על ידי ${actorName || "מנהל מוסך"}. כלל הנתונים נשמרו בארכיון התיקים הסגורים.`,
        };
      }

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

        // 2. Ensure vehicle exists and belongs to customerId (satisfy garage_cases_vehicle_customer_fkey)
        if (!vehicleId) {
          if (!vehiclePlate) {
            throw new Error("חובה לספק מספר לוחית רישוי של הרכב לפתיחת תיק.");
          }
          const { data: byPlate } = await supabase.from("garage_vehicles").select("id, customer_id").eq("plate", vehiclePlate).limit(1);
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

        // CRITICAL: Unconditionally ensure garage_vehicles.customer_id matches customerId
        if (vehicleId && customerId) {
          await supabase.from("garage_vehicles").update({ customer_id: customerId }).eq("id", vehicleId);
        }

        const effectiveUserId = (userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))
          ? userId
          : "8c7dd873-7b82-430f-986e-c85cb2b2eefb";

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
          opened_by: effectiveUserId,
          opened_by_name: actorName || "דליה AI",
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
        const rawQuoteWorks = Array.isArray(parameters.quote_works) ? parameters.quote_works : [];
        const quoteWorks = rawQuoteWorks.map((w: any) => {
          const descStr = String(w?.desc || "").trim();
          const isUnpriced = w?.unpriced === true || w?.price === null || w?.price === undefined || w?.price === "" || /ללא מחיר/i.test(descStr);
          return {
            ...w,
            price: !isUnpriced && Number.isFinite(Number(w?.price)) && Number(w?.price) > 0 ? Number(w.price) : null,
            qty: Number(w?.qty) > 0 ? Number(w.qty) : 1,
          };
        });
        const quoteParts = Array.isArray(parameters.quote_parts) ? parameters.quote_parts : [];
        const extraApprovals = Array.isArray(parameters.extra_approvals) ? parameters.extra_approvals : [];
        const mode = String(parameters.mode || "append");

        const { data: existing, error: loadErr } = await supabase
          .from("garage_cases")
          .select("id, case_number, customer_name_snapshot, vehicle_plate_snapshot, case_data, shop_company_name")
          .eq("id", caseId)
          .single();
        if (loadErr || !existing) throw new Error("תיק מוסך לא נמצא לעדכון");

        const cd = existing.case_data || {};
        const timeline = Array.isArray(cd.timeline) ? [...cd.timeline] : [];

        const nextDamage = mode === "replace" ? damageItems : [...(cd.damageItems || []), ...damageItems];
        const nextWorks = mode === "replace" ? quoteWorks : [...(cd.quoteWorks || []), ...quoteWorks];
        const nextParts = mode === "replace" ? quoteParts : [...(cd.quoteParts || []), ...quoteParts];
        const nextExtras = mode === "replace" ? extraApprovals : [...(cd.extraApprovals || []), ...extraApprovals];

        // Version immutability: if previous version was signed, increment quoteVersion and supersede old links
        const prevVersion = Number(cd.quoteVersion) || 1;
        const wasSigned = cd.quoteSigned === true;
        const nextVersion = wasSigned ? prevVersion + 1 : prevVersion;

        if (wasSigned) {
          await supabase
            .from("garage_quote_links")
            .update({ status: "superseded", updated_at: new Date().toISOString() })
            .eq("case_id", caseId)
            .eq("status", "signed");
          timeline.push({
            at: new Date().toISOString(),
            text: `נוצרה גרסה חדשה להצעת המחיר (גרסה ${nextVersion}) בעקבות עדכון לאחר חתימת לקוח על גרסה ${prevVersion}. הגרסה החתומה הקודמת נשמרה בארכיון.`,
          });
        } else {
          timeline.push({
            at: new Date().toISOString(),
            text: `עודכנו פרטי תיקון (פחחות/חלקים/עבודות) ע"י ${actorName || "דליה AI"}.`,
          });
        }

        const patchCaseData = {
          ...cd,
          damageItems: nextDamage,
          quoteWorks: nextWorks,
          quoteParts: nextParts,
          extraApprovals: nextExtras,
          quoteVersion: nextVersion,
          ...(wasSigned ? { quoteSigned: false, quoteApproved: false, quoteStatus: "ready_to_send" } : {}),
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
          message: `✅ פרטי התיקון, הפחחות והחלקים נשמרו בהצלחה בכרטיס עבודה [${existing.case_number}](#/garage-management/${existing.id})${wasSigned ? ` (נפתחה גרסת הצעה חדשה מס' ${nextVersion} לשליחה מחדש לחתימה)` : ""}.`,
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
          const vehPatch: Record<string, unknown> = { customer_id: customerId, updated_at: new Date().toISOString() };
          if (make) vehPatch.make = make;
          if (model) vehPatch.model = model;
          if (year && parseInt(year, 10)) vehPatch.year = parseInt(year, 10);
          if (color) vehPatch.color = color;
          if (vin) vehPatch.vin = vin;
          if (engineVolume) vehPatch.notes = `נפח מנוע: ${engineVolume}`;
          await supabase.from("garage_vehicles").update(vehPatch).eq("id", vehicleId);
        }

        // CRITICAL: Unconditionally ensure garage_vehicles.customer_id = customerId before case creation
        await supabase.from("garage_vehicles").update({ customer_id: customerId }).eq("id", vehicleId);

        const effectiveUserId = (userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))
          ? userId
          : "8c7dd873-7b82-430f-986e-c85cb2b2eefb";

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
            opened_by: effectiveUserId,
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

      case "garage_dictate_case_and_quote": {
        const customerName = String(parameters.customer_name || "").trim();
        const customerTypeLabel = String(parameters.customer_type_label || "לקוח פרטי, חד־פעמי").trim();
        const customerPhone = String(parameters.customer_phone || "").trim();
        const customerEmail = String(parameters.customer_email || "").trim();
        const vehiclePlate = String(parameters.vehicle_plate || "").replace(/[^0-9A-Za-z]/g, "").trim();
        const vehicleModel = String(parameters.vehicle_model || "").trim();
        const quoteTitle = String(parameters.quote_title || "הצעת מחיר – עבודות פחחות וצבע").trim();
        const quoteDate = String(parameters.quote_date || new Date().toLocaleDateString("he-IL")).trim();
        const workType = String(parameters.work_type || "תיקוני פחחות וצבע בחזית הרכב").trim();
        const vatMode = String(parameters.vat_mode || "unspecified").trim();
        const quoteNotes = String(parameters.quote_notes || "").trim();

        const rawWorks = Array.isArray(parameters.quote_works) ? parameters.quote_works : [];
        const quoteWorks = rawWorks.map((w: any, idx: number) => {
          const descStr = String(w?.desc || "").trim();
          const isUnpriced =
            w?.unpriced === true ||
            w?.price === null ||
            w?.price === undefined ||
            w?.price === "" ||
            /ללא מחיר/i.test(descStr);
          return {
            row_number: idx + 1,
            part: String(w?.part || "").trim(),
            type: String(w?.type || "פחחות וצבע").trim(),
            price: !isUnpriced && Number.isFinite(Number(w?.price)) && Number(w?.price) > 0 ? Number(w.price) : null,
            qty: Number(w?.qty) > 0 ? Number(w.qty) : 1,
            desc: descStr,
          };
        });

        const rawParts = Array.isArray(parameters.quote_parts) ? parameters.quote_parts : [];
        const quoteParts = rawParts.map((p: any, idx: number) => ({
          row_number: idx + 1,
          name: String(p?.name || "").trim(),
          price: Number.isFinite(Number(p?.price)) && Number(p?.price) > 0 ? Number(p.price) : null,
          qty: Number(p?.qty) > 0 ? Number(p.qty) : 1,
        }));

        // 1. Check / create customer (prevent duplicates, never invent phone or email!)
        let customerId = parameters.existing_customer_id as string | null;
        if (!customerId) {
          const { data: foundCust } = await supabase
            .from("garage_customers")
            .select("id")
            .or(`name.eq.${customerName},company_name.eq.${customerName}`)
            .limit(1);
          if (foundCust && foundCust.length > 0) {
            customerId = foundCust[0].id;
          }
        }
        if (!customerId) {
          const { data: newCust, error: custErr } = await supabase
            .from("garage_customers")
            .insert({
              name: customerName,
              company_name: "",
              phone: customerPhone || "",
              second_phone: "",
              email: customerEmail || "",
              address: "",
              business_id: "",
              contact_person: "",
              customer_type: "private",
              notes: customerTypeLabel,
            })
            .select("id")
            .single();
          if (custErr) throw new Error(`יצירת לקוח נכשלה: ${custErr.message}`);
          customerId = newCust.id;
        }

        // 2. Check / create vehicle (prevent duplicates & link to customer)
        let vehicleId = parameters.existing_vehicle_id as string | null;
        if (!vehicleId) {
          const { data: foundVeh } = await supabase
            .from("garage_vehicles")
            .select("id, customer_id")
            .eq("plate", vehiclePlate)
            .limit(1);
          if (foundVeh && foundVeh.length > 0) {
            vehicleId = foundVeh[0].id;
          }
        }
        if (vehicleId) {
          // Unconditionally sync vehicle to this customer to satisfy composite FK constraint
          await supabase.from("garage_vehicles").update({ customer_id: customerId }).eq("id", vehicleId);
        } else {
          const { data: newVeh, error: vehErr } = await supabase
            .from("garage_vehicles")
            .insert({
              plate: vehiclePlate,
              customer_id: customerId,
              make: vehicleModel.split(" ")[0] || "",
              model: vehicleModel.split(" ").slice(1).join(" ") || "",
              color: "",
              vin: "",
              notes: workType,
            })
            .select("id")
            .single();
          if (vehErr) throw new Error(`יצירת רכב נכשלה: ${vehErr.message}`);
          vehicleId = newVeh.id;
        }

        // CRITICAL: ensure garage_vehicles.customer_id is definitely customerId before inserting/updating case
        await supabase.from("garage_vehicles").update({ customer_id: customerId }).eq("id", vehicleId);

        const effectiveUserId = (userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))
          ? userId
          : "8c7dd873-7b82-430f-986e-c85cb2b2eefb";

        // 3. Check / create or update work card (garage_cases)
        let targetCase: any = null;
        const { data: existingCases } = await supabase
          .from("garage_cases")
          .select("id, case_number, status, case_data, shop_company_name")
          .eq("vehicle_plate_snapshot", vehiclePlate)
          .eq("customer_name_snapshot", customerName)
          .order("created_at", { ascending: false })
          .limit(1);
        if (existingCases && existingCases.length > 0) {
          targetCase = existingCases[0];
        }

        const damageItems = quoteWorks.map((w: any) => ({
          part: w.part,
          status: w.desc || w.type,
        }));

        const pricedWorks = quoteWorks.filter((w: any) => w.price !== null && w.price > 0);
        const unpricedWorks = quoteWorks.filter((w: any) => w.price === null);
        const pricedSubtotal =
          pricedWorks.reduce((s: number, w: any) => s + Number(w.price) * (Number(w.qty) || 1), 0) +
          quoteParts.filter((p: any) => p.price !== null && p.price > 0).reduce((s: number, p: any) => s + Number(p.price) * (Number(p.qty) || 1), 0);

        let caseId = "";
        let caseNumber = "";
        let quoteVersion = 1;
        let shopCompanyName = "";

        if (targetCase) {
          caseId = targetCase.id;
          caseNumber = targetCase.case_number;
          shopCompanyName = targetCase.shop_company_name || "";
          const prevCd = targetCase.case_data || {};
          const wasSigned = prevCd.quoteSigned === true;
          quoteVersion = wasSigned ? (Number(prevCd.quoteVersion) || 1) + 1 : (Number(prevCd.quoteVersion) || 1);
          if (wasSigned) {
            await supabase
              .from("garage_quote_links")
              .update({ status: "superseded", updated_at: new Date().toISOString() })
              .eq("case_id", caseId)
              .eq("status", "signed");
          }
          const timeline = Array.isArray(prevCd.timeline) ? [...prevCd.timeline] : [];
          timeline.push({
            at: new Date().toISOString(),
            text: `הוכנה הצעת מחיר מובנית (${quoteTitle}, גרסה ${quoteVersion}) ע"י ${actorName || "דליה AI"} · ${quoteWorks.length} שורות עבודה.`,
          });

          const nextCaseData = {
            ...prevCd,
            route: "quote_first",
            flowStage: "quote",
            customerTypeLabel,
            quoteTitle,
            quoteDate,
            workType,
            vatRate: 18,
            vatMode,
            damageItems,
            quoteWorks,
            quoteParts,
            quoteCreated: true,
            quoteVersion,
            quoteSigned: false,
            quoteApproved: false,
            quoteStatus: "ready_to_send",
            quotePricedSubtotal: pricedSubtotal,
            quotePricedLinesCount: pricedWorks.length,
            quoteUnpricedLinesCount: unpricedWorks.length,
            quoteNotes: quoteNotes || prevCd.quoteNotes || "",
            timeline,
          };

          const { error: updCaseErr } = await supabase
            .from("garage_cases")
            .update({
              customer_id: customerId,
              vehicle_id: vehicleId,
              customer_name_snapshot: customerName,
              vehicle_plate_snapshot: vehiclePlate,
              status: "הצעה בהכנה",
              case_data: nextCaseData,
              updated_at: new Date().toISOString(),
            })
            .eq("id", caseId);
          if (updCaseErr) throw new Error(`עדכון כרטיס עבודה נכשל: ${updCaseErr.message}`);
        } else {
          const initialCaseData = {
            route: "quote_first",
            flowStage: "quote",
            customerTypeLabel,
            quoteTitle,
            quoteDate,
            workType,
            vatRate: 18,
            vatMode,
            damageItems,
            quoteWorks,
            quoteParts,
            extraApprovals: [],
            tasks: [],
            reminders: [],
            quoteCreated: true,
            quoteVersion: 1,
            quoteSigned: false,
            quoteApproved: false,
            quoteStatus: "ready_to_send",
            quotePricedSubtotal: pricedSubtotal,
            quotePricedLinesCount: pricedWorks.length,
            quoteUnpricedLinesCount: unpricedWorks.length,
            quoteNotes: quoteNotes || "",
            timeline: [
              {
                at: new Date().toISOString(),
                text: `נפתח כרטיס עבודה והוכנה הצעת מחיר (${quoteTitle}) ע"י ${actorName || "דליה AI"} · לקוח: ${customerName} (${customerTypeLabel}) · רכב: ${vehiclePlate}.`,
              },
            ],
          };

          const { data: createdCase, error: createCaseErr } = await supabase
            .from("garage_cases")
            .insert({
              customer_id: customerId,
              vehicle_id: vehicleId,
              customer_name_snapshot: customerName,
              vehicle_plate_snapshot: vehiclePlate,
              vehicle_label_snapshot: vehicleModel || vehiclePlate,
              status: "הצעה בהכנה",
              opened_by: effectiveUserId,
              opened_by_name: actorName || "דליה AI",
              case_data: initialCaseData,
            })
            .select("id, case_number, shop_company_name")
            .single();
          if (createCaseErr) throw new Error(`פתיחת כרטיס עבודה נכשלה: ${createCaseErr.message}`);
          caseId = createdCase.id;
          caseNumber = createdCase.case_number;
          shopCompanyName = createdCase.shop_company_name || "";
        }

        // 4. Check actual damage photos in garage_media
        const { data: mediaList } = await supabase
          .from("garage_media")
          .select("id, category, title")
          .eq("garage_case_id", caseId)
          .in("category", ["damage", "quote_photos", "intake", "angles"]);
        const damagePhotosCount = Array.isArray(mediaList) ? mediaList.length : 0;
        const damagePhotosAttached = damagePhotosCount > 0;

        // 5. Create or update secure quote link in garage_quote_links (status: ready_to_send)
        const { data: existingLinks } = await supabase
          .from("garage_quote_links")
          .select("id, token, status")
          .eq("case_id", caseId)
          .eq("quote_version", quoteVersion)
          .in("status", ["ready_to_send", "sent"])
          .limit(1);

        let quoteToken = "";
        const quoteLinkPayload = {
          case_id: caseId,
          case_number: caseNumber,
          shop_company_name: shopCompanyName,
          quote_version: quoteVersion,
          quote_title: quoteTitle,
          customer_name: customerName,
          recipient_phone: customerPhone || "",
          recipient_email: customerEmail || "",
          vehicle_plate: vehiclePlate,
          quote_date: quoteDate,
          work_type: workType,
          quote_works: quoteWorks,
          quote_parts: quoteParts,
          priced_subtotal: pricedSubtotal,
          priced_lines_count: pricedWorks.length,
          unpriced_lines_count: unpricedWorks.length,
          vat_rate: 18,
          vat_mode: vatMode,
          quote_notes: quoteNotes || "",
          damage_photos_attached: damagePhotosAttached,
          damage_photos_count: damagePhotosCount,
          status: "ready_to_send",
          created_by: userId,
          updated_at: new Date().toISOString(),
        };

        if (existingLinks && existingLinks.length > 0) {
          quoteToken = existingLinks[0].token;
          await supabase.from("garage_quote_links").update(quoteLinkPayload).eq("id", existingLinks[0].id);
        } else {
          const { data: insertedLink, error: linkErr } = await supabase
            .from("garage_quote_links")
            .insert(quoteLinkPayload)
            .select("token")
            .single();
          if (linkErr) throw new Error(`יצירת קישור הצעת מחיר נכשלה: ${linkErr.message}`);
          quoteToken = insertedLink.token;
        }

        // Sync quoteToken and photo counts into garage_cases.case_data
        const { data: latestCase } = await supabase.from("garage_cases").select("case_data").eq("id", caseId).single();
        if (latestCase) {
          await supabase
            .from("garage_cases")
            .update({
              case_data: {
                ...(latestCase.case_data || {}),
                quoteToken,
                damagePhotosAttached,
                damagePhotosCount,
              },
            })
            .eq("id", caseId);
        }

        // 6. Format full structured quote in chat
        const workLinesFormatted = quoteWorks
          .map((w: any, idx: number) => {
            const priceLabel = w.price !== null && w.price !== undefined && Number(w.price) > 0
              ? `${Number(w.price).toLocaleString()} ₪`
              : "ללא מחיר בשלב זה";
            return `${idx + 1}. **${w.part}** – **${priceLabel}**\n   ${w.desc}`;
          })
          .join("\n\n");

        const photosStatusLine = damagePhotosAttached
          ? `📷 **מצורפות תמונות המתעדות את הנזקים ברכב** (${damagePhotosCount} תמונות נזק שמורות בכרטיס העבודה).`
          : `📷 **מצורפות תמונות המתעדות את הנזקים ברכב.**\n⚠️ *שים לב: טרם הועלו תמונות נזק בפועל לכרטיס העבודה. נא לצלם או להעלות תמונות מתעדות (דרך כפתור המצלמה 📷 או הגלריה 🖼️ בצ'אט או בכרטיס העבודה) לפני שליחת ההצעה ללקוח.*`;

        const contactReadinessLine = customerPhone || customerEmail
          ? `📲 **פרטי קשר לשליחה:** ${[customerPhone, customerEmail].filter(Boolean).join(" · ")}`
          : `ℹ️ **סטטוס שליחה:** ההצעה והקישור המאובטח לחתימה דיגיטלית מוכנים לשליחה (\`ready_to_send\`). לא הוזן טלפון או אימייל עבור ${customerName} — ניתן להעתיק את קישור החתימה או להזין מספר טלפון/מייל בחלונית השליחה.`;

        const fullFormattedQuote = [
          `✅ **כרטיס העבודה והצעת המחיר נשמרו ואומתו במערכת!**`,
          `- **מספר כרטיס עבודה:** [${caseNumber}](#/garage-management/${caseId})`,
          `- **לקוח:** ${customerName} (${customerTypeLabel})`,
          `- **מספר רכב:** ${vehiclePlate}`,
          `- **סוג עבודה:** ${workType}`,
          "",
          `---`,
          `## 📄 ${quoteTitle}`,
          `**לכבוד:** ${customerName}`,
          `**מספר רכב:** ${vehiclePlate}`,
          `**תאריך:** ${quoteDate}`,
          "",
          `### 🛠️ פירוט העבודות:`,
          workLinesFormatted,
          "",
          `---`,
          `### 💰 סיכום כספי ומע"מ`,
          `- **סה"כ עבור ${pricedWorks.length} השורות המתומחרות בלבד:** **${pricedSubtotal.toLocaleString()} ₪**`,
          ...(unpricedWorks.length > 0
            ? [`- ⚠️ **הבהרה חשובה:** סכום הביניים (**${pricedSubtotal.toLocaleString()} ₪**) מתייחס ל-${pricedWorks.length} העבודות המתומחרות בלבד, ו**אינו** המחיר הסופי לכל ${quoteWorks.length} העבודות (${unpricedWorks.length} שורות מוגדרות "ללא מחיר בשלב זה").`]
            : []),
          `- **מע"מ (18%):** מע"מ, ככל שחל, יחושב לפי שיעור המס התקף בישראל, **18%**, ובהתאם להגדרת המחירים ככוללים או לא כוללים מע"מ. אין להניח זאת ללא הגדרה.`,
          "",
          `---`,
          photosStatusLine,
          "",
          contactReadinessLine,
          "",
          `🔗 **קישור ישיר להצעת המחיר ולחתימת הלקוח:** [צפייה וחתימה על הצעת המחיר](/garage-quote?t=${quoteToken})`,
          `📂 **קישור ישיר לכרטיס העבודה:** [פתח כרטיס עבודה ${caseNumber}](#/garage-management/${caseId})`,
        ].join("\n");

        return {
          success: true,
          message: fullFormattedQuote,
          case_id: caseId,
          case_number: caseNumber,
          customer_id: customerId,
          vehicle_id: vehicleId,
          quote_token: quoteToken,
          quote_url: `/garage-quote?t=${quoteToken}`,
          priced_subtotal: pricedSubtotal,
          priced_lines_count: pricedWorks.length,
          unpriced_lines_count: unpricedWorks.length,
          damage_photos_attached: damagePhotosAttached,
          damage_photos_count: damagePhotosCount,
        } as any;
      }

      case "garage_send_quote": {
        const caseId = String(parameters.case_id || "");
        const recipientName = String(parameters.recipient_name || "");
        const recipientPhone = String(parameters.recipient_phone || "");
        const recipientEmail = String(parameters.recipient_email || "");
        const channel = String(parameters.channel || "whatsapp");
        const subtotal = Number(parameters.subtotal) || 0;

        const { data: existing, error: loadErr } = await supabase
          .from("garage_cases")
          .select("id, case_number, customer_name_snapshot, vehicle_plate_snapshot, case_data, shop_company_name")
          .eq("id", caseId)
          .single();
        if (loadErr || !existing) throw new Error("תיק מוסך לא נמצא לשליחת הצעת מחיר");

        const cd = existing.case_data || {};
        const quoteVersion = Number(cd.quoteVersion) || 1;
        const works = Array.isArray(cd.quoteWorks) ? cd.quoteWorks : [];
        const parts = Array.isArray(cd.quoteParts) ? cd.quoteParts : [];
        const pricedWorks = works.filter((w: any) => w.price !== null && w.price !== undefined && Number(w.price) > 0);
        const unpricedWorks = works.filter((w: any) => w.price === null || w.price === undefined || w.price === "");

        // Check or create quote link
        const { data: existingLinks } = await supabase
          .from("garage_quote_links")
          .select("id, token")
          .eq("case_id", caseId)
          .eq("quote_version", quoteVersion)
          .limit(1);

        let quoteToken = cd.quoteToken || "";
        const hasRealRecipient = Boolean(recipientPhone || recipientEmail);
        const linkStatus = hasRealRecipient ? "sent" : "ready_to_send";

        if (existingLinks && existingLinks.length > 0) {
          quoteToken = existingLinks[0].token;
          await supabase
            .from("garage_quote_links")
            .update({
              recipient_phone: recipientPhone || "",
              recipient_email: recipientEmail || "",
              status: linkStatus,
              channel,
              sent_at: hasRealRecipient ? new Date().toISOString() : null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingLinks[0].id);
        } else {
          const { data: insertedLink, error: linkErr } = await supabase
            .from("garage_quote_links")
            .insert({
              case_id: caseId,
              case_number: existing.case_number,
              shop_company_name: existing.shop_company_name || "",
              quote_version: quoteVersion,
              quote_title: cd.quoteTitle || "הצעת מחיר – עבודות פחחות וצבע",
              customer_name: recipientName || existing.customer_name_snapshot || "",
              recipient_phone: recipientPhone || "",
              recipient_email: recipientEmail || "",
              vehicle_plate: existing.vehicle_plate_snapshot || "",
              quote_date: cd.quoteDate || new Date().toLocaleDateString("he-IL"),
              work_type: cd.workType || "",
              quote_works: works,
              quote_parts: parts,
              priced_subtotal: subtotal,
              priced_lines_count: pricedWorks.length,
              unpriced_lines_count: unpricedWorks.length,
              vat_rate: 18,
              vat_mode: cd.vatMode || "unspecified",
              status: linkStatus,
              channel,
              sent_at: hasRealRecipient ? new Date().toISOString() : null,
              created_by: userId,
            })
            .select("token")
            .single();
          if (linkErr) throw new Error(`יצירת קישור הצעה נכשלה: ${linkErr.message}`);
          quoteToken = insertedLink.token;
        }

        const timeline = Array.isArray(cd.timeline) ? [...cd.timeline] : [];
        timeline.push({
          at: new Date().toISOString(),
          text: hasRealRecipient
            ? `הצעת מחיר (גרסה ${quoteVersion}) וקישור לחתימה נשלחו ל-${recipientName} בערוץ ${channel} ע"י ${actorName || "דליה AI"}`
            : `הופק קישור מאובטח להצעת מחיר ולחתימת הלקוח ${recipientName} (גרסה ${quoteVersion}) ע"י ${actorName || "דליה AI"}`,
        });

        const nextCaseStatus = hasRealRecipient ? "הצעה נשלחה" : "הצעה בהכנה";
        const { error: updErr } = await supabase.from("garage_cases").update({
          status: nextCaseStatus,
          case_data: {
            ...cd,
            quoteToken,
            quoteSent: hasRealRecipient,
            quoteSentAt: hasRealRecipient ? new Date().toISOString() : null,
            quoteSentTo: recipientName,
            quoteSentChannel: channel,
            quoteStatus: linkStatus,
            timeline,
          },
          updated_at: new Date().toISOString(),
        }).eq("id", caseId);
        if (updErr) throw new Error(`עדכון שליחת הצעה נכשל: ${updErr.message}`);

        return {
          success: true,
          message: hasRealRecipient
            ? `✅ הצעת המחיר והקישור לחתימה דיגיטלית נשלחו ל-${recipientName} (${channel}) עבור כרטיס עבודה [${existing.case_number}](#/garage-management/${existing.id}). קישור חתימה: [צפייה וחתימה](/garage-quote?t=${quoteToken})`
            : `✅ קישור מאובטח להצעת המחיר ולחתימת הלקוח מוכן עבור ${recipientName} בכרטיס עבודה [${existing.case_number}](#/garage-management/${existing.id}): [צפייה וחתימה על הצעת המחיר](/garage-quote?t=${quoteToken})`,
          quote_token: quoteToken,
          quote_url: `/garage-quote?t=${quoteToken}`,
          case_id: existing.id,
          case_number: existing.case_number,
        } as any;
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
