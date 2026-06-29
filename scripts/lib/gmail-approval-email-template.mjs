/**
 * Gmail / Resend approval email template — Mission 28 trial.
 * Hebrew RTL HTML; data from live-workflow-demo page-07.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const STAGING_BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const STAGING_PREVIEW =
  `${STAGING_BASE}/ai-marketing-platform.html?v=v3-live-demo-3&page=page-07`;
const STAGING_EMAIL_PREVIEW = `${STAGING_BASE}/ai-marketing/email-preview-approval.html`;

const DEFAULT_DATA = {
  companyName: 'דליה פתרונות מימון ותחזוקה לרכב',
  siteName: 'dalia-c.com',
  pageName: 'השירותים שלנו - דליה',
  pagePath: '/השירותים-שלנו',
  pageId: 'page-07',
  approvalId: 'trial-page-07-m28',
  sentAt: new Date().toISOString(),
  executionMode: 'preview',
  confidence: 87,
  engines: [
    { id: 'openai', label: 'ChatGPT (OpenAI)', agreed: true, confidence: 86 },
    { id: 'claude', label: 'Claude (Anthropic)', agreed: true, confidence: 88 },
    { id: 'gemini', label: 'Gemini (Google)', agreed: true, confidence: 87 },
  ],
  rationale:
    'העמוד חסר H1, ה-Title אינו ממוקד למילות מפתח עסקיות, וה-Meta ארוך מדי ללא CTA. שלושת מנועי ה-AI הסכימו שמיקוד ב"ניהול צי רכב לעסקים" ישפר חשיפה ב-GSC (14 חשיפות, מיקום 5.5) ויעלה את ציון ה-SEO מ-5/10.',
  changes: [
    { field: 'Title', before: 'השירותים שלנו - דליה', after: 'שירותי ניהול צי רכב לעסקים | דליה — תפעול, תחזוקה ומעקב' },
    { field: 'Meta Description', before: 'חברת דליה עוסקת בתפעול ותחזוקת רכבים…', after: 'גלו את שירותי דליה: ניהול צי רכב, תחזוקה מונעת, מעקב GPS וטיפול 24/7. צרו קשר לייעוץ חינם.' },
    { field: 'H1', before: '(חסר)', after: 'שירותי ניהול צי רכב ותחזוקה לעסקים' },
    { field: 'Alt לתמונות', before: '2 תמונות ללא alt', after: 'תיאור alt ממוקד לשירותי צי' },
  ],
  expectedImprovements: [
    'ציון SEO משוער: 5 → 8/10',
    'שיפור CTR בתוצאות חיפוש (Meta עם CTA)',
    'כיסוי מילות מפתח: ניהול צי רכב, תחזוקה מונעת',
    'תיקון נגישות — alt לתמונות',
  ],
  before: {
    title: 'השירותים שלנו - דליה',
    meta: 'חברת דליה עוסקת בתפעול ותחזוקת רכבים עם ניסיון וותק של מעל ל-20 שנה בתחום הרכב.',
    h1: null,
    seoScore: 5,
  },
  proposed: {
    title: 'שירותי ניהול צי רכב לעסקים | דליה — תפעול, תחזוקה ומעקב',
    meta: 'גלו את שירותי דליה: ניהול צי רכב, תחזוקה מונעת, מעקב GPS וטיפול 24/7. פתרון מלא לעסקים בישראל. צרו קשר לייעוץ חינם.',
    h1: 'שירותי ניהול צי רכב ותחזוקה לעסקים',
  },
};

export function loadPage07DemoData(root = process.cwd()) {
  const reportPath = join(root, 'docs', 'audit-reports', 'live-workflow-demo', 'report.json');
  if (!existsSync(reportPath)) return { ...DEFAULT_DATA };
  try {
    const raw = JSON.parse(readFileSync(reportPath, 'utf8'));
    const engines = (raw.multiAi?.engines || []).map((e) => ({
      id: e.engineId,
      label: e.engineLabel,
      agreed: true,
      confidence: Math.round((e.confidence || 0.6) * 100),
    }));
    const avgConf = engines.length
      ? Math.round(engines.reduce((s, e) => s + e.confidence, 0) / engines.length)
      : DEFAULT_DATA.confidence;

    return {
      ...DEFAULT_DATA,
      pageName: raw.page?.title || DEFAULT_DATA.pageName,
      pagePath: raw.page?.path || DEFAULT_DATA.pagePath,
      pageId: raw.page?.id || DEFAULT_DATA.pageId,
      sentAt: raw.at || DEFAULT_DATA.sentAt,
      executionMode: raw.executionMode || 'preview',
      confidence: avgConf,
      engines: engines.length ? engines : DEFAULT_DATA.engines,
      before: raw.before || DEFAULT_DATA.before,
      proposed: raw.proposed || DEFAULT_DATA.proposed,
      changes: [
        {
          field: 'Title',
          before: raw.before?.title || DEFAULT_DATA.changes[0].before,
          after: raw.proposed?.title || DEFAULT_DATA.changes[0].after,
        },
        {
          field: 'Meta Description',
          before: (raw.before?.meta || '').slice(0, 60) + '…',
          after: raw.proposed?.meta || DEFAULT_DATA.changes[1].after,
        },
        {
          field: 'H1',
          before: raw.before?.h1 ? raw.before.h1 : '(חסר)',
          after: raw.proposed?.h1 || DEFAULT_DATA.changes[2].after,
        },
        {
          field: 'Alt לתמונות',
          before: '2 תמונות ללא alt',
          after: 'תיאור alt ממוקד לשירותי צי',
        },
      ],
      rationale: DEFAULT_DATA.rationale,
      expectedImprovements: [
        `ציון SEO משוער: ${raw.before?.seoScore ?? 5} → 8/10`,
        'שיפור CTR בתוצאות חיפוש (Meta עם CTA)',
        'כיסוי מילות מפתח: ניהול צי רכב, תחזוקה מונעת',
        'תיקון נגישות — alt לתמונות',
      ],
      sourceReport: reportPath,
    };
  } catch {
    return { ...DEFAULT_DATA };
  }
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatHeDate(iso) {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Asia/Jerusalem',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function mockScreenshotSvg(label, variant, data) {
  const bg = variant === 'before' ? '#f1f5f9' : '#ecfdf5';
  const accent = variant === 'before' ? '#64748b' : '#059669';
  const title = esc(data.title || '—');
  const h1 = esc(data.h1 || '(חסר H1)');
  const meta = esc((data.meta || '').slice(0, 72));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="320" viewBox="0 0 560 320">
    <rect width="560" height="320" fill="${bg}" rx="8"/>
    <rect x="0" y="0" width="560" height="36" fill="#1a1a2e"/>
    <text x="280" y="24" fill="#fff" font-family="Arial,sans-serif" font-size="13" text-anchor="middle">${esc(label)}</text>
    <rect x="24" y="52" width="512" height="28" fill="#fff" stroke="#cbd5e1" rx="4"/>
    <text x="32" y="70" fill="${accent}" font-family="Arial,sans-serif" font-size="11">${title}</text>
    <text x="32" y="100" fill="#334155" font-family="Arial,sans-serif" font-size="14" font-weight="bold">${h1}</text>
    <text x="32" y="128" fill="#64748b" font-family="Arial,sans-serif" font-size="10">${meta}</text>
    <rect x="24" y="148" width="240" height="80" fill="#e2e8f0" rx="4"/>
    <rect x="280" y="148" width="256" height="80" fill="#e2e8f0" rx="4"/>
    <text x="280" y="260" fill="#94a3b8" font-family="Arial,sans-serif" font-size="10" text-anchor="middle">דליה · dalia-c.com · Staging mock</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function actionUrl(action, approvalId) {
  const token = `STUB_${action.toUpperCase()}_${approvalId}`;
  return `${STAGING_BASE}/ai-marketing/email-preview-approval.html?action=${action}&approvalId=${encodeURIComponent(approvalId)}&t=${token}`;
}

export function buildApprovalEmail(data = DEFAULT_DATA) {
  const d = { ...DEFAULT_DATA, ...data };
  const dateStr = formatHeDate(d.sentAt);
  const subject = `עמוד מוכן לאישור – ${d.pageName.replace(/\s*-\s*דליה$/, '')}`;
  const previewUrl = STAGING_PREVIEW;
  const links = {
    approve: actionUrl('approve', d.approvalId),
    revise: actionUrl('revise', d.approvalId),
    reject: actionUrl('reject', d.approvalId),
    fullPreview: actionUrl('preview', d.approvalId),
  };

  const beforeImg = mockScreenshotSvg('לפני', 'before', d.before);
  const afterImg = mockScreenshotSvg('אחרי (טיוטה)', 'after', {
    title: d.proposed.title,
    h1: d.proposed.h1,
    meta: d.proposed.meta,
  });
  const compareImg = mockScreenshotSvg('השוואה', 'after', {
    title: `${d.before?.title || ''} → ${(d.proposed?.title || '').slice(0, 28)}…`,
    h1: d.proposed?.h1,
    meta: 'Side-by-side · Mission 28 trial',
  });

  const engineRows = d.engines
    .map(
      (e) =>
        `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:14px;">${esc(e.label)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:14px;text-align:center;">${e.agreed ? '✅ הסכים' : '⚠️ חולק'}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:14px;text-align:center;font-weight:bold;">${e.confidence}%</td>
        </tr>`,
    )
    .join('');

  const changeRows = d.changes
    .map(
      (c) =>
        `<tr>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;font-weight:bold;color:#1a1a2e;">${esc(c.field)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;color:#64748b;">${esc(c.before)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;color:#059669;">${esc(c.after)}</td>
        </tr>`,
    )
    .join('');

  const improveList = d.expectedImprovements
    .map((item) => `<li style="margin-bottom:6px;color:#334155;font-size:14px;">${esc(item)}</li>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#1a1a2e;padding:24px 28px;">
              <p style="margin:0 0 6px;color:#94a3b8;font-size:12px;">CO.CO Marketing AI · Staging</p>
              <h1 style="margin:0;color:#ffffff;font-size:22px;line-height:1.4;">📋 עמוד מוכן לאישור</h1>
              <p style="margin:10px 0 0;color:#cbd5e1;font-size:14px;">${esc(d.pageName)}</p>
            </td>
          </tr>
          <!-- Meta row -->
          <tr>
            <td style="padding:20px 28px;border-bottom:1px solid #eee;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:13px;color:#64748b;padding:4px 0;"><strong style="color:#1a1a2e;">חברה:</strong> ${esc(d.companyName)}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#64748b;padding:4px 0;"><strong style="color:#1a1a2e;">אתר:</strong> ${esc(d.siteName)} · ${esc(d.pagePath)}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#64748b;padding:4px 0;"><strong style="color:#1a1a2e;">תאריך:</strong> ${esc(dateStr)}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#64748b;padding:4px 0;"><strong style="color:#1a1a2e;">מצב:</strong> ${esc(d.executionMode)} · לא Production</td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Confidence badge -->
          <tr>
            <td style="padding:16px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;">
                <tr>
                  <td style="padding:14px 16px;">
                    <span style="font-size:28px;font-weight:bold;color:#059669;">${d.confidence}%</span>
                    <span style="font-size:14px;color:#166534;margin-right:8px;">ציון ביטחון AI</span>
                    <p style="margin:8px 0 0;font-size:13px;color:#334155;">שלושת המנועים הסכימו על ההמלצה (stub ב-Staging).</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Rationale -->
          <tr>
            <td style="padding:8px 28px 16px;">
              <h2 style="margin:0 0 10px;font-size:16px;color:#1a1a2e;">למה ה-AI המליץ על השינוי?</h2>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">${esc(d.rationale)}</p>
            </td>
          </tr>
          <!-- Engines -->
          <tr>
            <td style="padding:8px 28px 16px;">
              <h2 style="margin:0 0 10px;font-size:16px;color:#1a1a2e;">מנועי AI שהשתתפו</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;">
                <tr style="background:#f8fafc;">
                  <th style="padding:8px 10px;font-size:12px;text-align:right;color:#64748b;">מנוע</th>
                  <th style="padding:8px 10px;font-size:12px;text-align:center;color:#64748b;">החלטה</th>
                  <th style="padding:8px 10px;font-size:12px;text-align:center;color:#64748b;">ביטחון</th>
                </tr>
                ${engineRows}
              </table>
            </td>
          </tr>
          <!-- Changes -->
          <tr>
            <td style="padding:8px 28px 16px;">
              <h2 style="margin:0 0 10px;font-size:16px;color:#1a1a2e;">מה השתנה</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;">
                <tr style="background:#f8fafc;">
                  <th style="padding:8px 10px;font-size:12px;text-align:right;color:#64748b;">שדה</th>
                  <th style="padding:8px 10px;font-size:12px;text-align:right;color:#64748b;">לפני</th>
                  <th style="padding:8px 10px;font-size:12px;text-align:right;color:#64748b;">אחרי</th>
                </tr>
                ${changeRows}
              </table>
            </td>
          </tr>
          <!-- Expected improvements -->
          <tr>
            <td style="padding:8px 28px 16px;">
              <h2 style="margin:0 0 10px;font-size:16px;color:#1a1a2e;">שיפור צפוי</h2>
              <ul style="margin:0;padding-right:20px;">${improveList}</ul>
            </td>
          </tr>
          <!-- Screenshots -->
          <tr>
            <td style="padding:8px 28px 16px;">
              <h2 style="margin:0 0 12px;font-size:16px;color:#1a1a2e;">לפני / אחרי / השוואה</h2>
              <p style="margin:0 0 12px;font-size:12px;color:#94a3b8;">תמונות סימולציה — ב-Production יגיעו מ-Supabase Storage (Playwright capture).</p>
              <img src="${beforeImg}" alt="לפני" width="100%" style="display:block;border-radius:8px;margin-bottom:10px;border:1px solid #e2e8f0;"/>
              <img src="${afterImg}" alt="אחרי" width="100%" style="display:block;border-radius:8px;margin-bottom:10px;border:1px solid #e2e8f0;"/>
              <img src="${compareImg}" alt="השוואה" width="100%" style="display:block;border-radius:8px;border:1px solid #e2e8f0;"/>
            </td>
          </tr>
          <!-- Preview CTA -->
          <tr>
            <td style="padding:8px 28px 20px;text-align:center;">
              <a href="${esc(previewUrl)}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:bold;">👁️ תצוגה מקדימה ב-Staging</a>
            </td>
          </tr>
          <!-- Action buttons -->
          <tr>
            <td style="padding:8px 28px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:6px;">
                    <a href="${esc(links.approve)}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:bold;min-width:120px;">✅ אשר</a>
                  </td>
                  <td align="center" style="padding:6px;">
                    <a href="${esc(links.revise)}" style="display:inline-block;background:#f59e0b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:bold;min-width:120px;">✏️ שלח לתיקון</a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:6px;">
                    <a href="${esc(links.reject)}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:bold;min-width:120px;">❌ דחה</a>
                  </td>
                  <td align="center" style="padding:6px;">
                    <a href="${esc(links.fullPreview)}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:bold;min-width:120px;">👁️ Preview מלא</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #eee;">
              <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.5;">
                הודעה זו נשלחה ממערכת CO.CO Marketing AI (Mission 28 trial). קישורי האישור הם stub — אין פרסום ל-Production.
                <br/>מרכז אישורים: <a href="${esc(STAGING_EMAIL_PREVIEW)}" style="color:#3b82f6;">email-preview-approval.html</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject,
    html,
    text: [
      subject,
      '',
      `חברה: ${d.companyName}`,
      `אתר: ${d.siteName} · ${d.pagePath}`,
      `תאריך: ${dateStr}`,
      `ביטחון AI: ${d.confidence}%`,
      '',
      d.rationale,
      '',
      `תצוגה מקדימה: ${previewUrl}`,
      `אשר: ${links.approve}`,
      `תיקון: ${links.revise}`,
      `דחה: ${links.reject}`,
    ].join('\n'),
    links,
    previewUrl,
    stagingEmailPreview: STAGING_EMAIL_PREVIEW,
    data: d,
  };
}
