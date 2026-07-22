/**
 * Open a styled, RTL print view for a driver declaration including the
 * full text and the signature image. Works on desktop and mobile browsers.
 */

import { resolveStoredDeclarationText } from '@/utils/declarationTemplates';

export interface DeclarationPrintData {
  driver_name: string;
  id_number: string | null;
  license_number: string | null;
  company_name: string | null;
  status: string;
  signed_at: string | null;
  signature_url: string | null;
  expires_at: string | null;
  created_at: string;
  declaration_text?: string | null;
}

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('he-IL') : '—';

export function printDeclaration(declaration: DeclarationPrintData) {
  const text = resolveStoredDeclarationText(declaration.declaration_text, {
    driver_name: declaration.driver_name,
    id_number: declaration.id_number,
    license_number: declaration.license_number,
    company_name: declaration.company_name,
    date: declaration.created_at
      ? new Date(declaration.created_at).toLocaleDateString('he-IL')
      : new Date().toLocaleDateString('he-IL'),
  });

  const signatureBlock = declaration.signature_url
    ? `<img src="${declaration.signature_url}" alt="חתימה" crossorigin="anonymous" />`
    : `<div class="empty-sig">לא נחתם עדיין</div>`;

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8" />
<title>תצהיר נהג – ${declaration.driver_name}</title>
<style>
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; direction: rtl; padding: 32px; color: #111; background: #fff; line-height: 1.7; }
  .header { border-bottom: 3px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px; }
  .header h1 { font-size: 24px; color: #1e3a8a; margin-bottom: 4px; }
  .header .company { font-size: 14px; color: #475569; }
  .header .meta { text-align: left; font-size: 12px; color: #64748b; }
  .info { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; margin-bottom: 24px; font-size: 14px; }
  .info div span { color: #64748b; margin-left: 6px; }
  .info div b { color: #111; }
  .text { white-space: pre-line; font-size: 15px; padding: 16px 0; border-top: 1px dashed #cbd5e1; border-bottom: 1px dashed #cbd5e1; margin-bottom: 24px; }
  .signature { margin-top: 32px; padding: 16px; border: 2px solid #1e3a8a; border-radius: 8px; background: #fff; }
  .signature h3 { font-size: 14px; color: #475569; margin-bottom: 12px; }
  .signature img { max-height: 140px; max-width: 100%; display: block; background: #fff; }
  .empty-sig { color: #b91c1c; font-weight: bold; padding: 24px; text-align: center; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
  .actions { position: fixed; top: 12px; left: 12px; display: flex; gap: 8px; }
  .actions button { padding: 8px 16px; border: 1px solid #1e3a8a; background: #1e3a8a; color: #fff; border-radius: 6px; cursor: pointer; font-family: inherit; }
  .status-signed { color: #166534; font-weight: bold; }
  .status-pending { color: #b45309; font-weight: bold; }
  .status-expired { color: #b91c1c; font-weight: bold; }
</style>
</head>
<body>
  <div class="actions no-print">
    <button onclick="window.print()">🖨️ הדפס / שמור כ-PDF</button>
    <button onclick="window.close()">סגור</button>
  </div>

  <div class="header">
    <div>
      <h1>תצהיר בעל רישיון נהיגה</h1>
      <div class="company">${declaration.company_name || ''}</div>
    </div>
    <div class="meta">
      <div>תאריך הפקה: ${new Date().toLocaleDateString('he-IL')}</div>
      <div>נוצר: ${fmtDate(declaration.created_at)}</div>
    </div>
  </div>

  <div class="info">
    <div><span>שם נהג:</span> <b>${declaration.driver_name || '—'}</b></div>
    <div><span>תעודת זהות:</span> <b>${declaration.id_number || '—'}</b></div>
    <div><span>מספר רישיון:</span> <b>${declaration.license_number || '—'}</b></div>
    <div><span>סטטוס:</span> <b class="status-${declaration.status}">${
    declaration.status === 'signed' ? 'נחתם' : declaration.status === 'expired' ? 'פג תוקף' : 'ממתין לחתימה'
  }</b></div>
    <div><span>תאריך חתימה:</span> <b>${fmtDate(declaration.signed_at)}</b></div>
    <div><span>תוקף עד:</span> <b>${fmtDate(declaration.expires_at)}</b></div>
  </div>

  <div class="text">${text}</div>

  <div class="signature">
    <h3>חתימת הנהג:</h3>
    ${signatureBlock}
    ${declaration.signed_at ? `<div style="margin-top:8px;font-size:12px;color:#475569;">נחתם דיגיטלית בתאריך ${fmtDate(declaration.signed_at)}</div>` : ''}
  </div>

  <div class="footer">
    <span>הופק ממערכת ניהול צי רכב</span>
    <span>${declaration.driver_name} | ${declaration.company_name || ''}</span>
  </div>

  <script>
    // Auto-trigger print after the signature image (if any) loads.
    window.addEventListener('load', function () {
      var img = document.querySelector('.signature img');
      if (!img) { setTimeout(function(){ window.print(); }, 400); return; }
      if (img.complete) { setTimeout(function(){ window.print(); }, 400); }
      else { img.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 400); });
             img.addEventListener('error', function(){ setTimeout(function(){ window.print(); }, 400); }); }
    });
  </script>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) {
    alert('יש לאפשר חלונות קופצים כדי להדפיס את התצהיר');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
