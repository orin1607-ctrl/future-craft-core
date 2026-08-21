/**
 * Try execute intakeReparse via Apps Script API on V18 HEAD (script's own Gmail).
 * First add intakeReparseOne_ to V18 project content, then scripts.run.
 * No web app deploy. Snapshot registry #1 first.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { getAuthenticatedClient, loadGoogleAuthLibrary } from '../../../../scripts/google/_lib/auth.mjs';

const V18 = '1yn8zeIV2WJkox-0nEmIT4ozrtRmCdzdgu8xwmnOt7soIZ0Jiju0Au0dc';
const SS = '1ZuuKKw9_wGMAlMgkyrPrCRP4ijaY8dIScbOSACqyCN8';

mkdirSync('backups/button19-obligo1-fix', { recursive: true });

const auth = await getAuthenticatedClient();
const google = await loadGoogleAuthLibrary();
const api = google.script({ version: 'v1', auth });
const sheets = google.sheets({ version: 'v4', auth });

// Snapshot full registry row #1
const reg = await sheets.spreadsheets.values.get({
  spreadsheetId: SS,
  range: "'רישום קליטה'!A1:AZ20",
});
const values = reg.data.values || [];
const headers = values[0];
const rowIdx = values.findIndex((r, i) => i > 0 && String(r[headers.indexOf('מספר קליטה')] || '') === '1');
const row = values[rowIdx];
const before = {};
headers.forEach((h, i) => {
  before[h] = row[i];
});
writeFileSync('backups/button19-obligo1-fix/v18-registry-1-before.json', JSON.stringify({ rowIdx, before }, null, 2));

const content = (await api.projects.getContent({ scriptId: V18 })).data;
const dataFile = content.files.find((f) => f.name === 'IntakeV18_Data');
if (!dataFile) throw new Error('IntakeV18_Data missing');

const FN = `
function intakeReparseOneStored_(wantNum) {
  wantNum = String(wantNum || '').trim();
  if (!wantNum) return { ok: false, error: 'missing_num' };
  intakeValidateSpreadsheet_(getSS_());
  var list = intakeLoadDisplayList_();
  var items = list.items || [];
  var target = null;
  for (var i = 0; i < items.length; i++) {
    if (String(items[i].num) === wantNum) { target = items[i]; break; }
  }
  if (!target) return { ok: false, error: 'intake_not_found', wantNum: wantNum };
  var beforeCount = target.count;
  var beforeHash = target.reportHash || target.hash || '';
  var mid = String(target.messageId || '');
  if (!mid) return { ok: false, error: 'no_message_id', wantNum: wantNum };
  var accessToken = soiGetGmailAccessToken_();
  var message = soiGetMessage_(mid, accessToken);
  var modId = intakeModuleIdFromReportType_(target.type);
  var mod = INTAKE_GMAIL_BY_MODULE_[modId];
  if (!mod) return { ok: false, error: 'no_module', type: target.type };
  var tmp = [];
  var seen = {};
  intakePushCandidateFromMessage_(
    message,
    mid,
    {
      moduleId: modId,
      parserKey: mod.parserKey,
      reportType: mod.reportType,
      subjectOk: function () { return true; },
    },
    accessToken,
    seen,
    tmp,
  );
  var cand = tmp.length ? tmp[0] : null;
  if (!cand || !cand.pdfBytes) return { ok: false, error: 'no_attachment_bytes', wantNum: wantNum };
  var adapted = intakeParseAttachmentBytes_(cand.pdfBytes, cand.pdfFilename, cand.parserKey, cand.reportType || target.type);
  adapted = intakeFinalizeAdapted_(adapted, cand.reportType || target.type);
  var fp = cand.reportHash || '';
  if (!fp && typeof soiFingerprintPdfBytes_ === 'function' && cand.pdfBytes) fp = soiFingerprintPdfBytes_(cand.pdfBytes);
  // Safety: do not change intake number; keep fingerprint if same PDF
  if (fp && beforeHash && fp !== beforeHash) {
    return { ok: false, error: 'fingerprint_changed', beforeHash: beforeHash, newHash: fp, aborted: true };
  }
  var summary = adapted.summary || [];
  if (fp) summary = intakeSummaryMetaPush_(summary, '__contentFingerprint__', fp);
  intakeUpsertRecord_({
    num: target.num,
    reportHash: cand.reportHash || beforeHash,
    messageId: mid,
    date: target.date,
    time: target.time,
    file: cand.pdfFilename || target.file,
    sender: cand.from || target.sender,
    subject: cand.subject || target.subject,
    type: adapted.type || target.type,
    status: adapted.status,
    count: adapted.count,
    amount: adapted.amount,
    columns: adapted.columns,
    rows: adapted.rows,
    summary: summary,
    gmailMs: cand.gmailMs || target.gmailMs,
    archived: target.archived,
  });
  return {
    ok: true,
    wantNum: wantNum,
    beforeCount: beforeCount,
    afterCount: (adapted.rows || []).length,
    type: adapted.type || target.type,
    fingerprint: fp || beforeHash,
    file: cand.pdfFilename || target.file,
    sampleRows: (adapted.rows || []).slice(0, 6),
  };
}
`;

if (!dataFile.source.includes('function intakeReparseOneStored_')) {
  // insert before intakeReparseStoredRecords_
  const marker = 'function intakeReparseStoredRecords_() {';
  if (!dataFile.source.includes(marker)) throw new Error('marker missing');
  dataFile.source = dataFile.source.replace(marker, FN + '\n' + marker);
  await api.projects.updateContent({ scriptId: V18, requestBody: { files: content.files } });
  writeFileSync('backups/button19-obligo1-fix/v18-patched-reparse-one.txt', 'added intakeReparseOneStored_');
} else {
  writeFileSync('backups/button19-obligo1-fix/v18-patched-reparse-one.txt', 'already present');
}

// Create version for clarity
await api.projects.versions.create({
  scriptId: V18,
  requestBody: { description: 'Add intakeReparseOneStored_ for #1-only reparse (no web deploy)' },
});

// Try scripts.run
let runResult;
try {
  runResult = await api.scripts.run({
    scriptId: V18,
    requestBody: {
      function: 'intakeReparseOneStored_',
      parameters: ['1'],
      devMode: true,
    },
  });
} catch (e) {
  runResult = { error: String(e.message || e), response: e };
}

writeFileSync(
  'backups/button19-obligo1-fix/v18-reparse-run.json',
  JSON.stringify(runResult.data || runResult, null, 2),
);
console.log(JSON.stringify(runResult.data || runResult, null, 2));
