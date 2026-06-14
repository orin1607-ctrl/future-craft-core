/** Upload permanent QA sample files to Staging public storage. */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;

function loadServiceKey() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  return JSON.parse(raw).find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key;
}

const pdf = Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const jpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=', 'base64');

async function main() {
  const admin = createClient(STAGING_URL, loadServiceKey());
  for (const [name, buf, type] of [
    ['qa-samples/sample.pdf', pdf, 'application/pdf'],
    ['qa-samples/sample.png', png, 'image/png'],
    ['qa-samples/sample.jpg', jpg, 'image/jpeg'],
  ]) {
    const { error } = await admin.storage.from('documents').upload(name, buf, { contentType: type, upsert: true });
    console.log(name, error?.message || 'OK');
  }
}

main().catch(console.error);
