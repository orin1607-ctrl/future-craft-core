import { readFileSync } from 'fs';
import { updateDraftStatus } from './_lib/history.mjs';

const args = process.argv.slice(2);
function get(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

const draftId = get('--id');
const status = get('--status');
const note = get('--note') || '';

if (!draftId || !status) {
  console.error('Usage: --id <draftId> --status approved|rejected|pending_approval [--note text]');
  process.exit(1);
}

const draft = updateDraftStatus(draftId, status, note);
console.log(JSON.stringify({ ok: Boolean(draft), draft, published: false }));
