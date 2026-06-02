#!/bin/bash
# db-push-staging.sh — apply pending migrations to dalia-staging only.
#
# Refuses to run if the local repo is linked to anything other than
# dalia-staging (usfeoerkpcafxxlyuldl). This is a guard rail; production
# (qasomfndnjuixgjmjwcm) has its own separate password and deployment
# path, and is never reachable from a developer machine through this
# workflow.
#
# Usage:
#   ./scripts/db-push-staging.sh           # apply pending migrations
#   ./scripts/db-push-staging.sh --check   # only verify the link

set -euo pipefail

STAGING_REF="usfeoerkpcafxxlyuldl"
PROD_REF="qasomfndnjuixgjmjwcm"
LINK_FILE="supabase/.temp/project-ref"

# --- preflight: must be linked ---
if [ ! -f "$LINK_FILE" ]; then
  echo "ERROR: project is not linked to any Supabase project yet."
  echo
  echo "Run once on this machine:"
  echo "  supabase login"
  echo "  supabase link --project-ref $STAGING_REF"
  echo
  echo "Then re-run this script."
  exit 1
fi

LINKED="$(tr -d '[:space:]' < "$LINK_FILE")"

# --- the production guardrail ---
if [ "$LINKED" = "$PROD_REF" ]; then
  echo "FATAL: this folder is linked to PRODUCTION ($PROD_REF)."
  echo "Refusing to apply migrations from a developer machine against production."
  echo
  echo "Production migrations are applied separately, only through Yoni's"
  echo "'Update Database' button on the live system."
  echo
  echo "Re-link to staging:"
  echo "  supabase link --project-ref $STAGING_REF"
  exit 1
fi

if [ "$LINKED" != "$STAGING_REF" ]; then
  echo "ERROR: linked project ($LINKED) is not staging."
  echo "Expected: $STAGING_REF (dalia-staging)"
  echo
  echo "Re-link:"
  echo "  supabase link --project-ref $STAGING_REF"
  exit 1
fi

# --- check-only mode ---
if [ "${1:-}" = "--check" ]; then
  echo "OK: linked to staging ($STAGING_REF)"
  exit 0
fi

# --- apply migrations ---
echo "Linked project verified: staging ($STAGING_REF)."
echo
echo "Listing pending migrations..."
bun x supabase migration list --linked || true
echo
echo "Applying pending migrations to dalia-staging..."
bun x supabase db push --linked --include-all
echo
echo "Done."
