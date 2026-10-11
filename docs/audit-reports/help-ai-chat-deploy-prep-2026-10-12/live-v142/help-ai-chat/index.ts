import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { edgeCorsHeaders, requireAuth, resolveCompanyScope } from "../_shared/edgeAuth.ts";
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
    "- לפעולות כתיבה (שליחת מייל, יצירת קישור שיתוף, ביטול קישור, שינוי סטטוס, יצירת משימה, סגירת משימה, הוספת הערה) — השתמש תמיד בכלי ה-Preview המתאים. כלי ה-Preview יציג כרטיס אישור למשתמש.",
    "- הסבר בעברית ברורה מה הכנת עבור המשתמש, ובקש ממנו לאשר את הפעולה.",
  ].join("\n");
  return { text };
}

async function callGemini(
  apiKey: string,
  preferredModel: string,
  systemInstruction: string,
  messages: Array<{ role: string; content: string }>,
  tools?: unknown[],
  onToolCall?: (name: string, args: Record<string, unknown>) => Promise<{ result: unknown; preview?: ClaimsPendingAction }>,
  attachments?: Array<{ name: string; mime_type: string; data_base64?: string; file_id?: string; byte_size?: number }>,
): Promise<{ text: string; model: string; pendingAction?: ClaimsPendingAction | null } | { error: string; status: number }> {
  const modelCandidates = Array.from(new Set([
    preferredModel,
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
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
      let maxTurns = 12;
      let accumulatedPendingAction: ClaimsPendingAction | null = null;
      let modelResponded = false;
      let lastCandidateData: any = null;

      while (maxTurns > 0) {
        maxTurns--;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
        const payload: Record<string, unknown> = {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: {
            temperature: 0.65,
            maxOutputTokens: 2048,
          },
        };
        if (tools && tools.length > 0) {
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

        const functionCallPart = parts.find((p: any) => p.functionCall);
        if (functionCallPart && onToolCall) {
          const fc = functionCallPart.functionCall;
          const fnName = fc.name;
          const fnArgs = fc.args || {};

          const toolRes = await onToolCall(fnName, fnArgs);
          if (toolRes && typeof toolRes === "object" && toolRes.preview) {
            accumulatedPendingAction = toolRes.preview;
          }

          // Push model turn preserving exact thoughtSignature
          contents.push({
            role: "model",
            parts: [functionCallPart],
          });

          // Push function response turn with role 'function'
          contents.push({
            role: "function",
            parts: [{
              functionResponse: {
                name: fnName,
                response: { result: toolRes && "result" in toolRes ? toolRes.result : toolRes },
              },
            }],
          });
          continue;
        }

        // If there's an accumulated pending action and the model stopped or returned no text,
        // create a helpful default message
        const textParts = parts.filter((p: any) => !p.thought && typeof p.text === "string").map((p: any) => p.text);
        const text = textParts.join("").trim() || parts.map((p: any) => p.text || "").join("").trim();
        if (text) {
          modelResponded = true;
          return { text, model, pendingAction: accumulatedPendingAction };
        } else if (accumulatedPendingAction) {
          modelResponded = true;
          return {
            text: `הכנתי עבורך תצוגה מקדימה לפעולה: ${accumulatedPendingAction.summary}. אנא אשר או בטל את הפעולה בכרטיס המצורף.`,
            model,
            pendingAction: accumulatedPendingAction,
          };
        }
      }

      if (!modelResponded && accumulatedPendingAction) {
        modelResponded = true;
        return {
          text: `הכנתי עבורך תצוגה מקדימה לפעולה: ${accumulatedPendingAction.summary}. אנא אשר או בטל את הפעולה בכרטיס המצורף.`,
          model,
          pendingAction: accumulatedPendingAction,
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
  return { error: "שגיאה בתקשורת עם שירות ה-AI. אנא נסה שוב בעוד מספר שניות.", status: 500 };
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
          const rawType = String(v.type || "STRING").toLowerCase();
          const propSchema: any = {
            type: rawType === "number" ? "number" : rawType === "boolean" ? "boolean" : rawType === "array" ? "array" : "string",
            description: v.description || "",
          };
          if (rawType === "array" && v.items) {
            propSchema.items = { type: String(v.items.type || "string").toLowerCase() };
          }
          props[k] = propSchema;
        }
        tool.input_schema.properties = props;
        if (Array.isArray(fn.parameters.required) && fn.parameters.required.length > 0) {
          tool.input_schema.required = fn.parameters.required;
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
): Promise<{ text: string; model: string; pendingAction?: ClaimsPendingAction | null } | { error: string; status: number }> {
  const modelCandidates = Array.from(new Set([
    "claude-haiku-5-5",
    preferredModel,
    "claude-3-5-haiku-20241022",
    "claude-3-haiku-20240307",
    "claude-3-5-sonnet-20241022",
    "claude-3-7-sonnet-20250219",
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
      let maxTurns = 10;
      let accumulatedPendingAction: ClaimsPendingAction | null = null;
      let modelResponded = false;

      while (maxTurns > 0) {
        maxTurns--;
        const payload: Record<string, unknown> = {
          model,
          max_tokens: 2048,
          system: systemInstruction,
          messages: claudeMessages,
        };
        if (anthropicTools && anthropicTools.length > 0) {
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
          console.error(`Claude error with model ${model} (${res.status}):`, errText.slice(0, 250));
          attemptErrors.push({ model, status: res.status, text: errText.slice(0, 200) });
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
            const toolRes = await onToolCall(tub.name, (tub.input as Record<string, unknown>) || {});
            if (toolRes && typeof toolRes === "object" && toolRes.preview) {
              accumulatedPendingAction = toolRes.preview;
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
          continue;
        }

        const textParts = contentBlocks
          .filter((b: any) => b.type === "text" && typeof b.text === "string")
          .map((b: any) => b.text);
        const text = textParts.join("").trim();

        if (text) {
          modelResponded = true;
          return { text, model, pendingAction: accumulatedPendingAction };
        } else if (accumulatedPendingAction) {
          modelResponded = true;
          return {
            text: `הכנתי עבורך תצוגה מקדימה לפעולה: ${accumulatedPendingAction.summary}. אנא אשר או בטל את הפעולה בכרטיס המצורף.`,
            model,
            pendingAction: accumulatedPendingAction,
          };
        }
      }

      if (!modelResponded && accumulatedPendingAction) {
        return {
          text: `הכנתי עבורך תצוגה מקדימה לפעולה: ${accumulatedPendingAction.summary}. אנא אשר או בטל את הפעולה בכרטיס המצורף.`,
          model,
          pendingAction: accumulatedPendingAction,
        };
      }
      attemptErrors.push({ model, status: 200, text: "No response text" });
    } catch (e) {
      console.error(`Claude network error with model ${model}:`, e);
      attemptErrors.push({ model, status: 500, text: e instanceof Error ? e.message : String(e) });
    }
  }

  console.error("Claude all candidates failed:", attemptErrors);
  return { error: "שגיאה בתקשורת עם שירות ה-AI. אנא נסה שוב בעוד מספר שניות.", status: 500 };
}

function streamTextAsSse(replyText: string, pendingAction?: ClaimsPendingAction | null): Response {
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
    const { action, messages, company_name, page_context, claim_id, module, pending_action, conversation_id, attachments } = body;

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
      const claimTarget = String(claim_id || pending_action?.parameters?.claim_id || "");
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
      const claimTarget = String(claim_id || pending_action?.parameters?.claim_id || "");
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
    const claimId = typeof claim_id === "string" ? claim_id.trim() : "";
    const isClaimsModule = module === "claims" || !!claimId;

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
המשתמש נמצא במסך הראשי של מודול ניהול תביעות (ללא תיק פתוח).
התפקיד שלך הוא לספק מידע וסטטיסטיקות על כלל תיקי התביעות, סיכומי סטטוסים, תביעות שנפתחו היום, מיילים נכנסים ויוצאים של היום, משימות פתוחות, חיפוש תביעות ותיקים שדורשים טיפול.
השתמש בכלים הייעודיים (get_claims_summary, count_claims, get_claims_by_status, get_claims_created_today, get_recent_claims, get_claims_needing_attention, get_open_tasks_summary, get_today_claim_activity, count_today_incoming_emails, count_today_outgoing_emails, get_today_claim_emails, get_unhandled_claim_emails, search_claims) כדי לקבל נתונים מדויקים ואמיתיים בלבד. אל תנחש נתונים.`;
    }

    const basePrompt = companyScope
      ? `${SYSTEM_PROMPT}\n\nהמשתמש משויך לחברה: "${companyScope}".`
      : SYSTEM_PROMPT;

    const claimsPrompt = claimId ? CLAIMS_SYSTEM_PROMPT_INSTRUCTIONS : CLAIMS_GENERAL_SYSTEM_PROMPT_INSTRUCTIONS;

    const fullSysPrompt = [
      isClaimsModule ? claimsPrompt : basePrompt,
      page_context ? `--- הקשר מסך נוכחי ---\n${page_context}` : "",
      claimBlock ? `--- הקשר מודול ניהול תביעות ---\n${claimBlock}` : "",
    ].filter(Boolean).join("\n\n");

    const tools = isClaimsModule
      ? (claimId ? CLAIMS_GEMINI_TOOLS : CLAIMS_GENERAL_GEMINI_TOOLS)
      : FLEET_GEMINI_TOOLS;

    const onToolCall = async (toolName: string, toolArgs: Record<string, unknown>) => {
      if (isClaimsModule && claimId) {
        return await executeClaimsTool(toolName, toolArgs, supabase, claimId, userId, actorName, attachments);
      }
      if (isClaimsModule && !claimId) {
        return await executeClaimsGeneralTool(toolName, toolArgs, supabase, userId, actorName, attachments);
      }
      const fleetRes = await executeFleetTool(toolName, toolArgs, supabase, companyScope);
      return { result: fleetRes };
    };

    const geminiResult = await callGemini(
      GEMINI_API_KEY,
      GEMINI_MODEL,
      fullSysPrompt,
      messages,
      tools,
      onToolCall,
      attachments,
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
      );
      if (!("error" in claudeResult)) {
        finalResult = claudeResult;
      } else {
        finalResult = {
          error: "שגיאה בתקשורת עם שירות ה-AI. אנא נסה שוב בעוד מספר שניות.",
          status: 500,
        };
      }
    }

    if ("error" in finalResult) {
      return new Response(JSON.stringify({ error: finalResult.error }), {
        status: finalResult.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return streamTextAsSse(finalResult.text, finalResult.pendingAction);
  } catch (e) {
    console.error("help-ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
