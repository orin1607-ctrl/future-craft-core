import { loadGeminiKey } from './_lib/ai-env.mjs';

/**
 * Gemini Image Generator for Dalia / OpenSEO
 * Connects directly to Google Generative Language API using GEMINI_API_KEY from .env.openai / .env.local
 * Uses verified image generation models (gemini-2.5-flash-image, gemini-3.1-flash-image, gemini-3-pro-image)
 * The API key is kept strictly on the backend and is never logged or exposed.
 */

const CANDIDATE_IMAGE_MODELS = [
  process.env.GEMINI_IMAGE_MODEL,
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image'
].filter(Boolean);

export function buildImagePrompt({ prompt = '', role = 'hero', keyword = '', title = '', h2Context = '' } = {}) {
  const isHero = role === 'hero';
  const cleanKeyword = String(keyword || '').trim();
  const cleanTitle = String(title || '').trim();
  const cleanH2 = String(h2Context || '').trim();
  const userPrompt = String(prompt || '').trim();

  let subject = userPrompt;
  if (!subject) {
    if (isHero) {
      subject = cleanTitle || cleanKeyword
        ? `A professional corporate fleet of commercial vehicles and modern company cars neatly organized outside an Israeli business logistics center, representing "${cleanTitle || cleanKeyword}"`
        : 'A professional corporate fleet of commercial vehicles and company cars outside a modern business headquarters in Israel';
    } else {
      subject = cleanH2
        ? `A professional automotive operational setting showing ${cleanH2}, vehicle fleet maintenance and transport safety inspection in Israel`
        : `A certified fleet safety inspector conducting an automotive vehicle inspection and maintenance review`;
    }
  }

  const aspectSpec = isHero ? '16:9 widescreen aspect ratio' : '16:9 standard photographic aspect ratio';
  const guidelines = `Professional commercial photography, crisp focus, natural bright daylight, authentic modern Israeli business setting. Photorealistic, 8k resolution, cinematic commercial lighting. IMPORTANT NEGATIVE CONSTRAINTS: absolutely no text, no words, no letters, no typography, no watermarks, no imaginary car brand logos, no fake emblems, no distorted license plates, no cartoonish elements.`;

  return `${subject}. ${aspectSpec}. ${guidelines}`;
}

export async function generateImageWithGemini({
  prompt = '',
  role = 'hero',
  keyword = '',
  title = '',
  h2Context = ''
} = {}) {
  const key = loadGeminiKey();
  if (!key) {
    return {
      ok: false,
      error: 'מפתח GEMINI_API_KEY חסר בקובץ .env.openai. אנא הגדר מפתח תקין.'
    };
  }

  const finalPrompt = buildImagePrompt({ prompt, role, keyword, title, h2Context });
  const models = [...new Set(CANDIDATE_IMAGE_MODELS)];

  let lastErrorResult = null;

  for (const model of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: finalPrompt }]
            }
          ]
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.error) {
        const err = data.error || {};
        const statusText = err.status || `HTTP_${response.status}`;
        const message = err.message || 'שגיאה לא ידועה מ-Gemini Image API';

        lastErrorResult = {
          ok: false,
          status: response.status,
          model,
          errorStatus: statusText,
          error: `שגיאת Gemini Image API (${statusText}) במודל ${model}: ${message}`
        };

        if (response.status === 503 || statusText === 'UNAVAILABLE' || response.status === 429) {
          continue;
        }
        return lastErrorResult;
      }

      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const imagePart = parts.find((p) => p.inlineData && p.inlineData.data);

      if (!imagePart) {
        lastErrorResult = {
          ok: false,
          model,
          error: `תשובת המודל ${model} לא כללה נתוני תמונה (inlineData)`
        };
        continue;
      }

      const mimeType = imagePart.inlineData.mimeType || 'image/png';
      const base64Data = imagePart.inlineData.data;
      const dataUrl = `data:${mimeType};base64,${base64Data}`;

      return {
        ok: true,
        model,
        role,
        mimeType,
        dataUrl,
        promptUsed: finalPrompt
      };
    } catch (netErr) {
      lastErrorResult = {
        ok: false,
        model,
        error: `שגיאת תקשורת ביצירת תמונה מול Gemini (${model}): ${netErr.message}`
      };
    }
  }

  return lastErrorResult || { ok: false, error: 'כל מודלי התמונות של Gemini נכשלו' };
}
