/**
 * Open a full printable / PDF-ready report for a vehicle, including
 * all sections from the vehicle card and the full event history.
 * Uses the browser's native print → "Save as PDF" flow.
 */

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL') : '—');
const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString('he-IL') : '—');
const fmtNum = (n?: number | string | null) =>
  n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('he-IL');

export interface VehicleHistoryEntry {
  id: string;
  event_type: string;
  event_date: string;
  title: string;
  description: string;
  odometer?: number | null;
  cost?: number | null;
  source?: string | null;
}

const EVENT_LABELS: Record<string, string> = {
  service: 'טיפול',
  repair: 'תיקון',
  fault: 'תקלה',
  inspection: 'בדיקה',
  ownership_transfer: 'העברת בעלות',
  odometer: 'עדכון קילומטראז׳',
  accident: 'תאונה',
  note: 'הערה',
  import: 'יבוא',
  insurance: 'ביטוח',
  test: 'טסט',
};

const SOURCE_LABELS: Record<string, string> = {
  manual: 'ידני',
  import: 'יבוא',
  system: 'מערכת',
  fault: 'תקלה',
  service_order: 'הזמנת שירות',
};

export function printVehicleReport(v: any, history: VehicleHistoryEntry[] = []) {
  const w = window.open('', '_blank', 'width=1000,height=800');
  if (!w) return;

  const section = (title: string, rows: Array<[string, any]>) => {
    const filled = rows.filter(([, val]) => val !== null && val !== undefined && val !== '');
    if (filled.length === 0) return '';
    return `
      <section>
        <h2>${title}</h2>
        <table class="kv"><tbody>
          ${filled.map(([k, val]) => `<tr><th>${k}</th><td>${val}</td></tr>`).join('')}
        </tbody></table>
      </section>`;
  };

  const j = (field: any, key: string) =>
    field && typeof field === 'object' && field[key] !== undefined && field[key] !== null ? field[key] : '';

  const histRows = history
    .slice()
    .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
    .map(
      h => `<tr>
        <td>${fmtDateTime(h.event_date)}</td>
        <td>${EVENT_LABELS[h.event_type] || h.event_type}</td>
        <td><b>${h.title || '—'}</b><div class="muted">${(h.description || '').replace(/\n/g, '<br/>')}</div></td>
        <td>${h.odometer ? fmtNum(h.odometer) + ' ק"מ' : ''}</td>
        <td>${h.cost ? '₪ ' + fmtNum(h.cost) : ''}</td>
        <td class="muted">${SOURCE_LABELS[h.source || 'manual'] || h.source || ''}</td>
      </tr>`
    )
    .join('');

  w.document.write(`<!doctype html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8" />
<title>דו"ח רכב — ${v.license_plate || ''}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Heebo','Arial',sans-serif; color:#111; line-height:1.5; }
  header { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid #0a2540; padding-bottom:10px; margin-bottom:20px; }
  header h1 { margin:0; font-size:26px; color:#0a2540; }
  header .meta { font-size:12px; color:#555; text-align:left; }
  h2 { font-size:16px; background:#0a2540; color:#fff; padding:6px 10px; margin:18px 0 8px; border-radius:6px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  table.kv th { width:38%; text-align:right; padding:4px 8px; background:#f5f7fa; font-weight:600; border:1px solid #e2e8f0; }
  table.kv td { padding:4px 8px; border:1px solid #e2e8f0; }
  table.hist th, table.hist td { padding:6px 8px; border:1px solid #e2e8f0; text-align:right; vertical-align:top; }
  table.hist th { background:#0a2540; color:#fff; font-size:11px; }
  .muted { color:#666; font-size:11px; margin-top:2px; }
  .empty { color:#999; font-style:italic; padding:8px; }
  .actions { text-align:center; margin:18px 0; }
  .actions button { background:#0a2540; color:#fff; border:0; padding:10px 24px; border-radius:8px; font-size:14px; cursor:pointer; margin:0 4px; }
  @media print { .actions { display:none; } }
</style>
</head>
<body>
  <header>
    <div>
      <h1>דו"ח רכב מלא — ${v.license_plate || ''}</h1>
      <div>${[v.manufacturer, v.model, v.year].filter(Boolean).join(' · ')}</div>
    </div>
    <div class="meta">
      <div>חברה: ${v.company_name || '—'}</div>
      <div>הופק: ${fmtDateTime(new Date().toISOString())}</div>
    </div>
  </header>

  <div class="actions">
    <button onclick="window.print()">🖨️ הדפס / שמור כ-PDF</button>
    <button onclick="window.close()">סגור</button>
  </div>

  ${section('1. פרטי רכב', [
    ['מספר רכב', v.license_plate],
    ['מספר פנימי', v.internal_number],
    ['VIN', v.vin],
    ['מספר מנוע', v.engine_number],
    ['יצרן', v.manufacturer],
    ['דגם', v.model],
    ['שנתון', v.year],
    ['כינוי', v.nickname],
    ['סוג רכב', v.vehicle_type],
    ['סוג דלק', v.fuel_type],
    ['סגמנט', v.segment],
    ['סוג בעלות', v.ownership_type],
    ['קילומטראז׳ נוכחי', v.odometer ? fmtNum(v.odometer) + ' ק"מ' : ''],
    ['סטטוס', v.status],
    ['תאריך עליה לכביש', fmtDate(v.road_entry_date)],
    ['מחלקה / ענף', v.department],
  ])}

  ${section('2. בעלות, ליסינג ומימון', [
    ['סוג מסלול', v.finance_track],
    ['חברת ליסינג', j(v.finance_details, 'company')],
    ['מספר הסכם', j(v.finance_details, 'agreement_number')],
    ['עלות חודשית', j(v.finance_details, 'monthly_cost')],
    ['תאריך התחלה', fmtDate(j(v.finance_details, 'start_date'))],
    ['תאריך סיום', fmtDate(j(v.finance_details, 'end_date'))],
    ['איש קשר', j(v.finance_details, 'contact_name')],
    ['טלפון', j(v.finance_details, 'contact_phone')],
  ])}

  ${section('3. ביטוחים ורישיונות', [
    ['ביטוח חובה — מבטח', j(v.insurances?.mandatory, 'company')],
    ['ביטוח חובה — תוקף', fmtDate(j(v.insurances?.mandatory, 'end_date') || v.insurance_expiry)],
    ['ביטוח מקיף — מבטח', j(v.insurances?.comprehensive, 'company')],
    ['ביטוח מקיף — תוקף', fmtDate(j(v.insurances?.comprehensive, 'end_date') || v.comprehensive_insurance_expiry)],
    ['צד ג׳ — תוקף', fmtDate(v.third_party_insurance_expiry)],
    ['תוקף טסט', fmtDate(v.test_expiry)],
    ['תוקף רישיון', fmtDate(v.license_expiry)],
  ])}

  ${section('4. ציוד וכלים', [
    ['סוג ציוד', v.equipment_type],
    ['מספר סידורי ציוד', v.equipment_serial],
    ['פירוט ציוד', v.equipment_details],
    ['שעות מנוע', v.engine_hours],
    ['כוח סוס', v.horsepower],
    ['KVA', v.kva],
  ])}

  ${section('5. טיפולים ותחזוקה', [
    ['שיטת תחזוקה', v.maintenance_method],
    ['טיפול אחרון', fmtDate(v.last_service_date)],
    ['טיפול הבא', fmtDate(v.next_service_date)],
    ['ק"מ לטיפול הבא', v.next_service_km],
    ['סוג טיפול', v.service_type],
    ['סטטוס טיפול', v.service_status],
    ['הערות טיפול', v.service_notes],
    ['מוסך', j(v.maintenance_details, 'garage')],
    ['ממונה תחזוקה', j(v.maintenance_details, 'manager')],
  ])}

  ${section('הערות כלליות', [['הערות', v.notes], ['תסקיר מהנדס', v.inspections_certificates]])}

  <section>
    <h2>11. היסטוריה ומעקב (${history.length} רשומות)</h2>
    ${histRows
      ? `<table class="hist"><thead><tr><th>תאריך</th><th>סוג אירוע</th><th>פרטים</th><th>קילומטראז׳</th><th>עלות</th><th>מקור</th></tr></thead><tbody>${histRows}</tbody></table>`
      : '<div class="empty">אין רשומות היסטוריה.</div>'}
  </section>

  ${section('14. מידע ייבוא', [
    ['מקור', v.import_source],
    ['קטגוריה', v.import_category],
    ['שם קובץ', v.import_file_name],
    ['תאריך ייבוא', fmtDateTime(v.import_date)],
    ['סטטוס', v.import_status],
  ])}
</body>
</html>`);
  w.document.close();
}
