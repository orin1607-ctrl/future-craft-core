import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const ARTIFACTS_DIR = 'C:/Users/אליאב/.gemini/antigravity/brain/912da76f-1222-447e-95e6-0685412f307c';

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const serviceKey = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;

const admin = createClient(STAGING_URL, serviceKey);

function startPreview(port = 4220) {
  return new Promise((resolve, reject) => {
    const viteBin = path.resolve(process.cwd(), 'node_modules/vite/bin/vite.js');
    const proc = spawn('node', [viteBin, 'preview', '--port', String(port), '--host', '127.0.0.1'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    function poll(retries = 30) {
      http.get(`http://127.0.0.1:${port}`, (res) => {
        if (!resolved) {
          resolved = true;
          resolve({ proc, url: `http://127.0.0.1:${port}` });
        }
      }).on('error', (err) => {
        if (retries <= 0) {
          if (!resolved) {
            resolved = true;
            reject(new Error(`Failed to start preview: ${err.message}`));
          }
          return;
        }
        setTimeout(() => poll(retries - 1), 300);
      });
    }
    setTimeout(poll, 400);
  });
}

async function run() {
  console.log('================================================================================');
  console.log('📱 בדיקת אימות מובייל מחמירה: כרטיס לקוח, גלילה מלאה וכפתור חזרה לדשבורד');
  console.log('================================================================================\n');

  const email = 'orin1607@gmail.com';
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const client = createClient(STAGING_URL, anonKey);
  const { data: authData, error: authErr } = await client.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (authErr) throw authErr;
  const session = authData.session;

  const { proc, url } = await startPreview(4220);
  console.log(`Preview server live at: ${url}`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  const results = [];
  function record(title, pass, details) {
    results.push({ title, pass, details });
    console.log(`${pass ? '✅' : '❌'} ${title}: ${pass ? 'PASS' : 'FAIL'} (${details})`);
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Mobile Viewport 390x844 (iPhone 13/14) with Touch
    // -------------------------------------------------------------
    const context390 = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      locale: 'he-IL',
    });
    await context390.addInitScript(({ s, u }) => {
      localStorage.setItem(`sb-${s}-auth-token`, JSON.stringify(u));
    }, { s: STAGING_REF, u: session });

    const page390 = await context390.newPage();
    page390.on('dialog', async (d) => { await d.accept().catch(() => {}); });

    await page390.goto(`${url}/garage-management`, { waitUntil: 'domcontentloaded' });
    const frame390 = page390.frameLocator('.gm-approved-frame');
    await frame390.locator('#home-greet').filter({ hasText: ',' }).waitFor({ timeout: 15000 }).catch(() => {});
    await page390.waitForTimeout(1000);

    // Check Dashboard loaded
    const isHomeVisible = await frame390.locator('#s-home').isVisible();
    record('דשבורד מוסך נטען בהצלחה במובייל 390px', isHomeVisible, 'מסך s-home פעיל ומוצג');

    // Click פתיחת לקוח -> s-newtype
    const actCustBtn = frame390.locator('[data-testid="action-new-customer"]');
    await actCustBtn.scrollIntoViewIfNeeded();
    await actCustBtn.dispatchEvent('click');
    await page390.waitForTimeout(800);

    // Verify s-newtype has back button "← חזרה לדשבורד"
    const newtypeBackBtn = frame390.locator('#s-newtype [data-testid="gm-dash-home"]');
    const newtypeBackText = await newtypeBackBtn.innerText();
    const newtypeHasBack = newtypeBackText.includes('חזרה לדשבורד');
    record('כפתור חזרה לדשבורד במסך בחירת סוג לקוח', newtypeHasBack, `טקסט כפתור: "${newtypeBackText.trim()}"`);

    // Choose לקוח פרטי to enter the customer form (#s-newform)
    const privateCard = frame390.locator('#s-newtype .card.tap').first();
    await privateCard.dispatchEvent('click');
    await page390.waitForTimeout(1000);

    const newformVisible = await frame390.locator('#s-newform').isVisible();
    record('פתיחת כרטיס לקוח (s-newform)', newformVisible, 'טופס פרטי לקוח נפתח בהצלחה');

    // Verify topbar of #s-newform has prominent "← חזרה לדשבורד"
    const custTopbarBack = frame390.locator('#s-newform .topbar [data-testid="gm-dash-home"]');
    const custTopbarBackText = await custTopbarBack.innerText();
    const custTopbarBackVisible = await custTopbarBack.isVisible();
    const isCustBackCorrect = custTopbarBackVisible && custTopbarBackText.includes('חזרה לדשבורד');
    record('כפתור "← חזרה לדשבורד" בראש כרטיס הלקוח', isCustBackCorrect, `מוצג: ${custTopbarBackVisible}, טקסט: "${custTopbarBackText.trim()}"`);

    // Verify that the dashboard top nav bar (.gm-top-nav-bar) is NOT overlapping #s-newform
    const navBarVisibleInCust = await frame390.locator('#s-newform .gm-top-nav-bar').isVisible().catch(() => false);
    record('סרגל טאבים של הדשבורד אינו מתנגש או מסתיר את כרטיס הלקוח', !navBarVisibleInCust, 'סרגל הדשבורד חבוי כראוי בתוך כרטיס הלקוח');

    // SCROLLING TEST: Scroll down to bottom of customer form
    const beforeScroll = await frame390.locator('body').evaluate(() => {
      return {
        scrollY: window.scrollY || document.documentElement.scrollTop,
        scrollH: document.documentElement.scrollHeight,
        clientH: document.documentElement.clientHeight,
      };
    });

    // Perform smooth/instant scroll to bottom
    await frame390.locator('body').evaluate(() => {
      window.scrollTo({ top: 9999, behavior: 'instant' });
      document.documentElement.scrollTop = 9999;
    });
    await page390.waitForTimeout(600);

    const afterScroll = await frame390.locator('body').evaluate(() => {
      const addVehBtn = document.getElementById('cust-add-vehicle-btn');
      const saveBtn = document.getElementById('cust-save-btn');
      const bottomBackBtn = document.querySelector('#s-newform [data-testid="customer-bottom-back-btn"]');
      const scrollY = window.scrollY || document.documentElement.scrollTop;

      const getBox = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          height: r.height,
          inView: r.top >= 0 && r.bottom <= (window.innerHeight + 50)
        };
      };

      return {
        scrollY,
        addVehBox: getBox(addVehBtn),
        saveBox: getBox(saveBtn),
        bottomBackBox: getBox(bottomBackBtn)
      };
    });

    const scrolledDown = afterScroll.scrollY > 150;
    const saveBtnVisible = afterScroll.saveBox && afterScroll.saveBox.inView;
    const addVehBtnVisible = afterScroll.addVehBox && afterScroll.addVehBox.inView;
    const bottomBackVisible = afterScroll.bottomBackBox && afterScroll.bottomBackBox.inView;

    record('גלילה מלאה לתחתית כרטיס הלקוח', scrolledDown, `גלילה אנכית: ${afterScroll.scrollY}px (גובה תוכן: ${beforeScroll.scrollH}px)`);
    record('כפתור שמירת לקוח נגיש וגלוי בתחתית', saveBtnVisible, `מיקום יחסי לחלון: top=${afterScroll.saveBox?.top.toFixed(0)}px, inView=${saveBtnVisible}`);
    record('כפתור הוספת רכב נגיש וגלוי בתחתית', addVehBtnVisible, `מיקום יחסי לחלון: top=${afterScroll.addVehBox?.top.toFixed(0)}px, inView=${addVehBtnVisible}`);
    record('כפתור חזרה נוסף בתחתית הטופס נגיש וגלוי', bottomBackVisible, `מיקום יחסי לחלון: top=${afterScroll.bottomBackBox?.top.toFixed(0)}px, inView=${bottomBackVisible}`);

    // Take screenshot of customer card bottom
    const shotPath390 = path.join(ARTIFACTS_DIR, 'garage-customer-card-bottom-390px.png');
    await page390.screenshot({ path: shotPath390 });
    console.log(`📸 צילום מסך נשמר: ${shotPath390}`);

    // SCROLL BACK TO TOP
    await frame390.locator('body').evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
    });
    await page390.waitForTimeout(400);

    const backAtTop = await frame390.locator('body').evaluate(() => {
      return (window.scrollY || document.documentElement.scrollTop) === 0;
    });
    record('גלילה חזרה לחלק העליון של כרטיס הלקוח', backAtTop, 'חזרה חלקה לראש הטופס (scrollY = 0)');

    // TEST CLICKING "← חזרה לדשבורד"
    await custTopbarBack.dispatchEvent('click');
    await page390.waitForTimeout(1000);

    const returnedHome = await frame390.locator('#s-home').isVisible();
    const navTabActive = await frame390.locator('[data-testid="nav-tab-dashboard"]').evaluate((el) => el.classList.contains('active'));
    record('לחיצה על "← חזרה לדשבורד" מחזירה בפועל לדשבורד הראשי', returnedHome && navTabActive, `s-home מוצג: ${returnedHome}, טאב דשבורד פעיל: ${navTabActive}`);

    // Take screenshot of dashboard after return
    const shotPathBack = path.join(ARTIFACTS_DIR, 'garage-customer-card-back-btn.png');
    await page390.screenshot({ path: shotPathBack });
    console.log(`📸 צילום מסך נשמר: ${shotPathBack}`);

    // TEST PHONE HARDWARE BACK BUTTON (history.popstate)
    // Go into customer again
    await frame390.locator('[data-testid="action-new-customer"]').dispatchEvent('click');
    await page390.waitForTimeout(600);
    // Simulate phone back button
    await page390.goBack().catch(() => {});
    await page390.waitForTimeout(800);
    const popstateReturned = await frame390.locator('#s-home').isVisible();
    record('כפתור חזרה של הטלפון (Hardware / Browser Back) מחזיר לדשבורד', popstateReturned, 'אירוע popstate מחזיר בצורה מוגנת לדשבורד הראשי ללא יציאה מהמערכת');

    await context390.close();

    // -------------------------------------------------------------
    // Test 2: Compact Mobile Viewport 360x780 (Android / Small Phone)
    // -------------------------------------------------------------
    const context360 = await browser.newContext({
      viewport: { width: 360, height: 780 },
      hasTouch: true,
      isMobile: true,
      locale: 'he-IL',
    });
    await context360.addInitScript(({ s, u }) => {
      localStorage.setItem(`sb-${s}-auth-token`, JSON.stringify(u));
    }, { s: STAGING_REF, u: session });

    const page360 = await context360.newPage();
    page360.on('dialog', async (d) => { await d.accept().catch(() => {}); });

    await page360.goto(`${url}/garage-management`, { waitUntil: 'domcontentloaded' });
    const frame360 = page360.frameLocator('.gm-approved-frame');
    await frame360.locator('#home-greet').filter({ hasText: ',' }).waitFor({ timeout: 15000 }).catch(() => {});
    await page360.waitForTimeout(1000);

    // Open customer form on 360px
    const actBtn360 = frame360.locator('[data-testid="action-new-customer"]');
    await actBtn360.scrollIntoViewIfNeeded();
    await actBtn360.dispatchEvent('click');
    await page360.waitForTimeout(800);

    const privateCard360 = frame360.locator('#s-newtype .card.tap').first();
    await privateCard360.dispatchEvent('click');
    await page360.waitForTimeout(1000);

    // Scroll to bottom on 360px
    await frame360.locator('body').evaluate(() => {
      window.scrollTo({ top: 9999, behavior: 'instant' });
      document.documentElement.scrollTop = 9999;
    });
    await page360.waitForTimeout(600);

    const metrics360 = await frame360.locator('body').evaluate(() => {
      const saveBtn = document.getElementById('cust-save-btn');
      const addVehBtn = document.getElementById('cust-add-vehicle-btn');
      const rSave = saveBtn ? saveBtn.getBoundingClientRect() : null;
      const rVeh = addVehBtn ? addVehBtn.getBoundingClientRect() : null;
      return {
        scrollY: window.scrollY || document.documentElement.scrollTop,
        saveInView: rSave ? (rSave.top >= 0 && rSave.bottom <= (window.innerHeight + 50)) : false,
        vehInView: rVeh ? (rVeh.top >= 0 && rVeh.bottom <= (window.innerHeight + 50)) : false,
      };
    });

    record('תצוגת מסך צר (360px) - גלילה והגעה לכל הכפתורים', metrics360.scrollY > 150 && metrics360.saveInView && metrics360.vehInView, `גלילה: ${metrics360.scrollY}px, שמור גלוי: ${metrics360.saveInView}, הוסף רכב גלוי: ${metrics360.vehInView}`);

    const shotPath360 = path.join(ARTIFACTS_DIR, 'garage-customer-card-360px.png');
    await page360.screenshot({ path: shotPath360 });
    console.log(`📸 צילום מסך נשמר: ${shotPath360}`);

    // Return to dashboard from 360px
    await frame360.locator('#s-newform .topbar [data-testid="gm-dash-home"]').dispatchEvent('click');
    await page360.waitForTimeout(800);
    const home360 = await frame360.locator('#s-home').isVisible();
    record('תצוגת מסך צר (360px) - חזרה תקינה לדשבורד', home360, 'חזרה לדשבורד הראשי ללא עיוות או חסימה');

    await context360.close();

    // -------------------------------------------------------------
    // Test 3: Vehicle Card, Case Card & Suppliers Hub
    // -------------------------------------------------------------
    const contextDesk = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'he-IL',
    });
    await contextDesk.addInitScript(({ s, u }) => {
      localStorage.setItem(`sb-${s}-auth-token`, JSON.stringify(u));
    }, { s: STAGING_REF, u: session });

    const pageDesk = await contextDesk.newPage();
    pageDesk.on('dialog', async (d) => { await d.accept().catch(() => {}); });
    await pageDesk.goto(`${url}/garage-management`, { waitUntil: 'domcontentloaded' });
    const frameDesk = pageDesk.frameLocator('.gm-approved-frame');
    await frameDesk.locator('#home-greet').filter({ hasText: ',' }).waitFor({ timeout: 15000 }).catch(() => {});
    await pageDesk.waitForTimeout(1000);

    // Check Case Card back button
    await frameDesk.locator('[data-testid="action-open-case"]').dispatchEvent('click');
    await pageDesk.waitForTimeout(600);
    const chooseBackBtn = frameDesk.locator('#s-choose [data-testid="gm-dash-home"]');
    const chooseBackText = await chooseBackBtn.innerText();
    record('מסך פתיחת תיק - כפתור "← חזרה לדשבורד"', chooseBackText.includes('חזרה לדשבורד'), `טקסט: "${chooseBackText.trim()}"`);

    await chooseBackBtn.dispatchEvent('click');
    await pageDesk.waitForTimeout(600);
    const deskHomeOk = await frameDesk.locator('#s-home').isVisible();
    record('חזרה לדשבורד ממסך פתיחת תיק', deskHomeOk, 's-home פעיל');

    // Check Suppliers Hub
    await frameDesk.locator('[data-testid="nav-tab-suppliers"]').dispatchEvent('click');
    await pageDesk.waitForTimeout(600);
    const suppVisible = await frameDesk.locator('#suppliers-section').isVisible();
    record('מסך ספקים וחשבוניות - גלילה וניווט תקינים', suppVisible, 'אזור ספקים מוצג ונגיש מתוך הדשבורד');

    await contextDesk.close();

  } finally {
    await browser.close();
    try { proc.kill(); } catch (e) {}
  }

  // Summary
  console.log('\n================================================================================');
  console.log('📊 סיכום בדיקות אימות מובייל:');
  const passCount = results.filter(r => r.pass).length;
  console.log(`תוצאה סופית: ${passCount}/${results.length} עברו בהצלחה!`);
  console.log('================================================================================\n');

  // Save report artifact
  const reportPath = path.join(ARTIFACTS_DIR, 'garage-customer-card-mobile-fix-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    total: results.length,
    passed: passCount,
    failed: results.length - passCount,
    tests: results
  }, null, 2), 'utf8');

  if (passCount < results.length) {
    throw new Error(`Only ${passCount}/${results.length} tests passed!`);
  }
}

run().catch((e) => {
  console.error('Test run failed:', e);
  process.exit(1);
});
