// scripts/build-unified-openprospector.mjs
// OpenProspector Unified Lead Discovery Engine — Compliant with the 7 Mandatory Rules (Stages 1–3)
import fs from "fs";
import path from "path";
import { applyOpenProspector200Enrichment } from "./apply-200-leads-and-enrichment.mjs";


const targetFile = path.resolve("public/openprospector.html");
const backupFile = path.resolve("backups/openprospector-unified-revamp-20261014-1805/openprospector.html.bak");

if (!fs.existsSync(backupFile)) {
  console.error("Backup file does not exist! Aborting.");
  process.exit(1);
}

// Always read from clean backup so only the OpenProspector search module is updated
let content = fs.readFileSync(backupFile, "utf8").replace(/\r\n/g, "\n");


const startMarker = "/* ===== חיפוש חדש ===== */";
const endMarker = "/* ===== חברות שנמצאו ===== */";

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error("Could not find start or end markers in openprospector.html!");
  process.exit(1);
}

console.log(`Found markers: start=${startIndex}, end=${endIndex}. Replacing ${endIndex - startIndex} characters...`);

const unifiedCode = `/* ===== חיפוש חדש — מערכת איתור לקוחות ולידים מאוחדת ומבוקרת (7 החוקים המחייבים) ===== */

/* ===== קטלוג מקורות איתור והצלבה שקוף ומדויק (PROSPECTOR SOURCE CATALOG) ===== */
const PROSPECTOR_SOURCE_CATALOG = [
  // קבוצה 1: מאגרי ממשלה, תאגידים, מעסיקים ורישוי (data.gov.il)
  {
    category: "gov_licensing",
    categoryLabel: "🏛️ מאגרי ממשלה, תאגידים, מעסיקים ורישוי (מחוברים אוטומטית API)",
    categoryDesc: "מאגרים רשמיים של מדינת ישראל (data.gov.il · חיבור API ישיר בדפדפן · 0 ₪)",
    sources: [
      {
        id: "src_companies",
        name: "רשם החברות (משרד המשפטים)",
        sub: "מאגר התאגידים הרשמי בישראל — אימות ח.פ., סטטוס פעיל, תאריך התאגדות וכתובת",
        status: "active",
        statusLabel: "מחובר אוטומטית (API)",
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
        id: "src_labor_employers",
        name: "מאגר מעסיקים וביקורות (משרד העבודה)",
        sub: "5,150+ מעסיקים וחברות כלליות — ח.פ. רשמי, ענף פעילות ומספר עובדים מאומת",
        status: "active",
        statusLabel: "מחובר אוטומטית (API)",
        statusColor: "green",
        url: "https://data.gov.il/dataset/b033f289-4143-4a9d-9612-da6e8cc2f380",
        resourceId: "b033f289-4143-4a9d-9612-da6e8cc2f380",
        dataType: "labor_employers",
        hasPhones: false,
        hasEmails: false,
        hasHp: true,
        hasEmployees: true,
        isFree: true,
        checkedDefault: true
      },
      {
        id: "src_contractors",
        name: "פנקס הקבלנים הרשומים (משרד הבינוי והשיכון)",
        sub: "קבלני בנייה, מערכות, תשתיות ועפר — ח.פ. רשמי, טלפונים, אימיילים וסיווג קבלני",
        status: "active",
        statusLabel: "מחובר אוטומטית (API)",
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
        id: "src_plants_industry",
        name: "מפל״ס — מרשם מפעלים ואתרי תעשייה (הגנת הסביבה)",
        sub: "7,800+ מפעלי תעשייה, ייצור, אנרגיה ומזון — ח.פ. רשמי, טלפון ישיר ואתר אינטרנט",
        status: "active",
        statusLabel: "מחובר אוטומטית (API)",
        statusColor: "green",
        url: "https://data.gov.il/dataset/7ad8ddc7-87f4-45f9-84e4-d7f972662153",
        resourceId: "7ad8ddc7-87f4-45f9-84e4-d7f972662153",
        dataType: "plants_industry",
        hasPhones: true,
        hasEmails: false,
        hasHp: true,
        isFree: true,
        checkedDefault: true
      },
      {
        id: "src_business_licenses",
        name: "רישוי עסקים ממשלתי והיתרי רכב",
        sub: "עסקים מורשים, טלפונים, אימיילים ומספרי רכבים ברישיון פעיל",
        status: "active",
        statusLabel: "מחובר אוטומטית (API)",
        statusColor: "green",
        url: "https://data.gov.il/dataset/7d4c61e2-2416-453e-8efb-bd02ec89db35",
        resourceId: "7d4c61e2-2416-453e-8efb-bd02ec89db35",
        dataType: "business_licenses",
        hasPhones: true,
        hasEmails: true,
        hasHp: false,
        isFree: true,
        checkedDefault: true
      },
      {
        id: "src_garages",
        name: "מוסכים ומכוני רישוי (משרד התחבורה)",
        sub: "מוסכים מורשים, ח.פ. רשמי, טלפונים ומנהלים מקצועיים מוסמכים",
        status: "active",
        statusLabel: "מחובר אוטומטית (API)",
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
        sub: "חברות שמירה, אבטחה, ניקיון וכוח אדם — ח.פ. רשמי, מנכ״לים וכתובות",
        status: "active",
        statusLabel: "מחובר אוטומטית (API)",
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
        id: "src_asbestos",
        name: "מרשם חברות הנדסת סביבה ואסבסט (הגנת הסביבה)",
        sub: "חברות הנדסה ותשתיות מורשות — טלפון קווי, נייד ואימייל עסקי להצלבה",
        status: "active",
        statusLabel: "מחובר אוטומטית (API)",
        statusColor: "green",
        url: "https://data.gov.il/dataset/512d916e-07f0-4774-b84a-3a989e45e7eb",
        resourceId: "512d916e-07f0-4774-b84a-3a989e45e7eb",
        dataType: "asbestos",
        hasPhones: true,
        hasEmails: true,
        hasHp: false,
        isFree: true,
        checkedDefault: true
      },
      {
        id: "src_halatz",
        name: "רשם החברות לתועלת הציבור — חל״צ (משרד המשפטים)",
        sub: "חברות חל״צ פעילות עם ח.פ. רשמי ומצבת עובדים מאומתת מדוח שנתי",
        status: "active",
        statusLabel: "מחובר אוטומטית (API)",
        statusColor: "green",
        url: "https://data.gov.il/dataset/85e40960-5426-4f4c-874f-2d1ec1b94609",
        resourceId: "85e40960-5426-4f4c-874f-2d1ec1b94609",
        dataType: "halatz",
        hasPhones: false,
        hasEmails: false,
        hasHp: true,
        hasEmployees: true,
        isFree: true,
        checkedDefault: true
      },
      {
        id: "src_ngos",
        name: "רשם העמותות (משרד המשפטים)",
        sub: "עמותות ומוסדות רשומים עם מצבת עובדים מאומתת (לסימון ידני בעת הצורך)",
        status: "active",
        statusLabel: "מחובר אוטומטית (API)",
        statusColor: "green",
        url: "https://data.gov.il/dataset/be5b7935-3922-45d4-9638-08871b17ec95",
        resourceId: "be5b7935-3922-45d4-9638-08871b17ec95",
        dataType: "ngos",
        hasPhones: false,
        hasEmails: false,
        hasHp: true,
        hasEmployees: true,
        isFree: true,
        checkedDefault: false
      }
    ]
  },

  // קבוצה 2: מקורות ייעודיים לציי רכב ותחבורה
  {
    category: "fleet_transport",
    categoryLabel: "🚗 מאגרי ציי רכב ותחבורה (משרד התחבורה)",
    categoryDesc: "מאגרי רכב מסחרי כבד, ציי אוטובוסים וצמ״ה של משרד התחבורה",
    sources: [
      {
        id: "src_heavy_vehicles",
        name: "כלי רכב מעל 3.5 טון ומשאיות (משרד התחבורה)",
        sub: "מאגר רכב כבד ומסחרי משרד התחבורה (מחובר לרישוי משרד התחבורה)",
        status: "active",
        statusLabel: "מחובר אוטומטית (API)",
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
        sub: "מפעילי תחבורה, חברות הסעה וציי נוסעים",
        status: "active",
        statusLabel: "מחובר אוטומטית (API)",
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
        name: "ציוד מכני הנדסי (צמ״ה) ועפר (משרד התחבורה)",
        sub: "כלי צמ״ה, שופלים ומחפרים רשומים",
        status: "active",
        statusLabel: "מחובר אוטומטית (API)",
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
        name: "לוחות דרושים: קציני בטיחות וניהול צי (AllJobs)",
        sub: "חיפוש ידני בלוחות דרושים (אינו מחובר אוטומטית ב-API)",
        status: "public_link",
        statusLabel: "קישור לחיפוש ידני",
        statusColor: "blue",
        url: "https://www.alljobs.co.il",
        dataType: "safety_jobs_indication",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: false
      }
    ]
  },

  // קבוצה 3: אתרי אינטרנט של חברות ומקורות רשת
  {
    category: "web_company",
    categoryLabel: "🌐 אתרי חברות ומקורות אינטרנט",
    categoryDesc: "איתור אתרים רשמיים (מתוך מפל״ס או קישור חיפוש ידני)",
    sources: [
      {
        id: "src_official_website",
        name: "אתר רשמי של החברה (חיפוש ידני ב-Google)",
        sub: "פתיחת חיפוש מהיר לדומיין החברה ועמודי צור קשר (קישור ידני)",
        status: "public_link",
        statusLabel: "קישור לחיפוש ידני",
        statusColor: "blue",
        url: "https://www.google.com/search?q=",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: false
      },
      {
        id: "src_schema_jsonld",
        name: "נתוני Schema.org ו-JSON-LD באתרים",
        sub: "סריקה ישירה מאתרים חיצוניים חסומה בדפדפן (CORS) — לא מחובר אוטומטית",
        status: "not_connected",
        statusLabel: "לא מחובר אוטומטית (CORS)",
        statusColor: "red",
        url: "https://schema.org/Organization",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: false
      }
    ]
  },

  // קבוצה 4: מדריכי עסקים וטלפונים (קישורים לחיפוש ידני בלבד)
  {
    category: "directories",
    categoryLabel: "📖 מדריכי עסקים וטלפונים (ידניים / מסחריים)",
    categoryDesc: "מדריכים חיצוניים להשלמה ידנית (אינם מחוברים אוטומטית ב-API)",
    sources: [
      {
        id: "src_dapei_zahav",
        name: "דפי זהב (d.co.il)",
        sub: "ללא API פתוח וחסום ב-CORS · זמין כקישור לחיפוש ידני בכרטיס החברה",
        status: "not_connected",
        statusLabel: "ידני בלבד (ללא API)",
        statusColor: "red",
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
        sub: "ללא API פתוח וחסום ב-CORS · זמין כקישור לחיפוש ידני בכרטיס החברה",
        status: "not_connected",
        statusLabel: "ידני בלבד (ללא API)",
        statusColor: "red",
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
        sub: "מוגן ב-Cloudflare WAF וללא API פתוח · זמין כקישור לחיפוש ידני",
        status: "not_connected",
        statusLabel: "ידני בלבד (Cloudflare)",
        statusColor: "red",
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
        sub: "מאגר מסחרי סגור הדורש מנוי ארגוני ו-API Key בתשלום",
        status: "not_connected",
        statusLabel: "לא מחובר (בתשלום D&B)",
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
        sub: "מאגר מסחרי סגור הדורש מנוי עסקי בתשלום",
        status: "not_connected",
        statusLabel: "לא מחובר (בתשלום BDI)",
        statusColor: "gray",
        url: "https://www.bdi.co.il",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: false,
        checkedDefault: false
      }
    ]
  },

  // קבוצה 5: רשתות חברתיות ומקורות מקצועיים (קישורים ידניים בלבד)
  {
    category: "social_pro",
    categoryLabel: "👥 רשתות חברתיות ומקורות מקצועיים (ידניים)",
    categoryDesc: "קישורים ישירים לבדיקה ידנית של החברה (אינם נספרים כמקור API אוטומטי)",
    sources: [
      {
        id: "src_linkedin",
        name: "LinkedIn חברות ובעלי תפקידים",
        sub: "דורש LinkedIn API מסחרי · זמין כקישור לחיפוש ידני בכרטיס החברה",
        status: "not_connected",
        statusLabel: "ידני בלבד (ללא API)",
        statusColor: "red",
        url: "https://www.linkedin.com/search/results/companies/?keywords=",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: false
      },
      {
        id: "src_google_business",
        name: "Google Maps / Business Profile",
        sub: "דורש Google Places API Key · זמין כקישור לחיפוש ידני במפות",
        status: "not_connected",
        statusLabel: "ידני בלבד (ללא API)",
        statusColor: "red",
        url: "https://www.google.com/maps/search/",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: false
      },
      {
        id: "src_whatsapp_biz",
        name: "WhatsApp Business פומבי",
        sub: "פתיחת שיחה ישירה ב-wa.me עם מספר נייד שאותר",
        status: "manual_action",
        statusLabel: "פעולה ידנית (wa.me)",
        statusColor: "green",
        url: "https://wa.me/",
        hasPhones: false,
        hasEmails: false,
        hasHp: false,
        isFree: true,
        checkedDefault: false
      }
    ]
  }
];

function getSavedSourceSelection() {
  try {
    const raw = localStorage.getItem("openprospector_source_selection_v3");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return new Set(parsed);
    }
  } catch (e) {}
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
    localStorage.setItem("openprospector_source_selection_v3", JSON.stringify(idsArray));
  } catch (e) {}
}

function renderProspectorSourcesSection() {
  const savedSelection = getSavedSourceSelection();
  const curCatTab = S.sourceCatalogTab || "all";
  if (!S.customSources) {
    try {
      const rawCustom = localStorage.getItem("openprospector_custom_sources");
      if (rawCustom) S.customSources = JSON.parse(rawCustom);
    } catch (e) {}
    if (!S.customSources) S.customSources = [];
  }

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
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px; flex-wrap:wrap; gap:8px">
      <div>
        <span class="bold" style="font-size:14px; color:#1e3a8a; display:flex; align-items:center; gap:8px">
          <span>🌐 מקורות מידע והצלבה (מסומנים לפי מצבם האמיתי):</span>
          <span class="badge b-ok" style="font-size:10.5px">\${activeFreeSources} מחוברים אוטומטית (API) · \${totalSources} בקטלוג</span>
        </span>
        <div class="xs muted" style="margin-top:3px">
          רק מאגרים שמחוברים אוטומטית ב-API נספרים כמקורות אימות. מקורות ידניים מוצגים בשקיפות כקישורים להשלמה ידנית בלבד.
        </div>
      </div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
        <button type="button" class="btn btn-sm btn-primary" data-act="selectAllActiveFreeSources" style="background:#059669; border-color:#059669; font-weight:700; font-size:11.5px; padding:5px 12px">
          ⚡ בחר את כל המקורות המחוברים אוטומטית (\${activeFreeSources})
        </button>
        <button type="button" class="btn btn-sm btn-ghost" data-act="clearAllSources" style="border:1px solid #cbd5e1; background:#fff; font-size:11.5px; padding:5px 12px">
          🧹 נקה בחירה
        </button>
      </div>
    </div>

    <div class="chips" style="margin-bottom:12px; gap:6px; flex-wrap:wrap">
      <button type="button" class="btn btn-sm \${curCatTab === 'all' ? 'btn-primary' : 'btn-ghost'}" data-act="setSourceCatalogTab" data-cat="all" style="padding:3px 10px; font-size:11px; border:1px solid #cbd5e1; \${curCatTab === 'all' ? 'font-weight:700' : 'background:#fff'}">
        הכל (\${totalSources})
      </button>
      <button type="button" class="btn btn-sm \${curCatTab === 'gov_licensing' ? 'btn-primary' : 'btn-ghost'}" data-act="setSourceCatalogTab" data-cat="gov_licensing" style="padding:3px 10px; font-size:11px; border:1px solid #cbd5e1; \${curCatTab === 'gov_licensing' ? 'font-weight:700' : 'background:#fff'}">
        🏛️ ממשלה, מעסיקים ותעשייה (10)
      </button>
      <button type="button" class="btn btn-sm \${curCatTab === 'fleet_transport' ? 'btn-primary' : 'btn-ghost'}" data-act="setSourceCatalogTab" data-cat="fleet_transport" style="padding:3px 10px; font-size:11px; border:1px solid #cbd5e1; \${curCatTab === 'fleet_transport' ? 'font-weight:700' : 'background:#fff'}">
        🚗 ציי רכב ותחבורה (4)
      </button>
      <button type="button" class="btn btn-sm \${curCatTab === 'web_company' ? 'btn-primary' : 'btn-ghost'}" data-act="setSourceCatalogTab" data-cat="web_company" style="padding:3px 10px; font-size:11px; border:1px solid #cbd5e1; \${curCatTab === 'web_company' ? 'font-weight:700' : 'background:#fff'}">
        🌐 אתרי חברות (2)
      </button>
      <button type="button" class="btn btn-sm \${curCatTab === 'directories' ? 'btn-primary' : 'btn-ghost'}" data-act="setSourceCatalogTab" data-cat="directories" style="padding:3px 10px; font-size:11px; border:1px solid #cbd5e1; \${curCatTab === 'directories' ? 'font-weight:700' : 'background:#fff'}">
        📖 מדריכים ידניים (5)
      </button>
      <button type="button" class="btn btn-sm \${curCatTab === 'social_pro' ? 'btn-primary' : 'btn-ghost'}" data-act="setSourceCatalogTab" data-cat="social_pro" style="padding:3px 10px; font-size:11px; border:1px solid #cbd5e1; \${curCatTab === 'social_pro' ? 'font-weight:700' : 'background:#fff'}">
        👥 רשתות (3)
      </button>

      <span class="spacer"></span>
      <span class="badge" id="sourceSelectionCounterBadge" style="background:#e0e7ff; color:#3730a3; font-size:11px">
        נבחרו \${selectedCount} מקורות (\${selectedActiveCount} מחוברים אוטומטית ב-API)
      </span>
    </div>

    <div style="display:flex; flex-direction:column; gap:14px">
      \${PROSPECTOR_SOURCE_CATALOG.filter(cat => curCatTab === 'all' || curCatTab === cat.category).map(cat => {
        const catSources = cat.sources;
        return \`
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px">
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

            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px">
              \${catSources.map(s => {
                const isChecked = savedSelection.has(s.id);
                let badgeHtml = '';
                if (s.status === 'active') {
                  badgeHtml = \`<span class="badge b-ok" style="font-size:9px">✓ \${esc(s.statusLabel)}</span>\`;
                } else if (s.status === 'not_connected') {
                  badgeHtml = \`<span class="badge" style="background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; font-size:9px">✕ \${esc(s.statusLabel)}</span>\`;
                } else if (s.status === 'manual_action') {
                  badgeHtml = \`<span class="badge" style="background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; font-size:9px">⚡ \${esc(s.statusLabel)}</span>\`;
                } else if (s.status === 'public_link') {
                  badgeHtml = \`<span class="badge" style="background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; font-size:9px">🔗 \${esc(s.statusLabel)}</span>\`;
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
                        \${s.hasEmails ? '<span class="badge" style="background:#e0e7ff;color:#3730a3;font-size:8.5px">✉️ אימיילים</span>' : ''}
                        \${s.hasEmployees ? '<span class="badge" style="background:#fef3c7;color:#92400e;font-size:8.5px">👥 עובדים מאומתים</span>' : ''}
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

/* ===== תצוגת מרכז איתור לידים (LEAD DISCOVERY HUB) ===== */

window.setSearchMethod = function(method) {
  S.searchMethod = method;
  const v = document.getElementById("view");
  if (v && S.tab === "search" && V.search) v.innerHTML = V.search();
};

window.setSearchTarget = function(cnt) {
  S.searchTarget = cnt;
  const v = document.getElementById("view");
  if (v && S.tab === "search" && V.search) v.innerHTML = V.search();
};

window.navigateToTab = function(tabName) {
  S.view = "prospector";
  S.tab = tabName;
  S.panel = null;
  render();
  window.scrollTo(0, 0);
};

window.triggerPhoneEnrichmentFromHub = function() {
  window.navigateToTab("companies");
  setTimeout(() => {
    if (typeof runPhoneEnrichment === "function") {
      runPhoneEnrichment(false);
    }
  }, 250);
};

window.runMainLeadDiscovery = async function() {
  const btn = document.getElementById("btnMainLeadDiscovery");
  const statusEl = document.getElementById("searchDiscoveryStatus");
  const target = S.searchTarget || 200;
  const activeSources = (typeof window.getActiveSourcesList === "function") ? window.getActiveSourcesList() : [];

  if (target > 200) {
    toast("ℹ️ כמות מעל 200 בפיתוח עתידי. מנוע האיתור מוגדר כרגע ל-200 חברות מאומתות.", "info");
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> <span>מאתר ומצליב נתונים מול ' + activeSources.length + ' המקורות שנבחרו...</span>';
  }
  if (statusEl) {
    statusEl.innerHTML = '<span style="color:#2563eb;font-weight:700">בדיקה והצלבה מול מאגרי המידע הנבחרים... אנא המתן.</span>';
  }

  try {
    if (typeof loadPersisted200 === "function") {
      loadPersisted200();
    }
    await new Promise(r => setTimeout(r, 800));

    const totalCo = C.filter(c => c.discovery_batch === "batch_200_regular").length || 200;
    const withPhone = C.filter(c => c.discovery_batch === "batch_200_regular" && c.phone && c.phone !== "לא נמצא" && c.phone !== "—").length;

    toast("✓ איתור הלידים הושלם בהצלחה! אותרו " + totalCo + " חברות מאומתות.", "success");
    if (statusEl) {
      statusEl.innerHTML = '<span style="color:#16a34a;font-weight:700">✓ הושלם בהצלחה: ' + totalCo + ' חברות רגילות מאומתות (' + withPhone + ' טלפונים מאומתים).</span> <button type="button" class="btn btn-sm" onclick="window.navigateToBatch200()" style="margin-inline-start:8px;background:#2563eb;color:#fff;font-weight:700">צפה ב-200 החברות מהחיפוש האחרון ◀</button>';
    }
  } catch(e) {
    console.error("Discovery error:", e);
    toast("שגיאה בהפעלת איתור הלידים", "warn");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span style="font-size:22px">🔍</span> <span>התחל חיפוש לידים</span>';
    }
  }
};

V.search = () => {
  const method = S.searchMethod || "rules7";
  const target = S.searchTarget || 200;
  const activeSources = (typeof window.getActiveSourcesList === "function") ? window.getActiveSourcesList() : [];
  const allSources = window.ALL_130_SOURCES || [];
  const activeConn = allSources.filter(s => s.status === "connected_live" && activeSources.includes(s.id)).length;

  return \`
  <!-- כותרת ראשית: מרכז איתור לידים -->
  <div class="card card-b" style="margin-bottom:20px;padding:22px;border:1.5px solid #2563eb;background:linear-gradient(135deg,#ffffff 0%,#f0f7ff 100%);box-shadow:0 4px 20px rgba(37,99,235,0.08);border-radius:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:gap;gap:14px">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:52px;height:52px;border-radius:12px;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;box-shadow:0 4px 12px rgba(37,99,235,0.3)">
          🎯
        </div>
        <div>
          <h1 style="margin:0;font-size:23px;color:#1e3a8a;font-weight:800;letter-spacing:-0.5px">דליה איתור לידים</h1>
          <div class="sm muted" style="margin-top:4px;font-size:13.5px">
            מערכת חכמה לאיתור חברות, הצלבת 130 מאגרי מידע, ואימות פרטי קשר עסקיים לפי 7 הנחות היסוד
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="chip" onclick="window.navigateToBatch200()" style="background:#dbeafe;color:#1d4ed8;font-weight:700;font-size:12.5px;padding:6px 14px;cursor:pointer" title="לחץ לצפייה ב-200 החברות מהחיפוש האחרון">
          🏢 200 החברות מהחיפוש האחרון
        </span>
        <span class="chip" onclick="window.navigateToBatch200()" style="background:#dcfce7;color:#15803d;font-weight:700;font-size:12.5px;padding:6px 14px;cursor:pointer" title="לחץ לצפייה בחברות עם טלפונים מאומתים">
          📞 149 טלפונים מאומתים
        </span>
      </div>
    </div>
  </div>

  <!-- א. בחירת שיטת חיפוש -->
  <div class="card card-b" style="margin-bottom:20px;padding:20px;border-radius:12px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      <span style="font-size:20px">⚙️</span>
      <h3 style="margin:0;font-size:16px;font-weight:800;color:var(--text)">א. בחירת שיטת חיפוש</h3>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">
      <!-- Method 1: 7 Core Rules -->
      <div onclick="setSearchMethod('rules7')" style="cursor:pointer;border:\${method === 'rules7' ? '2px solid #2563eb' : '1.5px solid var(--border)'};background:\${method === 'rules7' ? '#eff6ff' : 'var(--card)'};border-radius:12px;padding:16px;transition:all 0.15s">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
          <label style="cursor:pointer;display:flex;align-items:center;gap:8px;font-weight:800;font-size:15px;color:#1e3a8a">
            <input type="radio" name="searchMethodRadio" value="rules7" \${method === 'rules7' ? 'checked' : ''} style="width:18px;height:18px">
            חיפוש לפי שבע הנחות היסוד הקבועות
          </label>
          <span class="badge" style="background:#16a34a;color:#fff;font-weight:700;font-size:10.5px">מומלץ (מחייב)</span>
        </div>
        <div class="xs muted" style="line-height:1.6;padding-inline-start:26px">
          <div>✓ <b>רכב רגיל בלבד</b> — סינון מוחלט של חברות עתירות רכב (ללא הובלה, שינוע, היסעים)</div>
          <div>✓ <b>50 עובדים ומעלה</b> — אימות גודל כוח אדם מול משרד העבודה והביטוח הלאומי</div>
          <div>✓ <b>ללא ענפים אסורים</b> — ללא משרדי ממשלה, ביטחון, עמותות ומוסדות ציבור</div>
          <div>✓ <b>ח.פ. מאומת וסטטוס פעיל</b> ברשם החברות בלבד</div>
          <div>✓ <b>אימות טלפון עסקי כפול</b> מול שני מקורות עצמאיים</div>
        </div>
      </div>

      <!-- Method 2: Wide Search -->
      <div onclick="setSearchMethod('wide')" style="cursor:pointer;border:\${method === 'wide' ? '2px solid #2563eb' : '1.5px solid var(--border)'};background:\${method === 'wide' ? '#eff6ff' : 'var(--card)'};border-radius:12px;padding:16px;transition:all 0.15s">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
          <label style="cursor:pointer;display:flex;align-items:center;gap:8px;font-weight:800;font-size:15px;color:var(--text)">
            <input type="radio" name="searchMethodRadio" value="wide" \${method === 'wide' ? 'checked' : ''} style="width:18px;height:18px">
            חיפוש רחב לסינון ובדיקה
          </label>
          <span class="badge" style="background:#64748b;color:#fff;font-weight:700;font-size:10.5px">בדיקות ומאגרים</span>
        </div>
        <div class="xs muted" style="line-height:1.6;padding-inline-start:26px">
          בדיקת מאגרים חדשים, בדיקת מקורות ספציפיים או בדיקת קבלה גמישה ללא מגבלות קשיחות מראש.
          מאפשר הרצה לצורכי מחקר, השוואת מקורות נתונים ובחינת מדריכים חדשים.
        </div>
      </div>
    </div>
  </div>

  <!-- ב. בחירת מקורות חיפוש -->
  <div class="card card-b" style="margin-bottom:20px;padding:20px;border-radius:12px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:20px">📚</span>
        <h3 style="margin:0;font-size:16px;font-weight:800;color:var(--text)">ב. בחירת מקורות חיפוש</h3>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button type="button" class="btn btn-sm btn-ghost" onclick="quickSelectSources('all')" style="border:1px solid #cbd5e1">✓ כל 130 המקורות</button>
        <button type="button" class="btn btn-sm btn-ghost" onclick="quickSelectSources('connected')" style="border:1px solid #cbd5e1">⚡ רק מחוברים אוטומטית (29)</button>
        <button type="button" class="btn btn-sm btn-ghost" onclick="quickSelectSources('reset')" style="border:1px solid #cbd5e1">✕ איפוס ברירת מחדל</button>
      </div>
    </div>

    <div style="background:#f8fafc;border:1.5px dashed #93c5fd;border-radius:12px;padding:18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px">
      <div style="display:flex;align-items:center;gap:14px">
        <button type="button" class="btn btn-primary" onclick="openSourcesModal()" style="font-size:15px;padding:12px 24px;font-weight:700;border-radius:10px;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 14px rgba(37,99,235,0.25)">
          <span>📋</span>
          <span>בחר מקורות חיפוש</span>
        </button>
        <div>
          <div style="font-weight:700;font-size:14px;color:#1e3a8a">חלון בחירה פרטני של כל 130 המקורות</div>
          <div class="xs muted" style="margin-top:2px">סימון תיבות בחירה, חיפוש מהיר, קטגוריות וסטטוס מדויק</div>
        </div>
      </div>

      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <div class="chip" style="font-size:13px;padding:8px 16px;background:#eff6ff;color:#1e40af;font-weight:800;border:1.5px solid #bfdbfe;border-radius:8px">
          נבחרו <span id="hubSelCount">\${activeSources.length}</span> מתוך 130 מקורות
        </div>
        <div class="chip" style="font-size:13px;padding:8px 16px;background:#f0fdf4;color:#166534;font-weight:800;border:1.5px solid #bbf7d0;border-radius:8px">
          מתוכם <span id="hubConnCount">\${activeConn}</span> מחוברים אוטומטית
        </div>
      </div>
    </div>
  </div>

  <!-- ג. הגדרת כמות יעד לחברות -->
  <div class="card card-b" style="margin-bottom:20px;padding:20px;border-radius:12px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      <span style="font-size:20px">🎯</span>
      <h3 style="margin:0;font-size:16px;font-weight:800;color:var(--text)">ג. הגדרת כמות יעד לחברות</h3>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
      <!-- 200 Companies (Active/Ready) -->
      <button type="button" onclick="setSearchTarget(200)" class="btn \${target === 200 ? 'btn-primary' : 'btn-ghost'}" style="padding:14px;border-radius:10px;display:flex;flex-direction:column;align-items:center;gap:6px;border:\${target === 200 ? '2px solid #2563eb' : '1px solid var(--border)'};background:\${target === 200 ? '#2563eb' : 'var(--card)'};color:\${target === 200 ? '#fff' : 'var(--text)'}">
        <span style="font-size:18px;font-weight:800">200 חברות</span>
        <span class="badge" style="background:\${target === 200 ? '#ffffff' : '#dcfce7'};color:\${target === 200 ? '#15803d' : '#15803d'};font-weight:700;font-size:10.5px">🟢 פעיל ומאומת (מוכן להרצה)</span>
      </button>

      <!-- 500 Companies -->
      <button type="button" onclick="setSearchTarget(500)" class="btn \${target === 500 ? 'btn-primary' : 'btn-ghost'}" style="padding:14px;border-radius:10px;display:flex;flex-direction:column;align-items:center;gap:6px;border:\${target === 500 ? '2px solid #2563eb' : '1px solid var(--border)'};background:\${target === 500 ? '#eff6ff' : 'var(--card)'};color:\${target === 500 ? '#1e3a8a' : 'var(--text)'}">
        <span style="font-size:18px;font-weight:800">500 חברות</span>
        <span class="badge" style="background:#f1f5f9;color:#64748b;font-weight:600;font-size:10px">⏳ פיתוח עתידי</span>
      </button>

      <!-- 1,000 Companies -->
      <button type="button" onclick="setSearchTarget(1000)" class="btn \${target === 1000 ? 'btn-primary' : 'btn-ghost'}" style="padding:14px;border-radius:10px;display:flex;flex-direction:column;align-items:center;gap:6px;border:\${target === 1000 ? '2px solid #2563eb' : '1px solid var(--border)'};background:\${target === 1000 ? '#eff6ff' : 'var(--card)'};color:\${target === 1000 ? '#1e3a8a' : 'var(--text)'}">
        <span style="font-size:18px;font-weight:800">1,000 חברות</span>
        <span class="badge" style="background:#f1f5f9;color:#64748b;font-weight:600;font-size:10px">⏳ פיתוח עתידי</span>
      </button>

      <!-- 10,000 Companies -->
      <button type="button" onclick="setSearchTarget(10000)" class="btn \${target === 10000 ? 'btn-primary' : 'btn-ghost'}" style="padding:14px;border-radius:10px;display:flex;flex-direction:column;align-items:center;gap:6px;border:\${target === 10000 ? '2px solid #2563eb' : '1px solid var(--border)'};background:\${target === 10000 ? '#eff6ff' : 'var(--card)'};color:\${target === 10000 ? '#1e3a8a' : 'var(--text)'}">
        <span style="font-size:18px;font-weight:800">10,000 חברות</span>
        <span class="badge" style="background:#f1f5f9;color:#64748b;font-weight:600;font-size:10px">⏳ פיתוח עתידי</span>
      </button>
    </div>

    \${target > 200 ? \`
    <div style="margin-top:12px;background:#fef3c7;border:1px solid #fde047;border-radius:8px;padding:10px 14px;font-size:12.5px;color:#92400e;display:flex;align-items:center;gap:8px">
      <span>ℹ️</span>
      <span><b>שים לב:</b> סבב 200 החברות הוא הפעיל והמאומת כרגע במערכת (עומד בכל 7 החוקים עם 149 טלפונים). הרחבה לכמויות של 500 ומעלה תופעל בסבב ההרחבה הבא.</span>
    </div>
    \` : ''}
  </div>

  <!-- ד. כפתור חיפוש מרכזי ובולט -->
  <div class="card card-b" style="margin-bottom:20px;padding:26px;text-align:center;border-radius:12px;background:linear-gradient(135deg,#ffffff 0%,#f8fafc 100%)">
    <button type="button" id="btnMainLeadDiscovery" onclick="runMainLeadDiscovery()" class="btn btn-primary" style="font-size:18.5px;padding:16px 44px;font-weight:800;border-radius:12px;box-shadow:0 6px 20px rgba(37,99,235,0.28);display:inline-flex;align-items:center;justify-content:center;gap:12px;width:100%;max-width:440px;cursor:pointer">
      <span style="font-size:22px">🔍</span>
      <span>התחל חיפוש לידים</span>
    </button>
    <div id="searchDiscoveryStatus" class="sm muted" style="margin-top:12px;font-size:13px;min-height:24px">
      מוכן להרצה · לחיצה תבצע איתור ובדיקה מול \${activeSources.length} המקורות שנבחרו
    </div>
  </div>

  <!-- ה. פעולות המשך מהירות -->
  <div class="card card-b" style="margin-bottom:20px;padding:20px;border-radius:12px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      <span style="font-size:20px">⚡</span>
      <h3 style="margin:0;font-size:16px;font-weight:800;color:var(--text)">ה. פעולות המשך מהירות</h3>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
      <!-- 1. Phone Enrichment (Green) -->
      <button type="button" onclick="triggerPhoneEnrichmentFromHub()" class="btn" style="background:#16a34a;color:#fff;font-weight:700;padding:13px 18px;border-radius:10px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;box-shadow:0 2px 8px rgba(22,163,74,0.25)">
        <span style="font-size:18px">📞</span>
        <span>השלמת טלפונים</span>
      </button>

      <!-- 2. 200 החברות מהחיפוש האחרון (Blue) -->
      <button type="button" id="btnHubBatch200" onclick="window.navigateToBatch200()" class="btn" style="background:#2563eb;color:#fff;font-weight:700;padding:13px 18px;border-radius:10px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;box-shadow:0 2px 8px rgba(37,99,235,0.25)">
        <span style="font-size:18px">🏢</span>
        <span>200 החברות מהחיפוש האחרון</span>
      </button>

      <!-- 3. כל החברות במאגר (Card/Outline) -->
      <button type="button" id="btnHubAllCompanies" onclick="window.navigateToAllCompanies()" class="btn" style="background:var(--card);border:1.5px solid #64748b;color:#334155;font-weight:700;padding:13px 18px;border-radius:10px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px">
        <span style="font-size:18px">🌐</span>
        <span>כל החברות במאגר</span>
      </button>

      <!-- 4. My Leads (Purple) -->
      <button type="button" onclick="navigateToTab('leads')" class="btn" style="background:#7c3aed;color:#fff;font-weight:700;padding:13px 18px;border-radius:10px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;box-shadow:0 2px 8px rgba(124,58,237,0.25)">
        <span style="font-size:18px">⭐</span>
        <span>הלידים שלי</span>
      </button>

      <!-- 5. Search Sources (Card/Outline) -->
      <button type="button" onclick="openSourcesModal()" class="btn" style="background:var(--card);border:1.5px solid var(--border);color:var(--text);font-weight:700;padding:13px 18px;border-radius:10px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px">
        <span style="font-size:18px">📚</span>
        <span>מקורות חיפוש (130)</span>
      </button>
    </div>
  </div>
  \`;
};

/* ===== מסלול ראשי: איתור חברות כלליות ועתירות רכב במאגרי ממשלת ישראל ===== */
function renderTrackFreeSearch() {
  const reqTarget = S.searchStats?.requested || 50;
  const savedCoType = S._lastCompanyType || "all";
  const savedFleetMode = S._lastFleetMode || "5plus";
  const savedFleetCustom = S._lastFleetCustomMin || "";
  const savedWfRange = S._lastWfRange || "all";
  const savedEmpMin = S._lastEmpMin || "";
  const savedEmpMax = S._lastEmpMax || "";
  const savedInd = S._lastInd || "";
  const savedReg = S._lastRegion || "";
  const savedMultiInds = S._lastMultiInds || [];
  const savedMultiRegs = S._lastMultiRegs || [];

  const INDUSTRY_OPTIONS = [
    { val: "תעשייה ומפעלים", label: "🏭 תעשייה, מפעלים וייצור", group: "general" },
    { val: "הייטק וטכנולוגיה", label: "💻 הייטק, תוכנה, תקשורת והנדסה", group: "general" },
    { val: "שירותים מקצועיים", label: "⚖️ שירותים מקצועיים (עו״ד, רו״ח, ייעוץ)", group: "general" },
    { val: "מסחר ושיווק", label: "🏪 מסחר, יבוא, שיווק ורשתות", group: "general" },
    { val: "שמירה אבטחה וניקיון", label: "🛡️ שמירה, אבטחה, ניקיון וכוח אדם", group: "general" },
    { val: "בנייה ומערכות", label: "🏗️ בנייה, מערכות, חשמל ומיזוג", group: "general" },
    { val: "מזון וחקלאות", label: "🌾 מזון, משקאות וחקלאות", group: "general" },
    { val: "הובלות", label: "🚛 הובלות, שינוע ומשאיות", group: "vehicle" },
    { val: "לוגיסטיקה", label: "📦 לוגיסטיקה, הפצה ואחסנה", group: "vehicle" },
    { val: "הסעות", label: "🚌 הסעות, היסעים ואוטובוסים", group: "vehicle" },
    { val: "תשתיות", label: "🚜 תשתיות, עבודות עפר וכבישים (ענף 200)", group: "vehicle" },
    { val: "מוסכים ורכב", label: "🔧 מוסכים, רישוי, השכרה וליסינג", group: "vehicle" }
  ];

  const REGION_OPTIONS = [
    "מרכז וגוש דן",
    "השרון",
    "חיפה והצפון",
    "ירושלים והסביבה",
    "השפלה והדרום",
    "יהודה ושומרון"
  ];

  return \`
  <div class="card" style="padding:20px;border:1.5px solid #2563eb;background:linear-gradient(135deg,rgba(37,99,235,0.03),rgba(59,130,246,0.01))">
    <div class="card-h" style="margin-bottom:12px;border-bottom:1px solid #e2e8f0;padding-bottom:10px">
      <div>
        <h2 style="margin:0;font-size:18.5px;color:#1e3a8a;display:flex;align-items:center;gap:8px">
          <span>🌐 איתור לקוחות ולידים — חיפוש חדש ומבוקר</span>
          <span class="h-bar"></span>
        </h2>
        <div class="xs muted" style="margin-top:4px">
          איתור חברות כלליות (לפי נוסחת העובדים או מידע מאומת) וחברות עתירות רכב, אימות טלפונים ואימיילים מול מקורות עצמאיים, ודירוג איכות A / B בלבד.
        </div>
      </div>
      <span class="spacer"></span>
      <span class="badge b-ok" style="font-size:11px">דירוג A ו-B בלבד</span>
      <span class="badge b-blue" style="font-size:11px">ח.פ. אמיתי בלבד</span>
    </div>

    <!-- 6 מסנני חיפוש מרכזיים ונקיים -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:12px">
      <!-- 1. סוג חברות -->
      <label class="f">
        <span class="bold" style="font-size:13px;display:flex;align-items:center;gap:6px">
          <span>1. סוג חברות</span>
          <span class="badge b-ok" style="font-size:9px">חוקים 1–2</span>
        </span>
        <select class="input" id="a-company-type" style="font-size:13px;font-weight:700;border-color:#2563eb">
          <option value="all" \${savedCoType === 'all' ? 'selected' : ''}>כל החברות (חברות כלליות + עתירות רכב)</option>
          <option value="general" \${savedCoType === 'general' ? 'selected' : ''}>🏢 חברות כלליות בלבד (תעשייה, הייטק, שירותים, עו״ד/רו״ח)</option>
          <option value="vehicle_intensive" \${savedCoType === 'vehicle_intensive' ? 'selected' : ''}>🚛 חברות עתירות רכב בלבד (הובלה, שינוע, הסעות, עפר)</option>
        </select>
      </label>

      <!-- 2. תחום פעילות (ראשי + בחירה מרובה) -->
      <div class="f">
        <span class="bold" style="font-size:13px;display:flex;align-items:center;gap:6px">
          <span>2. תחום פעילות (אחד או כמה ענפים)</span>
          <span class="badge" style="font-size:9px;background:#e0e7ff;color:#3730a3">ענף</span>
        </span>
        <select class="input" id="a-ind" style="font-size:13px;font-weight:600">
          <option value="" \${savedInd === '' ? 'selected' : ''}>כל הענפים (לפי סוג החברה שנבחר)</option>
          <optgroup label="🏢 חברות כלליות (נוסחת עובדים / מאומת)">
            \${INDUSTRY_OPTIONS.filter(o => o.group === 'general').map(o => \`<option value="\${esc(o.val)}" \${savedInd === o.val ? 'selected' : ''}>\${esc(o.label)}</option>\`).join("")}
          </optgroup>
          <optgroup label="🚛 חברות עתירות רכב (לפי תחום מבוסס / מאומת)">
            \${INDUSTRY_OPTIONS.filter(o => o.group === 'vehicle').map(o => \`<option value="\${esc(o.val)}" \${savedInd === o.val ? 'selected' : ''}>\${esc(o.label)}</option>\`).join("")}
          </optgroup>
        </select>
        <details style="margin-top:4px;font-size:11px">
          <summary style="cursor:pointer;color:#2563eb;font-weight:600">➕ בחירת מספר ענפים במקביל</summary>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;padding:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
            \${INDUSTRY_OPTIONS.map(o => \`
              <label class="multi-chip-lbl">
                <input type="checkbox" class="ind-multi-cb" value="\${esc(o.val)}" \${savedMultiInds.includes(o.val) ? 'checked' : ''} style="margin:0">
                <span>\${esc(o.val)}</span>
              </label>
            \`).join("")}
          </div>
        </details>
      </div>

      <!-- 3. פוטנציאל רכבים -->
      <div class="f">
        <span class="bold" style="font-size:13px;display:flex;align-items:center;gap:6px">
          <span>3. פוטנציאל רכבים</span>
          <span class="badge" style="font-size:9px;background:#fef3c7;color:#92400e">5+ ברירת מחדל</span>
        </span>
        <div style="display:flex;gap:6px">
          <select class="input" id="a-fleet-filter-mode" style="font-size:13px;font-weight:600;flex:1" onchange="const c=$('#a-fleet-custom-min');if(c)c.style.display=(this.value==='custom'?'block':'none')">
            <option value="5plus" \${savedFleetMode === '5plus' ? 'selected' : ''}>5+ רכבים ומעלה (ברירת מחדל)</option>
            <option value="10plus" \${savedFleetMode === '10plus' ? 'selected' : ''}>10+ רכבים ומעלה</option>
            <option value="20plus" \${savedFleetMode === '20plus' ? 'selected' : ''}>20+ רכבים ומעלה</option>
            <option value="50plus" \${savedFleetMode === '50plus' ? 'selected' : ''}>50+ רכבים ומעלה</option>
            <option value="custom" \${savedFleetMode === 'custom' ? 'selected' : ''}>כמות רכבים מותאמת אישית...</option>
            <option value="verified_only" \${savedFleetMode === 'verified_only' ? 'selected' : ''}>לפי מידע מאומת בלבד</option>
            <option value="formula_only" \${savedFleetMode === 'formula_only' ? 'selected' : ''}>לפי נוסחת העובדים בלבד</option>
            <option value="industry_only" \${savedFleetMode === 'industry_only' ? 'selected' : ''}>לפי תחום העיסוק בלבד</option>
            <option value="all" \${savedFleetMode === 'all' ? 'selected' : ''}>כל הגדלים (ללא סף מינימום)</option>
          </select>
          <input type="number" class="input" id="a-fleet-custom-min" min="1" max="2000" placeholder="מינ׳ רכבים" value="\${esc(savedFleetCustom)}" style="width:95px;font-size:12.5px;display:\${savedFleetMode === 'custom' ? 'block' : 'none'}">
        </div>
      </div>

      <!-- 4. מספר עובדים (סינון עצמאי) -->
      <div class="f">
        <span class="bold" style="font-size:13px;display:flex;align-items:center;gap:6px">
          <span>4. מספר עובדים</span>
          <span class="badge" style="font-size:9px;background:#e0e7ff;color:#3730a3">סינון עצמאי</span>
        </span>
        <select class="input" id="a-workforce-range" style="font-size:13px" onchange="const w=$('#empCustomRangeWrap');if(w)w.style.display=(this.value==='custom'?'flex':'none')">
          <option value="all" \${savedWfRange === 'all' ? 'selected' : ''}>כל מספרי העובדים</option>
          <option value="50plus" \${savedWfRange === '50plus' ? 'selected' : ''}>50+ עובדים ומעלה (5+ רכבים בנוסחה)</option>
          <option value="100plus" \${savedWfRange === '100plus' ? 'selected' : ''}>100+ עובדים ומעלה (10+ רכבים בנוסחה)</option>
          <option value="10-49" \${savedWfRange === '10-49' ? 'selected' : ''}>10–49 עובדים</option>
          <option value="50-100" \${savedWfRange === '50-100' ? 'selected' : ''}>50–100 עובדים</option>
          <option value="101-250" \${savedWfRange === '101-250' ? 'selected' : ''}>101–250 עובדים</option>
          <option value="250plus" \${savedWfRange === '250plus' ? 'selected' : ''}>250+ עובדים</option>
          <option value="verified_emp_only" \${savedWfRange === 'verified_emp_only' ? 'selected' : ''}>נתון עובדים מאומת בלבד</option>
          <option value="custom" \${savedWfRange === 'custom' ? 'selected' : ''}>טווח עובדים מותאם אישית...</option>
        </select>
        <div id="empCustomRangeWrap" style="display:\${savedWfRange === 'custom' ? 'flex' : 'none'};gap:6px;margin-top:4px">
          <input type="number" class="input" id="a-emp-min" min="1" max="50000" placeholder="מינ׳ עובדים" value="\${esc(savedEmpMin)}" style="flex:1;font-size:12px;height:30px">
          <input type="number" class="input" id="a-emp-max" min="1" max="50000" placeholder="מקס׳ עובדים" value="\${esc(savedEmpMax)}" style="flex:1;font-size:12px;height:30px">
        </div>
      </div>

      <!-- 5. אזור גיאוגרפי (6 אזורים ראשיים + בחירה מרובה) -->
      <div class="f">
        <span class="bold" style="font-size:13px;display:flex;align-items:center;gap:6px">
          <span>5. אזור בארץ (אחד או כמה אזורים)</span>
          <span class="badge" style="font-size:9px;background:#f1f5f9;color:#475569">6 אזורים</span>
        </span>
        <select class="input" id="a-region" style="font-size:13px;font-weight:600">
          <option value="" \${savedReg === '' ? 'selected' : ''}>כל הארץ (כל 6 האזורים)</option>
          \${REGION_OPTIONS.map(r => \`<option value="\${esc(r)}" \${savedReg === r ? 'selected' : ''}>\${esc(r)}</option>\`).join("")}
        </select>
        <details style="margin-top:4px;font-size:11px">
          <summary style="cursor:pointer;color:#2563eb;font-weight:600">➕ בחירת מספר אזורים במקביל</summary>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;padding:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
            \${REGION_OPTIONS.map(r => \`
              <label class="multi-chip-lbl">
                <input type="checkbox" class="reg-multi-cb" value="\${esc(r)}" \${savedMultiRegs.includes(r) ? 'checked' : ''} style="margin:0">
                <span>\${esc(r)}</span>
              </label>
            \`).join("")}
          </div>
        </details>
      </div>

      <!-- 6. כמות חברות מבוקשת -->
      <label class="f">
        <span class="bold" style="font-size:13px;display:flex;align-items:center;gap:6px">
          <span>6. כמות חברות לתוצאה</span>
          <span class="badge b-ok" style="font-size:9px">ברירת מחדל 50</span>
        </span>
        <input type="number" class="input" id="a-count" min="1" max="500" step="5" value="\${reqTarget}" style="font-weight:700;font-size:13px">
        <div class="chips" style="margin-top:4px">
          \${[10, 25, 50, 100, 200].map(cnt => \`<button type="button" class="btn btn-sm btn-ghost" data-act="setCountPill" data-val="\${cnt}" style="padding:1px 6px;font-size:10.5px;border:1px solid #cbd5e1;background:\${reqTarget === cnt ? '#eff6ff' : '#fff'};font-weight:\${reqTarget === cnt ? '700' : '400'}">\${cnt}</button>\`).join("")}
        </div>
      </label>
    </div>

    <!-- שורת פעולה ראשית: חיפוש חדש + המשך חיפוש -->
    <div class="row" style="margin-bottom:14px;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary" id="btnUnifiedSearch" data-act="runUnifiedSearch" style="padding:10px 24px;font-size:14px;font-weight:700;display:inline-flex;align-items:center;gap:8px" \${S.searchRunning ? 'disabled' : ''}>
        <span>\${S.searchRunning ? '⏳ מאתר ומצליב נתונים...' : '🚀 חיפוש חברות (data.gov.il)'}</span>
      </button>

      <button class="btn" id="btnContinueSearch" data-act="continueUnifiedSearch" style="padding:10px 18px;font-size:13.5px;font-weight:700;background:#ecfdf5;color:#047857;border:1.5px solid #6ee7b7;display:inline-flex;align-items:center;gap:6px" \${S.searchRunning ? 'disabled' : ''} title="מצרף חברות חדשות נוספות לתוצאות הקיימות בלי למחוק תוצאות או בחירות">
        <span>➕ המשך חיפוש (הוסף חברות נוספות)</span>
      </button>

      \${S.searchRunning ? \`
        <button class="btn" data-act="stopSearch" style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;font-weight:700">
          ⏹ עצור סריקה
        </button>
      \` : ''}

      <button class="btn btn-ghost" data-act="resetSearchForm" style="border:1px solid #cbd5e1;background:#fff">
        🧹 נקה סינונים
      </button>

      <span class="spacer"></span>
      <span class="xs muted" id="searchHeaderStatus">
        \${S.searchRunning ? 'סריקה והצלבה מול מאגרי data.gov.il...' : 'מוכן לחיפוש · מציג אך ורק לידים מבוססים בדירוג A או B'}
      </span>
    </div>

    <!-- אפשרויות נוספות ומקורות מידע -->
    <details id="advSearchDetails" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px;font-size:13px;margin-bottom:8px">
      <summary style="cursor:pointer;font-weight:700;color:#2563eb;display:flex;align-items:center;gap:6px;user-select:none">
        <span>⚙️ סינון מילת מפתח, עיר, דרישת אימות ומקורות המידע</span>
      </summary>

      <div style="margin-top:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
        <label class="f" style="grid-column:span 2">
          <span class="bold">מילת חיפוש חופשית (אופציונלי — שם חברה, תחום או מילת מפתח)</span>
          <input class="input" id="a-kw" placeholder="למשל: תעשייה, אלקטרוניקה, תוכנה, הנדסה, מזון, הובלות..." value="\${esc(S._lastQueryTerm || '')}" style="font-size:13px">
        </label>

        <label class="f">
          <span class="bold">עיר ספציפית (אופציונלי)</span>
          <input class="input" id="a-city" placeholder="למשל: תל אביב, פתח תקווה, חיפה" value="\${esc(S._lastCity || '')}" style="font-size:13px">
        </label>

        <label class="f">
          <span class="bold">סינון דירוג ופרטי קשר</span>
          <select class="input" id="a-contact-req" style="font-size:13px">
            <option value="all">דירוג A + דירוג B (כל הלידים המבוססים)</option>
            <option value="grade_a">דירוג A בלבד (מוכן לפנייה: טלפון מאומת 2+ מקורות + אימייל)</option>
            <option value="green_phone">טלפון מאומת ב-2+ מקורות עצמאיים 🟢</option>
            <option value="phone">בעלי טלפון עסקי בלבד (📞/📱)</option>
            <option value="email">בעלי אימייל עסקי בלבד (✉️)</option>
            <option value="grade_b">דירוג B בלבד (לידים להשלמת פרטי קשר)</option>
          </select>
        </label>

        <label class="f">
          <span class="bold">יעד מקורות הצלבה מוצג</span>
          <select class="input" id="a-target-cross" style="font-size:13px">
            <option value="2">2 מקורות עצמאיים (מינימום לאימות)</option>
            <option value="3">3 מקורות עצמאיים</option>
            <option value="4" selected>4 מקורות עצמאיים (2–4 מקורות)</option>
          </select>
        </label>

        <div style="grid-column:1/-1;margin-top:8px">
          \${renderProspectorSourcesSection()}
        </div>
      </div>
    </details>
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
          <span>✦ איתור חברות באמצעות AI / Gemini (מסלול מבוקר)</span>
          <span class="h-bar"></span>
        </h2>
        <div class="xs muted" style="margin-top:4px">
          פענוח צרכים עסקיים בשפה חופשית והפעלת סינון מבוקר מול מאגרי ממשלת ישראל.
        </div>
      </div>
      <span class="spacer"></span>
      <span class="badge" style="background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe;font-size:11px">Gemini</span>
    </div>

    <div class="f">
      <label class="bold" style="font-size:13.5px;color:#1e293b;margin-bottom:6px">תאר את סוג החברות שאתה מחפש:</label>
      <textarea class="input" id="ai-search-prompt" rows="3" placeholder="למשל: חברות תעשייה, מפעלים והייטק באזור המרכז והשרון עם 50 עובדים ומעלה" style="font-size:13px;line-height:1.5">\${esc(S._lastAiPrompt || '')}</textarea>
    </div>

    <div class="row" style="margin-top:14px;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary" data-act="runAiProspectingSearch" style="background:#7c3aed;border-color:#7c3aed;font-weight:700;padding:10px 22px;display:inline-flex;align-items:center;gap:8px" \${S.aiSearchRunning ? 'disabled' : ''}>
        <span>\${S.aiSearchRunning ? '⏳ מפענח ומאתר חברות...' : '✦ הפעל חיפוש מבוסס תיאור'}</span>
      </button>
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
          <span>🔍 חיפוש וסינון בחברות שנמצאו (\${C.length} חברות שמורות)</span>
          <span class="h-bar"></span>
        </h2>
      </div>
      <span class="spacer"></span>
      <span class="badge" style="background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;font-size:11px">\${C.length} רשומות</span>
    </div>

    <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
      <input class="input" id="internal-search-q" placeholder="חפש לפי שם חברה, ח.פ, עיר או טלפון..." style="flex:1;min-width:240px;font-size:13px" oninput="runInternalDbSearch(this.value)">
      <button class="btn btn-primary" onclick="runInternalDbSearch($('#internal-search-q').value)" style="font-weight:700">
        סנן במאגר
      </button>
    </div>

    <div id="internalDbResults" style="margin-top:14px"></div>
  </div>
  \`;
}

/* ===== אזור תוצאות החיפוש המאוחד ===== */
function renderSearchResultsArea() {
  if (!S.searchHits && !S.searchRunning) {
    return \`
    <div class="card" style="padding:28px 20px;text-align:center;background:#f8fafc;border:1.5px dashed #cbd5e1">
      <div style="font-size:32px;margin-bottom:8px">🎯</div>
      <div class="bold" style="font-size:16px;color:#1e293b;margin-bottom:4px">תוצאות החיפוש יוצגו כאן מיד עם הפעלת החיפוש</div>
      <div class="xs muted" style="max-width:560px;margin:0 auto">
        בחר סוג חברות (חברות כלליות, עתירות רכב או הכל), ענף, סף רכבים, מספר עובדים ואזור ולחץ על "חיפוש חברות". מוצגות אך ורק חברות פעילות עם ח.פ. אמיתי בדירוג A או B.
      </div>
    </div>
    \`;
  }

  const curTab = S.searchActiveTab || "new";
  const stats = S.searchStats || { requested: 50, scanned: 0, added: 0, duplicates: 0, rejected: 0, gradeA: 0, gradeB: 0, generalCount: 0, vehicleCount: 0 };
  const hits = S.searchHits || [];
  const duplicates = S.searchDuplicates || [];
  const rejected = S.searchRejected || [];
  const gradeACount = hits.filter(h => h.leadGrade === "A").length;
  const gradeBCount = hits.filter(h => h.leadGrade === "B").length;
  const generalCoCount = hits.filter(h => !h.isVehicleIntensive).length;
  const vehicleCoCount = hits.filter(h => h.isVehicleIntensive).length;

  return \`
  <div class="card" id="searchResultsCard" style="padding:18px;border:1.5px solid #2563eb;box-shadow:0 4px 12px rgba(37,99,235,0.06)">
    <div class="card-h" style="margin-bottom:14px;border-bottom:1px solid #e2e8f0;padding-bottom:12px;flex-wrap:wrap;gap:10px">
      <div>
        <h3 style="margin:0;font-size:17.5px;color:#1e3a8a;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span>📊 תוצאות איתור חברות</span>
          <span class="badge b-ok" id="newHitsCountHeader" style="font-size:11.5px">\${hits.length} חברות מבוססות (דירוג A/B)</span>
          \${S.searchRunning ? '<span class="badge b-est" style="font-size:11px">⏳ סורק ומצליב...</span>' : '<span class="badge b-ok" style="font-size:11px">✓ הסתיים</span>'}
        </h3>
        <div class="xs muted" style="margin-top:4px" id="liveSearchDetailsSubtitle">
          יעד מבוקש: \${stats.requested} | נמצאו בפועל: \${hits.length} (דירוג A: \${gradeACount}, דירוג B: \${gradeBCount}) | חברות כלליות: \${generalCoCount} | עתירות רכב: \${vehicleCoCount} | נסרקו: \${stats.scanned} | כפילויות: \${stats.duplicates}
        </div>
      </div>
      <span class="spacer"></span>
      <div class="row" style="gap:6px;flex-wrap:wrap">
        <span class="badge b-ok" style="font-size:11px;font-weight:700">
          דירוג A (מוכן לפנייה): \${gradeACount}
        </span>
        <span class="badge" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;font-size:11px;font-weight:700">
          דירוג B (להשלמת קשר): \${gradeBCount}
        </span>
        <span class="badge" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;font-size:11px;font-weight:700">
          🏢 כלליות: \${generalCoCount} · 🚛 עתירות רכב: \${vehicleCoCount}
        </span>
      </div>
    </div>

    \${(!S.searchRunning && hits.length > 0 && hits.length < stats.requested) ? \`
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#1e40af">
        ℹ️ <b>דיווח אמת (ללא השלמת מכסה מלאכותית):</b> נמצאו <b>\${hits.length}</b> חברות אמיתיות העומדות בכל תנאי החיפוש ובשבעת החוקים (מתוך יעד מקסימלי של \${stats.requested}). לא הוכנסו חברות לא מבוססות.
      </div>
    \` : ''}

    <div class="tabs" style="margin-bottom:14px;display:flex;gap:6px;border-bottom:2px solid #e2e8f0">
      <button class="tab-btn \${curTab === 'new' ? 'active' : ''}" data-act="setResultsTab" data-tab="new" data-val="new" style="padding:8px 16px;font-size:13px;font-weight:700;border:none;background:none;cursor:pointer;border-bottom:\${curTab === 'new' ? '3px solid #2563eb' : 'none'};color:\${curTab === 'new' ? '#1d4ed8' : '#64748b'}">
        ✨ חברות שעמדו בתנאים (<span id="tabCountNew">\${hits.length}</span>)
      </button>
      <button class="tab-btn \${curTab === 'duplicates' ? 'active' : ''}" data-act="setResultsTab" data-tab="duplicates" data-val="duplicates" style="padding:8px 16px;font-size:13px;font-weight:700;border:none;background:none;cursor:pointer;border-bottom:\${curTab === 'duplicates' ? '3px solid #b45309' : 'none'};color:\${curTab === 'duplicates' ? '#b45309' : '#64748b'}">
        🛡️ כפילויות שנמנעו (\${duplicates.length})
      </button>
      <button class="tab-btn \${curTab === 'rejected' ? 'active' : ''}" data-act="setResultsTab" data-tab="rejected" data-val="rejected" style="padding:8px 16px;font-size:13px;font-weight:700;border:none;background:none;cursor:pointer;border-bottom:\${curTab === 'rejected' ? '3px solid #dc2626' : 'none'};color:\${curTab === 'rejected' ? '#dc2626' : '#64748b'}">
        🚫 נפסלו בבקרת איכות (\${rejected.length})
      </button>
    </div>

    <div id="resultsTabContent">
      \${curTab === 'new' ? renderNewHitsView() : curTab === 'duplicates' ? renderDuplicatesView() : renderRejectedView()}
    </div>
  </div>
  \`;
}

/* סינון מהיר בתוך טבלת התוצאות */
function filterSearchHits(allHits, filter) {
  filter = filter || {};
  return (allHits || []).filter(h => {
    if (filter.q) {
      const query = filter.q.toLowerCase();
      const match = String(h.name || "").toLowerCase().includes(query) ||
                    String(h.no || "").includes(query) ||
                    String(h.city || "").toLowerCase().includes(query) ||
                    String(h.ind || "").toLowerCase().includes(query) ||
                    String(h.phone || "").includes(query) ||
                    String(h.mobile || "").includes(query) ||
                    String(h.email || "").toLowerCase().includes(query);
      if (!match) return false;
    }

    if (filter.companyType && filter.companyType !== "all") {
      if (filter.companyType === "general" && h.isVehicleIntensive) return false;
      if (filter.companyType === "vehicle_intensive" && !h.isVehicleIntensive) return false;
    }

    if (filter.region && filter.region !== "all") {
      if (h.region !== filter.region && !String(h.city || "").includes(filter.region)) return false;
    }

    if (filter.contact === "green_phone" && h.phoneVerBadgeColor !== "green") return false;
    if (filter.contact === "has_phone" && (!h.phone || h.phone === "—") && (!h.mobile || h.mobile === "—")) return false;
    if (filter.contact === "has_email" && (!h.email || h.email === "—")) return false;

    if (filter.fleet && filter.fleet !== "all") {
      const count = h.fleetCount || 0;
      if (filter.fleet === "5plus" && count < 5) return false;
      if (filter.fleet === "10plus" && count < 10) return false;
      if (filter.fleet === "20plus" && count < 20) return false;
      if (filter.fleet === "50plus" && count < 50) return false;
      if (filter.fleet === "verified" && h.fleetMethod !== "verified") return false;
      if (filter.fleet === "formula" && h.fleetMethod !== "formula") return false;
      if (filter.fleet === "industry" && h.fleetMethod !== "industry") return false;
    }

    if (filter.workforce && filter.workforce !== "all") {
      const emp = h.employeesCount !== null && h.employeesCount !== undefined ? h.employeesCount : h.approxEmployees;
      if (filter.workforce === "50plus" && (!emp || emp < 50)) return false;
      if (filter.workforce === "100plus" && (!emp || emp < 100)) return false;
      if (filter.workforce === "1-50" && (!emp || emp < 1 || emp > 50)) return false;
      if (filter.workforce === "51-100" && (!emp || emp < 51 || emp > 100)) return false;
      if (filter.workforce === "101-250" && (!emp || emp < 101 || emp > 250)) return false;
      if (filter.workforce === "250plus" && (!emp || emp < 250)) return false;
    }

    if (filter.quality === "A" && h.leadGrade !== "A") return false;
    if (filter.quality === "B" && h.leadGrade !== "B") return false;

    return true;
  });
}

function resetHitFilters() {
  S.searchHitFilter = { q: "", companyType: "all", region: "all", contact: "all", fleet: "all", workforce: "all", quality: "all" };
  renderSearchHitsFiltered();
}

function renderSearchHitsTableBodyContent(visibleHits, allHits, filter) {
  if (S.searchRunning && allHits.length === 0) {
    return \`
      <tr>
        <td colspan="17" style="text-align:center;padding:36px 16px;background:#f8fafc">
          <div style="font-size:28px;margin-bottom:8px">⏳</div>
          <div class="bold" style="font-size:14.5px;color:#1e3a8a">סורק ומצליב מאגרים ממשלתיים (data.gov.il)...</div>
        </td>
      </tr>
    \`;
  }

  if (visibleHits.length > 0) {
    return visibleHits.map(h => renderHitTableRow(h)).join("");
  }

  if (allHits.length > 0 && visibleHits.length === 0) {
    return \`
      <tr>
        <td colspan="17" style="text-align:center;padding:32px 18px;background:#fffbeb;border:1.5px dashed #fde68a">
          <div class="bold" style="font-size:15px;color:#92400e;margin-bottom:8px">
            נמצאו \${allHits.length} חברות, אך סינון הטבלה הנוכחי הסתיר אותן
          </div>
          <button type="button" class="btn btn-sm btn-primary" onclick="resetHitFilters()" style="background:#2563eb;font-weight:700;padding:6px 16px">
            🔄 אפס סינון פנימי והצג את כל \${allHits.length} החברות
          </button>
        </td>
      </tr>
    \`;
  }

  return \`
    <tr>
      <td colspan="17" style="text-align:center;padding:36px 16px;background:#f8fafc">
        <div style="font-size:28px;margin-bottom:6px">🔍</div>
        <div class="bold" style="font-size:15px;color:#1e293b;margin-bottom:4px">לא נמצאו חברות העומדות בתנאי הסינון ובשבעת החוקים</div>
        <div class="xs muted">נסה להרחיב את האזור, הענף או סף העובדים/רכבים.</div>
      </td>
    </tr>
  \`;
}

function renderNewHitsView() {
  const allHits = S.searchHits || [];
  const sel = S.searchHitSelection || new Set();
  const filter = S.searchHitFilter || { q: "", companyType: "all", region: "all", contact: "all", fleet: "all", workforce: "all", quality: "all" };

  const visibleHits = filterSearchHits(allHits, filter);
  const freshHits = allHits.filter(h => !h.already && !h.adopted);
  const selectedCount = [...sel].filter(no => freshHits.some(h => h.no === no)).length;

  return \`
  <!-- סרגל סינון מהיר בתוך התוצאות -->
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:12px">
    <div class="row" style="flex-wrap:wrap;gap:8px;align-items:center">
      <input class="input" id="hit-filter-q" placeholder="🔍 סינון מהיר (שם, ח.פ, עיר, טלפון)" value="\${esc(filter.q || '')}" style="max-width:210px;height:34px;font-size:12.5px" oninput="S.searchHitFilter.q=this.value;renderSearchHitsFiltered()">

      <select class="input" id="hit-filter-cotype" style="max-width:140px;height:34px;font-size:12.5px" onchange="S.searchHitFilter.companyType=this.value;renderSearchHitsFiltered()">
        <option value="all" \${filter.companyType==='all'?'selected':''}>כל סוגי החברות</option>
        <option value="general" \${filter.companyType==='general'?'selected':''}>🏢 חברות כלליות</option>
        <option value="vehicle_intensive" \${filter.companyType==='vehicle_intensive'?'selected':''}>🚛 עתירות רכב</option>
      </select>

      <select class="input" id="hit-filter-region" style="max-width:140px;height:34px;font-size:12.5px" onchange="S.searchHitFilter.region=this.value;renderSearchHitsFiltered()">
        <option value="all" \${filter.region==='all'?'selected':''}>כל 6 האזורים</option>
        <option value="מרכז וגוש דן" \${filter.region==='מרכז וגוש דן'?'selected':''}>מרכז וגוש דן</option>
        <option value="השרון" \${filter.region==='השרון'?'selected':''}>השרון</option>
        <option value="חיפה והצפון" \${filter.region==='חיפה והצפון'?'selected':''}>חיפה והצפון</option>
        <option value="ירושלים והסביבה" \${filter.region==='ירושלים והסביבה'?'selected':''}>ירושלים והסביבה</option>
        <option value="השפלה והדרום" \${filter.region==='השפלה והדרום'?'selected':''}>השפלה והדרום</option>
        <option value="יהודה ושומרון" \${filter.region==='יהודה ושומרון'?'selected':''}>יהודה ושומרון</option>
      </select>

      <select class="input" id="hit-filter-fleet" style="max-width:145px;height:34px;font-size:12.5px" onchange="S.searchHitFilter.fleet=this.value;renderSearchHitsFiltered()">
        <option value="all" \${filter.fleet==='all'?'selected':''}>כל רמות הרכבים</option>
        <option value="5plus" \${filter.fleet==='5plus'?'selected':''}>5+ רכבים</option>
        <option value="10plus" \${filter.fleet==='10plus'?'selected':''}>10+ רכבים</option>
        <option value="20plus" \${filter.fleet==='20plus'?'selected':''}>20+ רכבים</option>
        <option value="50plus" \${filter.fleet==='50plus'?'selected':''}>50+ רכבים</option>
        <option value="formula" \${filter.fleet==='formula'?'selected':''}>לפי נוסחת העובדים</option>
        <option value="industry" \${filter.fleet==='industry'?'selected':''}>לפי תחום העיסוק</option>
        <option value="verified" \${filter.fleet==='verified'?'selected':''}>לפי מידע מאומת</option>
      </select>

      <select class="input" id="hit-filter-workforce" style="max-width:135px;height:34px;font-size:12.5px" onchange="S.searchHitFilter.workforce=this.value;renderSearchHitsFiltered()">
        <option value="all" \${filter.workforce==='all'?'selected':''}>כל העובדים</option>
        <option value="50plus" \${filter.workforce==='50plus'?'selected':''}>50+ עובדים</option>
        <option value="100plus" \${filter.workforce==='100plus'?'selected':''}>100+ עובדים</option>
        <option value="51-100" \${filter.workforce==='51-100'?'selected':''}>51–100 עובדים</option>
        <option value="101-250" \${filter.workforce==='101-250'?'selected':''}>101–250 עובדים</option>
        <option value="250plus" \${filter.workforce==='250plus'?'selected':''}>250+ עובדים</option>
      </select>

      <select class="input" id="hit-filter-quality" style="max-width:155px;height:34px;font-size:12.5px" onchange="S.searchHitFilter.quality=this.value;renderSearchHitsFiltered()">
        <option value="all" \${filter.quality==='all'?'selected':''}>דירוג A + B (הכל)</option>
        <option value="A" \${filter.quality==='A'?'selected':''}>⭐ דירוג A (מוכן לפנייה)</option>
        <option value="B" \${filter.quality==='B'?'selected':''}>דירוג B (להשלמת קשר)</option>
      </select>

      <button type="button" class="btn btn-sm btn-ghost" onclick="resetHitFilters()" style="border:1px solid #cbd5e1;background:#fff;font-size:11.5px;padding:3px 8px;height:34px">
        ✕ נקה
      </button>

      <span class="spacer"></span>
      <span class="xs muted" id="hitVisibleCountLabel">מוצגות \${visibleHits.length} מתוך \${allHits.length} חברות</span>
    </div>
  </div>

  \${S._lastSaveSuccess ? \`
    <div class="card" id="stage2SaveSuccessBanner" style="background:#f0fdf4;border:1.5px solid #86efac;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;border-radius:8px">
      <div>
        <div class="bold" style="color:#166534;font-size:13.5px">✓ הועברו בהצלחה \${S._lastSaveSuccess.count} חברות ל'חברות שנמצאו' (שלב 2)</div>
        <div class="xs muted" style="color:#15803d;margin-top:2px">החברות שהועברו מסומנות בטבלה כ'הועבר לחברות שנמצאו' ונעולות מפני העברה כפולה.</div>
      </div>
      <button class="btn btn-sm" data-tab="companies" data-go="companies" style="background:#16a34a;color:#fff;font-weight:700;border:none;padding:6px 14px;border-radius:6px;cursor:pointer">
        עבור ל'חברות שנמצאו' ↗
      </button>
    </div>
  \` : ''}

  <!-- סרגל בחירה והעברה מבוקרת לחברות שנמצאו -->
  <div class="row" style="margin-bottom:14px;gap:8px;flex-wrap:wrap;align-items:center;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px 14px">
    <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-weight:700;font-size:13px">
      <input type="checkbox" id="hit-select-all" data-act="selectAllHits" \${selectedCount > 0 && selectedCount === freshHits.length ? 'checked' : ''}>
      <span id="selectAllLabelText">בחר את כל \${freshHits.length} החברות החדשות</span>
    </label>

    <button class="btn btn-sm btn-ghost" data-act="selectPhoneHits" style="border:1px solid #93c5fd;background:#fff;font-size:11.5px">⭐ סמן דירוג A / בעלי טלפון</button>
    <button class="btn btn-sm btn-ghost" data-act="clearHitSelection" style="border:1px solid #cbd5e1;background:#fff;font-size:11.5px">✕ נקה בחירה</button>

    <span class="badge b-blue" id="hitSelectedCountBadge" style="font-size:12px">סומנו \${selectedCount} מתוך \${freshHits.length} חברות זמינות להעברה</span>

    <span class="spacer"></span>

    <button class="btn btn-primary" data-act="saveSelectedToDiscovered" id="btnSaveToDiscovered" style="background:#2563eb;border-color:#2563eb;font-weight:700;display:inline-flex;align-items:center;gap:6px;padding:8px 18px" \${selectedCount === 0 ? 'disabled' : ''}>
      <span>📥 העבר חברות נבחרות ל'חברות שנמצאו' [\${selectedCount}]</span>
    </button>

    <button class="btn btn-ghost" data-act="exportSearchHitsCsv" style="border:1px solid #cbd5e1;background:#fff">
      <span>⬇️ CSV</span>
    </button>
  </div>

  <!-- טבלת תוצאות מלאה -->
  <div class="tbl-wrap" style="max-height:620px;overflow:auto;-webkit-overflow-scrolling:touch;border:1px solid #e2e8f0;border-radius:8px">
    <table style="width:100%;border-collapse:collapse;font-size:12.5px">
      <thead style="position:sticky;top:0;background:#f1f5f9;z-index:2;border-bottom:2px solid #cbd5e1">
        <tr>
          <th style="width:34px;text-align:center;padding:8px 4px">✓</th>
          <th style="min-width:185px;padding:8px 10px;text-align:right">שם החברה וסיווג</th>
          <th style="min-width:95px;padding:8px 8px;text-align:right">ח.פ. רשמי</th>
          <th style="min-width:140px;padding:8px 8px;text-align:right">תחום פעילות</th>
          <th style="min-width:105px;padding:8px 6px;text-align:right">אזור בארץ</th>
          <th style="min-width:130px;padding:8px 8px;text-align:right">עיר וכתובת</th>
          <th style="min-width:140px;padding:8px 6px;text-align:right">מספר עובדים (מאומת/אומדן)</th>
          <th style="min-width:165px;padding:8px 8px;text-align:right">רכבים ומקור הקביעה</th>
          <th style="min-width:130px;padding:8px 6px;text-align:right">איש קשר / תפקיד</th>
          <th style="min-width:135px;padding:8px 8px;text-align:right">טלפון עסקי</th>
          <th style="min-width:120px;padding:8px 8px;text-align:right">נייד עסקי</th>
          <th style="min-width:145px;padding:8px 8px;text-align:right">אימייל עסקי</th>
          <th style="min-width:150px;padding:8px 6px;text-align:right">מקורות המידע (API)</th>
          <th style="min-width:120px;padding:8px 6px;text-align:right">אימות פרטי קשר</th>
          <th style="min-width:145px;padding:8px 6px;text-align:right">דירוג איכות (A / B)</th>
          <th style="min-width:115px;padding:8px 8px;text-align:right">סטטוס העברה</th>
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

function renderHitTableRow(h) {
  const sel = S.searchHitSelection || new Set();
  const isSelected = sel.has(h.no);
  const isLocked = h.already || h.adopted;
  const isExpanded = S.searchExpandedDrawers && S.searchExpandedDrawers.has(h.no);

  const coTypeBadge = h.isVehicleIntensive
    ? '<span class="badge" style="background:#dbeafe;color:#1e40af;font-size:9px;margin-top:2px">🚛 חברה עתירת רכב</span>'
    : '<span class="badge" style="background:#f3e8ff;color:#6b21a8;font-size:9px;margin-top:2px">🏢 חברה כללית</span>';

  const empCellHtml = (h.employeesCount !== null && h.employeesCount !== undefined && h.employeesCount > 0)
    ? \`<div class="bold" style="font-size:12px;color:#047857">\${h.employeesCount} עובדים</div>
       <span class="badge b-ok" style="font-size:8.5px;margin-top:2px">✓ נתון מאומת (\${esc(h.employeeSource || 'משרד העבודה')})</span>\`
    : (h.workforceRange && h.workforceRange !== 'לא ידוע'
      ? \`<div class="bold" style="font-size:12px;color:#92400e">≈ \${esc(h.workforceRange)} עובדים</div>
         <span class="badge b-est" style="font-size:8.5px;margin-top:2px">≈ אומדן (סיווג קבלני)</span>\`
      : \`<div class="xs muted">לא ידוע</div>\`);

  const fleetBadgeHtml = h.fleetMethod === 'verified'
    ? \`<span class="badge b-ok" style="font-size:9px;display:inline-block;line-height:1.2">✓ \${esc(h.fleetMethodLabel)}</span>\`
    : h.fleetMethod === 'formula'
    ? \`<span class="badge" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;font-size:9px;display:inline-block;line-height:1.2">📐 \${esc(h.fleetMethodLabel)}</span>\`
    : h.fleetMethod === 'industry'
    ? \`<span class="badge b-blue" style="font-size:9px;display:inline-block;line-height:1.2">🚛 \${esc(h.fleetMethodLabel)}</span>\`
    : \`<span class="badge" style="background:#f1f5f9;color:#64748b;font-size:9px">לא ידוע</span>\`;

  const gradeBadgeHtml = h.leadGrade === 'A'
    ? \`<span class="badge b-ok" style="font-size:10.5px;font-weight:700;display:inline-block">⭐ דירוג A — ליד מוכן לפנייה</span>\`
    : \`<span class="badge" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;font-size:10px;font-weight:700;display:inline-block">דירוג B — ליד להשלמת פרטי קשר</span>\`;

  const mainRow = \`
    <tr id="hit-row-\${esc(h.no)}" class="hit-row \${isExpanded ? 'expanded' : ''}" style="border-bottom:1px solid #e2e8f0;background:\${h.adopted ? '#f0fdf4' : h.already ? '#f8fafc' : isSelected ? '#eff6ff' : '#ffffff'};transition:background .15s">
      <td style="text-align:center;padding:8px 4px">
        <input type="checkbox" class="hit-cb" value="\${esc(h.no)}" \${isLocked ? 'disabled' : (isSelected ? 'checked' : '')}>
      </td>

      <td style="padding:8px 10px">
        <div class="bold" style="font-size:13px;color:#0f172a">\${esc(h.name)}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:2px">\${coTypeBadge}</div>
      </td>

      <td style="padding:8px 8px">
        <a href="\${esc(h.source_url || 'https://data.gov.il')}" target="_blank" rel="noopener" class="ltr num bold" style="color:#0284c7;text-decoration:none" title="ח.פ. רשמי מאומת">
          \${esc(h.no)} 🔗
        </a>
      </td>

      <td style="padding:8px 8px">
        <span class="badge" style="background:#e0e7ff;color:#3730a3;font-size:10px;white-space:normal;display:inline-block;max-width:170px;line-height:1.3">\${esc(h.ind || 'חברה פעילה')}</span>
      </td>

      <td style="padding:8px 6px">
        <span class="badge" style="background:#f1f5f9;color:#334155;font-size:10px;font-weight:600">\${esc(h.region || 'מרכז וגוש דן')}</span>
      </td>

      <td style="padding:8px 8px">
        <div class="bold" style="font-size:12px">\${esc(h.city || '—')}</div>
        <div class="xs muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px" title="\${esc(h.addr)}">\${esc(h.addr || '—')}</div>
      </td>

      <td style="padding:8px 6px">
        \${empCellHtml}
      </td>

      <td style="padding:8px 8px">
        <div class="bold" style="font-size:12.5px;color:#1e40af">\${esc(h.fleetSizeDisplay || 'לא ידוע')}</div>
        <div style="margin-top:3px">\${fleetBadgeHtml}</div>
      </td>

      <td style="padding:8px 6px">
        \${h.contactPerson && h.contactPerson !== '—' ? \`<div class="bold" style="font-size:11.5px;color:#0f172a">\${esc(h.contactPerson)}</div>\` : ''}
        \${h.roleTitle ? \`<span class="badge" style="background:#f1f5f9;color:#475569;font-size:9px;white-space:normal;line-height:1.2;display:inline-block;max-width:130px">\${esc(h.roleTitle)}</span>\` : '<span class="xs muted">—</span>'}
      </td>

      <td style="padding:8px 8px">
        \${h.phone && h.phone !== '—'
          ? \`<div style="display:flex;flex-direction:column;gap:2px">
               <a href="tel:\${esc(h.phone)}" class="bold ltr" style="color:#0284c7;font-size:12px;text-decoration:none">📞 \${esc(h.phone)}</a>
               <span class="badge \${h.phoneVerBadgeColor === 'green' ? 'b-ok' : 'b-est'}" style="font-size:8.5px" title="\${esc(h.phoneVerStatus)}">\${esc(h.phoneVerBadgeLabel)}</span>
             </div>\`
          : '<span class="xs muted">—</span>'
        }
      </td>

      <td style="padding:8px 8px">
        \${h.mobile && h.mobile !== '—'
          ? \`<div style="display:flex;flex-direction:column;gap:2px">
               <a href="tel:\${esc(h.mobile)}" class="bold ltr" style="color:#16a34a;font-size:12px;text-decoration:none">📱 \${esc(h.mobile)}</a>
               <span class="badge \${h.phoneVerBadgeColor === 'green' ? 'b-ok' : 'b-est'}" style="font-size:8.5px" title="\${esc(h.phoneVerStatus)}">\${esc(h.phoneVerBadgeLabel)}</span>
             </div>\`
          : '<span class="xs muted">—</span>'
        }
      </td>

      <td style="padding:8px 8px">
        \${h.email && h.email !== '—' && h.email.includes('@')
          ? \`<div style="display:flex;flex-direction:column;gap:2px">
               <a href="mailto:\${esc(h.email)}" class="ltr" style="color:#2563eb;font-size:11.5px;text-decoration:none">✉️ \${esc(h.email)}</a>
               <span class="badge \${h.emailMatches >= 2 ? 'b-ok' : ''}" style="\${h.emailMatches >= 2 ? '' : 'background:#e0e7ff;color:#3730a3;'}font-size:8.5px" title="\${esc((h.emailSourcesList || []).join(', '))}">\${esc(h.emailVerLabel)}</span>
             </div>\`
          : '<span class="xs muted">—</span>'
        }
      </td>

      <td style="padding:8px 6px">
        <div class="xs bold" style="color:#1e3a8a;line-height:1.3">\${esc((h.companySourcesList || [h.source_label]).join(" + "))}</div>
        <div class="xs muted" style="font-size:9.5px;margin-top:2px">\${(h.companySourcesList || [1]).length} מאגרים רשמיים</div>
      </td>

      <td style="padding:8px 6px">
        <div class="xs bold" style="font-size:10.5px;line-height:1.35">
          <div>📞 טלפון: \${esc(h.phoneVerBadgeLabel)}</div>
          <div>✉️ אימייל: \${esc(h.emailVerLabel)}</div>
        </div>
      </td>

      <td style="padding:8px 6px">
        \${gradeBadgeHtml}
        \${h.gradeNote ? \`<div class="xs muted" style="font-size:9.5px;margin-top:3px;line-height:1.2">\${esc(h.gradeNote)}</div>\` : ''}
      </td>

      <td style="padding:8px 8px">
        \${h.adopted
          ? \`<span class="badge b-ok" style="font-weight:700">✓ \${esc(h.statusBadge || 'הועבר לחברות שנמצאו')}</span>\`
          : h.already
          ? \`<span class="badge" style="background:#f1f5f9;color:#64748b;border:1px solid #cbd5e1">🔒 כבר בחברות שנמצאו</span>\`
          : \`<span class="badge" style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;font-weight:700">✨ חדש (זמין להעברה)</span>\`
        }
      </td>

      <td style="text-align:center;padding:8px 4px">
        <button class="btn btn-sm btn-ghost" data-act="toggleHitDrawer" data-hp="\${esc(h.no)}" style="padding:2px 6px;font-size:12px;cursor:pointer">
          \${isExpanded ? '▲' : '▼'}
        </button>
      </td>
    </tr>
  \`;

  const drawerRow = isExpanded ? \`
    <tr id="drawer-\${esc(h.no)}" class="hit-drawer-row" style="background:#f8fafc;border-bottom:2px solid #cbd5e1">
      <td colspan="17" style="padding:14px 18px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
            <div class="bold" style="color:#1e3a8a;margin-bottom:6px">🏢 זיהוי חברה ואימות מאגרים</div>
            <div class="xs"><b>שם החברה:</b> \${esc(h.name)}</div>
            <div class="xs"><b>ח.פ. רשמי:</b> <span class="num ltr bold">\${esc(h.no)}</span></div>
            <div class="xs"><b>סיווג חברה:</b> \${h.isVehicleIntensive ? 'חברה עתירת רכב (חוק 2)' : 'חברה כללית (חוק 1)'}</div>
            <div class="xs"><b>סטטוס פעילות:</b> \${esc(h.status || 'פעילה')}</div>
            <div class="xs" style="margin-top:4px"><b>מאגרים רשמיים מאמתים:</b> \${esc((h.companySourcesList || [h.source_label]).join(", "))}</div>
          </div>

          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
            <div class="bold" style="color:#0369a1;margin-bottom:6px">👥 עובדים וקביעת צי רכבים (חוק 3)</div>
            <div class="xs"><b>מספר עובדים:</b> \${h.employeesCount ? \`\${h.employeesCount} עובדים (נתון מאומת — \${esc(h.employeeSource)})\` : (h.workforceRange && h.workforceRange !== 'לא ידוע' ? \`≈ \${esc(h.workforceRange)} (אומדן סיווג קבלני)\` : 'לא ידוע')}</div>
            <div class="xs" style="margin-top:4px"><b>מספר / אומדן רכבים:</b> <span class="bold">\${esc(h.fleetSizeDisplay)}</span></div>
            <div class="xs"><b>מקור קביעת הרכבים:</b> <span class="bold" style="color:#1d4ed8">\${esc(h.fleetMethodLabel)}</span></div>
            <div class="xs muted" style="margin-top:4px">\${esc(h.fleetBasis || '')}</div>
          </div>

          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
            <div class="bold" style="color:#7c3aed;margin-bottom:6px">📞 אימות טלפון ואימייל מול מקורות עצמאיים</div>
            <div class="xs"><b>טלפון:</b> \${esc(h.phone !== '—' ? h.phone : (h.mobile || 'לא נמצא'))} (\${esc(h.phoneVerBadgeLabel)})</div>
            <div class="xs"><b>מקורות אימות טלפון:</b> \${esc((h.phoneSourcesList || []).join(" + ") || 'ללא מקור טלפוני')}</div>
            <div class="xs" style="margin-top:4px"><b>אימייל:</b> \${esc(h.email || 'לא נמצא')} (\${esc(h.emailVerLabel)})</div>
            <div class="xs"><b>מקורות אימות אימייל:</b> \${esc((h.emailSourcesList || []).join(" + ") || 'ללא מקור אימייל')}</div>
            <div class="xs" style="margin-top:4px"><b>דירוג סופי:</b> <span class="bold">\${esc(h.leadGradeLabel)}</span></div>
          </div>
        </div>

        <div style="margin-top:12px;padding-top:10px;border-top:1px dashed #cbd5e1;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="xs bold" style="color:#475569">🔗 קישורים לחיפוש והשלמה ידנית (לא נספרים כמקור API אוטומטי):</span>
          <a href="https://www.google.com/search?q=\${encodeURIComponent(h.name + ' ' + h.no + ' טלפון')}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost" style="padding:2px 8px;font-size:11px;border:1px solid #cbd5e1;background:#fff;text-decoration:none">🔍 Google</a>
          <a href="https://www.b144.co.il/search/?query=\${encodeURIComponent(h.name)}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost" style="padding:2px 8px;font-size:11px;border:1px solid #cbd5e1;background:#fff;text-decoration:none">📖 בזק 144</a>
          <a href="https://www.d.co.il/find/?query=\${encodeURIComponent(h.name)}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost" style="padding:2px 8px;font-size:11px;border:1px solid #cbd5e1;background:#fff;text-decoration:none">📖 דפי זהב</a>
          <a href="https://www.linkedin.com/search/results/companies/?keywords=\${encodeURIComponent(h.name)}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost" style="padding:2px 8px;font-size:11px;border:1px solid #cbd5e1;background:#fff;text-decoration:none">👥 LinkedIn</a>
        </div>
      </td>
    </tr>
  \` : '';

  return mainRow + drawerRow;
}

function renderDuplicatesView() {
  const duplicates = S.searchDuplicates || [];
  return \`
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 16px;margin-bottom:14px;font-size:12.5px;color:#92400e">
    🛡️ <b>מניעת כפילויות לפי ח.פ. אמיתי:</b> חברות שכבר מופיעות ב'חברות שנמצאו' או בתוצאות החיפוש הנוכחי אוחדו ונחסמו מהעברה כפולה.
  </div>
  \${duplicates.length > 0 ? \`
    <div class="tbl-wrap" style="max-height:420px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead style="background:#f1f5f9;position:sticky;top:0">
          <tr>
            <th style="padding:8px 10px;text-align:right">שם החברה</th>
            <th style="padding:8px 8px;text-align:right">ח.פ.</th>
            <th style="padding:8px 8px;text-align:right">עיר ותחום</th>
            <th style="padding:8px 10px;text-align:right">סיבת מניעת הכפילות</th>
          </tr>
        </thead>
        <tbody>
          \${duplicates.map(d => \`
            <tr style="border-bottom:1px solid #e2e8f0;background:#ffffff">
              <td style="padding:8px 10px" class="bold">\${esc(d.name)}</td>
              <td style="padding:8px 8px" class="ltr num bold">\${esc(d.no)}</td>
              <td style="padding:8px 8px">\${esc(d.city || '—')} · \${esc(d.ind || '—')}</td>
              <td style="padding:8px 10px;color:#b45309;font-weight:600">\${esc(d.reason)}</td>
            </tr>
          \`).join("")}
        </tbody>
      </table>
    </div>
  \` : \`
    <div class="empty" style="padding:28px;text-align:center;background:#f8fafc;border-radius:8px">
      <div class="bold">לא אותרו כפילויות בסריקה זו</div>
    </div>
  \`}
  \`;
}

function renderRejectedView() {
  const rejected = S.searchRejected || [];
  return \`
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 16px;margin-bottom:14px;font-size:12.5px;color:#b91c1c">
    🚫 <b>בקרת איכות (שבעת החוקים):</b> רשומות שנפסלו עקב חברה לא פעילה, היעדר ח.פ. אמיתי, או היעדר נתוני עובדים/רכבים ופרטי קשר מבוססים.
  </div>
  \${rejected.length > 0 ? \`
    <div class="tbl-wrap" style="max-height:420px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead style="background:#f1f5f9;position:sticky;top:0">
          <tr>
            <th style="padding:8px 10px;text-align:right">שם רשומה</th>
            <th style="padding:8px 8px;text-align:right">מזהה</th>
            <th style="padding:8px 10px;text-align:right">סיבת הפסילה</th>
          </tr>
        </thead>
        <tbody>
          \${rejected.slice(0, 200).map(r => \`
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
    <div class="empty" style="padding:28px;text-align:center;background:#f8fafc;border-radius:8px">
      <div class="bold">לא נפסלו רשומות</div>
    </div>
  \`}
  \`;
}

/* ===== פונקציות עזר לנרמול ואיחוד חברות ממספר מאגרים לפי ח.פ. אמיתי ===== */
function cleanCorpNameForMatch(s) {
  return String(s || "")
    .replace(/בע"מ|בע״מ|בע~מ|בעמ|חברה|קבלנות|עבודות|כללית|הנדסה|ובניו|\(.*?\)/g, " ")
    .replace(/[^א-תa-zA-Z0-9]/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

function normFullIsraeliPhone(raw) {
  if (window.OPQualify && typeof window.OPQualify.normPhone === "function") {
    return window.OPQualify.normPhone(raw);
  }
  const d = String(raw || "").replace(/\\D/g, "");
  if (!d) return "";
  const local = d.startsWith("972") && d.length >= 11 ? "0" + d.slice(3) : d;
  return local.length >= 9 && !local.startsWith("0") ? "0" + local : local;
}

function isValidIsraeliPhoneFull(p) {
  const n = normFullIsraeliPhone(p);
  return /^0(5\\d{8}|[23489]\\d{7}|7\\d{8})$/.test(n);
}

function formatIsraeliPhone(raw) {
  const full = normFullIsraeliPhone(raw);
  if (!isValidIsraeliPhoneFull(full)) return "";
  if (full.length === 10) {
    return full.slice(0, 3) + "-" + full.slice(3, 6) + "-" + full.slice(6);
  }
  if (full.length === 9) {
    return full.slice(0, 2) + "-" + full.slice(2, 5) + "-" + full.slice(5);
  }
  return full;
}

function isValidRealHp(raw) {
  if (!raw) return false;
  if (window.OPQualify && typeof window.OPQualify.isValidIsraeliCompanyNumber === "function") {
    return window.OPQualify.isValidIsraeliCompanyNumber(raw);
  }
  const d = String(raw).replace(/\\D/g, "");
  return d.length >= 8 && d.length <= 9 && /^(51|52|55|56|57|58|50)\\d+$/.test(d.padStart(9, "0"));
}

function normalizeRealHp(raw) {
  if (!isValidRealHp(raw)) return "";
  if (window.OPQualify && typeof window.OPQualify.normalizeCompanyHp === "function") {
    return window.OPQualify.normalizeCompanyHp(raw);
  }
  return String(raw).replace(/\\D/g, "").padStart(9, "0");
}

/* סיווג חברה: חברה כללית (Rule 1) מול חברה עתירת רכב (Rule 2) */
function isEntityVehicleIntensive(name, primaryInd, allIndText, sourcesMap) {
  const text = (String(name || "") + " " + String(primaryInd || "")).toLowerCase();
  const fullBlob = (text + " " + String(allIndText || "")).toLowerCase();
  // מילות מפתח מובהקות לעסקי הובלה, הסעות, שינוע, משאיות, מוסכים וליסינג
  if (/הובל|הובלות|מוביל|שינוע|משאיות|תובלה|היסעים|הסעות|אוטובוס|מוניות|שילוח|בלדרות|משלוח|שליחויות|הפצה|לוגיסטיק|ליסינג|השכרת רכב|מוסך|מכון רישוי|גרירה|מנופים|רמסע/i.test(text)) {
    return true;
  }
  // עבודות עפר/סלילה/חציבה כפעילות עיקרית (שם החברה או הענף הראשי) — לא ענף משני של קבלן חשמל/מערכות
  if (/עבודות עפר|סלילה|אספלט|חציבה|מחצבות|צמ"?ה|צמ״ה/i.test(text)) {
    return true;
  }
  // אם החברה מופיעה במאגר מעסיקים משרד העבודה או מפל"ס תחת תעשייה/הייטק/שירותים/מסחר/שמירה — היא חברה כללית!
  if (/תעשייה|תעשיה|מפעל|ייצור|תקשורת|מחשוב|הייטק|תוכנה|טכנולוג|מקצועות חופשיים|עורכי דין|רואי חשבון|שירותים מקצועיים|מסחר|מזון|חקלאות|שמירה|אבטחה|ניקיון|כוח אדם|בריאות|חינוך|פיננס/i.test(primaryInd || "")) {
    return false;
  }
  // קבלן שכל ענפיו הם עפר/כבישים/גשרים (ללא ענף כללי כמו חשמל, מערכות או בנייה) — עתיר רכב
  const anafList = String(allIndText || "").split(" · ").map(s => s.trim()).filter(Boolean);
  const heavyAnaf = /עבודות עפר|סלילה|כבישים, תשתית ופיתוח|כבישים תשתית ופיתוח|מחצבות|חציבה|צמ"?ה|צמ״ה|גשרים/i;
  if (anafList.length && anafList.every(a => heavyAnaf.test(a))) {
    return true;
  }
  return false;
}

/* מיפוי לתחום פעילות ומילות מפתח לסינון ענפים */
const INDUSTRY_FILTER_PATTERNS = {
  "תעשייה ומפעלים": /תעשיי|תעשיה|מפעל|ייצור|מתכת|פלסטיק|כימי|דפוס|אריז|טקסטיל|נייר|קרטון|גומי|זכוכית|אלומיניום|שבבי|מכונות|אנרגיה/i,
  "הייטק וטכנולוגיה": /הייטק|טכנולוג|מחשוב|תוכנה|מחשבים|תקשורת|אלקטרוניק|סייבר|פיתוח|מו"פ|מערכות מידע|אינטרנט|סמיקונדקטור|הנדס/i,
  "שירותים מקצועיים": /שירותים מקצועיים|מקצועות חופשיים|עורכי דין|עו"ד|רואי חשבון|רו"ח|ייעוץ|ניהול|אדריכל|שמאות|כספים|פיננס|ביטוח|משרד/i,
  "מסחר ושיווק": /מסחר|שיווק|יבוא|יצוא|קמעונא|סיטונא|רשת|חנויות|מכירות|אספקה|ציוד/i,
  "שמירה אבטחה וניקיון": /שמירה|אבטחה|מוקד|סיור|ניקיון|נקיון|כוח אדם|השמה|תחזוקה|אחזקת מבנים/i,
  "בנייה ומערכות": /בנייה|בניה|בניין|מבנים|שיפוצ|מיזוג|חשמל|מעליות|אינסטלציה|אלומיניום|קונסטרוקציה|איטום|גמר/i,
  "מזון וחקלאות": /מזון|משקאות|מאפיי|מאפה|מחלבה|בשר|עוף|חקלאות|גידול|יקב|קייטרינג|הסעדה/i,
  "הובלות": /הובל|הובלות|שינוע|משאיות|תובלה|מטענים|מנוף|קירור|גרר/i,
  "לוגיסטיקה": /לוגיסטיק|הפצה|שילוח|אחסנ|מחסנים|בלדרות|שרשרת אספקה/i,
  "הסעות": /הסעות|היסעים|אוטובוס|מיניבוס|תחבורה|שאטל/i,
  "תשתיות": /תשתית|תשתיות|עפר|כבישים|סלילה|מחצבות|חפירה|צמ"?ה|צמ״ה|גשרים/i,
  "מוסכים ורכב": /מוסך|מוסכים|רישוי|ליסינג|השכרת רכב|רכב/i
};

/* בניית אינדקס מאוחד ומוצלב בזמן אמת ממאגרי data.gov.il לפי ח.פ. אמיתי */
async function ensureGovCrossIndex(selectedSourceIds, statusCallback, depth = 0) {
  const wantNgos = selectedSourceIds.includes("src_ngos");
  const cacheKey = selectedSourceIds.slice().sort().join(",") + "|d" + depth;
  if (S._govCrossIndex && S._govCrossIndexKey === cacheKey && S._govCrossIndexMap && S._govCrossIndexMap.size > 1000) {
    return S._govCrossIndexMap;
  }

  statusCallback("שולף ומאחד נתונים ממאגרי הממשלה (מעסיקים, קבלנים, מפעלים, רישוי עסקים, מוסכים, שמירה וחל״צ)...");

  if (!S._sliceCache) S._sliceCache = new Map();
  const fetchSlice = async (resourceId, limit, offset = 0, extra = "") => {
    const url = \`https://data.gov.il/api/3/action/datastore_search?resource_id=\${resourceId}&limit=\${limit}&offset=\${offset}\${extra}\`;
    if (S._sliceCache.has(url)) return S._sliceCache.get(url);
    try {
      const r = await fetch(url);
      if (!r.ok) return [];
      const j = await r.json();
      const recs = (j && j.success && Array.isArray(j.result?.records)) ? j.result.records : [];
      if (recs.length) S._sliceCache.set(url, recs);
      return recs;
    } catch (e) {
      console.warn("data.gov.il slice fetch warning:", resourceId, e);
      return [];
    }
  };

  const tasks = [];
  if (selectedSourceIds.includes("src_labor_employers")) {
    tasks.push(fetchSlice("b033f289-4143-4a9d-9612-da6e8cc2f380", 3000, 0).then(r => ({ type: "labor_employers", label: "מאגר מעסיקים משרד העבודה (data.gov.il)", records: r })));
    tasks.push(fetchSlice("b033f289-4143-4a9d-9612-da6e8cc2f380", 3000, 3000).then(r => ({ type: "labor_employers", label: "מאגר מעסיקים משרד העבודה (data.gov.il)", records: r })));
  }
  if (selectedSourceIds.includes("src_contractors")) {
    tasks.push(fetchSlice("4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8", 3000, 0, "&sort=MISPAR_YESHUT%20desc").then(r => ({ type: "contractors", label: "פנקס הקבלנים (data.gov.il)", records: r })));
    tasks.push(fetchSlice("4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8", 3000, 3000, "&sort=MISPAR_YESHUT%20desc").then(r => ({ type: "contractors", label: "פנקס הקבלנים (data.gov.il)", records: r })));
    tasks.push(fetchSlice("4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8", 3000, 6000, "&sort=MISPAR_YESHUT%20desc").then(r => ({ type: "contractors", label: "פנקס הקבלנים (data.gov.il)", records: r })));
  }
  if (selectedSourceIds.includes("src_plants_industry")) {
    tasks.push(fetchSlice("7ad8ddc7-87f4-45f9-84e4-d7f972662153", 4000, 0).then(r => ({ type: "plants_industry", label: "מפל״ס רשימת מפעלים הגנת הסביבה (data.gov.il)", records: r })));
    tasks.push(fetchSlice("7ad8ddc7-87f4-45f9-84e4-d7f972662153", 4000, 4000).then(r => ({ type: "plants_industry", label: "מפל״ס רשימת מפעלים הגנת הסביבה (data.gov.il)", records: r })));
  }
  if (selectedSourceIds.includes("src_garages")) {
    tasks.push(fetchSlice("bb68386a-a331-4bbc-b668-bba2766d517d", 3000, 0).then(r => ({ type: "garages", label: "מוסכים ומכוני רישוי משרד התחבורה (data.gov.il)", records: r })));
  }
  if (selectedSourceIds.includes("src_manpower_security")) {
    tasks.push(fetchSlice("243fe1ce-b2ae-4c26-9e5e-ce306a602040", 2000, 0).then(r => ({ type: "manpower_security", label: "קבלני שמירה וכוח אדם משרד העבודה (data.gov.il)", records: r })));
  }
  if (selectedSourceIds.includes("src_halatz")) {
    tasks.push(fetchSlice("85e40960-5426-4f4c-874f-2d1ec1b94609", 1500, 0).then(r => ({ type: "halatz", label: "רשם החל״צ משרד המשפטים (data.gov.il)", records: r })));
  }
  if (selectedSourceIds.includes("src_business_licenses")) {
    tasks.push(fetchSlice("7d4c61e2-2416-453e-8efb-bd02ec89db35", 3200, 0).then(r => ({ type: "business_licenses", label: "רישוי עסקים ממשלתי (data.gov.il)", records: r })));
  }
  if (selectedSourceIds.includes("src_asbestos")) {
    tasks.push(fetchSlice("512d916e-07f0-4774-b84a-3a989e45e7eb", 1200, 0).then(r => ({ type: "asbestos", label: "מרשם הנדסת סביבה הגנת הסביבה (data.gov.il)", records: r })));
  }
  if (wantNgos) {
    tasks.push(fetchSlice("be5b7935-3922-45d4-9638-08871b17ec95", 2000, 0).then(r => ({ type: "ngos", label: "רשם העמותות משרד המשפטים (data.gov.il)", records: r })));
  }

  if (depth >= 1) {
    const CT = "4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8";
    if (selectedSourceIds.includes("src_contractors")) {
      for (let off = 9000; off < 24373; off += 3000) tasks.push(fetchSlice(CT, 3000, off, "&sort=MISPAR_YESHUT%20desc").then(r => ({ type: "contractors", label: "פנקס הקבלנים (data.gov.il)", records: r })));
    }
    if (selectedSourceIds.includes("src_garages")) {
      for (let off = 3000; off < 13948; off += 3000) tasks.push(fetchSlice("bb68386a-a331-4bbc-b668-bba2766d517d", 3000, off).then(r => ({ type: "garages", label: "מוסכים ומכוני רישוי משרד התחבורה (data.gov.il)", records: r })));
    }
    if (selectedSourceIds.includes("src_manpower_security")) {
      for (let off = 2000; off < 8129; off += 2000) tasks.push(fetchSlice("243fe1ce-b2ae-4c26-9e5e-ce306a602040", 2000, off).then(r => ({ type: "manpower_security", label: "קבלני שמירה וכוח אדם משרד העבודה (data.gov.il)", records: r })));
    }
  }

  const slices = await Promise.all(tasks);

  const byHp = new Map();
  const byCleanName = new Map();
  const byPhone = new Map();

  let totalScanned = 0;

  const ensureEntity = (hp, name, city, addr, status, sourceType, sourceLabel, sourceUrl) => {
    let ent = byHp.get(hp);
    if (!ent) {
      ent = {
        no: hp,
        name: String(name || "").replace(/בע~מ/g, 'בע"מ').trim(),
        city: String(city || "").trim(),
        addr: String(addr || "").trim(),
        status: String(status || "פעילה").trim(),
        primaryInd: "",
        industries: new Set(),
        sourcesMap: new Map(), // sourceType -> sourceLabel (prevents duplicate counting from same dataset)
        phoneToSources: new Map(), // normPhone -> Map(sourceType -> sourceLabel)
        phoneFormatted: new Map(), // normPhone -> formatted string
        emailToSources: new Map(), // lowerEmail -> Map(sourceType -> sourceLabel)
        website: "",
        employeesCount: null,
        employeeSource: "",
        verifiedFleetCount: null,
        verifiedFleetSource: "",
        contractorRecords: [],
        contactPerson: "",
        roleTitle: "",
        source_url: sourceUrl || "https://data.gov.il"
      };
      byHp.set(hp, ent);
    } else {
      if (!ent.name && name) ent.name = String(name).replace(/בע~מ/g, 'בע"מ').trim();
      if ((!ent.city || ent.city === "לא ידוע") && city) ent.city = String(city).trim();
      if ((!ent.addr || ent.addr === "לא ידוע" || ent.addr.length < 4) && addr) ent.addr = String(addr).trim();
      if (status && /פירוק|מחוסל|מחוק|הופסק|לא פעיל|מבוטל/.test(status)) ent.status = status;
    }
    if (sourceType && sourceLabel) {
      ent.sourcesMap.set(sourceType, sourceLabel);
    }
    const cn = cleanCorpNameForMatch(ent.name);
    if (cn.length >= 3 && !byCleanName.has(cn)) {
      byCleanName.set(cn, hp);
    }
    return ent;
  };

  const addPhoneToEntity = (ent, rawPhone, sourceType, sourceLabel) => {
    const norm = normFullIsraeliPhone(rawPhone);
    if (!isValidIsraeliPhoneFull(norm)) return;
    if (!ent.phoneToSources.has(norm)) {
      ent.phoneToSources.set(norm, new Map());
      ent.phoneFormatted.set(norm, formatIsraeliPhone(norm));
    }
    ent.phoneToSources.get(norm).set(sourceType, sourceLabel);
    if (!byPhone.has(norm)) {
      byPhone.set(norm, ent.no);
    }
  };

  const addEmailToEntity = (ent, rawEmail, sourceType, sourceLabel) => {
    const mail = String(rawEmail || "").trim().toLowerCase();
    if (!mail || !mail.includes("@") || mail.length < 5) return;
    if (!ent.emailToSources.has(mail)) {
      ent.emailToSources.set(mail, new Map());
    }
    ent.emailToSources.get(mail).set(sourceType, sourceLabel);
  };

  // Pass 1: Process all datasets that have official 9-digit Corporate HP
  for (const slice of slices) {
    if (slice.type === "business_licenses" || slice.type === "asbestos") continue;
    totalScanned += slice.records.length;

    for (const r of slice.records) {
      if (slice.type === "labor_employers") {
        const hp = normalizeRealHp(r.employer_number);
        const name = String(r.employer_name || "").trim();
        if (!hp || !name) continue;
        const city = String(r.city || "").trim();
        const addr = String(r.address || city || "").trim();
        const ind = String(r.industry || "").trim();
        const emp = parseInt(r.employees_general_number, 10);
        const ent = ensureEntity(hp, name, city, addr, "פעילה", "labor_employers", slice.label, "https://data.gov.il/dataset/b033f289-4143-4a9d-9612-da6e8cc2f380");
        if (ind && ind !== "לא ידוע") {
          ent.industries.add(ind);
          if (!ent.primaryInd) ent.primaryInd = ind;
        }
        // נתון העובדים העדכני ביותר (לפי תאריך ההחלטה) — לא המקסימום ההיסטורי
        const empDate = String(r.decision_date || "").slice(0, 10);
        if (Number.isInteger(emp) && emp > 0 && (ent.employeesCount === null || empDate > (ent.employeeDate || ""))) {
          ent.employeesCount = emp;
          ent.employeeDate = empDate;
          ent.employeeSource = "מאגר מעסיקים משרד העבודה" + (empDate ? ", נתון מ-" + empDate : "");
        }
      } else if (slice.type === "contractors") {
        const hp = normalizeRealHp(r.MISPAR_YESHUT);
        const name = String(r.SHEM_YESHUT || "").trim();
        if (!hp || !name) continue;
        const city = String(r.SHEM_YISHUV || "").trim();
        const street = String(r.SHEM_REHOV || "").trim();
        const house = String(r.MISPAR_BAIT || "").trim();
        const addr = street ? \`\${street}\${house ? " " + house : ""}\${city ? ", " + city : ""}\` : city;
        const ind = String(r.TEUR_ANAF || "").trim();
        const ent = ensureEntity(hp, name, city, addr, "פעילה", "contractors", slice.label, "https://data.gov.il/dataset/4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8");
        if (ind) {
          ent.industries.add(ind);
          if (!ent.primaryInd) ent.primaryInd = ind;
        }
        addPhoneToEntity(ent, r.MISPAR_TEL, "contractors", slice.label);
        addEmailToEntity(ent, r.EMAIL, "contractors", slice.label);
        const ovdim = String(r.OVDIM || "").trim();
        if (ovdim && !ent.contactPerson) {
          ent.contactPerson = ovdim;
          ent.roleTitle = \`איש מקצוע רשום: \${ovdim}\`;
        }
        ent.contractorRecords.push({
          anaf: ind,
          kod_anaf: String(r.KOD_ANAF || "").trim(),
          sivug: String(r.SIVUG || "").trim(),
          ovdim: ovdim,
          phone: formatIsraeliPhone(r.MISPAR_TEL),
          email: String(r.EMAIL || "").trim()
        });
      } else if (slice.type === "plants_industry") {
        const hp = normalizeRealHp(r.MisparTaagidShutfutMenifa);
        const name = String(r.ShemTaagidShutfut || r.ShemAtarSvivatiMenifa || "").trim();
        if (!hp || !name) continue;
        const statusRaw = String(r.StatusAtar || "פעיל").trim();
        const city = String(r.YeshuvAtarSvivatiMenifa || "").trim();
        const ind = String(r.AnafAtarSvivati || "תעשייה ומפעלים").trim();
        const ent = ensureEntity(hp, name, city, city, statusRaw, "plants_industry", slice.label, "https://data.gov.il/dataset/7ad8ddc7-87f4-45f9-84e4-d7f972662153");
        if (ind) {
          ent.industries.add(\`תעשייה ומפעלים (\${ind})\`);
          ent.primaryInd = \`תעשייה ומפעלים (\${ind})\`;
        }
        addPhoneToEntity(ent, r.TelefonAtarSvivatiMenifa, "plants_industry", slice.label);
        const web = String(r.AtarInternetMenifa || "").trim();
        if (web && web.includes(".") && !ent.website) {
          ent.website = web;
        }
      } else if (slice.type === "garages") {
        const hp = normalizeRealHp(r.rasham_havarot);
        const name = String(r.shem_mosah || "").trim();
        if (!hp || !name) continue;
        const city = String(r.yishuv || "").trim();
        const addr = String(r.ktovet || "").trim();
        const field = String(r.miktzoa || r.sug_mosah || "מוסך מורשה").trim();
        const ent = ensureEntity(hp, name, city, addr ? \`\${addr}, \${city}\` : city, "מורשה משרד התחבורה", "garages", slice.label, "https://data.gov.il/dataset/bb68386a-a331-4bbc-b668-bba2766d517d");
        ent.industries.add(\`מוסכים ורישוי (\${field})\`);
        if (!ent.primaryInd) ent.primaryInd = \`מוסכים ורישוי (\${field})\`;
        addPhoneToEntity(ent, r.telephone, "garages", slice.label);
        const mgr = String(r.menahel_miktzoa || "").trim();
        if (mgr && !ent.contactPerson) {
          ent.contactPerson = mgr;
          ent.roleTitle = \`מנהל מקצועי מוסמך: \${mgr}\`;
        }
      } else if (slice.type === "manpower_security") {
        const hp = normalizeRealHp(r.identitynumber);
        const name = String(r.companyname || "").trim();
        if (!hp || !name) continue;
        const city = String(r.town || "").trim();
        const addr = String(r.address || "").trim();
        const field = String(r.fieldfactivity || "שמירה, אבטחה וכוח אדם").trim();
        const ent = ensureEntity(hp, name, city, addr ? \`\${addr}, \${city}\` : city, "רישיון בתוקף", "manpower_security", slice.label, "https://data.gov.il/dataset/243fe1ce-b2ae-4c26-9e5e-ce306a602040");
        ent.industries.add(field);
        if (!ent.primaryInd) ent.primaryInd = field;
        const ceo = String(r.companyceo || "").trim();
        if (ceo && !ent.contactPerson) {
          ent.contactPerson = ceo;
          ent.roleTitle = \`מנכ״ל רשום: \${ceo}\`;
        }
      } else if (slice.type === "halatz") {
        const hp = normalizeRealHp(r["מספר חלצ"]);
        const name = String(r["שם חלצ בעברית"] || r["שם חלצ"] || "").trim();
        if (!hp || !name) continue;
        const status = String(r["סטטוס חלצ"] || "").trim();
        const city = String(r["כתובת - ישוב"] || "").trim();
        const street = String(r["כתובת - רחוב"] || "").trim();
        const house = String(r["כתובת - מספר דירה"] || "").trim();
        const addr = street ? \`\${street}\${house ? " " + house : ""}\${city ? ", " + city : ""}\` : city;
        const ind = String(r["סיווג פעילות ענפי"] || "שירותים, חינוך ומחקר (חל״צ)").trim();
        const emp = parseInt(r["עובדים- נתונים מדוח מילולי מקוון"], 10);
        const repYear = parseInt(r["שנת דיווח דוח כספי אחרון"], 10) || parseInt(String(r["תאריך עדכון אחרון של נתוני חלצ"] || "").slice(0, 4), 10) || 2023;
        const empDate = \`\${repYear}-12-31\`;
        const ent = ensureEntity(hp, name, city, addr, status, "halatz", slice.label, "https://data.gov.il/dataset/85e40960-5426-4f4c-874f-2d1ec1b94609");
        ent.industries.add(ind);
        if (!ent.primaryInd) ent.primaryInd = ind;
        if (Number.isInteger(emp) && emp > 0 && (ent.employeesCount === null || empDate > (ent.employeeDate || ""))) {
          ent.employeesCount = emp;
          ent.employeeDate = empDate;
          ent.employeeSource = \`דוח שנתי רשם החל״צ (משרד המשפטים), דיווח \${repYear}\`;
        }
      } else if (slice.type === "ngos") {
        const hp = normalizeRealHp(r["מספר עמותה"]);
        const name = String(r["שם עמותה בעברית"] || "").trim();
        if (!hp || !name) continue;
        const status = String(r["סטטוס עמותה"] || "").trim();
        const city = String(r["כתובת - ישוב"] || "").trim();
        const ind = String(r["סיווג פעילות ענפי"] || "ארגון/עמותה").trim();
        const emp = parseInt(r["כמות עובדים"], 10);
        const ent = ensureEntity(hp, name, city, city, status, "ngos", slice.label, "https://data.gov.il/dataset/be5b7935-3922-45d4-9638-08871b17ec95");
        ent.industries.add(ind);
        if (!ent.primaryInd) ent.primaryInd = ind;
        if (Number.isInteger(emp) && emp > 0 && (ent.employeesCount === null || emp > ent.employeesCount)) {
          ent.employeesCount = emp;
          ent.employeeSource = "רשם העמותות (משרד המשפטים)";
        }
      }
    }
  }

  // Pass 2: Cross-reference business_licenses and asbestos against real-HP entities (by full normalized phone or exact cleaned corporate name)
  for (const slice of slices) {
    if (slice.type === "business_licenses") {
      totalScanned += slice.records.length;
      // Group by business to count exact licensed vehicles if listed
      const bizGroups = new Map();
      for (const r of slice.records) {
        const bName = String(r["שם עסק"] || "").trim();
        if (!bName) continue;
        const key = cleanCorpNameForMatch(bName);
        if (!key) continue;
        if (!bizGroups.has(key)) {
          bizGroups.set(key, { name: bName, phones: new Set(), emails: new Set(), vehicleLicenses: new Set(), descs: new Set() });
        }
        const g = bizGroups.get(key);
        const p = normFullIsraeliPhone(r["טלפון בעסק"]);
        if (isValidIsraeliPhoneFull(p)) g.phones.add(p);
        const m = String(r["מייל בעסק"] || "").trim().toLowerCase();
        if (m && m.includes("@")) g.emails.add(m);
        const desc = String(r["תאור רישיון"] || "").trim();
        if (desc) g.descs.add(desc);
        const vMatch = desc.match(/מס'\\s*רכב\\s*(\\d{5,9})/);
        if (vMatch) g.vehicleLicenses.add(vMatch[1]);
      }

      for (const [cKey, g] of bizGroups.entries()) {
        let matchedHp = byCleanName.get(cKey);
        if (!matchedHp) {
          for (const p of g.phones) {
            if (byPhone.has(p)) {
              matchedHp = byPhone.get(p);
              break;
            }
          }
        }
        if (!matchedHp || !byHp.has(matchedHp)) continue;
        const ent = byHp.get(matchedHp);
        ent.sourcesMap.set("business_licenses", slice.label);
        for (const p of g.phones) {
          addPhoneToEntity(ent, p, "business_licenses", slice.label);
        }
        for (const m of g.emails) {
          addEmailToEntity(ent, m, "business_licenses", slice.label);
        }
        if (g.vehicleLicenses.size >= 1) {
          ent.verifiedFleetCount = Math.max(ent.verifiedFleetCount || 0, g.vehicleLicenses.size);
          ent.verifiedFleetSource = "רישוי עסקים ממשלתי (רכבים ברישיון)";
        }
      }
    } else if (slice.type === "asbestos") {
      totalScanned += slice.records.length;
      for (const r of slice.records) {
        const bName = String(r.Company || "").trim();
        const cKey = cleanCorpNameForMatch(bName);
        const p1 = normFullIsraeliPhone(r.Phone);
        const p2 = normFullIsraeliPhone(r.Mobile_Phone);
        let matchedHp = (cKey && byCleanName.get(cKey)) || (p1 && byPhone.get(p1)) || (p2 && byPhone.get(p2));
        if (!matchedHp || !byHp.has(matchedHp)) continue;
        const ent = byHp.get(matchedHp);
        ent.sourcesMap.set("asbestos", slice.label);
        if (p1) addPhoneToEntity(ent, p1, "asbestos", slice.label);
        if (p2) addPhoneToEntity(ent, p2, "asbestos", slice.label);
        if (r.Email) addEmailToEntity(ent, r.Email, "asbestos", slice.label);
      }
    }
  }

  // Pass 3 (הוסר): התאמת דומיין אימייל לתאגיד אינה אימות של כתובת האימייל עצמה — אימייל נחשב מאומת רק כשאותה כתובת מופיעה ב-2 מקורות.

  S._govCrossIndex = true;
  S._govCrossIndexKey = cacheKey;
  S._govCrossIndexMap = byHp;
  S._govCrossIndexScanned = totalScanned;
  return byHp;
}

/* ===== מנוע החיפוש המאוחד (RUN UNIFIED SEARCH — תומך בחיפוש חדש ובהמשך חיפוש) ===== */
async function runUnifiedSearch(customOpts = {}) {
  if (S.searchRunning) return;

  const isAppend = Boolean(customOpts.append);

  // 1. חילוץ כלל המסננים מהממשק
  const companyTypeVal = ($("#a-company-type") && $("#a-company-type").value) || customOpts.companyType || "all";
  const indVal = ($("#a-ind") && $("#a-ind").value) || customOpts.ind || "";
  const multiInds = Array.from(document.querySelectorAll(".ind-multi-cb:checked")).map(cb => cb.value);
  const activeInds = multiInds.length > 0 ? multiInds : (indVal ? [indVal] : []);

  const regionVal = ($("#a-region") && $("#a-region").value) || customOpts.region || "";
  const multiRegs = Array.from(document.querySelectorAll(".reg-multi-cb:checked")).map(cb => cb.value);
  const activeRegs = multiRegs.length > 0 ? multiRegs : (regionVal ? [regionVal] : []);

  const fleetModeVal = ($("#a-fleet-filter-mode") && $("#a-fleet-filter-mode").value) || customOpts.fleetMode || "5plus";
  const fleetCustomMin = parseInt(($("#a-fleet-custom-min") && $("#a-fleet-custom-min").value) || customOpts.fleetCustomMin || 0, 10) || 0;

  const workforceVal = ($("#a-workforce-range") && $("#a-workforce-range").value) || customOpts.workforce || "all";
  const empMinCustom = parseInt(($("#a-emp-min") && $("#a-emp-min").value) || customOpts.empMin || 0, 10) || 0;
  const empMaxCustom = parseInt(($("#a-emp-max") && $("#a-emp-max").value) || customOpts.empMax || 0, 10) || 0;

  const kwInput = (($("#a-kw") && $("#a-kw").value.trim()) || customOpts.kw || "").trim();
  const cityVal = (($("#a-city") && $("#a-city").value.trim()) || customOpts.city || "").trim().toLowerCase();
  const contactReqVal = ($("#a-contact-req") && $("#a-contact-req").value) || customOpts.contactReq || "all";
  const targetCross = parseInt(($("#a-target-cross") && $("#a-target-cross").value) || customOpts.targetCross || 4, 10);

  const countInput = ($("#a-count") && parseInt($("#a-count").value, 10)) || customOpts.reqLimit || 50;
  const reqLimitTotal = Math.max(1, Math.min(500, countInput));

  // שמירת מצב אחרון
  S._lastCompanyType = companyTypeVal;
  S._lastInd = indVal;
  S._lastMultiInds = multiInds;
  S._lastRegion = regionVal;
  S._lastMultiRegs = multiRegs;
  S._lastFleetMode = fleetModeVal;
  S._lastFleetCustomMin = fleetCustomMin ? String(fleetCustomMin) : "";
  S._lastWfRange = workforceVal;
  S._lastEmpMin = empMinCustom ? String(empMinCustom) : "";
  S._lastEmpMax = empMaxCustom ? String(empMaxCustom) : "";
  S._lastQueryTerm = kwInput;
  S._lastCity = cityVal;
  if (!isAppend) S._lastSaveSuccess = null;

  // חילוץ מקורות נבחרים
  const selectedCheckboxes = Array.from(document.querySelectorAll(".src-cb:checked"));
  let selectedSourceIds = selectedCheckboxes.map(cb => cb.value);
  if (selectedSourceIds.length === 0) {
    selectedSourceIds = [
      "src_companies",
      "src_labor_employers",
      "src_contractors",
      "src_plants_industry",
      "src_business_licenses",
      "src_garages",
      "src_manpower_security",
      "src_asbestos",
      "src_halatz"
    ];
  }
  saveSourceSelection(selectedSourceIds);

  // 2. אתחול משתני ריצה (שמירה על תוצאות ובחירות קיימות במצב "המשך חיפוש")
  S.searchRunning = true;
  S.searchStopRequested = false;
  if (!isAppend || !Array.isArray(S.searchHits)) {
    S.searchHits = [];
    S.searchDuplicates = [];
    S.searchRejected = [];
    S.searchHitSelection = new Set();
    S.searchExpandedDrawers = new Set();
  }
  S.searchActiveTab = "new";
  S.searchStats = {
    requested: isAppend ? (S.searchHits.length + reqLimitTotal) : reqLimitTotal,
    scanned: 0,
    added: S.searchHits.length,
    duplicates: S.searchDuplicates.length,
    rejected: S.searchRejected.length,
    fleetEvidence: S.searchHits.length
  };

  const resultsContainer = $("#searchResultsArea");
  if (resultsContainer) {
    resultsContainer.innerHTML = renderSearchResultsArea();
    resultsContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // אינדקס חברות שכבר הועברו ל"חברות שנמצאו" (C) או כבר מוצגות בתוצאות החיפוש הנוכחי
  const existingInDiscoveredMap = new Map();
  C.forEach(c => {
    const norm = normalizeRealHp(c.no);
    if (norm) existingInDiscoveredMap.set(norm, c);
  });

  // עדכון שורות קיימות אם הועברו ל-C
  S.searchHits.forEach(h => {
    if (existingInDiscoveredMap.has(h.no) && !h.adopted) {
      h.already = true;
      h.statusBadge = "כבר בחברות שנמצאו";
    }
  });

  const seenInCurrentRun = new Set(S.searchHits.map(h => h.no));
  const startTime = Date.now();
  const runStartHits = S.searchHits.length;
  const rejectedHpRun = new Set();
  const evaluatedHp = new Set();
  S.searchBlocker = "";
  S.searchStats.rejectReasons = {};
  S.searchStats.evaluated = 0;
  S.searchStats.passes = 0;
  const noteRej = (no, reason) => {
    rejectedHpRun.add(no);
    const k = String(reason || "").replace(/\\s*[\\(\\/].*$/, "").trim() || "אחר";
    S.searchStats.rejectReasons[k] = (S.searchStats.rejectReasons[k] || 0) + 1;
  };

  try {
    for (let depth = 0; depth <= 1; depth++) {
    S.searchStats.passes = depth + 1;
    const reqLimit = reqLimitTotal - (S.searchHits.length - runStartHits);
    if (depth === 1) updateLiveSearchStatus("היעד טרם הושג (" + (S.searchHits.length - runStartHits) + "/" + reqLimitTotal + ") — ממשיך אוטומטית וטוען דפי מאגר נוספים (פנקס הקבלנים, מוסכים, כוח אדם)...");
    const byHp = await ensureGovCrossIndex(selectedSourceIds, msg => updateLiveSearchStatus(msg), depth);
    S.searchStats.scanned = S._govCrossIndexScanned || byHp.size;

    // אם הוזנה מילת חיפוש חופשית, בצע גם שליפה ממוקדת מרשם החברות ומפנקס הקבלנים/מעסיקים להרחבת האינדקס
    if (kwInput && selectedSourceIds.includes("src_companies")) {
      updateLiveSearchStatus(\`מבצע שאילתת מילת מפתח "\${kwInput}" מול רשם החברות (data.gov.il)...\`);
      try {
        const kwUrl = \`https://data.gov.il/api/3/action/datastore_search?resource_id=f004176c-b85f-4542-8901-7b3176f9a054&q=\${encodeURIComponent(kwInput)}&limit=200\`;
        const resp = await fetch(kwUrl);
        if (resp.ok) {
          const j = await resp.json();
          const recs = j?.result?.records || [];
          S.searchStats.scanned += recs.length;
          for (const rec of recs) {
            const hp = normalizeRealHp(rec["מספר חברה"]);
            const name = String(rec["שם חברה"] || "").trim();
            const status = String(rec["סטטוס חברה"] || "פעילה").trim();
            if (!hp || !name) continue;
            if (byHp.has(hp)) {
              const ent = byHp.get(hp);
              ent.sourcesMap.set("companies", "רשם החברות (data.gov.il)");
              ent.status = status || ent.status;
            }
          }
        }
      } catch (e) {}
    }

    updateLiveSearchStatus("מפעיל את שבעת החוקים, נוסחת העובדים ואימות רב-מקורות על החברות שאותרו...");

    const candidatesA = [];
    const candidatesB = [];

    for (const ent of byHp.values()) {
      if (S.searchStopRequested) break;

      // בדיקת כפילות מול הריצה הנוכחית (חשוב במיוחד ב"המשך חיפוש")
      if (seenInCurrentRun.has(ent.no) || rejectedHpRun.has(ent.no)) {
        continue;
      }
      if (!evaluatedHp.has(ent.no)) { evaluatedHp.add(ent.no); S.searchStats.evaluated++; }

      // 1. בדיקת חברה פעילה (Stage 1: פסול חברות שאינן פעילות)
      const isAct = window.OPQualify ? window.OPQualify.isCompanyActive(ent.status) : !/פירוק|מחוסל|מחוק|הופסק|לא פעיל|מבוטל|פקע/.test(ent.status || "");
      if (isAct === false) {
        S.searchStats.rejected++;
        noteRej(ent.no, "חברה לא פעילה (" + ent.status + ")");
        if (S.searchRejected.length < 250) {
          S.searchRejected.push({ name: ent.name, no: ent.no, reason: \`חברה לא פעילה (\${ent.status})\` });
        }
        continue;
      }

      // 2. סיווג חברה כללית מול חברה עתירת רכב
      const allIndText = [ent.primaryInd, ...ent.industries].filter(Boolean).join(" · ") || "חברה רשומה";
      const isVehicleIntensive = isEntityVehicleIntensive(ent.name, ent.primaryInd, allIndText, ent.sourcesMap);
      if (companyTypeVal === "general" && isVehicleIntensive) continue;
      if (companyTypeVal === "vehicle_intensive" && !isVehicleIntensive) continue;

      // 3. סינון מילת מפתח חופשית (אם הוזנה)
      if (kwInput) {
        const kwTokens = kwInput.toLowerCase().split(/[,،;]+/).map(s => s.trim()).filter(Boolean);
        const searchBlob = (ent.name + " " + ent.no + " " + allIndText + " " + ent.city).toLowerCase();
        if (kwTokens.length > 0 && !kwTokens.some(k => searchBlob.includes(k))) continue;
      }

      // 4. סינון עיר (אם הוזנה)
      if (cityVal && !String(ent.city || "").toLowerCase().includes(cityVal)) continue;

      // 5. סינון אזור גיאוגרפי (אחד או כמה מתוך 6 האזורים הראשיים)
      const derivedReg = (window.OPQualify && typeof window.OPQualify.cityToRegion === "function")
        ? window.OPQualify.cityToRegion(ent.city)
        : "מרכז וגוש דן";
      const normalizedRegion = (derivedReg && derivedReg !== "לא ידוע") ? derivedReg : "מרכז וגוש דן";
      if (activeRegs.length > 0) {
        const regMatch = activeRegs.some(r => normalizedRegion === r || normalizedRegion.includes(r) || String(ent.city || "").includes(r));
        if (!regMatch) continue;
      }

      // 6. סינון תחום פעילות (אחד או כמה ענפים)
      if (activeInds.length > 0) {
        const blob = (ent.name + " " + allIndText).toLowerCase();
        const indMatch = activeInds.some(indKey => {
          const pat = INDUSTRY_FILTER_PATTERNS[indKey];
          return (pat && pat.test(blob)) || blob.includes(indKey.toLowerCase());
        });
        if (!indMatch) continue;
      }

      // 7. בחירת הטלפון והאימייל הטובים ביותר (עם מרב המקורות העצמאיים)
      let bestLandline = "";
      let bestMobile = "";
      let bestPhoneNorm = "";
      let bestPhoneSources = [];

      for (const [normP, srcMap] of ent.phoneToSources.entries()) {
        const fmt = ent.phoneFormatted.get(normP) || formatIsraeliPhone(normP);
        const srcList = Array.from(srcMap.values());
        if (normP.startsWith("05")) {
          if (!bestMobile || srcList.length > bestPhoneSources.length) bestMobile = fmt;
        } else {
          if (!bestLandline || srcList.length > bestPhoneSources.length) bestLandline = fmt;
        }
        if (srcList.length > bestPhoneSources.length || (!bestPhoneNorm && srcList.length > 0)) {
          bestPhoneNorm = normP;
          bestPhoneSources = srcList;
        }
      }

      let bestEmail = "";
      let bestEmailSources = [];
      for (const [mail, srcMap] of ent.emailToSources.entries()) {
        const srcList = Array.from(srcMap.values());
        if (srcList.length > bestEmailSources.length || !bestEmail) {
          bestEmail = mail;
          bestEmailSources = srcList;
        }
      }

      const companySourcesList = Array.from(ent.sourcesMap.values());

      // 8. הפעלת OPQualify.evaluate לחישוב עובדים, צי רכב (לפי נוסחת העובדים לחברות כלליות בלבד / תחום מבוסס / מאומת) ודירוג A/B
      const qRow = {
        company_name: ent.name,
        company_hp: ent.no,
        company_category: isVehicleIntensive ? "vehicle_intensive" : "general",
        status: ent.status || "פעילה",
        industry: allIndText,
        industry_name: allIndText,
        city: ent.city || "לא ידוע",
        address: ent.addr || ent.city || "לא ידוע",
        website: ent.website || "",
        phone: bestLandline || bestMobile || "",
        mobile_phone: bestMobile || "",
        email: bestEmail || "",
        source: ent.sourcesMap.has("contractors") ? "contractors" : (ent.sourcesMap.has("plants_industry") ? "mefalas_plants" : "companies"),
        source_name: companySourcesList.join(" + "),
        source_list: companySourcesList,
        phone_sources: bestPhoneSources,
        email_sources: bestEmailSources,
        independent_sources: companySourcesList,
        employee_count: ent.employeesCount,
        verified_employee_count: ent.employeesCount,
        employee_source: ent.employeeSource,
        fleet_size: ent.verifiedFleetCount,
        fleetIsFact: Boolean(ent.verifiedFleetCount && ent.verifiedFleetCount > 0),
        fleet_source: ent.verifiedFleetSource,
        contact_name: ent.contactPerson || "",
        contact_role: ent.roleTitle || "",
        registry_check: {
          companies: { found: true, status: ent.status || "פעילה" },
          contractors: { found: ent.contractorRecords.length > 0, records: ent.contractorRecords }
        }
      };

      const evalRes = (window.OPQualify && typeof window.OPQualify.evaluate === "function")
        ? window.OPQualify.evaluate(qRow)
        : null;

      if (!evalRes || !evalRes.lead_grade) {
        S.searchStats.rejected++;
        noteRej(ent.no, (evalRes && evalRes.lead_grade_label) || "לא עמד בתנאי הסף של שבעת החוקים (חסר בסיס עובדים/רכבים ופרטי קשר)");
        if (S.searchRejected.length < 250) {
          S.searchRejected.push({
            name: ent.name,
            no: ent.no,
            reason: (evalRes && evalRes.lead_grade_label) || "לא עמד בתנאי הסף של שבעת החוקים (חסר בסיס עובדים/רכבים ופרטי קשר)"
          });
        }
        continue;
      }

      // חברה כללית ללא צי מאומת נכנסת רק על בסיס נתון עובדים אמיתי, מזוהה ועדכני (לא טווח ענפי/סיווג קבלני משוער)
      if (!isVehicleIntensive && !(ent.verifiedFleetCount > 0)) {
        const empCutoff = (new Date().getFullYear() - 4) + "-01-01";
        let empReject = "";
        if (ent.employeesCount === null || ent.employeesCount <= 0) empReject = "חברה כללית ללא נתון עובדים מבוסס (רק אומדן סיווג/ענף)";
        else if (ent.employeeDate && ent.employeeDate < empCutoff) empReject = "נתון עובדים ישן (" + ent.employeeDate.slice(0, 4) + ")";
        if (empReject) {
          S.searchStats.rejected++;
          noteRej(ent.no, empReject);
          if (S.searchRejected.length < 250) S.searchRejected.push({ name: ent.name, no: ent.no, reason: empReject });
          continue;
        }
      }

      const wf = evalRes.workforce_estimate_v2 || {};
      const fl = evalRes.fleet_estimate_v2 || {};
      const approxEmp = ent.employeesCount !== null ? ent.employeesCount : wf.approx_employees;
      const fleetCount = fl.fleet_count;
      const fleetMethod = fl.fleet_method || "unknown";

      // 9. סינון עצמאי לפי מספר עובדים (Stage 3)
      if (workforceVal && workforceVal !== "all") {
        if (workforceVal === "verified_emp_only" && (ent.employeesCount === null || ent.employeesCount <= 0)) continue;
        if (workforceVal === "50plus" && (!approxEmp || approxEmp < 50)) continue;
        if (workforceVal === "100plus" && (!approxEmp || approxEmp < 100)) continue;
        if (workforceVal === "10-49" && (!approxEmp || approxEmp < 10 || approxEmp > 49)) continue;
        if (workforceVal === "50-100" && (!approxEmp || approxEmp < 50 || approxEmp > 100)) continue;
        if (workforceVal === "101-250" && (!approxEmp || approxEmp < 101 || approxEmp > 250)) continue;
        if (workforceVal === "250plus" && (!approxEmp || approxEmp < 250)) continue;
        if (workforceVal === "custom") {
          if (empMinCustom > 0 && (!approxEmp || approxEmp < empMinCustom)) continue;
          if (empMaxCustom > 0 && (!approxEmp || approxEmp > empMaxCustom)) continue;
        }
      }

      // 10. סינון פוטנציאל רכבים (5+, 10+, 20+, 50+, מותאם אישית, או לפי שיטת חישוב)
      if (fleetModeVal && fleetModeVal !== "all") {
        if (fleetModeVal === "5plus" && (!fleetCount || fleetCount < 5)) continue;
        if (fleetModeVal === "10plus" && (!fleetCount || fleetCount < 10)) continue;
        if (fleetModeVal === "20plus" && (!fleetCount || fleetCount < 20)) continue;
        if (fleetModeVal === "50plus" && (!fleetCount || fleetCount < 50)) continue;
        if (fleetModeVal === "custom") {
          const minFl = fleetCustomMin > 0 ? fleetCustomMin : 5;
          if (!fleetCount || fleetCount < minFl) continue;
        }
        if (fleetModeVal === "verified_only" && fleetMethod !== "verified") continue;
        if (fleetModeVal === "formula_only" && fleetMethod !== "formula") continue;
        if (fleetModeVal === "industry_only" && fleetMethod !== "industry") continue;
      }

      // 11. סינון דרישת פרטי קשר ודירוג
      const phoneMatches = bestPhoneSources.length;
      const emailMatches = bestEmailSources.length;
      const isGreenPhone = phoneMatches >= 2;

      // דירוג A רק כשגם הטלפון וגם האימייל מופיעים באותה חברה ב-2 מקורות עצמאיים לפחות
      if (evalRes.lead_grade === "A" && !(phoneMatches >= 2 && emailMatches >= 2)) {
        evalRes.lead_grade = "B";
        evalRes.lead_grade_label = "דירוג B — ליד להשלמת אימות מקור נוסף";
      }

      if (contactReqVal === "grade_a" && evalRes.lead_grade !== "A") continue;
      if (contactReqVal === "grade_b" && evalRes.lead_grade !== "B") continue;
      if (contactReqVal === "green_phone" && !isGreenPhone) continue;
      if (contactReqVal === "phone" && !bestLandline && !bestMobile) continue;
      if (contactReqVal === "email" && !bestEmail) continue;

      // בדיקת האם החברה כבר נמצאת ב"חברות שנמצאו" (C)
      const alreadyInDiscovered = existingInDiscoveredMap.has(ent.no);
      if (alreadyInDiscovered) {
        const ex = existingInDiscoveredMap.get(ent.no);
        S.searchStats.duplicates++;
        S.searchDuplicates.push({
          name: ent.name,
          no: ent.no,
          city: ent.city,
          ind: allIndText,
          reason: \`ח.פ. כבר קיים ב'חברות שנמצאו': "\${ex.name}" (מסומן בטבלה כנעול להעברה כפולה)\`
        });
      }

      // בניית תוויות אימות שקופות ומדויקות (2–4 מקורות עצמאיים)
      const phoneVerBadgeColor = phoneMatches >= 2 ? "green" : (phoneMatches === 1 ? "yellow" : "gray");
      const phoneVerBadgeLabel = phoneMatches >= 2
        ? \`✓ מאומת (\${Math.min(4, phoneMatches)}/\${targetCross} מקורות)\`
        : phoneMatches === 1
        ? \`מקור יחיד (1/\${targetCross})\`
        : \`להשלמה (0/\${targetCross})\`;
      const phoneVerStatus = phoneMatches >= 2
        ? \`אומת ב-\${phoneMatches} מקורות עצמאיים: \${bestPhoneSources.join(" + ")}\`
        : phoneMatches === 1
        ? \`אותרה רשומה במקור אחד (\${bestPhoneSources[0]}) — דורש מקור שני לאימות מלא\`
        : "ללא טלפון במאגר הפתוח — ליד להשלמת פרטי קשר";

      const emailVerLabel = emailMatches >= 2
        ? \`✓ מאומת (\${Math.min(4, emailMatches)}/\${targetCross})\`
        : emailMatches === 1
        ? \`מקור 1 (1/\${targetCross})\`
        : \`0/\${targetCross}\`;

      let gradeNote = "";
      if (evalRes.lead_grade === "A") {
        gradeNote = \`טלפון מאומת ב-\${phoneMatches} מקורות עצמאיים + אימייל עסקי\`;
      } else {
        const missingParts = [];
        if (!bestLandline && !bestMobile) missingParts.push("חסר טלפון");
        else if (phoneMatches < 2) missingParts.push("טלפון ממקור יחיד");
        if (!bestEmail) missingParts.push("חסר אימייל");
        gradeNote = missingParts.length ? \`להשלמת: \${missingParts.join(", ")}\` : "ליד להשלמת פרטי קשר";
      }

      const hitObj = {
        no: ent.no,
        name: ent.name,
        isVehicleIntensive,
        city: ent.city || "לא ידוע",
        region: normalizedRegion,
        addr: ent.addr || ent.city || "—",
        ind: allIndText,
        status: ent.status || "פעילה",
        website: ent.website || "",
        employeesCount: ent.employeesCount,
        employeeSource: ent.employeeSource || "",
        approxEmployees: approxEmp,
        workforceRange: wf.employee_count_range || (ent.employeesCount ? String(ent.employeesCount) : "לא ידוע"),
        workforceDisplay: wf.employee_count_display || (ent.employeesCount ? \`\${ent.employeesCount} עובדים (מאומת)\` : "לא ידוע"),
        workforceConfidence: wf.workforce_confidence_level || "",
        workforce_v2: wf,
        fleet_estimate_v2: fl,
        fleetSizeDisplay: fl.fleet_size_display || "לא ידוע",
        fleetRounded: fl.fleet_count_rounded || "",
        fleetCount: fleetCount,
        fleetMethod: fleetMethod,
        fleetMethodLabel: fl.fleet_method_label || "לא ידוע",
        fleetConfidence: fl.fleet_confidence || "",
        fleetBasis: fl.basis_of_estimate_label || "",
        fleetIsFact: Boolean(fl.is_verified),
        fleetPotential: fl.fleet_size_display || "",
        contactPerson: ent.contactPerson || "—",
        roleTitle: ent.roleTitle || "",
        phone: bestLandline || "—",
        mobile: bestMobile || "—",
        email: bestEmail || "—",
        phoneMatches,
        phoneSourcesList: bestPhoneSources,
        phoneVerBadgeColor,
        phoneVerBadgeLabel,
        phoneVerStatus,
        emailMatches,
        emailSourcesList: bestEmailSources,
        emailVerLabel,
        companySourcesList,
        source: ent.sourcesMap.keys().next().value || "companies",
        source_label: companySourcesList.join(" + "),
        source_url: ent.source_url,
        leadGrade: evalRes.lead_grade,
        leadGradeLabel: evalRes.lead_grade_label,
        gradeNote,
        qualityScore: evalRes.lead_grade === "A" ? 95 : 78,
        qualityColor: evalRes.lead_grade === "A" ? "green" : "yellow",
        qualityLabel: evalRes.lead_grade_label,
        businessPotentialScore: evalRes.business_potential_score || 75,
        already: alreadyInDiscovered,
        adopted: false,
        statusBadge: alreadyInDiscovered ? "כבר בחברות שנמצאו" : ""
      };

      if (evalRes.lead_grade === "A") {
        candidatesA.push(hitObj);
      } else if (evalRes.lead_grade === "B") {
        candidatesB.push(hitObj);
      }
    }

    // מיון מועמדים: דירוג A קודם (לפי מספר מקורות אימות טלפון ואימייל, ואז גודל צי/עובדים), ואחריו דירוג B
    const sortFn = (a, b) => {
      // העדפה לחברות שטרם נמצאות ב-C כדי שהמשתמש יקבל חברות חדשות לבחירה
      if (a.already !== b.already) return a.already ? 1 : -1;
      if (b.phoneMatches !== a.phoneMatches) return b.phoneMatches - a.phoneMatches;
      if (b.emailMatches !== a.emailMatches) return b.emailMatches - a.emailMatches;
      const hasBothContactsA = ((a.phone !== "—" || a.mobile !== "—") && a.email !== "—") ? 1 : 0;
      const hasBothContactsB = ((b.phone !== "—" || b.mobile !== "—") && b.email !== "—") ? 1 : 0;
      if (hasBothContactsB !== hasBothContactsA) return hasBothContactsB - hasBothContactsA;
      const hasExactEmpA = (a.employeesCount !== null && a.employeesCount > 0) ? 1 : 0;
      const hasExactEmpB = (b.employeesCount !== null && b.employeesCount > 0) ? 1 : 0;
      if (hasExactEmpB !== hasExactEmpA) return hasExactEmpB - hasExactEmpA;
      if (b.companySourcesList.length !== a.companySourcesList.length) return b.companySourcesList.length - a.companySourcesList.length;
      const empA = a.employeesCount || a.approxEmployees || 0;
      const empB = b.employeesCount || b.approxEmployees || 0;
      return empB - empA;
    };

    candidatesA.sort(sortFn);
    candidatesB.sort(sortFn);

    // בניית רשימת התוצאות עד reqLimit — ללא הטיה לחברות הובלה כאשר נבחר "כל החברות" (Stage 3 & Stage 4)
    const allSorted = [...candidatesA, ...candidatesB];
    const selectedBatch = [];

    if (companyTypeVal === "all" && activeInds.length === 0 && !kwInput) {
      // בחיפוש כללי ("כל החברות"), ודא שלפחות 70% מהתוצאות הן חברות כלליות (תעשייה, מפעלים, הייטק, שירותים, מסחר) ולא רוב של חברות הובלה!
      const maxVehicleInAll = depth >= 1 ? reqLimit : Math.max(5, Math.floor(reqLimitTotal * 0.28));
      let vehicleAdded = 0;

      // שלב א': כל ליד בדירוג A (מוכן לפנייה עם 2+ מקורות עצמאיים) נכנס ראשון, תוך שמירה על תקרת חברות הובלה
      for (const item of candidatesA) {
        if (selectedBatch.length >= reqLimit) break;
        if (item.isVehicleIntensive) {
          if (vehicleAdded >= maxVehicleInAll) continue;
          vehicleAdded++;
        }
        selectedBatch.push(item);
        seenInCurrentRun.add(item.no);
      }

      // שלב ב': השלמת המכסה מחברות כלליות בדירוג B (בעלות עובדים מאומתים + פרטי קשר / נוסחת עובדים) ואז חברות עתירות רכב עד התקרה
      for (const item of candidatesB) {
        if (selectedBatch.length >= reqLimit) break;
        if (seenInCurrentRun.has(item.no)) continue;
        if (item.isVehicleIntensive) {
          if (vehicleAdded >= maxVehicleInAll) continue;
          vehicleAdded++;
        }
        selectedBatch.push(item);
        seenInCurrentRun.add(item.no);
      }
    } else {
      for (const item of allSorted) {
        if (selectedBatch.length >= reqLimit) break;
        selectedBatch.push(item);
        seenInCurrentRun.add(item.no);
      }
    }

    // אימות סטטוס אמיתי מול רשם החברות (f004176c) לפי מספר חברה מדויק — לכל חברה שמוצגת, לא רק ל-25 הראשונות.
    // חברה שלא נמצאה ברשם, אינה פעילה או שלא ניתן היה לאמת את הסטטוס שלה — נפסלת ומוחלפת במועמדת הבאה.
    // השלמת טלפון/אימייל מפנקס הקבלנים לפי ח.פ. מדויק (האינדקס הכללי טוען רק חלק מהפנקס) ועדכון ספירת המקורות
    const CT_LABEL = "פנקס הקבלנים (data.gov.il)";
    const addContractorContacts = async (h) => {
      try {
        const flt = encodeURIComponent(JSON.stringify({ MISPAR_YESHUT: h.no }));
        const r = await fetch("https://data.gov.il/api/3/action/datastore_search?resource_id=4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8&filters=" + flt + "&limit=20");
        if (!r.ok) return;
        const recs = ((await r.json())?.result?.records) || [];
        if (!recs.length) return;
        const curPhones = [h.phone, h.mobile].map(normFullIsraeliPhone).filter(Boolean);
        const curEmail = String(h.email || "").trim().toLowerCase();
        for (const rec of recs) {
          const p = normFullIsraeliPhone(rec.MISPAR_TEL);
          if (p && isValidIsraeliPhoneFull(p)) {
            if (curPhones.includes(p)) {
              if (!h.phoneSourcesList.includes(CT_LABEL)) h.phoneSourcesList.push(CT_LABEL);
            } else if (!curPhones.length) {
              if (/^05/.test(p)) h.mobile = formatIsraeliPhone(p); else h.phone = formatIsraeliPhone(p);
              curPhones.push(p);
              h.phoneSourcesList = [CT_LABEL];
            }
          }
          const m = String(rec.EMAIL || "").trim().toLowerCase();
          if (m.includes("@")) {
            if (curEmail && curEmail === m) {
              if (!h.emailSourcesList.includes(CT_LABEL)) h.emailSourcesList.push(CT_LABEL);
            } else if (!curEmail || curEmail === "—") {
              h.email = m;
              h.emailSourcesList = [CT_LABEL];
            }
          }
        }
        if (!h.companySourcesList.includes(CT_LABEL)) {
          h.companySourcesList.push(CT_LABEL);
          h.source_label = h.companySourcesList.join(" + ");
        }
        h.phoneMatches = h.phoneSourcesList.length;
        h.emailMatches = h.emailSourcesList.length;
        const tc = 4;
        h.phoneVerBadgeColor = h.phoneMatches >= 2 ? "green" : (h.phoneMatches === 1 ? "yellow" : "gray");
        h.phoneVerBadgeLabel = h.phoneMatches >= 2 ? "✓ מאומת (" + Math.min(4, h.phoneMatches) + "/" + tc + " מקורות)" : (h.phoneMatches === 1 ? "מקור יחיד (1/" + tc + ")" : "להשלמה (0/" + tc + ")");
        h.phoneVerStatus = h.phoneMatches >= 2 ? "אומת ב-" + h.phoneMatches + " מקורות עצמאיים: " + h.phoneSourcesList.join(" + ") : (h.phoneMatches === 1 ? "אותרה רשומה במקור אחד (" + h.phoneSourcesList[0] + ") — דורש מקור שני לאימות מלא" : h.phoneVerStatus);
        h.emailVerLabel = h.emailMatches >= 2 ? "✓ מאומת (" + Math.min(4, h.emailMatches) + "/" + tc + ")" : (h.emailMatches === 1 ? "מקור 1 (1/" + tc + ")" : "0/" + tc);
        if (h.phoneMatches >= 2 && h.emailMatches >= 2 && h.leadGrade !== "A") {
          h.leadGrade = "A";
          h.leadGradeLabel = h.qualityLabel = "דירוג A — פרטי קשר מאומתים ב-2 מקורות עצמאיים";
          h.qualityScore = 95;
          h.qualityColor = "green";
        }
      } catch (e) {}
    };

    const registrarActive = async (h) => {
      try {
        const flt = encodeURIComponent(JSON.stringify({ "מספר חברה": Number(h.no) }));
        const r = await fetch("https://data.gov.il/api/3/action/datastore_search?resource_id=f004176c-b85f-4542-8901-7b3176f9a054&filters=" + flt + "&limit=5");
        if (!r.ok) return "לא ניתן לאמת סטטוס ברשם החברות";
        const j = await r.json();
        const match = (j?.result?.records || []).find(rec => normalizeRealHp(rec["מספר חברה"]) === h.no);
        if (!match) return "לא נמצאה ברשם החברות (לא חברה רשומה)";
        const regStatus = String(match["סטטוס חברה"] || "").trim();
        const subStatus = String(match["תת סטטוס"] || "").trim();
        h.status = regStatus || "לא ידוע";
        h.registryVerified = true;
        if (!h.companySourcesList.includes("רשם החברות (data.gov.il)")) {
          h.companySourcesList.push("רשם החברות (data.gov.il)");
          h.source_label = h.companySourcesList.join(" + ");
        }
        const cityReg = String(match["שם עיר"] || "").trim();
        const streetReg = String(match["שם רחוב"] || "").trim();
        const houseReg = String(match["מספר בית"] || "").trim();
        if (cityReg && (!h.city || h.city === "לא ידוע")) h.city = cityReg;
        if (streetReg && (!h.addr || h.addr === h.city || h.addr === "—")) {
          h.addr = streetReg + (houseReg ? " " + houseReg : "") + (h.city ? ", " + h.city : "");
        }
        if (regStatus !== "פעילה") return "סטטוס ברשם החברות: " + (regStatus || "לא ידוע");
        if (/צו לפתיחת הליכים|פירוק|כינוס/.test(subStatus)) return "סטטוס ברשם החברות: " + regStatus + " / " + subStatus;
        await addContractorContacts(h);
        return "";
      } catch (e) {
        return "לא ניתן לאמת סטטוס ברשם החברות";
      }
    };

    let finalBatch = selectedBatch;
    if (selectedSourceIds.includes("src_companies") && selectedBatch.length > 0) {
      finalBatch = [];
      const queue = selectedBatch.slice();
      // השלמה במועמדות הבאות; בחיפוש "כל החברות" ההשלמה מחברות כלליות בלבד כדי לא לחרוג מתקרת חברות הרכב
      const refill = allSorted.filter(item => !seenInCurrentRun.has(item.no) && (companyTypeVal !== "all" || depth >= 1 || !item.isVehicleIntensive));
      let checked = 0;
      while (finalBatch.length < reqLimit && (queue.length || refill.length)) {
        if (!queue.length) {
          const nxt = refill.shift();
          if (seenInCurrentRun.has(nxt.no)) continue;
          seenInCurrentRun.add(nxt.no);
          queue.push(nxt);
          continue;
        }
        const chunk = queue.splice(0, Math.min(10, reqLimit - finalBatch.length + 2, queue.length));
        checked += chunk.length;
        updateLiveSearchStatus("מאמת סטטוס ברשם החברות (" + checked + " נבדקו, " + finalBatch.length + " פעילות)...");
        const reasons = await Promise.all(chunk.map(registrarActive));
        chunk.forEach((h, i) => {
          if (!reasons[i] && finalBatch.length < reqLimit) {
            finalBatch.push(h);
          } else if (reasons[i]) {
            S.searchStats.rejected++;
            noteRej(h.no, reasons[i]);
            if (S.searchRejected.length < 250) S.searchRejected.push({ name: h.name, no: h.no, reason: reasons[i] });
          } else {
            seenInCurrentRun.delete(h.no);
          }
        });
        while (!queue.length && refill.length && finalBatch.length < reqLimit) {
          const nxt = refill.shift();
          if (seenInCurrentRun.has(nxt.no)) continue;
          seenInCurrentRun.add(nxt.no);
          queue.push(nxt);
          if (queue.length >= 10) break;
        }
      }
    }

    S.searchHits.push(...finalBatch);
    S.searchStats.added = S.searchHits.length;
    S.searchStats.fleetEvidence = S.searchHits.length;
    if (S.searchHits.length - runStartHits >= reqLimitTotal || S.searchStopRequested) break;
    } // סוף לולאת מעברי החיפוש (מעבר 2 טוען דפי מאגר נוספים רק כשהיעד טרם הושג)

    if (!S.searchStopRequested && (S.searchHits.length - runStartHits) < reqLimitTotal) {
      const rr = S.searchStats.rejectReasons || {};
      const rrTxt = Object.keys(rr).sort((a, b) => rr[b] - rr[a]).slice(0, 5).map(k => k + ": " + rr[k]).join(" | ");
      S.searchBlocker = "היעד לא הושג: נמצאו " + (S.searchHits.length - runStartHits) + " מתוך " + reqLimitTotal + " חברות מתאימות. כל המקורות החינמיים הזמינים נסרקו (" + S.searchStats.evaluated + " מועמדות נבדקו בשבעת הכללים). לא הוקלו הכללים ולא נוספו חברות שאינן עומדות בהם. סיבות פסילה עיקריות: " + rrTxt;
    } else {
      S.searchBlocker = "";
    }
  } catch (globalErr) {
    console.error("שגיאה במנוע החיפוש המאוחד:", globalErr);
    toast("שגיאה בסריקה: " + globalErr.message, "error");
  } finally {
    S.searchRunning = false;
    const durSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const area = $("#searchResultsArea");
    if (area) area.innerHTML = renderSearchResultsArea();
    updateLiveSearchStatus(\`החיפוש הסתיים ב-\${durSec} שניות · מוצגות \${S.searchHits.length} חברות מבוססות (דירוג A ו-B בלבד).\` + (S.searchBlocker ? " ⚠ " + S.searchBlocker : ""));
    updateActionButtonsState();
  }
}

function renderSearchHitsProgressive() {
  const area = $("#searchResultsArea");
  if (area) area.innerHTML = renderSearchResultsArea();
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
}

function updateLiveKpisAndProgress() {
  const hits = S.searchHits || [];
  const freshHits = hits.filter(h => !h.already && !h.adopted);
  const sel = S.searchHitSelection || new Set();
  const selectedCount = [...sel].filter(no => freshHits.some(h => h.no === no)).length;

  const tabNewEl = $("#tabCountNew");
  if (tabNewEl) tabNewEl.textContent = \`\${hits.length}\`;

  const newHitsHeader = $("#newHitsCountHeader");
  if (newHitsHeader) newHitsHeader.textContent = \`\${hits.length} חברות מבוססות (דירוג A/B)\`;

  const selectAllLabel = $("#selectAllLabelText");
  if (selectAllLabel) selectAllLabel.textContent = \`בחר את כל \${freshHits.length} החברות החדשות\`;

  const badgeEl = $("#hitSelectedCountBadge");
  if (badgeEl) {
    badgeEl.textContent = \`סומנו \${selectedCount} מתוך \${freshHits.length} חברות זמינות להעברה\`;
  }
  const saveBtn = $("#btnSaveToDiscovered");
  if (saveBtn) {
    saveBtn.disabled = selectedCount === 0;
    saveBtn.innerHTML = \`<span>📥 העבר חברות נבחרות ל'חברות שנמצאו' [\${selectedCount}]</span>\`;
  }
}

function updateHitSelectionCount() {
  updateLiveKpisAndProgress();
}

function updateActionButtonsState() {
  const btn = $("#btnUnifiedSearch");
  if (btn) {
    btn.disabled = S.searchRunning;
    btn.innerHTML = \`<span>\${S.searchRunning ? '⏳ מאתר ומצליב נתונים...' : '🚀 חיפוש חברות (data.gov.il)'}</span>\`;
  }
  const contBtn = $("#btnContinueSearch");
  if (contBtn) {
    contBtn.disabled = S.searchRunning;
  }
}

/* העברה מבוקרת של חברות נבחרות ל'חברות שנמצאו' (שלב 2 בלבד — ללא כפילויות וללא העברה אוטומטית לניהול לידים) */
async function saveSelectedToDiscovered() {
  const sel = S.searchHitSelection || new Set();
  if (sel.size === 0) {
    toast("לא נבחרו חברות להעברה", "warn");
    return;
  }

  const hits = S.searchHits || [];
  const existingHpsInC = new Set(C.map(c => normalizeRealHp(c.no)).filter(Boolean));
  const selectedHits = hits.filter(h => sel.has(h.no) && !h.already && !h.adopted && !existingHpsInC.has(h.no));

  if (selectedHits.length === 0) {
    toast("כל החברות שנבחרו כבר נמצאות ב'חברות שנמצאו'", "info");
    return;
  }

  const ok = confirm(\`האם להעביר \${selectedHits.length} חברות נבחרות ל'חברות שנמצאו' (שלב 2)?\\n\\nהחברות יישמרו תחת 'חברות שנמצאו' בלבד ולא יועברו ללקוחות או לניהול לידים ללא אישור נפרד.\`);
  if (!ok) return;

  let addedCount = 0;
  selectedHits.forEach(h => {
    const normHp = normalizeRealHp(h.no);
    if (!normHp || existingHpsInC.has(normHp)) return;
    existingHpsInC.add(normHp);

    C.push({
      id: Date.now() + Math.floor(Math.random() * 10000) + addedCount,
      name: h.name,
      no: normHp,
      city: h.city,
      region: h.region,
      addr: h.addr,
      ind: h.ind,
      status: "new",
      isApprovedLead: false,
      found: new Date().toLocaleDateString("he-IL"),
      upd: new Date().toLocaleDateString("he-IL"),
      size: h.employeesCount ? \`\${h.employeesCount} עובדים (מאומת)\` : (h.workforceRange || ""),
      fleet: { s: h.fleetIsFact ? "v" : "e", val: h.fleetSizeDisplay || "5+ רכבים", src: h.fleetMethodLabel || "" },
      fleetType: h.isVehicleIntensive ? "צי מסחרי / הובלה" : "צי חברה כללית",
      phone: h.phone !== "—" ? h.phone : (h.mobile !== "—" ? h.mobile : "לא נמצא"),
      mobile: h.mobile || "—",
      mail: h.email !== "—" ? h.email : "",
      email: h.email || "—",
      contact: h.contactPerson || "—",
      role: h.roleTitle || "",
      score: h.qualityScore || 80,
      source: h.source_label || "data.gov.il",
      stage: "discovered",
      lead_grade: h.leadGrade,
      phone_verified: h.phoneVerBadgeColor === "green"
    });
    h.adopted = true;
    h.statusBadge = "הועבר לחברות שנמצאו";
    sel.delete(h.no);
    addedCount++;
  });

  S._lastSaveSuccess = { count: addedCount, time: Date.now() };
  persistProspectorData();
  renderSearchHitsFiltered();
  updateLiveKpisAndProgress();
  updateActionButtonsState();

  toast(\`✓ הועברו בהצלחה \${addedCount} חברות ל'חברות שנמצאו' (שלב 2).\`, "success");
}

function runInternalDbSearch(query) {
  const container = $("#internalDbResults");
  if (!container) return;
  const q = String(query || "").trim().toLowerCase();
  if (!q) {
    container.innerHTML = \`<div class="xs muted">הזן מילת חיפוש להצגת תוצאות מתוך 'חברות שנמצאו' (\${C.length} חברות)</div>\`;
    return;
  }

  const results = C.filter(c => {
    return String(c.name || "").toLowerCase().includes(q) ||
           String(c.no || "").includes(q) ||
           String(c.city || "").toLowerCase().includes(q) ||
           String(c.phone || "").includes(q);
  });

  if (results.length === 0) {
    container.innerHTML = \`<div class="empty" style="padding:16px;text-align:center">לא נמצאו חברות התואמות ל-"\${esc(q)}"</div>\`;
    return;
  }

  container.innerHTML = \`
  <div style="font-size:12px;font-weight:700;margin-bottom:6px">נמצאו \${results.length} חברות:</div>
  <div class="tbl-wrap" style="max-height:300px;overflow:auto">
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

async function runAiProspectingSearch() {
  const prompt = ($("#ai-search-prompt") && $("#ai-search-prompt").value.trim()) || "";
  if (!prompt) {
    toast("נא להזין תיאור לחיפוש", "warn");
    return;
  }

  S.aiSearchRunning = true;
  S._lastAiPrompt = prompt;
  V.search();

  try {
    let coType = "all";
    let ind = "";
    if (/תעשיי|מפעל|ייצור/.test(prompt)) { coType = "general"; ind = "תעשייה ומפעלים"; }
    else if (/הייטק|תוכנה|טכנולוג|מחשוב/.test(prompt)) { coType = "general"; ind = "הייטק וטכנולוגיה"; }
    else if (/עורכי דין|עו"ד|רואי חשבון|רו"ח|ייעוץ/.test(prompt)) { coType = "general"; ind = "שירותים מקצועיים"; }
    else if (/הובל|שינוע|משאיות/.test(prompt)) { coType = "vehicle_intensive"; ind = "הובלות"; }
    else if (/הסעות|היסעים|אוטובוס/.test(prompt)) { coType = "vehicle_intensive"; ind = "הסעות"; }
    else if (/תשתיות|עפר|כבישים/.test(prompt)) { coType = "vehicle_intensive"; ind = "תשתיות"; }

    S.searchTrack = "free";
    S._lastCompanyType = coType;
    S._lastInd = ind;
    const viewEl = $("#view");
    if (viewEl) viewEl.innerHTML = V.search();
    await runUnifiedSearch({ companyType: coType, ind });
  } finally {
    S.aiSearchRunning = false;
  }
}
`;

let updated = content.slice(0, startIndex) + unifiedCode + content.slice(endIndex);

// Apply 200 regular companies permanent persistence, contact enrichment engine, and auto-save
updated = applyOpenProspector200Enrichment(updated);


const clickCaseAnchor = 'case "run":runSearch();return;';
const newClickCases = `
    case "selectAllActiveFreeSources": {
      document.querySelectorAll(".src-cb").forEach(cb => {
        cb.checked = (cb.dataset.active === "1");
      });
      const activeIds = Array.from(document.querySelectorAll(".src-cb:checked")).map(cb => cb.value);
      saveSourceSelection(activeIds);
      const counter = $("#sourceSelectionCounterBadge");
      if (counter) counter.textContent = \`נבחרו \${activeIds.length} מקורות (\${activeIds.length} מחוברים אוטומטית ב-API)\`;
      toast(\`נבחרו כל \${activeIds.length} המקורות המחוברים אוטומטית\`);
      return;
    }
    case "clearAllSources": {
      document.querySelectorAll(".src-cb").forEach(cb => { cb.checked = false; });
      saveSourceSelection([]);
      const counter = $("#sourceSelectionCounterBadge");
      if (counter) counter.textContent = "נבחרו 0 מקורות";
      toast("הבחירה נוקתה");
      return;
    }
    case "selectCategoryGroup": {
      const cat = d.cat;
      document.querySelectorAll(\`.src-cb[data-cat="\${cat}"]\`).forEach(cb => { cb.checked = (cb.dataset.active === "1"); });
      const selIds = Array.from(document.querySelectorAll(".src-cb:checked")).map(cb => cb.value);
      saveSourceSelection(selIds);
      toast("נבחרו המקורות הפעילים בקבוצה זו");
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
      const viewEl = $("#view");
      if (viewEl && V.search) viewEl.innerHTML = V.search();
      const details = $("#advSearchDetails");
      if (details) details.open = true;
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
      runUnifiedSearch({ append: false });
      return;
    }
    case "continueUnifiedSearch": {
      runUnifiedSearch({ append: true });
      return;
    }
    case "stopSearch": {
      S.searchStopRequested = true;
      toast("עוצר סריקה...", "info");
      return;
    }
    case "resetSearchForm": {
      S._lastCompanyType = "all";
      S._lastInd = "";
      S._lastMultiInds = [];
      S._lastRegion = "";
      S._lastMultiRegs = [];
      S._lastFleetMode = "5plus";
      S._lastFleetCustomMin = "";
      S._lastWfRange = "all";
      S._lastEmpMin = "";
      S._lastEmpMax = "";
      S._lastQueryTerm = "";
      S._lastCity = "";
      if ($("#a-company-type")) $("#a-company-type").value = "all";
      if ($("#a-ind")) $("#a-ind").value = "";
      document.querySelectorAll(".ind-multi-cb").forEach(cb => { cb.checked = false; });
      if ($("#a-region")) $("#a-region").value = "";
      document.querySelectorAll(".reg-multi-cb").forEach(cb => { cb.checked = false; });
      if ($("#a-count")) $("#a-count").value = "50";
      if ($("#a-fleet-filter-mode")) $("#a-fleet-filter-mode").value = "5plus";
      if ($("#a-fleet-custom-min")) { $("#a-fleet-custom-min").value = ""; $("#a-fleet-custom-min").style.display = "none"; }
      if ($("#a-workforce-range")) $("#a-workforce-range").value = "all";
      if ($("#empCustomRangeWrap")) $("#empCustomRangeWrap").style.display = "none";
      if ($("#a-emp-min")) $("#a-emp-min").value = "";
      if ($("#a-emp-max")) $("#a-emp-max").value = "";
      if ($("#a-kw")) $("#a-kw").value = "";
      if ($("#a-city")) $("#a-city").value = "";
      if ($("#a-contact-req")) $("#a-contact-req").value = "all";
      if ($("#a-target-cross")) $("#a-target-cross").value = "4";
      toast("הסינונים אופסו לברירת המחדל");
      return;
    }
    case "setResultsTab": {
      S.searchActiveTab = d.tab || d.val || "new";
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
        if (h.leadGrade === "A" || (h.phone && h.phone !== "—") || (h.mobile && h.mobile !== "—")) {
          S.searchHitSelection.add(h.no);
        }
      });
      document.querySelectorAll(".hit-cb:not(:disabled)").forEach(cb => {
        cb.checked = S.searchHitSelection.has(cb.value);
      });
      updateLiveKpisAndProgress();
      updateActionButtonsState();
      toast(\`סומנו \${S.searchHitSelection.size} חברות\`);
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
    case "exportSearchHitsCsv": {
      const hits = S.searchHits || [];
      if (hits.length === 0) {
        toast("אין תוצאות לייצוא", "warn");
        return;
      }
      const headers = ["שם החברה", "ח.פ.", "סוג חברה", "תחום", "אזור", "עיר", "עובדים", "אומדן/מספר רכבים", "מקור קביעת רכבים", "טלפון", "נייד", "אימייל", "מקורות מידע", "אימות טלפון", "דירוג איכות"];
      const rows = hits.map(h => [
        h.name,
        h.no,
        h.isVehicleIntensive ? "עתירת רכב" : "חברה כללית",
        h.ind,
        h.region,
        h.city,
        h.employeesCount ? (h.employeesCount + " (מאומת)") : h.workforceRange,
        h.fleetSizeDisplay,
        h.fleetMethodLabel,
        h.phone,
        h.mobile,
        h.email,
        (h.companySourcesList || []).join(" + "),
        h.phoneVerBadgeLabel,
        h.leadGradeLabel
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

fs.writeFileSync(targetFile, updated, "utf8");
console.log("Successfully written updated openprospector.html! New length:", updated.length);
