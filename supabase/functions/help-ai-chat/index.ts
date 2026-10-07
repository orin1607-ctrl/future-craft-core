import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { edgeCorsHeaders, requireAuth, resolveCompanyScope } from "../_shared/edgeAuth.ts";

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

const DATA_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_vehicles_stats",
      description: "סטטיסטיקת רכבים: סך הכל, לפי סטטוס, רכבים עם טסט/ביטוח שעומדים לפוג",
      parameters: {
        type: "object",
        properties: {
          company_name: { type: "string", description: "סנן לפי שם חברה" },
          days_until_expiry: { type: "number", description: "כמה ימים קדימה לבדוק תפוגות (ברירת מחדל 30)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_drivers_stats",
      description: "סטטיסטיקת נהגים: סך הכל, פעילים, רישיונות שעומדים לפוג",
      parameters: {
        type: "object",
        properties: {
          company_name: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_faults_stats",
      description: "סטטיסטיקת תקלות: לפי סטטוס, דחיפות, תקופה אחרונה",
      parameters: {
        type: "object",
        properties: {
          company_name: { type: "string" },
          days: { type: "number", description: "מספר ימים אחורה (ברירת מחדל 7)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_accidents_stats",
      description: "סטטיסטיקת תאונות: סך הכל ולפי תקופה",
      parameters: {
        type: "object",
        properties: {
          company_name: { type: "string" },
          days: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_service_orders_stats",
      description: "סטטיסטיקת הזמנות שירות: ממתינות, בטיפול, הושלמו",
      parameters: {
        type: "object",
        properties: {
          company_name: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_expenses_stats",
      description: "סיכום הוצאות לפי קטגוריה ותקופה",
      parameters: {
        type: "object",
        properties: {
          company_name: { type: "string" },
          days: { type: "number", description: "מספר ימים אחורה (ברירת מחדל 30)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_alerts_count",
      description: "מספר התראות פעילות במערכת",
      parameters: {
        type: "object",
        properties: { company_name: { type: "string" } },
      },
    },
  },
];

async function executeToolCall(
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
        const recent = (data || []).filter(f => new Date(f.created_at) >= cutoff);
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
        const recent = (data || []).filter(a => new Date(a.created_at) >= cutoff);
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
        const recent = (data || []).filter(e => e.date && new Date(e.date) >= cutoff);
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
        const active = (data || []).filter(a => a.is_active);
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
    "הנחיות חשובות:",
    "- כששואלים 'על איזה תיק אני עובד עכשיו?' או שאלות דומות על התיק הפתוח, ענה במפורש בעברית עם פרטי התיק הפתוח (מספר תביעה, רכב, לקוח, חברת ביטוח וסטטוס).",
    "- אין בשלב הזה כלי כתיבה. אל תשלח מייל, אל תשנה סטטוס, ואל תסגור משימה.",
    "- אם מתבקשת פעולת כתיבה — תאר מה היה עומד לקרות ובקש אישור. אל תבצע.",
    "- חיפוש מיילים, מסמכים ותמונות מתוך התיק עדיין לא מחובר ישירות לצ'אט. אם שואלים עליהם, אמור זאת במפורש ואל תמציא תוכן.",
  ].join("\n");
  return { text };
}

const CHAT_MODELS = [
  "google/gemini-3.8-flash",
  "google/gemini-3.7-flash",
  "google/gemini-3.6-flash",
  "google/gemini-2.5-flash",
  "google/gemini-3-flash-preview",
];

function gatewayFailure(status: number, text: string): { error: string; status: number } {
  let detail = "";
  try {
    const parsed = JSON.parse(text);
    detail = String(parsed?.error?.message || parsed?.message || parsed?.error || "");
  } catch {
    detail = text;
  }
  detail = detail.replace(/sk-[A-Za-z0-9_\-]+/g, "[key]").replace(/sbp_[A-Za-z0-9]+/g, "[key]").slice(0, 160);
  if (status === 429) return { error: "מגבלת בקשות, נסה שוב בעוד דקה", status: 429 };
  if (status === 402) return { error: "נדרש תשלום - יש להוסיף קרדיטים ל-Lovable AI", status: 402 };
  return { error: `שגיאה בשירות AI (${status}${detail ? `: ${detail}` : ""})`, status: status === 401 || status === 403 ? status : 500 };
}

async function callGemini(
  apiKey: string,
  preferredModel: string,
  systemInstruction: string,
  messages: Array<{ role: string; content: string }>,
): Promise<{ text: string; model: string } | { error: string; status: number }> {
  const modelCandidates = Array.from(new Set([
    preferredModel,
    "gemini-3.8-flash",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
  ].filter(Boolean)));

  const contents: Array<{ role: "user" | "model"; parts: [{ text: string }] }> = [];
  for (const m of messages) {
    if (!m || !m.content) continue;
    const role: "user" | "model" = m.role === "assistant" || m.role === "model" ? "model" : "user";
    const text = String(m.content).trim();
    if (!text) continue;
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += `\n${text}`;
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }

  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: "שלום" }] });
  } else if (contents[0].role === "model") {
    contents.unshift({ role: "user", parts: [{ text: "שלום" }] });
  }

  let lastError = { error: "שגיאה בתקשורת עם Gemini", status: 500 };

  for (const model of modelCandidates) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: {
            temperature: 0.65,
            maxOutputTokens: 2048,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
        if (text) {
          return { text, model };
        }
      }

      const errText = await res.text();
      console.error(`Gemini error with model ${model} (${res.status}):`, errText.slice(0, 200));

      if (res.status === 429) {
        return { error: "מגבלת בקשות, נסה שוב בעוד דקה", status: 429 };
      }
      if (res.status === 401 || res.status === 403) {
        return { error: `שגיאת הרשאה בחיבור ל-Gemini (${res.status})`, status: res.status };
      }
      lastError = { error: `שגיאה בשירות Gemini (${res.status})`, status: res.status >= 400 && res.status < 500 ? res.status : 500 };
    } catch (e) {
      console.error(`Gemini network error with model ${model}:`, e);
      lastError = { error: e instanceof Error ? e.message : "שגיאת רשת בחיבור ל-Gemini", status: 500 };
    }
  }

  return lastError;
}

function streamTextAsSse(replyText: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const words = replyText.split(" ");
        for (let i = 0; i < words.length; i++) {
          const piece = (i === 0 ? "" : " ") + words[i];
          const payload = JSON.stringify({
            choices: [{ delta: { content: piece } }],
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

    const { messages, company_name, page_context, claim_id, module } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages array is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = (Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY") || "").trim();
    const GEMINI_MODEL = (Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash").trim();
    const LOVABLE_API_KEY = (Deno.env.get("LOVABLE_API_KEY") || "").trim();

    if (!GEMINI_API_KEY && !LOVABLE_API_KEY) {
      throw new Error("AI service is not configured (missing GEMINI_API_KEY)");
    }

    const supabase = ctx.supabaseUser;
    const companyScope = resolveCompanyScope(ctx, company_name);

    const sysPrompt = companyScope
      ? `${SYSTEM_PROMPT}\n\nהמשתמש משויך לחברה: "${companyScope}". כשאתה קורא לפונקציות נתונים, סנן תמיד לפי החברה הזו.`
      : SYSTEM_PROMPT;

    const claimId = typeof claim_id === "string" ? claim_id.trim() : "";
    let claimBlock = "";
    if (claimId) {
      const loaded = await loadClaimsContext(supabase, claimId);
      if ("error" in loaded) {
        return new Response(JSON.stringify({ error: loaded.message }), {
          status: loaded.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      claimBlock = loaded.text;
    } else if (module === "claims") {
      claimBlock = "המשתמש במודול ניהול תביעות ואין תיק פתוח כרגע. אל תניח פרטים של תיק קודם. אם השאלה היא על מייל, מסמך, תמונה או פרטי תיק ספציפי — בקש לפתוח את התיק.";
    }

    const fullSysPrompt = [
      sysPrompt,
      page_context ? `--- הקשר מסך נוכחי ---\n${page_context}` : "",
      claimBlock ? `--- תיק פתוח (נטען בשרת לפי הרשאת המשתמש) ---\n${claimBlock}` : "",
    ].filter(Boolean).join("\n\n");

    // Primary: Google Gemini
    if (GEMINI_API_KEY) {
      const geminiResult = await callGemini(GEMINI_API_KEY, GEMINI_MODEL, fullSysPrompt, messages);
      if ("error" in geminiResult) {
        // If Gemini failed and Lovable key is available, try Lovable
        if (!LOVABLE_API_KEY) {
          return new Response(JSON.stringify({ error: geminiResult.error }), {
            status: geminiResult.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        return streamTextAsSse(geminiResult.text);
      }
    }

    // Secondary / fallback: Lovable AI Gateway
    const chatMessages = [{ role: "system", content: fullSysPrompt }, ...messages];
    const opened = await openGatewayChat(LOVABLE_API_KEY, chatMessages);
    if ("error" in opened) {
      return new Response(JSON.stringify({ error: opened.error }), {
        status: opened.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { firstResponse, model, withTools } = opened;

    const firstResult = await firstResponse.json();
    const firstChoice = firstResult.choices?.[0];

    if (firstChoice?.finish_reason === "tool_calls" || firstChoice?.message?.tool_calls?.length > 0) {
      const toolCalls = firstChoice.message.tool_calls;
      const toolResults = [];
      for (const tc of toolCalls) {
        const args = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments;
        const result = await executeToolCall(tc.function.name, args, supabase, companyScope);
        toolResults.push({ role: "tool", tool_call_id: tc.id, content: result });
      }

      const secondResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: fullSysPrompt },
            ...messages,
            firstChoice.message,
            ...toolResults,
          ],
          stream: true,
        }),
      });
      if (!secondResponse.ok) {
        const failed = gatewayFailure(secondResponse.status, await secondResponse.text());
        return new Response(JSON.stringify({ error: failed.error }), {
          status: failed.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(secondResponse.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    const streamResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: fullSysPrompt }, ...messages],
        ...(withTools ? { tools: DATA_TOOLS } : {}),
        stream: true,
      }),
    });
    if (!streamResponse.ok) {
      const failed = gatewayFailure(streamResponse.status, await streamResponse.text());
      return new Response(JSON.stringify({ error: failed.error }), {
        status: failed.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(streamResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("help-ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
