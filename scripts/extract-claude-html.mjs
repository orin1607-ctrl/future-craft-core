import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transcript = path.resolve(
  process.env.USERPROFILE || '',
  '.cursor/projects/c-Users-OneDrive/agent-transcripts/24d98172-e2c8-49b4-9adf-0f8c923a3aea/24d98172-e2c8-49b4-9adf-0f8c923a3aea.jsonl'
);
const out = path.join(__dirname, '../public/ai-marketing/claude-source.html');

const lines = fs.readFileSync(transcript, 'utf8').split('\n');
let html = '';

for (const line of lines) {
  if (!line.includes('screen-hub') || !line.includes('<!DOCTYPE html>')) continue;
  try {
    const j = JSON.parse(line);
    const text = (j.message?.content || [])
      .map((c) => c.text || '')
      .join('');
    const m = text.match(/<!DOCTYPE html>[\s\S]*<\/html>/);
    if (m && m[0].includes('id="screen-hub"')) {
      html = m[0];
      break;
    }
  } catch {
    /* skip */
  }
}

if (!html) {
  console.error('Claude HTML not found in transcript');
  process.exit(1);
}

fs.writeFileSync(out, html, 'utf8');
console.log('Wrote', out, 'bytes:', html.length);
