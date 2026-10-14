/**
 * Fictitious QA claims approved by the owner for document reading, OCR and sending document content to
 * the AI. Real customer claims stay behind their own gates until approved separately.
 *
 * A claim counts as approved QA only when ALL of these hold:
 *   1. its id has the QA prefix (real claims get the DAL-<year>-<n> counter);
 *   2. its id is on APPROVED_QA_CLAIMS below — changing this list needs a reviewed deploy, it is not a
 *      setting staff can edit (claims_config is writable by every claims user);
 *   3. the claim row itself is marked isQa = 'true' and is not deleted (checked by the caller in the DB).
 * The prefix alone is not enough: any claims user can insert a row with any id, and the AI's
 * "test claim" onboarding creates DAL-QA-AI-<stamp> claims that could hold real details.
 */
export const QA_CLAIM_PREFIX = 'DAL-QA-';

/** Approved 2026-10-14 for the QA acceptance test. */
export const APPROVED_QA_CLAIMS: ReadonlySet<string> = new Set(['DAL-QA-AI-001']);

export function isQaClaimId(claimId: unknown) {
  const id = String(claimId ?? '').trim();
  return id.length > QA_CLAIM_PREFIX.length && id.startsWith(QA_CLAIM_PREFIX);
}

/** Conditions 1 and 2 (no DB needed). */
export function isApprovedQaClaimId(claimId: unknown) {
  const id = String(claimId ?? '').trim();
  return isQaClaimId(id) && APPROVED_QA_CLAIMS.has(id);
}

/** Condition 3, on the claim row as stored. */
export function isQaClaimRow(rowData: unknown) {
  const row = rowData && typeof rowData === 'object' ? rowData as Record<string, unknown> : {};
  return String(row.isQa ?? '') === 'true' && !row.deletedAt;
}
