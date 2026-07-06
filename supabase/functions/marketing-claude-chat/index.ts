import { edgeCorsHeaders, requireAuth, jsonResponse } from "../_shared/edgeAuth.ts";

const corsHeaders = edgeCorsHeaders;

const MARKETING_CLAUDE = `אתה יועץ שיווק דיגיטלי (Claude) במערכת CO.CO דליה.
ענה בעברית בלבד. התמחות: SEO, GA4, GSC, Google Ads, תוכן, קמפיינים, CRM שיווקי.
השתמש בנתוני ההקשר שסופקו — אל תמציא מספרים. אם חסר מידע — ציין "ממתין לחיבור".`;

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

    const apiKey =
      Deno.env.get("ANTHROPIC_API_KEY") ||
      Deno.env.get("MARKETING_ANTHROPIC_API_KEY") ||
      Deno.env.get("CLAUDE_API_KEY");
    if (!apiKey) {
      return jsonResponse({
        ok: false,
        error: "ANTHROPIC_API_KEY is not configured",
        message: "ממתין לחיבור — הוסף ANTHROPIC_API_KEY או CLAUDE_API_KEY ל-Supabase secrets",
      }, 503);
    }

    const configuredModel = Deno.env.get("ANTHROPIC_MODEL") || Deno.env.get("MARKETING_ANTHROPIC_MODEL");
    const ctxBlock = clientContext
      ? `\n\nהקשר לקוח:\n${JSON.stringify(clientContext, null, 2).slice(0, 3000)}`
      : "";
    const sys = [MARKETING_CLAUDE, system, ctxBlock].filter(Boolean).join("\n\n");

    const messages: { role: string; content: string }[] = [];
    if (Array.isArray(history)) {
      for (const h of history.slice(-8)) {
        if (h?.role && h?.content) {
          messages.push({
            role: h.role === "assistant" ? "assistant" : "user",
            content: String(h.content).slice(0, 4000),
          });
        }
      }
    }
    messages.push({ role: "user", content: prompt.trim() });

    const modelCandidates = [
      configuredModel,
      "claude-sonnet-5",
      "claude-sonnet-4-6",
      "claude-haiku-4-5-20251001",
    ].filter((m, i, arr): m is string => !!m && arr.indexOf(m) === i);

    let data: Record<string, unknown> = {};
    let res: Response | null = null;
    let model = modelCandidates[0] || "claude-sonnet-5";
    let lastError = "Claude request failed";

    for (const candidate of modelCandidates.length ? modelCandidates : ["claude-sonnet-5"]) {
      model = candidate;
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: candidate,
          max_tokens: 1100,
          system: sys,
          messages,
        }),
      });

      data = await res.json();
      if (res.ok) break;
      const errMsg = (data as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`;
      lastError = errMsg;
      const retryable = res.status === 404 || /model|not_found|deprecated/i.test(errMsg);
      if (!retryable) break;
    }

    if (!res || !res.ok) {
      console.error("marketing-claude-chat:", res?.status, data);
      return jsonResponse({ ok: false, error: lastError, model }, 500);
    }

    const text = ((data as { content?: { type?: string; text?: string }[] }).content || [])
      .filter((b: { type?: string }) => b.type === "text")
      .map((b: { text?: string }) => b.text || "")
      .join("");
    return jsonResponse({ ok: true, text, reply: text, model, provider: "claude" });
  } catch (e) {
    console.error("marketing-claude-chat:", e);
    return jsonResponse(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});
