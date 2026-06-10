import { describe, expect, it } from 'vitest';
import {
  MOCK_LOG_ENTRIES,
  filterMockEntries,
  resolveLogViewMode,
  topicOptionsForView,
  mockActiveAlertCount,
} from './notificationLogMock';

describe('notificationLogMock scope separation', () => {
  it('resolves view modes from URL params', () => {
    expect(resolveLogViewMode({ driverId: 'd1' })).toBe('driver');
    expect(resolveLogViewMode({ vehicleId: 'v1', vehiclePlate: '12-345-67' })).toBe('vehicle');
    expect(resolveLogViewMode({})).toBe('general');
  });

  it('driver log excludes vehicle scope entries', () => {
    const entries = filterMockEntries(MOCK_LOG_ENTRIES, { viewMode: 'driver', timing: 'active' });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.scope === 'driver')).toBe(true);
    expect(entries.some((e) => e.topic === 'טסט')).toBe(false);
    expect(entries.some((e) => e.topic === 'ביטוח חובה')).toBe(false);
  });

  it('vehicle log excludes driver scope entries', () => {
    const entries = filterMockEntries(MOCK_LOG_ENTRIES, { viewMode: 'vehicle', timing: 'active' });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.scope === 'vehicle')).toBe(true);
    expect(entries.some((e) => e.topic === 'רישיון נהיגה')).toBe(false);
    expect(entries.some((e) => e.topic === 'תוקף אישור רפואי')).toBe(false);
  });

  it('general log includes all scopes', () => {
    const entries = filterMockEntries(MOCK_LOG_ENTRIES, { viewMode: 'general' });
    const scopes = new Set(entries.map((e) => e.scope));
    expect(scopes.has('driver')).toBe(true);
    expect(scopes.has('vehicle')).toBe(true);
    expect(scopes.has('company')).toBe(true);
  });

  it('topic options differ by view mode', () => {
    const driver = topicOptionsForView('driver');
    const vehicle = topicOptionsForView('vehicle');
    expect(driver).toContain('רישיון נהיגה');
    expect(driver).not.toContain('טסט');
    expect(vehicle).toContain('טסט');
    expect(vehicle).not.toContain('רישיון נהיגה');
  });

  it('active alert count respects scope', () => {
    const driverCount = mockActiveAlertCount('d1', 'driver');
    const vehicleCount = mockActiveAlertCount('v1', 'vehicle');
    expect(driverCount).toBeGreaterThan(0);
    expect(vehicleCount).toBeGreaterThan(0);
  });
});
