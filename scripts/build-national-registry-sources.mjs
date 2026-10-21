// Builds the nr_sources seed migration from the real OpenProspector catalog (ALL_130_SOURCES in
// public/openprospector-sources-catalog.js) + the 5 sources added on 2026-10-18 + datasets found by scanning
// data.gov.il (2,146 datastore resources, 2026-10-18). Each source gets its real status – nothing is
// marked "completed" here; only the collector marks a source completed after reading it to the end.
// Usage: node scripts/build-national-registry-sources.mjs [path/to/candidates.json]
import fs from "node:fs";

const src = fs.readFileSync("public/openprospector-sources-catalog.js", "utf8");
const w = {};
new Function("window", "self", "globalThis", "root", src)(w, w, w, w);
const CAT = w.ALL_130_SOURCES;
if (!Array.isArray(CAT) || CAT.length !== 130) throw new Error("catalog not found");

const DS = (rid) => `https://data.gov.il/api/3/action/datastore_search?resource_id=${rid}`;
const OGL = "data.gov.il – מידע ציבורי פתוח (רישיון שימוש חופשי במידע ממשלתי)";

// collectors for catalog entries that have an automated, permitted bulk path
const COLLECT = {
  71: { key: "garages", rid: "bb68386a-a331-4bbc-b668-bba2766d517d", priority: 10 },
  61: { key: "contractors", rid: "4eb61bd6-18cf-4e7c-9f9c-e166dfa0a2d8", priority: 11 },
  63: { key: "plants", rid: "7ad8ddc7-87f4-45f9-84e4-d7f972662153", priority: 12 },
  59: { key: "manpower", rid: "243fe1ce-b2ae-4c26-9e5e-ce306a602040", priority: 13 },
  58: { key: "employers", rid: "b033f289-4143-4a9d-9612-da6e8cc2f380", priority: 14 },
  72: { key: "tourism_vat", rid: "b2a6567c-b6d9-439e-9044-7874f4480797", priority: 15 },
  54: { key: "companies", rid: "f004176c-b85f-4542-8901-7b3176f9a054", priority: 30, filters: { "סטטוס חברה": "פעילה" },
        note: "נאספות חברות בסטטוס 'פעילה' בלבד (406,878 לפי בדיקה 2026-10-18); 144,506 חברות מחוקות לא נאספות" },
  56: { key: "amutot", rid: "be5b7935-3922-45d4-9638-08871b17ec95", priority: 31 },
  55: { key: "chalatz", rid: "85e40960-5426-4f4c-874f-2d1ec1b94609", priority: 32 },
  69: { key: "factories", rid: "88d1883c-3b7a-4580-9be9-6d54659666c3", priority: 40 },
  65: { key: "gov_suppliers", rid: "65c8fced-c50c-400e-94fb-ef1a208c43e5", priority: 41, page: 2000 },
  62: { key: "business_licenses", rid: "7d4c61e2-2416-453e-8efb-bd02ec89db35", priority: 50 },
  64: { key: "asbestos", rid: "512d916e-07f0-4774-b84a-3a989e45e7eb", priority: 51 },
};
const ALIAS = { 60: 59, 68: 65 };
const DEAD = { 70: "e7ee72f3", 78: "bf998a46", 79: "534b8c9c", 120: "09c4d9cb" };
const UNSUPPORTED = {
  13: "GitHub Organizations – אין רשומות עסקים ישראליים עם פרטי קשר; לא רלוונטי למאגר",
  73: "מאגר חומרי הדברה – רשומות של מוצרים, רק שם בעל הרישיון ללא פרטי עסק",
  77: "ArcGIS עיריית תל אביב – לא נמצאה שכבת עסקים עם שם ופרטי קשר שמותר לאסוף; דורש מיפוי ידני",
  116: "תיקי פיקוח של נציבות שוויון – רשומות פיקוח ולא רשימת עסקים",
};
const HTML_DIR = [121, 122, 123, 124, 125, 127, 128, 129];

const rows = [];
const add = (r) => rows.push({ data_types: [], terms: null, status_reason: null, config: {}, priority: 1000, provider: null, ...r });

for (const s of CAT) {
  const id = s.id, key = "cat:" + id;
  const base = { key, catalog_id: String(id), name: s.name, url: s.url, provider: s.catName, data_types: s.dataTypes || [] };
  if (COLLECT[id]) {
    const c = COLLECT[id];
    add({ ...base, url: DS(c.rid), kind: "ckan", terms: OGL, status: "pending", priority: c.priority, status_reason: c.note || null,
      config: { rid: c.rid, mapper: c.key, ...(c.filters ? { filters: c.filters } : {}), ...(c.page ? { page: c.page } : {}) } });
  } else if (ALIAS[id]) {
    const c = COLLECT[ALIAS[id]];
    add({ ...base, url: DS(c.rid), kind: "alias", terms: OGL, status: "pending", priority: c.priority,
      status_reason: `אותו מאגר כמו מקור ${ALIAS[id]} – יסומן כהושלם כשמקור ${ALIAS[id]} יושלם`, config: { alias_of: "cat:" + ALIAS[id], rid: c.rid + "#alias" } });
  } else if (id === 27) {
    add({ ...base, url: "https://overpass-api.de/api/interpreter", kind: "overpass", priority: 70, status: "pending",
      terms: "OpenStreetMap – ODbL 1.0, חובת ייחוס © OpenStreetMap contributors; Overpass: שאילתה אחת בכל פעם",
      config: { queries: [
        { label: "חנויות", filter: '["shop"]' },
        { label: "משרדים", filter: '["office"]' },
        { label: "בעלי מלאכה", filter: '["craft"]' },
        { label: "רכב", filter: '["amenity"~"^(car_repair|car_rental|car_wash|fuel|vehicle_inspection|charging_station)$"]' },
        { label: "מזון ואירוח", filter: '["amenity"~"^(restaurant|cafe|fast_food|bar|pub|ice_cream|food_court)$"]' },
        { label: "בריאות", filter: '["amenity"~"^(pharmacy|clinic|dentist|doctors|veterinary)$"]|["healthcare"]' },
        { label: "חינוך פרטי ושירותים", filter: '["amenity"~"^(kindergarten|driving_school|language_school|music_school|bank|bureau_de_change|post_office|courier)$"]' },
        { label: "תיירות ולינה", filter: '["tourism"~"^(hotel|guest_house|hostel|motel|apartment|chalet|camp_site)$"]' },
        { label: "תעשייה וחברות", filter: '["industrial"]|["company"]|["man_made"="works"]' },
      ] } });
  } else if (DEAD[id]) {
    add({ ...base, kind: "manual", status: "error", status_reason: `resource_id ${DEAD[id]} כבר לא קיים ב-data.gov.il (מחזיר עמוד שגיאה, נבדק 2026-10-18)` });
  } else if (UNSUPPORTED[id]) {
    add({ ...base, kind: "manual", status: "unsupported", status_reason: UNSUPPORTED[id] });
  } else if (id === 37) {
    add({ ...base, kind: "blocked", status: "blocked", status_reason: "OpenCorporates דורש מפתח API (תוכנית חינמית לשימוש לא מסחרי בלבד); לא הופעל" });
  } else if (HTML_DIR.includes(id)) {
    add({ ...base, kind: "manual", status: "unsupported", status_reason: "אתר ארגון / מדריך HTML ללא API או קובץ נתונים; תנאי השימוש לא מתירים במפורש איסוף אוטומטי – לא נאסף" });
  } else if (id === 16) {
    add({ ...base, kind: "blocked", status: "blocked", status_reason: "Google Search: אין ממשק חיפוש מורשה ללא מפתח Programmable Search API (מוגבל ל-100 שאילתות ביום ובתשלום מעבר לכך). גילוי מקורות מתבצע דרך קטלוג data.gov.il" });
  } else if (s.status === "auth_paid") {
    // reason text stays in the catalog (ALL_130_SOURCES[].blockReason); the dashboard shows it from there
    add({ ...base, url: null, provider: null, data_types: [], kind: "paid", status: "blocked", status_reason: s.blockReason ? null : "דורש התחברות או תשלום" });
  } else if (s.status === "inaccessible_or_unfit") {
    add({ ...base, url: null, provider: null, data_types: [], kind: "blocked", status: "blocked", status_reason: s.blockReason ? null : "לא זמין" });
  } else {
    add({ ...base, url: null, provider: null, data_types: [], kind: "manual", status: "unsupported", status_reason: s.blockReason ? null : "חיפוש ידני בלבד – אין גישה אוטומטית מותרת" });
  }
}

// the 5 sources added on 2026-10-18 (total 135)
const EXTRA = [
  ["welfare", "מסגרות רווחה – משרד הרווחה", "de069ddf-bcbc-4754-bda0-84873a353f7b", 16],
  ["daycare", "מעונות יום – משרד העבודה", "0f67a263-d9f4-44d4-9816-c96e9dfbc7e5", 17],
  ["museums", "מוזאונים מוכרים – משרד התרבות", "0309ee10-21a0-4ee9-8094-8fb474ca208a", 20],
  ["protected_housing", "בתי דיור מוגן", "7c390473-42b8-4fd2-a72d-07fa126ffeee", 21],
  ["mail_permits", "בעלי היתר שירותי דואר – משרד התקשורת", "d6add630-6731-4534-9383-cb780fb0c268", 52],
];
for (const [k, name, rid, pr] of EXTRA) add({ key: "src:" + k, catalog_id: k, name, url: DS(rid), provider: "data.gov.il", kind: "ckan", terms: OGL, status: "pending", priority: pr, config: { rid, mapper: k } });

// new sources found by scanning data.gov.il (2026-10-18) and mapped by hand
const NEW = [
  ["pension_funds", "פרטי קופות גמל ופנסיה – רשות שוק ההון", "b5223cbc-e1b2-4503-a499-97cdcd7190d2", 18],
  ["cooperatives", "רשם האגודות השיתופיות", "cad6bb66-5560-4cf4-a39c-92518f3f18ef", 19],
  ["liquidation", "חברות בפירוק מרצון בהליך מזורז – רשם החברות", "6f3f0df3-5968-4135-81c5-8dd76bf89410", 33],
  ["tenders", "דוח מכרזים – ספקים זוכים", "7038b3e6-a74d-442e-b16b-466c8196124a", 42, "gov_suppliers"],
  ["transport_trade", "סחר, יבוא וייצור מוצרי תעבורה – משרד התחבורה", "42e73a60-7acc-4c5d-b4ec-b0e468a73c51", 53],
  ["fuel_stations", "מאגר תחנות הדלק", "ff3b653c-d268-4eb7-a86b-6de69e77043a", 54],
  ["extinguishers", "מבקרים ותחזוקאי מטפים מורשים", "ea004fd2-251e-4ea1-9b03-0eefb51b8f74", 55],
  ["bank_branches", "סניפי בנקים – בנק ישראל", "b3f7616d-1c65-497d-afd5-d5ba972bfc1d", 56],
];
for (const [k, name, rid, pr, mapper] of NEW) add({ key: "dgov:" + k, catalog_id: null, name, url: DS(rid), provider: "data.gov.il (התגלה בסריקה)", kind: "ckan", terms: OGL, status: "pending", priority: pr, config: { rid, mapper: mapper || k } });
add({ key: "dgov:bus_fleet", name: "צי אוטובוסים לפי מפעיל – משרד התחבורה (מידע על צי רכב)", url: DS("91d298ed-a260-4f93-9d50-d5e3c5b82ce1"), provider: "data.gov.il", kind: "fleet_ckan", terms: OGL, status: "pending", priority: 60, data_types: ["צי רכב", "מספר רכבים", "סוגי רכבים"], config: { rid: "91d298ed-a260-4f93-9d50-d5e3c5b82ce1" } });
add({ key: "website_crawl", name: "אתרי האינטרנט של העסקים (עמוד הבית, robots.txt נשמר)", url: null, provider: "אתר העסק", kind: "website", terms: "עמוד ציבורי של העסק בלבד; מכבד robots.txt; בקשה אחת לאתר", status: "pending", priority: 80, data_types: ["טלפון", "אימייל", "רשתות חברתיות", "טופס יצירת קשר", "WhatsApp"] });
add({ key: "discovery_dgov", name: "גילוי מקורות חדשים – סריקת קטלוג data.gov.il", url: "https://data.gov.il/api/3/action/package_search", provider: "data.gov.il", kind: "discovery", terms: OGL, status: "completed", priority: 999, status_reason: "סריקה מלאה ראשונה 2026-10-18: 1,202 מאגרים, 2,146 משאבים, 75 נראים כרשימות עסקים; סריקה שבועית אוטומטית", config: { last_scan: "2026-10-18T00:00:00Z" } });

// remaining discovered business-like datasets, not mapped yet (real status: unsupported until mapped)
const candPath = process.argv[2];
if (candPath && fs.existsSync(candPath)) {
  const known = new Set(rows.map((r) => String(r.config.rid || "").slice(0, 36)));
  const SKIP = /תמ"א|תחנות מטאורולוגיות|קונסול|רבני|מקבלי הטבה|פנסיה-נט|ביטוח-נט|חומרי הדברה|כמות מוכרת|לשכות מידע|מדד השפעה|English|אנגלית|באנגלית|XLSX|רב שנתי|שינויים בתאגידים|סימני מסחר|עיוורון/;
  for (const c of JSON.parse(fs.readFileSync(candPath, "utf8"))) {
    if (known.has(c.rid) || SKIP.test(c.title + " " + c.rname)) continue;
    const reason = c.total < 30 ? `רשימה קטנה (${c.total} רשומות) – לא מופתה בשלב זה` : "התגלה בסריקה – ממתין למיפוי שדות לפני איסוף";
    add({ key: "dgov:" + c.rid.slice(0, 8), name: `${c.title} / ${c.rname}`.slice(0, 200), url: DS(c.rid), provider: c.org || "data.gov.il",
      kind: "discovered", terms: c.license || OGL, status: "unsupported", priority: 900, status_reason: reason, data_types: Object.entries(c.m).filter(([, v]) => v.length).map(([k]) => k),
      config: { rid: c.rid, total: c.total } });
  }
}

const q = (v) => (v == null ? "NULL" : "'" + String(v).replace(/'/g, "''") + "'");
const arr = (a) => "ARRAY[" + a.map(q).join(",") + "]::text[]";
const values = rows.map((r) => `(${[q(r.key), q(r.catalog_id), q(r.name), q(r.url), q(r.provider), q(r.kind), arr(r.data_types), q(r.terms), q(r.status), q(r.status_reason), r.priority, q(JSON.stringify(r.config)) + "::jsonb"].join(", ")})`);
const sql = `-- Staging ONLY: usfeoerkpcafxxlyuldl. Generated by scripts/build-national-registry-sources.mjs – do not edit by hand.
-- ${rows.length} sources: 130 catalog + 5 added 2026-10-18 + data.gov.il discoveries + website crawl + discovery job.
INSERT INTO public.nr_sources (key, catalog_id, name, url, provider, kind, data_types, terms, status, status_reason, priority, config) VALUES
${values.join(",\n")}
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url, provider = EXCLUDED.provider, kind = EXCLUDED.kind,
  data_types = EXCLUDED.data_types, terms = EXCLUDED.terms, priority = EXCLUDED.priority, config = EXCLUDED.config,
  status = CASE WHEN nr_sources.status IN ('pending','unsupported','blocked','error') AND nr_sources.records_read = 0 THEN EXCLUDED.status ELSE nr_sources.status END,
  status_reason = CASE WHEN nr_sources.records_read = 0 THEN EXCLUDED.status_reason ELSE nr_sources.status_reason END;
`;
fs.writeFileSync("supabase/migrations/20261018172000_national_registry_sources_seed_staging.sql", sql);
const by = {};
rows.forEach((r) => { by[r.status] = (by[r.status] || 0) + 1; });
console.log(rows.length, "sources", by);
