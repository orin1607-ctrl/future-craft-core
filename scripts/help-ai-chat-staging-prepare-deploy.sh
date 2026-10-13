#!/usr/bin/env bash
# Prepares the checkout for a help-ai-chat-only deploy to Staging (usfeoerkpcafxxlyuldl).
# Usage: scripts/help-ai-chat-staging-prepare-deploy.sh <deploy|rollback> [repo_root]
#
# deploy   — help-ai-chat from this commit. Stops if _shared/edgeAuth.ts differs from the live copy,
#            so no auth/role change can ship with the chat.
# rollback — help-ai-chat as live before (v146 = commit 6c974759), with all its shared files.
#
# Only touches files inside the given checkout. Never deploys, never reads secrets.
set -euo pipefail

MODE="${1:-}"
ROOT="${2:-.}"
BACKUP="$ROOT/docs/audit-reports/help-ai-chat-deploy-prep-2026-10-12/live-v146"
FN="$ROOT/supabase/functions"

# Fingerprints of the live v146 files (downloaded from Supabase, identical to commit 6c974759).
FILES=(
  "help-ai-chat/index.ts:1b6dbfe144f04ff4269d7e7830114f5c83e9a31b6cee0888c7db7317c0680d36"
  "help-ai-chat/claimsTools.ts:738e7d64e339b07a0e3a72440cc6ad7b9cfb2e5772dc645b04c862887bdaf906"
  "_shared/edgeAuth.ts:53f5ab072fababe33fe466e62ef3486e583ad8f9f17be1b2167d3420af589134"
  "_shared/claimDocumentLabel.ts:87008cab2b5f572d921ce62ee06401eef4782e70e7d6a51c2dcbbfe32da87be1"
  "_shared/claimFieldEdit.ts:bcef271714ed044d7a3d9cee119ad98bb59ffd22f0938c40c79a286443cb81d2"
  "_shared/claimChatRecords.ts:639ebcd6a8c0dc47a33dfb71b897c862fd32eb18496ad8ee2585d003e953f90d"
  "_shared/claimWhatsAppCore.ts:56f8150186f6afa889e6733a6e44350621ea46bf671cd0317fc37a9442d01b72"
)
LIVE_EDGEAUTH_SHA256="53f5ab072fababe33fe466e62ef3486e583ad8f9f17be1b2167d3420af589134"

sha() { tr -d '\r' < "$1" | sha256sum | cut -d' ' -f1; }

verify() {
  local file="$1" want="$2" got
  got="$(sha "$file")"
  if [ "$got" != "$want" ]; then
    echo "SHA256 mismatch for $file: $got (expected $want)" >&2
    exit 1
  fi
}

case "$MODE" in
  deploy|rollback) ;;
  *) echo "Usage: $0 <deploy|rollback> [repo_root]" >&2; exit 2 ;;
esac

for entry in "${FILES[@]}"; do
  verify "$BACKUP/${entry%%:*}" "${entry##*:}"
done

# Same auth code as live in both modes.
verify "$FN/_shared/edgeAuth.ts" "$LIVE_EDGEAUTH_SHA256"

if [ "$MODE" = "rollback" ]; then
  for entry in "${FILES[@]}"; do
    rel="${entry%%:*}"
    mkdir -p "$(dirname "$FN/$rel")"
    tr -d '\r' < "$BACKUP/$rel" > "$FN/$rel"
    verify "$FN/$rel" "${entry##*:}"
  done
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
