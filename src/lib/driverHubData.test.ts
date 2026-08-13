import { describe, expect, it } from 'vitest';
import {
  buildDriverActivity,
  countDocumentsNeedingAttention,
  countPendingRequests,
  documentsTileValue,
  formatActivityRecency,
  parseDriverHubSection,
  isDocumentsHubSection,
  documentsHubTileValue,
  requestsTileValue,
} from './driverHubData';
import type { DriverDocumentVersionRow } from './driverHubData';

describe('driverHubData helpers', () => {
  it('parses hub sections', () => {
    expect(parseDriverHubSection('documents')).toBe('documents');
    expect(parseDriverHubSection('requests')).toBe('requests');
    expect(parseDriverHubSection('driving')).toBe('driving');
    expect(parseDriverHubSection('activity')).toBe('activity');
    expect(parseDriverHubSection('bogus')).toBe('home');
    expect(parseDriverHubSection(null)).toBe('home');
    expect(isDocumentsHubSection('documents')).toBe(true);
    expect(isDocumentsHubSection('requests')).toBe(true);
    expect(isDocumentsHubSection('driving')).toBe(false);
  });

  it('counts documents needing attention', () => {
    const versions = [
      { is_current: true, status: 'expired' },
      { is_current: true, status: 'warning' },
      { is_current: true, status: 'valid' },
      { is_current: false, status: 'expired' },
    ] as DriverDocumentVersionRow[];
    expect(countDocumentsNeedingAttention(versions)).toBe(2);
  });

  it('counts pending requests', () => {
    expect(
      countPendingRequests([
        { status: 'pending_approval' },
        { status: 'approved' },
        { status: 'sent' },
      ] as never),
    ).toBe(2);
  });

  it('builds tile values from counters', () => {
    expect(
      documentsTileValue({
        documentsNeedingAttention: 2,
        pendingRequests: 0,
        accidentCount: 0,
        lastActivityAt: null,
        licenseNeedsAttention: false,
        examNeedsAttention: false,
      }).value,
    ).toBe('2 דורשים טיפול');

    expect(
      requestsTileValue({
        documentsNeedingAttention: 0,
        pendingRequests: 3,
        accidentCount: 0,
        lastActivityAt: null,
        licenseNeedsAttention: false,
        examNeedsAttention: false,
      }).value,
    ).toBe('3 ממתינות');

    expect(
      documentsHubTileValue({
        documentsNeedingAttention: 2,
        pendingRequests: 3,
        accidentCount: 0,
        lastActivityAt: null,
        licenseNeedsAttention: false,
        examNeedsAttention: false,
      }).value,
    ).toBe('2 לטיפול · 3 בקשות');
  });

  it('builds activity from real sources only', () => {
    const items = buildDriverActivity({
      versions: [
        {
          id: 'v1',
          document_type_key: 'traffic_info',
          label_he: 'מידע תעבורתי',
          public_url: 'https://example.com/a',
          original_name: 'a.pdf',
          created_at: '2026-08-10T10:00:00Z',
          expiry_date: null,
          version_no: 1,
          is_current: true,
          status: 'valid',
        },
      ],
      requests: [],
      accidents: [],
      declarations: [{ id: 'd1', created_at: '2026-08-09T10:00:00Z', status: 'pending' }],
      exams: [{ id: 'e1', created_at: '2026-08-08T10:00:00Z', status: 'completed', exam_type: 'general' }],
      notifications: [],
    });
    expect(items).toHaveLength(3);
    expect(items[0].kind).toBe('document_version');
  });

  it('formats activity recency', () => {
    const today = new Date().toISOString();
    expect(formatActivityRecency(today)).toBe('עודכן לאחרונה היום');
    expect(formatActivityRecency(null)).toBe('אין פעילות');
  });
});
