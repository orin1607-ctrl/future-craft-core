import { existsSync, readFileSync } from 'fs';

/** Load Google Ads secrets from .env.ads (and fallback .env.google). */
export function loadAdsEnv() {
  const out = {};
  for (const p of ['.env.ads', '.env.google']) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  }
  return out;
}

export function normalizeCustomerId(id) {
  if (!id) return null;
  return String(id).replace(/-/g, '').trim();
}

export function getAdsCredentials(env = loadAdsEnv()) {
  const developerToken =
    env.GOOGLE_ADS_DEVELOPER_TOKEN || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '';
  const customerId = normalizeCustomerId(
    env.GOOGLE_ADS_CUSTOMER_ID || process.env.GOOGLE_ADS_CUSTOMER_ID,
  );
  const loginCustomerId = normalizeCustomerId(
    env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  );
  return { developerToken, customerId, loginCustomerId, env };
}
