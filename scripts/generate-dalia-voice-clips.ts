// scripts/generate-dalia-voice-clips.ts
// Pre-records every fixed Dalia sentence (no customer data) as an MP3 under public/dalia-voice/clips
// and writes public/dalia-voice/manifest.json. The browser plays these first, with no network TTS call.
//
// Usage (run once by the owner after Google Cloud Text-to-Speech is enabled):
//   GOOGLE_TTS_API_KEY=... [GOOGLE_TTS_VOICE=he-IL-Wavenet-A] bun scripts/generate-dalia-voice-clips.ts
// The key is read from the environment only and is never written to disk.

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allFixedDaliaSentences, speechClipId } from '../supabase/functions/_shared/daliaVoicePrompts';

const apiKey = (process.env.GOOGLE_TTS_API_KEY || '').trim();
const voice = (process.env.GOOGLE_TTS_VOICE || 'he-IL-Wavenet-A').trim();
if (!apiKey) {
  console.error('GOOGLE_TTS_API_KEY is not set — nothing generated.');
  process.exit(1);
}

const outDir = join(process.cwd(), 'public', 'dalia-voice');
const clipDir = join(outDir, 'clips');
mkdirSync(clipDir, { recursive: true });
const manifestPath = join(outDir, 'manifest.json');
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { clips: {} };
const sameVoice = previous.voice === voice;

const clips: Record<string, { file: string; text: string }> = {};
let made = 0;
for (const text of allFixedDaliaSentences()) {
  const id = speechClipId(text);
  const file = `clips/${id}.mp3`;
  if (sameVoice && previous.clips?.[id] && existsSync(join(outDir, file))) {
    clips[id] = { file, text };
    continue;
  }
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
    console.error(`Google TTS failed (${res.status}) for clip ${id}`);
    process.exit(1);
  }
  const data = (await res.json()) as { audioContent?: string };
  if (!data.audioContent) {
    console.error(`Empty audio for clip ${id}`);
    process.exit(1);
  }
  writeFileSync(join(outDir, file), Buffer.from(data.audioContent, 'base64'));
  clips[id] = { file, text };
  made += 1;
}

writeFileSync(manifestPath, `${JSON.stringify({ version: 1, voice, clips }, null, 2)}\n`);
console.log(`Done: ${Object.keys(clips).length} clips (${made} new) with voice ${voice}.`);
