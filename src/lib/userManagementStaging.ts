/**
 * Staging-only helpers for User Management QA.
 * The test login email may be reused across wizard runs without duplicate-user errors.
 */
export const STAGING_TEST_LOGIN_EMAIL = 'yoni19111977@gmail.com';

export function isStagingTestLoginEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === STAGING_TEST_LOGIN_EMAIL;
}
