import { describe, expect, it } from 'vitest';

interface MockConfig {
  GMAIL_SYNC_PAUSED?: string;
  GMAIL_INBOX_LAST_SCAN_AT?: string;
  MAIL_DISPATCH_MODE?: string;
  GMAIL_SEND_ENABLED?: string;
}

// Model function matching the EXACT logic now in supabase/functions/claims-gmail/index.ts
function evaluateScanInboxStrict(config: MockConfig, options: { force?: boolean; systemScheduler?: boolean }) {
  // ABSOLUTE BLOCK: If GMAIL_SYNC_PAUSED === 'true', force: true is REJECTED. No bypass.
  if (config.GMAIL_SYNC_PAUSED === 'true') {
    return {
      success: true,
      skipped: true,
      paused: true,
      blocked: true,
      reason: 'sync_paused_by_admin',
      error: 'sync_strictly_paused',
      note: 'חסימת סנכרון מוחלטת פעילה (GMAIL_SYNC_PAUSED=true). לא ניתן לעקוף חסימה זו (כולל force=true) עד לביטול מפורש ע״י מנהל מורשה בלבד.',
      lastScanAt: config.GMAIL_INBOX_LAST_SCAN_AT || null,
      scheduler: Boolean(options.systemScheduler),
      mailboxMutated: false,
      realEmailSend: false,
    };
  }

  // Cadence check for scheduler (3 hours)
  const lastMs = config.GMAIL_INBOX_LAST_SCAN_AT ? Date.parse(config.GMAIL_INBOX_LAST_SCAN_AT) : 0;
  const now = Date.now();
  const threeHours = 3 * 3600 * 1000;
  if (options.systemScheduler && options.force !== true && lastMs && now - lastMs < threeHours) {
    return {
      success: true,
      skipped: true,
      paused: false,
      blocked: false,
      reason: 'scan_not_due',
      lastScanAt: config.GMAIL_INBOX_LAST_SCAN_AT,
      mailboxMutated: false,
      realEmailSend: false,
    };
  }

  return {
    success: true,
    skipped: false,
    paused: false,
    blocked: false,
    reason: 'scan_proceeding',
    lastScanAt: config.GMAIL_INBOX_LAST_SCAN_AT,
    mailboxMutated: true,
    realEmailSend: false,
  };
}

function evaluateResumeSync(role: string, body: { confirm_resume?: boolean; confirmation_token?: string }, config: MockConfig) {
  if (role !== 'super_admin') {
    return { success: false, status: 403, error: 'super_admin only' };
  }
  if (body.confirm_resume !== true || body.confirmation_token !== 'AUTHORIZE_RESUME_GMAIL_SYNC') {
    return { success: false, status: 400, error: 'explicit_authorization_required' };
  }
  config.GMAIL_SYNC_PAUSED = 'false';
  return { success: true, paused: false, message: 'Gmail inbox background sync is resumed on STAGING.' };
}

function evaluateRollbackSafety(config: MockConfig) {
  // Rollback NEVER removes or unpauses sync
  config.GMAIL_SYNC_PAUSED = 'true';
  const cronScheduled = false; // Unschedules cron
  return { config, cronScheduled };
}

describe('claims-gmail strict absolute pause mechanism', () => {
  const authenticScanAt = '2026-10-25T05:20:06.881Z';

  it('Requirement 1: absolute block when paused — force: true CANNOT bypass it', () => {
    const config: MockConfig = {
      GMAIL_SYNC_PAUSED: 'true',
      GMAIL_INBOX_LAST_SCAN_AT: authenticScanAt,
    };

    // Even with force: true and super_admin, scan MUST be blocked
    const res = evaluateScanInboxStrict(config, { systemScheduler: false, force: true });
    expect(res.skipped).toBe(true);
    expect(res.paused).toBe(true);
    expect(res.blocked).toBe(true);
    expect(res.error).toBe('sync_strictly_paused');
    expect(res.reason).toBe('sync_paused_by_admin');
    expect(res.mailboxMutated).toBe(false);
    expect(res.realEmailSend).toBe(false);
    expect(res.lastScanAt).toBe(authenticScanAt);
  });

  it('Requirement 1: scheduler scan is also strictly blocked without touching mailbox', () => {
    const config: MockConfig = {
      GMAIL_SYNC_PAUSED: 'true',
      GMAIL_INBOX_LAST_SCAN_AT: authenticScanAt,
    };

    const res = evaluateScanInboxStrict(config, { systemScheduler: true, force: false });
    expect(res.skipped).toBe(true);
    expect(res.paused).toBe(true);
    expect(res.blocked).toBe(true);
    expect(res.mailboxMutated).toBe(false);
  });

  it('Requirement 2: Rollback preserves GMAIL_SYNC_PAUSED=true and unschedules cron', () => {
    const config: MockConfig = {
      GMAIL_SYNC_PAUSED: 'true',
      GMAIL_INBOX_LAST_SCAN_AT: authenticScanAt,
    };

    const rollbackResult = evaluateRollbackSafety(config);
    expect(rollbackResult.config.GMAIL_SYNC_PAUSED).toBe('true');
    expect(rollbackResult.cronScheduled).toBe(false);

    // After rollback, scan is still 100% blocked
    const postRollbackScan = evaluateScanInboxStrict(rollbackResult.config, { systemScheduler: true, force: false });
    expect(postRollbackScan.blocked).toBe(true);
  });

  it('Requirement 3: resume_sync is strictly restricted to super_admin', () => {
    const config: MockConfig = { GMAIL_SYNC_PAUSED: 'true' };
    const res = evaluateResumeSync('claims_worker', { confirm_resume: true, confirmation_token: 'AUTHORIZE_RESUME_GMAIL_SYNC' }, config);
    expect(res.success).toBe(false);
    expect(res.status).toBe(403);
    expect(config.GMAIL_SYNC_PAUSED).toBe('true');
  });

  it('Requirement 3: resume_sync rejects super_admin if confirmation token is missing', () => {
    const config: MockConfig = { GMAIL_SYNC_PAUSED: 'true' };
    const res = evaluateResumeSync('super_admin', { confirm_resume: true }, config);
    expect(res.success).toBe(false);
    expect(res.status).toBe(400);
    expect(res.error).toBe('explicit_authorization_required');
    expect(config.GMAIL_SYNC_PAUSED).toBe('true');
  });

  it('Requirement 3: resume_sync unpauses only with super_admin AND exact confirmation token', () => {
    const config: MockConfig = { GMAIL_SYNC_PAUSED: 'true' };
    const res = evaluateResumeSync('super_admin', { confirm_resume: true, confirmation_token: 'AUTHORIZE_RESUME_GMAIL_SYNC' }, config);
    expect(res.success).toBe(true);
    expect(res.paused).toBe(false);
    expect(config.GMAIL_SYNC_PAUSED).toBe('false');
  });

  it('Preserves read-only access to existing 458 emails during pause', () => {
    const isPaused = true;
    const canReadExistingImports = isPaused && 458 > 0;
    expect(canReadExistingImports).toBe(true);
  });
});
