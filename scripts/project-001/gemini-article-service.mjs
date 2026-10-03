import { loadGeminiKey } from './_lib/ai-env.mjs';

/**
 * Gemini Article Generator for Dalia / OpenSEO
 * Connects directly to Google Generative Language API using GEMINI_API_KEY from .env.openai
 */
/** Drop img/figure tags. Used only when an approved outline was sent — the legacy call is unchanged. */
export function stripGeneratedImages(html) {
  return String(html || '')
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, '')
    .replace(/<img\b[^>]*>/gi, '');
}

export function normalizeOutlineHeadings(headings, h2Count) {
  const list = Array.isArray(headings) ? headings : [];
  const cleaned = list.map((h) => {
    const h2 = String(h?.h2 || h?.text || '').trim();
    const h3s = Array.isArray(h?.h3s) ? h.h3s.map((x) => String(x || '').trim()).filter(Boolean) : [];
    return h2 ? { h2, h3s } : null;
  }).filter(Boolean);
  const n = Number(h2Count);
  if (n > 0) return cleaned.slice(0, n);
  return cleaned;
}

export async function generateArticleWithGemini({
  keyword,
  title = null,
  length = 'long', // 'short' | 'medium' | 'long'
  plan = null,
  audience = 'מנהלי ציי רכב, בעלי חברות, מנהלי רכש וקציני בטיחות בתעבורה',
  action = 'article',
  word_count = null,
  h2_count = null,
  meta_description = '',
  outline = null
} = {}) {
  if (action === 'outline') {
    return generateOutlineWithGemini({ keyword, title, length, audience, word_count, h2_count, meta_description });
  }
  if (!keyword || !keyword.trim()) {
    return { ok: false, error: 'לא צוינה מילת מפתח ליצירת המאמר' };
  }

  const key = loadGeminiKey();
  if (!key) {
    return {
      ok: false,
      error: 'מפתח GEMINI_API_KEY חסר בקובץ .env.openai. אנא הגדר מפתח תקין.'
    };
  }

  const defaultModels = [
    process.env.GEMINI_MODEL,
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash'
  ].filter(Boolean);
  // remove duplicates while preserving order
  const candidateModels = [...new Set(defaultModels)];

  const kw = keyword.trim();
  const workTitle = title ? title.trim() : `${kw}: המדריך המקיף`;

  let lengthGuide = '';
  if (length === 'short') {
    lengthGuide = `
היקף מבוקש: קצר (כ-350 עד 500 מילים).
מבנה:
- פסקת מבוא ממוקדת עם מענה ישיר.
- 2-3 פרקים עם כותרות H2.
- סיכום תמציתי.
    `.trim();
  } else if (length === 'medium') {
    lengthGuide = `
היקף מבוקש: בינוני (כ-800 עד 1,200 מילים).
מבנה:
- פסקת פתיחה מקצועית.
- 4-5 פרקים מעמיקים עם כותרות H2 וכותרות משנה H3.
- רשימת טיפים מעשית (ul/li).
- פרק שאלות נפוצות (FAQ) עם 3 שאלות ותשובות.
- סיכום והנעה לפעולה.
    `.trim();
  } else {
    // long
    lengthGuide = `
היקף מבוקש: ארוך ומעמיק — מאמר עוגן (Pillar Page) בהיקף של 1,500 עד 2,500 מילים בעברית.
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
9. סיכום, טיפים ליישום מיידי, והנעה לפעולה (CTA) המכוונת למומחיות של דליה פתרונות רכב לחברות.
    `.trim();
  }

  const systemPrompt = `אתה מומחה תוכן ו-SEO בכיר בעברית, המתמחה בשוק הרכב, ניהול ציי רכב ותחבורה עסקית בישראל עבור חברת "דליה פתרונות רכב לחברות".
תפקידך לכתוב מאמר אורגני בעברית עשירה, מדויקת, מקצועית וטבעית, המותאם להנחיות Google Helpful Content ולחוויית משתמש מעולה.

הנחיות כתיבה ופורמט:
- השתמש ב-HTML סמנטי בלבד עבור גוף המאמר: <h2>, <h3>, <p>, <ul>, <li>, <ol>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <strong>.
- אל תכלול <h1> בגוף המאמר (הכותרת הראשית תוחזר בשדה title נפרד).
- המאמר חייב להיות כתוב בעברית תקנית, עשירה וקריאה, ללא תרגום מכונה, תוך שימוש במונחים המקצועיים המקובלים בישראל.
- שלב את מילת המפתח הראשית "${kw}" באופן טבעי בכותרת, בפסקה הראשונה, בחלק מכותרות ה-H2 ובגוף הטקסט.
- קהל היעד: ${audience}.
- שמור על הטון המקצועי והסמכותי של דליה.
- דגש קריטי לתקינות JSON: בכל תגיות ה-HTML או הטקסט, השתמש בגרש בודד (') או במירכאות עבריות (״) עבור attributes וציטוטים פנימיים, כדי להימנע משגיאות תחביר של מירכאות כפולות בתוך ה-JSON.

${lengthGuide}

החזר אך ורק אובייקט JSON תקין (ללא שום טקסט נוסף לפניו או אחריו) במבנה הבא:
{
  "title": "כותרת המאמר בעברית (כוללת את מילת המפתח)",
  "meta_description": "תיאור מטא ממוקד ומניע לקליק עד 155 תווים בעברית",
  "content_html": "תוכן המאמר המלא ב-HTML סמנטי",
  "word_count": מספר_מילים_משוער
}`;

  let userContent = `אנא כתוב עכשיו את המאמר המלא עבור:
מילת מפתח: "${kw}"
כותרת עבודה מוצעת: "${workTitle}"
אורך נדרש: "${length}"`;

  const outlineHeadings = outline && Array.isArray(outline.headings) ? outline.headings : [];
  if (outlineHeadings.length) {
    const lines = outlineHeadings.map((h, i) => {
      const h3s = Array.isArray(h.h3s) ? h.h3s.filter(Boolean) : [];
      const sub = h3s.map((x) => `  - H3: ${x}`).join('\n');
      return `H2 ${i + 1}: ${h.h2 || h.text || ''}${sub ? `\n${sub}` : ''}`;
    }).join('\n');
    userContent += `\n\nמבנה מאושר שחובה לעקוב אחריו, בלי לשנות את סדר הכותרות:\n${lines}\nאל תכלול תגיות img, figure, או כתובות URL של תמונות. התמונות מנוהלות בנפרד ואינן חלק מ-content_html.`;
    const approvedMeta = (outline.meta_description || meta_description || '').trim();
    if (approvedMeta) {
      userContent += `\nתיאור מטא מאושר (אפשר לדייק מעט, עד 155 תווים): ${approvedMeta}`;
    }
  }
  if (word_count && Number(word_count) > 0) {
    userContent += `\nמספר מילים יעד: ${Number(word_count)}.`;
  }

  let lastErrorResult = null;

  for (const currentModel of candidateModels) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${encodeURIComponent(key)}`;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userContent}` }] }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: length === 'long' ? 8192 : length === 'medium' ? 4096 : 2048,
            responseMimeType: 'application/json'
          }
        })
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        const err = data.error || {};
        const statusText = err.status || `HTTP_${response.status}`;
        const message = err.message || 'שגיאה לא ידועה מ-Gemini API';
        
        lastErrorResult = {
          ok: false,
          status: response.status,
          model: currentModel,
          errorCode: err.code || response.status,
          errorStatus: statusText,
          error: `שגיאת Gemini API (${statusText}) במודל ${currentModel}: ${message}`
        };

        // If high demand spike (503 / UNAVAILABLE), try next model in fallback list
        if (response.status === 503 || statusText === 'UNAVAILABLE' || response.status === 429) {
          continue;
        }
        return lastErrorResult;
      }

      const candidate = data.candidates?.[0];
      const rawText = candidate?.content?.parts?.[0]?.text;

      if (!rawText) {
        lastErrorResult = {
          ok: false,
          model: currentModel,
          error: `תשובת Gemini (${currentModel}) התקבלה ריקה (ללא תוכן)`
        };
        continue;
      }

      let parsed = null;
      let cleaned = rawText.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      }

      try {
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        // Fallback: fix trailing commas or braces
        const fixedTrailing = cleaned.replace(/,\s*([}\]])/g, '$1').replace(/\}\s*\}\s*$/, '}');
        try {
          parsed = JSON.parse(fixedTrailing);
        } catch (_) {
          // Robust regex extraction
          const titleMatch = cleaned.match(/"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
          const metaMatch = cleaned.match(/"meta_description"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
          const contentMatch = cleaned.match(/"content_html"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"word_count"|\s*\}[\s\S]*$)/);

          if (contentMatch) {
            parsed = {
              title: titleMatch ? titleMatch[1].replace(/\\"/g, '"') : workTitle,
              meta_description: metaMatch ? metaMatch[1].replace(/\\"/g, '"') : '',
              content_html: contentMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t')
            };
          } else {
            return {
              ok: false,
              model: currentModel,
              error: `שגיאה בפענוח JSON מתשובת Gemini: ${parseErr.message}`,
              rawText
            };
          }
        }
      }

      if (!parsed || !parsed.content_html) {
        return {
          ok: false,
          model: currentModel,
          error: 'תשובת Gemini אינה מכילה את השדה content_html הנדרש',
          parsed
        };
      }

      let contentHtml = parsed.content_html;
      if (outlineHeadings.length) contentHtml = stripGeneratedImages(contentHtml);

      // Calculate actual words in content_html
      const plainText = contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const actualWordCount = plainText ? plainText.split(/\s+/).length : 0;

      return {
        ok: true,
        action: 'article',
        model: currentModel,
        title: parsed.title || workTitle,
        meta_description: (parsed.meta_description || '').slice(0, 160),
        content_html: contentHtml,
        word_count: actualWordCount,
        length_requested: length,
        keyword: kw
      };

    } catch (networkErr) {
      lastErrorResult = {
        ok: false,
        model: currentModel,
        error: `שגיאת תקשורת מול Gemini API (${currentModel}): ${networkErr.message}`
      };
    }
  }

  return lastErrorResult || { ok: false, error: 'כל מודלי Gemini נכשלו או לא היו זמינים' };
}

/**
 * Suggest an article outline only. Does not write content_html and does not create images.
 * The legacy article call never enters this function.
 */
async function generateOutlineWithGemini({
  keyword,
  title = null,
  length = 'long',
  audience = 'מנהלי ציי רכב, בעלי חברות, מנהלי רכש וקציני בטיחות בתעבורה',
  word_count = null,
  h2_count = null,
  meta_description = ''
}) {
  if (!keyword || !String(keyword).trim()) {
    return { ok: false, error: 'לא צוינה מילת מפתח ליצירת המאמר' };
  }
  const key = loadGeminiKey();
  if (!key) {
    return { ok: false, error: 'מפתח GEMINI_API_KEY חסר בקובץ .env.openai. אנא הגדר מפתח תקין.' };
  }
  const candidateModels = [
    process.env.GEMINI_MODEL,
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash'
  ].filter(Boolean);
  const models = [...new Set(candidateModels)];
  const kw = String(keyword).trim();
  const n = Math.max(1, Math.min(12, Number(h2_count) || (length === 'short' ? 3 : length === 'medium' ? 5 : 6)));
  const systemPrompt = `אתה עורך SEO בעברית עבור "דליה פתרונות רכב לחברות".
החזר אך ורק JSON תקין של תוכנית מאמר, בלי גוף מאמר ובלי תמונות.
אל תכלול content_html, תגיות img, או כתובות URL.
קהל היעד: ${audience}.
מבנה:
{
  "title": "כותרת בעברית",
  "meta_description": "עד 155 תווים",
  "headings": [{ "h2": "כותרת H2", "h3s": ["כותרת H3"] }],
  "word_count": 800
}
מספר כותרות H2: בדיוק ${n}. לכל H2 עד שתי כותרות H3, רק אם הן נחוצות.`;
  let userContent = `מילת מפתח: "${kw}"
אורך: "${length}"
כותרת עבודה: "${title ? String(title).trim() : ''}"
תיאור מטא קיים: "${meta_description ? String(meta_description).trim() : ''}"`;
  if (word_count && Number(word_count) > 0) userContent += `\nמספר מילים יעד: ${Number(word_count)}`;

  let lastErrorResult = null;
  for (const currentModel of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${encodeURIComponent(key)}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userContent}` }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json'
          }
        })
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        const err = data.error || {};
        const statusText = err.status || `HTTP_${response.status}`;
        const message = err.message || 'שגיאה לא ידועה מ-Gemini API';
        lastErrorResult = {
          ok: false,
          status: response.status,
          model: currentModel,
          errorCode: err.code || response.status,
          errorStatus: statusText,
          error: `שגיאת Gemini API (${statusText}) במודל ${currentModel}: ${message}`
        };
        if (response.status === 503 || statusText === 'UNAVAILABLE' || response.status === 429) continue;
        return lastErrorResult;
      }
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        lastErrorResult = { ok: false, model: currentModel, error: `תשובת Gemini (${currentModel}) התקבלה ריקה (ללא תוכן)` };
        continue;
      }
      let cleaned = rawText.trim();
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      let parsed = null;
      try {
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        try { parsed = JSON.parse(cleaned.replace(/,\s*([}\]])/g, '$1')); }
        catch (_) {
          return { ok: false, model: currentModel, error: `שגיאה בפענוח JSON מתשובת Gemini: ${parseErr.message}` };
        }
      }
      const headings = normalizeOutlineHeadings(parsed?.headings, n);
      if (!headings.length) {
        return { ok: false, model: currentModel, error: 'תשובת Gemini אינה מכילה כותרות H2', parsed };
      }
      return {
        ok: true,
        action: 'outline',
        model: currentModel,
        title: parsed.title || (title ? String(title).trim() : `${kw}: המדריך המקיף`),
        meta_description: String(parsed.meta_description || meta_description || '').slice(0, 160),
        headings,
        word_count: Number(parsed.word_count) || (Number(word_count) || null),
        keyword: kw,
        length_requested: length
      };
    } catch (networkErr) {
      lastErrorResult = { ok: false, model: currentModel, error: `שגיאת תקשורת מול Gemini API (${currentModel}): ${networkErr.message}` };
    }
  }
  return lastErrorResult || { ok: false, error: 'כל מודלי Gemini נכשלו או לא היו זמינים' };
}
