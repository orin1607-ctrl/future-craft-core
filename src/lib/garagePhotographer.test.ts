import { describe, expect, it } from 'vitest';
import { GARAGE_PHOTOGRAPHER_JOB_TITLE, GARAGE_PHOTOGRAPHER_LABEL, isGaragePhotographerJobTitle } from './garagePhotographer';
import { ROLE_MAP, USER_TYPE_LABELS } from './userManagementSchema';

describe('garage photographer user type', () => {
  it('is a create-user option with the Hebrew label', () => {
    expect(USER_TYPE_LABELS.garage_photographer).toBe('עובד צילומי מוסך');
    expect(USER_TYPE_LABELS.garage_photographer).toBe(GARAGE_PHOTOGRAPHER_LABEL);
  });

  it('reuses the existing driver role', () => {
    expect(ROLE_MAP.garage_photographer).toBe('driver');
    expect(ROLE_MAP.claims_worker).toBe('driver');
  });

  it('marks only the dedicated job title', () => {
    expect(isGaragePhotographerJobTitle(GARAGE_PHOTOGRAPHER_JOB_TITLE)).toBe(true);
    expect(isGaragePhotographerJobTitle('נהג')).toBe(false);
    expect(isGaragePhotographerJobTitle('')).toBe(false);
  });
});
