/**
 * Which tools actually ran in one chat answer, and how each ended — shown under the answer so the user
 * can see what was checked. Names and outcomes only; never arguments or results (no personal data).
 */

export type ToolOutcome = 'ok' | 'not_found' | 'failed' | 'pending_approval';
export type ToolTrace = { tool: string; outcome: ToolOutcome };

const FAILED_STATUSES = new Set(['invalid', 'duplicate', 'error', 'failed']);
const NOT_FOUND_STATUSES = new Set(['not_found', 'no_change']);

export function toolOutcome(result: unknown, hasPreview: boolean): ToolOutcome {
  if (hasPreview) return 'pending_approval';
  if (!result || typeof result !== 'object' || Array.isArray(result)) return 'ok';
  const r = result as Record<string, unknown>;
  const status = String(r.status || '');
  if (r.found === false || NOT_FOUND_STATUSES.has(status) || r.not_found) return 'not_found';
  if (r.error || FAILED_STATUSES.has(status) || r.success === false) return 'failed';
  return 'ok';
}

const RANK: Record<ToolOutcome, number> = { ok: 0, pending_approval: 1, not_found: 2, failed: 3 };

/** One entry per tool; when a tool ran more than once the worst outcome is kept. Max 20 entries. */
export function addTrace(list: ToolTrace[], tool: string, outcome: ToolOutcome) {
  const name = String(tool || '').slice(0, 64);
  if (!name) return list;
  const hit = list.find((t) => t.tool === name);
  if (hit) {
    if (RANK[outcome] > RANK[hit.outcome]) hit.outcome = outcome;
  } else if (list.length < 20) {
    list.push({ tool: name, outcome });
  }
  return list;
}
