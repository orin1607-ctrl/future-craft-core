/**
 * Staging-only live probe of marketing-gemini-chat.
 * Prints HTTP status and a short reply. Never prints keys or tokens.
 * Creates one temporary super_admin and deletes it before exit.
 */
import { execSync } from "node:child_process";

const STAGING = "usfeoerkpcafxxlyuldl";
const PROD = "qasomfndnjuixgjmjwcm";
const URL = `https://${STAGING}.supabase.co`;

function redact(s) {
  return String(s || "")
    .replace(/AIza[\w\-]+/g, "[redacted]")
    .replace(/AQ\.[\w\-]+/g, "[redacted]")
    .replace(/eyJ[\w\-]+\.[\w\-]+\.[\w\-]+/g, "[redacted]")
    .replace(/sbp_[\w]+/g, "[redacted]")
    .slice(0, 240);
}

if (STAGING === PROD) throw new Error("ABORT_PROD");

const rawKeys = execSync(`npx --yes supabase@2.20.12 projects api-keys --project-ref ${STAGING} -o json`, {
  encoding: "utf8",
  timeout: 60000,
});
if (rawKeys.includes(PROD)) throw new Error("ABORT_KEYS_MENTION_PROD");
const keys = JSON.parse(rawKeys);
const service = keys.find((k) => k.name === "service_role" && k.type === "legacy")?.api_key;
const anon = keys.find((k) => k.name === "anon" && k.type === "legacy")?.api_key;
if (!service || !anon) throw new Error("MISSING_STAGING_KEYS");

const runId = Date.now();
const email = `op-gemini-${runId}@staging-e2e.local`;
const password = `Op!${runId}aA`;
let userId = "";

async function admin(path, options = {}) {
  const res = await fetch(`${URL}${path}`, {
    ...options,
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  return { res, text };
}

try {
  const created = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!created.res.ok) throw new Error(`CREATE_USER_${created.res.status}:${redact(created.text)}`);
  userId = JSON.parse(created.text).id;

  const profile = await admin("/rest/v1/profiles", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      id: userId,
      full_name: "OpenProspector Gemini Probe",
      company_name: "דליה",
      is_active: true,
      approval_status: "approved",
      two_factor_approved: true,
    }),
  });
  if (!profile.res.ok) throw new Error(`PROFILE_${profile.res.status}:${redact(profile.text)}`);

  await admin(`/rest/v1/user_roles?user_id=eq.${userId}`, { method: "DELETE" });
  const role = await admin("/rest/v1/user_roles", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, role: "super_admin" }),
  });
  if (!role.res.ok) throw new Error(`ROLE_${role.res.status}:${redact(role.text)}`);

  await new Promise((r) => setTimeout(r, 500));
  const sign = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = await sign.json().catch(() => ({}));
  if (!sign.ok || !session.access_token) throw new Error(`SIGNIN_${sign.status}:${redact(JSON.stringify(session))}`);

  const chat = await fetch(`${URL}/functions/v1/marketing-gemini-chat`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      system: "ענה בעברית במשפט אחד. אל תמציא מספרים.",
      prompt: "מהו ליד עסקי? ענה במשפט אחד בלי מספרים.",
    }),
  });
  const data = await chat.json().catch(() => ({}));
  const text = String(data.reply || data.text || data.error || "");
  console.log(JSON.stringify({
    project: STAGING,
    production_touched: false,
    http: chat.status,
    upstream_status: data.upstream_status || null,
    upstream_reason: data.upstream_reason || null,
    ok: !!(data.ok && text && !data.error),
    model: data.model || null,
    snippet: redact(text),
  }, null, 2));
} finally {
  if (userId) {
    await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" }).catch(() => {});
  }
}
