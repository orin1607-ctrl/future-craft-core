import { describe, expect, it } from 'vitest';
import {
  alertCategoryMatches,
  alertInScope,
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

  it('urgent includes expired and the coming window, not far future', () => {
    expect(alertInScope(-3, 'urgent', 30)).toBe(true);
    expect(alertInScope(0, 'urgent', 30)).toBe(true);
    expect(alertInScope(30, 'urgent', 30)).toBe(true);
    expect(alertInScope(31, 'urgent', 30)).toBe(false);
    expect(alertInScope(null, 'urgent', 30)).toBe(true);
    expect(alertInScope(-3, 'expired', 30)).toBe(true);
    expect(alertInScope(5, 'expired', 30)).toBe(false);
    expect(alertInScope(90, 'all', 30)).toBe(true);
  });

  it('builds dashboard deep links', () => {
    expect(buildAlertsHref({ category: 'test', scope: 'urgent' })).toBe('/alerts?category=test&scope=urgent');
    expect(buildAlertsHref({ scope: 'all' })).toBe('/alerts?scope=all');
  });
});
