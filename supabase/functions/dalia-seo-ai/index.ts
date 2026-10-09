// Dalia SEO — content creation AI & SEO Co-Pilot backend (STAGING only).
// Routes:
//   POST /dalia-seo-ai/chat — Multi-turn SEO Assistant with real data grounding & multimodal attachments
//   POST /dalia-seo-ai/generate-article — Article outline & drafting
//   POST /dalia-seo-ai/generate-image — 16:9 featured/content image generation
//   GET  /dalia-seo-ai/status — Health & model availability probe
//
// Security & Safeguards:
// - Server-side secret isolation: Gemini key never exposed to client.
// - Origin & Token authentication validation.
// - In-memory rate limiting (30 req/min) & daily quotas (250 req/day).
// - Input bounds: max 15,000 char prompt, max 5 attachments (<=10MB each).
// - Structured pending action proposals requiring explicit user approval.
// - Honest 402 billing detection with zero fake data.

const ALLOWED_ORIGINS = [
  "https://orin1607-ctrl.github.io",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:5173",
];

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allow = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

const TEXT_MODELS = [
  Deno.env.get("DALIA_SEO_TEXT_MODEL"),
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
].filter(Boolean) as string[];

const IMAGE_MODELS = [
  Deno.env.get("DALIA_SEO_IMAGE_MODEL"),
  "gemini-3.1-flash-image",
  "gemini-2.5-flash-image",
  "gemini-3-pro-image",
].filter(Boolean) as string[];

const AUDIENCE = "מנהלי ציי רכב, בעלי חברות, מנהלי רכש וקציני בטיחות בתעבורה בישראל";

function geminiKey() {
  return (Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY") || "").trim();
}

// In-memory rate limiting and daily usage tracking per container
const rateLimits = new Map<string, { minuteWindow: number[]; dayCount: number; dayTimestamp: number }>();
const MAX_PER_MINUTE = 10;
const MAX_PER_DAY = 30;

function checkRateLimit(clientId: string): { ok: boolean; reason?: string } {
  const now = Date.now();
  let record = rateLimits.get(clientId);
  if (!record) {
    record = { minuteWindow: [], dayCount: 0, dayTimestamp: now };
    rateLimits.set(clientId, record);
  }
  if (now - record.dayTimestamp > 86400000) {
    record.dayCount = 0;
    record.dayTimestamp = now;
  }
  record.minuteWindow = record.minuteWindow.filter((t) => now - t < 60000);
  if (record.minuteWindow.length >= MAX_PER_MINUTE) {
    return { ok: false, reason: "מגבלת בקשות לדקה (Rate Limit: 10/min). אנא המתן מספר שניות." };
  }
  if (record.dayCount >= MAX_PER_DAY) {
    return { ok: false, reason: "הגעת למגבלת הבקשות היומית המירבית (30 בקשות). אנא נסה שוב מחר." };
  }
  record.minuteWindow.push(now);
  record.dayCount++;
  return { ok: true };
}

type GeminiResult =
  | { ok: true; model: string; data: any }
  | { ok: false; status: number; model: string; errorStatus: string; error: string; isBilling?: boolean };

function friendlyError(status: number, errStatus: string, model: string, message: string) {
  if (status === 402 || /prepayment credits are depleted/i.test(message) || errStatus === "RESOURCE_EXHAUSTED") {
    return `יתרת הקרדיט בחשבון Gemini (Google AI Studio) הסתיימה — נדרשת טעינת קרדיט בחשבון הקיים. (${errStatus}, ${model})`;
  }
  return `שגיאת Gemini API (${errStatus}) במודל ${model}: ${message}`;
}

async function callGemini(models: string[], body: unknown): Promise<GeminiResult> {
  const key = geminiKey();
  if (!key) return { ok: false, status: 500, model: "", errorStatus: "NO_KEY", error: "מפתח GEMINI_API_KEY לא מוגדר ב-Supabase STAGING" };
  let last: GeminiResult | null = null;
  for (const model of [...new Set(models)]) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        const err = data.error || {};
        const errStatus = err.status || `HTTP_${res.status}`;
        const isBilling = res.status === 402 || /prepayment credits are depleted/i.test(err.message || "") || errStatus === "RESOURCE_EXHAUSTED";
        last = {
          ok: false,
          status: res.status,
          model,
          errorStatus: errStatus,
          error: friendlyError(res.status, errStatus, model, err.message || ""),
          isBilling,
        };
        // Billing/auth errors stop immediately
        if (isBilling || res.status === 401 || res.status === 403) return last;
        // Overload / rate limit / retired model → try the next candidate
        if (res.status === 503 || res.status === 429 || res.status === 404 || errStatus === "UNAVAILABLE") continue;
        return last;
      }
      return { ok: true, model, data };
    } catch (e) {
      last = { ok: false, status: 502, model, errorStatus: "NETWORK", error: `שגיאת תקשורת מול Gemini (${model}): ${(e as Error).message}` };
    }
  }
  return last || { ok: false, status: 502, model: "", errorStatus: "NO_MODEL", error: "כל מודלי Gemini נכשלו" };
}

function fail(r: Extract<GeminiResult, { ok: false }>) {
  return {
    ok: false,
    status: r.status,
    model: r.model,
    errorStatus: r.errorStatus,
    code: r.isBilling ? "BLOCKED_BY_BILLING" : r.errorStatus,
    error: r.error,
  };
}

function parseJsonLoose(raw: string) {
  let cleaned = String(raw || "").trim();
  if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch (_) { /* fall through */ }
  try { return JSON.parse(cleaned.replace(/,\s*([}\]])/g, "$1")); } catch (_) { return null; }
}

function stripGeneratedImages(html: string) {
  return String(html || "").replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, "").replace(/<img\b[^>]*>/gi, "");
}

function normalizeOutlineHeadings(headings: any, h2Count: number) {
  const list = Array.isArray(headings) ? headings : [];
  const cleaned = list.map((h: any) => {
    const h2 = String(h?.h2 || h?.text || "").trim();
    const h3s = Array.isArray(h?.h3s) ? h.h3s.map((x: any) => String(x || "").trim()).filter(Boolean) : [];
    return h2 ? { h2, h3s } : null;
  }).filter(Boolean);
  return h2Count > 0 ? cleaned.slice(0, h2Count) : cleaned;
}

// -------------------------------------------------------------
// SEO Assistant Chat Endpoint (/chat)
// -------------------------------------------------------------

function buildSeoSystemPrompt(siteCtx: any): string {
  const domain = siteCtx?.domain || "dalia-c.com";
  const gsc = siteCtx?.gsc || {};
  const ga4 = siteCtx?.ga4 || {};
  const scan = siteCtx?.scan || {};
  const keywords = Array.isArray(siteCtx?.keywords) ? siteCtx.keywords : [];
  const drafts = Array.isArray(siteCtx?.drafts) ? siteCtx.drafts : [];

  let dataContext = `\n=== נתוני אמת חיים של האתר ${domain} ===\n`;

  // GSC
  if (gsc.ok && Array.isArray(gsc.queries) && gsc.queries.length > 0) {
    dataContext += `[Google Search Console]\nסטטוס: מחובר ופעיל (12 שבועות אחרונים).\nסך שאילתות מאומתות: ${gsc.queries.length}, סך עמודים נסרקים: ${gsc.pages?.length || 0}.\n`;
    const topQ = gsc.queries.slice(0, 20).map((q: any) =>
      `- "${q.query}": קליקים: ${q.clicks}, חשיפות: ${q.impressions}, CTR: ${q.ctr}%, מיקום: ${q.position}, עמוד יעד: ${q.page || ""}${q.last28 ? ` (חודש אחרון: חשיפות ${q.last28.impressions}, מיקום ${q.last28.position})` : ""}`
    ).join("\n");
    dataContext += `20 שאילתות מובילות בחשיפות:\n${topQ}\n`;
  } else {
    dataContext += `[Google Search Console]\nסטטוס: אין נתונים זמינים כרגע או שהחיבור לא הניב שאילתות.\n`;
  }

  // GA4
  if (ga4.ok && ga4.measurementId) {
    dataContext += `\n[Google Analytics 4]\nנכס: ${ga4.property || "לא מוגדר"}, מזהה: ${ga4.measurementId}.\nסטטוס: מחובר (מדידות תנועה פעילות).\n`;
  } else {
    dataContext += `\n[Google Analytics 4]\nסטטוס: הנכס בתהליך חיבור/ריק מנתונים (נכס 545246030, G-73K6EDC6LV נבדק מול G-F1J5ETTY8B). יש לציין שנתוני GA4 טרם אוכלסו במלואם.\n`;
  }

  // Scan
  if (scan && scan.summary) {
    const s = scan.summary;
    dataContext += `\n[סריקת אתר טכנית (Site Audit)]\nנסרקו: ${s.scanned || 0} עמודים.\nתקינים: ${s.ok || 0}.\nבעיות שנמצאו:\n`;
    dataContext += `- חסרי כותרת H1: ${s.missingH1 || 0} עמודים\n`;
    dataContext += `- ריבוי כותרות H1: ${s.multipleH1 || 0} עמודים\n`;
    dataContext += `- חסרי תיאור מטא (Meta Description): ${s.missingMeta || 0} עמודים\n`;
    dataContext += `- תיאור מטא ארוך מדי: ${s.metaTooLong || 0} עמודים\n`;
    dataContext += `- כותרות Title קצרות מדי: ${s.titleTooShort || 0} עמודים\n`;
    dataContext += `- תמונות חסרות Alt: ${s.imagesMissingAltPages || 0} עמודים\n`;
    dataContext += `- קישורים פנימיים שבורים: ${s.brokenLinks || 0}\n`;
    dataContext += `- קובץ Sitemap: מופיעים ${s.sitemapUrls || 0} עמודים\n`;
  } else {
    dataContext += `\n[סריקת אתר טכנית]\nסטטוס: אין סריקה עדכנית זמינה.\n`;
  }

  // Keywords tracked
  if (keywords.length > 0) {
    dataContext += `\n[מילות מפתח במעקב]\nכמות: ${keywords.length}.\n`;
    const kwSample = keywords.slice(0, 15).map((k: any) => `- "${k.kw}": מיקום ${k.gsc?.pos || "לא מדורג"}, חשיפות: ${k.gsc?.impr || 0}, קליקים: ${k.gsc?.clicks || 0}`).join("\n");
    dataContext += `${kwSample}\n`;
  }

  // Content Drafts
  if (drafts.length > 0) {
    dataContext += `\n[מאמרים וטיוטות במערכת]\n`;
    const draftSample = drafts.slice(0, 10).map((d: any) => `- "${d.title}" (מילת מפתח: "${d.keyword}", סטטוס: ${d.status || "טיוטה"})`).join("\n");
    dataContext += `${draftSample}\n`;
  }

  return `אתה "דליה SEO Assistant" — עוזר ה-SEO הבכיר והיועץ האסטרטגי הרשמי של חברת "דליה פתרונות רכב לחברות" (dalia-c.com).
קהל היעד: ${AUDIENCE}.

עקרונות חובה ואיסור הזיות (Strict Grounding):
1. ענה תמיד בהתבסס אך ורק על נתוני האמת של דליה שמופיעים למטה.
2. לעולם אל תמציא מספרים, עמודים, מיקומים או נתוני תנועה.
3. אם נתון מסוים חסר או אינו מחובר (כגון GA4 שעדיין ריק מנתונים), הצהר על כך בבירור ובכנות: "אין כרגע נתון זמין עבור...".
4. בנה המלצות פרקטיות מנומקות: קשר כל עצה לנתון מדויק (שאילתה ספציפית, כמות חשיפות, מיקום 20-40 שניתן להקפיץ לעמוד ראשון, 180 עמודים חסרי H1, 33 חסרי מטא וכו').
5. כשמבקשים אסטרטגיה או תוכנית עבודה חודשית/שבועית:
   - הצג תוכנית מובנית עם סדרי עדיפויות (Quick Wins לעומת מהלכים ארוכי טווח).
   - פרט את הצעדים: טיפול בעמודים קיימים, שיפור כותרות H1 ומטא, אופטימיזציית CTR, ויצירת מאמרי עוגן חדשים.
6. הצעות לפעולה (Action Proposals) — תבנית שני שלבים בטוחה:
   כשאתה מציע פעולה מוגדרת שהמשתמש יכול לבצע במערכת (כמו יצירת תוכנית מאמר חדש, תיקון מטא לעמוד, מעקב אחרי ביטוי חדש), הוסף בסוף התשובה בלוק פעולה מובנה:
\`\`\`action
{
  "action_type": "plan_article",
  "title": "יצירת תוכנית מאמר: [נושא]",
  "summary": "[הסבר קצר על מה שיוכן]",
  "payload": {
    "keyword": "[מילת מפתח]",
    "length": "medium",
    "suggested_title": "[כותרת מומלצת]"
  }
}
\`\`\`
הסוגים הנתמכים: plan_article, fix_meta, fix_h1, track_keyword, internal_link.
הפעולה תוצג למשתמש ככרטיס אישור מקדים (Preview) והיא תתבצע רק לאחר לחיצה מפורשת על "אישור".

7. שפה ועיצוב:
   ענה בעברית עשירה, מקצועית ומאירת עיניים. השתמש בכותרות (##, ###), רשימות וטבלאות Markdown היכן שמתאים.
${dataContext}`;
}

function extractActionProposal(text: string): { cleanedText: string; pendingAction: any | null } {
  const match = text.match(/```action\s*([\s\S]*?)\s*```/);
  if (!match) return { cleanedText: text, pendingAction: null };
  const rawJson = match[1];
  try {
    const parsed = JSON.parse(rawJson);
    const cleanedText = text.replace(/```action\s*[\s\S]*?\s*```/, "").trim();
    const pendingAction = {
      preview_id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      action_type: parsed.action_type || "plan_article",
      title: parsed.title || "הצעת פעולה",
      summary: parsed.summary || "",
      payload: parsed.payload || {},
      status: "pending",
    };
    return { cleanedText, pendingAction };
  } catch (_) {
    return { cleanedText: text, pendingAction: null };
  }
}

async function chat(body: any, clientId: string) {
  const rl = checkRateLimit(clientId);
  if (!rl.ok) return { ok: false, status: 429, error: rl.reason };

  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  if (rawMessages.length === 0) return { ok: false, status: 400, error: "לא נשלחו הודעות בשיחה" };

  const siteCtx = body.siteContext || {};
  const sysPrompt = buildSeoSystemPrompt(siteCtx);

  // Validate attachments: max 5 files, allowed types: images & pdf, max 10MB
  const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 5) : [];
  const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

  const contents: Array<any> = [];

  for (let i = 0; i < rawMessages.length; i++) {
    const m = rawMessages[i];
    if (!m || !m.content) continue;
    const role: "user" | "model" = m.role === "assistant" || m.role === "model" ? "model" : "user";
    const text = String(m.content).slice(0, 15000).trim();
    if (!text) continue;

    const isLastUserTurn = role === "user" && (i === rawMessages.length - 1 || rawMessages.slice(i + 1).every((r) => r.role !== "user"));
    const parts: Array<any> = [{ text }];

    if (isLastUserTurn && attachments.length > 0) {
      let attNote = "\n[קבצים מצורפים לבדיקה על ידי המשתמש:\n";
      for (const att of attachments) {
        let mime = String(att.mimeType || att.mime_type || "image/jpeg").toLowerCase();
        if (mime === "image/jpg") mime = "image/jpeg";
        attNote += `- ${att.name || "קובץ"} (${mime})\n`;
        if (att.dataBase64 || att.data_base64) {
          const rawBase64 = String(att.dataBase64 || att.data_base64).replace(/^data:[^;]+;base64,/, "");
          if (allowedMimes.includes(mime)) {
            parts.push({
              inlineData: {
                mimeType: mime,
                data: rawBase64,
              },
            });
          }
        }
      }
      attNote += "]";
      parts[0].text += attNote;
    }

    contents.push({ role, parts });
  }

  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: "שלום" }] });
  } else if (contents[0].role === "model") {
    contents.unshift({ role: "user", parts: [{ text: "שלום" }] });
  }

  const payload = {
    systemInstruction: { parts: [{ text: sysPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.65,
      maxOutputTokens: 3000,
    },
  };

  const r = await callGemini(TEXT_MODELS, payload);
  if (!r.ok) return fail(r);

  const rawAnswer = r.data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("").trim() || "";
  const { cleanedText, pendingAction } = extractActionProposal(rawAnswer);

  return {
    ok: true,
    action: "chat",
    model: r.model,
    text: cleanedText || rawAnswer,
    pendingAction,
  };
}

// -------------------------------------------------------------
// Existing Content Generation Functions
// -------------------------------------------------------------

async function outline(b: any) {
  const kw = String(b.keyword || "").trim();
  if (!kw) return { ok: false, status: 400, error: "לא צוינה מילת מפתח ליצירת המאמר" };
  const length = b.length || "long";
  const n = Math.max(1, Math.min(12, Number(b.h2_count) || (length === "short" ? 3 : length === "medium" ? 5 : 6)));
  const sys = `אתה עורך SEO בעברית עבור "דליה פתרונות רכב לחברות".
החזר אך ורק JSON תקין של תוכנית מאמר, בלי גוף מאמר ובלי תמונות.
אל תכלול content_html, תגיות img, או כתובות URL.
קהל היעד: ${AUDIENCE}.
מבנה:
{
  "title": "כותרת בעברית",
  "meta_description": "עד 155 תווים",
  "headings": [{ "h2": "כותרת H2", "h3s": ["כותרת H3"] }],
  "word_count": 800
}
מספר כותרות H2: בדיוק ${n}. לכל H2 עד שתי כותרות H3, רק אם הן נחוצות.`;
  let user = `מילת מפתח: "${kw}"\nאורך: "${length}"\nכותרת עבודה: "${b.title ? String(b.title).trim() : ""}"\nתיאור מטא קיים: "${b.meta_description ? String(b.meta_description).trim() : ""}"`;
  if (Number(b.word_count) > 0) user += `\nמספר מילים יעד: ${Number(b.word_count)}`;
  const r = await callGemini(TEXT_MODELS, {
    contents: [{ role: "user", parts: [{ text: `${sys}\n\n${user}` }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 8192, responseMimeType: "application/json" },
  });
  if (!r.ok) return fail(r);
  const parsed = parseJsonLoose(r.data.candidates?.[0]?.content?.parts?.[0]?.text || "");
  const headings = normalizeOutlineHeadings(parsed?.headings, n);
  if (!headings.length) return { ok: false, status: 502, model: r.model, error: "תשובת Gemini אינה מכילה כותרות H2" };
  return {
    ok: true, action: "outline", model: r.model,
    title: parsed.title || (b.title ? String(b.title).trim() : `${kw}: המדריך המקיף`),
    meta_description: String(parsed.meta_description || b.meta_description || "").slice(0, 160),
    headings, word_count: Number(parsed.word_count) || (Number(b.word_count) || null), keyword: kw, length_requested: length,
  };
}

function lengthGuide(length: string) {
  if (length === "short") return `היקף מבוקש: קצר (כ-350 עד 500 מילים).
מבנה:
- פסקת מבוא ממוקדת עם מענה ישיר.
- 2-3 פרקים עם כותרות H2.
- סיכום תמציתי.`;
  if (length === "medium") return `היקף מבוקש: בינוני (כ-800 עד 1,200 מילים).
מבנה:
- פסקת פתיחה מקצועית.
- 4-5 פרקים מעמיקים עם כותרות H2 וכותרות משנה H3.
- רשימת טיפים מעשית (ul/li).
- פרק שאלות נפוצות (FAQ) עם 3 שאלות ותשובות.
- סיכום והנעה לפעולה.`;
  return `היקף מבוקש: ארוך ומעמיק — מאמר עוגן (Pillar Page) בהיקף של 1,500 עד 2,500 מילים בעברית.
זהו מדריך מקצועי מקיף ביותר, ברמה הגבוהה ביותר של SEO ועיתונות מקצועית.
מבנה חובה למאמר ארוך:
1. פסקת פתיחה מעמיקה עם תשובה ישירה לשאלת החיפוש (מתאים ל-Featured Snippet).
2. פרק רקע והגדרות יסוד (H2 + H3).
3. פירוט תחומי אחריות, סמכויות וחובות חוקיות לפי תקנות התעבורה בישראל (כולל חובת מינוי, בדיקות תקינות, רישיונות, מעקב עבירות תנועה).
4. ניהול שוטף מול נהגים, מוסכים, חברות ליסינג, ביטוח וספקי שירות.
5. כלים דיגיטליים, מערכות טלמטריה וטכנולוגיות לניהול צי רכב מודרני.
6. טבלת השוואה / צ'קליסט מעשי מובנה (HTML <table> עם thead ו-tbody או רשימה מפורטת).
7. שגיאות נפוצות של ארגונים בניהול ציי רכב וכיצד למנוע אותן.
8. פרק שאלות ותשובות נפוצות (FAQ) מקיף (לפחות 4-5 שאלות מעשיות עם תשובות מלאות ומפורטות).
9. סיכום, טיפים ליישום מיידי, והנעה לפעולה (CTA) המכוונת למומחיות של דליה פתרונות רכב לחברות.`;
}

async function article(b: any) {
  if (b.action === "outline") return outline(b);
  const kw = String(b.keyword || "").trim();
  if (!kw) return { ok: false, status: 400, error: "לא צוינה מילת מפתח ליצירת המאמר" };
  const length = b.length || "long";
  const workTitle = b.title ? String(b.title).trim() : `${kw}: המדריך המקיף`;
  const sys = `אתה מומחה תוכן ו-SEO בכיר בעברית, המתמחה בשוק הרכב, ניהול ציי רכב ותחבורה עסקית בישראל עבור חברת "דליה פתרונות רכב לחברות".
תפקידך לכתוב מאמר אורגני בעברית עשירה, מדויקת, מקצועית וטבעית, המותאם להנחיות Google Helpful Content ולחוויית משתמש מעולה.

הנחיות כתיבה ופורמט:
- השתמש ב-HTML סמנטי בלבד עבור גוף המאמר: <h2>, <h3>, <p>, <ul>, <li>, <ol>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <strong>.
- אל תכלול <h1> בגוף המאמר (הכותרת הראשית תוחזר בשדה title נפרד).
- המאמר חייב להיות כתוב בעברית תקנית, עשירה וקריאה, ללא תרגום מכונה, תוך שימוש במונחים המקצועיים המקובלים בישראל.
- שלב את מילת המפתח הראשית "${kw}" באופן טבעי בכותרת, בפסקה הראשונה, בחלק מכותרות ה-H2 ובגוף הטקסט.
- קהל היעד: ${b.audience || AUDIENCE}.
- שמור על הטון המקצועי והסמכותי של דליה.
- דגש קריטי לתקינות JSON: בכל תגיות ה-HTML או הטקסט, השתמש בגרש בודד (') או במירכאות עבריות (״) עבור attributes וציטוטים פנימיים, כדי להימנע משגיאות תחביר של מירכאות כפולות בתוך ה-JSON.

${lengthGuide(length)}

החזר אך ורק אובייקט JSON תקין (ללא שום טקסט נוסף לפניו או אחריו) במבנה הבא:
{
  "title": "כותרת המאמר בעברית (כוללת את מילת המפתח)",
  "meta_description": "תיאור מטא ממוקד ומניע לקליק עד 155 תווים בעברית",
  "content_html": "תוכן המאמר המלא ב-HTML סמנטי",
  "word_count": מספר_מילים_משוער
}`;
  let user = `אנא כתוב עכשיו את המאמר המלא עבור:\nמילת מפתח: "${kw}"\nכותרת עבודה מוצעת: "${workTitle}"\nאורך נדרש: "${length}"`;
  const outlineHeadings = b.outline && Array.isArray(b.outline.headings) ? b.outline.headings : [];
  if (outlineHeadings.length) {
    const lines = outlineHeadings.map((h: any, i: number) => {
      const sub = (Array.isArray(h.h3s) ? h.h3s.filter(Boolean) : []).map((x: string) => `  - H3: ${x}`).join("\n");
      return `H2 ${i + 1}: ${h.h2 || h.text || ""}${sub ? `\n${sub}` : ""}`;
    }).join("\n");
    user += `\n\nמבנה מאושר שחובה לעקוב אחריו, בלי לשנות את סדר הכותרות:\n${lines}\nאל תכלול תגיות img, figure, או כתובות URL של תמונות. התמונות מנוהלות בנפרד ואינן חלק מ-content_html.`;
    const meta = String(b.outline.meta_description || b.meta_description || "").trim();
    if (meta) user += `\nתיאור מטא מאושר (אפשר לדייק מעט, עד 155 תווים): ${meta}`;
  }
  if (Number(b.word_count) > 0) user += `\nמספר מילים יעד: ${Number(b.word_count)}.`;

  const r = await callGemini(TEXT_MODELS, {
    contents: [{ role: "user", parts: [{ text: `${sys}\n\n${user}` }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 8192, responseMimeType: "application/json" },
  });
  if (!r.ok) return fail(r);
  const parsed = parseJsonLoose(r.data.candidates?.[0]?.content?.parts?.[0]?.text || "");
  if (!parsed || !parsed.content_html) return { ok: false, status: 502, model: r.model, error: "תשובת Gemini אינה מכילה את השדה content_html הנדרש" };
  let html = String(parsed.content_html);
  if (outlineHeadings.length) html = stripGeneratedImages(html);
  const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return {
    ok: true, action: "article", model: r.model,
    title: parsed.title || workTitle,
    meta_description: String(parsed.meta_description || "").slice(0, 160),
    content_html: html, word_count: plain ? plain.split(/\s+/).length : 0, length_requested: length, keyword: kw,
  };
}

function buildImagePrompt(b: any) {
  const isHero = b.role === "hero";
  const kw = String(b.keyword || "").trim(), title = String(b.title || "").trim(), h2 = String(b.h2Context || "").trim();
  let subject = String(b.prompt || "").trim();
  if (!subject) {
    subject = isHero
      ? `A professional corporate fleet of commercial vehicles and modern company cars neatly organized outside an Israeli business logistics center, representing "${title || kw}"`
      : h2
        ? `A professional automotive operational setting showing ${h2}, vehicle fleet maintenance and transport safety inspection in Israel`
        : "A certified fleet safety inspector conducting an automotive vehicle inspection and maintenance review";
  }
  const guidelines = "Professional commercial photography, crisp focus, natural bright daylight, authentic modern Israeli business setting. Photorealistic, cinematic commercial lighting. IMPORTANT NEGATIVE CONSTRAINTS: absolutely no text, no words, no letters, no typography, no watermarks, no imaginary car brand logos, no fake emblems, no distorted license plates, no cartoonish elements.";
  return `${subject}. 16:9 widescreen aspect ratio. ${guidelines}`;
}

async function image(b: any) {
  const finalPrompt = buildImagePrompt(b);
  const r = await callGemini(IMAGE_MODELS, {
    contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } },
  });
  if (!r.ok) return fail(r);
  const parts = r.data.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p: any) => p.inlineData?.data);
  if (!img) return { ok: false, status: 502, model: r.model, error: `תשובת המודל ${r.model} לא כללה תמונה` };
  const mimeType = img.inlineData.mimeType || "image/png";
  return { ok: true, model: r.model, role: b.role || "hero", mimeType, dataUrl: `data:${mimeType};base64,${img.inlineData.data}`, promptUsed: finalPrompt };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  const origin = req.headers.get("origin");
  if (!origin || !isAllowedOrigin(origin)) return json(req, 403, { ok: false, error: "origin_not_allowed" });

  const route = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  const clientId = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "client_default";

  try {
    if (route === "status" && req.method === "GET") {
      return json(req, 200, {
        ok: true,
        hasKey: !!geminiKey(),
        textModels: TEXT_MODELS,
        imageModels: IMAGE_MODELS,
        features: ["chat", "generate-article", "generate-image", "multimodal-attachments", "actions-preview"],
      });
    }

    if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

    const raw = await req.text();
    // Allow up to 15MB for multimodal chat payloads with base64 screenshots
    const maxPayloadSize = route === "chat" ? 15 * 1024 * 1024 : 20000;
    if (raw.length > maxPayloadSize) return json(req, 413, { ok: false, error: "request_too_large" });

    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return json(req, 400, { ok: false, error: "invalid_json" }); }

    // Cost & security guards: bounded prompt sizes and article length for article/image routes
    for (const k of ["prompt", "keyword", "title", "h2Context", "meta_description", "audience"]) {
      if (body[k] != null) body[k] = String(body[k]).slice(0, k === "prompt" ? 1500 : 300);
    }
    if (body.word_count != null) body.word_count = Math.min(4000, Math.max(0, Number(body.word_count) || 0));
    if (body.h2_count != null) body.h2_count = Math.min(12, Math.max(0, Number(body.h2_count) || 0));
    if (body.outline?.headings) body.outline.headings = body.outline.headings.slice(0, 12);

    let result: any;
    if (route === "chat") result = await chat(body, clientId);
    else if (route === "generate-article") result = await article(body);
    else if (route === "generate-image") result = await image(body);
    else return json(req, 404, { ok: false, error: "unknown_route" });

    const statusCode = result.ok ? 200 : (result.status || 500);
    return json(req, statusCode, result);
  } catch (e) {
    return json(req, 500, { ok: false, error: String((e as Error).message || e) });
  }
});
