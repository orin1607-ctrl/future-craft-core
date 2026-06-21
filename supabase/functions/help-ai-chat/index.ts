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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAuth(req);
    if ("error" in auth) return auth.error;
    const { ctx } = auth;

    const { messages, company_name, page_context } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages array is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";

    if (!LOVABLE_API_KEY && !OPENAI_API_KEY) {
      throw new Error("AI is not configured (set LOVABLE_API_KEY or OPENAI_API_KEY)");
    }

    const useOpenAI = !LOVABLE_API_KEY && !!OPENAI_API_KEY;

    const supabase = ctx.supabaseUser;
    const companyScope = resolveCompanyScope(ctx, company_name);

    const sysPrompt = companyScope
      ? `${SYSTEM_PROMPT}\n\nהמשתמש משויך לחברה: "${companyScope}". כשאתה קורא לפונקציות נתונים, סנן תמיד לפי החברה הזו.`
      : SYSTEM_PROMPT;

    const fullSysPrompt = page_context
      ? `${sysPrompt}\n\n--- הקשר מסך נוכחי ---\n${page_context}`
      : sysPrompt;

    if (useOpenAI) {
      const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [{ role: "system", content: fullSysPrompt }, ...messages],
          stream: true,
          max_tokens: 1200,
          temperature: 0.65,
        }),
      });

      if (!openAiResponse.ok) {
        const t = await openAiResponse.text();
        console.error("OpenAI error:", openAiResponse.status, t);
        return new Response(JSON.stringify({ error: "שגיאה בשירות AI" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(openAiResponse.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    const firstResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: fullSysPrompt }, ...messages],
        tools: DATA_TOOLS,
        stream: false,
      }),
    });

    if (!firstResponse.ok) {
      if (firstResponse.status === 429) {
        return new Response(JSON.stringify({ error: "מגבלת בקשות, נסה שוב בעוד דקה" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (firstResponse.status === 402) {
        return new Response(JSON.stringify({ error: "נדרש תשלום - יש להוסיף קרדיטים ל-Lovable AI" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await firstResponse.text();
      console.error("AI gateway error:", firstResponse.status, t);
      return new Response(JSON.stringify({ error: "שגיאה בשירות AI" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
          model: "google/gemini-3-flash-preview",
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
        return new Response(JSON.stringify({ error: "שגיאה בשירות AI" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: fullSysPrompt }, ...messages],
        stream: true,
      }),
    });
    if (!streamResponse.ok) {
      return new Response(JSON.stringify({ error: "שגיאה בשירות AI" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
