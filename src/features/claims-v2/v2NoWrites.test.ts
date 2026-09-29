import { describe, expect, it } from 'vitest';

/** Stage 1 guard: the new claims UI source must not contain any write / send call. */
const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Every claimsService method that writes data or sends (from claimsService.ts). */
const WRITE_METHODS = [
  'initSystem', 'saveClaim', 'linkEmailManually', 'manualScanEmails', 'sendEmailFromClaim', 'saveTask', 'saveReminder',
  'markTreatmentPending', 'saveTreatmentUpdate', 'archiveClaim', 'restoreClaim', 'softDeleteClaim', 'upsertMailFollowup',
  'cancelMailFollowup', 'reuseScheduledRecurring', 'stopRecurringIfReplied', 'retryMailFollowup', 'logHistory', 'saveContact',
  'linkContactToClaim', 'setPrimaryClaimContact', 'dispatchMailNow', 'dispatchDueTest', 'saveCommEntry', 'markNotificationRead',
  'markAllNotificationsRead', 'closeClaim', 'assignClaim', 'setDocsOrderStatus', 'cancelScheduledMailFollowups',
  'importGmailMessage', 'invokeDocsForm', 'staffUpload', 'saveRequestTemplates', 'addDocRequest', 'resetDocRequest',
  'ensureVerifiedInsurerDepts', 'invokeIntake',
];

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bsupabase\s*\.\s*from\(/, 'direct Supabase table access'],
  [/@\/integrations\/supabase/, 'direct Supabase client import'],
  [/\.(insert|update|upsert|delete)\(/, 'table write'],
  [new RegExp(`\\.\\s*(${WRITE_METHODS.join('|')})\\(`), 'claimsService write method'],
  [/invokeGmail\(\s*'(?!status'|list_imports'|list_sends'|list_pending')/, 'claims-gmail action outside the read list'],
  [/invokeDocs\(\s*'(?!list_docs'|list_shares'|get_link'|get_garage_assignment'|list_garage_reviews'|signed_url'|signed_urls'|reveal_link')/, 'claims-docs action outside the read list'],
  [/functions\.invoke\(/, 'direct Edge Function call'],
];

describe('claims-v2 is read-only (stage 1)', () => {
  it('finds the new UI sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(8);
  });
  it('the guard itself catches a write call', () => {
    const [re] = FORBIDDEN[3];
    expect(re.test("api.saveTask({ claimId: 'x' })")).toBe(true);
    expect(re.test('setTab(k)')).toBe(false);
  });
  for (const [file, src] of Object.entries(sources)) {
    it(`${file} contains no write/send call`, () => {
      const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
      const hits = FORBIDDEN.filter(([re]) => re.test(code)).map(([, why]) => why);
      expect(hits).toEqual([]);
    });
  }
});
