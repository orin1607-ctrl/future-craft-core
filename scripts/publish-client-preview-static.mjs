#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const slugIdx = args.indexOf('--slug');
const slug = slugIdx >= 0 ? args[slugIdx + 1] : 'dalia-c-official';

const outDir = join(ROOT, 'public', 'client-previews', slug);
mkdirSync(outDir, { recursive: true });

const bundle = {
  company: 'דליה',
  pages: [
    { fileName: 'index.html', html: '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>בית</title></head><body><h1>בית</h1><nav><a href="fleet-management-software.html">FleetOS</a> | <a href="contact.html">צור קשר</a></nav></body></html>' },
    { fileName: 'fleet-management-software.html', html: '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>FleetOS</title></head><body><h1>תוכנת ניהול צי רכב</h1><a href="index.html">חזרה</a></body></html>' },
    { fileName: 'contact.html', html: '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>צור קשר</title></head><body><h1>צור קשר</h1><a href="index.html">חזרה</a></body></html>' },
  ],
};

bundle.pages.forEach((p) => writeFileSync(join(outDir, p.fileName), p.html, 'utf8'));
writeFileSync(join(outDir, 'TEMP-PREVIEW-NOTICE.md'), '# TEMP Preview\n', 'utf8');
console.log(JSON.stringify({ ok: true, slug, outDir }, null, 2));
