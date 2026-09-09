import { describe, expect, it } from 'vitest';
import type { ClaimRecord } from './claimsConstants';
import {
  appendRequestHistory,
  customerRequestTableLabel,
  docsForCustomerRequest,
  formatDueHe,
  mergeDocRequestItems,
  nextUploadStatus,
  parseSignTemplates,
  serializeSignTemplates,
  showsCustomerRequestLabel,
  uniqueTreatmentAction,
} from './customerRequestCenter';
import { buildClaimRowAlerts, isOpenCustomerTask } from './claimWorkAlerts';

describe('customer request center helpers', () => {
  it('formats due dates as dd/mm without inventing a year', () => {
    expect(formatDueHe('2026-09-15')).toBe('15/09');
    expect(formatDueHe('15.09.2026')).toBe('15/09');
  });

  it('keeps a label after upload until staff closes or removes it', () => {
    const t = {
      id: 'TSK-1',
      audience: 'customer',
      requestCenter: 'true',
      title: 'חשבונית',
      customerKind: 'ask_document',
      customerStatus: 'received_pending_review',
      dueDate: '2026-09-15',
      tableAlert: 'on',
      showOnLabels: 'true',
      done: 'false',
    } as ClaimRecord;
    expect(showsCustomerRequestLabel(t)).toBe(true);
    expect(customerRequestTableLabel(t)).toContain('התקבל');
    expect(customerRequestTableLabel(t)).toContain('15/09');
    expect(showsCustomerRequestLabel({ ...t, tableAlert: 'off', showOnLabels: 'false' })).toBe(false);
    expect(showsCustomerRequestLabel({ ...t, customerStatus: 'done', done: 'true' })).toBe(false);
  });

  it('does not create a second treatment action for the same request id', () => {
    expect(uniqueTreatmentAction('חשבונית', 'TSK-12345678')).toBe(uniqueTreatmentAction('חשבונית', 'TSK-12345678'));
    expect(uniqueTreatmentAction('חשבונית', 'TSK-AAA')).not.toBe(uniqueTreatmentAction('חשבונית', 'TSK-BBB'));
  });

  it('keeps previous doc requests when adding one title', () => {
    const merged = mergeDocRequestItems(
      [{ label: 'רישיון נהיגה', doc_key: 'license_driver' }],
      { label: 'חשבונית', doc_key: 'custom' },
    );
    expect(merged.map((x) => x.label)).toEqual(['רישיון נהיגה', 'חשבונית']);
  });

  it('keeps history and previous files when asking again', () => {
    const hist = appendRequestHistory('[]', { at: '1', by: 'Staff', action: 'בקש שוב', note: 'לא ברור' });
    const again = appendRequestHistory(hist, { at: '2', by: 'Staff', action: 'העלאה', note: 'קובץ חדש' });
    expect(JSON.parse(again)).toHaveLength(2);
    const t = { id: 'TSK-1', linkedDocIds: 'CDM-1', title: 'חשבונית', uploadLinkAt: '2026-09-01T00:00:00Z' } as ClaimRecord;
    const files = [
      { id: 'CDM-1', original_name: 'old.pdf', source: 'customer', created_at: '2026-09-01T01:00:00Z' },
      { id: 'CDM-2', original_name: 'new.pdf', source: 'customer', created_at: '2026-09-02T01:00:00Z', doc_request_id: 'DCR-1' },
    ];
    const next = nextUploadStatus({ ...t, docRequestId: 'DCR-1' } as ClaimRecord, ['CDM-2']);
    expect(String(next.linkedDocIds)).toContain('CDM-1');
    expect(String(next.linkedDocIds)).toContain('CDM-2');
    expect(next.customerStatus).toBe('received_pending_review');
    expect(docsForCustomerRequest({ ...t, docRequestId: 'DCR-1', linkedDocIds: String(next.linkedDocIds) } as ClaimRecord, files).map((f) => f.id)).toEqual(['CDM-1', 'CDM-2']);
  });

  it('stores templates outside claim documents', () => {
    const raw = serializeSignTemplates([{ id: 'T1', name: 'הצהרת לקוח', kind: 'text', body: 'אני מצהיר', createdAt: '2026-09-08' }]);
    expect(raw).not.toContain('claimId');
    expect(parseSignTemplates(raw)[0]?.body).toBe('אני מצהיר');
    expect(parseSignTemplates(raw)[0]?.name).toBe('הצהרת לקוח');
  });
});

describe('request-center labels vs legacy customer tasks', () => {
  const claim = { id: 'DAL-QA-A', clientName: 'A', status: 'בטיפול' } as ClaimRecord;

  it('emits one deep-linkable label per labeled request and leaves other labels alone', () => {
    const alerts = buildClaimRowAlerts(claim, {
      tasks: [
        {
          id: 'TSK-INV',
          claimId: 'DAL-QA-A',
          audience: 'customer',
          requestCenter: 'true',
          title: 'חשבונית',
          customerKind: 'ask_document',
          customerStatus: 'sent',
          dueDate: '2026-09-15',
          tableAlert: 'on',
          showOnLabels: 'true',
          done: 'false',
        } as ClaimRecord,
        {
          id: 'TSK-SIG',
          claimId: 'DAL-QA-A',
          audience: 'customer',
          requestCenter: 'true',
          title: 'ייפוי כוח',
          customerKind: 'ask_signature',
          customerStatus: 'awaiting_signature',
          dueDate: '2026-09-17',
          tableAlert: 'on',
          showOnLabels: 'true',
          done: 'false',
        } as ClaimRecord,
        {
          id: 'TSK-HIDE',
          claimId: 'DAL-QA-A',
          audience: 'customer',
          requestCenter: 'true',
          title: 'בלי תווית',
          customerKind: 'ask_info',
          customerStatus: 'sent',
          tableAlert: 'off',
          showOnLabels: 'false',
          done: 'false',
        } as ClaimRecord,
        { id: 't-old', claimId: 'DAL-QA-A', audience: 'customer', customerStatus: 'sent', done: 'false' } as ClaimRecord,
      ],
      notifs: [],
      gmailPending: [],
      scheduledFollowups: [],
    });
    expect(alerts.find((a) => a.key === 'custreq_TSK-INV')?.label).toBe('חסר חשבונית — עד 15/09');
    expect(alerts.find((a) => a.key === 'custreq_TSK-SIG')?.label).toBe('ממתין לחתימה — עד 17/09');
    expect(alerts.find((a) => a.key === 'custreq_TSK-INV')?.taskId).toBe('TSK-INV');
    expect(alerts.some((a) => a.key === 'custreq_TSK-HIDE')).toBe(false);
    expect(alerts.map((a) => a.label)).toContain('ממתין ללקוח');
  });

  it('keeps a received request open and labeled until staff closes it', () => {
    const t = {
      id: 'TSK-1',
      audience: 'customer',
      requestCenter: 'true',
      customerStatus: 'received_pending_review',
      done: 'false',
    } as ClaimRecord;
    expect(isOpenCustomerTask(t)).toBe(true);
    expect(isOpenCustomerTask({ ...t, customerStatus: 'done', done: 'true' })).toBe(false);
  });
});
