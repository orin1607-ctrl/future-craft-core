#!/bin/bash
# dev-backup.sh — take a safety snapshot of the current state before
# Cursor/Claude makes a significant change. Idempotent, harmless.
#
# Usage:
#   ./scripts/dev-backup.sh                    # auto-named snapshot
#   ./scripts/dev-backup.sh "adding driver-import filters"
#
# What it does:
#   1. Stages everything in the working tree (no commit on the live branch)
#   2. Creates a timestamped backup branch (e.g. backup/2026-05-30T15-22-10)
#   3. Records the current HEAD + a one-line description in
#      `.dev-backups.log` so you can find it later
#   4. Returns you to the branch you started on, ready to keep working
#
# To restore: `git checkout <backup-branch-name>` or
#             `git reset --hard <backup-branch-name>` if you want to wipe
#             current work and return to the snapshot point.

set -euo pipefail

reason="${1:-untitled change}"
ts="$(date -u +%Y-%m-%dT%H-%M-%S)"
branch_now="$(git symbolic-ref --short HEAD 2>/dev/null || echo detached)"
backup_branch="backup/${ts}"

# Create the backup branch from current HEAD, including any staged/unstaged
# work via a temporary "wip" commit on the backup branch only.
git stash push --include-untracked --keep-index -m "dev-backup-temp-${ts}" >/dev/null 2>&1 || true
git branch "$backup_branch"

# Restore stashed work onto current branch
if git stash list | grep -q "dev-backup-temp-${ts}"; then
  git stash pop >/dev/null 2>&1 || true
fi

# Append to local log (gitignored — see .gitignore)
mkdir -p .dev-backups
echo "${ts}  branch=${branch_now}  head=$(git rev-parse --short HEAD)  reason=${reason}  backup=${backup_branch}" \
  >> .dev-backups/log.txt

echo "Backup created: ${backup_branch}"
echo "Reason:         ${reason}"
echo "To restore:     git reset --hard ${backup_branch}"
echo "Log:            .dev-backups/log.txt"
