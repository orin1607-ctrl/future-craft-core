import { loadGeminiKey } from './_lib/ai-env.mjs';

/**
 * Gemini Article Generator for Dalia / OpenSEO
 * Connects directly to Google Generative Language API using GEMINI_API_KEY from .env.openai
 */
export async function generateArticleWithGemini({
  keyword,
  title = null,
  length = 'long', // 'short' | 'medium' | 'long'
  plan = null,
  audience = 'מנהלי ציי רכב, בעלי חברות, מנהלי רכש וקציני בטיחות בתעבורה'
}) {
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

  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
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

${lengthGuide}

החזר אך ורק אובייקט JSON תקין (ללא שום טקסט נוסף לפניו או אחריו) במבנה הבא:
{
  "title": "כותרת המאמר בעברית (כוללת את מילת המפתח)",
  "meta_description": "תיאור מטא ממוקד ומניע לקליק עד 155 תווים בעברית",
  "content_html": "תוכן המאמר המלא ב-HTML סמנטי",
  "word_count": מספר_מילים_משוער
}`;

  const userContent = `אנא כתוב עכשיו את המאמר המלא עבור:
מילת מפתח: "${kw}"
כותרת עבודה מוצעת: "${workTitle}"
אורך נדרש: "${length}"`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    
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
      return {
        ok: false,
        status: response.status,
        model,
        errorCode: err.code || response.status,
        errorStatus: statusText,
        error: `שגיאת Gemini API (${statusText}): ${message}`
      };
    }

    const candidate = data.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text;

    if (!rawText) {
      return {
        ok: false,
        model,
        error: 'תשובת Gemini התקבלה ריקה (ללא תוכן)'
      };
    }

    let parsed = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // If wrapped in ```json ... ```
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      try {
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        return {
          ok: false,
          model,
          error: `שגיאה בפענוח JSON מתשובת Gemini: ${parseErr.message}`,
          rawText
        };
      }
    }

    if (!parsed || !parsed.content_html) {
      return {
        ok: false,
        model,
        error: 'תשובת Gemini אינה מכילה את השדה content_html הנדרש',
        parsed
      };
    }

    // Calculate actual words in content_html
    const plainText = parsed.content_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const actualWordCount = plainText ? plainText.split(' ').length : 0;

    return {
      ok: true,
      model,
      title: parsed.title || workTitle,
      meta_description: (parsed.meta_description || '').slice(0, 160),
      content_html: parsed.content_html,
      word_count: actualWordCount,
      length_requested: length,
      keyword: kw
    };

  } catch (networkErr) {
    return {
      ok: false,
      model,
      error: `שגיאת תקשורת מול Gemini API: ${networkErr.message}`
    };
  }
}
