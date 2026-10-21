// supabase/functions/help-ai-chat/garageTools.ts
// Fully-featured AI tools for Garage Management & Dashboard execution in Hebrew

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
1. ביצוע פעולות אמיתיות (Preview & Approval):
   - כל פעולת שינוי, יצירה או שמירה במערכת (פתיחת כרטיס עבודה, עדכון סטטוס, הוספת עבודות/חלקים/נזקים, יצירת משימות ותזכורות) חייבת לעבור דרך כרטיס אישור (Preview Action Card).
   - אל תבצע שינוי ללא הפקת תצוגה מקדימה לאישור המשתמש.
   - השתמש בכלים המתאימים (preview_create_garage_case, preview_update_garage_case_status, preview_update_garage_repair_details, preview_create_garage_task, preview_create_garage_reminder וכו').

2. איתור לקוחות ורכבים:
   - לפני פתיחת כרטיס עבודה חדש, חפש לקוח קיים לפי שם/טלפון ורכב לפי מספר לוחית רישוי.
   - אם הלקוח או הרכב אינם קיימים, הצע ליצור אותם בצורה מסודרת ומאומתת.

3. פחחות וצבע (Bodywork & Paint):
   - תמיכה מלאה בהגדרת פריטי נזק (damageItems), עבודות פחחות/צבע/מכונאות (quoteWorks), חלקי חילוף ומק"טים (quoteParts), ואישורים חריגים (extraApprovals).
   - הצג תמיד מחירים, כמויות וסטטוסים בצורה ברורה בעברית.

4. משימות ותזכורות:
   - אפשר ליצור משימות למעקב (create_garage_task) ותזכורות לזמנים מוגדרים (create_garage_reminder) עבור כל תיק או באופן כללי.

5. מסמכים ומדיה:
   - צפייה ופירוט תמונות נזק, מסמכים והעלאות (garage_media).
   - הפקת דוח סיכום תיק מקיף ומסודר (get_garage_case_summary_report).

6. שפה וסגנון:
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
        description: "קבלת הפרטים המלאים של כרטיס עבודה במוסך: פרטי לקוח, פרטי רכב, נזקים, הצעת מחיר, עבודות, חלקים, אישורים חריגים, שלב בטיפול, משימות, תזכורות והיסטוריה.",
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
        name: "search_garage_vehicles",
        description: "חיפוש כלי רכב במאגר המוסך לפי מספר לוחית רישוי, יצרן, דגם, או מספר שלדה (VIN).",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "לוחית רישוי (עם או בלי מקפים), יצרן, דגם או VIN",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "preview_create_garage_case",
        description: "הכנת תצוגה מקדימה וכרטיס אישור לפתיחת כרטיס עבודה / תיק מוסך חדש עבור לקוח ורכב.",
        parameters: {
          type: "OBJECT",
          properties: {
            customer_id: {
              type: "STRING",
              description: "מזהה הלקוח (UUID) מתוך ספר הלקוחות",
            },
            vehicle_id: {
              type: "STRING",
              description: "מזהה הרכב (UUID) מתוך ספר הרכבים",
            },
            customer_name: {
              type: "STRING",
              description: "שם הלקוח (אם פותחים לקוח חדש במעמד זה)",
            },
            customer_phone: {
              type: "STRING",
              description: "טלפון הלקוח",
            },
            vehicle_plate: {
              type: "STRING",
              description: "מספר לוחית רישוי של הרכב",
            },
            vehicle_model: {
              type: "STRING",
              description: "יצרן ודגם של הרכב",
            },
            route: {
              type: "STRING",
              description: "מסלול הטיפול: 'quote_first' (הצעת מחיר תחילה) או 'intake_first' (קליטת רכב ובדיקה תחילה). ברירת מחדל 'intake_first'",
            },
            initial_status: {
              type: "STRING",
              description: "סטטוס התחלתי (ברירת מחדל 'בדיקת רכב')",
            },
            notes: {
              type: "STRING",
              description: "הערות פתיחה, תיאור תקלה או תלונת לקוח",
            },
            damage_items: {
              type: "ARRAY",
              description: "רשימת פריטי נזק ראשוניים (לדוגמה: פגוש קדמי, כנף ימין)",
              items: {
                type: "OBJECT",
                properties: {
                  part: { type: "STRING", description: "שם החלק/האזור שנפגע" },
                  status: { type: "STRING", description: "תיאור הפגיעה (שריטה, מעיכה, שבר וכו')" },
                },
              },
            },
          },
        },
      },
      {
        name: "preview_update_garage_case_status",
        description: "הכנת כרטיס אישור לעדכון סטטוס הטיפול או שלב הזרימה בתיק מוסך קיים.",
        parameters: {
          type: "OBJECT",
          properties: {
            case_id: {
              type: "STRING",
              description: "מזהה התיק (UUID) או מספר תיק (GM-2026-XXXX)",
            },
            status: {
              type: "STRING",
              description: "הסטטוס החדש: 'בדיקת רכב', 'הצעה בהכנה', 'ממתין לאישור', 'אושר - ממתין לעבודה', 'עבודה התחילה', 'עבודה הסתיימה', 'תיק סגור'",
            },
            flow_stage: {
              type: "STRING",
              description: "שלב הטיפול הפנימי (למשל: inspection, quote, approval, work, done, closed)",
            },
            notes: {
              type: "STRING",
              description: "הערת עדכון ליומן התיק (timeline)",
            },
          },
          required: ["case_id", "status"],
        },
      },
      {
        name: "preview_update_garage_repair_details",
        description: "הכנת כרטיס אישור להוספה או עדכון פרטי פחחות, צבע, עבודות, חלקים ואישורים חריגים בכרטיס עבודה.",
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
          required: ["case_id", "title"],
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
          required: ["case_id", "title"],
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

// Helper to resolve case ID by UUID or GM-2026-XXXX number
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
      if (error) throw new Error(`שגיאה בחיפוש תיקים: ${error.message}`);

      const results = (data || []).map((c: any) => {
        const cd = c.case_data || {};
        return {
          case_id: c.id,
          case_number: c.case_number,
          customer_name: c.customer_name_snapshot,
          plate: c.vehicle_plate_snapshot,
          vehicle: c.vehicle_label_snapshot,
          status: c.status,
          flow_stage: cd.flowStage || "inspection",
          work_started: !!cd.workStarted,
          work_finished: !!cd.workFinished,
          damage_count: Array.isArray(cd.damageItems) ? cd.damageItems.length : 0,
          quote_works_count: Array.isArray(cd.quoteWorks) ? cd.quoteWorks.length : 0,
          quote_parts_count: Array.isArray(cd.quoteParts) ? cd.quoteParts.length : 0,
          created_at: c.created_at,
        };
      });

      return { result: { count: results.length, cases: results } };
    }

    case "get_garage_case_details": {
      const gCase = await resolveGarageCase(supabase, targetCaseId);
      if (!gCase) return { result: { error: `לא נמצא תיק מוסך תואם עבור: "${targetCaseId}"` } };

      // Also fetch customer & vehicle records if linked
      let customerRecord = null;
      let vehicleRecord = null;
      if (gCase.customer_id) {
        const { data: cust } = await supabase.from("garage_customers").select("*").eq("id", gCase.customer_id).single();
        customerRecord = cust;
      }
      if (gCase.vehicle_id) {
        const { data: veh } = await supabase.from("garage_vehicles").select("*").eq("id", gCase.vehicle_id).single();
        vehicleRecord = veh;
      }

      // Fetch media count
      const { data: media } = await supabase.from("garage_media").select("id, category, title, created_at").eq("garage_case_id", gCase.id);

      const cd = gCase.case_data || {};
      return {
        result: {
          case_id: gCase.id,
          case_number: gCase.case_number,
          status: gCase.status,
          created_at: gCase.created_at,
          opened_by_name: gCase.opened_by_name,
          customer: {
            id: gCase.customer_id,
            name: gCase.customer_name_snapshot || customerRecord?.name || "—",
            phone: customerRecord?.phone || "—",
            company: customerRecord?.company_name || "—",
            email: customerRecord?.email || "—",
          },
          vehicle: {
            id: gCase.vehicle_id,
            plate: gCase.vehicle_plate_snapshot || vehicleRecord?.plate || "—",
            label: gCase.vehicle_label_snapshot || `${vehicleRecord?.make || ""} ${vehicleRecord?.model || ""}`.trim() || "—",
            year: vehicleRecord?.year || "—",
            color: vehicleRecord?.color || "—",
            vin: vehicleRecord?.vin || "—",
          },
          repair_details: {
            flow_stage: cd.flowStage || "inspection",
            route: cd.route || "intake_first",
            damage_items: cd.damageItems || [],
            quote_works: cd.quoteWorks || [],
            quote_parts: cd.quoteParts || [],
            extra_approvals: cd.extraApprovals || [],
            work_started: !!cd.workStarted,
            work_finished: !!cd.workFinished,
            case_closed: !!cd.caseClosed,
            quote_approved: !!cd.quoteApproved,
          },
          tasks: cd.tasks || [],
          reminders: cd.reminders || [],
          timeline: cd.timeline || [],
          media_files: media || [],
        },
      };
    }

    case "search_garage_customers": {
      const q = String(args?.query || "").trim();
      if (!q) return { result: { customers: [] } };
      const { data, error } = await supabase
        .from("garage_customers")
        .select("*")
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%,company_name.ilike.%${q}%,business_id.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(20);
      if (error) throw new Error(`שגיאה בחיפוש לקוחות: ${error.message}`);
      return { result: { count: data?.length || 0, customers: data || [] } };
    }

    case "search_garage_vehicles": {
      const q = String(args?.query || "").trim();
      if (!q) return { result: { vehicles: [] } };
      const cleanPlate = q.replace(/[^0-9a-zA-Z]/g, "");
      const { data, error } = await supabase
        .from("garage_vehicles")
        .select("*")
        .or(`plate.ilike.%${q}%,plate.ilike.%${cleanPlate}%,make.ilike.%${q}%,model.ilike.%${q}%,vin.ilike.%${q}%`)
        .limit(20);
      if (error) throw new Error(`שגיאה בחיפוש רכבים: ${error.message}`);
      return { result: { count: data?.length || 0, vehicles: data || [] } };
    }

    case "preview_create_garage_case": {
      let custId = String(args?.customer_id || "").trim();
      let vehId = String(args?.vehicle_id || "").trim();
      let custName = String(args?.customer_name || "").trim();
      let custPhone = String(args?.customer_phone || "").trim();
      let vehPlate = String(args?.vehicle_plate || "").trim();
      let vehModel = String(args?.vehicle_model || "").trim();
      const route = String(args?.route || "intake_first").trim();
      const initialStatus = String(args?.initial_status || "בדיקת רכב").trim();
      const notes = String(args?.notes || "").trim();
      const damageItems = Array.isArray(args?.damage_items) ? args.damage_items : [];

      // If customer_id provided, fetch details
      if (custId && !custName) {
        const { data: c } = await supabase.from("garage_customers").select("name, phone").eq("id", custId).single();
        if (c) {
          custName = c.name;
          custPhone = c.phone;
        }
      }

      // If vehicle_id provided, fetch details
      if (vehId && !vehPlate) {
        const { data: v } = await supabase.from("garage_vehicles").select("plate, make, model").eq("id", vehId).single();
        if (v) {
          vehPlate = v.plate;
          vehModel = `${v.make || ""} ${v.model || ""}`.trim();
        }
      }

      const previewId = `prev_create_case_${Date.now()}`;
      const routeHebrew = route === "quote_first" ? "הצעת מחיר תחילה" : "קליטת רכב ובדיקה תחילה";
      const summary = `🚗 פתיחת כרטיס עבודה חדש במוסך
• לקוח: ${custName || custPhone || "ייווצר לקוח חדש"}
• רכב: ${vehPlate} ${vehModel ? `(${vehModel})` : ""}
• מסלול טיפול: ${routeHebrew}
• סטטוס התחלתי: ${initialStatus}
${notes ? `• תלונת לקוח/הערות: ${notes}` : ""}
${damageItems.length > 0 ? `• פריטי נזק ראשוניים: ${damageItems.map((d: any) => d.part || d).join(", ")}` : ""}`;

      const pendingAction: GaragePendingAction = {
        preview_id: previewId,
        summary,
        tool_name: "create_garage_case",
        action_type: "garage_create_case",
        parameters: {
          customer_id: custId,
          customer_name: custName,
          customer_phone: custPhone,
          vehicle_id: vehId,
          vehicle_plate: vehPlate,
          vehicle_model: vehModel,
          route,
          status: initialStatus,
          notes,
          damage_items: damageItems,
        },
      };

      return {
        result: {
          preview_ready: true,
          action: "create_garage_case",
          summary,
          requires_confirmation: true,
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

      const previewId = `prev_status_${Date.now()}`;
      const summary = `🔄 עדכון סטטוס כרטיס עבודה ${gCase.case_number}
• רכב: ${gCase.vehicle_plate_snapshot} (${gCase.customer_name_snapshot})
• סטטוס נוכחי: ${gCase.status}
• סטטוס חדש מבוקש: ${newStatus}
${flowStage ? `• שלב זרימה: ${flowStage}` : ""}
${notes ? `• הערת יומן: ${notes}` : ""}`;

      const pendingAction: GaragePendingAction = {
        preview_id: previewId,
        summary,
        tool_name: "update_garage_case_status",
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
          preview_ready: true,
          action: "update_garage_case_status",
          summary,
          requires_confirmation: true,
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
      const mode = String(args?.mode || "append").trim();

      let summaryLines = [
        `🔧 עדכון פרטי תיקון, פחחות וצבע לתיק ${gCase.case_number}`,
        `• רכב: ${gCase.vehicle_plate_snapshot} (${gCase.customer_name_snapshot})`,
        `• אופן עדכון: ${mode === "replace" ? "החלפת הרשימה הקיימת" : "הוספה על הרשימה הקיימת"}`,
      ];

      if (damageItems.length > 0) {
        summaryLines.push(`• פריטי נזק (${damageItems.length}): ${damageItems.map((d: any) => `${d.part || ""}${d.status ? ` (${d.status})` : ""}`).join(", ")}`);
      }
      if (quoteWorks.length > 0) {
        const totalWorkPrice = quoteWorks.reduce((acc, w) => acc + (Number(w.price) || 0) * (Number(w.qty) || 1), 0);
        summaryLines.push(`• עבודות (${quoteWorks.length}, סה"כ ₪${totalWorkPrice}): ${quoteWorks.map((w: any) => `${w.type || "עבודה"} ${w.part || ""} - ₪${w.price || 0}`).join(", ")}`);
      }
      if (quoteParts.length > 0) {
        const totalPartsPrice = quoteParts.reduce((acc, p) => acc + (Number(p.price) || 0) * (Number(p.qty) || 1), 0);
        summaryLines.push(`• חלפים (${quoteParts.length}, סה"כ ₪${totalPartsPrice}): ${quoteParts.map((p: any) => `${p.name || "חלק"} - ₪${p.price || 0}`).join(", ")}`);
      }
      if (extraApprovals.length > 0) {
        summaryLines.push(`• אישורים חריגים (${extraApprovals.length}): ${extraApprovals.map((e: any) => `${e.text} (₪${e.price || 0})`).join(", ")}`);
      }

      const summary = summaryLines.join("\n");
      const previewId = `prev_repair_${Date.now()}`;

      const pendingAction: GaragePendingAction = {
        preview_id: previewId,
        summary,
        tool_name: "update_garage_repair_details",
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
          preview_ready: true,
          action: "update_garage_repair_details",
          summary,
          requires_confirmation: true,
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

      const previewId = `prev_task_${Date.now()}`;
      const summary = `📋 יצירת משימה חדשה לתיק ${gCase.case_number}
• רכב: ${gCase.vehicle_plate_snapshot} (${gCase.customer_name_snapshot})
• משימה: ${title}
${dueDate ? `• תאריך יעד: ${dueDate}` : ""}
${assignee ? `• אחראי לביצוע: ${assignee}` : ""}`;

      const pendingAction: GaragePendingAction = {
        preview_id: previewId,
        summary,
        tool_name: "create_garage_task",
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
          preview_ready: true,
          action: "create_garage_task",
          summary,
          requires_confirmation: true,
        },
        preview: pendingAction,
      };
    }

    case "preview_create_garage_reminder": {
      const gCase = await resolveGarageCase(supabase, targetCaseId);
      if (!gCase) return { result: { error: `לא נמצא תיק מוסך תואם עבור: "${targetCaseId}"` } };

      const title = String(args?.title || "").trim();
      const remindAt = String(args?.remind_at || "").trim();

      const previewId = `prev_reminder_${Date.now()}`;
      const summary = `⏰ הגדרת תזכורת לתיק ${gCase.case_number}
• רכב: ${gCase.vehicle_plate_snapshot} (${gCase.customer_name_snapshot})
• תזכורת: ${title}
• מועד: ${remindAt || "במועד הקרוב"}`;

      const pendingAction: GaragePendingAction = {
        preview_id: previewId,
        summary,
        tool_name: "create_garage_reminder",
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
          preview_ready: true,
          action: "create_garage_reminder",
          summary,
          requires_confirmation: true,
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
# 📋 דוח סיכום כרטיס עבודה מוסך · ${gCase.case_number}
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

    switch (action_type) {
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
          const { data: newCust, error: custErr } = await supabase
            .from("garage_customers")
            .insert({
              name: customerName || "לקוח ללא שם",
              phone: customerPhone || "",
              customer_type: "private",
            })
            .select("id, name, phone")
            .single();
          if (custErr) throw new Error(`יצירת לקוח נכשלה: ${custErr.message}`);
          customerId = newCust.id;
        }

        // 2. Ensure vehicle exists
        if (!vehicleId) {
          if (!vehiclePlate) {
            throw new Error("חובה לספק מספר לוחית רישוי של הרכב לפתיחת תיק.");
          }
          const { data: newVeh, error: vehErr } = await supabase
            .from("garage_vehicles")
            .insert({
              customer_id: customerId,
              plate: vehiclePlate,
              make: vehicleModel.split(" ")[0] || "",
              model: vehicleModel.split(" ").slice(1).join(" ") || "",
            })
            .select("id, plate, make, model")
            .single();
          if (vehErr) throw new Error(`יצירת רכב נכשלה: ${vehErr.message}`);
          vehicleId = newVeh.id;
        }

        // 3. Insert garage case
        const initialCaseData = {
          route,
          flowStage: "inspection",
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

        const insertPayload: Record<string, unknown> = {
          customer_id: customerId,
          vehicle_id: vehicleId,
          status,
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
          message: `✅ כרטיס עבודה ${createdCase.case_number} נפתח בהצלחה עבור רכב ${createdCase.vehicle_plate_snapshot} (${createdCase.customer_name_snapshot})! התיק הועבר לשלב בדיקה.`,
        };
      }

      case "garage_update_status": {
        const caseId = String(parameters.case_id || "");
        const newStatus = String(parameters.status || "");
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
          ...(newStatus.includes("סגור") ? { caseClosed: true } : {}),
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
          message: `✅ סטטוס כרטיס עבודה ${existing.case_number} עודכן בהצלחה ל-"${newStatus}".`,
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

        let nextDamage = mode === "replace" ? damageItems : [...(cd.damageItems || []), ...damageItems];
        let nextWorks = mode === "replace" ? quoteWorks : [...(cd.quoteWorks || []), ...quoteWorks];
        let nextParts = mode === "replace" ? quoteParts : [...(cd.quoteParts || []), ...quoteParts];
        let nextExtras = mode === "replace" ? extraApprovals : [...(cd.extraApprovals || []), ...extraApprovals];

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
          message: `✅ פרטי התיקון, הפחחות והחלקים נשמרו בהצלחה בכרטיס עבודה ${existing.case_number}.`,
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

        return {
          success: true,
          message: `✅ משימה חדשה ("${title}") נוספה בהצלחה לכרטיס עבודה ${existing.case_number}.`,
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
          message: `✅ תזכורת ("${title}") הוגדרה בהצלחה לכרטיס עבודה ${existing.case_number}.`,
        };
      }

      default:
        return { success: false, error: `פעולה לא נתמכת: ${action_type}` };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
