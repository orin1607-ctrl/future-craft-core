// scripts/generate-dalia-voice-clips-windows.ts
// Records every fixed Dalia sentence with the Hebrew voice built into Windows (Microsoft Asaf), offline and
// free, into public/dalia-voice/clips/<id>.wav and rewrites public/dalia-voice/manifest.json.
// This is the method already verified on the Samsung phone; scripts/generate-dalia-voice-clips.ts replaces
// these clips with Google Cloud TTS once a key is approved.
//
// Usage (Windows, Hebrew speech pack, PowerShell 7):  bun scripts/generate-dalia-voice-clips-windows.ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { allFixedDaliaSentences, speechClipId } from '../supabase/functions/_shared/daliaVoicePrompts';

const VOICE = 'Microsoft Asaf';
const RATE = 16000; // 16 kHz mono 16-bit: clear speech, ~32 KB per second
const outDir = join(process.cwd(), 'public', 'dalia-voice');
const clipDir = join(outDir, 'clips');
mkdirSync(clipDir, { recursive: true });

const sentences = allFixedDaliaSentences().map((text) => ({ id: speechClipId(text), text }));
const ids = new Set(sentences.map((s) => s.id));
if (ids.size !== sentences.length) throw new Error('clip id collision');

const listFile = join(tmpdir(), `dalia-clips-${Date.now()}.json`);
writeFileSync(listFile, JSON.stringify(sentences.map((s) => ({ ...s, file: join(clipDir, `${s.id}.wav`) }))), 'utf8');

const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$items = Get-Content -Raw -Encoding UTF8 -LiteralPath '${listFile.replace(/'/g, "''")}' | ConvertFrom-Json
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(${RATE}, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
foreach ($it in $items) {
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SelectVoice('${VOICE}')
  $s.SetOutputToWaveFile($it.file, $fmt)
  $s.Speak($it.text)
  $s.Dispose()
}
Write-Output ("done " + $items.Count)
`;
const psFile = join(tmpdir(), `dalia-clips-${Date.now()}.ps1`);
writeFileSync(psFile, `﻿${ps}`, 'utf8');
console.log(execFileSync('pwsh', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile], { encoding: 'utf8', shell: true }).trim());
unlinkSync(psFile);
unlinkSync(listFile);

/** Removes leading/trailing silence (keeps 80 ms padding) from a 16-bit mono PCM WAV. */
function trimSilence(buf: Buffer): Buffer {
  const dataStart = buf.indexOf('data') + 8;
  const samples = (buf.length - dataStart) >> 1;
  const threshold = 400;
  const pad = Math.round(RATE * 0.08);
  let first = 0;
  while (first < samples && Math.abs(buf.readInt16LE(dataStart + first * 2)) < threshold) first += 1;
  let last = samples - 1;
  while (last > first && Math.abs(buf.readInt16LE(dataStart + last * 2)) < threshold) last -= 1;
  if (first >= last) throw new Error('silent clip');
  first = Math.max(0, first - pad);
  last = Math.min(samples - 1, last + pad);
  const pcm = buf.subarray(dataStart + first * 2, dataStart + (last + 1) * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const clips: Record<string, { file: string; text: string }> = {};
let bytes = 0;
for (const s of sentences) {
  const path = join(clipDir, `${s.id}.wav`);
  const trimmed = trimSilence(readFileSync(path));
  writeFileSync(path, trimmed);
  bytes += trimmed.length;
  clips[s.id] = { file: `clips/${s.id}.wav`, text: s.text };
}
// drop clips of sentences that no longer exist
for (const f of readdirSync(clipDir)) {
  const id = f.replace(/\.(wav|mp3)$/, '');
  if (!ids.has(id) && existsSync(join(clipDir, f))) unlinkSync(join(clipDir, f));
}
writeFileSync(
  join(outDir, 'manifest.json'),
  `${JSON.stringify({ version: 1, voice: `${VOICE} (Windows built-in, generated offline)`, clips }, null, 2)}\n`,
);
console.log(`Done: ${sentences.length} clips, ${(bytes / 1024 / 1024).toFixed(1)} MB, voice ${VOICE}.`);
