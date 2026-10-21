// Owner auth for the Marketing Center functions (social-meta, marketing-hub). STAGING.
// `x-social-key` carries either the owner key (SOCIAL_ADMIN_KEY) or a paired device token ("dev_…").
// Device tokens are stored only as SHA-256 hashes in public.social_devices and can be revoked.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function safeEq(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type SocialAuth = { ok: false } | { ok: true; kind: "owner" } | { ok: true; kind: "device"; deviceId: string };

export async function checkSocialKey(db: SupabaseClient, key: string): Promise<SocialAuth> {
  const owner = (Deno.env.get("SOCIAL_ADMIN_KEY") || "").trim();
  if (safeEq(key, owner)) return { ok: true, kind: "owner" };
  if (!/^dev_[A-Za-z0-9_-]{32,}$/.test(key)) return { ok: false };
  const { data } = await db.from("social_devices").select("id,last_seen_at")
    .eq("token_hash", await sha256(key)).is("revoked_at", null).maybeSingle();
  if (!data) return { ok: false };
  // Touch last_seen at most every 10 minutes.
  if (!data.last_seen_at || Date.now() - new Date(data.last_seen_at).getTime() > 600_000) {
    await db.from("social_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  }
  return { ok: true, kind: "device", deviceId: data.id };
}

const PAIR_TTL_MS = 10 * 60_000;
const PAIR_MAX_ATTEMPTS = 5;

// Called by a signed-in session: one open code at a time; older open codes are closed.
export async function pairStart(db: SupabaseClient) {
  await db.from("social_pairings").update({ used_at: new Date().toISOString() }).is("used_at", null);
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  const code = String(n).padStart(6, "0");
  const expires = new Date(Date.now() + PAIR_TTL_MS).toISOString();
  const { error } = await db.from("social_pairings").insert({ code_hash: await sha256("pair:" + code), expires_at: expires });
  if (error) throw error;
  return { code, expires_at: expires };
}

// Called by the phone without a key. Only one code is ever open, it lives 10 minutes and dies after
// 5 wrong tries, so guessing 6 digits is not practical.
export async function pairComplete(db: SupabaseClient, code: string, deviceName: string) {
  const clean = String(code || "").replace(/\D/g, "");
  const { data: open } = await db.from("social_pairings").select("*").is("used_at", null)
    .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!open) throw new Error("אין קוד חיבור פעיל. במחשב לחצו \"חיבור טלפון\" כדי לקבל קוד חדש.");
  if (clean.length !== 6 || !safeEq(await sha256("pair:" + clean), open.code_hash)) {
    const attempts = open.attempts + 1;
    await db.from("social_pairings").update({ attempts, used_at: attempts >= PAIR_MAX_ATTEMPTS ? new Date().toISOString() : null }).eq("id", open.id);
    throw new Error(attempts >= PAIR_MAX_ATTEMPTS
      ? "הקוד ננעל אחרי 5 ניסיונות שגויים. צרו קוד חדש במחשב."
      : `הקוד שגוי. נותרו ${PAIR_MAX_ATTEMPTS - attempts} ניסיונות.`);
  }
  await db.from("social_pairings").update({ used_at: new Date().toISOString() }).eq("id", open.id);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = "dev_" + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const { error } = await db.from("social_devices").insert({
    name: String(deviceName || "טלפון").slice(0, 80), token_hash: await sha256(token), last_seen_at: new Date().toISOString(),
  });
  if (error) throw error;
  return { token };
}

export async function listDevices(db: SupabaseClient) {
  const { data, error } = await db.from("social_devices").select("id,name,created_at,last_seen_at")
    .is("revoked_at", null).order("created_at", { ascending: false });
  if (error) throw error;
  return { devices: data };
}

export async function revokeDevice(db: SupabaseClient, id: string) {
  const { error } = await db.from("social_devices").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return { ok: true };
}
