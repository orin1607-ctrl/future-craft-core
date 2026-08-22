import { describe, expect, it } from 'vitest';
import {
  alertCategoryMatches,
  alertInScope,
  alertPassesListFilters,
  buildAlertsHref,
  parseAlertListScope,
} from './alertListScope';

describe('alertListScope', () => {
  it('defaults missing scope to urgent', () => {
    expect(parseAlertListScope(null)).toBe('urgent');
    expect(parseAlertListScope('nope')).toBe('urgent');
  });

  it('groups all insurance types under insurance filter', () => {
    expect(alertCategoryMatches('insurance', 'insurance')).toBe(true);
    expect(alertCategoryMatches('insurance', 'comprehensive_insurance')).toBe(true);
    expect(alertCategoryMatches('insurance', 'third_party_insurance')).toBe(true);
    expect(alertCategoryMatches('insurance', 'test')).toBe(false);
    expect(alertCategoryMatches('test', 'test')).toBe(true);
  });

  it('urgent is 0–30 only; expired is strictly before today; no overlap', () => {
    expect(alertInScope(-1, 'urgent', 30)).toBe(false);
    expect(alertInScope(0, 'urgent', 30)).toBe(true);
    expect(alertInScope(1, 'urgent', 30)).toBe(true);
    expect(alertInScope(30, 'urgent', 30)).toBe(true);
    expect(alertInScope(31, 'urgent', 30)).toBe(false);
    expect(alertInScope(null, 'urgent', 30)).toBe(true);
    expect(alertInScope(-1, 'expired', 30)).toBe(true);
    expect(alertInScope(0, 'expired', 30)).toBe(false);
    expect(alertInScope(5, 'expired', 30)).toBe(false);
    expect(alertInScope(90, 'all', 30)).toBe(true);
    expect(alertInScope(-3, 'urgent', 30) && alertInScope(-3, 'expired', 30)).toBe(false);
    expect(alertInScope(0, 'urgent', 30) && alertInScope(0, 'expired', 30)).toBe(false);
  });

  it('builds dashboard deep links', () => {
    expect(buildAlertsHref({ category: 'test', scope: 'urgent' })).toBe('/alerts?category=test&scope=urgent');
    expect(buildAlertsHref({ scope: 'all' })).toBe('/alerts?scope=all');
  });

  it('urgent service list matches dashboard periodic+date rows only', () => {
    const svcdate = { id: 'svcdate-1', category: 'service_order', daysLeft: 5, title: 'טיפול תקופתי', meta: '' };
    const periodic = { id: 'so-1', category: 'service_order', daysLeft: null, title: 'הזמנת שירות', meta: 'טיפול תקופתי' };
    const otherOrder = { id: 'so-2', category: 'service_order', daysLeft: null, title: 'הזמנת שירות', meta: 'פחחות' };
    const custom = { id: 'custom-1', category: 'service_order', daysLeft: 3, title: 'תזכורת', meta: 'טיפול תקופתי' };
    expect(alertPassesListFilters(svcdate, 'service_order', 'urgent', 30)).toBe(true);
    expect(alertPassesListFilters(periodic, 'service_order', 'urgent', 30)).toBe(true);
    expect(alertPassesListFilters(otherOrder, 'service_order', 'urgent', 30)).toBe(false);
    expect(alertPassesListFilters(custom, 'service_order', 'urgent', 30)).toBe(false);
    expect(alertPassesListFilters(custom, 'service_order', 'all', 30)).toBe(true);
  });
});
