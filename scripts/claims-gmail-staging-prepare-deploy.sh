#!/usr/bin/env bash
# Prepares the checkout for a claims-gmail-only deploy to Staging (usfeoerkpcafxxlyuldl).
# Usage: scripts/claims-gmail-staging-prepare-deploy.sh <deploy|rollback> [repo_root]
#
# The live claims-gmail was deployed from code that is not in git. This deploy does NOT use the
# branch's supabase/functions/claims-gmail; it ships exactly:
#   deploy   — live v57 + one open task per request (2026-10-14/dedupe/), nothing else;
#   rollback — live v57 as it is (2026-10-13/patched/ = live v56 + scheduler-auth patch).
# _shared/edgeAuth.ts is the live copy in both modes, so no auth/role change ships.
# Only touches files inside the given checkout. Never deploys, never reads secrets.
set -euo pipefail

MODE="${1:-}"
ROOT="${2:-.}"
REPORTS="$ROOT/docs/audit-reports"
FN="$ROOT/supabase/functions"

# Live v57, downloaded from Supabase on 2026-10-14 and identical file by file.
LIVE_FILES=(
  "claims-gmail/index.ts:a6fd86d101036e1ebe6c43d8b01473e1cf3a868cf44ea627c0da746a7ef55f79"
  "claims-gmail/schedulerAuth.ts:20930d33a3bd396a243f66f0c29b4753bd9db1eac96c876f604e83fe55ea32a9"
  "claims-gmail/mailSafety.ts:02599778ee35edbb2a1f8f8badd3de28be50129e8bde11c097c5380cb19935d1"
  "claims-gmail/matchIncoming.ts:04ad512ef15c176c2708046360faaddb433f571bb85c2d0e2c8a3fcc1a4a5b60"
  "_shared/edgeAuth.ts:1205eda5f4013d90502438065267938e50e1781ed54e007acf5c1de6b6f01820"
)
DEDUPE_FILES=(
  "claims-gmail/index.ts:60e897bdf5e3569d929f7a8128912b7089ad80e0de2a012f5cce39699f296a0c"
  "claims-gmail/mailTaskDedupe.ts:acf4a14ce5cbfa24ca72242731569f7df7a09163e6732cd883b2e01be43e69d2"
  "claims-gmail/schedulerAuth.ts:20930d33a3bd396a243f66f0c29b4753bd9db1eac96c876f604e83fe55ea32a9"
  "claims-gmail/mailSafety.ts:02599778ee35edbb2a1f8f8badd3de28be50129e8bde11c097c5380cb19935d1"
  "claims-gmail/matchIncoming.ts:04ad512ef15c176c2708046360faaddb433f571bb85c2d0e2c8a3fcc1a4a5b60"
  "_shared/edgeAuth.ts:1205eda5f4013d90502438065267938e50e1781ed54e007acf5c1de6b6f01820"
)

sha() { tr -d '\r' < "$1" | sha256sum | cut -d' ' -f1; }

verify() {
  local file="$1" want="$2" got
  got="$(sha "$file")"
  if [ "$got" != "$want" ]; then
    echo "SHA256 mismatch for $file: $got (expected $want)" >&2
    exit 1
  fi
}

install_set() {
  local src="$1"; shift
  local entry rel
  for entry in "$@"; do
    rel="${entry%%:*}"
    verify "$src/$rel" "${entry##*:}"
    mkdir -p "$(dirname "$FN/$rel")"
    tr -d '\r' < "$src/$rel" > "$FN/$rel"
    verify "$FN/$rel" "${entry##*:}"
  done
}

case "$MODE" in
  deploy) install_set "$REPORTS/claims-gmail-deploy-prep-2026-10-14/dedupe" "${DEDUPE_FILES[@]}" ;;
  rollback) rm -f "$FN/claims-gmail/mailTaskDedupe.ts"; install_set "$REPORTS/claims-gmail-deploy-prep-2026-10-13/patched" "${LIVE_FILES[@]}" ;;
  *) echo "Usage: $0 <deploy|rollback> [repo_root]" >&2; exit 2 ;;
esac

# The unsigned service-role fallback must stay gone in both modes.
if grep -q "jwtRoleRef(token)" "$FN/claims-gmail/index.ts"; then
  echo "unsigned token fallback present — refusing to deploy" >&2
  exit 1
fi

echo "mode=$MODE"
for f in claims-gmail/index.ts claims-gmail/mailSafety.ts claims-gmail/matchIncoming.ts _shared/edgeAuth.ts; do
  echo "$f sha256=$(sha "$FN/$f")"
done
