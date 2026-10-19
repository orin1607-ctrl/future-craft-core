import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { edgeCorsHeaders, requireAuth, resolveCompanyScope } from "../_shared/edgeAuth.ts";
import { addTrace, toolOutcome, type ToolTrace } from "../_shared/claimToolTrace.ts";
import {
  CLAIMS_GEMINI_TOOLS,
  CLAIMS_GENERAL_GEMINI_TOOLS,
  CLAIMS_SYSTEM_PROMPT_INSTRUCTIONS,
  CLAIMS_GENERAL_SYSTEM_PROMPT_INSTRUCTIONS,
  executeClaimsPendingAction,
  executeClaimsTool,
  executeClaimsGeneralTool,
  recordAiAudit,
  type ClaimsPendingAction,
  type ClaimsDocumentCard,
} from "./claimsTools.ts";

const corsHeaders = edgeCorsHeaders;

const SYSTEM_PROMPT = `אתה עוזר AI חכם למערכת ניהול צי רכבים בעברית.
המערכת מנהלת רכבים, נהגים, תקלות, תאונות, הוצאות, מסלולים, סידורי עבודה, הזמנות שירות, התראות ועוד.

יש לך גישה לנתונים חיים של המערכת דרך פונקציות. כשמישהו שואל על נתונים מספריים (כמה רכבים, כמה תקלות פתוחות, מה סטטוס וכו') - השתמש בפונקציות לקבלת מידע עדכני.

תחומי התמחות:
- ניהול רכבים (טסט, ביטוח, רישוי, קילומטראז')
- ניהול נהגים (רישיונות, שיוכים)
- מעקב תקלות ותאונות
- ניהול הזמנות שירות וטיפולים
- מסלולים וסידורי עבודה
- הוצאות ודוחות

כללים:
- ענה תמיד בעברית, תמציתי וברור
- כשמראה נתונים מספריים - השתמש באמוג'י (🚗 🔧 ⚠️ ✅ 📊)
- תן הנחיות מעשיות עם הפניה למסך במערכת (למשל "/vehicles", "/faults")
- כשמפנה למסך — הוסף [[nav:/path]] (למשל [[nav:/vehicles]])
- אם לא יודע - אמור זאת בגלוי, אל תמציא`;

const FLEET_GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "get_vehicles_stats",
        description: "סטטיסטיקת רכבים: סך הכל, לפי סטטוס, רכבים עם טסט/ביטוח שעומדים לפוג",
        parameters: {
          type: "OBJECT",
          properties: {
            company_name: { type: "STRING", description: "סנן לפי שם חברה" },
            days_until_expiry: { type: "NUMBER", description: "כמה ימים קדימה לבדוק תפוגות (ברירת מחדל 30)" },
          },
        },
      },
      {
        name: "get_drivers_stats",
        description: "סטטיסטיקת נהגים: סך הכל, פעילים, רישיונות שעומדים לפוג",
        parameters: {
          type: "OBJECT",
          properties: {
            company_name: { type: "STRING" },
          },
        },
      },
      {
        name: "get_faults_stats",
        description: "סטטיסטיקת תקלות: לפי סטטוס, דחיפות, תקופה אחרונה",
        parameters: {
          type: "OBJECT",
          properties: {
            company_name: { type: "STRING" },
            days: { type: "NUMBER", description: "מספר ימים אחורה (ברירת מחדל 7)" },
          },
        },
      },
      {
        name: "get_accidents_stats",
        description: "סטטיסטיקת תאונות: סך הכל ולפי תקופה",
        parameters: {
          type: "OBJECT",
          properties: {
            company_name: { type: "STRING" },
            days: { type: "NUMBER" },
          },
        },
      },
      {
        name: "get_service_orders_stats",
        description: "סטטיסטיקת הזמנות שירות: ממתינות, בטיפול, הושלמו",
        parameters: {
          type: "OBJECT",
          properties: {
            company_name: { type: "STRING" },
          },
        },
      },
      {
        name: "get_expenses_stats",
        description: "סיכום הוצאות לפי קטגוריה ותקופה",
        parameters: {
          type: "OBJECT",
          properties: {
            company_name: { type: "STRING" },
            days: { type: "NUMBER", description: "מספר ימים אחורה (ברירת מחדל 30)" },
          },
        },
      },
      {
        name: "get_alerts_count",
        description: "מספר התראות פעילות במערכת",
        parameters: {
          type: "OBJECT",
          properties: { company_name: { type: "STRING" } },
        },
      },
    ],
  },
];

async function executeFleetTool(
  name: string,
  args: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  forcedCompany?: string,
): Promise<string> {
  try {
    const company = forcedCompany ?? (args.company_name as string | undefined);

    switch (name) {
      case "get_vehicles_stats": {
        const days = (args.days_until_expiry as number) || 30;
        let q = supabase.from("vehicles").select("id, status, test_expiry, insurance_expiry, license_expiry, plate_number, manufacturer, model");
        if (company) q = q.eq("company_name", company);
        const { data, error } = await q;
        if (error) return JSON.stringify({ error: error.message });

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + days);
        const statusBreakdown: Record<string, number> = {};
        let testExpiringSoon = 0, insuranceExpiringSoon = 0, licenseExpiringSoon = 0;
        for (const v of data || []) {
          statusBreakdown[v.status || "unknown"] = (statusBreakdown[v.status || "unknown"] || 0) + 1;
          if (v.test_expiry && new Date(v.test_expiry) <= cutoff) testExpiringSoon++;
          if (v.insurance_expiry && new Date(v.insurance_expiry) <= cutoff) insuranceExpiringSoon++;
          if (v.license_expiry && new Date(v.license_expiry) <= cutoff) licenseExpiringSoon++;
        }
        return JSON.stringify({
          total: (data || []).length,
          status_breakdown: statusBreakdown,
          test_expiring_in_days: { days, count: testExpiringSoon },
          insurance_expiring_in_days: { days, count: insuranceExpiringSoon },
          license_expiring_in_days: { days, count: licenseExpiringSoon },
        });
      }

      case "get_drivers_stats": {
        let q = supabase.from("drivers").select("id, status, license_expiry, full_name");
        if (company) q = q.eq("company_name", company);
        const { data, error } = await q;
        if (error) return JSON.stringify({ error: error.message });
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + 30);
        const statusBreakdown: Record<string, number> = {};
        let licenseExpiringSoon = 0;
        for (const d of data || []) {
          statusBreakdown[d.status || "unknown"] = (statusBreakdown[d.status || "unknown"] || 0) + 1;
          if (d.license_expiry && new Date(d.license_expiry) <= cutoff) licenseExpiringSoon++;
        }
        return JSON.stringify({
          total: (data || []).length,
          status_breakdown: statusBreakdown,
          licenses_expiring_30_days: licenseExpiringSoon,
        });
      }

      case "get_faults_stats": {
        const days = (args.days as number) || 7;
        let q = supabase.from("faults").select("id, status, urgency, created_at, vehicle_plate, description");
        if (company) q = q.eq("company_name", company);
        const { data, error } = await q;
        if (error) return JSON.stringify({ error: error.message });
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const recent = (data || []).filter((f) => new Date(f.created_at) >= cutoff);
        const statusBreakdown: Record<string, number> = {};
        const urgencyBreakdown: Record<string, number> = {};
        for (const f of data || []) {
          statusBreakdown[f.status || "unknown"] = (statusBreakdown[f.status || "unknown"] || 0) + 1;
          urgencyBreakdown[f.urgency || "unknown"] = (urgencyBreakdown[f.urgency || "unknown"] || 0) + 1;
        }
        return JSON.stringify({
          total: (data || []).length,
          recent_count: recent.length,
          recent_days: days,
          status_breakdown: statusBreakdown,
          urgency_breakdown: urgencyBreakdown,
        });
      }

      case "get_accidents_stats": {
        const days = (args.days as number) || 30;
        let q = supabase.from("accidents").select("id, status, date, created_at, vehicle_plate, driver_name");
        if (company) q = q.eq("company_name", company);
        const { data, error } = await q;
        if (error) return JSON.stringify({ error: error.message });
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const recent = (data || []).filter((a) => new Date(a.created_at) >= cutoff);
        const statusBreakdown: Record<string, number> = {};
        for (const a of data || []) {
          statusBreakdown[a.status || "unknown"] = (statusBreakdown[a.status || "unknown"] || 0) + 1;
        }
        return JSON.stringify({
          total: (data || []).length,
          recent_count: recent.length,
          recent_days: days,
          status_breakdown: statusBreakdown,
        });
      }

      case "get_service_orders_stats": {
        let q = supabase.from("service_orders").select("id, treatment_status, urgency, towing_requested");
        if (company) q = q.eq("company_name", company);
        const { data, error } = await q;
        if (error) return JSON.stringify({ error: error.message });
        const statusBreakdown: Record<string, number> = {};
        let towingCount = 0;
        for (const s of data || []) {
          statusBreakdown[s.treatment_status || "pending"] = (statusBreakdown[s.treatment_status || "pending"] || 0) + 1;
          if (s.towing_requested) towingCount++;
        }
        return JSON.stringify({
          total: (data || []).length,
          status_breakdown: statusBreakdown,
          requiring_towing: towingCount,
        });
      }

      case "get_expenses_stats": {
        const days = (args.days as number) || 30;
        let q = supabase.from("expenses").select("amount, category, date, vehicle_plate");
        if (company) q = q.eq("company_name", company);
        const { data, error } = await q;
        if (error) return JSON.stringify({ error: error.message });
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const recent = (data || []).filter((e) => e.date && new Date(e.date) >= cutoff);
        const byCategory: Record<string, { count: number; total: number }> = {};
        let totalAmount = 0;
        for (const e of recent) {
          const cat = e.category || "אחר";
          if (!byCategory[cat]) byCategory[cat] = { count: 0, total: 0 };
          byCategory[cat].count++;
          byCategory[cat].total += e.amount || 0;
          totalAmount += e.amount || 0;
        }
        return JSON.stringify({
          period_days: days,
          total_records: recent.length,
          total_amount_nis: totalAmount,
          by_category: byCategory,
        });
      }

      case "get_alerts_count": {
        let q = supabase.from("custom_alerts").select("id, alert_type, is_active");
        if (company) q = q.eq("company_name", company);
        const { data, error } = await q;
        if (error) return JSON.stringify({ error: error.message });
        const active = (data || []).filter((a) => a.is_active);
        const typeBreakdown: Record<string, number> = {};
        for (const a of active) {
          typeBreakdown[a.alert_type || "unknown"] = (typeBreakdown[a.alert_type || "unknown"] || 0) + 1;
        }
        return JSON.stringify({
          total_alerts: (data || []).length,
          active_alerts: active.length,
          type_breakdown: typeBreakdown,
        });
      }

      default:
        return JSON.stringify({ error: "Unknown function" });
    }
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" });
  }
}

function claimText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** Loads the open claim with the caller's JWT so RLS / claims_can_work_claim applies. */
async function loadClaimsContext(
  supabase: ReturnType<typeof createClient>,
  claimId: string,
): Promise<{ text: string } | { error: true; status: number; message: string }> {
  const { data, error } = await supabase
    .from("claims_records")
    .select("id, plate, client_name, status, row_data")
    .eq("id", claimId)
    .maybeSingle();
  if (error) return { error: true, status: 500, message: "לא ניתן לטעון את התיק" };
  if (!data) return { error: true, status: 403, message: "אין גישה לתיק הזה" };

  const row = (data.row_data && typeof data.row_data === "object" ? data.row_data : {}) as Record<string, unknown>;
  const claimNum = claimText(row.claimNum) || claimText(data.id) || "טרם התקבל";
  const plate = claimText(data.plate) || claimText(row.plate);
  const model = claimText(row.carModel);
  const vehicle = [plate, model].filter(Boolean).join(" · ") || "—";
  const text = [
    "אתה עוזר דליה בתוך מודול ניהול תביעות.",
    "התיק הפתוח עכשיו הוא המקור היחיד למידע על התביעה. אל תשתמש בפרטים של תיק אחר גם אם הופיעו קודם בשיחה.",
    `מזהה תיק (claim_id): ${claimText(data.id)}`,
    `מספר תביעה: ${claimNum}`,
    `רכב: ${vehicle}`,
    `לקוח: ${claimText(data.client_name) || claimText(row.clientName) || "—"}`,
    `חברת ביטוח: ${claimText(row.insCompany) || "—"}`,
    `סטטוס: ${claimText(data.status) || "—"}`,
    "",
    "הנחיות לפעולה בתיק:",
    "- כששואלים 'על איזה תיק אני עובד עכשיו?' או שאלות דומות על התיק הפתוח, ענה במפורש בעברית עם פרטי התיק הפתוח (מספר תביעה, רכב, לקוח, חברת ביטוח וסטטוס).",
    "- יש לך כלים ייעודיים לקריאת מיילים (חיפוש, מייל אחרון, בדיקת מענה מביטוח, מיילים ללקוח, קריאת תוכן וטיוטה), הצגת תמונות ומסמכים, ובדיקת קישורי שיתוף. השתמש בהם לקבלת מידע עדכני.",
    "- מסמכים: כשהמשתמש מבקש מסמך (למשל 'תביא לי דוח שמאי'), חפש עם list_claim_documents ו-query, ואז הצג אותו עם show_claim_document. אם נמצאו כמה, הצג את הרשימה ושאל איזה. אם לא נמצא, אמור שלא נמצא. אל תשלח את המשתמש ללחוץ על כפתורים בגלריה.",
    "- שליחת מסמך במייל: השתמש ב-preview_send_claim_email עם file_ids של המסמך המבוקש בלבד. 'שלח לי' = send_to_self=true. לפני האישור אמור במפורש למי ומה יישלח; אחרי ביצוע דווח רק את התוצאה שהתקבלה, ואם לא נשלח — אמור שלא נשלח.",
    "- דיווח על שליחת אימיילים וקבצים: לעולם אל תטען שנשלחו קבצים במייל, ולעולם אל תאשר שהשליחה כללה את כל קבצי התיק, אלא אם בדקת במפורש את רשומת השליחה המאומתת ב-claims_history או ב-claims_gmail_outbox ווידאת את רשימת הקבצים שנשלחו (files, verified_count, requested_count). אם נשלחו פחות קבצים ממה שהתבקש או אם נשלח רק חלק מקבצי התיק, חובה לדווח במפורש ובמדויק: 'נשלחו רק X מתוך Y קבצים...'. חל איסור מוחלט לנחש או להניח שכל קבצי התיק נשלחו!",
    "- כשכלי מסמך מחזיר document_read, ענה רק מתוך text ו-evidence שלו וציין את המקור. כשמפנים למסמך, השתמש ב-title שלו כשם המסמך. אם needs_review הוא true, אמור שהמסמך דורש בדיקה. אם status הוא unreadable, pending, processing או failed, אמור שהקובץ לא נקרא ואל תנחש. אל תשנה סטטוס ואל תשלח הודעה בגלל מסמך.",
    "- לפעולות כתיבה (שליחת מייל, יצירת קישור שיתוף, ביטול קישור, שינוי סטטוס, יצירת משימה, סגירת משימה, הוספת הערה) — השתמש תמיד בכלי ה-Preview המתאים. כלי ה-Preview יציג כרטיס אישור למשתמש.",
    "- הסבר בעברית ברורה מה הכנת עבור המשתמש, ובקש ממנו לאשר את הפעולה.",
  ].join("\n");
  return { text };
}

function bundlePendingActions(actions: ClaimsPendingAction[]): ClaimsPendingAction | null {
  if (actions.length === 0) return null;
  if (actions.length === 1) return actions[0];
  const emailActions = actions.filter((a) => a.action_type === "send_email");
  const isAllEmail = emailActions.length === actions.length;
  const scheduleActions = actions.filter((a) => a.action_type === "schedule_email");
  const isAllSchedule = scheduleActions.length === actions.length;

  const summary = isAllSchedule
    ? `תזמון קבוצה של ${actions.length} אימיילים לשליחה עתידית מאושרת לתיקים: ${actions.map((a) => String((a.parameters as any)?.claim_id || "כללי")).join(", ")}`
    : (isAllEmail
        ? `שליחת קבוצה של ${actions.length} אימיילים נפרדים לתיקים: ${actions.map((a) => String((a.parameters as any)?.claim_id || "כללי")).join(", ")}`
        : `ביצוע קבוצה של ${actions.length} פעולות מאושרות`);

  return {
    preview_id: `BATCH-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    summary,
    tool_name: isAllSchedule ? "batch_schedule_email" : (isAllEmail ? "batch_send_email" : "batch_action"),
    action_type: isAllSchedule ? "batch_schedule_email" : (isAllEmail ? "batch_send_email" : "batch_action"),
    parameters: {
      actions,
      count: actions.length,
    },
  };
}

const CLAIMS_TEMPERATURE = 0.2;

async function callGemini(
  apiKey: string,
  preferredModel: string,
  systemInstruction: string,
  messages: Array<{ role: string; content: string }>,
  tools?: unknown[],
  onToolCall?: (name: string, args: Record<string, unknown>) => Promise<{ result: unknown; preview?: ClaimsPendingAction }>,
  attachments?: Array<{ name: string; mime_type: string; data_base64?: string; file_id?: string; byte_size?: number }>,
  temperature = 0.65,
): Promise<{ text: string; model: string; pendingAction?: ClaimsPendingAction | null } | { error: string; status: number }> {
  const modelCandidates = Array.from(new Set([
    preferredModel,
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.7-flash",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
  ].filter(Boolean)));

  const initialContents: Array<any> = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || !m.content) continue;
    const role: "user" | "model" = m.role === "assistant" || m.role === "model" ? "model" : "user";
    const text = String(m.content).trim();
    if (!text) continue;
    const isLastUserTurn = (role === "user") && (i === messages.length - 1 || messages.slice(i + 1).every((rem) => rem.role !== "user"));

    const parts: Array<any> = [{ text }];
    if (isLastUserTurn && attachments && attachments.length > 0) {
      let attachmentNote = "\n[קבצים מצורפים על ידי המשתמש להודעה זו:\n";
      for (const att of attachments) {
        attachmentNote += `- ${att.name} (${att.mime_type}${att.file_id ? `, מזהה בתיק: ${att.file_id}` : ""})\n`;
        if (att.data_base64) {
          let mime = att.mime_type.toLowerCase();
          if (mime === "image/jpg") mime = "image/jpeg";
          const cleanBase64 = att.data_base64.replace(/^data:[^;]+;base64,/, "");
          if (["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mime)) {
            parts.push({
              inlineData: {
                mimeType: mime,
                data: cleanBase64,
              },
            });
          }
        }
      }
      attachmentNote += "]";
      parts[0].text += attachmentNote;
    }

    if (initialContents.length > 0 && initialContents[initialContents.length - 1].role === role && (!isLastUserTurn || !attachments || attachments.length === 0)) {
      initialContents[initialContents.length - 1].parts[0].text += `\n${text}`;
    } else {
      initialContents.push({ role, parts });
    }
  }

  if (initialContents.length === 0) {
    initialContents.push({ role: "user", parts: [{ text: "שלום" }] });
  } else if (initialContents[0].role === "model") {
    initialContents.unshift({ role: "user", parts: [{ text: "שלום" }] });
  }

  const attemptErrors: Array<{ model: string; status: number; text: string }> = [];

  for (const model of modelCandidates) {
    try {
      const contents = JSON.parse(JSON.stringify(initialContents));
      let maxTurns = 8;
      let accumulatedPendingActions: ClaimsPendingAction[] = [];
      let modelResponded = false;
      let lastCandidateData: any = null;
      let passTools = tools && tools.length > 0;
      let totalToolCalls = 0;
      let hasComprehensiveReport = false;
      let lastReportTable: string | null = null;
      let lastReportTitle: string | null = null;
      let lastReportExpectedCount = 0;
      const turnStartTime = Date.now();

      while (maxTurns > 0) {
        maxTurns--;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
        const payload: Record<string, unknown> = {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: {
            temperature,
            maxOutputTokens: 8192,
          },
        };
        if (passTools) {
          payload.tools = tools;
        }

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error(`Gemini error with model ${model} (${res.status}):`, errText.slice(0, 250));
          attemptErrors.push({ model, status: res.status, text: errText.slice(0, 200) });
          if (res.status === 429) {
            return { error: "מגבלת בקשות, נסה שוב בעוד דקה", status: 429 };
          }
          if (res.status === 401 || res.status === 403) {
            return { error: `שגיאת הרשאה בחיבור ל-Gemini (${res.status})`, status: res.status };
          }
          break; // Try next model candidate
        }

        const data = await res.json();
        const candidate = data.candidates?.[0];
        lastCandidateData = candidate || data;
        const parts = candidate?.content?.parts || [];

        const functionCallParts = parts.filter((p: any) => p.functionCall);
        if (functionCallParts.length > 0 && onToolCall) {
          const responseParts: any[] = [];
          for (const fcp of functionCallParts) {
            const fc = fcp.functionCall;
            const fnName = fc.name;
            const fnArgs = fc.args || {};
            totalToolCalls++;
            if (fnName === "get_claims_status_report") {
              hasComprehensiveReport = true;
            }

            const toolRes = await onToolCall(fnName, fnArgs);
            if (toolRes && typeof toolRes === "object" && toolRes.preview) {
              accumulatedPendingActions.push(toolRes.preview);
            }

            if (fnName === "get_claims_status_report") {
              const resObj = toolRes && typeof toolRes === "object" && "result" in toolRes ? (toolRes as any).result : toolRes;
              if (resObj?.markdown_table) {
                lastReportTable = String(resObj.markdown_table);
                lastReportTitle = String(resObj.title || "");
                lastReportExpectedCount = Number(resObj.total_claims || (resObj.claims ? resObj.claims.length : 0));
              }
            }

            responseParts.push({
              functionResponse: {
                name: fnName,
                response: { result: toolRes && "result" in toolRes ? toolRes.result : toolRes },
              },
            });
          }

          // Push model turn preserving exact thoughtSignature
          contents.push({
            role: "model",
            parts: functionCallParts,
          });

          // The tool result goes back as a user turn: the API rejects role 'function' (400 INVALID_ARGUMENT).
          contents.push({
            role: "user",
            parts: responseParts,
          });

          // Guard against runaway tool loops or slow sequential requests
          if (hasComprehensiveReport || totalToolCalls >= 5 || (Date.now() - turnStartTime > 30000)) {
            passTools = false;
            contents.push({
              role: "user",
              parts: [{ text: `כל הנתונים הנדרשים נאספו בהצלחה מהמערכת. הצג את התשובה הסופית הכוללת כותרת "## ${lastReportTitle || "דוח סטטוס תביעות"}" ולאחר מכן את טבלת ה-Markdown המלאה של כל התיקים ללא השמטה.` }],
            });
          }
          continue;
        }

        // If there's an accumulated pending action and the model stopped or returned no text,
        // create a helpful default message
        const textParts = parts.filter((p: any) => !p.thought && typeof p.text === "string").map((p: any) => p.text);
        let text = textParts.join("").trim() || parts.map((p: any) => p.text || "").join("").trim();
        const finalPending = bundlePendingActions(accumulatedPendingActions);
        if (text) {
          if (lastReportTable && lastReportExpectedCount > 0) {
            const lines = text.split("\n");
            const dataRowLines = lines.filter((l) => /^\s*\|.*\|\s*$/.test(l) && !/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(l));
            const tableDataRowsCount = Math.max(0, dataRowLines.length - 1);
            if (tableDataRowsCount < lastReportExpectedCount) {
              const firstTblIdx = lines.findIndex((l) => /^\s*\|.*\|\s*$/.test(l));
              if (firstTblIdx !== -1) {
                let lastTblIdx = firstTblIdx;
                for (let idx = firstTblIdx; idx < lines.length; idx++) {
                  if (/^\s*\|.*\|\s*$/.test(lines[idx]) || lines[idx].trim() === "") {
                    lastTblIdx = idx;
                  } else {
                    break;
                  }
                }
                lines.splice(firstTblIdx, lastTblIdx - firstTblIdx + 1, lastReportTable);
                text = lines.join("\n");
              } else {
                text = `${text}\n\n${lastReportTable}`;
              }
            }
          }
          modelResponded = true;
          return { text, model, pendingAction: finalPending };
        } else if (finalPending) {
          modelResponded = true;
          return {
            text: `הכנתי עבורך תצוגה מקדימה לפעולה: ${finalPending.summary}. אנא אשר או בטל את הפעולה בכרטיס המצורף.`,
            model,
            pendingAction: finalPending,
          };
        }
      }

      const finalPending = bundlePendingActions(accumulatedPendingActions);
      if (!modelResponded && finalPending) {
        modelResponded = true;
        return {
          text: `הכנתי עבורך תצוגה מקדימה לפעולה: ${finalPending.summary}. אנא אשר או בטל את הפעולה בכרטיס המצורף.`,
          model,
          pendingAction: finalPending,
        };
      }

      if (modelResponded) break;
      attemptErrors.push({ model, status: 200, text: `No text after turns: ${JSON.stringify(lastCandidateData).slice(0, 200)}` });
    } catch (e) {
      console.error(`Gemini network error with model ${model}:`, e);
      attemptErrors.push({ model, status: 500, text: e instanceof Error ? e.message : String(e) });
    }
  }

  console.error("Gemini all candidates failed:", attemptErrors);
  return { error: "שגיאה בתקשורת עם שירות ה-AI. אנא נסה שוב בעוד מספר שניות.", details: attemptErrors, status: 500 };
}

function convertGeminiPropToAnthropic(v: any): any {
  if (!v || typeof v !== "object") return { type: "string" };
  const rawType = String(v.type || "STRING").toLowerCase();
  if (rawType === "array") {
    const itemSchema = v.items ? convertGeminiPropToAnthropic(v.items) : { type: "string" };
    return {
      type: "array",
      description: v.description || "",
      items: itemSchema,
    };
  }
  if (rawType === "object") {
    const props: Record<string, any> = {};
    if (v.properties && typeof v.properties === "object") {
      for (const [pk, pv] of Object.entries(v.properties)) {
        props[pk] = convertGeminiPropToAnthropic(pv);
      }
    }
    const res: any = {
      type: "object",
      description: v.description || "",
      properties: props,
    };
    if (Array.isArray(v.required) && v.required.length > 0) {
      res.required = Array.from(new Set(v.required));
    }
    return res;
  }
  return {
    type: rawType === "number" ? "number" : rawType === "boolean" ? "boolean" : "string",
    description: v.description || "",
  };
}

function geminiToolsToAnthropic(geminiTools?: unknown[]): any[] {
  if (!geminiTools || !Array.isArray(geminiTools)) return [];
  const result: any[] = [];
  for (const item of geminiTools) {
    const group = item as { functionDeclarations?: Array<{ name: string; description?: string; parameters?: { type?: string; properties?: Record<string, any>; required?: string[] } }> };
    for (const fn of (group.functionDeclarations || [])) {
      const tool: any = {
        name: fn.name,
        description: fn.description || "",
        input_schema: {
          type: "object",
          properties: {},
        },
      };
      if (fn.parameters && fn.parameters.properties && Object.keys(fn.parameters.properties).length > 0) {
        const props: Record<string, any> = {};
        for (const [k, v] of Object.entries(fn.parameters.properties as Record<string, any>)) {
          props[k] = convertGeminiPropToAnthropic(v);
        }
        tool.input_schema.properties = props;
        if (Array.isArray(fn.parameters.required) && fn.parameters.required.length > 0) {
          tool.input_schema.required = Array.from(new Set(fn.parameters.required));
        }
      }
      result.push(tool);
    }
  }
  return result;
}

async function callClaude(
  apiKey: string,
  preferredModel: string,
  systemInstruction: string,
  messages: Array<{ role: string; content: string }>,
  geminiTools?: unknown[],
  onToolCall?: (name: string, args: Record<string, unknown>) => Promise<{ result: unknown; preview?: ClaimsPendingAction }>,
  attachments?: Array<{ name: string; mime_type: string; data_base64?: string; file_id?: string; byte_size?: number }>,
  _temperature = 0.65,
): Promise<{ text: string; model: string; pendingAction?: ClaimsPendingAction | null } | { error: string; status: number }> {
  const modelCandidates = Array.from(new Set([
    "claude-haiku-5-5",
    preferredModel,
    "claude-sonnet-5-5",
  ].filter(Boolean)));

  const anthropicTools = geminiToolsToAnthropic(geminiTools);

  const initialClaudeMessages: Array<{ role: "user" | "assistant"; content: any }> = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || !m.content) continue;
    const role: "user" | "assistant" = m.role === "assistant" || m.role === "model" ? "assistant" : "user";
    const text = String(m.content).trim();
    if (!text) continue;
    const isLastUserTurn = (role === "user") && (i === messages.length - 1 || messages.slice(i + 1).every((rem) => rem.role !== "user"));

    if (isLastUserTurn && attachments && attachments.length > 0) {
      let attachmentNote = `\n[קבצים מצורפים:\n`;
      const blocks: any[] = [];
      for (const att of attachments) {
        attachmentNote += `- ${att.name} (${att.mime_type}${att.file_id ? `, מזהה בתיק: ${att.file_id}` : ""})\n`;
        if (att.data_base64) {
          let mime = att.mime_type.toLowerCase();
          if (mime === "image/jpg") mime = "image/jpeg";
          const cleanBase64 = att.data_base64.replace(/^data:[^;]+;base64,/, "");
          if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime)) {
            blocks.push({
              type: "image",
              source: {
                type: "base64",
                media_type: mime,
                data: cleanBase64,
              },
            });
          } else if (mime === "application/pdf") {
            blocks.push({
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: cleanBase64,
              },
            });
          }
        }
      }
      attachmentNote += `]`;
      blocks.unshift({ type: "text", text: `${text}${attachmentNote}` });
      initialClaudeMessages.push({ role: "user", content: blocks });
    } else {
      if (initialClaudeMessages.length > 0 && initialClaudeMessages[initialClaudeMessages.length - 1].role === role && typeof initialClaudeMessages[initialClaudeMessages.length - 1].content === "string") {
        initialClaudeMessages[initialClaudeMessages.length - 1].content += `\n${text}`;
      } else {
        initialClaudeMessages.push({ role, content: text });
      }
    }
  }

  if (initialClaudeMessages.length === 0) {
    initialClaudeMessages.push({ role: "user", content: "שלום" });
  } else if (initialClaudeMessages[0].role === "assistant") {
    initialClaudeMessages.unshift({ role: "user", content: "שלום" });
  }

  const attemptErrors: Array<{ model: string; status: number; text: string }> = [];

  for (const model of modelCandidates) {
    try {
      const claudeMessages = JSON.parse(JSON.stringify(initialClaudeMessages));
      let maxTurns = 8;
      let accumulatedPendingActions: ClaimsPendingAction[] = [];
      let modelResponded = false;
      let httpFailed = false;
      let passTools = anthropicTools && anthropicTools.length > 0;
      let totalToolCalls = 0;
      let hasComprehensiveReport = false;
      let lastReportTable: string | null = null;
      let lastReportTitle: string | null = null;
      let lastReportExpectedCount = 0;
      const turnStartTime = Date.now();

      while (maxTurns > 0) {
        maxTurns--;
        // No `temperature`: current Claude models reject it (400 "temperature is deprecated").
        const payload: Record<string, unknown> = {
          model,
          max_tokens: 8192,
          system: systemInstruction,
          messages: claudeMessages,
        };
        if (passTools) {
          payload.tools = anthropicTools;
        }

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error(`Claude error with model ${model} (${res.status}):`, errText);
          attemptErrors.push({ model, status: res.status, text: errText, tool43: anthropicTools[43], toolCount: anthropicTools.length });
          httpFailed = true;
          break;
        }

        const data = await res.json();
        const contentBlocks = Array.isArray(data.content) ? data.content : [];
        const toolUseBlocks = contentBlocks.filter((b: any) => b.type === "tool_use");

        if (toolUseBlocks.length > 0 && onToolCall) {
          claudeMessages.push({
            role: "assistant",
            content: contentBlocks,
          });

          const toolResults: any[] = [];
          for (const tub of toolUseBlocks) {
            totalToolCalls++;
            if (tub.name === "get_claims_status_report") {
              hasComprehensiveReport = true;
            }

            const toolRes = await onToolCall(tub.name, (tub.input as Record<string, unknown>) || {});
            if (toolRes && typeof toolRes === "object" && toolRes.preview) {
              accumulatedPendingActions.push(toolRes.preview);
            }

            if (tub.name === "get_claims_status_report") {
              const resObj = toolRes && typeof toolRes === "object" && "result" in toolRes ? (toolRes as any).result : toolRes;
              if (resObj?.markdown_table) {
                lastReportTable = String(resObj.markdown_table);
                lastReportTitle = String(resObj.title || "");
                lastReportExpectedCount = Number(resObj.total_claims || (resObj.claims ? resObj.claims.length : 0));
              }
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: tub.id,
              content: JSON.stringify(toolRes && "result" in toolRes ? toolRes.result : toolRes),
            });
          }

          claudeMessages.push({
            role: "user",
            content: toolResults,
          });

          // Guard against runaway tool loops or slow sequential requests
          if (hasComprehensiveReport || totalToolCalls >= 5 || (Date.now() - turnStartTime > 30000)) {
            passTools = false;
            claudeMessages.push({
              role: "user",
              content: [{ type: "text", text: `כל הנתונים הנדרשים נאספו בהצלחה מהמערכת. הצג את התשובה הסופית הכוללת כותרת "## ${lastReportTitle || "דוח סטטוס תביעות"}" ולאחר מכן את טבלת ה-Markdown המלאה של כל התיקים ללא השמטה.` }],
            });
          }
          continue;
        }

        const textParts = contentBlocks
          .filter((b: any) => b.type === "text" && typeof b.text === "string")
          .map((b: any) => b.text);
        let text = textParts.join("").trim();
        const finalPending = bundlePendingActions(accumulatedPendingActions);

        if (text) {
          if (lastReportTable && lastReportExpectedCount > 0) {
            const lines = text.split("\n");
            const dataRowLines = lines.filter((l) => /^\s*\|.*\|\s*$/.test(l) && !/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(l));
            const tableDataRowsCount = Math.max(0, dataRowLines.length - 1);
            if (tableDataRowsCount < lastReportExpectedCount) {
              const firstTblIdx = lines.findIndex((l) => /^\s*\|.*\|\s*$/.test(l));
              if (firstTblIdx !== -1) {
                let lastTblIdx = firstTblIdx;
                for (let idx = firstTblIdx; idx < lines.length; idx++) {
                  if (/^\s*\|.*\|\s*$/.test(lines[idx]) || lines[idx].trim() === "") {
                    lastTblIdx = idx;
                  } else {
                    break;
                  }
                }
                lines.splice(firstTblIdx, lastTblIdx - firstTblIdx + 1, lastReportTable);
                text = lines.join("\n");
              } else {
                text = `${text}\n\n${lastReportTable}`;
              }
            }
          }
          modelResponded = true;
          return { text, model, pendingAction: finalPending };
        } else if (finalPending) {
          modelResponded = true;
          return {
            text: `הכנתי עבורך תצוגה מקדימה לפעולה: ${finalPending.summary}. אנא אשר או בטל את הפעולה בכרטיס המצורף.`,
            model,
            pendingAction: finalPending,
          };
        }
      }

      const finalPending = bundlePendingActions(accumulatedPendingActions);
      if (!modelResponded && finalPending) {
        return {
          text: `הכנתי עבורך תצוגה מקדימה לפעולה: ${finalPending.summary}. אנא אשר או בטל את הפעולה בכרטיס המצורף.`,
          model,
          pendingAction: finalPending,
        };
      }
      if (!httpFailed) attemptErrors.push({ model, status: 200, text: "No response text" });
    } catch (e) {
      console.error(`Claude network error with model ${model}:`, e);
      attemptErrors.push({ model, status: 500, text: e instanceof Error ? e.message : String(e) });
    }
  }

  console.error("Claude all candidates failed:", attemptErrors);
  return { error: "שגיאה בתקשורת עם שירות ה-AI. אנא נסה שוב בעוד מספר שניות.", details: attemptErrors, status: 500 };
}

function streamTextAsSse(replyText: string, pendingAction?: ClaimsPendingAction | null, documentCards: ClaimsDocumentCard[] = [], toolsUsed: ToolTrace[] | null = null): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const words = replyText.split(" ");
        for (let i = 0; i < words.length; i++) {
          const piece = (i === 0 ? "" : " ") + words[i];
          const isLast = i === words.length - 1;
          const payload = JSON.stringify({
            choices: [{ delta: { content: piece } }],
            ...(isLast && pendingAction ? { pending_action: pendingAction } : {}),
            ...(isLast && documentCards.length ? { document_cards: documentCards } : {}),
            ...(isLast && toolsUsed ? { tools_used: toolsUsed } : {}),
          });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          if (i % 2 === 0 && i < words.length - 1) {
            await new Promise((r) => setTimeout(r, 10));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAuth(req);
    if ("error" in auth) return auth.error;
    const { ctx } = auth;

    const body = await req.json();
    const effectiveClaimId = String(body.claim_id || body.claimId || "").trim();
    const effectivePageContext = String(body.page_context || body.pageContext || "").trim();
    const effectiveModule = String(body.module || "").trim();
    const { action, messages, company_name, pending_action, conversation_id, attachments } = body;

    const supabase = ctx.supabaseUser;
    const userId = ctx.user.id;
    const actorName = String(ctx.user.user_metadata?.full_name || ctx.user.email || "משתמש מערכת");
    const authHeader = req.headers.get("Authorization") || "";

    // Action 1: Execute Pending Action (confirmed by user)
    if (action === "execute_pending_action") {
      if (!pending_action || !pending_action.action_type) {
        return new Response(JSON.stringify({ error: "Missing pending_action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const claimTarget = String(effectiveClaimId || pending_action?.parameters?.claim_id || "");
      const execResult = await executeClaimsPendingAction(
        supabase,
        claimTarget,
        userId,
        actorName,
        pending_action,
      );
      return new Response(JSON.stringify(execResult), {
        status: execResult.success ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action 2: Cancel Pending Action (rejected by user)
    if (action === "cancel_pending_action") {
      const claimTarget = String(effectiveClaimId || pending_action?.parameters?.claim_id || "");
      await recordAiAudit(supabase, {
        userId,
        userName: actorName,
        claimId: claimTarget || null,
        conversationId: conversation_id || null,
        toolName: pending_action?.tool_name || "unknown",
        actionType: pending_action?.action_type || "unknown",
        previewSummary: pending_action?.summary || "בוטל ע''י המשתמש",
        executionAction: "cancel",
        status: "cancelled",
      });
      return new Response(JSON.stringify({ success: true, message: "הפעולה בוטלה" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }



    const GEMINI_API_KEY = (Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY") || "").trim();
    const GEMINI_MODEL = (Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash").trim();
    const OPENAI_API_KEY = (Deno.env.get("OPENAI_API_KEY") || "").trim();
    const CLAUDE_API_KEY = (Deno.env.get("CLAUDE_API_KEY") || Deno.env.get("ANTHROPIC_API_KEY") || "").trim();

    // Chat processing
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!GEMINI_API_KEY) {
      throw new Error("AI service is not configured (missing GEMINI_API_KEY)");
    }

    const companyScope = resolveCompanyScope(ctx, company_name);
    const claimId = effectiveClaimId;
    const userMessagesText = (messages || []).map((m: any) => typeof m?.content === "string" ? m.content : "").join(" ");
    const hasClaimsIntent = /DAL-\d{4}-\d+|תביע|פתיחת תיק|חבילת פתיח|חבילה|קישור|מסמכ|טופס|טפסים/i.test(userMessagesText);
    const isClaimsModule = effectiveModule === "claims" || !!claimId || hasClaimsIntent;

    let claimBlock = "";
    if (claimId) {
      const loaded = await loadClaimsContext(supabase, claimId);
      if ("error" in loaded) {
        return new Response(JSON.stringify({ error: loaded.message }), {
          status: loaded.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      claimBlock = loaded.text;
    } else if (isClaimsModule) {
      claimBlock = `--- מצב ניהול תביעות כללי (Claims General) ---
המשתמש נמצא בצ'אט הכללי או במסך הראשי של ניהול תביעות (ללא תיק פתוח).
התפקיד שלך הוא לספק מידע וסטטיסטיקות על כלל תיקי התביעות, סיכומי סטטוסים, תביעות שנפתחו היום, מיילים נכנסים ויוצאים, משימות פתוחות, איתור ובדיקת קישורי לקוח פעילים (get_customer_link_status), חבילות פתיחת תיק (list_available_claim_documents_and_forms / preview_send_customer_link) וחיפוש תביעות.
השתמש בכלים הייעודיים כדי לקבל נתונים מדויקים ואמיתיים בלבד. אל תנחש נתונים.`;
    }

    const basePrompt = companyScope
      ? `${SYSTEM_PROMPT}\n\nהמשתמש משויך לחברה: "${companyScope}".`
      : SYSTEM_PROMPT;

    const claimsPrompt = claimId ? CLAIMS_SYSTEM_PROMPT_INSTRUCTIONS : CLAIMS_GENERAL_SYSTEM_PROMPT_INSTRUCTIONS;

    // Relative dates ("tomorrow") need today's date in Israel.
    const todayIsrael = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

    const fullSysPrompt = [
      isClaimsModule ? claimsPrompt : basePrompt,
      isClaimsModule ? `--- תאריך ---\nהיום (שעון ישראל): ${todayIsrael} · ${todayIso}. חשב "מחר", "בעוד שבוע" וכו׳ לפי תאריך זה.` : "",
      effectivePageContext ? `--- הקשר מסך נוכחי ---\n${effectivePageContext}` : "",
      claimBlock ? `--- הקשר מודול ניהול תביעות ---\n${claimBlock}` : "",
    ].filter(Boolean).join("\n\n");

    const tools = isClaimsModule
      ? (claimId ? CLAIMS_GEMINI_TOOLS : CLAIMS_GENERAL_GEMINI_TOOLS)
      : FLEET_GEMINI_TOOLS;

    // Document cards go to the chat screen only; the model gets the tool result without them.
    const documentCards: ClaimsDocumentCard[] = [];
    // Tools that actually ran in this answer and how each ended — shown to the user under the answer.
    const toolsUsed: ToolTrace[] = [];
    const onToolCall = async (toolName: string, toolArgs: Record<string, unknown>) => {
      if (isClaimsModule) {
        let res: { result: unknown; preview?: ClaimsPendingAction; card?: ClaimsDocumentCard };
        try {
          res = claimId
            ? await executeClaimsTool(toolName, toolArgs, supabase, claimId, userId, actorName, attachments)
            : await executeClaimsGeneralTool(toolName, toolArgs, supabase, userId, actorName, attachments);
        } catch (e) {
          addTrace(toolsUsed, toolName, "failed");
          return { result: { error: e instanceof Error ? e.message : "tool_failed" } };
        }
        addTrace(toolsUsed, toolName, toolOutcome(res.result, !!res.preview));
        if (res.card && !documentCards.some((c) => c.file_id === res.card!.file_id)) documentCards.push(res.card);
        return { result: res.result, preview: res.preview };
      }
      const fleetRes = await executeFleetTool(toolName, toolArgs, supabase, companyScope);
      return { result: fleetRes };
    };

    // Claims answers stay close to the tool results (fewer invented details).
    const temperature = isClaimsModule ? CLAIMS_TEMPERATURE : 0.65;
    const geminiResult = await callGemini(
      GEMINI_API_KEY,
      GEMINI_MODEL,
      fullSysPrompt,
      messages,
      tools,
      onToolCall,
      attachments,
      temperature,
    );

    let finalResult = geminiResult;
    if ("error" in finalResult && CLAUDE_API_KEY) {
      console.warn("Gemini call returned error, falling back to Claude:", finalResult.error);
      const claudeResult = await callClaude(
        CLAUDE_API_KEY,
        "claude-haiku-5-5",
        fullSysPrompt,
        messages,
        tools,
        onToolCall,
        attachments,
        temperature,
      );
      if (!("error" in claudeResult)) {
        finalResult = claudeResult;
      } else {
        finalResult = {
          error: "שגיאה בתקשורת עם שירות ה-AI. אנא נסה שוב בעוד מספר שניות.",
          details: {
            gemini: (geminiResult as any).details,
            claude: (claudeResult as any).details,
          },
          status: 500,
        };
      }
    }

    if ("error" in finalResult) {
      return new Response(JSON.stringify({ error: finalResult.error, details: (finalResult as any).details }), {
        status: finalResult.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return streamTextAsSse(finalResult.text, finalResult.pendingAction, documentCards, isClaimsModule ? toolsUsed : null);
  } catch (e) {
    console.error("help-ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
