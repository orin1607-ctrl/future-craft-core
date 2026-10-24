// supabase/functions/dalia-tts/index.ts
// Hebrew text-to-speech for Dalia AI (garage voice flows) via Google Cloud Text-to-Speech.
//
// Secrets (Supabase → Edge Functions → Secrets), none of them is ever returned to the client:
//   GOOGLE_TTS_API_KEY        required. A Google Cloud API key restricted to the Text-to-Speech API.
//                             Without it the function answers 503 {error:"not_configured"} and the
//                             browser falls back to clips / on-device voice.
//   GOOGLE_TTS_VOICE          optional, default "he-IL-Wavenet-A" (female). Any he-IL voice name works.
//   DALIA_TTS_ALLOW_DYNAMIC   optional, default off. Only "true" lets non-fixed sentences through
//                             (still blocked when they look like phones, IDs, plates or e-mails).
//                             Leave off until sending such text to Google is approved.
//
// Requests: POST {text} with the user's JWT. Response: {audioContent: base64 MP3, mimeType, voice}.

import { edgeCorsHeaders, requireAuth } from '../_shared/edgeAuth.ts';
import { containsLikelyPii, isFixedDaliaPrompt, normalizeSpeechKey } from '../_shared/daliaVoicePrompts.ts';

const MAX_CHARS = 400;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...edgeCorsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: edgeCorsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const auth = await requireAuth(req);
    if ('error' in auth) return auth.error;

    const apiKey = (Deno.env.get('GOOGLE_TTS_API_KEY') || '').trim();
    if (!apiKey) return json({ error: 'not_configured' }, 503);

    const body = await req.json().catch(() => ({}));
    const text = normalizeSpeechKey(typeof body?.text === 'string' ? body.text : '');
    if (!text) return json({ error: 'empty_text' }, 400);
    if (text.length > MAX_CHARS) return json({ error: 'too_long' }, 413);

    const fixed = isFixedDaliaPrompt(text);
    if (!fixed) {
      if (Deno.env.get('DALIA_TTS_ALLOW_DYNAMIC') !== 'true') return json({ error: 'dynamic_not_allowed' }, 403);
      if (containsLikelyPii(text)) return json({ error: 'pii_rejected' }, 422);
    }

    const voice = (Deno.env.get('GOOGLE_TTS_VOICE') || 'he-IL-Wavenet-A').trim();
    const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'he-IL', name: voice },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 },
      }),
    });
    if (!res.ok) {
      // Log status only — never the text or the key.
      console.error('dalia-tts provider error', res.status);
      return json({ error: 'provider_error', status: res.status }, 502);
    }
    const data = await res.json();
    if (!data?.audioContent) return json({ error: 'provider_empty' }, 502);
    console.log('dalia-tts ok', JSON.stringify({ fixed, chars: text.length, voice }));
    return json({ audioContent: data.audioContent, mimeType: 'audio/mpeg', voice });
  } catch (e) {
    console.error('dalia-tts unexpected', e instanceof Error ? e.name : 'unknown');
    return json({ error: 'internal_error' }, 500);
  }
});
