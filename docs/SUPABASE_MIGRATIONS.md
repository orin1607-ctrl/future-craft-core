# Running Supabase Migrations (Staging only)

This document is the permanent, secure workflow for any developer who
needs to apply a database migration. It targets **staging only** —
production is protected by a separate mechanism (Yoni's "Update
Database" button on the live system) and is never reachable from a
developer's machine.

## TL;DR

A new developer runs three one-time commands. After that, every
migration is a single command.

## What you need (once)

- A Supabase account that has been added as a member of the
  `dalia-staging` project (Yoni invites you)
- About 5 minutes

---

## One-time setup (per developer)

### 1. Generate your personal access token

- Open: https://supabase.com/dashboard/account/tokens
- Click **Generate new token**, name it (e.g. `cursor-dev`)
- Copy the token — it starts with `sbp_...`

This token is **personal**. It is not shared between developers, it is
not committed to the repository, it never lives in `.env` files.

### 2. Sign the Supabase CLI in

```bash
supabase login
# paste the token when prompted
```

The CLI stores it in your operating system's secure keyring (not in any
file inside this project). No further configuration is needed for
authentication.

### 3. Link the local repository to the staging project

From the project root:

```bash
supabase link --project-ref usfeoerkpcafxxlyuldl
```

- When prompted for the **database password**, get it from:
  https://supabase.com/dashboard/project/usfeoerkpcafxxlyuldl/settings/database
  (you can reset it on that page if forgotten — it does not affect
  anything else)
- This creates `supabase/.temp/project-ref` locally, containing
  `usfeoerkpcafxxlyuldl`
- The `supabase/.temp/` folder is gitignored — it is never committed

### 4. Verify you are linked to STAGING (not production)

```bash
./scripts/db-push-staging.sh --check
```

Expected output:

```
OK: linked to staging (usfeoerkpcafxxlyuldl)
```

If it says anything else, do **not** run migrations until it is fixed.

---

## Applying a migration (every time)

From the project root, on the `dev` branch:

```bash
git pull
./scripts/db-push-staging.sh
```

The script:

1. Checks the linked project is `dalia-staging` and refuses to run if
   it is not
2. Lists pending migrations
3. Applies them to the staging database

**That is the entire workflow.** No password prompts (cached by the CLI
during `supabase link`), no per-migration setup.

---

## Where every credential lives

| Credential | Where it lives | Who can see it |
|---|---|---|
| Your personal access token | Your operating system's keyring (managed by the Supabase CLI) | Only you |
| Staging DB password | Supabase Dashboard → Settings → Database | Project members only |
| `supabase/.temp/project-ref` (the linked project ref) | Your local machine, gitignored | Only your machine |

Nothing is committed to git. Nothing lives in `.env` files. Nothing is
shared between developers as a fixed value.

---

## Security guarantees

- **Personal access tokens** — one per developer, revocable individually
  at any time from the Supabase dashboard
- **Database password** — entered only once during `supabase link`,
  cached by the CLI locally, never typed again
- **Production is unreachable from this workflow**
  - The `supabase link` command in this project always targets the
    staging ref by design
  - `scripts/db-push-staging.sh` refuses to run if the link points
    anywhere else (including production)
  - Production has a separate, unknown-to-developers DB password and
    a different deployment path (Yoni's "Update Database" button)

---

## Onboarding a future developer

1. Yoni invites them as a member of the staging Supabase project
2. They follow the four steps in the "One-time setup" section above
3. They are productive — migrations work, the safety script protects
   against accidental production targeting

That is the complete process. No additional configuration files need
to be shared and no credentials need to be exchanged outside the
Supabase dashboard.
