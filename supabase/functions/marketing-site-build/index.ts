import { edgeCorsHeaders, requireAuth, jsonResponse } from "../_shared/edgeAuth.ts";

const corsHeaders = edgeCorsHeaders;

type BuildAction =
  | "status"
  | "images"
  | "v0"
  | "wordpress"
  | "figma"
  | "webflow"
  | "builder"
  | "plasmic"
  | "stitch"
  | "runway";

function hasSecret(...names: string[]): boolean {
  return names.some((n) => !!Deno.env.get(n));
}

function secretStatus() {
  return {
    openai: hasSecret("MARKETING_OPENAI_API_KEY", "OPENAI_API_KEY"),
    v0: hasSecret("V0_API_KEY", "VERCEL_V0_API_KEY"),
    wordpress: hasSecret("WORDPRESS_SITE_URL", "WORDPRESS_APP_PASSWORD"),
    figma: hasSecret("FIGMA_ACCESS_TOKEN"),
    webflow: hasSecret("WEBFLOW_API_TOKEN", "WEBFLOW_SITE_ID"),
    builder: hasSecret("BUILDER_IO_API_KEY"),
    plasmic: hasSecret("PLASMIC_API_TOKEN", "PLASMIC_PROJECT_ID"),
    stitch: hasSecret("GOOGLE_STITCH_API_KEY", "GEMINI_API_KEY"),
    runway: hasSecret("RUNWAY_API_KEY"),
  };
}

async function generateImages(prompt: string, n = 1) {
  const apiKey = Deno.env.get("MARKETING_OPENAI_API_KEY") || Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing", needsKey: "openai" };

  const models = ["gpt-image-1", "dall-e-2"];
  let lastError = "image generation failed";

  for (const model of models) {
    const body: Record<string, unknown> = {
      model,
      prompt: prompt.slice(0, 900),
      n: Math.min(n, 1),
    };
    if (model === "dall-e-2") body.size = "1024x1024";

    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      const url = data.data?.[0]?.url || data.data?.[0]?.b64_json || null;
      return { ok: true, url, model, revised_prompt: data.data?.[0]?.revised_prompt };
    }
    lastError = data.error?.message || `HTTP ${res.status}`;
    if (!/model|does not exist|deprecated/i.test(lastError)) break;
  }
  return { ok: false, error: lastError };
}

async function probeV0(prompt: string) {
  const apiKey = Deno.env.get("V0_API_KEY") || Deno.env.get("VERCEL_V0_API_KEY");
  if (!apiKey) return { ok: false, needsKey: "v0", error: "V0_API_KEY missing" };

  const res = await fetch("https://api.v0.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "v0-1.5-md",
      messages: [{ role: "user", content: prompt.slice(0, 2000) }],
    }),
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data.error?.message || `HTTP ${res.status}` };
  const text = data.choices?.[0]?.message?.content || "";
  return { ok: true, text, provider: "v0" };
}

async function probeWordPress(title: string, content: string) {
  const base = (Deno.env.get("WORDPRESS_SITE_URL") || "").replace(/\/$/, "");
  const user = Deno.env.get("WORDPRESS_USERNAME") || "";
  const pass = Deno.env.get("WORDPRESS_APP_PASSWORD") || "";
  if (!base || !user || !pass) {
    return { ok: false, needsKey: "wordpress", error: "WORDPRESS_SITE_URL / USERNAME / APP_PASSWORD missing" };
  }
  const auth = btoa(`${user}:${pass}`);
  const res = await fetch(`${base}/wp-json/wp/v2/pages?per_page=1`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) {
    const err = await res.text();
    return { ok: false, error: `WP probe HTTP ${res.status}: ${err.slice(0, 120)}` };
  }
  const pages = await res.json();
  return {
    ok: true,
    connected: true,
    pageCount: Array.isArray(pages) ? pages.length : 0,
    draft: { title, content: content.slice(0, 200) },
    note: "read-only probe — publish requires approval gate",
  };
}

async function probeTokenApi(
  name: string,
  url: string,
  headers: Record<string, string>,
  needsKey: string,
) {
  if (!headers.Authorization && !headers["X-Figma-Token"]) {
    return { ok: false, needsKey, error: `${needsKey} token missing` };
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = await res.text();
    return { ok: false, error: `${name} HTTP ${res.status}: ${err.slice(0, 120)}` };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: true, provider: name, sample: data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAuth(req, { roles: ["super_admin"] });
    if ("error" in auth) return auth.error;

    const body = await req.json();
    const action = String(body.action || "status") as BuildAction;
    const prompt = String(body.prompt || body.title || "CO.CO דליה — עמוד שירות מקצועי").trim();

    if (action === "status") {
      return jsonResponse({ ok: true, secrets: secretStatus() });
    }

    if (action === "images") {
      const out = await generateImages(prompt, body.n || 1);
      return jsonResponse(out, out.ok ? 200 : 502);
    }

    if (action === "v0") {
      const out = await probeV0(prompt);
      return jsonResponse(out, out.ok ? 200 : out.needsKey ? 503 : 502);
    }

    if (action === "wordpress") {
      const out = await probeWordPress(
        String(body.title || "CO.CO Preview"),
        String(body.content || prompt),
      );
      return jsonResponse(out, out.ok ? 200 : out.needsKey ? 503 : 502);
    }

    if (action === "figma") {
      const token = Deno.env.get("FIGMA_ACCESS_TOKEN");
      const fileKey = Deno.env.get("FIGMA_FILE_KEY") || body.fileKey;
      if (!token) return jsonResponse({ ok: false, needsKey: "figma", error: "FIGMA_ACCESS_TOKEN missing" }, 503);
      if (!fileKey) {
        return jsonResponse({ ok: true, connected: true, note: "token present — set FIGMA_FILE_KEY for file read" });
      }
      const out = await probeTokenApi(
        "figma",
        `https://api.figma.com/v1/files/${fileKey}?depth=1`,
        { "X-Figma-Token": token },
        "figma",
      );
      return jsonResponse(out, out.ok ? 200 : 502);
    }

    if (action === "webflow") {
      const token = Deno.env.get("WEBFLOW_API_TOKEN");
      const siteId = Deno.env.get("WEBFLOW_SITE_ID");
      if (!token) return jsonResponse({ ok: false, needsKey: "webflow", error: "WEBFLOW_API_TOKEN missing" }, 503);
      const path = siteId
        ? `https://api.webflow.com/v2/sites/${siteId}`
        : "https://api.webflow.com/v2/sites";
      const out = await probeTokenApi("webflow", path, { Authorization: `Bearer ${token}` }, "webflow");
      return jsonResponse(out, out.ok ? 200 : 502);
    }

    if (action === "builder") {
      const key = Deno.env.get("BUILDER_IO_API_KEY");
      if (!key) return jsonResponse({ ok: false, needsKey: "builder", error: "BUILDER_IO_API_KEY missing" }, 503);
      const out = await probeTokenApi(
        "builder",
        `https://cdn.builder.io/api/v3/content/page?apiKey=${encodeURIComponent(key)}&limit=1`,
        {},
        "builder",
      );
      return jsonResponse(out, out.ok ? 200 : 502);
    }

    if (action === "plasmic") {
      const token = Deno.env.get("PLASMIC_API_TOKEN");
      const projectId = Deno.env.get("PLASMIC_PROJECT_ID");
      if (!token || !projectId) {
        return jsonResponse({
          ok: false,
          needsKey: "plasmic",
          error: "PLASMIC_API_TOKEN / PLASMIC_PROJECT_ID missing",
        }, 503);
      }
      const out = await probeTokenApi(
        "plasmic",
        `https://api.plasmic.app/api/v1/cms/databases?projectId=${projectId}`,
        { "x-plasmic-api-token": token },
        "plasmic",
      );
      return jsonResponse(out, out.ok ? 200 : 502);
    }

    if (action === "stitch") {
      const key = Deno.env.get("GOOGLE_STITCH_API_KEY") || Deno.env.get("GEMINI_API_KEY");
      if (!key) return jsonResponse({ ok: false, needsKey: "stitch", error: "GEMINI/STITCH key missing" }, 503);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `UI design brief (HTML outline): ${prompt.slice(0, 1500)}` }] }],
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) return jsonResponse({ ok: false, error: data.error?.message || `HTTP ${res.status}` }, 502);
      const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") || "";
      return jsonResponse({ ok: true, text, provider: "stitch-gemini-fallback" });
    }

    if (action === "runway") {
      const key = Deno.env.get("RUNWAY_API_KEY");
      if (!key) return jsonResponse({ ok: false, needsKey: "runway", error: "RUNWAY_API_KEY missing" }, 503);
      const res = await fetch("https://api.dev.runwayml.com/v1/tasks", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "X-Runway-Version": "2024-11-06",
        },
        body: JSON.stringify({
          taskType: "gen3a_turbo",
          internal: false,
          options: { name: "coco-preview", seconds: 5, text_prompt: prompt.slice(0, 500) },
        }),
      });
      const data = await res.json();
      if (!res.ok) return jsonResponse({ ok: false, error: data.error || `HTTP ${res.status}` }, 502);
      return jsonResponse({ ok: true, taskId: data.id, provider: "runway" });
    }

    return jsonResponse({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    console.error("marketing-site-build:", e);
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
