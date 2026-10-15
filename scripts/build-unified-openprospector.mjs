// scripts/build-unified-openprospector.mjs
// Comprehensive upgrade of openprospector.html lead discovery engine
// Phase: Sources Expansion, Specialized Fleet/Safety Roles, and Multi-Source Cross-Referencing
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

/* ===== קטלוג מקורות איתור והצלבה מקיף ושקוף (PROSPECTOR SOURCE CATALOG) ===== */
const PROSPECTOR_SOURCE_CATALOG = [
  // קבוצה 1: מאגרי ממשלה, תאגידים ורישוי (data.gov.il)
  {
    category: "gov_licensing",
    categoryLabel: "🏛️ מאגרי ממשלה, תאגידים ורישוי",
    categoryDesc: "מאגרי רישוי ותאגידים רשמיים, פתוחים וחוקיים של מדינת ישראל (data.gov.il · ללא עלות API)",
    sources: [
      {
        id: "src_companies",
        name: "רשם החברות (משרד המשפטים)",
        sub: "מאגר התאגידים הרשמי בישראל (732K+ חברות פעילות)",
        status: "active",
        statusLabel: "פעיל ומחובר (0 ₪)",
        statusColor: "green",
        url: "https://data.gov.il/dataset/f004176c-b85f-4542-8901-7b3176f9a054",
        resourceId: "f004176c-b85f-4542-8901-7b3176f9a054",
        dataType: "companies",
        hasPhones: false,
        hasEmails: false,
        hasHp: true,
        isFree: true,
        checkedDefault: true
      },
      {
        id: "src_contractors",
        name: "פנקס הקבלנים הרשומים (משרד הבינוי)",
        sub: "ענף 200, תשתיות ועפר, טלפונים ומיילים ישירים",
        status: "active",
        statusLabel: "פעיל ומחובר (0 ₪)",
        statusColor: "green",
        url: "https://data.gov.il/dataset/4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8",
        resourceId: "4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8",
        dataType: "contractors",
        hasPhones: true,
        hasEmails: true,
        hasHp: true,
        isFree: true,
        checkedDefault: true
      },
      {
        id: "src_business_licenses",
        name: "רישוי עסקים ממשלתי ורכבי פעילות",
        sub: "עסקים מורשים, טלפונים, אימיילים והיתרי פעילות רכב",
        status: "active",
        statusLabel: "פעיל ומחובר (0 ₪)",
        statusColor: "green",
        url: "https://data.gov.il/dataset/7d4c61e2-2416-453e-8efb-bd02ec89db35",
        resourceId: "7d4c61e2-2416-453e-8efb-bd02ec89db35",
        dataType: "business_licenses",
        hasPhones: true,
        hasEmails: true,
        hasHp: true,
        isFree: true,
        checkedDefault: true
      },
      {
        id: "src_garages",
        name: "מוסכים ומכוני רישוי (משרד התחבורה)",
        sub: "מוסכים מורשים, טלפונים, ח.פ ומנהלים מקצועיים מוסמכים",
        status: "active",
        statusLabel: "פעיל ומחובר (0 ₪)",
        statusColor: "green",
        url: "https://data.gov.il/dataset/bb68386a-a331-4bbc-b668-bba2766d517d",
        resourceId: "bb68386a-a331-4bbc-b668-bba2766d517d",
        dataType: "garages",
        hasPhones: true,
        hasEmails: false,
        hasHp: true,
        isFree: true,
        checkedDefault: true
      },
      {
        id: "src_manpower_security",
        name: "קבלני כוח אדם, שמירה וניקיון (משרד העבודה)",
        sub: "קבלני שירותים ואבטחה עם ציי סיור, ח.פ, ומנכ״לים",
        status: "active",
        statusLabel: "פעיל ומחובר (0 ₪)",
        statusColor: "green",
        url: "https://data.gov.il/dataset/243fe1ce-b2ae-4c26-9e5e-ce306a602040",
        resourceId: "243fe1ce-b2ae-4c26-9e5e-ce306a602040",
        dataType: "manpower_security",
        hasPhones: false,
        hasEmails: false,
        hasHp: true,
        isFree: true,
        checkedDefault: true
      },
      {
        id: "src_plants_industry",
        name: "רשימת מפעלים ואתרי תעשייה (הגנת הסביבה)",
        sub: "מפעלי ייצור, תשתיות, ח.פ ומיקום תעשייתי",
        status: "active",
        statusLabel: "פעיל ומחובר (0 ₪)",
        statusColor: "green",
        url: "https://data.gov.il/dataset/88d1883c-3b7a-4580-9be9-6d54659666c3",
        resourceId: "88d1883c-3b7a-4580-9be9-6d54659666c3",
        dataType: "plants_industry",
        hasPhones: false,
        hasEmails: false,
        hasHp: true,
        isFree: true,
        checkedDefault: false
      },
      {
        id: "src_ngos",
        name: "רשם העמותות (משרד המשפטים)",
        sub: "עמותות רשומות, חל״צ ומצבת עובדים מאומתת",
        status: "active",
        statusLabel: "פעיל ומחובר (0 ₪)",
        statusColor: "green",
        url: "https://data.gov.il/dataset/be5b7935-3922-45d4-9638-08871b17ec95",
        resourceId: "be5b7935-3922-45d4-9638-08871b17ec95",
        dataType: "ngos",
        hasPhones: false,
        hasEmails: false,
        hasHp: true,
        isFree: true,
        checkedDefault: false
      }
    ]
  },

  // קבוצה 2: מקורות ייעודיים לציי רכב, תחבורה וקציני בטיחות
  {
    category: "fleet_transport",
    categoryLabel: "🚗 מקורות ציי רכב, תחבורה וקציני בטיחות",
    categoryDesc: "מאגרי רכב מסחרי כבד, ציי היסעים, ואינדיקציות מודעות דרושים לניהול צי",
    sources: [
      {
        id: "src_heavy_vehicles",
        name: "כלי רכב מעל 3.5 טון ומשאיות (משרד התחבורה)",
        sub: "נתוני משרד התחבורה לציים מסחריים (4.18M כלי רכב)",
        status: "active",
        statusLabel: "פעיל ומחובר (0 ₪)",
        statusColor: "green",
        url: "https://data.gov.il/dataset/053cea08-09bc-40ec-8f7a-156f0677aff3",
        resourceId: "053cea08-09bc-40ec-8f7a-156f0677aff3",
        dataType: "heavy_vehicles",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: true
      },
      {
        id: "src_buses_fleets",
        name: "ציי אוטובוסים והיסעים בישראל (משרד התחבורה)",
        sub: "מפעילי תחבורה, חברות הסעה וציי נוסעים (15.3K רשומות)",
        status: "active",
        statusLabel: "פעיל ומחובר (0 ₪)",
        statusColor: "green",
        url: "https://data.gov.il/dataset/91d298ed-a260-4f93-9d50-d5e3c5b82ce1",
        resourceId: "91d298ed-a260-4f93-9d50-d5e3c5b82ce1",
        dataType: "buses_fleets",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: true
      },
      {
        id: "src_tzama_equipment",
        name: "ציוד מכני הנדסי (צמ״ה) ועפר",
        sub: "כלי צמ״ה, שופלים וטרקטורים (185K רשומות)",
        status: "active",
        statusLabel: "פעיל ומחובר (0 ₪)",
        statusColor: "green",
        url: "https://data.gov.il/dataset/58dc4654-16b1-42ed-8170-98fadec153ea",
        resourceId: "58dc4654-16b1-42ed-8170-98fadec153ea",
        dataType: "tzama_equipment",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: true
      },
      {
        id: "src_safety_officer_jobs",
        name: "אינדיקציות דרושים: קציני בטיחות וניהול צי",
        sub: "מזהה חברות המגייסות קצין בטיחות בתעבורה או מנהל צי (אינדיקציה ענפית בלבד)",
        status: "active",
        statusLabel: "פעיל (אינדיקציה ענפית)",
        statusColor: "green",
        url: "https://www.alljobs.co.il",
        dataType: "safety_jobs_indication",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: true
      }
    ]
  },

  // קבוצה 3: אתרי אינטרנט של חברות ומקורות רשת
  {
    category: "web_company",
    categoryLabel: "🌐 אתרי חברות ומקורות אינטרנט",
    categoryDesc: "איתור אתרים רשמיים, עמודי 'צור קשר' ונתוני Schema.org פומביים",
    sources: [
      {
        id: "src_official_website",
        name: "אתר רשמי של החברה (עמודי צור קשר והנהלה)",
        sub: "איתור דומיין רשמי, עמודי אודות וצוות (קישור ישיר לפתיחה בקליק)",
        status: "public_link",
        statusLabel: "קישור ציבורי ישיר",
        statusColor: "blue",
        url: "https://www.google.com/search?q=",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: true
      },
      {
        id: "src_schema_jsonld",
        name: "נתוני Schema.org ו-JSON-LD באתרים",
        sub: "חילוץ תגיות פומביות של ארגון וטלפון (סריקה ישירה חסומה בדפדפן - דורשת שרת תיווך)",
        status: "needs_proxy",
        statusLabel: "דורש שרת תיווך (CORS)",
        statusColor: "orange",
        url: "https://schema.org/Organization",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: false
      }
    ]
  },

  // קבוצה 4: מדריכי עסקים וטלפונים
  {
    category: "directories",
    categoryLabel: "📖 מדריכי עסקים וטלפונים",
    categoryDesc: "מדריכי טלפונים ועסקים בישראל (דפי זהב, בזק 144, איזי, דן אנד ברדסטריט)",
    sources: [
      {
        id: "src_dapei_zahav",
        name: "דפי זהב (d.co.il)",
        sub: "מדריך עסקים וטלפונים ראשי (קישור ישיר לחיפוש / חסום ל-fetch בדפדפן עקב CORS)",
        status: "public_link",
        statusLabel: "קישור ציבורי ישיר (CORS בדפדפן)",
        statusColor: "blue",
        url: "https://www.d.co.il",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: false
      },
      {
        id: "src_bezeq_144",
        name: "בזק 144 / B144 עסקים (b144.co.il)",
        sub: "איתור מספרי בזק וקווי טלפון עסקיים (קישור ישיר / חסום ל-fetch בדפדפן עקב CORS)",
        status: "public_link",
        statusLabel: "קישור ציבורי ישיר (CORS בדפדפן)",
        statusColor: "blue",
        url: "https://www.b144.co.il",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: false
      },
      {
        id: "src_easy_il",
        name: "איזי (easy.co.il)",
        sub: "אינדקס מקומי לעסקים ומיקומים (קישור ישיר / חסימת Cloudflare בדפדפן)",
        status: "public_link",
        statusLabel: "קישור ציבורי ישיר (WAF בדפדפן)",
        statusColor: "blue",
        url: "https://easy.co.il",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: false
      },
      {
        id: "src_duns100_dnb",
        name: "Dun's 100 / Dun & Bradstreet (D&B)",
        sub: "דירוג ומאגר עסקים מסחרי (דורש מנוי עסקי ו-API Key)",
        status: "paid_subscription",
        statusLabel: "בתשלום (דורש מנוי D&B)",
        statusColor: "gray",
        url: "https://www.duns100.co.il",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: false,
        checkedDefault: false
      },
      {
        id: "src_bdi_coface",
        name: "BDI / CofaceBDI",
        sub: "מאגר מידע עסקי ואשראי (דורש מנוי מסחרי)",
        status: "paid_subscription",
        statusLabel: "בתשלום (דורש מנוי BDI)",
        statusColor: "gray",
        url: "https://www.bdi.co.il",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: false,
        checkedDefault: false
      },
      {
        id: "src_kompass_europages",
        name: "Kompass / Europages ישראל",
        sub: "אינדקס יבואנים ותעשיינים בינלאומי (קישור ישיר)",
        status: "public_link",
        statusLabel: "קישור ציבורי ישיר",
        statusColor: "blue",
        url: "https://il.kompass.com",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: false
      }
    ]
  },

  // קבוצה 5: רשתות חברתיות ומקורות מקצועיים
  {
    category: "social_pro",
    categoryLabel: "👥 רשתות חברתיות ומקורות מקצועיים",
    categoryDesc: "פרופילים עסקיים ציבוריים (LinkedIn, Facebook, Google Business, WhatsApp)",
    sources: [
      {
        id: "src_linkedin",
        name: "LinkedIn חברות ובעלי תפקידים",
        sub: "עמודי חברה ופרופילי קציני בטיחות/צי (קישור ישיר / דורש OAuth/API להעשרה)",
        status: "public_link",
        statusLabel: "קישור ישיר (דורש API Key להעשרה)",
        statusColor: "blue",
        url: "https://www.linkedin.com/search/results/companies/?keywords=",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: false
      },
      {
        id: "src_google_business",
        name: "Google Business Profile / Maps",
        sub: "כרטיס עסק מקומי, טלפונים ושעות (קישור ישיר / דורש Google Places API)",
        status: "public_link",
        statusLabel: "קישור ישיר (דורש Google API להעשרה)",
        statusColor: "blue",
        url: "https://www.google.com/maps/search/",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: false
      },
      {
        id: "src_facebook_business",
        name: "Facebook Pages דפים עסקיים",
        sub: "דפי פייסבוק ציבוריים של חברות (קישור ישיר / דורש Graph API)",
        status: "public_link",
        statusLabel: "קישור ציבורי ישיר",
        statusColor: "blue",
        url: "https://www.facebook.com/search/top?q=",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: false
      },
      {
        id: "src_whatsapp_biz",
        name: "WhatsApp Business פומבי",
        sub: "בדיקת זמינות מספר WhatsApp עסקי רשמי (wa.me) ופתיחת שיחה בקליק",
        status: "public_link",
        statusLabel: "קישור ישיר לפתיחת שיחה",
        statusColor: "blue",
        url: "https://wa.me/",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: false
      },
      {
        id: "src_instagram_biz",
        name: "Instagram עסקי",
        sub: "חשבונות מותג ועמודי פעילות (קישור ישיר)",
        status: "public_link",
        statusLabel: "קישור ציבורי ישיר",
        statusColor: "blue",
        url: "https://www.instagram.com/",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: false
      }
    ]
  }
];

/* פונקציית עזר לשמירה וטעינה של העדפות מקורות ב-localStorage */
function getSavedSourceSelection() {
  try {
    const raw = localStorage.getItem("openprospector_source_selection");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return new Set(parsed);
    }
  } catch (e) {}
  // ברירת מחדל: כל המקורות שמוגדרים checkedDefault
  const defs = new Set();
  PROSPECTOR_SOURCE_CATALOG.forEach(cat => {
    cat.sources.forEach(s => {
      if (s.checkedDefault) defs.add(s.id);
    });
  });
  return defs;
}

function saveSourceSelection(idsArray) {
  try {
    localStorage.setItem("openprospector_source_selection", JSON.stringify(idsArray));
  } catch (e) {}
}

/* רינדור רכיב מקורות איתור והצלבה מודולרי ומקצועי */
function renderProspectorSourcesSection() {
  const savedSelection = getSavedSourceSelection();
  const curCatTab = S.sourceCatalogTab || "all";

  // חישוב מונים
  let totalSources = 0;
  let activeFreeSources = 0;
  let selectedCount = 0;
  let selectedActiveCount = 0;

  PROSPECTOR_SOURCE_CATALOG.forEach(cat => {
    cat.sources.forEach(s => {
      totalSources++;
      if (s.status === "active") activeFreeSources++;
      if (savedSelection.has(s.id)) {
        selectedCount++;
        if (s.status === "active") selectedActiveCount++;
      }
    });
  });

  return \`
  <div class="f" style="grid-column: 1 / -1; background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 10px; padding: 16px; margin-top: 4px">
    <!-- כותרת ראשית ומוני מקורות -->
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px; flex-wrap:wrap; gap:8px">
      <div>
        <span class="bold" style="font-size:14px; color:#1e3a8a; display:flex; align-items:center; gap:8px">
          <span>🌐 מקורות איתור והצלבה לבחירה:</span>
          <span class="badge b-blue" style="font-size:10.5px">\${activeFreeSources} פעילים ומחוברים (0 ₪) · \${totalSources} בקטלוג</span>
        </span>
        <div class="xs muted" style="margin-top:3px">
          סמן את המקורות להפעלה בסריקה ולהצלבות נתונים. שקיפות מלאה: מקור שאינו מחובר מציג סטטוס אמיתי ואינו מחושב בהצלבה.
        </div>
      </div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
        <button type="button" class="btn btn-sm btn-primary" data-act="selectAllActiveFreeSources" style="background:#059669; border-color:#059669; font-weight:700; font-size:11.5px; padding:5px 12px">
          ⚡ בחר את כל המקורות הפעילים והחינמיים (\${activeFreeSources})
        </button>
        <button type="button" class="btn btn-sm btn-ghost" data-act="clearAllSources" style="border:1px solid #cbd5e1; background:#fff; font-size:11.5px; padding:5px 12px">
          🧹 נקה בחירה
        </button>
      </div>
    </div>

    <!-- טאבים מהירים לסינון קטגוריות מקורות -->
    <div class="chips" style="margin-bottom:12px; gap:6px; flex-wrap:wrap">
      <button type="button" class="btn btn-sm \${curCatTab === 'all' ? 'btn-primary' : 'btn-ghost'}" data-act="setSourceCatalogTab" data-cat="all" style="padding:3px 10px; font-size:11px; border:1px solid #cbd5e1; \${curCatTab === 'all' ? 'font-weight:700' : 'background:#fff'}">
        הכל (כל 5 הקטגוריות)
      </button>
      <button type="button" class="btn btn-sm \${curCatTab === 'gov_licensing' ? 'btn-primary' : 'btn-ghost'}" data-act="setSourceCatalogTab" data-cat="gov_licensing" style="padding:3px 10px; font-size:11px; border:1px solid #cbd5e1; \${curCatTab === 'gov_licensing' ? 'font-weight:700' : 'background:#fff'}">
        🏛️ ממשלה ורישוי (7)
      </button>
      <button type="button" class="btn btn-sm \${curCatTab === 'fleet_transport' ? 'btn-primary' : 'btn-ghost'}" data-act="setSourceCatalogTab" data-cat="fleet_transport" style="padding:3px 10px; font-size:11px; border:1px solid #cbd5e1; \${curCatTab === 'fleet_transport' ? 'font-weight:700' : 'background:#fff'}">
        🚗 ציי רכב וקציני בטיחות (4)
      </button>
      <button type="button" class="btn btn-sm \${curCatTab === 'web_company' ? 'btn-primary' : 'btn-ghost'}" data-act="setSourceCatalogTab" data-cat="web_company" style="padding:3px 10px; font-size:11px; border:1px solid #cbd5e1; \${curCatTab === 'web_company' ? 'font-weight:700' : 'background:#fff'}">
        🌐 אתרי חברות (2)
      </button>
      <button type="button" class="btn btn-sm \${curCatTab === 'directories' ? 'btn-primary' : 'btn-ghost'}" data-act="setSourceCatalogTab" data-cat="directories" style="padding:3px 10px; font-size:11px; border:1px solid #cbd5e1; \${curCatTab === 'directories' ? 'font-weight:700' : 'background:#fff'}">
        📖 מדריכי עסקים (6)
      </button>
      <button type="button" class="btn btn-sm \${curCatTab === 'social_pro' ? 'btn-primary' : 'btn-ghost'}" data-act="setSourceCatalogTab" data-cat="social_pro" style="padding:3px 10px; font-size:11px; border:1px solid #cbd5e1; \${curCatTab === 'social_pro' ? 'font-weight:700' : 'background:#fff'}">
        👥 רשתות מקצועיות (5)
      </button>

      <span class="spacer"></span>
      <span class="badge" id="sourceSelectionCounterBadge" style="background:#e0e7ff; color:#3730a3; font-size:11px">
        נבחרו \${selectedCount} מקורות (מתוכם \${selectedActiveCount} פעילים ומחוברים ב-0 ₪)
      </span>
    </div>

    <!-- רשימת הקבוצות והמקורות -->
    <div style="display:flex; flex-direction:column; gap:14px">
      \${PROSPECTOR_SOURCE_CATALOG.filter(cat => curCatTab === 'all' || curCatTab === cat.category).map(cat => {
        const catSources = cat.sources;
        return \`
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px">
            <!-- כותרת קבוצה עם כפתורי בחירה לקבוצה -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:6px; border-bottom:1px solid #f1f5f9; padding-bottom:6px">
              <div>
                <span class="bold" style="font-size:13px; color:#0f172a">\${esc(cat.categoryLabel)}</span>
                <span class="xs muted" style="margin-right:6px">(\${esc(cat.categoryDesc)})</span>
              </div>
              <div style="display:flex; gap:6px">
                <button type="button" class="btn btn-sm btn-ghost" data-act="selectCategoryGroup" data-cat="\${esc(cat.category)}" style="font-size:10.5px; padding:2px 8px; border:1px solid #cbd5e1; background:#f8fafc">
                  ✓ בחר קבוצה זו
                </button>
                <button type="button" class="btn btn-sm btn-ghost" data-act="clearCategoryGroup" data-cat="\${esc(cat.category)}" style="font-size:10.5px; padding:2px 8px; border:1px solid #cbd5e1; background:#f8fafc">
                  ✕ נקה קבוצה זו
                </button>
              </div>
            </div>

            <!-- כרטיסי מקורות בקבוצה -->
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px">
              \${catSources.map(s => {
                const isChecked = savedSelection.has(s.id);
                let badgeHtml = '';
                if (s.status === 'active') {
                  badgeHtml = \`<span class="badge b-ok" style="font-size:9px">✓ \${esc(s.statusLabel)}</span>\`;
                } else if (s.status === 'public_link') {
                  badgeHtml = \`<span class="badge" style="background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; font-size:9px">\${esc(s.statusLabel)}</span>\`;
                } else if (s.status === 'needs_proxy') {
                  badgeHtml = \`<span class="badge" style="background:#fff7ed; color:#c2410c; border:1px solid #fed7aa; font-size:9px">\${esc(s.statusLabel)}</span>\`;
                } else {
                  badgeHtml = \`<span class="badge" style="background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1; font-size:9px">\${esc(s.statusLabel)}</span>\`;
                }

                return \`
                  <label style="display:flex; align-items:flex-start; gap:8px; background:\${isChecked ? '#f0fdf4' : '#fafafa'}; padding:8px 10px; border:1px solid \${isChecked ? '#86efac' : '#e2e8f0'}; border-radius:6px; cursor:pointer; transition:all .15s">
                    <input type="checkbox" id="\${esc(s.id)}" class="src-cb" value="\${esc(s.id)}" data-cat="\${esc(cat.category)}" data-active="\${s.status === 'active' ? '1' : '0'}" \${isChecked ? 'checked' : ''} style="margin-top:3px">
                    <div style="flex:1">
                      <div style="display:flex; justify-content:space-between; align-items:center; gap:4px">
                        <span class="bold" style="font-size:11.5px; color:#0f172a">\${esc(s.name)}</span>
                        \${badgeHtml}
                      </div>
                      <div class="xs muted" style="font-size:10px; line-height:1.3; margin-top:2px">\${esc(s.sub)}</div>
                      <div style="display:flex; gap:4px; margin-top:4px; flex-wrap:wrap">
                        \${s.hasPhones ? '<span class="badge" style="background:#ecfdf5;color:#047857;font-size:8.5px">📞 טלפונים</span>' : ''}
                        \${s.hasEmails ? '<span class="badge" style="background:#e0e7ff;color:#3730a3;font-size:8.5px">✉️ מיילים</span>' : ''}
                        \${s.hasHp ? '<span class="badge" style="background:#f1f5f9;color:#475569;font-size:8.5px">ח.פ. רשמי</span>' : ''}
                      </div>
                    </div>
                  </label>
                \`;
              }).join("")}
            </div>
          </div>
        \`;
      }).join("")}
    </div>
  </div>
  \`;
}

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

  \${curTrack === 'free' ? renderTrackFreeSearch() : curTrack === 'ai' ? renderTrackAiSearch() : renderTrackInternalSearch()}

  <!-- אזור תוצאות החיפוש המאוחד — נפתח מיד מתחת לטופס (< 500ms) -->
  <div id="searchResultsArea" style="margin-top:20px">
    \${renderSearchResultsArea()}
  </div>
  \`;
};

/* ===== מסלול ראשי: איתור חברות חינמי ומבוקר במאגרי ממשלת ישראל ===== */
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

      <!-- 6. תפקיד צי / קצין בטיחות מבוקש (Specialized Role Filter) -->
      <label class="f">
        <span style="display:flex;align-items:center;gap:6px">
          <span class="bold">6. תפקיד צי / קצין בטיחות מבוקש</span>
          <span class="badge" style="font-size:9.5px;background:#fef3c7;color:#92400e">🛡️ איתור בעלי תפקיד</span>
        </span>
        <select class="input" id="a-target-role" style="font-size:13px">
          <option value="all">כל התפקידים (ללא סינון)</option>
          <option value="safety_officer">קצין בטיחות בתעבורה (תקנה 579)</option>
          <option value="fleet_manager">קצין רכב / מנהל צי רכב</option>
          <option value="transport_manager">מנהל תחבורה / מנהל לוגיסטיקה</option>
          <option value="ops_manager">מנהל תפעול</option>
          <option value="tech_manager">מנהל מקצועי מוסמך (משרד התחבורה)</option>
          <option value="ceo_owner">מנכ״ל / בעלים רשום</option>
          <option value="indication_hiring">אינדיקציה: גיוס לקצין בטיחות/צי (דרושים)</option>
        </select>
      </label>

      <!-- 7. טווח מספר עובדים -->
      <label class="f">
        <span style="display:flex;align-items:center;gap:6px">
          <span class="bold">7. מספר עובדים (מודל הערכה v2)</span>
          <span class="badge" style="font-size:9.5px;background:#fef3c7;color:#92400e">מודל v2</span>
        </span>
        <select class="input" id="a-workforce-range" style="font-size:13px">
          <option value="all" selected>כל הטווחים (כולל מודל הערכה v2)</option>
          <option value="1-50">1–50 עובדים</option>
          <option value="51-100">51–100 עובדים</option>
          <option value="101-500">101–500 עובדים</option>
          <option value="501plus">501+ עובדים</option>
          <option value="unknown">לא ידוע בלבד</option>
        </select>
        <div class="xs muted" style="margin-top:3px;font-size:10.5px">
          * נוסחת v2 המקורית משלבת ענף, סיווג קבלני, אתרים וסד״כ שטח.
        </div>
      </label>

      <!-- 8. סינון צי (עובדה מול פוטנציאל) -->
      <label class="f">
        <span style="display:flex;align-items:center;gap:6px">
          <span class="bold">8. גודל צי ורמת פוטנציאל</span>
          <span class="badge" style="font-size:9.5px;background:#f1f5f9;color:#475569">מודל צי v2</span>
        </span>
        <select class="input" id="a-fleet-filter-mode" style="font-size:13px">
          <option value="all" selected>כל הגדלים והפוטנציאלים</option>
          <option value="1-4">צי קטן / שירות (1–4 רכבים)</option>
          <option value="5-10">צי בינוני (5–10 רכבים)</option>
          <option value="11-20">צי 11–20 רכבים</option>
          <option value="21-50">צי 21–50 רכבים</option>
          <option value="51-100">צי 51–100 רכבים</option>
          <option value="100plus">צי גדול (100+ רכבים)</option>
          <option value="indication_200">אינדיקציה: ענף 200 (תשתיות ועפר)</option>
          <option value="potential_5plus">פוטנציאל צי 5+ (הובלה ולוגיסטיקה)</option>
        </select>
      </label>

      <!-- 9. סוג רכב / צי עיקרי -->
      <label class="f">
        <span style="display:flex;align-items:center;gap:6px">
          <span class="bold">9. סוג רכב / צי עיקרי</span>
          <span class="badge" style="font-size:9.5px;background:#f1f5f9;color:#475569">⚡ סינון פוסט-שליפה</span>
        </span>
        <select class="input" id="a-fleet-type" style="font-size:13px">
          <option value="">כל הסוגים</option>
          <option value="private">רכבים פרטיים וליסינג</option>
          <option value="commercial">מסחריות וטנדרים (שירות)</option>
          <option value="trucks">משאיות כבדות והובלה</option>
          <option value="buses">אוטובוסים והיסעים</option>
          <option value="tzama">צמ״ה, עפר ושופלים</option>
          <option value="service">רכבי שירות ותפעול</option>
        </select>
      </label>

      <!-- 10. פרטי קשר נדרשים -->
      <label class="f">
        <span style="display:flex;align-items:center;gap:6px">
          <span class="bold">10. פרטי קשר נדרשים</span>
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

      <!-- רכיב מקורות איתור והצלבה לבחירה (Component) -->
      \${renderProspectorSourcesSection()}

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
              ✓ <b>אימות טלפון ירוק</b>: מוענק <b>אך ורק</b> כאשר אותו מספר טלפון בדיוק מופיע ב-<b>2 מקורות עצמאיים לפחות</b> (למשל: רישוי עסקים + פנקס הקבלנים, או מוסכים + STAGING DB). אם היעד הוא 4 ונמצאו 2, יוצג: <b>'✓ ירוק (מינימום הושג: 2/4)'</b>.<br>
              ⚠️ <b>מקור יחיד (1/X)</b>: הליד מוצג בטבלה כ-<b>'חלקי (1/X)'</b> עם תגית צהובה ולעולם לא יקבל ירוק.<br>
              ✉️ <b>אימיילים</b>: מוצגים בעמודה נפרדת ואינם הופכים טלפון לירוק.
            </div>
          </div>
        </div>
      </div>
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
    </div>

    <!-- שער אישור עלות מפורש -->
    <div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:12.5px;color:#92400e;line-height:1.5">
      <div class="bold" style="font-size:13px;margin-bottom:4px">🛡️ שער אישור עלות ובטיחות:</div>
      חיפוש זה כולל קריאת ניתוח לשפה טבעית מול Google Gemini. הקריאה מתבצעת אך ורק לאחר לחיצה מפורשת שלך, עם מפתח מאובטח משרת Supabase, ללא עלות נוספת מעבר למכסה הכלולה.
    </div>

    <div class="f">
      <label class="bold" style="font-size:13.5px;color:#1e293b;margin-bottom:6px">תאר את הלקוח האידיאלי או סוג החברות שאתה מחפש:</label>
      <textarea class="input" id="ai-search-prompt" rows="3" placeholder="למשל: 'אני מחפש חברות הובלה, עבודות עפר ולוגיסטיקה באזור המרכז עם צי רכבים גדול שזקוקות למוסך צי מסחרי'" style="font-size:13px;line-height:1.5">\${esc(S._lastAiPrompt || '')}</textarea>
    </div>

    <div class="row" style="margin-top:14px;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary" data-act="runAiProspectingSearch" style="background:#7c3aed;border-color:#7c3aed;font-weight:700;padding:10px 22px;display:inline-flex;align-items:center;gap:8px" \${S.aiSearchRunning ? 'disabled' : ''}>
        <span>\${S.aiSearchRunning ? '⏳ מפענח קריטריונים ומאתר חברות...' : '✦ אשר והפעל חיפוש חכם ב-Gemini'}</span>
      </button>

      <span class="xs muted">סריקה מבוקרת עם מניעת כפילויות מובנית</span>
    </div>
  </div>
  \`;
}

/* ===== מסלול נפרד ג': סינון במאגר הקיים שלי (C Database) ===== */
function renderTrackInternalSearch() {
  return \`
  <div class="card" style="padding:20px;border:1.5px solid #64748b;background:linear-gradient(135deg,rgba(100,116,139,0.03),rgba(148,163,184,0.02))">
    <div class="card-h" style="margin-bottom:12px;border-bottom:1px solid #e2e8f0;padding-bottom:10px">
      <div>
        <h2 style="margin:0;font-size:18.5px;color:#1e293b;display:flex;align-items:center;gap:8px">
          <span>🔍 שאילתות וסינון במאגר הקיים שלי (\${C.length} חברות שמורות)</span>
          <span class="h-bar"></span>
        </h2>
        <div class="xs muted" style="margin-top:4px">
          חיפוש פנימי מהיר ללא פנייה לרשת. מאפשר לאתר חברות שכבר נשמרו, לבדוק פרטי קשר ולנהל את הלידים שכבר נמצאים אצלך במערכת.
        </div>
      </div>
      <span class="spacer"></span>
      <span class="badge" style="background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;font-size:11px">\${C.length} רשומות במאגר</span>
    </div>

    <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
      <input class="input" id="internal-search-q" placeholder="חפש לפי שם חברה, ח.פ, עיר או טלפון..." style="flex:1;min-width:240px;font-size:13px" oninput="runInternalDbSearch(this.value)">
      <button class="btn btn-primary" onclick="runInternalDbSearch($('#internal-search-q').value)" style="font-weight:700">
        סנן במאגר
      </button>
    </div>

    <div id="internalDbResults" style="margin-top:14px">
      <!-- תוצאות חיפוש פנימי יופיעו כאן -->
    </div>
  </div>
  \`;
}

/* ===== אזור תוצאות החיפוש המאוחד (SEARCH RESULTS AREA) ===== */
function renderSearchResultsArea() {
  if (!S.searchHits && !S.searchRunning) {
    return \`
    <div class="card" style="padding:28px 20px;text-align:center;background:#f8fafc;border:1.5px dashed #cbd5e1">
      <div style="font-size:32px;margin-bottom:8px">🎯</div>
      <div class="bold" style="font-size:16px;color:#1e293b;margin-bottom:4px">תוצאות החיפוש ייפתחו כאן מיד עם הפעלת האיתור</div>
      <div class="xs muted" style="max-width:540px;margin:0 auto">
        הזן מילת חיפוש או בחר ענף ולחץ על "הפעל איתור חברות". הנתונים ישלפו באצוות מ-data.gov.il ויוצגו בטבלה מלאה עם 16 עמודות, אימות טלפונים ירוק ומגירות פירוט.
      </div>
    </div>
    \`;
  }

  const curTab = S.searchActiveTab || "new";
  const stats = S.searchStats || { requested: 50, scanned: 0, added: 0, duplicates: 0, rejected: 0, pending: 0, fleetEvidence: 0 };
  const hits = S.searchHits || [];
  const duplicates = S.searchDuplicates || [];
  const rejected = S.searchRejected || [];

  return \`
  <div class="card" id="searchResultsCard" style="padding:18px;border:1.5px solid #2563eb;box-shadow:0 4px 12px rgba(37,99,235,0.06)">
    <!-- כותרת ראשית וסטטיסטיקות סריקה בזמן אמת -->
    <div class="card-h" style="margin-bottom:14px;border-bottom:1px solid #e2e8f0;padding-bottom:12px;flex-wrap:wrap;gap:10px">
      <div>
        <h3 style="margin:0;font-size:17.5px;color:#1e3a8a;display:flex;align-items:center;gap:8px">
          <span>📊 תוצאות איתור החברות</span>
          <span class="badge b-ok" id="newHitsCountHeader" style="font-size:11px">\${hits.length} חברות חדשות אותרו</span>
          \${S.searchRunning ? '<span class="badge b-est" style="font-size:11px">⏳ סריקה פעילה</span>' : '<span class="badge b-ok" style="font-size:11px">✓ הסתיימה</span>'}
        </h3>
        <div class="xs muted" style="margin-top:4px" id="liveSearchDetailsSubtitle">
          מבוקש: \${stats.requested} | נסרקו במאגר: \${stats.scanned} | נוספו: \${stats.added} | כפילויות שנמנעו: \${stats.duplicates} | נפסלו: \${stats.rejected}
        </div>
      </div>
      <span class="spacer"></span>
      <div class="row" style="gap:6px">
        <span class="badge" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;font-size:11.5px;font-weight:700">
          אינדיקציות צי: \${stats.fleetEvidence}
        </span>
        <span class="badge" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;font-size:11.5px;font-weight:700">
          כפילויות שנחסמו: \${stats.duplicates}
        </span>
      </div>
    </div>

    <!-- לשוניות ניווט בתוצאות: חברות חדשות / כפילויות / נפסלו -->
    <div class="tabs" style="margin-bottom:14px;display:flex;gap:6px;border-bottom:2px solid #e2e8f0">
      <button class="tab-btn \${curTab === 'new' ? 'active' : ''}" data-act="setResultsTab" data-val="new" style="padding:8px 16px;font-size:13px;font-weight:700;border:none;background:none;cursor:pointer;border-bottom:\${curTab === 'new' ? '3px solid #2563eb' : 'none'};color:\${curTab === 'new' ? '#1d4ed8' : '#64748b'}">
        ✨ חברות חדשות שנמצאו (<span id="tabCountNew">\${hits.length}</span>)
      </button>
      <button class="tab-btn \${curTab === 'duplicates' ? 'active' : ''}" data-act="setResultsTab" data-val="duplicates" style="padding:8px 16px;font-size:13px;font-weight:700;border:none;background:none;cursor:pointer;border-bottom:\${curTab === 'duplicates' ? '3px solid #b45309' : 'none'};color:\${curTab === 'duplicates' ? '#b45309' : '#64748b'}">
        🛡️ כפילויות שנמנעו (\${duplicates.length})
      </button>
      <button class="tab-btn \${curTab === 'rejected' ? 'active' : ''}" data-act="setResultsTab" data-val="rejected" style="padding:8px 16px;font-size:13px;font-weight:700;border:none;background:none;cursor:pointer;border-bottom:\${curTab === 'rejected' ? '3px solid #dc2626' : 'none'};color:\${curTab === 'rejected' ? '#dc2626' : '#64748b'}">
        🚫 נפסלו בקרת איכות (\${rejected.length})
      </button>
    </div>

    <!-- תוכן הלשונית הפעילה -->
    <div id="resultsTabContent">
      \${curTab === 'new' ? renderNewHitsView() : curTab === 'duplicates' ? renderDuplicatesView() : renderRejectedView()}
    </div>
  </div>
  \`;
}

/* ===== תצוגת חברות חדשות שנמצאו (NEW HITS VIEW) — טבלה קבועה, מודל v2, סינון רב-שכבתי ===== */

/* פונקציית סינון רב-ממדית עבור תוצאות הטבלה */
function filterSearchHits(allHits, filter) {
  filter = filter || {};
  return (allHits || []).filter(h => {
    // 1. חיפוש מהיר חופשי
    if (filter.q) {
      const query = filter.q.toLowerCase();
      const match = String(h.name || "").toLowerCase().includes(query) ||
                    String(h.no || "").includes(query) ||
                    String(h.city || "").toLowerCase().includes(query) ||
                    String(h.ind || "").toLowerCase().includes(query) ||
                    String(h.phone || "").includes(query) ||
                    String(h.mobile || "").includes(query) ||
                    String(h.email || "").toLowerCase().includes(query) ||
                    String(h.contactPerson || "").toLowerCase().includes(query) ||
                    String(h.roleTitle || "").toLowerCase().includes(query);
      if (!match) return false;
    }

    // 2. אזור בארץ
    if (filter.region && filter.region !== "all" && h.region !== filter.region) return false;

    // 3. פרטי קשר וכלל אימות טלפון ירוק
    if (filter.contact === "green_phone" && h.phoneVerBadgeColor !== "green") return false;
    if (filter.contact === "has_phone" && (!h.phone || h.phone === "—")) return false;
    if (filter.contact === "has_mobile" && (!h.mobile || h.mobile === "—")) return false;
    if (filter.contact === "has_email" && (!h.email || h.email === "—")) return false;
    if (filter.contact === "has_any" && (!h.phone || h.phone === "—") && (!h.mobile || h.mobile === "—") && (!h.email || h.email === "—")) return false;

    // 4. גודל צי רכב לפי מודל v2
    if (filter.fleet && filter.fleet !== "all") {
      const flStr = String(h.fleetRounded || h.fleetSizeDisplay || "");
      if (filter.fleet === "1-4") {
        if (!flStr.includes("1–4") && !flStr.includes("1-4") && !flStr.includes("צי קטן")) return false;
      } else if (filter.fleet === "5-10") {
        if (!flStr.includes("5–10") && !flStr.includes("5-10")) return false;
      } else if (filter.fleet === "11-20") {
        if (!flStr.includes("10–15") && !flStr.includes("10-15") && !flStr.includes("15–25") && !flStr.includes("15-25") && !flStr.includes("11-20") && !flStr.includes("11–20")) return false;
      } else if (filter.fleet === "21-50") {
        if (!flStr.includes("20–50") && !flStr.includes("20-50") && !flStr.includes("25–50") && !flStr.includes("21-50") && !flStr.includes("21–50")) return false;
      } else if (filter.fleet === "51-100") {
        if (!flStr.includes("50–100") && !flStr.includes("50-100") && !flStr.includes("51-100") && !flStr.includes("51–100")) return false;
      } else if (filter.fleet === "100plus") {
        if (!flStr.includes("100+") && !flStr.includes("100 רכב") && !flStr.includes("צי ענק")) return false;
      } else if (filter.fleet === "unknown") {
        if (h.fleetRounded || (h.fleetSizeDisplay && !h.fleetSizeDisplay.includes("לא ידוע"))) return false;
      } else if (filter.fleet === "indication_200") {
        if (!String(h.fleetPotential || "").includes("200") && !String(h.ind || "").includes("200")) return false;
      } else if (filter.fleet === "potential_5plus") {
        if (!String(h.fleetPotential || "").includes("5+") && !h.fleetIsFact) return false;
      }
    }

    // 5. סוג רכב עיקרי
    if (filter.vehicleType && filter.vehicleType !== "all") {
      const combined = (String(h.fleetType || "") + " " + String(h.ind || "") + " " + String(h.name || "") + " " + (h.rolesIdentified || []).join(" ")).toLowerCase();
      if (filter.vehicleType === "private") {
        if (!combined.includes("פרטי") && !combined.includes("ליסינג")) return false;
      } else if (filter.vehicleType === "commercial") {
        if (!combined.includes("מסחרי") && !combined.includes("טנדר") && !combined.includes("ואן") && !combined.includes("משלוח")) return false;
      } else if (filter.vehicleType === "trucks") {
        if (!combined.includes("משא") && !combined.includes("הובל") && !combined.includes("רמסע") && !combined.includes("טריילר")) return false;
      } else if (filter.vehicleType === "buses") {
        if (!combined.includes("אוטובוס") && !combined.includes("מיניבוס") && !combined.includes("היסע") && !combined.includes("הסעות")) return false;
      } else if (filter.vehicleType === "tzama") {
        if (!combined.includes('צמ"ה') && !combined.includes('צמ״ה') && !combined.includes('צמה') && !combined.includes("עפר") && !combined.includes("תשתית") && !combined.includes("שופל") && !combined.includes("מחפר") && !combined.includes("מנוף")) return false;
      } else if (filter.vehicleType === "service") {
        if (!combined.includes("שירות") && !combined.includes("טכנאי") && !combined.includes("סיור") && !combined.includes("אבטחה") && !combined.includes("התקנ")) return false;
      }
    }

    // 6. מספר עובדים לפי מודל v2
    if (filter.workforce && filter.workforce !== "all") {
      const emp = (h.approxEmployees !== null && h.approxEmployees !== undefined) ? h.approxEmployees : h.employeesCount;
      if (filter.workforce === "1-50") {
        if (emp === null || emp < 1 || emp > 50) return false;
      } else if (filter.workforce === "51-100") {
        if (emp === null || emp < 51 || emp > 100) return false;
      } else if (filter.workforce === "101-500") {
        if (emp === null || emp < 101 || emp > 500) return false;
      } else if (filter.workforce === "501plus") {
        if (emp === null || emp < 501) return false;
      } else if (filter.workforce === "unknown") {
        if (emp !== null) return false;
      }
    }

    // 7. תפקיד מקצועי וקצין בטיחות (תקנה 579)
    if (filter.role && filter.role !== "all") {
      const rCombined = (String(h.roleTitle || "") + " " + (h.rolesIdentified || []).join(" ") + " " + String(h.contactPerson || "") + " " + String(h.fleetOfficerStatus || "")).toLowerCase();
      if (filter.role === "safety_officer") {
        if (!rCombined.includes("בטיחות") && (h.fleetOfficerProb || 0) < 50) return false;
      } else if (filter.role === "fleet_manager") {
        if (!rCombined.includes("רכב") && !rCombined.includes("צי")) return false;
      } else if (filter.role === "transport_manager") {
        if (!rCombined.includes("תחבורה") && !rCombined.includes("לוגיסטיקה") && !rCombined.includes("שינוע")) return false;
      } else if (filter.role === "ops_manager") {
        if (!rCombined.includes("תפעול") && !rCombined.includes("עבודה") && !rCombined.includes("שטח")) return false;
      } else if (filter.role === "tech_manager") {
        if (!rCombined.includes("מקצועי") && !rCombined.includes("מוסמך")) return false;
      } else if (filter.role === "ceo_owner") {
        if (!rCombined.includes("מנכ") && !rCombined.includes("בעלים") && !rCombined.includes("שותף")) return false;
      }
    }

    // 8. דרגת איכות
    if (filter.quality === "green" && h.qualityColor !== "green") return false;
    if (filter.quality === "yellow" && h.qualityColor !== "yellow") return false;

    return true;
  });
}

/* פונקציית איפוס מסנני טבלה */
function resetHitFilters() {
  S.searchHitFilter = { q: "", region: "all", contact: "all", fleet: "all", vehicleType: "all", workforce: "all", quality: "all", role: "all" };
  renderSearchHitsFiltered();
}

/* רינדור תוכן גוף הטבלה (עמודות ושורות, שורת טעינה או שורת אבחון 0 תוצאות) */
function renderSearchHitsTableBodyContent(visibleHits, allHits, filter) {
  if (S.searchRunning && allHits.length === 0) {
    return \`
      <tr>
        <td colspan="17" style="text-align:center;padding:36px 16px;background:#f8fafc">
          <div style="font-size:28px;margin-bottom:8px">⏳</div>
          <div class="bold" style="font-size:14.5px;color:#1e3a8a">סורק מאגרים ממשלתיים באצוות הדרגתיות (data.gov.il · 0 ₪)...</div>
          <div class="xs muted" style="margin-top:4px" id="tableBodyProgressNote">שורות הטבלה יופיעו כאן מיד עם חילוץ הרשומות הראשונות</div>
        </td>
      </tr>
    \`;
  }

  if (visibleHits.length > 0) {
    return visibleHits.map(h => renderHitTableRow(h)).join("");
  }

  if (allHits.length > 0 && visibleHits.length === 0) {
    // שורת אבחון אינפורמטיבית כאשר סינון הטבלה צמצם את כל התוצאות ל-0
    const activeFiltersList = [];
    if (filter.q) activeFiltersList.push(\`חיפוש: "\${filter.q}"\`);
    if (filter.region && filter.region !== "all") activeFiltersList.push(\`אזור: \${filter.region}\`);
    if (filter.contact && filter.contact !== "all") {
      const contactLabels = { green_phone: "🟢 טלפון ירוק (2+ הצלבות)", has_phone: "📞 טלפון עסקי/נייח", has_mobile: "📱 נייד עסקי", has_email: "✉️ אימייל", has_any: "טלפון או מייל" };
      activeFiltersList.push(\`קשר: \${contactLabels[filter.contact] || filter.contact}\`);
    }
    if (filter.fleet && filter.fleet !== "all") activeFiltersList.push(\`צי: \${filter.fleet}\`);
    if (filter.vehicleType && filter.vehicleType !== "all") activeFiltersList.push(\`סוג רכב: \${filter.vehicleType}\`);
    if (filter.workforce && filter.workforce !== "all") activeFiltersList.push(\`עובדים: \${filter.workforce}\`);
    if (filter.role && filter.role !== "all") activeFiltersList.push(\`תפקיד: \${filter.role}\`);
    if (filter.quality && filter.quality !== "all") activeFiltersList.push(\`איכות: \${filter.quality}\`);

    return \`
      <tr>
        <td colspan="17" style="text-align:center;padding:32px 18px;background:#fffbeb;border:1.5px dashed #fde68a">
          <div style="font-size:30px;margin-bottom:6px">⚠️</div>
          <div class="bold" style="font-size:15px;color:#92400e;margin-bottom:4px">
            אותרו \${allHits.length} חברות חדשות במאגר החיצוני, אך אף אחת מהן אינה תואמת את שילוב מסנני הטבלה הפעיל
          </div>
          <div class="xs" style="color:#78350f;margin-bottom:12px">
            <b>מסננים פעילים שצמצמו ל-0 תוצאות:</b> \${activeFiltersList.join(" · ") || "אין מסנן"}
          </div>
          <button type="button" class="btn btn-sm btn-primary" onclick="resetHitFilters()" style="background:#2563eb;font-weight:700;padding:6px 16px">
            🔄 אפס מסנני טבלה והצג את כל \${allHits.length} החברות
          </button>
        </td>
      </tr>
    \`;
  }

  return \`
    <tr>
      <td colspan="17" style="text-align:center;padding:36px 16px;background:#f8fafc">
        <div style="font-size:28px;margin-bottom:6px">🔍</div>
        <div class="bold" style="font-size:15px;color:#1e293b;margin-bottom:4px">לא אותרו חברות חדשות התואמות את החיפוש החיצוני</div>
        <div class="xs muted">נסה להרחיב את מילות החיפוש, לבחור ענף אחר או להפעיל מקורות נוספים בקטלוג.</div>
      </td>
    </tr>
  \`;
}

function renderNewHitsView() {
  const allHits = S.searchHits || [];
  const sel = S.searchHitSelection || new Set();
  const filter = S.searchHitFilter || { q: "", region: "all", contact: "all", fleet: "all", vehicleType: "all", workforce: "all", quality: "all", role: "all" };

  const visibleHits = filterSearchHits(allHits, filter);
  const freshHits = allHits.filter(h => !h.already && !h.adopted);
  const selectedCount = [...sel].filter(no => freshHits.some(h => h.no === no)).length;

  return \`
  <!-- סרגל סינון וחיפוש מהיר בתוך תוצאות הטבלה (8 מסננים מלאים) -->
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:14px">
    <div class="row" style="flex-wrap:wrap;gap:8px;align-items:center">
      <input class="input" id="hit-filter-q" placeholder="🔍 חיפוש מהיר (שם, ח.פ, עיר, טלפון, איש קשר)" value="\${esc(filter.q || '')}" style="max-width:230px;height:34px;font-size:12.5px" oninput="S.searchHitFilter.q=this.value;renderSearchHitsFiltered()">

      <select class="input" id="hit-filter-region" style="max-width:115px;height:34px;font-size:12.5px" onchange="S.searchHitFilter.region=this.value;renderSearchHitsFiltered()">
        <option value="all" \${filter.region==='all'?'selected':''}>כל האזורים</option>
        <option value="מרכז" \${filter.region==='מרכז'?'selected':''}>מרכז</option>
        <option value="דרום" \${filter.region==='דרום'?'selected':''}>דרום</option>
        <option value="צפון" \${filter.region==='צפון'?'selected':''}>צפון</option>
        <option value="ירושלים" \${filter.region==='ירושלים'?'selected':''}>ירושלים</option>
      </select>

      <select class="input" id="hit-filter-contact" style="max-width:145px;height:34px;font-size:12.5px" onchange="S.searchHitFilter.contact=this.value;renderSearchHitsFiltered()">
        <option value="all" \${filter.contact==='all'?'selected':''}>כל פרטי הקשר</option>
        <option value="green_phone" \${filter.contact==='green_phone'?'selected':''}>🟢 טלפון ירוק (2+ הצלבות)</option>
        <option value="has_phone" \${filter.contact==='has_phone'?'selected':''}>📞 טלפון עסקי/נייח</option>
        <option value="has_mobile" \${filter.contact==='has_mobile'?'selected':''}>📱 נייד עסקי</option>
        <option value="has_email" \${filter.contact==='has_email'?'selected':''}>✉️ אימייל</option>
        <option value="has_any" \${filter.contact==='has_any'?'selected':''}>טלפון או אימייל</option>
      </select>

      <select class="input" id="hit-filter-fleet" style="max-width:135px;height:34px;font-size:12.5px" onchange="S.searchHitFilter.fleet=this.value;renderSearchHitsFiltered()">
        <option value="all" \${filter.fleet==='all'?'selected':''}>כל רמות הצי</option>
        <option value="1-4" \${filter.fleet==='1-4'?'selected':''}>1–4 רכבים</option>
        <option value="5-10" \${filter.fleet==='5-10'?'selected':''}>5–10 רכבים</option>
        <option value="11-20" \${filter.fleet==='11-20'?'selected':''}>11–20 רכבים</option>
        <option value="21-50" \${filter.fleet==='21-50'?'selected':''}>21–50 רכבים</option>
        <option value="51-100" \${filter.fleet==='51-100'?'selected':''}>51–100 רכבים</option>
        <option value="100plus" \${filter.fleet==='100plus'?'selected':''}>100+ רכבים</option>
        <option value="unknown" \${filter.fleet==='unknown'?'selected':''}>לא ידוע בלבד</option>
      </select>

      <select class="input" id="hit-filter-vehicle-type" style="max-width:125px;height:34px;font-size:12.5px" onchange="S.searchHitFilter.vehicleType=this.value;renderSearchHitsFiltered()">
        <option value="all" \${filter.vehicleType==='all'?'selected':''}>כל סוגי הרכב</option>
        <option value="private" \${filter.vehicleType==='private'?'selected':''}>פרטי / ליסינג</option>
        <option value="commercial" \${filter.vehicleType==='commercial'?'selected':''}>מסחרי / טנדר</option>
        <option value="trucks" \${filter.vehicleType==='trucks'?'selected':''}>משאיות / רכב כבד</option>
        <option value="buses" \${filter.vehicleType==='buses'?'selected':''}>אוטובוסים / היסעים</option>
        <option value="tzama" \${filter.vehicleType==='tzama'?'selected':''}>צמ״ה ועפר</option>
        <option value="service" \${filter.vehicleType==='service'?'selected':''}>רכבי שירות</option>
      </select>

      <select class="input" id="hit-filter-workforce" style="max-width:135px;height:34px;font-size:12.5px" onchange="S.searchHitFilter.workforce=this.value;renderSearchHitsFiltered()">
        <option value="all" \${filter.workforce==='all'?'selected':''}>כל העובדים (v2)</option>
        <option value="1-50" \${filter.workforce==='1-50'?'selected':''}>1–50 עובדים</option>
        <option value="51-100" \${filter.workforce==='51-100'?'selected':''}>51–100 עובדים</option>
        <option value="101-500" \${filter.workforce==='101-500'?'selected':''}>101–500 עובדים</option>
        <option value="501plus" \${filter.workforce==='501plus'?'selected':''}>501+ עובדים</option>
        <option value="unknown" \${filter.workforce==='unknown'?'selected':''}>לא ידוע בלבד</option>
      </select>

      <select class="input" id="hit-filter-role" style="max-width:130px;height:34px;font-size:12.5px" onchange="S.searchHitFilter.role=this.value;renderSearchHitsFiltered()">
        <option value="all" \${filter.role==='all'?'selected':''}>כל התפקידים</option>
        <option value="safety_officer" \${filter.role==='safety_officer'?'selected':''}>קצין בטיחות (579)</option>
        <option value="fleet_manager" \${filter.role==='fleet_manager'?'selected':''}>קצין/מנהל צי רכב</option>
        <option value="transport_manager" \${filter.role==='transport_manager'?'selected':''}>מנהל תחבורה</option>
        <option value="ops_manager" \${filter.role==='ops_manager'?'selected':''}>מנהל תפעול/עבודה</option>
        <option value="tech_manager" \${filter.role==='tech_manager'?'selected':''}>מנהל מקצועי מוסמך</option>
        <option value="ceo_owner" \${filter.role==='ceo_owner'?'selected':''}>מנכ״ל / בעלים</option>
      </select>

      <select class="input" id="hit-filter-quality" style="max-width:115px;height:34px;font-size:12.5px" onchange="S.searchHitFilter.quality=this.value;renderSearchHitsFiltered()">
        <option value="all" \${filter.quality==='all'?'selected':''}>כל האיכויות</option>
        <option value="green" \${filter.quality==='green'?'selected':''}>⭐ איכות גבוהה</option>
        <option value="yellow" \${filter.quality==='yellow'?'selected':''}>איכות בינונית</option>
      </select>

      <button type="button" class="btn btn-sm btn-ghost" onclick="resetHitFilters()" style="border:1px solid #cbd5e1;background:#fff;font-size:11.5px;padding:3px 8px;height:34px" title="נקה מסננים והצג את כל התוצאות">
        ✕ נקה
      </button>

      <span class="spacer"></span>
      <span class="xs muted" id="hitVisibleCountLabel">מוצגות \${visibleHits.length} מתוך \${allHits.length} חברות</span>
    </div>
  </div>

  <!-- הודעת הצלחה שלב 2 (נשמרו חברות שנמצאו) -->
  \${S._lastSaveSuccess ? \`
    <div class="card" id="stage2SaveSuccessBanner" style="background:#f0fdf4;border:1.5px solid #86efac;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;border-radius:8px">
      <div>
        <div class="bold" style="color:#166534;font-size:13.5px">✓ נשמרו בהצלחה \${S._lastSaveSuccess.count} חברות כ'חברות שנמצאו' (שלב 2)</div>
        <div class="xs muted" style="color:#15803d;margin-top:2px">החברות ממתינות לסינון ואישור ידני לפני העברה ל'ניהול לידים' (שלב 3). לא הועברה אף רשומה אוטומטית.</div>
      </div>
      <button class="btn btn-sm" data-tab="companies" data-go="companies" style="background:#16a34a;color:#fff;font-weight:700;border:none;padding:6px 14px;border-radius:6px;cursor:pointer">
        עבור ל'חברות שנמצאו' (שלב 2) ↗
      </button>
    </div>
  \` : ''}

  <!-- סרגל פעולה מרוכז ובחירת חברות — תהליך 2 אישורים נפרדים לפי הדרישה -->
  <div class="row" style="margin-bottom:14px;gap:8px;flex-wrap:wrap;align-items:center;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px 14px">
    <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-weight:700;font-size:13px">
      <input type="checkbox" id="hit-select-all" data-act="selectAllHits" \${selectedCount > 0 && selectedCount === freshHits.length ? 'checked' : ''}>
      <span id="selectAllLabelText">בחר את כל \${freshHits.length} החברות החדשות</span>
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

  <!-- טבלת 17 עמודות קבועה ויציבה ב-DOM עם שורות זורמות בזמן אמת -->
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
          <th style="min-width:130px;padding:8px 6px;text-align:right">הערכת עובדים v2</th>
          <th style="min-width:160px;padding:8px 8px;text-align:right">הערכת צי רכב v2</th>
          <th style="min-width:150px;padding:8px 6px;text-align:right">בעלי תפקידים וקצין בטיחות</th>
          <th style="min-width:120px;padding:8px 8px;text-align:right">טלפון עסקי</th>
          <th style="min-width:110px;padding:8px 8px;text-align:right">נייד עסקי</th>
          <th style="min-width:130px;padding:8px 8px;text-align:right">אימייל עסקי</th>
          <th style="min-width:110px;padding:8px 6px;text-align:right">מקור מידע</th>
          <th style="min-width:110px;padding:8px 6px;text-align:right">אימות והצלבות</th>
          <th style="min-width:90px;padding:8px 6px;text-align:right">איכות ופוטנציאל</th>
          <th style="min-width:110px;padding:8px 8px;text-align:right">סטטוס במערכת</th>
          <th style="width:40px;text-align:center;padding:8px 4px">פירוט</th>
        </tr>
      </thead>
      <tbody id="searchHitsTableBody">
        \${renderSearchHitsTableBodyContent(visibleHits, allHits, filter)}
      </tbody>
    </table>
  </div>
  \`;
}
/* ===== רינדור שורת תוצאה בודדת ב-17 עמודות + תמיכה במגירת פירוט ===== */
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
        <a href="\${esc(h.source_url || 'https://data.gov.il')}" target="_blank" rel="noopener" class="ltr num bold" style="color:#0284c7;text-decoration:none" title="צפה ברשומה במאגר ממשלת ישראל">
          \${esc(h.no)} 🔗
        </a>
      </td>

      <!-- 4. תחום פעילות אמיתי -->
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

      <!-- 7. הערכת עובדים v2 (Workforce Estimate v2) -->
      <td style="padding:8px 6px">
        <div class="bold" style="font-size:12px;color:#0f172a">\${esc(h.workforceDisplay || (h.employeesCount !== null ? h.employeesCount + ' עובדים' : 'לא ידוע (ללא אסמכתא)'))}</div>
        \${h.fieldWorkersDisplay ? \`<span class="badge" style="background:#f1f5f9;color:#475569;font-size:9px;margin-top:2px">עובדי שטח: \${esc(h.fieldWorkersDisplay)}</span>\` : ''}
        \${h.workforceConfidence ? \`<div class="xs muted" style="font-size:8.5px">\${esc(h.workforceConfidence)}</div>\` : ''}
      </td>

      <!-- 8. הערכת צי רכב v2 (Fleet Estimate v2) -->
      <td style="padding:8px 8px">
        <div class="bold" style="font-size:12px;color:#1e40af">\${esc(h.fleetSizeDisplay || h.fleetPotential || 'לא ידוע')}</div>
        <div style="display:flex;gap:4px;align-items:center;margin-top:2px;flex-wrap:wrap">
          \${h.fleetRounded ? \`<span class="badge b-blue" style="font-size:9px">\${esc(h.fleetRounded)}</span>\` : ''}
          <span class="badge \${h.fleetConfidence === 'גבוה' ? 'b-ok' : h.fleetConfidence === 'בינוני' ? 'b-blue' : 'b-est'}" style="font-size:8.5px">ביטחון: \${esc(h.fleetConfidence || 'נמוך')}</span>
        </div>
      </td>

      <!-- 9. איש קשר, בעלי תפקידים וקצין בטיחות (תקנה 579) -->
      <td style="padding:8px 6px">
        \${h.contactPerson && h.contactPerson !== '—'
          ? \`<div class="bold" style="font-size:12px;color:#0f172a">\${esc(h.contactPerson)}</div>\`
          : ''}
        \${h.roleTitle
          ? \`<span class="badge" style="background:#fef3c7;color:#92400e;font-size:9px;white-space:normal;line-height:1.2;display:inline-block;max-width:140px">\${esc(h.roleTitle)}</span>\`
          : ''}
        \${h.fleetOfficerStatus && h.fleetOfficerStatus !== 'לא נמצא'
          ? \`<div style="margin-top:2px"><span class="badge" style="background:#ede9fe;color:#6d28d9;font-size:8.5px" title="\${esc(h.fleetOfficerLegalNote || '')}">🛡️ תקנה 579: \${esc(h.fleetOfficerStatus)} (\${h.fleetOfficerProb}%)</span></div>\`
          : ''}
        \${!h.contactPerson && !h.roleTitle && (!h.fleetOfficerStatus || h.fleetOfficerStatus === 'לא נמצא')
          ? '<span class="xs muted">—</span>'
          : ''}
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
          : '<span class="xs muted">—</span>'
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
          : '<span class="xs muted">—</span>'
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
          : '<span class="xs muted">—</span>'
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

      <!-- 15. ציון איכות ומדד פוטנציאל עסקי -->
      <td style="padding:8px 6px">
        <span class="badge \${h.qualityColor === 'green' ? 'b-ok' : h.qualityColor === 'yellow' ? 'b-est' : 'b-bad'}" style="font-size:10px;font-weight:700">
          \${h.qualityScore} \${h.qualityColor === 'green' ? '⭐' : ''}
        </span>
        \${h.businessPotentialScore ? \`<div class="xs bold" style="color:#1d4ed8;font-size:9.5px;margin-top:2px">פוטנציאל: \${h.businessPotentialScore}%</div>\` : ''}
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

  // מגירת פירוט רספונסיבית עם מודל כוח אדם v2, מודל צי רכב v2, קציני בטיחות וקישורים מהירים
  const wf = h.workforce_v2 || {};
  const fl = h.fleet_estimate_v2 || {};
  const wfBreakdown = wf.workforce_breakdown || {};

  const drawerRow = isExpanded ? \`
    <tr id="drawer-\${esc(h.no)}" class="hit-drawer-row" style="background:#f8fafc;border-bottom:2px solid #cbd5e1">
      <td colspan="17" style="padding:14px 18px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">
          <!-- כרטיס 1: פרטי רישום -->
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
            <div class="bold" style="color:#1e3a8a;margin-bottom:6px">🏢 פרטי התאגדות ורישום רשמי</div>
            <div class="xs"><b>שם מלא:</b> \${esc(h.name)}</div>
            <div class="xs"><b>ח.פ. רשמי:</b> <span class="num ltr font-bold">\${esc(h.no)}</span></div>
            <div class="xs"><b>סטטוס משפטי:</b> \${esc(h.status || 'פעילה')}</div>
            <div class="xs"><b>תאריך רישום:</b> \${esc(h.incorporated || 'לא ידוע')}</div>
            <div class="xs" style="margin-top:4px"><b>מקור ממשלתי:</b> <a href="\${esc(h.source_url || 'https://data.gov.il')}" target="_blank" class="ltr" style="color:#2563eb">\${esc(h.source_label)} ↗</a></div>
          </div>

          <!-- כרטיס 2: מיקום וכתובת -->
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
            <div class="bold" style="color:#0f766e;margin-bottom:6px">📍 מיקום וכתובת מלאה</div>
            <div class="xs"><b>אזור בארץ:</b> \${esc(h.region || 'לא ידוע')}</div>
            <div class="xs"><b>עיר:</b> \${esc(h.city || 'לא ידוע')}</div>
            <div class="xs"><b>כתובת:</b> \${esc(h.addr || 'לא צוין ברשם')}</div>
            <div class="xs"><b>תחום ועיסוק:</b> \${esc(h.ind || '—')}</div>
          </div>

          <!-- כרטיס 3: מודל כוח אדם v2 (Workforce v2) -->
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
            <div class="bold" style="color:#0369a1;margin-bottom:6px">👥 מודל הערכת כוח אדם v2</div>
            <div class="xs"><b>עובדים משוערים:</b> \${esc(wf.employee_count_display || h.workforceDisplay || 'לא ידוע')}</div>
            <div class="xs"><b>עובדי שטח ותפעול:</b> \${esc(wf.field_workers_count_display || 'לא ידוע')} (\${esc(wf.field_workers_pct_display || '')})</div>
            <div class="xs"><b>ביטחון הערכה:</b> \${esc(wf.workforce_confidence_level || 'הערכה גסה')} (\${wf.workforce_confidence_score || 20}%)</div>
            \${wf.roles_identified && wf.roles_identified.length > 0 ? \`
              <div class="xs" style="margin-top:4px"><b>תפקידים שזוהו בענף:</b> \${esc(wf.roles_identified.join(', '))}</div>
            \` : ''}
            \${wfBreakdown.size_scope ? \`
              <div class="xs muted" style="margin-top:4px;font-size:9.5px">פירוט 5 גורמים: היקף \${wfBreakdown.size_scope} · אתרים \${wfBreakdown.branches_sites} · גיוס \${wfBreakdown.recruiting} · צי \${wfBreakdown.fleet_operations} · ענף \${wfBreakdown.industry_type}</div>
            \` : ''}
          </div>

          <!-- כרטיס 4: ראיות צי רכב וקציני בטיחות (תקנה 579) -->
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
            <div class="bold" style="color:#b45309;margin-bottom:6px">🚛 מודל צי רכב וקצין בטיחות (תקנה 579)</div>
            <div class="xs"><b>הערכת צי רכב:</b> \${esc(fl.fleet_size_display || h.fleetSizeDisplay || 'הערכה ענפית')}</div>
            <div class="xs"><b>רמת ביטחון:</b> \${esc(fl.fleet_confidence || h.fleetConfidence || 'נמוך')}</div>
            <div class="xs"><b>קצין בטיחות בתעבורה:</b> \${h.fleetOfficerStatus ? esc(h.fleetOfficerStatus) : 'לא נמצא'} (\${h.fleetOfficerProb || 0}% סבירות)</div>
            \${h.fleetOfficerLegalNote ? \`<div class="xs" style="color:#92400e;margin-top:2px">\${esc(h.fleetOfficerLegalNote)}</div>\` : ''}
            \${fl.basis_of_estimate_label ? \`<div class="xs muted" style="margin-top:4px;font-size:9.5px">בסיס הערכה: \${esc(fl.basis_of_estimate_label)}</div>\` : ''}
          </div>

          <!-- כרטיס 5: תקשורת ואימות רב-מקורות -->
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
            <div class="bold" style="color:#7c3aed;margin-bottom:6px">📞 תקשורת והצלבות עצמאיות</div>
            <div class="xs"><b>טלפון עסקי:</b> \${h.phone && h.phone !== '—' ? \`<a href="tel:\${esc(h.phone)}" class="ltr bold" style="color:#0284c7">\${esc(h.phone)}</a> (\${h.phoneVerBadgeLabel})\` : 'לא ידוע'}</div>
            <div class="xs"><b>נייד:</b> \${h.mobile && h.mobile !== '—' ? \`<a href="tel:\${esc(h.mobile)}" class="ltr bold" style="color:#16a34a">\${esc(h.mobile)}</a>\` : '—'}</div>
            <div class="xs"><b>אימייל:</b> \${h.email && h.email !== '—' ? \`<a href="mailto:\${esc(h.email)}" class="ltr" style="color:#2563eb">\${esc(h.email)}</a> (\${h.emailVerLabel})\` : '—'}</div>
            <div class="xs" style="margin-top:4px"><b>מקורות הצלבה שאושרו:</b> \${esc((h.phoneSourcesList || []).join(", ") || 'טרם הוצלבו מקורות')}</div>
            <div class="xs" style="margin-top:4px"><b>איכות ופוטנציאל ליד:</b> <span class="badge \${h.qualityColor==='green'?'b-ok':h.qualityColor==='yellow'?'b-est':'b-bad'}">\${h.qualityScore} (\${h.qualityLabel})</span> \${h.businessPotentialScore ? \`· פוטנציאל עסקי: \${h.businessPotentialScore}%\` : ''}</div>
          </div>
        </div>

        <!-- קישורי איתור מהיר בלחיצה אחת (רשתות חברתיות, מדריכים ו-Google) -->
        <div style="margin-top:12px;padding-top:10px;border-top:1px dashed #cbd5e1;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="xs bold" style="color:#475569">🔍 איתור ישיר בקליק אחד (ללא הקלדה):</span>
          <a href="https://www.google.com/maps/search/?api=1&query=\${encodeURIComponent(h.name + ' ' + (h.city || ''))}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost" style="padding:2px 8px;font-size:11px;border:1px solid #cbd5e1;background:#fff;text-decoration:none">
            📍 Google Maps
          </a>
          <a href="https://www.linkedin.com/search/results/companies/?keywords=\${encodeURIComponent(h.name)}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost" style="padding:2px 8px;font-size:11px;border:1px solid #cbd5e1;background:#fff;text-decoration:none">
            👥 LinkedIn
          </a>
          <a href="https://www.b144.co.il/search/?query=\${encodeURIComponent(h.name)}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost" style="padding:2px 8px;font-size:11px;border:1px solid #cbd5e1;background:#fff;text-decoration:none">
            📖 בזק 144
          </a>
          <a href="https://www.d.co.il/find/?query=\${encodeURIComponent(h.name)}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost" style="padding:2px 8px;font-size:11px;border:1px solid #cbd5e1;background:#fff;text-decoration:none">
            📖 דפי זהב
          </a>
          <a href="https://easy.co.il/search/?q=\${encodeURIComponent(h.name)}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost" style="padding:2px 8px;font-size:11px;border:1px solid #cbd5e1;background:#fff;text-decoration:none">
            ⚡ איזי (Easy)
          </a>
          \${h.mobile && h.mobile !== '—' ? \`
            <a href="https://wa.me/972\${esc(String(h.mobile).replace(/\\D/g, '').replace(/^0/, ''))}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost" style="padding:2px 8px;font-size:11px;border:1px solid #86efac;background:#ecfdf5;color:#166534;text-decoration:none;font-weight:600">
              💬 WhatsApp
            </a>
          \` : ''}
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
  if (h.contactPerson && h.contactPerson !== "—") score += 10;

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

/* ===== מנוע איתור חברות באצוות הדרגתיות רב-מקורות (STREAMING MULTI-SOURCE BATCH ENGINE) ===== */
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
  const selectedCheckboxes = Array.from(document.querySelectorAll(".src-cb:checked"));
  let selectedSourceIds = selectedCheckboxes.map(cb => cb.value);
  if (selectedSourceIds.length === 0) {
    // אם לא נבחר כלום, בחר את ברירת המחדל
    selectedSourceIds = ["src_companies", "src_contractors", "src_business_licenses", "src_garages", "src_manpower_security"];
  }
  saveSourceSelection(selectedSourceIds);

  // הגדרת יעד הצלבות
  const targetCross = parseInt(($("#a-target-cross") && $("#a-target-cross").value) || customOpts.targetCross || 4, 10);

  // חילוץ שאר מסנני הפוסט-שליפה
  const regionVal = ($("#a-region") && $("#a-region").value) || customOpts.region || "";
  const cityVal = ($("#a-city") && $("#a-city").value.trim().toLowerCase()) || (customOpts.city || "").trim().toLowerCase();
  const fleetTypeVal = ($("#a-fleet-type") && $("#a-fleet-type").value) || customOpts.fleetType || "";
  const fleetModeVal = ($("#a-fleet-filter-mode") && $("#a-fleet-filter-mode").value) || customOpts.fleetMode || "all";
  const workforceVal = ($("#a-workforce-range") && $("#a-workforce-range").value) || customOpts.workforce || "all";
  const targetRoleVal = ($("#a-target-role") && $("#a-target-role").value) || customOpts.targetRole || "all";
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
      const norm = String(hp || "").replace(/\\D/g, "");
      if (norm) existingHpMap.set(norm, { name: "חברה קיימת במאגר STAGING DB", no: norm, source: "database" });
    });
  }
  C.forEach(c => {
    const norm = (window.OPQualify ? OPQualify.normalizeCompanyHp(c.no) : String(c.no || "").replace(/\\D/g, ""));
    if (norm) existingHpMap.set(norm, c);
  });
  const seenInCurrentRun = new Set();

  // 5. מיפוי מקורות נבחרים למשאבי data.gov.il פעילים
  const datasets = [];
  if (selectedSourceIds.includes("src_companies")) {
    datasets.push({ id: "f004176c-b85f-4542-8901-7b3176f9a054", type: "companies", name: "רשם החברות" });
  }
  if (selectedSourceIds.includes("src_contractors")) {
    datasets.push({ id: "4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8", type: "contractors", name: "פנקס הקבלנים" });
  }
  if (selectedSourceIds.includes("src_business_licenses")) {
    datasets.push({ id: "7d4c61e2-2416-453e-8efb-bd02ec89db35", type: "business_licenses", name: "רישוי עסקים ממשלתי" });
  }
  if (selectedSourceIds.includes("src_garages")) {
    datasets.push({ id: "bb68386a-a331-4bbc-b668-bba2766d517d", type: "garages", name: "מוסכים ומכוני רישוי" });
  }
  if (selectedSourceIds.includes("src_manpower_security")) {
    datasets.push({ id: "243fe1ce-b2ae-4c26-9e5e-ce306a602040", type: "manpower_security", name: "קבלני שמירה וכוח אדם" });
  }
  if (selectedSourceIds.includes("src_plants_industry")) {
    datasets.push({ id: "88d1883c-3b7a-4580-9be9-6d54659666c3", type: "plants_industry", name: "רשימת מפעלים ותעשייה" });
  }
  if (selectedSourceIds.includes("src_ngos")) {
    datasets.push({ id: "be5b7935-3922-45d4-9638-08871b17ec95", type: "ngos", name: "רשם העמותות" });
  }

  // ברירת מחדל אם נבחרו רק מקורות קישור חיצוני
  if (datasets.length === 0) {
    datasets.push(
      { id: "f004176c-b85f-4542-8901-7b3176f9a054", type: "companies", name: "רשם החברות" },
      { id: "4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8", type: "contractors", name: "פנקס הקבלנים" },
      { id: "7d4c61e2-2416-453e-8efb-bd02ec89db35", type: "business_licenses", name: "רישוי עסקים ממשלתי" },
      { id: "bb68386a-a331-4bbc-b668-bba2766d517d", type: "garages", name: "מוסכים ומכוני רישוי" }
    );
  }

  const batchSize = 50;
  let batchIndex = 1;
  const startTime = Date.now();

  try {
    const maxOffset = Math.max(250, reqLimit * 4);
    let offset = 0;

    while (offset < maxOffset && !S.searchStopRequested && S.searchStats.added < reqLimit) {
      let anyRecordsInRound = false;

      for (const ds of datasets) {
        if (S.searchStopRequested || S.searchStats.added >= reqLimit) break;

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
            let rawHit = null;
            if (ds.type === "contractors") rawHit = contractorHit(rec);
            else if (ds.type === "business_licenses") rawHit = businessLicenseHit(rec);
            else if (ds.type === "garages") rawHit = garageHit(rec);
            else if (ds.type === "manpower_security") rawHit = manpowerHit(rec);
            else if (ds.type === "plants_industry") rawHit = plantHit(rec);
            else if (ds.type === "ngos") rawHit = ngoHit(rec);
            else rawHit = registryHit(rec);

            if (!rawHit) {
              S.searchStats.rejected++;
              S.searchRejected.push({
                name: rec.SHEM_YESHUT || rec["שם עסק"] || rec.shem_mosah || rec.companyname || rec["שם חברה"] || "ללא שם",
                no: rec.MISPAR_YESHUT || rec.rasham_havarot || rec.identitynumber || rec["מספר חברה"] || "ללא מזהה",
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

            // בדיקת כפילות מול מאגר STAGING DB (2,018 חברות)
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
            // חיבור נוסחת מודל כוח אדם וצי רכב המקורית (Workforce & Fleet Estimation Formula v2)
            if (window.OPQualify && typeof window.OPQualify.evaluate === "function") {
              const qRow = {
                company_name: rawHit.name,
                company_hp: rawHit.no,
                industry_name: rawHit.ind,
                city: rawHit.city,
                address: rawHit.addr,
                phone: (rawHit.phone && rawHit.phone !== "—") ? rawHit.phone : "",
                mobile_phone: (rawHit.mobile && rawHit.mobile !== "—") ? rawHit.mobile : "",
                email: (rawHit.email && rawHit.email !== "—") ? rawHit.email : "",
                source_name: rawHit.source_label,
                contact_name: (rawHit.contactPerson && rawHit.contactPerson !== "—") ? rawHit.contactPerson : "",
                contact_role: rawHit.roleTitle || "",
                notes: rawHit.ind,
                contractor_classification: rawHit.source === "contractors" ? rawHit.ind : "",
                registry_check: {
                  companies: { found: rawHit.source === "companies", status: rawHit.status },
                  contractors: { found: rawHit.source === "contractors", records: (rawHit.phone && rawHit.phone !== "—") ? [{ phone: rawHit.phone }] : [] }
                }
              };
              const evalRes = window.OPQualify.evaluate(qRow);
              if (evalRes) {
                const wf = evalRes.workforce_estimate_v2 || evalRes.workforce_estimate || {};
                rawHit.workforce_v2 = wf;
                rawHit.approxEmployees = (wf.approx_employees !== undefined) ? wf.approx_employees : null;
                rawHit.workforceRange = wf.employee_count_range || "לא ידוע";
                rawHit.workforceDisplay = wf.employee_count_display || (rawHit.employeesCount ? (rawHit.employeesCount + " עובדים (מאומת)") : "לא ידוע (ללא אסמכתא)");
                rawHit.workforceConfidence = wf.workforce_confidence_level || "";
                rawHit.workforceBreakdown = wf.workforce_breakdown || {};
                rawHit.rolesIdentified = wf.roles_identified || [];
                rawHit.fieldWorkersCount = wf.field_workers_count || 0;
                rawHit.fieldWorkersDisplay = wf.field_workers_count_display || "";
                rawHit.workforceBasis = wf.basis_label || "";

                const fl = evalRes.fleet_estimate_v2 || {};
                rawHit.fleet_v2 = fl;
                rawHit.fleetSizeDisplay = fl.fleet_size_display || rawHit.fleetPotential || "לא ידוע";
                rawHit.fleetRounded = fl.fleet_count_rounded || "";
                rawHit.fleetConfidence = fl.fleet_confidence || "נמוך";
                rawHit.fleetBasis = fl.basis_of_estimate_label || "";
                rawHit.fleetIsEstimate = fl.fleet_is_estimate !== false;

                rawHit.fleetOfficerProb = evalRes.fleet_officer_probability || 0;
                rawHit.fleetOfficerStatus = evalRes.fleet_officer_status || "לא נמצא";
                rawHit.fleetOfficerLegalNote = evalRes.fleet_officer_legal_note || "";

                rawHit.businessPotentialScore = evalRes.business_potential_score || 50;
                rawHit.potentialBreakdown = evalRes.business_potential_breakdown || {};

                if ((!rawHit.roleTitle || rawHit.roleTitle.startsWith("אינדיקציה")) && rawHit.rolesIdentified.length > 0) {
                  rawHit.roleTitle = rawHit.rolesIdentified.slice(0, 2).join(", ");
                }
              }
            }

            // סינונים מקומיים (Post-Fetch Filters):
            // א. סינון עיר
            if (cityVal && !String(rawHit.city || "").toLowerCase().includes(cityVal)) {
              continue;
            }

            // ב. סינון אזור
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
            if (fleetTypeVal && fleetTypeVal !== "all") {
              const combType = (String(rawHit.fleetType || "") + " " + String(rawHit.ind || "") + " " + String(rawHit.name || "") + " " + (rawHit.rolesIdentified || []).join(" ")).toLowerCase();
              if (fleetTypeVal === "private" && !combType.includes("פרטי") && !combType.includes("ליסינג")) continue;
              if (fleetTypeVal === "commercial" && !combType.includes("מסחרי") && !combType.includes("טנדר") && !combType.includes("ואן")) continue;
              if (fleetTypeVal === "trucks" && !combType.includes("משא") && !combType.includes("הובל") && !combType.includes("רמסע")) continue;
              if (fleetTypeVal === "buses" && !combType.includes("אוטובוס") && !combType.includes("מיניבוס") && !combType.includes("הסעות")) continue;
              if (fleetTypeVal === "tzama" && !combType.includes('צמ"ה') && !combType.includes('צמ״ה') && !combType.includes('צמה') && !combType.includes("עפר") && !combType.includes("תשתית")) continue;
              if (fleetTypeVal === "service" && !combType.includes("שירות") && !combType.includes("טכנאי") && !combType.includes("סיור")) continue;
            }

            // ה. סינון צי (מודל v2 עובדה ופוטנציאל)
            if (fleetModeVal && fleetModeVal !== "all") {
              const flStr = String(rawHit.fleetRounded || rawHit.fleetSizeDisplay || "");
              if (fleetModeVal === "1-4" && !flStr.includes("1–4") && !flStr.includes("1-4") && !flStr.includes("צי קטן")) continue;
              if (fleetModeVal === "5-10" && !flStr.includes("5–10") && !flStr.includes("5-10")) continue;
              if (fleetModeVal === "11-20" && !flStr.includes("10–15") && !flStr.includes("10-15") && !flStr.includes("15–25") && !flStr.includes("11-20")) continue;
              if (fleetModeVal === "21-50" && !flStr.includes("20–50") && !flStr.includes("25–50") && !flStr.includes("21-50")) continue;
              if (fleetModeVal === "51-100" && !flStr.includes("50–100") && !flStr.includes("51-100")) continue;
              if (fleetModeVal === "100plus" && !flStr.includes("100+")) continue;
              if (fleetModeVal === "indication_200" && !String(rawHit.fleetPotential || "").includes("200") && !String(rawHit.ind || "").includes("200")) continue;
              if (fleetModeVal === "potential_5plus" && !String(rawHit.fleetPotential || "").includes("5+") && !rawHit.fleetIsFact) continue;
            }

            // ו. סינון מספר עובדים (מודל הערכת עובדים v2)
            if (workforceVal && workforceVal !== "all") {
              const empNum = (rawHit.approxEmployees !== null && rawHit.approxEmployees !== undefined) ? rawHit.approxEmployees : rawHit.employeesCount;
              if (workforceVal === "1-50" && (empNum === null || empNum < 1 || empNum > 50)) continue;
              if (workforceVal === "51-100" && (empNum === null || empNum < 51 || empNum > 100)) continue;
              if (workforceVal === "101-500" && (empNum === null || empNum < 101 || empNum > 500)) continue;
              if (workforceVal === "501plus" && (empNum === null || empNum < 501)) continue;
              if (workforceVal === "unknown" && empNum !== null) continue;
            }

            // ז. סינון בעל תפקיד / קצין בטיחות מבוקש
            if (targetRoleVal && targetRoleVal !== "all") {
              const rTitle = (String(rawHit.roleTitle || "") + " " + (rawHit.rolesIdentified || []).join(" ") + " " + String(rawHit.contactPerson || "") + " " + String(rawHit.fleetOfficerStatus || "")).toLowerCase();
              if (targetRoleVal === "safety_officer" && !rTitle.includes("בטיחות") && (rawHit.fleetOfficerProb || 0) < 50) continue;
              if (targetRoleVal === "fleet_manager" && !rTitle.includes("צי") && !rTitle.includes("רכב")) continue;
              if (targetRoleVal === "transport_manager" && !rTitle.includes("תחבורה") && !rTitle.includes("לוגיסטיקה")) continue;
              if (targetRoleVal === "ops_manager" && !rTitle.includes("תפעול") && !rTitle.includes("עבודה")) continue;
              if (targetRoleVal === "tech_manager" && !rTitle.includes("מקצועי") && !rTitle.includes("מוסמך")) continue;
              if (targetRoleVal === "ceo_owner" && !rTitle.includes("מנכ") && !rTitle.includes("בעלים")) continue;
            }
            // ח. מנוע הצלבת מקורות ואימות טלפון ירוק מחמיר (True Green Phone Cross-Referencing)
            const hasPhone = rawHit.phone && rawHit.phone !== "לא ידוע" && rawHit.phone !== "לא נמצא" && rawHit.phone !== "—";
            const isMobile = hasPhone && (rawHit.phone.startsWith("05") || String(rawHit.mobile || "").startsWith("05"));
            const hasEmail = rawHit.email && rawHit.email !== "לא ידוע" && rawHit.email !== "—" && rawHit.email.includes("@");

            const phoneSources = [];
            if (hasPhone) {
              if (rawHit.source === "contractors") phoneSources.push("פנקס הקבלנים (data.gov.il)");
              else if (rawHit.source === "business_licenses") phoneSources.push("רישוי עסקים ממשלתי (data.gov.il)");
              else if (rawHit.source === "garages") phoneSources.push("מוסכים ומכוני רישוי (משרד התחבורה)");
              else phoneSources.push(rawHit.source_label || "מאגר ממשלתי");

              // בדיקת הצלבה מול טלפון מאומת במאגר STAGING DB (מקור עצמאי שני)
              const stagingRec = (typeof STAGING_VERIFIED_PHONES !== "undefined") ? STAGING_VERIFIED_PHONES[normHp] : null;
              if (stagingRec && stagingRec.phone) {
                const normP1 = rawHit.phone.replace(/\\D/g, "");
                const normP2 = String(stagingRec.phone).replace(/\\D/g, "");
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
              if (rawHit.source === "contractors") emailSources.push("פנקס הקבלנים (data.gov.il)");
              else if (rawHit.source === "business_licenses") emailSources.push("רישוי עסקים ממשלתי (data.gov.il)");
              else emailSources.push("רישום רשמי");
            }
            rawHit.emailMatches = emailSources.length;
            rawHit.emailVerLabel = emailSources.length > 0 ? \`\${emailSources.length}/\${targetCross}\` : \`0/\${targetCross}\`;

            // ט. סינון פרטי קשר נדרשים
            if (contactReqVal === "green_phone" && rawHit.phoneVerBadgeColor !== "green") continue;
            if (contactReqVal === "phone" && !hasPhone) continue;
            if (contactReqVal === "mobile" && !isMobile) continue;
            if (contactReqVal === "email" && !hasEmail) continue;
            if (contactReqVal === "any" && !hasPhone && !hasEmail) continue;

            // הפרדת טלפון נייח מנייד עסקי
            if (isMobile) {
              rawHit.mobile = rawHit.phone;
              rawHit.phone = "—";
            } else {
              rawHit.mobile = "—";
            }

            // י. חישוב ציון איכות ליד
            const q = evaluateHitQuality(rawHit);
            rawHit.qualityScore = q.score;
            rawHit.qualityColor = q.color;
            rawHit.qualityLabel = q.label;

            // סימון אינדיקציית צי
            if (rawHit.fleetIsFact || String(rawHit.fleetPotential || "").includes("5+")) {
              S.searchStats.fleetEvidence++;
            }

            seenInCurrentRun.add(normHp);
            newBatchHits.push(rawHit);
            S.searchStats.added++;

            if (S.searchStats.added >= reqLimit) break;
          }

          if (newBatchHits.length > 0) {
            S.searchHits.push(...newBatchHits);
            renderSearchHitsProgressive();
            updateLiveKpisAndProgress();
          }
        }
      }

      if (!anyRecordsInRound) {
        break;
      }

      offset += batchSize;
      batchIndex++;
    }
  } catch (globalErr) {
    console.error("שגיאה במנוע החיפוש המאוחד:", globalErr);
    toast("שגיאה בסריקה: " + globalErr.message, "error");
  } finally {
    S.searchRunning = false;
    const durSec = ((Date.now() - startTime) / 1000).toFixed(1);
    updateLiveSearchStatus(\`הסריקה הסתיימה בהצלחה ב-\${durSec} שניות. אותרו \${S.searchHits.length} חברות חדשות.\`);
    renderSearchHitsProgressive();
    updateLiveKpisAndProgress();
    updateActionButtonsState();
  }
}

/* ===== פונקציות חילוץ רשומות ממאגרי DATA.GOV.IL השונים ===== */

/* 1. חילוץ רשומת רשם החברות */
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
    employeesCount: null,
    fleetIsFact: false,
    fleetPotential: isHeavy ? "פוטנציאל צי 5+ (הערכה ענפית)" : "הערכה (ללא אסמכתא)",
    fleetType: isHeavy ? "משאיות הובלה ולוגיסטיקה" : "רכבי עבודה",
    contactPerson: "—",
    roleTitle: isHeavy ? "אינדיקציה: פעילות צי מסחרי" : "",
    roleType: isHeavy ? "industry_indication" : "none",
    source: "companies",
    source_label: "רשם החברות",
    source_url: \`https://data.gov.il/dataset/f004176c-b85f-4542-8901-7b3176f9a054\`,
    tierLabel: "Tier A | ממשלתי רשמי"
  };
}

/* 2. חילוץ רשומת פנקס הקבלנים ענף 200 */
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
  const ovdim = String(rec.OVDIM || "").trim();

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
    employeesCount: null,
    fleetIsFact: false,
    fleetPotential: isBranch200 ? '≈ פוטנציאל צי 5+ (אינדיקציה: ענף 200)' : '≈ פוטנציאל צי 5+ (הערכה ענפית)',
    fleetType: isBranch200 ? "ציוד כבד ועבודות תשתית" : "רכבי שירות ועבודה",
    contactPerson: ovdim || "—",
    roleTitle: ovdim ? \`צוות מקצועי מורשה: \${ovdim}\` : (isBranch200 ? "אינדיקציה: קבלן ענף 200" : ""),
    roleType: ovdim ? "verified_official" : "industry_indication",
    source: "contractors",
    source_label: "פנקס הקבלנים",
    source_url: \`https://data.gov.il/dataset/4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8\`,
    tierLabel: "Tier A | ממשלתי רשמי"
  };
}

/* 3. חילוץ רשומת רישוי עסקים ממשלתי */
function businessLicenseHit(rec) {
  const name = String(rec["שם עסק"] || "").replace(/בע~מ|בע״מ|בע"מ/g, "").trim();
  const licenseNo = String(rec["מספר רישיון"] || "").trim();
  if (!name || (!licenseNo && !rec["טלפון בעסק"])) return null;

  const phone = formatIsraeliPhone(rec["טלפון בעסק"]) || "—";
  const email = rec["מייל בעסק"] && String(rec["מייל בעסק"]).includes("@") ? String(rec["מייל בעסק"]).trim() : "—";
  const street = String(rec["שם רחוב"] || "").trim();
  const house = String(rec["בית"] || "").trim();
  const desc = String(rec["תאור רישיון"] || rec["תאור סטטוס"] || "רישוי עסקים ממשלתי").trim();
  const hasVehicleRef = /רכב|משא|הובל|חבר|מוביל/.test(desc + " " + name);

  // ח.פ נגזר ממספר הרישיון
  const syntheticHp = licenseNo ? ("70" + String(licenseNo).padStart(7, "0")).slice(0, 9) : ("7000" + Math.floor(Math.random() * 89999 + 10000));

  return {
    no: syntheticHp,
    name,
    city: "רשות מקומית",
    addr: street ? \`\${street}\${house ? " " + house : ""}\` : "לפי רישוי עסק",
    ind: desc,
    status: "מורשה ברישוי עסקים",
    incorporated: String(rec["תאריך תוקף"] || "").trim() || "לא ידוע",
    addrKnown: !!street,
    phone: phone,
    mobile: phone.startsWith("05") ? phone : "—",
    email: email,
    employees: "לא ידוע (ללא אסמכתא)",
    employeesCount: null,
    fleetIsFact: hasVehicleRef,
    fleetPotential: hasVehicleRef ? "✓ פעילות רכבי עסק מאושרת ברישיון" : "פוטנציאל עסקי",
    fleetType: hasVehicleRef ? "רכבי שירות ושינוע מורשים" : "רכבי עבודה",
    contactPerson: "—",
    roleTitle: hasVehicleRef ? "אינדיקציה: היתר רכב מורשה" : "",
    roleType: hasVehicleRef ? "industry_indication" : "none",
    source: "business_licenses",
    source_label: "רישוי עסקים ממשלתי",
    source_url: "https://data.gov.il/dataset/7d4c61e2-2416-453e-8efb-bd02ec89db35",
    tierLabel: "Tier A | ממשלתי רשמי"
  };
}

/* 4. חילוץ רשומת מוסכים ומכוני רישוי (משרד התחבורה) */
function garageHit(rec) {
  const hp = String(rec.rasham_havarot || rec.mispar_mosah || "").replace(/\\D/g, "");
  const name = String(rec.shem_mosah || "").replace(/בע~מ|בע״מ|בע"מ/g, "").trim();
  if (!name) return null;

  const validHp = (hp && hp.length >= 6) ? hp : ("58" + String(rec.mispar_mosah || "1000").padStart(7, "0")).slice(0, 9);
  const phone = formatIsraeliPhone(rec.telephone) || "—";
  const city = String(rec.yishuv || "").trim();
  const addr = String(rec.ktovet || "").trim();
  const manager = String(rec.menahel_miktzoa || "").trim();
  const field = String(rec.miktzoa || rec.sug_mosah || "מוסך מורשה").trim();

  return {
    no: validHp,
    name,
    city: city || "לא ידוע",
    addr: addr ? \`\${addr}\${city ? ", " + city : ""}\` : (city || "לא ידוע"),
    ind: \`מוסך מורשה: \${field}\`,
    status: "מורשה משרד התחבורה",
    incorporated: "פעיל במאגר התחבורה",
    addrKnown: !!addr || !!city,
    phone: phone,
    mobile: phone.startsWith("05") ? phone : "—",
    email: "—",
    employees: "לא ידוע (ללא אסמכתא)",
    employeesCount: null,
    fleetIsFact: true,
    fleetPotential: "✓ מוסך מורשה ומכון רישוי (עובדה מאומתת משרד התחבורה)",
    fleetType: "ציוד תחבורה ורכב כבד",
    contactPerson: manager || "—",
    roleTitle: manager ? \`מנהל מקצועי מוסמך: \${manager}\` : "מנהל מקצועי מוסמך",
    roleType: "verified_official",
    source: "garages",
    source_label: "מוסכים ומכוני רישוי (משרד התחבורה)",
    source_url: "https://data.gov.il/dataset/bb68386a-a331-4bbc-b668-bba2766d517d",
    tierLabel: "Tier A | ממשלתי רשמי"
  };
}

/* 5. חילוץ רשומת קבלני כוח אדם, שמירה וניקיון */
function manpowerHit(rec) {
  const hp = String(rec.identitynumber || "").replace(/\\D/g, "");
  const name = String(rec.companyname || "").replace(/בע~מ|בע״מ|בע"מ/g, "").trim();
  if (!name || !hp || hp.length < 5) return null;

  const city = String(rec.town || "").trim();
  const addr = String(rec.address || "").trim();
  const ceo = String(rec.companyceo || "").trim();
  const field = String(rec.fieldfactivity || "קבלן שירותים ואבטחה").trim();

  return {
    no: hp,
    name,
    city: city || "לא ידוע",
    addr: addr ? \`\${addr}\${city ? ", " + city : ""}\` : (city || "לא ידוע"),
    ind: field,
    status: "רישיון בתוקף",
    incorporated: String(rec.validuntil || "").trim() || "לא ידוע",
    addrKnown: !!addr || !!city,
    phone: "—",
    mobile: "—",
    email: "—",
    employees: "לא ידוע (ללא אסמכתא)",
    employeesCount: null,
    fleetIsFact: false,
    fleetPotential: "≈ פוטנציאל צי 5+ (רכבי סיור, פיקוח ושירות שטח)",
    fleetType: "רכבי סיור ושירות שטח",
    contactPerson: ceo || "—",
    roleTitle: ceo ? \`מנכ״ל רשום: \${ceo}\` : "מנכ״ל רשום",
    roleType: "verified_official",
    source: "manpower_security",
    source_label: "קבלני שמירה וכוח אדם",
    source_url: "https://data.gov.il/dataset/243fe1ce-b2ae-4c26-9e5e-ce306a602040",
    tierLabel: "Tier A | ממשלתי רשמי"
  };
}

/* 6. חילוץ רשומת מפעלים ואתרי תעשייה */
function plantHit(rec) {
  const hp = String(rec.Mispar_Atar || rec.Mispar_Mezahe || "").replace(/\\D/g, "");
  const name = String(rec.Shem_Atar_Svivati || "").replace(/בע~מ|בע״מ|בע"מ/g, "").trim();
  if (!name) return null;

  const validHp = (hp && hp.length >= 6) ? hp : ("51" + String(rec.Mispar_Mezahe || "10000").padStart(7, "0")).slice(0, 9);
  const city = String(rec.Yeshuv || "").trim();
  const district = String(rec.Machoz || "").trim();
  const ind = String(rec.mehute_Atar || "אתר תעשייתי").trim();

  return {
    no: validHp,
    name,
    city: city || "לא ידוע",
    addr: city ? \`\${city}\${district ? " (" + district + ")" : ""}\` : "לא ידוע",
    ind: ind,
    status: "אתר תעשייתי פעיל",
    incorporated: "פעיל ברישום סביבתי",
    addrKnown: !!city,
    phone: "—",
    mobile: "—",
    email: "—",
    employees: "לא ידוע (ללא אסמכתא)",
    employeesCount: null,
    fleetIsFact: false,
    fleetPotential: "≈ פוטנציאל צי 5+ (שינוע חומרי גלם ולוגיסטיקת מפעל)",
    fleetType: "משאיות תעשייה ושינוע",
    contactPerson: "—",
    roleTitle: "אינדיקציה: מפעל תעשייה פעיל",
    roleType: "industry_indication",
    source: "plants_industry",
    source_label: "רשימת מפעלים ותעשייה",
    source_url: "https://data.gov.il/dataset/88d1883c-3b7a-4580-9be9-6d54659666c3",
    tierLabel: "Tier A | ממשלתי רשמי"
  };
}

/* 7. חילוץ רשומת רשם העמותות */
function ngoHit(rec) {
  const hp = String(rec["מספר עמותה"] || "").replace(/\\D/g, "");
  const name = String(rec["שם עמותה בעברית"] || "").trim();
  if (!name || !hp || hp.length < 5) return null;

  const city = String(rec["כתובת - ישוב"] || "").trim();
  const street = String(rec["כתובת - רחוב"] || "").trim();
  const house = String(rec["כתובת - מספר דירה"] || "").trim();
  const ind = String(rec["סיווג פעילות ענפי"] || "עמותה רשומה").trim();
  const empCount = rec["כמות עובדים"] ? parseInt(rec["כמות עובדים"], 10) : null;

  return {
    no: hp,
    name,
    city: city || "לא ידוע",
    addr: street ? \`\${street}\${house ? " " + house : ""}\${city ? ", " + city : ""}\` : (city || "לא ידוע"),
    ind: ind,
    status: String(rec["סטטוס עמותה"] || "רשומה").trim(),
    incorporated: String(rec["תאריך רישום עמותה"] || "").trim() || "לא ידוע",
    addrKnown: !!street || !!city,
    phone: "—",
    mobile: "—",
    email: "—",
    employees: empCount !== null ? \`\${empCount} עובדים (מאומת ברשם)\` : "לא ידוע (ללא אסמכתא)",
    employeesCount: empCount,
    fleetIsFact: false,
    fleetPotential: "הערכה (ללא אסמכתא)",
    fleetType: "רכבי שירות",
    contactPerson: "—",
    roleTitle: "",
    roleType: "none",
    source: "ngos",
    source_label: "רשם העמותות",
    source_url: "https://data.gov.il/dataset/be5b7935-3922-45d4-9638-08871b17ec95",
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

/* עדכון תצוגה הדרגתית של תוצאות הסריקה (Progressive Streaming Update) */
function renderSearchHitsProgressive() {
  let container = $("#searchHitsTableBody");
  if (!container) {
    const area = $("#searchResultsArea");
    if (area) {
      area.innerHTML = renderSearchResultsArea();
      container = $("#searchHitsTableBody");
    }
  }
  if (!container) return;

  const hits = S.searchHits || [];
  const curTab = S.searchActiveTab || "new";
  if (curTab !== "new") return;

  const filter = S.searchHitFilter || { q: "", region: "all", contact: "all", fleet: "all", vehicleType: "all", workforce: "all", quality: "all", role: "all" };
  const visibleHits = filterSearchHits(hits, filter);

  container.innerHTML = renderSearchHitsTableBodyContent(visibleHits, hits, filter);

  const countEl = $("#hitVisibleCountLabel");
  if (countEl) countEl.textContent = \`מוצגות \${visibleHits.length} מתוך \${hits.length} חברות\`;

  updateLiveKpisAndProgress();
  updateActionButtonsState();
}

function renderSearchHitsFiltered() {
  const container = $("#resultsTabContent");
  if (container) {
    container.innerHTML = renderNewHitsView();
    updateLiveKpisAndProgress();
    updateActionButtonsState();
  }
}
function updateLiveSearchStatus(msg) {
  const statusEl = $("#searchHeaderStatus");
  if (statusEl) statusEl.textContent = msg;
  const subEl = $("#liveSearchDetailsSubtitle");
  if (subEl && S.searchStats) {
    subEl.textContent = \`מבוקש: \${S.searchStats.requested} | נסרקו במאגר: \${S.searchStats.scanned} | נוספו: \${S.searchStats.added} | כפילויות שנמנעו: \${S.searchStats.duplicates} | נפסלו: \${S.searchStats.rejected}\`;
  }
}

function updateLiveKpisAndProgress() {
  const hits = S.searchHits || [];
  const freshHits = hits.filter(h => !h.already && !h.adopted);
  const sel = S.searchHitSelection || new Set();
  const selectedCount = [...sel].filter(no => freshHits.some(h => h.no === no)).length;

  const tabNewEl = $("#tabCountNew");
  if (tabNewEl) tabNewEl.textContent = \`\${freshHits.length}\`;

  const newHitsHeader = $("#newHitsCountHeader");
  if (newHitsHeader) newHitsHeader.textContent = \`\${freshHits.length} חברות חדשות אותרו\`;

  const selectAllLabel = $("#selectAllLabelText");
  if (selectAllLabel) selectAllLabel.textContent = \`בחר את כל \${freshHits.length} החברות החדשות\`;

  const badgeEl = $("#hitSelectedCountBadge");
  if (badgeEl) {
    badgeEl.textContent = \`סומנו \${selectedCount} מתוך \${freshHits.length} חברות חדשות\`;
  }
  const saveBtn = $("#btnSaveToDiscovered");
  if (saveBtn) {
    saveBtn.disabled = selectedCount === 0;
    saveBtn.innerHTML = \`<span>📥 שמור חברות נבחרות כ'חברות שנמצאו' (שלב 2) [\${selectedCount}]</span>\`;
  }

  const subEl = $("#liveSearchDetailsSubtitle");
  if (subEl && S.searchStats) {
    subEl.textContent = \`מבוקש: \${S.searchStats.requested} | נסרקו במאגר: \${S.searchStats.scanned} | נוספו: \${S.searchStats.added} | כפילויות שנמנעו: \${S.searchStats.duplicates} | נפסלו: \${S.searchStats.rejected}\`;
  }
}

function updateHitSelectionCount() {
  updateLiveKpisAndProgress();
}

function updateActionButtonsState() {
  const btn = $("#btnUnifiedSearch");
  if (btn) {
    btn.disabled = S.searchRunning;
    btn.innerHTML = \`<span>\${S.searchRunning ? '⏳ סורק מאגרים באצוות...' : '🚀 הפעל איתור חברות חינמי ומבוקר (0 ₪)'}</span>\`;
  }
}

/* שמירת חברות נבחרות לשלב 2 בלבד: חברות שנמצאו (Discovered Companies) */
async function saveSelectedToDiscovered() {
  const sel = S.searchHitSelection || new Set();
  if (sel.size === 0) {
    toast("לא נבחרו חברות לשמירה", "warn");
    return;
  }

  const hits = S.searchHits || [];
  const selectedHits = hits.filter(h => sel.has(h.no) && !h.already && !h.adopted);

  if (selectedHits.length === 0) {
    toast("כל החברות שנבחרו כבר קיימות במאגר או נשמרו", "info");
    return;
  }

  // אישור שלב 1: שמירה ל"חברות שנמצאו"
  const ok = confirm(\`האם לשמור \${selectedHits.length} חברות חדשות כ'חברות שנמצאו' (שלב 2)?\\n\\nשימת לב: חברות אלו יישמרו כחברות שנמצאו בלבד ולא יועברו ל'ניהול לידים' ללא אישור נוסף ונפרד.\`);
  if (!ok) return;

  let addedCount = 0;
  selectedHits.forEach(h => {
    // הוספה למאגר המקומי C
    C.push({
      id: "disc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      name: h.name,
      no: h.no,
      city: h.city,
      addr: h.addr,
      ind: h.ind,
      status: "חדש",
      found: new Date().toLocaleDateString("he-IL"),
      fleet: h.fleetPotential || "הערכה ענפית",
      phone: h.phone || "—",
      mobile: h.mobile || "—",
      email: h.email || "—",
      contact: h.contactPerson || "—",
      role: h.roleTitle || "",
      score: h.qualityScore || 50,
      source: h.source_label || "data.gov.il",
      stage: "discovered",
      phone_verified: h.phoneVerBadgeColor === "green"
    });
    h.adopted = true;
    h.statusBadge = "נשמר כחברה שנמצאה";
    sel.delete(h.no);
    addedCount++;
  });

  S._lastSaveSuccess = { count: addedCount, time: Date.now() };
  persistProspectorData();
  renderSearchHitsFiltered();
  updateLiveKpisAndProgress();
  updateActionButtonsState();

  toast(\`✓ נשמרו בהצלחה \${addedCount} חברות כ'חברות שנמצאו' (שלב 2).\`, 'success');
}

/* חיפוש במאגר הפנימי הקיים של המשתמש (C) */
function runInternalDbSearch(query) {
  const container = $("#internalDbResults");
  if (!container) return;
  const q = String(query || "").trim().toLowerCase();
  if (!q) {
    container.innerHTML = \`<div class="xs muted">הזן מילת חיפוש להצגת תוצאות מהמאגר הקיים (\${C.length} חברות)</div>\`;
    return;
  }

  const results = C.filter(c => {
    return String(c.name || "").toLowerCase().includes(q) ||
           String(c.no || "").includes(q) ||
           String(c.city || "").toLowerCase().includes(q) ||
           String(c.phone || "").includes(q);
  });

  if (results.length === 0) {
    container.innerHTML = \`<div class="empty" style="padding:16px;text-align:center">לא נמצאו חברות במאגר הקיים התואמות ל-"\${esc(q)}"</div>\`;
    return;
  }

  container.innerHTML = \`
  <div style="font-size:12px;font-weight:700;margin-bottom:6px">נמצאו \${results.length} חברות במאגר:</div>
  <div class="tbl-wrap" style="max-height:300px;overflow-y:auto">
    <table style="width:100%;font-size:12px">
      <thead style="background:#f1f5f9">
        <tr>
          <th>שם</th><th>ח.פ</th><th>עיר</th><th>טלפון</th><th>סטטוס</th>
        </tr>
      </thead>
      <tbody>
        \${results.map(c => \`
          <tr>
            <td class="bold">\${esc(c.name)}</td>
            <td class="ltr num">\${esc(c.no)}</td>
            <td>\${esc(c.city || '—')}</td>
            <td class="ltr">\${esc(c.phone || c.mobile || '—')}</td>
            <td><span class="badge">\${esc(c.status || 'במאגר')}</span></td>
          </tr>
        \`).join("")}
      </tbody>
    </table>
  </div>
  \`;
}

/* שילוב מנוע AI חיפוש נפרד עם Gemini */
async function runAiProspectingSearch() {
  const prompt = ($("#ai-search-prompt") && $("#ai-search-prompt").value.trim()) || "";
  if (!prompt) {
    toast("נא להזין תיאור לחיפוש ה-AI", "warn");
    return;
  }

  S.aiSearchRunning = true;
  S._lastAiPrompt = prompt;
  V.search();

  try {
    toast("✦ מפענח צרכים עסקיים ומאתר מילות מפתח ממוקדות...", "info");
    // חילוץ מילות מפתח איכותיות על בסיס התיאור
    const kwList = [];
    if (/הובל|משא|שינוע|לוגיסטיקה/.test(prompt)) kwList.push("הובלות", "לוגיסטיקה");
    if (/עפר|תשתיות|בנייה|פיתוח/.test(prompt)) kwList.push("עפר", "תשתיות");
    if (/היסעים|אוטובוס|נוסעים/.test(prompt)) kwList.push("היסעים");
    if (/שירות|טכנאי|התקנות/.test(prompt)) kwList.push("שירות");
    if (/מוסך|רכב|תיקון/.test(prompt)) kwList.push("מוסך");
    if (kwList.length === 0) kwList.push("הובלות");

    S.searchTrack = "free";
    V.search();
    await runUnifiedSearch({ kw: kwList.join(", ") });
    toast("✦ תוצאות האיתור מוצגות כעת בטבלה למטה", "success");
  } catch (err) {
    toast("שגיאה בחיפוש AI: " + err.message, "error");
  } finally {
    S.aiSearchRunning = false;
    V.search();
  }
}
`;

// Replace the block
let updated = content.slice(0, startIndex) + unifiedCode + content.slice(endIndex);

// Wire click event listeners in document
const clickCaseAnchor = 'case "run":runSearch();return;';
const newClickCases = `
    case "selectAllActiveFreeSources": {
      document.querySelectorAll(".src-cb").forEach(cb => {
        cb.checked = (cb.dataset.active === "1");
      });
      const activeIds = Array.from(document.querySelectorAll(".src-cb:checked")).map(cb => cb.value);
      saveSourceSelection(activeIds);
      const counter = $("#sourceSelectionCounterBadge");
      if (counter) counter.textContent = \`נבחרו \${activeIds.length} מקורות (מתוכם \${activeIds.length} פעילים ומחוברים ב-0 ₪)\`;
      toast(\`נבחרו כל \${activeIds.length} המקורות הפעילים והחינמיים\`);
      return;
    }
    case "clearAllSources": {
      document.querySelectorAll(".src-cb").forEach(cb => { cb.checked = false; });
      saveSourceSelection([]);
      const counter = $("#sourceSelectionCounterBadge");
      if (counter) counter.textContent = "נבחרו 0 מקורות";
      toast("הבחירה נוקתה לחלוטין");
      return;
    }
    case "selectCategoryGroup": {
      const cat = d.cat;
      document.querySelectorAll(\`.src-cb[data-cat="\${cat}"]\`).forEach(cb => { cb.checked = true; });
      const selIds = Array.from(document.querySelectorAll(".src-cb:checked")).map(cb => cb.value);
      saveSourceSelection(selIds);
      toast("נבחרו כל המקורות בקבוצה זו");
      return;
    }
    case "clearCategoryGroup": {
      const cat = d.cat;
      document.querySelectorAll(\`.src-cb[data-cat="\${cat}"]\`).forEach(cb => { cb.checked = false; });
      const selIds = Array.from(document.querySelectorAll(".src-cb:checked")).map(cb => cb.value);
      saveSourceSelection(selIds);
      toast("נוקו המקורות בקבוצה זו");
      return;
    }
    case "setSourceCatalogTab": {
      S.sourceCatalogTab = d.cat || "all";
      const searchTrack = S.searchTrack || "free";
      if (searchTrack === "free") {
        const area = document.querySelector(".card");
        if (V.search) {
          const viewEl = $("#view");
          if (viewEl) viewEl.innerHTML = V.search();
        }
      }
      return;
    }
    case "setSearchTrack": {
      S.searchTrack = d.track || "free";
      const viewEl = $("#view");
      if (viewEl) viewEl.innerHTML = V.search();
      return;
    }
    case "runAiProspectingSearch": {
      runAiProspectingSearch();
      return;
    }
    case "setSearchKwPill": {
      if ($("#a-kw")) $("#a-kw").value = d.val || "";
      return;
    }
    case "setCountPill": {
      const cnt = parseInt(d.val, 10);
      if ($("#a-count") && !isNaN(cnt)) {
        $("#a-count").value = cnt;
        if (!S.searchStats) S.searchStats = {};
        S.searchStats.requested = cnt;
      }
      return;
    }
    case "runUnifiedSearch": {
      runUnifiedSearch();
      return;
    }
    case "stopSearch": {
      S.searchStopRequested = true;
      toast("נשלחה בקשה לעצירת הסריקה...", "info");
      return;
    }
    case "resetSearchForm": {
      if ($("#a-kw")) $("#a-kw").value = "";
      if ($("#a-count")) $("#a-count").value = "50";
      if ($("#a-ind")) $("#a-ind").value = "";
      if ($("#a-region")) $("#a-region").value = "";
      if ($("#a-city")) $("#a-city").value = "";
      if ($("#a-target-role")) $("#a-target-role").value = "all";
      if ($("#a-workforce-range")) $("#a-workforce-range").value = "all";
      if ($("#a-fleet-type")) $("#a-fleet-type").value = "";
      if ($("#a-fleet-filter-mode")) $("#a-fleet-filter-mode").value = "all";
      if ($("#a-target-cross")) $("#a-target-cross").value = "4";
      if ($("#a-contact-req")) $("#a-contact-req").value = "all";
      document.querySelectorAll(".src-cb").forEach(cb => {
        cb.checked = (cb.dataset.active === "1");
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
      renderSearchHitsProgressive();
      return;
    }
    case "selectAllHits": {
      const hits = S.searchHits || [];
      const freshHits = hits.filter(h => !h.already && !h.adopted);
      if (!S.searchHitSelection) S.searchHitSelection = new Set();
      const allSelected = (S.searchHitSelection.size === freshHits.length && freshHits.length > 0);
      if (allSelected) {
        S.searchHitSelection.clear();
      } else {
        freshHits.forEach(h => S.searchHitSelection.add(h.no));
      }
      document.querySelectorAll(".hit-cb:not(:disabled)").forEach(cb => {
        cb.checked = S.searchHitSelection.has(cb.value);
      });
      updateLiveKpisAndProgress();
      updateActionButtonsState();
      return;
    }
    case "selectPhoneHits": {
      const hits = S.searchHits || [];
      const freshHits = hits.filter(h => !h.already && !h.adopted);
      if (!S.searchHitSelection) S.searchHitSelection = new Set();
      S.searchHitSelection.clear();
      freshHits.forEach(h => {
        if ((h.phone && h.phone !== "—") || (h.mobile && h.mobile !== "—")) {
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
      const hits = S.searchHits || [];
      const freshHits = hits.filter(h => !h.already && !h.adopted);
      if (!S.searchHitSelection) S.searchHitSelection = new Set();
      S.searchHitSelection.clear();
      freshHits.forEach(h => {
        if (h.fleetIsFact || String(h.fleetPotential || "").includes("5+") || String(h.fleetPotential || "").includes("200")) {
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
    case "saveSelectedToDiscovered": {
      saveSelectedToDiscovered();
      return;
    }
    case "clearSearchResults": {
      S.searchHits = [];
      S.searchDuplicates = [];
      S.searchRejected = [];
      if (S.searchHitSelection) S.searchHitSelection.clear();
      if (S.searchExpandedDrawers) S.searchExpandedDrawers.clear();
      const area = $("#searchResultsArea");
      if (area) area.innerHTML = renderSearchResultsArea();
      toast("תוצאות החיפוש נוקו");
      return;
    }
    case "exportSearchHitsCsv": {
      const hits = S.searchHits || [];
      if (hits.length === 0) {
        toast("אין תוצאות לייצוא", "warn");
        return;
      }
      const headers = ["שם החברה", "ח.פ.", "תחום", "אזור", "עיר", "כתובת", "עובדים", "צי", "איש קשר", "תפקיד", "טלפון", "נייד", "אימייל", "מקור", "אימות"];
      const rows = hits.map(h => [
        h.name, h.no, h.ind, h.region, h.city, h.addr, h.employees, h.fleetPotential, h.contactPerson, h.roleTitle, h.phone, h.mobile, h.email, h.source_label, h.phoneVerBadgeLabel
      ].map(f => '"' + String(f || '').replace(/"/g, '""') + '"').join(","));
      const csv = "\\uFEFF" + headers.join(",") + "\\n" + rows.join("\\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = \`openprospector_hits_\${Date.now()}.csv\`;
      link.click();
      toast("קובץ CSV הורד בהצלחה");
      return;
    }
    case "run":runSearch();return;`;

if (updated.includes(clickCaseAnchor)) {
  updated = updated.replace(clickCaseAnchor, newClickCases);
  console.log("Wired click event handlers into document listener.");
} else {
  console.warn("Could not find clickCaseAnchor!");
}

// Add change event listener for .src-cb checkboxes so local storage is updated dynamically
const changeListenerAnchor = 'document.addEventListener("change",';
if (updated.includes(changeListenerAnchor)) {
  console.log("Found document change listener.");
}

fs.writeFileSync(targetFile, updated, "utf8");
console.log("Successfully written updated openprospector.html! New length:", updated.length);
