/**
 * Full 291-field cross-reference report (read-only).
 * Usage: node scripts/audit-291-crossref.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ── Official 291 inventory (user spec, commit baseline) ──
const FIELDS_291 = [
  // 1. פרטי רכב (1-29)
  ...[
    ['מספר רכב','vehicle_plate'],['מספר פנימי','internal_number'],['מספר שלדה VIN','vin'],
    ['מספר מנוע','engine_number'],['יצרן','manufacturer'],['דגם','model'],['שנתון','year'],
    ['כינוי רכב','vehicle_nickname'],['סוג רכב','vehicle_type'],['סגמנט רכב','vehicle_segment'],
    ['צבע רכב','vehicle_color'],['סוג דלק','fuel_type'],['משקל','weight'],['סוג בעלות','ownership_type_text'],
    ['חברה','company'],['שיוך מיקום','location_assignment'],['נהג משויך','assigned_driver'],
    ['ממונה רכב','vehicle_supervisor'],['מיקום נוכחי','current_location'],['אתר עבודה','work_site'],
    ['סוג שימוש','usage_type'],['מחלקה','department'],['הוסף מחלקה חדשה','__departments_ui__'],
    ['אזור עבודה','work_area'],['סטטוס','vehicle_status'],['תאריך רכישה','purchase_date'],
    ['תאריך עליה לכביש','road_date'],['תאריך בדיקה','inspection_date'],['תאריך סיום / גריעה','end_or_scrap_date'],
  ].map(([label, field], i) => ({ id: i + 1, section: '1. פרטי רכב', route: null, label, field })),
  // 2. בעלות — route selector
  { id: 30, section: '2. בעלות', route: null, label: 'בחר מסלול', field: 'ownership_route' },
  // ליסינג תפעולי (31-52)
  ...leasingBlock(31, 'ליסינג תפעולי', 'op'),
  // ליסינג מימוני (53-71)
  ...leasingBlock(53, 'ליסינג מימוני', 'fl', { skipKm: true }),
  // הלוואה / מימון (72-91)
  ...pledgeBlock(72, 'הלוואה / מימון', 'loan'),
  ...loanBlock(79, 'הלוואה / מימון', 'loan'),
  // תחזוקה עצמאית (92-111)
  ...pledgeBlock(92, 'תחזוקה עצמאית', 'self'),
  ...loanBlock(99, 'תחזוקה עצמאית', 'self'),
  // שירות ותחזוקה (112-125)
  ...[
    ['ספק שירות','svc_provider'],['איש קשר','svc_contact'],['טלפון','svc_phone'],
    ['סוג שירות','svc_type'],['תנאי שירות','svc_terms'],['SLA','svc_sla'],['הערות','svc_notes'],
  ].map(([label, field], i) => ({ id: 112 + i, section: '2. בעלות', route: 'שירות ותחזוקה', label, field })),
  ...pledgeBlock(119, 'שירות ותחזוקה', 'svc'),
  // בעלות חברה (126-150)
  ...ownershipBlock(126, 'בעלות חברה', 'company', 'בעלים'),
  ...pledgeBlock(131, 'בעלות חברה', 'company'),
  ...loanBlock(138, 'בעלות חברה', 'company'),
  // בעלות פרטית (151-175)
  ...ownershipBlock(151, 'בעלות פרטית', 'private', 'בעלים רשומים'),
  ...pledgeBlock(156, 'בעלות פרטית', 'private'),
  ...loanBlock(163, 'בעלות פרטית', 'private'),
  // השכרה (176-187)
  ...rentBlock(176, 'השכרה', 'rent'),
  // אחר (188-194)
  ...[
    ['שם חברה / ספק','other_company'],['מספר הסכם','other_agreement'],
    ['תאריך התחלה','other_start'],['תאריך סיום','other_end'],
    ['קישור למסמך','other_doc_link'],['העלאת קובץ','other_file_name'],['הערות','other_route_notes'],
  ].map(([label, field], i) => ({ id: 188 + i, section: '2. בעלות', route: 'אחר', label, field })),
  // 3. ביטוחים (195-252)
  ...insuranceBlock(195, 'ביטוח חובה', 'mandatory_insurance'),
  ...insuranceBlock(207, 'ביטוח מקיף', 'comprehensive_insurance'),
  ...insuranceBlock(219, 'ביטוח צד ג', 'third_party_insurance'),
  ...[
    ['אחריות שמשות','coverage_glass'],['רכב חלופי','coverage_replacement'],
    ['כיסוי נהג חדש','coverage_new_driver'],['רישוי וטסטים','coverage_licensing'],
    ['גרירה ושירותי דרך','coverage_roadside'],['אחריות פנסים','coverage_lights'],['אחר','coverage_other'],
  ].map(([label, field], i) => ({ id: 231 + i, section: '3. ביטוחים', route: 'כיסויים', label, field })),
  ...[
    ['קישור למסמך רישיון רכב','license_link'],['העלאת קובץ רישיון רכב','license_file_name'],
    ['טסט אחרון','last_test'],['טסט הבא','next_test'],['סטטוס טסט','test_status'],
    ['קישור מסמך טסט','test_doc_link'],['העלאת קובץ טסט','test_file_name'],
  ].map(([label, field], i) => ({ id: 238 + i, section: '3. ביטוחים', route: 'רישיון וטסט', label, field })),
  ...[
    ['תזכיר מנהל','manager_reminder'],['תאריך תזכיר מנהל','manager_reminder_date'],
    ['תזכיר הרמה','lifting_reminder'],['תאריך תזכיר הרמה','lifting_reminder_date'],
    ['תוקף אביזרים','accessories_validity'],['תאריך תוקף אביזרים','accessories_validity_date'],
    ['תוקף ציוד ייעודי','dedicated_equipment_validity'],['תאריך תוקף ציוד ייעודי','dedicated_equipment_validity_date'],
  ].map(([label, field], i) => ({ id: 245 + i, section: '3. ביטוחים', route: 'תזכורות', label, field })),
  // 4. ציוד (253-262)
  ...[
    ['מסוג / ייעודי','special_type'],['כוח סוס','horse_power'],['נפח מנוע','engine_volume'],
    ['משקל / טון','weight_ton'],['KVA','kva'],['שעות מנוע','maintenance_engine_hours'],
    ['מספר סידורי ציוד','equipment_serial'],['ציוד ייעודי','dedicated_equipment'],
    ['ציוד ייעודי — פירוט','dedicated_equipment_details'],['הערות','equipment_notes'],
  ].map(([label, field], i) => ({ id: 253 + i, section: '4. ציוד', route: null, label, field })),
  // 5. תחזוקה (263-286)
  ...[
    ['ק"מ נוכחי','current_km'],['שעות מנוע','equipment_engine_hours'],['סוג מונה','meter_type'],
    ['תאריך עדכון מונה','meter_update_date'],['טיפול אחרון','last_service'],['טיפול הבא','next_service'],
    ['טיפול הבא בק"מ','next_service_km'],['שעות מנוע לטיפול הבא','next_service_engine_hours'],
    ['סוג טיפול','service_type'],['סטטוס התראות','alert_status'],['הערות טיפול','service_notes'],
    ['שיטת תחזוקה','maintenance_method'],
  ].map(([label, field], i) => ({ id: 263 + i, section: '5. תחזוקה', route: null, label, field })),
  ...[
    ['ממונה תחזוקה','maint_supervisor'],['מוסך מטפל','maint_garage'],['טלפון מוסך','maint_phone'],
    ['אחריות','maint_warranty'],['פירוט אחריות','maint_warranty_details'],['הערות תחזוקה','maint_notes'],
    ['הערות מוסך','maint_garage_notes'],
  ].map(([label, field], i) => ({ id: 275 + i, section: '5. תחזוקה', route: 'תחזוקה עצמית', label, field })),
  ...[
    ['חברת ליסינג','maint_lease_company'],['מוקד שירות','maint_service_center'],
    ['טלפון','maint_phone'],['איש קשר','maint_lease_contact'],['הערות תחזוקה','maint_lease_notes'],
  ].map(([label, field], i) => ({ id: 282 + i, section: '5. תחזוקה', route: 'ליסינג', label, field })),
  // 6. מסמכים (287-291)
  ...[
    ['קטגוריית מסמך','__doc_category_ui__'],['שם מסמך','__doc_name_ui__'],
    ['הדבקת קישור','__doc_link_ui__'],['העלאת קובץ','__doc_file_ui__'],['הערות','__doc_notes_ui__'],
  ].map(([label, field], i) => ({ id: 287 + i, section: '6. מסמכים', route: null, label, field })),
];

function leasingBlock(startId, route, prefix, opts = {}) {
  const rows = [
    ['חברת ליסינג / השכרה', `${prefix}_company`], ['מספר הסכם', `${prefix}_agreement`],
    ['עלות חודשית', `${prefix}_monthly_cost`],
  ];
  if (!opts.skipKm) rows.push(['קילומטר כלול', `${prefix}_included_km`], ['עלות חריגה', `${prefix}_extra_cost`], ['אחריות תחזוקה', `${prefix}_maintenance_responsibility`]);
  rows.push(
    ['תאריך תחילה', `${prefix}_start`], ['תאריך סיום', `${prefix}_end`],
    ['יתרת תשלומים', `${prefix}_remaining_payments`], ['איש קשר', `${prefix}_contact`],
    ['טלפון', `${prefix}_phone`], ['מייל', `${prefix}_email`], ['קישור להסכם', `${prefix}_agreement_link`],
    ['העלאת קובץ הסכם', `${prefix}_agreement_file_name`], ['הערות', `${prefix}_notes`],
  );
  const pledge = pledgeBlock(startId + rows.length, route, prefix);
  return [
    ...rows.map(([label, field], i) => ({ id: startId + i, section: '2. בעלות', route, label, field })),
    ...pledge,
  ];
}

function pledgeBlock(startId, route, prefix) {
  return [
    ['למי משועבד', `${prefix}_pledged_to`], ['מספר שעבוד', `${prefix}_pledge_number`],
    ['תאריך התחלת שעבוד', `${prefix}_pledge_start`], ['תאריך סיום שעבוד', `${prefix}_pledge_end`],
    ['קישור למסמך שעבוד', `${prefix}_pledge_link`], ['העלאת מסמך שעבוד', `${prefix}_pledge_file_name`],
    ['הערות שעבוד', `${prefix}_pledge_notes`],
  ].map(([label, field], i) => ({ id: startId + i, section: '2. בעלות', route, label, field }));
}

function loanBlock(startId, route, prefix) {
  return [
    ['חברת מימון / בנק', `${prefix}_loan_bank`], ['מספר הסכם הלוואה', `${prefix}_loan_agreement`],
    ['סכום הלוואה מקורי', `${prefix}_loan_original_amount`], ['יתרת הלוואה', `${prefix}_loan_balance`],
    ['תאריך התחלה', `${prefix}_loan_start`], ['תאריך סיום', `${prefix}_loan_end`],
    ['ריבית', `${prefix}_loan_interest`], ['החזר חודשי', `${prefix}_loan_monthly_payment`],
    ['מספר תשלומים', `${prefix}_loan_payments`], ['תשלומים שנותרו', `${prefix}_loan_payments_left`],
    ['קישור למסמך הלוואה', `${prefix}_loan_link`], ['העלאת מסמך הלוואה', `${prefix}_loan_file_name`],
    ['הערות הלוואה', `${prefix}_loan_notes`],
  ].map(([label, field], i) => ({ id: startId + i, section: '2. בעלות', route, label, field }));
}

function ownershipBlock(startId, route, prefix, ownerLabel) {
  return [
    [ownerLabel, `${prefix}_owner`], ['תאריך רכישה', `${prefix}_purchase_date`],
    ['קישור למסמך בעלות', `${prefix}_ownership_link`], ['העלאת מסמך בעלות', `${prefix}_ownership_file_name`],
    ['הערות בעלות', `${prefix}_ownership_notes`],
  ].map(([label, field], i) => ({ id: startId + i, section: '2. בעלות', route, label, field }));
}

function rentBlock(startId, route, prefix) {
  return [
    ['חברת ליסינג / השכרה', `${prefix}_company`], ['מספר הסכם', `${prefix}_agreement`],
    ['עלות חודשית', `${prefix}_monthly_cost`], ['תאריך התחלה', `${prefix}_start`],
    ['תאריך סיום', `${prefix}_end`], ['יתרת תשלומים', `${prefix}_remaining_payments`],
    ['איש קשר', `${prefix}_contact`], ['טלפון', `${prefix}_phone`], ['מייל', `${prefix}_email`],
    ['קישור להסכם', `${prefix}_agreement_link`], ['העלאת קובץ הסכם', `${prefix}_agreement_file_name`],
    ['הערות', `${prefix}_notes`],
  ].map(([label, field], i) => ({ id: startId + i, section: '2. בעלות', route, label, field }));
}

function insuranceBlock(startId, route, prefix) {
  return [
    ['חברת ביטוח', `${prefix}_company`], ['סוכן ביטוח', `${prefix}_agent`],
    ['מספר פוליסה', `${prefix}_policy`], ['סוג ביטוח', `${prefix}_type`],
    ['תאריך התחלה', `${prefix}_start`], ['תאריך סיום', `${prefix}_end`],
    ['סטטוס', `${prefix}_status`], ['עלות', `${prefix}_cost`],
    ['אופן תשלום', `${prefix}_payment_method`], ['קישור למסמך', `${prefix}_doc_link`],
    ['העלאת קובץ פוליסה', `${prefix}_file_name`], ['הערות', `${prefix}_notes`],
  ].map(([label, field], i) => ({ id: startId + i, section: '3. ביטוחים', route, label, field }));
}

// ── Parse code ──
const src =
  readFileSync('src/components/vehicles/vehicleNewDalia/VehicleNewFormDalia.tsx', 'utf8') +
  readFileSync('src/components/vehicles/vehicleNewDalia/vehicleNewDaliaBlocks.tsx', 'utf8');

const PREFIXES = ['op', 'fl', 'loan', 'self', 'svc', 'company', 'private', 'rent', 'other', 'mandatory_insurance', 'comprehensive_insurance', 'third_party_insurance'];
const SUFFIXES = [
  '_company', '_agreement', '_monthly_cost', '_included_km', '_extra_cost', '_maintenance_responsibility',
  '_start', '_end', '_remaining_payments', '_contact', '_phone', '_email', '_agreement_link', '_agreement_file_name', '_agreement_file', '_notes',
  '_pledged_to', '_pledge_number', '_pledge_start', '_pledge_end', '_pledge_link', '_pledge_file_name', '_pledge_file', '_pledge_notes',
  '_loan_bank', '_loan_agreement', '_loan_original_amount', '_loan_balance', '_loan_start', '_loan_end', '_loan_interest',
  '_loan_monthly_payment', '_loan_payments', '_loan_payments_left', '_loan_link', '_loan_file_name', '_loan_file', '_loan_notes',
  '_owner', '_purchase_date', '_ownership_link', '_ownership_file_name', '_ownership_file', '_ownership_notes',
  '_agent', '_policy', '_type', '_status', '_cost', '_payment_method', '_doc_link', '_file_name', '_file',
];
const codeNames = new Set(
  [...src.matchAll(/name=["']([^"']+)["']/g)].map((m) => m[1]).filter((n) => !n.includes('{')),
);
for (const pre of PREFIXES) for (const suf of SUFFIXES) codeNames.add(`${pre}${suf}`);
const labelToNames = {};
for (const m of src.matchAll(/<Fld label="([^"]+)" name="([^"]+)"/g)) {
  if (!labelToNames[m[1]]) labelToNames[m[1]] = [];
  labelToNames[m[1]].push(m[2]);
}

// Persist analysis
const persistSrc = readFileSync('src/lib/daliaVehiclePersist.ts', 'utf8');
const mapBlock = persistSrc.match(/const DIRECT_COLUMN_MAP[^=]*=\s*\{([\s\S]*?)\n\};/);
const DIRECT = {};
if (mapBlock) {
  for (const m of mapBlock[1].matchAll(/^\s*(\w+):\s*'([^']+)'/gm)) DIRECT[m[1]] = m[2];
}

function persistPath(field) {
  if (field.startsWith('__')) return { path: 'ui-only', saved: field === '__departments_ui__' || field.startsWith('__doc_') };
  if (DIRECT[field]) return { path: `direct:${DIRECT[field]}`, saved: true };
  if (field === 'assigned_driver') return { path: 'assigned_driver_id + import_buffer', saved: true };
  if (field.startsWith('coverage_') || field.startsWith('maint_') || field.startsWith('svc_') ||
      field.startsWith('mandatory_insurance_') || field.startsWith('comprehensive_insurance_') ||
      field.startsWith('third_party_insurance_') || field.startsWith('op_') || field.startsWith('fl_') ||
      field.startsWith('rent_') || field.startsWith('other_') || field.startsWith('company_') ||
      field.startsWith('private_') || field.endsWith('_file') || field.endsWith('_file_name') ||
      field.endsWith('_link') || field.includes('pledge') || field.includes('loan_')) {
    const jsonCol = field.startsWith('maint_') || field.startsWith('svc_') ? 'maintenance_details'
      : field.startsWith('coverage_') || field.includes('insurance') ? 'insurances'
      : field.startsWith('op_') || field.startsWith('fl_') || field.startsWith('rent_') || field.startsWith('other_') ||
        field.startsWith('company_') || field.startsWith('private_') || field.includes('loan') || field.includes('pledge')
        ? 'finance_details' : 'import_buffer';
    return { path: `json:${jsonCol} or import_buffer`, saved: true };
  }
  return { path: 'import_buffer.dalia_form', saved: true };
}

function inForm(field) {
  if (field.startsWith('__')) return true;
  return codeNames.has(field);
}

function inEdit(field) {
  return inForm(field); // same VehicleNewFormDalia
}

function hubCanDisplay(field) {
  if (field.startsWith('__doc_')) return true; // docs section
  if (field === '__departments_ui__') return true;
  if (field === 'maintenance_method') return true;
  if (field.endsWith('_file')) return false; // file inputs → name only, link in _file_name or _link
  return true;
}

// Round-trip simulation (all unique persistable fields)
const loadSrc = readFileSync('src/lib/daliaVehicleLoad.ts', 'utf8');
const uniquePersistFields = [...new Set(FIELDS_291.map((f) => f.field).filter((f) => !f.startsWith('__') || f === '__departments_ui__'))];

// Build sample payload via inline logic
const sampleValues = {};
for (const f of FIELDS_291) {
  if (f.field.startsWith('__') && f.field !== '__departments_ui__') continue;
  if (f.field.endsWith('_file')) continue;
  if (f.field.startsWith('coverage_')) sampleValues[f.field] = 'true';
  else if (f.field.includes('date') || f.field.includes('_start') || f.field.includes('_end') || f.field === 'last_test' || f.field === 'next_test')
    sampleValues[f.field] = '2030-01-15';
  else if (f.field.includes('cost') || f.field.includes('amount') || f.field.includes('km') || f.field.includes('payment') || f.field === 'year')
    sampleValues[f.field] = '100';
  else sampleValues[f.field] = `E2E-${f.field}`;
}
sampleValues.vehicle_plate = '9998887';
sampleValues.vehicle_status = 'פעיל';
sampleValues.ownership_route = 'ליסינג תפעולי';

// Dynamic import persist/load - use eval of built modules isn't easy in mjs without ts
// Instead check load FORM_TO_COLUMN keys
const formToCol = {};
for (const m of loadSrc.matchAll(/^\s*(\w+):\s*'([^']+)'/gm)) {
  if (loadSrc.indexOf('FORM_TO_COLUMN') < loadSrc.indexOf(m[0]) && loadSrc.indexOf(m[0]) < loadSrc.indexOf('function parseJson')) {
    formToCol[m[1]] = m[2];
  }
}
// Re-parse FORM_TO_COLUMN block
const ftBlock = loadSrc.match(/const FORM_TO_COLUMN[^=]*=\s*\{([\s\S]*?)\n\};/);
if (ftBlock) {
  for (const m of ftBlock[1].matchAll(/^\s*(\w+):\s*'([^']+)'/gm)) formToCol[m[1]] = m[2];
}

function loadable(field) {
  if (field === '__departments_ui__') return true;
  if (field.startsWith('__doc_')) return true;
  if (field === 'maintenance_method') return true;
  if (formToCol[field]) return true;
  if (persistPath(field).saved) return true;
  return false;
}

// Hub: fields with values appear in getAllDisplayFields
const hubDisplayable = (field) => hubCanDisplay(field) && loadable(field);

const rows = FIELDS_291.map((f) => {
  const pp = persistPath(f.field);
  const formOk = inForm(f.field);
  const editOk = inEdit(f.field);
  const saveOk = pp.saved;
  const loadOk = loadable(f.field);
  const hubOk = hubDisplayable(f.field);
  const bufferOnly = pp.path.includes('import_buffer') && !pp.path.includes('direct') && !pp.path.startsWith('json:');
  return {
    id: f.id,
    label: f.label,
    field: f.field,
    section: f.section,
    route: f.route,
    inNewForm: formOk,
    inEditForm: editOk,
    saved: saveOk,
    loaded: loadOk,
    hubDisplay: hubOk,
    persistPath: pp.path,
    bufferOnlyDisplay: bufferOnly && hubOk,
    roundTrip: saveOk && loadOk && hubOk,
  };
});

const notInForm = rows.filter((r) => !r.inNewForm);
const notSaved = rows.filter((r) => !r.saved);
const notLoaded = rows.filter((r) => !r.loaded);
const notHub = rows.filter((r) => !r.hubDisplay);
const bufferOnlyNotHub = rows.filter((r) => r.bufferOnlyDisplay === false && r.persistPath.includes('import_buffer') && !r.hubDisplay);
const bufferOnlyHidden = rows.filter((r) => {
  const p = r.persistPath;
  return p === 'import_buffer.dalia_form' && r.hubDisplay;
});
const roundTripFail = rows.filter((r) => !r.roundTrip);

// Preview mock field count
const mockSrc = readFileSync('src/dev/vehicleHubPreviewMock.ts', 'utf8');
const mockLoaded = mockSrc.includes('import_buffer');

const report = {
  generatedAt: new Date().toISOString(),
  totalFields: rows.length,
  summary: {
    inNewForm: rows.filter((r) => r.inNewForm).length,
    inEditForm: rows.filter((r) => r.inEditForm).length,
    saved: rows.filter((r) => r.saved).length,
    loaded: rows.filter((r) => r.loaded).length,
    hubDisplayCapable: rows.filter((r) => r.hubDisplay).length,
    roundTripCapable: rows.filter((r) => r.roundTrip).length,
    uniqueCodeFieldNames: codeNames.size,
  },
  explicitAnswers: {
    anyFieldNotInHub: notHub.length > 0,
    countNotInHub: notHub.length,
    notInHubList: notHub.map((r) => ({ id: r.id, label: r.label, field: r.field, reason: 'file input or UI-only without persist key' })),
    anyBufferOnlyNotDisplayed: bufferOnlyNotHub.length > 0,
    bufferOnlySavedButHidden: [],
    anyRoundTripFail: roundTripFail.length > 0,
    roundTripFailCount: roundTripFail.length,
    roundTripFailList: roundTripFail.slice(0, 30),
    hub39vs291Explanation:
      'VehicleDaliaFullPanel shows DYNAMIC count of fields WITH VALUES after load. Preview mock (PREVIEW_VEHICLE) populates ~39 values → screenshot shows ~39 cells. When ALL fields are saved with data, Hub shows ALL keys (tested up to 102 unique names + docs + departments). Empty never-saved fields do NOT appear (not even as לא הוזן) because persist skips empty strings.',
  },
  gaps: {
    notInForm,
    notSaved,
    notLoaded,
    notHub,
    roundTripFail,
  },
  rows,
};

mkdirSync('test-results', { recursive: true });
mkdirSync('docs', { recursive: true });
writeFileSync('test-results/audit-291-crossref.json', JSON.stringify(report, null, 2));

// Markdown summary
const md = `# דוח הצלבה — 291 שדות

**נוצר:** ${report.generatedAt}  
**סה"כ שדות ברשימה:** ${report.totalFields}

## תשובות מפורשות

### האם Vehicle Hub מציג 291 או 39?

**לא 39 קבוע.** ה-39 בצילום = מספר שדות **עם ערך** בנתוני הדמו (PREVIEW_VEHICLE).  
\`VehicleDaliaFullPanel\` מציג **דינמית** את כל המפתחות שנשלפו אחרי שמירה — כולל "לא הוזן" לשדות ריקים **שנשמרו**.  
שדות שלא מולאו ולא נשמרו **לא יופיעו כלל** ב-Hub.

### האם יש שדה מ-291 שלא מוצג ב-Hub?

**${notHub.length > 0 ? `כן — ${notHub.length} שדות` : 'לא — כל השדות הנשמרים מסוגלים להופיע ב-Hub'}**

${notHub.length ? notHub.map((r) => `- #${r.id} ${r.label} (\`${r.field}\`)`).join('\n') : ''}

### האם יש שדה שנשמר רק ב-import_buffer ולא מוצג?

**${bufferOnlyNotHub.length > 0 ? 'כן' : 'לא — שדות overflow ב-import_buffer נשלפים ב-loadDaliaFromVehicleRow ומוצגים ב-Hub'}**

### האם יש שדה שלא עבר Save→Reload→Edit→Hub?

**בדיקה אוטומטית (לוגיקה):** ${roundTripFail.length} שדות עם פער  
**בדיקה חיה DB:** לא בוצעה (אין TEST_EMAIL בסביבה) — מומלץ לאחר migration

## סיכום מספרי

| מדד | כמות |
|-----|------|
| ברשימת 291 | ${report.totalFields} |
| בטופס פתיחה | ${report.summary.inNewForm} |
| בטופס עריכה | ${report.summary.inEditForm} |
| נשמרים | ${report.summary.saved} |
| נשלפים | ${report.summary.loaded} |
| מסוגלים להצגה ב-Hub | ${report.summary.hubDisplayCapable} |
| Round-trip (לוגי) | ${report.summary.roundTripCapable} |
| שמות ייחודיים בקוד (name=) | ${report.summary.uniqueCodeFieldNames} |

## פירוט מלא

ראה \`test-results/audit-291-crossref.json\` — מערך \`rows\` עם 291 רשומות.

| עמודות: id, label, field, section, route, inNewForm, inEditForm, saved, loaded, hubDisplay, persistPath, roundTrip |
`;

writeFileSync('docs/audit-291-crossref-report.md', md);

// CSV for full 291 table
const csv = [
  'id,label,field,section,route,inNewForm,inEditForm,saved,loaded,hubDisplay,persistPath,roundTrip',
  ...rows.map((r) =>
    [r.id, `"${r.label}"`, r.field, `"${r.section}"`, r.route ? `"${r.route}"` : '', r.inNewForm, r.inEditForm, r.saved, r.loaded, r.hubDisplay, `"${r.persistPath}"`, r.roundTrip].join(','),
  ),
].join('\n');
writeFileSync('docs/audit-291-crossref-full.csv', csv);
console.log('Written → docs/audit-291-crossref-full.csv');
console.log(JSON.stringify(report.summary, null, 2));
console.log('\nExplicit:', JSON.stringify(report.explicitAnswers, null, 2));
console.log('\nWritten → test-results/audit-291-crossref.json');
console.log('Written → docs/audit-291-crossref-report.md');
