// OpenProspector – research ONE lead with Gemini (STAGING).
// super_admin only (same edgeAuth as marketing-gemini-chat). The prompt is built here, server-side,
// so the endpoint cannot be used as a general chat. Nothing is written to the database here:
// the client validates the JSON, shows a preview and writes only after a human approves.
import { edgeCorsHeaders, requireAuth, jsonResponse } from "../_shared/edgeAuth.ts";

const FIELDS = [
  "website", "phone", "email", "address", "contact_name", "contact_role", "contact_phone", "contact_email",
  "contact_linkedin", "linkedin_company", "fleet_exists", "fleet_size", "fleet_types",
  "fleet_manager_name", "safety_officer_name",
];

const SYSTEM = `You are a careful B2B data researcher for an Israeli vehicle-fleet garage (Dalia / Oren Car).
Research ONE Israeli company (given below) and return ONLY a JSON object, no prose, no markdown.

Rules – strict:
- Never invent data. If you did not find a value in a concrete public source, return status "not_found".
- Every finding must have "source" (site/registry name) and "url" (the exact page). Without both, status may be at most "found".
- "verified" only when the value appears explicitly on an authoritative page you cite (company website, government registry,
  official listing). Your own inference is never "verified".
- fleet_size: only a number stated explicitly in a source. Never estimate.
- safety_officer_name: only a person explicitly named as the company's transport safety officer (קצין בטיחות בתעבורה).
  The certified professional from the contractors registry (OVDIM) is NOT a safety officer – never return those names.
- Israeli phone numbers only. Prefer the company's own website and official registries.
- Fields allowed: ${FIELDS.join(", ")}.

Answer schema:
{"company_hp":"<same as input>","findings":[{"field":"<one of the allowed fields>","value":<string|number|boolean|string[]>,
"source":"<source name>","url":"<https://...>","status":"found"|"verified"|"not_found","evidence":"<short quote>","found_at":"YYYY-MM-DD"}],
"missing_fields":["<fields still missing>"],"notes":"<short>"}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: edgeCorsHeaders });
  try {
    const auth = await requireAuth(req, { roles: ["super_admin"] });
    if ("error" in auth) return auth.error;

    const body = await req.json().catch(() => null);
    const lead = body?.lead;
    if (!lead || typeof lead !== "object" || Array.isArray(body?.leads)) {
      return jsonResponse({ ok: false, error: "exactly one lead per request" }, 400);
    }
    if (!lead.company_name || !/^\d{6,10}$/.test(String(lead.company_hp || ""))) {
      return jsonResponse({ ok: false, error: "lead.company_name and a numeric lead.company_hp are required" }, 400);
    }
    const leadJson = JSON.stringify(lead);
    if (leadJson.length > 12000) return jsonResponse({ ok: false, error: "lead payload too large" }, 413);

    const apiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY");
    if (!apiKey) return jsonResponse({ ok: false, error: "GEMINI_API_KEY is not configured" }, 500);
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
    const grounding = body?.grounding !== false;

    const reqBody: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: `Company to research (JSON):\n${leadJson}\n\nToday: ${new Date().toISOString().slice(0, 10)}` }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
    };
    if (grounding) reqBody.tools = [{ google_search: {} }];

    const t0 = Date.now();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(reqBody) },
    );
    const data = await res.json().catch(() => ({}));
    const ms = Date.now() - t0;
    if (!res.ok) {
      // message has no key in it; logged so failures can be diagnosed without another call
      console.error("prospector-enrich:", res.status, data?.error?.status, model, String(data?.error?.message || "").slice(0, 300));
      return jsonResponse({
        ok: false, error: data?.error?.message || `HTTP ${res.status}`,
        upstream_status: res.status, upstream_reason: data?.error?.status || null, model, ms,
      }, 500);
    }
    const cand = data.candidates?.[0];
    const text = cand?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
    const chunks = cand?.groundingMetadata?.groundingChunks || [];
    return jsonResponse({
      ok: true, text, model, ms, grounding,
      finish_reason: cand?.finishReason || null,
      usage: data.usageMetadata || null,
      sources: chunks.map((c: { web?: { uri?: string; title?: string } }) => ({ title: c.web?.title || "", uri: c.web?.uri || "" })).slice(0, 20),
      queries: cand?.groundingMetadata?.webSearchQueries || [],
    });
  } catch (e) {
    console.error("prospector-enrich:", e);
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
