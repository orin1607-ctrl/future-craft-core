/**
 * One open task per request, not one per email.
 *
 * A named document (driver license, surveyor report, invoice…) is one request per claim: while a
 * task for it is open, another email asking for it does not open another task.
 * Any other request (generic "complete documents", sign & return, info, reply…) is one request per
 * email thread: a follow-up in the same thread is the same request; a new thread can be a new one.
 * Without a thread id, each email stands alone (the old behaviour).
 *
 * The task id is derived from the claim, the request scope and how many tasks that scope already
 * had, so two scans running at once compute the same id and the second insert hits the primary key
 * instead of creating a twin.
 */

export const PER_CLAIM_REQUEST_TYPES = new Set([
  "no_claim_form",
  "driver_license",
  "vehicle_license",
  "accident_notice",
  "policy",
  "police",
  "surveyor_report",
  "garage_invoice",
  "damage_photos",
]);

type Row = Record<string, unknown>;
export type TaskRow = { id: string; row_data: unknown };

function rowOf(t: TaskRow): Row {
  return t.row_data && typeof t.row_data === "object" ? t.row_data as Row : {};
}

function str(v: unknown) {
  return String(v ?? "").trim();
}

/** A task still waiting for work: not done, not cancelled. */
export function isOpenTask(rd: Row) {
  return str(rd.done) !== "true"
    && str(rd.cancelled) !== "true"
    && !["done", "cancelled"].includes(str(rd.workStatus));
}

/** The request a task (or a new email request) stands for. Empty when it has no request type. */
export function mailTaskScope(type: string, threadId: string, messageId: string) {
  const t = str(type);
  if (!t) return "";
  if (PER_CLAIM_REQUEST_TYPES.has(t)) return `claim:${t}`;
  if (str(threadId)) return `thread:${str(threadId)}:${t}`;
  return `message:${str(messageId)}:${t}`;
}

function scopeOfTask(t: TaskRow) {
  const rd = rowOf(t);
  return mailTaskScope(str(rd.requestType), str(rd.gmailThreadId), str(rd.gmailMessageId));
}

/** The task this email already made for this request (re-import or re-run of the scan). */
export function findSameMailTask(tasks: TaskRow[], mailIdem: string) {
  return tasks.find((t) => str(rowOf(t).mailIdem) === mailIdem) || null;
}

/** An open task, from any email or made by staff, for the same request. */
export function findOpenTaskInScope(tasks: TaskRow[], scope: string) {
  if (!scope) return null;
  return tasks.find((t) => scopeOfTask(t) === scope && isOpenTask(rowOf(t))) || null;
}

export function countTasksInScope(tasks: TaskRow[], scope: string) {
  return scope ? tasks.filter((t) => scopeOfTask(t) === scope).length : 0;
}

export async function mailTaskId(claimId: string, scope: string, n: number) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${claimId}|${scope}|${n}`));
  const hex = Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `TSK-MAIL-${hex.slice(0, 20).toUpperCase()}`;
}

type DbError = { code?: string; message?: string } | null;
export type TasksDb = {
  listTasks(claimId: string): Promise<TaskRow[]>;
  insertTask(id: string, claimId: string, row: Row): Promise<{ error: DbError }>;
};

export type MailTaskOutcome =
  | { status: "created"; id: string }
  | { status: "same_mail"; id: string }
  | { status: "open_exists"; id: string }
  | { status: "failed"; error: string };

/**
 * Creates the task for one request of one email, unless the same request is already open.
 * buildRow gets the final id and returns the row_data to save.
 */
export async function insertMailTaskOnce(
  db: TasksDb,
  opts: { claimId: string; type: string; threadId: string; messageId: string; mailIdem: string },
  buildRow: (id: string) => Row,
): Promise<MailTaskOutcome> {
  const scope = mailTaskScope(opts.type, opts.threadId, opts.messageId);
  for (let attempt = 0; attempt < 4; attempt++) {
    const tasks = await db.listTasks(opts.claimId);
    const same = findSameMailTask(tasks, opts.mailIdem);
    if (same) return { status: "same_mail", id: same.id };
    const open = findOpenTaskInScope(tasks, scope);
    if (open) return { status: "open_exists", id: open.id };
    const id = await mailTaskId(opts.claimId, scope || `idem:${opts.mailIdem}`, countTasksInScope(tasks, scope) + attempt);
    const { error } = await db.insertTask(id, opts.claimId, buildRow(id));
    if (!error) return { status: "created", id };
    // 23505: another scan saved this id first. Look again: it is usually the twin we wanted to avoid.
    if (error.code !== "23505") return { status: "failed", error: error.message || "insert_failed" };
  }
  return { status: "failed", error: "id_conflict" };
}
