import { describe, expect, it } from 'vitest';
import { emptyCaseData, type GarageCase } from '@/modules/garage-management/garageBook';
import { computeGarageOpsMetrics, buildGarageOpsWorkQueues } from './garageOpsMetrics';

function row(partial: Partial<GarageCase> & { id: string }): GarageCase {
  return {
    case_number: partial.id,
    customer_id: 'c1',
    vehicle_id: partial.vehicle_id || partial.id,
    status: partial.status || 'פתוח',
    opened_by: 'u1',
    opened_by_name: 'בודק',
    customer_name_snapshot: 'לקוח',
    vehicle_plate_snapshot: '12-345-67',
    vehicle_label_snapshot: 'מאזדה',
    case_data: partial.case_data || emptyCaseData(),
    created_at: partial.created_at,
    updated_at: partial.updated_at,
    ...partial,
  };
}

describe('garage ops HomeDashboard metrics', () => {
  const now = new Date('2026-09-14T12:00:00Z');

  it('counts real garage flags and does not invent a due-today number', () => {
    const metrics = computeGarageOpsMetrics({
      now,
      openClaimsCount: 2,
      cases: [
        row({
          id: 'open-in-shop',
          vehicle_id: 'v1',
          created_at: '2026-09-02T10:00:00Z',
          case_data: { ...emptyCaseData(), intakeDone: true, quoteSent: true, waitingForApproval: true },
        }),
        row({
          id: 'quote-only',
          vehicle_id: 'v2',
          created_at: '2026-08-02T10:00:00Z',
          case_data: { ...emptyCaseData(), quoteCreated: true, quoteSent: true },
        }),
        row({
          id: 'closed',
          vehicle_id: 'v3',
          created_at: '2026-08-20T10:00:00Z',
          updated_at: '2026-09-10T10:00:00Z',
          status: 'סגור',
          case_data: { ...emptyCaseData(), intakeDone: true, workFinished: true, workFinishedAt: '2026-09-10T10:00:00Z', caseClosed: true },
        }),
      ],
    });
    const byKey = Object.fromEntries(metrics.map((m) => [m.key, m]));
    expect(byKey.in_shop.value).toBe('1');
    expect(byKey.open_files.value).toBe('4');
    expect(byKey.open_files.subtitle).toContain('תיקי מוסך פתוחים 2');
    expect(byKey.due_today.value).toBe('—');
    expect(byKey.due_today.available).toBe(false);
    expect(byKey.quotes_waiting.value).toBe('2');
    expect(byKey.entered_month.value).toBe('1');
    expect(byKey.closed_month.value).toBe('1');
  });

  it('builds work queues from existing garage buckets without inventing due dates', () => {
    const queues = buildGarageOpsWorkQueues([
      row({
        id: 'open-in-shop',
        case_number: 'G-1',
        vehicle_id: 'v1',
        created_at: '2026-09-02T10:00:00Z',
        case_data: { ...emptyCaseData(), intakeDone: true, quoteSent: true, waitingForApproval: true },
      }),
      row({
        id: 'in-work',
        case_number: 'G-2',
        vehicle_id: 'v2',
        status: 'בעבודה',
        case_data: { ...emptyCaseData(), intakeDone: true, workStarted: true },
      }),
      row({
        id: 'closed',
        case_number: 'G-3',
        vehicle_id: 'v3',
        status: 'סגור',
        case_data: { ...emptyCaseData(), intakeDone: true, workFinished: true, caseClosed: true },
      }),
    ]);
    expect(queues.openFiles.map((item) => item.title)).toEqual(['G-1', 'G-2']);
    expect(queues.inWork.map((item) => item.title)).toEqual(['G-2']);
    expect(queues.waitingApproval.map((item) => item.title)).toEqual(['G-1']);
    expect(queues.openFiles[0].href).toBe('/garage-management/open-in-shop');
    expect(queues.inWork[0].nextAction).toMatch(/עבודה/);
  });

  it('does not treat missing claims access as zero claims', () => {
    const metrics = computeGarageOpsMetrics({
      now,
      openClaimsCount: null,
      cases: [row({ id: 'a', case_data: emptyCaseData() })],
    });
    const open = metrics.find((m) => m.key === 'open_files');
    expect(open?.value).toBe('1');
    expect(open?.subtitle).toMatch(/אין הרשאת claims_can_access/);
  });
});
