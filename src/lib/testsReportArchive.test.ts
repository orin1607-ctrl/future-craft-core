import { describe, expect, it } from 'vitest';
import { excludeArchivedVehicles } from './vehicleArchive';
import { buildVehicleRenewalEvents } from './vehicleExpiryShared';

/** Same filter the tests report applies before counting and listing. */
function testsInPeriod(vehicles: Parameters<typeof buildVehicleRenewalEvents>[0], from: Date, to: Date) {
  return buildVehicleRenewalEvents(excludeArchivedVehicles(vehicles), {
    from,
    to,
    kinds: ['test'],
  });
}

describe('tests report archive filter', () => {
  const novemberFrom = new Date(2026, 10, 1);
  const novemberTo = new Date(2026, 10, 30, 23, 59, 59, 999);

  const vehicles = [
    {
      id: 'v-484',
      internal_number: '484',
      license_plate: '00-000-00',
      status: 'archived',
      test_expiry: '2026-11-15',
    },
    {
      id: 'v-active',
      internal_number: '100',
      license_plate: '11-111-11',
      status: 'active',
      test_expiry: '2026-11-20',
    },
    {
      id: 'v-service',
      internal_number: '200',
      license_plate: '22-222-22',
      status: 'in_service',
      test_expiry: '2026-11-05',
    },
  ];

  it('keeps an archived November vehicle in the unfiltered builder', () => {
    const events = buildVehicleRenewalEvents(vehicles, {
      from: novemberFrom,
      to: novemberTo,
      kinds: ['test'],
    });
    expect(events.map((e) => e.internalNumber)).toContain('484');
  });

  it('shows only non-archived vehicles in the November tests report', () => {
    const events = testsInPeriod(vehicles, novemberFrom, novemberTo);
    expect(events.map((e) => e.internalNumber)).toEqual(['200', '100']);
    expect(events.some((e) => e.internalNumber === '484')).toBe(false);
    expect(events).toHaveLength(2);
  });
});
