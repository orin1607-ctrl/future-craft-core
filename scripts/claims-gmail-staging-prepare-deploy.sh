#!/usr/bin/env bash
# Prepares the checkout for a claims-gmail-only deploy to Staging (usfeoerkpcafxxlyuldl).
# Usage: scripts/claims-gmail-staging-prepare-deploy.sh <deploy|rollback> [repo_root]
#
# The live claims-gmail (v56) was deployed from code that is not in git. This deploy does NOT use the
# branch's supabase/functions/claims-gmail; it ships exactly:
#   deploy   — live v56 + the scheduler-auth security patch (patched/), nothing else;
#   rollback — live v56 as it was (live-v56/).
# _shared/edgeAuth.ts is the live copy in both modes, so no auth/role change ships.
# Only touches files inside the given checkout. Never deploys, never reads secrets.
set -euo pipefail

MODE="${1:-}"
ROOT="${2:-.}"
PREP="$ROOT/docs/audit-reports/claims-gmail-deploy-prep-2026-10-13"
FN="$ROOT/supabase/functions"

LIVE_FILES=(
  "claims-gmail/index.ts:990ccb38300a6592d47fe5d3e6e1844f0898ad26fe7e33b0abd345ed1ae77e08"
  "claims-gmail/mailSafety.ts:02599778ee35edbb2a1f8f8badd3de28be50129e8bde11c097c5380cb19935d1"
  "claims-gmail/matchIncoming.ts:04ad512ef15c176c2708046360faaddb433f571bb85c2d0e2c8a3fcc1a4a5b60"
  "_shared/edgeAuth.ts:1205eda5f4013d90502438065267938e50e1781ed54e007acf5c1de6b6f01820"
)
PATCHED_FILES=(
  "claims-gmail/index.ts:a6fd86d101036e1e"
  "claims-gmail/schedulerAuth.ts:20930d33a3bd396a"
  "claims-gmail/mailSafety.ts:02599778ee35edbb2a1f8f8badd3de28be50129e8bde11c097c5380cb19935d1"
  "claims-gmail/matchIncoming.ts:04ad512ef15c176c2708046360faaddb433f571bb85c2d0e2c8a3fcc1a4a5b60"
  "_shared/edgeAuth.ts:1205eda5f4013d90502438065267938e50e1781ed54e007acf5c1de6b6f01820"
)

sha() { tr -d '\r' < "$1" | sha256sum | cut -d' ' -f1; }

# Accepts a full hash or a 16-char prefix.
verify() {
  local file="$1" want="$2" got
  got="$(sha "$file")"
  if [ "${got:0:${#want}}" != "$want" ]; then
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
  deploy) install_set "$PREP/patched" "${PATCHED_FILES[@]}" ;;
  rollback) rm -f "$FN/claims-gmail/schedulerAuth.ts"; install_set "$PREP/live-v56" "${LIVE_FILES[@]}" ;;
  *) echo "Usage: $0 <deploy|rollback> [repo_root]" >&2; exit 2 ;;
esac

# The unsigned service-role fallback must be gone in deploy mode.
if [ "$MODE" = "deploy" ] && grep -q "jwtRoleRef(token)" "$FN/claims-gmail/index.ts"; then
  echo "unsigned token fallback still present — refusing to deploy" >&2
  exit 1
fi

echo "mode=$MODE"
for f in claims-gmail/index.ts claims-gmail/mailSafety.ts claims-gmail/matchIncoming.ts _shared/edgeAuth.ts; do
  echo "$f sha256=$(sha "$FN/$f")"
done
