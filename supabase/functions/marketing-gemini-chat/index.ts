import { edgeCorsHeaders, requireAuth, jsonResponse } from "../_shared/edgeAuth.ts";

const corsHeaders = edgeCorsHeaders;

const MARKETING_GEMINI = `אתה יועץ שיווק דיגיטלי (Gemini) במערכת CO.CO דליה.
ענה בעברית בלבד. התמחות: SEO, GA4, GSC, Google Ads, תוכן, קמפיינים, CRM שיווקי.
השתמש בנתוני ההקשר שסופקו — אל תמציא מספרים. אם חסר מידע — ציין זאת בבירור.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAuth(req, { roles: ["super_admin"] });
    if ("error" in auth) return auth.error;

    const body = await req.json();
    const { prompt, system, history, clientContext } = body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return jsonResponse({ ok: false, error: "empty_prompt" }, 400);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY");
    if (!apiKey) {
      return jsonResponse({ ok: false, error: "GEMINI_API_KEY is not configured" }, 500);
    }

    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
    const ctxBlock = clientContext
      ? `\n\nהקשר לקוח:\n${JSON.stringify(clientContext, null, 2).slice(0, 3000)}`
      : "";
    const sys = [MARKETING_GEMINI, system, ctxBlock].filter(Boolean).join("\n\n");

    const contents: { role: string; parts: { text: string }[] }[] = [];
    if (Array.isArray(history)) {
      for (const h of history.slice(-8)) {
        if (h?.role && h?.content) {
          contents.push({
            role: h.role === "assistant" ? "model" : "user",
            parts: [{ text: String(h.content).slice(0, 4000) }],
          });
        }
      }
    }
    contents.push({ role: "user", parts: [{ text: prompt.trim() }] });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents,
        generationConfig: { temperature: 0.65, maxOutputTokens: 1100 },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("marketing-gemini-chat:", res.status, data);
      return jsonResponse({ ok: false, error: data.error?.message || `HTTP ${res.status}` }, 500);
    }

    const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
    return jsonResponse({ ok: true, text, model, provider: "gemini" });
  } catch (e) {
    console.error("marketing-gemini-chat:", e);
    return jsonResponse(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});
