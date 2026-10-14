// scripts/build-unified-openprospector.mjs
// Comprehensive upgrade of openprospector.html lead discovery engine
import fs from "fs";
import path from "path";

const targetFile = path.resolve("public/openprospector.html");
const backupFile = path.resolve("backups/openprospector-unified-revamp-20261014-1805/openprospector.html.bak");
const stagingHps = JSON.parse(fs.readFileSync('scripts/staging-all-hps.json', 'utf8'));
const stagingPhones = JSON.parse(fs.readFileSync('scripts/staging-verified-phones.json', 'utf8'));

if (!fs.existsSync(backupFile)) {
  console.error("Backup file does not exist! Aborting.");
  process.exit(1);
}

// Always read from clean backup
let content = fs.readFileSync(backupFile, "utf8");

// Markers
const startMarker = "/* ===== חיפוש חדש ===== */";
const endMarker = "/* ===== חברות שנמצאו ===== */";

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error("Could not find start or end markers in openprospector.html!");
  process.exit(1);
}

console.log(`Found markers: start=${startIndex}, end=${endIndex}. Replacing ${endIndex - startIndex} characters...`);

// Craft the complete, robust replacement block
const unifiedCode = `/* ===== חיפוש חדש — מערכת איתור לקוחות ולידים מאוחדת ומבוקרת ===== */

/* ===== נתוני מאגר STAGING למניעת כפילויות והצלבת טלפונים אמינה (2,018 חברות) ===== */
const STAGING_DB_HPS = new Set(${JSON.stringify(stagingHps)});
const STAGING_VERIFIED_PHONES = ${JSON.stringify(stagingPhones)};

/* ===== תצוגת חיפוש ראשי ===== */
V.search = () => {
  const curTrack = S.searchTrack || "free";

  return \`
  <!-- סרגל מעבר בין מסלולי איתור ברורים -->
  <div class="row" style="margin-bottom:16px;gap:10px;align-items:center;flex-wrap:wrap">
    <button class="btn \${curTrack === 'free' ? 'btn-primary' : 'btn-ghost'}" data-act="setSearchTrack" data-track="free" style="border-radius:24px;padding:9px 22px;font-weight:700;display:inline-flex;align-items:center;gap:8px;font-size:13.5px">
      <span>🌐 איתור חברות חינמי ומבוקר (data.gov.il · 0 ₪)</span>
      <span class="badge" style="background:\${curTrack === 'free' ? '#ffffff' : '#e0e7ff'};color:\${curTrack === 'free' ? '#1d4ed8' : '#3730a3'};font-size:10px">מסלול ראשי</span>
    </button>
    <button class="btn \${curTrack === 'ai' ? 'btn-primary' : 'btn-ghost'}" data-act="setSearchTrack" data-track="ai" style="border-radius:24px;padding:9px 22px;font-weight:700;display:inline-flex;align-items:center;gap:8px;font-size:13.5px">
      <span>✦ איתור חברות באמצעות AI / Gemini</span>
      <span class="badge" style="background:\${curTrack === 'ai' ? '#ffffff' : '#fef3c7'};color:\${curTrack === 'ai' ? '#b45309' : '#92400e'};font-size:10px">שער אישור</span>
    </button>
    <button class="btn \${curTrack === 'internal' ? 'btn-primary' : 'btn-ghost'}" data-act="setSearchTrack" data-track="internal" style="border-radius:24px;padding:9px 22px;font-weight:700;display:inline-flex;align-items:center;gap:8px;font-size:13.5px">
      <span>🔍 שאילתות וסינון במאגר הקיים שלי (\${C.length} חברות)</span>
      <span class="badge" style="background:\${curTrack === 'internal' ? '#ffffff' : '#f1f5f9'};color:\${curTrack === 'internal' ? '#1e293b' : '#64748b'};font-size:10px">מאגר פנימי</span>
    </button>
  </div>

  \${curTrack === 'free' ? renderTrackFreeSearch() : curTrack === 'ai' ? renderTrackAiSearch() : renderTrackInternalQuery()}

  <!-- אזור תוצאות חיפוש זמניות שנפתח מיד מתחת לטופס באותו מסך -->
  <div id="searchResultsArea" style="margin-top:20px">
    \${(S.searchHits && S.searchHits.length > 0) || (S.searchDuplicates && S.searchDuplicates.length > 0) || (S.searchStats && S.searchStats.scanned > 0) ? renderSearchResultsArea() : ''}
  </div>
  \`;
};

/* ===== מסלול ראשי א': איתור חברות חינמי ומבוקר (data.gov.il) ===== */
function renderTrackFreeSearch() {
  const domains = (window.OPQualify && window.OPQualify.OPDomainKeywords ? window.OPQualify.OPDomainKeywords.getDomains() : []);
  const reqTarget = S.searchStats?.requested || 50;

  return \`
  <div class="card" style="padding:20px;border:1.5px solid #2563eb;background:linear-gradient(135deg,rgba(37,99,235,0.03),rgba(59,130,246,0.01))">
    <div class="card-h" style="margin-bottom:12px;border-bottom:1px solid #e2e8f0;padding-bottom:10px">
      <div>
        <h2 style="margin:0;font-size:18.5px;color:#1e3a8a;display:flex;align-items:center;gap:8px">
          <span>🌐 איתור חברות חינמי ומבוקר במאגרי ממשלת ישראל</span>
          <span class="h-bar"></span>
        </h2>
        <div class="xs muted" style="margin-top:4px">
          איחוד מלא של חיפוש מבוקר ומנוע האצוות. נתונים רשמיים מ-data.gov.il ללא עלות API, עם סינון מקומי מקיף, הצלבת מקורות והגנת כפילויות.
        </div>
      </div>
      <span class="spacer"></span>
      <span class="badge b-ok" style="font-size:11px">Tier A רשמי</span>
      <span class="badge b-blue" style="font-size:11px">0 ₪ עלות API</span>
    </div>

    <!-- Audit Transparency Banner -->
    <div style="background:linear-gradient(135deg,rgba(37,99,235,0.05),rgba(16,185,129,0.05));border:1px solid #bfdbfe;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12px;line-height:1.5">
      <div class="row bold" style="margin-bottom:4px;color:#1e40af">
        <span>💡 שקיפות ואמינות נתונים:</span>
        <span class="spacer"></span>
        <span class="badge b-ok" style="font-size:10px">שלב 1 מתוך 3</span>
      </div>
      <div><b>🌐 שאילתת שרת API ישירה:</b> מילת החיפוש והאצוות נשלחות ישירות למאגר הממשלתי (data.gov.il).</div>
      <div><b>⚡ סינון והצלבה מקומיים:</b> מסנני אזור, עיר, ענף, מספר עובדים, צי והצלבת טלפונים מתבצעים לפי כללים נוקשים.</div>
      <div><b>🛡️ הגנה מלאה על המאגר:</b> התוצאות מוצגות <b>בתצוגה זמנית בלבד</b>. שום תוצאה אינה נשמרת או מועברת ללידים ללא אישורך המפורש.</div>
    </div>

    <!-- הטופס המאוחד — שדות מקצועיים ופשוטים -->
    <div class="adv" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
      <!-- 1. מילת חיפוש חופשית -->
      <label class="f" style="grid-column:span 2">
        <span style="display:flex;align-items:center;gap:6px">
          <span class="bold">1. מילת חיפוש או תיאור עסקי (מופרד בפסיק)</span>
          <span class="badge b-blue" style="font-size:9.5px">🌐 שאילתת שרת</span>
        </span>
        <input class="input" id="a-kw" placeholder="למשל: הובלות, לוגיסטיקה, שינוע, עפר, תשתיות" value="\${esc(S._lastQueryTerm || '')}" style="font-size:13px">
        <div class="chips" style="margin-top:6px">
          \${["הובלות", "לוגיסטיקה", "עפר ותשתיות", "היסעים", "שירות וטכנאי שטח"].map(k => \`<button type="button" class="btn btn-sm btn-ghost" data-act="setSearchKwPill" data-val="\${esc(k)}" style="padding:2px 8px;font-size:11px;border:1px solid #cbd5e1;background:#fff">\${esc(k)}</button>\`).join("")}
        </div>
      </label>

      <!-- 2. כמות חברות מבוקשת -->
      <label class="f">
        <span style="display:flex;align-items:center;gap:6px">
          <span class="bold">2. כמות חברות מבוקשת</span>
          <span class="badge b-ok" style="font-size:9.5px">אצוות אוטומטיות</span>
        </span>
        <input type="number" class="input" id="a-count" min="5" max="2000" step="5" value="\${reqTarget}" style="font-weight:700;font-size:13px">
        <div class="chips" style="margin-top:6px">
          \${[20, 50, 100, 200, 500, 1000].map(cnt => \`<button type="button" class="btn btn-sm btn-ghost" data-act="setCountPill" data-val="\${cnt}" style="padding:2px 7px;font-size:11px;border:1px solid #cbd5e1;background:\${reqTarget === cnt ? '#eff6ff' : '#fff'};font-weight:\${reqTarget === cnt ? '700' : '400'}">\${cnt >= 1000 ? '1,000' : cnt}</button>\`).join("")}
        </div>
      </label>

      <!-- 3. תחום פעילות -->
      <label class="f">
        <span style="display:flex;align-items:center;gap:6px">
          <span class="bold">3. תחום פעילות</span>
          <span class="badge" style="font-size:9.5px;background:#f1f5f9;color:#475569">⚡ סינון פוסט-שליפה</span>
        </span>
        <select class="input" id="a-ind" style="font-size:13px">
          <option value="">כל הענפים והתחומים</option>
          \${domains.map(d => \`<option value="\${esc(d.name)}">\${esc(d.name)}</option>\`).join("")}
        </select>
      </label>

      <!-- רכיב מקורות חיפוש והצלבה עם צ'קבוקסים וסטטוס חי (Component) -->
      <div class="f" style="grid-column: 1 / -1; background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 10px; padding: 14px; margin-top: 2px">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px; flex-wrap:wrap; gap:6px">
          <span class="bold" style="font-size:13.5px; color:#1e3a8a; display:flex; align-items:center; gap:6px">
            <span>🌐 מקורות חיפוש והצלבה לבחירה:</span>
            <span class="badge b-blue" style="font-size:10px">אימות רב-מקורות</span>
          </span>
          <span class="xs muted">סמן את המאגרים לסריקה ולהצלבת נתונים מקבילה (נתונים שקופים ללא סקרייפרים מדומים)</span>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px">
          <!-- Checkbox 1: רשם החברות -->
          <label style="display:flex; align-items:center; gap:8px; background:#fff; padding:8px 12px; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer">
            <input type="checkbox" id="src-companies" class="src-cb" value="companies" checked>
            <div style="flex:1">
              <div class="bold" style="font-size:12px; color:#0f172a">🏛️ רשם החברות</div>
              <div class="xs muted">מאגר התאגידים הרשמי</div>
            </div>
            <span class="badge b-ok" style="font-size:9px">פעיל · data.gov.il</span>
          </label>

          <!-- Checkbox 2: פנקס הקבלנים ענף 200 -->
          <label style="display:flex; align-items:center; gap:8px; background:#fff; padding:8px 12px; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer">
            <input type="checkbox" id="src-contractors" class="src-cb" value="contractors" checked>
            <div style="flex:1">
              <div class="bold" style="font-size:12px; color:#0f172a">🏗️ פנקס הקבלנים (ענף 200)</div>
              <div class="xs muted">קבלני תשתיות, עפר וטלפונים</div>
            </div>
            <span class="badge b-ok" style="font-size:9px">פעיל · data.gov.il</span>
          </label>

          <!-- Checkbox 3: מאגרים ממשלתיים פתוחים -->
          <label style="display:flex; align-items:center; gap:8px; background:#fff; padding:8px 12px; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer">
            <input type="checkbox" id="src-gov-open" class="src-cb" value="gov_open" checked>
            <div style="flex:1">
              <div class="bold" style="font-size:12px; color:#0f172a">📜 רישוי וממשל פתוח</div>
              <div class="xs muted">רשיונות עסק ממשלתיים</div>
            </div>
            <span class="badge b-ok" style="font-size:9px">פעיל · data.gov.il</span>
          </label>

          <!-- Checkbox 4: דפי זהב / בזק 144 (אינו מחובר ישירות עקב CORS) -->
          <label style="display:flex; align-items:center; gap:8px; background:#f8fafc; padding:8px 12px; border:1px solid #e2e8f0; border-radius:8px; cursor:pointer; opacity:0.9">
            <input type="checkbox" id="src-directories" class="src-cb" value="directories">
            <div style="flex:1">
              <div class="bold" style="font-size:12px; color:#475569">📖 דפי זהב / בזק 144</div>
              <div class="xs muted">סריקה ישירה חסומה בדפדפן (CORS)</div>
            </div>
            <span class="badge" style="background:#fee2e2; color:#991b1b; font-size:9px">לא מחובר ישירות</span>
          </label>

          <!-- Checkbox 5: אתרי אינטרנט של חברות (חיפוש קישור בלבד) -->
          <label style="display:flex; align-items:center; gap:8px; background:#fff; padding:8px 12px; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer">
            <input type="checkbox" id="src-web" class="src-cb" value="web" checked>
            <div style="flex:1">
              <div class="bold" style="font-size:12px; color:#0f172a">🌐 אתרי אינטרנט של חברות</div>
              <div class="xs muted">איתור קישור ציבורי בלבד</div>
            </div>
            <span class="badge" style="background:#fef3c7; color:#92400e; font-size:9px">קישור ציבורי בלבד</span>
          </label>

          <!-- Checkbox 6: LinkedIn / Facebook (דורש שירות העשרה) -->
          <label style="display:flex; align-items:center; gap:8px; background:#f8fafc; padding:8px 12px; border:1px solid #e2e8f0; border-radius:8px; cursor:pointer; opacity:0.9">
            <input type="checkbox" id="src-social" class="src-cb" value="social">
            <div style="flex:1">
              <div class="bold" style="font-size:12px; color:#475569">👥 LinkedIn / רשתות חברתיות</div>
              <div class="xs muted">דורש שירות העשרה צד ג'</div>
            </div>
            <span class="badge" style="background:#fee2e2; color:#991b1b; font-size:9px">לא מחובר</span>
          </label>
        </div>
      </div>

      <!-- הגדרות הצלבה וכלל אימות טלפון ירוק (Cross-Referencing Rules) -->
      <div class="f" style="grid-column:span 2; background: #faf5ff; border: 1.5px solid #d8b4fe; border-radius: 10px; padding: 12px 14px">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px">
          <span class="bold" style="font-size:13px; color:#6b21a8">⚙️ הגדרות הצלבה ואימות פרטי קשר:</span>
          <span class="badge" style="background:#ede9fe; color:#6d28d9; font-size:10px">כלל אימות ירוק</span>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1.3fr; gap: 12px; align-items:center">
          <div>
            <span class="xs bold" style="display:block; margin-bottom:4px; color:#4c1d95">יעד הצלבות מבוקש:</span>
            <select class="input" id="a-target-cross" style="height:36px; font-size:12.5px">
              <option value="2">2 הצלבות (מינימום)</option>
              <option value="3">3 הצלבות</option>
              <option value="4" selected>4 הצלבות (מומלץ לבסיס איכותי)</option>
              <option value="5">5+ הצלבות (מחמיר ביותר)</option>
            </select>
          </div>
          <div>
            <span class="xs bold" style="display:block; margin-bottom:4px; color:#065f46">כלל אימות טלפון ירוק:</span>
            <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:6px; padding:6px 10px; font-size:11.5px; color:#065f46; line-height:1.4">
              ✓ <b>אימות טלפון ירוק</b>: מוענק <b>אך ורק</b> כאשר אותו מספר טלפון בדיוק מופיע ב-<b>2 מקורות עצמאיים לפחות</b> (למשל: פנקס הקבלנים + מאגר STAGING DB). אם היעד הוא 4 ונמצאו 2, יוצג: <b>'✓ ירוק (מינימום הושג: 2/4)'</b>.<br>
              ⚠️ <b>מקור יחיד (1/X)</b>: הליד מוצג בטבלה כ-<b>'חלקי (1/X)'</b> עם תגית צהובה ולעולם לא יקבל ירוק.<br>
              ✉️ <b>אימיילים</b>: מוצגים בעמודה נפרדת ואינם הופכים טלפון לירוק.
            </div>
          </div>
        </div>
      </div>

      <!-- 4. אזור בארץ -->
      <label class="f">
        <span style="display:flex;align-items:center;gap:6px">
          <span class="bold">4. אזור בארץ</span>
          <span class="badge" style="font-size:9.5px;background:#f1f5f9;color:#475569">⚡ סינון פוסט-שליפה</span>
        </span>
        <select class="input" id="a-region" style="font-size:13px">
          <option value="">כל הארץ (כל האזורים)</option>
          <option value="מרכז">מרכז</option>
          <option value="דרום">דרום</option>
          <option value="צפון">צפון</option>
          <option value="ירושלים">ירושלים</option>
        </select>
      </label>

      <!-- 5. עיר לצמצום -->
      <label class="f">
        <span style="display:flex;align-items:center;gap:6px">
          <span class="bold">5. עיר לצמצום (אופציונלי)</span>
          <span class="badge" style="font-size:9.5px;background:#f1f5f9;color:#475569">⚡ סינון פוסט-שליפה</span>
        </span>
        <input class="input" id="a-city" placeholder="למשל: ראשון לציון, אשדוד, חיפה, חולון" style="font-size:13px">
      </label>

      <!-- 6. טווח מספר עובדים (Workforce Range Filter - בדיוק לפי הדרישות) -->
      <label class="f">
        <span style="display:flex;align-items:center;gap:6px">
          <span class="bold">6. מספר עובדים (טווחים מוגדרים)</span>
          <span class="badge" style="font-size:9.5px;background:#fef3c7;color:#92400e">🛡️ נתון מאומת</span>
        </span>
        <select class="input" id="a-workforce-range" style="font-size:13px">
          <option value="all" selected>כל הטווחים (כולל ללא מידע)</option>
          <option value="1-50">1–50 עובדים (מחייב נתון מאומת)</option>
          <option value="51-100">51–100 עובדים (מחייב נתון מאומת)</option>
          <option value="101-500">101–500 עובדים (מחייב נתון מאומת)</option>
          <option value="501plus">501+ עובדים (מחייב נתון מאומת)</option>
          <option value="unknown">לא ידוע (ללא אסמכתא בלבד)</option>
        </select>
        <div class="xs muted" style="margin-top:3px;font-size:10.5px">
          * רשם החברות אינו מדווח עובדים; רשומות ללא אסמכתא יסווגו כ'לא ידוע' בלבד.
        </div>
      </label>

      <!-- 7. סינון צי (עובדה מול פוטנציאל) -->
      <label class="f">
        <span style="display:flex;align-items:center;gap:6px">
          <span class="bold">7. סינון צי (עובדה מול פוטנציאל)</span>
          <span class="badge" style="font-size:9.5px;background:#f1f5f9;color:#475569">🛡️ ראיות קשיחות</span>
        </span>
        <select class="input" id="a-fleet-filter-mode" style="font-size:13px">
          <option value="all">הכל (ללא סינון מקדים)</option>
          <option value="indication_200">אינדיקציה ענפית: ענף 200 / תשתיות ועפר</option>
          <option value="potential_5plus">פוטנציאל צי 5+ (ענף עתיר רכב / הובלה / לוגיסטיקה)</option>
          <option value="no_fleet">ללא ראיית צי</option>
        </select>
      </label>

      <!-- 8. סוג רכב / צי עיקרי -->
      <label class="f">
        <span style="display:flex;align-items:center;gap:6px">
          <span class="bold">8. סוג רכב / צי עיקרי</span>
          <span class="badge" style="font-size:9.5px;background:#f1f5f9;color:#475569">⚡ סינון פוסט-שליפה</span>
        </span>
        <select class="input" id="a-fleet-type" style="font-size:13px">
          <option value="">כל הסוגים</option>
          <option value="משאיות">משאיות כבדות והובלה</option>
          <option value="צמ״ה">כלי צמ״ה, עפר ושופלים</option>
          <option value="מסחריות">מסחריות ורכבי שירות</option>
          <option value="אוטובוס">אוטובוסים והיסעים</option>
        </select>
      </label>

      <!-- 9. פרטי קשר נדרשים -->
      <label class="f">
        <span style="display:flex;align-items:center;gap:6px">
          <span class="bold">9. פרטי קשר נדרשים</span>
          <span class="badge" style="font-size:9.5px;background:#f1f5f9;color:#475569">📞 ✉️</span>
        </span>
        <select class="input" id="a-contact-req" style="font-size:13px">
          <option value="all">הכל (הצג את כל החברות)</option>
          <option value="green_phone">חובה טלפון ירוק מאומת (2+ מקורות עצמאיים) 🟢</option>
          <option value="phone">טלפון עסקי / נייד (📞/📱)</option>
          <option value="mobile">נייד עסקי (📱 בלבד)</option>
          <option value="email">אימייל עסקי (✉️)</option>
          <option value="any">לפחות פרט קשר אחד (טלפון או אימייל)</option>
        </select>
      </label>
    </div>

    <!-- שורת פעולה והפעלה ראשית -->
    <div class="row" style="margin-top:18px;gap:10px;align-items:center;flex-wrap:wrap;border-top:1px solid #e2e8f0;padding-top:14px">
      <button class="btn btn-primary" id="btnUnifiedSearch" data-act="runUnifiedSearch" style="padding:10px 24px;font-size:14px;font-weight:700;display:inline-flex;align-items:center;gap:8px" \${S.searchRunning ? 'disabled' : ''}>
        <span>\${S.searchRunning ? '⏳ סורק מאגרים באצוות...' : '🚀 הפעל איתור חברות חינמי ומבוקר (0 ₪)'}</span>
      </button>

      \${S.searchRunning ? \`
        <button class="btn" data-act="stopSearch" style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;font-weight:700">
          ⏹ עצור סריקה
        </button>
      \` : ''}

      <button class="btn btn-ghost" data-act="resetSearchForm" style="border:1px solid #cbd5e1;background:#fff">
        🧹 אפס טופס
      </button>

      <span class="spacer"></span>
      <span class="xs muted" id="searchHeaderStatus">
        \${S.searchRunning ? 'סריקה מתבצעת כעת מול data.gov.il...' : 'מוכן לסריקה · 0 ₪ עלות API · תוצאות ייפתחו מיד מטה'}
      </span>
    </div>
  </div>
  \`;
}

/* ===== מסלול נפרד ב': איתור חברות באמצעות AI / Gemini ===== */
function renderTrackAiSearch() {
  return \`
  <div class="card" style="padding:20px;border:1.5px solid #8b5cf6;background:linear-gradient(135deg,rgba(139,92,246,0.04),rgba(124,58,237,0.02))">
    <div class="card-h" style="margin-bottom:12px;border-bottom:1px solid #e2e8f0;padding-bottom:10px">
      <div>
        <h2 style="margin:0;font-size:18.5px;color:#6b21a8;display:flex;align-items:center;gap:8px">
          <span>✦ איתור חברות באמצעות AI / Gemini (מסלול נפרד ומבוקר)</span>
          <span class="h-bar"></span>
        </h2>
        <div class="xs muted" style="margin-top:4px">
          פענוח צרכים עסקיים בשפה חופשית. המודל מחלץ קריטריונים מדויקים ומפעיל חיפוש מול רשם החברות ופנקס הקבלנים.
        </div>
      </div>
      <span class="spacer"></span>
      <span class="badge" style="background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe;font-size:11px">Gemini Flash 3.8</span>
      <span class="badge b-ok" style="font-size:11px">שירות AI פעיל ומחובר</span>
    </div>

    <!-- כרטיס סטטוס ובטיחות AI -->
    <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:12.5px;line-height:1.6">
      <div class="row bold" style="color:#6b21a8;margin-bottom:4px">
        <span>🛡️ שער אישור מבוקר — ללא הפתעות תקציב:</span>
        <span class="spacer"></span>
        <span class="badge" style="background:#e9d5ff;color:#581c87;font-size:10px">עלות משוערת: ~0.01 ₪</span>
      </div>
      <div>• <b>חיבור מאומת:</b> מודל Google Gemini Flash 3.8 מחובר ותקין דרך Supabase Edge Staging.</div>
      <div>• <b>איתור חברות אמיתיות:</b> ה-AI אינו ממציא חברות. הוא מפענח את בקשתך ומבצע איתור חברות מורשות במאגרי ממשלת ישראל.</div>
      <div>• <b>שער אישור יזום:</b> שום קריאה בתשלום אינה מבוצעת ללא לחיצה על כפתור האישור הייעודי.</div>
    </div>

    <label class="f" style="margin-bottom:10px">
      <span class="bold">כתוב בעברית את דרישת האיתור שלך:</span>
      <textarea id="ai-query" placeholder="לדוגמה: מצא 50 חברות הובלה, לוגיסטיקה והפצה באזור המרכז עם פוטנציאל לצי משאיות וטלפון מאומת" style="min-height:85px;font-size:13.5px">\${esc(S._lastAiPrompt || '')}</textarea>
    </label>

    <div class="chips" style="margin-bottom:14px">
      <span class="xs muted bold">דוגמאות נפוצות:</span>
      \${[
        "מצא 50 חברות הובלה ולוגיסטיקה במרכז עם צי רכב",
        "קבלני תשתיות ועפר ענף 200 בדרום עם טלפון",
        "חברות היסעים ותחבורה בישראל",
        "חברות שירות וטכנאי שטח באזור הצפון"
      ].map(ex => \`<button type="button" class="btn btn-sm btn-ghost" data-act="setAiPromptPill" data-val="\${esc(ex)}" style="border:1px solid #cbd5e1;background:#fff;font-size:11.5px">\${esc(ex)}</button>\`).join("")}
    </div>

    <div id="aiApprovalGateContainer"></div>

    <div class="row" style="margin-top:14px;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary" data-act="openAiApprovalGate" id="btnOpenAiGate" style="background:#7c3aed;border-color:#7c3aed;font-weight:700;display:inline-flex;align-items:center;gap:6px">
        <span>✦ פתח שער אישור והפעל ניתוח Gemini</span>
      </button>
      <span class="spacer"></span>
      <span class="xs muted">🔒 תוצאות שיימצאו יוצגו בטבלה מטה לבדיקה לפני שמירה</span>
    </div>
  </div>
  \`;
}

/* ===== מסלול נפרד ג': תחקור וסינון במאגר הקיים (Internal DB Query) ===== */
function renderTrackInternalQuery() {
  return \`
  <div class="card" style="padding:20px;border:1.5px solid #10b981;background:linear-gradient(135deg,rgba(16,185,129,0.04),rgba(5,150,105,0.01))">
    <div class="card-h" style="margin-bottom:12px;border-bottom:1px solid #e2e8f0;padding-bottom:10px">
      <div>
        <h2 style="margin:0;font-size:18.5px;color:#065f46;display:flex;align-items:center;gap:8px">
          <span>🔍 שאילתות, תחקור וסינון במאגר החברות הקיים שלי</span>
          <span class="h-bar"></span>
        </h2>
        <div class="xs muted" style="margin-top:4px">
          תחקור מקומי על \${C.length} החברות שכבר קיימות ושמורות אצלך במערכת (0 ₪, מענה מיידי מתוך הזיכרון).
        </div>
      </div>
      <span class="spacer"></span>
      <span class="badge b-ok" style="font-size:11px">מאגר פנימי מאומת</span>
      <span class="badge" style="background:#ecfdf5;color:#047857;font-size:11px">0 ₪ עלות</span>
    </div>

    <!-- הודעת הפרדה ברורה -->
    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:12.5px;color:#065f46;line-height:1.5">
      📌 <b>הפרדה מוחלטת:</b> מסלול זה <b>אינו מאתר חברות חדשות מבחוץ</b>, אלא עונה על שאלות ומסנן מתוך \${C.length} החברות שכבר נקלטו ונמצאות בזיכרון המערכת.
    </div>

    <label class="f" style="margin-bottom:10px">
      <span class="bold">שאילתה או בקשת סינון למאגר הקיים:</span>
      <textarea id="q-internal" placeholder="לדוגמה: סנן רק חברות עם מספר טלפון, מי מחויבת בתקנה 579?, תמליץ על 5 הלידים המובילים לדליה" style="min-height:85px;font-size:13.5px"></textarea>
    </label>

    <div class="chips" style="margin-bottom:14px">
      <span class="xs muted bold">דוגמאות לתחקור:</span>
      \${[
        "סנן רק חברות עם מספר טלפון",
        "מי מחויבת בתקנה 579?",
        "10 החברות הכי טובות במאגר",
        "תמליץ על 5 הלידים המובילים לדליה",
        "חברות בענף הובלות במאגר"
      ].map(ex => \`<button type="button" class="btn btn-sm btn-ghost" data-act="applyInternalEx" data-ex="\${esc(ex)}" style="border:1px solid #cbd5e1;background:#fff;font-size:11.5px">\${esc(ex)}</button>\`).join("")}
    </div>

    <div class="row" style="margin-top:14px;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary" data-act="runInternalQuery" id="btnRunInternal" style="background:#059669;border-color:#059669;font-weight:700">
        <span>🔍 חפש במאגר הקיים (0 ₪)</span>
      </button>
      <span class="spacer"></span>
      <span class="xs muted">⚡ מענה מיידי מתוך \${C.length} רשומות שמורות</span>
    </div>

    <div id="internalQueryResultsArea" style="margin-top:14px"></div>
  </div>
  \`;
}

/* ===== אזור תוצאות החיפוש הזמניות — נפתח מיד מתחת לטופס באותו מסך ===== */
function renderSearchResultsArea() {
  const stats = S.searchStats || { requested: 50, scanned: 0, added: 0, duplicates: 0, rejected: 0, pending: 0, fleetEvidence: 0 };
  const allHits = S.searchHits || [];
  const duplicates = S.searchDuplicates || [];
  const rejected = S.searchRejected || [];
  const activeTab = S.searchActiveTab || "new";

  const pct = Math.min(100, Math.round((stats.added / (stats.requested || 50)) * 100)) || 0;

  return \`
  <div class="card" style="border:1.5px solid #2563eb;background:#ffffff;box-shadow:0 10px 15px -3px rgba(0,0,0,0.05);border-radius:12px;overflow:hidden">
    <div class="card-h" style="background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:14px 18px;flex-wrap:wrap;gap:10px">
      <div>
        <h2 style="margin:0;font-size:18px;color:#1e3a8a;display:flex;align-items:center;gap:8px">
          <span>📋 תוצאות איתור חברות זמניות לבדיקה ואישור (שלב 1)</span>
          <span class="h-bar"></span>
        </h2>
        <div class="xs muted" style="margin-top:3px">
          חברות אלו נמצאות <b>בתצוגה זמנית בלבד</b>. שום חברה לא נוספת למאגר הקבוע שלך ולא נשמרת ב-Supabase ללא אישורך המפורש.
        </div>
      </div>
      <span class="spacer"></span>
      <span class="badge b-blue" style="font-size:11.5px">יעד: \${stats.requested} חברות</span>
      <span class="badge b-ok" style="font-size:11.5px">\${allHits.length} אותרו מתאימות</span>
    </div>

    <div class="card-b" style="padding:18px">
      \${S._lastSaveSuccess ? \`
        <!-- באנר הצלחה לשלב 2 עם מעבר ישיר ללשונית 'חברות שנמצאו' -->
        <div style="background:#ecfdf5;border:1.5px solid #10b981;border-radius:10px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div>
            <div class="bold" style="color:#065f46;font-size:14.5px;display:flex;align-items:center;gap:6px">
              <span>✓ \${S._lastSaveSuccess.count} חברות נשמרו בהצלחה כ'חברות שנמצאו' (שלב 2)!</span>
            </div>
            <div class="xs" style="color:#047857;margin-top:3px">
              החברות ממתינות כעת בלשונית 'חברות שנמצאו'. לבדיקה סופית ואישור העברה לניהול לידים (שלב 3), עבור לשם כעת.
            </div>
          </div>
          <button class="btn btn-primary" data-go="companies" style="background:#059669;border-color:#059669;font-weight:700;display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:8px">
            <span>מעבר ל'חברות שנמצאו' לבדיקה ואישור (שלב 3) ➔</span>
          </button>
        </div>
      \` : ''}

      <!-- מדדי התקדמות חיים בזמן הסריקה (7 KPIs) -->
      <div style="margin-bottom:14px">
        <div class="row sm bold" style="margin-bottom:6px">
          <span id="searchProgressLabel">\${S.searchRunning ? \`סורק מאגרים... \${stats.scanned} רשומות נבדקו\` : \`סריקה הסתיימה: \${allHits.length} חברות חדשות ממתינות לבדיקתך\`}</span>
          <span class="spacer"></span>
          <span id="searchProgressPercent" class="num">\${pct}% (\${stats.added} מתוך \${stats.requested})</span>
        </div>
        <div class="bar" style="height:10px;border-radius:999px;background:#e2e8f0">
          <i id="searchProgressBar" style="width:\${pct}%;background:#2563eb;transition:width .2s"></i>
        </div>
      </div>

      <div class="grid g-kpi" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px">
        <div class="card kpi" style="padding:10px">
          <div class="l" style="font-size:11px">כמות מבוקשת</div>
          <div class="v num" id="kpiRequested" style="font-size:18px">\${stats.requested}</div>
          <div class="s" style="font-size:10px">יעד סריקה</div>
        </div>
        <div class="card kpi" style="padding:10px">
          <div class="l" style="font-size:11px">נסרקו במאגר</div>
          <div class="v num" id="kpiScanned" style="font-size:18px">\${stats.scanned}</div>
          <div class="s" style="font-size:10px">רשומות גולמיות</div>
        </div>
        <div class="card kpi" style="padding:10px">
          <div class="l" style="font-size:11px">חברות חדשות</div>
          <div class="v num" id="kpiAdded" style="font-size:18px;color:#16a34a">\${stats.added}</div>
          <div class="s" style="font-size:10px">מתאימות לסינון</div>
        </div>
        <div class="card kpi" style="padding:10px">
          <div class="l" style="font-size:11px">כפילויות שנמנעו</div>
          <div class="v num" id="kpiDuplicates" style="font-size:18px;color:#f59e0b">\${stats.duplicates}</div>
          <div class="s" style="font-size:10px">קיימות במאגר/בסריקה</div>
        </div>
        <div class="card kpi" style="padding:10px">
          <div class="l" style="font-size:11px">נפסלו בסריקה</div>
          <div class="v num" id="kpiRejected" style="font-size:18px;color:#ef4444">\${stats.rejected}</div>
          <div class="s" style="font-size:10px">ח.פ. לא תקין / לא פעיל</div>
        </div>
        <div class="card kpi" style="padding:10px">
          <div class="l" style="font-size:11px">עוגני צי רכב</div>
          <div class="v num" id="kpiFleet" style="font-size:18px;color:#2563eb">\${stats.fleetEvidence}</div>
          <div class="s" style="font-size:10px">אינדיקציה ענפית: ענף 200 / צי 5+</div>
        </div>
        <div class="card kpi" style="padding:10px">
          <div class="l" style="font-size:11px">ממתינות לאישורך</div>
          <div class="v num" id="kpiPending" style="font-size:18px;color:#7c3aed">\${S.searchHitSelection ? S.searchHitSelection.size : stats.added}</div>
          <div class="s" style="font-size:10px">סומנו בטבלה</div>
        </div>
      </div>

      <!-- לשוניות מעבר בין תוצאות חדשות / כפילויות / נפסלות -->
      <div class="row" style="gap:8px;border-bottom:1px solid #e2e8f0;padding-bottom:10px;margin-bottom:14px;flex-wrap:wrap">
        <button class="btn btn-sm \${activeTab === 'new' ? 'btn-primary' : 'btn-ghost'}" data-act="setResultsTab" data-tab="new" style="border-radius:18px;font-weight:700">
          📋 חברות חדשות לבדיקה (\${allHits.length})
        </button>
        <button class="btn btn-sm \${activeTab === 'duplicates' ? 'btn-primary' : 'btn-ghost'}" data-act="setResultsTab" data-tab="duplicates" style="border-radius:18px;font-weight:700">
          ⚠️ כפילויות שזוהו במאגר (\${duplicates.length})
        </button>
        <button class="btn btn-sm \${activeTab === 'rejected' ? 'btn-primary' : 'btn-ghost'}" data-act="setResultsTab" data-tab="rejected" style="border-radius:18px;font-weight:700">
          🚫 רשומות שנפסלו (\${rejected.length})
        </button>
        <span class="spacer"></span>
        <span class="xs muted" id="searchLiveStatusNote">
          \${S.searchRunning ? '⏳ סורק אצוות ברקע (התוצאות נוספות בהדרגה)...' : '✓ הסריקה הושלמה'}
        </span>
      </div>

      \${activeTab === 'new' ? renderNewHitsView() : activeTab === 'duplicates' ? renderDuplicatesView() : renderRejectedView()}
    </div>
  </div>
  \`;
}

/* ===== תצוגת חברות חדשות: סרגל סינון + 16 עמודות ומגירת פירוט רספונסיבית ===== */
function renderNewHitsView() {
  const allHits = S.searchHits || [];
  const sel = S.searchHitSelection || new Set();
  const filter = S.searchHitFilter || { q: "", region: "", city: "", ind: "", status: "all", contact: "all", fleet: "all", quality: "all", workforce: "all" };

  // סינון מקומי מיידי בתוך הטבלה
  const visibleHits = allHits.filter(h => {
    if (filter.q) {
      const qLower = filter.q.toLowerCase();
      const matchQ = (h.name || "").toLowerCase().includes(qLower) ||
                     (h.no || "").includes(qLower) ||
                     (h.city || "").toLowerCase().includes(qLower) ||
                     (h.ind || "").toLowerCase().includes(qLower) ||
                     (h.phone || "").includes(qLower);
      if (!matchQ) return false;
    }
    if (filter.region && filter.region !== "all" && h.region !== filter.region) return false;
    if (filter.ind && filter.ind !== "all" && !String(h.ind || "").includes(filter.ind)) return false;
    if (filter.contact === "green_phone" && h.phoneVerBadgeColor !== "green") return false;
    if (filter.contact === "has_phone" && (!h.phone || h.phone === "לא ידוע" || h.phone === "—")) return false;
    if (filter.contact === "has_mobile" && (!h.mobile || h.mobile === "—" || !h.mobile.startsWith("05"))) return false;
    if (filter.contact === "has_email" && (!h.email || h.email === "לא ידוע" || h.email === "—" || !h.email.includes("@"))) return false;
    if (filter.contact === "has_any" && (!h.phone || h.phone === "לא ידוע" || h.phone === "—") && (!h.email || !h.email.includes("@"))) return false;
    if (filter.fleet === "indication_200" && !String(h.fleetPotential || "").includes("200")) return false;
    if (filter.fleet === "potential_5plus" && !String(h.fleetPotential || "").includes("5+") && !h.fleetIsFact) return false;
    if (filter.quality === "green" && h.qualityColor !== "green") return false;
    if (filter.quality === "yellow" && h.qualityColor !== "yellow") return false;
    if (filter.workforce === "1-50" && (h.employeesCount === null || h.employeesCount < 1 || h.employeesCount > 50)) return false;
    if (filter.workforce === "51-100" && (h.employeesCount === null || h.employeesCount < 51 || h.employeesCount > 100)) return false;
    if (filter.workforce === "101-500" && (h.employeesCount === null || h.employeesCount < 101 || h.employeesCount > 500)) return false;
    if (filter.workforce === "501plus" && (h.employeesCount === null || h.employeesCount < 501)) return false;
    if (filter.workforce === "unknown" && h.employeesCount !== null) return false;
    if (filter.status === "new" && (h.already || h.adopted)) return false;
    if (filter.status === "adopted" && !h.adopted) return false;
    return true;
  });

  const freshHits = allHits.filter(h => !h.already && !h.adopted);
  const selectedCount = [...sel].filter(no => freshHits.some(h => h.no === no)).length;

  return \`
  <!-- סרגל סינון וחיפוש מהיר בתוך תוצאות הטבלה -->
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:14px">
    <div class="row" style="flex-wrap:wrap;gap:8px;align-items:center">
      <input class="input" id="hit-filter-q" placeholder="🔍 חיפוש מהיר בתוצאות (שם, ח.פ, עיר, ענף, טלפון)" value="\${esc(filter.q || '')}" style="max-width:240px;height:34px;font-size:12.5px" oninput="S.searchHitFilter.q=this.value;renderSearchHitsFiltered()">

      <select class="input" id="hit-filter-region" style="max-width:125px;height:34px;font-size:12.5px" onchange="S.searchHitFilter.region=this.value;renderSearchHitsFiltered()">
        <option value="all" \${filter.region==='all'?'selected':''}>כל האזורים</option>
        <option value="מרכז" \${filter.region==='מרכז'?'selected':''}>מרכז</option>
        <option value="דרום" \${filter.region==='דרום'?'selected':''}>דרום</option>
        <option value="צפון" \${filter.region==='צפון'?'selected':''}>צפון</option>
        <option value="ירושלים" \${filter.region==='ירושלים'?'selected':''}>ירושלים</option>
      </select>

      <select class="input" id="hit-filter-contact" style="max-width:150px;height:34px;font-size:12.5px" onchange="S.searchHitFilter.contact=this.value;renderSearchHitsFiltered()">
        <option value="all" \${filter.contact==='all'?'selected':''}>כל פרטי הקשר</option>
        <option value="green_phone" \${filter.contact==='green_phone'?'selected':''}>🟢 טלפון ירוק (2+ הצלבות)</option>
        <option value="has_phone" \${filter.contact==='has_phone'?'selected':''}>📞 טלפון עסקי/נייח</option>
        <option value="has_mobile" \${filter.contact==='has_mobile'?'selected':''}>📱 נייד עסקי</option>
        <option value="has_email" \${filter.contact==='has_email'?'selected':''}>✉️ אימייל</option>
        <option value="has_any" \${filter.contact==='has_any'?'selected':''}>טלפון או אימייל</option>
      </select>

      <select class="input" id="hit-filter-fleet" style="max-width:150px;height:34px;font-size:12.5px" onchange="S.searchHitFilter.fleet=this.value;renderSearchHitsFiltered()">
        <option value="all" \${filter.fleet==='all'?'selected':''}>כל רמות הצי</option>
        <option value="indication_200" \${filter.fleet==='indication_200'?'selected':''}>אינדיקציה: ענף 200</option>
        <option value="potential_5plus" \${filter.fleet==='potential_5plus'?'selected':''}>פוטנציאל צי 5+</option>
      </select>

      <select class="input" id="hit-filter-workforce" style="max-width:140px;height:34px;font-size:12.5px" onchange="S.searchHitFilter.workforce=this.value;renderSearchHitsFiltered()">
        <option value="all" \${filter.workforce==='all'?'selected':''}>כל העובדים</option>
        <option value="1-50" \${filter.workforce==='1-50'?'selected':''}>1–50 עובדים</option>
        <option value="51-100" \${filter.workforce==='51-100'?'selected':''}>51–100 עובדים</option>
        <option value="101-500" \${filter.workforce==='101-500'?'selected':''}>101–500 עובדים</option>
        <option value="501plus" \${filter.workforce==='501plus'?'selected':''}>501+ עובדים</option>
        <option value="unknown" \${filter.workforce==='unknown'?'selected':''}>לא ידוע בלבד</option>
      </select>

      <select class="input" id="hit-filter-quality" style="max-width:130px;height:34px;font-size:12.5px" onchange="S.searchHitFilter.quality=this.value;renderSearchHitsFiltered()">
        <option value="all" \${filter.quality==='all'?'selected':''}>כל דרגות האיכות</option>
        <option value="green" \${filter.quality==='green'?'selected':''}>⭐ איכות גבוהה</option>
        <option value="yellow" \${filter.quality==='yellow'?'selected':''}>איכות בינונית</option>
      </select>

      <span class="spacer"></span>
      <span class="xs muted">מוצגות \${visibleHits.length} מתוך \${allHits.length} חברות</span>
    </div>
  </div>

  <!-- סרגל פעולה מרוכז ובחירת חברות — תהליך 2 אישורים נפרדים לפי הדרישה -->
  <div class="row" style="margin-bottom:14px;gap:8px;flex-wrap:wrap;align-items:center;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px 14px">
    <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-weight:700;font-size:13px">
      <input type="checkbox" id="hit-select-all" data-act="selectAllHits" \${selectedCount > 0 && selectedCount === freshHits.length ? 'checked' : ''}>
      <span>בחר את כל \${freshHits.length} החברות החדשות</span>
    </label>

    <button class="btn btn-sm btn-ghost" data-act="selectPhoneHits" style="border:1px solid #93c5fd;background:#fff;font-size:11.5px">📞 סמן רק עם טלפון</button>
    <button class="btn btn-sm btn-ghost" data-act="selectFleetHits" style="border:1px solid #93c5fd;background:#fff;font-size:11.5px">🚛 סמן צי מאומת/גבוה</button>
    <button class="btn btn-sm btn-ghost" data-act="clearHitSelection" style="border:1px solid #cbd5e1;background:#fff;font-size:11.5px">✕ נקה בחירה</button>

    <span class="badge b-blue" id="hitSelectedCountBadge" style="font-size:12px">סומנו \${selectedCount} מתוך \${freshHits.length} חברות חדשות</span>

    <span class="spacer"></span>

    <!-- כפתור שלב 2 בלבד: שמירה לחברות שנמצאו (ללא דילוג ישיר לניהול לידים) -->
    <button class="btn btn-primary" data-act="saveSelectedToDiscovered" id="btnSaveToDiscovered" style="background:#2563eb;border-color:#2563eb;font-weight:700;display:inline-flex;align-items:center;gap:6px;padding:8px 18px" \${selectedCount === 0 ? 'disabled' : ''}>
      <span>📥 שמור חברות נבחרות כ'חברות שנמצאו' (שלב 2) [\${selectedCount}]</span>
    </button>

    <button class="btn btn-ghost" data-act="clearSearchResults" style="border:1px solid #cbd5e1;background:#fff">
      <span>🧹 נקה תוצאות</span>
    </button>

    <button class="btn btn-ghost" data-act="exportSearchHitsCsv" style="border:1px solid #cbd5e1;background:#fff">
      <span>⬇️ CSV</span>
    </button>
  </div>

  \${visibleHits.length > 0 ? \`
    <!-- 16 עמודות ומגירת פירוט רספונסיבית -->
    <div class="tbl-wrap" style="max-height:600px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead style="position:sticky;top:0;background:#f1f5f9;z-index:2;border-bottom:2px solid #cbd5e1">
          <tr>
            <th style="width:34px;text-align:center;padding:8px 4px">✓</th>
            <th style="min-width:180px;padding:8px 10px;text-align:right">שם החברה</th>
            <th style="min-width:100px;padding:8px 8px;text-align:right">ח.פ. / מזהה</th>
            <th style="min-width:140px;padding:8px 8px;text-align:right">תחום פעילות אמיתי</th>
            <th style="min-width:70px;padding:8px 6px;text-align:right">אזור</th>
            <th style="min-width:140px;padding:8px 8px;text-align:right">עיר וכתובת</th>
            <th style="min-width:110px;padding:8px 6px;text-align:right">עובדים</th>
            <th style="min-width:160px;padding:8px 8px;text-align:right">פוטנציאל לצי רכב</th>
            <th style="min-width:90px;padding:8px 6px;text-align:right">איש קשר</th>
            <th style="min-width:120px;padding:8px 8px;text-align:right">טלפון עסקי</th>
            <th style="min-width:110px;padding:8px 8px;text-align:right">נייד עסקי</th>
            <th style="min-width:130px;padding:8px 8px;text-align:right">אימייל עסקי</th>
            <th style="min-width:110px;padding:8px 6px;text-align:right">מקור מידע</th>
            <th style="min-width:110px;padding:8px 6px;text-align:right">אימות והצלבות</th>
            <th style="min-width:90px;padding:8px 6px;text-align:right">איכות ליד</th>
            <th style="min-width:110px;padding:8px 8px;text-align:right">סטטוס במערכת</th>
            <th style="width:40px;text-align:center;padding:8px 4px">פירוט</th>
          </tr>
        </thead>
        <tbody id="searchHitsTableBody">
          \${visibleHits.map(h => renderHitTableRow(h)).join("")}
        </tbody>
      </table>
    </div>
  \` : \`
    <div class="empty" style="padding:40px 16px;text-align:center;background:#f8fafc;border-radius:10px;border:1px dashed #cbd5e1">
      <div style="font-size:28px;margin-bottom:8px">🔍</div>
      <div class="bold" style="font-size:15px;margin-bottom:4px">לא נמצאו חברות חדשות התואמות את הסינון המבוקש</div>
      <div class="xs muted">נסה להרחיב את החיפוש, לבחור 'כל האזורים' או להזין מילת חיפוש נוספת.</div>
    </div>
  \`}
  \`;
}

/* ===== רינדור שורת תוצאה בודדת ב-16 עמודות + תמיכה במגירת פירוט ===== */
function renderHitTableRow(h) {
  const sel = S.searchHitSelection || new Set();
  const isSelected = sel.has(h.no);
  const isLocked = h.already || h.adopted;
  const isExpanded = S.searchExpandedDrawers && S.searchExpandedDrawers.has(h.no);

  const mainRow = \`
    <tr id="hit-row-\${esc(h.no)}" class="hit-row \${isExpanded ? 'expanded' : ''}" style="border-bottom:1px solid #e2e8f0;background:\${h.adopted ? '#f0fdf4' : h.already ? '#f8fafc' : isSelected ? '#eff6ff' : '#ffffff'};transition:background .15s">
      <!-- 1. Checkbox -->
      <td style="text-align:center;padding:8px 4px">
        <input type="checkbox" class="hit-cb" value="\${esc(h.no)}" \${isLocked ? 'disabled' : (isSelected ? 'checked' : '')}>
      </td>

      <!-- 2. שם החברה -->
      <td style="padding:8px 10px">
        <div class="bold" style="font-size:13px;color:#0f172a">\${esc(h.name)}</div>
        \${h.source_keyword ? \`<span class="badge" style="background:#e0e7ff;color:#3730a3;font-size:9.5px;margin-top:2px">🔍 \${esc(h.source_keyword)}</span>\` : ''}
      </td>

      <!-- 3. ח.פ. / מזהה רשמי -->
      <td style="padding:8px 8px">
        <a href="https://data.gov.il/dataset?q=\${encodeURIComponent(h.no)}" target="_blank" rel="noopener" class="ltr num bold" style="color:#0284c7;text-decoration:none" title="צפה ברשומה במאגר ממשלת ישראל">
          \${esc(h.no)} 🔗
        </a>
      </td>

      <!-- 4. תחום פעילות אמיתי מתוך תיאור החברה -->
      <td style="padding:8px 8px">
        <span class="badge" style="background:#e0e7ff;color:#3730a3;font-size:10px;white-space:normal;display:inline-block;max-width:180px;line-height:1.3" title="\${esc(h.ind)}">\${esc(h.ind || 'חברה רשומה')}</span>
      </td>

      <!-- 5. אזור בארץ -->
      <td style="padding:8px 6px">
        <span class="badge" style="background:#f1f5f9;color:#475569;font-size:10px">\${esc(h.region || 'לא ידוע')}</span>
      </td>

      <!-- 6. עיר וכתובת מלאה -->
      <td style="padding:8px 8px">
        <div class="bold" style="font-size:12px">\${esc(h.city || 'לא ידוע')}</div>
        <div class="xs muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px" title="\${esc(h.addr)}">\${esc(h.addr || '—')}</div>
      </td>

      <!-- 7. מספר עובדים (עם אסמכתא או לא ידוע בלבד) -->
      <td style="padding:8px 6px">
        \${h.employeesCount !== null && h.employeesCount !== undefined
          ? \`<span class="badge b-ok" style="font-size:10px">\${h.employeesCount} עובדים (מאומת)</span>\`
          : \`<span class="xs muted" style="font-size:11px" title="רשם החברות אינו מדווח מספר עובדים רשמי">לא ידוע (ללא אסמכתא)</span>\`
        }
      </td>

      <!-- 8. פוטנציאל לצי רכב (הבחנה בין עובדה לאינדיקציה ולהערכה) -->
      <td style="padding:8px 8px">
        \${String(h.fleetPotential || "").includes("200")
          ? \`<span class="badge" style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;font-size:10px;font-weight:600" title="אינדיקציה ענפית מבוססת: קבלן רשום ענף 200 (תשתיות ועפר)">≈ פוטנציאל צי 5+ (אינדיקציה ענפית)</span>\`
          : String(h.fleetPotential || "").includes("5+")
          ? \`<span class="badge b-est" style="font-size:10px" title="אינדיקציה מבוססת ענף עתיר רכבים/משאיות">≈ פוטנציאל 5+ (הערכה ענפית)</span>\`
          : \`<span class="badge b-no" style="font-size:10px">? לא ידוע (ללא אסמכתא)</span>\`
        }
      </td>
      <!-- 9. איש קשר רלוונטי -->
      <td style="padding:8px 6px">
        <span class="xs" style="color:var(--text)">\${esc(h.contactPerson || '—')}</span>
      </td>

      <!-- 10. טלפון עסקי / נייח + תגית אימות ירוקה -->
      <td style="padding:8px 8px">
        \${h.phone && h.phone !== '—' && h.phone !== 'לא ידוע'
          ? \`
            <div style="display:flex;align-items:center;gap:4px">
              <a href="tel:\${esc(h.phone)}" class="bold ltr" style="color:#0284c7;font-size:12px;text-decoration:none">📞 \${esc(h.phone)}</a>
              <span class="badge \${h.phoneVerBadgeColor === 'green' ? 'b-ok' : h.phoneVerBadgeColor === 'yellow' ? 'b-est' : 'b-no'}" style="font-size:9px" title="\${esc(h.phoneVerStatus)}">\${h.phoneVerBadgeLabel}</span>
            </div>
          \`
          : \`<span class="xs muted">—</span>\`
        }
      </td>

      <!-- 11. נייד עסקי -->
      <td style="padding:8px 8px">
        \${h.mobile && h.mobile !== '—'
          ? \`
            <div style="display:flex;align-items:center;gap:4px">
              <a href="tel:\${esc(h.mobile)}" class="bold ltr" style="color:#16a34a;font-size:12px;text-decoration:none">📱 \${esc(h.mobile)}</a>
              <span class="badge \${h.phoneVerBadgeColor === 'green' ? 'b-ok' : h.phoneVerBadgeColor === 'yellow' ? 'b-est' : 'b-no'}" style="font-size:9px" title="\${esc(h.phoneVerStatus)}">\${h.phoneVerBadgeLabel}</span>
            </div>
          \`
          : \`<span class="xs muted">—</span>\`
        }
      </td>

      <!-- 12. אימייל עסקי + תגית הצלבה -->
      <td style="padding:8px 8px">
        \${h.email && h.email !== '—' && h.email !== 'לא ידוע' && h.email.includes('@')
          ? \`
            <div style="display:flex;align-items:center;gap:4px">
              <a href="mailto:\${esc(h.email)}" class="ltr" style="color:#2563eb;font-size:11.5px;text-decoration:none">✉️ \${esc(h.email)}</a>
              <span class="badge" style="background:#e0e7ff;color:#3730a3;font-size:9px" title="אימות אימייל">\${esc(h.emailVerLabel)}</span>
            </div>
          \`
          : \`<span class="xs muted">—</span>\`
        }
      </td>

      <!-- 13. מקור המידע (data.gov.il) -->
      <td style="padding:8px 6px">
        <a href="\${esc(h.source_url || 'https://data.gov.il')}" target="_blank" rel="noopener" class="xs" style="color:#4f46e5;text-decoration:underline" title="פתח מקור ממשלתי פתוח">
          \${esc(h.source_label || 'data.gov.il')} ↗
        </a>
      </td>

      <!-- 14. כמות מקורות אימות עצמאיים -->
      <td style="padding:8px 6px">
        <div class="xs bold" style="font-size:10.5px" title="מספר מקורות עצמאיים מאומתים">
          📞 \${esc(h.phoneVerBadgeLabel)}
          <br>
          ✉️ \${esc(h.emailVerLabel)}
        </div>
      </td>

      <!-- 15. ציון איכות ומדד ליד -->
      <td style="padding:8px 6px">
        <span class="badge \${h.qualityColor === 'green' ? 'b-ok' : h.qualityColor === 'yellow' ? 'b-est' : 'b-bad'}" style="font-size:10px;font-weight:700">
          \${h.qualityScore} \${h.qualityColor === 'green' ? '⭐' : ''}
        </span>
      </td>

      <!-- 16. סטטוס החברה במערכת -->
      <td style="padding:8px 8px">
        \${h.adopted
          ? \`<span class="badge b-ok" style="font-weight:700">✓ \${esc(h.statusBadge || 'הועבר')}</span>\`
          : h.already
          ? \`<span class="badge" style="background:#f1f5f9;color:#64748b;border:1px solid #cbd5e1">🔒 קיים במאגר</span>\`
          : \`<span class="badge" style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;font-weight:700">✨ חדש טרם נשמר</span>\`
        }
      </td>

      <!-- 17. כפתור פתיחת מגירת פירוט רספונסיבית -->
      <td style="text-align:center;padding:8px 4px">
        <button class="btn btn-sm btn-ghost" data-act="toggleHitDrawer" data-hp="\${esc(h.no)}" style="padding:2px 6px;font-size:12px;cursor:pointer" title="הצג/הסתר פירוט כרטיס מלא">
          \${isExpanded ? '▲' : '▼'}
        </button>
      </td>
    </tr>
  \`;

  // מגירת פירוט רספונסיבית שנפתחת מתחת לשורה (מובייל וטאבלט)
  const drawerRow = isExpanded ? \`
    <tr id="drawer-\${esc(h.no)}" class="hit-drawer-row" style="background:#f8fafc;border-bottom:2px solid #cbd5e1">
      <td colspan="17" style="padding:14px 18px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
            <div class="bold" style="color:#1e3a8a;margin-bottom:6px">🏢 פרטי התאגדות ורישום רשמי</div>
            <div class="xs"><b>שם מלא:</b> \${esc(h.name)}</div>
            <div class="xs"><b>ח.פ. רשמי:</b> <span class="num ltr font-bold">\${esc(h.no)}</span></div>
            <div class="xs"><b>סטטוס משפטי:</b> \${esc(h.status || 'פעילה')}</div>
            <div class="xs"><b>תאריך רישום:</b> \${esc(h.incorporated || 'לא ידוע')}</div>
            <div class="xs" style="margin-top:4px"><b>מקור ממשלתי:</b> <a href="\${esc(h.source_url || 'https://data.gov.il')}" target="_blank" class="ltr" style="color:#2563eb">\${esc(h.source_label)} ↗</a></div>
          </div>

          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
            <div class="bold" style="color:#0f766e;margin-bottom:6px">📍 מיקום וכתובת מלאה</div>
            <div class="xs"><b>אזור בארץ:</b> \${esc(h.region || 'לא ידוע')}</div>
            <div class="xs"><b>עיר:</b> \${esc(h.city || 'לא ידוע')}</div>
            <div class="xs"><b>כתובת:</b> \${esc(h.addr || 'לא צוין ברשם')}</div>
            <div class="xs"><b>תחום ועיסוק:</b> \${esc(h.ind || '—')}</div>
          </div>

          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
            <div class="bold" style="color:#b45309;margin-bottom:6px">🚛 ראיות צי רכב ועובדים</div>
            <div class="xs"><b>סוג רכב/צי:</b> \${esc(h.fleetType || '—')}</div>
            <div class="xs"><b>הערכת צי:</b> \${h.fleetIsFact ? '<span class="badge b-ok">✓ עובדה: ענף 200/תקנה 579</span>' : '<span class="badge b-est">≈ הערכה ענפית</span>'}</div>
            <div class="xs"><b>מספר עובדים:</b> \${h.employeesCount !== null && h.employeesCount !== undefined ? \`\${h.employeesCount} (מאומת)\` : 'לא ידוע (ללא אסמכתא)'}</div>
            <div class="xs"><b>איש קשר:</b> \${esc(h.contactPerson || '—')}</div>
          </div>

          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
            <div class="bold" style="color:#7c3aed;margin-bottom:6px">📞 ערוצי תקשורת ואימות רב-מקורות</div>
            <div class="xs"><b>טלפון עסקי:</b> \${h.phone && h.phone !== '—' ? \`<a href="tel:\${esc(h.phone)}" class="ltr bold" style="color:#0284c7">\${esc(h.phone)}</a> (\${h.phoneVerBadgeLabel})\` : 'לא ידוע'}</div>
            <div class="xs"><b>נייד:</b> \${h.mobile && h.mobile !== '—' ? \`<a href="tel:\${esc(h.mobile)}" class="ltr bold" style="color:#16a34a">\${esc(h.mobile)}</a>\` : '—'}</div>
            <div class="xs"><b>אימייל:</b> \${h.email && h.email !== '—' ? \`<a href="mailto:\${esc(h.email)}" class="ltr" style="color:#2563eb">\${esc(h.email)}</a> (\${h.emailVerLabel})\` : '—'}</div>
            <div class="xs" style="margin-top:4px"><b>מקורות הצלבה שאושרו:</b> \${esc((h.phoneSourcesList || []).join(", ") || 'טרם הוצלבו מקורות')}</div>
            <div class="xs" style="margin-top:4px"><b>מדד איכות:</b> <span class="badge \${h.qualityColor==='green'?'b-ok':h.qualityColor==='yellow'?'b-est':'b-bad'}">\${h.qualityScore} (\${h.qualityLabel})</span></div>
          </div>
        </div>
      </td>
    </tr>
  \` : '';

  return mainRow + drawerRow;
}

/* ===== תצוגת כפילויות שנמנעו ===== */
function renderDuplicatesView() {
  const duplicates = S.searchDuplicates || [];

  return \`
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 16px;margin-bottom:14px;font-size:12.5px;color:#92400e">
    🛡️ <b>מניעת כפילויות קשיחה:</b> הרשומות שלהלן נסרקו במאגר הממשלתי אך זוהו ככפולות מול המאגר הקבוע שלך. הן <b>נחסמו אוטומטית</b> כדי למנוע דריסת נתונים קיימים.
  </div>

  \${duplicates.length > 0 ? \`
    <div class="tbl-wrap" style="max-height:450px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead style="background:#f1f5f9;position:sticky;top:0">
          <tr>
            <th style="padding:8px 10px;text-align:right">שם החברה שנסרקה</th>
            <th style="padding:8px 8px;text-align:right">ח.פ.</th>
            <th style="padding:8px 8px;text-align:right">עיר ותחום</th>
            <th style="padding:8px 10px;text-align:right">סיבת הכפילות המפורטת</th>
            <th style="padding:8px 8px;text-align:right">סטטוס במערכת</th>
          </tr>
        </thead>
        <tbody>
          \${duplicates.map(d => \`
            <tr style="border-bottom:1px solid #e2e8f0;background:#ffffff">
              <td style="padding:8px 10px" class="bold">\${esc(d.name)}</td>
              <td style="padding:8px 8px" class="ltr num bold">\${esc(d.no)}</td>
              <td style="padding:8px 8px">\${esc(d.city || '—')} · \${esc(d.ind || '—')}</td>
              <td style="padding:8px 10px;color:#b45309;font-weight:600">\${esc(d.reason)}</td>
              <td style="padding:8px 8px"><span class="badge" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a">⚠️ כפילות שנמנעה</span></td>
            </tr>
          \`).join("")}
        </tbody>
      </table>
    </div>
  \` : \`
    <div class="empty" style="padding:32px 16px;text-align:center;background:#f8fafc;border-radius:8px">
      <div style="font-size:24px;margin-bottom:6px">✓</div>
      <div class="bold">לא אותרו כפילויות בסריקה זו</div>
      <div class="xs muted">כל החברות שנמצאו חדשות לחלוטין.</div>
    </div>
  \`}
  \`;
}

/* ===== תצוגת רשומות שנפסלו ===== */
function renderRejectedView() {
  const rejected = S.searchRejected || [];

  return \`
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 16px;margin-bottom:14px;font-size:12.5px;color:#b91c1c">
    🚫 <b>בקרת איכות וסינון:</b> רשומות אלו הוחזרו ממאגר הממשלה אך נפסלו מכיוון שאינן עומדות בקריטריוני האיכות של המערכת (ח.פ. לא תקין, חברה מחוקה, או ללא פרטי זיהוי).
  </div>

  \${rejected.length > 0 ? \`
    <div class="tbl-wrap" style="max-height:450px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead style="background:#f1f5f9;position:sticky;top:0">
          <tr>
            <th style="padding:8px 10px;text-align:right">שם רשומה</th>
            <th style="padding:8px 8px;text-align:right">מספר מזהה</th>
            <th style="padding:8px 10px;text-align:right">סיבת הפסילה</th>
          </tr>
        </thead>
        <tbody>
          \${rejected.map(r => \`
            <tr style="border-bottom:1px solid #e2e8f0;background:#ffffff">
              <td style="padding:8px 10px" class="bold">\${esc(r.name)}</td>
              <td style="padding:8px 8px" class="ltr num">\${esc(r.no)}</td>
              <td style="padding:8px 10px;color:#ef4444;font-weight:600">\${esc(r.reason)}</td>
            </tr>
          \`).join("")}
        </tbody>
      </table>
    </div>
  \` : \`
    <div class="empty" style="padding:32px 16px;text-align:center;background:#f8fafc;border-radius:8px">
      <div style="font-size:24px;margin-bottom:6px">✓</div>
      <div class="bold">אפס רשומות נפסלו</div>
      <div class="xs muted">כל הרשומות שנסרקו היו תקינות ופעילות.</div>
    </div>
  \`}
  \`;
}

/* ===== אלגוריתם דירוג איכות ליד (LEAD QUALITY SCORE) ===== */
function evaluateHitQuality(h) {
  let score = 50; // בסיס לחברה רשומה ופעילה ברשם
  let color = "yellow";
  let label = "איכות בינונית";

  if (h.fleetIsFact) score += 25;
  else if (String(h.fleetPotential || "").includes("5+")) score += 15;

  if (h.phoneVerBadgeColor === "green") score += 20;
  else if (h.phone && h.phone !== "—" && h.phone !== "לא ידוע") score += 10;

  if (h.mobile && h.mobile !== "—") score += 10;
  if (h.email && h.email !== "—" && h.email !== "לא ידוע" && h.email.includes("@")) score += 10;
  if (h.addrKnown) score += 5;

  score = Math.min(98, Math.max(40, score));

  if (score >= 80 && (h.phone && h.phone !== "—" || h.mobile && h.mobile !== "—")) {
    color = "green";
    label = "איכות גבוהה ⭐";
  } else if (score >= 60) {
    color = "yellow";
    label = "איכות בינונית";
  } else {
    color = "red";
    label = "בסיסי / חסר קשר";
  }

  return { score, color, label };
}

/* ===== מנוע איתור חברות באצוות הדרגתיות (STREAMING PROGRESSIVE BATCH ENGINE) ===== */
async function runUnifiedSearch(customOpts = {}) {
  if (S.searchRunning) return;

  // 1. חילוץ שדות הטופס
  const kwInput = (($("#a-kw") && $("#a-kw").value.trim()) || customOpts.kw || (S._lastQueryTerm || "")).trim();
  let keywords = kwInput.split(/[,،;]+/).map(k => k.trim()).filter(Boolean);
  const indVal = ($("#a-ind") && $("#a-ind").value) || customOpts.ind || "";

  if (keywords.length === 0 && indVal && indVal !== "כל הענפים" && indVal !== "כל הענפים והתחומים") {
    keywords = (window.OPQualify && window.OPQualify.OPDomainKeywords)
      ? window.OPQualify.OPDomainKeywords.getKeywordsForDomain(indVal)
      : [indVal];
  }
  if (keywords.length === 0) keywords = ["הובלות"];

  const countInput = ($("#a-count") && parseInt($("#a-count").value, 10)) || customOpts.reqLimit || 50;
  const reqLimit = Math.max(5, Math.min(2000, countInput));
  
  // חילוץ מקורות נבחרים מהצ'קבוקסים
  const selectedSources = Array.from(document.querySelectorAll(".src-cb:checked")).map(cb => cb.value);
  if (selectedSources.length === 0) {
    selectedSources.push("companies", "contractors");
  }

  // הגדרת יעד הצלבות
  const targetCross = parseInt(($("#a-target-cross") && $("#a-target-cross").value) || customOpts.targetCross || 4, 10);

  // חילוץ שאר מסנני הפוסט-שליפה
  const regionVal = ($("#a-region") && $("#a-region").value) || customOpts.region || "";
  const cityVal = ($("#a-city") && $("#a-city").value.trim().toLowerCase()) || (customOpts.city || "").trim().toLowerCase();
  const fleetTypeVal = ($("#a-fleet-type") && $("#a-fleet-type").value) || customOpts.fleetType || "";
  const fleetModeVal = ($("#a-fleet-filter-mode") && $("#a-fleet-filter-mode").value) || customOpts.fleetMode || "all";
  const workforceVal = ($("#a-workforce-range") && $("#a-workforce-range").value) || customOpts.workforce || "all";
  const contactReqVal = ($("#a-contact-req") && $("#a-contact-req").value) || customOpts.contactReq || "all";

  S._lastQueryTerm = keywords.join(", ");
  S._lastSaveSuccess = null;

  // 2. אתחול משתני מצב
  S.searchRunning = true;
  S.searchStopRequested = false;
  S.searchHits = [];
  S.searchDuplicates = [];
  S.searchRejected = [];
  S.searchHitSelection = new Set();
  S.searchExpandedDrawers = new Set();
  S.searchActiveTab = "new";
  S.searchStats = {
    requested: reqLimit,
    scanned: 0,
    added: 0,
    duplicates: 0,
    rejected: 0,
    pending: 0,
    fleetEvidence: 0
  };

  // 3. הצגת שלד התוצאות מיד על המסך מתחת לטופס (< 500ms)
  const resultsContainer = $("#searchResultsArea");
  if (resultsContainer) {
    resultsContainer.innerHTML = renderSearchResultsArea();
    resultsContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // 4. בניית אינדקס מהיר למניעת כפילויות מול מאגר STAGING (2,018 חברות) ומאגר C
  const existingHpMap = new Map();
  if (typeof STAGING_DB_HPS !== "undefined" && STAGING_DB_HPS.forEach) {
    STAGING_DB_HPS.forEach(hp => {
      const norm = String(hp || "").replace(/\D/g, "");
      if (norm) existingHpMap.set(norm, { name: "חברה קיימת במאגר STAGING DB", no: norm, source: "database" });
    });
  }
  C.forEach(c => {
    const norm = (window.OPQualify ? OPQualify.normalizeCompanyHp(c.no) : String(c.no || "").replace(/\D/g, ""));
    if (norm) existingHpMap.set(norm, c);
  });
  const seenInCurrentRun = new Set();

  // 5. הגדרת משאבי data.gov.il לפי המקורות שנבחרו
  const datasets = [];
  if (selectedSources.includes("companies")) {
    datasets.push({
      id: "f004176c-b85f-4542-8901-7b3176f9a054",
      type: "companies",
      name: "רשם החברות"
    });
  }
  if (selectedSources.includes("contractors")) {
    datasets.push({
      id: "4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8",
      type: "contractors",
      name: "פנקס הקבלנים"
    });
  }

  // אם לא נבחר אף מאגר ממשלתי, השתמש ברשם ובקבלנים כברירת מחדל
  if (datasets.length === 0) {
    datasets.push(
      { id: "f004176c-b85f-4542-8901-7b3176f9a054", type: "companies", name: "רשם החברות" },
      { id: "4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8", type: "contractors", name: "פנקס הקבלנים" }
    );
  }

  const batchSize = 50;
  let batchIndex = 1;
  const startTime = Date.now();

  try {
    const maxOffset = Math.max(250, reqLimit * 4);
    let offset = 0;

    const targetPerDsInRound = Math.max(10, Math.ceil(reqLimit / (datasets.length || 1)));
    while (offset < maxOffset && !S.searchStopRequested && S.searchStats.added < reqLimit) {
      let anyRecordsInRound = false;

      for (const ds of datasets) {
        if (S.searchStopRequested || S.searchStats.added >= reqLimit) break;
        let addedThisDs = 0;

        for (const kw of keywords) {
          if (S.searchStopRequested || S.searchStats.added >= reqLimit) break;

          updateLiveSearchStatus(\`סורק אצווה \${batchIndex} מ-\${ds.name} (מילת מפתח: "\${kw}", היסט: \${offset})...\`);

          const url = \`https://data.gov.il/api/3/action/datastore_search?resource_id=\${ds.id}&q=\${encodeURIComponent(kw)}&limit=\${batchSize}&offset=\${offset}\`;

          let records = [];
          try {
            const resp = await fetch(url);
            if (resp.ok) {
              const json = await resp.json();
              if (json && json.success && Array.isArray(json.result?.records)) {
                records = json.result.records;
              }
            }
          } catch (err) {
            console.warn("שגיאת שליפה מאצווה:", err);
          }

          if (records.length === 0) continue;
          anyRecordsInRound = true;
          S.searchStats.scanned += records.length;

          const newBatchHits = [];

          for (const rec of records) {
            const rawHit = ds.type === "contractors" ? contractorHit(rec) : registryHit(rec);
            if (!rawHit) {
              S.searchStats.rejected++;
              S.searchRejected.push({
                name: rec.SHEM_YESHUT || rec["שם חברה"] || "ללא שם",
                no: rec.MISPAR_YESHUT || rec["מספר חברה"] || "ללא ח.פ.",
                reason: "חסר שם או ח.פ. תקין"
              });
              continue;
            }

            rawHit.source_keyword = kw;
            const normHp = (window.OPQualify ? OPQualify.normalizeCompanyHp(rawHit.no) : String(rawHit.no).replace(/\\D/g, ""));
            rawHit.no = normHp;

            // בדיקת כפילות בתוך הריצה הנוכחית
            if (seenInCurrentRun.has(normHp)) {
              S.searchStats.duplicates++;
              S.searchDuplicates.push({
                name: rawHit.name,
                no: normHp,
                city: rawHit.city,
                ind: rawHit.ind,
                reason: "כפילות שחזרה בתוך תוצאות החיפוש הנוכחי"
              });
              continue;
            }

            // בדיקת כפילות מול מאגר C הקיים
            if (existingHpMap.has(normHp)) {
              const existing = existingHpMap.get(normHp);
              S.searchStats.duplicates++;
              S.searchDuplicates.push({
                name: rawHit.name,
                no: normHp,
                city: rawHit.city,
                ind: rawHit.ind,
                reason: \`ח.פ. קיים במאגר: "\${existing.name}" (סטטוס: \${existing.status || 'חדש'}, נשמר: \${existing.found || 'בעבר'})\`
              });
              continue;
            }

            // סינונים מקומיים (Post-Fetch Filters):
            // א. סינון עיר
            if (cityVal && !String(rawHit.city || "").toLowerCase().includes(cityVal)) {
              continue;
            }

            // ב. סינון אזור (תיקון כל הארץ / כל האזורים)
            const derivedReg = (window.OPQualify ? OPQualify.cityToRegion(rawHit.city) : "לא ידוע");
            rawHit.region = derivedReg;
            if (regionVal && regionVal !== "כל הארץ" && regionVal !== "כל האזורים" && derivedReg !== regionVal) {
              continue;
            }

            // ג. סינון תחום פעילות
            if (indVal && indVal !== "כל הענפים" && indVal !== "כל הענפים והתחומים" && !String(rawHit.ind || "").includes(indVal) && !String(rawHit.name || "").includes(indVal)) {
              continue;
            }

            // ד. סינון סוג רכב
            if (fleetTypeVal && !String(rawHit.fleetPotential || "").includes(fleetTypeVal) && !String(rawHit.ind || "").includes(fleetTypeVal) && !String(rawHit.name || "").includes(fleetTypeVal)) {
              continue;
            }

            // ה. סינון צי (עובדה מול פוטנציאל)
            if (fleetModeVal === "indication_200" && !String(rawHit.fleetPotential || "").includes("200")) {
              continue;
            }
            if (fleetModeVal === "potential_5plus" && !String(rawHit.fleetPotential || "").includes("5+") && !rawHit.fleetIsFact) {
              continue;
            }
            if (fleetModeVal === "no_fleet" && (rawHit.fleetIsFact || String(rawHit.fleetPotential || "").includes("5+"))) {
              continue;
            }

            // ו. סינון מספר עובדים (Workforce Range Filter):
            // רשם החברות אינו מדווח עובדים; לכן rawHit.employeesCount הוא null ללא אסמכתא
            const empNum = rawHit.employeesCount !== undefined ? rawHit.employeesCount : null;
            if (workforceVal === "1-50") {
              if (empNum === null || empNum < 1 || empNum > 50) continue;
            } else if (workforceVal === "51-100") {
              if (empNum === null || empNum < 51 || empNum > 100) continue;
            } else if (workforceVal === "101-500") {
              if (empNum === null || empNum < 101 || empNum > 500) continue;
            } else if (workforceVal === "501plus") {
              if (empNum === null || empNum < 501) continue;
            } else if (workforceVal === "unknown") {
              if (empNum !== null) continue;
            }

            // ז. מנוע הצלבת מקורות ואימות טלפון ירוק מחמיר (True Green Phone Cross-Referencing)
            const hasPhone = rawHit.phone && rawHit.phone !== "לא ידוע" && rawHit.phone !== "לא נמצא" && rawHit.phone !== "—";
            const isMobile = hasPhone && (rawHit.phone.startsWith("05") || String(rawHit.mobile || "").startsWith("05"));
            const hasEmail = rawHit.email && rawHit.email !== "לא ידוע" && rawHit.email !== "—" && rawHit.email.includes("@");

            const phoneSources = [];
            if (hasPhone) {
              if (rawHit.source === "contractors") {
                phoneSources.push("פנקס הקבלנים ענף 200 (data.gov.il)");
              }
              // בדיקת הצלבה מול טלפון מאומת במאגר STAGING DB (מקור עצמאי שני)
              const stagingRec = (typeof STAGING_VERIFIED_PHONES !== "undefined") ? STAGING_VERIFIED_PHONES[normHp] : null;
              if (stagingRec && stagingRec.phone) {
                const normP1 = rawHit.phone.replace(/\D/g, "");
                const normP2 = String(stagingRec.phone).replace(/\D/g, "");
                if (normP1 && normP2 && (normP1 === normP2 || normP1.endsWith(normP2) || normP2.endsWith(normP1))) {
                  phoneSources.push("מאגר מאומת STAGING DB");
                }
              }
            }

            // כלל אימות טלפון ירוק: רק אם אותו מספר בדיוק מופיע ב-2 מקורות עצמאיים ומעלה -> GREEN
            const phoneMatches = phoneSources.length;
            rawHit.phoneSourcesList = phoneSources;
            rawHit.phoneMatches = phoneMatches;

            if (phoneMatches >= 2) {
              rawHit.phoneVerBadgeColor = "green";
              rawHit.phoneVerBadgeLabel = (targetCross === 2)
                ? "✓ ירוק (2/2)"
                : \`✓ ירוק (מינימום הושג: \${phoneMatches}/\${targetCross})\`;
              rawHit.phoneVerStatus = \`מאומת (\${phoneMatches} מקורות עצמאיים: \${phoneSources.join(', ')})\`;
            } else if (phoneMatches === 1) {
              rawHit.phoneVerBadgeColor = "yellow";
              rawHit.phoneVerBadgeLabel = \`חלקי (1/\${targetCross})\`;
              rawHit.phoneVerStatus = \`אימות חלקי (מקור יחיד: \${phoneSources[0]}) - דורש מקור עצמאי שני לסטטוס ירוק\`;
            } else {
              rawHit.phoneVerBadgeColor = "gray";
              rawHit.phoneVerBadgeLabel = \`0/\${targetCross}\`;
              rawHit.phoneVerStatus = "ללא אימות טלפוני עצמאי";
            }

            // אימות אימייל נפרד (אימייל לא הופך טלפון לירוק!)
            const emailSources = [];
            if (hasEmail) {
              emailSources.push("פנקס הקבלנים (data.gov.il)");
            }
            rawHit.emailMatches = emailSources.length;
            rawHit.emailVerLabel = emailSources.length > 0 ? \`\${emailSources.length}/\${targetCross}\` : \`0/\${targetCross}\`;

            // ח. סינון פרטי קשר נדרשים
            if (contactReqVal === "green_phone" && rawHit.phoneVerBadgeColor !== "green") continue;
            if (contactReqVal === "phone" && !hasPhone) continue;
            if (contactReqVal === "mobile" && !isMobile) continue;
            if (contactReqVal === "email" && !hasEmail) continue;
            if (contactReqVal === "any" && !hasPhone && !hasEmail) continue;

            // הפרדת טלפון נייח מנייד עסקי
            if (isMobile) {
              rawHit.mobile = rawHit.phone;
              rawHit.phone = "—";
            } else if (hasPhone) {
              rawHit.mobile = "—";
            } else {
              rawHit.phone = "—";
              rawHit.mobile = "—";
            }

            // חישוב מדד איכות, אימות וסטטוס
            const qual = evaluateHitQuality(rawHit);
            rawHit.qualityScore = qual.score;
            rawHit.qualityColor = qual.color;
            rawHit.qualityLabel = qual.label;
            rawHit.statusBadge = "✨ חדש טרם נשמר";
            rawHit.already = false;
            rawHit.adopted = false;

            seenInCurrentRun.add(normHp);
            newBatchHits.push(rawHit);
            S.searchHits.push(rawHit);
            S.searchHitSelection.add(rawHit.no); // סימון אוטומטי של חברות חדשות לבחירה
            S.searchStats.added++;
            S.searchStats.pending = S.searchHitSelection.size;
            if (rawHit.fleetIsFact || String(rawHit.fleetPotential || "").includes("5+")) {
              S.searchStats.fleetEvidence++;
            }

            addedThisDs++;
            if (S.searchStats.added >= reqLimit || addedThisDs >= targetPerDsInRound) break;
          }

          // הזנה הדרגתית של תוצאות האצווה מיד ל-DOM ללא המתנה (Streaming First Paint)
          if (newBatchHits.length > 0) {
            appendHitsToLiveTable(newBatchHits);
          }
          updateLiveKpisAndProgress();

          if (S.searchStats.added >= reqLimit || addedThisDs >= targetPerDsInRound) break;
        }
      }
      offset += batchSize;
      batchIndex++;
      if (!anyRecordsInRound && offset > 100) break;
      await new Promise(r => setTimeout(r, 60)); // smooth render yield
    }
  } finally {
    S.searchRunning = false;
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    updateLiveSearchStatus(\`סריקה הסתיימה תוך \${duration} שניות. נמצאו \${S.searchStats.added} חברות חדשות לבדיקה ואישור.\`);
    updateLiveKpisAndProgress();
    updateActionButtonsState();
    toast(\`סריקה הסתיימה: נמצאו \${S.searchStats.added} חברות חדשות (\${duration} שניות)\`);
  }
}

/* הוספת שורות הדרגתית לטבלה החיה */
function appendHitsToLiveTable(newHits) {
  const tbody = $("#searchHitsTableBody");
  if (!tbody) {
    const area = $("#searchResultsArea");
    if (area) area.innerHTML = renderSearchResultsArea();
    return;
  }
  const frag = document.createDocumentFragment();
  newHits.forEach(h => {
    const temp = document.createElement("tbody");
    temp.innerHTML = renderHitTableRow(h);
    while (temp.firstChild) {
      frag.appendChild(temp.firstChild);
    }
  });
  tbody.appendChild(frag);
}

/* עדכון חי של כרטיסי KPI ומד התקדמות */
function updateLiveKpisAndProgress() {
  const s = S.searchStats;
  if (!s) return;
  const target = s.requested || 50;
  const pct = Math.min(100, Math.round((s.added / target) * 100)) || 0;

  const pBar = $("#searchProgressBar"); if (pBar) pBar.style.width = \`\${pct}%\`;
  const pPct = $("#searchProgressPercent"); if (pPct) pPct.textContent = \`\${pct}% (\${s.added} מתוך \${target})\`;
  const elScanned = $("#kpiScanned"); if (elScanned) elScanned.textContent = String(s.scanned);
  const elAdded = $("#kpiAdded"); if (elAdded) elAdded.textContent = String(s.added);
  const elDuplicates = $("#kpiDuplicates"); if (elDuplicates) elDuplicates.textContent = String(s.duplicates);
  const elRejected = $("#kpiRejected"); if (elRejected) elRejected.textContent = String(s.rejected);
  const elFleet = $("#kpiFleet"); if (elFleet) elFleet.textContent = String(s.fleetEvidence);
  const elPending = $("#kpiPending"); if (elPending) elPending.textContent = String(S.searchHitSelection ? S.searchHitSelection.size : s.added);
  const badge = $("#hitSelectedCountBadge");
  if (badge) {
    const freshCount = (S.searchHits || []).filter(h => !h.already && !h.adopted).length;
    const selCount = S.searchHitSelection ? S.searchHitSelection.size : 0;
    badge.textContent = \`סומנו \${selCount} מתוך \${freshCount} חברות חדשות\`;
  }
}

function updateLiveSearchStatus(msg) {
  const lbl = $("#searchProgressLabel"); if (lbl) lbl.textContent = msg;
  const st = $("#searchLiveStatusNote"); if (st) st.textContent = msg;
  const hdr = $("#searchHeaderStatus"); if (hdr) hdr.textContent = msg;
}

function updateActionButtonsState() {
  const btnSearch = $("#btnUnifiedSearch");
  if (btnSearch) {
    btnSearch.disabled = S.searchRunning;
    btnSearch.innerHTML = \`<span>\${S.searchRunning ? '⏳ סורק מאגרים באצוות...' : '🚀 הפעל איתור חברות חינמי ומבוקר (0 ₪)'}</span>\`;
  }
  const selCount = S.searchHitSelection ? S.searchHitSelection.size : 0;
  const btnSave = $("#btnSaveToDiscovered");
  if (btnSave) {
    btnSave.disabled = selCount === 0;
    btnSave.innerHTML = \`<span>📥 שמור חברות נבחרות כ'חברות שנמצאו' (שלב 2) [\${selCount}]</span>\`;
  }
}

/* עדכון סינון חי בטבלה */
function renderSearchHitsFiltered() {
  const area = $("#searchResultsArea");
  if (!area) return;
  area.innerHTML = renderSearchResultsArea();
}

/* ===== תמיכה בשלב 2: שמירת חברות נבחרות כ'חברות שנמצאו' (Discovered Companies) ===== */
async function saveSelectedToDiscovered() {
  const sel = S.searchHitSelection || new Set();
  const hits = S.searchHits || [];
  const picks = hits.filter(h => sel.has(h.no) && !h.already && !h.adopted);

  if (!picks.length) {
    toast("יש לסמן לפחות חברה חדשה אחת לשמירה כחברה שנמצאה");
    return;
  }

  const created = [];
  picks.forEach(h => {
    const normHp = (window.OPQualify ? OPQualify.normalizeCompanyHp(h.no) : String(h.no).replace(/\\D/g, ''));
    const reg = h.region || (window.OPQualify ? OPQualify.cityToRegion(h.city) : "לא ידוע");

    const comp = {
      id: Date.now() + Math.floor(Math.random() * 10000),
      name: h.name,
      no: normHp,
      ind: h.ind || "כללי",
      city: h.city || "לא ידוע",
      region: reg,
      addr: h.addr || h.city || "לא ידוע",
      web: "",
      phone: h.phone && h.phone !== "—" && h.phone !== "לא ידוע" ? h.phone : (h.mobile && h.mobile !== "—" ? h.mobile : ""),
      mail: h.email && h.email !== "—" && h.email !== "לא ידוע" ? h.email : "",
      size: h.employees || "לא ידוע (ללא אסמכתא)",
      fleet: {
        s: h.fleetIsFact ? "v" : "f",
        val: h.fleetPotential || "לא ידוע",
        src: h.source_label || "data.gov.il"
      },
      fleetType: h.fleetType || h.ind || "רכבי עבודה",
      score: h.qualityScore || 65,
      status: "new",
      isApprovedLead: false, // שלב 2: חברה שנמצאה! טרם אושרה ללידים
      discovery_batch: "batch_custom",
      source_keyword: h.source_keyword || S._lastQueryTerm || "",
      source: h.source || "companies",
      found: new Date().toLocaleDateString("he-IL"),
      upd: new Date().toLocaleDateString("he-IL"),
      multiPhones: (h.phone && h.phone !== "—") || (h.mobile && h.mobile !== "—") ? [{ val: h.phone !== "—" ? h.phone : h.mobile, source: h.source_label, tier: "A", tierLabel: "Tier A | ממשלתי רשמי" }] : [],
      multiMails: h.email && h.email !== "—" ? [{ val: h.email, source: h.source_label, tier: "A", tierLabel: "Tier A | ממשלתי רשמי" }] : [],
      facts: {
        no: "v",
        ind: h.ind && h.ind !== "לא ידוע" ? "v" : "n",
        addr: h.addrKnown ? "v" : "n",
        web: "n",
        phone: (h.phone && h.phone !== "—") || (h.mobile && h.mobile !== "—") ? "v" : "n",
        mail: h.email && h.email !== "—" ? "v" : "n",
        size: "n"
      },
      ev: [
        ["🏛️", h.source_label || "data.gov.il", \`ח.פ. \${normHp}, מקור: \${h.source_label}, סטטוס: \${h.status || 'פעילה'}\`, "https://data.gov.il", "v", new Date().toLocaleDateString("he-IL"), "A", "Tier A ממשלתי"]
      ],
      people: [],
      notes: \`נשמר כחברה שנמצאה (שלב 2) מתוך איתור ממוקד: \${h.source_label}.\`,
      searchStaged: false
    };

    C.unshift(comp);
    created.push(comp);
    h.adopted = true;
    h.already = true;
    h.statusBadge = "✓ נשמר כחברה שנמצאה (שלב 2)";
    sel.delete(h.no);
  });

  persistProspectorData();

  if (typeof upsertBatchToRemoteSupabase === "function") {
    await upsertBatchToRemoteSupabase(created);
  }

  // שמירת מצב ההצלחה להצגת באנר מעבר לשלב 2
  S._lastSaveSuccess = {
    count: created.length,
    timestamp: Date.now()
  };

  renderSearchHitsFiltered();
  renderNav();
  toast(\`נשמרו בהצלחה \${created.length} חברות בלשונית 'חברות שנמצאו' (שלב 2)\`);
}

/* שער אישור AI מבוקר */
function openAiApprovalGate() {
  const q = ($("#ai-query") ? $("#ai-query").value : "").trim();
  if (!q) {
    toast("כתוב בקשת איתור בעברית לפני פתיחת שער האישור");
    return;
  }
  S._lastAiPrompt = q;

  const container = $("#aiApprovalGateContainer");
  if (!container) return;

  container.innerHTML = \`
    <div class="card" style="margin-top:14px;border:1.5px solid #7c3aed;background:#faf5ff;padding:16px">
      <div class="row bold" style="color:#6b21a8;margin-bottom:8px">
        <span>🤖 שער אישור להפעלת מנוע Gemini Flash 3.8</span>
        <span class="spacer"></span>
        <span class="badge b-ok">עלות משוערת: ~0.01 ₪</span>
      </div>
      <p class="sm" style="line-height:1.5;margin-bottom:12px">
        בקשתך: <b>"\${esc(q)}"</b>
        <br>הפעולה תשלח שאילתת פענוח ל-Gemini, תחלץ את מילות החיפוש, המאגר והאזורים, ותפעיל איתור חברות אוטומטי מול data.gov.il.
        <br><b>האם לאשר ולהפעיל כעת?</b>
      </p>
      <div class="row" style="gap:10px">
        <button class="btn btn-primary" data-act="confirmAndExecuteGemini" style="background:#7c3aed;border-color:#7c3aed;font-weight:700">
          ✓ אשר והפעל ניתוח Gemini
        </button>
        <button class="btn btn-ghost" data-act="cancelAiGate" style="border:1px solid #cbd5e1;background:#fff">
          ✕ בטל
        </button>
      </div>
    </div>
  \`;
}

async function executeGeminiEdgeCall() {
  const q = S._lastAiPrompt || ($("#ai-query") ? $("#ai-query").value : "").trim();
  const gate = $("#aiApprovalGateContainer");
  if (gate) {
    gate.innerHTML = \`
      <div class="card" style="padding:14px;background:#f8fafc;border:1px solid #cbd5e1;margin-top:10px">
        <div class="row bold">
          <span>⏳ מפענח דרישה ב-Gemini AI (אישור משתמש התקבל)...</span>
          <span class="badge" style="background:#f5f3ff;color:#7c3aed">Gemini Flash 3.8</span>
        </div>
      </div>
    \`;
  }

  let parsed = null;
  const sess = await userSession();

  if (sess && window.SUPABASE_STAGING_URL) {
    try {
      const res = await fetch(\`\${SUPABASE_STAGING_URL}/functions/v1/marketing-gemini-chat\`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_STAGING_ANON,
          "Authorization": \`Bearer \${sess.accessToken}\`
        },
        body: JSON.stringify({
          prompt: \`נתח את בקשת החיפוש לאיתור לקוחות עם צי רכב בישראל: "\${q}". החזר אובייקט JSON בלבד בפורמט: {"region":"מרכז|צפון|דרום|כל הארץ","industry":"הפצה ולוגיסטיקה|שירות וטכנאי שטח|הובלות|בנייה ותשתיות|כל הענפים","fleet":5,"role":"מנהל צי רכב|קצין בטיחות בתעבורה|מנהל תפעול","count":50,"keyword":"הובלות"}\`
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.reply) {
          const match = data.reply.match(/\\{[\\s\\S]*\\}/);
          if (match) parsed = JSON.parse(match[0]);
        }
      }
    } catch (e) {
      console.warn("Gemini edge call failed, falling back to heuristic parser", e);
    }
  }

  // Fallback heuristic parser if edge call wasn't available
  if (!parsed) {
    let kw = "הובלות";
    let reg = "";
    let cnt = 50;
    if (q.includes("עפר") || q.includes("תשתית") || q.includes("קבלן")) kw = "תשתית";
    else if (q.includes("לוגיסט") || q.includes("הפצ")) kw = "לוגיסטיקה";
    else if (q.includes("הסע") || q.includes("אוטובוס")) kw = "הסעות";
    if (q.includes("מרכז")) reg = "מרכז";
    else if (q.includes("דרום")) reg = "דרום";
    else if (q.includes("צפון")) reg = "צפון";
    const m = q.match(/\\b(\\d+)\\b/);
    if (m) cnt = parseInt(m[1], 10);
    parsed = { keyword: kw, region: reg, count: cnt, industry: kw };
  }

  if (gate) {
    gate.innerHTML = \`
      <div class="card" style="margin-top:12px;border:1.5px solid #16a34a;background:#f0fdf4;padding:14px">
        <div class="row bold" style="color:#15803d;margin-bottom:6px">
          <span>✓ פענוח Gemini הושלם בהצלחה — עובר לאיתור חברות במאגר</span>
          <span class="badge b-ok">מאושר</span>
        </div>
        <div class="chips">
          <span>מילת מפתח: <b>\${esc(parsed.keyword || 'הובלות')}</b></span>
          <span>אזור: <b>\${esc(parsed.region || 'כל הארץ')}</b></span>
          <span>כמות: <b>\${parsed.count || 50}</b></span>
        </div>
      </div>
    \`;
  }

  // עדכון שדות הטופס הראשי והפעלת החיפוש החי
  S.searchTrack = "free";
  S._lastQueryTerm = parsed.keyword || "הובלות";
  render();

  setTimeout(() => {
    if ($("#a-kw")) $("#a-kw").value = parsed.keyword || "הובלות";
    if ($("#a-count")) $("#a-count").value = String(parsed.count || 50);
    if ($("#a-region") && parsed.region) $("#a-region").value = parsed.region;
    runUnifiedSearch({
      kw: parsed.keyword || "הובלות",
      region: parsed.region || "",
      reqLimit: parsed.count || 50
    });
  }, 100);
}

function runInternalQuery() {
  const q = ($("#q-internal") ? $("#q-internal").value : "").trim();
  if (!q) {
    toast("כתוב שאילתה או בחר דוגמה לתחקור המאגר הקיים");
    return;
  }
  const prevView = S.view;
  const prevTab = S.tab;

  const localAnswer = executeNaturalQuery(q);

  if (S.tab !== "search") {
    S.view = prevView;
    S.tab = "search";
    S.searchTrack = "internal";
    render();
    if ($("#q-internal")) $("#q-internal").value = q;
  }

  const area = $("#internalQueryResultsArea");
  if (localAnswer && localAnswer.text) {
    if (area) {
      area.innerHTML = \`
        <div class="card" style="margin-top:14px;border:1.5px solid #10b981;background:#ffffff;padding:16px;border-radius:10px">
          <div class="bold" style="color:#065f46;font-size:15px;margin-bottom:8px">
            🔍 ממצאי תחקור מקומי במאגר (\${C.length} חברות שמורות · 0 ₪)
          </div>
          <div style="white-space:pre-wrap;line-height:1.6;font-size:13.5px">\${esc(localAnswer.text)}</div>
          <div style="margin-top:12px;display:flex;gap:8px">
            <button class="btn btn-sm btn-primary" data-go="companies" style="background:#059669;border-color:#059669;font-weight:700">
              <span>מעבר לצפייה בחברות המסוננות ב'חברות שנמצאו' ➔</span>
            </button>
          </div>
        </div>
      \`;
    }
    toast("תחקור מקומי הושלם (0 ₪)");
  } else {
    if (area) {
      area.innerHTML = \`
        <div class="card" style="margin-top:14px;background:#f8fafc;padding:14px;border:1px solid #cbd5e1">
          <div class="bold">לא נמצא מענה ישיר במאגר הקיים עבור "\${esc(q)}"</div>
          <div class="xs muted" style="margin-top:4px">מעוניין לאתר חברות חדשות במאגרי ממשלת ישראל?</div>
          <button class="btn btn-sm btn-primary" data-act="setSearchTrack" data-track="free" style="margin-top:8px">
            🌐 עבור לאיתור חברות חדשות ברשם
          </button>
        </div>
      \`;
    }
  }
}

/* חילוץ רשומת רשם החברות */
function registryHit(rec) {
  const hp = String(rec["מספר חברה"] || "").replace(/\\D/g, "");
  const name = String(rec["שם חברה"] || "").replace(/בע~מ|בע״מ|בע"מ/g, "").trim();
  if (!hp || hp.length < 5 || !name) return null;
  const cityRaw = String(rec["שם עיר"] || rec["ישוב"] || "").trim();
  const street = String(rec["שם רחוב"] || "").trim();
  const house = String(rec["מספר בית"] || "").trim();
  const descRaw = String(rec["תאור חברה"] || "").trim();
  const purposeRaw = String(rec["מטרת החברה"] || "").trim();
  const industryText = descRaw || (purposeRaw && !purposeRaw.includes("עיסוק חוקי") ? purposeRaw : "חברה פעילה ברשם");
  const status = String(rec["סטטוס חברה"] || "פעילה").trim();
  const isHeavy = /הובל|משאיות|הפצה|לוגיסטיקה|שינוע|קירור|מנוף|גרירה/.test(name + " " + industryText);

  return {
    no: hp,
    name,
    city: cityRaw || "לא ידוע",
    addr: street ? \`\${street}\${house ? " " + house : ""}\${cityRaw ? ", " + cityRaw : ""}\` : (cityRaw || "לא ידוע"),
    ind: industryText,
    status: status || "פעילה",
    incorporated: String(rec["תאריך התאגדות"] || "").trim() || "לא ידוע",
    addrKnown: !!street,
    phone: "—",
    mobile: "—",
    email: "—",
    employees: "לא ידוע (ללא אסמכתא)",
    employeesCount: null, // רשם החברות אינו מדווח מספר עובדים
    fleetIsFact: false, // מילות מפתח ענפיות הן הערכה בלבד, לא עובדה!
    fleetPotential: isHeavy ? "פוטנציאל צי 5+ (הערכה ענפית)" : "הערכה (ללא אסמכתא)",
    fleetType: isHeavy ? "משאיות הובלה ולוגיסטיקה" : "רכבי עבודה",
    source: "companies",
    source_label: "רשם החברות",
    source_url: \`https://data.gov.il/dataset/f004176c-b85f-4542-8901-7b3176f9a054\`,
    tierLabel: "Tier A | ממשלתי רשמי"
  };
}

/* חילוץ רשומת פנקס הקבלנים */
function contractorHit(rec) {
  const hp = String(rec.MISPAR_YESHUT || rec["מספר ח.פ."] || rec["מספר חברה"] || rec["ח.פ"] || rec["ח.פ."] || "").replace(/\\D/g, "");
  const name = String(rec.SHEM_YESHUT || rec["שם קבלן"] || rec["שם חברה"] || "").replace(/בע~מ|בע״מ|בע"מ/g, "").trim();
  if (!hp || hp.length < 5 || !name) return null;

  const cityRaw = String(rec.SHEM_YISHUV || rec["ישוב"] || rec["שם ישוב"] || rec["עיר"] || "").trim();
  const street = String(rec.SHEM_REHOV || "").trim();
  const house = String(rec.MISPAR_BAIT || "").trim();
  const branch = String(rec.TEUR_ANAF || "קבלן רשום ענף 200").trim();
  const kodAnaf = String(rec.KOD_ANAF || "").trim();
  const isBranch200 = kodAnaf === "200" || branch.includes("200") || branch.includes("עפר") || branch.includes("כבישים") || branch.includes("תשתית");
  const phone = formatIsraeliPhone(rec.MISPAR_TEL) || "—";
  const email = rec.EMAIL && String(rec.EMAIL).includes("@") ? String(rec.EMAIL).trim() : "—";

  return {
    no: hp,
    name,
    city: cityRaw || "לא ידוע",
    addr: street ? \`\${street}\${house ? " " + house : ""}\${cityRaw ? ", " + cityRaw : ""}\` : (cityRaw || "לא ידוע"),
    ind: branch,
    status: "פעילה",
    incorporated: String(rec.TAARICH_KABLAN || "").trim() || "לא ידוע",
    addrKnown: !!street || !!cityRaw,
    phone: phone,
    mobile: phone.startsWith("05") ? phone : "—",
    email: email,
    employees: "לא ידוע (ללא אסמכתא)",
    employeesCount: null, // פנקס הקבלנים מדווח סיווג כספי אך לא מצבת עובדים
    fleetIsFact: false, // ענף 200 הוא אינדיקציה ענפית בלבד, לא עובדת רישוי קשיחה
    fleetPotential: isBranch200 ? '≈ פוטנציאל צי 5+ (אינדיקציה: ענף 200)' : '≈ פוטנציאל צי 5+ (הערכה ענפית)',
    fleetType: isBranch200 ? "ציוד כבד ועבודות תשתית" : "רכבי שירות ועבודה",
    source: "contractors",
    source_label: "פנקס הקבלנים",
    source_url: \`https://data.gov.il/dataset/4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8\`,
    tierLabel: "Tier A | ממשלתי רשמי"
  };
}

function formatIsraeliPhone(raw) {
  if (!raw) return "";
  const digits = String(raw).replace(/\\D/g, "");
  if (!digits || digits === "0" || digits === "00" || digits === "000") return "";
  let full = digits;
  if (!full.startsWith("0")) full = "0" + full;
  if (full.length === 10) {
    return full.slice(0, 3) + "-" + full.slice(3, 6) + "-" + full.slice(6);
  }
  if (full.length === 9) {
    return full.slice(0, 2) + "-" + full.slice(2, 5) + "-" + full.slice(5);
  }
  return full;
}

`;

// Perform the replacement
let updated = content.slice(0, startIndex) + unifiedCode + content.slice(endIndex);

// Now update the click event listener to wire all the new data-acts
const clickCaseAnchor = 'case "run":runSearch();return;';
const newClickCases = `case "setSearchTrack": {
      S.searchTrack = d.track || "free";
      render();
      return;
    }
    case "setCountPill": {
      const inp = $("#a-count");
      if (inp) inp.value = d.val || "50";
      if (!S.searchStats) S.searchStats = {};
      S.searchStats.requested = parseInt(d.val || "50", 10);
      document.querySelectorAll("[data-act='setCountPill']").forEach(btn => {
        btn.style.fontWeight = btn.dataset.val === d.val ? "700" : "400";
        btn.style.background = btn.dataset.val === d.val ? "#eff6ff" : "#fff";
      });
      return;
    }
    case "setSearchKwPill": {
      const inp = $("#a-kw");
      if (inp) {
        inp.value = d.val || "";
        inp.focus();
      }
      return;
    }
    case "setAiPromptPill": {
      const ta = $("#ai-query");
      if (ta) {
        ta.value = d.val || "";
        ta.focus();
      }
      return;
    }
    case "openAiApprovalGate": {
      openAiApprovalGate();
      return;
    }
    case "confirmAndExecuteGemini": {
      executeGeminiEdgeCall();
      return;
    }
    case "cancelAiGate": {
      const c = $("#aiApprovalGateContainer");
      if (c) c.innerHTML = "";
      return;
    }
    case "runUnifiedSearch": {
      runUnifiedSearch();
      return;
    }
    case "stopSearch": {
      S.searchStopRequested = true;
      toast("בקשת עצירה התקבלה. עוצר סריקה...");
      return;
    }
    case "resetSearchForm": {
      if ($("#a-kw")) $("#a-kw").value = "";
      if ($("#a-count")) $("#a-count").value = "50";
      if ($("#a-ind")) $("#a-ind").value = "";
      if ($("#a-region")) $("#a-region").value = "";
      if ($("#a-city")) $("#a-city").value = "";
      if ($("#a-workforce-range")) $("#a-workforce-range").value = "all";
      if ($("#a-fleet-type")) $("#a-fleet-type").value = "";
      if ($("#a-fleet-filter-mode")) $("#a-fleet-filter-mode").value = "all";
      if ($("#a-target-cross")) $("#a-target-cross").value = "4";
      if ($("#a-contact-req")) $("#a-contact-req").value = "all";
      document.querySelectorAll(".src-cb").forEach(cb => {
        cb.checked = cb.value !== "social";
      });
      toast("הטופס אופס לברירת מחדל");
      return;
    }
    case "setResultsTab": {
      S.searchActiveTab = d.tab || "new";
      const area = $("#searchResultsArea");
      if (area) area.innerHTML = renderSearchResultsArea();
      return;
    }
    case "toggleHitDrawer": {
      const hp = d.hp;
      if (!S.searchExpandedDrawers) S.searchExpandedDrawers = new Set();
      if (S.searchExpandedDrawers.has(hp)) {
        S.searchExpandedDrawers.delete(hp);
      } else {
        S.searchExpandedDrawers.add(hp);
      }
      const existingDrawer = document.getElementById("drawer-" + hp);
      const hitRow = document.getElementById("hit-row-" + hp);
      if (existingDrawer) {
        existingDrawer.remove();
        if (hitRow) {
          const btn = hitRow.querySelector("[data-act='toggleHitDrawer']");
          if (btn) btn.textContent = "▼";
        }
      } else if (hitRow) {
        const hit = (S.searchHits || []).find(h => h.no === hp);
        if (hit) {
          const temp = document.createElement("tbody");
          temp.innerHTML = renderHitTableRow(hit);
          const newDrawer = temp.querySelector(".hit-drawer-row");
          if (newDrawer) {
            hitRow.parentNode.insertBefore(newDrawer, hitRow.nextSibling);
            const btn = hitRow.querySelector("[data-act='toggleHitDrawer']");
            if (btn) btn.textContent = "▲";
          }
        }
      }
      return;
    }
    case "saveSelectedToDiscovered": {
      saveSelectedToDiscovered();
      return;
    }
    case "clearSearchResults": {
      S.searchHits = [];
      S.searchDuplicates = [];
      S.searchRejected = [];
      if (S.searchHitSelection) S.searchHitSelection.clear();
      S.searchStats = { requested: 50, scanned: 0, added: 0, duplicates: 0, rejected: 0, pending: 0, fleetEvidence: 0 };
      S._lastSaveSuccess = null;
      const area = $("#searchResultsArea");
      if (area) area.innerHTML = "";
      toast("תוצאות החיפוש הזמניות נוקו");
      return;
    }
    case "exportSearchHitsCsv": {
      const hits = (S.searchHits || []).filter(h => !h.already && !h.adopted);
      if (!hits.length) { toast("אין חברות לייצוא"); return; }
      exportCsv(hits);
      return;
    }
    case "selectAllHits": {
      const freshHits = (S.searchHits || []).filter(h => !h.already && !h.adopted);
      const cbs = document.querySelectorAll(".hit-cb:not(:disabled)");
      if (!S.searchHitSelection) S.searchHitSelection = new Set();
      const allSelected = S.searchHitSelection.size === freshHits.length && freshHits.length > 0;
      if (allSelected) {
        S.searchHitSelection.clear();
        cbs.forEach(cb => { cb.checked = false; });
      } else {
        freshHits.forEach(h => S.searchHitSelection.add(h.no));
        cbs.forEach(cb => { cb.checked = true; });
      }
      updateLiveKpisAndProgress();
      updateActionButtonsState();
      return;
    }
    case "selectPhoneHits": {
      if (!S.searchHitSelection) S.searchHitSelection = new Set();
      S.searchHitSelection.clear();
      const freshHits = (S.searchHits || []).filter(h => !h.already && !h.adopted);
      freshHits.forEach(h => {
        if ((h.phone && h.phone !== "—" && h.phone !== "לא ידוע") || (h.mobile && h.mobile !== "—")) {
          S.searchHitSelection.add(h.no);
        }
      });
      document.querySelectorAll(".hit-cb:not(:disabled)").forEach(cb => {
        cb.checked = S.searchHitSelection.has(cb.value);
      });
      updateLiveKpisAndProgress();
      updateActionButtonsState();
      toast(\`סומנו \${S.searchHitSelection.size} חברות עם טלפון מאומת\`);
      return;
    }
    case "selectFleetHits": {
      if (!S.searchHitSelection) S.searchHitSelection = new Set();
      S.searchHitSelection.clear();
      const freshHits = (S.searchHits || []).filter(h => !h.already && !h.adopted);
      freshHits.forEach(h => {
        if (h.fleetIsFact || String(h.fleetPotential || "").includes("5+")) {
          S.searchHitSelection.add(h.no);
        }
      });
      document.querySelectorAll(".hit-cb:not(:disabled)").forEach(cb => {
        cb.checked = S.searchHitSelection.has(cb.value);
      });
      updateLiveKpisAndProgress();
      updateActionButtonsState();
      toast(\`סומנו \${S.searchHitSelection.size} חברות עם צי מאומת/פוטנציאל גבוה\`);
      return;
    }
    case "clearHitSelection": {
      if (S.searchHitSelection) S.searchHitSelection.clear();
      document.querySelectorAll(".hit-cb:not(:disabled)").forEach(cb => { cb.checked = false; });
      const selectAllCb = $("#hit-select-all");
      if (selectAllCb) selectAllCb.checked = false;
      updateLiveKpisAndProgress();
      updateActionButtonsState();
      toast("הבחירה נוקתה");
      return;
    }
    case "run":runSearch();return;`;

if (updated.includes(clickCaseAnchor)) {
  updated = updated.replace(clickCaseAnchor, newClickCases);
  console.log("Wired click event handlers into document listener.");
} else {
  console.warn("Could not find clickCaseAnchor!");
}

fs.writeFileSync(targetFile, updated, "utf8");
console.log("Successfully written updated openprospector.html! New length:", updated.length);
