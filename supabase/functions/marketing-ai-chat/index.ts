import { edgeCorsHeaders, requireAuth, jsonResponse } from "../_shared/edgeAuth.ts";

const corsHeaders = edgeCorsHeaders;

const MARKETING_ONLY = `אתה מנהל השיווק AI של CO.CO דליה (dalia-c.com).
ענה אך ורק על נושאי שיווק דיגיטלי: SEO, Google Search Console, Google Analytics, Google Business Profile, Google Ads, מחקר מילות מפתח, יצירת תוכן, דפי נחיתה, ניתוח מתחרים, אסטרטגיית שיווק, KPI שיווקיים.
אל תענה על ניהול צי, רכבים, נהגים, תקלות, לקוחות או מודולים אחרים של דליה — הפנה למערכת העזרה הכללית.
ענה בעברית, ברור, מקצועי. השתמש בנתונים שסופקו — אל תמציא מספרים.
כשמתאים, הוסף [[nav:SCREEN_ID]] לניווט (למשל [[nav:keywords]] [[nav:content]] [[nav:gbp]]).
מסכים: dashboard, keywords, content, strategy, seo, intel, competitors, gbp, ads, landing, pages, approval, briefing, usermanual.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAuth(req, { roles: ["super_admin"] });
    if ("error" in auth) return auth.error;

    const body = await req.json();
    const { prompt, system, history, module } = body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return jsonResponse({ ok: false, error: "empty_prompt" }, 400);
    }

    const apiKey = Deno.env.get("MARKETING_OPENAI_API_KEY") || Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return jsonResponse({ ok: false, error: "MARKETING_OPENAI_API_KEY is not configured" }, 500);
    }

    const model = Deno.env.get("MARKETING_OPENAI_MODEL") || Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
    const sys = [MARKETING_ONLY, system].filter(Boolean).join("\n\n---\n\n");

    const messages: { role: string; content: string }[] = [{ role: "system", content: sys }];
    if (Array.isArray(history)) {
      for (const h of history.slice(-10)) {
        if (h?.role && h?.content) {
          messages.push({ role: h.role, content: String(h.content).slice(0, 4000) });
        }
      }
    }
    const mod = module || "assistant";
    messages.push({ role: "user", content: mod === "assistant" ? prompt.trim() : `[${mod}] ${prompt.trim()}` });

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1100,
        temperature: 0.65,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("marketing-ai-chat OpenAI:", res.status, data);
      return jsonResponse({ ok: false, error: data.error?.message || `HTTP ${res.status}` }, 500);
    }

    const text = data.choices?.[0]?.message?.content || "";
    return jsonResponse({ ok: true, text, model: data.model || model });
  } catch (e) {
    console.error("marketing-ai-chat:", e);
    return jsonResponse(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});
