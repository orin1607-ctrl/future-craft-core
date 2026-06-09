/**
 * Access code infrastructure — structure for current UI + future 3-month rotation.
 * No DB persistence in phase 1.
 */

export type AccessCodeMode = 'manual' | 'auto';

export interface AccessCodeConfig {
  mode: AccessCodeMode;
  code: string;
  sendToEmail: boolean;
  requireVerification: boolean;
  /** Future: auto-rotate every 3 months */
  rotationEnabled: boolean;
  rotationMonths: number;
}

export const DEFAULT_ACCESS_CODE_CONFIG: AccessCodeConfig = {
  mode: 'auto',
  code: '',
  sendToEmail: false,
  requireVerification: true,
  rotationEnabled: false,
  rotationMonths: 3,
};

/** Generate a readable access code (8 chars, no ambiguous chars) */
export function generateAccessCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) {
    out += chars[arr[i] % chars.length];
  }
  return out;
}

export interface FutureRotationPolicy {
  enabled: boolean;
  intervalMonths: number;
  notifyDaysBefore: number;
  /** On rotate: invalidate old code, email new code, user must verify */
  autoInvalidatePrevious: boolean;
}

export const FUTURE_ROTATION_POLICY: FutureRotationPolicy = {
  enabled: false,
  intervalMonths: 3,
  notifyDaysBefore: 7,
  autoInvalidatePrevious: true,
};
