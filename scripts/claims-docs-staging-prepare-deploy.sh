#!/usr/bin/env bash
# Prepares the checkout for a claims-docs-only deploy to Staging (usfeoerkpcafxxlyuldl).
# Usage: scripts/claims-docs-staging-prepare-deploy.sh <deploy|rollback> [repo_root]
#
# deploy   — claims-docs from this commit, with the live (31a0db02) edgeAuth.ts pinned,
#            so no auth/role change ships with the document-read fix.
# rollback — claims-docs and edgeAuth.ts exactly as live before (commit 31a0db02).
#
# Only touches files inside the given checkout. Never deploys, never reads secrets.
set -euo pipefail

MODE="${1:-}"
ROOT="${2:-.}"
BACKUP="$ROOT/docs/audit-reports/claims-doc-read-deploy-prep-2026-10-11/live-31a0db02-clean"
FN="$ROOT/supabase/functions"

LIVE_INDEX_SHA256="fe3f1963df319ceaa52d8fb61e1580657b22ca420d74c67c9deef19171ca1f0f"
LIVE_EDGEAUTH_SHA256="1205eda5f4013d90502438065267938e50e1781ed54e007acf5c1de6b6f01820"

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

verify "$BACKUP/_shared/edgeAuth.ts" "$LIVE_EDGEAUTH_SHA256"
verify "$BACKUP/claims-docs/index.ts" "$LIVE_INDEX_SHA256"

tr -d '\r' < "$BACKUP/_shared/edgeAuth.ts" > "$FN/_shared/edgeAuth.ts"
verify "$FN/_shared/edgeAuth.ts" "$LIVE_EDGEAUTH_SHA256"

if [ "$MODE" = "rollback" ]; then
  tr -d '\r' < "$BACKUP/claims-docs/index.ts" > "$FN/claims-docs/index.ts"
  verify "$FN/claims-docs/index.ts" "$LIVE_INDEX_SHA256"
fi

echo "mode=$MODE"
echo "claims-docs/index.ts sha256=$(sha "$FN/claims-docs/index.ts")"
echo "_shared/edgeAuth.ts sha256=$(sha "$FN/_shared/edgeAuth.ts") (pinned live)"
