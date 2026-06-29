import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const requiredFiles = [
  "sites/dalia-new/index.html",
  "sites/dalia-new/צור-קשר/index.html",
  "sites/dalia-new/חבילות-ניהול-צי/index.html",
  "sites/dalia-new/assets/styles.css",
  "sites/dalia-new/assets/layout.js",
  "docs/audit-reports/mission-35-wave1/APPROVAL-HE.md",
  "docs/audit-reports/mission-35-wave1/REDIRECT-MAP.json",
  "docs/audit-reports/mission-35-wave1/REDIRECT-MAP-HE.md",
  "docs/audit-reports/mission-35-wave1/REPORT-HE.md"
];

for (const rel of requiredFiles) {
  await access(path.join(root, rel));
}

const pages = [
  "sites/dalia-new/index.html",
  "sites/dalia-new/צור-קשר/index.html",
  "sites/dalia-new/חבילות-ניהול-צי/index.html"
];

for (const rel of pages) {
  const html = await readFile(path.join(root, rel), "utf8");
  if (!html.includes('lang="he"') || !html.includes('dir="rtl"')) {
    throw new Error(`Missing Hebrew RTL declarations in ${rel}`);
  }
  if (!html.includes("<h1>")) {
    throw new Error(`Missing H1 in ${rel}`);
  }
}

console.log("Mission 35 Wave 1 verification passed.");
