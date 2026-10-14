/**
 * Fictitious QA claims. The owner approved reading QA documents and sending their content to the
 * AI for testing; real customer claims stay behind their own gates until approved separately.
 * QA claim ids are created with this prefix only; real claims get the DAL-<year>-<n> counter.
 */
export const QA_CLAIM_PREFIX = 'DAL-QA-';

export function isQaClaimId(claimId: unknown) {
  const id = String(claimId ?? '').trim();
  return id.length > QA_CLAIM_PREFIX.length && id.startsWith(QA_CLAIM_PREFIX);
}
