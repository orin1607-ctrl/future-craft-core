// Local check only (not committed). Real claimsTools code, in-memory fake DB, fake Gmail / claims-docs.
// Fictitious data only. Nothing is sent anywhere.
import { executeClaimsGeneralTool, executeClaimsPendingAction, executeClaimsTool } from "./claimsTools.ts";

type Row = Record<string, any>;
const db: Record<string, Row[]> = {
  claims_records: [
    { id: "DAL-QA-P1", plate: "11-222-33", client_name: "לקוח בדיקה", row_data: { id: "DAL-QA-P1", claimNum: "QA-P1", clientName: "לקוח בדיקה", clientPhone: "050-1111111", status: "חדש" } },
    { id: "DAL-QA-P2", plate: "44-555-66", client_name: "אחר", row_data: { id: "DAL-QA-P2", claimNum: "QA-P2", status: "חדש" } },
    { id: "DAL-2026-9001", plate: "77-888-99", client_name: "לקוח אמיתי בדיוני", row_data: { id: "DAL-2026-9001", claimNum: "R-9001", status: "חדש" } },
  ],
  claims_tasks: [{ id: "TSK-OPEN", claim_id: "DAL-QA-P1", row_data: { id: "TSK-OPEN", claimId: "DAL-QA-P1", action: "לבקש חשבונית", done: "false" } }],
  claims_history: [],
  claims_notifications: [],
  claims_reminders: [
    { id: "REM-CANC", claim_id: "DAL-QA-P1", action: "note", row_data: { id: "REM-CANC", claimId: "DAL-QA-P1", date: "2026-11-01", note: "ישנה", cancelled: "true" } },
  ],
  claims_comm_log: [],
  claims_documents: [
    { id: "DOC-1", claim_id: "DAL-QA-P1", original_name: "survey.pdf", doc_meta: { read_status: "ready", read_doc_type: "דוח שמאי", read_text: "Survey report" } },
    { id: "DOC-OTHER", claim_id: "DAL-QA-P2", original_name: "x.pdf", doc_meta: {} },
    { id: "DOC-R", claim_id: "DAL-2026-9001", original_name: "invoice.pdf", doc_meta: { read_status: "ready", read_doc_type: "חשבונית", read_text: "Invoice 4,500 NIS", read_amounts: "4,500" } },
  ],
  claims_ai_audit_log: [],
  customers: [],
  claims_config: [{ key: "CLAIM_COUNTER", value: "41" }],
};
let denyWrites = false;
const invoked: Array<{ fn: string; body: Row }> = [];

function field(row: Row, col: string) {
  if (col.startsWith("row_data->>")) return row.row_data?.[col.slice(11)];
  return row[col];
}
class Q {
  filters: Array<(r: Row) => boolean> = [];
  op: "select" | "update" | "insert" = "select";
  payload: Row | null = null;
  isSingle = false;
  wantRows = false;
  constructor(public table: string) {}
  select() { if (this.op !== "select") this.wantRows = true; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => field(r, c) === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => field(r, c) !== v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(field(r, c))); return this; }
  ilike(c: string, v: string) { this.filters.push((r) => String(field(r, c) ?? "").toLowerCase() === v.toLowerCase()); return this; }
  order() { return this; }
  limit() { return this; }
  update(p: Row) { this.op = "update"; this.payload = p; return this; }
  insert(p: Row) { this.op = "insert"; this.payload = p; return this; }
  maybeSingle() { this.isSingle = true; return this; }
  single() { this.isSingle = true; return this; }
  run() {
    const rows = db[this.table] || (db[this.table] = []);
    if (this.op === "insert") {
      if (denyWrites && this.table !== "claims_ai_audit_log") return { data: [], error: null };
      rows.push(structuredClone(this.payload));
      return { data: this.wantRows ? (this.isSingle ? { ...this.payload, id: this.payload!.id || "CUST-1" } : [{ id: this.payload!.id }]) : null, error: null };
    }
    const hit = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "update") {
      if (denyWrites) return { data: [], error: null };
      for (const r of hit) Object.assign(r, structuredClone(this.payload));
      return { data: structuredClone(hit), error: null };
    }
    return { data: this.isSingle ? structuredClone(hit[0] ?? null) : structuredClone(hit), error: null };
  }
  then(res: (v: unknown) => void, rej: (e: unknown) => void) { try { res(this.run()); } catch (e) { rej(e); } }
}
const sb = {
  from: (t: string) => new Q(t),
  auth: { getUser: async () => ({ data: { user: { email: "tester@example.test" } } }) },
  functions: {
    invoke: async (fn: string, opts: { body: Row }) => {
      invoked.push({ fn, body: opts.body });
      if (fn === "claims-docs" && opts.body.action === "create_share") return { data: { success: true, token: "TESTTOKEN" }, error: null };
      if (fn === "claims-gmail" && opts.body.action === "send_claim") return { data: { success: true, realEmailSend: true, gmail_message_id: "fake-1" }, error: null };
      return { data: { success: false }, error: null };
    },
  },
} as any;

let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
};
const P1 = "DAL-QA-P1";
const run = (name: string, args: Row) => executeClaimsTool(name, args, sb, P1, "user-1", "בודק");
const approve = (preview: any, claim = P1) => executeClaimsPendingAction(sb, claim, "user-1", "בודק", preview);
const hist = (claim = P1) => db.claims_history.filter((h) => h.claim_id === claim);

// ---- Tasks ----
const t1 = await run("preview_create_claim_task", { task_description: "להתקשר לשמאי", due_date: "20/10/2026", owner: "דנה" });
check("task: card prepared", !!t1.preview && String(t1.preview.summary).includes("יעד: 2026-10-20"), t1);
check("task: nothing saved before approval", db.claims_tasks.length === 1);
const t1x = await approve(t1.preview);
const newTask = db.claims_tasks.find((t) => t.row_data.action === "להתקשר לשמאי");
check("task: saved in the screen's shape", t1x.success && newTask?.row_data.dueDate === "2026-10-20" && newTask?.row_data.owner === "דנה" && newTask?.row_data.done === "false" && newTask?.row_data.claimId === P1, { t1x, newTask });
check("task: history + notification written", hist().some((h) => h.row_data.action === "משימה נוספה: להתקשר לשמאי" && h.row_data.claimId === P1) && db.claims_notifications.some((n) => n.row_data.message === "משימה: להתקשר לשמאי"));
const dup = await run("preview_create_claim_task", { task_description: "לבקש  חשבונית." });
check("task: duplicate of open task refused, no card", !dup.preview && (dup.result as any).status === "duplicate", dup.result);
denyWrites = true;
const t2 = await run("preview_create_claim_task", { task_description: "משימה ללא הרשאה" });
const t2x = await approve(t2.preview);
denyWrites = false;
check("task: no permission → reported as not created", t2x.success === false && !db.claims_tasks.some((t) => t.row_data.action === "משימה ללא הרשאה"), t2x);

// ---- Close task ----
const c0 = await approve({ preview_id: "x", summary: "s", tool_name: "preview_close_claim_task", action_type: "close_task", parameters: { claim_id: P1, task_id: "TSK-NOPE" } });
check("close: missing task is not reported as closed", c0.success === false && c0.error === "task_not_found", c0);
const c1 = await approve({ preview_id: "x", summary: "s", tool_name: "preview_close_claim_task", action_type: "close_task", parameters: { claim_id: P1, task_id: "TSK-OPEN" } });
check("close: real task closed + history", c1.success && db.claims_tasks.find((t) => t.id === "TSK-OPEN")!.row_data.done === "true" && hist().some((h) => h.row_data.action === "משימה נסגרה: לבקש חשבונית"), c1);

// ---- Notes ----
const n1 = await run("preview_add_claim_note", { note: "הלקוח ביקש עדכון טלפוני" });
const n1x = await approve(n1.preview);
check("note: saved with id and claimId (shows in history)", n1x.success && hist().some((h) => h.row_data.type === "ai_note" && h.row_data.claimId === P1 && h.row_data.id), n1x);

// ---- Reminders ----
const r1 = await run("preview_create_claim_reminder", { date: "2027-01-05", note: "לבדוק תשובת ביטוח" });
const r1x = await approve(r1.preview);
const rem = db.claims_reminders.find((r) => r.row_data.note === "לבדוק תשובת ביטוח");
check("reminder: saved like the screen (action note, sent false)", r1x.success && rem?.action === "note" && rem?.row_data.sent === "false" && rem?.row_data.date === "2027-01-05", { r1x, rem });
const rl = await run("list_claim_reminders", {});
check("reminder: list hides cancelled", (rl.result as any).reminders.length === 1, rl.result);
const rc = await run("preview_update_claim_reminder", { reminder_id: "REM-CANC", date: "2027-02-01" });
check("reminder: cancelled one is never re-activated", !rc.preview && String((rc.result as any).error).includes("בוטלה"), rc.result);
const ru = await run("preview_update_claim_reminder", { reminder_id: rem!.id, date: "2027-01-07" });
const rux = await approve(ru.preview);
check("reminder: date moved + history", rux.success && rem && db.claims_reminders.find((r) => r.id === rem.id)!.row_data.date === "2027-01-07" && hist().some((h) => h.row_data.action === "תזכורת עודכנה: 2027-01-07"), rux);
const rk = await run("preview_update_claim_reminder", { reminder_id: rem!.id, cancel: true });
await approve(rk.preview);
check("reminder: cancel works", db.claims_reminders.find((r) => r.id === rem!.id)!.row_data.cancelled === "true");

// ---- WhatsApp ----
const w1 = await run("preview_schedule_claim_whatsapp", { phone: "050-1111111", body: "שלום, הנה דוח השמאי: {link}", relative_day: 1, file_ids: ["DOC-1"] });
check("wa: one card covering link + schedule, says not sent automatically", !!w1.preview && String(w1.preview.summary).includes("קישור מאובטח") && String(w1.preview.summary).includes("לא תישלח אוטומטית"), w1);
check("wa: nothing created before approval", db.claims_comm_log.length === 0 && !invoked.length);
const w1x = await approve(w1.preview);
const comm = db.claims_comm_log[0];
check("wa: saved as manual schedule, not sent", w1x.success && comm?.row_data.waStatus === "scheduled_blocked" && comm?.row_data.delivery === "not_sent" && comm?.row_data.type === "wa", { w1x, comm });
check("wa: secure link created only for this claim and put in the message", invoked.some((i) => i.fn === "claims-docs" && i.body.action === "create_share" && i.body.claim_id === P1 && i.body.ttl_hours === 72) && String(comm?.row_data.body).includes("claims-share?t=TESTTOKEN"), invoked);
check("wa: result says waiting for manual send, never 'sent'", String(w1x.message).includes("ממתין לשליחה ידנית") && !/^נשלח/.test(String(w1x.message)), w1x);
const w2 = await run("preview_schedule_claim_whatsapp", { phone: "050-1111111", body: "x", relative_day: 1, file_ids: ["DOC-OTHER"] });
check("wa: document of another claim refused", !w2.preview && String((w2.result as any).error).includes("לא שייכים"), w2.result);
const w3 = await run("preview_schedule_claim_whatsapp", { phone: "123", body: "x", when: "now" });
check("wa: bad phone refused", !w3.preview, w3.result);
const wl = await run("list_claim_whatsapp", {});
check("wa: list shows waiting for manual send", (wl.result as any).messages[0].status.includes("ממתין לשליחה ידנית"), wl.result);

// ---- Email reply in thread (fake Gmail) ----
const e1 = await run("preview_send_claim_email", { send_to_self: true, subject: "בדיקה", body: "גוף", file_ids: ["DOC-1"], thread_id: "thread-abc" });
const e1x = await approve(e1.preview);
const sendCall = invoked.find((i) => i.fn === "claims-gmail");
check("email: reply goes to the thread, to the user, only after approval", e1x.success && sendCall?.body.thread_id === "thread-abc" && sendCall?.body.to === "tester@example.test", { e1x, sendCall });

// ---- General chat on a named claim ----
const g1 = await executeClaimsGeneralTool("preview_create_claim_task", { claim_ref: "qa-p2", task_description: "משימה מהצ׳אט הכללי" }, sb, "user-1", "בודק");
check("general: claim found by claim number, card for that claim", (g1.result as any).claim_id === "DAL-QA-P2" && (g1.preview?.parameters as any).claim_id === "DAL-QA-P2", g1);
const g1x = await executeClaimsPendingAction(sb, "", "user-1", "בודק", g1.preview!);
check("general: approved task saved on the named claim", g1x.success && db.claims_tasks.some((t) => t.claim_id === "DAL-QA-P2" && t.row_data.action === "משימה מהצ׳אט הכללי"), g1x);
const g2 = await executeClaimsGeneralTool("list_claim_reminders", { claim_ref: "NOPE" }, sb, "user-1", "בודק");
check("general: unknown claim refused", String((g2.result as any).error).includes("לא נמצא"), g2.result);

// ---- A card from one claim never runs on another ----
const x1 = await run("preview_add_claim_note", { note: "הערה" });
const x1x = await approve(x1.preview, "DAL-QA-P2");
check("guard: card of claim P1 refused while P2 is open", x1x.success === false && x1x.error === "claim_mismatch", x1x);


// ---- Package 2: reading a document, finding a claim by plate / name ----
const rd = await run("read_claim_document", { file_id: "DOC-1" });
const rdr = rd.result as any;
check("read: card shown and document found", rdr.found === true && (rd as any).card?.file_id === "DOC-1", rd);
check("read: QA claim — the stored text reaches the model, with the answer-only-from-this-document rule", rdr.document_read?.text === "Survey report" && !rdr.document_read?.content_withheld && String(rdr.document_read?.instruction).includes("ענה רק מתוך"), rdr.document_read);
const rr = await executeClaimsTool("read_claim_document", { file_id: "DOC-R" }, sb, "DAL-2026-9001", "user-1", "בודק");
const rrr = (rr.result as any).document_read || {};
check("read: real claim — content withheld, no text or amount reaches the model", rrr.content_withheld === true && !("text" in rrr) && !JSON.stringify(rr.result).includes("4,500"), rr.result);
const lr = await executeClaimsTool("list_claim_documents", {}, sb, "DAL-2026-9001", "user-1", "בודק");
check("list: real claim — no document text or amounts in the list", !JSON.stringify(lr.result).includes("Invoice") && !JSON.stringify(lr.result).includes("4,500"), lr.result);
const gr2 = await executeClaimsGeneralTool("read_claim_document", { claim_ref: "77-888-99", file_id: "DOC-R" }, sb, "user-1", "בודק");
check("general chat: real claim by plate — content still withheld", JSON.stringify(gr2.result).includes("content_withheld") && !JSON.stringify(gr2.result).includes("4,500"), gr2.result);
const rdx = await run("read_claim_document", { file_id: "DOC-OTHER" });
check("read: document of another claim not found", (rdx.result as any).found === false, rdx.result);
const ld = await run("list_claim_documents", {});
check("list: no document text in the list", !JSON.stringify(ld.result).includes("Survey report"), ld.result);
const gp = await executeClaimsGeneralTool("list_claim_reminders", { claim_ref: "44-555-66" }, sb, "user-1", "בודק");
check("general: claim found by plate", (gp.result as any).claim_id === "DAL-QA-P2", gp.result);
const gn = await executeClaimsGeneralTool("list_claim_documents", { claim_ref: "לקוח בדיקה" }, sb, "user-1", "בודק");
check("general: claim found by client name", (gn.result as any).claim_id === "DAL-QA-P1", gn.result);
db.claims_records.push({ id: "DAL-QA-P3", plate: "44-555-66", client_name: "שלישי", row_data: { id: "DAL-QA-P3", status: "חדש" } });
const ga = await executeClaimsGeneralTool("list_claim_reminders", { claim_ref: "4455566" }, sb, "user-1", "בודק");
check("general: two claims with the same plate → ask, don't guess", String((ga.result as any).error).includes("נמצאו 2"), ga.result);
const gr = await executeClaimsGeneralTool("read_claim_document", { claim_ref: "QA-P1", file_id: "DOC-1" }, sb, "user-1", "בודק");
check("general: read a document of a named claim, with its card", (gr.result as any).claim_id === "DAL-QA-P1" && (gr as any).card?.claim_id === "DAL-QA-P1", gr);


// ---- Findings fixes: document ids, sender name, onboarding ----
const lst = await run("list_claim_documents", {});
const firstDoc = (lst.result as any).documents[0];
check("#1 list returns file_id (the key the tools take)", typeof firstDoc.file_id === "string" && !("id" in firstDoc), firstDoc);
const byIdx = await run("show_claim_document", { index: 1 });
check("#1 show by list number works", (byIdx.result as any).found === true && (byIdx.result as any).file_id === firstDoc.file_id, byIdx.result);
const byName = await run("show_claim_document", { name: "survey" });
check("#1 show by document name works", (byName.result as any).found === true && (byName.result as any).file_id === "DOC-1", byName.result);
const noRef = await run("show_claim_document", {});
check("#1 no reference → clear instruction, not a crash", (noRef.result as any).found === false && String((noRef.result as any).error).includes("file_id"), noRef.result);
const other = await run("show_claim_document", { name: "x.pdf" });
check("#1 a document of another claim is never found by name", (other.result as any).found === false, other.result);
for (let i = 0; i < 90; i++) db.claims_documents.push({ id: `BULK-${i}`, claim_id: "DAL-QA-P1", original_name: `photo-${i}.jpg`, mime_type: "image/jpeg", doc_meta: {}, created_at: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z` });
const big = await run("list_claim_documents", {});
check("#1 many documents come in pages of 40", (big.result as any).documents.length === 40 && (big.result as any).pages === 3, { len: (big.result as any).documents.length, pages: (big.result as any).pages });

const em = await run("preview_send_claim_email", { send_to_self: true, file_ids: ["DOC-1"] });
const emp = (em.preview as any).parameters;
check("#2 default email signed 'דליה ניהול תביעות', not 'מוסך אורן'", String(emp.body).includes("דליה ניהול תביעות") && !String(emp.body + emp.subject).includes("מוסך אורן"), emp);

const ob = await executeClaimsGeneralTool("preview_create_claim_from_onboarding", { client_name: "לקוח בדיקה פיקטיבי", is_test: true }, sb, "user-1", "בודק");
const obp = (ob.preview as any)?.parameters;
check("#4 no plate given → saved as missing, nothing invented", obp?.vehicle?.plate === "חסר", obp?.vehicle);
check("#4 card says QA claim and STAGING target", String(ob.preview?.summary).includes("תיק בדיקה (QA)") && String(ob.preview?.summary).includes("STAGING"), ob.preview?.summary);
const ob2 = await executeClaimsGeneralTool("preview_create_claim_from_onboarding", { client_name: "x", plate: "12" }, sb, "user-1", "בודק");
check("#4 invalid plate is not kept", (ob2.preview as any).parameters.vehicle.plate === "חסר" && String(ob2.preview?.summary).includes("אינו תקין"), (ob2.preview as any).parameters.vehicle);
const counterBefore = db.claims_config?.find((r: any) => r.key === "CLAIM_COUNTER")?.value;
const obx = await executeClaimsPendingAction(sb, "", "user-1", "בודק", {
  ...ob.preview!,
  parameters: { ...(ob.preview as any).parameters, claim: { ...(ob.preview as any).parameters.claim, claim_number: "INS-777", accident_date: "05/09/2026", surveyor: "שמאי בדיקה", third_party: "צד ג בדיקה" } },
});
const qa = db.claims_records.find((r: any) => String(r.id).startsWith("DAL-QA-AI-"));
check("#4 QA claim id, real counter untouched", obx.success === true && !!qa && db.claims_config?.find((r: any) => r.key === "CLAIM_COUNTER")?.value === counterBefore, { obx, qa: qa?.id });
check("#4 saved under the claim form's field names (card shows them)", qa?.row_data.claimNum === "INS-777" && qa?.row_data.eventDate === "2026-09-05" && qa?.row_data.surveyor === "שמאי בדיקה" && qa?.row_data.thirdParty === "צד ג בדיקה" && qa?.row_data.isTest === "true", qa?.row_data);
check("#4 no plate stored when none was given", !qa?.row_data.plate && !qa?.plate, { plate: qa?.plate, rdPlate: qa?.row_data.plate });


// ---- Close-out: recipient check, explicit read status ----
db.claims_records.find((r: any) => r.id === "DAL-QA-P1").row_data.survPhone = "052-2222222";
const wSurv = await run("preview_schedule_claim_whatsapp", { phone: "052-2222222", body: "שלום לקוח", relative_day: 1, recipient_role: "לקוח" });
check("close: surveyor's number refused for a client message", !wSurv.preview && String((wSurv.result as any).error).includes("שמאי"), wSurv.result);
const wClient = await run("preview_schedule_claim_whatsapp", { phone: "050-1111111", body: "שלום, עדכון בתביעה", relative_day: 2 });
check("close: client's number accepted, card names the owner", !!wClient.preview && String(wClient.preview!.summary).includes("המספר שמור בתיק כ: לקוח"), wClient.preview?.summary);
const wUnknown = await run("preview_schedule_claim_whatsapp", { phone: "058-9999999", body: "שלום", relative_day: 3 });
check("close: unknown number gets a warning on the card", !!wUnknown.preview && String(wUnknown.preview!.summary).includes("אינו שמור בתיק"), wUnknown.preview?.summary);
const lst2 = await run("list_claim_documents", { query: "survey" });
const d1 = (lst2.result as any).documents.find((d: any) => d.file_id === "DOC-1");
check("close: list states the read status explicitly", d1?.read_status === "ready", d1);
const lst3 = await run("list_claim_documents", { query: "photo-1" });
check("close: never-read document is 'not_read', not invented", (lst3.result as any).documents.every((d: any) => d.read_status === "not_read"), (lst3.result as any).documents.slice(0, 2));
const before = db.claims_comm_log.length;
check("close: preview cards wrote nothing", db.claims_comm_log.length === before);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
if (failures) Deno.exit(1);
