// Ephemeral STAGING test user with a regular role (telemarketing_agent) – session cached in the scratchpad
import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import fs from "fs";
const REF = "usfeoerkpcafxxlyuldl", URL = `https://${REF}.supabase.co`;
const CRED = process.env.NR_QA_CRED || "nr-qa-cred.json"; // keep outside the repo
export async function getSession() {
  const keys = JSON.parse(execSync(`npx --no-install supabase projects api-keys --project-ref ${REF} -o json`, { encoding: "utf8" }));
  const anon = keys.find((k) => k.name === "anon" && k.type === "legacy").api_key;
  const service = keys.find((k) => k.name === "service_role" && k.type === "legacy").api_key;
  let cred = fs.existsSync(CRED) ? JSON.parse(fs.readFileSync(CRED, "utf8")) : null;
  if (!cred) {
    const admin = createClient(URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
    const id = Date.now();
    cred = { email: `nr-filters-qa-${id}@staging-e2e.local`, password: `Qa!${id}x` };
    const { data, error } = await admin.auth.admin.createUser({ email: cred.email, password: cred.password, email_confirm: true });
    if (error) throw new Error("createUser: " + error.message);
    cred.uid = data.user.id;
    const p = await admin.from("profiles").upsert({ id: cred.uid, full_name: "Registry filters QA (regular user)", company_name: "QA", is_active: true, approval_status: "approved" });
    if (p.error) console.error("profile:", p.error.message);
    await admin.from("user_roles").delete().eq("user_id", cred.uid);
    const r = await admin.from("user_roles").insert({ user_id: cred.uid, role: "telemarketing_agent" });
    if (r.error) throw new Error("role: " + r.error.message);
    fs.writeFileSync(CRED, JSON.stringify(cred));
  }
  const sb = createClient(URL, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: cred.email, password: cred.password });
  if (error) throw new Error("signIn: " + error.message);
  return { session: data.session, anon, url: URL, ref: REF, uid: cred.uid };
}
