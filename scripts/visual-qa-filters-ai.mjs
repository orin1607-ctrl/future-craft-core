import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const f = path.join(path.resolve('public'), decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

await new Promise((r) => server.listen(8998, r));
const url = 'http://localhost:8998/openprospector.html';

const outDir = 'backups/qa-shots-filters-ai';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const artifactsDir = 'C:\\Users\\אליאב\\.gemini\\antigravity\\brain\\912da76f-1222-447e-95e6-0685412f307c';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

console.log('Navigating to', url);
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.S && S.remoteStatus === 'connected', null, { timeout: 30000 });

// Switch to companies tab
await page.click('.tabs button[data-tab="companies"]');
await page.waitForTimeout(500);

// Helper to get displayed count chip
async function getCount() {
  return await page.evaluate(() => {
    const chip = document.querySelector('.card-h .chip.num');
    if (!chip) return 0;
    const match = chip.textContent.match(/(\d+)\s*מתוך\s*(\d+)/);
    return match ? { filtered: parseInt(match[1]), total: parseInt(match[2]) } : null;
  });
}

console.log('--- Testing Filters in Live UI ---');

// 1. Initial unfiltered count
const initialCount = await getCount();
console.log('Initial count:', initialCount);
if (!initialCount || initialCount.filtered !== 618 || initialCount.total !== 618) {
  throw new Error(`Expected 618 total, got ${JSON.stringify(initialCount)}`);
}

// 2. Filter: Has Contact ("יש איש קשר")
await page.selectOption('#f-contact', 'yes');
await page.waitForTimeout(300);
const hasContactCount = await getCount();
console.log('Filter "יש איש קשר":', hasContactCount);
if (![606, 607].includes(hasContactCount.filtered)) throw new Error(`Expected 606 or 607, got ${hasContactCount.filtered}`);

// 3. Filter: No Contact ("אין איש קשר")
await page.selectOption('#f-contact', 'no');
await page.waitForTimeout(300);
const noContactCount = await getCount();
console.log('Filter "אין איש קשר":', noContactCount);
if (![11, 12].includes(noContactCount.filtered)) throw new Error(`Expected 11 or 12, got ${noContactCount.filtered}`);
if (hasContactCount.filtered + noContactCount.filtered !== 618) throw new Error('Sum does not match 618!');

// 4. Reset contact filter, test Phone
await page.selectOption('#f-contact', '');
await page.selectOption('#f-phone', 'yes');
await page.waitForTimeout(300);
const hasPhoneCount = await getCount();
console.log('Filter "יש טלפון":', hasPhoneCount);
if (![596, 597].includes(hasPhoneCount.filtered)) throw new Error(`Expected 596 or 597, got ${hasPhoneCount.filtered}`);

await page.selectOption('#f-phone', 'no');
await page.waitForTimeout(300);
const noPhoneCount = await getCount();
console.log('Filter "אין טלפון":', noPhoneCount);
if (![21, 22].includes(noPhoneCount.filtered)) throw new Error(`Expected 21 or 22, got ${noPhoneCount.filtered}`);
if (hasPhoneCount.filtered + noPhoneCount.filtered !== 618) throw new Error('Sum does not match 618!');

// 5. Test Quality Color Filters
await page.selectOption('#f-phone', '');
await page.selectOption('#f-qualColor', 'green');
await page.waitForTimeout(300);
const greenCount = await getCount();
console.log('Filter "🟢 ירוק":', greenCount);
if (greenCount.filtered !== 42) throw new Error(`Expected 42, got ${greenCount.filtered}`);

await page.selectOption('#f-qualColor', 'yellow');
await page.waitForTimeout(300);
const yellowCount = await getCount();
console.log('Filter "🟡 צהוב":', yellowCount);
if (yellowCount.filtered !== 571) throw new Error(`Expected 571, got ${yellowCount.filtered}`);

await page.selectOption('#f-qualColor', 'red');
await page.waitForTimeout(300);
const redCount = await getCount();
console.log('Filter "🔴 אדום":', redCount);
if (redCount.filtered !== 5) throw new Error(`Expected 5, got ${redCount.filtered}`);
if (greenCount.filtered + yellowCount.filtered + redCount.filtered !== 618) throw new Error('Sum does not match 618!');

// 6. Test Combined Filter: Yellow + Has Phone
await page.selectOption('#f-qualColor', 'yellow');
await page.selectOption('#f-phone', 'yes');
await page.waitForTimeout(300);
const yellowPhoneCount = await getCount();
console.log('Combined Filter "🟡 צהוב + יש טלפון":', yellowPhoneCount);
if (![549, 550].includes(yellowPhoneCount.filtered)) throw new Error(`Expected 549 or 550, got ${yellowPhoneCount.filtered}`);

// 7. Capture Screenshot 1: Fixed Filters Table
const shot1Path = `${outDir}/qa-fixed-filters.png`;
await page.screenshot({ path: shot1Path, fullPage: false });
if (fs.existsSync(artifactsDir)) {
  fs.copyFileSync(shot1Path, path.join(artifactsDir, 'qa-fixed-filters.png'));
}
console.log('[PASS] Screenshot 1 saved: qa-fixed-filters.png');

// Clear filters
await page.click('button.hide-m-btn[data-act="clearCoFilters"]');
await page.waitForTimeout(300);

// 8. Test General AI Assistant
console.log('--- Testing General AI Assistant ---');
await page.click('button[data-act="openAiChat"]');
await page.waitForSelector('.ai-chat-panel', { timeout: 5000 });
console.log('AI Chat panel opened successfully');

// Ask stats question
await page.fill('#aiChatInput', 'כמה לידים יש ומה חלוקת האיכות?');
await page.click('button[data-act="aiChatSend"]');
await page.waitForTimeout(600);

// Ask missing phone question via chip
await page.click('.ai-chat-f button[data-act="aiChatQuickPrompt"][data-prompt*="בלי טלפון"]');
await page.waitForTimeout(600);

// Close AI Chat
await page.click('.ai-chat-h button[data-act="closeAiChat"]');
await page.waitForTimeout(300);

// 9. Test Lead Drawer integration with AI Assistant
console.log('--- Testing Lead Drawer + AI Assistant Context ---');
// Click on first row to open drawer
await page.click('table.co tbody tr:first-child td.co-main');
await page.waitForSelector('#panel .panel', { timeout: 5000 });
console.log('Lead Drawer opened');

// Click "🤖 שאל את ה-AI על ליד זה"
await page.click('button[data-act="askAiAboutLead"]');
await page.waitForSelector('.ai-chat-panel', { timeout: 5000 });
console.log('AI Chat opened with Lead Context');

// Ask "מה חסר לליד זה?" via quick chip
await page.click('.ai-chat-panel .ai-prompt-chips button[data-act="aiChatQuickPrompt"][data-prompt*="מה חסר"]');
await page.waitForTimeout(600);

// Ask "האם כדאי להעביר להעשרת AI?" via quick chip to test Action Card
await page.click('.ai-chat-panel .ai-prompt-chips button[data-act="aiChatQuickPrompt"][data-prompt*="להעשרת AI"]');
await page.waitForTimeout(800);

// Verify Action Card exists with Confirm / Cancel buttons
const hasActionCard = await page.evaluate(() => {
  const card = document.querySelector('.ai-action-card');
  const confirmBtn = document.querySelector('button[data-act="aiChatConfirmAction"]');
  const cancelBtn = document.querySelector('button[data-act="aiChatCancelAction"]');
  return !!(card && confirmBtn && cancelBtn);
});
console.log('Interactive Action Card rendered:', hasActionCard);
if (!hasActionCard) throw new Error('Action card with interactive confirmation not found!');

// 10. Capture Screenshot 2: AI Chat Assistant with Action Card and Drawer Context
const shot2Path = `${outDir}/qa-ai-chat-assistant.png`;
await page.screenshot({ path: shot2Path, fullPage: false });
if (fs.existsSync(artifactsDir)) {
  fs.copyFileSync(shot2Path, path.join(artifactsDir, 'qa-ai-chat-assistant.png'));
}
console.log('[PASS] Screenshot 2 saved: qa-ai-chat-assistant.png');

await browser.close();
server.close();
console.log('\n=== ALL FILTER AND AI ASSISTANT QA TESTS PASSED! ===');
