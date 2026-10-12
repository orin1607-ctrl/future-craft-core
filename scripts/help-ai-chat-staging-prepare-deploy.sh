#!/usr/bin/env bash
# Prepares the checkout for a help-ai-chat-only deploy to Staging (usfeoerkpcafxxlyuldl).
# Usage: scripts/help-ai-chat-staging-prepare-deploy.sh <deploy|rollback> [repo_root]
#
# deploy   — help-ai-chat from this commit. Stops if _shared/edgeAuth.ts differs from the live copy,
#            so no auth/role change can ship with the chat.
# rollback — help-ai-chat as live before (v144 = commit 9fc2f73b), with its shared files.
#
# Only touches files inside the given checkout. Never deploys, never reads secrets.
set -euo pipefail

MODE="${1:-}"
ROOT="${2:-.}"
BACKUP="$ROOT/docs/audit-reports/help-ai-chat-deploy-prep-2026-10-12/live-v144"
FN="$ROOT/supabase/functions"

LIVE_INDEX_SHA256="caf351d07e87ddf948e962ff10eb66a83bf01d81471b70dc06545b0396e598b4"
LIVE_TOOLS_SHA256="b44e2733b39d2f92514267ea39633b2450a3a6f152d4de1671043fd691020a19"
LIVE_EDGEAUTH_SHA256="53f5ab072fababe33fe466e62ef3486e583ad8f9f17be1b2167d3420af589134"
LIVE_LABEL_SHA256="87008cab2b5f572d921ce62ee06401eef4782e70e7d6a51c2dcbbfe32da87be1"
LIVE_FIELDEDIT_SHA256="bcef271714ed044d7a3d9cee119ad98bb59ffd22f0938c40c79a286443cb81d2"

sha() { tr -d '\r' < "$1" | sha256sum | cut -d' ' -f1; }

verify() {
  local file="$1" want="$2" got
  got="$(sha "$file")"
  if [ "$got" != "$want" ]; then
    echo "SHA256 mismatch for $file: $got (expected $want)" >&2
    exit 1
  fi
}

restore() {
  local rel="$1" want="$2"
  tr -d '\r' < "$BACKUP/$rel" > "$FN/$rel"
  verify "$FN/$rel" "$want"
}

case "$MODE" in
  deploy|rollback) ;;
  *) echo "Usage: $0 <deploy|rollback> [repo_root]" >&2; exit 2 ;;
esac

verify "$BACKUP/help-ai-chat/index.ts" "$LIVE_INDEX_SHA256"
verify "$BACKUP/help-ai-chat/claimsTools.ts" "$LIVE_TOOLS_SHA256"
verify "$BACKUP/_shared/edgeAuth.ts" "$LIVE_EDGEAUTH_SHA256"
verify "$BACKUP/_shared/claimDocumentLabel.ts" "$LIVE_LABEL_SHA256"
verify "$BACKUP/_shared/claimFieldEdit.ts" "$LIVE_FIELDEDIT_SHA256"

# Same auth code as live in both modes.
verify "$FN/_shared/edgeAuth.ts" "$LIVE_EDGEAUTH_SHA256"

if [ "$MODE" = "rollback" ]; then
  restore help-ai-chat/index.ts "$LIVE_INDEX_SHA256"
  restore help-ai-chat/claimsTools.ts "$LIVE_TOOLS_SHA256"
  restore _shared/claimDocumentLabel.ts "$LIVE_LABEL_SHA256"
  restore _shared/claimFieldEdit.ts "$LIVE_FIELDEDIT_SHA256"
fi

# Document content must stay away from the model unless the owner approved it.
if [ "$MODE" = "deploy" ] && ! grep -q "export const CLAIMS_CHAT_DOC_TEXT_TO_MODEL = false;" "$FN/help-ai-chat/claimsTools.ts"; then
  echo "CLAIMS_CHAT_DOC_TEXT_TO_MODEL is not false — refusing to deploy without approval" >&2
  exit 1
fi

echo "mode=$MODE"
echo "help-ai-chat/index.ts sha256=$(sha "$FN/help-ai-chat/index.ts")"
echo "help-ai-chat/claimsTools.ts sha256=$(sha "$FN/help-ai-chat/claimsTools.ts")"
echo "_shared/edgeAuth.ts sha256=$(sha "$FN/_shared/edgeAuth.ts") (same as live)"
