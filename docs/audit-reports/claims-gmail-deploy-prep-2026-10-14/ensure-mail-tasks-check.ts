// Local check of ensureMailTasks (claims-gmail) against a fake task table. Fictitious data only.
// Run from a scratch copy of dedupe/ (or of 2026-10-13/patched/ to see the old behaviour):
//   grep -v "^Deno.serve" claims-gmail/index.ts > claims-gmail/harness-index.ts
//   echo 'export { ensureMailTasks };' >> claims-gmail/harness-index.ts
//   cp <this file> claims-gmail/harness.ts
//   SUPABASE_URL=http://localhost SUPABASE_SERVICE_ROLE_KEY=x deno run --allow-all --no-config claims-gmail/harness.ts
// Result 2026-10-14: fix 12/12 passed; live v57 6/12 (35 tasks from 7 emails, as in DAL-2026-0003).
import { ensureMailTasks } from "./harness-index.ts";
type Row = { id: string; claim_id: string; row_data: Record<string, unknown> };
const tasks: Row[] = [];
const tick = () => new Promise((r) => setTimeout(r, 0));
function sb(): any {
  return {
    from(table: string) {
      const q: any = { table, filters: [] as Array<[string, unknown]> };
      q.select = () => q;
      q.eq = (k: string, v: unknown) => { q.filters.push([k, v]); return q; };
      q.then = async (res: any) => { await tick(); const data = table === "claims_tasks" ? tasks.filter((t) => q.filters.every(([k, v]: any) => (t as any)[k] === v)).map((t) => ({ id: t.id, row_data: { ...t.row_data } })) : []; return res({ data, error: null }); };
      q.insert = async (row: Row) => { await tick(); if (tasks.some((t) => t.id === row.id)) return { error: { code: "23505", message: "dup" } }; tasks.push(row); return { error: null }; };
      return q;
    },
  };
}
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok ? "" : JSON.stringify(extra)); };
const body = "שלום, נא להעביר טופס אי הגשת תביעה, רישיון נהיגה, רישיון רכב, דוח שמאי וחשבונית מוסך.";
const run = (claimId: string, messageId: string, threadId = "TH-1", text = body, subject = "השלמת מסמכים") =>
  ensureMailTasks(sb(), { claimId, importId: `IMP-${messageId}`, messageId, threadId, from: "insurer@example.test", subject, body: text, sentAt: null });

const first = await run("C-3", "M1");
check("first email: 5 tasks created", first.created === 5 && tasks.length === 5, first);
const again = await run("C-3", "M1");
check("same email again: 0 created, 5 existing", again.created === 0 && again.existing === 5 && tasks.length === 5, again);
for (const m of ["M2", "M3", "M4", "M5", "M6", "M7"]) await run("C-3", m);
check("7 emails in one thread → still 5 tasks", tasks.length === 5, tasks.length);
const rerun = await Promise.all(["M1", "M2", "M3", "M4", "M5", "M6", "M7"].map((m) => run("C-3", m)));
check("scan re-run in parallel over all 7 → still 5", tasks.length === 5 && rerun.every((r) => r.created === 0), tasks.length);
const par = await Promise.all([run("C-4", "N1"), run("C-4", "N1"), run("C-4", "N2"), run("C-4", "N3")]);
check("4 parallel imports on a new claim → 5 tasks", tasks.filter((t) => t.claim_id === "C-4").length === 5, par.map((p) => p.created));
const reasons = new Set(again.tasks!.map((t: any) => t.reason));
check("existing ones say why (same_mail / open_exists)", reasons.has("same_mail"), [...reasons]);
const m2 = await run("C-3", "M8", "TH-9");
check("new thread asking the same documents → open tasks found", m2.created === 0 && m2.tasks!.every((t: any) => t.reason === "open_exists"), m2);
const t1 = tasks.find((t) => t.claim_id === "C-3" && t.row_data.requestType === "policy");
check("no task for a document nobody asked for", !t1);
const row = tasks.find((t) => t.claim_id === "C-3" && t.row_data.requestType === "driver_license")!;
check("row saved in the same shape as before", ["claimId", "action", "source", "gmailMessageId", "gmailThreadId", "importId", "mailIdem", "requestType", "requestKind", "workStatus", "docState", "readyFileId", "done", "createdAt", "note"].every((k) => k in row.row_data) && row.row_data.id === row.id && row.row_data.done === "false", row);
row.row_data.done = "true";
const after = await run("C-3", "M9", "TH-1", "נא להעביר רישיון נהיגה");
check("after closing the driver-license task, a new request opens one", after.created === 1, after);
const gen1 = await run("C-5", "G1", "TH-A", "אודה להשלמת מסמכים חסרים");
const gen2 = await run("C-5", "G2", "TH-A", "אודה להשלמת מסמכים חסרים");
const gen3 = await run("C-5", "G3", "TH-B", "אודה להשלמת מסמכים חסרים");
check("generic request: follow-up in thread = same task, new thread = new task", gen1.created === 1 && gen2.created === 0 && gen3.created === 1, [gen1.created, gen2.created, gen3.created]);
const none = await run("C-6", "Z1", "TH-Z", "תודה רבה", "עדכון");
check("an email with no request creates nothing", none.created === 0 && tasks.filter((t) => t.claim_id === "C-6").length === 0, none);
console.log(`\n${pass} passed, ${fail} failed`);
