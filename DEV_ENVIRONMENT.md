# Dalia Development Environment

A complete, owned-by-you setup for developing the Dalia platform with
Cursor + Claude, against an isolated staging environment, with safe
deployment to production through manual approval.

This document is the entry point. If you're a new developer joining
the project, you only need to read this file to get started.

---

## What this environment is

- **Cursor** is the editor + AI assistant
- **Claude** is the AI model (built into Cursor by default; also
  available as an API for programmatic use)
- **GitHub repository** (`orin1607-ctrl/future-craft-core`) hosts the
  code, with the workflow described in `docs/GIT_WORKFLOW.md`
- **Staging Supabase project** (`dalia-staging`) is what you develop
  against — separate database, separate users, separate files,
  separate everything
- **Production** is never touched by development. Changes only reach
  the live system when Yoni clicks "Update Code" / "Update Database"
  in the live Super Admin panel after a deliberate review.

The full ownership statement is in `OWNERSHIP.md` — everything created
here belongs to Yoni; no developer holds private keys or private
infrastructure.

---

## Quick start (about 10 minutes)

### Prerequisites (one-time)

1. **Install Cursor**: https://cursor.com
2. **Install Bun**: `curl -fsSL https://bun.sh/install | bash`
3. **Install Git**: most systems have it; `git --version` to check
4. Make sure you have access to:
   - GitHub repo `orin1607-ctrl/future-craft-core` (Yoni invites you)
   - Staging Supabase project `usfeoerkpcafxxlyuldl` (Yoni invites you)

### Set up the project

```bash
# 1. Clone
git clone https://github.com/orin1607-ctrl/future-craft-core.git
cd future-craft-core

# 2. Switch to the dev branch
git checkout dev

# 3. Install dependencies
bun install

# 4. Configure environment for staging
cp .env.local.example .env.local
# Open .env.local and paste in the staging VITE_SUPABASE_PUBLISHABLE_KEY
# (Yoni provides this — never commit the file)

# 5. Make the backup script executable
chmod +x scripts/dev-backup.sh

# 6. Run it
bun run dev
# Open http://localhost:8080 in your browser
```

### Log in

You can use any of the test accounts that exist on the staging
environment (same emails as production, since users were copied).
Yoni's super-admin account works. Passwords are the same as
production.

---

## Daily workflow

```
1. git checkout dev && git pull
2. (optional) ./scripts/dev-backup.sh "what you're about to try"
3. Work in Cursor → describe what you want naturally
   ("add a button", "fix this bug", "show me a preview",
    "check nothing broke")
4. bun run dev — see it live in browser / phone
5. Commit small, meaningful units
6. git push origin dev
7. Open a Pull Request to `production` when ready
8. Naeem reviews → merge → Yoni clicks "Update Code"
```

Full details: `docs/GIT_WORKFLOW.md`.

---

## Using Cursor + Claude effectively

Cursor reads the rules in `.cursorrules` automatically — the AI will
follow the project conventions, RTL/Hebrew patterns, RLS security
rules, and the safe-change workflow without you needing to remind it.

Good prompts:

- *"Add a 'last service KM' filter to the vehicles list"*
- *"Why is the customer-attach button greyed out for fleet managers?"*
- *"Show me how `Drivers.tsx` decides which drivers to display"*
- *"Add a migration that adds a `notes` text column to `vehicles`"*

When Claude proposes a change you're unsure about:

- Hit *Reject* — nothing is applied unless you accept
- Or run `./scripts/dev-backup.sh` first, then accept; if it goes
  wrong, `git reset --hard <backup-branch>` returns you to safety

---

## Where everything lives

| What | Where |
|---|---|
| Project rules for the AI | `.cursorrules` |
| Local environment template | `.env.local.example` |
| Backup-before-changes script | `scripts/dev-backup.sh` |
| Git workflow (branches, PRs, deployment) | `docs/GIT_WORKFLOW.md` |
| Mobile preview setup | `docs/MOBILE_PREVIEW.md` |
| Ownership statement | `OWNERSHIP.md` |
| Pages (top-level routes) | `src/pages/` |
| Reusable components | `src/components/` |
| Supabase client + types | `src/integrations/supabase/` |
| Database schema (migrations) | `supabase/migrations/` |
| Backend functions | `supabase/functions/` |

---

## Mobile testing

Phone on the same Wi-Fi → visit `http://<your-computer-ip>:8080`.
See `docs/MOBILE_PREVIEW.md` for the exact commands per OS and how
to troubleshoot.

---

## Useful commands

```bash
bun run dev                          # start dev server (port 8080)
bun run build                        # production build (test it works)
bun run lint                         # lint the codebase
bun x tsc --noEmit                   # type-check without building
./scripts/dev-backup.sh "<reason>"   # snapshot before big changes

# Supabase (after `supabase link --project-ref usfeoerkpcafxxlyuldl`):
bun x supabase migration list --linked
bun x supabase db push --linked --include-all
bun x supabase functions deploy <name>   # rare — usually via GitHub
```

---

## Deploying to production

You don't deploy from Cursor. Ever. Production deployment is:

1. Your PR is reviewed and merged into the `production` branch
2. Yoni opens the live system at `dalia-car.online`, logs in as
   super admin, opens "Update Code", reviews the pending changes,
   and clicks the button
3. If migrations are included, Yoni also clicks "Update Database"

This is by design and is the safety guarantee of the whole system.

---

## Getting help

- For workflow / git issues: read `docs/GIT_WORKFLOW.md`
- For mobile preview issues: read `docs/MOBILE_PREVIEW.md`
- For anything else, ask in your usual channel with Naeem.
