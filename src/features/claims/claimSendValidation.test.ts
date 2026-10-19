import { describe, it, expect } from 'vitest';

const PACKAGE_LIMIT = 18 * 1024 * 1024; // 18MB binary payload limit (~24MB base64 MIME)

interface ClaimDoc {
  id: string;
  original_name: string;
  byte_size: number;
  storage_path: string;
  mime_type: string;
}

function validatePreSendFiles(
  requestedIds: string[],
  availableDocs: ClaimDoc[],
  storageCheck: (path: string) => { exists: boolean; bytes: number }
) {
  // 1. All requested files must exist on the claim
  const resolved = requestedIds.map((id) => availableDocs.find((d) => d.id === id)).filter(Boolean) as ClaimDoc[];
  if (resolved.length !== requestedIds.length) {
    const missingIds = requestedIds.filter((id) => !availableDocs.some((d) => d.id === id));
    return { ok: false, error: 'files_not_on_claim', missingIds };
  }

  // 2. Storage download verification: all files must exist and not be 0 bytes
  let totalBytes = 0;
  for (const doc of resolved) {
    const probe = storageCheck(doc.storage_path);
    if (!probe.exists) {
      return {
        ok: false,
        error: 'attachment_download_failed',
        filename: doc.original_name,
        reason: 'not_found_in_storage',
      };
    }
    if (probe.bytes === 0) {
      return {
        ok: false,
        error: 'attachment_download_failed',
        filename: doc.original_name,
        reason: 'empty_file_zero_bytes',
      };
    }
    totalBytes += probe.bytes;
  }

  // 3. Package size limit check
  if (totalBytes > PACKAGE_LIMIT) {
    return {
      ok: false,
      error: 'package_too_large',
      packageBytes: totalBytes,
      limitBytes: PACKAGE_LIMIT,
      suggestion: 'הקבצים גדולים מדי לשליחה במייל. בחר פחות קבצים או שלח קישור מאובטח.',
    };
  }

  return { ok: true, fileCount: resolved.length, totalBytes, files: resolved };
}

function verifyPostSendAttachments(
  requestedFiles: Array<{ id: string; name: string }>,
  verifiedGmailParts: Array<{ filename: string; mime: string; size: number }>
) {
  const verifiedCount = verifiedGmailParts.length;
  const requestedCount = requestedFiles.length;
  const isFullMatch = verifiedCount === requestedCount;

  const missingFiles = requestedFiles
    .filter((req) => !verifiedGmailParts.some((v) => v.filename.toLowerCase() === req.name.toLowerCase()))
    .map((f) => f.name);

  return {
    verifiedCount,
    requestedCount,
    isFullMatch,
    missingFiles,
    statusText: isFullMatch
      ? `נשלחו ואומתו כל ${verifiedCount} הקבצים ב-Gmail`
      : `נשלחו רק ${verifiedCount} מתוך ${requestedCount} קבצים (חסרים: ${missingFiles.join(', ')})`,
  };
}

describe('Controlled Test Suite: Claims Email Attachments Pre & Post Send Validation', () => {
  it('Scenario 1: Single file send (valid and passes)', () => {
    const docs: ClaimDoc[] = [
      { id: 'F1', original_name: 'rcv0001.JPG', byte_size: 77783, storage_path: 'claims/f1.jpg', mime_type: 'image/jpeg' },
    ];
    const storage = (p: string) => ({ exists: true, bytes: 77783 });

    const result = validatePreSendFiles(['F1'], docs, storage);
    expect(result.ok).toBe(true);
    expect(result.fileCount).toBe(1);
    expect(result.totalBytes).toBe(77783);

    const postVerify = verifyPostSendAttachments([{ id: 'F1', name: 'rcv0001.JPG' }], [
      { filename: 'rcv0001.JPG', mime: 'image/jpeg', size: 77783 },
    ]);
    expect(postVerify.isFullMatch).toBe(true);
    expect(postVerify.verifiedCount).toBe(1);
  });

  it('Scenario 2: Two files send (e.g. surveyor report 2 pages)', () => {
    const docs: ClaimDoc[] = [
      { id: 'F1', original_name: 'rcv0001.JPG', byte_size: 77783, storage_path: 'claims/f1.jpg', mime_type: 'image/jpeg' },
      { id: 'F2', original_name: 'rcv0002.JPG', byte_size: 58205, storage_path: 'claims/f2.jpg', mime_type: 'image/jpeg' },
    ];
    const storage = (p: string) => ({ exists: true, bytes: p.includes('f1') ? 77783 : 58205 });

    const result = validatePreSendFiles(['F1', 'F2'], docs, storage);
    expect(result.ok).toBe(true);
    expect(result.fileCount).toBe(2);
    expect(result.totalBytes).toBe(135988);

    const postVerify = verifyPostSendAttachments(
      [{ id: 'F1', name: 'rcv0001.JPG' }, { id: 'F2', name: 'rcv0002.JPG' }],
      [
        { filename: 'rcv0001.JPG', mime: 'image/jpeg', size: 77783 },
        { filename: 'rcv0002.JPG', mime: 'image/jpeg', size: 58205 },
      ]
    );
    expect(postVerify.isFullMatch).toBe(true);
    expect(postVerify.verifiedCount).toBe(2);
  });

  it('Scenario 3: Ten files send (damage photos + report)', () => {
    const docs: ClaimDoc[] = Array.from({ length: 10 }, (_, i) => ({
      id: `F${i + 1}`,
      original_name: `photo_${i + 1}.jpg`,
      byte_size: 50000,
      storage_path: `claims/p${i + 1}.jpg`,
      mime_type: 'image/jpeg',
    }));
    const storage = () => ({ exists: true, bytes: 50000 });

    const ids = docs.map((d) => d.id);
    const result = validatePreSendFiles(ids, docs, storage);
    expect(result.ok).toBe(true);
    expect(result.fileCount).toBe(10);
    expect(result.totalBytes).toBe(500000);

    const postVerify = verifyPostSendAttachments(
      docs.map((d) => ({ id: d.id, name: d.original_name })),
      docs.map((d) => ({ filename: d.original_name, mime: d.mime_type, size: d.byte_size }))
    );
    expect(postVerify.isFullMatch).toBe(true);
    expect(postVerify.verifiedCount).toBe(10);
  });

  it('Scenario 4: 63 files / package limit overflow (> 18MB/25MB) - properly detected and blocked', () => {
    // 63 large files of 400KB each = ~25.2MB, which exceeds the 18MB package limit
    const docs: ClaimDoc[] = Array.from({ length: 63 }, (_, i) => ({
      id: `F${i + 1}`,
      original_name: `heavy_doc_${i + 1}.pdf`,
      byte_size: 400 * 1024, // 400KB each
      storage_path: `claims/doc_${i + 1}.pdf`,
      mime_type: 'application/pdf',
    }));
    const storage = () => ({ exists: true, bytes: 400 * 1024 });

    const ids = docs.map((d) => d.id);
    const result = validatePreSendFiles(ids, docs, storage);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('package_too_large');
    expect(result.packageBytes).toBe(63 * 400 * 1024);
    expect(result.packageBytes! > PACKAGE_LIMIT).toBe(true);
  });

  it('Scenario 5: Missing or corrupt file in Storage - send aborted immediately with explicit error', () => {
    const docs: ClaimDoc[] = [
      { id: 'F1', original_name: 'rcv0001.JPG', byte_size: 77783, storage_path: 'claims/f1.jpg', mime_type: 'image/jpeg' },
      { id: 'F2', original_name: 'rcv0002.JPG', byte_size: 58205, storage_path: 'claims/f2.jpg', mime_type: 'image/jpeg' },
    ];
    // Storage fails for F2
    const storage = (p: string) => {
      if (p.includes('f2')) return { exists: false, bytes: 0 };
      return { exists: true, bytes: 77783 };
    };

    const result = validatePreSendFiles(['F1', 'F2'], docs, storage);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('attachment_download_failed');
    expect(result.filename).toBe('rcv0002.JPG');
  });

  it('Scenario 6: Partial delivery detection (Dalia AI hallucination prevention)', () => {
    // User requested 63 files, but only 1 file was sent in Gmail
    const requested = Array.from({ length: 63 }, (_, i) => ({
      id: `CDM-${i + 1}`,
      name: `file_${i + 1}.jpg`,
    }));
    const verifiedFromGmail = [
      { filename: 'file_1.jpg', mime: 'image/jpeg', size: 77783 },
    ];

    const postVerify = verifyPostSendAttachments(requested, verifiedFromGmail);
    expect(postVerify.isFullMatch).toBe(false);
    expect(postVerify.requestedCount).toBe(63);
    expect(postVerify.verifiedCount).toBe(1);
    expect(postVerify.missingFiles.length).toBe(62);
    expect(postVerify.statusText).toContain('נשלחו רק 1 מתוך 63 קבצים');
  });
});
