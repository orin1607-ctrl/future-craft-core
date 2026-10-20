/**
 * Who may run claims-gmail scheduler actions (scan_inbox, import_message, apply_approved_gmail_tick
 * with scheduler: true). claims-gmail runs with verify_jwt off, so these checks are the only gate:
 *   - the internal scheduler secret (x-dalia-internal-key), as pg_cron sends it; or
 *   - the exact Staging service-role key.
 * A token that only *claims* service_role in an unsigned payload is never enough.
 */

/** Constant-time string compare. */
export function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Reads role/ref from a JWT payload. Not a verification — only used on our own service key. */
export function jwtRoleRef(token: string): { role?: string; ref?: string } {
  try {
    const part = token.split(".")[1];
    if (!part) return {};
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { role?: string; ref?: string };
    return { role: payload.role, ref: payload.ref };
  } catch {
    return {};
  }
}

export function isInternalSchedulerRequest(headers: Headers, internalSecret: string | undefined) {
  return sameSecret(headers.get("x-dalia-internal-key") || "", internalSecret || "");
}

export function isStagingServiceRoleRequest(headers: Headers, serviceKey: string | undefined, stagingRef: string, prodRef: string) {
  const token = (headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const key = serviceKey || "";
  if (key && sameSecret(token, key)) {
    const parsed = jwtRoleRef(key);
    if (parsed.ref === prodRef) return false;
    if (parsed.ref && parsed.ref !== stagingRef) return false;
    return true;
  }
  const parsed = jwtRoleRef(token);
  if (parsed.role === "service_role" && parsed.ref === stagingRef && parsed.ref !== prodRef) {
    return true;
  }
  return false;
}

